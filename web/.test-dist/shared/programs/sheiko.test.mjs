import{createRequire as __cr}from'module';const require=__cr(import.meta.url);

// packages/test/index.ts
import { AssertionError } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as nodeTest from "node:test";
import { inspect, isDeepStrictEqual } from "node:util";
var stack = [];
function describe2(name, fn) {
  const path = [...stack, name];
  return nodeTest.describe(name, () => {
    const saved = stack.splice(0);
    stack.push(...path);
    try {
      fn();
    } finally {
      stack.splice(0);
      stack.push(...saved);
    }
  });
}
var TEST_TIMEOUT_MS = 6e4;
function testWith(runner) {
  return (name, fn, timeout = TEST_TIMEOUT_MS) => {
    const path = [...stack, name];
    runner(name, { timeout: typeof timeout === "number" ? timeout : timeout.timeout ?? TEST_TIMEOUT_MS }, fn ? async () => {
      current = { name: path.join(" > "), counts: /* @__PURE__ */ new Map() };
      await fn();
    } : void 0);
  };
}
function makeIt() {
  const it3 = testWith(nodeTest.it);
  it3.skip = testWith(nodeTest.it.skip);
  it3.only = testWith(nodeTest.it.only);
  it3.todo = (name) => {
    nodeTest.it.todo(name);
  };
  it3.each = (cases) => (name, fn) => {
    cases.forEach((c, i) => {
      const args = Array.isArray(c) ? c : [c];
      it3(formatEachName(name, args, i), () => fn(...args));
    });
  };
  return it3;
}
function formatEachName(name, args, index) {
  let i = 0;
  let out = name.replace(/%[sdifjo#%]/g, (m) => {
    if (m === "%%") return "%";
    if (m === "%#") return String(index);
    const v = args[i++];
    return m === "%j" || m === "%o" ? JSON.stringify(v) : typeof v === "string" ? v : inspect(v);
  });
  const first = args[0];
  if (first && typeof first === "object") {
    out = out.replace(/\$([\w.]+)/g, (m, key) => {
      const v = key.split(".").reduce((o, k) => o == null ? o : o[k], first);
      return v === void 0 ? m : typeof v === "string" ? v : inspect(v);
    });
  }
  return out;
}
var it2 = makeIt();
var MOCK = /* @__PURE__ */ Symbol("mock");
var isMock = (v) => typeof v === "function" && v[MOCK] === true;
var isAsymmetric = (v) => !!v && typeof v.asymmetricMatch === "function";
function equals(a, b, partial = false, seen = /* @__PURE__ */ new Map()) {
  if (isAsymmetric(b)) return b.asymmetricMatch(a);
  if (isAsymmetric(a)) return a.asymmetricMatch(b);
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (seen.get(a) === b) return true;
  seen.set(a, b);
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof RegExp || b instanceof RegExp) return String(a) === String(b);
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of b) if (!a.has(k) || !equals(a.get(k), v, partial, seen)) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    for (const v of b) if (!a.has(v) && ![...a].some((x) => equals(x, v, partial, seen))) return false;
    return true;
  }
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) return isDeepStrictEqual(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return b.every((v, i) => equals(a[i], v, partial, seen));
  }
  const ao = a, bo = b;
  const keys = (o) => Object.keys(o).filter((k) => o[k] !== void 0);
  if (partial) return Object.keys(bo).every((k) => bo[k] === void 0 ? ao[k] === void 0 : k in ao && equals(ao[k], bo[k], true, seen));
  const ka = keys(ao), kb = keys(bo);
  if (ka.length !== kb.length) return false;
  return kb.every((k) => Object.prototype.hasOwnProperty.call(ao, k) && equals(ao[k], bo[k], false, seen));
}
var current = { name: "", counts: /* @__PURE__ */ new Map() };
var snapCache = /* @__PURE__ */ new Map();
var dirtySnaps = /* @__PURE__ */ new Set();
function snapFile() {
  const root = process.env.IRONTERM_TEST_ROOT;
  const script = process.argv[1] ?? "";
  const dist = root ? join(root, ".test-dist") : "";
  if (!root || !script.startsWith(dist)) throw new Error("toMatchSnapshot: run tests through scripts/test.mjs");
  const src = join(root, relative(dist, script)).replace(/\.mjs$/, ".ts");
  return join(dirname(src), "__snapshots__", src.split("/").pop() + ".snap");
}
function loadSnaps(file) {
  let snaps = snapCache.get(file);
  if (!snaps) {
    snaps = {};
    if (existsSync(file)) new Function("exports", readFileSync(file, "utf8"))(snaps);
    snapCache.set(file, snaps);
  }
  return snaps;
}
var serialize = (v) => typeof v === "string" ? `"${v}"` : JSON.stringify(v, null, 2);
var escapeTemplate = (s) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
process.on("exit", () => {
  for (const file of dirtySnaps) {
    const snaps = snapCache.get(file);
    const body = Object.keys(snaps).sort().map((k) => `exports[\`${escapeTemplate(k)}\`] = \`${escapeTemplate(snaps[k])}\`;
`).join("\n");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

${body}`);
    console.log(`updated ${relative(process.cwd(), file)}`);
  }
});
function matchSnapshot(actual, hint) {
  const base = hint ? `${current.name} > ${hint}` : current.name;
  const n = (current.counts.get(base) ?? 0) + 1;
  current.counts.set(base, n);
  const key = `${base} ${n}`;
  const file = snapFile();
  const snaps = loadSnaps(file);
  const got = `
${serialize(actual)}
`;
  if (!(key in snaps) && process.env.CI && !process.env.UPDATE_SNAPSHOTS) return { pass: false, message: `missing snapshot "${key}" (run the tests locally and commit the .snap file)` };
  if (process.env.UPDATE_SNAPSHOTS || !(key in snaps)) {
    if (snaps[key] !== got) {
      snaps[key] = got;
      dirtySnaps.add(file);
    }
    return { pass: true, message: "" };
  }
  return { pass: snaps[key] === got, message: `snapshot "${key}" differs:
expected:${snaps[key]}
received:${got}(UPDATE_SNAPSHOTS=1 pnpm test to accept)` };
}
var show = (v) => isAsymmetric(v) ? v.toString() : inspect(v, { depth: 6, breakLength: 120 });
var matchers = {
  toBe: (a, b) => ({ pass: Object.is(a, b), message: `expected ${show(a)} to be ${show(b)}` }),
  toEqual: (a, b) => ({ pass: equals(a, b), message: `expected ${show(a)} to equal ${show(b)}` }),
  toStrictEqual: (a, b) => ({ pass: isDeepStrictEqual(a, b), message: `expected ${show(a)} to strictly equal ${show(b)}` }),
  toMatchObject: (a, b) => ({ pass: equals(a, b, true), message: `expected ${show(a)} to match object ${show(b)}` }),
  toBeCloseTo: (a, b, digits = 2) => ({
    pass: typeof a === "number" && (a === b || Math.abs(a - b) < 10 ** -digits / 2),
    message: `expected ${show(a)} to be close to ${b} (${digits} digits)`
  }),
  toBeGreaterThan: (a, b) => ({ pass: a > b, message: `expected ${show(a)} > ${b}` }),
  toBeGreaterThanOrEqual: (a, b) => ({ pass: a >= b, message: `expected ${show(a)} >= ${b}` }),
  toBeLessThan: (a, b) => ({ pass: a < b, message: `expected ${show(a)} < ${b}` }),
  toBeLessThanOrEqual: (a, b) => ({ pass: a <= b, message: `expected ${show(a)} <= ${b}` }),
  toHaveLength: (a, n) => ({ pass: a?.length === n, message: `expected length ${n}, got ${a?.length} (${show(a)})` }),
  toHaveProperty: (a, key, ...v) => {
    const path = key.split(".");
    let o = a;
    for (const k of path) {
      if (o == null || !(k in Object(o))) return { pass: false, message: `expected ${show(a)} to have property ${key}` };
      o = o[k];
    }
    return { pass: v.length === 0 || equals(o, v[0]), message: `expected ${show(a)} to have ${key} = ${show(v[0])}, got ${show(o)}` };
  },
  toBeNull: (a) => ({ pass: a === null, message: `expected ${show(a)} to be null` }),
  toBeUndefined: (a) => ({ pass: a === void 0, message: `expected ${show(a)} to be undefined` }),
  toBeDefined: (a) => ({ pass: a !== void 0, message: `expected a defined value` }),
  toBeTruthy: (a) => ({ pass: !!a, message: `expected ${show(a)} to be truthy` }),
  toBeFalsy: (a) => ({ pass: !a, message: `expected ${show(a)} to be falsy` }),
  toBeNaN: (a) => ({ pass: Number.isNaN(a), message: `expected ${show(a)} to be NaN` }),
  toBeInstanceOf: (a, cls) => ({ pass: a instanceof cls, message: `expected ${show(a)} to be an instance of ${cls?.name}` }),
  toBeTypeOf: (a, t) => ({ pass: typeof a === t, message: `expected typeof ${show(a)} to be ${t}` }),
  toMatch: (a, re) => ({
    pass: typeof a === "string" && (typeof re === "string" ? a.includes(re) : re.test(a)),
    message: `expected ${show(a)} to match ${String(re)}`
  }),
  toContain: (a, item) => ({
    pass: typeof a === "string" ? a.includes(item) : Array.isArray(a) || a instanceof Set ? [...a].includes(item) : false,
    message: `expected ${show(a)} to contain ${show(item)}`
  }),
  toContainEqual: (a, item) => ({ pass: Array.isArray(a) && a.some((x) => equals(x, item)), message: `expected ${show(a)} to contain an item equal to ${show(item)}` }),
  toThrow: (fnOrError, expected) => {
    let err, threw = false;
    if (typeof fnOrError === "function") {
      try {
        fnOrError();
      } catch (e) {
        threw = true;
        err = e;
      }
    } else {
      threw = true;
      err = fnOrError;
    }
    const msg = err instanceof Error ? err.message : String(err);
    let pass = threw;
    if (threw && expected !== void 0) {
      if (typeof expected === "string") pass = msg.includes(expected);
      else if (expected instanceof RegExp) pass = expected.test(msg);
      else if (typeof expected === "function") pass = err instanceof expected;
      else if (expected instanceof Error) pass = msg === expected.message;
    }
    return { pass, message: threw ? `expected the error (${msg}) to match ${show(expected)}` : `expected a throw${expected === void 0 ? "" : ` matching ${show(expected)}`}` };
  },
  toMatchSnapshot: (a, hint) => matchSnapshot(a, hint)
};
matchers.toThrowError = matchers.toThrow;
var calls = (a) => {
  if (!isMock(a)) throw new TypeError(`${show(a)} is not a vi.fn()`);
  return a.mock.calls;
};
matchers.toHaveBeenCalled = (a) => ({ pass: calls(a).length > 0, message: "expected the mock to have been called" });
matchers.toHaveBeenCalledTimes = (a, n) => ({ pass: calls(a).length === n, message: `expected ${n} calls, got ${calls(a).length}` });
matchers.toHaveBeenCalledWith = (a, ...args) => ({ pass: calls(a).some((c) => equals(c, args)), message: `expected a call with ${show(args)}; calls: ${show(calls(a))}` });
matchers.toHaveBeenLastCalledWith = (a, ...args) => ({ pass: equals(calls(a).at(-1), args), message: `expected the last call to be ${show(args)}; calls: ${show(calls(a))}` });
matchers.toHaveBeenNthCalledWith = (a, n, ...args) => ({ pass: equals(calls(a)[n - 1], args), message: `expected call ${n} to be ${show(args)}; calls: ${show(calls(a))}` });
function fail(r, negate, label) {
  if (r.pass === negate) {
    const message = (label ? `${label}: ` : "") + (negate ? `not: ${r.message}` : r.message);
    throw new AssertionError({ message });
  }
}
function build(actual, negate, label, async) {
  const out = {};
  for (const [name, m] of Object.entries(matchers)) {
    out[name] = async ? async (...args) => fail(m(await actual(), ...args), negate, label) : (...args) => fail(m(actual(), ...args), negate, label);
  }
  return out;
}
function expect(actual, label) {
  const e = build(() => actual, false, label, false);
  e.not = build(() => actual, true, label, false);
  const settle = (want) => async () => {
    try {
      const v = await actual;
      if (want === "reject") throw new AssertionError({ message: `${label ? label + ": " : ""}expected a rejection, got ${show(v)}` });
      return v;
    } catch (err) {
      if (err instanceof AssertionError && want === "reject") throw err;
      if (want === "resolve") throw err;
      return err;
    }
  };
  e.resolves = Object.assign(build(settle("resolve"), false, label, true), { not: build(settle("resolve"), true, label, true) });
  e.rejects = Object.assign(build(settle("reject"), false, label, true), { not: build(settle("reject"), true, label, true) });
  return e;
}
var asymmetric = (name, test) => ({ asymmetricMatch: test, toString: () => name });
expect.closeTo = (n, digits = 2) => asymmetric(`closeTo(${n}, ${digits})`, (v) => typeof v === "number" && Math.abs(v - n) < 10 ** -digits / 2);
expect.objectContaining = (o) => asymmetric(`objectContaining(${show(o)})`, (v) => equals(v, o, true));
expect.arrayContaining = (xs) => asymmetric(`arrayContaining(${show(xs)})`, (v) => Array.isArray(v) && xs.every((x) => v.some((y) => equals(y, x))));
expect.stringContaining = (s) => asymmetric(`stringContaining(${show(s)})`, (v) => typeof v === "string" && v.includes(s));
expect.stringMatching = (re) => asymmetric(`stringMatching(${String(re)})`, (v) => typeof v === "string" && (typeof re === "string" ? v.includes(re) : re.test(v)));
expect.any = (cls) => asymmetric(`any(${cls?.name})`, (v) => cls === String ? typeof v === "string" : cls === Number ? typeof v === "number" : cls === Boolean ? typeof v === "boolean" : cls === Function ? typeof v === "function" : v instanceof cls);
expect.anything = () => asymmetric("anything()", (v) => v != null);

// shared/lifts.ts
var L = (name, short, kind, muscle, upper, ...hevy) => ({ name, short, kind, muscle, upper, hevy });
var LIFTS = {
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
  plank: L("Plank", "PLANK", "bodyweight", "abs", false, "Plank"),
  sitUp: L("Sit Up", "SIT UP", "bodyweight", "abs", false, "Sit Up", "Sit Up (Weighted)", "Decline Crunch (Weighted)"),
  farmersWalk: L("Farmer's Walk", "FARMERS", "dumbbell", "full", false, "Farmers Walk"),
  powerClean: L("Power Clean", "PWR CLEAN", "barbell", "full", false, "Power Clean", "Hang Clean", "Clean")
};
var ALIASES = {
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
  farmersWalk: ["Farmer's Walk", "Farmers Walk (Dumbbell)"]
};
var BY_TITLE = /* @__PURE__ */ new Map();
var addTitle = (title, key) => {
  const t = title.toLowerCase(), l = BY_TITLE.get(t) ?? [];
  if (!l.includes(key)) l.push(key);
  BY_TITLE.set(t, l);
};
for (const [key, def] of Object.entries(LIFTS)) for (const h of def.hevy) addTitle(h, key);
for (const [key, list] of Object.entries(ALIASES)) for (const h of list) addTitle(h, key);
var MAP_INDEX = /* @__PURE__ */ new WeakMap();
function matchLift(title, templateId, map = {}) {
  let inv = MAP_INDEX.get(map);
  if (!inv) {
    inv = new Map(Object.entries(map).map(([lift, tid]) => [tid, lift]));
    MAP_INDEX.set(map, inv);
  }
  const mapped = inv.get(templateId);
  if (mapped) return mapped;
  if (templateId.startsWith("lift:") && LIFTS[templateId.slice(5)]) return templateId.slice(5);
  for (const k of BY_TITLE.get(title.trim().toLowerCase()) ?? []) if (!map[k]) return k;
  return null;
}

// shared/units.ts
var LB_PER_KG = 2.20462262185;
var fromKg = (kg, unit) => unit === "kg" ? kg : kg * LB_PER_KG;
var toKg = (w, unit) => unit === "kg" ? w : w / LB_PER_KG;
var roundTo = (w, step2) => Math.round(w / step2) * step2;
function loadStep(kind, unit, micro = false) {
  if (kind === "dumbbell") return unit === "lb" ? 5 : 2;
  if (kind === "machine") return unit === "lb" ? 2.5 : 2.5;
  return unit === "lb" ? micro ? 2.5 : 5 : micro ? 1.25 : 2.5;
}
function fmt(w, digits = 1) {
  const r = Math.round(w * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits).replace(/0+$/, "");
}

// shared/program.ts
var inc = (w, unit) => unit === "lb" ? w.lb : w.kg;
function slotIncrement(def, cfg2, slot2) {
  const o = cfg2.increments?.[slot2.id];
  if (o != null) return o;
  const p = slot2.progression;
  return p.kind === "stages" || p.kind === "double" ? inc(p.increment, cfg2.unit) : 0;
}
function step(def, cfg2, lift) {
  return loadStep(LIFTS[lift]?.kind ?? "barbell", cfg2.unit, def.microplates);
}
function schemeLabel(st) {
  return `${st.sets}\xD7${st.reps}${st.amrap ? "+" : ""}`;
}
var usesStartWeight = (s) => s.progression.kind !== "percent";
function weekIndex(def, rotations) {
  if (!def.cycle) return 0;
  return def.cycle.finite ? Math.min(rotations, def.cycle.weeks - 1) : rotations % def.cycle.weeks;
}
var isScheduled = (day, week) => !day.weeks || day.weeks.includes(week);
function allSlots(def) {
  const seen = /* @__PURE__ */ new Set();
  return def.days.flatMap((d) => d.slots).filter((s) => !seen.has(s.id) && !!seen.add(s.id));
}
function firstScheduled(def, from, rotations) {
  let i = from, r = rotations;
  for (let guard = 0; guard < def.days.length * ((def.cycle?.weeks ?? 1) + 2); guard++) {
    if (i >= def.days.length) {
      i = 0;
      r++;
    }
    if (isScheduled(def.days[i], weekIndex(def, r))) return { dayIndex: i, rotations: r };
    i++;
  }
  return { dayIndex: 0, rotations };
}
function initialState(def, cfg2) {
  const slots = {};
  for (const s of allSlots(def)) {
    if (!usesStartWeight(s)) continue;
    const w = cfg2.startWeights[s.id] ?? 0;
    slots[s.id] = { weight: w, stage: cfg2.startStages?.[s.id] ?? 0, stage0Weight: w, retest: false, fails: 0 };
  }
  const start = firstScheduled(def, 0, 0);
  return { dayIndex: start.dayIndex, rotations: start.rotations, slots, tms: { ...cfg2.trainingMaxes }, log: [] };
}
function defaultRest(t) {
  return t === "T1" || t === "MAIN" ? 180 : t === "T2" || t === "SUPP" ? 120 : 75;
}
function setsLabel(sets2) {
  if (!sets2.length) return "";
  const same = sets2.every((s) => s.reps === sets2[0].reps && s.repsMax === sets2[0].repsMax && s.weight === sets2[0].weight && s.rpe === sets2[0].rpe);
  const r = (s) => `${s.reps}${s.repsMax ? "\u2013" + s.repsMax : ""}`;
  const amraps = sets2.filter((s) => s.amrap);
  if (same) return `${sets2.length}\xD7${r(sets2[0])}${amraps.length ? "+" : ""}${sets2[0].rpe ? ` @${sets2[0].rpe}` : ""}`;
  return `${sets2.length} sets${amraps.length ? " \xB7 " + amraps.map((s) => `${s.reps}+`).join(" ") : ""}`;
}
function planDay(def, cfg2, state, dayIndex = state.dayIndex) {
  const day = def.days[dayIndex];
  const week = weekIndex(def, state.rotations);
  const exercises = day.slots.map((slot2) => {
    const rest = slot2.restSeconds ?? defaultRest(slot2.tier);
    const base = { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, restSeconds: rest };
    const p = slot2.progression;
    const s = state.slots[slot2.id];
    const i = slotIncrement(def, cfg2, slot2);
    if (p.kind === "stages") {
      const st = p.stages[s.stage];
      if (s.retest && p.onFinalFail.type === "retest") {
        const { rmReps, pct } = p.onFinalFail;
        return {
          ...base,
          scheme: `${rmReps}RM TEST`,
          sets: [{ weight: 0, reps: rmReps, amrap: false }],
          note: `Retest: work up to a hard set of ${rmReps}. New ${slot2.tier} weight = ${Math.round(pct * 100)}% of it.`
        };
      }
      const sets3 = Array.from({ length: st.sets }, (_, k) => ({ weight: s.weight, reps: st.reps, amrap: st.amrap && k === st.sets - 1 }));
      const last = s.stage === p.stages.length - 1;
      const fails = s.fails ?? 0;
      const allowed = p.failsBeforeAction ?? 1;
      let ifSuccess2, ifFail;
      if (p.climb) {
        const nx = p.stages[s.stage + 1];
        const up = roundTo(s.weight * (1 + p.climb.loadPct), step(def, cfg2, slot2.lift));
        ifSuccess2 = nx ? `all ${st.sets * st.reps} reps \u2192 ${schemeLabel(nx)} @ ${fmt(s.weight)}` : s.weight > 0 && p.climb.loadPct > 0 ? `all ${st.sets * st.reps} reps \u2192 ${schemeLabel(p.stages[0])} @ ${fmt(up)}` : `all reps \u2192 stay at ${schemeLabel(st)}`;
        ifFail = `miss \u2192 repeat ${schemeLabel(st)} @ ${fmt(s.weight)}`;
      } else if (p.advance.type === "amrapAtLeast") {
        ifSuccess2 = `${p.advance.reps}+ on last set \u2192 ${fmt(s.weight + i)}`;
        ifFail = `fewer \u2192 stay at ${fmt(s.weight)}`;
      } else {
        ifSuccess2 = `${st.sets * st.reps} reps \u2192 ${fmt(s.weight + i)}`;
        if (p.amrapBonus) ifSuccess2 += ` (${p.amrapBonus.reps}+ on last \u2192 ${fmt(s.weight + i * p.amrapBonus.increments)})`;
        if (fails + 1 < allowed) ifFail = `miss \u2192 retry ${fmt(s.weight)} (${fails + 1}/${allowed})`;
        else if (!last) ifFail = `miss \u2192 ${schemeLabel(p.stages[s.stage + 1])} @ ${fmt(s.weight)}`;
        else if (p.onFinalFail.type === "retest") ifFail = `miss \u2192 retest ${p.onFinalFail.rmReps}RM`;
        else if (p.onFinalFail.type === "reset") ifFail = `miss \u2192 reset ${schemeLabel(p.stages[0])} @ ${fmt(s.stage0Weight + p.onFinalFail.bumpIncrements * i)}`;
        else if (p.onFinalFail.type === "deload") ifFail = `miss \u2192 deload to ${fmt(roundTo(s.weight * (1 - p.onFinalFail.pct), step(def, cfg2, slot2.lift)))}`;
        else if (p.onFinalFail.type === "deloadBy") ifFail = `miss \u2192 drop to ${fmt(s.weight - inc(p.onFinalFail.amount, cfg2.unit))}`;
        else ifFail = `miss \u2192 stay`;
      }
      return { ...base, scheme: schemeLabel(st), sets: sets3, ifSuccess: ifSuccess2, ifFail, note: slot2.note };
    }
    if (p.kind === "double") {
      const [lo, hi] = p.reps;
      const sets3 = Array.from({ length: p.sets }, (_, k) => ({ weight: s.weight, reps: lo, repsMax: hi, amrap: !!p.amrapLast && k === p.sets - 1 }));
      return { ...base, scheme: `${p.sets}\xD7${lo}\u2013${hi}${p.amrapLast ? "+" : ""}`, sets: sets3, ifSuccess: `all sets ${hi}+ \u2192 ${fmt(s.weight + i)}`, ifFail: `fewer \u2192 add reps at ${fmt(s.weight)}`, note: slot2.note };
    }
    if (p.kind === "fixed") {
      const sets3 = Array.from({ length: p.sets }, (_, k) => ({ weight: s.weight, reps: p.reps, repsMax: p.repsMax, amrap: !!p.amrapLast && k === p.sets - 1 }));
      return { ...base, scheme: setsLabel(sets3), sets: sets3, note: [p.note, slot2.note].filter(Boolean).join(" \xB7 ") || void 0 };
    }
    const tm = state.tms[p.tmLift] ?? 0;
    const table = p.weeks[week % p.weeks.length] ?? [];
    const sets2 = table.map((ps) => ({
      weight: ps.pct != null && !ps.ofTop ? roundTo(tm * ps.pct + (ps.add ? inc(ps.add, cfg2.unit) : 0), step(def, cfg2, slot2.lift)) : 0,
      reps: ps.reps,
      repsMax: ps.repsMax,
      amrap: !!ps.amrap,
      pct: ps.pct,
      rpe: ps.rpe,
      ofTop: ps.ofTop
    }));
    let ifSuccess;
    const tmi = def.tmIncrement?.[p.tmLift] ? inc(def.tmIncrement[p.tmLift], cfg2.unit) : cfg2.unit === "lb" ? 5 : 2.5;
    if (p.tmRule?.type === "amrapTable") {
      ifSuccess = p.tmRule.table.filter((r) => r.increments > 0).map((r) => `${r.minReps}+ \u2192 TM +${fmt(r.increments * tmi)}`).join(" \xB7 ");
    } else if (p.tmRule?.type === "amrapVsTarget") {
      const t = table[p.tmRule.setIndex];
      if (t) ifSuccess = `target ${t.target ?? t.reps} reps on the ${t.reps}+ set; each rep over/under moves the TM`;
    } else if (p.tmRule?.type === "totalReps") {
      ifSuccess = p.tmRule.table.filter((r) => (r.increments ?? 0) > 0 || (r.pct ?? 0) > 0).map((r) => `${r.minReps}+ total \u2192 +${r.pct != null ? fmt(r.pct * 100) + "%" : fmt((r.increments ?? 0) * tmi)}`).join(" \xB7 ");
    } else if (p.tmRule?.type === "missCut") {
      ifSuccess = `miss a rep \u2192 ${def.maxLabel ?? "TM"} \u2212${fmt(p.tmRule.pct * 100)}%`;
    } else if (p.tmRule?.type === "e1rm") {
      ifSuccess = `new TM = ${Math.round(p.tmRule.pct * 100)}% of e1RM from set ${p.tmRule.setIndex + 1}`;
    }
    const usesPct = table.some((x) => x.pct != null && !x.ofTop);
    return {
      ...base,
      scheme: setsLabel(sets2),
      sets: sets2,
      ifSuccess,
      note: [usesPct ? p.tmLift !== slot2.lift ? `% of ${LIFTS[p.tmLift]?.short ?? p.tmLift} ${def.maxLabel ?? "TM"} ${fmt(tm)}` : `${def.maxLabel ?? "TM"} ${fmt(tm)}` : "", slot2.note].filter(Boolean).join(" \xB7 ") || void 0
    };
  });
  return { dayIndex, dayId: day.id, dayName: day.name, week, weekName: def.cycle?.weekNames?.[week], exercises: exercises.filter((e) => e.sets.length) };
}
function performedFor(w, lift, cfg2) {
  return w.exercises.filter((e) => matchLift(e.title, e.exercise_template_id, cfg2.liftMap) === lift).map(
    (e) => e.sets.filter((s) => s.type !== "warmup" && (s.reps ?? 0) > 0).map((s) => ({ weight: fromKg(s.weight_kg ?? 0, cfg2.unit), reps: s.reps ?? 0, ...s.rpe != null ? { rpe: s.rpe } : {} }))
  );
}
var e1rm = (w, r) => r <= 1 ? w : w * (1 + r / 30);
function modeWeight(sets2) {
  const n = /* @__PURE__ */ new Map();
  for (const x of sets2) {
    const r = Math.round(x.weight * 2) / 2;
    n.set(r, (n.get(r) ?? 0) + 1);
  }
  let best = 0, c = -1;
  for (const [wt, k] of n) if (k > c || k === c && wt > best) {
    best = wt;
    c = k;
  }
  return best;
}
function workingSets(sets2) {
  if (!sets2.length) return [];
  const loaded = sets2.filter((x) => x.weight > 0);
  const m = modeWeight(loaded.length ? loaded : sets2);
  return sets2.filter((x) => x.weight >= m * 0.95 - 0.5);
}
var medianReps = (xs) => xs.length ? [...xs].map((x) => x.reps).sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
function inferStage(stages, work, current2) {
  const repsNear = (st, xs) => {
    const tolerance = st.reps <= 3 ? 0 : 1;
    if (!st.amrap) return Math.abs(medianReps(xs) - st.reps) <= tolerance;
    const last = xs[xs.length - 1];
    const lastOk = !!last && last.reps >= Math.max(1, st.reps - 1 - tolerance);
    const body = xs.slice(0, -1);
    return body.length ? lastOk && Math.abs(medianReps(body) - st.reps) <= tolerance : lastOk;
  };
  const exact = (st) => {
    if (Math.abs(work.length - st.sets) <= (st.sets >= 6 ? 1 : 0)) return repsNear(st, work);
    return work.length > st.sets && repsNear(st, work.slice(-st.sets));
  };
  if (exact(stages[current2])) return { k: current2, how: "exact" };
  const e = stages.findIndex(exact);
  if (e >= 0) return { k: e, how: "exact" };
  const cur = stages[current2];
  if (work.length >= 2 && work.length < cur.sets && repsNear(cur, work)) return { k: current2, how: "attempt" };
  if (stages.length === 1 && work.length >= 2 && work.length <= cur.sets && medianReps(work) <= cur.reps && medianReps(work) >= cur.reps - 2) return { k: current2, how: "attempt" };
  const a = stages.findIndex((st) => work.length >= 2 && work.length < st.sets && repsNear(st, work));
  if (a >= 0) return { k: a, how: "attempt" };
  return { k: current2, how: "none" };
}
function slotFit(slot2, state, sets2) {
  if (!sets2.length) return 0;
  const p = slot2.progression;
  if (p.kind !== "stages") return 1;
  if (state.slots[slot2.id]?.retest) return 1.5;
  const work = workingSets(sets2);
  const how = inferStage(p.stages, work, state.slots[slot2.id]?.stage ?? 0).how;
  return how === "exact" ? 2 : how === "attempt" ? 1.25 : 0.75;
}
function evalStages(def, cfg2, slot2, s, sets2) {
  const p = slot2.progression;
  const i = slotIncrement(def, cfg2, slot2);
  if (s.retest && p.onFinalFail.type === "retest") {
    const { rmReps, pct } = p.onFinalFail;
    const atRm = sets2.filter((x) => x.reps >= rmReps).map((x) => x.weight);
    const rm = atRm.length ? Math.max(...atRm) : Math.max(0, ...sets2.map((x) => e1rm(x.weight, x.reps))) / (1 + rmReps / 30);
    const w2 = roundTo(rm * pct, step(def, cfg2, slot2.lift));
    return {
      next: { weight: w2, stage: 0, stage0Weight: w2, retest: false, fails: 0 },
      res: { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, reps: sets2.map((x) => x.reps), scheme: `${rmReps}RM TEST`, weight: rm, outcome: "retested", note: `${rmReps}RM ${fmt(rm)} \u2192 ${schemeLabel(p.stages[0])} @ ${fmt(w2)}` }
    };
  }
  const workAll = workingSets(sets2);
  const lifted = modeWeight(workAll);
  const tol = Math.max(1, s.weight * 0.02);
  const w = Math.abs(lifted - s.weight) <= tol ? s.weight : lifted;
  const { k, how } = inferStage(p.stages, workAll, s.stage);
  const st = p.stages[k];
  const work = workAll.length > st.sets && Math.abs(workAll.length - st.sets) > (st.sets >= 6 ? 1 : 0) ? workAll.slice(-st.sets) : workAll;
  const cur = { ...s, weight: w, stage: k, stage0Weight: k === 0 && s.stage !== 0 ? w : s.stage0Weight, fails: w !== s.weight || k !== s.stage ? 0 : s.fails ?? 0 };
  const amrapReps = work.length ? work[Math.min(work.length, st.sets) - 1].reps : void 0;
  const base = { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, scheme: schemeLabel(st), weight: w, reps: work.map((x) => x.reps) };
  const off = w !== s.weight ? ` (planned ${fmt(s.weight)})` : "";
  if (p.advance.type === "amrapAtLeast") {
    const ok = (amrapReps ?? 0) >= p.advance.reps;
    return ok ? { next: { ...cur, weight: w + i, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${amrapReps} on last set${off} \u2192 ${fmt(w + i)}` } } : { next: cur, res: { ...base, outcome: "hold", amrapReps, note: `${amrapReps ?? 0} on last set, need ${p.advance.reps}${off}` } };
  }
  if (p.climb && how !== "none") {
    const vol2 = work.slice(0, st.sets).reduce((a, x) => a + Math.min(x.reps, st.reps), 0);
    const need2 = st.sets * st.reps;
    if (vol2 < need2) return { next: { ...cur, fails: 0 }, res: { ...base, outcome: "hold", amrapReps, note: `${vol2}/${need2}${off} \u2192 repeat ${schemeLabel(st)}` } };
    if (k < p.stages.length - 1) {
      const nx = p.stages[k + 1];
      return { next: { ...cur, stage: k + 1, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${vol2}/${need2}${off} \u2192 ${schemeLabel(nx)} @ ${fmt(w)}` } };
    }
    if (w <= 0 || p.climb.loadPct <= 0) return { next: { ...cur, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${vol2}/${need2} \u2192 stay at ${schemeLabel(st)}` } };
    const nw = roundTo(w * (1 + p.climb.loadPct), step(def, cfg2, slot2.lift));
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${vol2}/${need2}${off} \u2192 ${schemeLabel(p.stages[0])} @ ${fmt(nw)}` } };
  }
  if (how === "none") {
    return { next: s, res: { ...base, outcome: "hold", amrapReps, note: `off-scheme (${work.length}\xD7${medianReps(work)}), not counted` } };
  }
  const vol = work.slice(0, st.sets).reduce((a, x) => a + Math.min(x.reps, st.reps), 0);
  const need = st.sets * st.reps;
  if (vol >= need) {
    const n = p.amrapBonus && st.amrap && (amrapReps ?? 0) >= p.amrapBonus.reps ? p.amrapBonus.increments : 1;
    return { next: { ...cur, weight: w + i * n, fails: 0 }, res: { ...base, outcome: "success", amrapReps, note: `${vol}/${need}${off} \u2192 ${fmt(w + i * n)}${n > 1 ? ` (${amrapReps} on AMRAP: \xD7${n})` : ""}` } };
  }
  const fails = (cur.fails ?? 0) + 1;
  const allowed = p.failsBeforeAction ?? 1;
  if (fails < allowed) {
    return { next: { ...cur, fails }, res: { ...base, outcome: "fail", amrapReps, note: `${vol}/${need}${off} \u2192 retry ${fmt(w)} (miss ${fails}/${allowed})` } };
  }
  if (k < p.stages.length - 1) {
    const nx = p.stages[k + 1];
    return { next: { ...cur, stage: k + 1, fails: 0 }, res: { ...base, outcome: "stage-down", amrapReps, note: `${vol}/${need}${off} \u2192 ${schemeLabel(nx)} @ ${fmt(w)}` } };
  }
  const f = p.onFinalFail;
  if (f.type === "retest") return { next: { ...cur, retest: true, fails: 0 }, res: { ...base, outcome: "retest-next", amrapReps, note: `${vol}/${need} \u2192 retest ${f.rmReps}RM` } };
  if (f.type === "reset") {
    const nw = cur.stage0Weight + f.bumpIncrements * i;
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "reset", amrapReps, note: `${vol}/${need} \u2192 reset ${schemeLabel(p.stages[0])} @ ${fmt(nw)}` } };
  }
  if (f.type === "deloadBy") {
    const nw = Math.max(0, w - inc(f.amount, cfg2.unit));
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "deload", amrapReps, note: `${vol}/${need} \u2192 drop to ${fmt(nw)}` } };
  }
  if (f.type === "deload") {
    const nw = roundTo(w * (1 - f.pct), step(def, cfg2, slot2.lift));
    return { next: { weight: nw, stage: 0, stage0Weight: nw, retest: false, fails: 0 }, res: { ...base, outcome: "deload", amrapReps, note: `${vol}/${need} \u2192 deload ${Math.round(f.pct * 100)}% to ${fmt(nw)}` } };
  }
  return { next: { ...cur, fails: 0 }, res: { ...base, outcome: "hold", amrapReps, note: `${vol}/${need}` } };
}
function evalDouble(def, cfg2, slot2, s, sets2) {
  const p = slot2.progression;
  const i = slotIncrement(def, cfg2, slot2);
  const work = workingSets(sets2);
  const w = modeWeight(work);
  const [lo, hi] = p.reps;
  const reps = work.slice(0, p.sets).map((x) => x.reps);
  const base = { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, scheme: `${p.sets}\xD7${lo}\u2013${hi}`, weight: w, reps };
  const top = reps.length >= p.sets && reps.every((r) => r >= hi);
  if (top) return { next: { ...s, weight: w + i }, res: { ...base, outcome: "success", note: `all sets ${hi}+ \u2192 ${fmt(w + i)}` } };
  return { next: { ...s, weight: w }, res: { ...base, outcome: "hold", note: `${reps.join("/")} at ${fmt(w)}, need ${hi} on all ${p.sets}` } };
}
function evalFixed(slot2, s, sets2) {
  const work = workingSets(sets2);
  const w = modeWeight(work);
  return {
    next: { ...s, weight: w },
    res: { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, scheme: "", weight: w, reps: work.map((x) => x.reps), outcome: "success", note: `${work.length} sets${w ? ` @ ${fmt(w)}` : ""}` }
  };
}
function evalPercent(def, cfg2, slot2, state, planned, sets2) {
  const p = slot2.progression;
  const base = { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, scheme: planned.scheme, weight: Math.max(0, ...planned.sets.map((x) => x.weight)), reps: sets2.map((x) => x.reps) };
  const tm = state.tms[p.tmLift] ?? 0;
  const tmi = def.tmIncrement?.[p.tmLift] ? inc(def.tmIncrement[p.tmLift], cfg2.unit) : cfg2.unit === "lb" ? 5 : 2.5;
  const rule = p.tmRule;
  if (rule?.type === "totalReps") {
    const top = Math.max(0, ...planned.sets.map((x) => x.weight));
    const tol = Math.max(1, top * 0.03);
    const total = sets2.filter((x) => x.weight >= top - tol).reduce((a2, x) => a2 + x.reps, 0);
    const rows = [...rule.table].sort((x, y) => x.minReps - y.minReps);
    let row = rows[0];
    for (const r of rows) if (total >= r.minReps) row = r;
    const d2 = row ? row.pct != null ? Math.round(tm * row.pct * 100) / 100 : (row.increments ?? 0) * tmi : 0;
    return { tmDelta: d2, res: { ...base, outcome: d2 > 0 ? "tm-up" : d2 < 0 ? "tm-down" : "hold", note: `${total} total reps \u2192 ${d2 ? `${def.maxLabel ?? "TM"} ${fmt(tm)} \u2192 ${fmt(tm + d2)}` : "holds"}` } };
  }
  if (rule?.type === "missCut") {
    const check = rule.setIndex != null ? [planned.sets[rule.setIndex]].filter(Boolean) : planned.sets.filter((x) => x.weight > 0 && !x.amrap);
    const short = check.filter((ps) => {
      const tol = Math.max(1, ps.weight * 0.03);
      return !sets2.some((x) => x.weight >= ps.weight - tol && x.reps >= ps.reps);
    });
    if (!short.length) return { tmDelta: 0, res: { ...base, outcome: "success", note: `${sets2.length}/${planned.sets.length} sets, all reps made` } };
    const d2 = -Math.round(tm * rule.pct * 100) / 100;
    return { tmDelta: d2, res: { ...base, outcome: "tm-down", note: `missed reps at ${short.map((x) => fmt(x.weight)).join(", ")} \u2192 ${def.maxLabel ?? "TM"} ${fmt(tm)} \u2192 ${fmt(tm + d2)}` } };
  }
  const target = rule && "setIndex" in rule && rule.setIndex != null ? planned.sets[rule.setIndex] : void 0;
  if (!rule || !target) {
    const amrapIdx = planned.sets.findIndex((x) => x.amrap);
    const a2 = amrapIdx >= 0 ? bestNear(sets2, planned.sets[amrapIdx].weight) : void 0;
    const ok = amrapIdx < 0 ? sets2.length >= Math.ceil(planned.sets.length * 0.8) : (a2 ?? 0) >= planned.sets[amrapIdx].reps;
    return { tmDelta: 0, res: { ...base, outcome: ok ? "success" : "hold", amrapReps: a2, note: amrapIdx >= 0 ? `${a2 ?? 0} reps on ${planned.sets[amrapIdx].reps}+ set` : `${sets2.length}/${planned.sets.length} sets` } };
  }
  const a = (rule.type === "amrapVsTarget" && rule.allSets ? worstNear(sets2, target.weight) : "useLast" in rule && rule.useLast ? lastNear(sets2, target.weight) : bestNear(sets2, target.weight)) ?? 0;
  if (rule.type === "e1rm") {
    const set = sets2.filter((x) => x.weight >= target.weight - Math.max(1, target.weight * 0.03)).sort((x, y) => e1rm(y.weight, y.reps) - e1rm(x.weight, x.reps))[0];
    if (!set) return { tmDelta: 0, res: { ...base, outcome: "hold", note: "top set not found" } };
    const ntm = roundTo(e1rm(set.weight, set.reps) * rule.pct, step(def, cfg2, p.tmLift));
    return { tmDelta: 0, tmSet: ntm, res: { ...base, outcome: ntm >= tm ? "tm-up" : "tm-down", amrapReps: set.reps, note: `${fmt(set.weight)}\xD7${set.reps} \u2192 TM ${fmt(tm)} \u2192 ${fmt(ntm)}` } };
  }
  let d = 0;
  let label = `${target.reps}+`;
  let also;
  if (rule.type === "amrapTable") {
    let n = 0;
    for (const r of rule.table) if (a >= r.minReps) n = r.increments;
    d = n * tmi;
    if (n && rule.alsoLifts) also = Object.fromEntries(rule.alsoLifts.map((l) => [l, n * (def.tmIncrement?.[l] ? inc(def.tmIncrement[l], cfg2.unit) : tmi)]));
  } else {
    const want = p.weeks[weekIndex(def, state.rotations) % p.weeks.length]?.[rule.setIndex]?.target ?? target.reps;
    label = `target ${want}`;
    let diff = a - want;
    const tol = Math.max(1, target.weight * 0.03);
    const atWeight = sets2.filter((x) => x.weight >= target.weight - tol);
    if (rule.rir) {
      const last = atWeight[atWeight.length - 1];
      const rirTarget = 10 - (target.rpe ?? 10);
      const effective = last ? last.reps - target.reps + (last.rpe != null ? 10 - last.rpe : rirTarget) : -1;
      diff = effective - rirTarget;
      if (diff < 0) diff = -1;
      label = `RIR target ${fmt(rirTarget)}`;
    }
    if (rule.penalizeMissingSets) {
      const plannedAt = planned.sets.filter((x) => Math.abs(x.weight - target.weight) <= tol);
      const floor = Math.min(...plannedAt.map((x) => x.reps));
      const done = atWeight.filter((x) => x.reps >= floor).length;
      const missing = Math.max(0, plannedAt.length - done);
      if (missing) diff = Math.min(diff, -1 - missing);
    }
    const rows = [...rule.table].sort((x, y) => x.diff - y.diff);
    let row = rows[0];
    for (const r of rows) if (diff >= r.diff) row = r;
    d = row ? row.pct != null ? Math.round(tm * row.pct * 100) / 100 : (row.increments ?? 0) * tmi : 0;
  }
  return {
    tmDelta: d,
    also,
    res: { ...base, outcome: d > 0 ? "tm-up" : d < 0 ? "tm-down" : "hold", amrapReps: a, note: d ? `${a} reps (${label}) \u2192 TM ${fmt(tm)} \u2192 ${fmt(tm + d)}` : `${a} reps (${label}) \u2192 TM holds` }
  };
}
function lastNear(sets2, weight) {
  const tol = Math.max(1, weight * 0.03);
  const r = sets2.filter((x) => x.weight >= weight - tol);
  return r.length ? r[r.length - 1].reps : void 0;
}
function worstNear(sets2, weight) {
  const tol = Math.max(1, weight * 0.03);
  const r = sets2.filter((x) => x.weight >= weight - tol).map((x) => x.reps);
  return r.length ? Math.min(...r) : void 0;
}
function bestNear(sets2, weight) {
  const tol = Math.max(1, weight * 0.03);
  const r = sets2.filter((x) => x.weight >= weight - tol).map((x) => x.reps);
  return r.length ? Math.max(...r) : void 0;
}
function applyWorkout(def, cfg2, state, w, dayIndex) {
  const plan = planDay(def, cfg2, state, dayIndex);
  const day = def.days[dayIndex];
  const slots = { ...state.slots };
  const tms = { ...state.tms };
  const pending = { ...state.pendingTm };
  const results = [];
  const used = /* @__PURE__ */ new Map();
  for (const slot2 of day.slots) {
    const planned = plan.exercises.find((e) => e.slotId === slot2.id);
    if (!planned) continue;
    const blocks = performedFor(w, slot2.lift, cfg2);
    const n = used.get(slot2.lift) ?? 0;
    used.set(slot2.lift, n + 1);
    const sets2 = blocks[n] ?? [];
    if (!sets2.length) {
      results.push({ slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, scheme: planned.scheme, weight: planned.sets[0]?.weight ?? 0, outcome: "missed", reps: [], note: "not logged" });
      continue;
    }
    const p = slot2.progression;
    if (p.kind === "percent") {
      const { tmDelta, tmSet, also, res } = evalPercent(def, cfg2, slot2, state, planned, sets2);
      const later = !!p.tmRule && "applyAt" in p.tmRule && p.tmRule.applyAt === "weekEnd";
      const deltas = { ...also };
      if (tmDelta) deltas[p.tmLift] = (deltas[p.tmLift] ?? 0) + tmDelta;
      if (tmSet != null) tms[p.tmLift] = tmSet;
      for (const [lift, d] of Object.entries(deltas)) {
        if (later) pending[lift] = (pending[lift] ?? 0) + d;
        else tms[lift] = (tms[lift] ?? 0) + d;
      }
      results.push(res);
      continue;
    }
    const r = p.kind === "stages" ? evalStages(def, cfg2, slot2, slots[slot2.id], sets2) : p.kind === "double" ? evalDouble(def, cfg2, slot2, slots[slot2.id], sets2) : evalFixed(slot2, slots[slot2.id], sets2);
    slots[slot2.id] = r.next;
    results.push({ ...r.res, scheme: r.res.scheme || planned.scheme });
  }
  const next = firstScheduled(def, dayIndex + 1, state.rotations);
  if (next.rotations > state.rotations) {
    for (const [lift, d] of Object.entries(pending)) tms[lift] = (tms[lift] ?? 0) + d;
    for (const k of Object.keys(pending)) delete pending[k];
  }
  if (def.cycle?.tmIncrease && (!def.cycle.finite || def.cycle.tmIncreaseEvery || def.cycle.tmIncreaseAt)) {
    const { weeks, tmIncreaseAt: at } = def.cycle;
    const every = def.cycle.tmIncreaseEvery ?? weeks;
    for (let r = state.rotations + 1; r <= next.rotations; r++) {
      if (def.cycle.finite && r >= weeks) break;
      if (at ? at.includes((r - 1) % weeks) : r % every === 0) {
        for (const [lift, w8] of Object.entries(def.cycle.tmIncrease)) if (tms[lift] != null) tms[lift] += inc(w8, cfg2.unit);
      }
    }
  }
  const entry = { workoutId: w.id, date: w.start_time, dayId: day.id, week: plan.week, results };
  const complete = !!def.cycle?.finite && next.rotations >= def.cycle.weeks;
  return { dayIndex: next.dayIndex, rotations: next.rotations, slots, tms, log: [...state.log, entry], complete, pendingTm: pending };
}
function matchDay(def, cfg2, state, w) {
  const tag = w.description?.match(/\[ht:([^\]]+)\]/)?.[1];
  if (tag) {
    const i = def.days.findIndex((d) => d.id === tag);
    if (i >= 0) return i;
  }
  if (w.routine_id && cfg2.routineDays?.[w.routine_id]) {
    const i = def.days.findIndex((d) => d.id === cfg2.routineDays[w.routine_id]);
    if (i >= 0) return i;
  }
  const order = w.exercises.map((e) => matchLift(e.title, e.exercise_template_id, cfg2.liftMap)).filter((x) => !!x);
  const lifts = new Set(order);
  const week = weekIndex(def, state.rotations);
  let best = -1, bestScore = 0;
  for (let k = 0; k < def.days.length; k++) {
    const i = (state.dayIndex + k) % def.days.length;
    const d = def.days[i];
    const anchor = d.slots.find((x) => (LIFTS[x.lift]?.hevy.length ?? 0) > 0 || cfg2.liftMap?.[x.lift]) ?? d.slots[0];
    if (!anchor || !lifts.has(anchor.lift)) continue;
    const used = /* @__PURE__ */ new Map();
    let score = 0;
    for (const slot2 of d.slots) {
      const n = used.get(slot2.lift) ?? 0;
      used.set(slot2.lift, n + 1);
      score += slotFit(slot2, state, performedFor(w, slot2.lift, cfg2)[n] ?? []) * (slot2 === anchor ? 1.5 : 1);
    }
    score += (order[0] === anchor.lift ? 0.5 : 0) + (k === 0 ? 0.25 : 0) + (isScheduled(d, week) ? 1.5 : 0);
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}
function applyAdjustments(state, adj) {
  const slots = { ...state.slots };
  const tms = { ...state.tms };
  for (const a of adj) {
    if (a.slotId && slots[a.slotId]) {
      const s = { ...slots[a.slotId] };
      if (a.weight != null) {
        s.weight = a.weight;
        if ((a.stage ?? s.stage) === 0) s.stage0Weight = a.weight;
      }
      if (a.stage != null) s.stage = a.stage;
      s.retest = false;
      s.fails = 0;
      slots[a.slotId] = s;
    }
    if (a.lift && a.tm != null) tms[a.lift] = a.tm;
  }
  return { ...state, slots, tms };
}
function rampLength(gapDays, minGapDays = 9) {
  if (gapDays < minGapDays) return 0;
  return gapDays < 14 ? 2 : gapDays < 28 ? 3 : gapDays < 56 ? 4 : gapDays < 112 ? 6 : 8;
}
var rampsSlower = (lift) => LIFTS[lift] ? !LIFTS[lift].upper : false;
function rampNeed(r, lift) {
  return Math.max(1, rampLength(r.gapDays, 0)) + (rampsSlower(lift) ? 1 : 0);
}
var rampLifts = (def) => [...new Set(def.days.flatMap((d) => d.slots).filter((x) => x.tier !== "ACC" && x.tier !== "T3").map((x) => x.lift))];
function startRamp(def, state, gapDays, minGapDays = 9) {
  const base = rampLength(gapDays, minGapDays);
  if (!base) return void 0;
  const r = { gapDays, total: base, done: 0, seen: {} };
  const lifts = rampLifts(def);
  const seen = {};
  let pos = { dayIndex: state.dayIndex, rotations: state.rotations };
  let n = 0;
  while (n < base * 2 && lifts.some((l) => (seen[l] ?? 0) < rampNeed(r, l))) {
    for (const l of new Set(def.days[pos.dayIndex].slots.map((x) => x.lift))) seen[l] = (seen[l] ?? 0) + 1;
    n++;
    pos = firstScheduled(def, pos.dayIndex + 1, pos.rotations);
  }
  return { ...r, total: Math.max(base, n) };
}
function beatRamp(def, cfg2, state, w, dayIndex) {
  const plan = planDay(def, cfg2, state, dayIndex);
  const used = /* @__PURE__ */ new Map();
  const out = [];
  for (const e of plan.exercises) {
    const n = used.get(e.lift) ?? 0;
    used.set(e.lift, n + 1);
    const top = Math.max(0, ...e.sets.map((x) => x.weight));
    if (!top) continue;
    const reps = Math.min(...e.sets.filter((x) => x.weight >= top).map((x) => x.reps));
    const tol = Math.max(1, top * 0.02);
    if ((performedFor(w, e.lift, cfg2)[n] ?? []).some((x) => x.weight >= top - tol && x.reps >= reps)) out.push(e.lift);
  }
  return out;
}
function advanceRamp(def, r, results, beaten) {
  const seen = { ...r.seen };
  for (const l of new Set(results.filter((x) => x.reps.length > 0).map((x) => x.lift))) seen[l] = (seen[l] ?? 0) + 1;
  for (const l of beaten) seen[l] = Math.max(seen[l] ?? 0, rampNeed(r, l));
  const next = { ...r, done: r.done + 1, seen };
  const allBack = rampLifts(def).every((l) => (seen[l] ?? 0) >= rampNeed(r, l));
  return next.done >= r.total || allBack ? void 0 : next;
}
var daysBetween = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 864e5);
function guardReentry(before2, after2) {
  const slots = { ...after2.slots };
  const tms = { ...after2.tms };
  const pending = { ...after2.pendingTm };
  const r = before2.reentry;
  const tag = `re-entry ${r.done + 1}/${r.total} after ${r.gapDays} days`;
  const entry = after2.log[after2.log.length - 1];
  const results = entry.results.map((res) => {
    const b = before2.slots[res.slotId], a = slots[res.slotId];
    let reverted = false;
    if (b && a && (a.weight < b.weight || a.stage > b.stage || (a.fails ?? 0) > (b.fails ?? 0) || a.retest && !b.retest)) {
      slots[res.slotId] = b;
      reverted = true;
    }
    if (tms[res.lift] != null && before2.tms[res.lift] != null && tms[res.lift] < before2.tms[res.lift]) {
      tms[res.lift] = before2.tms[res.lift];
      reverted = true;
    }
    if ((pending[res.lift] ?? 0) < (before2.pendingTm?.[res.lift] ?? 0)) {
      pending[res.lift] = before2.pendingTm?.[res.lift] ?? 0;
      reverted = true;
    }
    if (reverted || res.outcome === "missed") return { ...res, outcome: "hold", note: `${tag}: not counted (${res.note})` };
    return { ...res, note: `${tag} \xB7 ${res.note}` };
  });
  return { ...after2, slots, tms, pendingTm: pending, log: [...after2.log.slice(0, -1), { ...entry, results }] };
}
function replay(def, cfg2, workouts, opts = {}) {
  let state = initialState(def, cfg2);
  const adj = [...cfg2.adjustments ?? []].sort((a, b) => a.date.localeCompare(b.date));
  let ai = 0;
  const minGap = opts.reentry === false || def.builtInRamp ? Infinity : opts.reentry?.minGapDays ?? 9;
  let lastSession = null;
  const sorted = workouts.filter((w) => w.start_time >= cfg2.startDate).sort((a, b) => a.start_time.localeCompare(b.start_time));
  for (const w of sorted) {
    if (state.complete) break;
    const due = [];
    while (ai < adj.length && adj[ai].date <= w.start_time) due.push(adj[ai++]);
    if (due.length) state = applyAdjustments(state, due);
    const d = matchDay(def, cfg2, state, w);
    if (d < 0) continue;
    if (lastSession && Number.isFinite(minGap)) {
      const r = startRamp(def, state, daysBetween(lastSession, w.start_time), minGap);
      if (r) state = { ...state, reentry: r };
    }
    const before2 = state;
    let next = applyWorkout(def, cfg2, state, w, d);
    if (before2.reentry && before2.reentry.done < before2.reentry.total) {
      next = guardReentry(before2, next);
      const results = next.log[next.log.length - 1].results;
      next = { ...next, reentry: advanceRamp(def, before2.reentry, results, beatRamp(def, cfg2, before2, w, d)) };
    }
    state = next;
    lastSession = w.start_time;
  }
  if (ai < adj.length) state = applyAdjustments(state, adj.slice(ai));
  if (opts.today && lastSession && Number.isFinite(minGap)) {
    const r = startRamp(def, state, daysBetween(lastSession.slice(0, 10), opts.today), minGap);
    if (r) state = { ...state, reentry: r };
  }
  return state;
}

// shared/programs/sheiko.ts
var TM_OF = {
  frontSquat: "squat",
  pauseSquat: "squat",
  deficitDeadlift: "deadlift",
  rackPull: "deadlift",
  cgBench: "bench",
  declineBench: "bench"
};
var COMP = /* @__PURE__ */ new Set(["squat", "bench", "deadlift"]);
function parseSets(spec) {
  return spec.split(" ").flatMap((tok) => {
    const m = /^(\d+)@(\d+)(?:x(\d+))?$/.exec(tok);
    if (!m) throw new Error(`bad set spec ${tok}`);
    return Array.from({ length: Number(m[3] ?? 1) }, () => ({ pct: Number(m[2]) / 100, reps: Number(m[1]) }));
  });
}
function slot(id, [lift, spec, note], first) {
  if (!spec.includes("@")) {
    const [sets2, reps] = spec.split("x").map(Number);
    return { id, lift, tier: "ACC", note, progression: { kind: "fixed", sets: sets2, reps } };
  }
  const tier = COMP.has(lift) && first && !note ? "MAIN" : "SUPP";
  return { id, lift, tier, note, progression: { kind: "percent", tmLift: TM_OF[lift] ?? lift, weeks: [parseSets(spec)] } };
}
function layout(blocks) {
  const days = [];
  const weekNames = [];
  for (const b of blocks) {
    b.weeks.forEach((wk, w) => {
      const g = weekNames.length;
      weekNames.push(`${b.label} \xB7 Week ${w + 1}`);
      wk.forEach(([dayName, entries], d) => {
        const base = `${b.key}w${w + 1}d${d + 1}`;
        const seen = {};
        const slots = entries.map((e) => {
          const n = seen[e[0]] = (seen[e[0]] ?? 0) + 1;
          return slot(`${base}-${e[0]}${n > 1 ? n : ""}`, e, n === 1);
        });
        days.push({ id: base.toUpperCase(), name: `${b.label} W${w + 1} \xB7 ${dayName}`, weeks: [g], slots });
      });
    });
  }
  return { days, weekNames };
}
function program(templateId, name, blocks, sessionsPerWeek, notes) {
  const { days, weekNames } = layout(blocks);
  return {
    templateId,
    name,
    days,
    sessionsPerWeek,
    maxLabel: "1RM",
    notes,
    cycle: { weeks: weekNames.length, weekNames, finite: true }
  };
}
var NOTES = [
  "Enter your current competition 1RMs. Every set is a fixed percentage; don't grind or add AMRAPs.",
  "When a lift appears twice in a session, log it as two separate exercises in Hevy, in order.",
  "Halting/paused/chain deadlifts and board/chain presses: log as the plain lift. Block pulls: log as Rack Pull.",
  "Accessories have no prescribed load: pick a weight that's moderate for the sets\xD7reps."
];
var toUnit = (lb, unit) => Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5]));
var defaults = (unit) => ({ trainingMaxes: toUnit({ squat: 315, bench: 225, deadlift: 385 }, unit), startWeights: {} });
var B29 = [
  [
    // week 1
    ["Mon", [
      ["bench", "5@50 4@60x2 3@70x2 3@75x5"],
      ["squat", "5@50 5@60x2 5@70x5"],
      ["bench", "5@50 5@60 4@70x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60x2 3@70x2 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["inclineBench", "4x6"],
      ["dip", "5x5"],
      ["rackPull", "4@55 4@65 4@75x2 3@85x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "5@50 5@60 4@70 3@75x2 2@80x2 3@75x2 4@70 6@60 8@50"],
      ["chestFly", "5x10"],
      ["squat", "5@50 4@60x2 3@70x2 3@75x5"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 2@80x5"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["frontSquat", "3@45x2 3@55x2 2@60x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70x2 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["chestFly", "5x10"],
      ["rackPull", "4@55 4@65 4@75x2 4@80x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 2@80x5"],
      ["bench", "5@50 4@60 3@70x2 2@80x2 3@75 5@65 7@55"],
      ["chestFly", "5x10"],
      ["squat", "5@50 5@60x2 4@70x4"],
      ["goodMorning", "5x5"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "5@55 4@65 3@75x2 2@85x4"],
      ["bench", "5@50 4@60 3@70x2 3@80x6"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "3@50 3@60 3@70 3@80x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50x2 3@60x2 3@65x4"],
      ["bench", "5@50 4@60 3@70x2 2@80x3 2@85x2 3@80x2"],
      ["chestFly", "5x10"],
      ["rackPull", "4@60 4@70x2 3@80x2 2@90x3", "Block pull, bar at knee height"],
      ["lunge", "5x5"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "5@50 4@60 3@70x2 3@80x7"],
      ["chestFly", "5x10"],
      ["ohp", "5x4"],
      ["goodMorning", "5x5"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 3@80x5"],
      ["bench", "5@55 5@65 4@75x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["frontSquat", "5@40x2 4@50x2 3@60x3"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["deadlift", "3@50 3@60 3@70x2 3@80x2 2@85x3 2@80x3"],
      ["bench", "5@50 5@60 5@70x4"],
      ["chestFly", "5x10"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "6@50 5@60 4@70x2 3@80x2 2@85x2 3@80x2 4@70 6@60 8@50"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["goodMorning", "5x5", "Seated"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]]
  ]
];
var B30 = [
  [
    // week 1
    ["Mon", [
      ["bench", "5@50 4@60x2 3@70x2 3@80x5"],
      ["squat", "5@50 4@60 3@70x2 3@80x5"],
      ["bench", "5@50 5@60 5@70x5"],
      ["chestFly", "5x10"],
      ["squat", "5@55 4@65 3@75x5"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 2@80x2 3@75x2 4@70 6@65 8@60 10@55 12@50"],
      ["chestFly", "6x4"],
      ["rackPull", "5@60 4@70x2 3@80x3 2@90x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 4@60x2 3@70x2 2@80x6"],
      ["dip", "5x6"],
      ["squat", "5@50 5@60x2 4@70x4"],
      ["skullcrusher", "5x10", "French press"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 2@80x2 1@90x3"],
      ["bench", "5@50 4@60 3@70x2 2@80x6"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "5@50 4@60 3@70x2 2@80x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 3@70x2 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60 4@70x2 3@75x2 2@80x2 3@75x2 5@70x2 7@60 9@50"],
      ["chestFly", "5x10"],
      ["deadlift", "4@50 4@60 3@70x2 3@80x5"],
      ["lunge", "5x5"]
    ]],
    ["Fri", [
      ["bench", "5@50 4@60x2 3@70x2 2@80x5"],
      ["squat", "5@50 5@60x2 5@70x5"],
      ["bench", "4@55 3@65 2@75x5"],
      ["dip", "5x8"],
      ["legPress", "5x6"],
      ["goodMorning", "5x6", "Seated"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["squat", "6@50 6@60 6@65x4"],
      ["bench", "5@55 5@65x2 4@75x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 3@70x2 3@80x3 2@85x3"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 2@80x2 3@75x2 5@70 7@65 9@60 11@55 13@50"],
      ["chestFly", "5x10"],
      ["rackPull", "5@65 5@75x2 4@85x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70x2 3@80x6"],
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3 3@80x3"],
      ["bench", "5@50 5@60x2 5@70x5"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x2 1@90x2"],
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x2 3@80x2"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["squat", "5@50 4@60 3@70x2 2@80x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["deadlift", "4@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@55 5@65 4@75x4"],
      ["chestFly", "5x10"],
      ["lunge", "5x5"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "5@50 5@60 5@70x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["goodMorning", "5x5", "Seated"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]]
  ]
];
var B31 = [
  [
    // week 1
    ["Mon", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x4"],
      ["squat", "5@50 5@60x2 2@70 4@70 6@70 8@70 7@70 5@70 3@70"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["chestFly", "5x10"],
      ["squat", "5@50 5@60x2 4@65x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 4@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 2@80x2 3@75x2 4@70 6@65 8@60 10@55 12@50"],
      ["chestFly", "5x10"],
      ["rackPull", "5@60 4@70 3@80x2 2@90x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@50 4@60x2 3@70x2 2@80x6"],
      ["dip", "5x6"],
      ["squat", "5@55 5@65 4@75x4"],
      ["skullcrusher", "5x10", "French press"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["bench", "5@50 4@60 3@70x2 2@80x2 1@90x3"],
      ["squat", "5@50 4@60 3@70x2 2@80x5"],
      ["bench", "5@55 5@65 5@75x4"],
      ["chestFly", "5x10"],
      ["legPress", "5x6"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60x2 3@65x4"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 1@85x2 3@75 5@65 7@55"],
      ["chestFly", "5x10"],
      ["deadlift", "3@55 3@65x2 3@75x2 2@85x4"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "4x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 2@80x2 2@85x4"],
      ["inclineBench", "6x4"],
      ["squat", "6@50 6@60 6@65x4"],
      ["tricepPushdown", "5x10", "Triceps: any triceps exercise"],
      ["backExtension", "4x10"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["squat", "5@50 5@60 5@70 8@70 3@70 6@70 2@70 7@70 4@70"],
      ["bench", "5@55 5@65 5@70x5"],
      ["chestFly", "5x10"],
      ["lunge", "5x5"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 3@70x2 2@80x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "8@50 7@55 6@60 5@65 4@70 3@75x2 2@80x2 1@85x2 2@80x2 3@75 4@70 6@65 8@60 10@55 12@50"],
      ["rackPull", "4@60 4@70 3@80x2 2@90x3", "Block pull, bar at knee height"],
      ["legPress", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70x2 3@80x6"],
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3 3@80x3"],
      ["bench", "5@50 5@60x2 5@70x5"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 2@80x2 1@90x3 2@80x2"],
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x4"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["lunge", "5x5"],
      ["backExtension", "4x10"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 2@80x2 1@90x3 2@80x2"],
      ["deadlift", "3@50 3@60 3@70x2 2@80x2 1@90x2"],
      ["chestFly", "5x10"],
      ["legPress", "6x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x5"],
      ["bench", "5@55 5@65 4@75x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["squat", "5@50 5@60 5@70x4"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ]
];
var B32 = [
  [
    // week 1
    ["Mon", [
      ["squat", "3@50 3@60 3@70x2 2@75x3"],
      ["bench", "3@50 3@60 3@70x2 2@75x3"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["squat", "3@50 3@60x2 2@70x2 2@80 1@90 1@100x2", "Top: 2\u20133 singles at 100\u2013105%"],
      ["bench", "3@50 3@60 2@70x2 2@80 1@90 1@100x2", "Top: 2\u20133 singles at 100\u2013105%"],
      ["deadlift", "3@50 2@60 2@70x2 1@80 1@90 1@100x2", "Top: 2\u20133 singles at 100\u2013105%"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60x2 3@70x2 2@75x4"],
      ["bench", "3@55 3@65x2 3@75x6"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "3@50 3@60x2 3@70x2 2@80x4"],
      ["bench", "3@50 3@60 3@70x2 3@80x5"],
      ["chestFly", "4x8"],
      ["squat", "3@55 3@65x2 3@75x4"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 2@60x2 2@65x2 1@70x3", "Halting deadlift: pull to the knees, lower"],
      ["bench", "3@50 3@60 3@70x2 3@80x2 2@85x3"],
      ["chestFly", "5x10"],
      ["deadlift", "3@50 3@60 3@70x2 3@80x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "3@50 3@60 3@70x2 3@80x5"],
      ["squat", "3@50 3@60x2 3@70x2 3@80x6"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "3@50 3@60 3@70x2 2@80x5"],
      ["bench", "3@50 3@60 3@70x2 2@80x3 1@85x3"],
      ["chestFly", "4x8"],
      ["hangingLegRaise", "5x4", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70x2 2@80x5"],
      ["chestFly", "4x8"],
      ["deadlift", "3@50 3@60x2 3@70x2 2@75x5"],
      ["goodMorning", "4x5"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60x2 2@70x2 2@75x3"],
      ["bench", "3@50 3@60 3@70x2 2@75x4"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["bench", "3@50 3@60x2 2@70x2 1@75x4"],
      ["deadlift", "3@50 2@60x2 2@70x4"],
      ["hangingLegRaise", "2x8", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["squat", "3@50 3@60x2 2@70x3"],
      ["bench", "3@50 3@60x2 2@70x3"]
    ]]
  ]
];
var B37 = [
  [
    // week 1
    ["Mon", [
      ["bench", "5@50 4@60x2 3@70x2 3@75x5"],
      ["squat", "5@50 5@60x2 5@70x5"],
      ["chestFly", "5x10"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "5@50 5@60x2 4@70x2 3@75x4"],
      ["inclineBench", "6x4"],
      ["dip", "5x5"],
      ["rackPull", "5@50 5@60x2 4@70x2 3@80x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "7@50 6@55 5@60 4@65 3@70x2 2@75x2 3@70x2 4@65 6@60 8@55 10@50"],
      ["chestFly", "5x10"],
      ["squat", "5@50 4@60x2 3@70x2 3@75x5"],
      ["skullcrusher", "5x10", "French press"],
      ["goodMorning", "5x5", "Seated"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 2@80x5"],
      ["bench", "5@50 4@60 3@70x2 2@80x6"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "3@55 3@65 3@75x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60x2 4@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60x2 4@70x5"],
      ["chestFly", "5x10"],
      ["deadlift", "4@50 4@60 3@70x2 3@75x5"],
      ["lunge", "5x5"]
    ]],
    ["Fri", [
      ["squat", "4@50 4@60 3@70x2 3@75x6"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 4@75 5@70 6@60 7@50"],
      ["chestFly", "5x10"],
      ["tricepPushdown", "5x10", "Triceps: any triceps exercise"],
      ["squat", "3@55 3@65 2@75x4"],
      ["goodMorning", "5x6", "Seated"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "5@50 4@60x2 3@70x2 3@80x5"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["chestFly", "5x10"],
      ["pushUp", "5x10"],
      ["squat", "5@50 5@60 5@70x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 4@70x2 4@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "6@50 5@60 4@70x2 3@75x2 2@80x2 3@75x2 4@70 5@65 6@60 7@55 8@50"],
      ["chestFly", "5x10"],
      ["rackPull", "5@60 5@70x2 4@80x4", "Block pull, bar at knee height"],
      ["lunge", "5x5"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70x2 2@80x5"],
      ["squat", "5@50 5@60 5@70x2 4@75x5"],
      ["bench", "6@50 6@60x2 6@65x4"],
      ["chestFly", "5x10"],
      ["goodMorning", "5x5"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@50 4@60 3@70x2 3@80x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["squat", "5@50 4@60 3@70x2 2@80x4"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["deadlift", "4@50 4@60 3@70x2 3@80x2 2@85x3"],
      ["bench", "5@55 5@65 4@75x4"],
      ["chestFly", "5x10"],
      ["lunge", "5x5"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70x2 3@80x6"],
      ["bench", "5@50 5@60 5@70x5"],
      ["chestFly", "5x10"],
      ["dip", "5x8"],
      ["goodMorning", "5x5", "Seated"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]]
  ]
];
var BEG_PREP = [
  [
    // week 1
    ["Mon", [
      ["squat", "5@50 5@60 4@70x4"],
      ["bench", "5@50 4@60 3@70 3@75x4"],
      ["chestFly", "4x8", "Chest: any chest exercise \xB7 ~65% effort"],
      ["goodMorning", "5x4", "~75% effort"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["inclineBench", "5x3", "~85% effort"],
      ["cableRow", "5x8", "~65% effort"],
      ["rackPull", "3@55 3@65 3@75 2@85x3", "Block pull, bar at knee height"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise \xB7 ~75% effort"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 3@75x4"],
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["chestFly", "4x8", "Chest: any chest exercise \xB7 ~65% effort"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise \xB7 ~70% effort"],
      ["goodMorning", "5x5", "Seated \xB7 ~75% effort"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["latPulldown", "4x8", "Lats: any lat exercise \xB7 ~65% effort"],
      ["dip", "4x6", "~70% effort"],
      ["backExtension", "4x8", "~65% effort"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "6@50 6@60 6@65x4"],
      ["rackPull", "4@55 4@65 4@75x4", "Block pull, bar at knee height"],
      ["chestFly", "4x8", "Chest: any chest exercise \xB7 ~65% effort"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise \xB7 ~70% effort"]
    ]],
    ["Fri", [
      ["squat", "5@50 5@60 4@70x4"],
      ["cgBench", "3@50 3@60 3@70x4"],
      ["cableRow", "4x8", "~65% effort"],
      ["tricepPushdown", "4x8", "Triceps: any triceps exercise \xB7 ~65% effort"],
      ["backExtension", "4x8", "~65% effort"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "5@50 4@60 3@70 3@75x4"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["chestFly", "4x8", "Chest: any chest exercise \xB7 ~65% effort"],
      ["dbBench", "4x6", "~70% effort"],
      ["goodMorning", "5x5", "Seated \xB7 ~75% effort"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@65x4"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x3"],
      ["rackPull", "3@60 3@70 3@80x2 2@90x3", "Block pull, bar at knee height"],
      ["cableRow", "4x6", "~70% effort"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise \xB7 ~60% effort"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["declineBench", "4@50 4@60 4@70x4"],
      ["chestFly", "4x8", "Chest: any chest exercise \xB7 ~65% effort"],
      ["tricepPushdown", "4x8", "Triceps: any triceps exercise \xB7 ~65% effort"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x2 2@85x3"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["latPulldown", "4x8", "Lats: any lat exercise \xB7 ~65% effort"],
      ["bicepCurl", "4x6", "~70% effort"],
      ["backExtension", "4x8", "~65% effort"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70 3@80 2@85x4"],
      ["deadlift", "2@50 2@60 2@70x2 1@75x3", "Pause 5\u20137 cm below and above the knees"],
      ["chestFly", "4x8", "Chest: any chest exercise \xB7 ~65% effort"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise \xB7 ~70% effort"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise \xB7 ~60% effort"]
    ]],
    ["Fri", [
      ["squat", "5@55 4@65 3@75x4"],
      ["bench", "4@50 4@60 4@70x4"],
      ["tricepPushdown", "4x8", "Triceps: any triceps exercise \xB7 ~65% effort"],
      ["goodMorning", "4x5", "~75% effort"]
    ]]
  ]
];
var BEG_COMP = [
  [
    // week 1
    ["Mon", [
      ["squat", "3@50 3@60 3@70x2 2@75x3"],
      ["bench", "3@50 3@60 3@70x2 2@75x3"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise \xB7 ~65% effort"]
    ]],
    ["Wed", [
      ["squat", "3@50 3@60 3@70 2@80 1@90 1@95 1@100 1@105"],
      ["bench", "3@50 3@60 3@70 2@80 1@90 1@95 1@100 1@105"],
      ["deadlift", "3@50 3@60 3@70 2@80 1@90 1@95 1@100 1@105"],
      ["backExtension", "3x8", "~65% effort"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@75x4"],
      ["bench", "3@55 3@65 3@75x5"],
      ["chestFly", "4x6", "Chest: any chest exercise \xB7 ~70% effort"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise \xB7 ~70% effort"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise \xB7 ~65% effort"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 3@80x5"],
      ["chestFly", "4x6", "Chest: any chest exercise \xB7 ~70% effort"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise \xB7 ~70% effort"],
      ["goodMorning", "4x5", "Seated \xB7 ~75% effort"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@65 1@70x3"],
      ["bench", "3@50 3@60 3@70 3@80 2@85x2 1@90x2"],
      ["rackPull", "3@65 3@75 2@85x2 1@95x3", "Block pull, bar at knee height"],
      ["latPulldown", "4x6", "Lats: any lat exercise \xB7 ~70% effort"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise \xB7 ~65% effort"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 3@80x4"],
      ["bench", "3@50 3@60 3@70 3@80x5"],
      ["chestFly", "4x6", "Chest: any chest exercise \xB7 ~70% effort"],
      ["bicepCurl", "4x6", "~65% effort"],
      ["goodMorning", "5x4", "~80% effort"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80 1@85x3"],
      ["cableRow", "4x6", "~70% effort"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise \xB7 ~65% effort"]
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70 2@80x4"],
      ["deadlift", "3@50 3@60 3@70 2@75x5"],
      ["chestFly", "3x6", "Chest: any chest exercise \xB7 ~70% effort"],
      ["backExtension", "3x6", "~70% effort"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@75x3"],
      ["bench", "3@50 3@60 3@70 2@75x4"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise \xB7 ~65% effort"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["bench", "3@50 3@60 2@70 1@75x3"],
      ["deadlift", "3@50 3@60 2@70x3"],
      ["hangingLegRaise", "2x8", "Abs: any ab exercise \xB7 ~65% effort"]
    ]],
    ["Wed", [
      ["squat", "3@50 3@60 2@65x3"],
      ["bench", "3@50 3@60 2@70x3"]
    ]]
  ]
];
var AML1 = [
  [
    // week 1
    ["Mon", [
      ["frontSquat", "4@30 4@40 4@50x3"],
      ["bench", "5@50 4@60 3@70 2@75x4"],
      ["squat", "3@55 3@65 2@75x4"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["bench", "5@50 5@60 3@70 5@70 7@70 4@70 6@70 8@70"],
      ["deadlift", "3@55 3@65 2@75x4", "Pause 5\u20137 cm above the knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70 3@75x4"],
      ["pauseSquat", "3@50 3@60 3@70x4", "Pause halfway down"],
      ["bench", "3@60 3@70 3@80x2 2@85x3", "Board press"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Sat", [
      ["deficitDeadlift", "3@50 2@60x4"],
      ["inclineBench", "5x3"],
      ["rackPull", "3@55 3@65 3@75x2 2@85x3", "Block pull, bar 5\u20137 cm below knees"],
      ["dip", "5x4", "Weighted"],
      ["legPress", "5x5", "80\u201390% of your squat 1RM"],
      ["reverseHyper", "4x8"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70 3@75 2@80x5"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["skullcrusher", "5x6", "French press"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70x5", "With chains: +8\u201310 kg per side on top of this weight"],
      ["deadlift", "3@50 3@60 3@70 2@75x5", "Pause 5\u20137 cm below the knees"],
      ["lateralRaise", "5x6", "Delts: any shoulder exercise"],
      ["legExtension", "5x6", "1 s pause at the top of every rep"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["frontSquat", "4@30 4@40 4@50x4"],
      ["bench", "3@60 3@70 3@80 2@85x2 1@90x3", "Board press"],
      ["dip", "5x6", "Weighted"],
      ["latPulldown", "4x8", "Lats: any lat exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Sat", [
      ["cgBench", "4@50 3@60 3@65x4"],
      ["deadlift", "3@50 3@60 2@70x2 1@75x3", "With chains: +8\u201310 kg per side on top of this weight"],
      ["dbBench", "5x6"],
      ["legPress", "5x4"],
      ["reverseHyper", "4x8"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["frontSquat", "4@40 4@50 3@55x3"],
      ["bench", "5@50 4@60 3@70 2@80x2 1@85x2 2@80x2"],
      ["pauseSquat", "3@50 3@60 3@70 2@75x4", "Pause halfway down"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["goodMorning", "4x5"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["bench", "5@50 5@60 3@70 7@70 4@70 8@70 2@70 6@70"],
      ["rackPull", "4@60 4@70 4@80x4", "Block pull, bar 5\u20137 cm below knees"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "3@55 3@65 3@75 2@85x2 1@90x3", "Board press"],
      ["squat", "5@50 4@60 3@70 2@80x5"],
      ["bench", "4@50 4@60 4@65x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["latPulldown", "4x8", "Lats: any lat exercise"],
      ["goodMorning", "4x4", "Seated"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5\u20137 cm above the knees"],
      ["bench", "4@50 4@60 4@65x4", "Medium grip"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["reverseHyper", "4x8"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["frontSquat", "3@40 3@45 3@50x2 3@55x3"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x3 3@80x2"],
      ["squat", "3@50 3@60 3@70 3@80x4"],
      ["dip", "5x6"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["bench", "3@60 3@70 3@80 3@85 2@90x2 1@95x2", "Board press"],
      ["rackPull", "3@60 3@70 3@80x2 2@90x2 1@95x2", "Block pull, bar 5\u20137 cm below knees"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["skullcrusher", "5x6", "French press"]
    ]],
    ["Fri", [
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x2 1@80x3", "Pause 5\u20137 cm below the knees"],
      ["bench", "6@50 6@60 6@65x4"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["legPress", "5x5"],
      ["reverseHyper", "4x8"]
    ]]
  ]
];
var AML2 = [
  [
    // week 1
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 5@60 3@70 7@70 4@70 8@70 2@70 5@70"],
      ["bench", "3@60 3@70 3@80x2 2@85x3", "Board press"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["bench", "3@50 3@60 3@70 2@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["rackPull", "3@60 3@70 3@80x2 3@85x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["dip", "5x5"],
      ["goodMorning", "5x5"]
    ]],
    ["Fri", [
      ["bench", "5@55 4@65 3@75 2@85x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Sat", [
      ["rackPull", "3@60 3@70 3@80x2 3@85x4", "Block pull, bar 5 cm below knees"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["chestFly", "5x8", "Chest: any chest exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 2@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@55 4@65 4@75x2 3@85x2 2@90x3", "Board press"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["hangingLegRaise", "4x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@55 4@65 3@75 2@85x4"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["squat", "3@50 3@60 3@70 2@80x3"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5\u20137 cm below and above the knees"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["dip", "5x5"],
      ["latPulldown", "5x6", "Lats: any lat exercise"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["bench", "5@55 4@65 3@75 2@85x4"],
      ["squat", "5@50 5@60 3@70 7@70 4@70 8@70 2@70 6@70"],
      ["bench", "3@50 3@60 3@70 2@80x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["bench", "6@50 5@60 4@70 3@75 2@80x2"],
      ["rackPull", "4@60 4@70 4@80x4", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "4@50 4@60 4@70x5", "With chains: +8\u201310 kg per side on top of this weight"],
      ["squat", "4@50 4@60 4@70x4"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "1 full + 1/2 rep (to knees) \xD72 per set"],
      ["cgBench", "3@50 3@60 3@70x4"],
      ["lateralRaise", "5x6", "Delts: any shoulder exercise"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["reverseHyper", "4x8"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x5"],
      ["bench", "5@50 4@60 3@70 3@80x5"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["dip", "5x5"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@80x4", "Pause 5\u20137 cm above the knees"],
      ["bench", "3@55 3@65 3@75 3@85x2 2@90x2 1@95x3", "Board press"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Halting deadlift: pull to the knees, lower"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["bench", "5@55 4@65 3@75 2@85x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80x3"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Sat", [
      ["deficitDeadlift", "3@50 3@60 2@70x4"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["rackPull", "3@60 3@70 3@80 2@85x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["legPress", "5x5"]
    ]]
  ],
  [
    // week 5
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 5@60 3@70 5@70 7@70 4@70 6@70 8@70"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 4@70x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["rackPull", "3@55 3@65 3@75 3@85x4", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 3@75x4"],
      ["bench", "6@50 5@60 4@70 3@75 2@80x2 1@85x2 2@80 3@75 4@70 5@65 6@60 7@55 8@50"],
      ["squat", "4@50 4@60 4@70x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5 cm above the knees"],
      ["dbBench", "5x6"],
      ["rackPull", "4@50 4@60 4@70 4@75x4", "Block pull with chains, bar 10\u201312 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]]
  ],
  [
    // week 6
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80x5"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "4@50 4@60 3@65x2"],
      ["bench", "5@50 5@60 3@70 6@70 4@70 7@70 2@70 8@70 5@70"],
      ["deadlift", "3@50 3@60 3@70 2@80x5"],
      ["lateralRaise", "5x6", "Delts: any shoulder exercise"],
      ["latPulldown", "4x8", "Lats: any lat exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "5@50 4@60 3@70 3@75x5"],
      ["squat", "5@50 5@60 5@70x4"],
      ["chestFly", "5x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "4@50 4@60 4@70x4"],
      ["deadlift", "3@50 3@60 3@70 3@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["dip", "5x4"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]]
  ]
];
var AML3 = [
  [
    // week 1
    ["Mon", [
      ["squat", "5@55 4@65 3@75 2@85x3"],
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70 2@80x2 1@85x2 2@80x2"],
      ["rackPull", "3@65 3@75 3@85x2 2@90x3", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@75x4"],
      ["bench", "5@50 4@60 3@70 2@75x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["dip", "5x5"],
      ["goodMorning", "5x5"]
    ]],
    ["Sat", [
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5 cm above the knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "5@50 4@60 3@70 2@80 1@90 1@95 1@100x2", "Top: 2\u20133 singles at 100\u2013105%"],
      ["bench", "5@50 4@60 3@70 2@75x3"],
      ["chestFly", "3x5", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Wed", [
      ["bench", "5@50 4@60 3@70 2@80 1@90 1@95 1@100x2", "Top: 2\u20133 singles at 100\u2013105%"],
      ["deadlift", "5@50 4@60 3@70 2@80 1@90 1@95 1@100x2", "Top: 2\u20133 singles at 100\u2013105%"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["latPulldown", "4x6", "Lats: any lat exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "5@50 4@60 3@70 3@75x5"],
      ["squat", "5@50 5@60 5@70x4"],
      ["chestFly", "5x8", "Chest: any chest exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "Halting deadlift: pull to the knees, lower"],
      ["bench", "5@50 5@60 5@70x4"],
      ["rackPull", "4@60 4@70 4@80x4", "Block pull, bar 5 cm below knees"],
      ["dip", "5x4"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 4@60 3@70 3@80x5"],
      ["bench", "4@60 4@70 4@80x4", "Board press"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deadlift", "4@50 4@60 4@70x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x2 3@80 5@70 7@60 9@50"],
      ["deadlift", "4@50 4@60 4@70 3@75x4", "Alternate full and half (to knees) reps"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x10", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "5@50 5@60 3@65 7@65 4@65 8@65 2@65 6@65"],
      ["bench", "5@50 4@60 3@70 2@80x5"],
      ["dip", "5x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 2@75x4", "Pause 5\u20137 cm above the knees"],
      ["bench", "4@50 4@60 4@70x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["goodMorning", "5x5"],
      ["legPress", "5x6"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["bench", "3@55 3@65 3@75 3@85x2 2@90x3", "Board press"],
      ["squat", "5@50 4@60 3@70 3@80x2 2@85x2 3@80x2"],
      ["declineBench", "4@50 4@60 4@70x5"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["hangingLegRaise", "3x10", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@80x4", "Pause 5\u20137 cm below the knees"],
      ["bench", "5@50 4@60 3@70 3@80x2 2@85x3 3@80x2"],
      ["rackPull", "3@65 3@75 3@85x2 2@95x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Fri", [
      ["bench", "3@50 3@60 3@70 3@75x4", "With chains: +8\u201310 kg per side on top of this weight"],
      ["squat", "5@50 5@60 3@70 5@70 7@70 4@70 6@70 8@70"],
      ["bench", "4@50 4@60 4@70 4@75x4", "Board press"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["dip", "5x5"]
    ]],
    ["Sat", [
      ["deadlift", "4@50 4@60 3@70 2@80x4", "Alternate full and half (to knees) reps"],
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["latPulldown", "5x6", "Lats: any lat exercise"],
      ["backExtension", "4x8"]
    ]]
  ],
  [
    // week 5
    ["Mon", [
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "4@50 4@60 4@70x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "5x5"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 3@65 2@70x4"],
      ["bench", "5@50 4@60 3@70 2@75x4"],
      ["rackPull", "3@70 3@80 2@90x2 1@95x3", "Block pull, bar 5 cm below knees"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"],
      ["goodMorning", "4x5"]
    ]],
    ["Fri", [
      ["squat", "5@50 4@60 3@70 2@80x4"],
      ["bench", "6@50 6@60 6@70x5"],
      ["squat", "3@55 3@65 3@75x4"],
      ["chestFly", "5x6", "Chest: any chest exercise"],
      ["latPulldown", "5x6", "Lats: any lat exercise"]
    ]],
    ["Sat", [
      ["deadlift", "3@50 3@60 3@70 3@75x4", "Halting deadlift: pull to the knees, 2 s pause, lower"],
      ["cgBench", "4@50 4@60 4@70x4"],
      ["rackPull", "3@55 3@65 3@75 3@85x4", "Block pull, bar 5 cm below knees"],
      ["dip", "5x5"],
      ["tricepPushdown", "5x6", "Triceps: any triceps exercise"]
    ]]
  ]
];
var AML4 = [
  [
    // week 1
    ["Mon", [
      ["bench", "5@55 4@65 3@75 2@85x3"],
      ["squat", "5@50 4@60 3@70 3@80x4"],
      ["bench", "5@50 4@60 3@70 2@80x4"],
      ["chestFly", "4x8", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Wed", [
      ["deficitDeadlift", "3@50 3@60 2@70x2"],
      ["bench", "5@50 4@60 3@70 3@80x4"],
      ["rackPull", "3@60 3@70 2@80x2 1@90x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "4x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@80x2 1@85x3"],
      ["bench", "3@50 3@60 3@70 2@80x2 2@85x3 2@80x2"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise"],
      ["goodMorning", "4x5"]
    ]],
    ["Sat", [
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["rackPull", "3@55 3@65 3@75 2@85x3", "Block pull, bar 5 cm below knees"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["reverseHyper", "4x8"]
    ]]
  ],
  [
    // week 2
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@75x3"],
      ["bench", "3@50 3@60 3@70 2@75x3"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["backExtension", "3x8"]
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70 2@80 1@90 1@95 1@100", "Top: 1\u20132 singles at 100%"],
      ["deadlift", "3@50 3@60 2@70 2@80 1@90 1@95 1@100", "Top: 1\u20132 singles at 100%"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@80 1@90 1@95 1@100", "Top: 1\u20132 singles at 100%"],
      ["bench", "3@50 3@60 3@70 2@75x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "4x4"]
    ]],
    ["Sat", [
      ["dbBench", "5x5"],
      ["deadlift", "3@50 3@60 3@70 2@75x3", "Halting deadlift: pull to the knees, lower"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["dip", "4x4"]
    ]]
  ],
  [
    // week 3
    ["Mon", [
      ["squat", "3@55 3@65 2@75x2 1@85x4"],
      ["bench", "3@50 3@60 3@70 3@80x4"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["backExtension", "4x8"]
    ]],
    ["Wed", [
      ["deadlift", "3@50 3@60 3@70 2@75x3", "Halting deadlift: pull to the knees, lower"],
      ["bench", "3@50 3@60 3@70 2@80x2 1@85x3"],
      ["deadlift", "3@50 3@60 3@70 2@80x4"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80x5"],
      ["lateralRaise", "4x6", "Delts: any shoulder exercise"],
      ["tricepPushdown", "4x6", "Triceps: any triceps exercise"],
      ["goodMorning", "4x4"]
    ]],
    ["Sat", [
      ["inclineBench", "5x3", "Incline shoulder press"],
      ["rackPull", "3@55 3@65 3@75 2@85x3", "Block pull, bar 5 cm below knees"],
      ["latPulldown", "4x6", "Lats: any lat exercise"],
      ["reverseHyper", "4x8"]
    ]]
  ],
  [
    // week 4
    ["Mon", [
      ["squat", "3@50 3@60 3@70 2@80x4"],
      ["bench", "3@50 3@60 3@70 2@80x2 1@85x3"],
      ["chestFly", "4x6", "Chest: any chest exercise"],
      ["goodMorning", "4x4"]
    ]],
    ["Wed", [
      ["bench", "3@50 3@60 3@70 2@80x2"],
      ["deadlift", "2@50 2@60 2@70x3"],
      ["latPulldown", "3x6", "Lats: any lat exercise"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"]
    ]],
    ["Fri", [
      ["squat", "3@50 3@60 2@70x2 1@75x3"],
      ["bench", "3@50 3@60 3@70 2@75x3"],
      ["backExtension", "3x6"]
    ]]
  ],
  [
    // week 5
    ["Mon", [
      ["bench", "3@50 3@60 2@70x2 1@75x3"],
      ["deadlift", "3@50 3@60 2@70x3"],
      ["hangingLegRaise", "3x8", "Abs: any ab exercise"]
    ]],
    ["Wed", [
      ["squat", "3@50 2@60 1@70x3"],
      ["bench", "3@50 3@60 2@70x3"]
    ]]
  ]
];
var BLOCKS_29_32 = {
  "29": { key: "s29", label: "#29", weeks: B29 },
  "30": { key: "s30", label: "#30", weeks: B30 },
  "31": { key: "s31", label: "#31", weeks: B31 },
  "32": { key: "s32", label: "#32", weeks: B32 }
};
var RUNS = { all: ["29", "30", "31", "32"], "30-32": ["30", "31", "32"], "29": ["29"], "30": ["30"], "31": ["31"], "32": ["32"] };
var sheiko2932 = {
  id: "sheiko-29-32",
  name: "Sheiko #29\u2013#32",
  author: "Boris Sheiko",
  source: "Sheiko Program Spreadsheets (ChaseT 2008, LiftVault): tabs #29, #30, #31, #32",
  summary: "Four 4-week blocks run back to back: #29 and #30 preparatory, #31 and #32 competition, peaking with a max test in #32. Bench three times a week, squat twice, deadlift once, all at fixed percentages of your 1RM.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 16,
  options: [
    { key: "run", label: "Blocks", default: "all", choices: [
      { value: "all", label: "#29 \u2192 #32 (16 weeks)" },
      { value: "30-32", label: "#30 \u2192 #32 (12 weeks)" },
      { value: "29", label: "#29 only (preparatory)" },
      { value: "30", label: "#30 only (preparatory)" },
      { value: "31", label: "#31 only (competition)" },
      { value: "32", label: "#32 only (competition / peak)" }
    ] }
  ],
  build(o) {
    const run = RUNS[o.run ?? "all"] ?? RUNS.all;
    const name = run.length > 1 ? `Sheiko #${run[0]}\u2013#${run[run.length - 1]}` : `Sheiko #${run[0]}`;
    return program("sheiko-29-32", name, run.map((k) => BLOCKS_29_32[k]), 3, [
      ...NOTES,
      "#32 week 1 Wednesday is a max test: work up to 2\u20133 singles at 100\u2013105%. The last week ends in competition (days 5\u20137)."
    ]);
  },
  defaults
};
var sheiko37 = {
  id: "sheiko-37",
  name: "Sheiko #37",
  author: "Boris Sheiko",
  source: "Sheiko Program Spreadsheets (ChaseT 2008, LiftVault): tab #37",
  summary: "A 4-week Sheiko preparatory block at medium volume: bench three times a week, squat twice, deadlift once, with block pulls and halting deadlifts.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [3],
  weeks: 4,
  options: [],
  build: () => program("sheiko-37", "Sheiko #37", [{ key: "s37", label: "#37", weeks: B37 }], 3, NOTES),
  defaults
};
var sheikoBeginner = {
  id: "sheiko-beginner",
  name: "Sheiko Beginner",
  author: "Boris Sheiko",
  source: "Sheiko Beginner Program (ChaseT 2008, LiftVault): tabs Prep_1, Comp",
  summary: "Sheiko's 3-day beginner template: run the 4-week prep cycle one or more times, then the 4-week competition cycle with a max test in its first week.",
  category: "powerlifting",
  level: "beginner",
  daysPerWeek: [3],
  weeks: 8,
  options: [
    { key: "prep", label: "Prep cycles", default: "1", choices: [
      { value: "1", label: "1 (4 weeks)" },
      { value: "2", label: "2 (8 weeks)" },
      { value: "3", label: "3 (12 weeks)" }
    ] },
    { key: "comp", label: "Competition cycle", default: "on", choices: [
      { value: "on", label: "Finish with the 4-week comp cycle" },
      { value: "off", label: "Prep only, then retest" }
    ] }
  ],
  build(o) {
    const n = Math.min(3, Math.max(1, Number(o.prep ?? 1) || 1));
    const blocks = Array.from({ length: n }, (_, i) => ({ key: `bp${i + 1}`, label: n > 1 ? `Prep ${i + 1}` : "Prep", weeks: BEG_PREP }));
    if ((o.comp ?? "on") === "on") blocks.push({ key: "bc", label: "Comp", weeks: BEG_COMP });
    return program("sheiko-beginner", "Sheiko Beginner", blocks, 3, [
      ...NOTES,
      `Accessory "~65% effort" is the sheet's intensity for that exercise, not a % of a competition lift.`,
      "Comp week 1 Wednesday is a max test (singles up to 105%). If you hit a PR, update your 1RM unless the meet is under 30 days away."
    ]);
  },
  defaults
};
var sheikoAml = {
  id: "sheiko-aml",
  name: "Sheiko Advanced Medium Load",
  author: "Boris Sheiko",
  source: "Sheiko Advanced Medium Load (ChaseT 2008, LiftVault): tabs Prep Cycle I, II, III, Comp Cycle",
  summary: "Sheiko's 4-day plan for Class 1 and above: three preparatory cycles (4, 6 and 5 weeks) and a 5-week competition cycle, with board and chain presses, paused and block deadlifts, and max tests along the way.",
  category: "powerlifting",
  level: "advanced",
  daysPerWeek: [4],
  weeks: 20,
  options: [],
  build: () => program("sheiko-aml", "Sheiko AML", [
    { key: "a1", label: "Prep I", weeks: AML1 },
    { key: "a2", label: "Prep II", weeks: AML2 },
    { key: "a3", label: "Prep III", weeks: AML3 },
    { key: "a4", label: "Comp", weeks: AML4 }
  ], 4, [
    ...NOTES,
    "Chains: add 8\u201310 kg of chain per side on top of the listed bar weight.",
    "Prep III week 2 and Comp week 2 include max-test singles (100\u2013105% / 100%).",
    "The last week ends in competition."
  ]),
  defaults
};
var SHEIKO_TEMPLATES = [sheiko2932, sheiko37, sheikoBeginner, sheikoAml];

// shared/programs/sheiko.test.ts
var cfg = (templateId, options = {}) => ({
  templateId,
  options,
  unit: "lb",
  startDate: "2026-01-01",
  startWeights: {},
  trainingMaxes: { squat: 300, bench: 200, deadlift: 400 }
});
var sets = (def, c, s, dayId, slotId) => {
  const i = def.days.findIndex((d) => d.id === dayId);
  const ex = planDay(def, c, s, i).exercises.find((e) => e.slotId === slotId);
  return ex?.sets.map((x) => [x.weight, x.reps]);
};
var rep = (n, w, r) => Array.from({ length: n }, () => [w, r]);
function doPlan(def, c, s, n, skip = []) {
  const p = planDay(def, c, s);
  const date = new Date(Date.UTC(2026, 0, 2 + n * 2)).toISOString().slice(0, 10);
  return {
    id: `w${n}`,
    title: p.dayName,
    start_time: `${date}T12:00:00Z`,
    end_time: `${date}T13:30:00Z`,
    exercises: p.exercises.filter((e) => !skip.includes(e.slotId)).map((e) => ({
      title: LIFTS[e.lift].hevy[0],
      exercise_template_id: LIFTS[e.lift].hevy[0],
      sets: e.sets.map((x) => ({ type: "normal", weight_kg: toKg(x.weight, "lb"), reps: x.reps }))
    }))
  };
}
describe2("all Sheiko templates build", () => {
  for (const t of SHEIKO_TEMPLATES) {
    it2(`${t.id}: unique ids, finite, 1RM`, () => {
      const opts = Object.fromEntries(t.options.map((o) => [o.key, o.default]));
      const def = t.build(opts);
      const ids = allSlots(def).map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(def.days.map((d) => d.id)).size).toBe(def.days.length);
      expect(def.cycle).toMatchObject({ finite: true, weeks: t.weeks });
      expect(def.maxLabel).toBe("1RM");
      expect(t.id.startsWith("sheiko-")).toBe(true);
      for (const s of allSlots(def)) expect(LIFTS[s.lift], s.lift).toBeDefined();
    });
  }
  it2("parses set specs", () => {
    expect(parseSets("5@50 4@60x2")).toEqual([{ pct: 0.5, reps: 5 }, { pct: 0.6, reps: 4 }, { pct: 0.6, reps: 4 }]);
  });
  it2("block options pick the right weeks", () => {
    expect(sheiko2932.build({ run: "32" }).cycle?.weeks).toBe(4);
    expect(sheiko2932.build({ run: "30-32" }).cycle?.weeks).toBe(12);
    expect(sheikoBeginner.build({ prep: "2", comp: "on" }).cycle?.weeks).toBe(12);
    expect(sheikoBeginner.build({ prep: "1", comp: "off" }).cycle?.weeks).toBe(4);
  });
});
describe2("#29\u2013#32 against the sheet (squat 300 / bench 200 / deadlift 400)", () => {
  const c = cfg("sheiko-29-32");
  const def = sheiko2932.build({ run: "all" });
  const s = initialState(def, c);
  it2("#29 W1 Monday: bench, squat, bench again, flyes, good mornings", () => {
    const d = def.days[0];
    expect(d.id).toBe("S29W1D1");
    expect(d.slots.map((x) => x.id)).toEqual(["s29w1d1-bench", "s29w1d1-squat", "s29w1d1-bench2", "s29w1d1-chestFly", "s29w1d1-goodMorning"]);
    expect(sets(def, c, s, "S29W1D1", "s29w1d1-bench")).toEqual([[100, 5], ...rep(2, 120, 4), ...rep(2, 140, 3), ...rep(5, 150, 3)]);
    expect(sets(def, c, s, "S29W1D1", "s29w1d1-squat")).toEqual([[150, 5], ...rep(2, 180, 5), ...rep(5, 210, 5)]);
    expect(sets(def, c, s, "S29W1D1", "s29w1d1-bench2")).toEqual([[100, 5], [120, 5], ...rep(4, 140, 4)]);
    expect(d.slots[3].progression).toEqual({ kind: "fixed", sets: 5, reps: 10 });
  });
  it2("#29 W1 Wednesday: deadlift to knees and block pulls off the deadlift 1RM", () => {
    const d = def.days.find((x) => x.id === "S29W1D2");
    expect(d.slots[0]).toMatchObject({ lift: "deadlift", tier: "SUPP" });
    expect(sets(def, c, s, "S29W1D2", "s29w1d2-deadlift")).toEqual([[200, 3], ...rep(2, 240, 3), ...rep(2, 280, 3), ...rep(4, 300, 3)]);
    expect(sets(def, c, s, "S29W1D2", "s29w1d2-rackPull")).toEqual([[220, 4], [260, 4], ...rep(2, 300, 4), ...rep(4, 340, 3)]);
  });
  it2("#30 W1 Wednesday bench pyramid tops out at 85%\xD71\xD72 and comes back down to 50%\xD712", () => {
    const w = sets(def, c, s, "S30W1D2", "s30w1d2-bench");
    expect(w.filter(([wt]) => wt === 170)).toEqual([[170, 1], [170, 1]]);
    expect(w[w.length - 1]).toEqual([100, 12]);
    expect(w).toHaveLength(19);
  });
  it2("#31 W1 Monday squat: 70% wave of 2,4,6,8,7,5,3", () => {
    expect(sets(def, c, s, "S31W1D1", "s31w1d1-squat").slice(3)).toEqual([2, 4, 6, 8, 7, 5, 3].map((r) => [210, r]));
  });
  it2("#32 W1 Wednesday max test ends with singles at 100%", () => {
    expect(sets(def, c, s, "S32W1D2", "s32w1d2-squat").slice(-3)).toEqual([[270, 1], [300, 1], [300, 1]]);
    expect(def.days.find((x) => x.id === "S32W1D2").slots[0].note).toMatch(/100–105%/);
  });
  it2("weeks are named by block; front squat uses the squat 1RM", () => {
    expect(def.cycle?.weekNames?.[4]).toBe("#30 \xB7 Week 1");
    expect(sets(def, c, s, "S29W2D1", "s29w2d1-frontSquat")[0]).toEqual([135, 3]);
  });
});
describe2("#37, Beginner and AML against the sheets", () => {
  it2("#37 W1 Friday: bench pyramid 50%\xD77 \u2026 75%\xD72\xD72 \u2026 50%\xD710", () => {
    const def = sheiko37.build({});
    const c = cfg("sheiko-37");
    const w = sets(def, c, initialState(def, c), "S37W1D3", "s37w1d3-bench");
    expect(w[0]).toEqual([100, 7]);
    expect(w.filter(([wt]) => wt === 150)).toEqual([[150, 2], [150, 2]]);
    expect(w[w.length - 1]).toEqual([100, 10]);
  });
  it2("Beginner comp W1 Wednesday: squat singles up to 105%", () => {
    const def = sheikoBeginner.build({ prep: "1", comp: "on" });
    const c = cfg("sheiko-beginner");
    expect(sets(def, c, initialState(def, c), "BCW1D2", "bcw1d2-squat").slice(-4)).toEqual([[270, 1], [285, 1], [300, 1], [315, 1]]);
    expect(def.days[0].slots.map((x) => x.lift)).toEqual(["squat", "bench", "chestFly", "goodMorning"]);
  });
  it2("AML Prep I W1 Monday: front squat at 30/40/50% of squat, then bench 75%\xD72\xD74", () => {
    const def = sheikoAml.build({});
    const c = cfg("sheiko-aml");
    const s = initialState(def, c);
    expect(def.days.filter((d) => d.weeks?.[0] === 0).map((d) => d.name)).toEqual(["Prep I W1 \xB7 Mon", "Prep I W1 \xB7 Wed", "Prep I W1 \xB7 Fri", "Prep I W1 \xB7 Sat"]);
    expect(sets(def, c, s, "A1W1D1", "a1w1d1-frontSquat")).toEqual([[90, 4], [120, 4], ...rep(3, 150, 4)]);
    expect(sets(def, c, s, "A1W1D1", "a1w1d1-bench").slice(-4)).toEqual(rep(4, 150, 2));
  });
});
describe2("replaying Sheiko #32", () => {
  const def = sheiko2932.build({ run: "32" });
  const c = cfg("sheiko-29-32", { run: "32" });
  it2("walks the sessions in order and completes after week 4", () => {
    let s = initialState(def, c);
    const ws = [];
    for (let n = 0; n < 11; n++) {
      const w = doPlan(def, c, s, n);
      ws.push(w);
      s = applyWorkout(def, c, s, w, s.dayIndex);
    }
    expect(s.complete).toBe(true);
    expect(s.log.map((l) => l.dayId)).toEqual(["S32W1D1", "S32W1D2", "S32W1D3", "S32W2D1", "S32W2D2", "S32W2D3", "S32W3D1", "S32W3D2", "S32W3D3", "S32W4D1", "S32W4D2"]);
    const r = replay(def, c, ws);
    expect(r.complete).toBe(true);
    expect(r.log.map((l) => l.dayId)).toEqual(s.log.map((l) => l.dayId));
    expect(r.tms).toEqual({ squat: 300, bench: 200, deadlift: 400 });
  });
  it2("matches a second bench block to the second bench slot, and flags it missed if skipped", () => {
    let s = initialState(def, c);
    for (let n = 0; n < 5; n++) s = applyWorkout(def, c, s, doPlan(def, c, s, n), s.dayIndex);
    expect(def.days[s.dayIndex].id).toBe("S32W2D3");
    const full = applyWorkout(def, c, s, doPlan(def, c, s, 5), s.dayIndex).log.at(-1).results;
    expect(full.find((x) => x.slotId === "s32w2d3-bench2")).toMatchObject({ outcome: "success", weight: 140, reps: [4, 4, 4, 4, 4, 4] });
    const skipped = applyWorkout(def, c, s, doPlan(def, c, s, 5, ["s32w2d3-bench2"]), s.dayIndex).log.at(-1).results;
    expect(skipped.find((x) => x.slotId === "s32w2d3-bench")?.outcome).toBe("success");
    expect(skipped.find((x) => x.slotId === "s32w2d3-bench2")?.outcome).toBe("missed");
  });
});
describe2("sessions match the source sheets", () => {
  const spec = (def, dayId) => {
    const day = def.days.find((d) => d.id === dayId);
    expect(day, dayId).toBeDefined();
    return day.slots.map((s) => {
      const p = s.progression;
      if (p.kind === "fixed") return `${s.lift} ${p.sets}x${p.reps}`;
      if (p.kind !== "percent") throw new Error("unexpected");
      const toks = [];
      let prev = "", n = 0;
      const flush = () => {
        if (prev) toks.push(n > 1 ? `${prev}x${n}` : prev);
      };
      for (const x of p.weeks[0]) {
        const t = `${x.reps}@${Math.round(x.pct * 1e3) / 10}`;
        if (t === prev) n++;
        else {
          flush();
          prev = t;
          n = 1;
        }
      }
      flush();
      return `${s.lift} ${toks.join(" ")}`;
    });
  };
  it2("#29 week 1 Monday", () => {
    expect(spec(sheiko2932.build({}), "S29W1D1")).toEqual([
      "bench 5@50 4@60x2 3@70x2 3@75x5",
      "squat 5@50 5@60x2 5@70x5",
      "bench 5@50 5@60 4@70x4",
      "chestFly 5x10",
      "goodMorning 5x5"
    ]);
  });
  it2("#32 week 4 (last week: Monday, Wednesday, then competition)", () => {
    const def = sheiko2932.build({ run: "32" });
    expect(spec(def, "S32W4D1").slice(0, 2)).toEqual(["bench 3@50 3@60x2 2@70x2 1@75x4", "deadlift 3@50 2@60x2 2@70x4"]);
    expect(spec(def, "S32W4D2")).toEqual(["squat 3@50 3@60x2 2@70x3", "bench 3@50 3@60x2 2@70x3"]);
    expect(def.days.filter((d) => d.weeks?.[0] === 3)).toHaveLength(2);
  });
  it2("#37 week 2 Friday", () => {
    expect(spec(sheiko37.build({}), "S37W2D3")).toEqual([
      "squat 4@50 4@60 3@70x2 3@75x6",
      "bench 6@50 5@60 4@70x2 3@75x2 2@80x2 4@75 5@70 6@60 7@50",
      "chestFly 5x10",
      expect.stringMatching(/ 5x10$/),
      "squat 3@55 3@65 2@75x4",
      "goodMorning 5x6"
    ]);
  });
  it2("Beginner prep week 1 Monday and comp week 4 Wednesday", () => {
    const def = sheikoBeginner.build({});
    expect(spec(def, "BP1W1D1").slice(0, 2)).toEqual(["squat 5@50 5@60 4@70x4", "bench 5@50 4@60 3@70 3@75x4"]);
    expect(spec(def, "BCW4D2")).toEqual(["squat 3@50 3@60 2@65x3", "bench 3@50 3@60 2@70x3"]);
  });
  it2("AML comp week 2 Wednesday max singles and the final week", () => {
    const def = sheikoAml.build({});
    expect(spec(def, "A4W2D2").slice(0, 2)).toEqual(["bench 3@50 3@60 3@70 2@80 1@90 1@95 1@100", "deadlift 3@50 3@60 2@70 2@80 1@90 1@95 1@100"]);
    expect(spec(def, "A4W5D1").slice(0, 2)).toEqual(["bench 3@50 3@60 2@70x2 1@75x3", "deadlift 3@50 3@60 2@70x3"]);
    expect(spec(def, "A4W5D2")).toEqual(["squat 3@50 2@60 1@70x3", "bench 3@50 3@60 2@70x3"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vcGFja2FnZXMvdGVzdC9pbmRleC50cyIsICIuLi8uLi8uLi9zaGFyZWQvbGlmdHMudHMiLCAiLi4vLi4vLi4vc2hhcmVkL3VuaXRzLnRzIiwgIi4uLy4uLy4uL3NoYXJlZC9wcm9ncmFtLnRzIiwgIi4uLy4uLy4uL3NoYXJlZC9wcm9ncmFtcy9zaGVpa28udHMiLCAiLi4vLi4vLi4vc2hhcmVkL3Byb2dyYW1zL3NoZWlrby50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBBIHNtYWxsIHZpdGVzdC1jb21wYXRpYmxlIHRlc3QgQVBJIG9uIHRvcCBvZiBub2RlOnRlc3QgYW5kIG5vZGU6YXNzZXJ0LCBzbyB0aGUgdGVzdHMga2VlcFxuLy8gYGltcG9ydCB7IGRlc2NyaWJlLCBleHBlY3QsIGl0IH0gZnJvbSBcInZpdGVzdFwiYCAoc2NyaXB0cy90ZXN0Lm1qcyBhbGlhc2VzIFwidml0ZXN0XCIgdG8gdGhpcyBmaWxlKVxuLy8gd2l0aG91dCB2aXRlc3QncyA4OCBwYWNrYWdlcy4gT25seSB3aGF0IHRoZSB0ZXN0cyB1c2UgaXMgaGVyZTsgYWRkIG1hdGNoZXJzIGFzIG5lZWRlZC5cbmltcG9ydCB7IEFzc2VydGlvbkVycm9yIH0gZnJvbSBcIm5vZGU6YXNzZXJ0XCI7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luLCByZWxhdGl2ZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCAqIGFzIG5vZGVUZXN0IGZyb20gXCJub2RlOnRlc3RcIjtcbmltcG9ydCB7IGluc3BlY3QsIGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSBcIm5vZGU6dXRpbFwiO1xuXG50eXBlIEZuID0gKCkgPT4gdW5rbm93biB8IFByb21pc2U8dW5rbm93bj47XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBzdWl0ZXMgYW5kIGhvb2tzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBzdGFjazogc3RyaW5nW10gPSBbXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGRlc2NyaWJlKG5hbWU6IHN0cmluZywgZm46ICgpID0+IHZvaWQpIHtcbiAgY29uc3QgcGF0aCA9IFsuLi5zdGFjaywgbmFtZV07XG4gIHJldHVybiBub2RlVGVzdC5kZXNjcmliZShuYW1lLCAoKSA9PiB7IGNvbnN0IHNhdmVkID0gc3RhY2suc3BsaWNlKDApOyBzdGFjay5wdXNoKC4uLnBhdGgpOyB0cnkgeyBmbigpOyB9IGZpbmFsbHkgeyBzdGFjay5zcGxpY2UoMCk7IHN0YWNrLnB1c2goLi4uc2F2ZWQpOyB9IH0pO1xufVxuXG50eXBlIFJ1bm5lciA9IChuYW1lOiBzdHJpbmcsIG9wdGlvbnM6IHsgdGltZW91dD86IG51bWJlciB9LCBmbj86ICgpID0+IFByb21pc2U8dm9pZD4pID0+IHVua25vd247XG5cbi8qKlxuICogQSB0ZXN0IG9yIGhvb2sgdGhhdCBydW5zIGxvbmdlciBmYWlscyAoXCJodW5nXCIsIG5vdCBcInNsb3dcIik6IGdlbmVyb3VzLCBiZWNhdXNlIHRoZSBlbmQtdG8tZW5kXG4gKiB0ZXN0cyBydW4gc2V2ZXJhbCBpbi1wcm9jZXNzIHNlcnZlcnMuIEEgdGVzdCBjYW4gcGFzcyBpdHMgb3duIGFzIHRoZSB0aGlyZCBhcmd1bWVudC5cbiAqL1xuZXhwb3J0IGNvbnN0IFRFU1RfVElNRU9VVF9NUyA9IDYwXzAwMDtcbmV4cG9ydCBjb25zdCBIT09LX1RJTUVPVVRfTVMgPSAxMjBfMDAwO1xuXG5mdW5jdGlvbiB0ZXN0V2l0aChydW5uZXI6IFJ1bm5lcikge1xuICByZXR1cm4gKG5hbWU6IHN0cmluZywgZm4/OiBGbiwgdGltZW91dDogbnVtYmVyIHwgeyB0aW1lb3V0PzogbnVtYmVyIH0gPSBURVNUX1RJTUVPVVRfTVMpOiB2b2lkID0+IHtcbiAgICBjb25zdCBwYXRoID0gWy4uLnN0YWNrLCBuYW1lXTtcbiAgICBydW5uZXIobmFtZSwgeyB0aW1lb3V0OiB0eXBlb2YgdGltZW91dCA9PT0gXCJudW1iZXJcIiA/IHRpbWVvdXQgOiB0aW1lb3V0LnRpbWVvdXQgPz8gVEVTVF9USU1FT1VUX01TIH0sIGZuID8gYXN5bmMgKCkgPT4ge1xuICAgICAgY3VycmVudCA9IHsgbmFtZTogcGF0aC5qb2luKFwiID4gXCIpLCBjb3VudHM6IG5ldyBNYXAoKSB9O1xuICAgICAgYXdhaXQgZm4oKTtcbiAgICB9IDogdW5kZWZpbmVkKTtcbiAgfTtcbn1cblxudHlwZSBJdCA9IFJldHVyblR5cGU8dHlwZW9mIHRlc3RXaXRoPiAmIHtcbiAgc2tpcDogUmV0dXJuVHlwZTx0eXBlb2YgdGVzdFdpdGg+O1xuICBvbmx5OiBSZXR1cm5UeXBlPHR5cGVvZiB0ZXN0V2l0aD47XG4gIHRvZG86IChuYW1lOiBzdHJpbmcpID0+IHZvaWQ7XG4gIGVhY2g6IDxUPihjYXNlczogcmVhZG9ubHkgVFtdKSA9PiAobmFtZTogc3RyaW5nLCBmbjogKC4uLmFyZ3M6IFQgZXh0ZW5kcyByZWFkb25seSB1bmtub3duW10gPyBUIDogW1RdKSA9PiB1bmtub3duKSA9PiB2b2lkO1xufTtcblxuZnVuY3Rpb24gbWFrZUl0KCk6IEl0IHtcbiAgY29uc3QgaXQgPSB0ZXN0V2l0aChub2RlVGVzdC5pdCkgYXMgSXQ7XG4gIGl0LnNraXAgPSB0ZXN0V2l0aChub2RlVGVzdC5pdC5za2lwKTtcbiAgaXQub25seSA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0Lm9ubHkpO1xuICBpdC50b2RvID0gKG5hbWU6IHN0cmluZykgPT4geyBub2RlVGVzdC5pdC50b2RvKG5hbWUpOyB9O1xuICBpdC5lYWNoID0gPFQ+KGNhc2VzOiByZWFkb25seSBUW10pID0+IChuYW1lOiBzdHJpbmcsIGZuOiAoLi4uYXJnczogVCBleHRlbmRzIHJlYWRvbmx5IHVua25vd25bXSA/IFQgOiBbVF0pID0+IHVua25vd24pID0+IHtcbiAgICBjYXNlcy5mb3JFYWNoKChjLCBpKSA9PiB7XG4gICAgICBjb25zdCBhcmdzID0gKEFycmF5LmlzQXJyYXkoYykgPyBjIDogW2NdKSBhcyBUIGV4dGVuZHMgcmVhZG9ubHkgdW5rbm93bltdID8gVCA6IFtUXTtcbiAgICAgIGl0KGZvcm1hdEVhY2hOYW1lKG5hbWUsIGFyZ3MsIGkpLCAoKSA9PiBmbiguLi5hcmdzKSk7XG4gICAgfSk7XG4gIH07XG4gIHJldHVybiBpdDtcbn1cblxuLyoqIGAlcyAlZCAlaSAlZiAlaiAlbyAlI2AgYW5kIGAkZmllbGRgIHBsYWNlaG9sZGVycywgYXMgaW4gdml0ZXN0J3MgaXQuZWFjaC4gKi9cbmZ1bmN0aW9uIGZvcm1hdEVhY2hOYW1lKG5hbWU6IHN0cmluZywgYXJnczogcmVhZG9ubHkgdW5rbm93bltdLCBpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcbiAgbGV0IGkgPSAwO1xuICBsZXQgb3V0ID0gbmFtZS5yZXBsYWNlKC8lW3NkaWZqbyMlXS9nLCAobSkgPT4ge1xuICAgIGlmIChtID09PSBcIiUlXCIpIHJldHVybiBcIiVcIjtcbiAgICBpZiAobSA9PT0gXCIlI1wiKSByZXR1cm4gU3RyaW5nKGluZGV4KTtcbiAgICBjb25zdCB2ID0gYXJnc1tpKytdO1xuICAgIHJldHVybiBtID09PSBcIiVqXCIgfHwgbSA9PT0gXCIlb1wiID8gSlNPTi5zdHJpbmdpZnkodikgOiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBpbnNwZWN0KHYpO1xuICB9KTtcbiAgY29uc3QgZmlyc3QgPSBhcmdzWzBdO1xuICBpZiAoZmlyc3QgJiYgdHlwZW9mIGZpcnN0ID09PSBcIm9iamVjdFwiKSB7XG4gICAgb3V0ID0gb3V0LnJlcGxhY2UoL1xcJChbXFx3Ll0rKS9nLCAobSwga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IHYgPSBrZXkuc3BsaXQoXCIuXCIpLnJlZHVjZTxhbnk+KChvLCBrKSA9PiAobyA9PSBudWxsID8gbyA6IG9ba10pLCBmaXJzdCk7XG4gICAgICByZXR1cm4gdiA9PT0gdW5kZWZpbmVkID8gbSA6IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gdiA6IGluc3BlY3Qodik7XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGNvbnN0IGl0ID0gbWFrZUl0KCk7XG5leHBvcnQgY29uc3QgdGVzdCA9IGl0O1xuZXhwb3J0IGNvbnN0IGJlZm9yZUFsbCA9IChmbjogRm4sIHRpbWVvdXQgPSBIT09LX1RJTUVPVVRfTVMpID0+IG5vZGVUZXN0LmJlZm9yZShmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGFmdGVyQWxsID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYWZ0ZXIoZm4sIHsgdGltZW91dCB9KTtcbmV4cG9ydCBjb25zdCBiZWZvcmVFYWNoID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYmVmb3JlRWFjaChmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGFmdGVyRWFjaCA9IChmbjogRm4sIHRpbWVvdXQgPSBIT09LX1RJTUVPVVRfTVMpID0+IG5vZGVUZXN0LmFmdGVyRWFjaChmbiwgeyB0aW1lb3V0IH0pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgbW9jayBmdW5jdGlvbnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9jazxBIGV4dGVuZHMgdW5rbm93bltdID0gYW55W10sIFIgPSBhbnk+IHtcbiAgKC4uLmFyZ3M6IEEpOiBSO1xuICBtb2NrOiB7IGNhbGxzOiBBW107IHJlc3VsdHM6IHsgdHlwZTogXCJyZXR1cm5cIiB8IFwidGhyb3dcIjsgdmFsdWU6IHVua25vd24gfVtdIH07XG4gIG1vY2tJbXBsZW1lbnRhdGlvbihmbjogKC4uLmFyZ3M6IEEpID0+IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrSW1wbGVtZW50YXRpb25PbmNlKGZuOiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj47XG4gIG1vY2tSZXR1cm5WYWx1ZSh2OiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1JldHVyblZhbHVlT25jZSh2OiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1Jlc29sdmVkVmFsdWUodjogQXdhaXRlZDxSPik6IE1vY2s8QSwgUj47XG4gIG1vY2tSZWplY3RlZFZhbHVlKGU6IHVua25vd24pOiBNb2NrPEEsIFI+O1xuICBtb2NrQ2xlYXIoKTogTW9jazxBLCBSPjtcbiAgbW9ja1Jlc2V0KCk6IE1vY2s8QSwgUj47XG59XG5jb25zdCBNT0NLID0gU3ltYm9sKFwibW9ja1wiKTtcblxuZnVuY3Rpb24gZm48QSBleHRlbmRzIHVua25vd25bXSA9IGFueVtdLCBSID0gYW55PihpbXBsPzogKC4uLmFyZ3M6IEEpID0+IFIpOiBNb2NrPEEsIFI+IHtcbiAgbGV0IGJhc2UgPSBpbXBsO1xuICBjb25zdCBvbmNlOiAoKC4uLmFyZ3M6IEEpID0+IFIpW10gPSBbXTtcbiAgY29uc3QgbSA9ICgoLi4uYXJnczogQSk6IFIgPT4ge1xuICAgIG0ubW9jay5jYWxscy5wdXNoKGFyZ3MpO1xuICAgIGNvbnN0IGYgPSBvbmNlLnNoaWZ0KCkgPz8gYmFzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsdWUgPSBmID8gZiguLi5hcmdzKSA6ICh1bmRlZmluZWQgYXMgUik7XG4gICAgICBtLm1vY2sucmVzdWx0cy5wdXNoKHsgdHlwZTogXCJyZXR1cm5cIiwgdmFsdWUgfSk7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbS5tb2NrLnJlc3VsdHMucHVzaCh7IHR5cGU6IFwidGhyb3dcIiwgdmFsdWU6IGUgfSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfSkgYXMgTW9jazxBLCBSPjtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG0sIE1PQ0ssIHsgdmFsdWU6IHRydWUgfSk7XG4gIG0ubW9jayA9IHsgY2FsbHM6IFtdLCByZXN1bHRzOiBbXSB9O1xuICBtLm1vY2tJbXBsZW1lbnRhdGlvbiA9IChmKSA9PiB7IGJhc2UgPSBmOyByZXR1cm4gbTsgfTtcbiAgbS5tb2NrSW1wbGVtZW50YXRpb25PbmNlID0gKGYpID0+IHsgb25jZS5wdXNoKGYpOyByZXR1cm4gbTsgfTtcbiAgbS5tb2NrUmV0dXJuVmFsdWUgPSAodikgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gdik7XG4gIG0ubW9ja1JldHVyblZhbHVlT25jZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbk9uY2UoKCkgPT4gdik7XG4gIG0ubW9ja1Jlc29sdmVkVmFsdWUgPSAodikgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCgpID0+IFByb21pc2UucmVzb2x2ZSh2KSkgYXMgKC4uLmFyZ3M6IEEpID0+IFIpO1xuICBtLm1vY2tSZWplY3RlZFZhbHVlID0gKGUpID0+IG0ubW9ja0ltcGxlbWVudGF0aW9uKCgoKSA9PiBQcm9taXNlLnJlamVjdChlKSkgYXMgKC4uLmFyZ3M6IEEpID0+IFIpO1xuICBtLm1vY2tDbGVhciA9ICgpID0+IHsgbS5tb2NrLmNhbGxzID0gW107IG0ubW9jay5yZXN1bHRzID0gW107IHJldHVybiBtOyB9O1xuICBtLm1vY2tSZXNldCA9ICgpID0+IHsgbS5tb2NrQ2xlYXIoKTsgYmFzZSA9IHVuZGVmaW5lZDsgb25jZS5sZW5ndGggPSAwOyByZXR1cm4gbTsgfTtcbiAgcmV0dXJuIG07XG59XG5jb25zdCBpc01vY2sgPSAodjogdW5rbm93bik6IHYgaXMgTW9jayA9PiB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiICYmICh2IGFzIHVua25vd24gYXMgUmVjb3JkPHN5bWJvbCwgdW5rbm93bj4pW01PQ0tdID09PSB0cnVlO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgdmkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHN0dWJiZWQgPSBuZXcgTWFwPHN0cmluZywgUHJvcGVydHlEZXNjcmlwdG9yIHwgdW5kZWZpbmVkPigpO1xuXG5leHBvcnQgY29uc3QgdmkgPSB7XG4gIGZuLFxuICBpc01vY2tGdW5jdGlvbjogaXNNb2NrLFxuICBzdHViR2xvYmFsKG5hbWU6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICBpZiAoIXN0dWJiZWQuaGFzKG5hbWUpKSBzdHViYmVkLnNldChuYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGdsb2JhbFRoaXMsIG5hbWUpKTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZ2xvYmFsVGhpcywgbmFtZSwgeyB2YWx1ZSwgd3JpdGFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHVuc3R1YkFsbEdsb2JhbHMoKSB7XG4gICAgZm9yIChjb25zdCBbbmFtZSwgZGVzY10gb2Ygc3R1YmJlZCkge1xuICAgICAgaWYgKGRlc2MpIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShnbG9iYWxUaGlzLCBuYW1lLCBkZXNjKTtcbiAgICAgIGVsc2UgZGVsZXRlIChnbG9iYWxUaGlzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtuYW1lXTtcbiAgICB9XG4gICAgc3R1YmJlZC5jbGVhcigpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgLyoqIE9ubHkgRGF0ZSBpcyBzdXBwb3J0ZWQgKG5vZGU6dGVzdCdzIG1vY2sgdGltZXJzKS4gKi9cbiAgdXNlRmFrZVRpbWVycyhvcHRzPzogeyB0b0Zha2U/OiBzdHJpbmdbXTsgbm93PzogbnVtYmVyIHwgRGF0ZSB9KSB7XG4gICAgY29uc3QgYXBpcyA9IChvcHRzPy50b0Zha2UgPz8gW1wiRGF0ZVwiXSkuZmlsdGVyKChhKSA9PiBhID09PSBcIkRhdGVcIiB8fCBhID09PSBcInNldFRpbWVvdXRcIiB8fCBhID09PSBcInNldEludGVydmFsXCIpIGFzIChcIkRhdGVcIiB8IFwic2V0VGltZW91dFwiIHwgXCJzZXRJbnRlcnZhbFwiKVtdO1xuICAgIG5vZGVUZXN0Lm1vY2sudGltZXJzLmVuYWJsZSh7IGFwaXMsIG5vdzogb3B0cz8ubm93ID8/IERhdGUubm93KCkgfSk7XG4gICAgcmV0dXJuIHZpO1xuICB9LFxuICBzZXRTeXN0ZW1UaW1lKHQ6IG51bWJlciB8IERhdGUpIHtcbiAgICBub2RlVGVzdC5tb2NrLnRpbWVycy5zZXRUaW1lKHR5cGVvZiB0ID09PSBcIm51bWJlclwiID8gdCA6IHQuZ2V0VGltZSgpKTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHVzZVJlYWxUaW1lcnMoKSB7XG4gICAgbm9kZVRlc3QubW9jay50aW1lcnMucmVzZXQoKTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG59O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgZXF1YWxpdHkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmludGVyZmFjZSBBc3ltbWV0cmljIHsgYXN5bW1ldHJpY01hdGNoKGFjdHVhbDogdW5rbm93bik6IGJvb2xlYW47IHRvU3RyaW5nKCk6IHN0cmluZyB9XG5jb25zdCBpc0FzeW1tZXRyaWMgPSAodjogdW5rbm93bik6IHYgaXMgQXN5bW1ldHJpYyA9PiAhIXYgJiYgdHlwZW9mICh2IGFzIEFzeW1tZXRyaWMpLmFzeW1tZXRyaWNNYXRjaCA9PT0gXCJmdW5jdGlvblwiO1xuXG4vKiogdml0ZXN0J3MgdG9FcXVhbDogcmVjdXJzaXZlLCBpZ25vcmVzIHVuZGVmaW5lZCBwcm9wZXJ0aWVzIGFuZCBvYmplY3QgdHlwZXM7IFtwYXJ0aWFsXSA9IHRvTWF0Y2hPYmplY3QuICovXG5mdW5jdGlvbiBlcXVhbHMoYTogdW5rbm93biwgYjogdW5rbm93biwgcGFydGlhbCA9IGZhbHNlLCBzZWVuID0gbmV3IE1hcDxvYmplY3QsIG9iamVjdD4oKSk6IGJvb2xlYW4ge1xuICBpZiAoaXNBc3ltbWV0cmljKGIpKSByZXR1cm4gYi5hc3ltbWV0cmljTWF0Y2goYSk7XG4gIGlmIChpc0FzeW1tZXRyaWMoYSkpIHJldHVybiBhLmFzeW1tZXRyaWNNYXRjaChiKTtcbiAgaWYgKE9iamVjdC5pcyhhLCBiKSkgcmV0dXJuIHRydWU7XG4gIGlmICh0eXBlb2YgYSAhPT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgYiAhPT0gXCJvYmplY3RcIiB8fCBhID09PSBudWxsIHx8IGIgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgaWYgKHNlZW4uZ2V0KGEpID09PSBiKSByZXR1cm4gdHJ1ZTtcbiAgc2Vlbi5zZXQoYSwgYik7XG4gIGlmIChhIGluc3RhbmNlb2YgRGF0ZSB8fCBiIGluc3RhbmNlb2YgRGF0ZSkgcmV0dXJuIGEgaW5zdGFuY2VvZiBEYXRlICYmIGIgaW5zdGFuY2VvZiBEYXRlICYmIGEuZ2V0VGltZSgpID09PSBiLmdldFRpbWUoKTtcbiAgaWYgKGEgaW5zdGFuY2VvZiBSZWdFeHAgfHwgYiBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIFN0cmluZyhhKSA9PT0gU3RyaW5nKGIpO1xuICBpZiAoYSBpbnN0YW5jZW9mIE1hcCB8fCBiIGluc3RhbmNlb2YgTWFwKSB7XG4gICAgaWYgKCEoYSBpbnN0YW5jZW9mIE1hcCAmJiBiIGluc3RhbmNlb2YgTWFwKSB8fCBhLnNpemUgIT09IGIuc2l6ZSkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIGIpIGlmICghYS5oYXMoaykgfHwgIWVxdWFscyhhLmdldChrKSwgdiwgcGFydGlhbCwgc2VlbikpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoYSBpbnN0YW5jZW9mIFNldCB8fCBiIGluc3RhbmNlb2YgU2V0KSB7XG4gICAgaWYgKCEoYSBpbnN0YW5jZW9mIFNldCAmJiBiIGluc3RhbmNlb2YgU2V0KSB8fCBhLnNpemUgIT09IGIuc2l6ZSkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAoY29uc3QgdiBvZiBiKSBpZiAoIWEuaGFzKHYpICYmICFbLi4uYV0uc29tZSgoeCkgPT4gZXF1YWxzKHgsIHYsIHBhcnRpYWwsIHNlZW4pKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChBcnJheUJ1ZmZlci5pc1ZpZXcoYSkgfHwgQXJyYXlCdWZmZXIuaXNWaWV3KGIpKSByZXR1cm4gaXNEZWVwU3RyaWN0RXF1YWwoYSwgYik7XG4gIGlmIChBcnJheS5pc0FycmF5KGEpICE9PSBBcnJheS5pc0FycmF5KGIpKSByZXR1cm4gZmFsc2U7XG4gIGlmIChBcnJheS5pc0FycmF5KGEpICYmIEFycmF5LmlzQXJyYXkoYikpIHtcbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGIuZXZlcnkoKHYsIGkpID0+IGVxdWFscyhhW2ldLCB2LCBwYXJ0aWFsLCBzZWVuKSk7XG4gIH1cbiAgY29uc3QgYW8gPSBhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBibyA9IGIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGtleXMgPSAobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IE9iamVjdC5rZXlzKG8pLmZpbHRlcigoaykgPT4gb1trXSAhPT0gdW5kZWZpbmVkKTtcbiAgaWYgKHBhcnRpYWwpIHJldHVybiBPYmplY3Qua2V5cyhibykuZXZlcnkoKGspID0+IChib1trXSA9PT0gdW5kZWZpbmVkID8gYW9ba10gPT09IHVuZGVmaW5lZCA6IGsgaW4gYW8gJiYgZXF1YWxzKGFvW2tdLCBib1trXSwgdHJ1ZSwgc2VlbikpKTtcbiAgY29uc3Qga2EgPSBrZXlzKGFvKSwga2IgPSBrZXlzKGJvKTtcbiAgaWYgKGthLmxlbmd0aCAhPT0ga2IubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBrYi5ldmVyeSgoaykgPT4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGFvLCBrKSAmJiBlcXVhbHMoYW9ba10sIGJvW2tdLCBmYWxzZSwgc2VlbikpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgc25hcHNob3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5sZXQgY3VycmVudDogeyBuYW1lOiBzdHJpbmc7IGNvdW50czogTWFwPHN0cmluZywgbnVtYmVyPiB9ID0geyBuYW1lOiBcIlwiLCBjb3VudHM6IG5ldyBNYXAoKSB9O1xuY29uc3Qgc25hcENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+KCk7XG5jb25zdCBkaXJ0eVNuYXBzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbi8qKlxuICogc2NyaXB0cy90ZXN0Lm1qcyBidW5kbGVzIHdlYi88ZGlyPi94LnRlc3QudHMgdG8gd2ViLy50ZXN0LWRpc3QvPGRpcj4veC50ZXN0Lm1qcyBhbmQgbm9kZSAtLXRlc3RcbiAqIHJ1bnMgZWFjaCBidW5kbGUgYXMgaXRzIG93biBwcm9jZXNzLCBzbyB0aGUgc291cmNlIHBhdGggZm9sbG93cyBmcm9tIHRoZSBzY3JpcHQgcGF0aC5cbiAqL1xuZnVuY3Rpb24gc25hcEZpbGUoKTogc3RyaW5nIHtcbiAgY29uc3Qgcm9vdCA9IHByb2Nlc3MuZW52LklST05URVJNX1RFU1RfUk9PVDtcbiAgY29uc3Qgc2NyaXB0ID0gcHJvY2Vzcy5hcmd2WzFdID8/IFwiXCI7XG4gIGNvbnN0IGRpc3QgPSByb290ID8gam9pbihyb290LCBcIi50ZXN0LWRpc3RcIikgOiBcIlwiO1xuICBpZiAoIXJvb3QgfHwgIXNjcmlwdC5zdGFydHNXaXRoKGRpc3QpKSB0aHJvdyBuZXcgRXJyb3IoXCJ0b01hdGNoU25hcHNob3Q6IHJ1biB0ZXN0cyB0aHJvdWdoIHNjcmlwdHMvdGVzdC5tanNcIik7XG4gIGNvbnN0IHNyYyA9IGpvaW4ocm9vdCwgcmVsYXRpdmUoZGlzdCwgc2NyaXB0KSkucmVwbGFjZSgvXFwubWpzJC8sIFwiLnRzXCIpO1xuICByZXR1cm4gam9pbihkaXJuYW1lKHNyYyksIFwiX19zbmFwc2hvdHNfX1wiLCBzcmMuc3BsaXQoXCIvXCIpLnBvcCgpICsgXCIuc25hcFwiKTtcbn1cblxuZnVuY3Rpb24gbG9hZFNuYXBzKGZpbGU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICBsZXQgc25hcHMgPSBzbmFwQ2FjaGUuZ2V0KGZpbGUpO1xuICBpZiAoIXNuYXBzKSB7XG4gICAgc25hcHMgPSB7fTtcbiAgICBpZiAoZXhpc3RzU3luYyhmaWxlKSkgbmV3IEZ1bmN0aW9uKFwiZXhwb3J0c1wiLCByZWFkRmlsZVN5bmMoZmlsZSwgXCJ1dGY4XCIpKShzbmFwcyk7XG4gICAgc25hcENhY2hlLnNldChmaWxlLCBzbmFwcyk7XG4gIH1cbiAgcmV0dXJuIHNuYXBzO1xufVxuXG4vKiogVGhlIHZpdGVzdCBzbmFwc2hvdCBmb3JtYXQgZm9yIHRoZSB2YWx1ZXMgdGhlIHRlc3RzIHNuYXBzaG90IChzdHJpbmdzOyBKU09OIG90aGVyd2lzZSkuICovXG5jb25zdCBzZXJpYWxpemUgPSAodjogdW5rbm93bikgPT4gKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gYFwiJHt2fVwiYCA6IEpTT04uc3RyaW5naWZ5KHYsIG51bGwsIDIpKTtcbmNvbnN0IGVzY2FwZVRlbXBsYXRlID0gKHM6IHN0cmluZykgPT4gcy5yZXBsYWNlKC9cXFxcL2csIFwiXFxcXFxcXFxcIikucmVwbGFjZSgvYC9nLCBcIlxcXFxgXCIpLnJlcGxhY2UoL1xcJFxcey9nLCBcIlxcXFwke1wiKTtcblxucHJvY2Vzcy5vbihcImV4aXRcIiwgKCkgPT4ge1xuICBmb3IgKGNvbnN0IGZpbGUgb2YgZGlydHlTbmFwcykge1xuICAgIGNvbnN0IHNuYXBzID0gc25hcENhY2hlLmdldChmaWxlKSE7XG4gICAgY29uc3QgYm9keSA9IE9iamVjdC5rZXlzKHNuYXBzKS5zb3J0KCkubWFwKChrKSA9PiBgZXhwb3J0c1tcXGAke2VzY2FwZVRlbXBsYXRlKGspfVxcYF0gPSBcXGAke2VzY2FwZVRlbXBsYXRlKHNuYXBzW2tdKX1cXGA7XFxuYCkuam9pbihcIlxcblwiKTtcbiAgICBta2RpclN5bmMoZGlybmFtZShmaWxlKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgd3JpdGVGaWxlU3luYyhmaWxlLCBgLy8gVml0ZXN0IFNuYXBzaG90IHYxLCBodHRwczovL3ZpdGVzdC5kZXYvZ3VpZGUvc25hcHNob3QuaHRtbFxcblxcbiR7Ym9keX1gKTtcbiAgICBjb25zb2xlLmxvZyhgdXBkYXRlZCAke3JlbGF0aXZlKHByb2Nlc3MuY3dkKCksIGZpbGUpfWApO1xuICB9XG59KTtcblxuZnVuY3Rpb24gbWF0Y2hTbmFwc2hvdChhY3R1YWw6IHVua25vd24sIGhpbnQ/OiBzdHJpbmcpIHtcbiAgY29uc3QgYmFzZSA9IGhpbnQgPyBgJHtjdXJyZW50Lm5hbWV9ID4gJHtoaW50fWAgOiBjdXJyZW50Lm5hbWU7XG4gIGNvbnN0IG4gPSAoY3VycmVudC5jb3VudHMuZ2V0KGJhc2UpID8/IDApICsgMTtcbiAgY3VycmVudC5jb3VudHMuc2V0KGJhc2UsIG4pO1xuICBjb25zdCBrZXkgPSBgJHtiYXNlfSAke259YDtcbiAgY29uc3QgZmlsZSA9IHNuYXBGaWxlKCk7XG4gIGNvbnN0IHNuYXBzID0gbG9hZFNuYXBzKGZpbGUpO1xuICBjb25zdCBnb3QgPSBgXFxuJHtzZXJpYWxpemUoYWN0dWFsKX1cXG5gO1xuICAvLyBsaWtlIHZpdGVzdCwgQ0kgbmV2ZXIgd3JpdGVzIGEgbWlzc2luZyBzbmFwc2hvdDogaXQgZmFpbHNcbiAgaWYgKCEoa2V5IGluIHNuYXBzKSAmJiBwcm9jZXNzLmVudi5DSSAmJiAhcHJvY2Vzcy5lbnYuVVBEQVRFX1NOQVBTSE9UUykgcmV0dXJuIHsgcGFzczogZmFsc2UsIG1lc3NhZ2U6IGBtaXNzaW5nIHNuYXBzaG90IFwiJHtrZXl9XCIgKHJ1biB0aGUgdGVzdHMgbG9jYWxseSBhbmQgY29tbWl0IHRoZSAuc25hcCBmaWxlKWAgfTtcbiAgaWYgKHByb2Nlc3MuZW52LlVQREFURV9TTkFQU0hPVFMgfHwgIShrZXkgaW4gc25hcHMpKSB7XG4gICAgaWYgKHNuYXBzW2tleV0gIT09IGdvdCkgeyBzbmFwc1trZXldID0gZ290OyBkaXJ0eVNuYXBzLmFkZChmaWxlKTsgfVxuICAgIHJldHVybiB7IHBhc3M6IHRydWUsIG1lc3NhZ2U6IFwiXCIgfTtcbiAgfVxuICByZXR1cm4geyBwYXNzOiBzbmFwc1trZXldID09PSBnb3QsIG1lc3NhZ2U6IGBzbmFwc2hvdCBcIiR7a2V5fVwiIGRpZmZlcnM6XFxuZXhwZWN0ZWQ6JHtzbmFwc1trZXldfVxcbnJlY2VpdmVkOiR7Z290fShVUERBVEVfU05BUFNIT1RTPTEgcG5wbSB0ZXN0IHRvIGFjY2VwdClgIH07XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBleHBlY3QgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHNob3cgPSAodjogdW5rbm93bikgPT4gKGlzQXN5bW1ldHJpYyh2KSA/IHYudG9TdHJpbmcoKSA6IGluc3BlY3QodiwgeyBkZXB0aDogNiwgYnJlYWtMZW5ndGg6IDEyMCB9KSk7XG5cbnR5cGUgUmVzdWx0ID0geyBwYXNzOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmcgfTtcbnR5cGUgTWF0Y2hlcnMgPSBSZWNvcmQ8c3RyaW5nLCAoYWN0dWFsOiB1bmtub3duLCAuLi5hcmdzOiBhbnlbXSkgPT4gUmVzdWx0PjtcblxuY29uc3QgbWF0Y2hlcnM6IE1hdGNoZXJzID0ge1xuICB0b0JlOiAoYSwgYikgPT4gKHsgcGFzczogT2JqZWN0LmlzKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSAke3Nob3coYil9YCB9KSxcbiAgdG9FcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IGVxdWFscyhhLCBiKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gZXF1YWwgJHtzaG93KGIpfWAgfSksXG4gIHRvU3RyaWN0RXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiBpc0RlZXBTdHJpY3RFcXVhbChhLCBiKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gc3RyaWN0bHkgZXF1YWwgJHtzaG93KGIpfWAgfSksXG4gIHRvTWF0Y2hPYmplY3Q6IChhLCBiKSA9PiAoeyBwYXNzOiBlcXVhbHMoYSwgYiwgdHJ1ZSksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIG1hdGNoIG9iamVjdCAke3Nob3coYil9YCB9KSxcbiAgdG9CZUNsb3NlVG86IChhLCBiOiBudW1iZXIsIGRpZ2l0cyA9IDIpID0+ICh7XG4gICAgcGFzczogdHlwZW9mIGEgPT09IFwibnVtYmVyXCIgJiYgKGEgPT09IGIgfHwgTWF0aC5hYnMoYSAtIGIpIDwgMTAgKiogLWRpZ2l0cyAvIDIpLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIGNsb3NlIHRvICR7Yn0gKCR7ZGlnaXRzfSBkaWdpdHMpYCxcbiAgfSksXG4gIHRvQmVHcmVhdGVyVGhhbjogKGEsIGIpID0+ICh7IHBhc3M6IChhIGFzIG51bWJlcikgPiBiLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSA+ICR7Yn1gIH0pLFxuICB0b0JlR3JlYXRlclRoYW5PckVxdWFsOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA+PSBiLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSA+PSAke2J9YCB9KSxcbiAgdG9CZUxlc3NUaGFuOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA8IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IDwgJHtifWAgfSksXG4gIHRvQmVMZXNzVGhhbk9yRXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpIDw9IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IDw9ICR7Yn1gIH0pLFxuICB0b0hhdmVMZW5ndGg6IChhLCBuKSA9PiAoeyBwYXNzOiAoYSBhcyB7IGxlbmd0aD86IG51bWJlciB9KT8ubGVuZ3RoID09PSBuLCBtZXNzYWdlOiBgZXhwZWN0ZWQgbGVuZ3RoICR7bn0sIGdvdCAkeyhhIGFzIHsgbGVuZ3RoPzogbnVtYmVyIH0pPy5sZW5ndGh9ICgke3Nob3coYSl9KWAgfSksXG4gIHRvSGF2ZVByb3BlcnR5OiAoYSwga2V5OiBzdHJpbmcsIC4uLnY6IHVua25vd25bXSkgPT4ge1xuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoXCIuXCIpO1xuICAgIGxldCBvOiBhbnkgPSBhO1xuICAgIGZvciAoY29uc3QgayBvZiBwYXRoKSB7IGlmIChvID09IG51bGwgfHwgIShrIGluIE9iamVjdChvKSkpIHJldHVybiB7IHBhc3M6IGZhbHNlLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBoYXZlIHByb3BlcnR5ICR7a2V5fWAgfTsgbyA9IG9ba107IH1cbiAgICByZXR1cm4geyBwYXNzOiB2Lmxlbmd0aCA9PT0gMCB8fCBlcXVhbHMobywgdlswXSksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGhhdmUgJHtrZXl9ID0gJHtzaG93KHZbMF0pfSwgZ290ICR7c2hvdyhvKX1gIH07XG4gIH0sXG4gIHRvQmVOdWxsOiAoYSkgPT4gKHsgcGFzczogYSA9PT0gbnVsbCwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgbnVsbGAgfSksXG4gIHRvQmVVbmRlZmluZWQ6IChhKSA9PiAoeyBwYXNzOiBhID09PSB1bmRlZmluZWQsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIHVuZGVmaW5lZGAgfSksXG4gIHRvQmVEZWZpbmVkOiAoYSkgPT4gKHsgcGFzczogYSAhPT0gdW5kZWZpbmVkLCBtZXNzYWdlOiBgZXhwZWN0ZWQgYSBkZWZpbmVkIHZhbHVlYCB9KSxcbiAgdG9CZVRydXRoeTogKGEpID0+ICh7IHBhc3M6ICEhYSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgdHJ1dGh5YCB9KSxcbiAgdG9CZUZhbHN5OiAoYSkgPT4gKHsgcGFzczogIWEsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIGZhbHN5YCB9KSxcbiAgdG9CZU5hTjogKGEpID0+ICh7IHBhc3M6IE51bWJlci5pc05hTihhKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgTmFOYCB9KSxcbiAgdG9CZUluc3RhbmNlT2Y6IChhLCBjbHMpID0+ICh7IHBhc3M6IGEgaW5zdGFuY2VvZiBjbHMsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIGFuIGluc3RhbmNlIG9mICR7Y2xzPy5uYW1lfWAgfSksXG4gIHRvQmVUeXBlT2Y6IChhLCB0OiBzdHJpbmcpID0+ICh7IHBhc3M6IHR5cGVvZiBhID09PSB0LCBtZXNzYWdlOiBgZXhwZWN0ZWQgdHlwZW9mICR7c2hvdyhhKX0gdG8gYmUgJHt0fWAgfSksXG4gIHRvTWF0Y2g6IChhLCByZTogUmVnRXhwIHwgc3RyaW5nKSA9PiAoe1xuICAgIHBhc3M6IHR5cGVvZiBhID09PSBcInN0cmluZ1wiICYmICh0eXBlb2YgcmUgPT09IFwic3RyaW5nXCIgPyBhLmluY2x1ZGVzKHJlKSA6IHJlLnRlc3QoYSkpLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIG1hdGNoICR7U3RyaW5nKHJlKX1gLFxuICB9KSxcbiAgdG9Db250YWluOiAoYSwgaXRlbSkgPT4gKHtcbiAgICBwYXNzOiB0eXBlb2YgYSA9PT0gXCJzdHJpbmdcIiA/IGEuaW5jbHVkZXMoaXRlbSBhcyBzdHJpbmcpIDogQXJyYXkuaXNBcnJheShhKSB8fCBhIGluc3RhbmNlb2YgU2V0ID8gWy4uLihhIGFzIEl0ZXJhYmxlPHVua25vd24+KV0uaW5jbHVkZXMoaXRlbSkgOiBmYWxzZSxcbiAgICBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBjb250YWluICR7c2hvdyhpdGVtKX1gLFxuICB9KSxcbiAgdG9Db250YWluRXF1YWw6IChhLCBpdGVtKSA9PiAoeyBwYXNzOiBBcnJheS5pc0FycmF5KGEpICYmIGEuc29tZSgoeCkgPT4gZXF1YWxzKHgsIGl0ZW0pKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gY29udGFpbiBhbiBpdGVtIGVxdWFsIHRvICR7c2hvdyhpdGVtKX1gIH0pLFxuICB0b1Rocm93OiAoZm5PckVycm9yLCBleHBlY3RlZD86IHVua25vd24pID0+IHtcbiAgICBsZXQgZXJyOiB1bmtub3duLCB0aHJldyA9IGZhbHNlO1xuICAgIGlmICh0eXBlb2YgZm5PckVycm9yID09PSBcImZ1bmN0aW9uXCIpIHsgdHJ5IHsgKGZuT3JFcnJvciBhcyAoKSA9PiB1bmtub3duKSgpOyB9IGNhdGNoIChlKSB7IHRocmV3ID0gdHJ1ZTsgZXJyID0gZTsgfSB9XG4gICAgZWxzZSB7IHRocmV3ID0gdHJ1ZTsgZXJyID0gZm5PckVycm9yOyB9IC8vIGZyb20gLnJlamVjdHNcbiAgICBjb25zdCBtc2cgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG4gICAgbGV0IHBhc3MgPSB0aHJldztcbiAgICBpZiAodGhyZXcgJiYgZXhwZWN0ZWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKHR5cGVvZiBleHBlY3RlZCA9PT0gXCJzdHJpbmdcIikgcGFzcyA9IG1zZy5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICBlbHNlIGlmIChleHBlY3RlZCBpbnN0YW5jZW9mIFJlZ0V4cCkgcGFzcyA9IGV4cGVjdGVkLnRlc3QobXNnKTtcbiAgICAgIGVsc2UgaWYgKHR5cGVvZiBleHBlY3RlZCA9PT0gXCJmdW5jdGlvblwiKSBwYXNzID0gZXJyIGluc3RhbmNlb2YgKGV4cGVjdGVkIGFzIG5ldyAoKSA9PiB1bmtub3duKTtcbiAgICAgIGVsc2UgaWYgKGV4cGVjdGVkIGluc3RhbmNlb2YgRXJyb3IpIHBhc3MgPSBtc2cgPT09IGV4cGVjdGVkLm1lc3NhZ2U7XG4gICAgfVxuICAgIHJldHVybiB7IHBhc3MsIG1lc3NhZ2U6IHRocmV3ID8gYGV4cGVjdGVkIHRoZSBlcnJvciAoJHttc2d9KSB0byBtYXRjaCAke3Nob3coZXhwZWN0ZWQpfWAgOiBgZXhwZWN0ZWQgYSB0aHJvdyR7ZXhwZWN0ZWQgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBgIG1hdGNoaW5nICR7c2hvdyhleHBlY3RlZCl9YH1gIH07XG4gIH0sXG4gIHRvTWF0Y2hTbmFwc2hvdDogKGEsIGhpbnQ/OiBzdHJpbmcpID0+IG1hdGNoU25hcHNob3QoYSwgaGludCksXG59O1xubWF0Y2hlcnMudG9UaHJvd0Vycm9yID0gbWF0Y2hlcnMudG9UaHJvdztcbmNvbnN0IGNhbGxzID0gKGE6IHVua25vd24pID0+IHsgaWYgKCFpc01vY2soYSkpIHRocm93IG5ldyBUeXBlRXJyb3IoYCR7c2hvdyhhKX0gaXMgbm90IGEgdmkuZm4oKWApOyByZXR1cm4gYS5tb2NrLmNhbGxzOyB9O1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZCA9IChhKSA9PiAoeyBwYXNzOiBjYWxscyhhKS5sZW5ndGggPiAwLCBtZXNzYWdlOiBcImV4cGVjdGVkIHRoZSBtb2NrIHRvIGhhdmUgYmVlbiBjYWxsZWRcIiB9KTtcbm1hdGNoZXJzLnRvSGF2ZUJlZW5DYWxsZWRUaW1lcyA9IChhLCBuOiBudW1iZXIpID0+ICh7IHBhc3M6IGNhbGxzKGEpLmxlbmd0aCA9PT0gbiwgbWVzc2FnZTogYGV4cGVjdGVkICR7bn0gY2FsbHMsIGdvdCAke2NhbGxzKGEpLmxlbmd0aH1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZFdpdGggPSAoYSwgLi4uYXJnczogdW5rbm93bltdKSA9PiAoeyBwYXNzOiBjYWxscyhhKS5zb21lKChjKSA9PiBlcXVhbHMoYywgYXJncykpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgYSBjYWxsIHdpdGggJHtzaG93KGFyZ3MpfTsgY2FsbHM6ICR7c2hvdyhjYWxscyhhKSl9YCB9KTtcbm1hdGNoZXJzLnRvSGF2ZUJlZW5MYXN0Q2FsbGVkV2l0aCA9IChhLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGVxdWFscyhjYWxscyhhKS5hdCgtMSksIGFyZ3MpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgdGhlIGxhc3QgY2FsbCB0byBiZSAke3Nob3coYXJncyl9OyBjYWxsczogJHtzaG93KGNhbGxzKGEpKX1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbk50aENhbGxlZFdpdGggPSAoYSwgbjogbnVtYmVyLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGVxdWFscyhjYWxscyhhKVtuIC0gMV0sIGFyZ3MpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgY2FsbCAke259IHRvIGJlICR7c2hvdyhhcmdzKX07IGNhbGxzOiAke3Nob3coY2FsbHMoYSkpfWAgfSk7XG5cbi8qKiBUaGUgbWF0Y2hlcnMsIHR5cGVkIChSID0gdm9pZCwgb3IgUHJvbWlzZTx2b2lkPiBhZnRlciAucmVzb2x2ZXMgLyAucmVqZWN0cykuICovXG5leHBvcnQgaW50ZXJmYWNlIEFzc2VydGlvbjxSID0gdm9pZD4ge1xuICB0b0JlKGV4cGVjdGVkOiB1bmtub3duKTogUjtcbiAgdG9FcXVhbChleHBlY3RlZDogdW5rbm93bik6IFI7XG4gIHRvU3RyaWN0RXF1YWwoZXhwZWN0ZWQ6IHVua25vd24pOiBSO1xuICB0b01hdGNoT2JqZWN0KGV4cGVjdGVkOiBvYmplY3QpOiBSO1xuICB0b0JlQ2xvc2VUbyhleHBlY3RlZDogbnVtYmVyLCBkaWdpdHM/OiBudW1iZXIpOiBSO1xuICB0b0JlR3JlYXRlclRoYW4objogbnVtYmVyIHwgYmlnaW50KTogUjtcbiAgdG9CZUdyZWF0ZXJUaGFuT3JFcXVhbChuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlTGVzc1RoYW4objogbnVtYmVyIHwgYmlnaW50KTogUjtcbiAgdG9CZUxlc3NUaGFuT3JFcXVhbChuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0hhdmVMZW5ndGgobjogbnVtYmVyKTogUjtcbiAgdG9IYXZlUHJvcGVydHkocGF0aDogc3RyaW5nLCB2YWx1ZT86IHVua25vd24pOiBSO1xuICB0b0JlTnVsbCgpOiBSO1xuICB0b0JlVW5kZWZpbmVkKCk6IFI7XG4gIHRvQmVEZWZpbmVkKCk6IFI7XG4gIHRvQmVUcnV0aHkoKTogUjtcbiAgdG9CZUZhbHN5KCk6IFI7XG4gIHRvQmVOYU4oKTogUjtcbiAgdG9CZUluc3RhbmNlT2YoY2xzOiBhYnN0cmFjdCBuZXcgKC4uLmFyZ3M6IG5ldmVyW10pID0+IHVua25vd24pOiBSO1xuICB0b0JlVHlwZU9mKHR5cGU6IFwic3RyaW5nXCIgfCBcIm51bWJlclwiIHwgXCJiaWdpbnRcIiB8IFwiYm9vbGVhblwiIHwgXCJzeW1ib2xcIiB8IFwidW5kZWZpbmVkXCIgfCBcIm9iamVjdFwiIHwgXCJmdW5jdGlvblwiKTogUjtcbiAgdG9NYXRjaChleHBlY3RlZDogUmVnRXhwIHwgc3RyaW5nKTogUjtcbiAgdG9Db250YWluKGl0ZW06IHVua25vd24pOiBSO1xuICB0b0NvbnRhaW5FcXVhbChpdGVtOiB1bmtub3duKTogUjtcbiAgdG9UaHJvdyhleHBlY3RlZD86IHN0cmluZyB8IFJlZ0V4cCB8IEVycm9yIHwgKGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bikpOiBSO1xuICB0b1Rocm93RXJyb3IoZXhwZWN0ZWQ/OiBzdHJpbmcgfCBSZWdFeHAgfCBFcnJvciB8IChhYnN0cmFjdCBuZXcgKC4uLmFyZ3M6IG5ldmVyW10pID0+IHVua25vd24pKTogUjtcbiAgdG9NYXRjaFNuYXBzaG90KGhpbnQ/OiBzdHJpbmcpOiBSO1xuICB0b0hhdmVCZWVuQ2FsbGVkKCk6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWRUaW1lcyhuOiBudW1iZXIpOiBSO1xuICB0b0hhdmVCZWVuQ2FsbGVkV2l0aCguLi5hcmdzOiB1bmtub3duW10pOiBSO1xuICB0b0hhdmVCZWVuTGFzdENhbGxlZFdpdGgoLi4uYXJnczogdW5rbm93bltdKTogUjtcbiAgdG9IYXZlQmVlbk50aENhbGxlZFdpdGgobjogbnVtYmVyLCAuLi5hcmdzOiB1bmtub3duW10pOiBSO1xufVxuXG50eXBlIEV4cGVjdGF0aW9uID0gQXNzZXJ0aW9uICYge1xuICBub3Q6IEFzc2VydGlvbjtcbiAgcmVzb2x2ZXM6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiAmIHsgbm90OiBBc3NlcnRpb248UHJvbWlzZTx2b2lkPj4gfTtcbiAgcmVqZWN0czogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+ICYgeyBub3Q6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiB9O1xufTtcblxuZnVuY3Rpb24gZmFpbChyOiBSZXN1bHQsIG5lZ2F0ZTogYm9vbGVhbiwgbGFiZWw/OiBzdHJpbmcpIHtcbiAgaWYgKHIucGFzcyA9PT0gbmVnYXRlKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IChsYWJlbCA/IGAke2xhYmVsfTogYCA6IFwiXCIpICsgKG5lZ2F0ZSA/IGBub3Q6ICR7ci5tZXNzYWdlfWAgOiByLm1lc3NhZ2UpO1xuICAgIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcih7IG1lc3NhZ2UgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiB1bmtub3duLCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiBmYWxzZSk6IEFzc2VydGlvbjtcbmZ1bmN0aW9uIGJ1aWxkKGFjdHVhbDogKCkgPT4gUHJvbWlzZTx1bmtub3duPiwgbmVnYXRlOiBib29sZWFuLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBhc3luYzogdHJ1ZSk6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PjtcbmZ1bmN0aW9uIGJ1aWxkKGFjdHVhbDogKCkgPT4gdW5rbm93biwgbmVnYXRlOiBib29sZWFuLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBhc3luYzogYm9vbGVhbik6IHVua25vd24ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG4gIGZvciAoY29uc3QgW25hbWUsIG1dIG9mIE9iamVjdC5lbnRyaWVzKG1hdGNoZXJzKSkge1xuICAgIG91dFtuYW1lXSA9IGFzeW5jXG4gICAgICA/IGFzeW5jICguLi5hcmdzOiB1bmtub3duW10pID0+IGZhaWwobShhd2FpdCBhY3R1YWwoKSwgLi4uYXJncyksIG5lZ2F0ZSwgbGFiZWwpXG4gICAgICA6ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZhaWwobShhY3R1YWwoKSwgLi4uYXJncyksIG5lZ2F0ZSwgbGFiZWwpO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBlY3Q8VD4oYWN0dWFsOiBULCBsYWJlbD86IHN0cmluZyk6IEV4cGVjdGF0aW9uIHtcbiAgY29uc3QgZSA9IGJ1aWxkKCgpID0+IGFjdHVhbCwgZmFsc2UsIGxhYmVsLCBmYWxzZSkgYXMgRXhwZWN0YXRpb247XG4gIGUubm90ID0gYnVpbGQoKCkgPT4gYWN0dWFsLCB0cnVlLCBsYWJlbCwgZmFsc2UpO1xuICBjb25zdCBzZXR0bGUgPSAod2FudDogXCJyZXNvbHZlXCIgfCBcInJlamVjdFwiKSA9PiBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHYgPSBhd2FpdCAoYWN0dWFsIGFzIHVua25vd24gYXMgUHJvbWlzZTx1bmtub3duPik7XG4gICAgICBpZiAod2FudCA9PT0gXCJyZWplY3RcIikgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKHsgbWVzc2FnZTogYCR7bGFiZWwgPyBsYWJlbCArIFwiOiBcIiA6IFwiXCJ9ZXhwZWN0ZWQgYSByZWplY3Rpb24sIGdvdCAke3Nob3codil9YCB9KTtcbiAgICAgIHJldHVybiB2O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yICYmIHdhbnQgPT09IFwicmVqZWN0XCIpIHRocm93IGVycjtcbiAgICAgIGlmICh3YW50ID09PSBcInJlc29sdmVcIikgdGhyb3cgZXJyO1xuICAgICAgcmV0dXJuIGVycjtcbiAgICB9XG4gIH07XG4gIGUucmVzb2x2ZXMgPSBPYmplY3QuYXNzaWduKGJ1aWxkKHNldHRsZShcInJlc29sdmVcIiksIGZhbHNlLCBsYWJlbCwgdHJ1ZSksIHsgbm90OiBidWlsZChzZXR0bGUoXCJyZXNvbHZlXCIpLCB0cnVlLCBsYWJlbCwgdHJ1ZSkgfSk7XG4gIGUucmVqZWN0cyA9IE9iamVjdC5hc3NpZ24oYnVpbGQoc2V0dGxlKFwicmVqZWN0XCIpLCBmYWxzZSwgbGFiZWwsIHRydWUpLCB7IG5vdDogYnVpbGQoc2V0dGxlKFwicmVqZWN0XCIpLCB0cnVlLCBsYWJlbCwgdHJ1ZSkgfSk7XG4gIHJldHVybiBlO1xufVxuXG5jb25zdCBhc3ltbWV0cmljID0gKG5hbWU6IHN0cmluZywgdGVzdDogKHY6IHVua25vd24pID0+IGJvb2xlYW4pOiBBc3ltbWV0cmljID0+ICh7IGFzeW1tZXRyaWNNYXRjaDogdGVzdCwgdG9TdHJpbmc6ICgpID0+IG5hbWUgfSk7XG5cbmV4cGVjdC5jbG9zZVRvID0gKG46IG51bWJlciwgZGlnaXRzID0gMikgPT4gYXN5bW1ldHJpYyhgY2xvc2VUbygke259LCAke2RpZ2l0c30pYCwgKHYpID0+IHR5cGVvZiB2ID09PSBcIm51bWJlclwiICYmIE1hdGguYWJzKHYgLSBuKSA8IDEwICoqIC1kaWdpdHMgLyAyKTtcbmV4cGVjdC5vYmplY3RDb250YWluaW5nID0gKG86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiBhc3ltbWV0cmljKGBvYmplY3RDb250YWluaW5nKCR7c2hvdyhvKX0pYCwgKHYpID0+IGVxdWFscyh2LCBvLCB0cnVlKSk7XG5leHBlY3QuYXJyYXlDb250YWluaW5nID0gKHhzOiB1bmtub3duW10pID0+IGFzeW1tZXRyaWMoYGFycmF5Q29udGFpbmluZygke3Nob3coeHMpfSlgLCAodikgPT4gQXJyYXkuaXNBcnJheSh2KSAmJiB4cy5ldmVyeSgoeCkgPT4gdi5zb21lKCh5KSA9PiBlcXVhbHMoeSwgeCkpKSk7XG5leHBlY3Quc3RyaW5nQ29udGFpbmluZyA9IChzOiBzdHJpbmcpID0+IGFzeW1tZXRyaWMoYHN0cmluZ0NvbnRhaW5pbmcoJHtzaG93KHMpfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgdi5pbmNsdWRlcyhzKSk7XG5leHBlY3Quc3RyaW5nTWF0Y2hpbmcgPSAocmU6IFJlZ0V4cCB8IHN0cmluZykgPT4gYXN5bW1ldHJpYyhgc3RyaW5nTWF0Y2hpbmcoJHtTdHJpbmcocmUpfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgKHR5cGVvZiByZSA9PT0gXCJzdHJpbmdcIiA/IHYuaW5jbHVkZXMocmUpIDogcmUudGVzdCh2KSkpO1xuZXhwZWN0LmFueSA9IChjbHM6IHVua25vd24pID0+IGFzeW1tZXRyaWMoYGFueSgkeyhjbHMgYXMgeyBuYW1lPzogc3RyaW5nIH0pPy5uYW1lfSlgLCAodikgPT5cbiAgY2xzID09PSBTdHJpbmcgPyB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA6IGNscyA9PT0gTnVtYmVyID8gdHlwZW9mIHYgPT09IFwibnVtYmVyXCIgOiBjbHMgPT09IEJvb2xlYW4gPyB0eXBlb2YgdiA9PT0gXCJib29sZWFuXCIgOiBjbHMgPT09IEZ1bmN0aW9uID8gdHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIiA6IHYgaW5zdGFuY2VvZiAoY2xzIGFzIG5ldyAoKSA9PiB1bmtub3duKSk7XG5leHBlY3QuYW55dGhpbmcgPSAoKSA9PiBhc3ltbWV0cmljKFwiYW55dGhpbmcoKVwiLCAodikgPT4gdiAhPSBudWxsKTtcblxuIiwgImltcG9ydCB0eXBlIHsgTGlmdEtpbmQgfSBmcm9tIFwiLi91bml0c1wiO1xuXG5leHBvcnQgdHlwZSBNdXNjbGUgPVxuICB8IFwicXVhZHNcIiB8IFwiaGFtc3RyaW5nc1wiIHwgXCJnbHV0ZXNcIiB8IFwiY2hlc3RcIiB8IFwiYmFja1wiIHwgXCJsYXRzXCIgfCBcInNob3VsZGVyc1wiIHwgXCJ0cmljZXBzXCIgfCBcImJpY2Vwc1wiXG4gIHwgXCJjYWx2ZXNcIiB8IFwiYWJzXCIgfCBcInRyYXBzXCIgfCBcImZvcmVhcm1zXCIgfCBcImZ1bGxcIjtcblxuZXhwb3J0IGludGVyZmFjZSBMaWZ0RGVmIHtcbiAgbmFtZTogc3RyaW5nO1xuICBzaG9ydDogc3RyaW5nO1xuICBraW5kOiBMaWZ0S2luZDtcbiAgLyoqIEhldnkgZXhlcmNpc2UgdGl0bGVzIHRoYXQgY291bnQgYXMgdGhpcyBsaWZ0LCBmaXJzdCBtYXRjaCB3aW5zLiBPdmVycmlkYWJsZSBwZXIgdXNlci4gKi9cbiAgaGV2eTogc3RyaW5nW107XG4gIHVwcGVyOiBib29sZWFuO1xuICBtdXNjbGU6IE11c2NsZTtcbn1cblxuY29uc3QgTCA9IChuYW1lOiBzdHJpbmcsIHNob3J0OiBzdHJpbmcsIGtpbmQ6IExpZnRLaW5kLCBtdXNjbGU6IE11c2NsZSwgdXBwZXI6IGJvb2xlYW4sIC4uLmhldnk6IHN0cmluZ1tdKTogTGlmdERlZiA9PiAoeyBuYW1lLCBzaG9ydCwga2luZCwgbXVzY2xlLCB1cHBlciwgaGV2eSB9KTtcblxuLyoqXG4gKiBTaGFyZWQgbGlmdCBsaWJyYXJ5LiBQcm9ncmFtcyByZWZlcmVuY2UgbGlmdHMgYnkga2V5LiBUaXRsZXMgYXJlIGV4YWN0IEhldnkgZXhlcmNpc2UgbmFtZXNcbiAqIChmcm9tIEdFVCAvdjEvZXhlcmNpc2VfdGVtcGxhdGVzKS4gQWRkIG5ldyBvbmVzIGhlcmUuXG4gKi9cbmV4cG9ydCBjb25zdCBMSUZUUzogUmVjb3JkPHN0cmluZywgTGlmdERlZj4gPSB7XG4gIC8vIFx1MjUwMFx1MjUwMCBjb21wZXRpdGlvbiBsaWZ0cyBcdTI1MDBcdTI1MDBcbiAgc3F1YXQ6IEwoXCJCYWNrIFNxdWF0XCIsIFwiU1FVQVRcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiU3F1YXQgKEJhcmJlbGwpXCIsIFwiRnVsbCBTcXVhdFwiKSxcbiAgYmVuY2g6IEwoXCJCZW5jaCBQcmVzc1wiLCBcIkJFTkNIXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiQmVuY2ggUHJlc3MgKEJhcmJlbGwpXCIpLFxuICBkZWFkbGlmdDogTChcIkRlYWRsaWZ0XCIsIFwiREVBRExJRlRcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSwgXCJEZWFkbGlmdCAoQmFyYmVsbClcIiksXG4gIG9ocDogTChcIk92ZXJoZWFkIFByZXNzXCIsIFwiT0hQXCIsIFwiYmFyYmVsbFwiLCBcInNob3VsZGVyc1wiLCB0cnVlLCBcIk92ZXJoZWFkIFByZXNzIChCYXJiZWxsKVwiLCBcIlN0YW5kaW5nIE1pbGl0YXJ5IFByZXNzIChCYXJiZWxsKVwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgc3F1YXQgdmFyaWF0aW9ucyBcdTI1MDBcdTI1MDBcbiAgcGF1c2VTcXVhdDogTChcIlBhdXNlIFNxdWF0XCIsIFwiUEFVU0UgU1FcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiUGF1c2UgU3F1YXQgKEJhcmJlbGwpXCIsIFwiQmFyYmVsbCBTcXVhdCAoUGF1c2VkKVwiLCBcIkJhcmJlbGwgUGF1c2UgU3F1YXQgKHNsb3cgY29uY2VudHJpYyBhbmQgZWNjZW50cmljKVwiKSxcbiAgZnJvbnRTcXVhdDogTChcIkZyb250IFNxdWF0XCIsIFwiRlJPTlQgU1FcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiRnJvbnQgU3F1YXRcIiksXG4gIGJveFNxdWF0OiBMKFwiQm94IFNxdWF0XCIsIFwiQk9YIFNRXCIsIFwiYmFyYmVsbFwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkJveCBTcXVhdCAoQmFyYmVsbClcIiksXG4gIHBpblNxdWF0OiBMKFwiUGluIFNxdWF0XCIsIFwiUElOIFNRXCIsIFwiYmFyYmVsbFwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIlBpbiBTcXVhdFwiKSxcbiAgemVyY2hlclNxdWF0OiBMKFwiWmVyY2hlciBTcXVhdFwiLCBcIlpFUkNIRVJcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiWmVyY2hlciBTcXVhdFwiKSxcbiAgLy8gTm8gU1NCIGV4ZXJjaXNlIGluIEhldnkncyBjYXRhbG9nOyBtYXAgYSBjdXN0b20gZXhlcmNpc2UgaW4gU2V0dXAuXG4gIHNhZmV0eUJhclNxdWF0OiBMKFwiU2FmZXR5IEJhciBTcXVhdFwiLCBcIlNTQiBTUVwiLCBcImJhcmJlbGxcIiwgXCJxdWFkc1wiLCBmYWxzZSksXG4gIGhhY2tTcXVhdDogTChcIkhhY2sgU3F1YXRcIiwgXCJIQUNLIFNRXCIsIFwibWFjaGluZVwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkhhY2sgU3F1YXQgKE1hY2hpbmUpXCIsIFwiSGFjayBTcXVhdFwiKSxcbiAgbGVnUHJlc3M6IEwoXCJMZWcgUHJlc3NcIiwgXCJMRUcgUFJFU1NcIiwgXCJtYWNoaW5lXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiTGVnIFByZXNzIChNYWNoaW5lKVwiLCBcIkxlZyBQcmVzcyBIb3Jpem9udGFsIChNYWNoaW5lKVwiKSxcbiAgZ29ibGV0U3F1YXQ6IEwoXCJHb2JsZXQgU3F1YXRcIiwgXCJHT0JMRVRcIiwgXCJkdW1iYmVsbFwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkdvYmxldCBTcXVhdFwiKSxcbiAgYnVsZ2FyaWFuU3BsaXRTcXVhdDogTChcIkJ1bGdhcmlhbiBTcGxpdCBTcXVhdFwiLCBcIkJTU1wiLCBcImR1bWJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiQnVsZ2FyaWFuIFNwbGl0IFNxdWF0IChEdW1iYmVsbClcIiwgXCJCdWxnYXJpYW4gU3BsaXQgU3F1YXQgKEJhcmJlbGwpXCIpLFxuICBzcGxpdFNxdWF0OiBMKFwiU3BsaXQgU3F1YXRcIiwgXCJTUExJVCBTUVwiLCBcImR1bWJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiU3BsaXQgU3F1YXQgKER1bWJiZWxsKVwiKSxcbiAgbHVuZ2U6IEwoXCJMdW5nZVwiLCBcIkxVTkdFXCIsIFwiZHVtYmJlbGxcIiwgXCJxdWFkc1wiLCBmYWxzZSwgXCJMdW5nZSAoRHVtYmJlbGwpXCIsIFwiV2Fsa2luZyBMdW5nZSAoRHVtYmJlbGwpXCIsIFwiTHVuZ2UgKEJhcmJlbGwpXCIsIFwiTHVuZ2VcIiksXG4gIGxlZ0V4dGVuc2lvbjogTChcIkxlZyBFeHRlbnNpb25cIiwgXCJMRUcgRVhUXCIsIFwibWFjaGluZVwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkxlZyBFeHRlbnNpb24gKE1hY2hpbmUpXCIpLFxuICBwZW5kdWx1bVNxdWF0OiBMKFwiUGVuZHVsdW0gU3F1YXRcIiwgXCJQRU5EVUxVTVwiLCBcIm1hY2hpbmVcIiwgXCJxdWFkc1wiLCBmYWxzZSwgXCJQZW5kdWx1bSBTcXVhdCAoTWFjaGluZSlcIiksXG4gIGJlbHRTcXVhdDogTChcIkJlbHQgU3F1YXRcIiwgXCJCRUxUIFNRXCIsIFwibWFjaGluZVwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkJlbHQgU3F1YXQgKE1hY2hpbmUpXCIsIFwiQmVsdCBTcXVhdFwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgaGluZ2UgdmFyaWF0aW9ucyBcdTI1MDBcdTI1MDBcbiAgc3Vtb0RlYWRsaWZ0OiBMKFwiU3VtbyBEZWFkbGlmdFwiLCBcIlNVTU8gRExcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSwgXCJTdW1vIERlYWRsaWZ0XCIpLFxuICBkZWZpY2l0RGVhZGxpZnQ6IEwoXCJEZWZpY2l0IERlYWRsaWZ0XCIsIFwiREVGSUNJVCBETFwiLCBcImJhcmJlbGxcIiwgXCJiYWNrXCIsIGZhbHNlLCBcIkRlZmljaXQgRGVhZGxpZnQgKEJhcmJlbGwpXCIpLFxuICAvLyBObyBIZXZ5IGNhdGFsb2cgZW50cnkgZm9yIHRoZXNlOiBjcmVhdGUgYSBjdXN0b20gZXhlcmNpc2UgYW5kIG1hcCBpdCBpbiBTZXR1cC5cbiAgcGF1c2VEZWFkbGlmdDogTChcIlBhdXNlIERlYWRsaWZ0XCIsIFwiUEFVU0UgRExcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSksXG4gIHNuYXRjaEdyaXBEZWFkbGlmdDogTChcIlNuYXRjaC1HcmlwIERlYWRsaWZ0XCIsIFwiU0cgRExcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSksXG4gIHJhY2tQdWxsOiBMKFwiUmFjayBQdWxsXCIsIFwiUkFDSyBQVUxMXCIsIFwiYmFyYmVsbFwiLCBcImJhY2tcIiwgZmFsc2UsIFwiUmFjayBQdWxsXCIpLFxuICByZGw6IEwoXCJSb21hbmlhbiBEZWFkbGlmdFwiLCBcIlJETFwiLCBcImJhcmJlbGxcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIlJvbWFuaWFuIERlYWRsaWZ0IChCYXJiZWxsKVwiKSxcbiAgZGJSZGw6IEwoXCJEdW1iYmVsbCBSRExcIiwgXCJEQiBSRExcIiwgXCJkdW1iYmVsbFwiLCBcImhhbXN0cmluZ3NcIiwgZmFsc2UsIFwiUm9tYW5pYW4gRGVhZGxpZnQgKER1bWJiZWxsKVwiKSxcbiAgc3RpZmZMZWdEZWFkbGlmdDogTChcIlN0aWZmLUxlZyBEZWFkbGlmdFwiLCBcIlNMRExcIiwgXCJiYXJiZWxsXCIsIFwiaGFtc3RyaW5nc1wiLCBmYWxzZSwgXCJTdHJhaWdodCBMZWcgRGVhZGxpZnRcIiksXG4gIHRyYXBCYXJEZWFkbGlmdDogTChcIlRyYXAgQmFyIERlYWRsaWZ0XCIsIFwiVFJBUCBETFwiLCBcImJhcmJlbGxcIiwgXCJiYWNrXCIsIGZhbHNlLCBcIkRlYWRsaWZ0IChUcmFwIGJhcilcIiksXG4gIGdvb2RNb3JuaW5nOiBMKFwiR29vZCBNb3JuaW5nXCIsIFwiR09PRCBBTVwiLCBcImJhcmJlbGxcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIkdvb2QgTW9ybmluZyAoQmFyYmVsbClcIiksXG4gIGhpcFRocnVzdDogTChcIkhpcCBUaHJ1c3RcIiwgXCJISVAgVEhSVVNUXCIsIFwiYmFyYmVsbFwiLCBcImdsdXRlc1wiLCBmYWxzZSwgXCJIaXAgVGhydXN0IChCYXJiZWxsKVwiLCBcIkhpcCBUaHJ1c3QgKE1hY2hpbmUpXCIpLFxuICBsZWdDdXJsOiBMKFwiTGVnIEN1cmxcIiwgXCJMRUcgQ1VSTFwiLCBcIm1hY2hpbmVcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIkx5aW5nIExlZyBDdXJsIChNYWNoaW5lKVwiLCBcIlNlYXRlZCBMZWcgQ3VybCAoTWFjaGluZSlcIiwgXCJTdGFuZGluZyBMZWcgQ3VybHNcIiksXG4gIGdsdXRlSGFtUmFpc2U6IEwoXCJHbHV0ZSBIYW0gUmFpc2VcIiwgXCJHSFJcIiwgXCJib2R5d2VpZ2h0XCIsIFwiaGFtc3RyaW5nc1wiLCBmYWxzZSwgXCJHbHV0ZSBIYW0gUmFpc2VcIiwgXCJOb3JkaWMgSGFtc3RyaW5ncyBDdXJsc1wiKSxcbiAgYmFja0V4dGVuc2lvbjogTChcIkJhY2sgRXh0ZW5zaW9uXCIsIFwiQkFDSyBFWFRcIiwgXCJib2R5d2VpZ2h0XCIsIFwiYmFja1wiLCBmYWxzZSwgXCJCYWNrIEV4dGVuc2lvbiAoSHlwZXJleHRlbnNpb24pXCIsIFwiQmFjayBFeHRlbnNpb24gKFdlaWdodGVkIEh5cGVyZXh0ZW5zaW9uKVwiLCBcIkJhY2sgRXh0ZW5zaW9uIChNYWNoaW5lKVwiKSxcbiAgcmV2ZXJzZUh5cGVyOiBMKFwiUmV2ZXJzZSBIeXBlclwiLCBcIlJFViBIWVBFUlwiLCBcIm1hY2hpbmVcIiwgXCJnbHV0ZXNcIiwgZmFsc2UsIFwiUmV2ZXJzZSBIeXBlcmV4dGVuc2lvblwiKSxcbiAga2JTd2luZzogTChcIktldHRsZWJlbGwgU3dpbmdcIiwgXCJLQiBTV0lOR1wiLCBcImR1bWJiZWxsXCIsIFwiZ2x1dGVzXCIsIGZhbHNlLCBcIktldHRsZWJlbGwgU3dpbmdcIiksXG5cbiAgLy8gXHUyNTAwXHUyNTAwIHByZXNzaW5nIFx1MjUwMFx1MjUwMFxuICBwYXVzZUJlbmNoOiBMKFwiUGF1c2VkIEJlbmNoXCIsIFwiUEFVU0UgQlBcIiwgXCJiYXJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJQYXVzZWQgQmVuY2ggKDEgU2Vjb25kIFBhdXNlKVwiLCBcIkJhcmJlbGwgQmVuY2ggUHJlc3MgKExvbmcgUGF1c2UgLSAzIHNlY29uZHMpXCIpLFxuICBjZ0JlbmNoOiBMKFwiQ2xvc2UtR3JpcCBCZW5jaFwiLCBcIkNHIEJFTkNIXCIsIFwiYmFyYmVsbFwiLCBcInRyaWNlcHNcIiwgdHJ1ZSwgXCJCZW5jaCBQcmVzcyAtIENsb3NlIEdyaXAgKEJhcmJlbGwpXCIpLFxuICB3aWRlQmVuY2g6IEwoXCJXaWRlLUdyaXAgQmVuY2hcIiwgXCJXSURFIEJQXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiQmVuY2ggUHJlc3MgLSBXaWRlIEdyaXAgKEJhcmJlbGwpXCIpLFxuICBpbmNsaW5lQmVuY2g6IEwoXCJJbmNsaW5lIEJlbmNoIFByZXNzXCIsIFwiSU5DTElORVwiLCBcImJhcmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIkluY2xpbmUgQmVuY2ggUHJlc3MgKEJhcmJlbGwpXCIpLFxuICBkZWNsaW5lQmVuY2g6IEwoXCJEZWNsaW5lIEJlbmNoIFByZXNzXCIsIFwiREVDTElORVwiLCBcImJhcmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIkRlY2xpbmUgQmVuY2ggUHJlc3MgKEJhcmJlbGwpXCIpLFxuICBmZWV0VXBCZW5jaDogTChcIkZlZXQtVXAgQmVuY2hcIiwgXCJGRUVUIFVQXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiRmVldCBVcCBCZW5jaCBQcmVzcyAoQmFyYmVsbClcIiksXG4gIGZsb29yUHJlc3M6IEwoXCJGbG9vciBQcmVzc1wiLCBcIkZMT09SIFBSXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiRmxvb3IgUHJlc3MgKEJhcmJlbGwpXCIpLFxuICBzcG90b1ByZXNzOiBMKFwiU3BvdG8gUHJlc3NcIiwgXCJTUE9UT1wiLCBcImJhcmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlKSxcbiAgYm9hcmRQcmVzczogTChcIkJvYXJkIFByZXNzXCIsIFwiQk9BUkQgUFJcIiwgXCJiYXJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSksXG4gIHNsaW5nc2hvdEJlbmNoOiBMKFwiU2xpbmdzaG90IEJlbmNoXCIsIFwiU0xJTkdTSE9UXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUpLFxuICBkYkRlY2xpbmVCZW5jaDogTChcIkRlY2xpbmUgREIgUHJlc3NcIiwgXCJERUMgREJcIiwgXCJkdW1iYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiRGVjbGluZSBCZW5jaCBQcmVzcyAoRHVtYmJlbGwpXCIpLFxuICBwaW5QcmVzczogTChcIlBpbiBQcmVzc1wiLCBcIlBJTiBQUkVTU1wiLCBcImJhcmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIlBpbiBQcmVzc1wiKSxcbiAgZGJCZW5jaDogTChcIkR1bWJiZWxsIEJlbmNoIFByZXNzXCIsIFwiREIgQkVOQ0hcIiwgXCJkdW1iYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiQmVuY2ggUHJlc3MgKER1bWJiZWxsKVwiKSxcbiAgZGJJbmNsaW5lQmVuY2g6IEwoXCJJbmNsaW5lIERCIFByZXNzXCIsIFwiREIgSU5DTElORVwiLCBcImR1bWJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJJbmNsaW5lIEJlbmNoIFByZXNzIChEdW1iYmVsbClcIiksXG4gIG1hY2hpbmVDaGVzdFByZXNzOiBMKFwiQ2hlc3QgUHJlc3MgKE1hY2hpbmUpXCIsIFwiQ0hFU1QgUFJcIiwgXCJtYWNoaW5lXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJDaGVzdCBQcmVzcyAoTWFjaGluZSlcIiwgXCJJc28tTGF0ZXJhbCBDaGVzdCBQcmVzcyAoTWFjaGluZSlcIiwgXCJJbmNsaW5lIENoZXN0IFByZXNzIChNYWNoaW5lKVwiKSxcbiAgc21pdGhCZW5jaDogTChcIlNtaXRoIEJlbmNoXCIsIFwiU01JVEggQlBcIiwgXCJtYWNoaW5lXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJCZW5jaCBQcmVzcyAoU21pdGggTWFjaGluZSlcIiwgXCJJbmNsaW5lIEJlbmNoIFByZXNzIChTbWl0aCBNYWNoaW5lKVwiKSxcbiAgZGlwOiBMKFwiRGlwXCIsIFwiRElQXCIsIFwiYm9keXdlaWdodFwiLCBcImNoZXN0XCIsIHRydWUsIFwiQ2hlc3QgRGlwXCIsIFwiQ2hlc3QgRGlwIChXZWlnaHRlZClcIiwgXCJUcmljZXBzIERpcFwiLCBcIlRyaWNlcHMgRGlwIChXZWlnaHRlZClcIiwgXCJSaW5nIERpcHNcIiksXG4gIHB1c2hVcDogTChcIlB1c2ggVXBcIiwgXCJQVVNIIFVQXCIsIFwiYm9keXdlaWdodFwiLCBcImNoZXN0XCIsIHRydWUsIFwiUHVzaCBVcFwiLCBcIlB1c2ggVXAgKFdlaWdodGVkKVwiKSxcbiAgY2hlc3RGbHk6IEwoXCJDaGVzdCBGbHlcIiwgXCJGTFlcIiwgXCJkdW1iYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiQ2hlc3QgRmx5IChEdW1iYmVsbClcIiwgXCJDYWJsZSBGbHkgQ3Jvc3NvdmVyc1wiLCBcIkJ1dHRlcmZseSAoUGVjIERlY2spXCIsIFwiQ2hlc3QgRmx5IChNYWNoaW5lKVwiLCBcIlNlYXRlZCBDaGVzdCBGbHlzIChDYWJsZSlcIiwgXCJMb3cgQ2FibGUgRmx5IENyb3Nzb3ZlcnNcIiksXG4gIGluY2xpbmVGbHk6IEwoXCJJbmNsaW5lIEZseVwiLCBcIklOQyBGTFlcIiwgXCJkdW1iYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiSW5jbGluZSBDaGVzdCBGbHkgKER1bWJiZWxsKVwiKSxcbiAgcHVzaFByZXNzOiBMKFwiUHVzaCBQcmVzc1wiLCBcIlBVU0ggUFJFU1NcIiwgXCJiYXJiZWxsXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiUHVzaCBQcmVzc1wiKSxcbiAgc2VhdGVkT2hwOiBMKFwiU2VhdGVkIE92ZXJoZWFkIFByZXNzXCIsIFwiU0VBVEVEIE9IUFwiLCBcImJhcmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJTZWF0ZWQgT3ZlcmhlYWQgUHJlc3MgKEJhcmJlbGwpXCIpLFxuICBkYk9ocDogTChcIkR1bWJiZWxsIFNob3VsZGVyIFByZXNzXCIsIFwiREIgT0hQXCIsIFwiZHVtYmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJTaG91bGRlciBQcmVzcyAoRHVtYmJlbGwpXCIsIFwiU2VhdGVkIE92ZXJoZWFkIFByZXNzIChEdW1iYmVsbClcIiwgXCJPdmVyaGVhZCBQcmVzcyAoRHVtYmJlbGwpXCIpLFxuICBhcm5vbGRQcmVzczogTChcIkFybm9sZCBQcmVzc1wiLCBcIkFSTk9MRFwiLCBcImR1bWJiZWxsXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiQXJub2xkIFByZXNzIChEdW1iYmVsbClcIiksXG4gIG1hY2hpbmVTaG91bGRlclByZXNzOiBMKFwiU2hvdWxkZXIgUHJlc3MgKE1hY2hpbmUpXCIsIFwiTUFDSCBPSFBcIiwgXCJtYWNoaW5lXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiU2VhdGVkIFNob3VsZGVyIFByZXNzIChNYWNoaW5lKVwiLCBcIlNob3VsZGVyIFByZXNzIChNYWNoaW5lIFBsYXRlcylcIiksXG4gIGxhdGVyYWxSYWlzZTogTChcIkxhdGVyYWwgUmFpc2VcIiwgXCJMQVQgUkFJU0VcIiwgXCJkdW1iYmVsbFwiLCBcInNob3VsZGVyc1wiLCB0cnVlLCBcIkxhdGVyYWwgUmFpc2UgKER1bWJiZWxsKVwiLCBcIkxhdGVyYWwgUmFpc2UgKENhYmxlKVwiLCBcIkxhdGVyYWwgUmFpc2UgKE1hY2hpbmUpXCIsIFwiU2VhdGVkIExhdGVyYWwgUmFpc2UgKER1bWJiZWxsKVwiLCBcIlNpbmdsZSBBcm0gTGF0ZXJhbCBSYWlzZSAoQ2FibGUpXCIpLFxuICBmcm9udFJhaXNlOiBMKFwiRnJvbnQgUmFpc2VcIiwgXCJGUk9OVCBSQUlTRVwiLCBcImR1bWJiZWxsXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiRnJvbnQgUmFpc2UgKER1bWJiZWxsKVwiLCBcIkZyb250IFJhaXNlIChDYWJsZSlcIiwgXCJGcm9udCBSYWlzZSAoQmFyYmVsbClcIiksXG4gIHJlYXJEZWx0Rmx5OiBMKFwiUmVhciBEZWx0IEZseVwiLCBcIlJFQVIgREVMVFwiLCBcImR1bWJiZWxsXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiUmVhciBEZWx0IFJldmVyc2UgRmx5IChEdW1iYmVsbClcIiwgXCJSZWFyIERlbHQgUmV2ZXJzZSBGbHkgKENhYmxlKVwiLCBcIlJlYXIgRGVsdCBSZXZlcnNlIEZseSAoTWFjaGluZSlcIiwgXCJDaGVzdCBTdXBwb3J0ZWQgUmV2ZXJzZSBGbHkgKER1bWJiZWxsKVwiKSxcbiAgZmFjZVB1bGw6IEwoXCJGYWNlIFB1bGxcIiwgXCJGQUNFIFBVTExcIiwgXCJtYWNoaW5lXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiRmFjZSBQdWxsXCIpLFxuICBiYW5kUHVsbEFwYXJ0OiBMKFwiQmFuZCBQdWxsLUFwYXJ0XCIsIFwiUFVMTC1BUEFSVFwiLCBcImJvZHl3ZWlnaHRcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJCYW5kIFB1bGxhcGFydHNcIiksXG4gIHVwcmlnaHRSb3c6IEwoXCJVcHJpZ2h0IFJvd1wiLCBcIlVQUklHSFRcIiwgXCJiYXJiZWxsXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiVXByaWdodCBSb3cgKEJhcmJlbGwpXCIsIFwiVXByaWdodCBSb3cgKENhYmxlKVwiLCBcIlVwcmlnaHQgUm93IChEdW1iYmVsbClcIiksXG5cbiAgLy8gXHUyNTAwXHUyNTAwIHB1bGxpbmcgXHUyNTAwXHUyNTAwXG4gIHJvdzogTChcIkJhcmJlbGwgUm93XCIsIFwiQkIgUk9XXCIsIFwiYmFyYmVsbFwiLCBcImJhY2tcIiwgdHJ1ZSwgXCJCZW50IE92ZXIgUm93IChCYXJiZWxsKVwiKSxcbiAgcGVuZGxheVJvdzogTChcIlBlbmRsYXkgUm93XCIsIFwiUEVORExBWVwiLCBcImJhcmJlbGxcIiwgXCJiYWNrXCIsIHRydWUsIFwiUGVuZGxheSBSb3cgKEJhcmJlbGwpXCIpLFxuICBzZWFsUm93OiBMKFwiU2VhbCBSb3dcIiwgXCJTRUFMIFJPV1wiLCBcImJhcmJlbGxcIiwgXCJiYWNrXCIsIHRydWUsIFwiU2VhbCBSb3cgKEJhcmJlbGwpXCIsIFwiU2VhbCBSb3cgKER1bWJiZWxsKVwiKSxcbiAgdEJhclJvdzogTChcIlQtQmFyIFJvd1wiLCBcIlQtQkFSXCIsIFwibWFjaGluZVwiLCBcImJhY2tcIiwgdHJ1ZSwgXCJUIEJhciBSb3dcIiwgXCJDaGVzdCBTdXBwb3J0ZWQgVCBCYXIgUm93XCIsIFwiTGFuZG1pbmUgUm93XCIpLFxuICBkYlJvdzogTChcIkR1bWJiZWxsIFJvd1wiLCBcIkRCIFJPV1wiLCBcImR1bWJiZWxsXCIsIFwiYmFja1wiLCB0cnVlLCBcIkR1bWJiZWxsIFJvd1wiLCBcIkJlbnQgT3ZlciBSb3cgKER1bWJiZWxsKVwiKSxcbiAgY2hlc3RTdXBwb3J0ZWRSb3c6IEwoXCJDaGVzdC1TdXBwb3J0ZWQgUm93XCIsIFwiQ1MgUk9XXCIsIFwiZHVtYmJlbGxcIiwgXCJiYWNrXCIsIHRydWUsIFwiQ2hlc3QgU3VwcG9ydGVkIEluY2xpbmUgUm93IChEdW1iYmVsbClcIiwgXCJDaGVzdCBTdXBwb3J0ZWQgSW5jbGluZSBSb3dcIiksXG4gIGNhYmxlUm93OiBMKFwiU2VhdGVkIENhYmxlIFJvd1wiLCBcIkNBQkxFIFJPV1wiLCBcIm1hY2hpbmVcIiwgXCJiYWNrXCIsIHRydWUsIFwiU2VhdGVkIENhYmxlIFJvdyAtIFYgR3JpcCAoQ2FibGUpXCIsIFwiU2VhdGVkIENhYmxlIFJvdyAtIEJhciBHcmlwXCIsIFwiU2VhdGVkIENhYmxlIFJvdyAtIEJhciBXaWRlIEdyaXBcIiwgXCJTZWF0ZWQgUm93IChNYWNoaW5lKVwiLCBcIklzby1MYXRlcmFsIExvdyBSb3dcIiwgXCJJc28tTGF0ZXJhbCBSb3cgKE1hY2hpbmUpXCIpLFxuICBpbnZlcnRlZFJvdzogTChcIkludmVydGVkIFJvd1wiLCBcIklOViBST1dcIiwgXCJib2R5d2VpZ2h0XCIsIFwiYmFja1wiLCB0cnVlLCBcIkludmVydGVkIFJvd1wiKSxcbiAgbGF0UHVsbGRvd246IEwoXCJMYXQgUHVsbGRvd25cIiwgXCJMQVQgUERcIiwgXCJtYWNoaW5lXCIsIFwibGF0c1wiLCB0cnVlLCBcIkxhdCBQdWxsZG93biAoQ2FibGUpXCIsIFwiTGF0IFB1bGxkb3duIChNYWNoaW5lKVwiLCBcIkxhdCBQdWxsZG93biAtIENsb3NlIEdyaXAgKENhYmxlKVwiLCBcIlJldmVyc2UgR3JpcCBMYXQgUHVsbGRvd24gKENhYmxlKVwiKSxcbiAgcHVsbFVwOiBMKFwiUHVsbCBVcFwiLCBcIlBVTEwgVVBcIiwgXCJib2R5d2VpZ2h0XCIsIFwibGF0c1wiLCB0cnVlLCBcIlB1bGwgVXBcIiwgXCJQdWxsIFVwIChXZWlnaHRlZClcIiwgXCJXaWRlIFB1bGwgVXBcIiksXG4gIGNoaW5VcDogTChcIkNoaW4gVXBcIiwgXCJDSElOIFVQXCIsIFwiYm9keXdlaWdodFwiLCBcImxhdHNcIiwgdHJ1ZSwgXCJDaGluIFVwXCIsIFwiQ2hpbiBVcCAoV2VpZ2h0ZWQpXCIpLFxuICBzdHJhaWdodEFybVB1bGxkb3duOiBMKFwiU3RyYWlnaHQtQXJtIFB1bGxkb3duXCIsIFwiU0EgUFVMTEROXCIsIFwibWFjaGluZVwiLCBcImxhdHNcIiwgdHJ1ZSwgXCJTdHJhaWdodCBBcm0gTGF0IFB1bGxkb3duIChDYWJsZSlcIiwgXCJSb3BlIFN0cmFpZ2h0IEFybSBQdWxsZG93blwiKSxcbiAgcHVsbG92ZXI6IEwoXCJQdWxsb3ZlclwiLCBcIlBVTExPVkVSXCIsIFwiZHVtYmJlbGxcIiwgXCJsYXRzXCIsIHRydWUsIFwiUHVsbG92ZXIgKER1bWJiZWxsKVwiLCBcIlB1bGxvdmVyIChNYWNoaW5lKVwiKSxcbiAgc2hydWc6IEwoXCJTaHJ1Z1wiLCBcIlNIUlVHXCIsIFwiYmFyYmVsbFwiLCBcInRyYXBzXCIsIHRydWUsIFwiU2hydWcgKEJhcmJlbGwpXCIsIFwiU2hydWcgKER1bWJiZWxsKVwiLCBcIlNocnVnIChNYWNoaW5lKVwiLCBcIlNocnVnIChDYWJsZSlcIiksXG5cbiAgLy8gXHUyNTAwXHUyNTAwIGFybXMgXHUyNTAwXHUyNTAwXG4gIGJpY2VwQ3VybDogTChcIkJpY2VwIEN1cmxcIiwgXCJDVVJMXCIsIFwiZHVtYmJlbGxcIiwgXCJiaWNlcHNcIiwgdHJ1ZSwgXCJCaWNlcCBDdXJsIChEdW1iYmVsbClcIiwgXCJCaWNlcCBDdXJsIChDYWJsZSlcIiwgXCJCaWNlcCBDdXJsIChNYWNoaW5lKVwiKSxcbiAgYmFyYmVsbEN1cmw6IEwoXCJCYXJiZWxsIEN1cmxcIiwgXCJCQiBDVVJMXCIsIFwiYmFyYmVsbFwiLCBcImJpY2Vwc1wiLCB0cnVlLCBcIkJpY2VwIEN1cmwgKEJhcmJlbGwpXCIsIFwiRVogQmFyIEJpY2VwcyBDdXJsXCIpLFxuICBoYW1tZXJDdXJsOiBMKFwiSGFtbWVyIEN1cmxcIiwgXCJIQU1NRVJcIiwgXCJkdW1iYmVsbFwiLCBcImJpY2Vwc1wiLCB0cnVlLCBcIkhhbW1lciBDdXJsIChEdW1iYmVsbClcIiwgXCJIYW1tZXIgQ3VybCAoQ2FibGUpXCIsIFwiQ3Jvc3MgQm9keSBIYW1tZXIgQ3VybFwiKSxcbiAgcmV2ZXJzZUN1cmw6IEwoXCJSZXZlcnNlIEN1cmxcIiwgXCJSRVYgQ1VSTFwiLCBcImJhcmJlbGxcIiwgXCJiaWNlcHNcIiwgdHJ1ZSwgXCJSZXZlcnNlIEN1cmwgKEJhcmJlbGwpXCIsIFwiUmV2ZXJzZSBDdXJsIChEdW1iYmVsbClcIiwgXCJSZXZlcnNlIEN1cmwgKENhYmxlKVwiKSxcbiAgaW5jbGluZUN1cmw6IEwoXCJJbmNsaW5lIEN1cmxcIiwgXCJJTkMgQ1VSTFwiLCBcImR1bWJiZWxsXCIsIFwiYmljZXBzXCIsIHRydWUsIFwiU2VhdGVkIEluY2xpbmUgQ3VybCAoRHVtYmJlbGwpXCIpLFxuICBjb25jZW50cmF0aW9uQ3VybDogTChcIkNvbmNlbnRyYXRpb24gQ3VybFwiLCBcIkNPTkMgQ1VSTFwiLCBcImR1bWJiZWxsXCIsIFwiYmljZXBzXCIsIHRydWUsIFwiQ29uY2VudHJhdGlvbiBDdXJsXCIpLFxuICBzcGlkZXJDdXJsOiBMKFwiU3BpZGVyIEN1cmxcIiwgXCJTUElERVJcIiwgXCJkdW1iYmVsbFwiLCBcImJpY2Vwc1wiLCB0cnVlLCBcIlNwaWRlciBDdXJsIChEdW1iYmVsbClcIiwgXCJTcGlkZXIgQ3VybCAoQmFyYmVsbClcIiksXG4gIHByZWFjaGVyQ3VybDogTChcIlByZWFjaGVyIEN1cmxcIiwgXCJQUkVBQ0hFUlwiLCBcIm1hY2hpbmVcIiwgXCJiaWNlcHNcIiwgdHJ1ZSwgXCJQcmVhY2hlciBDdXJsIChNYWNoaW5lKVwiLCBcIlByZWFjaGVyIEN1cmwgKEJhcmJlbGwpXCIsIFwiUHJlYWNoZXIgQ3VybCAoRHVtYmJlbGwpXCIpLFxuICB0cmljZXBQdXNoZG93bjogTChcIlRyaWNlcHMgUHVzaGRvd25cIiwgXCJQVVNIRE9XTlwiLCBcIm1hY2hpbmVcIiwgXCJ0cmljZXBzXCIsIHRydWUsIFwiVHJpY2VwcyBQdXNoZG93blwiLCBcIlRyaWNlcHMgUm9wZSBQdXNoZG93blwiLCBcIlRyaWNlcHMgUHJlc3Nkb3duXCIsIFwiUmV2ZXJzZSBHcmlwIFRyaWNlcHMgUHVzaGRvd25cIiwgXCJTaW5nbGUgQXJtIFRyaWNlcHMgUHVzaGRvd24gKENhYmxlKVwiKSxcbiAgb3ZlcmhlYWRUcmljZXA6IEwoXCJPdmVyaGVhZCBUcmljZXBzIEV4dGVuc2lvblwiLCBcIk9IIFRSSSBFWFRcIiwgXCJtYWNoaW5lXCIsIFwidHJpY2Vwc1wiLCB0cnVlLCBcIk92ZXJoZWFkIFRyaWNlcHMgRXh0ZW5zaW9uIChDYWJsZSlcIiwgXCJUcmljZXBzIEV4dGVuc2lvbiAoRHVtYmJlbGwpXCIsIFwiVHJpY2VwcyBFeHRlbnNpb24gKENhYmxlKVwiLCBcIlRyaWNlcHMgRXh0ZW5zaW9uIChCYXJiZWxsKVwiKSxcbiAgdHJpY2VwS2lja2JhY2s6IEwoXCJUcmljZXBzIEtpY2tiYWNrXCIsIFwiS0lDS0JBQ0tcIiwgXCJkdW1iYmVsbFwiLCBcInRyaWNlcHNcIiwgdHJ1ZSwgXCJUcmljZXBzIEtpY2tiYWNrIChEdW1iYmVsbClcIiwgXCJUcmljZXBzIEtpY2tiYWNrIChDYWJsZSlcIiksXG4gIHNrdWxsY3J1c2hlcjogTChcIlNrdWxsY3J1c2hlclwiLCBcIlNLVUxMU1wiLCBcImJhcmJlbGxcIiwgXCJ0cmljZXBzXCIsIHRydWUsIFwiU2t1bGxjcnVzaGVyIChCYXJiZWxsKVwiLCBcIlNrdWxsY3J1c2hlciAoRHVtYmJlbGwpXCIpLFxuICBqbVByZXNzOiBMKFwiSk0gUHJlc3NcIiwgXCJKTSBQUkVTU1wiLCBcImJhcmJlbGxcIiwgXCJ0cmljZXBzXCIsIHRydWUsIFwiSk0gUHJlc3MgKEJhcmJlbGwpXCIpLFxuICB3cmlzdEN1cmw6IEwoXCJXcmlzdCBDdXJsXCIsIFwiV1JJU1QgQ1VSTFwiLCBcImJhcmJlbGxcIiwgXCJmb3JlYXJtc1wiLCB0cnVlLCBcIlNlYXRlZCBXcmlzdCBDdXJsIChCYXJiZWxsKVwiLCBcIlNlYXRlZCBQYWxtcyBVcCBXcmlzdCBDdXJsXCIsIFwiUmV2ZXJzZSBXcmlzdCBDdXJsIChEdW1iYmVsbClcIiksXG5cbiAgLy8gXHUyNTAwXHUyNTAwIGNhbHZlcyAvIGNvcmUgLyBtaXNjIFx1MjUwMFx1MjUwMFxuICBjYWxmUmFpc2U6IEwoXCJDYWxmIFJhaXNlXCIsIFwiQ0FMRlwiLCBcIm1hY2hpbmVcIiwgXCJjYWx2ZXNcIiwgZmFsc2UsIFwiU3RhbmRpbmcgQ2FsZiBSYWlzZSAoTWFjaGluZSlcIiwgXCJTdGFuZGluZyBDYWxmIFJhaXNlXCIsIFwiU3RhbmRpbmcgQ2FsZiBSYWlzZSAoQmFyYmVsbClcIiwgXCJTdGFuZGluZyBDYWxmIFJhaXNlIChTbWl0aClcIiwgXCJDYWxmIFByZXNzIChNYWNoaW5lKVwiLCBcIlN0YW5kaW5nIENhbGYgUmFpc2UgKER1bWJiZWxsKVwiKSxcbiAgc2VhdGVkQ2FsZlJhaXNlOiBMKFwiU2VhdGVkIENhbGYgUmFpc2VcIiwgXCJTRUFUIENBTEZcIiwgXCJtYWNoaW5lXCIsIFwiY2FsdmVzXCIsIGZhbHNlLCBcIlNlYXRlZCBDYWxmIFJhaXNlXCIpLFxuICBoYW5naW5nTGVnUmFpc2U6IEwoXCJIYW5naW5nIExlZyBSYWlzZVwiLCBcIkhMUlwiLCBcImJvZHl3ZWlnaHRcIiwgXCJhYnNcIiwgZmFsc2UsIFwiSGFuZ2luZyBMZWcgUmFpc2VcIiwgXCJIYW5naW5nIEtuZWUgUmFpc2VcIiwgXCJUb2VzIHRvIEJhclwiKSxcbiAgYWJXaGVlbDogTChcIkFiIFdoZWVsXCIsIFwiQUIgV0hFRUxcIiwgXCJib2R5d2VpZ2h0XCIsIFwiYWJzXCIsIGZhbHNlLCBcIkFiIFdoZWVsXCIpLFxuICBjYWJsZUNydW5jaDogTChcIkNhYmxlIENydW5jaFwiLCBcIkNBQkxFIENSXCIsIFwibWFjaGluZVwiLCBcImFic1wiLCBmYWxzZSwgXCJDYWJsZSBDcnVuY2hcIiwgXCJDcnVuY2ggKE1hY2hpbmUpXCIpLFxuICBiaXJkRG9nOiBMKFwiQmlyZCBEb2dcIiwgXCJCSVJEIERPR1wiLCBcImJvZHl3ZWlnaHRcIiwgXCJhYnNcIiwgZmFsc2UsIFwiQmlyZCBEb2dcIiksXG4gIHNpZGVQbGFuazogTChcIlNpZGUgUGxhbmtcIiwgXCJTSURFIFBMQU5LXCIsIFwiYm9keXdlaWdodFwiLCBcImFic1wiLCBmYWxzZSwgXCJTaWRlIFBsYW5rXCIpLFxuICBjcnVuY2g6IEwoXCJDcnVuY2hcIiwgXCJDUlVOQ0hcIiwgXCJib2R5d2VpZ2h0XCIsIFwiYWJzXCIsIGZhbHNlLCBcIkNydW5jaFwiLCBcIkNydW5jaCAoV2VpZ2h0ZWQpXCIsIFwiUmV2ZXJzZSBDcnVuY2hcIiwgXCJPYmxpcXVlIENydW5jaFwiLCBcIkRlY2xpbmUgQ3J1bmNoXCIpLFxuICBwbGFuazogTChcIlBsYW5rXCIsIFwiUExBTktcIiwgXCJib2R5d2VpZ2h0XCIsIFwiYWJzXCIsIGZhbHNlLCBcIlBsYW5rXCIpLFxuICBzaXRVcDogTChcIlNpdCBVcFwiLCBcIlNJVCBVUFwiLCBcImJvZHl3ZWlnaHRcIiwgXCJhYnNcIiwgZmFsc2UsIFwiU2l0IFVwXCIsIFwiU2l0IFVwIChXZWlnaHRlZClcIiwgXCJEZWNsaW5lIENydW5jaCAoV2VpZ2h0ZWQpXCIpLFxuICBmYXJtZXJzV2FsazogTChcIkZhcm1lcidzIFdhbGtcIiwgXCJGQVJNRVJTXCIsIFwiZHVtYmJlbGxcIiwgXCJmdWxsXCIsIGZhbHNlLCBcIkZhcm1lcnMgV2Fsa1wiKSxcbiAgcG93ZXJDbGVhbjogTChcIlBvd2VyIENsZWFuXCIsIFwiUFdSIENMRUFOXCIsIFwiYmFyYmVsbFwiLCBcImZ1bGxcIiwgZmFsc2UsIFwiUG93ZXIgQ2xlYW5cIiwgXCJIYW5nIENsZWFuXCIsIFwiQ2xlYW5cIiksXG59O1xuXG5leHBvcnQgY29uc3QgQklHX0ZPVVIgPSBbXCJzcXVhdFwiLCBcImJlbmNoXCIsIFwiZGVhZGxpZnRcIiwgXCJvaHBcIl0gYXMgY29uc3Q7XG5cbmV4cG9ydCBmdW5jdGlvbiBsaWZ0TmFtZShrZXk6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBMSUZUU1trZXldPy5uYW1lID8/IGtleTtcbn1cblxuLyoqXG4gKiBPdGhlciBhcHBzJyBuYW1lcyBmb3IgbGlicmFyeSBsaWZ0cyAoU3Ryb25nJ3MgY2F0YWxvZywgbW9zdGx5KSwgdXNlZCBvbmx5IHRvIHJlY29nbmlzZSBsb2dnZWRcbiAqIGV4ZXJjaXNlcy4gSGV2eSB0aXRsZXMgYWJvdmUgYWx3YXlzIHdpbjsgdGhlc2UgbmV2ZXIgZ28gdG8gSGV2eS5cbiAqL1xuZXhwb3J0IGNvbnN0IEFMSUFTRVM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHtcbiAgb2hwOiBbXCJTdHJpY3QgTWlsaXRhcnkgUHJlc3MgKEJhcmJlbGwpXCIsIFwiTWlsaXRhcnkgUHJlc3MgKEJhcmJlbGwpXCIsIFwiT3ZlcmhlYWQgUHJlc3MgKEJhcmJlbGwgLSBTdGFuZGluZylcIl0sXG4gIGZyb250U3F1YXQ6IFtcIkZyb250IFNxdWF0IChCYXJiZWxsKVwiXSxcbiAgc3Vtb0RlYWRsaWZ0OiBbXCJTdW1vIERlYWRsaWZ0IChCYXJiZWxsKVwiXSxcbiAgdHJhcEJhckRlYWRsaWZ0OiBbXCJUcmFwIEJhciBEZWFkbGlmdFwiLCBcIkRlYWRsaWZ0IChIZXggQmFyKVwiXSxcbiAgc3RpZmZMZWdEZWFkbGlmdDogW1wiU3RpZmYgTGVnIERlYWRsaWZ0IChCYXJiZWxsKVwiLCBcIlN0cmFpZ2h0IExlZyBEZWFkbGlmdCAoQmFyYmVsbClcIl0sXG4gIHJhY2tQdWxsOiBbXCJSYWNrIFB1bGwgKEJhcmJlbGwpXCJdLFxuICBwdXNoUHJlc3M6IFtcIlB1c2ggUHJlc3MgKEJhcmJlbGwpXCJdLFxuICBwb3dlckNsZWFuOiBbXCJQb3dlciBDbGVhbiAoQmFyYmVsbClcIiwgXCJIYW5nIENsZWFuIChCYXJiZWxsKVwiLCBcIkNsZWFuIChCYXJiZWxsKVwiXSxcbiAgY2dCZW5jaDogW1wiQ2xvc2UgR3JpcCBCZW5jaCBQcmVzcyAoQmFyYmVsbClcIiwgXCJDbG9zZS1HcmlwIEJlbmNoIFByZXNzIChCYXJiZWxsKVwiXSxcbiAgbGVnUHJlc3M6IFtcIkxlZyBQcmVzc1wiLCBcIkxlZyBQcmVzcyAoUGxhdGUgTG9hZGVkKVwiXSxcbiAgaGFja1NxdWF0OiBbXCJIYWNrIFNxdWF0IChQbGF0ZSBMb2FkZWQpXCJdLFxuICBidWxnYXJpYW5TcGxpdFNxdWF0OiBbXCJCdWxnYXJpYW4gU3BsaXQgU3F1YXRcIl0sXG4gIGdvYmxldFNxdWF0OiBbXCJHb2JsZXQgU3F1YXQgKEtldHRsZWJlbGwpXCIsIFwiR29ibGV0IFNxdWF0IChEdW1iYmVsbClcIl0sXG4gIGxlZ0N1cmw6IFtcIkxlZyBDdXJsIChNYWNoaW5lKVwiLCBcIkx5aW5nIExlZyBDdXJsXCIsIFwiU2VhdGVkIExlZyBDdXJsXCJdLFxuICBsZWdFeHRlbnNpb246IFtcIkxlZyBFeHRlbnNpb25cIl0sXG4gIGJhY2tFeHRlbnNpb246IFtcIkJhY2sgRXh0ZW5zaW9uXCIsIFwiQmFjayBFeHRlbnNpb24gKE1hY2hpbmUpXCIsIFwiSHlwZXJleHRlbnNpb25cIl0sXG4gIGNhYmxlUm93OiBbXCJTZWF0ZWQgQ2FibGUgUm93XCIsIFwiU2VhdGVkIFJvdyAoQ2FibGUpXCIsIFwiU2VhdGVkIFJvdyAoQ2FibGUgLSBXaWRlIEdyaXApXCIsIFwiU2VhdGVkIFJvdyAoQ2FibGUgLSBWIEdyaXApXCIsIFwiQ2FibGUgUm93XCJdLFxuICBkYlJvdzogW1wiQmVudCBPdmVyIE9uZSBBcm0gUm93IChEdW1iYmVsbClcIiwgXCJPbmUgQXJtIER1bWJiZWxsIFJvd1wiLCBcIlNpbmdsZSBBcm0gUm93IChEdW1iYmVsbClcIl0sXG4gIGludmVydGVkUm93OiBbXCJJbnZlcnRlZCBSb3cgKEJvZHl3ZWlnaHQpXCJdLFxuICBsYXRQdWxsZG93bjogW1wiTGF0IFB1bGxkb3duIC0gV2lkZSBHcmlwIChDYWJsZSlcIiwgXCJMYXQgUHVsbGRvd24gLSBVbmRlcmhhbmQgKENhYmxlKVwiLCBcIkxhdCBQdWxsZG93biAoU2luZ2xlIEFybSlcIl0sXG4gIHN0cmFpZ2h0QXJtUHVsbGRvd246IFtcIlN0cmFpZ2h0IEFybSBQdWxsZG93biAoQ2FibGUpXCIsIFwiU3RyYWlnaHQgQXJtIFB1bGxkb3duXCJdLFxuICBjaGVzdEZseTogW1wiQ2FibGUgQ3Jvc3NvdmVyXCIsIFwiUGVjIERlY2sgKE1hY2hpbmUpXCIsIFwiQ2hlc3QgRmx5IChDYWJsZSlcIl0sXG4gIHJlYXJEZWx0Rmx5OiBbXCJSZXZlcnNlIEZseSAoRHVtYmJlbGwpXCIsIFwiUmV2ZXJzZSBGbHkgKENhYmxlKVwiLCBcIlJldmVyc2UgRmx5IChNYWNoaW5lKVwiXSxcbiAgZmFjZVB1bGw6IFtcIkZhY2UgUHVsbCAoQ2FibGUpXCJdLFxuICBiYXJiZWxsQ3VybDogW1wiRVogQmFyIEN1cmxcIiwgXCJCaWNlcCBDdXJsIChFWiBCYXIpXCIsIFwiQ3VybCAoRVogQmFyKVwiXSxcbiAgY29uY2VudHJhdGlvbkN1cmw6IFtcIkNvbmNlbnRyYXRpb24gQ3VybCAoRHVtYmJlbGwpXCJdLFxuICBpbmNsaW5lQ3VybDogW1wiSW5jbGluZSBDdXJsIChEdW1iYmVsbClcIl0sXG4gIHRyaWNlcFB1c2hkb3duOiBbXCJUcmljZXBzIFB1c2hkb3duIChDYWJsZSAtIFN0cmFpZ2h0IEJhcilcIiwgXCJUcmljZXBzIFB1c2hkb3duIChDYWJsZSAtIFJvcGUpXCIsIFwiVHJpY2VwcyBQdXNoZG93biAoQ2FibGUpXCJdLFxuICBza3VsbGNydXNoZXI6IFtcIlNrdWxsY3J1c2hlciAoRVogQmFyKVwiLCBcIkx5aW5nIFRyaWNlcHMgRXh0ZW5zaW9uIChCYXJiZWxsKVwiXSxcbiAgY2FsZlJhaXNlOiBbXCJTdGFuZGluZyBDYWxmIFJhaXNlIChCb2R5d2VpZ2h0KVwiLCBcIkNhbGYgUHJlc3Mgb24gTGVnIFByZXNzXCIsIFwiQ2FsZiBSYWlzZSAoTWFjaGluZSlcIl0sXG4gIHNlYXRlZENhbGZSYWlzZTogW1wiU2VhdGVkIENhbGYgUmFpc2UgKE1hY2hpbmUpXCIsIFwiU2VhdGVkIENhbGYgUmFpc2UgKFBsYXRlIExvYWRlZClcIl0sXG4gIGhhbmdpbmdMZWdSYWlzZTogW1wiSGFuZ2luZyBLbmVlIFJhaXNlIChCb2R5d2VpZ2h0KVwiXSxcbiAga2JTd2luZzogW1wiS2V0dGxlYmVsbCBTd2luZyAoS2V0dGxlYmVsbClcIl0sXG4gIGZhcm1lcnNXYWxrOiBbXCJGYXJtZXIncyBXYWxrXCIsIFwiRmFybWVycyBXYWxrIChEdW1iYmVsbClcIl0sXG59O1xuXG4vLyBUaXRsZSBcdTIxOTIgbGlmdHMgdGhhdCBsaXN0IGl0IChIZXZ5IHRpdGxlcyBmaXJzdCwgdGhlbiBhbGlhc2VzKSwgYW5kIHBlci1tYXAgaW52ZXJ0ZWQgaW5kZXhlczsgY2FjaGVkLlxuY29uc3QgQllfVElUTEUgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XG5jb25zdCBhZGRUaXRsZSA9ICh0aXRsZTogc3RyaW5nLCBrZXk6IHN0cmluZykgPT4ge1xuICBjb25zdCB0ID0gdGl0bGUudG9Mb3dlckNhc2UoKSwgbCA9IEJZX1RJVExFLmdldCh0KSA/PyBbXTtcbiAgaWYgKCFsLmluY2x1ZGVzKGtleSkpIGwucHVzaChrZXkpO1xuICBCWV9USVRMRS5zZXQodCwgbCk7XG59O1xuZm9yIChjb25zdCBba2V5LCBkZWZdIG9mIE9iamVjdC5lbnRyaWVzKExJRlRTKSkgZm9yIChjb25zdCBoIG9mIGRlZi5oZXZ5KSBhZGRUaXRsZShoLCBrZXkpO1xuZm9yIChjb25zdCBba2V5LCBsaXN0XSBvZiBPYmplY3QuZW50cmllcyhBTElBU0VTKSkgZm9yIChjb25zdCBoIG9mIGxpc3QpIGFkZFRpdGxlKGgsIGtleSk7XG5jb25zdCBNQVBfSU5ERVggPSBuZXcgV2Vha01hcDxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBNYXA8c3RyaW5nLCBzdHJpbmc+PigpO1xuXG4vKiogVGVtcGxhdGUgaWQgSXJvbnRlcm0gdXNlcyBmb3IgYSBsaWJyYXJ5IGxpZnQgbG9nZ2VkIHdpdGhvdXQgSGV2eSAobG9jYWwgbW9kZSkuICovXG5leHBvcnQgY29uc3QgbG9jYWxUZW1wbGF0ZUlkID0gKGxpZnQ6IHN0cmluZykgPT4gYGxpZnQ6JHtsaWZ0fWA7XG5cbi8qKiBGaW5kIHdoaWNoIGxpZnQgKGlmIGFueSkgYSBsb2dnZWQgZXhlcmNpc2UgY291bnRzIGFzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoTGlmdCh0aXRsZTogc3RyaW5nLCB0ZW1wbGF0ZUlkOiBzdHJpbmcsIG1hcDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9KTogc3RyaW5nIHwgbnVsbCB7XG4gIGxldCBpbnYgPSBNQVBfSU5ERVguZ2V0KG1hcCk7XG4gIGlmICghaW52KSB7IGludiA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMobWFwKS5tYXAoKFtsaWZ0LCB0aWRdKSA9PiBbdGlkLCBsaWZ0XSkpOyBNQVBfSU5ERVguc2V0KG1hcCwgaW52KTsgfVxuICAvLyBleHBsaWNpdCBtYXBwaW5nIHdpbnMgb3ZlciB0aXRsZSBndWVzc2luZ1xuICBjb25zdCBtYXBwZWQgPSBpbnYuZ2V0KHRlbXBsYXRlSWQpO1xuICBpZiAobWFwcGVkKSByZXR1cm4gbWFwcGVkO1xuICBpZiAodGVtcGxhdGVJZC5zdGFydHNXaXRoKFwibGlmdDpcIikgJiYgTElGVFNbdGVtcGxhdGVJZC5zbGljZSg1KV0pIHJldHVybiB0ZW1wbGF0ZUlkLnNsaWNlKDUpO1xuICAvLyBmaXJzdCBsaWZ0IHdpdGggdGhpcyB0aXRsZSB0aGF0IGlzbid0IG1hcHBlZCB0byBhIGRpZmZlcmVudCB0ZW1wbGF0ZVxuICBmb3IgKGNvbnN0IGsgb2YgQllfVElUTEUuZ2V0KHRpdGxlLnRyaW0oKS50b0xvd2VyQ2FzZSgpKSA/PyBbXSkgaWYgKCFtYXBba10pIHJldHVybiBrO1xuICByZXR1cm4gbnVsbDtcbn1cbiIsICJleHBvcnQgdHlwZSBVbml0ID0gXCJrZ1wiIHwgXCJsYlwiO1xuXG5leHBvcnQgY29uc3QgTEJfUEVSX0tHID0gMi4yMDQ2MjI2MjE4NTtcblxuZXhwb3J0IGNvbnN0IGZyb21LZyA9IChrZzogbnVtYmVyLCB1bml0OiBVbml0KSA9PiAodW5pdCA9PT0gXCJrZ1wiID8ga2cgOiBrZyAqIExCX1BFUl9LRyk7XG5leHBvcnQgY29uc3QgdG9LZyA9ICh3OiBudW1iZXIsIHVuaXQ6IFVuaXQpID0+ICh1bml0ID09PSBcImtnXCIgPyB3IDogdyAvIExCX1BFUl9LRyk7XG5cbmV4cG9ydCBjb25zdCByb3VuZFRvID0gKHc6IG51bWJlciwgc3RlcDogbnVtYmVyKSA9PiBNYXRoLnJvdW5kKHcgLyBzdGVwKSAqIHN0ZXA7XG5cbi8qKiBTbWFsbGVzdCBqdW1wIHlvdSBjYW4gbG9hZC4gTWF0Y2hlcyB0aGUgc2hlZXQncyBcIk1pY3JvcGxhdGVzPyBOb1wiIGRlZmF1bHQuICovXG5leHBvcnQgZnVuY3Rpb24gbG9hZFN0ZXAoa2luZDogTGlmdEtpbmQsIHVuaXQ6IFVuaXQsIG1pY3JvID0gZmFsc2UpOiBudW1iZXIge1xuICBpZiAoa2luZCA9PT0gXCJkdW1iYmVsbFwiKSByZXR1cm4gdW5pdCA9PT0gXCJsYlwiID8gNSA6IDI7XG4gIGlmIChraW5kID09PSBcIm1hY2hpbmVcIikgcmV0dXJuIHVuaXQgPT09IFwibGJcIiA/IDIuNSA6IDIuNTtcbiAgcmV0dXJuIHVuaXQgPT09IFwibGJcIiA/IChtaWNybyA/IDIuNSA6IDUpIDogbWljcm8gPyAxLjI1IDogMi41O1xufVxuXG5leHBvcnQgdHlwZSBMaWZ0S2luZCA9IFwiYmFyYmVsbFwiIHwgXCJkdW1iYmVsbFwiIHwgXCJtYWNoaW5lXCIgfCBcImJvZHl3ZWlnaHRcIjtcblxuLyoqIFwiMTQyLjVcIiAvIFwiMTg1XCIgXHUyMDE0IHRyaW1zIGZsb2F0IG5vaXNlIGFuZCB0cmFpbGluZyB6ZXJvcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmbXQodzogbnVtYmVyLCBkaWdpdHMgPSAxKTogc3RyaW5nIHtcbiAgY29uc3QgciA9IE1hdGgucm91bmQodyAqIDEwICoqIGRpZ2l0cykgLyAxMCAqKiBkaWdpdHM7XG4gIHJldHVybiBOdW1iZXIuaXNJbnRlZ2VyKHIpID8gU3RyaW5nKHIpIDogci50b0ZpeGVkKGRpZ2l0cykucmVwbGFjZSgvMCskLywgXCJcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmbXRJbnQobjogbnVtYmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIE1hdGgucm91bmQobikudG9Mb2NhbGVTdHJpbmcoXCJlbi1VU1wiKTtcbn1cblxuLyoqIFBsYXRlcyBwZXIgc2lkZSBmb3IgYSBiYXJiZWxsIGxvYWQuICovXG5leHBvcnQgZnVuY3Rpb24gcGxhdGVzKHRvdGFsOiBudW1iZXIsIHVuaXQ6IFVuaXQsIGJhciA9IHVuaXQgPT09IFwibGJcIiA/IDQ1IDogMjApOiBudW1iZXJbXSB7XG4gIGNvbnN0IGF2YWlsID0gdW5pdCA9PT0gXCJsYlwiID8gWzQ1LCAzNSwgMjUsIDEwLCA1LCAyLjVdIDogWzI1LCAyMCwgMTUsIDEwLCA1LCAyLjUsIDEuMjVdO1xuICBsZXQgc2lkZSA9ICh0b3RhbCAtIGJhcikgLyAyO1xuICBjb25zdCBvdXQ6IG51bWJlcltdID0gW107XG4gIGlmIChzaWRlIDw9IDApIHJldHVybiBvdXQ7XG4gIGZvciAoY29uc3QgcCBvZiBhdmFpbCkge1xuICAgIHdoaWxlIChzaWRlID49IHAgLSAxZS02KSB7XG4gICAgICBvdXQucHVzaChwKTtcbiAgICAgIHNpZGUgLT0gcDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cbiIsICIvLyBHZW5lcmljIHByb2dyYW0gZW5naW5lLlxuLy9cbi8vIEEgcHJvZ3JhbSBpcyBwdXJlIGRhdGEgKFByb2dyYW1EZWYpOiBhIHJvdGF0aW9uIG9mIGRheXMsIGVhY2ggd2l0aCBzbG90cywgYW5kIGVhY2ggc2xvdCBoYXMgYVxuLy8gcHJvZ3Jlc3Npb24gcnVsZS4gVGhlIGVuZ2luZSBuZXZlciBzdG9yZXMgXCJjdXJyZW50IHdlaWdodHNcIi4gSXQgcmVwbGF5cyB5b3VyIEhldnkgaGlzdG9yeVxuLy8gYWdhaW5zdCB0aGUgcHJvZ3JhbSBmcm9tIGl0cyBzdGFydCBkYXRlLCBzbyBlZGl0aW5nIG9yIGRlbGV0aW5nIGEgd29ya291dCBpbiBIZXZ5IGp1c3Rcbi8vIGNoYW5nZXMgdGhlIHJlcGxheS4gQWRkaW5nIGEgbmV3IHNwcmVhZHNoZWV0IHByb2dyYW0gbWVhbnMgd3JpdGluZyBvbmUgUHJvZ3JhbVRlbXBsYXRlXG4vLyAoc2VlIHByb2dyYW1zLyoudHMgYW5kIFJFQURNRSBcIlByb2dyYW1zXCIpLlxuLy9cbi8vIFByb2dyZXNzaW9uIGtpbmRzOlxuLy8gICBzdGFnZXMgICBsaW5lYXIgcHJvZ3Jlc3Npb24gdGhyb3VnaCByZXAgc2NoZW1lcyAoR1pDTFAsIFN0cm9uZ0xpZnRzLCBTdGFydGluZyBTdHJlbmd0aCxcbi8vICAgICAgICAgICAgR3JleVNrdWxsXHUyMDI2KTogYWRkIHdlaWdodCBvbiBzdWNjZXNzLCBzdGVwIGRvd24gYSBzdGFnZSAvIGRlbG9hZCAvIHJldGVzdCBvbiBmYWlsdXJlLlxuLy8gICBwZXJjZW50ICBzZXRzIGFzICUgb2YgYSB0cmFpbmluZyBtYXggKG9yIFJQRSB0YXJnZXRzKSwgb3B0aW9uYWxseSBhIGRpZmZlcmVudCB0YWJsZSBwZXJcbi8vICAgICAgICAgICAgd2VlayAoNS8zLzEsIENhbmRpdG8sIFNtb2xvdiwgU2hlaWtvLCBKdWdnZXJuYXV0XHUyMDI2KTsgVE0gY2FuIG1vdmUgZnJvbSBBTVJBUCByZXN1bHRzLlxuLy8gICBkb3VibGUgICBkb3VibGUgcHJvZ3Jlc3Npb24gaW4gYSByZXAgcmFuZ2UgKDNcdTAwRDc4XHUyMDEzMTIpOiBhZGQgd2VpZ2h0IG9uY2UgZXZlcnkgc2V0IGhpdHMgdGhlIHRvcC5cbi8vICAgZml4ZWQgICAgbm8gcHJvZ3Jlc3Npb24gKGFjY2Vzc29yaWVzIC8gYm9keXdlaWdodCk7IGp1c3Qgc2hvd3Mgd2hhdCB5b3UgZGlkIGxhc3QgdGltZS5cblxuaW1wb3J0IHR5cGUgeyBIZXZ5V29ya291dCB9IGZyb20gXCIuL2hldnlcIjtcbmltcG9ydCB7IExJRlRTLCBtYXRjaExpZnQgfSBmcm9tIFwiLi9saWZ0c1wiO1xuaW1wb3J0IHsgZm10LCBmcm9tS2csIGxvYWRTdGVwLCByb3VuZFRvLCB0eXBlIFVuaXQgfSBmcm9tIFwiLi91bml0c1wiO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgZGVmaW5pdGlvbnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCB0eXBlIFRpZXIgPSBcIlQxXCIgfCBcIlQyXCIgfCBcIlQzXCIgfCBcIk1BSU5cIiB8IFwiU1VQUFwiIHwgXCJBQ0NcIjtcblxuZXhwb3J0IGludGVyZmFjZSBXZWlnaHRzIHtcbiAgbGI6IG51bWJlcjtcbiAga2c6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTdGFnZSB7XG4gIHNldHM6IG51bWJlcjtcbiAgcmVwczogbnVtYmVyO1xuICAvKiogbGFzdCBzZXQgaXMgXCJhcyBtYW55IHJlcHMgYXMgcG9zc2libGVcIiAqL1xuICBhbXJhcDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQZXJjZW50U2V0IHtcbiAgLyoqIGZyYWN0aW9uIG9mIHRoZSB0cmFpbmluZyBtYXggKDAuODUpLiBPbWl0IGZvciBSUEUtb25seSBzZXRzIFx1MjAxNCB0aGUgbGlmdGVyIHBpY2tzIHRoZSBsb2FkLiAqL1xuICBwY3Q/OiBudW1iZXI7XG4gIC8qKiB0YXJnZXQgUlBFIChlLmcuIDgpIFx1MjAxNCBzaG93biBhbG9uZ3NpZGUgb3IgaW5zdGVhZCBvZiBhIGxvYWQgKi9cbiAgcnBlPzogbnVtYmVyO1xuICByZXBzOiBudW1iZXI7XG4gIC8qKiB0b3Agb2YgYSByZXAgcmFuZ2UgKDhcdTIwMTMxMikgKi9cbiAgcmVwc01heD86IG51bWJlcjtcbiAgYW1yYXA/OiBib29sZWFuO1xuICAvKiogQU1SQVAgcmVwIHRhcmdldCwgZm9yIGFtcmFwVnNUYXJnZXQgVE0gcnVsZXMgKFNCUywgSnVnZ2VybmF1dCkgKi9cbiAgdGFyZ2V0PzogbnVtYmVyO1xuICAvKiogZml4ZWQgbG9hZCBhZGRlZCBvbiB0b3Agb2YgdGhlIHBlcmNlbnRhZ2UgKFNtb2xvdiBKciB3ZWVrcyAyXHUyMDEzMzogNzAlICsgMTAgbGIpICovXG4gIGFkZD86IFdlaWdodHM7XG4gIC8qKiBgcGN0YCBpcyBvZiB0aGUgZTFSTSBvZiB0b2RheSdzIHRvcCBzZXQgb2YgdGhpcyBleGVyY2lzZSAoYmFjay1vZmZzIGFmdGVyIGFuIFJQRSB0b3Agc2luZ2xlKS4gKi9cbiAgb2ZUb3A/OiBib29sZWFuO1xufVxuXG5leHBvcnQgdHlwZSBUbVJ1bGUgPVxuICAvKiogblN1bnM6IHJlcHMgb24gb25lIEFNUkFQIHNldCBcdTIxOTIgbnVtYmVyIG9mIFRNIGluY3JlbWVudHMgKHJvd3M6IHJlcHMgXHUyMjY1IG1pblJlcHMpICovXG4gIHwgeyB0eXBlOiBcImFtcmFwVGFibGVcIjsgc2V0SW5kZXg6IG51bWJlcjsgdGFibGU6IHsgbWluUmVwczogbnVtYmVyOyBpbmNyZW1lbnRzOiBudW1iZXIgfVtdOyBhcHBseUF0PzogXCJub3dcIiB8IFwid2Vla0VuZFwiOyB1c2VMYXN0PzogYm9vbGVhbjtcbiAgICAgIC8qKiBuU3VucyA0LWRheTogdGhlIGJlbmNoIDErIHNldCBhbHNvIG1vdmVzIHRoZSBwcmVzcyBUTSBieSB0aGUgc2FtZSBudW1iZXIgb2YgaW5jcmVtZW50cyAqL1xuICAgICAgYWxzb0xpZnRzPzogc3RyaW5nW10gfVxuICAvKiogU0JTIC8gSnVnZ2VybmF1dDogcmVwcyBiZXlvbmQgKG9yIHNob3J0IG9mKSB0aGUgc2V0J3MgdGFyZ2V0IFx1MjE5MiBUTSBjaGFuZ2UuIFRoZSBsYXN0IHJvd1xuICAgKiAgd2l0aCBkaWZmIFx1MjI2NCAocmVwcyBcdTIyMTIgdGFyZ2V0KSBhcHBsaWVzLiBwY3QgPSBmcmFjdGlvbiBvZiBUTTsgaW5jcmVtZW50cyA9IFx1MDBENyB0bUluY3JlbWVudC4gKi9cbiAgfCB7IHR5cGU6IFwiYW1yYXBWc1RhcmdldFwiOyBzZXRJbmRleDogbnVtYmVyOyB0YWJsZTogeyBkaWZmOiBudW1iZXI7IHBjdD86IG51bWJlcjsgaW5jcmVtZW50cz86IG51bWJlciB9W107IGFsbFNldHM/OiBib29sZWFuOyBhcHBseUF0PzogXCJub3dcIiB8IFwid2Vla0VuZFwiO1xuICAgICAgLyoqIFNCUzogYSBwbGFubmVkIHNldCBhdCB0aGUgdGFyZ2V0IHdlaWdodCB0aGF0IHdhcyBza2lwcGVkLCBvciBkb25lIGZvciBmZXdlciB0aGFuIGl0cyBwbGFubmVkXG4gICAgICAgKiAgcmVwcywgY291bnRzIGFzIFwiZmFpbGVkIHRvIGNvbXBsZXRlIHRoZSBzZXRzXCI6IGRpZmYgYmVjb21lcyBhdCBtb3N0IFx1MjIxMjEgXHUyMjEyIChzZXRzIHNob3J0KS4gKi9cbiAgICAgIHBlbmFsaXplTWlzc2luZ1NldHM/OiBib29sZWFuO1xuICAgICAgLyoqIFNCUyBMYXN0IFNldCBSSVI6IHRoZSB0YXJnZXQgc2V0J3MgYHJwZWAgaXMgdGhlIFJJUiB0YXJnZXQgKDEwIFx1MjIxMiBSSVIpLiBFZmZlY3RpdmUgUklSID0gcmVwcyBwYXN0XG4gICAgICAgKiAgdGhlIHBsYW5uZWQgbnVtYmVyICsgKDEwIFx1MjIxMiBsb2dnZWQgUlBFIG9mIHRoYXQgc2V0LCBpZiBhbnkpOyBkaWZmID0gZWZmZWN0aXZlIFx1MjIxMiB0YXJnZXQgUklSLCBhbmRcbiAgICAgICAqICBhbnkgc2hvcnRmYWxsIGNvdW50cyBhcyBcdTIyMTIxIChcImNvbXBsZXRlZCB0aGUgc2V0cywgUklSIGJlbG93IHRhcmdldFwiKS4gKi9cbiAgICAgIHJpcj86IGJvb2xlYW47XG4gICAgICAvKiogcmVhZCB0aGUgbGFzdCBzZXQgZG9uZSBhdCB0aGUgdGFyZ2V0IHdlaWdodCAodGhlIEFNUkFQIGl0c2VsZikgaW5zdGVhZCBvZiB0aGUgYmVzdCBvbmUgKi9cbiAgICAgIHVzZUxhc3Q/OiBib29sZWFuIH1cbiAgLyoqIFJUUy1zdHlsZTogbmV3IFRNID0gZTFSTSBvZiB0aGF0IHNldCBcdTAwRDcgcGN0ICovXG4gIHwgeyB0eXBlOiBcImUxcm1cIjsgc2V0SW5kZXg6IG51bWJlcjsgcGN0OiBudW1iZXIgfVxuICAvKiogR1pDTCBWRElQOiB0b3RhbCByZXBzIGFjcm9zcyB0aGUgc2V0cyBkb25lIGF0IHRoZSBwcmVzY3JpYmVkIHdlaWdodCBcdTIxOTIgVE0gY2hhbmdlIChyb3dzOiB0b3RhbCBcdTIyNjUgbWluUmVwcykgKi9cbiAgfCB7IHR5cGU6IFwidG90YWxSZXBzXCI7IHRhYmxlOiB7IG1pblJlcHM6IG51bWJlcjsgaW5jcmVtZW50cz86IG51bWJlcjsgcGN0PzogbnVtYmVyIH1bXTsgYXBwbHlBdD86IFwibm93XCIgfCBcIndlZWtFbmRcIiB9XG4gIC8qKiBDYW5kaXRvOiBhbnkgcHJlc2NyaWJlZCBzZXQgdGhhdCBmYWxscyBzaG9ydCBvZiBpdHMgcmVwcyBjdXRzIHRoZSBtYXggYnkgcGN0ICovXG4gIHwgeyB0eXBlOiBcIm1pc3NDdXRcIjsgcGN0OiBudW1iZXI7IHNldEluZGV4PzogbnVtYmVyIH07XG5cbmV4cG9ydCB0eXBlIFByb2dyZXNzaW9uID1cbiAgfCB7XG4gICAgICBraW5kOiBcInN0YWdlc1wiO1xuICAgICAgc3RhZ2VzOiBTdGFnZVtdO1xuICAgICAgLyoqIEhvdyBhIHNlc3Npb24gY291bnRzIGFzIGEgc3VjY2Vzcy4gKi9cbiAgICAgIGFkdmFuY2U6IHsgdHlwZTogXCJiYXNlVm9sdW1lXCIgfSB8IHsgdHlwZTogXCJhbXJhcEF0TGVhc3RcIjsgcmVwczogbnVtYmVyIH07XG4gICAgICAvKiogV2hhdCBoYXBwZW5zIHdoZW4gdGhlIGxhc3Qgc3RhZ2UgZmFpbHMuICovXG4gICAgICBvbkZpbmFsRmFpbDpcbiAgICAgICAgfCB7IHR5cGU6IFwicmV0ZXN0XCI7IHJtUmVwczogbnVtYmVyOyBwY3Q6IG51bWJlciB9XG4gICAgICAgIHwgeyB0eXBlOiBcInJlc2V0XCI7IGJ1bXBJbmNyZW1lbnRzOiBudW1iZXIgfVxuICAgICAgICB8IHsgdHlwZTogXCJkZWxvYWRcIjsgcGN0OiBudW1iZXIgfVxuICAgICAgICB8IHsgdHlwZTogXCJkZWxvYWRCeVwiOyBhbW91bnQ6IFdlaWdodHMgfVxuICAgICAgICB8IHsgdHlwZTogXCJob2xkXCIgfTtcbiAgICAgIGluY3JlbWVudDogV2VpZ2h0cztcbiAgICAgIC8qKiBDb25zZWN1dGl2ZSBmYWlsZWQgc2Vzc2lvbnMgYmVmb3JlIHN0ZXBwaW5nIGRvd24gLyBkZWxvYWRpbmcgKFN0cm9uZ0xpZnRzOiAzKS4gRGVmYXVsdCAxLiAqL1xuICAgICAgZmFpbHNCZWZvcmVBY3Rpb24/OiBudW1iZXI7XG4gICAgICAvKiogR3JleVNrdWxsOiBBTVJBUCBvZiBhdCBsZWFzdCBgcmVwc2Agb24gdGhlIGxhc3Qgc2V0IGVhcm5zIGBpbmNyZW1lbnRzYCBqdW1wcyBpbnN0ZWFkIG9mIG9uZS4gKi9cbiAgICAgIGFtcmFwQm9udXM/OiB7IHJlcHM6IG51bWJlcjsgaW5jcmVtZW50czogbnVtYmVyIH07XG4gICAgICAvKiogU0JTIE5vdmljZSBIeXBlcnRyb3BoeSAoc2V0cyBcdTIxOTIgcmVwcyBcdTIxOTIgbG9hZCk6IHN1Y2Nlc3MgbW92ZXMgdG8gdGhlIE5FWFQgc3RhZ2UgYXQgdGhlIHNhbWVcbiAgICAgICAqICB3ZWlnaHQ7IHN1Y2Nlc3Mgb24gdGhlIGxhc3Qgc3RhZ2UgYWRkcyBgbG9hZFBjdGAgYW5kIGdvZXMgYmFjayB0byBzdGFnZSAwLiBBIG1pc3MgcmVwZWF0c1xuICAgICAgICogIHRoZSBzYW1lIHN0YWdlIChmYWlsdXJlIG9wdGlvbnMgYXJlIGlnbm9yZWQpLiBsb2FkUGN0IDAgb3IgMCBsb2FkIChib2R5d2VpZ2h0KTogdGhlIGxhc3Qgc3RhZ2UgaG9sZHMuICovXG4gICAgICBjbGltYj86IHsgbG9hZFBjdDogbnVtYmVyIH07XG4gICAgfVxuICB8IHtcbiAgICAgIGtpbmQ6IFwicGVyY2VudFwiO1xuICAgICAgLyoqIFdob3NlIHRyYWluaW5nIG1heCB0aGUgcGVyY2VudGFnZXMgYXJlIG9mLiAqL1xuICAgICAgdG1MaWZ0OiBzdHJpbmc7XG4gICAgICAvKiogT25lIHRhYmxlIHBlciBwcm9ncmFtIHdlZWsgKGN5Y2xlZCwgb3IgYnkgd2VlayBmb3IgZmluaXRlIGJsb2NrcykuIE9uZSB0YWJsZSA9IGV2ZXJ5IHdlZWsuICovXG4gICAgICB3ZWVrczogUGVyY2VudFNldFtdW107XG4gICAgICB0bVJ1bGU/OiBUbVJ1bGU7XG4gICAgfVxuICB8IHtcbiAgICAgIGtpbmQ6IFwiZG91YmxlXCI7XG4gICAgICBzZXRzOiBudW1iZXI7XG4gICAgICByZXBzOiBbbnVtYmVyLCBudW1iZXJdO1xuICAgICAgaW5jcmVtZW50OiBXZWlnaHRzO1xuICAgICAgLyoqIGxhc3Qgc2V0IEFNUkFQIChlLmcuIFJlZGRpdCBQUEwgXCIzXHUwMEQ3OFx1MjAxMzEyLCBsYXN0IHNldCBBTVJBUFwiKSAqL1xuICAgICAgYW1yYXBMYXN0PzogYm9vbGVhbjtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJmaXhlZFwiO1xuICAgICAgc2V0czogbnVtYmVyO1xuICAgICAgcmVwczogbnVtYmVyO1xuICAgICAgcmVwc01heD86IG51bWJlcjtcbiAgICAgIGFtcmFwTGFzdD86IGJvb2xlYW47XG4gICAgICAvKiogXCI2MHNcIiwgXCJ0byBmYWlsdXJlXCIsIFwiYm9keXdlaWdodFwiXHUyMDI2ICovXG4gICAgICBub3RlPzogc3RyaW5nO1xuICAgIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2xvdERlZiB7XG4gIGlkOiBzdHJpbmc7XG4gIGxpZnQ6IHN0cmluZztcbiAgdGllcjogVGllcjtcbiAgcHJvZ3Jlc3Npb246IFByb2dyZXNzaW9uO1xuICByZXN0U2Vjb25kcz86IG51bWJlcjtcbiAgbm90ZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEYXlEZWYge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIHNsb3RzOiBTbG90RGVmW107XG4gIC8qKiBQcm9ncmFtIHdlZWtzICgwLWJhc2VkKSB0aGlzIGRheSBpcyBzY2hlZHVsZWQgaW4uIE9taXQgPSBldmVyeSB3ZWVrLiAqL1xuICB3ZWVrcz86IG51bWJlcltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2dyYW1EZWYge1xuICB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgZGF5czogRGF5RGVmW107XG4gIC8qKiBTZXNzaW9ucyBwZXIgY2FsZW5kYXIgd2VlaywgZm9yIGRpc3BsYXkgYW5kIGFkaGVyZW5jZSBzdGF0cy4gKi9cbiAgc2Vzc2lvbnNQZXJXZWVrOiBudW1iZXI7XG4gIC8qKlxuICAgKiBBIFwid2Vla1wiIGlzIG9uZSBwYXNzIHRocm91Z2ggYGRheXNgLiBXaXRoIGEgY3ljbGUsIHdlZWsgPSBwYXNzZXMgJSB3ZWVrcyAoNS8zLzEpIG9yLCBpZlxuICAgKiBmaW5pdGUsIHRoZSBwcm9ncmFtIGVuZHMgYWZ0ZXIgYHdlZWtzYCBwYXNzZXMgKENhbmRpdG8sIFNtb2xvdiBKciwgSnVnZ2VybmF1dCkuXG4gICAqL1xuICBjeWNsZT86IHsgd2Vla3M6IG51bWJlcjsgdG1JbmNyZWFzZT86IFJlY29yZDxzdHJpbmcsIFdlaWdodHM+OyB3ZWVrTmFtZXM/OiBzdHJpbmdbXTsgZmluaXRlPzogYm9vbGVhbjtcbiAgICAvKiogYXBwbHkgdG1JbmNyZWFzZSBldmVyeSBOIHdlZWtzIGluc3RlYWQgb2Ygb25jZSBwZXIgY3ljbGUgKHdvcmtzIGluc2lkZSBmaW5pdGUgYmxvY2tzIHRvbykgKi9cbiAgICB0bUluY3JlYXNlRXZlcnk/OiBudW1iZXI7XG4gICAgLyoqIGFwcGx5IHRtSW5jcmVhc2UgYXQgdGhlIGVuZCBvZiB0aGVzZSB3ZWVrcyBvZiB0aGUgY3ljbGUgKDAtYmFzZWQpIGluc3RlYWQsIGZvciB1bmV2ZW5cbiAgICAgKiAgcGhhc2VzOiA1LzMvMSBGb3JldmVyIExlYWRlciBcdTAwRDcyIFx1MjE5MiA3dGggd2VlayBcdTIxOTIgQW5jaG9yIFx1MjE5MiA3dGggd2VlayBidW1wcyBhZnRlciB3ZWVrcyAzLCA2IGFuZCAxMCAqL1xuICAgIHRtSW5jcmVhc2VBdD86IG51bWJlcltdIH07XG4gIC8qKiBUTSBpbmNyZW1lbnQgdW5pdCBwZXIgbGlmdCBmb3IgYW1yYXBUYWJsZSAvIGFtcmFwVnNUYXJnZXQgaW5jcmVtZW50cy4gKi9cbiAgdG1JbmNyZW1lbnQ/OiBSZWNvcmQ8c3RyaW5nLCBXZWlnaHRzPjtcbiAgLyoqIFdoYXQgdGhlIG1heGVzIGFyZSBjYWxsZWQgaW4gc2V0dXA6IFwiVHJhaW5pbmcgbWF4XCIsIFwiMVJNXCIsIFwiNVJNXCJcdTIwMjYgKi9cbiAgbWF4TGFiZWw/OiBzdHJpbmc7XG4gIG1pY3JvcGxhdGVzPzogYm9vbGVhbjtcbiAgLyoqIFNob3J0IGluc3RydWN0aW9ucyBzaG93biBvbiB0aGUgcHJvZ3JhbSBwYWdlLiAqL1xuICBub3Rlcz86IHN0cmluZ1tdO1xuICAvKiogVGhlIHByb2dyYW0gaXMgaXRzZWxmIGEgcmFtcCBiYWNrIGZyb20gYSBicmVhayAoY29tZWJhY2sgYmxvY2tzKTogbm8gcmUtZW50cnkgcmFtcCBvbiB0b3AuICovXG4gIGJ1aWx0SW5SYW1wPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBPcHRpb25EZWYge1xuICBrZXk6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgY2hvaWNlczogeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH1bXTtcbiAgZGVmYXVsdDogc3RyaW5nO1xufVxuXG4vKiogV2hhdCB0aGUgdXNlciBzZXRzIHVwIG9uY2U6IHdoaWNoIHRlbXBsYXRlLCBvcHRpb25zLCBhbmQgd2hlcmUgdGhleSdyZSBzdGFydGluZyBmcm9tLiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9ncmFtQ29uZmlnIHtcbiAgdGVtcGxhdGVJZDogc3RyaW5nO1xuICBvcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICB1bml0OiBVbml0O1xuICAvKiogSVNPIGRhdGUuIFdvcmtvdXRzIGJlZm9yZSB0aGlzIGFyZW4ndCByZXBsYXllZC4gKi9cbiAgc3RhcnREYXRlOiBzdHJpbmc7XG4gIC8qKiBTdGFydGluZyB3ZWlnaHQgcGVyIHN0YWdlIC8gZG91YmxlIC8gZml4ZWQgc2xvdCwgaW4gYHVuaXRgLiAqL1xuICBzdGFydFdlaWdodHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBPcHRpb25hbCBzdGFydGluZyBzdGFnZSBwZXIgc2xvdCAoZS5nLiB5b3UncmUgYWxyZWFkeSBvbiA2eDIrKS4gKi9cbiAgc3RhcnRTdGFnZXM/OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogVHJhaW5pbmcgbWF4IHBlciBsaWZ0LCBpbiBgdW5pdGAuICovXG4gIHRyYWluaW5nTWF4ZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQZXItc2xvdCBpbmNyZW1lbnQgb3ZlcnJpZGUsIGluIGB1bml0YC4gKi9cbiAgaW5jcmVtZW50cz86IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBMaWZ0IGtleSAtPiBIZXZ5IGV4ZXJjaXNlX3RlbXBsYXRlX2lkLCBvdmVycmlkaW5nIHRpdGxlIG1hdGNoaW5nLiAqL1xuICBsaWZ0TWFwPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgLyoqIEhldnkgcm91dGluZSBpZCAtPiBkYXkgaWQsIHJlY29yZGVkIHdoZW4gd2UgcHVzaCByb3V0aW5lcy4gKi9cbiAgcm91dGluZURheXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAvKiogTWFudWFsIGNvcnJlY3Rpb25zIGFwcGxpZWQgd2hlbiByZXBsYXkgcmVhY2hlcyBgZGF0ZWAuICovXG4gIGFkanVzdG1lbnRzPzogQWRqdXN0bWVudFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFkanVzdG1lbnQge1xuICBkYXRlOiBzdHJpbmc7XG4gIHNsb3RJZD86IHN0cmluZztcbiAgd2VpZ2h0PzogbnVtYmVyO1xuICBzdGFnZT86IG51bWJlcjtcbiAgbGlmdD86IHN0cmluZztcbiAgdG0/OiBudW1iZXI7XG4gIG5vdGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFByb2dyYW1DYXRlZ29yeSA9IFwiZ3pjbFwiIHwgXCJub3ZpY2VcIiB8IFwic3RyZW5ndGhcIiB8IFwicG93ZXJsaWZ0aW5nXCIgfCBcImh5cGVydHJvcGh5XCIgfCBcInBlYWtpbmdcIiB8IFwiY29tZWJhY2tcIjtcblxuZXhwb3J0IGludGVyZmFjZSBQcm9ncmFtVGVtcGxhdGUge1xuICBpZDogc3RyaW5nO1xuICBuYW1lOiBzdHJpbmc7XG4gIGF1dGhvcjogc3RyaW5nO1xuICBzb3VyY2U6IHN0cmluZztcbiAgc3VtbWFyeTogc3RyaW5nO1xuICBjYXRlZ29yeTogUHJvZ3JhbUNhdGVnb3J5O1xuICBsZXZlbDogXCJiZWdpbm5lclwiIHwgXCJpbnRlcm1lZGlhdGVcIiB8IFwiYWR2YW5jZWRcIjtcbiAgLyoqIGUuZy4gWzNdIG9yIFszLCA0XSAqL1xuICBkYXlzUGVyV2VlazogbnVtYmVyW107XG4gIC8qKiBMZW5ndGggb2Ygb25lIHJ1biBpbiB3ZWVrczsgb21pdCBmb3Igb3Blbi1lbmRlZCBwcm9ncmFtcy4gKi9cbiAgd2Vla3M/OiBudW1iZXI7XG4gIC8qKiBXaGF0IHRvIHJ1biB3aGVuIHRoaXMgb25lIGVuZHMgb3Igc3RhbGxzIGZvciBnb29kIChzaG93biBvbiB0aGUgcHJvZ3JhbSBwYWdlKS4gKi9cbiAgdGhlbj86IFByb2dyYW1OZXh0O1xuICBvcHRpb25zOiBPcHRpb25EZWZbXTtcbiAgYnVpbGQob3B0aW9uczogUmVjb3JkPHN0cmluZywgc3RyaW5nPik6IFByb2dyYW1EZWY7XG4gIC8qKiBSZWFzb25hYmxlIHN0YXJ0aW5nIHZhbHVlcyB0byBwcmVmaWxsIHNldHVwIHdpdGguICovXG4gIGRlZmF1bHRzPyh1bml0OiBVbml0KTogUGFydGlhbDxQaWNrPFByb2dyYW1Db25maWcsIFwic3RhcnRXZWlnaHRzXCIgfCBcInRyYWluaW5nTWF4ZXNcIiB8IFwiaW5jcmVtZW50c1wiPj47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZ3JhbU5leHQge1xuICAvKiogdGVtcGxhdGUgdG8gbW92ZSB0bywgd2hlbiB0aGVyZSBpcyBvbmUgaW4gdGhlIGNhdGFsb2cgKi9cbiAgaWQ/OiBzdHJpbmc7XG4gIC8qKiB3aGVuIGFuZCB3aHksIG9uZSBzZW50ZW5jZTogXCJXaGVuIHJlc2V0cyBzdG9wIHdvcmtpbmcsIG1vdmUgdG8gdGhlIFRleGFzIE1ldGhvZC5cIiAqL1xuICB3aGVuOiBzdHJpbmc7XG59XG5cbi8qKlxuICogSG93IGxvbmcgYSBwcm9ncmFtIHJ1bnM6XG4gKiAgIGJsb2NrICAgIGEgZml4ZWQgbnVtYmVyIG9mIHdlZWtzLCB0aGVuIGl0J3MgZG9uZSAoU21vbG92IEpyLCBDYW5kaXRvLCBTQlMpXG4gKiAgIGN5Y2xlcyAgIGEgY3ljbGUgb2Ygd2Vla3MgdGhhdCByZXBlYXRzIGZvcmV2ZXIsIG1heGVzIHJpc2luZyBlYWNoIHRpbWUgcm91bmQgKDUvMy8xKVxuICogICBvbmdvaW5nICBubyB3ZWVrcyBhdCBhbGw6IHByb2dyZXNzIHNlc3Npb24gdG8gc2Vzc2lvbiB1bnRpbCB5b3Ugc3RhbGwgKEdaQ0xQLCBTdHJvbmdMaWZ0cylcbiAqL1xuZXhwb3J0IHR5cGUgTGVuZ3RoS2luZCA9IFwiYmxvY2tcIiB8IFwiY3ljbGVzXCIgfCBcIm9uZ29pbmdcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIHByb2dyYW1MZW5ndGgodDogUHJvZ3JhbVRlbXBsYXRlKTogeyBraW5kOiBMZW5ndGhLaW5kOyB3ZWVrczogbnVtYmVyIHwgbnVsbCB9IHtcbiAgaWYgKHQud2Vla3MpIHJldHVybiB7IGtpbmQ6IFwiYmxvY2tcIiwgd2Vla3M6IHQud2Vla3MgfTtcbiAgY29uc3QgYyA9IHQuYnVpbGQoT2JqZWN0LmZyb21FbnRyaWVzKHQub3B0aW9ucy5tYXAoKG8pID0+IFtvLmtleSwgby5kZWZhdWx0XSkpKS5jeWNsZTtcbiAgaWYgKGM/LmZpbml0ZSkgcmV0dXJuIHsga2luZDogXCJibG9ja1wiLCB3ZWVrczogYy53ZWVrcyB9O1xuICBpZiAoYyAmJiBjLndlZWtzID4gMSkgcmV0dXJuIHsga2luZDogXCJjeWNsZXNcIiwgd2Vla3M6IGMud2Vla3MgfTtcbiAgcmV0dXJuIHsga2luZDogXCJvbmdvaW5nXCIsIHdlZWtzOiBudWxsIH07XG59XG5cbi8qKiBcIjEyLVdFRUsgQkxPQ0tcIiBcdTAwQjcgXCJDWUNMRVMgRk9SRVZFUlwiIFx1MDBCNyBcIk9OR09JTkdcIiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGxlbmd0aFRhZyhsOiB7IGtpbmQ6IExlbmd0aEtpbmQ7IHdlZWtzOiBudW1iZXIgfCBudWxsIH0pOiBzdHJpbmcge1xuICByZXR1cm4gbC5raW5kID09PSBcImJsb2NrXCIgPyBgJHtsLndlZWtzfS1XRUVLIEJMT0NLYCA6IGwua2luZCA9PT0gXCJjeWNsZXNcIiA/IFwiQ1lDTEVTIEZPUkVWRVJcIiA6IFwiT05HT0lOR1wiO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgc3RhdGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBpbnRlcmZhY2UgU2xvdFN0YXRlIHtcbiAgd2VpZ2h0OiBudW1iZXI7XG4gIHN0YWdlOiBudW1iZXI7XG4gIC8qKiB3ZWlnaHQgdGhpcyBzbG90IGxhc3Qgc3RhcnRlZCBzdGFnZSAwIGF0IChmb3IgVDIgcmVzZXRzKSAqL1xuICBzdGFnZTBXZWlnaHQ6IG51bWJlcjtcbiAgcmV0ZXN0OiBib29sZWFuO1xuICAvKiogY29uc2VjdXRpdmUgZmFpbGVkIHNlc3Npb25zIGF0IHRoZSBjdXJyZW50IHdlaWdodCAqL1xuICBmYWlscz86IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgT3V0Y29tZSA9IFwic3VjY2Vzc1wiIHwgXCJob2xkXCIgfCBcImZhaWxcIiB8IFwic3RhZ2UtZG93blwiIHwgXCJkZWxvYWRcIiB8IFwicmV0ZXN0LW5leHRcIiB8IFwicmV0ZXN0ZWRcIiB8IFwicmVzZXRcIiB8IFwidG0tdXBcIiB8IFwidG0tZG93blwiIHwgXCJtaXNzZWRcIjtcblxuZXhwb3J0IGludGVyZmFjZSBTbG90UmVzdWx0IHtcbiAgc2xvdElkOiBzdHJpbmc7XG4gIGxpZnQ6IHN0cmluZztcbiAgdGllcjogVGllcjtcbiAgc2NoZW1lOiBzdHJpbmc7XG4gIHdlaWdodDogbnVtYmVyO1xuICBvdXRjb21lOiBPdXRjb21lO1xuICByZXBzOiBudW1iZXJbXTtcbiAgYW1yYXBSZXBzPzogbnVtYmVyO1xuICBub3RlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTG9nRW50cnkge1xuICB3b3Jrb3V0SWQ6IHN0cmluZztcbiAgZGF0ZTogc3RyaW5nO1xuICBkYXlJZDogc3RyaW5nO1xuICB3ZWVrOiBudW1iZXI7XG4gIHJlc3VsdHM6IFNsb3RSZXN1bHRbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9ncmFtU3RhdGUge1xuICBkYXlJbmRleDogbnVtYmVyO1xuICAvKiogY29tcGxldGVkIHBhc3NlcyB0aHJvdWdoIHRoZSBkYXkgbGlzdCAoXCJ3ZWVrc1wiKSAqL1xuICByb3RhdGlvbnM6IG51bWJlcjtcbiAgc2xvdHM6IFJlY29yZDxzdHJpbmcsIFNsb3RTdGF0ZT47XG4gIHRtczogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbiAgbG9nOiBMb2dFbnRyeVtdO1xuICAvKiogZmluaXRlIHByb2dyYW1zOiBhbGwgd2Vla3MgZG9uZSAqL1xuICBjb21wbGV0ZT86IGJvb2xlYW47XG4gIC8qKiBUTSBjaGFuZ2VzIHdhaXRpbmcgZm9yIHRoZSBlbmQgb2YgdGhlIGN1cnJlbnQgd2VlayAodG1SdWxlIGFwcGx5QXQ6IFwid2Vla0VuZFwiKSAqL1xuICBwZW5kaW5nVG0/OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogY29taW5nIGJhY2sgZnJvbSBhIGJyZWFrOiB0aGUgbmV4dCBgdG90YWwgXHUyMjEyIGRvbmVgIHNlc3Npb25zIGFyZSBhIGxpZ2h0ZXIgcmFtcCAqL1xuICByZWVudHJ5PzogUmVlbnRyeTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZWVudHJ5IHtcbiAgZ2FwRGF5czogbnVtYmVyO1xuICAvKiogcmFtcCBzZXNzaW9ucyBwbGFubmVkIChlbm91Z2ggZm9yIGV2ZXJ5IG1haW4gbGlmdCB0byBnZXQgaXRzIGV4cG9zdXJlcywgY2FwcGVkKSAqL1xuICB0b3RhbDogbnVtYmVyO1xuICBkb25lOiBudW1iZXI7XG4gIC8qKiByYW1wIGV4cG9zdXJlcyBzbyBmYXIgcGVyIGxpZnQ7IGEgbGlmdCB0aGF0IGhpdCBpdHMgbm9ybWFsIHdlaWdodCBqdW1wcyB0byBpdHMgbmVlZCAqL1xuICBzZWVuPzogUmVjb3JkPHN0cmluZywgbnVtYmVyPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFubmVkU2V0IHtcbiAgd2VpZ2h0OiBudW1iZXI7XG4gIHJlcHM6IG51bWJlcjtcbiAgcmVwc01heD86IG51bWJlcjtcbiAgYW1yYXA6IGJvb2xlYW47XG4gIHBjdD86IG51bWJlcjtcbiAgcnBlPzogbnVtYmVyO1xuICAvKiogcGN0IGlzIG9mIHRvZGF5J3MgdG9wLXNldCBlMVJNLCBsb2FkIGNob3NlbiBvbiB0aGUgZGF5ICovXG4gIG9mVG9wPzogYm9vbGVhbjtcbiAgLyoqIGxvYWQgZXN0aW1hdGVkIGZyb20geW91ciBSUEUgY2hhcnQgKFJQRS1vbmx5IHNldCkgKi9cbiAgZXN0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFubmVkRXhlcmNpc2Uge1xuICBzbG90SWQ6IHN0cmluZztcbiAgbGlmdDogc3RyaW5nO1xuICB0aWVyOiBUaWVyO1xuICBzY2hlbWU6IHN0cmluZztcbiAgc2V0czogUGxhbm5lZFNldFtdO1xuICByZXN0U2Vjb25kczogbnVtYmVyO1xuICAvKiogZS5nLiBcIlJldGVzdCA1Uk06IHdvcmsgdXAgdG8gYSBoYXJkIHNldCBvZiA1XCIgKi9cbiAgbm90ZT86IHN0cmluZztcbiAgLyoqIHdoYXQgaGFwcGVucyBuZXh0LCBlLmcuIFwiSGl0IDE1IHJlcHMgXHUyMTkyIDE5MCBuZXh0IHRpbWVcIiAqL1xuICBpZlN1Y2Nlc3M/OiBzdHJpbmc7XG4gIGlmRmFpbD86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQbGFubmVkU2Vzc2lvbiB7XG4gIGRheUluZGV4OiBudW1iZXI7XG4gIGRheUlkOiBzdHJpbmc7XG4gIGRheU5hbWU6IHN0cmluZztcbiAgd2VlazogbnVtYmVyO1xuICB3ZWVrTmFtZT86IHN0cmluZztcbiAgZXhlcmNpc2VzOiBQbGFubmVkRXhlcmNpc2VbXTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGhlbHBlcnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IGluYyA9ICh3OiBXZWlnaHRzLCB1bml0OiBVbml0KSA9PiAodW5pdCA9PT0gXCJsYlwiID8gdy5sYiA6IHcua2cpO1xuXG5leHBvcnQgZnVuY3Rpb24gc2xvdEluY3JlbWVudChkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZywgc2xvdDogU2xvdERlZik6IG51bWJlciB7XG4gIGNvbnN0IG8gPSBjZmcuaW5jcmVtZW50cz8uW3Nsb3QuaWRdO1xuICBpZiAobyAhPSBudWxsKSByZXR1cm4gbztcbiAgY29uc3QgcCA9IHNsb3QucHJvZ3Jlc3Npb247XG4gIHJldHVybiBwLmtpbmQgPT09IFwic3RhZ2VzXCIgfHwgcC5raW5kID09PSBcImRvdWJsZVwiID8gaW5jKHAuaW5jcmVtZW50LCBjZmcudW5pdCkgOiAwO1xufVxuXG5mdW5jdGlvbiBzdGVwKGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBsaWZ0OiBzdHJpbmcpIHtcbiAgcmV0dXJuIGxvYWRTdGVwKExJRlRTW2xpZnRdPy5raW5kID8/IFwiYmFyYmVsbFwiLCBjZmcudW5pdCwgZGVmLm1pY3JvcGxhdGVzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNjaGVtZUxhYmVsKHN0OiBTdGFnZSk6IHN0cmluZyB7XG4gIHJldHVybiBgJHtzdC5zZXRzfVx1MDBENyR7c3QucmVwc30ke3N0LmFtcmFwID8gXCIrXCIgOiBcIlwifWA7XG59XG5cbi8qKiBTbG90cyB0aGF0IG5lZWQgYSBzdGFydGluZyB3ZWlnaHQgKHZzIGEgdHJhaW5pbmcgbWF4KS4gKi9cbmV4cG9ydCBjb25zdCB1c2VzU3RhcnRXZWlnaHQgPSAoczogU2xvdERlZikgPT4gcy5wcm9ncmVzc2lvbi5raW5kICE9PSBcInBlcmNlbnRcIjtcblxuLyoqIFByb2dyYW0gd2VlayBpbmRleCBmb3IgYSBudW1iZXIgb2YgY29tcGxldGVkIHBhc3Nlcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3ZWVrSW5kZXgoZGVmOiBQcm9ncmFtRGVmLCByb3RhdGlvbnM6IG51bWJlcik6IG51bWJlciB7XG4gIGlmICghZGVmLmN5Y2xlKSByZXR1cm4gMDtcbiAgcmV0dXJuIGRlZi5jeWNsZS5maW5pdGUgPyBNYXRoLm1pbihyb3RhdGlvbnMsIGRlZi5jeWNsZS53ZWVrcyAtIDEpIDogcm90YXRpb25zICUgZGVmLmN5Y2xlLndlZWtzO1xufVxuXG5leHBvcnQgY29uc3QgaXNTY2hlZHVsZWQgPSAoZGF5OiBEYXlEZWYsIHdlZWs6IG51bWJlcikgPT4gIWRheS53ZWVrcyB8fCBkYXkud2Vla3MuaW5jbHVkZXMod2Vlayk7XG5cbi8qKiBFdmVyeSBzbG90IG9uY2UgKGEgc2xvdCBpZCBjYW4gYXBwZWFyIG9uIHNldmVyYWwgZGF5cyBhbmQgc2hhcmUgb25lIHByb2dyZXNzaW9uKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhbGxTbG90cyhkZWY6IFByb2dyYW1EZWYpOiBTbG90RGVmW10ge1xuICBjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG4gIHJldHVybiBkZWYuZGF5cy5mbGF0TWFwKChkKSA9PiBkLnNsb3RzKS5maWx0ZXIoKHMpID0+ICFzZWVuLmhhcyhzLmlkKSAmJiAhIXNlZW4uYWRkKHMuaWQpKTtcbn1cblxuLyoqIEZpcnN0IHNjaGVkdWxlZCBkYXkgYXQgb3IgYWZ0ZXIgYGZyb21gIGluIHBhc3MgYHJvdGF0aW9uc2AsIHdyYXBwaW5nIGludG8gbGF0ZXIgcGFzc2VzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpcnN0U2NoZWR1bGVkKGRlZjogUHJvZ3JhbURlZiwgZnJvbTogbnVtYmVyLCByb3RhdGlvbnM6IG51bWJlcik6IHsgZGF5SW5kZXg6IG51bWJlcjsgcm90YXRpb25zOiBudW1iZXIgfSB7XG4gIGxldCBpID0gZnJvbSwgciA9IHJvdGF0aW9ucztcbiAgZm9yIChsZXQgZ3VhcmQgPSAwOyBndWFyZCA8IGRlZi5kYXlzLmxlbmd0aCAqICgoZGVmLmN5Y2xlPy53ZWVrcyA/PyAxKSArIDIpOyBndWFyZCsrKSB7XG4gICAgaWYgKGkgPj0gZGVmLmRheXMubGVuZ3RoKSB7IGkgPSAwOyByKys7IH1cbiAgICBpZiAoaXNTY2hlZHVsZWQoZGVmLmRheXNbaV0sIHdlZWtJbmRleChkZWYsIHIpKSkgcmV0dXJuIHsgZGF5SW5kZXg6IGksIHJvdGF0aW9uczogciB9O1xuICAgIGkrKztcbiAgfVxuICByZXR1cm4geyBkYXlJbmRleDogMCwgcm90YXRpb25zIH07XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBpbml0IC8gcGxhbiBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGZ1bmN0aW9uIGluaXRpYWxTdGF0ZShkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZyk6IFByb2dyYW1TdGF0ZSB7XG4gIGNvbnN0IHNsb3RzOiBSZWNvcmQ8c3RyaW5nLCBTbG90U3RhdGU+ID0ge307XG4gIGZvciAoY29uc3QgcyBvZiBhbGxTbG90cyhkZWYpKSB7XG4gICAgaWYgKCF1c2VzU3RhcnRXZWlnaHQocykpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHcgPSBjZmcuc3RhcnRXZWlnaHRzW3MuaWRdID8/IDA7XG4gICAgc2xvdHNbcy5pZF0gPSB7IHdlaWdodDogdywgc3RhZ2U6IGNmZy5zdGFydFN0YWdlcz8uW3MuaWRdID8/IDAsIHN0YWdlMFdlaWdodDogdywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfTtcbiAgfVxuICBjb25zdCBzdGFydCA9IGZpcnN0U2NoZWR1bGVkKGRlZiwgMCwgMCk7XG4gIHJldHVybiB7IGRheUluZGV4OiBzdGFydC5kYXlJbmRleCwgcm90YXRpb25zOiBzdGFydC5yb3RhdGlvbnMsIHNsb3RzLCB0bXM6IHsgLi4uY2ZnLnRyYWluaW5nTWF4ZXMgfSwgbG9nOiBbXSB9O1xufVxuXG5mdW5jdGlvbiBkZWZhdWx0UmVzdCh0OiBUaWVyKSB7XG4gIHJldHVybiB0ID09PSBcIlQxXCIgfHwgdCA9PT0gXCJNQUlOXCIgPyAxODAgOiB0ID09PSBcIlQyXCIgfHwgdCA9PT0gXCJTVVBQXCIgPyAxMjAgOiA3NTtcbn1cblxuZnVuY3Rpb24gc2V0c0xhYmVsKHNldHM6IFBsYW5uZWRTZXRbXSk6IHN0cmluZyB7XG4gIC8vIFwiNVx1MDBENzVcIiwgXCIzXHUwMEQ3OFx1MjAxMzEyXCIsIFwiOSBzZXRzIFx1MDBCNyAxKyA1K1wiLCBcIjNcdTAwRDczIEA4XCJcbiAgaWYgKCFzZXRzLmxlbmd0aCkgcmV0dXJuIFwiXCI7XG4gIGNvbnN0IHNhbWUgPSBzZXRzLmV2ZXJ5KChzKSA9PiBzLnJlcHMgPT09IHNldHNbMF0ucmVwcyAmJiBzLnJlcHNNYXggPT09IHNldHNbMF0ucmVwc01heCAmJiBzLndlaWdodCA9PT0gc2V0c1swXS53ZWlnaHQgJiYgcy5ycGUgPT09IHNldHNbMF0ucnBlKTtcbiAgY29uc3QgciA9IChzOiBQbGFubmVkU2V0KSA9PiBgJHtzLnJlcHN9JHtzLnJlcHNNYXggPyBcIlx1MjAxM1wiICsgcy5yZXBzTWF4IDogXCJcIn1gO1xuICBjb25zdCBhbXJhcHMgPSBzZXRzLmZpbHRlcigocykgPT4gcy5hbXJhcCk7XG4gIGlmIChzYW1lKSByZXR1cm4gYCR7c2V0cy5sZW5ndGh9XHUwMEQ3JHtyKHNldHNbMF0pfSR7YW1yYXBzLmxlbmd0aCA/IFwiK1wiIDogXCJcIn0ke3NldHNbMF0ucnBlID8gYCBAJHtzZXRzWzBdLnJwZX1gIDogXCJcIn1gO1xuICByZXR1cm4gYCR7c2V0cy5sZW5ndGh9IHNldHMke2FtcmFwcy5sZW5ndGggPyBcIiBcdTAwQjcgXCIgKyBhbXJhcHMubWFwKChzKSA9PiBgJHtzLnJlcHN9K2ApLmpvaW4oXCIgXCIpIDogXCJcIn1gO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGxhbkRheShkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZywgc3RhdGU6IFByb2dyYW1TdGF0ZSwgZGF5SW5kZXggPSBzdGF0ZS5kYXlJbmRleCk6IFBsYW5uZWRTZXNzaW9uIHtcbiAgY29uc3QgZGF5ID0gZGVmLmRheXNbZGF5SW5kZXhdO1xuICBjb25zdCB3ZWVrID0gd2Vla0luZGV4KGRlZiwgc3RhdGUucm90YXRpb25zKTtcbiAgY29uc3QgZXhlcmNpc2VzID0gZGF5LnNsb3RzLm1hcCgoc2xvdCk6IFBsYW5uZWRFeGVyY2lzZSA9PiB7XG4gICAgY29uc3QgcmVzdCA9IHNsb3QucmVzdFNlY29uZHMgPz8gZGVmYXVsdFJlc3Qoc2xvdC50aWVyKTtcbiAgICBjb25zdCBiYXNlID0geyBzbG90SWQ6IHNsb3QuaWQsIGxpZnQ6IHNsb3QubGlmdCwgdGllcjogc2xvdC50aWVyLCByZXN0U2Vjb25kczogcmVzdCB9O1xuICAgIGNvbnN0IHAgPSBzbG90LnByb2dyZXNzaW9uO1xuICAgIGNvbnN0IHMgPSBzdGF0ZS5zbG90c1tzbG90LmlkXTtcbiAgICBjb25zdCBpID0gc2xvdEluY3JlbWVudChkZWYsIGNmZywgc2xvdCk7XG5cbiAgICBpZiAocC5raW5kID09PSBcInN0YWdlc1wiKSB7XG4gICAgICBjb25zdCBzdCA9IHAuc3RhZ2VzW3Muc3RhZ2VdO1xuICAgICAgaWYgKHMucmV0ZXN0ICYmIHAub25GaW5hbEZhaWwudHlwZSA9PT0gXCJyZXRlc3RcIikge1xuICAgICAgICBjb25zdCB7IHJtUmVwcywgcGN0IH0gPSBwLm9uRmluYWxGYWlsO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIC4uLmJhc2UsIHNjaGVtZTogYCR7cm1SZXBzfVJNIFRFU1RgLCBzZXRzOiBbeyB3ZWlnaHQ6IDAsIHJlcHM6IHJtUmVwcywgYW1yYXA6IGZhbHNlIH1dLFxuICAgICAgICAgIG5vdGU6IGBSZXRlc3Q6IHdvcmsgdXAgdG8gYSBoYXJkIHNldCBvZiAke3JtUmVwc30uIE5ldyAke3Nsb3QudGllcn0gd2VpZ2h0ID0gJHtNYXRoLnJvdW5kKHBjdCAqIDEwMCl9JSBvZiBpdC5gLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgY29uc3Qgc2V0cyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHN0LnNldHMgfSwgKF8sIGspID0+ICh7IHdlaWdodDogcy53ZWlnaHQsIHJlcHM6IHN0LnJlcHMsIGFtcmFwOiBzdC5hbXJhcCAmJiBrID09PSBzdC5zZXRzIC0gMSB9KSk7XG4gICAgICBjb25zdCBsYXN0ID0gcy5zdGFnZSA9PT0gcC5zdGFnZXMubGVuZ3RoIC0gMTtcbiAgICAgIGNvbnN0IGZhaWxzID0gcy5mYWlscyA/PyAwO1xuICAgICAgY29uc3QgYWxsb3dlZCA9IHAuZmFpbHNCZWZvcmVBY3Rpb24gPz8gMTtcbiAgICAgIGxldCBpZlN1Y2Nlc3M6IHN0cmluZywgaWZGYWlsOiBzdHJpbmc7XG4gICAgICBpZiAocC5jbGltYikge1xuICAgICAgICBjb25zdCBueCA9IHAuc3RhZ2VzW3Muc3RhZ2UgKyAxXTtcbiAgICAgICAgY29uc3QgdXAgPSByb3VuZFRvKHMud2VpZ2h0ICogKDEgKyBwLmNsaW1iLmxvYWRQY3QpLCBzdGVwKGRlZiwgY2ZnLCBzbG90LmxpZnQpKTtcbiAgICAgICAgaWZTdWNjZXNzID0gbnggPyBgYWxsICR7c3Quc2V0cyAqIHN0LnJlcHN9IHJlcHMgXHUyMTkyICR7c2NoZW1lTGFiZWwobngpfSBAICR7Zm10KHMud2VpZ2h0KX1gIDogcy53ZWlnaHQgPiAwICYmIHAuY2xpbWIubG9hZFBjdCA+IDAgPyBgYWxsICR7c3Quc2V0cyAqIHN0LnJlcHN9IHJlcHMgXHUyMTkyICR7c2NoZW1lTGFiZWwocC5zdGFnZXNbMF0pfSBAICR7Zm10KHVwKX1gIDogYGFsbCByZXBzIFx1MjE5MiBzdGF5IGF0ICR7c2NoZW1lTGFiZWwoc3QpfWA7XG4gICAgICAgIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiByZXBlYXQgJHtzY2hlbWVMYWJlbChzdCl9IEAgJHtmbXQocy53ZWlnaHQpfWA7XG4gICAgICB9IGVsc2UgaWYgKHAuYWR2YW5jZS50eXBlID09PSBcImFtcmFwQXRMZWFzdFwiKSB7XG4gICAgICAgIGlmU3VjY2VzcyA9IGAke3AuYWR2YW5jZS5yZXBzfSsgb24gbGFzdCBzZXQgXHUyMTkyICR7Zm10KHMud2VpZ2h0ICsgaSl9YDtcbiAgICAgICAgaWZGYWlsID0gYGZld2VyIFx1MjE5MiBzdGF5IGF0ICR7Zm10KHMud2VpZ2h0KX1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWZTdWNjZXNzID0gYCR7c3Quc2V0cyAqIHN0LnJlcHN9IHJlcHMgXHUyMTkyICR7Zm10KHMud2VpZ2h0ICsgaSl9YDtcbiAgICAgICAgaWYgKHAuYW1yYXBCb251cykgaWZTdWNjZXNzICs9IGAgKCR7cC5hbXJhcEJvbnVzLnJlcHN9KyBvbiBsYXN0IFx1MjE5MiAke2ZtdChzLndlaWdodCArIGkgKiBwLmFtcmFwQm9udXMuaW5jcmVtZW50cyl9KWA7XG4gICAgICAgIGlmIChmYWlscyArIDEgPCBhbGxvd2VkKSBpZkZhaWwgPSBgbWlzcyBcdTIxOTIgcmV0cnkgJHtmbXQocy53ZWlnaHQpfSAoJHtmYWlscyArIDF9LyR7YWxsb3dlZH0pYDtcbiAgICAgICAgZWxzZSBpZiAoIWxhc3QpIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiAke3NjaGVtZUxhYmVsKHAuc3RhZ2VzW3Muc3RhZ2UgKyAxXSl9IEAgJHtmbXQocy53ZWlnaHQpfWA7XG4gICAgICAgIGVsc2UgaWYgKHAub25GaW5hbEZhaWwudHlwZSA9PT0gXCJyZXRlc3RcIikgaWZGYWlsID0gYG1pc3MgXHUyMTkyIHJldGVzdCAke3Aub25GaW5hbEZhaWwucm1SZXBzfVJNYDtcbiAgICAgICAgZWxzZSBpZiAocC5vbkZpbmFsRmFpbC50eXBlID09PSBcInJlc2V0XCIpIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiByZXNldCAke3NjaGVtZUxhYmVsKHAuc3RhZ2VzWzBdKX0gQCAke2ZtdChzLnN0YWdlMFdlaWdodCArIHAub25GaW5hbEZhaWwuYnVtcEluY3JlbWVudHMgKiBpKX1gO1xuICAgICAgICBlbHNlIGlmIChwLm9uRmluYWxGYWlsLnR5cGUgPT09IFwiZGVsb2FkXCIpIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiBkZWxvYWQgdG8gJHtmbXQocm91bmRUbyhzLndlaWdodCAqICgxIC0gcC5vbkZpbmFsRmFpbC5wY3QpLCBzdGVwKGRlZiwgY2ZnLCBzbG90LmxpZnQpKSl9YDtcbiAgICAgICAgZWxzZSBpZiAocC5vbkZpbmFsRmFpbC50eXBlID09PSBcImRlbG9hZEJ5XCIpIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiBkcm9wIHRvICR7Zm10KHMud2VpZ2h0IC0gaW5jKHAub25GaW5hbEZhaWwuYW1vdW50LCBjZmcudW5pdCkpfWA7XG4gICAgICAgIGVsc2UgaWZGYWlsID0gYG1pc3MgXHUyMTkyIHN0YXlgO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgLi4uYmFzZSwgc2NoZW1lOiBzY2hlbWVMYWJlbChzdCksIHNldHMsIGlmU3VjY2VzcywgaWZGYWlsLCBub3RlOiBzbG90Lm5vdGUgfTtcbiAgICB9XG5cbiAgICBpZiAocC5raW5kID09PSBcImRvdWJsZVwiKSB7XG4gICAgICBjb25zdCBbbG8sIGhpXSA9IHAucmVwcztcbiAgICAgIGNvbnN0IHNldHMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBwLnNldHMgfSwgKF8sIGspID0+ICh7IHdlaWdodDogcy53ZWlnaHQsIHJlcHM6IGxvLCByZXBzTWF4OiBoaSwgYW1yYXA6ICEhcC5hbXJhcExhc3QgJiYgayA9PT0gcC5zZXRzIC0gMSB9KSk7XG4gICAgICByZXR1cm4geyAuLi5iYXNlLCBzY2hlbWU6IGAke3Auc2V0c31cdTAwRDcke2xvfVx1MjAxMyR7aGl9JHtwLmFtcmFwTGFzdCA/IFwiK1wiIDogXCJcIn1gLCBzZXRzLCBpZlN1Y2Nlc3M6IGBhbGwgc2V0cyAke2hpfSsgXHUyMTkyICR7Zm10KHMud2VpZ2h0ICsgaSl9YCwgaWZGYWlsOiBgZmV3ZXIgXHUyMTkyIGFkZCByZXBzIGF0ICR7Zm10KHMud2VpZ2h0KX1gLCBub3RlOiBzbG90Lm5vdGUgfTtcbiAgICB9XG5cbiAgICBpZiAocC5raW5kID09PSBcImZpeGVkXCIpIHtcbiAgICAgIGNvbnN0IHNldHMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBwLnNldHMgfSwgKF8sIGspID0+ICh7IHdlaWdodDogcy53ZWlnaHQsIHJlcHM6IHAucmVwcywgcmVwc01heDogcC5yZXBzTWF4LCBhbXJhcDogISFwLmFtcmFwTGFzdCAmJiBrID09PSBwLnNldHMgLSAxIH0pKTtcbiAgICAgIHJldHVybiB7IC4uLmJhc2UsIHNjaGVtZTogc2V0c0xhYmVsKHNldHMpLCBzZXRzLCBub3RlOiBbcC5ub3RlLCBzbG90Lm5vdGVdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiIFx1MDBCNyBcIikgfHwgdW5kZWZpbmVkIH07XG4gICAgfVxuXG4gICAgY29uc3QgdG0gPSBzdGF0ZS50bXNbcC50bUxpZnRdID8/IDA7XG4gICAgY29uc3QgdGFibGUgPSBwLndlZWtzW3dlZWsgJSBwLndlZWtzLmxlbmd0aF0gPz8gW107XG4gICAgY29uc3Qgc2V0czogUGxhbm5lZFNldFtdID0gdGFibGUubWFwKChwcykgPT4gKHtcbiAgICAgIHdlaWdodDogcHMucGN0ICE9IG51bGwgJiYgIXBzLm9mVG9wID8gcm91bmRUbyh0bSAqIHBzLnBjdCArIChwcy5hZGQgPyBpbmMocHMuYWRkLCBjZmcudW5pdCkgOiAwKSwgc3RlcChkZWYsIGNmZywgc2xvdC5saWZ0KSkgOiAwLFxuICAgICAgcmVwczogcHMucmVwcywgcmVwc01heDogcHMucmVwc01heCwgYW1yYXA6ICEhcHMuYW1yYXAsIHBjdDogcHMucGN0LCBycGU6IHBzLnJwZSwgb2ZUb3A6IHBzLm9mVG9wLFxuICAgIH0pKTtcbiAgICBsZXQgaWZTdWNjZXNzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gICAgY29uc3QgdG1pID0gZGVmLnRtSW5jcmVtZW50Py5bcC50bUxpZnRdID8gaW5jKGRlZi50bUluY3JlbWVudFtwLnRtTGlmdF0sIGNmZy51bml0KSA6IGNmZy51bml0ID09PSBcImxiXCIgPyA1IDogMi41O1xuICAgIGlmIChwLnRtUnVsZT8udHlwZSA9PT0gXCJhbXJhcFRhYmxlXCIpIHtcbiAgICAgIGlmU3VjY2VzcyA9IHAudG1SdWxlLnRhYmxlLmZpbHRlcigocikgPT4gci5pbmNyZW1lbnRzID4gMCkubWFwKChyKSA9PiBgJHtyLm1pblJlcHN9KyBcdTIxOTIgVE0gKyR7Zm10KHIuaW5jcmVtZW50cyAqIHRtaSl9YCkuam9pbihcIiBcdTAwQjcgXCIpO1xuICAgIH0gZWxzZSBpZiAocC50bVJ1bGU/LnR5cGUgPT09IFwiYW1yYXBWc1RhcmdldFwiKSB7XG4gICAgICBjb25zdCB0ID0gdGFibGVbcC50bVJ1bGUuc2V0SW5kZXhdO1xuICAgICAgaWYgKHQpIGlmU3VjY2VzcyA9IGB0YXJnZXQgJHt0LnRhcmdldCA/PyB0LnJlcHN9IHJlcHMgb24gdGhlICR7dC5yZXBzfSsgc2V0OyBlYWNoIHJlcCBvdmVyL3VuZGVyIG1vdmVzIHRoZSBUTWA7XG4gICAgfSBlbHNlIGlmIChwLnRtUnVsZT8udHlwZSA9PT0gXCJ0b3RhbFJlcHNcIikge1xuICAgICAgaWZTdWNjZXNzID0gcC50bVJ1bGUudGFibGUuZmlsdGVyKChyKSA9PiAoci5pbmNyZW1lbnRzID8/IDApID4gMCB8fCAoci5wY3QgPz8gMCkgPiAwKS5tYXAoKHIpID0+IGAke3IubWluUmVwc30rIHRvdGFsIFx1MjE5MiArJHtyLnBjdCAhPSBudWxsID8gZm10KHIucGN0ICogMTAwKSArIFwiJVwiIDogZm10KChyLmluY3JlbWVudHMgPz8gMCkgKiB0bWkpfWApLmpvaW4oXCIgXHUwMEI3IFwiKTtcbiAgICB9IGVsc2UgaWYgKHAudG1SdWxlPy50eXBlID09PSBcIm1pc3NDdXRcIikge1xuICAgICAgaWZTdWNjZXNzID0gYG1pc3MgYSByZXAgXHUyMTkyICR7ZGVmLm1heExhYmVsID8/IFwiVE1cIn0gXHUyMjEyJHtmbXQocC50bVJ1bGUucGN0ICogMTAwKX0lYDtcbiAgICB9IGVsc2UgaWYgKHAudG1SdWxlPy50eXBlID09PSBcImUxcm1cIikge1xuICAgICAgaWZTdWNjZXNzID0gYG5ldyBUTSA9ICR7TWF0aC5yb3VuZChwLnRtUnVsZS5wY3QgKiAxMDApfSUgb2YgZTFSTSBmcm9tIHNldCAke3AudG1SdWxlLnNldEluZGV4ICsgMX1gO1xuICAgIH1cbiAgICBjb25zdCB1c2VzUGN0ID0gdGFibGUuc29tZSgoeCkgPT4geC5wY3QgIT0gbnVsbCAmJiAheC5vZlRvcCk7XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLmJhc2UsIHNjaGVtZTogc2V0c0xhYmVsKHNldHMpLCBzZXRzLCBpZlN1Y2Nlc3MsXG4gICAgICBub3RlOiBbdXNlc1BjdCA/IChwLnRtTGlmdCAhPT0gc2xvdC5saWZ0ID8gYCUgb2YgJHtMSUZUU1twLnRtTGlmdF0/LnNob3J0ID8/IHAudG1MaWZ0fSAke2RlZi5tYXhMYWJlbCA/PyBcIlRNXCJ9ICR7Zm10KHRtKX1gIDogYCR7ZGVmLm1heExhYmVsID8/IFwiVE1cIn0gJHtmbXQodG0pfWApIDogXCJcIiwgc2xvdC5ub3RlXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIiBcdTAwQjcgXCIpIHx8IHVuZGVmaW5lZCxcbiAgICB9O1xuICB9KTtcbiAgLy8gUGVyY2VudCB0YWJsZXMgY2FuIGJlIGVtcHR5IGZvciBhIHdlZWsgKGUuZy4gbm8gQkJCIG9uIGRlbG9hZCB3ZWVrKS5cbiAgcmV0dXJuIHsgZGF5SW5kZXgsIGRheUlkOiBkYXkuaWQsIGRheU5hbWU6IGRheS5uYW1lLCB3ZWVrLCB3ZWVrTmFtZTogZGVmLmN5Y2xlPy53ZWVrTmFtZXM/Llt3ZWVrXSwgZXhlcmNpc2VzOiBleGVyY2lzZXMuZmlsdGVyKChlKSA9PiBlLnNldHMubGVuZ3RoKSB9O1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgZXZhbHVhdGUgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmludGVyZmFjZSBQZXJmb3JtZWQge1xuICB3ZWlnaHQ6IG51bWJlcjtcbiAgcmVwczogbnVtYmVyO1xuICBycGU/OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHBlcmZvcm1lZEZvcih3OiBIZXZ5V29ya291dCwgbGlmdDogc3RyaW5nLCBjZmc6IFByb2dyYW1Db25maWcpOiBQZXJmb3JtZWRbXVtdIHtcbiAgLy8gb25lIGFycmF5IHBlciBtYXRjaGluZyBleGVyY2lzZSBibG9jaywgc28gYSBsaWZ0IGRvbmUgdHdpY2UgaW4gYSBkYXkgc3RheXMgc2VwYXJhdGVcbiAgcmV0dXJuIHcuZXhlcmNpc2VzXG4gICAgLmZpbHRlcigoZSkgPT4gbWF0Y2hMaWZ0KGUudGl0bGUsIGUuZXhlcmNpc2VfdGVtcGxhdGVfaWQsIGNmZy5saWZ0TWFwKSA9PT0gbGlmdClcbiAgICAubWFwKChlKSA9PlxuICAgICAgZS5zZXRzXG4gICAgICAgIC5maWx0ZXIoKHMpID0+IHMudHlwZSAhPT0gXCJ3YXJtdXBcIiAmJiAocy5yZXBzID8/IDApID4gMClcbiAgICAgICAgLm1hcCgocykgPT4gKHsgd2VpZ2h0OiBmcm9tS2cocy53ZWlnaHRfa2cgPz8gMCwgY2ZnLnVuaXQpLCByZXBzOiBzLnJlcHMgPz8gMCwgLi4uKHMucnBlICE9IG51bGwgPyB7IHJwZTogcy5ycGUgfSA6IHt9KSB9KSksXG4gICAgKTtcbn1cblxuY29uc3QgZTFybSA9ICh3OiBudW1iZXIsIHI6IG51bWJlcikgPT4gKHIgPD0gMSA/IHcgOiB3ICogKDEgKyByIC8gMzApKTtcblxuLyoqIFRoZSB3ZWlnaHQgbW9zdCBzZXRzIHdlcmUgZG9uZSBhdCAodGllcyBcdTIxOTIgaGVhdmllciksIHJvdW5kZWQgb2ZmIGtnXHUyMTkybGIgZmxvYXQgbm9pc2UuICovXG5mdW5jdGlvbiBtb2RlV2VpZ2h0KHNldHM6IFBlcmZvcm1lZFtdKTogbnVtYmVyIHtcbiAgY29uc3QgbiA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG4gIGZvciAoY29uc3QgeCBvZiBzZXRzKSB7IGNvbnN0IHIgPSBNYXRoLnJvdW5kKHgud2VpZ2h0ICogMikgLyAyOyBuLnNldChyLCAobi5nZXQocikgPz8gMCkgKyAxKTsgfVxuICBsZXQgYmVzdCA9IDAsIGMgPSAtMTtcbiAgZm9yIChjb25zdCBbd3QsIGtdIG9mIG4pIGlmIChrID4gYyB8fCAoayA9PT0gYyAmJiB3dCA+IGJlc3QpKSB7IGJlc3QgPSB3dDsgYyA9IGs7IH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbi8qKiBTZXRzIGF0IG9yIG5lYXIgdGhlIG1haW4gd29ya2luZyB3ZWlnaHQuIERyb3BzIHdhcm11cHMgcGVvcGxlIGxvZyBhcyBub3JtYWwgc2V0cyBidXQga2VlcHMgcmFtcHMgKDg1Lzk1Lzk1Lzg1Lzg1KS4gKi9cbmZ1bmN0aW9uIHdvcmtpbmdTZXRzKHNldHM6IFBlcmZvcm1lZFtdKTogUGVyZm9ybWVkW10ge1xuICBpZiAoIXNldHMubGVuZ3RoKSByZXR1cm4gW107XG4gIGNvbnN0IGxvYWRlZCA9IHNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+IDApO1xuICBjb25zdCBtID0gbW9kZVdlaWdodChsb2FkZWQubGVuZ3RoID8gbG9hZGVkIDogc2V0cyk7XG4gIHJldHVybiBzZXRzLmZpbHRlcigoeCkgPT4geC53ZWlnaHQgPj0gbSAqIDAuOTUgLSAwLjUpO1xufVxuXG5jb25zdCBtZWRpYW5SZXBzID0gKHhzOiBQZXJmb3JtZWRbXSkgPT4gKHhzLmxlbmd0aCA/IFsuLi54c10ubWFwKCh4KSA9PiB4LnJlcHMpLnNvcnQoKGEsIGIpID0+IGEgLSBiKVtNYXRoLmZsb29yKHhzLmxlbmd0aCAvIDIpXSA6IDApO1xuXG4vKipcbiAqIFdoaWNoIHN0YWdlIHRoZSBsb2dnZWQgc2V0cyBsb29rIGxpa2UgKHNpeCBkb3VibGVzID0gNlx1MDBENzIrKS5cbiAqIGV4YWN0OiByaWdodCBudW1iZXIgb2Ygc2V0cyB3aXRoIHJlcHMgbmVhciB0aGUgc2NoZW1lLiBhdHRlbXB0OiBmZXdlciBzZXRzIG9yIG1pc3NlZCByZXBzXG4gKiBuZWFyIHRoZSBzY2hlbWUgKGEgc2Vzc2lvbiB0aGF0IHdlbnQgYmFkbHkpLiBub25lOiBkb2Vzbid0IHJlc2VtYmxlIGFueSBzdGFnZSAoM1x1MDBENzEwIG9uIFQxKS5cbiAqL1xuZnVuY3Rpb24gaW5mZXJTdGFnZShzdGFnZXM6IFN0YWdlW10sIHdvcms6IFBlcmZvcm1lZFtdLCBjdXJyZW50OiBudW1iZXIpOiB7IGs6IG51bWJlcjsgaG93OiBcImV4YWN0XCIgfCBcImF0dGVtcHRcIiB8IFwibm9uZVwiIH0ge1xuICAvLyBSZXBzIGRpc3Rpbmd1aXNoIFQxIHN0YWdlcyAoM3MgdnMgMnMgdnMgMXMpIHNvIGxvdy1yZXAgc2NoZW1lcyBtdXN0IG1hdGNoIGV4YWN0bHkuXG4gIC8vIEFuIEFNUkFQIGxhc3Qgc2V0IG9ubHkgaGFzIGEgZmxvb3I6IDFcdTAwRDc1KyBkb25lIGZvciA4IGlzIHN0aWxsIHRoYXQgc2NoZW1lLlxuICBjb25zdCByZXBzTmVhciA9IChzdDogU3RhZ2UsIHhzOiBQZXJmb3JtZWRbXSkgPT4ge1xuICAgIGNvbnN0IHRvbGVyYW5jZSA9IHN0LnJlcHMgPD0gMyA/IDAgOiAxO1xuICAgIGlmICghc3QuYW1yYXApIHJldHVybiBNYXRoLmFicyhtZWRpYW5SZXBzKHhzKSAtIHN0LnJlcHMpIDw9IHRvbGVyYW5jZTtcbiAgICBjb25zdCBsYXN0ID0geHNbeHMubGVuZ3RoIC0gMV07XG4gICAgLy8gb25lIHJlcCBzaG9ydCBvbiB0aGUgQU1SQVAgaXMgc3RpbGwgYW4gYXR0ZW1wdCBhdCB0aGlzIHNjaGVtZSAoYSBtaXNzLCBqdWRnZWQgbGF0ZXIpXG4gICAgY29uc3QgbGFzdE9rID0gISFsYXN0ICYmIGxhc3QucmVwcyA+PSBNYXRoLm1heCgxLCBzdC5yZXBzIC0gMSAtIHRvbGVyYW5jZSk7XG4gICAgY29uc3QgYm9keSA9IHhzLnNsaWNlKDAsIC0xKTtcbiAgICByZXR1cm4gYm9keS5sZW5ndGggPyBsYXN0T2sgJiYgTWF0aC5hYnMobWVkaWFuUmVwcyhib2R5KSAtIHN0LnJlcHMpIDw9IHRvbGVyYW5jZSA6IGxhc3RPaztcbiAgfTtcbiAgLy8gTW9yZSBzZXRzIHRoYW4gdGhlIHNjaGVtZToganVkZ2UgdGhlIGxhc3QgTiAoYW4gZXh0cmEgc2V0IGF0IHdvcmtpbmcgd2VpZ2h0IGlzIHVzdWFsbHkgYSB3YXJtdXApLlxuICBjb25zdCBleGFjdCA9IChzdDogU3RhZ2UpID0+IHtcbiAgICBpZiAoTWF0aC5hYnMod29yay5sZW5ndGggLSBzdC5zZXRzKSA8PSAoc3Quc2V0cyA+PSA2ID8gMSA6IDApKSByZXR1cm4gcmVwc05lYXIoc3QsIHdvcmspO1xuICAgIHJldHVybiB3b3JrLmxlbmd0aCA+IHN0LnNldHMgJiYgcmVwc05lYXIoc3QsIHdvcmsuc2xpY2UoLXN0LnNldHMpKTtcbiAgfTtcbiAgaWYgKGV4YWN0KHN0YWdlc1tjdXJyZW50XSkpIHJldHVybiB7IGs6IGN1cnJlbnQsIGhvdzogXCJleGFjdFwiIH07XG4gIGNvbnN0IGUgPSBzdGFnZXMuZmluZEluZGV4KGV4YWN0KTtcbiAgaWYgKGUgPj0gMCkgcmV0dXJuIHsgazogZSwgaG93OiBcImV4YWN0XCIgfTtcbiAgY29uc3QgY3VyID0gc3RhZ2VzW2N1cnJlbnRdO1xuICBpZiAod29yay5sZW5ndGggPj0gMiAmJiB3b3JrLmxlbmd0aCA8IGN1ci5zZXRzICYmIHJlcHNOZWFyKGN1ciwgd29yaykpIHJldHVybiB7IGs6IGN1cnJlbnQsIGhvdzogXCJhdHRlbXB0XCIgfTtcbiAgLy8gUmlnaHQgbnVtYmVyIG9mIHNldHMgYnV0IHJlcHMgZmVsbCBzaG9ydCAoNVx1MDBENzUgXHUyMTkyIDUsNSw1LDQsMykuXG4gIGlmIChzdGFnZXMubGVuZ3RoID09PSAxICYmIHdvcmsubGVuZ3RoID49IDIgJiYgd29yay5sZW5ndGggPD0gY3VyLnNldHMgJiYgbWVkaWFuUmVwcyh3b3JrKSA8PSBjdXIucmVwcyAmJiBtZWRpYW5SZXBzKHdvcmspID49IGN1ci5yZXBzIC0gMikgcmV0dXJuIHsgazogY3VycmVudCwgaG93OiBcImF0dGVtcHRcIiB9O1xuICBjb25zdCBhID0gc3RhZ2VzLmZpbmRJbmRleCgoc3QpID0+IHdvcmsubGVuZ3RoID49IDIgJiYgd29yay5sZW5ndGggPCBzdC5zZXRzICYmIHJlcHNOZWFyKHN0LCB3b3JrKSk7XG4gIGlmIChhID49IDApIHJldHVybiB7IGs6IGEsIGhvdzogXCJhdHRlbXB0XCIgfTtcbiAgcmV0dXJuIHsgazogY3VycmVudCwgaG93OiBcIm5vbmVcIiB9O1xufVxuXG4vKiogSG93IHdlbGwgbG9nZ2VkIHNldHMgZml0IGEgc2xvdDogMiA9IG1hdGNoZXMgaXRzIGN1cnJlbnQgc2NoZW1lLCAwLjc1ID0gbGlmdCBwcmVzZW50LCAwID0gYWJzZW50LiAqL1xuZnVuY3Rpb24gc2xvdEZpdChzbG90OiBTbG90RGVmLCBzdGF0ZTogUHJvZ3JhbVN0YXRlLCBzZXRzOiBQZXJmb3JtZWRbXSk6IG51bWJlciB7XG4gIGlmICghc2V0cy5sZW5ndGgpIHJldHVybiAwO1xuICBjb25zdCBwID0gc2xvdC5wcm9ncmVzc2lvbjtcbiAgaWYgKHAua2luZCAhPT0gXCJzdGFnZXNcIikgcmV0dXJuIDE7XG4gIGlmIChzdGF0ZS5zbG90c1tzbG90LmlkXT8ucmV0ZXN0KSByZXR1cm4gMS41O1xuICBjb25zdCB3b3JrID0gd29ya2luZ1NldHMoc2V0cyk7XG4gIGNvbnN0IGhvdyA9IGluZmVyU3RhZ2UocC5zdGFnZXMsIHdvcmssIHN0YXRlLnNsb3RzW3Nsb3QuaWRdPy5zdGFnZSA/PyAwKS5ob3c7XG4gIHJldHVybiBob3cgPT09IFwiZXhhY3RcIiA/IDIgOiBob3cgPT09IFwiYXR0ZW1wdFwiID8gMS4yNSA6IDAuNzU7XG59XG5cbnR5cGUgRXZhbCA9IHsgbmV4dDogU2xvdFN0YXRlOyByZXM6IFNsb3RSZXN1bHQgfTtcblxuZnVuY3Rpb24gZXZhbFN0YWdlcyhkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZywgc2xvdDogU2xvdERlZiwgczogU2xvdFN0YXRlLCBzZXRzOiBQZXJmb3JtZWRbXSk6IEV2YWwge1xuICBjb25zdCBwID0gc2xvdC5wcm9ncmVzc2lvbiBhcyBFeHRyYWN0PFByb2dyZXNzaW9uLCB7IGtpbmQ6IFwic3RhZ2VzXCIgfT47XG4gIGNvbnN0IGkgPSBzbG90SW5jcmVtZW50KGRlZiwgY2ZnLCBzbG90KTtcblxuICBpZiAocy5yZXRlc3QgJiYgcC5vbkZpbmFsRmFpbC50eXBlID09PSBcInJldGVzdFwiKSB7XG4gICAgY29uc3QgeyBybVJlcHMsIHBjdCB9ID0gcC5vbkZpbmFsRmFpbDtcbiAgICBjb25zdCBhdFJtID0gc2V0cy5maWx0ZXIoKHgpID0+IHgucmVwcyA+PSBybVJlcHMpLm1hcCgoeCkgPT4geC53ZWlnaHQpO1xuICAgIGNvbnN0IHJtID0gYXRSbS5sZW5ndGggPyBNYXRoLm1heCguLi5hdFJtKSA6IE1hdGgubWF4KDAsIC4uLnNldHMubWFwKCh4KSA9PiBlMXJtKHgud2VpZ2h0LCB4LnJlcHMpKSkgLyAoMSArIHJtUmVwcyAvIDMwKTtcbiAgICBjb25zdCB3ID0gcm91bmRUbyhybSAqIHBjdCwgc3RlcChkZWYsIGNmZywgc2xvdC5saWZ0KSk7XG4gICAgcmV0dXJuIHtcbiAgICAgIG5leHQ6IHsgd2VpZ2h0OiB3LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiB3LCByZXRlc3Q6IGZhbHNlLCBmYWlsczogMCB9LFxuICAgICAgcmVzOiB7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHJlcHM6IHNldHMubWFwKCh4KSA9PiB4LnJlcHMpLCBzY2hlbWU6IGAke3JtUmVwc31STSBURVNUYCwgd2VpZ2h0OiBybSwgb3V0Y29tZTogXCJyZXRlc3RlZFwiLCBub3RlOiBgJHtybVJlcHN9Uk0gJHtmbXQocm0pfSBcdTIxOTIgJHtzY2hlbWVMYWJlbChwLnN0YWdlc1swXSl9IEAgJHtmbXQodyl9YCB9LFxuICAgIH07XG4gIH1cblxuICAvLyBGb2xsb3cgdGhlIGxpZnRlci4gV29ya2luZyBzZXRzIGFyZSB0aG9zZSBuZWFyIHRoZSBtYWluIHdlaWdodCwgc28gdW5tYXJrZWQgd2FybXVwcyBkcm9wXG4gIC8vIG91dCwgYW5kIHByb2dyZXNzaW9uIGJ1aWxkcyBmcm9tIHdoYXQgd2FzIGFjdHVhbGx5IGxpZnRlZCByYXRoZXIgdGhhbiB3aGF0IHdhcyBwcmVzY3JpYmVkLlxuICAvLyBUaGF0IGtlZXBzIHRoZSBwcm9ncmFtIGluIHN0ZXAgd2hlbiB5b3UgZ28gaGVhdmllciwgbGlnaHRlciwgb3IgcnVuIGEgZGlmZmVyZW50IHN0YWdlLlxuICBjb25zdCB3b3JrQWxsID0gd29ya2luZ1NldHMoc2V0cyk7XG4gIGNvbnN0IGxpZnRlZCA9IG1vZGVXZWlnaHQod29ya0FsbCk7XG4gIGNvbnN0IHRvbCA9IE1hdGgubWF4KDEsIHMud2VpZ2h0ICogMC4wMik7XG4gIGNvbnN0IHcgPSBNYXRoLmFicyhsaWZ0ZWQgLSBzLndlaWdodCkgPD0gdG9sID8gcy53ZWlnaHQgOiBsaWZ0ZWQ7XG4gIGNvbnN0IHsgaywgaG93IH0gPSBpbmZlclN0YWdlKHAuc3RhZ2VzLCB3b3JrQWxsLCBzLnN0YWdlKTtcbiAgY29uc3Qgc3QgPSBwLnN0YWdlc1trXTtcbiAgY29uc3Qgd29yayA9IHdvcmtBbGwubGVuZ3RoID4gc3Quc2V0cyAmJiBNYXRoLmFicyh3b3JrQWxsLmxlbmd0aCAtIHN0LnNldHMpID4gKHN0LnNldHMgPj0gNiA/IDEgOiAwKSA/IHdvcmtBbGwuc2xpY2UoLXN0LnNldHMpIDogd29ya0FsbDtcbiAgY29uc3QgY3VyOiBTbG90U3RhdGUgPSB7IC4uLnMsIHdlaWdodDogdywgc3RhZ2U6IGssIHN0YWdlMFdlaWdodDogayA9PT0gMCAmJiBzLnN0YWdlICE9PSAwID8gdyA6IHMuc3RhZ2UwV2VpZ2h0LCBmYWlsczogdyAhPT0gcy53ZWlnaHQgfHwgayAhPT0gcy5zdGFnZSA/IDAgOiBzLmZhaWxzID8/IDAgfTtcbiAgY29uc3QgYW1yYXBSZXBzID0gd29yay5sZW5ndGggPyB3b3JrW01hdGgubWluKHdvcmsubGVuZ3RoLCBzdC5zZXRzKSAtIDFdLnJlcHMgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGJhc2UgPSB7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHNjaGVtZTogc2NoZW1lTGFiZWwoc3QpLCB3ZWlnaHQ6IHcsIHJlcHM6IHdvcmsubWFwKCh4KSA9PiB4LnJlcHMpIH07XG4gIGNvbnN0IG9mZiA9IHcgIT09IHMud2VpZ2h0ID8gYCAocGxhbm5lZCAke2ZtdChzLndlaWdodCl9KWAgOiBcIlwiO1xuXG4gIGlmIChwLmFkdmFuY2UudHlwZSA9PT0gXCJhbXJhcEF0TGVhc3RcIikge1xuICAgIC8vIFQzOiBvbmx5IHRoZSBsYXN0IHNldCBtYXR0ZXJzIChcIjE1LzE1LzI1XCIpLlxuICAgIGNvbnN0IG9rID0gKGFtcmFwUmVwcyA/PyAwKSA+PSBwLmFkdmFuY2UucmVwcztcbiAgICByZXR1cm4gb2tcbiAgICAgID8geyBuZXh0OiB7IC4uLmN1ciwgd2VpZ2h0OiB3ICsgaSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBhbXJhcFJlcHMsIG5vdGU6IGAke2FtcmFwUmVwc30gb24gbGFzdCBzZXQke29mZn0gXHUyMTkyICR7Zm10KHcgKyBpKX1gIH0gfVxuICAgICAgOiB7IG5leHQ6IGN1ciwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke2FtcmFwUmVwcyA/PyAwfSBvbiBsYXN0IHNldCwgbmVlZCAke3AuYWR2YW5jZS5yZXBzfSR7b2ZmfWAgfSB9O1xuICB9XG5cbiAgaWYgKHAuY2xpbWIgJiYgaG93ICE9PSBcIm5vbmVcIikge1xuICAgIGNvbnN0IHZvbCA9IHdvcmsuc2xpY2UoMCwgc3Quc2V0cykucmVkdWNlKChhLCB4KSA9PiBhICsgTWF0aC5taW4oeC5yZXBzLCBzdC5yZXBzKSwgMCk7XG4gICAgY29uc3QgbmVlZCA9IHN0LnNldHMgKiBzdC5yZXBzO1xuICAgIGlmICh2b2wgPCBuZWVkKSByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke3ZvbH0vJHtuZWVkfSR7b2ZmfSBcdTIxOTIgcmVwZWF0ICR7c2NoZW1lTGFiZWwoc3QpfWAgfSB9O1xuICAgIGlmIChrIDwgcC5zdGFnZXMubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbnggPSBwLnN0YWdlc1trICsgMV07XG4gICAgICByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgc3RhZ2U6IGsgKyAxLCBmYWlsczogMCB9LCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogXCJzdWNjZXNzXCIsIGFtcmFwUmVwcywgbm90ZTogYCR7dm9sfS8ke25lZWR9JHtvZmZ9IFx1MjE5MiAke3NjaGVtZUxhYmVsKG54KX0gQCAke2ZtdCh3KX1gIH0gfTtcbiAgICB9XG4gICAgaWYgKHcgPD0gMCB8fCBwLmNsaW1iLmxvYWRQY3QgPD0gMCkgcmV0dXJuIHsgbmV4dDogeyAuLi5jdXIsIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0gXHUyMTkyIHN0YXkgYXQgJHtzY2hlbWVMYWJlbChzdCl9YCB9IH07XG4gICAgY29uc3QgbncgPSByb3VuZFRvKHcgKiAoMSArIHAuY2xpbWIubG9hZFBjdCksIHN0ZXAoZGVmLCBjZmcsIHNsb3QubGlmdCkpO1xuICAgIHJldHVybiB7IG5leHQ6IHsgd2VpZ2h0OiBudywgc3RhZ2U6IDAsIHN0YWdlMFdlaWdodDogbncsIHJldGVzdDogZmFsc2UsIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyICR7c2NoZW1lTGFiZWwocC5zdGFnZXNbMF0pfSBAICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuXG4gIGlmIChob3cgPT09IFwibm9uZVwiKSB7XG4gICAgLy8gTm90IGFuIGF0dGVtcHQgYXQgdGhpcyBzY2hlbWUgKGRpZmZlcmVudCByZXAgcmFuZ2UsIGEgc2luZ2xlIHNldFx1MjAyNik6IGxvZyBpdCwgY2hhbmdlIG5vdGhpbmcuXG4gICAgcmV0dXJuIHsgbmV4dDogcywgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGBvZmYtc2NoZW1lICgke3dvcmsubGVuZ3RofVx1MDBENyR7bWVkaWFuUmVwcyh3b3JrKX0pLCBub3QgY291bnRlZGAgfSB9O1xuICB9XG4gIC8vIEJhc2Ugdm9sdW1lOiBlYWNoIG9mIHRoZSBmaXJzdCBgc2V0c2Agd29ya2luZyBzZXRzIGNvdW50cyB1cCB0byBpdHMgcHJlc2NyaWJlZCByZXBzLlxuICBjb25zdCB2b2wgPSB3b3JrLnNsaWNlKDAsIHN0LnNldHMpLnJlZHVjZSgoYSwgeCkgPT4gYSArIE1hdGgubWluKHgucmVwcywgc3QucmVwcyksIDApO1xuICBjb25zdCBuZWVkID0gc3Quc2V0cyAqIHN0LnJlcHM7XG4gIGlmICh2b2wgPj0gbmVlZCkge1xuICAgIGNvbnN0IG4gPSBwLmFtcmFwQm9udXMgJiYgc3QuYW1yYXAgJiYgKGFtcmFwUmVwcyA/PyAwKSA+PSBwLmFtcmFwQm9udXMucmVwcyA/IHAuYW1yYXBCb251cy5pbmNyZW1lbnRzIDogMTtcbiAgICByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgd2VpZ2h0OiB3ICsgaSAqIG4sIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyICR7Zm10KHcgKyBpICogbil9JHtuID4gMSA/IGAgKCR7YW1yYXBSZXBzfSBvbiBBTVJBUDogXHUwMEQ3JHtufSlgIDogXCJcIn1gIH0gfTtcbiAgfVxuICBjb25zdCBmYWlscyA9IChjdXIuZmFpbHMgPz8gMCkgKyAxO1xuICBjb25zdCBhbGxvd2VkID0gcC5mYWlsc0JlZm9yZUFjdGlvbiA/PyAxO1xuICBpZiAoZmFpbHMgPCBhbGxvd2VkKSB7XG4gICAgcmV0dXJuIHsgbmV4dDogeyAuLi5jdXIsIGZhaWxzIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcImZhaWxcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyIHJldHJ5ICR7Zm10KHcpfSAobWlzcyAke2ZhaWxzfS8ke2FsbG93ZWR9KWAgfSB9O1xuICB9XG4gIGlmIChrIDwgcC5zdGFnZXMubGVuZ3RoIC0gMSkge1xuICAgIGNvbnN0IG54ID0gcC5zdGFnZXNbayArIDFdO1xuICAgIHJldHVybiB7IG5leHQ6IHsgLi4uY3VyLCBzdGFnZTogayArIDEsIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN0YWdlLWRvd25cIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyICR7c2NoZW1lTGFiZWwobngpfSBAICR7Zm10KHcpfWAgfSB9O1xuICB9XG4gIGNvbnN0IGYgPSBwLm9uRmluYWxGYWlsO1xuICBpZiAoZi50eXBlID09PSBcInJldGVzdFwiKSByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgcmV0ZXN0OiB0cnVlLCBmYWlsczogMCB9LCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogXCJyZXRlc3QtbmV4dFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke3ZvbH0vJHtuZWVkfSBcdTIxOTIgcmV0ZXN0ICR7Zi5ybVJlcHN9Uk1gIH0gfTtcbiAgaWYgKGYudHlwZSA9PT0gXCJyZXNldFwiKSB7XG4gICAgY29uc3QgbncgPSBjdXIuc3RhZ2UwV2VpZ2h0ICsgZi5idW1wSW5jcmVtZW50cyAqIGk7XG4gICAgcmV0dXJuIHsgbmV4dDogeyB3ZWlnaHQ6IG53LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiBudywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwicmVzZXRcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0gXHUyMTkyIHJlc2V0ICR7c2NoZW1lTGFiZWwocC5zdGFnZXNbMF0pfSBAICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuICBpZiAoZi50eXBlID09PSBcImRlbG9hZEJ5XCIpIHtcbiAgICBjb25zdCBudyA9IE1hdGgubWF4KDAsIHcgLSBpbmMoZi5hbW91bnQsIGNmZy51bml0KSk7XG4gICAgcmV0dXJuIHsgbmV4dDogeyB3ZWlnaHQ6IG53LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiBudywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiZGVsb2FkXCIsIGFtcmFwUmVwcywgbm90ZTogYCR7dm9sfS8ke25lZWR9IFx1MjE5MiBkcm9wIHRvICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuICBpZiAoZi50eXBlID09PSBcImRlbG9hZFwiKSB7XG4gICAgY29uc3QgbncgPSByb3VuZFRvKHcgKiAoMSAtIGYucGN0KSwgc3RlcChkZWYsIGNmZywgc2xvdC5saWZ0KSk7XG4gICAgcmV0dXJuIHsgbmV4dDogeyB3ZWlnaHQ6IG53LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiBudywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiZGVsb2FkXCIsIGFtcmFwUmVwcywgbm90ZTogYCR7dm9sfS8ke25lZWR9IFx1MjE5MiBkZWxvYWQgJHtNYXRoLnJvdW5kKGYucGN0ICogMTAwKX0lIHRvICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuICByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke3ZvbH0vJHtuZWVkfWAgfSB9O1xufVxuXG5mdW5jdGlvbiBldmFsRG91YmxlKGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzbG90OiBTbG90RGVmLCBzOiBTbG90U3RhdGUsIHNldHM6IFBlcmZvcm1lZFtdKTogRXZhbCB7XG4gIGNvbnN0IHAgPSBzbG90LnByb2dyZXNzaW9uIGFzIEV4dHJhY3Q8UHJvZ3Jlc3Npb24sIHsga2luZDogXCJkb3VibGVcIiB9PjtcbiAgY29uc3QgaSA9IHNsb3RJbmNyZW1lbnQoZGVmLCBjZmcsIHNsb3QpO1xuICBjb25zdCB3b3JrID0gd29ya2luZ1NldHMoc2V0cyk7XG4gIGNvbnN0IHcgPSBtb2RlV2VpZ2h0KHdvcmspO1xuICBjb25zdCBbbG8sIGhpXSA9IHAucmVwcztcbiAgY29uc3QgcmVwcyA9IHdvcmsuc2xpY2UoMCwgcC5zZXRzKS5tYXAoKHgpID0+IHgucmVwcyk7XG4gIGNvbnN0IGJhc2UgPSB7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHNjaGVtZTogYCR7cC5zZXRzfVx1MDBENyR7bG99XHUyMDEzJHtoaX1gLCB3ZWlnaHQ6IHcsIHJlcHMgfTtcbiAgY29uc3QgdG9wID0gcmVwcy5sZW5ndGggPj0gcC5zZXRzICYmIHJlcHMuZXZlcnkoKHIpID0+IHIgPj0gaGkpO1xuICBpZiAodG9wKSByZXR1cm4geyBuZXh0OiB7IC4uLnMsIHdlaWdodDogdyArIGkgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBub3RlOiBgYWxsIHNldHMgJHtoaX0rIFx1MjE5MiAke2ZtdCh3ICsgaSl9YCB9IH07XG4gIHJldHVybiB7IG5leHQ6IHsgLi4ucywgd2VpZ2h0OiB3IH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcImhvbGRcIiwgbm90ZTogYCR7cmVwcy5qb2luKFwiL1wiKX0gYXQgJHtmbXQodyl9LCBuZWVkICR7aGl9IG9uIGFsbCAke3Auc2V0c31gIH0gfTtcbn1cblxuZnVuY3Rpb24gZXZhbEZpeGVkKHNsb3Q6IFNsb3REZWYsIHM6IFNsb3RTdGF0ZSwgc2V0czogUGVyZm9ybWVkW10pOiBFdmFsIHtcbiAgY29uc3Qgd29yayA9IHdvcmtpbmdTZXRzKHNldHMpO1xuICBjb25zdCB3ID0gbW9kZVdlaWdodCh3b3JrKTtcbiAgcmV0dXJuIHtcbiAgICBuZXh0OiB7IC4uLnMsIHdlaWdodDogdyB9LFxuICAgIHJlczogeyBzbG90SWQ6IHNsb3QuaWQsIGxpZnQ6IHNsb3QubGlmdCwgdGllcjogc2xvdC50aWVyLCBzY2hlbWU6IFwiXCIsIHdlaWdodDogdywgcmVwczogd29yay5tYXAoKHgpID0+IHgucmVwcyksIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBub3RlOiBgJHt3b3JrLmxlbmd0aH0gc2V0cyR7dyA/IGAgQCAke2ZtdCh3KX1gIDogXCJcIn1gIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGV2YWxQZXJjZW50KGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzbG90OiBTbG90RGVmLCBzdGF0ZTogUHJvZ3JhbVN0YXRlLCBwbGFubmVkOiBQbGFubmVkRXhlcmNpc2UsIHNldHM6IFBlcmZvcm1lZFtdKTogeyB0bURlbHRhOiBudW1iZXI7IHRtU2V0PzogbnVtYmVyOyBhbHNvPzogUmVjb3JkPHN0cmluZywgbnVtYmVyPjsgcmVzOiBTbG90UmVzdWx0IH0ge1xuICBjb25zdCBwID0gc2xvdC5wcm9ncmVzc2lvbiBhcyBFeHRyYWN0PFByb2dyZXNzaW9uLCB7IGtpbmQ6IFwicGVyY2VudFwiIH0+O1xuICBjb25zdCBiYXNlID0geyBzbG90SWQ6IHNsb3QuaWQsIGxpZnQ6IHNsb3QubGlmdCwgdGllcjogc2xvdC50aWVyLCBzY2hlbWU6IHBsYW5uZWQuc2NoZW1lLCB3ZWlnaHQ6IE1hdGgubWF4KDAsIC4uLnBsYW5uZWQuc2V0cy5tYXAoKHgpID0+IHgud2VpZ2h0KSksIHJlcHM6IHNldHMubWFwKCh4KSA9PiB4LnJlcHMpIH07XG4gIGNvbnN0IHRtID0gc3RhdGUudG1zW3AudG1MaWZ0XSA/PyAwO1xuICBjb25zdCB0bWkgPSBkZWYudG1JbmNyZW1lbnQ/LltwLnRtTGlmdF0gPyBpbmMoZGVmLnRtSW5jcmVtZW50W3AudG1MaWZ0XSwgY2ZnLnVuaXQpIDogY2ZnLnVuaXQgPT09IFwibGJcIiA/IDUgOiAyLjU7XG4gIGNvbnN0IHJ1bGUgPSBwLnRtUnVsZTtcbiAgaWYgKHJ1bGU/LnR5cGUgPT09IFwidG90YWxSZXBzXCIpIHtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1heCgwLCAuLi5wbGFubmVkLnNldHMubWFwKCh4KSA9PiB4LndlaWdodCkpO1xuICAgIGNvbnN0IHRvbCA9IE1hdGgubWF4KDEsIHRvcCAqIDAuMDMpO1xuICAgIGNvbnN0IHRvdGFsID0gc2V0cy5maWx0ZXIoKHgpID0+IHgud2VpZ2h0ID49IHRvcCAtIHRvbCkucmVkdWNlKChhLCB4KSA9PiBhICsgeC5yZXBzLCAwKTtcbiAgICBjb25zdCByb3dzID0gWy4uLnJ1bGUudGFibGVdLnNvcnQoKHgsIHkpID0+IHgubWluUmVwcyAtIHkubWluUmVwcyk7XG4gICAgbGV0IHJvdyA9IHJvd3NbMF07XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIGlmICh0b3RhbCA+PSByLm1pblJlcHMpIHJvdyA9IHI7XG4gICAgY29uc3QgZCA9IHJvdyA/IChyb3cucGN0ICE9IG51bGwgPyBNYXRoLnJvdW5kKHRtICogcm93LnBjdCAqIDEwMCkgLyAxMDAgOiAocm93LmluY3JlbWVudHMgPz8gMCkgKiB0bWkpIDogMDtcbiAgICByZXR1cm4geyB0bURlbHRhOiBkLCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogZCA+IDAgPyBcInRtLXVwXCIgOiBkIDwgMCA/IFwidG0tZG93blwiIDogXCJob2xkXCIsIG5vdGU6IGAke3RvdGFsfSB0b3RhbCByZXBzIFx1MjE5MiAke2QgPyBgJHtkZWYubWF4TGFiZWwgPz8gXCJUTVwifSAke2ZtdCh0bSl9IFx1MjE5MiAke2ZtdCh0bSArIGQpfWAgOiBcImhvbGRzXCJ9YCB9IH07XG4gIH1cbiAgaWYgKHJ1bGU/LnR5cGUgPT09IFwibWlzc0N1dFwiKSB7XG4gICAgY29uc3QgY2hlY2sgPSBydWxlLnNldEluZGV4ICE9IG51bGwgPyBbcGxhbm5lZC5zZXRzW3J1bGUuc2V0SW5kZXhdXS5maWx0ZXIoQm9vbGVhbikgOiBwbGFubmVkLnNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+IDAgJiYgIXguYW1yYXApO1xuICAgIGNvbnN0IHNob3J0ID0gY2hlY2suZmlsdGVyKChwcykgPT4ge1xuICAgICAgY29uc3QgdG9sID0gTWF0aC5tYXgoMSwgcHMud2VpZ2h0ICogMC4wMyk7XG4gICAgICByZXR1cm4gIXNldHMuc29tZSgoeCkgPT4geC53ZWlnaHQgPj0gcHMud2VpZ2h0IC0gdG9sICYmIHgucmVwcyA+PSBwcy5yZXBzKTtcbiAgICB9KTtcbiAgICBpZiAoIXNob3J0Lmxlbmd0aCkgcmV0dXJuIHsgdG1EZWx0YTogMCwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBub3RlOiBgJHtzZXRzLmxlbmd0aH0vJHtwbGFubmVkLnNldHMubGVuZ3RofSBzZXRzLCBhbGwgcmVwcyBtYWRlYCB9IH07XG4gICAgY29uc3QgZCA9IC1NYXRoLnJvdW5kKHRtICogcnVsZS5wY3QgKiAxMDApIC8gMTAwO1xuICAgIHJldHVybiB7IHRtRGVsdGE6IGQsIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInRtLWRvd25cIiwgbm90ZTogYG1pc3NlZCByZXBzIGF0ICR7c2hvcnQubWFwKCh4KSA9PiBmbXQoeC53ZWlnaHQpKS5qb2luKFwiLCBcIil9IFx1MjE5MiAke2RlZi5tYXhMYWJlbCA/PyBcIlRNXCJ9ICR7Zm10KHRtKX0gXHUyMTkyICR7Zm10KHRtICsgZCl9YCB9IH07XG4gIH1cbiAgY29uc3QgdGFyZ2V0ID0gcnVsZSAmJiBcInNldEluZGV4XCIgaW4gcnVsZSAmJiBydWxlLnNldEluZGV4ICE9IG51bGwgPyBwbGFubmVkLnNldHNbcnVsZS5zZXRJbmRleF0gOiB1bmRlZmluZWQ7XG4gIGlmICghcnVsZSB8fCAhdGFyZ2V0KSB7XG4gICAgY29uc3QgYW1yYXBJZHggPSBwbGFubmVkLnNldHMuZmluZEluZGV4KCh4KSA9PiB4LmFtcmFwKTtcbiAgICBjb25zdCBhID0gYW1yYXBJZHggPj0gMCA/IGJlc3ROZWFyKHNldHMsIHBsYW5uZWQuc2V0c1thbXJhcElkeF0ud2VpZ2h0KSA6IHVuZGVmaW5lZDtcbiAgICBjb25zdCBvayA9IGFtcmFwSWR4IDwgMCA/IHNldHMubGVuZ3RoID49IE1hdGguY2VpbChwbGFubmVkLnNldHMubGVuZ3RoICogMC44KSA6IChhID8/IDApID49IHBsYW5uZWQuc2V0c1thbXJhcElkeF0ucmVwcztcbiAgICByZXR1cm4geyB0bURlbHRhOiAwLCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogb2sgPyBcInN1Y2Nlc3NcIiA6IFwiaG9sZFwiLCBhbXJhcFJlcHM6IGEsIG5vdGU6IGFtcmFwSWR4ID49IDAgPyBgJHthID8/IDB9IHJlcHMgb24gJHtwbGFubmVkLnNldHNbYW1yYXBJZHhdLnJlcHN9KyBzZXRgIDogYCR7c2V0cy5sZW5ndGh9LyR7cGxhbm5lZC5zZXRzLmxlbmd0aH0gc2V0c2AgfSB9O1xuICB9XG4gIC8vIGFsbFNldHM6IGV2ZXJ5IHNldCBhdCB0aGUgdGFyZ2V0IHdlaWdodCBtdXN0IHJlYWNoIGl0IChBbGxQcm8gXCIxMiBvbiBib3RoIHNldHNcIikuXG4gIGNvbnN0IGEgPSAoKHJ1bGUudHlwZSA9PT0gXCJhbXJhcFZzVGFyZ2V0XCIgJiYgcnVsZS5hbGxTZXRzKSA/IHdvcnN0TmVhcihzZXRzLCB0YXJnZXQud2VpZ2h0KVxuICAgIDogKFwidXNlTGFzdFwiIGluIHJ1bGUgJiYgcnVsZS51c2VMYXN0KSA/IGxhc3ROZWFyKHNldHMsIHRhcmdldC53ZWlnaHQpXG4gICAgOiBiZXN0TmVhcihzZXRzLCB0YXJnZXQud2VpZ2h0KSkgPz8gMDtcblxuICBpZiAocnVsZS50eXBlID09PSBcImUxcm1cIikge1xuICAgIGNvbnN0IHNldCA9IHNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+PSB0YXJnZXQud2VpZ2h0IC0gTWF0aC5tYXgoMSwgdGFyZ2V0LndlaWdodCAqIDAuMDMpKS5zb3J0KCh4LCB5KSA9PiBlMXJtKHkud2VpZ2h0LCB5LnJlcHMpIC0gZTFybSh4LndlaWdodCwgeC5yZXBzKSlbMF07XG4gICAgaWYgKCFzZXQpIHJldHVybiB7IHRtRGVsdGE6IDAsIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcImhvbGRcIiwgbm90ZTogXCJ0b3Agc2V0IG5vdCBmb3VuZFwiIH0gfTtcbiAgICBjb25zdCBudG0gPSByb3VuZFRvKGUxcm0oc2V0LndlaWdodCwgc2V0LnJlcHMpICogcnVsZS5wY3QsIHN0ZXAoZGVmLCBjZmcsIHAudG1MaWZ0KSk7XG4gICAgcmV0dXJuIHsgdG1EZWx0YTogMCwgdG1TZXQ6IG50bSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IG50bSA+PSB0bSA/IFwidG0tdXBcIiA6IFwidG0tZG93blwiLCBhbXJhcFJlcHM6IHNldC5yZXBzLCBub3RlOiBgJHtmbXQoc2V0LndlaWdodCl9XHUwMEQ3JHtzZXQucmVwc30gXHUyMTkyIFRNICR7Zm10KHRtKX0gXHUyMTkyICR7Zm10KG50bSl9YCB9IH07XG4gIH1cblxuICBsZXQgZCA9IDA7XG4gIGxldCBsYWJlbCA9IGAke3RhcmdldC5yZXBzfStgO1xuICBsZXQgYWxzbzogUmVjb3JkPHN0cmluZywgbnVtYmVyPiB8IHVuZGVmaW5lZDtcbiAgaWYgKHJ1bGUudHlwZSA9PT0gXCJhbXJhcFRhYmxlXCIpIHtcbiAgICBsZXQgbiA9IDA7XG4gICAgZm9yIChjb25zdCByIG9mIHJ1bGUudGFibGUpIGlmIChhID49IHIubWluUmVwcykgbiA9IHIuaW5jcmVtZW50cztcbiAgICBkID0gbiAqIHRtaTtcbiAgICBpZiAobiAmJiBydWxlLmFsc29MaWZ0cykgYWxzbyA9IE9iamVjdC5mcm9tRW50cmllcyhydWxlLmFsc29MaWZ0cy5tYXAoKGwpID0+IFtsLCBuICogKGRlZi50bUluY3JlbWVudD8uW2xdID8gaW5jKGRlZi50bUluY3JlbWVudFtsXSwgY2ZnLnVuaXQpIDogdG1pKV0pKTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCB3YW50ID0gcC53ZWVrc1t3ZWVrSW5kZXgoZGVmLCBzdGF0ZS5yb3RhdGlvbnMpICUgcC53ZWVrcy5sZW5ndGhdPy5bcnVsZS5zZXRJbmRleF0/LnRhcmdldCA/PyB0YXJnZXQucmVwcztcbiAgICBsYWJlbCA9IGB0YXJnZXQgJHt3YW50fWA7XG4gICAgbGV0IGRpZmYgPSBhIC0gd2FudDtcbiAgICBjb25zdCB0b2wgPSBNYXRoLm1heCgxLCB0YXJnZXQud2VpZ2h0ICogMC4wMyk7XG4gICAgY29uc3QgYXRXZWlnaHQgPSBzZXRzLmZpbHRlcigoeCkgPT4geC53ZWlnaHQgPj0gdGFyZ2V0LndlaWdodCAtIHRvbCk7XG4gICAgaWYgKHJ1bGUucmlyKSB7XG4gICAgICAvLyBSZXBzIHBhc3QgdGhlIHBsYW5uZWQgbnVtYmVyIGNvdW50IGFzIFJJUiBhbHJlYWR5IGJhbmtlZDsgYSBsb2dnZWQgUlBFIGFkZHMgdGhlIHJlc3QuXG4gICAgICBjb25zdCBsYXN0ID0gYXRXZWlnaHRbYXRXZWlnaHQubGVuZ3RoIC0gMV07XG4gICAgICBjb25zdCByaXJUYXJnZXQgPSAxMCAtICh0YXJnZXQucnBlID8/IDEwKTtcbiAgICAgIGNvbnN0IGVmZmVjdGl2ZSA9IGxhc3QgPyBsYXN0LnJlcHMgLSB0YXJnZXQucmVwcyArIChsYXN0LnJwZSAhPSBudWxsID8gMTAgLSBsYXN0LnJwZSA6IHJpclRhcmdldCkgOiAtMTtcbiAgICAgIGRpZmYgPSBlZmZlY3RpdmUgLSByaXJUYXJnZXQ7XG4gICAgICBpZiAoZGlmZiA8IDApIGRpZmYgPSAtMTtcbiAgICAgIGxhYmVsID0gYFJJUiB0YXJnZXQgJHtmbXQocmlyVGFyZ2V0KX1gO1xuICAgIH1cbiAgICBpZiAocnVsZS5wZW5hbGl6ZU1pc3NpbmdTZXRzKSB7XG4gICAgICBjb25zdCBwbGFubmVkQXQgPSBwbGFubmVkLnNldHMuZmlsdGVyKCh4KSA9PiBNYXRoLmFicyh4LndlaWdodCAtIHRhcmdldC53ZWlnaHQpIDw9IHRvbCk7XG4gICAgICBjb25zdCBmbG9vciA9IE1hdGgubWluKC4uLnBsYW5uZWRBdC5tYXAoKHgpID0+IHgucmVwcykpO1xuICAgICAgY29uc3QgZG9uZSA9IGF0V2VpZ2h0LmZpbHRlcigoeCkgPT4geC5yZXBzID49IGZsb29yKS5sZW5ndGg7XG4gICAgICBjb25zdCBtaXNzaW5nID0gTWF0aC5tYXgoMCwgcGxhbm5lZEF0Lmxlbmd0aCAtIGRvbmUpO1xuICAgICAgaWYgKG1pc3NpbmcpIGRpZmYgPSBNYXRoLm1pbihkaWZmLCAtMSAtIG1pc3NpbmcpO1xuICAgIH1cbiAgICBjb25zdCByb3dzID0gWy4uLnJ1bGUudGFibGVdLnNvcnQoKHgsIHkpID0+IHguZGlmZiAtIHkuZGlmZik7XG4gICAgbGV0IHJvdyA9IHJvd3NbMF07XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIGlmIChkaWZmID49IHIuZGlmZikgcm93ID0gcjtcbiAgICAvLyBOb3Qgcm91bmRlZDogc21hbGwgJSBjaGFuZ2VzIG11c3QgYWNjdW11bGF0ZTsgcHJlc2NyaWJlZCBsb2FkcyBnZXQgcm91bmRlZCB3aGVuIHBsYW5uZWQuXG4gICAgZCA9IHJvdyA/IChyb3cucGN0ICE9IG51bGwgPyBNYXRoLnJvdW5kKHRtICogcm93LnBjdCAqIDEwMCkgLyAxMDAgOiAocm93LmluY3JlbWVudHMgPz8gMCkgKiB0bWkpIDogMDtcbiAgfVxuICByZXR1cm4ge1xuICAgIHRtRGVsdGE6IGQsXG4gICAgYWxzbyxcbiAgICByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogZCA+IDAgPyBcInRtLXVwXCIgOiBkIDwgMCA/IFwidG0tZG93blwiIDogXCJob2xkXCIsIGFtcmFwUmVwczogYSwgbm90ZTogZCA/IGAke2F9IHJlcHMgKCR7bGFiZWx9KSBcdTIxOTIgVE0gJHtmbXQodG0pfSBcdTIxOTIgJHtmbXQodG0gKyBkKX1gIDogYCR7YX0gcmVwcyAoJHtsYWJlbH0pIFx1MjE5MiBUTSBob2xkc2AgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbGFzdE5lYXIoc2V0czogUGVyZm9ybWVkW10sIHdlaWdodDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgdG9sID0gTWF0aC5tYXgoMSwgd2VpZ2h0ICogMC4wMyk7XG4gIGNvbnN0IHIgPSBzZXRzLmZpbHRlcigoeCkgPT4geC53ZWlnaHQgPj0gd2VpZ2h0IC0gdG9sKTtcbiAgcmV0dXJuIHIubGVuZ3RoID8gcltyLmxlbmd0aCAtIDFdLnJlcHMgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHdvcnN0TmVhcihzZXRzOiBQZXJmb3JtZWRbXSwgd2VpZ2h0OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuICBjb25zdCB0b2wgPSBNYXRoLm1heCgxLCB3ZWlnaHQgKiAwLjAzKTtcbiAgY29uc3QgciA9IHNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+PSB3ZWlnaHQgLSB0b2wpLm1hcCgoeCkgPT4geC5yZXBzKTtcbiAgcmV0dXJuIHIubGVuZ3RoID8gTWF0aC5taW4oLi4ucikgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGJlc3ROZWFyKHNldHM6IFBlcmZvcm1lZFtdLCB3ZWlnaHQ6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHRvbCA9IE1hdGgubWF4KDEsIHdlaWdodCAqIDAuMDMpO1xuICBjb25zdCByID0gc2V0cy5maWx0ZXIoKHgpID0+IHgud2VpZ2h0ID49IHdlaWdodCAtIHRvbCkubWFwKCh4KSA9PiB4LnJlcHMpO1xuICByZXR1cm4gci5sZW5ndGggPyBNYXRoLm1heCguLi5yKSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEFwcGx5IG9uZSBsb2dnZWQgd29ya291dCB0byB0aGUgcHJvZ3JhbSBhcyBgZGF5SW5kZXhgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5V29ya291dChkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZywgc3RhdGU6IFByb2dyYW1TdGF0ZSwgdzogSGV2eVdvcmtvdXQsIGRheUluZGV4OiBudW1iZXIpOiBQcm9ncmFtU3RhdGUge1xuICBjb25zdCBwbGFuID0gcGxhbkRheShkZWYsIGNmZywgc3RhdGUsIGRheUluZGV4KTtcbiAgY29uc3QgZGF5ID0gZGVmLmRheXNbZGF5SW5kZXhdO1xuICBjb25zdCBzbG90cyA9IHsgLi4uc3RhdGUuc2xvdHMgfTtcbiAgY29uc3QgdG1zID0geyAuLi5zdGF0ZS50bXMgfTtcbiAgY29uc3QgcGVuZGluZyA9IHsgLi4uc3RhdGUucGVuZGluZ1RtIH07XG4gIGNvbnN0IHJlc3VsdHM6IFNsb3RSZXN1bHRbXSA9IFtdO1xuICBjb25zdCB1c2VkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTsgLy8gbGlmdCAtPiBob3cgbWFueSBleGVyY2lzZSBibG9ja3MgY29uc3VtZWRcblxuICBmb3IgKGNvbnN0IHNsb3Qgb2YgZGF5LnNsb3RzKSB7XG4gICAgY29uc3QgcGxhbm5lZCA9IHBsYW4uZXhlcmNpc2VzLmZpbmQoKGUpID0+IGUuc2xvdElkID09PSBzbG90LmlkKTtcbiAgICBpZiAoIXBsYW5uZWQpIGNvbnRpbnVlO1xuICAgIGNvbnN0IGJsb2NrcyA9IHBlcmZvcm1lZEZvcih3LCBzbG90LmxpZnQsIGNmZyk7XG4gICAgY29uc3QgbiA9IHVzZWQuZ2V0KHNsb3QubGlmdCkgPz8gMDtcbiAgICB1c2VkLnNldChzbG90LmxpZnQsIG4gKyAxKTtcbiAgICBjb25zdCBzZXRzID0gYmxvY2tzW25dID8/IFtdO1xuICAgIGlmICghc2V0cy5sZW5ndGgpIHtcbiAgICAgIHJlc3VsdHMucHVzaCh7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHNjaGVtZTogcGxhbm5lZC5zY2hlbWUsIHdlaWdodDogcGxhbm5lZC5zZXRzWzBdPy53ZWlnaHQgPz8gMCwgb3V0Y29tZTogXCJtaXNzZWRcIiwgcmVwczogW10sIG5vdGU6IFwibm90IGxvZ2dlZFwiIH0pO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHAgPSBzbG90LnByb2dyZXNzaW9uO1xuICAgIGlmIChwLmtpbmQgPT09IFwicGVyY2VudFwiKSB7XG4gICAgICBjb25zdCB7IHRtRGVsdGEsIHRtU2V0LCBhbHNvLCByZXMgfSA9IGV2YWxQZXJjZW50KGRlZiwgY2ZnLCBzbG90LCBzdGF0ZSwgcGxhbm5lZCwgc2V0cyk7XG4gICAgICBjb25zdCBsYXRlciA9ICEhcC50bVJ1bGUgJiYgXCJhcHBseUF0XCIgaW4gcC50bVJ1bGUgJiYgcC50bVJ1bGUuYXBwbHlBdCA9PT0gXCJ3ZWVrRW5kXCI7XG4gICAgICBjb25zdCBkZWx0YXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7IC4uLmFsc28gfTtcbiAgICAgIGlmICh0bURlbHRhKSBkZWx0YXNbcC50bUxpZnRdID0gKGRlbHRhc1twLnRtTGlmdF0gPz8gMCkgKyB0bURlbHRhO1xuICAgICAgaWYgKHRtU2V0ICE9IG51bGwpIHRtc1twLnRtTGlmdF0gPSB0bVNldDtcbiAgICAgIGZvciAoY29uc3QgW2xpZnQsIGRdIG9mIE9iamVjdC5lbnRyaWVzKGRlbHRhcykpIHtcbiAgICAgICAgaWYgKGxhdGVyKSBwZW5kaW5nW2xpZnRdID0gKHBlbmRpbmdbbGlmdF0gPz8gMCkgKyBkO1xuICAgICAgICBlbHNlIHRtc1tsaWZ0XSA9ICh0bXNbbGlmdF0gPz8gMCkgKyBkO1xuICAgICAgfVxuICAgICAgcmVzdWx0cy5wdXNoKHJlcyk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgciA9IHAua2luZCA9PT0gXCJzdGFnZXNcIiA/IGV2YWxTdGFnZXMoZGVmLCBjZmcsIHNsb3QsIHNsb3RzW3Nsb3QuaWRdLCBzZXRzKSA6IHAua2luZCA9PT0gXCJkb3VibGVcIiA/IGV2YWxEb3VibGUoZGVmLCBjZmcsIHNsb3QsIHNsb3RzW3Nsb3QuaWRdLCBzZXRzKSA6IGV2YWxGaXhlZChzbG90LCBzbG90c1tzbG90LmlkXSwgc2V0cyk7XG4gICAgc2xvdHNbc2xvdC5pZF0gPSByLm5leHQ7XG4gICAgcmVzdWx0cy5wdXNoKHsgLi4uci5yZXMsIHNjaGVtZTogci5yZXMuc2NoZW1lIHx8IHBsYW5uZWQuc2NoZW1lIH0pO1xuICB9XG5cbiAgY29uc3QgbmV4dCA9IGZpcnN0U2NoZWR1bGVkKGRlZiwgZGF5SW5kZXggKyAxLCBzdGF0ZS5yb3RhdGlvbnMpO1xuICBpZiAobmV4dC5yb3RhdGlvbnMgPiBzdGF0ZS5yb3RhdGlvbnMpIHtcbiAgICBmb3IgKGNvbnN0IFtsaWZ0LCBkXSBvZiBPYmplY3QuZW50cmllcyhwZW5kaW5nKSkgdG1zW2xpZnRdID0gKHRtc1tsaWZ0XSA/PyAwKSArIGQ7XG4gICAgZm9yIChjb25zdCBrIG9mIE9iamVjdC5rZXlzKHBlbmRpbmcpKSBkZWxldGUgcGVuZGluZ1trXTtcbiAgfVxuICAvLyBPbmNlLXBlci1jeWNsZSBUTSBidW1wcyAoNS8zLzEpIHdoZW4gYSBwYXNzIGJvdW5kYXJ5IGxhbmRzIG9uIGEgY3ljbGUgYm91bmRhcnkuXG4gIGlmIChkZWYuY3ljbGU/LnRtSW5jcmVhc2UgJiYgKCFkZWYuY3ljbGUuZmluaXRlIHx8IGRlZi5jeWNsZS50bUluY3JlYXNlRXZlcnkgfHwgZGVmLmN5Y2xlLnRtSW5jcmVhc2VBdCkpIHtcbiAgICBjb25zdCB7IHdlZWtzLCB0bUluY3JlYXNlQXQ6IGF0IH0gPSBkZWYuY3ljbGU7XG4gICAgY29uc3QgZXZlcnkgPSBkZWYuY3ljbGUudG1JbmNyZWFzZUV2ZXJ5ID8/IHdlZWtzO1xuICAgIGZvciAobGV0IHIgPSBzdGF0ZS5yb3RhdGlvbnMgKyAxOyByIDw9IG5leHQucm90YXRpb25zOyByKyspIHtcbiAgICAgIGlmIChkZWYuY3ljbGUuZmluaXRlICYmIHIgPj0gd2Vla3MpIGJyZWFrO1xuICAgICAgLy8gciBwYXNzZXMgZG9uZTogdGhlIHdlZWsgdGhhdCBqdXN0IGVuZGVkIGlzIChyIFx1MjIxMiAxKSBvZiB0aGUgY3ljbGVcbiAgICAgIGlmIChhdCA/IGF0LmluY2x1ZGVzKChyIC0gMSkgJSB3ZWVrcykgOiByICUgZXZlcnkgPT09IDApIGZvciAoY29uc3QgW2xpZnQsIHc4XSBvZiBPYmplY3QuZW50cmllcyhkZWYuY3ljbGUudG1JbmNyZWFzZSkpIGlmICh0bXNbbGlmdF0gIT0gbnVsbCkgdG1zW2xpZnRdICs9IGluYyh3OCwgY2ZnLnVuaXQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBlbnRyeTogTG9nRW50cnkgPSB7IHdvcmtvdXRJZDogdy5pZCwgZGF0ZTogdy5zdGFydF90aW1lLCBkYXlJZDogZGF5LmlkLCB3ZWVrOiBwbGFuLndlZWssIHJlc3VsdHMgfTtcbiAgY29uc3QgY29tcGxldGUgPSAhIWRlZi5jeWNsZT8uZmluaXRlICYmIG5leHQucm90YXRpb25zID49IGRlZi5jeWNsZS53ZWVrcztcbiAgcmV0dXJuIHsgZGF5SW5kZXg6IG5leHQuZGF5SW5kZXgsIHJvdGF0aW9uczogbmV4dC5yb3RhdGlvbnMsIHNsb3RzLCB0bXMsIGxvZzogWy4uLnN0YXRlLmxvZywgZW50cnldLCBjb21wbGV0ZSwgcGVuZGluZ1RtOiBwZW5kaW5nIH07XG59XG5cbi8qKiBXaGljaCBwcm9ncmFtIGRheSBhIEhldnkgd29ya291dCB3YXMsIG9yIC0xIGlmIGl0IGlzbid0IGEgcHJvZ3JhbSBzZXNzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hdGNoRGF5KGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzdGF0ZTogUHJvZ3JhbVN0YXRlLCB3OiBIZXZ5V29ya291dCk6IG51bWJlciB7XG4gIC8vIExvZ2dlZCBpbiBneW0gbW9kZTogdGhlIHdvcmtvdXQgY2FycmllcyBpdHMgcHJvZ3JhbSBkYXkuXG4gIGNvbnN0IHRhZyA9IHcuZGVzY3JpcHRpb24/Lm1hdGNoKC9cXFtodDooW15cXF1dKylcXF0vKT8uWzFdO1xuICBpZiAodGFnKSB7XG4gICAgY29uc3QgaSA9IGRlZi5kYXlzLmZpbmRJbmRleCgoZCkgPT4gZC5pZCA9PT0gdGFnKTtcbiAgICBpZiAoaSA+PSAwKSByZXR1cm4gaTtcbiAgfVxuICBpZiAody5yb3V0aW5lX2lkICYmIGNmZy5yb3V0aW5lRGF5cz8uW3cucm91dGluZV9pZF0pIHtcbiAgICBjb25zdCBpID0gZGVmLmRheXMuZmluZEluZGV4KChkKSA9PiBkLmlkID09PSBjZmcucm91dGluZURheXMhW3cucm91dGluZV9pZCFdKTtcbiAgICBpZiAoaSA+PSAwKSByZXR1cm4gaTtcbiAgfVxuICBjb25zdCBvcmRlciA9IHcuZXhlcmNpc2VzLm1hcCgoZSkgPT4gbWF0Y2hMaWZ0KGUudGl0bGUsIGUuZXhlcmNpc2VfdGVtcGxhdGVfaWQsIGNmZy5saWZ0TWFwKSkuZmlsdGVyKCh4KTogeCBpcyBzdHJpbmcgPT4gISF4KTtcbiAgY29uc3QgbGlmdHMgPSBuZXcgU2V0KG9yZGVyKTtcbiAgY29uc3Qgd2VlayA9IHdlZWtJbmRleChkZWYsIHN0YXRlLnJvdGF0aW9ucyk7XG4gIC8vIFNjb3JlIGVhY2ggZGF5IGJ5IGhvdyB3ZWxsIGV2ZXJ5IHNsb3QncyBsb2dnZWQgc2V0cyBmaXQgaXRzIHNjaGVtZSAoNVx1MDBENzMrIHZzIDNcdTAwRDcxMCB0ZWxsc1xuICAvLyBBMSBmcm9tIEEyIGV2ZW4gdGhvdWdoIGJvdGggaGF2ZSBzcXVhdCBhbmQgYmVuY2gpLiBCb251c2VzIGZvciB0aGUgbWFpbiBsaWZ0IGdvaW5nIGZpcnN0LFxuICAvLyBiZWluZyBzY2hlZHVsZWQgdGhpcyB3ZWVrLCBhbmQgYmVpbmcgdGhlIGV4cGVjdGVkIG5leHQgZGF5IGJyZWFrIHRpZXMuXG4gIGxldCBiZXN0ID0gLTEsIGJlc3RTY29yZSA9IDA7XG4gIGZvciAobGV0IGsgPSAwOyBrIDwgZGVmLmRheXMubGVuZ3RoOyBrKyspIHtcbiAgICBjb25zdCBpID0gKHN0YXRlLmRheUluZGV4ICsgaykgJSBkZWYuZGF5cy5sZW5ndGg7XG4gICAgY29uc3QgZCA9IGRlZi5kYXlzW2ldO1xuICAgIC8vIEFuY2hvciBvbiB0aGUgZGF5J3MgZmlyc3QgbGlmdCB3ZSBjYW4gcmVjb2duaXplIGluIEhldnkgKHBhdXNlIGRlYWRsaWZ0IGV0Yy4gbmVlZCBhIGN1c3RvbSBtYXBwaW5nKS5cbiAgICBjb25zdCBhbmNob3IgPSBkLnNsb3RzLmZpbmQoKHgpID0+IChMSUZUU1t4LmxpZnRdPy5oZXZ5Lmxlbmd0aCA/PyAwKSA+IDAgfHwgY2ZnLmxpZnRNYXA/Llt4LmxpZnRdKSA/PyBkLnNsb3RzWzBdO1xuICAgIGlmICghYW5jaG9yIHx8ICFsaWZ0cy5oYXMoYW5jaG9yLmxpZnQpKSBjb250aW51ZTtcbiAgICBjb25zdCB1c2VkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgICBsZXQgc2NvcmUgPSAwO1xuICAgIGZvciAoY29uc3Qgc2xvdCBvZiBkLnNsb3RzKSB7XG4gICAgICBjb25zdCBuID0gdXNlZC5nZXQoc2xvdC5saWZ0KSA/PyAwO1xuICAgICAgdXNlZC5zZXQoc2xvdC5saWZ0LCBuICsgMSk7XG4gICAgICBzY29yZSArPSBzbG90Rml0KHNsb3QsIHN0YXRlLCBwZXJmb3JtZWRGb3Iodywgc2xvdC5saWZ0LCBjZmcpW25dID8/IFtdKSAqIChzbG90ID09PSBhbmNob3IgPyAxLjUgOiAxKTtcbiAgICB9XG4gICAgc2NvcmUgKz0gKG9yZGVyWzBdID09PSBhbmNob3IubGlmdCA/IDAuNSA6IDApICsgKGsgPT09IDAgPyAwLjI1IDogMCkgKyAoaXNTY2hlZHVsZWQoZCwgd2VlaykgPyAxLjUgOiAwKTtcbiAgICBpZiAoc2NvcmUgPiBiZXN0U2NvcmUpIHsgYmVzdCA9IGk7IGJlc3RTY29yZSA9IHNjb3JlOyB9XG4gIH1cbiAgcmV0dXJuIGJlc3Q7XG59XG5cbmZ1bmN0aW9uIGFwcGx5QWRqdXN0bWVudHMoc3RhdGU6IFByb2dyYW1TdGF0ZSwgYWRqOiBBZGp1c3RtZW50W10pOiBQcm9ncmFtU3RhdGUge1xuICBjb25zdCBzbG90cyA9IHsgLi4uc3RhdGUuc2xvdHMgfTtcbiAgY29uc3QgdG1zID0geyAuLi5zdGF0ZS50bXMgfTtcbiAgZm9yIChjb25zdCBhIG9mIGFkaikge1xuICAgIGlmIChhLnNsb3RJZCAmJiBzbG90c1thLnNsb3RJZF0pIHtcbiAgICAgIGNvbnN0IHMgPSB7IC4uLnNsb3RzW2Euc2xvdElkXSB9O1xuICAgICAgaWYgKGEud2VpZ2h0ICE9IG51bGwpIHsgcy53ZWlnaHQgPSBhLndlaWdodDsgaWYgKChhLnN0YWdlID8/IHMuc3RhZ2UpID09PSAwKSBzLnN0YWdlMFdlaWdodCA9IGEud2VpZ2h0OyB9XG4gICAgICBpZiAoYS5zdGFnZSAhPSBudWxsKSBzLnN0YWdlID0gYS5zdGFnZTtcbiAgICAgIHMucmV0ZXN0ID0gZmFsc2U7XG4gICAgICBzLmZhaWxzID0gMDtcbiAgICAgIHNsb3RzW2Euc2xvdElkXSA9IHM7XG4gICAgfVxuICAgIGlmIChhLmxpZnQgJiYgYS50bSAhPSBudWxsKSB0bXNbYS5saWZ0XSA9IGEudG07XG4gIH1cbiAgcmV0dXJuIHsgLi4uc3RhdGUsIHNsb3RzLCB0bXMgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBSZXBsYXlPcHRpb25zIHtcbiAgLyoqIFJhbXAgYmFjayBpbiBhZnRlciBicmVha3MuIERlZmF1bHQgb247IHNldCBmYWxzZSB0byBkaXNhYmxlLiAqL1xuICByZWVudHJ5PzogZmFsc2UgfCB7IG1pbkdhcERheXM/OiBudW1iZXIgfTtcbiAgLyoqIHRvZGF5J3MgbG9jYWwgZGF0ZSwgc28gYSBicmVhayB5b3UncmUgc3RpbGwgb24gc2hvd3MgdXAgaW4gdGhlIG5leHQgcGxhbiAqL1xuICB0b2RheT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBMaWdodGVyIHNlc3Npb25zIHRvIHRha2UgYWZ0ZXIgYSBicmVhayBvZiBgZ2FwRGF5c2AgKDAgPSBub25lKS4gU3RyZW5ndGggaG9sZHMgZm9yIH40IHdlZWtzIG9mZlxuICogYW5kIGNvbWVzIGJhY2sgaW4gYWJvdXQgaGFsZiB0aGUgYnJlYWsgYWZ0ZXIgdGhhdCAoZG9jcy90cmFpbmluZy9DT01FQkFDSy5tZCksIHNvIGxvbmdlclxuICogYnJlYWtzIGdldCBsb25nZXIgcmFtcHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByYW1wTGVuZ3RoKGdhcERheXM6IG51bWJlciwgbWluR2FwRGF5cyA9IDkpOiBudW1iZXIge1xuICBpZiAoZ2FwRGF5cyA8IG1pbkdhcERheXMpIHJldHVybiAwO1xuICByZXR1cm4gZ2FwRGF5cyA8IDE0ID8gMiA6IGdhcERheXMgPCAyOCA/IDMgOiBnYXBEYXlzIDwgNTYgPyA0IDogZ2FwRGF5cyA8IDExMiA/IDYgOiA4O1xufVxuXG4vKipcbiAqIExvd2VyLWJvZHkgbGlmdHMgcmFtcCBvbmUgZXhwb3N1cmUgc2xvd2VyOiBzcXVhdHMgYW5kIGx1bmdlcyBsb2FkIGJpZyBtdXNjbGVzIGVjY2VudHJpY2FsbHkgYXRcbiAqIGxvbmcgbGVuZ3Rocywgd2hpY2ggaXMgd2hhdCBtYWtlcyB0aGUgZmlyc3Qgc2Vzc2lvbnMgYmFjayBzbyBzb3JlICh0aGUgcmVwZWF0ZWQgYm91dCBlZmZlY3RcbiAqIGZhZGVzIHdpdGhpbiB+MyB3ZWVrcykuIFVwcGVyLWJvZHkgc3RyZW5ndGggY29tZXMgYmFjayBhdCB0aGUgc2FtZSByYXRlLCB3aXRoIGZhciBsZXNzIHNvcmVuZXNzLlxuICovXG5leHBvcnQgY29uc3QgcmFtcHNTbG93ZXIgPSAobGlmdDogc3RyaW5nKTogYm9vbGVhbiA9PiBMSUZUU1tsaWZ0XSA/ICFMSUZUU1tsaWZ0XS51cHBlciA6IGZhbHNlO1xuXG4vKiogUmFtcCBleHBvc3VyZXMgYSBsaWZ0IG5lZWRzIGJlZm9yZSBpdCdzIGJhY2sgdG8gZnVsbCBsb2FkIGFuZCB2b2x1bWUuICovXG5leHBvcnQgZnVuY3Rpb24gcmFtcE5lZWQocjogUmVlbnRyeSwgbGlmdDogc3RyaW5nKTogbnVtYmVyIHtcbiAgcmV0dXJuIE1hdGgubWF4KDEsIHJhbXBMZW5ndGgoci5nYXBEYXlzLCAwKSkgKyAocmFtcHNTbG93ZXIobGlmdCkgPyAxIDogMCk7XG59XG5cbi8qKiBIb3cgZmFyIHRocm91Z2ggaXRzIHJhbXAgYSBsaWZ0IGlzICgwID0gZmlyc3QgZXhwb3N1cmUsIDEgPSBkb25lKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByYW1wUHJvZ3Jlc3MocjogUmVlbnRyeSwgbGlmdD86IHN0cmluZyk6IG51bWJlciB7XG4gIGlmICghbGlmdCB8fCAhci5zZWVuKSByZXR1cm4gci50b3RhbCA/IHIuZG9uZSAvIHIudG90YWwgOiAxO1xuICByZXR1cm4gTWF0aC5taW4oMSwgKHIuc2VlbltsaWZ0XSA/PyAwKSAvIHJhbXBOZWVkKHIsIGxpZnQpKTtcbn1cblxuLyoqIE1haW4gYW5kIHN1cHBsZW1lbnRhbCB3b3JrIGRlY2lkZXMgaG93IGxvbmcgdGhlIHJhbXAgbGFzdHM7IGFjY2Vzc29yaWVzIGp1c3QgY29tZSBhbG9uZy4gKi9cbmNvbnN0IHJhbXBMaWZ0cyA9IChkZWY6IFByb2dyYW1EZWYpOiBzdHJpbmdbXSA9PlxuICBbLi4ubmV3IFNldChkZWYuZGF5cy5mbGF0TWFwKChkKSA9PiBkLnNsb3RzKS5maWx0ZXIoKHgpID0+IHgudGllciAhPT0gXCJBQ0NcIiAmJiB4LnRpZXIgIT09IFwiVDNcIikubWFwKCh4KSA9PiB4LmxpZnQpKV07XG5cbi8qKlxuICogU3RhcnQgYSByYW1wIGZyb20gYHN0YXRlYCdzIG5leHQgZGF5OiBlbm91Z2ggc2Vzc2lvbnMgZm9yIGV2ZXJ5IG1haW4gbGlmdCB0byBnZXQgaXRzIGV4cG9zdXJlc1xuICogKHNxdWF0IG9uIDIgb2YgNCBkYXlzIG5lZWRzIG1vcmUgc2Vzc2lvbnMgdGhhbiBzcXVhdCBldmVyeSBkYXkpLCBhdCBtb3N0IHR3aWNlIHRoZSBiYXNlIGxlbmd0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0UmFtcChkZWY6IFByb2dyYW1EZWYsIHN0YXRlOiBQcm9ncmFtU3RhdGUsIGdhcERheXM6IG51bWJlciwgbWluR2FwRGF5cyA9IDkpOiBSZWVudHJ5IHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgYmFzZSA9IHJhbXBMZW5ndGgoZ2FwRGF5cywgbWluR2FwRGF5cyk7XG4gIGlmICghYmFzZSkgcmV0dXJuIHVuZGVmaW5lZDtcbiAgY29uc3QgcjogUmVlbnRyeSA9IHsgZ2FwRGF5cywgdG90YWw6IGJhc2UsIGRvbmU6IDAsIHNlZW46IHt9IH07XG4gIGNvbnN0IGxpZnRzID0gcmFtcExpZnRzKGRlZik7XG4gIGNvbnN0IHNlZW46IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcbiAgbGV0IHBvcyA9IHsgZGF5SW5kZXg6IHN0YXRlLmRheUluZGV4LCByb3RhdGlvbnM6IHN0YXRlLnJvdGF0aW9ucyB9O1xuICBsZXQgbiA9IDA7XG4gIHdoaWxlIChuIDwgYmFzZSAqIDIgJiYgbGlmdHMuc29tZSgobCkgPT4gKHNlZW5bbF0gPz8gMCkgPCByYW1wTmVlZChyLCBsKSkpIHtcbiAgICBmb3IgKGNvbnN0IGwgb2YgbmV3IFNldChkZWYuZGF5c1twb3MuZGF5SW5kZXhdLnNsb3RzLm1hcCgoeCkgPT4geC5saWZ0KSkpIHNlZW5bbF0gPSAoc2VlbltsXSA/PyAwKSArIDE7XG4gICAgbisrO1xuICAgIHBvcyA9IGZpcnN0U2NoZWR1bGVkKGRlZiwgcG9zLmRheUluZGV4ICsgMSwgcG9zLnJvdGF0aW9ucyk7XG4gIH1cbiAgcmV0dXJuIHsgLi4uciwgdG90YWw6IE1hdGgubWF4KGJhc2UsIG4pIH07XG59XG5cbi8qKiBMaWZ0cyB3aGVyZSB5b3UgaGl0IHlvdXIgbm9ybWFsICh1bi1yYW1wZWQpIHRvcCB3ZWlnaHQgZm9yIGl0cyByZXBzOiB5b3UndmUgYmVhdGVuIHRoZSByYW1wLiAqL1xuZnVuY3Rpb24gYmVhdFJhbXAoZGVmOiBQcm9ncmFtRGVmLCBjZmc6IFByb2dyYW1Db25maWcsIHN0YXRlOiBQcm9ncmFtU3RhdGUsIHc6IEhldnlXb3Jrb3V0LCBkYXlJbmRleDogbnVtYmVyKTogc3RyaW5nW10ge1xuICBjb25zdCBwbGFuID0gcGxhbkRheShkZWYsIGNmZywgc3RhdGUsIGRheUluZGV4KTtcbiAgY29uc3QgdXNlZCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG4gIGNvbnN0IG91dDogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBlIG9mIHBsYW4uZXhlcmNpc2VzKSB7XG4gICAgY29uc3QgbiA9IHVzZWQuZ2V0KGUubGlmdCkgPz8gMDtcbiAgICB1c2VkLnNldChlLmxpZnQsIG4gKyAxKTtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1heCgwLCAuLi5lLnNldHMubWFwKCh4KSA9PiB4LndlaWdodCkpO1xuICAgIGlmICghdG9wKSBjb250aW51ZTtcbiAgICBjb25zdCByZXBzID0gTWF0aC5taW4oLi4uZS5zZXRzLmZpbHRlcigoeCkgPT4geC53ZWlnaHQgPj0gdG9wKS5tYXAoKHgpID0+IHgucmVwcykpO1xuICAgIGNvbnN0IHRvbCA9IE1hdGgubWF4KDEsIHRvcCAqIDAuMDIpO1xuICAgIGlmICgocGVyZm9ybWVkRm9yKHcsIGUubGlmdCwgY2ZnKVtuXSA/PyBbXSkuc29tZSgoeCkgPT4geC53ZWlnaHQgPj0gdG9wIC0gdG9sICYmIHgucmVwcyA+PSByZXBzKSkgb3V0LnB1c2goZS5saWZ0KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG4vKiogQ291bnQgb25lIHJhbXAgc2Vzc2lvbjogZXhwb3N1cmVzIGZvciB3aGF0IHlvdSBkaWQsIGVhcmx5IGZpbmlzaCBmb3IgbGlmdHMgeW91IGJlYXQuICovXG5mdW5jdGlvbiBhZHZhbmNlUmFtcChkZWY6IFByb2dyYW1EZWYsIHI6IFJlZW50cnksIHJlc3VsdHM6IFNsb3RSZXN1bHRbXSwgYmVhdGVuOiBzdHJpbmdbXSk6IFJlZW50cnkgfCB1bmRlZmluZWQge1xuICBjb25zdCBzZWVuID0geyAuLi5yLnNlZW4gfTtcbiAgZm9yIChjb25zdCBsIG9mIG5ldyBTZXQocmVzdWx0cy5maWx0ZXIoKHgpID0+IHgucmVwcy5sZW5ndGggPiAwKS5tYXAoKHgpID0+IHgubGlmdCkpKSBzZWVuW2xdID0gKHNlZW5bbF0gPz8gMCkgKyAxO1xuICBmb3IgKGNvbnN0IGwgb2YgYmVhdGVuKSBzZWVuW2xdID0gTWF0aC5tYXgoc2VlbltsXSA/PyAwLCByYW1wTmVlZChyLCBsKSk7XG4gIGNvbnN0IG5leHQ6IFJlZW50cnkgPSB7IC4uLnIsIGRvbmU6IHIuZG9uZSArIDEsIHNlZW4gfTtcbiAgY29uc3QgYWxsQmFjayA9IHJhbXBMaWZ0cyhkZWYpLmV2ZXJ5KChsKSA9PiAoc2VlbltsXSA/PyAwKSA+PSByYW1wTmVlZChyLCBsKSk7XG4gIHJldHVybiBuZXh0LmRvbmUgPj0gci50b3RhbCB8fCBhbGxCYWNrID8gdW5kZWZpbmVkIDogbmV4dDtcbn1cblxuY29uc3QgZGF5c0JldHdlZW4gPSAoYTogc3RyaW5nLCBiOiBzdHJpbmcpID0+IE1hdGguZmxvb3IoKERhdGUucGFyc2UoYikgLSBEYXRlLnBhcnNlKGEpKSAvIDg2NGU1KTtcblxuLyoqXG4gKiBEdXJpbmcgcmUtZW50cnkgYSBzZXNzaW9uIGNhbiBvbmx5IGtlZXAgb3IgaW1wcm92ZSB5b3VyIHByb2dyZXNzaW9uOiBhbnl0aGluZyB0aGF0IHdvdWxkIGxvd2VyXG4gKiBhIHdlaWdodCwgc3RlcCBkb3duIGEgc3RhZ2UsIGNvdW50IGEgbWlzcywgb3IgZHJvcCBhIFRNIGlzIGlnbm9yZWQuIExpZnRpbmcgeW91ciBwcmUtYnJlYWtcbiAqIHdlaWdodCBzdGlsbCBjb3VudHMgYXMgYSBwYXNzLlxuICovXG5mdW5jdGlvbiBndWFyZFJlZW50cnkoYmVmb3JlOiBQcm9ncmFtU3RhdGUsIGFmdGVyOiBQcm9ncmFtU3RhdGUpOiBQcm9ncmFtU3RhdGUge1xuICBjb25zdCBzbG90cyA9IHsgLi4uYWZ0ZXIuc2xvdHMgfTtcbiAgY29uc3QgdG1zID0geyAuLi5hZnRlci50bXMgfTtcbiAgY29uc3QgcGVuZGluZyA9IHsgLi4uYWZ0ZXIucGVuZGluZ1RtIH07XG4gIGNvbnN0IHIgPSBiZWZvcmUucmVlbnRyeSE7XG4gIGNvbnN0IHRhZyA9IGByZS1lbnRyeSAke3IuZG9uZSArIDF9LyR7ci50b3RhbH0gYWZ0ZXIgJHtyLmdhcERheXN9IGRheXNgO1xuICBjb25zdCBlbnRyeSA9IGFmdGVyLmxvZ1thZnRlci5sb2cubGVuZ3RoIC0gMV07XG4gIGNvbnN0IHJlc3VsdHMgPSBlbnRyeS5yZXN1bHRzLm1hcCgocmVzKSA9PiB7XG4gICAgY29uc3QgYiA9IGJlZm9yZS5zbG90c1tyZXMuc2xvdElkXSwgYSA9IHNsb3RzW3Jlcy5zbG90SWRdO1xuICAgIGxldCByZXZlcnRlZCA9IGZhbHNlO1xuICAgIGlmIChiICYmIGEgJiYgKGEud2VpZ2h0IDwgYi53ZWlnaHQgfHwgYS5zdGFnZSA+IGIuc3RhZ2UgfHwgKGEuZmFpbHMgPz8gMCkgPiAoYi5mYWlscyA/PyAwKSB8fCAoYS5yZXRlc3QgJiYgIWIucmV0ZXN0KSkpIHtcbiAgICAgIHNsb3RzW3Jlcy5zbG90SWRdID0gYjtcbiAgICAgIHJldmVydGVkID0gdHJ1ZTtcbiAgICB9XG4gICAgaWYgKHRtc1tyZXMubGlmdF0gIT0gbnVsbCAmJiBiZWZvcmUudG1zW3Jlcy5saWZ0XSAhPSBudWxsICYmIHRtc1tyZXMubGlmdF0gPCBiZWZvcmUudG1zW3Jlcy5saWZ0XSkgeyB0bXNbcmVzLmxpZnRdID0gYmVmb3JlLnRtc1tyZXMubGlmdF07IHJldmVydGVkID0gdHJ1ZTsgfVxuICAgIGlmICgocGVuZGluZ1tyZXMubGlmdF0gPz8gMCkgPCAoYmVmb3JlLnBlbmRpbmdUbT8uW3Jlcy5saWZ0XSA/PyAwKSkgeyBwZW5kaW5nW3Jlcy5saWZ0XSA9IGJlZm9yZS5wZW5kaW5nVG0/LltyZXMubGlmdF0gPz8gMDsgcmV2ZXJ0ZWQgPSB0cnVlOyB9XG4gICAgaWYgKHJldmVydGVkIHx8IHJlcy5vdXRjb21lID09PSBcIm1pc3NlZFwiKSByZXR1cm4geyAuLi5yZXMsIG91dGNvbWU6IFwiaG9sZFwiIGFzIE91dGNvbWUsIG5vdGU6IGAke3RhZ306IG5vdCBjb3VudGVkICgke3Jlcy5ub3RlfSlgIH07XG4gICAgcmV0dXJuIHsgLi4ucmVzLCBub3RlOiBgJHt0YWd9IFx1MDBCNyAke3Jlcy5ub3RlfWAgfTtcbiAgfSk7XG4gIHJldHVybiB7IC4uLmFmdGVyLCBzbG90cywgdG1zLCBwZW5kaW5nVG06IHBlbmRpbmcsIGxvZzogWy4uLmFmdGVyLmxvZy5zbGljZSgwLCAtMSksIHsgLi4uZW50cnksIHJlc3VsdHMgfV0gfTtcbn1cblxuLyoqIFJlcGxheSBoaXN0b3J5IChvbGRlc3QgZmlyc3QpIGZyb20gY2ZnLnN0YXJ0RGF0ZSBpbnRvIHRoZSBjdXJyZW50IHByb2dyYW0gc3RhdGUuICovXG5leHBvcnQgZnVuY3Rpb24gcmVwbGF5KGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCB3b3Jrb3V0czogSGV2eVdvcmtvdXRbXSwgb3B0czogUmVwbGF5T3B0aW9ucyA9IHt9KTogUHJvZ3JhbVN0YXRlIHtcbiAgbGV0IHN0YXRlID0gaW5pdGlhbFN0YXRlKGRlZiwgY2ZnKTtcbiAgY29uc3QgYWRqID0gWy4uLihjZmcuYWRqdXN0bWVudHMgPz8gW10pXS5zb3J0KChhLCBiKSA9PiBhLmRhdGUubG9jYWxlQ29tcGFyZShiLmRhdGUpKTtcbiAgbGV0IGFpID0gMDtcbiAgY29uc3QgbWluR2FwID0gb3B0cy5yZWVudHJ5ID09PSBmYWxzZSB8fCBkZWYuYnVpbHRJblJhbXAgPyBJbmZpbml0eSA6IG9wdHMucmVlbnRyeT8ubWluR2FwRGF5cyA/PyA5O1xuICBsZXQgbGFzdFNlc3Npb246IHN0cmluZyB8IG51bGwgPSBudWxsO1xuICBjb25zdCBzb3J0ZWQgPSB3b3Jrb3V0cy5maWx0ZXIoKHcpID0+IHcuc3RhcnRfdGltZSA+PSBjZmcuc3RhcnREYXRlKS5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0X3RpbWUubG9jYWxlQ29tcGFyZShiLnN0YXJ0X3RpbWUpKTtcbiAgZm9yIChjb25zdCB3IG9mIHNvcnRlZCkge1xuICAgIGlmIChzdGF0ZS5jb21wbGV0ZSkgYnJlYWs7XG4gICAgY29uc3QgZHVlOiBBZGp1c3RtZW50W10gPSBbXTtcbiAgICB3aGlsZSAoYWkgPCBhZGoubGVuZ3RoICYmIGFkalthaV0uZGF0ZSA8PSB3LnN0YXJ0X3RpbWUpIGR1ZS5wdXNoKGFkalthaSsrXSk7XG4gICAgaWYgKGR1ZS5sZW5ndGgpIHN0YXRlID0gYXBwbHlBZGp1c3RtZW50cyhzdGF0ZSwgZHVlKTtcbiAgICBjb25zdCBkID0gbWF0Y2hEYXkoZGVmLCBjZmcsIHN0YXRlLCB3KTtcbiAgICBpZiAoZCA8IDApIGNvbnRpbnVlO1xuICAgIC8vIEdhcHMgYXJlIG1lYXN1cmVkIGJldHdlZW4gcHJvZ3JhbSBzZXNzaW9uczsgaG90ZWwtZ3ltIG9yIG90aGVyIHdvcmtvdXRzIGRvbid0IHJlc2V0IHRoZW0uXG4gICAgaWYgKGxhc3RTZXNzaW9uICYmIE51bWJlci5pc0Zpbml0ZShtaW5HYXApKSB7XG4gICAgICBjb25zdCByID0gc3RhcnRSYW1wKGRlZiwgc3RhdGUsIGRheXNCZXR3ZWVuKGxhc3RTZXNzaW9uLCB3LnN0YXJ0X3RpbWUpLCBtaW5HYXApO1xuICAgICAgaWYgKHIpIHN0YXRlID0geyAuLi5zdGF0ZSwgcmVlbnRyeTogciB9O1xuICAgIH1cbiAgICBjb25zdCBiZWZvcmUgPSBzdGF0ZTtcbiAgICBsZXQgbmV4dCA9IGFwcGx5V29ya291dChkZWYsIGNmZywgc3RhdGUsIHcsIGQpO1xuICAgIGlmIChiZWZvcmUucmVlbnRyeSAmJiBiZWZvcmUucmVlbnRyeS5kb25lIDwgYmVmb3JlLnJlZW50cnkudG90YWwpIHtcbiAgICAgIG5leHQgPSBndWFyZFJlZW50cnkoYmVmb3JlLCBuZXh0KTtcbiAgICAgIGNvbnN0IHJlc3VsdHMgPSBuZXh0LmxvZ1tuZXh0LmxvZy5sZW5ndGggLSAxXS5yZXN1bHRzO1xuICAgICAgbmV4dCA9IHsgLi4ubmV4dCwgcmVlbnRyeTogYWR2YW5jZVJhbXAoZGVmLCBiZWZvcmUucmVlbnRyeSwgcmVzdWx0cywgYmVhdFJhbXAoZGVmLCBjZmcsIGJlZm9yZSwgdywgZCkpIH07XG4gICAgfVxuICAgIHN0YXRlID0gbmV4dDtcbiAgICBsYXN0U2Vzc2lvbiA9IHcuc3RhcnRfdGltZTtcbiAgfVxuICBpZiAoYWkgPCBhZGoubGVuZ3RoKSBzdGF0ZSA9IGFwcGx5QWRqdXN0bWVudHMoc3RhdGUsIGFkai5zbGljZShhaSkpO1xuICAvLyBTdGlsbCBvbiBhIGJyZWFrOiB0aGUgbmV4dCBzZXNzaW9uIHN0YXJ0cyBhIHJhbXAuXG4gIGlmIChvcHRzLnRvZGF5ICYmIGxhc3RTZXNzaW9uICYmIE51bWJlci5pc0Zpbml0ZShtaW5HYXApKSB7XG4gICAgY29uc3QgciA9IHN0YXJ0UmFtcChkZWYsIHN0YXRlLCBkYXlzQmV0d2VlbihsYXN0U2Vzc2lvbi5zbGljZSgwLCAxMCksIG9wdHMudG9kYXkpLCBtaW5HYXApO1xuICAgIGlmIChyKSBzdGF0ZSA9IHsgLi4uc3RhdGUsIHJlZW50cnk6IHIgfTtcbiAgfVxuICByZXR1cm4gc3RhdGU7XG59XG4iLCAiLy8gQm9yaXMgU2hlaWtvJ3MgY2xhc3NpYyBudW1iZXJlZCBwcm9ncmFtczogIzI5XHUyMDEzIzMyIChwcmVwIFx1MjE5MiBjb21wZXRpdGlvbiksICMzNywgdGhlIFNoZWlrb1xuLy8gQmVnaW5uZXIgcHJlcC9jb21wIGN5Y2xlcywgYW5kIEFkdmFuY2VkIE1lZGl1bSBMb2FkIChBTUwpLlxuLy9cbi8vIFNvdXJjZTogdGhlIHdpZGVseSBzaGFyZWQgQ2hhc2VUICgyMDA4LjA1LjA5KSBTaGVpa28gc3ByZWFkc2hlZXRzIGFzIGhvc3RlZCBieSBMaWZ0VmF1bHRcbi8vIChcIlNoZWlrbyBQcm9ncmFtIFNwcmVhZHNoZWV0c1wiOiB0YWJzICMyOSwgIzMwLCAjMzEsICMzMiwgIzM3OyBcIlNoZWlrbyBCZWdpbm5lclwiOiB0YWJzXG4vLyBQcmVwXzEsIENvbXA7IFwiU2hlaWtvIEFkdmFuY2VkIE1lZGl1bSBMb2FkXCI6IHRhYnMgUHJlcCBDeWNsZSBJXHUyMDEzSUlJLCBDb21wIEN5Y2xlKS4gVGhlIGRheVxuLy8gdGFibGVzIGJlbG93IHdlcmUgZXh0cmFjdGVkIGZyb20gdGhvc2Ugc2hlZXRzJyAlL3JlcHMvc2V0cyBjb2x1bW5zIGJ5IHNjcmlwdCBhbmQgYXJlIGV4YWN0LlxuLy9cbi8vIFJ1bGVzOiBldmVyeSBzZXQgaXMgYSBmaXhlZCAlIG9mIHlvdXIgY29tcGV0aXRpb24gMVJNIChubyBBTVJBUHMsIG5vIGF1dG8tcmVndWxhdGlvbikuIEVhY2hcbi8vIGJsb2NrIGlzIGEgZml4ZWQgc2VxdWVuY2Ugb2YgdW5pcXVlIHNlc3Npb25zOyB0aGUgcHJvZ3JhbSBlbmRzIGFmdGVyIHRoZSBsYXN0IHdlZWsuIFZhcmlhdGlvbnNcbi8vIHVzZSB0aGUgcGFyZW50IGxpZnQncyAxUk06IGZyb250L3BhdXNlIHNxdWF0IFx1MjE5MiBzcXVhdDsgaGFsdGluZywgcGF1c2VkLCBjaGFpbiBhbmQgZGVmaWNpdFxuLy8gZGVhZGxpZnRzIGFuZCBibG9jayBwdWxscyBcdTIxOTIgZGVhZGxpZnQ7IGJvYXJkL2NoYWluL2Nsb3NlLWdyaXAvZGVjbGluZSBiZW5jaCBcdTIxOTIgYmVuY2guXG4vLyBIYWx0aW5nL3BhdXNlZC9jaGFpbiBkZWFkbGlmdHMgYW5kIGJvYXJkL2NoYWluIHByZXNzZXMgYXJlIGxvZ2dlZCBhcyB0aGUgcGxhaW4gbGlmdCAod2l0aCBhXG4vLyBub3RlKTsgYmxvY2sgcHVsbHMgKFwiZGVhZGxpZnQgZnJvbSBib3hlc1wiKSBhcyBSYWNrIFB1bGwuIEEgbGlmdCBkb25lIHR3aWNlIGluIGEgc2Vzc2lvbiBnZXRzXG4vLyBpdHMgb3duIHNsb3QgKFx1MjAyNi1iZW5jaCwgXHUyMDI2LWJlbmNoMiksIG1hdGNoZWQgdG8gSGV2eSBleGVyY2lzZSBibG9ja3MgaW4gb3JkZXIuXG4vLyBBY2Nlc3NvcmllcyAoR1BQKSBhcmUgYGZpeGVkYCB3aXRoIHRoZSBzaGVldCdzIHNldHNcdTAwRDdyZXBzOyB0aGUgc2hlZXQgZ2l2ZXMgbm8gbG9hZC4gR2VuZXJpY1xuLy8gcm93cyAoXCJDaGVzdCBtdXNjbGVzXCIsIFwiTGF0IG11c2NsZXNcIiwgXCJBYnNcIlx1MjAyNikgbWFwIHRvIGEgcmVwcmVzZW50YXRpdmUgbGlmdCB3aXRoIGEgbm90ZS5cbi8vIFdoZXJlIHRoZSBzaGVldCBzYXlzIFwiMTAwXHUyMDEzMTA1JSBcdTAwRDcgMlx1MjAxMzMgc2luZ2xlc1wiIChtYXggdGVzdCkgd2UgcHJlc2NyaWJlIDIgXHUwMEQ3IDEgQCAxMDAlICsgbm90ZS5cblxuaW1wb3J0IHR5cGUgeyBEYXlEZWYsIFBlcmNlbnRTZXQsIFByb2dyYW1EZWYsIFByb2dyYW1UZW1wbGF0ZSwgU2xvdERlZiwgVGllciB9IGZyb20gXCIuLi9wcm9ncmFtXCI7XG5pbXBvcnQgdHlwZSB7IFVuaXQgfSBmcm9tIFwiLi4vdW5pdHNcIjtcblxuLyoqIFtsaWZ0LCBcInJlcHNAcGN0W3hTZXRzXSBcdTIwMjZcIiBmb3IgJSB3b3JrIG9yIFwiU0VUU3hSRVBTXCIgZm9yIGFjY2Vzc29yaWVzLCBub3RlP10gKi9cbnR5cGUgRW50cnkgPSBbc3RyaW5nLCBzdHJpbmcsIHN0cmluZz9dO1xudHlwZSBXayA9IFtzdHJpbmcsIEVudHJ5W11dW107XG5cbi8qKiBXaG9zZSAxUk0gYSB2YXJpYXRpb24ncyBwZXJjZW50YWdlcyBhcmUgb2YuICovXG5jb25zdCBUTV9PRjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcbiAgZnJvbnRTcXVhdDogXCJzcXVhdFwiLCBwYXVzZVNxdWF0OiBcInNxdWF0XCIsXG4gIGRlZmljaXREZWFkbGlmdDogXCJkZWFkbGlmdFwiLCByYWNrUHVsbDogXCJkZWFkbGlmdFwiLFxuICBjZ0JlbmNoOiBcImJlbmNoXCIsIGRlY2xpbmVCZW5jaDogXCJiZW5jaFwiLFxufTtcbmNvbnN0IENPTVAgPSBuZXcgU2V0KFtcInNxdWF0XCIsIFwiYmVuY2hcIiwgXCJkZWFkbGlmdFwiXSk7XG5cbi8qKiBcIjVANTAgNEA2MHgyXCIgXHUyMTkyIG9uZSBQZXJjZW50U2V0IHBlciBzZXQuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTZXRzKHNwZWM6IHN0cmluZyk6IFBlcmNlbnRTZXRbXSB7XG4gIHJldHVybiBzcGVjLnNwbGl0KFwiIFwiKS5mbGF0TWFwKCh0b2spID0+IHtcbiAgICBjb25zdCBtID0gL14oXFxkKylAKFxcZCspKD86eChcXGQrKSk/JC8uZXhlYyh0b2spO1xuICAgIGlmICghbSkgdGhyb3cgbmV3IEVycm9yKGBiYWQgc2V0IHNwZWMgJHt0b2t9YCk7XG4gICAgcmV0dXJuIEFycmF5LmZyb20oeyBsZW5ndGg6IE51bWJlcihtWzNdID8/IDEpIH0sICgpID0+ICh7IHBjdDogTnVtYmVyKG1bMl0pIC8gMTAwLCByZXBzOiBOdW1iZXIobVsxXSkgfSkpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gc2xvdChpZDogc3RyaW5nLCBbbGlmdCwgc3BlYywgbm90ZV06IEVudHJ5LCBmaXJzdDogYm9vbGVhbik6IFNsb3REZWYge1xuICBpZiAoIXNwZWMuaW5jbHVkZXMoXCJAXCIpKSB7XG4gICAgY29uc3QgW3NldHMsIHJlcHNdID0gc3BlYy5zcGxpdChcInhcIikubWFwKE51bWJlcik7XG4gICAgcmV0dXJuIHsgaWQsIGxpZnQsIHRpZXI6IFwiQUNDXCIsIG5vdGUsIHByb2dyZXNzaW9uOiB7IGtpbmQ6IFwiZml4ZWRcIiwgc2V0cywgcmVwcyB9IH07XG4gIH1cbiAgY29uc3QgdGllcjogVGllciA9IENPTVAuaGFzKGxpZnQpICYmIGZpcnN0ICYmICFub3RlID8gXCJNQUlOXCIgOiBcIlNVUFBcIjtcbiAgcmV0dXJuIHsgaWQsIGxpZnQsIHRpZXIsIG5vdGUsIHByb2dyZXNzaW9uOiB7IGtpbmQ6IFwicGVyY2VudFwiLCB0bUxpZnQ6IFRNX09GW2xpZnRdID8/IGxpZnQsIHdlZWtzOiBbcGFyc2VTZXRzKHNwZWMpXSB9IH07XG59XG5cbmludGVyZmFjZSBCbG9jayB7IGtleTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB3ZWVrczogV2tbXSB9XG5cbi8qKiBMYXkgYmxvY2tzIGVuZCB0byBlbmQ6IG9uZSBEYXlEZWYgcGVyICh3ZWVrLCBkYXkpLCBzY2hlZHVsZWQgb25seSBpbiBpdHMgcHJvZ3JhbSB3ZWVrLiAqL1xuZnVuY3Rpb24gbGF5b3V0KGJsb2NrczogQmxvY2tbXSk6IHsgZGF5czogRGF5RGVmW107IHdlZWtOYW1lczogc3RyaW5nW10gfSB7XG4gIGNvbnN0IGRheXM6IERheURlZltdID0gW107XG4gIGNvbnN0IHdlZWtOYW1lczogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChjb25zdCBiIG9mIGJsb2Nrcykge1xuICAgIGIud2Vla3MuZm9yRWFjaCgod2ssIHcpID0+IHtcbiAgICAgIGNvbnN0IGcgPSB3ZWVrTmFtZXMubGVuZ3RoO1xuICAgICAgd2Vla05hbWVzLnB1c2goYCR7Yi5sYWJlbH0gXHUwMEI3IFdlZWsgJHt3ICsgMX1gKTtcbiAgICAgIHdrLmZvckVhY2goKFtkYXlOYW1lLCBlbnRyaWVzXSwgZCkgPT4ge1xuICAgICAgICBjb25zdCBiYXNlID0gYCR7Yi5rZXl9dyR7dyArIDF9ZCR7ZCArIDF9YDtcbiAgICAgICAgY29uc3Qgc2VlbjogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICAgICAgICBjb25zdCBzbG90cyA9IGVudHJpZXMubWFwKChlKSA9PiB7XG4gICAgICAgICAgY29uc3QgbiA9IChzZWVuW2VbMF1dID0gKHNlZW5bZVswXV0gPz8gMCkgKyAxKTtcbiAgICAgICAgICByZXR1cm4gc2xvdChgJHtiYXNlfS0ke2VbMF19JHtuID4gMSA/IG4gOiBcIlwifWAsIGUsIG4gPT09IDEpO1xuICAgICAgICB9KTtcbiAgICAgICAgZGF5cy5wdXNoKHsgaWQ6IGJhc2UudG9VcHBlckNhc2UoKSwgbmFtZTogYCR7Yi5sYWJlbH0gVyR7dyArIDF9IFx1MDBCNyAke2RheU5hbWV9YCwgd2Vla3M6IFtnXSwgc2xvdHMgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4geyBkYXlzLCB3ZWVrTmFtZXMgfTtcbn1cblxuZnVuY3Rpb24gcHJvZ3JhbSh0ZW1wbGF0ZUlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgYmxvY2tzOiBCbG9ja1tdLCBzZXNzaW9uc1BlcldlZWs6IG51bWJlciwgbm90ZXM6IHN0cmluZ1tdKTogUHJvZ3JhbURlZiB7XG4gIGNvbnN0IHsgZGF5cywgd2Vla05hbWVzIH0gPSBsYXlvdXQoYmxvY2tzKTtcbiAgcmV0dXJuIHtcbiAgICB0ZW1wbGF0ZUlkLCBuYW1lLCBkYXlzLCBzZXNzaW9uc1BlcldlZWssIG1heExhYmVsOiBcIjFSTVwiLCBub3RlcyxcbiAgICBjeWNsZTogeyB3ZWVrczogd2Vla05hbWVzLmxlbmd0aCwgd2Vla05hbWVzLCBmaW5pdGU6IHRydWUgfSxcbiAgfTtcbn1cblxuY29uc3QgTk9URVMgPSBbXG4gIFwiRW50ZXIgeW91ciBjdXJyZW50IGNvbXBldGl0aW9uIDFSTXMuIEV2ZXJ5IHNldCBpcyBhIGZpeGVkIHBlcmNlbnRhZ2U7IGRvbid0IGdyaW5kIG9yIGFkZCBBTVJBUHMuXCIsXG4gIFwiV2hlbiBhIGxpZnQgYXBwZWFycyB0d2ljZSBpbiBhIHNlc3Npb24sIGxvZyBpdCBhcyB0d28gc2VwYXJhdGUgZXhlcmNpc2VzIGluIEhldnksIGluIG9yZGVyLlwiLFxuICBcIkhhbHRpbmcvcGF1c2VkL2NoYWluIGRlYWRsaWZ0cyBhbmQgYm9hcmQvY2hhaW4gcHJlc3NlczogbG9nIGFzIHRoZSBwbGFpbiBsaWZ0LiBCbG9jayBwdWxsczogbG9nIGFzIFJhY2sgUHVsbC5cIixcbiAgXCJBY2Nlc3NvcmllcyBoYXZlIG5vIHByZXNjcmliZWQgbG9hZDogcGljayBhIHdlaWdodCB0aGF0J3MgbW9kZXJhdGUgZm9yIHRoZSBzZXRzXHUwMEQ3cmVwcy5cIixcbl07XG5cbmNvbnN0IHRvVW5pdCA9IChsYjogUmVjb3JkPHN0cmluZywgbnVtYmVyPiwgdW5pdDogVW5pdCkgPT5cbiAgT2JqZWN0LmZyb21FbnRyaWVzKE9iamVjdC5lbnRyaWVzKGxiKS5tYXAoKFtrLCB2XSkgPT4gW2ssIHVuaXQgPT09IFwibGJcIiA/IHYgOiBNYXRoLnJvdW5kKHYgLyAyLjIwNDYyIC8gMi41KSAqIDIuNV0pKTtcbmNvbnN0IGRlZmF1bHRzID0gKHVuaXQ6IFVuaXQpID0+ICh7IHRyYWluaW5nTWF4ZXM6IHRvVW5pdCh7IHNxdWF0OiAzMTUsIGJlbmNoOiAyMjUsIGRlYWRsaWZ0OiAzODUgfSwgdW5pdCksIHN0YXJ0V2VpZ2h0czoge30gfSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBkYXRhIChmcm9tIHRoZSBzcHJlYWRzaGVldHMpIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBCMjk6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNANzV4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYweDIgNUA3MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYweDIgM0A3MHgyIDNANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjR4NlwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NVwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiNEA1NSA0QDY1IDRANzV4MiAzQDg1eDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNEA3MCAzQDc1eDIgMkA4MHgyIDNANzV4MiA0QDcwIDZANjAgOEA1MFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNANzV4NVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInB1c2hVcFwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJmcm9udFNxdWF0XCIsIFwiM0A0NXgyIDNANTV4MiAyQDYweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA2QDYweDIgNkA2NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDU1IDRANjUgNEA3NXgyIDRAODB4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciBhdCBrbmVlIGhlaWdodFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4MiAzQDc1IDVANjUgN0A1NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYweDIgNEA3MHg0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1NSA0QDY1IDNANzV4MiAyQDg1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg2XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicHVzaFVwXCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjNANTB4MiAzQDYweDIgM0A2NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4MyAyQDg1eDIgM0A4MHgyXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDYwIDRANzB4MiAzQDgweDIgMkA5MHgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg3XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wib2hwXCIsIFwiNXg0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTUgNUA2NSA0QDc1eDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDhcIl0sXG4gICAgICBbXCJmcm9udFNxdWF0XCIsIFwiNUA0MHgyIDRANTB4MiAzQDYweDNcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcweDIgM0A4MHgyIDJAODV4MyAyQDgweDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA1QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNUA2MCA0QDcweDIgM0A4MHgyIDJAODV4MiAzQDgweDIgNEA3MCA2QDYwIDhANTBcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDhcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEIzMDogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYwIDVANzB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1NSA0QDY1IDNANzV4NVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MHgyIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA0QDcweDIgM0A3NXgyIDJAODB4MiAxQDg1eDIgMkA4MHgyIDNANzV4MiA0QDcwIDZANjUgOEA2MCAxMEA1NSAxMkA1MFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNng0XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI1QDYwIDRANzB4MiAzQDgweDMgMkA5MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDJAODB4NlwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NlwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYweDIgNEA3MHg0XCJdLFxuICAgICAgW1wic2t1bGxjcnVzaGVyXCIsIFwiNXgxMFwiLCBcIkZyZW5jaCBwcmVzc1wiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MHgyIDNANzB4MiAyQDgweDIgMUA5MHgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4NlwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInB1c2hVcFwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYweDIgM0A3MHgyIDNANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDNANzV4MiA1QDcweDIgN0A2MCA5QDUwXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MHgyIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MHgyIDVANzB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1NSAzQDY1IDJANzV4NVwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcImxlZ1ByZXNzXCIsIFwiNXg2XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDZcIiwgXCJTZWF0ZWRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjZANTAgNkA2MCA2QDY1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTUgNUA2NXgyIDRANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDcweDIgM0A4MHgzIDJAODV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDFAODV4MiAyQDgweDIgM0A3NXgyIDVANzAgN0A2NSA5QDYwIDExQDU1IDEzQDUwXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI1QDY1IDVANzV4MiA0QDg1eDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NlwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgzIDNAODB4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYweDIgNUA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIiwgXCJTZWF0ZWRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgyIDFAOTB4MlwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgyIDNAODB4MlwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA1QDY1IDRANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg2XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNUA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg4XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIiwgXCJTZWF0ZWRcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gIF0sXG5dO1xuXG5jb25zdCBCMzE6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjB4MiAyQDcwIDRANzAgNkA3MCA4QDcwIDdANzAgNUA3MCAzQDcwXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjB4MiA2QDY1eDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MHgyIDRANjV4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MHgyIDRANzB4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDFAODV4MiAyQDgweDIgM0A3NXgyIDRANzAgNkA2NSA4QDYwIDEwQDU1IDEyQDUwXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI1QDYwIDRANzAgM0A4MHgyIDJAOTB4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciBhdCBrbmVlIGhlaWdodFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDJAODB4NlwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NlwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1NSA1QDY1IDRANzV4NFwiXSxcbiAgICAgIFtcInNrdWxsY3J1c2hlclwiLCBcIjV4MTBcIiwgXCJGcmVuY2ggcHJlc3NcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDJcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4MiAxQDkweDNcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDVANjUgNUA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wibGVnUHJlc3NcIiwgXCI1eDZcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYweDIgM0A2NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDVANjAgNEA3MHgyIDNANzV4MiAyQDgweDIgMUA4NXgyIDNANzUgNUA2NSA3QDU1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDU1IDNANjV4MiAzQDc1eDIgMkA4NXg0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI0eDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDIgMkA4NXg0XCJdLFxuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNng0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI2QDUwIDZANjAgNkA2NXg0XCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDEwXCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHgxMFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYwIDVANzAgOEA3MCAzQDcwIDZANzAgMkA3MCA3QDcwIDRANzBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTUgNUA2NSA1QDcweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDcweDIgMkA4MHg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI4QDUwIDdANTUgNkA2MCA1QDY1IDRANzAgM0A3NXgyIDJAODB4MiAxQDg1eDIgMkA4MHgyIDNANzUgNEA3MCA2QDY1IDhANjAgMTBANTUgMTJANTBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANjAgNEA3MCAzQDgweDIgMkA5MHgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibGVnUHJlc3NcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4MyAzQDgweDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MHgyIDVANzB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHgyIDFAOTB4MyAyQDgweDJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4MTBcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDIgMUA5MHgzIDJAODB4MlwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDgweDIgMUA5MHgyXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wibGVnUHJlc3NcIiwgXCI2eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTUgNUA2NSA0QDc1eDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDhcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCA1QDcweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEIzMjogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJANzV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDc1eDNcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYweDIgMkA3MHgyIDJAODAgMUA5MCAxQDEwMHgyXCIsIFwiVG9wOiAyXHUyMDEzMyBzaW5nbGVzIGF0IDEwMFx1MjAxMzEwNSVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAyQDcweDIgMkA4MCAxQDkwIDFAMTAweDJcIiwgXCJUb3A6IDJcdTIwMTMzIHNpbmdsZXMgYXQgMTAwXHUyMDEzMTA1JVwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAyQDYwIDJANzB4MiAxQDgwIDFAOTAgMUAxMDB4MlwiLCBcIlRvcDogMlx1MjAxMzMgc2luZ2xlcyBhdCAxMDBcdTIwMTMxMDUlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MHgyIDNANzB4MiAyQDc1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTUgM0A2NXgyIDNANzV4NlwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MHgyIDNANzB4MiAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTUgM0A2NXgyIDNANzV4NFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDJANjB4MiAyQDY1eDIgMUA3MHgzXCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDNAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjB4MiAzQDcweDIgM0A4MHg2XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDIgMkA4MHgzIDFAODV4M1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiNXg0XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYweDIgM0A3MHgyIDJANzV4NVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MHgyIDJANzB4MiAyQDc1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDIgMkA3NXg0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYweDIgMkA3MHgyIDFANzV4NFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAyQDYweDIgMkA3MHg0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiMng4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYweDIgMkA3MHgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjB4MiAyQDcweDNcIl0sXG4gICAgXV0sXG4gIF0sXG5dO1xuXG5jb25zdCBCMzc6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNANzV4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYweDIgNUA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjB4MiA2QDY1eDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI1QDUwIDVANjB4MiA0QDcweDIgM0A3NXg0XCJdLFxuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNng0XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI1QDUwIDVANjB4MiA0QDcweDIgM0A4MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiN0A1MCA2QDU1IDVANjAgNEA2NSAzQDcweDIgMkA3NXgyIDNANzB4MiA0QDY1IDZANjAgOEA1NSAxMEA1MFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNANzV4NVwiXSxcbiAgICAgIFtcInNrdWxsY3J1c2hlclwiLCBcIjV4MTBcIiwgXCJGcmVuY2ggcHJlc3NcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDJcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4NlwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInB1c2hVcFwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTUgM0A2NSAzQDc1eDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjB4MiA0QDcweDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MHgyIDRANzB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDNANzB4MiAzQDc1eDVcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI0QDUwIDRANjAgM0A3MHgyIDNANzV4NlwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDRANzUgNUA3MCA2QDYwIDdANTBcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4MTBcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1NSAzQDY1IDJANzV4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg2XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgM1xuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MHgyIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicHVzaFVwXCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYwIDVANzB4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgNEA3MHgyIDRANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDNANzV4MiA0QDcwIDVANjUgNkA2MCA3QDU1IDhANTBcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjVANjAgNUA3MHgyIDRAODB4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciBhdCBrbmVlIGhlaWdodFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgNUA3MHgyIDRANzV4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA2QDYweDIgNkA2NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA1QDY1IDRANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg2XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNUA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg4XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIiwgXCJTZWF0ZWRcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gIF0sXG5dO1xuXG5jb25zdCBCRUdfUFJFUDogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDc1eDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDRcIiwgXCJ+NzUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJpbmNsaW5lQmVuY2hcIiwgXCI1eDNcIiwgXCJ+ODUlIGVmZm9ydFwiXSxcbiAgICAgIFtcImNhYmxlUm93XCIsIFwiNXg4XCIsIFwifjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANTUgM0A2NSAzQDc1IDJAODV4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciBhdCBrbmVlIGhlaWdodFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZSBcdTAwQjcgfjc1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgM0A3NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI0eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZSBcdTAwQjcgfjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZCBcdTAwQjcgfjc1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAyXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDVcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4OFwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNHg2XCIsIFwifjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCIsIFwifjY1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjAgNkA2NXg0XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDU1IDRANjUgNEA3NXg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2UgXHUwMEI3IH43MCUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjZ0JlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4NFwiXSxcbiAgICAgIFtcImNhYmxlUm93XCIsIFwiNHg4XCIsIFwifjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjR4OFwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIiwgXCJ+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDc1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJkYkJlbmNoXCIsIFwiNHg2XCIsIFwifjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZCBcdTAwQjcgfjc1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDY1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjAgM0A3MCAzQDgweDIgMkA5MHgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wiY2FibGVSb3dcIiwgXCI0eDZcIiwgXCJ+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZSBcdTAwQjcgfjYwJSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiZGVjbGluZUJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjR4OFwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDIgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDVcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4OFwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiYmljZXBDdXJsXCIsIFwiNHg2XCIsIFwifjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCIsIFwifjY1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MCAyQDg1eDRcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjJANTAgMkA2MCAyQDcweDIgMUA3NXgzXCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYmVsb3cgYW5kIGFib3ZlIHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI0eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZSBcdTAwQjcgfjYwJSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1NSA0QDY1IDNANzV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNHg4XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDVcIiwgXCJ+NzUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEJFR19DT01QOiBXa1tdID0gW1xuICBbIC8vIHdlZWsgMVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcweDIgMkA3NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJANzV4M1wiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMCAxQDEwNVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MCAxQDkwIDFAOTUgMUAxMDAgMUAxMDVcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAwIDFAMTA1XCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjN4OFwiLCBcIn42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1NSAzQDY1IDNANzV4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI0eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDJcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDNAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjR4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg1XCIsIFwiU2VhdGVkIFx1MDBCNyB+NzUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANjUgMUA3MHgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDgwIDJAODV4MiAxQDkweDJcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjUgM0A3NSAyQDg1eDIgMUA5NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDNAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJiaWNlcEN1cmxcIiwgXCI0eDZcIiwgXCJ+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg0XCIsIFwifjgwJSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgwIDFAODV4M1wiXSxcbiAgICAgIFtcImNhYmxlUm93XCIsIFwiNHg2XCIsIFwifjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjN4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2UgXHUwMEI3IH43MCUgZWZmb3J0XCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjN4NlwiLCBcIn43MCUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAyQDcwIDFANzV4M1wiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANzB4M1wiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjJ4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgMkA2NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgMkA3MHgzXCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuY29uc3QgQU1MMTogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiZnJvbnRTcXVhdFwiLCBcIjRAMzAgNEA0MCA0QDUweDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJANzV4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1NSAzQDY1IDJANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MHg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIDIgcyBwYXVzZSwgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCAzQDcwIDVANzAgN0A3MCA0QDcwIDZANzAgOEA3MFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1NSAzQDY1IDJANzV4NFwiLCBcIlBhdXNlIDVcdTIwMTM3IGNtIGFib3ZlIHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNANzV4NFwiXSxcbiAgICAgIFtcInBhdXNlU3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MHg0XCIsIFwiUGF1c2UgaGFsZndheSBkb3duXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDYwIDNANzAgM0A4MHgyIDJAODV4M1wiLCBcIkJvYXJkIHByZXNzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAyQDYweDRcIl0sXG4gICAgICBbXCJpbmNsaW5lQmVuY2hcIiwgXCI1eDNcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANTUgM0A2NSAzQDc1eDIgMkA4NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDVcdTIwMTM3IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg0XCIsIFwiV2VpZ2h0ZWRcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjV4NVwiLCBcIjgwXHUyMDEzOTAlIG9mIHlvdXIgc3F1YXQgMVJNXCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDNANzUgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDVcIl0sXG4gICAgICBbXCJza3VsbGNydXNoZXJcIiwgXCI1eDZcIiwgXCJGcmVuY2ggcHJlc3NcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDVcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NVwiLCBcIlBhdXNlIDVcdTIwMTM3IGNtIGJlbG93IHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjV4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJsZWdFeHRlbnNpb25cIiwgXCI1eDZcIiwgXCIxIHMgcGF1c2UgYXQgdGhlIHRvcCBvZiBldmVyeSByZXBcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI0eDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiZnJvbnRTcXVhdFwiLCBcIjRAMzAgNEA0MCA0QDUweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANjAgM0A3MCAzQDgwIDJAODV4MiAxQDkweDNcIiwgXCJCb2FyZCBwcmVzc1wiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NlwiLCBcIldlaWdodGVkXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDhcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImNnQmVuY2hcIiwgXCI0QDUwIDNANjAgM0A2NXg0XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHgyIDFANzV4M1wiLCBcIldpdGggY2hhaW5zOiArOFx1MjAxMzEwIGtnIHBlciBzaWRlIG9uIHRvcCBvZiB0aGlzIHdlaWdodFwiXSxcbiAgICAgIFtcImRiQmVuY2hcIiwgXCI1eDZcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjV4NFwiXSxcbiAgICAgIFtcInJldmVyc2VIeXBlclwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiZnJvbnRTcXVhdFwiLCBcIjRANDAgNEA1MCAzQDU1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4MiAxQDg1eDIgMkA4MHgyXCJdLFxuICAgICAgW1wicGF1c2VTcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIlBhdXNlIGhhbGZ3YXkgZG93blwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCAyIHMgcGF1c2UsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgM0A3MCA3QDcwIDRANzAgOEA3MCAyQDcwIDZANzBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANjAgNEA3MCA0QDgweDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgNVx1MjAxMzcgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1NSAzQDY1IDNANzUgMkA4NXgyIDFAOTB4M1wiLCBcIkJvYXJkIHByZXNzXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDY1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4OFwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjR4NFwiLCBcIlNlYXRlZFwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBhYm92ZSB0aGUga25lZXNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDY1eDRcIiwgXCJNZWRpdW0gZ3JpcFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcInJldmVyc2VIeXBlclwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiZnJvbnRTcXVhdFwiLCBcIjNANDAgM0A0NSAzQDUweDIgM0A1NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDIgMkA4NXgzIDNAODB4MlwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg2XCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANzB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A2MCAzQDcwIDNAODAgM0A4NSAyQDkweDIgMUA5NXgyXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjAgM0A3MCAzQDgweDIgMkA5MHgyIDFAOTV4MlwiLCBcIkJsb2NrIHB1bGwsIGJhciA1XHUyMDEzNyBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcInNrdWxsY3J1c2hlclwiLCBcIjV4NlwiLCBcIkZyZW5jaCBwcmVzc1wiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wibGF0ZXJhbFJhaXNlXCIsIFwiNHg2XCIsIFwiRGVsdHM6IGFueSBzaG91bGRlciBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDIgMUA4MHgzXCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYmVsb3cgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjAgNkA2NXg0XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjV4NVwiXSxcbiAgICAgIFtcInJldmVyc2VIeXBlclwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEFNTDI6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgM0A3MCA3QDcwIDRANzAgOEA3MCAyQDcwIDVANzBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANjAgM0A3MCAzQDgweDIgMkA4NXgzXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANzB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDYwIDNANzAgM0A4MHgyIDNAODV4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA0QDY1IDNANzUgMkA4NXg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A2MCAzQDcwIDNAODB4MiAzQDg1eDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIkluY2xpbmUgc2hvdWxkZXIgcHJlc3NcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI0eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDJcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANzB4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA0QDY1IDRANzV4MiAzQDg1eDIgMkA5MHgzXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIldpdGggY2hhaW5zOiArOFx1MjAxMzEwIGtnIHBlciBzaWRlIG9uIHRvcCBvZiB0aGlzIHdlaWdodFwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNXg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI0eDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1NSA0QDY1IDNANzUgMkA4NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4M1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYmVsb3cgYW5kIGFib3ZlIHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIkluY2xpbmUgc2hvdWxkZXIgcHJlc3NcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA0QDY1IDNANzUgMkA4NXg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgM0A3MCA3QDcwIDRANzAgOEA3MCAyQDcwIDZANzBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDVANjAgNEA3MCAzQDc1IDJAODB4MlwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiNEA2MCA0QDcwIDRAODB4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDVcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDNANzV4NFwiLCBcIjEgZnVsbCArIDEvMiByZXAgKHRvIGtuZWVzKSBcdTAwRDcyIHBlciBzZXRcIl0sXG4gICAgICBbXCJjZ0JlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4NFwiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjV4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg0XCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYWJvdmUgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDU1IDNANjUgM0A3NSAzQDg1eDIgMkA5MHgyIDFAOTV4M1wiLCBcIkJvYXJkIHByZXNzXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiNHg4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA0QDY1IDNANzUgMkA4NXg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4M1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDcweDRcIl0sXG4gICAgICBbXCJpbmNsaW5lQmVuY2hcIiwgXCI1eDNcIiwgXCJJbmNsaW5lIHNob3VsZGVyIHByZXNzXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDYwIDNANzAgM0A4MCAyQDg1eDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImxlZ1ByZXNzXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYwIDNANzAgNUA3MCA3QDcwIDRANzAgNkA3MCA4QDcwXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDU1IDNANjUgM0A3NSAzQDg1eDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNXg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDNANzV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA1QDYwIDRANzAgM0A3NSAyQDgweDIgMUA4NXgyIDJAODAgM0A3NSA0QDcwIDVANjUgNkA2MCA3QDU1IDhANTBcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiUGF1c2UgNSBjbSBhYm92ZSB0aGUga25lZXNcIl0sXG4gICAgICBbXCJkYkJlbmNoXCIsIFwiNXg2XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDUwIDRANjAgNEA3MCA0QDc1eDRcIiwgXCJCbG9jayBwdWxsIHdpdGggY2hhaW5zLCBiYXIgMTBcdTIwMTMxMiBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA2XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgM0A2NXgyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgM0A3MCA2QDcwIDRANzAgN0A3MCAyQDcwIDhANzAgNUA3MFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wibGF0ZXJhbFJhaXNlXCIsIFwiNXg2XCIsIFwiRGVsdHM6IGFueSBzaG91bGRlciBleGVyY2lzZVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg4XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNANzV4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYwIDVANzB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDNANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgM0A3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg0XCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEFNTDM6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1NSA0QDY1IDNANzUgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4MiAxQDg1eDIgMkA4MHgyXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDY1IDNANzUgM0A4NXgyIDJAOTB4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJANzV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIkluY2xpbmUgc2hvdWxkZXIgcHJlc3NcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIlBhdXNlIDUgY20gYWJvdmUgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDJcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMHgyXCIsIFwiVG9wOiAyXHUyMDEzMyBzaW5nbGVzIGF0IDEwMFx1MjAxMzEwNSVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJANzV4M1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiM3g1XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MCAxQDkwIDFAOTUgMUAxMDB4MlwiLCBcIlRvcDogMlx1MjAxMzMgc2luZ2xlcyBhdCAxMDBcdTIwMTMxMDUlXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMHgyXCIsIFwiVG9wOiAyXHUyMDEzMyBzaW5nbGVzIGF0IDEwMFx1MjAxMzEwNSVcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI0eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A3NXg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgNUA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiNHg4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgM0A3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNUA3MHg0XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDYwIDRANzAgNEA4MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgM1xuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDYwIDRANzAgNEA4MHg0XCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIDIgcyBwYXVzZSwgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4MiAyQDg1eDIgM0A4MCA1QDcwIDdANjAgOUA1MFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDRANzAgM0A3NXg0XCIsIFwiQWx0ZXJuYXRlIGZ1bGwgYW5kIGhhbGYgKHRvIGtuZWVzKSByZXBzXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgM0A2NSA3QDY1IDRANjUgOEA2NSAyQDY1IDZANjVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYWJvdmUgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjV4NlwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDU1IDNANjUgM0A3NSAzQDg1eDIgMkA5MHgzXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4MiAyQDg1eDIgM0A4MHgyXCJdLFxuICAgICAgW1wiZGVjbGluZUJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBiZWxvdyB0aGUga25lZXNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4MiAyQDg1eDMgM0A4MHgyXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDY1IDNANzUgM0A4NXgyIDJAOTV4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgM0A3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgM0A3MCA1QDcwIDdANzAgNEA3MCA2QDcwIDhANzBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcwIDRANzV4NFwiLCBcIkJvYXJkIHByZXNzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDcwIDJAODB4NFwiLCBcIkFsdGVybmF0ZSBmdWxsIGFuZCBoYWxmICh0byBrbmVlcykgcmVwc1wiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIkluY2xpbmUgc2hvdWxkZXIgcHJlc3NcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDY1IDJANzB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDcwIDNAODAgMkA5MHgyIDFAOTV4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA2QDYwIDZANzB4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1NSAzQDY1IDNANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDc1eDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgMiBzIHBhdXNlLCBsb3dlclwiXSxcbiAgICAgIFtcImNnQmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDU1IDNANjUgM0A3NSAzQDg1eDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NVwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNXg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gIF0sXG5dO1xuXG5jb25zdCBBTUw0OiBXa1tdID0gW1xuICBbIC8vIHdlZWsgMVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTUgNEA2NSAzQDc1IDJAODV4M1wiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHgyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjAgM0A3MCAyQDgweDIgMUA5MHgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI0eDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDIgMUA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDIgMkA4NXgzIDJAODB4MlwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNHg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjR4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNXgzXCIsIFwiSW5jbGluZSBzaG91bGRlciBwcmVzc1wiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A1NSAzQDY1IDNANzUgMkA4NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI0eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXgzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjN4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMFwiLCBcIlRvcDogMVx1MjAxMzIgc2luZ2xlcyBhdCAxMDAlXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMFwiLCBcIlRvcDogMVx1MjAxMzIgc2luZ2xlcyBhdCAxMDAlXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI0eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAwXCIsIFwiVG9wOiAxXHUyMDEzMiBzaW5nbGVzIGF0IDEwMCVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg0XCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkYkJlbmNoXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDNcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI0eDRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1NSAzQDY1IDJANzV4MiAxQDg1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDNAODB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXgzXCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDIgMUA4NXgzXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjR4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDRcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIkluY2xpbmUgc2hvdWxkZXIgcHJlc3NcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANTUgM0A2NSAzQDc1IDJAODV4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHgyIDFAODV4M1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg0XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4MlwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiMkA1MCAyQDYwIDJANzB4M1wiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiM3g2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAyQDcweDIgMUA3NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDNcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiM3g2XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAyQDcweDIgMUA3NXgzXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHgzXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAyQDYwIDFANzB4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDJANzB4M1wiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCB0ZW1wbGF0ZXMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IEJMT0NLU18yOV8zMjogUmVjb3JkPHN0cmluZywgQmxvY2s+ID0ge1xuICBcIjI5XCI6IHsga2V5OiBcInMyOVwiLCBsYWJlbDogXCIjMjlcIiwgd2Vla3M6IEIyOSB9LFxuICBcIjMwXCI6IHsga2V5OiBcInMzMFwiLCBsYWJlbDogXCIjMzBcIiwgd2Vla3M6IEIzMCB9LFxuICBcIjMxXCI6IHsga2V5OiBcInMzMVwiLCBsYWJlbDogXCIjMzFcIiwgd2Vla3M6IEIzMSB9LFxuICBcIjMyXCI6IHsga2V5OiBcInMzMlwiLCBsYWJlbDogXCIjMzJcIiwgd2Vla3M6IEIzMiB9LFxufTtcbmNvbnN0IFJVTlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPiA9IHsgYWxsOiBbXCIyOVwiLCBcIjMwXCIsIFwiMzFcIiwgXCIzMlwiXSwgXCIzMC0zMlwiOiBbXCIzMFwiLCBcIjMxXCIsIFwiMzJcIl0sIFwiMjlcIjogW1wiMjlcIl0sIFwiMzBcIjogW1wiMzBcIl0sIFwiMzFcIjogW1wiMzFcIl0sIFwiMzJcIjogW1wiMzJcIl0gfTtcblxuZXhwb3J0IGNvbnN0IHNoZWlrbzI5MzI6IFByb2dyYW1UZW1wbGF0ZSA9IHtcbiAgaWQ6IFwic2hlaWtvLTI5LTMyXCIsXG4gIG5hbWU6IFwiU2hlaWtvICMyOVx1MjAxMyMzMlwiLFxuICBhdXRob3I6IFwiQm9yaXMgU2hlaWtvXCIsXG4gIHNvdXJjZTogXCJTaGVpa28gUHJvZ3JhbSBTcHJlYWRzaGVldHMgKENoYXNlVCAyMDA4LCBMaWZ0VmF1bHQpOiB0YWJzICMyOSwgIzMwLCAjMzEsICMzMlwiLFxuICBzdW1tYXJ5OiBcIkZvdXIgNC13ZWVrIGJsb2NrcyBydW4gYmFjayB0byBiYWNrOiAjMjkgYW5kICMzMCBwcmVwYXJhdG9yeSwgIzMxIGFuZCAjMzIgY29tcGV0aXRpb24sIHBlYWtpbmcgd2l0aCBhIG1heCB0ZXN0IGluICMzMi4gQmVuY2ggdGhyZWUgdGltZXMgYSB3ZWVrLCBzcXVhdCB0d2ljZSwgZGVhZGxpZnQgb25jZSwgYWxsIGF0IGZpeGVkIHBlcmNlbnRhZ2VzIG9mIHlvdXIgMVJNLlwiLFxuICBjYXRlZ29yeTogXCJwb3dlcmxpZnRpbmdcIixcbiAgbGV2ZWw6IFwiaW50ZXJtZWRpYXRlXCIsXG4gIGRheXNQZXJXZWVrOiBbM10sXG4gIHdlZWtzOiAxNixcbiAgb3B0aW9uczogW1xuICAgIHsga2V5OiBcInJ1blwiLCBsYWJlbDogXCJCbG9ja3NcIiwgZGVmYXVsdDogXCJhbGxcIiwgY2hvaWNlczogW1xuICAgICAgeyB2YWx1ZTogXCJhbGxcIiwgbGFiZWw6IFwiIzI5IFx1MjE5MiAjMzIgKDE2IHdlZWtzKVwiIH0sXG4gICAgICB7IHZhbHVlOiBcIjMwLTMyXCIsIGxhYmVsOiBcIiMzMCBcdTIxOTIgIzMyICgxMiB3ZWVrcylcIiB9LFxuICAgICAgeyB2YWx1ZTogXCIyOVwiLCBsYWJlbDogXCIjMjkgb25seSAocHJlcGFyYXRvcnkpXCIgfSxcbiAgICAgIHsgdmFsdWU6IFwiMzBcIiwgbGFiZWw6IFwiIzMwIG9ubHkgKHByZXBhcmF0b3J5KVwiIH0sXG4gICAgICB7IHZhbHVlOiBcIjMxXCIsIGxhYmVsOiBcIiMzMSBvbmx5IChjb21wZXRpdGlvbilcIiB9LFxuICAgICAgeyB2YWx1ZTogXCIzMlwiLCBsYWJlbDogXCIjMzIgb25seSAoY29tcGV0aXRpb24gLyBwZWFrKVwiIH0sXG4gICAgXSB9LFxuICBdLFxuICBidWlsZChvKSB7XG4gICAgY29uc3QgcnVuID0gUlVOU1tvLnJ1biA/PyBcImFsbFwiXSA/PyBSVU5TLmFsbDtcbiAgICBjb25zdCBuYW1lID0gcnVuLmxlbmd0aCA+IDEgPyBgU2hlaWtvICMke3J1blswXX1cdTIwMTMjJHtydW5bcnVuLmxlbmd0aCAtIDFdfWAgOiBgU2hlaWtvICMke3J1blswXX1gO1xuICAgIHJldHVybiBwcm9ncmFtKFwic2hlaWtvLTI5LTMyXCIsIG5hbWUsIHJ1bi5tYXAoKGspID0+IEJMT0NLU18yOV8zMltrXSksIDMsIFtcbiAgICAgIC4uLk5PVEVTLFxuICAgICAgXCIjMzIgd2VlayAxIFdlZG5lc2RheSBpcyBhIG1heCB0ZXN0OiB3b3JrIHVwIHRvIDJcdTIwMTMzIHNpbmdsZXMgYXQgMTAwXHUyMDEzMTA1JS4gVGhlIGxhc3Qgd2VlayBlbmRzIGluIGNvbXBldGl0aW9uIChkYXlzIDVcdTIwMTM3KS5cIixcbiAgICBdKTtcbiAgfSxcbiAgZGVmYXVsdHMsXG59O1xuXG5leHBvcnQgY29uc3Qgc2hlaWtvMzc6IFByb2dyYW1UZW1wbGF0ZSA9IHtcbiAgaWQ6IFwic2hlaWtvLTM3XCIsXG4gIG5hbWU6IFwiU2hlaWtvICMzN1wiLFxuICBhdXRob3I6IFwiQm9yaXMgU2hlaWtvXCIsXG4gIHNvdXJjZTogXCJTaGVpa28gUHJvZ3JhbSBTcHJlYWRzaGVldHMgKENoYXNlVCAyMDA4LCBMaWZ0VmF1bHQpOiB0YWIgIzM3XCIsXG4gIHN1bW1hcnk6IFwiQSA0LXdlZWsgU2hlaWtvIHByZXBhcmF0b3J5IGJsb2NrIGF0IG1lZGl1bSB2b2x1bWU6IGJlbmNoIHRocmVlIHRpbWVzIGEgd2Vlaywgc3F1YXQgdHdpY2UsIGRlYWRsaWZ0IG9uY2UsIHdpdGggYmxvY2sgcHVsbHMgYW5kIGhhbHRpbmcgZGVhZGxpZnRzLlwiLFxuICBjYXRlZ29yeTogXCJwb3dlcmxpZnRpbmdcIixcbiAgbGV2ZWw6IFwiaW50ZXJtZWRpYXRlXCIsXG4gIGRheXNQZXJXZWVrOiBbM10sXG4gIHdlZWtzOiA0LFxuICBvcHRpb25zOiBbXSxcbiAgYnVpbGQ6ICgpID0+IHByb2dyYW0oXCJzaGVpa28tMzdcIiwgXCJTaGVpa28gIzM3XCIsIFt7IGtleTogXCJzMzdcIiwgbGFiZWw6IFwiIzM3XCIsIHdlZWtzOiBCMzcgfV0sIDMsIE5PVEVTKSxcbiAgZGVmYXVsdHMsXG59O1xuXG5leHBvcnQgY29uc3Qgc2hlaWtvQmVnaW5uZXI6IFByb2dyYW1UZW1wbGF0ZSA9IHtcbiAgaWQ6IFwic2hlaWtvLWJlZ2lubmVyXCIsXG4gIG5hbWU6IFwiU2hlaWtvIEJlZ2lubmVyXCIsXG4gIGF1dGhvcjogXCJCb3JpcyBTaGVpa29cIixcbiAgc291cmNlOiBcIlNoZWlrbyBCZWdpbm5lciBQcm9ncmFtIChDaGFzZVQgMjAwOCwgTGlmdFZhdWx0KTogdGFicyBQcmVwXzEsIENvbXBcIixcbiAgc3VtbWFyeTogXCJTaGVpa28ncyAzLWRheSBiZWdpbm5lciB0ZW1wbGF0ZTogcnVuIHRoZSA0LXdlZWsgcHJlcCBjeWNsZSBvbmUgb3IgbW9yZSB0aW1lcywgdGhlbiB0aGUgNC13ZWVrIGNvbXBldGl0aW9uIGN5Y2xlIHdpdGggYSBtYXggdGVzdCBpbiBpdHMgZmlyc3Qgd2Vlay5cIixcbiAgY2F0ZWdvcnk6IFwicG93ZXJsaWZ0aW5nXCIsXG4gIGxldmVsOiBcImJlZ2lubmVyXCIsXG4gIGRheXNQZXJXZWVrOiBbM10sXG4gIHdlZWtzOiA4LFxuICBvcHRpb25zOiBbXG4gICAgeyBrZXk6IFwicHJlcFwiLCBsYWJlbDogXCJQcmVwIGN5Y2xlc1wiLCBkZWZhdWx0OiBcIjFcIiwgY2hvaWNlczogW1xuICAgICAgeyB2YWx1ZTogXCIxXCIsIGxhYmVsOiBcIjEgKDQgd2Vla3MpXCIgfSwgeyB2YWx1ZTogXCIyXCIsIGxhYmVsOiBcIjIgKDggd2Vla3MpXCIgfSwgeyB2YWx1ZTogXCIzXCIsIGxhYmVsOiBcIjMgKDEyIHdlZWtzKVwiIH0sXG4gICAgXSB9LFxuICAgIHsga2V5OiBcImNvbXBcIiwgbGFiZWw6IFwiQ29tcGV0aXRpb24gY3ljbGVcIiwgZGVmYXVsdDogXCJvblwiLCBjaG9pY2VzOiBbXG4gICAgICB7IHZhbHVlOiBcIm9uXCIsIGxhYmVsOiBcIkZpbmlzaCB3aXRoIHRoZSA0LXdlZWsgY29tcCBjeWNsZVwiIH0sIHsgdmFsdWU6IFwib2ZmXCIsIGxhYmVsOiBcIlByZXAgb25seSwgdGhlbiByZXRlc3RcIiB9LFxuICAgIF0gfSxcbiAgXSxcbiAgYnVpbGQobykge1xuICAgIGNvbnN0IG4gPSBNYXRoLm1pbigzLCBNYXRoLm1heCgxLCBOdW1iZXIoby5wcmVwID8/IDEpIHx8IDEpKTtcbiAgICBjb25zdCBibG9ja3M6IEJsb2NrW10gPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBuIH0sIChfLCBpKSA9PiAoeyBrZXk6IGBicCR7aSArIDF9YCwgbGFiZWw6IG4gPiAxID8gYFByZXAgJHtpICsgMX1gIDogXCJQcmVwXCIsIHdlZWtzOiBCRUdfUFJFUCB9KSk7XG4gICAgaWYgKChvLmNvbXAgPz8gXCJvblwiKSA9PT0gXCJvblwiKSBibG9ja3MucHVzaCh7IGtleTogXCJiY1wiLCBsYWJlbDogXCJDb21wXCIsIHdlZWtzOiBCRUdfQ09NUCB9KTtcbiAgICByZXR1cm4gcHJvZ3JhbShcInNoZWlrby1iZWdpbm5lclwiLCBcIlNoZWlrbyBCZWdpbm5lclwiLCBibG9ja3MsIDMsIFtcbiAgICAgIC4uLk5PVEVTLFxuICAgICAgXCJBY2Nlc3NvcnkgXFxcIn42NSUgZWZmb3J0XFxcIiBpcyB0aGUgc2hlZXQncyBpbnRlbnNpdHkgZm9yIHRoYXQgZXhlcmNpc2UsIG5vdCBhICUgb2YgYSBjb21wZXRpdGlvbiBsaWZ0LlwiLFxuICAgICAgXCJDb21wIHdlZWsgMSBXZWRuZXNkYXkgaXMgYSBtYXggdGVzdCAoc2luZ2xlcyB1cCB0byAxMDUlKS4gSWYgeW91IGhpdCBhIFBSLCB1cGRhdGUgeW91ciAxUk0gdW5sZXNzIHRoZSBtZWV0IGlzIHVuZGVyIDMwIGRheXMgYXdheS5cIixcbiAgICBdKTtcbiAgfSxcbiAgZGVmYXVsdHMsXG59O1xuXG5leHBvcnQgY29uc3Qgc2hlaWtvQW1sOiBQcm9ncmFtVGVtcGxhdGUgPSB7XG4gIGlkOiBcInNoZWlrby1hbWxcIixcbiAgbmFtZTogXCJTaGVpa28gQWR2YW5jZWQgTWVkaXVtIExvYWRcIixcbiAgYXV0aG9yOiBcIkJvcmlzIFNoZWlrb1wiLFxuICBzb3VyY2U6IFwiU2hlaWtvIEFkdmFuY2VkIE1lZGl1bSBMb2FkIChDaGFzZVQgMjAwOCwgTGlmdFZhdWx0KTogdGFicyBQcmVwIEN5Y2xlIEksIElJLCBJSUksIENvbXAgQ3ljbGVcIixcbiAgc3VtbWFyeTogXCJTaGVpa28ncyA0LWRheSBwbGFuIGZvciBDbGFzcyAxIGFuZCBhYm92ZTogdGhyZWUgcHJlcGFyYXRvcnkgY3ljbGVzICg0LCA2IGFuZCA1IHdlZWtzKSBhbmQgYSA1LXdlZWsgY29tcGV0aXRpb24gY3ljbGUsIHdpdGggYm9hcmQgYW5kIGNoYWluIHByZXNzZXMsIHBhdXNlZCBhbmQgYmxvY2sgZGVhZGxpZnRzLCBhbmQgbWF4IHRlc3RzIGFsb25nIHRoZSB3YXkuXCIsXG4gIGNhdGVnb3J5OiBcInBvd2VybGlmdGluZ1wiLFxuICBsZXZlbDogXCJhZHZhbmNlZFwiLFxuICBkYXlzUGVyV2VlazogWzRdLFxuICB3ZWVrczogMjAsXG4gIG9wdGlvbnM6IFtdLFxuICBidWlsZDogKCkgPT4gcHJvZ3JhbShcInNoZWlrby1hbWxcIiwgXCJTaGVpa28gQU1MXCIsIFtcbiAgICB7IGtleTogXCJhMVwiLCBsYWJlbDogXCJQcmVwIElcIiwgd2Vla3M6IEFNTDEgfSxcbiAgICB7IGtleTogXCJhMlwiLCBsYWJlbDogXCJQcmVwIElJXCIsIHdlZWtzOiBBTUwyIH0sXG4gICAgeyBrZXk6IFwiYTNcIiwgbGFiZWw6IFwiUHJlcCBJSUlcIiwgd2Vla3M6IEFNTDMgfSxcbiAgICB7IGtleTogXCJhNFwiLCBsYWJlbDogXCJDb21wXCIsIHdlZWtzOiBBTUw0IH0sXG4gIF0sIDQsIFtcbiAgICAuLi5OT1RFUyxcbiAgICBcIkNoYWluczogYWRkIDhcdTIwMTMxMCBrZyBvZiBjaGFpbiBwZXIgc2lkZSBvbiB0b3Agb2YgdGhlIGxpc3RlZCBiYXIgd2VpZ2h0LlwiLFxuICAgIFwiUHJlcCBJSUkgd2VlayAyIGFuZCBDb21wIHdlZWsgMiBpbmNsdWRlIG1heC10ZXN0IHNpbmdsZXMgKDEwMFx1MjAxMzEwNSUgLyAxMDAlKS5cIixcbiAgICBcIlRoZSBsYXN0IHdlZWsgZW5kcyBpbiBjb21wZXRpdGlvbi5cIixcbiAgXSksXG4gIGRlZmF1bHRzLFxufTtcblxuZXhwb3J0IGNvbnN0IFNIRUlLT19URU1QTEFURVMgPSBbc2hlaWtvMjkzMiwgc2hlaWtvMzcsIHNoZWlrb0JlZ2lubmVyLCBzaGVpa29BbWxdO1xuIiwgIi8vIFNoZWlrbyB0ZW1wbGF0ZXM6IHByZXNjcmliZWQgd2VpZ2h0cyBjaGVja2VkIGJ5IGhhbmQgYWdhaW5zdCB0aGUgQ2hhc2VUL0xpZnRWYXVsdCBzaGVldHMuXG5pbXBvcnQgeyBkZXNjcmliZSwgZXhwZWN0LCBpdCB9IGZyb20gXCJ2aXRlc3RcIjtcbmltcG9ydCB0eXBlIHsgSGV2eVdvcmtvdXQgfSBmcm9tIFwiLi4vaGV2eVwiO1xuaW1wb3J0IHsgTElGVFMgfSBmcm9tIFwiLi4vbGlmdHNcIjtcbmltcG9ydCB7IGFsbFNsb3RzLCBhcHBseVdvcmtvdXQsIGluaXRpYWxTdGF0ZSwgcGxhbkRheSwgcmVwbGF5LCB0eXBlIFByb2dyYW1Db25maWcsIHR5cGUgUHJvZ3JhbURlZiwgdHlwZSBQcm9ncmFtU3RhdGUgfSBmcm9tIFwiLi4vcHJvZ3JhbVwiO1xuaW1wb3J0IHsgdG9LZyB9IGZyb20gXCIuLi91bml0c1wiO1xuaW1wb3J0IHsgcGFyc2VTZXRzLCBzaGVpa28yOTMyLCBzaGVpa28zNywgc2hlaWtvQW1sLCBzaGVpa29CZWdpbm5lciwgU0hFSUtPX1RFTVBMQVRFUyB9IGZyb20gXCIuL3NoZWlrb1wiO1xuXG5jb25zdCBjZmcgPSAodGVtcGxhdGVJZDogc3RyaW5nLCBvcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge30pOiBQcm9ncmFtQ29uZmlnID0+ICh7XG4gIHRlbXBsYXRlSWQsIG9wdGlvbnMsIHVuaXQ6IFwibGJcIiwgc3RhcnREYXRlOiBcIjIwMjYtMDEtMDFcIiwgc3RhcnRXZWlnaHRzOiB7fSxcbiAgdHJhaW5pbmdNYXhlczogeyBzcXVhdDogMzAwLCBiZW5jaDogMjAwLCBkZWFkbGlmdDogNDAwIH0sXG59KTtcbi8qKiBbd2VpZ2h0LCByZXBzXSBwZXIgc2V0IGZvciBhIGRheSdzIHNsb3QuICovXG5jb25zdCBzZXRzID0gKGRlZjogUHJvZ3JhbURlZiwgYzogUHJvZ3JhbUNvbmZpZywgczogUHJvZ3JhbVN0YXRlLCBkYXlJZDogc3RyaW5nLCBzbG90SWQ6IHN0cmluZykgPT4ge1xuICBjb25zdCBpID0gZGVmLmRheXMuZmluZEluZGV4KChkKSA9PiBkLmlkID09PSBkYXlJZCk7XG4gIGNvbnN0IGV4ID0gcGxhbkRheShkZWYsIGMsIHMsIGkpLmV4ZXJjaXNlcy5maW5kKChlKSA9PiBlLnNsb3RJZCA9PT0gc2xvdElkKTtcbiAgcmV0dXJuIGV4Py5zZXRzLm1hcCgoeCkgPT4gW3gud2VpZ2h0LCB4LnJlcHNdKTtcbn07XG5jb25zdCByZXAgPSAobjogbnVtYmVyLCB3OiBudW1iZXIsIHI6IG51bWJlcikgPT4gQXJyYXkuZnJvbSh7IGxlbmd0aDogbiB9LCAoKSA9PiBbdywgcl0pO1xuXG4vKiogQSBIZXZ5IHdvcmtvdXQgdGhhdCBkb2VzIGV4YWN0bHkgd2hhdCB0aGUgcGxhbiBzYXlzIChza2lwcGluZyBzb21lIHNsb3RzIGlmIGFza2VkKS4gKi9cbmZ1bmN0aW9uIGRvUGxhbihkZWY6IFByb2dyYW1EZWYsIGM6IFByb2dyYW1Db25maWcsIHM6IFByb2dyYW1TdGF0ZSwgbjogbnVtYmVyLCBza2lwOiBzdHJpbmdbXSA9IFtdKTogSGV2eVdvcmtvdXQge1xuICBjb25zdCBwID0gcGxhbkRheShkZWYsIGMsIHMpO1xuICBjb25zdCBkYXRlID0gbmV3IERhdGUoRGF0ZS5VVEMoMjAyNiwgMCwgMiArIG4gKiAyKSkudG9JU09TdHJpbmcoKS5zbGljZSgwLCAxMCk7XG4gIHJldHVybiB7XG4gICAgaWQ6IGB3JHtufWAsIHRpdGxlOiBwLmRheU5hbWUsIHN0YXJ0X3RpbWU6IGAke2RhdGV9VDEyOjAwOjAwWmAsIGVuZF90aW1lOiBgJHtkYXRlfVQxMzozMDowMFpgLFxuICAgIGV4ZXJjaXNlczogcC5leGVyY2lzZXMuZmlsdGVyKChlKSA9PiAhc2tpcC5pbmNsdWRlcyhlLnNsb3RJZCkpLm1hcCgoZSkgPT4gKHtcbiAgICAgIHRpdGxlOiBMSUZUU1tlLmxpZnRdLmhldnlbMF0sIGV4ZXJjaXNlX3RlbXBsYXRlX2lkOiBMSUZUU1tlLmxpZnRdLmhldnlbMF0sXG4gICAgICBzZXRzOiBlLnNldHMubWFwKCh4KSA9PiAoeyB0eXBlOiBcIm5vcm1hbFwiIGFzIGNvbnN0LCB3ZWlnaHRfa2c6IHRvS2coeC53ZWlnaHQsIFwibGJcIiksIHJlcHM6IHgucmVwcyB9KSksXG4gICAgfSkpLFxuICB9O1xufVxuXG5kZXNjcmliZShcImFsbCBTaGVpa28gdGVtcGxhdGVzIGJ1aWxkXCIsICgpID0+IHtcbiAgZm9yIChjb25zdCB0IG9mIFNIRUlLT19URU1QTEFURVMpIHtcbiAgICBpdChgJHt0LmlkfTogdW5pcXVlIGlkcywgZmluaXRlLCAxUk1gLCAoKSA9PiB7XG4gICAgICBjb25zdCBvcHRzID0gT2JqZWN0LmZyb21FbnRyaWVzKHQub3B0aW9ucy5tYXAoKG8pID0+IFtvLmtleSwgby5kZWZhdWx0XSkpO1xuICAgICAgY29uc3QgZGVmID0gdC5idWlsZChvcHRzKTtcbiAgICAgIGNvbnN0IGlkcyA9IGFsbFNsb3RzKGRlZikubWFwKChzKSA9PiBzLmlkKTtcbiAgICAgIGV4cGVjdChuZXcgU2V0KGlkcykuc2l6ZSkudG9CZShpZHMubGVuZ3RoKTtcbiAgICAgIGV4cGVjdChuZXcgU2V0KGRlZi5kYXlzLm1hcCgoZCkgPT4gZC5pZCkpLnNpemUpLnRvQmUoZGVmLmRheXMubGVuZ3RoKTtcbiAgICAgIGV4cGVjdChkZWYuY3ljbGUpLnRvTWF0Y2hPYmplY3QoeyBmaW5pdGU6IHRydWUsIHdlZWtzOiB0LndlZWtzIH0pO1xuICAgICAgZXhwZWN0KGRlZi5tYXhMYWJlbCkudG9CZShcIjFSTVwiKTtcbiAgICAgIGV4cGVjdCh0LmlkLnN0YXJ0c1dpdGgoXCJzaGVpa28tXCIpKS50b0JlKHRydWUpO1xuICAgICAgZm9yIChjb25zdCBzIG9mIGFsbFNsb3RzKGRlZikpIGV4cGVjdChMSUZUU1tzLmxpZnRdLCBzLmxpZnQpLnRvQmVEZWZpbmVkKCk7XG4gICAgfSk7XG4gIH1cbiAgaXQoXCJwYXJzZXMgc2V0IHNwZWNzXCIsICgpID0+IHtcbiAgICBleHBlY3QocGFyc2VTZXRzKFwiNUA1MCA0QDYweDJcIikpLnRvRXF1YWwoW3sgcGN0OiAwLjUsIHJlcHM6IDUgfSwgeyBwY3Q6IDAuNiwgcmVwczogNCB9LCB7IHBjdDogMC42LCByZXBzOiA0IH1dKTtcbiAgfSk7XG4gIGl0KFwiYmxvY2sgb3B0aW9ucyBwaWNrIHRoZSByaWdodCB3ZWVrc1wiLCAoKSA9PiB7XG4gICAgZXhwZWN0KHNoZWlrbzI5MzIuYnVpbGQoeyBydW46IFwiMzJcIiB9KS5jeWNsZT8ud2Vla3MpLnRvQmUoNCk7XG4gICAgZXhwZWN0KHNoZWlrbzI5MzIuYnVpbGQoeyBydW46IFwiMzAtMzJcIiB9KS5jeWNsZT8ud2Vla3MpLnRvQmUoMTIpO1xuICAgIGV4cGVjdChzaGVpa29CZWdpbm5lci5idWlsZCh7IHByZXA6IFwiMlwiLCBjb21wOiBcIm9uXCIgfSkuY3ljbGU/LndlZWtzKS50b0JlKDEyKTtcbiAgICBleHBlY3Qoc2hlaWtvQmVnaW5uZXIuYnVpbGQoeyBwcmVwOiBcIjFcIiwgY29tcDogXCJvZmZcIiB9KS5jeWNsZT8ud2Vla3MpLnRvQmUoNCk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKFwiIzI5XHUyMDEzIzMyIGFnYWluc3QgdGhlIHNoZWV0IChzcXVhdCAzMDAgLyBiZW5jaCAyMDAgLyBkZWFkbGlmdCA0MDApXCIsICgpID0+IHtcbiAgY29uc3QgYyA9IGNmZyhcInNoZWlrby0yOS0zMlwiKTtcbiAgY29uc3QgZGVmID0gc2hlaWtvMjkzMi5idWlsZCh7IHJ1bjogXCJhbGxcIiB9KTtcbiAgY29uc3QgcyA9IGluaXRpYWxTdGF0ZShkZWYsIGMpO1xuXG4gIGl0KFwiIzI5IFcxIE1vbmRheTogYmVuY2gsIHNxdWF0LCBiZW5jaCBhZ2FpbiwgZmx5ZXMsIGdvb2QgbW9ybmluZ3NcIiwgKCkgPT4ge1xuICAgIGNvbnN0IGQgPSBkZWYuZGF5c1swXTtcbiAgICBleHBlY3QoZC5pZCkudG9CZShcIlMyOVcxRDFcIik7XG4gICAgZXhwZWN0KGQuc2xvdHMubWFwKCh4KSA9PiB4LmlkKSkudG9FcXVhbChbXCJzMjl3MWQxLWJlbmNoXCIsIFwiczI5dzFkMS1zcXVhdFwiLCBcInMyOXcxZDEtYmVuY2gyXCIsIFwiczI5dzFkMS1jaGVzdEZseVwiLCBcInMyOXcxZDEtZ29vZE1vcm5pbmdcIl0pO1xuICAgIC8vIDUwJVx1MDBENzVcdTAwRDcxLCA2MCVcdTAwRDc0XHUwMEQ3MiwgNzAlXHUwMEQ3M1x1MDBENzIsIDc1JVx1MDBENzNcdTAwRDc1XG4gICAgZXhwZWN0KHNldHMoZGVmLCBjLCBzLCBcIlMyOVcxRDFcIiwgXCJzMjl3MWQxLWJlbmNoXCIpKS50b0VxdWFsKFtbMTAwLCA1XSwgLi4ucmVwKDIsIDEyMCwgNCksIC4uLnJlcCgyLCAxNDAsIDMpLCAuLi5yZXAoNSwgMTUwLCAzKV0pO1xuICAgIC8vIDUwJVx1MDBENzVcdTAwRDcxLCA2MCVcdTAwRDc1XHUwMEQ3MiwgNzAlXHUwMEQ3NVx1MDBENzVcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzI5VzFEMVwiLCBcInMyOXcxZDEtc3F1YXRcIikpLnRvRXF1YWwoW1sxNTAsIDVdLCAuLi5yZXAoMiwgMTgwLCA1KSwgLi4ucmVwKDUsIDIxMCwgNSldKTtcbiAgICAvLyA1MCVcdTAwRDc1XHUwMEQ3MSwgNjAlXHUwMEQ3NVx1MDBENzEsIDcwJVx1MDBENzRcdTAwRDc0XG4gICAgZXhwZWN0KHNldHMoZGVmLCBjLCBzLCBcIlMyOVcxRDFcIiwgXCJzMjl3MWQxLWJlbmNoMlwiKSkudG9FcXVhbChbWzEwMCwgNV0sIFsxMjAsIDVdLCAuLi5yZXAoNCwgMTQwLCA0KV0pO1xuICAgIGV4cGVjdChkLnNsb3RzWzNdLnByb2dyZXNzaW9uKS50b0VxdWFsKHsga2luZDogXCJmaXhlZFwiLCBzZXRzOiA1LCByZXBzOiAxMCB9KTtcbiAgfSk7XG5cbiAgaXQoXCIjMjkgVzEgV2VkbmVzZGF5OiBkZWFkbGlmdCB0byBrbmVlcyBhbmQgYmxvY2sgcHVsbHMgb2ZmIHRoZSBkZWFkbGlmdCAxUk1cIiwgKCkgPT4ge1xuICAgIGNvbnN0IGQgPSBkZWYuZGF5cy5maW5kKCh4KSA9PiB4LmlkID09PSBcIlMyOVcxRDJcIikhO1xuICAgIGV4cGVjdChkLnNsb3RzWzBdKS50b01hdGNoT2JqZWN0KHsgbGlmdDogXCJkZWFkbGlmdFwiLCB0aWVyOiBcIlNVUFBcIiB9KTtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzI5VzFEMlwiLCBcInMyOXcxZDItZGVhZGxpZnRcIikpLnRvRXF1YWwoW1syMDAsIDNdLCAuLi5yZXAoMiwgMjQwLCAzKSwgLi4ucmVwKDIsIDI4MCwgMyksIC4uLnJlcCg0LCAzMDAsIDMpXSk7XG4gICAgZXhwZWN0KHNldHMoZGVmLCBjLCBzLCBcIlMyOVcxRDJcIiwgXCJzMjl3MWQyLXJhY2tQdWxsXCIpKS50b0VxdWFsKFtbMjIwLCA0XSwgWzI2MCwgNF0sIC4uLnJlcCgyLCAzMDAsIDQpLCAuLi5yZXAoNCwgMzQwLCAzKV0pO1xuICB9KTtcblxuICBpdChcIiMzMCBXMSBXZWRuZXNkYXkgYmVuY2ggcHlyYW1pZCB0b3BzIG91dCBhdCA4NSVcdTAwRDcxXHUwMEQ3MiBhbmQgY29tZXMgYmFjayBkb3duIHRvIDUwJVx1MDBENzEyXCIsICgpID0+IHtcbiAgICBjb25zdCB3ID0gc2V0cyhkZWYsIGMsIHMsIFwiUzMwVzFEMlwiLCBcInMzMHcxZDItYmVuY2hcIikhO1xuICAgIGV4cGVjdCh3LmZpbHRlcigoW3d0XSkgPT4gd3QgPT09IDE3MCkpLnRvRXF1YWwoW1sxNzAsIDFdLCBbMTcwLCAxXV0pO1xuICAgIGV4cGVjdCh3W3cubGVuZ3RoIC0gMV0pLnRvRXF1YWwoWzEwMCwgMTJdKTtcbiAgICBleHBlY3QodykudG9IYXZlTGVuZ3RoKDE5KTtcbiAgfSk7XG5cbiAgaXQoXCIjMzEgVzEgTW9uZGF5IHNxdWF0OiA3MCUgd2F2ZSBvZiAyLDQsNiw4LDcsNSwzXCIsICgpID0+IHtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzMxVzFEMVwiLCBcInMzMXcxZDEtc3F1YXRcIikhLnNsaWNlKDMpKS50b0VxdWFsKFsyLCA0LCA2LCA4LCA3LCA1LCAzXS5tYXAoKHIpID0+IFsyMTAsIHJdKSk7XG4gIH0pO1xuXG4gIGl0KFwiIzMyIFcxIFdlZG5lc2RheSBtYXggdGVzdCBlbmRzIHdpdGggc2luZ2xlcyBhdCAxMDAlXCIsICgpID0+IHtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzMyVzFEMlwiLCBcInMzMncxZDItc3F1YXRcIikhLnNsaWNlKC0zKSkudG9FcXVhbChbWzI3MCwgMV0sIFszMDAsIDFdLCBbMzAwLCAxXV0pO1xuICAgIGV4cGVjdChkZWYuZGF5cy5maW5kKCh4KSA9PiB4LmlkID09PSBcIlMzMlcxRDJcIikhLnNsb3RzWzBdLm5vdGUpLnRvTWF0Y2goLzEwMFx1MjAxMzEwNSUvKTtcbiAgfSk7XG5cbiAgaXQoXCJ3ZWVrcyBhcmUgbmFtZWQgYnkgYmxvY2s7IGZyb250IHNxdWF0IHVzZXMgdGhlIHNxdWF0IDFSTVwiLCAoKSA9PiB7XG4gICAgZXhwZWN0KGRlZi5jeWNsZT8ud2Vla05hbWVzPy5bNF0pLnRvQmUoXCIjMzAgXHUwMEI3IFdlZWsgMVwiKTtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzI5VzJEMVwiLCBcInMyOXcyZDEtZnJvbnRTcXVhdFwiKSFbMF0pLnRvRXF1YWwoWzEzNSwgM10pOyAvLyA0NSUgb2YgMzAwXG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKFwiIzM3LCBCZWdpbm5lciBhbmQgQU1MIGFnYWluc3QgdGhlIHNoZWV0c1wiLCAoKSA9PiB7XG4gIGl0KFwiIzM3IFcxIEZyaWRheTogYmVuY2ggcHlyYW1pZCA1MCVcdTAwRDc3IFx1MjAyNiA3NSVcdTAwRDcyXHUwMEQ3MiBcdTIwMjYgNTAlXHUwMEQ3MTBcIiwgKCkgPT4ge1xuICAgIGNvbnN0IGRlZiA9IHNoZWlrbzM3LmJ1aWxkKHt9KTtcbiAgICBjb25zdCBjID0gY2ZnKFwic2hlaWtvLTM3XCIpO1xuICAgIGNvbnN0IHcgPSBzZXRzKGRlZiwgYywgaW5pdGlhbFN0YXRlKGRlZiwgYyksIFwiUzM3VzFEM1wiLCBcInMzN3cxZDMtYmVuY2hcIikhO1xuICAgIGV4cGVjdCh3WzBdKS50b0VxdWFsKFsxMDAsIDddKTtcbiAgICBleHBlY3Qody5maWx0ZXIoKFt3dF0pID0+IHd0ID09PSAxNTApKS50b0VxdWFsKFtbMTUwLCAyXSwgWzE1MCwgMl1dKTtcbiAgICBleHBlY3Qod1t3Lmxlbmd0aCAtIDFdKS50b0VxdWFsKFsxMDAsIDEwXSk7XG4gIH0pO1xuXG4gIGl0KFwiQmVnaW5uZXIgY29tcCBXMSBXZWRuZXNkYXk6IHNxdWF0IHNpbmdsZXMgdXAgdG8gMTA1JVwiLCAoKSA9PiB7XG4gICAgY29uc3QgZGVmID0gc2hlaWtvQmVnaW5uZXIuYnVpbGQoeyBwcmVwOiBcIjFcIiwgY29tcDogXCJvblwiIH0pO1xuICAgIGNvbnN0IGMgPSBjZmcoXCJzaGVpa28tYmVnaW5uZXJcIik7XG4gICAgZXhwZWN0KHNldHMoZGVmLCBjLCBpbml0aWFsU3RhdGUoZGVmLCBjKSwgXCJCQ1cxRDJcIiwgXCJiY3cxZDItc3F1YXRcIikhLnNsaWNlKC00KSkudG9FcXVhbChbWzI3MCwgMV0sIFsyODUsIDFdLCBbMzAwLCAxXSwgWzMxNSwgMV1dKTtcbiAgICBleHBlY3QoZGVmLmRheXNbMF0uc2xvdHMubWFwKCh4KSA9PiB4LmxpZnQpKS50b0VxdWFsKFtcInNxdWF0XCIsIFwiYmVuY2hcIiwgXCJjaGVzdEZseVwiLCBcImdvb2RNb3JuaW5nXCJdKTtcbiAgfSk7XG5cbiAgaXQoXCJBTUwgUHJlcCBJIFcxIE1vbmRheTogZnJvbnQgc3F1YXQgYXQgMzAvNDAvNTAlIG9mIHNxdWF0LCB0aGVuIGJlbmNoIDc1JVx1MDBENzJcdTAwRDc0XCIsICgpID0+IHtcbiAgICBjb25zdCBkZWYgPSBzaGVpa29BbWwuYnVpbGQoe30pO1xuICAgIGNvbnN0IGMgPSBjZmcoXCJzaGVpa28tYW1sXCIpO1xuICAgIGNvbnN0IHMgPSBpbml0aWFsU3RhdGUoZGVmLCBjKTtcbiAgICBleHBlY3QoZGVmLmRheXMuZmlsdGVyKChkKSA9PiBkLndlZWtzPy5bMF0gPT09IDApLm1hcCgoZCkgPT4gZC5uYW1lKSkudG9FcXVhbChbXCJQcmVwIEkgVzEgXHUwMEI3IE1vblwiLCBcIlByZXAgSSBXMSBcdTAwQjcgV2VkXCIsIFwiUHJlcCBJIFcxIFx1MDBCNyBGcmlcIiwgXCJQcmVwIEkgVzEgXHUwMEI3IFNhdFwiXSk7XG4gICAgZXhwZWN0KHNldHMoZGVmLCBjLCBzLCBcIkExVzFEMVwiLCBcImExdzFkMS1mcm9udFNxdWF0XCIpKS50b0VxdWFsKFtbOTAsIDRdLCBbMTIwLCA0XSwgLi4ucmVwKDMsIDE1MCwgNCldKTtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiQTFXMUQxXCIsIFwiYTF3MWQxLWJlbmNoXCIpIS5zbGljZSgtNCkpLnRvRXF1YWwocmVwKDQsIDE1MCwgMikpO1xuICB9KTtcbn0pO1xuXG5kZXNjcmliZShcInJlcGxheWluZyBTaGVpa28gIzMyXCIsICgpID0+IHtcbiAgY29uc3QgZGVmID0gc2hlaWtvMjkzMi5idWlsZCh7IHJ1bjogXCIzMlwiIH0pO1xuICBjb25zdCBjID0gY2ZnKFwic2hlaWtvLTI5LTMyXCIsIHsgcnVuOiBcIjMyXCIgfSk7XG5cbiAgaXQoXCJ3YWxrcyB0aGUgc2Vzc2lvbnMgaW4gb3JkZXIgYW5kIGNvbXBsZXRlcyBhZnRlciB3ZWVrIDRcIiwgKCkgPT4ge1xuICAgIGxldCBzID0gaW5pdGlhbFN0YXRlKGRlZiwgYyk7XG4gICAgY29uc3Qgd3M6IEhldnlXb3Jrb3V0W10gPSBbXTtcbiAgICBmb3IgKGxldCBuID0gMDsgbiA8IDExOyBuKyspIHtcbiAgICAgIGNvbnN0IHcgPSBkb1BsYW4oZGVmLCBjLCBzLCBuKTtcbiAgICAgIHdzLnB1c2godyk7XG4gICAgICBzID0gYXBwbHlXb3Jrb3V0KGRlZiwgYywgcywgdywgcy5kYXlJbmRleCk7XG4gICAgfVxuICAgIGV4cGVjdChzLmNvbXBsZXRlKS50b0JlKHRydWUpO1xuICAgIGV4cGVjdChzLmxvZy5tYXAoKGwpID0+IGwuZGF5SWQpKS50b0VxdWFsKFtcIlMzMlcxRDFcIiwgXCJTMzJXMUQyXCIsIFwiUzMyVzFEM1wiLCBcIlMzMlcyRDFcIiwgXCJTMzJXMkQyXCIsIFwiUzMyVzJEM1wiLCBcIlMzMlczRDFcIiwgXCJTMzJXM0QyXCIsIFwiUzMyVzNEM1wiLCBcIlMzMlc0RDFcIiwgXCJTMzJXNEQyXCJdKTtcbiAgICBjb25zdCByID0gcmVwbGF5KGRlZiwgYywgd3MpO1xuICAgIGV4cGVjdChyLmNvbXBsZXRlKS50b0JlKHRydWUpO1xuICAgIGV4cGVjdChyLmxvZy5tYXAoKGwpID0+IGwuZGF5SWQpKS50b0VxdWFsKHMubG9nLm1hcCgobCkgPT4gbC5kYXlJZCkpO1xuICAgIGV4cGVjdChyLnRtcykudG9FcXVhbCh7IHNxdWF0OiAzMDAsIGJlbmNoOiAyMDAsIGRlYWRsaWZ0OiA0MDAgfSk7IC8vIFNoZWlrbyBkb2Vzbid0IG1vdmUgbWF4ZXMgbWlkLWJsb2NrXG4gIH0pO1xuXG4gIGl0KFwibWF0Y2hlcyBhIHNlY29uZCBiZW5jaCBibG9jayB0byB0aGUgc2Vjb25kIGJlbmNoIHNsb3QsIGFuZCBmbGFncyBpdCBtaXNzZWQgaWYgc2tpcHBlZFwiLCAoKSA9PiB7XG4gICAgbGV0IHMgPSBpbml0aWFsU3RhdGUoZGVmLCBjKTtcbiAgICBmb3IgKGxldCBuID0gMDsgbiA8IDU7IG4rKykgcyA9IGFwcGx5V29ya291dChkZWYsIGMsIHMsIGRvUGxhbihkZWYsIGMsIHMsIG4pLCBzLmRheUluZGV4KTtcbiAgICBleHBlY3QoZGVmLmRheXNbcy5kYXlJbmRleF0uaWQpLnRvQmUoXCJTMzJXMkQzXCIpOyAvLyBiZW5jaCwgc3F1YXQsIGJlbmNoLCBmbHksIEdNXG4gICAgY29uc3QgZnVsbCA9IGFwcGx5V29ya291dChkZWYsIGMsIHMsIGRvUGxhbihkZWYsIGMsIHMsIDUpLCBzLmRheUluZGV4KS5sb2cuYXQoLTEpIS5yZXN1bHRzO1xuICAgIGV4cGVjdChmdWxsLmZpbmQoKHgpID0+IHguc2xvdElkID09PSBcInMzMncyZDMtYmVuY2gyXCIpKS50b01hdGNoT2JqZWN0KHsgb3V0Y29tZTogXCJzdWNjZXNzXCIsIHdlaWdodDogMTQwLCByZXBzOiBbNCwgNCwgNCwgNCwgNCwgNF0gfSk7XG4gICAgY29uc3Qgc2tpcHBlZCA9IGFwcGx5V29ya291dChkZWYsIGMsIHMsIGRvUGxhbihkZWYsIGMsIHMsIDUsIFtcInMzMncyZDMtYmVuY2gyXCJdKSwgcy5kYXlJbmRleCkubG9nLmF0KC0xKSEucmVzdWx0cztcbiAgICBleHBlY3Qoc2tpcHBlZC5maW5kKCh4KSA9PiB4LnNsb3RJZCA9PT0gXCJzMzJ3MmQzLWJlbmNoXCIpPy5vdXRjb21lKS50b0JlKFwic3VjY2Vzc1wiKTtcbiAgICBleHBlY3Qoc2tpcHBlZC5maW5kKCh4KSA9PiB4LnNsb3RJZCA9PT0gXCJzMzJ3MmQzLWJlbmNoMlwiKT8ub3V0Y29tZSkudG9CZShcIm1pc3NlZFwiKTtcbiAgfSk7XG59KTtcblxuLy8gRGF5LWJ5LWRheSBhZ2FpbnN0IHRoZSBDaGFzZVQgMjAwOCBzaGVldHMgaG9zdGVkIGJ5IExpZnRWYXVsdCAoXCJTaGVpa28gVHJhaW5pbmcgQ29sbGVjdGlvblwiXG4vLyB0YWJzICMyOVx1MjAxMyMzMiBhbmQgIzM3LCBcIlNoZWlrbyBCZWdpbm5lclwiIFByZXBfMS9Db21wLCBcIlNoZWlrbyBBTUxcIiBQcmVwIElcdTIwMTNJSUkvQ29tcCksIHJlYWQgY2VsbCBieVxuLy8gY2VsbCAyMDI2LTEwLTE4LiBFYWNoIGV4ZXJjaXNlIGFzIHRoZSBzaGVldCB3cml0ZXMgaXQ6IFwicmVwc0BwY3RbeFNldHNdXCIgZm9yICUgd29yaywgXCJTRVRTeFJFUFNcIlxuLy8gZm9yIGFjY2Vzc29yaWVzLlxuZGVzY3JpYmUoXCJzZXNzaW9ucyBtYXRjaCB0aGUgc291cmNlIHNoZWV0c1wiLCAoKSA9PiB7XG4gIGNvbnN0IHNwZWMgPSAoZGVmOiBQcm9ncmFtRGVmLCBkYXlJZDogc3RyaW5nKSA9PiB7XG4gICAgY29uc3QgZGF5ID0gZGVmLmRheXMuZmluZCgoZCkgPT4gZC5pZCA9PT0gZGF5SWQpITtcbiAgICBleHBlY3QoZGF5LCBkYXlJZCkudG9CZURlZmluZWQoKTtcbiAgICByZXR1cm4gZGF5LnNsb3RzLm1hcCgocykgPT4ge1xuICAgICAgY29uc3QgcCA9IHMucHJvZ3Jlc3Npb247XG4gICAgICBpZiAocC5raW5kID09PSBcImZpeGVkXCIpIHJldHVybiBgJHtzLmxpZnR9ICR7cC5zZXRzfXgke3AucmVwc31gO1xuICAgICAgaWYgKHAua2luZCAhPT0gXCJwZXJjZW50XCIpIHRocm93IG5ldyBFcnJvcihcInVuZXhwZWN0ZWRcIik7XG4gICAgICBjb25zdCB0b2tzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgbGV0IHByZXYgPSBcIlwiLCBuID0gMDtcbiAgICAgIGNvbnN0IGZsdXNoID0gKCkgPT4geyBpZiAocHJldikgdG9rcy5wdXNoKG4gPiAxID8gYCR7cHJldn14JHtufWAgOiBwcmV2KTsgfTtcbiAgICAgIGZvciAoY29uc3QgeCBvZiBwLndlZWtzWzBdKSB7XG4gICAgICAgIGNvbnN0IHQgPSBgJHt4LnJlcHN9QCR7TWF0aC5yb3VuZCh4LnBjdCEgKiAxMDAwKSAvIDEwfWA7XG4gICAgICAgIGlmICh0ID09PSBwcmV2KSBuKys7IGVsc2UgeyBmbHVzaCgpOyBwcmV2ID0gdDsgbiA9IDE7IH1cbiAgICAgIH1cbiAgICAgIGZsdXNoKCk7XG4gICAgICByZXR1cm4gYCR7cy5saWZ0fSAke3Rva3Muam9pbihcIiBcIil9YDtcbiAgICB9KTtcbiAgfTtcbiAgaXQoXCIjMjkgd2VlayAxIE1vbmRheVwiLCAoKSA9PiB7XG4gICAgZXhwZWN0KHNwZWMoc2hlaWtvMjkzMi5idWlsZCh7fSksIFwiUzI5VzFEMVwiKSkudG9FcXVhbChbXG4gICAgICBcImJlbmNoIDVANTAgNEA2MHgyIDNANzB4MiAzQDc1eDVcIiwgXCJzcXVhdCA1QDUwIDVANjB4MiA1QDcweDVcIiwgXCJiZW5jaCA1QDUwIDVANjAgNEA3MHg0XCIsIFwiY2hlc3RGbHkgNXgxMFwiLCBcImdvb2RNb3JuaW5nIDV4NVwiLFxuICAgIF0pO1xuICB9KTtcbiAgaXQoXCIjMzIgd2VlayA0IChsYXN0IHdlZWs6IE1vbmRheSwgV2VkbmVzZGF5LCB0aGVuIGNvbXBldGl0aW9uKVwiLCAoKSA9PiB7XG4gICAgY29uc3QgZGVmID0gc2hlaWtvMjkzMi5idWlsZCh7IHJ1bjogXCIzMlwiIH0pO1xuICAgIGV4cGVjdChzcGVjKGRlZiwgXCJTMzJXNEQxXCIpLnNsaWNlKDAsIDIpKS50b0VxdWFsKFtcImJlbmNoIDNANTAgM0A2MHgyIDJANzB4MiAxQDc1eDRcIiwgXCJkZWFkbGlmdCAzQDUwIDJANjB4MiAyQDcweDRcIl0pO1xuICAgIGV4cGVjdChzcGVjKGRlZiwgXCJTMzJXNEQyXCIpKS50b0VxdWFsKFtcInNxdWF0IDNANTAgM0A2MHgyIDJANzB4M1wiLCBcImJlbmNoIDNANTAgM0A2MHgyIDJANzB4M1wiXSk7XG4gICAgZXhwZWN0KGRlZi5kYXlzLmZpbHRlcigoZCkgPT4gZC53ZWVrcz8uWzBdID09PSAzKSkudG9IYXZlTGVuZ3RoKDIpO1xuICB9KTtcbiAgaXQoXCIjMzcgd2VlayAyIEZyaWRheVwiLCAoKSA9PiB7XG4gICAgZXhwZWN0KHNwZWMoc2hlaWtvMzcuYnVpbGQoe30pLCBcIlMzN1cyRDNcIikpLnRvRXF1YWwoW1xuICAgICAgXCJzcXVhdCA0QDUwIDRANjAgM0A3MHgyIDNANzV4NlwiLCBcImJlbmNoIDZANTAgNUA2MCA0QDcweDIgM0A3NXgyIDJAODB4MiA0QDc1IDVANzAgNkA2MCA3QDUwXCIsXG4gICAgICBcImNoZXN0Rmx5IDV4MTBcIiwgZXhwZWN0LnN0cmluZ01hdGNoaW5nKC8gNXgxMCQvKSwgXCJzcXVhdCAzQDU1IDNANjUgMkA3NXg0XCIsIFwiZ29vZE1vcm5pbmcgNXg2XCIsXG4gICAgXSk7XG4gIH0pO1xuICBpdChcIkJlZ2lubmVyIHByZXAgd2VlayAxIE1vbmRheSBhbmQgY29tcCB3ZWVrIDQgV2VkbmVzZGF5XCIsICgpID0+IHtcbiAgICBjb25zdCBkZWYgPSBzaGVpa29CZWdpbm5lci5idWlsZCh7fSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIkJQMVcxRDFcIikuc2xpY2UoMCwgMikpLnRvRXF1YWwoW1wic3F1YXQgNUA1MCA1QDYwIDRANzB4NFwiLCBcImJlbmNoIDVANTAgNEA2MCAzQDcwIDNANzV4NFwiXSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIkJDVzREMlwiKSkudG9FcXVhbChbXCJzcXVhdCAzQDUwIDNANjAgMkA2NXgzXCIsIFwiYmVuY2ggM0A1MCAzQDYwIDJANzB4M1wiXSk7XG4gIH0pO1xuICBpdChcIkFNTCBjb21wIHdlZWsgMiBXZWRuZXNkYXkgbWF4IHNpbmdsZXMgYW5kIHRoZSBmaW5hbCB3ZWVrXCIsICgpID0+IHtcbiAgICBjb25zdCBkZWYgPSBzaGVpa29BbWwuYnVpbGQoe30pO1xuICAgIGV4cGVjdChzcGVjKGRlZiwgXCJBNFcyRDJcIikuc2xpY2UoMCwgMikpLnRvRXF1YWwoW1wiYmVuY2ggM0A1MCAzQDYwIDNANzAgMkA4MCAxQDkwIDFAOTUgMUAxMDBcIiwgXCJkZWFkbGlmdCAzQDUwIDNANjAgMkA3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMFwiXSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIkE0VzVEMVwiKS5zbGljZSgwLCAyKSkudG9FcXVhbChbXCJiZW5jaCAzQDUwIDNANjAgMkA3MHgyIDFANzV4M1wiLCBcImRlYWRsaWZ0IDNANTAgM0A2MCAyQDcweDNcIl0pO1xuICAgIGV4cGVjdChzcGVjKGRlZiwgXCJBNFc1RDJcIikpLnRvRXF1YWwoW1wic3F1YXQgM0A1MCAyQDYwIDFANzB4M1wiLCBcImJlbmNoIDNANTAgM0A2MCAyQDcweDNcIl0pO1xuICB9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBR0EsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLFdBQVcsY0FBYyxxQkFBcUI7QUFDbkUsU0FBUyxTQUFTLE1BQU0sZ0JBQWdCO0FBQ3hDLFlBQVksY0FBYztBQUMxQixTQUFTLFNBQVMseUJBQXlCO0FBTTNDLElBQU0sUUFBa0IsQ0FBQztBQUVsQixTQUFTQSxVQUFTLE1BQWMsSUFBZ0I7QUFDckQsUUFBTSxPQUFPLENBQUMsR0FBRyxPQUFPLElBQUk7QUFDNUIsU0FBZ0Isa0JBQVMsTUFBTSxNQUFNO0FBQUUsVUFBTSxRQUFRLE1BQU0sT0FBTyxDQUFDO0FBQUcsVUFBTSxLQUFLLEdBQUcsSUFBSTtBQUFHLFFBQUk7QUFBRSxTQUFHO0FBQUEsSUFBRyxVQUFFO0FBQVUsWUFBTSxPQUFPLENBQUM7QUFBRyxZQUFNLEtBQUssR0FBRyxLQUFLO0FBQUEsSUFBRztBQUFBLEVBQUUsQ0FBQztBQUMvSjtBQVFPLElBQU0sa0JB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LGVBQWUsUUFBUTtBQUFBLE1BQUc7QUFBQSxNQUEwQjtBQUFBLElBQzlFLENBQUM7QUFBQSxFQUNILENBQUM7QUFDRCxFQUFBQSxJQUFHLHlEQUF5RCxNQUFNO0FBQ2hFLFVBQU0sTUFBTSxlQUFlLE1BQU0sQ0FBQyxDQUFDO0FBQ25DLFdBQU8sS0FBSyxLQUFLLFNBQVMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLDBCQUEwQiw2QkFBNkIsQ0FBQztBQUMxRyxXQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsMEJBQTBCLHdCQUF3QixDQUFDO0FBQUEsRUFDMUYsQ0FBQztBQUNELEVBQUFBLElBQUcsNERBQTRELE1BQU07QUFDbkUsVUFBTSxNQUFNLFVBQVUsTUFBTSxDQUFDLENBQUM7QUFDOUIsV0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsNkNBQTZDLDhDQUE4QyxDQUFDO0FBQzdJLFdBQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLGlDQUFpQywyQkFBMkIsQ0FBQztBQUM5RyxXQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsRUFBRSxRQUFRLENBQUMsMEJBQTBCLHdCQUF3QixDQUFDO0FBQUEsRUFDMUYsQ0FBQztBQUNILENBQUM7IiwKICAibmFtZXMiOiBbImRlc2NyaWJlIiwgIml0IiwgInN0ZXAiLCAiY2ZnIiwgInNsb3QiLCAic2V0cyIsICJpZlN1Y2Nlc3MiLCAiY3VycmVudCIsICJ3IiwgInZvbCIsICJuZWVkIiwgImEiLCAiZCIsICJjZmciLCAiYmVmb3JlIiwgImFmdGVyIiwgInNldHMiLCAiZGVzY3JpYmUiLCAiaXQiXQp9Cg==
