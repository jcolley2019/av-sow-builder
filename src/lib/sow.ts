import type { BomDoc, SowBlock, SowDoc } from "./types";

// ---------------------------------------------------------------------------
// Accessory tiers + BOM coverage guardrail (house-style 5.2)
// ---------------------------------------------------------------------------

// Every BOM line is tiered. Only some tiers are real deliverables we expect to
// see named in the SOW; the rest are folded into prose and must NEVER be
// flagged as "missing".
//   patch   (Tier A) loose HDMI/USB/DP/short network patch jumpers (catch-all)
//   bulk    (Tier B) spooled / by-length / bulk cable (named: qty + purpose)
//   infra   (Tier C) table/floor boxes, retractors, floor track, grommets (deliverables)
//   mount   (Tier D) mounts/brackets/shelves + bundled device hardware (folded)
//   service (Tier E) contracts/warranties/e-waste/"miscellaneous" (omit or noted)
//   device           everything else: real system equipment
export type AccessoryTier = "patch" | "bulk" | "infra" | "mount" | "service" | "device";

type AccessoryInput = { manufacturer: string; model: string; description: string };

// Tier E — service / non-equipment lines.
const RE_SERVICE =
  /\b(warrant(y|ies)|assurance|e-?waste|miscellaneous|misc)\b|\b(support|service|maintenance)\s+(contract|agreement|plan)\b|\bsuccess\s+tracks\b|\bcon-[a-z0-9]/;
// Tier C — infrastructure deliverables. Checked BEFORE cables so "cable
// retractor" / "floor box" land here, not in a cable bucket.
const RE_INFRA =
  /\b(table|floor)\s*box(es)?\b|\bpoke[\s-]?thr(u|ough)\b|\bretractor\b|\bfloor\s*track\b|\braceway\b|\bcubb(y|ies)\b|\bgrommet(s)?\b|\bmonument\b|\btrough\b|\bfurniture\b/;
// Tier D — mounting hardware + bundled device hardware that folds into the
// parent device sentence (PSUs, plates, blanks, screws, foam, etc.).
const RE_MOUNT =
  /\bmount(s|ing)?\b|\bbracket(s)?\b|\bshel(f|ves)\b|\brack\s*(shelf|ear|rail)s?\b|\bpole\s*mount\b|\bpower\s+(supply|cord)\b|\bpsu\b|\b(face|wall|cover)\s*plate\b|\bblank(ing)?\b|\bfiller\b|\bscrew(s)?\b|\bwindscreen\b|\bfoam\b|\bvelcro\b|\blacing\b|\bferrule\b|\bconduit\b|\bconsumable(s)?\b/;
// Cable-ish lines (then split into patch vs bulk).
const RE_CABLE =
  /\bcable(s)?\b|\bcord(s)?\b|\bjumper\b|\bhdmi\b|\busb(-?c)?\b|\bdisplayport\b|\bpatch\b|\bcat\s?5e?\b|\bcat\s?6a?\b|\bspeaker\s*wire\b/;
// Bulk / by-length indicators -> Tier B (named), otherwise Tier A patch.
const RE_BULK =
  /\bspool(s|ed)?\b|\bbulk\b|\bplenum\b|\briser\b|\breel\b|\bper\s*foot\b|\bby\s*the\s*foot\b|\bfeet\b|\bmeter(s)?\b|\b\d{3,}\s*(ft|m)\b|\b1000\b|\b305\b|\bbox\s+of\b/;

/** Classify a BOM line into an accessory tier (or "device"). */
export function classifyTier(item: AccessoryInput): AccessoryTier {
  const hay = `${item.manufacturer} ${item.model} ${item.description}`.toLowerCase();
  if (RE_SERVICE.test(hay)) return "service";
  if (RE_INFRA.test(hay)) return "infra";
  if (RE_MOUNT.test(hay)) return "mount";
  if (RE_CABLE.test(hay)) return RE_BULK.test(hay) ? "bulk" : "patch";
  return "device";
}

// Only these tiers are expected to be named in the SOW.
const REQUIRED_TIERS: ReadonlySet<AccessoryTier> = new Set(["device", "infra", "bulk"]);

// --- Normalized matching ---------------------------------------------------

/** lowercase, punctuation -> space, collapse whitespace. */
function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Trailing color / trim words stripped from a BOM model before matching
// (longest phrases first so "arctic white" is removed whole).
const COLOR_TRIM = [
  "first light",
  "arctic white",
  "carbon black",
  "matte black",
  "matte white",
  "textured black",
  "textured white",
  "pure white",
  "jet black",
  "white",
  "black",
  "silver",
  "grey",
  "gray",
  "graphite",
  "charcoal",
  "aluminum",
  "aluminium",
  "titanium",
  "bronze",
  "beige",
  "almond",
  "platinum",
].sort((a, b) => b.length - a.length);

/** Strip trailing color/trim suffixes from an already-normalized model. */
function stripColorSuffix(norm: string): string {
  let m = norm;
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of COLOR_TRIM) {
      if (m !== c && m.endsWith(` ${c}`)) {
        m = m.slice(0, m.length - c.length - 1).trim();
        changed = true;
        break;
      }
    }
  }
  return m;
}

/** The distinctive part-number token (prefer a digit-bearing token, but skip
 *  pure measurements like "1000ft" / "305m" / "6ft"). */
function coreToken(norm: string): string {
  const isMeasure = (t: string) => /^\d+(ft|feet|m|mm|cm|in|inch|w|v|a|k|hz|khz)?$/.test(t);
  const tokens = norm.split(" ").filter(Boolean);
  const digits = tokens.filter((t) => /[0-9]/.test(t) && t.length >= 3 && !isMeasure(t));
  const pool = digits.length ? digits : tokens.filter((t) => t.length >= 4 && !isMeasure(t));
  if (pool.length === 0) return norm;
  return pool.reduce((a, b) => (b.length > a.length ? b : a));
}

/** Covered if the suffix-stripped model OR its core token is in the SOW text. */
function isModelCovered(model: string, sowNorm: string): boolean {
  const norm = normalizeText(model);
  if (norm.length === 0) return true; // nothing to trace
  const stripped = stripColorSuffix(norm) || norm;
  if (sowNorm.includes(stripped)) return true;
  const token = coreToken(stripped);
  return token.length >= 3 && sowNorm.includes(token);
}

/** Flatten all SOW text into one haystack for substring checks. */
export function sowText(sow: SowDoc): string {
  const parts: string[] = [sow.headerLine, sow.title, sow.subtitle ?? "", sow.basisStatement ?? ""];
  for (const section of sow.sections) {
    parts.push(section.heading);
    for (const block of section.blocks) {
      if (block.kind === "bullets") parts.push(block.items.join(" "));
      else parts.push(block.text);
    }
  }
  return parts.join("\n");
}

export type CoverageItem = {
  location: string;
  system: string;
  manufacturer: string;
  model: string;
  tier: AccessoryTier;
  label: string;
};

export type Coverage = {
  total: number;
  covered: number;
  clean: boolean;
  missing: CoverageItem[];
  heading: string;
  note: string | null;
};

const COVERAGE_NOTE =
  "Loose patch cables and mounts are intentionally folded into prose and not listed here.";

/**
 * Coverage guardrail: of the REQUIRED-tier BOM lines (real devices, Tier C
 * infrastructure, and Tier B bulk cable), which are not named in the SOW —
 * each reported with its Location and System. Patch cables, mounts, and
 * service lines are never flagged.
 */
export function coverage(bom: BomDoc, sow: SowDoc): Coverage {
  const sowNorm = normalizeText(sowText(sow));
  const seen = new Set<string>();
  const required: CoverageItem[] = [];

  for (const room of bom.locations) {
    for (const sys of room.systems) {
      for (const item of sys.items) {
        if (item.model.trim() === "") continue; // can't verify
        const tier = classifyTier(item);
        if (!REQUIRED_TIERS.has(tier)) continue;
        const key = `${item.manufacturer} ${item.model}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const manufacturer = item.manufacturer.trim();
        const model = item.model.trim();
        const location = room.name.trim() || "Unspecified location";
        const system = sys.name.trim() || "—";
        required.push({
          location,
          system,
          manufacturer,
          model,
          tier,
          label: `${location} / ${system} — ${[manufacturer, model].filter(Boolean).join(" ")}`,
        });
      }
    }
  }

  const missing = required.filter((r) => !isModelCovered(r.model, sowNorm));
  const total = required.length;
  const clean = missing.length === 0;

  return {
    total,
    covered: total - missing.length,
    clean,
    missing,
    heading: clean
      ? `All ${total} system item${total === 1 ? "" : "s"} covered.`
      : `${missing.length} item${missing.length === 1 ? "" : "s"} to verify`,
    note: clean ? null : COVERAGE_NOTE,
  };
}

// ---------------------------------------------------------------------------
// Model-number highlighting (mono material on the paper)
// ---------------------------------------------------------------------------

/** All model strings present in the BOM (incl. removals), longest-first so the
 *  highlighter prefers the most specific match. */
export function allModels(bom: BomDoc): string[] {
  const set = new Set<string>();
  for (const room of bom.locations) {
    for (const sys of room.systems) {
      for (const item of sys.items) {
        const m = item.model.trim();
        if (m.length >= 2) set.add(m);
      }
    }
  }
  for (const r of bom.removals) {
    const m = r.model.trim();
    if (m.length >= 2) set.add(m);
  }
  return Array.from(set).sort((a, b) => b.length - a.length);
}

// ---------------------------------------------------------------------------
// Immutable SowDoc edit helpers (inline editing in the paper pane)
// ---------------------------------------------------------------------------

type MetaField = "headerLine" | "title" | "subtitle" | "basisStatement";

export function setSowField(sow: SowDoc, field: MetaField, value: string): SowDoc {
  return { ...sow, [field]: value };
}

function mapAt<T>(arr: T[], i: number, fn: (x: T) => T): T[] {
  return arr.map((x, idx) => (idx === i ? fn(x) : x));
}

export function setSectionHeading(sow: SowDoc, si: number, heading: string): SowDoc {
  return { ...sow, sections: mapAt(sow.sections, si, (s) => ({ ...s, heading })) };
}

export function setBlockText(sow: SowDoc, si: number, bi: number, text: string): SowDoc {
  return {
    ...sow,
    sections: mapAt(sow.sections, si, (s) => ({
      ...s,
      blocks: mapAt(s.blocks, bi, (b): SowBlock =>
        b.kind === "bullets" ? b : { ...b, text },
      ),
    })),
  };
}

export function setBulletText(
  sow: SowDoc,
  si: number,
  bi: number,
  ii: number,
  text: string,
): SowDoc {
  return {
    ...sow,
    sections: mapAt(sow.sections, si, (s) => ({
      ...s,
      blocks: mapAt(s.blocks, bi, (b): SowBlock =>
        b.kind === "bullets"
          ? { ...b, items: mapAt(b.items, ii, () => text) }
          : b,
      ),
    })),
  };
}
