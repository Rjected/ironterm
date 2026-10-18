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

