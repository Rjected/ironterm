import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { finishPRs, appBody, appCalendar, appGym, appHistory, appHome, appInsights, appLift, appLifts, appProgram, appProgramBody, appProgramDetail, appPrograms, appStats, appWorkout, parseDays, startProgram, startSession, type ProgramBody, type ProgramDetail } from "./appapi";
import { LIFTS } from "./lifts";
import { MUSCLES } from "./muscles";
import { TEMPLATES } from "./programs";
import { demoData } from "./demo";

const today = "2026-10-15";
const demo = demoData(today);
const boot: Bootstrap = {
  mode: "demo", auth: "none", settings: { unit: "lb", tz: "America/New_York", trainingDays: [0, 1, 3, 4] } as Bootstrap["settings"],
  program: demo.config, workouts: demo.workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
};
const d = derive(boot, "volume");

// Regenerate docs/api/app with WRITE_FIXTURES=1 pnpm test (ids are random, so not on every run).
const WRITE = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WRITE_FIXTURES === "1";

async function fixture(name: string, data: unknown) {
  if (!WRITE) return;
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

  it("program and snapshot explain the re-entry ramp after a break", () => {
    expect(appProgram(boot, d).program!.reentry).toBeNull();
    expect(appHome(boot, d).snapshot.program?.next?.reentryNote).toBeNull();
    const last = demo.workouts.map((w) => w.start_time.slice(0, 10)).sort().at(-1)!;
    const later = new Date(Date.parse(last) + 40 * 864e5).toISOString().slice(0, 10);
    const b = { ...boot, today: later };
    const bd = derive(b, "volume");
    const r = appProgram(b, bd).program!.reentry!;
    expect(r).toMatchObject({ done: 0, gapDays: 40, headline: `Session 1 of ${r.total} back after 40 days off` });
    expect(r.lifts.length).toBeGreaterThan(0);
    expect(r.lifts[0].load).toBeCloseTo(0.82, 2);
    expect(r.summary).toContain("82% load");
    expect(r.suggest.map((x) => x.templateId)).toEqual(["comeback", "comeback-squat"]);
    const next = appHome(b, bd).snapshot.program!.next!;
    expect(next.reentry).toBe(true);
    expect(next.reentryNote).toBe(r.summary);
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

  describe("programs", () => {
    const detail = (b: Bootstrap, id: string, opt: Record<string, string> = {}) => {
      const r = appProgramDetail(b, id, opt);
      if ("error" in r) throw new Error(r.error);
      return r as ProgramDetail;
    };
    const fresh: Bootstrap = { ...boot, program: null, workouts: [], settings: { ...boot.settings, trainingDays: undefined } };
    const top = (p: ProgramDetail, lift: string) => Math.max(...p.weeks.flatMap((w) => w.days.flatMap((d) => d.exercises.filter((e) => e.lift === lift).map((e) => e.top))));

    it("catalog: every template, grouped by category, active marked", async () => {
      const c = appPrograms(boot);
      expect(c.active).toBe("gzclp");
      expect(c.programs).toHaveLength(TEMPLATES.length);
      const order = ["gzcl", "novice", "strength", "powerlifting", "hypertrophy", "peaking", "bodyweight", "comeback"];
      const ranks = c.programs.map((p) => order.indexOf(p.category));
      expect(ranks.every((r, i) => r >= 0 && (i === 0 || r >= ranks[i - 1]))).toBe(true);
      expect(c.programs.find((p) => p.id === "531")).toMatchObject({ weekCount: null, daysPerWeek: [4] });
      expect(c.programs.find((p) => p.id === "smolov-jr")?.weekCount).toBe(3);
      await fixture("programs", c);
    });

    it("detail of the running program: its current weights, four weeks, rules, start prefill", async () => {
      const g = detail(boot, "gzclp");
      expect(g.basis).toBe("active");
      expect(g.weeks).toHaveLength(4);
      expect(g.weeks.every((w) => w.days.length === 4 && w.name === null)).toBe(true);
      expect(g.rules.tiers[0].title).toMatch(/^T1 · 5×3\+/);
      expect(g.rules.rotation).toHaveLength(4);
      expect(g.start.trainingDays).toEqual([0, 1, 3, 4]);
      expect(Object.keys(g.start.labels).sort()).toEqual([...Object.keys(g.start.startWeights), ...Object.keys(g.start.trainingMaxes)].sort());
      expect(Object.values(g.start.labels)).toContain("A1 · T1 Back Squat");
      expect(g.options.map((o) => o.key)).toContain("t1");
      // starts from the replayed state and climbs as every session succeeds
      const t1 = d.state!.slots[d.def!.days[0].slots[0].id].weight;
      expect(g.weeks[0].days[0].exercises[0].top).toBe(t1);
      expect(g.weeks[1].days[0].exercises[0].top).toBeGreaterThan(t1);
      expect(g.weeks[0].days[0].exercises[0].ifSuccess).toBeTruthy();
      await fixture("programs-gzclp", g);
    });

    it("percent program: every cycle week from your e1RMs, scaling with them", async () => {
      const p = detail(boot, "531");
      expect(p.basis).toBe("e1rm");
      expect(p.weeks.map((w) => w.name)).toEqual(["5s week", "3s week", "5/3/1 week", "Deload"]);
      expect(p.weeks[3].days[0].exercises).toHaveLength(2); // BBB kept on deload ("as normal")
      expect(p.start.trainingMaxes.squat).toBeGreaterThan(0);
      expect(p.start.labels.squat).toBe("Back Squat");
      expect(p.weeks[0].days[3].exercises[0].sets[2]).toMatchObject({ reps: 5, amrap: true });
      const stronger: Bootstrap = { ...boot, workouts: boot.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, weight_kg: (x.weight_kg ?? 0) * 1.2 })) })) })) };
      const p2 = detail(stronger, "531");
      expect(p2.start.trainingMaxes.squat).toBeGreaterThan(p.start.trainingMaxes.squat * 1.1);
      expect(top(p2, "squat")).toBeGreaterThan(top(p, "squat"));
      await fixture("programs-531", p);
    });

    it("finite block and open-ended programs", async () => {
      const s = detail(boot, "smolov-jr");
      expect(s.weeks).toHaveLength(3);
      expect(s.weeks[1].days[0].exercises[0].top).toBeGreaterThan(s.weeks[0].days[0].exercises[0].top);
      expect(s.rules.tiers[0].text).toContain("+10 lb in week 2");
      await fixture("programs-smolov-jr", s);
      expect(detail(boot, "complete16").weeks).toHaveLength(16);
      expect(detail(boot, "sbsRtf").weeks).toHaveLength(16); // 21-week block, first 16
      // nSuns: open-ended, the 1+ set moves the TM after week 1
      const n = detail(boot, "nsuns5");
      expect(n.weeks).toHaveLength(4);
      expect(top(n, "squat")).toBeGreaterThan(n.weeks[0].days[1].exercises[0].top);
      // StrongLifts: 2 days, 3 sessions a week
      expect(detail(boot, "stronglifts").weeks.every((w) => w.days.length === 3)).toBe(true);
    });

    it("no data: template defaults", () => {
      const p = detail(fresh, "531");
      expect(p.basis).toBe("defaults");
      expect(p.start.trainingMaxes.squat).toBe(250);
      expect(p.start.trainingDays).toEqual([0, 1, 3, 4]);
    });

    it("options: opt.* changes the plan; bad values and unknown ids fail", () => {
      const off = detail(boot, "531", { deload: "off", supp: "fsl" });
      expect(off.weeks).toHaveLength(3);
      expect(off.options.find((o) => o.key === "supp")?.selected).toBe("fsl");
      expect(off.weeks[0].days[0].exercises[1].scheme).toBe("5×5");
      expect(appProgramDetail(boot, "531", { deload: "sometimes" })).toMatchObject({ status: 400 });
      expect(appProgramDetail(boot, "531", { nope: "x" })).toMatchObject({ status: 400 });
      expect(appProgramDetail(boot, "nope")).toMatchObject({ status: 404 });
    });

    it("body: weekly load and gaps figures, muscles vs range, overlaps, summary", async () => {
      const body = (id: string, q: Parameters<typeof appProgramBody>[2] = {}) => {
        const r = appProgramBody(boot, id, q, d);
        if ("error" in r) throw new Error(r.error);
        return r as ProgramBody;
      };
      const g = body("gzclp");
      expect(g.mode).toBe("load");
      expect(g.trainingDays).toEqual([0, 1, 3, 4]); // your usual days (4 = GZCLP's count)
      expect(g.svgFront?.startsWith("<svg")).toBe(true);
      expect(g.svgBack).toContain("</svg>");
      expect(g.muscles).toHaveLength(MUSCLES.length);
      // sorted by load, busiest = 1
      expect(g.muscles[0].load).toBe(Math.max(...g.muscles.map((m) => m.load)));
      expect(g.muscles.every((m, i) => i === 0 || m.load <= g.muscles[i - 1].load)).toBe(true);
      const quads = g.muscles.find((m) => m.id === "rectusFemoris")!;
      expect(quads.hardSets).toBeGreaterThan(0);
      expect(quads.lifts).toContain(LIFTS.squat.short);
      for (const m of g.muscles) {
        if (m.sets < 0.5) expect(m.status, m.id).toBe("none");
        else if (!m.target) expect(m.status, m.id).toBe("n/a");
        else expect(m.status, m.id).toBe(m.hardSets < m.target[0] ? "low" : m.hardSets > m.target[1] ? "high" : "ok");
      }
      expect(g.summary.mostTrained).toHaveLength(3);
      expect(g.summary.mostTrained[0].hardSets).toBeGreaterThanOrEqual(g.summary.mostTrained[1].hardSets);
      expect(g.summary.gaps.every((x) => x.hardSets < x.target[0])).toBe(true);
      expect(g.summary.lines).toHaveLength(3);
      expect(g.summary.lines[0]).toMatch(/^Most trained: /);
      expect(g.overlapsByWeek).toHaveLength(g.weeks);
      expect(g.overlapsByWeek.reduce((a, c) => a + c, 0)).toBe(g.overlaps.length);
      expect(g.summary.overlapsPerWeek).toBeCloseTo(g.overlaps.length / g.weeks, 1);
      await fixture("programs-gzclp-body", g);

      // gaps: coloured by lowest readiness, least recovered first
      const gaps = body("gzclp", { mode: "gaps" });
      expect(gaps.legend).toEqual(["recovered", "taxed"]);
      expect(gaps.muscles[0].gap).toBe(Math.max(...gaps.muscles.map((m) => m.gap)));
      expect(gaps.svgFront).not.toBe(g.svgFront);
      await fixture("programs-gzclp-body-gaps", gaps);

      // training days matter: back-to-back days overlap more than spread ones
      const packed = body("531", { days: [0, 1, 2, 3] });
      const spread = body("531", { days: [0, 2, 4, 6] });
      expect(packed.trainingDays).toEqual([0, 1, 2, 3]);
      expect(packed.summary.overlapsPerWeek).toBeGreaterThanOrEqual(spread.summary.overlapsPerWeek);
      expect(packed.overlaps.every((o) => o.from && o.to && !/^W\d/.test(o.to))).toBe(true);
      // options matter: BBB adds 5×10 of each main lift on top of no supplemental work
      const bbb = body("531", { opt: { supp: "bbb" }, svg: false });
      const none = body("531", { opt: { supp: "none" }, svg: false });
      expect(bbb.svgFront).toBeUndefined();
      const sets = (x: ProgramBody, id: string) => x.muscles.find((m) => m.id === id)!.sets;
      expect(sets(bbb, "rectusFemoris")).toBeGreaterThan(sets(none, "rectusFemoris") + 1);
      await fixture("programs-531-body-gaps", body("531", { mode: "gaps", svg: false }));

      expect(appProgramBody(boot, "nope")).toMatchObject({ status: 404 });
      expect(appProgramBody(boot, "531", { opt: { nope: "x" } })).toMatchObject({ status: 400 });
      expect(parseDays("4,0,2")).toEqual([0, 2, 4]);
      expect(parseDays(null)).toBeNull();
      expect(parseDays("0,0")).toHaveProperty("error");
      expect(parseDays("7")).toHaveProperty("error");
      expect(parseDays("a")).toHaveProperty("error");
    });

    it("every template plans without NaN", () => {
      for (const t of TEMPLATES) {
        const p = detail(boot, t.id);
        expect(p.weeks.length, t.id).toBeGreaterThan(0);
        expect(JSON.stringify(p), t.id).not.toMatch(/NaN|null,"name":null,"days":\[\]/);
        expect(p.weeks.every((w) => w.days.length > 0), t.id).toBe(true);
      }
    }, 60_000); // plans all ~60 programs; slow CI runners need more than the 5 s default

    it("start: builds a config with overrides, validates", () => {
      const r = startProgram(boot, "531", { options: { supp: "fsl" }, trainingDays: [4, 0, 2], trainingMaxes: { squat: 300 }, startDate: "2026-10-19" });
      if ("error" in r) throw new Error(r.error);
      expect(r.cfg).toMatchObject({ templateId: "531", options: { supp: "fsl", deload: "on" }, startDate: "2026-10-19T00:00:00Z", unit: "lb" });
      expect(r.cfg.trainingMaxes.squat).toBe(300);
      expect(r.cfg.trainingMaxes.bench).toBeGreaterThan(0);
      expect(r.cfg.liftMap).toEqual(boot.program!.liftMap);
      expect(r.trainingDays).toEqual([0, 2, 4]);
      const g = startProgram(fresh, "gzclp", null);
      if ("error" in g) throw new Error(g.error);
      expect(g.cfg.startDate).toBe(`${today}T00:00:00Z`);
      expect(g.trainingDays).toBeNull();
      const bad = (b: unknown) => startProgram(boot, "531", b);
      expect(bad({ trainingDays: [7] })).toMatchObject({ status: 400 });
      expect(bad({ trainingDays: [1, 1] })).toMatchObject({ status: 400 });
      expect(bad({ trainingMaxes: { squat: -5 } })).toMatchObject({ status: 400 });
      expect(bad({ trainingMaxes: { curl: 50 } })).toMatchObject({ status: 400 });
      expect(bad({ startWeights: { x: 1 } })).toMatchObject({ status: 400 });
      expect(bad({ options: { supp: "huge" } })).toMatchObject({ status: 400 });
      expect(bad({ startDate: "tomorrow" })).toMatchObject({ status: 400 });
      expect(bad([1])).toMatchObject({ status: 400 });
      expect(startProgram(boot, "nope", {})).toMatchObject({ status: 404 });
    });
  });
});
