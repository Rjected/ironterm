// A small vitest-compatible test API on top of node:test and node:assert, so the tests keep
// `import { describe, expect, it } from "vitest"` (scripts/test.mjs aliases "vitest" to this file)
// without vitest's 88 packages. Only what the tests use is here; add matchers as needed.
import { AssertionError } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as nodeTest from "node:test";
import { inspect, isDeepStrictEqual } from "node:util";

type Fn = () => unknown | Promise<unknown>;

// ───────────────────────────── suites and hooks ─────────────────────────────

const stack: string[] = [];

export function describe(name: string, fn: () => void) {
  const path = [...stack, name];
  return nodeTest.describe(name, () => { const saved = stack.splice(0); stack.push(...path); try { fn(); } finally { stack.splice(0); stack.push(...saved); } });
}

type Runner = (name: string, options: { timeout?: number }, fn?: () => Promise<void>) => unknown;

function testWith(runner: Runner) {
  return (name: string, fn?: Fn, timeout?: number): void => {
    const path = [...stack, name];
    runner(name, timeout ? { timeout } : {}, fn ? async () => {
      current = { name: path.join(" > "), counts: new Map() };
      await fn();
    } : undefined);
  };
}

type It = ReturnType<typeof testWith> & {
  skip: ReturnType<typeof testWith>;
  only: ReturnType<typeof testWith>;
  todo: (name: string) => void;
  each: <T>(cases: readonly T[]) => (name: string, fn: (...args: T extends readonly unknown[] ? T : [T]) => unknown) => void;
};

function makeIt(): It {
  const it = testWith(nodeTest.it) as It;
  it.skip = testWith(nodeTest.it.skip);
  it.only = testWith(nodeTest.it.only);
  it.todo = (name: string) => { nodeTest.it.todo(name); };
  it.each = <T>(cases: readonly T[]) => (name: string, fn: (...args: T extends readonly unknown[] ? T : [T]) => unknown) => {
    cases.forEach((c, i) => {
      const args = (Array.isArray(c) ? c : [c]) as T extends readonly unknown[] ? T : [T];
      it(formatEachName(name, args, i), () => fn(...args));
    });
  };
  return it;
}

/** `%s %d %i %f %j %o %#` and `$field` placeholders, as in vitest's it.each. */
function formatEachName(name: string, args: readonly unknown[], index: number): string {
  let i = 0;
  let out = name.replace(/%[sdifjo#%]/g, (m) => {
    if (m === "%%") return "%";
    if (m === "%#") return String(index);
    const v = args[i++];
    return m === "%j" || m === "%o" ? JSON.stringify(v) : typeof v === "string" ? v : inspect(v);
  });
  const first = args[0];
  if (first && typeof first === "object") {
    out = out.replace(/\$([\w.]+)/g, (m, key: string) => {
      const v = key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), first);
      return v === undefined ? m : typeof v === "string" ? v : inspect(v);
    });
  }
  return out;
}

export const it = makeIt();
export const test = it;
export const beforeAll = (fn: Fn) => nodeTest.before(fn);
export const afterAll = (fn: Fn) => nodeTest.after(fn);
export const beforeEach = (fn: Fn) => nodeTest.beforeEach(fn);
export const afterEach = (fn: Fn) => nodeTest.afterEach(fn);

// ───────────────────────────── vi ─────────────────────────────

const stubbed = new Map<string, PropertyDescriptor | undefined>();

export const vi = {
  stubGlobal(name: string, value: unknown) {
    if (!stubbed.has(name)) stubbed.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
    return vi;
  },
  unstubAllGlobals() {
    for (const [name, desc] of stubbed) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    stubbed.clear();
    return vi;
  },
  /** Only Date is supported (node:test's mock timers). */
  useFakeTimers(opts?: { toFake?: string[]; now?: number | Date }) {
    const apis = (opts?.toFake ?? ["Date"]).filter((a) => a === "Date" || a === "setTimeout" || a === "setInterval") as ("Date" | "setTimeout" | "setInterval")[];
    nodeTest.mock.timers.enable({ apis, now: opts?.now ?? Date.now() });
    return vi;
  },
  setSystemTime(t: number | Date) {
    nodeTest.mock.timers.setTime(typeof t === "number" ? t : t.getTime());
    return vi;
  },
  useRealTimers() {
    nodeTest.mock.timers.reset();
    return vi;
  },
};

// ───────────────────────────── equality ─────────────────────────────

interface Asymmetric { asymmetricMatch(actual: unknown): boolean; toString(): string }
const isAsymmetric = (v: unknown): v is Asymmetric => !!v && typeof (v as Asymmetric).asymmetricMatch === "function";

/** vitest's toEqual: recursive, ignores undefined properties and object types; [partial] = toMatchObject. */
function equals(a: unknown, b: unknown, partial = false, seen = new Map<object, object>()): boolean {
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
  const ao = a as Record<string, unknown>, bo = b as Record<string, unknown>;
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined);
  if (partial) return Object.keys(bo).every((k) => (bo[k] === undefined ? ao[k] === undefined : k in ao && equals(ao[k], bo[k], true, seen)));
  const ka = keys(ao), kb = keys(bo);
  if (ka.length !== kb.length) return false;
  return kb.every((k) => Object.prototype.hasOwnProperty.call(ao, k) && equals(ao[k], bo[k], false, seen));
}

// ───────────────────────────── snapshots ─────────────────────────────

let current: { name: string; counts: Map<string, number> } = { name: "", counts: new Map() };
const snapCache = new Map<string, Record<string, string>>();
const dirtySnaps = new Set<string>();

/**
 * scripts/test.mjs bundles web/<dir>/x.test.ts to web/.test-dist/<dir>/x.test.mjs and node --test
 * runs each bundle as its own process, so the source path follows from the script path.
 */
function snapFile(): string {
  const root = process.env.IRONTERM_TEST_ROOT;
  const script = process.argv[1] ?? "";
  const dist = root ? join(root, ".test-dist") : "";
  if (!root || !script.startsWith(dist)) throw new Error("toMatchSnapshot: run tests through scripts/test.mjs");
  const src = join(root, relative(dist, script)).replace(/\.mjs$/, ".ts");
  return join(dirname(src), "__snapshots__", src.split("/").pop() + ".snap");
}

function loadSnaps(file: string): Record<string, string> {
  let snaps = snapCache.get(file);
  if (!snaps) {
    snaps = {};
    if (existsSync(file)) new Function("exports", readFileSync(file, "utf8"))(snaps);
    snapCache.set(file, snaps);
  }
  return snaps;
}

/** The vitest snapshot format for the values the tests snapshot (strings; JSON otherwise). */
const serialize = (v: unknown) => (typeof v === "string" ? `"${v}"` : JSON.stringify(v, null, 2));
const escapeTemplate = (s: string) => s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

process.on("exit", () => {
  for (const file of dirtySnaps) {
    const snaps = snapCache.get(file)!;
    const body = Object.keys(snaps).sort().map((k) => `exports[\`${escapeTemplate(k)}\`] = \`${escapeTemplate(snaps[k])}\`;\n`).join("\n");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html\n\n${body}`);
    console.log(`updated ${relative(process.cwd(), file)}`);
  }
});

function matchSnapshot(actual: unknown, hint?: string) {
  const base = hint ? `${current.name} > ${hint}` : current.name;
  const n = (current.counts.get(base) ?? 0) + 1;
  current.counts.set(base, n);
  const key = `${base} ${n}`;
  const file = snapFile();
  const snaps = loadSnaps(file);
  const got = `\n${serialize(actual)}\n`;
  // like vitest, CI never writes a missing snapshot: it fails
  if (!(key in snaps) && process.env.CI && !process.env.UPDATE_SNAPSHOTS) return { pass: false, message: `missing snapshot "${key}" (run the tests locally and commit the .snap file)` };
  if (process.env.UPDATE_SNAPSHOTS || !(key in snaps)) {
    if (snaps[key] !== got) { snaps[key] = got; dirtySnaps.add(file); }
    return { pass: true, message: "" };
  }
  return { pass: snaps[key] === got, message: `snapshot "${key}" differs:\nexpected:${snaps[key]}\nreceived:${got}(UPDATE_SNAPSHOTS=1 pnpm test to accept)` };
}

// ───────────────────────────── expect ─────────────────────────────

const show = (v: unknown) => (isAsymmetric(v) ? v.toString() : inspect(v, { depth: 6, breakLength: 120 }));

type Result = { pass: boolean; message: string };
type Matchers = Record<string, (actual: unknown, ...args: any[]) => Result>;

const matchers: Matchers = {
  toBe: (a, b) => ({ pass: Object.is(a, b), message: `expected ${show(a)} to be ${show(b)}` }),
  toEqual: (a, b) => ({ pass: equals(a, b), message: `expected ${show(a)} to equal ${show(b)}` }),
  toStrictEqual: (a, b) => ({ pass: isDeepStrictEqual(a, b), message: `expected ${show(a)} to strictly equal ${show(b)}` }),
  toMatchObject: (a, b) => ({ pass: equals(a, b, true), message: `expected ${show(a)} to match object ${show(b)}` }),
  toBeCloseTo: (a, b: number, digits = 2) => ({
    pass: typeof a === "number" && (a === b || Math.abs(a - b) < 10 ** -digits / 2),
    message: `expected ${show(a)} to be close to ${b} (${digits} digits)`,
  }),
  toBeGreaterThan: (a, b) => ({ pass: (a as number) > b, message: `expected ${show(a)} > ${b}` }),
  toBeGreaterThanOrEqual: (a, b) => ({ pass: (a as number) >= b, message: `expected ${show(a)} >= ${b}` }),
  toBeLessThan: (a, b) => ({ pass: (a as number) < b, message: `expected ${show(a)} < ${b}` }),
  toBeLessThanOrEqual: (a, b) => ({ pass: (a as number) <= b, message: `expected ${show(a)} <= ${b}` }),
  toHaveLength: (a, n) => ({ pass: (a as { length?: number })?.length === n, message: `expected length ${n}, got ${(a as { length?: number })?.length} (${show(a)})` }),
  toHaveProperty: (a, key: string, ...v: unknown[]) => {
    const path = key.split(".");
    let o: any = a;
    for (const k of path) { if (o == null || !(k in Object(o))) return { pass: false, message: `expected ${show(a)} to have property ${key}` }; o = o[k]; }
    return { pass: v.length === 0 || equals(o, v[0]), message: `expected ${show(a)} to have ${key} = ${show(v[0])}, got ${show(o)}` };
  },
  toBeNull: (a) => ({ pass: a === null, message: `expected ${show(a)} to be null` }),
  toBeUndefined: (a) => ({ pass: a === undefined, message: `expected ${show(a)} to be undefined` }),
  toBeDefined: (a) => ({ pass: a !== undefined, message: `expected a defined value` }),
  toBeTruthy: (a) => ({ pass: !!a, message: `expected ${show(a)} to be truthy` }),
  toBeFalsy: (a) => ({ pass: !a, message: `expected ${show(a)} to be falsy` }),
  toBeNaN: (a) => ({ pass: Number.isNaN(a), message: `expected ${show(a)} to be NaN` }),
  toBeInstanceOf: (a, cls) => ({ pass: a instanceof cls, message: `expected ${show(a)} to be an instance of ${cls?.name}` }),
  toBeTypeOf: (a, t: string) => ({ pass: typeof a === t, message: `expected typeof ${show(a)} to be ${t}` }),
  toMatch: (a, re: RegExp | string) => ({
    pass: typeof a === "string" && (typeof re === "string" ? a.includes(re) : re.test(a)),
    message: `expected ${show(a)} to match ${String(re)}`,
  }),
  toContain: (a, item) => ({
    pass: typeof a === "string" ? a.includes(item as string) : Array.isArray(a) || a instanceof Set ? [...(a as Iterable<unknown>)].includes(item) : false,
    message: `expected ${show(a)} to contain ${show(item)}`,
  }),
  toContainEqual: (a, item) => ({ pass: Array.isArray(a) && a.some((x) => equals(x, item)), message: `expected ${show(a)} to contain an item equal to ${show(item)}` }),
  toThrow: (fnOrError, expected?: unknown) => {
    let err: unknown, threw = false;
    if (typeof fnOrError === "function") { try { (fnOrError as () => unknown)(); } catch (e) { threw = true; err = e; } }
    else { threw = true; err = fnOrError; } // from .rejects
    const msg = err instanceof Error ? err.message : String(err);
    let pass = threw;
    if (threw && expected !== undefined) {
      if (typeof expected === "string") pass = msg.includes(expected);
      else if (expected instanceof RegExp) pass = expected.test(msg);
      else if (typeof expected === "function") pass = err instanceof (expected as new () => unknown);
      else if (expected instanceof Error) pass = msg === expected.message;
    }
    return { pass, message: threw ? `expected the error (${msg}) to match ${show(expected)}` : `expected a throw${expected === undefined ? "" : ` matching ${show(expected)}`}` };
  },
  toMatchSnapshot: (a, hint?: string) => matchSnapshot(a, hint),
};
matchers.toThrowError = matchers.toThrow;

/** The matchers, typed (R = void, or Promise<void> after .resolves / .rejects). */
export interface Assertion<R = void> {
  toBe(expected: unknown): R;
  toEqual(expected: unknown): R;
  toStrictEqual(expected: unknown): R;
  toMatchObject(expected: object): R;
  toBeCloseTo(expected: number, digits?: number): R;
  toBeGreaterThan(n: number | bigint): R;
  toBeGreaterThanOrEqual(n: number | bigint): R;
  toBeLessThan(n: number | bigint): R;
  toBeLessThanOrEqual(n: number | bigint): R;
  toHaveLength(n: number): R;
  toHaveProperty(path: string, value?: unknown): R;
  toBeNull(): R;
  toBeUndefined(): R;
  toBeDefined(): R;
  toBeTruthy(): R;
  toBeFalsy(): R;
  toBeNaN(): R;
  toBeInstanceOf(cls: abstract new (...args: never[]) => unknown): R;
  toBeTypeOf(type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function"): R;
  toMatch(expected: RegExp | string): R;
  toContain(item: unknown): R;
  toContainEqual(item: unknown): R;
  toThrow(expected?: string | RegExp | Error | (abstract new (...args: never[]) => unknown)): R;
  toThrowError(expected?: string | RegExp | Error | (abstract new (...args: never[]) => unknown)): R;
  toMatchSnapshot(hint?: string): R;
}

type Expectation = Assertion & {
  not: Assertion;
  resolves: Assertion<Promise<void>> & { not: Assertion<Promise<void>> };
  rejects: Assertion<Promise<void>> & { not: Assertion<Promise<void>> };
};

function fail(r: Result, negate: boolean, label?: string) {
  if (r.pass === negate) {
    const message = (label ? `${label}: ` : "") + (negate ? `not: ${r.message}` : r.message);
    throw new AssertionError({ message });
  }
}

function build(actual: () => unknown, negate: boolean, label: string | undefined, async: false): Assertion;
function build(actual: () => Promise<unknown>, negate: boolean, label: string | undefined, async: true): Assertion<Promise<void>>;
function build(actual: () => unknown, negate: boolean, label: string | undefined, async: boolean): unknown {
  const out: Record<string, unknown> = {};
  for (const [name, m] of Object.entries(matchers)) {
    out[name] = async
      ? async (...args: unknown[]) => fail(m(await actual(), ...args), negate, label)
      : (...args: unknown[]) => fail(m(actual(), ...args), negate, label);
  }
  return out;
}

export function expect<T>(actual: T, label?: string): Expectation {
  const e = build(() => actual, false, label, false) as Expectation;
  e.not = build(() => actual, true, label, false);
  const settle = (want: "resolve" | "reject") => async () => {
    try {
      const v = await (actual as unknown as Promise<unknown>);
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

const asymmetric = (name: string, test: (v: unknown) => boolean): Asymmetric => ({ asymmetricMatch: test, toString: () => name });

expect.closeTo = (n: number, digits = 2) => asymmetric(`closeTo(${n}, ${digits})`, (v) => typeof v === "number" && Math.abs(v - n) < 10 ** -digits / 2);
expect.objectContaining = (o: Record<string, unknown>) => asymmetric(`objectContaining(${show(o)})`, (v) => equals(v, o, true));
expect.arrayContaining = (xs: unknown[]) => asymmetric(`arrayContaining(${show(xs)})`, (v) => Array.isArray(v) && xs.every((x) => v.some((y) => equals(y, x))));
expect.stringContaining = (s: string) => asymmetric(`stringContaining(${show(s)})`, (v) => typeof v === "string" && v.includes(s));
expect.stringMatching = (re: RegExp | string) => asymmetric(`stringMatching(${String(re)})`, (v) => typeof v === "string" && (typeof re === "string" ? v.includes(re) : re.test(v)));
expect.any = (cls: unknown) => asymmetric(`any(${(cls as { name?: string })?.name})`, (v) =>
  cls === String ? typeof v === "string" : cls === Number ? typeof v === "number" : cls === Boolean ? typeof v === "boolean" : cls === Function ? typeof v === "function" : v instanceof (cls as new () => unknown));
expect.anything = () => asymmetric("anything()", (v) => v != null);

