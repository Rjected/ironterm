// Cardio stats from Hevy workouts, optionally enriched with heart-rate sessions (e.g. WHOOP).
// Pure functions; distances are meters and times seconds internally.

import type { HevyExercise, HevySet, HevyWorkout } from "./hevy";
import { addDays, durationMin, localDate, weekStart } from "./stats";

export type DistUnit = "mi" | "km";

export const METERS_PER_MI = 1609.344;
export const metersTo = (m: number, unit: DistUnit) => (unit === "mi" ? m / METERS_PER_MI : m / 1000);
export const toMeters = (d: number, unit: DistUnit) => (unit === "mi" ? d * METERS_PER_MI : d * 1000);

/** A heart-rate tracked activity (later from WHOOP). `zones` = ms spent in HR zones 0–5. */
export interface HrSession {
  start: string;
  end: string;
  avgHr?: number;
  maxHr?: number;
  zones?: number[];
  strain?: number;
  kj?: number;
}

/** Hevy titles that are cardio even when logged as duration only. Matched case-insensitively, prefix
 *  before " (" so "Stair Machine (Floors)" matches "Stair Machine". */
export const CARDIO_TITLES = [
  "Running", "Treadmill", "Cycling", "Recumbent Bike", "Spinning", "Rowing Machine", "Elliptical Trainer",
  "Stair Machine", "Walking", "Hiking", "Swimming", "Jump Rope", "Air Bike", "Ski Erg", "Sprints",
  "Stationary Bike", "Indoor Cycling", "Assault Bike", "Stepper", "Aerobics", "HIIT", "Battle Ropes", "Boxing",
];
const CARDIO_SET = new Set(CARDIO_TITLES.map((t) => t.toLowerCase()));
const baseTitle = (t: string) => t.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "");

export function isCardioTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return CARDIO_SET.has(t) || CARDIO_SET.has(baseTitle(t));
}

const working = (sets: HevySet[]) => sets.filter((s) => s.type !== "warmup");
const hasLoadReps = (s: HevySet) => (s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0;

/**
 * Cardio if the title is a known cardio activity (and no set has weight × reps), or by set shape: some
 * set has distance > 0 and no set has any weight (so loaded carries, sled drags, walking lunges stay out). Duration-only sets without a
 * cardio title are holds (plank, dead hang) and are not cardio.
 */
export function isCardioExercise(e: HevyExercise): boolean {
  const sets = working(e.sets);
  if (sets.some(hasLoadReps)) return false;
  if (isCardioTitle(e.title)) return true;
  return sets.some((s) => (s.distance_meters ?? 0) > 0) && !sets.some((s) => (s.weight_kg ?? 0) > 0);
}

export interface CardioSession {
  workoutId: string;
  date: string;
  start: string;
  end: string;
  /** Hevy exercise title */
  activity: string;
  seconds: number;
  meters: number;
  /** seconds from sets that also had a distance (the denominator for pace) */
  pacedSeconds: number;
  pacedMeters: number;
  sets: number;
  /** HR session overlapping this workout, if any was passed in */
  hr?: { avgHr?: number; maxHr?: number; strain?: number; kj?: number };
  /** estimated zone-2 minutes, only when HR data matched */
  zone2Min?: number;
}

export interface CardioOpts {
  /** user's max HR, for estimating zone 2 (60–70 %) from avgHr when an HR session has no zones */
  maxHr?: number;
  /** inclusive YYYY-MM-DD bounds (local dates) */
  from?: string;
  to?: string;
  /** cap on one workout's length when deriving lifting time; forgotten timers run for days (default 240) */
  maxSessionMinutes?: number;
}

/** ms of overlap between [a0,a1] and [b0,b1]. */
function overlapMs(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** HR session with the most time overlap with the workout, or null. */
export function matchHr(w: HevyWorkout, hr: HrSession[]): HrSession | null {
  const w0 = Date.parse(w.start_time), w1 = Date.parse(w.end_time);
  let best: HrSession | null = null, bestMs = 0;
  for (const h of hr) {
    const ms = overlapMs(w0, w1, Date.parse(h.start), Date.parse(h.end));
    if (ms > bestMs) { bestMs = ms; best = h; }
  }
  return best;
}

/**
 * Zone-2 minutes inside the workout window for one HR session. With `zones`, zone-2 ms is scaled by the
 * fraction of the HR session that overlaps the workout. Without zones, if avgHr is 60–70 % of the
 * user's max HR the overlapping minutes count as zone 2. Returns null when it can't be estimated.
 */
export function zone2Minutes(w: HevyWorkout, h: HrSession, userMaxHr?: number): number | null {
  const h0 = Date.parse(h.start), h1 = Date.parse(h.end);
  const ov = overlapMs(Date.parse(w.start_time), Date.parse(w.end_time), h0, h1);
  if (ov <= 0 || h1 <= h0) return null;
  if (h.zones && h.zones.length > 2) return ((h.zones[2] ?? 0) * (ov / (h1 - h0))) / 60000;
  if (h.avgHr && userMaxHr) {
    const r = h.avgHr / userMaxHr;
    return r >= 0.6 && r <= 0.7 ? ov / 60000 : 0;
  }
  return null;
}

/**
 * One session per (workout, activity): same-titled cardio exercises in one workout are merged.
 * Zone-2 minutes from the matched HR session are capped at the workout's cardio time and split across
 * its cardio activities by duration (lifting in the same window is not counted as cardio zone 2).
 */
export function cardioSessions(workouts: HevyWorkout[], tz: string, hr?: HrSession[], opts: CardioOpts = {}): CardioSession[] {
  const out: CardioSession[] = [];
  for (const w of [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const date = localDate(w.start_time, tz);
    if ((opts.from && date < opts.from) || (opts.to && date > opts.to)) continue;
    const byAct = new Map<string, CardioSession>();
    for (const e of w.exercises) {
      if (!isCardioExercise(e)) continue;
      const s = byAct.get(e.title) ?? { workoutId: w.id, date, start: w.start_time, end: w.end_time, activity: e.title, seconds: 0, meters: 0, pacedSeconds: 0, pacedMeters: 0, sets: 0 };
      for (const set of working(e.sets)) {
        const sec = Math.max(0, set.duration_seconds ?? 0), m = Math.max(0, set.distance_meters ?? 0);
        if (sec <= 0 && m <= 0) continue;
        s.seconds += sec;
        s.meters += m;
        if (sec > 0 && m > 0) { s.pacedSeconds += sec; s.pacedMeters += m; }
        s.sets++;
      }
      if (s.sets) byAct.set(e.title, s);
    }
    if (!byAct.size) continue;
    const sessions = [...byAct.values()];
    const h = hr?.length ? matchHr(w, hr) : null;
    if (h) {
      const z2 = zone2Minutes(w, h, opts.maxHr);
      const cardioSec = sessions.reduce((a, s) => a + s.seconds, 0);
      for (const s of sessions) {
        s.hr = { avgHr: h.avgHr, maxHr: h.maxHr, strain: h.strain, kj: h.kj };
        if (z2 != null) s.zone2Min = cardioSec > 0 ? (Math.min(z2, cardioSec / 60) * s.seconds) / cardioSec : 0;
      }
    }
    out.push(...sessions);
  }
  return out;
}

export interface BestEffort {
  date: string;
  workoutId: string;
  seconds: number;
  /** distance in the requested unit */
  distance: number;
  /** seconds per unit */
  pace: number;
}

export interface ActivityStats {
  activity: string;
  sessions: number;
  /** sessions logged with time but distance 0 / missing */
  timeOnlySessions: number;
  totalSeconds: number;
  totalMinutes: number;
  /** in the requested unit */
  totalDistance: number;
  /** seconds per unit over sessions with distance, null if none */
  avgPace: number | null;
  /** units per hour over sessions with distance */
  avgSpeed: number | null;
  avgMinutes: number;
  longest: { date: string; workoutId: string; seconds: number } | null;
  farthest: BestEffort | null;
  /** fastest session pace among sessions at least `minDistance` long, per threshold */
  fastest: { minDistance: number; effort: BestEffort | null }[];
  weekly: { week: string; minutes: number; distance: number }[];
  /** null unless some session matched HR data */
  zone2Min: number | null;
  first: string;
  last: string;
}

export interface CardioSummary {
  unit: DistUnit;
  activities: ActivityStats[];
  totals: { sessions: number; workouts: number; minutes: number; distance: number; zone2Min: number | null };
  weekly: WeekSplit[];
}

export interface WeekSplit {
  week: string;
  cardioMin: number;
  liftingMin: number;
  zone2Min: number | null;
}

export interface CardioStatsOpts extends CardioOpts {
  hr?: HrSession[];
  /** best-effort thresholds in `unit` (default mi: 1, 3.1, 6.2 / km: 1, 5, 10) */
  efforts?: number[];
}

const effort = (s: CardioSession, unit: DistUnit): BestEffort => {
  const d = metersTo(s.pacedMeters, unit);
  return { date: s.date, workoutId: s.workoutId, seconds: s.pacedSeconds, distance: d, pace: s.pacedSeconds / d };
};

/** Per-activity cardio stats plus weekly cardio vs lifting time. */
export function cardioStats(workouts: HevyWorkout[], tz: string, unit: DistUnit, opts: CardioStatsOpts = {}): CardioSummary {
  const sessions = cardioSessions(workouts, tz, opts.hr, opts);
  const thresholds = opts.efforts ?? (unit === "mi" ? [1, 3.1, 6.2] : [1, 5, 10]);
  const byAct = new Map<string, CardioSession[]>();
  for (const s of sessions) byAct.set(s.activity, [...(byAct.get(s.activity) ?? []), s]);

  const activities: ActivityStats[] = [...byAct.entries()].map(([activity, ss]) => {
    const totalSeconds = ss.reduce((a, s) => a + s.seconds, 0);
    const pm = ss.reduce((a, s) => a + s.pacedMeters, 0), ps = ss.reduce((a, s) => a + s.pacedSeconds, 0);
    const paced = ss.filter((s) => s.pacedMeters > 0);
    let longest: ActivityStats["longest"] = null, farthest: CardioSession | null = null;
    for (const s of ss) {
      if (s.seconds > 0 && (!longest || s.seconds > longest.seconds)) longest = { date: s.date, workoutId: s.workoutId, seconds: s.seconds };
      if (s.meters > 0 && (!farthest || s.meters > farthest.meters)) farthest = s;
    }
    const fastest = thresholds.map((minDistance) => {
      let best: BestEffort | null = null;
      for (const s of paced) {
        if (metersTo(s.pacedMeters, unit) + 1e-9 < minDistance) continue;
        const e = effort(s, unit);
        if (!best || e.pace < best.pace) best = e;
      }
      return { minDistance, effort: best };
    });
    const wk = new Map<string, { minutes: number; distance: number }>();
    for (const s of ss) {
      const k = weekStart(s.date);
      const c = wk.get(k) ?? { minutes: 0, distance: 0 };
      c.minutes += s.seconds / 60;
      c.distance += metersTo(s.meters, unit);
      wk.set(k, c);
    }
    const z = ss.filter((s) => s.zone2Min != null);
    return {
      activity,
      sessions: ss.length,
      timeOnlySessions: ss.filter((s) => s.meters <= 0).length,
      totalSeconds,
      totalMinutes: totalSeconds / 60,
      totalDistance: metersTo(ss.reduce((a, s) => a + s.meters, 0), unit),
      avgPace: pm > 0 && ps > 0 ? ps / metersTo(pm, unit) : null,
      avgSpeed: pm > 0 && ps > 0 ? metersTo(pm, unit) / (ps / 3600) : null,
      avgMinutes: totalSeconds / 60 / ss.length,
      longest,
      farthest: farthest ? { ...effort(farthest, unit), distance: metersTo(farthest.meters, unit) } : null,
      fastest,
      weekly: [...wk.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, ...v })),
      zone2Min: z.length ? z.reduce((a, s) => a + (s.zone2Min ?? 0), 0) : null,
      first: ss[0].date,
      last: ss[ss.length - 1].date,
    };
  }).sort((a, b) => b.totalSeconds - a.totalSeconds);

  const z = sessions.filter((s) => s.zone2Min != null);
  return {
    unit,
    activities,
    totals: {
      sessions: sessions.length,
      workouts: new Set(sessions.map((s) => s.workoutId)).size,
      minutes: sessions.reduce((a, s) => a + s.seconds, 0) / 60,
      distance: metersTo(sessions.reduce((a, s) => a + s.meters, 0), unit),
      zone2Min: z.length ? z.reduce((a, s) => a + (s.zone2Min ?? 0), 0) : null,
    },
    weekly: weeklyCardioVsLifting(workouts, tz, opts, sessions),
  };
}

/**
 * Minutes per Monday-week: cardio = logged cardio set durations; lifting = workout duration (capped at
 * maxSessionMinutes) minus its cardio time (clamped at 0). Weeks with no workouts in between are filled with zeros.
 */
export function weeklyCardioVsLifting(workouts: HevyWorkout[], tz: string, opts: CardioStatsOpts = {}, sessions?: CardioSession[]): WeekSplit[] {
  const ss = sessions ?? cardioSessions(workouts, tz, opts.hr, opts);
  const cardioByW = new Map<string, { sec: number; z2: number | null }>();
  for (const s of ss) {
    const c = cardioByW.get(s.workoutId) ?? { sec: 0, z2: null };
    c.sec += s.seconds;
    if (s.zone2Min != null) c.z2 = (c.z2 ?? 0) + s.zone2Min;
    cardioByW.set(s.workoutId, c);
  }
  const m = new Map<string, WeekSplit>();
  for (const w of workouts) {
    const d = localDate(w.start_time, tz);
    if ((opts.from && d < opts.from) || (opts.to && d > opts.to)) continue;
    const k = weekStart(d);
    const c = m.get(k) ?? { week: k, cardioMin: 0, liftingMin: 0, zone2Min: null };
    const cw = cardioByW.get(w.id);
    const cmin = (cw?.sec ?? 0) / 60;
    c.cardioMin += cmin;
    c.liftingMin += Math.max(0, Math.min(durationMin(w), opts.maxSessionMinutes ?? 240) - cmin);
    if (cw?.z2 != null) c.zone2Min = (c.zone2Min ?? 0) + cw.z2;
    m.set(k, c);
  }
  const weeks = [...m.keys()].sort();
  const out: WeekSplit[] = [];
  for (let k = weeks[0]; k && k <= weeks[weeks.length - 1]; k = addDays(k, 7)) out.push(m.get(k) ?? { week: k, cardioMin: 0, liftingMin: 0, zone2Min: null });
  return out;
}

/** "8:05 /mi" from seconds per unit. */
export function formatPace(secPerUnit: number | null, unit: DistUnit): string {
  if (secPerUnit == null || !isFinite(secPerUnit) || secPerUnit <= 0) return "—";
  const t = Math.round(secPerUnit);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")} /${unit}`;
}

/** "1:05:03" / "32:10" from seconds. */
export function formatDuration(sec: number): string {
  const t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
