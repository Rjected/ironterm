import{createRequire as __cr}from'module';const require=__cr(import.meta.url);

// packages/test/index.ts
import { AssertionError } from "node:assert";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as nodeTest from "node:test";
import { inspect, isDeepStrictEqual } from "node:util";
var stack = [];
function describe2(name, fn2) {
  const path = [...stack, name];
  return nodeTest.describe(name, () => {
    const saved = stack.splice(0);
    stack.push(...path);
    try {
      fn2();
    } finally {
      stack.splice(0);
      stack.push(...saved);
    }
  });
}
var TEST_TIMEOUT_MS = 6e4;
var HOOK_TIMEOUT_MS = 12e4;
function testWith(runner) {
  return (name, fn2, timeout = TEST_TIMEOUT_MS) => {
    const path = [...stack, name];
    runner(name, { timeout: typeof timeout === "number" ? timeout : timeout.timeout ?? TEST_TIMEOUT_MS }, fn2 ? async () => {
      current = { name: path.join(" > "), counts: /* @__PURE__ */ new Map() };
      await fn2();
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
  it3.each = (cases) => (name, fn2) => {
    cases.forEach((c, i) => {
      const args = Array.isArray(c) ? c : [c];
      it3(formatEachName(name, args, i), () => fn2(...args));
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
var beforeAll = (fn2, timeout = HOOK_TIMEOUT_MS) => nodeTest.before(fn2, { timeout });
var afterAll = (fn2, timeout = HOOK_TIMEOUT_MS) => nodeTest.after(fn2, { timeout });
var MOCK = /* @__PURE__ */ Symbol("mock");
function fn(impl) {
  let base = impl;
  const once = [];
  const m = ((...args) => {
    m.mock.calls.push(args);
    const f = once.shift() ?? base;
    try {
      const value = f ? f(...args) : void 0;
      m.mock.results.push({ type: "return", value });
      return value;
    } catch (e) {
      m.mock.results.push({ type: "throw", value: e });
      throw e;
    }
  });
  Object.defineProperty(m, MOCK, { value: true });
  m.mock = { calls: [], results: [] };
  m.mockImplementation = (f) => {
    base = f;
    return m;
  };
  m.mockImplementationOnce = (f) => {
    once.push(f);
    return m;
  };
  m.mockReturnValue = (v) => m.mockImplementation(() => v);
  m.mockReturnValueOnce = (v) => m.mockImplementationOnce(() => v);
  m.mockResolvedValue = (v) => m.mockImplementation((() => Promise.resolve(v)));
  m.mockRejectedValue = (e) => m.mockImplementation((() => Promise.reject(e)));
  m.mockClear = () => {
    m.mock.calls = [];
    m.mock.results = [];
    return m;
  };
  m.mockReset = () => {
    m.mockClear();
    base = void 0;
    once.length = 0;
    return m;
  };
  return m;
}
var isMock = (v) => typeof v === "function" && v[MOCK] === true;
var stubbed = /* @__PURE__ */ new Map();
var vi = {
  fn,
  isMockFunction: isMock,
  stubGlobal(name, value) {
    if (!stubbed.has(name)) stubbed.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true, enumerable: true });
    return vi;
  },
  unstubAllGlobals() {
    for (const [name, desc] of stubbed) {
      if (desc) Object.defineProperty(globalThis, name, desc);
      else delete globalThis[name];
    }
    stubbed.clear();
    return vi;
  },
  /** Only Date is supported (node:test's mock timers). */
  useFakeTimers(opts) {
    const apis = (opts?.toFake ?? ["Date"]).filter((a) => a === "Date" || a === "setTimeout" || a === "setInterval");
    nodeTest.mock.timers.enable({ apis, now: opts?.now ?? Date.now() });
    return vi;
  },
  setSystemTime(t) {
    nodeTest.mock.timers.setTime(typeof t === "number" ? t : t.getTime());
    return vi;
  },
  useRealTimers() {
    nodeTest.mock.timers.reset();
    return vi;
  }
};
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

// packages/test/index.test.ts
var fails = (fn2) => {
  let threw = false;
  try {
    fn2();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected the assertion to fail");
};
describe2("equality", () => {
  it2("toBe is Object.is", () => {
    expect(1).toBe(1);
    expect(NaN).toBe(NaN);
    fails(() => expect({}).toBe({}));
    fails(() => expect(0).toBe(-0));
    expect(1).not.toBe(2);
    fails(() => expect(1).not.toBe(1));
  });
  it2("toEqual is deep and ignores undefined properties", () => {
    expect({ a: 1, b: [1, { c: 2 }], u: void 0 }).toEqual({ a: 1, b: [1, { c: 2 }] });
    expect(/* @__PURE__ */ new Map([["k", { v: 1 }]])).toEqual(/* @__PURE__ */ new Map([["k", { v: 1 }]]));
    expect(/* @__PURE__ */ new Set([1, 2])).toEqual(/* @__PURE__ */ new Set([2, 1]));
    expect(/* @__PURE__ */ new Date(5)).toEqual(/* @__PURE__ */ new Date(5));
    fails(() => expect({ a: 1 }).toEqual({ a: 1, b: 2 }));
    fails(() => expect([1, 2]).toEqual([1, 2, 3]));
    fails(() => expect([1, 2]).toEqual({ 0: 1, 1: 2 }));
    fails(() => expect(/* @__PURE__ */ new Date(5)).toEqual(/* @__PURE__ */ new Date(6)));
    fails(() => expect(/* @__PURE__ */ new Map([["k", 1]])).toEqual(/* @__PURE__ */ new Map([["k", 2]])));
  });
  it2("toMatchObject is a recursive subset; arrays match element by element", () => {
    expect({ a: 1, b: { c: 2, d: 3 }, e: [{ f: 1, g: 2 }] }).toMatchObject({ b: { c: 2 }, e: [{ f: 1 }] });
    fails(() => expect({ a: 1 }).toMatchObject({ a: 2 }));
    fails(() => expect({ e: [{ f: 1 }, { f: 2 }] }).toMatchObject({ e: [{ f: 1 }] }));
    fails(() => expect({}).toMatchObject({ a: 1 }));
  });
  it2("asymmetric matchers", () => {
    expect({ x: 1.0000001, y: "abc" }).toMatchObject({ x: expect.closeTo(1, 5), y: expect.stringContaining("b") });
    fails(() => expect({ x: 1.1 }).toMatchObject({ x: expect.closeTo(1, 5) }));
    expect([{ a: 1, b: 2 }]).toEqual([expect.objectContaining({ a: 1 })]);
    fails(() => expect([{ a: 1 }]).toEqual([expect.objectContaining({ a: 2 })]));
    expect([3, 1, 2]).toEqual(expect.arrayContaining([1, 2]));
    expect("x").toEqual(expect.any(String));
    fails(() => expect(1).toEqual(expect.any(String)));
  });
});
describe2("numbers, strings, collections", () => {
  it2("compare", () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3);
    expect(1.234).toBeCloseTo(1.23, 2);
    fails(() => expect(1.24).toBeCloseTo(1.23, 2));
    expect(2).toBeGreaterThan(1);
    expect(2).toBeGreaterThanOrEqual(2);
    expect(1).toBeLessThan(2);
    expect(2).toBeLessThanOrEqual(2);
    fails(() => expect(1).toBeGreaterThan(1));
    fails(() => expect(2).toBeLessThan(2));
  });
  it2("strings and arrays", () => {
    expect("hello world").toMatch(/wor/);
    expect("hello world").toMatch("lo w");
    fails(() => expect("hello").toMatch(/x/));
    expect("abc").not.toMatch(/x/);
    expect([1, 2, 3]).toContain(2);
    expect("abc").toContain("b");
    fails(() => expect([1, 2]).toContain(3));
    expect([1, 2]).toHaveLength(2);
    fails(() => expect("abc").toHaveLength(2));
    expect([{ a: 1 }]).toContainEqual({ a: 1 });
    expect({ a: { b: 2 } }).toHaveProperty("a.b", 2);
  });
  it2("truthiness", () => {
    expect(null).toBeNull();
    expect(void 0).toBeUndefined();
    expect(0).toBeDefined();
    expect(1).toBeTruthy();
    expect("").toBeFalsy();
    fails(() => expect(void 0).toBeNull());
    fails(() => expect(0).toBeTruthy());
  });
});
describe2("errors and promises", () => {
  class MyError extends Error {
  }
  it2("toThrow", () => {
    expect(() => {
      throw new MyError("boom here");
    }).toThrow();
    expect(() => {
      throw new MyError("boom here");
    }).toThrow(MyError);
    expect(() => {
      throw new MyError("boom here");
    }).toThrow(/boom/);
    expect(() => {
      throw new MyError("boom here");
    }).toThrow("here");
    fails(() => expect(() => {
    }).toThrow());
    fails(() => expect(() => {
      throw new Error("a");
    }).toThrow(MyError));
    fails(() => expect(() => {
      throw new Error("a");
    }).toThrow(/b/));
    expect(() => {
    }).not.toThrow();
  });
  it2("resolves / rejects", async () => {
    await expect(Promise.resolve(3)).resolves.toBe(3);
    await expect(Promise.reject(new Error("no"))).rejects.toThrow(/no/);
    let threw = false;
    try {
      await expect(Promise.resolve(1)).rejects.toThrow();
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
  it2("a label prefixes the failure message", () => {
    try {
      expect(1, "the count").toBe(2);
    } catch (e) {
      expect(e.message).toMatch(/^the count: /);
      return;
    }
    throw new Error("didn't fail");
  });
});
describe2("hooks and vi", () => {
  let ready = false;
  beforeAll(() => {
    ready = true;
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });
  it2("beforeAll ran", () => expect(ready).toBe(true));
  it2("stubGlobal / unstubAllGlobals", () => {
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", () => "stub");
    expect(globalThis.fetch()).toBe("stub");
    vi.unstubAllGlobals();
    expect(globalThis.fetch).toBe(real);
  });
  it2("fake Date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2030, 0, 1));
    expect((/* @__PURE__ */ new Date()).toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(Date.now()).toBe(Date.UTC(2030, 0, 1));
    vi.useRealTimers();
    expect((/* @__PURE__ */ new Date()).getFullYear()).toBeLessThan(2030);
  });
  it2("vi.fn records calls and fakes results", async () => {
    const f = vi.fn((x) => x * 2);
    expect(f(2)).toBe(4);
    f.mockReturnValueOnce(7);
    expect(f(1)).toBe(7);
    expect(f(1)).toBe(2);
    expect(f).toHaveBeenCalled();
    expect(f).toHaveBeenCalledTimes(3);
    expect(f).toHaveBeenCalledWith(2);
    expect(f).toHaveBeenNthCalledWith(2, 1);
    expect(f).toHaveBeenLastCalledWith(1);
    fails(() => expect(f).toHaveBeenCalledWith(3));
    fails(() => expect(f).toHaveBeenCalledTimes(2));
    const g = vi.fn().mockResolvedValue("ok");
    expect(await g()).toBe("ok");
    expect(vi.fn()).not.toHaveBeenCalled();
    expect(vi.isMockFunction(g)).toBe(true);
  });
  it2("takes a per-test timeout", async () => {
    await new Promise((r) => setTimeout(r, 5));
  }, 1e3);
  it2.each([[1, 2, 3], [2, 3, 5]])("%i + %i = %i", (a, b, c) => expect(a + b).toBe(c));
  it2.each([{ id: "x", n: 1 }])("$id has n = $n", (o) => expect(o.n).toBe(1));
});
describe2("snapshots", () => {
  it2("compares strings with the stored snapshot", () => {
    expect('line 1\nline `2` ${x} \\ "q"').toMatchSnapshot("tricky");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vLi4vcGFja2FnZXMvdGVzdC9pbmRleC50cyIsICIuLi8uLi8uLi9wYWNrYWdlcy90ZXN0L2luZGV4LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEEgc21hbGwgdml0ZXN0LWNvbXBhdGlibGUgdGVzdCBBUEkgb24gdG9wIG9mIG5vZGU6dGVzdCBhbmQgbm9kZTphc3NlcnQsIHNvIHRoZSB0ZXN0cyBrZWVwXG4vLyBgaW1wb3J0IHsgZGVzY3JpYmUsIGV4cGVjdCwgaXQgfSBmcm9tIFwidml0ZXN0XCJgIChzY3JpcHRzL3Rlc3QubWpzIGFsaWFzZXMgXCJ2aXRlc3RcIiB0byB0aGlzIGZpbGUpXG4vLyB3aXRob3V0IHZpdGVzdCdzIDg4IHBhY2thZ2VzLiBPbmx5IHdoYXQgdGhlIHRlc3RzIHVzZSBpcyBoZXJlOyBhZGQgbWF0Y2hlcnMgYXMgbmVlZGVkLlxuaW1wb3J0IHsgQXNzZXJ0aW9uRXJyb3IgfSBmcm9tIFwibm9kZTphc3NlcnRcIjtcbmltcG9ydCB7IGV4aXN0c1N5bmMsIG1rZGlyU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIHJlbGF0aXZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0ICogYXMgbm9kZVRlc3QgZnJvbSBcIm5vZGU6dGVzdFwiO1xuaW1wb3J0IHsgaW5zcGVjdCwgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tIFwibm9kZTp1dGlsXCI7XG5cbnR5cGUgRm4gPSAoKSA9PiB1bmtub3duIHwgUHJvbWlzZTx1bmtub3duPjtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHN1aXRlcyBhbmQgaG9va3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHN0YWNrOiBzdHJpbmdbXSA9IFtdO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmUobmFtZTogc3RyaW5nLCBmbjogKCkgPT4gdm9pZCkge1xuICBjb25zdCBwYXRoID0gWy4uLnN0YWNrLCBuYW1lXTtcbiAgcmV0dXJuIG5vZGVUZXN0LmRlc2NyaWJlKG5hbWUsICgpID0+IHsgY29uc3Qgc2F2ZWQgPSBzdGFjay5zcGxpY2UoMCk7IHN0YWNrLnB1c2goLi4ucGF0aCk7IHRyeSB7IGZuKCk7IH0gZmluYWxseSB7IHN0YWNrLnNwbGljZSgwKTsgc3RhY2sucHVzaCguLi5zYXZlZCk7IH0gfSk7XG59XG5cbnR5cGUgUnVubmVyID0gKG5hbWU6IHN0cmluZywgb3B0aW9uczogeyB0aW1lb3V0PzogbnVtYmVyIH0sIGZuPzogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gdW5rbm93bjtcblxuLyoqXG4gKiBBIHRlc3Qgb3IgaG9vayB0aGF0IHJ1bnMgbG9uZ2VyIGZhaWxzIChcImh1bmdcIiwgbm90IFwic2xvd1wiKTogZ2VuZXJvdXMsIGJlY2F1c2UgdGhlIGVuZC10by1lbmRcbiAqIHRlc3RzIHJ1biBzZXZlcmFsIGluLXByb2Nlc3Mgc2VydmVycy4gQSB0ZXN0IGNhbiBwYXNzIGl0cyBvd24gYXMgdGhlIHRoaXJkIGFyZ3VtZW50LlxuICovXG5leHBvcnQgY29uc3QgVEVTVF9USU1FT1VUX01TID0gNjBfMDAwO1xuZXhwb3J0IGNvbnN0IEhPT0tfVElNRU9VVF9NUyA9IDEyMF8wMDA7XG5cbmZ1bmN0aW9uIHRlc3RXaXRoKHJ1bm5lcjogUnVubmVyKSB7XG4gIHJldHVybiAobmFtZTogc3RyaW5nLCBmbj86IEZuLCB0aW1lb3V0OiBudW1iZXIgfCB7IHRpbWVvdXQ/OiBudW1iZXIgfSA9IFRFU1RfVElNRU9VVF9NUyk6IHZvaWQgPT4ge1xuICAgIGNvbnN0IHBhdGggPSBbLi4uc3RhY2ssIG5hbWVdO1xuICAgIHJ1bm5lcihuYW1lLCB7IHRpbWVvdXQ6IHR5cGVvZiB0aW1lb3V0ID09PSBcIm51bWJlclwiID8gdGltZW91dCA6IHRpbWVvdXQudGltZW91dCA/PyBURVNUX1RJTUVPVVRfTVMgfSwgZm4gPyBhc3luYyAoKSA9PiB7XG4gICAgICBjdXJyZW50ID0geyBuYW1lOiBwYXRoLmpvaW4oXCIgPiBcIiksIGNvdW50czogbmV3IE1hcCgpIH07XG4gICAgICBhd2FpdCBmbigpO1xuICAgIH0gOiB1bmRlZmluZWQpO1xuICB9O1xufVxuXG50eXBlIEl0ID0gUmV0dXJuVHlwZTx0eXBlb2YgdGVzdFdpdGg+ICYge1xuICBza2lwOiBSZXR1cm5UeXBlPHR5cGVvZiB0ZXN0V2l0aD47XG4gIG9ubHk6IFJldHVyblR5cGU8dHlwZW9mIHRlc3RXaXRoPjtcbiAgdG9kbzogKG5hbWU6IHN0cmluZykgPT4gdm9pZDtcbiAgZWFjaDogPFQ+KGNhc2VzOiByZWFkb25seSBUW10pID0+IChuYW1lOiBzdHJpbmcsIGZuOiAoLi4uYXJnczogVCBleHRlbmRzIHJlYWRvbmx5IHVua25vd25bXSA/IFQgOiBbVF0pID0+IHVua25vd24pID0+IHZvaWQ7XG59O1xuXG5mdW5jdGlvbiBtYWtlSXQoKTogSXQge1xuICBjb25zdCBpdCA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0KSBhcyBJdDtcbiAgaXQuc2tpcCA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0LnNraXApO1xuICBpdC5vbmx5ID0gdGVzdFdpdGgobm9kZVRlc3QuaXQub25seSk7XG4gIGl0LnRvZG8gPSAobmFtZTogc3RyaW5nKSA9PiB7IG5vZGVUZXN0Lml0LnRvZG8obmFtZSk7IH07XG4gIGl0LmVhY2ggPSA8VD4oY2FzZXM6IHJlYWRvbmx5IFRbXSkgPT4gKG5hbWU6IHN0cmluZywgZm46ICguLi5hcmdzOiBUIGV4dGVuZHMgcmVhZG9ubHkgdW5rbm93bltdID8gVCA6IFtUXSkgPT4gdW5rbm93bikgPT4ge1xuICAgIGNhc2VzLmZvckVhY2goKGMsIGkpID0+IHtcbiAgICAgIGNvbnN0IGFyZ3MgPSAoQXJyYXkuaXNBcnJheShjKSA/IGMgOiBbY10pIGFzIFQgZXh0ZW5kcyByZWFkb25seSB1bmtub3duW10gPyBUIDogW1RdO1xuICAgICAgaXQoZm9ybWF0RWFjaE5hbWUobmFtZSwgYXJncywgaSksICgpID0+IGZuKC4uLmFyZ3MpKTtcbiAgICB9KTtcbiAgfTtcbiAgcmV0dXJuIGl0O1xufVxuXG4vKiogYCVzICVkICVpICVmICVqICVvICUjYCBhbmQgYCRmaWVsZGAgcGxhY2Vob2xkZXJzLCBhcyBpbiB2aXRlc3QncyBpdC5lYWNoLiAqL1xuZnVuY3Rpb24gZm9ybWF0RWFjaE5hbWUobmFtZTogc3RyaW5nLCBhcmdzOiByZWFkb25seSB1bmtub3duW10sIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuICBsZXQgaSA9IDA7XG4gIGxldCBvdXQgPSBuYW1lLnJlcGxhY2UoLyVbc2RpZmpvIyVdL2csIChtKSA9PiB7XG4gICAgaWYgKG0gPT09IFwiJSVcIikgcmV0dXJuIFwiJVwiO1xuICAgIGlmIChtID09PSBcIiUjXCIpIHJldHVybiBTdHJpbmcoaW5kZXgpO1xuICAgIGNvbnN0IHYgPSBhcmdzW2krK107XG4gICAgcmV0dXJuIG0gPT09IFwiJWpcIiB8fCBtID09PSBcIiVvXCIgPyBKU09OLnN0cmluZ2lmeSh2KSA6IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gdiA6IGluc3BlY3Qodik7XG4gIH0pO1xuICBjb25zdCBmaXJzdCA9IGFyZ3NbMF07XG4gIGlmIChmaXJzdCAmJiB0eXBlb2YgZmlyc3QgPT09IFwib2JqZWN0XCIpIHtcbiAgICBvdXQgPSBvdXQucmVwbGFjZSgvXFwkKFtcXHcuXSspL2csIChtLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgdiA9IGtleS5zcGxpdChcIi5cIikucmVkdWNlPGFueT4oKG8sIGspID0+IChvID09IG51bGwgPyBvIDogb1trXSksIGZpcnN0KTtcbiAgICAgIHJldHVybiB2ID09PSB1bmRlZmluZWQgPyBtIDogdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogaW5zcGVjdCh2KTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgY29uc3QgaXQgPSBtYWtlSXQoKTtcbmV4cG9ydCBjb25zdCB0ZXN0ID0gaXQ7XG5leHBvcnQgY29uc3QgYmVmb3JlQWxsID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYmVmb3JlKGZuLCB7IHRpbWVvdXQgfSk7XG5leHBvcnQgY29uc3QgYWZ0ZXJBbGwgPSAoZm46IEZuLCB0aW1lb3V0ID0gSE9PS19USU1FT1VUX01TKSA9PiBub2RlVGVzdC5hZnRlcihmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGJlZm9yZUVhY2ggPSAoZm46IEZuLCB0aW1lb3V0ID0gSE9PS19USU1FT1VUX01TKSA9PiBub2RlVGVzdC5iZWZvcmVFYWNoKGZuLCB7IHRpbWVvdXQgfSk7XG5leHBvcnQgY29uc3QgYWZ0ZXJFYWNoID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYWZ0ZXJFYWNoKGZuLCB7IHRpbWVvdXQgfSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBtb2NrIGZ1bmN0aW9ucyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGludGVyZmFjZSBNb2NrPEEgZXh0ZW5kcyB1bmtub3duW10gPSBhbnlbXSwgUiA9IGFueT4ge1xuICAoLi4uYXJnczogQSk6IFI7XG4gIG1vY2s6IHsgY2FsbHM6IEFbXTsgcmVzdWx0czogeyB0eXBlOiBcInJldHVyblwiIHwgXCJ0aHJvd1wiOyB2YWx1ZTogdW5rbm93biB9W10gfTtcbiAgbW9ja0ltcGxlbWVudGF0aW9uKGZuOiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj47XG4gIG1vY2tJbXBsZW1lbnRhdGlvbk9uY2UoZm46ICguLi5hcmdzOiBBKSA9PiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1JldHVyblZhbHVlKHY6IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmV0dXJuVmFsdWVPbmNlKHY6IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmVzb2x2ZWRWYWx1ZSh2OiBBd2FpdGVkPFI+KTogTW9jazxBLCBSPjtcbiAgbW9ja1JlamVjdGVkVmFsdWUoZTogdW5rbm93bik6IE1vY2s8QSwgUj47XG4gIG1vY2tDbGVhcigpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmVzZXQoKTogTW9jazxBLCBSPjtcbn1cbmNvbnN0IE1PQ0sgPSBTeW1ib2woXCJtb2NrXCIpO1xuXG5mdW5jdGlvbiBmbjxBIGV4dGVuZHMgdW5rbm93bltdID0gYW55W10sIFIgPSBhbnk+KGltcGw/OiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj4ge1xuICBsZXQgYmFzZSA9IGltcGw7XG4gIGNvbnN0IG9uY2U6ICgoLi4uYXJnczogQSkgPT4gUilbXSA9IFtdO1xuICBjb25zdCBtID0gKCguLi5hcmdzOiBBKTogUiA9PiB7XG4gICAgbS5tb2NrLmNhbGxzLnB1c2goYXJncyk7XG4gICAgY29uc3QgZiA9IG9uY2Uuc2hpZnQoKSA/PyBiYXNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGYgPyBmKC4uLmFyZ3MpIDogKHVuZGVmaW5lZCBhcyBSKTtcbiAgICAgIG0ubW9jay5yZXN1bHRzLnB1c2goeyB0eXBlOiBcInJldHVyblwiLCB2YWx1ZSB9KTtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBtLm1vY2sucmVzdWx0cy5wdXNoKHsgdHlwZTogXCJ0aHJvd1wiLCB2YWx1ZTogZSB9KTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9KSBhcyBNb2NrPEEsIFI+O1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkobSwgTU9DSywgeyB2YWx1ZTogdHJ1ZSB9KTtcbiAgbS5tb2NrID0geyBjYWxsczogW10sIHJlc3VsdHM6IFtdIH07XG4gIG0ubW9ja0ltcGxlbWVudGF0aW9uID0gKGYpID0+IHsgYmFzZSA9IGY7IHJldHVybiBtOyB9O1xuICBtLm1vY2tJbXBsZW1lbnRhdGlvbk9uY2UgPSAoZikgPT4geyBvbmNlLnB1c2goZik7IHJldHVybiBtOyB9O1xuICBtLm1vY2tSZXR1cm5WYWx1ZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiB2KTtcbiAgbS5tb2NrUmV0dXJuVmFsdWVPbmNlID0gKHYpID0+IG0ubW9ja0ltcGxlbWVudGF0aW9uT25jZSgoKSA9PiB2KTtcbiAgbS5tb2NrUmVzb2x2ZWRWYWx1ZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbigoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHYpKSBhcyAoLi4uYXJnczogQSkgPT4gUik7XG4gIG0ubW9ja1JlamVjdGVkVmFsdWUgPSAoZSkgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCgpID0+IFByb21pc2UucmVqZWN0KGUpKSBhcyAoLi4uYXJnczogQSkgPT4gUik7XG4gIG0ubW9ja0NsZWFyID0gKCkgPT4geyBtLm1vY2suY2FsbHMgPSBbXTsgbS5tb2NrLnJlc3VsdHMgPSBbXTsgcmV0dXJuIG07IH07XG4gIG0ubW9ja1Jlc2V0ID0gKCkgPT4geyBtLm1vY2tDbGVhcigpOyBiYXNlID0gdW5kZWZpbmVkOyBvbmNlLmxlbmd0aCA9IDA7IHJldHVybiBtOyB9O1xuICByZXR1cm4gbTtcbn1cbmNvbnN0IGlzTW9jayA9ICh2OiB1bmtub3duKTogdiBpcyBNb2NrID0+IHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIgJiYgKHYgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3ltYm9sLCB1bmtub3duPilbTU9DS10gPT09IHRydWU7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCB2aSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3Qgc3R1YmJlZCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9wZXJ0eURlc2NyaXB0b3IgfCB1bmRlZmluZWQ+KCk7XG5cbmV4cG9ydCBjb25zdCB2aSA9IHtcbiAgZm4sXG4gIGlzTW9ja0Z1bmN0aW9uOiBpc01vY2ssXG4gIHN0dWJHbG9iYWwobmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIGlmICghc3R1YmJlZC5oYXMobmFtZSkpIHN0dWJiZWQuc2V0KG5hbWUsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZ2xvYmFsVGhpcywgbmFtZSkpO1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShnbG9iYWxUaGlzLCBuYW1lLCB7IHZhbHVlLCB3cml0YWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLCBlbnVtZXJhYmxlOiB0cnVlIH0pO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgdW5zdHViQWxsR2xvYmFscygpIHtcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBkZXNjXSBvZiBzdHViYmVkKSB7XG4gICAgICBpZiAoZGVzYykgT2JqZWN0LmRlZmluZVByb3BlcnR5KGdsb2JhbFRoaXMsIG5hbWUsIGRlc2MpO1xuICAgICAgZWxzZSBkZWxldGUgKGdsb2JhbFRoaXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW25hbWVdO1xuICAgIH1cbiAgICBzdHViYmVkLmNsZWFyKCk7XG4gICAgcmV0dXJuIHZpO1xuICB9LFxuICAvKiogT25seSBEYXRlIGlzIHN1cHBvcnRlZCAobm9kZTp0ZXN0J3MgbW9jayB0aW1lcnMpLiAqL1xuICB1c2VGYWtlVGltZXJzKG9wdHM/OiB7IHRvRmFrZT86IHN0cmluZ1tdOyBub3c/OiBudW1iZXIgfCBEYXRlIH0pIHtcbiAgICBjb25zdCBhcGlzID0gKG9wdHM/LnRvRmFrZSA/PyBbXCJEYXRlXCJdKS5maWx0ZXIoKGEpID0+IGEgPT09IFwiRGF0ZVwiIHx8IGEgPT09IFwic2V0VGltZW91dFwiIHx8IGEgPT09IFwic2V0SW50ZXJ2YWxcIikgYXMgKFwiRGF0ZVwiIHwgXCJzZXRUaW1lb3V0XCIgfCBcInNldEludGVydmFsXCIpW107XG4gICAgbm9kZVRlc3QubW9jay50aW1lcnMuZW5hYmxlKHsgYXBpcywgbm93OiBvcHRzPy5ub3cgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHNldFN5c3RlbVRpbWUodDogbnVtYmVyIHwgRGF0ZSkge1xuICAgIG5vZGVUZXN0Lm1vY2sudGltZXJzLnNldFRpbWUodHlwZW9mIHQgPT09IFwibnVtYmVyXCIgPyB0IDogdC5nZXRUaW1lKCkpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgdXNlUmVhbFRpbWVycygpIHtcbiAgICBub2RlVGVzdC5tb2NrLnRpbWVycy5yZXNldCgpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbn07XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBlcXVhbGl0eSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuaW50ZXJmYWNlIEFzeW1tZXRyaWMgeyBhc3ltbWV0cmljTWF0Y2goYWN0dWFsOiB1bmtub3duKTogYm9vbGVhbjsgdG9TdHJpbmcoKTogc3RyaW5nIH1cbmNvbnN0IGlzQXN5bW1ldHJpYyA9ICh2OiB1bmtub3duKTogdiBpcyBBc3ltbWV0cmljID0+ICEhdiAmJiB0eXBlb2YgKHYgYXMgQXN5bW1ldHJpYykuYXN5bW1ldHJpY01hdGNoID09PSBcImZ1bmN0aW9uXCI7XG5cbi8qKiB2aXRlc3QncyB0b0VxdWFsOiByZWN1cnNpdmUsIGlnbm9yZXMgdW5kZWZpbmVkIHByb3BlcnRpZXMgYW5kIG9iamVjdCB0eXBlczsgW3BhcnRpYWxdID0gdG9NYXRjaE9iamVjdC4gKi9cbmZ1bmN0aW9uIGVxdWFscyhhOiB1bmtub3duLCBiOiB1bmtub3duLCBwYXJ0aWFsID0gZmFsc2UsIHNlZW4gPSBuZXcgTWFwPG9iamVjdCwgb2JqZWN0PigpKTogYm9vbGVhbiB7XG4gIGlmIChpc0FzeW1tZXRyaWMoYikpIHJldHVybiBiLmFzeW1tZXRyaWNNYXRjaChhKTtcbiAgaWYgKGlzQXN5bW1ldHJpYyhhKSkgcmV0dXJuIGEuYXN5bW1ldHJpY01hdGNoKGIpO1xuICBpZiAoT2JqZWN0LmlzKGEsIGIpKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHR5cGVvZiBhICE9PSBcIm9iamVjdFwiIHx8IHR5cGVvZiBiICE9PSBcIm9iamVjdFwiIHx8IGEgPT09IG51bGwgfHwgYiA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoc2Vlbi5nZXQoYSkgPT09IGIpIHJldHVybiB0cnVlO1xuICBzZWVuLnNldChhLCBiKTtcbiAgaWYgKGEgaW5zdGFuY2VvZiBEYXRlIHx8IGIgaW5zdGFuY2VvZiBEYXRlKSByZXR1cm4gYSBpbnN0YW5jZW9mIERhdGUgJiYgYiBpbnN0YW5jZW9mIERhdGUgJiYgYS5nZXRUaW1lKCkgPT09IGIuZ2V0VGltZSgpO1xuICBpZiAoYSBpbnN0YW5jZW9mIFJlZ0V4cCB8fCBiIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gU3RyaW5nKGEpID09PSBTdHJpbmcoYik7XG4gIGlmIChhIGluc3RhbmNlb2YgTWFwIHx8IGIgaW5zdGFuY2VvZiBNYXApIHtcbiAgICBpZiAoIShhIGluc3RhbmNlb2YgTWFwICYmIGIgaW5zdGFuY2VvZiBNYXApIHx8IGEuc2l6ZSAhPT0gYi5zaXplKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgYikgaWYgKCFhLmhhcyhrKSB8fCAhZXF1YWxzKGEuZ2V0KGspLCB2LCBwYXJ0aWFsLCBzZWVuKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChhIGluc3RhbmNlb2YgU2V0IHx8IGIgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICBpZiAoIShhIGluc3RhbmNlb2YgU2V0ICYmIGIgaW5zdGFuY2VvZiBTZXQpIHx8IGEuc2l6ZSAhPT0gYi5zaXplKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChjb25zdCB2IG9mIGIpIGlmICghYS5oYXModikgJiYgIVsuLi5hXS5zb21lKCh4KSA9PiBlcXVhbHMoeCwgdiwgcGFydGlhbCwgc2VlbikpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKEFycmF5QnVmZmVyLmlzVmlldyhhKSB8fCBBcnJheUJ1ZmZlci5pc1ZpZXcoYikpIHJldHVybiBpc0RlZXBTdHJpY3RFcXVhbChhLCBiKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkgIT09IEFycmF5LmlzQXJyYXkoYikpIHJldHVybiBmYWxzZTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkgJiYgQXJyYXkuaXNBcnJheShiKSkge1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYi5ldmVyeSgodiwgaSkgPT4gZXF1YWxzKGFbaV0sIHYsIHBhcnRpYWwsIHNlZW4pKTtcbiAgfVxuICBjb25zdCBhbyA9IGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGJvID0gYiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3Qga2V5cyA9IChvOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gT2JqZWN0LmtleXMobykuZmlsdGVyKChrKSA9PiBvW2tdICE9PSB1bmRlZmluZWQpO1xuICBpZiAocGFydGlhbCkgcmV0dXJuIE9iamVjdC5rZXlzKGJvKS5ldmVyeSgoaykgPT4gKGJvW2tdID09PSB1bmRlZmluZWQgPyBhb1trXSA9PT0gdW5kZWZpbmVkIDogayBpbiBhbyAmJiBlcXVhbHMoYW9ba10sIGJvW2tdLCB0cnVlLCBzZWVuKSkpO1xuICBjb25zdCBrYSA9IGtleXMoYW8pLCBrYiA9IGtleXMoYm8pO1xuICBpZiAoa2EubGVuZ3RoICE9PSBrYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGtiLmV2ZXJ5KChrKSA9PiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYW8sIGspICYmIGVxdWFscyhhb1trXSwgYm9ba10sIGZhbHNlLCBzZWVuKSk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBzbmFwc2hvdHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmxldCBjdXJyZW50OiB7IG5hbWU6IHN0cmluZzsgY291bnRzOiBNYXA8c3RyaW5nLCBudW1iZXI+IH0gPSB7IG5hbWU6IFwiXCIsIGNvdW50czogbmV3IE1hcCgpIH07XG5jb25zdCBzbmFwQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4oKTtcbmNvbnN0IGRpcnR5U25hcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuLyoqXG4gKiBzY3JpcHRzL3Rlc3QubWpzIGJ1bmRsZXMgd2ViLzxkaXI+L3gudGVzdC50cyB0byB3ZWIvLnRlc3QtZGlzdC88ZGlyPi94LnRlc3QubWpzIGFuZCBub2RlIC0tdGVzdFxuICogcnVucyBlYWNoIGJ1bmRsZSBhcyBpdHMgb3duIHByb2Nlc3MsIHNvIHRoZSBzb3VyY2UgcGF0aCBmb2xsb3dzIGZyb20gdGhlIHNjcmlwdCBwYXRoLlxuICovXG5mdW5jdGlvbiBzbmFwRmlsZSgpOiBzdHJpbmcge1xuICBjb25zdCByb290ID0gcHJvY2Vzcy5lbnYuSVJPTlRFUk1fVEVTVF9ST09UO1xuICBjb25zdCBzY3JpcHQgPSBwcm9jZXNzLmFyZ3ZbMV0gPz8gXCJcIjtcbiAgY29uc3QgZGlzdCA9IHJvb3QgPyBqb2luKHJvb3QsIFwiLnRlc3QtZGlzdFwiKSA6IFwiXCI7XG4gIGlmICghcm9vdCB8fCAhc2NyaXB0LnN0YXJ0c1dpdGgoZGlzdCkpIHRocm93IG5ldyBFcnJvcihcInRvTWF0Y2hTbmFwc2hvdDogcnVuIHRlc3RzIHRocm91Z2ggc2NyaXB0cy90ZXN0Lm1qc1wiKTtcbiAgY29uc3Qgc3JjID0gam9pbihyb290LCByZWxhdGl2ZShkaXN0LCBzY3JpcHQpKS5yZXBsYWNlKC9cXC5tanMkLywgXCIudHNcIik7XG4gIHJldHVybiBqb2luKGRpcm5hbWUoc3JjKSwgXCJfX3NuYXBzaG90c19fXCIsIHNyYy5zcGxpdChcIi9cIikucG9wKCkgKyBcIi5zbmFwXCIpO1xufVxuXG5mdW5jdGlvbiBsb2FkU25hcHMoZmlsZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gIGxldCBzbmFwcyA9IHNuYXBDYWNoZS5nZXQoZmlsZSk7XG4gIGlmICghc25hcHMpIHtcbiAgICBzbmFwcyA9IHt9O1xuICAgIGlmIChleGlzdHNTeW5jKGZpbGUpKSBuZXcgRnVuY3Rpb24oXCJleHBvcnRzXCIsIHJlYWRGaWxlU3luYyhmaWxlLCBcInV0ZjhcIikpKHNuYXBzKTtcbiAgICBzbmFwQ2FjaGUuc2V0KGZpbGUsIHNuYXBzKTtcbiAgfVxuICByZXR1cm4gc25hcHM7XG59XG5cbi8qKiBUaGUgdml0ZXN0IHNuYXBzaG90IGZvcm1hdCBmb3IgdGhlIHZhbHVlcyB0aGUgdGVzdHMgc25hcHNob3QgKHN0cmluZ3M7IEpTT04gb3RoZXJ3aXNlKS4gKi9cbmNvbnN0IHNlcmlhbGl6ZSA9ICh2OiB1bmtub3duKSA9PiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyBgXCIke3Z9XCJgIDogSlNPTi5zdHJpbmdpZnkodiwgbnVsbCwgMikpO1xuY29uc3QgZXNjYXBlVGVtcGxhdGUgPSAoczogc3RyaW5nKSA9PiBzLnJlcGxhY2UoL1xcXFwvZywgXCJcXFxcXFxcXFwiKS5yZXBsYWNlKC9gL2csIFwiXFxcXGBcIikucmVwbGFjZSgvXFwkXFx7L2csIFwiXFxcXCR7XCIpO1xuXG5wcm9jZXNzLm9uKFwiZXhpdFwiLCAoKSA9PiB7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBkaXJ0eVNuYXBzKSB7XG4gICAgY29uc3Qgc25hcHMgPSBzbmFwQ2FjaGUuZ2V0KGZpbGUpITtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmtleXMoc25hcHMpLnNvcnQoKS5tYXAoKGspID0+IGBleHBvcnRzW1xcYCR7ZXNjYXBlVGVtcGxhdGUoayl9XFxgXSA9IFxcYCR7ZXNjYXBlVGVtcGxhdGUoc25hcHNba10pfVxcYDtcXG5gKS5qb2luKFwiXFxuXCIpO1xuICAgIG1rZGlyU3luYyhkaXJuYW1lKGZpbGUpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB3cml0ZUZpbGVTeW5jKGZpbGUsIGAvLyBWaXRlc3QgU25hcHNob3QgdjEsIGh0dHBzOi8vdml0ZXN0LmRldi9ndWlkZS9zbmFwc2hvdC5odG1sXFxuXFxuJHtib2R5fWApO1xuICAgIGNvbnNvbGUubG9nKGB1cGRhdGVkICR7cmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgZmlsZSl9YCk7XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiBtYXRjaFNuYXBzaG90KGFjdHVhbDogdW5rbm93biwgaGludD86IHN0cmluZykge1xuICBjb25zdCBiYXNlID0gaGludCA/IGAke2N1cnJlbnQubmFtZX0gPiAke2hpbnR9YCA6IGN1cnJlbnQubmFtZTtcbiAgY29uc3QgbiA9IChjdXJyZW50LmNvdW50cy5nZXQoYmFzZSkgPz8gMCkgKyAxO1xuICBjdXJyZW50LmNvdW50cy5zZXQoYmFzZSwgbik7XG4gIGNvbnN0IGtleSA9IGAke2Jhc2V9ICR7bn1gO1xuICBjb25zdCBmaWxlID0gc25hcEZpbGUoKTtcbiAgY29uc3Qgc25hcHMgPSBsb2FkU25hcHMoZmlsZSk7XG4gIGNvbnN0IGdvdCA9IGBcXG4ke3NlcmlhbGl6ZShhY3R1YWwpfVxcbmA7XG4gIC8vIGxpa2Ugdml0ZXN0LCBDSSBuZXZlciB3cml0ZXMgYSBtaXNzaW5nIHNuYXBzaG90OiBpdCBmYWlsc1xuICBpZiAoIShrZXkgaW4gc25hcHMpICYmIHByb2Nlc3MuZW52LkNJICYmICFwcm9jZXNzLmVudi5VUERBVEVfU05BUFNIT1RTKSByZXR1cm4geyBwYXNzOiBmYWxzZSwgbWVzc2FnZTogYG1pc3Npbmcgc25hcHNob3QgXCIke2tleX1cIiAocnVuIHRoZSB0ZXN0cyBsb2NhbGx5IGFuZCBjb21taXQgdGhlIC5zbmFwIGZpbGUpYCB9O1xuICBpZiAocHJvY2Vzcy5lbnYuVVBEQVRFX1NOQVBTSE9UUyB8fCAhKGtleSBpbiBzbmFwcykpIHtcbiAgICBpZiAoc25hcHNba2V5XSAhPT0gZ290KSB7IHNuYXBzW2tleV0gPSBnb3Q7IGRpcnR5U25hcHMuYWRkKGZpbGUpOyB9XG4gICAgcmV0dXJuIHsgcGFzczogdHJ1ZSwgbWVzc2FnZTogXCJcIiB9O1xuICB9XG4gIHJldHVybiB7IHBhc3M6IHNuYXBzW2tleV0gPT09IGdvdCwgbWVzc2FnZTogYHNuYXBzaG90IFwiJHtrZXl9XCIgZGlmZmVyczpcXG5leHBlY3RlZDoke3NuYXBzW2tleV19XFxucmVjZWl2ZWQ6JHtnb3R9KFVQREFURV9TTkFQU0hPVFM9MSBwbnBtIHRlc3QgdG8gYWNjZXB0KWAgfTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGV4cGVjdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3Qgc2hvdyA9ICh2OiB1bmtub3duKSA9PiAoaXNBc3ltbWV0cmljKHYpID8gdi50b1N0cmluZygpIDogaW5zcGVjdCh2LCB7IGRlcHRoOiA2LCBicmVha0xlbmd0aDogMTIwIH0pKTtcblxudHlwZSBSZXN1bHQgPSB7IHBhc3M6IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZyB9O1xudHlwZSBNYXRjaGVycyA9IFJlY29yZDxzdHJpbmcsIChhY3R1YWw6IHVua25vd24sIC4uLmFyZ3M6IGFueVtdKSA9PiBSZXN1bHQ+O1xuXG5jb25zdCBtYXRjaGVyczogTWF0Y2hlcnMgPSB7XG4gIHRvQmU6IChhLCBiKSA9PiAoeyBwYXNzOiBPYmplY3QuaXMoYSwgYiksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlICR7c2hvdyhiKX1gIH0pLFxuICB0b0VxdWFsOiAoYSwgYikgPT4gKHsgcGFzczogZXF1YWxzKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBlcXVhbCAke3Nob3coYil9YCB9KSxcbiAgdG9TdHJpY3RFcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IGlzRGVlcFN0cmljdEVxdWFsKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBzdHJpY3RseSBlcXVhbCAke3Nob3coYil9YCB9KSxcbiAgdG9NYXRjaE9iamVjdDogKGEsIGIpID0+ICh7IHBhc3M6IGVxdWFscyhhLCBiLCB0cnVlKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gbWF0Y2ggb2JqZWN0ICR7c2hvdyhiKX1gIH0pLFxuICB0b0JlQ2xvc2VUbzogKGEsIGI6IG51bWJlciwgZGlnaXRzID0gMikgPT4gKHtcbiAgICBwYXNzOiB0eXBlb2YgYSA9PT0gXCJudW1iZXJcIiAmJiAoYSA9PT0gYiB8fCBNYXRoLmFicyhhIC0gYikgPCAxMCAqKiAtZGlnaXRzIC8gMiksXG4gICAgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgY2xvc2UgdG8gJHtifSAoJHtkaWdpdHN9IGRpZ2l0cylgLFxuICB9KSxcbiAgdG9CZUdyZWF0ZXJUaGFuOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA+IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9ID4gJHtifWAgfSksXG4gIHRvQmVHcmVhdGVyVGhhbk9yRXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpID49IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9ID49ICR7Yn1gIH0pLFxuICB0b0JlTGVzc1RoYW46IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpIDwgYiwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gPCAke2J9YCB9KSxcbiAgdG9CZUxlc3NUaGFuT3JFcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IChhIGFzIG51bWJlcikgPD0gYiwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gPD0gJHtifWAgfSksXG4gIHRvSGF2ZUxlbmd0aDogKGEsIG4pID0+ICh7IHBhc3M6IChhIGFzIHsgbGVuZ3RoPzogbnVtYmVyIH0pPy5sZW5ndGggPT09IG4sIG1lc3NhZ2U6IGBleHBlY3RlZCBsZW5ndGggJHtufSwgZ290ICR7KGEgYXMgeyBsZW5ndGg/OiBudW1iZXIgfSk/Lmxlbmd0aH0gKCR7c2hvdyhhKX0pYCB9KSxcbiAgdG9IYXZlUHJvcGVydHk6IChhLCBrZXk6IHN0cmluZywgLi4udjogdW5rbm93bltdKSA9PiB7XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdChcIi5cIik7XG4gICAgbGV0IG86IGFueSA9IGE7XG4gICAgZm9yIChjb25zdCBrIG9mIHBhdGgpIHsgaWYgKG8gPT0gbnVsbCB8fCAhKGsgaW4gT2JqZWN0KG8pKSkgcmV0dXJuIHsgcGFzczogZmFsc2UsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGhhdmUgcHJvcGVydHkgJHtrZXl9YCB9OyBvID0gb1trXTsgfVxuICAgIHJldHVybiB7IHBhc3M6IHYubGVuZ3RoID09PSAwIHx8IGVxdWFscyhvLCB2WzBdKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gaGF2ZSAke2tleX0gPSAke3Nob3codlswXSl9LCBnb3QgJHtzaG93KG8pfWAgfTtcbiAgfSxcbiAgdG9CZU51bGw6IChhKSA9PiAoeyBwYXNzOiBhID09PSBudWxsLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSBudWxsYCB9KSxcbiAgdG9CZVVuZGVmaW5lZDogKGEpID0+ICh7IHBhc3M6IGEgPT09IHVuZGVmaW5lZCwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgdW5kZWZpbmVkYCB9KSxcbiAgdG9CZURlZmluZWQ6IChhKSA9PiAoeyBwYXNzOiBhICE9PSB1bmRlZmluZWQsIG1lc3NhZ2U6IGBleHBlY3RlZCBhIGRlZmluZWQgdmFsdWVgIH0pLFxuICB0b0JlVHJ1dGh5OiAoYSkgPT4gKHsgcGFzczogISFhLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSB0cnV0aHlgIH0pLFxuICB0b0JlRmFsc3k6IChhKSA9PiAoeyBwYXNzOiAhYSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgZmFsc3lgIH0pLFxuICB0b0JlTmFOOiAoYSkgPT4gKHsgcGFzczogTnVtYmVyLmlzTmFOKGEpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSBOYU5gIH0pLFxuICB0b0JlSW5zdGFuY2VPZjogKGEsIGNscykgPT4gKHsgcGFzczogYSBpbnN0YW5jZW9mIGNscywgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgYW4gaW5zdGFuY2Ugb2YgJHtjbHM/Lm5hbWV9YCB9KSxcbiAgdG9CZVR5cGVPZjogKGEsIHQ6IHN0cmluZykgPT4gKHsgcGFzczogdHlwZW9mIGEgPT09IHQsIG1lc3NhZ2U6IGBleHBlY3RlZCB0eXBlb2YgJHtzaG93KGEpfSB0byBiZSAke3R9YCB9KSxcbiAgdG9NYXRjaDogKGEsIHJlOiBSZWdFeHAgfCBzdHJpbmcpID0+ICh7XG4gICAgcGFzczogdHlwZW9mIGEgPT09IFwic3RyaW5nXCIgJiYgKHR5cGVvZiByZSA9PT0gXCJzdHJpbmdcIiA/IGEuaW5jbHVkZXMocmUpIDogcmUudGVzdChhKSksXG4gICAgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gbWF0Y2ggJHtTdHJpbmcocmUpfWAsXG4gIH0pLFxuICB0b0NvbnRhaW46IChhLCBpdGVtKSA9PiAoe1xuICAgIHBhc3M6IHR5cGVvZiBhID09PSBcInN0cmluZ1wiID8gYS5pbmNsdWRlcyhpdGVtIGFzIHN0cmluZykgOiBBcnJheS5pc0FycmF5KGEpIHx8IGEgaW5zdGFuY2VvZiBTZXQgPyBbLi4uKGEgYXMgSXRlcmFibGU8dW5rbm93bj4pXS5pbmNsdWRlcyhpdGVtKSA6IGZhbHNlLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGNvbnRhaW4gJHtzaG93KGl0ZW0pfWAsXG4gIH0pLFxuICB0b0NvbnRhaW5FcXVhbDogKGEsIGl0ZW0pID0+ICh7IHBhc3M6IEFycmF5LmlzQXJyYXkoYSkgJiYgYS5zb21lKCh4KSA9PiBlcXVhbHMoeCwgaXRlbSkpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBjb250YWluIGFuIGl0ZW0gZXF1YWwgdG8gJHtzaG93KGl0ZW0pfWAgfSksXG4gIHRvVGhyb3c6IChmbk9yRXJyb3IsIGV4cGVjdGVkPzogdW5rbm93bikgPT4ge1xuICAgIGxldCBlcnI6IHVua25vd24sIHRocmV3ID0gZmFsc2U7XG4gICAgaWYgKHR5cGVvZiBmbk9yRXJyb3IgPT09IFwiZnVuY3Rpb25cIikgeyB0cnkgeyAoZm5PckVycm9yIGFzICgpID0+IHVua25vd24pKCk7IH0gY2F0Y2ggKGUpIHsgdGhyZXcgPSB0cnVlOyBlcnIgPSBlOyB9IH1cbiAgICBlbHNlIHsgdGhyZXcgPSB0cnVlOyBlcnIgPSBmbk9yRXJyb3I7IH0gLy8gZnJvbSAucmVqZWN0c1xuICAgIGNvbnN0IG1zZyA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICBsZXQgcGFzcyA9IHRocmV3O1xuICAgIGlmICh0aHJldyAmJiBleHBlY3RlZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcInN0cmluZ1wiKSBwYXNzID0gbXNnLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgIGVsc2UgaWYgKGV4cGVjdGVkIGluc3RhbmNlb2YgUmVnRXhwKSBwYXNzID0gZXhwZWN0ZWQudGVzdChtc2cpO1xuICAgICAgZWxzZSBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcImZ1bmN0aW9uXCIpIHBhc3MgPSBlcnIgaW5zdGFuY2VvZiAoZXhwZWN0ZWQgYXMgbmV3ICgpID0+IHVua25vd24pO1xuICAgICAgZWxzZSBpZiAoZXhwZWN0ZWQgaW5zdGFuY2VvZiBFcnJvcikgcGFzcyA9IG1zZyA9PT0gZXhwZWN0ZWQubWVzc2FnZTtcbiAgICB9XG4gICAgcmV0dXJuIHsgcGFzcywgbWVzc2FnZTogdGhyZXcgPyBgZXhwZWN0ZWQgdGhlIGVycm9yICgke21zZ30pIHRvIG1hdGNoICR7c2hvdyhleHBlY3RlZCl9YCA6IGBleHBlY3RlZCBhIHRocm93JHtleHBlY3RlZCA9PT0gdW5kZWZpbmVkID8gXCJcIiA6IGAgbWF0Y2hpbmcgJHtzaG93KGV4cGVjdGVkKX1gfWAgfTtcbiAgfSxcbiAgdG9NYXRjaFNuYXBzaG90OiAoYSwgaGludD86IHN0cmluZykgPT4gbWF0Y2hTbmFwc2hvdChhLCBoaW50KSxcbn07XG5tYXRjaGVycy50b1Rocm93RXJyb3IgPSBtYXRjaGVycy50b1Rocm93O1xuY29uc3QgY2FsbHMgPSAoYTogdW5rbm93bikgPT4geyBpZiAoIWlzTW9jayhhKSkgdGhyb3cgbmV3IFR5cGVFcnJvcihgJHtzaG93KGEpfSBpcyBub3QgYSB2aS5mbigpYCk7IHJldHVybiBhLm1vY2suY2FsbHM7IH07XG5tYXRjaGVycy50b0hhdmVCZWVuQ2FsbGVkID0gKGEpID0+ICh7IHBhc3M6IGNhbGxzKGEpLmxlbmd0aCA+IDAsIG1lc3NhZ2U6IFwiZXhwZWN0ZWQgdGhlIG1vY2sgdG8gaGF2ZSBiZWVuIGNhbGxlZFwiIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZFRpbWVzID0gKGEsIG46IG51bWJlcikgPT4gKHsgcGFzczogY2FsbHMoYSkubGVuZ3RoID09PSBuLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtufSBjYWxscywgZ290ICR7Y2FsbHMoYSkubGVuZ3RofWAgfSk7XG5tYXRjaGVycy50b0hhdmVCZWVuQ2FsbGVkV2l0aCA9IChhLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGNhbGxzKGEpLnNvbWUoKGMpID0+IGVxdWFscyhjLCBhcmdzKSksIG1lc3NhZ2U6IGBleHBlY3RlZCBhIGNhbGwgd2l0aCAke3Nob3coYXJncyl9OyBjYWxsczogJHtzaG93KGNhbGxzKGEpKX1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkxhc3RDYWxsZWRXaXRoID0gKGEsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gKHsgcGFzczogZXF1YWxzKGNhbGxzKGEpLmF0KC0xKSwgYXJncyksIG1lc3NhZ2U6IGBleHBlY3RlZCB0aGUgbGFzdCBjYWxsIHRvIGJlICR7c2hvdyhhcmdzKX07IGNhbGxzOiAke3Nob3coY2FsbHMoYSkpfWAgfSk7XG5tYXRjaGVycy50b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aCA9IChhLCBuOiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gKHsgcGFzczogZXF1YWxzKGNhbGxzKGEpW24gLSAxXSwgYXJncyksIG1lc3NhZ2U6IGBleHBlY3RlZCBjYWxsICR7bn0gdG8gYmUgJHtzaG93KGFyZ3MpfTsgY2FsbHM6ICR7c2hvdyhjYWxscyhhKSl9YCB9KTtcblxuLyoqIFRoZSBtYXRjaGVycywgdHlwZWQgKFIgPSB2b2lkLCBvciBQcm9taXNlPHZvaWQ+IGFmdGVyIC5yZXNvbHZlcyAvIC5yZWplY3RzKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXNzZXJ0aW9uPFIgPSB2b2lkPiB7XG4gIHRvQmUoZXhwZWN0ZWQ6IHVua25vd24pOiBSO1xuICB0b0VxdWFsKGV4cGVjdGVkOiB1bmtub3duKTogUjtcbiAgdG9TdHJpY3RFcXVhbChleHBlY3RlZDogdW5rbm93bik6IFI7XG4gIHRvTWF0Y2hPYmplY3QoZXhwZWN0ZWQ6IG9iamVjdCk6IFI7XG4gIHRvQmVDbG9zZVRvKGV4cGVjdGVkOiBudW1iZXIsIGRpZ2l0cz86IG51bWJlcik6IFI7XG4gIHRvQmVHcmVhdGVyVGhhbihuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlR3JlYXRlclRoYW5PckVxdWFsKG46IG51bWJlciB8IGJpZ2ludCk6IFI7XG4gIHRvQmVMZXNzVGhhbihuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlTGVzc1RoYW5PckVxdWFsKG46IG51bWJlciB8IGJpZ2ludCk6IFI7XG4gIHRvSGF2ZUxlbmd0aChuOiBudW1iZXIpOiBSO1xuICB0b0hhdmVQcm9wZXJ0eShwYXRoOiBzdHJpbmcsIHZhbHVlPzogdW5rbm93bik6IFI7XG4gIHRvQmVOdWxsKCk6IFI7XG4gIHRvQmVVbmRlZmluZWQoKTogUjtcbiAgdG9CZURlZmluZWQoKTogUjtcbiAgdG9CZVRydXRoeSgpOiBSO1xuICB0b0JlRmFsc3koKTogUjtcbiAgdG9CZU5hTigpOiBSO1xuICB0b0JlSW5zdGFuY2VPZihjbHM6IGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bik6IFI7XG4gIHRvQmVUeXBlT2YodHlwZTogXCJzdHJpbmdcIiB8IFwibnVtYmVyXCIgfCBcImJpZ2ludFwiIHwgXCJib29sZWFuXCIgfCBcInN5bWJvbFwiIHwgXCJ1bmRlZmluZWRcIiB8IFwib2JqZWN0XCIgfCBcImZ1bmN0aW9uXCIpOiBSO1xuICB0b01hdGNoKGV4cGVjdGVkOiBSZWdFeHAgfCBzdHJpbmcpOiBSO1xuICB0b0NvbnRhaW4oaXRlbTogdW5rbm93bik6IFI7XG4gIHRvQ29udGFpbkVxdWFsKGl0ZW06IHVua25vd24pOiBSO1xuICB0b1Rocm93KGV4cGVjdGVkPzogc3RyaW5nIHwgUmVnRXhwIHwgRXJyb3IgfCAoYWJzdHJhY3QgbmV3ICguLi5hcmdzOiBuZXZlcltdKSA9PiB1bmtub3duKSk6IFI7XG4gIHRvVGhyb3dFcnJvcihleHBlY3RlZD86IHN0cmluZyB8IFJlZ0V4cCB8IEVycm9yIHwgKGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bikpOiBSO1xuICB0b01hdGNoU25hcHNob3QoaGludD86IHN0cmluZyk6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWQoKTogUjtcbiAgdG9IYXZlQmVlbkNhbGxlZFRpbWVzKG46IG51bWJlcik6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWRXaXRoKC4uLmFyZ3M6IHVua25vd25bXSk6IFI7XG4gIHRvSGF2ZUJlZW5MYXN0Q2FsbGVkV2l0aCguLi5hcmdzOiB1bmtub3duW10pOiBSO1xuICB0b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aChuOiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSk6IFI7XG59XG5cbnR5cGUgRXhwZWN0YXRpb24gPSBBc3NlcnRpb24gJiB7XG4gIG5vdDogQXNzZXJ0aW9uO1xuICByZXNvbHZlczogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+ICYgeyBub3Q6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiB9O1xuICByZWplY3RzOiBBc3NlcnRpb248UHJvbWlzZTx2b2lkPj4gJiB7IG5vdDogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+IH07XG59O1xuXG5mdW5jdGlvbiBmYWlsKHI6IFJlc3VsdCwgbmVnYXRlOiBib29sZWFuLCBsYWJlbD86IHN0cmluZykge1xuICBpZiAoci5wYXNzID09PSBuZWdhdGUpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gKGxhYmVsID8gYCR7bGFiZWx9OiBgIDogXCJcIikgKyAobmVnYXRlID8gYG5vdDogJHtyLm1lc3NhZ2V9YCA6IHIubWVzc2FnZSk7XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKHsgbWVzc2FnZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZChhY3R1YWw6ICgpID0+IHVua25vd24sIG5lZ2F0ZTogYm9vbGVhbiwgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXN5bmM6IGZhbHNlKTogQXNzZXJ0aW9uO1xuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiBQcm9taXNlPHVua25vd24+LCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiB0cnVlKTogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+O1xuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiB1bmtub3duLCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiBib29sZWFuKTogdW5rbm93biB7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgZm9yIChjb25zdCBbbmFtZSwgbV0gb2YgT2JqZWN0LmVudHJpZXMobWF0Y2hlcnMpKSB7XG4gICAgb3V0W25hbWVdID0gYXN5bmNcbiAgICAgID8gYXN5bmMgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZmFpbChtKGF3YWl0IGFjdHVhbCgpLCAuLi5hcmdzKSwgbmVnYXRlLCBsYWJlbClcbiAgICAgIDogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZmFpbChtKGFjdHVhbCgpLCAuLi5hcmdzKSwgbmVnYXRlLCBsYWJlbCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGVjdDxUPihhY3R1YWw6IFQsIGxhYmVsPzogc3RyaW5nKTogRXhwZWN0YXRpb24ge1xuICBjb25zdCBlID0gYnVpbGQoKCkgPT4gYWN0dWFsLCBmYWxzZSwgbGFiZWwsIGZhbHNlKSBhcyBFeHBlY3RhdGlvbjtcbiAgZS5ub3QgPSBidWlsZCgoKSA9PiBhY3R1YWwsIHRydWUsIGxhYmVsLCBmYWxzZSk7XG4gIGNvbnN0IHNldHRsZSA9ICh3YW50OiBcInJlc29sdmVcIiB8IFwicmVqZWN0XCIpID0+IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdiA9IGF3YWl0IChhY3R1YWwgYXMgdW5rbm93biBhcyBQcm9taXNlPHVua25vd24+KTtcbiAgICAgIGlmICh3YW50ID09PSBcInJlamVjdFwiKSB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiBgJHtsYWJlbCA/IGxhYmVsICsgXCI6IFwiIDogXCJcIn1leHBlY3RlZCBhIHJlamVjdGlvbiwgZ290ICR7c2hvdyh2KX1gIH0pO1xuICAgICAgcmV0dXJuIHY7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyIGluc3RhbmNlb2YgQXNzZXJ0aW9uRXJyb3IgJiYgd2FudCA9PT0gXCJyZWplY3RcIikgdGhyb3cgZXJyO1xuICAgICAgaWYgKHdhbnQgPT09IFwicmVzb2x2ZVwiKSB0aHJvdyBlcnI7XG4gICAgICByZXR1cm4gZXJyO1xuICAgIH1cbiAgfTtcbiAgZS5yZXNvbHZlcyA9IE9iamVjdC5hc3NpZ24oYnVpbGQoc2V0dGxlKFwicmVzb2x2ZVwiKSwgZmFsc2UsIGxhYmVsLCB0cnVlKSwgeyBub3Q6IGJ1aWxkKHNldHRsZShcInJlc29sdmVcIiksIHRydWUsIGxhYmVsLCB0cnVlKSB9KTtcbiAgZS5yZWplY3RzID0gT2JqZWN0LmFzc2lnbihidWlsZChzZXR0bGUoXCJyZWplY3RcIiksIGZhbHNlLCBsYWJlbCwgdHJ1ZSksIHsgbm90OiBidWlsZChzZXR0bGUoXCJyZWplY3RcIiksIHRydWUsIGxhYmVsLCB0cnVlKSB9KTtcbiAgcmV0dXJuIGU7XG59XG5cbmNvbnN0IGFzeW1tZXRyaWMgPSAobmFtZTogc3RyaW5nLCB0ZXN0OiAodjogdW5rbm93bikgPT4gYm9vbGVhbik6IEFzeW1tZXRyaWMgPT4gKHsgYXN5bW1ldHJpY01hdGNoOiB0ZXN0LCB0b1N0cmluZzogKCkgPT4gbmFtZSB9KTtcblxuZXhwZWN0LmNsb3NlVG8gPSAobjogbnVtYmVyLCBkaWdpdHMgPSAyKSA9PiBhc3ltbWV0cmljKGBjbG9zZVRvKCR7bn0sICR7ZGlnaXRzfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwibnVtYmVyXCIgJiYgTWF0aC5hYnModiAtIG4pIDwgMTAgKiogLWRpZ2l0cyAvIDIpO1xuZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcgPSAobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IGFzeW1tZXRyaWMoYG9iamVjdENvbnRhaW5pbmcoJHtzaG93KG8pfSlgLCAodikgPT4gZXF1YWxzKHYsIG8sIHRydWUpKTtcbmV4cGVjdC5hcnJheUNvbnRhaW5pbmcgPSAoeHM6IHVua25vd25bXSkgPT4gYXN5bW1ldHJpYyhgYXJyYXlDb250YWluaW5nKCR7c2hvdyh4cyl9KWAsICh2KSA9PiBBcnJheS5pc0FycmF5KHYpICYmIHhzLmV2ZXJ5KCh4KSA9PiB2LnNvbWUoKHkpID0+IGVxdWFscyh5LCB4KSkpKTtcbmV4cGVjdC5zdHJpbmdDb250YWluaW5nID0gKHM6IHN0cmluZykgPT4gYXN5bW1ldHJpYyhgc3RyaW5nQ29udGFpbmluZygke3Nob3cocyl9KWAsICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2LmluY2x1ZGVzKHMpKTtcbmV4cGVjdC5zdHJpbmdNYXRjaGluZyA9IChyZTogUmVnRXhwIHwgc3RyaW5nKSA9PiBhc3ltbWV0cmljKGBzdHJpbmdNYXRjaGluZygke1N0cmluZyhyZSl9KWAsICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiAodHlwZW9mIHJlID09PSBcInN0cmluZ1wiID8gdi5pbmNsdWRlcyhyZSkgOiByZS50ZXN0KHYpKSk7XG5leHBlY3QuYW55ID0gKGNsczogdW5rbm93bikgPT4gYXN5bW1ldHJpYyhgYW55KCR7KGNscyBhcyB7IG5hbWU/OiBzdHJpbmcgfSk/Lm5hbWV9KWAsICh2KSA9PlxuICBjbHMgPT09IFN0cmluZyA/IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiIDogY2xzID09PSBOdW1iZXIgPyB0eXBlb2YgdiA9PT0gXCJudW1iZXJcIiA6IGNscyA9PT0gQm9vbGVhbiA/IHR5cGVvZiB2ID09PSBcImJvb2xlYW5cIiA6IGNscyA9PT0gRnVuY3Rpb24gPyB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiIDogdiBpbnN0YW5jZW9mIChjbHMgYXMgbmV3ICgpID0+IHVua25vd24pKTtcbmV4cGVjdC5hbnl0aGluZyA9ICgpID0+IGFzeW1tZXRyaWMoXCJhbnl0aGluZygpXCIsICh2KSA9PiB2ICE9IG51bGwpO1xuXG4iLCAiLy8gVGhlIHRlc3QgQVBJIGl0c2VsZjogZXZlcnkgbWF0Y2hlciBwYXNzZXMgd2hlbiBpdCBzaG91bGQgYW5kLCBtb3JlIGltcG9ydGFudGx5LCBmYWlscyB3aGVuIGl0IHNob3VsZC5cbmltcG9ydCB7IGFmdGVyQWxsLCBiZWZvcmVBbGwsIGRlc2NyaWJlLCBleHBlY3QsIGl0LCB2aSB9IGZyb20gXCJ2aXRlc3RcIjtcblxuY29uc3QgZmFpbHMgPSAoZm46ICgpID0+IHZvaWQpID0+IHtcbiAgbGV0IHRocmV3ID0gZmFsc2U7XG4gIHRyeSB7IGZuKCk7IH0gY2F0Y2ggeyB0aHJldyA9IHRydWU7IH1cbiAgaWYgKCF0aHJldykgdGhyb3cgbmV3IEVycm9yKFwiZXhwZWN0ZWQgdGhlIGFzc2VydGlvbiB0byBmYWlsXCIpO1xufTtcblxuZGVzY3JpYmUoXCJlcXVhbGl0eVwiLCAoKSA9PiB7XG4gIGl0KFwidG9CZSBpcyBPYmplY3QuaXNcIiwgKCkgPT4ge1xuICAgIGV4cGVjdCgxKS50b0JlKDEpO1xuICAgIGV4cGVjdChOYU4pLnRvQmUoTmFOKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3Qoe30pLnRvQmUoe30pKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoMCkudG9CZSgtMCkpO1xuICAgIGV4cGVjdCgxKS5ub3QudG9CZSgyKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoMSkubm90LnRvQmUoMSkpO1xuICB9KTtcblxuICBpdChcInRvRXF1YWwgaXMgZGVlcCBhbmQgaWdub3JlcyB1bmRlZmluZWQgcHJvcGVydGllc1wiLCAoKSA9PiB7XG4gICAgZXhwZWN0KHsgYTogMSwgYjogWzEsIHsgYzogMiB9XSwgdTogdW5kZWZpbmVkIH0pLnRvRXF1YWwoeyBhOiAxLCBiOiBbMSwgeyBjOiAyIH1dIH0pO1xuICAgIGV4cGVjdChuZXcgTWFwKFtbXCJrXCIsIHsgdjogMSB9XV0pKS50b0VxdWFsKG5ldyBNYXAoW1tcImtcIiwgeyB2OiAxIH1dXSkpO1xuICAgIGV4cGVjdChuZXcgU2V0KFsxLCAyXSkpLnRvRXF1YWwobmV3IFNldChbMiwgMV0pKTtcbiAgICBleHBlY3QobmV3IERhdGUoNSkpLnRvRXF1YWwobmV3IERhdGUoNSkpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdCh7IGE6IDEgfSkudG9FcXVhbCh7IGE6IDEsIGI6IDIgfSkpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdChbMSwgMl0pLnRvRXF1YWwoWzEsIDIsIDNdKSk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KFsxLCAyXSkudG9FcXVhbCh7IDA6IDEsIDE6IDIgfSkpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdChuZXcgRGF0ZSg1KSkudG9FcXVhbChuZXcgRGF0ZSg2KSkpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdChuZXcgTWFwKFtbXCJrXCIsIDFdXSkpLnRvRXF1YWwobmV3IE1hcChbW1wia1wiLCAyXV0pKSk7XG4gIH0pO1xuXG4gIGl0KFwidG9NYXRjaE9iamVjdCBpcyBhIHJlY3Vyc2l2ZSBzdWJzZXQ7IGFycmF5cyBtYXRjaCBlbGVtZW50IGJ5IGVsZW1lbnRcIiwgKCkgPT4ge1xuICAgIGV4cGVjdCh7IGE6IDEsIGI6IHsgYzogMiwgZDogMyB9LCBlOiBbeyBmOiAxLCBnOiAyIH1dIH0pLnRvTWF0Y2hPYmplY3QoeyBiOiB7IGM6IDIgfSwgZTogW3sgZjogMSB9XSB9KTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoeyBhOiAxIH0pLnRvTWF0Y2hPYmplY3QoeyBhOiAyIH0pKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoeyBlOiBbeyBmOiAxIH0sIHsgZjogMiB9XSB9KS50b01hdGNoT2JqZWN0KHsgZTogW3sgZjogMSB9XSB9KSk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KHt9KS50b01hdGNoT2JqZWN0KHsgYTogMSB9KSk7XG4gIH0pO1xuXG4gIGl0KFwiYXN5bW1ldHJpYyBtYXRjaGVyc1wiLCAoKSA9PiB7XG4gICAgZXhwZWN0KHsgeDogMS4wMDAwMDAxLCB5OiBcImFiY1wiIH0pLnRvTWF0Y2hPYmplY3QoeyB4OiBleHBlY3QuY2xvc2VUbygxLCA1KSwgeTogZXhwZWN0LnN0cmluZ0NvbnRhaW5pbmcoXCJiXCIpIH0pO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdCh7IHg6IDEuMSB9KS50b01hdGNoT2JqZWN0KHsgeDogZXhwZWN0LmNsb3NlVG8oMSwgNSkgfSkpO1xuICAgIGV4cGVjdChbeyBhOiAxLCBiOiAyIH1dKS50b0VxdWFsKFtleHBlY3Qub2JqZWN0Q29udGFpbmluZyh7IGE6IDEgfSldKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoW3sgYTogMSB9XSkudG9FcXVhbChbZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoeyBhOiAyIH0pXSkpO1xuICAgIGV4cGVjdChbMywgMSwgMl0pLnRvRXF1YWwoZXhwZWN0LmFycmF5Q29udGFpbmluZyhbMSwgMl0pKTtcbiAgICBleHBlY3QoXCJ4XCIpLnRvRXF1YWwoZXhwZWN0LmFueShTdHJpbmcpKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoMSkudG9FcXVhbChleHBlY3QuYW55KFN0cmluZykpKTtcbiAgfSk7XG59KTtcblxuZGVzY3JpYmUoXCJudW1iZXJzLCBzdHJpbmdzLCBjb2xsZWN0aW9uc1wiLCAoKSA9PiB7XG4gIGl0KFwiY29tcGFyZVwiLCAoKSA9PiB7XG4gICAgZXhwZWN0KDAuMSArIDAuMikudG9CZUNsb3NlVG8oMC4zKTtcbiAgICBleHBlY3QoMS4yMzQpLnRvQmVDbG9zZVRvKDEuMjMsIDIpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdCgxLjI0KS50b0JlQ2xvc2VUbygxLjIzLCAyKSk7XG4gICAgZXhwZWN0KDIpLnRvQmVHcmVhdGVyVGhhbigxKTtcbiAgICBleHBlY3QoMikudG9CZUdyZWF0ZXJUaGFuT3JFcXVhbCgyKTtcbiAgICBleHBlY3QoMSkudG9CZUxlc3NUaGFuKDIpO1xuICAgIGV4cGVjdCgyKS50b0JlTGVzc1RoYW5PckVxdWFsKDIpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdCgxKS50b0JlR3JlYXRlclRoYW4oMSkpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdCgyKS50b0JlTGVzc1RoYW4oMikpO1xuICB9KTtcblxuICBpdChcInN0cmluZ3MgYW5kIGFycmF5c1wiLCAoKSA9PiB7XG4gICAgZXhwZWN0KFwiaGVsbG8gd29ybGRcIikudG9NYXRjaCgvd29yLyk7XG4gICAgZXhwZWN0KFwiaGVsbG8gd29ybGRcIikudG9NYXRjaChcImxvIHdcIik7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KFwiaGVsbG9cIikudG9NYXRjaCgveC8pKTtcbiAgICBleHBlY3QoXCJhYmNcIikubm90LnRvTWF0Y2goL3gvKTtcbiAgICBleHBlY3QoWzEsIDIsIDNdKS50b0NvbnRhaW4oMik7XG4gICAgZXhwZWN0KFwiYWJjXCIpLnRvQ29udGFpbihcImJcIik7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KFsxLCAyXSkudG9Db250YWluKDMpKTtcbiAgICBleHBlY3QoWzEsIDJdKS50b0hhdmVMZW5ndGgoMik7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KFwiYWJjXCIpLnRvSGF2ZUxlbmd0aCgyKSk7XG4gICAgZXhwZWN0KFt7IGE6IDEgfV0pLnRvQ29udGFpbkVxdWFsKHsgYTogMSB9KTtcbiAgICBleHBlY3QoeyBhOiB7IGI6IDIgfSB9KS50b0hhdmVQcm9wZXJ0eShcImEuYlwiLCAyKTtcbiAgfSk7XG5cbiAgaXQoXCJ0cnV0aGluZXNzXCIsICgpID0+IHtcbiAgICBleHBlY3QobnVsbCkudG9CZU51bGwoKTtcbiAgICBleHBlY3QodW5kZWZpbmVkKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgZXhwZWN0KDApLnRvQmVEZWZpbmVkKCk7XG4gICAgZXhwZWN0KDEpLnRvQmVUcnV0aHkoKTtcbiAgICBleHBlY3QoXCJcIikudG9CZUZhbHN5KCk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KHVuZGVmaW5lZCkudG9CZU51bGwoKSk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KDApLnRvQmVUcnV0aHkoKSk7XG4gIH0pO1xufSk7XG5cbmRlc2NyaWJlKFwiZXJyb3JzIGFuZCBwcm9taXNlc1wiLCAoKSA9PiB7XG4gIGNsYXNzIE15RXJyb3IgZXh0ZW5kcyBFcnJvciB7fVxuXG4gIGl0KFwidG9UaHJvd1wiLCAoKSA9PiB7XG4gICAgZXhwZWN0KCgpID0+IHsgdGhyb3cgbmV3IE15RXJyb3IoXCJib29tIGhlcmVcIik7IH0pLnRvVGhyb3coKTtcbiAgICBleHBlY3QoKCkgPT4geyB0aHJvdyBuZXcgTXlFcnJvcihcImJvb20gaGVyZVwiKTsgfSkudG9UaHJvdyhNeUVycm9yKTtcbiAgICBleHBlY3QoKCkgPT4geyB0aHJvdyBuZXcgTXlFcnJvcihcImJvb20gaGVyZVwiKTsgfSkudG9UaHJvdygvYm9vbS8pO1xuICAgIGV4cGVjdCgoKSA9PiB7IHRocm93IG5ldyBNeUVycm9yKFwiYm9vbSBoZXJlXCIpOyB9KS50b1Rocm93KFwiaGVyZVwiKTtcbiAgICBmYWlscygoKSA9PiBleHBlY3QoKCkgPT4ge30pLnRvVGhyb3coKSk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKFwiYVwiKTsgfSkudG9UaHJvdyhNeUVycm9yKSk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KCgpID0+IHsgdGhyb3cgbmV3IEVycm9yKFwiYVwiKTsgfSkudG9UaHJvdygvYi8pKTtcbiAgICBleHBlY3QoKCkgPT4ge30pLm5vdC50b1Rocm93KCk7XG4gIH0pO1xuXG4gIGl0KFwicmVzb2x2ZXMgLyByZWplY3RzXCIsIGFzeW5jICgpID0+IHtcbiAgICBhd2FpdCBleHBlY3QoUHJvbWlzZS5yZXNvbHZlKDMpKS5yZXNvbHZlcy50b0JlKDMpO1xuICAgIGF3YWl0IGV4cGVjdChQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoXCJub1wiKSkpLnJlamVjdHMudG9UaHJvdygvbm8vKTtcbiAgICBsZXQgdGhyZXcgPSBmYWxzZTtcbiAgICB0cnkgeyBhd2FpdCBleHBlY3QoUHJvbWlzZS5yZXNvbHZlKDEpKS5yZWplY3RzLnRvVGhyb3coKTsgfSBjYXRjaCB7IHRocmV3ID0gdHJ1ZTsgfVxuICAgIGV4cGVjdCh0aHJldykudG9CZSh0cnVlKTtcbiAgfSk7XG5cbiAgaXQoXCJhIGxhYmVsIHByZWZpeGVzIHRoZSBmYWlsdXJlIG1lc3NhZ2VcIiwgKCkgPT4ge1xuICAgIHRyeSB7IGV4cGVjdCgxLCBcInRoZSBjb3VudFwiKS50b0JlKDIpOyB9IGNhdGNoIChlKSB7IGV4cGVjdCgoZSBhcyBFcnJvcikubWVzc2FnZSkudG9NYXRjaCgvXnRoZSBjb3VudDogLyk7IHJldHVybjsgfVxuICAgIHRocm93IG5ldyBFcnJvcihcImRpZG4ndCBmYWlsXCIpO1xuICB9KTtcbn0pO1xuXG5kZXNjcmliZShcImhvb2tzIGFuZCB2aVwiLCAoKSA9PiB7XG4gIGxldCByZWFkeSA9IGZhbHNlO1xuICBiZWZvcmVBbGwoKCkgPT4geyByZWFkeSA9IHRydWU7IH0pO1xuICBhZnRlckFsbCgoKSA9PiB7IHZpLnVuc3R1YkFsbEdsb2JhbHMoKTsgfSk7XG5cbiAgaXQoXCJiZWZvcmVBbGwgcmFuXCIsICgpID0+IGV4cGVjdChyZWFkeSkudG9CZSh0cnVlKSk7XG5cbiAgaXQoXCJzdHViR2xvYmFsIC8gdW5zdHViQWxsR2xvYmFsc1wiLCAoKSA9PiB7XG4gICAgY29uc3QgcmVhbCA9IGdsb2JhbFRoaXMuZmV0Y2g7XG4gICAgdmkuc3R1Ykdsb2JhbChcImZldGNoXCIsICgpID0+IFwic3R1YlwiKTtcbiAgICBleHBlY3QoKGdsb2JhbFRoaXMuZmV0Y2ggYXMgdW5rbm93biBhcyAoKSA9PiBzdHJpbmcpKCkpLnRvQmUoXCJzdHViXCIpO1xuICAgIHZpLnVuc3R1YkFsbEdsb2JhbHMoKTtcbiAgICBleHBlY3QoZ2xvYmFsVGhpcy5mZXRjaCkudG9CZShyZWFsKTtcbiAgfSk7XG5cbiAgaXQoXCJmYWtlIERhdGVcIiwgKCkgPT4ge1xuICAgIHZpLnVzZUZha2VUaW1lcnMoeyB0b0Zha2U6IFtcIkRhdGVcIl0gfSk7XG4gICAgdmkuc2V0U3lzdGVtVGltZShEYXRlLlVUQygyMDMwLCAwLCAxKSk7XG4gICAgZXhwZWN0KG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSkudG9CZShcIjIwMzAtMDEtMDFUMDA6MDA6MDAuMDAwWlwiKTtcbiAgICBleHBlY3QoRGF0ZS5ub3coKSkudG9CZShEYXRlLlVUQygyMDMwLCAwLCAxKSk7XG4gICAgdmkudXNlUmVhbFRpbWVycygpO1xuICAgIGV4cGVjdChuZXcgRGF0ZSgpLmdldEZ1bGxZZWFyKCkpLnRvQmVMZXNzVGhhbigyMDMwKTtcbiAgfSk7XG5cbiAgaXQoXCJ2aS5mbiByZWNvcmRzIGNhbGxzIGFuZCBmYWtlcyByZXN1bHRzXCIsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBmID0gdmkuZm4oKHg6IG51bWJlcikgPT4geCAqIDIpO1xuICAgIGV4cGVjdChmKDIpKS50b0JlKDQpO1xuICAgIGYubW9ja1JldHVyblZhbHVlT25jZSg3KTtcbiAgICBleHBlY3QoZigxKSkudG9CZSg3KTtcbiAgICBleHBlY3QoZigxKSkudG9CZSgyKTtcbiAgICBleHBlY3QoZikudG9IYXZlQmVlbkNhbGxlZCgpO1xuICAgIGV4cGVjdChmKS50b0hhdmVCZWVuQ2FsbGVkVGltZXMoMyk7XG4gICAgZXhwZWN0KGYpLnRvSGF2ZUJlZW5DYWxsZWRXaXRoKDIpO1xuICAgIGV4cGVjdChmKS50b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aCgyLCAxKTtcbiAgICBleHBlY3QoZikudG9IYXZlQmVlbkxhc3RDYWxsZWRXaXRoKDEpO1xuICAgIGZhaWxzKCgpID0+IGV4cGVjdChmKS50b0hhdmVCZWVuQ2FsbGVkV2l0aCgzKSk7XG4gICAgZmFpbHMoKCkgPT4gZXhwZWN0KGYpLnRvSGF2ZUJlZW5DYWxsZWRUaW1lcygyKSk7XG4gICAgY29uc3QgZyA9IHZpLmZuKCkubW9ja1Jlc29sdmVkVmFsdWUoXCJva1wiKTtcbiAgICBleHBlY3QoYXdhaXQgZygpKS50b0JlKFwib2tcIik7XG4gICAgZXhwZWN0KHZpLmZuKCkpLm5vdC50b0hhdmVCZWVuQ2FsbGVkKCk7XG4gICAgZXhwZWN0KHZpLmlzTW9ja0Z1bmN0aW9uKGcpKS50b0JlKHRydWUpO1xuICB9KTtcblxuICBpdChcInRha2VzIGEgcGVyLXRlc3QgdGltZW91dFwiLCBhc3luYyAoKSA9PiB7IGF3YWl0IG5ldyBQcm9taXNlKChyKSA9PiBzZXRUaW1lb3V0KHIsIDUpKTsgfSwgMV8wMDApO1xuXG4gIGl0LmVhY2goW1sxLCAyLCAzXSwgWzIsIDMsIDVdXSkoXCIlaSArICVpID0gJWlcIiwgKGEsIGIsIGMpID0+IGV4cGVjdChhICsgYikudG9CZShjKSk7XG4gIGl0LmVhY2goW3sgaWQ6IFwieFwiLCBuOiAxIH1dKShcIiRpZCBoYXMgbiA9ICRuXCIsIChvKSA9PiBleHBlY3Qoby5uKS50b0JlKDEpKTtcbn0pO1xuXG5kZXNjcmliZShcInNuYXBzaG90c1wiLCAoKSA9PiB7XG4gIGl0KFwiY29tcGFyZXMgc3RyaW5ncyB3aXRoIHRoZSBzdG9yZWQgc25hcHNob3RcIiwgKCkgPT4ge1xuICAgIGV4cGVjdChcImxpbmUgMVxcbmxpbmUgYDJgICR7eH0gXFxcXCBc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M0QsV0FBTyxFQUFFLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLEdBQUcsR0FBRyxPQUFVLENBQUMsRUFBRSxRQUFRLEVBQUUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQ25GLFdBQU8sb0JBQUksSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxvQkFBSSxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDckUsV0FBTyxvQkFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsb0JBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDL0MsV0FBTyxvQkFBSSxLQUFLLENBQUMsQ0FBQyxFQUFFLFFBQVEsb0JBQUksS0FBSyxDQUFDLENBQUM7QUFDdkMsVUFBTSxNQUFNLE9BQU8sRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUNwRCxVQUFNLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUM3QyxVQUFNLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQyxDQUFDO0FBQ2xELFVBQU0sTUFBTSxPQUFPLG9CQUFJLEtBQUssQ0FBQyxDQUFDLEVBQUUsUUFBUSxvQkFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3BELFVBQU0sTUFBTSxPQUFPLG9CQUFJLElBQUksQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLFFBQVEsb0JBQUksSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFD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SyxDQUFDO0FBQ25CLFdBQU8sRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUM7QUFDbkIsV0FBTyxDQUFDLEVBQUUsaUJBQWlCO0FBQzNCLFdBQU8sQ0FBQyxFQUFFLHNCQUFzQixDQUFDO0FBQ2pDLFdBQU8sQ0FBQyxFQUFFLHFCQUFxQixDQUFDO0FBQ2hDLFdBQU8sQ0FBQyxFQUFFLHdCQUF3QixHQUFHLENBQUM7QUFDdEMsV0FBTyxDQUFDLEVBQUUseUJBQXlCLENBQUM7QUFDcEMsVUFBTSxNQUFNLE9BQU8sQ0FBQyxFQUFFLHFCQUFxQixDQUFDLENBQUM7QUFDN0MsVUFBTSxNQUFNLE9BQU8sQ0FBQyxFQUFFLHNCQUFzQixDQUFDLENBQUM7QUFDOUMsVUFBTSxJQUFJLEdBQUcsR0FBRyxFQUFFLGtCQUFrQixJQUFJO0FBQ3hDLFdBQU8sTUFBTSxFQUFFLENBQUMsRUFBRSxLQUFLLElBQUk7QUFDM0IsV0FBTyxHQUFHLEdBQUcsQ0FBQyxFQUFFLElBQUksaUJBQWlCO0FBQ3JDLFdBQU8sR0FBRyxlQUFlLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSTtBQUFBLEVBQ3hDLENBQUM7QUFFRCxFQUFBQSxJQUFHLDRCQUE0QixZQUFZO0FBQUUsVUFBTSxJQUFJLFFBQVEsQ0FBQyxNQUFNLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFBQSxFQUFHLEdBQUcsR0FBSztBQUVqRyxFQUFBQSxJQUFHLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLEdBQUcsTUFBTSxPQUFPLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ2xGLEVBQUFBLElBQUcsS0FBSyxDQUFDLEVBQUUsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDLENBQUMsRUFBRSxrQkFBa0IsQ0FBQyxNQUFNLE9BQU8sRUFBRSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDM0UsQ0FBQztBQUVERCxVQUFTLGFBQWEsTUFBTTtBQUMxQixFQUFBQyxJQUFHLDZDQUE2QyxNQUFNO0FBQ3BELFdBQU8sOEJBQWdDLEVBQUUsZ0JBQWdCLFFBQVE7QUFBQSxFQUNuRSxDQUFDO0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFsiZGVzY3JpYmUiLCAiZm4iLCAiaXQiLCAiZm4iLCAiZm4iLCAiZGVzY3JpYmUiLCAiaXQiXQp9Cg==
