import { describe, expect, it } from "vitest";
import { describeProgram, rulesText } from "../describe";
import { initialState, planDay, programLength } from "../program";
import { reps, run, setup, ws } from "./testkit";
import { jackShit, periodizationBible, triumvirate, wendlerForever } from "./wendler-forever";

const TMS = { squat: 300, bench: 200, deadlift: 400, ohp: 100 };

describe("5/3/1 Forever: Leader / Anchor", () => {
  it("an 11-week lap that repeats forever: Leader ×2, 7th-week deload, Anchor, 7th-week TM test", () => {
    const { def } = setup(wendlerForever, TMS);
    expect(def.cycle?.weekNames).toEqual([
      "Leader 1 · Week 1", "Leader 1 · Week 2", "Leader 1 · Week 3", "Leader 2 · Week 1", "Leader 2 · Week 2", "Leader 2 · Week 3",
      "7th week · Deload", "Anchor · Week 1", "Anchor · Week 2", "Anchor · Week 3", "7th week · TM test",
    ]);
    expect(def.cycle?.tmIncreaseAt).toEqual([2, 5, 9]);
    expect(programLength(wendlerForever)).toEqual({ kind: "cycles", weeks: 11 });
    expect(setup(wendlerForever, TMS, { plan: "2-2" }).def.cycle?.weeks).toBe(14);
  });

  it("leader weeks: 5's PRO (all fives, no AMRAP) + BBB 5×10 @ 50%", () => {
    const { def, cfg } = setup(wendlerForever, TMS);
    const s = initialState(def, cfg);
    const d1 = planDay(def, cfg, s, 0);
    expect(d1.exercises.map((e) => e.slotId).slice(0, 2)).toEqual(["lf1-leader", "lf1-ls"]);
    expect(ws(def, cfg, s, 0, "lf1-leader")).toEqual([195, 225, 255]); // 65/75/85% of 300
    expect(reps(def, cfg, s, 0, "lf1-leader")).toEqual(["5", "5", "5"]);
    expect(ws(def, cfg, s, 0, "lf1-ls")).toEqual(Array(5).fill(150));
    expect(reps(def, cfg, s, 0, "lf1-ls")).toEqual(Array(5).fill("10"));
  });

  it("BBS and SSL leaders use the first / second set's weight", () => {
    const bbs = setup(wendlerForever, TMS, { leader: "bbs" });
    expect(ws(bbs.def, bbs.cfg, initialState(bbs.def, bbs.cfg), 0, "lf1-ls")).toEqual(Array(10).fill(195));
    const ssl = setup(wendlerForever, TMS, { leader: "ssl" });
    expect(ws(ssl.def, ssl.cfg, initialState(ssl.def, ssl.cfg), 0, "lf1-ls")).toEqual(Array(5).fill(225));
  });

  it("TM rises after each leader, the 7th week deloads, then the anchor runs PR sets + FSL", () => {
    const { def, cfg } = setup(wendlerForever, TMS);
    let s = run(def, cfg, 12); // leader 1 done
    expect(s.tms).toEqual({ squat: 310, bench: 205, deadlift: 410, ohp: 105 });
    s = run(def, cfg, 12, s); // leader 2 done
    expect(s.tms.squat).toBe(320);
    expect(planDay(def, cfg, s).weekName).toBe("7th week · Deload");
    expect(ws(def, cfg, s, 0, "lf1-deload")).toEqual([225, 255, 290, 320]); // 70/80/90/100% of 320
    expect(reps(def, cfg, s, 0, "lf1-deload")).toEqual(["5", "3–5", "1", "1"]);
    expect(planDay(def, cfg, s, 0).exercises.filter((e) => e.tier !== "ACC").map((e) => e.slotId)).toEqual(["lf1-deload"]);
    s = run(def, cfg, 4, s); // deload: no TM change
    expect(s.tms.squat).toBe(320);
    expect(planDay(def, cfg, s).weekName).toBe("Anchor · Week 1");
    expect(reps(def, cfg, s, 0, "lf1-anchor")).toEqual(["5", "5", "5+"]);
    expect(ws(def, cfg, s, 0, "lf1-as")).toEqual(Array(5).fill(210)); // FSL 65% of 320
  });

  it("after the anchor: TM up, TM test week, then Leader 1 again", () => {
    const { def, cfg } = setup(wendlerForever, TMS);
    let s = run(def, cfg, 40); // 10 weeks
    expect(s.tms).toEqual({ squat: 330, bench: 215, deadlift: 430, ohp: 115 });
    expect(planDay(def, cfg, s).weekName).toBe("7th week · TM test");
    expect(ws(def, cfg, s, 0, "lf1-test")).toEqual([230, 265, 295, 330]);
    expect(reps(def, cfg, s, 0, "lf1-test")).toEqual(["5", "5", "5", "3–5"]);
    s = run(def, cfg, 4, s);
    expect(s.tms.squat).toBe(330);
    expect(s.complete).toBeFalsy();
    expect(planDay(def, cfg, s).weekName).toBe("Leader 1 · Week 1");
    expect(ws(def, cfg, s, 0, "lf1-leader")).toEqual([215, 250, 280]); // 65/75/85% of 330
  });

  it("rules read the phases and the uneven TM bumps", () => {
    const r = describeProgram(setup(wendlerForever, TMS).def, { unit: "lb" });
    const text = rulesText(r);
    // one MAIN and one SUPP per day although each phase has its own slot
    expect(r.rotation[0].lifts.slice(0, 2)).toEqual(["MAIN SQUAT", "SUPP SQUAT"]);
    expect(text).toContain("7th week · TM test (week 11): 5 @ 70%, 5 @ 80%, 5 @ 90%, 3–5 @ 100%.");
    expect(text).toContain("Weeks 1–6: 5×10 @ 50%.");
    expect(text).toContain("Repeats in 11-week cycles");
    expect(text).toContain("At the end of weeks 3, 6 and 10 of each cycle, raise your training max");
  });
});

describe("original-book 5/3/1 assistance templates", () => {
  it("Triumvirate: press day is press 5/3/1 + dips 5×15 + chins 5×10", () => {
    const { def, cfg } = setup(triumvirate, TMS);
    const s = initialState(def, cfg);
    const d1 = planDay(def, cfg, s, 0);
    expect(d1.exercises.map((e) => [e.lift, e.scheme])).toEqual([["ohp", "3 sets · 5+"], ["dip", "5×15"], ["chinUp", "5×10"]]);
    expect(planDay(def, cfg, s, 1).exercises.map((e) => [e.lift, e.scheme])).toEqual([["deadlift", "3 sets · 5+"], ["goodMorning", "5×12"], ["hangingLegRaise", "5×15"]]);
    expect(ws(def, cfg, s, 3, "531-triumvirate-4")).toEqual([195, 225, 255]);
    expect(def.cycle?.weeks).toBe(4);
    expect(triumvirate.build({ deload: "off" }).cycle?.weeks).toBe(3);
  });

  it("Periodization Bible: three assistance lifts, 5×10–20", () => {
    const { def, cfg } = setup(periodizationBible, TMS);
    const d = planDay(def, cfg, initialState(def, cfg), 3);
    expect(d.exercises.map((e) => e.lift)).toEqual(["squat", "backExtension", "bulgarianSplitSquat", "abWheel"]);
    expect(d.exercises[1].scheme).toBe("5×10–20");
  });

  it("Jack Shit: the main lift only, TM up each cycle", () => {
    const { def, cfg } = setup(jackShit, TMS);
    expect(def.days.every((d) => d.slots.length === 1)).toBe(true);
    const s = run(def, cfg, 16);
    expect(s.tms).toEqual({ squat: 310, bench: 205, deadlift: 410, ohp: 105 });
  });
});
