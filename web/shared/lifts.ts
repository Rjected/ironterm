import type { LiftKind } from "./units";

export type Muscle =
  | "quads" | "hamstrings" | "glutes" | "chest" | "back" | "lats" | "shoulders" | "triceps" | "biceps"
  | "calves" | "abs" | "traps" | "forearms" | "full";

export interface LiftDef {
  name: string;
  short: string;
  kind: LiftKind;
  /** Hevy exercise titles that count as this lift, first match wins. Overridable per user. */
  hevy: string[];
  upper: boolean;
  muscle: Muscle;
}

const L = (name: string, short: string, kind: LiftKind, muscle: Muscle, upper: boolean, ...hevy: string[]): LiftDef => ({ name, short, kind, muscle, upper, hevy });

/**
 * Shared lift library. Programs reference lifts by key. Titles are exact Hevy exercise names
 * (from GET /v1/exercise_templates). Add new ones here.
 */
export const LIFTS: Record<string, LiftDef> = {
  // ── competition lifts ──
  squat: L("Back Squat", "SQUAT", "barbell", "quads", false, "Squat (Barbell)", "Full Squat"),
  bench: L("Bench Press", "BENCH", "barbell", "chest", true, "Bench Press (Barbell)"),
  deadlift: L("Deadlift", "DEADLIFT", "barbell", "back", false, "Deadlift (Barbell)"),
  ohp: L("Overhead Press", "OHP", "barbell", "shoulders", true, "Overhead Press (Barbell)", "Standing Military Press (Barbell)"),

  // ── squat variations ──
  pauseSquat: L("Pause Squat", "PAUSE SQ", "barbell", "quads", false, "Pause Squat (Barbell)", "Barbell Squat (Paused)", "Barbell Pause Squat (slow concentric and eccentric)"),
  frontSquat: L("Front Squat", "FRONT SQ", "barbell", "quads", false, "Front Squat"),
  boxSquat: L("Box Squat", "BOX SQ", "barbell", "quads", false, "Box Squat (Barbell)"),
  pinSquat: L("Pin Squat", "PIN SQ", "barbell", "quads", false, "Pin Squat"),
  zercherSquat: L("Zercher Squat", "ZERCHER", "barbell", "quads", false, "Zercher Squat"),
  // No SSB exercise in Hevy's catalog; map a custom exercise in Setup.
  safetyBarSquat: L("Safety Bar Squat", "SSB SQ", "barbell", "quads", false),
  hackSquat: L("Hack Squat", "HACK SQ", "machine", "quads", false, "Hack Squat (Machine)", "Hack Squat"),
  legPress: L("Leg Press", "LEG PRESS", "machine", "quads", false, "Leg Press (Machine)", "Leg Press Horizontal (Machine)"),
  gobletSquat: L("Goblet Squat", "GOBLET", "dumbbell", "quads", false, "Goblet Squat"),
  bulgarianSplitSquat: L("Bulgarian Split Squat", "BSS", "dumbbell", "quads", false, "Bulgarian Split Squat (Dumbbell)", "Bulgarian Split Squat (Barbell)"),
  splitSquat: L("Split Squat", "SPLIT SQ", "dumbbell", "quads", false, "Split Squat (Dumbbell)"),
  lunge: L("Lunge", "LUNGE", "dumbbell", "quads", false, "Lunge (Dumbbell)", "Walking Lunge (Dumbbell)", "Lunge (Barbell)", "Lunge"),
  legExtension: L("Leg Extension", "LEG EXT", "machine", "quads", false, "Leg Extension (Machine)"),
  pendulumSquat: L("Pendulum Squat", "PENDULUM", "machine", "quads", false, "Pendulum Squat (Machine)"),
  beltSquat: L("Belt Squat", "BELT SQ", "machine", "quads", false, "Belt Squat (Machine)", "Belt Squat"),

  // ── hinge variations ──
  sumoDeadlift: L("Sumo Deadlift", "SUMO DL", "barbell", "back", false, "Sumo Deadlift"),
  deficitDeadlift: L("Deficit Deadlift", "DEFICIT DL", "barbell", "back", false, "Deficit Deadlift (Barbell)"),
  // No Hevy catalog entry for these: create a custom exercise and map it in Setup.
  pauseDeadlift: L("Pause Deadlift", "PAUSE DL", "barbell", "back", false),
  snatchGripDeadlift: L("Snatch-Grip Deadlift", "SG DL", "barbell", "back", false),
  rackPull: L("Rack Pull", "RACK PULL", "barbell", "back", false, "Rack Pull"),
  rdl: L("Romanian Deadlift", "RDL", "barbell", "hamstrings", false, "Romanian Deadlift (Barbell)"),
  dbRdl: L("Dumbbell RDL", "DB RDL", "dumbbell", "hamstrings", false, "Romanian Deadlift (Dumbbell)"),
  stiffLegDeadlift: L("Stiff-Leg Deadlift", "SLDL", "barbell", "hamstrings", false, "Straight Leg Deadlift"),
  trapBarDeadlift: L("Trap Bar Deadlift", "TRAP DL", "barbell", "back", false, "Deadlift (Trap bar)"),
  goodMorning: L("Good Morning", "GOOD AM", "barbell", "hamstrings", false, "Good Morning (Barbell)"),
  hipThrust: L("Hip Thrust", "HIP THRUST", "barbell", "glutes", false, "Hip Thrust (Barbell)", "Hip Thrust (Machine)"),
  legCurl: L("Leg Curl", "LEG CURL", "machine", "hamstrings", false, "Lying Leg Curl (Machine)", "Seated Leg Curl (Machine)", "Standing Leg Curls"),
  // No Hevy catalog entry we can rely on (Hevy's "Nordic Hamstrings Curls" already counts as GHR): map in Setup.
  nordicCurl: L("Nordic Curl", "NORDIC", "bodyweight", "hamstrings", false),
  gluteHamRaise: L("Glute Ham Raise", "GHR", "bodyweight", "hamstrings", false, "Glute Ham Raise", "Nordic Hamstrings Curls"),
  backExtension: L("Back Extension", "BACK EXT", "bodyweight", "back", false, "Back Extension (Hyperextension)", "Back Extension (Weighted Hyperextension)", "Back Extension (Machine)"),
  reverseHyper: L("Reverse Hyper", "REV HYPER", "machine", "glutes", false, "Reverse Hyperextension"),
  kbSwing: L("Kettlebell Swing", "KB SWING", "dumbbell", "glutes", false, "Kettlebell Swing"),

  // ── pressing ──
  pauseBench: L("Paused Bench", "PAUSE BP", "barbell", "chest", true, "Paused Bench (1 Second Pause)", "Barbell Bench Press (Long Pause - 3 seconds)"),
  cgBench: L("Close-Grip Bench", "CG BENCH", "barbell", "triceps", true, "Bench Press - Close Grip (Barbell)"),
  wideBench: L("Wide-Grip Bench", "WIDE BP", "barbell", "chest", true, "Bench Press - Wide Grip (Barbell)"),
  inclineBench: L("Incline Bench Press", "INCLINE", "barbell", "chest", true, "Incline Bench Press (Barbell)"),
  declineBench: L("Decline Bench Press", "DECLINE", "barbell", "chest", true, "Decline Bench Press (Barbell)"),
  feetUpBench: L("Feet-Up Bench", "FEET UP", "barbell", "chest", true, "Feet Up Bench Press (Barbell)"),
  floorPress: L("Floor Press", "FLOOR PR", "barbell", "chest", true, "Floor Press (Barbell)"),
  spotoPress: L("Spoto Press", "SPOTO", "barbell", "chest", true),
  boardPress: L("Board Press", "BOARD PR", "barbell", "chest", true),
  slingshotBench: L("Slingshot Bench", "SLINGSHOT", "barbell", "chest", true),
  dbDeclineBench: L("Decline DB Press", "DEC DB", "dumbbell", "chest", true, "Decline Bench Press (Dumbbell)"),
  pinPress: L("Pin Press", "PIN PRESS", "barbell", "chest", true, "Pin Press"),
  dbBench: L("Dumbbell Bench Press", "DB BENCH", "dumbbell", "chest", true, "Bench Press (Dumbbell)"),
  dbInclineBench: L("Incline DB Press", "DB INCLINE", "dumbbell", "chest", true, "Incline Bench Press (Dumbbell)"),
  machineChestPress: L("Chest Press (Machine)", "CHEST PR", "machine", "chest", true, "Chest Press (Machine)", "Iso-Lateral Chest Press (Machine)", "Incline Chest Press (Machine)"),
  smithBench: L("Smith Bench", "SMITH BP", "machine", "chest", true, "Bench Press (Smith Machine)", "Incline Bench Press (Smith Machine)"),
  dip: L("Dip", "DIP", "bodyweight", "chest", true, "Chest Dip", "Chest Dip (Weighted)", "Triceps Dip", "Triceps Dip (Weighted)", "Ring Dips"),
  pushUp: L("Push Up", "PUSH UP", "bodyweight", "chest", true, "Push Up", "Push Up (Weighted)"),
  chestFly: L("Chest Fly", "FLY", "dumbbell", "chest", true, "Chest Fly (Dumbbell)", "Cable Fly Crossovers", "Butterfly (Pec Deck)", "Chest Fly (Machine)", "Seated Chest Flys (Cable)", "Low Cable Fly Crossovers"),
  inclineFly: L("Incline Fly", "INC FLY", "dumbbell", "chest", true, "Incline Chest Fly (Dumbbell)"),
  pushPress: L("Push Press", "PUSH PRESS", "barbell", "shoulders", true, "Push Press"),
  seatedOhp: L("Seated Overhead Press", "SEATED OHP", "barbell", "shoulders", true, "Seated Overhead Press (Barbell)"),
  dbOhp: L("Dumbbell Shoulder Press", "DB OHP", "dumbbell", "shoulders", true, "Shoulder Press (Dumbbell)", "Seated Overhead Press (Dumbbell)", "Overhead Press (Dumbbell)"),
  arnoldPress: L("Arnold Press", "ARNOLD", "dumbbell", "shoulders", true, "Arnold Press (Dumbbell)"),
  machineShoulderPress: L("Shoulder Press (Machine)", "MACH OHP", "machine", "shoulders", true, "Seated Shoulder Press (Machine)", "Shoulder Press (Machine Plates)"),
  lateralRaise: L("Lateral Raise", "LAT RAISE", "dumbbell", "shoulders", true, "Lateral Raise (Dumbbell)", "Lateral Raise (Cable)", "Lateral Raise (Machine)", "Seated Lateral Raise (Dumbbell)", "Single Arm Lateral Raise (Cable)"),
  frontRaise: L("Front Raise", "FRONT RAISE", "dumbbell", "shoulders", true, "Front Raise (Dumbbell)", "Front Raise (Cable)", "Front Raise (Barbell)"),
  rearDeltFly: L("Rear Delt Fly", "REAR DELT", "dumbbell", "shoulders", true, "Rear Delt Reverse Fly (Dumbbell)", "Rear Delt Reverse Fly (Cable)", "Rear Delt Reverse Fly (Machine)", "Chest Supported Reverse Fly (Dumbbell)"),
  facePull: L("Face Pull", "FACE PULL", "machine", "shoulders", true, "Face Pull"),
  bandPullApart: L("Band Pull-Apart", "PULL-APART", "bodyweight", "shoulders", true, "Band Pullaparts"),
  uprightRow: L("Upright Row", "UPRIGHT", "barbell", "shoulders", true, "Upright Row (Barbell)", "Upright Row (Cable)", "Upright Row (Dumbbell)"),

  // ── pulling ──
  row: L("Barbell Row", "BB ROW", "barbell", "back", true, "Bent Over Row (Barbell)"),
  pendlayRow: L("Pendlay Row", "PENDLAY", "barbell", "back", true, "Pendlay Row (Barbell)"),
  sealRow: L("Seal Row", "SEAL ROW", "barbell", "back", true, "Seal Row (Barbell)", "Seal Row (Dumbbell)"),
  tBarRow: L("T-Bar Row", "T-BAR", "machine", "back", true, "T Bar Row", "Chest Supported T Bar Row", "Landmine Row"),
  dbRow: L("Dumbbell Row", "DB ROW", "dumbbell", "back", true, "Dumbbell Row", "Bent Over Row (Dumbbell)"),
  chestSupportedRow: L("Chest-Supported Row", "CS ROW", "dumbbell", "back", true, "Chest Supported Incline Row (Dumbbell)", "Chest Supported Incline Row"),
  cableRow: L("Seated Cable Row", "CABLE ROW", "machine", "back", true, "Seated Cable Row - V Grip (Cable)", "Seated Cable Row - Bar Grip", "Seated Cable Row - Bar Wide Grip", "Seated Row (Machine)", "Iso-Lateral Low Row", "Iso-Lateral Row (Machine)"),
  invertedRow: L("Inverted Row", "INV ROW", "bodyweight", "back", true, "Inverted Row"),
  latPulldown: L("Lat Pulldown", "LAT PD", "machine", "lats", true, "Lat Pulldown (Cable)", "Lat Pulldown (Machine)", "Lat Pulldown - Close Grip (Cable)", "Reverse Grip Lat Pulldown (Cable)"),
  pullUp: L("Pull Up", "PULL UP", "bodyweight", "lats", true, "Pull Up", "Pull Up (Weighted)", "Wide Pull Up"),
  chinUp: L("Chin Up", "CHIN UP", "bodyweight", "lats", true, "Chin Up", "Chin Up (Weighted)"),
  straightArmPulldown: L("Straight-Arm Pulldown", "SA PULLDN", "machine", "lats", true, "Straight Arm Lat Pulldown (Cable)", "Rope Straight Arm Pulldown"),
  pullover: L("Pullover", "PULLOVER", "dumbbell", "lats", true, "Pullover (Dumbbell)", "Pullover (Machine)"),
  shrug: L("Shrug", "SHRUG", "barbell", "traps", true, "Shrug (Barbell)", "Shrug (Dumbbell)", "Shrug (Machine)", "Shrug (Cable)"),

  // ── arms ──
  bicepCurl: L("Bicep Curl", "CURL", "dumbbell", "biceps", true, "Bicep Curl (Dumbbell)", "Bicep Curl (Cable)", "Bicep Curl (Machine)"),
  barbellCurl: L("Barbell Curl", "BB CURL", "barbell", "biceps", true, "Bicep Curl (Barbell)", "EZ Bar Biceps Curl"),
  hammerCurl: L("Hammer Curl", "HAMMER", "dumbbell", "biceps", true, "Hammer Curl (Dumbbell)", "Hammer Curl (Cable)", "Cross Body Hammer Curl"),
  reverseCurl: L("Reverse Curl", "REV CURL", "barbell", "biceps", true, "Reverse Curl (Barbell)", "Reverse Curl (Dumbbell)", "Reverse Curl (Cable)"),
  inclineCurl: L("Incline Curl", "INC CURL", "dumbbell", "biceps", true, "Seated Incline Curl (Dumbbell)"),
  concentrationCurl: L("Concentration Curl", "CONC CURL", "dumbbell", "biceps", true, "Concentration Curl"),
  spiderCurl: L("Spider Curl", "SPIDER", "dumbbell", "biceps", true, "Spider Curl (Dumbbell)", "Spider Curl (Barbell)"),
  preacherCurl: L("Preacher Curl", "PREACHER", "machine", "biceps", true, "Preacher Curl (Machine)", "Preacher Curl (Barbell)", "Preacher Curl (Dumbbell)"),
  tricepPushdown: L("Triceps Pushdown", "PUSHDOWN", "machine", "triceps", true, "Triceps Pushdown", "Triceps Rope Pushdown", "Triceps Pressdown", "Reverse Grip Triceps Pushdown", "Single Arm Triceps Pushdown (Cable)"),
  overheadTricep: L("Overhead Triceps Extension", "OH TRI EXT", "machine", "triceps", true, "Overhead Triceps Extension (Cable)", "Triceps Extension (Dumbbell)", "Triceps Extension (Cable)", "Triceps Extension (Barbell)"),
  tricepKickback: L("Triceps Kickback", "KICKBACK", "dumbbell", "triceps", true, "Triceps Kickback (Dumbbell)", "Triceps Kickback (Cable)"),
  skullcrusher: L("Skullcrusher", "SKULLS", "barbell", "triceps", true, "Skullcrusher (Barbell)", "Skullcrusher (Dumbbell)"),
  jmPress: L("JM Press", "JM PRESS", "barbell", "triceps", true, "JM Press (Barbell)"),
  wristCurl: L("Wrist Curl", "WRIST CURL", "barbell", "forearms", true, "Seated Wrist Curl (Barbell)", "Seated Palms Up Wrist Curl", "Reverse Wrist Curl (Dumbbell)"),

  // ── calves / core / misc ──
  calfRaise: L("Calf Raise", "CALF", "machine", "calves", false, "Standing Calf Raise (Machine)", "Standing Calf Raise", "Standing Calf Raise (Barbell)", "Standing Calf Raise (Smith)", "Calf Press (Machine)", "Standing Calf Raise (Dumbbell)"),
  seatedCalfRaise: L("Seated Calf Raise", "SEAT CALF", "machine", "calves", false, "Seated Calf Raise"),
  hangingLegRaise: L("Hanging Leg Raise", "HLR", "bodyweight", "abs", false, "Hanging Leg Raise", "Hanging Knee Raise", "Toes to Bar"),
  abWheel: L("Ab Wheel", "AB WHEEL", "bodyweight", "abs", false, "Ab Wheel"),
  cableCrunch: L("Cable Crunch", "CABLE CR", "machine", "abs", false, "Cable Crunch", "Crunch (Machine)"),
  birdDog: L("Bird Dog", "BIRD DOG", "bodyweight", "abs", false, "Bird Dog"),
  sidePlank: L("Side Plank", "SIDE PLANK", "bodyweight", "abs", false, "Side Plank"),
  crunch: L("Crunch", "CRUNCH", "bodyweight", "abs", false, "Crunch", "Crunch (Weighted)", "Reverse Crunch", "Oblique Crunch", "Decline Crunch"),
  pallofPress: L("Pallof Press", "PALLOF", "machine", "abs", false, "Pallof Press"),
  plank: L("Plank", "PLANK", "bodyweight", "abs", false, "Plank"),
  sitUp: L("Sit Up", "SIT UP", "bodyweight", "abs", false, "Sit Up", "Sit Up (Weighted)", "Decline Crunch (Weighted)"),
  farmersWalk: L("Farmer's Walk", "FARMERS", "dumbbell", "full", false, "Farmers Walk"),
  powerClean: L("Power Clean", "PWR CLEAN", "barbell", "full", false, "Power Clean", "Hang Clean", "Clean"),
};

export const BIG_FOUR = ["squat", "bench", "deadlift", "ohp"] as const;

export function liftName(key: string): string {
  return LIFTS[key]?.name ?? key;
}

/**
 * Other apps' names for library lifts (Strong's catalog, mostly), used only to recognise logged
 * exercises. Hevy titles above always win; these never go to Hevy.
 */
export const ALIASES: Record<string, string[]> = {
  ohp: ["Strict Military Press (Barbell)", "Military Press (Barbell)", "Overhead Press (Barbell - Standing)"],
  frontSquat: ["Front Squat (Barbell)"],
  sumoDeadlift: ["Sumo Deadlift (Barbell)"],
  trapBarDeadlift: ["Trap Bar Deadlift", "Deadlift (Hex Bar)"],
  stiffLegDeadlift: ["Stiff Leg Deadlift (Barbell)", "Straight Leg Deadlift (Barbell)"],
  rackPull: ["Rack Pull (Barbell)"],
  pushPress: ["Push Press (Barbell)"],
  powerClean: ["Power Clean (Barbell)", "Hang Clean (Barbell)", "Clean (Barbell)"],
  cgBench: ["Close Grip Bench Press (Barbell)", "Close-Grip Bench Press (Barbell)"],
  legPress: ["Leg Press", "Leg Press (Plate Loaded)"],
  hackSquat: ["Hack Squat (Plate Loaded)"],
  bulgarianSplitSquat: ["Bulgarian Split Squat"],
  gobletSquat: ["Goblet Squat (Kettlebell)", "Goblet Squat (Dumbbell)"],
  legCurl: ["Leg Curl (Machine)", "Lying Leg Curl", "Seated Leg Curl"],
  legExtension: ["Leg Extension"],
  backExtension: ["Back Extension", "Back Extension (Machine)", "Hyperextension"],
  cableRow: ["Seated Cable Row", "Seated Row (Cable)", "Seated Row (Cable - Wide Grip)", "Seated Row (Cable - V Grip)", "Cable Row"],
  dbRow: ["Bent Over One Arm Row (Dumbbell)", "One Arm Dumbbell Row", "Single Arm Row (Dumbbell)"],
  invertedRow: ["Inverted Row (Bodyweight)"],
  latPulldown: ["Lat Pulldown - Wide Grip (Cable)", "Lat Pulldown - Underhand (Cable)", "Lat Pulldown (Single Arm)"],
  straightArmPulldown: ["Straight Arm Pulldown (Cable)", "Straight Arm Pulldown"],
  chestFly: ["Cable Crossover", "Pec Deck (Machine)", "Chest Fly (Cable)"],
  rearDeltFly: ["Reverse Fly (Dumbbell)", "Reverse Fly (Cable)", "Reverse Fly (Machine)"],
  facePull: ["Face Pull (Cable)"],
  barbellCurl: ["EZ Bar Curl", "Bicep Curl (EZ Bar)", "Curl (EZ Bar)"],
  concentrationCurl: ["Concentration Curl (Dumbbell)"],
  inclineCurl: ["Incline Curl (Dumbbell)"],
  tricepPushdown: ["Triceps Pushdown (Cable - Straight Bar)", "Triceps Pushdown (Cable - Rope)", "Triceps Pushdown (Cable)"],
  skullcrusher: ["Skullcrusher (EZ Bar)", "Lying Triceps Extension (Barbell)"],
  calfRaise: ["Standing Calf Raise (Bodyweight)", "Calf Press on Leg Press", "Calf Raise (Machine)"],
  seatedCalfRaise: ["Seated Calf Raise (Machine)", "Seated Calf Raise (Plate Loaded)"],
  hangingLegRaise: ["Hanging Knee Raise (Bodyweight)"],
  kbSwing: ["Kettlebell Swing (Kettlebell)"],
  farmersWalk: ["Farmer's Walk", "Farmers Walk (Dumbbell)"],
};

// Title → lifts that list it (Hevy titles first, then aliases), and per-map inverted indexes; cached.
const BY_TITLE = new Map<string, string[]>();
const addTitle = (title: string, key: string) => {
  const t = title.toLowerCase(), l = BY_TITLE.get(t) ?? [];
  if (!l.includes(key)) l.push(key);
  BY_TITLE.set(t, l);
};
for (const [key, def] of Object.entries(LIFTS)) for (const h of def.hevy) addTitle(h, key);
for (const [key, list] of Object.entries(ALIASES)) for (const h of list) addTitle(h, key);
const MAP_INDEX = new WeakMap<Record<string, string>, Map<string, string>>();

/** Template id Ironterm uses for a library lift logged without Hevy (local mode). */
export const localTemplateId = (lift: string) => `lift:${lift}`;

/** Find which lift (if any) a logged exercise counts as. */
export function matchLift(title: string, templateId: string, map: Record<string, string> = {}): string | null {
  let inv = MAP_INDEX.get(map);
  if (!inv) { inv = new Map(Object.entries(map).map(([lift, tid]) => [tid, lift])); MAP_INDEX.set(map, inv); }
  // explicit mapping wins over title guessing
  const mapped = inv.get(templateId);
  if (mapped) return mapped;
  if (templateId.startsWith("lift:") && LIFTS[templateId.slice(5)]) return templateId.slice(5);
  // first lift with this title that isn't mapped to a different template
  for (const k of BY_TITLE.get(title.trim().toLowerCase()) ?? []) if (!map[k]) return k;
  return null;
}
