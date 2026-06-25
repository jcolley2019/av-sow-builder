import type { BomDoc } from "./types";
import { classifyTier, type AccessoryTier } from "./sow";

// Deterministic BOM-vs-list reconciliation (no AI — must be trustworthy).
// Lines are normalized to {manufacturer, model, qty} and matched on model
// (manufacturer kept for display). Quantities are summed per model across all
// locations, since a client/vendor list is usually flat while a D-Tools BOM is
// per-room. Neither BomDoc is modified — this is a read-only analysis.

export type DiffItem = {
  manufacturer: string;
  model: string;
  qty: number;
  locations: string[];
  tier: AccessoryTier;
};

export type QtyDiff = {
  manufacturer: string;
  model: string;
  mineQty: number;
  theirsQty: number;
  locations: string[];
  tier: AccessoryTier;
};

export type CompareResult = {
  missing: DiffItem[]; // in the compare list, not in my BOM
  extra: DiffItem[]; // in my BOM, not in the compare list
  qtyMismatch: QtyDiff[]; // same model, different quantity
  matched: DiffItem[]; // same model + same quantity
};

/** Patch cables, mounts, and service lines are not headline equipment. */
export function isAccessoryTier(tier: AccessoryTier): boolean {
  return tier === "patch" || tier === "mount" || tier === "service";
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

type Agg = {
  manufacturer: string;
  model: string;
  qty: number;
  locations: string[];
  tier: AccessoryTier;
};

/** Aggregate a BomDoc into one entry per normalized model. */
function aggregate(bom: BomDoc): Map<string, Agg> {
  const map = new Map<string, Agg>();
  for (const room of bom.locations ?? []) {
    for (const sys of room.systems ?? []) {
      for (const item of sys.items ?? []) {
        const model = (item.model ?? "").trim();
        if (!model) continue;
        const key = norm(model);
        if (!key) continue;
        const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0;
        const existing = map.get(key);
        if (existing) {
          existing.qty += qty;
          if (room.name && !existing.locations.includes(room.name)) {
            existing.locations.push(room.name);
          }
        } else {
          map.set(key, {
            manufacturer: (item.manufacturer ?? "").trim(),
            model,
            qty,
            locations: room.name ? [room.name] : [],
            tier: classifyTier(item),
          });
        }
      }
    }
  }
  return map;
}

function toItem(a: Agg): DiffItem {
  return {
    manufacturer: a.manufacturer,
    model: a.model,
    qty: a.qty,
    locations: a.locations,
    tier: a.tier,
  };
}

const byModel = (a: { model: string }, b: { model: string }) =>
  a.model.localeCompare(b.model);

/** Compare "mine" (the D-Tools BOM) against "theirs" (the client/vendor list). */
export function compareBoms(mine: BomDoc, theirs: BomDoc): CompareResult {
  const a = aggregate(mine);
  const b = aggregate(theirs);

  const missing: DiffItem[] = [];
  const extra: DiffItem[] = [];
  const qtyMismatch: QtyDiff[] = [];
  const matched: DiffItem[] = [];

  for (const [key, t] of b) {
    if (!a.has(key)) missing.push(toItem(t));
  }
  for (const [key, m] of a) {
    const t = b.get(key);
    if (!t) {
      extra.push(toItem(m));
    } else if (m.qty === t.qty) {
      matched.push(toItem(m));
    } else {
      qtyMismatch.push({
        manufacturer: m.manufacturer,
        model: m.model,
        mineQty: m.qty,
        theirsQty: t.qty,
        locations: m.locations,
        tier: m.tier,
      });
    }
  }

  missing.sort(byModel);
  extra.sort(byModel);
  matched.sort(byModel);
  qtyMismatch.sort(byModel);

  return { missing, extra, qtyMismatch, matched };
}

/** Split rows into headline (real equipment) vs accessory (cables/mounts/etc.). */
export function splitTier<T extends { tier: AccessoryTier }>(rows: T[]): {
  hero: T[];
  accessories: T[];
} {
  const hero: T[] = [];
  const accessories: T[] = [];
  for (const r of rows) (isAccessoryTier(r.tier) ? accessories : hero).push(r);
  return { hero, accessories };
}
