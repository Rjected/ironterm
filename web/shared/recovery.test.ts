import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "./hevy";
import { exerciseProfile, LIFT_PROFILES, liftProfile, MUSCLE, MUSCLE_IDS, templateInvolvement } from "./muscles";
import { LIFTS } from "./lifts";
import type { ProgramConfig, ProgramDef, SlotDef } from "./program";
import { buildProgram, defaultConfig, TEMPLATES } from "./programs";
import { analyzeHistory, analyzeProgram, defaultSchedule, effort, estimatePlanned, fatigueAt, maxFraction, maxReps, pctFor, readiness } from "./recovery";

const slot = (id: string, lift: string, sets = 5, reps = 5): SlotDef => ({ id, lift, tier: "MAIN", progression: { kind: "fixed", sets, reps } });
const prog = (days: [string, SlotDef[]][], perWeek = days.length): ProgramDef => ({
  templateId: "t", name: "t", sessionsPerWeek: perWeek,
  days: days.map(([id, slots]) => ({ id, name: id, slots })),
});
const cfg: ProgramConfig = { templateId: "t", options: {}, unit: "lb", startDate: "2026-01-01", startWeights: {}, trainingMaxes: {} };

describe("muscle map", () => {
  it("profiles every lift in the library with sane fractions", () => {
    // lifts added later without a hand-written profile fall back to their coarse muscle
    for (const key of Object.keys(LIFTS)) expect(liftProfile(key), key).toBeTruthy();
    for (const key of Object.keys(LIFT_PROFILES)) {
      const p = LIFT_PROFILES[key];
      expect(LIFTS[key], `${key} is not in lifts.ts`).toBeTruthy();
      const vals = Object.values(p.muscles);
      expect(Math.max(...vals), key).toBeGreaterThanOrEqual(0.75);
      for (const v of vals) expect(v).toBeLessThanOrEqual(1);
      for (const m of Object.keys(p.muscles)) expect(MUSCLE[m as keyof typeof MUSCLE], `${key}.${m}`).toBeTruthy();
    }
  });
  it("squat is a quad lift, RDL a hamstring lift, overhead extension long-head-biased", () => {
    expect(LIFT_PROFILES.squat.muscles.vastusLateralis).toBe(1);
    expect(LIFT_PROFILES.rdl.muscles.hamsLateral).toBe(1);
    expect(LIFT_PROFILES.overheadTricep.muscles.tricepsLong!).toBeGreaterThan(LIFT_PROFILES.overheadTricep.muscles.tricepsLateral!);
  });
  it("falls back to Hevy muscle groups, then title keywords", () => {
    expect(templateInvolvement({ primary_muscle_group: "chest", secondary_muscle_groups: ["triceps"] })).toMatchObject({ pecLower: 1, tricepsLateral: 0.5 });
    expect(exerciseProfile(null, "Cable Lateral Raise (Single Arm)")?.muscles.sideDelt).toBe(1);
    expect(exerciseProfile(null, "Seated Leg Curl")?.muscles.hamsMedial).toBe(1);
    expect(exerciseProfile(null, "Zzz mystery")).toBeNull();
  });
});

describe("intensity", () => {
  it("Epley rep max and %1RM are inverses", () => {
    expect(maxReps(pctFor(5, 0))).toBeCloseTo(5, 5);
    expect(maxReps(0.75)).toBeCloseTo(10, 5);
  });
  it("effort rises toward failure and floors for easy sets", () => {
    expect(effort(0)).toBe(1);
    expect(effort(3)).toBeLessThan(1);
    expect(effort(30)).toBe(0.15);
  });
  it("reads RPE, % of max and AMRAPs", () => {
    expect(estimatePlanned({ reps: 3, rpe: 8, amrap: false }, "MAIN").rir).toBe(2);
    expect(estimatePlanned({ reps: 5, pct: 0.85, amrap: true }, "MAIN").rir).toBe(0.5);
    // 5 @ 75% of a 1RM is ~5 reps in reserve
    expect(estimatePlanned({ reps: 5, pct: 0.75, amrap: false }, "MAIN", 1).rir).toBeCloseTo(5, 5);
  });
  it("parses what a program's max means", () => {
    expect(maxFraction("Training max")).toBe(0.9);
    expect(maxFraction("1RM")).toBe(1);
    expect(maxFraction("Training max (90% of 1RM)")).toBe(0.9);
    expect(maxFraction("5RM")).toBeCloseTo(pctFor(5, 0), 5);
    expect(maxFraction("Power-day weight (3–5RM)")).toBeCloseTo(pctFor(4, 0), 5);
  });
});

describe("program analysis", () => {
  it("spreads sessions over the week", () => {
    expect(defaultSchedule(3)).toEqual([0, 2, 4]);
    expect(defaultSchedule(4)).toEqual([0, 1, 3, 4]);
  });

  it("squatting every day leaves quads less recovered than twice a week", () => {
    const daily = analyzeProgram(prog([["A", [slot("a", "squat")]]], 7), cfg);
    const twice = analyzeProgram(prog([["A", [slot("a", "squat")]]], 2), cfg);
    const q = "vastusLateralis";
    expect(daily.muscles[q].minGapH).toBe(24);
    expect(twice.muscles[q].minGapH).toBe(72);
    expect(daily.muscles[q].hits).toBe(7);
    expect(daily.muscles[q].avgReadiness).toBeLessThan(twice.muscles[q].avgReadiness);
    expect(daily.overlaps.some((o) => o.muscle === q)).toBe(true);
    expect(twice.overlaps.some((o) => o.muscle === q)).toBe(false);
    // 5 hard-ish sets × 2 = 10/week; 35/week is over the range
    expect(twice.muscles[q].sets).toBeCloseTo(10, 5);
    expect(daily.muscles[q].status).toBe("high");
  });

  it("flags squat Monday → deadlift Tuesday as overlapping glutes/adductors/erectors, not quads", () => {
    const a = analyzeProgram(prog([["SQ", [slot("s", "squat")]], ["DL", [slot("d", "deadlift")]]]), cfg, { schedule: [0, 1] });
    const ov = a.overlaps.filter((o) => o.label.endsWith("DL"));
    const hit = new Set(ov.map((o) => o.muscle));
    expect(hit.has("gluteMax")).toBe(true);
    expect(hit.has("adductors")).toBe(true);
    expect(hit.has("erectors")).toBe(true);
    expect(ov.find((o) => o.muscle === "gluteMax")).toMatchObject({ gapH: 24, prev: ["squat"], now: ["deadlift"] });
    // Mon/Thu instead: no overlap
    const spaced = analyzeProgram(prog([["SQ", [slot("s", "squat")]], ["DL", [slot("d", "deadlift")]]]), cfg, { schedule: [0, 3] });
    expect(spaced.overlaps.filter((o) => o.muscle === "gluteMax")).toHaveLength(0);
  });

  it("slower muscles (hamstrings) recover slower than fast ones (calves) from the same dose", () => {
    const a = analyzeProgram(prog([["A", [slot("a", "legCurl"), slot("b", "seatedCalfRaise")]]], 1), cfg);
    const t = a.sessions[0].t + 36;
    const hams = fatigueAt(a.exposures, "hamsLateral", t) / a.sessions[0].doses.hamsLateral!.fatigue;
    const sol = fatigueAt(a.exposures, "soleus", t) / a.sessions[0].doses.soleus!.fatigue;
    expect(hams).toBeGreaterThan(sol);
  });

  it("works for every registered template", () => {
    for (const t of TEMPLATES) {
      const c = defaultConfig(t.id, "lb", "2026-01-01");
      const def = buildProgram(c)!;
      const a = analyzeProgram(def, c);
      expect(a.sessions.length, t.id).toBeGreaterThan(0);
      const total = MUSCLE_IDS.reduce((s, m) => s + a.muscles[m].sets, 0);
      expect(total, t.id).toBeGreaterThan(0);
      for (const m of MUSCLE_IDS) {
        expect(Number.isFinite(a.muscles[m].avgReadiness), `${t.id}.${m}`).toBe(true);
        expect(a.muscles[m].loadShare).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

const W = (id: string, date: string, ex: [string, [number, number][]][]): HevyWorkout => ({
  id, title: id, start_time: `${date}T18:00:00Z`, end_time: `${date}T19:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([kg, reps]) => ({ type: "normal" as const, weight_kg: kg, reps })) })),
});
const sets = (n: number, kg: number, reps: number) => Array.from({ length: n }, () => [kg, reps] as [number, number]);

describe("history analysis", () => {
  const hist = [
    W("w1", "2026-03-02", [["Squat (Barbell)", sets(5, 140, 5)], ["Bench Press (Barbell)", sets(5, 100, 5)]]),
    W("w2", "2026-03-09", [["Squat (Barbell)", sets(5, 140, 5)], ["Mystery Machine", sets(3, 20, 10)]]),
    W("w3", "2026-03-10", [["Deadlift (Barbell)", sets(3, 180, 5)]]),
  ];

  it("current readiness reflects what was trained most recently", () => {
    const h = analyzeHistory(hist, { now: "2026-03-11T06:00:00Z" });
    // bench was 9 days ago → fresh; deadlift 12 h ago → erectors loaded
    expect(h.current.pecLower.readiness).toBeGreaterThan(0.99);
    expect(h.current.erectors.readiness).toBeLessThan(h.current.pecLower.readiness);
    expect(h.current.erectors.hoursSince).toBeCloseTo(12, 5);
    expect(h.current.erectors.readyIn).toBeGreaterThan(0);
    expect(h.unknown["Mystery Machine"]).toBe(3);
  });

  it("weekly sets over 7 and 28 days, and squat→deadlift overlap", () => {
    const h = analyzeHistory(hist, { now: "2026-03-11T06:00:00Z" });
    expect(h.last7.vastusLateralis.sets).toBeCloseTo(5 + 1.5, 5); // squat 5 × 1 + deadlift 3 × 0.5
    expect(h.last28.vastusLateralis.sets).toBeCloseTo((10 + 1.5) / 4, 5);
    expect(h.overlaps28.some((o) => o.muscle === "gluteMax" && o.prev[0] === "squat" && o.now[0] === "deadlift")).toBe(true);
  });

  it("ignores warmups and future workouts; readiness is bounded", () => {
    const w = W("x", "2026-03-10", [["Squat (Barbell)", sets(30, 140, 5)]]);
    w.exercises[0].sets.forEach((s, i) => { if (i < 25) s.type = "warmup"; });
    const h = analyzeHistory([w, W("f", "2026-04-01", [["Squat (Barbell)", sets(5, 140, 5)]])], { now: "2026-03-10T19:00:00Z" });
    expect(h.last7.vastusLateralis.sets).toBe(5);
    expect(readiness(1e9)).toBe(0);
    expect(readiness(0)).toBe(1);
  });
});
