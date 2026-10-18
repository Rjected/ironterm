// Everything the views show, computed once from bootstrap data.

import type { HevyWorkout } from "../shared/hevy";
import { BIG_FOUR, LIFTS, matchLift } from "../shared/lifts";
import { planDay, replay, type PlannedSession, type ProgramDef, type ProgramState } from "../shared/program";
import { buildProgram } from "../shared/programs";
import {
  addDays, dailyCells, durationMin, liftHistory, localDate, weekStart, weekStreak, weeklyTotals, workoutVolumeKg,
  type DayCell, type GraphMetric, type LiftPoint,
} from "../shared/stats";
import { fromKg, loadStep, roundTo, type Unit } from "../shared/units";
import type { WhoopWorkout } from "../shared/whoop";
import { applyRamp, rampInfo, sessionMainLifts, type RampInfo } from "../shared/travel";
import { detectStalls, programStalls, type LiftStall, type ProgramStall } from "../shared/stall";
import { loadFor, personalChart, type RpeChart } from "../shared/rpe";
import type { Bootstrap } from "./api";

export interface Derived {
  unit: Unit;
  tz: string;
  liftMap?: Record<string, string>;
  today: string;
  workouts: HevyWorkout[]; // newest first
  byId: Map<string, HevyWorkout>;
  cells: Map<string, DayCell>;
  def: ProgramDef | null;
  state: ProgramState | null;
  next: PlannedSession | null;
  lifts: Record<string, LiftPoint[]>;
  liftKeys: string[]; // lifts with any history, big four first
  weekly: ReturnType<typeof weeklyTotals>;
  streak: { current: number; best: number };
  sessions52: number;
  sessionsPrev52: number;
  thisWeek: number;
  vol7: number;
  volPrev7: number;
  avgMin: number;
  stalls: Record<string, LiftStall>;
  whoop: WhoopWorkout[];
  progStalls: ProgramStall[];
  /** personal RPE chart for a lift (cached) */
  rpe: (lift: string) => RpeChart;
  /** current 28-day best e1RM */
  e1rmNow: (lift: string) => number | null;
  /** a program day's plan with RPE-only sets given loads from your chart */
  plan: (dayIndex?: number) => PlannedSession | null;
  /** coming back from a break: what the ramp is doing to the next session, in words */
  reentry: RampInfo | null;
}

export function derive(b: Bootstrap, metric: GraphMetric): Derived {
  const unit = b.program?.unit ?? b.settings.unit;
  const tz = b.settings.tz;
  const today = b.today;
  const asc = [...b.workouts].sort((a, c) => a.start_time.localeCompare(c.start_time));
  const map = b.program?.liftMap;

  const def = b.program ? buildProgram(b.program) : null;
  const state = def && b.program ? replay(def, b.program, asc, { today, reentry: b.settings.reentry === false ? false : undefined }) : null;
  const cfg = b.program;

  const seen = new Set<string>();
  for (const w of asc) for (const e of w.exercises) { const l = matchLift(e.title, e.exercise_template_id, map); if (l) seen.add(l); }
  const liftKeys = [...BIG_FOUR.filter((l) => seen.has(l)), ...Object.keys(LIFTS).filter((l) => seen.has(l) && !(BIG_FOUR as readonly string[]).includes(l))];
  const lifts = Object.fromEntries(liftKeys.map((l) => [l, liftHistory(asc, l, unit, tz, map)]));

  const cells = dailyCells(asc, tz, metric);
  const y1 = addDays(today, -364), y2 = addDays(today, -729);
  let sessions52 = 0, sessionsPrev52 = 0, vol7 = 0, volPrev7 = 0, mins = 0, minsN = 0;
  const wk = weekStart(today);
  let thisWeek = 0;
  for (const w of asc) {
    const d = localDate(w.start_time, tz);
    if (d >= y1) { sessions52++; mins += durationMin(w); minsN++; }
    else if (d >= y2) sessionsPrev52++;
    if (d >= wk) thisWeek++;
    const v = fromKg(workoutVolumeKg(w), unit);
    if (d > addDays(today, -7)) vol7 += v;
    else if (d > addDays(today, -14)) volPrev7 += v;
  }

  const charts = new Map<string, RpeChart>();
  const rpe = (lift: string) => {
    if (!charts.has(lift)) charts.set(lift, personalChart(asc, lift, unit, { tz, map }));
    return charts.get(lift)!;
  };
  const e1rmNow = (lift: string) => {
    const pts = lifts[lift] ?? liftHistory(asc, lift, unit, tz, map);
    const recent = pts.filter((p) => p.date > addDays(today, -28));
    return recent.length ? Math.max(...recent.map((p) => p.e1rm)) : pts.length ? pts[pts.length - 1].e1rm : null;
  };
  const plan = (dayIndex?: number): PlannedSession | null => {
    if (!def || !cfg || !state) return null;
    const p = planDay(def, cfg, state, dayIndex ?? state.dayIndex);
    for (const ex of p.exercises) {
      const e1 = e1rmNow(ex.lift);
      if (!e1) continue;
      const step = loadStep(LIFTS[ex.lift]?.kind ?? "barbell", unit, def.microplates);
      for (const s of ex.sets) if (s.rpe && !s.weight && !s.ofTop) { s.weight = roundTo(loadFor(rpe(ex.lift), e1, s.reps, s.rpe), step); s.est = true; }
    }
    // Coming back from a break: lighter on purpose (the engine won't count it against you).
    return state.reentry && (dayIndex == null || dayIndex === state.dayIndex) ? applyRamp(p, state.reentry, unit, def) : p;
  };
  const next = plan();

  return {
    unit, tz, today, liftMap: map,
    stalls: detectStalls(lifts, today),
    whoop: b.whoop?.workouts ?? [],
    progStalls: def && state ? programStalls(def, state, { unit }) : [],
    rpe, e1rmNow, plan,
    reentry: state?.reentry ? rampInfo(state.reentry, sessionMainLifts(next), cfg?.templateId) : null,
    workouts: [...asc].reverse(),
    byId: new Map(asc.map((w) => [w.id, w])),
    cells, def, state, next, lifts, liftKeys,
    weekly: weeklyTotals(asc, tz, unit),
    streak: weekStreak(cells, today, def ? Math.min(3, def.sessionsPerWeek) : 3),
    sessions52, sessionsPrev52, thisWeek, vol7, volPrev7,
    avgMin: minsN ? mins / minsN : 0,
  };
}

/** Value of a lift's e1RM `days` ago (closest session on or before). */
export function e1rmAt(points: LiftPoint[], date: string): number | null {
  let v: number | null = null;
  for (const p of points) { if (p.date <= date) v = p.e1rm; else break; }
  // No session since `date` means there's no change to report.
  if (!points.length || points[points.length - 1].date <= date) return null;
  return v;
}

/** Rolling best e1RM — smooths out light days so the trend reads cleanly. */
export function rollingBest(points: LiftPoint[], windowDays = 28): { date: string; v: number }[] {
  return points.map((p, i) => {
    let best = p.e1rm;
    for (let j = i - 1; j >= 0 && points[j].date > addDays(p.date, -windowDays); j--) best = Math.max(best, points[j].e1rm);
    return { date: p.date, v: best };
  });
}
