// Property tests: random but plausible training logs (and some implausible ones) through every
// pure builder the web app, the native apps and the widgets read. None may throw, and no number
// in their output may be NaN or ±Infinity.
import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { appBody, appCalendar, appGym, appHistory, appHome, appInsights, appLift, appLifts, appProgram, appStats, appWorkout, finishPRs, startSession } from "./appapi";
import type { HevySet, HevyWorkout, SetType } from "./hevy";
import { LIFTS } from "./lifts";
import { replay } from "./program";
import { buildProgram, defaultConfig, TEMPLATES } from "./programs";
import { snapshot } from "./snapshot";
import { parseStrong, StrongError } from "./strong";
import { readFileSync } from "node:fs";
import { addDays } from "./stats";

function rng(seed: number) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const TITLES = [...Object.values(LIFTS).flatMap((l) => l.hevy), "Plank", "Running", "Treadmill", "Mystery Machine", "Pull Up (Assisted)"];
const TYPES: SetType[] = ["normal", "normal", "normal", "warmup", "failure", "dropset"];

function randomLog(seed: number, today: string): HevyWorkout[] {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const n = pick([0, 1, 2, 5, 40, 150]);
  const out: HevyWorkout[] = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(today, -Math.floor(r() * (r() < 0.1 ? 1500 : 400)));
    // around DST changes and midnight too
    const hh = String(Math.floor(r() * 24)).padStart(2, "0"), mm = String(Math.floor(r() * 60)).padStart(2, "0");
    const start = `${day}T${hh}:${mm}:00Z`;
    const kind = r();
    const exercises = Array.from({ length: kind < 0.05 ? 0 : 1 + Math.floor(r() * 6) }, (_, k) => {
      const title = pick(TITLES);
      const cardio = /run|treadmill|bike|row/i.test(title);
      const sets: HevySet[] = Array.from({ length: Math.floor(r() * 7) }, (_, j) => {
        const odd = r();
        return {
          index: j, type: pick(TYPES),
          weight_kg: cardio || odd < 0.1 ? null : odd < 0.15 ? 0 : odd < 0.17 ? -20 : Math.round(r() * 250 * 10) / 10,
          reps: cardio ? null : odd > 0.97 ? 0 : odd > 0.95 ? null : odd > 0.93 ? 100 : 1 + Math.floor(r() * 15),
          distance_meters: cardio ? Math.round(r() * 10000) : null, duration_seconds: cardio || odd < 0.05 ? Math.round(r() * 3600) : null,
          rpe: r() < 0.3 ? 6 + Math.floor(r() * 9) / 2 : null,
        };
      });
      return { index: k, title, exercise_template_id: r() < 0.5 ? `t-${title}` : "", superset_id: r() < 0.1 ? 1 : null, notes: null, sets };
    });
    const dur = kind < 0.03 ? 0 : kind < 0.05 ? -600 : Math.floor(r() * 7200); // zero / negative durations happen in imports
    out.push({ id: `w${seed}-${i}`, title: pick(["Push", "Pull", "Legs", "", "GZCLP · A1", "Workout"]), description: r() < 0.2 ? "[ht:A1]" : null, start_time: start, end_time: new Date(Date.parse(start) + dur * 1000).toISOString(), exercises });
    // duplicate imports of the same session
    if (r() < 0.03) out.push({ ...out[out.length - 1], id: `w${seed}-${i}-dup` });
  }
  return out;
}

function finiteEverywhere(v: unknown, path = "$", bad: string[] = []): string[] {
  if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${path} = ${v}`);
  else if (Array.isArray(v)) v.forEach((x, i) => finiteEverywhere(x, `${path}[${i}]`, bad));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) finiteEverywhere(x, `${path}.${k}`, bad);
  return bad;
}

const TODAY = "2026-03-09"; // the Monday after US DST starts
const templates = TEMPLATES.map((t) => t.id);

describe("builders on random logs", () => {
  for (let seed = 1; seed <= 24; seed++) {
    it(`seed ${seed}`, () => {
      const r = rng(seed * 7919);
      const unit = r() < 0.5 ? "lb" : "kg";
      const workouts = randomLog(seed, TODAY);
      const tid = seed % 4 === 0 ? null : templates[Math.floor(r() * templates.length)];
      const program = tid ? defaultConfig(tid, unit, `${addDays(TODAY, -200)}T00:00:00Z`) : null;
      const b: Bootstrap = {
        mode: "local", auth: "none",
        settings: { unit, tz: ["America/New_York", "Europe/London", "Asia/Kolkata", "Pacific/Auckland", "UTC"][seed % 5], autoPush: false, graphMetric: (["volume", "sets", "duration"] as const)[seed % 3], trainingDays: seed % 3 ? undefined : [0, 2, 4], bodyweight: seed % 2 ? 80 : undefined },
        program, workouts, sync: { cursor: null }, today: TODAY, trips: seed % 5 ? [] : [{ id: "t", name: "trip", start: addDays(TODAY, -3), end: addDays(TODAY, 4), gym: "hotel" }],
        weighins: [{ date: addDays(TODAY, -10), kg: 80 }],
      };
      const d = derive(b, b.settings.graphMetric);
      const now = new Date(`${TODAY}T15:00:00Z`);
      const outputs: Record<string, unknown> = {
        snapshot: snapshot(b, now), home: appHome(b, d), gym: appGym(b, d), lifts: appLifts(b, d), history: appHistory(b, { limit: 30 }, d),
        calendar: appCalendar(b, undefined, d), program: appProgram(b, d), body: appBody(b, "ready", d), load: appBody(b, "load", d),
        insights: appInsights(b, d), stats: appStats(b, d), session: startSession(b, {}, now.toISOString(), d),
        liftDetails: d.liftKeys.map((k) => appLift(b, k, d)), workouts: workouts.slice(0, 10).map((w) => appWorkout(b, w.id, d)),
        prs: workouts.slice(-3).map((w) => finishPRs(b, w.id, d)),
      };
      expect(finiteEverywhere(outputs)).toEqual([]);
    });
  }
});

describe("Strong import on mangled files", () => {
  const sample = readFileSync(new URL("./fixtures/strong-sample.csv", import.meta.url), "utf8");
  it("either parses to finite workouts or fails with a StrongError", () => {
    const r = rng(42);
    const chars = [",", ";", '"', "\n", "\r\n", "x", "1", ".", "-", " ", ":", "é", "\u0000"];
    for (let i = 0; i < 400; i++) {
      let csv = sample.slice(0, Math.floor(r() * sample.length));
      const edits = Math.floor(r() * 20);
      for (let e = 0; e < edits; e++) {
        const at = Math.floor(r() * csv.length);
        csv = r() < 0.5 ? csv.slice(0, at) + chars[Math.floor(r() * chars.length)] + csv.slice(at) : csv.slice(0, at) + csv.slice(at + 1 + Math.floor(r() * 5));
      }
      try {
        const p = parseStrong(csv, { tz: "America/New_York", unit: r() < 0.5 ? "lb" : "kg" });
        expect(finiteEverywhere(p.workouts)).toEqual([]);
        for (const w of p.workouts) expect(Number.isNaN(Date.parse(w.start_time)) || Number.isNaN(Date.parse(w.end_time))).toBe(false);
      } catch (e) {
        if (!(e instanceof StrongError)) throw new Error(`edit ${i}: ${(e as Error).message}`);
      }
    }
  });
});

describe("program replay on random logs", () => {
  for (const id of templates) {
    it(`${id}: never throws, finite weights, deterministic`, () => {
      for (const seed of [3, 11]) {
        for (const unit of ["lb", "kg"] as const) {
          const cfg = defaultConfig(id, unit, `${addDays(TODAY, -300)}T00:00:00Z`);
          const def = buildProgram(cfg)!;
          const log = randomLog(seed, TODAY).sort((a, c) => a.start_time.localeCompare(c.start_time));
          const a = replay(def, cfg, log, { today: TODAY });
          const again = replay(def, cfg, log, { today: TODAY });
          expect(JSON.stringify(again)).toBe(JSON.stringify(a));
          expect(finiteEverywhere(a.slots), `${id} ${unit} slots`).toEqual([]);
          expect(finiteEverywhere(a.log), `${id} ${unit} log`).toEqual([]);
        }
      }
    });
  }
});
