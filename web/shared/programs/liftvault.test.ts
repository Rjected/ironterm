import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../hevy";
import { LIFTS } from "../lifts";
import { applyWorkout, initialState, planDay, type ProgramConfig, type ProgramDef, type ProgramState, type ProgramTemplate } from "../program";
import { toKg, type Unit } from "../units";
import {
  LIFTVAULT_TEMPLATES, arnoldSplit, bromleyBeginner, canditoAdvBench, canditoAdvSquat, gvt, gzclGgWave, gzclUhf5, gzclUhf9, magOrt, nuckolsHf, smolov,
} from "./liftvault";

const W = (id: string, date: string, ex: [string, [number, number][]][], unit: Unit = "lb"): HevyWorkout => ({
  id, title: id, start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`,
  exercises: ex.map(([title, sets]) => ({ title, exercise_template_id: title, sets: sets.map(([w, reps]) => ({ type: "normal" as const, weight_kg: toKg(w, unit), reps })) })),
});
const title = (lift: string) => LIFTS[lift].hevy[0];

function setup(t: ProgramTemplate, maxes?: Record<string, number>, options: Record<string, string> = {}, unit: Unit = "lb") {
  const opts = { ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options };
  const d = t.defaults?.(unit) ?? {};
  const cfg: ProgramConfig = { templateId: t.id, options: opts, unit, startDate: "2026-01-01", startWeights: d.startWeights ?? {}, trainingMaxes: maxes ?? d.trainingMaxes ?? {}, increments: {} };
  return { cfg, def: t.build(opts) };
}

/** Plan a day id ("W4D3") as if its week had been reached. */
function plan(def: ProgramDef, cfg: ProgramConfig, dayId: string, state?: ProgramState) {
  const i = def.days.findIndex((d) => d.id === dayId);
  expect(i, dayId).toBeGreaterThanOrEqual(0);
  const wk = def.days[i].weeks?.[0] ?? 0;
  return planDay(def, cfg, { ...(state ?? initialState(def, cfg)), rotations: wk }, i);
}
const loads = (def: ProgramDef, cfg: ProgramConfig, dayId: string, slotSuffix: string, state?: ProgramState) => {
  const ex = plan(def, cfg, dayId, state).exercises.find((e) => e.slotId.endsWith(slotSuffix));
  expect(ex, `${dayId} ${slotSuffix}`).toBeDefined();
  return ex!.sets.map((s) => s.weight);
};
const reps = (def: ProgramDef, cfg: ProgramConfig, dayId: string, slotSuffix: string) =>
  plan(def, cfg, dayId).exercises.find((e) => e.slotId.endsWith(slotSuffix))!.sets.map((s) => s.reps);

/** Log every scheduled day as prescribed until the program completes. */
function runAll(def: ProgramDef, cfg: ProgramConfig) {
  let s = initialState(def, cfg);
  let n = 0;
  while (!s.complete && n < 300) {
    const p = planDay(def, cfg, s);
    const ex = p.exercises.filter((e) => LIFTS[e.lift]?.hevy.length).map((e): [string, [number, number][]] => [title(e.lift), e.sets.map((x) => [x.weight || 100, x.reps])]);
    s = applyWorkout(def, cfg, s, W(`w${n}`, "2026-02-01", ex, cfg.unit), s.dayIndex);
    n++;
  }
  return { s, n };
}
const at = (def: ProgramDef, state: ProgramState, dayId: string): ProgramState => {
  const i = def.days.findIndex((d) => d.id === dayId);
  return { ...state, dayIndex: i, rotations: def.days[i].weeks?.[0] ?? state.rotations };
};

describe("all LiftVault templates", () => {
  it("build with every option, have unique ids and sane metadata", () => {
    const ids = new Set<string>();
    for (const t of LIFTVAULT_TEMPLATES) {
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
      expect(t.source).toMatch(/LiftVault|GZCL Free Compendium/);
      const variants = [{}, ...t.options.flatMap((o) => o.choices.map((c) => ({ [o.key]: c.value })))];
      for (const v of variants) {
        const { def } = setup(t, undefined, v);
        expect(def.templateId).toBe(t.id);
        expect(new Set(def.days.map((d) => d.id)).size).toBe(def.days.length);
        for (const d of def.days) {
          expect(d.slots.length).toBeGreaterThan(0);
          expect(new Set(d.slots.map((s) => s.id)).size, `${t.id} ${d.id}`).toBe(d.slots.length);
        }
        // every percent slot's TM lift has a default max, so setup shows realistic loads
        const tms = setup(t, undefined, v).cfg.trainingMaxes;
        for (const d of def.days) for (const s of d.slots) if (s.progression.kind === "percent") expect(tms[s.progression.tmLift], `${t.id} ${s.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("finite programs run to completion", () => {
    const expected: [ProgramTemplate, number, Record<string, string>?][] = [
      [smolov, 35], [magOrt, 10], [gzclUhf5, 25], [gzclUhf9, 45], [gzclUhf9, 53, { taper: "on" }], [gzclGgWave, 64], [canditoAdvBench, 21], [canditoAdvSquat, 30],
    ];
    for (const [t, sessions, o] of expected) {
      const { def, cfg } = setup(t, undefined, o);
      const { s, n } = runAll(def, cfg);
      expect([t.id, s.complete, n]).toEqual([t.id, true, sessions]);
    }
  });
});

describe("Smolov (vs LiftVault sheet: squat 300, power clean 200, box squat 315)", () => {
  const { def, cfg } = setup(smolov, { squat: 300, powerClean: 200, boxSquat: 315 });

  it("intro and base loads match the sheet, including +20 / +30 lb base jumps", () => {
    expect(loads(def, cfg, "W1D1", "-sq")).toEqual([195, 195, 195, 210, 225, 225, 240]);
    expect(loads(def, cfg, "W1D3", "-sq")).toEqual([210, 210, 210, 210, 225, 240, 240, 270]);
    expect(loads(def, cfg, "W2D1", "-sq")).toEqual([255, 255, 255, 255]);
    const base: [string, number[]][] = [["D1", [210, 230, 240]], ["D2", [225, 245, 255]], ["D3", [240, 260, 270]], ["D4", [255, 275, 285]]];
    for (const [d, want] of base) expect([3, 4, 5].map((w) => loads(def, cfg, `W${w}${d}`, "-sq")[0])).toEqual(want);
    expect(reps(def, cfg, "W3D1", "-sq")).toEqual(Array(4).fill(9));
    expect(reps(def, cfg, "W3D4", "-sq")).toEqual(Array(10).fill(3));
  });

  it("the base 1RM test sets the max that switching and intense run off (new max 425)", () => {
    const s0 = at(def, initialState(def, cfg), "W6D1");
    const s1 = applyWorkout(def, cfg, s0, W("t", "2026-03-01", [[title("squat"), [[315, 1], [385, 1], [425, 1]]]]), s0.dayIndex);
    expect(s1.tms.squat).toBe(425);
    expect(s1.rotations).toBe(6);
    expect(loads(def, cfg, "W7D1", "-neg", s1)).toEqual([435]);
    expect(loads(def, cfg, "W7D1", "-pc", s1)).toEqual(Array(8).fill(120));
    expect(loads(def, cfg, "W7D1", "-box", s1)).toEqual(Array(12).fill(220));
    expect(loads(def, cfg, "W8D1", "-neg", s1)).toEqual([445]);
    expect(loads(def, cfg, "W8D1", "-box", s1)).toEqual(Array(12).fill(235));
    // Intense mesocycle, sheet column values with new 1RM 425
    expect(loads(def, cfg, "W9D1", "-sq", s1)).toEqual([275, 320, 360, 360, 360, 360]);
    expect(loads(def, cfg, "W9D2", "-sq", s1)).toEqual([255, 300, 340, 385, 360, 360]);
    expect(loads(def, cfg, "W10D3", "-sq", s1)).toEqual([275, 320, 360, 385, 385, 385, 385]);
    expect(loads(def, cfg, "W12D3", "-sq", s1)).toEqual([320, 385, 405, 405, 405]);
    expect(loads(def, cfg, "W13D1", "-sq", s1)).toEqual([320, 360, 360, 360, 360]);
  });
});

describe("Magnusson–Ortmayer (deadlift 405)", () => {
  const { def, cfg } = setup(magOrt, { deadlift: 405 });

  it("follows the sheet schedule (+10 lb steps) and skips rest weeks", () => {
    let s = initialState(def, cfg);
    const seen: number[][] = [];
    while (!s.complete) {
      const p = planDay(def, cfg, s);
      seen.push(p.exercises[0].sets.map((x) => x.weight));
      s = applyWorkout(def, cfg, s, W(`m${seen.length}`, "2026-02-01", [[title("deadlift"), p.exercises[0].sets.map((x) => [x.weight || 405, x.reps])]]), s.dayIndex);
    }
    expect(seen).toHaveLength(10);
    expect(seen[0]).toEqual([285, 285, 285, 285, 325, 325, 285]);
    expect(seen[1]).toEqual([285, 285, 285, 285, 325, 365, 285]);
    expect(seen[2]).toEqual([295, 295, 295, 295, 335, 375, 295]); // week 3: +10
    expect(seen[3]).toEqual(seen[2]); // week 5 (after the rest week) repeats week 3
    expect(seen[8][0]).toBe(335); // week 11: 70% + 50
    expect(seen[9]).toEqual([0]); // week 12 test
  });
});

describe("GZCL UHF+ 5 week (vs sheet TMs: S420 B250 D430 OHP135 incline 135 front squat 165)", () => {
  const { def, cfg } = setup(gzclUhf5, { squat: 420, bench: 250, deadlift: 430, ohp: 135, inclineBench: 135, frontSquat: 165 });

  it("matches the sheet's training schedule", () => {
    expect(def.days).toHaveLength(25);
    expect(loads(def, cfg, "W1D1", "-t1")).toEqual([380, 325, 325, 325]);
    expect(loads(def, cfg, "W1D1", "-t2")).toEqual([90, 90, 90, 90]);
    expect(loads(def, cfg, "W1D2", "-t1")).toEqual([225, 195, 195, 195]);
    expect(loads(def, cfg, "W1D2", "-t2")).toEqual(Array(6).fill(305));
    expect(loads(def, cfg, "W1D3", "-t1")).toEqual([385, 310, 310, 310]);
    expect(loads(def, cfg, "W1D4", "-t1")).toEqual([245, 200, 200, 200]);
    expect(loads(def, cfg, "W1D5", "-t1")).toEqual([150, 130, 130, 130]);
    expect(loads(def, cfg, "W1D5", "-t2")).toEqual([165, 165, 165, 165]);
    expect(loads(def, cfg, "W4D1", "-t1")).toEqual([410, 410, 400, 400, 400]);
    expect(loads(def, cfg, "W5D1", "-t1")).toEqual([420, 355]);
    const w1 = plan(def, cfg, "W1D1").exercises[0].sets;
    expect(w1.map((x) => x.amrap)).toEqual([false, false, false, true]);
  });

  it("T3 set counts drop 5/5/4/3/1 with the sheet's rep targets", () => {
    for (const [w, n, lo] of [[1, 5, 12], [2, 5, 12], [3, 4, 10], [4, 3, 8], [5, 1, 10]]) {
      const t3 = plan(def, cfg, `W${w}D1`).exercises.find((e) => e.slotId.endsWith("-t3a"))!;
      expect([t3.lift, t3.sets.length, t3.sets[0].reps, t3.sets[0].weight]).toEqual(["cableRow", n, lo, 0]);
    }
  });
});

describe("GZCL UHF 9 week (vs compendium: S440 B250 D440 incline 245)", () => {
  const { def, cfg } = setup(gzclUhf9, { squat: 440, bench: 250, deadlift: 440, inclineBench: 245 });

  it("matches the compendium's schedule", () => {
    expect(loads(def, cfg, "W1D1", "-t1")).toEqual([375, 375, 375]);
    expect(loads(def, cfg, "W1D1", "-t2")).toEqual([145, 145, 145, 145]);
    expect(loads(def, cfg, "W2D2", "-t2")).toEqual(Array(8).fill(330));
    expect(loads(def, cfg, "W4D1", "-t1")).toEqual([385, 395, 405, 405, 405, 405, 405]);
    expect(loads(def, cfg, "W4D2", "-t1")).toEqual([220, 225, 230, 230, 230, 230, 230]);
    expect(plan(def, cfg, "W9D1").exercises.map((e) => e.tier)).toEqual(["T1", "T3", "T3"]);
    expect(def.cycle?.weeks).toBe(9);
    const taper = setup(gzclUhf9, { squat: 440, bench: 250, deadlift: 440, inclineBench: 245 }, { taper: "on" });
    expect(taper.def.cycle?.weeks).toBe(11);
    expect(loads(taper.def, taper.cfg, "W11D1", "-t1")).toEqual([460, 460, 460]);
  });
});

describe("GZCL GG Wave LP (1RMs B200 S300 D400 OHP135)", () => {
  const { def, cfg } = setup(gzclGgWave, { bench: 200, squat: 300, deadlift: 400, ohp: 135 });
  const wk = (w: number, day: string, tier: string) => planDay(def, cfg, { ...initialState(def, cfg), rotations: w }, def.days.findIndex((d) => d.id === day)).exercises.find((e) => e.tier === tier)!;

  it("T1 80% / T2 70% plus weekly increments, waves restart one step up", () => {
    expect(wk(0, "bench", "T1").sets.map((x) => x.weight)).toEqual(Array(7).fill(160));
    expect(wk(0, "bench", "T1").sets.map((x) => x.reps)).toEqual([6, 1, 1, 1, 1, 1, 1]);
    expect(wk(1, "bench", "T1").sets[0].weight).toBe(165);
    expect(wk(4, "bench", "T1").sets[0].weight).toBe(165);
    expect(wk(4, "bench", "T1").sets.map((x) => x.reps)).toEqual([5, 1, 1, 1, 1, 1]);
    expect(wk(15, "bench", "T1").sets[0].weight).toBe(190);
    expect(wk(0, "bench", "T2").sets.map((x) => [x.weight, x.reps])).toEqual([[210, 10], [210, 5], [210, 5], [210, 5], [210, 5]]);
    expect(wk(8, "bench", "T2").sets.map((x) => x.reps)).toEqual([7, 4, 4, 3, 3]);
    expect(wk(15, "bench", "T2").sets[0].weight).toBe(240);
    expect(wk(0, "ohp", "T1").sets[0].weight).toBe(107.5);
    expect(wk(1, "ohp", "T1").sets[0].weight).toBe(110);
  });
});

describe("Candito Advanced Bench (vs sheet: 1RM 300, desired 315)", () => {
  const { def, cfg } = setup(canditoAdvBench, { bench: 300 }, { goal: "0.05" });

  it("matches every bench load in the sheet", () => {
    expect(loads(def, cfg, "W1D1", "-bench")).toEqual([210, 210, 210]);
    expect(loads(def, cfg, "W2D1", "-bench-top")).toEqual([265, 265, 265]);
    expect(loads(def, cfg, "W2D3", "-bench")).toEqual([225, 225, 225]);
    expect(loads(def, cfg, "W3D1", "-bench-top")).toEqual([270, 270, 270]);
    expect(loads(def, cfg, "W4D1", "-bench")).toEqual(Array(10).fill(250));
    expect(loads(def, cfg, "W4D2", "-bench")).toEqual(Array(5).fill(255));
    expect(loads(def, cfg, "W5D1", "-bench")).toEqual([275, 275, 275]);
    expect(loads(def, cfg, "W5D2", "-bench")).toEqual(Array(5).fill(270));
    expect(loads(def, cfg, "W6D1", "-a")).toEqual([340, 340, 340]);
  });

  it("uses the chosen accessories at RPE 9 with no prescribed load", () => {
    const { def: d2, cfg: c2 } = setup(canditoAdvBench, { bench: 300 }, { acc1: "spotoPress", acc2: "inclineBench" });
    const ex = plan(d2, c2, "W1D1").exercises.find((e) => e.slotId.endsWith("-a"))!;
    expect([ex.lift, ex.sets.length, ex.sets[0].reps, ex.sets[0].rpe, ex.sets[0].weight]).toEqual(["spotoPress", 3, 8, 9, 0]);
    expect(plan(d2, c2, "W1D2").exercises.find((e) => e.slotId.endsWith("-a"))!.lift).toBe("inclineBench");
  });

  it("a miss doesn't move the max; the max-out sets the new 1RM", () => {
    const s0 = at(def, initialState(def, cfg), "W6D2");
    const s1 = applyWorkout(def, cfg, s0, W("max", "2026-03-01", [[title("bench"), [[275, 1], [300, 1], [315, 1]]]]), s0.dayIndex);
    expect(s1.tms.bench).toBe(315);
    expect(s1.complete).toBe(true);
  });
});

describe("Candito Advanced Squat (vs sheet: current 425, goal 440 ≈ +3.5%)", () => {
  const { def, cfg } = setup(canditoAdvSquat, { squat: 425 }, { goal: "0.035" });

  it("matches the sheet's squat loads", () => {
    const sheet: [string, string, number[]][] = [
      ["W1D1", "-sq", [320, 320, 320]], ["W2D1", "-sq-top", [385, 385, 385]], ["W3D1", "-sq", [385]], ["W3D2", "-sq", [340, 340, 340]],
      ["W4D1", "-sq", Array(10).fill(350)], ["W4D2", "-sq", Array(5).fill(355)], ["W4D2", "-sq-bo", Array(5).fill(310)],
      ["W5D1", "-sq-top", [385]], ["W5D1", "-sq", [...Array(5).fill(350), ...Array(5).fill(340)]],
      ["W5D2", "-sq", Array(5).fill(355)], ["W5D2", "-sq-2", Array(5).fill(345)], ["W5D2", "-sq-bo", Array(5).fill(315)],
      ["W6D2", "-sq", Array(12).fill(330)], ["W7D1", "-sq", [395]], ["W7D2", "-sq", Array(12).fill(335)], ["W7D3", "-sq", [400, 400, 400]],
      ["W8D1", "-sq", [400]], ["W8D2", "-sq", Array(12).fill(340)], ["W8D3", "-sq", [405, 405, 405]], ["W9D1", "-sq", Array(6).fill(320)], ["W9D2", "-sq", Array(9).fill(330)],
    ];
    for (const [d, s, want] of sheet) expect([d, s, loads(def, cfg, d, s)]).toEqual([d, s, want]);
  });

  it("primary accessories follow the options", () => {
    const { def: d2, cfg: c2 } = setup(canditoAdvSquat, { squat: 425 }, { acc1: "boxSquat", acc2: "pinSquat" });
    expect(plan(d2, c2, "W1D1").exercises.find((e) => e.slotId.endsWith("-a"))!.lift).toBe("boxSquat");
    expect(plan(d2, c2, "W1D2").exercises.find((e) => e.slotId.endsWith("-a"))!.lift).toBe("pinSquat");
  });
});

describe("Greg Nuckols High Frequency (vs sheet, kg: S290 B215 D375)", () => {
  const { def, cfg } = setup(nuckolsHf, { squat: 290, bench: 215, deadlift: 375 }, {}, "kg");
  const day = (id: string, w: number, lift: string, state?: ProgramState) =>
    planDay(def, cfg, { ...(state ?? initialState(def, cfg)), rotations: w }, def.days.findIndex((d) => d.id === id)).exercises.find((e) => e.lift === lift)!.sets;

  it("matches the Exact template's loads and weekly set/rep waves", () => {
    expect(def.days.map((d) => d.id)).toEqual(["D1", "D2", "D3", "D4", "D5"]);
    expect(day("D1", 0, "squat").map((x) => x.weight)).toEqual([217.5, 217.5, 217.5, 217.5]);
    expect(day("D1", 0, "bench")[0].weight).toBe(162.5);
    expect(day("D1", 0, "deadlift")[0].weight).toBe(282.5);
    expect(day("D4", 0, "deadlift")[0].weight).toBe(320);
    expect(day("D1", 1, "squat").map((x) => x.reps)).toEqual([3, 3, 3, 3, 3]);
    expect(day("D1", 2, "squat").map((x) => x.reps)).toEqual([4, 4, 4, 4, 4]);
    expect(day("D5", 2, "bench")).toHaveLength(6);
    expect(day("D4", 2, "squat").map((x) => [x.weight, x.amrap])).toEqual([[247.5, true]]);
  });

  it("week 3 AMAP: 9 reps → +5 kg, 6 → +2.5, 12 → +7.5, applied after the week", () => {
    const s0 = { ...initialState(def, cfg), rotations: 2, dayIndex: 3 };
    const s1 = applyWorkout(def, cfg, s0, W("d4", "2026-02-01", [[title("squat"), [[247.5, 9]]], [title("bench"), [[182.5, 6]]], [title("deadlift"), [[320, 12]]]], "kg"), 3);
    expect(s1.tms).toMatchObject({ squat: 290, bench: 215, deadlift: 375 });
    const s2 = applyWorkout(def, cfg, s1, W("d5", "2026-02-02", [[title("squat"), [[187.5, 6]]]], "kg"), 4);
    expect(s2.rotations).toBe(3);
    expect(s2.tms).toMatchObject({ squat: 295, bench: 217.5, deadlift: 382.5 });
    // weeks 1–2 singles at 85% never move the max
    const s3 = applyWorkout(def, cfg, { ...initialState(def, cfg), dayIndex: 3 }, W("w1", "2026-02-01", [[title("squat"), [[247.5, 1], [247.5, 1], [247.5, 1]]]], "kg"), 3);
    expect(s3.pendingTm?.squat ?? 0).toBe(0);
  });

  it("6-day version: deadlift and OHP once a week, rows/pulldowns off a 6RM that grows 2% per extra set", () => {
    const six = setup(nuckolsHf, { squat: 290, bench: 215, deadlift: 375, ohp: 50, latPulldown: 70, tBarRow: 62.5 }, { version: "6day" }, "kg");
    expect(six.def.days.map((d) => d.id)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
    expect(six.def.days.filter((d) => d.slots.some((s) => s.lift === "deadlift")).map((d) => d.id)).toEqual(["FRI"]);
    const thu = six.def.days.findIndex((d) => d.id === "THU");
    const pd = (w: number) => planDay(six.def, six.cfg, { ...initialState(six.def, six.cfg), rotations: w }, thu).exercises.filter((e) => e.lift === "latPulldown").map((e) => e.sets.map((x) => x.weight));
    expect(pd(0)).toEqual([[55, 55, 55, 55]]);
    expect(pd(1)).toEqual([[60, 60, 60, 60]]);
    expect(pd(2)).toEqual([[70]]);
    const s0 = { ...initialState(six.def, six.cfg), rotations: 2, dayIndex: thu };
    const s1 = applyWorkout(six.def, six.cfg, s0, W("thu", "2026-02-05", [[title("latPulldown"), [[70, 6], [70, 6], [70, 6], [70, 6]]]], "kg"), thu);
    expect(s1.pendingTm?.latPulldown).toBeCloseTo(4.2);
  });
});

describe("German Volume Training", () => {
  const { def, cfg } = setup(gvt, { squat: 315 });
  const B = def.days.findIndex((d) => d.id === "B");

  it("10×10 at 60%; all 100 reps → +5% (sheet 'Next' column), a short or missing set holds", () => {
    const sq = planDay(def, cfg, initialState(def, cfg), B).exercises[0];
    expect([sq.lift, sq.sets.length, sq.sets[0].reps, sq.sets[0].weight]).toEqual(["squat", 10, 10, 190]);
    const ok = applyWorkout(def, cfg, initialState(def, cfg), W("b", "2026-02-01", [[title("squat"), Array(10).fill([190, 10])]]), B);
    expect(ok.tms.squat).toBeCloseTo(330.75);
    expect(planDay(def, cfg, ok, B).exercises[0].sets[0].weight).toBe(200);
    const short = applyWorkout(def, cfg, initialState(def, cfg), W("b", "2026-02-01", [[title("squat"), [...Array(9).fill([190, 10]), [190, 8]]]]), B);
    expect(short.tms.squat).toBe(315);
    const missing = applyWorkout(def, cfg, initialState(def, cfg), W("b", "2026-02-01", [[title("squat"), Array(9).fill([190, 10])]]), B);
    expect(missing.tms.squat).toBe(315);
  });

  it("phase 2 is 10×6 at 70% on new lifts", () => {
    const p2 = setup(gvt, { deadlift: 400 }, { phase: "2" });
    const dl = planDay(p2.def, p2.cfg, initialState(p2.def, p2.cfg), 1).exercises[0];
    expect([dl.lift, dl.sets.length, dl.sets[0].reps, dl.sets[0].weight]).toEqual(["deadlift", 10, 6, 280]);
  });
  // Poliquin's phase 2: B exercises 3×6 (fly, EZ-bar row) and 3×12–15 (twisting crunch, calves);
  // the arms/shoulders day stays dips + incline hammer curls with bent-over and seated laterals.
  it("phase 2 B work and arms day follow Poliquin's text", () => {
    const p2 = gvt.build({ phase: "2" });
    const lifts = (id: string) => p2.days.find((d) => d.id === id)!.slots.map((x) => `${x.lift} ${x.progression.kind === "double" ? x.progression.reps.join("-") : ""}`.trim());
    expect(lifts("A")).toEqual(["dbInclineBench", "pullUp", "chestFly 6-6", "row 6-6"]);
    expect(lifts("B")).toEqual(["deadlift", "legCurl", "crunch 12-15", "calfRaise 12-15"]);
    expect(lifts("C")).toEqual(["dip", "hammerCurl", "rearDeltFly 10-12", "lateralRaise 10-12"]);
  });
});

describe("Arnold split", () => {
  it("three days run twice a week with 4-set pyramids", () => {
    const { def, cfg } = setup(arnoldSplit);
    expect(def.sessionsPerWeek).toBe(6);
    expect(def.days.map((d) => d.slots.length)).toEqual([7, 11, 7]);
    const p = planDay(def, cfg, initialState(def, cfg), 0);
    expect(p.exercises[0]).toMatchObject({ lift: "bench" });
    expect(p.exercises[0].sets).toHaveLength(4);
  });
});

describe("Bromley simplest beginner", () => {
  const { def, cfg } = setup(bromleyBeginner);

  it("4×6+: last set beats 6 → add weight, a hard 6 → hold", () => {
    const up = applyWorkout(def, cfg, initialState(def, cfg), W("a", "2026-02-01", [[title("squat"), [[135, 6], [135, 6], [135, 6], [135, 11]]], [title("bench"), [[95, 6], [95, 6], [95, 6], [95, 6]]]]), 0);
    expect(up.slots["brm-squat"].weight).toBe(145);
    expect(up.slots["brm-bench"].weight).toBe(95);
  });

  it("stage 2 adds a variations day", () => {
    expect(setup(bromleyBeginner, undefined, { stage: "3day" }).def.days.map((d) => d.id)).toEqual(["A", "B", "C"]);
  });
});
