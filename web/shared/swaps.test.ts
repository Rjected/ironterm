import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { appProgram, startProgram, swapLift } from "./appapi";
import { demoData } from "./demo";
import { buildProgram, defaultConfig } from "./programs";
import type { ProgramConfig } from "./program";
import { applySwaps, programLifts, similarLifts } from "./swaps";
import { programSwaps } from "./swap-list";

const today = "2026-10-18";
const demo = demoData(today);
const boot = (program: ProgramConfig): Bootstrap => ({
  mode: "demo", auth: "none", settings: { unit: "lb", tz: "America/New_York", trainingDays: [6, 1, 3] } as Bootstrap["settings"],
  program, workouts: demo.workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
});
const monolith = (): ProgramConfig => {
  const r = startProgram(boot(demo.config), "531-monolith", { startDate: today });
  if ("error" in r) throw new Error(r.error);
  return r.cfg;
};

describe("replacements, most alike first", () => {
  it("lists the obvious swaps first", () => {
    expect(similarLifts("facePull").slice(0, 2).map((o) => o.lift)).toEqual(["rearDeltFly", "bandPullApart"]);
    expect(similarLifts("dip")[0].lift).toBe("pushUp");
    expect(similarLifts("chinUp").slice(0, 2).map((o) => o.lift)).toEqual(["pullUp", "latPulldown"]);
  });

  it("scores are 0–1, sorted, and never offer the lift itself", () => {
    for (const lift of ["squat", "bench", "facePull", "shrug", "bicepCurl"]) {
      const xs = similarLifts(lift);
      expect(xs.length).toBeGreaterThan(3);
      expect(xs.some((o) => o.lift === lift)).toBe(false);
      for (const o of xs) expect(o.score >= 0 && o.score <= 1).toBe(true);
      expect([...xs].sort((a, b) => b.score - a.score).map((o) => o.lift)).toEqual(xs.map((o) => o.lift));
    }
  });

  it("keeps upper-body swaps upper-body", () => {
    expect(similarLifts("facePull").slice(0, 5).every((o) => !["squat", "deadlift", "legPress"].includes(o.lift))).toBe(true);
  });
});

describe("applySwaps", () => {
  it("replaces a lift on every day it appears, training max included", () => {
    const cfg = { ...defaultConfig("531-monolith", "lb", `${today}T00:00:00Z`), swaps: { dip: "pushUp", facePull: "rearDeltFly", squat: "frontSquat" } };
    const def = buildProgram(cfg)!;
    const lifts = def.days.flatMap((d) => d.slots.map((s) => s.lift));
    expect(lifts).not.toContain("dip");
    expect(lifts).not.toContain("facePull");
    expect(lifts).not.toContain("squat");
    expect(lifts.filter((l) => l === "rearDeltFly").length).toBe(2); // Monday and Friday
    for (const s of def.days.flatMap((d) => d.slots)) if (s.progression.kind === "percent") expect(s.progression.tmLift).not.toBe("squat");
    if (def.cycle?.tmIncrease) expect(Object.keys(def.cycle.tmIncrease)).not.toContain("squat");
  });

  it("does nothing without swaps, and ignores unknown replacements", () => {
    const base = defaultConfig("531-monolith", "lb", `${today}T00:00:00Z`);
    const def = buildProgram(base)!;
    expect(applySwaps(def, undefined)).toBe(def);
    expect(programLifts(applySwaps(def, { dip: "notALift" }))).toContain("dip");
  });
});

describe("POST /api/app/program/swap (swapLift)", () => {
  it("swaps, shows the swap, plans the new exercise with a real weight, and undoes", () => {
    const cfg = monolith();
    const r = swapLift(boot(cfg), { lift: "facePull", to: "rearDeltFly" });
    if ("error" in r) throw new Error(r.error);
    expect(r.cfg.swaps).toEqual({ facePull: "rearDeltFly" });
    expect(programSwaps(r.cfg).find((x) => x.lift === "facePull")?.to?.lift).toBe("rearDeltFly");
    const prog = appProgram(boot(r.cfg)).program!;
    expect(prog.slots.some((s) => s.lift === "rearDeltFly")).toBe(true);
    expect(prog.slots.some((s) => s.lift === "facePull")).toBe(false);
    expect(prog.swaps.find((x) => x.lift === "facePull")?.options[0].lift).toBe("rearDeltFly");
    // every day plans with real numbers, the swapped exercise included
    const d = derive(boot(r.cfg), "volume");
    const planned = d.def!.days.map((_, i) => d.plan(i)!);
    expect(planned.some((p) => p.exercises.some((e) => e.lift === "rearDeltFly"))).toBe(true);
    for (const p of planned) for (const e of p.exercises) for (const set of e.sets) expect(Number.isFinite(set.weight)).toBe(true);
    // undo
    const u = swapLift(boot(r.cfg), { lift: "facePull", to: null });
    if ("error" in u) throw new Error(u.error);
    expect(u.cfg.swaps).toEqual({});
  });

  it("drops the old exercise's saved start weight so the new one starts fresh", () => {
    const cfg = monolith();
    const def = buildProgram(cfg)!;
    const dipSlots = def.days.flatMap((d) => d.slots).filter((s) => s.lift === "dip").map((s) => s.id);
    const withWeights = { ...cfg, startWeights: { ...cfg.startWeights, ...Object.fromEntries(dipSlots.map((id) => [id, 45])) } };
    const r = swapLift(boot(withWeights), { lift: "dip", to: "pushUp" });
    if ("error" in r) throw new Error(r.error);
    for (const id of dipSlots) expect(r.cfg.startWeights[id]).toBeUndefined();
    const d = derive(boot(r.cfg), "volume");
    expect(d.def!.days.some((_, i) => d.plan(i)!.exercises.some((e) => e.lift === "pushUp"))).toBe(true);
  });

  it("refuses bad input", () => {
    const b = boot(monolith());
    expect("error" in swapLift(b, { lift: "legPress", to: "squat" })).toBe(true); // not in the program
    expect("error" in swapLift(b, { lift: "dip", to: "notALift" })).toBe(true);
    expect("error" in swapLift(b, { lift: "dip", to: "dip" })).toBe(true);
    expect("error" in swapLift(b, null)).toBe(true);
    expect("error" in swapLift({ ...b, program: null }, { lift: "dip", to: "pushUp" })).toBe(true);
  });
});

