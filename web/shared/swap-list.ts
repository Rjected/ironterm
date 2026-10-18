// The program's exercises with their swaps and ranked replacements. Its own module so the web
// client can use it without pulling in the whole app API.
import { LIFTS, liftName } from "./lifts";
import type { ProgramConfig } from "./program";
import { getTemplate } from "./programs";
import { programLifts, similarLifts, type SwapOption } from "./swaps";

export interface ProgramSwap {
  /** the program's own exercise */
  lift: string; name: string;
  /** what's done instead, or null */
  to: null | { lift: string; name: string };
  /** replacements, most alike first */
  options: SwapOption[];
}

/** The program's exercises with their swaps and replacement options. */
export function programSwaps(cfg: ProgramConfig): ProgramSwap[] {
  const base = getTemplate(cfg.templateId)?.build(cfg.options);
  if (!base) return [];
  return programLifts(base).map((lift) => {
    const to = cfg.swaps?.[lift];
    return { lift, name: liftName(lift), to: to && LIFTS[to] ? { lift: to, name: liftName(to) } : null, options: similarLifts(lift, 8) };
  });
}


/**
 * The config with `lift` swapped to `to` (null: back to the program as written). The swapped
 * slots' saved start weights are dropped so the new exercise starts from your own history (or
 * the template default) instead of the old exercise's weight. Throws on a bad swap.
 */
export function withSwap(cfg: ProgramConfig, lift: string, to: string | null): ProgramConfig {
  const base = getTemplate(cfg.templateId)?.build(cfg.options);
  if (!base || !programLifts(base).includes(lift)) throw new Error("lift must be one of the program's exercises");
  if (to !== null && (!LIFTS[to] || to === lift)) throw new Error("to must be another exercise (or null to undo the swap)");
  if ((cfg.swaps?.[lift] ?? null) === to) return cfg;
  const swaps = { ...(cfg.swaps ?? {}) };
  if (to === null) delete swaps[lift]; else swaps[lift] = to;
  const startWeights = { ...cfg.startWeights };
  for (const d of base.days) for (const sl of d.slots) if (sl.lift === lift) delete startWeights[sl.id];
  return { ...cfg, swaps, startWeights };
}
