import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { finishPRs, appBody, appCalendar, appGym, appHistory, appHome, appInsights, appLift, appLifts, appProgram, appStats, appWorkout, startSession } from "./appapi";
import { demoData } from "./demo";

const today = "2026-10-15";
const demo = demoData(today);
const boot: Bootstrap = {
  mode: "demo", auth: "none", settings: { unit: "lb", tz: "America/New_York", trainingDays: [0, 1, 3, 4] } as Bootstrap["settings"],
  program: demo.config, workouts: demo.workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
};
const d = derive(boot, "volume");

async function fixture(name: string, data: unknown) {
  const fs = "node:fs";
  const { writeFileSync } = (await import(/* @vite-ignore */ fs)) as { writeFileSync: (u: URL, s: string) => void };
  writeFileSync(new URL(`../../docs/api/app/${name}.json`, import.meta.url), JSON.stringify(data, null, 2) + "\n");
}

describe("app API", () => {
  it("home: snapshot, e1RM table, trends, weekly, watch", async () => {
    const h = appHome(boot, d);
    expect(h.snapshot.v).toBe(1);
    expect(h.e1rm.slice(0, 4).map((x) => x.lift)).toEqual(["squat", "bench", "deadlift", "ohp"]);
    expect(h.trend[0].points.length).toBeGreaterThan(20);
    expect(h.weekly.length).toBe(26);
    expect(Array.isArray(h.watch)).toBe(true);
    await fixture("home", h);
  });

  it("gym: plan, days, catalog; start builds a session with targets", async () => {
    const g = appGym(boot, d);
    expect(g.next?.exercises.length).toBeGreaterThan(1);
    expect(g.days.length).toBe(4);
    expect(g.catalog.length).toBeGreaterThan(50);
    expect(g.plan?.exercises[0].restSeconds).toBeGreaterThan(0);
    expect(g.plan?.exercises[0].slotId).toBeTruthy();
    await fixture("gym", g);
    const s = startSession(boot, {}, "2026-10-15T22:00:00.000Z", d);
    expect(s.exercises[0].sets.some((x) => x.target)).toBe(true);
    expect(s.dayId).toBeTruthy();
    expect(startSession(boot, { empty: true }, undefined, d).exercises).toEqual([]);
    expect(startSession(boot, { dayIndex: 2 }, undefined, d).dayId).toBe(g.days[2].dayId);
    await fixture("gym-start", s);
  });

  it("lifts list and detail", async () => {
    const l = appLifts(boot, d);
    expect(l.lifts[0].key).toBe("squat");
    await fixture("lifts", l);
    const sq = appLift(boot, "squat", d)!;
    expect(sq.points.length).toBeGreaterThan(30);
    expect(sq.repPRs.length).toBeGreaterThan(2);
    expect(sq.rpe.length).toBeGreaterThan(10);
    expect(sq.prWall.every((p) => p.weight > 0)).toBe(true);
    await fixture("lift-squat", sq);
    expect(appLift(boot, "nope", d)).toBeNull();
  });

  it("history pages with a cursor, search, and workout detail", async () => {
    const p1 = appHistory(boot, { limit: 20 }, d);
    expect(p1.workouts).toHaveLength(20);
    const p2 = appHistory(boot, { cursor: p1.next, limit: 20 }, d);
    expect(p2.workouts[0].id).not.toBe(p1.workouts[19].id);
    expect(new Set([...p1.workouts, ...p2.workouts].map((w) => w.id)).size).toBe(40);
    expect(appHistory(boot, { q: "arms" }, d).workouts.every((w) => /arms/i.test(w.title) || w.exercises.some((e) => /arms/i.test(e)))).toBe(true);
    await fixture("history", p1);
    const w = appWorkout(boot, p1.workouts[0].id, d)!;
    expect(w.exercises[0].sets.length).toBeGreaterThan(0);
    await fixture("workout", w);
    expect(appWorkout(boot, "missing", d)).toBeNull();
  });

  it("calendar month grid", async () => {
    const c = appCalendar(boot, "2026-10", d);
    expect(c.days).toHaveLength(42);
    expect(c.days.filter((x) => x.inMonth)).toHaveLength(31);
    expect(c.days.some((x) => x.status === "done")).toBe(true);
    expect(c.days.some((x) => x.status === "planned")).toBe(true);
    await fixture("calendar", c);
  });

  it("program", async () => {
    const p = appProgram(boot, d).program!;
    expect(p.name).toMatch(/GZCLP/);
    expect(p.slots.length).toBeGreaterThan(4);
    expect(p.upcoming.length).toBeGreaterThan(2);
    expect(p.log.length).toBeGreaterThan(0);
    expect(p.slots.some((x) => x.ifSuccess)).toBe(true);
    await fixture("program", appProgram(boot, d));
  });

  it("body renders both modes as SVG", async () => {
    for (const mode of ["ready", "load"] as const) {
      const b = appBody(boot, mode, d);
      expect(b.svgFront.startsWith("<svg")).toBe(true);
      expect(b.svgBack).toContain("</svg>");
      expect(b.muscles.length).toBeGreaterThan(20);
      if (mode === "load") await fixture("body-load", b);
      else await fixture("body", b);
    }
    const f = appBody({ ...boot, settings: { ...boot.settings, sex: "female" } }, "ready", d);
    expect(f.sex).toBe("f");
    expect(f.svgFront).toContain("xmlns");
  });

  it("finish PRs: records set by one workout", () => {
    // the demo history's best squat session should hold at least one record
    const best = d.lifts.squat.reduce((a, p) => (p.e1rm > a.e1rm ? p : a));
    const prs = finishPRs(boot, best.workoutId, d);
    expect(prs.some((p) => p.lift === "squat")).toBe(true);
    expect(finishPRs(boot, "missing", d)).toEqual([]);
  });

  it("insights and stats", async () => {
    const i = appInsights(boot, d);
    expect(i.projections.length).toBe(4);
    expect(i.achievements.total).toBeGreaterThan(10);
    await fixture("insights", i);
    const s = appStats(boot, d);
    expect(s.weekly.length).toBeGreaterThan(40);
    await fixture("stats", s);
  });
});
