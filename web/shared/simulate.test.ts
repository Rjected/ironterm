import { describe, expect, it } from "vitest";
import { BIG_FOUR } from "./lifts";
import { TEMPLATES } from "./programs";
import { standardPct } from "./rpe";
import { compare, estimateE1rm, maxReps, simulate, startingConfig, tmFraction } from "./simulate";

// a typical intermediate lifter
const LIFTER = { squat: 216, bench: 204, deadlift: 270, ohp: 107 };
const START = "2026-01-05";
const rm = (n: number) => standardPct(n, 10);

describe("startingConfig: maxes carried over by each program's convention", () => {
  it("GZCLP: T1 = 85% of 5RM, T2 ≈ 65% of e1RM, T3 from a related lift", () => {
    const c = startingConfig("gzclp", {}, LIFTER, "lb", START);
    expect(c.startWeights["a1-t1"]).toBe(Math.round((0.85 * rm(5) * 216) / 5) * 5);
    expect(c.startWeights["a1-t1"] / 216).toBeCloseTo(0.73, 1);
    expect(c.startWeights["a2-t2"] / 216).toBeGreaterThan(0.6);
    expect(c.startWeights["a2-t2"] / 216).toBeLessThan(0.68);
    expect(c.startWeights["a1-t3"]).toBeGreaterThan(0); // lat pulldown sized off bench
    expect(c.increments).toEqual({ "a2-t2": 5 }); // template increments kept
  });
  it("nSuns / 5/3/1 TMs are 90%, SBS 'Max' and Candito '1RM' are 100%, Juggernaut 90%", () => {
    expect(startingConfig("nsuns5", {}, LIFTER, "lb", START).trainingMaxes).toMatchObject({ squat: 195, bench: 185, deadlift: 245, ohp: 95 });
    expect(startingConfig("531", {}, LIFTER, "lb", START).trainingMaxes.bench).toBe(185);
    expect(startingConfig("sbsRtf", {}, LIFTER, "lb", START).trainingMaxes).toMatchObject({ squat: 215, bench: 205, deadlift: 270, ohp: 105 });
    expect(startingConfig("candito6", {}, LIFTER, "lb", START).trainingMaxes.squat).toBe(215);
    expect(startingConfig("juggernaut", {}, LIFTER, "lb", START).trainingMaxes.squat).toBe(195);
  });
  it("RM-labelled maxes use that RM; Rippler splits T1 2RM / T2 5RM", () => {
    expect(tmFraction("5RM", "MAIN", 5)).toBeCloseTo(rm(5));
    expect(tmFraction("Goal weight (2–3RM)", "T1", 3)).toBeCloseTo(rm(2.5));
    expect(tmFraction("TM (T1 = 2RM, T2 = 5RM)", "T1", 3)).toBeCloseTo(rm(2));
    expect(tmFraction("TM (T1 = 2RM, T2 = 5RM)", "T2", 5)).toBeCloseTo(rm(5));
    expect(tmFraction("Training max (90% of 1RM)", "MAIN", 5)).toBe(0.9);
    expect(tmFraction("Working weight", "T1", 5)).toBeCloseTo(rm(7));
    expect(tmFraction("Goal 1RM", "MAIN", 1)).toBeCloseTo(1.05);
    const madcow = startingConfig("madcow", {}, LIFTER, "lb", START).trainingMaxes;
    expect(madcow.squat).toBe(Math.round((rm(5) * 216) / 5) * 5);
  });
  it("fills missing lifts from ratios; explicit accessory e1RMs win", () => {
    expect(estimateE1rm("frontSquat", LIFTER)).toBeCloseTo(0.8 * 216);
    expect(estimateE1rm("frontSquat", { ...LIFTER, frontSquat: 190 })).toBe(190);
    expect(estimateE1rm("deadlift", { squat: 200 })).toBeCloseTo(240);
    expect(estimateE1rm("pullUp", LIFTER)).toBe(0);
  });
  it("rep capacity is monotone and sane", () => {
    expect(maxReps(1)).toBe(1);
    expect(maxReps(1.05)).toBe(0);
    expect(maxReps(0.86)).toBeGreaterThan(4.5);
    expect(maxReps(0.86)).toBeLessThan(6);
    expect(maxReps(0.7)).toBeGreaterThan(11);
    expect(maxReps(0.7)).toBeLessThan(13);
    for (let f = 0.4; f < 1; f += 0.01) expect(maxReps(f)).toBeGreaterThanOrEqual(maxReps(f + 0.01));
  });
});

describe("simulate", () => {
  it("is deterministic for a seed", () => {
    const a = simulate("gzclp", {}, LIFTER, "lb", 6, { runs: 30, seed: 7 });
    const b = simulate("gzclp", {}, LIFTER, "lb", 6, { runs: 30, seed: 7 });
    const c = simulate("gzclp", {}, LIFTER, "lb", 6, { runs: 30, seed: 8 });
    expect(a).toEqual(b);
    expect(c.lifts.squat.trajectory[6]).not.toEqual(a.lifts.squat.trajectory[6]);
  });

  it("bands are ordered and start at your e1RM", () => {
    const r = simulate("nsuns5", {}, LIFTER, "lb", 8, { runs: 60 });
    for (const l of BIG_FOUR) {
      const p = r.lifts[l];
      expect(p.trajectory).toHaveLength(9);
      expect(p.trajectory[0].p50).toBe(LIFTER[l]);
      for (const b of p.trajectory) {
        expect(b.p10).toBeLessThanOrEqual(b.p50);
        expect(b.p50).toBeLessThanOrEqual(b.p90);
      }
      expect(p.trajectory[8].p50).toBeGreaterThan(LIFTER[l]);
    }
    expect(r.endState.trainingMaxes.squat.p50).toBeGreaterThan(195);
    expect(r.lifts.bench.sessionsPerWeek).toBe(2);
  });

  it("a novice on a linear progression improves faster than an advanced lifter on an advanced block", () => {
    const novice = simulate("stronglifts", {}, { squat: 135, bench: 115, deadlift: 185, ohp: 75 }, "lb", 12, { runs: 60, bodyweight: 180 });
    const advanced = simulate("sheiko-aml", {}, { squat: 500, bench: 340, deadlift: 600, ohp: 200 }, "lb", 12, { runs: 60, bodyweight: 200 });
    const pct = (r: typeof novice, l: "squat" | "bench") => r.lifts[l].gain.p50 / r.lifts[l].start;
    expect(novice.lifts.squat.level).toBeLessThan(0.35);
    expect(advanced.lifts.squat.level).toBeGreaterThan(0.9);
    expect(pct(novice, "squat")).toBeGreaterThan(0.15);
    expect(pct(advanced, "squat")).toBeLessThan(0.02);
    expect(pct(novice, "squat")).toBeGreaterThan(5 * pct(advanced, "squat"));
    expect(pct(novice, "bench")).toBeGreaterThan(5 * pct(advanced, "bench"));
  });

  it("program dose matters: a lift the program never trains doesn't grow", () => {
    const r = simulate("russian-squat", {}, LIFTER, "lb", 6, { runs: 30 });
    expect(r.lifts.squat.gain.p50).toBeGreaterThan(0);
    expect(r.lifts.bench.gain.p90).toBe(0);
  });

  it("GZCLP stages down, resets and retests once the lifter's capacity plateaus", () => {
    const flat = simulate("gzclp", {}, LIFTER, "lb", 16, { runs: 40, growthScale: 0 });
    const grow = simulate("gzclp", {}, LIFTER, "lb", 16, { runs: 40 });
    for (const l of BIG_FOUR) {
      expect(flat.lifts[l].trajectory[16].p50).toBe(LIFTER[l]);
      expect(flat.lifts[l].outcomes["stage-down"] ?? 0).toBeGreaterThan(1);
      expect(flat.lifts[l].resets).toBeGreaterThan(0.5);
    }
    // T1 runs out of stages → 5RM retest; T2 runs out → reset to 3×10
    expect(flat.lifts.squat.outcomes["retest-next"] ?? 0).toBeGreaterThan(0.5);
    expect(flat.lifts.squat.outcomes.retested ?? 0).toBeGreaterThan(0.5);
    expect(BIG_FOUR.some((l) => (flat.lifts[l].outcomes.reset ?? 0) > 0.5)).toBe(true);
    const total = (r: typeof flat) => BIG_FOUR.reduce((a, l) => a + r.lifts[l].resets, 0);
    expect(total(flat)).toBeGreaterThan(total(grow));
  });

  it("every template runs 4 weeks without throwing", () => {
    for (const t of TEMPLATES) {
      const r = simulate(t.id, {}, LIFTER, "lb", 4, { runs: 3 });
      for (const l of BIG_FOUR) {
        expect(Number.isFinite(r.lifts[l].trajectory[4].p50), `${t.id} ${l}`).toBe(true);
        expect(r.lifts[l].trajectory[4].p50, `${t.id} ${l}`).toBeGreaterThan(0);
      }
    }
  });

  it("works in kg", () => {
    const r = simulate("gzclp", {}, { squat: 98, bench: 92.5, deadlift: 122.5, ohp: 48.5 }, "kg", 4, { runs: 10 });
    expect(r.config.startWeights["a1-t1"] % 2.5).toBe(0);
    expect(r.lifts.squat.trajectory[4].p50).toBeGreaterThan(98);
  });

  it("is fast: 12 weeks × 200 runs", () => {
    for (const id of ["gzclp", "nsuns5", "sbsRtf"]) {
      simulate(id, {}, LIFTER, "lb", 2, { runs: 5 }); // warm up the JIT
      // Best of three, with ~10× headroom over a laptop's 150–250 ms: this catches an
      // accidental blow-up (quadratic replay, no caching), not a busy CI runner.
      let best = Infinity;
      for (let i = 0; i < 3 && best > 2500; i++) {
        const t = performance.now();
        simulate(id, {}, LIFTER, "lb", 12, { runs: 200 });
        best = Math.min(best, performance.now() - t);
      }
      expect(best, id).toBeLessThan(2500);
    }
  });
});

describe("compare", () => {
  it("summarizes the big four side by side", () => {
    const rows = compare(["gzclp", "nsuns5", "sbsRtf"], LIFTER, "lb", 6, { runs: 30 });
    expect(rows.map((r) => r.templateId)).toEqual(["gzclp", "nsuns5", "sbsRtf"]);
    for (const r of rows) {
      for (const l of BIG_FOUR) {
        expect(r.lifts[l].start).toBe(LIFTER[l]);
        expect(r.lifts[l].end.p50).toBeCloseTo(r.lifts[l].start + r.lifts[l].gain.p50, 0);
      }
      expect(r.totalGain).toBeGreaterThan(0);
    }
    expect(rows[1].sessionsPerWeek).toBe(5);
  });
});
