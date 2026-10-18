// Fixed-length blocks built from the copies in Dan's Google Drive. Every week has its own days
// (one DayDef per week × day, ids "W3D2"), generated from compact spec strings so the tables
// below can be read side by side with the source sheets.
//
//   candito6    Candito 6 Week Strength Program (Jonnie Candito). Percentages backed out of Dan's
//               "Candito 6 Week Program.xlsx" (1RMs 250/185/295 lb, loads rounded to 5 lb) and the
//               rules from the program PDF / sheet notes.
//   clarence14  14 Week Powerlifting by Clarence0. RPE-based; sets/reps/RPEs copied from Dan's
//               copy of the sheet plus the program guide doc.
//   complete16  "Complete 16-week Program" (the Calgary Barbell 16-week program, Bryce Krawczyk).
//               % of the sheet's maxes and RPE targets copied from Dan's xlsx.
//
// Spec mini-language (one string per week, segments joined with ";"):
//   "4x6@80%"        4 sets of 6 at 80% of the slot's max
//   "5x3@80%+5lb"    % plus a fixed load (kg = half the lb figure: +5 lb / +2.5 kg)
//   "1x10@67.5%"     varying % per set: chain segments with ";"
//   "3x4-6@87.5%"    rep range
//   "1x8+@80%"       AMRAP set (target = 8)
//   "3x5@rpe8"       RPE-only, lifter picks the load ("rpe7-8" → 7.5, range kept in the note)
//   "1x8@8RM"        rep-max test: one AMRAP set, the slot's max is re-estimated from it
//   "1+2Fx4@rpe9"    Calgary notation: one top set @9 then 2 back-off sets (F fatigue / R repeat)
//   "4xAMRAP"        every set to failure
//   "3x30s"          timed sets
//   "|text"          trailing note for the slot
//   "-"              not done that week
// Rows with a max ("tm") become `percent` slots; rows without become `fixed` accessories.

import { LIFTS } from "../lifts";
import type { DayDef, PercentSet, ProgramTemplate, SlotDef, Tier, TmRule } from "../program";
import type { Unit } from "../units";

// ───────────────────────── spec builder ─────────────────────────

interface RowExtra {
  note?: string;
  tier?: Tier;
  tmRule?: TmRule;
}
/** [lift, max it's a % of (null → fixed accessory), one spec per block week, extras] */
type Row = [string, string | null, string[], RowExtra?];
interface BlockDay {
  label?: string;
  rows: Row[];
}
interface Block {
  /** 0-based program weeks; each row has one spec per entry */
  weeks: number[];
  days: BlockDay[];
}

const BIG3 = new Set(["squat", "bench", "deadlift"]);

function rpeOf(s: string): { rpe: number; label: string } {
  const [a, b] = s.split("-").map(Number);
  return b ? { rpe: (a + b) / 2, label: `RPE ${a}–${b}` } : { rpe: a, label: `RPE ${a}` };
}

interface Parsed {
  sets: PercentSet[];
  notes: string[];
  /** index of a rep-max test set */
  test?: number;
  repsMax?: number;
  timed?: string;
}

function parse(spec: string): Parsed {
  const out: Parsed = { sets: [], notes: [] };
  const [body, ...note] = spec.split("|");
  if (note.length) out.notes.push(note.join("|").trim());
  for (const raw of body.split(";").map((x) => x.trim()).filter(Boolean)) {
    const [scheme, intensity] = raw.split("@");
    const base: Partial<PercentSet> = {};
    const pm = intensity?.match(/^([\d.]+)%(?:([+-]\d+(?:\.\d+)?)lb)?$/);
    if (pm) {
      base.pct = Number(pm[1]) / 100;
      if (pm[2]) base.add = { lb: Number(pm[2]), kg: Number(pm[2]) / 2 };
    }
    else if (intensity?.startsWith("rpe")) {
      const r = rpeOf(intensity.slice(3));
      base.rpe = r.rpe;
      if (r.label.includes("–")) out.notes.push(r.label);
    } else if (intensity === "opener") out.notes.push("opener: the weight you'll open with on the platform");
    const top = scheme.match(/^1\+(\d+)([FR])x(\d+)$/);
    if (top) {
      const [, n, kind, r] = top;
      const reps = Number(r);
      out.sets.push({ ...base, reps }, ...Array.from({ length: Number(n) }, () => ({ reps })));
      out.notes.push(`1+${n}${kind}: top set${base.rpe ? ` @${base.rpe}` : ""}, then ${n} back-off ${kind === "F" ? "(fatigue) sets" : "(repeat) sets"}`);
      continue;
    }
    const m = scheme.match(/^(\d+)x(\d+)(?:-(\d+))?(\+)?$|^(\d+)x(AMRAP)$|^(\d+)x(\d+)s$/);
    if (!m) throw new Error(`bad spec ${spec}`);
    if (m[5]) {
      out.sets.push(...Array.from({ length: Number(m[5]) }, () => ({ ...base, reps: 1, amrap: true })));
      out.notes.push("AMRAP every set");
      continue;
    }
    if (m[7]) {
      out.sets.push(...Array.from({ length: Number(m[7]) }, () => ({ ...base, reps: 1 })));
      out.timed = `${m[8]}s`;
      continue;
    }
    const n = Number(m[1]), reps = Number(m[2]);
    const rm = intensity?.match(/^(\d+)RM$/);
    if (rm) {
      out.test = out.sets.length;
      out.sets.push({ reps: Number(rm[1]), amrap: true, rpe: 10 });
      out.notes.push(`work up to a ${rm[1]}-rep max`);
      continue;
    }
    const repsMax = m[3] ? Number(m[3]) : undefined;
    if (repsMax) out.repsMax = repsMax;
    out.sets.push(...Array.from({ length: n }, () => ({ ...base, reps, ...(repsMax ? { repsMax } : {}), ...(m[4] ? { amrap: true } : {}) })));
  }
  return out;
}

/** A table that only exists in program week `w` (planDay reads weeks[w % length]). */
const onlyWeek = (w: number, table: PercentSet[]): PercentSet[][] => Array.from({ length: w + 1 }, (_, i) => (i === w ? table : []));

function slotFrom(id: string, week: number, [lift, tm, , extra]: Row, spec: string): SlotDef {
  const p = parse(spec);
  const notes = [...p.notes, extra?.note].filter(Boolean) as string[];
  if (!tm) {
    const intensity = spec.split("|")[0].split("@")[1];
    if (intensity?.startsWith("rpe")) { const r = rpeOf(intensity.slice(3)); if (!notes.includes(r.label)) notes.unshift(r.label); }
    else if (intensity?.includes("%")) notes.unshift(`@ ${intensity}`);
    if (p.timed) notes.unshift(p.timed);
    const reps = Math.min(...p.sets.map((s) => s.reps));
    return {
      id, lift, tier: extra?.tier ?? "ACC",
      progression: { kind: "fixed", sets: p.sets.length, reps, repsMax: p.repsMax, amrapLast: p.sets.some((s) => s.amrap) || undefined, note: notes.join(" · ") || undefined },
    };
  }
  const tier: Tier = extra?.tier ?? (lift === tm && BIG3.has(lift) ? "MAIN" : "SUPP");
  const tmRule: TmRule | undefined = extra?.tmRule ?? (p.test != null ? { type: "e1rm", setIndex: p.test, pct: 1 } : undefined);
  return { id, lift, tier, progression: { kind: "percent", tmLift: tm, weeks: onlyWeek(week, p.sets), tmRule }, note: notes.join(" · ") || undefined };
}

const shortOf = (lift: string) => LIFTS[lift]?.short ?? lift.replace(/([A-Z])/g, " $1").toUpperCase();

function buildDays(prefix: string, blocks: Block[]): DayDef[] {
  const days: DayDef[] = [];
  for (const b of blocks) {
    b.weeks.forEach((w, wi) => {
      b.days.forEach((d, di) => {
        const id = `W${w + 1}D${di + 1}`;
        const slots = d.rows
          .map((row, ri) => ({ row, ri, spec: row[2][wi] }))
          .filter((x) => x.spec && x.spec !== "-")
          .map(({ row, ri, spec }) => slotFrom(`${prefix}-w${w + 1}d${di + 1}-${ri + 1}`, w, row, spec));
        if (!slots.length) return;
        const main = [...new Set(slots.filter((s) => s.tier !== "ACC").map((s) => shortOf(s.lift)))].slice(0, 3).join(" / ");
        days.push({ id, name: `W${w + 1} D${di + 1}${d.label ? ` (${d.label})` : ""} · ${main}`, weeks: [w], slots });
      });
    });
  }
  return days;
}

const toUnit = (lb: Record<string, number>, unit: Unit) =>
  Object.fromEntries(Object.entries(lb).map(([k, v]) => [k, unit === "lb" ? v : Math.round(v / 2.20462 / 2.5) * 2.5]));

/** spec per week from sets × reps and one RPE string per week ("6", "7-8", "8RM", "-"). */
const rp = (sets: number, reps: number | "AMRAP", rpes: string[]): string[] =>
  rpes.map((r) => (r === "-" ? "-" : /RM$/.test(r) ? `1x${r.replace("RM", "")}@${r}` : r === "AMRAP" || reps === "AMRAP" ? `${sets}xAMRAP${r.endsWith("%") ? `@${r}` : ""}` : `${sets}x${reps}@rpe${r}`));
const same = (n: number, spec: string) => Array.from({ length: n }, () => spec);

// ───────────────────────── Candito 6 Week ─────────────────────────
//
// Source: Dan's Drive "Candito 6 Week Program.xlsx" (computed loads for 1RMs B185/S250/D295 lb,
// percentages recovered by dividing and checking the sheet's 5-lb rounding) and "Candito 6 Week
// Strength Program.pdf". Where a load fits two percentages the 2.5%-step pattern was used:
//   W2 bench set 3 (82.5 or 85 → 82.5), W3 day 2 bench (82.5 or 85 → 85), W4 day 2 bench set 1
//   (82.5 or 85 → 85). W4 heavy deadlift triple is 270 of 295 = 91.5%; no round % reproduces it.
// Rules modelled: W2 MR10 sets (fewer than 8 / 7 reps → max −2.5%), W5 1–4 rep sets set the
// projected max (×1.03 / 1.06 / 1.09 for 2 / 3 / 4 reps), week 6 max test. Not modelled: "if you
// fail a required rep, reduce your max by 2.5%" (sheet; the PDF says 5%) — use an adjustment.

const C_ROW_W1 = "4x6-10|reps 10, 10, 8, 6 · progress gradually";
const C_PRESS_W1 = "4x8-12|reps 12, 12, 10, 8 · progress gradually";
const C_ROW_W2 = "3x8-10|reps 10, 8, 8";
const C_PRESS_W2 = "3x6-10|reps 10, 8, 6";
const C_OPT_UP = "4x8-12|optional isolation (lateral raise, fly, triceps…), light, 1–2 min rest";
const C_OPT_LO = "4x8-12|optional: hypertrophy 8–12 (leg curl, calves…) or explosive sets of 4";
const C_DLV = "deadlift variation: stiff-leg, snatch-grip, deficit or pause DL, moderate";

const upperAcc = (row: string, press: string, opt: string | null): Row[] => [
  ["cableRow", null, [row], { note: "upper back #1 (horizontal pull): machine row in Dan's sheet" }],
  ["ohp", null, [press], { note: "shoulders: military press in Dan's sheet" }],
  ["pullUp", null, [press], { note: "upper back #2 (vertical pull): weighted pull-up" }],
  ...(opt ? ([["lateralRaise", null, [opt]], ["overheadTricep", null, [opt]]] as Row[]) : []),
];
const lowerOpt = (opt = C_OPT_LO): Row[] => [["legCurl", null, [opt]], ["calfRaise", null, [opt]]];

/** W5: projected max from the 1–4 rep set. Weight is 97.5%, so new max ≈ 0.975 × (1.03, 1.06, 1.09). */
const PROJECT: TmRule = {
  type: "amrapVsTarget", setIndex: 0,
  table: [{ diff: -99, pct: -0.025 }, { diff: 1, pct: 0.00425 }, { diff: 2, pct: 0.0335 }, { diff: 3, pct: 0.06275 }],
};
/** W2 MR10: fewer reps than the set's target (8 or 7) → max −2.5%. */
const mr10 = (): TmRule => ({ type: "amrapVsTarget", setIndex: 0, table: [{ diff: -99, pct: -0.025 }, { diff: 0, pct: 0 }] });

const CW1: BlockDay[] = [
  { label: "lower", rows: [["squat", "squat", ["4x6@80%"]], ["deadlift", "deadlift", ["2x6@80%"]], ...lowerOpt()] },
  { label: "upper", rows: [["bench", "bench", ["1x10@50%;1x10@67.5%;1x8@75%;1x6@77.5%"]], ...upperAcc(C_ROW_W1, C_PRESS_W1, C_OPT_UP)] },
  { label: "upper", rows: [["bench", "bench", ["1x10@50%;1x10@67.5%;1x8@75%;1x6@77.5%"]], ...upperAcc(C_ROW_W1, C_PRESS_W1, C_OPT_UP)] },
  { label: "lower", rows: [["squat", "squat", ["4x8@70%"]], ["deadlift", "deadlift", ["2x8@70%"]], ...lowerOpt()] },
  { label: "upper", rows: [["bench", "bench", ["1x1+@80%|max reps"]], ...upperAcc(C_ROW_W1, C_PRESS_W1, C_OPT_UP)] },
];

const CANDITO: Block[] = [
  { weeks: [0], days: CW1 },
  {
    weeks: [1],
    days: [
      { label: "lower", rows: [
        ["squat", "squat", ["1x8+@80%;5x3@80%+5lb"], { note: "MR10: max reps, stop at 10; fewer than 8 → max −2.5%. Then extra volume 5×3 at MR10 weight +5 lb / 2.5 kg, 60s rest", tmRule: mr10() }],
        ["stiffLegDeadlift", null, ["3x8"], { note: C_DLV }], ...lowerOpt()] },
      { label: "upper", rows: [["bench", "bench", ["1x10@72.5%;1x8@77.5%;1x6-8@82.5%"]], ...upperAcc(C_ROW_W2, C_PRESS_W2, C_OPT_UP)] },
      { label: "lower", rows: [
        ["squat", "squat", ["1x7+@82.5%;10x3@82.5%-10lb"], { note: "MR10: max reps, stop at 10. Back-off at MR10 weight −10 lb / 5 kg: 10 reps → 10×3, 8–9 → 8×3, 7 → 5×3, under 7 → skip and max −2.5%", tmRule: mr10() }],
        ["stiffLegDeadlift", null, ["3x8"], { note: C_DLV }], ...lowerOpt()] },
      { label: "upper", rows: [["bench", "bench", ["1x10@72.5%;1x8@77.5%;1x6-8@82.5%"]], ...upperAcc(C_ROW_W2, C_PRESS_W2, C_OPT_UP)] },
      { label: "upper", rows: [["bench", "bench", ["1x1+@77.5%|max reps"]], ...upperAcc(C_ROW_W2, C_PRESS_W2, C_OPT_UP)] },
    ],
  },
  {
    weeks: [2],
    days: [
      { label: "lower", rows: [["squat", "squat", ["3x4-6@87.5%"]], ["deadlift", "deadlift", ["2x3-6@87.5%|no accessories this week"]]] },
      { label: "upper", rows: [["bench", "bench", ["3x4-6@85%"]], ...upperAcc("3x6", "3x6", null)] },
      { label: "lower", rows: [["squat", "squat", ["1x4-6@90%"]], ["stiffLegDeadlift", null, ["1x8"], { note: C_DLV }]] },
      { label: "upper", rows: [["bench", "bench", ["3x4-6@87.5%"]], ...upperAcc("3x6", "3x6", null)] },
    ],
  },
  {
    weeks: [3],
    days: [
      { label: "lower", rows: [["squat", "squat", ["1x3@87.5%;1x3@90%;1x3@92.5%"]], ["stiffLegDeadlift", null, ["2x6"], { note: C_DLV }], ...lowerOpt()] },
      { label: "upper", rows: [["bench", "bench", ["1x3@85%;1x3@87.5%;1x3@90%"]], ...upperAcc(C_ROW_W1, C_PRESS_W1, C_OPT_UP)] },
      { label: "lower", rows: [["squat", "squat", ["1x3@92.5%;1x1-2@95%"]], ["deadlift", "deadlift", ["1x3@91.5%;1x1-2@95%"]], ...lowerOpt()] },
      { label: "upper", rows: [["bench", "bench", ["1x3@87.5%;1x2-4@90%;1x1-2@95%"]], ...upperAcc(C_ROW_W1, C_PRESS_W1, C_OPT_UP)] },
    ],
  },
  {
    weeks: [4],
    days: [
      { label: "lower", rows: [
        ["squat", "squat", ["1x1-4+@97.5%|1–4 reps: sets your projected max (×1.03 / 1.06 / 1.09 for 2 / 3 / 4 reps)"], { tmRule: PROJECT }],
        ["deadlift", "deadlift", ["1x4@67.5%;1x4@70%;1x2@72.5%"]], ...lowerOpt()] },
      { label: "upper", rows: [
        ["bench", "bench", ["1x1-4+@97.5%|1–4 reps: sets your projected max (×1.03 / 1.06 / 1.09 for 2 / 3 / 4 reps)"], { tmRule: PROJECT }],
        ...upperAcc("3x6-8|reps 8, 6, 6", "3x6-8|reps 8, 6, 6", "3x8-12|optional isolation, light")] },
      { label: "lower", rows: [
        ["deadlift", "deadlift", ["1x1-4+@97.5%|1–4 reps: sets your projected max (×1.03 / 1.06 / 1.09 for 2 / 3 / 4 reps)"], { tmRule: PROJECT }], ...lowerOpt()] },
    ],
  },
];

const MAX_TEST: Block = {
  weeks: [5],
  days: [{ label: "max test", rows: (["squat", "bench", "deadlift"] as const).map((l): Row => [l, l, ["1x1@100%|attempt your projected max; the best single becomes your new 1RM"], { tmRule: { type: "e1rm", setIndex: 0, pct: 1 } }]) }],
};

export const candito6: ProgramTemplate = {
  id: "candito6",
  name: "Candito 6 Week Strength",
  author: "Jonnie Candito",
  source: "Dan's Drive: Candito 6 Week Program.xlsx + Candito 6 Week Strength Program.pdf",
  summary: "Six-week upper/lower block off your 1RMs: conditioning, hypertrophy, linear max OT, heavy acclimation, then 1–4 rep max sets and a max test. 3–5 sessions a week.",
  category: "strength",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 6,
  options: [
    { key: "week6", label: "Week 6", default: "test", choices: [
      { value: "test", label: "Max test" },
      { value: "deload", label: "Deload (week 1 minus the last upper day)" },
      { value: "skip", label: "Skip (5 weeks, use projected maxes)" },
    ] },
  ],
  build(o) {
    const opts = { week6: "test", ...o };
    const blocks = [...CANDITO];
    if (opts.week6 === "test") blocks.push(MAX_TEST);
    if (opts.week6 === "deload") blocks.push({ weeks: [5], days: CW1.slice(0, 4) });
    const weeks = opts.week6 === "skip" ? 5 : 6;
    return {
      templateId: "candito6",
      name: "Candito 6 Week",
      sessionsPerWeek: 4,
      days: buildDays("cd", blocks),
      maxLabel: "1RM",
      cycle: {
        weeks, finite: true,
        weekNames: ["Muscular conditioning", "Hypertrophy", "Linear max OT", "Heavy weight acclimation", "High intensity strength", opts.week6 === "deload" ? "Deload" : "Max test"],
      },
      notes: [
        "Percentages are of your real 1RM.",
        "Fail a required rep: drop that lift's max 2.5% (sheet; the PDF says 5%) with an adjustment, and move on.",
        "Accessories: pick a weight, stay moderate, add weight gradually over the 6 weeks. Optional exercises can be skipped.",
        "Week 5's 1–4 rep sets set your projected max; week 6 either tests it, deloads, or is skipped.",
      ],
    };
  },
  defaults(unit: Unit) {
    return { trainingMaxes: toUnit({ squat: 315, bench: 225, deadlift: 385 }, unit), startWeights: {} };
  },
};

// ───────────────────────── Clarence0 14 Week ─────────────────────────
//
// Source: Dan's Drive "Copy of 14 Week Powerlifting by Clarence0.xlsx" (all sets / reps / RPEs)
// and the guide doc "Copy of Powerlifting Program by Clarence0". RPE-based: pick a weight in the
// RPE range, add weight week to week when you can. "Go for an X rep max" sets are an AMRAP with a
// weight you think you can do X with; those and the week-14 1RMs update the lift's max here.
// Only strict press uses percentages (of your OHP max). Phases: high volume (1–6, 6 = deload),
// strength (7–11), peaking (12 deload, 13, 14 max out).

const sitNote = { note: "weighted" };
const decline = { note: "weighted decline sit-up" };
const pbMain: RowExtra = { tier: "MAIN" };

const CLARENCE: Block[] = [
  {
    weeks: [0, 1, 2],
    days: [
      { label: "Mon", rows: [
        ["squat", "squat", rp(4, 7, ["6", "7-8", "8-9"]), { note: "high bar" }],
        ["rdl", "rdl", rp(2, 8, ["6", "7-8", "7-8"])],
        ["bench", "bench", rp(4, 8, ["6", "7-8", "8-9"]), { note: "no pause" }],
        ["sitUp", null, rp(2, 12, ["8-9", "9-10", "9-10"]), sitNote]] },
      { label: "Wed", rows: [
        ["pauseSquat", "pauseSquat", rp(4, 4, ["5-6", "6", "6"]), { note: "tempo high-bar pause squat, slow eccentric and concentric" }],
        ["bulgarianSplitSquat", null, rp(2, 12, ["7", "8-9", "8-9"])],
        ["ohp", "ohp", same(3, "4xAMRAP@65%"), { note: "strict press" }],
        ["hammerCurl", null, rp(3, 10, ["8", "8-9", "8-9"])],
        ["skullcrusher", null, rp(3, 8, ["8", "8", "8"])]] },
      { label: "Thu", rows: [
        ["pauseDeadlift", "pauseDeadlift", rp(3, 7, ["5-6", "7", "8"]), { note: "2s pause at the knee" }],
        ["pendlayRow", null, rp(4, 8, ["7", "8-9", "8-9"])],
        ["sitUp", null, rp(3, 12, ["8-9", "8-9", "8-9"]), sitNote],
        ["pullUp", null, same(3, "3xAMRAP"), { note: "weighted or bodyweight" }],
        ["rearDeltFly", null, rp(3, 12, ["8", "8-9", "8-9"])]] },
      { label: "Sat", rows: [
        ["squat", "squat", rp(4, 8, ["6", "7-8", "8-9"]), { note: "high bar" }],
        ["ohp", "ohp", same(3, "3xAMRAP@70%"), { note: "strict press" }],
        ["spotoPress", "spotoPress", rp(3, 6, ["6", "7-8", "7-8"])],
        ["backExtension", null, rp(3, 10, ["6", "7", "7"]), { note: "weighted or bodyweight" }]] },
    ],
  },
  {
    weeks: [3, 4, 5],
    days: [
      { label: "Mon", rows: [
        ["squat", "squat", [...rp(4, 6, ["7-8"]), "1x8@8RM", ...rp(4, 6, ["5"])], { note: "high bar" }],
        ["stiffLegDeadlift", "stiffLegDeadlift", rp(2, 8, ["7", "7", "5"])],
        ["bench", "bench", rp(4, 7, ["8-9", "8-9", "5"]), { note: "no pause" }],
        ["sitUp", null, rp(2, 12, ["9-10", "9-10", "7"]), decline]] },
      { label: "Wed", rows: [
        ["frontSquat", "frontSquat", rp(4, 4, ["7", "7", "5"]), { note: "paused" }],
        ["bulgarianSplitSquat", null, rp(2, 10, ["8-9", "8-9", "-"])],
        ["ohp", "ohp", same(3, "4xAMRAP@60%"), { note: "strict press" }],
        ["barbellCurl", null, rp(3, 10, ["8-9", "8-9", "7"])],
        ["overheadTricep", null, rp(3, 8, ["8-9", "8", "-"])]] },
      { label: "Thu", rows: [
        ["deadlift", "deadlift", rp(3, 7, ["7", "8-9", "-"])],
        ["pendlayRow", null, rp(4, 8, ["8-9", "8-9", "-"])],
        ["sitUp", null, rp(3, 12, ["8-9", "8-9", "-"]), decline],
        ["pullUp", null, ["3xAMRAP", "3xAMRAP", "-"], { note: "weighted or bodyweight" }],
        ["rearDeltFly", null, rp(3, 12, ["8-9", "8-9", "-"])]] },
      { label: "Sat", rows: [
        ["squat", "squat", rp(4, 7, ["7-8", "8-9", "5"]), { note: "high bar" }],
        ["pauseBench", "bench", ["2x6@rpe8", "1x8@8RM", "-"], pbMain],
        ["spotoPress", "spotoPress", rp(4, 6, ["8-9", "8-9", "5"])],
        ["backExtension", null, rp(3, 10, ["8", "8", "6"])]] },
    ],
  },
  {
    weeks: [6, 7, 8],
    days: [
      { label: "Mon", rows: [
        ["squat", "squat", rp(4, 5, ["7-8", "8-9", "8-9"]), { note: "high or low bar" }],
        ["snatchGripDeadlift", "snatchGripDeadlift", rp(3, 6, ["7", "8", "8"])],
        ["pauseBench", "bench", rp(5, 5, ["7-8", "8-9", "8-9"]), pbMain],
        ["backExtension", null, rp(4, 5, ["8", "8", "8"]), { note: "5s pause at the top" }]] },
      { label: "Wed", rows: [
        ["frontSquat", "frontSquat", rp(5, 3, ["7", "8", "8-9"])],
        ["bulgarianSplitSquat", null, rp(2, 10, ["8-9", "8-9", "8-9"])],
        ["pauseBench", "bench", rp(5, 5, ["7-8", "8-9", "8-9"]), pbMain],
        ["overheadTricep", null, rp(3, 8, ["8-9", "8-9", "8-9"])],
        ["rearDeltFly", null, rp(3, 10, ["8", "9", "9"])]] },
      { label: "Fri", rows: [
        ["deadlift", "deadlift", [...rp(4, 5, ["6-7", "7-8"]), "1x5@5RM"]],
        ["row", null, rp(3, 6, ["8", "8", "8"])],
        ["sitUp", null, rp(3, 10, ["8-9", "8-9", "8-9"]), sitNote],
        ["barbellCurl", null, [...rp(3, 8, ["8-9"]), "3xAMRAP", "3xAMRAP"]],
        ["lateralRaise", null, rp(3, 10, ["8-9", "8-9", "8-9"])]] },
      { label: "Sat", rows: [
        ["squat", "squat", rp(6, 4, ["7-8", "8-9", "8-9"]), { note: "high or low bar" }],
        ["pauseBench", "bench", rp(4, 4, ["7-8", "7-8", "8"]), pbMain],
        ["cgBench", "cgBench", rp(2, 5, ["8-9", "8-9", "8-9"]), { note: "paused" }],
        ["backExtension", null, rp(4, 5, ["8", "8-9", "8-9"]), { note: "5s pause at the top" }]] },
    ],
  },
  {
    weeks: [9, 10],
    days: [
      { label: "Mon", rows: [
        ["squat", "squat", rp(6, 3, ["8-9", "8-9"])],
        ["snatchGripDeadlift", "snatchGripDeadlift", rp(4, 4, ["7-8", "8-9"])],
        ["pauseBench", "bench", rp(7, 3, ["8-9", "8-9"]), pbMain],
        ["backExtension", null, rp(4, 5, ["8-9", "8-9"]), { note: "5s pause at the top" }]] },
      { label: "Wed", rows: [
        ["frontSquat", "frontSquat", rp(5, 3, ["7-8", "7-8"])],
        ["bulgarianSplitSquat", null, rp(2, 8, ["8-9", "8-9"])],
        ["pauseBench", "bench", rp(7, 3, ["8-9", "8-9"]), pbMain],
        ["overheadTricep", null, rp(3, 8, ["8-9", "8-9"])],
        ["rearDeltFly", null, rp(3, 10, ["8", "8"])]] },
      { label: "Fri", rows: [
        ["deadlift", "deadlift", rp(4, 3, ["6-7", "8-9"])],
        ["row", null, rp(3, 6, ["8-9", "8-9"])],
        ["sitUp", null, rp(3, 8, ["8-9", "8-9"]), sitNote],
        ["barbellCurl", null, rp(3, 8, ["8-9", "8-9"])],
        ["lateralRaise", null, rp(3, 8, ["8-9", "8-9"])]] },
      { label: "Sat", rows: [
        ["squat", "squat", rp(6, 3, ["8-9", "8-9"])],
        ["pauseBench", "bench", rp(4, 3, ["7-8", "7-8"]), pbMain],
        ["cgBench", "cgBench", rp(4, 4, ["8-9", "8-9"]), { note: "paused" }],
        ["backExtension", null, rp(4, 5, ["8", "8"]), { note: "5s pause at the top" }]] },
    ],
  },
  {
    weeks: [11, 12],
    days: [
      { label: "Mon", rows: [
        ["squat", "squat", ["4x3@rpe5", "7x2@rpe8-9"]],
        ["pendlayRow", null, ["3x5@rpe7", "4x4@rpe8-9"]],
        ["pauseBench", "bench", ["4x3@rpe5-6", "8x2@rpe8-9"], pbMain],
        ["sitUp", null, ["3x8@rpe7", "3x8@rpe9-10"], decline]] },
      { label: "Wed", rows: [
        ["squat", "squat", ["4x3@rpe5", "7x2@rpe8-9"]],
        ["pauseBench", "bench", ["4x3@rpe5-6", "8x2@rpe8-9"], pbMain],
        ["rearDeltFly", null, ["2x10@rpe7", "3x10@rpe8"]]] },
      { label: "Thu", rows: [
        ["deadlift", "deadlift", ["-", "5x2@rpe7"]],
        ["backExtension", null, ["-", "4x5@rpe8-9"], { note: "5s pause at the top" }],
        ["barbellCurl", null, ["-", "3x8@rpe8"]],
        ["lateralRaise", null, ["-", "3x10@rpe8"]]] },
      { label: "Sat", rows: [
        ["squat", "squat", ["5x3@rpe6", "6x2@rpe6-7"]],
        ["pauseBench", "bench", ["5x3@rpe6", "7x2@rpe6-7"], pbMain],
        ["sitUp", null, ["3x8@rpe8", "3x8@rpe9-10"], decline]] },
    ],
  },
  {
    weeks: [13],
    days: [
      { label: "Mon", rows: [["squat", "squat", ["5x2@rpe6"]], ["deadlift", "deadlift", ["4x3@rpe5"]], ["pauseBench", "bench", ["6x2@rpe6"], pbMain], ["sitUp", null, ["3x8@rpe8"], decline]] },
      { label: "Wed", rows: [["squat", "squat", ["4x2@rpe6"]], ["pauseBench", "bench", ["5x2@rpe6"], pbMain], ["rearDeltFly", null, ["3x10@rpe8"]]] },
      { label: "Sat", rows: [["squat", "squat", ["1x1@1RM"]], ["pauseBench", "bench", ["1x1@1RM"], pbMain], ["deadlift", "deadlift", ["1x1@1RM"]]] },
    ],
  },
];

export const clarence14: ProgramTemplate = {
  id: "clarence14",
  name: "Clarence0 14 Week Powerlifting",
  author: "Clarence0",
  source: "Dan's Drive: Copy of 14 Week Powerlifting by Clarence0.xlsx + program guide doc",
  summary: "RPE-based 4-day powerlifting block: high volume (weeks 1–6), strength (7–11), peaking with a 1RM test in week 14.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 14,
  options: [],
  build() {
    return {
      templateId: "clarence14",
      name: "Clarence0 14 Week",
      sessionsPerWeek: 4,
      days: buildDays("cl", CLARENCE),
      maxLabel: "1RM",
      cycle: {
        weeks: 14, finite: true,
        weekNames: ["High volume 1", "High volume 2", "High volume 3", "High volume 4", "High volume 5 (8RM)", "Deload", "Strength 1", "Strength 2", "Strength 3 (5RM)", "Strength 4", "Strength 5", "Peaking deload", "Peaking", "Max out"],
      },
      notes: [
        "Pick weights by RPE. Add weight week to week if you can stay in the range; otherwise repeat last week's weight.",
        "Strict press is a % of your OHP max, every set AMRAP.",
        "\"Go for an X rep max\": one AMRAP set with a weight you think you can do X with. Those and the week-14 1RMs re-estimate your max here.",
        "After finishing: deload a week like week 6, then 6–8 weeks of easier training before running it again.",
      ],
    };
  },
  defaults(unit: Unit) {
    return { trainingMaxes: toUnit({ squat: 315, bench: 225, deadlift: 385, ohp: 145 }, unit), startWeights: {} };
  },
};

// ───────────────────────── Complete 16 Week (Calgary Barbell) ─────────────────────────
//
// Source: Dan's Drive "Complete+16-week+Program.xlsx" — the Calgary Barbell 16-week program (Bryce
// Krawczyk; identified from the title, layout and LiftVault's description, the sheet has no byline).
// Blocks: weeks 1–4, 5–8, 9–11, 12–15, then a taper week of four sessions (5/4/3/2 days out).
// % are of the sheet's maxes (it calls them training maxes; loads like 67% × 255 = 170 match).
// Not in the sheet, so only described in notes: what F / R back-off sets weigh, and weeks 12–15
// back-offs are "% of E1RM" (that day's estimate from the top set) — shown here as % of your max.
// Week 1 day 1 OHP says "80%" with no base; it's a fixed accessory here.

const CG: Block[] = [
  {
    weeks: [0, 1, 2, 3],
    days: [
      { rows: [
        ["squat", "squat", ["4x7@67%", "4x6@70%", "4x6@73%", "5x5@75%"]],
        ["bench", "bench", ["4x7@67%", "4x6@70%", "4x6@73%", "5x5@75%"], { note: "paused (competition) bench" }],
        ["ohp", null, ["3x8", "3x8", "3x7", "3x7"]],
        ["row", null, ["3x12", "3x12", "3x8", "3x8"], { note: "bent over row" }],
        ["backExtension", null, ["4x12", "4x12", "5x10", "5x10"], { note: "GHR back extension" }]] },
      { rows: [
        ["deadlift", "deadlift", ["4x7@67%", "4x6@70%", "4x6@73%", "5x5@75%"]],
        ["pauseBench", "bench", ["3x5@60%", "3x6@60%", "3x4@65%", "3x3@70%"], { note: "3-count pause" }],
        ["pauseSquat", "pauseSquat", ["3x5@rpe8", "3x6@rpe8", "3x4@rpe8", "3x5@rpe8"], { note: "SSB, front or high-bar pause squat" }],
        ["cableRow", null, ["5x8", "5x8", "5x8", "4x8"], { note: "wide grip seated row, mimic bench grip" }]] },
      { rows: [
        ["pinSquat", "squat", ["3x6@65%", "3x5@70%", "3x6@68%", "3x5@73%"], { note: "pins at full depth" }],
        ["boardPress", "boardPress", ["3x6@rpe8", "3x5@rpe8", "3x4@rpe8", "3x6@rpe8"], { note: "2-board press" }],
        ["dbRow", null, ["5x10", "5x10", "5x8", "5x8"]],
        ["birdDog", null, ["3x6", "3x6", "3x8", "4x8"], { note: "reps per side" }]] },
      { rows: [
        ["pauseDeadlift", "deadlift", ["3x6@63%", "3x5@65%", "3x6@68%", "3x5@73%"], { note: "2-count pause just off the floor" }],
        ["bench", "bench", ["4x10@63%", "4x10@65%", "4x10@68%", "4x8@70%"], { note: "touch and go" }],
        ["stiffLegDeadlift", "deadlift", ["3x8@40%", "3x8@43%", "3x6@45%", "3x6@48%"]],
        ["latPulldown", null, ["4x10", "4x10", "4x8", "4x8"], { note: "vertical pull of choice" }],
        ["tricepPushdown", null, ["4x10", "4x10", "4x8", "4x8"], { note: "triceps movement of choice" }]] },
    ],
  },
  {
    weeks: [4, 5, 6, 7],
    days: [
      { rows: [
        ["squat", "squat", ["3x3@80%;2x5@68%", "4x3@82%;2x5@70%", "5x2@86%;2x4@72%", "4x3@85%;3x4@75%"]],
        ["bench", "bench", ["4x3@80%;2x5@68%", "5x3@82%;3x5@70%", "5x2@86%;2x4@72%", "5x3@85%;3x4@75%"], { note: "paused (competition) bench" }],
        ["stiffLegDeadlift", "stiffLegDeadlift", ["4x9@rpe8", "4x8@rpe8", "4x8@rpe8", "4x7@rpe8"]],
        ["plank", null, ["3x30s", "4x30s", "4x45s", "4x45s"], { note: "side plank, per side" }]] },
      { rows: [
        ["deadlift", "deadlift", ["3x3@80%;2x5@68%", "4x3@82%;2x5@70%", "5x2@86%;2x4@72%", "4x3@85%;3x4@75%"]],
        ["pauseBench", "bench", ["3x4@rpe8", "4x3@rpe8", "3x3@rpe8", "4x4@rpe8"], { note: "2-count pause" }],
        ["squat", "squat", ["2x5@65%", "3x5@68%", "2x5@71%", "2x4@74%"]],
        ["cableRow", null, ["4x10", "4x10", "4x8", "4x8"], { note: "wide grip seated row" }]] },
      { rows: [
        ["pauseSquat", "pauseSquat", ["4x4@rpe8", "5x3@rpe8", "4x5@rpe9", "4x2@rpe9"], { note: "2-count pause" }],
        ["bench", "bench", ["6x5@70%", "6x4@73%", "6x3@75%", "6x5@68%"], { note: "paused (competition) bench" }],
        ["feetUpBench", "feetUpBench", ["4x5@rpe8", "3x4@rpe8", "4x3@rpe8", "4x4@rpe8"]],
        ["deadlift", "deadlift", ["2x5@65%", "3x5@68%", "2x5@71%", "2x4@74%"]],
        ["latPulldown", null, ["4x10", "4x10", "4x8", "4x8"], { note: "vertical pull of choice" }]] },
      { rows: [
        ["pauseDeadlift", "pauseDeadlift", ["4x4@rpe8", "5x3@rpe8", "4x5@rpe8", "4x2@rpe9"], { note: "2-count pause just off the floor" }],
        ["bench", "bench", ["3x6@rpe9", "3x12@rpe10", "4x7@rpe8", "4x5@rpe8"], { note: "touch and go" }],
        ["inclineBench", null, ["4x8", "4x7", "5x6", "4x10"], { note: "close-grip incline press" }],
        ["dbRow", null, ["6x10", "6x10", "6x8", "6x8"]]] },
    ],
  },
  {
    weeks: [8, 9, 10],
    days: [
      { rows: [
        ["squat", "squat", ["5x4@82%;2x4@71%", "6x3@85%;2x4@74%", "3x3@83%;2x4@76%"]],
        ["bench", "bench", ["6x4@82%;2x4@71%", "7x4@85%;2x4@74%", "3x3@83%;2x4@76%"], { note: "paused (competition) bench" }],
        ["row", null, ["4x8@rpe8", "4x6@rpe8", "4x5@rpe8"], { note: "bent over row" }],
        ["plank", null, ["3x20", "4x20", "4x24"], { note: "rolling planks, total reps" }]] },
      { rows: [
        ["deadlift", "deadlift", ["4x4@82%;2x4@71%", "5x3@85%;2x4@74%", "3x3@83%;2x4@76%"]],
        ["pinPress", "pinPress", ["4x4@rpe8", "4x5@rpe8", "4x3@rpe8"], { note: "pins at chest level" }],
        ["squat", "squat", ["3x5@68%", "3x5@71%", "3x4@74%"]],
        ["cableRow", null, ["4x8", "4x8", "4x8"], { note: "wide grip seated row" }]] },
      { rows: [
        ["pauseSquat", "pauseSquat", ["1+2Fx4@rpe9", "1+3Fx2@rpe9", "1+1Rx3@rpe8"], { note: "2-count pause" }],
        ["bench", "bench", ["6x5@72%", "6x4@75%", "5x3@78%"], { note: "paused (competition) bench" }],
        ["cgBench", "cgBench", ["1+2Rx4@rpe8", "1+1Fx3@rpe9", "1+1Rx2@rpe8"]],
        ["deadlift", "deadlift", ["2x5@68%", "3x5@71%", "3x4@74%"]],
        ["latPulldown", null, ["4x8", "4x8", "4x8"], { note: "vertical pull of choice" }]] },
      { rows: [
        ["pauseDeadlift", "pauseDeadlift", ["1+2Fx4@rpe9", "1+3Fx2@rpe9", "1+1Rx3@rpe8"], { note: "2-count pause just off the floor" }],
        ["bench", "bench", ["1+1Fx8@rpe9", "1+1Fx7@rpe9", "1+1Fx6@rpe9"], { note: "with mini bands" }],
        ["ohp", "ohp", ["1+3Rx7@rpe8", "1+2Rx8@rpe8", "1+1Rx5@rpe8"]],
        ["dbRow", null, ["5x8", "5x8", "5x8"]]] },
    ],
  },
  {
    weeks: [11, 12, 13, 14],
    days: [
      { rows: [
        ["squat", "squat", ["1x3@rpe8;6x5@65%", "1x2@rpe8;6x5@68%", "1x1@rpe8;4x4@72%", "1x1@rpe8;3x3@76%"], { note: "back-offs are % of today's e1RM from the top set (shown as % of your max)" }],
        ["bench", "bench", ["1x3@rpe8;7x5@65%", "1x2@rpe8;7x5@68%", "1x1@rpe9;5x4@72%", "1x1@rpe9;4x3@76%"], { note: "paused (competition) bench · back-offs are % of today's e1RM from the top set (shown as % of your max)" }],
        ["ohp", "ohp", ["1+2Fx6@rpe9", "1+1Fx7@rpe9", "1+2Rx6@rpe8", "1+1Fx5@rpe9"]]] },
      { rows: [
        ["deadlift", "deadlift", ["1x3@rpe8;6x5@65%", "1x2@rpe8;6x5@68%", "1x1@rpe8;4x4@72%", "1x1@rpe8;3x3@76%"], { note: "back-offs are % of today's e1RM from the top set (shown as % of your max)" }],
        ["pauseBench", "pauseBench", ["1+2Fx4@rpe9", "1+2Rx5@rpe8", "1+2Fx2@rpe9", "1+2Rx4@rpe8"], { note: "2-count pause" }],
        ["squat", "squat", ["1+2Rx4@rpe8", "1+1Fx3@rpe9", "1+2Fx4@rpe9", "1+1Rx2@rpe8"], { note: "high bar" }]] },
      { rows: [
        ["pinSquat", "pinSquat", ["1x3@rpe8;1+1Fx4@rpe9", "1x2@rpe8;1+1Fx5@rpe9", "1x1@rpe8;1+1Fx2@rpe9", "1x1@rpe8;1+2Fx4@rpe8"]],
        ["cgBench", "cgBench", ["1+2Fx3@rpe9", "1+1Fx2@rpe9", "1+2Rx3@rpe8", "1+1Fx4@rpe9"]],
        ["feetUpBench", "feetUpBench", ["1+1Fx5@rpe9", "1+1Fx6@rpe9", "1+1Fx3@rpe9", "1+1Fx4@rpe9"]]] },
      { rows: [
        ["pauseDeadlift", "pauseDeadlift", ["1x3@rpe8;1+2Fx5@rpe9", "1x2@rpe8;1+2Rx4@rpe8", "1x1@rpe8;1+2Fx2@rpe9", "1x1@rpe8;1+2Fx4@rpe9"], { note: "2-count pause" }],
        ["bench", "bench", ["1+3Rx5@rpe8", "1+3Rx4@rpe8", "1+1Fx3@rpe9", "1+2Fx3@rpe9"], { note: "touch and go" }]] },
    ],
  },
  {
    weeks: [15],
    days: [
      { label: "5 days out", rows: [["squat", "squat", ["1x1@opener;3x2@82%"]], ["bench", "bench", ["1x1@opener;3x2@84%"]]] },
      { label: "4 days out", rows: [["deadlift", "deadlift", ["1x1@opener;2x2@82%"]], ["bench", "bench", ["4x1@85%"]]] },
      { label: "3 days out", rows: [["squat", "squat", ["1x1@85%;2x2@78%"]], ["bench", "bench", ["1x1@85%;3x2@78%"]], ["deadlift", "deadlift", ["1x1@82%;2x2@75%"]]] },
      { label: "2 days out", rows: [["squat", "squat", ["2x3@75%"]], ["bench", "bench", ["3x3@78%"]], ["deadlift", "deadlift", ["1x3@75%"]]] },
    ],
  },
];

export const complete16: ProgramTemplate = {
  id: "complete16",
  name: "Calgary Barbell 16 Week",
  author: "Bryce Krawczyk (Calgary Barbell)",
  source: "Dan's Drive: Complete+16-week+Program.xlsx",
  summary: "16-week, 4-day powerlifting peak: % of max plus RPE work with lots of paused variations, finishing with a meet taper.",
  category: "powerlifting",
  level: "intermediate",
  daysPerWeek: [4],
  weeks: 16,
  options: [],
  build() {
    return {
      templateId: "complete16",
      name: "Calgary Barbell 16 Week",
      sessionsPerWeek: 4,
      days: buildDays("cg", CG),
      maxLabel: "Training max",
      cycle: {
        weeks: 16, finite: true,
        weekNames: [...Array.from({ length: 15 }, (_, i) => `Block ${i < 4 ? 1 : i < 8 ? 2 : i < 11 ? 3 : 4} · week ${i + 1}`), "Taper"],
      },
      notes: [
        "Percentages are of the maxes you enter; RPE sets are picked on the day.",
        "Tempo in the sheet is down.pause.up seconds; competition bench is paused.",
        "1+2F / 1+2R: one top set at the RPE, then back-off sets (F = fatigue drop, R = repeat). The sheet doesn't give the drop.",
        "Weeks 12–15 back-offs are % of that day's e1RM from the top set.",
      ],
    };
  },
  defaults(unit: Unit) {
    return { trainingMaxes: toUnit({ squat: 285, bench: 205, deadlift: 345, ohp: 130 }, unit), startWeights: {} };
  },
};
