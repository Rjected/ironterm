import { describe, expect, it } from "vitest";
import type { HevySet, HevyWorkout } from "./hevy";
import { averageWeeks, isHardSet, isoWeek, LANDMARK_GROUPS, LANDMARKS, landmarkStatus, MUSCLE_GROUP, programMuscleSets, weeklyMuscleSets } from "./landmarks";
import { MUSCLE_IDS } from "./muscles";
import { initialState, type ProgramConfig, type ProgramDef, type SlotDef } from "./program";
import { toKg } from "./units";

type S = [number, number] | [number, number, HevySet["type"]] | [number, number, HevySet["type"], number];
const W = (id: string, iso: string, ex: [string, S[]][]): HevyWorkout => ({
  id, title: id, start_time: iso, end_time: iso,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps, type, rpe]) => ({ type: type ?? "normal", weight_kg: toKg(lb, "lb"), reps, rpe: rpe ?? null })) })),
});
const rep = (n: number, lb: number, reps: number): S[] => Array.from({ length: n }, () => [lb, reps]);
const BP = "Bench Press (Barbell)";
const cfg = (over: Partial<ProgramConfig> = {}): ProgramConfig => ({ templateId: "t", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: {}, ...over });

describe("tables", () => {
  it("every muscle maps to a known group or null; every group has members", () => {
    for (const m of MUSCLE_IDS) expect(m in MUSCLE_GROUP, m).toBe(true);
    for (const g of LANDMARK_GROUPS) expect(Object.values(MUSCLE_GROUP).includes(g), g).toBe(true);
  });
  it("landmarks are ordered MV ≤ MEV ≤ MAV ≤ MRV", () => {
    for (const l of Object.values(LANDMARKS)) {
      expect(l.mv, l.group).toBeLessThanOrEqual(l.mev);
      expect(l.mev, l.group).toBeLessThanOrEqual(l.mav[0]);
      expect(l.mav[0], l.group).toBeLessThanOrEqual(l.mav[1]);
      expect(l.mav[1], l.group).toBeLessThanOrEqual(l.mrv);
    }
  });
  it("ISO week labels", () => {
    expect(isoWeek("2021-01-04")).toBe("2021-W01");
    expect(isoWeek("2020-12-31")).toBe("2020-W53");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2026-10-12")).toBe("2026-W42");
  });
});

describe("hard sets", () => {
  it("logged RPE wins, failure counts, ≥ 60 % counts, near-failure light sets count", () => {
    expect(isHardSet({ reps: 10, pct: 0.3, rpe: 6 })).toBe(true);
    expect(isHardSet({ reps: 5, pct: 0.9, rpe: 5 })).toBe(false);
    expect(isHardSet({ reps: 5, pct: 0.3, failure: true })).toBe(true);
    expect(isHardSet({ reps: 3, pct: 0.6 })).toBe(true);
    expect(isHardSet({ reps: 5, pct: 0.45 })).toBe(false); // ramp-up set
    expect(isHardSet({ reps: 22, pct: 0.55 })).toBe(true); // Epley: ~24 possible → 2.5 RIR
    expect(isHardSet({ reps: 10 })).toBe(true); // bodyweight / unknown load
    expect(isHardSet({ reps: 5, pct: 0.45 }, { countAll: true })).toBe(true);
    expect(isHardSet({ reps: 3, pct: 0.65 }, { minPct: 0.7 })).toBe(false);
  });
});

describe("weeklyMuscleSets", () => {
  const ws = [
    // Sunday evening in LA = Monday UTC: belongs to the week of Dec 29
    W("a", "2026-01-05T03:00:00Z", [[BP, [[45, 10, "warmup"], [95, 5], ...rep(3, 200, 5)]], ["Mystery Machine", [[50, 10]]]]),
    W("b", "2026-01-15T18:00:00Z", [[BP, [[200, 5, "normal", 5], [200, 5, "normal", 8]]], ["Pull Up", [[0, 8]]]]),
  ];
  const weeks = weeklyMuscleSets(ws, "America/Los_Angeles");
  it("buckets by local Monday and fills empty weeks", () => {
    expect(weeks.map((w) => [w.week, w.isoWeek, w.sessions])).toEqual([["2025-12-29", "2026-W01", 1], ["2026-01-05", "2026-W02", 0], ["2026-01-12", "2026-W03", 1]]);
  });
  it("fractional, direct and group counts from hard sets only", () => {
    const a = weeks[0];
    expect(a.workingSets).toBe(5); // warmup excluded; ramp + 3 work + mystery
    expect(a.hardSets).toBe(4); // 95×5 is a ramp (41 %)
    expect(a.muscles.pecLower).toBeCloseTo(3);
    expect(a.muscles.pecUpper).toBeCloseTo(1.8);
    expect(a.muscles.frontDelt).toBeCloseTo(1.5);
    expect(a.groups.chest).toEqual({ sets: 3, direct: 3 }); // max over pecs, not their sum
    expect(a.groups.triceps.sets).toBeCloseTo(1.8);
    expect(a.groups.triceps.direct).toBe(0);
    expect(a.unknown).toEqual({ "Mystery Machine": 1 });
  });
  it("logged RPE decides; bodyweight pull-ups count", () => {
    const c = weeks[2];
    expect(c.groups.chest.sets).toBeCloseTo(1 + 0.15); // RPE 5 set dropped; pull-ups add a little lower pec
    expect(c.groups.back.sets).toBeCloseTo(1);
    expect(c.muscles.lats).toBeCloseTo(1);
  });
  it("from/to window and averaging", () => {
    const only = weeklyMuscleSets(ws, "America/Los_Angeles", { from: "2026-01-12", to: "2026-01-25" });
    expect(only.map((w) => w.week)).toEqual(["2026-01-12", "2026-01-19"]);
    const avg = averageWeeks(only);
    expect(avg.groups.chest.sets).toBeCloseTo(1.15 / 2);
  });
});

describe("programMuscleSets", () => {
  const fixed = (id: string, lift: string, sets: number, reps: number): SlotDef => ({ id, lift, tier: "MAIN", progression: { kind: "fixed", sets, reps } });
  it("typical week scaled to sessions per week", () => {
    const def: ProgramDef = { templateId: "t", name: "t", sessionsPerWeek: 3, days: [{ id: "A", name: "A", slots: [fixed("sq", "squat", 5, 5)] }] };
    const c = cfg({ startWeights: { sq: 200 } });
    const p = programMuscleSets(def, c, initialState(def, c));
    expect(p.groups.quads).toEqual({ sets: 15, direct: 15 });
    expect(p.groups.glutes.sets).toBeCloseTo(11.25);
    expect(p.groups.glutes.direct).toBe(0);
    expect(p.hardSets).toBe(15);
  });
  it("light percentage work (BBB 5×10 @ 50 % TM) isn't hard", () => {
    const bbb: SlotDef = { id: "b", lift: "bench", tier: "SUPP", progression: { kind: "percent", tmLift: "bench", weeks: [Array.from({ length: 5 }, () => ({ pct: 0.5, reps: 10 }))] } };
    const def: ProgramDef = { templateId: "t", name: "t", sessionsPerWeek: 1, days: [{ id: "A", name: "A", slots: [bbb] }] };
    const c = cfg({ trainingMaxes: { bench: 200 } });
    const p = programMuscleSets(def, c, initialState(def, c));
    expect(p.workingSets).toBe(5);
    expect(p.hardSets).toBe(0);
    expect(programMuscleSets(def, c, initialState(def, c), { countAll: true }).groups.chest.sets).toBe(5);
  });
});

describe("landmarkStatus", () => {
  it("zones across chest landmarks (MV 4, MEV 6, MAV 12–20, MRV 22)", () => {
    expect(landmarkStatus(0, "chest").zone).toBe("belowMV");
    expect(landmarkStatus(3, "chest").zone).toBe("belowMV");
    expect(landmarkStatus(5, "chest").zone).toBe("maintenance");
    expect(landmarkStatus(8, "chest").zone).toBe("growth");
    expect(landmarkStatus(15, "chest")).toMatchObject({ zone: "growth", research: "within" });
    expect(landmarkStatus(21, "chest")).toMatchObject({ zone: "high", research: "above" });
    expect(landmarkStatus(25, "chest").zone).toBe("aboveMRV");
    expect(landmarkStatus(25, "chest").note).toMatch(/recover/);
  });
  it("direct sets for RP, fractional for research", () => {
    const s = landmarkStatus({ sets: 12, direct: 3 }, "chest");
    expect(s).toMatchObject({ rpSets: 3, sets: 12, zone: "belowMV", research: "within" });
  });
  it("muscle ids resolve to their group; unmapped muscles are n/a", () => {
    expect(landmarkStatus(15, "vastusLateralis")).toMatchObject({ group: "quads", zone: "growth", research: "within" });
    const e = landmarkStatus(6, "erectors");
    expect(e).toMatchObject({ group: null, zone: "n/a", research: "n/a" });
    expect(e.note).toMatch(/No established target/);
  });
  it("MEV-0 groups explain the indirect work", () => {
    expect(landmarkStatus(2, "frontDelts").note).toMatch(/pressing/);
  });
});
