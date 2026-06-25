import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

export const BOM_SYSTEM =
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

export const REMOVALS_SYSTEM =
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
export const BOM_SHAPE =
  "Use EXACTLY this JSON shape and these key names (minified, no fences):\n" +
  '{"customer":string|null,"projectName":string|null,"projectNumber":string|null,' +
  '"locations":[{"name":string,"systems":[{"name":string,"items":[' +
  '{"qty":number,"manufacturer":string,"model":string,"description":string,"ofe":boolean}]}]}]}\n' +
  "customer is the client/company the work is for (from the cover/title/header — " +
  "not a line item); null only if truly absent. projectName and projectNumber " +
  "come from the title block. " +
  "Group every line item under its Location (room/space) and System. " +
  "qty is a number; ofe is a boolean (true only when existing/owner-furnished/reused).";

export const REMOVALS_SHAPE =
  "Use EXACTLY this JSON shape and these key names (minified, no fences):\n" +
  '[{"qty":number,"manufacturer":string,"model":string,"description":string,"location":string|null}]';

// --- SOW generation: house style (source of truth) + exemplar ---------------
// Read shared standards from disk. Locally (tsx) the cwd is the project root.
// On Vercel the function's cwd is the deployment root and the files are bundled
// via the `includeFiles: "standards/**"` rule in vercel.json — so the same
// cwd-relative path resolves. Extra module-relative candidates are belt-and-
// suspenders for bundled layouts where cwd differs.
const HERE = path.dirname(fileURLToPath(import.meta.url)); // api/_lib

function readTextSafe(rel: string): string {
  const candidates = [
    path.resolve(process.cwd(), rel),
    path.resolve(HERE, "../..", rel), // api/_lib -> project root
    path.resolve(HERE, "..", rel),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p, "utf8");
    } catch {
      /* try next candidate */
    }
  }
  console.warn(`[sow] could not read ${rel} — continuing without it.`);
  return "";
}

const HOUSE_STYLE = readTextSafe("standards/house-style.md");
const CENTENE_EXEMPLAR = readTextSafe("standards/examples/centene-sow.txt");

export { CENTENE_EXEMPLAR };

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

export const SOW_SYSTEM =
  (HOUSE_STYLE || "You write formal AV/UC delivery Scopes of Work.") + SOW_HARD_RULES;

// ROM = Rough Order of Magnitude budgetary scope summary (a separate, short
// output mode). NOT a quote, NOT binding; no pricing/dollars/labor/model numbers.
export const ROM_SYSTEM =
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
export const STYLE_MATCH_DIRECTIVE = `

---
STYLE MATCH MODE:
Match the VOICE, SECTION STRUCTURE, and LEVEL OF DETAIL of the STYLE EXAMPLE provided in the user message. The example governs tone, organization, and depth ONLY.
ALL hard rules above remain in force regardless of the example: name only BOM equipment with the exact manufacturer/model/quantity, never invent gear, OFE/existing stays (never removed), removals only from bom.removals, no pricing or labor, accessory tiering per house-style section 5.2. If the example conflicts with a hard rule, the HARD RULE WINS. Do NOT copy the example's equipment, rooms, quantities, or specific content — only its writing style and structure.`;

// Style analysis: compares an example SOW's WRITING STYLE to the house style.
export const STYLE_ANALYSIS_SYSTEM =
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
export const DEPENDENCY_SYSTEM =
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
