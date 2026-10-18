// Plateau detection. Two independent views:
//
//   detectStalls   from raw lift history (LiftPoint[]): is the 28-day rolling best e1RM still
//                  climbing? Works for any lift, program or not.
//   programStalls  from a program replay log: which slots keep failing / holding / resetting,
//                  with a fix phrased in the program's own rules.
//
// Thresholds (all overridable via StallOptions):
//   windowDays   28    rolling-best window. One bad day can't hide a month of work, and a
//                      4-week window spans a typical deload.
//   stallWeeks   6     the comparison horizon and the minimum time since the last e1RM PR before
//                      "stalled". Shorter flags normal week-to-week noise (Epley e1RM wobbles
//                      ±2–3% session to session); 6 weeks is ~1.5 mesocycles.
//   stallPct     1%    rolling best up less than this over 6 weeks = flat. At an intermediate
//                      rate (~0.5–1%/month on the big lifts) 6 weeks should show >1%.
//   regressPct   3%    down more than this over 6 weeks = regressing. Bigger than e1RM noise so
//                      one off-week (rolling best absorbs it anyway) doesn't trigger it.
//   inactiveDays 21    no session in 3 weeks = inactive (detraining becomes measurable ~3 weeks).
//   minSessions  4     sessions in the last 6 weeks needed to call a plateau. Fewer and the flat
//                      line is a frequency problem, not a plateau → reported as "inactive".
//   slopeWeeks   12    window for the Theil–Sen slope.
//   maxReps      10    e1RM only from sets of ≤10 reps; Epley overestimates badly on high reps.

import type { LiftPoint } from "./stats";
import { addDays, epley } from "./stats";
import { allSlots, schemeLabel, type Progression, type ProgramDef, type ProgramState, type SlotResult, type Tier } from "./program";
import { liftName } from "./lifts";
import { fmt, type Unit } from "./units";

// ───────────────────────── lift-history stalls ─────────────────────────

export type StallStatus = "progressing" | "stalled" | "regressing" | "inactive";

export interface StallOptions {
  windowDays?: number;
  stallWeeks?: number;
  stallPct?: number;
  regressPct?: number;
  inactiveDays?: number;
  minSessions?: number;
  slopeWeeks?: number;
  maxReps?: number;
}

export const STALL_DEFAULTS: Required<StallOptions> = {
  windowDays: 28, stallWeeks: 6, stallPct: 0.01, regressPct: 0.03, inactiveDays: 21, minSessions: 4, slopeWeeks: 12, maxReps: 10,
};

export interface LiftStall {
  lift: string;
  status: StallStatus;
  /** one plain-language sentence explaining the status */
  reason: string;
  /** 28-day rolling best e1RM ending today / 6 weeks ago / 12 weeks ago (null = no sessions in that window) */
  bestNow: number | null;
  best6w: number | null;
  best12w: number | null;
  /** fractional change of the rolling best (0.02 = +2%) */
  change6w: number | null;
  change12w: number | null;
  /** all-time best e1RM (≤ maxReps sets) and when */
  pr: { date: string; e1rm: number } | null;
  weeksSincePR: number | null;
  /** Theil–Sen slope of rolling-best points over the last slopeWeeks, units/week */
  slope: number | null;
  /** slope as a fraction of bestNow per week */
  slopePct: number | null;
  sessions6w: number;
  sessions12w: number;
  lastSession: string | null;
  daysSinceLast: number | null;
  /** 0–1: how much data backs the call */
  confidence: number;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Best e1RM of a session from sets of ≤ maxReps (falls back to the stored e1RM). */
function pointE1rm(p: LiftPoint, maxReps: number): number {
  let best = 0;
  for (const s of p.sets) if (s.reps > 0 && s.reps <= maxReps) best = Math.max(best, epley(s.weight, s.reps));
  return best || (p.topReps <= maxReps ? p.e1rm : 0);
}

/** Median of pairwise slopes (Theil–Sen). Robust to a third of the points being outliers. */
export function theilSen(xs: number[], ys: number[]): number | null {
  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) if (xs[j] !== xs[i]) slopes.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
  if (!slopes.length) return null;
  slopes.sort((a, b) => a - b);
  const m = slopes.length >> 1;
  return slopes.length % 2 ? slopes[m] : (slopes[m - 1] + slopes[m]) / 2;
}

/** Status per lift from its session history (any unit; outputs are in the same unit). */
export function detectStalls(lifts: Record<string, LiftPoint[]>, today: string, opts: StallOptions = {}): Record<string, LiftStall> {
  const o = { ...STALL_DEFAULTS, ...opts };
  const out: Record<string, LiftStall> = {};
  for (const [lift, raw] of Object.entries(lifts)) out[lift] = detectOne(lift, raw, today, o);
  return out;
}

function detectOne(lift: string, raw: LiftPoint[], today: string, o: Required<StallOptions>): LiftStall {
  const pts = raw
    .filter((p) => p.date <= today)
    .map((p) => ({ date: p.date, e1: pointE1rm(p, o.maxReps) }))
    .filter((p) => p.e1 > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const best = (end: string): { v: number | null; n: number } => {
    const start = addDays(end, -o.windowDays);
    let v: number | null = null, n = 0;
    for (const p of pts) if (p.date > start && p.date <= end) { v = Math.max(v ?? 0, p.e1); n++; }
    return { v, n };
  };
  const span = o.stallWeeks * 7;
  const now = best(today), b6 = best(addDays(today, -span)), b12 = best(addDays(today, -2 * span));
  const change = (a: number | null, b: number | null) => (a != null && b ? a / b - 1 : null);
  const change6w = change(now.v, b6.v), change12w = change(now.v, b12.v);

  // all-time PR
  let pr: LiftStall["pr"] = null;
  for (const p of pts) if (!pr || p.e1 > pr.e1rm + 0.01) pr = { date: p.date, e1rm: p.e1 };
  const weeksSincePR = pr ? Math.floor(dayDiff(pr.date, today) / 7) : null;

  // slope over rolling-best points
  const slopeFrom = addDays(today, -o.slopeWeeks * 7);
  const xs: number[] = [], ys: number[] = [];
  for (const p of pts) {
    if (p.date <= slopeFrom) continue;
    const b = best(p.date).v;
    if (b == null) continue;
    xs.push(dayDiff(today, p.date) / 7);
    ys.push(b);
  }
  const slope = xs.length >= 3 ? theilSen(xs, ys) : null;
  const slopePct = slope != null && now.v ? slope / now.v : null;

  const count = (days: number) => pts.filter((p) => p.date > addDays(today, -days)).length;
  const sessions6w = count(span), sessions12w = count(2 * span);
  const last = pts.length ? pts[pts.length - 1].date : null;
  const daysSinceLast = last ? dayDiff(last, today) : null;

  const base = { lift, bestNow: now.v, best6w: b6.v, best12w: b12.v, change6w, change12w, pr, weeksSincePR, slope, slopePct, sessions6w, sessions12w, lastSession: last, daysSinceLast };
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${fmt(x * 100)}%`;

  if (!last) return { ...base, status: "inactive", reason: "No sessions logged.", confidence: 1 };
  if (daysSinceLast! > o.inactiveDays)
    return { ...base, status: "inactive", reason: `Last trained ${Math.floor(daysSinceLast! / 7)} weeks ago.`, confidence: 1 };

  // confidence pieces
  const dataQ = Math.min(1, sessions12w / 12);
  const baseQ = b6.n >= 2 ? 1 : b6.n === 1 ? 0.7 : 0.3;
  const conf = (agree: boolean) => Math.max(0.05, round2(dataQ * baseQ * (agree ? 1 : 0.7)));

  if (change6w == null) {
    return { ...base, status: "progressing", reason: `Less than ${o.stallWeeks} weeks of recent history; too early to call a plateau.`, confidence: conf(slope == null || slope >= 0) };
  }
  if (change6w < -o.regressPct) {
    return { ...base, status: "regressing", reason: `Rolling best e1RM is ${pct(change6w)} vs ${o.stallWeeks} weeks ago.`, confidence: conf(slope == null || slope < 0) };
  }
  if (change6w < o.stallPct && (weeksSincePR ?? 0) >= o.stallWeeks) {
    if (sessions6w < o.minSessions)
      return { ...base, status: "inactive", reason: `Flat (${pct(change6w)} in ${o.stallWeeks} weeks) but only ${sessions6w} sessions; train it more regularly before calling it a plateau.`, confidence: conf(true) };
    const flat = slopePct == null || Math.abs(slopePct * o.stallWeeks) < 2 * o.stallPct;
    return { ...base, status: "stalled", reason: `${sessions6w} sessions in ${o.stallWeeks} weeks, rolling best ${pct(change6w)}, no e1RM PR for ${weeksSincePR} weeks.`, confidence: conf(flat) };
  }
  const why = change6w >= o.stallPct ? `Rolling best e1RM ${pct(change6w)} vs ${o.stallWeeks} weeks ago.` : `e1RM PR ${weeksSincePR} week${weeksSincePR === 1 ? "" : "s"} ago.`;
  return { ...base, status: "progressing", reason: why, confidence: conf(slope == null || slope >= 0) };
}

// ───────────────────────── program stalls ─────────────────────────

export type ProgramStallKind =
  | "retest-due"        // stages: last stage failed, a new RM test is next
  | "repeated-resets"   // stages: deloaded / reset / retested 2+ times recently
  | "last-stage"        // stages: sitting on the final rep scheme
  | "no-progress"       // stages: 3+ sessions without a weight increase
  | "double-stuck"      // double progression: same weight 4+ sessions
  | "tm-down"           // percent: TM moved down twice without moving up
  | "tm-stuck"          // percent: TM hasn't moved for 3+ sessions with a TM rule
  | "missed-amrap";     // percent: AMRAP minimum missed 2+ times (no TM rule)

export interface ProgramStall {
  slotId: string;
  lift: string;
  tier: Tier;
  kind: ProgramStallKind;
  /** watch = one more miss changes something; stalled = act now */
  severity: "watch" | "stalled";
  /** sessions involved (trailing no-progress run, number of resets, TM drops…) */
  sessions: number;
  weight: number;
  /** date (YYYY-MM-DD) the run started */
  since?: string;
  message: string;
  /** fix in the program's own terms */
  fix: string;
}

export interface ProgramStallOptions {
  /** unit the program's weights are in (picks lb/kg increments). Default "lb". */
  unit?: Unit;
  /** how many recent sessions of a slot count as "recently" for resets / TM drops. Default 12. */
  recent?: number;
}

/** Generic fixes that apply to any stalled lift, roughly in order of how cheap they are to try. */
export const GENERIC_FIXES: string[] = [
  "Check recovery first: sleep, food, and your bodyweight trend. A falling bodyweight stalls most lifters.",
  "Deload: one week at ~90% of the working weight (or ~60% volume), then build back up.",
  "Change the rep scheme: drop reps and add sets (5×5 → 6×3) or switch to a rep range you haven't run lately.",
  "Use a smaller jump (microplates) so each session is a winnable step.",
  "Swap the variation for a block (paused, tempo, close-grip, front squat) and come back to the main lift.",
  "Add a back-off set or a second weekly exposure if frequency is low.",
];

interface Hist { date: string; r: SlotResult }

function history(state: ProgramState): Map<string, Hist[]> {
  const m = new Map<string, Hist[]>();
  for (const e of state.log)
    for (const r of e.results) {
      if (r.outcome === "missed") continue;
      const a = m.get(r.slotId) ?? [];
      a.push({ date: e.date.slice(0, 10), r });
      m.set(r.slotId, a);
    }
  return m;
}

/** Trailing run of entries satisfying `pred`, oldest first. */
function trailing<T>(xs: T[], pred: (x: T) => boolean): T[] {
  let i = xs.length;
  while (i > 0 && pred(xs[i - 1])) i--;
  return xs.slice(i);
}

/** Stalled slots in a replayed program, most urgent first. At most one item per slot (per TM lift for percent). */
export function programStalls(def: ProgramDef, state: ProgramState, opts: ProgramStallOptions = {}): ProgramStall[] {
  const unit = opts.unit ?? "lb";
  const recent = opts.recent ?? 12;
  const hist = history(state);
  const out: ProgramStall[] = [];
  const name = (lift: string, tier: Tier) => `${liftName(lift)} (${tier})`;
  const percentByLift = new Map<string, { slotIds: string[]; tier: Tier; lift: string; p: Extract<Progression, { kind: "percent" }> }>();

  for (const slot of allSlots(def)) {
    const p = slot.progression;
    const h = hist.get(slot.id) ?? [];
    const s = state.slots[slot.id];
    const who = name(slot.lift, slot.tier);
    const base = { slotId: slot.id, lift: slot.lift, tier: slot.tier };

    if (p.kind === "percent") {
      const g = percentByLift.get(p.tmLift) ?? { slotIds: [], tier: slot.tier, lift: p.tmLift, p };
      g.slotIds.push(slot.id);
      percentByLift.set(p.tmLift, g);
      continue;
    }
    if (p.kind === "fixed" || !s) continue;

    if (p.kind === "double") {
      const w = s.weight;
      const run = trailing(h, (x) => x.r.outcome === "hold" && Math.abs(x.r.weight - w) <= 0.5);
      if (run.length >= 3) {
        const inc = unit === "lb" ? p.increment.lb : p.increment.kg;
        const tot = (x: Hist) => x.r.reps.reduce((a, b) => a + b, 0);
        const flatReps = tot(run[run.length - 1]) <= tot(run[0]);
        out.push({
          ...base, kind: "double-stuck", severity: run.length >= 4 ? "stalled" : "watch", sessions: run.length, weight: w, since: run[0].date,
          message: `${who}: same weight (${fmt(w)}) for ${run.length} sessions${flatReps ? ", and total reps aren't climbing" : ""}.`,
          fix: `Same weight for ${run.length} sessions. Use a smaller jump (${fmt(inc / 2)} instead of ${fmt(inc)}) or add a set (${p.sets + 1}×${p.reps[0]}–${p.reps[1]}) and progress reps again.`,
        });
      }
      continue;
    }

    // ── stages ──
    const last = p.stages.length - 1;
    const inc = unit === "lb" ? p.increment.lb : p.increment.kg;
    const allowed = p.failsBeforeAction ?? 1;
    const f = p.onFinalFail;
    const finalFail = (): string => {
      if (f.type === "retest") return `a ${f.rmReps}RM retest (new ${schemeLabel(p.stages[0])} weight = ${Math.round(f.pct * 100)}% of it)`;
      if (f.type === "reset") return `a reset to ${schemeLabel(p.stages[0])} at ${fmt(s.stage0Weight + f.bumpIncrements * inc)}`;
      if (f.type === "deload") return `a ${Math.round(f.pct * 100)}% deload to about ${fmt(s.weight * (1 - f.pct))}`;
      if (f.type === "deloadBy") return `dropping to ${fmt(s.weight - (unit === "lb" ? f.amount.lb : f.amount.kg))}`;
      return "holding the weight";
    };

    if (s.retest && f.type === "retest") {
      out.push({
        ...base, kind: "retest-due", severity: "stalled", sessions: 1, weight: s.weight, since: h[h.length - 1]?.date,
        message: `${who}: failed the last stage, retest due.`,
        fix: `Retest next session: work up to a hard ${f.rmReps}RM. Your new ${schemeLabel(p.stages[0])} weight will be ${Math.round(f.pct * 100)}% of it.`,
      });
      continue;
    }

    const resets = h.slice(-recent).filter((x) => x.r.outcome === "deload" || x.r.outcome === "reset" || x.r.outcome === "retested");
    if (resets.length >= 2) {
      out.push({
        ...base, kind: "repeated-resets", severity: "stalled", sessions: resets.length, weight: s.weight, since: resets[0].date,
        message: `${who}: ${resets.length} deloads/resets in the last ${Math.min(recent, h.length)} sessions.`,
        fix: `The resets aren't building past the old weight. Run a real deload week, then use a smaller jump (${fmt(inc / 2)}) or move this lift to a different rep scheme for a block.`,
      });
      continue;
    }

    const noInc = trailing(h, (x) => x.r.outcome === "fail" || x.r.outcome === "hold" || x.r.outcome === "stage-down");
    const onLast = p.stages.length > 1 && s.stage === last;

    if (p.advance.type === "amrapAtLeast") {
      if (noInc.length >= 3) {
        const lastReps = noInc[noInc.length - 1].r.amrapReps ?? 0;
        out.push({
          ...base, kind: "no-progress", severity: noInc.length >= 4 ? "stalled" : "watch", sessions: noInc.length, weight: s.weight, since: noInc[0].date,
          message: `${who}: ${noInc.length} sessions at ${fmt(s.weight)} without reaching ${p.advance.reps} on the last set (last: ${lastReps}).`,
          fix: `You need ${p.advance.reps} reps on the last set to add weight. If the last-set reps aren't climbing, use a smaller jump (${fmt(inc / 2)}) or add a set.`,
        });
      }
      continue;
    }

    if (onLast) {
      const failing = noInc.some((x) => x.r.outcome === "fail");
      const scheme = schemeLabel(p.stages[last]);
      out.push({
        ...base, kind: "last-stage", severity: failing || noInc.length >= 3 ? "stalled" : "watch", sessions: noInc.length, weight: s.weight, since: noInc[0]?.date,
        message: `${who}: on ${scheme} (last stage) at ${fmt(s.weight)}.`,
        fix: `You're on ${scheme}; the next miss means ${finalFail()}. Make these sessions count: full rest, nothing hard before it.`,
      });
      continue;
    }

    if (noInc.length >= 3 || (allowed > 1 && (s.fails ?? 0) >= 1)) {
      const strikes = s.fails ?? 0;
      const next = s.stage < last ? `a step down to ${schemeLabel(p.stages[s.stage + 1])} at ${fmt(s.weight)}` : finalFail();
      const fix = allowed > 1
        ? `${strikes}/${allowed} misses at ${fmt(s.weight)}; ${allowed - strikes} more means ${next}.`
        : `No weight added for ${noInc.length} sessions; the next miss means ${next}.`;
      out.push({
        ...base, kind: "no-progress", severity: noInc.length >= 3 ? "stalled" : "watch", sessions: noInc.length, weight: s.weight, since: noInc[0]?.date,
        message: `${who}: ${noInc.length} session${noInc.length === 1 ? "" : "s"} at ${fmt(s.weight)} without adding weight.`,
        fix,
      });
    }
  }

  // ── percent: per training max ──
  for (const g of percentByLift.values()) {
    const h = g.slotIds.flatMap((id) => hist.get(id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (!h.length) continue;
    const tm = state.tms[g.lift] ?? 0;
    const who = `${liftName(g.lift)} ${def.maxLabel ?? "TM"}`;
    const base = { slotId: g.slotIds[0], lift: g.lift, tier: g.tier, weight: tm };
    const recentH = h.slice(-recent);
    const e1 = Math.max(0, ...recentH.filter((x) => x.r.weight > 0 && x.r.reps.length).map((x) => epley(x.r.weight, Math.max(...x.r.reps))));

    // TM drops since the last increase
    let downs: Hist[] = [];
    for (const x of recentH) {
      if (x.r.outcome === "tm-up") downs = [];
      else if (x.r.outcome === "tm-down") downs.push(x);
    }
    if (downs.length >= 2) {
      const reset = e1 ? ` (${fmt(e1 * 0.9)} from your recent best of ${fmt(e1)})` : "";
      out.push({
        ...base, kind: "tm-down", severity: "stalled", sessions: downs.length, since: downs[0].date,
        message: `${who} has dropped ${downs.length} times without going back up (now ${fmt(tm)}).`,
        fix: `${def.maxLabel ?? "TM"} has dropped ${downs.length} times. Consider resetting it to 90% of a recent e1RM${reset} and building back up rather than chasing it down.`,
      });
      continue;
    }

    if (g.p.tmRule) {
      const run = trailing(h, (x) => x.r.outcome === "hold");
      if (run.length >= 3) {
        out.push({
          ...base, kind: "tm-stuck", severity: run.length >= 4 ? "stalled" : "watch", sessions: run.length, since: run[0].date,
          message: `${who} hasn't moved in ${run.length} sessions (${fmt(tm)}).`,
          fix: `Your AMRAPs are landing exactly on target, so the ${def.maxLabel ?? "TM"} holds. If they feel like grinders, drop it 5–10% to rebuild rep speed; otherwise keep running it as written.`,
        });
      }
      continue;
    }

    // no TM rule: a "hold" means the AMRAP minimum was missed (or too few sets were done)
    const misses = recentH.filter((x) => x.r.outcome === "hold" && x.r.amrapReps != null);
    if (misses.length >= 2) {
      out.push({
        ...base, kind: "missed-amrap", severity: "stalled", sessions: misses.length, since: misses[0].date,
        message: `${who}: missed the AMRAP minimum ${misses.length} times in the last ${recentH.length} sessions.`,
        fix: `5/3/1 rule: when you miss the minimum reps, lower the TM about 10% (back 2–3 cycles) and work up again${e1 ? `; 90% of your recent e1RM is ${fmt(e1 * 0.9)}` : ""}.`,
      });
    }
  }

  const rank: Record<ProgramStallKind, number> = { "retest-due": 0, "tm-down": 1, "repeated-resets": 2, "missed-amrap": 3, "last-stage": 4, "no-progress": 5, "double-stuck": 6, "tm-stuck": 7 };
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "stalled" ? -1 : 1) || rank[a.kind] - rank[b.kind]);
}
