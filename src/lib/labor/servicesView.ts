// EOS Services view (LT.2e) — pure presentation mapping of the engine's
// output into the D-Tools Services-tab shape: one row per room, columns
// N-U (Install Days, Design, CAD, Programming, Commissioning, PM, Weekly
// Calls, Site Survey). No new estimating math lives here: the only
// percents in the system (PM 10%, the FE commissioning curve) are already
// applied inside engine.ts — this module ALLOCATES the engine's
// project-level role totals across rooms proportional to each room's
// labor-sheet hours, and that's all.
//
// Rounding contract: allocated cells round to 2 dp and the LAST room
// absorbs the remainder, so column totals always equal the engine totals
// exactly (no rounding leakage).

import ratesJson from './rates.json';
import type { Adjusted, LaborLineKey, ProjectEstimate } from './engine';
import { excelCeiling } from './engine';

export interface EosRates {
  installPerDay: number;
  designPerHr: number;
  cadPerHr: number;
  programmingPerHr: number;
  commissioningPerHr: number;
  pmPerHr: number;
}

export const EOS_RATES: EosRates = {
  installPerDay: ratesJson.eosRates.installPerDay,
  designPerHr: ratesJson.eosRates.designPerHr,
  cadPerHr: ratesJson.eosRates.cadPerHr,
  programmingPerHr: ratesJson.eosRates.programmingPerHr,
  commissioningPerHr: ratesJson.eosRates.commissioningPerHr,
  pmPerHr: ratesJson.eosRates.pmPerHr,
};

/** Services-tab columns N..U, in paste order. */
export const SERVICE_COLS = [
  'installDays',
  'designHrs',
  'cadHrs',
  'programmingHrs',
  'commissioningHrs',
  'pmHrs',
  'weeklyCalls',
  'siteSurvey',
] as const;
export type ServiceColKey = (typeof SERVICE_COLS)[number];

export const SERVICE_COL_LABELS: Record<ServiceColKey, string> = {
  installDays: 'Install Days',
  designHrs: 'Design Hrs',
  cadHrs: 'CAD Hrs',
  programmingHrs: 'Programming Hrs',
  commissioningHrs: 'Commissioning Hrs',
  pmHrs: 'PM Hrs',
  weeklyCalls: 'Weekly Calls',
  siteSurvey: 'Site Survey',
};

/** Which engine lines feed each allocated role bucket. */
const ROLE_LINES: Record<
  Exclude<ServiceColKey, 'installDays' | 'weeklyCalls' | 'siteSurvey'>,
  LaborLineKey[]
> = {
  designHrs: ['engineering', 'engineeringPrem'],
  cadHrs: ['cad', 'cadPrem'],
  programmingHrs: ['itProg', 'progControl', 'progControlPrem', 'progDsp', 'progDspPrem'],
  commissioningHrs: [
    'feInHouseCommissioning',
    'feInHouseCommissioningPrem',
    'feOnSiteCommissioning',
    'feOnSiteCommissioningPrem',
  ],
  pmHrs: ['pm', 'pc'],
};

export interface ServicesRoomInput {
  /** Stable UI id — override keys are `${id}.${col}`. */
  id: string;
  name: string;
  /** Room labor-sheet hours (engine room H7) — the allocation basis. */
  hours: number;
}

export interface ServiceRow {
  roomId: string;
  roomName: string;
  cells: Record<ServiceColKey, Adjusted>;
}

export interface ServicesTable {
  rows: ServiceRow[];
  /** Column sums of post-override values. */
  totals: Record<ServiceColKey, number>;
  /** Ext. dollars per priced role (qty columns carry none). */
  dollars: Record<
    'installDays' | 'designHrs' | 'cadHrs' | 'programmingHrs' | 'commissioningHrs' | 'pmHrs',
    number
  >;
  grandTotal: number;
}

export type ServiceOverrides = Partial<Record<string, number>>;

export function serviceOverrideKey(roomId: string, col: ServiceColKey): string {
  return `${roomId}.${col}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Allocate a project-level total across rooms proportional to room hours,
 * 2-dp rounded, last room absorbing the remainder so the column sums to
 * `total` exactly. Zero total room hours => everything lands on the last
 * room (degenerate but leak-free).
 */
function allocate(total: number, roomHours: number[]): number[] {
  const basis = roomHours.reduce((s, h) => s + h, 0);
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < roomHours.length; i++) {
    if (i === roomHours.length - 1) {
      out.push(round2(total - allocated));
    } else {
      const share = basis > 0 ? round2(total * (roomHours[i] / basis)) : 0;
      out.push(share);
      allocated += share;
    }
  }
  return out;
}

export function computeServicesTable(
  rooms: ServicesRoomInput[],
  estimate: ProjectEstimate,
  overrides: ServiceOverrides = {},
  rates: EosRates = EOS_RATES,
): ServicesTable {
  const lineHours = new Map(estimate.lines.map((l) => [l.key, l.hours.value]));
  const roleTotal = (keys: LaborLineKey[]) =>
    keys.reduce((s, k) => s + (lineHours.get(k) ?? 0), 0);

  const hours = rooms.map((r) => r.hours);
  const allocations: Partial<Record<ServiceColKey, number[]>> = {};
  for (const [col, keys] of Object.entries(ROLE_LINES) as [ServiceColKey, LaborLineKey[]][]) {
    allocations[col] = allocate(roleTotal(keys), hours);
  }

  const rows: ServiceRow[] = rooms.map((room, i) => {
    const cell = (col: ServiceColKey, auto: number): Adjusted => {
      const override = overrides[serviceOverrideKey(room.id, col)];
      return { auto, override, value: override ?? auto };
    };
    return {
      roomId: room.id,
      roomName: room.name,
      cells: {
        // Install Days = room hours / 8, ROUNDUP to nearest 0.5.
        installDays: cell('installDays', excelCeiling(room.hours / 8, 0.5)),
        designHrs: cell('designHrs', allocations.designHrs![i]),
        cadHrs: cell('cadHrs', allocations.cadHrs![i]),
        programmingHrs: cell('programmingHrs', allocations.programmingHrs![i]),
        commissioningHrs: cell('commissioningHrs', allocations.commissioningHrs![i]),
        pmHrs: cell('pmHrs', allocations.pmHrs![i]),
        weeklyCalls: cell('weeklyCalls', 0),
        siteSurvey: cell('siteSurvey', 0),
      },
    };
  });

  const totals = Object.fromEntries(
    SERVICE_COLS.map((col) => [
      col,
      round2(rows.reduce((s, r) => s + r.cells[col].value, 0)),
    ]),
  ) as Record<ServiceColKey, number>;

  const dollars = {
    installDays: totals.installDays * rates.installPerDay,
    designHrs: totals.designHrs * rates.designPerHr,
    cadHrs: totals.cadHrs * rates.cadPerHr,
    programmingHrs: totals.programmingHrs * rates.programmingPerHr,
    commissioningHrs: totals.commissioningHrs * rates.commissioningPerHr,
    pmHrs: totals.pmHrs * rates.pmPerHr,
  };
  const grandTotal = Object.values(dollars).reduce((s, d) => s + d, 0);

  return { rows, totals, dollars, grandTotal };
}

/**
 * TSV of the per-room rows in exactly the N..U column order, values only,
 * no headers and no room names — shaped to paste at Services!N4.
 */
export function servicesToTsv(table: ServicesTable): string {
  return table.rows
    .map((r) => SERVICE_COLS.map((col) => String(r.cells[col].value)).join('\t'))
    .join('\n');
}
