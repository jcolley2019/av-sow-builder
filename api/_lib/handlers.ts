// Backend route LOGIC, shared by the local Express sidecar (server/index.ts)
// and the Vercel Serverless Functions (api/*.ts). Each core function takes the
// already-parsed JSON request body and returns the JSON-serializable response
// object. Behavior is identical across both environments — only the transport
// wrapper differs. Every route responds HTTP 200; failures come back as an
// { error, raw } object in the body (unchanged from the original sidecar).

import { callClaude, MODEL } from "./anthropic";
import {
  BOM_SHAPE,
  BOM_SYSTEM,
  CENTENE_EXEMPLAR,
  DEPENDENCY_SYSTEM,
  REMOVALS_SHAPE,
  REMOVALS_SYSTEM,
  ROM_SYSTEM,
  SOW_SYSTEM,
  STYLE_ANALYSIS_SYSTEM,
  STYLE_MATCH_DIRECTIVE,
} from "./prompts";
import {
  BomSchema,
  cleanRom,
  cleanSow,
  DependencyArraySchema,
  RemovalsArraySchema,
  RomDocSchema,
  SowDocSchema,
  StyleAnalysisSchema,
} from "./schemas";
import {
  buildContent,
  coerceArray,
  coerceRemovalsArray,
  type ContentBlock,
  docxBufferToText,
  errorMessage,
  extractJsonText,
  imageMediaType,
  type RemovalsDrawing,
  removalsGuide,
  responseText,
} from "./helpers";

type Body = Record<string, unknown>;

// Parse an uploaded BOM into a Location -> System -> line-item tree.
export async function extractBomCore(body: Body): Promise<unknown> {
  let raw = "";
  try {
    const content = buildContent(body ?? {}, BOM_SHAPE);
    const msg = await callClaude({
      model: MODEL,
      system: BOM_SYSTEM,
      messages: [{ role: "user", content }],
    });
    raw = responseText(msg);
    const json = JSON.parse(extractJsonText(raw, "object"));
    return BomSchema.parse(json);
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
    const json = coerceRemovalsArray(JSON.parse(extractJsonText(raw, "array")));
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
      return { text: docxBufferToText(Buffer.from(dataB64, "base64")) };
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
    const json = JSON.parse(extractJsonText(raw, "object"));
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
      "\n\nReturn ONLY the RomDoc JSON for THIS project.";

    const msg = await callClaude({
      model: "claude-opus-4-8",
      maxTokens: 4000,
      system: ROM_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    raw = responseText(msg);
    const json = JSON.parse(extractJsonText(raw, "object"));
    return cleanRom(RomDocSchema.parse(json));
  } catch (err) {
    return { error: errorMessage(err), raw };
  }
}
