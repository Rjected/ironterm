// The test API itself: every matcher passes when it should and, more importantly, fails when it should.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fails = (fn: () => void) => {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error("expected the assertion to fail");
};

describe("equality", () => {
  it("toBe is Object.is", () => {
    expect(1).toBe(1);
    expect(NaN).toBe(NaN);
    fails(() => expect({}).toBe({}));
    fails(() => expect(0).toBe(-0));
    expect(1).not.toBe(2);
    fails(() => expect(1).not.toBe(1));
  });

  it("toEqual is deep and ignores undefined properties", () => {
    expect({ a: 1, b: [1, { c: 2 }], u: undefined }).toEqual({ a: 1, b: [1, { c: 2 }] });
    expect(new Map([["k", { v: 1 }]])).toEqual(new Map([["k", { v: 1 }]]));
    expect(new Set([1, 2])).toEqual(new Set([2, 1]));
    expect(new Date(5)).toEqual(new Date(5));
    fails(() => expect({ a: 1 }).toEqual({ a: 1, b: 2 }));
    fails(() => expect([1, 2]).toEqual([1, 2, 3]));
    fails(() => expect([1, 2]).toEqual({ 0: 1, 1: 2 }));
    fails(() => expect(new Date(5)).toEqual(new Date(6)));
    fails(() => expect(new Map([["k", 1]])).toEqual(new Map([["k", 2]])));
  });

  it("toMatchObject is a recursive subset; arrays match element by element", () => {
    expect({ a: 1, b: { c: 2, d: 3 }, e: [{ f: 1, g: 2 }] }).toMatchObject({ b: { c: 2 }, e: [{ f: 1 }] });
    fails(() => expect({ a: 1 }).toMatchObject({ a: 2 }));
    fails(() => expect({ e: [{ f: 1 }, { f: 2 }] }).toMatchObject({ e: [{ f: 1 }] }));
    fails(() => expect({}).toMatchObject({ a: 1 }));
  });

  it("asymmetric matchers", () => {
    expect({ x: 1.0000001, y: "abc" }).toMatchObject({ x: expect.closeTo(1, 5), y: expect.stringContaining("b") });
    fails(() => expect({ x: 1.1 }).toMatchObject({ x: expect.closeTo(1, 5) }));
    expect([{ a: 1, b: 2 }]).toEqual([expect.objectContaining({ a: 1 })]);
    fails(() => expect([{ a: 1 }]).toEqual([expect.objectContaining({ a: 2 })]));
    expect([3, 1, 2]).toEqual(expect.arrayContaining([1, 2]));
    expect("x").toEqual(expect.any(String));
    fails(() => expect(1).toEqual(expect.any(String)));
  });
});

describe("numbers, strings, collections", () => {
  it("compare", () => {
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

  it("strings and arrays", () => {
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

  it("truthiness", () => {
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
    expect(0).toBeDefined();
    expect(1).toBeTruthy();
    expect("").toBeFalsy();
    fails(() => expect(undefined).toBeNull());
    fails(() => expect(0).toBeTruthy());
  });
});

describe("errors and promises", () => {
  class MyError extends Error {}

  it("toThrow", () => {
    expect(() => { throw new MyError("boom here"); }).toThrow();
    expect(() => { throw new MyError("boom here"); }).toThrow(MyError);
    expect(() => { throw new MyError("boom here"); }).toThrow(/boom/);
    expect(() => { throw new MyError("boom here"); }).toThrow("here");
    fails(() => expect(() => {}).toThrow());
    fails(() => expect(() => { throw new Error("a"); }).toThrow(MyError));
    fails(() => expect(() => { throw new Error("a"); }).toThrow(/b/));
    expect(() => {}).not.toThrow();
  });

  it("resolves / rejects", async () => {
    await expect(Promise.resolve(3)).resolves.toBe(3);
    await expect(Promise.reject(new Error("no"))).rejects.toThrow(/no/);
    let threw = false;
    try { await expect(Promise.resolve(1)).rejects.toThrow(); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  it("a label prefixes the failure message", () => {
    try { expect(1, "the count").toBe(2); } catch (e) { expect((e as Error).message).toMatch(/^the count: /); return; }
    throw new Error("didn't fail");
  });
});

describe("hooks and vi", () => {
  let ready = false;
  beforeAll(() => { ready = true; });
  afterAll(() => { vi.unstubAllGlobals(); });

  it("beforeAll ran", () => expect(ready).toBe(true));

  it("stubGlobal / unstubAllGlobals", () => {
    const real = globalThis.fetch;
    vi.stubGlobal("fetch", () => "stub");
    expect((globalThis.fetch as unknown as () => string)()).toBe("stub");
    vi.unstubAllGlobals();
    expect(globalThis.fetch).toBe(real);
  });

  it("fake Date", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2030, 0, 1));
    expect(new Date().toISOString()).toBe("2030-01-01T00:00:00.000Z");
    expect(Date.now()).toBe(Date.UTC(2030, 0, 1));
    vi.useRealTimers();
    expect(new Date().getFullYear()).toBeLessThan(2030);
  });

  it("vi.fn records calls and fakes results", async () => {
    const f = vi.fn((x: number) => x * 2);
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

  it("takes a per-test timeout", async () => { await new Promise((r) => setTimeout(r, 5)); }, 1_000);

  it.each([[1, 2, 3], [2, 3, 5]])("%i + %i = %i", (a, b, c) => expect(a + b).toBe(c));
  it.each([{ id: "x", n: 1 }])("$id has n = $n", (o) => expect(o.n).toBe(1));
});

describe("snapshots", () => {
  it("compares strings with the stored snapshot", () => {
    expect("line 1\nline `2` ${x} \\ \"q\"").toMatchSnapshot("tricky");
  });
});
