// What to run next: when an open-ended linear progression stops working, or a block ends.
// Templates can carry their own `then`; this map covers the older templates without editing them.
// Where the author names a successor we say so; otherwise the advice is the usual r/Fitness wiki
// path (novice LP → an intermediate program) and the text says "for example".

import type { ProgramNext, ProgramTemplate } from "../program";

const INTERMEDIATE = "When resets stop working and you can't add weight every session any more, you're past the novice stage: move to an intermediate program, for example 5/3/1 or nSuns.";

export const NEXT_STEPS: Record<string, ProgramNext> = {
  // Rippetoe, Practical Programming: the novice progression is followed by the Texas Method.
  "starting-strength": { id: "texas-method", when: "When you can't add weight every session even after resets, move to an intermediate program; Practical Programming's is the Texas Method." },
  stronglifts: { id: "madcow", when: "When the 10% deloads stop getting you past your stalls, move to a weekly-progression program such as Madcow 5×5." },
  gzclp: { id: "gzcl-jnt2", when: "When T1 keeps stalling at 10×1 and the retests stop helping, move to a GZCL intermediate program such as Jacked & Tan 2.0 or The Rippler." },
  greyskull: { id: "531", when: INTERMEDIATE },
  "phrak-gslp": { id: "531", when: INTERMEDIATE },
  "icf-5x5": { id: "madcow", when: "When the 5×5 stalls after resets, move to a weekly-progression program such as Madcow 5×5." },
  "reddit-bbr": { id: "531", when: INTERMEDIATE },
  allpro: { id: "531", when: INTERMEDIATE },
  fierce5: { id: "531", when: INTERMEDIATE },
  "ivysaur-448": { id: "531", when: INTERMEDIATE },
  "bill-starr": { id: "madcow", when: "When you can't add weight every session, switch to weekly progression: Madcow 5×5 is the same layout with a top set that climbs each week." },
  "bromley-beginner": { id: "531", when: INTERMEDIATE },
  "531-beginners": { id: "531", when: "When the full-body version stops fitting your schedule or recovery, move to a four-day 5/3/1 template; the training maxes carry over." },
  "candito-linear": { id: "candito6", when: "When the linear phase stalls, run the Candito 6 Week Strength program from new maxes." },
  "texas-method": { when: "When intensity day stops moving for a few weeks even after a reset, move to a monthly-progression program such as 5/3/1." },
  madcow: { when: "After 12 weeks, deload, then run it again from your new top sets, or move to a monthly-progression program such as 5/3/1." },
};

/** The template's own `then`, else the shared map. */
export function nextStep(t: ProgramTemplate): ProgramNext | null {
  return t.then ?? NEXT_STEPS[t.id] ?? null;
}
