// The native apps' API: one ready-to-render document per screen, built on the server from the
// same derived data the web UI uses (so the program engine and analytics live in one place).
//
//   GET  /api/app/home                 AppHome
//   GET  /api/app/gym                  AppGym
//   POST /api/app/gym/start            LiveSession          body { dayIndex?: number; empty?: boolean }
//   GET  /api/app/lifts                AppLiftList
//   GET  /api/app/lifts/{key}          AppLiftDetail
//   GET  /api/app/history?cursor&limit AppHistory           cursor = id of the last workout seen
//   GET  /api/app/workouts/{id}        AppWorkout
//   GET  /api/app/calendar?month=Y-M   AppCalendar
//   GET  /api/app/program              AppProgram
//   GET  /api/app/body?mode=ready|load AppBody
//   GET  /api/app/insights             AppInsights
//   GET  /api/app/stats                AppStats
//
// Weights are in `unit`; dates are local YYYY-MM-DD. Fields are only ever added (see snapshot.ts).

import type { Bootstrap } from "../src/api";
import { derive, type Derived } from "../src/derive";
import { evaluateAchievements, recentUnlocks, sortAchievements, type Achievement } from "./achievements";
import { cardioStats } from "./cardio";
import type { HevyWorkout } from "./hevy";
import { BIG_FOUR, LIFTS, liftName, matchLift } from "./lifts";
import { emptySession, sessionFromPlan, type LiveSession } from "./live";
import { MUSCLE, MUSCLES, type MuscleId } from "./muscles";
import { schemeLabel, type Outcome, type PlannedSession } from "./program";
import { getTemplate } from "./programs";
import { projectLift } from "./projection";
import { prWall, recentPRs } from "./prwall";
import { strengthBalance } from "./ratios";
import { analyzeHistory, analyzeProgram, defaultSchedule } from "./recovery";
import { history as dayHistory, trainingDays, upcoming, weekStatus } from "./schedule";
import { snapshot, type NextSession, type Snapshot } from "./snapshot";
import { addDays, durationMin, localDate, repPRs, weekStart, workingSets, workoutVolumeKg } from "./stats";
import { onTrip } from "./travel";
import { fromKg, type Unit } from "./units";
import { renderBodySvg } from "./anatomy-svg";

const r1 = (x: number) => Math.round(x * 10) / 10;

// ───────────────────────── home ─────────────────────────

export interface AppHome {
  snapshot: Snapshot;
  /** big-four first; e1RM now and change over 4 / 12 weeks, all-time best */
  e1rm: { lift: string; name: string; short: string; now: number; d4w: number | null; d12w: number | null; best: number }[];
  /** weekly best e1RM over the last year, big four */
  trend: { lift: string; short: string; points: { date: string; v: number }[] }[];
  /** last 26 weeks, oldest first */
  weekly: { week: string; volume: number; sessions: number; sets: number }[];
  /** plateaus and progress (stall detector + program flags) */
  watch: { lift: string; short: string; status: string; text: string; rate: number | null }[];
  /** last 30 days */
  recentPRs: { lift: string; short: string; kind: string; reps: number; weight: number; date: string }[];
}

function e1rmAt(points: { date: string; e1rm: number }[], date: string): number | null {
  const before = points.filter((p) => p.date <= date && p.date > addDays(date, -28));
  return before.length ? Math.max(...before.map((p) => p.e1rm)) : null;
}

export function appHome(b: Bootstrap, d: Derived = derive(b, b.settings.graphMetric ?? "volume")): AppHome {
  const keys = d.liftKeys;
  const e1rm = keys.slice(0, 10).flatMap((k) => {
    const pts = d.lifts[k] ?? [];
    const now = d.e1rmNow(k);
    if (!now || !pts.length) return [];
    const a = e1rmAt(pts, addDays(d.today, -28)), c = e1rmAt(pts, addDays(d.today, -84));
    return [{ lift: k, name: liftName(k), short: LIFTS[k]?.short ?? k, now: r1(now), d4w: a ? r1(now - a) : null, d12w: c ? r1(now - c) : null, best: r1(Math.max(...pts.map((p) => p.e1rm))) }];
  });
  const wk = weekStart(d.today);
  const trend = BIG_FOUR.filter((k) => d.lifts[k]?.length).map((k) => {
    const pts = d.lifts[k];
    const points: { date: string; v: number }[] = [];
    for (let i = 52; i >= 0; i--) {
      const end = addDays(wk, 7 - i * 7);
      const v = e1rmAt(pts, addDays(end, -1));
      if (v) points.push({ date: end, v: r1(v) });
    }
    return { lift: k, short: LIFTS[k]?.short ?? k, points };
  });
  const watch = [
    ...d.progStalls.map((s) => ({ lift: s.lift, short: LIFTS[s.lift]?.short ?? s.lift, status: s.severity, text: s.message, rate: null })),
    ...Object.values(d.stalls).filter((s) => s.status !== "inactive").map((s) => ({
      lift: s.lift, short: LIFTS[s.lift]?.short ?? s.lift, status: s.status, text: s.reason, rate: s.change6w != null ? r1(s.change6w * 100) : null,
    })),
  ];
  const prs = recentPRs([...d.workouts].reverse(), addDays(d.today, -30), { unit: d.unit, tz: d.tz, map: d.liftMap })
    .slice(-12).reverse()
    .map((p) => ({ lift: p.lift, short: LIFTS[p.lift]?.short ?? p.lift, kind: p.kind, reps: p.reps, weight: r1(p.weight), date: p.date }));
  return {
    snapshot: snapshot(b), e1rm, trend,
    weekly: d.weekly.slice(-26).map((w) => ({ week: w.week, volume: Math.round(w.volume), sessions: w.sessions, sets: w.sets })),
    watch, recentPRs: prs,
  };
}

// ───────────────────────── gym ─────────────────────────

export interface AppGym {
  unit: Unit;
  programName: string | null;
  live: LiveSession | null;
  /** the next program session with targets (null without a program) */
  next: NextSession | null;
  /** the same session in full (rest, slot ids, what happens next): enough to start it offline */
  plan: PlannedSession | null;
  /** every program day, to start a different one */
  days: { dayIndex: number; dayId: string; dayName: string }[];
  /** exercises you can add: the lift library (Hevy titles for matching) */
  catalog: { key: string; name: string; kind: string; hevy: string | null }[];
}

export function appGym(b: Bootstrap, d: Derived = derive(b, "volume")): AppGym {
  const snap = snapshot(b);
  return {
    unit: d.unit, programName: d.def?.name ?? null, live: (b.live as LiveSession | null | undefined) ?? null,
    next: snap.program?.next ?? null,
    plan: d.next,
    days: d.def ? d.def.days.map((x, i) => ({ dayIndex: i, dayId: x.id, dayName: x.name })) : [],
    catalog: Object.entries(LIFTS).map(([key, l]) => ({ key, name: l.name, kind: l.kind, hevy: l.hevy[0] ?? null })),
  };
}

/** The session the app starts: today's plan (or another day / empty), same as the web GYM view. */
export function startSession(b: Bootstrap, opts: { dayIndex?: number; empty?: boolean }, now = new Date().toISOString(), d: Derived = derive(b, "volume")): LiveSession {
  if (opts.empty || !d.def) return emptySession(d.unit, now);
  const plan = d.plan(opts.dayIndex);
  return plan ? sessionFromPlan(plan, d.unit, d.def.name, now) : emptySession(d.unit, now);
}

// ───────────────────────── lifts ─────────────────────────

export interface AppLiftList {
  lifts: { key: string; name: string; short: string; kind: string; e1rm: number; best: number; sessions: number; last: string; status: string | null; spark: number[] }[];
}

export function appLifts(b: Bootstrap, d: Derived = derive(b, "volume")): AppLiftList {
  return {
    lifts: d.liftKeys.flatMap((k) => {
      const pts = d.lifts[k] ?? [];
      const now = d.e1rmNow(k);
      if (!pts.length) return [];
      const spark = pts.slice(-16).map((p) => r1(p.e1rm));
      return [{
        key: k, name: liftName(k), short: LIFTS[k]?.short ?? k, kind: LIFTS[k]?.kind ?? "barbell",
        e1rm: r1(now ?? pts[pts.length - 1].e1rm), best: r1(Math.max(...pts.map((p) => p.e1rm))), sessions: pts.length,
        last: pts[pts.length - 1].date, status: d.stalls[k]?.status ?? null, spark,
      }];
    }),
  };
}

export interface AppLiftDetail {
  key: string; name: string; short: string; kind: string; unit: Unit;
  e1rm: number | null; best: { e1rm: number; date: string } | null; yearAgo: number | null;
  /** every session, oldest first */
  points: { date: string; workoutId: string; e1rm: number; topWeight: number; topReps: number; volume: number; sets: { weight: number; reps: number; rpe?: number | null }[] }[];
  /** best weight for each rep count 1–12 */
  repPRs: { reps: number; weight: number; date: string }[];
  /** records and how long they've stood */
  prWall: { reps: number; weight: number; date: string; stoodDays: number }[];
  stall: { status: string; reason: string; change6w: number | null; change12w: number | null } | null;
  projection: { status: string; note: string; current: number | null; projected: number | null; band: { date: string; lo: number; mid: number; hi: number }[] } | null;
  /** personal RPE chart rows: reps × RPE → % of e1RM */
  rpe: { reps: number; rpe: number; pct: number }[];
}

export function appLift(b: Bootstrap, key: string, d: Derived = derive(b, "volume")): AppLiftDetail | null {
  const pts = d.lifts[key];
  if (!pts?.length && !LIFTS[key]) return null;
  const points = pts ?? [];
  const best = points.length ? points.reduce((a, p) => (p.e1rm > a.e1rm ? p : a), points[0]) : null;
  const asc = [...d.workouts].reverse();
  const wall = points.length ? prWall(asc, key, d.unit, { tz: d.tz, map: d.liftMap, today: d.today, maxReps: 12 }) : null;
  const st = d.stalls[key];
  const proj = points.length >= 3 ? projectLift(points, d.today) : null;
  const chart = points.length ? d.rpe(key) : null;
  const rpe: AppLiftDetail["rpe"] = [];
  if (chart) chart.reps.forEach((reps, i) => chart.rpes.forEach((r, j) => {
    if (Number.isInteger(r) && reps <= 10) rpe.push({ reps, rpe: r, pct: Math.round(chart.pct[i][j] * 1000) / 1000 });
  }));
  return {
    key, name: liftName(key), short: LIFTS[key]?.short ?? key, kind: LIFTS[key]?.kind ?? "barbell", unit: d.unit,
    e1rm: d.e1rmNow(key) != null ? r1(d.e1rmNow(key)!) : null,
    best: best ? { e1rm: r1(best.e1rm), date: best.date } : null,
    yearAgo: e1rmAt(points, addDays(d.today, -365)),
    points: points.map((p) => ({ ...p, e1rm: r1(p.e1rm), topWeight: r1(p.topWeight), volume: Math.round(p.volume) })),
    repPRs: repPRs(points).filter((x) => x.reps <= 12).map((x) => ({ ...x, weight: r1(x.weight) })),
    prWall: (wall?.repMaxes ?? []).map((x) => ({ reps: x.reps, weight: r1(x.value), date: x.date, stoodDays: x.stoodDays })),
    stall: st ? { status: st.status, reason: st.reason, change6w: st.change6w, change12w: st.change12w } : null,
    projection: proj ? {
      status: proj.status, note: proj.note, current: proj.current != null ? r1(proj.current) : null, projected: proj.projected != null ? r1(proj.projected) : null,
      band: proj.band.map((x) => ({ date: x.date, lo: r1(x.lo), mid: r1(x.mid), hi: r1(x.hi) })),
    } : null,
    rpe,
  };
}

// ───────────────────────── history ─────────────────────────

export interface AppWorkoutSummary {
  id: string; date: string; start: string; title: string; durationMin: number; volume: number; sets: number;
  exercises: string[]; programDay: string | null; hasNotes: boolean;
}
export interface AppHistory { workouts: AppWorkoutSummary[]; next: string | null; total: number }

function summary(w: HevyWorkout, d: Derived): AppWorkoutSummary {
  const day = d.state?.log.find((e) => e.workoutId === w.id)?.dayId ?? null;
  return {
    id: w.id, date: localDate(w.start_time, d.tz), start: w.start_time, title: w.title, durationMin: Math.round(durationMin(w)),
    volume: Math.round(fromKg(workoutVolumeKg(w), d.unit)), sets: workingSets(w), exercises: w.exercises.map((e) => e.title), programDay: day,
    hasNotes: !!(w.description?.replace(/\[ht:[^\]]+\]/, "").trim() || w.exercises.some((e) => e.notes)),
  };
}

export function appHistory(b: Bootstrap, opts: { cursor?: string | null; limit?: number; q?: string }, d: Derived = derive(b, "volume")): AppHistory {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  const q = opts.q?.trim().toLowerCase();
  const all = q ? d.workouts.filter((w) => w.title.toLowerCase().includes(q) || w.exercises.some((e) => e.title.toLowerCase().includes(q))) : d.workouts;
  const start = opts.cursor ? all.findIndex((w) => w.id === opts.cursor) + 1 : 0;
  const page = all.slice(start, start + limit);
  return { workouts: page.map((w) => summary(w, d)), next: start + limit < all.length ? page[page.length - 1]?.id ?? null : null, total: all.length };
}

export interface AppWorkout {
  summary: AppWorkoutSummary;
  unit: Unit;
  /** workout note without the hidden program-day tag */
  note: string;
  exercises: { title: string; lift: string | null; note: string | null; sets: { type: string; weight: number | null; reps: number | null; rpe: number | null; distanceM: number | null; durationSec: number | null; e1rm: number | null }[] }[];
  /** how the program counted it */
  program: { dayId: string; results: { lift: string; tier: string; scheme: string; weight: number; outcome: Outcome; note: string }[] } | null;
}

export function appWorkout(b: Bootstrap, id: string, d: Derived = derive(b, "volume")): AppWorkout | null {
  const w = d.byId.get(id);
  if (!w) return null;
  const entry = d.state?.log.find((e) => e.workoutId === id);
  return {
    summary: summary(w, d), unit: d.unit,
    note: (w.description ?? "").replace(/\s*\[ht:[^\]]+\]\s*/, "\n").trim(),
    exercises: w.exercises.map((e) => ({
      title: e.title, lift: matchLift(e.title, e.exercise_template_id, d.liftMap), note: e.notes ?? null,
      sets: e.sets.map((s) => {
        const wt = s.weight_kg != null ? r1(fromKg(s.weight_kg, d.unit)) : null;
        const reps = s.reps ?? null;
        return {
          type: s.type, weight: wt, reps, rpe: s.rpe ?? null, distanceM: s.distance_meters ?? null, durationSec: s.duration_seconds ?? null,
          e1rm: wt && reps && s.type !== "warmup" ? r1(reps === 1 ? wt : wt * (1 + reps / 30)) : null,
        };
      }),
    })),
    program: entry ? { dayId: entry.dayId, results: entry.results.map((r) => ({ lift: r.lift, tier: r.tier, scheme: r.scheme, weight: r.weight, outcome: r.outcome, note: r.note })) } : null,
  };
}

// ───────────────────────── calendar ─────────────────────────

export interface AppCalendar {
  month: string;
  /** Monday-first grid covering the month (42 days) */
  days: { date: string; inMonth: boolean; status: "done" | "planned" | "missed" | "rest" | "travel" | "today"; workouts: { id: string; title: string }[]; planned: { dayId: string; dayName: string } | null; trip: string | null }[];
  week: { planned: number; done: number; left: number; label: string };
  trips: { id: string; name: string; start: string; end: string; gym: string }[];
}

export function appCalendar(b: Bootstrap, month: string | undefined, d: Derived = derive(b, "volume")): AppCalendar {
  const m = /^\d{4}-\d\d$/.test(month ?? "") ? month! : d.today.slice(0, 7);
  const first = `${m}-01`;
  const dowFirst = (new Date(first + "T12:00:00Z").getUTCDay() + 6) % 7;
  const gridStart = addDays(first, -dowFirst);
  const trips = b.trips ?? [];
  const skip = (x: string) => !!onTrip(trips, x);
  const days = trainingDays(b.settings.trainingDays, d.def);
  const trainedToday = d.workouts.some((w) => localDate(w.start_time, d.tz) === d.today);
  const plan = d.def && d.state ? upcoming(d.def, d.state, days, d.today, trainedToday, 70, skip) : [];
  const planned = new Map(plan.map((p) => [p.date, p]));
  const past = dayHistory(d.workouts, d.state?.log ?? [], d.tz, days, d.today, addDays(gridStart, -1), skip);
  const out: AppCalendar["days"] = [];
  for (let i = 0; i < 42; i++) {
    const date = addDays(gridStart, i);
    const rec = past.get(date);
    const p = planned.get(date);
    const trip = onTrip(trips, date);
    const ws = rec?.workouts ?? [];
    const status: AppCalendar["days"][number]["status"] = ws.length ? "done" : trip ? "travel" : date === d.today && p ? "today" : rec?.missed ? "missed" : p ? "planned" : "rest";
    out.push({ date, inMonth: date.slice(0, 7) === m, status, workouts: ws.map((w) => ({ id: w.id, title: w.title })), planned: p ? { dayId: p.dayId, dayName: p.dayName } : null, trip: trip?.name ?? null });
  }
  const st = weekStatus(d.workouts, d.tz, days, d.today, skip);
  return { month: m, days: out, week: { planned: st.planned, done: st.done, left: st.left, label: st.label }, trips: trips.map((t) => ({ id: t.id, name: t.name, start: t.start, end: t.end, gym: t.gym })) };
}

// ───────────────────────── program ─────────────────────────

export interface AppProgram {
  program: null | {
    name: string; author: string | null; templateId: string; unit: Unit; week: number; weekName: string | null; complete: boolean;
    reentry: { done: number; total: number } | null;
    /** every slot's current state */
    slots: { slotId: string; lift: string; name: string; tier: string; scheme: string; weight: number; stage: number; stages: string[]; ifSuccess: string | null; ifFail: string | null; note: string | null }[];
    /** next sessions with targets */
    upcoming: { date: string; dayId: string; dayName: string; exercises: { short: string; tier: string; summary: string }[] }[];
    /** most recent program decisions, newest first */
    log: { date: string; dayId: string; results: { lift: string; tier: string; scheme: string; weight: number; outcome: Outcome; note: string }[] }[];
    pushed: boolean;
  };
}

export function appProgram(b: Bootstrap, d: Derived = derive(b, "volume")): AppProgram {
  if (!d.def || !d.state || !b.program) return { program: null };
  const def = d.def, st = d.state, cfg = b.program;
  const slots: NonNullable<AppProgram["program"]>["slots"] = [];
  const seen = new Set<string>();
  // what happens next for each slot comes from the plan of a day it appears on
  const planned = new Map<string, PlannedSession["exercises"][number]>();
  def.days.forEach((_, i) => { for (const e of d.plan(i)?.exercises ?? []) if (!planned.has(e.slotId)) planned.set(e.slotId, e); });
  for (const day of def.days) for (const s of day.slots) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const ss = st.slots[s.id];
    const stages = s.progression.kind === "stages" ? s.progression.stages.map(schemeLabel) : [];
    slots.push({
      slotId: s.id, lift: s.lift, name: liftName(s.lift), tier: s.tier, scheme: stages[ss?.stage ?? 0] ?? s.progression.kind,
      weight: r1(ss?.weight ?? st.tms[s.lift] ?? 0), stage: ss?.stage ?? 0, stages,
      ifSuccess: planned.get(s.id)?.ifSuccess ?? null, ifFail: planned.get(s.id)?.ifFail ?? null, note: planned.get(s.id)?.note ?? null,
    });
  }
  const days = trainingDays(b.settings.trainingDays, def);
  const trainedToday = d.workouts.some((w) => localDate(w.start_time, d.tz) === d.today);
  const next = upcoming(def, st, days, d.today, trainedToday, 6, (x) => !!onTrip(b.trips ?? [], x));
  const upcomingOut = next.map((p) => {
    const plan = d.plan(p.dayIndex);
    return {
      date: p.date, dayId: p.dayId, dayName: p.dayName,
      exercises: (plan?.exercises ?? []).map((e) => {
        const top = Math.max(0, ...e.sets.map((x) => x.weight));
        return { short: LIFTS[e.lift]?.short ?? e.lift, tier: e.tier, summary: `${e.scheme}${top ? ` @ ${r1(top)}` : ""}` };
      }),
    };
  });
  const weekNames = def.cycle?.weekNames;
  const wk = st.rotations;
  return {
    program: {
      name: def.name, author: getTemplate(cfg.templateId)?.author ?? null, templateId: cfg.templateId, unit: cfg.unit,
      week: wk + 1, weekName: weekNames?.[wk % weekNames.length] ?? null, complete: !!st.complete,
      reentry: st.reentry ? { done: st.reentry.done, total: st.reentry.total } : null,
      slots, upcoming: upcomingOut,
      log: [...st.log].reverse().slice(0, 20).map((e) => ({ date: e.date, dayId: e.dayId, results: e.results.map((r) => ({ lift: r.lift, tier: r.tier, scheme: r.scheme, weight: r.weight, outcome: r.outcome, note: r.note })) })),
      pushed: !!cfg.routineDays && Object.keys(cfg.routineDays).length > 0,
    },
  };
}

// ───────────────────────── body ─────────────────────────

export interface AppBody {
  mode: "ready" | "load";
  sex: "m" | "f";
  /** coloured figures, standalone SVG documents */
  svgFront: string;
  svgBack: string;
  legend: [string, string];
  /** worst first for "ready", most loaded first for "load" */
  muscles: { id: MuscleId; name: string; short: string; group: string; value: number; readiness: number; readyInH: number; sets7: number; sets28: number; target: [number, number] | null; status: string | null }[];
}

export function appBody(b: Bootstrap, mode: "ready" | "load", d: Derived = derive(b, "volume")): AppBody {
  const ha = analyzeHistory(d.workouts, { now: Date.now(), liftMap: d.liftMap });
  const pa = mode === "load" && d.def && b.program ? analyzeProgram(d.def, b.program, { schedule: trainingDays(b.settings.trainingDays, d.def) ?? defaultSchedule(d.def.sessionsPerWeek) }) : null;
  const maxEff = pa ? Math.max(5, ...MUSCLES.map((m) => pa.muscles[m.id].effSets)) : 1;
  const values: Partial<Record<MuscleId, number>> = {};
  const muscles = MUSCLES.map((m) => {
    const c = ha.current[m.id];
    const value = pa ? pa.muscles[m.id].effSets / maxEff : 1 - c.readiness;
    values[m.id] = value;
    return {
      id: m.id, name: MUSCLE[m.id].name, short: MUSCLE[m.id].short, group: m.group, value: Math.round(value * 100) / 100,
      readiness: Math.round(c.readiness * 100) / 100, readyInH: Math.round(c.readyIn),
      sets7: r1(ha.last7[m.id].sets), sets28: r1(ha.last28[m.id].sets), target: MUSCLE[m.id].range ?? null,
      status: pa ? pa.muscles[m.id].status ?? null : ha.last28[m.id].status ?? null,
    };
  }).sort((a, c) => c.value - a.value);
  const sex = b.settings.sex === "female" ? "f" : "m";
  const color = mode === "load" ? "ramp" : "warn";
  return {
    mode, sex,
    svgFront: renderBodySvg(sex, "front", values, color),
    svgBack: renderBodySvg(sex, "back", values, color),
    legend: mode === "load" ? ["0", `${r1(maxEff)} hard sets/wk`] : ["fresh", "fatigued"],
    muscles,
  };
}

// ───────────────────────── insights / stats ─────────────────────────

export interface AppInsights {
  /** 12-week projections for the big four */
  projections: { lift: string; short: string; status: string; note: string; current: number | null; projected: number | null }[];
  balance: { summary: string; lagging: string[]; ratios: { name: string; value: number; lo: number; hi: number; status: "low" | "balanced" | "high" }[] } | null;
  achievements: { unlocked: number; total: number; recent: Achievement[]; next: Achievement[] };
}

export function appInsights(b: Bootstrap, d: Derived = derive(b, "volume")): AppInsights {
  const asc = [...d.workouts].reverse();
  const projections = BIG_FOUR.filter((k) => (d.lifts[k]?.length ?? 0) >= 3).map((k) => {
    const p = projectLift(d.lifts[k], d.today);
    return { lift: k, short: LIFTS[k]?.short ?? k, status: p.status, note: p.note, current: p.current != null ? r1(p.current) : null, projected: p.projected != null ? r1(p.projected) : null };
  });
  let balance: AppInsights["balance"] = null;
  try {
    const sb = strengthBalance(asc, d.unit, { today: d.today, tz: d.tz, map: d.liftMap });
    balance = {
      summary: sb.summary, lagging: sb.lagging,
      ratios: sb.ratios.map((r) => ({ name: r.label, value: Math.round(r.ratio * 100) / 100, lo: r.lo, hi: r.hi, status: r.status })),
    };
  } catch { balance = null; }
  const all = sortAchievements(evaluateAchievements({ workouts: asc, tz: d.tz, unit: d.unit, today: d.today, map: d.liftMap, programStates: d.state && d.def ? [{ name: d.def.name, state: d.state }] : [] }));
  const unlocked = all.filter((a) => a.unlockedAt);
  return {
    projections, balance,
    achievements: {
      unlocked: unlocked.length, total: all.length,
      recent: recentUnlocks(all, addDays(d.today, -60)).slice(0, 8),
      next: all.filter((a) => !a.unlockedAt).sort((a, c) => c.progress - a.progress).slice(0, 6),
    },
  };
}

export interface AppStats {
  unit: Unit;
  /** every week with training, oldest first (last 2 years) */
  weekly: { week: string; volume: number; sessions: number; sets: number }[];
  totals: { workouts: number; sessions52: number; avgMin: number; streak: { current: number; best: number } };
  cardio: { sessions: number; distance: number; durationMin: number; unit: string } | null;
}

export function appStats(b: Bootstrap, d: Derived = derive(b, "volume")): AppStats {
  let cardio: AppStats["cardio"] = null;
  try {
    const dist = b.settings.distUnit ?? (d.unit === "lb" ? "mi" : "km");
    const c = cardioStats([...d.workouts].reverse(), d.tz, dist);
    if (c.totals.sessions) cardio = { sessions: c.totals.sessions, distance: r1(c.totals.distance), durationMin: Math.round(c.totals.minutes), unit: dist };
  } catch { cardio = null; }
  return {
    unit: d.unit,
    weekly: d.weekly.filter((w) => w.week >= addDays(d.today, -730)).map((w) => ({ week: w.week, volume: Math.round(w.volume), sessions: w.sessions, sets: w.sets })),
    totals: { workouts: d.workouts.length, sessions52: d.sessions52, avgMin: Math.round(d.avgMin), streak: d.streak },
    cardio,
  };
}

// ───────────────────────── finish ─────────────────────────

export interface FinishPr { lift: string; short: string; kind: string; reps: number; weight: number; prev: number | null }

/** Records set by one workout (call after it is stored). */
export function finishPRs(b: Bootstrap, workoutId: string, d: Derived = derive(b, "volume")): FinishPr[] {
  const w = d.byId.get(workoutId);
  if (!w) return [];
  const date = localDate(w.start_time, d.tz);
  return recentPRs([...d.workouts].reverse(), date, { unit: d.unit, tz: d.tz, map: d.liftMap })
    .filter((p) => p.workoutId === workoutId)
    .map((p) => ({ lift: p.lift, short: LIFTS[p.lift]?.short ?? p.lift, kind: p.kind, reps: p.reps, weight: r1(p.weight), prev: p.prev != null ? r1(p.prev) : null }));
}
