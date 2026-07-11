// Labor & Travel estimating engine — pure TypeScript port of the
// QUOTENUM-LaborEstimate v6.79 workbook ("Project Details" sheet math).
// Every formula replicates the workbook exactly, including Excel
// CEILING/FLOOR/ROUND/ROUNDUP semantics and NETWORKDAYS day counting.
// Cell references in comments point at the source workbook.
//
// No UI, no AI, no I/O — callers pass inputs and get a full estimate back.

import catalogJson from './catalog.json';
import ratesJson from './rates.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CatalogItem {
  section: string;
  id: string;
  name: string;
  unitHrs: number;
  note?: string;
}

export type RateId =
  | 'PM' | 'PM_PREM' | 'PC'
  | 'ENG' | 'ENG_PREM' | 'CAD' | 'CAD_PREM' | 'IT' | 'IT_PREM'
  | 'PROG' | 'PROG_PREM'
  | 'FE_IH' | 'FE_IH_PREM' | 'FE_OS' | 'FE_OS_PREM'
  | 'FE_TRAIN' | 'FE_TRAIN_PREM' | 'FE_EVENT' | 'FE_EVENT_PREM'
  | 'INSTALL_IH' | 'INSTALL_IH_PREM' | 'INSTALL_OS' | 'INSTALL_OS_PREM'
  | 'LEAD_IH' | 'LEAD_IH_PREM' | 'LEAD_OS' | 'LEAD_OS_PREM'
  | 'WL' | 'WL_PREM'
  | 'EXPENSES';

export interface Rate {
  id: RateId;
  description: string;
  price: number;
  cost: number;
}

export interface ExpenseConstants {
  airfarePerRoundTrip: number;
  vanPerMile: number;
  carRentalPerDay: number;
  perDiemPerDay: number;
  lodgingPerNight: number;
  miscPerUnit: number;
}

/** Workbook "Adjust" column pattern: value = override ?? auto. */
export interface Adjusted {
  auto: number;
  override?: number;
  value: number;
}

export interface RoomItem {
  catalogId: string;
  qty: number;
  /** "Unit Adj" column on the room sheet — replaces the catalog unitHrs. */
  unitHrsOverride?: number;
}

export interface RoomEstimate {
  name: string;
  items: RoomItem[];
  /** Room sheet H5, default 1. */
  difficulty?: number;
  /** Room sheet H6 "# of Identical Rooms/Systems", default 1. */
  identicalCount?: number;
}

export interface PhaseSchedule {
  /** ISO date (yyyy-mm-dd). Missing start or end => 0 work days. */
  start?: string;
  end?: string;
  crewSize: number;
}

/** Keys for the workbook's J-column "Hours/Qty Adjust" overrides. */
export type LaborLineKey =
  | 'engineering' | 'engineeringPrem' | 'cad' | 'cadPrem' | 'itProg'
  | 'engTravel' | 'pm' | 'pc' | 'pmTravel'
  | 'progControl' | 'progControlPrem' | 'progDsp' | 'progDspPrem'
  | 'wirelistingStd' | 'wirelistingPrem'
  | 'leadInHouse' | 'leadInHousePrem' | 'installInHouse' | 'installInHousePrem'
  | 'feInHouseCommissioning' | 'feInHouseCommissioningPrem'
  | 'leadSiteVisit' | 'leadSiteVisitTravel'
  | 'leadOnSite' | 'leadOnSitePrem' | 'installOnSite' | 'installOnSitePrem'
  | 'leadOnSiteTravel' | 'installOnSiteTravel'
  | 'feOnSiteCommissioning' | 'feOnSiteCommissioningPrem' | 'feOnSiteTravel'
  | 'training' | 'trainingPrem' | 'trainingTravel'
  | 'eventSupport' | 'eventSupportPrem' | 'eventSupportTravel';

export type DerivedKey = 'fieldLeadSiteVisitTrips' | 'fieldLeadSiteVisitDays' | 'onSiteVanMiles';

export interface ProjectInputs {
  numDrawings: number;
  isBroadcast: boolean;
  wirelisting: PhaseSchedule;
  inHouse: PhaseSchedule;
  onSite: PhaseSchedule;
  engTripsToSite: number;
  /** "Engineering Days On-Site Total" (F36), default 0. */
  engDaysOnSite?: number;
  pmTripsToSite: number;
  /** "PM Days On-Site Total" (F38), default 0. */
  pmDaysOnSite?: number;
  travelTimeOneWayHrs: number;
  projectDistanceInitialMi: number;
  projectDistanceDailyMi: number;
  trainings: { sessions: number; hoursEach: number };
  events: { count: number; daysEach: number; crewSize: number };
  /** "Is Field Engineer Required?" (L25), default true. */
  isFieldEngRequired?: boolean;
  /** "Alpha Van" (O28) + "# of Vans" (O29); default disabled. */
  van?: { enabled: boolean; count: number };
  /** Sub-quoted flags (D20/F20/I20/O25), default false ("No"). */
  subQuotedWirelisting?: boolean;
  subQuotedInHouseBuild?: boolean;
  subQuotedOnSiteBuild?: boolean;
  subQuotedFieldEng?: boolean;
  /** The workbook's J-column manual adjustments. */
  overrides?: Partial<Record<LaborLineKey | DerivedKey, number>>;
}

export interface LaborLine {
  key: LaborLineKey;
  /** Source cell on "Project Details" (G column holds hours). */
  cell: string;
  rateId: RateId;
  description: string;
  hours: Adjusted;
  unitCost: number;
  extCost: number;
}

export interface ExpenseLine {
  key: string;
  cell: string;
  description: string;
  qty: Adjusted;
  unitCost: number;
  extCost: number;
}

export interface DerivedValues {
  wirelistingWorkDays: number;      // D23
  inHouseWorkDays: number;          // F23
  onSiteWorkDays: number;           // I23
  wirelistingStdHrsAvail: number;   // D25
  inHouseStdHrsAvail: number;       // F25
  onSiteStdHrsAvail: number;        // I25
  wirelistingTotalHrs: number;      // L21
  inHouseInstallTotalHrs: number;   // L22
  onSiteInstallTotalHrs: number;    // L23
  wirelistingPremHrsReq: number;    // D29
  inHousePremHrsReq: number;        // D30
  onSitePremHrsReq: number;         // D31
  trainingHoursTotal: number;       // F30
  eventSupportHoursTotal: number;   // I31
  isProjectLocal: boolean;          // I36
  percentInHouse: number;           // named PercentInHouse (NaN-safe: 0 when no availability)
  fieldLeadSiteVisitTrips: Adjusted; // I37
  fieldLeadSiteVisitDays: Adjusted;  // I38
  vanMiles: Adjusted;               // O30
}

export interface RollupEntry {
  rateId: RateId;
  hours: number;
  extCost: number;
}

export interface ProjectEstimate {
  rooms: { name: string; hours: number }[];
  laborSheetTotalHours: number;     // O13
  derived: DerivedValues;
  lines: LaborLine[];
  expenses: ExpenseLine[];
  rollup: RollupEntry[];
  totals: {
    laborHours: number;   // G55+G81+G87+G108+G150+G169+G186 equivalents
    laborCost: number;
    expenseCost: number;
    grandTotal: number;   // labor + expenses ext cost
  };
}

// ---------------------------------------------------------------------------
// Data (hardcoded JSON in this pass; Supabase later)
// ---------------------------------------------------------------------------

export const CATALOG: CatalogItem[] = catalogJson.items as CatalogItem[];
export const RATES: Rate[] = ratesJson.rates as Rate[];
export const EXPENSE_CONSTANTS: ExpenseConstants = {
  airfarePerRoundTrip: ratesJson.expenseConstants.airfarePerRoundTrip,
  vanPerMile: ratesJson.expenseConstants.vanPerMile,
  carRentalPerDay: ratesJson.expenseConstants.carRentalPerDay,
  perDiemPerDay: ratesJson.expenseConstants.perDiemPerDay,
  lodgingPerNight: ratesJson.expenseConstants.lodgingPerNight,
  miscPerUnit: ratesJson.expenseConstants.miscPerUnit,
};

// ---------------------------------------------------------------------------
// Excel-equivalent primitives
// ---------------------------------------------------------------------------

/** Excel CEILING(x, significance) for non-negative x and positive significance. */
export function excelCeiling(x: number, significance: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x === 0) return 0;
  return Math.ceil(x / significance) * significance;
}

/** Excel FLOOR(x, significance) for non-negative x and positive significance. */
export function excelFloor(x: number, significance: number): number {
  if (!Number.isFinite(x)) return NaN;
  return Math.floor(x / significance) * significance;
}

/** Excel ROUND(x, 0): half away from zero. */
export function excelRound0(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/** Excel ROUNDUP(x, 0): away from zero. */
export function excelRoundUp0(x: number): number {
  return Math.sign(x) * Math.ceil(Math.abs(x));
}

/** IFERROR(x, 0) equivalent for NaN/Infinity from divide-by-zero. */
function ifError0(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

/**
 * Excel NETWORKDAYS(start, end): weekdays (Mon-Fri) inclusive of both
 * endpoints; negative when start > end. Missing dates => 0 (the workbook
 * wraps NETWORKDAYS in IFERROR against its "-" placeholder).
 */
export function networkdays(startISO?: string, endISO?: string): number {
  if (!startISO || !endISO) return 0;
  const start = parseIsoDate(startISO);
  const end = parseIsoDate(endISO);
  if (start === null || end === null) return 0;
  const sign = start <= end ? 1 : -1;
  const [lo, hi] = start <= end ? [start, end] : [end, start];
  let count = 0;
  for (let t = lo; t <= hi; t += 86400000) {
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return sign * count;
}

function parseIsoDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function adjusted(auto: number, override?: number): Adjusted {
  return { auto, override, value: override ?? auto };
}

// ---------------------------------------------------------------------------
// Room math (room sheet H7 = H4 * H5 * H6)
// ---------------------------------------------------------------------------

export function computeRoomHours(room: RoomEstimate, catalog: CatalogItem[] = CATALOG): number {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  let subtotal = 0; // H4 = SUM(Ext Hrs)
  for (const item of room.items) {
    const cat = byId.get(item.catalogId);
    if (!cat) throw new Error(`Unknown catalog id: ${item.catalogId}`);
    const unit = item.unitHrsOverride ?? cat.unitHrs;
    subtotal += item.qty * unit;
  }
  return subtotal * (room.difficulty ?? 1) * (room.identicalCount ?? 1);
}

// ---------------------------------------------------------------------------
// Project math
// ---------------------------------------------------------------------------

export function computeProjectEstimate(
  rooms: RoomEstimate[],
  inputs: ProjectInputs,
  catalog: CatalogItem[] = CATALOG,
  rates: Rate[] = RATES,
  expenseConstants: ExpenseConstants = EXPENSE_CONSTANTS,
): ProjectEstimate {
  const ov = inputs.overrides ?? {};
  const roomResults = rooms.map((r) => ({ name: r.name, hours: computeRoomHours(r, catalog) }));
  const laborSheetTotalHours = roomResults.reduce((s, r) => s + r.hours, 0); // O13

  const T = inputs.travelTimeOneWayHrs;
  const numDwg = inputs.numDrawings;
  const engDaysOnSite = inputs.engDaysOnSite ?? 0;
  const pmDaysOnSite = inputs.pmDaysOnSite ?? 0;
  const isFieldEng = inputs.isFieldEngRequired ?? true;
  const subWL = inputs.subQuotedWirelisting ?? false;
  const subIH = inputs.subQuotedInHouseBuild ?? false;
  const subOS = inputs.subQuotedOnSiteBuild ?? false;
  const subFE = inputs.subQuotedFieldEng ?? false;

  // Schedule-driven availability (D23/F23/I23, D25/F25/I25)
  const wlDays = networkdays(inputs.wirelisting.start, inputs.wirelisting.end);
  const ihDays = networkdays(inputs.inHouse.start, inputs.inHouse.end);
  const osDays = networkdays(inputs.onSite.start, inputs.onSite.end);
  const wlAvail = Math.max(0, wlDays * inputs.wirelisting.crewSize * 8);
  const ihAvail = Math.max(0, ihDays * inputs.inHouse.crewSize * 8);
  const osAvail = Math.max(0, osDays * inputs.onSite.crewSize * 8);

  // Phase hour totals (L21/L22/L23) — each independently CEILINGed to 4
  const wlTotal = ifError0(excelCeiling(numDwg * 1.5, 4));
  const ihTotal = ifError0(excelCeiling((ihAvail / (ihAvail + osAvail)) * laborSheetTotalHours, 4));
  const osTotal = ifError0(excelCeiling((osAvail / (ihAvail + osAvail)) * laborSheetTotalHours, 4));

  // Premium hours required by schedule (D29/D30/D31)
  const wlPremReq = Math.max(0, wlTotal - wlAvail);
  const ihPremReq = Math.max(0, ihTotal - ihAvail);
  const osPremReq = Math.max(0, osTotal - osAvail);

  const trainingHoursTotal = inputs.trainings.sessions * inputs.trainings.hoursEach; // F30
  const eventHoursTotal =
    inputs.events.count * inputs.events.daysEach * inputs.events.crewSize * 8; // I31

  const isLocal = T * 2 <= 4; // I36

  // Field lead pre-install site visits (I37/I38)
  const fieldLeadTrips = adjusted(
    (isLocal && osTotal > 180) || (!isLocal && osTotal > 240) ? 1 : 0,
    ov.fieldLeadSiteVisitTrips,
  );
  const fieldLeadDays = adjusted(
    isLocal ? fieldLeadTrips.value * 1 : fieldLeadTrips.value * 3,
    ov.fieldLeadSiteVisitDays,
  );

  // Van miles (O30): ROUNDUP(((initial*2) + ((onSiteWorkDays*daily)*2)) * vans * 1.1, 0)
  const vanEnabled = inputs.van?.enabled ?? false;
  const vanCount = inputs.van?.count ?? 0;
  const vanMiles = adjusted(
    vanEnabled
      ? excelRoundUp0(
          ((inputs.projectDistanceInitialMi * 2) + ((osDays * inputs.projectDistanceDailyMi) * 2)) *
            vanCount * 1.1,
        )
      : 0,
    ov.onSiteVanMiles,
  );

  // PercentInHouse = InHouseStdAvail / (InHouseStdAvail + OnSiteStdAvail)
  const pctIH = ihAvail / (ihAvail + osAvail); // may be NaN; FE formulas wrap in IFERROR
  const feCurve = Math.pow(pctIH, 3.3219) - 0.1 * pctIH + 0.1;

  const rateCost = new Map(rates.map((r) => [r.id, r.cost]));
  const lines: LaborLine[] = [];
  const line = (key: LaborLineKey, cell: string, rateId: RateId, description: string, auto: number) => {
    const hours = adjusted(auto, ov[key]);
    const unitCost = rateCost.get(rateId) ?? 0;
    const l: LaborLine = { key, cell, rateId, description, hours, unitCost, extCost: hours.value * unitCost };
    lines.push(l);
    return l;
  };

  // --- Project Management & Engineering labor (G46..G54) ---
  const eng = line('engineering', 'G46', 'ENG', 'Engineering',
    excelCeiling(numDwg * (inputs.isBroadcast ? 3.5 : 1.5) + engDaysOnSite * 8, 4));
  const engPrem = line('engineeringPrem', 'G47', 'ENG_PREM', 'Engineering (premium)', 0);
  const cad = line('cad', 'G48', 'CAD', 'Drafting', excelCeiling(numDwg * 2.5, 4));
  const cadPrem = line('cadPrem', 'G49', 'CAD_PREM', 'Drafting (premium)', 0);
  const itProg = line('itProg', 'G50', 'IT', 'IT Engineering & Programming',
    excelRound0((eng.hours.value + engPrem.hours.value) * 0.1));
  line('engTravel', 'G51', 'ENG', 'Eng/IT - Travel Time',
    excelCeiling(inputs.engTripsToSite * T * 2, 1));

  // --- In-House Installation labor (G69..G80) ---
  const progControl = line('progControl', 'G69', 'PROG', 'Programming - Control Systems', 0);
  const progControlPrem = line('progControlPrem', 'G70', 'PROG_PREM', 'Programming - Control Systems (premium)', 0);
  const progDsp = line('progDsp', 'G71', 'PROG', 'Programming - DSP/Other', 0);
  const progDspPrem = line('progDspPrem', 'G72', 'PROG_PREM', 'Programming - DSP/Other (premium)', 0);
  line('wirelistingStd', 'G73', 'WL', 'Wirelisting',
    !subWL ? wlTotal - wlPremReq : 0);
  line('wirelistingPrem', 'G74', 'WL_PREM', 'Wirelisting (premium)',
    !subWL ? excelCeiling(wlPremReq, 4) : 0);
  const leadIH = line('leadInHouse', 'G75', 'LEAD_IH', 'Lead In-House Install, Rack Build, and Prep',
    !subIH && ihDays !== 0 ? ihTotal / inputs.inHouse.crewSize : 0);
  line('leadInHousePrem', 'G76', 'LEAD_IH_PREM', 'Lead In-House Install (premium)',
    !subIH && ihPremReq > 0 ? excelCeiling(ihPremReq / inputs.inHouse.crewSize, 4) : 0);
  line('installInHouse', 'G77', 'INSTALL_IH', 'In-House Install, Rack Build, and Prep',
    !subIH && inputs.inHouse.crewSize > 1 ? ihTotal - leadIH.hours.value : 0);
  line('installInHousePrem', 'G78', 'INSTALL_IH_PREM', 'In-House Install (premium)',
    !subIH && ihPremReq > 0
      ? excelCeiling((ihPremReq / inputs.inHouse.crewSize) * (inputs.inHouse.crewSize - 1), 4)
      : 0);
  const feIH = line('feInHouseCommissioning', 'G79', 'FE_IH', 'In-House Testing and Commissioning',
    ifError0(!subFE ? excelCeiling(isFieldEng ? (numDwg * 3.75) * feCurve : 0, 2) : 0));
  const feIHPrem = line('feInHouseCommissioningPrem', 'G80', 'FE_IH_PREM', 'In-House Testing and Commissioning (premium)', 0);

  // --- On-Site Lead Pre-Install Site Visit (G85..G86) ---
  const leadVisit = line('leadSiteVisit', 'G85', 'LEAD_OS', 'Lead Site Visit (Pre Install)',
    !subOS && fieldLeadTrips.value !== 0 ? fieldLeadDays.value * 8 + T * 2 : 0);
  const leadVisitTravel = line('leadSiteVisitTravel', 'G86', 'LEAD_OS', 'Lead Site Visit - Travel Time', 0);

  // --- On-Site Installation labor (G102..G107) ---
  const leadOS = line('leadOnSite', 'G102', 'LEAD_OS', 'Lead On-Site Installation',
    !subOS && osDays !== 0 ? osTotal / inputs.onSite.crewSize : 0);
  line('leadOnSitePrem', 'G103', 'LEAD_OS_PREM', 'Lead On-Site Installation (premium)',
    !subOS && osPremReq > 0 && inputs.onSite.crewSize > 0
      ? excelCeiling(osPremReq / inputs.onSite.crewSize, 4)
      : 0);
  // Workbook quirk preserved: G104's guard checks SubQuotedInHouseBuild, not OnSite.
  line('installOnSite', 'G104', 'INSTALL_OS', 'On-Site Installation',
    !subIH && inputs.onSite.crewSize > 1 ? osTotal - leadOS.hours.value : 0);
  line('installOnSitePrem', 'G105', 'INSTALL_OS_PREM', 'On-Site Installation (premium)',
    !subOS && osPremReq > 0
      ? excelCeiling((osPremReq / inputs.onSite.crewSize) * (inputs.onSite.crewSize - 1), 4)
      : 0);
  line('leadOnSiteTravel', 'G106', 'LEAD_OS', 'Lead On-Site Install - Travel Time',
    isLocal
      ? excelCeiling(excelRoundUp0(osDays) * T * 2 + fieldLeadTrips.value * T * 2, 1)
      : excelCeiling(excelRoundUp0(osDays / 10) * T * 2 + fieldLeadTrips.value * T * 2, 1));
  line('installOnSiteTravel', 'G107', 'INSTALL_OS', 'On-Site Install - Travel Time',
    inputs.onSite.crewSize > 1
      ? (isLocal
          ? excelCeiling(excelRoundUp0(osDays) * (inputs.onSite.crewSize - 1) * T * 2, 1)
          : excelCeiling(excelRoundUp0(osDays / 10) * (inputs.onSite.crewSize - 1) * T * 2, 1))
      : 0);

  // --- On-Site Field Engineer labor (G143..G149; unused rows default 0) ---
  const feOS = line('feOnSiteCommissioning', 'G145', 'FE_OS', 'On-Site FE Testing and Commissioning',
    ifError0(!subFE ? excelCeiling(isFieldEng ? (numDwg * 3.75) * (1 - feCurve) : 0, 2) : 0));
  const feOSPrem = line('feOnSiteCommissioningPrem', 'G146', 'FE_OS_PREM', 'On-Site FE Testing and Commissioning (premium)', 0);
  const feOSTravel = line('feOnSiteTravel', 'G149', 'FE_OS', 'On-Site FE - Travel Time', 0);

  // --- Training labor (G165..G168) ---
  line('training', 'G165', 'FE_TRAIN', 'Training', excelCeiling(trainingHoursTotal, 1));
  line('trainingPrem', 'G166', 'FE_TRAIN_PREM', 'Training (premium)', 0);
  line('trainingTravel', 'G168', 'FE_TRAIN', 'Training - Travel Time', 0);

  // --- Event Support labor (G183..G185) ---
  line('eventSupport', 'G183', 'FE_EVENT', 'Event Support', excelCeiling(eventHoursTotal, 1));
  line('eventSupportPrem', 'G184', 'FE_EVENT_PREM', 'Event Support (premium)', 0);
  line('eventSupportTravel', 'G185', 'FE_EVENT', 'Event Support - Travel Time', 0);

  // --- Project Management (G52) — sums the field/training/event hours plus
  //     G46:G50, G69:G72, G79:G80, G85:G86, G143:G149, then *0.1 + PM days*8,
  //     CEILING to 4. Computed after its inputs so post-adjust values flow in.
  const pmBasis =
    wlTotal + ihTotal + osTotal + trainingHoursTotal + eventHoursTotal +
    eng.hours.value + engPrem.hours.value + cad.hours.value + cadPrem.hours.value + itProg.hours.value +
    progControl.hours.value + progControlPrem.hours.value + progDsp.hours.value + progDspPrem.hours.value +
    feIH.hours.value + feIHPrem.hours.value +
    leadVisit.hours.value + leadVisitTravel.hours.value +
    feOS.hours.value + feOSPrem.hours.value + feOSTravel.hours.value;
  const pm = line('pm', 'G52', 'PM', 'Project Management',
    excelCeiling(pmBasis * 0.1 + pmDaysOnSite * 8, 4));
  line('pc', 'G53', 'PC', 'Project Coordinator', excelFloor(pm.hours.value * 0.125, 1));
  line('pmTravel', 'G54', 'PM', 'PM - Travel Time', excelCeiling(inputs.pmTripsToSite * T * 2, 1));

  // --- Expenses (only the van-miles line auto-populates; G113) ---
  const expenses: ExpenseLine[] = [
    {
      key: 'onSiteVanMiles',
      cell: 'G113',
      description: 'On-Site Install Van (miles)',
      qty: vanMiles,
      unitCost: expenseConstants.vanPerMile,
      extCost: vanMiles.value * expenseConstants.vanPerMile,
    },
  ];

  // --- Rollup per rate id + grand totals ---
  const rollupMap = new Map<RateId, RollupEntry>();
  for (const l of lines) {
    const entry = rollupMap.get(l.rateId) ?? { rateId: l.rateId, hours: 0, extCost: 0 };
    entry.hours += l.hours.value;
    entry.extCost += l.extCost;
    rollupMap.set(l.rateId, entry);
  }
  const expenseCost = expenses.reduce((s, e) => s + e.extCost, 0);
  if (expenseCost !== 0) {
    rollupMap.set('EXPENSES', { rateId: 'EXPENSES', hours: 0, extCost: expenseCost });
  }
  const rollup = [...rollupMap.values()];
  const laborHours = lines.reduce((s, l) => s + l.hours.value, 0);
  const laborCost = lines.reduce((s, l) => s + l.extCost, 0);

  return {
    rooms: roomResults,
    laborSheetTotalHours,
    derived: {
      wirelistingWorkDays: wlDays,
      inHouseWorkDays: ihDays,
      onSiteWorkDays: osDays,
      wirelistingStdHrsAvail: wlAvail,
      inHouseStdHrsAvail: ihAvail,
      onSiteStdHrsAvail: osAvail,
      wirelistingTotalHrs: wlTotal,
      inHouseInstallTotalHrs: ihTotal,
      onSiteInstallTotalHrs: osTotal,
      wirelistingPremHrsReq: wlPremReq,
      inHousePremHrsReq: ihPremReq,
      onSitePremHrsReq: osPremReq,
      trainingHoursTotal,
      eventSupportHoursTotal: eventHoursTotal,
      isProjectLocal: isLocal,
      percentInHouse: Number.isFinite(pctIH) ? pctIH : 0,
      fieldLeadSiteVisitTrips: fieldLeadTrips,
      fieldLeadSiteVisitDays: fieldLeadDays,
      vanMiles,
    },
    lines,
    expenses,
    rollup,
    totals: {
      laborHours,
      laborCost,
      expenseCost,
      grandTotal: laborCost + expenseCost,
    },
  };
}
