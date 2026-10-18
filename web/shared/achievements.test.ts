import { describe, expect, it } from "vitest";
import { evaluateAchievements, recentUnlocks, sortAchievements, type Achievement, type AchievementInput } from "./achievements";
import type { HevyExercise, HevyWorkout } from "./hevy";
import type { ProgramState } from "./program";
import { addDays } from "./stats";
import { toKg } from "./units";

type Ex = [title: string, sets: [lb: number | null, reps: number][]];
const W = (id: string, start: string, ex: Ex[], extra: HevyExercise[] = []): HevyWorkout => ({
  id, title: id, start_time: start, end_time: new Date(Date.parse(start) + 3600e3).toISOString(),
  exercises: [...ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([lb, reps]) => ({ type: "normal" as const, weight_kg: lb == null ? null : toKg(lb, "lb"), reps })) })), ...extra],
});
const SQ = "Squat (Barbell)", BP = "Bench Press (Barbell)", DL = "Deadlift (Barbell)";
const run = (over: Partial<AchievementInput> & { workouts: HevyWorkout[] }) => evaluateAchievements({ tz: "UTC", unit: "lb", ...over });
const get = (as: Achievement[], id: string) => {
  const a = as.find((x) => x.id === id);
  if (!a) throw new Error(`no achievement ${id}`);
  return a;
};

describe("plates", () => {
  it("unlocks on the first actual set with ≥ 1 rep, exact lb loads despite kg storage", () => {
    const as = run({ workouts: [W("a", "2026-01-01T12:00:00Z", [[SQ, [[225, 0], [185, 5]]]]), W("b", "2026-01-03T12:00:00Z", [[SQ, [[225, 1]]]])] });
    expect(get(as, "plates-squat-1").unlockedAt).toBe("2026-01-01");
    expect(get(as, "plates-squat-2").unlockedAt).toBe("2026-01-03");
    expect(get(as, "plates-squat-3")).toMatchObject({ unlockedAt: null, current: expect.closeTo(225, 3), target: 315 });
    expect(get(as, "plates-squat-3").progress).toBeCloseTo(225 / 315);
    expect(as.some((a) => a.id === "plates-ohp-4")).toBe(false);
  });
  it("kg plates are 60/100/140/180/220", () => {
    const w: HevyWorkout = { id: "k", title: "k", start_time: "2026-01-01T12:00:00Z", end_time: "2026-01-01T13:00:00Z", exercises: [{ title: BP, exercise_template_id: BP, sets: [{ type: "normal", weight_kg: 100, reps: 1 }] }] };
    const as = evaluateAchievements({ workouts: [w], tz: "UTC", unit: "kg" });
    expect(get(as, "plates-bench-2")).toMatchObject({ unlockedAt: "2026-01-01", target: 100 });
    expect(get(as, "plates-bench-3").target).toBe(140);
  });
});

describe("totals and bodyweight multiples", () => {
  const ws = [
    W("a", "2026-01-01T12:00:00Z", [[SQ, [[315, 5]]], [BP, [[225, 5]]]]),
    W("b", "2026-01-02T12:00:00Z", [[DL, [[405, 3]]]]),
  ];
  it("e1RM club (Epley) unlocks before the strict actual-set club", () => {
    const as = run({ workouts: ws });
    // e1RM: 367.5 + 262.5 + 445.5 = 1075.5; actual: 315 + 225 + 405 = 945
    expect(get(as, "club-1000").unlockedAt).toBe("2026-01-02");
    expect(get(as, "club-1000").current).toBeCloseTo(1075.5, 0);
    expect(get(as, "club-1000-actual")).toMatchObject({ unlockedAt: null, current: expect.closeTo(945, 0) });
    expect(get(as, "club-1200").progress).toBeCloseTo(1075.5 / 1200, 2);
  });
  it("ignores high-rep sets for e1RM", () => {
    const as = run({ workouts: [W("a", "2026-01-01T12:00:00Z", [[SQ, [[300, 20]]], [BP, [[200, 20]]], [DL, [[350, 20]]]])] });
    expect(get(as, "club-1000").unlockedAt).toBeNull();
  });
  it("multiples use the trend bodyweight on the day; omitted without bodyweight", () => {
    expect(run({ workouts: ws }).some((a) => a.category === "relative")).toBe(false);
    const as = run({ workouts: ws, bodyweight: [{ date: "2025-12-30", kg: toKg(180, "lb"), source: "manual" }] });
    expect(get(as, "bw-bench-1").unlockedAt).toBe("2026-01-01"); // 225 / 180 = 1.25
    expect(get(as, "bw-squat-1.5").unlockedAt).toBe("2026-01-01"); // 1.75
    expect(get(as, "bw-squat-2")).toMatchObject({ unlockedAt: null, current: 1.75 });
    expect(get(as, "bw-deadlift-2").unlockedAt).toBe("2026-01-02"); // 2.25
    expect(get(as, "bw-deadlift-2.5").progress).toBeCloseTo(2.25 / 2.5, 2);
  });
});

describe("consistency, volume, habits", () => {
  // 3 sessions/week for 10 weeks, Mon/Wed/Fri at 06:00, then a 5-week break, then one 22:00 session
  const ws: HevyWorkout[] = [];
  for (let wk = 0; wk < 10; wk++) for (const d of [0, 2, 4]) ws.push(W(`w${wk}-${d}`, `${addDays("2026-01-05", wk * 7 + d)}T06:00:00Z`, [[SQ, [[100, 10], [100, 10]]]]));
  ws.push(W("back", `${addDays("2026-01-05", 9 * 7 + 4 + 35)}T22:00:00Z`, [[SQ, [[100, 10]]]]));
  const as = run({ workouts: ws });
  it("week streaks unlock on the session that completes week N", () => {
    expect(get(as, "streak-4w").unlockedAt).toBe(addDays("2026-01-05", 3 * 7 + 4));
    expect(get(as, "streak-8w").unlockedAt).toBe(addDays("2026-01-05", 7 * 7 + 4));
    expect(get(as, "streak-12w")).toMatchObject({ unlockedAt: null, current: 10 });
  });
  it("sessions, tonnage, reps", () => {
    expect(get(as, "sessions-50")).toMatchObject({ unlockedAt: null, current: 31 });
    expect(get(as, "tonnage-100k")).toMatchObject({ unlockedAt: null, current: expect.closeTo(61_000, 0) }); // 61 sets × 1000 lb
    expect(get(as, "tonnage-100k").progress).toBeCloseTo(0.61, 3);
    expect(get(as, "reps-10k").current).toBe(610);
  });
  it("early bird, night owl, comeback", () => {
    expect(get(as, "early-bird-10").unlockedAt).toBe(addDays("2026-01-05", 3 * 7)); // 10th session
    expect(get(as, "early-bird-25").unlockedAt).not.toBeNull();
    expect(get(as, "night-owl-10")).toMatchObject({ unlockedAt: null, current: 1 });
    expect(get(as, "comeback").unlockedAt).toBe(ws[ws.length - 1].start_time.slice(0, 10));
  });
  it("time-of-day uses the user's time zone", () => {
    const ny = evaluateAchievements({ workouts: ws, tz: "America/New_York", unit: "lb" });
    expect(get(ny, "early-bird-10").current).toBe(0); // 06:00Z = 1 am in New York
    expect(get(ny, "night-owl-10").current).toBe(30);
  });
  it("anniversaries by `today`", () => {
    expect(get(run({ workouts: ws, today: "2027-01-05" }), "anniversary-1y").unlockedAt).toBe("2027-01-05");
    expect(get(run({ workouts: ws, today: "2027-01-04" }), "anniversary-1y").unlockedAt).toBeNull();
    expect(get(run({ workouts: ws, today: "2028-01-05" }), "anniversary-5y").progress).toBeCloseTo(0.4, 2);
  });
});

describe("cardio, pull-ups, programs", () => {
  it("cardio minutes and miles", () => {
    const run5 = (i: number) => W(`r${i}`, `${addDays("2026-01-01", i)}T12:00:00Z`, [], [{ title: "Running", exercise_template_id: "run", sets: [{ type: "normal", weight_kg: null, reps: null, duration_seconds: 3000, distance_meters: 10 * 1609.344 }] }]);
    const as = run({ workouts: Array.from({ length: 10 }, (_, i) => run5(i)) });
    expect(get(as, "cardio-100min").unlockedAt).toBe("2026-01-02");
    expect(get(as, "cardio-500min").unlockedAt).toBe("2026-01-10");
    expect(get(as, "cardio-100mi").unlockedAt).toBe("2026-01-10");
    expect(get(as, "cardio-1000min").progress).toBeCloseTo(0.5);
  });
  it("pull-ups count only unweighted sets", () => {
    const as = run({ workouts: [W("p", "2026-01-01T12:00:00Z", [["Pull Up", [[null, 12]]], ["Pull Up (Weighted)", [[45, 20]]]])] });
    expect(get(as, "pullups-10").unlockedAt).toBe("2026-01-01");
    expect(get(as, "pullups-15")).toMatchObject({ unlockedAt: null, current: 12 });
  });
  it("finished programs from runs and complete states", () => {
    const st = (complete: boolean, date: string): ProgramState => ({ dayIndex: 0, rotations: 4, slots: {}, tms: {}, log: [{ workoutId: "x", date, dayId: "A", week: 0, results: [] }], complete });
    const as = run({ workouts: [W("a", "2026-01-01T12:00:00Z", [[SQ, [[100, 1]]]])], completedPrograms: [{ name: "Smolov Jr", completedAt: "2026-03-01" }], programStates: [{ state: st(true, "2026-05-01T12:00:00Z") }, { state: st(false, "2026-06-01") }] });
    expect(get(as, "programs-1").unlockedAt).toBe("2026-03-01");
    expect(get(as, "programs-3")).toMatchObject({ unlockedAt: null, current: 2 });
  });
});

describe("sorting and recentUnlocks", () => {
  const a = (id: string, unlockedAt: string | null, progress = 1, tier: Achievement["tier"] = "bronze"): Achievement => ({ id, title: id, description: "", tier, category: "milestones", unlockedAt, progress, current: 0, target: 1, measure: "" });
  it("newest unlocks first, then locked by progress", () => {
    const s = sortAchievements([a("l1", null, 0.2), a("u-old", "2025-01-01"), a("l2", null, 0.9), a("u-new", "2026-01-01"), a("u-new-gold", "2026-01-01", 1, "gold")]);
    expect(s.map((x) => x.id)).toEqual(["u-new-gold", "u-new", "u-old", "l2", "l1"]);
    expect(recentUnlocks(s, "2025-06-01").map((x) => x.id)).toEqual(["u-new-gold", "u-new"]);
  });
  it("evaluateAchievements output is sorted", () => {
    const as = run({ workouts: [W("a", "2026-01-01T12:00:00Z", [[SQ, [[135, 1]]]]), W("b", "2026-02-01T12:00:00Z", [[BP, [[135, 1]]]])] });
    expect(as[0].id).toBe("plates-bench-1");
    // 31-day gap → comeback, same day as the bench plate; squat plate is older
    expect(as.slice(1, 3).map((x) => x.id).sort()).toEqual(["comeback", "plates-squat-1"]);
    expect(as[2].unlockedAt! <= as[1].unlockedAt!).toBe(true);
    expect(as.every((x) => x.progress >= 0 && x.progress <= 1)).toBe(true);
  });
});
