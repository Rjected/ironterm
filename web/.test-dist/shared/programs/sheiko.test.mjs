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
var roundTo = (w, step2) => Math.round(w / step2 + 1e-9) * step2;
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
var ceilTo = (w, s) => Math.ceil(w / s - 1e-9) * s;
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
        ifSuccess2 = `${st.sets > 1 ? `${Array(st.sets - 1).fill(st.reps).join("/")}/` : ""}${p.advance.reps}+ \u2192 ${fmt(s.weight + i)}`;
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
      weight: ps.pct != null && !ps.ofTop ? (def.roundUp ? ceilTo : roundTo)(tm * ps.pct + (ps.add ? inc(ps.add, cfg2.unit) : 0), step(def, cfg2, slot2.lift)) : 0,
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
  const cur = { ...s, weight: w, stage: k, stage0Weight: k === 0 ? w : s.stage0Weight, fails: w !== s.weight || k !== s.stage ? 0 : s.fails ?? 0 };
  const amrapReps = work.length ? work[Math.min(work.length, st.sets) - 1].reps : void 0;
  const base = { slotId: slot2.id, lift: slot2.lift, tier: slot2.tier, scheme: schemeLabel(st), weight: w, reps: work.map((x) => x.reps) };
  const off = w !== s.weight ? ` (planned ${fmt(s.weight)})` : "";
  if (p.advance.type === "amrapAtLeast") {
    const body = work.slice(0, Math.min(work.length, st.sets) - 1);
    const ok = (amrapReps ?? 0) >= p.advance.reps && work.length >= st.sets && body.every((x) => x.reps >= st.reps);
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
    const used = /* @__PURE__ */ new Set();
    const short = check.filter((ps) => {
      const tol = Math.max(1, ps.weight * 0.03);
      const k = sets2.findIndex((x, j) => !used.has(j) && x.weight >= ps.weight - tol && x.reps >= ps.reps);
      if (k < 0) return true;
      used.add(k);
      return false;
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
    if (def.roundUp && row?.increments != null) d = ceilTo(tm + d, step(def, cfg2, p.tmLift)) - tm;
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
  let pendingNext = { ...state.pendingTmNext };
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
      const at = p.tmRule && "applyAt" in p.tmRule ? p.tmRule.applyAt : void 0;
      const deltas = { ...also };
      if (tmDelta) deltas[p.tmLift] = (deltas[p.tmLift] ?? 0) + tmDelta;
      if (tmSet != null) tms[p.tmLift] = tmSet;
      for (const [lift, d] of Object.entries(deltas)) {
        if (at === "weekEnd") pending[lift] = (pending[lift] ?? 0) + d;
        else if (at === "afterNextWeek") pendingNext[lift] = (pendingNext[lift] ?? 0) + d;
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
    Object.assign(pending, pendingNext);
    pendingNext = {};
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
  return { dayIndex: next.dayIndex, rotations: next.rotations, slots, tms, log: [...state.log, entry], complete, pendingTm: pending, ...Object.keys(pendingNext).length ? { pendingTmNext: pendingNext } : {} };
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vcGFja2FnZXMvdGVzdC9pbmRleC50cyIsICIuLi8uLi8uLi9zaGFyZWQvbGlmdHMudHMiLCAiLi4vLi4vLi4vc2hhcmVkL3VuaXRzLnRzIiwgIi4uLy4uLy4uL3NoYXJlZC9wcm9ncmFtLnRzIiwgIi4uLy4uLy4uL3NoYXJlZC9wcm9ncmFtcy9zaGVpa28udHMiLCAiLi4vLi4vLi4vc2hhcmVkL3Byb2dyYW1zL3NoZWlrby50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBBIHNtYWxsIHZpdGVzdC1jb21wYXRpYmxlIHRlc3QgQVBJIG9uIHRvcCBvZiBub2RlOnRlc3QgYW5kIG5vZGU6YXNzZXJ0LCBzbyB0aGUgdGVzdHMga2VlcFxuLy8gYGltcG9ydCB7IGRlc2NyaWJlLCBleHBlY3QsIGl0IH0gZnJvbSBcInZpdGVzdFwiYCAoc2NyaXB0cy90ZXN0Lm1qcyBhbGlhc2VzIFwidml0ZXN0XCIgdG8gdGhpcyBmaWxlKVxuLy8gd2l0aG91dCB2aXRlc3QncyA4OCBwYWNrYWdlcy4gT25seSB3aGF0IHRoZSB0ZXN0cyB1c2UgaXMgaGVyZTsgYWRkIG1hdGNoZXJzIGFzIG5lZWRlZC5cbmltcG9ydCB7IEFzc2VydGlvbkVycm9yIH0gZnJvbSBcIm5vZGU6YXNzZXJ0XCI7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIHJlYWRGaWxlU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gXCJub2RlOmZzXCI7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luLCByZWxhdGl2ZSB9IGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCAqIGFzIG5vZGVUZXN0IGZyb20gXCJub2RlOnRlc3RcIjtcbmltcG9ydCB7IGluc3BlY3QsIGlzRGVlcFN0cmljdEVxdWFsIH0gZnJvbSBcIm5vZGU6dXRpbFwiO1xuXG50eXBlIEZuID0gKCkgPT4gdW5rbm93biB8IFByb21pc2U8dW5rbm93bj47XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBzdWl0ZXMgYW5kIGhvb2tzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5jb25zdCBzdGFjazogc3RyaW5nW10gPSBbXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGRlc2NyaWJlKG5hbWU6IHN0cmluZywgZm46ICgpID0+IHZvaWQpIHtcbiAgY29uc3QgcGF0aCA9IFsuLi5zdGFjaywgbmFtZV07XG4gIHJldHVybiBub2RlVGVzdC5kZXNjcmliZShuYW1lLCAoKSA9PiB7IGNvbnN0IHNhdmVkID0gc3RhY2suc3BsaWNlKDApOyBzdGFjay5wdXNoKC4uLnBhdGgpOyB0cnkgeyBmbigpOyB9IGZpbmFsbHkgeyBzdGFjay5zcGxpY2UoMCk7IHN0YWNrLnB1c2goLi4uc2F2ZWQpOyB9IH0pO1xufVxuXG50eXBlIFJ1bm5lciA9IChuYW1lOiBzdHJpbmcsIG9wdGlvbnM6IHsgdGltZW91dD86IG51bWJlciB9LCBmbj86ICgpID0+IFByb21pc2U8dm9pZD4pID0+IHVua25vd247XG5cbi8qKlxuICogQSB0ZXN0IG9yIGhvb2sgdGhhdCBydW5zIGxvbmdlciBmYWlscyAoXCJodW5nXCIsIG5vdCBcInNsb3dcIik6IGdlbmVyb3VzLCBiZWNhdXNlIHRoZSBlbmQtdG8tZW5kXG4gKiB0ZXN0cyBydW4gc2V2ZXJhbCBpbi1wcm9jZXNzIHNlcnZlcnMuIEEgdGVzdCBjYW4gcGFzcyBpdHMgb3duIGFzIHRoZSB0aGlyZCBhcmd1bWVudC5cbiAqL1xuZXhwb3J0IGNvbnN0IFRFU1RfVElNRU9VVF9NUyA9IDYwXzAwMDtcbmV4cG9ydCBjb25zdCBIT09LX1RJTUVPVVRfTVMgPSAxMjBfMDAwO1xuXG5mdW5jdGlvbiB0ZXN0V2l0aChydW5uZXI6IFJ1bm5lcikge1xuICByZXR1cm4gKG5hbWU6IHN0cmluZywgZm4/OiBGbiwgdGltZW91dDogbnVtYmVyIHwgeyB0aW1lb3V0PzogbnVtYmVyIH0gPSBURVNUX1RJTUVPVVRfTVMpOiB2b2lkID0+IHtcbiAgICBjb25zdCBwYXRoID0gWy4uLnN0YWNrLCBuYW1lXTtcbiAgICBydW5uZXIobmFtZSwgeyB0aW1lb3V0OiB0eXBlb2YgdGltZW91dCA9PT0gXCJudW1iZXJcIiA/IHRpbWVvdXQgOiB0aW1lb3V0LnRpbWVvdXQgPz8gVEVTVF9USU1FT1VUX01TIH0sIGZuID8gYXN5bmMgKCkgPT4ge1xuICAgICAgY3VycmVudCA9IHsgbmFtZTogcGF0aC5qb2luKFwiID4gXCIpLCBjb3VudHM6IG5ldyBNYXAoKSB9O1xuICAgICAgYXdhaXQgZm4oKTtcbiAgICB9IDogdW5kZWZpbmVkKTtcbiAgfTtcbn1cblxudHlwZSBJdCA9IFJldHVyblR5cGU8dHlwZW9mIHRlc3RXaXRoPiAmIHtcbiAgc2tpcDogUmV0dXJuVHlwZTx0eXBlb2YgdGVzdFdpdGg+O1xuICBvbmx5OiBSZXR1cm5UeXBlPHR5cGVvZiB0ZXN0V2l0aD47XG4gIHRvZG86IChuYW1lOiBzdHJpbmcpID0+IHZvaWQ7XG4gIGVhY2g6IDxUPihjYXNlczogcmVhZG9ubHkgVFtdKSA9PiAobmFtZTogc3RyaW5nLCBmbjogKC4uLmFyZ3M6IFQgZXh0ZW5kcyByZWFkb25seSB1bmtub3duW10gPyBUIDogW1RdKSA9PiB1bmtub3duKSA9PiB2b2lkO1xufTtcblxuZnVuY3Rpb24gbWFrZUl0KCk6IEl0IHtcbiAgY29uc3QgaXQgPSB0ZXN0V2l0aChub2RlVGVzdC5pdCkgYXMgSXQ7XG4gIGl0LnNraXAgPSB0ZXN0V2l0aChub2RlVGVzdC5pdC5za2lwKTtcbiAgaXQub25seSA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0Lm9ubHkpO1xuICBpdC50b2RvID0gKG5hbWU6IHN0cmluZykgPT4geyBub2RlVGVzdC5pdC50b2RvKG5hbWUpOyB9O1xuICBpdC5lYWNoID0gPFQ+KGNhc2VzOiByZWFkb25seSBUW10pID0+IChuYW1lOiBzdHJpbmcsIGZuOiAoLi4uYXJnczogVCBleHRlbmRzIHJlYWRvbmx5IHVua25vd25bXSA/IFQgOiBbVF0pID0+IHVua25vd24pID0+IHtcbiAgICBjYXNlcy5mb3JFYWNoKChjLCBpKSA9PiB7XG4gICAgICBjb25zdCBhcmdzID0gKEFycmF5LmlzQXJyYXkoYykgPyBjIDogW2NdKSBhcyBUIGV4dGVuZHMgcmVhZG9ubHkgdW5rbm93bltdID8gVCA6IFtUXTtcbiAgICAgIGl0KGZvcm1hdEVhY2hOYW1lKG5hbWUsIGFyZ3MsIGkpLCAoKSA9PiBmbiguLi5hcmdzKSk7XG4gICAgfSk7XG4gIH07XG4gIHJldHVybiBpdDtcbn1cblxuLyoqIGAlcyAlZCAlaSAlZiAlaiAlbyAlI2AgYW5kIGAkZmllbGRgIHBsYWNlaG9sZGVycywgYXMgaW4gdml0ZXN0J3MgaXQuZWFjaC4gKi9cbmZ1bmN0aW9uIGZvcm1hdEVhY2hOYW1lKG5hbWU6IHN0cmluZywgYXJnczogcmVhZG9ubHkgdW5rbm93bltdLCBpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcbiAgbGV0IGkgPSAwO1xuICBsZXQgb3V0ID0gbmFtZS5yZXBsYWNlKC8lW3NkaWZqbyMlXS9nLCAobSkgPT4ge1xuICAgIGlmIChtID09PSBcIiUlXCIpIHJldHVybiBcIiVcIjtcbiAgICBpZiAobSA9PT0gXCIlI1wiKSByZXR1cm4gU3RyaW5nKGluZGV4KTtcbiAgICBjb25zdCB2ID0gYXJnc1tpKytdO1xuICAgIHJldHVybiBtID09PSBcIiVqXCIgfHwgbSA9PT0gXCIlb1wiID8gSlNPTi5zdHJpbmdpZnkodikgOiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA/IHYgOiBpbnNwZWN0KHYpO1xuICB9KTtcbiAgY29uc3QgZmlyc3QgPSBhcmdzWzBdO1xuICBpZiAoZmlyc3QgJiYgdHlwZW9mIGZpcnN0ID09PSBcIm9iamVjdFwiKSB7XG4gICAgb3V0ID0gb3V0LnJlcGxhY2UoL1xcJChbXFx3Ll0rKS9nLCAobSwga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgIGNvbnN0IHYgPSBrZXkuc3BsaXQoXCIuXCIpLnJlZHVjZTxhbnk+KChvLCBrKSA9PiAobyA9PSBudWxsID8gbyA6IG9ba10pLCBmaXJzdCk7XG4gICAgICByZXR1cm4gdiA9PT0gdW5kZWZpbmVkID8gbSA6IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gdiA6IGluc3BlY3Qodik7XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGNvbnN0IGl0ID0gbWFrZUl0KCk7XG5leHBvcnQgY29uc3QgdGVzdCA9IGl0O1xuZXhwb3J0IGNvbnN0IGJlZm9yZUFsbCA9IChmbjogRm4sIHRpbWVvdXQgPSBIT09LX1RJTUVPVVRfTVMpID0+IG5vZGVUZXN0LmJlZm9yZShmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGFmdGVyQWxsID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYWZ0ZXIoZm4sIHsgdGltZW91dCB9KTtcbmV4cG9ydCBjb25zdCBiZWZvcmVFYWNoID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYmVmb3JlRWFjaChmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGFmdGVyRWFjaCA9IChmbjogRm4sIHRpbWVvdXQgPSBIT09LX1RJTUVPVVRfTVMpID0+IG5vZGVUZXN0LmFmdGVyRWFjaChmbiwgeyB0aW1lb3V0IH0pO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgbW9jayBmdW5jdGlvbnMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9jazxBIGV4dGVuZHMgdW5rbm93bltdID0gYW55W10sIFIgPSBhbnk+IHtcbiAgKC4uLmFyZ3M6IEEpOiBSO1xuICBtb2NrOiB7IGNhbGxzOiBBW107IHJlc3VsdHM6IHsgdHlwZTogXCJyZXR1cm5cIiB8IFwidGhyb3dcIjsgdmFsdWU6IHVua25vd24gfVtdIH07XG4gIG1vY2tJbXBsZW1lbnRhdGlvbihmbjogKC4uLmFyZ3M6IEEpID0+IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrSW1wbGVtZW50YXRpb25PbmNlKGZuOiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj47XG4gIG1vY2tSZXR1cm5WYWx1ZSh2OiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1JldHVyblZhbHVlT25jZSh2OiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1Jlc29sdmVkVmFsdWUodjogQXdhaXRlZDxSPik6IE1vY2s8QSwgUj47XG4gIG1vY2tSZWplY3RlZFZhbHVlKGU6IHVua25vd24pOiBNb2NrPEEsIFI+O1xuICBtb2NrQ2xlYXIoKTogTW9jazxBLCBSPjtcbiAgbW9ja1Jlc2V0KCk6IE1vY2s8QSwgUj47XG59XG5jb25zdCBNT0NLID0gU3ltYm9sKFwibW9ja1wiKTtcblxuZnVuY3Rpb24gZm48QSBleHRlbmRzIHVua25vd25bXSA9IGFueVtdLCBSID0gYW55PihpbXBsPzogKC4uLmFyZ3M6IEEpID0+IFIpOiBNb2NrPEEsIFI+IHtcbiAgbGV0IGJhc2UgPSBpbXBsO1xuICBjb25zdCBvbmNlOiAoKC4uLmFyZ3M6IEEpID0+IFIpW10gPSBbXTtcbiAgY29uc3QgbSA9ICgoLi4uYXJnczogQSk6IFIgPT4ge1xuICAgIG0ubW9jay5jYWxscy5wdXNoKGFyZ3MpO1xuICAgIGNvbnN0IGYgPSBvbmNlLnNoaWZ0KCkgPz8gYmFzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdmFsdWUgPSBmID8gZiguLi5hcmdzKSA6ICh1bmRlZmluZWQgYXMgUik7XG4gICAgICBtLm1vY2sucmVzdWx0cy5wdXNoKHsgdHlwZTogXCJyZXR1cm5cIiwgdmFsdWUgfSk7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgbS5tb2NrLnJlc3VsdHMucHVzaCh7IHR5cGU6IFwidGhyb3dcIiwgdmFsdWU6IGUgfSk7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfSkgYXMgTW9jazxBLCBSPjtcbiAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG0sIE1PQ0ssIHsgdmFsdWU6IHRydWUgfSk7XG4gIG0ubW9jayA9IHsgY2FsbHM6IFtdLCByZXN1bHRzOiBbXSB9O1xuICBtLm1vY2tJbXBsZW1lbnRhdGlvbiA9IChmKSA9PiB7IGJhc2UgPSBmOyByZXR1cm4gbTsgfTtcbiAgbS5tb2NrSW1wbGVtZW50YXRpb25PbmNlID0gKGYpID0+IHsgb25jZS5wdXNoKGYpOyByZXR1cm4gbTsgfTtcbiAgbS5tb2NrUmV0dXJuVmFsdWUgPSAodikgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCkgPT4gdik7XG4gIG0ubW9ja1JldHVyblZhbHVlT25jZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbk9uY2UoKCkgPT4gdik7XG4gIG0ubW9ja1Jlc29sdmVkVmFsdWUgPSAodikgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCgpID0+IFByb21pc2UucmVzb2x2ZSh2KSkgYXMgKC4uLmFyZ3M6IEEpID0+IFIpO1xuICBtLm1vY2tSZWplY3RlZFZhbHVlID0gKGUpID0+IG0ubW9ja0ltcGxlbWVudGF0aW9uKCgoKSA9PiBQcm9taXNlLnJlamVjdChlKSkgYXMgKC4uLmFyZ3M6IEEpID0+IFIpO1xuICBtLm1vY2tDbGVhciA9ICgpID0+IHsgbS5tb2NrLmNhbGxzID0gW107IG0ubW9jay5yZXN1bHRzID0gW107IHJldHVybiBtOyB9O1xuICBtLm1vY2tSZXNldCA9ICgpID0+IHsgbS5tb2NrQ2xlYXIoKTsgYmFzZSA9IHVuZGVmaW5lZDsgb25jZS5sZW5ndGggPSAwOyByZXR1cm4gbTsgfTtcbiAgcmV0dXJuIG07XG59XG5jb25zdCBpc01vY2sgPSAodjogdW5rbm93bik6IHYgaXMgTW9jayA9PiB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiICYmICh2IGFzIHVua25vd24gYXMgUmVjb3JkPHN5bWJvbCwgdW5rbm93bj4pW01PQ0tdID09PSB0cnVlO1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgdmkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHN0dWJiZWQgPSBuZXcgTWFwPHN0cmluZywgUHJvcGVydHlEZXNjcmlwdG9yIHwgdW5kZWZpbmVkPigpO1xuXG5leHBvcnQgY29uc3QgdmkgPSB7XG4gIGZuLFxuICBpc01vY2tGdW5jdGlvbjogaXNNb2NrLFxuICBzdHViR2xvYmFsKG5hbWU6IHN0cmluZywgdmFsdWU6IHVua25vd24pIHtcbiAgICBpZiAoIXN0dWJiZWQuaGFzKG5hbWUpKSBzdHViYmVkLnNldChuYW1lLCBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKGdsb2JhbFRoaXMsIG5hbWUpKTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoZ2xvYmFsVGhpcywgbmFtZSwgeyB2YWx1ZSwgd3JpdGFibGU6IHRydWUsIGNvbmZpZ3VyYWJsZTogdHJ1ZSwgZW51bWVyYWJsZTogdHJ1ZSB9KTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHVuc3R1YkFsbEdsb2JhbHMoKSB7XG4gICAgZm9yIChjb25zdCBbbmFtZSwgZGVzY10gb2Ygc3R1YmJlZCkge1xuICAgICAgaWYgKGRlc2MpIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShnbG9iYWxUaGlzLCBuYW1lLCBkZXNjKTtcbiAgICAgIGVsc2UgZGVsZXRlIChnbG9iYWxUaGlzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtuYW1lXTtcbiAgICB9XG4gICAgc3R1YmJlZC5jbGVhcigpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgLyoqIE9ubHkgRGF0ZSBpcyBzdXBwb3J0ZWQgKG5vZGU6dGVzdCdzIG1vY2sgdGltZXJzKS4gKi9cbiAgdXNlRmFrZVRpbWVycyhvcHRzPzogeyB0b0Zha2U/OiBzdHJpbmdbXTsgbm93PzogbnVtYmVyIHwgRGF0ZSB9KSB7XG4gICAgY29uc3QgYXBpcyA9IChvcHRzPy50b0Zha2UgPz8gW1wiRGF0ZVwiXSkuZmlsdGVyKChhKSA9PiBhID09PSBcIkRhdGVcIiB8fCBhID09PSBcInNldFRpbWVvdXRcIiB8fCBhID09PSBcInNldEludGVydmFsXCIpIGFzIChcIkRhdGVcIiB8IFwic2V0VGltZW91dFwiIHwgXCJzZXRJbnRlcnZhbFwiKVtdO1xuICAgIG5vZGVUZXN0Lm1vY2sudGltZXJzLmVuYWJsZSh7IGFwaXMsIG5vdzogb3B0cz8ubm93ID8/IERhdGUubm93KCkgfSk7XG4gICAgcmV0dXJuIHZpO1xuICB9LFxuICBzZXRTeXN0ZW1UaW1lKHQ6IG51bWJlciB8IERhdGUpIHtcbiAgICBub2RlVGVzdC5tb2NrLnRpbWVycy5zZXRUaW1lKHR5cGVvZiB0ID09PSBcIm51bWJlclwiID8gdCA6IHQuZ2V0VGltZSgpKTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHVzZVJlYWxUaW1lcnMoKSB7XG4gICAgbm9kZVRlc3QubW9jay50aW1lcnMucmVzZXQoKTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG59O1xuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgZXF1YWxpdHkgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmludGVyZmFjZSBBc3ltbWV0cmljIHsgYXN5bW1ldHJpY01hdGNoKGFjdHVhbDogdW5rbm93bik6IGJvb2xlYW47IHRvU3RyaW5nKCk6IHN0cmluZyB9XG5jb25zdCBpc0FzeW1tZXRyaWMgPSAodjogdW5rbm93bik6IHYgaXMgQXN5bW1ldHJpYyA9PiAhIXYgJiYgdHlwZW9mICh2IGFzIEFzeW1tZXRyaWMpLmFzeW1tZXRyaWNNYXRjaCA9PT0gXCJmdW5jdGlvblwiO1xuXG4vKiogdml0ZXN0J3MgdG9FcXVhbDogcmVjdXJzaXZlLCBpZ25vcmVzIHVuZGVmaW5lZCBwcm9wZXJ0aWVzIGFuZCBvYmplY3QgdHlwZXM7IFtwYXJ0aWFsXSA9IHRvTWF0Y2hPYmplY3QuICovXG5mdW5jdGlvbiBlcXVhbHMoYTogdW5rbm93biwgYjogdW5rbm93biwgcGFydGlhbCA9IGZhbHNlLCBzZWVuID0gbmV3IE1hcDxvYmplY3QsIG9iamVjdD4oKSk6IGJvb2xlYW4ge1xuICBpZiAoaXNBc3ltbWV0cmljKGIpKSByZXR1cm4gYi5hc3ltbWV0cmljTWF0Y2goYSk7XG4gIGlmIChpc0FzeW1tZXRyaWMoYSkpIHJldHVybiBhLmFzeW1tZXRyaWNNYXRjaChiKTtcbiAgaWYgKE9iamVjdC5pcyhhLCBiKSkgcmV0dXJuIHRydWU7XG4gIGlmICh0eXBlb2YgYSAhPT0gXCJvYmplY3RcIiB8fCB0eXBlb2YgYiAhPT0gXCJvYmplY3RcIiB8fCBhID09PSBudWxsIHx8IGIgPT09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgaWYgKHNlZW4uZ2V0KGEpID09PSBiKSByZXR1cm4gdHJ1ZTtcbiAgc2Vlbi5zZXQoYSwgYik7XG4gIGlmIChhIGluc3RhbmNlb2YgRGF0ZSB8fCBiIGluc3RhbmNlb2YgRGF0ZSkgcmV0dXJuIGEgaW5zdGFuY2VvZiBEYXRlICYmIGIgaW5zdGFuY2VvZiBEYXRlICYmIGEuZ2V0VGltZSgpID09PSBiLmdldFRpbWUoKTtcbiAgaWYgKGEgaW5zdGFuY2VvZiBSZWdFeHAgfHwgYiBpbnN0YW5jZW9mIFJlZ0V4cCkgcmV0dXJuIFN0cmluZyhhKSA9PT0gU3RyaW5nKGIpO1xuICBpZiAoYSBpbnN0YW5jZW9mIE1hcCB8fCBiIGluc3RhbmNlb2YgTWFwKSB7XG4gICAgaWYgKCEoYSBpbnN0YW5jZW9mIE1hcCAmJiBiIGluc3RhbmNlb2YgTWFwKSB8fCBhLnNpemUgIT09IGIuc2l6ZSkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2ssIHZdIG9mIGIpIGlmICghYS5oYXMoaykgfHwgIWVxdWFscyhhLmdldChrKSwgdiwgcGFydGlhbCwgc2VlbikpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICBpZiAoYSBpbnN0YW5jZW9mIFNldCB8fCBiIGluc3RhbmNlb2YgU2V0KSB7XG4gICAgaWYgKCEoYSBpbnN0YW5jZW9mIFNldCAmJiBiIGluc3RhbmNlb2YgU2V0KSB8fCBhLnNpemUgIT09IGIuc2l6ZSkgcmV0dXJuIGZhbHNlO1xuICAgIGZvciAoY29uc3QgdiBvZiBiKSBpZiAoIWEuaGFzKHYpICYmICFbLi4uYV0uc29tZSgoeCkgPT4gZXF1YWxzKHgsIHYsIHBhcnRpYWwsIHNlZW4pKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChBcnJheUJ1ZmZlci5pc1ZpZXcoYSkgfHwgQXJyYXlCdWZmZXIuaXNWaWV3KGIpKSByZXR1cm4gaXNEZWVwU3RyaWN0RXF1YWwoYSwgYik7XG4gIGlmIChBcnJheS5pc0FycmF5KGEpICE9PSBBcnJheS5pc0FycmF5KGIpKSByZXR1cm4gZmFsc2U7XG4gIGlmIChBcnJheS5pc0FycmF5KGEpICYmIEFycmF5LmlzQXJyYXkoYikpIHtcbiAgICBpZiAoYS5sZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIGIuZXZlcnkoKHYsIGkpID0+IGVxdWFscyhhW2ldLCB2LCBwYXJ0aWFsLCBzZWVuKSk7XG4gIH1cbiAgY29uc3QgYW8gPSBhIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBibyA9IGIgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG4gIGNvbnN0IGtleXMgPSAobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IE9iamVjdC5rZXlzKG8pLmZpbHRlcigoaykgPT4gb1trXSAhPT0gdW5kZWZpbmVkKTtcbiAgaWYgKHBhcnRpYWwpIHJldHVybiBPYmplY3Qua2V5cyhibykuZXZlcnkoKGspID0+IChib1trXSA9PT0gdW5kZWZpbmVkID8gYW9ba10gPT09IHVuZGVmaW5lZCA6IGsgaW4gYW8gJiYgZXF1YWxzKGFvW2tdLCBib1trXSwgdHJ1ZSwgc2VlbikpKTtcbiAgY29uc3Qga2EgPSBrZXlzKGFvKSwga2IgPSBrZXlzKGJvKTtcbiAgaWYgKGthLmxlbmd0aCAhPT0ga2IubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gIHJldHVybiBrYi5ldmVyeSgoaykgPT4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGFvLCBrKSAmJiBlcXVhbHMoYW9ba10sIGJvW2tdLCBmYWxzZSwgc2VlbikpO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgc25hcHNob3RzIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5sZXQgY3VycmVudDogeyBuYW1lOiBzdHJpbmc7IGNvdW50czogTWFwPHN0cmluZywgbnVtYmVyPiB9ID0geyBuYW1lOiBcIlwiLCBjb3VudHM6IG5ldyBNYXAoKSB9O1xuY29uc3Qgc25hcENhY2hlID0gbmV3IE1hcDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIHN0cmluZz4+KCk7XG5jb25zdCBkaXJ0eVNuYXBzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbi8qKlxuICogc2NyaXB0cy90ZXN0Lm1qcyBidW5kbGVzIHdlYi88ZGlyPi94LnRlc3QudHMgdG8gd2ViLy50ZXN0LWRpc3QvPGRpcj4veC50ZXN0Lm1qcyBhbmQgbm9kZSAtLXRlc3RcbiAqIHJ1bnMgZWFjaCBidW5kbGUgYXMgaXRzIG93biBwcm9jZXNzLCBzbyB0aGUgc291cmNlIHBhdGggZm9sbG93cyBmcm9tIHRoZSBzY3JpcHQgcGF0aC5cbiAqL1xuZnVuY3Rpb24gc25hcEZpbGUoKTogc3RyaW5nIHtcbiAgY29uc3Qgcm9vdCA9IHByb2Nlc3MuZW52LklST05URVJNX1RFU1RfUk9PVDtcbiAgY29uc3Qgc2NyaXB0ID0gcHJvY2Vzcy5hcmd2WzFdID8/IFwiXCI7XG4gIGNvbnN0IGRpc3QgPSByb290ID8gam9pbihyb290LCBcIi50ZXN0LWRpc3RcIikgOiBcIlwiO1xuICBpZiAoIXJvb3QgfHwgIXNjcmlwdC5zdGFydHNXaXRoKGRpc3QpKSB0aHJvdyBuZXcgRXJyb3IoXCJ0b01hdGNoU25hcHNob3Q6IHJ1biB0ZXN0cyB0aHJvdWdoIHNjcmlwdHMvdGVzdC5tanNcIik7XG4gIGNvbnN0IHNyYyA9IGpvaW4ocm9vdCwgcmVsYXRpdmUoZGlzdCwgc2NyaXB0KSkucmVwbGFjZSgvXFwubWpzJC8sIFwiLnRzXCIpO1xuICByZXR1cm4gam9pbihkaXJuYW1lKHNyYyksIFwiX19zbmFwc2hvdHNfX1wiLCBzcmMuc3BsaXQoXCIvXCIpLnBvcCgpICsgXCIuc25hcFwiKTtcbn1cblxuZnVuY3Rpb24gbG9hZFNuYXBzKGZpbGU6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuICBsZXQgc25hcHMgPSBzbmFwQ2FjaGUuZ2V0KGZpbGUpO1xuICBpZiAoIXNuYXBzKSB7XG4gICAgc25hcHMgPSB7fTtcbiAgICBpZiAoZXhpc3RzU3luYyhmaWxlKSkgbmV3IEZ1bmN0aW9uKFwiZXhwb3J0c1wiLCByZWFkRmlsZVN5bmMoZmlsZSwgXCJ1dGY4XCIpKShzbmFwcyk7XG4gICAgc25hcENhY2hlLnNldChmaWxlLCBzbmFwcyk7XG4gIH1cbiAgcmV0dXJuIHNuYXBzO1xufVxuXG4vKiogVGhlIHZpdGVzdCBzbmFwc2hvdCBmb3JtYXQgZm9yIHRoZSB2YWx1ZXMgdGhlIHRlc3RzIHNuYXBzaG90IChzdHJpbmdzOyBKU09OIG90aGVyd2lzZSkuICovXG5jb25zdCBzZXJpYWxpemUgPSAodjogdW5rbm93bikgPT4gKHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gYFwiJHt2fVwiYCA6IEpTT04uc3RyaW5naWZ5KHYsIG51bGwsIDIpKTtcbmNvbnN0IGVzY2FwZVRlbXBsYXRlID0gKHM6IHN0cmluZykgPT4gcy5yZXBsYWNlKC9cXFxcL2csIFwiXFxcXFxcXFxcIikucmVwbGFjZSgvYC9nLCBcIlxcXFxgXCIpLnJlcGxhY2UoL1xcJFxcey9nLCBcIlxcXFwke1wiKTtcblxucHJvY2Vzcy5vbihcImV4aXRcIiwgKCkgPT4ge1xuICBmb3IgKGNvbnN0IGZpbGUgb2YgZGlydHlTbmFwcykge1xuICAgIGNvbnN0IHNuYXBzID0gc25hcENhY2hlLmdldChmaWxlKSE7XG4gICAgY29uc3QgYm9keSA9IE9iamVjdC5rZXlzKHNuYXBzKS5zb3J0KCkubWFwKChrKSA9PiBgZXhwb3J0c1tcXGAke2VzY2FwZVRlbXBsYXRlKGspfVxcYF0gPSBcXGAke2VzY2FwZVRlbXBsYXRlKHNuYXBzW2tdKX1cXGA7XFxuYCkuam9pbihcIlxcblwiKTtcbiAgICBta2RpclN5bmMoZGlybmFtZShmaWxlKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgd3JpdGVGaWxlU3luYyhmaWxlLCBgLy8gVml0ZXN0IFNuYXBzaG90IHYxLCBodHRwczovL3ZpdGVzdC5kZXYvZ3VpZGUvc25hcHNob3QuaHRtbFxcblxcbiR7Ym9keX1gKTtcbiAgICBjb25zb2xlLmxvZyhgdXBkYXRlZCAke3JlbGF0aXZlKHByb2Nlc3MuY3dkKCksIGZpbGUpfWApO1xuICB9XG59KTtcblxuZnVuY3Rpb24gbWF0Y2hTbmFwc2hvdChhY3R1YWw6IHVua25vd24sIGhpbnQ/OiBzdHJpbmcpIHtcbiAgY29uc3QgYmFzZSA9IGhpbnQgPyBgJHtjdXJyZW50Lm5hbWV9ID4gJHtoaW50fWAgOiBjdXJyZW50Lm5hbWU7XG4gIGNvbnN0IG4gPSAoY3VycmVudC5jb3VudHMuZ2V0KGJhc2UpID8/IDApICsgMTtcbiAgY3VycmVudC5jb3VudHMuc2V0KGJhc2UsIG4pO1xuICBjb25zdCBrZXkgPSBgJHtiYXNlfSAke259YDtcbiAgY29uc3QgZmlsZSA9IHNuYXBGaWxlKCk7XG4gIGNvbnN0IHNuYXBzID0gbG9hZFNuYXBzKGZpbGUpO1xuICBjb25zdCBnb3QgPSBgXFxuJHtzZXJpYWxpemUoYWN0dWFsKX1cXG5gO1xuICAvLyBsaWtlIHZpdGVzdCwgQ0kgbmV2ZXIgd3JpdGVzIGEgbWlzc2luZyBzbmFwc2hvdDogaXQgZmFpbHNcbiAgaWYgKCEoa2V5IGluIHNuYXBzKSAmJiBwcm9jZXNzLmVudi5DSSAmJiAhcHJvY2Vzcy5lbnYuVVBEQVRFX1NOQVBTSE9UUykgcmV0dXJuIHsgcGFzczogZmFsc2UsIG1lc3NhZ2U6IGBtaXNzaW5nIHNuYXBzaG90IFwiJHtrZXl9XCIgKHJ1biB0aGUgdGVzdHMgbG9jYWxseSBhbmQgY29tbWl0IHRoZSAuc25hcCBmaWxlKWAgfTtcbiAgaWYgKHByb2Nlc3MuZW52LlVQREFURV9TTkFQU0hPVFMgfHwgIShrZXkgaW4gc25hcHMpKSB7XG4gICAgaWYgKHNuYXBzW2tleV0gIT09IGdvdCkgeyBzbmFwc1trZXldID0gZ290OyBkaXJ0eVNuYXBzLmFkZChmaWxlKTsgfVxuICAgIHJldHVybiB7IHBhc3M6IHRydWUsIG1lc3NhZ2U6IFwiXCIgfTtcbiAgfVxuICByZXR1cm4geyBwYXNzOiBzbmFwc1trZXldID09PSBnb3QsIG1lc3NhZ2U6IGBzbmFwc2hvdCBcIiR7a2V5fVwiIGRpZmZlcnM6XFxuZXhwZWN0ZWQ6JHtzbmFwc1trZXldfVxcbnJlY2VpdmVkOiR7Z290fShVUERBVEVfU05BUFNIT1RTPTEgcG5wbSB0ZXN0IHRvIGFjY2VwdClgIH07XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBleHBlY3QgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHNob3cgPSAodjogdW5rbm93bikgPT4gKGlzQXN5bW1ldHJpYyh2KSA/IHYudG9TdHJpbmcoKSA6IGluc3BlY3QodiwgeyBkZXB0aDogNiwgYnJlYWtMZW5ndGg6IDEyMCB9KSk7XG5cbnR5cGUgUmVzdWx0ID0geyBwYXNzOiBib29sZWFuOyBtZXNzYWdlOiBzdHJpbmcgfTtcbnR5cGUgTWF0Y2hlcnMgPSBSZWNvcmQ8c3RyaW5nLCAoYWN0dWFsOiB1bmtub3duLCAuLi5hcmdzOiBhbnlbXSkgPT4gUmVzdWx0PjtcblxuY29uc3QgbWF0Y2hlcnM6IE1hdGNoZXJzID0ge1xuICB0b0JlOiAoYSwgYikgPT4gKHsgcGFzczogT2JqZWN0LmlzKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSAke3Nob3coYil9YCB9KSxcbiAgdG9FcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IGVxdWFscyhhLCBiKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gZXF1YWwgJHtzaG93KGIpfWAgfSksXG4gIHRvU3RyaWN0RXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiBpc0RlZXBTdHJpY3RFcXVhbChhLCBiKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gc3RyaWN0bHkgZXF1YWwgJHtzaG93KGIpfWAgfSksXG4gIHRvTWF0Y2hPYmplY3Q6IChhLCBiKSA9PiAoeyBwYXNzOiBlcXVhbHMoYSwgYiwgdHJ1ZSksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIG1hdGNoIG9iamVjdCAke3Nob3coYil9YCB9KSxcbiAgdG9CZUNsb3NlVG86IChhLCBiOiBudW1iZXIsIGRpZ2l0cyA9IDIpID0+ICh7XG4gICAgcGFzczogdHlwZW9mIGEgPT09IFwibnVtYmVyXCIgJiYgKGEgPT09IGIgfHwgTWF0aC5hYnMoYSAtIGIpIDwgMTAgKiogLWRpZ2l0cyAvIDIpLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIGNsb3NlIHRvICR7Yn0gKCR7ZGlnaXRzfSBkaWdpdHMpYCxcbiAgfSksXG4gIHRvQmVHcmVhdGVyVGhhbjogKGEsIGIpID0+ICh7IHBhc3M6IChhIGFzIG51bWJlcikgPiBiLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSA+ICR7Yn1gIH0pLFxuICB0b0JlR3JlYXRlclRoYW5PckVxdWFsOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA+PSBiLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSA+PSAke2J9YCB9KSxcbiAgdG9CZUxlc3NUaGFuOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA8IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IDwgJHtifWAgfSksXG4gIHRvQmVMZXNzVGhhbk9yRXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpIDw9IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IDw9ICR7Yn1gIH0pLFxuICB0b0hhdmVMZW5ndGg6IChhLCBuKSA9PiAoeyBwYXNzOiAoYSBhcyB7IGxlbmd0aD86IG51bWJlciB9KT8ubGVuZ3RoID09PSBuLCBtZXNzYWdlOiBgZXhwZWN0ZWQgbGVuZ3RoICR7bn0sIGdvdCAkeyhhIGFzIHsgbGVuZ3RoPzogbnVtYmVyIH0pPy5sZW5ndGh9ICgke3Nob3coYSl9KWAgfSksXG4gIHRvSGF2ZVByb3BlcnR5OiAoYSwga2V5OiBzdHJpbmcsIC4uLnY6IHVua25vd25bXSkgPT4ge1xuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoXCIuXCIpO1xuICAgIGxldCBvOiBhbnkgPSBhO1xuICAgIGZvciAoY29uc3QgayBvZiBwYXRoKSB7IGlmIChvID09IG51bGwgfHwgIShrIGluIE9iamVjdChvKSkpIHJldHVybiB7IHBhc3M6IGZhbHNlLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBoYXZlIHByb3BlcnR5ICR7a2V5fWAgfTsgbyA9IG9ba107IH1cbiAgICByZXR1cm4geyBwYXNzOiB2Lmxlbmd0aCA9PT0gMCB8fCBlcXVhbHMobywgdlswXSksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGhhdmUgJHtrZXl9ID0gJHtzaG93KHZbMF0pfSwgZ290ICR7c2hvdyhvKX1gIH07XG4gIH0sXG4gIHRvQmVOdWxsOiAoYSkgPT4gKHsgcGFzczogYSA9PT0gbnVsbCwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgbnVsbGAgfSksXG4gIHRvQmVVbmRlZmluZWQ6IChhKSA9PiAoeyBwYXNzOiBhID09PSB1bmRlZmluZWQsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIHVuZGVmaW5lZGAgfSksXG4gIHRvQmVEZWZpbmVkOiAoYSkgPT4gKHsgcGFzczogYSAhPT0gdW5kZWZpbmVkLCBtZXNzYWdlOiBgZXhwZWN0ZWQgYSBkZWZpbmVkIHZhbHVlYCB9KSxcbiAgdG9CZVRydXRoeTogKGEpID0+ICh7IHBhc3M6ICEhYSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgdHJ1dGh5YCB9KSxcbiAgdG9CZUZhbHN5OiAoYSkgPT4gKHsgcGFzczogIWEsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIGZhbHN5YCB9KSxcbiAgdG9CZU5hTjogKGEpID0+ICh7IHBhc3M6IE51bWJlci5pc05hTihhKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgTmFOYCB9KSxcbiAgdG9CZUluc3RhbmNlT2Y6IChhLCBjbHMpID0+ICh7IHBhc3M6IGEgaW5zdGFuY2VvZiBjbHMsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlIGFuIGluc3RhbmNlIG9mICR7Y2xzPy5uYW1lfWAgfSksXG4gIHRvQmVUeXBlT2Y6IChhLCB0OiBzdHJpbmcpID0+ICh7IHBhc3M6IHR5cGVvZiBhID09PSB0LCBtZXNzYWdlOiBgZXhwZWN0ZWQgdHlwZW9mICR7c2hvdyhhKX0gdG8gYmUgJHt0fWAgfSksXG4gIHRvTWF0Y2g6IChhLCByZTogUmVnRXhwIHwgc3RyaW5nKSA9PiAoe1xuICAgIHBhc3M6IHR5cGVvZiBhID09PSBcInN0cmluZ1wiICYmICh0eXBlb2YgcmUgPT09IFwic3RyaW5nXCIgPyBhLmluY2x1ZGVzKHJlKSA6IHJlLnRlc3QoYSkpLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIG1hdGNoICR7U3RyaW5nKHJlKX1gLFxuICB9KSxcbiAgdG9Db250YWluOiAoYSwgaXRlbSkgPT4gKHtcbiAgICBwYXNzOiB0eXBlb2YgYSA9PT0gXCJzdHJpbmdcIiA/IGEuaW5jbHVkZXMoaXRlbSBhcyBzdHJpbmcpIDogQXJyYXkuaXNBcnJheShhKSB8fCBhIGluc3RhbmNlb2YgU2V0ID8gWy4uLihhIGFzIEl0ZXJhYmxlPHVua25vd24+KV0uaW5jbHVkZXMoaXRlbSkgOiBmYWxzZSxcbiAgICBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBjb250YWluICR7c2hvdyhpdGVtKX1gLFxuICB9KSxcbiAgdG9Db250YWluRXF1YWw6IChhLCBpdGVtKSA9PiAoeyBwYXNzOiBBcnJheS5pc0FycmF5KGEpICYmIGEuc29tZSgoeCkgPT4gZXF1YWxzKHgsIGl0ZW0pKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gY29udGFpbiBhbiBpdGVtIGVxdWFsIHRvICR7c2hvdyhpdGVtKX1gIH0pLFxuICB0b1Rocm93OiAoZm5PckVycm9yLCBleHBlY3RlZD86IHVua25vd24pID0+IHtcbiAgICBsZXQgZXJyOiB1bmtub3duLCB0aHJldyA9IGZhbHNlO1xuICAgIGlmICh0eXBlb2YgZm5PckVycm9yID09PSBcImZ1bmN0aW9uXCIpIHsgdHJ5IHsgKGZuT3JFcnJvciBhcyAoKSA9PiB1bmtub3duKSgpOyB9IGNhdGNoIChlKSB7IHRocmV3ID0gdHJ1ZTsgZXJyID0gZTsgfSB9XG4gICAgZWxzZSB7IHRocmV3ID0gdHJ1ZTsgZXJyID0gZm5PckVycm9yOyB9IC8vIGZyb20gLnJlamVjdHNcbiAgICBjb25zdCBtc2cgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG4gICAgbGV0IHBhc3MgPSB0aHJldztcbiAgICBpZiAodGhyZXcgJiYgZXhwZWN0ZWQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgaWYgKHR5cGVvZiBleHBlY3RlZCA9PT0gXCJzdHJpbmdcIikgcGFzcyA9IG1zZy5pbmNsdWRlcyhleHBlY3RlZCk7XG4gICAgICBlbHNlIGlmIChleHBlY3RlZCBpbnN0YW5jZW9mIFJlZ0V4cCkgcGFzcyA9IGV4cGVjdGVkLnRlc3QobXNnKTtcbiAgICAgIGVsc2UgaWYgKHR5cGVvZiBleHBlY3RlZCA9PT0gXCJmdW5jdGlvblwiKSBwYXNzID0gZXJyIGluc3RhbmNlb2YgKGV4cGVjdGVkIGFzIG5ldyAoKSA9PiB1bmtub3duKTtcbiAgICAgIGVsc2UgaWYgKGV4cGVjdGVkIGluc3RhbmNlb2YgRXJyb3IpIHBhc3MgPSBtc2cgPT09IGV4cGVjdGVkLm1lc3NhZ2U7XG4gICAgfVxuICAgIHJldHVybiB7IHBhc3MsIG1lc3NhZ2U6IHRocmV3ID8gYGV4cGVjdGVkIHRoZSBlcnJvciAoJHttc2d9KSB0byBtYXRjaCAke3Nob3coZXhwZWN0ZWQpfWAgOiBgZXhwZWN0ZWQgYSB0aHJvdyR7ZXhwZWN0ZWQgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBgIG1hdGNoaW5nICR7c2hvdyhleHBlY3RlZCl9YH1gIH07XG4gIH0sXG4gIHRvTWF0Y2hTbmFwc2hvdDogKGEsIGhpbnQ/OiBzdHJpbmcpID0+IG1hdGNoU25hcHNob3QoYSwgaGludCksXG59O1xubWF0Y2hlcnMudG9UaHJvd0Vycm9yID0gbWF0Y2hlcnMudG9UaHJvdztcbmNvbnN0IGNhbGxzID0gKGE6IHVua25vd24pID0+IHsgaWYgKCFpc01vY2soYSkpIHRocm93IG5ldyBUeXBlRXJyb3IoYCR7c2hvdyhhKX0gaXMgbm90IGEgdmkuZm4oKWApOyByZXR1cm4gYS5tb2NrLmNhbGxzOyB9O1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZCA9IChhKSA9PiAoeyBwYXNzOiBjYWxscyhhKS5sZW5ndGggPiAwLCBtZXNzYWdlOiBcImV4cGVjdGVkIHRoZSBtb2NrIHRvIGhhdmUgYmVlbiBjYWxsZWRcIiB9KTtcbm1hdGNoZXJzLnRvSGF2ZUJlZW5DYWxsZWRUaW1lcyA9IChhLCBuOiBudW1iZXIpID0+ICh7IHBhc3M6IGNhbGxzKGEpLmxlbmd0aCA9PT0gbiwgbWVzc2FnZTogYGV4cGVjdGVkICR7bn0gY2FsbHMsIGdvdCAke2NhbGxzKGEpLmxlbmd0aH1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZFdpdGggPSAoYSwgLi4uYXJnczogdW5rbm93bltdKSA9PiAoeyBwYXNzOiBjYWxscyhhKS5zb21lKChjKSA9PiBlcXVhbHMoYywgYXJncykpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgYSBjYWxsIHdpdGggJHtzaG93KGFyZ3MpfTsgY2FsbHM6ICR7c2hvdyhjYWxscyhhKSl9YCB9KTtcbm1hdGNoZXJzLnRvSGF2ZUJlZW5MYXN0Q2FsbGVkV2l0aCA9IChhLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGVxdWFscyhjYWxscyhhKS5hdCgtMSksIGFyZ3MpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgdGhlIGxhc3QgY2FsbCB0byBiZSAke3Nob3coYXJncyl9OyBjYWxsczogJHtzaG93KGNhbGxzKGEpKX1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbk50aENhbGxlZFdpdGggPSAoYSwgbjogbnVtYmVyLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGVxdWFscyhjYWxscyhhKVtuIC0gMV0sIGFyZ3MpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgY2FsbCAke259IHRvIGJlICR7c2hvdyhhcmdzKX07IGNhbGxzOiAke3Nob3coY2FsbHMoYSkpfWAgfSk7XG5cbi8qKiBUaGUgbWF0Y2hlcnMsIHR5cGVkIChSID0gdm9pZCwgb3IgUHJvbWlzZTx2b2lkPiBhZnRlciAucmVzb2x2ZXMgLyAucmVqZWN0cykuICovXG5leHBvcnQgaW50ZXJmYWNlIEFzc2VydGlvbjxSID0gdm9pZD4ge1xuICB0b0JlKGV4cGVjdGVkOiB1bmtub3duKTogUjtcbiAgdG9FcXVhbChleHBlY3RlZDogdW5rbm93bik6IFI7XG4gIHRvU3RyaWN0RXF1YWwoZXhwZWN0ZWQ6IHVua25vd24pOiBSO1xuICB0b01hdGNoT2JqZWN0KGV4cGVjdGVkOiBvYmplY3QpOiBSO1xuICB0b0JlQ2xvc2VUbyhleHBlY3RlZDogbnVtYmVyLCBkaWdpdHM/OiBudW1iZXIpOiBSO1xuICB0b0JlR3JlYXRlclRoYW4objogbnVtYmVyIHwgYmlnaW50KTogUjtcbiAgdG9CZUdyZWF0ZXJUaGFuT3JFcXVhbChuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlTGVzc1RoYW4objogbnVtYmVyIHwgYmlnaW50KTogUjtcbiAgdG9CZUxlc3NUaGFuT3JFcXVhbChuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0hhdmVMZW5ndGgobjogbnVtYmVyKTogUjtcbiAgdG9IYXZlUHJvcGVydHkocGF0aDogc3RyaW5nLCB2YWx1ZT86IHVua25vd24pOiBSO1xuICB0b0JlTnVsbCgpOiBSO1xuICB0b0JlVW5kZWZpbmVkKCk6IFI7XG4gIHRvQmVEZWZpbmVkKCk6IFI7XG4gIHRvQmVUcnV0aHkoKTogUjtcbiAgdG9CZUZhbHN5KCk6IFI7XG4gIHRvQmVOYU4oKTogUjtcbiAgdG9CZUluc3RhbmNlT2YoY2xzOiBhYnN0cmFjdCBuZXcgKC4uLmFyZ3M6IG5ldmVyW10pID0+IHVua25vd24pOiBSO1xuICB0b0JlVHlwZU9mKHR5cGU6IFwic3RyaW5nXCIgfCBcIm51bWJlclwiIHwgXCJiaWdpbnRcIiB8IFwiYm9vbGVhblwiIHwgXCJzeW1ib2xcIiB8IFwidW5kZWZpbmVkXCIgfCBcIm9iamVjdFwiIHwgXCJmdW5jdGlvblwiKTogUjtcbiAgdG9NYXRjaChleHBlY3RlZDogUmVnRXhwIHwgc3RyaW5nKTogUjtcbiAgdG9Db250YWluKGl0ZW06IHVua25vd24pOiBSO1xuICB0b0NvbnRhaW5FcXVhbChpdGVtOiB1bmtub3duKTogUjtcbiAgdG9UaHJvdyhleHBlY3RlZD86IHN0cmluZyB8IFJlZ0V4cCB8IEVycm9yIHwgKGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bikpOiBSO1xuICB0b1Rocm93RXJyb3IoZXhwZWN0ZWQ/OiBzdHJpbmcgfCBSZWdFeHAgfCBFcnJvciB8IChhYnN0cmFjdCBuZXcgKC4uLmFyZ3M6IG5ldmVyW10pID0+IHVua25vd24pKTogUjtcbiAgdG9NYXRjaFNuYXBzaG90KGhpbnQ/OiBzdHJpbmcpOiBSO1xuICB0b0hhdmVCZWVuQ2FsbGVkKCk6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWRUaW1lcyhuOiBudW1iZXIpOiBSO1xuICB0b0hhdmVCZWVuQ2FsbGVkV2l0aCguLi5hcmdzOiB1bmtub3duW10pOiBSO1xuICB0b0hhdmVCZWVuTGFzdENhbGxlZFdpdGgoLi4uYXJnczogdW5rbm93bltdKTogUjtcbiAgdG9IYXZlQmVlbk50aENhbGxlZFdpdGgobjogbnVtYmVyLCAuLi5hcmdzOiB1bmtub3duW10pOiBSO1xufVxuXG50eXBlIEV4cGVjdGF0aW9uID0gQXNzZXJ0aW9uICYge1xuICBub3Q6IEFzc2VydGlvbjtcbiAgcmVzb2x2ZXM6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiAmIHsgbm90OiBBc3NlcnRpb248UHJvbWlzZTx2b2lkPj4gfTtcbiAgcmVqZWN0czogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+ICYgeyBub3Q6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiB9O1xufTtcblxuZnVuY3Rpb24gZmFpbChyOiBSZXN1bHQsIG5lZ2F0ZTogYm9vbGVhbiwgbGFiZWw/OiBzdHJpbmcpIHtcbiAgaWYgKHIucGFzcyA9PT0gbmVnYXRlKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IChsYWJlbCA/IGAke2xhYmVsfTogYCA6IFwiXCIpICsgKG5lZ2F0ZSA/IGBub3Q6ICR7ci5tZXNzYWdlfWAgOiByLm1lc3NhZ2UpO1xuICAgIHRocm93IG5ldyBBc3NlcnRpb25FcnJvcih7IG1lc3NhZ2UgfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiB1bmtub3duLCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiBmYWxzZSk6IEFzc2VydGlvbjtcbmZ1bmN0aW9uIGJ1aWxkKGFjdHVhbDogKCkgPT4gUHJvbWlzZTx1bmtub3duPiwgbmVnYXRlOiBib29sZWFuLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBhc3luYzogdHJ1ZSk6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PjtcbmZ1bmN0aW9uIGJ1aWxkKGFjdHVhbDogKCkgPT4gdW5rbm93biwgbmVnYXRlOiBib29sZWFuLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBhc3luYzogYm9vbGVhbik6IHVua25vd24ge1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG4gIGZvciAoY29uc3QgW25hbWUsIG1dIG9mIE9iamVjdC5lbnRyaWVzKG1hdGNoZXJzKSkge1xuICAgIG91dFtuYW1lXSA9IGFzeW5jXG4gICAgICA/IGFzeW5jICguLi5hcmdzOiB1bmtub3duW10pID0+IGZhaWwobShhd2FpdCBhY3R1YWwoKSwgLi4uYXJncyksIG5lZ2F0ZSwgbGFiZWwpXG4gICAgICA6ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZhaWwobShhY3R1YWwoKSwgLi4uYXJncyksIG5lZ2F0ZSwgbGFiZWwpO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHBlY3Q8VD4oYWN0dWFsOiBULCBsYWJlbD86IHN0cmluZyk6IEV4cGVjdGF0aW9uIHtcbiAgY29uc3QgZSA9IGJ1aWxkKCgpID0+IGFjdHVhbCwgZmFsc2UsIGxhYmVsLCBmYWxzZSkgYXMgRXhwZWN0YXRpb247XG4gIGUubm90ID0gYnVpbGQoKCkgPT4gYWN0dWFsLCB0cnVlLCBsYWJlbCwgZmFsc2UpO1xuICBjb25zdCBzZXR0bGUgPSAod2FudDogXCJyZXNvbHZlXCIgfCBcInJlamVjdFwiKSA9PiBhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHYgPSBhd2FpdCAoYWN0dWFsIGFzIHVua25vd24gYXMgUHJvbWlzZTx1bmtub3duPik7XG4gICAgICBpZiAod2FudCA9PT0gXCJyZWplY3RcIikgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKHsgbWVzc2FnZTogYCR7bGFiZWwgPyBsYWJlbCArIFwiOiBcIiA6IFwiXCJ9ZXhwZWN0ZWQgYSByZWplY3Rpb24sIGdvdCAke3Nob3codil9YCB9KTtcbiAgICAgIHJldHVybiB2O1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyciBpbnN0YW5jZW9mIEFzc2VydGlvbkVycm9yICYmIHdhbnQgPT09IFwicmVqZWN0XCIpIHRocm93IGVycjtcbiAgICAgIGlmICh3YW50ID09PSBcInJlc29sdmVcIikgdGhyb3cgZXJyO1xuICAgICAgcmV0dXJuIGVycjtcbiAgICB9XG4gIH07XG4gIGUucmVzb2x2ZXMgPSBPYmplY3QuYXNzaWduKGJ1aWxkKHNldHRsZShcInJlc29sdmVcIiksIGZhbHNlLCBsYWJlbCwgdHJ1ZSksIHsgbm90OiBidWlsZChzZXR0bGUoXCJyZXNvbHZlXCIpLCB0cnVlLCBsYWJlbCwgdHJ1ZSkgfSk7XG4gIGUucmVqZWN0cyA9IE9iamVjdC5hc3NpZ24oYnVpbGQoc2V0dGxlKFwicmVqZWN0XCIpLCBmYWxzZSwgbGFiZWwsIHRydWUpLCB7IG5vdDogYnVpbGQoc2V0dGxlKFwicmVqZWN0XCIpLCB0cnVlLCBsYWJlbCwgdHJ1ZSkgfSk7XG4gIHJldHVybiBlO1xufVxuXG5jb25zdCBhc3ltbWV0cmljID0gKG5hbWU6IHN0cmluZywgdGVzdDogKHY6IHVua25vd24pID0+IGJvb2xlYW4pOiBBc3ltbWV0cmljID0+ICh7IGFzeW1tZXRyaWNNYXRjaDogdGVzdCwgdG9TdHJpbmc6ICgpID0+IG5hbWUgfSk7XG5cbmV4cGVjdC5jbG9zZVRvID0gKG46IG51bWJlciwgZGlnaXRzID0gMikgPT4gYXN5bW1ldHJpYyhgY2xvc2VUbygke259LCAke2RpZ2l0c30pYCwgKHYpID0+IHR5cGVvZiB2ID09PSBcIm51bWJlclwiICYmIE1hdGguYWJzKHYgLSBuKSA8IDEwICoqIC1kaWdpdHMgLyAyKTtcbmV4cGVjdC5vYmplY3RDb250YWluaW5nID0gKG86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KSA9PiBhc3ltbWV0cmljKGBvYmplY3RDb250YWluaW5nKCR7c2hvdyhvKX0pYCwgKHYpID0+IGVxdWFscyh2LCBvLCB0cnVlKSk7XG5leHBlY3QuYXJyYXlDb250YWluaW5nID0gKHhzOiB1bmtub3duW10pID0+IGFzeW1tZXRyaWMoYGFycmF5Q29udGFpbmluZygke3Nob3coeHMpfSlgLCAodikgPT4gQXJyYXkuaXNBcnJheSh2KSAmJiB4cy5ldmVyeSgoeCkgPT4gdi5zb21lKCh5KSA9PiBlcXVhbHMoeSwgeCkpKSk7XG5leHBlY3Quc3RyaW5nQ29udGFpbmluZyA9IChzOiBzdHJpbmcpID0+IGFzeW1tZXRyaWMoYHN0cmluZ0NvbnRhaW5pbmcoJHtzaG93KHMpfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgdi5pbmNsdWRlcyhzKSk7XG5leHBlY3Quc3RyaW5nTWF0Y2hpbmcgPSAocmU6IFJlZ0V4cCB8IHN0cmluZykgPT4gYXN5bW1ldHJpYyhgc3RyaW5nTWF0Y2hpbmcoJHtTdHJpbmcocmUpfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgJiYgKHR5cGVvZiByZSA9PT0gXCJzdHJpbmdcIiA/IHYuaW5jbHVkZXMocmUpIDogcmUudGVzdCh2KSkpO1xuZXhwZWN0LmFueSA9IChjbHM6IHVua25vd24pID0+IGFzeW1tZXRyaWMoYGFueSgkeyhjbHMgYXMgeyBuYW1lPzogc3RyaW5nIH0pPy5uYW1lfSlgLCAodikgPT5cbiAgY2xzID09PSBTdHJpbmcgPyB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiA6IGNscyA9PT0gTnVtYmVyID8gdHlwZW9mIHYgPT09IFwibnVtYmVyXCIgOiBjbHMgPT09IEJvb2xlYW4gPyB0eXBlb2YgdiA9PT0gXCJib29sZWFuXCIgOiBjbHMgPT09IEZ1bmN0aW9uID8gdHlwZW9mIHYgPT09IFwiZnVuY3Rpb25cIiA6IHYgaW5zdGFuY2VvZiAoY2xzIGFzIG5ldyAoKSA9PiB1bmtub3duKSk7XG5leHBlY3QuYW55dGhpbmcgPSAoKSA9PiBhc3ltbWV0cmljKFwiYW55dGhpbmcoKVwiLCAodikgPT4gdiAhPSBudWxsKTtcblxuIiwgImltcG9ydCB0eXBlIHsgTGlmdEtpbmQgfSBmcm9tIFwiLi91bml0c1wiO1xuXG5leHBvcnQgdHlwZSBNdXNjbGUgPVxuICB8IFwicXVhZHNcIiB8IFwiaGFtc3RyaW5nc1wiIHwgXCJnbHV0ZXNcIiB8IFwiY2hlc3RcIiB8IFwiYmFja1wiIHwgXCJsYXRzXCIgfCBcInNob3VsZGVyc1wiIHwgXCJ0cmljZXBzXCIgfCBcImJpY2Vwc1wiXG4gIHwgXCJjYWx2ZXNcIiB8IFwiYWJzXCIgfCBcInRyYXBzXCIgfCBcImZvcmVhcm1zXCIgfCBcImZ1bGxcIjtcblxuZXhwb3J0IGludGVyZmFjZSBMaWZ0RGVmIHtcbiAgbmFtZTogc3RyaW5nO1xuICBzaG9ydDogc3RyaW5nO1xuICBraW5kOiBMaWZ0S2luZDtcbiAgLyoqIEhldnkgZXhlcmNpc2UgdGl0bGVzIHRoYXQgY291bnQgYXMgdGhpcyBsaWZ0LCBmaXJzdCBtYXRjaCB3aW5zLiBPdmVycmlkYWJsZSBwZXIgdXNlci4gKi9cbiAgaGV2eTogc3RyaW5nW107XG4gIHVwcGVyOiBib29sZWFuO1xuICBtdXNjbGU6IE11c2NsZTtcbn1cblxuY29uc3QgTCA9IChuYW1lOiBzdHJpbmcsIHNob3J0OiBzdHJpbmcsIGtpbmQ6IExpZnRLaW5kLCBtdXNjbGU6IE11c2NsZSwgdXBwZXI6IGJvb2xlYW4sIC4uLmhldnk6IHN0cmluZ1tdKTogTGlmdERlZiA9PiAoeyBuYW1lLCBzaG9ydCwga2luZCwgbXVzY2xlLCB1cHBlciwgaGV2eSB9KTtcblxuLyoqXG4gKiBTaGFyZWQgbGlmdCBsaWJyYXJ5LiBQcm9ncmFtcyByZWZlcmVuY2UgbGlmdHMgYnkga2V5LiBUaXRsZXMgYXJlIGV4YWN0IEhldnkgZXhlcmNpc2UgbmFtZXNcbiAqIChmcm9tIEdFVCAvdjEvZXhlcmNpc2VfdGVtcGxhdGVzKS4gQWRkIG5ldyBvbmVzIGhlcmUuXG4gKi9cbmV4cG9ydCBjb25zdCBMSUZUUzogUmVjb3JkPHN0cmluZywgTGlmdERlZj4gPSB7XG4gIC8vIFx1MjUwMFx1MjUwMCBjb21wZXRpdGlvbiBsaWZ0cyBcdTI1MDBcdTI1MDBcbiAgc3F1YXQ6IEwoXCJCYWNrIFNxdWF0XCIsIFwiU1FVQVRcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiU3F1YXQgKEJhcmJlbGwpXCIsIFwiRnVsbCBTcXVhdFwiKSxcbiAgYmVuY2g6IEwoXCJCZW5jaCBQcmVzc1wiLCBcIkJFTkNIXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiQmVuY2ggUHJlc3MgKEJhcmJlbGwpXCIpLFxuICBkZWFkbGlmdDogTChcIkRlYWRsaWZ0XCIsIFwiREVBRExJRlRcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSwgXCJEZWFkbGlmdCAoQmFyYmVsbClcIiksXG4gIG9ocDogTChcIk92ZXJoZWFkIFByZXNzXCIsIFwiT0hQXCIsIFwiYmFyYmVsbFwiLCBcInNob3VsZGVyc1wiLCB0cnVlLCBcIk92ZXJoZWFkIFByZXNzIChCYXJiZWxsKVwiLCBcIlN0YW5kaW5nIE1pbGl0YXJ5IFByZXNzIChCYXJiZWxsKVwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgc3F1YXQgdmFyaWF0aW9ucyBcdTI1MDBcdTI1MDBcbiAgcGF1c2VTcXVhdDogTChcIlBhdXNlIFNxdWF0XCIsIFwiUEFVU0UgU1FcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiUGF1c2UgU3F1YXQgKEJhcmJlbGwpXCIsIFwiQmFyYmVsbCBTcXVhdCAoUGF1c2VkKVwiLCBcIkJhcmJlbGwgUGF1c2UgU3F1YXQgKHNsb3cgY29uY2VudHJpYyBhbmQgZWNjZW50cmljKVwiKSxcbiAgZnJvbnRTcXVhdDogTChcIkZyb250IFNxdWF0XCIsIFwiRlJPTlQgU1FcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiRnJvbnQgU3F1YXRcIiksXG4gIGJveFNxdWF0OiBMKFwiQm94IFNxdWF0XCIsIFwiQk9YIFNRXCIsIFwiYmFyYmVsbFwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkJveCBTcXVhdCAoQmFyYmVsbClcIiksXG4gIHBpblNxdWF0OiBMKFwiUGluIFNxdWF0XCIsIFwiUElOIFNRXCIsIFwiYmFyYmVsbFwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIlBpbiBTcXVhdFwiKSxcbiAgemVyY2hlclNxdWF0OiBMKFwiWmVyY2hlciBTcXVhdFwiLCBcIlpFUkNIRVJcIiwgXCJiYXJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiWmVyY2hlciBTcXVhdFwiKSxcbiAgLy8gTm8gU1NCIGV4ZXJjaXNlIGluIEhldnkncyBjYXRhbG9nOyBtYXAgYSBjdXN0b20gZXhlcmNpc2UgaW4gU2V0dXAuXG4gIHNhZmV0eUJhclNxdWF0OiBMKFwiU2FmZXR5IEJhciBTcXVhdFwiLCBcIlNTQiBTUVwiLCBcImJhcmJlbGxcIiwgXCJxdWFkc1wiLCBmYWxzZSksXG4gIGhhY2tTcXVhdDogTChcIkhhY2sgU3F1YXRcIiwgXCJIQUNLIFNRXCIsIFwibWFjaGluZVwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkhhY2sgU3F1YXQgKE1hY2hpbmUpXCIsIFwiSGFjayBTcXVhdFwiKSxcbiAgbGVnUHJlc3M6IEwoXCJMZWcgUHJlc3NcIiwgXCJMRUcgUFJFU1NcIiwgXCJtYWNoaW5lXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiTGVnIFByZXNzIChNYWNoaW5lKVwiLCBcIkxlZyBQcmVzcyBIb3Jpem9udGFsIChNYWNoaW5lKVwiKSxcbiAgZ29ibGV0U3F1YXQ6IEwoXCJHb2JsZXQgU3F1YXRcIiwgXCJHT0JMRVRcIiwgXCJkdW1iYmVsbFwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkdvYmxldCBTcXVhdFwiKSxcbiAgYnVsZ2FyaWFuU3BsaXRTcXVhdDogTChcIkJ1bGdhcmlhbiBTcGxpdCBTcXVhdFwiLCBcIkJTU1wiLCBcImR1bWJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiQnVsZ2FyaWFuIFNwbGl0IFNxdWF0IChEdW1iYmVsbClcIiwgXCJCdWxnYXJpYW4gU3BsaXQgU3F1YXQgKEJhcmJlbGwpXCIpLFxuICBzcGxpdFNxdWF0OiBMKFwiU3BsaXQgU3F1YXRcIiwgXCJTUExJVCBTUVwiLCBcImR1bWJiZWxsXCIsIFwicXVhZHNcIiwgZmFsc2UsIFwiU3BsaXQgU3F1YXQgKER1bWJiZWxsKVwiKSxcbiAgbHVuZ2U6IEwoXCJMdW5nZVwiLCBcIkxVTkdFXCIsIFwiZHVtYmJlbGxcIiwgXCJxdWFkc1wiLCBmYWxzZSwgXCJMdW5nZSAoRHVtYmJlbGwpXCIsIFwiV2Fsa2luZyBMdW5nZSAoRHVtYmJlbGwpXCIsIFwiTHVuZ2UgKEJhcmJlbGwpXCIsIFwiTHVuZ2VcIiksXG4gIGxlZ0V4dGVuc2lvbjogTChcIkxlZyBFeHRlbnNpb25cIiwgXCJMRUcgRVhUXCIsIFwibWFjaGluZVwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkxlZyBFeHRlbnNpb24gKE1hY2hpbmUpXCIpLFxuICBwZW5kdWx1bVNxdWF0OiBMKFwiUGVuZHVsdW0gU3F1YXRcIiwgXCJQRU5EVUxVTVwiLCBcIm1hY2hpbmVcIiwgXCJxdWFkc1wiLCBmYWxzZSwgXCJQZW5kdWx1bSBTcXVhdCAoTWFjaGluZSlcIiksXG4gIGJlbHRTcXVhdDogTChcIkJlbHQgU3F1YXRcIiwgXCJCRUxUIFNRXCIsIFwibWFjaGluZVwiLCBcInF1YWRzXCIsIGZhbHNlLCBcIkJlbHQgU3F1YXQgKE1hY2hpbmUpXCIsIFwiQmVsdCBTcXVhdFwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgaGluZ2UgdmFyaWF0aW9ucyBcdTI1MDBcdTI1MDBcbiAgc3Vtb0RlYWRsaWZ0OiBMKFwiU3VtbyBEZWFkbGlmdFwiLCBcIlNVTU8gRExcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSwgXCJTdW1vIERlYWRsaWZ0XCIpLFxuICBkZWZpY2l0RGVhZGxpZnQ6IEwoXCJEZWZpY2l0IERlYWRsaWZ0XCIsIFwiREVGSUNJVCBETFwiLCBcImJhcmJlbGxcIiwgXCJiYWNrXCIsIGZhbHNlLCBcIkRlZmljaXQgRGVhZGxpZnQgKEJhcmJlbGwpXCIpLFxuICAvLyBObyBIZXZ5IGNhdGFsb2cgZW50cnkgZm9yIHRoZXNlOiBjcmVhdGUgYSBjdXN0b20gZXhlcmNpc2UgYW5kIG1hcCBpdCBpbiBTZXR1cC5cbiAgcGF1c2VEZWFkbGlmdDogTChcIlBhdXNlIERlYWRsaWZ0XCIsIFwiUEFVU0UgRExcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSksXG4gIHNuYXRjaEdyaXBEZWFkbGlmdDogTChcIlNuYXRjaC1HcmlwIERlYWRsaWZ0XCIsIFwiU0cgRExcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCBmYWxzZSksXG4gIHJhY2tQdWxsOiBMKFwiUmFjayBQdWxsXCIsIFwiUkFDSyBQVUxMXCIsIFwiYmFyYmVsbFwiLCBcImJhY2tcIiwgZmFsc2UsIFwiUmFjayBQdWxsXCIpLFxuICByZGw6IEwoXCJSb21hbmlhbiBEZWFkbGlmdFwiLCBcIlJETFwiLCBcImJhcmJlbGxcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIlJvbWFuaWFuIERlYWRsaWZ0IChCYXJiZWxsKVwiKSxcbiAgZGJSZGw6IEwoXCJEdW1iYmVsbCBSRExcIiwgXCJEQiBSRExcIiwgXCJkdW1iYmVsbFwiLCBcImhhbXN0cmluZ3NcIiwgZmFsc2UsIFwiUm9tYW5pYW4gRGVhZGxpZnQgKER1bWJiZWxsKVwiKSxcbiAgc3RpZmZMZWdEZWFkbGlmdDogTChcIlN0aWZmLUxlZyBEZWFkbGlmdFwiLCBcIlNMRExcIiwgXCJiYXJiZWxsXCIsIFwiaGFtc3RyaW5nc1wiLCBmYWxzZSwgXCJTdHJhaWdodCBMZWcgRGVhZGxpZnRcIiksXG4gIHRyYXBCYXJEZWFkbGlmdDogTChcIlRyYXAgQmFyIERlYWRsaWZ0XCIsIFwiVFJBUCBETFwiLCBcImJhcmJlbGxcIiwgXCJiYWNrXCIsIGZhbHNlLCBcIkRlYWRsaWZ0IChUcmFwIGJhcilcIiksXG4gIGdvb2RNb3JuaW5nOiBMKFwiR29vZCBNb3JuaW5nXCIsIFwiR09PRCBBTVwiLCBcImJhcmJlbGxcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIkdvb2QgTW9ybmluZyAoQmFyYmVsbClcIiksXG4gIGhpcFRocnVzdDogTChcIkhpcCBUaHJ1c3RcIiwgXCJISVAgVEhSVVNUXCIsIFwiYmFyYmVsbFwiLCBcImdsdXRlc1wiLCBmYWxzZSwgXCJIaXAgVGhydXN0IChCYXJiZWxsKVwiLCBcIkhpcCBUaHJ1c3QgKE1hY2hpbmUpXCIpLFxuICBsZWdDdXJsOiBMKFwiTGVnIEN1cmxcIiwgXCJMRUcgQ1VSTFwiLCBcIm1hY2hpbmVcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIkx5aW5nIExlZyBDdXJsIChNYWNoaW5lKVwiLCBcIlNlYXRlZCBMZWcgQ3VybCAoTWFjaGluZSlcIiwgXCJTdGFuZGluZyBMZWcgQ3VybHNcIiksXG4gIC8vIE5vIEhldnkgY2F0YWxvZyBlbnRyeSB3ZSBjYW4gcmVseSBvbiAoSGV2eSdzIFwiTm9yZGljIEhhbXN0cmluZ3MgQ3VybHNcIiBhbHJlYWR5IGNvdW50cyBhcyBHSFIpOiBtYXAgaW4gU2V0dXAuXG4gIG5vcmRpY0N1cmw6IEwoXCJOb3JkaWMgQ3VybFwiLCBcIk5PUkRJQ1wiLCBcImJvZHl3ZWlnaHRcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlKSxcbiAgZ2x1dGVIYW1SYWlzZTogTChcIkdsdXRlIEhhbSBSYWlzZVwiLCBcIkdIUlwiLCBcImJvZHl3ZWlnaHRcIiwgXCJoYW1zdHJpbmdzXCIsIGZhbHNlLCBcIkdsdXRlIEhhbSBSYWlzZVwiLCBcIk5vcmRpYyBIYW1zdHJpbmdzIEN1cmxzXCIpLFxuICBiYWNrRXh0ZW5zaW9uOiBMKFwiQmFjayBFeHRlbnNpb25cIiwgXCJCQUNLIEVYVFwiLCBcImJvZHl3ZWlnaHRcIiwgXCJiYWNrXCIsIGZhbHNlLCBcIkJhY2sgRXh0ZW5zaW9uIChIeXBlcmV4dGVuc2lvbilcIiwgXCJCYWNrIEV4dGVuc2lvbiAoV2VpZ2h0ZWQgSHlwZXJleHRlbnNpb24pXCIsIFwiQmFjayBFeHRlbnNpb24gKE1hY2hpbmUpXCIpLFxuICByZXZlcnNlSHlwZXI6IEwoXCJSZXZlcnNlIEh5cGVyXCIsIFwiUkVWIEhZUEVSXCIsIFwibWFjaGluZVwiLCBcImdsdXRlc1wiLCBmYWxzZSwgXCJSZXZlcnNlIEh5cGVyZXh0ZW5zaW9uXCIpLFxuICBrYlN3aW5nOiBMKFwiS2V0dGxlYmVsbCBTd2luZ1wiLCBcIktCIFNXSU5HXCIsIFwiZHVtYmJlbGxcIiwgXCJnbHV0ZXNcIiwgZmFsc2UsIFwiS2V0dGxlYmVsbCBTd2luZ1wiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgcHJlc3NpbmcgXHUyNTAwXHUyNTAwXG4gIHBhdXNlQmVuY2g6IEwoXCJQYXVzZWQgQmVuY2hcIiwgXCJQQVVTRSBCUFwiLCBcImJhcmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIlBhdXNlZCBCZW5jaCAoMSBTZWNvbmQgUGF1c2UpXCIsIFwiQmFyYmVsbCBCZW5jaCBQcmVzcyAoTG9uZyBQYXVzZSAtIDMgc2Vjb25kcylcIiksXG4gIGNnQmVuY2g6IEwoXCJDbG9zZS1HcmlwIEJlbmNoXCIsIFwiQ0cgQkVOQ0hcIiwgXCJiYXJiZWxsXCIsIFwidHJpY2Vwc1wiLCB0cnVlLCBcIkJlbmNoIFByZXNzIC0gQ2xvc2UgR3JpcCAoQmFyYmVsbClcIiksXG4gIHdpZGVCZW5jaDogTChcIldpZGUtR3JpcCBCZW5jaFwiLCBcIldJREUgQlBcIiwgXCJiYXJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJCZW5jaCBQcmVzcyAtIFdpZGUgR3JpcCAoQmFyYmVsbClcIiksXG4gIGluY2xpbmVCZW5jaDogTChcIkluY2xpbmUgQmVuY2ggUHJlc3NcIiwgXCJJTkNMSU5FXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiSW5jbGluZSBCZW5jaCBQcmVzcyAoQmFyYmVsbClcIiksXG4gIGRlY2xpbmVCZW5jaDogTChcIkRlY2xpbmUgQmVuY2ggUHJlc3NcIiwgXCJERUNMSU5FXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiRGVjbGluZSBCZW5jaCBQcmVzcyAoQmFyYmVsbClcIiksXG4gIGZlZXRVcEJlbmNoOiBMKFwiRmVldC1VcCBCZW5jaFwiLCBcIkZFRVQgVVBcIiwgXCJiYXJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJGZWV0IFVwIEJlbmNoIFByZXNzIChCYXJiZWxsKVwiKSxcbiAgZmxvb3JQcmVzczogTChcIkZsb29yIFByZXNzXCIsIFwiRkxPT1IgUFJcIiwgXCJiYXJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJGbG9vciBQcmVzcyAoQmFyYmVsbClcIiksXG4gIHNwb3RvUHJlc3M6IEwoXCJTcG90byBQcmVzc1wiLCBcIlNQT1RPXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUpLFxuICBib2FyZFByZXNzOiBMKFwiQm9hcmQgUHJlc3NcIiwgXCJCT0FSRCBQUlwiLCBcImJhcmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlKSxcbiAgc2xpbmdzaG90QmVuY2g6IEwoXCJTbGluZ3Nob3QgQmVuY2hcIiwgXCJTTElOR1NIT1RcIiwgXCJiYXJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSksXG4gIGRiRGVjbGluZUJlbmNoOiBMKFwiRGVjbGluZSBEQiBQcmVzc1wiLCBcIkRFQyBEQlwiLCBcImR1bWJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJEZWNsaW5lIEJlbmNoIFByZXNzIChEdW1iYmVsbClcIiksXG4gIHBpblByZXNzOiBMKFwiUGluIFByZXNzXCIsIFwiUElOIFBSRVNTXCIsIFwiYmFyYmVsbFwiLCBcImNoZXN0XCIsIHRydWUsIFwiUGluIFByZXNzXCIpLFxuICBkYkJlbmNoOiBMKFwiRHVtYmJlbGwgQmVuY2ggUHJlc3NcIiwgXCJEQiBCRU5DSFwiLCBcImR1bWJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJCZW5jaCBQcmVzcyAoRHVtYmJlbGwpXCIpLFxuICBkYkluY2xpbmVCZW5jaDogTChcIkluY2xpbmUgREIgUHJlc3NcIiwgXCJEQiBJTkNMSU5FXCIsIFwiZHVtYmJlbGxcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIkluY2xpbmUgQmVuY2ggUHJlc3MgKER1bWJiZWxsKVwiKSxcbiAgbWFjaGluZUNoZXN0UHJlc3M6IEwoXCJDaGVzdCBQcmVzcyAoTWFjaGluZSlcIiwgXCJDSEVTVCBQUlwiLCBcIm1hY2hpbmVcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIkNoZXN0IFByZXNzIChNYWNoaW5lKVwiLCBcIklzby1MYXRlcmFsIENoZXN0IFByZXNzIChNYWNoaW5lKVwiLCBcIkluY2xpbmUgQ2hlc3QgUHJlc3MgKE1hY2hpbmUpXCIpLFxuICBzbWl0aEJlbmNoOiBMKFwiU21pdGggQmVuY2hcIiwgXCJTTUlUSCBCUFwiLCBcIm1hY2hpbmVcIiwgXCJjaGVzdFwiLCB0cnVlLCBcIkJlbmNoIFByZXNzIChTbWl0aCBNYWNoaW5lKVwiLCBcIkluY2xpbmUgQmVuY2ggUHJlc3MgKFNtaXRoIE1hY2hpbmUpXCIpLFxuICBkaXA6IEwoXCJEaXBcIiwgXCJESVBcIiwgXCJib2R5d2VpZ2h0XCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJDaGVzdCBEaXBcIiwgXCJDaGVzdCBEaXAgKFdlaWdodGVkKVwiLCBcIlRyaWNlcHMgRGlwXCIsIFwiVHJpY2VwcyBEaXAgKFdlaWdodGVkKVwiLCBcIlJpbmcgRGlwc1wiKSxcbiAgcHVzaFVwOiBMKFwiUHVzaCBVcFwiLCBcIlBVU0ggVVBcIiwgXCJib2R5d2VpZ2h0XCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJQdXNoIFVwXCIsIFwiUHVzaCBVcCAoV2VpZ2h0ZWQpXCIpLFxuICBjaGVzdEZseTogTChcIkNoZXN0IEZseVwiLCBcIkZMWVwiLCBcImR1bWJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJDaGVzdCBGbHkgKER1bWJiZWxsKVwiLCBcIkNhYmxlIEZseSBDcm9zc292ZXJzXCIsIFwiQnV0dGVyZmx5IChQZWMgRGVjaylcIiwgXCJDaGVzdCBGbHkgKE1hY2hpbmUpXCIsIFwiU2VhdGVkIENoZXN0IEZseXMgKENhYmxlKVwiLCBcIkxvdyBDYWJsZSBGbHkgQ3Jvc3NvdmVyc1wiKSxcbiAgaW5jbGluZUZseTogTChcIkluY2xpbmUgRmx5XCIsIFwiSU5DIEZMWVwiLCBcImR1bWJiZWxsXCIsIFwiY2hlc3RcIiwgdHJ1ZSwgXCJJbmNsaW5lIENoZXN0IEZseSAoRHVtYmJlbGwpXCIpLFxuICBwdXNoUHJlc3M6IEwoXCJQdXNoIFByZXNzXCIsIFwiUFVTSCBQUkVTU1wiLCBcImJhcmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJQdXNoIFByZXNzXCIpLFxuICBzZWF0ZWRPaHA6IEwoXCJTZWF0ZWQgT3ZlcmhlYWQgUHJlc3NcIiwgXCJTRUFURUQgT0hQXCIsIFwiYmFyYmVsbFwiLCBcInNob3VsZGVyc1wiLCB0cnVlLCBcIlNlYXRlZCBPdmVyaGVhZCBQcmVzcyAoQmFyYmVsbClcIiksXG4gIGRiT2hwOiBMKFwiRHVtYmJlbGwgU2hvdWxkZXIgUHJlc3NcIiwgXCJEQiBPSFBcIiwgXCJkdW1iYmVsbFwiLCBcInNob3VsZGVyc1wiLCB0cnVlLCBcIlNob3VsZGVyIFByZXNzIChEdW1iYmVsbClcIiwgXCJTZWF0ZWQgT3ZlcmhlYWQgUHJlc3MgKER1bWJiZWxsKVwiLCBcIk92ZXJoZWFkIFByZXNzIChEdW1iYmVsbClcIiksXG4gIGFybm9sZFByZXNzOiBMKFwiQXJub2xkIFByZXNzXCIsIFwiQVJOT0xEXCIsIFwiZHVtYmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJBcm5vbGQgUHJlc3MgKER1bWJiZWxsKVwiKSxcbiAgbWFjaGluZVNob3VsZGVyUHJlc3M6IEwoXCJTaG91bGRlciBQcmVzcyAoTWFjaGluZSlcIiwgXCJNQUNIIE9IUFwiLCBcIm1hY2hpbmVcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJTZWF0ZWQgU2hvdWxkZXIgUHJlc3MgKE1hY2hpbmUpXCIsIFwiU2hvdWxkZXIgUHJlc3MgKE1hY2hpbmUgUGxhdGVzKVwiKSxcbiAgbGF0ZXJhbFJhaXNlOiBMKFwiTGF0ZXJhbCBSYWlzZVwiLCBcIkxBVCBSQUlTRVwiLCBcImR1bWJiZWxsXCIsIFwic2hvdWxkZXJzXCIsIHRydWUsIFwiTGF0ZXJhbCBSYWlzZSAoRHVtYmJlbGwpXCIsIFwiTGF0ZXJhbCBSYWlzZSAoQ2FibGUpXCIsIFwiTGF0ZXJhbCBSYWlzZSAoTWFjaGluZSlcIiwgXCJTZWF0ZWQgTGF0ZXJhbCBSYWlzZSAoRHVtYmJlbGwpXCIsIFwiU2luZ2xlIEFybSBMYXRlcmFsIFJhaXNlIChDYWJsZSlcIiksXG4gIGZyb250UmFpc2U6IEwoXCJGcm9udCBSYWlzZVwiLCBcIkZST05UIFJBSVNFXCIsIFwiZHVtYmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJGcm9udCBSYWlzZSAoRHVtYmJlbGwpXCIsIFwiRnJvbnQgUmFpc2UgKENhYmxlKVwiLCBcIkZyb250IFJhaXNlIChCYXJiZWxsKVwiKSxcbiAgcmVhckRlbHRGbHk6IEwoXCJSZWFyIERlbHQgRmx5XCIsIFwiUkVBUiBERUxUXCIsIFwiZHVtYmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJSZWFyIERlbHQgUmV2ZXJzZSBGbHkgKER1bWJiZWxsKVwiLCBcIlJlYXIgRGVsdCBSZXZlcnNlIEZseSAoQ2FibGUpXCIsIFwiUmVhciBEZWx0IFJldmVyc2UgRmx5IChNYWNoaW5lKVwiLCBcIkNoZXN0IFN1cHBvcnRlZCBSZXZlcnNlIEZseSAoRHVtYmJlbGwpXCIpLFxuICBmYWNlUHVsbDogTChcIkZhY2UgUHVsbFwiLCBcIkZBQ0UgUFVMTFwiLCBcIm1hY2hpbmVcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJGYWNlIFB1bGxcIiksXG4gIGJhbmRQdWxsQXBhcnQ6IEwoXCJCYW5kIFB1bGwtQXBhcnRcIiwgXCJQVUxMLUFQQVJUXCIsIFwiYm9keXdlaWdodFwiLCBcInNob3VsZGVyc1wiLCB0cnVlLCBcIkJhbmQgUHVsbGFwYXJ0c1wiKSxcbiAgdXByaWdodFJvdzogTChcIlVwcmlnaHQgUm93XCIsIFwiVVBSSUdIVFwiLCBcImJhcmJlbGxcIiwgXCJzaG91bGRlcnNcIiwgdHJ1ZSwgXCJVcHJpZ2h0IFJvdyAoQmFyYmVsbClcIiwgXCJVcHJpZ2h0IFJvdyAoQ2FibGUpXCIsIFwiVXByaWdodCBSb3cgKER1bWJiZWxsKVwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgcHVsbGluZyBcdTI1MDBcdTI1MDBcbiAgcm93OiBMKFwiQmFyYmVsbCBSb3dcIiwgXCJCQiBST1dcIiwgXCJiYXJiZWxsXCIsIFwiYmFja1wiLCB0cnVlLCBcIkJlbnQgT3ZlciBSb3cgKEJhcmJlbGwpXCIpLFxuICBwZW5kbGF5Um93OiBMKFwiUGVuZGxheSBSb3dcIiwgXCJQRU5ETEFZXCIsIFwiYmFyYmVsbFwiLCBcImJhY2tcIiwgdHJ1ZSwgXCJQZW5kbGF5IFJvdyAoQmFyYmVsbClcIiksXG4gIHNlYWxSb3c6IEwoXCJTZWFsIFJvd1wiLCBcIlNFQUwgUk9XXCIsIFwiYmFyYmVsbFwiLCBcImJhY2tcIiwgdHJ1ZSwgXCJTZWFsIFJvdyAoQmFyYmVsbClcIiwgXCJTZWFsIFJvdyAoRHVtYmJlbGwpXCIpLFxuICB0QmFyUm93OiBMKFwiVC1CYXIgUm93XCIsIFwiVC1CQVJcIiwgXCJtYWNoaW5lXCIsIFwiYmFja1wiLCB0cnVlLCBcIlQgQmFyIFJvd1wiLCBcIkNoZXN0IFN1cHBvcnRlZCBUIEJhciBSb3dcIiwgXCJMYW5kbWluZSBSb3dcIiksXG4gIGRiUm93OiBMKFwiRHVtYmJlbGwgUm93XCIsIFwiREIgUk9XXCIsIFwiZHVtYmJlbGxcIiwgXCJiYWNrXCIsIHRydWUsIFwiRHVtYmJlbGwgUm93XCIsIFwiQmVudCBPdmVyIFJvdyAoRHVtYmJlbGwpXCIpLFxuICBjaGVzdFN1cHBvcnRlZFJvdzogTChcIkNoZXN0LVN1cHBvcnRlZCBSb3dcIiwgXCJDUyBST1dcIiwgXCJkdW1iYmVsbFwiLCBcImJhY2tcIiwgdHJ1ZSwgXCJDaGVzdCBTdXBwb3J0ZWQgSW5jbGluZSBSb3cgKER1bWJiZWxsKVwiLCBcIkNoZXN0IFN1cHBvcnRlZCBJbmNsaW5lIFJvd1wiKSxcbiAgY2FibGVSb3c6IEwoXCJTZWF0ZWQgQ2FibGUgUm93XCIsIFwiQ0FCTEUgUk9XXCIsIFwibWFjaGluZVwiLCBcImJhY2tcIiwgdHJ1ZSwgXCJTZWF0ZWQgQ2FibGUgUm93IC0gViBHcmlwIChDYWJsZSlcIiwgXCJTZWF0ZWQgQ2FibGUgUm93IC0gQmFyIEdyaXBcIiwgXCJTZWF0ZWQgQ2FibGUgUm93IC0gQmFyIFdpZGUgR3JpcFwiLCBcIlNlYXRlZCBSb3cgKE1hY2hpbmUpXCIsIFwiSXNvLUxhdGVyYWwgTG93IFJvd1wiLCBcIklzby1MYXRlcmFsIFJvdyAoTWFjaGluZSlcIiksXG4gIGludmVydGVkUm93OiBMKFwiSW52ZXJ0ZWQgUm93XCIsIFwiSU5WIFJPV1wiLCBcImJvZHl3ZWlnaHRcIiwgXCJiYWNrXCIsIHRydWUsIFwiSW52ZXJ0ZWQgUm93XCIpLFxuICBsYXRQdWxsZG93bjogTChcIkxhdCBQdWxsZG93blwiLCBcIkxBVCBQRFwiLCBcIm1hY2hpbmVcIiwgXCJsYXRzXCIsIHRydWUsIFwiTGF0IFB1bGxkb3duIChDYWJsZSlcIiwgXCJMYXQgUHVsbGRvd24gKE1hY2hpbmUpXCIsIFwiTGF0IFB1bGxkb3duIC0gQ2xvc2UgR3JpcCAoQ2FibGUpXCIsIFwiUmV2ZXJzZSBHcmlwIExhdCBQdWxsZG93biAoQ2FibGUpXCIpLFxuICBwdWxsVXA6IEwoXCJQdWxsIFVwXCIsIFwiUFVMTCBVUFwiLCBcImJvZHl3ZWlnaHRcIiwgXCJsYXRzXCIsIHRydWUsIFwiUHVsbCBVcFwiLCBcIlB1bGwgVXAgKFdlaWdodGVkKVwiLCBcIldpZGUgUHVsbCBVcFwiKSxcbiAgY2hpblVwOiBMKFwiQ2hpbiBVcFwiLCBcIkNISU4gVVBcIiwgXCJib2R5d2VpZ2h0XCIsIFwibGF0c1wiLCB0cnVlLCBcIkNoaW4gVXBcIiwgXCJDaGluIFVwIChXZWlnaHRlZClcIiksXG4gIHN0cmFpZ2h0QXJtUHVsbGRvd246IEwoXCJTdHJhaWdodC1Bcm0gUHVsbGRvd25cIiwgXCJTQSBQVUxMRE5cIiwgXCJtYWNoaW5lXCIsIFwibGF0c1wiLCB0cnVlLCBcIlN0cmFpZ2h0IEFybSBMYXQgUHVsbGRvd24gKENhYmxlKVwiLCBcIlJvcGUgU3RyYWlnaHQgQXJtIFB1bGxkb3duXCIpLFxuICBwdWxsb3ZlcjogTChcIlB1bGxvdmVyXCIsIFwiUFVMTE9WRVJcIiwgXCJkdW1iYmVsbFwiLCBcImxhdHNcIiwgdHJ1ZSwgXCJQdWxsb3ZlciAoRHVtYmJlbGwpXCIsIFwiUHVsbG92ZXIgKE1hY2hpbmUpXCIpLFxuICBzaHJ1ZzogTChcIlNocnVnXCIsIFwiU0hSVUdcIiwgXCJiYXJiZWxsXCIsIFwidHJhcHNcIiwgdHJ1ZSwgXCJTaHJ1ZyAoQmFyYmVsbClcIiwgXCJTaHJ1ZyAoRHVtYmJlbGwpXCIsIFwiU2hydWcgKE1hY2hpbmUpXCIsIFwiU2hydWcgKENhYmxlKVwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgYXJtcyBcdTI1MDBcdTI1MDBcbiAgYmljZXBDdXJsOiBMKFwiQmljZXAgQ3VybFwiLCBcIkNVUkxcIiwgXCJkdW1iYmVsbFwiLCBcImJpY2Vwc1wiLCB0cnVlLCBcIkJpY2VwIEN1cmwgKER1bWJiZWxsKVwiLCBcIkJpY2VwIEN1cmwgKENhYmxlKVwiLCBcIkJpY2VwIEN1cmwgKE1hY2hpbmUpXCIpLFxuICBiYXJiZWxsQ3VybDogTChcIkJhcmJlbGwgQ3VybFwiLCBcIkJCIENVUkxcIiwgXCJiYXJiZWxsXCIsIFwiYmljZXBzXCIsIHRydWUsIFwiQmljZXAgQ3VybCAoQmFyYmVsbClcIiwgXCJFWiBCYXIgQmljZXBzIEN1cmxcIiksXG4gIGhhbW1lckN1cmw6IEwoXCJIYW1tZXIgQ3VybFwiLCBcIkhBTU1FUlwiLCBcImR1bWJiZWxsXCIsIFwiYmljZXBzXCIsIHRydWUsIFwiSGFtbWVyIEN1cmwgKER1bWJiZWxsKVwiLCBcIkhhbW1lciBDdXJsIChDYWJsZSlcIiwgXCJDcm9zcyBCb2R5IEhhbW1lciBDdXJsXCIpLFxuICByZXZlcnNlQ3VybDogTChcIlJldmVyc2UgQ3VybFwiLCBcIlJFViBDVVJMXCIsIFwiYmFyYmVsbFwiLCBcImJpY2Vwc1wiLCB0cnVlLCBcIlJldmVyc2UgQ3VybCAoQmFyYmVsbClcIiwgXCJSZXZlcnNlIEN1cmwgKER1bWJiZWxsKVwiLCBcIlJldmVyc2UgQ3VybCAoQ2FibGUpXCIpLFxuICBpbmNsaW5lQ3VybDogTChcIkluY2xpbmUgQ3VybFwiLCBcIklOQyBDVVJMXCIsIFwiZHVtYmJlbGxcIiwgXCJiaWNlcHNcIiwgdHJ1ZSwgXCJTZWF0ZWQgSW5jbGluZSBDdXJsIChEdW1iYmVsbClcIiksXG4gIGNvbmNlbnRyYXRpb25DdXJsOiBMKFwiQ29uY2VudHJhdGlvbiBDdXJsXCIsIFwiQ09OQyBDVVJMXCIsIFwiZHVtYmJlbGxcIiwgXCJiaWNlcHNcIiwgdHJ1ZSwgXCJDb25jZW50cmF0aW9uIEN1cmxcIiksXG4gIHNwaWRlckN1cmw6IEwoXCJTcGlkZXIgQ3VybFwiLCBcIlNQSURFUlwiLCBcImR1bWJiZWxsXCIsIFwiYmljZXBzXCIsIHRydWUsIFwiU3BpZGVyIEN1cmwgKER1bWJiZWxsKVwiLCBcIlNwaWRlciBDdXJsIChCYXJiZWxsKVwiKSxcbiAgcHJlYWNoZXJDdXJsOiBMKFwiUHJlYWNoZXIgQ3VybFwiLCBcIlBSRUFDSEVSXCIsIFwibWFjaGluZVwiLCBcImJpY2Vwc1wiLCB0cnVlLCBcIlByZWFjaGVyIEN1cmwgKE1hY2hpbmUpXCIsIFwiUHJlYWNoZXIgQ3VybCAoQmFyYmVsbClcIiwgXCJQcmVhY2hlciBDdXJsIChEdW1iYmVsbClcIiksXG4gIHRyaWNlcFB1c2hkb3duOiBMKFwiVHJpY2VwcyBQdXNoZG93blwiLCBcIlBVU0hET1dOXCIsIFwibWFjaGluZVwiLCBcInRyaWNlcHNcIiwgdHJ1ZSwgXCJUcmljZXBzIFB1c2hkb3duXCIsIFwiVHJpY2VwcyBSb3BlIFB1c2hkb3duXCIsIFwiVHJpY2VwcyBQcmVzc2Rvd25cIiwgXCJSZXZlcnNlIEdyaXAgVHJpY2VwcyBQdXNoZG93blwiLCBcIlNpbmdsZSBBcm0gVHJpY2VwcyBQdXNoZG93biAoQ2FibGUpXCIpLFxuICBvdmVyaGVhZFRyaWNlcDogTChcIk92ZXJoZWFkIFRyaWNlcHMgRXh0ZW5zaW9uXCIsIFwiT0ggVFJJIEVYVFwiLCBcIm1hY2hpbmVcIiwgXCJ0cmljZXBzXCIsIHRydWUsIFwiT3ZlcmhlYWQgVHJpY2VwcyBFeHRlbnNpb24gKENhYmxlKVwiLCBcIlRyaWNlcHMgRXh0ZW5zaW9uIChEdW1iYmVsbClcIiwgXCJUcmljZXBzIEV4dGVuc2lvbiAoQ2FibGUpXCIsIFwiVHJpY2VwcyBFeHRlbnNpb24gKEJhcmJlbGwpXCIpLFxuICB0cmljZXBLaWNrYmFjazogTChcIlRyaWNlcHMgS2lja2JhY2tcIiwgXCJLSUNLQkFDS1wiLCBcImR1bWJiZWxsXCIsIFwidHJpY2Vwc1wiLCB0cnVlLCBcIlRyaWNlcHMgS2lja2JhY2sgKER1bWJiZWxsKVwiLCBcIlRyaWNlcHMgS2lja2JhY2sgKENhYmxlKVwiKSxcbiAgc2t1bGxjcnVzaGVyOiBMKFwiU2t1bGxjcnVzaGVyXCIsIFwiU0tVTExTXCIsIFwiYmFyYmVsbFwiLCBcInRyaWNlcHNcIiwgdHJ1ZSwgXCJTa3VsbGNydXNoZXIgKEJhcmJlbGwpXCIsIFwiU2t1bGxjcnVzaGVyIChEdW1iYmVsbClcIiksXG4gIGptUHJlc3M6IEwoXCJKTSBQcmVzc1wiLCBcIkpNIFBSRVNTXCIsIFwiYmFyYmVsbFwiLCBcInRyaWNlcHNcIiwgdHJ1ZSwgXCJKTSBQcmVzcyAoQmFyYmVsbClcIiksXG4gIHdyaXN0Q3VybDogTChcIldyaXN0IEN1cmxcIiwgXCJXUklTVCBDVVJMXCIsIFwiYmFyYmVsbFwiLCBcImZvcmVhcm1zXCIsIHRydWUsIFwiU2VhdGVkIFdyaXN0IEN1cmwgKEJhcmJlbGwpXCIsIFwiU2VhdGVkIFBhbG1zIFVwIFdyaXN0IEN1cmxcIiwgXCJSZXZlcnNlIFdyaXN0IEN1cmwgKER1bWJiZWxsKVwiKSxcblxuICAvLyBcdTI1MDBcdTI1MDAgY2FsdmVzIC8gY29yZSAvIG1pc2MgXHUyNTAwXHUyNTAwXG4gIGNhbGZSYWlzZTogTChcIkNhbGYgUmFpc2VcIiwgXCJDQUxGXCIsIFwibWFjaGluZVwiLCBcImNhbHZlc1wiLCBmYWxzZSwgXCJTdGFuZGluZyBDYWxmIFJhaXNlIChNYWNoaW5lKVwiLCBcIlN0YW5kaW5nIENhbGYgUmFpc2VcIiwgXCJTdGFuZGluZyBDYWxmIFJhaXNlIChCYXJiZWxsKVwiLCBcIlN0YW5kaW5nIENhbGYgUmFpc2UgKFNtaXRoKVwiLCBcIkNhbGYgUHJlc3MgKE1hY2hpbmUpXCIsIFwiU3RhbmRpbmcgQ2FsZiBSYWlzZSAoRHVtYmJlbGwpXCIpLFxuICBzZWF0ZWRDYWxmUmFpc2U6IEwoXCJTZWF0ZWQgQ2FsZiBSYWlzZVwiLCBcIlNFQVQgQ0FMRlwiLCBcIm1hY2hpbmVcIiwgXCJjYWx2ZXNcIiwgZmFsc2UsIFwiU2VhdGVkIENhbGYgUmFpc2VcIiksXG4gIGhhbmdpbmdMZWdSYWlzZTogTChcIkhhbmdpbmcgTGVnIFJhaXNlXCIsIFwiSExSXCIsIFwiYm9keXdlaWdodFwiLCBcImFic1wiLCBmYWxzZSwgXCJIYW5naW5nIExlZyBSYWlzZVwiLCBcIkhhbmdpbmcgS25lZSBSYWlzZVwiLCBcIlRvZXMgdG8gQmFyXCIpLFxuICBhYldoZWVsOiBMKFwiQWIgV2hlZWxcIiwgXCJBQiBXSEVFTFwiLCBcImJvZHl3ZWlnaHRcIiwgXCJhYnNcIiwgZmFsc2UsIFwiQWIgV2hlZWxcIiksXG4gIGNhYmxlQ3J1bmNoOiBMKFwiQ2FibGUgQ3J1bmNoXCIsIFwiQ0FCTEUgQ1JcIiwgXCJtYWNoaW5lXCIsIFwiYWJzXCIsIGZhbHNlLCBcIkNhYmxlIENydW5jaFwiLCBcIkNydW5jaCAoTWFjaGluZSlcIiksXG4gIGJpcmREb2c6IEwoXCJCaXJkIERvZ1wiLCBcIkJJUkQgRE9HXCIsIFwiYm9keXdlaWdodFwiLCBcImFic1wiLCBmYWxzZSwgXCJCaXJkIERvZ1wiKSxcbiAgc2lkZVBsYW5rOiBMKFwiU2lkZSBQbGFua1wiLCBcIlNJREUgUExBTktcIiwgXCJib2R5d2VpZ2h0XCIsIFwiYWJzXCIsIGZhbHNlLCBcIlNpZGUgUGxhbmtcIiksXG4gIGNydW5jaDogTChcIkNydW5jaFwiLCBcIkNSVU5DSFwiLCBcImJvZHl3ZWlnaHRcIiwgXCJhYnNcIiwgZmFsc2UsIFwiQ3J1bmNoXCIsIFwiQ3J1bmNoIChXZWlnaHRlZClcIiwgXCJSZXZlcnNlIENydW5jaFwiLCBcIk9ibGlxdWUgQ3J1bmNoXCIsIFwiRGVjbGluZSBDcnVuY2hcIiksXG4gIHBhbGxvZlByZXNzOiBMKFwiUGFsbG9mIFByZXNzXCIsIFwiUEFMTE9GXCIsIFwibWFjaGluZVwiLCBcImFic1wiLCBmYWxzZSwgXCJQYWxsb2YgUHJlc3NcIiksXG4gIHBsYW5rOiBMKFwiUGxhbmtcIiwgXCJQTEFOS1wiLCBcImJvZHl3ZWlnaHRcIiwgXCJhYnNcIiwgZmFsc2UsIFwiUGxhbmtcIiksXG4gIHNpdFVwOiBMKFwiU2l0IFVwXCIsIFwiU0lUIFVQXCIsIFwiYm9keXdlaWdodFwiLCBcImFic1wiLCBmYWxzZSwgXCJTaXQgVXBcIiwgXCJTaXQgVXAgKFdlaWdodGVkKVwiLCBcIkRlY2xpbmUgQ3J1bmNoIChXZWlnaHRlZClcIiksXG4gIGZhcm1lcnNXYWxrOiBMKFwiRmFybWVyJ3MgV2Fsa1wiLCBcIkZBUk1FUlNcIiwgXCJkdW1iYmVsbFwiLCBcImZ1bGxcIiwgZmFsc2UsIFwiRmFybWVycyBXYWxrXCIpLFxuICBwb3dlckNsZWFuOiBMKFwiUG93ZXIgQ2xlYW5cIiwgXCJQV1IgQ0xFQU5cIiwgXCJiYXJiZWxsXCIsIFwiZnVsbFwiLCBmYWxzZSwgXCJQb3dlciBDbGVhblwiLCBcIkhhbmcgQ2xlYW5cIiwgXCJDbGVhblwiKSxcbn07XG5cbmV4cG9ydCBjb25zdCBCSUdfRk9VUiA9IFtcInNxdWF0XCIsIFwiYmVuY2hcIiwgXCJkZWFkbGlmdFwiLCBcIm9ocFwiXSBhcyBjb25zdDtcblxuZXhwb3J0IGZ1bmN0aW9uIGxpZnROYW1lKGtleTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIExJRlRTW2tleV0/Lm5hbWUgPz8ga2V5O1xufVxuXG4vKipcbiAqIE90aGVyIGFwcHMnIG5hbWVzIGZvciBsaWJyYXJ5IGxpZnRzIChTdHJvbmcncyBjYXRhbG9nLCBtb3N0bHkpLCB1c2VkIG9ubHkgdG8gcmVjb2duaXNlIGxvZ2dlZFxuICogZXhlcmNpc2VzLiBIZXZ5IHRpdGxlcyBhYm92ZSBhbHdheXMgd2luOyB0aGVzZSBuZXZlciBnbyB0byBIZXZ5LlxuICovXG5leHBvcnQgY29uc3QgQUxJQVNFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0ge1xuICBvaHA6IFtcIlN0cmljdCBNaWxpdGFyeSBQcmVzcyAoQmFyYmVsbClcIiwgXCJNaWxpdGFyeSBQcmVzcyAoQmFyYmVsbClcIiwgXCJPdmVyaGVhZCBQcmVzcyAoQmFyYmVsbCAtIFN0YW5kaW5nKVwiXSxcbiAgZnJvbnRTcXVhdDogW1wiRnJvbnQgU3F1YXQgKEJhcmJlbGwpXCJdLFxuICBzdW1vRGVhZGxpZnQ6IFtcIlN1bW8gRGVhZGxpZnQgKEJhcmJlbGwpXCJdLFxuICB0cmFwQmFyRGVhZGxpZnQ6IFtcIlRyYXAgQmFyIERlYWRsaWZ0XCIsIFwiRGVhZGxpZnQgKEhleCBCYXIpXCJdLFxuICBzdGlmZkxlZ0RlYWRsaWZ0OiBbXCJTdGlmZiBMZWcgRGVhZGxpZnQgKEJhcmJlbGwpXCIsIFwiU3RyYWlnaHQgTGVnIERlYWRsaWZ0IChCYXJiZWxsKVwiXSxcbiAgcmFja1B1bGw6IFtcIlJhY2sgUHVsbCAoQmFyYmVsbClcIl0sXG4gIHB1c2hQcmVzczogW1wiUHVzaCBQcmVzcyAoQmFyYmVsbClcIl0sXG4gIHBvd2VyQ2xlYW46IFtcIlBvd2VyIENsZWFuIChCYXJiZWxsKVwiLCBcIkhhbmcgQ2xlYW4gKEJhcmJlbGwpXCIsIFwiQ2xlYW4gKEJhcmJlbGwpXCJdLFxuICBjZ0JlbmNoOiBbXCJDbG9zZSBHcmlwIEJlbmNoIFByZXNzIChCYXJiZWxsKVwiLCBcIkNsb3NlLUdyaXAgQmVuY2ggUHJlc3MgKEJhcmJlbGwpXCJdLFxuICBsZWdQcmVzczogW1wiTGVnIFByZXNzXCIsIFwiTGVnIFByZXNzIChQbGF0ZSBMb2FkZWQpXCJdLFxuICBoYWNrU3F1YXQ6IFtcIkhhY2sgU3F1YXQgKFBsYXRlIExvYWRlZClcIl0sXG4gIGJ1bGdhcmlhblNwbGl0U3F1YXQ6IFtcIkJ1bGdhcmlhbiBTcGxpdCBTcXVhdFwiXSxcbiAgZ29ibGV0U3F1YXQ6IFtcIkdvYmxldCBTcXVhdCAoS2V0dGxlYmVsbClcIiwgXCJHb2JsZXQgU3F1YXQgKER1bWJiZWxsKVwiXSxcbiAgbGVnQ3VybDogW1wiTGVnIEN1cmwgKE1hY2hpbmUpXCIsIFwiTHlpbmcgTGVnIEN1cmxcIiwgXCJTZWF0ZWQgTGVnIEN1cmxcIl0sXG4gIGxlZ0V4dGVuc2lvbjogW1wiTGVnIEV4dGVuc2lvblwiXSxcbiAgYmFja0V4dGVuc2lvbjogW1wiQmFjayBFeHRlbnNpb25cIiwgXCJCYWNrIEV4dGVuc2lvbiAoTWFjaGluZSlcIiwgXCJIeXBlcmV4dGVuc2lvblwiXSxcbiAgY2FibGVSb3c6IFtcIlNlYXRlZCBDYWJsZSBSb3dcIiwgXCJTZWF0ZWQgUm93IChDYWJsZSlcIiwgXCJTZWF0ZWQgUm93IChDYWJsZSAtIFdpZGUgR3JpcClcIiwgXCJTZWF0ZWQgUm93IChDYWJsZSAtIFYgR3JpcClcIiwgXCJDYWJsZSBSb3dcIl0sXG4gIGRiUm93OiBbXCJCZW50IE92ZXIgT25lIEFybSBSb3cgKER1bWJiZWxsKVwiLCBcIk9uZSBBcm0gRHVtYmJlbGwgUm93XCIsIFwiU2luZ2xlIEFybSBSb3cgKER1bWJiZWxsKVwiXSxcbiAgaW52ZXJ0ZWRSb3c6IFtcIkludmVydGVkIFJvdyAoQm9keXdlaWdodClcIl0sXG4gIGxhdFB1bGxkb3duOiBbXCJMYXQgUHVsbGRvd24gLSBXaWRlIEdyaXAgKENhYmxlKVwiLCBcIkxhdCBQdWxsZG93biAtIFVuZGVyaGFuZCAoQ2FibGUpXCIsIFwiTGF0IFB1bGxkb3duIChTaW5nbGUgQXJtKVwiXSxcbiAgc3RyYWlnaHRBcm1QdWxsZG93bjogW1wiU3RyYWlnaHQgQXJtIFB1bGxkb3duIChDYWJsZSlcIiwgXCJTdHJhaWdodCBBcm0gUHVsbGRvd25cIl0sXG4gIGNoZXN0Rmx5OiBbXCJDYWJsZSBDcm9zc292ZXJcIiwgXCJQZWMgRGVjayAoTWFjaGluZSlcIiwgXCJDaGVzdCBGbHkgKENhYmxlKVwiXSxcbiAgcmVhckRlbHRGbHk6IFtcIlJldmVyc2UgRmx5IChEdW1iYmVsbClcIiwgXCJSZXZlcnNlIEZseSAoQ2FibGUpXCIsIFwiUmV2ZXJzZSBGbHkgKE1hY2hpbmUpXCJdLFxuICBmYWNlUHVsbDogW1wiRmFjZSBQdWxsIChDYWJsZSlcIl0sXG4gIGJhcmJlbGxDdXJsOiBbXCJFWiBCYXIgQ3VybFwiLCBcIkJpY2VwIEN1cmwgKEVaIEJhcilcIiwgXCJDdXJsIChFWiBCYXIpXCJdLFxuICBjb25jZW50cmF0aW9uQ3VybDogW1wiQ29uY2VudHJhdGlvbiBDdXJsIChEdW1iYmVsbClcIl0sXG4gIGluY2xpbmVDdXJsOiBbXCJJbmNsaW5lIEN1cmwgKER1bWJiZWxsKVwiXSxcbiAgdHJpY2VwUHVzaGRvd246IFtcIlRyaWNlcHMgUHVzaGRvd24gKENhYmxlIC0gU3RyYWlnaHQgQmFyKVwiLCBcIlRyaWNlcHMgUHVzaGRvd24gKENhYmxlIC0gUm9wZSlcIiwgXCJUcmljZXBzIFB1c2hkb3duIChDYWJsZSlcIl0sXG4gIHNrdWxsY3J1c2hlcjogW1wiU2t1bGxjcnVzaGVyIChFWiBCYXIpXCIsIFwiTHlpbmcgVHJpY2VwcyBFeHRlbnNpb24gKEJhcmJlbGwpXCJdLFxuICBjYWxmUmFpc2U6IFtcIlN0YW5kaW5nIENhbGYgUmFpc2UgKEJvZHl3ZWlnaHQpXCIsIFwiQ2FsZiBQcmVzcyBvbiBMZWcgUHJlc3NcIiwgXCJDYWxmIFJhaXNlIChNYWNoaW5lKVwiXSxcbiAgc2VhdGVkQ2FsZlJhaXNlOiBbXCJTZWF0ZWQgQ2FsZiBSYWlzZSAoTWFjaGluZSlcIiwgXCJTZWF0ZWQgQ2FsZiBSYWlzZSAoUGxhdGUgTG9hZGVkKVwiXSxcbiAgaGFuZ2luZ0xlZ1JhaXNlOiBbXCJIYW5naW5nIEtuZWUgUmFpc2UgKEJvZHl3ZWlnaHQpXCJdLFxuICBrYlN3aW5nOiBbXCJLZXR0bGViZWxsIFN3aW5nIChLZXR0bGViZWxsKVwiXSxcbiAgZmFybWVyc1dhbGs6IFtcIkZhcm1lcidzIFdhbGtcIiwgXCJGYXJtZXJzIFdhbGsgKER1bWJiZWxsKVwiXSxcbn07XG5cbi8vIFRpdGxlIFx1MjE5MiBsaWZ0cyB0aGF0IGxpc3QgaXQgKEhldnkgdGl0bGVzIGZpcnN0LCB0aGVuIGFsaWFzZXMpLCBhbmQgcGVyLW1hcCBpbnZlcnRlZCBpbmRleGVzOyBjYWNoZWQuXG5jb25zdCBCWV9USVRMRSA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmdbXT4oKTtcbmNvbnN0IGFkZFRpdGxlID0gKHRpdGxlOiBzdHJpbmcsIGtleTogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IHQgPSB0aXRsZS50b0xvd2VyQ2FzZSgpLCBsID0gQllfVElUTEUuZ2V0KHQpID8/IFtdO1xuICBpZiAoIWwuaW5jbHVkZXMoa2V5KSkgbC5wdXNoKGtleSk7XG4gIEJZX1RJVExFLnNldCh0LCBsKTtcbn07XG5mb3IgKGNvbnN0IFtrZXksIGRlZl0gb2YgT2JqZWN0LmVudHJpZXMoTElGVFMpKSBmb3IgKGNvbnN0IGggb2YgZGVmLmhldnkpIGFkZFRpdGxlKGgsIGtleSk7XG5mb3IgKGNvbnN0IFtrZXksIGxpc3RdIG9mIE9iamVjdC5lbnRyaWVzKEFMSUFTRVMpKSBmb3IgKGNvbnN0IGggb2YgbGlzdCkgYWRkVGl0bGUoaCwga2V5KTtcbmNvbnN0IE1BUF9JTkRFWCA9IG5ldyBXZWFrTWFwPFJlY29yZDxzdHJpbmcsIHN0cmluZz4sIE1hcDxzdHJpbmcsIHN0cmluZz4+KCk7XG5cbi8qKiBUZW1wbGF0ZSBpZCBJcm9udGVybSB1c2VzIGZvciBhIGxpYnJhcnkgbGlmdCBsb2dnZWQgd2l0aG91dCBIZXZ5IChsb2NhbCBtb2RlKS4gKi9cbmV4cG9ydCBjb25zdCBsb2NhbFRlbXBsYXRlSWQgPSAobGlmdDogc3RyaW5nKSA9PiBgbGlmdDoke2xpZnR9YDtcblxuLyoqIEZpbmQgd2hpY2ggbGlmdCAoaWYgYW55KSBhIGxvZ2dlZCBleGVyY2lzZSBjb3VudHMgYXMuICovXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hMaWZ0KHRpdGxlOiBzdHJpbmcsIHRlbXBsYXRlSWQ6IHN0cmluZywgbWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge30pOiBzdHJpbmcgfCBudWxsIHtcbiAgbGV0IGludiA9IE1BUF9JTkRFWC5nZXQobWFwKTtcbiAgaWYgKCFpbnYpIHsgaW52ID0gbmV3IE1hcChPYmplY3QuZW50cmllcyhtYXApLm1hcCgoW2xpZnQsIHRpZF0pID0+IFt0aWQsIGxpZnRdKSk7IE1BUF9JTkRFWC5zZXQobWFwLCBpbnYpOyB9XG4gIC8vIGV4cGxpY2l0IG1hcHBpbmcgd2lucyBvdmVyIHRpdGxlIGd1ZXNzaW5nXG4gIGNvbnN0IG1hcHBlZCA9IGludi5nZXQodGVtcGxhdGVJZCk7XG4gIGlmIChtYXBwZWQpIHJldHVybiBtYXBwZWQ7XG4gIGlmICh0ZW1wbGF0ZUlkLnN0YXJ0c1dpdGgoXCJsaWZ0OlwiKSAmJiBMSUZUU1t0ZW1wbGF0ZUlkLnNsaWNlKDUpXSkgcmV0dXJuIHRlbXBsYXRlSWQuc2xpY2UoNSk7XG4gIC8vIGZpcnN0IGxpZnQgd2l0aCB0aGlzIHRpdGxlIHRoYXQgaXNuJ3QgbWFwcGVkIHRvIGEgZGlmZmVyZW50IHRlbXBsYXRlXG4gIGZvciAoY29uc3QgayBvZiBCWV9USVRMRS5nZXQodGl0bGUudHJpbSgpLnRvTG93ZXJDYXNlKCkpID8/IFtdKSBpZiAoIW1hcFtrXSkgcmV0dXJuIGs7XG4gIHJldHVybiBudWxsO1xufVxuIiwgImV4cG9ydCB0eXBlIFVuaXQgPSBcImtnXCIgfCBcImxiXCI7XG5cbmV4cG9ydCBjb25zdCBMQl9QRVJfS0cgPSAyLjIwNDYyMjYyMTg1O1xuXG5leHBvcnQgY29uc3QgZnJvbUtnID0gKGtnOiBudW1iZXIsIHVuaXQ6IFVuaXQpID0+ICh1bml0ID09PSBcImtnXCIgPyBrZyA6IGtnICogTEJfUEVSX0tHKTtcbmV4cG9ydCBjb25zdCB0b0tnID0gKHc6IG51bWJlciwgdW5pdDogVW5pdCkgPT4gKHVuaXQgPT09IFwia2dcIiA/IHcgOiB3IC8gTEJfUEVSX0tHKTtcblxuLyoqIE5lYXJlc3QgbXVsdGlwbGUgb2YgYHN0ZXBgLCBoYWx2ZXMgdXAgKGxpa2UgdGhlIHNoZWV0cycgTVJPVU5EKTsgdGhlIGVwc2lsb24ga2VlcHMgMC43IFx1MDBENyAzMjUgPSAyMjcuNDk5OVx1MjAyNiBmcm9tIHJvdW5kaW5nIGRvd24uICovXG5leHBvcnQgY29uc3Qgcm91bmRUbyA9ICh3OiBudW1iZXIsIHN0ZXA6IG51bWJlcikgPT4gTWF0aC5yb3VuZCh3IC8gc3RlcCArIDFlLTkpICogc3RlcDtcblxuLyoqIFNtYWxsZXN0IGp1bXAgeW91IGNhbiBsb2FkLiBNYXRjaGVzIHRoZSBzaGVldCdzIFwiTWljcm9wbGF0ZXM/IE5vXCIgZGVmYXVsdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2FkU3RlcChraW5kOiBMaWZ0S2luZCwgdW5pdDogVW5pdCwgbWljcm8gPSBmYWxzZSk6IG51bWJlciB7XG4gIGlmIChraW5kID09PSBcImR1bWJiZWxsXCIpIHJldHVybiB1bml0ID09PSBcImxiXCIgPyA1IDogMjtcbiAgaWYgKGtpbmQgPT09IFwibWFjaGluZVwiKSByZXR1cm4gdW5pdCA9PT0gXCJsYlwiID8gMi41IDogMi41O1xuICByZXR1cm4gdW5pdCA9PT0gXCJsYlwiID8gKG1pY3JvID8gMi41IDogNSkgOiBtaWNybyA/IDEuMjUgOiAyLjU7XG59XG5cbmV4cG9ydCB0eXBlIExpZnRLaW5kID0gXCJiYXJiZWxsXCIgfCBcImR1bWJiZWxsXCIgfCBcIm1hY2hpbmVcIiB8IFwiYm9keXdlaWdodFwiO1xuXG4vKiogXCIxNDIuNVwiIC8gXCIxODVcIiBcdTIwMTQgdHJpbXMgZmxvYXQgbm9pc2UgYW5kIHRyYWlsaW5nIHplcm9zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZtdCh3OiBudW1iZXIsIGRpZ2l0cyA9IDEpOiBzdHJpbmcge1xuICBjb25zdCByID0gTWF0aC5yb3VuZCh3ICogMTAgKiogZGlnaXRzKSAvIDEwICoqIGRpZ2l0cztcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIocikgPyBTdHJpbmcocikgOiByLnRvRml4ZWQoZGlnaXRzKS5yZXBsYWNlKC8wKyQvLCBcIlwiKTtcbn1cblxuLyoqIEEgd2VpZ2h0IHR5cGVkIGJ5IGEgcGVyc29uOiBcIjgyLjVcIiwgXCI4Miw1XCIsIFwiIDE4MCBsYlwiIFx1MjE5MiBudW1iZXI7IGVtcHR5LCBuZWdhdGl2ZSBvciBqdW5rIFx1MjE5MiBudWxsLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlV2VpZ2h0SW5wdXQoczogc3RyaW5nKTogbnVtYmVyIHwgbnVsbCB7XG4gIGNvbnN0IHQgPSBzLnRyaW0oKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xccyooa2d8a2dzfGxifGxicykkLywgXCJcIikucmVwbGFjZShcIixcIiwgXCIuXCIpO1xuICBpZiAoIS9eXFxkKyhcXC5cXGQrKT8kfF5cXC5cXGQrJC8udGVzdCh0KSkgcmV0dXJuIG51bGw7XG4gIGNvbnN0IG4gPSBOdW1iZXIodCk7XG4gIHJldHVybiBOdW1iZXIuaXNGaW5pdGUobikgPyBuIDogbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZtdEludChuOiBudW1iZXIpOiBzdHJpbmcge1xuICByZXR1cm4gTWF0aC5yb3VuZChuKS50b0xvY2FsZVN0cmluZyhcImVuLVVTXCIpO1xufVxuXG4vKiogVm9sdW1lcyBhbmQgdG9ubmFnZTogXCI4NTBcIiwgXCI5LDQwMFwiLCBcIjY2LjFrXCIsIFwiMS45TVwiIChub3QgXCIxOTAxLjJrXCIsIG5vdCBcIjAuNGtcIikuICovXG5leHBvcnQgZnVuY3Rpb24gZm10QmlnKG46IG51bWJlcik6IHN0cmluZyB7XG4gIGNvbnN0IGEgPSBNYXRoLmFicyhuKTtcbiAgaWYgKGEgPCAxMF8wMDApIHJldHVybiBmbXRJbnQobik7XG4gIGlmIChhIDwgOTk5XzUwMCkgcmV0dXJuIGZtdChuIC8gMTAwMCwgYSA8IDEwMF8wMDAgPyAxIDogMCkgKyBcImtcIjtcbiAgcmV0dXJuIGZtdChuIC8gMWU2LCBhIDwgOV85OTVfMDAwID8gMiA6IDEpICsgXCJNXCI7XG59XG5cbi8qKiBQbGF0ZXMgcGVyIHNpZGUgZm9yIGEgYmFyYmVsbCBsb2FkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBsYXRlcyh0b3RhbDogbnVtYmVyLCB1bml0OiBVbml0LCBiYXIgPSB1bml0ID09PSBcImxiXCIgPyA0NSA6IDIwKTogbnVtYmVyW10ge1xuICBjb25zdCBhdmFpbCA9IHVuaXQgPT09IFwibGJcIiA/IFs0NSwgMzUsIDI1LCAxMCwgNSwgMi41XSA6IFsyNSwgMjAsIDE1LCAxMCwgNSwgMi41LCAxLjI1XTtcbiAgbGV0IHNpZGUgPSAodG90YWwgLSBiYXIpIC8gMjtcbiAgY29uc3Qgb3V0OiBudW1iZXJbXSA9IFtdO1xuICBpZiAoc2lkZSA8PSAwKSByZXR1cm4gb3V0O1xuICBmb3IgKGNvbnN0IHAgb2YgYXZhaWwpIHtcbiAgICB3aGlsZSAoc2lkZSA+PSBwIC0gMWUtNikge1xuICAgICAgb3V0LnB1c2gocCk7XG4gICAgICBzaWRlIC09IHA7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG4iLCAiLy8gR2VuZXJpYyBwcm9ncmFtIGVuZ2luZS5cbi8vXG4vLyBBIHByb2dyYW0gaXMgcHVyZSBkYXRhIChQcm9ncmFtRGVmKTogYSByb3RhdGlvbiBvZiBkYXlzLCBlYWNoIHdpdGggc2xvdHMsIGFuZCBlYWNoIHNsb3QgaGFzIGFcbi8vIHByb2dyZXNzaW9uIHJ1bGUuIFRoZSBlbmdpbmUgbmV2ZXIgc3RvcmVzIFwiY3VycmVudCB3ZWlnaHRzXCIuIEl0IHJlcGxheXMgeW91ciBIZXZ5IGhpc3Rvcnlcbi8vIGFnYWluc3QgdGhlIHByb2dyYW0gZnJvbSBpdHMgc3RhcnQgZGF0ZSwgc28gZWRpdGluZyBvciBkZWxldGluZyBhIHdvcmtvdXQgaW4gSGV2eSBqdXN0XG4vLyBjaGFuZ2VzIHRoZSByZXBsYXkuIEFkZGluZyBhIG5ldyBzcHJlYWRzaGVldCBwcm9ncmFtIG1lYW5zIHdyaXRpbmcgb25lIFByb2dyYW1UZW1wbGF0ZVxuLy8gKHNlZSBwcm9ncmFtcy8qLnRzIGFuZCBSRUFETUUgXCJQcm9ncmFtc1wiKS5cbi8vXG4vLyBQcm9ncmVzc2lvbiBraW5kczpcbi8vICAgc3RhZ2VzICAgbGluZWFyIHByb2dyZXNzaW9uIHRocm91Z2ggcmVwIHNjaGVtZXMgKEdaQ0xQLCBTdHJvbmdMaWZ0cywgU3RhcnRpbmcgU3RyZW5ndGgsXG4vLyAgICAgICAgICAgIEdyZXlTa3VsbFx1MjAyNik6IGFkZCB3ZWlnaHQgb24gc3VjY2Vzcywgc3RlcCBkb3duIGEgc3RhZ2UgLyBkZWxvYWQgLyByZXRlc3Qgb24gZmFpbHVyZS5cbi8vICAgcGVyY2VudCAgc2V0cyBhcyAlIG9mIGEgdHJhaW5pbmcgbWF4IChvciBSUEUgdGFyZ2V0cyksIG9wdGlvbmFsbHkgYSBkaWZmZXJlbnQgdGFibGUgcGVyXG4vLyAgICAgICAgICAgIHdlZWsgKDUvMy8xLCBDYW5kaXRvLCBTbW9sb3YsIFNoZWlrbywgSnVnZ2VybmF1dFx1MjAyNik7IFRNIGNhbiBtb3ZlIGZyb20gQU1SQVAgcmVzdWx0cy5cbi8vICAgZG91YmxlICAgZG91YmxlIHByb2dyZXNzaW9uIGluIGEgcmVwIHJhbmdlICgzXHUwMEQ3OFx1MjAxMzEyKTogYWRkIHdlaWdodCBvbmNlIGV2ZXJ5IHNldCBoaXRzIHRoZSB0b3AuXG4vLyAgIGZpeGVkICAgIG5vIHByb2dyZXNzaW9uIChhY2Nlc3NvcmllcyAvIGJvZHl3ZWlnaHQpOyBqdXN0IHNob3dzIHdoYXQgeW91IGRpZCBsYXN0IHRpbWUuXG5cbmltcG9ydCB0eXBlIHsgSGV2eVdvcmtvdXQgfSBmcm9tIFwiLi9oZXZ5XCI7XG5pbXBvcnQgeyBMSUZUUywgbWF0Y2hMaWZ0IH0gZnJvbSBcIi4vbGlmdHNcIjtcbmltcG9ydCB7IGZtdCwgZnJvbUtnLCBsb2FkU3RlcCwgcm91bmRUbywgdHlwZSBVbml0IH0gZnJvbSBcIi4vdW5pdHNcIjtcblxuY29uc3QgY2VpbFRvID0gKHc6IG51bWJlciwgczogbnVtYmVyKSA9PiBNYXRoLmNlaWwodyAvIHMgLSAxZS05KSAqIHM7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBkZWZpbml0aW9ucyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IHR5cGUgVGllciA9IFwiVDFcIiB8IFwiVDJcIiB8IFwiVDNcIiB8IFwiTUFJTlwiIHwgXCJTVVBQXCIgfCBcIkFDQ1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdlaWdodHMge1xuICBsYjogbnVtYmVyO1xuICBrZzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YWdlIHtcbiAgc2V0czogbnVtYmVyO1xuICByZXBzOiBudW1iZXI7XG4gIC8qKiBsYXN0IHNldCBpcyBcImFzIG1hbnkgcmVwcyBhcyBwb3NzaWJsZVwiICovXG4gIGFtcmFwOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBlcmNlbnRTZXQge1xuICAvKiogZnJhY3Rpb24gb2YgdGhlIHRyYWluaW5nIG1heCAoMC44NSkuIE9taXQgZm9yIFJQRS1vbmx5IHNldHMgXHUyMDE0IHRoZSBsaWZ0ZXIgcGlja3MgdGhlIGxvYWQuICovXG4gIHBjdD86IG51bWJlcjtcbiAgLyoqIHRhcmdldCBSUEUgKGUuZy4gOCkgXHUyMDE0IHNob3duIGFsb25nc2lkZSBvciBpbnN0ZWFkIG9mIGEgbG9hZCAqL1xuICBycGU/OiBudW1iZXI7XG4gIHJlcHM6IG51bWJlcjtcbiAgLyoqIHRvcCBvZiBhIHJlcCByYW5nZSAoOFx1MjAxMzEyKSAqL1xuICByZXBzTWF4PzogbnVtYmVyO1xuICBhbXJhcD86IGJvb2xlYW47XG4gIC8qKiBBTVJBUCByZXAgdGFyZ2V0LCBmb3IgYW1yYXBWc1RhcmdldCBUTSBydWxlcyAoU0JTLCBKdWdnZXJuYXV0KSAqL1xuICB0YXJnZXQ/OiBudW1iZXI7XG4gIC8qKiBmaXhlZCBsb2FkIGFkZGVkIG9uIHRvcCBvZiB0aGUgcGVyY2VudGFnZSAoU21vbG92IEpyIHdlZWtzIDJcdTIwMTMzOiA3MCUgKyAxMCBsYikgKi9cbiAgYWRkPzogV2VpZ2h0cztcbiAgLyoqIGBwY3RgIGlzIG9mIHRoZSBlMVJNIG9mIHRvZGF5J3MgdG9wIHNldCBvZiB0aGlzIGV4ZXJjaXNlIChiYWNrLW9mZnMgYWZ0ZXIgYW4gUlBFIHRvcCBzaW5nbGUpLiAqL1xuICBvZlRvcD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIFRtUnVsZSA9XG4gIC8qKiBuU3VuczogcmVwcyBvbiBvbmUgQU1SQVAgc2V0IFx1MjE5MiBudW1iZXIgb2YgVE0gaW5jcmVtZW50cyAocm93czogcmVwcyBcdTIyNjUgbWluUmVwcykgKi9cbiAgfCB7IHR5cGU6IFwiYW1yYXBUYWJsZVwiOyBzZXRJbmRleDogbnVtYmVyOyB0YWJsZTogeyBtaW5SZXBzOiBudW1iZXI7IGluY3JlbWVudHM6IG51bWJlciB9W107IGFwcGx5QXQ/OiBcIm5vd1wiIHwgXCJ3ZWVrRW5kXCI7IHVzZUxhc3Q/OiBib29sZWFuO1xuICAgICAgLyoqIG5TdW5zIDQtZGF5OiB0aGUgYmVuY2ggMSsgc2V0IGFsc28gbW92ZXMgdGhlIHByZXNzIFRNIGJ5IHRoZSBzYW1lIG51bWJlciBvZiBpbmNyZW1lbnRzICovXG4gICAgICBhbHNvTGlmdHM/OiBzdHJpbmdbXSB9XG4gIC8qKiBTQlMgLyBKdWdnZXJuYXV0OiByZXBzIGJleW9uZCAob3Igc2hvcnQgb2YpIHRoZSBzZXQncyB0YXJnZXQgXHUyMTkyIFRNIGNoYW5nZS4gVGhlIGxhc3Qgcm93XG4gICAqICB3aXRoIGRpZmYgXHUyMjY0IChyZXBzIFx1MjIxMiB0YXJnZXQpIGFwcGxpZXMuIHBjdCA9IGZyYWN0aW9uIG9mIFRNOyBpbmNyZW1lbnRzID0gXHUwMEQ3IHRtSW5jcmVtZW50LiAqL1xuICB8IHsgdHlwZTogXCJhbXJhcFZzVGFyZ2V0XCI7IHNldEluZGV4OiBudW1iZXI7IHRhYmxlOiB7IGRpZmY6IG51bWJlcjsgcGN0PzogbnVtYmVyOyBpbmNyZW1lbnRzPzogbnVtYmVyIH1bXTsgYWxsU2V0cz86IGJvb2xlYW47XG4gICAgICAvKiogXCJhZnRlck5leHRXZWVrXCI6IHRoZSB3ZWVrIGFmdGVyIHRoaXMgb25lIHN0aWxsIHVzZXMgdGhlIG9sZCBUTSAoSnVnZ2VybmF1dDogdGhlIGRlbG9hZFxuICAgICAgICogIHdlZWsgYWZ0ZXIgcmVhbGl6YXRpb24gcnVucyBvZmYgdGhlIG9sZCBUTTsgdGhlIG5ldyBvbmUgc3RhcnRzIHdpdGggdGhlIG5leHQgd2F2ZSkuICovXG4gICAgICBhcHBseUF0PzogXCJub3dcIiB8IFwid2Vla0VuZFwiIHwgXCJhZnRlck5leHRXZWVrXCI7XG4gICAgICAvKiogU0JTOiBhIHBsYW5uZWQgc2V0IGF0IHRoZSB0YXJnZXQgd2VpZ2h0IHRoYXQgd2FzIHNraXBwZWQsIG9yIGRvbmUgZm9yIGZld2VyIHRoYW4gaXRzIHBsYW5uZWRcbiAgICAgICAqICByZXBzLCBjb3VudHMgYXMgXCJmYWlsZWQgdG8gY29tcGxldGUgdGhlIHNldHNcIjogZGlmZiBiZWNvbWVzIGF0IG1vc3QgXHUyMjEyMSBcdTIyMTIgKHNldHMgc2hvcnQpLiAqL1xuICAgICAgcGVuYWxpemVNaXNzaW5nU2V0cz86IGJvb2xlYW47XG4gICAgICAvKiogU0JTIExhc3QgU2V0IFJJUjogdGhlIHRhcmdldCBzZXQncyBgcnBlYCBpcyB0aGUgUklSIHRhcmdldCAoMTAgXHUyMjEyIFJJUikuIEVmZmVjdGl2ZSBSSVIgPSByZXBzIHBhc3RcbiAgICAgICAqICB0aGUgcGxhbm5lZCBudW1iZXIgKyAoMTAgXHUyMjEyIGxvZ2dlZCBSUEUgb2YgdGhhdCBzZXQsIGlmIGFueSk7IGRpZmYgPSBlZmZlY3RpdmUgXHUyMjEyIHRhcmdldCBSSVIsIGFuZFxuICAgICAgICogIGFueSBzaG9ydGZhbGwgY291bnRzIGFzIFx1MjIxMjEgKFwiY29tcGxldGVkIHRoZSBzZXRzLCBSSVIgYmVsb3cgdGFyZ2V0XCIpLiAqL1xuICAgICAgcmlyPzogYm9vbGVhbjtcbiAgICAgIC8qKiByZWFkIHRoZSBsYXN0IHNldCBkb25lIGF0IHRoZSB0YXJnZXQgd2VpZ2h0ICh0aGUgQU1SQVAgaXRzZWxmKSBpbnN0ZWFkIG9mIHRoZSBiZXN0IG9uZSAqL1xuICAgICAgdXNlTGFzdD86IGJvb2xlYW4gfVxuICAvKiogUlRTLXN0eWxlOiBuZXcgVE0gPSBlMVJNIG9mIHRoYXQgc2V0IFx1MDBENyBwY3QgKi9cbiAgfCB7IHR5cGU6IFwiZTFybVwiOyBzZXRJbmRleDogbnVtYmVyOyBwY3Q6IG51bWJlciB9XG4gIC8qKiBHWkNMIFZESVA6IHRvdGFsIHJlcHMgYWNyb3NzIHRoZSBzZXRzIGRvbmUgYXQgdGhlIHByZXNjcmliZWQgd2VpZ2h0IFx1MjE5MiBUTSBjaGFuZ2UgKHJvd3M6IHRvdGFsIFx1MjI2NSBtaW5SZXBzKSAqL1xuICB8IHsgdHlwZTogXCJ0b3RhbFJlcHNcIjsgdGFibGU6IHsgbWluUmVwczogbnVtYmVyOyBpbmNyZW1lbnRzPzogbnVtYmVyOyBwY3Q/OiBudW1iZXIgfVtdOyBhcHBseUF0PzogXCJub3dcIiB8IFwid2Vla0VuZFwiIH1cbiAgLyoqIENhbmRpdG86IGFueSBwcmVzY3JpYmVkIHNldCB0aGF0IGZhbGxzIHNob3J0IG9mIGl0cyByZXBzIGN1dHMgdGhlIG1heCBieSBwY3QgKi9cbiAgfCB7IHR5cGU6IFwibWlzc0N1dFwiOyBwY3Q6IG51bWJlcjsgc2V0SW5kZXg/OiBudW1iZXIgfTtcblxuZXhwb3J0IHR5cGUgUHJvZ3Jlc3Npb24gPVxuICB8IHtcbiAgICAgIGtpbmQ6IFwic3RhZ2VzXCI7XG4gICAgICBzdGFnZXM6IFN0YWdlW107XG4gICAgICAvKiogSG93IGEgc2Vzc2lvbiBjb3VudHMgYXMgYSBzdWNjZXNzLiAqL1xuICAgICAgYWR2YW5jZTogeyB0eXBlOiBcImJhc2VWb2x1bWVcIiB9IHwgeyB0eXBlOiBcImFtcmFwQXRMZWFzdFwiOyByZXBzOiBudW1iZXIgfTtcbiAgICAgIC8qKiBXaGF0IGhhcHBlbnMgd2hlbiB0aGUgbGFzdCBzdGFnZSBmYWlscy4gKi9cbiAgICAgIG9uRmluYWxGYWlsOlxuICAgICAgICB8IHsgdHlwZTogXCJyZXRlc3RcIjsgcm1SZXBzOiBudW1iZXI7IHBjdDogbnVtYmVyIH1cbiAgICAgICAgfCB7IHR5cGU6IFwicmVzZXRcIjsgYnVtcEluY3JlbWVudHM6IG51bWJlciB9XG4gICAgICAgIHwgeyB0eXBlOiBcImRlbG9hZFwiOyBwY3Q6IG51bWJlciB9XG4gICAgICAgIHwgeyB0eXBlOiBcImRlbG9hZEJ5XCI7IGFtb3VudDogV2VpZ2h0cyB9XG4gICAgICAgIHwgeyB0eXBlOiBcImhvbGRcIiB9O1xuICAgICAgaW5jcmVtZW50OiBXZWlnaHRzO1xuICAgICAgLyoqIENvbnNlY3V0aXZlIGZhaWxlZCBzZXNzaW9ucyBiZWZvcmUgc3RlcHBpbmcgZG93biAvIGRlbG9hZGluZyAoU3Ryb25nTGlmdHM6IDMpLiBEZWZhdWx0IDEuICovXG4gICAgICBmYWlsc0JlZm9yZUFjdGlvbj86IG51bWJlcjtcbiAgICAgIC8qKiBHcmV5U2t1bGw6IEFNUkFQIG9mIGF0IGxlYXN0IGByZXBzYCBvbiB0aGUgbGFzdCBzZXQgZWFybnMgYGluY3JlbWVudHNgIGp1bXBzIGluc3RlYWQgb2Ygb25lLiAqL1xuICAgICAgYW1yYXBCb251cz86IHsgcmVwczogbnVtYmVyOyBpbmNyZW1lbnRzOiBudW1iZXIgfTtcbiAgICAgIC8qKiBTQlMgTm92aWNlIEh5cGVydHJvcGh5IChzZXRzIFx1MjE5MiByZXBzIFx1MjE5MiBsb2FkKTogc3VjY2VzcyBtb3ZlcyB0byB0aGUgTkVYVCBzdGFnZSBhdCB0aGUgc2FtZVxuICAgICAgICogIHdlaWdodDsgc3VjY2VzcyBvbiB0aGUgbGFzdCBzdGFnZSBhZGRzIGBsb2FkUGN0YCBhbmQgZ29lcyBiYWNrIHRvIHN0YWdlIDAuIEEgbWlzcyByZXBlYXRzXG4gICAgICAgKiAgdGhlIHNhbWUgc3RhZ2UgKGZhaWx1cmUgb3B0aW9ucyBhcmUgaWdub3JlZCkuIGxvYWRQY3QgMCBvciAwIGxvYWQgKGJvZHl3ZWlnaHQpOiB0aGUgbGFzdCBzdGFnZSBob2xkcy4gKi9cbiAgICAgIGNsaW1iPzogeyBsb2FkUGN0OiBudW1iZXIgfTtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJwZXJjZW50XCI7XG4gICAgICAvKiogV2hvc2UgdHJhaW5pbmcgbWF4IHRoZSBwZXJjZW50YWdlcyBhcmUgb2YuICovXG4gICAgICB0bUxpZnQ6IHN0cmluZztcbiAgICAgIC8qKiBPbmUgdGFibGUgcGVyIHByb2dyYW0gd2VlayAoY3ljbGVkLCBvciBieSB3ZWVrIGZvciBmaW5pdGUgYmxvY2tzKS4gT25lIHRhYmxlID0gZXZlcnkgd2Vlay4gKi9cbiAgICAgIHdlZWtzOiBQZXJjZW50U2V0W11bXTtcbiAgICAgIHRtUnVsZT86IFRtUnVsZTtcbiAgICB9XG4gIHwge1xuICAgICAga2luZDogXCJkb3VibGVcIjtcbiAgICAgIHNldHM6IG51bWJlcjtcbiAgICAgIHJlcHM6IFtudW1iZXIsIG51bWJlcl07XG4gICAgICBpbmNyZW1lbnQ6IFdlaWdodHM7XG4gICAgICAvKiogbGFzdCBzZXQgQU1SQVAgKGUuZy4gUmVkZGl0IFBQTCBcIjNcdTAwRDc4XHUyMDEzMTIsIGxhc3Qgc2V0IEFNUkFQXCIpICovXG4gICAgICBhbXJhcExhc3Q/OiBib29sZWFuO1xuICAgIH1cbiAgfCB7XG4gICAgICBraW5kOiBcImZpeGVkXCI7XG4gICAgICBzZXRzOiBudW1iZXI7XG4gICAgICByZXBzOiBudW1iZXI7XG4gICAgICByZXBzTWF4PzogbnVtYmVyO1xuICAgICAgYW1yYXBMYXN0PzogYm9vbGVhbjtcbiAgICAgIC8qKiBcIjYwc1wiLCBcInRvIGZhaWx1cmVcIiwgXCJib2R5d2VpZ2h0XCJcdTIwMjYgKi9cbiAgICAgIG5vdGU/OiBzdHJpbmc7XG4gICAgfTtcblxuZXhwb3J0IGludGVyZmFjZSBTbG90RGVmIHtcbiAgaWQ6IHN0cmluZztcbiAgbGlmdDogc3RyaW5nO1xuICB0aWVyOiBUaWVyO1xuICBwcm9ncmVzc2lvbjogUHJvZ3Jlc3Npb247XG4gIHJlc3RTZWNvbmRzPzogbnVtYmVyO1xuICBub3RlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIERheURlZiB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgc2xvdHM6IFNsb3REZWZbXTtcbiAgLyoqIFByb2dyYW0gd2Vla3MgKDAtYmFzZWQpIHRoaXMgZGF5IGlzIHNjaGVkdWxlZCBpbi4gT21pdCA9IGV2ZXJ5IHdlZWsuICovXG4gIHdlZWtzPzogbnVtYmVyW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUHJvZ3JhbURlZiB7XG4gIHRlbXBsYXRlSWQ6IHN0cmluZztcbiAgbmFtZTogc3RyaW5nO1xuICBkYXlzOiBEYXlEZWZbXTtcbiAgLyoqIFNlc3Npb25zIHBlciBjYWxlbmRhciB3ZWVrLCBmb3IgZGlzcGxheSBhbmQgYWRoZXJlbmNlIHN0YXRzLiAqL1xuICBzZXNzaW9uc1BlcldlZWs6IG51bWJlcjtcbiAgLyoqXG4gICAqIEEgXCJ3ZWVrXCIgaXMgb25lIHBhc3MgdGhyb3VnaCBgZGF5c2AuIFdpdGggYSBjeWNsZSwgd2VlayA9IHBhc3NlcyAlIHdlZWtzICg1LzMvMSkgb3IsIGlmXG4gICAqIGZpbml0ZSwgdGhlIHByb2dyYW0gZW5kcyBhZnRlciBgd2Vla3NgIHBhc3NlcyAoQ2FuZGl0bywgU21vbG92IEpyLCBKdWdnZXJuYXV0KS5cbiAgICovXG4gIGN5Y2xlPzogeyB3ZWVrczogbnVtYmVyOyB0bUluY3JlYXNlPzogUmVjb3JkPHN0cmluZywgV2VpZ2h0cz47IHdlZWtOYW1lcz86IHN0cmluZ1tdOyBmaW5pdGU/OiBib29sZWFuO1xuICAgIC8qKiBhcHBseSB0bUluY3JlYXNlIGV2ZXJ5IE4gd2Vla3MgaW5zdGVhZCBvZiBvbmNlIHBlciBjeWNsZSAod29ya3MgaW5zaWRlIGZpbml0ZSBibG9ja3MgdG9vKSAqL1xuICAgIHRtSW5jcmVhc2VFdmVyeT86IG51bWJlcjtcbiAgICAvKiogYXBwbHkgdG1JbmNyZWFzZSBhdCB0aGUgZW5kIG9mIHRoZXNlIHdlZWtzIG9mIHRoZSBjeWNsZSAoMC1iYXNlZCkgaW5zdGVhZCwgZm9yIHVuZXZlblxuICAgICAqICBwaGFzZXM6IDUvMy8xIEZvcmV2ZXIgTGVhZGVyIFx1MDBENzIgXHUyMTkyIDd0aCB3ZWVrIFx1MjE5MiBBbmNob3IgXHUyMTkyIDd0aCB3ZWVrIGJ1bXBzIGFmdGVyIHdlZWtzIDMsIDYgYW5kIDEwICovXG4gICAgdG1JbmNyZWFzZUF0PzogbnVtYmVyW10gfTtcbiAgLyoqIFRNIGluY3JlbWVudCB1bml0IHBlciBsaWZ0IGZvciBhbXJhcFRhYmxlIC8gYW1yYXBWc1RhcmdldCBpbmNyZW1lbnRzLiAqL1xuICB0bUluY3JlbWVudD86IFJlY29yZDxzdHJpbmcsIFdlaWdodHM+O1xuICAvKiogUm91bmQgcHJlc2NyaWJlZCBsb2FkcyAoYW5kIFRNIGNoYW5nZXMgZnJvbSBpbmNyZW1lbnQgdGFibGVzKSBVUCB0byB0aGUgcGxhdGUgc3RlcCwgbGlrZSBhXG4gICAqICBzaGVldCdzIENFSUxJTkcgKEp1Z2dlcm5hdXQpLiBEZWZhdWx0OiBuZWFyZXN0LiAqL1xuICByb3VuZFVwPzogYm9vbGVhbjtcbiAgLyoqIFdoYXQgdGhlIG1heGVzIGFyZSBjYWxsZWQgaW4gc2V0dXA6IFwiVHJhaW5pbmcgbWF4XCIsIFwiMVJNXCIsIFwiNVJNXCJcdTIwMjYgKi9cbiAgbWF4TGFiZWw/OiBzdHJpbmc7XG4gIG1pY3JvcGxhdGVzPzogYm9vbGVhbjtcbiAgLyoqIFNob3J0IGluc3RydWN0aW9ucyBzaG93biBvbiB0aGUgcHJvZ3JhbSBwYWdlLiAqL1xuICBub3Rlcz86IHN0cmluZ1tdO1xuICAvKiogVGhlIHByb2dyYW0gaXMgaXRzZWxmIGEgcmFtcCBiYWNrIGZyb20gYSBicmVhayAoY29tZWJhY2sgYmxvY2tzKTogbm8gcmUtZW50cnkgcmFtcCBvbiB0b3AuICovXG4gIGJ1aWx0SW5SYW1wPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBPcHRpb25EZWYge1xuICBrZXk6IHN0cmluZztcbiAgbGFiZWw6IHN0cmluZztcbiAgY2hvaWNlczogeyB2YWx1ZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nIH1bXTtcbiAgZGVmYXVsdDogc3RyaW5nO1xufVxuXG4vKiogV2hhdCB0aGUgdXNlciBzZXRzIHVwIG9uY2U6IHdoaWNoIHRlbXBsYXRlLCBvcHRpb25zLCBhbmQgd2hlcmUgdGhleSdyZSBzdGFydGluZyBmcm9tLiAqL1xuZXhwb3J0IGludGVyZmFjZSBQcm9ncmFtQ29uZmlnIHtcbiAgdGVtcGxhdGVJZDogc3RyaW5nO1xuICBvcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICB1bml0OiBVbml0O1xuICAvKiogSVNPIGRhdGUuIFdvcmtvdXRzIGJlZm9yZSB0aGlzIGFyZW4ndCByZXBsYXllZC4gKi9cbiAgc3RhcnREYXRlOiBzdHJpbmc7XG4gIC8qKiBTdGFydGluZyB3ZWlnaHQgcGVyIHN0YWdlIC8gZG91YmxlIC8gZml4ZWQgc2xvdCwgaW4gYHVuaXRgLiAqL1xuICBzdGFydFdlaWdodHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBPcHRpb25hbCBzdGFydGluZyBzdGFnZSBwZXIgc2xvdCAoZS5nLiB5b3UncmUgYWxyZWFkeSBvbiA2eDIrKS4gKi9cbiAgc3RhcnRTdGFnZXM/OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICAvKiogVHJhaW5pbmcgbWF4IHBlciBsaWZ0LCBpbiBgdW5pdGAuICovXG4gIHRyYWluaW5nTWF4ZXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBQZXItc2xvdCBpbmNyZW1lbnQgb3ZlcnJpZGUsIGluIGB1bml0YC4gKi9cbiAgaW5jcmVtZW50cz86IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBMaWZ0IGtleSAtPiBIZXZ5IGV4ZXJjaXNlX3RlbXBsYXRlX2lkLCBvdmVycmlkaW5nIHRpdGxlIG1hdGNoaW5nLiAqL1xuICBsaWZ0TWFwPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcbiAgLyoqIEhldnkgcm91dGluZSBpZCAtPiBkYXkgaWQsIHJlY29yZGVkIHdoZW4gd2UgcHVzaCByb3V0aW5lcy4gKi9cbiAgcm91dGluZURheXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuICAvKiogTWFudWFsIGNvcnJlY3Rpb25zIGFwcGxpZWQgd2hlbiByZXBsYXkgcmVhY2hlcyBgZGF0ZWAuICovXG4gIGFkanVzdG1lbnRzPzogQWRqdXN0bWVudFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFkanVzdG1lbnQge1xuICBkYXRlOiBzdHJpbmc7XG4gIHNsb3RJZD86IHN0cmluZztcbiAgd2VpZ2h0PzogbnVtYmVyO1xuICBzdGFnZT86IG51bWJlcjtcbiAgbGlmdD86IHN0cmluZztcbiAgdG0/OiBudW1iZXI7XG4gIG5vdGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCB0eXBlIFByb2dyYW1DYXRlZ29yeSA9IFwiZ3pjbFwiIHwgXCJub3ZpY2VcIiB8IFwic3RyZW5ndGhcIiB8IFwicG93ZXJsaWZ0aW5nXCIgfCBcImh5cGVydHJvcGh5XCIgfCBcInBlYWtpbmdcIiB8IFwiYm9keXdlaWdodFwiIHwgXCJjb21lYmFja1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFByb2dyYW1UZW1wbGF0ZSB7XG4gIGlkOiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgYXV0aG9yOiBzdHJpbmc7XG4gIHNvdXJjZTogc3RyaW5nO1xuICBzdW1tYXJ5OiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBQcm9ncmFtQ2F0ZWdvcnk7XG4gIGxldmVsOiBcImJlZ2lubmVyXCIgfCBcImludGVybWVkaWF0ZVwiIHwgXCJhZHZhbmNlZFwiO1xuICAvKiogZS5nLiBbM10gb3IgWzMsIDRdICovXG4gIGRheXNQZXJXZWVrOiBudW1iZXJbXTtcbiAgLyoqIExlbmd0aCBvZiBvbmUgcnVuIGluIHdlZWtzOyBvbWl0IGZvciBvcGVuLWVuZGVkIHByb2dyYW1zLiAqL1xuICB3ZWVrcz86IG51bWJlcjtcbiAgLyoqIFdoYXQgdG8gcnVuIHdoZW4gdGhpcyBvbmUgZW5kcyBvciBzdGFsbHMgZm9yIGdvb2QgKHNob3duIG9uIHRoZSBwcm9ncmFtIHBhZ2UpLiAqL1xuICB0aGVuPzogUHJvZ3JhbU5leHQ7XG4gIG9wdGlvbnM6IE9wdGlvbkRlZltdO1xuICBidWlsZChvcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvZ3JhbURlZjtcbiAgLyoqIFJlYXNvbmFibGUgc3RhcnRpbmcgdmFsdWVzIHRvIHByZWZpbGwgc2V0dXAgd2l0aC4gKi9cbiAgZGVmYXVsdHM/KHVuaXQ6IFVuaXQpOiBQYXJ0aWFsPFBpY2s8UHJvZ3JhbUNvbmZpZywgXCJzdGFydFdlaWdodHNcIiB8IFwidHJhaW5pbmdNYXhlc1wiIHwgXCJpbmNyZW1lbnRzXCI+Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQcm9ncmFtTmV4dCB7XG4gIC8qKiB0ZW1wbGF0ZSB0byBtb3ZlIHRvLCB3aGVuIHRoZXJlIGlzIG9uZSBpbiB0aGUgY2F0YWxvZyAqL1xuICBpZD86IHN0cmluZztcbiAgLyoqIHdoZW4gYW5kIHdoeSwgb25lIHNlbnRlbmNlOiBcIldoZW4gcmVzZXRzIHN0b3Agd29ya2luZywgbW92ZSB0byB0aGUgVGV4YXMgTWV0aG9kLlwiICovXG4gIHdoZW46IHN0cmluZztcbn1cblxuLyoqXG4gKiBIb3cgbG9uZyBhIHByb2dyYW0gcnVuczpcbiAqICAgYmxvY2sgICAgYSBmaXhlZCBudW1iZXIgb2Ygd2Vla3MsIHRoZW4gaXQncyBkb25lIChTbW9sb3YgSnIsIENhbmRpdG8sIFNCUylcbiAqICAgY3ljbGVzICAgYSBjeWNsZSBvZiB3ZWVrcyB0aGF0IHJlcGVhdHMgZm9yZXZlciwgbWF4ZXMgcmlzaW5nIGVhY2ggdGltZSByb3VuZCAoNS8zLzEpXG4gKiAgIG9uZ29pbmcgIG5vIHdlZWtzIGF0IGFsbDogcHJvZ3Jlc3Mgc2Vzc2lvbiB0byBzZXNzaW9uIHVudGlsIHlvdSBzdGFsbCAoR1pDTFAsIFN0cm9uZ0xpZnRzKVxuICovXG5leHBvcnQgdHlwZSBMZW5ndGhLaW5kID0gXCJibG9ja1wiIHwgXCJjeWNsZXNcIiB8IFwib25nb2luZ1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gcHJvZ3JhbUxlbmd0aCh0OiBQcm9ncmFtVGVtcGxhdGUpOiB7IGtpbmQ6IExlbmd0aEtpbmQ7IHdlZWtzOiBudW1iZXIgfCBudWxsIH0ge1xuICBpZiAodC53ZWVrcykgcmV0dXJuIHsga2luZDogXCJibG9ja1wiLCB3ZWVrczogdC53ZWVrcyB9O1xuICBjb25zdCBjID0gdC5idWlsZChPYmplY3QuZnJvbUVudHJpZXModC5vcHRpb25zLm1hcCgobykgPT4gW28ua2V5LCBvLmRlZmF1bHRdKSkpLmN5Y2xlO1xuICBpZiAoYz8uZmluaXRlKSByZXR1cm4geyBraW5kOiBcImJsb2NrXCIsIHdlZWtzOiBjLndlZWtzIH07XG4gIGlmIChjICYmIGMud2Vla3MgPiAxKSByZXR1cm4geyBraW5kOiBcImN5Y2xlc1wiLCB3ZWVrczogYy53ZWVrcyB9O1xuICByZXR1cm4geyBraW5kOiBcIm9uZ29pbmdcIiwgd2Vla3M6IG51bGwgfTtcbn1cblxuLyoqIFwiMTItV0VFSyBCTE9DS1wiIFx1MDBCNyBcIkNZQ0xFUyBGT1JFVkVSXCIgXHUwMEI3IFwiT05HT0lOR1wiICovXG5leHBvcnQgZnVuY3Rpb24gbGVuZ3RoVGFnKGw6IHsga2luZDogTGVuZ3RoS2luZDsgd2Vla3M6IG51bWJlciB8IG51bGwgfSk6IHN0cmluZyB7XG4gIHJldHVybiBsLmtpbmQgPT09IFwiYmxvY2tcIiA/IGAke2wud2Vla3N9LVdFRUsgQkxPQ0tgIDogbC5raW5kID09PSBcImN5Y2xlc1wiID8gXCJDWUNMRVMgRk9SRVZFUlwiIDogXCJPTkdPSU5HXCI7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBzdGF0ZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGludGVyZmFjZSBTbG90U3RhdGUge1xuICB3ZWlnaHQ6IG51bWJlcjtcbiAgc3RhZ2U6IG51bWJlcjtcbiAgLyoqIHdlaWdodCBzdGFnZSAwIHdhcyBsYXN0IGRvbmUgYXQgKEdaQ0xQIFQyIHJlc2V0cyB0byBcInNsaWdodGx5IGhlYXZpZXIgdGhhbiB5b3VyIGxhc3QgM1x1MDBENzEwXCIpICovXG4gIHN0YWdlMFdlaWdodDogbnVtYmVyO1xuICByZXRlc3Q6IGJvb2xlYW47XG4gIC8qKiBjb25zZWN1dGl2ZSBmYWlsZWQgc2Vzc2lvbnMgYXQgdGhlIGN1cnJlbnQgd2VpZ2h0ICovXG4gIGZhaWxzPzogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBPdXRjb21lID0gXCJzdWNjZXNzXCIgfCBcImhvbGRcIiB8IFwiZmFpbFwiIHwgXCJzdGFnZS1kb3duXCIgfCBcImRlbG9hZFwiIHwgXCJyZXRlc3QtbmV4dFwiIHwgXCJyZXRlc3RlZFwiIHwgXCJyZXNldFwiIHwgXCJ0bS11cFwiIHwgXCJ0bS1kb3duXCIgfCBcIm1pc3NlZFwiO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNsb3RSZXN1bHQge1xuICBzbG90SWQ6IHN0cmluZztcbiAgbGlmdDogc3RyaW5nO1xuICB0aWVyOiBUaWVyO1xuICBzY2hlbWU6IHN0cmluZztcbiAgd2VpZ2h0OiBudW1iZXI7XG4gIG91dGNvbWU6IE91dGNvbWU7XG4gIHJlcHM6IG51bWJlcltdO1xuICBhbXJhcFJlcHM/OiBudW1iZXI7XG4gIG5vdGU6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBMb2dFbnRyeSB7XG4gIHdvcmtvdXRJZDogc3RyaW5nO1xuICBkYXRlOiBzdHJpbmc7XG4gIGRheUlkOiBzdHJpbmc7XG4gIHdlZWs6IG51bWJlcjtcbiAgcmVzdWx0czogU2xvdFJlc3VsdFtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb2dyYW1TdGF0ZSB7XG4gIGRheUluZGV4OiBudW1iZXI7XG4gIC8qKiBjb21wbGV0ZWQgcGFzc2VzIHRocm91Z2ggdGhlIGRheSBsaXN0IChcIndlZWtzXCIpICovXG4gIHJvdGF0aW9uczogbnVtYmVyO1xuICBzbG90czogUmVjb3JkPHN0cmluZywgU2xvdFN0YXRlPjtcbiAgdG1zOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xuICBsb2c6IExvZ0VudHJ5W107XG4gIC8qKiBmaW5pdGUgcHJvZ3JhbXM6IGFsbCB3ZWVrcyBkb25lICovXG4gIGNvbXBsZXRlPzogYm9vbGVhbjtcbiAgLyoqIFRNIGNoYW5nZXMgd2FpdGluZyBmb3IgdGhlIGVuZCBvZiB0aGUgY3VycmVudCB3ZWVrICh0bVJ1bGUgYXBwbHlBdDogXCJ3ZWVrRW5kXCIpICovXG4gIHBlbmRpbmdUbT86IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBUTSBjaGFuZ2VzIHRoYXQgd2FpdCBvbmUgbW9yZSB3ZWVrIChhcHBseUF0OiBcImFmdGVyTmV4dFdlZWtcIik7IHRoZXkgbW92ZSB0byBwZW5kaW5nVG0gYXQgdGhlIG5leHQgd2VlayBlbmQgKi9cbiAgcGVuZGluZ1RtTmV4dD86IFJlY29yZDxzdHJpbmcsIG51bWJlcj47XG4gIC8qKiBjb21pbmcgYmFjayBmcm9tIGEgYnJlYWs6IHRoZSBuZXh0IGB0b3RhbCBcdTIyMTIgZG9uZWAgc2Vzc2lvbnMgYXJlIGEgbGlnaHRlciByYW1wICovXG4gIHJlZW50cnk/OiBSZWVudHJ5O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZW50cnkge1xuICBnYXBEYXlzOiBudW1iZXI7XG4gIC8qKiByYW1wIHNlc3Npb25zIHBsYW5uZWQgKGVub3VnaCBmb3IgZXZlcnkgbWFpbiBsaWZ0IHRvIGdldCBpdHMgZXhwb3N1cmVzLCBjYXBwZWQpICovXG4gIHRvdGFsOiBudW1iZXI7XG4gIGRvbmU6IG51bWJlcjtcbiAgLyoqIHJhbXAgZXhwb3N1cmVzIHNvIGZhciBwZXIgbGlmdDsgYSBsaWZ0IHRoYXQgaGl0IGl0cyBub3JtYWwgd2VpZ2h0IGp1bXBzIHRvIGl0cyBuZWVkICovXG4gIHNlZW4/OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5uZWRTZXQge1xuICB3ZWlnaHQ6IG51bWJlcjtcbiAgcmVwczogbnVtYmVyO1xuICByZXBzTWF4PzogbnVtYmVyO1xuICBhbXJhcDogYm9vbGVhbjtcbiAgcGN0PzogbnVtYmVyO1xuICBycGU/OiBudW1iZXI7XG4gIC8qKiBwY3QgaXMgb2YgdG9kYXkncyB0b3Atc2V0IGUxUk0sIGxvYWQgY2hvc2VuIG9uIHRoZSBkYXkgKi9cbiAgb2ZUb3A/OiBib29sZWFuO1xuICAvKiogbG9hZCBlc3RpbWF0ZWQgZnJvbSB5b3VyIFJQRSBjaGFydCAoUlBFLW9ubHkgc2V0KSAqL1xuICBlc3Q/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5uZWRFeGVyY2lzZSB7XG4gIHNsb3RJZDogc3RyaW5nO1xuICBsaWZ0OiBzdHJpbmc7XG4gIHRpZXI6IFRpZXI7XG4gIHNjaGVtZTogc3RyaW5nO1xuICBzZXRzOiBQbGFubmVkU2V0W107XG4gIHJlc3RTZWNvbmRzOiBudW1iZXI7XG4gIC8qKiBlLmcuIFwiUmV0ZXN0IDVSTTogd29yayB1cCB0byBhIGhhcmQgc2V0IG9mIDVcIiAqL1xuICBub3RlPzogc3RyaW5nO1xuICAvKiogd2hhdCBoYXBwZW5zIG5leHQsIGUuZy4gXCJIaXQgMTUgcmVwcyBcdTIxOTIgMTkwIG5leHQgdGltZVwiICovXG4gIGlmU3VjY2Vzcz86IHN0cmluZztcbiAgaWZGYWlsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBsYW5uZWRTZXNzaW9uIHtcbiAgZGF5SW5kZXg6IG51bWJlcjtcbiAgZGF5SWQ6IHN0cmluZztcbiAgZGF5TmFtZTogc3RyaW5nO1xuICB3ZWVrOiBudW1iZXI7XG4gIHdlZWtOYW1lPzogc3RyaW5nO1xuICBleGVyY2lzZXM6IFBsYW5uZWRFeGVyY2lzZVtdO1xufVxuXG4vLyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDAgaGVscGVycyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3QgaW5jID0gKHc6IFdlaWdodHMsIHVuaXQ6IFVuaXQpID0+ICh1bml0ID09PSBcImxiXCIgPyB3LmxiIDogdy5rZyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzbG90SW5jcmVtZW50KGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzbG90OiBTbG90RGVmKTogbnVtYmVyIHtcbiAgY29uc3QgbyA9IGNmZy5pbmNyZW1lbnRzPy5bc2xvdC5pZF07XG4gIGlmIChvICE9IG51bGwpIHJldHVybiBvO1xuICBjb25zdCBwID0gc2xvdC5wcm9ncmVzc2lvbjtcbiAgcmV0dXJuIHAua2luZCA9PT0gXCJzdGFnZXNcIiB8fCBwLmtpbmQgPT09IFwiZG91YmxlXCIgPyBpbmMocC5pbmNyZW1lbnQsIGNmZy51bml0KSA6IDA7XG59XG5cbmZ1bmN0aW9uIHN0ZXAoZGVmOiBQcm9ncmFtRGVmLCBjZmc6IFByb2dyYW1Db25maWcsIGxpZnQ6IHN0cmluZykge1xuICByZXR1cm4gbG9hZFN0ZXAoTElGVFNbbGlmdF0/LmtpbmQgPz8gXCJiYXJiZWxsXCIsIGNmZy51bml0LCBkZWYubWljcm9wbGF0ZXMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2NoZW1lTGFiZWwoc3Q6IFN0YWdlKTogc3RyaW5nIHtcbiAgcmV0dXJuIGAke3N0LnNldHN9XHUwMEQ3JHtzdC5yZXBzfSR7c3QuYW1yYXAgPyBcIitcIiA6IFwiXCJ9YDtcbn1cblxuLyoqIFNsb3RzIHRoYXQgbmVlZCBhIHN0YXJ0aW5nIHdlaWdodCAodnMgYSB0cmFpbmluZyBtYXgpLiAqL1xuZXhwb3J0IGNvbnN0IHVzZXNTdGFydFdlaWdodCA9IChzOiBTbG90RGVmKSA9PiBzLnByb2dyZXNzaW9uLmtpbmQgIT09IFwicGVyY2VudFwiO1xuXG4vKiogUHJvZ3JhbSB3ZWVrIGluZGV4IGZvciBhIG51bWJlciBvZiBjb21wbGV0ZWQgcGFzc2VzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdlZWtJbmRleChkZWY6IFByb2dyYW1EZWYsIHJvdGF0aW9uczogbnVtYmVyKTogbnVtYmVyIHtcbiAgaWYgKCFkZWYuY3ljbGUpIHJldHVybiAwO1xuICByZXR1cm4gZGVmLmN5Y2xlLmZpbml0ZSA/IE1hdGgubWluKHJvdGF0aW9ucywgZGVmLmN5Y2xlLndlZWtzIC0gMSkgOiByb3RhdGlvbnMgJSBkZWYuY3ljbGUud2Vla3M7XG59XG5cbmV4cG9ydCBjb25zdCBpc1NjaGVkdWxlZCA9IChkYXk6IERheURlZiwgd2VlazogbnVtYmVyKSA9PiAhZGF5LndlZWtzIHx8IGRheS53ZWVrcy5pbmNsdWRlcyh3ZWVrKTtcblxuLyoqIEV2ZXJ5IHNsb3Qgb25jZSAoYSBzbG90IGlkIGNhbiBhcHBlYXIgb24gc2V2ZXJhbCBkYXlzIGFuZCBzaGFyZSBvbmUgcHJvZ3Jlc3Npb24pLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFsbFNsb3RzKGRlZjogUHJvZ3JhbURlZik6IFNsb3REZWZbXSB7XG4gIGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcmV0dXJuIGRlZi5kYXlzLmZsYXRNYXAoKGQpID0+IGQuc2xvdHMpLmZpbHRlcigocykgPT4gIXNlZW4uaGFzKHMuaWQpICYmICEhc2Vlbi5hZGQocy5pZCkpO1xufVxuXG4vKiogRmlyc3Qgc2NoZWR1bGVkIGRheSBhdCBvciBhZnRlciBgZnJvbWAgaW4gcGFzcyBgcm90YXRpb25zYCwgd3JhcHBpbmcgaW50byBsYXRlciBwYXNzZXMuICovXG5leHBvcnQgZnVuY3Rpb24gZmlyc3RTY2hlZHVsZWQoZGVmOiBQcm9ncmFtRGVmLCBmcm9tOiBudW1iZXIsIHJvdGF0aW9uczogbnVtYmVyKTogeyBkYXlJbmRleDogbnVtYmVyOyByb3RhdGlvbnM6IG51bWJlciB9IHtcbiAgbGV0IGkgPSBmcm9tLCByID0gcm90YXRpb25zO1xuICBmb3IgKGxldCBndWFyZCA9IDA7IGd1YXJkIDwgZGVmLmRheXMubGVuZ3RoICogKChkZWYuY3ljbGU/LndlZWtzID8/IDEpICsgMik7IGd1YXJkKyspIHtcbiAgICBpZiAoaSA+PSBkZWYuZGF5cy5sZW5ndGgpIHsgaSA9IDA7IHIrKzsgfVxuICAgIGlmIChpc1NjaGVkdWxlZChkZWYuZGF5c1tpXSwgd2Vla0luZGV4KGRlZiwgcikpKSByZXR1cm4geyBkYXlJbmRleDogaSwgcm90YXRpb25zOiByIH07XG4gICAgaSsrO1xuICB9XG4gIHJldHVybiB7IGRheUluZGV4OiAwLCByb3RhdGlvbnMgfTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGluaXQgLyBwbGFuIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbFN0YXRlKGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnKTogUHJvZ3JhbVN0YXRlIHtcbiAgY29uc3Qgc2xvdHM6IFJlY29yZDxzdHJpbmcsIFNsb3RTdGF0ZT4gPSB7fTtcbiAgZm9yIChjb25zdCBzIG9mIGFsbFNsb3RzKGRlZikpIHtcbiAgICBpZiAoIXVzZXNTdGFydFdlaWdodChzKSkgY29udGludWU7XG4gICAgY29uc3QgdyA9IGNmZy5zdGFydFdlaWdodHNbcy5pZF0gPz8gMDtcbiAgICBzbG90c1tzLmlkXSA9IHsgd2VpZ2h0OiB3LCBzdGFnZTogY2ZnLnN0YXJ0U3RhZ2VzPy5bcy5pZF0gPz8gMCwgc3RhZ2UwV2VpZ2h0OiB3LCByZXRlc3Q6IGZhbHNlLCBmYWlsczogMCB9O1xuICB9XG4gIGNvbnN0IHN0YXJ0ID0gZmlyc3RTY2hlZHVsZWQoZGVmLCAwLCAwKTtcbiAgcmV0dXJuIHsgZGF5SW5kZXg6IHN0YXJ0LmRheUluZGV4LCByb3RhdGlvbnM6IHN0YXJ0LnJvdGF0aW9ucywgc2xvdHMsIHRtczogeyAuLi5jZmcudHJhaW5pbmdNYXhlcyB9LCBsb2c6IFtdIH07XG59XG5cbmZ1bmN0aW9uIGRlZmF1bHRSZXN0KHQ6IFRpZXIpIHtcbiAgcmV0dXJuIHQgPT09IFwiVDFcIiB8fCB0ID09PSBcIk1BSU5cIiA/IDE4MCA6IHQgPT09IFwiVDJcIiB8fCB0ID09PSBcIlNVUFBcIiA/IDEyMCA6IDc1O1xufVxuXG5mdW5jdGlvbiBzZXRzTGFiZWwoc2V0czogUGxhbm5lZFNldFtdKTogc3RyaW5nIHtcbiAgLy8gXCI1XHUwMEQ3NVwiLCBcIjNcdTAwRDc4XHUyMDEzMTJcIiwgXCI5IHNldHMgXHUwMEI3IDErIDUrXCIsIFwiM1x1MDBENzMgQDhcIlxuICBpZiAoIXNldHMubGVuZ3RoKSByZXR1cm4gXCJcIjtcbiAgY29uc3Qgc2FtZSA9IHNldHMuZXZlcnkoKHMpID0+IHMucmVwcyA9PT0gc2V0c1swXS5yZXBzICYmIHMucmVwc01heCA9PT0gc2V0c1swXS5yZXBzTWF4ICYmIHMud2VpZ2h0ID09PSBzZXRzWzBdLndlaWdodCAmJiBzLnJwZSA9PT0gc2V0c1swXS5ycGUpO1xuICBjb25zdCByID0gKHM6IFBsYW5uZWRTZXQpID0+IGAke3MucmVwc30ke3MucmVwc01heCA/IFwiXHUyMDEzXCIgKyBzLnJlcHNNYXggOiBcIlwifWA7XG4gIGNvbnN0IGFtcmFwcyA9IHNldHMuZmlsdGVyKChzKSA9PiBzLmFtcmFwKTtcbiAgaWYgKHNhbWUpIHJldHVybiBgJHtzZXRzLmxlbmd0aH1cdTAwRDcke3Ioc2V0c1swXSl9JHthbXJhcHMubGVuZ3RoID8gXCIrXCIgOiBcIlwifSR7c2V0c1swXS5ycGUgPyBgIEAke3NldHNbMF0ucnBlfWAgOiBcIlwifWA7XG4gIHJldHVybiBgJHtzZXRzLmxlbmd0aH0gc2V0cyR7YW1yYXBzLmxlbmd0aCA/IFwiIFx1MDBCNyBcIiArIGFtcmFwcy5tYXAoKHMpID0+IGAke3MucmVwc30rYCkuam9pbihcIiBcIikgOiBcIlwifWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFuRGF5KGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzdGF0ZTogUHJvZ3JhbVN0YXRlLCBkYXlJbmRleCA9IHN0YXRlLmRheUluZGV4KTogUGxhbm5lZFNlc3Npb24ge1xuICBjb25zdCBkYXkgPSBkZWYuZGF5c1tkYXlJbmRleF07XG4gIGNvbnN0IHdlZWsgPSB3ZWVrSW5kZXgoZGVmLCBzdGF0ZS5yb3RhdGlvbnMpO1xuICBjb25zdCBleGVyY2lzZXMgPSBkYXkuc2xvdHMubWFwKChzbG90KTogUGxhbm5lZEV4ZXJjaXNlID0+IHtcbiAgICBjb25zdCByZXN0ID0gc2xvdC5yZXN0U2Vjb25kcyA/PyBkZWZhdWx0UmVzdChzbG90LnRpZXIpO1xuICAgIGNvbnN0IGJhc2UgPSB7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHJlc3RTZWNvbmRzOiByZXN0IH07XG4gICAgY29uc3QgcCA9IHNsb3QucHJvZ3Jlc3Npb247XG4gICAgY29uc3QgcyA9IHN0YXRlLnNsb3RzW3Nsb3QuaWRdO1xuICAgIGNvbnN0IGkgPSBzbG90SW5jcmVtZW50KGRlZiwgY2ZnLCBzbG90KTtcblxuICAgIGlmIChwLmtpbmQgPT09IFwic3RhZ2VzXCIpIHtcbiAgICAgIGNvbnN0IHN0ID0gcC5zdGFnZXNbcy5zdGFnZV07XG4gICAgICBpZiAocy5yZXRlc3QgJiYgcC5vbkZpbmFsRmFpbC50eXBlID09PSBcInJldGVzdFwiKSB7XG4gICAgICAgIGNvbnN0IHsgcm1SZXBzLCBwY3QgfSA9IHAub25GaW5hbEZhaWw7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uYmFzZSwgc2NoZW1lOiBgJHtybVJlcHN9Uk0gVEVTVGAsIHNldHM6IFt7IHdlaWdodDogMCwgcmVwczogcm1SZXBzLCBhbXJhcDogZmFsc2UgfV0sXG4gICAgICAgICAgbm90ZTogYFJldGVzdDogd29yayB1cCB0byBhIGhhcmQgc2V0IG9mICR7cm1SZXBzfS4gTmV3ICR7c2xvdC50aWVyfSB3ZWlnaHQgPSAke01hdGgucm91bmQocGN0ICogMTAwKX0lIG9mIGl0LmAsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBjb25zdCBzZXRzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogc3Quc2V0cyB9LCAoXywgaykgPT4gKHsgd2VpZ2h0OiBzLndlaWdodCwgcmVwczogc3QucmVwcywgYW1yYXA6IHN0LmFtcmFwICYmIGsgPT09IHN0LnNldHMgLSAxIH0pKTtcbiAgICAgIGNvbnN0IGxhc3QgPSBzLnN0YWdlID09PSBwLnN0YWdlcy5sZW5ndGggLSAxO1xuICAgICAgY29uc3QgZmFpbHMgPSBzLmZhaWxzID8/IDA7XG4gICAgICBjb25zdCBhbGxvd2VkID0gcC5mYWlsc0JlZm9yZUFjdGlvbiA/PyAxO1xuICAgICAgbGV0IGlmU3VjY2Vzczogc3RyaW5nLCBpZkZhaWw6IHN0cmluZztcbiAgICAgIGlmIChwLmNsaW1iKSB7XG4gICAgICAgIGNvbnN0IG54ID0gcC5zdGFnZXNbcy5zdGFnZSArIDFdO1xuICAgICAgICBjb25zdCB1cCA9IHJvdW5kVG8ocy53ZWlnaHQgKiAoMSArIHAuY2xpbWIubG9hZFBjdCksIHN0ZXAoZGVmLCBjZmcsIHNsb3QubGlmdCkpO1xuICAgICAgICBpZlN1Y2Nlc3MgPSBueCA/IGBhbGwgJHtzdC5zZXRzICogc3QucmVwc30gcmVwcyBcdTIxOTIgJHtzY2hlbWVMYWJlbChueCl9IEAgJHtmbXQocy53ZWlnaHQpfWAgOiBzLndlaWdodCA+IDAgJiYgcC5jbGltYi5sb2FkUGN0ID4gMCA/IGBhbGwgJHtzdC5zZXRzICogc3QucmVwc30gcmVwcyBcdTIxOTIgJHtzY2hlbWVMYWJlbChwLnN0YWdlc1swXSl9IEAgJHtmbXQodXApfWAgOiBgYWxsIHJlcHMgXHUyMTkyIHN0YXkgYXQgJHtzY2hlbWVMYWJlbChzdCl9YDtcbiAgICAgICAgaWZGYWlsID0gYG1pc3MgXHUyMTkyIHJlcGVhdCAke3NjaGVtZUxhYmVsKHN0KX0gQCAke2ZtdChzLndlaWdodCl9YDtcbiAgICAgIH0gZWxzZSBpZiAocC5hZHZhbmNlLnR5cGUgPT09IFwiYW1yYXBBdExlYXN0XCIpIHtcbiAgICAgICAgaWZTdWNjZXNzID0gYCR7c3Quc2V0cyA+IDEgPyBgJHtBcnJheShzdC5zZXRzIC0gMSkuZmlsbChzdC5yZXBzKS5qb2luKFwiL1wiKX0vYCA6IFwiXCJ9JHtwLmFkdmFuY2UucmVwc30rIFx1MjE5MiAke2ZtdChzLndlaWdodCArIGkpfWA7XG4gICAgICAgIGlmRmFpbCA9IGBmZXdlciBcdTIxOTIgc3RheSBhdCAke2ZtdChzLndlaWdodCl9YDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmU3VjY2VzcyA9IGAke3N0LnNldHMgKiBzdC5yZXBzfSByZXBzIFx1MjE5MiAke2ZtdChzLndlaWdodCArIGkpfWA7XG4gICAgICAgIGlmIChwLmFtcmFwQm9udXMpIGlmU3VjY2VzcyArPSBgICgke3AuYW1yYXBCb251cy5yZXBzfSsgb24gbGFzdCBcdTIxOTIgJHtmbXQocy53ZWlnaHQgKyBpICogcC5hbXJhcEJvbnVzLmluY3JlbWVudHMpfSlgO1xuICAgICAgICBpZiAoZmFpbHMgKyAxIDwgYWxsb3dlZCkgaWZGYWlsID0gYG1pc3MgXHUyMTkyIHJldHJ5ICR7Zm10KHMud2VpZ2h0KX0gKCR7ZmFpbHMgKyAxfS8ke2FsbG93ZWR9KWA7XG4gICAgICAgIGVsc2UgaWYgKCFsYXN0KSBpZkZhaWwgPSBgbWlzcyBcdTIxOTIgJHtzY2hlbWVMYWJlbChwLnN0YWdlc1tzLnN0YWdlICsgMV0pfSBAICR7Zm10KHMud2VpZ2h0KX1gO1xuICAgICAgICBlbHNlIGlmIChwLm9uRmluYWxGYWlsLnR5cGUgPT09IFwicmV0ZXN0XCIpIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiByZXRlc3QgJHtwLm9uRmluYWxGYWlsLnJtUmVwc31STWA7XG4gICAgICAgIGVsc2UgaWYgKHAub25GaW5hbEZhaWwudHlwZSA9PT0gXCJyZXNldFwiKSBpZkZhaWwgPSBgbWlzcyBcdTIxOTIgcmVzZXQgJHtzY2hlbWVMYWJlbChwLnN0YWdlc1swXSl9IEAgJHtmbXQocy5zdGFnZTBXZWlnaHQgKyBwLm9uRmluYWxGYWlsLmJ1bXBJbmNyZW1lbnRzICogaSl9YDtcbiAgICAgICAgZWxzZSBpZiAocC5vbkZpbmFsRmFpbC50eXBlID09PSBcImRlbG9hZFwiKSBpZkZhaWwgPSBgbWlzcyBcdTIxOTIgZGVsb2FkIHRvICR7Zm10KHJvdW5kVG8ocy53ZWlnaHQgKiAoMSAtIHAub25GaW5hbEZhaWwucGN0KSwgc3RlcChkZWYsIGNmZywgc2xvdC5saWZ0KSkpfWA7XG4gICAgICAgIGVsc2UgaWYgKHAub25GaW5hbEZhaWwudHlwZSA9PT0gXCJkZWxvYWRCeVwiKSBpZkZhaWwgPSBgbWlzcyBcdTIxOTIgZHJvcCB0byAke2ZtdChzLndlaWdodCAtIGluYyhwLm9uRmluYWxGYWlsLmFtb3VudCwgY2ZnLnVuaXQpKX1gO1xuICAgICAgICBlbHNlIGlmRmFpbCA9IGBtaXNzIFx1MjE5MiBzdGF5YDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB7IC4uLmJhc2UsIHNjaGVtZTogc2NoZW1lTGFiZWwoc3QpLCBzZXRzLCBpZlN1Y2Nlc3MsIGlmRmFpbCwgbm90ZTogc2xvdC5ub3RlIH07XG4gICAgfVxuXG4gICAgaWYgKHAua2luZCA9PT0gXCJkb3VibGVcIikge1xuICAgICAgY29uc3QgW2xvLCBoaV0gPSBwLnJlcHM7XG4gICAgICBjb25zdCBzZXRzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogcC5zZXRzIH0sIChfLCBrKSA9PiAoeyB3ZWlnaHQ6IHMud2VpZ2h0LCByZXBzOiBsbywgcmVwc01heDogaGksIGFtcmFwOiAhIXAuYW1yYXBMYXN0ICYmIGsgPT09IHAuc2V0cyAtIDEgfSkpO1xuICAgICAgcmV0dXJuIHsgLi4uYmFzZSwgc2NoZW1lOiBgJHtwLnNldHN9XHUwMEQ3JHtsb31cdTIwMTMke2hpfSR7cC5hbXJhcExhc3QgPyBcIitcIiA6IFwiXCJ9YCwgc2V0cywgaWZTdWNjZXNzOiBgYWxsIHNldHMgJHtoaX0rIFx1MjE5MiAke2ZtdChzLndlaWdodCArIGkpfWAsIGlmRmFpbDogYGZld2VyIFx1MjE5MiBhZGQgcmVwcyBhdCAke2ZtdChzLndlaWdodCl9YCwgbm90ZTogc2xvdC5ub3RlIH07XG4gICAgfVxuXG4gICAgaWYgKHAua2luZCA9PT0gXCJmaXhlZFwiKSB7XG4gICAgICBjb25zdCBzZXRzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogcC5zZXRzIH0sIChfLCBrKSA9PiAoeyB3ZWlnaHQ6IHMud2VpZ2h0LCByZXBzOiBwLnJlcHMsIHJlcHNNYXg6IHAucmVwc01heCwgYW1yYXA6ICEhcC5hbXJhcExhc3QgJiYgayA9PT0gcC5zZXRzIC0gMSB9KSk7XG4gICAgICByZXR1cm4geyAuLi5iYXNlLCBzY2hlbWU6IHNldHNMYWJlbChzZXRzKSwgc2V0cywgbm90ZTogW3Aubm90ZSwgc2xvdC5ub3RlXS5maWx0ZXIoQm9vbGVhbikuam9pbihcIiBcdTAwQjcgXCIpIHx8IHVuZGVmaW5lZCB9O1xuICAgIH1cblxuICAgIGNvbnN0IHRtID0gc3RhdGUudG1zW3AudG1MaWZ0XSA/PyAwO1xuICAgIGNvbnN0IHRhYmxlID0gcC53ZWVrc1t3ZWVrICUgcC53ZWVrcy5sZW5ndGhdID8/IFtdO1xuICAgIGNvbnN0IHNldHM6IFBsYW5uZWRTZXRbXSA9IHRhYmxlLm1hcCgocHMpID0+ICh7XG4gICAgICB3ZWlnaHQ6IHBzLnBjdCAhPSBudWxsICYmICFwcy5vZlRvcCA/IChkZWYucm91bmRVcCA/IGNlaWxUbyA6IHJvdW5kVG8pKHRtICogcHMucGN0ICsgKHBzLmFkZCA/IGluYyhwcy5hZGQsIGNmZy51bml0KSA6IDApLCBzdGVwKGRlZiwgY2ZnLCBzbG90LmxpZnQpKSA6IDAsXG4gICAgICByZXBzOiBwcy5yZXBzLCByZXBzTWF4OiBwcy5yZXBzTWF4LCBhbXJhcDogISFwcy5hbXJhcCwgcGN0OiBwcy5wY3QsIHJwZTogcHMucnBlLCBvZlRvcDogcHMub2ZUb3AsXG4gICAgfSkpO1xuICAgIGxldCBpZlN1Y2Nlc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBjb25zdCB0bWkgPSBkZWYudG1JbmNyZW1lbnQ/LltwLnRtTGlmdF0gPyBpbmMoZGVmLnRtSW5jcmVtZW50W3AudG1MaWZ0XSwgY2ZnLnVuaXQpIDogY2ZnLnVuaXQgPT09IFwibGJcIiA/IDUgOiAyLjU7XG4gICAgaWYgKHAudG1SdWxlPy50eXBlID09PSBcImFtcmFwVGFibGVcIikge1xuICAgICAgaWZTdWNjZXNzID0gcC50bVJ1bGUudGFibGUuZmlsdGVyKChyKSA9PiByLmluY3JlbWVudHMgPiAwKS5tYXAoKHIpID0+IGAke3IubWluUmVwc30rIFx1MjE5MiBUTSArJHtmbXQoci5pbmNyZW1lbnRzICogdG1pKX1gKS5qb2luKFwiIFx1MDBCNyBcIik7XG4gICAgfSBlbHNlIGlmIChwLnRtUnVsZT8udHlwZSA9PT0gXCJhbXJhcFZzVGFyZ2V0XCIpIHtcbiAgICAgIGNvbnN0IHQgPSB0YWJsZVtwLnRtUnVsZS5zZXRJbmRleF07XG4gICAgICBpZiAodCkgaWZTdWNjZXNzID0gYHRhcmdldCAke3QudGFyZ2V0ID8/IHQucmVwc30gcmVwcyBvbiB0aGUgJHt0LnJlcHN9KyBzZXQ7IGVhY2ggcmVwIG92ZXIvdW5kZXIgbW92ZXMgdGhlIFRNYDtcbiAgICB9IGVsc2UgaWYgKHAudG1SdWxlPy50eXBlID09PSBcInRvdGFsUmVwc1wiKSB7XG4gICAgICBpZlN1Y2Nlc3MgPSBwLnRtUnVsZS50YWJsZS5maWx0ZXIoKHIpID0+IChyLmluY3JlbWVudHMgPz8gMCkgPiAwIHx8IChyLnBjdCA/PyAwKSA+IDApLm1hcCgocikgPT4gYCR7ci5taW5SZXBzfSsgdG90YWwgXHUyMTkyICske3IucGN0ICE9IG51bGwgPyBmbXQoci5wY3QgKiAxMDApICsgXCIlXCIgOiBmbXQoKHIuaW5jcmVtZW50cyA/PyAwKSAqIHRtaSl9YCkuam9pbihcIiBcdTAwQjcgXCIpO1xuICAgIH0gZWxzZSBpZiAocC50bVJ1bGU/LnR5cGUgPT09IFwibWlzc0N1dFwiKSB7XG4gICAgICBpZlN1Y2Nlc3MgPSBgbWlzcyBhIHJlcCBcdTIxOTIgJHtkZWYubWF4TGFiZWwgPz8gXCJUTVwifSBcdTIyMTIke2ZtdChwLnRtUnVsZS5wY3QgKiAxMDApfSVgO1xuICAgIH0gZWxzZSBpZiAocC50bVJ1bGU/LnR5cGUgPT09IFwiZTFybVwiKSB7XG4gICAgICBpZlN1Y2Nlc3MgPSBgbmV3IFRNID0gJHtNYXRoLnJvdW5kKHAudG1SdWxlLnBjdCAqIDEwMCl9JSBvZiBlMVJNIGZyb20gc2V0ICR7cC50bVJ1bGUuc2V0SW5kZXggKyAxfWA7XG4gICAgfVxuICAgIGNvbnN0IHVzZXNQY3QgPSB0YWJsZS5zb21lKCh4KSA9PiB4LnBjdCAhPSBudWxsICYmICF4Lm9mVG9wKTtcbiAgICByZXR1cm4ge1xuICAgICAgLi4uYmFzZSwgc2NoZW1lOiBzZXRzTGFiZWwoc2V0cyksIHNldHMsIGlmU3VjY2VzcyxcbiAgICAgIG5vdGU6IFt1c2VzUGN0ID8gKHAudG1MaWZ0ICE9PSBzbG90LmxpZnQgPyBgJSBvZiAke0xJRlRTW3AudG1MaWZ0XT8uc2hvcnQgPz8gcC50bUxpZnR9ICR7ZGVmLm1heExhYmVsID8/IFwiVE1cIn0gJHtmbXQodG0pfWAgOiBgJHtkZWYubWF4TGFiZWwgPz8gXCJUTVwifSAke2ZtdCh0bSl9YCkgOiBcIlwiLCBzbG90Lm5vdGVdLmZpbHRlcihCb29sZWFuKS5qb2luKFwiIFx1MDBCNyBcIikgfHwgdW5kZWZpbmVkLFxuICAgIH07XG4gIH0pO1xuICAvLyBQZXJjZW50IHRhYmxlcyBjYW4gYmUgZW1wdHkgZm9yIGEgd2VlayAoZS5nLiBubyBCQkIgb24gZGVsb2FkIHdlZWspLlxuICByZXR1cm4geyBkYXlJbmRleCwgZGF5SWQ6IGRheS5pZCwgZGF5TmFtZTogZGF5Lm5hbWUsIHdlZWssIHdlZWtOYW1lOiBkZWYuY3ljbGU/LndlZWtOYW1lcz8uW3dlZWtdLCBleGVyY2lzZXM6IGV4ZXJjaXNlcy5maWx0ZXIoKGUpID0+IGUuc2V0cy5sZW5ndGgpIH07XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBldmFsdWF0ZSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuaW50ZXJmYWNlIFBlcmZvcm1lZCB7XG4gIHdlaWdodDogbnVtYmVyO1xuICByZXBzOiBudW1iZXI7XG4gIHJwZT86IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gcGVyZm9ybWVkRm9yKHc6IEhldnlXb3Jrb3V0LCBsaWZ0OiBzdHJpbmcsIGNmZzogUHJvZ3JhbUNvbmZpZyk6IFBlcmZvcm1lZFtdW10ge1xuICAvLyBvbmUgYXJyYXkgcGVyIG1hdGNoaW5nIGV4ZXJjaXNlIGJsb2NrLCBzbyBhIGxpZnQgZG9uZSB0d2ljZSBpbiBhIGRheSBzdGF5cyBzZXBhcmF0ZVxuICByZXR1cm4gdy5leGVyY2lzZXNcbiAgICAuZmlsdGVyKChlKSA9PiBtYXRjaExpZnQoZS50aXRsZSwgZS5leGVyY2lzZV90ZW1wbGF0ZV9pZCwgY2ZnLmxpZnRNYXApID09PSBsaWZ0KVxuICAgIC5tYXAoKGUpID0+XG4gICAgICBlLnNldHNcbiAgICAgICAgLmZpbHRlcigocykgPT4gcy50eXBlICE9PSBcIndhcm11cFwiICYmIChzLnJlcHMgPz8gMCkgPiAwKVxuICAgICAgICAubWFwKChzKSA9PiAoeyB3ZWlnaHQ6IGZyb21LZyhzLndlaWdodF9rZyA/PyAwLCBjZmcudW5pdCksIHJlcHM6IHMucmVwcyA/PyAwLCAuLi4ocy5ycGUgIT0gbnVsbCA/IHsgcnBlOiBzLnJwZSB9IDoge30pIH0pKSxcbiAgICApO1xufVxuXG5jb25zdCBlMXJtID0gKHc6IG51bWJlciwgcjogbnVtYmVyKSA9PiAociA8PSAxID8gdyA6IHcgKiAoMSArIHIgLyAzMCkpO1xuXG4vKiogVGhlIHdlaWdodCBtb3N0IHNldHMgd2VyZSBkb25lIGF0ICh0aWVzIFx1MjE5MiBoZWF2aWVyKSwgcm91bmRlZCBvZmYga2dcdTIxOTJsYiBmbG9hdCBub2lzZS4gKi9cbmZ1bmN0aW9uIG1vZGVXZWlnaHQoc2V0czogUGVyZm9ybWVkW10pOiBudW1iZXIge1xuICBjb25zdCBuID0gbmV3IE1hcDxudW1iZXIsIG51bWJlcj4oKTtcbiAgZm9yIChjb25zdCB4IG9mIHNldHMpIHsgY29uc3QgciA9IE1hdGgucm91bmQoeC53ZWlnaHQgKiAyKSAvIDI7IG4uc2V0KHIsIChuLmdldChyKSA/PyAwKSArIDEpOyB9XG4gIGxldCBiZXN0ID0gMCwgYyA9IC0xO1xuICBmb3IgKGNvbnN0IFt3dCwga10gb2YgbikgaWYgKGsgPiBjIHx8IChrID09PSBjICYmIHd0ID4gYmVzdCkpIHsgYmVzdCA9IHd0OyBjID0gazsgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuLyoqIFNldHMgYXQgb3IgbmVhciB0aGUgbWFpbiB3b3JraW5nIHdlaWdodC4gRHJvcHMgd2FybXVwcyBwZW9wbGUgbG9nIGFzIG5vcm1hbCBzZXRzIGJ1dCBrZWVwcyByYW1wcyAoODUvOTUvOTUvODUvODUpLiAqL1xuZnVuY3Rpb24gd29ya2luZ1NldHMoc2V0czogUGVyZm9ybWVkW10pOiBQZXJmb3JtZWRbXSB7XG4gIGlmICghc2V0cy5sZW5ndGgpIHJldHVybiBbXTtcbiAgY29uc3QgbG9hZGVkID0gc2V0cy5maWx0ZXIoKHgpID0+IHgud2VpZ2h0ID4gMCk7XG4gIGNvbnN0IG0gPSBtb2RlV2VpZ2h0KGxvYWRlZC5sZW5ndGggPyBsb2FkZWQgOiBzZXRzKTtcbiAgcmV0dXJuIHNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+PSBtICogMC45NSAtIDAuNSk7XG59XG5cbmNvbnN0IG1lZGlhblJlcHMgPSAoeHM6IFBlcmZvcm1lZFtdKSA9PiAoeHMubGVuZ3RoID8gWy4uLnhzXS5tYXAoKHgpID0+IHgucmVwcykuc29ydCgoYSwgYikgPT4gYSAtIGIpW01hdGguZmxvb3IoeHMubGVuZ3RoIC8gMildIDogMCk7XG5cbi8qKlxuICogV2hpY2ggc3RhZ2UgdGhlIGxvZ2dlZCBzZXRzIGxvb2sgbGlrZSAoc2l4IGRvdWJsZXMgPSA2XHUwMEQ3MispLlxuICogZXhhY3Q6IHJpZ2h0IG51bWJlciBvZiBzZXRzIHdpdGggcmVwcyBuZWFyIHRoZSBzY2hlbWUuIGF0dGVtcHQ6IGZld2VyIHNldHMgb3IgbWlzc2VkIHJlcHNcbiAqIG5lYXIgdGhlIHNjaGVtZSAoYSBzZXNzaW9uIHRoYXQgd2VudCBiYWRseSkuIG5vbmU6IGRvZXNuJ3QgcmVzZW1ibGUgYW55IHN0YWdlICgzXHUwMEQ3MTAgb24gVDEpLlxuICovXG5mdW5jdGlvbiBpbmZlclN0YWdlKHN0YWdlczogU3RhZ2VbXSwgd29yazogUGVyZm9ybWVkW10sIGN1cnJlbnQ6IG51bWJlcik6IHsgazogbnVtYmVyOyBob3c6IFwiZXhhY3RcIiB8IFwiYXR0ZW1wdFwiIHwgXCJub25lXCIgfSB7XG4gIC8vIFJlcHMgZGlzdGluZ3Vpc2ggVDEgc3RhZ2VzICgzcyB2cyAycyB2cyAxcykgc28gbG93LXJlcCBzY2hlbWVzIG11c3QgbWF0Y2ggZXhhY3RseS5cbiAgLy8gQW4gQU1SQVAgbGFzdCBzZXQgb25seSBoYXMgYSBmbG9vcjogMVx1MDBENzUrIGRvbmUgZm9yIDggaXMgc3RpbGwgdGhhdCBzY2hlbWUuXG4gIGNvbnN0IHJlcHNOZWFyID0gKHN0OiBTdGFnZSwgeHM6IFBlcmZvcm1lZFtdKSA9PiB7XG4gICAgY29uc3QgdG9sZXJhbmNlID0gc3QucmVwcyA8PSAzID8gMCA6IDE7XG4gICAgaWYgKCFzdC5hbXJhcCkgcmV0dXJuIE1hdGguYWJzKG1lZGlhblJlcHMoeHMpIC0gc3QucmVwcykgPD0gdG9sZXJhbmNlO1xuICAgIGNvbnN0IGxhc3QgPSB4c1t4cy5sZW5ndGggLSAxXTtcbiAgICAvLyBvbmUgcmVwIHNob3J0IG9uIHRoZSBBTVJBUCBpcyBzdGlsbCBhbiBhdHRlbXB0IGF0IHRoaXMgc2NoZW1lIChhIG1pc3MsIGp1ZGdlZCBsYXRlcilcbiAgICBjb25zdCBsYXN0T2sgPSAhIWxhc3QgJiYgbGFzdC5yZXBzID49IE1hdGgubWF4KDEsIHN0LnJlcHMgLSAxIC0gdG9sZXJhbmNlKTtcbiAgICBjb25zdCBib2R5ID0geHMuc2xpY2UoMCwgLTEpO1xuICAgIHJldHVybiBib2R5Lmxlbmd0aCA/IGxhc3RPayAmJiBNYXRoLmFicyhtZWRpYW5SZXBzKGJvZHkpIC0gc3QucmVwcykgPD0gdG9sZXJhbmNlIDogbGFzdE9rO1xuICB9O1xuICAvLyBNb3JlIHNldHMgdGhhbiB0aGUgc2NoZW1lOiBqdWRnZSB0aGUgbGFzdCBOIChhbiBleHRyYSBzZXQgYXQgd29ya2luZyB3ZWlnaHQgaXMgdXN1YWxseSBhIHdhcm11cCkuXG4gIGNvbnN0IGV4YWN0ID0gKHN0OiBTdGFnZSkgPT4ge1xuICAgIGlmIChNYXRoLmFicyh3b3JrLmxlbmd0aCAtIHN0LnNldHMpIDw9IChzdC5zZXRzID49IDYgPyAxIDogMCkpIHJldHVybiByZXBzTmVhcihzdCwgd29yayk7XG4gICAgcmV0dXJuIHdvcmsubGVuZ3RoID4gc3Quc2V0cyAmJiByZXBzTmVhcihzdCwgd29yay5zbGljZSgtc3Quc2V0cykpO1xuICB9O1xuICBpZiAoZXhhY3Qoc3RhZ2VzW2N1cnJlbnRdKSkgcmV0dXJuIHsgazogY3VycmVudCwgaG93OiBcImV4YWN0XCIgfTtcbiAgY29uc3QgZSA9IHN0YWdlcy5maW5kSW5kZXgoZXhhY3QpO1xuICBpZiAoZSA+PSAwKSByZXR1cm4geyBrOiBlLCBob3c6IFwiZXhhY3RcIiB9O1xuICBjb25zdCBjdXIgPSBzdGFnZXNbY3VycmVudF07XG4gIGlmICh3b3JrLmxlbmd0aCA+PSAyICYmIHdvcmsubGVuZ3RoIDwgY3VyLnNldHMgJiYgcmVwc05lYXIoY3VyLCB3b3JrKSkgcmV0dXJuIHsgazogY3VycmVudCwgaG93OiBcImF0dGVtcHRcIiB9O1xuICAvLyBSaWdodCBudW1iZXIgb2Ygc2V0cyBidXQgcmVwcyBmZWxsIHNob3J0ICg1XHUwMEQ3NSBcdTIxOTIgNSw1LDUsNCwzKS5cbiAgaWYgKHN0YWdlcy5sZW5ndGggPT09IDEgJiYgd29yay5sZW5ndGggPj0gMiAmJiB3b3JrLmxlbmd0aCA8PSBjdXIuc2V0cyAmJiBtZWRpYW5SZXBzKHdvcmspIDw9IGN1ci5yZXBzICYmIG1lZGlhblJlcHMod29yaykgPj0gY3VyLnJlcHMgLSAyKSByZXR1cm4geyBrOiBjdXJyZW50LCBob3c6IFwiYXR0ZW1wdFwiIH07XG4gIGNvbnN0IGEgPSBzdGFnZXMuZmluZEluZGV4KChzdCkgPT4gd29yay5sZW5ndGggPj0gMiAmJiB3b3JrLmxlbmd0aCA8IHN0LnNldHMgJiYgcmVwc05lYXIoc3QsIHdvcmspKTtcbiAgaWYgKGEgPj0gMCkgcmV0dXJuIHsgazogYSwgaG93OiBcImF0dGVtcHRcIiB9O1xuICByZXR1cm4geyBrOiBjdXJyZW50LCBob3c6IFwibm9uZVwiIH07XG59XG5cbi8qKiBIb3cgd2VsbCBsb2dnZWQgc2V0cyBmaXQgYSBzbG90OiAyID0gbWF0Y2hlcyBpdHMgY3VycmVudCBzY2hlbWUsIDAuNzUgPSBsaWZ0IHByZXNlbnQsIDAgPSBhYnNlbnQuICovXG5mdW5jdGlvbiBzbG90Rml0KHNsb3Q6IFNsb3REZWYsIHN0YXRlOiBQcm9ncmFtU3RhdGUsIHNldHM6IFBlcmZvcm1lZFtdKTogbnVtYmVyIHtcbiAgaWYgKCFzZXRzLmxlbmd0aCkgcmV0dXJuIDA7XG4gIGNvbnN0IHAgPSBzbG90LnByb2dyZXNzaW9uO1xuICBpZiAocC5raW5kICE9PSBcInN0YWdlc1wiKSByZXR1cm4gMTtcbiAgaWYgKHN0YXRlLnNsb3RzW3Nsb3QuaWRdPy5yZXRlc3QpIHJldHVybiAxLjU7XG4gIGNvbnN0IHdvcmsgPSB3b3JraW5nU2V0cyhzZXRzKTtcbiAgY29uc3QgaG93ID0gaW5mZXJTdGFnZShwLnN0YWdlcywgd29yaywgc3RhdGUuc2xvdHNbc2xvdC5pZF0/LnN0YWdlID8/IDApLmhvdztcbiAgcmV0dXJuIGhvdyA9PT0gXCJleGFjdFwiID8gMiA6IGhvdyA9PT0gXCJhdHRlbXB0XCIgPyAxLjI1IDogMC43NTtcbn1cblxudHlwZSBFdmFsID0geyBuZXh0OiBTbG90U3RhdGU7IHJlczogU2xvdFJlc3VsdCB9O1xuXG5mdW5jdGlvbiBldmFsU3RhZ2VzKGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzbG90OiBTbG90RGVmLCBzOiBTbG90U3RhdGUsIHNldHM6IFBlcmZvcm1lZFtdKTogRXZhbCB7XG4gIGNvbnN0IHAgPSBzbG90LnByb2dyZXNzaW9uIGFzIEV4dHJhY3Q8UHJvZ3Jlc3Npb24sIHsga2luZDogXCJzdGFnZXNcIiB9PjtcbiAgY29uc3QgaSA9IHNsb3RJbmNyZW1lbnQoZGVmLCBjZmcsIHNsb3QpO1xuXG4gIGlmIChzLnJldGVzdCAmJiBwLm9uRmluYWxGYWlsLnR5cGUgPT09IFwicmV0ZXN0XCIpIHtcbiAgICBjb25zdCB7IHJtUmVwcywgcGN0IH0gPSBwLm9uRmluYWxGYWlsO1xuICAgIGNvbnN0IGF0Um0gPSBzZXRzLmZpbHRlcigoeCkgPT4geC5yZXBzID49IHJtUmVwcykubWFwKCh4KSA9PiB4LndlaWdodCk7XG4gICAgY29uc3Qgcm0gPSBhdFJtLmxlbmd0aCA/IE1hdGgubWF4KC4uLmF0Um0pIDogTWF0aC5tYXgoMCwgLi4uc2V0cy5tYXAoKHgpID0+IGUxcm0oeC53ZWlnaHQsIHgucmVwcykpKSAvICgxICsgcm1SZXBzIC8gMzApO1xuICAgIGNvbnN0IHcgPSByb3VuZFRvKHJtICogcGN0LCBzdGVwKGRlZiwgY2ZnLCBzbG90LmxpZnQpKTtcbiAgICByZXR1cm4ge1xuICAgICAgbmV4dDogeyB3ZWlnaHQ6IHcsIHN0YWdlOiAwLCBzdGFnZTBXZWlnaHQ6IHcsIHJldGVzdDogZmFsc2UsIGZhaWxzOiAwIH0sXG4gICAgICByZXM6IHsgc2xvdElkOiBzbG90LmlkLCBsaWZ0OiBzbG90LmxpZnQsIHRpZXI6IHNsb3QudGllciwgcmVwczogc2V0cy5tYXAoKHgpID0+IHgucmVwcyksIHNjaGVtZTogYCR7cm1SZXBzfVJNIFRFU1RgLCB3ZWlnaHQ6IHJtLCBvdXRjb21lOiBcInJldGVzdGVkXCIsIG5vdGU6IGAke3JtUmVwc31STSAke2ZtdChybSl9IFx1MjE5MiAke3NjaGVtZUxhYmVsKHAuc3RhZ2VzWzBdKX0gQCAke2ZtdCh3KX1gIH0sXG4gICAgfTtcbiAgfVxuXG4gIC8vIEZvbGxvdyB0aGUgbGlmdGVyLiBXb3JraW5nIHNldHMgYXJlIHRob3NlIG5lYXIgdGhlIG1haW4gd2VpZ2h0LCBzbyB1bm1hcmtlZCB3YXJtdXBzIGRyb3BcbiAgLy8gb3V0LCBhbmQgcHJvZ3Jlc3Npb24gYnVpbGRzIGZyb20gd2hhdCB3YXMgYWN0dWFsbHkgbGlmdGVkIHJhdGhlciB0aGFuIHdoYXQgd2FzIHByZXNjcmliZWQuXG4gIC8vIFRoYXQga2VlcHMgdGhlIHByb2dyYW0gaW4gc3RlcCB3aGVuIHlvdSBnbyBoZWF2aWVyLCBsaWdodGVyLCBvciBydW4gYSBkaWZmZXJlbnQgc3RhZ2UuXG4gIGNvbnN0IHdvcmtBbGwgPSB3b3JraW5nU2V0cyhzZXRzKTtcbiAgY29uc3QgbGlmdGVkID0gbW9kZVdlaWdodCh3b3JrQWxsKTtcbiAgY29uc3QgdG9sID0gTWF0aC5tYXgoMSwgcy53ZWlnaHQgKiAwLjAyKTtcbiAgY29uc3QgdyA9IE1hdGguYWJzKGxpZnRlZCAtIHMud2VpZ2h0KSA8PSB0b2wgPyBzLndlaWdodCA6IGxpZnRlZDtcbiAgY29uc3QgeyBrLCBob3cgfSA9IGluZmVyU3RhZ2UocC5zdGFnZXMsIHdvcmtBbGwsIHMuc3RhZ2UpO1xuICBjb25zdCBzdCA9IHAuc3RhZ2VzW2tdO1xuICBjb25zdCB3b3JrID0gd29ya0FsbC5sZW5ndGggPiBzdC5zZXRzICYmIE1hdGguYWJzKHdvcmtBbGwubGVuZ3RoIC0gc3Quc2V0cykgPiAoc3Quc2V0cyA+PSA2ID8gMSA6IDApID8gd29ya0FsbC5zbGljZSgtc3Quc2V0cykgOiB3b3JrQWxsO1xuICBjb25zdCBjdXI6IFNsb3RTdGF0ZSA9IHsgLi4ucywgd2VpZ2h0OiB3LCBzdGFnZTogaywgc3RhZ2UwV2VpZ2h0OiBrID09PSAwID8gdyA6IHMuc3RhZ2UwV2VpZ2h0LCBmYWlsczogdyAhPT0gcy53ZWlnaHQgfHwgayAhPT0gcy5zdGFnZSA/IDAgOiBzLmZhaWxzID8/IDAgfTtcbiAgY29uc3QgYW1yYXBSZXBzID0gd29yay5sZW5ndGggPyB3b3JrW01hdGgubWluKHdvcmsubGVuZ3RoLCBzdC5zZXRzKSAtIDFdLnJlcHMgOiB1bmRlZmluZWQ7XG4gIGNvbnN0IGJhc2UgPSB7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHNjaGVtZTogc2NoZW1lTGFiZWwoc3QpLCB3ZWlnaHQ6IHcsIHJlcHM6IHdvcmsubWFwKCh4KSA9PiB4LnJlcHMpIH07XG4gIGNvbnN0IG9mZiA9IHcgIT09IHMud2VpZ2h0ID8gYCAocGxhbm5lZCAke2ZtdChzLndlaWdodCl9KWAgOiBcIlwiO1xuXG4gIGlmIChwLmFkdmFuY2UudHlwZSA9PT0gXCJhbXJhcEF0TGVhc3RcIikge1xuICAgIC8vIFQzOiB0aGUgc2V0cyBiZWZvcmUgdGhlIGxhc3QgbWFrZSB0aGVpciByZXBzIGFuZCB0aGUgbGFzdCBvbmUgcmVhY2hlcyB0aGUgdGFyZ2V0IChcIjE1LzE1LzI1XCIpLlxuICAgIGNvbnN0IGJvZHkgPSB3b3JrLnNsaWNlKDAsIE1hdGgubWluKHdvcmsubGVuZ3RoLCBzdC5zZXRzKSAtIDEpO1xuICAgIGNvbnN0IG9rID0gKGFtcmFwUmVwcyA/PyAwKSA+PSBwLmFkdmFuY2UucmVwcyAmJiB3b3JrLmxlbmd0aCA+PSBzdC5zZXRzICYmIGJvZHkuZXZlcnkoKHgpID0+IHgucmVwcyA+PSBzdC5yZXBzKTtcbiAgICByZXR1cm4gb2tcbiAgICAgID8geyBuZXh0OiB7IC4uLmN1ciwgd2VpZ2h0OiB3ICsgaSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBhbXJhcFJlcHMsIG5vdGU6IGAke2FtcmFwUmVwc30gb24gbGFzdCBzZXQke29mZn0gXHUyMTkyICR7Zm10KHcgKyBpKX1gIH0gfVxuICAgICAgOiB7IG5leHQ6IGN1ciwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke2FtcmFwUmVwcyA/PyAwfSBvbiBsYXN0IHNldCwgbmVlZCAke3AuYWR2YW5jZS5yZXBzfSR7b2ZmfWAgfSB9O1xuICB9XG5cbiAgaWYgKHAuY2xpbWIgJiYgaG93ICE9PSBcIm5vbmVcIikge1xuICAgIGNvbnN0IHZvbCA9IHdvcmsuc2xpY2UoMCwgc3Quc2V0cykucmVkdWNlKChhLCB4KSA9PiBhICsgTWF0aC5taW4oeC5yZXBzLCBzdC5yZXBzKSwgMCk7XG4gICAgY29uc3QgbmVlZCA9IHN0LnNldHMgKiBzdC5yZXBzO1xuICAgIGlmICh2b2wgPCBuZWVkKSByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke3ZvbH0vJHtuZWVkfSR7b2ZmfSBcdTIxOTIgcmVwZWF0ICR7c2NoZW1lTGFiZWwoc3QpfWAgfSB9O1xuICAgIGlmIChrIDwgcC5zdGFnZXMubGVuZ3RoIC0gMSkge1xuICAgICAgY29uc3QgbnggPSBwLnN0YWdlc1trICsgMV07XG4gICAgICByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgc3RhZ2U6IGsgKyAxLCBmYWlsczogMCB9LCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogXCJzdWNjZXNzXCIsIGFtcmFwUmVwcywgbm90ZTogYCR7dm9sfS8ke25lZWR9JHtvZmZ9IFx1MjE5MiAke3NjaGVtZUxhYmVsKG54KX0gQCAke2ZtdCh3KX1gIH0gfTtcbiAgICB9XG4gICAgaWYgKHcgPD0gMCB8fCBwLmNsaW1iLmxvYWRQY3QgPD0gMCkgcmV0dXJuIHsgbmV4dDogeyAuLi5jdXIsIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0gXHUyMTkyIHN0YXkgYXQgJHtzY2hlbWVMYWJlbChzdCl9YCB9IH07XG4gICAgY29uc3QgbncgPSByb3VuZFRvKHcgKiAoMSArIHAuY2xpbWIubG9hZFBjdCksIHN0ZXAoZGVmLCBjZmcsIHNsb3QubGlmdCkpO1xuICAgIHJldHVybiB7IG5leHQ6IHsgd2VpZ2h0OiBudywgc3RhZ2U6IDAsIHN0YWdlMFdlaWdodDogbncsIHJldGVzdDogZmFsc2UsIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyICR7c2NoZW1lTGFiZWwocC5zdGFnZXNbMF0pfSBAICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuXG4gIGlmIChob3cgPT09IFwibm9uZVwiKSB7XG4gICAgLy8gTm90IGFuIGF0dGVtcHQgYXQgdGhpcyBzY2hlbWUgKGRpZmZlcmVudCByZXAgcmFuZ2UsIGEgc2luZ2xlIHNldFx1MjAyNik6IGxvZyBpdCwgY2hhbmdlIG5vdGhpbmcuXG4gICAgcmV0dXJuIHsgbmV4dDogcywgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGBvZmYtc2NoZW1lICgke3dvcmsubGVuZ3RofVx1MDBENyR7bWVkaWFuUmVwcyh3b3JrKX0pLCBub3QgY291bnRlZGAgfSB9O1xuICB9XG4gIC8vIEJhc2Ugdm9sdW1lOiBlYWNoIG9mIHRoZSBmaXJzdCBgc2V0c2Agd29ya2luZyBzZXRzIGNvdW50cyB1cCB0byBpdHMgcHJlc2NyaWJlZCByZXBzLlxuICBjb25zdCB2b2wgPSB3b3JrLnNsaWNlKDAsIHN0LnNldHMpLnJlZHVjZSgoYSwgeCkgPT4gYSArIE1hdGgubWluKHgucmVwcywgc3QucmVwcyksIDApO1xuICBjb25zdCBuZWVkID0gc3Quc2V0cyAqIHN0LnJlcHM7XG4gIGlmICh2b2wgPj0gbmVlZCkge1xuICAgIGNvbnN0IG4gPSBwLmFtcmFwQm9udXMgJiYgc3QuYW1yYXAgJiYgKGFtcmFwUmVwcyA/PyAwKSA+PSBwLmFtcmFwQm9udXMucmVwcyA/IHAuYW1yYXBCb251cy5pbmNyZW1lbnRzIDogMTtcbiAgICByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgd2VpZ2h0OiB3ICsgaSAqIG4sIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyICR7Zm10KHcgKyBpICogbil9JHtuID4gMSA/IGAgKCR7YW1yYXBSZXBzfSBvbiBBTVJBUDogXHUwMEQ3JHtufSlgIDogXCJcIn1gIH0gfTtcbiAgfVxuICBjb25zdCBmYWlscyA9IChjdXIuZmFpbHMgPz8gMCkgKyAxO1xuICBjb25zdCBhbGxvd2VkID0gcC5mYWlsc0JlZm9yZUFjdGlvbiA/PyAxO1xuICBpZiAoZmFpbHMgPCBhbGxvd2VkKSB7XG4gICAgcmV0dXJuIHsgbmV4dDogeyAuLi5jdXIsIGZhaWxzIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcImZhaWxcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyIHJldHJ5ICR7Zm10KHcpfSAobWlzcyAke2ZhaWxzfS8ke2FsbG93ZWR9KWAgfSB9O1xuICB9XG4gIGlmIChrIDwgcC5zdGFnZXMubGVuZ3RoIC0gMSkge1xuICAgIGNvbnN0IG54ID0gcC5zdGFnZXNbayArIDFdO1xuICAgIHJldHVybiB7IG5leHQ6IHsgLi4uY3VyLCBzdGFnZTogayArIDEsIGZhaWxzOiAwIH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN0YWdlLWRvd25cIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0ke29mZn0gXHUyMTkyICR7c2NoZW1lTGFiZWwobngpfSBAICR7Zm10KHcpfWAgfSB9O1xuICB9XG4gIGNvbnN0IGYgPSBwLm9uRmluYWxGYWlsO1xuICBpZiAoZi50eXBlID09PSBcInJldGVzdFwiKSByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgcmV0ZXN0OiB0cnVlLCBmYWlsczogMCB9LCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogXCJyZXRlc3QtbmV4dFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke3ZvbH0vJHtuZWVkfSBcdTIxOTIgcmV0ZXN0ICR7Zi5ybVJlcHN9Uk1gIH0gfTtcbiAgaWYgKGYudHlwZSA9PT0gXCJyZXNldFwiKSB7XG4gICAgY29uc3QgbncgPSBjdXIuc3RhZ2UwV2VpZ2h0ICsgZi5idW1wSW5jcmVtZW50cyAqIGk7XG4gICAgcmV0dXJuIHsgbmV4dDogeyB3ZWlnaHQ6IG53LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiBudywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwicmVzZXRcIiwgYW1yYXBSZXBzLCBub3RlOiBgJHt2b2x9LyR7bmVlZH0gXHUyMTkyIHJlc2V0ICR7c2NoZW1lTGFiZWwocC5zdGFnZXNbMF0pfSBAICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuICBpZiAoZi50eXBlID09PSBcImRlbG9hZEJ5XCIpIHtcbiAgICBjb25zdCBudyA9IE1hdGgubWF4KDAsIHcgLSBpbmMoZi5hbW91bnQsIGNmZy51bml0KSk7XG4gICAgcmV0dXJuIHsgbmV4dDogeyB3ZWlnaHQ6IG53LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiBudywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiZGVsb2FkXCIsIGFtcmFwUmVwcywgbm90ZTogYCR7dm9sfS8ke25lZWR9IFx1MjE5MiBkcm9wIHRvICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuICBpZiAoZi50eXBlID09PSBcImRlbG9hZFwiKSB7XG4gICAgY29uc3QgbncgPSByb3VuZFRvKHcgKiAoMSAtIGYucGN0KSwgc3RlcChkZWYsIGNmZywgc2xvdC5saWZ0KSk7XG4gICAgcmV0dXJuIHsgbmV4dDogeyB3ZWlnaHQ6IG53LCBzdGFnZTogMCwgc3RhZ2UwV2VpZ2h0OiBudywgcmV0ZXN0OiBmYWxzZSwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiZGVsb2FkXCIsIGFtcmFwUmVwcywgbm90ZTogYCR7dm9sfS8ke25lZWR9IFx1MjE5MiBkZWxvYWQgJHtNYXRoLnJvdW5kKGYucGN0ICogMTAwKX0lIHRvICR7Zm10KG53KX1gIH0gfTtcbiAgfVxuICByZXR1cm4geyBuZXh0OiB7IC4uLmN1ciwgZmFpbHM6IDAgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwiaG9sZFwiLCBhbXJhcFJlcHMsIG5vdGU6IGAke3ZvbH0vJHtuZWVkfWAgfSB9O1xufVxuXG5mdW5jdGlvbiBldmFsRG91YmxlKGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzbG90OiBTbG90RGVmLCBzOiBTbG90U3RhdGUsIHNldHM6IFBlcmZvcm1lZFtdKTogRXZhbCB7XG4gIGNvbnN0IHAgPSBzbG90LnByb2dyZXNzaW9uIGFzIEV4dHJhY3Q8UHJvZ3Jlc3Npb24sIHsga2luZDogXCJkb3VibGVcIiB9PjtcbiAgY29uc3QgaSA9IHNsb3RJbmNyZW1lbnQoZGVmLCBjZmcsIHNsb3QpO1xuICBjb25zdCB3b3JrID0gd29ya2luZ1NldHMoc2V0cyk7XG4gIGNvbnN0IHcgPSBtb2RlV2VpZ2h0KHdvcmspO1xuICBjb25zdCBbbG8sIGhpXSA9IHAucmVwcztcbiAgY29uc3QgcmVwcyA9IHdvcmsuc2xpY2UoMCwgcC5zZXRzKS5tYXAoKHgpID0+IHgucmVwcyk7XG4gIGNvbnN0IGJhc2UgPSB7IHNsb3RJZDogc2xvdC5pZCwgbGlmdDogc2xvdC5saWZ0LCB0aWVyOiBzbG90LnRpZXIsIHNjaGVtZTogYCR7cC5zZXRzfVx1MDBENyR7bG99XHUyMDEzJHtoaX1gLCB3ZWlnaHQ6IHcsIHJlcHMgfTtcbiAgY29uc3QgdG9wID0gcmVwcy5sZW5ndGggPj0gcC5zZXRzICYmIHJlcHMuZXZlcnkoKHIpID0+IHIgPj0gaGkpO1xuICBpZiAodG9wKSByZXR1cm4geyBuZXh0OiB7IC4uLnMsIHdlaWdodDogdyArIGkgfSwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBub3RlOiBgYWxsIHNldHMgJHtoaX0rIFx1MjE5MiAke2ZtdCh3ICsgaSl9YCB9IH07XG4gIHJldHVybiB7IG5leHQ6IHsgLi4ucywgd2VpZ2h0OiB3IH0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcImhvbGRcIiwgbm90ZTogYCR7cmVwcy5qb2luKFwiL1wiKX0gYXQgJHtmbXQodyl9LCBuZWVkICR7aGl9IG9uIGFsbCAke3Auc2V0c31gIH0gfTtcbn1cblxuZnVuY3Rpb24gZXZhbEZpeGVkKHNsb3Q6IFNsb3REZWYsIHM6IFNsb3RTdGF0ZSwgc2V0czogUGVyZm9ybWVkW10pOiBFdmFsIHtcbiAgY29uc3Qgd29yayA9IHdvcmtpbmdTZXRzKHNldHMpO1xuICBjb25zdCB3ID0gbW9kZVdlaWdodCh3b3JrKTtcbiAgcmV0dXJuIHtcbiAgICBuZXh0OiB7IC4uLnMsIHdlaWdodDogdyB9LFxuICAgIHJlczogeyBzbG90SWQ6IHNsb3QuaWQsIGxpZnQ6IHNsb3QubGlmdCwgdGllcjogc2xvdC50aWVyLCBzY2hlbWU6IFwiXCIsIHdlaWdodDogdywgcmVwczogd29yay5tYXAoKHgpID0+IHgucmVwcyksIG91dGNvbWU6IFwic3VjY2Vzc1wiLCBub3RlOiBgJHt3b3JrLmxlbmd0aH0gc2V0cyR7dyA/IGAgQCAke2ZtdCh3KX1gIDogXCJcIn1gIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIGV2YWxQZXJjZW50KGRlZjogUHJvZ3JhbURlZiwgY2ZnOiBQcm9ncmFtQ29uZmlnLCBzbG90OiBTbG90RGVmLCBzdGF0ZTogUHJvZ3JhbVN0YXRlLCBwbGFubmVkOiBQbGFubmVkRXhlcmNpc2UsIHNldHM6IFBlcmZvcm1lZFtdKTogeyB0bURlbHRhOiBudW1iZXI7IHRtU2V0PzogbnVtYmVyOyBhbHNvPzogUmVjb3JkPHN0cmluZywgbnVtYmVyPjsgcmVzOiBTbG90UmVzdWx0IH0ge1xuICBjb25zdCBwID0gc2xvdC5wcm9ncmVzc2lvbiBhcyBFeHRyYWN0PFByb2dyZXNzaW9uLCB7IGtpbmQ6IFwicGVyY2VudFwiIH0+O1xuICBjb25zdCBiYXNlID0geyBzbG90SWQ6IHNsb3QuaWQsIGxpZnQ6IHNsb3QubGlmdCwgdGllcjogc2xvdC50aWVyLCBzY2hlbWU6IHBsYW5uZWQuc2NoZW1lLCB3ZWlnaHQ6IE1hdGgubWF4KDAsIC4uLnBsYW5uZWQuc2V0cy5tYXAoKHgpID0+IHgud2VpZ2h0KSksIHJlcHM6IHNldHMubWFwKCh4KSA9PiB4LnJlcHMpIH07XG4gIGNvbnN0IHRtID0gc3RhdGUudG1zW3AudG1MaWZ0XSA/PyAwO1xuICBjb25zdCB0bWkgPSBkZWYudG1JbmNyZW1lbnQ/LltwLnRtTGlmdF0gPyBpbmMoZGVmLnRtSW5jcmVtZW50W3AudG1MaWZ0XSwgY2ZnLnVuaXQpIDogY2ZnLnVuaXQgPT09IFwibGJcIiA/IDUgOiAyLjU7XG4gIGNvbnN0IHJ1bGUgPSBwLnRtUnVsZTtcbiAgaWYgKHJ1bGU/LnR5cGUgPT09IFwidG90YWxSZXBzXCIpIHtcbiAgICBjb25zdCB0b3AgPSBNYXRoLm1heCgwLCAuLi5wbGFubmVkLnNldHMubWFwKCh4KSA9PiB4LndlaWdodCkpO1xuICAgIGNvbnN0IHRvbCA9IE1hdGgubWF4KDEsIHRvcCAqIDAuMDMpO1xuICAgIGNvbnN0IHRvdGFsID0gc2V0cy5maWx0ZXIoKHgpID0+IHgud2VpZ2h0ID49IHRvcCAtIHRvbCkucmVkdWNlKChhLCB4KSA9PiBhICsgeC5yZXBzLCAwKTtcbiAgICBjb25zdCByb3dzID0gWy4uLnJ1bGUudGFibGVdLnNvcnQoKHgsIHkpID0+IHgubWluUmVwcyAtIHkubWluUmVwcyk7XG4gICAgbGV0IHJvdyA9IHJvd3NbMF07XG4gICAgZm9yIChjb25zdCByIG9mIHJvd3MpIGlmICh0b3RhbCA+PSByLm1pblJlcHMpIHJvdyA9IHI7XG4gICAgY29uc3QgZCA9IHJvdyA/IChyb3cucGN0ICE9IG51bGwgPyBNYXRoLnJvdW5kKHRtICogcm93LnBjdCAqIDEwMCkgLyAxMDAgOiAocm93LmluY3JlbWVudHMgPz8gMCkgKiB0bWkpIDogMDtcbiAgICByZXR1cm4geyB0bURlbHRhOiBkLCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogZCA+IDAgPyBcInRtLXVwXCIgOiBkIDwgMCA/IFwidG0tZG93blwiIDogXCJob2xkXCIsIG5vdGU6IGAke3RvdGFsfSB0b3RhbCByZXBzIFx1MjE5MiAke2QgPyBgJHtkZWYubWF4TGFiZWwgPz8gXCJUTVwifSAke2ZtdCh0bSl9IFx1MjE5MiAke2ZtdCh0bSArIGQpfWAgOiBcImhvbGRzXCJ9YCB9IH07XG4gIH1cbiAgaWYgKHJ1bGU/LnR5cGUgPT09IFwibWlzc0N1dFwiKSB7XG4gICAgY29uc3QgY2hlY2sgPSBydWxlLnNldEluZGV4ICE9IG51bGwgPyBbcGxhbm5lZC5zZXRzW3J1bGUuc2V0SW5kZXhdXS5maWx0ZXIoQm9vbGVhbikgOiBwbGFubmVkLnNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+IDAgJiYgIXguYW1yYXApO1xuICAgIC8vIEVhY2ggcHJlc2NyaWJlZCBzZXQgbmVlZHMgaXRzIG93biBsb2dnZWQgc2V0ICg0XHUwMEQ3NiB3aXRoIGEgNSBvbiB0aGUgbGFzdCBzZXQgaXMgYSBtaXNzKS5cbiAgICBjb25zdCB1c2VkID0gbmV3IFNldDxudW1iZXI+KCk7XG4gICAgY29uc3Qgc2hvcnQgPSBjaGVjay5maWx0ZXIoKHBzKSA9PiB7XG4gICAgICBjb25zdCB0b2wgPSBNYXRoLm1heCgxLCBwcy53ZWlnaHQgKiAwLjAzKTtcbiAgICAgIGNvbnN0IGsgPSBzZXRzLmZpbmRJbmRleCgoeCwgaikgPT4gIXVzZWQuaGFzKGopICYmIHgud2VpZ2h0ID49IHBzLndlaWdodCAtIHRvbCAmJiB4LnJlcHMgPj0gcHMucmVwcyk7XG4gICAgICBpZiAoayA8IDApIHJldHVybiB0cnVlO1xuICAgICAgdXNlZC5hZGQoayk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSk7XG4gICAgaWYgKCFzaG9ydC5sZW5ndGgpIHJldHVybiB7IHRtRGVsdGE6IDAsIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgbm90ZTogYCR7c2V0cy5sZW5ndGh9LyR7cGxhbm5lZC5zZXRzLmxlbmd0aH0gc2V0cywgYWxsIHJlcHMgbWFkZWAgfSB9O1xuICAgIGNvbnN0IGQgPSAtTWF0aC5yb3VuZCh0bSAqIHJ1bGUucGN0ICogMTAwKSAvIDEwMDtcbiAgICByZXR1cm4geyB0bURlbHRhOiBkLCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogXCJ0bS1kb3duXCIsIG5vdGU6IGBtaXNzZWQgcmVwcyBhdCAke3Nob3J0Lm1hcCgoeCkgPT4gZm10KHgud2VpZ2h0KSkuam9pbihcIiwgXCIpfSBcdTIxOTIgJHtkZWYubWF4TGFiZWwgPz8gXCJUTVwifSAke2ZtdCh0bSl9IFx1MjE5MiAke2ZtdCh0bSArIGQpfWAgfSB9O1xuICB9XG4gIGNvbnN0IHRhcmdldCA9IHJ1bGUgJiYgXCJzZXRJbmRleFwiIGluIHJ1bGUgJiYgcnVsZS5zZXRJbmRleCAhPSBudWxsID8gcGxhbm5lZC5zZXRzW3J1bGUuc2V0SW5kZXhdIDogdW5kZWZpbmVkO1xuICBpZiAoIXJ1bGUgfHwgIXRhcmdldCkge1xuICAgIGNvbnN0IGFtcmFwSWR4ID0gcGxhbm5lZC5zZXRzLmZpbmRJbmRleCgoeCkgPT4geC5hbXJhcCk7XG4gICAgY29uc3QgYSA9IGFtcmFwSWR4ID49IDAgPyBiZXN0TmVhcihzZXRzLCBwbGFubmVkLnNldHNbYW1yYXBJZHhdLndlaWdodCkgOiB1bmRlZmluZWQ7XG4gICAgY29uc3Qgb2sgPSBhbXJhcElkeCA8IDAgPyBzZXRzLmxlbmd0aCA+PSBNYXRoLmNlaWwocGxhbm5lZC5zZXRzLmxlbmd0aCAqIDAuOCkgOiAoYSA/PyAwKSA+PSBwbGFubmVkLnNldHNbYW1yYXBJZHhdLnJlcHM7XG4gICAgcmV0dXJuIHsgdG1EZWx0YTogMCwgcmVzOiB7IC4uLmJhc2UsIG91dGNvbWU6IG9rID8gXCJzdWNjZXNzXCIgOiBcImhvbGRcIiwgYW1yYXBSZXBzOiBhLCBub3RlOiBhbXJhcElkeCA+PSAwID8gYCR7YSA/PyAwfSByZXBzIG9uICR7cGxhbm5lZC5zZXRzW2FtcmFwSWR4XS5yZXBzfSsgc2V0YCA6IGAke3NldHMubGVuZ3RofS8ke3BsYW5uZWQuc2V0cy5sZW5ndGh9IHNldHNgIH0gfTtcbiAgfVxuICAvLyBhbGxTZXRzOiBldmVyeSBzZXQgYXQgdGhlIHRhcmdldCB3ZWlnaHQgbXVzdCByZWFjaCBpdCAoQWxsUHJvIFwiMTIgb24gYm90aCBzZXRzXCIpLlxuICBjb25zdCBhID0gKChydWxlLnR5cGUgPT09IFwiYW1yYXBWc1RhcmdldFwiICYmIHJ1bGUuYWxsU2V0cykgPyB3b3JzdE5lYXIoc2V0cywgdGFyZ2V0LndlaWdodClcbiAgICA6IChcInVzZUxhc3RcIiBpbiBydWxlICYmIHJ1bGUudXNlTGFzdCkgPyBsYXN0TmVhcihzZXRzLCB0YXJnZXQud2VpZ2h0KVxuICAgIDogYmVzdE5lYXIoc2V0cywgdGFyZ2V0LndlaWdodCkpID8/IDA7XG5cbiAgaWYgKHJ1bGUudHlwZSA9PT0gXCJlMXJtXCIpIHtcbiAgICBjb25zdCBzZXQgPSBzZXRzLmZpbHRlcigoeCkgPT4geC53ZWlnaHQgPj0gdGFyZ2V0LndlaWdodCAtIE1hdGgubWF4KDEsIHRhcmdldC53ZWlnaHQgKiAwLjAzKSkuc29ydCgoeCwgeSkgPT4gZTFybSh5LndlaWdodCwgeS5yZXBzKSAtIGUxcm0oeC53ZWlnaHQsIHgucmVwcykpWzBdO1xuICAgIGlmICghc2V0KSByZXR1cm4geyB0bURlbHRhOiAwLCByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogXCJob2xkXCIsIG5vdGU6IFwidG9wIHNldCBub3QgZm91bmRcIiB9IH07XG4gICAgY29uc3QgbnRtID0gcm91bmRUbyhlMXJtKHNldC53ZWlnaHQsIHNldC5yZXBzKSAqIHJ1bGUucGN0LCBzdGVwKGRlZiwgY2ZnLCBwLnRtTGlmdCkpO1xuICAgIHJldHVybiB7IHRtRGVsdGE6IDAsIHRtU2V0OiBudG0sIHJlczogeyAuLi5iYXNlLCBvdXRjb21lOiBudG0gPj0gdG0gPyBcInRtLXVwXCIgOiBcInRtLWRvd25cIiwgYW1yYXBSZXBzOiBzZXQucmVwcywgbm90ZTogYCR7Zm10KHNldC53ZWlnaHQpfVx1MDBENyR7c2V0LnJlcHN9IFx1MjE5MiBUTSAke2ZtdCh0bSl9IFx1MjE5MiAke2ZtdChudG0pfWAgfSB9O1xuICB9XG5cbiAgbGV0IGQgPSAwO1xuICBsZXQgbGFiZWwgPSBgJHt0YXJnZXQucmVwc30rYDtcbiAgbGV0IGFsc286IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gfCB1bmRlZmluZWQ7XG4gIGlmIChydWxlLnR5cGUgPT09IFwiYW1yYXBUYWJsZVwiKSB7XG4gICAgbGV0IG4gPSAwO1xuICAgIGZvciAoY29uc3QgciBvZiBydWxlLnRhYmxlKSBpZiAoYSA+PSByLm1pblJlcHMpIG4gPSByLmluY3JlbWVudHM7XG4gICAgZCA9IG4gKiB0bWk7XG4gICAgaWYgKG4gJiYgcnVsZS5hbHNvTGlmdHMpIGFsc28gPSBPYmplY3QuZnJvbUVudHJpZXMocnVsZS5hbHNvTGlmdHMubWFwKChsKSA9PiBbbCwgbiAqIChkZWYudG1JbmNyZW1lbnQ/LltsXSA/IGluYyhkZWYudG1JbmNyZW1lbnRbbF0sIGNmZy51bml0KSA6IHRtaSldKSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3Qgd2FudCA9IHAud2Vla3Nbd2Vla0luZGV4KGRlZiwgc3RhdGUucm90YXRpb25zKSAlIHAud2Vla3MubGVuZ3RoXT8uW3J1bGUuc2V0SW5kZXhdPy50YXJnZXQgPz8gdGFyZ2V0LnJlcHM7XG4gICAgbGFiZWwgPSBgdGFyZ2V0ICR7d2FudH1gO1xuICAgIGxldCBkaWZmID0gYSAtIHdhbnQ7XG4gICAgY29uc3QgdG9sID0gTWF0aC5tYXgoMSwgdGFyZ2V0LndlaWdodCAqIDAuMDMpO1xuICAgIGNvbnN0IGF0V2VpZ2h0ID0gc2V0cy5maWx0ZXIoKHgpID0+IHgud2VpZ2h0ID49IHRhcmdldC53ZWlnaHQgLSB0b2wpO1xuICAgIGlmIChydWxlLnJpcikge1xuICAgICAgLy8gUmVwcyBwYXN0IHRoZSBwbGFubmVkIG51bWJlciBjb3VudCBhcyBSSVIgYWxyZWFkeSBiYW5rZWQ7IGEgbG9nZ2VkIFJQRSBhZGRzIHRoZSByZXN0LlxuICAgICAgY29uc3QgbGFzdCA9IGF0V2VpZ2h0W2F0V2VpZ2h0Lmxlbmd0aCAtIDFdO1xuICAgICAgY29uc3QgcmlyVGFyZ2V0ID0gMTAgLSAodGFyZ2V0LnJwZSA/PyAxMCk7XG4gICAgICBjb25zdCBlZmZlY3RpdmUgPSBsYXN0ID8gbGFzdC5yZXBzIC0gdGFyZ2V0LnJlcHMgKyAobGFzdC5ycGUgIT0gbnVsbCA/IDEwIC0gbGFzdC5ycGUgOiByaXJUYXJnZXQpIDogLTE7XG4gICAgICBkaWZmID0gZWZmZWN0aXZlIC0gcmlyVGFyZ2V0O1xuICAgICAgaWYgKGRpZmYgPCAwKSBkaWZmID0gLTE7XG4gICAgICBsYWJlbCA9IGBSSVIgdGFyZ2V0ICR7Zm10KHJpclRhcmdldCl9YDtcbiAgICB9XG4gICAgaWYgKHJ1bGUucGVuYWxpemVNaXNzaW5nU2V0cykge1xuICAgICAgY29uc3QgcGxhbm5lZEF0ID0gcGxhbm5lZC5zZXRzLmZpbHRlcigoeCkgPT4gTWF0aC5hYnMoeC53ZWlnaHQgLSB0YXJnZXQud2VpZ2h0KSA8PSB0b2wpO1xuICAgICAgY29uc3QgZmxvb3IgPSBNYXRoLm1pbiguLi5wbGFubmVkQXQubWFwKCh4KSA9PiB4LnJlcHMpKTtcbiAgICAgIGNvbnN0IGRvbmUgPSBhdFdlaWdodC5maWx0ZXIoKHgpID0+IHgucmVwcyA+PSBmbG9vcikubGVuZ3RoO1xuICAgICAgY29uc3QgbWlzc2luZyA9IE1hdGgubWF4KDAsIHBsYW5uZWRBdC5sZW5ndGggLSBkb25lKTtcbiAgICAgIGlmIChtaXNzaW5nKSBkaWZmID0gTWF0aC5taW4oZGlmZiwgLTEgLSBtaXNzaW5nKTtcbiAgICB9XG4gICAgY29uc3Qgcm93cyA9IFsuLi5ydWxlLnRhYmxlXS5zb3J0KCh4LCB5KSA9PiB4LmRpZmYgLSB5LmRpZmYpO1xuICAgIGxldCByb3cgPSByb3dzWzBdO1xuICAgIGZvciAoY29uc3QgciBvZiByb3dzKSBpZiAoZGlmZiA+PSByLmRpZmYpIHJvdyA9IHI7XG4gICAgLy8gTm90IHJvdW5kZWQ6IHNtYWxsICUgY2hhbmdlcyBtdXN0IGFjY3VtdWxhdGU7IHByZXNjcmliZWQgbG9hZHMgZ2V0IHJvdW5kZWQgd2hlbiBwbGFubmVkLlxuICAgIGQgPSByb3cgPyAocm93LnBjdCAhPSBudWxsID8gTWF0aC5yb3VuZCh0bSAqIHJvdy5wY3QgKiAxMDApIC8gMTAwIDogKHJvdy5pbmNyZW1lbnRzID8/IDApICogdG1pKSA6IDA7XG4gICAgLy8gcm91bmRVcCBwcm9ncmFtcyAoSnVnZ2VybmF1dCdzIENFSUxJTkcoVE0gKyByZXBzIG92ZXIgXHUwMEQ3IGluY3JlbWVudCkpIGtlZXAgdGhlIFRNIG9uIHRoZSBzdGVwLlxuICAgIGlmIChkZWYucm91bmRVcCAmJiByb3c/LmluY3JlbWVudHMgIT0gbnVsbCkgZCA9IGNlaWxUbyh0bSArIGQsIHN0ZXAoZGVmLCBjZmcsIHAudG1MaWZ0KSkgLSB0bTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHRtRGVsdGE6IGQsXG4gICAgYWxzbyxcbiAgICByZXM6IHsgLi4uYmFzZSwgb3V0Y29tZTogZCA+IDAgPyBcInRtLXVwXCIgOiBkIDwgMCA/IFwidG0tZG93blwiIDogXCJob2xkXCIsIGFtcmFwUmVwczogYSwgbm90ZTogZCA/IGAke2F9IHJlcHMgKCR7bGFiZWx9KSBcdTIxOTIgVE0gJHtmbXQodG0pfSBcdTIxOTIgJHtmbXQodG0gKyBkKX1gIDogYCR7YX0gcmVwcyAoJHtsYWJlbH0pIFx1MjE5MiBUTSBob2xkc2AgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gbGFzdE5lYXIoc2V0czogUGVyZm9ybWVkW10sIHdlaWdodDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcbiAgY29uc3QgdG9sID0gTWF0aC5tYXgoMSwgd2VpZ2h0ICogMC4wMyk7XG4gIGNvbnN0IHIgPSBzZXRzLmZpbHRlcigoeCkgPT4geC53ZWlnaHQgPj0gd2VpZ2h0IC0gdG9sKTtcbiAgcmV0dXJuIHIubGVuZ3RoID8gcltyLmxlbmd0aCAtIDFdLnJlcHMgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHdvcnN0TmVhcihzZXRzOiBQZXJmb3JtZWRbXSwgd2VpZ2h0OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuICBjb25zdCB0b2wgPSBNYXRoLm1heCgxLCB3ZWlnaHQgKiAwLjAzKTtcbiAgY29uc3QgciA9IHNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+PSB3ZWlnaHQgLSB0b2wpLm1hcCgoeCkgPT4geC5yZXBzKTtcbiAgcmV0dXJuIHIubGVuZ3RoID8gTWF0aC5taW4oLi4ucikgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGJlc3ROZWFyKHNldHM6IFBlcmZvcm1lZFtdLCB3ZWlnaHQ6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHRvbCA9IE1hdGgubWF4KDEsIHdlaWdodCAqIDAuMDMpO1xuICBjb25zdCByID0gc2V0cy5maWx0ZXIoKHgpID0+IHgud2VpZ2h0ID49IHdlaWdodCAtIHRvbCkubWFwKCh4KSA9PiB4LnJlcHMpO1xuICByZXR1cm4gci5sZW5ndGggPyBNYXRoLm1heCguLi5yKSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEFwcGx5IG9uZSBsb2dnZWQgd29ya291dCB0byB0aGUgcHJvZ3JhbSBhcyBgZGF5SW5kZXhgLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5V29ya291dChkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZywgc3RhdGU6IFByb2dyYW1TdGF0ZSwgdzogSGV2eVdvcmtvdXQsIGRheUluZGV4OiBudW1iZXIpOiBQcm9ncmFtU3RhdGUge1xuICBjb25zdCBwbGFuID0gcGxhbkRheShkZWYsIGNmZywgc3RhdGUsIGRheUluZGV4KTtcbiAgY29uc3QgZGF5ID0gZGVmLmRheXNbZGF5SW5kZXhdO1xuICBjb25zdCBzbG90cyA9IHsgLi4uc3RhdGUuc2xvdHMgfTtcbiAgY29uc3QgdG1zID0geyAuLi5zdGF0ZS50bXMgfTtcbiAgY29uc3QgcGVuZGluZyA9IHsgLi4uc3RhdGUucGVuZGluZ1RtIH07XG4gIGxldCBwZW5kaW5nTmV4dDogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHsgLi4uc3RhdGUucGVuZGluZ1RtTmV4dCB9O1xuICBjb25zdCByZXN1bHRzOiBTbG90UmVzdWx0W10gPSBbXTtcbiAgY29uc3QgdXNlZCA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7IC8vIGxpZnQgLT4gaG93IG1hbnkgZXhlcmNpc2UgYmxvY2tzIGNvbnN1bWVkXG5cbiAgZm9yIChjb25zdCBzbG90IG9mIGRheS5zbG90cykge1xuICAgIGNvbnN0IHBsYW5uZWQgPSBwbGFuLmV4ZXJjaXNlcy5maW5kKChlKSA9PiBlLnNsb3RJZCA9PT0gc2xvdC5pZCk7XG4gICAgaWYgKCFwbGFubmVkKSBjb250aW51ZTtcbiAgICBjb25zdCBibG9ja3MgPSBwZXJmb3JtZWRGb3Iodywgc2xvdC5saWZ0LCBjZmcpO1xuICAgIGNvbnN0IG4gPSB1c2VkLmdldChzbG90LmxpZnQpID8/IDA7XG4gICAgdXNlZC5zZXQoc2xvdC5saWZ0LCBuICsgMSk7XG4gICAgY29uc3Qgc2V0cyA9IGJsb2Nrc1tuXSA/PyBbXTtcbiAgICBpZiAoIXNldHMubGVuZ3RoKSB7XG4gICAgICByZXN1bHRzLnB1c2goeyBzbG90SWQ6IHNsb3QuaWQsIGxpZnQ6IHNsb3QubGlmdCwgdGllcjogc2xvdC50aWVyLCBzY2hlbWU6IHBsYW5uZWQuc2NoZW1lLCB3ZWlnaHQ6IHBsYW5uZWQuc2V0c1swXT8ud2VpZ2h0ID8/IDAsIG91dGNvbWU6IFwibWlzc2VkXCIsIHJlcHM6IFtdLCBub3RlOiBcIm5vdCBsb2dnZWRcIiB9KTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCBwID0gc2xvdC5wcm9ncmVzc2lvbjtcbiAgICBpZiAocC5raW5kID09PSBcInBlcmNlbnRcIikge1xuICAgICAgY29uc3QgeyB0bURlbHRhLCB0bVNldCwgYWxzbywgcmVzIH0gPSBldmFsUGVyY2VudChkZWYsIGNmZywgc2xvdCwgc3RhdGUsIHBsYW5uZWQsIHNldHMpO1xuICAgICAgY29uc3QgYXQgPSBwLnRtUnVsZSAmJiBcImFwcGx5QXRcIiBpbiBwLnRtUnVsZSA/IHAudG1SdWxlLmFwcGx5QXQgOiB1bmRlZmluZWQ7XG4gICAgICBjb25zdCBkZWx0YXM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7IC4uLmFsc28gfTtcbiAgICAgIGlmICh0bURlbHRhKSBkZWx0YXNbcC50bUxpZnRdID0gKGRlbHRhc1twLnRtTGlmdF0gPz8gMCkgKyB0bURlbHRhO1xuICAgICAgaWYgKHRtU2V0ICE9IG51bGwpIHRtc1twLnRtTGlmdF0gPSB0bVNldDtcbiAgICAgIGZvciAoY29uc3QgW2xpZnQsIGRdIG9mIE9iamVjdC5lbnRyaWVzKGRlbHRhcykpIHtcbiAgICAgICAgaWYgKGF0ID09PSBcIndlZWtFbmRcIikgcGVuZGluZ1tsaWZ0XSA9IChwZW5kaW5nW2xpZnRdID8/IDApICsgZDtcbiAgICAgICAgZWxzZSBpZiAoYXQgPT09IFwiYWZ0ZXJOZXh0V2Vla1wiKSBwZW5kaW5nTmV4dFtsaWZ0XSA9IChwZW5kaW5nTmV4dFtsaWZ0XSA/PyAwKSArIGQ7XG4gICAgICAgIGVsc2UgdG1zW2xpZnRdID0gKHRtc1tsaWZ0XSA/PyAwKSArIGQ7XG4gICAgICB9XG4gICAgICByZXN1bHRzLnB1c2gocmVzKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBjb25zdCByID0gcC5raW5kID09PSBcInN0YWdlc1wiID8gZXZhbFN0YWdlcyhkZWYsIGNmZywgc2xvdCwgc2xvdHNbc2xvdC5pZF0sIHNldHMpIDogcC5raW5kID09PSBcImRvdWJsZVwiID8gZXZhbERvdWJsZShkZWYsIGNmZywgc2xvdCwgc2xvdHNbc2xvdC5pZF0sIHNldHMpIDogZXZhbEZpeGVkKHNsb3QsIHNsb3RzW3Nsb3QuaWRdLCBzZXRzKTtcbiAgICBzbG90c1tzbG90LmlkXSA9IHIubmV4dDtcbiAgICByZXN1bHRzLnB1c2goeyAuLi5yLnJlcywgc2NoZW1lOiByLnJlcy5zY2hlbWUgfHwgcGxhbm5lZC5zY2hlbWUgfSk7XG4gIH1cblxuICBjb25zdCBuZXh0ID0gZmlyc3RTY2hlZHVsZWQoZGVmLCBkYXlJbmRleCArIDEsIHN0YXRlLnJvdGF0aW9ucyk7XG4gIGlmIChuZXh0LnJvdGF0aW9ucyA+IHN0YXRlLnJvdGF0aW9ucykge1xuICAgIGZvciAoY29uc3QgW2xpZnQsIGRdIG9mIE9iamVjdC5lbnRyaWVzKHBlbmRpbmcpKSB0bXNbbGlmdF0gPSAodG1zW2xpZnRdID8/IDApICsgZDtcbiAgICBmb3IgKGNvbnN0IGsgb2YgT2JqZWN0LmtleXMocGVuZGluZykpIGRlbGV0ZSBwZW5kaW5nW2tdO1xuICAgIE9iamVjdC5hc3NpZ24ocGVuZGluZywgcGVuZGluZ05leHQpO1xuICAgIHBlbmRpbmdOZXh0ID0ge307XG4gIH1cbiAgLy8gT25jZS1wZXItY3ljbGUgVE0gYnVtcHMgKDUvMy8xKSB3aGVuIGEgcGFzcyBib3VuZGFyeSBsYW5kcyBvbiBhIGN5Y2xlIGJvdW5kYXJ5LlxuICBpZiAoZGVmLmN5Y2xlPy50bUluY3JlYXNlICYmICghZGVmLmN5Y2xlLmZpbml0ZSB8fCBkZWYuY3ljbGUudG1JbmNyZWFzZUV2ZXJ5IHx8IGRlZi5jeWNsZS50bUluY3JlYXNlQXQpKSB7XG4gICAgY29uc3QgeyB3ZWVrcywgdG1JbmNyZWFzZUF0OiBhdCB9ID0gZGVmLmN5Y2xlO1xuICAgIGNvbnN0IGV2ZXJ5ID0gZGVmLmN5Y2xlLnRtSW5jcmVhc2VFdmVyeSA/PyB3ZWVrcztcbiAgICBmb3IgKGxldCByID0gc3RhdGUucm90YXRpb25zICsgMTsgciA8PSBuZXh0LnJvdGF0aW9uczsgcisrKSB7XG4gICAgICBpZiAoZGVmLmN5Y2xlLmZpbml0ZSAmJiByID49IHdlZWtzKSBicmVhaztcbiAgICAgIC8vIHIgcGFzc2VzIGRvbmU6IHRoZSB3ZWVrIHRoYXQganVzdCBlbmRlZCBpcyAociBcdTIyMTIgMSkgb2YgdGhlIGN5Y2xlXG4gICAgICBpZiAoYXQgPyBhdC5pbmNsdWRlcygociAtIDEpICUgd2Vla3MpIDogciAlIGV2ZXJ5ID09PSAwKSBmb3IgKGNvbnN0IFtsaWZ0LCB3OF0gb2YgT2JqZWN0LmVudHJpZXMoZGVmLmN5Y2xlLnRtSW5jcmVhc2UpKSBpZiAodG1zW2xpZnRdICE9IG51bGwpIHRtc1tsaWZ0XSArPSBpbmModzgsIGNmZy51bml0KTtcbiAgICB9XG4gIH1cbiAgY29uc3QgZW50cnk6IExvZ0VudHJ5ID0geyB3b3Jrb3V0SWQ6IHcuaWQsIGRhdGU6IHcuc3RhcnRfdGltZSwgZGF5SWQ6IGRheS5pZCwgd2VlazogcGxhbi53ZWVrLCByZXN1bHRzIH07XG4gIGNvbnN0IGNvbXBsZXRlID0gISFkZWYuY3ljbGU/LmZpbml0ZSAmJiBuZXh0LnJvdGF0aW9ucyA+PSBkZWYuY3ljbGUud2Vla3M7XG4gIHJldHVybiB7IGRheUluZGV4OiBuZXh0LmRheUluZGV4LCByb3RhdGlvbnM6IG5leHQucm90YXRpb25zLCBzbG90cywgdG1zLCBsb2c6IFsuLi5zdGF0ZS5sb2csIGVudHJ5XSwgY29tcGxldGUsIHBlbmRpbmdUbTogcGVuZGluZywgLi4uKE9iamVjdC5rZXlzKHBlbmRpbmdOZXh0KS5sZW5ndGggPyB7IHBlbmRpbmdUbU5leHQ6IHBlbmRpbmdOZXh0IH0gOiB7fSkgfTtcbn1cblxuLyoqIFdoaWNoIHByb2dyYW0gZGF5IGEgSGV2eSB3b3Jrb3V0IHdhcywgb3IgLTEgaWYgaXQgaXNuJ3QgYSBwcm9ncmFtIHNlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gbWF0Y2hEYXkoZGVmOiBQcm9ncmFtRGVmLCBjZmc6IFByb2dyYW1Db25maWcsIHN0YXRlOiBQcm9ncmFtU3RhdGUsIHc6IEhldnlXb3Jrb3V0KTogbnVtYmVyIHtcbiAgLy8gTG9nZ2VkIGluIGd5bSBtb2RlOiB0aGUgd29ya291dCBjYXJyaWVzIGl0cyBwcm9ncmFtIGRheS5cbiAgY29uc3QgdGFnID0gdy5kZXNjcmlwdGlvbj8ubWF0Y2goL1xcW2h0OihbXlxcXV0rKVxcXS8pPy5bMV07XG4gIGlmICh0YWcpIHtcbiAgICBjb25zdCBpID0gZGVmLmRheXMuZmluZEluZGV4KChkKSA9PiBkLmlkID09PSB0YWcpO1xuICAgIGlmIChpID49IDApIHJldHVybiBpO1xuICB9XG4gIGlmICh3LnJvdXRpbmVfaWQgJiYgY2ZnLnJvdXRpbmVEYXlzPy5bdy5yb3V0aW5lX2lkXSkge1xuICAgIGNvbnN0IGkgPSBkZWYuZGF5cy5maW5kSW5kZXgoKGQpID0+IGQuaWQgPT09IGNmZy5yb3V0aW5lRGF5cyFbdy5yb3V0aW5lX2lkIV0pO1xuICAgIGlmIChpID49IDApIHJldHVybiBpO1xuICB9XG4gIGNvbnN0IG9yZGVyID0gdy5leGVyY2lzZXMubWFwKChlKSA9PiBtYXRjaExpZnQoZS50aXRsZSwgZS5leGVyY2lzZV90ZW1wbGF0ZV9pZCwgY2ZnLmxpZnRNYXApKS5maWx0ZXIoKHgpOiB4IGlzIHN0cmluZyA9PiAhIXgpO1xuICBjb25zdCBsaWZ0cyA9IG5ldyBTZXQob3JkZXIpO1xuICBjb25zdCB3ZWVrID0gd2Vla0luZGV4KGRlZiwgc3RhdGUucm90YXRpb25zKTtcbiAgLy8gU2NvcmUgZWFjaCBkYXkgYnkgaG93IHdlbGwgZXZlcnkgc2xvdCdzIGxvZ2dlZCBzZXRzIGZpdCBpdHMgc2NoZW1lICg1XHUwMEQ3MysgdnMgM1x1MDBENzEwIHRlbGxzXG4gIC8vIEExIGZyb20gQTIgZXZlbiB0aG91Z2ggYm90aCBoYXZlIHNxdWF0IGFuZCBiZW5jaCkuIEJvbnVzZXMgZm9yIHRoZSBtYWluIGxpZnQgZ29pbmcgZmlyc3QsXG4gIC8vIGJlaW5nIHNjaGVkdWxlZCB0aGlzIHdlZWssIGFuZCBiZWluZyB0aGUgZXhwZWN0ZWQgbmV4dCBkYXkgYnJlYWsgdGllcy5cbiAgbGV0IGJlc3QgPSAtMSwgYmVzdFNjb3JlID0gMDtcbiAgZm9yIChsZXQgayA9IDA7IGsgPCBkZWYuZGF5cy5sZW5ndGg7IGsrKykge1xuICAgIGNvbnN0IGkgPSAoc3RhdGUuZGF5SW5kZXggKyBrKSAlIGRlZi5kYXlzLmxlbmd0aDtcbiAgICBjb25zdCBkID0gZGVmLmRheXNbaV07XG4gICAgLy8gQW5jaG9yIG9uIHRoZSBkYXkncyBmaXJzdCBsaWZ0IHdlIGNhbiByZWNvZ25pemUgaW4gSGV2eSAocGF1c2UgZGVhZGxpZnQgZXRjLiBuZWVkIGEgY3VzdG9tIG1hcHBpbmcpLlxuICAgIGNvbnN0IGFuY2hvciA9IGQuc2xvdHMuZmluZCgoeCkgPT4gKExJRlRTW3gubGlmdF0/LmhldnkubGVuZ3RoID8/IDApID4gMCB8fCBjZmcubGlmdE1hcD8uW3gubGlmdF0pID8/IGQuc2xvdHNbMF07XG4gICAgaWYgKCFhbmNob3IgfHwgIWxpZnRzLmhhcyhhbmNob3IubGlmdCkpIGNvbnRpbnVlO1xuICAgIGNvbnN0IHVzZWQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuICAgIGxldCBzY29yZSA9IDA7XG4gICAgZm9yIChjb25zdCBzbG90IG9mIGQuc2xvdHMpIHtcbiAgICAgIGNvbnN0IG4gPSB1c2VkLmdldChzbG90LmxpZnQpID8/IDA7XG4gICAgICB1c2VkLnNldChzbG90LmxpZnQsIG4gKyAxKTtcbiAgICAgIHNjb3JlICs9IHNsb3RGaXQoc2xvdCwgc3RhdGUsIHBlcmZvcm1lZEZvcih3LCBzbG90LmxpZnQsIGNmZylbbl0gPz8gW10pICogKHNsb3QgPT09IGFuY2hvciA/IDEuNSA6IDEpO1xuICAgIH1cbiAgICBzY29yZSArPSAob3JkZXJbMF0gPT09IGFuY2hvci5saWZ0ID8gMC41IDogMCkgKyAoayA9PT0gMCA/IDAuMjUgOiAwKSArIChpc1NjaGVkdWxlZChkLCB3ZWVrKSA/IDEuNSA6IDApO1xuICAgIGlmIChzY29yZSA+IGJlc3RTY29yZSkgeyBiZXN0ID0gaTsgYmVzdFNjb3JlID0gc2NvcmU7IH1cbiAgfVxuICByZXR1cm4gYmVzdDtcbn1cblxuZnVuY3Rpb24gYXBwbHlBZGp1c3RtZW50cyhzdGF0ZTogUHJvZ3JhbVN0YXRlLCBhZGo6IEFkanVzdG1lbnRbXSk6IFByb2dyYW1TdGF0ZSB7XG4gIGNvbnN0IHNsb3RzID0geyAuLi5zdGF0ZS5zbG90cyB9O1xuICBjb25zdCB0bXMgPSB7IC4uLnN0YXRlLnRtcyB9O1xuICBmb3IgKGNvbnN0IGEgb2YgYWRqKSB7XG4gICAgaWYgKGEuc2xvdElkICYmIHNsb3RzW2Euc2xvdElkXSkge1xuICAgICAgY29uc3QgcyA9IHsgLi4uc2xvdHNbYS5zbG90SWRdIH07XG4gICAgICBpZiAoYS53ZWlnaHQgIT0gbnVsbCkgeyBzLndlaWdodCA9IGEud2VpZ2h0OyBpZiAoKGEuc3RhZ2UgPz8gcy5zdGFnZSkgPT09IDApIHMuc3RhZ2UwV2VpZ2h0ID0gYS53ZWlnaHQ7IH1cbiAgICAgIGlmIChhLnN0YWdlICE9IG51bGwpIHMuc3RhZ2UgPSBhLnN0YWdlO1xuICAgICAgcy5yZXRlc3QgPSBmYWxzZTtcbiAgICAgIHMuZmFpbHMgPSAwO1xuICAgICAgc2xvdHNbYS5zbG90SWRdID0gcztcbiAgICB9XG4gICAgaWYgKGEubGlmdCAmJiBhLnRtICE9IG51bGwpIHRtc1thLmxpZnRdID0gYS50bTtcbiAgfVxuICByZXR1cm4geyAuLi5zdGF0ZSwgc2xvdHMsIHRtcyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlcGxheU9wdGlvbnMge1xuICAvKiogUmFtcCBiYWNrIGluIGFmdGVyIGJyZWFrcy4gRGVmYXVsdCBvbjsgc2V0IGZhbHNlIHRvIGRpc2FibGUuICovXG4gIHJlZW50cnk/OiBmYWxzZSB8IHsgbWluR2FwRGF5cz86IG51bWJlciB9O1xuICAvKiogdG9kYXkncyBsb2NhbCBkYXRlLCBzbyBhIGJyZWFrIHlvdSdyZSBzdGlsbCBvbiBzaG93cyB1cCBpbiB0aGUgbmV4dCBwbGFuICovXG4gIHRvZGF5Pzogc3RyaW5nO1xufVxuXG4vKipcbiAqIExpZ2h0ZXIgc2Vzc2lvbnMgdG8gdGFrZSBhZnRlciBhIGJyZWFrIG9mIGBnYXBEYXlzYCAoMCA9IG5vbmUpLiBTdHJlbmd0aCBob2xkcyBmb3IgfjQgd2Vla3Mgb2ZmXG4gKiBhbmQgY29tZXMgYmFjayBpbiBhYm91dCBoYWxmIHRoZSBicmVhayBhZnRlciB0aGF0IChkb2NzL3RyYWluaW5nL0NPTUVCQUNLLm1kKSwgc28gbG9uZ2VyXG4gKiBicmVha3MgZ2V0IGxvbmdlciByYW1wcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJhbXBMZW5ndGgoZ2FwRGF5czogbnVtYmVyLCBtaW5HYXBEYXlzID0gOSk6IG51bWJlciB7XG4gIGlmIChnYXBEYXlzIDwgbWluR2FwRGF5cykgcmV0dXJuIDA7XG4gIHJldHVybiBnYXBEYXlzIDwgMTQgPyAyIDogZ2FwRGF5cyA8IDI4ID8gMyA6IGdhcERheXMgPCA1NiA/IDQgOiBnYXBEYXlzIDwgMTEyID8gNiA6IDg7XG59XG5cbi8qKlxuICogTG93ZXItYm9keSBsaWZ0cyByYW1wIG9uZSBleHBvc3VyZSBzbG93ZXI6IHNxdWF0cyBhbmQgbHVuZ2VzIGxvYWQgYmlnIG11c2NsZXMgZWNjZW50cmljYWxseSBhdFxuICogbG9uZyBsZW5ndGhzLCB3aGljaCBpcyB3aGF0IG1ha2VzIHRoZSBmaXJzdCBzZXNzaW9ucyBiYWNrIHNvIHNvcmUgKHRoZSByZXBlYXRlZCBib3V0IGVmZmVjdFxuICogZmFkZXMgd2l0aGluIH4zIHdlZWtzKS4gVXBwZXItYm9keSBzdHJlbmd0aCBjb21lcyBiYWNrIGF0IHRoZSBzYW1lIHJhdGUsIHdpdGggZmFyIGxlc3Mgc29yZW5lc3MuXG4gKi9cbmV4cG9ydCBjb25zdCByYW1wc1Nsb3dlciA9IChsaWZ0OiBzdHJpbmcpOiBib29sZWFuID0+IExJRlRTW2xpZnRdID8gIUxJRlRTW2xpZnRdLnVwcGVyIDogZmFsc2U7XG5cbi8qKiBSYW1wIGV4cG9zdXJlcyBhIGxpZnQgbmVlZHMgYmVmb3JlIGl0J3MgYmFjayB0byBmdWxsIGxvYWQgYW5kIHZvbHVtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByYW1wTmVlZChyOiBSZWVudHJ5LCBsaWZ0OiBzdHJpbmcpOiBudW1iZXIge1xuICByZXR1cm4gTWF0aC5tYXgoMSwgcmFtcExlbmd0aChyLmdhcERheXMsIDApKSArIChyYW1wc1Nsb3dlcihsaWZ0KSA/IDEgOiAwKTtcbn1cblxuLyoqIEhvdyBmYXIgdGhyb3VnaCBpdHMgcmFtcCBhIGxpZnQgaXMgKDAgPSBmaXJzdCBleHBvc3VyZSwgMSA9IGRvbmUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJhbXBQcm9ncmVzcyhyOiBSZWVudHJ5LCBsaWZ0Pzogc3RyaW5nKTogbnVtYmVyIHtcbiAgaWYgKCFsaWZ0IHx8ICFyLnNlZW4pIHJldHVybiByLnRvdGFsID8gci5kb25lIC8gci50b3RhbCA6IDE7XG4gIHJldHVybiBNYXRoLm1pbigxLCAoci5zZWVuW2xpZnRdID8/IDApIC8gcmFtcE5lZWQociwgbGlmdCkpO1xufVxuXG4vKiogTWFpbiBhbmQgc3VwcGxlbWVudGFsIHdvcmsgZGVjaWRlcyBob3cgbG9uZyB0aGUgcmFtcCBsYXN0czsgYWNjZXNzb3JpZXMganVzdCBjb21lIGFsb25nLiAqL1xuY29uc3QgcmFtcExpZnRzID0gKGRlZjogUHJvZ3JhbURlZik6IHN0cmluZ1tdID0+XG4gIFsuLi5uZXcgU2V0KGRlZi5kYXlzLmZsYXRNYXAoKGQpID0+IGQuc2xvdHMpLmZpbHRlcigoeCkgPT4geC50aWVyICE9PSBcIkFDQ1wiICYmIHgudGllciAhPT0gXCJUM1wiKS5tYXAoKHgpID0+IHgubGlmdCkpXTtcblxuLyoqXG4gKiBTdGFydCBhIHJhbXAgZnJvbSBgc3RhdGVgJ3MgbmV4dCBkYXk6IGVub3VnaCBzZXNzaW9ucyBmb3IgZXZlcnkgbWFpbiBsaWZ0IHRvIGdldCBpdHMgZXhwb3N1cmVzXG4gKiAoc3F1YXQgb24gMiBvZiA0IGRheXMgbmVlZHMgbW9yZSBzZXNzaW9ucyB0aGFuIHNxdWF0IGV2ZXJ5IGRheSksIGF0IG1vc3QgdHdpY2UgdGhlIGJhc2UgbGVuZ3RoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RhcnRSYW1wKGRlZjogUHJvZ3JhbURlZiwgc3RhdGU6IFByb2dyYW1TdGF0ZSwgZ2FwRGF5czogbnVtYmVyLCBtaW5HYXBEYXlzID0gOSk6IFJlZW50cnkgfCB1bmRlZmluZWQge1xuICBjb25zdCBiYXNlID0gcmFtcExlbmd0aChnYXBEYXlzLCBtaW5HYXBEYXlzKTtcbiAgaWYgKCFiYXNlKSByZXR1cm4gdW5kZWZpbmVkO1xuICBjb25zdCByOiBSZWVudHJ5ID0geyBnYXBEYXlzLCB0b3RhbDogYmFzZSwgZG9uZTogMCwgc2Vlbjoge30gfTtcbiAgY29uc3QgbGlmdHMgPSByYW1wTGlmdHMoZGVmKTtcbiAgY29uc3Qgc2VlbjogUmVjb3JkPHN0cmluZywgbnVtYmVyPiA9IHt9O1xuICBsZXQgcG9zID0geyBkYXlJbmRleDogc3RhdGUuZGF5SW5kZXgsIHJvdGF0aW9uczogc3RhdGUucm90YXRpb25zIH07XG4gIGxldCBuID0gMDtcbiAgd2hpbGUgKG4gPCBiYXNlICogMiAmJiBsaWZ0cy5zb21lKChsKSA9PiAoc2VlbltsXSA/PyAwKSA8IHJhbXBOZWVkKHIsIGwpKSkge1xuICAgIGZvciAoY29uc3QgbCBvZiBuZXcgU2V0KGRlZi5kYXlzW3Bvcy5kYXlJbmRleF0uc2xvdHMubWFwKCh4KSA9PiB4LmxpZnQpKSkgc2VlbltsXSA9IChzZWVuW2xdID8/IDApICsgMTtcbiAgICBuKys7XG4gICAgcG9zID0gZmlyc3RTY2hlZHVsZWQoZGVmLCBwb3MuZGF5SW5kZXggKyAxLCBwb3Mucm90YXRpb25zKTtcbiAgfVxuICByZXR1cm4geyAuLi5yLCB0b3RhbDogTWF0aC5tYXgoYmFzZSwgbikgfTtcbn1cblxuLyoqIExpZnRzIHdoZXJlIHlvdSBoaXQgeW91ciBub3JtYWwgKHVuLXJhbXBlZCkgdG9wIHdlaWdodCBmb3IgaXRzIHJlcHM6IHlvdSd2ZSBiZWF0ZW4gdGhlIHJhbXAuICovXG5mdW5jdGlvbiBiZWF0UmFtcChkZWY6IFByb2dyYW1EZWYsIGNmZzogUHJvZ3JhbUNvbmZpZywgc3RhdGU6IFByb2dyYW1TdGF0ZSwgdzogSGV2eVdvcmtvdXQsIGRheUluZGV4OiBudW1iZXIpOiBzdHJpbmdbXSB7XG4gIGNvbnN0IHBsYW4gPSBwbGFuRGF5KGRlZiwgY2ZnLCBzdGF0ZSwgZGF5SW5kZXgpO1xuICBjb25zdCB1c2VkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcbiAgY29uc3Qgb3V0OiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGUgb2YgcGxhbi5leGVyY2lzZXMpIHtcbiAgICBjb25zdCBuID0gdXNlZC5nZXQoZS5saWZ0KSA/PyAwO1xuICAgIHVzZWQuc2V0KGUubGlmdCwgbiArIDEpO1xuICAgIGNvbnN0IHRvcCA9IE1hdGgubWF4KDAsIC4uLmUuc2V0cy5tYXAoKHgpID0+IHgud2VpZ2h0KSk7XG4gICAgaWYgKCF0b3ApIGNvbnRpbnVlO1xuICAgIGNvbnN0IHJlcHMgPSBNYXRoLm1pbiguLi5lLnNldHMuZmlsdGVyKCh4KSA9PiB4LndlaWdodCA+PSB0b3ApLm1hcCgoeCkgPT4geC5yZXBzKSk7XG4gICAgY29uc3QgdG9sID0gTWF0aC5tYXgoMSwgdG9wICogMC4wMik7XG4gICAgaWYgKChwZXJmb3JtZWRGb3IodywgZS5saWZ0LCBjZmcpW25dID8/IFtdKS5zb21lKCh4KSA9PiB4LndlaWdodCA+PSB0b3AgLSB0b2wgJiYgeC5yZXBzID49IHJlcHMpKSBvdXQucHVzaChlLmxpZnQpO1xuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBDb3VudCBvbmUgcmFtcCBzZXNzaW9uOiBleHBvc3VyZXMgZm9yIHdoYXQgeW91IGRpZCwgZWFybHkgZmluaXNoIGZvciBsaWZ0cyB5b3UgYmVhdC4gKi9cbmZ1bmN0aW9uIGFkdmFuY2VSYW1wKGRlZjogUHJvZ3JhbURlZiwgcjogUmVlbnRyeSwgcmVzdWx0czogU2xvdFJlc3VsdFtdLCBiZWF0ZW46IHN0cmluZ1tdKTogUmVlbnRyeSB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHNlZW4gPSB7IC4uLnIuc2VlbiB9O1xuICBmb3IgKGNvbnN0IGwgb2YgbmV3IFNldChyZXN1bHRzLmZpbHRlcigoeCkgPT4geC5yZXBzLmxlbmd0aCA+IDApLm1hcCgoeCkgPT4geC5saWZ0KSkpIHNlZW5bbF0gPSAoc2VlbltsXSA/PyAwKSArIDE7XG4gIGZvciAoY29uc3QgbCBvZiBiZWF0ZW4pIHNlZW5bbF0gPSBNYXRoLm1heChzZWVuW2xdID8/IDAsIHJhbXBOZWVkKHIsIGwpKTtcbiAgY29uc3QgbmV4dDogUmVlbnRyeSA9IHsgLi4uciwgZG9uZTogci5kb25lICsgMSwgc2VlbiB9O1xuICBjb25zdCBhbGxCYWNrID0gcmFtcExpZnRzKGRlZikuZXZlcnkoKGwpID0+IChzZWVuW2xdID8/IDApID49IHJhbXBOZWVkKHIsIGwpKTtcbiAgcmV0dXJuIG5leHQuZG9uZSA+PSByLnRvdGFsIHx8IGFsbEJhY2sgPyB1bmRlZmluZWQgOiBuZXh0O1xufVxuXG5jb25zdCBkYXlzQmV0d2VlbiA9IChhOiBzdHJpbmcsIGI6IHN0cmluZykgPT4gTWF0aC5mbG9vcigoRGF0ZS5wYXJzZShiKSAtIERhdGUucGFyc2UoYSkpIC8gODY0ZTUpO1xuXG4vKipcbiAqIER1cmluZyByZS1lbnRyeSBhIHNlc3Npb24gY2FuIG9ubHkga2VlcCBvciBpbXByb3ZlIHlvdXIgcHJvZ3Jlc3Npb246IGFueXRoaW5nIHRoYXQgd291bGQgbG93ZXJcbiAqIGEgd2VpZ2h0LCBzdGVwIGRvd24gYSBzdGFnZSwgY291bnQgYSBtaXNzLCBvciBkcm9wIGEgVE0gaXMgaWdub3JlZC4gTGlmdGluZyB5b3VyIHByZS1icmVha1xuICogd2VpZ2h0IHN0aWxsIGNvdW50cyBhcyBhIHBhc3MuXG4gKi9cbmZ1bmN0aW9uIGd1YXJkUmVlbnRyeShiZWZvcmU6IFByb2dyYW1TdGF0ZSwgYWZ0ZXI6IFByb2dyYW1TdGF0ZSk6IFByb2dyYW1TdGF0ZSB7XG4gIGNvbnN0IHNsb3RzID0geyAuLi5hZnRlci5zbG90cyB9O1xuICBjb25zdCB0bXMgPSB7IC4uLmFmdGVyLnRtcyB9O1xuICBjb25zdCBwZW5kaW5nID0geyAuLi5hZnRlci5wZW5kaW5nVG0gfTtcbiAgY29uc3QgciA9IGJlZm9yZS5yZWVudHJ5ITtcbiAgY29uc3QgdGFnID0gYHJlLWVudHJ5ICR7ci5kb25lICsgMX0vJHtyLnRvdGFsfSBhZnRlciAke3IuZ2FwRGF5c30gZGF5c2A7XG4gIGNvbnN0IGVudHJ5ID0gYWZ0ZXIubG9nW2FmdGVyLmxvZy5sZW5ndGggLSAxXTtcbiAgY29uc3QgcmVzdWx0cyA9IGVudHJ5LnJlc3VsdHMubWFwKChyZXMpID0+IHtcbiAgICBjb25zdCBiID0gYmVmb3JlLnNsb3RzW3Jlcy5zbG90SWRdLCBhID0gc2xvdHNbcmVzLnNsb3RJZF07XG4gICAgbGV0IHJldmVydGVkID0gZmFsc2U7XG4gICAgaWYgKGIgJiYgYSAmJiAoYS53ZWlnaHQgPCBiLndlaWdodCB8fCBhLnN0YWdlID4gYi5zdGFnZSB8fCAoYS5mYWlscyA/PyAwKSA+IChiLmZhaWxzID8/IDApIHx8IChhLnJldGVzdCAmJiAhYi5yZXRlc3QpKSkge1xuICAgICAgc2xvdHNbcmVzLnNsb3RJZF0gPSBiO1xuICAgICAgcmV2ZXJ0ZWQgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAodG1zW3Jlcy5saWZ0XSAhPSBudWxsICYmIGJlZm9yZS50bXNbcmVzLmxpZnRdICE9IG51bGwgJiYgdG1zW3Jlcy5saWZ0XSA8IGJlZm9yZS50bXNbcmVzLmxpZnRdKSB7IHRtc1tyZXMubGlmdF0gPSBiZWZvcmUudG1zW3Jlcy5saWZ0XTsgcmV2ZXJ0ZWQgPSB0cnVlOyB9XG4gICAgaWYgKChwZW5kaW5nW3Jlcy5saWZ0XSA/PyAwKSA8IChiZWZvcmUucGVuZGluZ1RtPy5bcmVzLmxpZnRdID8/IDApKSB7IHBlbmRpbmdbcmVzLmxpZnRdID0gYmVmb3JlLnBlbmRpbmdUbT8uW3Jlcy5saWZ0XSA/PyAwOyByZXZlcnRlZCA9IHRydWU7IH1cbiAgICBpZiAocmV2ZXJ0ZWQgfHwgcmVzLm91dGNvbWUgPT09IFwibWlzc2VkXCIpIHJldHVybiB7IC4uLnJlcywgb3V0Y29tZTogXCJob2xkXCIgYXMgT3V0Y29tZSwgbm90ZTogYCR7dGFnfTogbm90IGNvdW50ZWQgKCR7cmVzLm5vdGV9KWAgfTtcbiAgICByZXR1cm4geyAuLi5yZXMsIG5vdGU6IGAke3RhZ30gXHUwMEI3ICR7cmVzLm5vdGV9YCB9O1xuICB9KTtcbiAgcmV0dXJuIHsgLi4uYWZ0ZXIsIHNsb3RzLCB0bXMsIHBlbmRpbmdUbTogcGVuZGluZywgbG9nOiBbLi4uYWZ0ZXIubG9nLnNsaWNlKDAsIC0xKSwgeyAuLi5lbnRyeSwgcmVzdWx0cyB9XSB9O1xufVxuXG4vKiogUmVwbGF5IGhpc3RvcnkgKG9sZGVzdCBmaXJzdCkgZnJvbSBjZmcuc3RhcnREYXRlIGludG8gdGhlIGN1cnJlbnQgcHJvZ3JhbSBzdGF0ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXBsYXkoZGVmOiBQcm9ncmFtRGVmLCBjZmc6IFByb2dyYW1Db25maWcsIHdvcmtvdXRzOiBIZXZ5V29ya291dFtdLCBvcHRzOiBSZXBsYXlPcHRpb25zID0ge30pOiBQcm9ncmFtU3RhdGUge1xuICBsZXQgc3RhdGUgPSBpbml0aWFsU3RhdGUoZGVmLCBjZmcpO1xuICBjb25zdCBhZGogPSBbLi4uKGNmZy5hZGp1c3RtZW50cyA/PyBbXSldLnNvcnQoKGEsIGIpID0+IGEuZGF0ZS5sb2NhbGVDb21wYXJlKGIuZGF0ZSkpO1xuICBsZXQgYWkgPSAwO1xuICBjb25zdCBtaW5HYXAgPSBvcHRzLnJlZW50cnkgPT09IGZhbHNlIHx8IGRlZi5idWlsdEluUmFtcCA/IEluZmluaXR5IDogb3B0cy5yZWVudHJ5Py5taW5HYXBEYXlzID8/IDk7XG4gIGxldCBsYXN0U2Vzc2lvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0IHNvcnRlZCA9IHdvcmtvdXRzLmZpbHRlcigodykgPT4gdy5zdGFydF90aW1lID49IGNmZy5zdGFydERhdGUpLnNvcnQoKGEsIGIpID0+IGEuc3RhcnRfdGltZS5sb2NhbGVDb21wYXJlKGIuc3RhcnRfdGltZSkpO1xuICBmb3IgKGNvbnN0IHcgb2Ygc29ydGVkKSB7XG4gICAgaWYgKHN0YXRlLmNvbXBsZXRlKSBicmVhaztcbiAgICBjb25zdCBkdWU6IEFkanVzdG1lbnRbXSA9IFtdO1xuICAgIHdoaWxlIChhaSA8IGFkai5sZW5ndGggJiYgYWRqW2FpXS5kYXRlIDw9IHcuc3RhcnRfdGltZSkgZHVlLnB1c2goYWRqW2FpKytdKTtcbiAgICBpZiAoZHVlLmxlbmd0aCkgc3RhdGUgPSBhcHBseUFkanVzdG1lbnRzKHN0YXRlLCBkdWUpO1xuICAgIGNvbnN0IGQgPSBtYXRjaERheShkZWYsIGNmZywgc3RhdGUsIHcpO1xuICAgIGlmIChkIDwgMCkgY29udGludWU7XG4gICAgLy8gR2FwcyBhcmUgbWVhc3VyZWQgYmV0d2VlbiBwcm9ncmFtIHNlc3Npb25zOyBob3RlbC1neW0gb3Igb3RoZXIgd29ya291dHMgZG9uJ3QgcmVzZXQgdGhlbS5cbiAgICBpZiAobGFzdFNlc3Npb24gJiYgTnVtYmVyLmlzRmluaXRlKG1pbkdhcCkpIHtcbiAgICAgIGNvbnN0IHIgPSBzdGFydFJhbXAoZGVmLCBzdGF0ZSwgZGF5c0JldHdlZW4obGFzdFNlc3Npb24sIHcuc3RhcnRfdGltZSksIG1pbkdhcCk7XG4gICAgICBpZiAocikgc3RhdGUgPSB7IC4uLnN0YXRlLCByZWVudHJ5OiByIH07XG4gICAgfVxuICAgIGNvbnN0IGJlZm9yZSA9IHN0YXRlO1xuICAgIGxldCBuZXh0ID0gYXBwbHlXb3Jrb3V0KGRlZiwgY2ZnLCBzdGF0ZSwgdywgZCk7XG4gICAgaWYgKGJlZm9yZS5yZWVudHJ5ICYmIGJlZm9yZS5yZWVudHJ5LmRvbmUgPCBiZWZvcmUucmVlbnRyeS50b3RhbCkge1xuICAgICAgbmV4dCA9IGd1YXJkUmVlbnRyeShiZWZvcmUsIG5leHQpO1xuICAgICAgY29uc3QgcmVzdWx0cyA9IG5leHQubG9nW25leHQubG9nLmxlbmd0aCAtIDFdLnJlc3VsdHM7XG4gICAgICBuZXh0ID0geyAuLi5uZXh0LCByZWVudHJ5OiBhZHZhbmNlUmFtcChkZWYsIGJlZm9yZS5yZWVudHJ5LCByZXN1bHRzLCBiZWF0UmFtcChkZWYsIGNmZywgYmVmb3JlLCB3LCBkKSkgfTtcbiAgICB9XG4gICAgc3RhdGUgPSBuZXh0O1xuICAgIGxhc3RTZXNzaW9uID0gdy5zdGFydF90aW1lO1xuICB9XG4gIGlmIChhaSA8IGFkai5sZW5ndGgpIHN0YXRlID0gYXBwbHlBZGp1c3RtZW50cyhzdGF0ZSwgYWRqLnNsaWNlKGFpKSk7XG4gIC8vIFN0aWxsIG9uIGEgYnJlYWs6IHRoZSBuZXh0IHNlc3Npb24gc3RhcnRzIGEgcmFtcC5cbiAgaWYgKG9wdHMudG9kYXkgJiYgbGFzdFNlc3Npb24gJiYgTnVtYmVyLmlzRmluaXRlKG1pbkdhcCkpIHtcbiAgICBjb25zdCByID0gc3RhcnRSYW1wKGRlZiwgc3RhdGUsIGRheXNCZXR3ZWVuKGxhc3RTZXNzaW9uLnNsaWNlKDAsIDEwKSwgb3B0cy50b2RheSksIG1pbkdhcCk7XG4gICAgaWYgKHIpIHN0YXRlID0geyAuLi5zdGF0ZSwgcmVlbnRyeTogciB9O1xuICB9XG4gIHJldHVybiBzdGF0ZTtcbn1cbiIsICIvLyBCb3JpcyBTaGVpa28ncyBjbGFzc2ljIG51bWJlcmVkIHByb2dyYW1zOiAjMjlcdTIwMTMjMzIgKHByZXAgXHUyMTkyIGNvbXBldGl0aW9uKSwgIzM3LCB0aGUgU2hlaWtvXG4vLyBCZWdpbm5lciBwcmVwL2NvbXAgY3ljbGVzLCBhbmQgQWR2YW5jZWQgTWVkaXVtIExvYWQgKEFNTCkuXG4vL1xuLy8gU291cmNlOiB0aGUgd2lkZWx5IHNoYXJlZCBDaGFzZVQgKDIwMDguMDUuMDkpIFNoZWlrbyBzcHJlYWRzaGVldHMgYXMgaG9zdGVkIGJ5IExpZnRWYXVsdFxuLy8gKFwiU2hlaWtvIFByb2dyYW0gU3ByZWFkc2hlZXRzXCI6IHRhYnMgIzI5LCAjMzAsICMzMSwgIzMyLCAjMzc7IFwiU2hlaWtvIEJlZ2lubmVyXCI6IHRhYnNcbi8vIFByZXBfMSwgQ29tcDsgXCJTaGVpa28gQWR2YW5jZWQgTWVkaXVtIExvYWRcIjogdGFicyBQcmVwIEN5Y2xlIElcdTIwMTNJSUksIENvbXAgQ3ljbGUpLiBUaGUgZGF5XG4vLyB0YWJsZXMgYmVsb3cgd2VyZSBleHRyYWN0ZWQgZnJvbSB0aG9zZSBzaGVldHMnICUvcmVwcy9zZXRzIGNvbHVtbnMgYnkgc2NyaXB0IGFuZCBhcmUgZXhhY3QuXG4vL1xuLy8gUnVsZXM6IGV2ZXJ5IHNldCBpcyBhIGZpeGVkICUgb2YgeW91ciBjb21wZXRpdGlvbiAxUk0gKG5vIEFNUkFQcywgbm8gYXV0by1yZWd1bGF0aW9uKS4gRWFjaFxuLy8gYmxvY2sgaXMgYSBmaXhlZCBzZXF1ZW5jZSBvZiB1bmlxdWUgc2Vzc2lvbnM7IHRoZSBwcm9ncmFtIGVuZHMgYWZ0ZXIgdGhlIGxhc3Qgd2Vlay4gVmFyaWF0aW9uc1xuLy8gdXNlIHRoZSBwYXJlbnQgbGlmdCdzIDFSTTogZnJvbnQvcGF1c2Ugc3F1YXQgXHUyMTkyIHNxdWF0OyBoYWx0aW5nLCBwYXVzZWQsIGNoYWluIGFuZCBkZWZpY2l0XG4vLyBkZWFkbGlmdHMgYW5kIGJsb2NrIHB1bGxzIFx1MjE5MiBkZWFkbGlmdDsgYm9hcmQvY2hhaW4vY2xvc2UtZ3JpcC9kZWNsaW5lIGJlbmNoIFx1MjE5MiBiZW5jaC5cbi8vIEhhbHRpbmcvcGF1c2VkL2NoYWluIGRlYWRsaWZ0cyBhbmQgYm9hcmQvY2hhaW4gcHJlc3NlcyBhcmUgbG9nZ2VkIGFzIHRoZSBwbGFpbiBsaWZ0ICh3aXRoIGFcbi8vIG5vdGUpOyBibG9jayBwdWxscyAoXCJkZWFkbGlmdCBmcm9tIGJveGVzXCIpIGFzIFJhY2sgUHVsbC4gQSBsaWZ0IGRvbmUgdHdpY2UgaW4gYSBzZXNzaW9uIGdldHNcbi8vIGl0cyBvd24gc2xvdCAoXHUyMDI2LWJlbmNoLCBcdTIwMjYtYmVuY2gyKSwgbWF0Y2hlZCB0byBIZXZ5IGV4ZXJjaXNlIGJsb2NrcyBpbiBvcmRlci5cbi8vIEFjY2Vzc29yaWVzIChHUFApIGFyZSBgZml4ZWRgIHdpdGggdGhlIHNoZWV0J3Mgc2V0c1x1MDBEN3JlcHM7IHRoZSBzaGVldCBnaXZlcyBubyBsb2FkLiBHZW5lcmljXG4vLyByb3dzIChcIkNoZXN0IG11c2NsZXNcIiwgXCJMYXQgbXVzY2xlc1wiLCBcIkFic1wiXHUyMDI2KSBtYXAgdG8gYSByZXByZXNlbnRhdGl2ZSBsaWZ0IHdpdGggYSBub3RlLlxuLy8gV2hlcmUgdGhlIHNoZWV0IHNheXMgXCIxMDBcdTIwMTMxMDUlIFx1MDBENyAyXHUyMDEzMyBzaW5nbGVzXCIgKG1heCB0ZXN0KSB3ZSBwcmVzY3JpYmUgMiBcdTAwRDcgMSBAIDEwMCUgKyBub3RlLlxuXG5pbXBvcnQgdHlwZSB7IERheURlZiwgUGVyY2VudFNldCwgUHJvZ3JhbURlZiwgUHJvZ3JhbVRlbXBsYXRlLCBTbG90RGVmLCBUaWVyIH0gZnJvbSBcIi4uL3Byb2dyYW1cIjtcbmltcG9ydCB0eXBlIHsgVW5pdCB9IGZyb20gXCIuLi91bml0c1wiO1xuXG4vKiogW2xpZnQsIFwicmVwc0BwY3RbeFNldHNdIFx1MjAyNlwiIGZvciAlIHdvcmsgb3IgXCJTRVRTeFJFUFNcIiBmb3IgYWNjZXNzb3JpZXMsIG5vdGU/XSAqL1xudHlwZSBFbnRyeSA9IFtzdHJpbmcsIHN0cmluZywgc3RyaW5nP107XG50eXBlIFdrID0gW3N0cmluZywgRW50cnlbXV1bXTtcblxuLyoqIFdob3NlIDFSTSBhIHZhcmlhdGlvbidzIHBlcmNlbnRhZ2VzIGFyZSBvZi4gKi9cbmNvbnN0IFRNX09GOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICBmcm9udFNxdWF0OiBcInNxdWF0XCIsIHBhdXNlU3F1YXQ6IFwic3F1YXRcIixcbiAgZGVmaWNpdERlYWRsaWZ0OiBcImRlYWRsaWZ0XCIsIHJhY2tQdWxsOiBcImRlYWRsaWZ0XCIsXG4gIGNnQmVuY2g6IFwiYmVuY2hcIiwgZGVjbGluZUJlbmNoOiBcImJlbmNoXCIsXG59O1xuY29uc3QgQ09NUCA9IG5ldyBTZXQoW1wic3F1YXRcIiwgXCJiZW5jaFwiLCBcImRlYWRsaWZ0XCJdKTtcblxuLyoqIFwiNUA1MCA0QDYweDJcIiBcdTIxOTIgb25lIFBlcmNlbnRTZXQgcGVyIHNldC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNldHMoc3BlYzogc3RyaW5nKTogUGVyY2VudFNldFtdIHtcbiAgcmV0dXJuIHNwZWMuc3BsaXQoXCIgXCIpLmZsYXRNYXAoKHRvaykgPT4ge1xuICAgIGNvbnN0IG0gPSAvXihcXGQrKUAoXFxkKykoPzp4KFxcZCspKT8kLy5leGVjKHRvayk7XG4gICAgaWYgKCFtKSB0aHJvdyBuZXcgRXJyb3IoYGJhZCBzZXQgc3BlYyAke3Rva31gKTtcbiAgICByZXR1cm4gQXJyYXkuZnJvbSh7IGxlbmd0aDogTnVtYmVyKG1bM10gPz8gMSkgfSwgKCkgPT4gKHsgcGN0OiBOdW1iZXIobVsyXSkgLyAxMDAsIHJlcHM6IE51bWJlcihtWzFdKSB9KSk7XG4gIH0pO1xufVxuXG5mdW5jdGlvbiBzbG90KGlkOiBzdHJpbmcsIFtsaWZ0LCBzcGVjLCBub3RlXTogRW50cnksIGZpcnN0OiBib29sZWFuKTogU2xvdERlZiB7XG4gIGlmICghc3BlYy5pbmNsdWRlcyhcIkBcIikpIHtcbiAgICBjb25zdCBbc2V0cywgcmVwc10gPSBzcGVjLnNwbGl0KFwieFwiKS5tYXAoTnVtYmVyKTtcbiAgICByZXR1cm4geyBpZCwgbGlmdCwgdGllcjogXCJBQ0NcIiwgbm90ZSwgcHJvZ3Jlc3Npb246IHsga2luZDogXCJmaXhlZFwiLCBzZXRzLCByZXBzIH0gfTtcbiAgfVxuICBjb25zdCB0aWVyOiBUaWVyID0gQ09NUC5oYXMobGlmdCkgJiYgZmlyc3QgJiYgIW5vdGUgPyBcIk1BSU5cIiA6IFwiU1VQUFwiO1xuICByZXR1cm4geyBpZCwgbGlmdCwgdGllciwgbm90ZSwgcHJvZ3Jlc3Npb246IHsga2luZDogXCJwZXJjZW50XCIsIHRtTGlmdDogVE1fT0ZbbGlmdF0gPz8gbGlmdCwgd2Vla3M6IFtwYXJzZVNldHMoc3BlYyldIH0gfTtcbn1cblxuaW50ZXJmYWNlIEJsb2NrIHsga2V5OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IHdlZWtzOiBXa1tdIH1cblxuLyoqIExheSBibG9ja3MgZW5kIHRvIGVuZDogb25lIERheURlZiBwZXIgKHdlZWssIGRheSksIHNjaGVkdWxlZCBvbmx5IGluIGl0cyBwcm9ncmFtIHdlZWsuICovXG5mdW5jdGlvbiBsYXlvdXQoYmxvY2tzOiBCbG9ja1tdKTogeyBkYXlzOiBEYXlEZWZbXTsgd2Vla05hbWVzOiBzdHJpbmdbXSB9IHtcbiAgY29uc3QgZGF5czogRGF5RGVmW10gPSBbXTtcbiAgY29uc3Qgd2Vla05hbWVzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGNvbnN0IGIgb2YgYmxvY2tzKSB7XG4gICAgYi53ZWVrcy5mb3JFYWNoKCh3aywgdykgPT4ge1xuICAgICAgY29uc3QgZyA9IHdlZWtOYW1lcy5sZW5ndGg7XG4gICAgICB3ZWVrTmFtZXMucHVzaChgJHtiLmxhYmVsfSBcdTAwQjcgV2VlayAke3cgKyAxfWApO1xuICAgICAgd2suZm9yRWFjaCgoW2RheU5hbWUsIGVudHJpZXNdLCBkKSA9PiB7XG4gICAgICAgIGNvbnN0IGJhc2UgPSBgJHtiLmtleX13JHt3ICsgMX1kJHtkICsgMX1gO1xuICAgICAgICBjb25zdCBzZWVuOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG4gICAgICAgIGNvbnN0IHNsb3RzID0gZW50cmllcy5tYXAoKGUpID0+IHtcbiAgICAgICAgICBjb25zdCBuID0gKHNlZW5bZVswXV0gPSAoc2VlbltlWzBdXSA/PyAwKSArIDEpO1xuICAgICAgICAgIHJldHVybiBzbG90KGAke2Jhc2V9LSR7ZVswXX0ke24gPiAxID8gbiA6IFwiXCJ9YCwgZSwgbiA9PT0gMSk7XG4gICAgICAgIH0pO1xuICAgICAgICBkYXlzLnB1c2goeyBpZDogYmFzZS50b1VwcGVyQ2FzZSgpLCBuYW1lOiBgJHtiLmxhYmVsfSBXJHt3ICsgMX0gXHUwMEI3ICR7ZGF5TmFtZX1gLCB3ZWVrczogW2ddLCBzbG90cyB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiB7IGRheXMsIHdlZWtOYW1lcyB9O1xufVxuXG5mdW5jdGlvbiBwcm9ncmFtKHRlbXBsYXRlSWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBibG9ja3M6IEJsb2NrW10sIHNlc3Npb25zUGVyV2VlazogbnVtYmVyLCBub3Rlczogc3RyaW5nW10pOiBQcm9ncmFtRGVmIHtcbiAgY29uc3QgeyBkYXlzLCB3ZWVrTmFtZXMgfSA9IGxheW91dChibG9ja3MpO1xuICByZXR1cm4ge1xuICAgIHRlbXBsYXRlSWQsIG5hbWUsIGRheXMsIHNlc3Npb25zUGVyV2VlaywgbWF4TGFiZWw6IFwiMVJNXCIsIG5vdGVzLFxuICAgIGN5Y2xlOiB7IHdlZWtzOiB3ZWVrTmFtZXMubGVuZ3RoLCB3ZWVrTmFtZXMsIGZpbml0ZTogdHJ1ZSB9LFxuICB9O1xufVxuXG5jb25zdCBOT1RFUyA9IFtcbiAgXCJFbnRlciB5b3VyIGN1cnJlbnQgY29tcGV0aXRpb24gMVJNcy4gRXZlcnkgc2V0IGlzIGEgZml4ZWQgcGVyY2VudGFnZTsgZG9uJ3QgZ3JpbmQgb3IgYWRkIEFNUkFQcy5cIixcbiAgXCJXaGVuIGEgbGlmdCBhcHBlYXJzIHR3aWNlIGluIGEgc2Vzc2lvbiwgbG9nIGl0IGFzIHR3byBzZXBhcmF0ZSBleGVyY2lzZXMgaW4gSGV2eSwgaW4gb3JkZXIuXCIsXG4gIFwiSGFsdGluZy9wYXVzZWQvY2hhaW4gZGVhZGxpZnRzIGFuZCBib2FyZC9jaGFpbiBwcmVzc2VzOiBsb2cgYXMgdGhlIHBsYWluIGxpZnQuIEJsb2NrIHB1bGxzOiBsb2cgYXMgUmFjayBQdWxsLlwiLFxuICBcIkFjY2Vzc29yaWVzIGhhdmUgbm8gcHJlc2NyaWJlZCBsb2FkOiBwaWNrIGEgd2VpZ2h0IHRoYXQncyBtb2RlcmF0ZSBmb3IgdGhlIHNldHNcdTAwRDdyZXBzLlwiLFxuXTtcblxuY29uc3QgdG9Vbml0ID0gKGxiOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+LCB1bml0OiBVbml0KSA9PlxuICBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMobGIpLm1hcCgoW2ssIHZdKSA9PiBbaywgdW5pdCA9PT0gXCJsYlwiID8gdiA6IE1hdGgucm91bmQodiAvIDIuMjA0NjIgLyAyLjUpICogMi41XSkpO1xuY29uc3QgZGVmYXVsdHMgPSAodW5pdDogVW5pdCkgPT4gKHsgdHJhaW5pbmdNYXhlczogdG9Vbml0KHsgc3F1YXQ6IDMxNSwgYmVuY2g6IDIyNSwgZGVhZGxpZnQ6IDM4NSB9LCB1bml0KSwgc3RhcnRXZWlnaHRzOiB7fSB9KTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGRhdGEgKGZyb20gdGhlIHNwcmVhZHNoZWV0cykgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IEIyOTogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A3NXg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjB4MiA1QDcweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjB4MiAzQDcweDIgM0A3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNHg2XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDU1IDRANjUgNEA3NXgyIDNAODV4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciBhdCBrbmVlIGhlaWdodFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA0QDcwIDNANzV4MiAyQDgweDIgM0A3NXgyIDRANzAgNkA2MCA4QDUwXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A3NXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIiwgXCJTZWF0ZWRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAyXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicHVzaFVwXCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImZyb250U3F1YXRcIiwgXCIzQDQ1eDIgM0A1NXgyIDJANjB4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcweDIgMkA3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjB4MiA2QDY1eDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANTUgNEA2NSA0QDc1eDIgNEA4MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHgyIDNANzUgNUA2NSA3QDU1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjB4MiA0QDcweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDU1IDRANjUgM0A3NXgyIDJAODV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJwdXNoVXBcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDgweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MHgyIDNANjB4MiAzQDY1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHgzIDJAODV4MiAzQDgweDJcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANjAgNEA3MHgyIDNAODB4MiAyQDkweDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NlwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDdcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJvaHBcIiwgXCI1eDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA1QDY1IDRANzV4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcImZyb250U3F1YXRcIiwgXCI1QDQweDIgNEA1MHgyIDNANjB4M1wiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzB4MiAzQDgweDIgMkA4NXgzIDJAODB4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYwIDVANzB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NlwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNkA1MCA1QDYwIDRANzB4MiAzQDgweDIgMkA4NXgyIDNAODB4MiA0QDcwIDZANjAgOEA1MFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuY29uc3QgQjMwOiBXa1tdID0gW1xuICBbIC8vIHdlZWsgMVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MHgyIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNUA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDU1IDRANjUgM0A3NXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYweDIgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDFAODV4MiAyQDgweDIgM0A3NXgyIDRANzAgNkA2NSA4QDYwIDEwQDU1IDEyQDUwXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI2eDRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjVANjAgNEA3MHgyIDNAODB4MyAyQDkweDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgMkA4MHg2XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg2XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjB4MiA0QDcweDRcIl0sXG4gICAgICBbXCJza3VsbGNydXNoZXJcIiwgXCI1eDEwXCIsIFwiRnJlbmNoIHByZXNzXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIiwgXCJTZWF0ZWRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAyXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDJAODB4MiAxQDkweDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg2XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicHVzaFVwXCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjB4MiAzQDcweDIgM0A3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNEA3MHgyIDNANzV4MiAyQDgweDIgM0A3NXgyIDVANzB4MiA3QDYwIDlANTBcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDJAODB4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYweDIgNUA3MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDU1IDNANjUgMkA3NXg1XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg4XCJdLFxuICAgICAgW1wibGVnUHJlc3NcIiwgXCI1eDZcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NlwiLCBcIlNlYXRlZFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNkA1MCA2QDYwIDZANjV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA1QDY1eDIgNEA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDNANzB4MiAzQDgweDMgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDVANjAgNEA3MHgyIDNANzV4MiAyQDgweDIgMUA4NXgyIDJAODB4MiAzQDc1eDIgNUA3MCA3QDY1IDlANjAgMTFANTUgMTNANTBcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjVANjUgNUA3NXgyIDRAODV4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciBhdCBrbmVlIGhlaWdodFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg2XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDMgM0A4MHgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjB4MiA1QDcweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDIgMUA5MHgyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDIgM0A4MHgyXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg4XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDVANjUgNEA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA1QDcweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDhcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEIzMTogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MHgyIDJANzAgNEA3MCA2QDcwIDhANzAgN0A3MCA1QDcwIDNANzBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNkA2MHgyIDZANjV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYweDIgNEA2NXg0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYweDIgNEA3MHg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDVANjAgNEA3MHgyIDNANzV4MiAyQDgweDIgMUA4NXgyIDJAODB4MiAzQDc1eDIgNEA3MCA2QDY1IDhANjAgMTBANTUgMTJANTBcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjVANjAgNEA3MCAzQDgweDIgMkA5MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgMkA4MHg2XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg2XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDU1IDVANjUgNEA3NXg0XCJdLFxuICAgICAgW1wic2t1bGxjcnVzaGVyXCIsIFwiNXgxMFwiLCBcIkZyZW5jaCBwcmVzc1wiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHgyIDFAOTB4M1wiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTUgNUA2NSA1QDc1eDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjV4NlwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDNANjB4MiAzQDY1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNUA2MCA0QDcweDIgM0A3NXgyIDJAODB4MiAxQDg1eDIgM0A3NSA1QDY1IDdANTVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTUgM0A2NXgyIDNANzV4MiAyQDg1eDRcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4MiAyQDg1eDRcIl0sXG4gICAgICBbXCJpbmNsaW5lQmVuY2hcIiwgXCI2eDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjZANTAgNkA2MCA2QDY1eDRcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4MTBcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDEwXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgM1xuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgNUA3MCA4QDcwIDNANzAgNkA3MCAyQDcwIDdANzAgNEA3MFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA1QDY1IDVANzB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDNANzB4MiAyQDgweDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjhANTAgN0A1NSA2QDYwIDVANjUgNEA3MCAzQDc1eDIgMkA4MHgyIDFAODV4MiAyQDgweDIgM0A3NSA0QDcwIDZANjUgOEA2MCAxMEA1NSAxMkA1MFwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiNEA2MCA0QDcwIDNAODB4MiAyQDkweDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjV4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NlwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgzIDNAODB4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYweDIgNUA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIiwgXCJTZWF0ZWRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDIgMUA5MHgzIDJAODB4MlwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg4XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHgxMFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4MiAxQDkweDMgMkA4MHgyXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJAODB4MiAxQDkweDJcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJsZWdQcmVzc1wiLCBcIjZ4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA1QDY1IDRANzV4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4OFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYwIDVANzB4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuY29uc3QgQjMyOiBXa1tdID0gW1xuICBbIC8vIHdlZWsgMVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcweDIgMkA3NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJANzV4M1wiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjB4MiAyQDcweDIgMkA4MCAxQDkwIDFAMTAweDJcIiwgXCJUb3A6IDJcdTIwMTMzIHNpbmdsZXMgYXQgMTAwXHUyMDEzMTA1JVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDJANzB4MiAyQDgwIDFAOTAgMUAxMDB4MlwiLCBcIlRvcDogMlx1MjAxMzMgc2luZ2xlcyBhdCAxMDBcdTIwMTMxMDUlXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDJANjAgMkA3MHgyIDFAODAgMUA5MCAxQDEwMHgyXCIsIFwiVG9wOiAyXHUyMDEzMyBzaW5nbGVzIGF0IDEwMFx1MjAxMzEwNSVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYweDIgM0A3MHgyIDJANzV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1NSAzQDY1eDIgM0A3NXg2XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAyXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYweDIgM0A3MHgyIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1NSAzQDY1eDIgM0A3NXg0XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgMkA2MHgyIDJANjV4MiAxQDcweDNcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MHgyIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDgweDMgMUA4NXgzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI1eDRcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MHgyIDJAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjB4MiAzQDcweDIgMkA3NXg1XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYweDIgMkA3MHgyIDJANzV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDc1eDRcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjB4MiAyQDcweDIgMUA3NXg0XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDJANjB4MiAyQDcweDRcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIyeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjB4MiAyQDcweDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MHgyIDJANzB4M1wiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEIzNzogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A3NXg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjB4MiA1QDcweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNkA2MHgyIDZANjV4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjVANTAgNUA2MHgyIDRANzB4MiAzQDc1eDRcIl0sXG4gICAgICBbXCJpbmNsaW5lQmVuY2hcIiwgXCI2eDRcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjVANTAgNUA2MHgyIDRANzB4MiAzQDgweDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsdW5nZVwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI3QDUwIDZANTUgNUA2MCA0QDY1IDNANzB4MiAyQDc1eDIgM0A3MHgyIDRANjUgNkA2MCA4QDU1IDEwQDUwXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjB4MiAzQDcweDIgM0A3NXg1XCJdLFxuICAgICAgW1wic2t1bGxjcnVzaGVyXCIsIFwiNXgxMFwiLCBcIkZyZW5jaCBwcmVzc1wiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MHgyIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgMkA4MHg2XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wicHVzaFVwXCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1NSAzQDY1IDNANzV4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MHgyIDRANzB4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYweDIgNEA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgM0A3MHgyIDNANzV4NVwiXSxcbiAgICAgIFtcImx1bmdlXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjRANTAgNEA2MCAzQDcweDIgM0A3NXg2XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDVANjAgNEA3MHgyIDNANzV4MiAyQDgweDIgNEA3NSA1QDcwIDZANjAgN0A1MFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNXgxMFwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCIzQDU1IDNANjUgMkA3NXg0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDZcIiwgXCJTZWF0ZWRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYweDIgM0A3MHgyIDNAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJwdXNoVXBcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgNUA3MHg1XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCA0QDcweDIgNEA3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDVANjAgNEA3MHgyIDNANzV4MiAyQDgweDIgM0A3NXgyIDRANzAgNUA2NSA2QDYwIDdANTUgOEA1MFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXgxMFwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiNUA2MCA1QDcweDIgNEA4MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDEwXCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzB4MiAyQDgweDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCA1QDcweDIgNEA3NXg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjB4MiA2QDY1eDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDRcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDNAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg4XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MHgyIDJAODB4NFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcweDIgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDNANzB4MiAzQDgweDIgMkA4NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDVANjUgNEA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDEwXCJdLFxuICAgICAgW1wibHVuZ2VcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzB4MiAzQDgweDZcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA1QDcweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4MTBcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDhcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiLCBcIlNlYXRlZFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEJFR19QUkVQOiBXa1tdID0gW1xuICBbIC8vIHdlZWsgMVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNANzV4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NFwiLCBcIn43NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIn44NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiY2FibGVSb3dcIiwgXCI1eDhcIiwgXCJ+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A1NSAzQDY1IDNANzUgMkA4NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIGF0IGtuZWUgaGVpZ2h0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NzUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDc1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjR4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkIFx1MDBCNyB+NzUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDJcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg4XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI0eDZcIiwgXCJ+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIiwgXCJ+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNkA2MCA2QDY1eDRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANTUgNEA2NSA0QDc1eDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wibGF0ZXJhbFJhaXNlXCIsIFwiNHg2XCIsIFwiRGVsdHM6IGFueSBzaG91bGRlciBleGVyY2lzZSBcdTAwQjcgfjcwJSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA1QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcImNnQmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MHg0XCJdLFxuICAgICAgW1wiY2FibGVSb3dcIiwgXCI0eDhcIiwgXCJ+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNHg4XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiLCBcIn42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgM1xuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDNANzV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcImRiQmVuY2hcIiwgXCI0eDZcIiwgXCJ+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCIsIFwiU2VhdGVkIFx1MDBCNyB+NzUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANjV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHgyIDJAODV4M1wiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A2MCAzQDcwIDNAODB4MiAyQDkweDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJjYWJsZVJvd1wiLCBcIjR4NlwiLCBcIn43MCUgZWZmb3J0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjAlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJkZWNsaW5lQmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNHg4XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4MiAyQDg1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg4XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJiaWNlcEN1cmxcIiwgXCI0eDZcIiwgXCJ+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIiwgXCJ+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgwIDJAODV4NFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiMkA1MCAyQDYwIDJANzB4MiAxQDc1eDNcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBiZWxvdyBhbmQgYWJvdmUgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2UgXHUwMEI3IH43MCUgZWZmb3J0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjAlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDU1IDRANjUgM0A3NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI0eDhcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjR4NVwiLCBcIn43NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuY29uc3QgQkVHX0NPTVA6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzB4MiAyQDc1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcweDIgMkA3NXgzXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAwIDFAMTA1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMCAxQDEwNVwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MCAxQDkwIDFAOTUgMUAxMDAgMUAxMDVcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiM3g4XCIsIFwifjY1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDU1IDNANjUgM0A3NXg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2UgXHUwMEI3IH43MCUgZWZmb3J0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNHg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2UgXHUwMEI3IH43MCUgZWZmb3J0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDVcIiwgXCJTZWF0ZWQgXHUwMEI3IH43NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA2NSAxQDcweDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDNAODAgMkA4NXgyIDFAOTB4MlwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A2NSAzQDc1IDJAODV4MiAxQDk1eDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgYXQga25lZSBoZWlnaHRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2UgXHUwMEI3IH43MCUgZWZmb3J0XCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDNAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgM0A4MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlIFx1MDBCNyB+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImJpY2VwQ3VybFwiLCBcIjR4NlwiLCBcIn42NSUgZWZmb3J0XCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDRcIiwgXCJ+ODAlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODAgMUA4NXgzXCJdLFxuICAgICAgW1wiY2FibGVSb3dcIiwgXCI0eDZcIiwgXCJ+NzAlIGVmZm9ydFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlIFx1MDBCNyB+NjUlIGVmZm9ydFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiM3g2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZSBcdTAwQjcgfjcwJSBlZmZvcnRcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiM3g2XCIsIFwifjcwJSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZSBcdTAwQjcgfjY1JSBlZmZvcnRcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDJANzAgMUA3NXgzXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHgzXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiMng4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2UgXHUwMEI3IH42NSUgZWZmb3J0XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAyQDY1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAyQDcweDNcIl0sXG4gICAgXV0sXG4gIF0sXG5dO1xuXG5jb25zdCBBTUwxOiBXa1tdID0gW1xuICBbIC8vIHdlZWsgMVxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJmcm9udFNxdWF0XCIsIFwiNEAzMCA0QDQwIDRANTB4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCIzQDU1IDNANjUgMkA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcweDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgMiBzIHBhdXNlLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA1QDYwIDNANzAgNUA3MCA3QDcwIDRANzAgNkA3MCA4QDcwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDU1IDNANjUgMkA3NXg0XCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYWJvdmUgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A3NXg0XCJdLFxuICAgICAgW1wicGF1c2VTcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcweDRcIiwgXCJQYXVzZSBoYWxmd2F5IGRvd25cIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANjAgM0A3MCAzQDgweDIgMkA4NXgzXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDJANjB4NFwiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A1NSAzQDY1IDNANzV4MiAyQDg1eDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgNVx1MjAxMzcgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDRcIiwgXCJXZWlnaHRlZFwiXSxcbiAgICAgIFtcImxlZ1ByZXNzXCIsIFwiNXg1XCIsIFwiODBcdTIwMTM5MCUgb2YgeW91ciBzcXVhdCAxUk1cIl0sXG4gICAgICBbXCJyZXZlcnNlSHlwZXJcIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAyXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgM0A3NSAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcInNrdWxsY3J1c2hlclwiLCBcIjV4NlwiLCBcIkZyZW5jaCBwcmVzc1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzB4NVwiLCBcIldpdGggY2hhaW5zOiArOFx1MjAxMzEwIGtnIHBlciBzaWRlIG9uIHRvcCBvZiB0aGlzIHdlaWdodFwiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg1XCIsIFwiUGF1c2UgNVx1MjAxMzcgY20gYmVsb3cgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wibGF0ZXJhbFJhaXNlXCIsIFwiNXg2XCIsIFwiRGVsdHM6IGFueSBzaG91bGRlciBleGVyY2lzZVwiXSxcbiAgICAgIFtcImxlZ0V4dGVuc2lvblwiLCBcIjV4NlwiLCBcIjEgcyBwYXVzZSBhdCB0aGUgdG9wIG9mIGV2ZXJ5IHJlcFwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJmcm9udFNxdWF0XCIsIFwiNEAzMCA0QDQwIDRANTB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A2MCAzQDcwIDNAODAgMkA4NXgyIDFAOTB4M1wiLCBcIkJvYXJkIHByZXNzXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg2XCIsIFwiV2VpZ2h0ZWRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4OFwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiY2dCZW5jaFwiLCBcIjRANTAgM0A2MCAzQDY1eDRcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDcweDIgMUA3NXgzXCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1wiZGJCZW5jaFwiLCBcIjV4NlwiXSxcbiAgICAgIFtcImxlZ1ByZXNzXCIsIFwiNXg0XCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgM1xuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJmcm9udFNxdWF0XCIsIFwiNEA0MCA0QDUwIDNANTV4M1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHgyIDFAODV4MiAyQDgweDJcIl0sXG4gICAgICBbXCJwYXVzZVNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiUGF1c2UgaGFsZndheSBkb3duXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIDIgcyBwYXVzZSwgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCAzQDcwIDdANzAgNEA3MCA4QDcwIDJANzAgNkA3MFwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiNEA2MCA0QDcwIDRAODB4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciA1XHUyMDEzNyBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDU1IDNANjUgM0A3NSAyQDg1eDIgMUA5MHgzXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANjV4NFwiLCBcIldpdGggY2hhaW5zOiArOFx1MjAxMzEwIGtnIHBlciBzaWRlIG9uIHRvcCBvZiB0aGlzIHdlaWdodFwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg4XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg0XCIsIFwiU2VhdGVkXCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIlBhdXNlIDVcdTIwMTM3IGNtIGFib3ZlIHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANjV4NFwiLCBcIk1lZGl1bSBncmlwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJmcm9udFNxdWF0XCIsIFwiM0A0MCAzQDQ1IDNANTB4MiAzQDU1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4MiAyQDg1eDMgM0A4MHgyXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDgweDRcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDZcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDYwIDNANzAgM0A4MCAzQDg1IDJAOTB4MiAxQDk1eDJcIiwgXCJCb2FyZCBwcmVzc1wiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A2MCAzQDcwIDNAODB4MiAyQDkweDIgMUA5NXgyXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDVcdTIwMTM3IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wic2t1bGxjcnVzaGVyXCIsIFwiNXg2XCIsIFwiRnJlbmNoIHByZXNzXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI0eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4MiAxQDgweDNcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBiZWxvdyB0aGUga25lZXNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNkA2MCA2QDY1eDRcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIldpdGggY2hhaW5zOiArOFx1MjAxMzEwIGtnIHBlciBzaWRlIG9uIHRvcCBvZiB0aGlzIHdlaWdodFwiXSxcbiAgICAgIFtcImxlZ1ByZXNzXCIsIFwiNXg1XCJdLFxuICAgICAgW1wicmV2ZXJzZUh5cGVyXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuY29uc3QgQU1MMjogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCAzQDcwIDdANzAgNEA3MCA4QDcwIDJANzAgNUA3MFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A2MCAzQDcwIDNAODB4MiAyQDg1eDNcIiwgXCJCb2FyZCBwcmVzc1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWZpY2l0RGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjAgM0A3MCAzQDgweDIgM0A4NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDRANjUgM0A3NSAyQDg1eDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDYwIDNANzAgM0A4MHgyIDNAODV4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNXgzXCIsIFwiSW5jbGluZSBzaG91bGRlciBwcmVzc1wiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgMkA3MHg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDRANjUgNEA3NXgyIDNAODV4MiAyQDkweDNcIiwgXCJCb2FyZCBwcmVzc1wiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiV2l0aCBjaGFpbnM6ICs4XHUyMDEzMTAga2cgcGVyIHNpZGUgb24gdG9wIG9mIHRoaXMgd2VpZ2h0XCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDU1IDRANjUgM0A3NSAyQDg1eDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NVwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHgzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBiZWxvdyBhbmQgYWJvdmUgdGhlIGtuZWVzXCJdLFxuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNXgzXCIsIFwiSW5jbGluZSBzaG91bGRlciBwcmVzc1wiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NVwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDRANjUgM0A3NSAyQDg1eDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCAzQDcwIDdANzAgNEA3MCA4QDcwIDJANzAgNkA3MFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDcweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjZANTAgNUA2MCA0QDcwIDNANzUgMkA4MHgyXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCI0QDYwIDRANzAgNEA4MHg0XCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzB4NVwiLCBcIldpdGggY2hhaW5zOiArOFx1MjAxMzEwIGtnIHBlciBzaWRlIG9uIHRvcCBvZiB0aGlzIHdlaWdodFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgM0A3NXg0XCIsIFwiMSBmdWxsICsgMS8yIHJlcCAodG8ga25lZXMpIFx1MDBENzIgcGVyIHNldFwiXSxcbiAgICAgIFtcImNnQmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MHg0XCJdLFxuICAgICAgW1wibGF0ZXJhbFJhaXNlXCIsIFwiNXg2XCIsIFwiRGVsdHM6IGFueSBzaG91bGRlciBleGVyY2lzZVwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNXg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJyZXZlcnNlSHlwZXJcIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDVcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDRcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBhYm92ZSB0aGUga25lZXNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTUgM0A2NSAzQDc1IDNAODV4MiAyQDkweDIgMUA5NXgzXCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNXg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI0eDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDU1IDRANjUgM0A3NSAyQDg1eDRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHgzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDJANzB4NFwiXSxcbiAgICAgIFtcImluY2xpbmVCZW5jaFwiLCBcIjV4M1wiLCBcIkluY2xpbmUgc2hvdWxkZXIgcHJlc3NcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjAgM0A3MCAzQDgwIDJAODV4M1wiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGVnUHJlc3NcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA1XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgM0A3MCA1QDcwIDdANzAgNEA3MCA2QDcwIDhANzBcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDVcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANTUgM0A2NSAzQDc1IDNAODV4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgM0A3NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDVANjAgNEA3MCAzQDc1IDJAODB4MiAxQDg1eDIgMkA4MCAzQDc1IDRANzAgNUA2NSA2QDYwIDdANTUgOEA1MFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNEA1MCA0QDYwIDRANzB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4MTBcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJQYXVzZSA1IGNtIGFib3ZlIHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImRiQmVuY2hcIiwgXCI1eDZcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANTAgNEA2MCA0QDcwIDRANzV4NFwiLCBcIkJsb2NrIHB1bGwgd2l0aCBjaGFpbnMsIGJhciAxMFx1MjAxMzEyIGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDZcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NVwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNXg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjRANTAgNEA2MCAzQDY1eDJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCAzQDcwIDZANzAgNEA3MCA3QDcwIDJANzAgOEA3MCA1QDcwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDVcIl0sXG4gICAgICBbXCJsYXRlcmFsUmFpc2VcIiwgXCI1eDZcIiwgXCJEZWx0czogYW55IHNob3VsZGVyIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI0eDhcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A3NXg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDVANjAgNUA3MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDhcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiNHg4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgM0A3NXg0XCIsIFwiSGFsdGluZyBkZWFkbGlmdDogcHVsbCB0byB0aGUga25lZXMsIGxvd2VyXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg0XCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDRcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuY29uc3QgQU1MMzogV2tbXSA9IFtcbiAgWyAvLyB3ZWVrIDFcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCI1QDU1IDRANjUgM0A3NSAyQDg1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHgyIDFAODV4MiAyQDgweDJcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjUgM0A3NSAzQDg1eDIgMkA5MHgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiNHg4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDc1eDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNXgzXCIsIFwiSW5jbGluZSBzaG91bGRlciBwcmVzc1wiXSxcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCIsIFwiUGF1c2UgNSBjbSBhYm92ZSB0aGUga25lZXNcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiNHg4XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgMlxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAweDJcIiwgXCJUb3A6IDJcdTIwMTMzIHNpbmdsZXMgYXQgMTAwXHUyMDEzMTA1JVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA3NXgzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCIzeDVcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMHgyXCIsIFwiVG9wOiAyXHUyMDEzMyBzaW5nbGVzIGF0IDEwMFx1MjAxMzEwNSVcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAweDJcIiwgXCJUb3A6IDJcdTIwMTMzIHNpbmdsZXMgYXQgMTAwXHUyMDEzMTA1JVwiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDc1eDVcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCA1QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4OFwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCI0eDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDc1eDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNUA2MCA1QDcweDRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjRANjAgNEA3MCA0QDgweDRcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImRpcFwiLCBcIjV4NFwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAzXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDVcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANjAgNEA3MCA0QDgweDRcIiwgXCJCb2FyZCBwcmVzc1wiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg2XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNXg1XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgMiBzIHBhdXNlLCBsb3dlclwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHgyIDJAODV4MiAzQDgwIDVANzAgN0A2MCA5QDUwXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCI0QDUwIDRANjAgNEA3MCAzQDc1eDRcIiwgXCJBbHRlcm5hdGUgZnVsbCBhbmQgaGFsZiAodG8ga25lZXMpIHJlcHNcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiNHgxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCAzQDY1IDdANjUgNEA2NSA4QDY1IDJANjUgNkA2NVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDRcIiwgXCJQYXVzZSA1XHUyMDEzNyBjbSBhYm92ZSB0aGUga25lZXNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICAgIFtcImxlZ1ByZXNzXCIsIFwiNXg2XCJdLFxuICAgIF1dLFxuICBdLFxuICBbIC8vIHdlZWsgNFxuICAgIFtcIk1vblwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTUgM0A2NSAzQDc1IDNAODV4MiAyQDkweDNcIiwgXCJCb2FyZCBwcmVzc1wiXSxcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHgyIDJAODV4MiAzQDgweDJcIl0sXG4gICAgICBbXCJkZWNsaW5lQmVuY2hcIiwgXCI0QDUwIDRANjAgNEA3MHg1XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3gxMFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiLCBcIlBhdXNlIDVcdTIwMTM3IGNtIGJlbG93IHRoZSBrbmVlc1wiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHgyIDJAODV4MyAzQDgweDJcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANjUgM0A3NSAzQDg1eDIgMkA5NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjV4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJGcmlcIiwgW1xuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAzQDc1eDRcIiwgXCJXaXRoIGNoYWluczogKzhcdTIwMTMxMCBrZyBwZXIgc2lkZSBvbiB0b3Agb2YgdGhpcyB3ZWlnaHRcIl0sXG4gICAgICBbXCJzcXVhdFwiLCBcIjVANTAgNUA2MCAzQDcwIDVANzAgN0A3MCA0QDcwIDZANzAgOEA3MFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiNEA1MCA0QDYwIDRANzAgNEA3NXg0XCIsIFwiQm9hcmQgcHJlc3NcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjV4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJkaXBcIiwgXCI1eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRlYWRsaWZ0XCIsIFwiNEA1MCA0QDYwIDNANzAgMkA4MHg0XCIsIFwiQWx0ZXJuYXRlIGZ1bGwgYW5kIGhhbGYgKHRvIGtuZWVzKSByZXBzXCJdLFxuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNXgzXCIsIFwiSW5jbGluZSBzaG91bGRlciBwcmVzc1wiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNXg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA1XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1MCA0QDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjV4NVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVmaWNpdERlYWRsaWZ0XCIsIFwiM0A1MCAzQDYwIDNANjUgMkA3MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI1QDUwIDRANjAgM0A3MCAyQDc1eDRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANzAgM0A4MCAyQDkweDIgMUA5NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjV4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDVcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiNUA1MCA0QDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCI2QDUwIDZANjAgNkA3MHg1XCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCIzQDU1IDNANjUgM0A3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI1eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCI1eDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDNANzV4NFwiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCAyIHMgcGF1c2UsIGxvd2VyXCJdLFxuICAgICAgW1wiY2dCZW5jaFwiLCBcIjRANTAgNEA2MCA0QDcweDRcIl0sXG4gICAgICBbXCJyYWNrUHVsbFwiLCBcIjNANTUgM0A2NSAzQDc1IDNAODV4NFwiLCBcIkJsb2NrIHB1bGwsIGJhciA1IGNtIGJlbG93IGtuZWVzXCJdLFxuICAgICAgW1wiZGlwXCIsIFwiNXg1XCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI1eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgXSxcbl07XG5cbmNvbnN0IEFNTDQ6IFdrW10gPSBbXG4gIFsgLy8gd2VlayAxXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiNUA1NSA0QDY1IDNANzUgMkA4NXgzXCJdLFxuICAgICAgW1wic3F1YXRcIiwgXCI1QDUwIDRANjAgM0A3MCAzQDgweDRcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImNoZXN0Rmx5XCIsIFwiNHg4XCIsIFwiQ2hlc3Q6IGFueSBjaGVzdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImRlZmljaXREZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDcweDJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjVANTAgNEA2MCAzQDcwIDNAODB4NFwiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A2MCAzQDcwIDJAODB4MiAxQDkweDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjR4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4MiAxQDg1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4MiAyQDg1eDMgMkA4MHgyXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1widHJpY2VwUHVzaGRvd25cIiwgXCI0eDZcIiwgXCJUcmljZXBzOiBhbnkgdHJpY2VwcyBleGVyY2lzZVwiXSxcbiAgICAgIFtcImdvb2RNb3JuaW5nXCIsIFwiNHg1XCJdLFxuICAgIF1dLFxuICAgIFtcIlNhdFwiLCBbXG4gICAgICBbXCJpbmNsaW5lQmVuY2hcIiwgXCI1eDNcIiwgXCJJbmNsaW5lIHNob3VsZGVyIHByZXNzXCJdLFxuICAgICAgW1wicmFja1B1bGxcIiwgXCIzQDU1IDNANjUgM0A3NSAyQDg1eDNcIiwgXCJCbG9jayBwdWxsLCBiYXIgNSBjbSBiZWxvdyBrbmVlc1wiXSxcbiAgICAgIFtcImxhdGVyYWxSYWlzZVwiLCBcIjR4NlwiLCBcIkRlbHRzOiBhbnkgc2hvdWxkZXIgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJyZXZlcnNlSHlwZXJcIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayAyXG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDNcIl0sXG4gICAgICBbXCJjaGVzdEZseVwiLCBcIjR4NlwiLCBcIkNoZXN0OiBhbnkgY2hlc3QgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJiYWNrRXh0ZW5zaW9uXCIsIFwiM3g4XCJdLFxuICAgIF1dLFxuICAgIFtcIldlZFwiLCBbXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAwXCIsIFwiVG9wOiAxXHUyMDEzMiBzaW5nbGVzIGF0IDEwMCVcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAwXCIsIFwiVG9wOiAxXHUyMDEzMiBzaW5nbGVzIGF0IDEwMCVcIl0sXG4gICAgICBbXCJ0cmljZXBQdXNoZG93blwiLCBcIjR4NlwiLCBcIlRyaWNlcHM6IGFueSB0cmljZXBzIGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MCAxQDkwIDFAOTUgMUAxMDBcIiwgXCJUb3A6IDFcdTIwMTMyIHNpbmdsZXMgYXQgMTAwJVwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA3NXg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDRcIl0sXG4gICAgXV0sXG4gICAgW1wiU2F0XCIsIFtcbiAgICAgIFtcImRiQmVuY2hcIiwgXCI1eDVcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4M1wiLCBcIkhhbHRpbmcgZGVhZGxpZnQ6IHB1bGwgdG8gdGhlIGtuZWVzLCBsb3dlclwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImRpcFwiLCBcIjR4NFwiXSxcbiAgICBdXSxcbiAgXSxcbiAgWyAvLyB3ZWVrIDNcbiAgICBbXCJNb25cIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDU1IDNANjUgMkA3NXgyIDFAODV4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgM0A4MHg0XCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiYmFja0V4dGVuc2lvblwiLCBcIjR4OFwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDc1eDNcIiwgXCJIYWx0aW5nIGRlYWRsaWZ0OiBwdWxsIHRvIHRoZSBrbmVlcywgbG93ZXJcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4MiAxQDg1eDNcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImxhdFB1bGxkb3duXCIsIFwiNHg2XCIsIFwiTGF0czogYW55IGxhdCBleGVyY2lzZVwiXSxcbiAgICAgIFtcImhhbmdpbmdMZWdSYWlzZVwiLCBcIjN4OFwiLCBcIkFiczogYW55IGFiIGV4ZXJjaXNlXCJdLFxuICAgIF1dLFxuICAgIFtcIkZyaVwiLCBbXG4gICAgICBbXCJzcXVhdFwiLCBcIjNANTAgM0A2MCAzQDcwIDJAODB4NFwiXSxcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg1XCJdLFxuICAgICAgW1wibGF0ZXJhbFJhaXNlXCIsIFwiNHg2XCIsIFwiRGVsdHM6IGFueSBzaG91bGRlciBleGVyY2lzZVwiXSxcbiAgICAgIFtcInRyaWNlcFB1c2hkb3duXCIsIFwiNHg2XCIsIFwiVHJpY2VwczogYW55IHRyaWNlcHMgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJnb29kTW9ybmluZ1wiLCBcIjR4NFwiXSxcbiAgICBdXSxcbiAgICBbXCJTYXRcIiwgW1xuICAgICAgW1wiaW5jbGluZUJlbmNoXCIsIFwiNXgzXCIsIFwiSW5jbGluZSBzaG91bGRlciBwcmVzc1wiXSxcbiAgICAgIFtcInJhY2tQdWxsXCIsIFwiM0A1NSAzQDY1IDNANzUgMkA4NXgzXCIsIFwiQmxvY2sgcHVsbCwgYmFyIDUgY20gYmVsb3cga25lZXNcIl0sXG4gICAgICBbXCJsYXRQdWxsZG93blwiLCBcIjR4NlwiLCBcIkxhdHM6IGFueSBsYXQgZXhlcmNpc2VcIl0sXG4gICAgICBbXCJyZXZlcnNlSHlwZXJcIiwgXCI0eDhcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA0XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHg0XCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgM0A3MCAyQDgweDIgMUA4NXgzXCJdLFxuICAgICAgW1wiY2hlc3RGbHlcIiwgXCI0eDZcIiwgXCJDaGVzdDogYW55IGNoZXN0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiZ29vZE1vcm5pbmdcIiwgXCI0eDRcIl0sXG4gICAgXV0sXG4gICAgW1wiV2VkXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDNANzAgMkA4MHgyXCJdLFxuICAgICAgW1wiZGVhZGxpZnRcIiwgXCIyQDUwIDJANjAgMkA3MHgzXCJdLFxuICAgICAgW1wibGF0UHVsbGRvd25cIiwgXCIzeDZcIiwgXCJMYXRzOiBhbnkgbGF0IGV4ZXJjaXNlXCJdLFxuICAgICAgW1wiaGFuZ2luZ0xlZ1JhaXNlXCIsIFwiM3g4XCIsIFwiQWJzOiBhbnkgYWIgZXhlcmNpc2VcIl0sXG4gICAgXV0sXG4gICAgW1wiRnJpXCIsIFtcbiAgICAgIFtcInNxdWF0XCIsIFwiM0A1MCAzQDYwIDJANzB4MiAxQDc1eDNcIl0sXG4gICAgICBbXCJiZW5jaFwiLCBcIjNANTAgM0A2MCAzQDcwIDJANzV4M1wiXSxcbiAgICAgIFtcImJhY2tFeHRlbnNpb25cIiwgXCIzeDZcIl0sXG4gICAgXV0sXG4gIF0sXG4gIFsgLy8gd2VlayA1XG4gICAgW1wiTW9uXCIsIFtcbiAgICAgIFtcImJlbmNoXCIsIFwiM0A1MCAzQDYwIDJANzB4MiAxQDc1eDNcIl0sXG4gICAgICBbXCJkZWFkbGlmdFwiLCBcIjNANTAgM0A2MCAyQDcweDNcIl0sXG4gICAgICBbXCJoYW5naW5nTGVnUmFpc2VcIiwgXCIzeDhcIiwgXCJBYnM6IGFueSBhYiBleGVyY2lzZVwiXSxcbiAgICBdXSxcbiAgICBbXCJXZWRcIiwgW1xuICAgICAgW1wic3F1YXRcIiwgXCIzQDUwIDJANjAgMUA3MHgzXCJdLFxuICAgICAgW1wiYmVuY2hcIiwgXCIzQDUwIDNANjAgMkA3MHgzXCJdLFxuICAgIF1dLFxuICBdLFxuXTtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHRlbXBsYXRlcyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3QgQkxPQ0tTXzI5XzMyOiBSZWNvcmQ8c3RyaW5nLCBCbG9jaz4gPSB7XG4gIFwiMjlcIjogeyBrZXk6IFwiczI5XCIsIGxhYmVsOiBcIiMyOVwiLCB3ZWVrczogQjI5IH0sXG4gIFwiMzBcIjogeyBrZXk6IFwiczMwXCIsIGxhYmVsOiBcIiMzMFwiLCB3ZWVrczogQjMwIH0sXG4gIFwiMzFcIjogeyBrZXk6IFwiczMxXCIsIGxhYmVsOiBcIiMzMVwiLCB3ZWVrczogQjMxIH0sXG4gIFwiMzJcIjogeyBrZXk6IFwiczMyXCIsIGxhYmVsOiBcIiMzMlwiLCB3ZWVrczogQjMyIH0sXG59O1xuY29uc3QgUlVOUzogUmVjb3JkPHN0cmluZywgc3RyaW5nW10+ID0geyBhbGw6IFtcIjI5XCIsIFwiMzBcIiwgXCIzMVwiLCBcIjMyXCJdLCBcIjMwLTMyXCI6IFtcIjMwXCIsIFwiMzFcIiwgXCIzMlwiXSwgXCIyOVwiOiBbXCIyOVwiXSwgXCIzMFwiOiBbXCIzMFwiXSwgXCIzMVwiOiBbXCIzMVwiXSwgXCIzMlwiOiBbXCIzMlwiXSB9O1xuXG5leHBvcnQgY29uc3Qgc2hlaWtvMjkzMjogUHJvZ3JhbVRlbXBsYXRlID0ge1xuICBpZDogXCJzaGVpa28tMjktMzJcIixcbiAgbmFtZTogXCJTaGVpa28gIzI5XHUyMDEzIzMyXCIsXG4gIGF1dGhvcjogXCJCb3JpcyBTaGVpa29cIixcbiAgc291cmNlOiBcIlNoZWlrbyBQcm9ncmFtIFNwcmVhZHNoZWV0cyAoQ2hhc2VUIDIwMDgsIExpZnRWYXVsdCk6IHRhYnMgIzI5LCAjMzAsICMzMSwgIzMyXCIsXG4gIHN1bW1hcnk6IFwiRm91ciA0LXdlZWsgYmxvY2tzIHJ1biBiYWNrIHRvIGJhY2s6ICMyOSBhbmQgIzMwIHByZXBhcmF0b3J5LCAjMzEgYW5kICMzMiBjb21wZXRpdGlvbiwgcGVha2luZyB3aXRoIGEgbWF4IHRlc3QgaW4gIzMyLiBCZW5jaCB0aHJlZSB0aW1lcyBhIHdlZWssIHNxdWF0IHR3aWNlLCBkZWFkbGlmdCBvbmNlLCBhbGwgYXQgZml4ZWQgcGVyY2VudGFnZXMgb2YgeW91ciAxUk0uXCIsXG4gIGNhdGVnb3J5OiBcInBvd2VybGlmdGluZ1wiLFxuICBsZXZlbDogXCJpbnRlcm1lZGlhdGVcIixcbiAgZGF5c1BlcldlZWs6IFszXSxcbiAgd2Vla3M6IDE2LFxuICBvcHRpb25zOiBbXG4gICAgeyBrZXk6IFwicnVuXCIsIGxhYmVsOiBcIkJsb2Nrc1wiLCBkZWZhdWx0OiBcImFsbFwiLCBjaG9pY2VzOiBbXG4gICAgICB7IHZhbHVlOiBcImFsbFwiLCBsYWJlbDogXCIjMjkgXHUyMTkyICMzMiAoMTYgd2Vla3MpXCIgfSxcbiAgICAgIHsgdmFsdWU6IFwiMzAtMzJcIiwgbGFiZWw6IFwiIzMwIFx1MjE5MiAjMzIgKDEyIHdlZWtzKVwiIH0sXG4gICAgICB7IHZhbHVlOiBcIjI5XCIsIGxhYmVsOiBcIiMyOSBvbmx5IChwcmVwYXJhdG9yeSlcIiB9LFxuICAgICAgeyB2YWx1ZTogXCIzMFwiLCBsYWJlbDogXCIjMzAgb25seSAocHJlcGFyYXRvcnkpXCIgfSxcbiAgICAgIHsgdmFsdWU6IFwiMzFcIiwgbGFiZWw6IFwiIzMxIG9ubHkgKGNvbXBldGl0aW9uKVwiIH0sXG4gICAgICB7IHZhbHVlOiBcIjMyXCIsIGxhYmVsOiBcIiMzMiBvbmx5IChjb21wZXRpdGlvbiAvIHBlYWspXCIgfSxcbiAgICBdIH0sXG4gIF0sXG4gIGJ1aWxkKG8pIHtcbiAgICBjb25zdCBydW4gPSBSVU5TW28ucnVuID8/IFwiYWxsXCJdID8/IFJVTlMuYWxsO1xuICAgIGNvbnN0IG5hbWUgPSBydW4ubGVuZ3RoID4gMSA/IGBTaGVpa28gIyR7cnVuWzBdfVx1MjAxMyMke3J1bltydW4ubGVuZ3RoIC0gMV19YCA6IGBTaGVpa28gIyR7cnVuWzBdfWA7XG4gICAgcmV0dXJuIHByb2dyYW0oXCJzaGVpa28tMjktMzJcIiwgbmFtZSwgcnVuLm1hcCgoaykgPT4gQkxPQ0tTXzI5XzMyW2tdKSwgMywgW1xuICAgICAgLi4uTk9URVMsXG4gICAgICBcIiMzMiB3ZWVrIDEgV2VkbmVzZGF5IGlzIGEgbWF4IHRlc3Q6IHdvcmsgdXAgdG8gMlx1MjAxMzMgc2luZ2xlcyBhdCAxMDBcdTIwMTMxMDUlLiBUaGUgbGFzdCB3ZWVrIGVuZHMgaW4gY29tcGV0aXRpb24gKGRheXMgNVx1MjAxMzcpLlwiLFxuICAgIF0pO1xuICB9LFxuICBkZWZhdWx0cyxcbn07XG5cbmV4cG9ydCBjb25zdCBzaGVpa28zNzogUHJvZ3JhbVRlbXBsYXRlID0ge1xuICBpZDogXCJzaGVpa28tMzdcIixcbiAgbmFtZTogXCJTaGVpa28gIzM3XCIsXG4gIGF1dGhvcjogXCJCb3JpcyBTaGVpa29cIixcbiAgc291cmNlOiBcIlNoZWlrbyBQcm9ncmFtIFNwcmVhZHNoZWV0cyAoQ2hhc2VUIDIwMDgsIExpZnRWYXVsdCk6IHRhYiAjMzdcIixcbiAgc3VtbWFyeTogXCJBIDQtd2VlayBTaGVpa28gcHJlcGFyYXRvcnkgYmxvY2sgYXQgbWVkaXVtIHZvbHVtZTogYmVuY2ggdGhyZWUgdGltZXMgYSB3ZWVrLCBzcXVhdCB0d2ljZSwgZGVhZGxpZnQgb25jZSwgd2l0aCBibG9jayBwdWxscyBhbmQgaGFsdGluZyBkZWFkbGlmdHMuXCIsXG4gIGNhdGVnb3J5OiBcInBvd2VybGlmdGluZ1wiLFxuICBsZXZlbDogXCJpbnRlcm1lZGlhdGVcIixcbiAgZGF5c1BlcldlZWs6IFszXSxcbiAgd2Vla3M6IDQsXG4gIG9wdGlvbnM6IFtdLFxuICBidWlsZDogKCkgPT4gcHJvZ3JhbShcInNoZWlrby0zN1wiLCBcIlNoZWlrbyAjMzdcIiwgW3sga2V5OiBcInMzN1wiLCBsYWJlbDogXCIjMzdcIiwgd2Vla3M6IEIzNyB9XSwgMywgTk9URVMpLFxuICBkZWZhdWx0cyxcbn07XG5cbmV4cG9ydCBjb25zdCBzaGVpa29CZWdpbm5lcjogUHJvZ3JhbVRlbXBsYXRlID0ge1xuICBpZDogXCJzaGVpa28tYmVnaW5uZXJcIixcbiAgbmFtZTogXCJTaGVpa28gQmVnaW5uZXJcIixcbiAgYXV0aG9yOiBcIkJvcmlzIFNoZWlrb1wiLFxuICBzb3VyY2U6IFwiU2hlaWtvIEJlZ2lubmVyIFByb2dyYW0gKENoYXNlVCAyMDA4LCBMaWZ0VmF1bHQpOiB0YWJzIFByZXBfMSwgQ29tcFwiLFxuICBzdW1tYXJ5OiBcIlNoZWlrbydzIDMtZGF5IGJlZ2lubmVyIHRlbXBsYXRlOiBydW4gdGhlIDQtd2VlayBwcmVwIGN5Y2xlIG9uZSBvciBtb3JlIHRpbWVzLCB0aGVuIHRoZSA0LXdlZWsgY29tcGV0aXRpb24gY3ljbGUgd2l0aCBhIG1heCB0ZXN0IGluIGl0cyBmaXJzdCB3ZWVrLlwiLFxuICBjYXRlZ29yeTogXCJwb3dlcmxpZnRpbmdcIixcbiAgbGV2ZWw6IFwiYmVnaW5uZXJcIixcbiAgZGF5c1BlcldlZWs6IFszXSxcbiAgd2Vla3M6IDgsXG4gIG9wdGlvbnM6IFtcbiAgICB7IGtleTogXCJwcmVwXCIsIGxhYmVsOiBcIlByZXAgY3ljbGVzXCIsIGRlZmF1bHQ6IFwiMVwiLCBjaG9pY2VzOiBbXG4gICAgICB7IHZhbHVlOiBcIjFcIiwgbGFiZWw6IFwiMSAoNCB3ZWVrcylcIiB9LCB7IHZhbHVlOiBcIjJcIiwgbGFiZWw6IFwiMiAoOCB3ZWVrcylcIiB9LCB7IHZhbHVlOiBcIjNcIiwgbGFiZWw6IFwiMyAoMTIgd2Vla3MpXCIgfSxcbiAgICBdIH0sXG4gICAgeyBrZXk6IFwiY29tcFwiLCBsYWJlbDogXCJDb21wZXRpdGlvbiBjeWNsZVwiLCBkZWZhdWx0OiBcIm9uXCIsIGNob2ljZXM6IFtcbiAgICAgIHsgdmFsdWU6IFwib25cIiwgbGFiZWw6IFwiRmluaXNoIHdpdGggdGhlIDQtd2VlayBjb21wIGN5Y2xlXCIgfSwgeyB2YWx1ZTogXCJvZmZcIiwgbGFiZWw6IFwiUHJlcCBvbmx5LCB0aGVuIHJldGVzdFwiIH0sXG4gICAgXSB9LFxuICBdLFxuICBidWlsZChvKSB7XG4gICAgY29uc3QgbiA9IE1hdGgubWluKDMsIE1hdGgubWF4KDEsIE51bWJlcihvLnByZXAgPz8gMSkgfHwgMSkpO1xuICAgIGNvbnN0IGJsb2NrczogQmxvY2tbXSA9IEFycmF5LmZyb20oeyBsZW5ndGg6IG4gfSwgKF8sIGkpID0+ICh7IGtleTogYGJwJHtpICsgMX1gLCBsYWJlbDogbiA+IDEgPyBgUHJlcCAke2kgKyAxfWAgOiBcIlByZXBcIiwgd2Vla3M6IEJFR19QUkVQIH0pKTtcbiAgICBpZiAoKG8uY29tcCA/PyBcIm9uXCIpID09PSBcIm9uXCIpIGJsb2Nrcy5wdXNoKHsga2V5OiBcImJjXCIsIGxhYmVsOiBcIkNvbXBcIiwgd2Vla3M6IEJFR19DT01QIH0pO1xuICAgIHJldHVybiBwcm9ncmFtKFwic2hlaWtvLWJlZ2lubmVyXCIsIFwiU2hlaWtvIEJlZ2lubmVyXCIsIGJsb2NrcywgMywgW1xuICAgICAgLi4uTk9URVMsXG4gICAgICBcIkFjY2Vzc29yeSBcXFwifjY1JSBlZmZvcnRcXFwiIGlzIHRoZSBzaGVldCdzIGludGVuc2l0eSBmb3IgdGhhdCBleGVyY2lzZSwgbm90IGEgJSBvZiBhIGNvbXBldGl0aW9uIGxpZnQuXCIsXG4gICAgICBcIkNvbXAgd2VlayAxIFdlZG5lc2RheSBpcyBhIG1heCB0ZXN0IChzaW5nbGVzIHVwIHRvIDEwNSUpLiBJZiB5b3UgaGl0IGEgUFIsIHVwZGF0ZSB5b3VyIDFSTSB1bmxlc3MgdGhlIG1lZXQgaXMgdW5kZXIgMzAgZGF5cyBhd2F5LlwiLFxuICAgIF0pO1xuICB9LFxuICBkZWZhdWx0cyxcbn07XG5cbmV4cG9ydCBjb25zdCBzaGVpa29BbWw6IFByb2dyYW1UZW1wbGF0ZSA9IHtcbiAgaWQ6IFwic2hlaWtvLWFtbFwiLFxuICBuYW1lOiBcIlNoZWlrbyBBZHZhbmNlZCBNZWRpdW0gTG9hZFwiLFxuICBhdXRob3I6IFwiQm9yaXMgU2hlaWtvXCIsXG4gIHNvdXJjZTogXCJTaGVpa28gQWR2YW5jZWQgTWVkaXVtIExvYWQgKENoYXNlVCAyMDA4LCBMaWZ0VmF1bHQpOiB0YWJzIFByZXAgQ3ljbGUgSSwgSUksIElJSSwgQ29tcCBDeWNsZVwiLFxuICBzdW1tYXJ5OiBcIlNoZWlrbydzIDQtZGF5IHBsYW4gZm9yIENsYXNzIDEgYW5kIGFib3ZlOiB0aHJlZSBwcmVwYXJhdG9yeSBjeWNsZXMgKDQsIDYgYW5kIDUgd2Vla3MpIGFuZCBhIDUtd2VlayBjb21wZXRpdGlvbiBjeWNsZSwgd2l0aCBib2FyZCBhbmQgY2hhaW4gcHJlc3NlcywgcGF1c2VkIGFuZCBibG9jayBkZWFkbGlmdHMsIGFuZCBtYXggdGVzdHMgYWxvbmcgdGhlIHdheS5cIixcbiAgY2F0ZWdvcnk6IFwicG93ZXJsaWZ0aW5nXCIsXG4gIGxldmVsOiBcImFkdmFuY2VkXCIsXG4gIGRheXNQZXJXZWVrOiBbNF0sXG4gIHdlZWtzOiAyMCxcbiAgb3B0aW9uczogW10sXG4gIGJ1aWxkOiAoKSA9PiBwcm9ncmFtKFwic2hlaWtvLWFtbFwiLCBcIlNoZWlrbyBBTUxcIiwgW1xuICAgIHsga2V5OiBcImExXCIsIGxhYmVsOiBcIlByZXAgSVwiLCB3ZWVrczogQU1MMSB9LFxuICAgIHsga2V5OiBcImEyXCIsIGxhYmVsOiBcIlByZXAgSUlcIiwgd2Vla3M6IEFNTDIgfSxcbiAgICB7IGtleTogXCJhM1wiLCBsYWJlbDogXCJQcmVwIElJSVwiLCB3ZWVrczogQU1MMyB9LFxuICAgIHsga2V5OiBcImE0XCIsIGxhYmVsOiBcIkNvbXBcIiwgd2Vla3M6IEFNTDQgfSxcbiAgXSwgNCwgW1xuICAgIC4uLk5PVEVTLFxuICAgIFwiQ2hhaW5zOiBhZGQgOFx1MjAxMzEwIGtnIG9mIGNoYWluIHBlciBzaWRlIG9uIHRvcCBvZiB0aGUgbGlzdGVkIGJhciB3ZWlnaHQuXCIsXG4gICAgXCJQcmVwIElJSSB3ZWVrIDIgYW5kIENvbXAgd2VlayAyIGluY2x1ZGUgbWF4LXRlc3Qgc2luZ2xlcyAoMTAwXHUyMDEzMTA1JSAvIDEwMCUpLlwiLFxuICAgIFwiVGhlIGxhc3Qgd2VlayBlbmRzIGluIGNvbXBldGl0aW9uLlwiLFxuICBdKSxcbiAgZGVmYXVsdHMsXG59O1xuXG5leHBvcnQgY29uc3QgU0hFSUtPX1RFTVBMQVRFUyA9IFtzaGVpa28yOTMyLCBzaGVpa28zNywgc2hlaWtvQmVnaW5uZXIsIHNoZWlrb0FtbF07XG4iLCAiLy8gU2hlaWtvIHRlbXBsYXRlczogcHJlc2NyaWJlZCB3ZWlnaHRzIGNoZWNrZWQgYnkgaGFuZCBhZ2FpbnN0IHRoZSBDaGFzZVQvTGlmdFZhdWx0IHNoZWV0cy5cbmltcG9ydCB7IGRlc2NyaWJlLCBleHBlY3QsIGl0IH0gZnJvbSBcInZpdGVzdFwiO1xuaW1wb3J0IHR5cGUgeyBIZXZ5V29ya291dCB9IGZyb20gXCIuLi9oZXZ5XCI7XG5pbXBvcnQgeyBMSUZUUyB9IGZyb20gXCIuLi9saWZ0c1wiO1xuaW1wb3J0IHsgYWxsU2xvdHMsIGFwcGx5V29ya291dCwgaW5pdGlhbFN0YXRlLCBwbGFuRGF5LCByZXBsYXksIHR5cGUgUHJvZ3JhbUNvbmZpZywgdHlwZSBQcm9ncmFtRGVmLCB0eXBlIFByb2dyYW1TdGF0ZSB9IGZyb20gXCIuLi9wcm9ncmFtXCI7XG5pbXBvcnQgeyB0b0tnIH0gZnJvbSBcIi4uL3VuaXRzXCI7XG5pbXBvcnQgeyBwYXJzZVNldHMsIHNoZWlrbzI5MzIsIHNoZWlrbzM3LCBzaGVpa29BbWwsIHNoZWlrb0JlZ2lubmVyLCBTSEVJS09fVEVNUExBVEVTIH0gZnJvbSBcIi4vc2hlaWtvXCI7XG5cbmNvbnN0IGNmZyA9ICh0ZW1wbGF0ZUlkOiBzdHJpbmcsIG9wdGlvbnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fSk6IFByb2dyYW1Db25maWcgPT4gKHtcbiAgdGVtcGxhdGVJZCwgb3B0aW9ucywgdW5pdDogXCJsYlwiLCBzdGFydERhdGU6IFwiMjAyNi0wMS0wMVwiLCBzdGFydFdlaWdodHM6IHt9LFxuICB0cmFpbmluZ01heGVzOiB7IHNxdWF0OiAzMDAsIGJlbmNoOiAyMDAsIGRlYWRsaWZ0OiA0MDAgfSxcbn0pO1xuLyoqIFt3ZWlnaHQsIHJlcHNdIHBlciBzZXQgZm9yIGEgZGF5J3Mgc2xvdC4gKi9cbmNvbnN0IHNldHMgPSAoZGVmOiBQcm9ncmFtRGVmLCBjOiBQcm9ncmFtQ29uZmlnLCBzOiBQcm9ncmFtU3RhdGUsIGRheUlkOiBzdHJpbmcsIHNsb3RJZDogc3RyaW5nKSA9PiB7XG4gIGNvbnN0IGkgPSBkZWYuZGF5cy5maW5kSW5kZXgoKGQpID0+IGQuaWQgPT09IGRheUlkKTtcbiAgY29uc3QgZXggPSBwbGFuRGF5KGRlZiwgYywgcywgaSkuZXhlcmNpc2VzLmZpbmQoKGUpID0+IGUuc2xvdElkID09PSBzbG90SWQpO1xuICByZXR1cm4gZXg/LnNldHMubWFwKCh4KSA9PiBbeC53ZWlnaHQsIHgucmVwc10pO1xufTtcbmNvbnN0IHJlcCA9IChuOiBudW1iZXIsIHc6IG51bWJlciwgcjogbnVtYmVyKSA9PiBBcnJheS5mcm9tKHsgbGVuZ3RoOiBuIH0sICgpID0+IFt3LCByXSk7XG5cbi8qKiBBIEhldnkgd29ya291dCB0aGF0IGRvZXMgZXhhY3RseSB3aGF0IHRoZSBwbGFuIHNheXMgKHNraXBwaW5nIHNvbWUgc2xvdHMgaWYgYXNrZWQpLiAqL1xuZnVuY3Rpb24gZG9QbGFuKGRlZjogUHJvZ3JhbURlZiwgYzogUHJvZ3JhbUNvbmZpZywgczogUHJvZ3JhbVN0YXRlLCBuOiBudW1iZXIsIHNraXA6IHN0cmluZ1tdID0gW10pOiBIZXZ5V29ya291dCB7XG4gIGNvbnN0IHAgPSBwbGFuRGF5KGRlZiwgYywgcyk7XG4gIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShEYXRlLlVUQygyMDI2LCAwLCAyICsgbiAqIDIpKS50b0lTT1N0cmluZygpLnNsaWNlKDAsIDEwKTtcbiAgcmV0dXJuIHtcbiAgICBpZDogYHcke259YCwgdGl0bGU6IHAuZGF5TmFtZSwgc3RhcnRfdGltZTogYCR7ZGF0ZX1UMTI6MDA6MDBaYCwgZW5kX3RpbWU6IGAke2RhdGV9VDEzOjMwOjAwWmAsXG4gICAgZXhlcmNpc2VzOiBwLmV4ZXJjaXNlcy5maWx0ZXIoKGUpID0+ICFza2lwLmluY2x1ZGVzKGUuc2xvdElkKSkubWFwKChlKSA9PiAoe1xuICAgICAgdGl0bGU6IExJRlRTW2UubGlmdF0uaGV2eVswXSwgZXhlcmNpc2VfdGVtcGxhdGVfaWQ6IExJRlRTW2UubGlmdF0uaGV2eVswXSxcbiAgICAgIHNldHM6IGUuc2V0cy5tYXAoKHgpID0+ICh7IHR5cGU6IFwibm9ybWFsXCIgYXMgY29uc3QsIHdlaWdodF9rZzogdG9LZyh4LndlaWdodCwgXCJsYlwiKSwgcmVwczogeC5yZXBzIH0pKSxcbiAgICB9KSksXG4gIH07XG59XG5cbmRlc2NyaWJlKFwiYWxsIFNoZWlrbyB0ZW1wbGF0ZXMgYnVpbGRcIiwgKCkgPT4ge1xuICBmb3IgKGNvbnN0IHQgb2YgU0hFSUtPX1RFTVBMQVRFUykge1xuICAgIGl0KGAke3QuaWR9OiB1bmlxdWUgaWRzLCBmaW5pdGUsIDFSTWAsICgpID0+IHtcbiAgICAgIGNvbnN0IG9wdHMgPSBPYmplY3QuZnJvbUVudHJpZXModC5vcHRpb25zLm1hcCgobykgPT4gW28ua2V5LCBvLmRlZmF1bHRdKSk7XG4gICAgICBjb25zdCBkZWYgPSB0LmJ1aWxkKG9wdHMpO1xuICAgICAgY29uc3QgaWRzID0gYWxsU2xvdHMoZGVmKS5tYXAoKHMpID0+IHMuaWQpO1xuICAgICAgZXhwZWN0KG5ldyBTZXQoaWRzKS5zaXplKS50b0JlKGlkcy5sZW5ndGgpO1xuICAgICAgZXhwZWN0KG5ldyBTZXQoZGVmLmRheXMubWFwKChkKSA9PiBkLmlkKSkuc2l6ZSkudG9CZShkZWYuZGF5cy5sZW5ndGgpO1xuICAgICAgZXhwZWN0KGRlZi5jeWNsZSkudG9NYXRjaE9iamVjdCh7IGZpbml0ZTogdHJ1ZSwgd2Vla3M6IHQud2Vla3MgfSk7XG4gICAgICBleHBlY3QoZGVmLm1heExhYmVsKS50b0JlKFwiMVJNXCIpO1xuICAgICAgZXhwZWN0KHQuaWQuc3RhcnRzV2l0aChcInNoZWlrby1cIikpLnRvQmUodHJ1ZSk7XG4gICAgICBmb3IgKGNvbnN0IHMgb2YgYWxsU2xvdHMoZGVmKSkgZXhwZWN0KExJRlRTW3MubGlmdF0sIHMubGlmdCkudG9CZURlZmluZWQoKTtcbiAgICB9KTtcbiAgfVxuICBpdChcInBhcnNlcyBzZXQgc3BlY3NcIiwgKCkgPT4ge1xuICAgIGV4cGVjdChwYXJzZVNldHMoXCI1QDUwIDRANjB4MlwiKSkudG9FcXVhbChbeyBwY3Q6IDAuNSwgcmVwczogNSB9LCB7IHBjdDogMC42LCByZXBzOiA0IH0sIHsgcGN0OiAwLjYsIHJlcHM6IDQgfV0pO1xuICB9KTtcbiAgaXQoXCJibG9jayBvcHRpb25zIHBpY2sgdGhlIHJpZ2h0IHdlZWtzXCIsICgpID0+IHtcbiAgICBleHBlY3Qoc2hlaWtvMjkzMi5idWlsZCh7IHJ1bjogXCIzMlwiIH0pLmN5Y2xlPy53ZWVrcykudG9CZSg0KTtcbiAgICBleHBlY3Qoc2hlaWtvMjkzMi5idWlsZCh7IHJ1bjogXCIzMC0zMlwiIH0pLmN5Y2xlPy53ZWVrcykudG9CZSgxMik7XG4gICAgZXhwZWN0KHNoZWlrb0JlZ2lubmVyLmJ1aWxkKHsgcHJlcDogXCIyXCIsIGNvbXA6IFwib25cIiB9KS5jeWNsZT8ud2Vla3MpLnRvQmUoMTIpO1xuICAgIGV4cGVjdChzaGVpa29CZWdpbm5lci5idWlsZCh7IHByZXA6IFwiMVwiLCBjb21wOiBcIm9mZlwiIH0pLmN5Y2xlPy53ZWVrcykudG9CZSg0KTtcbiAgfSk7XG59KTtcblxuZGVzY3JpYmUoXCIjMjlcdTIwMTMjMzIgYWdhaW5zdCB0aGUgc2hlZXQgKHNxdWF0IDMwMCAvIGJlbmNoIDIwMCAvIGRlYWRsaWZ0IDQwMClcIiwgKCkgPT4ge1xuICBjb25zdCBjID0gY2ZnKFwic2hlaWtvLTI5LTMyXCIpO1xuICBjb25zdCBkZWYgPSBzaGVpa28yOTMyLmJ1aWxkKHsgcnVuOiBcImFsbFwiIH0pO1xuICBjb25zdCBzID0gaW5pdGlhbFN0YXRlKGRlZiwgYyk7XG5cbiAgaXQoXCIjMjkgVzEgTW9uZGF5OiBiZW5jaCwgc3F1YXQsIGJlbmNoIGFnYWluLCBmbHllcywgZ29vZCBtb3JuaW5nc1wiLCAoKSA9PiB7XG4gICAgY29uc3QgZCA9IGRlZi5kYXlzWzBdO1xuICAgIGV4cGVjdChkLmlkKS50b0JlKFwiUzI5VzFEMVwiKTtcbiAgICBleHBlY3QoZC5zbG90cy5tYXAoKHgpID0+IHguaWQpKS50b0VxdWFsKFtcInMyOXcxZDEtYmVuY2hcIiwgXCJzMjl3MWQxLXNxdWF0XCIsIFwiczI5dzFkMS1iZW5jaDJcIiwgXCJzMjl3MWQxLWNoZXN0Rmx5XCIsIFwiczI5dzFkMS1nb29kTW9ybmluZ1wiXSk7XG4gICAgLy8gNTAlXHUwMEQ3NVx1MDBENzEsIDYwJVx1MDBENzRcdTAwRDcyLCA3MCVcdTAwRDczXHUwMEQ3MiwgNzUlXHUwMEQ3M1x1MDBENzVcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzI5VzFEMVwiLCBcInMyOXcxZDEtYmVuY2hcIikpLnRvRXF1YWwoW1sxMDAsIDVdLCAuLi5yZXAoMiwgMTIwLCA0KSwgLi4ucmVwKDIsIDE0MCwgMyksIC4uLnJlcCg1LCAxNTAsIDMpXSk7XG4gICAgLy8gNTAlXHUwMEQ3NVx1MDBENzEsIDYwJVx1MDBENzVcdTAwRDcyLCA3MCVcdTAwRDc1XHUwMEQ3NVxuICAgIGV4cGVjdChzZXRzKGRlZiwgYywgcywgXCJTMjlXMUQxXCIsIFwiczI5dzFkMS1zcXVhdFwiKSkudG9FcXVhbChbWzE1MCwgNV0sIC4uLnJlcCgyLCAxODAsIDUpLCAuLi5yZXAoNSwgMjEwLCA1KV0pO1xuICAgIC8vIDUwJVx1MDBENzVcdTAwRDcxLCA2MCVcdTAwRDc1XHUwMEQ3MSwgNzAlXHUwMEQ3NFx1MDBENzRcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzI5VzFEMVwiLCBcInMyOXcxZDEtYmVuY2gyXCIpKS50b0VxdWFsKFtbMTAwLCA1XSwgWzEyMCwgNV0sIC4uLnJlcCg0LCAxNDAsIDQpXSk7XG4gICAgZXhwZWN0KGQuc2xvdHNbM10ucHJvZ3Jlc3Npb24pLnRvRXF1YWwoeyBraW5kOiBcImZpeGVkXCIsIHNldHM6IDUsIHJlcHM6IDEwIH0pO1xuICB9KTtcblxuICBpdChcIiMyOSBXMSBXZWRuZXNkYXk6IGRlYWRsaWZ0IHRvIGtuZWVzIGFuZCBibG9jayBwdWxscyBvZmYgdGhlIGRlYWRsaWZ0IDFSTVwiLCAoKSA9PiB7XG4gICAgY29uc3QgZCA9IGRlZi5kYXlzLmZpbmQoKHgpID0+IHguaWQgPT09IFwiUzI5VzFEMlwiKSE7XG4gICAgZXhwZWN0KGQuc2xvdHNbMF0pLnRvTWF0Y2hPYmplY3QoeyBsaWZ0OiBcImRlYWRsaWZ0XCIsIHRpZXI6IFwiU1VQUFwiIH0pO1xuICAgIGV4cGVjdChzZXRzKGRlZiwgYywgcywgXCJTMjlXMUQyXCIsIFwiczI5dzFkMi1kZWFkbGlmdFwiKSkudG9FcXVhbChbWzIwMCwgM10sIC4uLnJlcCgyLCAyNDAsIDMpLCAuLi5yZXAoMiwgMjgwLCAzKSwgLi4ucmVwKDQsIDMwMCwgMyldKTtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiUzI5VzFEMlwiLCBcInMyOXcxZDItcmFja1B1bGxcIikpLnRvRXF1YWwoW1syMjAsIDRdLCBbMjYwLCA0XSwgLi4ucmVwKDIsIDMwMCwgNCksIC4uLnJlcCg0LCAzNDAsIDMpXSk7XG4gIH0pO1xuXG4gIGl0KFwiIzMwIFcxIFdlZG5lc2RheSBiZW5jaCBweXJhbWlkIHRvcHMgb3V0IGF0IDg1JVx1MDBENzFcdTAwRDcyIGFuZCBjb21lcyBiYWNrIGRvd24gdG8gNTAlXHUwMEQ3MTJcIiwgKCkgPT4ge1xuICAgIGNvbnN0IHcgPSBzZXRzKGRlZiwgYywgcywgXCJTMzBXMUQyXCIsIFwiczMwdzFkMi1iZW5jaFwiKSE7XG4gICAgZXhwZWN0KHcuZmlsdGVyKChbd3RdKSA9PiB3dCA9PT0gMTcwKSkudG9FcXVhbChbWzE3MCwgMV0sIFsxNzAsIDFdXSk7XG4gICAgZXhwZWN0KHdbdy5sZW5ndGggLSAxXSkudG9FcXVhbChbMTAwLCAxMl0pO1xuICAgIGV4cGVjdCh3KS50b0hhdmVMZW5ndGgoMTkpO1xuICB9KTtcblxuICBpdChcIiMzMSBXMSBNb25kYXkgc3F1YXQ6IDcwJSB3YXZlIG9mIDIsNCw2LDgsNyw1LDNcIiwgKCkgPT4ge1xuICAgIGV4cGVjdChzZXRzKGRlZiwgYywgcywgXCJTMzFXMUQxXCIsIFwiczMxdzFkMS1zcXVhdFwiKSEuc2xpY2UoMykpLnRvRXF1YWwoWzIsIDQsIDYsIDgsIDcsIDUsIDNdLm1hcCgocikgPT4gWzIxMCwgcl0pKTtcbiAgfSk7XG5cbiAgaXQoXCIjMzIgVzEgV2VkbmVzZGF5IG1heCB0ZXN0IGVuZHMgd2l0aCBzaW5nbGVzIGF0IDEwMCVcIiwgKCkgPT4ge1xuICAgIGV4cGVjdChzZXRzKGRlZiwgYywgcywgXCJTMzJXMUQyXCIsIFwiczMydzFkMi1zcXVhdFwiKSEuc2xpY2UoLTMpKS50b0VxdWFsKFtbMjcwLCAxXSwgWzMwMCwgMV0sIFszMDAsIDFdXSk7XG4gICAgZXhwZWN0KGRlZi5kYXlzLmZpbmQoKHgpID0+IHguaWQgPT09IFwiUzMyVzFEMlwiKSEuc2xvdHNbMF0ubm90ZSkudG9NYXRjaCgvMTAwXHUyMDEzMTA1JS8pO1xuICB9KTtcblxuICBpdChcIndlZWtzIGFyZSBuYW1lZCBieSBibG9jazsgZnJvbnQgc3F1YXQgdXNlcyB0aGUgc3F1YXQgMVJNXCIsICgpID0+IHtcbiAgICBleHBlY3QoZGVmLmN5Y2xlPy53ZWVrTmFtZXM/Lls0XSkudG9CZShcIiMzMCBcdTAwQjcgV2VlayAxXCIpO1xuICAgIGV4cGVjdChzZXRzKGRlZiwgYywgcywgXCJTMjlXMkQxXCIsIFwiczI5dzJkMS1mcm9udFNxdWF0XCIpIVswXSkudG9FcXVhbChbMTM1LCAzXSk7IC8vIDQ1JSBvZiAzMDBcbiAgfSk7XG59KTtcblxuZGVzY3JpYmUoXCIjMzcsIEJlZ2lubmVyIGFuZCBBTUwgYWdhaW5zdCB0aGUgc2hlZXRzXCIsICgpID0+IHtcbiAgaXQoXCIjMzcgVzEgRnJpZGF5OiBiZW5jaCBweXJhbWlkIDUwJVx1MDBENzcgXHUyMDI2IDc1JVx1MDBENzJcdTAwRDcyIFx1MjAyNiA1MCVcdTAwRDcxMFwiLCAoKSA9PiB7XG4gICAgY29uc3QgZGVmID0gc2hlaWtvMzcuYnVpbGQoe30pO1xuICAgIGNvbnN0IGMgPSBjZmcoXCJzaGVpa28tMzdcIik7XG4gICAgY29uc3QgdyA9IHNldHMoZGVmLCBjLCBpbml0aWFsU3RhdGUoZGVmLCBjKSwgXCJTMzdXMUQzXCIsIFwiczM3dzFkMy1iZW5jaFwiKSE7XG4gICAgZXhwZWN0KHdbMF0pLnRvRXF1YWwoWzEwMCwgN10pO1xuICAgIGV4cGVjdCh3LmZpbHRlcigoW3d0XSkgPT4gd3QgPT09IDE1MCkpLnRvRXF1YWwoW1sxNTAsIDJdLCBbMTUwLCAyXV0pO1xuICAgIGV4cGVjdCh3W3cubGVuZ3RoIC0gMV0pLnRvRXF1YWwoWzEwMCwgMTBdKTtcbiAgfSk7XG5cbiAgaXQoXCJCZWdpbm5lciBjb21wIFcxIFdlZG5lc2RheTogc3F1YXQgc2luZ2xlcyB1cCB0byAxMDUlXCIsICgpID0+IHtcbiAgICBjb25zdCBkZWYgPSBzaGVpa29CZWdpbm5lci5idWlsZCh7IHByZXA6IFwiMVwiLCBjb21wOiBcIm9uXCIgfSk7XG4gICAgY29uc3QgYyA9IGNmZyhcInNoZWlrby1iZWdpbm5lclwiKTtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIGluaXRpYWxTdGF0ZShkZWYsIGMpLCBcIkJDVzFEMlwiLCBcImJjdzFkMi1zcXVhdFwiKSEuc2xpY2UoLTQpKS50b0VxdWFsKFtbMjcwLCAxXSwgWzI4NSwgMV0sIFszMDAsIDFdLCBbMzE1LCAxXV0pO1xuICAgIGV4cGVjdChkZWYuZGF5c1swXS5zbG90cy5tYXAoKHgpID0+IHgubGlmdCkpLnRvRXF1YWwoW1wic3F1YXRcIiwgXCJiZW5jaFwiLCBcImNoZXN0Rmx5XCIsIFwiZ29vZE1vcm5pbmdcIl0pO1xuICB9KTtcblxuICBpdChcIkFNTCBQcmVwIEkgVzEgTW9uZGF5OiBmcm9udCBzcXVhdCBhdCAzMC80MC81MCUgb2Ygc3F1YXQsIHRoZW4gYmVuY2ggNzUlXHUwMEQ3Mlx1MDBENzRcIiwgKCkgPT4ge1xuICAgIGNvbnN0IGRlZiA9IHNoZWlrb0FtbC5idWlsZCh7fSk7XG4gICAgY29uc3QgYyA9IGNmZyhcInNoZWlrby1hbWxcIik7XG4gICAgY29uc3QgcyA9IGluaXRpYWxTdGF0ZShkZWYsIGMpO1xuICAgIGV4cGVjdChkZWYuZGF5cy5maWx0ZXIoKGQpID0+IGQud2Vla3M/LlswXSA9PT0gMCkubWFwKChkKSA9PiBkLm5hbWUpKS50b0VxdWFsKFtcIlByZXAgSSBXMSBcdTAwQjcgTW9uXCIsIFwiUHJlcCBJIFcxIFx1MDBCNyBXZWRcIiwgXCJQcmVwIEkgVzEgXHUwMEI3IEZyaVwiLCBcIlByZXAgSSBXMSBcdTAwQjcgU2F0XCJdKTtcbiAgICBleHBlY3Qoc2V0cyhkZWYsIGMsIHMsIFwiQTFXMUQxXCIsIFwiYTF3MWQxLWZyb250U3F1YXRcIikpLnRvRXF1YWwoW1s5MCwgNF0sIFsxMjAsIDRdLCAuLi5yZXAoMywgMTUwLCA0KV0pO1xuICAgIGV4cGVjdChzZXRzKGRlZiwgYywgcywgXCJBMVcxRDFcIiwgXCJhMXcxZDEtYmVuY2hcIikhLnNsaWNlKC00KSkudG9FcXVhbChyZXAoNCwgMTUwLCAyKSk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKFwicmVwbGF5aW5nIFNoZWlrbyAjMzJcIiwgKCkgPT4ge1xuICBjb25zdCBkZWYgPSBzaGVpa28yOTMyLmJ1aWxkKHsgcnVuOiBcIjMyXCIgfSk7XG4gIGNvbnN0IGMgPSBjZmcoXCJzaGVpa28tMjktMzJcIiwgeyBydW46IFwiMzJcIiB9KTtcblxuICBpdChcIndhbGtzIHRoZSBzZXNzaW9ucyBpbiBvcmRlciBhbmQgY29tcGxldGVzIGFmdGVyIHdlZWsgNFwiLCAoKSA9PiB7XG4gICAgbGV0IHMgPSBpbml0aWFsU3RhdGUoZGVmLCBjKTtcbiAgICBjb25zdCB3czogSGV2eVdvcmtvdXRbXSA9IFtdO1xuICAgIGZvciAobGV0IG4gPSAwOyBuIDwgMTE7IG4rKykge1xuICAgICAgY29uc3QgdyA9IGRvUGxhbihkZWYsIGMsIHMsIG4pO1xuICAgICAgd3MucHVzaCh3KTtcbiAgICAgIHMgPSBhcHBseVdvcmtvdXQoZGVmLCBjLCBzLCB3LCBzLmRheUluZGV4KTtcbiAgICB9XG4gICAgZXhwZWN0KHMuY29tcGxldGUpLnRvQmUodHJ1ZSk7XG4gICAgZXhwZWN0KHMubG9nLm1hcCgobCkgPT4gbC5kYXlJZCkpLnRvRXF1YWwoW1wiUzMyVzFEMVwiLCBcIlMzMlcxRDJcIiwgXCJTMzJXMUQzXCIsIFwiUzMyVzJEMVwiLCBcIlMzMlcyRDJcIiwgXCJTMzJXMkQzXCIsIFwiUzMyVzNEMVwiLCBcIlMzMlczRDJcIiwgXCJTMzJXM0QzXCIsIFwiUzMyVzREMVwiLCBcIlMzMlc0RDJcIl0pO1xuICAgIGNvbnN0IHIgPSByZXBsYXkoZGVmLCBjLCB3cyk7XG4gICAgZXhwZWN0KHIuY29tcGxldGUpLnRvQmUodHJ1ZSk7XG4gICAgZXhwZWN0KHIubG9nLm1hcCgobCkgPT4gbC5kYXlJZCkpLnRvRXF1YWwocy5sb2cubWFwKChsKSA9PiBsLmRheUlkKSk7XG4gICAgZXhwZWN0KHIudG1zKS50b0VxdWFsKHsgc3F1YXQ6IDMwMCwgYmVuY2g6IDIwMCwgZGVhZGxpZnQ6IDQwMCB9KTsgLy8gU2hlaWtvIGRvZXNuJ3QgbW92ZSBtYXhlcyBtaWQtYmxvY2tcbiAgfSk7XG5cbiAgaXQoXCJtYXRjaGVzIGEgc2Vjb25kIGJlbmNoIGJsb2NrIHRvIHRoZSBzZWNvbmQgYmVuY2ggc2xvdCwgYW5kIGZsYWdzIGl0IG1pc3NlZCBpZiBza2lwcGVkXCIsICgpID0+IHtcbiAgICBsZXQgcyA9IGluaXRpYWxTdGF0ZShkZWYsIGMpO1xuICAgIGZvciAobGV0IG4gPSAwOyBuIDwgNTsgbisrKSBzID0gYXBwbHlXb3Jrb3V0KGRlZiwgYywgcywgZG9QbGFuKGRlZiwgYywgcywgbiksIHMuZGF5SW5kZXgpO1xuICAgIGV4cGVjdChkZWYuZGF5c1tzLmRheUluZGV4XS5pZCkudG9CZShcIlMzMlcyRDNcIik7IC8vIGJlbmNoLCBzcXVhdCwgYmVuY2gsIGZseSwgR01cbiAgICBjb25zdCBmdWxsID0gYXBwbHlXb3Jrb3V0KGRlZiwgYywgcywgZG9QbGFuKGRlZiwgYywgcywgNSksIHMuZGF5SW5kZXgpLmxvZy5hdCgtMSkhLnJlc3VsdHM7XG4gICAgZXhwZWN0KGZ1bGwuZmluZCgoeCkgPT4geC5zbG90SWQgPT09IFwiczMydzJkMy1iZW5jaDJcIikpLnRvTWF0Y2hPYmplY3QoeyBvdXRjb21lOiBcInN1Y2Nlc3NcIiwgd2VpZ2h0OiAxNDAsIHJlcHM6IFs0LCA0LCA0LCA0LCA0LCA0XSB9KTtcbiAgICBjb25zdCBza2lwcGVkID0gYXBwbHlXb3Jrb3V0KGRlZiwgYywgcywgZG9QbGFuKGRlZiwgYywgcywgNSwgW1wiczMydzJkMy1iZW5jaDJcIl0pLCBzLmRheUluZGV4KS5sb2cuYXQoLTEpIS5yZXN1bHRzO1xuICAgIGV4cGVjdChza2lwcGVkLmZpbmQoKHgpID0+IHguc2xvdElkID09PSBcInMzMncyZDMtYmVuY2hcIik/Lm91dGNvbWUpLnRvQmUoXCJzdWNjZXNzXCIpO1xuICAgIGV4cGVjdChza2lwcGVkLmZpbmQoKHgpID0+IHguc2xvdElkID09PSBcInMzMncyZDMtYmVuY2gyXCIpPy5vdXRjb21lKS50b0JlKFwibWlzc2VkXCIpO1xuICB9KTtcbn0pO1xuXG4vLyBEYXktYnktZGF5IGFnYWluc3QgdGhlIENoYXNlVCAyMDA4IHNoZWV0cyBob3N0ZWQgYnkgTGlmdFZhdWx0IChcIlNoZWlrbyBUcmFpbmluZyBDb2xsZWN0aW9uXCJcbi8vIHRhYnMgIzI5XHUyMDEzIzMyIGFuZCAjMzcsIFwiU2hlaWtvIEJlZ2lubmVyXCIgUHJlcF8xL0NvbXAsIFwiU2hlaWtvIEFNTFwiIFByZXAgSVx1MjAxM0lJSS9Db21wKSwgcmVhZCBjZWxsIGJ5XG4vLyBjZWxsIDIwMjYtMTAtMTguIEVhY2ggZXhlcmNpc2UgYXMgdGhlIHNoZWV0IHdyaXRlcyBpdDogXCJyZXBzQHBjdFt4U2V0c11cIiBmb3IgJSB3b3JrLCBcIlNFVFN4UkVQU1wiXG4vLyBmb3IgYWNjZXNzb3JpZXMuXG5kZXNjcmliZShcInNlc3Npb25zIG1hdGNoIHRoZSBzb3VyY2Ugc2hlZXRzXCIsICgpID0+IHtcbiAgY29uc3Qgc3BlYyA9IChkZWY6IFByb2dyYW1EZWYsIGRheUlkOiBzdHJpbmcpID0+IHtcbiAgICBjb25zdCBkYXkgPSBkZWYuZGF5cy5maW5kKChkKSA9PiBkLmlkID09PSBkYXlJZCkhO1xuICAgIGV4cGVjdChkYXksIGRheUlkKS50b0JlRGVmaW5lZCgpO1xuICAgIHJldHVybiBkYXkuc2xvdHMubWFwKChzKSA9PiB7XG4gICAgICBjb25zdCBwID0gcy5wcm9ncmVzc2lvbjtcbiAgICAgIGlmIChwLmtpbmQgPT09IFwiZml4ZWRcIikgcmV0dXJuIGAke3MubGlmdH0gJHtwLnNldHN9eCR7cC5yZXBzfWA7XG4gICAgICBpZiAocC5raW5kICE9PSBcInBlcmNlbnRcIikgdGhyb3cgbmV3IEVycm9yKFwidW5leHBlY3RlZFwiKTtcbiAgICAgIGNvbnN0IHRva3M6IHN0cmluZ1tdID0gW107XG4gICAgICBsZXQgcHJldiA9IFwiXCIsIG4gPSAwO1xuICAgICAgY29uc3QgZmx1c2ggPSAoKSA9PiB7IGlmIChwcmV2KSB0b2tzLnB1c2gobiA+IDEgPyBgJHtwcmV2fXgke259YCA6IHByZXYpOyB9O1xuICAgICAgZm9yIChjb25zdCB4IG9mIHAud2Vla3NbMF0pIHtcbiAgICAgICAgY29uc3QgdCA9IGAke3gucmVwc31AJHtNYXRoLnJvdW5kKHgucGN0ISAqIDEwMDApIC8gMTB9YDtcbiAgICAgICAgaWYgKHQgPT09IHByZXYpIG4rKzsgZWxzZSB7IGZsdXNoKCk7IHByZXYgPSB0OyBuID0gMTsgfVxuICAgICAgfVxuICAgICAgZmx1c2goKTtcbiAgICAgIHJldHVybiBgJHtzLmxpZnR9ICR7dG9rcy5qb2luKFwiIFwiKX1gO1xuICAgIH0pO1xuICB9O1xuICBpdChcIiMyOSB3ZWVrIDEgTW9uZGF5XCIsICgpID0+IHtcbiAgICBleHBlY3Qoc3BlYyhzaGVpa28yOTMyLmJ1aWxkKHt9KSwgXCJTMjlXMUQxXCIpKS50b0VxdWFsKFtcbiAgICAgIFwiYmVuY2ggNUA1MCA0QDYweDIgM0A3MHgyIDNANzV4NVwiLCBcInNxdWF0IDVANTAgNUA2MHgyIDVANzB4NVwiLCBcImJlbmNoIDVANTAgNUA2MCA0QDcweDRcIiwgXCJjaGVzdEZseSA1eDEwXCIsIFwiZ29vZE1vcm5pbmcgNXg1XCIsXG4gICAgXSk7XG4gIH0pO1xuICBpdChcIiMzMiB3ZWVrIDQgKGxhc3Qgd2VlazogTW9uZGF5LCBXZWRuZXNkYXksIHRoZW4gY29tcGV0aXRpb24pXCIsICgpID0+IHtcbiAgICBjb25zdCBkZWYgPSBzaGVpa28yOTMyLmJ1aWxkKHsgcnVuOiBcIjMyXCIgfSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIlMzMlc0RDFcIikuc2xpY2UoMCwgMikpLnRvRXF1YWwoW1wiYmVuY2ggM0A1MCAzQDYweDIgMkA3MHgyIDFANzV4NFwiLCBcImRlYWRsaWZ0IDNANTAgMkA2MHgyIDJANzB4NFwiXSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIlMzMlc0RDJcIikpLnRvRXF1YWwoW1wic3F1YXQgM0A1MCAzQDYweDIgMkA3MHgzXCIsIFwiYmVuY2ggM0A1MCAzQDYweDIgMkA3MHgzXCJdKTtcbiAgICBleHBlY3QoZGVmLmRheXMuZmlsdGVyKChkKSA9PiBkLndlZWtzPy5bMF0gPT09IDMpKS50b0hhdmVMZW5ndGgoMik7XG4gIH0pO1xuICBpdChcIiMzNyB3ZWVrIDIgRnJpZGF5XCIsICgpID0+IHtcbiAgICBleHBlY3Qoc3BlYyhzaGVpa28zNy5idWlsZCh7fSksIFwiUzM3VzJEM1wiKSkudG9FcXVhbChbXG4gICAgICBcInNxdWF0IDRANTAgNEA2MCAzQDcweDIgM0A3NXg2XCIsIFwiYmVuY2ggNkA1MCA1QDYwIDRANzB4MiAzQDc1eDIgMkA4MHgyIDRANzUgNUA3MCA2QDYwIDdANTBcIixcbiAgICAgIFwiY2hlc3RGbHkgNXgxMFwiLCBleHBlY3Quc3RyaW5nTWF0Y2hpbmcoLyA1eDEwJC8pLCBcInNxdWF0IDNANTUgM0A2NSAyQDc1eDRcIiwgXCJnb29kTW9ybmluZyA1eDZcIixcbiAgICBdKTtcbiAgfSk7XG4gIGl0KFwiQmVnaW5uZXIgcHJlcCB3ZWVrIDEgTW9uZGF5IGFuZCBjb21wIHdlZWsgNCBXZWRuZXNkYXlcIiwgKCkgPT4ge1xuICAgIGNvbnN0IGRlZiA9IHNoZWlrb0JlZ2lubmVyLmJ1aWxkKHt9KTtcbiAgICBleHBlY3Qoc3BlYyhkZWYsIFwiQlAxVzFEMVwiKS5zbGljZSgwLCAyKSkudG9FcXVhbChbXCJzcXVhdCA1QDUwIDVANjAgNEA3MHg0XCIsIFwiYmVuY2ggNUA1MCA0QDYwIDNANzAgM0A3NXg0XCJdKTtcbiAgICBleHBlY3Qoc3BlYyhkZWYsIFwiQkNXNEQyXCIpKS50b0VxdWFsKFtcInNxdWF0IDNANTAgM0A2MCAyQDY1eDNcIiwgXCJiZW5jaCAzQDUwIDNANjAgMkA3MHgzXCJdKTtcbiAgfSk7XG4gIGl0KFwiQU1MIGNvbXAgd2VlayAyIFdlZG5lc2RheSBtYXggc2luZ2xlcyBhbmQgdGhlIGZpbmFsIHdlZWtcIiwgKCkgPT4ge1xuICAgIGNvbnN0IGRlZiA9IHNoZWlrb0FtbC5idWlsZCh7fSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIkE0VzJEMlwiKS5zbGljZSgwLCAyKSkudG9FcXVhbChbXCJiZW5jaCAzQDUwIDNANjAgM0A3MCAyQDgwIDFAOTAgMUA5NSAxQDEwMFwiLCBcImRlYWRsaWZ0IDNANTAgM0A2MCAyQDcwIDJAODAgMUA5MCAxQDk1IDFAMTAwXCJdKTtcbiAgICBleHBlY3Qoc3BlYyhkZWYsIFwiQTRXNUQxXCIpLnNsaWNlKDAsIDIpKS50b0VxdWFsKFtcImJlbmNoIDNANTAgM0A2MCAyQDcweDIgMUA3NXgzXCIsIFwiZGVhZGxpZnQgM0A1MCAzQDYwIDJANzB4M1wiXSk7XG4gICAgZXhwZWN0KHNwZWMoZGVmLCBcIkE0VzVEMlwiKSkudG9FcXVhbChbXCJzcXVhdCAzQDUwIDJANjAgMUA3MHgzXCIsIFwiYmVuY2ggM0A1MCAzQDYwIDJANzB4M1wiXSk7XG4gIH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7QUFHQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksV0FBVyxjQUFjLHFCQUFxQjtBQUNuRSxTQUFTLFNBQVMsTUFBTSxnQkFBZ0I7QUFDeEMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsU0FBUyx5QkFBeUI7QUFNM0MsSUFBTSxRQUFrQixDQUFDO0FBRWxCLFNBQVNBLFVBQVMsTUFBYyxJQUFnQjtBQUNyRCxRQUFNLE9BQU8sQ0FBQyxHQUFHLE9BQU8sSUFBSTtBQUM1QixTQUFnQixrQkFBUyxNQUFNLE1BQU07QUFBRSxVQUFNLFFBQVEsTUFBTSxPQUFPLENBQUM7QUFBRyxVQUFNLEtBQUssR0FBRyxJQUFJO0FBQUcsUUFBSTtBQUFFLFNBQUc7QUFBQSxJQUFHLFVBQUU7QUFBVSxZQUFNLE9BQU8sQ0FBQztBQUFHLFlBQU0sS0FBSyxHQUFHLEtBQUs7QUFBQSxJQUFHO0FBQUEsRUFBRSxDQUFDO0FBQy9KO0FBUU8sSUFBTSxrQkFBa0I7QUFHL0IsU0FBUyxTQUFTLFFBQWdCO0FBQ2hDLFNBQU8sQ0FBQyxNQUFjLElBQVMsVUFBeUMsb0JBQTBCO0FBQ2hHLFVBQU0sT0FBTyxDQUFDLEdBQUcsT0FBTyxJQUFJO0FBQzVCLFdBQU8sTUFBTSxFQUFFLFNBQVMsT0FBTyxZQUFZLFdBQVcsVUFBVSxRQUFRLFdBQVcsZ0JBQWdCLEdBQUcsS0FBSyxZQUFZO0FBQ3JILGdCQUFVLEVBQUUsTUFBTSxLQUFLLEtBQUssS0FBSyxHQUFHLFFBQVEsb0JBQUksSUFBSSxFQUFFO0FBQ3RELFlBQU0sR0FBRztBQUFBLElBQ1gsSUFBSSxNQUFTO0FBQUEsRUFDZjtBQUNGO0FBU0EsU0FBUyxTQUFhO0FBQ3BCLFFBQU1DLE1BQUssU0FBa0IsV0FBRTtBQUMvQixFQUFBQSxJQUFHLE9BQU8sU0FBa0IsWUFBRyxJQUFJO0FBQ25DLEVBQUFBLElBQUcsT0FBTyxTQUFrQixZQUFHLElBQUk7QUFDbkMsRUFBQUEsSUFBRyxPQUFPLENBQUMsU0FBaUI7QUFBRSxJQUFTLFlBQUcsS0FBSyxJQUFJO0FBQUEsRUFBRztBQUN0RCxFQUFBQSxJQUFHLE9BQU8sQ0FBSSxVQUF3QixDQUFDLE1BQWMsT0FBcUU7QUFDeEgsVUFBTSxRQUFRLENBQUMsR0FBRyxNQUFNO0FBQ3RCLFlBQU0sT0FBUSxNQUFNLFFBQVEsQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDO0FBQ3ZDLE1BQUFBLElBQUcsZUFBZSxNQUFNLE1BQU0sQ0FBQyxHQUFHLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQztBQUFBLElBQ3JELENBQUM7QUFBQSxFQUNIO0FBQ0EsU0FBT0E7QUFDVDtBQUdBLFNBQVMsZUFBZSxNQUFjLE1BQTBCLE9BQXVCO0FBQ3JGLE1BQUksSUFBSTtBQUNSLE1BQUksTUFBTSxLQUFLLFFBQVEsZ0JBQWdCLENBQUMsTUFBTTtBQUM1QyxRQUFJLE1BQU0sS0FBTSxRQUFPO0FBQ3ZCLFFBQUksTUFBTSxLQUFNLFFBQU8sT0FBTyxLQUFLO0FBQ25DLFVBQU0sSUFBSSxLQUFLLEdBQUc7QUFDbEIsV0FBTyxNQUFNLFFBQVEsTUFBTSxPQUFPLEtBQUssVUFBVSxDQUFDLElBQUksT0FBTyxNQUFNLFdBQVcsSUFBSSxRQUFRLENBQUM7QUFBQSxFQUM3RixDQUFDO0FBQ0QsUUFBTSxRQUFRLEtBQUssQ0FBQztBQUNwQixNQUFJLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDdEMsVUFBTSxJQUFJLFFBQVEsZUFBZSxDQUFDLEdBQUcsUUFBZ0I7QUFDbkQsWUFBTSxJQUFJLElBQUksTUFBTSxHQUFHLEVBQUUsT0FBWSxDQUFDLEdBQUcsTUFBTyxLQUFLLE9BQU8sSUFBSSxFQUFFLENBQUMsR0FBSSxLQUFLO0FBQzVFLGFBQU8sTUFBTSxTQUFZLElBQUksT0FBTyxNQUFNLFdBQVcsSUFBSSxRQUFRLENBQUM7QUFBQSxJQUNwRSxDQUFDO0FBQUEsRUFDSDtBQUNBLFNBQU87QUFDVDtBQUVPLElBQU1BLE1BQUssT0FBTztBQXFCekIsSUFBTSxPQUFPLHVCQUFPLE1BQU07QUE2QjFCLElBQU0sU0FBUyxDQUFDLE1BQTBCLE9BQU8sTUFBTSxjQUFlLEVBQXlDLElBQUksTUFBTTtBQXlDekgsSUFBTSxlQUFlLENBQUMsTUFBZ0MsQ0FBQyxDQUFDLEtBQUssT0FBUSxFQUFpQixvQkFBb0I7QUFHMUcsU0FBUyxPQUFPLEdBQVksR0FBWSxVQUFVLE9BQU8sT0FBTyxvQkFBSSxJQUFvQixHQUFZO0FBQ2xHLE1BQUksYUFBYSxDQUFDLEVBQUcsUUFBTyxFQUFFLGdCQUFnQixDQUFDO0FBQy9DLE1BQUksYUFBYSxDQUFDLEVBQUcsUUFBTyxFQUFFLGdCQUFnQixDQUFDO0FBQy9DLE1BQUksT0FBTyxHQUFHLEdBQUcsQ0FBQyxFQUFHLFFBQU87QUFDNUIsTUFBSSxPQUFPLE1BQU0sWUFBWSxPQUFPLE1BQU0sWUFBWSxNQUFNLFFBQVEsTUFBTSxLQUFNLFFBQU87QUFDdkYsTUFBSSxLQUFLLElBQUksQ0FBQyxNQUFNLEVBQUcsUUFBTztBQUM5QixPQUFLLElBQUksR0FBRyxDQUFDO0FBQ2IsTUFBSSxhQUFhLFFBQVEsYUFBYSxLQUFNLFFBQU8sYUFBYSxRQUFRLGFBQWEsUUFBUSxFQUFFLFFBQVEsTUFBTSxFQUFFLFFBQVE7QUFDdkgsTUFBSSxhQUFhLFVBQVUsYUFBYSxPQUFRLFFBQU8sT0FBTyxDQUFDLE1BQU0sT0FBTyxDQUFDO0FBQzdFLE1BQUksYUFBYSxPQUFPLGFBQWEsS0FBSztBQUN4QyxRQUFJLEVBQUUsYUFBYSxPQUFPLGFBQWEsUUFBUSxFQUFFLFNBQVMsRUFBRSxLQUFNLFFBQU87QUFDekUsZUFBVyxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUcsS0FBSSxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLEdBQUcsR0FBRyxTQUFTLElBQUksRUFBRyxRQUFPO0FBQ3JGLFdBQU87QUFBQSxFQUNUO0FBQ0EsTUFBSSxhQUFhLE9BQU8sYUFBYSxLQUFLO0FBQ3hDLFFBQUksRUFBRSxhQUFhLE9BQU8sYUFBYSxRQUFRLEVBQUUsU0FBUyxFQUFFLEtBQU0sUUFBTztBQUN6RSxlQUFXLEtBQUssRUFBRyxLQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsR0FBRyxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sT0FBTyxHQUFHLEdBQUcsU0FBUyxJQUFJLENBQUMsRUFBRyxRQUFPO0FBQzdGLFdBQU87QUFBQSxFQUNUO0FBQ0EsTUFBSSxZQUFZLE9BQU8sQ0FBQyxLQUFLLFlBQVksT0FBTyxDQUFDLEVBQUcsUUFBTyxrQkFBa0IsR0FBRyxDQUFDO0FBQ2pGLE1BQUksTUFBTSxRQUFRLENBQUMsTUFBTSxNQUFNLFFBQVEsQ0FBQyxFQUFHLFFBQU87QUFDbEQsTUFBSSxNQUFNLFFBQVEsQ0FBQyxLQUFLLE1BQU0sUUFBUSxDQUFDLEdBQUc7QUFDeEMsUUFBSSxFQUFFLFdBQVcsRUFBRSxPQUFRLFFBQU87QUFDbEMsV0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLE1BQU0sT0FBTyxFQUFFLENBQUMsR0FBRyxHQUFHLFNBQVMsSUFBSSxDQUFDO0FBQUEsRUFDekQ7QUFDQSxRQUFNLEtBQUssR0FBOEIsS0FBSztBQUM5QyxRQUFNLE9BQU8sQ0FBQyxNQUErQixPQUFPLEtBQUssQ0FBQyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxNQUFNLE1BQVM7QUFDNUYsTUFBSSxRQUFTLFFBQU8sT0FBTyxLQUFLLEVBQUUsRUFBRSxNQUFNLENBQUMsTUFBTyxHQUFHLENBQUMsTUFBTSxTQUFZLEdBQUcsQ0FBQyxNQUFNLFNBQVksS0FBSyxNQUFNLE9BQU8sR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUU7QUFDMUksUUFBTSxLQUFLLEtBQUssRUFBRSxHQUFHLEtBQUssS0FBSyxFQUFFO0FBQ2pDLE1BQUksR0FBRyxXQUFXLEdBQUcsT0FBUSxRQUFPO0FBQ3BDLFNBQU8sR0FBRyxNQUFNLENBQUMsTUFBTSxPQUFPLFVBQVUsZUFBZSxLQUFLLElBQUksQ0FBQyxLQUFLLE9BQU8sR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsT0FBTyxJQUFJLENBQUM7QUFDekc7QUFJQSxJQUFJLFVBQXlELEVBQUUsTUFBTSxJQUFJLFFBQVEsb0JBQUksSUFBSSxFQUFFO0FBQzNGLElBQU0sWUFBWSxvQkFBSSxJQUFvQztBQUMxRCxJQUFNLGFBQWEsb0JBQUksSUFBWTtBQU1uQyxTQUFTLFdBQW1CO0FBQzFCLFFBQU0sT0FBTyxRQUFRLElBQUk7QUFDekIsUUFBTSxTQUFTLFFBQVEsS0FBSyxDQUFDLEtBQUs7QUFDbEMsUUFBTSxPQUFPLE9BQU8sS0FBSyxNQUFNLFlBQVksSUFBSTtBQUMvQyxNQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sV0FBVyxJQUFJLEVBQUcsT0FBTSxJQUFJLE1BQU0scURBQXFEO0FBQzVHLFFBQU0sTUFBTSxLQUFLLE1BQU0sU0FBUyxNQUFNLE1BQU0sQ0FBQyxFQUFFLFFBQVEsVUFBVSxLQUFLO0FBQ3RFLFNBQU8sS0FBSyxRQUFRLEdBQUcsR0FBRyxpQkFBaUIsSUFBSSxNQUFNLEdBQUcsRUFBRSxJQUFJLElBQUksT0FBTztBQUMzRTtBQUVBLFNBQVMsVUFBVSxNQUFzQztBQUN2RCxNQUFJLFFBQVEsVUFBVSxJQUFJLElBQUk7QUFDOUIsTUFBSSxDQUFDLE9BQU87QUFDVixZQUFRLENBQUM7QUFDVCxRQUFJLFdBQVcsSUFBSSxFQUFHLEtBQUksU0FBUyxXQUFXLGFBQWEsTUFBTSxNQUFNLENBQUMsRUFBRSxLQUFLO0FBQy9FLGNBQVUsSUFBSSxNQUFNLEtBQUs7QUFBQSxFQUMzQjtBQUNBLFNBQU87QUFDVDtBQUdBLElBQU0sWUFBWSxDQUFDLE1BQWdCLE9BQU8sTUFBTSxXQUFXLElBQUksQ0FBQyxNQUFNLEtBQUssVUFBVSxHQUFHLE1BQU0sQ0FBQztBQUMvRixJQUFNLGlCQUFpQixDQUFDLE1BQWMsRUFBRSxRQUFRLE9BQU8sTUFBTSxFQUFFLFFBQVEsTUFBTSxLQUFLLEVBQUUsUUFBUSxTQUFTLE1BQU07QUFFM0csUUFBUSxHQUFHLFFBQVEsTUFBTTtBQUN2QixhQUFXLFFBQVEsWUFBWTtBQUM3QixVQUFNLFFBQVEsVUFBVSxJQUFJLElBQUk7QUFDaEMsVUFBTSxPQUFPLE9BQU8sS0FBSyxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLGFBQWEsZUFBZSxDQUFDLENBQUMsV0FBVyxlQUFlLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxDQUFPLEVBQUUsS0FBSyxJQUFJO0FBQ3JJLGNBQVUsUUFBUSxJQUFJLEdBQUcsRUFBRSxXQUFXLEtBQUssQ0FBQztBQUM1QyxrQkFBYyxNQUFNO0FBQUE7QUFBQSxFQUFvRSxJQUFJLEVBQUU7QUFDOUYsWUFBUSxJQUFJLFdBQVcsU0FBUyxRQUFRLElBQUksR0FBRyxJQUFJLENBQUMsRUFBRTtBQUFBLEVBQ3hEO0FBQ0YsQ0FBQztBQUVELFNBQVMsY0FBYyxRQUFpQixNQUFlO0FBQ3JELFFBQU0sT0FBTyxPQUFPLEdBQUcsUUFBUSxJQUFJLE1BQU0sSUFBSSxLQUFLLFFBQVE7QUFDMUQsUUFBTSxLQUFLLFFBQVEsT0FBTyxJQUFJLElBQUksS0FBSyxLQUFLO0FBQzVDLFVBQVEsT0FBTyxJQUFJLE1BQU0sQ0FBQztBQUMxQixRQUFNLE1BQU0sR0FBRyxJQUFJLElBQUksQ0FBQztBQUN4QixRQUFNLE9BQU8sU0FBUztBQUN0QixRQUFNLFFBQVEsVUFBVSxJQUFJO0FBQzVCLFFBQU0sTUFBTTtBQUFBLEVBQUssVUFBVSxNQUFNLENBQUM7QUFBQTtBQUVsQyxNQUFJLEVBQUUsT0FBTyxVQUFVLFFBQVEsSUFBSSxNQUFNLENBQUMsUUFBUSxJQUFJLGlCQUFrQixRQUFPLEVBQUUsTUFBTSxPQUFPLFNBQVMscUJBQXFCLEdBQUcsc0RBQXNEO0FBQ3JMLE1BQUksUUFBUSxJQUFJLG9CQUFvQixFQUFFLE9BQU8sUUFBUTtBQUNuRCxRQUFJLE1BQU0sR0FBRyxNQUFNLEtBQUs7QUFBRSxZQUFNLEdBQUcsSUFBSTtBQUFLLGlCQUFXLElBQUksSUFBSTtBQUFBLElBQUc7QUFDbEUsV0FBTyxFQUFFLE1BQU0sTUFBTSxTQUFTLEdBQUc7QUFBQSxFQUNuQztBQUNBLFNBQU8sRUFBRSxNQUFNLE1BQU0sR0FBRyxNQUFNLEtBQUssU0FBUyxhQUFhLEdBQUc7QUFBQSxXQUF3QixNQUFNLEdBQUcsQ0FBQztBQUFBLFdBQWMsR0FBRywyQ0FBMkM7QUFDNUo7QUFJQSxJQUFNLE9BQU8sQ0FBQyxNQUFnQixhQUFhLENBQUMsSUFBSSxFQUFFLFNBQVMsSUFBSSxRQUFRLEdBQUcsRUFBRSxPQUFPLEdBQUcsYUFBYSxJQUFJLENBQUM7QUFLeEcsSUFBTSxXQUFxQjtBQUFBLEVBQ3pCLE1BQU0sQ0FBQyxHQUFHLE9BQU8sRUFBRSxNQUFNLE9BQU8sR0FBRyxHQUFHLENBQUMsR0FBRyxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsVUFBVSxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQUEsRUFDMUYsU0FBUyxDQUFDLEdBQUcsT0FBTyxFQUFFLE1BQU0sT0FBTyxHQUFHLENBQUMsR0FBRyxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsYUFBYSxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQUEsRUFDN0YsZUFBZSxDQUFDLEdBQUcsT0FBTyxFQUFFLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxHQUFHLFNBQVMsWUFBWSxLQUFLLENBQUMsQ0FBQyxzQkFBc0IsS0FBSyxDQUFDLENBQUMsR0FBRztBQUFBLEVBQ3ZILGVBQWUsQ0FBQyxHQUFHLE9BQU8sRUFBRSxNQUFNLE9BQU8sR0FBRyxHQUFHLElBQUksR0FBRyxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsb0JBQW9CLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFBQSxFQUNoSCxhQUFhLENBQUMsR0FBRyxHQUFXLFNBQVMsT0FBTztBQUFBLElBQzFDLE1BQU0sT0FBTyxNQUFNLGFBQWEsTUFBTSxLQUFLLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxNQUFNLENBQUMsU0FBUztBQUFBLElBQzdFLFNBQVMsWUFBWSxLQUFLLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLE1BQU07QUFBQSxFQUM3RDtBQUFBLEVBQ0EsaUJBQWlCLENBQUMsR0FBRyxPQUFPLEVBQUUsTUFBTyxJQUFlLEdBQUcsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHO0FBQUEsRUFDN0Ysd0JBQXdCLENBQUMsR0FBRyxPQUFPLEVBQUUsTUFBTyxLQUFnQixHQUFHLFNBQVMsWUFBWSxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRztBQUFBLEVBQ3RHLGNBQWMsQ0FBQyxHQUFHLE9BQU8sRUFBRSxNQUFPLElBQWUsR0FBRyxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUc7QUFBQSxFQUMxRixxQkFBcUIsQ0FBQyxHQUFHLE9BQU8sRUFBRSxNQUFPLEtBQWdCLEdBQUcsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHO0FBQUEsRUFDbkcsY0FBYyxDQUFDLEdBQUcsT0FBTyxFQUFFLE1BQU8sR0FBMkIsV0FBVyxHQUFHLFNBQVMsbUJBQW1CLENBQUMsU0FBVSxHQUEyQixNQUFNLEtBQUssS0FBSyxDQUFDLENBQUMsSUFBSTtBQUFBLEVBQ25LLGdCQUFnQixDQUFDLEdBQUcsUUFBZ0IsTUFBaUI7QUFDbkQsVUFBTSxPQUFPLElBQUksTUFBTSxHQUFHO0FBQzFCLFFBQUksSUFBUztBQUNiLGVBQVcsS0FBSyxNQUFNO0FBQUUsVUFBSSxLQUFLLFFBQVEsRUFBRSxLQUFLLE9BQU8sQ0FBQyxHQUFJLFFBQU8sRUFBRSxNQUFNLE9BQU8sU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLHFCQUFxQixHQUFHLEdBQUc7QUFBRyxVQUFJLEVBQUUsQ0FBQztBQUFBLElBQUc7QUFDdEosV0FBTyxFQUFFLE1BQU0sRUFBRSxXQUFXLEtBQUssT0FBTyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEdBQUcsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLFlBQVksR0FBRyxNQUFNLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFBQSxFQUNsSTtBQUFBLEVBQ0EsVUFBVSxDQUFDLE9BQU8sRUFBRSxNQUFNLE1BQU0sTUFBTSxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsY0FBYztBQUFBLEVBQ2hGLGVBQWUsQ0FBQyxPQUFPLEVBQUUsTUFBTSxNQUFNLFFBQVcsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLG1CQUFtQjtBQUFBLEVBQy9GLGFBQWEsQ0FBQyxPQUFPLEVBQUUsTUFBTSxNQUFNLFFBQVcsU0FBUywyQkFBMkI7QUFBQSxFQUNsRixZQUFZLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEdBQUcsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLGdCQUFnQjtBQUFBLEVBQzdFLFdBQVcsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLEdBQUcsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLGVBQWU7QUFBQSxFQUMxRSxTQUFTLENBQUMsT0FBTyxFQUFFLE1BQU0sT0FBTyxNQUFNLENBQUMsR0FBRyxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsYUFBYTtBQUFBLEVBQ25GLGdCQUFnQixDQUFDLEdBQUcsU0FBUyxFQUFFLE1BQU0sYUFBYSxLQUFLLFNBQVMsWUFBWSxLQUFLLENBQUMsQ0FBQyx5QkFBeUIsS0FBSyxJQUFJLEdBQUc7QUFBQSxFQUN4SCxZQUFZLENBQUMsR0FBRyxPQUFlLEVBQUUsTUFBTSxPQUFPLE1BQU0sR0FBRyxTQUFTLG1CQUFtQixLQUFLLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRztBQUFBLEVBQ3hHLFNBQVMsQ0FBQyxHQUFHLFFBQXlCO0FBQUEsSUFDcEMsTUFBTSxPQUFPLE1BQU0sYUFBYSxPQUFPLE9BQU8sV0FBVyxFQUFFLFNBQVMsRUFBRSxJQUFJLEdBQUcsS0FBSyxDQUFDO0FBQUEsSUFDbkYsU0FBUyxZQUFZLEtBQUssQ0FBQyxDQUFDLGFBQWEsT0FBTyxFQUFFLENBQUM7QUFBQSxFQUNyRDtBQUFBLEVBQ0EsV0FBVyxDQUFDLEdBQUcsVUFBVTtBQUFBLElBQ3ZCLE1BQU0sT0FBTyxNQUFNLFdBQVcsRUFBRSxTQUFTLElBQWMsSUFBSSxNQUFNLFFBQVEsQ0FBQyxLQUFLLGFBQWEsTUFBTSxDQUFDLEdBQUksQ0FBdUIsRUFBRSxTQUFTLElBQUksSUFBSTtBQUFBLElBQ2pKLFNBQVMsWUFBWSxLQUFLLENBQUMsQ0FBQyxlQUFlLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDdkQ7QUFBQSxFQUNBLGdCQUFnQixDQUFDLEdBQUcsVUFBVSxFQUFFLE1BQU0sTUFBTSxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsR0FBRyxTQUFTLFlBQVksS0FBSyxDQUFDLENBQUMsZ0NBQWdDLEtBQUssSUFBSSxDQUFDLEdBQUc7QUFBQSxFQUNuSyxTQUFTLENBQUMsV0FBVyxhQUF1QjtBQUMxQyxRQUFJLEtBQWMsUUFBUTtBQUMxQixRQUFJLE9BQU8sY0FBYyxZQUFZO0FBQUUsVUFBSTtBQUFFLFFBQUMsVUFBNEI7QUFBQSxNQUFHLFNBQVMsR0FBRztBQUFFLGdCQUFRO0FBQU0sY0FBTTtBQUFBLE1BQUc7QUFBQSxJQUFFLE9BQy9HO0FBQUUsY0FBUTtBQUFNLFlBQU07QUFBQSxJQUFXO0FBQ3RDLFVBQU0sTUFBTSxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRztBQUMzRCxRQUFJLE9BQU87QUFDWCxRQUFJLFNBQVMsYUFBYSxRQUFXO0FBQ25DLFVBQUksT0FBTyxhQUFhLFNBQVUsUUFBTyxJQUFJLFNBQVMsUUFBUTtBQUFBLGVBQ3JELG9CQUFvQixPQUFRLFFBQU8sU0FBUyxLQUFLLEdBQUc7QUFBQSxlQUNwRCxPQUFPLGFBQWEsV0FBWSxRQUFPLGVBQWdCO0FBQUEsZUFDdkQsb0JBQW9CLE1BQU8sUUFBTyxRQUFRLFNBQVM7QUFBQSxJQUM5RDtBQUNBLFdBQU8sRUFBRSxNQUFNLFNBQVMsUUFBUSx1QkFBdUIsR0FBRyxjQUFjLEtBQUssUUFBUSxDQUFDLEtBQUssbUJBQW1CLGFBQWEsU0FBWSxLQUFLLGFBQWEsS0FBSyxRQUFRLENBQUMsRUFBRSxHQUFHO0FBQUEsRUFDOUs7QUFBQSxFQUNBLGlCQUFpQixDQUFDLEdBQUcsU0FBa0IsY0FBYyxHQUFHLElBQUk7QUFDOUQ7QUFDQSxTQUFTLGVBQWUsU0FBUztBQUNqQyxJQUFNLFFBQVEsQ0FBQyxNQUFlO0FBQUUsTUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFHLE9BQU0sSUFBSSxVQUFVLEdBQUcsS0FBSyxDQUFDLENBQUMsbUJBQW1CO0FBQUcsU0FBTyxFQUFFLEtBQUs7QUFBTztBQUN6SCxTQUFTLG1CQUFtQixDQUFDLE9BQU8sRUFBRSxNQUFNLE1BQU0sQ0FBQyxFQUFFLFNBQVMsR0FBRyxTQUFTLHdDQUF3QztBQUNsSCxTQUFTLHdCQUF3QixDQUFDLEdBQUcsT0FBZSxFQUFFLE1BQU0sTUFBTSxDQUFDLEVBQUUsV0FBVyxHQUFHLFNBQVMsWUFBWSxDQUFDLGVBQWUsTUFBTSxDQUFDLEVBQUUsTUFBTSxHQUFHO0FBQzFJLFNBQVMsdUJBQXVCLENBQUMsTUFBTSxVQUFxQixFQUFFLE1BQU0sTUFBTSxDQUFDLEVBQUUsS0FBSyxDQUFDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxHQUFHLFNBQVMsd0JBQXdCLEtBQUssSUFBSSxDQUFDLFlBQVksS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLEdBQUc7QUFDbkwsU0FBUywyQkFBMkIsQ0FBQyxNQUFNLFVBQXFCLEVBQUUsTUFBTSxPQUFPLE1BQU0sQ0FBQyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUksR0FBRyxTQUFTLGdDQUFnQyxLQUFLLElBQUksQ0FBQyxZQUFZLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHO0FBQ3ZMLFNBQVMsMEJBQTBCLENBQUMsR0FBRyxNQUFjLFVBQXFCLEVBQUUsTUFBTSxPQUFPLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxHQUFHLElBQUksR0FBRyxTQUFTLGlCQUFpQixDQUFDLFVBQVUsS0FBSyxJQUFJLENBQUMsWUFBWSxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRztBQTBDN0wsU0FBUyxLQUFLLEdBQVcsUUFBaUIsT0FBZ0I7QUFDeEQsTUFBSSxFQUFFLFNBQVMsUUFBUTtBQUNyQixVQUFNLFdBQVcsUUFBUSxHQUFHLEtBQUssT0FBTyxPQUFPLFNBQVMsUUFBUSxFQUFFLE9BQU8sS0FBSyxFQUFFO0FBQ2hGLFVBQU0sSUFBSSxlQUFlLEVBQUUsUUFBUSxDQUFDO0FBQUEsRUFDdEM7QUFDRjtBQUlBLFNBQVMsTUFBTSxRQUF1QixRQUFpQixPQUEyQixPQUF5QjtBQUN6RyxRQUFNLE1BQStCLENBQUM7QUFDdEMsYUFBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLE9BQU8sUUFBUSxRQUFRLEdBQUc7QUFDaEQsUUFBSSxJQUFJLElBQUksUUFDUixVQUFVLFNBQW9CLEtBQUssRUFBRSxNQUFNLE9BQU8sR0FBRyxHQUFHLElBQUksR0FBRyxRQUFRLEtBQUssSUFDNUUsSUFBSSxTQUFvQixLQUFLLEVBQUUsT0FBTyxHQUFHLEdBQUcsSUFBSSxHQUFHLFFBQVEsS0FBSztBQUFBLEVBQ3RFO0FBQ0EsU0FBTztBQUNUO0FBRU8sU0FBUyxPQUFVLFFBQVcsT0FBNkI7QUFDaEUsUUFBTSxJQUFJLE1BQU0sTUFBTSxRQUFRLE9BQU8sT0FBTyxLQUFLO0FBQ2pELElBQUUsTUFBTSxNQUFNLE1BQU0sUUFBUSxNQUFNLE9BQU8sS0FBSztBQUM5QyxRQUFNLFNBQVMsQ0FBQyxTQUErQixZQUFZO0FBQ3pELFFBQUk7QUFDRixZQUFNLElBQUksTUFBTztBQUNqQixVQUFJLFNBQVMsU0FBVSxPQUFNLElBQUksZUFBZSxFQUFFLFNBQVMsR0FBRyxRQUFRLFFBQVEsT0FBTyxFQUFFLDZCQUE2QixLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUM7QUFDL0gsYUFBTztBQUFBLElBQ1QsU0FBUyxLQUFLO0FBQ1osVUFBSSxlQUFlLGtCQUFrQixTQUFTLFNBQVUsT0FBTTtBQUM5RCxVQUFJLFNBQVMsVUFBVyxPQUFNO0FBQzlCLGFBQU87QUFBQSxJQUNUO0FBQUEsRUFDRjtBQUNBLElBQUUsV0FBVyxPQUFPLE9BQU8sTUFBTSxPQUFPLFNBQVMsR0FBRyxPQUFPLE9BQU8sSUFBSSxHQUFHLEVBQUUsS0FBSyxNQUFNLE9BQU8sU0FBUyxHQUFHLE1BQU0sT0FBTyxJQUFJLEVBQUUsQ0FBQztBQUM3SCxJQUFFLFVBQVUsT0FBTyxPQUFPLE1BQU0sT0FBTyxRQUFRLEdBQUcsT0FBTyxPQUFPLElBQUksR0FBRyxFQUFFLEtBQUssTUFBTSxPQUFPLFFBQVEsR0FBRyxNQUFNLE9BQU8sSUFBSSxFQUFFLENBQUM7QUFDMUgsU0FBTztBQUNUO0FBRUEsSUFBTSxhQUFhLENBQUMsTUFBYyxVQUErQyxFQUFFLGlCQUFpQixNQUFNLFVBQVUsTUFBTSxLQUFLO0FBRS9ILE9BQU8sVUFBVSxDQUFDLEdBQVcsU0FBUyxNQUFNLFdBQVcsV0FBVyxDQUFDLEtBQUssTUFBTSxLQUFLLENBQUMsTUFBTSxPQUFPLE1BQU0sWUFBWSxLQUFLLElBQUksSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQztBQUN0SixPQUFPLG1CQUFtQixDQUFDLE1BQStCLFdBQVcsb0JBQW9CLEtBQUssQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLE9BQU8sR0FBRyxHQUFHLElBQUksQ0FBQztBQUM5SCxPQUFPLGtCQUFrQixDQUFDLE9BQWtCLFdBQVcsbUJBQW1CLEtBQUssRUFBRSxDQUFDLEtBQUssQ0FBQyxNQUFNLE1BQU0sUUFBUSxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzlKLE9BQU8sbUJBQW1CLENBQUMsTUFBYyxXQUFXLG9CQUFvQixLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxPQUFPLE1BQU0sWUFBWSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ2pJLE9BQU8saUJBQWlCLENBQUMsT0FBd0IsV0FBVyxrQkFBa0IsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLE1BQU0sT0FBTyxNQUFNLGFBQWEsT0FBTyxPQUFPLFdBQVcsRUFBRSxTQUFTLEVBQUUsSUFBSSxHQUFHLEtBQUssQ0FBQyxFQUFFO0FBQ25MLE9BQU8sTUFBTSxDQUFDLFFBQWlCLFdBQVcsT0FBUSxLQUEyQixJQUFJLEtBQUssQ0FBQyxNQUNyRixRQUFRLFNBQVMsT0FBTyxNQUFNLFdBQVcsUUFBUSxTQUFTLE9BQU8sTUFBTSxXQUFXLFFBQVEsVUFBVSxPQUFPLE1BQU0sWUFBWSxRQUFRLFdBQVcsT0FBTyxNQUFNLGFBQWEsYUFBYyxHQUF5QjtBQUNuTixPQUFPLFdBQVcsTUFBTSxXQUFXLGNBQWMsQ0FBQyxNQUFNLEtBQUssSUFBSTs7O0FDclpqRSxJQUFNLElBQUksQ0FBQyxNQUFjLE9BQWUsTUFBZ0IsUUFBZ0IsVUFBbUIsVUFBNkIsRUFBRSxNQUFNLE9BQU8sTUFBTSxRQUFRLE9BQU8sS0FBSztBQU0xSixJQUFNLFFBQWlDO0FBQUE7QUFBQSxFQUU1QyxPQUFPLEVBQUUsY0FBYyxTQUFTLFdBQVcsU0FBUyxPQUFPLG1CQUFtQixZQUFZO0FBQUEsRUFDMUYsT0FBTyxFQUFFLGVBQWUsU0FBUyxXQUFXLFNBQVMsTUFBTSx1QkFBdUI7QUFBQSxFQUNsRixVQUFVLEVBQUUsWUFBWSxZQUFZLFdBQVcsUUFBUSxPQUFPLG9CQUFvQjtBQUFBLEVBQ2xGLEtBQUssRUFBRSxrQkFBa0IsT0FBTyxXQUFXLGFBQWEsTUFBTSw0QkFBNEIsbUNBQW1DO0FBQUE7QUFBQSxFQUc3SCxZQUFZLEVBQUUsZUFBZSxZQUFZLFdBQVcsU0FBUyxPQUFPLHlCQUF5QiwwQkFBMEIscURBQXFEO0FBQUEsRUFDNUssWUFBWSxFQUFFLGVBQWUsWUFBWSxXQUFXLFNBQVMsT0FBTyxhQUFhO0FBQUEsRUFDakYsVUFBVSxFQUFFLGFBQWEsVUFBVSxXQUFXLFNBQVMsT0FBTyxxQkFBcUI7QUFBQSxFQUNuRixVQUFVLEVBQUUsYUFBYSxVQUFVLFdBQVcsU0FBUyxPQUFPLFdBQVc7QUFBQSxFQUN6RSxjQUFjLEVBQUUsaUJBQWlCLFdBQVcsV0FBVyxTQUFTLE9BQU8sZUFBZTtBQUFBO0FBQUEsRUFFdEYsZ0JBQWdCLEVBQUUsb0JBQW9CLFVBQVUsV0FBVyxTQUFTLEtBQUs7QUFBQSxFQUN6RSxXQUFXLEVBQUUsY0FBYyxXQUFXLFdBQVcsU0FBUyxPQUFPLHdCQUF3QixZQUFZO0FBQUEsRUFDckcsVUFBVSxFQUFFLGFBQWEsYUFBYSxXQUFXLFNBQVMsT0FBTyx1QkFBdUIsZ0NBQWdDO0FBQUEsRUFDeEgsYUFBYSxFQUFFLGdCQUFnQixVQUFVLFlBQVksU0FBUyxPQUFPLGNBQWM7QUFBQSxFQUNuRixxQkFBcUIsRUFBRSx5QkFBeUIsT0FBTyxZQUFZLFNBQVMsT0FBTyxvQ0FBb0MsaUNBQWlDO0FBQUEsRUFDeEosWUFBWSxFQUFFLGVBQWUsWUFBWSxZQUFZLFNBQVMsT0FBTyx3QkFBd0I7QUFBQSxFQUM3RixPQUFPLEVBQUUsU0FBUyxTQUFTLFlBQVksU0FBUyxPQUFPLG9CQUFvQiw0QkFBNEIsbUJBQW1CLE9BQU87QUFBQSxFQUNqSSxjQUFjLEVBQUUsaUJBQWlCLFdBQVcsV0FBVyxTQUFTLE9BQU8seUJBQXlCO0FBQUEsRUFDaEcsZUFBZSxFQUFFLGtCQUFrQixZQUFZLFdBQVcsU0FBUyxPQUFPLDBCQUEwQjtBQUFBLEVBQ3BHLFdBQVcsRUFBRSxjQUFjLFdBQVcsV0FBVyxTQUFTLE9BQU8sd0JBQXdCLFlBQVk7QUFBQTtBQUFBLEVBR3JHLGNBQWMsRUFBRSxpQkFBaUIsV0FBVyxXQUFXLFFBQVEsT0FBTyxlQUFlO0FBQUEsRUFDckYsaUJBQWlCLEVBQUUsb0JBQW9CLGNBQWMsV0FBVyxRQUFRLE9BQU8sNEJBQTRCO0FBQUE7QUFBQSxFQUUzRyxlQUFlLEVBQUUsa0JBQWtCLFlBQVksV0FBVyxRQUFRLEtBQUs7QUFBQSxFQUN2RSxvQkFBb0IsRUFBRSx3QkFBd0IsU0FBUyxXQUFXLFFBQVEsS0FBSztBQUFBLEVBQy9FLFVBQVUsRUFBRSxhQUFhLGFBQWEsV0FBVyxRQUFRLE9BQU8sV0FBVztBQUFBLEVBQzNFLEtBQUssRUFBRSxxQkFBcUIsT0FBTyxXQUFXLGNBQWMsT0FBTyw2QkFBNkI7QUFBQSxFQUNoRyxPQUFPLEVBQUUsZ0JBQWdCLFVBQVUsWUFBWSxjQUFjLE9BQU8sOEJBQThCO0FBQUEsRUFDbEcsa0JBQWtCLEVBQUUsc0JBQXNCLFFBQVEsV0FBVyxjQUFjLE9BQU8sdUJBQXVCO0FBQUEsRUFDekcsaUJBQWlCLEVBQUUscUJBQXFCLFdBQVcsV0FBVyxRQUFRLE9BQU8scUJBQXFCO0FBQUEsRUFDbEcsYUFBYSxFQUFFLGdCQUFnQixXQUFXLFdBQVcsY0FBYyxPQUFPLHdCQUF3QjtBQUFBLEVBQ2xHLFdBQVcsRUFBRSxjQUFjLGNBQWMsV0FBVyxVQUFVLE9BQU8sd0JBQXdCLHNCQUFzQjtBQUFBLEVBQ25ILFNBQVMsRUFBRSxZQUFZLFlBQVksV0FBVyxjQUFjLE9BQU8sNEJBQTRCLDZCQUE2QixvQkFBb0I7QUFBQTtBQUFBLEVBRWhKLFlBQVksRUFBRSxlQUFlLFVBQVUsY0FBYyxjQUFjLEtBQUs7QUFBQSxFQUN4RSxlQUFlLEVBQUUsbUJBQW1CLE9BQU8sY0FBYyxjQUFjLE9BQU8sbUJBQW1CLHlCQUF5QjtBQUFBLEVBQzFILGVBQWUsRUFBRSxrQkFBa0IsWUFBWSxjQUFjLFFBQVEsT0FBTyxtQ0FBbUMsNENBQTRDLDBCQUEwQjtBQUFBLEVBQ3JMLGNBQWMsRUFBRSxpQkFBaUIsYUFBYSxXQUFXLFVBQVUsT0FBTyx3QkFBd0I7QUFBQSxFQUNsRyxTQUFTLEVBQUUsb0JBQW9CLFlBQVksWUFBWSxVQUFVLE9BQU8sa0JBQWtCO0FBQUE7QUFBQSxFQUcxRixZQUFZLEVBQUUsZ0JBQWdCLFlBQVksV0FBVyxTQUFTLE1BQU0saUNBQWlDLDhDQUE4QztBQUFBLEVBQ25KLFNBQVMsRUFBRSxvQkFBb0IsWUFBWSxXQUFXLFdBQVcsTUFBTSxvQ0FBb0M7QUFBQSxFQUMzRyxXQUFXLEVBQUUsbUJBQW1CLFdBQVcsV0FBVyxTQUFTLE1BQU0sbUNBQW1DO0FBQUEsRUFDeEcsY0FBYyxFQUFFLHVCQUF1QixXQUFXLFdBQVcsU0FBUyxNQUFNLCtCQUErQjtBQUFBLEVBQzNHLGNBQWMsRUFBRSx1QkFBdUIsV0FBVyxXQUFXLFNBQVMsTUFBTSwrQkFBK0I7QUFBQSxFQUMzRyxhQUFhLEVBQUUsaUJBQWlCLFdBQVcsV0FBVyxTQUFTLE1BQU0sK0JBQStCO0FBQUEsRUFDcEcsWUFBWSxFQUFFLGVBQWUsWUFBWSxXQUFXLFNBQVMsTUFBTSx1QkFBdUI7QUFBQSxFQUMxRixZQUFZLEVBQUUsZUFBZSxTQUFTLFdBQVcsU0FBUyxJQUFJO0FBQUEsRUFDOUQsWUFBWSxFQUFFLGVBQWUsWUFBWSxXQUFXLFNBQVMsSUFBSTtBQUFBLEVBQ2pFLGdCQUFnQixFQUFFLG1CQUFtQixhQUFhLFdBQVcsU0FBUyxJQUFJO0FBQUEsRUFDMUUsZ0JBQWdCLEVBQUUsb0JBQW9CLFVBQVUsWUFBWSxTQUFTLE1BQU0sZ0NBQWdDO0FBQUEsRUFDM0csVUFBVSxFQUFFLGFBQWEsYUFBYSxXQUFXLFNBQVMsTUFBTSxXQUFXO0FBQUEsRUFDM0UsU0FBUyxFQUFFLHdCQUF3QixZQUFZLFlBQVksU0FBUyxNQUFNLHdCQUF3QjtBQUFBLEVBQ2xHLGdCQUFnQixFQUFFLG9CQUFvQixjQUFjLFlBQVksU0FBUyxNQUFNLGdDQUFnQztBQUFBLEVBQy9HLG1CQUFtQixFQUFFLHlCQUF5QixZQUFZLFdBQVcsU0FBUyxNQUFNLHlCQUF5QixxQ0FBcUMsK0JBQStCO0FBQUEsRUFDakwsWUFBWSxFQUFFLGVBQWUsWUFBWSxXQUFXLFNBQVMsTUFBTSwrQkFBK0IscUNBQXFDO0FBQUEsRUFDdkksS0FBSyxFQUFFLE9BQU8sT0FBTyxjQUFjLFNBQVMsTUFBTSxhQUFhLHdCQUF3QixlQUFlLDBCQUEwQixXQUFXO0FBQUEsRUFDM0ksUUFBUSxFQUFFLFdBQVcsV0FBVyxjQUFjLFNBQVMsTUFBTSxXQUFXLG9CQUFvQjtBQUFBLEVBQzVGLFVBQVUsRUFBRSxhQUFhLE9BQU8sWUFBWSxTQUFTLE1BQU0sd0JBQXdCLHdCQUF3Qix3QkFBd0IsdUJBQXVCLDZCQUE2QiwwQkFBMEI7QUFBQSxFQUNqTixZQUFZLEVBQUUsZUFBZSxXQUFXLFlBQVksU0FBUyxNQUFNLDhCQUE4QjtBQUFBLEVBQ2pHLFdBQVcsRUFBRSxjQUFjLGNBQWMsV0FBVyxhQUFhLE1BQU0sWUFBWTtBQUFBLEVBQ25GLFdBQVcsRUFBRSx5QkFBeUIsY0FBYyxXQUFXLGFBQWEsTUFBTSxpQ0FBaUM7QUFBQSxFQUNuSCxPQUFPLEVBQUUsMkJBQTJCLFVBQVUsWUFBWSxhQUFhLE1BQU0sNkJBQTZCLG9DQUFvQywyQkFBMkI7QUFBQSxFQUN6SyxhQUFhLEVBQUUsZ0JBQWdCLFVBQVUsWUFBWSxhQUFhLE1BQU0seUJBQXlCO0FBQUEsRUFDakcsc0JBQXNCLEVBQUUsNEJBQTRCLFlBQVksV0FBVyxhQUFhLE1BQU0sbUNBQW1DLGlDQUFpQztBQUFBLEVBQ2xLLGNBQWMsRUFBRSxpQkFBaUIsYUFBYSxZQUFZLGFBQWEsTUFBTSw0QkFBNEIseUJBQXlCLDJCQUEyQixtQ0FBbUMsa0NBQWtDO0FBQUEsRUFDbE8sWUFBWSxFQUFFLGVBQWUsZUFBZSxZQUFZLGFBQWEsTUFBTSwwQkFBMEIsdUJBQXVCLHVCQUF1QjtBQUFBLEVBQ25KLGFBQWEsRUFBRSxpQkFBaUIsYUFBYSxZQUFZLGFBQWEsTUFBTSxvQ0FBb0MsaUNBQWlDLG1DQUFtQyx3Q0FBd0M7QUFBQSxFQUM1TixVQUFVLEVBQUUsYUFBYSxhQUFhLFdBQVcsYUFBYSxNQUFNLFdBQVc7QUFBQSxFQUMvRSxlQUFlLEVBQUUsbUJBQW1CLGNBQWMsY0FBYyxhQUFhLE1BQU0saUJBQWlCO0FBQUEsRUFDcEcsWUFBWSxFQUFFLGVBQWUsV0FBVyxXQUFXLGFBQWEsTUFBTSx5QkFBeUIsdUJBQXVCLHdCQUF3QjtBQUFBO0FBQUEsRUFHOUksS0FBSyxFQUFFLGVBQWUsVUFBVSxXQUFXLFFBQVEsTUFBTSx5QkFBeUI7QUFBQSxFQUNsRixZQUFZLEVBQUUsZUFBZSxXQUFXLFdBQVcsUUFBUSxNQUFNLHVCQUF1QjtBQUFBLEVBQ3hGLFNBQVMsRUFBRSxZQUFZLFlBQVksV0FBVyxRQUFRLE1BQU0sc0JBQXNCLHFCQUFxQjtBQUFBLEVBQ3ZHLFNBQVMsRUFBRSxhQUFhLFNBQVMsV0FBVyxRQUFRLE1BQU0sYUFBYSw2QkFBNkIsY0FBYztBQUFBLEVBQ2xILE9BQU8sRUFBRSxnQkFBZ0IsVUFBVSxZQUFZLFFBQVEsTUFBTSxnQkFBZ0IsMEJBQTBCO0FBQUEsRUFDdkcsbUJBQW1CLEVBQUUsdUJBQXVCLFVBQVUsWUFBWSxRQUFRLE1BQU0sMENBQTBDLDZCQUE2QjtBQUFBLEVBQ3ZKLFVBQVUsRUFBRSxvQkFBb0IsYUFBYSxXQUFXLFFBQVEsTUFBTSxxQ0FBcUMsK0JBQStCLG9DQUFvQyx3QkFBd0IsdUJBQXVCLDJCQUEyQjtBQUFBLEVBQ3hQLGFBQWEsRUFBRSxnQkFBZ0IsV0FBVyxjQUFjLFFBQVEsTUFBTSxjQUFjO0FBQUEsRUFDcEYsYUFBYSxFQUFFLGdCQUFnQixVQUFVLFdBQVcsUUFBUSxNQUFNLHdCQUF3QiwwQkFBMEIscUNBQXFDLG1DQUFtQztBQUFBLEVBQzVMLFFBQVEsRUFBRSxXQUFXLFdBQVcsY0FBYyxRQUFRLE1BQU0sV0FBVyxzQkFBc0IsY0FBYztBQUFBLEVBQzNHLFFBQVEsRUFBRSxXQUFXLFdBQVcsY0FBYyxRQUFRLE1BQU0sV0FBVyxvQkFBb0I7QUFBQSxFQUMzRixxQkFBcUIsRUFBRSx5QkFBeUIsYUFBYSxXQUFXLFFBQVEsTUFBTSxxQ0FBcUMsNEJBQTRCO0FBQUEsRUFDdkosVUFBVSxFQUFFLFlBQVksWUFBWSxZQUFZLFFBQVEsTUFBTSx1QkFBdUIsb0JBQW9CO0FBQUEsRUFDekcsT0FBTyxFQUFFLFNBQVMsU0FBUyxXQUFXLFNBQVMsTUFBTSxtQkFBbUIsb0JBQW9CLG1CQUFtQixlQUFlO0FBQUE7QUFBQSxFQUc5SCxXQUFXLEVBQUUsY0FBYyxRQUFRLFlBQVksVUFBVSxNQUFNLHlCQUF5QixzQkFBc0Isc0JBQXNCO0FBQUEsRUFDcEksYUFBYSxFQUFFLGdCQUFnQixXQUFXLFdBQVcsVUFBVSxNQUFNLHdCQUF3QixvQkFBb0I7QUFBQSxFQUNqSCxZQUFZLEVBQUUsZUFBZSxVQUFVLFlBQVksVUFBVSxNQUFNLDBCQUEwQix1QkFBdUIsd0JBQXdCO0FBQUEsRUFDNUksYUFBYSxFQUFFLGdCQUFnQixZQUFZLFdBQVcsVUFBVSxNQUFNLDBCQUEwQiwyQkFBMkIsc0JBQXNCO0FBQUEsRUFDakosYUFBYSxFQUFFLGdCQUFnQixZQUFZLFlBQVksVUFBVSxNQUFNLGdDQUFnQztBQUFBLEVBQ3ZHLG1CQUFtQixFQUFFLHNCQUFzQixhQUFhLFlBQVksVUFBVSxNQUFNLG9CQUFvQjtBQUFBLEVBQ3hHLFlBQVksRUFBRSxlQUFlLFVBQVUsWUFBWSxVQUFVLE1BQU0sMEJBQTBCLHVCQUF1QjtBQUFBLEVBQ3BILGNBQWMsRUFBRSxpQkFBaUIsWUFBWSxXQUFXLFVBQVUsTUFBTSwyQkFBMkIsMkJBQTJCLDBCQUEwQjtBQUFBLEVBQ3hKLGdCQUFnQixFQUFFLG9CQUFvQixZQUFZLFdBQVcsV0FBVyxNQUFNLG9CQUFvQix5QkFBeUIscUJBQXFCLGlDQUFpQyxxQ0FBcUM7QUFBQSxFQUN0TixnQkFBZ0IsRUFBRSw4QkFBOEIsY0FBYyxXQUFXLFdBQVcsTUFBTSxzQ0FBc0MsZ0NBQWdDLDZCQUE2Qiw2QkFBNkI7QUFBQSxFQUMxTixnQkFBZ0IsRUFBRSxvQkFBb0IsWUFBWSxZQUFZLFdBQVcsTUFBTSwrQkFBK0IsMEJBQTBCO0FBQUEsRUFDeEksY0FBYyxFQUFFLGdCQUFnQixVQUFVLFdBQVcsV0FBVyxNQUFNLDBCQUEwQix5QkFBeUI7QUFBQSxFQUN6SCxTQUFTLEVBQUUsWUFBWSxZQUFZLFdBQVcsV0FBVyxNQUFNLG9CQUFvQjtBQUFBLEVBQ25GLFdBQVcsRUFBRSxjQUFjLGNBQWMsV0FBVyxZQUFZLE1BQU0sK0JBQStCLDhCQUE4QiwrQkFBK0I7QUFBQTtBQUFBLEVBR2xLLFdBQVcsRUFBRSxjQUFjLFFBQVEsV0FBVyxVQUFVLE9BQU8saUNBQWlDLHVCQUF1QixpQ0FBaUMsK0JBQStCLHdCQUF3QixnQ0FBZ0M7QUFBQSxFQUMvTyxpQkFBaUIsRUFBRSxxQkFBcUIsYUFBYSxXQUFXLFVBQVUsT0FBTyxtQkFBbUI7QUFBQSxFQUNwRyxpQkFBaUIsRUFBRSxxQkFBcUIsT0FBTyxjQUFjLE9BQU8sT0FBTyxxQkFBcUIsc0JBQXNCLGFBQWE7QUFBQSxFQUNuSSxTQUFTLEVBQUUsWUFBWSxZQUFZLGNBQWMsT0FBTyxPQUFPLFVBQVU7QUFBQSxFQUN6RSxhQUFhLEVBQUUsZ0JBQWdCLFlBQVksV0FBVyxPQUFPLE9BQU8sZ0JBQWdCLGtCQUFrQjtBQUFBLEVBQ3RHLFNBQVMsRUFBRSxZQUFZLFlBQVksY0FBYyxPQUFPLE9BQU8sVUFBVTtBQUFBLEVBQ3pFLFdBQVcsRUFBRSxjQUFjLGNBQWMsY0FBYyxPQUFPLE9BQU8sWUFBWTtBQUFBLEVBQ2pGLFFBQVEsRUFBRSxVQUFVLFVBQVUsY0FBYyxPQUFPLE9BQU8sVUFBVSxxQkFBcUIsa0JBQWtCLGtCQUFrQixnQkFBZ0I7QUFBQSxFQUM3SSxhQUFhLEVBQUUsZ0JBQWdCLFVBQVUsV0FBVyxPQUFPLE9BQU8sY0FBYztBQUFBLEVBQ2hGLE9BQU8sRUFBRSxTQUFTLFNBQVMsY0FBYyxPQUFPLE9BQU8sT0FBTztBQUFBLEVBQzlELE9BQU8sRUFBRSxVQUFVLFVBQVUsY0FBYyxPQUFPLE9BQU8sVUFBVSxxQkFBcUIsMkJBQTJCO0FBQUEsRUFDbkgsYUFBYSxFQUFFLGlCQUFpQixXQUFXLFlBQVksUUFBUSxPQUFPLGNBQWM7QUFBQSxFQUNwRixZQUFZLEVBQUUsZUFBZSxhQUFhLFdBQVcsUUFBUSxPQUFPLGVBQWUsY0FBYyxPQUFPO0FBQzFHO0FBWU8sSUFBTSxVQUFvQztBQUFBLEVBQy9DLEtBQUssQ0FBQyxtQ0FBbUMsNEJBQTRCLHFDQUFxQztBQUFBLEVBQzFHLFlBQVksQ0FBQyx1QkFBdUI7QUFBQSxFQUNwQyxjQUFjLENBQUMseUJBQXlCO0FBQUEsRUFDeEMsaUJBQWlCLENBQUMscUJBQXFCLG9CQUFvQjtBQUFBLEVBQzNELGtCQUFrQixDQUFDLGdDQUFnQyxpQ0FBaUM7QUFBQSxFQUNwRixVQUFVLENBQUMscUJBQXFCO0FBQUEsRUFDaEMsV0FBVyxDQUFDLHNCQUFzQjtBQUFBLEVBQ2xDLFlBQVksQ0FBQyx5QkFBeUIsd0JBQXdCLGlCQUFpQjtBQUFBLEVBQy9FLFNBQVMsQ0FBQyxvQ0FBb0Msa0NBQWtDO0FBQUEsRUFDaEYsVUFBVSxDQUFDLGFBQWEsMEJBQTBCO0FBQUEsRUFDbEQsV0FBVyxDQUFDLDJCQUEyQjtBQUFBLEVBQ3ZDLHFCQUFxQixDQUFDLHVCQUF1QjtBQUFBLEVBQzdDLGFBQWEsQ0FBQyw2QkFBNkIseUJBQXlCO0FBQUEsRUFDcEUsU0FBUyxDQUFDLHNCQUFzQixrQkFBa0IsaUJBQWlCO0FBQUEsRUFDbkUsY0FBYyxDQUFDLGVBQWU7QUFBQSxFQUM5QixlQUFlLENBQUMsa0JBQWtCLDRCQUE0QixnQkFBZ0I7QUFBQSxFQUM5RSxVQUFVLENBQUMsb0JBQW9CLHNCQUFzQixrQ0FBa0MsK0JBQStCLFdBQVc7QUFBQSxFQUNqSSxPQUFPLENBQUMsb0NBQW9DLHdCQUF3QiwyQkFBMkI7QUFBQSxFQUMvRixhQUFhLENBQUMsMkJBQTJCO0FBQUEsRUFDekMsYUFBYSxDQUFDLG9DQUFvQyxvQ0FBb0MsMkJBQTJCO0FBQUEsRUFDakgscUJBQXFCLENBQUMsaUNBQWlDLHVCQUF1QjtBQUFBLEVBQzlFLFVBQVUsQ0FBQyxtQkFBbUIsc0JBQXNCLG1CQUFtQjtBQUFBLEVBQ3ZFLGFBQWEsQ0FBQywwQkFBMEIsdUJBQXVCLHVCQUF1QjtBQUFBLEVBQ3RGLFVBQVUsQ0FBQyxtQkFBbUI7QUFBQSxFQUM5QixhQUFhLENBQUMsZUFBZSx1QkFBdUIsZUFBZTtBQUFBLEVBQ25FLG1CQUFtQixDQUFDLCtCQUErQjtBQUFBLEVBQ25ELGFBQWEsQ0FBQyx5QkFBeUI7QUFBQSxFQUN2QyxnQkFBZ0IsQ0FBQywyQ0FBMkMsbUNBQW1DLDBCQUEwQjtBQUFBLEVBQ3pILGNBQWMsQ0FBQyx5QkFBeUIsbUNBQW1DO0FBQUEsRUFDM0UsV0FBVyxDQUFDLG9DQUFvQywyQkFBMkIsc0JBQXNCO0FBQUEsRUFDakcsaUJBQWlCLENBQUMsK0JBQStCLGtDQUFrQztBQUFBLEVBQ25GLGlCQUFpQixDQUFDLGlDQUFpQztBQUFBLEVBQ25ELFNBQVMsQ0FBQywrQkFBK0I7QUFBQSxFQUN6QyxhQUFhLENBQUMsaUJBQWlCLHlCQUF5QjtBQUMxRDtBQUdBLElBQU0sV0FBVyxvQkFBSSxJQUFzQjtBQUMzQyxJQUFNLFdBQVcsQ0FBQyxPQUFlLFFBQWdCO0FBQy9DLFFBQU0sSUFBSSxNQUFNLFlBQVksR0FBRyxJQUFJLFNBQVMsSUFBSSxDQUFDLEtBQUssQ0FBQztBQUN2RCxNQUFJLENBQUMsRUFBRSxTQUFTLEdBQUcsRUFBRyxHQUFFLEtBQUssR0FBRztBQUNoQyxXQUFTLElBQUksR0FBRyxDQUFDO0FBQ25CO0FBQ0EsV0FBVyxDQUFDLEtBQUssR0FBRyxLQUFLLE9BQU8sUUFBUSxLQUFLLEVBQUcsWUFBVyxLQUFLLElBQUksS0FBTSxVQUFTLEdBQUcsR0FBRztBQUN6RixXQUFXLENBQUMsS0FBSyxJQUFJLEtBQUssT0FBTyxRQUFRLE9BQU8sRUFBRyxZQUFXLEtBQUssS0FBTSxVQUFTLEdBQUcsR0FBRztBQUN4RixJQUFNLFlBQVksb0JBQUksUUFBcUQ7QUFNcEUsU0FBUyxVQUFVLE9BQWUsWUFBb0IsTUFBOEIsQ0FBQyxHQUFrQjtBQUM1RyxNQUFJLE1BQU0sVUFBVSxJQUFJLEdBQUc7QUFDM0IsTUFBSSxDQUFDLEtBQUs7QUFBRSxVQUFNLElBQUksSUFBSSxPQUFPLFFBQVEsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQztBQUFHLGNBQVUsSUFBSSxLQUFLLEdBQUc7QUFBQSxFQUFHO0FBRTNHLFFBQU0sU0FBUyxJQUFJLElBQUksVUFBVTtBQUNqQyxNQUFJLE9BQVEsUUFBTztBQUNuQixNQUFJLFdBQVcsV0FBVyxPQUFPLEtBQUssTUFBTSxXQUFXLE1BQU0sQ0FBQyxDQUFDLEVBQUcsUUFBTyxXQUFXLE1BQU0sQ0FBQztBQUUzRixhQUFXLEtBQUssU0FBUyxJQUFJLE1BQU0sS0FBSyxFQUFFLFlBQVksQ0FBQyxLQUFLLENBQUMsRUFBRyxLQUFJLENBQUMsSUFBSSxDQUFDLEVBQUcsUUFBTztBQUNwRixTQUFPO0FBQ1Q7OztBQzNOTyxJQUFNLFlBQVk7QUFFbEIsSUFBTSxTQUFTLENBQUMsSUFBWSxTQUFnQixTQUFTLE9BQU8sS0FBSyxLQUFLO0FBQ3RFLElBQU0sT0FBTyxDQUFDLEdBQVcsU0FBZ0IsU0FBUyxPQUFPLElBQUksSUFBSTtBQUdqRSxJQUFNLFVBQVUsQ0FBQyxHQUFXQyxVQUFpQixLQUFLLE1BQU0sSUFBSUEsUUFBTyxJQUFJLElBQUlBO0FBRzNFLFNBQVMsU0FBUyxNQUFnQixNQUFZLFFBQVEsT0FBZTtBQUMxRSxNQUFJLFNBQVMsV0FBWSxRQUFPLFNBQVMsT0FBTyxJQUFJO0FBQ3BELE1BQUksU0FBUyxVQUFXLFFBQU8sU0FBUyxPQUFPLE1BQU07QUFDckQsU0FBTyxTQUFTLE9BQVEsUUFBUSxNQUFNLElBQUssUUFBUSxPQUFPO0FBQzVEO0FBS08sU0FBUyxJQUFJLEdBQVcsU0FBUyxHQUFXO0FBQ2pELFFBQU0sSUFBSSxLQUFLLE1BQU0sSUFBSSxNQUFNLE1BQU0sSUFBSSxNQUFNO0FBQy9DLFNBQU8sT0FBTyxVQUFVLENBQUMsSUFBSSxPQUFPLENBQUMsSUFBSSxFQUFFLFFBQVEsTUFBTSxFQUFFLFFBQVEsT0FBTyxFQUFFO0FBQzlFOzs7QUNIQSxJQUFNLFNBQVMsQ0FBQyxHQUFXLE1BQWMsS0FBSyxLQUFLLElBQUksSUFBSSxJQUFJLElBQUk7QUEwVm5FLElBQU0sTUFBTSxDQUFDLEdBQVksU0FBZ0IsU0FBUyxPQUFPLEVBQUUsS0FBSyxFQUFFO0FBRTNELFNBQVMsY0FBYyxLQUFpQkMsTUFBb0JDLE9BQXVCO0FBQ3hGLFFBQU0sSUFBSUQsS0FBSSxhQUFhQyxNQUFLLEVBQUU7QUFDbEMsTUFBSSxLQUFLLEtBQU0sUUFBTztBQUN0QixRQUFNLElBQUlBLE1BQUs7QUFDZixTQUFPLEVBQUUsU0FBUyxZQUFZLEVBQUUsU0FBUyxXQUFXLElBQUksRUFBRSxXQUFXRCxLQUFJLElBQUksSUFBSTtBQUNuRjtBQUVBLFNBQVMsS0FBSyxLQUFpQkEsTUFBb0IsTUFBYztBQUMvRCxTQUFPLFNBQVMsTUFBTSxJQUFJLEdBQUcsUUFBUSxXQUFXQSxLQUFJLE1BQU0sSUFBSSxXQUFXO0FBQzNFO0FBRU8sU0FBUyxZQUFZLElBQW1CO0FBQzdDLFNBQU8sR0FBRyxHQUFHLElBQUksT0FBSSxHQUFHLElBQUksR0FBRyxHQUFHLFFBQVEsTUFBTSxFQUFFO0FBQ3BEO0FBR08sSUFBTSxrQkFBa0IsQ0FBQyxNQUFlLEVBQUUsWUFBWSxTQUFTO0FBRy9ELFNBQVMsVUFBVSxLQUFpQixXQUEyQjtBQUNwRSxNQUFJLENBQUMsSUFBSSxNQUFPLFFBQU87QUFDdkIsU0FBTyxJQUFJLE1BQU0sU0FBUyxLQUFLLElBQUksV0FBVyxJQUFJLE1BQU0sUUFBUSxDQUFDLElBQUksWUFBWSxJQUFJLE1BQU07QUFDN0Y7QUFFTyxJQUFNLGNBQWMsQ0FBQyxLQUFhLFNBQWlCLENBQUMsSUFBSSxTQUFTLElBQUksTUFBTSxTQUFTLElBQUk7QUFHeEYsU0FBUyxTQUFTLEtBQTRCO0FBQ25ELFFBQU0sT0FBTyxvQkFBSSxJQUFZO0FBQzdCLFNBQU8sSUFBSSxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxJQUFJLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQyxLQUFLLElBQUksRUFBRSxFQUFFLENBQUM7QUFDM0Y7QUFHTyxTQUFTLGVBQWUsS0FBaUIsTUFBYyxXQUE0RDtBQUN4SCxNQUFJLElBQUksTUFBTSxJQUFJO0FBQ2xCLFdBQVMsUUFBUSxHQUFHLFFBQVEsSUFBSSxLQUFLLFdBQVcsSUFBSSxPQUFPLFNBQVMsS0FBSyxJQUFJLFNBQVM7QUFDcEYsUUFBSSxLQUFLLElBQUksS0FBSyxRQUFRO0FBQUUsVUFBSTtBQUFHO0FBQUEsSUFBSztBQUN4QyxRQUFJLFlBQVksSUFBSSxLQUFLLENBQUMsR0FBRyxVQUFVLEtBQUssQ0FBQyxDQUFDLEVBQUcsUUFBTyxFQUFFLFVBQVUsR0FBRyxXQUFXLEVBQUU7QUFDcEY7QUFBQSxFQUNGO0FBQ0EsU0FBTyxFQUFFLFVBQVUsR0FBRyxVQUFVO0FBQ2xDO0FBSU8sU0FBUyxhQUFhLEtBQWlCQSxNQUFrQztBQUM5RSxRQUFNLFFBQW1DLENBQUM7QUFDMUMsYUFBVyxLQUFLLFNBQVMsR0FBRyxHQUFHO0FBQzdCLFFBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFHO0FBQ3pCLFVBQU0sSUFBSUEsS0FBSSxhQUFhLEVBQUUsRUFBRSxLQUFLO0FBQ3BDLFVBQU0sRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEdBQUcsT0FBT0EsS0FBSSxjQUFjLEVBQUUsRUFBRSxLQUFLLEdBQUcsY0FBYyxHQUFHLFFBQVEsT0FBTyxPQUFPLEVBQUU7QUFBQSxFQUMzRztBQUNBLFFBQU0sUUFBUSxlQUFlLEtBQUssR0FBRyxDQUFDO0FBQ3RDLFNBQU8sRUFBRSxVQUFVLE1BQU0sVUFBVSxXQUFXLE1BQU0sV0FBVyxPQUFPLEtBQUssRUFBRSxHQUFHQSxLQUFJLGNBQWMsR0FBRyxLQUFLLENBQUMsRUFBRTtBQUMvRztBQUVBLFNBQVMsWUFBWSxHQUFTO0FBQzVCLFNBQU8sTUFBTSxRQUFRLE1BQU0sU0FBUyxNQUFNLE1BQU0sUUFBUSxNQUFNLFNBQVMsTUFBTTtBQUMvRTtBQUVBLFNBQVMsVUFBVUUsT0FBNEI7QUFFN0MsTUFBSSxDQUFDQSxNQUFLLE9BQVEsUUFBTztBQUN6QixRQUFNLE9BQU9BLE1BQUssTUFBTSxDQUFDLE1BQU0sRUFBRSxTQUFTQSxNQUFLLENBQUMsRUFBRSxRQUFRLEVBQUUsWUFBWUEsTUFBSyxDQUFDLEVBQUUsV0FBVyxFQUFFLFdBQVdBLE1BQUssQ0FBQyxFQUFFLFVBQVUsRUFBRSxRQUFRQSxNQUFLLENBQUMsRUFBRSxHQUFHO0FBQy9JLFFBQU0sSUFBSSxDQUFDLE1BQWtCLEdBQUcsRUFBRSxJQUFJLEdBQUcsRUFBRSxVQUFVLFdBQU0sRUFBRSxVQUFVLEVBQUU7QUFDekUsUUFBTSxTQUFTQSxNQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsS0FBSztBQUN6QyxNQUFJLEtBQU0sUUFBTyxHQUFHQSxNQUFLLE1BQU0sT0FBSSxFQUFFQSxNQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsT0FBTyxTQUFTLE1BQU0sRUFBRSxHQUFHQSxNQUFLLENBQUMsRUFBRSxNQUFNLEtBQUtBLE1BQUssQ0FBQyxFQUFFLEdBQUcsS0FBSyxFQUFFO0FBQ2hILFNBQU8sR0FBR0EsTUFBSyxNQUFNLFFBQVEsT0FBTyxTQUFTLFdBQVEsT0FBTyxJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsSUFBSSxHQUFHLEVBQUUsS0FBSyxHQUFHLElBQUksRUFBRTtBQUNyRztBQUVPLFNBQVMsUUFBUSxLQUFpQkYsTUFBb0IsT0FBcUIsV0FBVyxNQUFNLFVBQTBCO0FBQzNILFFBQU0sTUFBTSxJQUFJLEtBQUssUUFBUTtBQUM3QixRQUFNLE9BQU8sVUFBVSxLQUFLLE1BQU0sU0FBUztBQUMzQyxRQUFNLFlBQVksSUFBSSxNQUFNLElBQUksQ0FBQ0MsVUFBMEI7QUFDekQsVUFBTSxPQUFPQSxNQUFLLGVBQWUsWUFBWUEsTUFBSyxJQUFJO0FBQ3RELFVBQU0sT0FBTyxFQUFFLFFBQVFBLE1BQUssSUFBSSxNQUFNQSxNQUFLLE1BQU0sTUFBTUEsTUFBSyxNQUFNLGFBQWEsS0FBSztBQUNwRixVQUFNLElBQUlBLE1BQUs7QUFDZixVQUFNLElBQUksTUFBTSxNQUFNQSxNQUFLLEVBQUU7QUFDN0IsVUFBTSxJQUFJLGNBQWMsS0FBS0QsTUFBS0MsS0FBSTtBQUV0QyxRQUFJLEVBQUUsU0FBUyxVQUFVO0FBQ3ZCLFlBQU0sS0FBSyxFQUFFLE9BQU8sRUFBRSxLQUFLO0FBQzNCLFVBQUksRUFBRSxVQUFVLEVBQUUsWUFBWSxTQUFTLFVBQVU7QUFDL0MsY0FBTSxFQUFFLFFBQVEsSUFBSSxJQUFJLEVBQUU7QUFDMUIsZUFBTztBQUFBLFVBQ0wsR0FBRztBQUFBLFVBQU0sUUFBUSxHQUFHLE1BQU07QUFBQSxVQUFXLE1BQU0sQ0FBQyxFQUFFLFFBQVEsR0FBRyxNQUFNLFFBQVEsT0FBTyxNQUFNLENBQUM7QUFBQSxVQUNyRixNQUFNLG9DQUFvQyxNQUFNLFNBQVNBLE1BQUssSUFBSSxhQUFhLEtBQUssTUFBTSxNQUFNLEdBQUcsQ0FBQztBQUFBLFFBQ3RHO0FBQUEsTUFDRjtBQUNBLFlBQU1DLFFBQU8sTUFBTSxLQUFLLEVBQUUsUUFBUSxHQUFHLEtBQUssR0FBRyxDQUFDLEdBQUcsT0FBTyxFQUFFLFFBQVEsRUFBRSxRQUFRLE1BQU0sR0FBRyxNQUFNLE9BQU8sR0FBRyxTQUFTLE1BQU0sR0FBRyxPQUFPLEVBQUUsRUFBRTtBQUNsSSxZQUFNLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxTQUFTO0FBQzNDLFlBQU0sUUFBUSxFQUFFLFNBQVM7QUFDekIsWUFBTSxVQUFVLEVBQUUscUJBQXFCO0FBQ3ZDLFVBQUlDLFlBQW1CO0FBQ3ZCLFVBQUksRUFBRSxPQUFPO0FBQ1gsY0FBTSxLQUFLLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUMvQixjQUFNLEtBQUssUUFBUSxFQUFFLFVBQVUsSUFBSSxFQUFFLE1BQU0sVUFBVSxLQUFLLEtBQUtILE1BQUtDLE1BQUssSUFBSSxDQUFDO0FBQzlFLFFBQUFFLGFBQVksS0FBSyxPQUFPLEdBQUcsT0FBTyxHQUFHLElBQUksZ0JBQVcsWUFBWSxFQUFFLENBQUMsTUFBTSxJQUFJLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxTQUFTLEtBQUssRUFBRSxNQUFNLFVBQVUsSUFBSSxPQUFPLEdBQUcsT0FBTyxHQUFHLElBQUksZ0JBQVcsWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxLQUFLLDJCQUFzQixZQUFZLEVBQUUsQ0FBQztBQUNuUCxpQkFBUyxzQkFBaUIsWUFBWSxFQUFFLENBQUMsTUFBTSxJQUFJLEVBQUUsTUFBTSxDQUFDO0FBQUEsTUFDOUQsV0FBVyxFQUFFLFFBQVEsU0FBUyxnQkFBZ0I7QUFDNUMsUUFBQUEsYUFBWSxHQUFHLEdBQUcsT0FBTyxJQUFJLEdBQUcsTUFBTSxHQUFHLE9BQU8sQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLEVBQUUsS0FBSyxHQUFHLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxRQUFRLElBQUksWUFBTyxJQUFJLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFDM0gsaUJBQVMsd0JBQW1CLElBQUksRUFBRSxNQUFNLENBQUM7QUFBQSxNQUMzQyxPQUFPO0FBQ0wsUUFBQUEsYUFBWSxHQUFHLEdBQUcsT0FBTyxHQUFHLElBQUksZ0JBQVcsSUFBSSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQzVELFlBQUksRUFBRSxXQUFZLENBQUFBLGNBQWEsS0FBSyxFQUFFLFdBQVcsSUFBSSxvQkFBZSxJQUFJLEVBQUUsU0FBUyxJQUFJLEVBQUUsV0FBVyxVQUFVLENBQUM7QUFDL0csWUFBSSxRQUFRLElBQUksUUFBUyxVQUFTLHFCQUFnQixJQUFJLEVBQUUsTUFBTSxDQUFDLEtBQUssUUFBUSxDQUFDLElBQUksT0FBTztBQUFBLGlCQUMvRSxDQUFDLEtBQU0sVUFBUyxlQUFVLFlBQVksRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksRUFBRSxNQUFNLENBQUM7QUFBQSxpQkFDL0UsRUFBRSxZQUFZLFNBQVMsU0FBVSxVQUFTLHNCQUFpQixFQUFFLFlBQVksTUFBTTtBQUFBLGlCQUMvRSxFQUFFLFlBQVksU0FBUyxRQUFTLFVBQVMscUJBQWdCLFlBQVksRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxFQUFFLGVBQWUsRUFBRSxZQUFZLGlCQUFpQixDQUFDLENBQUM7QUFBQSxpQkFDN0ksRUFBRSxZQUFZLFNBQVMsU0FBVSxVQUFTLHlCQUFvQixJQUFJLFFBQVEsRUFBRSxVQUFVLElBQUksRUFBRSxZQUFZLE1BQU0sS0FBSyxLQUFLSCxNQUFLQyxNQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7QUFBQSxpQkFDekksRUFBRSxZQUFZLFNBQVMsV0FBWSxVQUFTLHVCQUFrQixJQUFJLEVBQUUsU0FBUyxJQUFJLEVBQUUsWUFBWSxRQUFRRCxLQUFJLElBQUksQ0FBQyxDQUFDO0FBQUEsWUFDckgsVUFBUztBQUFBLE1BQ2hCO0FBQ0EsYUFBTyxFQUFFLEdBQUcsTUFBTSxRQUFRLFlBQVksRUFBRSxHQUFHLE1BQUFFLE9BQU0sV0FBQUMsWUFBVyxRQUFRLE1BQU1GLE1BQUssS0FBSztBQUFBLElBQ3RGO0FBRUEsUUFBSSxFQUFFLFNBQVMsVUFBVTtBQUN2QixZQUFNLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRTtBQUNuQixZQUFNQyxRQUFPLE1BQU0sS0FBSyxFQUFFLFFBQVEsRUFBRSxLQUFLLEdBQUcsQ0FBQyxHQUFHLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxNQUFNLElBQUksU0FBUyxJQUFJLE9BQU8sQ0FBQyxDQUFDLEVBQUUsYUFBYSxNQUFNLEVBQUUsT0FBTyxFQUFFLEVBQUU7QUFDN0ksYUFBTyxFQUFFLEdBQUcsTUFBTSxRQUFRLEdBQUcsRUFBRSxJQUFJLE9BQUksRUFBRSxTQUFJLEVBQUUsR0FBRyxFQUFFLFlBQVksTUFBTSxFQUFFLElBQUksTUFBQUEsT0FBTSxXQUFXLFlBQVksRUFBRSxZQUFPLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQyxJQUFJLFFBQVEsNEJBQXVCLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxNQUFNRCxNQUFLLEtBQUs7QUFBQSxJQUN6TTtBQUVBLFFBQUksRUFBRSxTQUFTLFNBQVM7QUFDdEIsWUFBTUMsUUFBTyxNQUFNLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxHQUFHLENBQUMsR0FBRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFFBQVEsTUFBTSxFQUFFLE1BQU0sU0FBUyxFQUFFLFNBQVMsT0FBTyxDQUFDLENBQUMsRUFBRSxhQUFhLE1BQU0sRUFBRSxPQUFPLEVBQUUsRUFBRTtBQUN4SixhQUFPLEVBQUUsR0FBRyxNQUFNLFFBQVEsVUFBVUEsS0FBSSxHQUFHLE1BQUFBLE9BQU0sTUFBTSxDQUFDLEVBQUUsTUFBTUQsTUFBSyxJQUFJLEVBQUUsT0FBTyxPQUFPLEVBQUUsS0FBSyxRQUFLLEtBQUssT0FBVTtBQUFBLElBQ3RIO0FBRUEsVUFBTSxLQUFLLE1BQU0sSUFBSSxFQUFFLE1BQU0sS0FBSztBQUNsQyxVQUFNLFFBQVEsRUFBRSxNQUFNLE9BQU8sRUFBRSxNQUFNLE1BQU0sS0FBSyxDQUFDO0FBQ2pELFVBQU1DLFFBQXFCLE1BQU0sSUFBSSxDQUFDLFFBQVE7QUFBQSxNQUM1QyxRQUFRLEdBQUcsT0FBTyxRQUFRLENBQUMsR0FBRyxTQUFTLElBQUksVUFBVSxTQUFTLFNBQVMsS0FBSyxHQUFHLE9BQU8sR0FBRyxNQUFNLElBQUksR0FBRyxLQUFLRixLQUFJLElBQUksSUFBSSxJQUFJLEtBQUssS0FBS0EsTUFBS0MsTUFBSyxJQUFJLENBQUMsSUFBSTtBQUFBLE1BQ3hKLE1BQU0sR0FBRztBQUFBLE1BQU0sU0FBUyxHQUFHO0FBQUEsTUFBUyxPQUFPLENBQUMsQ0FBQyxHQUFHO0FBQUEsTUFBTyxLQUFLLEdBQUc7QUFBQSxNQUFLLEtBQUssR0FBRztBQUFBLE1BQUssT0FBTyxHQUFHO0FBQUEsSUFDN0YsRUFBRTtBQUNGLFFBQUk7QUFDSixVQUFNLE1BQU0sSUFBSSxjQUFjLEVBQUUsTUFBTSxJQUFJLElBQUksSUFBSSxZQUFZLEVBQUUsTUFBTSxHQUFHRCxLQUFJLElBQUksSUFBSUEsS0FBSSxTQUFTLE9BQU8sSUFBSTtBQUM3RyxRQUFJLEVBQUUsUUFBUSxTQUFTLGNBQWM7QUFDbkMsa0JBQVksRUFBRSxPQUFPLE1BQU0sT0FBTyxDQUFDLE1BQU0sRUFBRSxhQUFhLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxHQUFHLEVBQUUsT0FBTyxnQkFBVyxJQUFJLEVBQUUsYUFBYSxHQUFHLENBQUMsRUFBRSxFQUFFLEtBQUssUUFBSztBQUFBLElBQ3BJLFdBQVcsRUFBRSxRQUFRLFNBQVMsaUJBQWlCO0FBQzdDLFlBQU0sSUFBSSxNQUFNLEVBQUUsT0FBTyxRQUFRO0FBQ2pDLFVBQUksRUFBRyxhQUFZLFVBQVUsRUFBRSxVQUFVLEVBQUUsSUFBSSxnQkFBZ0IsRUFBRSxJQUFJO0FBQUEsSUFDdkUsV0FBVyxFQUFFLFFBQVEsU0FBUyxhQUFhO0FBQ3pDLGtCQUFZLEVBQUUsT0FBTyxNQUFNLE9BQU8sQ0FBQyxPQUFPLEVBQUUsY0FBYyxLQUFLLE1BQU0sRUFBRSxPQUFPLEtBQUssQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxPQUFPLG1CQUFjLEVBQUUsT0FBTyxPQUFPLElBQUksRUFBRSxNQUFNLEdBQUcsSUFBSSxNQUFNLEtBQUssRUFBRSxjQUFjLEtBQUssR0FBRyxDQUFDLEVBQUUsRUFBRSxLQUFLLFFBQUs7QUFBQSxJQUNsTixXQUFXLEVBQUUsUUFBUSxTQUFTLFdBQVc7QUFDdkMsa0JBQVkscUJBQWdCLElBQUksWUFBWSxJQUFJLFVBQUssSUFBSSxFQUFFLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFBQSxJQUM5RSxXQUFXLEVBQUUsUUFBUSxTQUFTLFFBQVE7QUFDcEMsa0JBQVksWUFBWSxLQUFLLE1BQU0sRUFBRSxPQUFPLE1BQU0sR0FBRyxDQUFDLHNCQUFzQixFQUFFLE9BQU8sV0FBVyxDQUFDO0FBQUEsSUFDbkc7QUFDQSxVQUFNLFVBQVUsTUFBTSxLQUFLLENBQUMsTUFBTSxFQUFFLE9BQU8sUUFBUSxDQUFDLEVBQUUsS0FBSztBQUMzRCxXQUFPO0FBQUEsTUFDTCxHQUFHO0FBQUEsTUFBTSxRQUFRLFVBQVVFLEtBQUk7QUFBQSxNQUFHLE1BQUFBO0FBQUEsTUFBTTtBQUFBLE1BQ3hDLE1BQU0sQ0FBQyxVQUFXLEVBQUUsV0FBV0QsTUFBSyxPQUFPLFFBQVEsTUFBTSxFQUFFLE1BQU0sR0FBRyxTQUFTLEVBQUUsTUFBTSxJQUFJLElBQUksWUFBWSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsS0FBSyxHQUFHLElBQUksWUFBWSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsS0FBTSxJQUFJQSxNQUFLLElBQUksRUFBRSxPQUFPLE9BQU8sRUFBRSxLQUFLLFFBQUssS0FBSztBQUFBLElBQ3JOO0FBQUEsRUFDRixDQUFDO0FBRUQsU0FBTyxFQUFFLFVBQVUsT0FBTyxJQUFJLElBQUksU0FBUyxJQUFJLE1BQU0sTUFBTSxVQUFVLElBQUksT0FBTyxZQUFZLElBQUksR0FBRyxXQUFXLFVBQVUsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLE1BQU0sRUFBRTtBQUN2SjtBQVVBLFNBQVMsYUFBYSxHQUFnQixNQUFjRCxNQUFtQztBQUVyRixTQUFPLEVBQUUsVUFDTixPQUFPLENBQUMsTUFBTSxVQUFVLEVBQUUsT0FBTyxFQUFFLHNCQUFzQkEsS0FBSSxPQUFPLE1BQU0sSUFBSSxFQUM5RTtBQUFBLElBQUksQ0FBQyxNQUNKLEVBQUUsS0FDQyxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsYUFBYSxFQUFFLFFBQVEsS0FBSyxDQUFDLEVBQ3RELElBQUksQ0FBQyxPQUFPLEVBQUUsUUFBUSxPQUFPLEVBQUUsYUFBYSxHQUFHQSxLQUFJLElBQUksR0FBRyxNQUFNLEVBQUUsUUFBUSxHQUFHLEdBQUksRUFBRSxPQUFPLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxJQUFJLENBQUMsRUFBRyxFQUFFO0FBQUEsRUFDN0g7QUFDSjtBQUVBLElBQU0sT0FBTyxDQUFDLEdBQVcsTUFBZSxLQUFLLElBQUksSUFBSSxLQUFLLElBQUksSUFBSTtBQUdsRSxTQUFTLFdBQVdFLE9BQTJCO0FBQzdDLFFBQU0sSUFBSSxvQkFBSSxJQUFvQjtBQUNsQyxhQUFXLEtBQUtBLE9BQU07QUFBRSxVQUFNLElBQUksS0FBSyxNQUFNLEVBQUUsU0FBUyxDQUFDLElBQUk7QUFBRyxNQUFFLElBQUksSUFBSSxFQUFFLElBQUksQ0FBQyxLQUFLLEtBQUssQ0FBQztBQUFBLEVBQUc7QUFDL0YsTUFBSSxPQUFPLEdBQUcsSUFBSTtBQUNsQixhQUFXLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRyxLQUFJLElBQUksS0FBTSxNQUFNLEtBQUssS0FBSyxNQUFPO0FBQUUsV0FBTztBQUFJLFFBQUk7QUFBQSxFQUFHO0FBQ2xGLFNBQU87QUFDVDtBQUdBLFNBQVMsWUFBWUEsT0FBZ0M7QUFDbkQsTUFBSSxDQUFDQSxNQUFLLE9BQVEsUUFBTyxDQUFDO0FBQzFCLFFBQU0sU0FBU0EsTUFBSyxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQztBQUM5QyxRQUFNLElBQUksV0FBVyxPQUFPLFNBQVMsU0FBU0EsS0FBSTtBQUNsRCxTQUFPQSxNQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUN0RDtBQUVBLElBQU0sYUFBYSxDQUFDLE9BQXFCLEdBQUcsU0FBUyxDQUFDLEdBQUcsRUFBRSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLEVBQUUsS0FBSyxNQUFNLEdBQUcsU0FBUyxDQUFDLENBQUMsSUFBSTtBQU9uSSxTQUFTLFdBQVcsUUFBaUIsTUFBbUJFLFVBQW1FO0FBR3pILFFBQU0sV0FBVyxDQUFDLElBQVcsT0FBb0I7QUFDL0MsVUFBTSxZQUFZLEdBQUcsUUFBUSxJQUFJLElBQUk7QUFDckMsUUFBSSxDQUFDLEdBQUcsTUFBTyxRQUFPLEtBQUssSUFBSSxXQUFXLEVBQUUsSUFBSSxHQUFHLElBQUksS0FBSztBQUM1RCxVQUFNLE9BQU8sR0FBRyxHQUFHLFNBQVMsQ0FBQztBQUU3QixVQUFNLFNBQVMsQ0FBQyxDQUFDLFFBQVEsS0FBSyxRQUFRLEtBQUssSUFBSSxHQUFHLEdBQUcsT0FBTyxJQUFJLFNBQVM7QUFDekUsVUFBTSxPQUFPLEdBQUcsTUFBTSxHQUFHLEVBQUU7QUFDM0IsV0FBTyxLQUFLLFNBQVMsVUFBVSxLQUFLLElBQUksV0FBVyxJQUFJLElBQUksR0FBRyxJQUFJLEtBQUssWUFBWTtBQUFBLEVBQ3JGO0FBRUEsUUFBTSxRQUFRLENBQUMsT0FBYztBQUMzQixRQUFJLEtBQUssSUFBSSxLQUFLLFNBQVMsR0FBRyxJQUFJLE1BQU0sR0FBRyxRQUFRLElBQUksSUFBSSxHQUFJLFFBQU8sU0FBUyxJQUFJLElBQUk7QUFDdkYsV0FBTyxLQUFLLFNBQVMsR0FBRyxRQUFRLFNBQVMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxHQUFHLElBQUksQ0FBQztBQUFBLEVBQ25FO0FBQ0EsTUFBSSxNQUFNLE9BQU9BLFFBQU8sQ0FBQyxFQUFHLFFBQU8sRUFBRSxHQUFHQSxVQUFTLEtBQUssUUFBUTtBQUM5RCxRQUFNLElBQUksT0FBTyxVQUFVLEtBQUs7QUFDaEMsTUFBSSxLQUFLLEVBQUcsUUFBTyxFQUFFLEdBQUcsR0FBRyxLQUFLLFFBQVE7QUFDeEMsUUFBTSxNQUFNLE9BQU9BLFFBQU87QUFDMUIsTUFBSSxLQUFLLFVBQVUsS0FBSyxLQUFLLFNBQVMsSUFBSSxRQUFRLFNBQVMsS0FBSyxJQUFJLEVBQUcsUUFBTyxFQUFFLEdBQUdBLFVBQVMsS0FBSyxVQUFVO0FBRTNHLE1BQUksT0FBTyxXQUFXLEtBQUssS0FBSyxVQUFVLEtBQUssS0FBSyxVQUFVLElBQUksUUFBUSxXQUFXLElBQUksS0FBSyxJQUFJLFFBQVEsV0FBVyxJQUFJLEtBQUssSUFBSSxPQUFPLEVBQUcsUUFBTyxFQUFFLEdBQUdBLFVBQVMsS0FBSyxVQUFVO0FBQ2hMLFFBQU0sSUFBSSxPQUFPLFVBQVUsQ0FBQyxPQUFPLEtBQUssVUFBVSxLQUFLLEtBQUssU0FBUyxHQUFHLFFBQVEsU0FBUyxJQUFJLElBQUksQ0FBQztBQUNsRyxNQUFJLEtBQUssRUFBRyxRQUFPLEVBQUUsR0FBRyxHQUFHLEtBQUssVUFBVTtBQUMxQyxTQUFPLEVBQUUsR0FBR0EsVUFBUyxLQUFLLE9BQU87QUFDbkM7QUFHQSxTQUFTLFFBQVFILE9BQWUsT0FBcUJDLE9BQTJCO0FBQzlFLE1BQUksQ0FBQ0EsTUFBSyxPQUFRLFFBQU87QUFDekIsUUFBTSxJQUFJRCxNQUFLO0FBQ2YsTUFBSSxFQUFFLFNBQVMsU0FBVSxRQUFPO0FBQ2hDLE1BQUksTUFBTSxNQUFNQSxNQUFLLEVBQUUsR0FBRyxPQUFRLFFBQU87QUFDekMsUUFBTSxPQUFPLFlBQVlDLEtBQUk7QUFDN0IsUUFBTSxNQUFNLFdBQVcsRUFBRSxRQUFRLE1BQU0sTUFBTSxNQUFNRCxNQUFLLEVBQUUsR0FBRyxTQUFTLENBQUMsRUFBRTtBQUN6RSxTQUFPLFFBQVEsVUFBVSxJQUFJLFFBQVEsWUFBWSxPQUFPO0FBQzFEO0FBSUEsU0FBUyxXQUFXLEtBQWlCRCxNQUFvQkMsT0FBZSxHQUFjQyxPQUF5QjtBQUM3RyxRQUFNLElBQUlELE1BQUs7QUFDZixRQUFNLElBQUksY0FBYyxLQUFLRCxNQUFLQyxLQUFJO0FBRXRDLE1BQUksRUFBRSxVQUFVLEVBQUUsWUFBWSxTQUFTLFVBQVU7QUFDL0MsVUFBTSxFQUFFLFFBQVEsSUFBSSxJQUFJLEVBQUU7QUFDMUIsVUFBTSxPQUFPQyxNQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsUUFBUSxNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNO0FBQ3JFLFVBQU0sS0FBSyxLQUFLLFNBQVMsS0FBSyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUssSUFBSSxHQUFHLEdBQUdBLE1BQUssSUFBSSxDQUFDLE1BQU0sS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxLQUFLLElBQUksU0FBUztBQUNySCxVQUFNRyxLQUFJLFFBQVEsS0FBSyxLQUFLLEtBQUssS0FBS0wsTUFBS0MsTUFBSyxJQUFJLENBQUM7QUFDckQsV0FBTztBQUFBLE1BQ0wsTUFBTSxFQUFFLFFBQVFJLElBQUcsT0FBTyxHQUFHLGNBQWNBLElBQUcsUUFBUSxPQUFPLE9BQU8sRUFBRTtBQUFBLE1BQ3RFLEtBQUssRUFBRSxRQUFRSixNQUFLLElBQUksTUFBTUEsTUFBSyxNQUFNLE1BQU1BLE1BQUssTUFBTSxNQUFNQyxNQUFLLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxHQUFHLFFBQVEsR0FBRyxNQUFNLFdBQVcsUUFBUSxJQUFJLFNBQVMsWUFBWSxNQUFNLEdBQUcsTUFBTSxNQUFNLElBQUksRUFBRSxDQUFDLFdBQU0sWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJRyxFQUFDLENBQUMsR0FBRztBQUFBLElBQ2pPO0FBQUEsRUFDRjtBQUtBLFFBQU0sVUFBVSxZQUFZSCxLQUFJO0FBQ2hDLFFBQU0sU0FBUyxXQUFXLE9BQU87QUFDakMsUUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLEVBQUUsU0FBUyxJQUFJO0FBQ3ZDLFFBQU0sSUFBSSxLQUFLLElBQUksU0FBUyxFQUFFLE1BQU0sS0FBSyxNQUFNLEVBQUUsU0FBUztBQUMxRCxRQUFNLEVBQUUsR0FBRyxJQUFJLElBQUksV0FBVyxFQUFFLFFBQVEsU0FBUyxFQUFFLEtBQUs7QUFDeEQsUUFBTSxLQUFLLEVBQUUsT0FBTyxDQUFDO0FBQ3JCLFFBQU0sT0FBTyxRQUFRLFNBQVMsR0FBRyxRQUFRLEtBQUssSUFBSSxRQUFRLFNBQVMsR0FBRyxJQUFJLEtBQUssR0FBRyxRQUFRLElBQUksSUFBSSxLQUFLLFFBQVEsTUFBTSxDQUFDLEdBQUcsSUFBSSxJQUFJO0FBQ2pJLFFBQU0sTUFBaUIsRUFBRSxHQUFHLEdBQUcsUUFBUSxHQUFHLE9BQU8sR0FBRyxjQUFjLE1BQU0sSUFBSSxJQUFJLEVBQUUsY0FBYyxPQUFPLE1BQU0sRUFBRSxVQUFVLE1BQU0sRUFBRSxRQUFRLElBQUksRUFBRSxTQUFTLEVBQUU7QUFDMUosUUFBTSxZQUFZLEtBQUssU0FBUyxLQUFLLEtBQUssSUFBSSxLQUFLLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxFQUFFLE9BQU87QUFDaEYsUUFBTSxPQUFPLEVBQUUsUUFBUUQsTUFBSyxJQUFJLE1BQU1BLE1BQUssTUFBTSxNQUFNQSxNQUFLLE1BQU0sUUFBUSxZQUFZLEVBQUUsR0FBRyxRQUFRLEdBQUcsTUFBTSxLQUFLLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFO0FBQ3BJLFFBQU0sTUFBTSxNQUFNLEVBQUUsU0FBUyxhQUFhLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTTtBQUU3RCxNQUFJLEVBQUUsUUFBUSxTQUFTLGdCQUFnQjtBQUVyQyxVQUFNLE9BQU8sS0FBSyxNQUFNLEdBQUcsS0FBSyxJQUFJLEtBQUssUUFBUSxHQUFHLElBQUksSUFBSSxDQUFDO0FBQzdELFVBQU0sTUFBTSxhQUFhLE1BQU0sRUFBRSxRQUFRLFFBQVEsS0FBSyxVQUFVLEdBQUcsUUFBUSxLQUFLLE1BQU0sQ0FBQyxNQUFNLEVBQUUsUUFBUSxHQUFHLElBQUk7QUFDOUcsV0FBTyxLQUNILEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxRQUFRLElBQUksR0FBRyxPQUFPLEVBQUUsR0FBRyxLQUFLLEVBQUUsR0FBRyxNQUFNLFNBQVMsV0FBVyxXQUFXLE1BQU0sR0FBRyxTQUFTLGVBQWUsR0FBRyxXQUFNLElBQUksSUFBSSxDQUFDLENBQUMsR0FBRyxFQUFFLElBQ3JKLEVBQUUsTUFBTSxLQUFLLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxRQUFRLFdBQVcsTUFBTSxHQUFHLGFBQWEsQ0FBQyxzQkFBc0IsRUFBRSxRQUFRLElBQUksR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLEVBQ3JJO0FBRUEsTUFBSSxFQUFFLFNBQVMsUUFBUSxRQUFRO0FBQzdCLFVBQU1LLE9BQU0sS0FBSyxNQUFNLEdBQUcsR0FBRyxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxJQUFJLEtBQUssSUFBSSxFQUFFLE1BQU0sR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUNwRixVQUFNQyxRQUFPLEdBQUcsT0FBTyxHQUFHO0FBQzFCLFFBQUlELE9BQU1DLE1BQU0sUUFBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFFBQVEsV0FBVyxNQUFNLEdBQUdELElBQUcsSUFBSUMsS0FBSSxHQUFHLEdBQUcsa0JBQWEsWUFBWSxFQUFFLENBQUMsR0FBRyxFQUFFO0FBQzVKLFFBQUksSUFBSSxFQUFFLE9BQU8sU0FBUyxHQUFHO0FBQzNCLFlBQU0sS0FBSyxFQUFFLE9BQU8sSUFBSSxDQUFDO0FBQ3pCLGFBQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sSUFBSSxHQUFHLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxXQUFXLFdBQVcsTUFBTSxHQUFHRCxJQUFHLElBQUlDLEtBQUksR0FBRyxHQUFHLFdBQU0sWUFBWSxFQUFFLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLEVBQUU7QUFBQSxJQUNwSztBQUNBLFFBQUksS0FBSyxLQUFLLEVBQUUsTUFBTSxXQUFXLEVBQUcsUUFBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFdBQVcsV0FBVyxNQUFNLEdBQUdELElBQUcsSUFBSUMsS0FBSSxtQkFBYyxZQUFZLEVBQUUsQ0FBQyxHQUFHLEVBQUU7QUFDOUssVUFBTSxLQUFLLFFBQVEsS0FBSyxJQUFJLEVBQUUsTUFBTSxVQUFVLEtBQUssS0FBS1AsTUFBS0MsTUFBSyxJQUFJLENBQUM7QUFDdkUsV0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLElBQUksT0FBTyxHQUFHLGNBQWMsSUFBSSxRQUFRLE9BQU8sT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFdBQVcsV0FBVyxNQUFNLEdBQUdLLElBQUcsSUFBSUMsS0FBSSxHQUFHLEdBQUcsV0FBTSxZQUFZLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRTtBQUFBLEVBQy9NO0FBRUEsTUFBSSxRQUFRLFFBQVE7QUFFbEIsV0FBTyxFQUFFLE1BQU0sR0FBRyxLQUFLLEVBQUUsR0FBRyxNQUFNLFNBQVMsUUFBUSxXQUFXLE1BQU0sZUFBZSxLQUFLLE1BQU0sT0FBSSxXQUFXLElBQUksQ0FBQyxpQkFBaUIsRUFBRTtBQUFBLEVBQ3ZJO0FBRUEsUUFBTSxNQUFNLEtBQUssTUFBTSxHQUFHLEdBQUcsSUFBSSxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sSUFBSSxLQUFLLElBQUksRUFBRSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFDcEYsUUFBTSxPQUFPLEdBQUcsT0FBTyxHQUFHO0FBQzFCLE1BQUksT0FBTyxNQUFNO0FBQ2YsVUFBTSxJQUFJLEVBQUUsY0FBYyxHQUFHLFVBQVUsYUFBYSxNQUFNLEVBQUUsV0FBVyxPQUFPLEVBQUUsV0FBVyxhQUFhO0FBQ3hHLFdBQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLFFBQVEsSUFBSSxJQUFJLEdBQUcsT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFdBQVcsV0FBVyxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksR0FBRyxHQUFHLFdBQU0sSUFBSSxJQUFJLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxJQUFJLEtBQUssU0FBUyxrQkFBZSxDQUFDLE1BQU0sRUFBRSxHQUFHLEVBQUU7QUFBQSxFQUM3TTtBQUNBLFFBQU0sU0FBUyxJQUFJLFNBQVMsS0FBSztBQUNqQyxRQUFNLFVBQVUsRUFBRSxxQkFBcUI7QUFDdkMsTUFBSSxRQUFRLFNBQVM7QUFDbkIsV0FBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssTUFBTSxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxRQUFRLFdBQVcsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEdBQUcsR0FBRyxpQkFBWSxJQUFJLENBQUMsQ0FBQyxVQUFVLEtBQUssSUFBSSxPQUFPLElBQUksRUFBRTtBQUFBLEVBQzVKO0FBQ0EsTUFBSSxJQUFJLEVBQUUsT0FBTyxTQUFTLEdBQUc7QUFDM0IsVUFBTSxLQUFLLEVBQUUsT0FBTyxJQUFJLENBQUM7QUFDekIsV0FBTyxFQUFFLE1BQU0sRUFBRSxHQUFHLEtBQUssT0FBTyxJQUFJLEdBQUcsT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLGNBQWMsV0FBVyxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksR0FBRyxHQUFHLFdBQU0sWUFBWSxFQUFFLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxHQUFHLEVBQUU7QUFBQSxFQUN2SztBQUNBLFFBQU0sSUFBSSxFQUFFO0FBQ1osTUFBSSxFQUFFLFNBQVMsU0FBVSxRQUFPLEVBQUUsTUFBTSxFQUFFLEdBQUcsS0FBSyxRQUFRLE1BQU0sT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLGVBQWUsV0FBVyxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksa0JBQWEsRUFBRSxNQUFNLEtBQUssRUFBRTtBQUMvSyxNQUFJLEVBQUUsU0FBUyxTQUFTO0FBQ3RCLFVBQU0sS0FBSyxJQUFJLGVBQWUsRUFBRSxpQkFBaUI7QUFDakQsV0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLElBQUksT0FBTyxHQUFHLGNBQWMsSUFBSSxRQUFRLE9BQU8sT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFNBQVMsV0FBVyxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksaUJBQVksWUFBWSxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUU7QUFBQSxFQUM3TTtBQUNBLE1BQUksRUFBRSxTQUFTLFlBQVk7QUFDekIsVUFBTSxLQUFLLEtBQUssSUFBSSxHQUFHLElBQUksSUFBSSxFQUFFLFFBQVFQLEtBQUksSUFBSSxDQUFDO0FBQ2xELFdBQU8sRUFBRSxNQUFNLEVBQUUsUUFBUSxJQUFJLE9BQU8sR0FBRyxjQUFjLElBQUksUUFBUSxPQUFPLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxVQUFVLFdBQVcsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLG1CQUFjLElBQUksRUFBRSxDQUFDLEdBQUcsRUFBRTtBQUFBLEVBQ2xMO0FBQ0EsTUFBSSxFQUFFLFNBQVMsVUFBVTtBQUN2QixVQUFNLEtBQUssUUFBUSxLQUFLLElBQUksRUFBRSxNQUFNLEtBQUssS0FBS0EsTUFBS0MsTUFBSyxJQUFJLENBQUM7QUFDN0QsV0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLElBQUksT0FBTyxHQUFHLGNBQWMsSUFBSSxRQUFRLE9BQU8sT0FBTyxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFVBQVUsV0FBVyxNQUFNLEdBQUcsR0FBRyxJQUFJLElBQUksa0JBQWEsS0FBSyxNQUFNLEVBQUUsTUFBTSxHQUFHLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxHQUFHLEVBQUU7QUFBQSxFQUNoTjtBQUNBLFNBQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sRUFBRSxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxRQUFRLFdBQVcsTUFBTSxHQUFHLEdBQUcsSUFBSSxJQUFJLEdBQUcsRUFBRTtBQUM1RztBQUVBLFNBQVMsV0FBVyxLQUFpQkQsTUFBb0JDLE9BQWUsR0FBY0MsT0FBeUI7QUFDN0csUUFBTSxJQUFJRCxNQUFLO0FBQ2YsUUFBTSxJQUFJLGNBQWMsS0FBS0QsTUFBS0MsS0FBSTtBQUN0QyxRQUFNLE9BQU8sWUFBWUMsS0FBSTtBQUM3QixRQUFNLElBQUksV0FBVyxJQUFJO0FBQ3pCLFFBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxFQUFFO0FBQ25CLFFBQU0sT0FBTyxLQUFLLE1BQU0sR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUk7QUFDcEQsUUFBTSxPQUFPLEVBQUUsUUFBUUQsTUFBSyxJQUFJLE1BQU1BLE1BQUssTUFBTSxNQUFNQSxNQUFLLE1BQU0sUUFBUSxHQUFHLEVBQUUsSUFBSSxPQUFJLEVBQUUsU0FBSSxFQUFFLElBQUksUUFBUSxHQUFHLEtBQUs7QUFDbkgsUUFBTSxNQUFNLEtBQUssVUFBVSxFQUFFLFFBQVEsS0FBSyxNQUFNLENBQUMsTUFBTSxLQUFLLEVBQUU7QUFDOUQsTUFBSSxJQUFLLFFBQU8sRUFBRSxNQUFNLEVBQUUsR0FBRyxHQUFHLFFBQVEsSUFBSSxFQUFFLEdBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFdBQVcsTUFBTSxZQUFZLEVBQUUsWUFBTyxJQUFJLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRTtBQUMvSCxTQUFPLEVBQUUsTUFBTSxFQUFFLEdBQUcsR0FBRyxRQUFRLEVBQUUsR0FBRyxLQUFLLEVBQUUsR0FBRyxNQUFNLFNBQVMsUUFBUSxNQUFNLEdBQUcsS0FBSyxLQUFLLEdBQUcsQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLFVBQVUsRUFBRSxXQUFXLEVBQUUsSUFBSSxHQUFHLEVBQUU7QUFDN0k7QUFFQSxTQUFTLFVBQVVBLE9BQWUsR0FBY0MsT0FBeUI7QUFDdkUsUUFBTSxPQUFPLFlBQVlBLEtBQUk7QUFDN0IsUUFBTSxJQUFJLFdBQVcsSUFBSTtBQUN6QixTQUFPO0FBQUEsSUFDTCxNQUFNLEVBQUUsR0FBRyxHQUFHLFFBQVEsRUFBRTtBQUFBLElBQ3hCLEtBQUssRUFBRSxRQUFRRCxNQUFLLElBQUksTUFBTUEsTUFBSyxNQUFNLE1BQU1BLE1BQUssTUFBTSxRQUFRLElBQUksUUFBUSxHQUFHLE1BQU0sS0FBSyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksR0FBRyxTQUFTLFdBQVcsTUFBTSxHQUFHLEtBQUssTUFBTSxRQUFRLElBQUksTUFBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRztBQUFBLEVBQzVMO0FBQ0Y7QUFFQSxTQUFTLFlBQVksS0FBaUJELE1BQW9CQyxPQUFlLE9BQXFCLFNBQTBCQyxPQUF3RztBQUM5TixRQUFNLElBQUlELE1BQUs7QUFDZixRQUFNLE9BQU8sRUFBRSxRQUFRQSxNQUFLLElBQUksTUFBTUEsTUFBSyxNQUFNLE1BQU1BLE1BQUssTUFBTSxRQUFRLFFBQVEsUUFBUSxRQUFRLEtBQUssSUFBSSxHQUFHLEdBQUcsUUFBUSxLQUFLLElBQUksQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLEdBQUcsTUFBTUMsTUFBSyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRTtBQUNuTCxRQUFNLEtBQUssTUFBTSxJQUFJLEVBQUUsTUFBTSxLQUFLO0FBQ2xDLFFBQU0sTUFBTSxJQUFJLGNBQWMsRUFBRSxNQUFNLElBQUksSUFBSSxJQUFJLFlBQVksRUFBRSxNQUFNLEdBQUdGLEtBQUksSUFBSSxJQUFJQSxLQUFJLFNBQVMsT0FBTyxJQUFJO0FBQzdHLFFBQU0sT0FBTyxFQUFFO0FBQ2YsTUFBSSxNQUFNLFNBQVMsYUFBYTtBQUM5QixVQUFNLE1BQU0sS0FBSyxJQUFJLEdBQUcsR0FBRyxRQUFRLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7QUFDNUQsVUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLE1BQU0sSUFBSTtBQUNsQyxVQUFNLFFBQVFFLE1BQUssT0FBTyxDQUFDLE1BQU0sRUFBRSxVQUFVLE1BQU0sR0FBRyxFQUFFLE9BQU8sQ0FBQ00sSUFBRyxNQUFNQSxLQUFJLEVBQUUsTUFBTSxDQUFDO0FBQ3RGLFVBQU0sT0FBTyxDQUFDLEdBQUcsS0FBSyxLQUFLLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFVBQVUsRUFBRSxPQUFPO0FBQ2pFLFFBQUksTUFBTSxLQUFLLENBQUM7QUFDaEIsZUFBVyxLQUFLLEtBQU0sS0FBSSxTQUFTLEVBQUUsUUFBUyxPQUFNO0FBQ3BELFVBQU1DLEtBQUksTUFBTyxJQUFJLE9BQU8sT0FBTyxLQUFLLE1BQU0sS0FBSyxJQUFJLE1BQU0sR0FBRyxJQUFJLE9BQU8sSUFBSSxjQUFjLEtBQUssTUFBTztBQUN6RyxXQUFPLEVBQUUsU0FBU0EsSUFBRyxLQUFLLEVBQUUsR0FBRyxNQUFNLFNBQVNBLEtBQUksSUFBSSxVQUFVQSxLQUFJLElBQUksWUFBWSxRQUFRLE1BQU0sR0FBRyxLQUFLLHNCQUFpQkEsS0FBSSxHQUFHLElBQUksWUFBWSxJQUFJLElBQUksSUFBSSxFQUFFLENBQUMsV0FBTSxJQUFJLEtBQUtBLEVBQUMsQ0FBQyxLQUFLLE9BQU8sR0FBRyxFQUFFO0FBQUEsRUFDck07QUFDQSxNQUFJLE1BQU0sU0FBUyxXQUFXO0FBQzVCLFVBQU0sUUFBUSxLQUFLLFlBQVksT0FBTyxDQUFDLFFBQVEsS0FBSyxLQUFLLFFBQVEsQ0FBQyxFQUFFLE9BQU8sT0FBTyxJQUFJLFFBQVEsS0FBSyxPQUFPLENBQUMsTUFBTSxFQUFFLFNBQVMsS0FBSyxDQUFDLEVBQUUsS0FBSztBQUV6SSxVQUFNLE9BQU8sb0JBQUksSUFBWTtBQUM3QixVQUFNLFFBQVEsTUFBTSxPQUFPLENBQUMsT0FBTztBQUNqQyxZQUFNLE1BQU0sS0FBSyxJQUFJLEdBQUcsR0FBRyxTQUFTLElBQUk7QUFDeEMsWUFBTSxJQUFJUCxNQUFLLFVBQVUsQ0FBQyxHQUFHLE1BQU0sQ0FBQyxLQUFLLElBQUksQ0FBQyxLQUFLLEVBQUUsVUFBVSxHQUFHLFNBQVMsT0FBTyxFQUFFLFFBQVEsR0FBRyxJQUFJO0FBQ25HLFVBQUksSUFBSSxFQUFHLFFBQU87QUFDbEIsV0FBSyxJQUFJLENBQUM7QUFDVixhQUFPO0FBQUEsSUFDVCxDQUFDO0FBQ0QsUUFBSSxDQUFDLE1BQU0sT0FBUSxRQUFPLEVBQUUsU0FBUyxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxXQUFXLE1BQU0sR0FBR0EsTUFBSyxNQUFNLElBQUksUUFBUSxLQUFLLE1BQU0sdUJBQXVCLEVBQUU7QUFDaEosVUFBTU8sS0FBSSxDQUFDLEtBQUssTUFBTSxLQUFLLEtBQUssTUFBTSxHQUFHLElBQUk7QUFDN0MsV0FBTyxFQUFFLFNBQVNBLElBQUcsS0FBSyxFQUFFLEdBQUcsTUFBTSxTQUFTLFdBQVcsTUFBTSxrQkFBa0IsTUFBTSxJQUFJLENBQUMsTUFBTSxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUUsS0FBSyxJQUFJLENBQUMsV0FBTSxJQUFJLFlBQVksSUFBSSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQU0sSUFBSSxLQUFLQSxFQUFDLENBQUMsR0FBRyxFQUFFO0FBQUEsRUFDeEw7QUFDQSxRQUFNLFNBQVMsUUFBUSxjQUFjLFFBQVEsS0FBSyxZQUFZLE9BQU8sUUFBUSxLQUFLLEtBQUssUUFBUSxJQUFJO0FBQ25HLE1BQUksQ0FBQyxRQUFRLENBQUMsUUFBUTtBQUNwQixVQUFNLFdBQVcsUUFBUSxLQUFLLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSztBQUN0RCxVQUFNRCxLQUFJLFlBQVksSUFBSSxTQUFTTixPQUFNLFFBQVEsS0FBSyxRQUFRLEVBQUUsTUFBTSxJQUFJO0FBQzFFLFVBQU0sS0FBSyxXQUFXLElBQUlBLE1BQUssVUFBVSxLQUFLLEtBQUssUUFBUSxLQUFLLFNBQVMsR0FBRyxLQUFLTSxNQUFLLE1BQU0sUUFBUSxLQUFLLFFBQVEsRUFBRTtBQUNuSCxXQUFPLEVBQUUsU0FBUyxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxLQUFLLFlBQVksUUFBUSxXQUFXQSxJQUFHLE1BQU0sWUFBWSxJQUFJLEdBQUdBLE1BQUssQ0FBQyxZQUFZLFFBQVEsS0FBSyxRQUFRLEVBQUUsSUFBSSxVQUFVLEdBQUdOLE1BQUssTUFBTSxJQUFJLFFBQVEsS0FBSyxNQUFNLFFBQVEsRUFBRTtBQUFBLEVBQ3ROO0FBRUEsUUFBTSxLQUFNLEtBQUssU0FBUyxtQkFBbUIsS0FBSyxVQUFXLFVBQVVBLE9BQU0sT0FBTyxNQUFNLElBQ3JGLGFBQWEsUUFBUSxLQUFLLFVBQVcsU0FBU0EsT0FBTSxPQUFPLE1BQU0sSUFDbEUsU0FBU0EsT0FBTSxPQUFPLE1BQU0sTUFBTTtBQUV0QyxNQUFJLEtBQUssU0FBUyxRQUFRO0FBQ3hCLFVBQU0sTUFBTUEsTUFBSyxPQUFPLENBQUMsTUFBTSxFQUFFLFVBQVUsT0FBTyxTQUFTLEtBQUssSUFBSSxHQUFHLE9BQU8sU0FBUyxJQUFJLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxJQUFJLEtBQUssRUFBRSxRQUFRLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUMvSixRQUFJLENBQUMsSUFBSyxRQUFPLEVBQUUsU0FBUyxHQUFHLEtBQUssRUFBRSxHQUFHLE1BQU0sU0FBUyxRQUFRLE1BQU0sb0JBQW9CLEVBQUU7QUFDNUYsVUFBTSxNQUFNLFFBQVEsS0FBSyxJQUFJLFFBQVEsSUFBSSxJQUFJLElBQUksS0FBSyxLQUFLLEtBQUssS0FBS0YsTUFBSyxFQUFFLE1BQU0sQ0FBQztBQUNuRixXQUFPLEVBQUUsU0FBUyxHQUFHLE9BQU8sS0FBSyxLQUFLLEVBQUUsR0FBRyxNQUFNLFNBQVMsT0FBTyxLQUFLLFVBQVUsV0FBVyxXQUFXLElBQUksTUFBTSxNQUFNLEdBQUcsSUFBSSxJQUFJLE1BQU0sQ0FBQyxPQUFJLElBQUksSUFBSSxjQUFTLElBQUksRUFBRSxDQUFDLFdBQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFO0FBQUEsRUFDekw7QUFFQSxNQUFJLElBQUk7QUFDUixNQUFJLFFBQVEsR0FBRyxPQUFPLElBQUk7QUFDMUIsTUFBSTtBQUNKLE1BQUksS0FBSyxTQUFTLGNBQWM7QUFDOUIsUUFBSSxJQUFJO0FBQ1IsZUFBVyxLQUFLLEtBQUssTUFBTyxLQUFJLEtBQUssRUFBRSxRQUFTLEtBQUksRUFBRTtBQUN0RCxRQUFJLElBQUk7QUFDUixRQUFJLEtBQUssS0FBSyxVQUFXLFFBQU8sT0FBTyxZQUFZLEtBQUssVUFBVSxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsS0FBSyxJQUFJLGNBQWMsQ0FBQyxJQUFJLElBQUksSUFBSSxZQUFZLENBQUMsR0FBR0EsS0FBSSxJQUFJLElBQUksSUFBSSxDQUFDLENBQUM7QUFBQSxFQUN6SixPQUFPO0FBQ0wsVUFBTSxPQUFPLEVBQUUsTUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTLElBQUksRUFBRSxNQUFNLE1BQU0sSUFBSSxLQUFLLFFBQVEsR0FBRyxVQUFVLE9BQU87QUFDMUcsWUFBUSxVQUFVLElBQUk7QUFDdEIsUUFBSSxPQUFPLElBQUk7QUFDZixVQUFNLE1BQU0sS0FBSyxJQUFJLEdBQUcsT0FBTyxTQUFTLElBQUk7QUFDNUMsVUFBTSxXQUFXRSxNQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxPQUFPLFNBQVMsR0FBRztBQUNuRSxRQUFJLEtBQUssS0FBSztBQUVaLFlBQU0sT0FBTyxTQUFTLFNBQVMsU0FBUyxDQUFDO0FBQ3pDLFlBQU0sWUFBWSxNQUFNLE9BQU8sT0FBTztBQUN0QyxZQUFNLFlBQVksT0FBTyxLQUFLLE9BQU8sT0FBTyxRQUFRLEtBQUssT0FBTyxPQUFPLEtBQUssS0FBSyxNQUFNLGFBQWE7QUFDcEcsYUFBTyxZQUFZO0FBQ25CLFVBQUksT0FBTyxFQUFHLFFBQU87QUFDckIsY0FBUSxjQUFjLElBQUksU0FBUyxDQUFDO0FBQUEsSUFDdEM7QUFDQSxRQUFJLEtBQUsscUJBQXFCO0FBQzVCLFlBQU0sWUFBWSxRQUFRLEtBQUssT0FBTyxDQUFDLE1BQU0sS0FBSyxJQUFJLEVBQUUsU0FBUyxPQUFPLE1BQU0sS0FBSyxHQUFHO0FBQ3RGLFlBQU0sUUFBUSxLQUFLLElBQUksR0FBRyxVQUFVLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDO0FBQ3RELFlBQU0sT0FBTyxTQUFTLE9BQU8sQ0FBQyxNQUFNLEVBQUUsUUFBUSxLQUFLLEVBQUU7QUFDckQsWUFBTSxVQUFVLEtBQUssSUFBSSxHQUFHLFVBQVUsU0FBUyxJQUFJO0FBQ25ELFVBQUksUUFBUyxRQUFPLEtBQUssSUFBSSxNQUFNLEtBQUssT0FBTztBQUFBLElBQ2pEO0FBQ0EsVUFBTSxPQUFPLENBQUMsR0FBRyxLQUFLLEtBQUssRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUk7QUFDM0QsUUFBSSxNQUFNLEtBQUssQ0FBQztBQUNoQixlQUFXLEtBQUssS0FBTSxLQUFJLFFBQVEsRUFBRSxLQUFNLE9BQU07QUFFaEQsUUFBSSxNQUFPLElBQUksT0FBTyxPQUFPLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxHQUFHLElBQUksT0FBTyxJQUFJLGNBQWMsS0FBSyxNQUFPO0FBRW5HLFFBQUksSUFBSSxXQUFXLEtBQUssY0FBYyxLQUFNLEtBQUksT0FBTyxLQUFLLEdBQUcsS0FBSyxLQUFLRixNQUFLLEVBQUUsTUFBTSxDQUFDLElBQUk7QUFBQSxFQUM3RjtBQUNBLFNBQU87QUFBQSxJQUNMLFNBQVM7QUFBQSxJQUNUO0FBQUEsSUFDQSxLQUFLLEVBQUUsR0FBRyxNQUFNLFNBQVMsSUFBSSxJQUFJLFVBQVUsSUFBSSxJQUFJLFlBQVksUUFBUSxXQUFXLEdBQUcsTUFBTSxJQUFJLEdBQUcsQ0FBQyxVQUFVLEtBQUssZUFBVSxJQUFJLEVBQUUsQ0FBQyxXQUFNLElBQUksS0FBSyxDQUFDLENBQUMsS0FBSyxHQUFHLENBQUMsVUFBVSxLQUFLLG9CQUFlO0FBQUEsRUFDN0w7QUFDRjtBQUVBLFNBQVMsU0FBU0UsT0FBbUIsUUFBb0M7QUFDdkUsUUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLFNBQVMsSUFBSTtBQUNyQyxRQUFNLElBQUlBLE1BQUssT0FBTyxDQUFDLE1BQU0sRUFBRSxVQUFVLFNBQVMsR0FBRztBQUNyRCxTQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsU0FBUyxDQUFDLEVBQUUsT0FBTztBQUMzQztBQUVBLFNBQVMsVUFBVUEsT0FBbUIsUUFBb0M7QUFDeEUsUUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLFNBQVMsSUFBSTtBQUNyQyxRQUFNLElBQUlBLE1BQUssT0FBTyxDQUFDLE1BQU0sRUFBRSxVQUFVLFNBQVMsR0FBRyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSTtBQUN4RSxTQUFPLEVBQUUsU0FBUyxLQUFLLElBQUksR0FBRyxDQUFDLElBQUk7QUFDckM7QUFFQSxTQUFTLFNBQVNBLE9BQW1CLFFBQW9DO0FBQ3ZFLFFBQU0sTUFBTSxLQUFLLElBQUksR0FBRyxTQUFTLElBQUk7QUFDckMsUUFBTSxJQUFJQSxNQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxTQUFTLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUk7QUFDeEUsU0FBTyxFQUFFLFNBQVMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxJQUFJO0FBQ3JDO0FBR08sU0FBUyxhQUFhLEtBQWlCRixNQUFvQixPQUFxQixHQUFnQixVQUFnQztBQUNySSxRQUFNLE9BQU8sUUFBUSxLQUFLQSxNQUFLLE9BQU8sUUFBUTtBQUM5QyxRQUFNLE1BQU0sSUFBSSxLQUFLLFFBQVE7QUFDN0IsUUFBTSxRQUFRLEVBQUUsR0FBRyxNQUFNLE1BQU07QUFDL0IsUUFBTSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUk7QUFDM0IsUUFBTSxVQUFVLEVBQUUsR0FBRyxNQUFNLFVBQVU7QUFDckMsTUFBSSxjQUFzQyxFQUFFLEdBQUcsTUFBTSxjQUFjO0FBQ25FLFFBQU0sVUFBd0IsQ0FBQztBQUMvQixRQUFNLE9BQU8sb0JBQUksSUFBb0I7QUFFckMsYUFBV0MsU0FBUSxJQUFJLE9BQU87QUFDNUIsVUFBTSxVQUFVLEtBQUssVUFBVSxLQUFLLENBQUMsTUFBTSxFQUFFLFdBQVdBLE1BQUssRUFBRTtBQUMvRCxRQUFJLENBQUMsUUFBUztBQUNkLFVBQU0sU0FBUyxhQUFhLEdBQUdBLE1BQUssTUFBTUQsSUFBRztBQUM3QyxVQUFNLElBQUksS0FBSyxJQUFJQyxNQUFLLElBQUksS0FBSztBQUNqQyxTQUFLLElBQUlBLE1BQUssTUFBTSxJQUFJLENBQUM7QUFDekIsVUFBTUMsUUFBTyxPQUFPLENBQUMsS0FBSyxDQUFDO0FBQzNCLFFBQUksQ0FBQ0EsTUFBSyxRQUFRO0FBQ2hCLGNBQVEsS0FBSyxFQUFFLFFBQVFELE1BQUssSUFBSSxNQUFNQSxNQUFLLE1BQU0sTUFBTUEsTUFBSyxNQUFNLFFBQVEsUUFBUSxRQUFRLFFBQVEsUUFBUSxLQUFLLENBQUMsR0FBRyxVQUFVLEdBQUcsU0FBUyxVQUFVLE1BQU0sQ0FBQyxHQUFHLE1BQU0sYUFBYSxDQUFDO0FBQ2pMO0FBQUEsSUFDRjtBQUNBLFVBQU0sSUFBSUEsTUFBSztBQUNmLFFBQUksRUFBRSxTQUFTLFdBQVc7QUFDeEIsWUFBTSxFQUFFLFNBQVMsT0FBTyxNQUFNLElBQUksSUFBSSxZQUFZLEtBQUtELE1BQUtDLE9BQU0sT0FBTyxTQUFTQyxLQUFJO0FBQ3RGLFlBQU0sS0FBSyxFQUFFLFVBQVUsYUFBYSxFQUFFLFNBQVMsRUFBRSxPQUFPLFVBQVU7QUFDbEUsWUFBTSxTQUFpQyxFQUFFLEdBQUcsS0FBSztBQUNqRCxVQUFJLFFBQVMsUUFBTyxFQUFFLE1BQU0sS0FBSyxPQUFPLEVBQUUsTUFBTSxLQUFLLEtBQUs7QUFDMUQsVUFBSSxTQUFTLEtBQU0sS0FBSSxFQUFFLE1BQU0sSUFBSTtBQUNuQyxpQkFBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLE9BQU8sUUFBUSxNQUFNLEdBQUc7QUFDOUMsWUFBSSxPQUFPLFVBQVcsU0FBUSxJQUFJLEtBQUssUUFBUSxJQUFJLEtBQUssS0FBSztBQUFBLGlCQUNwRCxPQUFPLGdCQUFpQixhQUFZLElBQUksS0FBSyxZQUFZLElBQUksS0FBSyxLQUFLO0FBQUEsWUFDM0UsS0FBSSxJQUFJLEtBQUssSUFBSSxJQUFJLEtBQUssS0FBSztBQUFBLE1BQ3RDO0FBQ0EsY0FBUSxLQUFLLEdBQUc7QUFDaEI7QUFBQSxJQUNGO0FBQ0EsVUFBTSxJQUFJLEVBQUUsU0FBUyxXQUFXLFdBQVcsS0FBS0YsTUFBS0MsT0FBTSxNQUFNQSxNQUFLLEVBQUUsR0FBR0MsS0FBSSxJQUFJLEVBQUUsU0FBUyxXQUFXLFdBQVcsS0FBS0YsTUFBS0MsT0FBTSxNQUFNQSxNQUFLLEVBQUUsR0FBR0MsS0FBSSxJQUFJLFVBQVVELE9BQU0sTUFBTUEsTUFBSyxFQUFFLEdBQUdDLEtBQUk7QUFDaE0sVUFBTUQsTUFBSyxFQUFFLElBQUksRUFBRTtBQUNuQixZQUFRLEtBQUssRUFBRSxHQUFHLEVBQUUsS0FBSyxRQUFRLEVBQUUsSUFBSSxVQUFVLFFBQVEsT0FBTyxDQUFDO0FBQUEsRUFDbkU7QUFFQSxRQUFNLE9BQU8sZUFBZSxLQUFLLFdBQVcsR0FBRyxNQUFNLFNBQVM7QUFDOUQsTUFBSSxLQUFLLFlBQVksTUFBTSxXQUFXO0FBQ3BDLGVBQVcsQ0FBQyxNQUFNLENBQUMsS0FBSyxPQUFPLFFBQVEsT0FBTyxFQUFHLEtBQUksSUFBSSxLQUFLLElBQUksSUFBSSxLQUFLLEtBQUs7QUFDaEYsZUFBVyxLQUFLLE9BQU8sS0FBSyxPQUFPLEVBQUcsUUFBTyxRQUFRLENBQUM7QUFDdEQsV0FBTyxPQUFPLFNBQVMsV0FBVztBQUNsQyxrQkFBYyxDQUFDO0FBQUEsRUFDakI7QUFFQSxNQUFJLElBQUksT0FBTyxlQUFlLENBQUMsSUFBSSxNQUFNLFVBQVUsSUFBSSxNQUFNLG1CQUFtQixJQUFJLE1BQU0sZUFBZTtBQUN2RyxVQUFNLEVBQUUsT0FBTyxjQUFjLEdBQUcsSUFBSSxJQUFJO0FBQ3hDLFVBQU0sUUFBUSxJQUFJLE1BQU0sbUJBQW1CO0FBQzNDLGFBQVMsSUFBSSxNQUFNLFlBQVksR0FBRyxLQUFLLEtBQUssV0FBVyxLQUFLO0FBQzFELFVBQUksSUFBSSxNQUFNLFVBQVUsS0FBSyxNQUFPO0FBRXBDLFVBQUksS0FBSyxHQUFHLFVBQVUsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLFVBQVU7QUFBRyxtQkFBVyxDQUFDLE1BQU0sRUFBRSxLQUFLLE9BQU8sUUFBUSxJQUFJLE1BQU0sVUFBVSxFQUFHLEtBQUksSUFBSSxJQUFJLEtBQUssS0FBTSxLQUFJLElBQUksS0FBSyxJQUFJLElBQUlELEtBQUksSUFBSTtBQUFBO0FBQUEsSUFDOUs7QUFBQSxFQUNGO0FBQ0EsUUFBTSxRQUFrQixFQUFFLFdBQVcsRUFBRSxJQUFJLE1BQU0sRUFBRSxZQUFZLE9BQU8sSUFBSSxJQUFJLE1BQU0sS0FBSyxNQUFNLFFBQVE7QUFDdkcsUUFBTSxXQUFXLENBQUMsQ0FBQyxJQUFJLE9BQU8sVUFBVSxLQUFLLGFBQWEsSUFBSSxNQUFNO0FBQ3BFLFNBQU8sRUFBRSxVQUFVLEtBQUssVUFBVSxXQUFXLEtBQUssV0FBVyxPQUFPLEtBQUssS0FBSyxDQUFDLEdBQUcsTUFBTSxLQUFLLEtBQUssR0FBRyxVQUFVLFdBQVcsU0FBUyxHQUFJLE9BQU8sS0FBSyxXQUFXLEVBQUUsU0FBUyxFQUFFLGVBQWUsWUFBWSxJQUFJLENBQUMsRUFBRztBQUNoTjtBQUdPLFNBQVMsU0FBUyxLQUFpQkEsTUFBb0IsT0FBcUIsR0FBd0I7QUFFekcsUUFBTSxNQUFNLEVBQUUsYUFBYSxNQUFNLGlCQUFpQixJQUFJLENBQUM7QUFDdkQsTUFBSSxLQUFLO0FBQ1AsVUFBTSxJQUFJLElBQUksS0FBSyxVQUFVLENBQUMsTUFBTSxFQUFFLE9BQU8sR0FBRztBQUNoRCxRQUFJLEtBQUssRUFBRyxRQUFPO0FBQUEsRUFDckI7QUFDQSxNQUFJLEVBQUUsY0FBY0EsS0FBSSxjQUFjLEVBQUUsVUFBVSxHQUFHO0FBQ25ELFVBQU0sSUFBSSxJQUFJLEtBQUssVUFBVSxDQUFDLE1BQU0sRUFBRSxPQUFPQSxLQUFJLFlBQWEsRUFBRSxVQUFXLENBQUM7QUFDNUUsUUFBSSxLQUFLLEVBQUcsUUFBTztBQUFBLEVBQ3JCO0FBQ0EsUUFBTSxRQUFRLEVBQUUsVUFBVSxJQUFJLENBQUMsTUFBTSxVQUFVLEVBQUUsT0FBTyxFQUFFLHNCQUFzQkEsS0FBSSxPQUFPLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBbUIsQ0FBQyxDQUFDLENBQUM7QUFDNUgsUUFBTSxRQUFRLElBQUksSUFBSSxLQUFLO0FBQzNCLFFBQU0sT0FBTyxVQUFVLEtBQUssTUFBTSxTQUFTO0FBSTNDLE1BQUksT0FBTyxJQUFJLFlBQVk7QUFDM0IsV0FBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUssUUFBUSxLQUFLO0FBQ3hDLFVBQU0sS0FBSyxNQUFNLFdBQVcsS0FBSyxJQUFJLEtBQUs7QUFDMUMsVUFBTSxJQUFJLElBQUksS0FBSyxDQUFDO0FBRXBCLFVBQU0sU0FBUyxFQUFFLE1BQU0sS0FBSyxDQUFDLE9BQU8sTUFBTSxFQUFFLElBQUksR0FBRyxLQUFLLFVBQVUsS0FBSyxLQUFLQSxLQUFJLFVBQVUsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLE1BQU0sQ0FBQztBQUMvRyxRQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sSUFBSSxPQUFPLElBQUksRUFBRztBQUN4QyxVQUFNLE9BQU8sb0JBQUksSUFBb0I7QUFDckMsUUFBSSxRQUFRO0FBQ1osZUFBV0MsU0FBUSxFQUFFLE9BQU87QUFDMUIsWUFBTSxJQUFJLEtBQUssSUFBSUEsTUFBSyxJQUFJLEtBQUs7QUFDakMsV0FBSyxJQUFJQSxNQUFLLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLGVBQVMsUUFBUUEsT0FBTSxPQUFPLGFBQWEsR0FBR0EsTUFBSyxNQUFNRCxJQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxLQUFLQyxVQUFTLFNBQVMsTUFBTTtBQUFBLElBQ3JHO0FBQ0EsY0FBVSxNQUFNLENBQUMsTUFBTSxPQUFPLE9BQU8sTUFBTSxNQUFNLE1BQU0sSUFBSSxPQUFPLE1BQU0sWUFBWSxHQUFHLElBQUksSUFBSSxNQUFNO0FBQ3JHLFFBQUksUUFBUSxXQUFXO0FBQUUsYUFBTztBQUFHLGtCQUFZO0FBQUEsSUFBTztBQUFBLEVBQ3hEO0FBQ0EsU0FBTztBQUNUO0FBRUEsU0FBUyxpQkFBaUIsT0FBcUIsS0FBaUM7QUFDOUUsUUFBTSxRQUFRLEVBQUUsR0FBRyxNQUFNLE1BQU07QUFDL0IsUUFBTSxNQUFNLEVBQUUsR0FBRyxNQUFNLElBQUk7QUFDM0IsYUFBVyxLQUFLLEtBQUs7QUFDbkIsUUFBSSxFQUFFLFVBQVUsTUFBTSxFQUFFLE1BQU0sR0FBRztBQUMvQixZQUFNLElBQUksRUFBRSxHQUFHLE1BQU0sRUFBRSxNQUFNLEVBQUU7QUFDL0IsVUFBSSxFQUFFLFVBQVUsTUFBTTtBQUFFLFVBQUUsU0FBUyxFQUFFO0FBQVEsYUFBSyxFQUFFLFNBQVMsRUFBRSxXQUFXLEVBQUcsR0FBRSxlQUFlLEVBQUU7QUFBQSxNQUFRO0FBQ3hHLFVBQUksRUFBRSxTQUFTLEtBQU0sR0FBRSxRQUFRLEVBQUU7QUFDakMsUUFBRSxTQUFTO0FBQ1gsUUFBRSxRQUFRO0FBQ1YsWUFBTSxFQUFFLE1BQU0sSUFBSTtBQUFBLElBQ3BCO0FBQ0EsUUFBSSxFQUFFLFFBQVEsRUFBRSxNQUFNLEtBQU0sS0FBSSxFQUFFLElBQUksSUFBSSxFQUFFO0FBQUEsRUFDOUM7QUFDQSxTQUFPLEVBQUUsR0FBRyxPQUFPLE9BQU8sSUFBSTtBQUNoQztBQWNPLFNBQVMsV0FBVyxTQUFpQixhQUFhLEdBQVc7QUFDbEUsTUFBSSxVQUFVLFdBQVksUUFBTztBQUNqQyxTQUFPLFVBQVUsS0FBSyxJQUFJLFVBQVUsS0FBSyxJQUFJLFVBQVUsS0FBSyxJQUFJLFVBQVUsTUFBTSxJQUFJO0FBQ3RGO0FBT08sSUFBTSxjQUFjLENBQUMsU0FBMEIsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLElBQUksRUFBRSxRQUFRO0FBR2xGLFNBQVMsU0FBUyxHQUFZLE1BQXNCO0FBQ3pELFNBQU8sS0FBSyxJQUFJLEdBQUcsV0FBVyxFQUFFLFNBQVMsQ0FBQyxDQUFDLEtBQUssWUFBWSxJQUFJLElBQUksSUFBSTtBQUMxRTtBQVNBLElBQU0sWUFBWSxDQUFDLFFBQ2pCLENBQUMsR0FBRyxJQUFJLElBQUksSUFBSSxLQUFLLFFBQVEsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxNQUFNLEVBQUUsU0FBUyxTQUFTLEVBQUUsU0FBUyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztBQU05RyxTQUFTLFVBQVUsS0FBaUIsT0FBcUIsU0FBaUIsYUFBYSxHQUF3QjtBQUNwSCxRQUFNLE9BQU8sV0FBVyxTQUFTLFVBQVU7QUFDM0MsTUFBSSxDQUFDLEtBQU0sUUFBTztBQUNsQixRQUFNLElBQWEsRUFBRSxTQUFTLE9BQU8sTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLEVBQUU7QUFDN0QsUUFBTSxRQUFRLFVBQVUsR0FBRztBQUMzQixRQUFNLE9BQStCLENBQUM7QUFDdEMsTUFBSSxNQUFNLEVBQUUsVUFBVSxNQUFNLFVBQVUsV0FBVyxNQUFNLFVBQVU7QUFDakUsTUFBSSxJQUFJO0FBQ1IsU0FBTyxJQUFJLE9BQU8sS0FBSyxNQUFNLEtBQUssQ0FBQyxPQUFPLEtBQUssQ0FBQyxLQUFLLEtBQUssU0FBUyxHQUFHLENBQUMsQ0FBQyxHQUFHO0FBQ3pFLGVBQVcsS0FBSyxJQUFJLElBQUksSUFBSSxLQUFLLElBQUksUUFBUSxFQUFFLE1BQU0sSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsRUFBRyxNQUFLLENBQUMsS0FBSyxLQUFLLENBQUMsS0FBSyxLQUFLO0FBQ3JHO0FBQ0EsVUFBTSxlQUFlLEtBQUssSUFBSSxXQUFXLEdBQUcsSUFBSSxTQUFTO0FBQUEsRUFDM0Q7QUFDQSxTQUFPLEVBQUUsR0FBRyxHQUFHLE9BQU8sS0FBSyxJQUFJLE1BQU0sQ0FBQyxFQUFFO0FBQzFDO0FBR0EsU0FBUyxTQUFTLEtBQWlCUyxNQUFvQixPQUFxQixHQUFnQixVQUE0QjtBQUN0SCxRQUFNLE9BQU8sUUFBUSxLQUFLQSxNQUFLLE9BQU8sUUFBUTtBQUM5QyxRQUFNLE9BQU8sb0JBQUksSUFBb0I7QUFDckMsUUFBTSxNQUFnQixDQUFDO0FBQ3ZCLGFBQVcsS0FBSyxLQUFLLFdBQVc7QUFDOUIsVUFBTSxJQUFJLEtBQUssSUFBSSxFQUFFLElBQUksS0FBSztBQUM5QixTQUFLLElBQUksRUFBRSxNQUFNLElBQUksQ0FBQztBQUN0QixVQUFNLE1BQU0sS0FBSyxJQUFJLEdBQUcsR0FBRyxFQUFFLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUM7QUFDdEQsUUFBSSxDQUFDLElBQUs7QUFDVixVQUFNLE9BQU8sS0FBSyxJQUFJLEdBQUcsRUFBRSxLQUFLLE9BQU8sQ0FBQyxNQUFNLEVBQUUsVUFBVSxHQUFHLEVBQUUsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUM7QUFDakYsVUFBTSxNQUFNLEtBQUssSUFBSSxHQUFHLE1BQU0sSUFBSTtBQUNsQyxTQUFLLGFBQWEsR0FBRyxFQUFFLE1BQU1BLElBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxNQUFNLEVBQUUsVUFBVSxNQUFNLE9BQU8sRUFBRSxRQUFRLElBQUksRUFBRyxLQUFJLEtBQUssRUFBRSxJQUFJO0FBQUEsRUFDbkg7QUFDQSxTQUFPO0FBQ1Q7QUFHQSxTQUFTLFlBQVksS0FBaUIsR0FBWSxTQUF1QixRQUF1QztBQUM5RyxRQUFNLE9BQU8sRUFBRSxHQUFHLEVBQUUsS0FBSztBQUN6QixhQUFXLEtBQUssSUFBSSxJQUFJLFFBQVEsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLEVBQUcsTUFBSyxDQUFDLEtBQUssS0FBSyxDQUFDLEtBQUssS0FBSztBQUNqSCxhQUFXLEtBQUssT0FBUSxNQUFLLENBQUMsSUFBSSxLQUFLLElBQUksS0FBSyxDQUFDLEtBQUssR0FBRyxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQ3ZFLFFBQU0sT0FBZ0IsRUFBRSxHQUFHLEdBQUcsTUFBTSxFQUFFLE9BQU8sR0FBRyxLQUFLO0FBQ3JELFFBQU0sVUFBVSxVQUFVLEdBQUcsRUFBRSxNQUFNLENBQUMsT0FBTyxLQUFLLENBQUMsS0FBSyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDNUUsU0FBTyxLQUFLLFFBQVEsRUFBRSxTQUFTLFVBQVUsU0FBWTtBQUN2RDtBQUVBLElBQU0sY0FBYyxDQUFDLEdBQVcsTUFBYyxLQUFLLE9BQU8sS0FBSyxNQUFNLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxLQUFLLEtBQUs7QUFPaEcsU0FBUyxhQUFhQyxTQUFzQkMsUUFBbUM7QUFDN0UsUUFBTSxRQUFRLEVBQUUsR0FBR0EsT0FBTSxNQUFNO0FBQy9CLFFBQU0sTUFBTSxFQUFFLEdBQUdBLE9BQU0sSUFBSTtBQUMzQixRQUFNLFVBQVUsRUFBRSxHQUFHQSxPQUFNLFVBQVU7QUFDckMsUUFBTSxJQUFJRCxRQUFPO0FBQ2pCLFFBQU0sTUFBTSxZQUFZLEVBQUUsT0FBTyxDQUFDLElBQUksRUFBRSxLQUFLLFVBQVUsRUFBRSxPQUFPO0FBQ2hFLFFBQU0sUUFBUUMsT0FBTSxJQUFJQSxPQUFNLElBQUksU0FBUyxDQUFDO0FBQzVDLFFBQU0sVUFBVSxNQUFNLFFBQVEsSUFBSSxDQUFDLFFBQVE7QUFDekMsVUFBTSxJQUFJRCxRQUFPLE1BQU0sSUFBSSxNQUFNLEdBQUcsSUFBSSxNQUFNLElBQUksTUFBTTtBQUN4RCxRQUFJLFdBQVc7QUFDZixRQUFJLEtBQUssTUFBTSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsUUFBUSxFQUFFLFVBQVUsRUFBRSxTQUFTLE1BQU0sRUFBRSxTQUFTLE1BQU8sRUFBRSxVQUFVLENBQUMsRUFBRSxTQUFVO0FBQ3RILFlBQU0sSUFBSSxNQUFNLElBQUk7QUFDcEIsaUJBQVc7QUFBQSxJQUNiO0FBQ0EsUUFBSSxJQUFJLElBQUksSUFBSSxLQUFLLFFBQVFBLFFBQU8sSUFBSSxJQUFJLElBQUksS0FBSyxRQUFRLElBQUksSUFBSSxJQUFJLElBQUlBLFFBQU8sSUFBSSxJQUFJLElBQUksR0FBRztBQUFFLFVBQUksSUFBSSxJQUFJLElBQUlBLFFBQU8sSUFBSSxJQUFJLElBQUk7QUFBRyxpQkFBVztBQUFBLElBQU07QUFDNUosU0FBSyxRQUFRLElBQUksSUFBSSxLQUFLLE1BQU1BLFFBQU8sWUFBWSxJQUFJLElBQUksS0FBSyxJQUFJO0FBQUUsY0FBUSxJQUFJLElBQUksSUFBSUEsUUFBTyxZQUFZLElBQUksSUFBSSxLQUFLO0FBQUcsaUJBQVc7QUFBQSxJQUFNO0FBQzlJLFFBQUksWUFBWSxJQUFJLFlBQVksU0FBVSxRQUFPLEVBQUUsR0FBRyxLQUFLLFNBQVMsUUFBbUIsTUFBTSxHQUFHLEdBQUcsa0JBQWtCLElBQUksSUFBSSxJQUFJO0FBQ2pJLFdBQU8sRUFBRSxHQUFHLEtBQUssTUFBTSxHQUFHLEdBQUcsU0FBTSxJQUFJLElBQUksR0FBRztBQUFBLEVBQ2hELENBQUM7QUFDRCxTQUFPLEVBQUUsR0FBR0MsUUFBTyxPQUFPLEtBQUssV0FBVyxTQUFTLEtBQUssQ0FBQyxHQUFHQSxPQUFNLElBQUksTUFBTSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsT0FBTyxRQUFRLENBQUMsRUFBRTtBQUM3RztBQUdPLFNBQVMsT0FBTyxLQUFpQkYsTUFBb0IsVUFBeUIsT0FBc0IsQ0FBQyxHQUFpQjtBQUMzSCxNQUFJLFFBQVEsYUFBYSxLQUFLQSxJQUFHO0FBQ2pDLFFBQU0sTUFBTSxDQUFDLEdBQUlBLEtBQUksZUFBZSxDQUFDLENBQUUsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxjQUFjLEVBQUUsSUFBSSxDQUFDO0FBQ3BGLE1BQUksS0FBSztBQUNULFFBQU0sU0FBUyxLQUFLLFlBQVksU0FBUyxJQUFJLGNBQWMsV0FBVyxLQUFLLFNBQVMsY0FBYztBQUNsRyxNQUFJLGNBQTZCO0FBQ2pDLFFBQU0sU0FBUyxTQUFTLE9BQU8sQ0FBQyxNQUFNLEVBQUUsY0FBY0EsS0FBSSxTQUFTLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFdBQVcsY0FBYyxFQUFFLFVBQVUsQ0FBQztBQUM1SCxhQUFXLEtBQUssUUFBUTtBQUN0QixRQUFJLE1BQU0sU0FBVTtBQUNwQixVQUFNLE1BQW9CLENBQUM7QUFDM0IsV0FBTyxLQUFLLElBQUksVUFBVSxJQUFJLEVBQUUsRUFBRSxRQUFRLEVBQUUsV0FBWSxLQUFJLEtBQUssSUFBSSxJQUFJLENBQUM7QUFDMUUsUUFBSSxJQUFJLE9BQVEsU0FBUSxpQkFBaUIsT0FBTyxHQUFHO0FBQ25ELFVBQU0sSUFBSSxTQUFTLEtBQUtBLE1BQUssT0FBTyxDQUFDO0FBQ3JDLFFBQUksSUFBSSxFQUFHO0FBRVgsUUFBSSxlQUFlLE9BQU8sU0FBUyxNQUFNLEdBQUc7QUFDMUMsWUFBTSxJQUFJLFVBQVUsS0FBSyxPQUFPLFlBQVksYUFBYSxFQUFFLFVBQVUsR0FBRyxNQUFNO0FBQzlFLFVBQUksRUFBRyxTQUFRLEVBQUUsR0FBRyxPQUFPLFNBQVMsRUFBRTtBQUFBLElBQ3hDO0FBQ0EsVUFBTUMsVUFBUztBQUNmLFFBQUksT0FBTyxhQUFhLEtBQUtELE1BQUssT0FBTyxHQUFHLENBQUM7QUFDN0MsUUFBSUMsUUFBTyxXQUFXQSxRQUFPLFFBQVEsT0FBT0EsUUFBTyxRQUFRLE9BQU87QUFDaEUsYUFBTyxhQUFhQSxTQUFRLElBQUk7QUFDaEMsWUFBTSxVQUFVLEtBQUssSUFBSSxLQUFLLElBQUksU0FBUyxDQUFDLEVBQUU7QUFDOUMsYUFBTyxFQUFFLEdBQUcsTUFBTSxTQUFTLFlBQVksS0FBS0EsUUFBTyxTQUFTLFNBQVMsU0FBUyxLQUFLRCxNQUFLQyxTQUFRLEdBQUcsQ0FBQyxDQUFDLEVBQUU7QUFBQSxJQUN6RztBQUNBLFlBQVE7QUFDUixrQkFBYyxFQUFFO0FBQUEsRUFDbEI7QUFDQSxNQUFJLEtBQUssSUFBSSxPQUFRLFNBQVEsaUJBQWlCLE9BQU8sSUFBSSxNQUFNLEVBQUUsQ0FBQztBQUVsRSxNQUFJLEtBQUssU0FBUyxlQUFlLE9BQU8sU0FBUyxNQUFNLEdBQUc7QUFDeEQsVUFBTSxJQUFJLFVBQVUsS0FBSyxPQUFPLFlBQVksWUFBWSxNQUFNLEdBQUcsRUFBRSxHQUFHLEtBQUssS0FBSyxHQUFHLE1BQU07QUFDekYsUUFBSSxFQUFHLFNBQVEsRUFBRSxHQUFHLE9BQU8sU0FBUyxFQUFFO0FBQUEsRUFDeEM7QUFDQSxTQUFPO0FBQ1Q7OztBQ3hqQ0EsSUFBTSxRQUFnQztBQUFBLEVBQ3BDLFlBQVk7QUFBQSxFQUFTLFlBQVk7QUFBQSxFQUNqQyxpQkFBaUI7QUFBQSxFQUFZLFVBQVU7QUFBQSxFQUN2QyxTQUFTO0FBQUEsRUFBUyxjQUFjO0FBQ2xDO0FBQ0EsSUFBTSxPQUFPLG9CQUFJLElBQUksQ0FBQyxTQUFTLFNBQVMsVUFBVSxDQUFDO0FBRzVDLFNBQVMsVUFBVSxNQUE0QjtBQUNwRCxTQUFPLEtBQUssTUFBTSxHQUFHLEVBQUUsUUFBUSxDQUFDLFFBQVE7QUFDdEMsVUFBTSxJQUFJLDJCQUEyQixLQUFLLEdBQUc7QUFDN0MsUUFBSSxDQUFDLEVBQUcsT0FBTSxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRTtBQUM3QyxXQUFPLE1BQU0sS0FBSyxFQUFFLFFBQVEsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsR0FBRyxPQUFPLEVBQUUsS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLE9BQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFO0FBQUEsRUFDMUcsQ0FBQztBQUNIO0FBRUEsU0FBUyxLQUFLLElBQVksQ0FBQyxNQUFNLE1BQU0sSUFBSSxHQUFVLE9BQXlCO0FBQzVFLE1BQUksQ0FBQyxLQUFLLFNBQVMsR0FBRyxHQUFHO0FBQ3ZCLFVBQU0sQ0FBQ0UsT0FBTSxJQUFJLElBQUksS0FBSyxNQUFNLEdBQUcsRUFBRSxJQUFJLE1BQU07QUFDL0MsV0FBTyxFQUFFLElBQUksTUFBTSxNQUFNLE9BQU8sTUFBTSxhQUFhLEVBQUUsTUFBTSxTQUFTLE1BQUFBLE9BQU0sS0FBSyxFQUFFO0FBQUEsRUFDbkY7QUFDQSxRQUFNLE9BQWEsS0FBSyxJQUFJLElBQUksS0FBSyxTQUFTLENBQUMsT0FBTyxTQUFTO0FBQy9ELFNBQU8sRUFBRSxJQUFJLE1BQU0sTUFBTSxNQUFNLGFBQWEsRUFBRSxNQUFNLFdBQVcsUUFBUSxNQUFNLElBQUksS0FBSyxNQUFNLE9BQU8sQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFLEVBQUU7QUFDekg7QUFLQSxTQUFTLE9BQU8sUUFBMEQ7QUFDeEUsUUFBTSxPQUFpQixDQUFDO0FBQ3hCLFFBQU0sWUFBc0IsQ0FBQztBQUM3QixhQUFXLEtBQUssUUFBUTtBQUN0QixNQUFFLE1BQU0sUUFBUSxDQUFDLElBQUksTUFBTTtBQUN6QixZQUFNLElBQUksVUFBVTtBQUNwQixnQkFBVSxLQUFLLEdBQUcsRUFBRSxLQUFLLGNBQVcsSUFBSSxDQUFDLEVBQUU7QUFDM0MsU0FBRyxRQUFRLENBQUMsQ0FBQyxTQUFTLE9BQU8sR0FBRyxNQUFNO0FBQ3BDLGNBQU0sT0FBTyxHQUFHLEVBQUUsR0FBRyxJQUFJLElBQUksQ0FBQyxJQUFJLElBQUksQ0FBQztBQUN2QyxjQUFNLE9BQStCLENBQUM7QUFDdEMsY0FBTSxRQUFRLFFBQVEsSUFBSSxDQUFDLE1BQU07QUFDL0IsZ0JBQU0sSUFBSyxLQUFLLEVBQUUsQ0FBQyxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUMsQ0FBQyxLQUFLLEtBQUs7QUFDNUMsaUJBQU8sS0FBSyxHQUFHLElBQUksSUFBSSxFQUFFLENBQUMsQ0FBQyxHQUFHLElBQUksSUFBSSxJQUFJLEVBQUUsSUFBSSxHQUFHLE1BQU0sQ0FBQztBQUFBLFFBQzVELENBQUM7QUFDRCxhQUFLLEtBQUssRUFBRSxJQUFJLEtBQUssWUFBWSxHQUFHLE1BQU0sR0FBRyxFQUFFLEtBQUssS0FBSyxJQUFJLENBQUMsU0FBTSxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUM7QUFBQSxNQUNwRyxDQUFDO0FBQUEsSUFDSCxDQUFDO0FBQUEsRUFDSDtBQUNBLFNBQU8sRUFBRSxNQUFNLFVBQVU7QUFDM0I7QUFFQSxTQUFTLFFBQVEsWUFBb0IsTUFBYyxRQUFpQixpQkFBeUIsT0FBNkI7QUFDeEgsUUFBTSxFQUFFLE1BQU0sVUFBVSxJQUFJLE9BQU8sTUFBTTtBQUN6QyxTQUFPO0FBQUEsSUFDTDtBQUFBLElBQVk7QUFBQSxJQUFNO0FBQUEsSUFBTTtBQUFBLElBQWlCLFVBQVU7QUFBQSxJQUFPO0FBQUEsSUFDMUQsT0FBTyxFQUFFLE9BQU8sVUFBVSxRQUFRLFdBQVcsUUFBUSxLQUFLO0FBQUEsRUFDNUQ7QUFDRjtBQUVBLElBQU0sUUFBUTtBQUFBLEVBQ1o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRjtBQUVBLElBQU0sU0FBUyxDQUFDLElBQTRCLFNBQzFDLE9BQU8sWUFBWSxPQUFPLFFBQVEsRUFBRSxFQUFFLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxTQUFTLE9BQU8sSUFBSSxLQUFLLE1BQU0sSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUNySCxJQUFNLFdBQVcsQ0FBQyxVQUFnQixFQUFFLGVBQWUsT0FBTyxFQUFFLE9BQU8sS0FBSyxPQUFPLEtBQUssVUFBVSxJQUFJLEdBQUcsSUFBSSxHQUFHLGNBQWMsQ0FBQyxFQUFFO0FBSTdILElBQU0sTUFBWTtBQUFBLEVBQ2hCO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLDJCQUEyQjtBQUFBLE1BQ3JDLENBQUMsU0FBUyxvQkFBb0I7QUFBQSxNQUM5QixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLDZCQUE2Qiw0Q0FBNEM7QUFBQSxNQUN0RixDQUFDLGdCQUFnQixLQUFLO0FBQUEsTUFDdEIsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsWUFBWSwyQkFBMkIsZ0NBQWdDO0FBQUEsTUFDeEUsQ0FBQyxTQUFTLEtBQUs7QUFBQSxNQUNmLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsb0RBQW9EO0FBQUEsTUFDOUQsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFNBQVMsMkJBQTJCO0FBQUEsTUFDckMsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFVBQVUsTUFBTTtBQUFBLE1BQ2pCLENBQUMsY0FBYyxzQkFBc0I7QUFBQSxNQUNyQyxDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLDJCQUEyQiw0Q0FBNEM7QUFBQSxNQUNwRixDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFlBQVksMkJBQTJCLGdDQUFnQztBQUFBLE1BQ3hFLENBQUMsU0FBUyxLQUFLO0FBQUEsSUFDakIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHdDQUF3QztBQUFBLE1BQ2xELENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxTQUFTLG9CQUFvQjtBQUFBLE1BQzlCLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsVUFBVSxNQUFNO0FBQUEsTUFDakIsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLG1CQUFtQixzQkFBc0I7QUFBQSxNQUMxQyxDQUFDLFNBQVMsdUNBQXVDO0FBQUEsTUFDakQsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFlBQVksNkJBQTZCLGdDQUFnQztBQUFBLE1BQzFFLENBQUMsU0FBUyxLQUFLO0FBQUEsSUFDakIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLGNBQWMsc0JBQXNCO0FBQUEsTUFDckMsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyxnQ0FBZ0M7QUFBQSxNQUMxQyxDQUFDLFlBQVksdUNBQXVDO0FBQUEsTUFDcEQsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxNQUFNO0FBQUEsSUFDckIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHNEQUFzRDtBQUFBLE1BQ2hFLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsZUFBZSxPQUFPLFFBQVE7QUFBQSxNQUMvQixDQUFDLG1CQUFtQixRQUFRLHNCQUFzQjtBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFFQSxJQUFNLE1BQVk7QUFBQSxFQUNoQjtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksMkJBQTJCO0FBQUEsTUFDeEMsQ0FBQyxTQUFTLGdGQUFnRjtBQUFBLE1BQzFGLENBQUMsWUFBWSxLQUFLO0FBQUEsTUFDbEIsQ0FBQyxZQUFZLDZCQUE2QixnQ0FBZ0M7QUFBQSxNQUMxRSxDQUFDLFNBQVMsS0FBSztBQUFBLE1BQ2YsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMsMkJBQTJCO0FBQUEsTUFDckMsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsU0FBUyxvQkFBb0I7QUFBQSxNQUM5QixDQUFDLGdCQUFnQixRQUFRLGNBQWM7QUFBQSxNQUN2QyxDQUFDLGVBQWUsT0FBTyxRQUFRO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGtDQUFrQztBQUFBLE1BQzVDLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsVUFBVSxNQUFNO0FBQUEsTUFDakIsQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksNkJBQTZCLDRDQUE0QztBQUFBLE1BQ3RGLENBQUMsU0FBUyx3REFBd0Q7QUFBQSxNQUNsRSxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsWUFBWSx5QkFBeUI7QUFBQSxNQUN0QyxDQUFDLFNBQVMsS0FBSztBQUFBLElBQ2pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLDJCQUEyQjtBQUFBLE1BQ3JDLENBQUMsU0FBUyxvQkFBb0I7QUFBQSxNQUM5QixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsWUFBWSxLQUFLO0FBQUEsTUFDbEIsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsU0FBUyxvQkFBb0I7QUFBQSxNQUM5QixDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksZ0NBQWdDO0FBQUEsTUFDN0MsQ0FBQyxTQUFTLGdGQUFnRjtBQUFBLE1BQzFGLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxZQUFZLHNCQUFzQixnQ0FBZ0M7QUFBQSxNQUNuRSxDQUFDLFNBQVMsS0FBSztBQUFBLE1BQ2YsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFNBQVMsdUNBQXVDO0FBQUEsTUFDakQsQ0FBQyxTQUFTLG9CQUFvQjtBQUFBLE1BQzlCLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1Q0FBdUM7QUFBQSxNQUNqRCxDQUFDLFNBQVMsdUNBQXVDO0FBQUEsTUFDakQsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLE9BQU8sS0FBSztBQUFBLE1BQ2IsQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsZ0NBQWdDO0FBQUEsTUFDMUMsQ0FBQyxZQUFZLGdDQUFnQztBQUFBLE1BQzdDLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsU0FBUyxLQUFLO0FBQUEsSUFDakIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsZUFBZSxPQUFPLFFBQVE7QUFBQSxNQUMvQixDQUFDLG1CQUFtQixRQUFRLHNCQUFzQjtBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFFQSxJQUFNLE1BQVk7QUFBQSxFQUNoQjtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyxnQ0FBZ0M7QUFBQSxNQUMxQyxDQUFDLFNBQVMsZ0RBQWdEO0FBQUEsTUFDMUQsQ0FBQyxTQUFTLG9CQUFvQjtBQUFBLE1BQzlCLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxTQUFTLG9CQUFvQjtBQUFBLE1BQzlCLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksc0JBQXNCLDRDQUE0QztBQUFBLE1BQy9FLENBQUMsU0FBUyxnRkFBZ0Y7QUFBQSxNQUMxRixDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsWUFBWSwyQkFBMkIsZ0NBQWdDO0FBQUEsTUFDeEUsQ0FBQyxTQUFTLEtBQUs7QUFBQSxNQUNmLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsZ0NBQWdDO0FBQUEsTUFDMUMsQ0FBQyxTQUFTLDJCQUEyQjtBQUFBLE1BQ3JDLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxnQkFBZ0IsUUFBUSxjQUFjO0FBQUEsTUFDdkMsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyxnQ0FBZ0M7QUFBQSxNQUMxQyxDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxZQUFZLEtBQUs7QUFBQSxNQUNsQixDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxtQkFBbUIsb0JBQW9CO0FBQUEsTUFDeEMsQ0FBQyxTQUFTLHNEQUFzRDtBQUFBLE1BQ2hFLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxZQUFZLDJCQUEyQjtBQUFBLE1BQ3hDLENBQUMsU0FBUyxLQUFLO0FBQUEsTUFDZixDQUFDLG1CQUFtQixRQUFRLHNCQUFzQjtBQUFBLElBQ3BELENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGdDQUFnQztBQUFBLE1BQzFDLENBQUMsZ0JBQWdCLEtBQUs7QUFBQSxNQUN0QixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxrQkFBa0IsUUFBUSwrQkFBK0I7QUFBQSxNQUMxRCxDQUFDLGlCQUFpQixNQUFNO0FBQUEsSUFDMUIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsU0FBUyw4Q0FBOEM7QUFBQSxNQUN4RCxDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFNBQVMsS0FBSztBQUFBLE1BQ2YsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSwyQkFBMkIsNENBQTRDO0FBQUEsTUFDcEYsQ0FBQyxTQUFTLHNGQUFzRjtBQUFBLE1BQ2hHLENBQUMsWUFBWSwyQkFBMkIsZ0NBQWdDO0FBQUEsTUFDeEUsQ0FBQyxZQUFZLEtBQUs7QUFBQSxNQUNsQixDQUFDLG1CQUFtQixRQUFRLHNCQUFzQjtBQUFBLElBQ3BELENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsU0FBUyx1Q0FBdUM7QUFBQSxNQUNqRCxDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLGVBQWUsT0FBTyxRQUFRO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVDQUF1QztBQUFBLE1BQ2pELENBQUMsU0FBUyxnQ0FBZ0M7QUFBQSxNQUMxQyxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLFNBQVMsS0FBSztBQUFBLE1BQ2YsQ0FBQyxpQkFBaUIsTUFBTTtBQUFBLElBQzFCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVDQUF1QztBQUFBLE1BQ2pELENBQUMsWUFBWSxnQ0FBZ0M7QUFBQSxNQUM3QyxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsWUFBWSxLQUFLO0FBQUEsTUFDbEIsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLE9BQU8sS0FBSztBQUFBLE1BQ2IsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsZUFBZSxPQUFPLFFBQVE7QUFBQSxJQUNqQyxDQUFDO0FBQUEsRUFDSDtBQUNGO0FBRUEsSUFBTSxNQUFZO0FBQUEsRUFDaEI7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsd0NBQXdDLHdDQUE4QjtBQUFBLE1BQ2hGLENBQUMsU0FBUyxzQ0FBc0Msd0NBQThCO0FBQUEsTUFDOUUsQ0FBQyxZQUFZLHNDQUFzQyx3Q0FBOEI7QUFBQSxJQUNuRixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLGVBQWUsS0FBSztBQUFBLE1BQ3JCLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLDJCQUEyQjtBQUFBLE1BQ3JDLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFlBQVksS0FBSztBQUFBLE1BQ2xCLENBQUMsU0FBUyxvQkFBb0I7QUFBQSxJQUNoQyxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSw2QkFBNkIsNENBQTRDO0FBQUEsTUFDdEYsQ0FBQyxTQUFTLGdDQUFnQztBQUFBLE1BQzFDLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxZQUFZLHlCQUF5QjtBQUFBLE1BQ3RDLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLDJCQUEyQjtBQUFBLE1BQ3JDLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsU0FBUyxnQ0FBZ0M7QUFBQSxNQUMxQyxDQUFDLFlBQVksS0FBSztBQUFBLE1BQ2xCLENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxZQUFZLEtBQUs7QUFBQSxNQUNsQixDQUFDLFlBQVksMkJBQTJCO0FBQUEsTUFDeEMsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxtQkFBbUIsT0FBTyxzQkFBc0I7QUFBQSxJQUNuRCxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsMkJBQTJCO0FBQUEsTUFDckMsQ0FBQyxZQUFZLG9CQUFvQjtBQUFBLE1BQ2pDLENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxTQUFTLG9CQUFvQjtBQUFBLElBQ2hDLENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFFQSxJQUFNLE1BQVk7QUFBQSxFQUNoQjtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSwyQkFBMkI7QUFBQSxNQUN4QyxDQUFDLGdCQUFnQixLQUFLO0FBQUEsTUFDdEIsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsWUFBWSw2QkFBNkIsZ0NBQWdDO0FBQUEsTUFDMUUsQ0FBQyxTQUFTLEtBQUs7QUFBQSxNQUNmLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsK0RBQStEO0FBQUEsTUFDekUsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFNBQVMsMkJBQTJCO0FBQUEsTUFDckMsQ0FBQyxnQkFBZ0IsUUFBUSxjQUFjO0FBQUEsTUFDdkMsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUywyQkFBMkI7QUFBQSxNQUNyQyxDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFVBQVUsTUFBTTtBQUFBLE1BQ2pCLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHNCQUFzQiw0Q0FBNEM7QUFBQSxNQUMvRSxDQUFDLFNBQVMsb0JBQW9CO0FBQUEsTUFDOUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLFlBQVkseUJBQXlCO0FBQUEsTUFDdEMsQ0FBQyxTQUFTLEtBQUs7QUFBQSxJQUNqQixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFNBQVMsb0RBQW9EO0FBQUEsTUFDOUQsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLGtCQUFrQixRQUFRLCtCQUErQjtBQUFBLE1BQzFELENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLGVBQWUsT0FBTyxRQUFRO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLDJCQUEyQjtBQUFBLE1BQ3JDLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsVUFBVSxNQUFNO0FBQUEsTUFDakIsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksMkJBQTJCLDRDQUE0QztBQUFBLE1BQ3BGLENBQUMsU0FBUyxnRUFBZ0U7QUFBQSxNQUMxRSxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsWUFBWSxzQkFBc0IsZ0NBQWdDO0FBQUEsTUFDbkUsQ0FBQyxTQUFTLEtBQUs7QUFBQSxNQUNmLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsU0FBUyxvQkFBb0I7QUFBQSxNQUM5QixDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGdDQUFnQztBQUFBLE1BQzFDLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFlBQVksTUFBTTtBQUFBLE1BQ25CLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyxnQ0FBZ0M7QUFBQSxNQUMxQyxDQUFDLFlBQVksZ0NBQWdDO0FBQUEsTUFDN0MsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxNQUFNO0FBQUEsTUFDbkIsQ0FBQyxTQUFTLEtBQUs7QUFBQSxJQUNqQixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE1BQU07QUFBQSxNQUNuQixDQUFDLE9BQU8sS0FBSztBQUFBLE1BQ2IsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLE1BQy9CLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUVBLElBQU0sV0FBaUI7QUFBQSxFQUNyQjtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sNENBQXlDO0FBQUEsTUFDN0QsQ0FBQyxlQUFlLE9BQU8sYUFBYTtBQUFBLElBQ3RDLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5Qiw0Q0FBNEM7QUFBQSxNQUNsRixDQUFDLGdCQUFnQixPQUFPLGFBQWE7QUFBQSxNQUNyQyxDQUFDLFlBQVksT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQyxZQUFZLHlCQUF5QixnQ0FBZ0M7QUFBQSxNQUN0RSxDQUFDLG1CQUFtQixRQUFRLHVDQUFvQztBQUFBLElBQ2xFLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFlBQVksT0FBTyw0Q0FBeUM7QUFBQSxNQUM3RCxDQUFDLGtCQUFrQixPQUFPLGdEQUE2QztBQUFBLE1BQ3ZFLENBQUMsZUFBZSxPQUFPLHlCQUFzQjtBQUFBLElBQy9DLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxlQUFlLE9BQU8seUNBQXNDO0FBQUEsTUFDN0QsQ0FBQyxPQUFPLE9BQU8sYUFBYTtBQUFBLE1BQzVCLENBQUMsaUJBQWlCLE9BQU8sYUFBYTtBQUFBLElBQ3hDLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5Qiw0Q0FBNEM7QUFBQSxNQUNsRixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLG9CQUFvQixnQ0FBZ0M7QUFBQSxNQUNqRSxDQUFDLFlBQVksT0FBTyw0Q0FBeUM7QUFBQSxNQUM3RCxDQUFDLGdCQUFnQixPQUFPLCtDQUE0QztBQUFBLElBQ3RFLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsV0FBVyxrQkFBa0I7QUFBQSxNQUM5QixDQUFDLFlBQVksT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQyxrQkFBa0IsT0FBTyxnREFBNkM7QUFBQSxNQUN2RSxDQUFDLGlCQUFpQixPQUFPLGFBQWE7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDRDQUF5QztBQUFBLE1BQzdELENBQUMsV0FBVyxPQUFPLGFBQWE7QUFBQSxNQUNoQyxDQUFDLGVBQWUsT0FBTyx5QkFBc0I7QUFBQSxJQUMvQyxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsbUJBQW1CLGtCQUFrQjtBQUFBLE1BQ3RDLENBQUMsU0FBUyw4QkFBOEI7QUFBQSxNQUN4QyxDQUFDLFlBQVksMkJBQTJCLGdDQUFnQztBQUFBLE1BQ3hFLENBQUMsWUFBWSxPQUFPLGFBQWE7QUFBQSxNQUNqQyxDQUFDLG1CQUFtQixRQUFRLHVDQUFvQztBQUFBLElBQ2xFLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsZ0JBQWdCLGtCQUFrQjtBQUFBLE1BQ25DLENBQUMsWUFBWSxPQUFPLDRDQUF5QztBQUFBLE1BQzdELENBQUMsa0JBQWtCLE9BQU8sZ0RBQTZDO0FBQUEsSUFDekUsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLDhCQUE4QjtBQUFBLE1BQ3hDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLGVBQWUsT0FBTyx5Q0FBc0M7QUFBQSxNQUM3RCxDQUFDLGFBQWEsT0FBTyxhQUFhO0FBQUEsTUFDbEMsQ0FBQyxpQkFBaUIsT0FBTyxhQUFhO0FBQUEsSUFDeEMsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsNEJBQTRCO0FBQUEsTUFDdEMsQ0FBQyxZQUFZLDJCQUEyQiw2Q0FBd0M7QUFBQSxNQUNoRixDQUFDLFlBQVksT0FBTyw0Q0FBeUM7QUFBQSxNQUM3RCxDQUFDLGdCQUFnQixPQUFPLCtDQUE0QztBQUFBLE1BQ3BFLENBQUMsbUJBQW1CLFFBQVEsdUNBQW9DO0FBQUEsSUFDbEUsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsa0JBQWtCLE9BQU8sZ0RBQTZDO0FBQUEsTUFDdkUsQ0FBQyxlQUFlLE9BQU8sYUFBYTtBQUFBLElBQ3RDLENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFFQSxJQUFNLFdBQWlCO0FBQUEsRUFDckI7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHlCQUF5QjtBQUFBLE1BQ25DLENBQUMsbUJBQW1CLE9BQU8sdUNBQW9DO0FBQUEsSUFDakUsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsMkNBQTJDO0FBQUEsTUFDckQsQ0FBQyxTQUFTLDJDQUEyQztBQUFBLE1BQ3JELENBQUMsWUFBWSwyQ0FBMkM7QUFBQSxNQUN4RCxDQUFDLGlCQUFpQixPQUFPLGFBQWE7QUFBQSxJQUN4QyxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE9BQU8sNENBQXlDO0FBQUEsTUFDN0QsQ0FBQyxnQkFBZ0IsT0FBTywrQ0FBNEM7QUFBQSxNQUNwRSxDQUFDLG1CQUFtQixPQUFPLHVDQUFvQztBQUFBLElBQ2pFLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sNENBQXlDO0FBQUEsTUFDN0QsQ0FBQyxrQkFBa0IsT0FBTyxnREFBNkM7QUFBQSxNQUN2RSxDQUFDLGVBQWUsT0FBTyx5QkFBc0I7QUFBQSxJQUMvQyxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsbUJBQW1CLHVCQUF1QjtBQUFBLE1BQzNDLENBQUMsU0FBUyxtQ0FBbUM7QUFBQSxNQUM3QyxDQUFDLFlBQVksMkJBQTJCLGdDQUFnQztBQUFBLE1BQ3hFLENBQUMsZUFBZSxPQUFPLHlDQUFzQztBQUFBLE1BQzdELENBQUMsbUJBQW1CLE9BQU8sdUNBQW9DO0FBQUEsSUFDakUsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDRDQUF5QztBQUFBLE1BQzdELENBQUMsYUFBYSxPQUFPLGFBQWE7QUFBQSxNQUNsQyxDQUFDLGVBQWUsT0FBTyxhQUFhO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyw0QkFBNEI7QUFBQSxNQUN0QyxDQUFDLFlBQVksT0FBTyxhQUFhO0FBQUEsTUFDakMsQ0FBQyxtQkFBbUIsT0FBTyx1Q0FBb0M7QUFBQSxJQUNqRSxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFlBQVksdUJBQXVCO0FBQUEsTUFDcEMsQ0FBQyxZQUFZLE9BQU8sNENBQXlDO0FBQUEsTUFDN0QsQ0FBQyxpQkFBaUIsT0FBTyxhQUFhO0FBQUEsSUFDeEMsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsbUJBQW1CLE9BQU8sdUNBQW9DO0FBQUEsSUFDakUsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxrQkFBa0I7QUFBQSxNQUMvQixDQUFDLG1CQUFtQixPQUFPLHVDQUFvQztBQUFBLElBQ2pFLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxJQUM5QixDQUFDO0FBQUEsRUFDSDtBQUNGO0FBRUEsSUFBTSxPQUFhO0FBQUEsRUFDakI7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLGNBQWMsa0JBQWtCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLG1CQUFtQixRQUFRLHNCQUFzQjtBQUFBLElBQ3BELENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLG9CQUFvQix1REFBdUQ7QUFBQSxNQUN4RixDQUFDLFNBQVMseUNBQXlDO0FBQUEsTUFDbkQsQ0FBQyxZQUFZLG9CQUFvQixtQ0FBOEI7QUFBQSxNQUMvRCxDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxNQUMvQyxDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsY0FBYyxvQkFBb0Isb0JBQW9CO0FBQUEsTUFDdkQsQ0FBQyxTQUFTLDJCQUEyQixhQUFhO0FBQUEsTUFDbEQsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxtQkFBbUIsYUFBYTtBQUFBLE1BQ2pDLENBQUMsZ0JBQWdCLEtBQUs7QUFBQSxNQUN0QixDQUFDLFlBQVksMkJBQTJCLHlDQUFvQztBQUFBLE1BQzVFLENBQUMsT0FBTyxPQUFPLFVBQVU7QUFBQSxNQUN6QixDQUFDLFlBQVksT0FBTywrQkFBMEI7QUFBQSxNQUM5QyxDQUFDLGdCQUFnQixLQUFLO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLDRCQUE0QjtBQUFBLE1BQ3RDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLGdCQUFnQixPQUFPLGNBQWM7QUFBQSxNQUN0QyxDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLGlCQUFpQixLQUFLO0FBQUEsSUFDekIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsb0JBQW9CLDJEQUFzRDtBQUFBLE1BQ3BGLENBQUMsWUFBWSx5QkFBeUIsbUNBQThCO0FBQUEsTUFDcEUsQ0FBQyxnQkFBZ0IsT0FBTyw4QkFBOEI7QUFBQSxNQUN0RCxDQUFDLGdCQUFnQixPQUFPLG1DQUFtQztBQUFBLE1BQzNELENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLGNBQWMsa0JBQWtCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLGdDQUFnQyxhQUFhO0FBQUEsTUFDdkQsQ0FBQyxPQUFPLE9BQU8sVUFBVTtBQUFBLE1BQ3pCLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFdBQVcsa0JBQWtCO0FBQUEsTUFDOUIsQ0FBQyxZQUFZLDJCQUEyQiwyREFBc0Q7QUFBQSxNQUM5RixDQUFDLFdBQVcsS0FBSztBQUFBLE1BQ2pCLENBQUMsWUFBWSxLQUFLO0FBQUEsTUFDbEIsQ0FBQyxnQkFBZ0IsS0FBSztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsY0FBYyxrQkFBa0I7QUFBQSxNQUNqQyxDQUFDLFNBQVMscUNBQXFDO0FBQUEsTUFDL0MsQ0FBQyxjQUFjLHlCQUF5QixvQkFBb0I7QUFBQSxNQUM1RCxDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxNQUMvQyxDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5Qix1REFBdUQ7QUFBQSxNQUM3RixDQUFDLFNBQVMseUNBQXlDO0FBQUEsTUFDbkQsQ0FBQyxZQUFZLG9CQUFvQix5Q0FBb0M7QUFBQSxNQUNyRSxDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLG1CQUFtQixRQUFRLHNCQUFzQjtBQUFBLElBQ3BELENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGdDQUFnQyxhQUFhO0FBQUEsTUFDdkQsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyxvQkFBb0IsMkRBQXNEO0FBQUEsTUFDcEYsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxlQUFlLE9BQU8sUUFBUTtBQUFBLElBQ2pDLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5QixtQ0FBOEI7QUFBQSxNQUNwRSxDQUFDLFNBQVMsb0JBQW9CLGFBQWE7QUFBQSxNQUMzQyxDQUFDLFlBQVkseUJBQXlCLDJEQUFzRDtBQUFBLE1BQzVGLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDekQsQ0FBQyxnQkFBZ0IsS0FBSztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsY0FBYyx5QkFBeUI7QUFBQSxNQUN4QyxDQUFDLFNBQVMscUNBQXFDO0FBQUEsTUFDL0MsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxNQUMvQyxDQUFDLGlCQUFpQixLQUFLO0FBQUEsSUFDekIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLG1CQUFtQixrQkFBa0I7QUFBQSxNQUN0QyxDQUFDLFNBQVMscUNBQXFDLGFBQWE7QUFBQSxNQUM1RCxDQUFDLFlBQVksa0NBQWtDLHlDQUFvQztBQUFBLE1BQ25GLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZ0JBQWdCLE9BQU8sY0FBYztBQUFBLElBQ3hDLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMseUJBQXlCLDJEQUFzRDtBQUFBLE1BQ3pGLENBQUMsZ0JBQWdCLE9BQU8sOEJBQThCO0FBQUEsTUFDdEQsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSxnQ0FBZ0MsbUNBQThCO0FBQUEsTUFDM0UsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSx5QkFBeUIsMkRBQXNEO0FBQUEsTUFDNUYsQ0FBQyxZQUFZLEtBQUs7QUFBQSxNQUNsQixDQUFDLGdCQUFnQixLQUFLO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUVBLElBQU0sT0FBYTtBQUFBLEVBQ2pCO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx5Q0FBeUM7QUFBQSxNQUNuRCxDQUFDLFNBQVMsMkJBQTJCLGFBQWE7QUFBQSxNQUNsRCxDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLG1CQUFtQixPQUFPLHNCQUFzQjtBQUFBLElBQ25ELENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxtQkFBbUIsa0JBQWtCO0FBQUEsTUFDdEMsQ0FBQyxTQUFTLHlCQUF5QiwyREFBc0Q7QUFBQSxNQUN6RixDQUFDLFlBQVksMkJBQTJCLGtDQUFrQztBQUFBLE1BQzFFLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSwyQkFBMkIsa0NBQWtDO0FBQUEsTUFDMUUsQ0FBQyxnQkFBZ0IsT0FBTyx3QkFBd0I7QUFBQSxNQUNoRCxDQUFDLGdCQUFnQixPQUFPLDhCQUE4QjtBQUFBLE1BQ3RELENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx5QkFBeUIsMkRBQXNEO0FBQUEsTUFDekYsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSxvQkFBb0IsNENBQTRDO0FBQUEsTUFDN0UsQ0FBQyxTQUFTLGtDQUFrQyxhQUFhO0FBQUEsTUFDekQsQ0FBQyxZQUFZLHlCQUF5QiwyREFBc0Q7QUFBQSxNQUM1RixDQUFDLGtCQUFrQixPQUFPLCtCQUErQjtBQUFBLE1BQ3pELENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLGlCQUFpQixLQUFLO0FBQUEsSUFDekIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVkseUJBQXlCLDZDQUF3QztBQUFBLE1BQzlFLENBQUMsZ0JBQWdCLE9BQU8sd0JBQXdCO0FBQUEsTUFDaEQsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLElBQ2pELENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMseUNBQXlDO0FBQUEsTUFDbkQsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLG1CQUFtQixrQkFBa0I7QUFBQSxNQUN0QyxDQUFDLFNBQVMsNEJBQTRCO0FBQUEsTUFDdEMsQ0FBQyxZQUFZLG9CQUFvQixrQ0FBa0M7QUFBQSxNQUNuRSxDQUFDLGtCQUFrQixPQUFPLCtCQUErQjtBQUFBLE1BQ3pELENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLG9CQUFvQiwyREFBc0Q7QUFBQSxNQUNwRixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5QiwyQ0FBd0M7QUFBQSxNQUM5RSxDQUFDLFdBQVcsa0JBQWtCO0FBQUEsTUFDOUIsQ0FBQyxnQkFBZ0IsT0FBTyw4QkFBOEI7QUFBQSxNQUN0RCxDQUFDLGtCQUFrQixPQUFPLCtCQUErQjtBQUFBLE1BQ3pELENBQUMsZ0JBQWdCLEtBQUs7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5QixtQ0FBOEI7QUFBQSxNQUNwRSxDQUFDLFNBQVMsdUNBQXVDLGFBQWE7QUFBQSxNQUM5RCxDQUFDLFlBQVkseUJBQXlCLDRDQUE0QztBQUFBLE1BQ2xGLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDekQsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsT0FBTyxzQkFBc0I7QUFBQSxJQUNuRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsbUJBQW1CLGtCQUFrQjtBQUFBLE1BQ3RDLENBQUMsZ0JBQWdCLE9BQU8sd0JBQXdCO0FBQUEsTUFDaEQsQ0FBQyxZQUFZLHlCQUF5QixrQ0FBa0M7QUFBQSxNQUN4RSxDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxNQUMvQyxDQUFDLFlBQVksS0FBSztBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMseUNBQXlDO0FBQUEsTUFDbkQsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksb0JBQW9CLDRDQUE0QztBQUFBLE1BQzdFLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFlBQVkseUJBQXlCLGtDQUFrQztBQUFBLE1BQ3hFLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDekQsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyxzRUFBc0U7QUFBQSxNQUNoRixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSx5QkFBeUIsNEJBQTRCO0FBQUEsTUFDbEUsQ0FBQyxXQUFXLEtBQUs7QUFBQSxNQUNqQixDQUFDLFlBQVkseUJBQXlCLHVEQUFrRDtBQUFBLE1BQ3hGLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsbUJBQW1CLGtCQUFrQjtBQUFBLE1BQ3RDLENBQUMsU0FBUyw4Q0FBOEM7QUFBQSxNQUN4RCxDQUFDLFlBQVksdUJBQXVCO0FBQUEsTUFDcEMsQ0FBQyxnQkFBZ0IsT0FBTyw4QkFBOEI7QUFBQSxNQUN0RCxDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxJQUNqRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVkseUJBQXlCLDRDQUE0QztBQUFBLE1BQ2xGLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFlBQVkseUJBQXlCLDJEQUFzRDtBQUFBLE1BQzVGLENBQUMsT0FBTyxLQUFLO0FBQUEsTUFDYixDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxNQUMvQyxDQUFDLGlCQUFpQixLQUFLO0FBQUEsSUFDekIsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUVBLElBQU0sT0FBYTtBQUFBLEVBQ2pCO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxlQUFlLEtBQUs7QUFBQSxJQUN2QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyxxQ0FBcUM7QUFBQSxNQUMvQyxDQUFDLFlBQVksMkJBQTJCLGtDQUFrQztBQUFBLE1BQzFFLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDekQsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsT0FBTyxzQkFBc0I7QUFBQSxJQUNuRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLGdCQUFnQixPQUFPLHdCQUF3QjtBQUFBLE1BQ2hELENBQUMsWUFBWSx5QkFBeUIsNEJBQTRCO0FBQUEsTUFDbEUsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5Q0FBeUMsd0NBQThCO0FBQUEsTUFDakYsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5Q0FBeUMsd0NBQThCO0FBQUEsTUFDakYsQ0FBQyxZQUFZLHlDQUF5Qyx3Q0FBOEI7QUFBQSxNQUNwRixDQUFDLGdCQUFnQixPQUFPLDhCQUE4QjtBQUFBLE1BQ3RELENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLElBQ2pELENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsT0FBTyxzQkFBc0I7QUFBQSxJQUNuRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSx5QkFBeUIsNENBQTRDO0FBQUEsTUFDbEYsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxvQkFBb0Isa0NBQWtDO0FBQUEsTUFDbkUsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyxvQkFBb0IsYUFBYTtBQUFBLE1BQzNDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVksb0JBQW9CLHVEQUF1RDtBQUFBLE1BQ3hGLENBQUMsU0FBUyxrREFBa0Q7QUFBQSxNQUM1RCxDQUFDLFlBQVkseUJBQXlCLHlDQUF5QztBQUFBLE1BQy9FLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDekQsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsUUFBUSxzQkFBc0I7QUFBQSxJQUNwRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5Q0FBeUM7QUFBQSxNQUNuRCxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSx5QkFBeUIsbUNBQThCO0FBQUEsTUFDcEUsQ0FBQyxTQUFTLG9CQUFvQiwyREFBc0Q7QUFBQSxNQUNwRixDQUFDLGVBQWUsS0FBSztBQUFBLE1BQ3JCLENBQUMsWUFBWSxLQUFLO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLGdDQUFnQyxhQUFhO0FBQUEsTUFDdkQsQ0FBQyxTQUFTLHFDQUFxQztBQUFBLE1BQy9DLENBQUMsZ0JBQWdCLGtCQUFrQjtBQUFBLE1BQ25DLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsbUJBQW1CLFFBQVEsc0JBQXNCO0FBQUEsSUFDcEQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVkseUJBQXlCLG1DQUE4QjtBQUFBLE1BQ3BFLENBQUMsU0FBUyxxQ0FBcUM7QUFBQSxNQUMvQyxDQUFDLFlBQVksMkJBQTJCLGtDQUFrQztBQUFBLE1BQzFFLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCLDJEQUFzRDtBQUFBLE1BQ3pGLENBQUMsU0FBUyx5Q0FBeUM7QUFBQSxNQUNuRCxDQUFDLFNBQVMseUJBQXlCLGFBQWE7QUFBQSxNQUNoRCxDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLE9BQU8sS0FBSztBQUFBLElBQ2YsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFlBQVkseUJBQXlCLHlDQUF5QztBQUFBLE1BQy9FLENBQUMsZ0JBQWdCLE9BQU8sd0JBQXdCO0FBQUEsTUFDaEQsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLG1CQUFtQix1QkFBdUI7QUFBQSxNQUMzQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLDJCQUEyQixrQ0FBa0M7QUFBQSxNQUMxRSxDQUFDLGtCQUFrQixPQUFPLCtCQUErQjtBQUFBLE1BQ3pELENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLE1BQzVCLENBQUMsU0FBUyxrQkFBa0I7QUFBQSxNQUM1QixDQUFDLFlBQVksT0FBTywyQkFBMkI7QUFBQSxNQUMvQyxDQUFDLGVBQWUsT0FBTyx3QkFBd0I7QUFBQSxJQUNqRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsWUFBWSx5QkFBeUIsdURBQXVEO0FBQUEsTUFDN0YsQ0FBQyxXQUFXLGtCQUFrQjtBQUFBLE1BQzlCLENBQUMsWUFBWSx5QkFBeUIsa0NBQWtDO0FBQUEsTUFDeEUsQ0FBQyxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsSUFDM0QsQ0FBQztBQUFBLEVBQ0g7QUFDRjtBQUVBLElBQU0sT0FBYTtBQUFBLEVBQ2pCO0FBQUE7QUFBQSxJQUNFLENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxtQkFBbUIsa0JBQWtCO0FBQUEsTUFDdEMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSwyQkFBMkIsa0NBQWtDO0FBQUEsTUFDMUUsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxtQkFBbUIsT0FBTyxzQkFBc0I7QUFBQSxJQUNuRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyw4QkFBOEI7QUFBQSxNQUN4QyxDQUFDLFNBQVMscUNBQXFDO0FBQUEsTUFDL0MsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxrQkFBa0IsT0FBTywrQkFBK0I7QUFBQSxNQUN6RCxDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxnQkFBZ0IsT0FBTyx3QkFBd0I7QUFBQSxNQUNoRCxDQUFDLFlBQVkseUJBQXlCLGtDQUFrQztBQUFBLE1BQ3hFLENBQUMsZ0JBQWdCLE9BQU8sOEJBQThCO0FBQUEsTUFDdEQsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxnQkFBZ0IsS0FBSztBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1QkFBdUI7QUFBQSxNQUNqQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxTQUFTLHVDQUF1QywrQkFBMEI7QUFBQSxNQUMzRSxDQUFDLFlBQVksdUNBQXVDLCtCQUEwQjtBQUFBLE1BQzlFLENBQUMsa0JBQWtCLE9BQU8sK0JBQStCO0FBQUEsTUFDekQsQ0FBQyxtQkFBbUIsT0FBTyxzQkFBc0I7QUFBQSxJQUNuRCxDQUFDO0FBQUEsSUFDRCxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx1Q0FBdUMsK0JBQTBCO0FBQUEsTUFDM0UsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFdBQVcsS0FBSztBQUFBLE1BQ2pCLENBQUMsWUFBWSx5QkFBeUIsNENBQTRDO0FBQUEsTUFDbEYsQ0FBQyxlQUFlLE9BQU8sd0JBQXdCO0FBQUEsTUFDL0MsQ0FBQyxPQUFPLEtBQUs7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQTtBQUFBO0FBQUEsSUFDRSxDQUFDLE9BQU87QUFBQSxNQUNOLENBQUMsU0FBUyx5QkFBeUI7QUFBQSxNQUNuQyxDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLE9BQU8sMkJBQTJCO0FBQUEsTUFDL0MsQ0FBQyxpQkFBaUIsS0FBSztBQUFBLElBQ3pCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxZQUFZLHlCQUF5Qiw0Q0FBNEM7QUFBQSxNQUNsRixDQUFDLFNBQVMsOEJBQThCO0FBQUEsTUFDeEMsQ0FBQyxZQUFZLHVCQUF1QjtBQUFBLE1BQ3BDLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsZ0JBQWdCLE9BQU8sOEJBQThCO0FBQUEsTUFDdEQsQ0FBQyxrQkFBa0IsT0FBTywrQkFBK0I7QUFBQSxNQUN6RCxDQUFDLGVBQWUsS0FBSztBQUFBLElBQ3ZCLENBQUM7QUFBQSxJQUNELENBQUMsT0FBTztBQUFBLE1BQ04sQ0FBQyxnQkFBZ0IsT0FBTyx3QkFBd0I7QUFBQSxNQUNoRCxDQUFDLFlBQVkseUJBQXlCLGtDQUFrQztBQUFBLE1BQ3hFLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsZ0JBQWdCLEtBQUs7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxTQUFTLDhCQUE4QjtBQUFBLE1BQ3hDLENBQUMsWUFBWSxPQUFPLDJCQUEyQjtBQUFBLE1BQy9DLENBQUMsZUFBZSxLQUFLO0FBQUEsSUFDdkIsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsdUJBQXVCO0FBQUEsTUFDakMsQ0FBQyxZQUFZLGtCQUFrQjtBQUFBLE1BQy9CLENBQUMsZUFBZSxPQUFPLHdCQUF3QjtBQUFBLE1BQy9DLENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxTQUFTLHVCQUF1QjtBQUFBLE1BQ2pDLENBQUMsaUJBQWlCLEtBQUs7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFBQTtBQUFBLElBQ0UsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMseUJBQXlCO0FBQUEsTUFDbkMsQ0FBQyxZQUFZLGtCQUFrQjtBQUFBLE1BQy9CLENBQUMsbUJBQW1CLE9BQU8sc0JBQXNCO0FBQUEsSUFDbkQsQ0FBQztBQUFBLElBQ0QsQ0FBQyxPQUFPO0FBQUEsTUFDTixDQUFDLFNBQVMsa0JBQWtCO0FBQUEsTUFDNUIsQ0FBQyxTQUFTLGtCQUFrQjtBQUFBLElBQzlCLENBQUM7QUFBQSxFQUNIO0FBQ0Y7QUFJQSxJQUFNLGVBQXNDO0FBQUEsRUFDMUMsTUFBTSxFQUFFLEtBQUssT0FBTyxPQUFPLE9BQU8sT0FBTyxJQUFJO0FBQUEsRUFDN0MsTUFBTSxFQUFFLEtBQUssT0FBTyxPQUFPLE9BQU8sT0FBTyxJQUFJO0FBQUEsRUFDN0MsTUFBTSxFQUFFLEtBQUssT0FBTyxPQUFPLE9BQU8sT0FBTyxJQUFJO0FBQUEsRUFDN0MsTUFBTSxFQUFFLEtBQUssT0FBTyxPQUFPLE9BQU8sT0FBTyxJQUFJO0FBQy9DO0FBQ0EsSUFBTSxPQUFpQyxFQUFFLEtBQUssQ0FBQyxNQUFNLE1BQU0sTUFBTSxJQUFJLEdBQUcsU0FBUyxDQUFDLE1BQU0sTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksR0FBRyxNQUFNLENBQUMsSUFBSSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRTtBQUVySixJQUFNLGFBQThCO0FBQUEsRUFDekMsSUFBSTtBQUFBLEVBQ0osTUFBTTtBQUFBLEVBQ04sUUFBUTtBQUFBLEVBQ1IsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLEVBQ1YsT0FBTztBQUFBLEVBQ1AsYUFBYSxDQUFDLENBQUM7QUFBQSxFQUNmLE9BQU87QUFBQSxFQUNQLFNBQVM7QUFBQSxJQUNQLEVBQUUsS0FBSyxPQUFPLE9BQU8sVUFBVSxTQUFTLE9BQU8sU0FBUztBQUFBLE1BQ3RELEVBQUUsT0FBTyxPQUFPLE9BQU8sNEJBQXVCO0FBQUEsTUFDOUMsRUFBRSxPQUFPLFNBQVMsT0FBTyw0QkFBdUI7QUFBQSxNQUNoRCxFQUFFLE9BQU8sTUFBTSxPQUFPLHlCQUF5QjtBQUFBLE1BQy9DLEVBQUUsT0FBTyxNQUFNLE9BQU8seUJBQXlCO0FBQUEsTUFDL0MsRUFBRSxPQUFPLE1BQU0sT0FBTyx5QkFBeUI7QUFBQSxNQUMvQyxFQUFFLE9BQU8sTUFBTSxPQUFPLGdDQUFnQztBQUFBLElBQ3hELEVBQUU7QUFBQSxFQUNKO0FBQUEsRUFDQSxNQUFNLEdBQUc7QUFDUCxVQUFNLE1BQU0sS0FBSyxFQUFFLE9BQU8sS0FBSyxLQUFLLEtBQUs7QUFDekMsVUFBTSxPQUFPLElBQUksU0FBUyxJQUFJLFdBQVcsSUFBSSxDQUFDLENBQUMsVUFBSyxJQUFJLElBQUksU0FBUyxDQUFDLENBQUMsS0FBSyxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQzdGLFdBQU8sUUFBUSxnQkFBZ0IsTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLGFBQWEsQ0FBQyxDQUFDLEdBQUcsR0FBRztBQUFBLE1BQ3ZFLEdBQUc7QUFBQSxNQUNIO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0E7QUFDRjtBQUVPLElBQU0sV0FBNEI7QUFBQSxFQUN2QyxJQUFJO0FBQUEsRUFDSixNQUFNO0FBQUEsRUFDTixRQUFRO0FBQUEsRUFDUixRQUFRO0FBQUEsRUFDUixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsRUFDVixPQUFPO0FBQUEsRUFDUCxhQUFhLENBQUMsQ0FBQztBQUFBLEVBQ2YsT0FBTztBQUFBLEVBQ1AsU0FBUyxDQUFDO0FBQUEsRUFDVixPQUFPLE1BQU0sUUFBUSxhQUFhLGNBQWMsQ0FBQyxFQUFFLEtBQUssT0FBTyxPQUFPLE9BQU8sT0FBTyxJQUFJLENBQUMsR0FBRyxHQUFHLEtBQUs7QUFBQSxFQUNwRztBQUNGO0FBRU8sSUFBTSxpQkFBa0M7QUFBQSxFQUM3QyxJQUFJO0FBQUEsRUFDSixNQUFNO0FBQUEsRUFDTixRQUFRO0FBQUEsRUFDUixRQUFRO0FBQUEsRUFDUixTQUFTO0FBQUEsRUFDVCxVQUFVO0FBQUEsRUFDVixPQUFPO0FBQUEsRUFDUCxhQUFhLENBQUMsQ0FBQztBQUFBLEVBQ2YsT0FBTztBQUFBLEVBQ1AsU0FBUztBQUFBLElBQ1AsRUFBRSxLQUFLLFFBQVEsT0FBTyxlQUFlLFNBQVMsS0FBSyxTQUFTO0FBQUEsTUFDMUQsRUFBRSxPQUFPLEtBQUssT0FBTyxjQUFjO0FBQUEsTUFBRyxFQUFFLE9BQU8sS0FBSyxPQUFPLGNBQWM7QUFBQSxNQUFHLEVBQUUsT0FBTyxLQUFLLE9BQU8sZUFBZTtBQUFBLElBQ2xILEVBQUU7QUFBQSxJQUNGLEVBQUUsS0FBSyxRQUFRLE9BQU8scUJBQXFCLFNBQVMsTUFBTSxTQUFTO0FBQUEsTUFDakUsRUFBRSxPQUFPLE1BQU0sT0FBTyxvQ0FBb0M7QUFBQSxNQUFHLEVBQUUsT0FBTyxPQUFPLE9BQU8seUJBQXlCO0FBQUEsSUFDL0csRUFBRTtBQUFBLEVBQ0o7QUFBQSxFQUNBLE1BQU0sR0FBRztBQUNQLFVBQU0sSUFBSSxLQUFLLElBQUksR0FBRyxLQUFLLElBQUksR0FBRyxPQUFPLEVBQUUsUUFBUSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzNELFVBQU0sU0FBa0IsTUFBTSxLQUFLLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxHQUFHLE9BQU8sRUFBRSxLQUFLLEtBQUssSUFBSSxDQUFDLElBQUksT0FBTyxJQUFJLElBQUksUUFBUSxJQUFJLENBQUMsS0FBSyxRQUFRLE9BQU8sU0FBUyxFQUFFO0FBQzdJLFNBQUssRUFBRSxRQUFRLFVBQVUsS0FBTSxRQUFPLEtBQUssRUFBRSxLQUFLLE1BQU0sT0FBTyxRQUFRLE9BQU8sU0FBUyxDQUFDO0FBQ3hGLFdBQU8sUUFBUSxtQkFBbUIsbUJBQW1CLFFBQVEsR0FBRztBQUFBLE1BQzlELEdBQUc7QUFBQSxNQUNIO0FBQUEsTUFDQTtBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBO0FBQ0Y7QUFFTyxJQUFNLFlBQTZCO0FBQUEsRUFDeEMsSUFBSTtBQUFBLEVBQ0osTUFBTTtBQUFBLEVBQ04sUUFBUTtBQUFBLEVBQ1IsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUFBLEVBQ1QsVUFBVTtBQUFBLEVBQ1YsT0FBTztBQUFBLEVBQ1AsYUFBYSxDQUFDLENBQUM7QUFBQSxFQUNmLE9BQU87QUFBQSxFQUNQLFNBQVMsQ0FBQztBQUFBLEVBQ1YsT0FBTyxNQUFNLFFBQVEsY0FBYyxjQUFjO0FBQUEsSUFDL0MsRUFBRSxLQUFLLE1BQU0sT0FBTyxVQUFVLE9BQU8sS0FBSztBQUFBLElBQzFDLEVBQUUsS0FBSyxNQUFNLE9BQU8sV0FBVyxPQUFPLEtBQUs7QUFBQSxJQUMzQyxFQUFFLEtBQUssTUFBTSxPQUFPLFlBQVksT0FBTyxLQUFLO0FBQUEsSUFDNUMsRUFBRSxLQUFLLE1BQU0sT0FBTyxRQUFRLE9BQU8sS0FBSztBQUFBLEVBQzFDLEdBQUcsR0FBRztBQUFBLElBQ0osR0FBRztBQUFBLElBQ0g7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0YsQ0FBQztBQUFBLEVBQ0Q7QUFDRjtBQUVPLElBQU0sbUJBQW1CLENBQUMsWUFBWSxVQUFVLGdCQUFnQixTQUFTOzs7QUNsNUNoRixJQUFNLE1BQU0sQ0FBQyxZQUFvQixVQUFrQyxDQUFDLE9BQXNCO0FBQUEsRUFDeEY7QUFBQSxFQUFZO0FBQUEsRUFBUyxNQUFNO0FBQUEsRUFBTSxXQUFXO0FBQUEsRUFBYyxjQUFjLENBQUM7QUFBQSxFQUN6RSxlQUFlLEVBQUUsT0FBTyxLQUFLLE9BQU8sS0FBSyxVQUFVLElBQUk7QUFDekQ7QUFFQSxJQUFNLE9BQU8sQ0FBQyxLQUFpQixHQUFrQixHQUFpQixPQUFlLFdBQW1CO0FBQ2xHLFFBQU0sSUFBSSxJQUFJLEtBQUssVUFBVSxDQUFDLE1BQU0sRUFBRSxPQUFPLEtBQUs7QUFDbEQsUUFBTSxLQUFLLFFBQVEsS0FBSyxHQUFHLEdBQUcsQ0FBQyxFQUFFLFVBQVUsS0FBSyxDQUFDLE1BQU0sRUFBRSxXQUFXLE1BQU07QUFDMUUsU0FBTyxJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUM7QUFDL0M7QUFDQSxJQUFNLE1BQU0sQ0FBQyxHQUFXLEdBQVcsTUFBYyxNQUFNLEtBQUssRUFBRSxRQUFRLEVBQUUsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7QUFHdkYsU0FBUyxPQUFPLEtBQWlCLEdBQWtCLEdBQWlCLEdBQVcsT0FBaUIsQ0FBQyxHQUFnQjtBQUMvRyxRQUFNLElBQUksUUFBUSxLQUFLLEdBQUcsQ0FBQztBQUMzQixRQUFNLE9BQU8sSUFBSSxLQUFLLEtBQUssSUFBSSxNQUFNLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxNQUFNLEdBQUcsRUFBRTtBQUM3RSxTQUFPO0FBQUEsSUFDTCxJQUFJLElBQUksQ0FBQztBQUFBLElBQUksT0FBTyxFQUFFO0FBQUEsSUFBUyxZQUFZLEdBQUcsSUFBSTtBQUFBLElBQWMsVUFBVSxHQUFHLElBQUk7QUFBQSxJQUNqRixXQUFXLEVBQUUsVUFBVSxPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssU0FBUyxFQUFFLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQyxPQUFPO0FBQUEsTUFDekUsT0FBTyxNQUFNLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQztBQUFBLE1BQUcsc0JBQXNCLE1BQU0sRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDO0FBQUEsTUFDeEUsTUFBTSxFQUFFLEtBQUssSUFBSSxDQUFDLE9BQU8sRUFBRSxNQUFNLFVBQW1CLFdBQVcsS0FBSyxFQUFFLFFBQVEsSUFBSSxHQUFHLE1BQU0sRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUN0RyxFQUFFO0FBQUEsRUFDSjtBQUNGO0FBRUFDLFVBQVMsOEJBQThCLE1BQU07QUFDM0MsYUFBVyxLQUFLLGtCQUFrQjtBQUNoQyxJQUFBQyxJQUFHLEdBQUcsRUFBRSxFQUFFLDZCQUE2QixNQUFNO0FBQzNDLFlBQU0sT0FBTyxPQUFPLFlBQVksRUFBRSxRQUFRLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDeEUsWUFBTSxNQUFNLEVBQUUsTUFBTSxJQUFJO0FBQ3hCLFlBQU0sTUFBTSxTQUFTLEdBQUcsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLEVBQUU7QUFDekMsYUFBTyxJQUFJLElBQUksR0FBRyxFQUFFLElBQUksRUFBRSxLQUFLLElBQUksTUFBTTtBQUN6QyxhQUFPLElBQUksSUFBSSxJQUFJLEtBQUssSUFBSSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsS0FBSyxJQUFJLEtBQUssTUFBTTtBQUNwRSxhQUFPLElBQUksS0FBSyxFQUFFLGNBQWMsRUFBRSxRQUFRLE1BQU0sT0FBTyxFQUFFLE1BQU0sQ0FBQztBQUNoRSxhQUFPLElBQUksUUFBUSxFQUFFLEtBQUssS0FBSztBQUMvQixhQUFPLEVBQUUsR0FBRyxXQUFXLFNBQVMsQ0FBQyxFQUFFLEtBQUssSUFBSTtBQUM1QyxpQkFBVyxLQUFLLFNBQVMsR0FBRyxFQUFHLFFBQU8sTUFBTSxFQUFFLElBQUksR0FBRyxFQUFFLElBQUksRUFBRSxZQUFZO0FBQUEsSUFDM0UsQ0FBQztBQUFBLEVBQ0g7QUFDQSxFQUFBQSxJQUFHLG9CQUFvQixNQUFNO0FBQzNCLFdBQU8sVUFBVSxhQUFhLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxLQUFLLEtBQUssTUFBTSxFQUFFLEdBQUcsRUFBRSxLQUFLLEtBQUssTUFBTSxFQUFFLEdBQUcsRUFBRSxLQUFLLEtBQUssTUFBTSxFQUFFLENBQUMsQ0FBQztBQUFBLEVBQ2hILENBQUM7QUFDRCxFQUFBQSxJQUFHLHNDQUFzQyxNQUFNO0FBQzdDLFdBQU8sV0FBVyxNQUFNLEVBQUUsS0FBSyxLQUFLLENBQUMsRUFBRSxPQUFPLEtBQUssRUFBRSxLQUFLLENBQUM7QUFDM0QsV0FBTyxXQUFXLE1BQU0sRUFBRSxLQUFLLFFBQVEsQ0FBQyxFQUFFLE9BQU8sS0FBSyxFQUFFLEtBQUssRUFBRTtBQUMvRCxXQUFPLGVBQWUsTUFBTSxFQUFFLE1BQU0sS0FBSyxNQUFNLEtBQUssQ0FBQyxFQUFFLE9BQU8sS0FBSyxFQUFFLEtBQUssRUFBRTtBQUM1RSxXQUFPLGVBQWUsTUFBTSxFQUFFLE1BQU0sS0FBSyxNQUFNLE1BQU0sQ0FBQyxFQUFFLE9BQU8sS0FBSyxFQUFFLEtBQUssQ0FBQztBQUFBLEVBQzlFLENBQUM7QUFDSCxDQUFDO0FBRURELFVBQVMseUVBQW9FLE1BQU07QUFDakYsUUFBTSxJQUFJLElBQUksY0FBYztBQUM1QixRQUFNLE1BQU0sV0FBVyxNQUFNLEVBQUUsS0FBSyxNQUFNLENBQUM7QUFDM0MsUUFBTSxJQUFJLGFBQWEsS0FBSyxDQUFDO0FBRTdCLEVBQUFDLElBQUcsa0VBQWtFLE1BQU07QUFDekUsVUFBTSxJQUFJLElBQUksS0FBSyxDQUFDO0FBQ3BCLFdBQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxTQUFTO0FBQzNCLFdBQU8sRUFBRSxNQUFNLElBQUksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixpQkFBaUIsa0JBQWtCLG9CQUFvQixxQkFBcUIsQ0FBQztBQUV4SSxXQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsV0FBVyxlQUFlLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxLQUFLLENBQUMsR0FBRyxHQUFHLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBRS9ILFdBQU8sS0FBSyxLQUFLLEdBQUcsR0FBRyxXQUFXLGVBQWUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFFNUcsV0FBTyxLQUFLLEtBQUssR0FBRyxHQUFHLFdBQVcsZ0JBQWdCLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDcEcsV0FBTyxFQUFFLE1BQU0sQ0FBQyxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsTUFBTSxTQUFTLE1BQU0sR0FBRyxNQUFNLEdBQUcsQ0FBQztBQUFBLEVBQzdFLENBQUM7QUFFRCxFQUFBQSxJQUFHLDRFQUE0RSxNQUFNO0FBQ25GLFVBQU0sSUFBSSxJQUFJLEtBQUssS0FBSyxDQUFDLE1BQU0sRUFBRSxPQUFPLFNBQVM7QUFDakQsV0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLEVBQUUsY0FBYyxFQUFFLE1BQU0sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNuRSxXQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsV0FBVyxrQkFBa0IsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDbEksV0FBTyxLQUFLLEtBQUssR0FBRyxHQUFHLFdBQVcsa0JBQWtCLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxHQUFHLEdBQUcsSUFBSSxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUMzSCxDQUFDO0FBRUQsRUFBQUEsSUFBRyw2RkFBb0YsTUFBTTtBQUMzRixVQUFNLElBQUksS0FBSyxLQUFLLEdBQUcsR0FBRyxXQUFXLGVBQWU7QUFDcEQsV0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsTUFBTSxPQUFPLEdBQUcsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNuRSxXQUFPLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQztBQUN6QyxXQUFPLENBQUMsRUFBRSxhQUFhLEVBQUU7QUFBQSxFQUMzQixDQUFDO0FBRUQsRUFBQUEsSUFBRyxrREFBa0QsTUFBTTtBQUN6RCxXQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsV0FBVyxlQUFlLEVBQUcsTUFBTSxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsR0FBRyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ2xILENBQUM7QUFFRCxFQUFBQSxJQUFHLHVEQUF1RCxNQUFNO0FBQzlELFdBQU8sS0FBSyxLQUFLLEdBQUcsR0FBRyxXQUFXLGVBQWUsRUFBRyxNQUFNLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3JHLFdBQU8sSUFBSSxLQUFLLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxTQUFTLEVBQUcsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsVUFBVTtBQUFBLEVBQ3BGLENBQUM7QUFFRCxFQUFBQSxJQUFHLDREQUE0RCxNQUFNO0FBQ25FLFdBQU8sSUFBSSxPQUFPLFlBQVksQ0FBQyxDQUFDLEVBQUUsS0FBSyxpQkFBYztBQUNyRCxXQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsV0FBVyxvQkFBb0IsRUFBRyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUM7QUFBQSxFQUMvRSxDQUFDO0FBQ0gsQ0FBQztBQUVERCxVQUFTLDRDQUE0QyxNQUFNO0FBQ3pELEVBQUFDLElBQUcsK0VBQXlELE1BQU07QUFDaEUsVUFBTSxNQUFNLFNBQVMsTUFBTSxDQUFDLENBQUM7QUFDN0IsVUFBTSxJQUFJLElBQUksV0FBVztBQUN6QixVQUFNLElBQUksS0FBSyxLQUFLLEdBQUcsYUFBYSxLQUFLLENBQUMsR0FBRyxXQUFXLGVBQWU7QUFDdkUsV0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztBQUM3QixXQUFPLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxNQUFNLE9BQU8sR0FBRyxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ25FLFdBQU8sRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEtBQUssRUFBRSxDQUFDO0FBQUEsRUFDM0MsQ0FBQztBQUVELEVBQUFBLElBQUcsd0RBQXdELE1BQU07QUFDL0QsVUFBTSxNQUFNLGVBQWUsTUFBTSxFQUFFLE1BQU0sS0FBSyxNQUFNLEtBQUssQ0FBQztBQUMxRCxVQUFNLElBQUksSUFBSSxpQkFBaUI7QUFDL0IsV0FBTyxLQUFLLEtBQUssR0FBRyxhQUFhLEtBQUssQ0FBQyxHQUFHLFVBQVUsY0FBYyxFQUFHLE1BQU0sRUFBRSxDQUFDLEVBQUUsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNoSSxXQUFPLElBQUksS0FBSyxDQUFDLEVBQUUsTUFBTSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFLFFBQVEsQ0FBQyxTQUFTLFNBQVMsWUFBWSxhQUFhLENBQUM7QUFBQSxFQUNwRyxDQUFDO0FBRUQsRUFBQUEsSUFBRyxxRkFBK0UsTUFBTTtBQUN0RixVQUFNLE1BQU0sVUFBVSxNQUFNLENBQUMsQ0FBQztBQUM5QixVQUFNLElBQUksSUFBSSxZQUFZO0FBQzFCLFVBQU0sSUFBSSxhQUFhLEtBQUssQ0FBQztBQUM3QixXQUFPLElBQUksS0FBSyxPQUFPLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxFQUFFLFFBQVEsQ0FBQyxzQkFBbUIsc0JBQW1CLHNCQUFtQixvQkFBaUIsQ0FBQztBQUMxSixXQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsVUFBVSxtQkFBbUIsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsR0FBRyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNyRyxXQUFPLEtBQUssS0FBSyxHQUFHLEdBQUcsVUFBVSxjQUFjLEVBQUcsTUFBTSxFQUFFLENBQUMsRUFBRSxRQUFRLElBQUksR0FBRyxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQ3JGLENBQUM7QUFDSCxDQUFDO0FBRURELFVBQVMsd0JBQXdCLE1BQU07QUFDckMsUUFBTSxNQUFNLFdBQVcsTUFBTSxFQUFFLEtBQUssS0FBSyxDQUFDO0FBQzFDLFFBQU0sSUFBSSxJQUFJLGdCQUFnQixFQUFFLEtBQUssS0FBSyxDQUFDO0FBRTNDLEVBQUFDLElBQUcsMERBQTBELE1BQU07QUFDakUsUUFBSSxJQUFJLGFBQWEsS0FBSyxDQUFDO0FBQzNCLFVBQU0sS0FBb0IsQ0FBQztBQUMzQixhQUFTLElBQUksR0FBRyxJQUFJLElBQUksS0FBSztBQUMzQixZQUFNLElBQUksT0FBTyxLQUFLLEdBQUcsR0FBRyxDQUFDO0FBQzdCLFNBQUcsS0FBSyxDQUFDO0FBQ1QsVUFBSSxhQUFhLEtBQUssR0FBRyxHQUFHLEdBQUcsRUFBRSxRQUFRO0FBQUEsSUFDM0M7QUFDQSxXQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssSUFBSTtBQUM1QixXQUFPLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLFFBQVEsQ0FBQyxXQUFXLFdBQVcsV0FBVyxXQUFXLFdBQVcsV0FBVyxXQUFXLFdBQVcsV0FBVyxXQUFXLFNBQVMsQ0FBQztBQUNuSyxVQUFNLElBQUksT0FBTyxLQUFLLEdBQUcsRUFBRTtBQUMzQixXQUFPLEVBQUUsUUFBUSxFQUFFLEtBQUssSUFBSTtBQUM1QixXQUFPLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxFQUFFLFFBQVEsRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDO0FBQ25FLFdBQU8sRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLE9BQU8sS0FBSyxPQUFPLEtBQUssVUFBVSxJQUFJLENBQUM7QUFBQSxFQUNqRSxDQUFDO0FBRUQsRUFBQUEsSUFBRyx5RkFBeUYsTUFBTTtBQUNoRyxRQUFJLElBQUksYUFBYSxLQUFLLENBQUM7QUFDM0IsYUFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLElBQUssS0FBSSxhQUFhLEtBQUssR0FBRyxHQUFHLE9BQU8sS0FBSyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsUUFBUTtBQUN4RixXQUFPLElBQUksS0FBSyxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsS0FBSyxTQUFTO0FBQzlDLFVBQU0sT0FBTyxhQUFhLEtBQUssR0FBRyxHQUFHLE9BQU8sS0FBSyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsUUFBUSxFQUFFLElBQUksR0FBRyxFQUFFLEVBQUc7QUFDbkYsV0FBTyxLQUFLLEtBQUssQ0FBQyxNQUFNLEVBQUUsV0FBVyxnQkFBZ0IsQ0FBQyxFQUFFLGNBQWMsRUFBRSxTQUFTLFdBQVcsUUFBUSxLQUFLLE1BQU0sQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDbkksVUFBTSxVQUFVLGFBQWEsS0FBSyxHQUFHLEdBQUcsT0FBTyxLQUFLLEdBQUcsR0FBRyxHQUFHLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLFFBQVEsRUFBRSxJQUFJLEdBQUcsRUFBRSxFQUFHO0FBQzFHLFdBQU8sUUFBUSxLQUFLLENBQUMsTUFBTSxFQUFFLFdBQVcsZUFBZSxHQUFHLE9BQU8sRUFBRSxLQUFLLFNBQVM7QUFDakYsV0FBTyxRQUFRLEtBQUssQ0FBQyxNQUFNLEVBQUUsV0FBVyxnQkFBZ0IsR0FBRyxPQUFPLEVBQUUsS0FBSyxRQUFRO0FBQUEsRUFDbkYsQ0FBQztBQUNILENBQUM7QUFNREQsVUFBUyxvQ0FBb0MsTUFBTTtBQUNqRCxRQUFNLE9BQU8sQ0FBQyxLQUFpQixVQUFrQjtBQUMvQyxVQUFNLE1BQU0sSUFBSSxLQUFLLEtBQUssQ0FBQyxNQUFNLEVBQUUsT0FBTyxLQUFLO0FBQy9DLFdBQU8sS0FBSyxLQUFLLEVBQUUsWUFBWTtBQUMvQixXQUFPLElBQUksTUFBTSxJQUFJLENBQUMsTUFBTTtBQUMxQixZQUFNLElBQUksRUFBRTtBQUNaLFVBQUksRUFBRSxTQUFTLFFBQVMsUUFBTyxHQUFHLEVBQUUsSUFBSSxJQUFJLEVBQUUsSUFBSSxJQUFJLEVBQUUsSUFBSTtBQUM1RCxVQUFJLEVBQUUsU0FBUyxVQUFXLE9BQU0sSUFBSSxNQUFNLFlBQVk7QUFDdEQsWUFBTSxPQUFpQixDQUFDO0FBQ3hCLFVBQUksT0FBTyxJQUFJLElBQUk7QUFDbkIsWUFBTSxRQUFRLE1BQU07QUFBRSxZQUFJLEtBQU0sTUFBSyxLQUFLLElBQUksSUFBSSxHQUFHLElBQUksSUFBSSxDQUFDLEtBQUssSUFBSTtBQUFBLE1BQUc7QUFDMUUsaUJBQVcsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHO0FBQzFCLGNBQU0sSUFBSSxHQUFHLEVBQUUsSUFBSSxJQUFJLEtBQUssTUFBTSxFQUFFLE1BQU8sR0FBSSxJQUFJLEVBQUU7QUFDckQsWUFBSSxNQUFNLEtBQU07QUFBQSxhQUFVO0FBQUUsZ0JBQU07QUFBRyxpQkFBTztBQUFHLGNBQUk7QUFBQSxRQUFHO0FBQUEsTUFDeEQ7QUFDQSxZQUFNO0FBQ04sYUFBTyxHQUFHLEVBQUUsSUFBSSxJQUFJLEtBQUssS0FBSyxHQUFHLENBQUM7QUFBQSxJQUNwQyxDQUFDO0FBQUEsRUFDSDtBQUNBLEVBQUFDLElBQUcscUJBQXFCLE1BQU07QUFDNUIsV0FBTyxLQUFLLFdBQVcsTUFBTSxDQUFDLENBQUMsR0FBRyxTQUFTLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDcEQ7QUFBQSxNQUFtQztBQUFBLE1BQTRCO0FBQUEsTUFBMEI7QUFBQSxNQUFpQjtBQUFBLElBQzVHLENBQUM7QUFBQSxFQUNILENBQUM7QUFDRCxFQUFBQSxJQUFHLCtEQUErRCxNQUFNO0FBQ3RFLFVBQU0sTUFBTSxXQUFXLE1BQU0sRUFBRSxLQUFLLEtBQUssQ0FBQztBQUMxQyxXQUFPLEtBQUssS0FBSyxTQUFTLEVBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxtQ0FBbUMsNkJBQTZCLENBQUM7QUFDbkgsV0FBTyxLQUFLLEtBQUssU0FBUyxDQUFDLEVBQUUsUUFBUSxDQUFDLDRCQUE0QiwwQkFBMEIsQ0FBQztBQUM3RixXQUFPLElBQUksS0FBSyxPQUFPLENBQUMsTUFBTSxFQUFFLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLGFBQWEsQ0FBQztBQUFBLEVBQ25FLENBQUM7QUFDRCxFQUFBQSxJQUFHLHFCQUFxQixNQUFNO0FBQzVCLFdBQU8sS0FBSyxTQUFTLE1BQU0sQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDLEVBQUUsUUFBUTtBQUFBLE1BQ2xEO0FBQUEsTUFBaUM7QUFBQSxNQUNqQztBQUFBLE1BQWlCLE9BQU8sZUFBZSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQTBCO0FBQUEsSUFDOUUsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUNELEVBQUFBLElBQUcseURBQXlELE1BQU07QUFDaEUsVUFBTSxNQUFNLGVBQWUsTUFBTSxDQUFDLENBQUM7QUFDbkMsV0FBTyxLQUFLLEtBQUssU0FBUyxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsMEJBQTBCLDZCQUE2QixDQUFDO0FBQzFHLFdBQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsd0JBQXdCLENBQUM7QUFBQSxFQUMxRixDQUFDO0FBQ0QsRUFBQUEsSUFBRyw0REFBNEQsTUFBTTtBQUNuRSxVQUFNLE1BQU0sVUFBVSxNQUFNLENBQUMsQ0FBQztBQUM5QixXQUFPLEtBQUssS0FBSyxRQUFRLEVBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQyxFQUFFLFFBQVEsQ0FBQyw2Q0FBNkMsOENBQThDLENBQUM7QUFDN0ksV0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxRQUFRLENBQUMsaUNBQWlDLDJCQUEyQixDQUFDO0FBQzlHLFdBQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxFQUFFLFFBQVEsQ0FBQywwQkFBMEIsd0JBQXdCLENBQUM7QUFBQSxFQUMxRixDQUFDO0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFsiZGVzY3JpYmUiLCAiaXQiLCAic3RlcCIsICJjZmciLCAic2xvdCIsICJzZXRzIiwgImlmU3VjY2VzcyIsICJjdXJyZW50IiwgInciLCAidm9sIiwgIm5lZWQiLCAiYSIsICJkIiwgImNmZyIsICJiZWZvcmUiLCAiYWZ0ZXIiLCAic2V0cyIsICJkZXNjcmliZSIsICJpdCJdCn0K
