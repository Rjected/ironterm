// WHOOP v2 data as stored and sent to the UI. WHOOP's public API gives per-workout summaries
// (avg/max HR, time in zones, strain, kJ) and daily recovery — not a continuous HR stream.

export interface WhoopWorkout {
  id: string;
  start: string;
  end: string;
  sport: string;
  strain?: number;
  avgHr?: number;
  maxHr?: number;
  kj?: number;
  distanceM?: number;
  /** milliseconds in HR zones 0–5 */
  zones?: number[];
}

export interface WhoopRecovery {
  /** sleep / cycle date (local) */
  date: string;
  score?: number;
  hrv?: number;
  rhr?: number;
  spo2?: number;
}

export interface WhoopBody {
  weightKg?: number;
  heightM?: number;
  maxHr?: number;
}

export interface WhoopData {
  connected: boolean;
  configured: boolean;
  workouts: WhoopWorkout[];
  recoveries: WhoopRecovery[];
  body?: WhoopBody;
  syncedAt?: string;
}

/** WHOOP workouts overlapping a Hevy workout (by time), best overlap first. */
export function whoopFor(ws: WhoopWorkout[], start: string, end: string): WhoopWorkout | undefined {
  const a = Date.parse(start), b = Date.parse(end);
  let best: WhoopWorkout | undefined, bestO = 0;
  for (const w of ws) {
    const o = Math.min(b, Date.parse(w.end)) - Math.max(a, Date.parse(w.start));
    if (o > bestO) { best = w; bestO = o; }
  }
  // require a meaningful overlap (≥ 25% of the shorter one)
  if (!best) return undefined;
  const shorter = Math.min(b - a, Date.parse(best.end) - Date.parse(best.start));
  return bestO >= shorter * 0.25 ? best : undefined;
}
