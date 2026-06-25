import { z } from "zod";

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

export const BomSchema = z.object({
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

export const RemovalsArraySchema = z.array(RemovalItemSchema);

// SowDoc — block kinds normalized first so one odd block never drops a section.
type RawBlock =
  | { kind: "paragraph" | "subheading"; text: string }
  | { kind: "bullets"; items: string[] };

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

export const SowDocSchema = z.object({
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

export function cleanSow(doc: SowDocT): SowDocT {
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
export const RomDocSchema = z.object({
  headerLine: str,
  title: str,
  customer: nstr,
  overview: str,
  rooms: z.array(RomRoomSchema).catch([]),
});
type RomDocT = z.infer<typeof RomDocSchema>;

export function cleanRom(doc: RomDocT): RomDocT {
  return {
    headerLine: stripMd(doc.headerLine),
    title: stripMd(doc.title),
    customer: doc.customer == null ? null : stripMd(doc.customer),
    overview: stripMd(doc.overview),
    rooms: doc.rooms.map((r) => ({ name: stripMd(r.name), summary: stripMd(r.summary) })),
  };
}

export const StyleAnalysisSchema = z.object({
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
export const DependencyArraySchema = z.array(DependencyFlagSchema);
