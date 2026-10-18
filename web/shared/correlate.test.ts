import { describe, expect, it } from "vitest";
import { corrP, fisherCI, pearson, ranks, recoveryVsPerformance, sessionPerformance, spearman } from "./correlate";
import type { HevySet, HevyWorkout } from "./hevy";
import { addDays } from "./stats";
import type { WhoopRecovery } from "./whoop";

const SQ = "Squat (Barbell)";
const W = (id: string, date: string, sets: [number, number, HevySet["type"]?][], title = SQ): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: [{ title, exercise_template_id: title, sets: sets.map(([kg, reps, type]) => ({ type: type ?? "normal", weight_kg: kg, reps })) }],
});

describe("stats helpers", () => {
  it("pearson / spearman / ranks", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [1, 10, 100, 1000])).toBeCloseTo(1); // monotone, non-linear
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("p-value and CI match textbook values", () => {
    // r = 0.5, n = 20 → t = 2.449, df 18 → p ≈ 0.0248
    expect(corrP(0.5, 20)!).toBeCloseTo(0.0248, 3);
    expect(corrP(0, 30)!).toBeCloseTo(1, 6);
    const [lo, hi] = fisherCI(0.5, 20)!;
    expect(lo).toBeCloseTo(0.071, 2);
    expect(hi).toBeCloseTo(0.771, 2);
  });
});

describe("sessionPerformance", () => {
  it("e1RM vs the prior 28-day best, ignoring older sessions", () => {
    const ws = [W("old", "2026-01-01", [[200, 1]]), W("a", "2026-02-01", [[100, 5]]), W("b", "2026-02-05", [[110, 5]]), W("c", "2026-02-08", [[99, 5]])];
    const s = sessionPerformance(ws, "UTC", []);
    expect(s.map((x) => x.workoutId)).toEqual(["old", "a", "b", "c"]);
    expect(s[1].e1rmPct).toBeNull(); // 200 kg was > 28 days ago
    expect(s[2].e1rmPct).toBeCloseTo(10);
    expect(s[3].e1rmPct).toBeCloseTo(-10);
  });
  it("AMRAP-ish last set vs reps the prior best predicts", () => {
    const ws = [W("a", "2026-02-01", [[100, 5]]), W("b", "2026-02-03", [[90, 5], [90, 5], [90, 10]]), W("c", "2026-02-05", [[90, 5], [90, 6]]), W("d", "2026-02-07", [[95, 6, "failure"]])];
    const s = sessionPerformance(ws, "UTC", []);
    // prior best 116.67 → expected at 90 = 30·(116.67/90 − 1) = 8.89
    expect(s[1].lifts[0].amrap!.expected).toBeCloseTo(8.89, 2);
    expect(s[1].amrapDelta).toBeCloseTo(1.11, 2);
    expect(s[2].amrapDelta).toBeNull(); // +1 rep isn't AMRAP-ish
    expect(s[3].amrapDelta).not.toBeNull(); // marked failure
  });
  it("joins recovery, sleep and yesterday's strain (explicit or from WHOOP workouts)", () => {
    const ws = [W("a", "2026-02-01", [[100, 5]]), W("b", "2026-02-03", [[100, 5]])];
    const rec: WhoopRecovery[] = [{ date: "2026-02-03", score: 80, hrv: 90, rhr: 50 }];
    const s = sessionPerformance(ws, "UTC", rec, { sleep: [{ date: "2026-02-03", hours: 7.5 }], whoopWorkouts: [{ id: "x", start: "2026-02-02T18:00:00Z", end: "2026-02-02T19:00:00Z", sport: "run", strain: 12.3 }] });
    expect(s[1]).toMatchObject({ recovery: 80, hrv: 90, rhr: 50, sleep: 7.5, prevStrain: 12.3 });
    expect(sessionPerformance(ws, "UTC", rec, { strain: [{ date: "2026-02-01", strain: 9 }], lagDays: 2 })[1].prevStrain).toBe(9);
  });
  it("skips bodyweight lifts and unloaded sets", () => {
    const s = sessionPerformance([W("p", "2026-02-01", [[0, 10]], "Pull Up")], "UTC", []);
    expect(s).toEqual([]);
  });
});

describe("recoveryVsPerformance", () => {
  // 30 sessions every other day at a steady 100×5 baseline; on good-recovery days the lifter does a bit more.
  const mk = (perf: (rec: number, i: number) => number) => {
    const ws: HevyWorkout[] = [], rec: WhoopRecovery[] = [];
    for (let i = 0; i < 31; i++) {
      const date = addDays("2026-03-01", i * 2);
      const score = (i * 37) % 100;
      rec.push({ date, score, hrv: 40 + score / 2, rhr: 60 - score / 10 });
      // alternate a fixed reference session so the rolling best stays at 100×5
      ws.push(W(`ref${i}`, addDays(date, -1), [[100, 5]]));
      ws.push(W(`s${i}`, date, [[perf(score, i), 5]]));
    }
    return { ws, rec };
  };
  it("finds a real effect, with buckets and a guarded finding", () => {
    const { ws, rec } = mk((s) => 80 + s * 0.12 + (s % 7));
    const r = recoveryVsPerformance(ws, "UTC", rec);
    const c = r.correlations.find((x) => x.predictor === "recovery" && x.metric === "e1rmPct")!;
    expect(c.n).toBeGreaterThanOrEqual(30);
    expect(c.spearman!).toBeGreaterThan(0.8);
    expect(c.ci95![0]).toBeGreaterThan(0);
    expect(r.correlations.find((x) => x.predictor === "rhr" && x.metric === "e1rmPct")!.spearman!).toBeLessThan(-0.8);
    const [red, , green] = r.buckets;
    expect(green.meanE1rmPct!).toBeGreaterThan(red.meanE1rmPct!);
    expect(r.finding).toMatch(/higher WHOOP recovery went with better e1RM.*excludes zero.*green days/);
  });
  it("noise → says it's consistent with no effect", () => {
    const { ws, rec } = mk((_, i) => 85 + ((i * 7919) % 13));
    const r = recoveryVsPerformance(ws, "UTC", rec);
    const c = r.correlations.find((x) => x.predictor === "recovery" && x.metric === "e1rmPct")!;
    expect(c.ci95![0]).toBeLessThan(0);
    expect(r.finding).toMatch(/includes zero/);
  });
  it("no finding below minN", () => {
    const { ws, rec } = mk((s) => 80 + s * 0.12);
    const r = recoveryVsPerformance(ws.slice(0, 20), "UTC", rec);
    expect(r.finding).toBeNull();
    expect(r.correlations.every((c) => c.summary === null)).toBe(true);
    expect(recoveryVsPerformance(ws, "UTC", rec, { lagDays: 0 }).correlations.some((c) => c.predictor === "prevStrain")).toBe(false);
  });
});
