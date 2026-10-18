import { describe, expect, it } from "vitest";
import type { HevySet, HevyWorkout } from "./hevy";
import { inolBand, plannedInol, plannedSetIntensity, prilepin, prilepinZone, PRILEPIN, primaryZone, sessionInol, setInol, weeklyInol } from "./inol";
import { initialState, type ProgramConfig, type ProgramDef, type SlotDef } from "./program";
import { toKg } from "./units";

type S = [number, number] | [number, number, HevySet["type"]];
const W = (id: string, date: string, ex: [string, S[]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps, type]) => ({ type: type ?? "normal", weight_kg: toKg(lb, "lb"), reps })) })),
});
const rep = (n: number, lb: number, reps: number): S[] => Array.from({ length: n }, () => [lb, reps]);
const SQ = "Squat (Barbell)";
const cfg = (over: Partial<ProgramConfig> = {}): ProgramConfig => ({ templateId: "t", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: {}, ...over });
const prog = (days: [string, SlotDef[]][], extra: Partial<ProgramDef> = {}): ProgramDef => ({ templateId: "t", name: "t", sessionsPerWeek: days.length, days: days.map(([id, slots]) => ({ id, name: id, slots })), ...extra });

describe("INOL formula and bands", () => {
  it("reps / (100 − %1RM)", () => {
    expect(setInol(5, 0.8)).toBeCloseTo(0.25);
    expect(5 * setInol(5, 0.8)).toBeCloseTo(1.25); // 5×5 @ 80 %
    expect(3 * setInol(3, 0.9)).toBeCloseTo(0.9);
    expect(setInol(1, 1)).toBeCloseTo(1); // capped at 99 %, no division by zero
    expect(setInol(0, 0.8)).toBe(0);
  });
  it("Hristov's session and weekly bands", () => {
    expect(inolBand(0.39).band).toBe("low");
    expect(inolBand(0.4).band).toBe("optimal");
    expect(inolBand(0.99).band).toBe("optimal");
    expect(inolBand(1).band).toBe("hard");
    expect(inolBand(2.1).band).toBe("veryHard");
    expect(inolBand(1.5, "week").band).toBe("low");
    expect(inolBand(2.5, "week").band).toBe("optimal");
    expect(inolBand(3.5, "week").band).toBe("hard");
    expect(inolBand(4.5, "week").band).toBe("veryHard");
  });
});

describe("Prilepin's chart", () => {
  it("zones, with 65–70 % folded into the lowest", () => {
    expect(prilepinZone(0.54)).toBeNull();
    expect(prilepinZone(0.55)?.id).toBe("55-65");
    expect(prilepinZone(0.68)?.id).toBe("55-65");
    expect(prilepinZone(0.7)?.id).toBe("70-80");
    expect(prilepinZone(0.85)?.id).toBe("80-90");
    expect(prilepinZone(0.9)?.id).toBe("90+");
    expect(prilepinZone(1)?.id).toBe("90+");
  });
  it("Prilepin's optimal numbers all sit at INOL ≈ 0.6–1.0 (Hristov)", () => {
    const mid: Record<string, number> = { "55-65": 0.6, "70-80": 0.75, "80-90": 0.85, "90+": 0.925 };
    for (const z of PRILEPIN) {
      const i = setInol(z.optimal, mid[z.id]);
      expect(i, z.id).toBeGreaterThanOrEqual(0.59);
      expect(i, z.id).toBeLessThanOrEqual(1.01);
    }
  });
  it("verdicts per zone", () => {
    const at = (n: number, reps: number, pct: number) => Array.from({ length: n }, () => ({ reps, pct }));
    expect(prilepin(at(5, 3, 0.85))[0]).toMatchObject({ zone: "80-90", reps: 15, verdict: "optimal", setsOutsideRepRange: 0 });
    expect(prilepin(at(5, 5, 0.85))[0]).toMatchObject({ reps: 25, verdict: "above", setsOutsideRepRange: 5 });
    expect(prilepin(at(1, 5, 0.85))[0].verdict).toBe("below");
    // 5/3/1 week 1: one set in each of three zones, plus a light set outside the chart
    const r = prilepin([{ reps: 5, pct: 0.5 }, { reps: 5, pct: 0.6 }, { reps: 5, pct: 0.7 }, { reps: 8, pct: 0.8 }]);
    expect(r.map((x) => x.zone)).toEqual(["55-65", "70-80", "80-90"]);
    expect(r.every((x) => x.verdict === "below")).toBe(true);
    expect(primaryZone(r)?.zone).toBe("80-90");
  });
});

describe("sessionInol (history)", () => {
  const hist = [
    W("max", "2026-01-05", [[SQ, [[300, 1]]]]),
    // warmup-typed and light ramp sets don't count; 5×5 @ 240 = 80 % of the 300 single
    W("a", "2026-01-12", [[SQ, [[135, 5, "warmup"], [100, 5], ...rep(5, 240, 5)]]]),
    W("b", "2026-01-14", [[SQ, rep(3, 270, 3)]]),
    // 400 days later the 300 single has left the window: ref = this session's 240×5 e1RM
    W("late", "2027-02-18", [[SQ, rep(5, 240, 5)]]),
  ];
  const s = sessionInol(hist, "squat", "lb", "UTC");
  it("uses the rolling best e1RM and skips warm-ups", () => {
    const a = s.find((x) => x.workoutId === "a")!;
    expect(a.e1rm).toBeCloseTo(300);
    expect(a.sets).toHaveLength(5);
    expect(a.inol).toBeCloseTo(1.25, 2);
    expect(a).toMatchObject({ band: "hard", zone: "80-90", zoneReps: 25, verdict: "above", week: "2026-01-12" });
    expect(a.avgPct).toBeCloseTo(0.8, 3);
  });
  it("first session is relative to itself; window drops stale maxes", () => {
    expect(s[0].inol).toBeCloseTo(1, 2); // 1 rep at 100 % → capped at 99 %
    const late = s.find((x) => x.workoutId === "late")!;
    expect(late.e1rm).toBeCloseTo(280);
    expect(late.avgPct).toBeCloseTo(240 / 280, 3);
    expect(sessionInol(hist, "squat", "lb", "UTC", { windowDays: Infinity }).find((x) => x.workoutId === "late")!.e1rm).toBeCloseTo(300);
  });
  it("weekly sums", () => {
    const wk = weeklyInol(s);
    const jan12 = wk.find((w) => w.week === "2026-01-12")!;
    expect(jan12.sessions).toBe(2);
    expect(jan12.inol).toBeCloseTo(1.25 + 9 / 10, 2);
    expect(jan12.band).toBe("optimal");
  });
  it("ignores bodyweight-only sessions", () => {
    expect(sessionInol([W("p", "2026-01-01", [["Pull Up", [[0, 10]]]])], "pullUp", "lb", "UTC")).toEqual([]);
  });
});

describe("plannedInol (program)", () => {
  it("percent of a 1RM max", () => {
    const sl: SlotDef = { id: "s", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 0.8, reps: 5 }, { pct: 0.8, reps: 5 }, { pct: 0.8, reps: 5 }]] } };
    const def = prog([["A", [sl]]], { maxLabel: "1RM" });
    const c = cfg({ trainingMaxes: { squat: 300 } });
    const p = plannedInol(def, c, initialState(def, c));
    expect(p.days).toHaveLength(1);
    expect(p.days[0].lifts[0]).toMatchObject({ lift: "squat", reps: 15, zone: "80-90", verdict: "optimal", band: "optimal" });
    expect(p.days[0].lifts[0].inol).toBeCloseTo(0.75);
    // a training max (default label) is ~90 % of 1RM, so the same % is lighter
    const tm = plannedInol({ ...def, maxLabel: undefined }, c, initialState(def, c));
    expect(tm.days[0].lifts[0].avgPct).toBeCloseTo(0.72);
    expect(tm.days[0].lifts[0].inol).toBeCloseTo(15 / 28);
  });
  it("weights ÷ supplied 1RM; tier-default RIR without one; weekly scaled to sessionsPerWeek", () => {
    const fixed = (id: string, lift: string): SlotDef => ({ id, lift, tier: "MAIN", progression: { kind: "fixed", sets: 5, reps: 5 } });
    const def = prog([["A", [fixed("sq", "squat")]], ["B", [fixed("sq2", "squat"), fixed("bp", "bench")]]], { sessionsPerWeek: 3 });
    const c = cfg({ startWeights: { sq: 200, sq2: 200, bp: 150 } });
    const st = initialState(def, c);
    const p = plannedInol(def, c, st, { maxes: { squat: 250 } });
    expect(p.days[0].lifts[0].avgPct).toBeCloseTo(0.8);
    expect(p.days[0].lifts[0].inol).toBeCloseTo(1.25);
    // bench has no max: MAIN tier assumes 2 RIR → 5 reps ≈ 81 % (Epley)
    const bp = p.days[1].lifts.find((l) => l.lift === "bench")!;
    expect(bp.avgPct).toBeCloseTo(1 / (1 + 7 / 30), 3);
    expect(p.weeks).toHaveLength(1);
    expect(p.weeks[0].sessions).toBe(2);
    expect(p.weeks[0].lifts.squat).toBeCloseTo(2 * 1.25 * 1.5); // 2 squat days per pass × 3/2 sessions
    expect(p.weeks[0].bands.squat).toBe("hard");
    expect(plannedInol(def, c, st, { lifts: ["bench"] }).days[0].lifts).toEqual([]);
  });
  it("covers every week of a cycle", () => {
    const sl: SlotDef = { id: "s", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 0.7, reps: 5 }], [{ pct: 0.9, reps: 3 }]] } };
    const def = prog([["A", [sl]]], { maxLabel: "1RM", cycle: { weeks: 2 } });
    const c = cfg({ trainingMaxes: { squat: 300 } });
    const p = plannedInol(def, c, initialState(def, c));
    expect(p.days.map((d) => [d.week, d.lifts[0].zone])).toEqual([[0, "70-80"], [1, "90+"]]);
    expect(p.weeks.map((w) => w.week)).toEqual([0, 1]);
  });
  it("AMRAP and RPE sets", () => {
    const amrap = plannedSetIntensity({ weight: 255, reps: 5, amrap: true, pct: 0.85 }, "MAIN", 0.9);
    expect(amrap.pct).toBeCloseTo(0.765);
    expect(amrap.reps).toBeGreaterThan(5); // AMRAPs go past the minimum
    const rpe = plannedSetIntensity({ weight: 0, reps: 3, amrap: false, rpe: 8 }, "MAIN", 0.9);
    expect(rpe.pct).toBeCloseTo(1 / (1 + 5 / 30));
  });
});
