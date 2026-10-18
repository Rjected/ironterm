// Muscle catalogue + per-lift involvement ("fractional sets").
//
// Every lift in shared/lifts.ts maps to how much each muscle works in one set of it:
//   1.0   prime mover (the muscle the set is "for")
//   ~0.5  major synergist (triceps in bench, glutes in squat)
//   ~0.25 stabiliser / minor synergist (erectors in a row, abs in OHP)
// That is the fractional-set convention from the hypertrophy literature: Pelland et al. 2024,
// "The Resistance Training Dose-Response: Meta-Regressions Exploring the Effects of Weekly Volume
// and Frequency on Muscle Hypertrophy and Strength Gain" (SportRxiv, doi:10.51224/SRXIV.476) found
// that counting indirect sets as 0.5 explains growth better than counting them as 0 or 1. Values in
// between come from EMG / MRI-hypertrophy studies cited next to each pattern below; they are
// estimates, not measurements, so treat the numbers as ±0.25.
//
// Muscle granularity follows the anatomy art (src/anatomy): each id here has at least one region
// on the drawing. Deep muscles the surface drawing can't show (rhomboids, erectors, brachialis,
// soleus) get a dashed "seen through" outline.

import type { HevyExerciseTemplate } from "./hevy";
import { LIFTS, type Muscle as CoarseMuscle } from "./lifts";

export type MuscleGroup = "chest" | "shoulders" | "arms" | "back" | "core" | "hips" | "legs";

export interface MuscleDef {
  id: MuscleId;
  name: string;
  short: string;
  group: MuscleGroup;
  /**
   * Fatigue decay time constant in hours (residual fatigue × e^(−t/τ)). A muscle is treated as
   * recovered once residual fatigue falls below ~15 % of a session's dose, i.e. after ≈1.9 τ.
   * See RECOVERY NOTES at the bottom of this file for where these come from.
   */
  tau: number;
  /** Evidence-based weekly fractional-set range for growth, or null for small stabilisers that
   *  get their work indirectly and have no meaningful target. */
  range: [number, number] | null;
  /** not visible on the surface figure; drawn as a dashed outline */
  deep?: boolean;
}

const M = (id: MuscleId, name: string, short: string, group: MuscleGroup, tau: number, range: [number, number] | null, deep?: boolean): MuscleDef =>
  ({ id, name, short, group, tau, range, deep });

export type MuscleId =
  | "pecUpper" | "pecLower" | "serratus"
  | "frontDelt" | "sideDelt" | "rearDelt" | "infraspinatus" | "teres"
  | "biceps" | "brachialis" | "brachioradialis" | "tricepsLong" | "tricepsLateral" | "forearmFlexors" | "forearmExtensors"
  | "trapsUpper" | "trapsMid" | "trapsLower" | "rhomboids" | "lats" | "erectors"
  | "abs" | "obliques" | "neck"
  | "gluteMax" | "gluteMed" | "hipFlexors" | "adductors"
  | "rectusFemoris" | "vastusLateralis" | "vastusMedialis" | "hamsLateral" | "hamsMedial"
  | "gastrocnemius" | "soleus" | "tibialis";

// Weekly ranges: ~10–20 fractional sets/week for the big movers (Schoenfeld, Ogborn & Krieger
// 2017, J Sports Sci 35:1073 "Dose-response relationship between weekly resistance training
// volume and increases in muscle mass"; Baz-Valle et al. 2022, J Hum Kinet 81:199 found 12–20
// best for most), lower floors for muscles that get lots of indirect work (side/rear delts, arms,
// calves, abs) — in line with the practical "MEV–MRV" landmarks popularised by Israetel et al.
const BIG: [number, number] = [10, 20];
const SMALL: [number, number] = [8, 20];

export const MUSCLES: MuscleDef[] = [
  // chest
  M("pecUpper", "Pectoralis major, clavicular", "UPPER PEC", "chest", 24, BIG),
  M("pecLower", "Pectoralis major, sternal", "LOWER PEC", "chest", 26, BIG),
  M("serratus", "Serratus anterior", "SERRATUS", "chest", 18, null),
  // shoulders
  M("frontDelt", "Anterior deltoid", "FRONT DELT", "shoulders", 22, SMALL),
  M("sideDelt", "Lateral deltoid", "SIDE DELT", "shoulders", 18, SMALL),
  M("rearDelt", "Posterior deltoid", "REAR DELT", "shoulders", 18, SMALL),
  M("infraspinatus", "Infraspinatus / teres minor", "INFRASPIN", "shoulders", 18, null),
  M("teres", "Teres major", "TERES MAJ", "back", 20, null),
  // arms
  M("biceps", "Biceps brachii", "BICEPS", "arms", 20, SMALL),
  M("brachialis", "Brachialis", "BRACHIALIS", "arms", 20, null, true),
  M("brachioradialis", "Brachioradialis", "BRACHIORAD", "arms", 16, null),
  M("tricepsLong", "Triceps, long head", "TRI LONG", "arms", 22, SMALL),
  M("tricepsLateral", "Triceps, lateral + medial heads", "TRI LAT", "arms", 20, SMALL),
  M("forearmFlexors", "Wrist & finger flexors", "FLEXORS", "arms", 16, null),
  M("forearmExtensors", "Wrist & finger extensors", "EXTENSORS", "arms", 16, null),
  // back
  M("trapsUpper", "Trapezius, upper", "UPPER TRAP", "back", 20, SMALL),
  M("trapsMid", "Trapezius, middle", "MID TRAP", "back", 20, SMALL),
  M("trapsLower", "Trapezius, lower", "LOWER TRAP", "back", 20, null),
  M("rhomboids", "Rhomboids", "RHOMBOIDS", "back", 22, null, true),
  M("lats", "Latissimus dorsi", "LATS", "back", 24, BIG),
  M("erectors", "Erector spinae", "ERECTORS", "back", 34, null, true),
  // core
  M("abs", "Rectus abdominis", "ABS", "core", 16, SMALL),
  M("obliques", "External obliques", "OBLIQUES", "core", 18, null),
  M("neck", "Sternocleidomastoid / neck", "NECK", "core", 16, null),
  // hips
  M("gluteMax", "Gluteus maximus", "GLUTE MAX", "hips", 30, BIG),
  M("gluteMed", "Gluteus medius / TFL", "GLUTE MED", "hips", 22, null),
  M("hipFlexors", "Hip flexors (sartorius, iliopsoas)", "HIP FLEX", "hips", 18, null),
  M("adductors", "Adductors", "ADDUCTORS", "hips", 30, SMALL),
  // legs
  M("rectusFemoris", "Rectus femoris", "RECT FEM", "legs", 26, BIG),
  M("vastusLateralis", "Vastus lateralis", "VAST LAT", "legs", 30, BIG),
  M("vastusMedialis", "Vastus medialis", "VAST MED", "legs", 30, BIG),
  M("hamsLateral", "Biceps femoris", "BICEPS FEM", "legs", 34, BIG),
  M("hamsMedial", "Semitendinosus / semimembranosus", "SEMI-T/M", "legs", 34, BIG),
  M("gastrocnemius", "Gastrocnemius", "GASTROC", "legs", 20, SMALL),
  M("soleus", "Soleus", "SOLEUS", "legs", 16, SMALL, true),
  M("tibialis", "Tibialis anterior / shin", "TIBIALIS", "legs", 16, null),
];

export const MUSCLE: Record<MuscleId, MuscleDef> = Object.fromEntries(MUSCLES.map((m) => [m.id, m])) as Record<MuscleId, MuscleDef>;
export const MUSCLE_IDS = MUSCLES.map((m) => m.id);

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  chest: "CHEST", shoulders: "SHOULDERS", arms: "ARMS", back: "BACK", core: "CORE", hips: "HIPS", legs: "LEGS",
};

export type Involvement = Partial<Record<MuscleId, number>>;

export interface LiftProfile {
  muscles: Involvement;
  /**
   * Fatigue multiplier for the lift as a whole: eccentric/stretch emphasis, axial loading and
   * how much total mass moves. 1 = typical compound. Heuristic, documented per entry.
   */
  fatigue: number;
}

// ───────────────────────── building blocks ─────────────────────────

const merge = (...xs: Involvement[]): Involvement => {
  const out: Involvement = {};
  for (const x of xs) for (const [k, v] of Object.entries(x) as [MuscleId, number][]) out[k] = Math.max(out[k] ?? 0, v);
  return out;
};
const scale = (x: Involvement, f: number): Involvement => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, +(v! * f).toFixed(2)])) as Involvement;

const VASTI = (v: number): Involvement => ({ vastusLateralis: v, vastusMedialis: v });
const HAMS = (v: number): Involvement => ({ hamsLateral: v, hamsMedial: v });
const TRI = (lat: number, long: number): Involvement => ({ tricepsLateral: lat, tricepsLong: long });
const ELBOW_FLEX = (b: number): Involvement => ({ biceps: b, brachialis: b, brachioradialis: +(b * 0.7).toFixed(2) });
const BRACE = (v: number): Involvement => ({ abs: v, obliques: v });
const GRIP = (v: number): Involvement => ({ forearmFlexors: v });

// Squat: vasti are the prime movers; rectus femoris is biarticular and grows little from squats
// (Kubo et al. 2019, Eur J Appl Physiol 119:1933: full squats grew vasti, adductors and glute max,
// not rectus femoris or hamstrings). Hamstrings are near-isometric (Escamilla 2001 review, MSSE).
const SQUAT: Involvement = merge(VASTI(1), { rectusFemoris: 0.35, gluteMax: 0.75, adductors: 0.75, gluteMed: 0.25, erectors: 0.5, soleus: 0.15 }, HAMS(0.2), BRACE(0.25));
const FRONT_SQUAT: Involvement = merge(SQUAT, { gluteMax: 0.6, adductors: 0.6, erectors: 0.4, trapsMid: 0.25, rhomboids: 0.25, abs: 0.35 });
const LEG_PRESS: Involvement = merge(VASTI(1), { rectusFemoris: 0.35, gluteMax: 0.5, adductors: 0.5 });
const SPLIT_SQUAT: Involvement = merge(VASTI(1), { rectusFemoris: 0.35, gluteMax: 0.75, adductors: 0.6, gluteMed: 0.5, soleus: 0.15 }, HAMS(0.25), BRACE(0.25), GRIP(0.25));
// Conventional deadlift: erectors and glute max drive it, hamstrings are long synergists, and
// the upper back and grip work isometrically (Escamilla et al. 2002 MSSE; Martín-Fuentes 2020
// systematic review of deadlift EMG, PLoS One 15:e0229507).
const DEADLIFT: Involvement = merge({ erectors: 1, gluteMax: 0.75, adductors: 0.6, trapsUpper: 0.5, trapsMid: 0.4, rhomboids: 0.3, lats: 0.35, rectusFemoris: 0.15 }, VASTI(0.5), HAMS(0.5), GRIP(0.5), BRACE(0.25));
const SUMO: Involvement = merge(DEADLIFT, VASTI(0.6), { adductors: 0.85, gluteMax: 0.85, erectors: 0.8 }, HAMS(0.4));
// RDL / SLDL: hamstrings lengthened under load — the stretch is what drives both growth and the
// soreness (Maeo et al. 2021 MSSE 53:825 on lengthened hamstring training).
const RDL: Involvement = merge(HAMS(1), { gluteMax: 0.75, erectors: 0.6, adductors: 0.5, trapsUpper: 0.25, lats: 0.25 }, GRIP(0.35));
const BENCH: Involvement = merge({ pecLower: 1, pecUpper: 0.6, frontDelt: 0.5, serratus: 0.25 }, TRI(0.6, 0.35));
const INCLINE: Involvement = merge({ pecUpper: 1, pecLower: 0.5, frontDelt: 0.65, serratus: 0.25 }, TRI(0.5, 0.3));
const OHP: Involvement = merge({ frontDelt: 1, sideDelt: 0.5, pecUpper: 0.35, trapsUpper: 0.4, serratus: 0.4, erectors: 0.2 }, TRI(0.6, 0.35), BRACE(0.25));
// Rows hit the scapular retractors hardest; lats are a strong synergist (Fenwick et al. 2009 JSCR
// 23:350 EMG of row variants). Bent-over rows add an erector/hamstring isometric.
const ROW_SUPPORTED: Involvement = merge({ trapsMid: 1, rhomboids: 1, lats: 0.75, rearDelt: 0.5, teres: 0.5, infraspinatus: 0.35, trapsLower: 0.35 }, ELBOW_FLEX(0.5), GRIP(0.25));
const ROW_BENT: Involvement = merge(ROW_SUPPORTED, { erectors: 0.5, gluteMax: 0.25 }, HAMS(0.25), GRIP(0.35));
// Vertical pulls: lats + teres major prime movers, lower traps rotate the scapula down.
const PULLDOWN: Involvement = merge({ lats: 1, teres: 0.75, trapsLower: 0.5, rhomboids: 0.5, trapsMid: 0.25, rearDelt: 0.35, pecLower: 0.15 }, ELBOW_FLEX(0.5), GRIP(0.35));
const PULL_UP: Involvement = merge(PULLDOWN, { abs: 0.2 });
const CURL: Involvement = merge({ biceps: 1, brachialis: 0.6, brachioradialis: 0.35, forearmFlexors: 0.25 });
const REAR_FLY: Involvement = { rearDelt: 1, trapsMid: 0.5, rhomboids: 0.5, infraspinatus: 0.5, teres: 0.35 };
const CALF: Involvement = { gastrocnemius: 1, soleus: 0.6 };

const P = (muscles: Involvement, fatigue = 1): LiftProfile => ({ muscles, fatigue });

/**
 * Involvement per lift key in shared/lifts.ts. `fatigue` > 1: heavy eccentric / stretch /
 * axial lifts (deadlift variants, RDLs, good mornings, Nordic/GHR, split squats); < 1: machines
 * and cables where stability demand and eccentric damage are low.
 */
export const LIFT_PROFILES: Record<string, LiftProfile> = {
  squat: P(SQUAT, 1.15),
  pauseSquat: P(SQUAT, 1.15),
  frontSquat: P(FRONT_SQUAT, 1.15),
  boxSquat: P(merge(SQUAT, { gluteMax: 0.85 }, HAMS(0.3)), 1.05),
  pinSquat: P(SQUAT, 1.1),
  zercherSquat: P(merge(FRONT_SQUAT, ELBOW_FLEX(0.35), { trapsUpper: 0.35 }), 1.2),
  safetyBarSquat: P(merge(SQUAT, { trapsMid: 0.3, erectors: 0.6 }), 1.15),
  hackSquat: P(LEG_PRESS, 1.05),
  legPress: P(LEG_PRESS, 1),
  gobletSquat: P(merge(SQUAT, { erectors: 0.3, abs: 0.35, frontDelt: 0.2, biceps: 0.2 }), 1),
  bulgarianSplitSquat: P(SPLIT_SQUAT, 1.2),
  lunge: P(SPLIT_SQUAT, 1.2),
  splitSquat: P(SPLIT_SQUAT, 1.15),
  legExtension: P(merge(VASTI(1), { rectusFemoris: 1 }), 0.85),
  pendulumSquat: P(merge(LEG_PRESS, { gluteMax: 0.6 }), 1.05),
  beltSquat: P(merge(LEG_PRESS, { adductors: 0.6, gluteMax: 0.6 }), 1),

  deadlift: P(DEADLIFT, 1.25),
  sumoDeadlift: P(SUMO, 1.2),
  pauseDeadlift: P(DEADLIFT, 1.25),
  snatchGripDeadlift: P(merge(DEADLIFT, VASTI(0.6), { trapsUpper: 0.75, trapsMid: 0.6, rhomboids: 0.5 }, HAMS(0.6)), 1.3),
  deficitDeadlift: P(merge(DEADLIFT, VASTI(0.6), HAMS(0.6)), 1.3),
  rackPull: P(merge(DEADLIFT, VASTI(0.25), HAMS(0.35), { trapsUpper: 0.75 }), 1.1),
  rdl: P(RDL, 1.25),
  dbRdl: P(RDL, 1.2),
  stiffLegDeadlift: P(merge(RDL, { erectors: 0.75 }), 1.25),
  trapBarDeadlift: P(merge(DEADLIFT, VASTI(0.75), { erectors: 0.75 }, HAMS(0.4)), 1.15),
  goodMorning: P(merge(HAMS(1), { erectors: 1, gluteMax: 0.6, adductors: 0.5 }, BRACE(0.25)), 1.3),
  hipThrust: P(merge({ gluteMax: 1, gluteMed: 0.35, adductors: 0.35 }, VASTI(0.25), HAMS(0.35)), 0.95),
  legCurl: P(merge(HAMS(1), { gastrocnemius: 0.35 }), 0.95),
  // Nordic / GHR: the textbook muscle-damage exercise (Brockett, Morgan & Proske 2001 MSSE 33:783).
  gluteHamRaise: P(merge(HAMS(1), { gastrocnemius: 0.35, gluteMax: 0.35, erectors: 0.25 }), 1.35),
  backExtension: P(merge({ erectors: 1, gluteMax: 0.6 }, HAMS(0.6)), 1),
  reverseHyper: P(merge({ gluteMax: 1, erectors: 0.75 }, HAMS(0.6)), 1),
  kbSwing: P(merge({ gluteMax: 1, erectors: 0.5 }, HAMS(0.6), BRACE(0.25), GRIP(0.25)), 0.95),

  bench: P(BENCH, 1),
  pauseBench: P(BENCH, 1),
  cgBench: P(merge({ pecLower: 0.6, pecUpper: 0.5, frontDelt: 0.5 }, TRI(1, 0.6)), 1),
  wideBench: P(merge(BENCH, { pecLower: 1, frontDelt: 0.55 }, TRI(0.5, 0.3)), 1),
  inclineBench: P(INCLINE, 1),
  declineBench: P(merge(BENCH, { pecUpper: 0.35, frontDelt: 0.35 }), 1),
  feetUpBench: P(merge(BENCH, { abs: 0.15 }), 1),
  spotoPress: P(BENCH, 1),
  boardPress: P(merge(BENCH, TRI(0.75, 0.4)), 0.9),
  floorPress: P(merge(BENCH, TRI(0.75, 0.4)), 0.9),
  pinPress: P(merge(BENCH, TRI(0.75, 0.4)), 0.9),
  dbBench: P(merge(BENCH, { serratus: 0.3 }), 1),
  dbInclineBench: P(INCLINE, 1),
  machineChestPress: P(BENCH, 0.85),
  smithBench: P(BENCH, 0.9),
  // Dips: deep shoulder extension puts sternal pecs and front delts on stretch.
  dip: P(merge({ pecLower: 1, pecUpper: 0.35, frontDelt: 0.6, serratus: 0.15 }, TRI(0.75, 0.5)), 1.1),
  pushUp: P(merge(BENCH, { serratus: 0.5 }, BRACE(0.25)), 0.9),
  chestFly: P({ pecLower: 1, pecUpper: 0.6, frontDelt: 0.35, biceps: 0.15 }, 0.9),
  inclineFly: P({ pecUpper: 1, pecLower: 0.5, frontDelt: 0.5, biceps: 0.15 }, 0.9),

  ohp: P(OHP, 1),
  pushPress: P(merge(OHP, VASTI(0.35), { gluteMax: 0.25, trapsUpper: 0.5 }), 1),
  seatedOhp: P(merge(OHP, { erectors: 0, abs: 0.15, obliques: 0.15 }), 1),
  dbOhp: P(OHP, 1),
  arnoldPress: P(merge(OHP, { sideDelt: 0.6 }), 1),
  machineShoulderPress: P(merge(OHP, { erectors: 0, abs: 0, obliques: 0, serratus: 0.25 }), 0.85),
  // Lateral raise: lateral deltoid with upper traps assisting above ~90°.
  lateralRaise: P({ sideDelt: 1, trapsUpper: 0.3, frontDelt: 0.25, serratus: 0.15 }, 0.85),
  frontRaise: P({ frontDelt: 1, pecUpper: 0.5, sideDelt: 0.25, serratus: 0.25 }, 0.85),
  rearDeltFly: P(REAR_FLY, 0.85),
  facePull: P(merge(REAR_FLY, { infraspinatus: 0.6, trapsLower: 0.35 }), 0.85),
  bandPullApart: P(merge(REAR_FLY, { trapsMid: 0.6, rhomboids: 0.6 }), 0.7),
  uprightRow: P(merge({ sideDelt: 1, trapsUpper: 0.75, frontDelt: 0.35 }, ELBOW_FLEX(0.25)), 0.9),

  row: P(ROW_BENT, 1.05),
  pendlayRow: P(ROW_BENT, 1.05),
  sealRow: P(ROW_SUPPORTED, 0.95),
  tBarRow: P(merge(ROW_BENT, { lats: 0.8 }), 1),
  dbRow: P(merge(ROW_SUPPORTED, { lats: 1, trapsMid: 0.75, rhomboids: 0.75, teres: 0.6, obliques: 0.15 }), 0.95),
  chestSupportedRow: P(ROW_SUPPORTED, 0.95),
  cableRow: P(merge(ROW_SUPPORTED, { erectors: 0.25 }), 0.9),
  invertedRow: P(merge(ROW_SUPPORTED, { abs: 0.25, gluteMax: 0.25 }), 0.9),
  latPulldown: P(PULLDOWN, 0.9),
  pullUp: P(PULL_UP, 1),
  chinUp: P(merge(PULL_UP, ELBOW_FLEX(0.75)), 1),
  straightArmPulldown: P({ lats: 1, teres: 0.75, tricepsLong: 0.35, pecLower: 0.25, abs: 0.15 }, 0.85),
  pullover: P({ lats: 0.75, pecLower: 0.6, teres: 0.5, serratus: 0.5, tricepsLong: 0.35 }, 0.95),
  shrug: P(merge({ trapsUpper: 1, trapsMid: 0.35, neck: 0.25 }, GRIP(0.35)), 0.85),

  bicepCurl: P(CURL, 0.9),
  barbellCurl: P(CURL, 0.9),
  hammerCurl: P({ brachialis: 1, brachioradialis: 1, biceps: 0.5, forearmFlexors: 0.25 }, 0.9),
  // Incline curl trains the biceps long head at long muscle length.
  inclineCurl: P({ biceps: 1, brachialis: 0.5, brachioradialis: 0.3 }, 1),
  preacherCurl: P({ biceps: 1, brachialis: 0.75, brachioradialis: 0.3 }, 1),
  concentrationCurl: P({ biceps: 1, brachialis: 0.6, brachioradialis: 0.3 }, 0.9),
  spiderCurl: P({ biceps: 1, brachialis: 0.75, brachioradialis: 0.3 }, 0.9),
  tricepPushdown: P(TRI(1, 0.6), 0.85),
  // Overhead extensions grow the long head ~1.5× more than pushdowns (Maeo et al. 2023, Eur J
  // Sport Sci 23:1240).
  overheadTricep: P(TRI(0.6, 1), 0.95),
  skullcrusher: P(TRI(1, 0.85), 0.95),
  jmPress: P(merge(TRI(1, 0.5), { pecLower: 0.25 }), 0.95),
  tricepKickback: P(TRI(1, 0.6), 0.8),
  wristCurl: P({ forearmFlexors: 1 }, 0.7),

  calfRaise: P(CALF, 0.85),
  // Bent knee shortens the gastrocnemius so soleus does the work.
  seatedCalfRaise: P({ soleus: 1, gastrocnemius: 0.3 }, 0.8),
  hangingLegRaise: P(merge({ abs: 1, hipFlexors: 1, obliques: 0.5, lats: 0.15 }, GRIP(0.35)), 0.85),
  abWheel: P({ abs: 1, obliques: 0.5, lats: 0.35, hipFlexors: 0.35, serratus: 0.25, tricepsLong: 0.15 }, 0.9),
  cableCrunch: P({ abs: 1, obliques: 0.5 }, 0.8),
  plank: P({ abs: 1, obliques: 0.5, serratus: 0.25 }, 0.5),
  birdDog: P({ erectors: 1, gluteMax: 0.5, abs: 0.25, obliques: 0.25 }, 0.5),
  sidePlank: P({ obliques: 0.75, gluteMed: 0.5, abs: 0.35 }, 0.6),
  sitUp: P({ abs: 1, hipFlexors: 0.75, obliques: 0.5 }, 0.8),
  farmersWalk: P(merge({ forearmFlexors: 1, trapsUpper: 0.75, gluteMed: 0.35, erectors: 0.35, gastrocnemius: 0.25 }, BRACE(0.4)), 0.9),
  powerClean: P(merge({ trapsUpper: 0.75, gluteMax: 0.75, erectors: 0.75, rearDelt: 0.25, gastrocnemius: 0.35 }, VASTI(0.6), HAMS(0.5), GRIP(0.35)), 1.1),
};

// ───────────────────────── fallbacks ─────────────────────────

/** Hevy's `primary_muscle_group` / `secondary_muscle_groups` vocabulary → our muscles. */
export const HEVY_GROUPS: Record<string, Involvement> = {
  abdominals: { abs: 1, obliques: 0.5 },
  abductors: { gluteMed: 1 },
  adductors: { adductors: 1 },
  biceps: { biceps: 1, brachialis: 0.6, brachioradialis: 0.35 },
  calves: CALF,
  chest: { pecLower: 1, pecUpper: 0.6, frontDelt: 0.35 },
  forearms: { forearmFlexors: 1, forearmExtensors: 0.6, brachioradialis: 0.5 },
  glutes: { gluteMax: 1, gluteMed: 0.5 },
  hamstrings: HAMS(1),
  lats: { lats: 1, teres: 0.6 },
  lower_back: { erectors: 1 },
  neck: { neck: 1 },
  quadriceps: merge(VASTI(1), { rectusFemoris: 0.6 }),
  shoulders: { frontDelt: 1, sideDelt: 0.6, rearDelt: 0.35 },
  traps: { trapsUpper: 1, trapsMid: 0.6 },
  triceps: TRI(1, 0.8),
  upper_back: { trapsMid: 1, rhomboids: 1, rearDelt: 0.5, trapsLower: 0.5, teres: 0.5, infraspinatus: 0.5 },
  full_body: { gluteMax: 0.35, erectors: 0.35, vastusLateralis: 0.35, vastusMedialis: 0.35, trapsUpper: 0.35, lats: 0.25 },
};

/** Involvement from a Hevy exercise template: primary at full weight, secondaries at half. */
export function templateInvolvement(t: Pick<HevyExerciseTemplate, "primary_muscle_group" | "secondary_muscle_groups">): Involvement {
  const out: Involvement[] = [];
  if (t.primary_muscle_group && HEVY_GROUPS[t.primary_muscle_group]) out.push(HEVY_GROUPS[t.primary_muscle_group]);
  for (const g of t.secondary_muscle_groups ?? []) if (HEVY_GROUPS[g]) out.push(scale(HEVY_GROUPS[g], 0.5));
  return merge(...out);
}

const COARSE: Record<CoarseMuscle, string> = {
  quads: "quadriceps", hamstrings: "hamstrings", glutes: "glutes", chest: "chest", back: "upper_back", lats: "lats",
  shoulders: "shoulders", triceps: "triceps", biceps: "biceps", calves: "calves", abs: "abdominals", traps: "traps",
  forearms: "forearms", full: "full_body",
};

// Title keywords → Hevy group (primary, secondaries), for exercises with neither a lift key nor a
// template. First match wins, so specific patterns come first.
const DIRECT: [RegExp, Involvement][] = [
  [/lateral raise|side raise|y.?raise/i, { sideDelt: 1, trapsUpper: 0.3, frontDelt: 0.25 }],
  [/rear delt|reverse fly|face pull/i, REAR_FLY],
];
const KEYWORDS: [RegExp, string, string[]][] = [
  [/leg curl|hamstring curl|nordic/i, "hamstrings", ["calves"]],
  [/leg ext/i, "quadriceps", []],
  [/leg press|squat|lunge|step.?up|split/i, "quadriceps", ["glutes", "adductors"]],
  [/calf/i, "calves", []],
  [/hip thrust|glute|bridge|kickback/i, "glutes", ["hamstrings"]],
  [/abduct/i, "abductors", []],
  [/adduct/i, "adductors", []],
  [/deadlift|rdl|good morning|hinge/i, "hamstrings", ["glutes", "lower_back"]],
  [/back ext|hyperext|superman/i, "lower_back", ["glutes", "hamstrings"]],
  [/pull.?up|chin.?up|pulldown|pull down/i, "lats", ["biceps", "upper_back"]],
  [/row/i, "upper_back", ["lats", "biceps"]],
  [/shrug/i, "traps", []],
  [/overhead press|shoulder press|military|arnold|push press/i, "shoulders", ["triceps"]],
  [/bench|chest|fly|push.?up|dip|pec/i, "chest", ["triceps", "shoulders"]],
  [/tricep|skull|pushdown|kickback/i, "triceps", []],
  [/wrist|grip|forearm/i, "forearms", []],
  [/curl/i, "biceps", ["forearms"]],
  [/crunch|sit.?up|leg raise|plank|ab |abs|core|oblique|twist|wheel/i, "abdominals", []],
  [/neck/i, "neck", []],
  [/clean|snatch|jerk|thruster|burpee/i, "full_body", []],
];

export function keywordInvolvement(title: string): Involvement | null {
  for (const [re, inv] of DIRECT) if (re.test(title)) return inv;
  for (const [re, g, sec] of KEYWORDS) if (re.test(title)) return templateInvolvement({ primary_muscle_group: g, secondary_muscle_groups: sec });
  return null;
}

/** Involvement for a lift key, falling back to its coarse `muscle` for lifts added later. */
export function liftProfile(key: string): LiftProfile | null {
  const p = LIFT_PROFILES[key];
  if (p) return p;
  const def = LIFTS[key];
  if (!def) return null;
  return { muscles: HEVY_GROUPS[COARSE[def.muscle]] ?? {}, fatigue: def.kind === "machine" ? 0.85 : 1 };
}

/** Involvement for a logged Hevy exercise: lift library → template groups → title keywords. */
export function exerciseProfile(liftKey: string | null, title: string, template?: Pick<HevyExerciseTemplate, "primary_muscle_group" | "secondary_muscle_groups">): LiftProfile | null {
  if (liftKey) {
    const p = liftProfile(liftKey);
    if (p) return p;
  }
  if (template?.primary_muscle_group) {
    const m = templateInvolvement(template);
    if (Object.keys(m).length) return { muscles: m, fatigue: 1 };
  }
  const k = keywordInvolvement(title);
  return k ? { muscles: k, fatigue: 1 } : null;
}

// ───────────────────────── RECOVERY NOTES ─────────────────────────
//
// τ (hours) per muscle. Recovery of force and soreness after hard resistance training typically
// takes 24–72 h and scales with muscle size, eccentric/stretch emphasis and proximity to failure:
//  • Morán-Navarro et al. 2017, Eur J Appl Physiol 117:2387 — sets to failure needed >48 h for
//    mechanical/biochemical markers to normalise; the same volume stopped short recovered in 24–48 h.
//  • Raastad & Hallén 2000, Eur J Appl Physiol 82:206 — knee extensors still down ~10 % at 33 h
//    after a heavy session, back to baseline by ~3 days.
//  • McLester et al. 2003, JSCR 17:259 — whole-body sessions: ~72 h for full recovery in most lifts.
//  • Hamstrings after lengthened/eccentric work stay weak/sore longest (Brockett 2001; Maeo 2021).
//  • Calves/forearms/abs (high type-I fibre share, lots of daily use) recover fastest.
// So τ runs from 16 h (calves, forearms, abs: ~30 h to "recovered") to 34 h (hamstrings,
// erectors: ~65 h). Exact numbers are judgement calls fitted to those ranges.
