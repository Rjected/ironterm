// Weekly volume per muscle vs evidence-based ranges ("volume landmarks").
//
// Counting
//   Every hard working set adds its per-muscle involvement from shared/muscles.ts (1 = prime
//   mover, ~0.5 synergist, ~0.25 stabiliser): the fractional-set method of Pelland et al. 2024,
//   "The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly
//   Volume and Frequency on Muscle Hypertrophy and Strength Gain" (SportRxiv 476,
//   doi:10.51224/SRXIV.476), where indirect sets counted as ½ predicted growth best.
//   Alongside it we keep a "direct" count — a set counts 1 for a muscle only when it is a prime
//   mover (involvement ≥ DIRECT_MIN) — because the RP landmarks below are written in direct sets
//   (they give front delts and glutes an MEV of 0 precisely because pressing and squatting already
//   train them indirectly).
//
//   Landmark groups aggregate several MuscleIds: per set, a group's involvement is the max over its
//   members (a squat is 1 quad set, not 1 + 1 + 0.35).
//
// Hard sets
//   Warmups never count. Otherwise a set is "hard" (counts toward volume) when:
//     • it has a logged RPE: RPE ≥ 6 (≤ 4 reps in reserve), else not hard; logged RPE wins;
//     • it's a "failure" set (Hevy) or a planned AMRAP;
//     • it has load and a reference max (%1RM = weight ÷ rolling best e1RM): it's at ≥ 60 % 1RM,
//       or its estimated RIR ≤ 4 (RIR = Epley reps-at-%1RM − reps, recovery.maxReps), which catches
//       light high-rep sets taken near failure. The 60 % floor stands in for "within ~4 RIR" on
//       ordinary 3–12-rep work sets — Epley overestimates reps-to-failure at moderate loads (it
//       would call 3×10 at 65 % "6 RIR"), and a rolling best can be stale after a layoff — while
//       still dropping ramp-up sets people log as normal sets (135×5 on the way to a heavy squat);
//     • no load / no reference (bodyweight, first time on an exercise): assumed hard (~2 RIR, the
//       same default recovery.ts uses).
//   Rationale: sets within ~4–5 RIR produce similar hypertrophy to sets to failure (Refalo et al.
//   2023, Sports Med 53:649; Robinson et al. 2024, Sports Med 54:2209), and the volume studies
//   behind the ranges counted sets taken close to failure. Light high-rep sets well short of
//   failure (BBB 5×10 at ~45 % 1RM) are usually not counted.
//
// Ranges
//   1. Research guidance: ~10–20 hard sets per muscle per week (Schoenfeld, Ogborn & Krieger 2017,
//      J Sports Sci 35:1073, "Dose-response relationship between weekly resistance training volume
//      and increases in muscle mass": ≥ 10 sets/week beat < 5; Baz-Valle et al. 2022, J Hum Kinet
//      81:199; Pelland 2024: gains keep rising past 20 fractional sets with diminishing returns).
//      Compared against fractional sets.
//   2. Renaissance Periodization landmarks (Israetel, Hoffmann & Smith, "Scientific Principles of
//      Hypertrophy Training", RP 2021, and the RP "Training Volume Landmarks" muscle guides):
//        MV  maintenance volume — enough to keep what you have
//        MEV minimum effective volume — least that still grows
//        MAV maximum adaptive volume — the range most growth happens in
//        MRV maximum recoverable volume — beyond it you can't recover
//      The commonly published per-muscle table (sets/week, intermediate lifter) is LANDMARKS below.
//      These are practitioner heuristics, not measured thresholds; individual MRVs vary a lot.
//      Compared against direct sets when available.

import type { HevyExerciseTemplate, HevyWorkout } from "./hevy";
import { rollingBest, plannedSetIntensity } from "./inol";
import { matchLift } from "./lifts";
import { exerciseProfile, liftProfile, MUSCLE, MUSCLE_IDS, type Involvement, type MuscleId } from "./muscles";
import { isScheduled, planDay, weekIndex, type ProgramConfig, type ProgramDef, type ProgramState } from "./program";
import { maxFraction, maxReps } from "./recovery";
import { addDays, epley, localDate, weekStart } from "./stats";

// ───────────────────────── tables ─────────────────────────

export type LandmarkGroup =
  | "chest" | "back" | "traps" | "frontDelts" | "sideDelts" | "rearDelts"
  | "biceps" | "triceps" | "forearms" | "abs"
  | "quads" | "hamstrings" | "glutes" | "calves";

export interface Landmarks {
  group: LandmarkGroup;
  name: string;
  mv: number;
  mev: number;
  mav: [number, number];
  mrv: number;
  /** extra context for the plain-English note */
  caveat?: string;
}

const LM = (group: LandmarkGroup, name: string, mv: number, mev: number, mav: [number, number], mrv: number, caveat?: string): Landmarks => ({ group, name, mv, mev, mav, mrv, caveat });

/** RP volume landmarks, direct hard sets per week (Israetel et al.; commonly published values). */
export const LANDMARKS: Record<LandmarkGroup, Landmarks> = {
  chest: LM("chest", "Chest", 4, 6, [12, 20], 22),
  back: LM("back", "Back", 6, 10, [14, 22], 25),
  traps: LM("traps", "Traps", 0, 0, [12, 20], 26, "Deadlifts, rows and overhead pressing keep traps busy; direct work is optional."),
  frontDelts: LM("frontDelts", "Front delts", 0, 0, [6, 8], 12, "Bench and overhead pressing usually cover front delts; most people need no direct work."),
  sideDelts: LM("sideDelts", "Side delts", 0, 8, [16, 22], 26),
  rearDelts: LM("rearDelts", "Rear delts", 0, 6, [12, 18], 22, "Rows and pulldowns give rear delts a lot of indirect work."),
  biceps: LM("biceps", "Biceps", 5, 8, [14, 20], 26),
  triceps: LM("triceps", "Triceps", 4, 6, [10, 14], 18, "Pressing already trains triceps hard; direct-work needs are modest."),
  forearms: LM("forearms", "Forearms", 0, 2, [10, 15], 25, "Gripping heavy pulls trains forearms indirectly."),
  abs: LM("abs", "Abs", 0, 0, [16, 20], 25, "Heavy squats and deadlifts train the trunk isometrically."),
  quads: LM("quads", "Quads", 6, 8, [12, 18], 20),
  hamstrings: LM("hamstrings", "Hamstrings", 3, 4, [10, 16], 20),
  glutes: LM("glutes", "Glutes", 0, 0, [4, 12], 16, "Squats, lunges and deadlifts train glutes a lot; direct work is optional."),
  calves: LM("calves", "Calves", 6, 8, [12, 16], 20),
};

export const LANDMARK_GROUPS = Object.keys(LANDMARKS) as LandmarkGroup[];

/** Simple research range (Schoenfeld 2017; Pelland 2024), fractional sets per week. */
export const RESEARCH_RANGE: [number, number] = [10, 20];

/**
 * MuscleId → landmark group. Muscles RP gives no landmark for (serratus, rotator cuff, erectors,
 * neck, hip flexors, adductors, tibialis) map to null; they still get a set count and, where
 * muscles.ts defines one, a research range.
 */
export const MUSCLE_GROUP: Record<MuscleId, LandmarkGroup | null> = {
  pecUpper: "chest", pecLower: "chest", serratus: null,
  frontDelt: "frontDelts", sideDelt: "sideDelts", rearDelt: "rearDelts", infraspinatus: null, teres: "back",
  biceps: "biceps", brachialis: "biceps", brachioradialis: "forearms", tricepsLong: "triceps", tricepsLateral: "triceps",
  forearmFlexors: "forearms", forearmExtensors: "forearms",
  trapsUpper: "traps", trapsMid: "back", trapsLower: "back", rhomboids: "back", lats: "back", erectors: null,
  abs: "abs", obliques: "abs", neck: null,
  gluteMax: "glutes", gluteMed: "glutes", hipFlexors: null, adductors: null,
  rectusFemoris: "quads", vastusLateralis: "quads", vastusMedialis: "quads", hamsLateral: "hamstrings", hamsMedial: "hamstrings",
  gastrocnemius: "calves", soleus: "calves", tibialis: null,
};

/** Involvement at or above this counts as a direct (prime-mover) set. */
export const DIRECT_MIN = 0.9;

// ───────────────────────── hard sets ─────────────────────────

export interface HardSetOptions {
  /** max estimated reps in reserve for a set to count (default 4) */
  maxRir?: number;
  /** sets at or above this %1RM count (default 0.6) */
  minPct?: number;
  /** count every non-warmup set regardless of effort */
  countAll?: boolean;
}

/** Whether a set counts as hard. `pct` = fraction of 1RM (undefined if unknown); `rir` overrides the Epley estimate. */
export function isHardSet(s: { reps: number; pct?: number; rpe?: number | null; failure?: boolean; amrap?: boolean; rir?: number }, o: HardSetOptions = {}): boolean {
  if (o.countAll) return true;
  const maxRir = o.maxRir ?? 4;
  if (s.rpe != null) return 10 - s.rpe <= maxRir;
  if (s.failure || s.amrap) return true;
  const pct = s.pct != null && s.pct > 0 ? s.pct : undefined;
  if (pct != null && pct >= (o.minPct ?? 0.6)) return true;
  const rir = s.rir ?? (pct != null ? maxReps(pct) - s.reps : undefined);
  return rir == null || rir <= maxRir;
}

// ───────────────────────── counting ─────────────────────────

export interface MuscleSetCounts {
  /** fractional hard sets per muscle */
  muscles: Record<MuscleId, number>;
  /** direct (prime-mover) hard sets per muscle */
  direct: Record<MuscleId, number>;
  /** per landmark group: fractional (max over members per set) and direct sets */
  groups: Record<LandmarkGroup, { sets: number; direct: number }>;
  /** working sets counted as hard / all working sets seen */
  hardSets: number;
  workingSets: number;
}

export function emptyCounts(): MuscleSetCounts {
  return {
    muscles: Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) as Record<MuscleId, number>,
    direct: Object.fromEntries(MUSCLE_IDS.map((m) => [m, 0])) as Record<MuscleId, number>,
    groups: Object.fromEntries(LANDMARK_GROUPS.map((g) => [g, { sets: 0, direct: 0 }])) as MuscleSetCounts["groups"],
    hardSets: 0,
    workingSets: 0,
  };
}

/** Add `n` hard sets of an exercise with this involvement. */
function addSets(c: MuscleSetCounts, inv: Involvement, n = 1) {
  const g: Partial<Record<LandmarkGroup, number>> = {};
  for (const [m, v] of Object.entries(inv) as [MuscleId, number][]) {
    if (!v) continue;
    c.muscles[m] += v * n;
    if (v >= DIRECT_MIN) c.direct[m] += n;
    const grp = MUSCLE_GROUP[m];
    if (grp) g[grp] = Math.max(g[grp] ?? 0, v);
  }
  for (const [grp, v] of Object.entries(g) as [LandmarkGroup, number][]) {
    c.groups[grp].sets += v * n;
    if (v >= DIRECT_MIN) c.groups[grp].direct += n;
  }
}

function scaleCounts(c: MuscleSetCounts, f: number): MuscleSetCounts {
  const out = emptyCounts();
  for (const m of MUSCLE_IDS) { out.muscles[m] = c.muscles[m] * f; out.direct[m] = c.direct[m] * f; }
  for (const g of LANDMARK_GROUPS) out.groups[g] = { sets: c.groups[g].sets * f, direct: c.groups[g].direct * f };
  out.hardSets = c.hardSets * f;
  out.workingSets = c.workingSets * f;
  return out;
}

/** ISO 8601 week label ("2026-W42") for a Monday (or any date in that week). */
export function isoWeek(date: string): string {
  const thu = addDays(weekStart(date), 3);
  const year = Number(thu.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const n = Math.round((Date.parse(weekStart(thu) + "T12:00:00Z") - Date.parse(weekStart(jan4) + "T12:00:00Z")) / (7 * 864e5)) + 1;
  return `${year}-W${String(n).padStart(2, "0")}`;
}

export interface WeeklyMuscleSets extends MuscleSetCounts {
  /** Monday, YYYY-MM-DD */
  week: string;
  /** ISO week label */
  isoWeek: string;
  sessions: number;
  /** exercises we couldn't map to muscles: title → hard sets */
  unknown: Record<string, number>;
}

export interface WeeklyOptions extends HardSetOptions {
  liftMap?: Record<string, string>;
  templates?: Map<string, HevyExerciseTemplate>;
  /** trailing window for the reference e1RM, days (default 365) */
  windowDays?: number;
  /** only report weeks whose Monday is within [from, to] (dates); history before `from` still seeds e1RMs */
  from?: string;
  to?: string;
}

/**
 * Hard fractional sets per muscle per calendar week (Monday start) from Hevy history. Weeks with
 * no training between the first and last reported week are included as zeros.
 */
export function weeklyMuscleSets(workouts: HevyWorkout[], tz: string, opts: WeeklyOptions = {}): WeeklyMuscleSets[] {
  const asc = [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const trackers = new Map<string, ReturnType<typeof rollingBest>>();
  const weeks = new Map<string, WeeklyMuscleSets>();
  const from = opts.from ? weekStart(opts.from) : undefined;
  const to = opts.to ? weekStart(opts.to) : undefined;
  const get = (wk: string) => {
    let c = weeks.get(wk);
    if (!c) { c = { ...emptyCounts(), week: wk, isoWeek: isoWeek(wk), sessions: 0, unknown: {} }; weeks.set(wk, c); }
    return c;
  };
  for (const w of asc) {
    const date = localDate(w.start_time, tz);
    const wk = weekStart(date);
    const report = (!from || wk >= from) && (!to || wk <= to);
    let counted = false;
    for (const e of w.exercises) {
      const work = e.sets.filter((s) => s.type !== "warmup" && ((s.reps ?? 0) > 0 || (s.duration_seconds ?? 0) > 0));
      if (!work.length) continue;
      const key = matchLift(e.title, e.exercise_template_id, opts.liftMap);
      const id = key ?? e.exercise_template_id;
      let t = trackers.get(id);
      if (!t) { t = rollingBest(opts.windowDays ?? 365); trackers.set(id, t); }
      for (const s of work) if ((s.weight_kg ?? 0) > 0 && (s.reps ?? 0) > 0) t.add(date, epley(s.weight_kg!, s.reps!));
      if (!report) continue;
      const ref = t.best(date);
      const c = get(wk);
      counted = true;
      const p = exerciseProfile(key, e.title, opts.templates?.get(e.exercise_template_id));
      let hard = 0;
      for (const s of work) {
        const reps = s.reps ?? Math.max(1, Math.round((s.duration_seconds ?? 30) / 4));
        const pct = (s.weight_kg ?? 0) > 0 && ref > 0 ? Math.min(1, s.weight_kg! / ref) : undefined;
        c.workingSets++;
        if (isHardSet({ reps, pct, rpe: s.rpe, failure: s.type === "failure" }, opts)) hard++;
      }
      c.hardSets += hard;
      if (!p) { if (hard) c.unknown[e.title] = (c.unknown[e.title] ?? 0) + hard; continue; }
      if (hard) addSets(c, p.muscles, hard);
    }
    if (counted) get(wk).sessions++;
  }
  // fill gaps with zero weeks
  const keys = [...weeks.keys()].sort();
  if (keys.length) {
    const last = to ?? keys[keys.length - 1];
    for (let k = from ?? keys[0]; k <= last; k = addDays(k, 7)) get(k);
  }
  return [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Mean of several weeks' counts (e.g. the last 8 from weeklyMuscleSets). */
export function averageWeeks(weeks: MuscleSetCounts[]): MuscleSetCounts {
  const sum = emptyCounts();
  for (const w of weeks) {
    for (const m of MUSCLE_IDS) { sum.muscles[m] += w.muscles[m]; sum.direct[m] += w.direct[m]; }
    for (const g of LANDMARK_GROUPS) { sum.groups[g].sets += w.groups[g].sets; sum.groups[g].direct += w.groups[g].direct; }
    sum.hardSets += w.hardSets; sum.workingSets += w.workingSets;
  }
  return weeks.length ? scaleCounts(sum, 1 / weeks.length) : sum;
}

export interface ProgramWeekSets extends MuscleSetCounts {
  /** program weeks (passes through the days) averaged */
  weeks: number;
  sessionsPerWeek: number;
}

/**
 * A typical calendar week of a program: hard fractional sets per muscle averaged over one full
 * cycle (every program week, current TMs/weights from `state`), scaled to `def.sessionsPerWeek`.
 * Planned-set effort comes from inol.plannedSetIntensity (program %, RPE, weight ÷ 1RM or tier
 * default RIR); `opts.maxes` are 1RMs in cfg.unit for lifts without a TM.
 */
export function programMuscleSets(def: ProgramDef, cfg: ProgramConfig, state: ProgramState, opts: HardSetOptions & { maxes?: Record<string, number> } = {}): ProgramWeekSets {
  const maxPct = maxFraction(def.maxLabel);
  const oneRm = (lift: string) => opts.maxes?.[lift] ?? (state.tms[lift] ? state.tms[lift] / maxPct : undefined);
  const passes = def.cycle?.weeks ?? 1;
  const total = emptyCounts();
  let sessions = 0;
  for (let r = 0; r < passes; r++) {
    const wk = weekIndex(def, r);
    for (let i = 0; i < def.days.length; i++) {
      if (!isScheduled(def.days[i], wk)) continue;
      sessions++;
      const plan = planDay(def, cfg, { ...state, rotations: r, dayIndex: i }, i);
      for (const ex of plan.exercises) {
        const p = liftProfile(ex.lift);
        let hard = 0;
        for (const s of ex.sets) {
          const e = plannedSetIntensity(s, ex.tier, maxPct, oneRm(ex.lift));
          total.workingSets++;
          if (isHardSet({ reps: e.reps, pct: e.pct, rpe: s.rpe, amrap: s.amrap, rir: e.rir }, opts)) hard++;
        }
        total.hardSets += hard;
        if (p && hard) addSets(total, p.muscles, hard);
      }
    }
  }
  const out = scaleCounts(total, sessions ? def.sessionsPerWeek / sessions : 0);
  return { ...out, weeks: passes, sessionsPerWeek: def.sessionsPerWeek };
}

// ───────────────────────── status ─────────────────────────

export type LandmarkZone = "belowMV" | "maintenance" | "growth" | "high" | "aboveMRV" | "n/a";
export type ResearchVerdict = "below" | "within" | "above" | "n/a";

export interface LandmarkStatus {
  muscle: MuscleId | LandmarkGroup;
  group: LandmarkGroup | null;
  /** sets compared with the RP landmarks (direct when given, else the fractional count) */
  rpSets: number;
  /** sets compared with the research range (fractional) */
  sets: number;
  zone: LandmarkZone;
  landmarks: Landmarks | null;
  research: ResearchVerdict;
  researchRange: [number, number] | null;
  note: string;
}

const r1 = (x: number) => (Math.round(x * 10) / 10).toString();

function zoneOf(n: number, l: Landmarks): LandmarkZone {
  if (n <= 0 || n < l.mv) return "belowMV";
  if (n < l.mev) return "maintenance";
  if (n <= l.mav[1]) return "growth";
  if (n <= l.mrv) return "high";
  return "aboveMRV";
}

function zoneNote(z: LandmarkZone, n: number, l: Landmarks): string {
  const s = `${r1(n)} sets/wk`;
  const mav = `${l.mav[0]}–${l.mav[1]}`;
  switch (z) {
    case "belowMV":
      return n <= 0 ? `No hard ${l.name.toLowerCase()} work.` : `${s} is under maintenance volume (~${l.mv}); ${l.name.toLowerCase()} may slowly lose size over months.`;
    case "maintenance":
      return `${s}: enough to maintain ${l.name.toLowerCase()} but under the minimum for growth (MEV ~${l.mev}).`;
    case "growth":
      return n < l.mav[0]
        ? `${s}: above MEV (~${l.mev}), so ${l.name.toLowerCase()} should grow; most growth happens around ${mav}.`
        : `${s}: in the productive ${mav} range (MAV) for ${l.name.toLowerCase()}.`;
    case "high":
      return `${s}: past the usual MAV (${mav}) toward MRV (~${l.mrv}); fine for a few weeks of overreaching, then deload.`;
    case "aboveMRV":
      return `${s}: beyond the maximum most people recover from (~${l.mrv}); extra sets likely add fatigue, not growth. Cut back or deload.`;
    default:
      return "";
  }
}

/**
 * Where a weekly set count sits for a muscle or landmark group. Pass a number (used for both
 * comparisons) or `{ sets, direct }` (fractional for the research range, direct for RP).
 */
export function landmarkStatus(sets: number | { sets: number; direct?: number }, muscle: MuscleId | LandmarkGroup): LandmarkStatus {
  const frac = typeof sets === "number" ? sets : sets.sets;
  const rpSets = typeof sets === "number" ? sets : sets.direct ?? sets.sets;
  const isGroup = muscle in LANDMARKS;
  const group = isGroup ? (muscle as LandmarkGroup) : MUSCLE_GROUP[muscle as MuscleId] ?? null;
  const l = group ? LANDMARKS[group] : null;
  const researchRange: [number, number] | null = isGroup ? RESEARCH_RANGE : MUSCLE[muscle as MuscleId]?.range ?? null;
  const zone: LandmarkZone = l ? zoneOf(rpSets, l) : "n/a";
  const research: ResearchVerdict = !researchRange ? "n/a" : frac < researchRange[0] ? "below" : frac > researchRange[1] ? "above" : "within";
  const parts: string[] = [];
  if (l) parts.push(zoneNote(zone, rpSets, l));
  if (researchRange) {
    const [lo, hi] = researchRange;
    parts.push(
      research === "below" ? `Research suggests ~${lo}–${hi} hard sets/wk for growth; you're at ${r1(frac)} (fractional).`
      : research === "above" ? `${r1(frac)} fractional sets is above the ~${lo}–${hi} most studies tested; returns diminish, so only worth it if you recover.`
      : `${r1(frac)} fractional sets is inside the ~${lo}–${hi} research range.`,
    );
  } else if (!l) {
    const name = MUSCLE[muscle as MuscleId]?.name ?? muscle;
    parts.push(`${name}: ${r1(frac)} fractional sets/wk. No established target; it's trained indirectly by compound lifts.`);
  }
  if (l?.caveat && rpSets < l.mav[0]) parts.push(l.caveat);
  return { muscle, group, rpSets, sets: frac, zone, landmarks: l, research, researchRange, note: parts.join(" ") };
}
