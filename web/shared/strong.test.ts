import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchLift } from "./lifts";
import { localToUtc, parseCsv, parseDuration, parseStrong, slug, strongId, StrongError } from "./strong";
import { LB_PER_KG } from "./units";

// Synthetic export (no real person's data): 36 sessions, lb, BOM + CRLF, rest-timer rows,
// warmup/drop/failure sets, quoted notes with commas, quotes and a newline, one cardio row.
const SAMPLE = readFileSync(new URL("./fixtures/strong-sample.csv", import.meta.url), "utf8");
const TZ = "America/New_York";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded delimiters and newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi""\r\nthere"\r\n\r\n2,,last\n');
    expect(rows).toEqual([["a", "b", "c"], ["1", "x, y", 'say "hi"\r\nthere'], ["2", "", "last"]]);
  });
  it("sniffs semicolons from the header", () => {
    expect(parseCsv('a;b\n"1;2";3')).toEqual([["a", "b"], ["1;2", "3"]]);
    expect(parseCsv("a,b;c\n1,2;3")).toEqual([["a", "b;c"], ["1", "2;3"]]);
  });
});

describe("helpers", () => {
  it("parses Strong durations", () => {
    expect(parseDuration("1h 5m")).toBe(3900);
    expect(parseDuration("45m")).toBe(2700);
    expect(parseDuration("50s")).toBe(50);
    expect(parseDuration("1h")).toBe(3600);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("3600")).toBe(3600);
    expect(parseDuration("")).toBe(0);
  });
  it("reads dates as wall-clock time in the zone, across DST", () => {
    expect(localToUtc("2023-01-15 18:04:12", "America/New_York")).toBe("2023-01-15T23:04:12Z");
    expect(localToUtc("2023-07-15 18:04:12", "America/New_York")).toBe("2023-07-15T22:04:12Z");
    expect(localToUtc("2023-07-15 18:04", "Europe/Berlin")).toBe("2023-07-15T16:04:00Z");
    expect(localToUtc("2023-03-12 03:30:00", "America/New_York")).toBe("2023-03-12T07:30:00Z");
    expect(() => localToUtc("15/01/2023", TZ)).toThrow(StrongError);
  });
  it("slugs and ids", () => {
    expect(slug("Bench Press (Barbell)")).toBe("bench-press-barbell");
    expect(strongId("2023-01-15 18:04:12", "Push")).toBe(strongId(" 2023-01-15 18:04:12", "Push "));
    expect(strongId("2023-01-15 18:04:12", "Push")).not.toBe(strongId("2023-01-15 18:04:12", "Pull"));
    expect(strongId("2023-01-15 18:04:12", "Push")).toMatch(/^strong-[0-9a-z]+$/);
  });
});

describe("parseStrong on a realistic export", () => {
  const r = parseStrong(SAMPLE, { tz: TZ, unit: "lb" });

  it("groups rows into workouts and skips rest timers", () => {
    expect(r.workouts).toHaveLength(36);
    expect(r.unitDetected).toBeNull();
    expect(r.ignoredRows).toBe(36 * 3); // three rest timers per session
    expect(r.workouts.every((w) => w.exercises.every((e) => e.title !== "Rest Timer"))).toBe(true);
    expect(r.from! < r.to!).toBe(true);
    expect(r.workouts.map((w) => w.start_time)).toEqual([...r.workouts.map((w) => w.start_time)].sort());
  });

  it("maps a workout faithfully", () => {
    const w = r.workouts[0];
    expect(w.id).toBe(strongId("2026-06-01 18:41:03", "Workout A"));
    expect(w.title).toBe("Workout A");
    expect(w.start_time).toBe("2026-06-01T22:41:03Z");
    expect(Date.parse(w.end_time) - Date.parse(w.start_time)).toBe((60 + 14) * 60_000);
    const sq = w.exercises[0];
    expect(sq.title).toBe("Squat (Barbell)");
    expect(sq.exercise_template_id).toBe("strong:squat-barbell");
    expect(sq.sets.map((s) => s.type)).toEqual(["warmup", "warmup", "normal", "normal", "normal", "normal", "normal"]);
    expect(sq.sets[2].weight_kg).toBeCloseTo(185 / LB_PER_KG, 2);
    expect(sq.sets[2].reps).toBe(5);
    expect(sq.sets[6].rpe).toBe(8.5);
    const bench = w.exercises[1];
    expect(bench.sets.slice(-2).map((s) => [s.type, s.reps])).toEqual([["dropset", 10], ["failure", 6]]);
    const run = w.exercises.find((e) => e.title === "Running (Treadmill)")!;
    expect(run.sets[0]).toMatchObject({ distance_meters: Math.round(1.5 * 1609.344 * 10) / 10, duration_seconds: 900, reps: 0 });
  });

  it("keeps workout and exercise notes, including quotes and newlines", () => {
    expect(r.workouts[3].description).toBe('Slept badly, "meh" session, knees ok');
    expect(r.workouts[7].description).toBe("Gym was packed\nhad to share the rack");
    expect(r.workouts[2].exercises[0].notes).toBe("belt on, felt fast");
    expect(r.workouts[0].description).toBeNull();
  });

  it("parses odd durations", () => {
    expect(Date.parse(r.workouts[5].end_time) - Date.parse(r.workouts[5].start_time)).toBe(45 * 60_000);
    expect(Date.parse(r.workouts[9].end_time) - Date.parse(r.workouts[9].start_time)).toBe(50_000);
  });

  it("is stable: same ids and content on re-import", () => {
    const again = parseStrong(SAMPLE, { tz: TZ, unit: "lb" });
    expect(JSON.stringify(again.workouts)).toBe(JSON.stringify(r.workouts));
    // ids don't depend on the zone setting, so changing TIMEZONE later can't duplicate history
    expect(parseStrong(SAMPLE, { tz: "Europe/London", unit: "lb" }).workouts.map((w) => w.id)).toEqual(r.workouts.map((w) => w.id));
  });

  it("converts by the chosen unit", () => {
    const kg = parseStrong(SAMPLE, { tz: TZ, unit: "kg" });
    expect(kg.workouts[0].exercises[0].sets[2].weight_kg).toBe(185);
    expect(kg.workouts[0].exercises.find((e) => e.title.startsWith("Running"))!.sets[0].distance_meters).toBe(1500);
  });

  it("lists only exercises outside the lift library", () => {
    expect(r.unmatchedExercises).toEqual(["Cable Woodchopper", "Running (Treadmill)"]);
  });
});

describe("older semicolon exports with unit columns", () => {
  const csv = [
    "Date;Workout Name;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes;Workout Duration",
    '2019-03-02 09:15:00;"Push; heavy";Bench Press (Barbell);1;62,5;kg;5;;;;;;"first day; nervous";1h 5m',
    "2019-03-02 09:15:00;\"Push; heavy\";Bench Press (Barbell);Rest;;;;;;;90;;;1h 5m",
    "2019-03-02 09:15:00;\"Push; heavy\";Rowing (Machine);1;;kg;;;2;km;600;;;1h 5m",
  ].join("\n");
  it("detects the unit and reads decimal commas", () => {
    const r = parseStrong(csv, { tz: "Europe/Berlin" });
    expect(r.unitDetected).toBe("kg");
    expect(r.workouts).toHaveLength(1);
    const w = r.workouts[0];
    expect(w.title).toBe("Push; heavy");
    expect(w.description).toBe("first day; nervous");
    expect(w.start_time).toBe("2019-03-02T08:15:00Z");
    expect(w.exercises[0].sets).toHaveLength(1);
    expect(w.exercises[0].sets[0].weight_kg).toBe(62.5);
    expect(w.exercises[1].sets[0]).toMatchObject({ distance_meters: 2000, duration_seconds: 600, weight_kg: null });
    expect(r.ignoredRows).toBe(1);
  });
  it("a Weight Unit column beats the unit you pass", () => {
    expect(parseStrong(csv, { tz: "UTC", unit: "lb" }).workouts[0].exercises[0].sets[0].weight_kg).toBe(62.5);
  });
});

it("rejects files that aren't Strong exports", () => {
  expect(() => parseStrong("", { tz: TZ })).toThrow(StrongError);
  expect(() => parseStrong("date,title,exercise_title\n2024-01-01,x,y", { tz: TZ })).toThrow(/Not a Strong export/);
});

describe("lift matching of common Strong names", () => {
  const cases: [string, string][] = [
    ["Bench Press (Barbell)", "bench"], ["Squat (Barbell)", "squat"], ["Deadlift (Barbell)", "deadlift"],
    ["Overhead Press (Barbell)", "ohp"], ["Pull Up", "pullUp"], ["Chin Up", "chinUp"],
    ["Bent Over Row (Barbell)", "row"], ["Lat Pulldown (Cable)", "latPulldown"], ["Romanian Deadlift (Barbell)", "rdl"],
    ["Front Squat (Barbell)", "frontSquat"], ["Incline Bench Press (Barbell)", "inclineBench"], ["Hip Thrust (Barbell)", "hipThrust"],
    ["Seated Cable Row", "cableRow"], ["Seated Row (Cable)", "cableRow"], ["Sumo Deadlift (Barbell)", "sumoDeadlift"],
    ["Strict Military Press (Barbell)", "ohp"], ["Leg Press", "legPress"], ["Face Pull (Cable)", "facePull"],
    ["Triceps Pushdown (Cable - Straight Bar)", "tricepPushdown"], ["Bent Over One Arm Row (Dumbbell)", "dbRow"],
  ];
  it.each(cases)("%s → %s", (title, lift) => {
    expect(matchLift(title, `strong:${slug(title)}`)).toBe(lift);
  });
  it("Hevy titles still win and an explicit map still overrides", () => {
    expect(matchLift("Front Squat", "x")).toBe("frontSquat");
    expect(matchLift("Squat (Barbell)", "strong:squat-barbell", { squat: "OTHER" })).toBe(null);
    expect(matchLift("Anything", "T1", { pauseSquat: "T1" })).toBe("pauseSquat");
  });
  it("local-mode template ids name the lift directly", () => {
    expect(matchLift("Safety Bar Squat", "lift:safetyBarSquat")).toBe("safetyBarSquat");
    expect(matchLift("Whatever", "lift:nope")).toBe(null);
  });
});
