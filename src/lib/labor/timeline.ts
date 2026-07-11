// Display-only timeline projection (LT.2c). The engine derives crew-days
// from hours; this module only turns them into durations and, when the
// user picks an optional target start date, Mon-Fri calendar windows
// (In-House first, On-Site back-to-back). Nothing here feeds the
// estimate math — engine.ts has no date inputs at all.

export interface PhaseWindow {
  startISO: string;
  endISO: string;
}

export interface TimelineProjection {
  inHouse: PhaseWindow | null;
  onSite: PhaseWindow | null;
}

const DAY_MS = 86400000;

function parseISO(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toISO(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function isBusinessDay(t: number): boolean {
  const dow = new Date(t).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** First business day on or after t. */
function nextBusinessDay(t: number): number {
  let d = t;
  while (!isBusinessDay(d)) d += DAY_MS;
  return d;
}

/** Last day of a phase occupying `days` business days starting at `start`. */
function endOfPhase(start: number, days: number): number {
  let d = nextBusinessDay(start);
  for (let i = 1; i < days; i++) d = nextBusinessDay(d + DAY_MS);
  return d;
}

/**
 * Project phases forward over business days from a target start date.
 * A weekend start rolls to Monday; a 0-day phase gets no window and
 * the next phase starts where it would have.
 */
export function projectTimeline(
  startISO: string,
  inHouseDays: number,
  onSiteDays: number,
): TimelineProjection | null {
  const start = parseISO(startISO);
  if (start === null) return null;
  let cursor = nextBusinessDay(start);
  let inHouse: PhaseWindow | null = null;
  if (inHouseDays > 0) {
    const end = endOfPhase(cursor, inHouseDays);
    inHouse = { startISO: toISO(cursor), endISO: toISO(end) };
    cursor = nextBusinessDay(end + DAY_MS);
  }
  let onSite: PhaseWindow | null = null;
  if (onSiteDays > 0) {
    const end = endOfPhase(cursor, onSiteDays);
    onSite = { startISO: toISO(cursor), endISO: toISO(end) };
  }
  return { inHouse, onSite };
}

/** Crew-days to weeks at 5 business days/week, 1 decimal place. */
export function weeksFromDays(days: number): number {
  return Math.round((days / 5) * 10) / 10;
}

/** "2026-03-02" -> "Mar 2" (UTC; avoids local-timezone day shifts). */
export function formatDateShort(iso: string): string {
  const t = parseISO(iso);
  if (t === null) return iso;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
