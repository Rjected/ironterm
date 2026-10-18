import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { prWall, recentPRs } from "./prwall";
import { toKg } from "./units";

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: lb ? toKg(lb, "lb") : null, reps })) })),
});
const SQ = "Squat (Barbell)", PU = "Pull Up";
const hist = [
  W("a", "2026-01-01", [[SQ, [[200, 5], [225, 1]]]]),
  W("b", "2026-02-01", [[SQ, [[210, 5]]]]),
  W("c", "2026-03-01", [[SQ, [[215, 3], [205, 5]]]]),
  W("d", "2026-04-01", [[SQ, [[245, 1]]], [PU, [[0, 8], [25, 3]]]]),
  W("e", "2026-05-01", [[PU, [[0, 12]]]]),
];

describe("prWall", () => {
  const w = prWall(hist, "squat", "lb", { today: "2026-06-01" });
  const rm = (r: number) => w.repMaxes.find((x) => x.reps === r)!;
  it("rep maxes use ≥N reps and track progression", () => {
    expect(w.repMaxes.map((r) => r.reps)).toEqual([1, 2, 3, 4, 5]);
    expect(rm(5).value).toBeCloseTo(210, 6);
    expect(rm(5).improvements).toBe(1);
    expect(rm(5).history.map((h) => h.date)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(rm(5).stoodDays).toBe(120);
    expect(rm(3).value).toBeCloseTo(215, 6);
    expect(rm(3).setReps).toBe(3);
    expect(rm(3).improvements).toBe(2); // 200×5 → 210×5 → 215×3
    expect(rm(1).value).toBeCloseTo(245, 6);
    expect(rm(1).history.map((h) => Math.round(h.weight))).toEqual([225, 245]);
    expect(rm(1).history[1].prev).toBeCloseTo(225, 6);
  });
  it("e1RM record and oldest-standing order", () => {
    expect(w.e1rm!.value).toBeCloseTo(245, 6);
    expect(w.e1rm!.history.length).toBe(2); // 233.3 (200×5) → 245 (210×5); 245×1 ties, not a PR
    expect(w.e1rm!.date).toBe("2026-02-01");
    expect(w.oldest[0].stoodDays).toBeGreaterThanOrEqual(w.oldest[w.oldest.length - 1].stoodDays);
    expect(w.oldest[0]).toMatchObject({ kind: "rep", reps: 4, date: "2026-02-01" });
    expect(w.maxReps).toBeNull(); // loaded lift: no max-reps record
  });
  it("bodyweight lifts: added load per rep count, plus max reps", () => {
    const p = prWall(hist, "pullUp", "lb", { today: "2026-06-01" });
    expect(p.bodyweight).toBe(true);
    expect(p.repMaxes.find((r) => r.reps === 3)!.value).toBeCloseTo(25, 6);
    expect(p.repMaxes.find((r) => r.reps === 8)!.value).toBe(0);
    expect(p.repMaxes.find((r) => r.reps === 12)!.value).toBe(0);
    expect(p.maxReps!.value).toBe(12);
    expect(p.maxReps!.improvements).toBe(1);
    expect(p.e1rm!.value).toBeCloseTo(27.5, 6);
  });
});

describe("recentPRs", () => {
  it("lists real PRs since a date across lifts, one per set", () => {
    const r = recentPRs(hist, "2026-03-01", { unit: "lb" });
    const sq = r.filter((e) => e.lift === "squat" && e.kind === "rep");
    // 215×3 beat the 2RM and 3RM → reported once, at 3; 245×1 beat the 1RM
    expect(sq.map((e) => [e.date, e.reps])).toEqual([["2026-04-01", 1], ["2026-03-01", 3]]);
    expect(r.some((e) => e.lift === "pullUp" && e.kind === "maxReps" && e.setReps === 12)).toBe(true);
    // first-ever records excluded by default
    expect(r.some((e) => e.first)).toBe(false);
    expect(recentPRs(hist, "2026-03-01", { unit: "lb", includeFirsts: true }).some((e) => e.first)).toBe(true);
    expect(r[0].date >= r[r.length - 1].date).toBe(true);
  });
});
