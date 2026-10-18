// Achievements over the full Hevy history: definitions + one chronological pass. Pure.
// Every achievement reports `unlockedAt` (local date it was first earned) or progress 0–1 toward it.
// Weights are compared in the user's unit so a 225 lb set logged in lb (stored as 102.058 kg) counts for
// "2 plates" exactly, with a small tolerance for kg↔lb float noise.

import { cardioSessions, METERS_PER_MI } from "./cardio";
import type { HevyWorkout } from "./hevy";
import { matchLift } from "./lifts";
import type { ProgramState } from "./program";
import { addDays, epley, weekStart } from "./stats";
import { bodyweightTrend, trendAt, type DailyWeight, type WeighIn } from "./bodyweight";
import { fromKg, LB_PER_KG, type Unit } from "./units";

export type Tier = "bronze" | "silver" | "gold";
export type AchievementCategory = "plates" | "total" | "relative" | "consistency" | "volume" | "cardio" | "calisthenics" | "programs" | "habits" | "milestones";

export interface Achievement {
  id: string;
  title: string;
  description: string;
  tier: Tier;
  category: AchievementCategory;
  /** local YYYY-MM-DD it was first earned, null while locked */
  unlockedAt: string | null;
  /** 0–1; 1 once unlocked */
  progress: number;
  /** best value so far and the goal, in `measure` units (for "312 / 405 lb" labels) */
  current: number;
  target: number;
  measure: string;
}

export interface CompletedProgram {
  name: string;
  /** local date the last session of the run was logged */
  completedAt: string;
}

export interface AchievementInput {
  workouts: HevyWorkout[];
  tz: string;
  unit: Unit;
  /** YYYY-MM-DD, for anniversaries (default: latest workout date) */
  today?: string;
  map?: Record<string, string>;
  /** weigh-ins (or merged days) for bodyweight multiples; those achievements are omitted without it */
  bodyweight?: (WeighIn | DailyWeight)[];
  /** finished finite program runs */
  completedPrograms?: CompletedProgram[];
  /** program states; complete ones count as a run finished on their last log date */
  programStates?: { name?: string; state: ProgramState }[];
  /** sessions per Monday-week that keep a week streak (default 3) */
  minWeeklySessions?: number;
  /** sessions needed for early bird / night owl (default 10/25/50) */
  timeOfDayCounts?: [number, number, number];
}

// ───────── definitions ─────────

const PLATES: Record<Unit, number[]> = { lb: [135, 225, 315, 405, 495], kg: [60, 100, 140, 180, 220] };
/** how many plate milestones each lift gets, and the tier of each */
const PLATE_LIFTS: { lift: string; name: string; tiers: Tier[] }[] = [
  { lift: "squat", name: "Squat", tiers: ["bronze", "bronze", "silver", "gold", "gold"] },
  { lift: "bench", name: "Bench", tiers: ["bronze", "silver", "gold", "gold"] },
  { lift: "deadlift", name: "Deadlift", tiers: ["bronze", "bronze", "silver", "gold", "gold"] },
  { lift: "ohp", name: "Overhead Press", tiers: ["silver", "gold", "gold"] },
];
const CLUBS: { lb: number; tier: Tier }[] = [{ lb: 1000, tier: "bronze" }, { lb: 1200, tier: "silver" }, { lb: 1500, tier: "gold" }];
const BW_MULTS: { lift: string; name: string; mult: number; tier: Tier }[] = [
  { lift: "bench", name: "Bench", mult: 1, tier: "silver" },
  { lift: "squat", name: "Squat", mult: 1.5, tier: "silver" },
  { lift: "squat", name: "Squat", mult: 2, tier: "gold" },
  { lift: "deadlift", name: "Deadlift", mult: 2, tier: "silver" },
  { lift: "deadlift", name: "Deadlift", mult: 2.5, tier: "gold" },
];
const SESSIONS: [number, Tier][] = [[50, "bronze"], [100, "silver"], [250, "gold"], [500, "gold"]];
const STREAKS: [number, Tier][] = [[4, "bronze"], [8, "bronze"], [12, "silver"], [26, "gold"], [52, "gold"]];
/** tonnage targets per unit (kg ones are round numbers near half the lb ones) */
const TONNAGE: Record<Unit, [number, Tier][]> = {
  lb: [[100_000, "bronze"], [500_000, "silver"], [1_000_000, "gold"], [5_000_000, "gold"]],
  kg: [[50_000, "bronze"], [250_000, "silver"], [500_000, "gold"], [2_500_000, "gold"]],
};
const REPS: [number, Tier][] = [[10_000, "silver"], [50_000, "gold"]];
const CARDIO_MIN: [number, Tier][] = [[100, "bronze"], [500, "silver"], [1000, "gold"]];
const PULLUPS: [number, Tier][] = [[10, "bronze"], [15, "silver"], [20, "gold"]];
const PROGRAMS: [number, Tier][] = [[1, "bronze"], [3, "silver"], [5, "gold"]];
const ANNIV: [number, Tier][] = [[1, "bronze"], [2, "silver"], [5, "gold"]];
const BREAK_DAYS = 28;
/** Epley gets silly past ~10 reps; e1RM-based totals only use sets up to this */
const E1RM_MAX_REPS = 10;

const fmtN = (n: number) => Math.round(n).toLocaleString("en-US");
const short = (n: number) => (n >= 1e6 ? `${n / 1e6}M` : n >= 1e3 ? `${n / 1e3}k` : String(n));
const tierOf = (tiers: Tier[], i: number) => tiers[Math.min(i, tiers.length - 1)];

/** Earliest date a running value crossed each threshold. */
class Milestones {
  value = 0;
  readonly hit: (string | null)[];
  constructor(readonly targets: number[]) { this.hit = targets.map(() => null); }
  /** set the running value (max-tracking callers pass the new best) */
  update(v: number, date: string) {
    if (v > this.value) this.value = v;
    for (let i = 0; i < this.targets.length; i++) if (!this.hit[i] && this.value >= this.targets[i] - 1e-6) this.hit[i] = date;
  }
  add(dv: number, date: string) { this.update(this.value + dv, date); }
}

interface LocalParts { date: string; hour: number }
const FMT = new Map<string, Intl.DateTimeFormat>();
function local(iso: string, tz: string): LocalParts {
  let f = FMT.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    FMT.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(iso))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

const dayNum = (d: string) => Math.round(Date.parse(d + "T12:00:00Z") / 86400000);
function addYears(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  // Feb 29 → Feb 28 in non-leap years
  const leap = (yy: number) => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0;
  const dd = m === 2 && d === 29 && !leap(y + n) ? 28 : d;
  return `${y + n}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Program runs that finished: explicit ones plus complete states (dated by their last log entry). */
export function completedRuns(input: Pick<AchievementInput, "completedPrograms" | "programStates">): CompletedProgram[] {
  const out = [...(input.completedPrograms ?? [])];
  for (const p of input.programStates ?? []) {
    if (!p.state.complete || !p.state.log.length) continue;
    out.push({ name: p.name ?? "Program", completedAt: p.state.log[p.state.log.length - 1].date.slice(0, 10) });
  }
  return out.sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

/** Evaluate every achievement over the full history. Unlocked first (newest first), then locked by progress. */
export function evaluateAchievements(input: AchievementInput): Achievement[] {
  const { tz, unit } = input;
  const minWk = input.minWeeklySessions ?? 3;
  const todCounts = input.timeOfDayCounts ?? [10, 25, 50];
  const tol = unit === "lb" ? 0.1 : 0.05; // float noise from lb↔kg storage
  const toU = (kg: number) => fromKg(kg, unit);
  const ws = [...input.workouts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const parts = ws.map((w) => local(w.start_time, tz));
  const today = input.today ?? parts[parts.length - 1]?.date ?? new Date().toISOString().slice(0, 10);

  // plates
  const plateM = new Map(PLATE_LIFTS.map((p) => [p.lift, new Milestones(PLATES[unit].slice(0, p.tiers.length).map((t) => t - tol))]));
  const plateBest = new Map<string, number>();
  // totals: best e1RM / best actual top set per lift, in lb (clubs are defined in lb)
  const bestE = { squat: 0, bench: 0, deadlift: 0 }, bestTop = { squat: 0, bench: 0, deadlift: 0 };
  const clubE = new Milestones(CLUBS.map((c) => c.lb - 0.5)), clubTop = new Milestones(CLUBS.map((c) => c.lb - 0.5));
  // bodyweight multiples
  const bw = input.bodyweight?.length ? bodyweightTrend(input.bodyweight, { unit: "kg" }) : null;
  const multM = BW_MULTS.map(() => new Milestones([1 - 1e-3])); // tracks ratio / mult
  const multBest = BW_MULTS.map(() => 0);
  // counts
  const sessM = new Milestones(SESSIONS.map(([n]) => n));
  const tonM = new Milestones(TONNAGE[unit].map(([n]) => n));
  const repM = new Milestones(REPS.map(([n]) => n));
  const pullM = new Milestones(PULLUPS.map(([n]) => n));
  const earlyM = new Milestones(todCounts), owlM = new Milestones(todCounts);
  const streakM = new Milestones(STREAKS.map(([n]) => n));
  const weekCount = new Map<string, number>();
  let run = 0, lastOkWeek: string | null = null;
  let breakAt: string | null = null, longestBreak = 0;
  let prevDate: string | null = null;

  for (let i = 0; i < ws.length; i++) {
    const w = ws[i], { date, hour } = parts[i];
    sessM.add(1, date);
    if (hour >= 4 && hour < 7) earlyM.add(1, date);
    if (hour >= 21 || hour < 4) owlM.add(1, date);
    if (prevDate) {
      const gap = dayNum(date) - dayNum(prevDate);
      longestBreak = Math.max(longestBreak, gap);
      if (gap >= BREAK_DAYS && !breakAt) breakAt = date;
    }
    prevDate = date;

    // week streak: a week counts once it reaches minWk sessions
    const wk = weekStart(date);
    const c = (weekCount.get(wk) ?? 0) + 1;
    weekCount.set(wk, c);
    if (c === minWk) {
      run = lastOkWeek && addDays(lastOkWeek, 7) === wk ? run + 1 : 1;
      lastOkWeek = wk;
      streakM.update(run, date);
    }

    const bwKg = bw ? trendAt(bw, date, 30) : null;
    let tonKg = 0, reps = 0;
    for (const e of w.exercises) {
      const lift = matchLift(e.title, e.exercise_template_id, input.map);
      for (const s of e.sets) {
        if (s.type === "warmup") continue;
        const kg = s.weight_kg ?? 0, r = s.reps ?? 0;
        reps += r;
        tonKg += kg * r;
        if (r < 1 || !lift) continue;
        if (lift === "pullUp" && kg <= 0) pullM.update(r, date);
        if (kg <= 0) continue;
        const pm = plateM.get(lift);
        if (pm) { pm.update(toU(kg), date); plateBest.set(lift, Math.max(plateBest.get(lift) ?? 0, toU(kg))); }
        if (lift === "squat" || lift === "bench" || lift === "deadlift") {
          const lb = kg * LB_PER_KG;
          if (r <= E1RM_MAX_REPS) bestE[lift] = Math.max(bestE[lift], epley(lb, r));
          bestTop[lift] = Math.max(bestTop[lift], lb);
        }
        if (bwKg) BW_MULTS.forEach((m, j) => {
          if (m.lift !== lift) return;
          const ratio = kg / bwKg;
          multBest[j] = Math.max(multBest[j], ratio);
          multM[j].update(ratio / m.mult, date);
        });
      }
    }
    tonM.add(toU(tonKg), date);
    repM.add(reps, date);
    clubE.update(bestE.squat + bestE.bench + bestE.deadlift, date);
    clubTop.update(bestTop.squat + bestTop.bench + bestTop.deadlift, date);
  }

  const out: Achievement[] = [];
  const push = (a: Omit<Achievement, "progress" | "unlockedAt">, unlockedAt: string | null) =>
    out.push({ ...a, unlockedAt, progress: unlockedAt ? 1 : a.target > 0 ? Math.max(0, Math.min(0.999, a.current / a.target)) : 0 });

  // plates
  for (const p of PLATE_LIFTS) {
    const m = plateM.get(p.lift)!, best = plateBest.get(p.lift) ?? 0;
    p.tiers.forEach((tier, i) => {
      const target = PLATES[unit][i], n = i + 1;
      push({ id: `plates-${p.lift}-${n}`, title: `${n}-Plate ${p.name}`, description: `${p.name} ${target} ${unit} for at least one rep (${n} plate${n > 1 ? "s" : ""} a side).`, tier, category: "plates", current: best, target, measure: unit }, m.hit[i]);
    });
  }
  // clubs
  const totE = bestE.squat + bestE.bench + bestE.deadlift, totTop = bestTop.squat + bestTop.bench + bestTop.deadlift;
  const lbLabel = (lb: number) => (unit === "kg" ? ` (${fmtN(lb / LB_PER_KG)} kg)` : "");
  CLUBS.forEach((cl, i) => {
    push({ id: `club-${cl.lb}`, title: `${fmtN(cl.lb)} lb Club`, description: `Best squat + bench + deadlift estimated 1RMs add up to ${fmtN(cl.lb)} lb${lbLabel(cl.lb)}.`, tier: cl.tier, category: "total", current: unit === "lb" ? totE : totE / LB_PER_KG, target: unit === "lb" ? cl.lb : cl.lb / LB_PER_KG, measure: unit }, clubE.hit[i]);
    push({ id: `club-${cl.lb}-actual`, title: `${fmtN(cl.lb)} lb Club (Actual)`, description: `Heaviest squat, bench and deadlift sets actually lifted add up to ${fmtN(cl.lb)} lb${lbLabel(cl.lb)}.`, tier: cl.tier === "bronze" ? "silver" : "gold", category: "total", current: unit === "lb" ? totTop : totTop / LB_PER_KG, target: unit === "lb" ? cl.lb : cl.lb / LB_PER_KG, measure: unit }, clubTop.hit[i]);
  });
  // bodyweight multiples
  if (bw) BW_MULTS.forEach((m, j) => {
    const x = m.mult === 1 ? "Bodyweight" : `${m.mult}× Bodyweight`;
    push({ id: `bw-${m.lift}-${m.mult}`, title: `${x} ${m.name}`, description: `${m.name} ${m.mult}× your trend bodyweight for at least one rep.`, tier: m.tier, category: "relative", current: Math.round(multBest[j] * 100) / 100, target: m.mult, measure: "× BW" }, multM[j].hit[0]);
  });
  // sessions
  SESSIONS.forEach(([n, tier], i) => push({ id: `sessions-${n}`, title: `${n} Workouts`, description: `Log ${n} workouts.`, tier, category: "milestones", current: sessM.value, target: n, measure: "workouts" }, sessM.hit[i]));
  // streaks
  STREAKS.forEach(([n, tier], i) => push({ id: `streak-${n}w`, title: `${n}-Week Streak`, description: `${n} weeks in a row with at least ${minWk} workouts.`, tier, category: "consistency", current: streakM.value, target: n, measure: "weeks" }, streakM.hit[i]));
  // tonnage / reps
  TONNAGE[unit].forEach(([n, tier], i) => push({ id: `tonnage-${short(n)}`, title: `${short(n)} ${unit} Moved`, description: `Lift ${fmtN(n)} ${unit} in total (weight × reps, warmups excluded).`, tier, category: "volume", current: tonM.value, target: n, measure: unit }, tonM.hit[i]));
  REPS.forEach(([n, tier], i) => push({ id: `reps-${short(n)}`, title: `${short(n)} Reps`, description: `Log ${fmtN(n)} working reps.`, tier, category: "volume", current: repM.value, target: n, measure: "reps" }, repM.hit[i]));
  // cardio
  const distUnit = unit === "lb" ? "mi" : "km";
  const distTarget = distUnit === "mi" ? 100 : 160;
  const cMin = new Milestones(CARDIO_MIN.map(([n]) => n)), cDist = new Milestones([distTarget]);
  for (const s of cardioSessions(ws, tz)) {
    cMin.add(s.seconds / 60, s.date);
    cDist.add(distUnit === "mi" ? s.meters / METERS_PER_MI : s.meters / 1000, s.date);
  }
  CARDIO_MIN.forEach(([n, tier], i) => push({ id: `cardio-${n}min`, title: `${fmtN(n)} Cardio Minutes`, description: `Log ${fmtN(n)} minutes of cardio.`, tier, category: "cardio", current: cMin.value, target: n, measure: "min" }, cMin.hit[i]));
  push({ id: `cardio-${distTarget}${distUnit}`, title: `${distTarget} ${distUnit === "mi" ? "Miles" : "km"}`, description: `Cover ${distTarget} ${distUnit} of logged cardio distance.`, tier: "silver", category: "cardio", current: cDist.value, target: distTarget, measure: distUnit }, cDist.hit[0]);
  // pull-ups
  PULLUPS.forEach(([n, tier], i) => push({ id: `pullups-${n}`, title: `${n} Strict Pull-Ups`, description: `${n} bodyweight pull-ups in one set.`, tier, category: "calisthenics", current: pullM.value, target: n, measure: "reps" }, pullM.hit[i]));
  // programs
  const runs = completedRuns(input);
  PROGRAMS.forEach(([n, tier]) => push({ id: `programs-${n}`, title: n === 1 ? "Finished a Program" : `${n} Programs Finished`, description: n === 1 ? "Complete every week of a finite program." : `Complete ${n} finite programs.`, tier, category: "programs", current: runs.length, target: n, measure: "programs" }, runs[n - 1]?.completedAt ?? null));
  // habits
  const todTiers: Tier[] = ["bronze", "silver", "gold"];
  todCounts.forEach((n, i) => {
    push({ id: `early-bird-${n}`, title: i === 0 ? "Early Bird" : `Early Bird ×${n}`, description: `Start ${n} workouts between 4 and 7 am.`, tier: todTiers[i], category: "habits", current: earlyM.value, target: n, measure: "workouts" }, earlyM.hit[i]);
    push({ id: `night-owl-${n}`, title: i === 0 ? "Night Owl" : `Night Owl ×${n}`, description: `Start ${n} workouts after 9 pm.`, tier: todTiers[i], category: "habits", current: owlM.value, target: n, measure: "workouts" }, owlM.hit[i]);
  });
  push({ id: "comeback", title: "Back From a Break", description: `Train again after ${BREAK_DAYS / 7}+ weeks off.`, tier: "bronze", category: "habits", current: breakAt ? 1 : 0, target: 1, measure: "returns" }, breakAt);
  // anniversaries
  const first = parts[0]?.date;
  ANNIV.forEach(([n, tier]) => {
    const at = first ? addYears(first, n) : null;
    const elapsed = first ? (dayNum(today) - dayNum(first)) / 365.25 : 0;
    push({ id: `anniversary-${n}y`, title: n === 1 ? "One Year Lifting" : `${n} Years Lifting`, description: `${n} year${n > 1 ? "s" : ""} since your first logged workout.`, tier, category: "milestones", current: Math.round(elapsed * 100) / 100, target: n, measure: "years" }, at && at <= today ? at : null);
  });

  return sortAchievements(out);
}

const TIER_RANK: Record<Tier, number> = { gold: 0, silver: 1, bronze: 2 };

/** Unlocked newest first (ties: higher tier), then locked by progress (closest first). */
export function sortAchievements(as: Achievement[]): Achievement[] {
  return [...as].sort((a, b) => {
    if (a.unlockedAt && b.unlockedAt) return b.unlockedAt.localeCompare(a.unlockedAt) || TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (a.unlockedAt) return -1;
    if (b.unlockedAt) return 1;
    return b.progress - a.progress || TIER_RANK[b.tier] - TIER_RANK[a.tier];
  });
}

/** Achievements unlocked on or after `since` (YYYY-MM-DD), newest first. */
export function recentUnlocks(achievements: Achievement[], since: string): Achievement[] {
  return sortAchievements(achievements.filter((a) => a.unlockedAt != null && a.unlockedAt >= since.slice(0, 10)));
}
