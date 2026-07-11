// Services view (LT.2e) — pure presentation mapping of the engine's
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

export interface ServiceRates {
  installPerDay: number;
  designPerHr: number;
  cadPerHr: number;
  programmingPerHr: number;
  commissioningPerHr: number;
  pmPerHr: number;
}

export const SERVICE_RATES: ServiceRates = {
  installPerDay: ratesJson.serviceRates.installPerDay,
  designPerHr: ratesJson.serviceRates.designPerHr,
  cadPerHr: ratesJson.serviceRates.cadPerHr,
  programmingPerHr: ratesJson.serviceRates.programmingPerHr,
  commissioningPerHr: ratesJson.serviceRates.commissioningPerHr,
  pmPerHr: ratesJson.serviceRates.pmPerHr,
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
/** Optional 9th column when the travel-handling mode is "column". */
export type ServiceCol = ServiceColKey | 'travelHrs';

export const SERVICE_COL_LABELS: Record<ServiceCol, string> = {
  installDays: 'Install Days',
  designHrs: 'Design Hrs',
  cadHrs: 'CAD Hrs',
  programmingHrs: 'Programming Hrs',
  commissioningHrs: 'Commissioning Hrs',
  pmHrs: 'PM Hrs',
  weeklyCalls: 'Weekly Calls',
  siteSurvey: 'Site Survey',
  travelHrs: 'Travel Hrs',
};

/** How travel labor + expenses land in Services (LT.2i). */
export type ServicesTravelMode = 'exclude' | 'column' | 'average';

/** Engine lines that count as travel labor (drive hourly + fly day lines). */
export const TRAVEL_LINE_KEYS: LaborLineKey[] = [
  'engTravel', 'pmTravel', 'leadSiteVisitTravel',
  'leadOnSiteTravel', 'installOnSiteTravel', 'feOnSiteTravel',
  'trainingTravel', 'eventSupportTravel',
  'flyTravelLead', 'flyTravelTech', 'flyTravelFe', 'flyTravelPm', 'flyTravelEng',
];

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
  cells: Record<ServiceColKey, Adjusted> & Partial<Record<'travelHrs', Adjusted>>;
}

export interface ServicesTable {
  /** Render/copy order; includes 'travelHrs' only in "column" mode. */
  columns: ServiceCol[];
  rows: ServiceRow[];
  /** Column sums of post-override values. */
  totals: Record<ServiceColKey, number> & Partial<Record<'travelHrs', number>>;
  /** Ext. dollars per priced role (qty columns carry none). */
  dollars: Record<
    'installDays' | 'designHrs' | 'cadHrs' | 'programmingHrs' | 'commissioningHrs' | 'pmHrs',
    number
  > &
    Partial<Record<'travelHrs', number>>;
  /** Travel rollup for the reference block, whatever the mode. */
  travel: {
    mode: ServicesTravelMode;
    laborHours: number;
    laborCost: number;
    expenseCost: number;
  };
  grandTotal: number;
}

export type ServiceOverrides = Partial<Record<string, number>>;

export function serviceOverrideKey(roomId: string, col: ServiceCol): string {
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
  rates: ServiceRates = SERVICE_RATES,
  travelMode: ServicesTravelMode = 'exclude',
): ServicesTable {
  const lineHours = new Map(estimate.lines.map((l) => [l.key, l.hours.value]));
  const roleTotal = (keys: LaborLineKey[]) =>
    keys.reduce((s, k) => s + (lineHours.get(k) ?? 0), 0);

  const hours = rooms.map((r) => r.hours);
  const allocations: Partial<Record<ServiceColKey, number[]>> = {};
  for (const [col, keys] of Object.entries(ROLE_LINES) as [ServiceColKey, LaborLineKey[]][]) {
    allocations[col] = allocate(roleTotal(keys), hours);
  }

  // Travel rollups (LT.2i): labor from the travel line keys (drive hourly
  // lines + fly day lines), expenses from ALL expense lines. Allocated
  // across rooms like every other role.
  const travelLaborHours = roleTotal(TRAVEL_LINE_KEYS);
  const travelLaborCost = estimate.lines
    .filter((l) => TRAVEL_LINE_KEYS.includes(l.key))
    .reduce((s, l) => s + l.extCost, 0);
  const travelExpenseCost = estimate.totals.expenseCost;
  const travelAlloc = allocate(travelLaborHours, hours);

  const rows: ServiceRow[] = rooms.map((room, i) => {
    const cell = (col: ServiceCol, auto: number): Adjusted => {
      const override = overrides[serviceOverrideKey(room.id, col)];
      return { auto, override, value: override ?? auto };
    };
    // "average" folds each room's travel share into its install basis;
    // Install Days stay ROUNDUP to nearest 0.5 either way.
    const installBasis =
      room.hours + (travelMode === 'average' ? travelAlloc[i] : 0);
    const cells: ServiceRow['cells'] = {
      installDays: cell('installDays', excelCeiling(installBasis / 8, 0.5)),
      designHrs: cell('designHrs', allocations.designHrs![i]),
      cadHrs: cell('cadHrs', allocations.cadHrs![i]),
      programmingHrs: cell('programmingHrs', allocations.programmingHrs![i]),
      commissioningHrs: cell('commissioningHrs', allocations.commissioningHrs![i]),
      pmHrs: cell('pmHrs', allocations.pmHrs![i]),
      weeklyCalls: cell('weeklyCalls', 0),
      siteSurvey: cell('siteSurvey', 0),
    };
    if (travelMode === 'column') {
      cells.travelHrs = cell('travelHrs', travelAlloc[i]);
    }
    return { roomId: room.id, roomName: room.name, cells };
  });

  const columns: ServiceCol[] =
    travelMode === 'column' ? [...SERVICE_COLS, 'travelHrs'] : [...SERVICE_COLS];

  const totals = Object.fromEntries(
    columns.map((col) => [
      col,
      round2(rows.reduce((s, r) => s + (r.cells[col]?.value ?? 0), 0)),
    ]),
  ) as ServicesTable['totals'];

  const dollars: ServicesTable['dollars'] = {
    installDays: totals.installDays * rates.installPerDay,
    designHrs: totals.designHrs * rates.designPerHr,
    cadHrs: totals.cadHrs * rates.cadPerHr,
    programmingHrs: totals.programmingHrs * rates.programmingPerHr,
    commissioningHrs: totals.commissioningHrs * rates.commissioningPerHr,
    pmHrs: totals.pmHrs * rates.pmPerHr,
  };
  // Travel column is billed at the install day rate (hours/8 x $day).
  if (travelMode === 'column') {
    dollars.travelHrs = ((totals.travelHrs ?? 0) / 8) * rates.installPerDay;
  }

  const roleDollars =
    dollars.installDays + dollars.designHrs + dollars.cadHrs +
    dollars.programmingHrs + dollars.commissioningHrs + dollars.pmHrs;
  const grandTotal =
    travelMode === 'exclude'
      ? roleDollars
      : travelMode === 'column'
        ? roleDollars + (dollars.travelHrs ?? 0) + travelExpenseCost
        : roleDollars + travelExpenseCost; // "average": travel labor is inside installDays

  return {
    columns,
    rows,
    totals,
    dollars,
    travel: {
      mode: travelMode,
      laborHours: travelLaborHours,
      laborCost: travelLaborCost,
      expenseCost: travelExpenseCost,
    },
    grandTotal,
  };
}

/**
 * TSV of the per-room rows in exactly the N..U column order, values only,
 * no headers and no room names — shaped to paste at Services!N4. The
 * travel column (mode "column" only) is appended after Site Survey and
 * ONLY when explicitly requested — the BOM sheet expects the N..U shape.
 */
export function servicesToTsv(table: ServicesTable, includeTravelColumn = false): string {
  const cols: ServiceCol[] =
    includeTravelColumn && table.columns.includes('travelHrs')
      ? [...SERVICE_COLS, 'travelHrs']
      : [...SERVICE_COLS];
  return table.rows
    .map((r) => cols.map((col) => String(r.cells[col]?.value ?? 0)).join('\t'))
    .join('\n');
}
