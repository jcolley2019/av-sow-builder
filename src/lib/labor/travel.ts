// Crew-based travel calculator (LT.2i) — pure derivation of a travel plan
// from a crew roster and trip shape. No I/O, no UI. The plan's totals
// become the AUTO values of the engine's travel expense lines (airfare,
// rental car days, per diem days, hotel nights) and, in fly mode, the
// per-role travel labor lines. Drive mode keeps the workbook's
// travel-time-hours labor lines and the van-mileage formula instead.

export type TravelMode = 'drive' | 'fly';

export interface CrewRoster {
  lead: number;
  tech: number;
  fe: number;
  pm: number;
  eng: number;
}

export interface TravelInputs {
  roster: CrewRoster;
  tripCount: number;
  onSiteDaysPerTrip: number;
  mode: TravelMode;
}

export interface TravelPlan {
  mode: TravelMode;
  headcount: number;
  /** Per person, per trip. */
  travelDaysPerTrip: number;     // fly: 1 out + 1 back; drive: 0 (hourly lines instead)
  totalDaysAwayPerTrip: number;  // on-site days + travel days
  hotelNightsPerTrip: number;    // days away - 1, min 0
  perDiemDaysPerTrip: number;    // = days away
  /** Per trip (not per person): one car per 2 people. */
  rentalCarsPerTrip: number;
  totals: {
    airfareRoundTrips: number;   // fly only: headcount x trips
    hotelNights: number;
    perDiemDays: number;
    rentalCarDays: number;
    /** Fly only: travelDays x 8 x headcount, per role, all trips. */
    travelLaborHoursByRole: CrewRoster;
    travelLaborHours: number;
  };
}

const EMPTY_ROSTER: CrewRoster = { lead: 0, tech: 0, fe: 0, pm: 0, eng: 0 };

export const EMPTY_TRAVEL: TravelInputs = {
  roster: EMPTY_ROSTER,
  tripCount: 0,
  onSiteDaysPerTrip: 0,
  mode: 'drive',
};

export function computeTravelPlan(t: TravelInputs = EMPTY_TRAVEL): TravelPlan {
  const roster = t.roster ?? EMPTY_ROSTER;
  const headcount = roster.lead + roster.tech + roster.fe + roster.pm + roster.eng;
  const trips = Math.max(0, t.tripCount);
  const fly = t.mode === 'fly';

  const travelDays = fly ? 2 : 0;
  const daysAway = Math.max(0, t.onSiteDaysPerTrip) + travelDays;
  const hotelNights = Math.max(0, daysAway - 1);
  const rentalCars = Math.ceil(headcount / 2);

  const laborByRole: CrewRoster = fly
    ? {
        lead: roster.lead * travelDays * 8 * trips,
        tech: roster.tech * travelDays * 8 * trips,
        fe: roster.fe * travelDays * 8 * trips,
        pm: roster.pm * travelDays * 8 * trips,
        eng: roster.eng * travelDays * 8 * trips,
      }
    : { ...EMPTY_ROSTER };

  return {
    mode: t.mode,
    headcount,
    travelDaysPerTrip: travelDays,
    totalDaysAwayPerTrip: daysAway,
    hotelNightsPerTrip: hotelNights,
    perDiemDaysPerTrip: daysAway,
    rentalCarsPerTrip: rentalCars,
    totals: {
      airfareRoundTrips: fly ? headcount * trips : 0,
      hotelNights: headcount * trips * hotelNights,
      perDiemDays: headcount * trips * daysAway,
      rentalCarDays: rentalCars * daysAway * trips,
      travelLaborHoursByRole: laborByRole,
      travelLaborHours:
        laborByRole.lead + laborByRole.tech + laborByRole.fe + laborByRole.pm + laborByRole.eng,
    },
  };
}
