import { describe, expect, it } from "vitest";
import { initialState, planDay, programLength } from "../program";
import { armstrong, greaseTheGroove } from "./bodyweight";
import { alphaDestinyNovice, bromley100, danJohn40, tenKSwings } from "./coaches";
import { reps, run, setup, ws } from "./testkit";

describe("bodyweight: Armstrong and Grease the Groove", () => {
  it("Armstrong: five different days, morning push-ups every day, Day 3 is nine training sets on three grips", () => {
    const { def, cfg } = setup(armstrong, {});
    const s = initialState(def, cfg);
    expect(def.days.map((d) => d.name)).toEqual(["Day 1 · Max effort", "Day 2 · Pyramid", "Day 3 · Training sets, three grips", "Day 4 · Max training sets", "Day 5 · Hardest day again"]);
    expect(def.days.every((d) => d.slots[0].lift === "pushUp")).toBe(true);
    expect(planDay(def, cfg, s, 2).exercises.slice(1).map((e) => [e.lift, e.scheme])).toEqual([["pullUp", "3×3"], ["chinUp", "3×3"], ["pullUp", "3×3"]]);
    expect(planDay(def, cfg, s, 0).exercises[1].scheme).toBe("5×1+");
    expect(armstrong.category).toBe("bodyweight");
    expect(programLength(armstrong).kind).toBe("ongoing");
  });

  it("Grease the Groove: one movement, your choice", () => {
    const g = setup(greaseTheGroove, {}, { lift: "pushUp" });
    expect(planDay(g.def, g.cfg, initialState(g.def, g.cfg)).exercises[0].lift).toBe("pushUp");
  });
});

describe("Dan John 40 Day", () => {
  it("a two-week wave: 2×5, 2×5, 5-3-2, 2×5, 2×5 then 2×5, singles, 1×10, 2×5, 5-3-2", () => {
    const { def, cfg } = setup(danJohn40, {});
    let s = initialState(def, cfg);
    const scheme = () => planDay(def, cfg, s).exercises[0].scheme;
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) { seen.push(planDay(def, cfg, s).dayName.split(" · ")[2]); s = run(def, cfg, 1, s); }
    expect(seen).toEqual(["2×5", "2×5", "5-3-2", "2×5", "2×5", "2×5", "6 singles", "1×10", "2×5", "5-3-2"]);
    expect(scheme()).toBe("2×5");
    expect(planDay(def, cfg, s).exercises.map((e) => e.lift)).toEqual(["ohp", "pullUp", "deadlift", "frontSquat", "farmersWalk"]);
    s = run(def, cfg, 30, s);
    expect(s.complete).toBe(true);
    expect(programLength(danJohn40)).toEqual({ kind: "block", weeks: 8 });
  });
});

describe("10,000 swings", () => {
  it("20 identical workouts of 500 swings with a 1-2-3 ladder", () => {
    const { def, cfg } = setup(tenKSwings, {}, { lift: "chinUp" }, { "10k-swing": 53 });
    const d = planDay(def, cfg, initialState(def, cfg));
    expect(d.exercises.map((e) => [e.lift, e.scheme])).toEqual([["kbSwing", "20×10–50"], ["chinUp", "15×1–3"]]);
    expect(def.days).toHaveLength(5);
    expect(def.cycle).toMatchObject({ weeks: 4, finite: true });
  });
});

describe("AlphaDestiny Novice", () => {
  it("A/B days; mains 3×4–6, five sets as an option; weight goes up when every set hits 6", () => {
    const sw = alphaDestinyNovice.defaults!("lb").startWeights!;
    const { def, cfg } = setup(alphaDestinyNovice, {}, {}, sw);
    let s = initialState(def, cfg);
    expect(planDay(def, cfg, s, 0).exercises.slice(0, 3).map((e) => [e.lift, e.scheme])).toEqual([["boxSquat", "3×4–6"], ["pauseBench", "3×4–6"], ["pendlayRow", "3×4–6"]]);
    expect(planDay(def, cfg, s, 1).exercises.map((e) => e.lift)).toEqual(["boxSquat", "ohp", "trapBarDeadlift", "cgBench", "chinUp", "plank"]);
    s = run(def, cfg, 1, s);
    expect(s.slots["ad-sq"].weight).toBe(145);
    expect(s.slots["ad-bench"].weight).toBe(120);
    s = run(def, cfg, 1, s);
    expect(s.slots["ad-sq"].weight).toBe(155); // shared between A and B
    expect(s.slots["ad-dl"].weight).toBe(205);
    expect(setup(alphaDestinyNovice, {}, { sets: "5" }).def.days[0].slots[0].progression).toMatchObject({ sets: 5 });
  });
});

describe("Bromley 100 lbs in 10 Weeks", () => {
  const { def, cfg } = setup(bromley100, { squat: 300, pushPress: 135, deadlift: 365 });

  it("week 1 matches the sheet (squat 210, push press 95, deadlift 235), last set for max reps", () => {
    const s = initialState(def, cfg);
    expect(ws(def, cfg, s, 1, "br-sq")).toEqual([210, 210, 210]);
    expect(reps(def, cfg, s, 1, "br-sq")).toEqual(["5", "5", "5+"]);
    expect(ws(def, cfg, s, 0, "br-pp")).toEqual([95, 95, 95]);
    expect(ws(def, cfg, s, 3, "br-dl")).toEqual([235, 235, 235]);
    expect(reps(def, cfg, s, 3, "br-sq-top")).toEqual(["5"]);
  });

  it("weeks 2–5 follow the wave; week 5's 1×3+ sets the max for wave 2", () => {
    let s = run(def, cfg, 4);
    expect(ws(def, cfg, s, 1, "br-sq")).toEqual(Array(5).fill(225));
    s = run(def, cfg, 12, s);
    expect(planDay(def, cfg, s).weekName).toBe("Week 5 · AMRAP");
    expect(ws(def, cfg, s, 1, "br-sq-test")).toEqual([265]);
    expect(ws(def, cfg, s, 3, "br-dl")).toEqual([310, 310, 310]);
    s = run(def, cfg, 4, s, 6); // 6 reps on the 88% triple
    expect(s.tms.squat).toBe(320); // 265 × (1 + 6/30) = 318 → 320
    expect(ws(def, cfg, s, 1, "br-sq")).toEqual([225, 225, 225]); // 70% of 320
  });
});
