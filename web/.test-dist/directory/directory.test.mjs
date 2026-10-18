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
  let out2 = name.replace(/%[sdifjo#%]/g, (m) => {
    if (m === "%%") return "%";
    if (m === "%#") return String(index);
    const v = args[i++];
    return m === "%j" || m === "%o" ? JSON.stringify(v) : typeof v === "string" ? v : inspect(v);
  });
  const first = args[0];
  if (first && typeof first === "object") {
    out2 = out2.replace(/\$([\w.]+)/g, (m, key) => {
      const v = key.split(".").reduce((o, k) => o == null ? o : o[k], first);
      return v === void 0 ? m : typeof v === "string" ? v : inspect(v);
    });
  }
  return out2;
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
    let err2, threw = false;
    if (typeof fnOrError === "function") {
      try {
        fnOrError();
      } catch (e) {
        threw = true;
        err2 = e;
      }
    } else {
      threw = true;
      err2 = fnOrError;
    }
    const msg = err2 instanceof Error ? err2.message : String(err2);
    let pass = threw;
    if (threw && expected !== void 0) {
      if (typeof expected === "string") pass = msg.includes(expected);
      else if (expected instanceof RegExp) pass = expected.test(msg);
      else if (typeof expected === "function") pass = err2 instanceof expected;
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
  const out2 = {};
  for (const [name, m] of Object.entries(matchers)) {
    out2[name] = async ? async (...args) => fail(m(await actual(), ...args), negate, label) : (...args) => fail(m(actual(), ...args), negate, label);
  }
  return out2;
}
function expect(actual, label) {
  const e = build(() => actual, false, label, false);
  e.not = build(() => actual, true, label, false);
  const settle = (want) => async () => {
    try {
      const v = await actual;
      if (want === "reject") throw new AssertionError({ message: `${label ? label + ": " : ""}expected a rejection, got ${show(v)}` });
      return v;
    } catch (err2) {
      if (err2 instanceof AssertionError && want === "reject") throw err2;
      if (want === "resolve") throw err2;
      return err2;
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

// server/d1.ts
import { DatabaseSync } from "node:sqlite";
var Stmt = class _Stmt {
  constructor(db, sql, args = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  db;
  sql;
  args;
  bind(...args) {
    return new _Stmt(this.db, this.sql, args);
  }
  st() {
    return this.db.prepare(this.sql);
  }
  a() {
    return this.args.map((x) => x === void 0 ? null : typeof x === "boolean" ? Number(x) : x);
  }
  async first(col) {
    const r = this.st().get(...this.a());
    if (!r) return null;
    return col ? r[col] : r;
  }
  async all() {
    return { results: this.st().all(...this.a()), success: true, meta: {} };
  }
  async run() {
    const r = this.st().run(...this.a());
    return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  /** synchronous run, for batch */
  _run() {
    return this.st().run(...this.a());
  }
};
var NodeD1 = class {
  db;
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  }
  prepare(sql) {
    return new Stmt(this.db, sql);
  }
  /** all-or-nothing, like D1 */
  async batch(stmts) {
    this.db.exec("BEGIN");
    try {
      const out2 = stmts.map((s) => {
        const r = s._run();
        return { success: true, meta: { changes: Number(r.changes) } };
      });
      this.db.exec("COMMIT");
      return out2;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
    return { count: 0, duration: 0 };
  }
};

// worker/social/sign.ts
var SKEW_S = 300;
var SIG_HEADER = "Ironterm-Signature";
var enc = new TextEncoder();
function b64url(b) {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out2 = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out2[i] = bin.charCodeAt(i);
  return out2;
}
var hex = (b) => [...b instanceof Uint8Array ? b : new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
var sha256hex = async (data) => hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const raw = await crypto.subtle.exportKey("raw", kp.publicKey);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKey: b64url(raw), privateJwk: jwk };
}
var importPrivate = (jwk) => crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, false, ["sign"]);
function normOrigin(s, allowHttp) {
  if (!s || typeof s !== "string" || s.length > 300) return null;
  let u;
  try {
    u = new URL(s.includes("://") ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) return null;
  if (u.username || u.password) return null;
  return u.origin;
}
function signingString(method, pathAndQuery, target, ts, bodyHash) {
  return ["ironterm-v1", method.toUpperCase(), pathAndQuery, target, String(ts), bodyHash].join("\n");
}
async function signRequest(opts) {
  const u = new URL(opts.url);
  const ts = Math.floor((opts.now ?? Date.now()) / 1e3);
  const msg = signingString(opts.method, u.pathname + u.search, u.origin, ts, await sha256hex(opts.body ?? ""));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, opts.key, enc.encode(msg));
  return `server="${opts.server}", ts="${ts}", sig="${b64url(sig)}"`;
}
function parseSigHeader(h) {
  if (!h || h.length > 1e3) return null;
  const out2 = {};
  for (const m of h.matchAll(/(\w+)="([^"]*)"/g)) out2[m[1]] = m[2];
  if (!out2.server || !out2.ts || !out2.sig || !/^\d{1,12}$/.test(out2.ts)) return null;
  return { server: out2.server, ts: Number(out2.ts), sig: out2.sig };
}
async function verifySig(publicKey, msg, sig) {
  try {
    const key = await crypto.subtle.importKey("raw", unb64url(publicKey), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, unb64url(sig), enc.encode(msg));
  } catch {
    return false;
  }
}
function precheck(req2, self, allowHttp, now = Date.now()) {
  const p = parseSigHeader(req2.headers.get(SIG_HEADER));
  if (!p) return { ok: false, status: 401, error: "missing or malformed signature" };
  const server2 = normOrigin(p.server, allowHttp);
  if (!server2 || server2 !== p.server) return { ok: false, status: 401, error: "bad sender origin" };
  if (Math.abs(now / 1e3 - p.ts) > SKEW_S) return { ok: false, status: 401, error: "timestamp outside the allowed window" };
  return { ok: true, parsed: p, server: server2 };
}
async function verifyRequest(req2, rawBody, self, publicKey, parsed) {
  const u = new URL(req2.url);
  const msg = signingString(req2.method, u.pathname + u.search, self, parsed.ts, await sha256hex(rawBody));
  return verifySig(publicKey, msg, parsed.sig);
}

// worker/social/net.ts
var TIMEOUT_MS = 4e3;
var PeerError = class extends Error {
  constructor(msg, status = 502) {
    super(msg);
    this.status = status;
  }
  status;
};
async function timedFetch(url, init = {}, ms = TIMEOUT_MS) {
  const ac = new AbortController();
  let timer;
  const deadline = new Promise((_, rej) => {
    timer = setTimeout(() => {
      ac.abort();
      rej(new PeerError(`timed out after ${ms / 1e3}s`, 504));
    }, ms);
  });
  try {
    return await Promise.race([fetch(url, { ...init, signal: ac.signal, redirect: "manual" }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
async function fetchWellKnown(origin) {
  let r;
  try {
    r = await timedFetch(`${origin}/.well-known/ironterm`, { headers: { accept: "application/json" } });
  } catch (e) {
    throw e instanceof PeerError ? e : new PeerError(`couldn't reach ${origin}`);
  }
  if (!r.ok) throw new PeerError(`${origin} isn't an Ironterm server (${r.status})`);
  const w = await r.json().catch(() => null);
  if (!w || w.software !== "ironterm" || typeof w.publicKey !== "string") throw new PeerError(`${origin} isn't an Ironterm server`);
  if (w.server !== origin) throw new PeerError(`${origin} says its address is ${w.server}`);
  return w;
}

// worker/social/types.ts
var HANDLE_RE = /^[a-z0-9][a-z0-9_-]{1,29}$/;

// directory/worker.ts
var SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (handle TEXT PRIMARY KEY, name TEXT, server TEXT NOT NULL, public_key TEXT NOT NULL, listed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS users_key ON users(public_key)",
  "CREATE INDEX IF NOT EXISTS users_name ON users(lower(name))",
  "CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL)"
];
var ready = /* @__PURE__ */ new WeakMap();
var ensure = (db) => {
  let p = ready.get(db);
  if (!p) ready.set(db, p = db.batch(SCHEMA.map((s) => db.prepare(s))));
  return p;
};
var LIMITS = { write: [20, 3600], search: [60, 60], lookup: [240, 60] };
var MAX_BODY = 4096;
var json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*", ...extra } });
var err = (status, error) => json({ error }, status);
async function limited(db, ip, kind) {
  const [max, win] = LIMITS[kind];
  const now = Math.floor(Date.now() / 1e3);
  const key = `${kind}:${ip}`;
  const row = await db.prepare("SELECT count, reset FROM rate WHERE key = ?").bind(key).first();
  if (!row || row.reset <= now) {
    await db.prepare("INSERT INTO rate (key, count, reset) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset = excluded.reset").bind(key, now + win).run();
    if (Math.random() < 0.01) await db.prepare("DELETE FROM rate WHERE reset <= ?").bind(now).run();
    return false;
  }
  if (row.count >= max) return true;
  await db.prepare("UPDATE rate SET count = count + 1 WHERE key = ?").bind(key).run();
  return false;
}
var isKey = (k) => {
  if (typeof k !== "string" || k.length > 60) return false;
  try {
    return unb64url(k).length === 32;
  } catch {
    return false;
  }
};
var out = (u) => ({ handle: u.handle, name: u.name, server: u.server, publicKey: u.public_key, updatedAt: u.updated_at });
async function handleDirectory(req2, env2) {
  const url = new URL(req2.url);
  const path = url.pathname;
  const db = env2.DB;
  const http = env2.SOCIAL_ALLOW_HTTP === "1" || env2.SOCIAL_ALLOW_HTTP === "true";
  const self = env2.DIRECTORY_ORIGIN && normOrigin(env2.DIRECTORY_ORIGIN, true) || url.origin;
  const ip = req2.headers.get("cf-connecting-ip") ?? "unknown";
  await ensure(db);
  if (req2.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET", "access-control-max-age": "86400" } });
  if (path === "/" && req2.method === "GET") return json({ software: "ironterm-directory", v: 1, stores: ["handle", "name", "server", "publicKey", "listed", "timestamps"] });
  if (path === "/v1/register" && req2.method === "POST") {
    if (await limited(db, ip, "write")) return err(429, "too many requests");
    if (Number(req2.headers.get("content-length") ?? 0) > MAX_BODY) return err(400, "body too large");
    const raw = await req2.text();
    if (raw.length > MAX_BODY) return err(400, "body too large");
    const pre = precheck(req2, self, http);
    if (!pre.ok) return err(pre.status, pre.error);
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      return err(400, "malformed body");
    }
    const handle = typeof b.handle === "string" ? b.handle : "";
    if (!HANDLE_RE.test(handle)) return err(400, "handle must match ^[a-z0-9][a-z0-9_-]{1,29}$");
    if (b.name != null && (typeof b.name !== "string" || b.name.length > 60)) return err(400, "name: up to 60 characters");
    if (!isKey(b.publicKey)) return err(400, "publicKey: base64url raw 32-byte Ed25519 key");
    const server2 = normOrigin(typeof b.server === "string" ? b.server : "", http);
    if (!server2 || server2 !== b.server) return err(400, http ? "server must be an origin" : "server must be an https origin");
    if (server2 !== pre.server) return err(401, "signature is from another server");
    if (!await verifyRequest(req2, raw, self, b.publicKey, pre.parsed)) return err(401, "bad signature");
    const existing = await db.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
    if (existing && existing.public_key !== b.publicKey) return err(409, "handle taken");
    let wk;
    try {
      wk = await fetchWellKnown(server2);
    } catch (e) {
      return err(400, `couldn't verify ${server2}: ${e.message}`);
    }
    if (wk.publicKey !== b.publicKey) return err(403, "the server's .well-known/ironterm serves a different key");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const name = typeof b.name === "string" ? b.name.trim() || null : null;
    await db.batch([
      // one handle per key: registering a new handle releases the old one
      db.prepare("DELETE FROM users WHERE public_key = ? AND handle != ?").bind(b.publicKey, handle),
      db.prepare("INSERT INTO users (handle, name, server, public_key, listed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(handle) DO UPDATE SET name = excluded.name, server = excluded.server, listed = excluded.listed, updated_at = excluded.updated_at").bind(handle, name, server2, b.publicKey, b.listed ? 1 : 0, now, now)
    ]);
    return json({ ok: true, handle });
  }
  const um = path.match(/^\/v1\/users\/([^/]+)$/);
  if (um) {
    const handle = decodeURIComponent(um[1]).toLowerCase();
    if (req2.method === "GET") {
      if (await limited(db, ip, "lookup")) return err(429, "too many requests");
      if (!HANDLE_RE.test(handle)) return err(404, "not found");
      const u = await db.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
      return u ? json(out(u)) : err(404, "not found");
    }
    if (req2.method === "DELETE") {
      if (await limited(db, ip, "write")) return err(429, "too many requests");
      const pre = precheck(req2, self, http);
      if (!pre.ok) return err(pre.status, pre.error);
      const u = await db.prepare("SELECT * FROM users WHERE handle = ?").bind(handle).first();
      if (!u) return err(404, "not found");
      if (!await verifyRequest(req2, "", self, u.public_key, pre.parsed)) return err(401, "bad signature");
      await db.prepare("DELETE FROM users WHERE handle = ?").bind(handle).run();
      return json({ ok: true });
    }
  }
  if (path === "/v1/search" && req2.method === "GET") {
    if (await limited(db, ip, "search")) return err(429, "too many requests");
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase().replace(/^@/, "");
    if (q.length < 2) return err(400, "q: at least 2 characters");
    if (q.length > 60) return json({ users: [] });
    const like = q.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
    const { results } = await db.prepare("SELECT * FROM users WHERE listed = 1 AND (handle LIKE ? ESCAPE '\\' OR lower(name) LIKE ? ESCAPE '\\') ORDER BY handle LIMIT 20").bind(like, like).all();
    return json({ users: results.map((u) => ({ handle: u.handle, name: u.name, server: u.server })) });
  }
  return err(404, "not found");
}
var worker_default = {
  async fetch(req2, env2) {
    try {
      return await handleDirectory(req2, env2);
    } catch (e) {
      console.error(e);
      return err(500, "internal error");
    }
  }
};

// directory/directory.test.ts
var DIR = "https://dir.example";
var servers = /* @__PURE__ */ new Map();
var realFetch = globalThis.fetch;
var env;
async function server(origin) {
  const kp = await generateKeyPair();
  const s = { publicKey: kp.publicKey, key: await importPrivate(kp.privateJwk) };
  servers.set(origin, s);
  return s;
}
beforeAll(() => {
  vi.stubGlobal("fetch", async (input, init) => {
    const u = new URL(new Request(input, init).url);
    const s = servers.get(u.origin);
    if (!s || u.pathname !== "/.well-known/ironterm") throw new TypeError("fetch failed");
    return Response.json({ v: 1, server: u.origin, handle: null, name: null, publicKey: s.serve ?? s.publicKey, directory: null, software: "ironterm" });
  });
});
afterAll(() => {
  vi.stubGlobal("fetch", realFetch);
  vi.unstubAllGlobals();
});
var ipN = 0;
async function req(method, path, opts = {}) {
  const url = `${DIR}${path}`;
  const text = opts.body === void 0 ? void 0 : JSON.stringify(opts.body);
  const headers = { "cf-connecting-ip": opts.ip ?? `10.0.0.${++ipN % 250}` };
  if (opts.as) {
    const s = servers.get(opts.signer ?? opts.as);
    headers[SIG_HEADER] = await signRequest({ key: s.key, server: opts.as, method, url, body: text ?? "", now: opts.now });
  }
  const r = await worker_default.fetch(new Request(url, { method, headers, body: text }), env);
  return { status: r.status, data: await r.json() };
}
var reg = (origin, handle, extra = {}) => req("POST", "/v1/register", { as: origin, body: { handle, name: handle.toUpperCase(), server: origin, publicKey: servers.get(origin).publicKey, listed: true, ...extra } });
describe2("directory (\xA73)", () => {
  beforeAll(async () => {
    env = { DB: new NodeD1(":memory:") };
    for (const o of ["https://a.example", "https://b.example", "https://c.example", "http://h.example"]) await server(o);
  });
  it2("registers a signed, verified handle and serves it", async () => {
    expect((await reg("https://a.example", "sam")).data).toEqual({ ok: true, handle: "sam" });
    const u = (await req("GET", "/v1/users/sam")).data;
    expect(u).toMatchObject({ handle: "sam", name: "SAM", server: "https://a.example", publicKey: servers.get("https://a.example").publicKey });
    expect(u.updatedAt).toBeTruthy();
    expect((await req("GET", "/v1/users/SAM")).status).toBe(200);
    expect((await req("GET", "/v1/users/nobody")).status).toBe(404);
  });
  it2("enforces the handle rules", async () => {
    for (const h of ["a", "-sam", "Sam", "sam!", "x".repeat(31), "_x"]) expect((await reg("https://b.example", h)).status).toBe(400);
    expect((await reg("https://b.example", "ok_handle-2")).status).toBe(200);
  });
  it2("refuses unsigned, mis-signed, stale and mismatched registrations", async () => {
    const body = { handle: "bee", name: "B", server: "https://b.example", publicKey: servers.get("https://b.example").publicKey, listed: true };
    expect((await req("POST", "/v1/register", { body })).status).toBe(401);
    expect((await req("POST", "/v1/register", { body, as: "https://b.example", signer: "https://c.example" })).status).toBe(401);
    expect((await req("POST", "/v1/register", { body: { ...body, server: "https://c.example" }, as: "https://b.example" })).status).toBe(401);
    expect((await req("POST", "/v1/register", { body, as: "https://b.example", now: Date.now() - 4e5 })).status).toBe(401);
    servers.get("https://b.example").serve = servers.get("https://c.example").publicKey;
    expect((await req("POST", "/v1/register", { body, as: "https://b.example" })).status).toBe(403);
    delete servers.get("https://b.example").serve;
  });
  it2("refuses a takeover by another key; the owner can update and rename", async () => {
    expect((await reg("https://c.example", "sam")).status).toBe(409);
    expect((await reg("https://a.example", "sam", { name: "Samuel", listed: false })).status).toBe(200);
    expect((await req("GET", "/v1/users/sam")).data.name).toBe("Samuel");
    expect((await reg("https://a.example", "sammy")).status).toBe(200);
    expect((await req("GET", "/v1/users/sam")).status).toBe(404);
    expect((await reg("https://c.example", "sam")).status).toBe(200);
  });
  it2("http servers only with SOCIAL_ALLOW_HTTP", async () => {
    expect((await reg("http://h.example", "hhh")).status).toBe(401);
    env.SOCIAL_ALLOW_HTTP = "1";
    expect((await reg("http://h.example", "hhh")).status).toBe(200);
    delete env.SOCIAL_ALLOW_HTTP;
  });
  it2("searches listed users by handle or name prefix", async () => {
    expect((await req("GET", "/v1/search?q=d")).status).toBe(400);
    const r = (await req("GET", "/v1/search?q=SA")).data;
    expect(r.users.map((u) => u.handle)).toEqual(["sam", "sammy"]);
    expect(Object.keys(r.users[0]).sort()).toEqual(["handle", "name", "server"]);
    await reg("https://a.example", "sammy", { listed: false });
    expect((await req("GET", "/v1/search?q=sa")).data.users.map((u) => u.handle)).toEqual(["sam"]);
    expect((await req("GET", "/v1/search?q=%25%25")).data.users).toEqual([]);
  });
  it2("deletes only with the same key", async () => {
    expect((await req("DELETE", "/v1/users/sammy", { as: "https://c.example" })).status).toBe(401);
    expect((await req("DELETE", "/v1/users/sammy")).status).toBe(401);
    expect((await req("DELETE", "/v1/users/sammy", { as: "https://a.example" })).status).toBe(200);
    expect((await req("GET", "/v1/users/sammy")).status).toBe(404);
  });
  it2("rate-limits per client", async () => {
    const [max] = LIMITS.search;
    let last = 0;
    for (let i = 0; i <= max; i++) last = (await req("GET", "/v1/search?q=sa", { ip: "192.0.2.1" })).status;
    expect(last).toBe(429);
    expect((await req("GET", "/v1/search?q=sa", { ip: "192.0.2.2" })).status).toBe(200);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vcGFja2FnZXMvdGVzdC9pbmRleC50cyIsICIuLi8uLi9zZXJ2ZXIvZDEudHMiLCAiLi4vLi4vd29ya2VyL3NvY2lhbC9zaWduLnRzIiwgIi4uLy4uL3dvcmtlci9zb2NpYWwvbmV0LnRzIiwgIi4uLy4uL3dvcmtlci9zb2NpYWwvdHlwZXMudHMiLCAiLi4vLi4vZGlyZWN0b3J5L3dvcmtlci50cyIsICIuLi8uLi9kaXJlY3RvcnkvZGlyZWN0b3J5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEEgc21hbGwgdml0ZXN0LWNvbXBhdGlibGUgdGVzdCBBUEkgb24gdG9wIG9mIG5vZGU6dGVzdCBhbmQgbm9kZTphc3NlcnQsIHNvIHRoZSB0ZXN0cyBrZWVwXG4vLyBgaW1wb3J0IHsgZGVzY3JpYmUsIGV4cGVjdCwgaXQgfSBmcm9tIFwidml0ZXN0XCJgIChzY3JpcHRzL3Rlc3QubWpzIGFsaWFzZXMgXCJ2aXRlc3RcIiB0byB0aGlzIGZpbGUpXG4vLyB3aXRob3V0IHZpdGVzdCdzIDg4IHBhY2thZ2VzLiBPbmx5IHdoYXQgdGhlIHRlc3RzIHVzZSBpcyBoZXJlOyBhZGQgbWF0Y2hlcnMgYXMgbmVlZGVkLlxuaW1wb3J0IHsgQXNzZXJ0aW9uRXJyb3IgfSBmcm9tIFwibm9kZTphc3NlcnRcIjtcbmltcG9ydCB7IGV4aXN0c1N5bmMsIG1rZGlyU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIHJlbGF0aXZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0ICogYXMgbm9kZVRlc3QgZnJvbSBcIm5vZGU6dGVzdFwiO1xuaW1wb3J0IHsgaW5zcGVjdCwgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tIFwibm9kZTp1dGlsXCI7XG5cbnR5cGUgRm4gPSAoKSA9PiB1bmtub3duIHwgUHJvbWlzZTx1bmtub3duPjtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHN1aXRlcyBhbmQgaG9va3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHN0YWNrOiBzdHJpbmdbXSA9IFtdO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmUobmFtZTogc3RyaW5nLCBmbjogKCkgPT4gdm9pZCkge1xuICBjb25zdCBwYXRoID0gWy4uLnN0YWNrLCBuYW1lXTtcbiAgcmV0dXJuIG5vZGVUZXN0LmRlc2NyaWJlKG5hbWUsICgpID0+IHsgY29uc3Qgc2F2ZWQgPSBzdGFjay5zcGxpY2UoMCk7IHN0YWNrLnB1c2goLi4ucGF0aCk7IHRyeSB7IGZuKCk7IH0gZmluYWxseSB7IHN0YWNrLnNwbGljZSgwKTsgc3RhY2sucHVzaCguLi5zYXZlZCk7IH0gfSk7XG59XG5cbnR5cGUgUnVubmVyID0gKG5hbWU6IHN0cmluZywgb3B0aW9uczogeyB0aW1lb3V0PzogbnVtYmVyIH0sIGZuPzogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gdW5rbm93bjtcblxuLyoqXG4gKiBBIHRlc3Qgb3IgaG9vayB0aGF0IHJ1bnMgbG9uZ2VyIGZhaWxzIChcImh1bmdcIiwgbm90IFwic2xvd1wiKTogZ2VuZXJvdXMsIGJlY2F1c2UgdGhlIGVuZC10by1lbmRcbiAqIHRlc3RzIHJ1biBzZXZlcmFsIGluLXByb2Nlc3Mgc2VydmVycy4gQSB0ZXN0IGNhbiBwYXNzIGl0cyBvd24gYXMgdGhlIHRoaXJkIGFyZ3VtZW50LlxuICovXG5leHBvcnQgY29uc3QgVEVTVF9USU1FT1VUX01TID0gNjBfMDAwO1xuZXhwb3J0IGNvbnN0IEhPT0tfVElNRU9VVF9NUyA9IDEyMF8wMDA7XG5cbmZ1bmN0aW9uIHRlc3RXaXRoKHJ1bm5lcjogUnVubmVyKSB7XG4gIHJldHVybiAobmFtZTogc3RyaW5nLCBmbj86IEZuLCB0aW1lb3V0OiBudW1iZXIgfCB7IHRpbWVvdXQ/OiBudW1iZXIgfSA9IFRFU1RfVElNRU9VVF9NUyk6IHZvaWQgPT4ge1xuICAgIGNvbnN0IHBhdGggPSBbLi4uc3RhY2ssIG5hbWVdO1xuICAgIHJ1bm5lcihuYW1lLCB7IHRpbWVvdXQ6IHR5cGVvZiB0aW1lb3V0ID09PSBcIm51bWJlclwiID8gdGltZW91dCA6IHRpbWVvdXQudGltZW91dCA/PyBURVNUX1RJTUVPVVRfTVMgfSwgZm4gPyBhc3luYyAoKSA9PiB7XG4gICAgICBjdXJyZW50ID0geyBuYW1lOiBwYXRoLmpvaW4oXCIgPiBcIiksIGNvdW50czogbmV3IE1hcCgpIH07XG4gICAgICBhd2FpdCBmbigpO1xuICAgIH0gOiB1bmRlZmluZWQpO1xuICB9O1xufVxuXG50eXBlIEl0ID0gUmV0dXJuVHlwZTx0eXBlb2YgdGVzdFdpdGg+ICYge1xuICBza2lwOiBSZXR1cm5UeXBlPHR5cGVvZiB0ZXN0V2l0aD47XG4gIG9ubHk6IFJldHVyblR5cGU8dHlwZW9mIHRlc3RXaXRoPjtcbiAgdG9kbzogKG5hbWU6IHN0cmluZykgPT4gdm9pZDtcbiAgZWFjaDogPFQ+KGNhc2VzOiByZWFkb25seSBUW10pID0+IChuYW1lOiBzdHJpbmcsIGZuOiAoLi4uYXJnczogVCBleHRlbmRzIHJlYWRvbmx5IHVua25vd25bXSA/IFQgOiBbVF0pID0+IHVua25vd24pID0+IHZvaWQ7XG59O1xuXG5mdW5jdGlvbiBtYWtlSXQoKTogSXQge1xuICBjb25zdCBpdCA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0KSBhcyBJdDtcbiAgaXQuc2tpcCA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0LnNraXApO1xuICBpdC5vbmx5ID0gdGVzdFdpdGgobm9kZVRlc3QuaXQub25seSk7XG4gIGl0LnRvZG8gPSAobmFtZTogc3RyaW5nKSA9PiB7IG5vZGVUZXN0Lml0LnRvZG8obmFtZSk7IH07XG4gIGl0LmVhY2ggPSA8VD4oY2FzZXM6IHJlYWRvbmx5IFRbXSkgPT4gKG5hbWU6IHN0cmluZywgZm46ICguLi5hcmdzOiBUIGV4dGVuZHMgcmVhZG9ubHkgdW5rbm93bltdID8gVCA6IFtUXSkgPT4gdW5rbm93bikgPT4ge1xuICAgIGNhc2VzLmZvckVhY2goKGMsIGkpID0+IHtcbiAgICAgIGNvbnN0IGFyZ3MgPSAoQXJyYXkuaXNBcnJheShjKSA/IGMgOiBbY10pIGFzIFQgZXh0ZW5kcyByZWFkb25seSB1bmtub3duW10gPyBUIDogW1RdO1xuICAgICAgaXQoZm9ybWF0RWFjaE5hbWUobmFtZSwgYXJncywgaSksICgpID0+IGZuKC4uLmFyZ3MpKTtcbiAgICB9KTtcbiAgfTtcbiAgcmV0dXJuIGl0O1xufVxuXG4vKiogYCVzICVkICVpICVmICVqICVvICUjYCBhbmQgYCRmaWVsZGAgcGxhY2Vob2xkZXJzLCBhcyBpbiB2aXRlc3QncyBpdC5lYWNoLiAqL1xuZnVuY3Rpb24gZm9ybWF0RWFjaE5hbWUobmFtZTogc3RyaW5nLCBhcmdzOiByZWFkb25seSB1bmtub3duW10sIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuICBsZXQgaSA9IDA7XG4gIGxldCBvdXQgPSBuYW1lLnJlcGxhY2UoLyVbc2RpZmpvIyVdL2csIChtKSA9PiB7XG4gICAgaWYgKG0gPT09IFwiJSVcIikgcmV0dXJuIFwiJVwiO1xuICAgIGlmIChtID09PSBcIiUjXCIpIHJldHVybiBTdHJpbmcoaW5kZXgpO1xuICAgIGNvbnN0IHYgPSBhcmdzW2krK107XG4gICAgcmV0dXJuIG0gPT09IFwiJWpcIiB8fCBtID09PSBcIiVvXCIgPyBKU09OLnN0cmluZ2lmeSh2KSA6IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gdiA6IGluc3BlY3Qodik7XG4gIH0pO1xuICBjb25zdCBmaXJzdCA9IGFyZ3NbMF07XG4gIGlmIChmaXJzdCAmJiB0eXBlb2YgZmlyc3QgPT09IFwib2JqZWN0XCIpIHtcbiAgICBvdXQgPSBvdXQucmVwbGFjZSgvXFwkKFtcXHcuXSspL2csIChtLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgdiA9IGtleS5zcGxpdChcIi5cIikucmVkdWNlPGFueT4oKG8sIGspID0+IChvID09IG51bGwgPyBvIDogb1trXSksIGZpcnN0KTtcbiAgICAgIHJldHVybiB2ID09PSB1bmRlZmluZWQgPyBtIDogdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogaW5zcGVjdCh2KTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgY29uc3QgaXQgPSBtYWtlSXQoKTtcbmV4cG9ydCBjb25zdCB0ZXN0ID0gaXQ7XG5leHBvcnQgY29uc3QgYmVmb3JlQWxsID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYmVmb3JlKGZuLCB7IHRpbWVvdXQgfSk7XG5leHBvcnQgY29uc3QgYWZ0ZXJBbGwgPSAoZm46IEZuLCB0aW1lb3V0ID0gSE9PS19USU1FT1VUX01TKSA9PiBub2RlVGVzdC5hZnRlcihmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGJlZm9yZUVhY2ggPSAoZm46IEZuLCB0aW1lb3V0ID0gSE9PS19USU1FT1VUX01TKSA9PiBub2RlVGVzdC5iZWZvcmVFYWNoKGZuLCB7IHRpbWVvdXQgfSk7XG5leHBvcnQgY29uc3QgYWZ0ZXJFYWNoID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYWZ0ZXJFYWNoKGZuLCB7IHRpbWVvdXQgfSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBtb2NrIGZ1bmN0aW9ucyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGludGVyZmFjZSBNb2NrPEEgZXh0ZW5kcyB1bmtub3duW10gPSBhbnlbXSwgUiA9IGFueT4ge1xuICAoLi4uYXJnczogQSk6IFI7XG4gIG1vY2s6IHsgY2FsbHM6IEFbXTsgcmVzdWx0czogeyB0eXBlOiBcInJldHVyblwiIHwgXCJ0aHJvd1wiOyB2YWx1ZTogdW5rbm93biB9W10gfTtcbiAgbW9ja0ltcGxlbWVudGF0aW9uKGZuOiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj47XG4gIG1vY2tJbXBsZW1lbnRhdGlvbk9uY2UoZm46ICguLi5hcmdzOiBBKSA9PiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1JldHVyblZhbHVlKHY6IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmV0dXJuVmFsdWVPbmNlKHY6IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmVzb2x2ZWRWYWx1ZSh2OiBBd2FpdGVkPFI+KTogTW9jazxBLCBSPjtcbiAgbW9ja1JlamVjdGVkVmFsdWUoZTogdW5rbm93bik6IE1vY2s8QSwgUj47XG4gIG1vY2tDbGVhcigpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmVzZXQoKTogTW9jazxBLCBSPjtcbn1cbmNvbnN0IE1PQ0sgPSBTeW1ib2woXCJtb2NrXCIpO1xuXG5mdW5jdGlvbiBmbjxBIGV4dGVuZHMgdW5rbm93bltdID0gYW55W10sIFIgPSBhbnk+KGltcGw/OiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj4ge1xuICBsZXQgYmFzZSA9IGltcGw7XG4gIGNvbnN0IG9uY2U6ICgoLi4uYXJnczogQSkgPT4gUilbXSA9IFtdO1xuICBjb25zdCBtID0gKCguLi5hcmdzOiBBKTogUiA9PiB7XG4gICAgbS5tb2NrLmNhbGxzLnB1c2goYXJncyk7XG4gICAgY29uc3QgZiA9IG9uY2Uuc2hpZnQoKSA/PyBiYXNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGYgPyBmKC4uLmFyZ3MpIDogKHVuZGVmaW5lZCBhcyBSKTtcbiAgICAgIG0ubW9jay5yZXN1bHRzLnB1c2goeyB0eXBlOiBcInJldHVyblwiLCB2YWx1ZSB9KTtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBtLm1vY2sucmVzdWx0cy5wdXNoKHsgdHlwZTogXCJ0aHJvd1wiLCB2YWx1ZTogZSB9KTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9KSBhcyBNb2NrPEEsIFI+O1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkobSwgTU9DSywgeyB2YWx1ZTogdHJ1ZSB9KTtcbiAgbS5tb2NrID0geyBjYWxsczogW10sIHJlc3VsdHM6IFtdIH07XG4gIG0ubW9ja0ltcGxlbWVudGF0aW9uID0gKGYpID0+IHsgYmFzZSA9IGY7IHJldHVybiBtOyB9O1xuICBtLm1vY2tJbXBsZW1lbnRhdGlvbk9uY2UgPSAoZikgPT4geyBvbmNlLnB1c2goZik7IHJldHVybiBtOyB9O1xuICBtLm1vY2tSZXR1cm5WYWx1ZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiB2KTtcbiAgbS5tb2NrUmV0dXJuVmFsdWVPbmNlID0gKHYpID0+IG0ubW9ja0ltcGxlbWVudGF0aW9uT25jZSgoKSA9PiB2KTtcbiAgbS5tb2NrUmVzb2x2ZWRWYWx1ZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbigoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHYpKSBhcyAoLi4uYXJnczogQSkgPT4gUik7XG4gIG0ubW9ja1JlamVjdGVkVmFsdWUgPSAoZSkgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCgpID0+IFByb21pc2UucmVqZWN0KGUpKSBhcyAoLi4uYXJnczogQSkgPT4gUik7XG4gIG0ubW9ja0NsZWFyID0gKCkgPT4geyBtLm1vY2suY2FsbHMgPSBbXTsgbS5tb2NrLnJlc3VsdHMgPSBbXTsgcmV0dXJuIG07IH07XG4gIG0ubW9ja1Jlc2V0ID0gKCkgPT4geyBtLm1vY2tDbGVhcigpOyBiYXNlID0gdW5kZWZpbmVkOyBvbmNlLmxlbmd0aCA9IDA7IHJldHVybiBtOyB9O1xuICByZXR1cm4gbTtcbn1cbmNvbnN0IGlzTW9jayA9ICh2OiB1bmtub3duKTogdiBpcyBNb2NrID0+IHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIgJiYgKHYgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3ltYm9sLCB1bmtub3duPilbTU9DS10gPT09IHRydWU7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCB2aSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3Qgc3R1YmJlZCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9wZXJ0eURlc2NyaXB0b3IgfCB1bmRlZmluZWQ+KCk7XG5cbmV4cG9ydCBjb25zdCB2aSA9IHtcbiAgZm4sXG4gIGlzTW9ja0Z1bmN0aW9uOiBpc01vY2ssXG4gIHN0dWJHbG9iYWwobmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIGlmICghc3R1YmJlZC5oYXMobmFtZSkpIHN0dWJiZWQuc2V0KG5hbWUsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZ2xvYmFsVGhpcywgbmFtZSkpO1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShnbG9iYWxUaGlzLCBuYW1lLCB7IHZhbHVlLCB3cml0YWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLCBlbnVtZXJhYmxlOiB0cnVlIH0pO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgdW5zdHViQWxsR2xvYmFscygpIHtcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBkZXNjXSBvZiBzdHViYmVkKSB7XG4gICAgICBpZiAoZGVzYykgT2JqZWN0LmRlZmluZVByb3BlcnR5KGdsb2JhbFRoaXMsIG5hbWUsIGRlc2MpO1xuICAgICAgZWxzZSBkZWxldGUgKGdsb2JhbFRoaXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW25hbWVdO1xuICAgIH1cbiAgICBzdHViYmVkLmNsZWFyKCk7XG4gICAgcmV0dXJuIHZpO1xuICB9LFxuICAvKiogT25seSBEYXRlIGlzIHN1cHBvcnRlZCAobm9kZTp0ZXN0J3MgbW9jayB0aW1lcnMpLiAqL1xuICB1c2VGYWtlVGltZXJzKG9wdHM/OiB7IHRvRmFrZT86IHN0cmluZ1tdOyBub3c/OiBudW1iZXIgfCBEYXRlIH0pIHtcbiAgICBjb25zdCBhcGlzID0gKG9wdHM/LnRvRmFrZSA/PyBbXCJEYXRlXCJdKS5maWx0ZXIoKGEpID0+IGEgPT09IFwiRGF0ZVwiIHx8IGEgPT09IFwic2V0VGltZW91dFwiIHx8IGEgPT09IFwic2V0SW50ZXJ2YWxcIikgYXMgKFwiRGF0ZVwiIHwgXCJzZXRUaW1lb3V0XCIgfCBcInNldEludGVydmFsXCIpW107XG4gICAgbm9kZVRlc3QubW9jay50aW1lcnMuZW5hYmxlKHsgYXBpcywgbm93OiBvcHRzPy5ub3cgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHNldFN5c3RlbVRpbWUodDogbnVtYmVyIHwgRGF0ZSkge1xuICAgIG5vZGVUZXN0Lm1vY2sudGltZXJzLnNldFRpbWUodHlwZW9mIHQgPT09IFwibnVtYmVyXCIgPyB0IDogdC5nZXRUaW1lKCkpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgdXNlUmVhbFRpbWVycygpIHtcbiAgICBub2RlVGVzdC5tb2NrLnRpbWVycy5yZXNldCgpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbn07XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBlcXVhbGl0eSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuaW50ZXJmYWNlIEFzeW1tZXRyaWMgeyBhc3ltbWV0cmljTWF0Y2goYWN0dWFsOiB1bmtub3duKTogYm9vbGVhbjsgdG9TdHJpbmcoKTogc3RyaW5nIH1cbmNvbnN0IGlzQXN5bW1ldHJpYyA9ICh2OiB1bmtub3duKTogdiBpcyBBc3ltbWV0cmljID0+ICEhdiAmJiB0eXBlb2YgKHYgYXMgQXN5bW1ldHJpYykuYXN5bW1ldHJpY01hdGNoID09PSBcImZ1bmN0aW9uXCI7XG5cbi8qKiB2aXRlc3QncyB0b0VxdWFsOiByZWN1cnNpdmUsIGlnbm9yZXMgdW5kZWZpbmVkIHByb3BlcnRpZXMgYW5kIG9iamVjdCB0eXBlczsgW3BhcnRpYWxdID0gdG9NYXRjaE9iamVjdC4gKi9cbmZ1bmN0aW9uIGVxdWFscyhhOiB1bmtub3duLCBiOiB1bmtub3duLCBwYXJ0aWFsID0gZmFsc2UsIHNlZW4gPSBuZXcgTWFwPG9iamVjdCwgb2JqZWN0PigpKTogYm9vbGVhbiB7XG4gIGlmIChpc0FzeW1tZXRyaWMoYikpIHJldHVybiBiLmFzeW1tZXRyaWNNYXRjaChhKTtcbiAgaWYgKGlzQXN5bW1ldHJpYyhhKSkgcmV0dXJuIGEuYXN5bW1ldHJpY01hdGNoKGIpO1xuICBpZiAoT2JqZWN0LmlzKGEsIGIpKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHR5cGVvZiBhICE9PSBcIm9iamVjdFwiIHx8IHR5cGVvZiBiICE9PSBcIm9iamVjdFwiIHx8IGEgPT09IG51bGwgfHwgYiA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoc2Vlbi5nZXQoYSkgPT09IGIpIHJldHVybiB0cnVlO1xuICBzZWVuLnNldChhLCBiKTtcbiAgaWYgKGEgaW5zdGFuY2VvZiBEYXRlIHx8IGIgaW5zdGFuY2VvZiBEYXRlKSByZXR1cm4gYSBpbnN0YW5jZW9mIERhdGUgJiYgYiBpbnN0YW5jZW9mIERhdGUgJiYgYS5nZXRUaW1lKCkgPT09IGIuZ2V0VGltZSgpO1xuICBpZiAoYSBpbnN0YW5jZW9mIFJlZ0V4cCB8fCBiIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gU3RyaW5nKGEpID09PSBTdHJpbmcoYik7XG4gIGlmIChhIGluc3RhbmNlb2YgTWFwIHx8IGIgaW5zdGFuY2VvZiBNYXApIHtcbiAgICBpZiAoIShhIGluc3RhbmNlb2YgTWFwICYmIGIgaW5zdGFuY2VvZiBNYXApIHx8IGEuc2l6ZSAhPT0gYi5zaXplKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgYikgaWYgKCFhLmhhcyhrKSB8fCAhZXF1YWxzKGEuZ2V0KGspLCB2LCBwYXJ0aWFsLCBzZWVuKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChhIGluc3RhbmNlb2YgU2V0IHx8IGIgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICBpZiAoIShhIGluc3RhbmNlb2YgU2V0ICYmIGIgaW5zdGFuY2VvZiBTZXQpIHx8IGEuc2l6ZSAhPT0gYi5zaXplKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChjb25zdCB2IG9mIGIpIGlmICghYS5oYXModikgJiYgIVsuLi5hXS5zb21lKCh4KSA9PiBlcXVhbHMoeCwgdiwgcGFydGlhbCwgc2VlbikpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKEFycmF5QnVmZmVyLmlzVmlldyhhKSB8fCBBcnJheUJ1ZmZlci5pc1ZpZXcoYikpIHJldHVybiBpc0RlZXBTdHJpY3RFcXVhbChhLCBiKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkgIT09IEFycmF5LmlzQXJyYXkoYikpIHJldHVybiBmYWxzZTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkgJiYgQXJyYXkuaXNBcnJheShiKSkge1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYi5ldmVyeSgodiwgaSkgPT4gZXF1YWxzKGFbaV0sIHYsIHBhcnRpYWwsIHNlZW4pKTtcbiAgfVxuICBjb25zdCBhbyA9IGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGJvID0gYiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3Qga2V5cyA9IChvOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gT2JqZWN0LmtleXMobykuZmlsdGVyKChrKSA9PiBvW2tdICE9PSB1bmRlZmluZWQpO1xuICBpZiAocGFydGlhbCkgcmV0dXJuIE9iamVjdC5rZXlzKGJvKS5ldmVyeSgoaykgPT4gKGJvW2tdID09PSB1bmRlZmluZWQgPyBhb1trXSA9PT0gdW5kZWZpbmVkIDogayBpbiBhbyAmJiBlcXVhbHMoYW9ba10sIGJvW2tdLCB0cnVlLCBzZWVuKSkpO1xuICBjb25zdCBrYSA9IGtleXMoYW8pLCBrYiA9IGtleXMoYm8pO1xuICBpZiAoa2EubGVuZ3RoICE9PSBrYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGtiLmV2ZXJ5KChrKSA9PiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYW8sIGspICYmIGVxdWFscyhhb1trXSwgYm9ba10sIGZhbHNlLCBzZWVuKSk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBzbmFwc2hvdHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmxldCBjdXJyZW50OiB7IG5hbWU6IHN0cmluZzsgY291bnRzOiBNYXA8c3RyaW5nLCBudW1iZXI+IH0gPSB7IG5hbWU6IFwiXCIsIGNvdW50czogbmV3IE1hcCgpIH07XG5jb25zdCBzbmFwQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4oKTtcbmNvbnN0IGRpcnR5U25hcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuLyoqXG4gKiBzY3JpcHRzL3Rlc3QubWpzIGJ1bmRsZXMgd2ViLzxkaXI+L3gudGVzdC50cyB0byB3ZWIvLnRlc3QtZGlzdC88ZGlyPi94LnRlc3QubWpzIGFuZCBub2RlIC0tdGVzdFxuICogcnVucyBlYWNoIGJ1bmRsZSBhcyBpdHMgb3duIHByb2Nlc3MsIHNvIHRoZSBzb3VyY2UgcGF0aCBmb2xsb3dzIGZyb20gdGhlIHNjcmlwdCBwYXRoLlxuICovXG5mdW5jdGlvbiBzbmFwRmlsZSgpOiBzdHJpbmcge1xuICBjb25zdCByb290ID0gcHJvY2Vzcy5lbnYuSVJPTlRFUk1fVEVTVF9ST09UO1xuICBjb25zdCBzY3JpcHQgPSBwcm9jZXNzLmFyZ3ZbMV0gPz8gXCJcIjtcbiAgY29uc3QgZGlzdCA9IHJvb3QgPyBqb2luKHJvb3QsIFwiLnRlc3QtZGlzdFwiKSA6IFwiXCI7XG4gIGlmICghcm9vdCB8fCAhc2NyaXB0LnN0YXJ0c1dpdGgoZGlzdCkpIHRocm93IG5ldyBFcnJvcihcInRvTWF0Y2hTbmFwc2hvdDogcnVuIHRlc3RzIHRocm91Z2ggc2NyaXB0cy90ZXN0Lm1qc1wiKTtcbiAgY29uc3Qgc3JjID0gam9pbihyb290LCByZWxhdGl2ZShkaXN0LCBzY3JpcHQpKS5yZXBsYWNlKC9cXC5tanMkLywgXCIudHNcIik7XG4gIHJldHVybiBqb2luKGRpcm5hbWUoc3JjKSwgXCJfX3NuYXBzaG90c19fXCIsIHNyYy5zcGxpdChcIi9cIikucG9wKCkgKyBcIi5zbmFwXCIpO1xufVxuXG5mdW5jdGlvbiBsb2FkU25hcHMoZmlsZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gIGxldCBzbmFwcyA9IHNuYXBDYWNoZS5nZXQoZmlsZSk7XG4gIGlmICghc25hcHMpIHtcbiAgICBzbmFwcyA9IHt9O1xuICAgIGlmIChleGlzdHNTeW5jKGZpbGUpKSBuZXcgRnVuY3Rpb24oXCJleHBvcnRzXCIsIHJlYWRGaWxlU3luYyhmaWxlLCBcInV0ZjhcIikpKHNuYXBzKTtcbiAgICBzbmFwQ2FjaGUuc2V0KGZpbGUsIHNuYXBzKTtcbiAgfVxuICByZXR1cm4gc25hcHM7XG59XG5cbi8qKiBUaGUgdml0ZXN0IHNuYXBzaG90IGZvcm1hdCBmb3IgdGhlIHZhbHVlcyB0aGUgdGVzdHMgc25hcHNob3QgKHN0cmluZ3M7IEpTT04gb3RoZXJ3aXNlKS4gKi9cbmNvbnN0IHNlcmlhbGl6ZSA9ICh2OiB1bmtub3duKSA9PiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyBgXCIke3Z9XCJgIDogSlNPTi5zdHJpbmdpZnkodiwgbnVsbCwgMikpO1xuY29uc3QgZXNjYXBlVGVtcGxhdGUgPSAoczogc3RyaW5nKSA9PiBzLnJlcGxhY2UoL1xcXFwvZywgXCJcXFxcXFxcXFwiKS5yZXBsYWNlKC9gL2csIFwiXFxcXGBcIikucmVwbGFjZSgvXFwkXFx7L2csIFwiXFxcXCR7XCIpO1xuXG5wcm9jZXNzLm9uKFwiZXhpdFwiLCAoKSA9PiB7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBkaXJ0eVNuYXBzKSB7XG4gICAgY29uc3Qgc25hcHMgPSBzbmFwQ2FjaGUuZ2V0KGZpbGUpITtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmtleXMoc25hcHMpLnNvcnQoKS5tYXAoKGspID0+IGBleHBvcnRzW1xcYCR7ZXNjYXBlVGVtcGxhdGUoayl9XFxgXSA9IFxcYCR7ZXNjYXBlVGVtcGxhdGUoc25hcHNba10pfVxcYDtcXG5gKS5qb2luKFwiXFxuXCIpO1xuICAgIG1rZGlyU3luYyhkaXJuYW1lKGZpbGUpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB3cml0ZUZpbGVTeW5jKGZpbGUsIGAvLyBWaXRlc3QgU25hcHNob3QgdjEsIGh0dHBzOi8vdml0ZXN0LmRldi9ndWlkZS9zbmFwc2hvdC5odG1sXFxuXFxuJHtib2R5fWApO1xuICAgIGNvbnNvbGUubG9nKGB1cGRhdGVkICR7cmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgZmlsZSl9YCk7XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiBtYXRjaFNuYXBzaG90KGFjdHVhbDogdW5rbm93biwgaGludD86IHN0cmluZykge1xuICBjb25zdCBiYXNlID0gaGludCA/IGAke2N1cnJlbnQubmFtZX0gPiAke2hpbnR9YCA6IGN1cnJlbnQubmFtZTtcbiAgY29uc3QgbiA9IChjdXJyZW50LmNvdW50cy5nZXQoYmFzZSkgPz8gMCkgKyAxO1xuICBjdXJyZW50LmNvdW50cy5zZXQoYmFzZSwgbik7XG4gIGNvbnN0IGtleSA9IGAke2Jhc2V9ICR7bn1gO1xuICBjb25zdCBmaWxlID0gc25hcEZpbGUoKTtcbiAgY29uc3Qgc25hcHMgPSBsb2FkU25hcHMoZmlsZSk7XG4gIGNvbnN0IGdvdCA9IGBcXG4ke3NlcmlhbGl6ZShhY3R1YWwpfVxcbmA7XG4gIC8vIGxpa2Ugdml0ZXN0LCBDSSBuZXZlciB3cml0ZXMgYSBtaXNzaW5nIHNuYXBzaG90OiBpdCBmYWlsc1xuICBpZiAoIShrZXkgaW4gc25hcHMpICYmIHByb2Nlc3MuZW52LkNJICYmICFwcm9jZXNzLmVudi5VUERBVEVfU05BUFNIT1RTKSByZXR1cm4geyBwYXNzOiBmYWxzZSwgbWVzc2FnZTogYG1pc3Npbmcgc25hcHNob3QgXCIke2tleX1cIiAocnVuIHRoZSB0ZXN0cyBsb2NhbGx5IGFuZCBjb21taXQgdGhlIC5zbmFwIGZpbGUpYCB9O1xuICBpZiAocHJvY2Vzcy5lbnYuVVBEQVRFX1NOQVBTSE9UUyB8fCAhKGtleSBpbiBzbmFwcykpIHtcbiAgICBpZiAoc25hcHNba2V5XSAhPT0gZ290KSB7IHNuYXBzW2tleV0gPSBnb3Q7IGRpcnR5U25hcHMuYWRkKGZpbGUpOyB9XG4gICAgcmV0dXJuIHsgcGFzczogdHJ1ZSwgbWVzc2FnZTogXCJcIiB9O1xuICB9XG4gIHJldHVybiB7IHBhc3M6IHNuYXBzW2tleV0gPT09IGdvdCwgbWVzc2FnZTogYHNuYXBzaG90IFwiJHtrZXl9XCIgZGlmZmVyczpcXG5leHBlY3RlZDoke3NuYXBzW2tleV19XFxucmVjZWl2ZWQ6JHtnb3R9KFVQREFURV9TTkFQU0hPVFM9MSBwbnBtIHRlc3QgdG8gYWNjZXB0KWAgfTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGV4cGVjdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3Qgc2hvdyA9ICh2OiB1bmtub3duKSA9PiAoaXNBc3ltbWV0cmljKHYpID8gdi50b1N0cmluZygpIDogaW5zcGVjdCh2LCB7IGRlcHRoOiA2LCBicmVha0xlbmd0aDogMTIwIH0pKTtcblxudHlwZSBSZXN1bHQgPSB7IHBhc3M6IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZyB9O1xudHlwZSBNYXRjaGVycyA9IFJlY29yZDxzdHJpbmcsIChhY3R1YWw6IHVua25vd24sIC4uLmFyZ3M6IGFueVtdKSA9PiBSZXN1bHQ+O1xuXG5jb25zdCBtYXRjaGVyczogTWF0Y2hlcnMgPSB7XG4gIHRvQmU6IChhLCBiKSA9PiAoeyBwYXNzOiBPYmplY3QuaXMoYSwgYiksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlICR7c2hvdyhiKX1gIH0pLFxuICB0b0VxdWFsOiAoYSwgYikgPT4gKHsgcGFzczogZXF1YWxzKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBlcXVhbCAke3Nob3coYil9YCB9KSxcbiAgdG9TdHJpY3RFcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IGlzRGVlcFN0cmljdEVxdWFsKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBzdHJpY3RseSBlcXVhbCAke3Nob3coYil9YCB9KSxcbiAgdG9NYXRjaE9iamVjdDogKGEsIGIpID0+ICh7IHBhc3M6IGVxdWFscyhhLCBiLCB0cnVlKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gbWF0Y2ggb2JqZWN0ICR7c2hvdyhiKX1gIH0pLFxuICB0b0JlQ2xvc2VUbzogKGEsIGI6IG51bWJlciwgZGlnaXRzID0gMikgPT4gKHtcbiAgICBwYXNzOiB0eXBlb2YgYSA9PT0gXCJudW1iZXJcIiAmJiAoYSA9PT0gYiB8fCBNYXRoLmFicyhhIC0gYikgPCAxMCAqKiAtZGlnaXRzIC8gMiksXG4gICAgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgY2xvc2UgdG8gJHtifSAoJHtkaWdpdHN9IGRpZ2l0cylgLFxuICB9KSxcbiAgdG9CZUdyZWF0ZXJUaGFuOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA+IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9ID4gJHtifWAgfSksXG4gIHRvQmVHcmVhdGVyVGhhbk9yRXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpID49IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9ID49ICR7Yn1gIH0pLFxuICB0b0JlTGVzc1RoYW46IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpIDwgYiwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gPCAke2J9YCB9KSxcbiAgdG9CZUxlc3NUaGFuT3JFcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IChhIGFzIG51bWJlcikgPD0gYiwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gPD0gJHtifWAgfSksXG4gIHRvSGF2ZUxlbmd0aDogKGEsIG4pID0+ICh7IHBhc3M6IChhIGFzIHsgbGVuZ3RoPzogbnVtYmVyIH0pPy5sZW5ndGggPT09IG4sIG1lc3NhZ2U6IGBleHBlY3RlZCBsZW5ndGggJHtufSwgZ290ICR7KGEgYXMgeyBsZW5ndGg/OiBudW1iZXIgfSk/Lmxlbmd0aH0gKCR7c2hvdyhhKX0pYCB9KSxcbiAgdG9IYXZlUHJvcGVydHk6IChhLCBrZXk6IHN0cmluZywgLi4udjogdW5rbm93bltdKSA9PiB7XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdChcIi5cIik7XG4gICAgbGV0IG86IGFueSA9IGE7XG4gICAgZm9yIChjb25zdCBrIG9mIHBhdGgpIHsgaWYgKG8gPT0gbnVsbCB8fCAhKGsgaW4gT2JqZWN0KG8pKSkgcmV0dXJuIHsgcGFzczogZmFsc2UsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGhhdmUgcHJvcGVydHkgJHtrZXl9YCB9OyBvID0gb1trXTsgfVxuICAgIHJldHVybiB7IHBhc3M6IHYubGVuZ3RoID09PSAwIHx8IGVxdWFscyhvLCB2WzBdKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gaGF2ZSAke2tleX0gPSAke3Nob3codlswXSl9LCBnb3QgJHtzaG93KG8pfWAgfTtcbiAgfSxcbiAgdG9CZU51bGw6IChhKSA9PiAoeyBwYXNzOiBhID09PSBudWxsLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSBudWxsYCB9KSxcbiAgdG9CZVVuZGVmaW5lZDogKGEpID0+ICh7IHBhc3M6IGEgPT09IHVuZGVmaW5lZCwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgdW5kZWZpbmVkYCB9KSxcbiAgdG9CZURlZmluZWQ6IChhKSA9PiAoeyBwYXNzOiBhICE9PSB1bmRlZmluZWQsIG1lc3NhZ2U6IGBleHBlY3RlZCBhIGRlZmluZWQgdmFsdWVgIH0pLFxuICB0b0JlVHJ1dGh5OiAoYSkgPT4gKHsgcGFzczogISFhLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSB0cnV0aHlgIH0pLFxuICB0b0JlRmFsc3k6IChhKSA9PiAoeyBwYXNzOiAhYSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgZmFsc3lgIH0pLFxuICB0b0JlTmFOOiAoYSkgPT4gKHsgcGFzczogTnVtYmVyLmlzTmFOKGEpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSBOYU5gIH0pLFxuICB0b0JlSW5zdGFuY2VPZjogKGEsIGNscykgPT4gKHsgcGFzczogYSBpbnN0YW5jZW9mIGNscywgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgYW4gaW5zdGFuY2Ugb2YgJHtjbHM/Lm5hbWV9YCB9KSxcbiAgdG9CZVR5cGVPZjogKGEsIHQ6IHN0cmluZykgPT4gKHsgcGFzczogdHlwZW9mIGEgPT09IHQsIG1lc3NhZ2U6IGBleHBlY3RlZCB0eXBlb2YgJHtzaG93KGEpfSB0byBiZSAke3R9YCB9KSxcbiAgdG9NYXRjaDogKGEsIHJlOiBSZWdFeHAgfCBzdHJpbmcpID0+ICh7XG4gICAgcGFzczogdHlwZW9mIGEgPT09IFwic3RyaW5nXCIgJiYgKHR5cGVvZiByZSA9PT0gXCJzdHJpbmdcIiA/IGEuaW5jbHVkZXMocmUpIDogcmUudGVzdChhKSksXG4gICAgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gbWF0Y2ggJHtTdHJpbmcocmUpfWAsXG4gIH0pLFxuICB0b0NvbnRhaW46IChhLCBpdGVtKSA9PiAoe1xuICAgIHBhc3M6IHR5cGVvZiBhID09PSBcInN0cmluZ1wiID8gYS5pbmNsdWRlcyhpdGVtIGFzIHN0cmluZykgOiBBcnJheS5pc0FycmF5KGEpIHx8IGEgaW5zdGFuY2VvZiBTZXQgPyBbLi4uKGEgYXMgSXRlcmFibGU8dW5rbm93bj4pXS5pbmNsdWRlcyhpdGVtKSA6IGZhbHNlLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGNvbnRhaW4gJHtzaG93KGl0ZW0pfWAsXG4gIH0pLFxuICB0b0NvbnRhaW5FcXVhbDogKGEsIGl0ZW0pID0+ICh7IHBhc3M6IEFycmF5LmlzQXJyYXkoYSkgJiYgYS5zb21lKCh4KSA9PiBlcXVhbHMoeCwgaXRlbSkpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBjb250YWluIGFuIGl0ZW0gZXF1YWwgdG8gJHtzaG93KGl0ZW0pfWAgfSksXG4gIHRvVGhyb3c6IChmbk9yRXJyb3IsIGV4cGVjdGVkPzogdW5rbm93bikgPT4ge1xuICAgIGxldCBlcnI6IHVua25vd24sIHRocmV3ID0gZmFsc2U7XG4gICAgaWYgKHR5cGVvZiBmbk9yRXJyb3IgPT09IFwiZnVuY3Rpb25cIikgeyB0cnkgeyAoZm5PckVycm9yIGFzICgpID0+IHVua25vd24pKCk7IH0gY2F0Y2ggKGUpIHsgdGhyZXcgPSB0cnVlOyBlcnIgPSBlOyB9IH1cbiAgICBlbHNlIHsgdGhyZXcgPSB0cnVlOyBlcnIgPSBmbk9yRXJyb3I7IH0gLy8gZnJvbSAucmVqZWN0c1xuICAgIGNvbnN0IG1zZyA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICBsZXQgcGFzcyA9IHRocmV3O1xuICAgIGlmICh0aHJldyAmJiBleHBlY3RlZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcInN0cmluZ1wiKSBwYXNzID0gbXNnLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgIGVsc2UgaWYgKGV4cGVjdGVkIGluc3RhbmNlb2YgUmVnRXhwKSBwYXNzID0gZXhwZWN0ZWQudGVzdChtc2cpO1xuICAgICAgZWxzZSBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcImZ1bmN0aW9uXCIpIHBhc3MgPSBlcnIgaW5zdGFuY2VvZiAoZXhwZWN0ZWQgYXMgbmV3ICgpID0+IHVua25vd24pO1xuICAgICAgZWxzZSBpZiAoZXhwZWN0ZWQgaW5zdGFuY2VvZiBFcnJvcikgcGFzcyA9IG1zZyA9PT0gZXhwZWN0ZWQubWVzc2FnZTtcbiAgICB9XG4gICAgcmV0dXJuIHsgcGFzcywgbWVzc2FnZTogdGhyZXcgPyBgZXhwZWN0ZWQgdGhlIGVycm9yICgke21zZ30pIHRvIG1hdGNoICR7c2hvdyhleHBlY3RlZCl9YCA6IGBleHBlY3RlZCBhIHRocm93JHtleHBlY3RlZCA9PT0gdW5kZWZpbmVkID8gXCJcIiA6IGAgbWF0Y2hpbmcgJHtzaG93KGV4cGVjdGVkKX1gfWAgfTtcbiAgfSxcbiAgdG9NYXRjaFNuYXBzaG90OiAoYSwgaGludD86IHN0cmluZykgPT4gbWF0Y2hTbmFwc2hvdChhLCBoaW50KSxcbn07XG5tYXRjaGVycy50b1Rocm93RXJyb3IgPSBtYXRjaGVycy50b1Rocm93O1xuY29uc3QgY2FsbHMgPSAoYTogdW5rbm93bikgPT4geyBpZiAoIWlzTW9jayhhKSkgdGhyb3cgbmV3IFR5cGVFcnJvcihgJHtzaG93KGEpfSBpcyBub3QgYSB2aS5mbigpYCk7IHJldHVybiBhLm1vY2suY2FsbHM7IH07XG5tYXRjaGVycy50b0hhdmVCZWVuQ2FsbGVkID0gKGEpID0+ICh7IHBhc3M6IGNhbGxzKGEpLmxlbmd0aCA+IDAsIG1lc3NhZ2U6IFwiZXhwZWN0ZWQgdGhlIG1vY2sgdG8gaGF2ZSBiZWVuIGNhbGxlZFwiIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZFRpbWVzID0gKGEsIG46IG51bWJlcikgPT4gKHsgcGFzczogY2FsbHMoYSkubGVuZ3RoID09PSBuLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtufSBjYWxscywgZ290ICR7Y2FsbHMoYSkubGVuZ3RofWAgfSk7XG5tYXRjaGVycy50b0hhdmVCZWVuQ2FsbGVkV2l0aCA9IChhLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGNhbGxzKGEpLnNvbWUoKGMpID0+IGVxdWFscyhjLCBhcmdzKSksIG1lc3NhZ2U6IGBleHBlY3RlZCBhIGNhbGwgd2l0aCAke3Nob3coYXJncyl9OyBjYWxsczogJHtzaG93KGNhbGxzKGEpKX1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkxhc3RDYWxsZWRXaXRoID0gKGEsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gKHsgcGFzczogZXF1YWxzKGNhbGxzKGEpLmF0KC0xKSwgYXJncyksIG1lc3NhZ2U6IGBleHBlY3RlZCB0aGUgbGFzdCBjYWxsIHRvIGJlICR7c2hvdyhhcmdzKX07IGNhbGxzOiAke3Nob3coY2FsbHMoYSkpfWAgfSk7XG5tYXRjaGVycy50b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aCA9IChhLCBuOiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gKHsgcGFzczogZXF1YWxzKGNhbGxzKGEpW24gLSAxXSwgYXJncyksIG1lc3NhZ2U6IGBleHBlY3RlZCBjYWxsICR7bn0gdG8gYmUgJHtzaG93KGFyZ3MpfTsgY2FsbHM6ICR7c2hvdyhjYWxscyhhKSl9YCB9KTtcblxuLyoqIFRoZSBtYXRjaGVycywgdHlwZWQgKFIgPSB2b2lkLCBvciBQcm9taXNlPHZvaWQ+IGFmdGVyIC5yZXNvbHZlcyAvIC5yZWplY3RzKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXNzZXJ0aW9uPFIgPSB2b2lkPiB7XG4gIHRvQmUoZXhwZWN0ZWQ6IHVua25vd24pOiBSO1xuICB0b0VxdWFsKGV4cGVjdGVkOiB1bmtub3duKTogUjtcbiAgdG9TdHJpY3RFcXVhbChleHBlY3RlZDogdW5rbm93bik6IFI7XG4gIHRvTWF0Y2hPYmplY3QoZXhwZWN0ZWQ6IG9iamVjdCk6IFI7XG4gIHRvQmVDbG9zZVRvKGV4cGVjdGVkOiBudW1iZXIsIGRpZ2l0cz86IG51bWJlcik6IFI7XG4gIHRvQmVHcmVhdGVyVGhhbihuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlR3JlYXRlclRoYW5PckVxdWFsKG46IG51bWJlciB8IGJpZ2ludCk6IFI7XG4gIHRvQmVMZXNzVGhhbihuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlTGVzc1RoYW5PckVxdWFsKG46IG51bWJlciB8IGJpZ2ludCk6IFI7XG4gIHRvSGF2ZUxlbmd0aChuOiBudW1iZXIpOiBSO1xuICB0b0hhdmVQcm9wZXJ0eShwYXRoOiBzdHJpbmcsIHZhbHVlPzogdW5rbm93bik6IFI7XG4gIHRvQmVOdWxsKCk6IFI7XG4gIHRvQmVVbmRlZmluZWQoKTogUjtcbiAgdG9CZURlZmluZWQoKTogUjtcbiAgdG9CZVRydXRoeSgpOiBSO1xuICB0b0JlRmFsc3koKTogUjtcbiAgdG9CZU5hTigpOiBSO1xuICB0b0JlSW5zdGFuY2VPZihjbHM6IGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bik6IFI7XG4gIHRvQmVUeXBlT2YodHlwZTogXCJzdHJpbmdcIiB8IFwibnVtYmVyXCIgfCBcImJpZ2ludFwiIHwgXCJib29sZWFuXCIgfCBcInN5bWJvbFwiIHwgXCJ1bmRlZmluZWRcIiB8IFwib2JqZWN0XCIgfCBcImZ1bmN0aW9uXCIpOiBSO1xuICB0b01hdGNoKGV4cGVjdGVkOiBSZWdFeHAgfCBzdHJpbmcpOiBSO1xuICB0b0NvbnRhaW4oaXRlbTogdW5rbm93bik6IFI7XG4gIHRvQ29udGFpbkVxdWFsKGl0ZW06IHVua25vd24pOiBSO1xuICB0b1Rocm93KGV4cGVjdGVkPzogc3RyaW5nIHwgUmVnRXhwIHwgRXJyb3IgfCAoYWJzdHJhY3QgbmV3ICguLi5hcmdzOiBuZXZlcltdKSA9PiB1bmtub3duKSk6IFI7XG4gIHRvVGhyb3dFcnJvcihleHBlY3RlZD86IHN0cmluZyB8IFJlZ0V4cCB8IEVycm9yIHwgKGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bikpOiBSO1xuICB0b01hdGNoU25hcHNob3QoaGludD86IHN0cmluZyk6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWQoKTogUjtcbiAgdG9IYXZlQmVlbkNhbGxlZFRpbWVzKG46IG51bWJlcik6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWRXaXRoKC4uLmFyZ3M6IHVua25vd25bXSk6IFI7XG4gIHRvSGF2ZUJlZW5MYXN0Q2FsbGVkV2l0aCguLi5hcmdzOiB1bmtub3duW10pOiBSO1xuICB0b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aChuOiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSk6IFI7XG59XG5cbnR5cGUgRXhwZWN0YXRpb24gPSBBc3NlcnRpb24gJiB7XG4gIG5vdDogQXNzZXJ0aW9uO1xuICByZXNvbHZlczogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+ICYgeyBub3Q6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiB9O1xuICByZWplY3RzOiBBc3NlcnRpb248UHJvbWlzZTx2b2lkPj4gJiB7IG5vdDogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+IH07XG59O1xuXG5mdW5jdGlvbiBmYWlsKHI6IFJlc3VsdCwgbmVnYXRlOiBib29sZWFuLCBsYWJlbD86IHN0cmluZykge1xuICBpZiAoci5wYXNzID09PSBuZWdhdGUpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gKGxhYmVsID8gYCR7bGFiZWx9OiBgIDogXCJcIikgKyAobmVnYXRlID8gYG5vdDogJHtyLm1lc3NhZ2V9YCA6IHIubWVzc2FnZSk7XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKHsgbWVzc2FnZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZChhY3R1YWw6ICgpID0+IHVua25vd24sIG5lZ2F0ZTogYm9vbGVhbiwgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXN5bmM6IGZhbHNlKTogQXNzZXJ0aW9uO1xuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiBQcm9taXNlPHVua25vd24+LCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiB0cnVlKTogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+O1xuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiB1bmtub3duLCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiBib29sZWFuKTogdW5rbm93biB7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgZm9yIChjb25zdCBbbmFtZSwgbV0gb2YgT2JqZWN0LmVudHJpZXMobWF0Y2hlcnMpKSB7XG4gICAgb3V0W25hbWVdID0gYXN5bmNcbiAgICAgID8gYXN5bmMgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZmFpbChtKGF3YWl0IGFjdHVhbCgpLCAuLi5hcmdzKSwgbmVnYXRlLCBsYWJlbClcbiAgICAgIDogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZmFpbChtKGFjdHVhbCgpLCAuLi5hcmdzKSwgbmVnYXRlLCBsYWJlbCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGVjdDxUPihhY3R1YWw6IFQsIGxhYmVsPzogc3RyaW5nKTogRXhwZWN0YXRpb24ge1xuICBjb25zdCBlID0gYnVpbGQoKCkgPT4gYWN0dWFsLCBmYWxzZSwgbGFiZWwsIGZhbHNlKSBhcyBFeHBlY3RhdGlvbjtcbiAgZS5ub3QgPSBidWlsZCgoKSA9PiBhY3R1YWwsIHRydWUsIGxhYmVsLCBmYWxzZSk7XG4gIGNvbnN0IHNldHRsZSA9ICh3YW50OiBcInJlc29sdmVcIiB8IFwicmVqZWN0XCIpID0+IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdiA9IGF3YWl0IChhY3R1YWwgYXMgdW5rbm93biBhcyBQcm9taXNlPHVua25vd24+KTtcbiAgICAgIGlmICh3YW50ID09PSBcInJlamVjdFwiKSB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiBgJHtsYWJlbCA/IGxhYmVsICsgXCI6IFwiIDogXCJcIn1leHBlY3RlZCBhIHJlamVjdGlvbiwgZ290ICR7c2hvdyh2KX1gIH0pO1xuICAgICAgcmV0dXJuIHY7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyIGluc3RhbmNlb2YgQXNzZXJ0aW9uRXJyb3IgJiYgd2FudCA9PT0gXCJyZWplY3RcIikgdGhyb3cgZXJyO1xuICAgICAgaWYgKHdhbnQgPT09IFwicmVzb2x2ZVwiKSB0aHJvdyBlcnI7XG4gICAgICByZXR1cm4gZXJyO1xuICAgIH1cbiAgfTtcbiAgZS5yZXNvbHZlcyA9IE9iamVjdC5hc3NpZ24oYnVpbGQoc2V0dGxlKFwicmVzb2x2ZVwiKSwgZmFsc2UsIGxhYmVsLCB0cnVlKSwgeyBub3Q6IGJ1aWxkKHNldHRsZShcInJlc29sdmVcIiksIHRydWUsIGxhYmVsLCB0cnVlKSB9KTtcbiAgZS5yZWplY3RzID0gT2JqZWN0LmFzc2lnbihidWlsZChzZXR0bGUoXCJyZWplY3RcIiksIGZhbHNlLCBsYWJlbCwgdHJ1ZSksIHsgbm90OiBidWlsZChzZXR0bGUoXCJyZWplY3RcIiksIHRydWUsIGxhYmVsLCB0cnVlKSB9KTtcbiAgcmV0dXJuIGU7XG59XG5cbmNvbnN0IGFzeW1tZXRyaWMgPSAobmFtZTogc3RyaW5nLCB0ZXN0OiAodjogdW5rbm93bikgPT4gYm9vbGVhbik6IEFzeW1tZXRyaWMgPT4gKHsgYXN5bW1ldHJpY01hdGNoOiB0ZXN0LCB0b1N0cmluZzogKCkgPT4gbmFtZSB9KTtcblxuZXhwZWN0LmNsb3NlVG8gPSAobjogbnVtYmVyLCBkaWdpdHMgPSAyKSA9PiBhc3ltbWV0cmljKGBjbG9zZVRvKCR7bn0sICR7ZGlnaXRzfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwibnVtYmVyXCIgJiYgTWF0aC5hYnModiAtIG4pIDwgMTAgKiogLWRpZ2l0cyAvIDIpO1xuZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcgPSAobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IGFzeW1tZXRyaWMoYG9iamVjdENvbnRhaW5pbmcoJHtzaG93KG8pfSlgLCAodikgPT4gZXF1YWxzKHYsIG8sIHRydWUpKTtcbmV4cGVjdC5hcnJheUNvbnRhaW5pbmcgPSAoeHM6IHVua25vd25bXSkgPT4gYXN5bW1ldHJpYyhgYXJyYXlDb250YWluaW5nKCR7c2hvdyh4cyl9KWAsICh2KSA9PiBBcnJheS5pc0FycmF5KHYpICYmIHhzLmV2ZXJ5KCh4KSA9PiB2LnNvbWUoKHkpID0+IGVxdWFscyh5LCB4KSkpKTtcbmV4cGVjdC5zdHJpbmdDb250YWluaW5nID0gKHM6IHN0cmluZykgPT4gYXN5bW1ldHJpYyhgc3RyaW5nQ29udGFpbmluZygke3Nob3cocyl9KWAsICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2LmluY2x1ZGVzKHMpKTtcbmV4cGVjdC5zdHJpbmdNYXRjaGluZyA9IChyZTogUmVnRXhwIHwgc3RyaW5nKSA9PiBhc3ltbWV0cmljKGBzdHJpbmdNYXRjaGluZygke1N0cmluZyhyZSl9KWAsICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiAodHlwZW9mIHJlID09PSBcInN0cmluZ1wiID8gdi5pbmNsdWRlcyhyZSkgOiByZS50ZXN0KHYpKSk7XG5leHBlY3QuYW55ID0gKGNsczogdW5rbm93bikgPT4gYXN5bW1ldHJpYyhgYW55KCR7KGNscyBhcyB7IG5hbWU/OiBzdHJpbmcgfSk/Lm5hbWV9KWAsICh2KSA9PlxuICBjbHMgPT09IFN0cmluZyA/IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiIDogY2xzID09PSBOdW1iZXIgPyB0eXBlb2YgdiA9PT0gXCJudW1iZXJcIiA6IGNscyA9PT0gQm9vbGVhbiA/IHR5cGVvZiB2ID09PSBcImJvb2xlYW5cIiA6IGNscyA9PT0gRnVuY3Rpb24gPyB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiIDogdiBpbnN0YW5jZW9mIChjbHMgYXMgbmV3ICgpID0+IHVua25vd24pKTtcbmV4cGVjdC5hbnl0aGluZyA9ICgpID0+IGFzeW1tZXRyaWMoXCJhbnl0aGluZygpXCIsICh2KSA9PiB2ICE9IG51bGwpO1xuXG4iLCAiLy8gVGhlIHNsaWNlIG9mIENsb3VkZmxhcmUgRDEncyBBUEkgdGhlIHdvcmtlciB1c2VzLCBvbiBOb2RlJ3MgYnVpbHQtaW4gU1FMaXRlIChub2RlOnNxbGl0ZSxcbi8vIE5vZGUgXHUyMjY1IDIyLjEzKS4gTGV0cyB0aGUgZXhhY3Qgc2FtZSB3b3JrZXIgY29kZSBydW4gb24gYW55IGJveCB3aXRoIE5vZGUgb3IgRG9ja2VyLlxuaW1wb3J0IHsgRGF0YWJhc2VTeW5jLCB0eXBlIFN0YXRlbWVudFN5bmMgfSBmcm9tIFwibm9kZTpzcWxpdGVcIjtcblxudHlwZSBSb3cgPSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuY2xhc3MgU3RtdCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZGI6IERhdGFiYXNlU3luYywgcmVhZG9ubHkgc3FsOiBzdHJpbmcsIHJlYWRvbmx5IGFyZ3M6IHVua25vd25bXSA9IFtdKSB7fVxuICBiaW5kKC4uLmFyZ3M6IHVua25vd25bXSkgeyByZXR1cm4gbmV3IFN0bXQodGhpcy5kYiwgdGhpcy5zcWwsIGFyZ3MpOyB9XG4gIHByaXZhdGUgc3QoKTogU3RhdGVtZW50U3luYyB7IHJldHVybiB0aGlzLmRiLnByZXBhcmUodGhpcy5zcWwpOyB9XG4gIHByaXZhdGUgYSgpIHsgcmV0dXJuIHRoaXMuYXJncy5tYXAoKHgpID0+ICh4ID09PSB1bmRlZmluZWQgPyBudWxsIDogdHlwZW9mIHggPT09IFwiYm9vbGVhblwiID8gTnVtYmVyKHgpIDogeCkpIGFzIG5ldmVyW107IH1cbiAgYXN5bmMgZmlyc3Q8VCA9IFJvdz4oY29sPzogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4ge1xuICAgIGNvbnN0IHIgPSB0aGlzLnN0KCkuZ2V0KC4uLnRoaXMuYSgpKSBhcyBSb3cgfCB1bmRlZmluZWQ7XG4gICAgaWYgKCFyKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gKGNvbCA/IHJbY29sXSA6IHIpIGFzIFQ7XG4gIH1cbiAgYXN5bmMgYWxsPFQgPSBSb3c+KCk6IFByb21pc2U8eyByZXN1bHRzOiBUW107IHN1Y2Nlc3M6IHRydWU7IG1ldGE6IG9iamVjdCB9PiB7XG4gICAgcmV0dXJuIHsgcmVzdWx0czogdGhpcy5zdCgpLmFsbCguLi50aGlzLmEoKSkgYXMgVFtdLCBzdWNjZXNzOiB0cnVlLCBtZXRhOiB7fSB9O1xuICB9XG4gIGFzeW5jIHJ1bigpOiBQcm9taXNlPHsgc3VjY2VzczogdHJ1ZTsgbWV0YTogeyBjaGFuZ2VzOiBudW1iZXI7IGxhc3Rfcm93X2lkOiBudW1iZXIgfSB9PiB7XG4gICAgY29uc3QgciA9IHRoaXMuc3QoKS5ydW4oLi4udGhpcy5hKCkpO1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1ldGE6IHsgY2hhbmdlczogTnVtYmVyKHIuY2hhbmdlcyksIGxhc3Rfcm93X2lkOiBOdW1iZXIoci5sYXN0SW5zZXJ0Um93aWQpIH0gfTtcbiAgfVxuICAvKiogc3luY2hyb25vdXMgcnVuLCBmb3IgYmF0Y2ggKi9cbiAgX3J1bigpIHsgcmV0dXJuIHRoaXMuc3QoKS5ydW4oLi4udGhpcy5hKCkpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlRDEge1xuICBwcml2YXRlIGRiOiBEYXRhYmFzZVN5bmM7XG4gIGNvbnN0cnVjdG9yKGZpbGU6IHN0cmluZykge1xuICAgIHRoaXMuZGIgPSBuZXcgRGF0YWJhc2VTeW5jKGZpbGUpO1xuICAgIHRoaXMuZGIuZXhlYyhcIlBSQUdNQSBqb3VybmFsX21vZGUgPSBXQUw7IFBSQUdNQSBidXN5X3RpbWVvdXQgPSA1MDAwO1wiKTtcbiAgfVxuICBwcmVwYXJlKHNxbDogc3RyaW5nKSB7IHJldHVybiBuZXcgU3RtdCh0aGlzLmRiLCBzcWwpOyB9XG4gIC8qKiBhbGwtb3Itbm90aGluZywgbGlrZSBEMSAqL1xuICBhc3luYyBiYXRjaChzdG10czogU3RtdFtdKSB7XG4gICAgdGhpcy5kYi5leGVjKFwiQkVHSU5cIik7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG91dCA9IHN0bXRzLm1hcCgocykgPT4geyBjb25zdCByID0gcy5fcnVuKCk7IHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1ldGE6IHsgY2hhbmdlczogTnVtYmVyKHIuY2hhbmdlcykgfSB9OyB9KTtcbiAgICAgIHRoaXMuZGIuZXhlYyhcIkNPTU1JVFwiKTtcbiAgICAgIHJldHVybiBvdXQ7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5kYi5leGVjKFwiUk9MTEJBQ0tcIik7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICBhc3luYyBleGVjKHNxbDogc3RyaW5nKSB7IHRoaXMuZGIuZXhlYyhzcWwpOyByZXR1cm4geyBjb3VudDogMCwgZHVyYXRpb246IDAgfTsgfVxufVxuIiwgIi8vIEVkMjU1MTkgcmVxdWVzdCBzaWduaW5nIGJldHdlZW4gSXJvbnRlcm0gc2VydmVycyBhbmQgdGhlIGRpcmVjdG9yeSAoZG9jcy9zb2NpYWwvUFJPVE9DT0wubWQgXHUwMEE3MikuXG4vLyBXZWJDcnlwdG8gb25seSwgc28gdGhlIHNhbWUgY29kZSBydW5zIGluIFdvcmtlcnMsIE5vZGUgMjIgYW5kIHRoZSBkaXJlY3RvcnkuXG5cbmV4cG9ydCBjb25zdCBTS0VXX1MgPSAzMDA7XG5leHBvcnQgY29uc3QgU0lHX0hFQURFUiA9IFwiSXJvbnRlcm0tU2lnbmF0dXJlXCI7XG5cbmNvbnN0IGVuYyA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXG5leHBvcnQgZnVuY3Rpb24gYjY0dXJsKGI6IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlcik6IHN0cmluZyB7XG4gIGNvbnN0IHUgPSBiIGluc3RhbmNlb2YgVWludDhBcnJheSA/IGIgOiBuZXcgVWludDhBcnJheShiKTtcbiAgbGV0IHMgPSBcIlwiO1xuICBmb3IgKGNvbnN0IHggb2YgdSkgcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHgpO1xuICByZXR1cm4gYnRvYShzKS5yZXBsYWNlKC9cXCsvZywgXCItXCIpLnJlcGxhY2UoL1xcLy9nLCBcIl9cIikucmVwbGFjZSgvPSskLywgXCJcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bmI2NHVybChzOiBzdHJpbmcpOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB7XG4gIGNvbnN0IHQgPSBzLnJlcGxhY2UoLy0vZywgXCIrXCIpLnJlcGxhY2UoL18vZywgXCIvXCIpO1xuICBjb25zdCBiaW4gPSBhdG9iKHQgKyBcIj09PVwiLnNsaWNlKCh0Lmxlbmd0aCArIDMpICUgNCkpO1xuICBjb25zdCBvdXQgPSBuZXcgVWludDhBcnJheShuZXcgQXJyYXlCdWZmZXIoYmluLmxlbmd0aCkpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGJpbi5sZW5ndGg7IGkrKykgb3V0W2ldID0gYmluLmNoYXJDb2RlQXQoaSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBjb25zdCBoZXggPSAoYjogQXJyYXlCdWZmZXIgfCBVaW50OEFycmF5KSA9PiBbLi4uKGIgaW5zdGFuY2VvZiBVaW50OEFycmF5ID8gYiA6IG5ldyBVaW50OEFycmF5KGIpKV0ubWFwKCh4KSA9PiB4LnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpLmpvaW4oXCJcIik7XG5leHBvcnQgY29uc3Qgc2hhMjU2aGV4ID0gYXN5bmMgKGRhdGE6IHN0cmluZyB8IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+KSA9PiBoZXgoYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiID8gZW5jLmVuY29kZShkYXRhKSA6IGRhdGEpKTtcblxuLyoqIEZyaWVuZC5pZDogZmlyc3QgMTIgaGV4IGNoYXJzIG9mIHNoYTI1NihzZXJ2ZXIgb3JpZ2luKS4gKi9cbmV4cG9ydCBjb25zdCBmcmllbmRJZCA9IGFzeW5jIChvcmlnaW46IHN0cmluZykgPT4gKGF3YWl0IHNoYTI1NmhleChvcmlnaW4pKS5zbGljZSgwLCAxMik7XG5cbi8qKiBIdW1hbi1jaGVja2FibGUga2V5IGZpbmdlcnByaW50OiBmaXJzdCAxNiBoZXggY2hhcnMgb2Ygc2hhMjU2KHJhdyBrZXkpLCBpbiBncm91cHMgb2YgNC4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaW5nZXJwcmludChwdWJsaWNLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGxldCByYXc6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+O1xuICB0cnkgeyByYXcgPSB1bmI2NHVybChwdWJsaWNLZXkpOyB9IGNhdGNoIHsgcmV0dXJuIFwiXCI7IH1cbiAgcmV0dXJuIChhd2FpdCBzaGEyNTZoZXgocmF3KSkuc2xpY2UoMCwgMTYpLm1hdGNoKC8uezR9L2cpIS5qb2luKFwiLVwiKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBLZXlQYWlyIHsgcHVibGljS2V5OiBzdHJpbmc7IHByaXZhdGVKd2s6IEpzb25XZWJLZXkgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVLZXlQYWlyKCk6IFByb21pc2U8S2V5UGFpcj4ge1xuICBjb25zdCBrcCA9IChhd2FpdCBjcnlwdG8uc3VidGxlLmdlbmVyYXRlS2V5KHsgbmFtZTogXCJFZDI1NTE5XCIgfSwgdHJ1ZSwgW1wic2lnblwiLCBcInZlcmlmeVwiXSkpIGFzIENyeXB0b0tleVBhaXI7XG4gIGNvbnN0IHJhdyA9IChhd2FpdCBjcnlwdG8uc3VidGxlLmV4cG9ydEtleShcInJhd1wiLCBrcC5wdWJsaWNLZXkpKSBhcyBBcnJheUJ1ZmZlcjtcbiAgY29uc3QgandrID0gKGF3YWl0IGNyeXB0by5zdWJ0bGUuZXhwb3J0S2V5KFwiandrXCIsIGtwLnByaXZhdGVLZXkpKSBhcyBKc29uV2ViS2V5O1xuICByZXR1cm4geyBwdWJsaWNLZXk6IGI2NHVybChyYXcpLCBwcml2YXRlSndrOiBqd2sgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGltcG9ydFByaXZhdGUgPSAoandrOiBKc29uV2ViS2V5KSA9PiBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcImp3a1wiLCBqd2ssIHsgbmFtZTogXCJFZDI1NTE5XCIgfSwgZmFsc2UsIFtcInNpZ25cIl0pO1xuXG4vKiogXCJodHRwczovL2EuZXhhbXBsZVwiIGZyb20gYW55dGhpbmcgVVJMLXNoYXBlZDsgbnVsbCB3aGVuIGl0IGlzbid0IGFuIGh0dHAocykgb3JpZ2luLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1PcmlnaW4oczogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgYWxsb3dIdHRwOiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghcyB8fCB0eXBlb2YgcyAhPT0gXCJzdHJpbmdcIiB8fCBzLmxlbmd0aCA+IDMwMCkgcmV0dXJuIG51bGw7XG4gIGxldCB1OiBVUkw7XG4gIHRyeSB7IHUgPSBuZXcgVVJMKHMuaW5jbHVkZXMoXCI6Ly9cIikgPyBzIDogYGh0dHBzOi8vJHtzfWApOyB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cbiAgaWYgKHUucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIgJiYgIShhbGxvd0h0dHAgJiYgdS5wcm90b2NvbCA9PT0gXCJodHRwOlwiKSkgcmV0dXJuIG51bGw7XG4gIGlmICh1LnVzZXJuYW1lIHx8IHUucGFzc3dvcmQpIHJldHVybiBudWxsO1xuICByZXR1cm4gdS5vcmlnaW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduaW5nU3RyaW5nKG1ldGhvZDogc3RyaW5nLCBwYXRoQW5kUXVlcnk6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIHRzOiBudW1iZXIgfCBzdHJpbmcsIGJvZHlIYXNoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gW1wiaXJvbnRlcm0tdjFcIiwgbWV0aG9kLnRvVXBwZXJDYXNlKCksIHBhdGhBbmRRdWVyeSwgdGFyZ2V0LCBTdHJpbmcodHMpLCBib2R5SGFzaF0uam9pbihcIlxcblwiKTtcbn1cblxuLyoqIEhlYWRlciB2YWx1ZSBmb3IgYSByZXF1ZXN0IGZyb20gYHNlcnZlcmAgdG8gYHVybGAuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2lnblJlcXVlc3Qob3B0czogeyBrZXk6IENyeXB0b0tleTsgc2VydmVyOiBzdHJpbmc7IG1ldGhvZDogc3RyaW5nOyB1cmw6IHN0cmluZzsgYm9keT86IHN0cmluZzsgbm93PzogbnVtYmVyIH0pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCB1ID0gbmV3IFVSTChvcHRzLnVybCk7XG4gIGNvbnN0IHRzID0gTWF0aC5mbG9vcigob3B0cy5ub3cgPz8gRGF0ZS5ub3coKSkgLyAxMDAwKTtcbiAgY29uc3QgbXNnID0gc2lnbmluZ1N0cmluZyhvcHRzLm1ldGhvZCwgdS5wYXRobmFtZSArIHUuc2VhcmNoLCB1Lm9yaWdpbiwgdHMsIGF3YWl0IHNoYTI1NmhleChvcHRzLmJvZHkgPz8gXCJcIikpO1xuICBjb25zdCBzaWcgPSBhd2FpdCBjcnlwdG8uc3VidGxlLnNpZ24oeyBuYW1lOiBcIkVkMjU1MTlcIiB9LCBvcHRzLmtleSwgZW5jLmVuY29kZShtc2cpKTtcbiAgcmV0dXJuIGBzZXJ2ZXI9XCIke29wdHMuc2VydmVyfVwiLCB0cz1cIiR7dHN9XCIsIHNpZz1cIiR7YjY0dXJsKHNpZyl9XCJgO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlZFNpZyB7IHNlcnZlcjogc3RyaW5nOyB0czogbnVtYmVyOyBzaWc6IHN0cmluZyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNpZ0hlYWRlcihoOiBzdHJpbmcgfCBudWxsKTogUGFyc2VkU2lnIHwgbnVsbCB7XG4gIGlmICghaCB8fCBoLmxlbmd0aCA+IDEwMDApIHJldHVybiBudWxsO1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCBtIG9mIGgubWF0Y2hBbGwoLyhcXHcrKT1cIihbXlwiXSopXCIvZykpIG91dFttWzFdXSA9IG1bMl07XG4gIGlmICghb3V0LnNlcnZlciB8fCAhb3V0LnRzIHx8ICFvdXQuc2lnIHx8ICEvXlxcZHsxLDEyfSQvLnRlc3Qob3V0LnRzKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7IHNlcnZlcjogb3V0LnNlcnZlciwgdHM6IE51bWJlcihvdXQudHMpLCBzaWc6IG91dC5zaWcgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeVNpZyhwdWJsaWNLZXk6IHN0cmluZywgbXNnOiBzdHJpbmcsIHNpZzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgY29uc3Qga2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoXCJyYXdcIiwgdW5iNjR1cmwocHVibGljS2V5KSwgeyBuYW1lOiBcIkVkMjU1MTlcIiB9LCBmYWxzZSwgW1widmVyaWZ5XCJdKTtcbiAgICByZXR1cm4gYXdhaXQgY3J5cHRvLnN1YnRsZS52ZXJpZnkoeyBuYW1lOiBcIkVkMjU1MTlcIiB9LCBrZXksIHVuYjY0dXJsKHNpZyksIGVuYy5lbmNvZGUobXNnKSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIENoZWNrcyBldmVyeXRoaW5nIGJ1dCB0aGUga2V5OiBoZWFkZXIgc2hhcGUsIGNsb2NrIHNrZXcgYW5kIHRhcmdldCBvcmlnaW4uIGBzZWxmYCBpcyB0aGVcbiAqIHJlY2VpdmVyJ3MgY2Fub25pY2FsIG9yaWdpbi4gUmV0dXJucyB0aGUgY2xhaW1lZCBzZW5kZXIgc28gdGhlIGNhbGxlciBjYW4gcGljayBhIGtleSwgdGhlbiBjYWxsXG4gKiBgdmVyaWZ5UmVxdWVzdGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVjaGVjayhyZXE6IFJlcXVlc3QsIHNlbGY6IHN0cmluZywgYWxsb3dIdHRwOiBib29sZWFuLCBub3cgPSBEYXRlLm5vdygpKTogeyBvazogdHJ1ZTsgcGFyc2VkOiBQYXJzZWRTaWc7IHNlcnZlcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgc3RhdHVzOiA0MDE7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGNvbnN0IHAgPSBwYXJzZVNpZ0hlYWRlcihyZXEuaGVhZGVycy5nZXQoU0lHX0hFQURFUikpO1xuICBpZiAoIXApIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDEsIGVycm9yOiBcIm1pc3Npbmcgb3IgbWFsZm9ybWVkIHNpZ25hdHVyZVwiIH07XG4gIGNvbnN0IHNlcnZlciA9IG5vcm1PcmlnaW4ocC5zZXJ2ZXIsIGFsbG93SHR0cCk7XG4gIGlmICghc2VydmVyIHx8IHNlcnZlciAhPT0gcC5zZXJ2ZXIpIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDEsIGVycm9yOiBcImJhZCBzZW5kZXIgb3JpZ2luXCIgfTtcbiAgaWYgKE1hdGguYWJzKG5vdyAvIDEwMDAgLSBwLnRzKSA+IFNLRVdfUykgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGF0dXM6IDQwMSwgZXJyb3I6IFwidGltZXN0YW1wIG91dHNpZGUgdGhlIGFsbG93ZWQgd2luZG93XCIgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBhcnNlZDogcCwgc2VydmVyIH07XG59XG5cbi8qKiBGdWxsIGNoZWNrIHdpdGggdGhlIHNlbmRlcidzIGtleS4gYHJhd0JvZHlgIGlzIHRoZSBleGFjdCBib2R5IHRleHQgKFwiXCIgZm9yIG5vbmUpLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeVJlcXVlc3QocmVxOiBSZXF1ZXN0LCByYXdCb2R5OiBzdHJpbmcsIHNlbGY6IHN0cmluZywgcHVibGljS2V5OiBzdHJpbmcsIHBhcnNlZDogUGFyc2VkU2lnKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHUgPSBuZXcgVVJMKHJlcS51cmwpO1xuICBjb25zdCBtc2cgPSBzaWduaW5nU3RyaW5nKHJlcS5tZXRob2QsIHUucGF0aG5hbWUgKyB1LnNlYXJjaCwgc2VsZiwgcGFyc2VkLnRzLCBhd2FpdCBzaGEyNTZoZXgocmF3Qm9keSkpO1xuICByZXR1cm4gdmVyaWZ5U2lnKHB1YmxpY0tleSwgbXNnLCBwYXJzZWQuc2lnKTtcbn1cbiIsICIvLyBPdXRnb2luZyBjYWxsczogb3RoZXIgc2VydmVycycgLndlbGwta25vd24sIHNpZ25lZCByZXF1ZXN0cywgdGhlIGRpcmVjdG9yeS5cblxuaW1wb3J0IHsgaWRlbnRpdHkgfSBmcm9tIFwiLi9kYlwiO1xuaW1wb3J0IHsgbm9ybU9yaWdpbiwgU0lHX0hFQURFUiwgc2lnblJlcXVlc3QgfSBmcm9tIFwiLi9zaWduXCI7XG5pbXBvcnQgdHlwZSB7IFdlbGxLbm93biB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBUSU1FT1VUX01TID0gNDAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBTb2NpYWxFbnYge1xuICBEQjogRDFEYXRhYmFzZTtcbiAgLyoqIGRpcmVjdG9yeSBiYXNlIFVSTCwgZS5nLiBodHRwczovL2RpcmVjdG9yeS5leGFtcGxlLmNvbSAobm8gYnVpbHQtaW4gZGVmYXVsdCkgKi9cbiAgU09DSUFMX0RJUkVDVE9SWT86IHN0cmluZztcbiAgLyoqIFwiMVwiOiBhbGxvdyBodHRwOi8vIG9yaWdpbnMgKGxvY2FsIHRlc3Rpbmcgb25seSkgKi9cbiAgU09DSUFMX0FMTE9XX0hUVFA/OiBzdHJpbmc7XG4gIC8qKiBjYW5vbmljYWwgb3JpZ2luIG92ZXJyaWRlIHdoZW4gdGhlIHJlcXVlc3QgVVJMIGlzbid0IHRoZSBwdWJsaWMgb25lICovXG4gIFNPQ0lBTF9PUklHSU4/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBhbGxvd0h0dHAgPSAoZW52OiBTb2NpYWxFbnYpID0+IGVudi5TT0NJQUxfQUxMT1dfSFRUUCA9PT0gXCIxXCIgfHwgZW52LlNPQ0lBTF9BTExPV19IVFRQID09PSBcInRydWVcIjtcbmV4cG9ydCBjb25zdCBkaXJlY3RvcnlPZiA9IChlbnY6IFNvY2lhbEVudikgPT4gKGVudi5TT0NJQUxfRElSRUNUT1JZID8gbm9ybU9yaWdpbihlbnYuU09DSUFMX0RJUkVDVE9SWSwgYWxsb3dIdHRwKGVudikpID8/IGVudi5TT0NJQUxfRElSRUNUT1JZLnJlcGxhY2UoL1xcLyskLywgXCJcIikgOiBudWxsKTtcblxuZXhwb3J0IGNsYXNzIFBlZXJFcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobXNnOiBzdHJpbmcsIHB1YmxpYyBzdGF0dXMgPSA1MDIpIHsgc3VwZXIobXNnKTsgfVxufVxuXG4vKiogZmV0Y2ggd2l0aCBhIGhhcmQgZGVhZGxpbmUgKGFsc28gd2hlbiB0aGUgdW5kZXJseWluZyBmZXRjaCBpZ25vcmVzIHRoZSBhYm9ydCBzaWduYWwpLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRpbWVkRmV0Y2godXJsOiBzdHJpbmcsIGluaXQ6IFJlcXVlc3RJbml0ID0ge30sIG1zID0gVElNRU9VVF9NUyk6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgY29uc3QgYWMgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG4gIGxldCB0aW1lcjogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG4gIGNvbnN0IGRlYWRsaW5lID0gbmV3IFByb21pc2U8bmV2ZXI+KChfLCByZWopID0+IHsgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHsgYWMuYWJvcnQoKTsgcmVqKG5ldyBQZWVyRXJyb3IoYHRpbWVkIG91dCBhZnRlciAke21zIC8gMTAwMH1zYCwgNTA0KSk7IH0sIG1zKTsgfSk7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IFByb21pc2UucmFjZShbZmV0Y2godXJsLCB7IC4uLmluaXQsIHNpZ25hbDogYWMuc2lnbmFsLCByZWRpcmVjdDogXCJtYW51YWxcIiB9KSwgZGVhZGxpbmVdKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICB9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaFdlbGxLbm93bihvcmlnaW46IHN0cmluZyk6IFByb21pc2U8V2VsbEtub3duPiB7XG4gIGxldCByOiBSZXNwb25zZTtcbiAgdHJ5IHsgciA9IGF3YWl0IHRpbWVkRmV0Y2goYCR7b3JpZ2lufS8ud2VsbC1rbm93bi9pcm9udGVybWAsIHsgaGVhZGVyczogeyBhY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiIH0gfSk7IH1cbiAgY2F0Y2ggKGUpIHsgdGhyb3cgZSBpbnN0YW5jZW9mIFBlZXJFcnJvciA/IGUgOiBuZXcgUGVlckVycm9yKGBjb3VsZG4ndCByZWFjaCAke29yaWdpbn1gKTsgfVxuICBpZiAoIXIub2spIHRocm93IG5ldyBQZWVyRXJyb3IoYCR7b3JpZ2lufSBpc24ndCBhbiBJcm9udGVybSBzZXJ2ZXIgKCR7ci5zdGF0dXN9KWApO1xuICBjb25zdCB3ID0gKGF3YWl0IHIuanNvbigpLmNhdGNoKCgpID0+IG51bGwpKSBhcyBXZWxsS25vd24gfCBudWxsO1xuICBpZiAoIXcgfHwgdy5zb2Z0d2FyZSAhPT0gXCJpcm9udGVybVwiIHx8IHR5cGVvZiB3LnB1YmxpY0tleSAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IFBlZXJFcnJvcihgJHtvcmlnaW59IGlzbid0IGFuIElyb250ZXJtIHNlcnZlcmApO1xuICBpZiAody5zZXJ2ZXIgIT09IG9yaWdpbikgdGhyb3cgbmV3IFBlZXJFcnJvcihgJHtvcmlnaW59IHNheXMgaXRzIGFkZHJlc3MgaXMgJHt3LnNlcnZlcn1gKTtcbiAgcmV0dXJuIHc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlyZWN0b3J5VXNlciB7IGhhbmRsZTogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfCBudWxsOyBzZXJ2ZXI6IHN0cmluZzsgcHVibGljS2V5OiBzdHJpbmc7IHVwZGF0ZWRBdDogc3RyaW5nIH1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRpcmVjdG9yeVVzZXIoZGlyZWN0b3J5OiBzdHJpbmcsIGhhbmRsZTogc3RyaW5nKTogUHJvbWlzZTxEaXJlY3RvcnlVc2VyIHwgbnVsbD4ge1xuICBsZXQgcjogUmVzcG9uc2U7XG4gIHRyeSB7IHIgPSBhd2FpdCB0aW1lZEZldGNoKGAke2RpcmVjdG9yeX0vdjEvdXNlcnMvJHtlbmNvZGVVUklDb21wb25lbnQoaGFuZGxlKX1gKTsgfVxuICBjYXRjaCB7IHRocm93IG5ldyBQZWVyRXJyb3IoXCJjb3VsZG4ndCByZWFjaCB0aGUgZGlyZWN0b3J5XCIpOyB9XG4gIGlmIChyLnN0YXR1cyA9PT0gNDA0KSByZXR1cm4gbnVsbDtcbiAgaWYgKCFyLm9rKSB0aHJvdyBuZXcgUGVlckVycm9yKGBkaXJlY3RvcnkgZXJyb3IgKCR7ci5zdGF0dXN9KWApO1xuICByZXR1cm4gKGF3YWl0IHIuanNvbigpKSBhcyBEaXJlY3RvcnlVc2VyO1xufVxuXG4vKiogQSByZXF1ZXN0IHNpZ25lZCB3aXRoIHRoaXMgc2VydmVyJ3Mga2V5LiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNpZ25lZEZldGNoKGRiOiBEMURhdGFiYXNlLCBzZWxmOiBzdHJpbmcsIHVybDogc3RyaW5nLCBtZXRob2QgPSBcIkdFVFwiLCBib2R5PzogdW5rbm93bik6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgY29uc3QgeyBrZXkgfSA9IGF3YWl0IGlkZW50aXR5KGRiKTtcbiAgY29uc3QgdGV4dCA9IGJvZHkgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBKU09OLnN0cmluZ2lmeShib2R5KTtcbiAgY29uc3Qgc2lnID0gYXdhaXQgc2lnblJlcXVlc3QoeyBrZXksIHNlcnZlcjogc2VsZiwgbWV0aG9kLCB1cmwsIGJvZHk6IHRleHQgfSk7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IFtTSUdfSEVBREVSXTogc2lnLCBhY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiIH07XG4gIGlmIChib2R5ICE9PSB1bmRlZmluZWQpIGhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIjtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgdGltZWRGZXRjaCh1cmwsIHsgbWV0aG9kLCBoZWFkZXJzLCBib2R5OiBib2R5ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB0ZXh0IH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgZSBpbnN0YW5jZW9mIFBlZXJFcnJvciA/IGUgOiBuZXcgUGVlckVycm9yKGBjb3VsZG4ndCByZWFjaCAke25ldyBVUkwodXJsKS5vcmlnaW59YCk7XG4gIH1cbn1cbiIsICIvLyBXaXJlIHR5cGVzIGZvciBzb2NpYWwgKGRvY3Mvc29jaWFsL1BST1RPQ09MLm1kKS4gU2hhcmVkIGJ5IHRoZSB3b3JrZXIsIHRoZSB3ZWIgVUkgYW5kIHRlc3RzLlxuXG5leHBvcnQgdHlwZSBTaGFyZSA9IFwiYmFzaWNcIiB8IFwibGlmdHNcIiB8IFwiZnVsbFwiO1xuZXhwb3J0IGNvbnN0IFNIQVJFUzogcmVhZG9ubHkgU2hhcmVbXSA9IFtcImJhc2ljXCIsIFwibGlmdHNcIiwgXCJmdWxsXCJdO1xuZXhwb3J0IGNvbnN0IGlzU2hhcmUgPSAoeDogdW5rbm93bik6IHggaXMgU2hhcmUgPT4gdHlwZW9mIHggPT09IFwic3RyaW5nXCIgJiYgKFNIQVJFUyBhcyByZWFkb25seSBzdHJpbmdbXSkuaW5jbHVkZXMoeCk7XG5leHBvcnQgY29uc3QgYXRMZWFzdCA9IChzOiBTaGFyZSwgbWluOiBTaGFyZSkgPT4gU0hBUkVTLmluZGV4T2YocykgPj0gU0hBUkVTLmluZGV4T2YobWluKTtcblxuZXhwb3J0IGNvbnN0IEVNT0pJID0gW1wiXHVEODNEXHVEQ0FBXCIsIFwiXHVEODNEXHVERDI1XCIsIFwiXHVEODNEXHVEQzRGXCIsIFwiXHVEODNDXHVERkM2XCIsIFwiXHVEODNEXHVERTI0XCJdIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IEhBTkRMRV9SRSA9IC9eW2EtejAtOV1bYS16MC05Xy1dezEsMjl9JC87XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2VsbEtub3duIHtcbiAgdjogMTsgc2VydmVyOiBzdHJpbmc7IGhhbmRsZTogc3RyaW5nIHwgbnVsbDsgbmFtZTogc3RyaW5nIHwgbnVsbDsgcHVibGljS2V5OiBzdHJpbmc7IGRpcmVjdG9yeTogc3RyaW5nIHwgbnVsbDsgc29mdHdhcmU6IFwiaXJvbnRlcm1cIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTb2NpYWxQcm9maWxlIHtcbiAgc2VydmVyOiBzdHJpbmc7IGhhbmRsZTogc3RyaW5nIHwgbnVsbDsgbmFtZTogc3RyaW5nIHwgbnVsbDsgc2hhcmU6IFNoYXJlO1xuICB1bml0OiBcImtnXCIgfCBcImxiXCIgfCBudWxsO1xuICBzdHJlYWs6IHsgY3VycmVudDogbnVtYmVyOyBiZXN0OiBudW1iZXIgfTtcbiAgd2VlazogeyBkb25lOiBudW1iZXI7IHRhcmdldDogbnVtYmVyIH07XG4gIHNlc3Npb25zNTI6IG51bWJlcjtcbiAgZ3JhcGg6IHsgc3RhcnQ6IHN0cmluZzsgbGV2ZWxzOiBudW1iZXJbXSB9O1xuICBsaWZ0czogeyBrZXk6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBlMXJtOiBudW1iZXIgfCBudWxsOyBiZXN0OiBudW1iZXIgfCBudWxsIH1bXTtcbiAgYm9keXdlaWdodDogbnVtYmVyIHwgbnVsbDtcbiAgcHJvZ3JhbTogc3RyaW5nIHwgbnVsbDtcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY3Rpb25zIHsgZW1vamk6IHN0cmluZzsgZnJvbTogeyBzZXJ2ZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nIHwgbnVsbCB9W10gfVxuZXhwb3J0IGludGVyZmFjZSBDb21tZW50IHsgaWQ6IHN0cmluZzsgZnJvbTogeyBzZXJ2ZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nIHwgbnVsbCB9OyB0ZXh0OiBzdHJpbmc7IGF0OiBzdHJpbmcgfVxuXG5pbnRlcmZhY2UgSXRlbUJhc2UgeyBpZDogc3RyaW5nOyBhdDogc3RyaW5nOyByZWFjdGlvbnM6IFJlYWN0aW9uc1tdOyBjb21tZW50czogQ29tbWVudFtdIH1cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvbkl0ZW0gZXh0ZW5kcyBJdGVtQmFzZSB7XG4gIGtpbmQ6IFwic2Vzc2lvblwiOyB0aXRsZTogc3RyaW5nOyBkdXJhdGlvbk1pbjogbnVtYmVyOyBzZXRzOiBudW1iZXI7XG4gIGV4ZXJjaXNlczogeyBuYW1lOiBzdHJpbmc7IGxpZnQ6IHN0cmluZyB8IG51bGw7IHRvcD86IHsgd2VpZ2h0OiBudW1iZXI7IHJlcHM6IG51bWJlciB9IHwgbnVsbDsgc2V0cz86IHsgd2VpZ2h0OiBudW1iZXIgfCBudWxsOyByZXBzOiBudW1iZXIgfCBudWxsIH1bXSB9W107XG4gIHZvbHVtZT86IG51bWJlcjsgbm90ZT86IHN0cmluZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJJdGVtIGV4dGVuZHMgSXRlbUJhc2UgeyBraW5kOiBcInByXCI7IGxpZnQ6IHN0cmluZzsgbGlmdE5hbWU6IHN0cmluZzsgcHJLaW5kOiBzdHJpbmc7IHJlcHM6IG51bWJlcjsgd2VpZ2h0PzogbnVtYmVyOyBwcmV2PzogbnVtYmVyIHwgbnVsbCB9XG5leHBvcnQgaW50ZXJmYWNlIEFjaGlldmVtZW50SXRlbSBleHRlbmRzIEl0ZW1CYXNlIHsga2luZDogXCJhY2hpZXZlbWVudFwiOyB0aXRsZTogc3RyaW5nOyB0aWVyOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfVxuZXhwb3J0IHR5cGUgRmVlZEl0ZW0gPSBTZXNzaW9uSXRlbSB8IFBySXRlbSB8IEFjaGlldmVtZW50SXRlbTtcblxuLyoqIGB1bml0YDogdGhlIHdlaWdodHMnIHVuaXQgKG51bGwgYXQgYmFzaWMsIHdoZXJlIHRoZXJlIGFyZSBub25lKSAqL1xuZXhwb3J0IGludGVyZmFjZSBGZWVkUGFnZSB7IGl0ZW1zOiBGZWVkSXRlbVtdOyBuZXh0OiBzdHJpbmcgfCBudWxsOyBzaGFyZTogU2hhcmU7IHVuaXQ6IFwia2dcIiB8IFwibGJcIiB8IG51bGwgfVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvciB7IGlkOiBzdHJpbmc7IHNlcnZlcjogc3RyaW5nOyBoYW5kbGU6IHN0cmluZyB8IG51bGw7IG5hbWU6IHN0cmluZyB8IG51bGwgfVxuZXhwb3J0IGludGVyZmFjZSBGcmllbmQgZXh0ZW5kcyBBdXRob3Ige1xuICBzdGF0dXM6IFwiZnJpZW5kc1wiIHwgXCJvdXRnb2luZ1wiIHwgXCJpbmNvbWluZ1wiO1xuICBzaGFyZTogU2hhcmU7XG4gIHRoZWlyU2hhcmU6IFNoYXJlIHwgbnVsbDtcbiAgc2luY2U6IHN0cmluZzsgbGFzdFNlZW46IHN0cmluZyB8IG51bGw7IGZpbmdlcnByaW50OiBzdHJpbmc7IG5vdGU/OiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBhcmUge1xuICBmcmllbmQ6IEF1dGhvcjsgdW5pdDogXCJrZ1wiIHwgXCJsYlwiO1xuICBsaWZ0czogeyBrZXk6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBtZTogbnVtYmVyIHwgbnVsbDsgdGhlbTogbnVtYmVyIHwgbnVsbDsgbWVCdz86IG51bWJlciB8IG51bGw7IHRoZW1Cdz86IG51bWJlciB8IG51bGwgfVtdO1xuICB3ZWVrczogeyB3ZWVrOiBzdHJpbmc7IG1lOiBudW1iZXI7IHRoZW06IG51bWJlciB9W107XG4gIHN0cmVhazogeyBtZTogbnVtYmVyOyB0aGVtOiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RpZmljYXRpb24ge1xuICBpZDogc3RyaW5nOyBraW5kOiBcInJlcXVlc3RcIiB8IFwiYWNjZXB0ZWRcIiB8IFwicmVhY3Rpb25cIiB8IFwiY29tbWVudFwiOyBmcm9tOiBBdXRob3I7XG4gIGl0ZW0/OiBzdHJpbmc7IGVtb2ppPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nOyBhdDogc3RyaW5nOyByZWFkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNvY2lhbE1lIHtcbiAgZW5hYmxlZDogYm9vbGVhbjsgaGFuZGxlOiBzdHJpbmcgfCBudWxsOyBuYW1lOiBzdHJpbmcgfCBudWxsOyBzZXJ2ZXI6IHN0cmluZzsgZGlyZWN0b3J5OiBzdHJpbmcgfCBudWxsOyBsaXN0ZWQ6IGJvb2xlYW47IGZpbmdlcnByaW50OiBzdHJpbmc7XG4gIC8qKiBkaXJlY3RvcnkgY29uZmlndXJlZCBvbiB0aGlzIHNlcnZlciAoU09DSUFMX0RJUkVDVE9SWSksIGV2ZW4gYmVmb3JlIHNldHVwICovXG4gIGRpcmVjdG9yeUNvbmZpZ3VyZWQ6IGJvb2xlYW47XG4gIHVucmVhZDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBJbmJveE1lc3NhZ2UgPVxuICB8IHsgdHlwZTogXCJmcmllbmRfcmVxdWVzdFwiOyBpZDogc3RyaW5nOyBmcm9tOiB7IHNlcnZlcjogc3RyaW5nOyBoYW5kbGU6IHN0cmluZyB8IG51bGw7IG5hbWU6IHN0cmluZyB8IG51bGw7IGRpcmVjdG9yeTogc3RyaW5nIHwgbnVsbCB9OyBub3RlPzogc3RyaW5nIHwgbnVsbCB9XG4gIHwgeyB0eXBlOiBcImZyaWVuZF9hY2NlcHRcIjsgaWQ6IHN0cmluZzsgcmVxdWVzdDogc3RyaW5nIH1cbiAgfCB7IHR5cGU6IFwiZnJpZW5kX3JlamVjdFwiOyBpZDogc3RyaW5nOyByZXF1ZXN0OiBzdHJpbmcgfVxuICB8IHsgdHlwZTogXCJ1bmZyaWVuZFwiOyBpZDogc3RyaW5nIH1cbiAgfCB7IHR5cGU6IFwicmVhY3Rpb25cIjsgaWQ6IHN0cmluZzsgaXRlbTogc3RyaW5nOyBlbW9qaTogc3RyaW5nIH1cbiAgfCB7IHR5cGU6IFwidW5yZWFjdGlvblwiOyBpZDogc3RyaW5nOyBpdGVtOiBzdHJpbmcgfVxuICB8IHsgdHlwZTogXCJjb21tZW50XCI7IGlkOiBzdHJpbmc7IGl0ZW06IHN0cmluZzsgdGV4dDogc3RyaW5nIH07XG4iLCAiLy8gSXJvbnRlcm0gc29jaWFsIGRpcmVjdG9yeSAoZG9jcy9zb2NpYWwvUFJPVE9DT0wubWQgXHUwMEE3Myk6IHRoZSBvbmx5IGNlbnRyYWwgcGllY2UuIEl0IG1hcHMgYSBoYW5kbGVcbi8vIHRvIGEgc2VydmVyIG9yaWdpbiBhbmQgcHVibGljIGtleSwgYW5kIHN0b3JlcyBub3RoaW5nIGVsc2U6IG5vIHdvcmtvdXRzLCBubyBmcmllbmQgbGlzdHMuXG4vLyBSdW5zIGFzIGEgQ2xvdWRmbGFyZSBXb3JrZXIgd2l0aCBEMSAod3JhbmdsZXIuZGlyZWN0b3J5LmV4YW1wbGUuanNvbmMpIG9yIG9uIE5vZGUgd2l0aCBTUUxpdGVcbi8vIChzZXJ2ZXIvZGlyZWN0b3J5LnRzKS5cblxuaW1wb3J0IHsgZmV0Y2hXZWxsS25vd24gfSBmcm9tIFwiLi4vd29ya2VyL3NvY2lhbC9uZXRcIjtcbmltcG9ydCB7IG5vcm1PcmlnaW4sIHByZWNoZWNrLCB1bmI2NHVybCwgdmVyaWZ5UmVxdWVzdCB9IGZyb20gXCIuLi93b3JrZXIvc29jaWFsL3NpZ25cIjtcbmltcG9ydCB7IEhBTkRMRV9SRSB9IGZyb20gXCIuLi93b3JrZXIvc29jaWFsL3R5cGVzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGlyRW52IHtcbiAgREI6IEQxRGF0YWJhc2U7XG4gIC8qKiBwdWJsaWMgb3JpZ2luIHdoZW4gcmVxdWVzdHMgYXJyaXZlIHVuZGVyIGFub3RoZXIgVVJMICovXG4gIERJUkVDVE9SWV9PUklHSU4/OiBzdHJpbmc7XG4gIC8qKiBcIjFcIjogYWNjZXB0IGh0dHA6Ly8gc2VydmVycyAobG9jYWwgdGVzdGluZyBvbmx5KSAqL1xuICBTT0NJQUxfQUxMT1dfSFRUUD86IHN0cmluZztcbn1cblxuY29uc3QgU0NIRU1BID0gW1xuICBcIkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHVzZXJzIChoYW5kbGUgVEVYVCBQUklNQVJZIEtFWSwgbmFtZSBURVhULCBzZXJ2ZXIgVEVYVCBOT1QgTlVMTCwgcHVibGljX2tleSBURVhUIE5PVCBOVUxMLCBsaXN0ZWQgSU5URUdFUiBOT1QgTlVMTCBERUZBVUxUIDAsIGNyZWF0ZWRfYXQgVEVYVCBOT1QgTlVMTCwgdXBkYXRlZF9hdCBURVhUIE5PVCBOVUxMKVwiLFxuICBcIkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIHVzZXJzX2tleSBPTiB1c2VycyhwdWJsaWNfa2V5KVwiLFxuICBcIkNSRUFURSBJTkRFWCBJRiBOT1QgRVhJU1RTIHVzZXJzX25hbWUgT04gdXNlcnMobG93ZXIobmFtZSkpXCIsXG4gIFwiQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgcmF0ZSAoa2V5IFRFWFQgUFJJTUFSWSBLRVksIGNvdW50IElOVEVHRVIgTk9UIE5VTEwsIHJlc2V0IElOVEVHRVIgTk9UIE5VTEwpXCIsXG5dO1xuY29uc3QgcmVhZHkgPSBuZXcgV2Vha01hcDxvYmplY3QsIFByb21pc2U8dW5rbm93bj4+KCk7XG5jb25zdCBlbnN1cmUgPSAoZGI6IEQxRGF0YWJhc2UpID0+IHsgbGV0IHAgPSByZWFkeS5nZXQoZGIpOyBpZiAoIXApIHJlYWR5LnNldChkYiwgKHAgPSBkYi5iYXRjaChTQ0hFTUEubWFwKChzKSA9PiBkYi5wcmVwYXJlKHMpKSkpKTsgcmV0dXJuIHA7IH07XG5cbi8qKiBwZXIgY2xpZW50IElQOiBbcmVxdWVzdHMsIHdpbmRvdyBzZWNvbmRzXSAqL1xuZXhwb3J0IGNvbnN0IExJTUlUUyA9IHsgd3JpdGU6IFsyMCwgMzYwMF0sIHNlYXJjaDogWzYwLCA2MF0sIGxvb2t1cDogWzI0MCwgNjBdIH0gYXMgY29uc3Q7XG5jb25zdCBNQVhfQk9EWSA9IDQwOTY7XG5cbmludGVyZmFjZSBVc2VyUm93IHsgaGFuZGxlOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB8IG51bGw7IHNlcnZlcjogc3RyaW5nOyBwdWJsaWNfa2V5OiBzdHJpbmc7IGxpc3RlZDogbnVtYmVyOyBjcmVhdGVkX2F0OiBzdHJpbmc7IHVwZGF0ZWRfYXQ6IHN0cmluZyB9XG5cbmNvbnN0IGpzb24gPSAoZGF0YTogdW5rbm93biwgc3RhdHVzID0gMjAwLCBleHRyYTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9KSA9PlxuICBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoZGF0YSksIHsgc3RhdHVzLCBoZWFkZXJzOiB7IFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLCBcImFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpblwiOiBcIipcIiwgLi4uZXh0cmEgfSB9KTtcbmNvbnN0IGVyciA9IChzdGF0dXM6IG51bWJlciwgZXJyb3I6IHN0cmluZykgPT4ganNvbih7IGVycm9yIH0sIHN0YXR1cyk7XG5cbmFzeW5jIGZ1bmN0aW9uIGxpbWl0ZWQoZGI6IEQxRGF0YWJhc2UsIGlwOiBzdHJpbmcsIGtpbmQ6IGtleW9mIHR5cGVvZiBMSU1JVFMpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgY29uc3QgW21heCwgd2luXSA9IExJTUlUU1traW5kXTtcbiAgY29uc3Qgbm93ID0gTWF0aC5mbG9vcihEYXRlLm5vdygpIC8gMTAwMCk7XG4gIGNvbnN0IGtleSA9IGAke2tpbmR9OiR7aXB9YDtcbiAgY29uc3Qgcm93ID0gYXdhaXQgZGIucHJlcGFyZShcIlNFTEVDVCBjb3VudCwgcmVzZXQgRlJPTSByYXRlIFdIRVJFIGtleSA9ID9cIikuYmluZChrZXkpLmZpcnN0PHsgY291bnQ6IG51bWJlcjsgcmVzZXQ6IG51bWJlciB9PigpO1xuICBpZiAoIXJvdyB8fCByb3cucmVzZXQgPD0gbm93KSB7XG4gICAgYXdhaXQgZGIucHJlcGFyZShcIklOU0VSVCBJTlRPIHJhdGUgKGtleSwgY291bnQsIHJlc2V0KSBWQUxVRVMgKD8sIDEsID8pIE9OIENPTkZMSUNUKGtleSkgRE8gVVBEQVRFIFNFVCBjb3VudCA9IDEsIHJlc2V0ID0gZXhjbHVkZWQucmVzZXRcIikuYmluZChrZXksIG5vdyArIHdpbikucnVuKCk7XG4gICAgaWYgKE1hdGgucmFuZG9tKCkgPCAwLjAxKSBhd2FpdCBkYi5wcmVwYXJlKFwiREVMRVRFIEZST00gcmF0ZSBXSEVSRSByZXNldCA8PSA/XCIpLmJpbmQobm93KS5ydW4oKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHJvdy5jb3VudCA+PSBtYXgpIHJldHVybiB0cnVlO1xuICBhd2FpdCBkYi5wcmVwYXJlKFwiVVBEQVRFIHJhdGUgU0VUIGNvdW50ID0gY291bnQgKyAxIFdIRVJFIGtleSA9ID9cIikuYmluZChrZXkpLnJ1bigpO1xuICByZXR1cm4gZmFsc2U7XG59XG5cbmNvbnN0IGlzS2V5ID0gKGs6IHVua25vd24pOiBrIGlzIHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgayAhPT0gXCJzdHJpbmdcIiB8fCBrLmxlbmd0aCA+IDYwKSByZXR1cm4gZmFsc2U7XG4gIHRyeSB7IHJldHVybiB1bmI2NHVybChrKS5sZW5ndGggPT09IDMyOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG59O1xuXG5jb25zdCBvdXQgPSAodTogVXNlclJvdykgPT4gKHsgaGFuZGxlOiB1LmhhbmRsZSwgbmFtZTogdS5uYW1lLCBzZXJ2ZXI6IHUuc2VydmVyLCBwdWJsaWNLZXk6IHUucHVibGljX2tleSwgdXBkYXRlZEF0OiB1LnVwZGF0ZWRfYXQgfSk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBoYW5kbGVEaXJlY3RvcnkocmVxOiBSZXF1ZXN0LCBlbnY6IERpckVudik6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgY29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsKTtcbiAgY29uc3QgcGF0aCA9IHVybC5wYXRobmFtZTtcbiAgY29uc3QgZGIgPSBlbnYuREI7XG4gIGNvbnN0IGh0dHAgPSBlbnYuU09DSUFMX0FMTE9XX0hUVFAgPT09IFwiMVwiIHx8IGVudi5TT0NJQUxfQUxMT1dfSFRUUCA9PT0gXCJ0cnVlXCI7XG4gIGNvbnN0IHNlbGYgPSAoZW52LkRJUkVDVE9SWV9PUklHSU4gJiYgbm9ybU9yaWdpbihlbnYuRElSRUNUT1JZX09SSUdJTiwgdHJ1ZSkpIHx8IHVybC5vcmlnaW47XG4gIGNvbnN0IGlwID0gcmVxLmhlYWRlcnMuZ2V0KFwiY2YtY29ubmVjdGluZy1pcFwiKSA/PyBcInVua25vd25cIjtcbiAgYXdhaXQgZW5zdXJlKGRiKTtcblxuICBpZiAocmVxLm1ldGhvZCA9PT0gXCJPUFRJT05TXCIpIHJldHVybiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDIwNCwgaGVhZGVyczogeyBcImFjY2Vzcy1jb250cm9sLWFsbG93LW9yaWdpblwiOiBcIipcIiwgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1tZXRob2RzXCI6IFwiR0VUXCIsIFwiYWNjZXNzLWNvbnRyb2wtbWF4LWFnZVwiOiBcIjg2NDAwXCIgfSB9KTtcbiAgaWYgKHBhdGggPT09IFwiL1wiICYmIHJlcS5tZXRob2QgPT09IFwiR0VUXCIpIHJldHVybiBqc29uKHsgc29mdHdhcmU6IFwiaXJvbnRlcm0tZGlyZWN0b3J5XCIsIHY6IDEsIHN0b3JlczogW1wiaGFuZGxlXCIsIFwibmFtZVwiLCBcInNlcnZlclwiLCBcInB1YmxpY0tleVwiLCBcImxpc3RlZFwiLCBcInRpbWVzdGFtcHNcIl0gfSk7XG5cbiAgaWYgKHBhdGggPT09IFwiL3YxL3JlZ2lzdGVyXCIgJiYgcmVxLm1ldGhvZCA9PT0gXCJQT1NUXCIpIHtcbiAgICBpZiAoYXdhaXQgbGltaXRlZChkYiwgaXAsIFwid3JpdGVcIikpIHJldHVybiBlcnIoNDI5LCBcInRvbyBtYW55IHJlcXVlc3RzXCIpO1xuICAgIGlmIChOdW1iZXIocmVxLmhlYWRlcnMuZ2V0KFwiY29udGVudC1sZW5ndGhcIikgPz8gMCkgPiBNQVhfQk9EWSkgcmV0dXJuIGVycig0MDAsIFwiYm9keSB0b28gbGFyZ2VcIik7XG4gICAgY29uc3QgcmF3ID0gYXdhaXQgcmVxLnRleHQoKTtcbiAgICBpZiAocmF3Lmxlbmd0aCA+IE1BWF9CT0RZKSByZXR1cm4gZXJyKDQwMCwgXCJib2R5IHRvbyBsYXJnZVwiKTtcbiAgICBjb25zdCBwcmUgPSBwcmVjaGVjayhyZXEsIHNlbGYsIGh0dHApO1xuICAgIGlmICghcHJlLm9rKSByZXR1cm4gZXJyKHByZS5zdGF0dXMsIHByZS5lcnJvcik7XG4gICAgbGV0IGI6IHsgaGFuZGxlPzogdW5rbm93bjsgbmFtZT86IHVua25vd247IHNlcnZlcj86IHVua25vd247IHB1YmxpY0tleT86IHVua25vd247IGxpc3RlZD86IHVua25vd24gfTtcbiAgICB0cnkgeyBiID0gSlNPTi5wYXJzZShyYXcpOyB9IGNhdGNoIHsgcmV0dXJuIGVycig0MDAsIFwibWFsZm9ybWVkIGJvZHlcIik7IH1cbiAgICBjb25zdCBoYW5kbGUgPSB0eXBlb2YgYi5oYW5kbGUgPT09IFwic3RyaW5nXCIgPyBiLmhhbmRsZSA6IFwiXCI7XG4gICAgaWYgKCFIQU5ETEVfUkUudGVzdChoYW5kbGUpKSByZXR1cm4gZXJyKDQwMCwgXCJoYW5kbGUgbXVzdCBtYXRjaCBeW2EtejAtOV1bYS16MC05Xy1dezEsMjl9JFwiKTtcbiAgICBpZiAoYi5uYW1lICE9IG51bGwgJiYgKHR5cGVvZiBiLm5hbWUgIT09IFwic3RyaW5nXCIgfHwgYi5uYW1lLmxlbmd0aCA+IDYwKSkgcmV0dXJuIGVycig0MDAsIFwibmFtZTogdXAgdG8gNjAgY2hhcmFjdGVyc1wiKTtcbiAgICBpZiAoIWlzS2V5KGIucHVibGljS2V5KSkgcmV0dXJuIGVycig0MDAsIFwicHVibGljS2V5OiBiYXNlNjR1cmwgcmF3IDMyLWJ5dGUgRWQyNTUxOSBrZXlcIik7XG4gICAgY29uc3Qgc2VydmVyID0gbm9ybU9yaWdpbih0eXBlb2YgYi5zZXJ2ZXIgPT09IFwic3RyaW5nXCIgPyBiLnNlcnZlciA6IFwiXCIsIGh0dHApO1xuICAgIGlmICghc2VydmVyIHx8IHNlcnZlciAhPT0gYi5zZXJ2ZXIpIHJldHVybiBlcnIoNDAwLCBodHRwID8gXCJzZXJ2ZXIgbXVzdCBiZSBhbiBvcmlnaW5cIiA6IFwic2VydmVyIG11c3QgYmUgYW4gaHR0cHMgb3JpZ2luXCIpO1xuICAgIGlmIChzZXJ2ZXIgIT09IHByZS5zZXJ2ZXIpIHJldHVybiBlcnIoNDAxLCBcInNpZ25hdHVyZSBpcyBmcm9tIGFub3RoZXIgc2VydmVyXCIpO1xuICAgIGlmICghKGF3YWl0IHZlcmlmeVJlcXVlc3QocmVxLCByYXcsIHNlbGYsIGIucHVibGljS2V5LCBwcmUucGFyc2VkKSkpIHJldHVybiBlcnIoNDAxLCBcImJhZCBzaWduYXR1cmVcIik7XG4gICAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCBkYi5wcmVwYXJlKFwiU0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSBoYW5kbGUgPSA/XCIpLmJpbmQoaGFuZGxlKS5maXJzdDxVc2VyUm93PigpO1xuICAgIGlmIChleGlzdGluZyAmJiBleGlzdGluZy5wdWJsaWNfa2V5ICE9PSBiLnB1YmxpY0tleSkgcmV0dXJuIGVycig0MDksIFwiaGFuZGxlIHRha2VuXCIpO1xuICAgIC8vIFByb3ZlIHRoZSBzZXJ2ZXIgY29udHJvbHMgaXRzIG9yaWdpbjogaXQgbXVzdCBzZXJ2ZSB0aGUgc2FtZSBrZXkuXG4gICAgbGV0IHdrO1xuICAgIHRyeSB7IHdrID0gYXdhaXQgZmV0Y2hXZWxsS25vd24oc2VydmVyKTsgfSBjYXRjaCAoZSkgeyByZXR1cm4gZXJyKDQwMCwgYGNvdWxkbid0IHZlcmlmeSAke3NlcnZlcn06ICR7KGUgYXMgRXJyb3IpLm1lc3NhZ2V9YCk7IH1cbiAgICBpZiAod2sucHVibGljS2V5ICE9PSBiLnB1YmxpY0tleSkgcmV0dXJuIGVycig0MDMsIFwidGhlIHNlcnZlcidzIC53ZWxsLWtub3duL2lyb250ZXJtIHNlcnZlcyBhIGRpZmZlcmVudCBrZXlcIik7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuICAgIGNvbnN0IG5hbWUgPSB0eXBlb2YgYi5uYW1lID09PSBcInN0cmluZ1wiID8gYi5uYW1lLnRyaW0oKSB8fCBudWxsIDogbnVsbDtcbiAgICBhd2FpdCBkYi5iYXRjaChbXG4gICAgICAvLyBvbmUgaGFuZGxlIHBlciBrZXk6IHJlZ2lzdGVyaW5nIGEgbmV3IGhhbmRsZSByZWxlYXNlcyB0aGUgb2xkIG9uZVxuICAgICAgZGIucHJlcGFyZShcIkRFTEVURSBGUk9NIHVzZXJzIFdIRVJFIHB1YmxpY19rZXkgPSA/IEFORCBoYW5kbGUgIT0gP1wiKS5iaW5kKGIucHVibGljS2V5LCBoYW5kbGUpLFxuICAgICAgZGIucHJlcGFyZShcIklOU0VSVCBJTlRPIHVzZXJzIChoYW5kbGUsIG5hbWUsIHNlcnZlciwgcHVibGljX2tleSwgbGlzdGVkLCBjcmVhdGVkX2F0LCB1cGRhdGVkX2F0KSBWQUxVRVMgKD8sID8sID8sID8sID8sID8sID8pIE9OIENPTkZMSUNUKGhhbmRsZSkgRE8gVVBEQVRFIFNFVCBuYW1lID0gZXhjbHVkZWQubmFtZSwgc2VydmVyID0gZXhjbHVkZWQuc2VydmVyLCBsaXN0ZWQgPSBleGNsdWRlZC5saXN0ZWQsIHVwZGF0ZWRfYXQgPSBleGNsdWRlZC51cGRhdGVkX2F0XCIpXG4gICAgICAgIC5iaW5kKGhhbmRsZSwgbmFtZSwgc2VydmVyLCBiLnB1YmxpY0tleSwgYi5saXN0ZWQgPyAxIDogMCwgbm93LCBub3cpLFxuICAgIF0pO1xuICAgIHJldHVybiBqc29uKHsgb2s6IHRydWUsIGhhbmRsZSB9KTtcbiAgfVxuXG4gIGNvbnN0IHVtID0gcGF0aC5tYXRjaCgvXlxcL3YxXFwvdXNlcnNcXC8oW14vXSspJC8pO1xuICBpZiAodW0pIHtcbiAgICBjb25zdCBoYW5kbGUgPSBkZWNvZGVVUklDb21wb25lbnQodW1bMV0pLnRvTG93ZXJDYXNlKCk7XG4gICAgaWYgKHJlcS5tZXRob2QgPT09IFwiR0VUXCIpIHtcbiAgICAgIGlmIChhd2FpdCBsaW1pdGVkKGRiLCBpcCwgXCJsb29rdXBcIikpIHJldHVybiBlcnIoNDI5LCBcInRvbyBtYW55IHJlcXVlc3RzXCIpO1xuICAgICAgaWYgKCFIQU5ETEVfUkUudGVzdChoYW5kbGUpKSByZXR1cm4gZXJyKDQwNCwgXCJub3QgZm91bmRcIik7XG4gICAgICBjb25zdCB1ID0gYXdhaXQgZGIucHJlcGFyZShcIlNFTEVDVCAqIEZST00gdXNlcnMgV0hFUkUgaGFuZGxlID0gP1wiKS5iaW5kKGhhbmRsZSkuZmlyc3Q8VXNlclJvdz4oKTtcbiAgICAgIHJldHVybiB1ID8ganNvbihvdXQodSkpIDogZXJyKDQwNCwgXCJub3QgZm91bmRcIik7XG4gICAgfVxuICAgIGlmIChyZXEubWV0aG9kID09PSBcIkRFTEVURVwiKSB7XG4gICAgICBpZiAoYXdhaXQgbGltaXRlZChkYiwgaXAsIFwid3JpdGVcIikpIHJldHVybiBlcnIoNDI5LCBcInRvbyBtYW55IHJlcXVlc3RzXCIpO1xuICAgICAgY29uc3QgcHJlID0gcHJlY2hlY2socmVxLCBzZWxmLCBodHRwKTtcbiAgICAgIGlmICghcHJlLm9rKSByZXR1cm4gZXJyKHByZS5zdGF0dXMsIHByZS5lcnJvcik7XG4gICAgICBjb25zdCB1ID0gYXdhaXQgZGIucHJlcGFyZShcIlNFTEVDVCAqIEZST00gdXNlcnMgV0hFUkUgaGFuZGxlID0gP1wiKS5iaW5kKGhhbmRsZSkuZmlyc3Q8VXNlclJvdz4oKTtcbiAgICAgIGlmICghdSkgcmV0dXJuIGVycig0MDQsIFwibm90IGZvdW5kXCIpO1xuICAgICAgaWYgKCEoYXdhaXQgdmVyaWZ5UmVxdWVzdChyZXEsIFwiXCIsIHNlbGYsIHUucHVibGljX2tleSwgcHJlLnBhcnNlZCkpKSByZXR1cm4gZXJyKDQwMSwgXCJiYWQgc2lnbmF0dXJlXCIpO1xuICAgICAgYXdhaXQgZGIucHJlcGFyZShcIkRFTEVURSBGUk9NIHVzZXJzIFdIRVJFIGhhbmRsZSA9ID9cIikuYmluZChoYW5kbGUpLnJ1bigpO1xuICAgICAgcmV0dXJuIGpzb24oeyBvazogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cblxuICBpZiAocGF0aCA9PT0gXCIvdjEvc2VhcmNoXCIgJiYgcmVxLm1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgIGlmIChhd2FpdCBsaW1pdGVkKGRiLCBpcCwgXCJzZWFyY2hcIikpIHJldHVybiBlcnIoNDI5LCBcInRvbyBtYW55IHJlcXVlc3RzXCIpO1xuICAgIGNvbnN0IHEgPSAodXJsLnNlYXJjaFBhcmFtcy5nZXQoXCJxXCIpID8/IFwiXCIpLnRyaW0oKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL15ALywgXCJcIik7XG4gICAgaWYgKHEubGVuZ3RoIDwgMikgcmV0dXJuIGVycig0MDAsIFwicTogYXQgbGVhc3QgMiBjaGFyYWN0ZXJzXCIpO1xuICAgIGlmIChxLmxlbmd0aCA+IDYwKSByZXR1cm4ganNvbih7IHVzZXJzOiBbXSB9KTtcbiAgICBjb25zdCBsaWtlID0gcS5yZXBsYWNlKC9bXFxcXCVfXS9nLCAoYykgPT4gYFxcXFwke2N9YCkgKyBcIiVcIjtcbiAgICBjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IGRiLnByZXBhcmUoXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGxpc3RlZCA9IDEgQU5EIChoYW5kbGUgTElLRSA/IEVTQ0FQRSAnXFxcXCcgT1IgbG93ZXIobmFtZSkgTElLRSA/IEVTQ0FQRSAnXFxcXCcpIE9SREVSIEJZIGhhbmRsZSBMSU1JVCAyMFwiKS5iaW5kKGxpa2UsIGxpa2UpLmFsbDxVc2VyUm93PigpO1xuICAgIHJldHVybiBqc29uKHsgdXNlcnM6IHJlc3VsdHMubWFwKCh1KSA9PiAoeyBoYW5kbGU6IHUuaGFuZGxlLCBuYW1lOiB1Lm5hbWUsIHNlcnZlcjogdS5zZXJ2ZXIgfSkpIH0pO1xuICB9XG5cbiAgcmV0dXJuIGVycig0MDQsIFwibm90IGZvdW5kXCIpO1xufVxuXG5leHBvcnQgZGVmYXVsdCB7XG4gIGFzeW5jIGZldGNoKHJlcSwgZW52KSB7XG4gICAgdHJ5IHsgcmV0dXJuIGF3YWl0IGhhbmRsZURpcmVjdG9yeShyZXEsIGVudik7IH1cbiAgICBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKGUpOyByZXR1cm4gZXJyKDUwMCwgXCJpbnRlcm5hbCBlcnJvclwiKTsgfVxuICB9LFxufSBzYXRpc2ZpZXMgRXhwb3J0ZWRIYW5kbGVyPERpckVudj47XG4iLCAiaW1wb3J0IHsgYWZ0ZXJBbGwsIGJlZm9yZUFsbCwgZGVzY3JpYmUsIGV4cGVjdCwgaXQsIHZpIH0gZnJvbSBcInZpdGVzdFwiO1xuaW1wb3J0IHsgTm9kZUQxIH0gZnJvbSBcIi4uL3NlcnZlci9kMVwiO1xuaW1wb3J0IHsgZ2VuZXJhdGVLZXlQYWlyLCBpbXBvcnRQcml2YXRlLCBTSUdfSEVBREVSLCBzaWduUmVxdWVzdCB9IGZyb20gXCIuLi93b3JrZXIvc29jaWFsL3NpZ25cIjtcbmltcG9ydCBkaXJlY3RvcnksIHsgTElNSVRTIH0gZnJvbSBcIi4vd29ya2VyXCI7XG5cbmNvbnN0IERJUiA9IFwiaHR0cHM6Ly9kaXIuZXhhbXBsZVwiO1xuY29uc3Qgc2VydmVycyA9IG5ldyBNYXA8c3RyaW5nLCB7IHB1YmxpY0tleTogc3RyaW5nOyBrZXk6IENyeXB0b0tleTsgc2VydmU/OiBzdHJpbmcgfT4oKTtcbmNvbnN0IHJlYWxGZXRjaCA9IGdsb2JhbFRoaXMuZmV0Y2g7XG5sZXQgZW52OiB7IERCOiBOb2RlRDE7IFNPQ0lBTF9BTExPV19IVFRQPzogc3RyaW5nIH07XG5cbmFzeW5jIGZ1bmN0aW9uIHNlcnZlcihvcmlnaW46IHN0cmluZykge1xuICBjb25zdCBrcCA9IGF3YWl0IGdlbmVyYXRlS2V5UGFpcigpO1xuICBjb25zdCBzID0geyBwdWJsaWNLZXk6IGtwLnB1YmxpY0tleSwga2V5OiBhd2FpdCBpbXBvcnRQcml2YXRlKGtwLnByaXZhdGVKd2spIH07XG4gIHNlcnZlcnMuc2V0KG9yaWdpbiwgcyk7XG4gIHJldHVybiBzO1xufVxuXG5iZWZvcmVBbGwoKCkgPT4ge1xuICB2aS5zdHViR2xvYmFsKFwiZmV0Y2hcIiwgYXN5bmMgKGlucHV0OiBSZXF1ZXN0SW5mbyB8IFVSTCwgaW5pdD86IFJlcXVlc3RJbml0KSA9PiB7XG4gICAgY29uc3QgdSA9IG5ldyBVUkwobmV3IFJlcXVlc3QoaW5wdXQgYXMgUmVxdWVzdEluZm8sIGluaXQpLnVybCk7XG4gICAgY29uc3QgcyA9IHNlcnZlcnMuZ2V0KHUub3JpZ2luKTtcbiAgICBpZiAoIXMgfHwgdS5wYXRobmFtZSAhPT0gXCIvLndlbGwta25vd24vaXJvbnRlcm1cIikgdGhyb3cgbmV3IFR5cGVFcnJvcihcImZldGNoIGZhaWxlZFwiKTtcbiAgICByZXR1cm4gUmVzcG9uc2UuanNvbih7IHY6IDEsIHNlcnZlcjogdS5vcmlnaW4sIGhhbmRsZTogbnVsbCwgbmFtZTogbnVsbCwgcHVibGljS2V5OiBzLnNlcnZlID8/IHMucHVibGljS2V5LCBkaXJlY3Rvcnk6IG51bGwsIHNvZnR3YXJlOiBcImlyb250ZXJtXCIgfSk7XG4gIH0pO1xufSk7XG5hZnRlckFsbCgoKSA9PiB7IHZpLnN0dWJHbG9iYWwoXCJmZXRjaFwiLCByZWFsRmV0Y2gpOyB2aS51bnN0dWJBbGxHbG9iYWxzKCk7IH0pO1xuXG5sZXQgaXBOID0gMDtcbmFzeW5jIGZ1bmN0aW9uIHJlcShtZXRob2Q6IHN0cmluZywgcGF0aDogc3RyaW5nLCBvcHRzOiB7IGJvZHk/OiB1bmtub3duOyBhcz86IHN0cmluZzsgc2lnbmVyPzogc3RyaW5nOyBpcD86IHN0cmluZzsgbm93PzogbnVtYmVyIH0gPSB7fSkge1xuICBjb25zdCB1cmwgPSBgJHtESVJ9JHtwYXRofWA7XG4gIGNvbnN0IHRleHQgPSBvcHRzLmJvZHkgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IEpTT04uc3RyaW5naWZ5KG9wdHMuYm9keSk7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IFwiY2YtY29ubmVjdGluZy1pcFwiOiBvcHRzLmlwID8/IGAxMC4wLjAuJHsrK2lwTiAlIDI1MH1gIH07XG4gIGlmIChvcHRzLmFzKSB7XG4gICAgY29uc3QgcyA9IHNlcnZlcnMuZ2V0KG9wdHMuc2lnbmVyID8/IG9wdHMuYXMpITtcbiAgICBoZWFkZXJzW1NJR19IRUFERVJdID0gYXdhaXQgc2lnblJlcXVlc3QoeyBrZXk6IHMua2V5LCBzZXJ2ZXI6IG9wdHMuYXMsIG1ldGhvZCwgdXJsLCBib2R5OiB0ZXh0ID8/IFwiXCIsIG5vdzogb3B0cy5ub3cgfSk7XG4gIH1cbiAgY29uc3QgciA9IGF3YWl0IGRpcmVjdG9yeS5mZXRjaChuZXcgUmVxdWVzdCh1cmwsIHsgbWV0aG9kLCBoZWFkZXJzLCBib2R5OiB0ZXh0IH0pIGFzIG5ldmVyLCBlbnYgYXMgbmV2ZXIpO1xuICByZXR1cm4geyBzdGF0dXM6IHIuc3RhdHVzLCBkYXRhOiAoYXdhaXQgci5qc29uKCkpIGFzIGFueSB9O1xufVxuY29uc3QgcmVnID0gKG9yaWdpbjogc3RyaW5nLCBoYW5kbGU6IHN0cmluZywgZXh0cmE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pID0+XG4gIHJlcShcIlBPU1RcIiwgXCIvdjEvcmVnaXN0ZXJcIiwgeyBhczogb3JpZ2luLCBib2R5OiB7IGhhbmRsZSwgbmFtZTogaGFuZGxlLnRvVXBwZXJDYXNlKCksIHNlcnZlcjogb3JpZ2luLCBwdWJsaWNLZXk6IHNlcnZlcnMuZ2V0KG9yaWdpbikhLnB1YmxpY0tleSwgbGlzdGVkOiB0cnVlLCAuLi5leHRyYSB9IH0pO1xuXG5kZXNjcmliZShcImRpcmVjdG9yeSAoXHUwMEE3MylcIiwgKCkgPT4ge1xuICBiZWZvcmVBbGwoYXN5bmMgKCkgPT4ge1xuICAgIGVudiA9IHsgREI6IG5ldyBOb2RlRDEoXCI6bWVtb3J5OlwiKSB9O1xuICAgIGZvciAoY29uc3QgbyBvZiBbXCJodHRwczovL2EuZXhhbXBsZVwiLCBcImh0dHBzOi8vYi5leGFtcGxlXCIsIFwiaHR0cHM6Ly9jLmV4YW1wbGVcIiwgXCJodHRwOi8vaC5leGFtcGxlXCJdKSBhd2FpdCBzZXJ2ZXIobyk7XG4gIH0pO1xuXG4gIGl0KFwicmVnaXN0ZXJzIGEgc2lnbmVkLCB2ZXJpZmllZCBoYW5kbGUgYW5kIHNlcnZlcyBpdFwiLCBhc3luYyAoKSA9PiB7XG4gICAgZXhwZWN0KChhd2FpdCByZWcoXCJodHRwczovL2EuZXhhbXBsZVwiLCBcInNhbVwiKSkuZGF0YSkudG9FcXVhbCh7IG9rOiB0cnVlLCBoYW5kbGU6IFwic2FtXCIgfSk7XG4gICAgY29uc3QgdSA9IChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvdXNlcnMvc2FtXCIpKS5kYXRhO1xuICAgIGV4cGVjdCh1KS50b01hdGNoT2JqZWN0KHsgaGFuZGxlOiBcInNhbVwiLCBuYW1lOiBcIlNBTVwiLCBzZXJ2ZXI6IFwiaHR0cHM6Ly9hLmV4YW1wbGVcIiwgcHVibGljS2V5OiBzZXJ2ZXJzLmdldChcImh0dHBzOi8vYS5leGFtcGxlXCIpIS5wdWJsaWNLZXkgfSk7XG4gICAgZXhwZWN0KHUudXBkYXRlZEF0KS50b0JlVHJ1dGh5KCk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvdXNlcnMvU0FNXCIpKS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS91c2Vycy9ub2JvZHlcIikpLnN0YXR1cykudG9CZSg0MDQpO1xuICB9KTtcblxuICBpdChcImVuZm9yY2VzIHRoZSBoYW5kbGUgcnVsZXNcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGZvciAoY29uc3QgaCBvZiBbXCJhXCIsIFwiLXNhbVwiLCBcIlNhbVwiLCBcInNhbSFcIiwgXCJ4XCIucmVwZWF0KDMxKSwgXCJfeFwiXSkgZXhwZWN0KChhd2FpdCByZWcoXCJodHRwczovL2IuZXhhbXBsZVwiLCBoKSkuc3RhdHVzKS50b0JlKDQwMCk7XG4gICAgZXhwZWN0KChhd2FpdCByZWcoXCJodHRwczovL2IuZXhhbXBsZVwiLCBcIm9rX2hhbmRsZS0yXCIpKS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgfSk7XG5cbiAgaXQoXCJyZWZ1c2VzIHVuc2lnbmVkLCBtaXMtc2lnbmVkLCBzdGFsZSBhbmQgbWlzbWF0Y2hlZCByZWdpc3RyYXRpb25zXCIsIGFzeW5jICgpID0+IHtcbiAgICBjb25zdCBib2R5ID0geyBoYW5kbGU6IFwiYmVlXCIsIG5hbWU6IFwiQlwiLCBzZXJ2ZXI6IFwiaHR0cHM6Ly9iLmV4YW1wbGVcIiwgcHVibGljS2V5OiBzZXJ2ZXJzLmdldChcImh0dHBzOi8vYi5leGFtcGxlXCIpIS5wdWJsaWNLZXksIGxpc3RlZDogdHJ1ZSB9O1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiUE9TVFwiLCBcIi92MS9yZWdpc3RlclwiLCB7IGJvZHkgfSkpLnN0YXR1cykudG9CZSg0MDEpO1xuICAgIC8vIHNpZ25lZCBieSBhbm90aGVyIGtleSB0aGFuIHRoZSBvbmUgaW4gdGhlIGJvZHlcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIlBPU1RcIiwgXCIvdjEvcmVnaXN0ZXJcIiwgeyBib2R5LCBhczogXCJodHRwczovL2IuZXhhbXBsZVwiLCBzaWduZXI6IFwiaHR0cHM6Ly9jLmV4YW1wbGVcIiB9KSkuc3RhdHVzKS50b0JlKDQwMSk7XG4gICAgLy8gc2lnbmVkIGFzIG9uZSBzZXJ2ZXIsIHJlZ2lzdGVyaW5nIGFub3RoZXJcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIlBPU1RcIiwgXCIvdjEvcmVnaXN0ZXJcIiwgeyBib2R5OiB7IC4uLmJvZHksIHNlcnZlcjogXCJodHRwczovL2MuZXhhbXBsZVwiIH0sIGFzOiBcImh0dHBzOi8vYi5leGFtcGxlXCIgfSkpLnN0YXR1cykudG9CZSg0MDEpO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiUE9TVFwiLCBcIi92MS9yZWdpc3RlclwiLCB7IGJvZHksIGFzOiBcImh0dHBzOi8vYi5leGFtcGxlXCIsIG5vdzogRGF0ZS5ub3coKSAtIDQwMF8wMDAgfSkpLnN0YXR1cykudG9CZSg0MDEpO1xuICAgIC8vIHRoZSBzZXJ2ZXIncyAud2VsbC1rbm93biBzZXJ2ZXMgYW5vdGhlciBrZXk6IG5vIHByb29mIGl0IGNvbnRyb2xzIHRoZSBvcmlnaW5cbiAgICBzZXJ2ZXJzLmdldChcImh0dHBzOi8vYi5leGFtcGxlXCIpIS5zZXJ2ZSA9IHNlcnZlcnMuZ2V0KFwiaHR0cHM6Ly9jLmV4YW1wbGVcIikhLnB1YmxpY0tleTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIlBPU1RcIiwgXCIvdjEvcmVnaXN0ZXJcIiwgeyBib2R5LCBhczogXCJodHRwczovL2IuZXhhbXBsZVwiIH0pKS5zdGF0dXMpLnRvQmUoNDAzKTtcbiAgICBkZWxldGUgc2VydmVycy5nZXQoXCJodHRwczovL2IuZXhhbXBsZVwiKSEuc2VydmU7XG4gIH0pO1xuXG4gIGl0KFwicmVmdXNlcyBhIHRha2VvdmVyIGJ5IGFub3RoZXIga2V5OyB0aGUgb3duZXIgY2FuIHVwZGF0ZSBhbmQgcmVuYW1lXCIsIGFzeW5jICgpID0+IHtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYy5leGFtcGxlXCIsIFwic2FtXCIpKS5zdGF0dXMpLnRvQmUoNDA5KTtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYS5leGFtcGxlXCIsIFwic2FtXCIsIHsgbmFtZTogXCJTYW11ZWxcIiwgbGlzdGVkOiBmYWxzZSB9KSkuc3RhdHVzKS50b0JlKDIwMCk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvdXNlcnMvc2FtXCIpKS5kYXRhLm5hbWUpLnRvQmUoXCJTYW11ZWxcIik7XG4gICAgLy8gb25lIGhhbmRsZSBwZXIga2V5OiBhIG5ldyBoYW5kbGUgcmVsZWFzZXMgdGhlIG9sZCBvbmVcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYS5leGFtcGxlXCIsIFwic2FtbXlcIikpLnN0YXR1cykudG9CZSgyMDApO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiR0VUXCIsIFwiL3YxL3VzZXJzL3NhbVwiKSkuc3RhdHVzKS50b0JlKDQwNCk7XG4gICAgZXhwZWN0KChhd2FpdCByZWcoXCJodHRwczovL2MuZXhhbXBsZVwiLCBcInNhbVwiKSkuc3RhdHVzKS50b0JlKDIwMCk7XG4gIH0pO1xuXG4gIGl0KFwiaHR0cCBzZXJ2ZXJzIG9ubHkgd2l0aCBTT0NJQUxfQUxMT1dfSFRUUFwiLCBhc3luYyAoKSA9PiB7XG4gICAgZXhwZWN0KChhd2FpdCByZWcoXCJodHRwOi8vaC5leGFtcGxlXCIsIFwiaGhoXCIpKS5zdGF0dXMpLnRvQmUoNDAxKTtcbiAgICBlbnYuU09DSUFMX0FMTE9XX0hUVFAgPSBcIjFcIjtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHA6Ly9oLmV4YW1wbGVcIiwgXCJoaGhcIikpLnN0YXR1cykudG9CZSgyMDApO1xuICAgIGRlbGV0ZSBlbnYuU09DSUFMX0FMTE9XX0hUVFA7XG4gIH0pO1xuXG4gIGl0KFwic2VhcmNoZXMgbGlzdGVkIHVzZXJzIGJ5IGhhbmRsZSBvciBuYW1lIHByZWZpeFwiLCBhc3luYyAoKSA9PiB7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvc2VhcmNoP3E9ZFwiKSkuc3RhdHVzKS50b0JlKDQwMCk7XG4gICAgY29uc3QgciA9IChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvc2VhcmNoP3E9U0FcIikpLmRhdGE7XG4gICAgZXhwZWN0KHIudXNlcnMubWFwKCh1OiB7IGhhbmRsZTogc3RyaW5nIH0pID0+IHUuaGFuZGxlKSkudG9FcXVhbChbXCJzYW1cIiwgXCJzYW1teVwiXSk7XG4gICAgZXhwZWN0KE9iamVjdC5rZXlzKHIudXNlcnNbMF0pLnNvcnQoKSkudG9FcXVhbChbXCJoYW5kbGVcIiwgXCJuYW1lXCIsIFwic2VydmVyXCJdKTtcbiAgICBhd2FpdCByZWcoXCJodHRwczovL2EuZXhhbXBsZVwiLCBcInNhbW15XCIsIHsgbGlzdGVkOiBmYWxzZSB9KTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS9zZWFyY2g/cT1zYVwiKSkuZGF0YS51c2Vycy5tYXAoKHU6IHsgaGFuZGxlOiBzdHJpbmcgfSkgPT4gdS5oYW5kbGUpKS50b0VxdWFsKFtcInNhbVwiXSk7XG4gICAgLy8gd2lsZGNhcmRzIGFyZSBsaXRlcmFsXG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvc2VhcmNoP3E9JTI1JTI1XCIpKS5kYXRhLnVzZXJzKS50b0VxdWFsKFtdKTtcbiAgfSk7XG5cbiAgaXQoXCJkZWxldGVzIG9ubHkgd2l0aCB0aGUgc2FtZSBrZXlcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiREVMRVRFXCIsIFwiL3YxL3VzZXJzL3NhbW15XCIsIHsgYXM6IFwiaHR0cHM6Ly9jLmV4YW1wbGVcIiB9KSkuc3RhdHVzKS50b0JlKDQwMSk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJERUxFVEVcIiwgXCIvdjEvdXNlcnMvc2FtbXlcIikpLnN0YXR1cykudG9CZSg0MDEpO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiREVMRVRFXCIsIFwiL3YxL3VzZXJzL3NhbW15XCIsIHsgYXM6IFwiaHR0cHM6Ly9hLmV4YW1wbGVcIiB9KSkuc3RhdHVzKS50b0JlKDIwMCk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvdXNlcnMvc2FtbXlcIikpLnN0YXR1cykudG9CZSg0MDQpO1xuICB9KTtcblxuICBpdChcInJhdGUtbGltaXRzIHBlciBjbGllbnRcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IFttYXhdID0gTElNSVRTLnNlYXJjaDtcbiAgICBsZXQgbGFzdCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPD0gbWF4OyBpKyspIGxhc3QgPSAoYXdhaXQgcmVxKFwiR0VUXCIsIFwiL3YxL3NlYXJjaD9xPXNhXCIsIHsgaXA6IFwiMTkyLjAuMi4xXCIgfSkpLnN0YXR1cztcbiAgICBleHBlY3QobGFzdCkudG9CZSg0MjkpO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiR0VUXCIsIFwiL3YxL3NlYXJjaD9xPXNhXCIsIHsgaXA6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QyxFQUFFLFFBQVEsQ0FBQyxLQUFLLENBQUM7QUFFakgsWUFBUSxNQUFNLElBQUksT0FBTyxxQkFBcUIsR0FBRyxLQUFLLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3pFLENBQUM7QUFFRCxFQUFBQSxJQUFHLGtDQUFrQyxZQUFZO0FBQy9DLFlBQVEsTUFBTSxJQUFJLFVBQVUsbUJBQW1CLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLEdBQUc7QUFDN0YsWUFBUSxNQUFNLElBQUksVUFBVSxpQkFBaUIsR0FBRyxNQUFNLEVBQUUsS0FBSyxHQUFHO0FBQ2hFLFlBQVEsTUFBTSxJQUFJLFVBQVUsbUJBQW1CLEVBQUUsSUFBSSxvQkFBb0IsQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLEdBQUc7QUFDN0YsWUFBUSxNQUFNLElBQUksT0FBTyxpQkFBaUIsR0FBRyxNQUFNLEVBQUUsS0FBSyxHQUFHO0FBQUEsRUFDL0QsQ0FBQztBQUVELEVBQUFBLElBQUcsMEJBQTBCLFlBQVk7QUFDdkMsVUFBTSxDQUFDLEdBQUcsSUFBSSxPQUFPO0FBQ3JCLFFBQUksT0FBTztBQUNYLGFBQVMsSUFBSSxHQUFHLEtBQUssS0FBSyxJQUFLLFNBQVEsTUFBTSxJQUFJLE9BQU8sbUJBQW1CLEVBQUUsSUFBSSxZQUFZLENBQUMsR0FBRztBQUNqRyxXQUFPLElBQUksRUFBRSxLQUFLLEdBQUc7QUFDckIsWUFBUSxNQUFNLElBQUksT0FBTyxtQkFBbUIsRUFBRSxJQUFJLFlBQVksQ0FBQyxHQUFHLE1BQU0sRUFBRSxLQUFLLEdBQUc7QUFBQSxFQUNwRixDQUFDO0FBQ0gsQ0FBQzsiLAogICJuYW1lcyI6IFsiZGVzY3JpYmUiLCAiZm4iLCAiaXQiLCAib3V0IiwgImZuIiwgImVyciIsICJvdXQiLCAib3V0IiwgIm91dCIsICJvdXQiLCAicmVxIiwgInNlcnZlciIsICJyZXEiLCAiZW52IiwgInNlcnZlciIsICJkZXNjcmliZSIsICJpdCJdCn0K
