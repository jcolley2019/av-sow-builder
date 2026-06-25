import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import PizZip from "pizzip";
import { z } from "zod";

import { callClaude } from "./claude";

const app = express();
const PORT = Number(process.env.API_PORT ?? 8787);

app.use(cors());
// JSON only (no multipart). Base64 payloads can be large; keep the 25mb limit.
app.use(express.json({ limit: "25mb" }));

// Health check — proxied from the Vite dev server at /api/health.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const BOM_SYSTEM =
  "You extract AV/UC bills of materials into structured JSON, organized by " +
  "Location (room/space) and System. Extract ONLY what is present; never " +
  "invent equipment. 'ofe' is true when a line is shown as existing / " +
  "owner-furnished / to-be-reused — meaning it STAYS in the system; otherwise " +
  "false. Do NOT mark anything as removed; removals are not part of the BOM. " +
  "Capture the CUSTOMER / CLIENT / COMPANY the work is for: look ANYWHERE in the " +
  "document — cover page, title block, document header or footer, logo or company " +
  "text, and labels such as 'Customer:', 'Client:', 'Company:', 'Sold To:', or " +
  "'Prepared for:'. The customer name is usually on the cover/title, NOT in the " +
  "by-system line items. Put it in 'customer'; if it genuinely does not appear " +
  "anywhere, leave customer null — never invent it. projectName and projectNumber " +
  "likewise come from the cover / title block. " +
  "Return ONLY valid minified JSON for { customer, projectName, projectNumber, " +
  "locations }, no prose, no fences.";

const REMOVALS_SYSTEM =
  "You build the equipment-removal list for an AV demolition scope. The user's " +
  "description and selected systems (the REMOVAL DIRECTION) are your GUIDE for " +
  "what to look for. When drawings are provided, scan them and return removal " +
  "items that MATCH the user's direction: read floor plans for device counts " +
  "(ceiling speakers, ceiling/table microphones, displays, cameras, wall plates) " +
  "and one-line / schematic / rack drawings for head-end gear (amplifiers, " +
  "DSP / audio processors, codecs, video matrices/switchers, control processors, " +
  "wireless receivers). Provide PER-ROOM counts wherever the drawings support them, " +
  "using the room/area label as the location. Return ONLY items the drawings " +
  "actually show or clearly indicate together with the user's direction — never " +
  "invent equipment that is not supported. manufacturer and model may be generic " +
  "when the drawing shows only a type/count (e.g. manufacturer \"(existing)\", " +
  "model \"ceiling speaker\"). If NO drawings are provided, produce the list from " +
  "the user's description and selected systems alone, using the counts and " +
  "locations they give, and note in each description that it is user-described. " +
  "Never include equipment that is staying. Return ONLY a valid minified JSON " +
  "array of { qty, manufacturer, model, description, location } — empty array if " +
  "nothing is supported. No prose, no fences.";

// Pin the exact nested key names so the model's JSON maps cleanly onto the
// shared types (the system prompts fix the top level but not the leaf keys).
const BOM_SHAPE =
  "Use EXACTLY this JSON shape and these key names (minified, no fences):\n" +
  '{"customer":string|null,"projectName":string|null,"projectNumber":string|null,' +
  '"locations":[{"name":string,"systems":[{"name":string,"items":[' +
  '{"qty":number,"manufacturer":string,"model":string,"description":string,"ofe":boolean}]}]}]}\n' +
  "customer is the client/company the work is for (from the cover/title/header — " +
  "not a line item); null only if truly absent. projectName and projectNumber " +
  "come from the title block. " +
  "Group every line item under its Location (room/space) and System. " +
  "qty is a number; ofe is a boolean (true only when existing/owner-furnished/reused).";

const REMOVALS_SHAPE =
  "Use EXACTLY this JSON shape and these key names (minified, no fences):\n" +
  '[{"qty":number,"manufacturer":string,"model":string,"description":string,"location":string|null}]';

// --- SOW generation: house style (source of truth) + exemplar ---------------
// tsx runs from the project root, so these resolve against process.cwd().
function readTextSafe(rel: string): string {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), rel), "utf8");
  } catch {
    console.warn(`[sow] could not read ${rel} — continuing without it.`);
    return "";
  }
}

const HOUSE_STYLE = readTextSafe("standards/house-style.md");
const CENTENE_EXEMPLAR = readTextSafe("standards/examples/centene-sow.txt");

const SOW_HARD_RULES = `

---
HARD GENERATION RULES (in addition to the house style above):
- Follow the house style exactly. Name ONLY equipment present in the BOM, with the exact manufacturer, model, and quantity. Never invent gear, models, or quantities, and never change a BOM quantity to make a sentence read better.
- Anything shown existing / OFE in the BOM is STAYING — write it as remaining and, where applicable, incorporated into the new system; never describe it as removed.
- Write an "Equipment to be Removed and Returned to Owner" section ONLY if bom.removals is non-empty, and populate it SOLELY from bom.removals. If bom.removals is empty, OMIT that section entirely and never infer a removal from the BOM.
- Apply the accessory tiers in house-style section 5.2: fold Tier A loose patch cables (one optional catch-all sentence) and Tier D mounts/brackets/shelves/PSUs into the parent device prose; NAME Tier B bulk/spooled/by-length cable with quantity and purpose; CALL OUT Tier C infrastructure (table/floor boxes, retractors, floor track, raceway, grommets) under its own Location and System; do not narrate Tier E service/warranty/e-waste/"miscellaneous" lines. Never list a folded accessory as standalone key equipment.
- VLAN and other IT-dependent values appear only as a proposed plan "subject to <Client> IT confirmation". Output NO pricing and NO labor hours.
- Choose room-first vs suite-first organization per house-style section 4, based on the BOM.
- Output PLAIN TEXT only. Do NOT use markdown — no ** for bold, no markdown headings, no markdown bullet characters in block text. The renderer applies all emphasis (equipment model numbers are styled automatically).
- Return ONLY valid JSON matching this exact shape (no prose, no code fences):
  {"headerLine":string,"title":string,"subtitle":string|null,"basisStatement":string|null,"sections":[{"heading":string,"level":1|2,"blocks":[{"kind":"paragraph","text":string}|{"kind":"subheading","text":string}|{"kind":"bullets","items":string[]}]}]}
- headerLine should read: "<Company>  |  <ProjectNumber>  |  <ProjectName>", where <Company> is the integrator/company name provided in the user message (use it verbatim; if none is provided, use "[Company Name]" — never invent a company). title is "<ProjectNumber>  <ProjectName>". subtitle is the room/space configuration. basisStatement is the italic basis/hedge line.`;

const SOW_SYSTEM =
  (HOUSE_STYLE || "You write formal AV/UC delivery Scopes of Work.") + SOW_HARD_RULES;

// ROM = Rough Order of Magnitude budgetary scope summary (a separate, short
// output mode). NOT a quote, NOT binding; no pricing/dollars/labor/model numbers.
const ROM_SYSTEM =
  "You write a concise budgetary ROM (Rough Order of Magnitude) scope summary " +
  "for an AV/UC project in the integrator's professional voice. A ROM is for EARLY CLIENT " +
  "BUDGETING — it is NOT a quote and NOT binding. It contains NO pricing, NO " +
  "dollar figures, NO labor, and NO part or model numbers. " +
  "Write the 'overview' as ONE paragraph naming the customer, the project, and " +
  "the number of spaces, and stating that this is a rough-order-of-magnitude " +
  "budgetary scope summary for early planning, subject to detailed design. " +
  "Then write ONE short blurb of 2-4 sentences PER location (a 'rooms' entry), " +
  "summarizing in plain English the SYSTEM CATEGORIES that room receives for a " +
  "complete, working system. Map BOM equipment to CATEGORIES ONLY — display, " +
  "projector, ceiling/table microphone, loudspeakers, DSP / audio processor, " +
  "amplifier, wireless presentation, video conferencing / codec, camera, " +
  "switching / distribution, control, rack / power. Do NOT list model numbers, " +
  "manufacturers, or accessory quantities. Existing / OFE / reused equipment may " +
  "be noted as integrated or retained — never as removed. " +
  "Return ONLY valid minified JSON, no prose, no fences, matching this shape: " +
  '{"headerLine":string,"title":string,"customer":string|null,"overview":string,' +
  '"rooms":[{"name":string,"summary":string}]}. ' +
  'headerLine reads "<Company>  |  <ProjectNumber>  |  ' +
  '<ProjectName>", where <Company> is the integrator/company name provided in the ' +
  'user message (use it verbatim; if none, use "[Company Name]" — never invent ' +
  'one); title is "<ProjectNumber>  <ProjectName>"; customer is the ' +
  "client/customer name (null if unknown).";

// Match-a-Style (SOW.8): appended to SOW_SYSTEM ONLY when the user opts to match
// a provided example. It governs voice/structure/detail; the hard rules above win.
const STYLE_MATCH_DIRECTIVE = `

---
STYLE MATCH MODE:
Match the VOICE, SECTION STRUCTURE, and LEVEL OF DETAIL of the STYLE EXAMPLE provided in the user message. The example governs tone, organization, and depth ONLY.
ALL hard rules above remain in force regardless of the example: name only BOM equipment with the exact manufacturer/model/quantity, never invent gear, OFE/existing stays (never removed), removals only from bom.removals, no pricing or labor, accessory tiering per house-style section 5.2. If the example conflicts with a hard rule, the HARD RULE WINS. Do NOT copy the example's equipment, rooms, quantities, or specific content — only its writing style and structure.`;

// Style analysis: compares an example SOW's WRITING STYLE to the house style.
const STYLE_ANALYSIS_SYSTEM =
  "You compare the WRITING STYLE of a provided example AV/UC Scope of Work against " +
  "the typical house style. House style: third-person declarative delivery " +
  "voice (the integrator \"will provide and install ...\"), organized by Location/Room then " +
  "System (Display, Video, Audio, Conferencing, Control, Network, Rack), bold " +
  "manufacturer+model on first mention, dense signal-flow detail describing what " +
  "each device does and connects to, and standard exceptions/clarifications " +
  "boilerplate. Analyze ONLY the voice, section structure, organization, and level " +
  "of detail — NOT the specific equipment. Return ONLY minified JSON " +
  "{ differs: boolean, summary: string } where summary is 1-3 sentences on how the " +
  "example's style differs from (or matches) the house style. No prose, no fences.";

// Dependency check (SOW.9): conservative, suggestions-only review of a BOM for
// common missing companion items. These are FLAGS to confirm — never auto-added.
const DEPENDENCY_SYSTEM =
  "You are an AV systems engineer reviewing a bill of materials for MISSING " +
  "DEPENDENCIES — common companion items a listed device needs that are NOT in " +
  "the BOM. Be CONSERVATIVE: only flag genuine, common dependencies you are " +
  "confident about. Good examples: a codec or PTZ camera with no wall/rack mount " +
  "listed; a device that needs a power supply / PSU that is not present; a Q-SYS " +
  "or DSP core that needs a Dante or software license; a display with no mount; a " +
  "networked-audio device that implies a PoE network switch. Do NOT flag anything " +
  "speculative, do NOT propose upgrades or extra features, and do NOT invent " +
  "model numbers you are unsure about. These are FLAGS for a human to confirm — " +
  "never assume they are needed. Return ONLY a minified JSON array of " +
  "{ forItem: '<manufacturer model>', location: string|null, suggestion: '<what " +
  "is likely missing>', candidate: '<a specific candidate model, or \"confirm\" " +
  "if unsure>', reason: '<one concise sentence>' } — an empty array if nothing is " +
  "genuinely missing. No prose, no fences.";

// ---------------------------------------------------------------------------
// Zod schemas (lenient — coerce/recover from model output variance)
// ---------------------------------------------------------------------------

const qty = z.coerce.number().catch(1);
const str = z.preprocess((v) => (v == null ? "" : v), z.coerce.string()).catch("");
const nstr = z
  .preprocess((v) => (v === "" ? null : v), z.coerce.string().nullable())
  .catch(null);

const bool = z
  .preprocess((v) => {
    if (typeof v === "string") {
      const t = v.trim().toLowerCase();
      if (t === "true" || t === "yes" || t === "1") return true;
      if (t === "false" || t === "no" || t === "0" || t === "") return false;
    }
    return v;
  }, z.coerce.boolean())
  .catch(false);

const ItemSchema = z.object({
  qty,
  manufacturer: str,
  model: str,
  description: str,
  ofe: bool,
});

const SystemSchema = z.object({
  name: str,
  items: z.array(ItemSchema).catch([]),
});

const RoomSchema = z.object({
  name: str,
  systems: z.array(SystemSchema).catch([]),
});

const BomSchema = z.object({
  customer: nstr,
  projectName: nstr,
  projectNumber: nstr,
  locations: z.array(RoomSchema).catch([]),
});

const RemovalItemSchema = z.object({
  qty,
  manufacturer: str,
  model: str,
  description: str,
  location: nstr,
});

const RemovalsArraySchema = z.array(RemovalItemSchema);

// SowDoc — block kinds normalized first so one odd block never drops a section.
type RawBlock = { kind: "paragraph" | "subheading"; text: string } | { kind: "bullets"; items: string[] };

function normalizeBlock(b: unknown): RawBlock | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text : "";
  const items = Array.isArray(o.items) ? o.items.map((x) => String(x)) : null;
  if (o.kind === "bullets") return { kind: "bullets", items: items ?? [] };
  if (o.kind === "subheading") return { kind: "subheading", text };
  if (o.kind === "paragraph") return { kind: "paragraph", text };
  // Unknown/missing kind: salvage by content.
  if (items) return { kind: "bullets", items };
  if (text) return { kind: "paragraph", text };
  return null;
}

const ParagraphBlock = z.object({ kind: z.literal("paragraph"), text: str });
const SubheadingBlock = z.object({ kind: z.literal("subheading"), text: str });
const BulletsBlock = z.object({ kind: z.literal("bullets"), items: z.array(str).catch([]) });
const SowBlockSchema = z.discriminatedUnion("kind", [ParagraphBlock, SubheadingBlock, BulletsBlock]);

const SowSectionSchema = z.object({
  heading: str,
  level: z.coerce
    .number()
    .transform((n): 1 | 2 => (n === 2 ? 2 : 1))
    .catch(1),
  blocks: z
    .preprocess(
      (arr) => (Array.isArray(arr) ? arr.map(normalizeBlock).filter(Boolean) : []),
      z.array(SowBlockSchema),
    )
    .catch([]),
});

const SowDocSchema = z.object({
  headerLine: str,
  title: str,
  subtitle: nstr,
  basisStatement: nstr,
  sections: z.array(SowSectionSchema).catch([]),
});

type SowDocT = z.infer<typeof SowDocSchema>;

// Defensive: strip any stray markdown emphasis the model emits (the SowBlock
// model is plain text; the renderer styles model numbers itself).
function stripMd(s: string): string {
  return s.replace(/\*\*/g, "").replace(/__/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

function cleanSow(doc: SowDocT): SowDocT {
  return {
    headerLine: stripMd(doc.headerLine),
    title: stripMd(doc.title),
    subtitle: doc.subtitle == null ? null : stripMd(doc.subtitle),
    basisStatement: doc.basisStatement == null ? null : stripMd(doc.basisStatement),
    sections: doc.sections.map((s) => ({
      ...s,
      heading: stripMd(s.heading),
      blocks: s.blocks.map((b) =>
        b.kind === "bullets"
          ? { ...b, items: b.items.map(stripMd) }
          : { ...b, text: stripMd(b.text) },
      ),
    })),
  };
}

// ROM (budgetary scope summary) schema + cleanup.
const RomRoomSchema = z.object({ name: str, summary: str });
const RomDocSchema = z.object({
  headerLine: str,
  title: str,
  customer: nstr,
  overview: str,
  rooms: z.array(RomRoomSchema).catch([]),
});
type RomDocT = z.infer<typeof RomDocSchema>;

function cleanRom(doc: RomDocT): RomDocT {
  return {
    headerLine: stripMd(doc.headerLine),
    title: stripMd(doc.title),
    customer: doc.customer == null ? null : stripMd(doc.customer),
    overview: stripMd(doc.overview),
    rooms: doc.rooms.map((r) => ({ name: stripMd(r.name), summary: stripMd(r.summary) })),
  };
}

const StyleAnalysisSchema = z.object({
  differs: z.coerce.boolean().catch(true),
  summary: str,
});

const DependencyFlagSchema = z.object({
  forItem: str,
  location: nstr,
  suggestion: str,
  candidate: str,
  reason: str,
});
const DependencyArraySchema = z.array(DependencyFlagSchema);

/** Normalize a possibly-wrapped array (model may return {flags:[...]} etc.). */
function coerceArray(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const v of Object.values(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

// Extract plain body text from a .docx buffer (word/document.xml only).
function docxBufferToText(buf: Buffer): string {
  const zip = new PizZip(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) return "";
  let xml = entry.asText();
  xml = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:tab\s*\/?>/g, "\t");
  let text = xml.replace(/<[^>]+>/g, "");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x?[0-9a-fA-F]+;/g, " ");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

/** Best-effort image media type from an explicit mime or a filename. */
function imageMediaType(mime?: string, filename?: string): ImageMediaType {
  const m = (mime ?? "").toLowerCase();
  if (m === "image/png" || m === "image/jpeg" || m === "image/webp" || m === "image/gif") {
    return m;
  }
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg"; // jpg/jpeg and unknown -> jpeg
}

type ContentBlock = Anthropic.ContentBlockParam;

/** Build the user content block(s) for a request body, led by a shape hint. */
function buildContent(
  body: {
    kind?: string;
    text?: string;
    dataB64?: string;
    mime?: string;
    filename?: string;
  },
  shape: string,
): ContentBlock[] {
  const { kind, text, dataB64, mime, filename } = body;
  const hint: ContentBlock = { type: "text", text: shape };

  if (kind === "text") {
    return [hint, { type: "text", text: text ?? "" }];
  }
  if (kind === "pdf") {
    return [
      hint,
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: dataB64 ?? "" },
      },
    ];
  }
  if (kind === "image") {
    return [
      hint,
      {
        type: "image",
        source: {
          type: "base64",
          media_type: imageMediaType(mime, filename),
          data: dataB64 ?? "",
        },
      },
    ];
  }
  throw new Error(`Unsupported kind: ${String(kind)}`);
}

/** Concatenate all text blocks from a Claude response. */
function responseText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Strip ``` fences and isolate the first JSON object/array if surrounded by prose. */
function extractJsonText(raw: string, shape: "object" | "array"): string {
  let t = raw.trim();
  const fenced = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (fenced) t = fenced[1].trim();

  // If it already parses, keep as-is.
  try {
    JSON.parse(t);
    return t;
  } catch {
    /* fall through to boundary extraction */
  }

  const open = shape === "object" ? "{" : "[";
  const close = shape === "object" ? "}" : "]";
  const start = t.indexOf(open);
  const end = t.lastIndexOf(close);
  if (start !== -1 && end !== -1 && end > start) {
    return t.slice(start, end + 1);
  }
  return t;
}

/** Some models wrap the removals array in an object — normalize to an array. */
function coerceRemovalsArray(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    for (const key of ["removals", "items", "equipment", "data"]) {
      if (Array.isArray(obj[key])) return obj[key];
    }
  }
  return [];
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Parse an uploaded BOM into a Location -> System -> line-item tree.
app.post("/api/extract-bom", async (req: Request, res: Response) => {
  let raw = "";
  try {
    const content = buildContent(req.body ?? {}, BOM_SHAPE);
    const msg = await callClaude({
      model: MODEL,
      system: BOM_SYSTEM,
      messages: [{ role: "user", content }],
    });
    raw = responseText(msg);
    const json = JSON.parse(extractJsonText(raw, "object"));
    const parsed = BomSchema.parse(json);
    res.json(parsed);
  } catch (err) {
    res.status(200).json({ error: errorMessage(err), raw });
  }
});

type RemovalsDrawing = { kind?: string; dataB64?: string; mime?: string; filename?: string };

/** The user's removal direction (selected systems + free text) as a guide block. */
function removalsGuide(description?: string, items?: string[]): string {
  const lines: string[] = [];
  if (Array.isArray(items) && items.length > 0) {
    lines.push(`Systems the user selected for removal: ${items.join("; ")}.`);
  }
  if (description && description.trim()) {
    lines.push(`User description of what to remove: ${description.trim()}`);
  }
  if (lines.length === 0) {
    return "REMOVAL DIRECTION: none given. Extract only equipment the drawings explicitly call out for removal / demolition / decommission.";
  }
  return `REMOVAL DIRECTION (the guide for what to look for):\n${lines.join("\n")}`;
}

// Extract the removals list from the user's direction + optional as-built drawings.
app.post("/api/extract-removals", async (req: Request, res: Response) => {
  let raw = "";
  try {
    const body = req.body ?? {};
    const description: string | undefined = body.description;
    const items: string[] | undefined = body.items;
    const drawings: RemovalsDrawing[] = Array.isArray(body.drawings) ? body.drawings : [];

    // No drawings AND no direction -> nothing to do; skip the model call.
    const hasDirection = (description && description.trim()) || (items && items.length > 0);
    if (drawings.length === 0 && !hasDirection) {
      res.json({ removals: [] });
      return;
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
    res.json({ removals });
  } catch (err) {
    res.status(200).json({ error: errorMessage(err), raw });
  }
});

// Conservative AV dependency check on a BomDoc (read-only). Suggestions only —
// nothing is written back; the user confirms each flag.
app.post("/api/dependency-check", async (req: Request, res: Response) => {
  let raw = "";
  try {
    const bom = (req.body ?? {}).bom ?? {};
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
    res.json({ flags });
  } catch (err) {
    res.status(200).json({ error: errorMessage(err), raw });
  }
});

// Extract plain text from an example SOW (.docx via PizZip, .pdf via the model).
app.post("/api/extract-text", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};
    const kind: string = body.kind;
    const dataB64: string = body.dataB64 ?? "";
    if (!dataB64) {
      res.json({ text: "" });
      return;
    }
    if (kind === "docx") {
      res.json({ text: docxBufferToText(Buffer.from(dataB64, "base64")) });
      return;
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
      res.json({ text: responseText(msg) });
      return;
    }
    res.json({ text: "" });
  } catch (err) {
    res.status(200).json({ error: errorMessage(err) });
  }
});

// Analyze how an example SOW's writing style compares to the house style.
app.post("/api/analyze-style", async (req: Request, res: Response) => {
  let raw = "";
  try {
    const sample = String((req.body ?? {}).sample ?? "");
    if (!sample.trim()) {
      res.json({ differs: false, summary: "No example text was provided." });
      return;
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
    const parsed = StyleAnalysisSchema.parse(json);
    res.json(parsed);
  } catch (err) {
    res.status(200).json({ error: errorMessage(err), raw });
  }
});

// Generate a formatted SOW from the reviewed BomDoc + project metadata.
app.post("/api/generate-sow", async (req: Request, res: Response) => {
  let raw = "";
  try {
    const body = req.body ?? {};
    const bom = body.bom ?? {};
    const meta = body.meta ?? {
      customer: bom.customer ?? null,
      projectNumber: bom.projectNumber ?? null,
      projectName: bom.projectName ?? null,
    };

    // Match-a-Style: only when the user opts in AND a sample is present. The
    // house path (default) is byte-identical to before — no regression.
    const styleSample = typeof body.styleSample === "string" ? body.styleSample : "";
    const matching = body.styleMode === "match" && styleSample.trim().length > 0;
    const system = matching ? SOW_SYSTEM + STYLE_MATCH_DIRECTIVE : SOW_SYSTEM;
    const styleRef = matching ? styleSample.slice(0, 40000) : CENTENE_EXEMPLAR;
    const styleLabel = matching
      ? "=== STYLE EXAMPLE — match its voice/structure/detail, do NOT copy its equipment or content ==="
      : "=== STYLE REFERENCE ONLY — do not copy any content; match the voice, structure, sentence engine, and level of technical detail ===";
    const styleEnd = matching ? "=== END STYLE EXAMPLE ===" : "=== END STYLE REFERENCE ===";

    const company =
      typeof meta?.company === "string" && meta.company.trim()
        ? meta.company.trim()
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
    const parsed = cleanSow(SowDocSchema.parse(json));
    res.json(parsed);
  } catch (err) {
    res.status(200).json({ error: errorMessage(err), raw });
  }
});

// Generate a budgetary ROM scope summary from the same reviewed BomDoc + meta.
app.post("/api/generate-rom", async (req: Request, res: Response) => {
  let raw = "";
  try {
    const body = req.body ?? {};
    const bom = body.bom ?? {};
    const meta = body.meta ?? {
      customer: bom.customer ?? null,
      projectNumber: bom.projectNumber ?? null,
      projectName: bom.projectName ?? null,
    };

    const company =
      typeof meta?.company === "string" && meta.company.trim()
        ? meta.company.trim()
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
    const parsed = cleanRom(RomDocSchema.parse(json));
    res.json(parsed);
  } catch (err) {
    res.status(200).json({ error: errorMessage(err), raw });
  }
});

app.listen(PORT, () => {
  console.log(`[api] SOW Generator sidecar listening on http://localhost:${PORT}`);
});
