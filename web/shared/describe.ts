// Plain-language rules for a program, generated from the same ProgramDef the engine runs, so the
// RULES tab can never drift from what the replay actually does.
//
//   overview  sessions per week, rotation shape, cycle / block length, TM increases, what % are of
//   rotation  day → "T1 SQUAT", "T2 BENCH"…
//   tiers     one entry per distinct rule; identical rules on different lifts are grouped and
//             per-lift amounts are listed only when they differ.
//
// Weights are written in `unit` when given; without one both are shown ("5 lb / 2.5 kg").

import { LIFTS } from "./lifts";
import { allSlots, isScheduled, schemeLabel, type PercentSet, type ProgramDef, type Progression, type SlotDef, type Tier, type TmRule, type Weights } from "./program";
import { fmt, type Unit } from "./units";

export interface ProgramRules {
  overview: string[];
  rotation: { day: string; lifts: string[] }[];
  tiers: { title: string; lifts: string[]; text: string }[];
}

export interface DescribeOptions {
  unit?: Unit;
  /** per-slot increment overrides in `unit` (ProgramConfig.increments) */
  increments?: Record<string, number>;
}

type Stages = Extract<Progression, { kind: "stages" }>;
type Percent = Extract<Progression, { kind: "percent" }>;

const name = (k: string) => LIFTS[k]?.name ?? k;
const short = (k: string) => LIFTS[k]?.short ?? k.toUpperCase();
const pct = (p: number) => `${fmt(p * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => WORDS[n] ?? String(n);

/** "A, B and C" */
export function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "weeks 1, 2 and 5" / "weeks 1–4" */
function weekList(ws: number[]): string {
  const runs: string[] = [];
  let i = 0;
  while (i < ws.length) {
    let j = i;
    while (j + 1 < ws.length && ws[j + 1] === ws[j] + 1) j++;
    runs.push(j - i >= 2 ? `${ws[i] + 1}–${ws[j] + 1}` : j > i ? `${ws[i] + 1}, ${ws[j] + 1}` : `${ws[i] + 1}`);
    i = j + 1;
  }
  return `${ws.length === 1 ? "week" : "weeks"} ${list(runs.join(", ").split(", "))}`;
}

const TIER_NAME: Record<Tier, string> = { T1: "T1", T2: "T2", T3: "T3", MAIN: "Main", SUPP: "Supplemental", ACC: "Accessory" };

/** "Training max (90% of 1RM)" → "training max"; "1RM" stays. */
const lower = (l: string) => (/^[A-Z][a-z]/.test(l) && !/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day\b/.test(l) ? l.charAt(0).toLowerCase() + l.slice(1) : l);
function maxShort(label: string | undefined): string {
  return lower((label ?? "training max").replace(/\s*\([^)]*\)/g, "").trim());
}
function maxFull(label: string | undefined): string {
  return lower(label ?? "training max");
}

class Writer {
  constructor(readonly def: ProgramDef, readonly o: DescribeOptions) {}

  w(x: Weights): string {
    return this.o.unit ? `${fmt(x[this.o.unit])} ${this.o.unit}` : `${fmt(x.lb)} lb / ${fmt(x.kg)} kg`;
  }
  /** amount × n, signed */
  signed(x: Weights, n = 1): string {
    const neg = (x.lb || x.kg) * n < 0;
    return (neg ? "−" : "+") + this.w({ lb: Math.abs(x.lb * n), kg: Math.abs(x.kg * n) });
  }
  slotInc(s: SlotDef): Weights | null {
    const p = s.progression;
    const o = this.o.increments?.[s.id];
    if (o != null && this.o.unit) return this.o.unit === "lb" ? { lb: o, kg: o / 2 } : { kg: o, lb: o * 2 };
    return p.kind === "stages" || p.kind === "double" ? p.increment : null;
  }
  tmInc(lift: string): Weights {
    return this.def.tmIncrement?.[lift] ?? { lb: 5, kg: 2.5 };
  }

  /**
   * One amount per lift, or grouped when they differ: "10 lb" · "10 lb on Squat and Deadlift, 5 lb on Bench and OHP".
   */
  perLift(items: { lift: string; v: Weights }[], n = 1): { uniform: boolean; text: string } {
    const by = new Map<string, string[]>();
    for (const x of items) {
      const k = this.w({ lb: x.v.lb * n, kg: x.v.kg * n });
      const ls = by.get(k) ?? [];
      if (!ls.includes(name(x.lift))) ls.push(name(x.lift));
      by.set(k, ls);
    }
    if (by.size <= 1) return { uniform: true, text: [...by.keys()][0] ?? "" };
    const ranked = [...by.entries()].sort((a, b) => b[1].length - a[1].length);
    const total = ranked.reduce((a, [, ls]) => a + ls.length, 0);
    // "5 lb (10 lb on Leg Press)" when one amount covers most lifts
    if (ranked[0][1].length * 2 > total) return { uniform: false, text: `${ranked[0][0]} (${list(ranked.slice(1).map(([k, ls]) => `${k} on ${list(ls)}`))})` };
    return { uniform: false, text: list(ranked.map(([k, ls]) => `${k} on ${list(ls)}`)) };
  }
}


// ───────────────────────── percent tables ─────────────────────────

function setText(s: PercentSet, wr: Writer, withAdd = true): string {
  const reps = `${s.reps}${s.repsMax ? "–" + s.repsMax : ""}${s.amrap ? "+" : ""}`;
  const load = s.pct != null
    ? `@ ${pct(s.pct)}${s.ofTop ? " of today's top-set e1RM" : ""}${withAdd && s.add ? ` ${wr.signed(s.add)}` : ""}${s.rpe ? ` (RPE ${fmt(s.rpe)})` : ""}`
    : s.rpe ? `@ RPE ${fmt(s.rpe)}` : "";
  return `${reps}${load ? " " + load : ""}${s.amrap && s.target ? ` (aim for ${s.target})` : ""}`;
}

/** "5 @ 65%, 5 @ 75%, 5+ @ 85%" · "5×10 @ 50%" */
function tableText(sets: PercentSet[], wr: Writer, withAdd = true): string {
  const out: string[] = [];
  let i = 0;
  while (i < sets.length) {
    const one = setText(sets[i], wr, withAdd);
    let j = i;
    while (j + 1 < sets.length && setText(sets[j + 1], wr, withAdd) === one) j++;
    out.push(j > i ? `${j - i + 1}×${one}` : one);
    i = j + 1;
  }
  return out.join(", ");
}

const dayOf = (def: ProgramDef, s: SlotDef) => def.days.find((d) => d.slots.some((x) => x.id === s.id))?.name ?? "";

/** program weeks (0-based) a slot is trained in */
function slotWeeks(def: ProgramDef, s: SlotDef): number[] {
  const n = def.cycle?.weeks ?? 1;
  const days = def.days.filter((d) => d.slots.some((x) => x.id === s.id));
  return Array.from({ length: n }, (_, w) => w).filter((w) => days.some((d) => isScheduled(d, w)));
}

const isDeload = (def: ProgramDef, w: number) => /deload|taper|rest/i.test(def.cycle?.weekNames?.[w] ?? "");

function weekLabel(def: ProgramDef, w: number): string {
  const n = def.cycle?.weekNames?.[w];
  // names that only add a load note ("Week 2 (+10 lb / +5 kg)") read better as plain week numbers
  return n && !/^week\s*\d+\b/i.test(n) ? n : `Week ${w + 1}`;
}

function rangeText(tables: PercentSet[][]): string {
  const sets = tables.flat();
  const pcts = sets.filter((s) => s.pct != null && !s.ofTop).map((s) => s.pct!);
  const reps = sets.flatMap((s) => [s.reps, s.repsMax ?? s.reps]);
  const rpes = sets.filter((s) => s.rpe != null && s.pct == null).map((s) => s.rpe!);
  const r = (xs: number[], f: (x: number) => string) => {
    const lo = Math.min(...xs), hi = Math.max(...xs);
    return lo === hi ? f(lo) : `${f(lo)}–${f(hi)}`;
  };
  const repText = r(reps, String);
  const extras: string[] = [];
  let main = `sets of ${repText} ${repText === "1" ? "rep" : "reps"}`;
  if (pcts.length) main += ` at ${r(pcts, (x) => fmt(x * 100))}%`;
  if (rpes.length) {
    if (pcts.length) extras.push(`sets by feel at RPE ${r(rpes, fmt)}`);
    else main += ` by feel at RPE ${r(rpes, fmt)}`;
  }
  if (sets.some((s) => s.ofTop)) extras.push("back-off sets off the day's top set");
  if (sets.some((s) => s.add)) extras.push("extra weight added in later weeks");
  if (sets.some((s) => s.amrap)) extras.push("AMRAP sets");
  return extras.length ? `${main}, with ${list(extras)}` : main;
}

/** What the sets are, week by week, for a percent group. `of` = how the tables relate to the max (already in the title). */
function percentWeeks(def: ProgramDef, slots: SlotDef[], wr: Writer): string {
  const s0 = slots[0];
  const p = s0.progression as Percent;
  const weeks = slotWeeks(def, s0);
  const at = (w: number) => p.weeks[w % p.weeks.length] ?? [];
  const cycled = !!def.cycle && def.cycle.weeks > 1;
  if (!cycled || p.weeks.length === 1) {
    const t = tableText(at(weeks[0] ?? 0), wr);
    const all = def.cycle ? def.cycle.weeks : 1;
    const onDays = def.days.filter((d) => d.slots.some((x) => slots.some((y) => y.id === x.id)));
    const when = weeks.length === all || !cycled
      ? (onDays.length < def.days.length && onDays.length <= 2 && !def.days.some((d) => d.weeks) ? `On ${list(onDays.map((d) => d.name))}` : "Every session")
      : cap(weekList(weeks));
    return `${when}: ${t}.`;
  }
  const rows = weeks.map((w) => ({ w, sets: at(w), text: tableText(at(w), wr) }));
  const filled = rows.filter((r) => r.text);
  const empty = rows.filter((r) => !r.text);
  const skipped = empty.length
    ? empty.every((r) => isDeload(def, r.w)) ? " Skipped on deload weeks." : ` Skipped in ${weekList(empty.map((r) => r.w))}.`
    : "";
  const distinct = [...new Set(filled.map((r) => r.text))];
  if (distinct.length <= 1) {
    const every = weeks.length === def.cycle!.weeks ? "Every week" : cap(weekList(filled.map((r) => r.w)));
    return `${every}: ${distinct[0] ?? ""}.${skipped}`;
  }
  // same sets, more weight each week (Smolov Jr): name the base once and the additions
  const bare = [...new Set(filled.map((r) => tableText(r.sets, wr, false)))];
  if (bare.length === 1) {
    const adds = filled.map((r) => ({ w: r.w, add: r.sets.find((x) => x.add)?.add }));
    const first = adds.find((a) => !a.add);
    const later = adds.filter((a) => a.add);
    if (first && later.length && later.every((a) => uniformAdd(filled.find((x) => x.w === a.w)!.sets))) {
      return `${cap(weekList([first.w]))}: ${bare[0]}. Then every set gets heavier: ${list(later.map((a) => `${wr.signed(a.add!)} in week ${a.w + 1}`))}.${skipped}`;
    }
  }
  const runs = filled.filter((r, k) => k === 0 || r.text !== filled[k - 1].text).length;
  if (distinct.length <= 4 || (distinct.length <= 6 && runs <= 6)) {
    // one sentence per distinct table, in order of first appearance
    return distinct.map((text) => {
      const ws = filled.filter((r) => r.text === text).map((r) => r.w);
      const contiguous = ws.every((w, k) => k === 0 || w === ws[k - 1] + 1);
      const tails = new Set(ws.map((w) => def.cycle?.weekNames?.[w]?.split(" · ").slice(1).join(" · ") || ""));
      const tail = tails.size === 1 ? [...tails][0] : "";
      const label = ws.length === 1 ? weekLabel(def, ws[0]) : !contiguous && tail ? `${tail} (${weekList(ws)})` : cap(weekList(ws));
      return `${label}: ${text}.`;
    }).join(" ") + skipped;
  }
  return `Changes every week over ${plural(def.cycle!.weeks, "week")}: ${rangeText(filled.map((r) => r.sets))}. The WORKOUTS tab lists each week.${skipped}`;
}
/** every set carries the same added load */
function uniformAdd(sets: PercentSet[]): boolean {
  const a = sets[0]?.add;
  return !!a && sets.every((x) => x.add && x.add.lb === a.lb && x.add.kg === a.kg);
}

// ───────────────────────── TM rules ─────────────────────────

function whichSet(p: Percent, setIndex: number | undefined, def: ProgramDef, weeks: number[]): string {
  if (setIndex == null) return "the top set";
  const tables = (weeks.length ? weeks : [0]).map((w) => p.weeks[w % p.weeks.length] ?? []).filter((t) => t.length);
  const lastEverywhere = tables.every((t) => t.length - 1 === setIndex);
  const amrap = tables.every((t) => t[setIndex]?.amrap);
  const someAmrap = (weeks.length ? weeks : [0]).filter((w) => p.weeks[w % p.weeks.length]?.[setIndex]?.amrap);
  if (!amrap && someAmrap.length) return `the ${p.weeks[someAmrap[0] % p.weeks.length][setIndex].reps}+ set in ${weekList(someAmrap)}`;
  if (lastEverywhere) return amrap ? "the last (AMRAP) set" : "the last set";
  if (amrap) {
    const reps = new Set(tables.map((t) => t[setIndex]?.reps));
    return reps.size === 1 ? `the ${[...reps][0]}+ set` : "the AMRAP set";
  }
  void def;
  return `set ${setIndex + 1}`;
}

function tmRuleText(rule: TmRule, slots: SlotDef[], def: ProgramDef, wr: Writer, maxWord: string, all: SlotDef[] = slots): string {
  const s0 = slots[0];
  const p = s0.progression as Percent;
  const weeks = slotWeeks(def, s0);
  const lifts = slots.map((s) => (s.progression as Percent).tmLift);
  const incs = wr.perLift(lifts.map((l) => ({ lift: l, v: wr.tmInc(l) })));
  const later = "applyAt" in rule && rule.applyAt === "weekEnd" ? " The change applies from the next week." : "";
  const amt = (n: number) => incs.uniform ? wr.signed(wr.tmInc(lifts[0]), n) : `${n < 0 ? "−" : "+"}${plural(Math.abs(n), "step")}`;
  const legend = incs.uniform ? "" : ` One step is ${incs.text}.`;
  switch (rule.type) {
    case "amrapTable": {
      if (rule.table.every((row) => row.minReps <= 0)) {
        const n = rule.table[0]?.increments ?? 0;
        return `Doing it raises your ${maxWord} by ${amt(n)}${later ? " at the end of the week" : ""}.${legend}`;
      }
      const rows = [...rule.table].sort((a, b) => a.minReps - b.minReps);
      // merge neighbours with the same change
      const merged: { lo: number; hi: number | null; n: number }[] = [];
      rows.forEach((row, i) => {
        const hi = i + 1 < rows.length ? rows[i + 1].minReps - 1 : null;
        const last = merged[merged.length - 1];
        if (last && last.n === row.increments) last.hi = hi;
        else merged.push({ lo: row.minReps, hi, n: row.increments });
      });
      const range = (m: { lo: number; hi: number | null }) => (m.hi == null ? `${m.lo}+ reps` : m.hi === m.lo ? plural(m.lo, "rep") : `${m.lo}–${m.hi} reps`);
      const parts = merged.map((m) => `${range(m)}: ${m.n ? amt(m.n) : "no change"}`);
      const minLo = merged[0]?.lo ?? 0;
      if (minLo > 0) parts.unshift(`under ${minLo}: no change`);
      const also = rule.alsoLifts?.length ? ` The same change also goes onto your ${list(rule.alsoLifts.map(name))} ${maxWord}.` : "";
      return `Reps on ${whichSet(p, rule.setIndex, def, weeks)} move your ${maxWord}: ${parts.join(" · ")}.${legend}${also}${later}`;
    }
    case "amrapVsTarget": {
      const rows = [...rule.table].sort((a, b) => a.diff - b.diff);
      const val = (row: (typeof rows)[number]) => row.pct != null ? (row.pct === 0 ? "no change" : `${row.pct > 0 ? "+" : "−"}${pct(Math.abs(row.pct))}`) : row.increments ? amt(row.increments) : "no change";
      const target = rows.length && rows.every((row) => row.increments != null && row.pct == null) && rows.every((row, i) => i === 0 || row.diff === rows[i - 1].diff + 1);
      const setName = whichSet(p, rule.setIndex, def, weeks);
      let body: string;
      const k = rows.length > 1 && rows[1].increments != null && rows[0].increments != null ? (rows[1].increments! - rows[0].increments!) : 0;
      if (target && k && rows.every((row) => row.increments === rows[0].increments! + (row.diff - rows[0].diff) * k) && rows[0].increments === 0 && rows[0].diff === 0) {
        body = `each rep past the target adds ${amt(k)}, up to ${plural(rows[rows.length - 1].diff, "rep")} over (${amt(rows[rows.length - 1].increments!)}); hitting it exactly or missing it keeps the ${maxWord}`;
      } else {
        // merge neighbours with the same change, then label each diff interval
        const merged: { a: number; b: number; v: string }[] = [];
        rows.forEach((row, i) => {
          const a = i === 0 ? -Infinity : row.diff, b = i + 1 < rows.length ? rows[i + 1].diff - 1 : Infinity;
          const v = val(row), last = merged[merged.length - 1];
          if (last && last.v === v) last.b = b; else merged.push({ a, b, v });
        });
        body = merged.map((m) => `${diffRange(m.a, m.b)}: ${m.v}`).join(" · ");
      }
      const extras = [
        rule.penalizeMissingSets ? "Skipping a planned set at that weight, or coming up short on one, counts as 2+ short." : "",
      ].filter(Boolean).join(" ");
      if (rule.rir) {
        const rb = merged2(rows, val).filter((m) => m.a >= -1).map((m) => `${m.a === -1 && m.b === -1 ? "below the target" : diffRange(m.a, m.b).replace("short", "under").replace("on target", "at the target")}: ${m.v}`);
        const fail = rows.find((r) => r.diff <= -2);
        return `${cap(setName)} is stopped at a reps-in-reserve target (shown as RPE). Log its RPE, or keep going past the listed reps and each extra rep counts as one more in reserve. Reps in reserve vs the target: ${rb.join(" · ")}.${fail ? ` Miss reps or skip a set: ${val(fail)}.` : ""}${later}`;
      }
      const lead = rule.allSets ? `Every set at the top weight has a rep target, and the weakest one moves your ${maxWord}` : `${cap(setName)} has a rep target, and beating or missing it moves your ${maxWord}`;
      return `${lead}: ${body}.${legend}${extras ? " " + extras : ""}${later}`;
    }
    case "e1rm": {
      const rules = all.map((x) => (x.progression as Percent).tmRule as Extract<TmRule, { type: "e1rm" }>);
      const pcts = [...new Set(rules.map((x) => x.pct))].sort((a, b) => a - b);
      const sets = new Set(all.map((x) => whichSet(x.progression as Percent, ((x.progression as Percent).tmRule as { setIndex: number }).setIndex, def, slotWeeks(def, x))));
      const from = sets.size === 1 ? [...sets][0] : "the top set";
      const how = pcts.length > 1 ? `${pct(pcts[0])}–${pct(pcts[pcts.length - 1])} of that set's estimated 1RM, depending on the week` : rule.pct === 1 ? "it becomes that set's estimated 1RM" : `${pct(rule.pct)} of that set's estimated 1RM`;
      return `Your ${maxWord} is recalculated from ${from}: ${how}.`;
    }
    case "totalReps": {
      const rows = [...rule.table].sort((a, b) => a.minReps - b.minReps);
      const val = (row: (typeof rows)[number]) => row.pct != null ? (row.pct ? `${row.pct > 0 ? "+" : "−"}${pct(Math.abs(row.pct))}` : "no change") : row.increments ? amt(row.increments) : "no change";
      const parts = rows.map((row, i) => {
        const hi = i + 1 < rows.length ? rows[i + 1].minReps - 1 : null;
        const range = i === 0 && row.minReps <= 0 ? `under ${rows[1]?.minReps ?? 1}` : hi == null ? `${row.minReps}+` : `${row.minReps}–${hi}`;
        return `${range}: ${val(row)}`;
      });
      return `Add up every rep you do at the prescribed weight; the total moves your ${maxWord}: ${parts.join(" · ")}.${legend}${later}`;
    }
    case "missCut":
      return `Miss the reps on ${rule.setIndex != null ? `set ${rule.setIndex + 1}` : "any prescribed set"} and your ${maxWord} drops ${pct(rule.pct)}.`;
  }
}

/** Rule rows merged into diff intervals with the same change. */
function merged2<R extends { diff: number }>(rows: R[], val: (r: R) => string): { a: number; b: number; v: string }[] {
  const merged: { a: number; b: number; v: string }[] = [];
  rows.forEach((row, i) => {
    const a = i === 0 ? -Infinity : row.diff, b = i + 1 < rows.length ? rows[i + 1].diff - 1 : Infinity;
    const v = val(row), last = merged[merged.length - 1];
    if (last && last.v === v) last.b = b; else merged.push({ a, b, v });
  });
  return merged;
}

/** reps beyond (+) or short of (−) a target, as an interval: "2+ short", "on target", "1–3 over" */
function diffRange(a: number, b: number): string {
  const side = (x: number) => (x === 0 ? "on target" : x < 0 ? `${-x} short` : `${x} over`);
  if (a === -Infinity && b === Infinity) return "any result";
  if (a === -Infinity) return b < 0 ? `${-b}+ short` : b === 0 ? "on target or short" : `short to ${b} over`;
  if (b === Infinity) return a > 0 ? `${a}+ over` : a === 0 ? "on target or better" : `${-a} short or better`;
  if (a === b) return side(a);
  if (a >= 0) return a === 0 ? `on target to ${b} over` : `${a}–${b} over`;
  if (b <= 0) return b === 0 ? `${-a} short to on target` : `${-b}–${-a} short`;
  return `${-a} short to ${b} over`;
}

// ───────────────────────── one rule ─────────────────────────

function stagesText(slots: SlotDef[], wr: Writer): { title: string; text: string } {
  const p = slots[0].progression as Stages;
  const st = p.stages.map(schemeLabel);
  const incs = wr.perLift(slots.map((s) => ({ lift: s.lift, v: wr.slotInc(s)! })));
  const n = p.failsBeforeAction ?? 1;
  const out: string[] = [];
  if (p.advance.type === "amrapAtLeast") {
    out.push(`${st[0]}. When the last set reaches ${p.advance.reps} reps, add ${incs.text} next time; until then, keep the weight and push the last set.`);
    return { title: st.join(" → "), text: out.join(" ") };
  }
  if (p.climb) {
    const steps = st.length > 6 ? `${st.slice(0, 3).join(" → ")} → … → ${st[st.length - 1]}` : st.join(" → ");
    const end = p.climb.loadPct > 0 ? `After ${st[st.length - 1]}, add ${pct(p.climb.loadPct)} to the weight and start again at ${st[0]}.` : `Then stay at ${st[st.length - 1]}.`;
    out.push(`Start at ${st[0]}. Get every rep and move to the next scheme at the same weight (${steps}). ${end} Miss a rep and repeat the same scheme next time.`);
    return { title: `${st[0]} → ${st[st.length - 1]}${p.climb.loadPct > 0 ? `, then +${pct(p.climb.loadPct)}` : ""}`, text: out.join(" ") };
  }
  out.push(`${st[0]}${st[0].endsWith("+") ? " (last set as many reps as you can)" : ""}. Get every rep and add ${incs.text} next time.`);
  if (p.amrapBonus) {
    const bonus = wr.perLift(slots.map((s) => ({ lift: s.lift, v: wr.slotInc(s)! })), p.amrapBonus.increments);
    out.push(`Get ${p.amrapBonus.reps}+ on the last set and add ${p.amrapBonus.increments === 2 ? "double" : `${p.amrapBonus.increments}×`} that (${bonus.text}) instead.`);
  }
  const miss = n > 1 ? `If you miss reps ${word(n)} sessions in a row` : "If you miss a rep";
  const f = p.onFinalFail;
  const bump = f.type === "reset" ? wr.perLift(slots.map((s) => ({ lift: s.lift, v: wr.slotInc(s)! })), f.bumpIncrements) : null;
  const final = f.type === "retest" ? `test a new ${f.rmReps}-rep max and restart at ${pct(f.pct)} of it`
    : f.type === "reset" ? `go back to ${st[0]} at the weight you last started it with, plus ${bump!.text}`
    : f.type === "deload" ? `drop the weight ${pct(f.pct)} and build back up`
    : f.type === "deloadBy" ? `drop ${wr.w(f.amount)} and build back up`
    : "";
  if (st.length > 1) {
    out.push(`${miss}, move to ${st.slice(1).join(", then ")} at the same weight.`);
    out.push(f.type === "hold" ? `On ${st[st.length - 1]}, stay at the weight until you get it.` : `When ${st[st.length - 1]} stalls too, ${final}.`);
  } else {
    out.push(f.type === "hold" ? `${miss}, stay at the weight until you get every rep.` : `${miss}, ${final}.`);
  }
  return { title: st.join(" → "), text: out.join(" ") };
}

function doubleText(slots: SlotDef[], wr: Writer): { title: string; text: string } {
  const p = slots[0].progression as Extract<Progression, { kind: "double" }>;
  const incs = wr.perLift(slots.map((s) => ({ lift: s.lift, v: wr.slotInc(s)! })));
  const scheme = `${p.sets}×${p.reps[0]}–${p.reps[1]}${p.amrapLast ? "+" : ""}`;
  return {
    title: scheme,
    text: `${plural(p.sets, "set")} of ${p.reps[0]}–${p.reps[1]} reps${p.amrapLast ? ", the last one as many as you can" : ""}. Add reps at the same weight; once every set reaches ${p.reps[1]}, add ${incs.text} and work back up from ${p.reps[0]}.`,
  };
}

function fixedScheme(p: Extract<Progression, { kind: "fixed" }>, note = true): string {
  return `${p.sets}×${p.reps}${p.repsMax ? "–" + p.repsMax : ""}${p.amrapLast ? "+" : ""}${note && p.note ? `: ${p.note}` : ""}`;
}

// ───────────────────────── grouping ─────────────────────────

/** Rule shape without the lift-specific parts, so the same rule on squat and bench groups together. */
function shape(def: ProgramDef, s: SlotDef): string {
  const p = s.progression;
  const strip = { ...p, increment: undefined, tmLift: p.kind === "percent" ? (p.tmLift === s.lift ? "self" : p.tmLift) : undefined };
  const sched = p.kind === "percent" ? slotWeeks(def, s).join(",") : "";
  return `${s.tier}|${JSON.stringify(strip)}|${sched}`;
}

const unconditional = (p: Progression) => p.kind === "percent" && p.tmRule?.type === "amrapTable" && p.tmRule.table.every((r) => r.minReps <= 0);

/**
 * Finite 5/3/1 blocks split a main slot into the normal slot and a twin that only exists in the
 * weeks the TM goes up (programs/wendler-variants.ts withBump). Describe them as one slot plus
 * "the max goes up at the end of week N".
 */
function mergeBumps(def: ProgramDef, slots: SlotDef[]): { slots: SlotDef[]; bumps: Map<string, { weeks: number[]; n: number }> } {
  const bumps = new Map<string, { weeks: number[]; n: number }>();
  const drop = new Set<string>();
  const out = slots.map((m) => {
    const mp = m.progression;
    if (mp.kind !== "percent" || mp.tmRule) return m;
    const days = def.days.filter((d) => d.slots.some((x) => x.id === m.id));
    const twin = days.flatMap((d) => d.slots).find((t) => {
      const tp = t.progression;
      return t.id !== m.id && !drop.has(t.id) && t.lift === m.lift && t.tier === m.tier && tp.kind === "percent" && unconditional(tp) && tp.tmLift === mp.tmLift
        && tp.weeks.length === mp.weeks.length && tp.weeks.every((tw, w) => !(tw.length && mp.weeks[w].length));
    });
    if (!twin) return m;
    const tp = twin.progression as Percent;
    drop.add(twin.id);
    const weeks = tp.weeks.map((t, w) => (t.length ? w : -1)).filter((w) => w >= 0);
    bumps.set(m.id, { weeks, n: (tp.tmRule as Extract<TmRule, { type: "amrapTable" }>).table[0].increments });
    return { ...m, progression: { ...mp, weeks: mp.weeks.map((t, w) => (t.length ? t : tp.weeks[w])) } };
  });
  return { slots: out.filter((s) => !drop.has(s.id)), bumps };
}

export function describeProgram(def: ProgramDef, opts: DescribeOptions = {}): ProgramRules {
  const wr = new Writer(def, opts);
  const { slots, bumps } = mergeBumps(def, allSlots(def));
  const overview: string[] = [];

  // ── overview
  const scheduled = def.days.some((d) => d.weeks);
  const n = def.sessionsPerWeek, nd = def.days.length;
  overview.push(
    scheduled ? `${plural(n, "session")} a week · different sessions each week`
      : nd === n ? `${plural(n, "session")} a week · ${word(nd)} different days`
      : nd < n ? `${plural(n, "session")} a week · ${word(nd)} days that alternate, so the order shifts week to week`
      : `${plural(n, "session")} a week · ${word(nd)} days in rotation, so each week picks up where the last left off`,
  );
  const c = def.cycle;
  if (c?.finite) overview.push(`A ${c.weeks}-week block that ends after week ${c.weeks}.`);
  else if (c && c.weeks > 1) {
    const names = c.weekNames?.slice(0, c.weeks);
    overview.push(`Repeats in ${c.weeks}-week cycles${names?.length === c.weeks ? `: ${list(names)}` : ""}.`);
  } else overview.push("Open-ended: keep running it as long as you progress.");
  if (c?.tmIncrease && (!c.finite || c.tmIncreaseEvery || c.tmIncreaseAt)) {
    const every = c.tmIncreaseEvery ?? c.weeks;
    const when = c.tmIncreaseAt ? `At the end of ${weekList(c.tmIncreaseAt)}${c.finite ? "" : " of each cycle"}`
      : every === 1 ? "Every week" : c.tmIncreaseEvery ? `Every ${every} weeks` : "After each cycle";
    const items = Object.entries(c.tmIncrease).map(([lift, v]) => ({ lift, v }));
    const by = new Map<string, string[]>();
    for (const x of items) { const k = wr.signed(x.v); by.set(k, [...(by.get(k) ?? []), name(x.lift)]); }
    const what = slots.some((s) => s.progression.kind === "percent") ? maxFull(def.maxLabel).replace(/\s*\([^)]*\)/g, "") : "weights";
    overview.push(`${when}, raise your ${what}: ${list([...by.entries()].map(([k, ls]) => `${k} on ${list(ls)}`))}.`);
  }
  if (slots.some((s) => s.progression.kind === "percent" && (s.progression as Percent).weeks.some((t) => t.some((x) => x.pct != null && !x.ofTop)))) {
    overview.push(`Percentages are of your ${maxFull(def.maxLabel)} for each lift.`);
  }

  // ── rotation
  const many = scheduled && def.days.length > 8;
  const days = many ? def.days.filter((d) => isScheduled(d, 0)) : def.days;
  const rotation = days.map((d) => ({
    day: d.name + (!many && d.weeks && c && !/\bweeks?\b/i.test(d.name) ? ` (${weekList(d.weeks)})` : ""),
    lifts: d.slots.map((s) => `${s.tier} ${short(s.lift)}`),
  }));
  if (many) overview.push(`Week 1's days are shown below; the ${plural(def.days.length, "session")} change week to week (see WORKOUTS).`);

  // ── tiers
  const groups = new Map<string, SlotDef[]>();
  for (const s of slots) {
    const p = s.progression;
    const key = p.kind === "fixed" ? `${s.tier}|fixed` : shape(def, s) + (bumps.has(s.id) ? "|bump" + JSON.stringify(bumps.get(s.id)) : "");
    const g = groups.get(key) ?? [];
    groups.set(key, [...g, s]);
  }
  // Week-by-week programs (Sheiko, Calgary…) have a distinct table per slot: describe percent work
  // per tier and rule instead of one entry per table.
  const pctGroups = [...groups.entries()].filter(([, g]) => g[0].progression.kind === "percent");
  const collapse = pctGroups.length > 6;
  if (collapse) {
    for (const [k] of pctGroups) groups.delete(k);
    for (const [, g] of pctGroups) for (const s of g) {
      const p = s.progression as Percent;
      const r = p.tmRule ? { ...p.tmRule, setIndex: undefined, pct: p.tmRule.type === "e1rm" ? undefined : (p.tmRule as { pct?: number }).pct } : null;
      const key = `${s.tier}|pct|${r ? JSON.stringify(r) : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
  }

  const tiers: ProgramRules["tiers"] = [];
  const maxWord = maxShort(def.maxLabel);
  for (const [key, g] of groups) {
    const s0 = g[0], p = s0.progression;
    const lifts = [...new Set(g.map((s) => name(s.lift)))];
    const tier = TIER_NAME[s0.tier];
    if (p.kind === "stages") {
      const { title, text } = stagesText(uniqueByLift(g), wr);
      tiers.push({ title: `${tier} · ${title}`, lifts, text });
    } else if (p.kind === "double") {
      const { title, text } = doubleText(uniqueByLift(g), wr);
      tiers.push({ title: `${tier} · ${title}`, lifts, text });
    } else if (p.kind === "fixed") {
      const schemes = new Map<string, string[]>();
      for (const s of g) {
        const sc = fixedScheme(s.progression as Extract<Progression, { kind: "fixed" }>);
        const ls = schemes.get(sc) ?? [];
        if (!ls.includes(name(s.lift))) ls.push(name(s.lift));
        schemes.set(sc, ls);
      }
      const what = schemes.size === 1 ? `${[...schemes.keys()][0]}.`
        : schemes.size > 6 ? `Sets and reps change from session to session; the WORKOUTS tab lists each one.`
        : [...schemes.entries()].map(([sc, ls]) => `${list(ls)} ${sc}.`).join(" ");
      const bare = new Set(g.map((s) => fixedScheme(s.progression as Extract<Progression, { kind: "fixed" }>, false)));
      tiers.push({ title: `${tier} · ${bare.size === 1 ? [...bare][0] : "no set progression"}`, lifts, text: `${what} No built-in progression: pick a weight you can do for the reps and beat last time.` });
    } else {
      const pp = p as Percent;
      const off = pp.tmLift !== s0.lift && !key.includes("|pct|") ? ` ${name(pp.tmLift)}` : "";
      const tables = g.flatMap((s) => { const q = s.progression as Percent; return slotWeeks(def, s).map((w) => q.weeks[w % q.weeks.length] ?? []); }).filter((t) => t.length);
      const pctOnly = !tables.flat().some((x) => x.pct != null && !x.ofTop);
      const byRpe = tables.flat().some((x) => x.rpe != null);
      const title = `${tier} · ${pctOnly ? (byRpe ? "by RPE" : "by feel") : `% of${off} ${maxWord}`}`;
      const perSlot = g.map((x) => {
        const q = x.progression as Percent;
        const ts = [...new Set(slotWeeks(def, x).map((w) => tableText(q.weeks[w % q.weeks.length] ?? [], wr)).filter(Boolean))];
        return { x, ts };
      });
      const weeksText = !key.includes("|pct|") ? percentWeeks(def, g, wr)
        : g.length <= 6 && perSlot.every((x) => x.ts.length === 1)
          ? [...new Set(perSlot.map((x) => x.ts[0]))].map((t) => {
              const xs = perSlot.filter((x) => x.ts[0] === t).map((x) => x.x);
              const dayNames = [...new Set(xs.map((x) => dayOf(def, x)))];
              return `${list([...new Set(xs.map((x) => name(x.lift)))])}${dayNames.length === 1 && def.days.length > 1 ? ` (${dayNames[0]})` : ""}: ${t}.`;
            }).join(" ")
          : `${cap(rangeText(tables))}, changing from session to session. The WORKOUTS tab lists each one.`;
      const parents = [...new Set(g.filter((s) => (s.progression as Percent).tmLift !== s.lift).map((s) => (s.progression as Percent).tmLift))];
      const offText = !collapse || pctOnly || !parents.length ? ""
        : g.length === 1 || (parents.length === 1 && g.every((s) => (s.progression as Percent).tmLift !== s.lift)) ? ` Loaded off your ${name(parents[0])} ${maxWord}.`
        : ` Variations are loaded off their parent lift's ${maxWord}.`;
      const bump = bumps.get(s0.id);
      const bumpText = bump ? ` At the end of ${weekList(bump.weeks)}, your ${maxWord} goes up ${wr.perLift(uniqueByTm(g).map((x) => ({ lift: (x.progression as Percent).tmLift, v: wr.tmInc((x.progression as Percent).tmLift) })), bump.n).text.replace(/(^|, | and )(\d)/g, "$1+$2")}.` : "";
      const rule = (pp.tmRule ? " " + tmRuleText(pp.tmRule, uniqueByTm(g), def, wr, maxWord, g) : "") + bumpText;
      const moved = bumps.size > 0 || slots.some((x) => x.progression.kind === "percent" && x.progression.tmRule && (x.progression.tmLift === pp.tmLift || (x.progression.tmRule.type === "amrapTable" && x.progression.tmRule.alsoLifts?.includes(pp.tmLift))));
      const fixedTm = !moved && !(c?.tmIncrease && Object.keys(c.tmIncrease).includes(pp.tmLift)) && !pctOnly ? ` Your ${maxWord} stays the same throughout.` : "";
      tiers.push({ title, lifts, text: `${weeksText}${offText}${rule}${fixedTm && c?.finite ? fixedTm : ""}`.trim() });
    }
  }
  // same title twice (Monolith's Monday and Friday squat): name the day
  const tierDays = [...groups.values()].map((g) => [...new Set(g.map((x) => dayOf(def, x)))]);
  const titles = tiers.map((t) => t.title);
  tiers.forEach((t, i) => {
    if (titles.some((u, k) => k !== i && u === titles[i]) && tierDays[i]?.length === 1) t.title += ` · ${tierDays[i][0]}`;
  });
  const order: Tier[] = ["T1", "T2", "T3", "MAIN", "SUPP", "ACC"];
  const rank = (t: string) => order.findIndex((x) => t.startsWith(TIER_NAME[x] + " "));
  tiers.sort((a, b) => rank(a.title) - rank(b.title));
  return { overview, rotation, tiers };
}

function uniqueByLift(g: SlotDef[]): SlotDef[] {
  const seen = new Set<string>();
  return g.filter((s) => !seen.has(s.lift) && !!seen.add(s.lift));
}
function uniqueByTm(g: SlotDef[]): SlotDef[] {
  const seen = new Set<string>();
  return g.filter((s) => { const l = (s.progression as Percent).tmLift; return !seen.has(l) && !!seen.add(l); });
}

/** Rules as plain text (tests, debugging). */
export function rulesText(r: ProgramRules): string {
  return [
    ...r.overview,
    "",
    ...r.rotation.map((d) => `${d.day}: ${d.lifts.join(" · ")}`),
    "",
    ...r.tiers.map((t) => `[${t.title}] (${t.lifts.join(", ")})\n${t.text}`),
  ].join("\n");
}
