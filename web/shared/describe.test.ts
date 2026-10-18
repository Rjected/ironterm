import { describe, expect, it } from "vitest";
import { describeProgram, rulesText, type ProgramRules } from "./describe";
import { getTemplate, TEMPLATES } from "./programs";
import type { Unit } from "./units";

const rules = (id: string, unit?: Unit, options: Record<string, string> = {}) => {
  const t = getTemplate(id)!;
  return describeProgram(t.build({ ...Object.fromEntries(t.options.map((o) => [o.key, o.default])), ...options }), { unit });
};

function check(r: ProgramRules, label: string) {
  const all = [...r.overview, ...r.rotation.flatMap((d) => [d.day, ...d.lifts]), ...r.tiers.flatMap((t) => [t.title, t.text, ...t.lifts])];
  expect(r.overview.length, label).toBeGreaterThan(1);
  expect(r.rotation.length, label).toBeGreaterThan(0);
  expect(r.tiers.length, label).toBeGreaterThan(0);
  for (const s of all) {
    expect(s.trim(), label).not.toBe("");
    expect(s, label).not.toMatch(/undefined|NaN|\[object|null|Infinity/);
    // empty segments: "· ·", ": .", "( )", ", ,", doubled spaces or punctuation
    expect(s, `${label}: ${s}`).not.toMatch(/·\s*·|:\s*[.·,]|\(\s*\)|,\s*,|\s{2,}|\.\.|\s[.,]|\+-|\+−|^[.:,]/);
  }
  for (const t of r.tiers) {
    expect(t.lifts.length, label).toBeGreaterThan(0);
    expect(t.text, `${label}: ${t.title}`).toMatch(/[.)]$/);
  }
}

describe("describeProgram", () => {
  it("every template, every option value, both units and none: clean text", () => {
    for (const t of TEMPLATES) {
      const variants: Record<string, string>[] = [{}];
      for (const o of t.options) for (const c of o.choices) variants.push({ [o.key]: String(c.value) });
      for (const v of variants) for (const unit of ["lb", "kg", undefined] as const) check(rules(t.id, unit, v), `${t.id} ${JSON.stringify(v)} ${unit}`);
    }
  });

  it("no no-op rows and no double units once a unit is known", () => {
    for (const t of TEMPLATES) {
      const text = rulesText(rules(t.id, "lb"));
      expect(text, t.id).not.toMatch(/→ \+0\b|: \+0 |lb \/ /);
    }
    expect(rulesText(rules("gzclp"))).toContain("5 lb / 2.5 kg");
  });

  it("GZCLP: grouped tiers, per-lift increments in the unit, stage fallbacks", () => {
    const r = rules("gzclp", "lb");
    expect(r.rotation[0]).toEqual({ day: "Day A1 · Squat", lifts: ["T1 SQUAT", "T2 BENCH", "T3 LAT PD", "T3 CURL"] });
    expect(r.tiers.map((t) => t.title)).toEqual(["T1 · 5×3+ → 6×2+ → 10×1+", "T2 · 3×10 → 3×8 → 3×6", "T3 · 3×15+", "T3 · 4×12+"]);
    expect(r.tiers[0].text).toBe("5×3+ (last set as many reps as you can). Get every rep and add 10 lb on Back Squat and Deadlift and 5 lb on Overhead Press and Bench Press next time. If you miss a rep, move to 6×2+, then 10×1+ at the same weight. When 10×1+ stalls too, test a new 5-rep max and restart at 85% of it.");
    expect(r.tiers[2].text).toBe("3×15+. When the last set reaches 25 reps, add 5 lb next time; until then, keep the weight and push the last set.");
    expect(rules("gzclp", "kg").tiers[0].text).toContain("add 5 kg on Back Squat and Deadlift and 2.5 kg on Overhead Press and Bench Press");
  });

  it("5/3/1: week names, deload skip, TM bump grouped by amount", () => {
    const r = rules("531", "lb");
    expect(r.overview).toEqual([
      "4 sessions a week · four different days",
      "Repeats in 4-week cycles: 5s week, 3s week, 5/3/1 week and Deload.",
      "After each cycle, raise your training max: +5 lb on Overhead Press and Bench Press and +10 lb on Back Squat and Deadlift.",
      "Percentages are of your training max for each lift.",
    ]);
    expect(r.tiers[0]).toEqual({
      title: "Main · % of training max", lifts: ["Overhead Press", "Deadlift", "Bench Press", "Back Squat"],
      text: "5s week: 5 @ 65%, 5 @ 75%, 5+ @ 85%. 3s week: 3 @ 70%, 3 @ 80%, 3+ @ 90%. 5/3/1 week: 5 @ 75%, 3 @ 85%, 1+ @ 95%. Deload: 5 @ 40%, 5 @ 50%, 5 @ 60%.",
    });
    expect(r.tiers[1].text).toBe("Every week: 5×10 @ 50%."); // BBB stays in the deload week (jimwendler.com)
    expect(r.tiers[0].text).not.toMatch(/training max/); // the title already says it
  });

  it("nSuns 5-day: AMRAP table in the unit, merged rows, per-day tables", () => {
    const r = rules("nsuns5", "lb");
    const t = r.tiers.find((x) => x.lifts.includes("Back Squat") && x.title.startsWith("T1"))!;
    expect(t.text).toContain("Reps on the 1+ set move your training max: 0–1 reps: no change · 2–3 reps: +5 lb · 4–5 reps: +10 lb · 6+ reps: +15 lb. The change applies from the next week.");
    expect(t.text).toContain("Back Squat (Day 2 · Squat / Sumo): 5 @ 75%, 3 @ 85%, 1+ @ 95%");
    expect(r.overview[1]).toBe("Open-ended: keep running it as long as you progress.");
  });

  it("SBS RTF: long block summarised, rep-target table", () => {
    const r = rules("sbsRtf", "kg");
    expect(r.overview[1]).toBe("A 21-week block that ends after week 21.");
    expect(r.tiers[0].text).toBe("Changes every week over 21 weeks: sets of 1–10 reps at 70–95%, with AMRAP sets. The WORKOUTS tab lists each week. The last (AMRAP) set has a rep target, and beating or missing it moves your max: 2+ short: −5% · 1 short: −2% · on target: no change · 1 over: +0.5% · 2 over: +1% · 3 over: +1.5% · 4 over: +2% · 5+ over: +3%. Skipping a planned set at that weight, or coming up short on one, counts as 2+ short.");
    expect(r.tiers[1]).toMatchObject({ text: "Weeks 7, 14 and 21: 5×5 @ 60%." });
  });

  it("StrongLifts: alternating days, three misses then deload", () => {
    const r = rules("stronglifts", "lb");
    expect(r.overview[0]).toBe("3 sessions a week · two days that alternate, so the order shifts week to week");
    expect(r.tiers[0]).toEqual({
      title: "Main · 5×5", lifts: ["Back Squat", "Bench Press", "Barbell Row", "Overhead Press"],
      text: "5×5. Get every rep and add 5 lb next time. If you miss reps three sessions in a row, drop the weight 10% and build back up.",
    });
    expect(r.tiers[0].text).not.toMatch(/last scheme/);
  });

  it("Smolov Jr: base table plus the weekly additions", () => {
    const r = rules("smolov-jr", "lb");
    expect(r.tiers).toHaveLength(4);
    expect(r.tiers[0].text).toBe("Week 1: 6×6 @ 70%. Then every set gets heavier: +10 lb in week 2 and +20 lb in week 3. Your 1RM stays the same throughout.");
    expect(rules("smolov-jr", "kg", { add: "low" }).tiers[3].text).toBe("Week 1: 10×3 @ 85%. Then every set gets heavier: +2.5 kg in week 2 and +5 kg in week 3. Your 1RM stays the same throughout.");
  });

  it("snapshots", () => {
    for (const id of ["gzclp", "531", "nsuns5", "sbsRtf", "stronglifts", "smolov-jr"]) expect(rulesText(rules(id, "lb"))).toMatchSnapshot(id);
  });
});
