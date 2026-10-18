// Generic program engine.
//
// A program is pure data (ProgramDef): a rotation of days, each with slots, and each slot has a
// progression rule. The engine never stores "current weights". It replays your Hevy history
// against the program from its start date, so editing or deleting a workout in Hevy just
// changes the replay. Adding a new spreadsheet program means writing one ProgramTemplate
// (see programs/*.ts and README "Programs").
//
// Progression kinds:
//   stages   linear progression through rep schemes (GZCLP, StrongLifts, Starting Strength,
//            GreySkull…): add weight on success, step down a stage / deload / retest on failure.
//   percent  sets as % of a training max (or RPE targets), optionally a different table per
//            week (5/3/1, Candito, Smolov, Sheiko, Juggernaut…); TM can move from AMRAP results.
//   double   double progression in a rep range (3×8–12): add weight once every set hits the top.
//   fixed    no progression (accessories / bodyweight); just shows what you did last time.

import type { HevyWorkout } from "./hevy";
import { LIFTS, matchLift } from "./lifts";
import { fmt, fromKg, loadStep, roundTo, type Unit } from "./units";

// ───────────────────────── definitions ─────────────────────────

export type Tier = "T1" | "T2" | "T3" | "MAIN" | "SUPP" | "ACC";

export interface Weights {
  lb: number;
  kg: number;
}

export interface Stage {
  sets: number;
  reps: number;
  /** last set is "as many reps as possible" */
  amrap: boolean;
}

export interface PercentSet {
  /** fraction of the training max (0.85). Omit for RPE-only sets — the lifter picks the load. */
  pct?: number;
  /** target RPE (e.g. 8) — shown alongside or instead of a load */
  rpe?: number;
  reps: number;
  /** top of a rep range (8–12) */
  repsMax?: number;
  amrap?: boolean;
  /** AMRAP rep target, for amrapVsTarget TM rules (SBS, Juggernaut) */
  target?: number;
  /** fixed load added on top of the percentage (Smolov Jr weeks 2–3: 70% + 10 lb) */
  add?: Weights;
  /** `pct` is of the e1RM of today's top set of this exercise (back-offs after an RPE top single). */
  ofTop?: boolean;
}

export type TmRule =
  /** nSuns: reps on one AMRAP set → number of TM increments (rows: reps ≥ minReps) */
  | { type: "amrapTable"; setIndex: number; table: { minReps: number; increments: number }[]; applyAt?: "now" | "weekEnd"; useLast?: boolean;
      /** nSuns 4-day: the bench 1+ set also moves the press TM by the same number of increments */
      alsoLifts?: string[] }
  /** SBS / Juggernaut: reps beyond (or short of) the set's target → TM change. The last row
   *  with diff ≤ (reps − target) applies. pct = fraction of TM; increments = × tmIncrement. */
  | { type: "amrapVsTarget"; setIndex: number; table: { diff: number; pct?: number; increments?: number }[]; allSets?: boolean; applyAt?: "now" | "weekEnd";
      /** SBS: each planned set not done at the target weight counts as one rep short (or worse) */
      penalizeMissingSets?: boolean;
      /** read the last set done at the target weight (the AMRAP itself) instead of the best one */
      useLast?: boolean }
  /** RTS-style: new TM = e1RM of that set × pct */
  | { type: "e1rm"; setIndex: number; pct: number }
  /** GZCL VDIP: total reps across the sets done at the prescribed weight → TM change (rows: total ≥ minReps) */
  | { type: "totalReps"; table: { minReps: number; increments?: number; pct?: number }[]; applyAt?: "now" | "weekEnd" }
  /** Candito: any prescribed set that falls short of its reps cuts the max by pct */
  | { type: "missCut"; pct: number; setIndex?: number };

export type Progression =
  | {
      kind: "stages";
      stages: Stage[];
      /** How a session counts as a success. */
      advance: { type: "baseVolume" } | { type: "amrapAtLeast"; reps: number };
      /** What happens when the last stage fails. */
      onFinalFail:
        | { type: "retest"; rmReps: number; pct: number }
        | { type: "reset"; bumpIncrements: number }
        | { type: "deload"; pct: number }
        | { type: "deloadBy"; amount: Weights }
        | { type: "hold" };
      increment: Weights;
      /** Consecutive failed sessions before stepping down / deloading (StrongLifts: 3). Default 1. */
      failsBeforeAction?: number;
      /** GreySkull: AMRAP of at least `reps` on the last set earns `increments` jumps instead of one. */
      amrapBonus?: { reps: number; increments: number };
    }
  | {
      kind: "percent";
      /** Whose training max the percentages are of. */
      tmLift: string;
      /** One table per program week (cycled, or by week for finite blocks). One table = every week. */
      weeks: PercentSet[][];
      tmRule?: TmRule;
    }
  | {
      kind: "double";
      sets: number;
      reps: [number, number];
      increment: Weights;
      /** last set AMRAP (e.g. Reddit PPL "3×8–12, last set AMRAP") */
      amrapLast?: boolean;
    }
  | {
      kind: "fixed";
      sets: number;
      reps: number;
      repsMax?: number;
      amrapLast?: boolean;
      /** "60s", "to failure", "bodyweight"… */
      note?: string;
    };

export interface SlotDef {
  id: string;
  lift: string;
  tier: Tier;
  progression: Progression;
  restSeconds?: number;
  note?: string;
}

export interface DayDef {
  id: string;
  name: string;
  slots: SlotDef[];
  /** Program weeks (0-based) this day is scheduled in. Omit = every week. */
  weeks?: number[];
}

export interface ProgramDef {
  templateId: string;
  name: string;
  days: DayDef[];
  /** Sessions per calendar week, for display and adherence stats. */
  sessionsPerWeek: number;
  /**
   * A "week" is one pass through `days`. With a cycle, week = passes % weeks (5/3/1) or, if
   * finite, the program ends after `weeks` passes (Candito, Smolov Jr, Juggernaut).
   */
  cycle?: { weeks: number; tmIncrease?: Record<string, Weights>; weekNames?: string[]; finite?: boolean;
    /** apply tmIncrease every N weeks instead of once per cycle (works inside finite blocks too) */
    tmIncreaseEvery?: number };
  /** TM increment unit per lift for amrapTable / amrapVsTarget increments. */
  tmIncrement?: Record<string, Weights>;
  /** What the maxes are called in setup: "Training max", "1RM", "5RM"… */
  maxLabel?: string;
  microplates?: boolean;
  /** Short instructions shown on the program page. */
  notes?: string[];
}

export interface OptionDef {
  key: string;
  label: string;
  choices: { value: string; label: string }[];
  default: string;
}

/** What the user sets up once: which template, options, and where they're starting from. */
export interface ProgramConfig {
  templateId: string;
  options: Record<string, string>;
  unit: Unit;
  /** ISO date. Workouts before this aren't replayed. */
  startDate: string;
  /** Starting weight per stage / double / fixed slot, in `unit`. */
  startWeights: Record<string, number>;
  /** Optional starting stage per slot (e.g. you're already on 6x2+). */
  startStages?: Record<string, number>;
  /** Training max per lift, in `unit`. */
  trainingMaxes: Record<string, number>;
  /** Per-slot increment override, in `unit`. */
  increments?: Record<string, number>;
  /** Lift key -> Hevy exercise_template_id, overriding title matching. */
  liftMap?: Record<string, string>;
  /** Hevy routine id -> day id, recorded when we push routines. */
  routineDays?: Record<string, string>;
  /** Manual corrections applied when replay reaches `date`. */
  adjustments?: Adjustment[];
}

export interface Adjustment {
  date: string;
  slotId?: string;
  weight?: number;
  stage?: number;
  lift?: string;
  tm?: number;
  note?: string;
}

export type ProgramCategory = "gzcl" | "novice" | "strength" | "powerlifting" | "hypertrophy" | "peaking";

export interface ProgramTemplate {
  id: string;
  name: string;
  author: string;
  source: string;
  summary: string;
  category: ProgramCategory;
  level: "beginner" | "intermediate" | "advanced";
  /** e.g. [3] or [3, 4] */
  daysPerWeek: number[];
  /** Length of one run in weeks; omit for open-ended programs. */
  weeks?: number;
  options: OptionDef[];
  build(options: Record<string, string>): ProgramDef;
  /** Reasonable starting values to prefill setup with. */
  defaults?(unit: Unit): Partial<Pick<ProgramConfig, "startWeights" | "trainingMaxes" | "increments">>;
}

// ───────────────────────── state ─────────────────────────

export interface SlotState {
  weight: number;
  stage: number;
  /** weight this slot last started stage 0 at (for T2 resets) */
  stage0Weight: number;
  retest: boolean;
  /** consecutive failed sessions at the current weight */
  fails?: number;
}

export type Outcome = "success" | "hold" | "fail" | "stage-down" | "deload" | "retest-next" | "retested" | "reset" | "tm-up" | "tm-down" | "missed";

export interface SlotResult {
  slotId: string;
  lift: string;
  tier: Tier;
  scheme: string;
  weight: number;
  outcome: Outcome;
  reps: number[];
  amrapReps?: number;
  note: string;
}

export interface LogEntry {
  workoutId: string;
  date: string;
  dayId: string;
  week: number;
  results: SlotResult[];
}

export interface ProgramState {
  dayIndex: number;
  /** completed passes through the day list ("weeks") */
  rotations: number;
  slots: Record<string, SlotState>;
  tms: Record<string, number>;
  log: LogEntry[];
  /** finite programs: all weeks done */
  complete?: boolean;
  /** TM changes waiting for the end of the current week (tmRule applyAt: "weekEnd") */
  pendingTm?: Record<string, number>;
  /** coming back from a break: the next `total − done` sessions are a lighter ramp */
  reentry?: Reentry;
}

export interface Reentry {
  gapDays: number;
  /** ramp sessions planned (enough for every main lift to get its exposures, capped) */
  total: number;
  done: number;
  /** ramp exposures so far per lift; a lift that hit its normal weight jumps to its need */
  seen?: Record<string, number>;
}

export interface PlannedSet {
  weight: number;
  reps: number;
  repsMax?: number;
  amrap: boolean;
  pct?: number;
  rpe?: number;
  /** pct is of today's top-set e1RM, load chosen on the day */
  ofTop?: boolean;
  /** load estimated from your RPE chart (RPE-only set) */
  est?: boolean;
}

export interface PlannedExercise {
  slotId: string;
  lift: string;
  tier: Tier;
  scheme: string;
  sets: PlannedSet[];
  restSeconds: number;
  /** e.g. "Retest 5RM: work up to a hard set of 5" */
  note?: string;
  /** what happens next, e.g. "Hit 15 reps → 190 next time" */
  ifSuccess?: string;
  ifFail?: string;
}

export interface PlannedSession {
  dayIndex: number;
  dayId: string;
  dayName: string;
  week: number;
  weekName?: string;
  exercises: PlannedExercise[];
}

// ───────────────────────── helpers ─────────────────────────

const inc = (w: Weights, unit: Unit) => (unit === "lb" ? w.lb : w.kg);

export function slotIncrement(def: ProgramDef, cfg: ProgramConfig, slot: SlotDef): number {
  const o = cfg.increments?.[slot.id];
  if (o != null) return o;
  const p = slot.progression;
  return p.kind === "stages" || p.kind === "double" ? inc(p.increment, cfg.unit) : 0;
}

function step(def: ProgramDef, cfg: ProgramConfig, lift: string) {
  return loadStep(LIFTS[lift]?.kind ?? "barbell", cfg.unit, def.microplates);
}

export function schemeLabel(st: Stage): string {
  return `${st.sets}×${st.reps}${st.amrap ? "+" : ""}`;
}

/** Slots that need a starting weight (vs a training max). */
export const usesStartWeight = (s: SlotDef) => s.progression.kind !== "percent";

/** Program week index for a number of completed passes. */
export function weekIndex(def: ProgramDef, rotations: number): number {
  if (!def.cycle) return 0;
  return def.cycle.finite ? Math.min(rotations, def.cycle.weeks - 1) : rotations % def.cycle.weeks;
}

export const isScheduled = (day: DayDef, week: number) => !day.weeks || day.weeks.includes(week);

/** Every slot once (a slot id can appear on several days and share one progression). */
export function allSlots(def: ProgramDef): SlotDef[] {
  const seen = new Set<string>();
  return def.days.flatMap((d) => d.slots).filter((s) => !seen.has(s.id) && !!seen.add(s.id));
}

/** First scheduled day at or after `from` in pass `rotations`, wrapping into later passes. */
export function firstScheduled(def: ProgramDef, from: number, rotations: number): { dayIndex: number; rotations: number } {
  let i = from, r = rotations;
  for (let guard = 0; guard < def.days.length * ((def.cycle?.weeks ?? 1) + 2); guard++) {
    if (i >= def.days.length) { i = 0; r++; }
    if (isScheduled(def.days[i], weekIndex(def, r))) return { dayIndex: i, rotations: r };
    i++;
  }
  return { dayIndex: 0, rotations };
}

// ───────────────────────── init / plan ─────────────────────────

export function initialState(def: ProgramDef, cfg: ProgramConfig): ProgramState {
  const slots: Record<string, SlotState> = {};
  for (const s of allSlots(def)) {
    if (!usesStartWeight(s)) continue;
    const w = cfg.startWeights[s.id] ?? 0;
    slots[s.id] = { weight: w, stage: cfg.startStages?.[s.id] ?? 0, stage0Weight: w, retest: false, fails: 0 };
  }
  const start = firstScheduled(def, 0, 0);
  return { dayIndex: start.dayIndex, rotations: start.rotations, slots, tms: { ...cfg.trainingMaxes }, log: [] };
}

function defaultRest(t: Tier) {
  return t === "T1" || t === "MAIN" ? 180 : t === "T2" || t === "SUPP" ? 120 : 75;
}

function setsLabel(sets: PlannedSet[]): string {
  // "5×5", "3×8–12", "9 sets · 1+ 5+", "3×3 @8"
  if (!sets.length) return "";
  const same = sets.every((s) => s.reps === sets[0].reps && s.repsMax === sets[0].repsMax && s.weight === sets[0].weight && s.rpe === sets[0].rpe);
  const r = (s: PlannedSet) => `${s.reps}${s.repsMax ? "–" + s.repsMax : ""}`;
  const amraps = sets.filter((s) => s.amrap);
  if (same) return `${sets.length}×${r(sets[0])}${amraps.length ? "+" : ""}${sets[0].rpe ? ` @${sets[0].rpe}` : ""}`;
  return `${sets.length} sets${amraps.length ? " · " + amraps.map((s) => `${s.reps}+`).join(" ") : ""}`;
}

export function planDay(def: ProgramDef, cfg: ProgramConfig, state: ProgramState, dayIndex = state.dayIndex): PlannedSession {
  const day = def.days[dayIndex];
  const week = weekIndex(def, state.rotations);
  const exercises = day.slots.map((slot): PlannedExercise => {
    const rest = slot.restSeconds ?? defaultRest(slot.tier);
    const base = { slotId: slot.id, lift: slot.lift, tier: slot.tier, restSeconds: rest };
    const p = slot.progression;
    const s = state.slots[slot.id];
    const i = slotIncrement(def, cfg, slot);

    if (p.kind === "stages") {
      const st = p.stages[s.stage];
      if (s.retest && p.onFinalFail.type === "retest") {
        const { rmReps, pct } = p.onFinalFail;
        return {
          ...base, scheme: `${rmReps}RM TEST`, sets: [{ weight: 0, reps: rmReps, amrap: false }],
          note: `Retest: work up to a hard set of ${rmReps}. New ${slot.tier} weight = ${Math.round(pct * 100)}% of it.`,
        };
      }
      const sets = Array.from({ length: st.sets }, (_, k) => ({ weight: s.weight, reps: st.reps, amrap: st.amrap && k === st.sets - 1 }));
      const last = s.stage === p.stages.length - 1;
      const fails = s.fails ?? 0;
      const allowed = p.failsBeforeAction ?? 1;
      let ifSuccess: string, ifFail: string;
      if (p.advance.type === "amrapAtLeast") {
        ifSuccess = `${p.advance.reps}+ on last set → ${fmt(s.weight + i)}`;
        ifFail = `fewer → stay at ${fmt(s.weight)}`;
      } else {
        ifSuccess = `${st.sets * st.reps} reps → ${fmt(s.weight + i)}`;
        if (p.amrapBonus) ifSuccess += ` (${p.amrapBonus.reps}+ on last → ${fmt(s.weight + i * p.amrapBonus.increments)})`;
        if (fails + 1 < allowed) ifFail = `miss → retry ${fmt(s.weight)} (${fails + 1}/${allowed})`;
        else if (!last) ifFail = `miss → ${schemeLabel(p.stages[s.stage + 1])} @ ${fmt(s.weight)}`;
        else if (p.onFinalFail.type === "retest") ifFail = `miss → retest ${p.onFinalFail.rmReps}RM`;
        else if (p.onFinalFail.type === "reset") ifFail = `miss → reset ${schemeLabel(p.stages[0])} @ ${fmt(s.stage0Weight + p.onFinalFail.bumpIncrements * i)}`;
        else if (p.onFinalFail.type === "deload") ifFail = `miss → deload to ${fmt(roundTo(s.weight * (1 - p.onFinalFail.pct), step(def, cfg, slot.lift)))}`;
        else if (p.onFinalFail.type === "deloadBy") ifFail = `miss → drop to ${fmt(s.weight - inc(p.onFinalFail.amount, cfg.unit))}`;
        else ifFail = `miss → stay`;
      }
      return { ...base, scheme: schemeLabel(st), sets, ifSuccess, ifFail, note: slot.note };
    }

    if (p.kind === "double") {
      const [lo, hi] = p.reps;
      const sets = Array.from({ length: p.sets }, (_, k) => ({ weight: s.weight, reps: lo, repsMax: hi, amrap: !!p.amrapLast && k === p.sets - 1 }));
      return { ...base, scheme: `${p.sets}×${lo}–${hi}${p.amrapLast ? "+" : ""}`, sets, ifSuccess: `all sets ${hi}+ → ${fmt(s.weight + i)}`, ifFail: `fewer → add reps at ${fmt(s.weight)}`, note: slot.note };
    }

    if (p.kind === "fixed") {
      const sets = Array.from({ length: p.sets }, (_, k) => ({ weight: s.weight, reps: p.reps, repsMax: p.repsMax, amrap: !!p.amrapLast && k === p.sets - 1 }));
      return { ...base, scheme: setsLabel(sets), sets, note: [p.note, slot.note].filter(Boolean).join(" · ") || undefined };
    }

    const tm = state.tms[p.tmLift] ?? 0;
    const table = p.weeks[week % p.weeks.length] ?? [];
    const sets: PlannedSet[] = table.map((ps) => ({
      weight: ps.pct != null && !ps.ofTop ? roundTo(tm * ps.pct + (ps.add ? inc(ps.add, cfg.unit) : 0), step(def, cfg, slot.lift)) : 0,
      reps: ps.reps, repsMax: ps.repsMax, amrap: !!ps.amrap, pct: ps.pct, rpe: ps.rpe, ofTop: ps.ofTop,
    }));
    let ifSuccess: string | undefined;
    const tmi = def.tmIncrement?.[p.tmLift] ? inc(def.tmIncrement[p.tmLift], cfg.unit) : cfg.unit === "lb" ? 5 : 2.5;
    if (p.tmRule?.type === "amrapTable") {
      ifSuccess = p.tmRule.table.filter((r) => r.increments > 0).map((r) => `${r.minReps}+ → TM +${fmt(r.increments * tmi)}`).join(" · ");
    } else if (p.tmRule?.type === "amrapVsTarget") {
      const t = table[p.tmRule.setIndex];
      if (t) ifSuccess = `target ${t.target ?? t.reps} reps on the ${t.reps}+ set; each rep over/under moves the TM`;
    } else if (p.tmRule?.type === "totalReps") {
      ifSuccess = p.tmRule.table.filter((r) => (r.increments ?? 0) > 0 || (r.pct ?? 0) > 0).map((r) => `${r.minReps}+ total → +${r.pct != null ? fmt(r.pct * 100) + "%" : fmt((r.increments ?? 0) * tmi)}`).join(" · ");
    } else if (p.tmRule?.type === "missCut") {
      ifSuccess = `miss a rep → ${def.maxLabel ?? "TM"} −${fmt(p.tmRule.pct * 100)}%`;
    } else if (p.tmRule?.type === "e1rm") {
      ifSuccess = `new TM = ${Math.round(p.tmRule.pct * 100)}% of e1RM from set ${p.tmRule.setIndex + 1}`;
    }
    const usesPct = table.some((x) => x.pct != null && !x.ofTop);
    return {
      ...base, scheme: setsLabel(sets), sets, ifSuccess,
      note: [usesPct ? (p.tmLift !== slot.lift ? `% of ${LIFTS[p.tmLift]?.short ?? p.tmLift} ${def.maxLabel ?? "TM"} ${fmt(tm)}` : `${def.maxLabel ?? "TM"} ${fmt(tm)}`) : "", slot.note].filter(Boolean).join(" · ") || undefined,
    };
  });
  // Percent tables can be empty for a week (e.g. no BBB on deload week).
  return { dayIndex, dayId: day.id, dayName: day.name, week, weekName: def.cycle?.weekNames?.[week], exercises: exercises.filter((e) => e.sets.length) };
}

// ───────────────────────── evaluate ─────────────────────────

interface Performed {
  weight: number;
  reps: number;
}

function performedFor(w: HevyWorkout, lift: string, cfg: ProgramConfig): Performed[][] {
  // one array per matching exercise block, so a lift done twice in a day stays separate
  return w.exercises
    .filter((e) => matchLift(e.title, e.exercise_template_id, cfg.liftMap) === lift)
    .map((e) =>
      e.sets
        .filter((s) => s.type !== "warmup" && (s.reps ?? 0) > 0)
        .map((s) => ({ weight: fromKg(s.weight_kg ?? 0, cfg.unit), reps: s.reps ?? 0 })),
    );
}

const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30));

/** The weight most sets were done at (ties → heavier), rounded off kg→lb float noise. */
function modeWeight(sets: Performed[]): number {
  const n = new Map<number, number>();
  for (const x of sets) { const r = Math.round(x.weight * 2) / 2; n.set(r, (n.get(r) ?? 0) + 1); }
  let best = 0, c = -1;
  for (const [wt, k] of n) if (k > c || (k === c && wt > best)) { best = wt; c = k; }
  return best;
}

/** Sets at or near the main working weight. Drops warmups people log as normal sets but keeps ramps (85/95/95/85/85). */
function workingSets(sets: Performed[]): Performed[] {
  if (!sets.length) return [];
  const loaded = sets.filter((x) => x.weight > 0);
  const m = modeWeight(loaded.length ? loaded : sets);
  return sets.filter((x) => x.weight >= m * 0.95 - 0.5);
}

const medianReps = (xs: Performed[]) => (xs.length ? [...xs].map((x) => x.reps).sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

/**
 * Which stage the logged sets look like (six doubles = 6×2+).
 * exact: right number of sets with reps near the scheme. attempt: fewer sets or missed reps
 * near the scheme (a session that went badly). none: doesn't resemble any stage (3×10 on T1).
 */
function inferStage(stages: Stage[], work: Performed[], current: number): { k: number; how: "exact" | "attempt" | "none" } {
  // Reps distinguish T1 stages (3s vs 2s vs 1s) so low-rep schemes must match exactly.
  // An AMRAP last set only has a floor: 1×5+ done for 8 is still that scheme.
  const repsNear = (st: Stage, xs: Performed[]) => {
    const tolerance = st.reps <= 3 ? 0 : 1;
    if (!st.amrap) return Math.abs(medianReps(xs) - st.reps) <= tolerance;
    const last = xs[xs.length - 1];
    // one rep short on the AMRAP is still an attempt at this scheme (a miss, judged later)
    const lastOk = !!last && last.reps >= Math.max(1, st.reps - 1 - tolerance);
    const body = xs.slice(0, -1);
    return body.length ? lastOk && Math.abs(medianReps(body) - st.reps) <= tolerance : lastOk;
  };
  // More sets than the scheme: judge the last N (an extra set at working weight is usually a warmup).
  const exact = (st: Stage) => {
    if (Math.abs(work.length - st.sets) <= (st.sets >= 6 ? 1 : 0)) return repsNear(st, work);
    return work.length > st.sets && repsNear(st, work.slice(-st.sets));
  };
  if (exact(stages[current])) return { k: current, how: "exact" };
  const e = stages.findIndex(exact);
  if (e >= 0) return { k: e, how: "exact" };
  const cur = stages[current];
  if (work.length >= 2 && work.length < cur.sets && repsNear(cur, work)) return { k: current, how: "attempt" };
  // Right number of sets but reps fell short (5×5 → 5,5,5,4,3).
  if (stages.length === 1 && work.length >= 2 && work.length <= cur.sets && medianReps(work) <= cur.reps && medianReps(work) >= cur.reps - 2) return { k: current, how: "attempt" };
  const a = stages.findIndex((st) => work.length >= 2 && work.length < st.sets && repsNear(st, work));
  if (a >= 0) return { k: a, how: "attempt" };
  return { k: current, how: "none" };
}

/** How well logged sets fit a slot: 2 = matches its current scheme, 0.75 = lift present, 0 = absent. */
function slotFit(slot: SlotDef, state: ProgramState, sets: Performed[]): number {
  if (!sets.length) return 0;
  const p = slot.progression;
  if (p.kind !== "stages") return 1;
  if (state.slots[slot.id]?.retest) return 1.5;
  const work = workingSets(sets);
  const how = inferStage(p.stages, work, state.slots[slot.id]?.stage ?? 0).how;
  return how === "exact" ? 2 : how === "attempt" ? 1.25 : 0.75;
}

type Eval = { next: SlotState; res: SlotResult };

function evalStages(def: ProgramDef, cfg: ProgramConfig, slot: SlotDef, s: SlotState, sets: Performed[]): Eval {
  const p = slot.progression as Extract<Progression, { kind: "stages" }>;
  const i = slotIncrement(def, cfg, slot);

  if (s.retest && p.onFinalFail.type === "retest") {
    const { rmReps, pct } = p.onFinalFail;
    const atRm = sets.filter((x) => x.reps >= rmReps).map((x) => x.weight);
    const rm = atRm.length ? Math.max(...atRm) : Math.max(0, ...sets.map((x) => e1rm(x.weight, x.reps))) / (1 + rmReps / 30);
    const w = roundTo(rm * pct, step(def, cfg, slot.lift));
    return {
      next: { weight: w, stage: 0, stage0Weight: w, retest: false, fails: 0 },
      res: { slotId: slot.id, lift: slot.lift, tier: slot.tier, reps: sets.map((x) => x.reps), scheme: `${rmReps}RM TEST`, weight: rm, outcome: "retested", note: `${rmReps}RM ${fmt(rm)} → ${schemeLabel(p.stages[0])} @ ${fmt(w)}` },
    };
  }

  // Follow the lifter. Working sets are those near the main weight, so unmarked warmups drop
  // out, and progression builds from what was actually lifted rather than what was prescribed.
  // That keeps the program in step when you go heavier, lighter, or run a different stage.
  const workAll = workingSets(sets);
  const lifted = modeWeight(workAll);
  const tol = Math.max(1, s.weight * 0.02);
  const w = Math.abs(lifted - s.weight) <= tol ? s.weight : lifted;
  const { k, how } = inferStage(p.stages, workAll, s.stage);
  const st = p.stages[k];
  const work = workAll.length > st.sets && Math.abs(workAll.length - st.sets) > (st.sets >= 6 ? 1 : 0) ? workAll.slice(-st.sets) : workAll;
  const cur: SlotState = { ...s, weight: w, stage: k, stage0Weight: k === 0 && s.stage !== 0 ? w : s.stage0Weight, fails: w !== s.weight || k !== s.stage ? 0 : s.fails ?? 0 };
  const amrapReps = work.length ? work[Math.min(work.length, st.sets) - 1].reps : undefined;
  const base = { slotId: slot.id, lift: slot.lift, tier: slot.tier, scheme: schemeLabel(st), weight: w, reps: work.map((x) => x.reps) };
  const off = w !== s.weight ? ` (planned ${fmt(s.weight)})` : "";

  if (p.advance.type === "amrapAtLeast") {
    // T3: only the last set matters ("15/15/25").
    const ok = (amrapReps ?? 0) >= p.advance.reps;
    return ok
      ? { next: { ...cur, weight: w + i, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${amrapReps} on last set${off} → ${fmt(w + i)}` } }
      : { next: cur, res: { ...base, outcome: "hold", amrapReps, note: `${amrapReps ?? 0} on last set, need ${p.advance.reps}${off}` } };
  }

  if (how === "none") {
    // Not an attempt at this scheme (different rep range, a single set…): log it, change nothing.
    return { next: s, res: { ...base, outcome: "hold", amrapReps, note: `off-scheme (${work.length}×${medianReps(work)}), not counted` } };
  }
  // Base volume: each of the first `sets` working sets counts up to its prescribed reps.
  const vol = work.slice(0, st.sets).reduce((a, x) => a + Math.min(x.reps, st.reps), 0);
  const need = st.sets * st.reps;
  if (vol >= need) {
    const n = p.amrapBonus && st.amrap && (amrapReps ?? 0) >= p.amrapBonus.reps ? p.amrapBonus.increments : 1;
    return { next: { ...cur, weight: w + i * n, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${vol}/${need}${off} → ${fmt(w + i * n)}${n > 1 ? ` (${amrapReps} on AMRAP: ×${n})` : ""}` } };
  }
  const fails = (cur.fails ?? 0) + 1;
  const allowed = p.failsBeforeAction ?? 1;
  if (fails < allowed) {
    return { next: { ...cur, fails }, res: { ...base, outcome: "fail", amrapReps, note: `${vol}/${need}${off} → retry ${fmt(w)} (miss ${fails}/${allowed})` } };
  }
  if (k < p.stages.length - 1) {
    const nx = p.stages[k + 1];
    return { next: { ...cur, stage: k + 1, fails: 0 }, res: { ...base, outcome: "stage-down", amrapReps, note: `${vol}/${need}${off} → ${schemeLabel(nx)} @ ${fmt(w)}` } };
  }
  const f = p.onFinalFail;
  if (f.type === "retest") return { next: { ...cur, retest: true, fails: 0 }, res: { ...base, outcome: "retest-next", amrapReps, note: `${vol}/${need} → retest ${f.rmReps}RM` } };
  if (f.type === "reset") {
    const nw = cur.stage0Weight + f.bumpIncrements * i;
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "reset", amrapReps, note: `${vol}/${need} → reset ${schemeLabel(p.stages[0])} @ ${fmt(nw)}` } };
  }
  if (f.type === "deloadBy") {
    const nw = Math.max(0, w - inc(f.amount, cfg.unit));
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "deload", amrapReps, note: `${vol}/${need} → drop to ${fmt(nw)}` } };
  }
  if (f.type === "deload") {
    const nw = roundTo(w * (1 - f.pct), step(def, cfg, slot.lift));
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "deload", amrapReps, note: `${vol}/${need} → deload ${Math.round(f.pct * 100)}% to ${fmt(nw)}` } };
  }
  return { next: { ...cur, fails: 0 }, res: { ...base, outcome: "hold", amrapReps, note: `${vol}/${need}` } };
}

function evalDouble(def: ProgramDef, cfg: ProgramConfig, slot: SlotDef, s: SlotState, sets: Performed[]): Eval {
  const p = slot.progression as Extract<Progression, { kind: "double" }>;
  const i = slotIncrement(def, cfg, slot);
  const work = workingSets(sets);
  const w = modeWeight(work);
  const [lo, hi] = p.reps;
  const reps = work.slice(0, p.sets).map((x) => x.reps);
  const base = { slotId: slot.id, lift: slot.lift, tier: slot.tier, scheme: `${p.sets}×${lo}–${hi}`, weight: w, reps };
  const top = reps.length >= p.sets && reps.every((r) => r >= hi);
  if (top) return { next: { ...s, weight: w + i }, res: { ...base, outcome: "success", note: `all sets ${hi}+ → ${fmt(w + i)}` } };
  return { next: { ...s, weight: w }, res: { ...base, outcome: "hold", note: `${reps.join("/")} at ${fmt(w)}, need ${hi} on all ${p.sets}` } };
}

function evalFixed(slot: SlotDef, s: SlotState, sets: Performed[]): Eval {
  const work = workingSets(sets);
  const w = modeWeight(work);
  return {
    next: { ...s, weight: w },
    res: { slotId: slot.id, lift: slot.lift, tier: slot.tier, scheme: "", weight: w, reps: work.map((x) => x.reps), outcome: "success", note: `${work.length} sets${w ? ` @ ${fmt(w)}` : ""}` },
  };
}

function evalPercent(def: ProgramDef, cfg: ProgramConfig, slot: SlotDef, state: ProgramState, planned: PlannedExercise, sets: Performed[]): { tmDelta: number; tmSet?: number; also?: Record<string, number>; res: SlotResult } {
  const p = slot.progression as Extract<Progression, { kind: "percent" }>;
  const base = { slotId: slot.id, lift: slot.lift, tier: slot.tier, scheme: planned.scheme, weight: Math.max(0, ...planned.sets.map((x) => x.weight)), reps: sets.map((x) => x.reps) };
  const tm = state.tms[p.tmLift] ?? 0;
  const tmi = def.tmIncrement?.[p.tmLift] ? inc(def.tmIncrement[p.tmLift], cfg.unit) : cfg.unit === "lb" ? 5 : 2.5;
  const rule = p.tmRule;
  if (rule?.type === "totalReps") {
    const top = Math.max(0, ...planned.sets.map((x) => x.weight));
    const tol = Math.max(1, top * 0.03);
    const total = sets.filter((x) => x.weight >= top - tol).reduce((a, x) => a + x.reps, 0);
    const rows = [...rule.table].sort((x, y) => x.minReps - y.minReps);
    let row = rows[0];
    for (const r of rows) if (total >= r.minReps) row = r;
    const d = row ? (row.pct != null ? Math.round(tm * row.pct * 100) / 100 : (row.increments ?? 0) * tmi) : 0;
    return { tmDelta: d, res: { ...base, outcome: d > 0 ? "tm-up" : d < 0 ? "tm-down" : "hold", note: `${total} total reps → ${d ? `${def.maxLabel ?? "TM"} ${fmt(tm)} → ${fmt(tm + d)}` : "holds"}` } };
  }
  if (rule?.type === "missCut") {
    const check = rule.setIndex != null ? [planned.sets[rule.setIndex]].filter(Boolean) : planned.sets.filter((x) => x.weight > 0 && !x.amrap);
    const short = check.filter((ps) => {
      const tol = Math.max(1, ps.weight * 0.03);
      return !sets.some((x) => x.weight >= ps.weight - tol && x.reps >= ps.reps);
    });
    if (!short.length) return { tmDelta: 0, res: { ...base, outcome: "success", note: `${sets.length}/${planned.sets.length} sets, all reps made` } };
    const d = -Math.round(tm * rule.pct * 100) / 100;
    return { tmDelta: d, res: { ...base, outcome: "tm-down", note: `missed reps at ${short.map((x) => fmt(x.weight)).join(", ")} → ${def.maxLabel ?? "TM"} ${fmt(tm)} → ${fmt(tm + d)}` } };
  }
  const target = rule && "setIndex" in rule && rule.setIndex != null ? planned.sets[rule.setIndex] : undefined;
  if (!rule || !target) {
    const amrapIdx = planned.sets.findIndex((x) => x.amrap);
    const a = amrapIdx >= 0 ? bestNear(sets, planned.sets[amrapIdx].weight) : undefined;
    const ok = amrapIdx < 0 ? sets.length >= Math.ceil(planned.sets.length * 0.8) : (a ?? 0) >= planned.sets[amrapIdx].reps;
    return { tmDelta: 0, res: { ...base, outcome: ok ? "success" : "hold", amrapReps: a, note: amrapIdx >= 0 ? `${a ?? 0} reps on ${planned.sets[amrapIdx].reps}+ set` : `${sets.length}/${planned.sets.length} sets` } };
  }
  // allSets: every set at the target weight must reach it (AllPro "12 on both sets").
  const a = ((rule.type === "amrapVsTarget" && rule.allSets) ? worstNear(sets, target.weight)
    : ("useLast" in rule && rule.useLast) ? lastNear(sets, target.weight)
    : bestNear(sets, target.weight)) ?? 0;

  if (rule.type === "e1rm") {
    const set = sets.filter((x) => x.weight >= target.weight - Math.max(1, target.weight * 0.03)).sort((x, y) => e1rm(y.weight, y.reps) - e1rm(x.weight, x.reps))[0];
    if (!set) return { tmDelta: 0, res: { ...base, outcome: "hold", note: "top set not found" } };
    const ntm = roundTo(e1rm(set.weight, set.reps) * rule.pct, step(def, cfg, p.tmLift));
    return { tmDelta: 0, tmSet: ntm, res: { ...base, outcome: ntm >= tm ? "tm-up" : "tm-down", amrapReps: set.reps, note: `${fmt(set.weight)}×${set.reps} → TM ${fmt(tm)} → ${fmt(ntm)}` } };
  }

  let d = 0;
  let label = `${target.reps}+`;
  let also: Record<string, number> | undefined;
  if (rule.type === "amrapTable") {
    let n = 0;
    for (const r of rule.table) if (a >= r.minReps) n = r.increments;
    d = n * tmi;
    if (n && rule.alsoLifts) also = Object.fromEntries(rule.alsoLifts.map((l) => [l, n * (def.tmIncrement?.[l] ? inc(def.tmIncrement[l], cfg.unit) : tmi)]));
  } else {
    const want = p.weeks[weekIndex(def, state.rotations) % p.weeks.length]?.[rule.setIndex]?.target ?? target.reps;
    label = `target ${want}`;
    let diff = a - want;
    if (rule.penalizeMissingSets) {
      const done = sets.filter((x) => x.weight >= target.weight - Math.max(1, target.weight * 0.03)).length;
      const missing = Math.max(0, planned.sets.filter((x) => Math.abs(x.weight - target.weight) <= Math.max(1, target.weight * 0.03)).length - done);
      if (missing) diff = Math.min(diff, -1 - missing);
    }
    const rows = [...rule.table].sort((x, y) => x.diff - y.diff);
    let row = rows[0];
    for (const r of rows) if (diff >= r.diff) row = r;
    // Not rounded: small % changes must accumulate; prescribed loads get rounded when planned.
    d = row ? (row.pct != null ? Math.round(tm * row.pct * 100) / 100 : (row.increments ?? 0) * tmi) : 0;
  }
  return {
    tmDelta: d,
    also,
    res: { ...base, outcome: d > 0 ? "tm-up" : d < 0 ? "tm-down" : "hold", amrapReps: a, note: d ? `${a} reps (${label}) → TM ${fmt(tm)} → ${fmt(tm + d)}` : `${a} reps (${label}) → TM holds` },
  };
}

function lastNear(sets: Performed[], weight: number): number | undefined {
  const tol = Math.max(1, weight * 0.03);
  const r = sets.filter((x) => x.weight >= weight - tol);
  return r.length ? r[r.length - 1].reps : undefined;
}

function worstNear(sets: Performed[], weight: number): number | undefined {
  const tol = Math.max(1, weight * 0.03);
  const r = sets.filter((x) => x.weight >= weight - tol).map((x) => x.reps);
  return r.length ? Math.min(...r) : undefined;
}

function bestNear(sets: Performed[], weight: number): number | undefined {
  const tol = Math.max(1, weight * 0.03);
  const r = sets.filter((x) => x.weight >= weight - tol).map((x) => x.reps);
  return r.length ? Math.max(...r) : undefined;
}

/** Apply one logged workout to the program as `dayIndex`. */
export function applyWorkout(def: ProgramDef, cfg: ProgramConfig, state: ProgramState, w: HevyWorkout, dayIndex: number): ProgramState {
  const plan = planDay(def, cfg, state, dayIndex);
  const day = def.days[dayIndex];
  const slots = { ...state.slots };
  const tms = { ...state.tms };
  const pending = { ...state.pendingTm };
  const results: SlotResult[] = [];
  const used = new Map<string, number>(); // lift -> how many exercise blocks consumed

  for (const slot of day.slots) {
    const planned = plan.exercises.find((e) => e.slotId === slot.id);
    if (!planned) continue;
    const blocks = performedFor(w, slot.lift, cfg);
    const n = used.get(slot.lift) ?? 0;
    used.set(slot.lift, n + 1);
    const sets = blocks[n] ?? [];
    if (!sets.length) {
      results.push({ slotId: slot.id, lift: slot.lift, tier: slot.tier, scheme: planned.scheme, weight: planned.sets[0]?.weight ?? 0, outcome: "missed", reps: [], note: "not logged" });
      continue;
    }
    const p = slot.progression;
    if (p.kind === "percent") {
      const { tmDelta, tmSet, also, res } = evalPercent(def, cfg, slot, state, planned, sets);
      const later = !!p.tmRule && "applyAt" in p.tmRule && p.tmRule.applyAt === "weekEnd";
      const deltas: Record<string, number> = { ...also };
      if (tmDelta) deltas[p.tmLift] = (deltas[p.tmLift] ?? 0) + tmDelta;
      if (tmSet != null) tms[p.tmLift] = tmSet;
      for (const [lift, d] of Object.entries(deltas)) {
        if (later) pending[lift] = (pending[lift] ?? 0) + d;
        else tms[lift] = (tms[lift] ?? 0) + d;
      }
      results.push(res);
      continue;
    }
    const r = p.kind === "stages" ? evalStages(def, cfg, slot, slots[slot.id], sets) : p.kind === "double" ? evalDouble(def, cfg, slot, slots[slot.id], sets) : evalFixed(slot, slots[slot.id], sets);
    slots[slot.id] = r.next;
    results.push({ ...r.res, scheme: r.res.scheme || planned.scheme });
  }

  const next = firstScheduled(def, dayIndex + 1, state.rotations);
  if (next.rotations > state.rotations) {
    for (const [lift, d] of Object.entries(pending)) tms[lift] = (tms[lift] ?? 0) + d;
    for (const k of Object.keys(pending)) delete pending[k];
  }
  // Once-per-cycle TM bumps (5/3/1) when a pass boundary lands on a cycle boundary.
  if (def.cycle?.tmIncrease && (!def.cycle.finite || def.cycle.tmIncreaseEvery)) {
    const every = def.cycle.tmIncreaseEvery ?? def.cycle.weeks;
    for (let r = state.rotations + 1; r <= next.rotations; r++) {
      if (def.cycle.finite && r >= def.cycle.weeks) break;
      if (r % every === 0) for (const [lift, w8] of Object.entries(def.cycle.tmIncrease)) if (tms[lift] != null) tms[lift] += inc(w8, cfg.unit);
    }
  }
  const entry: LogEntry = { workoutId: w.id, date: w.start_time, dayId: day.id, week: plan.week, results };
  const complete = !!def.cycle?.finite && next.rotations >= def.cycle.weeks;
  return { dayIndex: next.dayIndex, rotations: next.rotations, slots, tms, log: [...state.log, entry], complete, pendingTm: pending };
}

/** Which program day a Hevy workout was, or -1 if it isn't a program session. */
export function matchDay(def: ProgramDef, cfg: ProgramConfig, state: ProgramState, w: HevyWorkout): number {
  // Logged in gym mode: the workout carries its program day.
  const tag = w.description?.match(/\[ht:([^\]]+)\]/)?.[1];
  if (tag) {
    const i = def.days.findIndex((d) => d.id === tag);
    if (i >= 0) return i;
  }
  if (w.routine_id && cfg.routineDays?.[w.routine_id]) {
    const i = def.days.findIndex((d) => d.id === cfg.routineDays![w.routine_id!]);
    if (i >= 0) return i;
  }
  const order = w.exercises.map((e) => matchLift(e.title, e.exercise_template_id, cfg.liftMap)).filter((x): x is string => !!x);
  const lifts = new Set(order);
  const week = weekIndex(def, state.rotations);
  // Score each day by how well every slot's logged sets fit its scheme (5×3+ vs 3×10 tells
  // A1 from A2 even though both have squat and bench). Bonuses for the main lift going first,
  // being scheduled this week, and being the expected next day break ties.
  let best = -1, bestScore = 0;
  for (let k = 0; k < def.days.length; k++) {
    const i = (state.dayIndex + k) % def.days.length;
    const d = def.days[i];
    // Anchor on the day's first lift we can recognize in Hevy (pause deadlift etc. need a custom mapping).
    const anchor = d.slots.find((x) => (LIFTS[x.lift]?.hevy.length ?? 0) > 0 || cfg.liftMap?.[x.lift]) ?? d.slots[0];
    if (!anchor || !lifts.has(anchor.lift)) continue;
    const used = new Map<string, number>();
    let score = 0;
    for (const slot of d.slots) {
      const n = used.get(slot.lift) ?? 0;
      used.set(slot.lift, n + 1);
      score += slotFit(slot, state, performedFor(w, slot.lift, cfg)[n] ?? []) * (slot === anchor ? 1.5 : 1);
    }
    score += (order[0] === anchor.lift ? 0.5 : 0) + (k === 0 ? 0.25 : 0) + (isScheduled(d, week) ? 1.5 : 0);
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

function applyAdjustments(state: ProgramState, adj: Adjustment[]): ProgramState {
  const slots = { ...state.slots };
  const tms = { ...state.tms };
  for (const a of adj) {
    if (a.slotId && slots[a.slotId]) {
      const s = { ...slots[a.slotId] };
      if (a.weight != null) { s.weight = a.weight; if ((a.stage ?? s.stage) === 0) s.stage0Weight = a.weight; }
      if (a.stage != null) s.stage = a.stage;
      s.retest = false;
      s.fails = 0;
      slots[a.slotId] = s;
    }
    if (a.lift && a.tm != null) tms[a.lift] = a.tm;
  }
  return { ...state, slots, tms };
}

export interface ReplayOptions {
  /** Ramp back in after breaks. Default on; set false to disable. */
  reentry?: false | { minGapDays?: number };
  /** today's local date, so a break you're still on shows up in the next plan */
  today?: string;
}

/**
 * Lighter sessions to take after a break of `gapDays` (0 = none). Strength holds for ~4 weeks off
 * and comes back in about half the break after that (docs/training/COMEBACK.md), so longer
 * breaks get longer ramps.
 */
export function rampLength(gapDays: number, minGapDays = 9): number {
  if (gapDays < minGapDays) return 0;
  return gapDays < 14 ? 2 : gapDays < 28 ? 3 : gapDays < 56 ? 4 : gapDays < 112 ? 6 : 8;
}

/**
 * Lower-body lifts ramp one exposure slower: squats and lunges load big muscles eccentrically at
 * long lengths, which is what makes the first sessions back so sore (the repeated bout effect
 * fades within ~3 weeks). Upper-body strength comes back at the same rate, with far less soreness.
 */
export const rampsSlower = (lift: string): boolean => LIFTS[lift] ? !LIFTS[lift].upper : false;

/** Ramp exposures a lift needs before it's back to full load and volume. */
export function rampNeed(r: Reentry, lift: string): number {
  return Math.max(1, rampLength(r.gapDays, 0)) + (rampsSlower(lift) ? 1 : 0);
}

/** How far through its ramp a lift is (0 = first exposure, 1 = done). */
export function rampProgress(r: Reentry, lift?: string): number {
  if (!lift || !r.seen) return r.total ? r.done / r.total : 1;
  return Math.min(1, (r.seen[lift] ?? 0) / rampNeed(r, lift));
}

/** Main and supplemental work decides how long the ramp lasts; accessories just come along. */
const rampLifts = (def: ProgramDef): string[] =>
  [...new Set(def.days.flatMap((d) => d.slots).filter((x) => x.tier !== "ACC" && x.tier !== "T3").map((x) => x.lift))];

/**
 * Start a ramp from `state`'s next day: enough sessions for every main lift to get its exposures
 * (squat on 2 of 4 days needs more sessions than squat every day), at most twice the base length.
 */
export function startRamp(def: ProgramDef, state: ProgramState, gapDays: number, minGapDays = 9): Reentry | undefined {
  const base = rampLength(gapDays, minGapDays);
  if (!base) return undefined;
  const r: Reentry = { gapDays, total: base, done: 0, seen: {} };
  const lifts = rampLifts(def);
  const seen: Record<string, number> = {};
  let pos = { dayIndex: state.dayIndex, rotations: state.rotations };
  let n = 0;
  while (n < base * 2 && lifts.some((l) => (seen[l] ?? 0) < rampNeed(r, l))) {
    for (const l of new Set(def.days[pos.dayIndex].slots.map((x) => x.lift))) seen[l] = (seen[l] ?? 0) + 1;
    n++;
    pos = firstScheduled(def, pos.dayIndex + 1, pos.rotations);
  }
  return { ...r, total: Math.max(base, n) };
}

/** Lifts where you hit your normal (un-ramped) top weight for its reps: you've beaten the ramp. */
function beatRamp(def: ProgramDef, cfg: ProgramConfig, state: ProgramState, w: HevyWorkout, dayIndex: number): string[] {
  const plan = planDay(def, cfg, state, dayIndex);
  const used = new Map<string, number>();
  const out: string[] = [];
  for (const e of plan.exercises) {
    const n = used.get(e.lift) ?? 0;
    used.set(e.lift, n + 1);
    const top = Math.max(0, ...e.sets.map((x) => x.weight));
    if (!top) continue;
    const reps = Math.min(...e.sets.filter((x) => x.weight >= top).map((x) => x.reps));
    const tol = Math.max(1, top * 0.02);
    if ((performedFor(w, e.lift, cfg)[n] ?? []).some((x) => x.weight >= top - tol && x.reps >= reps)) out.push(e.lift);
  }
  return out;
}

/** Count one ramp session: exposures for what you did, early finish for lifts you beat. */
function advanceRamp(def: ProgramDef, r: Reentry, results: SlotResult[], beaten: string[]): Reentry | undefined {
  const seen = { ...r.seen };
  for (const l of new Set(results.filter((x) => x.reps.length > 0).map((x) => x.lift))) seen[l] = (seen[l] ?? 0) + 1;
  for (const l of beaten) seen[l] = Math.max(seen[l] ?? 0, rampNeed(r, l));
  const next: Reentry = { ...r, done: r.done + 1, seen };
  const allBack = rampLifts(def).every((l) => (seen[l] ?? 0) >= rampNeed(r, l));
  return next.done >= r.total || allBack ? undefined : next;
}

const daysBetween = (a: string, b: string) => Math.floor((Date.parse(b) - Date.parse(a)) / 864e5);

/**
 * During re-entry a session can only keep or improve your progression: anything that would lower
 * a weight, step down a stage, count a miss, or drop a TM is ignored. Lifting your pre-break
 * weight still counts as a pass.
 */
function guardReentry(before: ProgramState, after: ProgramState): ProgramState {
  const slots = { ...after.slots };
  const tms = { ...after.tms };
  const pending = { ...after.pendingTm };
  const r = before.reentry!;
  const tag = `re-entry ${r.done + 1}/${r.total} after ${r.gapDays} days`;
  const entry = after.log[after.log.length - 1];
  const results = entry.results.map((res) => {
    const b = before.slots[res.slotId], a = slots[res.slotId];
    let reverted = false;
    if (b && a && (a.weight < b.weight || a.stage > b.stage || (a.fails ?? 0) > (b.fails ?? 0) || (a.retest && !b.retest))) {
      slots[res.slotId] = b;
      reverted = true;
    }
    if (tms[res.lift] != null && before.tms[res.lift] != null && tms[res.lift] < before.tms[res.lift]) { tms[res.lift] = before.tms[res.lift]; reverted = true; }
    if ((pending[res.lift] ?? 0) < (before.pendingTm?.[res.lift] ?? 0)) { pending[res.lift] = before.pendingTm?.[res.lift] ?? 0; reverted = true; }
    if (reverted || res.outcome === "missed") return { ...res, outcome: "hold" as Outcome, note: `${tag}: not counted (${res.note})` };
    return { ...res, note: `${tag} · ${res.note}` };
  });
  return { ...after, slots, tms, pendingTm: pending, log: [...after.log.slice(0, -1), { ...entry, results }] };
}

/** Replay history (oldest first) from cfg.startDate into the current program state. */
export function replay(def: ProgramDef, cfg: ProgramConfig, workouts: HevyWorkout[], opts: ReplayOptions = {}): ProgramState {
  let state = initialState(def, cfg);
  const adj = [...(cfg.adjustments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  let ai = 0;
  const minGap = opts.reentry === false ? Infinity : opts.reentry?.minGapDays ?? 9;
  let lastSession: string | null = null;
  const sorted = workouts.filter((w) => w.start_time >= cfg.startDate).sort((a, b) => a.start_time.localeCompare(b.start_time));
  for (const w of sorted) {
    if (state.complete) break;
    const due: Adjustment[] = [];
    while (ai < adj.length && adj[ai].date <= w.start_time) due.push(adj[ai++]);
    if (due.length) state = applyAdjustments(state, due);
    const d = matchDay(def, cfg, state, w);
    if (d < 0) continue;
    // Gaps are measured between program sessions; hotel-gym or other workouts don't reset them.
    if (lastSession && Number.isFinite(minGap)) {
      const r = startRamp(def, state, daysBetween(lastSession, w.start_time), minGap);
      if (r) state = { ...state, reentry: r };
    }
    const before = state;
    let next = applyWorkout(def, cfg, state, w, d);
    if (before.reentry && before.reentry.done < before.reentry.total) {
      next = guardReentry(before, next);
      const results = next.log[next.log.length - 1].results;
      next = { ...next, reentry: advanceRamp(def, before.reentry, results, beatRamp(def, cfg, before, w, d)) };
    }
    state = next;
    lastSession = w.start_time;
  }
  if (ai < adj.length) state = applyAdjustments(state, adj.slice(ai));
  // Still on a break: the next session starts a ramp.
  if (opts.today && lastSession && Number.isFinite(minGap)) {
    const r = startRamp(def, state, daysBetween(lastSession.slice(0, 10), opts.today), minGap);
    if (r) state = { ...state, reentry: r };
  }
  return state;
}
