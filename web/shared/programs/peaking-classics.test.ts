import { describe, expect, it } from "vitest";
import { initialState, planDay, programLength } from "../program";
import { coan12, coan14, hatchSquat, korte, russianBench } from "./peaking-classics";
import { reps, run, setup, ws } from "./testkit";

describe("Hatch Squat", () => {
  // the sheet's example maxes: back 405, front 315
  const { def, cfg } = setup(hatchSquat, { squat: 405, frontSquat: 315 });

  it("week 1 matches the sheet", () => {
    const s = initialState(def, cfg);
    expect(ws(def, cfg, s, 0, "hatch-d1-bs")).toEqual([245, 285, 305, 325]);
    expect(reps(def, cfg, s, 0, "hatch-d1-bs")).toEqual(["10", "8", "6", "4"]);
    expect(ws(def, cfg, s, 0, "hatch-d1-fs")).toEqual([190, 220, 220, 220]);
    expect(ws(def, cfg, s, 1, "hatch-d2-bs")).toEqual([245, 265, 285, 305]);
  });

  it("week 8 day 2 is 2×5, 3×5 back and 4×5 front; week 11 day 1 peaks at 103%", () => {
    let s = run(def, cfg, 15);
    expect(planDay(def, cfg, s).week).toBe(7);
    expect(reps(def, cfg, s, 1, "hatch-d2-bs")).toEqual(Array(5).fill("5"));
    expect(ws(def, cfg, s, 1, "hatch-d2-fs")).toEqual(Array(4).fill(190));
    s = run(def, cfg, 5, s);
    expect(planDay(def, cfg, s).weekName).toBe("Week 11 · 103% single");
    expect(ws(def, cfg, s, 0, "hatch-d1-bs")?.slice(-1)).toEqual([415]); // 103% of 405
    expect(programLength(hatchSquat)).toEqual({ kind: "block", weeks: 12 });
  });
});

describe("Korte 3×3", () => {
  // sheet example: bench 290, squat 405, deadlift 450 → projected 305 / 426 / 473 (what you enter)
  const { def, cfg } = setup(korte, { bench: 305, squat: 426, deadlift: 473 });

  it("phase 1: the same volume work all three days, 58/60/62% of the projected max", () => {
    let s = initialState(def, cfg);
    expect(ws(def, cfg, s, 0, "korte-1-bench")).toEqual(Array(6).fill(175));
    expect(reps(def, cfg, s, 0, "korte-1-bench")).toEqual(Array(6).fill("6"));
    expect(ws(def, cfg, s, 2, "korte-3-squat")).toEqual(Array(5).fill(245));
    expect(ws(def, cfg, s, 1, "korte-2-deadlift")).toEqual(Array(5).fill(275));
    s = run(def, cfg, 3, s);
    expect(ws(def, cfg, s, 0, "korte-1-bench")?.[0]).toBe(185);
    expect(ws(def, cfg, s, 0, "korte-1-squat")?.[0]).toBe(255);
    s = run(def, cfg, 3, s);
    expect(ws(def, cfg, s, 0, "korte-1-deadlift")?.[0]).toBe(295);
  });

  it("phase 2: deadlift singles Monday, bench Wednesday, squat Friday; 60% work otherwise", () => {
    const s = run(def, cfg, 12);
    expect(planDay(def, cfg, s).weekName).toBe("Intensity · Week 5");
    expect(ws(def, cfg, s, 0, "korte-1-deadlift")).toEqual([380, 380]);
    expect(ws(def, cfg, s, 0, "korte-1-bench")).toEqual(Array(5).fill(185));
    expect(reps(def, cfg, s, 0, "korte-1-squat")).toEqual(["3", "3", "3"]);
    expect(ws(def, cfg, s, 1, "korte-2-bench")).toEqual([245, 245]);
    expect(ws(def, cfg, s, 2, "korte-3-squat")).toEqual([340, 340]);
    const w8 = run(def, cfg, 9, s);
    expect(ws(def, cfg, w8, 1, "korte-2-bench")).toEqual([290, 290]); // 95% of 305
  });
});

describe("Ed Coan peaking", () => {
  it("12 weeks: the sheet's ladder off a 300 max", () => {
    const { def, cfg } = setup(coan12, { squat: 300, bench: 300, deadlift: 300 }, { lift: "squat" });
    expect(def.days.map((d) => d.id)).toEqual(["SQ"]);
    const loads: number[] = [];
    let s = initialState(def, cfg);
    for (let w = 0; w < 12; w++) { loads.push(ws(def, cfg, s, 0, "coan12-squat")![0]); s = run(def, cfg, 1, s); }
    expect(loads).toEqual([210, 210, 220, 235, 245, 255, 265, 280, 290, 300, 310, 335]);
    expect(s.complete).toBe(true);
  });

  it("14 weeks: two extra steps, same 111% finish; all three lifts by default", () => {
    const { def, cfg } = setup(coan14, { squat: 275, bench: 275, deadlift: 275 });
    expect(def.days.map((d) => d.id)).toEqual(["SQ", "BE", "DE"]);
    const s = initialState(def, cfg);
    expect(ws(def, cfg, s, 1, "coan14-bench")).toEqual([185, 185]);
    expect(reps(def, cfg, s, 1, "coan14-bench")).toEqual(["10", "10"]);
    expect(programLength(coan14)).toEqual({ kind: "block", weeks: 14 });
  });
});

describe("Russian Bench", () => {
  it("the sheet's grid off a 225 bench", () => {
    const { def, cfg } = setup(russianBench, { bench: 225 });
    let s = initialState(def, cfg);
    expect(ws(def, cfg, s, 0, "rb-d1")).toEqual(Array(6).fill(180));
    expect(reps(def, cfg, s, 1, "rb-d2")).toEqual(Array(6).fill("3"));
    s = run(def, cfg, 9, s);
    expect(ws(def, cfg, s, 0, "rb-d1")).toEqual(Array(5).fill(190));
    expect(ws(def, cfg, s, 2, "rb-d3")).toEqual(Array(4).fill(205));
    s = run(def, cfg, 6, s);
    expect(ws(def, cfg, s, 2, "rb-d3")).toEqual([235]);
  });
});
