// Backend route LOGIC, shared by the local Express sidecar (server/index.ts)
// and the Vercel Serverless Functions (api/*.ts). Each core function takes the
// already-parsed JSON request body and returns the JSON-serializable response
// object. Behavior is identical across both environments — only the transport
// wrapper differs. Every route responds HTTP 200; failures come back as an
// { error, raw } object in the body (unchanged from the original sidecar).

import catalogJson from "../../src/lib/labor/catalog.json";

import { callClaude, MODEL } from "./anthropic.js";
import {
  BOM_SHAPE,
  BOM_SYSTEM,
  CENTENE_EXEMPLAR,
  DEPENDENCY_SYSTEM,
  MAP_LABOR_SHAPE,
  MAP_LABOR_SYSTEM,
  pasteRoomDirective,
  REMOVALS_SHAPE,
  REMOVALS_SYSTEM,
  ROM_SYSTEM,
  SOW_SYSTEM,
  STYLE_ANALYSIS_SYSTEM,
  STYLE_MATCH_DIRECTIVE,
} from "./prompts.js";
import {
  BomSchema,
  cleanRom,
  cleanSow,
  DependencyArraySchema,
  LaborMapSchema,
  RemovalsArraySchema,
  RomDocSchema,
  SowDocSchema,
  StyleAnalysisSchema,
} from "./schemas.js";
import {
  buildContent,
  coerceArray,
  coerceRemovalsArray,
  type ContentBlock,
  docxBufferToText,
  errorMessage,
  extractDocxTheme,
  extractJsonText,
  imageMediaType,
  maybeExtractPdfText,
  parseModelJson,
  type RemovalsDrawing,
  removalsGuide,
  responseText,
} from "./helpers.js";

type Body = Record<string, unknown>;

// SOW.13 — render the optional site notes into a labeled guidance block for the
// user message. Returns "" when nothing usable is present (so the prompt is
// unchanged when no notes are given). The system prompt's CONTEXT_RULE governs
// how the model must treat this block (guidance only — never changes scope).
type CtxRoomNote = { room?: unknown; note?: unknown };
function contextBlock(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const c = raw as { projectContext?: unknown; roomNotes?: unknown };
  const proj = typeof c.projectContext === "string" ? c.projectContext.trim() : "";
  const notes = Array.isArray(c.roomNotes)
    ? (c.roomNotes as CtxRoomNote[])
        .map((n) => ({
          room: typeof n?.room === "string" ? n.room.trim() : "",
          note: typeof n?.note === "string" ? n.note.trim() : "",
        }))
        .filter((n) => n.note.length > 0)
    : [];
  if (!proj && notes.length === 0) return "";

  let s =
    "\n\nPROJECT CONTEXT / SITE NOTES — interpretive guidance ONLY. Use it to " +
    "describe relationships and design intent for equipment ALREADY in the BOM; " +
    "do NOT add, remove, rename, or invent any equipment or scope:";
  if (proj) s += `\n\nProject context:\n${proj}`;
  if (notes.length) {
    s += "\n\nPer-room notes (apply each to that room's section):";
    for (const n of notes) s += `\n- ${n.room || "(unnamed location)"}: ${n.note}`;
  }
  return s;
}

// Parse an uploaded BOM into a Location -> System -> line-item tree.
export async function extractBomCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const b = await maybeExtractPdfText((body ?? {}) as Body);
    const content = buildContent(b, BOM_SHAPE);
    // Integrator name (from Settings) — tell the model this party PREPARED the
    // BOM so it is never returned as the customer.
    const integrator = typeof b.company === "string" ? b.company.trim() : "";
    if (integrator) {
      content.push({
        type: "text",
        text:
          `\n\nINTEGRATOR / PREPARER (NOT the customer): "${integrator}". This is the ` +
          `AV company preparing this BOM. NEVER output "${integrator}" (or a close ` +
          `variant) as 'customer'. If the only prominent company/logo on the sheet is ` +
          `"${integrator}", set customer to null unless a DIFFERENT end-client name is ` +
          `clearly labeled (e.g. 'Customer:', 'Sold To:', 'Ship To:', 'Prepared for:').`,
      });
    }
    // Manual per-room paste lane: when a roomName is present, force a single
    // named location and classify items into the canonical system set. Gated on
    // roomName so a dropped file (no roomName) is never reclassified.
    const roomName = typeof b.roomName === "string" ? b.roomName.trim() : "";
    if (roomName) {
      content.push({ type: "text", text: pasteRoomDirective(roomName) });
    }
    const msg = await callClaude({
      model: MODEL,
      system: BOM_SYSTEM,
      messages: [{ role: "user", content }],
    });
    raw = responseText(msg);
    const json = await parseModelJson(msg, raw, "object");
    return BomSchema.parse(json);
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}

// LT.3 — map a BomDoc's line items onto the labor catalog. The catalog lives
// in src/lib/labor/catalog.json (same file the client engine imports), so the
// index the model sees always matches what the UI applies quantities against.
type LaborCatalogEntry = {
  section: string;
  id: string;
  name: string;
  unitHrs: number;
  catalogGroup: "av" | "broadcast";
  note?: string;
};
const LABOR_CATALOG = catalogJson.items as LaborCatalogEntry[];

type MapBomItem = { qty?: number; manufacturer?: string; model?: string; description?: string; ofe?: boolean };
type MapBomLocation = { name?: string; systems?: { name?: string; items?: MapBomItem[] }[] };

export async function mapLaborCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const b = body ?? {};
    const group = b.catalogGroup === "broadcast" || b.catalogGroup === "all" ? b.catalogGroup : "av";
    const bom = (b.bom ?? {}) as { locations?: MapBomLocation[] };
    const locations = Array.isArray(bom.locations) ? bom.locations : [];

    const catalog =
      group === "all" ? LABOR_CATALOG : LABOR_CATALOG.filter((c) => c.catalogGroup === group);
    if (locations.length === 0) return { mappings: [], sitePrepDaysSuggested: 0 };

    // Compact catalog index — id | section | name | unitHrs, one line each
    // (no notes; the note text is UI guidance, not mapping signal).
    const catalogIndex = catalog
      .map((c) => `${c.id} | ${c.section} | ${c.name} | ${c.unitHrs}`)
      .join("\n");

    // Flatten the BOM to one line per item, grouped under location headers.
    // The system name rides along as context (e.g. mounts under "Display").
    const bomLines = locations
      .map((loc) => {
        const items = (loc.systems ?? []).flatMap((sys) =>
          (sys.items ?? []).map(
            (it) =>
              `qty ${it.qty ?? 1} | ${it.manufacturer ?? ""} | ${it.model ?? ""} | ` +
              `${it.description ?? ""}${it.ofe ? " | OFE/existing" : ""} [system: ${sys.name ?? ""}]`,
          ),
        );
        return `LOCATION "${loc.name ?? ""}":\n${items.join("\n")}`;
      })
      .join("\n\n");

    const user =
      MAP_LABOR_SHAPE +
      "\n\nLABOR CATALOG (id | section | name | unit hours):\n" +
      catalogIndex +
      "\n\nBOM LINE ITEMS (qty | manufacturer | model | description):\n" +
      bomLines +
      "\n\nReturn ONLY the mappings JSON.";

    const msg = await callClaude({
      model: MODEL,
      maxTokens: 16000,
      system: MAP_LABOR_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    raw = responseText(msg);
    const json = await parseModelJson(msg, raw, "object");
    const { mappings } = LaborMapSchema.parse(json);

    // Guard against hallucinated ids: an unknown catalogId becomes unmapped
    // (the review tray) rather than silently writing to nothing client-side.
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const cleaned = mappings.map((m) => {
      if (m.catalogId === null || byId.has(m.catalogId)) return m;
      return { ...m, catalogId: null, reason: `${m.reason} (unknown catalog id ${m.catalogId})`.trim() };
    });

    // Site Prep suggestion (user decision: NEVER auto-added). qty-1-per-on-site-
    // day per the catalog note, so suggest ceil(total mapped hours / 8).
    const totalHrs = cleaned.reduce(
      (s, m) => s + (m.catalogId ? (byId.get(m.catalogId)?.unitHrs ?? 0) * m.qty : 0),
      0,
    );
    const sitePrepDaysSuggested = Math.ceil(totalHrs / 8) || 0;

    return {
      mappings: cleaned,
      sitePrepDaysSuggested,
      // Model-call telemetry for the client/report — never used in the math.
      usage: { inputTokens: msg.usage?.input_tokens, outputTokens: msg.usage?.output_tokens, model: msg.model },
    };
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}

// Extract the removals list from the user's direction + optional as-built drawings.
export async function extractRemovalsCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const b = body ?? {};
    const description = b.description as string | undefined;
    const items = b.items as string[] | undefined;
    const drawings: RemovalsDrawing[] = Array.isArray(b.drawings) ? (b.drawings as RemovalsDrawing[]) : [];

    // No drawings AND no direction -> nothing to do; skip the model call.
    const hasDirection = (description && description.trim()) || (items && items.length > 0);
    if (drawings.length === 0 && !hasDirection) {
      return { removals: [] };
    }

    const content: ContentBlock[] = [
      { type: "text", text: REMOVALS_SHAPE },
      { type: "text", text: removalsGuide(description, items) },
    ];
    for (const d of drawings) {
      if (d.kind === "pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: d.dataB64 ?? "" },
        });
      } else if (d.kind === "image") {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType(d.mime, d.filename),
            data: d.dataB64 ?? "",
          },
        });
      }
    }

    const msg = await callClaude({
      model: MODEL,
      system: REMOVALS_SYSTEM,
      messages: [{ role: "user", content }],
    });
    raw = responseText(msg);
    const json = coerceRemovalsArray(await parseModelJson(msg, raw, "array"));
    const removals = RemovalsArraySchema.parse(json);
    return { removals };
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}

// Conservative AV dependency check on a BomDoc (read-only). Suggestions only —
// nothing is written back; the user confirms each flag.
export async function dependencyCheckCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const bom = (body ?? {}).bom ?? {};
    const user =
      "BOM to review for missing dependencies (read-only — do NOT modify it; only " +
      "flag genuine, common companion items that are absent):\n" +
      JSON.stringify(bom) +
      "\n\nReturn ONLY the JSON array of dependency flags.";
    const msg = await callClaude({
      model: MODEL,
      maxTokens: 2000,
      system: DEPENDENCY_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    raw = responseText(msg);
    const json = coerceArray(JSON.parse(extractJsonText(raw, "array")));
    const flags = DependencyArraySchema.parse(json);
    return { flags };
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}

// Extract plain text from an example SOW (.docx via PizZip, .pdf via the model).
export async function extractTextCore(body: Body): Promise<unknown> {
  try {
    const b = body ?? {};
    const kind = b.kind as string;
    const dataB64 = (b.dataB64 as string) ?? "";
    if (!dataB64) {
      return { text: "" };
    }
    if (kind === "docx") {
      const buf = Buffer.from(dataB64, "base64");
      // SC.6: return the example's visual theme alongside its text.
      return { text: docxBufferToText(buf), theme: extractDocxTheme(buf) };
    }
    if (kind === "pdf") {
      const content: ContentBlock[] = [
        {
          type: "text",
          text: "Extract and return the plain body text of this document exactly as written, in reading order. Return ONLY the text — no JSON, no commentary, no fences.",
        },
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: dataB64 },
        },
      ];
      const msg = await callClaude({ model: MODEL, maxTokens: 8000, messages: [{ role: "user", content }] });
      return { text: responseText(msg) };
    }
    return { text: "" };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

// Analyze how an example SOW's writing style compares to the house style.
export async function analyzeStyleCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const sample = String((body ?? {}).sample ?? "");
    if (!sample.trim()) {
      return { differs: false, summary: "No example text was provided." };
    }
    const user =
      "STYLE EXAMPLE to analyze (assess the writing style only — ignore the specific equipment):\n" +
      sample.slice(0, 24000);
    const msg = await callClaude({
      model: MODEL,
      maxTokens: 400,
      system: STYLE_ANALYSIS_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    raw = responseText(msg);
    const json = JSON.parse(extractJsonText(raw, "object"));
    return StyleAnalysisSchema.parse(json);
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}

// Generate a formatted SOW from the reviewed BomDoc + project metadata.
export async function generateSowCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const b = body ?? {};
    const bom = (b.bom as Record<string, unknown>) ?? {};
    const meta =
      (b.meta as Record<string, unknown>) ?? {
        customer: bom.customer ?? null,
        projectNumber: bom.projectNumber ?? null,
        projectName: bom.projectName ?? null,
      };

    // Match-a-Style: only when the user opts in AND a sample is present. The
    // house path (default) is byte-identical to before — no regression.
    const styleSample = typeof b.styleSample === "string" ? b.styleSample : "";
    const matching = b.styleMode === "match" && styleSample.trim().length > 0;
    const system = matching ? SOW_SYSTEM + STYLE_MATCH_DIRECTIVE : SOW_SYSTEM;
    const styleRef = matching ? styleSample.slice(0, 40000) : CENTENE_EXEMPLAR;
    const styleLabel = matching
      ? "=== STYLE EXAMPLE — match its voice/structure/detail, do NOT copy its equipment or content ==="
      : "=== STYLE REFERENCE ONLY — do not copy any content; match the voice, structure, sentence engine, and level of technical detail ===";
    const styleEnd = matching ? "=== END STYLE EXAMPLE ===" : "=== END STYLE REFERENCE ===";

    const company =
      typeof (meta as Record<string, unknown>)?.company === "string" &&
      ((meta as Record<string, unknown>).company as string).trim()
        ? ((meta as Record<string, unknown>).company as string).trim()
        : "[Company Name]";

    const user =
      "BOM (authoritative — the ONLY source of equipment, quantities, and removals). " +
      "bom.removals is the ONLY source of removed equipment:\n" +
      JSON.stringify(bom) +
      "\n\nProject metadata:\n" +
      JSON.stringify(meta) +
      '\n\nCOMPANY (the integrator writing this SOW — use this EXACT name in place of <Company>: as the subject of every "will provide and install" sentence and as the running-header company): ' +
      company +
      contextBlock(b.context) +
      "\n\n" +
      styleLabel +
      "\n" +
      styleRef +
      "\n" +
      styleEnd +
      "\n\nReturn ONLY the SowDoc JSON for THIS project's BOM.";

    const msg = await callClaude({
      model: "claude-opus-4-8",
      maxTokens: 12000,
      system,
      messages: [{ role: "user", content: user }],
    });
    raw = responseText(msg);
    const json = await parseModelJson(msg, raw, "object");
    return cleanSow(SowDocSchema.parse(json));
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}

// Generate a budgetary ROM scope summary from the same reviewed BomDoc + meta.
export async function generateRomCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const b = body ?? {};
    const bom = (b.bom as Record<string, unknown>) ?? {};
    const meta =
      (b.meta as Record<string, unknown>) ?? {
        customer: bom.customer ?? null,
        projectNumber: bom.projectNumber ?? null,
        projectName: bom.projectName ?? null,
      };

    const company =
      typeof (meta as Record<string, unknown>)?.company === "string" &&
      ((meta as Record<string, unknown>).company as string).trim()
        ? ((meta as Record<string, unknown>).company as string).trim()
        : "[Company Name]";

    const user =
      "BOM (map equipment to SYSTEM CATEGORIES only — never quote models, " +
      "manufacturers, quantities, or pricing):\n" +
      JSON.stringify(bom) +
      "\n\nProject metadata:\n" +
      JSON.stringify(meta) +
      "\n\nCOMPANY (the integrator — use this EXACT name in place of <Company>, in the running header and as the author/voice): " +
      company +
      contextBlock(b.context) +
      "\n\nReturn ONLY the RomDoc JSON for THIS project.";

    const msg = await callClaude({
      model: "claude-opus-4-8",
      maxTokens: 4000,
      system: ROM_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    raw = responseText(msg);
    const json = await parseModelJson(msg, raw, "object");
    return cleanRom(RomDocSchema.parse(json));
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}
