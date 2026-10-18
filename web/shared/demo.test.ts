import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { demoData } from "./demo";

const today = "2026-10-15";
const demo = demoData(today);
const boot: Bootstrap = {
  mode: "demo", auth: "none", settings: { unit: "lb", tz: "America/New_York" } as Bootstrap["settings"],
  program: demo.config, workouts: demo.workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
};
const d = derive(boot, "volume");
const best = (k: string) => Math.max(...(d.lifts[k] ?? []).map((p) => p.e1rm));

describe("demo data", () => {
  it("looks like a person: plausible lifts, in the usual order", () => {
    if (process.env.DEMO_PRINT) for (const k of d.liftKeys) console.log(k, Math.round(best(k)), Math.round(d.e1rmNow(k) ?? 0), d.lifts[k].length);
    // a year of GZCLP from modest starting weights, not a 600 lb squat and a 400 lb curl
    expect(best("squat")).toBeGreaterThan(200);
    expect(best("squat")).toBeLessThan(420);
    expect(best("deadlift")).toBeLessThan(480);
    expect(best("bench")).toBeLessThan(300);
    expect(best("ohp")).toBeLessThan(200);
    expect(best("bicepCurl")).toBeLessThan(120);
    expect(best("deadlift")).toBeGreaterThan(best("squat"));
    expect(best("squat")).toBeGreaterThan(best("bench"));
    expect(best("bench")).toBeGreaterThan(best("ohp"));
  });

  it("has misses and stage changes, so stall views have something to show", () => {
    const s = d.state!;
    const outcomes = new Set(s.log.flatMap((l) => l.results.map((x) => x.outcome)));
    for (const o of ["stage-down", "retested", "success"] as const) expect(outcomes).toContain(o);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(demoData(today).workouts)).toBe(JSON.stringify(demo.workouts));
  });
});
