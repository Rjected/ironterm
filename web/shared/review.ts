// Year in review: one pass over the history, pure. Weights in the caller's unit, distances in DistUnit.

import { cardioStats, isCardioExercise, type ActivityStats, type DistUnit, type HrSession } from "./cardio";
import type { HevyExerciseTemplate, HevyWorkout } from "./hevy";
import { LIFTS, matchLift } from "./lifts";
import { addDays, epley, weekStart } from "./stats";
import { fromKg, type Unit } from "./units";

export interface ReviewOpts {
  /** user lift → template id overrides (same as everywhere else) */
  map?: Record<string, string>;
  /** exercise templates for muscle groups of exercises not in LIFTS */
  templates?: HevyExerciseTemplate[];
  distUnit?: DistUnit;
  hr?: HrSession[];
  /** user max HR for zone-2 estimates without zone data */
  maxHr?: number;
  /** sessions per week that keep a weekly streak alive (default 3) */
  minWeeklySessions?: number;
  /** how many lifts / muscles to list (default 10) */
  top?: number;
  /** cap on one workout's length for hours; forgotten timers run for days (default 240) */
  maxSessionMinutes?: number;
}

export interface Totals {
  sessions: number;
  hours: number;
  sets: number;
  reps: number;
  tonnage: number;
  cardioMinutes: number;
  cardioDistance: number;
  trainingDays: number;
}

export interface Delta { prev: number; diff: number; pct: number | null }

export interface Period { sessions: number; tonnage: number; hours: number }

export interface LiftYear {
  key: string;
  name: string;
  sets: number;
  reps: number;
  tonnage: number;
  sessions: number;
}

export interface LiftPRs {
  key: string;
  name: string;
  /** best e1RM of the year if it beat everything before it, else null */
  e1rm: { value: number; weight: number; reps: number; date: string; previous: number | null } | null;
  /** sessions this year that set a new all-time e1RM */
  e1rmPRCount: number;
  /** rep counts (1–12) whose all-time best weight was raised this year; final best of the year */
  repPRs: { reps: number; weight: number; date: string; previous: number | null }[];
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export interface YearInReview {
  year: number;
  unit: Unit;
  distUnit: DistUnit;
  totals: Totals;
  prevTotals: Totals;
  deltas: Record<keyof Totals, Delta>;
  bestMonth: ({ month: string } & Period) | null;
  bestWeek: ({ week: string } & Period) | null;
  months: ({ month: string } & Period)[];
  streaks: {
    /** consecutive Monday-weeks with ≥ minWeeklySessions sessions */
    weeks: { length: number; start: string; end: string } | null;
    /** consecutive calendar days with a workout */
    days: { length: number; start: string; end: string } | null;
  };
  topLifts: LiftYear[];
  muscles: { muscle: string; sets: number }[];
  prs: LiftPRs[];
  first: { id: string; title: string; date: string } | null;
  last: { id: string; title: string; date: string } | null;
  favoriteDay: { day: string; sessions: number } | null;
  favoriteTime: { time: TimeOfDay; sessions: number } | null;
  /** sessions by weekday Mon..Sun */
  byWeekday: number[];
  /** sessions by local start hour 0–23 */
  byHour: number[];
  cardio: { totals: { sessions: number; minutes: number; distance: number; zone2Min: number | null }; activities: ActivityStats[] };
}

// ── local time parts (formatter cached per tz; Intl construction dominates otherwise) ──
const FMT = new Map<string, Intl.DateTimeFormat>();
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function parts(iso: string, tz: string): { date: string; hour: number; wd: number } {
  let f = FMT.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" });
    FMT.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, wd: WD.indexOf(p.weekday) };
}

const timeOfDay = (h: number): TimeOfDay => (h >= 5 && h < 12 ? "morning" : h >= 12 && h < 17 ? "afternoon" : h >= 17 && h < 22 ? "evening" : "night");
const delta = (cur: number, prev: number): Delta => ({ prev, diff: cur - prev, pct: prev ? (cur - prev) / prev : null });
const EPS = 0.01; // kg; lb↔kg round-trips leave float noise

interface Prepared { w: HevyWorkout; date: string; hour: number; wd: number }

function baseTotals(ws: Prepared[], unit: Unit, cardioMin: number, cardioDist: number, hrs: (w: HevyWorkout) => number): Totals {
  let hours = 0, sets = 0, reps = 0, kg = 0;
  const days = new Set<string>();
  for (const { w, date } of ws) {
    hours += hrs(w);
    days.add(date);
    for (const e of w.exercises)
      for (const s of e.sets) {
        if (s.type === "warmup") continue;
        sets++;
        reps += s.reps ?? 0;
        kg += (s.weight_kg ?? 0) * (s.reps ?? 0);
      }
  }
  return { sessions: ws.length, hours, sets, reps, tonnage: fromKg(kg, unit), cardioMinutes: cardioMin, cardioDistance: cardioDist, trainingDays: days.size };
}

function longestRun(keys: string[], step: number): { length: number; start: string; end: string } | null {
  let best: { length: number; start: string; end: string } | null = null, start = "", prev = "", len = 0;
  for (const k of keys) {
    if (prev && addDays(prev, step) === k) len++;
    else { len = 1; start = k; }
    prev = k;
    if (!best || len > best.length) best = { length: len, start, end: k };
  }
  return best;
}

export function yearInReview(workouts: HevyWorkout[], year: number, tz: string, unit: Unit, opts: ReviewOpts = {}): YearInReview {
  const distUnit = opts.distUnit ?? (unit === "lb" ? "mi" : "km");
  const top = opts.top ?? 10, minWk = opts.minWeeklySessions ?? 3, capMin = opts.maxSessionMinutes ?? 240;
  const hrs = (w: HevyWorkout) => Math.min(capMin, Math.max(0, Date.parse(w.end_time) - Date.parse(w.start_time)) / 60000) / 60;
  const y0 = `${year}-01-01`, y1 = `${year}-12-31`, p0 = `${year - 1}-01-01`, p1 = `${year - 1}-12-31`;
  const tmplMuscle = new Map((opts.templates ?? []).map((t) => [t.id, t.primary_muscle_group ?? "other"]));
  const keyCache = new Map<string, string>();
  const keyOf = (title: string, tid: string) => {
    const ck = tid + "\0" + title;
    let k = keyCache.get(ck);
    if (k === undefined) { k = matchLift(title, tid, opts.map) ?? `title:${title}`; keyCache.set(ck, k); }
    return k;
  };
  const nameOf = (k: string) => (k.startsWith("title:") ? k.slice(6) : LIFTS[k]?.name ?? k);

  const all: Prepared[] = workouts
    .filter((w) => w.start_time.slice(0, 4) <= String(year + 1)) // cheap pre-filter; tz shift handled below
    .map((w) => ({ w, ...parts(w.start_time, tz) }))
    .filter((p) => p.date <= y1)
    .sort((a, b) => a.w.start_time.localeCompare(b.w.start_time));
  const cur = all.filter((p) => p.date >= y0);
  const prev = all.filter((p) => p.date >= p0 && p.date <= p1);

  // ── cardio ──
  const cOpts = { hr: opts.hr, maxHr: opts.maxHr, maxSessionMinutes: capMin };
  const cardio = cardioStats(cur.map((p) => p.w), tz, distUnit, { ...cOpts, from: y0, to: y1 });
  const cardioPrev = cardioStats(prev.map((p) => p.w), tz, distUnit, { ...cOpts, from: p0, to: p1 });

  const totals = baseTotals(cur, unit, cardio.totals.minutes, cardio.totals.distance, hrs);
  const prevTotals = baseTotals(prev, unit, cardioPrev.totals.minutes, cardioPrev.totals.distance, hrs);
  const deltas = Object.fromEntries((Object.keys(totals) as (keyof Totals)[]).map((k) => [k, delta(totals[k], prevTotals[k])])) as Record<keyof Totals, Delta>;

  // ── months / weeks / time ──
  const months = new Map<string, Period>(), weeks = new Map<string, Period>();
  const byWeekday = Array(7).fill(0), byHour = Array(24).fill(0);
  const days = new Set<string>();
  const add = (m: Map<string, Period>, k: string, w: HevyWorkout, kg: number) => {
    const c = m.get(k) ?? { sessions: 0, tonnage: 0, hours: 0 };
    c.sessions++;
    c.tonnage += fromKg(kg, unit);
    c.hours += hrs(w);
    m.set(k, c);
  };

  // ── lifts / muscles ──
  const lifts = new Map<string, LiftYear & { _w: Set<string> }>();
  const muscles = new Map<string, number>();

  // ── PRs: walk all history through the end of the year ──
  const bestE = new Map<string, number>(); // all-time best e1RM (kg) so far
  const bestRep = new Map<string, number[]>(); // index r → best kg for ≥ r reps
  const startE = new Map<string, number>(), startRep = new Map<string, number[]>(); // snapshot at Jan 1
  const yearPR = new Map<string, LiftPRs & { _rep: Map<number, { kg: number; date: string }> ; _eKg: { e: number; w: number; r: number; date: string } | null }>();
  let snap = false;

  for (const p of all) {
    const { w, date } = p;
    const inYear = date >= y0;
    if (inYear && !snap) {
      snap = true;
      for (const [k, v] of bestE) startE.set(k, v);
      for (const [k, v] of bestRep) startRep.set(k, [...v]);
    }
    let wKg = 0;
    const sessionBest = new Map<string, { e: number; w: number; r: number }>();
    for (const e of w.exercises) {
      const cardioEx = isCardioExercise(e);
      const key = keyOf(e.title, e.exercise_template_id);
      const ws = e.sets.filter((s) => s.type !== "warmup");
      if (inYear && ws.length) {
        const muscle = cardioEx ? "cardio" : LIFTS[key]?.muscle ?? tmplMuscle.get(e.exercise_template_id) ?? "other";
        muscles.set(muscle, (muscles.get(muscle) ?? 0) + ws.length);
        if (!cardioEx) {
          const l = lifts.get(key) ?? { key, name: nameOf(key), sets: 0, reps: 0, tonnage: 0, sessions: 0, _w: new Set<string>() };
          l.sets += ws.length;
          for (const s of ws) { l.reps += s.reps ?? 0; l.tonnage += fromKg((s.weight_kg ?? 0) * (s.reps ?? 0), unit); }
          l._w.add(w.id);
          lifts.set(key, l);
        }
      }
      for (const s of ws) {
        const kg = s.weight_kg ?? 0, r = s.reps ?? 0;
        wKg += kg * r;
        if (cardioEx || kg <= 0 || r <= 0) continue;
        const ev = epley(kg, r);
        const sb = sessionBest.get(key);
        if (!sb || ev > sb.e) sessionBest.set(key, { e: ev, w: kg, r });
        const arr = bestRep.get(key) ?? [];
        for (let i = 1; i <= Math.min(r, 12); i++) {
          if (kg > (arr[i] ?? 0) + EPS) {
            arr[i] = kg;
            if (inYear) {
              const pr = yearPR.get(key) ?? newPR(key);
              pr._rep.set(i, { kg, date });
              yearPR.set(key, pr);
            }
          }
        }
        bestRep.set(key, arr);
      }
    }
    for (const [key, sb] of sessionBest) {
      const before = bestE.get(key);
      if (before == null || sb.e > before + EPS) {
        bestE.set(key, sb.e);
        if (inYear) {
          const pr = yearPR.get(key) ?? newPR(key);
          pr.e1rmPRCount++;
          pr._eKg = { e: sb.e, w: sb.w, r: sb.r, date };
          yearPR.set(key, pr);
        }
      }
    }
    if (inYear) {
      add(months, date.slice(0, 7), w, wKg);
      add(weeks, weekStart(date), w, wKg);
      byWeekday[p.wd]++;
      byHour[p.hour]++;
      days.add(date);
    }
  }
  function newPR(key: string) {
    return { key, name: nameOf(key), e1rm: null, e1rmPRCount: 0, repPRs: [], _rep: new Map<number, { kg: number; date: string }>(), _eKg: null };
  }

  const prs: LiftPRs[] = [...yearPR.values()].map((p) => {
    const prevE = startE.get(p.key) ?? null, prevR = startRep.get(p.key) ?? [];
    return {
      key: p.key,
      name: p.name,
      e1rm: p._eKg ? { value: fromKg(p._eKg.e, unit), weight: fromKg(p._eKg.w, unit), reps: p._eKg.r, date: p._eKg.date, previous: prevE == null ? null : fromKg(prevE, unit) } : null,
      e1rmPRCount: p.e1rmPRCount,
      repPRs: [...p._rep.entries()].sort((a, b) => a[0] - b[0]).map(([reps, v]) => ({ reps, weight: fromKg(v.kg, unit), date: v.date, previous: prevR[reps] ? fromKg(prevR[reps], unit) : null })),
    };
  }).sort((a, b) => (lifts.get(b.key)?.sets ?? 0) - (lifts.get(a.key)?.sets ?? 0));

  const pick = (m: Map<string, Period>) => {
    let best: [string, Period] | null = null;
    for (const e of m) if (!best || e[1].tonnage > best[1].tonnage || (e[1].tonnage === best[1].tonnage && e[1].sessions > best[1].sessions)) best = e;
    return best;
  };
  const bm = pick(months), bw = pick(weeks);
  const okWeeks = [...weeks.entries()].filter(([, v]) => v.sessions >= minWk).map(([k]) => k).sort();
  const wd = byWeekday.indexOf(Math.max(...byWeekday));
  const tod = new Map<TimeOfDay, number>();
  byHour.forEach((n, h) => n && tod.set(timeOfDay(h), (tod.get(timeOfDay(h)) ?? 0) + n));
  const favT = [...tod.entries()].sort((a, b) => b[1] - a[1])[0];
  const brief = (p?: Prepared) => (p ? { id: p.w.id, title: p.w.title, date: p.date } : null);

  return {
    year, unit, distUnit, totals, prevTotals, deltas,
    bestMonth: bm ? { month: bm[0], ...bm[1] } : null,
    bestWeek: bw ? { week: bw[0], ...bw[1] } : null,
    months: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, ...v })),
    streaks: { weeks: longestRun(okWeeks, 7), days: longestRun([...days].sort(), 1) },
    topLifts: [...lifts.values()].map(({ _w, ...l }) => ({ ...l, sessions: _w.size })).sort((a, b) => b.sets - a.sets || b.tonnage - a.tonnage).slice(0, top),
    muscles: [...muscles.entries()].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets).slice(0, top),
    prs,
    first: brief(cur[0]),
    last: brief(cur[cur.length - 1]),
    favoriteDay: cur.length ? { day: WEEKDAYS[wd], sessions: byWeekday[wd] } : null,
    favoriteTime: favT ? { time: favT[0], sessions: favT[1] } : null,
    byWeekday, byHour,
    cardio: { totals: { sessions: cardio.totals.sessions, minutes: cardio.totals.minutes, distance: cardio.totals.distance, zone2Min: cardio.totals.zone2Min }, activities: cardio.activities },
  };
}
