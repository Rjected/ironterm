import { describe, expect, it } from "vitest";
import { describeProgram } from "../describe";
import { initialState, lengthTag, planDay, programLength, type ProgramDef, type ProgramTemplate } from "../program";
import { getTemplate, TEMPLATES } from "./index";
import { NEXT_STEPS, nextStep } from "./next";
import { run, setup, ws } from "./testkit";

const len = (id: string) => programLength(getTemplate(id)!);

describe("program length kinds", () => {
  it("blocks, cycles and ongoing programs are told apart", () => {
    expect(len("gzclp")).toEqual({ kind: "ongoing", weeks: null });
    expect(len("stronglifts")).toEqual({ kind: "ongoing", weeks: null });
    expect(len("531")).toEqual({ kind: "cycles", weeks: 4 });
    expect(len("531-beginners")).toEqual({ kind: "cycles", weeks: 3 });
    expect(len("smolov-jr")).toEqual({ kind: "block", weeks: 3 });
    expect(len("sbsRtf")).toEqual({ kind: "block", weeks: 21 });
    expect(lengthTag(len("531"))).toBe("CYCLES FOREVER");
    expect(lengthTag(len("smolov-jr"))).toBe("3-WEEK BLOCK");
    expect(lengthTag(len("gzclp"))).toBe("ONGOING");
  });

  it("every template has a kind, and blocks never repeat", () => {
    for (const t of TEMPLATES) {
      const l = programLength(t);
      const c = t.build(Object.fromEntries(t.options.map((o) => [o.key, o.default]))).cycle;
      if (l.kind === "cycles") expect(c?.finite, t.id).toBeFalsy();
      if (l.kind === "block") expect(l.weeks, t.id).toBeGreaterThan(0);
    }
  });

  it("a cycling program keeps going past its last week, TM rising each lap", () => {
    const { def, cfg } = setup(getTemplate("531")!, { squat: 300, bench: 200, deadlift: 400, ohp: 100 });
    let s = initialState(def, cfg);
    for (let lap = 0; lap < 3; lap++) {
      expect(planDay(def, cfg, s).weekName).toBe("5s week");
      const tm = 300 + lap * 10;
      expect(ws(def, cfg, s, 3, "4-main")).toEqual([0.65, 0.75, 0.85].map((p) => Math.round((tm * p) / 5) * 5));
      s = run(def, cfg, 16, s);
      expect(s.complete).toBeFalsy();
    }
    expect(s.rotations).toBe(12);
    expect(s.tms).toEqual({ squat: 330, bench: 215, deadlift: 430, ohp: 115 });
  });
});

describe("cycle.tmIncreaseAt (uneven phases)", () => {
  // Two 3-week phases with a 1-week break between: TM goes up after weeks 3 and 7 only.
  const t: ProgramTemplate = {
    id: "t", name: "t", author: "", source: "", summary: "", category: "strength", level: "intermediate", daysPerWeek: [1], options: [],
    build: (): ProgramDef => ({
      templateId: "t", name: "t", sessionsPerWeek: 1,
      days: [{ id: "1", name: "Day 1 · Squat", slots: [{ id: "sq", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 0.8, reps: 5 }]] } }] }],
      cycle: { weeks: 7, tmIncrease: { squat: { lb: 10, kg: 5 } }, tmIncreaseAt: [2, 6] },
    }),
  };

  it("bumps at the end of the listed weeks, every lap", () => {
    const { def, cfg } = setup(t, { squat: 300 });
    const tmAfter = (n: number) => run(def, cfg, n).tms.squat;
    expect([1, 2, 3, 4, 6, 7, 10, 14].map(tmAfter)).toEqual([300, 300, 310, 310, 310, 320, 330, 340]);
  });

  it("describes when the bumps happen", () => {
    const r = describeProgram(t.build({}), { unit: "lb" });
    expect(r.overview).toContain("At the end of weeks 3 and 7 of each cycle, raise your training max: +10 lb on Back Squat.");
  });
});

describe("what to run next", () => {
  it("every entry points at real templates", () => {
    for (const [id, n] of Object.entries(NEXT_STEPS)) {
      expect(getTemplate(id), id).toBeTruthy();
      if (n.id) expect(getTemplate(n.id), `${id} → ${n.id}`).toBeTruthy();
      expect(n.when, id).toMatch(/\.$/);
    }
    expect(nextStep(getTemplate("starting-strength")!)?.id).toBe("texas-method");
  });
});
