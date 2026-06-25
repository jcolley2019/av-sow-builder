import type { BomDoc } from "./types";

// Per-device install-time library + labor/travel math. TIME ONLY in labor —
// no rates or dollars anywhere here. Defaults are sensible STARTING values the
// user tunes; they are not official AVIXA figures.

export type LaborCategory =
  | "display"
  | "projector"
  | "projectorMount"
  | "ceilingSpeaker"
  | "surfaceSpeaker"
  | "ceilingMic"
  | "tableMic"
  | "wirelessMic"
  | "dsp"
  | "amplifier"
  | "codec"
  | "camera"
  | "videoSwitcher"
  | "avOverIp"
  | "control"
  | "touchPanel"
  | "rack"
  | "networkSwitch"
  | "wirelessPresentation"
  | "wallplate"
  | "other";

export const LABOR_CATEGORIES: { key: LaborCategory; label: string; hours: number }[] = [
  { key: "display", label: "Display / monitor", hours: 1.5 },
  { key: "projector", label: "Projector", hours: 3.0 },
  { key: "projectorMount", label: "Projector lift / mount", hours: 2.0 },
  { key: "ceilingSpeaker", label: "Ceiling speaker", hours: 0.5 },
  { key: "surfaceSpeaker", label: "Surface / pendant speaker", hours: 0.5 },
  { key: "ceilingMic", label: "Ceiling microphone array", hours: 1.0 },
  { key: "tableMic", label: "Table / gooseneck mic", hours: 0.5 },
  { key: "wirelessMic", label: "Wireless mic system", hours: 1.0 },
  { key: "dsp", label: "DSP / audio processor", hours: 2.0 },
  { key: "amplifier", label: "Amplifier", hours: 1.0 },
  { key: "codec", label: "Video codec / room system", hours: 2.0 },
  { key: "camera", label: "PTZ / camera", hours: 1.5 },
  { key: "videoSwitcher", label: "Video switcher / matrix", hours: 1.5 },
  { key: "avOverIp", label: "AV-over-IP encoder / decoder", hours: 0.75 },
  { key: "control", label: "Control processor", hours: 2.0 },
  { key: "touchPanel", label: "Touch panel", hours: 1.0 },
  { key: "rack", label: "Equipment rack (build)", hours: 4.0 },
  { key: "networkSwitch", label: "Network switch", hours: 1.0 },
  { key: "wirelessPresentation", label: "Wireless presentation", hours: 0.75 },
  { key: "wallplate", label: "Wallplate / floorbox / retractor", hours: 0.5 },
  { key: "other", label: "Default / other", hours: 0.5 },
];

export const CATEGORY_LABEL: Record<LaborCategory, string> = Object.fromEntries(
  LABOR_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<LaborCategory, string>;

export const DEFAULT_LABOR: Record<LaborCategory, number> = Object.fromEntries(
  LABOR_CATEGORIES.map((c) => [c.key, c.hours]),
) as Record<LaborCategory, number>;

/** Best-effort device categorization from manufacturer/model/description. */
export function categorize(item: {
  manufacturer: string;
  model: string;
  description: string;
}): LaborCategory {
  const h = `${item.manufacturer} ${item.model} ${item.description}`.toLowerCase();
  const has = (re: RegExp) => re.test(h);

  if (has(/projector\s*(lift|mount|kit)|screen\s*lift|sysauwp/)) return "projectorMount";
  if (has(/projector|powerlite|3lcd|\bvpl\b|laser projector/)) return "projector";
  if (has(/ceiling\s*(array|microphone|mic)|mxa9|\btcm\b|beamform/)) return "ceilingMic";
  if (has(/gooseneck|podium mic|lectern mic|table mic|boundary mic|mx41/)) return "tableMic";
  if (has(/wireless mic|bodypack|handheld|lavalier|\bmxw\b|ulxd|access point transceiver|mic receiver/))
    return "wirelessMic";
  if (has(/ceiling speaker|saros|in-?ceiling speaker/)) return "ceilingSpeaker";
  if (has(/speaker|loudspeaker|subwoofer|soundbar/)) return "surfaceSpeaker";
  if (has(/\bdsp\b|q-?sys core|qsys|tesira|audio processor|\bcore \d|spa-?q/)) return "dsp";
  if (has(/amplifier|power amp|\bamp\b/)) return "amplifier";
  if (has(/codec|room kit|room system|rally bar|video bar|meetup|studio bar/)) return "codec";
  if (has(/\bptz\b|camera|webcam|room vision|\bcam\b/)) return "camera";
  if (has(/matrix|switcher|dm-?md|presentation switch/)) return "videoSwitcher";
  if (has(/nv-?\d|nv series|encoder|decoder|av-?over-?ip|avoip|sdvoe/)) return "avOverIp";
  if (has(/control processor|\bcp\d\b|control system/)) return "control";
  if (has(/touch panel|navigator|\btsw\b|\btap\b|touch ?screen|control panel/)) return "touchPanel";
  if (has(/network switch|poe switch|m4350|catalyst|managed switch|\bswitch\b/)) return "networkSwitch";
  if (has(/clickshare|wireless presentation|airmedia|\bvia\b/)) return "wirelessPresentation";
  if (has(/\brack\b|equipment rack/)) return "rack";
  if (has(/wall ?plate|floor ?box|table ?box|retractor|poke ?thr|raceway|grommet|cubby/))
    return "wallplate";
  if (has(/display|monitor|\bqm\d|\bqe\d|\buhd\b|video wall|signage|\blfd\b/)) return "display";
  if (has(/mount|bracket|shelf|yoke/)) return "wallplate";
  return "other";
}

// --- Other (non-install) labor — hours only, user-entered ------------------

export type OtherLabor = {
  design: number;
  cad: number;
  programming: number;
  commissioning: number;
  pm: number;
  siteSurvey: number;
  weeklyCalls: number;
};

export const OTHER_LABOR_FIELDS: { key: keyof OtherLabor; label: string }[] = [
  { key: "design", label: "Design" },
  { key: "cad", label: "CAD" },
  { key: "programming", label: "Programming" },
  { key: "commissioning", label: "Commissioning" },
  { key: "pm", label: "PM" },
  { key: "siteSurvey", label: "Site Survey" },
  { key: "weeklyCalls", label: "Weekly Calls" },
];

export const emptyOther = (): OtherLabor => ({
  design: 0,
  cad: 0,
  programming: 0,
  commissioning: 0,
  pm: 0,
  siteSurvey: 0,
  weeklyCalls: 0,
});

function addOther(a: OtherLabor, b: OtherLabor): OtherLabor {
  return {
    design: a.design + b.design,
    cad: a.cad + b.cad,
    programming: a.programming + b.programming,
    commissioning: a.commissioning + b.commissioning,
    pm: a.pm + b.pm,
    siteSurvey: a.siteSurvey + b.siteSurvey,
    weeklyCalls: a.weeklyCalls + b.weeklyCalls,
  };
}

// --- Install-time computation ----------------------------------------------

export type LaborLine = {
  ri: number;
  si: number;
  ii: number;
  key: string; // `${ri}.${si}.${ii}`
  manufacturer: string;
  model: string;
  category: LaborCategory;
  qty: number;
  perUnit: number; // effective per-unit hours (override ?? library)
  lineHours: number; // perUnit * qty
};

export type RoomLabor = {
  ri: number;
  name: string;
  lines: LaborLine[];
  installHours: number;
  computedDays: number; // ceil(installHours / workingHoursPerDay)
  installDays: number; // override ?? computedDays
  other: OtherLabor;
};

export type LaborResult = {
  rooms: RoomLabor[];
  totalInstallHours: number;
  totalInstallDays: number;
  otherTotals: OtherLabor;
};

export function lineKey(ri: number, si: number, ii: number): string {
  return `${ri}.${si}.${ii}`;
}

export function computeLabor(
  bom: BomDoc,
  library: Record<LaborCategory, number>,
  lineOverrides: Record<string, number>,
  workingHoursPerDay: number,
  roomDaysOverride: Record<number, number | null | undefined>,
  roomLabor: Record<number, OtherLabor | undefined>,
): LaborResult {
  const perDay = workingHoursPerDay > 0 ? workingHoursPerDay : 8;
  const rooms: RoomLabor[] = [];
  let totalInstallHours = 0;
  let totalInstallDays = 0;
  let otherTotals = emptyOther();

  bom.locations.forEach((room, ri) => {
    const lines: LaborLine[] = [];
    let installHours = 0;
    room.systems.forEach((sys, si) => {
      sys.items.forEach((item, ii) => {
        const category = categorize(item);
        const key = lineKey(ri, si, ii);
        const override = lineOverrides[key];
        const perUnit = override != null && Number.isFinite(override) ? override : library[category];
        const qty = Number.isFinite(item.qty) ? Number(item.qty) : 0;
        const lh = perUnit * qty;
        installHours += lh;
        lines.push({
          ri,
          si,
          ii,
          key,
          manufacturer: item.manufacturer.trim(),
          model: item.model.trim(),
          category,
          qty,
          perUnit,
          lineHours: lh,
        });
      });
    });

    const computedDays = Math.ceil(installHours / perDay) || 0;
    const ov = roomDaysOverride[ri];
    const installDays = ov != null && Number.isFinite(ov) ? ov : computedDays;
    const other = roomLabor[ri] ?? emptyOther();

    rooms.push({
      ri,
      name: room.name.trim() || `Location ${ri + 1}`,
      lines,
      installHours,
      computedDays,
      installDays,
      other,
    });
    totalInstallHours += installHours;
    totalInstallDays += installDays;
    otherTotals = addOther(otherTotals, other);
  });

  return { rooms, totalInstallHours, totalInstallDays, otherTotals };
}

// --- Travel (the only place dollars live) ----------------------------------

export type MiscLine = { id: string; label: string; amount: number };

export type TravelInputs = {
  techs: number;
  eachWay: number; // travel days each way
  hotelRooms: number;
  cars: number;
  airfareRT: number;
  hotelNightly: number;
  rentalDaily: number;
  perDiemDaily: number;
  // overrides for the otherwise-derived day counts (null = use derived)
  travelDaysOv: number | null;
  daysOnSiteOv: number | null;
  hotelNightsOv: number | null;
  rentalDaysOv: number | null;
  perDiemDaysOv: number | null;
  misc: MiscLine[];
};

export const DEFAULT_TRAVEL: TravelInputs = {
  techs: 2,
  eachWay: 1,
  hotelRooms: 2,
  cars: 1,
  airfareRT: 0,
  hotelNightly: 0,
  rentalDaily: 0,
  perDiemDaily: 0,
  travelDaysOv: null,
  daysOnSiteOv: null,
  hotelNightsOv: null,
  rentalDaysOv: null,
  perDiemDaysOv: null,
  misc: [],
};

export type TravelResult = {
  daysOnSite: number;
  travelDays: number;
  hotelNights: number;
  rentalDays: number;
  perDiemDays: number;
  airfare: number;
  hotel: number;
  rental: number;
  perDiem: number;
  miscTotal: number;
  subtotal: number;
};

const pick = (ov: number | null, derived: number) =>
  ov != null && Number.isFinite(ov) ? ov : derived;

/** Derive travel day-counts from install days, then apply rates. All editable. */
export function computeTravel(installDays: number, t: TravelInputs): TravelResult {
  const daysOnSite = pick(t.daysOnSiteOv, installDays);
  const travelDays = pick(t.travelDaysOv, 2 * t.eachWay);
  const hotelNights = pick(t.hotelNightsOv, installDays + 1);
  const rentalDays = pick(t.rentalDaysOv, installDays + 2);
  const perDiemDays = pick(t.perDiemDaysOv, installDays + 2);

  const airfare = t.airfareRT * t.techs;
  const hotel = t.hotelNightly * hotelNights * t.hotelRooms;
  const rental = t.rentalDaily * rentalDays * t.cars;
  const perDiem = t.perDiemDaily * perDiemDays * t.techs;
  const miscTotal = t.misc.reduce((s, m) => s + (Number.isFinite(m.amount) ? m.amount : 0), 0);

  return {
    daysOnSite,
    travelDays,
    hotelNights,
    rentalDays,
    perDiemDays,
    airfare,
    hotel,
    rental,
    perDiem,
    miscTotal,
    subtotal: airfare + hotel + rental + perDiem + miscTotal,
  };
}
