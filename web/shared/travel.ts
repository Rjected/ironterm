// Travel: trips, hotel-gym maintenance sessions, and the ramp back after a break.
//
// Why the ramp is mostly about volume: in one long-term training log, the first squat session after 9–17 days
// off averages only ~3% below the pre-break e1RM and recovers within 2–3 sessions — strength
// barely moves. The post-trip soreness is the "repeated bout effect" wearing off (protection
// against eccentric damage fades over a couple of weeks without the stimulus; McHugh 2003,
// Nosaka et al. 2001). So the ramp trims sets/reps and AMRAPs first, load only a little.
//
// Maintenance: strength holds for several weeks on as little as one session a week at a decent
// intensity with ~1/3 the volume (Bickel, Cross & Bamman 2011; Spiering et al. 2021 review).
// Leg work with a slow lowering keeps the eccentric exposure up, which is what blunts the
// soreness on return.

import type { HevyWorkout } from "./hevy";
import { LIFTS, matchLift } from "./lifts";
import type { PlannedExercise, PlannedSession, PlannedSet, ProgramDef, Reentry } from "./program";
import { addDays, epley, localDate } from "./stats";
import { fromKg, loadStep, roundTo, type Unit } from "./units";

// ───────────────────────── trips ─────────────────────────

export type GymAccess = "none" | "hotel" | "full";

export interface Equipment {
  /** heaviest dumbbell, in the user's unit; 0/undefined = none */
  dumbbells?: number;
  bench?: boolean;
  cable?: boolean;
  machines?: boolean;
  pullupBar?: boolean;
  barbell?: boolean;
}

export interface Trip {
  id: string;
  name: string;
  /** local dates, inclusive */
  start: string;
  end: string;
  gym: GymAccess;
  equipment?: Equipment;
  /** maintenance sessions you're aiming for per week (default 2; 1 is enough to hold strength) */
  perWeek?: number;
}

export const onTrip = (trips: Trip[], date: string) => trips.find((t) => date >= t.start && date <= t.end) ?? null;

/** Dates within a trip to suggest maintenance sessions on (spread out, ≥2 days apart). */
export function travelDays(trip: Trip): string[] {
  if (trip.gym === "full") return [];
  const per = Math.max(1, trip.perWeek ?? 2);
  const len = Math.floor((Date.parse(trip.end) - Date.parse(trip.start)) / 864e5) + 1;
  const spacing = Math.max(2, Math.floor(7 / per));
  const out: string[] = [];
  // Skip the first day (travel day) when the trip is long enough.
  for (let i = len > 3 ? 1 : 0; i < len; i += spacing) out.push(addDays(trip.start, i));
  return out;
}

// ───────────────────────── maintenance sessions ─────────────────────────

const ex = (id: string, lift: string, sets: number, reps: number, repsMax: number | undefined, weight: number, note?: string, tier: PlannedExercise["tier"] = "ACC"): PlannedExercise => ({
  slotId: id, lift, tier, scheme: `${sets}×${reps}${repsMax ? "–" + repsMax : ""} @7`, restSeconds: tier === "MAIN" ? 120 : 75, note,
  sets: Array.from({ length: sets }, (): PlannedSet => ({ weight, reps, repsMax, amrap: false, rpe: 7 })),
});

const SLOW = "3-second lowering: keeps the squat soreness down when you're back";

/**
 * Two short sessions (A: squat-pattern first, B: single-leg + hinge first) built from what the
 * hotel gym has. Loads are starting suggestions from your e1RMs, capped by the heaviest dumbbell;
 * aim for ~3 reps in reserve.
 */
export function travelSessions(trip: Trip, e1rm: (lift: string) => number | null, unit: Unit): PlannedSession[] {
  const eq: Equipment = trip.gym === "none" ? {} : trip.equipment ?? { dumbbells: unit === "lb" ? 50 : 22, bench: true, cable: true };
  const db = eq.dumbbells ?? 0;
  const step = loadStep("dumbbell", unit);
  const per = (lift: string, frac: number) => {
    const e = e1rm(lift);
    return db && e ? Math.min(db, Math.max(step, roundTo(e * frac, step))) : db ? roundTo(db * 0.6, step) : 0;
  };
  const a: PlannedExercise[] = [], b: PlannedExercise[] = [];

  // squat pattern
  if (db) a.push(ex("ta-sq", "gobletSquat", 3, 8, 12, Math.min(db, per("squat", 0.25)), SLOW, "MAIN"));
  else a.push(ex("ta-sq", "lunge", 3, 12, 15, 0, `bodyweight · ${SLOW}`, "MAIN"));
  b.push(ex("tb-sq", "bulgarianSplitSquat", 3, 8, 12, db ? per("squat", 0.12) : 0, `per leg · ${SLOW}`, "MAIN"));

  // hinge
  if (eq.machines) a.push(ex("ta-hinge", "legCurl", 3, 10, 12, 0, "pick a weight with ~3 reps left"));
  else if (db) a.push(ex("ta-hinge", "dbRdl", 3, 8, 12, per("deadlift", 0.22), "per hand · slow lowering"));
  else a.push(ex("ta-hinge", "gluteHamRaise", 3, 5, 8, 0, "or single-leg RDL, bodyweight"));
  b.push(db ? ex("tb-hinge", "dbRdl", 3, 10, 12, per("deadlift", 0.2), "per hand") : ex("tb-hinge", "backExtension", 3, 12, 15, 0, "or hip bridges"));

  // push
  if (db && eq.bench) a.push(ex("ta-push", "dbBench", 3, 8, 12, per("bench", 0.3)));
  else a.push(ex("ta-push", "pushUp", 3, 10, 20, 0, "slow lowering; feet elevated if easy"));
  b.push(db ? ex("tb-push", "dbOhp", 3, 8, 12, per("ohp", 0.3)) : ex("tb-push", "pushUp", 3, 8, 15, 0, "pike push-ups for shoulders"));

  // pull
  if (eq.cable) a.push(ex("ta-pull", "cableRow", 3, 10, 12, 0, "pick a weight with ~3 reps left"));
  else if (db) a.push(ex("ta-pull", "dbRow", 3, 10, 12, per("bench", 0.3)));
  else a.push(ex("ta-pull", "invertedRow", 3, 8, 12, 0, "under a sturdy table or with a towel in a door"));
  if (eq.pullupBar) b.push(ex("tb-pull", "pullUp", 3, 5, 10, 0));
  else if (eq.cable) b.push(ex("tb-pull", "latPulldown", 3, 10, 12, 0));
  else b.push(db ? ex("tb-pull", "dbRow", 3, 10, 12, per("bench", 0.3)) : ex("tb-pull", "invertedRow", 3, 8, 12, 0));

  // small stuff
  if (db) a.push(ex("ta-acc", "lateralRaise", 2, 12, 20, Math.min(db, unit === "lb" ? 15 : 7.5)));
  b.push(ex("tb-core", "plank", 3, 1, undefined, 0, "30–45 s"));
  b.push(ex("tb-calf", "calfRaise", 2, 15, 20, 0, "single leg, slow"));

  const label = trip.gym === "none" ? "no gym" : "hotel gym";
  return [
    { dayIndex: -1, dayId: "TA", dayName: `Travel A · ${label}`, week: 0, exercises: a },
    { dayIndex: -2, dayId: "TB", dayName: `Travel B · ${label}`, week: 0, exercises: b },
  ];
}

// ───────────────────────── re-entry ramp ─────────────────────────

/** Weight and volume multipliers for ramp session `done` (0-based) of `total`. */
export function rampFactors(r: Reentry): { load: number; volume: number } {
  const startLoad = r.gapDays < 14 ? 0.92 : r.gapDays < 28 ? 0.88 : 0.82;
  const startVol = r.gapDays < 14 ? 0.6 : 0.5;
  const t = r.total ? r.done / r.total : 1;
  return { load: startLoad + (1 - startLoad) * t, volume: startVol + (1 - startVol) * t };
}

/**
 * Lighten a planned session for re-entry: main lifts a little lighter with no all-out AMRAP,
 * volume work (T2/supplemental/accessories) cut harder. The engine won't count these sessions
 * against your progression.
 */
export function applyRamp(plan: PlannedSession, r: Reentry, unit: Unit, def?: ProgramDef): PlannedSession {
  const { load, volume } = rampFactors(r);
  const note = `Re-entry ${r.done + 1}/${r.total} after ${r.gapDays} days off: lighter on purpose (${Math.round(load * 100)}% load, ~${Math.round(volume * 100)}% volume). Won't count against your progression; hitting your normal weight still counts.`;
  const exercises = plan.exercises.map((e, i): PlannedExercise => {
    const step = loadStep(LIFTS[e.lift]?.kind ?? "barbell", unit, def?.microplates);
    const main = e.tier === "T1" || e.tier === "MAIN";
    const lighten = (s: PlannedSet): PlannedSet => ({
      ...s,
      weight: s.weight ? Math.max(step, roundTo(s.weight * load, step)) : 0,
      amrap: false,
      rpe: s.rpe ? Math.max(6, s.rpe - (r.done === 0 ? 1.5 : 1)) : s.rpe,
    });
    if (main) return { ...e, sets: e.sets.map(lighten), note: [i === 0 ? note : "", e.note].filter(Boolean).join(" · ") || undefined, ifSuccess: undefined, ifFail: undefined };
    // Volume work: fewer sets and a couple fewer reps.
    const n = Math.max(1, Math.round(e.sets.length * volume));
    const sets = e.sets.slice(0, n).map((s) => ({ ...lighten(s), reps: Math.max(1, Math.round(s.reps * (0.75 + 0.25 * (r.done / r.total)))), repsMax: s.repsMax ? Math.max(1, Math.round(s.repsMax * 0.8)) : undefined }));
    return { ...e, sets, scheme: `${sets.length}×${sets[0].reps} (ramp)`, ifSuccess: undefined, ifFail: undefined };
  });
  return { ...plan, exercises };
}

// ───────────────────────── your history ─────────────────────────

export interface ReturnStats {
  breaks: number;
  /** median first-session e1RM vs best before the break, as a fraction (0.97 = −3%) */
  firstSession: number | null;
  /** median sessions until back to ≥98% of the pre-break best */
  sessionsToRecover: number | null;
  examples: { from: string; to: string; days: number; before: number; first: number }[];
  summary: string;
}

/** How your returns from breaks actually went for one lift. */
export function returnStats(workouts: HevyWorkout[], lift: string, unit: Unit, tz: string, map?: Record<string, string>, minGap = 9, since = "2023-01-01"): ReturnStats {
  const sessions = [...workouts]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((w) => {
      let best = 0;
      for (const e of w.exercises) if (matchLift(e.title, e.exercise_template_id, map) === lift)
        for (const s of e.sets) if (s.type !== "warmup" && s.weight_kg && s.reps && s.reps <= 10) best = Math.max(best, epley(fromKg(s.weight_kg, unit), s.reps));
      return { date: localDate(w.start_time, tz), best };
    })
    .filter((x) => x.best > 0);
  const ratios: number[] = [], recover: number[] = [];
  const examples: ReturnStats["examples"] = [];
  for (let i = 1; i < sessions.length; i++) {
    const gap = (Date.parse(sessions[i].date) - Date.parse(sessions[i - 1].date)) / 864e5;
    if (gap < minGap || gap > 42 || sessions[i].date < since) continue;
    const before = Math.max(...sessions.slice(Math.max(0, i - 4), i).map((x) => x.best));
    const first = sessions[i].best;
    if (first < before * 0.6) continue; // a deliberately light day, not a test of strength
    ratios.push(first / before);
    examples.push({ from: sessions[i - 1].date, to: sessions[i].date, days: gap, before, first });
    const k = sessions.slice(i, i + 6).findIndex((x) => x.best >= before * 0.98);
    if (k >= 0) recover.push(k + 1);
  }
  const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
  const fs = med(ratios), sr = med(recover);
  const name = LIFTS[lift]?.name ?? lift;
  const summary = !ratios.length
    ? `Not enough breaks with ${name} on both sides to say yet.`
    : `After ${ratios.length} breaks of ${minGap}–42 days, your first ${name.toLowerCase()} session back averaged ${fs! >= 1 ? "+" : ""}${Math.round((fs! - 1) * 100)}% vs before${sr ? `, and you were back to ~100% by session ${sr}` : ""}. Strength barely drops — the ramp mostly protects against soreness.`;
  return { breaks: ratios.length, firstSession: fs, sessionsToRecover: sr, examples: examples.slice(-8), summary };
}
