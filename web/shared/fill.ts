// Saved program configs can predate a template change: a new slot, a lift swapped for another,
// or a slot that became a % of a training max. Rather than planning those at 0, fill every missing
// start weight and training max at replay time, the same way the program page prefills a new start
// (your e1RMs when there are any, else the template's defaults). Nothing is persisted: an explicit
// value or an Adjustment still wins.

import type { HevyWorkout } from "./hevy";
import { BIG_FOUR, LIFTS } from "./lifts";
import { allSlots, usesStartWeight, type ProgramConfig } from "./program";
import { buildProgram, defaultConfig } from "./programs";
import { startingConfig } from "./simulate";
import { addDays, liftHistory } from "./stats";
import type { Unit } from "./units";

/** Lifts a config is missing a start weight (slot ids) or a training max (lift keys) for. */
export function missingValues(cfg: ProgramConfig): { slots: string[]; tms: string[] } {
  const def = buildProgram(cfg);
  if (!def) return { slots: [], tms: [] };
  const all = allSlots(def);
  const slots = all.filter((s) => usesStartWeight(s) && cfg.startWeights[s.id] == null).map((s) => s.id);
  const lifts = new Set<string>();
  for (const s of all) {
    const p = s.progression;
    if (p.kind !== "percent") continue;
    lifts.add(p.tmLift);
    if (p.tmRule?.type === "amrapTable") for (const l of p.tmRule.alsoLifts ?? []) lifts.add(l);
  }
  return { slots, tms: [...lifts].filter((l) => cfg.trainingMaxes[l] == null) };
}

/** Current e1RM per lift (best of the last 28 days, else the latest), for the lifts asked for. */
export function e1rmsFrom(workouts: HevyWorkout[], unit: Unit, today: string, lifts: string[], map?: Record<string, string>, tz = "UTC"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lift of new Set([...BIG_FOUR, ...lifts])) {
    if (!LIFTS[lift]) continue;
    const pts = liftHistory(workouts, lift, unit, tz, map);
    const recent = pts.filter((p) => p.date > addDays(today, -28));
    const e = recent.length ? Math.max(...recent.map((p) => p.e1rm)) : pts.length ? pts[pts.length - 1].e1rm : 0;
    if (e > 0) out[lift] = e;
  }
  return out;
}

/**
 * `cfg` with every missing start weight and training max filled in. Order of preference:
 * another slot of the same lift (a split-off B-day row), the slot's own old start weight when it
 * became a % slot, then the prefill from your e1RMs (variants scale off their parent lift), then
 * the template's defaults. Returns `cfg` itself when nothing is missing.
 */
export function fillMissing(cfg: ProgramConfig, e1rms: (lifts: string[]) => Record<string, number>): ProgramConfig {
  const miss = missingValues(cfg);
  if (!miss.slots.length && !miss.tms.length) return cfg;
  const def = buildProgram(cfg)!;
  const all = allSlots(def);
  const e = e1rms([...miss.tms, ...all.filter((s) => miss.slots.includes(s.id)).map((s) => s.lift)]);
  const pre = BIG_FOUR.some((k) => (e[k] ?? 0) > 0)
    ? startingConfig(cfg.templateId, cfg.options, e, cfg.unit, cfg.startDate)
    : defaultConfig(cfg.templateId, cfg.unit, cfg.startDate);
  const startWeights = { ...cfg.startWeights };
  for (const id of miss.slots) {
    const slot = all.find((s) => s.id === id)!;
    const twin = all.find((o) => o.lift === slot.lift && o.id !== id && cfg.startWeights[o.id] != null);
    startWeights[id] = twin ? cfg.startWeights[twin.id] : pre.startWeights[id] ?? 0;
  }
  const trainingMaxes = { ...cfg.trainingMaxes };
  for (const lift of miss.tms) {
    const old = all.find((s) => s.progression.kind === "percent" && s.progression.tmLift === lift && cfg.startWeights[s.id] != null);
    trainingMaxes[lift] = old ? cfg.startWeights[old.id] : pre.trainingMaxes[lift] ?? 0;
  }
  return { ...cfg, startWeights, trainingMaxes };
}
