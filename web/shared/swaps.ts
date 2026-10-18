// Exercise swaps: "do push-ups wherever this program says dips". A swap is per lift, not per
// slot, so it reaches every day the lift appears on. It is applied when the program is built
// (programs/index.ts buildProgram), so replay, planning, routines and the BODY view all see it.
import { LIFTS } from "./lifts";
import { liftProfile, type Involvement } from "./muscles";
import type { ProgramDef } from "./program";

/** The program with `swaps` (original lift → replacement) applied to every slot. */
export function applySwaps(def: ProgramDef, swaps: Record<string, string> | undefined): ProgramDef {
  if (!swaps || !Object.keys(swaps).length) return def;
  const to = (lift: string) => (swaps[lift] && LIFTS[swaps[lift]] ? swaps[lift] : lift);
  const tmIncrease = def.cycle?.tmIncrease && Object.fromEntries(Object.entries(def.cycle.tmIncrease).map(([k, v]) => [to(k), v]));
  return {
    ...def,
    cycle: def.cycle && { ...def.cycle, ...(tmIncrease ? { tmIncrease } : {}) },
    days: def.days.map((d) => ({
      ...d,
      slots: d.slots.map((s) => ({
        ...s,
        lift: to(s.lift),
        progression: s.progression.kind === "percent" ? { ...s.progression, tmLift: to(s.progression.tmLift) } : s.progression,
      })),
    })),
  };
}

/** Every lift the (unswapped) program uses, in the order they first appear. */
export function programLifts(def: ProgramDef): string[] {
  const out: string[] = [];
  for (const d of def.days) for (const s of d.slots) if (!out.includes(s.lift)) out.push(s.lift);
  return out;
}

export interface SwapOption {
  lift: string;
  name: string;
  /** 0–1: how alike the two exercises are (muscles worked, then equipment and fatigue) */
  score: number;
}

// Technique and overload variants for meet prep: near-identical muscles, but an odd everyday swap.
const SPECIALTY = new Set(["pauseSquat", "pinSquat", "boxSquat", "zercherSquat", "deficitDeadlift", "pauseDeadlift", "rackPull", "pauseBench",
  "spotoPress", "boardPress", "pinPress", "slingshotBench", "floorPress", "feetUpBench", "jmPress"]);

const cosine = (a: Involvement, b: Involvement): number => {
  let dot = 0, na = 0, nb = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Involvement>) {
    const x = a[k] ?? 0, y = b[k] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/**
 * Replacements for `lift`, most alike first. Mostly the overlap of the muscles each one trains
 * (the same profiles the BODY view uses), nudged by same equipment and a similar fatigue cost,
 * so a face pull lists rear-delt flys and band pull-aparts before rows.
 */
export function similarLifts(lift: string, limit = 8): SwapOption[] {
  const base = liftProfile(lift), def = LIFTS[lift];
  if (!base || !def) return [];
  const out: SwapOption[] = [];
  for (const [key, other] of Object.entries(LIFTS)) {
    if (key === lift) continue;
    const p = liftProfile(key);
    if (!p) continue;
    // muscles decide; same equipment and a similar fatigue cost break the many near-ties (a dip
    // and a bench press train the same muscles, but a push-up is the dip-like swap)
    const raw = cosine(base.muscles, p.muscles) + (other.kind === def.kind ? 0.1 : 0) + (other.muscle === def.muscle ? 0.03 : 0)
      - 0.15 * Math.abs(base.fatigue - p.fatigue) - (other.upper === def.upper ? 0 : 0.2) - (SPECIALTY.has(key) ? 0.06 : 0);
    out.push({ lift: key, name: other.name, score: raw });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit)
    .map((o) => ({ ...o, score: Math.max(0, Math.min(1, +o.score.toFixed(3))) }));
}
