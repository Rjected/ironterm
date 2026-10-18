import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { e1rmWith, formulaShootout, FORMULAS, loadForReps } from "./e1rm";
import { addDays } from "./stats";
import { toKg } from "./units";

type S = [number, number, number?]; // lb, reps, rpe
const W = (id: string, date: string, ex: [string, S[]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps, rpe]) => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps, rpe: rpe ?? null })) })),
});
const SQ = "Squat (Barbell)", BP = "Bench Press (Barbell)";

describe("e1rmWith", () => {
  it("matches published formulas", () => {
    expect(e1rmWith("epley", 200, 5)).toBeCloseTo(233.33, 1);
    expect(e1rmWith("brzycki", 200, 5)).toBeCloseTo(225, 5);
    expect(e1rmWith("oconner", 200, 5)).toBeCloseTo(225, 5);
    expect(e1rmWith("lombardi", 200, 5)).toBeCloseTo(200 * 5 ** 0.1, 5);
    expect(e1rmWith("lander", 200, 5)).toBeCloseTo(20000 / (101.3 - 13.35615), 4);
    expect(e1rmWith("mayhew", 200, 5)).toBeCloseTo(20000 / (52.2 + 41.9 * Math.exp(-0.275)), 4);
    expect(e1rmWith("wathan", 200, 5)).toBeCloseTo(20000 / (48.8 + 53.8 * Math.exp(-0.375)), 4);
  });
  it("1 rep = weight for every formula at RPE 10; RTS uses RPE", () => {
    for (const f of FORMULAS) expect(e1rmWith(f, 300, 1)).toBeCloseTo(300, 5);
    expect(e1rmWith("rts", 300, 1, 9)).toBeCloseTo(300 / 0.955, 3);
    expect(e1rmWith("rts", 200, 3, 8)).toBeCloseTo(200 / 0.863, 3);
    expect(e1rmWith("epley", 0, 5)).toBe(0);
  });
  it("loadForReps inverts e1rmWith", () => {
    for (const f of FORMULAS) expect(loadForReps(f, e1rmWith(f, 185, 6, 8), 6, 8)).toBeCloseTo(185, 6);
  });
});

// Synthetic lifter whose true curve is Brzycki: 5RM sets every week, a heavy single every 3 weeks.
function brzyckiLifter(lift = SQ, base = 300, n = 8): HevyWorkout[] {
  const out: HevyWorkout[] = [];
  let d = "2025-01-06";
  for (let i = 0; i < n * 3; i++) {
    const oneRm = base; // flat, so the 5s right before a single predict it exactly
    out.push(W(`w${lift}${i}`, d, [[lift, [[(oneRm * (37 - 5)) / 36, 5]]]]));
    if (i % 3 === 2) out.push(W(`t${lift}${i}`, addDays(d, 3), [[lift, [[oneRm, 1]]]]));
    d = addDays(d, 7);
  }
  return out;
}

describe("formulaShootout", () => {
  it("picks the formula that generated the data", () => {
    const r = formulaShootout(brzyckiLifter(), "squat", "lb", { poolLifts: [] });
    expect(r.n).toBeGreaterThanOrEqual(5);
    expect(r.adequate).toBe(true);
    expect(r.best).toBe("brzycki");
    expect(r.scores[0].meanAbsPct!).toBeLessThan(1e-9);
    const ep = r.scores.find((s) => s.formula === "epley")!;
    expect(ep.bias!).toBeGreaterThan(0); // Epley over-predicts from 5s vs Brzycki
    expect(r.note).toMatch(/Brzycki fits best/);
  });
  it("falls back to Epley when thin, and pools across lifts", () => {
    const thin = brzyckiLifter(SQ, 300, 2); // 2 tests
    const r = formulaShootout(thin, "squat", "lb", { poolLifts: [] });
    expect(r.n).toBe(2);
    expect(r.adequate).toBe(false);
    expect(r.best).toBe("epley");
    expect(r.note).toMatch(/need 5/);
    const pooled = formulaShootout([...thin, ...brzyckiLifter(BP, 200, 6)], "squat", "lb");
    expect(pooled.pooled).toBe(true);
    expect(pooled.nLift).toBe(2);
    expect(pooled.liftsUsed).toEqual(["squat", "bench"]);
    expect(pooled.best).toBe("brzycki");
  });
  it("ignores light singles, sub-RPE-9 singles, and tests without predictor sets", () => {
    const ws = [
      W("a", "2025-01-01", [[SQ, [[300, 5]]]]),
      W("b", "2025-01-08", [[SQ, [[200, 1], [300, 1, 7]]]]), // light, and RPE 7
      W("c", "2025-06-01", [[SQ, [[345, 1]]]]), // nothing in the 6 weeks before
    ];
    const r = formulaShootout(ws, "squat", "lb", { poolLifts: [] });
    expect(r.n).toBe(0);
    expect(r.best).toBe("epley");
    expect(r.note).toMatch(/can't backtest/);
  });
});
