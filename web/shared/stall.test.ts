import { describe, expect, it } from "vitest";
import type { LogEntry, ProgramDef, ProgramState, SlotResult, SlotState, Tier } from "./program";
import { addDays, epley, type LiftPoint } from "./stats";
import { detectStalls, GENERIC_FIXES, programStalls, theilSen } from "./stall";

const TODAY = "2026-10-17";
const pt = (date: string, weight: number, reps = 5): LiftPoint => ({ date, workoutId: date, e1rm: epley(weight, reps), topWeight: weight, topReps: reps, volume: weight * reps, sets: [{ weight, reps }] });
/** `weeks` weeks of sessions every `every` days ending `endAgo` days before TODAY; weight from f(weeksFromStart). */
const series = (weeks: number, f: (wk: number) => number, every = 3.5, endAgo = 0): LiftPoint[] => {
  const out: LiftPoint[] = [];
  const days = weeks * 7;
  for (let d = 0; d <= days; d += every) out.push(pt(addDays(TODAY, -endAgo - days + Math.round(d)), f(d / 7)));
  return out;
};

describe("detectStalls", () => {
  it("progressing: steady +1%/week", () => {
    const r = detectStalls({ squat: series(16, (wk) => 200 * (1 + 0.01 * wk)) }, TODAY).squat;
    expect(r.status).toBe("progressing");
    expect(r.change6w!).toBeGreaterThan(0.04);
    expect(r.slope!).toBeGreaterThan(0);
    expect(r.weeksSincePR).toBe(0);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("stalled: regular training, flat for 10 weeks", () => {
    const r = detectStalls({ bench: series(16, (wk) => (wk < 6 ? 150 + wk * 2 : 162)) }, TODAY).bench;
    expect(r.status).toBe("stalled");
    expect(r.change6w).toBeCloseTo(0, 5);
    expect(r.weeksSincePR!).toBeGreaterThanOrEqual(6);
    expect(Math.abs(r.slope!)).toBeLessThan(0.5);
    expect(r.sessions6w).toBeGreaterThanOrEqual(4);
  });

  it("not stalled when flat but a PR landed in the last 6 weeks", () => {
    // up, then flat for only 4 weeks
    const r = detectStalls({ bench: series(16, (wk) => (wk < 12 ? 140 + wk * 2 : 162)) }, TODAY).bench;
    expect(r.status).toBe("progressing");
  });

  it("regressing: down >3% over 6 weeks", () => {
    const r = detectStalls({ deadlift: series(16, (wk) => (wk < 9 ? 300 : 300 - (wk - 9) * 4)) }, TODAY).deadlift;
    expect(r.status).toBe("regressing");
    expect(r.change6w!).toBeLessThan(-0.03);
    expect(r.slope!).toBeLessThan(0);
  });

  it("inactive: nothing in 3+ weeks, or nothing at all", () => {
    const r = detectStalls({ ohp: series(10, (wk) => 100 + wk, 3.5, 30), none: [] }, TODAY);
    expect(r.ohp.status).toBe("inactive");
    expect(r.ohp.daysSinceLast!).toBeGreaterThan(21);
    expect(r.none.status).toBe("inactive");
  });

  it("flat but irregular is reported as inactive, not stalled", () => {
    const r = detectStalls({ row: series(16, () => 100, 14) }, TODAY).row;
    expect(r.sessions6w).toBeLessThan(4);
    expect(r.status).toBe("inactive");
    expect(r.reason).toMatch(/regularly/);
  });

  it("ignores high-rep sets for e1RM and future-dated points", () => {
    const pts = [...series(16, () => 200), pt(addDays(TODAY, -2), 150, 20), pt(addDays(TODAY, 5), 400, 1)];
    const r = detectStalls({ squat: pts }, TODAY).squat;
    expect(r.bestNow).toBeCloseTo(epley(200, 5));
    expect(r.status).toBe("stalled");
  });

  it("short history is progressing with low confidence", () => {
    const r = detectStalls({ squat: series(3, (wk) => 200 + wk * 5) }, TODAY).squat;
    expect(r.status).toBe("progressing");
    expect(r.best6w).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });

  it("theilSen shrugs off an outlier", () => {
    expect(theilSen([0, 1, 2, 3, 4, 5], [0, 1, 2, 30, 4, 5])).toBeCloseTo(1);
  });
});

// ───────── programStalls ─────────

const res = (slotId: string, lift: string, tier: Tier, weight: number, outcome: SlotResult["outcome"], reps: number[] = [], amrapReps?: number): SlotResult => ({ slotId, lift, tier, scheme: "", weight, outcome, reps, amrapReps, note: "" });
const state = (slots: Record<string, Partial<SlotState>>, log: [string, SlotResult[]][], tms: Record<string, number> = {}): ProgramState => ({
  dayIndex: 0, rotations: 0, tms,
  slots: Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, { weight: 0, stage: 0, stage0Weight: 0, retest: false, fails: 0, ...v }])),
  log: log.map(([date, results], i): LogEntry => ({ workoutId: `w${i}`, date: `${date}T12:00:00Z`, dayId: "A", week: 0, results })),
});
const T1 = [{ sets: 5, reps: 3, amrap: true }, { sets: 6, reps: 2, amrap: true }, { sets: 10, reps: 1, amrap: true }];
const T2 = [{ sets: 3, reps: 10, amrap: false }, { sets: 3, reps: 8, amrap: false }, { sets: 3, reps: 6, amrap: false }];
const gz: ProgramDef = {
  templateId: "gzclp", name: "GZCLP", sessionsPerWeek: 3,
  days: [{ id: "A", name: "A", slots: [
    { id: "t1", lift: "squat", tier: "T1", progression: { kind: "stages", stages: T1, advance: { type: "baseVolume" }, onFinalFail: { type: "retest", rmReps: 5, pct: 0.85 }, increment: { lb: 10, kg: 5 } } },
    { id: "t2", lift: "bench", tier: "T2", progression: { kind: "stages", stages: T2, advance: { type: "baseVolume" }, onFinalFail: { type: "reset", bumpIncrements: 2 }, increment: { lb: 5, kg: 2.5 } } },
    { id: "t3", lift: "latPulldown", tier: "T3", progression: { kind: "stages", stages: [{ sets: 3, reps: 15, amrap: true }], advance: { type: "amrapAtLeast", reps: 25 }, onFinalFail: { type: "hold" }, increment: { lb: 5, kg: 2.5 } } },
  ] }],
};

describe("programStalls: stages", () => {
  it("GZCLP T1 on 10×1+: next miss means a 5RM retest", () => {
    const s = state({ t1: { weight: 300, stage: 2 } }, [["2026-10-01", [res("t1", "squat", "T1", 300, "stage-down")]], ["2026-10-03", [res("t1", "squat", "T1", 300, "stage-down")]]]);
    const [x] = programStalls(gz, s).filter((i) => i.slotId === "t1");
    expect(x.kind).toBe("last-stage");
    expect(x.fix).toMatch(/You're on 10×1\+; the next miss means a 5RM retest/);
  });

  it("retest due", () => {
    const s = state({ t1: { weight: 300, stage: 2, retest: true } }, [["2026-10-01", [res("t1", "squat", "T1", 300, "retest-next")]]]);
    const x = programStalls(gz, s)[0];
    expect(x).toMatchObject({ kind: "retest-due", severity: "stalled" });
    expect(x.fix).toMatch(/5RM.*85%/);
  });

  it("T2 reset twice recently → repeated-resets", () => {
    const s = state({ t2: { weight: 145, stage: 0, stage0Weight: 145 } }, [
      ["2026-09-01", [res("t2", "bench", "T2", 150, "reset")]],
      ["2026-09-10", [res("t2", "bench", "T2", 145, "success")]],
      ["2026-09-20", [res("t2", "bench", "T2", 155, "reset")]],
    ]);
    expect(programStalls(gz, s).find((i) => i.slotId === "t2")?.kind).toBe("repeated-resets");
  });

  it("T3 stuck below 25 reps for 4 sessions", () => {
    const s = state({ t3: { weight: 100 } }, ["09-01", "09-04", "09-08", "09-11"].map((d) => [`2026-${d}`, [res("t3", "latPulldown", "T3", 100, "hold", [15, 15, 20], 20)]]));
    const x = programStalls(gz, s)[0];
    expect(x).toMatchObject({ kind: "no-progress", severity: "stalled", sessions: 4 });
    expect(x.fix).toMatch(/25 reps/);
  });

  it("StrongLifts 2/3 strikes is a watch item", () => {
    const sl: ProgramDef = { templateId: "sl", name: "SL", sessionsPerWeek: 3, days: [{ id: "A", name: "A", slots: [{ id: "sq", lift: "squat", tier: "MAIN", progression: { kind: "stages", stages: [{ sets: 5, reps: 5, amrap: false }], advance: { type: "baseVolume" }, onFinalFail: { type: "deload", pct: 0.1 }, increment: { lb: 5, kg: 2.5 }, failsBeforeAction: 3 } }] }] };
    const s = state({ sq: { weight: 200, fails: 2 } }, [["2026-10-01", [res("sq", "squat", "MAIN", 200, "fail")]], ["2026-10-03", [res("sq", "squat", "MAIN", 200, "fail")]]]);
    const [x] = programStalls(sl, s);
    expect(x).toMatchObject({ kind: "no-progress", severity: "watch" });
    expect(x.fix).toMatch(/2\/3 misses at 200; 1 more means a 10% deload to about 180/);
  });

  it("progressing slots produce nothing", () => {
    const s = state({ t1: { weight: 310 } }, [["2026-10-01", [res("t1", "squat", "T1", 300, "success")]]]);
    expect(programStalls(gz, s)).toEqual([]);
  });
});

describe("programStalls: double and percent", () => {
  it("double progression at the same weight for 4 sessions", () => {
    const def: ProgramDef = { templateId: "t", name: "t", sessionsPerWeek: 3, days: [{ id: "A", name: "A", slots: [{ id: "r", lift: "dbRow", tier: "ACC", progression: { kind: "double", sets: 3, reps: [8, 12], increment: { lb: 5, kg: 2 } } }] }] };
    const s = state({ r: { weight: 60 } }, ["09-01", "09-04", "09-08", "09-11"].map((d) => [`2026-${d}`, [res("r", "dbRow", "ACC", 60, "hold", [10, 9, 8])]]));
    const [x] = programStalls(def, s);
    expect(x).toMatchObject({ kind: "double-stuck", severity: "stalled", sessions: 4 });
    expect(x.fix).toMatch(/Same weight for 4 sessions.*smaller jump \(2\.5.*add a set \(4×8–12\)/);
  });

  const pct = (tmRule?: boolean): ProgramDef => ({ templateId: "t", name: "t", sessionsPerWeek: 3, days: [{ id: "A", name: "A", slots: [{ id: "s", lift: "squat", tier: "MAIN", progression: { kind: "percent", tmLift: "squat", weeks: [[{ pct: 0.85, reps: 5, amrap: true }]], tmRule: tmRule ? { type: "amrapTable", setIndex: 0, table: [{ minReps: 0, increments: -1 }, { minReps: 5, increments: 0 }, { minReps: 8, increments: 1 }] } : undefined } }] }] });

  it("TM dropped twice → reset to 90% of a recent e1RM", () => {
    const s = state({}, [["2026-09-01", [res("s", "squat", "MAIN", 255, "tm-up", [9])]], ["2026-09-08", [res("s", "squat", "MAIN", 260, "tm-down", [4])]], ["2026-09-15", [res("s", "squat", "MAIN", 255, "tm-down", [3])]]], { squat: 290 });
    const [x] = programStalls(pct(true), s);
    expect(x.kind).toBe("tm-down");
    expect(x.fix).toMatch(/90% of a recent e1RM/);
    expect(x.fix).toContain((epley(255, 9) * 0.9).toFixed(1).replace(/\.0$/, ""));
  });

  it("TM holding 3 sessions is a watch item", () => {
    const s = state({}, ["09-01", "09-08", "09-15"].map((d) => [`2026-${d}`, [res("s", "squat", "MAIN", 255, "hold", [6])]]), { squat: 300 });
    expect(programStalls(pct(true), s)[0]).toMatchObject({ kind: "tm-stuck", severity: "watch" });
  });

  it("5/3/1-style missed AMRAP minimum twice", () => {
    const s = state({}, [["2026-09-01", [res("s", "squat", "MAIN", 255, "hold", [3], 3)]], ["2026-09-08", [res("s", "squat", "MAIN", 255, "hold", [4], 4)]]], { squat: 300 });
    const [x] = programStalls(pct(false), s);
    expect(x.kind).toBe("missed-amrap");
    expect(x.fix).toMatch(/10%/);
  });

  it("exports a generic fix list", () => {
    expect(GENERIC_FIXES.length).toBeGreaterThanOrEqual(4);
    expect(GENERIC_FIXES.join(" ")).toMatch(/deload/i);
    expect(GENERIC_FIXES.join(" ")).toMatch(/sleep/i);
  });
});
