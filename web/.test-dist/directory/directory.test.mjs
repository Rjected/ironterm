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
var MAX_RESPONSE = 1e6;
var MAX_SMALL = 64e3;
var peerFetchImpl = null;
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
    return await Promise.race([(peerFetchImpl ?? fetch)(url, { ...init, signal: ac.signal, redirect: "manual" }), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
async function readLimited(r, max = MAX_RESPONSE) {
  if (Number(r.headers.get("content-length") ?? 0) > max) {
    await r.body?.cancel().catch(() => {
    });
    throw new PeerError("response too large");
  }
  if (!r.body) return "";
  const reader = r.body.getReader();
  const chunks = [];
  let n = 0;
  for (; ; ) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel().catch(() => {
      });
      throw new PeerError("response too large");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}
async function peerJson(r, max = MAX_RESPONSE) {
  try {
    return JSON.parse(await readLimited(r, max));
  } catch {
    return null;
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
  const w = await peerJson(r, MAX_SMALL);
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
    let raw;
    try {
      raw = await readLimited(req2, MAX_BODY);
    } catch {
      return err(400, "body too large");
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vLi4vcGFja2FnZXMvdGVzdC9pbmRleC50cyIsICIuLi8uLi9zZXJ2ZXIvZDEudHMiLCAiLi4vLi4vd29ya2VyL3NvY2lhbC9zaWduLnRzIiwgIi4uLy4uL3dvcmtlci9zb2NpYWwvbmV0LnRzIiwgIi4uLy4uL3dvcmtlci9zb2NpYWwvdHlwZXMudHMiLCAiLi4vLi4vZGlyZWN0b3J5L3dvcmtlci50cyIsICIuLi8uLi9kaXJlY3RvcnkvZGlyZWN0b3J5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8vIEEgc21hbGwgdml0ZXN0LWNvbXBhdGlibGUgdGVzdCBBUEkgb24gdG9wIG9mIG5vZGU6dGVzdCBhbmQgbm9kZTphc3NlcnQsIHNvIHRoZSB0ZXN0cyBrZWVwXG4vLyBgaW1wb3J0IHsgZGVzY3JpYmUsIGV4cGVjdCwgaXQgfSBmcm9tIFwidml0ZXN0XCJgIChzY3JpcHRzL3Rlc3QubWpzIGFsaWFzZXMgXCJ2aXRlc3RcIiB0byB0aGlzIGZpbGUpXG4vLyB3aXRob3V0IHZpdGVzdCdzIDg4IHBhY2thZ2VzLiBPbmx5IHdoYXQgdGhlIHRlc3RzIHVzZSBpcyBoZXJlOyBhZGQgbWF0Y2hlcnMgYXMgbmVlZGVkLlxuaW1wb3J0IHsgQXNzZXJ0aW9uRXJyb3IgfSBmcm9tIFwibm9kZTphc3NlcnRcIjtcbmltcG9ydCB7IGV4aXN0c1N5bmMsIG1rZGlyU3luYywgcmVhZEZpbGVTeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSBcIm5vZGU6ZnNcIjtcbmltcG9ydCB7IGRpcm5hbWUsIGpvaW4sIHJlbGF0aXZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xuaW1wb3J0ICogYXMgbm9kZVRlc3QgZnJvbSBcIm5vZGU6dGVzdFwiO1xuaW1wb3J0IHsgaW5zcGVjdCwgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tIFwibm9kZTp1dGlsXCI7XG5cbnR5cGUgRm4gPSAoKSA9PiB1bmtub3duIHwgUHJvbWlzZTx1bmtub3duPjtcblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIHN1aXRlcyBhbmQgaG9va3MgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmNvbnN0IHN0YWNrOiBzdHJpbmdbXSA9IFtdO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmUobmFtZTogc3RyaW5nLCBmbjogKCkgPT4gdm9pZCkge1xuICBjb25zdCBwYXRoID0gWy4uLnN0YWNrLCBuYW1lXTtcbiAgcmV0dXJuIG5vZGVUZXN0LmRlc2NyaWJlKG5hbWUsICgpID0+IHsgY29uc3Qgc2F2ZWQgPSBzdGFjay5zcGxpY2UoMCk7IHN0YWNrLnB1c2goLi4ucGF0aCk7IHRyeSB7IGZuKCk7IH0gZmluYWxseSB7IHN0YWNrLnNwbGljZSgwKTsgc3RhY2sucHVzaCguLi5zYXZlZCk7IH0gfSk7XG59XG5cbnR5cGUgUnVubmVyID0gKG5hbWU6IHN0cmluZywgb3B0aW9uczogeyB0aW1lb3V0PzogbnVtYmVyIH0sIGZuPzogKCkgPT4gUHJvbWlzZTx2b2lkPikgPT4gdW5rbm93bjtcblxuLyoqXG4gKiBBIHRlc3Qgb3IgaG9vayB0aGF0IHJ1bnMgbG9uZ2VyIGZhaWxzIChcImh1bmdcIiwgbm90IFwic2xvd1wiKTogZ2VuZXJvdXMsIGJlY2F1c2UgdGhlIGVuZC10by1lbmRcbiAqIHRlc3RzIHJ1biBzZXZlcmFsIGluLXByb2Nlc3Mgc2VydmVycy4gQSB0ZXN0IGNhbiBwYXNzIGl0cyBvd24gYXMgdGhlIHRoaXJkIGFyZ3VtZW50LlxuICovXG5leHBvcnQgY29uc3QgVEVTVF9USU1FT1VUX01TID0gNjBfMDAwO1xuZXhwb3J0IGNvbnN0IEhPT0tfVElNRU9VVF9NUyA9IDEyMF8wMDA7XG5cbmZ1bmN0aW9uIHRlc3RXaXRoKHJ1bm5lcjogUnVubmVyKSB7XG4gIHJldHVybiAobmFtZTogc3RyaW5nLCBmbj86IEZuLCB0aW1lb3V0OiBudW1iZXIgfCB7IHRpbWVvdXQ/OiBudW1iZXIgfSA9IFRFU1RfVElNRU9VVF9NUyk6IHZvaWQgPT4ge1xuICAgIGNvbnN0IHBhdGggPSBbLi4uc3RhY2ssIG5hbWVdO1xuICAgIHJ1bm5lcihuYW1lLCB7IHRpbWVvdXQ6IHR5cGVvZiB0aW1lb3V0ID09PSBcIm51bWJlclwiID8gdGltZW91dCA6IHRpbWVvdXQudGltZW91dCA/PyBURVNUX1RJTUVPVVRfTVMgfSwgZm4gPyBhc3luYyAoKSA9PiB7XG4gICAgICBjdXJyZW50ID0geyBuYW1lOiBwYXRoLmpvaW4oXCIgPiBcIiksIGNvdW50czogbmV3IE1hcCgpIH07XG4gICAgICBhd2FpdCBmbigpO1xuICAgIH0gOiB1bmRlZmluZWQpO1xuICB9O1xufVxuXG50eXBlIEl0ID0gUmV0dXJuVHlwZTx0eXBlb2YgdGVzdFdpdGg+ICYge1xuICBza2lwOiBSZXR1cm5UeXBlPHR5cGVvZiB0ZXN0V2l0aD47XG4gIG9ubHk6IFJldHVyblR5cGU8dHlwZW9mIHRlc3RXaXRoPjtcbiAgdG9kbzogKG5hbWU6IHN0cmluZykgPT4gdm9pZDtcbiAgZWFjaDogPFQ+KGNhc2VzOiByZWFkb25seSBUW10pID0+IChuYW1lOiBzdHJpbmcsIGZuOiAoLi4uYXJnczogVCBleHRlbmRzIHJlYWRvbmx5IHVua25vd25bXSA/IFQgOiBbVF0pID0+IHVua25vd24pID0+IHZvaWQ7XG59O1xuXG5mdW5jdGlvbiBtYWtlSXQoKTogSXQge1xuICBjb25zdCBpdCA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0KSBhcyBJdDtcbiAgaXQuc2tpcCA9IHRlc3RXaXRoKG5vZGVUZXN0Lml0LnNraXApO1xuICBpdC5vbmx5ID0gdGVzdFdpdGgobm9kZVRlc3QuaXQub25seSk7XG4gIGl0LnRvZG8gPSAobmFtZTogc3RyaW5nKSA9PiB7IG5vZGVUZXN0Lml0LnRvZG8obmFtZSk7IH07XG4gIGl0LmVhY2ggPSA8VD4oY2FzZXM6IHJlYWRvbmx5IFRbXSkgPT4gKG5hbWU6IHN0cmluZywgZm46ICguLi5hcmdzOiBUIGV4dGVuZHMgcmVhZG9ubHkgdW5rbm93bltdID8gVCA6IFtUXSkgPT4gdW5rbm93bikgPT4ge1xuICAgIGNhc2VzLmZvckVhY2goKGMsIGkpID0+IHtcbiAgICAgIGNvbnN0IGFyZ3MgPSAoQXJyYXkuaXNBcnJheShjKSA/IGMgOiBbY10pIGFzIFQgZXh0ZW5kcyByZWFkb25seSB1bmtub3duW10gPyBUIDogW1RdO1xuICAgICAgaXQoZm9ybWF0RWFjaE5hbWUobmFtZSwgYXJncywgaSksICgpID0+IGZuKC4uLmFyZ3MpKTtcbiAgICB9KTtcbiAgfTtcbiAgcmV0dXJuIGl0O1xufVxuXG4vKiogYCVzICVkICVpICVmICVqICVvICUjYCBhbmQgYCRmaWVsZGAgcGxhY2Vob2xkZXJzLCBhcyBpbiB2aXRlc3QncyBpdC5lYWNoLiAqL1xuZnVuY3Rpb24gZm9ybWF0RWFjaE5hbWUobmFtZTogc3RyaW5nLCBhcmdzOiByZWFkb25seSB1bmtub3duW10sIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuICBsZXQgaSA9IDA7XG4gIGxldCBvdXQgPSBuYW1lLnJlcGxhY2UoLyVbc2RpZmpvIyVdL2csIChtKSA9PiB7XG4gICAgaWYgKG0gPT09IFwiJSVcIikgcmV0dXJuIFwiJVwiO1xuICAgIGlmIChtID09PSBcIiUjXCIpIHJldHVybiBTdHJpbmcoaW5kZXgpO1xuICAgIGNvbnN0IHYgPSBhcmdzW2krK107XG4gICAgcmV0dXJuIG0gPT09IFwiJWpcIiB8fCBtID09PSBcIiVvXCIgPyBKU09OLnN0cmluZ2lmeSh2KSA6IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiID8gdiA6IGluc3BlY3Qodik7XG4gIH0pO1xuICBjb25zdCBmaXJzdCA9IGFyZ3NbMF07XG4gIGlmIChmaXJzdCAmJiB0eXBlb2YgZmlyc3QgPT09IFwib2JqZWN0XCIpIHtcbiAgICBvdXQgPSBvdXQucmVwbGFjZSgvXFwkKFtcXHcuXSspL2csIChtLCBrZXk6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgdiA9IGtleS5zcGxpdChcIi5cIikucmVkdWNlPGFueT4oKG8sIGspID0+IChvID09IG51bGwgPyBvIDogb1trXSksIGZpcnN0KTtcbiAgICAgIHJldHVybiB2ID09PSB1bmRlZmluZWQgPyBtIDogdHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyB2IDogaW5zcGVjdCh2KTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgY29uc3QgaXQgPSBtYWtlSXQoKTtcbmV4cG9ydCBjb25zdCB0ZXN0ID0gaXQ7XG5leHBvcnQgY29uc3QgYmVmb3JlQWxsID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYmVmb3JlKGZuLCB7IHRpbWVvdXQgfSk7XG5leHBvcnQgY29uc3QgYWZ0ZXJBbGwgPSAoZm46IEZuLCB0aW1lb3V0ID0gSE9PS19USU1FT1VUX01TKSA9PiBub2RlVGVzdC5hZnRlcihmbiwgeyB0aW1lb3V0IH0pO1xuZXhwb3J0IGNvbnN0IGJlZm9yZUVhY2ggPSAoZm46IEZuLCB0aW1lb3V0ID0gSE9PS19USU1FT1VUX01TKSA9PiBub2RlVGVzdC5iZWZvcmVFYWNoKGZuLCB7IHRpbWVvdXQgfSk7XG5leHBvcnQgY29uc3QgYWZ0ZXJFYWNoID0gKGZuOiBGbiwgdGltZW91dCA9IEhPT0tfVElNRU9VVF9NUykgPT4gbm9kZVRlc3QuYWZ0ZXJFYWNoKGZuLCB7IHRpbWVvdXQgfSk7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBtb2NrIGZ1bmN0aW9ucyBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuZXhwb3J0IGludGVyZmFjZSBNb2NrPEEgZXh0ZW5kcyB1bmtub3duW10gPSBhbnlbXSwgUiA9IGFueT4ge1xuICAoLi4uYXJnczogQSk6IFI7XG4gIG1vY2s6IHsgY2FsbHM6IEFbXTsgcmVzdWx0czogeyB0eXBlOiBcInJldHVyblwiIHwgXCJ0aHJvd1wiOyB2YWx1ZTogdW5rbm93biB9W10gfTtcbiAgbW9ja0ltcGxlbWVudGF0aW9uKGZuOiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj47XG4gIG1vY2tJbXBsZW1lbnRhdGlvbk9uY2UoZm46ICguLi5hcmdzOiBBKSA9PiBSKTogTW9jazxBLCBSPjtcbiAgbW9ja1JldHVyblZhbHVlKHY6IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmV0dXJuVmFsdWVPbmNlKHY6IFIpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmVzb2x2ZWRWYWx1ZSh2OiBBd2FpdGVkPFI+KTogTW9jazxBLCBSPjtcbiAgbW9ja1JlamVjdGVkVmFsdWUoZTogdW5rbm93bik6IE1vY2s8QSwgUj47XG4gIG1vY2tDbGVhcigpOiBNb2NrPEEsIFI+O1xuICBtb2NrUmVzZXQoKTogTW9jazxBLCBSPjtcbn1cbmNvbnN0IE1PQ0sgPSBTeW1ib2woXCJtb2NrXCIpO1xuXG5mdW5jdGlvbiBmbjxBIGV4dGVuZHMgdW5rbm93bltdID0gYW55W10sIFIgPSBhbnk+KGltcGw/OiAoLi4uYXJnczogQSkgPT4gUik6IE1vY2s8QSwgUj4ge1xuICBsZXQgYmFzZSA9IGltcGw7XG4gIGNvbnN0IG9uY2U6ICgoLi4uYXJnczogQSkgPT4gUilbXSA9IFtdO1xuICBjb25zdCBtID0gKCguLi5hcmdzOiBBKTogUiA9PiB7XG4gICAgbS5tb2NrLmNhbGxzLnB1c2goYXJncyk7XG4gICAgY29uc3QgZiA9IG9uY2Uuc2hpZnQoKSA/PyBiYXNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGYgPyBmKC4uLmFyZ3MpIDogKHVuZGVmaW5lZCBhcyBSKTtcbiAgICAgIG0ubW9jay5yZXN1bHRzLnB1c2goeyB0eXBlOiBcInJldHVyblwiLCB2YWx1ZSB9KTtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBtLm1vY2sucmVzdWx0cy5wdXNoKHsgdHlwZTogXCJ0aHJvd1wiLCB2YWx1ZTogZSB9KTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICB9KSBhcyBNb2NrPEEsIFI+O1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkobSwgTU9DSywgeyB2YWx1ZTogdHJ1ZSB9KTtcbiAgbS5tb2NrID0geyBjYWxsczogW10sIHJlc3VsdHM6IFtdIH07XG4gIG0ubW9ja0ltcGxlbWVudGF0aW9uID0gKGYpID0+IHsgYmFzZSA9IGY7IHJldHVybiBtOyB9O1xuICBtLm1vY2tJbXBsZW1lbnRhdGlvbk9uY2UgPSAoZikgPT4geyBvbmNlLnB1c2goZik7IHJldHVybiBtOyB9O1xuICBtLm1vY2tSZXR1cm5WYWx1ZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbigoKSA9PiB2KTtcbiAgbS5tb2NrUmV0dXJuVmFsdWVPbmNlID0gKHYpID0+IG0ubW9ja0ltcGxlbWVudGF0aW9uT25jZSgoKSA9PiB2KTtcbiAgbS5tb2NrUmVzb2x2ZWRWYWx1ZSA9ICh2KSA9PiBtLm1vY2tJbXBsZW1lbnRhdGlvbigoKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHYpKSBhcyAoLi4uYXJnczogQSkgPT4gUik7XG4gIG0ubW9ja1JlamVjdGVkVmFsdWUgPSAoZSkgPT4gbS5tb2NrSW1wbGVtZW50YXRpb24oKCgpID0+IFByb21pc2UucmVqZWN0KGUpKSBhcyAoLi4uYXJnczogQSkgPT4gUik7XG4gIG0ubW9ja0NsZWFyID0gKCkgPT4geyBtLm1vY2suY2FsbHMgPSBbXTsgbS5tb2NrLnJlc3VsdHMgPSBbXTsgcmV0dXJuIG07IH07XG4gIG0ubW9ja1Jlc2V0ID0gKCkgPT4geyBtLm1vY2tDbGVhcigpOyBiYXNlID0gdW5kZWZpbmVkOyBvbmNlLmxlbmd0aCA9IDA7IHJldHVybiBtOyB9O1xuICByZXR1cm4gbTtcbn1cbmNvbnN0IGlzTW9jayA9ICh2OiB1bmtub3duKTogdiBpcyBNb2NrID0+IHR5cGVvZiB2ID09PSBcImZ1bmN0aW9uXCIgJiYgKHYgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3ltYm9sLCB1bmtub3duPilbTU9DS10gPT09IHRydWU7XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCB2aSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3Qgc3R1YmJlZCA9IG5ldyBNYXA8c3RyaW5nLCBQcm9wZXJ0eURlc2NyaXB0b3IgfCB1bmRlZmluZWQ+KCk7XG5cbmV4cG9ydCBjb25zdCB2aSA9IHtcbiAgZm4sXG4gIGlzTW9ja0Z1bmN0aW9uOiBpc01vY2ssXG4gIHN0dWJHbG9iYWwobmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuICAgIGlmICghc3R1YmJlZC5oYXMobmFtZSkpIHN0dWJiZWQuc2V0KG5hbWUsIE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IoZ2xvYmFsVGhpcywgbmFtZSkpO1xuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShnbG9iYWxUaGlzLCBuYW1lLCB7IHZhbHVlLCB3cml0YWJsZTogdHJ1ZSwgY29uZmlndXJhYmxlOiB0cnVlLCBlbnVtZXJhYmxlOiB0cnVlIH0pO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgdW5zdHViQWxsR2xvYmFscygpIHtcbiAgICBmb3IgKGNvbnN0IFtuYW1lLCBkZXNjXSBvZiBzdHViYmVkKSB7XG4gICAgICBpZiAoZGVzYykgT2JqZWN0LmRlZmluZVByb3BlcnR5KGdsb2JhbFRoaXMsIG5hbWUsIGRlc2MpO1xuICAgICAgZWxzZSBkZWxldGUgKGdsb2JhbFRoaXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW25hbWVdO1xuICAgIH1cbiAgICBzdHViYmVkLmNsZWFyKCk7XG4gICAgcmV0dXJuIHZpO1xuICB9LFxuICAvKiogT25seSBEYXRlIGlzIHN1cHBvcnRlZCAobm9kZTp0ZXN0J3MgbW9jayB0aW1lcnMpLiAqL1xuICB1c2VGYWtlVGltZXJzKG9wdHM/OiB7IHRvRmFrZT86IHN0cmluZ1tdOyBub3c/OiBudW1iZXIgfCBEYXRlIH0pIHtcbiAgICBjb25zdCBhcGlzID0gKG9wdHM/LnRvRmFrZSA/PyBbXCJEYXRlXCJdKS5maWx0ZXIoKGEpID0+IGEgPT09IFwiRGF0ZVwiIHx8IGEgPT09IFwic2V0VGltZW91dFwiIHx8IGEgPT09IFwic2V0SW50ZXJ2YWxcIikgYXMgKFwiRGF0ZVwiIHwgXCJzZXRUaW1lb3V0XCIgfCBcInNldEludGVydmFsXCIpW107XG4gICAgbm9kZVRlc3QubW9jay50aW1lcnMuZW5hYmxlKHsgYXBpcywgbm93OiBvcHRzPy5ub3cgPz8gRGF0ZS5ub3coKSB9KTtcbiAgICByZXR1cm4gdmk7XG4gIH0sXG4gIHNldFN5c3RlbVRpbWUodDogbnVtYmVyIHwgRGF0ZSkge1xuICAgIG5vZGVUZXN0Lm1vY2sudGltZXJzLnNldFRpbWUodHlwZW9mIHQgPT09IFwibnVtYmVyXCIgPyB0IDogdC5nZXRUaW1lKCkpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbiAgdXNlUmVhbFRpbWVycygpIHtcbiAgICBub2RlVGVzdC5tb2NrLnRpbWVycy5yZXNldCgpO1xuICAgIHJldHVybiB2aTtcbiAgfSxcbn07XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBlcXVhbGl0eSBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuaW50ZXJmYWNlIEFzeW1tZXRyaWMgeyBhc3ltbWV0cmljTWF0Y2goYWN0dWFsOiB1bmtub3duKTogYm9vbGVhbjsgdG9TdHJpbmcoKTogc3RyaW5nIH1cbmNvbnN0IGlzQXN5bW1ldHJpYyA9ICh2OiB1bmtub3duKTogdiBpcyBBc3ltbWV0cmljID0+ICEhdiAmJiB0eXBlb2YgKHYgYXMgQXN5bW1ldHJpYykuYXN5bW1ldHJpY01hdGNoID09PSBcImZ1bmN0aW9uXCI7XG5cbi8qKiB2aXRlc3QncyB0b0VxdWFsOiByZWN1cnNpdmUsIGlnbm9yZXMgdW5kZWZpbmVkIHByb3BlcnRpZXMgYW5kIG9iamVjdCB0eXBlczsgW3BhcnRpYWxdID0gdG9NYXRjaE9iamVjdC4gKi9cbmZ1bmN0aW9uIGVxdWFscyhhOiB1bmtub3duLCBiOiB1bmtub3duLCBwYXJ0aWFsID0gZmFsc2UsIHNlZW4gPSBuZXcgTWFwPG9iamVjdCwgb2JqZWN0PigpKTogYm9vbGVhbiB7XG4gIGlmIChpc0FzeW1tZXRyaWMoYikpIHJldHVybiBiLmFzeW1tZXRyaWNNYXRjaChhKTtcbiAgaWYgKGlzQXN5bW1ldHJpYyhhKSkgcmV0dXJuIGEuYXN5bW1ldHJpY01hdGNoKGIpO1xuICBpZiAoT2JqZWN0LmlzKGEsIGIpKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKHR5cGVvZiBhICE9PSBcIm9iamVjdFwiIHx8IHR5cGVvZiBiICE9PSBcIm9iamVjdFwiIHx8IGEgPT09IG51bGwgfHwgYiA9PT0gbnVsbCkgcmV0dXJuIGZhbHNlO1xuICBpZiAoc2Vlbi5nZXQoYSkgPT09IGIpIHJldHVybiB0cnVlO1xuICBzZWVuLnNldChhLCBiKTtcbiAgaWYgKGEgaW5zdGFuY2VvZiBEYXRlIHx8IGIgaW5zdGFuY2VvZiBEYXRlKSByZXR1cm4gYSBpbnN0YW5jZW9mIERhdGUgJiYgYiBpbnN0YW5jZW9mIERhdGUgJiYgYS5nZXRUaW1lKCkgPT09IGIuZ2V0VGltZSgpO1xuICBpZiAoYSBpbnN0YW5jZW9mIFJlZ0V4cCB8fCBiIGluc3RhbmNlb2YgUmVnRXhwKSByZXR1cm4gU3RyaW5nKGEpID09PSBTdHJpbmcoYik7XG4gIGlmIChhIGluc3RhbmNlb2YgTWFwIHx8IGIgaW5zdGFuY2VvZiBNYXApIHtcbiAgICBpZiAoIShhIGluc3RhbmNlb2YgTWFwICYmIGIgaW5zdGFuY2VvZiBNYXApIHx8IGEuc2l6ZSAhPT0gYi5zaXplKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChjb25zdCBbaywgdl0gb2YgYikgaWYgKCFhLmhhcyhrKSB8fCAhZXF1YWxzKGEuZ2V0KGspLCB2LCBwYXJ0aWFsLCBzZWVuKSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIGlmIChhIGluc3RhbmNlb2YgU2V0IHx8IGIgaW5zdGFuY2VvZiBTZXQpIHtcbiAgICBpZiAoIShhIGluc3RhbmNlb2YgU2V0ICYmIGIgaW5zdGFuY2VvZiBTZXQpIHx8IGEuc2l6ZSAhPT0gYi5zaXplKSByZXR1cm4gZmFsc2U7XG4gICAgZm9yIChjb25zdCB2IG9mIGIpIGlmICghYS5oYXModikgJiYgIVsuLi5hXS5zb21lKCh4KSA9PiBlcXVhbHMoeCwgdiwgcGFydGlhbCwgc2VlbikpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKEFycmF5QnVmZmVyLmlzVmlldyhhKSB8fCBBcnJheUJ1ZmZlci5pc1ZpZXcoYikpIHJldHVybiBpc0RlZXBTdHJpY3RFcXVhbChhLCBiKTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkgIT09IEFycmF5LmlzQXJyYXkoYikpIHJldHVybiBmYWxzZTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoYSkgJiYgQXJyYXkuaXNBcnJheShiKSkge1xuICAgIGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gYi5ldmVyeSgodiwgaSkgPT4gZXF1YWxzKGFbaV0sIHYsIHBhcnRpYWwsIHNlZW4pKTtcbiAgfVxuICBjb25zdCBhbyA9IGEgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGJvID0gYiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcbiAgY29uc3Qga2V5cyA9IChvOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikgPT4gT2JqZWN0LmtleXMobykuZmlsdGVyKChrKSA9PiBvW2tdICE9PSB1bmRlZmluZWQpO1xuICBpZiAocGFydGlhbCkgcmV0dXJuIE9iamVjdC5rZXlzKGJvKS5ldmVyeSgoaykgPT4gKGJvW2tdID09PSB1bmRlZmluZWQgPyBhb1trXSA9PT0gdW5kZWZpbmVkIDogayBpbiBhbyAmJiBlcXVhbHMoYW9ba10sIGJvW2tdLCB0cnVlLCBzZWVuKSkpO1xuICBjb25zdCBrYSA9IGtleXMoYW8pLCBrYiA9IGtleXMoYm8pO1xuICBpZiAoa2EubGVuZ3RoICE9PSBrYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgcmV0dXJuIGtiLmV2ZXJ5KChrKSA9PiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoYW8sIGspICYmIGVxdWFscyhhb1trXSwgYm9ba10sIGZhbHNlLCBzZWVuKSk7XG59XG5cbi8vIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMCBzbmFwc2hvdHMgXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG5cbmxldCBjdXJyZW50OiB7IG5hbWU6IHN0cmluZzsgY291bnRzOiBNYXA8c3RyaW5nLCBudW1iZXI+IH0gPSB7IG5hbWU6IFwiXCIsIGNvdW50czogbmV3IE1hcCgpIH07XG5jb25zdCBzbmFwQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgUmVjb3JkPHN0cmluZywgc3RyaW5nPj4oKTtcbmNvbnN0IGRpcnR5U25hcHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuLyoqXG4gKiBzY3JpcHRzL3Rlc3QubWpzIGJ1bmRsZXMgd2ViLzxkaXI+L3gudGVzdC50cyB0byB3ZWIvLnRlc3QtZGlzdC88ZGlyPi94LnRlc3QubWpzIGFuZCBub2RlIC0tdGVzdFxuICogcnVucyBlYWNoIGJ1bmRsZSBhcyBpdHMgb3duIHByb2Nlc3MsIHNvIHRoZSBzb3VyY2UgcGF0aCBmb2xsb3dzIGZyb20gdGhlIHNjcmlwdCBwYXRoLlxuICovXG5mdW5jdGlvbiBzbmFwRmlsZSgpOiBzdHJpbmcge1xuICBjb25zdCByb290ID0gcHJvY2Vzcy5lbnYuSVJPTlRFUk1fVEVTVF9ST09UO1xuICBjb25zdCBzY3JpcHQgPSBwcm9jZXNzLmFyZ3ZbMV0gPz8gXCJcIjtcbiAgY29uc3QgZGlzdCA9IHJvb3QgPyBqb2luKHJvb3QsIFwiLnRlc3QtZGlzdFwiKSA6IFwiXCI7XG4gIGlmICghcm9vdCB8fCAhc2NyaXB0LnN0YXJ0c1dpdGgoZGlzdCkpIHRocm93IG5ldyBFcnJvcihcInRvTWF0Y2hTbmFwc2hvdDogcnVuIHRlc3RzIHRocm91Z2ggc2NyaXB0cy90ZXN0Lm1qc1wiKTtcbiAgY29uc3Qgc3JjID0gam9pbihyb290LCByZWxhdGl2ZShkaXN0LCBzY3JpcHQpKS5yZXBsYWNlKC9cXC5tanMkLywgXCIudHNcIik7XG4gIHJldHVybiBqb2luKGRpcm5hbWUoc3JjKSwgXCJfX3NuYXBzaG90c19fXCIsIHNyYy5zcGxpdChcIi9cIikucG9wKCkgKyBcIi5zbmFwXCIpO1xufVxuXG5mdW5jdGlvbiBsb2FkU25hcHMoZmlsZTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB7XG4gIGxldCBzbmFwcyA9IHNuYXBDYWNoZS5nZXQoZmlsZSk7XG4gIGlmICghc25hcHMpIHtcbiAgICBzbmFwcyA9IHt9O1xuICAgIGlmIChleGlzdHNTeW5jKGZpbGUpKSBuZXcgRnVuY3Rpb24oXCJleHBvcnRzXCIsIHJlYWRGaWxlU3luYyhmaWxlLCBcInV0ZjhcIikpKHNuYXBzKTtcbiAgICBzbmFwQ2FjaGUuc2V0KGZpbGUsIHNuYXBzKTtcbiAgfVxuICByZXR1cm4gc25hcHM7XG59XG5cbi8qKiBUaGUgdml0ZXN0IHNuYXBzaG90IGZvcm1hdCBmb3IgdGhlIHZhbHVlcyB0aGUgdGVzdHMgc25hcHNob3QgKHN0cmluZ3M7IEpTT04gb3RoZXJ3aXNlKS4gKi9cbmNvbnN0IHNlcmlhbGl6ZSA9ICh2OiB1bmtub3duKSA9PiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIgPyBgXCIke3Z9XCJgIDogSlNPTi5zdHJpbmdpZnkodiwgbnVsbCwgMikpO1xuY29uc3QgZXNjYXBlVGVtcGxhdGUgPSAoczogc3RyaW5nKSA9PiBzLnJlcGxhY2UoL1xcXFwvZywgXCJcXFxcXFxcXFwiKS5yZXBsYWNlKC9gL2csIFwiXFxcXGBcIikucmVwbGFjZSgvXFwkXFx7L2csIFwiXFxcXCR7XCIpO1xuXG5wcm9jZXNzLm9uKFwiZXhpdFwiLCAoKSA9PiB7XG4gIGZvciAoY29uc3QgZmlsZSBvZiBkaXJ0eVNuYXBzKSB7XG4gICAgY29uc3Qgc25hcHMgPSBzbmFwQ2FjaGUuZ2V0KGZpbGUpITtcbiAgICBjb25zdCBib2R5ID0gT2JqZWN0LmtleXMoc25hcHMpLnNvcnQoKS5tYXAoKGspID0+IGBleHBvcnRzW1xcYCR7ZXNjYXBlVGVtcGxhdGUoayl9XFxgXSA9IFxcYCR7ZXNjYXBlVGVtcGxhdGUoc25hcHNba10pfVxcYDtcXG5gKS5qb2luKFwiXFxuXCIpO1xuICAgIG1rZGlyU3luYyhkaXJuYW1lKGZpbGUpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICB3cml0ZUZpbGVTeW5jKGZpbGUsIGAvLyBWaXRlc3QgU25hcHNob3QgdjEsIGh0dHBzOi8vdml0ZXN0LmRldi9ndWlkZS9zbmFwc2hvdC5odG1sXFxuXFxuJHtib2R5fWApO1xuICAgIGNvbnNvbGUubG9nKGB1cGRhdGVkICR7cmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgZmlsZSl9YCk7XG4gIH1cbn0pO1xuXG5mdW5jdGlvbiBtYXRjaFNuYXBzaG90KGFjdHVhbDogdW5rbm93biwgaGludD86IHN0cmluZykge1xuICBjb25zdCBiYXNlID0gaGludCA/IGAke2N1cnJlbnQubmFtZX0gPiAke2hpbnR9YCA6IGN1cnJlbnQubmFtZTtcbiAgY29uc3QgbiA9IChjdXJyZW50LmNvdW50cy5nZXQoYmFzZSkgPz8gMCkgKyAxO1xuICBjdXJyZW50LmNvdW50cy5zZXQoYmFzZSwgbik7XG4gIGNvbnN0IGtleSA9IGAke2Jhc2V9ICR7bn1gO1xuICBjb25zdCBmaWxlID0gc25hcEZpbGUoKTtcbiAgY29uc3Qgc25hcHMgPSBsb2FkU25hcHMoZmlsZSk7XG4gIGNvbnN0IGdvdCA9IGBcXG4ke3NlcmlhbGl6ZShhY3R1YWwpfVxcbmA7XG4gIC8vIGxpa2Ugdml0ZXN0LCBDSSBuZXZlciB3cml0ZXMgYSBtaXNzaW5nIHNuYXBzaG90OiBpdCBmYWlsc1xuICBpZiAoIShrZXkgaW4gc25hcHMpICYmIHByb2Nlc3MuZW52LkNJICYmICFwcm9jZXNzLmVudi5VUERBVEVfU05BUFNIT1RTKSByZXR1cm4geyBwYXNzOiBmYWxzZSwgbWVzc2FnZTogYG1pc3Npbmcgc25hcHNob3QgXCIke2tleX1cIiAocnVuIHRoZSB0ZXN0cyBsb2NhbGx5IGFuZCBjb21taXQgdGhlIC5zbmFwIGZpbGUpYCB9O1xuICBpZiAocHJvY2Vzcy5lbnYuVVBEQVRFX1NOQVBTSE9UUyB8fCAhKGtleSBpbiBzbmFwcykpIHtcbiAgICBpZiAoc25hcHNba2V5XSAhPT0gZ290KSB7IHNuYXBzW2tleV0gPSBnb3Q7IGRpcnR5U25hcHMuYWRkKGZpbGUpOyB9XG4gICAgcmV0dXJuIHsgcGFzczogdHJ1ZSwgbWVzc2FnZTogXCJcIiB9O1xuICB9XG4gIHJldHVybiB7IHBhc3M6IHNuYXBzW2tleV0gPT09IGdvdCwgbWVzc2FnZTogYHNuYXBzaG90IFwiJHtrZXl9XCIgZGlmZmVyczpcXG5leHBlY3RlZDoke3NuYXBzW2tleV19XFxucmVjZWl2ZWQ6JHtnb3R9KFVQREFURV9TTkFQU0hPVFM9MSBwbnBtIHRlc3QgdG8gYWNjZXB0KWAgfTtcbn1cblxuLy8gXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwIGV4cGVjdCBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcdTI1MDBcblxuY29uc3Qgc2hvdyA9ICh2OiB1bmtub3duKSA9PiAoaXNBc3ltbWV0cmljKHYpID8gdi50b1N0cmluZygpIDogaW5zcGVjdCh2LCB7IGRlcHRoOiA2LCBicmVha0xlbmd0aDogMTIwIH0pKTtcblxudHlwZSBSZXN1bHQgPSB7IHBhc3M6IGJvb2xlYW47IG1lc3NhZ2U6IHN0cmluZyB9O1xudHlwZSBNYXRjaGVycyA9IFJlY29yZDxzdHJpbmcsIChhY3R1YWw6IHVua25vd24sIC4uLmFyZ3M6IGFueVtdKSA9PiBSZXN1bHQ+O1xuXG5jb25zdCBtYXRjaGVyczogTWF0Y2hlcnMgPSB7XG4gIHRvQmU6IChhLCBiKSA9PiAoeyBwYXNzOiBPYmplY3QuaXMoYSwgYiksIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGJlICR7c2hvdyhiKX1gIH0pLFxuICB0b0VxdWFsOiAoYSwgYikgPT4gKHsgcGFzczogZXF1YWxzKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBlcXVhbCAke3Nob3coYil9YCB9KSxcbiAgdG9TdHJpY3RFcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IGlzRGVlcFN0cmljdEVxdWFsKGEsIGIpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBzdHJpY3RseSBlcXVhbCAke3Nob3coYil9YCB9KSxcbiAgdG9NYXRjaE9iamVjdDogKGEsIGIpID0+ICh7IHBhc3M6IGVxdWFscyhhLCBiLCB0cnVlKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gbWF0Y2ggb2JqZWN0ICR7c2hvdyhiKX1gIH0pLFxuICB0b0JlQ2xvc2VUbzogKGEsIGI6IG51bWJlciwgZGlnaXRzID0gMikgPT4gKHtcbiAgICBwYXNzOiB0eXBlb2YgYSA9PT0gXCJudW1iZXJcIiAmJiAoYSA9PT0gYiB8fCBNYXRoLmFicyhhIC0gYikgPCAxMCAqKiAtZGlnaXRzIC8gMiksXG4gICAgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgY2xvc2UgdG8gJHtifSAoJHtkaWdpdHN9IGRpZ2l0cylgLFxuICB9KSxcbiAgdG9CZUdyZWF0ZXJUaGFuOiAoYSwgYikgPT4gKHsgcGFzczogKGEgYXMgbnVtYmVyKSA+IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9ID4gJHtifWAgfSksXG4gIHRvQmVHcmVhdGVyVGhhbk9yRXF1YWw6IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpID49IGIsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9ID49ICR7Yn1gIH0pLFxuICB0b0JlTGVzc1RoYW46IChhLCBiKSA9PiAoeyBwYXNzOiAoYSBhcyBudW1iZXIpIDwgYiwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gPCAke2J9YCB9KSxcbiAgdG9CZUxlc3NUaGFuT3JFcXVhbDogKGEsIGIpID0+ICh7IHBhc3M6IChhIGFzIG51bWJlcikgPD0gYiwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gPD0gJHtifWAgfSksXG4gIHRvSGF2ZUxlbmd0aDogKGEsIG4pID0+ICh7IHBhc3M6IChhIGFzIHsgbGVuZ3RoPzogbnVtYmVyIH0pPy5sZW5ndGggPT09IG4sIG1lc3NhZ2U6IGBleHBlY3RlZCBsZW5ndGggJHtufSwgZ290ICR7KGEgYXMgeyBsZW5ndGg/OiBudW1iZXIgfSk/Lmxlbmd0aH0gKCR7c2hvdyhhKX0pYCB9KSxcbiAgdG9IYXZlUHJvcGVydHk6IChhLCBrZXk6IHN0cmluZywgLi4udjogdW5rbm93bltdKSA9PiB7XG4gICAgY29uc3QgcGF0aCA9IGtleS5zcGxpdChcIi5cIik7XG4gICAgbGV0IG86IGFueSA9IGE7XG4gICAgZm9yIChjb25zdCBrIG9mIHBhdGgpIHsgaWYgKG8gPT0gbnVsbCB8fCAhKGsgaW4gT2JqZWN0KG8pKSkgcmV0dXJuIHsgcGFzczogZmFsc2UsIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGhhdmUgcHJvcGVydHkgJHtrZXl9YCB9OyBvID0gb1trXTsgfVxuICAgIHJldHVybiB7IHBhc3M6IHYubGVuZ3RoID09PSAwIHx8IGVxdWFscyhvLCB2WzBdKSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gaGF2ZSAke2tleX0gPSAke3Nob3codlswXSl9LCBnb3QgJHtzaG93KG8pfWAgfTtcbiAgfSxcbiAgdG9CZU51bGw6IChhKSA9PiAoeyBwYXNzOiBhID09PSBudWxsLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSBudWxsYCB9KSxcbiAgdG9CZVVuZGVmaW5lZDogKGEpID0+ICh7IHBhc3M6IGEgPT09IHVuZGVmaW5lZCwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgdW5kZWZpbmVkYCB9KSxcbiAgdG9CZURlZmluZWQ6IChhKSA9PiAoeyBwYXNzOiBhICE9PSB1bmRlZmluZWQsIG1lc3NhZ2U6IGBleHBlY3RlZCBhIGRlZmluZWQgdmFsdWVgIH0pLFxuICB0b0JlVHJ1dGh5OiAoYSkgPT4gKHsgcGFzczogISFhLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSB0cnV0aHlgIH0pLFxuICB0b0JlRmFsc3k6IChhKSA9PiAoeyBwYXNzOiAhYSwgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgZmFsc3lgIH0pLFxuICB0b0JlTmFOOiAoYSkgPT4gKHsgcGFzczogTnVtYmVyLmlzTmFOKGEpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBiZSBOYU5gIH0pLFxuICB0b0JlSW5zdGFuY2VPZjogKGEsIGNscykgPT4gKHsgcGFzczogYSBpbnN0YW5jZW9mIGNscywgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gYmUgYW4gaW5zdGFuY2Ugb2YgJHtjbHM/Lm5hbWV9YCB9KSxcbiAgdG9CZVR5cGVPZjogKGEsIHQ6IHN0cmluZykgPT4gKHsgcGFzczogdHlwZW9mIGEgPT09IHQsIG1lc3NhZ2U6IGBleHBlY3RlZCB0eXBlb2YgJHtzaG93KGEpfSB0byBiZSAke3R9YCB9KSxcbiAgdG9NYXRjaDogKGEsIHJlOiBSZWdFeHAgfCBzdHJpbmcpID0+ICh7XG4gICAgcGFzczogdHlwZW9mIGEgPT09IFwic3RyaW5nXCIgJiYgKHR5cGVvZiByZSA9PT0gXCJzdHJpbmdcIiA/IGEuaW5jbHVkZXMocmUpIDogcmUudGVzdChhKSksXG4gICAgbWVzc2FnZTogYGV4cGVjdGVkICR7c2hvdyhhKX0gdG8gbWF0Y2ggJHtTdHJpbmcocmUpfWAsXG4gIH0pLFxuICB0b0NvbnRhaW46IChhLCBpdGVtKSA9PiAoe1xuICAgIHBhc3M6IHR5cGVvZiBhID09PSBcInN0cmluZ1wiID8gYS5pbmNsdWRlcyhpdGVtIGFzIHN0cmluZykgOiBBcnJheS5pc0FycmF5KGEpIHx8IGEgaW5zdGFuY2VvZiBTZXQgPyBbLi4uKGEgYXMgSXRlcmFibGU8dW5rbm93bj4pXS5pbmNsdWRlcyhpdGVtKSA6IGZhbHNlLFxuICAgIG1lc3NhZ2U6IGBleHBlY3RlZCAke3Nob3coYSl9IHRvIGNvbnRhaW4gJHtzaG93KGl0ZW0pfWAsXG4gIH0pLFxuICB0b0NvbnRhaW5FcXVhbDogKGEsIGl0ZW0pID0+ICh7IHBhc3M6IEFycmF5LmlzQXJyYXkoYSkgJiYgYS5zb21lKCh4KSA9PiBlcXVhbHMoeCwgaXRlbSkpLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtzaG93KGEpfSB0byBjb250YWluIGFuIGl0ZW0gZXF1YWwgdG8gJHtzaG93KGl0ZW0pfWAgfSksXG4gIHRvVGhyb3c6IChmbk9yRXJyb3IsIGV4cGVjdGVkPzogdW5rbm93bikgPT4ge1xuICAgIGxldCBlcnI6IHVua25vd24sIHRocmV3ID0gZmFsc2U7XG4gICAgaWYgKHR5cGVvZiBmbk9yRXJyb3IgPT09IFwiZnVuY3Rpb25cIikgeyB0cnkgeyAoZm5PckVycm9yIGFzICgpID0+IHVua25vd24pKCk7IH0gY2F0Y2ggKGUpIHsgdGhyZXcgPSB0cnVlOyBlcnIgPSBlOyB9IH1cbiAgICBlbHNlIHsgdGhyZXcgPSB0cnVlOyBlcnIgPSBmbk9yRXJyb3I7IH0gLy8gZnJvbSAucmVqZWN0c1xuICAgIGNvbnN0IG1zZyA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcbiAgICBsZXQgcGFzcyA9IHRocmV3O1xuICAgIGlmICh0aHJldyAmJiBleHBlY3RlZCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcInN0cmluZ1wiKSBwYXNzID0gbXNnLmluY2x1ZGVzKGV4cGVjdGVkKTtcbiAgICAgIGVsc2UgaWYgKGV4cGVjdGVkIGluc3RhbmNlb2YgUmVnRXhwKSBwYXNzID0gZXhwZWN0ZWQudGVzdChtc2cpO1xuICAgICAgZWxzZSBpZiAodHlwZW9mIGV4cGVjdGVkID09PSBcImZ1bmN0aW9uXCIpIHBhc3MgPSBlcnIgaW5zdGFuY2VvZiAoZXhwZWN0ZWQgYXMgbmV3ICgpID0+IHVua25vd24pO1xuICAgICAgZWxzZSBpZiAoZXhwZWN0ZWQgaW5zdGFuY2VvZiBFcnJvcikgcGFzcyA9IG1zZyA9PT0gZXhwZWN0ZWQubWVzc2FnZTtcbiAgICB9XG4gICAgcmV0dXJuIHsgcGFzcywgbWVzc2FnZTogdGhyZXcgPyBgZXhwZWN0ZWQgdGhlIGVycm9yICgke21zZ30pIHRvIG1hdGNoICR7c2hvdyhleHBlY3RlZCl9YCA6IGBleHBlY3RlZCBhIHRocm93JHtleHBlY3RlZCA9PT0gdW5kZWZpbmVkID8gXCJcIiA6IGAgbWF0Y2hpbmcgJHtzaG93KGV4cGVjdGVkKX1gfWAgfTtcbiAgfSxcbiAgdG9NYXRjaFNuYXBzaG90OiAoYSwgaGludD86IHN0cmluZykgPT4gbWF0Y2hTbmFwc2hvdChhLCBoaW50KSxcbn07XG5tYXRjaGVycy50b1Rocm93RXJyb3IgPSBtYXRjaGVycy50b1Rocm93O1xuY29uc3QgY2FsbHMgPSAoYTogdW5rbm93bikgPT4geyBpZiAoIWlzTW9jayhhKSkgdGhyb3cgbmV3IFR5cGVFcnJvcihgJHtzaG93KGEpfSBpcyBub3QgYSB2aS5mbigpYCk7IHJldHVybiBhLm1vY2suY2FsbHM7IH07XG5tYXRjaGVycy50b0hhdmVCZWVuQ2FsbGVkID0gKGEpID0+ICh7IHBhc3M6IGNhbGxzKGEpLmxlbmd0aCA+IDAsIG1lc3NhZ2U6IFwiZXhwZWN0ZWQgdGhlIG1vY2sgdG8gaGF2ZSBiZWVuIGNhbGxlZFwiIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkNhbGxlZFRpbWVzID0gKGEsIG46IG51bWJlcikgPT4gKHsgcGFzczogY2FsbHMoYSkubGVuZ3RoID09PSBuLCBtZXNzYWdlOiBgZXhwZWN0ZWQgJHtufSBjYWxscywgZ290ICR7Y2FsbHMoYSkubGVuZ3RofWAgfSk7XG5tYXRjaGVycy50b0hhdmVCZWVuQ2FsbGVkV2l0aCA9IChhLCAuLi5hcmdzOiB1bmtub3duW10pID0+ICh7IHBhc3M6IGNhbGxzKGEpLnNvbWUoKGMpID0+IGVxdWFscyhjLCBhcmdzKSksIG1lc3NhZ2U6IGBleHBlY3RlZCBhIGNhbGwgd2l0aCAke3Nob3coYXJncyl9OyBjYWxsczogJHtzaG93KGNhbGxzKGEpKX1gIH0pO1xubWF0Y2hlcnMudG9IYXZlQmVlbkxhc3RDYWxsZWRXaXRoID0gKGEsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gKHsgcGFzczogZXF1YWxzKGNhbGxzKGEpLmF0KC0xKSwgYXJncyksIG1lc3NhZ2U6IGBleHBlY3RlZCB0aGUgbGFzdCBjYWxsIHRvIGJlICR7c2hvdyhhcmdzKX07IGNhbGxzOiAke3Nob3coY2FsbHMoYSkpfWAgfSk7XG5tYXRjaGVycy50b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aCA9IChhLCBuOiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gKHsgcGFzczogZXF1YWxzKGNhbGxzKGEpW24gLSAxXSwgYXJncyksIG1lc3NhZ2U6IGBleHBlY3RlZCBjYWxsICR7bn0gdG8gYmUgJHtzaG93KGFyZ3MpfTsgY2FsbHM6ICR7c2hvdyhjYWxscyhhKSl9YCB9KTtcblxuLyoqIFRoZSBtYXRjaGVycywgdHlwZWQgKFIgPSB2b2lkLCBvciBQcm9taXNlPHZvaWQ+IGFmdGVyIC5yZXNvbHZlcyAvIC5yZWplY3RzKS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgQXNzZXJ0aW9uPFIgPSB2b2lkPiB7XG4gIHRvQmUoZXhwZWN0ZWQ6IHVua25vd24pOiBSO1xuICB0b0VxdWFsKGV4cGVjdGVkOiB1bmtub3duKTogUjtcbiAgdG9TdHJpY3RFcXVhbChleHBlY3RlZDogdW5rbm93bik6IFI7XG4gIHRvTWF0Y2hPYmplY3QoZXhwZWN0ZWQ6IG9iamVjdCk6IFI7XG4gIHRvQmVDbG9zZVRvKGV4cGVjdGVkOiBudW1iZXIsIGRpZ2l0cz86IG51bWJlcik6IFI7XG4gIHRvQmVHcmVhdGVyVGhhbihuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlR3JlYXRlclRoYW5PckVxdWFsKG46IG51bWJlciB8IGJpZ2ludCk6IFI7XG4gIHRvQmVMZXNzVGhhbihuOiBudW1iZXIgfCBiaWdpbnQpOiBSO1xuICB0b0JlTGVzc1RoYW5PckVxdWFsKG46IG51bWJlciB8IGJpZ2ludCk6IFI7XG4gIHRvSGF2ZUxlbmd0aChuOiBudW1iZXIpOiBSO1xuICB0b0hhdmVQcm9wZXJ0eShwYXRoOiBzdHJpbmcsIHZhbHVlPzogdW5rbm93bik6IFI7XG4gIHRvQmVOdWxsKCk6IFI7XG4gIHRvQmVVbmRlZmluZWQoKTogUjtcbiAgdG9CZURlZmluZWQoKTogUjtcbiAgdG9CZVRydXRoeSgpOiBSO1xuICB0b0JlRmFsc3koKTogUjtcbiAgdG9CZU5hTigpOiBSO1xuICB0b0JlSW5zdGFuY2VPZihjbHM6IGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bik6IFI7XG4gIHRvQmVUeXBlT2YodHlwZTogXCJzdHJpbmdcIiB8IFwibnVtYmVyXCIgfCBcImJpZ2ludFwiIHwgXCJib29sZWFuXCIgfCBcInN5bWJvbFwiIHwgXCJ1bmRlZmluZWRcIiB8IFwib2JqZWN0XCIgfCBcImZ1bmN0aW9uXCIpOiBSO1xuICB0b01hdGNoKGV4cGVjdGVkOiBSZWdFeHAgfCBzdHJpbmcpOiBSO1xuICB0b0NvbnRhaW4oaXRlbTogdW5rbm93bik6IFI7XG4gIHRvQ29udGFpbkVxdWFsKGl0ZW06IHVua25vd24pOiBSO1xuICB0b1Rocm93KGV4cGVjdGVkPzogc3RyaW5nIHwgUmVnRXhwIHwgRXJyb3IgfCAoYWJzdHJhY3QgbmV3ICguLi5hcmdzOiBuZXZlcltdKSA9PiB1bmtub3duKSk6IFI7XG4gIHRvVGhyb3dFcnJvcihleHBlY3RlZD86IHN0cmluZyB8IFJlZ0V4cCB8IEVycm9yIHwgKGFic3RyYWN0IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gdW5rbm93bikpOiBSO1xuICB0b01hdGNoU25hcHNob3QoaGludD86IHN0cmluZyk6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWQoKTogUjtcbiAgdG9IYXZlQmVlbkNhbGxlZFRpbWVzKG46IG51bWJlcik6IFI7XG4gIHRvSGF2ZUJlZW5DYWxsZWRXaXRoKC4uLmFyZ3M6IHVua25vd25bXSk6IFI7XG4gIHRvSGF2ZUJlZW5MYXN0Q2FsbGVkV2l0aCguLi5hcmdzOiB1bmtub3duW10pOiBSO1xuICB0b0hhdmVCZWVuTnRoQ2FsbGVkV2l0aChuOiBudW1iZXIsIC4uLmFyZ3M6IHVua25vd25bXSk6IFI7XG59XG5cbnR5cGUgRXhwZWN0YXRpb24gPSBBc3NlcnRpb24gJiB7XG4gIG5vdDogQXNzZXJ0aW9uO1xuICByZXNvbHZlczogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+ICYgeyBub3Q6IEFzc2VydGlvbjxQcm9taXNlPHZvaWQ+PiB9O1xuICByZWplY3RzOiBBc3NlcnRpb248UHJvbWlzZTx2b2lkPj4gJiB7IG5vdDogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+IH07XG59O1xuXG5mdW5jdGlvbiBmYWlsKHI6IFJlc3VsdCwgbmVnYXRlOiBib29sZWFuLCBsYWJlbD86IHN0cmluZykge1xuICBpZiAoci5wYXNzID09PSBuZWdhdGUpIHtcbiAgICBjb25zdCBtZXNzYWdlID0gKGxhYmVsID8gYCR7bGFiZWx9OiBgIDogXCJcIikgKyAobmVnYXRlID8gYG5vdDogJHtyLm1lc3NhZ2V9YCA6IHIubWVzc2FnZSk7XG4gICAgdGhyb3cgbmV3IEFzc2VydGlvbkVycm9yKHsgbWVzc2FnZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBidWlsZChhY3R1YWw6ICgpID0+IHVua25vd24sIG5lZ2F0ZTogYm9vbGVhbiwgbGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgYXN5bmM6IGZhbHNlKTogQXNzZXJ0aW9uO1xuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiBQcm9taXNlPHVua25vd24+LCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiB0cnVlKTogQXNzZXJ0aW9uPFByb21pc2U8dm9pZD4+O1xuZnVuY3Rpb24gYnVpbGQoYWN0dWFsOiAoKSA9PiB1bmtub3duLCBuZWdhdGU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGFzeW5jOiBib29sZWFuKTogdW5rbm93biB7XG4gIGNvbnN0IG91dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcbiAgZm9yIChjb25zdCBbbmFtZSwgbV0gb2YgT2JqZWN0LmVudHJpZXMobWF0Y2hlcnMpKSB7XG4gICAgb3V0W25hbWVdID0gYXN5bmNcbiAgICAgID8gYXN5bmMgKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZmFpbChtKGF3YWl0IGFjdHVhbCgpLCAuLi5hcmdzKSwgbmVnYXRlLCBsYWJlbClcbiAgICAgIDogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gZmFpbChtKGFjdHVhbCgpLCAuLi5hcmdzKSwgbmVnYXRlLCBsYWJlbCk7XG4gIH1cbiAgcmV0dXJuIG91dDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4cGVjdDxUPihhY3R1YWw6IFQsIGxhYmVsPzogc3RyaW5nKTogRXhwZWN0YXRpb24ge1xuICBjb25zdCBlID0gYnVpbGQoKCkgPT4gYWN0dWFsLCBmYWxzZSwgbGFiZWwsIGZhbHNlKSBhcyBFeHBlY3RhdGlvbjtcbiAgZS5ub3QgPSBidWlsZCgoKSA9PiBhY3R1YWwsIHRydWUsIGxhYmVsLCBmYWxzZSk7XG4gIGNvbnN0IHNldHRsZSA9ICh3YW50OiBcInJlc29sdmVcIiB8IFwicmVqZWN0XCIpID0+IGFzeW5jICgpID0+IHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdiA9IGF3YWl0IChhY3R1YWwgYXMgdW5rbm93biBhcyBQcm9taXNlPHVua25vd24+KTtcbiAgICAgIGlmICh3YW50ID09PSBcInJlamVjdFwiKSB0aHJvdyBuZXcgQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiBgJHtsYWJlbCA/IGxhYmVsICsgXCI6IFwiIDogXCJcIn1leHBlY3RlZCBhIHJlamVjdGlvbiwgZ290ICR7c2hvdyh2KX1gIH0pO1xuICAgICAgcmV0dXJuIHY7XG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBpZiAoZXJyIGluc3RhbmNlb2YgQXNzZXJ0aW9uRXJyb3IgJiYgd2FudCA9PT0gXCJyZWplY3RcIikgdGhyb3cgZXJyO1xuICAgICAgaWYgKHdhbnQgPT09IFwicmVzb2x2ZVwiKSB0aHJvdyBlcnI7XG4gICAgICByZXR1cm4gZXJyO1xuICAgIH1cbiAgfTtcbiAgZS5yZXNvbHZlcyA9IE9iamVjdC5hc3NpZ24oYnVpbGQoc2V0dGxlKFwicmVzb2x2ZVwiKSwgZmFsc2UsIGxhYmVsLCB0cnVlKSwgeyBub3Q6IGJ1aWxkKHNldHRsZShcInJlc29sdmVcIiksIHRydWUsIGxhYmVsLCB0cnVlKSB9KTtcbiAgZS5yZWplY3RzID0gT2JqZWN0LmFzc2lnbihidWlsZChzZXR0bGUoXCJyZWplY3RcIiksIGZhbHNlLCBsYWJlbCwgdHJ1ZSksIHsgbm90OiBidWlsZChzZXR0bGUoXCJyZWplY3RcIiksIHRydWUsIGxhYmVsLCB0cnVlKSB9KTtcbiAgcmV0dXJuIGU7XG59XG5cbmNvbnN0IGFzeW1tZXRyaWMgPSAobmFtZTogc3RyaW5nLCB0ZXN0OiAodjogdW5rbm93bikgPT4gYm9vbGVhbik6IEFzeW1tZXRyaWMgPT4gKHsgYXN5bW1ldHJpY01hdGNoOiB0ZXN0LCB0b1N0cmluZzogKCkgPT4gbmFtZSB9KTtcblxuZXhwZWN0LmNsb3NlVG8gPSAobjogbnVtYmVyLCBkaWdpdHMgPSAyKSA9PiBhc3ltbWV0cmljKGBjbG9zZVRvKCR7bn0sICR7ZGlnaXRzfSlgLCAodikgPT4gdHlwZW9mIHYgPT09IFwibnVtYmVyXCIgJiYgTWF0aC5hYnModiAtIG4pIDwgMTAgKiogLWRpZ2l0cyAvIDIpO1xuZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcgPSAobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IGFzeW1tZXRyaWMoYG9iamVjdENvbnRhaW5pbmcoJHtzaG93KG8pfSlgLCAodikgPT4gZXF1YWxzKHYsIG8sIHRydWUpKTtcbmV4cGVjdC5hcnJheUNvbnRhaW5pbmcgPSAoeHM6IHVua25vd25bXSkgPT4gYXN5bW1ldHJpYyhgYXJyYXlDb250YWluaW5nKCR7c2hvdyh4cyl9KWAsICh2KSA9PiBBcnJheS5pc0FycmF5KHYpICYmIHhzLmV2ZXJ5KCh4KSA9PiB2LnNvbWUoKHkpID0+IGVxdWFscyh5LCB4KSkpKTtcbmV4cGVjdC5zdHJpbmdDb250YWluaW5nID0gKHM6IHN0cmluZykgPT4gYXN5bW1ldHJpYyhgc3RyaW5nQ29udGFpbmluZygke3Nob3cocyl9KWAsICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiB2LmluY2x1ZGVzKHMpKTtcbmV4cGVjdC5zdHJpbmdNYXRjaGluZyA9IChyZTogUmVnRXhwIHwgc3RyaW5nKSA9PiBhc3ltbWV0cmljKGBzdHJpbmdNYXRjaGluZygke1N0cmluZyhyZSl9KWAsICh2KSA9PiB0eXBlb2YgdiA9PT0gXCJzdHJpbmdcIiAmJiAodHlwZW9mIHJlID09PSBcInN0cmluZ1wiID8gdi5pbmNsdWRlcyhyZSkgOiByZS50ZXN0KHYpKSk7XG5leHBlY3QuYW55ID0gKGNsczogdW5rbm93bikgPT4gYXN5bW1ldHJpYyhgYW55KCR7KGNscyBhcyB7IG5hbWU/OiBzdHJpbmcgfSk/Lm5hbWV9KWAsICh2KSA9PlxuICBjbHMgPT09IFN0cmluZyA/IHR5cGVvZiB2ID09PSBcInN0cmluZ1wiIDogY2xzID09PSBOdW1iZXIgPyB0eXBlb2YgdiA9PT0gXCJudW1iZXJcIiA6IGNscyA9PT0gQm9vbGVhbiA/IHR5cGVvZiB2ID09PSBcImJvb2xlYW5cIiA6IGNscyA9PT0gRnVuY3Rpb24gPyB0eXBlb2YgdiA9PT0gXCJmdW5jdGlvblwiIDogdiBpbnN0YW5jZW9mIChjbHMgYXMgbmV3ICgpID0+IHVua25vd24pKTtcbmV4cGVjdC5hbnl0aGluZyA9ICgpID0+IGFzeW1tZXRyaWMoXCJhbnl0aGluZygpXCIsICh2KSA9PiB2ICE9IG51bGwpO1xuXG4iLCAiLy8gVGhlIHNsaWNlIG9mIENsb3VkZmxhcmUgRDEncyBBUEkgdGhlIHdvcmtlciB1c2VzLCBvbiBOb2RlJ3MgYnVpbHQtaW4gU1FMaXRlIChub2RlOnNxbGl0ZSxcbi8vIE5vZGUgXHUyMjY1IDIyLjEzKS4gTGV0cyB0aGUgZXhhY3Qgc2FtZSB3b3JrZXIgY29kZSBydW4gb24gYW55IGJveCB3aXRoIE5vZGUgb3IgRG9ja2VyLlxuaW1wb3J0IHsgRGF0YWJhc2VTeW5jLCB0eXBlIFN0YXRlbWVudFN5bmMgfSBmcm9tIFwibm9kZTpzcWxpdGVcIjtcblxudHlwZSBSb3cgPSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuY2xhc3MgU3RtdCB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgZGI6IERhdGFiYXNlU3luYywgcmVhZG9ubHkgc3FsOiBzdHJpbmcsIHJlYWRvbmx5IGFyZ3M6IHVua25vd25bXSA9IFtdKSB7fVxuICBiaW5kKC4uLmFyZ3M6IHVua25vd25bXSkgeyByZXR1cm4gbmV3IFN0bXQodGhpcy5kYiwgdGhpcy5zcWwsIGFyZ3MpOyB9XG4gIHByaXZhdGUgc3QoKTogU3RhdGVtZW50U3luYyB7IHJldHVybiB0aGlzLmRiLnByZXBhcmUodGhpcy5zcWwpOyB9XG4gIHByaXZhdGUgYSgpIHsgcmV0dXJuIHRoaXMuYXJncy5tYXAoKHgpID0+ICh4ID09PSB1bmRlZmluZWQgPyBudWxsIDogdHlwZW9mIHggPT09IFwiYm9vbGVhblwiID8gTnVtYmVyKHgpIDogeCkpIGFzIG5ldmVyW107IH1cbiAgYXN5bmMgZmlyc3Q8VCA9IFJvdz4oY29sPzogc3RyaW5nKTogUHJvbWlzZTxUIHwgbnVsbD4ge1xuICAgIGNvbnN0IHIgPSB0aGlzLnN0KCkuZ2V0KC4uLnRoaXMuYSgpKSBhcyBSb3cgfCB1bmRlZmluZWQ7XG4gICAgaWYgKCFyKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gKGNvbCA/IHJbY29sXSA6IHIpIGFzIFQ7XG4gIH1cbiAgYXN5bmMgYWxsPFQgPSBSb3c+KCk6IFByb21pc2U8eyByZXN1bHRzOiBUW107IHN1Y2Nlc3M6IHRydWU7IG1ldGE6IG9iamVjdCB9PiB7XG4gICAgcmV0dXJuIHsgcmVzdWx0czogdGhpcy5zdCgpLmFsbCguLi50aGlzLmEoKSkgYXMgVFtdLCBzdWNjZXNzOiB0cnVlLCBtZXRhOiB7fSB9O1xuICB9XG4gIGFzeW5jIHJ1bigpOiBQcm9taXNlPHsgc3VjY2VzczogdHJ1ZTsgbWV0YTogeyBjaGFuZ2VzOiBudW1iZXI7IGxhc3Rfcm93X2lkOiBudW1iZXIgfSB9PiB7XG4gICAgY29uc3QgciA9IHRoaXMuc3QoKS5ydW4oLi4udGhpcy5hKCkpO1xuICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1ldGE6IHsgY2hhbmdlczogTnVtYmVyKHIuY2hhbmdlcyksIGxhc3Rfcm93X2lkOiBOdW1iZXIoci5sYXN0SW5zZXJ0Um93aWQpIH0gfTtcbiAgfVxuICAvKiogc3luY2hyb25vdXMgcnVuLCBmb3IgYmF0Y2ggKi9cbiAgX3J1bigpIHsgcmV0dXJuIHRoaXMuc3QoKS5ydW4oLi4udGhpcy5hKCkpOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBOb2RlRDEge1xuICBwcml2YXRlIGRiOiBEYXRhYmFzZVN5bmM7XG4gIGNvbnN0cnVjdG9yKGZpbGU6IHN0cmluZykge1xuICAgIHRoaXMuZGIgPSBuZXcgRGF0YWJhc2VTeW5jKGZpbGUpO1xuICAgIHRoaXMuZGIuZXhlYyhcIlBSQUdNQSBqb3VybmFsX21vZGUgPSBXQUw7IFBSQUdNQSBidXN5X3RpbWVvdXQgPSA1MDAwO1wiKTtcbiAgfVxuICBwcmVwYXJlKHNxbDogc3RyaW5nKSB7IHJldHVybiBuZXcgU3RtdCh0aGlzLmRiLCBzcWwpOyB9XG4gIC8qKiBhbGwtb3Itbm90aGluZywgbGlrZSBEMSAqL1xuICBhc3luYyBiYXRjaChzdG10czogU3RtdFtdKSB7XG4gICAgdGhpcy5kYi5leGVjKFwiQkVHSU5cIik7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IG91dCA9IHN0bXRzLm1hcCgocykgPT4geyBjb25zdCByID0gcy5fcnVuKCk7IHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1ldGE6IHsgY2hhbmdlczogTnVtYmVyKHIuY2hhbmdlcykgfSB9OyB9KTtcbiAgICAgIHRoaXMuZGIuZXhlYyhcIkNPTU1JVFwiKTtcbiAgICAgIHJldHVybiBvdXQ7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5kYi5leGVjKFwiUk9MTEJBQ0tcIik7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cbiAgfVxuICBhc3luYyBleGVjKHNxbDogc3RyaW5nKSB7IHRoaXMuZGIuZXhlYyhzcWwpOyByZXR1cm4geyBjb3VudDogMCwgZHVyYXRpb246IDAgfTsgfVxufVxuIiwgIi8vIEVkMjU1MTkgcmVxdWVzdCBzaWduaW5nIGJldHdlZW4gSXJvbnRlcm0gc2VydmVycyBhbmQgdGhlIGRpcmVjdG9yeSAoZG9jcy9zb2NpYWwvUFJPVE9DT0wubWQgXHUwMEE3MikuXG4vLyBXZWJDcnlwdG8gb25seSwgc28gdGhlIHNhbWUgY29kZSBydW5zIGluIFdvcmtlcnMsIE5vZGUgMjIgYW5kIHRoZSBkaXJlY3RvcnkuXG5cbmV4cG9ydCBjb25zdCBTS0VXX1MgPSAzMDA7XG5leHBvcnQgY29uc3QgU0lHX0hFQURFUiA9IFwiSXJvbnRlcm0tU2lnbmF0dXJlXCI7XG5cbmNvbnN0IGVuYyA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXG5leHBvcnQgZnVuY3Rpb24gYjY0dXJsKGI6IFVpbnQ4QXJyYXkgfCBBcnJheUJ1ZmZlcik6IHN0cmluZyB7XG4gIGNvbnN0IHUgPSBiIGluc3RhbmNlb2YgVWludDhBcnJheSA/IGIgOiBuZXcgVWludDhBcnJheShiKTtcbiAgbGV0IHMgPSBcIlwiO1xuICBmb3IgKGNvbnN0IHggb2YgdSkgcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHgpO1xuICByZXR1cm4gYnRvYShzKS5yZXBsYWNlKC9cXCsvZywgXCItXCIpLnJlcGxhY2UoL1xcLy9nLCBcIl9cIikucmVwbGFjZSgvPSskLywgXCJcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1bmI2NHVybChzOiBzdHJpbmcpOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB7XG4gIGNvbnN0IHQgPSBzLnJlcGxhY2UoLy0vZywgXCIrXCIpLnJlcGxhY2UoL18vZywgXCIvXCIpO1xuICBjb25zdCBiaW4gPSBhdG9iKHQgKyBcIj09PVwiLnNsaWNlKCh0Lmxlbmd0aCArIDMpICUgNCkpO1xuICBjb25zdCBvdXQgPSBuZXcgVWludDhBcnJheShuZXcgQXJyYXlCdWZmZXIoYmluLmxlbmd0aCkpO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGJpbi5sZW5ndGg7IGkrKykgb3V0W2ldID0gYmluLmNoYXJDb2RlQXQoaSk7XG4gIHJldHVybiBvdXQ7XG59XG5cbmV4cG9ydCBjb25zdCBoZXggPSAoYjogQXJyYXlCdWZmZXIgfCBVaW50OEFycmF5KSA9PiBbLi4uKGIgaW5zdGFuY2VvZiBVaW50OEFycmF5ID8gYiA6IG5ldyBVaW50OEFycmF5KGIpKV0ubWFwKCh4KSA9PiB4LnRvU3RyaW5nKDE2KS5wYWRTdGFydCgyLCBcIjBcIikpLmpvaW4oXCJcIik7XG5leHBvcnQgY29uc3Qgc2hhMjU2aGV4ID0gYXN5bmMgKGRhdGE6IHN0cmluZyB8IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+KSA9PiBoZXgoYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoXCJTSEEtMjU2XCIsIHR5cGVvZiBkYXRhID09PSBcInN0cmluZ1wiID8gZW5jLmVuY29kZShkYXRhKSA6IGRhdGEpKTtcblxuLyoqIEZyaWVuZC5pZDogZmlyc3QgMTIgaGV4IGNoYXJzIG9mIHNoYTI1NihzZXJ2ZXIgb3JpZ2luKS4gKi9cbmV4cG9ydCBjb25zdCBmcmllbmRJZCA9IGFzeW5jIChvcmlnaW46IHN0cmluZykgPT4gKGF3YWl0IHNoYTI1NmhleChvcmlnaW4pKS5zbGljZSgwLCAxMik7XG5cbi8qKiBIdW1hbi1jaGVja2FibGUga2V5IGZpbmdlcnByaW50OiBmaXJzdCAxNiBoZXggY2hhcnMgb2Ygc2hhMjU2KHJhdyBrZXkpLCBpbiBncm91cHMgb2YgNC4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmaW5nZXJwcmludChwdWJsaWNLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGxldCByYXc6IFVpbnQ4QXJyYXk8QXJyYXlCdWZmZXI+O1xuICB0cnkgeyByYXcgPSB1bmI2NHVybChwdWJsaWNLZXkpOyB9IGNhdGNoIHsgcmV0dXJuIFwiXCI7IH1cbiAgcmV0dXJuIChhd2FpdCBzaGEyNTZoZXgocmF3KSkuc2xpY2UoMCwgMTYpLm1hdGNoKC8uezR9L2cpIS5qb2luKFwiLVwiKTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBLZXlQYWlyIHsgcHVibGljS2V5OiBzdHJpbmc7IHByaXZhdGVKd2s6IEpzb25XZWJLZXkgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VuZXJhdGVLZXlQYWlyKCk6IFByb21pc2U8S2V5UGFpcj4ge1xuICBjb25zdCBrcCA9IChhd2FpdCBjcnlwdG8uc3VidGxlLmdlbmVyYXRlS2V5KHsgbmFtZTogXCJFZDI1NTE5XCIgfSwgdHJ1ZSwgW1wic2lnblwiLCBcInZlcmlmeVwiXSkpIGFzIENyeXB0b0tleVBhaXI7XG4gIGNvbnN0IHJhdyA9IChhd2FpdCBjcnlwdG8uc3VidGxlLmV4cG9ydEtleShcInJhd1wiLCBrcC5wdWJsaWNLZXkpKSBhcyBBcnJheUJ1ZmZlcjtcbiAgY29uc3QgandrID0gKGF3YWl0IGNyeXB0by5zdWJ0bGUuZXhwb3J0S2V5KFwiandrXCIsIGtwLnByaXZhdGVLZXkpKSBhcyBKc29uV2ViS2V5O1xuICByZXR1cm4geyBwdWJsaWNLZXk6IGI2NHVybChyYXcpLCBwcml2YXRlSndrOiBqd2sgfTtcbn1cblxuZXhwb3J0IGNvbnN0IGltcG9ydFByaXZhdGUgPSAoandrOiBKc29uV2ViS2V5KSA9PiBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcImp3a1wiLCBqd2ssIHsgbmFtZTogXCJFZDI1NTE5XCIgfSwgZmFsc2UsIFtcInNpZ25cIl0pO1xuXG4vKiogXCJodHRwczovL2EuZXhhbXBsZVwiIGZyb20gYW55dGhpbmcgVVJMLXNoYXBlZDsgbnVsbCB3aGVuIGl0IGlzbid0IGFuIGh0dHAocykgb3JpZ2luLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1PcmlnaW4oczogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgYWxsb3dIdHRwOiBib29sZWFuKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghcyB8fCB0eXBlb2YgcyAhPT0gXCJzdHJpbmdcIiB8fCBzLmxlbmd0aCA+IDMwMCkgcmV0dXJuIG51bGw7XG4gIGxldCB1OiBVUkw7XG4gIHRyeSB7IHUgPSBuZXcgVVJMKHMuaW5jbHVkZXMoXCI6Ly9cIikgPyBzIDogYGh0dHBzOi8vJHtzfWApOyB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cbiAgaWYgKHUucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIgJiYgIShhbGxvd0h0dHAgJiYgdS5wcm90b2NvbCA9PT0gXCJodHRwOlwiKSkgcmV0dXJuIG51bGw7XG4gIGlmICh1LnVzZXJuYW1lIHx8IHUucGFzc3dvcmQpIHJldHVybiBudWxsO1xuICByZXR1cm4gdS5vcmlnaW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaWduaW5nU3RyaW5nKG1ldGhvZDogc3RyaW5nLCBwYXRoQW5kUXVlcnk6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcsIHRzOiBudW1iZXIgfCBzdHJpbmcsIGJvZHlIYXNoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gW1wiaXJvbnRlcm0tdjFcIiwgbWV0aG9kLnRvVXBwZXJDYXNlKCksIHBhdGhBbmRRdWVyeSwgdGFyZ2V0LCBTdHJpbmcodHMpLCBib2R5SGFzaF0uam9pbihcIlxcblwiKTtcbn1cblxuLyoqIEhlYWRlciB2YWx1ZSBmb3IgYSByZXF1ZXN0IGZyb20gYHNlcnZlcmAgdG8gYHVybGAuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2lnblJlcXVlc3Qob3B0czogeyBrZXk6IENyeXB0b0tleTsgc2VydmVyOiBzdHJpbmc7IG1ldGhvZDogc3RyaW5nOyB1cmw6IHN0cmluZzsgYm9keT86IHN0cmluZzsgbm93PzogbnVtYmVyIH0pOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCB1ID0gbmV3IFVSTChvcHRzLnVybCk7XG4gIGNvbnN0IHRzID0gTWF0aC5mbG9vcigob3B0cy5ub3cgPz8gRGF0ZS5ub3coKSkgLyAxMDAwKTtcbiAgY29uc3QgbXNnID0gc2lnbmluZ1N0cmluZyhvcHRzLm1ldGhvZCwgdS5wYXRobmFtZSArIHUuc2VhcmNoLCB1Lm9yaWdpbiwgdHMsIGF3YWl0IHNoYTI1NmhleChvcHRzLmJvZHkgPz8gXCJcIikpO1xuICBjb25zdCBzaWcgPSBhd2FpdCBjcnlwdG8uc3VidGxlLnNpZ24oeyBuYW1lOiBcIkVkMjU1MTlcIiB9LCBvcHRzLmtleSwgZW5jLmVuY29kZShtc2cpKTtcbiAgcmV0dXJuIGBzZXJ2ZXI9XCIke29wdHMuc2VydmVyfVwiLCB0cz1cIiR7dHN9XCIsIHNpZz1cIiR7YjY0dXJsKHNpZyl9XCJgO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFBhcnNlZFNpZyB7IHNlcnZlcjogc3RyaW5nOyB0czogbnVtYmVyOyBzaWc6IHN0cmluZyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNpZ0hlYWRlcihoOiBzdHJpbmcgfCBudWxsKTogUGFyc2VkU2lnIHwgbnVsbCB7XG4gIGlmICghaCB8fCBoLmxlbmd0aCA+IDEwMDApIHJldHVybiBudWxsO1xuICBjb25zdCBvdXQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgZm9yIChjb25zdCBtIG9mIGgubWF0Y2hBbGwoLyhcXHcrKT1cIihbXlwiXSopXCIvZykpIG91dFttWzFdXSA9IG1bMl07XG4gIGlmICghb3V0LnNlcnZlciB8fCAhb3V0LnRzIHx8ICFvdXQuc2lnIHx8ICEvXlxcZHsxLDEyfSQvLnRlc3Qob3V0LnRzKSkgcmV0dXJuIG51bGw7XG4gIHJldHVybiB7IHNlcnZlcjogb3V0LnNlcnZlciwgdHM6IE51bWJlcihvdXQudHMpLCBzaWc6IG91dC5zaWcgfTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeVNpZyhwdWJsaWNLZXk6IHN0cmluZywgbXNnOiBzdHJpbmcsIHNpZzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIHRyeSB7XG4gICAgY29uc3Qga2V5ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5pbXBvcnRLZXkoXCJyYXdcIiwgdW5iNjR1cmwocHVibGljS2V5KSwgeyBuYW1lOiBcIkVkMjU1MTlcIiB9LCBmYWxzZSwgW1widmVyaWZ5XCJdKTtcbiAgICByZXR1cm4gYXdhaXQgY3J5cHRvLnN1YnRsZS52ZXJpZnkoeyBuYW1lOiBcIkVkMjU1MTlcIiB9LCBrZXksIHVuYjY0dXJsKHNpZyksIGVuYy5lbmNvZGUobXNnKSk7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4vKipcbiAqIENoZWNrcyBldmVyeXRoaW5nIGJ1dCB0aGUga2V5OiBoZWFkZXIgc2hhcGUsIGNsb2NrIHNrZXcgYW5kIHRhcmdldCBvcmlnaW4uIGBzZWxmYCBpcyB0aGVcbiAqIHJlY2VpdmVyJ3MgY2Fub25pY2FsIG9yaWdpbi4gUmV0dXJucyB0aGUgY2xhaW1lZCBzZW5kZXIgc28gdGhlIGNhbGxlciBjYW4gcGljayBhIGtleSwgdGhlbiBjYWxsXG4gKiBgdmVyaWZ5UmVxdWVzdGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVjaGVjayhyZXE6IFJlcXVlc3QsIHNlbGY6IHN0cmluZywgYWxsb3dIdHRwOiBib29sZWFuLCBub3cgPSBEYXRlLm5vdygpKTogeyBvazogdHJ1ZTsgcGFyc2VkOiBQYXJzZWRTaWc7IHNlcnZlcjogc3RyaW5nIH0gfCB7IG9rOiBmYWxzZTsgc3RhdHVzOiA0MDE7IGVycm9yOiBzdHJpbmcgfSB7XG4gIGNvbnN0IHAgPSBwYXJzZVNpZ0hlYWRlcihyZXEuaGVhZGVycy5nZXQoU0lHX0hFQURFUikpO1xuICBpZiAoIXApIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDEsIGVycm9yOiBcIm1pc3Npbmcgb3IgbWFsZm9ybWVkIHNpZ25hdHVyZVwiIH07XG4gIGNvbnN0IHNlcnZlciA9IG5vcm1PcmlnaW4ocC5zZXJ2ZXIsIGFsbG93SHR0cCk7XG4gIGlmICghc2VydmVyIHx8IHNlcnZlciAhPT0gcC5zZXJ2ZXIpIHJldHVybiB7IG9rOiBmYWxzZSwgc3RhdHVzOiA0MDEsIGVycm9yOiBcImJhZCBzZW5kZXIgb3JpZ2luXCIgfTtcbiAgaWYgKE1hdGguYWJzKG5vdyAvIDEwMDAgLSBwLnRzKSA+IFNLRVdfUykgcmV0dXJuIHsgb2s6IGZhbHNlLCBzdGF0dXM6IDQwMSwgZXJyb3I6IFwidGltZXN0YW1wIG91dHNpZGUgdGhlIGFsbG93ZWQgd2luZG93XCIgfTtcbiAgcmV0dXJuIHsgb2s6IHRydWUsIHBhcnNlZDogcCwgc2VydmVyIH07XG59XG5cbi8qKiBGdWxsIGNoZWNrIHdpdGggdGhlIHNlbmRlcidzIGtleS4gYHJhd0JvZHlgIGlzIHRoZSBleGFjdCBib2R5IHRleHQgKFwiXCIgZm9yIG5vbmUpLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHZlcmlmeVJlcXVlc3QocmVxOiBSZXF1ZXN0LCByYXdCb2R5OiBzdHJpbmcsIHNlbGY6IHN0cmluZywgcHVibGljS2V5OiBzdHJpbmcsIHBhcnNlZDogUGFyc2VkU2lnKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IHUgPSBuZXcgVVJMKHJlcS51cmwpO1xuICBjb25zdCBtc2cgPSBzaWduaW5nU3RyaW5nKHJlcS5tZXRob2QsIHUucGF0aG5hbWUgKyB1LnNlYXJjaCwgc2VsZiwgcGFyc2VkLnRzLCBhd2FpdCBzaGEyNTZoZXgocmF3Qm9keSkpO1xuICByZXR1cm4gdmVyaWZ5U2lnKHB1YmxpY0tleSwgbXNnLCBwYXJzZWQuc2lnKTtcbn1cbiIsICIvLyBPdXRnb2luZyBjYWxsczogb3RoZXIgc2VydmVycycgLndlbGwta25vd24sIHNpZ25lZCByZXF1ZXN0cywgdGhlIGRpcmVjdG9yeS5cblxuaW1wb3J0IHsgaWRlbnRpdHkgfSBmcm9tIFwiLi9kYlwiO1xuaW1wb3J0IHsgbm9ybU9yaWdpbiwgU0lHX0hFQURFUiwgc2lnblJlcXVlc3QgfSBmcm9tIFwiLi9zaWduXCI7XG5pbXBvcnQgdHlwZSB7IFdlbGxLbm93biB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCBjb25zdCBUSU1FT1VUX01TID0gNDAwMDtcbi8qKiBMYXJnZXN0IHBlZXIgcmVzcG9uc2Ugd2UnbGwgcmVhZDogYSAxMDAtaXRlbSBmZWVkIHBhZ2Ugb3IgYSBwcm9maWxlIGlzIHdlbGwgdW5kZXIgMTAwIEtCLiAqL1xuZXhwb3J0IGNvbnN0IE1BWF9SRVNQT05TRSA9IDFfMDAwXzAwMDtcbi8qKiAud2VsbC1rbm93biwgZGlyZWN0b3J5IGxvb2t1cHMgYW5kIGVycm9yIGJvZGllcyAqL1xuZXhwb3J0IGNvbnN0IE1BWF9TTUFMTCA9IDY0XzAwMDtcblxuLy8gVGhlIGZldGNoIHVzZWQgZm9yIGV2ZXJ5IHBlZXIgYW5kIGRpcmVjdG9yeSBjYWxsLiBUaGUgc2VsZi1ob3N0ZWQgc2VydmVyIHN3YXBzIGluIG9uZSB0aGF0XG4vLyByZWZ1c2VzIHByaXZhdGUgYWRkcmVzc2VzIChzZXJ2ZXIvcGVlcmZldGNoLnRzKTsgV29ya2VycyBjYW4ndCByZWFjaCBwcml2YXRlIG5ldHdvcmtzIGFueXdheS5cbmxldCBwZWVyRmV0Y2hJbXBsOiB0eXBlb2YgZmV0Y2ggfCBudWxsID0gbnVsbDtcbmV4cG9ydCBmdW5jdGlvbiBzZXRQZWVyRmV0Y2goZjogdHlwZW9mIGZldGNoIHwgbnVsbCkgeyBwZWVyRmV0Y2hJbXBsID0gZjsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIFNvY2lhbEVudiB7XG4gIERCOiBEMURhdGFiYXNlO1xuICAvKiogZGlyZWN0b3J5IGJhc2UgVVJMLCBlLmcuIGh0dHBzOi8vZGlyZWN0b3J5LmV4YW1wbGUuY29tIChubyBidWlsdC1pbiBkZWZhdWx0KSAqL1xuICBTT0NJQUxfRElSRUNUT1JZPzogc3RyaW5nO1xuICAvKiogXCIxXCI6IGFsbG93IGh0dHA6Ly8gb3JpZ2lucyAobG9jYWwgdGVzdGluZyBvbmx5KSAqL1xuICBTT0NJQUxfQUxMT1dfSFRUUD86IHN0cmluZztcbiAgLyoqIGNhbm9uaWNhbCBvcmlnaW4gb3ZlcnJpZGUgd2hlbiB0aGUgcmVxdWVzdCBVUkwgaXNuJ3QgdGhlIHB1YmxpYyBvbmUgKi9cbiAgU09DSUFMX09SSUdJTj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGFsbG93SHR0cCA9IChlbnY6IFNvY2lhbEVudikgPT4gZW52LlNPQ0lBTF9BTExPV19IVFRQID09PSBcIjFcIiB8fCBlbnYuU09DSUFMX0FMTE9XX0hUVFAgPT09IFwidHJ1ZVwiO1xuZXhwb3J0IGNvbnN0IGRpcmVjdG9yeU9mID0gKGVudjogU29jaWFsRW52KSA9PiAoZW52LlNPQ0lBTF9ESVJFQ1RPUlkgPyBub3JtT3JpZ2luKGVudi5TT0NJQUxfRElSRUNUT1JZLCBhbGxvd0h0dHAoZW52KSkgPz8gZW52LlNPQ0lBTF9ESVJFQ1RPUlkucmVwbGFjZSgvXFwvKyQvLCBcIlwiKSA6IG51bGwpO1xuXG5leHBvcnQgY2xhc3MgUGVlckVycm9yIGV4dGVuZHMgRXJyb3Ige1xuICBjb25zdHJ1Y3Rvcihtc2c6IHN0cmluZywgcHVibGljIHN0YXR1cyA9IDUwMikgeyBzdXBlcihtc2cpOyB9XG59XG5cbi8qKiBmZXRjaCB3aXRoIGEgaGFyZCBkZWFkbGluZSAoYWxzbyB3aGVuIHRoZSB1bmRlcmx5aW5nIGZldGNoIGlnbm9yZXMgdGhlIGFib3J0IHNpZ25hbCkuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdGltZWRGZXRjaCh1cmw6IHN0cmluZywgaW5pdDogUmVxdWVzdEluaXQgPSB7fSwgbXMgPSBUSU1FT1VUX01TKTogUHJvbWlzZTxSZXNwb25zZT4ge1xuICBjb25zdCBhYyA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgbGV0IHRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcbiAgY29uc3QgZGVhZGxpbmUgPSBuZXcgUHJvbWlzZTxuZXZlcj4oKF8sIHJlaikgPT4geyB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBhYy5hYm9ydCgpOyByZWoobmV3IFBlZXJFcnJvcihgdGltZWQgb3V0IGFmdGVyICR7bXMgLyAxMDAwfXNgLCA1MDQpKTsgfSwgbXMpOyB9KTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgUHJvbWlzZS5yYWNlKFsocGVlckZldGNoSW1wbCA/PyBmZXRjaCkodXJsLCB7IC4uLmluaXQsIHNpZ25hbDogYWMuc2lnbmFsLCByZWRpcmVjdDogXCJtYW51YWxcIiB9KSwgZGVhZGxpbmVdKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBjbGVhclRpbWVvdXQodGltZXIpO1xuICB9XG59XG5cbi8qKiBCb2R5IHRleHQgb2YgYSByZXNwb25zZSAob3IgcmVxdWVzdCksIHJlZnVzaW5nIHRvIHJlYWQgcGFzdCBgbWF4YCBieXRlcyB3aGF0ZXZlciBDb250ZW50LUxlbmd0aCBjbGFpbXMuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZExpbWl0ZWQocjogUGljazxSZXNwb25zZSwgXCJoZWFkZXJzXCIgfCBcImJvZHlcIj4sIG1heCA9IE1BWF9SRVNQT05TRSk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGlmIChOdW1iZXIoci5oZWFkZXJzLmdldChcImNvbnRlbnQtbGVuZ3RoXCIpID8/IDApID4gbWF4KSB7IGF3YWl0IHIuYm9keT8uY2FuY2VsKCkuY2F0Y2goKCkgPT4ge30pOyB0aHJvdyBuZXcgUGVlckVycm9yKFwicmVzcG9uc2UgdG9vIGxhcmdlXCIpOyB9XG4gIGlmICghci5ib2R5KSByZXR1cm4gXCJcIjtcbiAgY29uc3QgcmVhZGVyID0gci5ib2R5LmdldFJlYWRlcigpO1xuICBjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuICBsZXQgbiA9IDA7XG4gIGZvciAoOzspIHtcbiAgICBjb25zdCB7IGRvbmUsIHZhbHVlIH0gPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuICAgIGlmIChkb25lKSBicmVhaztcbiAgICBuICs9IHZhbHVlLmJ5dGVMZW5ndGg7XG4gICAgaWYgKG4gPiBtYXgpIHsgYXdhaXQgcmVhZGVyLmNhbmNlbCgpLmNhdGNoKCgpID0+IHt9KTsgdGhyb3cgbmV3IFBlZXJFcnJvcihcInJlc3BvbnNlIHRvbyBsYXJnZVwiKTsgfVxuICAgIGNodW5rcy5wdXNoKHZhbHVlKTtcbiAgfVxuICBjb25zdCBhbGwgPSBuZXcgVWludDhBcnJheShuKTtcbiAgbGV0IGF0ID0gMDtcbiAgZm9yIChjb25zdCBjIG9mIGNodW5rcykgeyBhbGwuc2V0KGMsIGF0KTsgYXQgKz0gYy5ieXRlTGVuZ3RoOyB9XG4gIHJldHVybiBuZXcgVGV4dERlY29kZXIoKS5kZWNvZGUoYWxsKTtcbn1cblxuLyoqIEpTT04gYm9keSB3aXRoaW4gYG1heGAgYnl0ZXM7IG51bGwgd2hlbiBpdCdzIHRvbyBsYXJnZSBvciBub3QgSlNPTi4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwZWVySnNvbjxUPihyOiBSZXNwb25zZSwgbWF4ID0gTUFYX1JFU1BPTlNFKTogUHJvbWlzZTxUIHwgbnVsbD4ge1xuICB0cnkgeyByZXR1cm4gSlNPTi5wYXJzZShhd2FpdCByZWFkTGltaXRlZChyLCBtYXgpKSBhcyBUOyB9IGNhdGNoIHsgcmV0dXJuIG51bGw7IH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoV2VsbEtub3duKG9yaWdpbjogc3RyaW5nKTogUHJvbWlzZTxXZWxsS25vd24+IHtcbiAgbGV0IHI6IFJlc3BvbnNlO1xuICB0cnkgeyByID0gYXdhaXQgdGltZWRGZXRjaChgJHtvcmlnaW59Ly53ZWxsLWtub3duL2lyb250ZXJtYCwgeyBoZWFkZXJzOiB7IGFjY2VwdDogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSB9KTsgfVxuICBjYXRjaCAoZSkgeyB0aHJvdyBlIGluc3RhbmNlb2YgUGVlckVycm9yID8gZSA6IG5ldyBQZWVyRXJyb3IoYGNvdWxkbid0IHJlYWNoICR7b3JpZ2lufWApOyB9XG4gIGlmICghci5vaykgdGhyb3cgbmV3IFBlZXJFcnJvcihgJHtvcmlnaW59IGlzbid0IGFuIElyb250ZXJtIHNlcnZlciAoJHtyLnN0YXR1c30pYCk7XG4gIGNvbnN0IHcgPSBhd2FpdCBwZWVySnNvbjxXZWxsS25vd24+KHIsIE1BWF9TTUFMTCk7XG4gIGlmICghdyB8fCB3LnNvZnR3YXJlICE9PSBcImlyb250ZXJtXCIgfHwgdHlwZW9mIHcucHVibGljS2V5ICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgUGVlckVycm9yKGAke29yaWdpbn0gaXNuJ3QgYW4gSXJvbnRlcm0gc2VydmVyYCk7XG4gIGlmICh3LnNlcnZlciAhPT0gb3JpZ2luKSB0aHJvdyBuZXcgUGVlckVycm9yKGAke29yaWdpbn0gc2F5cyBpdHMgYWRkcmVzcyBpcyAke3cuc2VydmVyfWApO1xuICByZXR1cm4gdztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaXJlY3RvcnlVc2VyIHsgaGFuZGxlOiBzdHJpbmc7IG5hbWU6IHN0cmluZyB8IG51bGw7IHNlcnZlcjogc3RyaW5nOyBwdWJsaWNLZXk6IHN0cmluZzsgdXBkYXRlZEF0OiBzdHJpbmcgfVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGlyZWN0b3J5VXNlcihkaXJlY3Rvcnk6IHN0cmluZywgaGFuZGxlOiBzdHJpbmcpOiBQcm9taXNlPERpcmVjdG9yeVVzZXIgfCBudWxsPiB7XG4gIGxldCByOiBSZXNwb25zZTtcbiAgdHJ5IHsgciA9IGF3YWl0IHRpbWVkRmV0Y2goYCR7ZGlyZWN0b3J5fS92MS91c2Vycy8ke2VuY29kZVVSSUNvbXBvbmVudChoYW5kbGUpfWApOyB9XG4gIGNhdGNoIHsgdGhyb3cgbmV3IFBlZXJFcnJvcihcImNvdWxkbid0IHJlYWNoIHRoZSBkaXJlY3RvcnlcIik7IH1cbiAgaWYgKHIuc3RhdHVzID09PSA0MDQpIHJldHVybiBudWxsO1xuICBpZiAoIXIub2spIHRocm93IG5ldyBQZWVyRXJyb3IoYGRpcmVjdG9yeSBlcnJvciAoJHtyLnN0YXR1c30pYCk7XG4gIGNvbnN0IHUgPSBhd2FpdCBwZWVySnNvbjxEaXJlY3RvcnlVc2VyPihyLCBNQVhfU01BTEwpO1xuICBpZiAoIXUgfHwgdHlwZW9mIHUuc2VydmVyICE9PSBcInN0cmluZ1wiIHx8IHR5cGVvZiB1LnB1YmxpY0tleSAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IFBlZXJFcnJvcihcImJhZCBkaXJlY3RvcnkgcmVzcG9uc2VcIik7XG4gIHJldHVybiB1O1xufVxuXG4vKiogQSByZXF1ZXN0IHNpZ25lZCB3aXRoIHRoaXMgc2VydmVyJ3Mga2V5LiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNpZ25lZEZldGNoKGRiOiBEMURhdGFiYXNlLCBzZWxmOiBzdHJpbmcsIHVybDogc3RyaW5nLCBtZXRob2QgPSBcIkdFVFwiLCBib2R5PzogdW5rbm93bik6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgY29uc3QgeyBrZXkgfSA9IGF3YWl0IGlkZW50aXR5KGRiKTtcbiAgY29uc3QgdGV4dCA9IGJvZHkgPT09IHVuZGVmaW5lZCA/IFwiXCIgOiBKU09OLnN0cmluZ2lmeShib2R5KTtcbiAgY29uc3Qgc2lnID0gYXdhaXQgc2lnblJlcXVlc3QoeyBrZXksIHNlcnZlcjogc2VsZiwgbWV0aG9kLCB1cmwsIGJvZHk6IHRleHQgfSk7XG4gIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IFtTSUdfSEVBREVSXTogc2lnLCBhY2NlcHQ6IFwiYXBwbGljYXRpb24vanNvblwiIH07XG4gIGlmIChib2R5ICE9PSB1bmRlZmluZWQpIGhlYWRlcnNbXCJjb250ZW50LXR5cGVcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIjtcbiAgdHJ5IHtcbiAgICByZXR1cm4gYXdhaXQgdGltZWRGZXRjaCh1cmwsIHsgbWV0aG9kLCBoZWFkZXJzLCBib2R5OiBib2R5ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB0ZXh0IH0pO1xuICB9IGNhdGNoIChlKSB7XG4gICAgdGhyb3cgZSBpbnN0YW5jZW9mIFBlZXJFcnJvciA/IGUgOiBuZXcgUGVlckVycm9yKGBjb3VsZG4ndCByZWFjaCAke25ldyBVUkwodXJsKS5vcmlnaW59YCk7XG4gIH1cbn1cbiIsICIvLyBXaXJlIHR5cGVzIGZvciBzb2NpYWwgKGRvY3Mvc29jaWFsL1BST1RPQ09MLm1kKS4gU2hhcmVkIGJ5IHRoZSB3b3JrZXIsIHRoZSB3ZWIgVUkgYW5kIHRlc3RzLlxuXG5leHBvcnQgdHlwZSBTaGFyZSA9IFwiYmFzaWNcIiB8IFwibGlmdHNcIiB8IFwiZnVsbFwiO1xuZXhwb3J0IGNvbnN0IFNIQVJFUzogcmVhZG9ubHkgU2hhcmVbXSA9IFtcImJhc2ljXCIsIFwibGlmdHNcIiwgXCJmdWxsXCJdO1xuZXhwb3J0IGNvbnN0IGlzU2hhcmUgPSAoeDogdW5rbm93bik6IHggaXMgU2hhcmUgPT4gdHlwZW9mIHggPT09IFwic3RyaW5nXCIgJiYgKFNIQVJFUyBhcyByZWFkb25seSBzdHJpbmdbXSkuaW5jbHVkZXMoeCk7XG5leHBvcnQgY29uc3QgYXRMZWFzdCA9IChzOiBTaGFyZSwgbWluOiBTaGFyZSkgPT4gU0hBUkVTLmluZGV4T2YocykgPj0gU0hBUkVTLmluZGV4T2YobWluKTtcblxuZXhwb3J0IGNvbnN0IEVNT0pJID0gW1wiXHVEODNEXHVEQ0FBXCIsIFwiXHVEODNEXHVERDI1XCIsIFwiXHVEODNEXHVEQzRGXCIsIFwiXHVEODNDXHVERkM2XCIsIFwiXHVEODNEXHVERTI0XCJdIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IEhBTkRMRV9SRSA9IC9eW2EtejAtOV1bYS16MC05Xy1dezEsMjl9JC87XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2VsbEtub3duIHtcbiAgdjogMTsgc2VydmVyOiBzdHJpbmc7IGhhbmRsZTogc3RyaW5nIHwgbnVsbDsgbmFtZTogc3RyaW5nIHwgbnVsbDsgcHVibGljS2V5OiBzdHJpbmc7IGRpcmVjdG9yeTogc3RyaW5nIHwgbnVsbDsgc29mdHdhcmU6IFwiaXJvbnRlcm1cIjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTb2NpYWxQcm9maWxlIHtcbiAgc2VydmVyOiBzdHJpbmc7IGhhbmRsZTogc3RyaW5nIHwgbnVsbDsgbmFtZTogc3RyaW5nIHwgbnVsbDsgc2hhcmU6IFNoYXJlO1xuICB1bml0OiBcImtnXCIgfCBcImxiXCIgfCBudWxsO1xuICBzdHJlYWs6IHsgY3VycmVudDogbnVtYmVyOyBiZXN0OiBudW1iZXIgfTtcbiAgd2VlazogeyBkb25lOiBudW1iZXI7IHRhcmdldDogbnVtYmVyIH07XG4gIHNlc3Npb25zNTI6IG51bWJlcjtcbiAgZ3JhcGg6IHsgc3RhcnQ6IHN0cmluZzsgbGV2ZWxzOiBudW1iZXJbXSB9O1xuICBsaWZ0czogeyBrZXk6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBlMXJtOiBudW1iZXIgfCBudWxsOyBiZXN0OiBudW1iZXIgfCBudWxsIH1bXTtcbiAgYm9keXdlaWdodDogbnVtYmVyIHwgbnVsbDtcbiAgcHJvZ3JhbTogc3RyaW5nIHwgbnVsbDtcbiAgdXBkYXRlZEF0OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVhY3Rpb25zIHsgZW1vamk6IHN0cmluZzsgZnJvbTogeyBzZXJ2ZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nIHwgbnVsbCB9W10gfVxuZXhwb3J0IGludGVyZmFjZSBDb21tZW50IHsgaWQ6IHN0cmluZzsgZnJvbTogeyBzZXJ2ZXI6IHN0cmluZzsgbmFtZTogc3RyaW5nIHwgbnVsbCB9OyB0ZXh0OiBzdHJpbmc7IGF0OiBzdHJpbmcgfVxuXG5pbnRlcmZhY2UgSXRlbUJhc2UgeyBpZDogc3RyaW5nOyBhdDogc3RyaW5nOyByZWFjdGlvbnM6IFJlYWN0aW9uc1tdOyBjb21tZW50czogQ29tbWVudFtdIH1cbmV4cG9ydCBpbnRlcmZhY2UgU2Vzc2lvbkl0ZW0gZXh0ZW5kcyBJdGVtQmFzZSB7XG4gIGtpbmQ6IFwic2Vzc2lvblwiOyB0aXRsZTogc3RyaW5nOyBkdXJhdGlvbk1pbjogbnVtYmVyOyBzZXRzOiBudW1iZXI7XG4gIGV4ZXJjaXNlczogeyBuYW1lOiBzdHJpbmc7IGxpZnQ6IHN0cmluZyB8IG51bGw7IHRvcD86IHsgd2VpZ2h0OiBudW1iZXI7IHJlcHM6IG51bWJlciB9IHwgbnVsbDsgc2V0cz86IHsgd2VpZ2h0OiBudW1iZXIgfCBudWxsOyByZXBzOiBudW1iZXIgfCBudWxsIH1bXSB9W107XG4gIHZvbHVtZT86IG51bWJlcjsgbm90ZT86IHN0cmluZztcbn1cbmV4cG9ydCBpbnRlcmZhY2UgUHJJdGVtIGV4dGVuZHMgSXRlbUJhc2UgeyBraW5kOiBcInByXCI7IGxpZnQ6IHN0cmluZzsgbGlmdE5hbWU6IHN0cmluZzsgcHJLaW5kOiBzdHJpbmc7IHJlcHM6IG51bWJlcjsgd2VpZ2h0PzogbnVtYmVyOyBwcmV2PzogbnVtYmVyIHwgbnVsbCB9XG5leHBvcnQgaW50ZXJmYWNlIEFjaGlldmVtZW50SXRlbSBleHRlbmRzIEl0ZW1CYXNlIHsga2luZDogXCJhY2hpZXZlbWVudFwiOyB0aXRsZTogc3RyaW5nOyB0aWVyOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfVxuZXhwb3J0IHR5cGUgRmVlZEl0ZW0gPSBTZXNzaW9uSXRlbSB8IFBySXRlbSB8IEFjaGlldmVtZW50SXRlbTtcblxuLyoqIGB1bml0YDogdGhlIHdlaWdodHMnIHVuaXQgKG51bGwgYXQgYmFzaWMsIHdoZXJlIHRoZXJlIGFyZSBub25lKSAqL1xuZXhwb3J0IGludGVyZmFjZSBGZWVkUGFnZSB7IGl0ZW1zOiBGZWVkSXRlbVtdOyBuZXh0OiBzdHJpbmcgfCBudWxsOyBzaGFyZTogU2hhcmU7IHVuaXQ6IFwia2dcIiB8IFwibGJcIiB8IG51bGwgfVxuXG5leHBvcnQgaW50ZXJmYWNlIEF1dGhvciB7IGlkOiBzdHJpbmc7IHNlcnZlcjogc3RyaW5nOyBoYW5kbGU6IHN0cmluZyB8IG51bGw7IG5hbWU6IHN0cmluZyB8IG51bGwgfVxuZXhwb3J0IGludGVyZmFjZSBGcmllbmQgZXh0ZW5kcyBBdXRob3Ige1xuICBzdGF0dXM6IFwiZnJpZW5kc1wiIHwgXCJvdXRnb2luZ1wiIHwgXCJpbmNvbWluZ1wiO1xuICBzaGFyZTogU2hhcmU7XG4gIHRoZWlyU2hhcmU6IFNoYXJlIHwgbnVsbDtcbiAgc2luY2U6IHN0cmluZzsgbGFzdFNlZW46IHN0cmluZyB8IG51bGw7IGZpbmdlcnByaW50OiBzdHJpbmc7IG5vdGU/OiBzdHJpbmcgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbXBhcmUge1xuICBmcmllbmQ6IEF1dGhvcjsgdW5pdDogXCJrZ1wiIHwgXCJsYlwiO1xuICBsaWZ0czogeyBrZXk6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBtZTogbnVtYmVyIHwgbnVsbDsgdGhlbTogbnVtYmVyIHwgbnVsbDsgbWVCdz86IG51bWJlciB8IG51bGw7IHRoZW1Cdz86IG51bWJlciB8IG51bGwgfVtdO1xuICB3ZWVrczogeyB3ZWVrOiBzdHJpbmc7IG1lOiBudW1iZXI7IHRoZW06IG51bWJlciB9W107XG4gIHN0cmVhazogeyBtZTogbnVtYmVyOyB0aGVtOiBudW1iZXIgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RpZmljYXRpb24ge1xuICBpZDogc3RyaW5nOyBraW5kOiBcInJlcXVlc3RcIiB8IFwiYWNjZXB0ZWRcIiB8IFwicmVhY3Rpb25cIiB8IFwiY29tbWVudFwiOyBmcm9tOiBBdXRob3I7XG4gIGl0ZW0/OiBzdHJpbmc7IGVtb2ppPzogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nOyBhdDogc3RyaW5nOyByZWFkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNvY2lhbE1lIHtcbiAgZW5hYmxlZDogYm9vbGVhbjsgaGFuZGxlOiBzdHJpbmcgfCBudWxsOyBuYW1lOiBzdHJpbmcgfCBudWxsOyBzZXJ2ZXI6IHN0cmluZzsgZGlyZWN0b3J5OiBzdHJpbmcgfCBudWxsOyBsaXN0ZWQ6IGJvb2xlYW47IGZpbmdlcnByaW50OiBzdHJpbmc7XG4gIC8qKiBkaXJlY3RvcnkgY29uZmlndXJlZCBvbiB0aGlzIHNlcnZlciAoU09DSUFMX0RJUkVDVE9SWSksIGV2ZW4gYmVmb3JlIHNldHVwICovXG4gIGRpcmVjdG9yeUNvbmZpZ3VyZWQ6IGJvb2xlYW47XG4gIHVucmVhZDogbnVtYmVyO1xufVxuXG5leHBvcnQgdHlwZSBJbmJveE1lc3NhZ2UgPVxuICB8IHsgdHlwZTogXCJmcmllbmRfcmVxdWVzdFwiOyBpZDogc3RyaW5nOyBmcm9tOiB7IHNlcnZlcjogc3RyaW5nOyBoYW5kbGU6IHN0cmluZyB8IG51bGw7IG5hbWU6IHN0cmluZyB8IG51bGw7IGRpcmVjdG9yeTogc3RyaW5nIHwgbnVsbCB9OyBub3RlPzogc3RyaW5nIHwgbnVsbCB9XG4gIHwgeyB0eXBlOiBcImZyaWVuZF9hY2NlcHRcIjsgaWQ6IHN0cmluZzsgcmVxdWVzdDogc3RyaW5nIH1cbiAgfCB7IHR5cGU6IFwiZnJpZW5kX3JlamVjdFwiOyBpZDogc3RyaW5nOyByZXF1ZXN0OiBzdHJpbmcgfVxuICB8IHsgdHlwZTogXCJ1bmZyaWVuZFwiOyBpZDogc3RyaW5nIH1cbiAgfCB7IHR5cGU6IFwicmVhY3Rpb25cIjsgaWQ6IHN0cmluZzsgaXRlbTogc3RyaW5nOyBlbW9qaTogc3RyaW5nIH1cbiAgfCB7IHR5cGU6IFwidW5yZWFjdGlvblwiOyBpZDogc3RyaW5nOyBpdGVtOiBzdHJpbmcgfVxuICB8IHsgdHlwZTogXCJjb21tZW50XCI7IGlkOiBzdHJpbmc7IGl0ZW06IHN0cmluZzsgdGV4dDogc3RyaW5nIH07XG4iLCAiLy8gSXJvbnRlcm0gc29jaWFsIGRpcmVjdG9yeSAoZG9jcy9zb2NpYWwvUFJPVE9DT0wubWQgXHUwMEE3Myk6IHRoZSBvbmx5IGNlbnRyYWwgcGllY2UuIEl0IG1hcHMgYSBoYW5kbGVcbi8vIHRvIGEgc2VydmVyIG9yaWdpbiBhbmQgcHVibGljIGtleSwgYW5kIHN0b3JlcyBub3RoaW5nIGVsc2U6IG5vIHdvcmtvdXRzLCBubyBmcmllbmQgbGlzdHMuXG4vLyBSdW5zIGFzIGEgQ2xvdWRmbGFyZSBXb3JrZXIgd2l0aCBEMSAod3JhbmdsZXIuZGlyZWN0b3J5LmV4YW1wbGUuanNvbmMpIG9yIG9uIE5vZGUgd2l0aCBTUUxpdGVcbi8vIChzZXJ2ZXIvZGlyZWN0b3J5LnRzKS5cblxuaW1wb3J0IHsgZmV0Y2hXZWxsS25vd24sIHJlYWRMaW1pdGVkIH0gZnJvbSBcIi4uL3dvcmtlci9zb2NpYWwvbmV0XCI7XG5pbXBvcnQgeyBub3JtT3JpZ2luLCBwcmVjaGVjaywgdW5iNjR1cmwsIHZlcmlmeVJlcXVlc3QgfSBmcm9tIFwiLi4vd29ya2VyL3NvY2lhbC9zaWduXCI7XG5pbXBvcnQgeyBIQU5ETEVfUkUgfSBmcm9tIFwiLi4vd29ya2VyL3NvY2lhbC90eXBlc1wiO1xuXG5leHBvcnQgaW50ZXJmYWNlIERpckVudiB7XG4gIERCOiBEMURhdGFiYXNlO1xuICAvKiogcHVibGljIG9yaWdpbiB3aGVuIHJlcXVlc3RzIGFycml2ZSB1bmRlciBhbm90aGVyIFVSTCAqL1xuICBESVJFQ1RPUllfT1JJR0lOPzogc3RyaW5nO1xuICAvKiogXCIxXCI6IGFjY2VwdCBodHRwOi8vIHNlcnZlcnMgKGxvY2FsIHRlc3Rpbmcgb25seSkgKi9cbiAgU09DSUFMX0FMTE9XX0hUVFA/OiBzdHJpbmc7XG59XG5cbmNvbnN0IFNDSEVNQSA9IFtcbiAgXCJDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyB1c2VycyAoaGFuZGxlIFRFWFQgUFJJTUFSWSBLRVksIG5hbWUgVEVYVCwgc2VydmVyIFRFWFQgTk9UIE5VTEwsIHB1YmxpY19rZXkgVEVYVCBOT1QgTlVMTCwgbGlzdGVkIElOVEVHRVIgTk9UIE5VTEwgREVGQVVMVCAwLCBjcmVhdGVkX2F0IFRFWFQgTk9UIE5VTEwsIHVwZGF0ZWRfYXQgVEVYVCBOT1QgTlVMTClcIixcbiAgXCJDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyB1c2Vyc19rZXkgT04gdXNlcnMocHVibGljX2tleSlcIixcbiAgXCJDUkVBVEUgSU5ERVggSUYgTk9UIEVYSVNUUyB1c2Vyc19uYW1lIE9OIHVzZXJzKGxvd2VyKG5hbWUpKVwiLFxuICBcIkNSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIHJhdGUgKGtleSBURVhUIFBSSU1BUlkgS0VZLCBjb3VudCBJTlRFR0VSIE5PVCBOVUxMLCByZXNldCBJTlRFR0VSIE5PVCBOVUxMKVwiLFxuXTtcbmNvbnN0IHJlYWR5ID0gbmV3IFdlYWtNYXA8b2JqZWN0LCBQcm9taXNlPHVua25vd24+PigpO1xuY29uc3QgZW5zdXJlID0gKGRiOiBEMURhdGFiYXNlKSA9PiB7IGxldCBwID0gcmVhZHkuZ2V0KGRiKTsgaWYgKCFwKSByZWFkeS5zZXQoZGIsIChwID0gZGIuYmF0Y2goU0NIRU1BLm1hcCgocykgPT4gZGIucHJlcGFyZShzKSkpKSk7IHJldHVybiBwOyB9O1xuXG4vKiogcGVyIGNsaWVudCBJUDogW3JlcXVlc3RzLCB3aW5kb3cgc2Vjb25kc10gKi9cbmV4cG9ydCBjb25zdCBMSU1JVFMgPSB7IHdyaXRlOiBbMjAsIDM2MDBdLCBzZWFyY2g6IFs2MCwgNjBdLCBsb29rdXA6IFsyNDAsIDYwXSB9IGFzIGNvbnN0O1xuY29uc3QgTUFYX0JPRFkgPSA0MDk2O1xuXG5pbnRlcmZhY2UgVXNlclJvdyB7IGhhbmRsZTogc3RyaW5nOyBuYW1lOiBzdHJpbmcgfCBudWxsOyBzZXJ2ZXI6IHN0cmluZzsgcHVibGljX2tleTogc3RyaW5nOyBsaXN0ZWQ6IG51bWJlcjsgY3JlYXRlZF9hdDogc3RyaW5nOyB1cGRhdGVkX2F0OiBzdHJpbmcgfVxuXG5jb25zdCBqc29uID0gKGRhdGE6IHVua25vd24sIHN0YXR1cyA9IDIwMCwgZXh0cmE6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fSkgPT5cbiAgbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KGRhdGEpLCB7IHN0YXR1cywgaGVhZGVyczogeyBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiwgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1vcmlnaW5cIjogXCIqXCIsIC4uLmV4dHJhIH0gfSk7XG5jb25zdCBlcnIgPSAoc3RhdHVzOiBudW1iZXIsIGVycm9yOiBzdHJpbmcpID0+IGpzb24oeyBlcnJvciB9LCBzdGF0dXMpO1xuXG5hc3luYyBmdW5jdGlvbiBsaW1pdGVkKGRiOiBEMURhdGFiYXNlLCBpcDogc3RyaW5nLCBraW5kOiBrZXlvZiB0eXBlb2YgTElNSVRTKTogUHJvbWlzZTxib29sZWFuPiB7XG4gIGNvbnN0IFttYXgsIHdpbl0gPSBMSU1JVFNba2luZF07XG4gIGNvbnN0IG5vdyA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApO1xuICBjb25zdCBrZXkgPSBgJHtraW5kfToke2lwfWA7XG4gIGNvbnN0IHJvdyA9IGF3YWl0IGRiLnByZXBhcmUoXCJTRUxFQ1QgY291bnQsIHJlc2V0IEZST00gcmF0ZSBXSEVSRSBrZXkgPSA/XCIpLmJpbmQoa2V5KS5maXJzdDx7IGNvdW50OiBudW1iZXI7IHJlc2V0OiBudW1iZXIgfT4oKTtcbiAgaWYgKCFyb3cgfHwgcm93LnJlc2V0IDw9IG5vdykge1xuICAgIGF3YWl0IGRiLnByZXBhcmUoXCJJTlNFUlQgSU5UTyByYXRlIChrZXksIGNvdW50LCByZXNldCkgVkFMVUVTICg/LCAxLCA/KSBPTiBDT05GTElDVChrZXkpIERPIFVQREFURSBTRVQgY291bnQgPSAxLCByZXNldCA9IGV4Y2x1ZGVkLnJlc2V0XCIpLmJpbmQoa2V5LCBub3cgKyB3aW4pLnJ1bigpO1xuICAgIGlmIChNYXRoLnJhbmRvbSgpIDwgMC4wMSkgYXdhaXQgZGIucHJlcGFyZShcIkRFTEVURSBGUk9NIHJhdGUgV0hFUkUgcmVzZXQgPD0gP1wiKS5iaW5kKG5vdykucnVuKCk7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChyb3cuY291bnQgPj0gbWF4KSByZXR1cm4gdHJ1ZTtcbiAgYXdhaXQgZGIucHJlcGFyZShcIlVQREFURSByYXRlIFNFVCBjb3VudCA9IGNvdW50ICsgMSBXSEVSRSBrZXkgPSA/XCIpLmJpbmQoa2V5KS5ydW4oKTtcbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5jb25zdCBpc0tleSA9IChrOiB1bmtub3duKTogayBpcyBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIGsgIT09IFwic3RyaW5nXCIgfHwgay5sZW5ndGggPiA2MCkgcmV0dXJuIGZhbHNlO1xuICB0cnkgeyByZXR1cm4gdW5iNjR1cmwoaykubGVuZ3RoID09PSAzMjsgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxufTtcblxuY29uc3Qgb3V0ID0gKHU6IFVzZXJSb3cpID0+ICh7IGhhbmRsZTogdS5oYW5kbGUsIG5hbWU6IHUubmFtZSwgc2VydmVyOiB1LnNlcnZlciwgcHVibGljS2V5OiB1LnB1YmxpY19rZXksIHVwZGF0ZWRBdDogdS51cGRhdGVkX2F0IH0pO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlRGlyZWN0b3J5KHJlcTogUmVxdWVzdCwgZW52OiBEaXJFbnYpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG4gIGNvbnN0IHVybCA9IG5ldyBVUkwocmVxLnVybCk7XG4gIGNvbnN0IHBhdGggPSB1cmwucGF0aG5hbWU7XG4gIGNvbnN0IGRiID0gZW52LkRCO1xuICBjb25zdCBodHRwID0gZW52LlNPQ0lBTF9BTExPV19IVFRQID09PSBcIjFcIiB8fCBlbnYuU09DSUFMX0FMTE9XX0hUVFAgPT09IFwidHJ1ZVwiO1xuICBjb25zdCBzZWxmID0gKGVudi5ESVJFQ1RPUllfT1JJR0lOICYmIG5vcm1PcmlnaW4oZW52LkRJUkVDVE9SWV9PUklHSU4sIHRydWUpKSB8fCB1cmwub3JpZ2luO1xuICBjb25zdCBpcCA9IHJlcS5oZWFkZXJzLmdldChcImNmLWNvbm5lY3RpbmctaXBcIikgPz8gXCJ1bmtub3duXCI7XG4gIGF3YWl0IGVuc3VyZShkYik7XG5cbiAgaWYgKHJlcS5tZXRob2QgPT09IFwiT1BUSU9OU1wiKSByZXR1cm4gbmV3IFJlc3BvbnNlKG51bGwsIHsgc3RhdHVzOiAyMDQsIGhlYWRlcnM6IHsgXCJhY2Nlc3MtY29udHJvbC1hbGxvdy1vcmlnaW5cIjogXCIqXCIsIFwiYWNjZXNzLWNvbnRyb2wtYWxsb3ctbWV0aG9kc1wiOiBcIkdFVFwiLCBcImFjY2Vzcy1jb250cm9sLW1heC1hZ2VcIjogXCI4NjQwMFwiIH0gfSk7XG4gIGlmIChwYXRoID09PSBcIi9cIiAmJiByZXEubWV0aG9kID09PSBcIkdFVFwiKSByZXR1cm4ganNvbih7IHNvZnR3YXJlOiBcImlyb250ZXJtLWRpcmVjdG9yeVwiLCB2OiAxLCBzdG9yZXM6IFtcImhhbmRsZVwiLCBcIm5hbWVcIiwgXCJzZXJ2ZXJcIiwgXCJwdWJsaWNLZXlcIiwgXCJsaXN0ZWRcIiwgXCJ0aW1lc3RhbXBzXCJdIH0pO1xuXG4gIGlmIChwYXRoID09PSBcIi92MS9yZWdpc3RlclwiICYmIHJlcS5tZXRob2QgPT09IFwiUE9TVFwiKSB7XG4gICAgaWYgKGF3YWl0IGxpbWl0ZWQoZGIsIGlwLCBcIndyaXRlXCIpKSByZXR1cm4gZXJyKDQyOSwgXCJ0b28gbWFueSByZXF1ZXN0c1wiKTtcbiAgICBsZXQgcmF3OiBzdHJpbmc7XG4gICAgdHJ5IHsgcmF3ID0gYXdhaXQgcmVhZExpbWl0ZWQocmVxLCBNQVhfQk9EWSk7IH0gY2F0Y2ggeyByZXR1cm4gZXJyKDQwMCwgXCJib2R5IHRvbyBsYXJnZVwiKTsgfVxuICAgIGNvbnN0IHByZSA9IHByZWNoZWNrKHJlcSwgc2VsZiwgaHR0cCk7XG4gICAgaWYgKCFwcmUub2spIHJldHVybiBlcnIocHJlLnN0YXR1cywgcHJlLmVycm9yKTtcbiAgICBsZXQgYjogeyBoYW5kbGU/OiB1bmtub3duOyBuYW1lPzogdW5rbm93bjsgc2VydmVyPzogdW5rbm93bjsgcHVibGljS2V5PzogdW5rbm93bjsgbGlzdGVkPzogdW5rbm93biB9O1xuICAgIHRyeSB7IGIgPSBKU09OLnBhcnNlKHJhdyk7IH0gY2F0Y2ggeyByZXR1cm4gZXJyKDQwMCwgXCJtYWxmb3JtZWQgYm9keVwiKTsgfVxuICAgIGNvbnN0IGhhbmRsZSA9IHR5cGVvZiBiLmhhbmRsZSA9PT0gXCJzdHJpbmdcIiA/IGIuaGFuZGxlIDogXCJcIjtcbiAgICBpZiAoIUhBTkRMRV9SRS50ZXN0KGhhbmRsZSkpIHJldHVybiBlcnIoNDAwLCBcImhhbmRsZSBtdXN0IG1hdGNoIF5bYS16MC05XVthLXowLTlfLV17MSwyOX0kXCIpO1xuICAgIGlmIChiLm5hbWUgIT0gbnVsbCAmJiAodHlwZW9mIGIubmFtZSAhPT0gXCJzdHJpbmdcIiB8fCBiLm5hbWUubGVuZ3RoID4gNjApKSByZXR1cm4gZXJyKDQwMCwgXCJuYW1lOiB1cCB0byA2MCBjaGFyYWN0ZXJzXCIpO1xuICAgIGlmICghaXNLZXkoYi5wdWJsaWNLZXkpKSByZXR1cm4gZXJyKDQwMCwgXCJwdWJsaWNLZXk6IGJhc2U2NHVybCByYXcgMzItYnl0ZSBFZDI1NTE5IGtleVwiKTtcbiAgICBjb25zdCBzZXJ2ZXIgPSBub3JtT3JpZ2luKHR5cGVvZiBiLnNlcnZlciA9PT0gXCJzdHJpbmdcIiA/IGIuc2VydmVyIDogXCJcIiwgaHR0cCk7XG4gICAgaWYgKCFzZXJ2ZXIgfHwgc2VydmVyICE9PSBiLnNlcnZlcikgcmV0dXJuIGVycig0MDAsIGh0dHAgPyBcInNlcnZlciBtdXN0IGJlIGFuIG9yaWdpblwiIDogXCJzZXJ2ZXIgbXVzdCBiZSBhbiBodHRwcyBvcmlnaW5cIik7XG4gICAgaWYgKHNlcnZlciAhPT0gcHJlLnNlcnZlcikgcmV0dXJuIGVycig0MDEsIFwic2lnbmF0dXJlIGlzIGZyb20gYW5vdGhlciBzZXJ2ZXJcIik7XG4gICAgaWYgKCEoYXdhaXQgdmVyaWZ5UmVxdWVzdChyZXEsIHJhdywgc2VsZiwgYi5wdWJsaWNLZXksIHByZS5wYXJzZWQpKSkgcmV0dXJuIGVycig0MDEsIFwiYmFkIHNpZ25hdHVyZVwiKTtcbiAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGRiLnByZXBhcmUoXCJTRUxFQ1QgKiBGUk9NIHVzZXJzIFdIRVJFIGhhbmRsZSA9ID9cIikuYmluZChoYW5kbGUpLmZpcnN0PFVzZXJSb3c+KCk7XG4gICAgaWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLnB1YmxpY19rZXkgIT09IGIucHVibGljS2V5KSByZXR1cm4gZXJyKDQwOSwgXCJoYW5kbGUgdGFrZW5cIik7XG4gICAgLy8gUHJvdmUgdGhlIHNlcnZlciBjb250cm9scyBpdHMgb3JpZ2luOiBpdCBtdXN0IHNlcnZlIHRoZSBzYW1lIGtleS5cbiAgICBsZXQgd2s7XG4gICAgdHJ5IHsgd2sgPSBhd2FpdCBmZXRjaFdlbGxLbm93bihzZXJ2ZXIpOyB9IGNhdGNoIChlKSB7IHJldHVybiBlcnIoNDAwLCBgY291bGRuJ3QgdmVyaWZ5ICR7c2VydmVyfTogJHsoZSBhcyBFcnJvcikubWVzc2FnZX1gKTsgfVxuICAgIGlmICh3ay5wdWJsaWNLZXkgIT09IGIucHVibGljS2V5KSByZXR1cm4gZXJyKDQwMywgXCJ0aGUgc2VydmVyJ3MgLndlbGwta25vd24vaXJvbnRlcm0gc2VydmVzIGEgZGlmZmVyZW50IGtleVwiKTtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG4gICAgY29uc3QgbmFtZSA9IHR5cGVvZiBiLm5hbWUgPT09IFwic3RyaW5nXCIgPyBiLm5hbWUudHJpbSgpIHx8IG51bGwgOiBudWxsO1xuICAgIGF3YWl0IGRiLmJhdGNoKFtcbiAgICAgIC8vIG9uZSBoYW5kbGUgcGVyIGtleTogcmVnaXN0ZXJpbmcgYSBuZXcgaGFuZGxlIHJlbGVhc2VzIHRoZSBvbGQgb25lXG4gICAgICBkYi5wcmVwYXJlKFwiREVMRVRFIEZST00gdXNlcnMgV0hFUkUgcHVibGljX2tleSA9ID8gQU5EIGhhbmRsZSAhPSA/XCIpLmJpbmQoYi5wdWJsaWNLZXksIGhhbmRsZSksXG4gICAgICBkYi5wcmVwYXJlKFwiSU5TRVJUIElOVE8gdXNlcnMgKGhhbmRsZSwgbmFtZSwgc2VydmVyLCBwdWJsaWNfa2V5LCBsaXN0ZWQsIGNyZWF0ZWRfYXQsIHVwZGF0ZWRfYXQpIFZBTFVFUyAoPywgPywgPywgPywgPywgPywgPykgT04gQ09ORkxJQ1QoaGFuZGxlKSBETyBVUERBVEUgU0VUIG5hbWUgPSBleGNsdWRlZC5uYW1lLCBzZXJ2ZXIgPSBleGNsdWRlZC5zZXJ2ZXIsIGxpc3RlZCA9IGV4Y2x1ZGVkLmxpc3RlZCwgdXBkYXRlZF9hdCA9IGV4Y2x1ZGVkLnVwZGF0ZWRfYXRcIilcbiAgICAgICAgLmJpbmQoaGFuZGxlLCBuYW1lLCBzZXJ2ZXIsIGIucHVibGljS2V5LCBiLmxpc3RlZCA/IDEgOiAwLCBub3csIG5vdyksXG4gICAgXSk7XG4gICAgcmV0dXJuIGpzb24oeyBvazogdHJ1ZSwgaGFuZGxlIH0pO1xuICB9XG5cbiAgY29uc3QgdW0gPSBwYXRoLm1hdGNoKC9eXFwvdjFcXC91c2Vyc1xcLyhbXi9dKykkLyk7XG4gIGlmICh1bSkge1xuICAgIGNvbnN0IGhhbmRsZSA9IGRlY29kZVVSSUNvbXBvbmVudCh1bVsxXSkudG9Mb3dlckNhc2UoKTtcbiAgICBpZiAocmVxLm1ldGhvZCA9PT0gXCJHRVRcIikge1xuICAgICAgaWYgKGF3YWl0IGxpbWl0ZWQoZGIsIGlwLCBcImxvb2t1cFwiKSkgcmV0dXJuIGVycig0MjksIFwidG9vIG1hbnkgcmVxdWVzdHNcIik7XG4gICAgICBpZiAoIUhBTkRMRV9SRS50ZXN0KGhhbmRsZSkpIHJldHVybiBlcnIoNDA0LCBcIm5vdCBmb3VuZFwiKTtcbiAgICAgIGNvbnN0IHUgPSBhd2FpdCBkYi5wcmVwYXJlKFwiU0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSBoYW5kbGUgPSA/XCIpLmJpbmQoaGFuZGxlKS5maXJzdDxVc2VyUm93PigpO1xuICAgICAgcmV0dXJuIHUgPyBqc29uKG91dCh1KSkgOiBlcnIoNDA0LCBcIm5vdCBmb3VuZFwiKTtcbiAgICB9XG4gICAgaWYgKHJlcS5tZXRob2QgPT09IFwiREVMRVRFXCIpIHtcbiAgICAgIGlmIChhd2FpdCBsaW1pdGVkKGRiLCBpcCwgXCJ3cml0ZVwiKSkgcmV0dXJuIGVycig0MjksIFwidG9vIG1hbnkgcmVxdWVzdHNcIik7XG4gICAgICBjb25zdCBwcmUgPSBwcmVjaGVjayhyZXEsIHNlbGYsIGh0dHApO1xuICAgICAgaWYgKCFwcmUub2spIHJldHVybiBlcnIocHJlLnN0YXR1cywgcHJlLmVycm9yKTtcbiAgICAgIGNvbnN0IHUgPSBhd2FpdCBkYi5wcmVwYXJlKFwiU0VMRUNUICogRlJPTSB1c2VycyBXSEVSRSBoYW5kbGUgPSA/XCIpLmJpbmQoaGFuZGxlKS5maXJzdDxVc2VyUm93PigpO1xuICAgICAgaWYgKCF1KSByZXR1cm4gZXJyKDQwNCwgXCJub3QgZm91bmRcIik7XG4gICAgICBpZiAoIShhd2FpdCB2ZXJpZnlSZXF1ZXN0KHJlcSwgXCJcIiwgc2VsZiwgdS5wdWJsaWNfa2V5LCBwcmUucGFyc2VkKSkpIHJldHVybiBlcnIoNDAxLCBcImJhZCBzaWduYXR1cmVcIik7XG4gICAgICBhd2FpdCBkYi5wcmVwYXJlKFwiREVMRVRFIEZST00gdXNlcnMgV0hFUkUgaGFuZGxlID0gP1wiKS5iaW5kKGhhbmRsZSkucnVuKCk7XG4gICAgICByZXR1cm4ganNvbih7IG9rOiB0cnVlIH0pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChwYXRoID09PSBcIi92MS9zZWFyY2hcIiAmJiByZXEubWV0aG9kID09PSBcIkdFVFwiKSB7XG4gICAgaWYgKGF3YWl0IGxpbWl0ZWQoZGIsIGlwLCBcInNlYXJjaFwiKSkgcmV0dXJuIGVycig0MjksIFwidG9vIG1hbnkgcmVxdWVzdHNcIik7XG4gICAgY29uc3QgcSA9ICh1cmwuc2VhcmNoUGFyYW1zLmdldChcInFcIikgPz8gXCJcIikudHJpbSgpLnRvTG93ZXJDYXNlKCkucmVwbGFjZSgvXkAvLCBcIlwiKTtcbiAgICBpZiAocS5sZW5ndGggPCAyKSByZXR1cm4gZXJyKDQwMCwgXCJxOiBhdCBsZWFzdCAyIGNoYXJhY3RlcnNcIik7XG4gICAgaWYgKHEubGVuZ3RoID4gNjApIHJldHVybiBqc29uKHsgdXNlcnM6IFtdIH0pO1xuICAgIGNvbnN0IGxpa2UgPSBxLnJlcGxhY2UoL1tcXFxcJV9dL2csIChjKSA9PiBgXFxcXCR7Y31gKSArIFwiJVwiO1xuICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgZGIucHJlcGFyZShcIlNFTEVDVCAqIEZST00gdXNlcnMgV0hFUkUgbGlzdGVkID0gMSBBTkQgKGhhbmRsZSBMSUtFID8gRVNDQVBFICdcXFxcJyBPUiBsb3dlcihuYW1lKSBMSUtFID8gRVNDQVBFICdcXFxcJykgT1JERVIgQlkgaGFuZGxlIExJTUlUIDIwXCIpLmJpbmQobGlrZSwgbGlrZSkuYWxsPFVzZXJSb3c+KCk7XG4gICAgcmV0dXJuIGpzb24oeyB1c2VyczogcmVzdWx0cy5tYXAoKHUpID0+ICh7IGhhbmRsZTogdS5oYW5kbGUsIG5hbWU6IHUubmFtZSwgc2VydmVyOiB1LnNlcnZlciB9KSkgfSk7XG4gIH1cblxuICByZXR1cm4gZXJyKDQwNCwgXCJub3QgZm91bmRcIik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgYXN5bmMgZmV0Y2gocmVxLCBlbnYpIHtcbiAgICB0cnkgeyByZXR1cm4gYXdhaXQgaGFuZGxlRGlyZWN0b3J5KHJlcSwgZW52KTsgfVxuICAgIGNhdGNoIChlKSB7IGNvbnNvbGUuZXJyb3IoZSk7IHJldHVybiBlcnIoNTAwLCBcImludGVybmFsIGVycm9yXCIpOyB9XG4gIH0sXG59IHNhdGlzZmllcyBFeHBvcnRlZEhhbmRsZXI8RGlyRW52PjtcbiIsICJpbXBvcnQgeyBhZnRlckFsbCwgYmVmb3JlQWxsLCBkZXNjcmliZSwgZXhwZWN0LCBpdCwgdmkgfSBmcm9tIFwidml0ZXN0XCI7XG5pbXBvcnQgeyBOb2RlRDEgfSBmcm9tIFwiLi4vc2VydmVyL2QxXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZUtleVBhaXIsIGltcG9ydFByaXZhdGUsIFNJR19IRUFERVIsIHNpZ25SZXF1ZXN0IH0gZnJvbSBcIi4uL3dvcmtlci9zb2NpYWwvc2lnblwiO1xuaW1wb3J0IGRpcmVjdG9yeSwgeyBMSU1JVFMgfSBmcm9tIFwiLi93b3JrZXJcIjtcblxuY29uc3QgRElSID0gXCJodHRwczovL2Rpci5leGFtcGxlXCI7XG5jb25zdCBzZXJ2ZXJzID0gbmV3IE1hcDxzdHJpbmcsIHsgcHVibGljS2V5OiBzdHJpbmc7IGtleTogQ3J5cHRvS2V5OyBzZXJ2ZT86IHN0cmluZyB9PigpO1xuY29uc3QgcmVhbEZldGNoID0gZ2xvYmFsVGhpcy5mZXRjaDtcbmxldCBlbnY6IHsgREI6IE5vZGVEMTsgU09DSUFMX0FMTE9XX0hUVFA/OiBzdHJpbmcgfTtcblxuYXN5bmMgZnVuY3Rpb24gc2VydmVyKG9yaWdpbjogc3RyaW5nKSB7XG4gIGNvbnN0IGtwID0gYXdhaXQgZ2VuZXJhdGVLZXlQYWlyKCk7XG4gIGNvbnN0IHMgPSB7IHB1YmxpY0tleToga3AucHVibGljS2V5LCBrZXk6IGF3YWl0IGltcG9ydFByaXZhdGUoa3AucHJpdmF0ZUp3aykgfTtcbiAgc2VydmVycy5zZXQob3JpZ2luLCBzKTtcbiAgcmV0dXJuIHM7XG59XG5cbmJlZm9yZUFsbCgoKSA9PiB7XG4gIHZpLnN0dWJHbG9iYWwoXCJmZXRjaFwiLCBhc3luYyAoaW5wdXQ6IFJlcXVlc3RJbmZvIHwgVVJMLCBpbml0PzogUmVxdWVzdEluaXQpID0+IHtcbiAgICBjb25zdCB1ID0gbmV3IFVSTChuZXcgUmVxdWVzdChpbnB1dCBhcyBSZXF1ZXN0SW5mbywgaW5pdCkudXJsKTtcbiAgICBjb25zdCBzID0gc2VydmVycy5nZXQodS5vcmlnaW4pO1xuICAgIGlmICghcyB8fCB1LnBhdGhuYW1lICE9PSBcIi8ud2VsbC1rbm93bi9pcm9udGVybVwiKSB0aHJvdyBuZXcgVHlwZUVycm9yKFwiZmV0Y2ggZmFpbGVkXCIpO1xuICAgIHJldHVybiBSZXNwb25zZS5qc29uKHsgdjogMSwgc2VydmVyOiB1Lm9yaWdpbiwgaGFuZGxlOiBudWxsLCBuYW1lOiBudWxsLCBwdWJsaWNLZXk6IHMuc2VydmUgPz8gcy5wdWJsaWNLZXksIGRpcmVjdG9yeTogbnVsbCwgc29mdHdhcmU6IFwiaXJvbnRlcm1cIiB9KTtcbiAgfSk7XG59KTtcbmFmdGVyQWxsKCgpID0+IHsgdmkuc3R1Ykdsb2JhbChcImZldGNoXCIsIHJlYWxGZXRjaCk7IHZpLnVuc3R1YkFsbEdsb2JhbHMoKTsgfSk7XG5cbmxldCBpcE4gPSAwO1xuYXN5bmMgZnVuY3Rpb24gcmVxKG1ldGhvZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcsIG9wdHM6IHsgYm9keT86IHVua25vd247IGFzPzogc3RyaW5nOyBzaWduZXI/OiBzdHJpbmc7IGlwPzogc3RyaW5nOyBub3c/OiBudW1iZXIgfSA9IHt9KSB7XG4gIGNvbnN0IHVybCA9IGAke0RJUn0ke3BhdGh9YDtcbiAgY29uc3QgdGV4dCA9IG9wdHMuYm9keSA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogSlNPTi5zdHJpbmdpZnkob3B0cy5ib2R5KTtcbiAgY29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHsgXCJjZi1jb25uZWN0aW5nLWlwXCI6IG9wdHMuaXAgPz8gYDEwLjAuMC4keysraXBOICUgMjUwfWAgfTtcbiAgaWYgKG9wdHMuYXMpIHtcbiAgICBjb25zdCBzID0gc2VydmVycy5nZXQob3B0cy5zaWduZXIgPz8gb3B0cy5hcykhO1xuICAgIGhlYWRlcnNbU0lHX0hFQURFUl0gPSBhd2FpdCBzaWduUmVxdWVzdCh7IGtleTogcy5rZXksIHNlcnZlcjogb3B0cy5hcywgbWV0aG9kLCB1cmwsIGJvZHk6IHRleHQgPz8gXCJcIiwgbm93OiBvcHRzLm5vdyB9KTtcbiAgfVxuICBjb25zdCByID0gYXdhaXQgZGlyZWN0b3J5LmZldGNoKG5ldyBSZXF1ZXN0KHVybCwgeyBtZXRob2QsIGhlYWRlcnMsIGJvZHk6IHRleHQgfSkgYXMgbmV2ZXIsIGVudiBhcyBuZXZlcik7XG4gIHJldHVybiB7IHN0YXR1czogci5zdGF0dXMsIGRhdGE6IChhd2FpdCByLmpzb24oKSkgYXMgYW55IH07XG59XG5jb25zdCByZWcgPSAob3JpZ2luOiBzdHJpbmcsIGhhbmRsZTogc3RyaW5nLCBleHRyYTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fSkgPT5cbiAgcmVxKFwiUE9TVFwiLCBcIi92MS9yZWdpc3RlclwiLCB7IGFzOiBvcmlnaW4sIGJvZHk6IHsgaGFuZGxlLCBuYW1lOiBoYW5kbGUudG9VcHBlckNhc2UoKSwgc2VydmVyOiBvcmlnaW4sIHB1YmxpY0tleTogc2VydmVycy5nZXQob3JpZ2luKSEucHVibGljS2V5LCBsaXN0ZWQ6IHRydWUsIC4uLmV4dHJhIH0gfSk7XG5cbmRlc2NyaWJlKFwiZGlyZWN0b3J5IChcdTAwQTczKVwiLCAoKSA9PiB7XG4gIGJlZm9yZUFsbChhc3luYyAoKSA9PiB7XG4gICAgZW52ID0geyBEQjogbmV3IE5vZGVEMShcIjptZW1vcnk6XCIpIH07XG4gICAgZm9yIChjb25zdCBvIG9mIFtcImh0dHBzOi8vYS5leGFtcGxlXCIsIFwiaHR0cHM6Ly9iLmV4YW1wbGVcIiwgXCJodHRwczovL2MuZXhhbXBsZVwiLCBcImh0dHA6Ly9oLmV4YW1wbGVcIl0pIGF3YWl0IHNlcnZlcihvKTtcbiAgfSk7XG5cbiAgaXQoXCJyZWdpc3RlcnMgYSBzaWduZWQsIHZlcmlmaWVkIGhhbmRsZSBhbmQgc2VydmVzIGl0XCIsIGFzeW5jICgpID0+IHtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYS5leGFtcGxlXCIsIFwic2FtXCIpKS5kYXRhKS50b0VxdWFsKHsgb2s6IHRydWUsIGhhbmRsZTogXCJzYW1cIiB9KTtcbiAgICBjb25zdCB1ID0gKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS91c2Vycy9zYW1cIikpLmRhdGE7XG4gICAgZXhwZWN0KHUpLnRvTWF0Y2hPYmplY3QoeyBoYW5kbGU6IFwic2FtXCIsIG5hbWU6IFwiU0FNXCIsIHNlcnZlcjogXCJodHRwczovL2EuZXhhbXBsZVwiLCBwdWJsaWNLZXk6IHNlcnZlcnMuZ2V0KFwiaHR0cHM6Ly9hLmV4YW1wbGVcIikhLnB1YmxpY0tleSB9KTtcbiAgICBleHBlY3QodS51cGRhdGVkQXQpLnRvQmVUcnV0aHkoKTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS91c2Vycy9TQU1cIikpLnN0YXR1cykudG9CZSgyMDApO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiR0VUXCIsIFwiL3YxL3VzZXJzL25vYm9keVwiKSkuc3RhdHVzKS50b0JlKDQwNCk7XG4gIH0pO1xuXG4gIGl0KFwiZW5mb3JjZXMgdGhlIGhhbmRsZSBydWxlc1wiLCBhc3luYyAoKSA9PiB7XG4gICAgZm9yIChjb25zdCBoIG9mIFtcImFcIiwgXCItc2FtXCIsIFwiU2FtXCIsIFwic2FtIVwiLCBcInhcIi5yZXBlYXQoMzEpLCBcIl94XCJdKSBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYi5leGFtcGxlXCIsIGgpKS5zdGF0dXMpLnRvQmUoNDAwKTtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYi5leGFtcGxlXCIsIFwib2tfaGFuZGxlLTJcIikpLnN0YXR1cykudG9CZSgyMDApO1xuICB9KTtcblxuICBpdChcInJlZnVzZXMgdW5zaWduZWQsIG1pcy1zaWduZWQsIHN0YWxlIGFuZCBtaXNtYXRjaGVkIHJlZ2lzdHJhdGlvbnNcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGNvbnN0IGJvZHkgPSB7IGhhbmRsZTogXCJiZWVcIiwgbmFtZTogXCJCXCIsIHNlcnZlcjogXCJodHRwczovL2IuZXhhbXBsZVwiLCBwdWJsaWNLZXk6IHNlcnZlcnMuZ2V0KFwiaHR0cHM6Ly9iLmV4YW1wbGVcIikhLnB1YmxpY0tleSwgbGlzdGVkOiB0cnVlIH07XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJQT1NUXCIsIFwiL3YxL3JlZ2lzdGVyXCIsIHsgYm9keSB9KSkuc3RhdHVzKS50b0JlKDQwMSk7XG4gICAgLy8gc2lnbmVkIGJ5IGFub3RoZXIga2V5IHRoYW4gdGhlIG9uZSBpbiB0aGUgYm9keVxuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiUE9TVFwiLCBcIi92MS9yZWdpc3RlclwiLCB7IGJvZHksIGFzOiBcImh0dHBzOi8vYi5leGFtcGxlXCIsIHNpZ25lcjogXCJodHRwczovL2MuZXhhbXBsZVwiIH0pKS5zdGF0dXMpLnRvQmUoNDAxKTtcbiAgICAvLyBzaWduZWQgYXMgb25lIHNlcnZlciwgcmVnaXN0ZXJpbmcgYW5vdGhlclxuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiUE9TVFwiLCBcIi92MS9yZWdpc3RlclwiLCB7IGJvZHk6IHsgLi4uYm9keSwgc2VydmVyOiBcImh0dHBzOi8vYy5leGFtcGxlXCIgfSwgYXM6IFwiaHR0cHM6Ly9iLmV4YW1wbGVcIiB9KSkuc3RhdHVzKS50b0JlKDQwMSk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJQT1NUXCIsIFwiL3YxL3JlZ2lzdGVyXCIsIHsgYm9keSwgYXM6IFwiaHR0cHM6Ly9iLmV4YW1wbGVcIiwgbm93OiBEYXRlLm5vdygpIC0gNDAwXzAwMCB9KSkuc3RhdHVzKS50b0JlKDQwMSk7XG4gICAgLy8gdGhlIHNlcnZlcidzIC53ZWxsLWtub3duIHNlcnZlcyBhbm90aGVyIGtleTogbm8gcHJvb2YgaXQgY29udHJvbHMgdGhlIG9yaWdpblxuICAgIHNlcnZlcnMuZ2V0KFwiaHR0cHM6Ly9iLmV4YW1wbGVcIikhLnNlcnZlID0gc2VydmVycy5nZXQoXCJodHRwczovL2MuZXhhbXBsZVwiKSEucHVibGljS2V5O1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiUE9TVFwiLCBcIi92MS9yZWdpc3RlclwiLCB7IGJvZHksIGFzOiBcImh0dHBzOi8vYi5leGFtcGxlXCIgfSkpLnN0YXR1cykudG9CZSg0MDMpO1xuICAgIGRlbGV0ZSBzZXJ2ZXJzLmdldChcImh0dHBzOi8vYi5leGFtcGxlXCIpIS5zZXJ2ZTtcbiAgfSk7XG5cbiAgaXQoXCJyZWZ1c2VzIGEgdGFrZW92ZXIgYnkgYW5vdGhlciBrZXk7IHRoZSBvd25lciBjYW4gdXBkYXRlIGFuZCByZW5hbWVcIiwgYXN5bmMgKCkgPT4ge1xuICAgIGV4cGVjdCgoYXdhaXQgcmVnKFwiaHR0cHM6Ly9jLmV4YW1wbGVcIiwgXCJzYW1cIikpLnN0YXR1cykudG9CZSg0MDkpO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVnKFwiaHR0cHM6Ly9hLmV4YW1wbGVcIiwgXCJzYW1cIiwgeyBuYW1lOiBcIlNhbXVlbFwiLCBsaXN0ZWQ6IGZhbHNlIH0pKS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS91c2Vycy9zYW1cIikpLmRhdGEubmFtZSkudG9CZShcIlNhbXVlbFwiKTtcbiAgICAvLyBvbmUgaGFuZGxlIHBlciBrZXk6IGEgbmV3IGhhbmRsZSByZWxlYXNlcyB0aGUgb2xkIG9uZVxuICAgIGV4cGVjdCgoYXdhaXQgcmVnKFwiaHR0cHM6Ly9hLmV4YW1wbGVcIiwgXCJzYW1teVwiKSkuc3RhdHVzKS50b0JlKDIwMCk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvdXNlcnMvc2FtXCIpKS5zdGF0dXMpLnRvQmUoNDA0KTtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHBzOi8vYy5leGFtcGxlXCIsIFwic2FtXCIpKS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgfSk7XG5cbiAgaXQoXCJodHRwIHNlcnZlcnMgb25seSB3aXRoIFNPQ0lBTF9BTExPV19IVFRQXCIsIGFzeW5jICgpID0+IHtcbiAgICBleHBlY3QoKGF3YWl0IHJlZyhcImh0dHA6Ly9oLmV4YW1wbGVcIiwgXCJoaGhcIikpLnN0YXR1cykudG9CZSg0MDEpO1xuICAgIGVudi5TT0NJQUxfQUxMT1dfSFRUUCA9IFwiMVwiO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVnKFwiaHR0cDovL2guZXhhbXBsZVwiLCBcImhoaFwiKSkuc3RhdHVzKS50b0JlKDIwMCk7XG4gICAgZGVsZXRlIGVudi5TT0NJQUxfQUxMT1dfSFRUUDtcbiAgfSk7XG5cbiAgaXQoXCJzZWFyY2hlcyBsaXN0ZWQgdXNlcnMgYnkgaGFuZGxlIG9yIG5hbWUgcHJlZml4XCIsIGFzeW5jICgpID0+IHtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS9zZWFyY2g/cT1kXCIpKS5zdGF0dXMpLnRvQmUoNDAwKTtcbiAgICBjb25zdCByID0gKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS9zZWFyY2g/cT1TQVwiKSkuZGF0YTtcbiAgICBleHBlY3Qoci51c2Vycy5tYXAoKHU6IHsgaGFuZGxlOiBzdHJpbmcgfSkgPT4gdS5oYW5kbGUpKS50b0VxdWFsKFtcInNhbVwiLCBcInNhbW15XCJdKTtcbiAgICBleHBlY3QoT2JqZWN0LmtleXMoci51c2Vyc1swXSkuc29ydCgpKS50b0VxdWFsKFtcImhhbmRsZVwiLCBcIm5hbWVcIiwgXCJzZXJ2ZXJcIl0pO1xuICAgIGF3YWl0IHJlZyhcImh0dHBzOi8vYS5leGFtcGxlXCIsIFwic2FtbXlcIiwgeyBsaXN0ZWQ6IGZhbHNlIH0pO1xuICAgIGV4cGVjdCgoYXdhaXQgcmVxKFwiR0VUXCIsIFwiL3YxL3NlYXJjaD9xPXNhXCIpKS5kYXRhLnVzZXJzLm1hcCgodTogeyBoYW5kbGU6IHN0cmluZyB9KSA9PiB1LmhhbmRsZSkpLnRvRXF1YWwoW1wic2FtXCJdKTtcbiAgICAvLyB3aWxkY2FyZHMgYXJlIGxpdGVyYWxcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS9zZWFyY2g/cT0lMjUlMjVcIikpLmRhdGEudXNlcnMpLnRvRXF1YWwoW10pO1xuICB9KTtcblxuICBpdChcImRlbGV0ZXMgb25seSB3aXRoIHRoZSBzYW1lIGtleVwiLCBhc3luYyAoKSA9PiB7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJERUxFVEVcIiwgXCIvdjEvdXNlcnMvc2FtbXlcIiwgeyBhczogXCJodHRwczovL2MuZXhhbXBsZVwiIH0pKS5zdGF0dXMpLnRvQmUoNDAxKTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkRFTEVURVwiLCBcIi92MS91c2Vycy9zYW1teVwiKSkuc3RhdHVzKS50b0JlKDQwMSk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJERUxFVEVcIiwgXCIvdjEvdXNlcnMvc2FtbXlcIiwgeyBhczogXCJodHRwczovL2EuZXhhbXBsZVwiIH0pKS5zdGF0dXMpLnRvQmUoMjAwKTtcbiAgICBleHBlY3QoKGF3YWl0IHJlcShcIkdFVFwiLCBcIi92MS91c2Vycy9zYW1teVwiKSkuc3RhdHVzKS50b0JlKDQwNCk7XG4gIH0pO1xuXG4gIGl0KFwicmF0ZS1saW1pdHMgcGVyIGNsaWVudFwiLCBhc3luYyAoKSA9PiB7XG4gICAgY29uc3QgW21heF0gPSBMSU1JVFMuc2VhcmNoO1xuICAgIGxldCBsYXN0ID0gMDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8PSBtYXg7IGkrKykgbGFzdCA9IChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvc2VhcmNoP3E9c2FcIiwgeyBpcDogXCIxOTIuMC4yLjFcIiB9KSkuc3RhdHVzO1xuICAgIGV4cGVjdChsYXN0KS50b0JlKDQyOSk7XG4gICAgZXhwZWN0KChhd2FpdCByZXEoXCJHRVRcIiwgXCIvdjEvc2VhcmNoP3E9c2FcIiwgeyBpcDogXCIx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SUFBRyxrQ0FBa0MsWUFBWTtBQUMvQyxZQUFRLE1BQU0sSUFBSSxVQUFVLG1CQUFtQixFQUFFLElBQUksb0JBQW9CLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxHQUFHO0FBQzdGLFlBQVEsTUFBTSxJQUFJLFVBQVUsaUJBQWlCLEdBQUcsTUFBTSxFQUFFLEtBQUssR0FBRztBQUNoRSxZQUFRLE1BQU0sSUFBSSxVQUFVLG1CQUFtQixFQUFFLElBQUksb0JBQW9CLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxHQUFHO0FBQzdGLFlBQVEsTUFBTSxJQUFJLE9BQU8saUJBQWlCLEdBQUcsTUFBTSxFQUFFLEtBQUssR0FBRztBQUFBLEVBQy9ELENBQUM7QUFFRCxFQUFBQSxJQUFHLDBCQUEwQixZQUFZO0FBQ3ZDLFVBQU0sQ0FBQyxHQUFHLElBQUksT0FBTztBQUNyQixRQUFJLE9BQU87QUFDWCxhQUFTLElBQUksR0FBRyxLQUFLLEtBQUssSUFBSyxTQUFRLE1BQU0sSUFBSSxPQUFPLG1CQUFtQixFQUFFLElBQUksWUFBWSxDQUFDLEdBQUc7QUFDakcsV0FBTyxJQUFJLEVBQUUsS0FBSyxHQUFHO0FBQ3JCLFlBQVEsTUFBTSxJQUFJLE9BQU8sbUJBQW1CLEVBQUUsSUFBSSxZQUFZLENBQUMsR0FBRyxNQUFNLEVBQUUsS0FBSyxHQUFHO0FBQUEsRUFDcEYsQ0FBQztBQUNILENBQUM7IiwKICAibmFtZXMiOiBbImRlc2NyaWJlIiwgImZuIiwgIml0IiwgIm91dCIsICJmbiIsICJlcnIiLCAib3V0IiwgIm91dCIsICJvdXQiLCAib3V0IiwgInJlcSIsICJzZXJ2ZXIiLCAicmVxIiwgImVudiIsICJzZXJ2ZXIiLCAiZGVzY3JpYmUiLCAiaXQiXQp9Cg==
