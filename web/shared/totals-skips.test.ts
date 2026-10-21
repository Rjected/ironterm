import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { appGym, skipWorkout, startProgram } from "./appapi";
import { demoData } from "./demo";
import { completeSet, current, progress, repsDone, sessionFromPlan, skipExercise, skipSet, toHevyWorkout, updateSet, type LiveSession } from "./live";
import { totalFromNote, type ProgramConfig } from "./program";
import { buildProgram, defaultConfig } from "./programs";

const today = "2026-10-21";
const demo = demoData(today);
const boot = (program: ProgramConfig | null, workouts = demo.workouts): Bootstrap => ({
  mode: "demo", auth: "none", settings: { unit: "lb", tz: "America/New_York", trainingDays: [0, 2, 4] } as Bootstrap["settings"],
  program, workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
});
const started = (id: string): ProgramConfig => {
  const r = startProgram(boot(demo.config), id, { startDate: today });
  if ("error" in r) throw new Error(r.error);
  return r.cfg;
};
const monolithDay0 = (): LiveSession => {
  const d = derive(boot(started("531-monolith")), "volume");
  return sessionFromPlan(d.plan(0)!, "lb", "Monolith", `${today}T22:00:00Z`);
};
const ex = (s: LiveSession, lift: string) => s.exercises.find((e) => e.lift === lift)!;
const work = (s: LiveSession, lift: string) => ex(s, lift).sets.map((x, i) => ({ x, i })).filter(({ x }) => x.type !== "warmup");
/** do the next open set of `lift` for `reps` reps */
const doSet = (s: LiveSession, lift: string, reps: number): LiveSession => {
  const e = ex(s, lift);
  const i = e.sets.findIndex((x) => !x.done && !x.skipped && x.type !== "warmup");
  if (i < 0) throw new Error(`no open set left on ${lift}`);
  return completeSet(updateSet(s, e.id, i, { reps }), e.id, i);
};

describe("rep totals read from notes", () => {
  it("parses the forms the templates use", () => {
    expect(totalFromNote("100 total reps")).toEqual({ lo: 100 });
    expect(totalFromNote("100–200 total reps")).toEqual({ lo: 100, hi: 200 });
    expect(totalFromNote("100 total reps (or band pull-aparts)")).toEqual({ lo: 100 });
    expect(totalFromNote("50 total reps in as few sets as possible (up to 10)")).toEqual({ lo: 50 });
    expect(totalFromNote("25–50 total reps, any push")).toEqual({ lo: 25, hi: 50 });
    expect(totalFromNote("0–50 total reps (optional)")).toBeNull();
    expect(totalFromNote("rolling planks, total reps")).toBeNull();
    expect(totalFromNote(undefined)).toBeNull();
  });

  it("Monolith's accessories plan as rep totals, its main lifts don't", () => {
    const s = monolithDay0();
    expect(ex(s, "chinUp").totalReps).toBe(100);
    expect(ex(s, "dip").totalReps).toBe(100);
    expect(ex(s, "dip").totalRepsMax).toBe(200);
    expect(ex(s, "squat").totalReps).toBeUndefined();
  });
});

describe("chasing a rep total in the gym", () => {
  it("sets of 5 instead of 20: planned sets follow your pace and sets keep coming until 100", () => {
    let s = monolithDay0();
    s = doSet(s, "chinUp", 5);
    // the four planned sets you haven't touched follow your pace
    expect(work(s, "chinUp").filter(({ x }) => !x.done).every(({ x }) => x.reps === 5)).toBe(true);
    for (let k = 0; k < 19; k++) s = doSet(s, "chinUp", 5);
    expect(repsDone(ex(s, "chinUp"))).toBe(100);
    expect(work(s, "chinUp").filter(({ x }) => x.done).length).toBe(20);
    // nothing left open, and the session moves on to the next exercise
    expect(ex(s, "chinUp").sets.some((x) => !x.done && !x.skipped)).toBe(false);
    expect(s.exercises[current(s)!.exId === ex(s, "chinUp").id ? -1 : 0]).toBeDefined();
    expect(current(s)?.exId).not.toBe(ex(s, "chinUp").id);
  });

  it("the last set is only what's left, and an early finish skips the leftover sets", () => {
    let s = monolithDay0();
    for (let k = 0; k < 4; k++) s = doSet(s, "chinUp", 23); // 92
    const open = work(s, "chinUp").filter(({ x }) => !x.done && !x.skipped);
    expect(open.map(({ x }) => x.reps)).toEqual([8]);
    s = doSet(s, "chinUp", 8);
    expect(repsDone(ex(s, "chinUp"))).toBe(100);
    let t = monolithDay0();
    for (let k = 0; k < 4; k++) t = doSet(t, "chinUp", 25);
    const sets = work(t, "chinUp");
    expect(sets.filter(({ x }) => x.skipped).length).toBe(1);
    expect(progress(t).total).toBe(progress(monolithDay0()).total - 1);
  });

  it("a set you edited keeps its reps", () => {
    let s = monolithDay0();
    const e = ex(s, "chinUp");
    const planned = e.sets.map((x, i) => ({ x, i })).filter(({ x }) => x.type !== "warmup");
    s = updateSet(s, e.id, planned[2].i, { reps: 12 });
    s = doSet(s, "chinUp", 6);
    expect(ex(s, "chinUp").sets[planned[2].i].reps).toBe(12);
    expect(ex(s, "chinUp").sets[planned[1].i].reps).toBe(6);
  });
});

describe("skipping sets and exercises", () => {
  it("skipped sets aren't current, counted or saved, and can come back", () => {
    let s = monolithDay0();
    const e = ex(s, "squat");
    const first = e.sets.findIndex((x) => !x.done);
    s = skipSet(s, e.id, first);
    expect(current(s)).not.toEqual({ exId: e.id, set: first });
    const before = progress(monolithDay0());
    expect(progress(s).total).toBe(e.sets[first].type === "warmup" ? before.total : before.total - 1);
    s = completeSet(s, e.id, first + 1);
    const body = toHevyWorkout(s, () => "t").workout;
    expect(body.exercises[0].sets.length).toBe(1);
    s = skipSet(s, e.id, first, false);
    expect(current(s)).toEqual({ exId: e.id, set: first });
  });

  it("skip the rest of an exercise: done sets stay done", () => {
    let s = monolithDay0();
    const e = ex(s, "squat");
    s = completeSet(s, e.id, 0);
    s = skipExercise(s, e.id);
    expect(ex(s, "squat").sets[0].done).toBe(true);
    expect(ex(s, "squat").sets.slice(1).every((x) => x.skipped && !x.done)).toBe(true);
    expect(current(s)?.exId).not.toBe(e.id);
  });
});

describe("skipping a workout", () => {
  it("moves the program on without changing any weight", () => {
    const cfg = started("gzclp");
    const before = derive(boot(cfg), "volume");
    const r = skipWorkout(boot(cfg), { dayId: before.def!.days[before.state!.dayIndex].id }, `${today}T12:00:00Z`);
    if ("error" in r) throw new Error(r.error);
    const after = derive(boot(r.cfg), "volume");
    expect(after.state!.dayIndex).toBe((before.state!.dayIndex + 1) % before.def!.days.length);
    expect(after.state!.slots).toEqual(before.state!.slots);
    expect(after.state!.log[after.state!.log.length - 1]).toMatchObject({ skipped: true, results: [] });
    expect(appGym(boot(r.cfg)).skipped?.dayId).toBe(before.def!.days[before.state!.dayIndex].id);
  });

  it("refuses a stale day (double tap) and undoes the last skip", () => {
    const cfg = started("gzclp");
    const d = derive(boot(cfg), "volume");
    const day = d.def!.days[d.state!.dayIndex].id;
    const r = skipWorkout(boot(cfg), { dayId: day }, `${today}T12:00:00Z`);
    if ("error" in r) throw new Error(r.error);
    const again = skipWorkout(boot(r.cfg), { dayId: day }, `${today}T12:00:05Z`);
    expect("error" in again && again.status).toBe(409);
    const u = skipWorkout(boot(r.cfg), { undo: true });
    if ("error" in u) throw new Error(u.error);
    expect(derive(boot(u.cfg), "volume").state!.dayIndex).toBe(d.state!.dayIndex);
    expect("error" in skipWorkout(boot(u.cfg), { undo: true })).toBe(true);
    expect("error" in skipWorkout(boot(cfg), {})).toBe(true);
    expect("error" in skipWorkout(boot(null), { dayId: day })).toBe(true);
  });

  it("skipping a whole 5/3/1 week still raises the TM at the end of the cycle", () => {
    const cfg = { ...defaultConfig("531", "lb", `${today}T00:00:00Z`) };
    const def = buildProgram(cfg)!;
    const perWeek = def.days.length, weeks = def.cycle!.weeks;
    // skip every session of one full cycle
    const adjustments = Array.from({ length: perWeek * weeks }, (_, k) => ({ date: `${today}T${String(10 + Math.floor(k / 60)).padStart(2, "0")}:${String(k % 60).padStart(2, "0")}:00Z`, skip: true }));
    const st = derive(boot({ ...cfg, adjustments }, []), "volume").state!;
    expect(st.rotations).toBe(weeks);
    for (const [lift, tm] of Object.entries(cfg.trainingMaxes)) if (def.cycle!.tmIncrease?.[lift]) expect(st.tms[lift]).toBeGreaterThan(tm);
  });
});
