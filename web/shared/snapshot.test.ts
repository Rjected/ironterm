import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { demoData } from "./demo";
import { snapshot, SNAPSHOT_VERSION } from "./snapshot";

const today = "2026-10-15"; // a Thursday
const demo = demoData(today);
const boot: Bootstrap = {
  mode: "demo", auth: "none", settings: { unit: "lb", tz: "America/New_York", trainingDays: [0, 1, 3, 4] } as Bootstrap["settings"],
  program: demo.config, workouts: demo.workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
};

describe("snapshot", () => {
  const s = snapshot(boot, new Date(today + "T16:00:00Z"));
  it("has a full Monday-first year grid ending today", () => {
    expect(s.v).toBe(SNAPSHOT_VERSION);
    expect(s.graph.days[0].date).toBe(s.graph.start);
    expect(new Date(s.graph.start + "T12:00:00Z").getUTCDay()).toBe(1);
    expect(s.graph.days.at(-1)!.date).toBe(today);
    expect(s.graph.days.length).toBe(52 * 7 + 4);
    expect(s.graph.days.every((d) => d.level >= 0 && d.level <= 4)).toBe(true);
  });
  it("plans the next session with weights and a readable summary", () => {
    expect(s.program?.name).toMatch(/GZCLP/);
    const n = s.program!.next!;
    expect(n.exercises.length).toBeGreaterThan(1);
    expect(n.exercises[0].summary).toMatch(/\d+×\d+/);
    expect(n.exercises[0].top).toBeGreaterThan(0);
  });
  it("covers this week, lifts and recovery", () => {
    expect(s.week.days.map((d) => d.dow)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
    expect(s.lifts.slice(0, 4).map((l) => l.key)).toEqual(["squat", "bench", "deadlift", "ohp"]);
    expect(s.lifts[0].spark).toHaveLength(12);
    expect(s.recovery!.muscles[0].readiness).toBeLessThanOrEqual(s.recovery!.muscles.at(-1)!.readiness);
    expect(JSON.stringify(s).length).toBeLessThan(40_000);
  });
  it("writes the fixture the native apps test against", async () => {
    if ((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WRITE_FIXTURES !== "1") return;
    const fs = "node:fs";
    const { writeFileSync } = (await import(/* @vite-ignore */ fs)) as { writeFileSync: (u: URL, s: string) => void };
    writeFileSync(new URL("../../docs/api/snapshot.sample.json", import.meta.url), JSON.stringify(s, null, 2) + "\n");
  });
});
