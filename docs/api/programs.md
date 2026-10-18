# Program browsing API

Browse every program, read its rules in plain language (generated from the same definition the
engine runs), page through its workouts with real weights, and start it. All under the app auth
(session cookie or `Bearer ht_…`). Types live in `web/shared/appapi.ts` / `web/shared/describe.ts`;
samples in `docs/api/app/programs*.json`.

## `GET /api/app/programs`

```ts
{ active: string | null;                  // templateId of the running program
  programs: ProgramSummary[] }            // every template, in catalog order (grouped by category)

interface ProgramSummary {
  id: string; name: string; author: string;
  category: "gzcl" | "novice" | "strength" | "powerlifting" | "hypertrophy" | "peaking" | "bodyweight" | "comeback";
  level: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number[];                  // [3] or [3, 4]
  weekCount: number | null;               // length of one run in weeks; null = open-ended
                                          // (not `weeks`: ProgramDetail uses that name for the plan)
  length: "block" | "cycles" | "ongoing"; // block: ends after weekCount weeks ("12-WEEK BLOCK")
                                          // cycles: a cycle that repeats forever, maxes rising each lap ("CYCLES FOREVER", 5/3/1)
                                          // ongoing: no weeks, progress session to session ("ONGOING", GZCLP)
  cycleWeeks: number | null;              // weeks per cycle (cycles) or the block length (block); null when ongoing
  next: { id: string | null;              // what to run when it ends or stalls for good; id/name when it's in the catalog
          name: string | null; when: string } | null;
  summary: string;                        // one-line, hand-written
}
```

## `GET /api/app/programs/{id}?opt.<key>=<value>…`

Options default to the template's defaults (or the active config's, if this is the running program).
Unknown option keys or values → `400 {error}`; unknown program id → `404 {error}`.

```ts
interface ProgramDetail extends ProgramSummary {
  source: string;
  notes: string[];                        // the template's own tips
  options: { key: string; label: string; choices: { value: string; label: string }[]; default: string; selected: string }[];
  unit: "kg" | "lb";
  /** where the weights in `weeks` come from */
  basis: "active" | "e1rm" | "defaults";  // the running program's current weights / maxes (same template and
                                          // options) · your current e1RMs · template defaults
  rules: {
    overview: string[];                   // "4 sessions a week · 4 different days", cycle / TM-increase lines
    rotation: { day: string; lifts: string[] }[];         // day name → "T1 SQUAT", "T2 BENCH", …
    tiers: { title: string; lifts: string[]; text: string }[];  // one per distinct rule; text is plain sentences
  };
  /** Cycle / finite programs: every week (finite blocks up to 16). Open-ended: weeks 1–4 (`sessionsPerWeek`
   *  sessions each). Weights move as if every session succeeds (every rep, AMRAPs two past the target). */
  weeks: {
    week: number;                         // 1-based
    name: string | null;                  // "5s week", "Deload", …
    days: {
      dayId: string; name: string;
      exercises: {
        lift: string; name: string; tier: string; scheme: string;
        top: number;                      // heaviest planned set (0 = bodyweight / RPE-only)
        sets: { reps: number; repsMax?: number; weight: number; amrap: boolean; rpe?: number }[];
        restSeconds: number; note?: string; ifSuccess?: string; ifFail?: string;
      }[];
    }[];
  }[];
  /** prefill for starting it */
  start: { trainingDays: number[]; startWeights: Record<string, number>; trainingMaxes: Record<string, number>; maxLabel: string;
           labels: Record<string, string> };  // one per startWeights key (slot id) and trainingMaxes key (lift):
                                              // { "a1-t3b": "A1 · T3 Bicep Curl", "squat": "Back Squat" }
}
```

## `GET /api/app/programs/{id}/body?mode=load|gaps&days=0,2,4&svg=0&opt.<key>=<value>…`

What the program does to each muscle, before you start it: one full cycle laid on a weekly schedule
and run through the same load and recovery model as the BODY screen (`web/shared/recovery.ts`).
A separate call because the two figures are ~260 KB. Samples: `docs/api/app/programs-gzclp-body.json`
and `programs-gzclp-body-gaps.json` (load / gaps, with SVGs), `programs-531-body-gaps.json` (4 weeks, `svg=0`).

- `mode`: `load` (default) colours by weekly hard sets; `gaps` by lowest readiness across the week.
  Only the figures, `legend` and the order of `muscles` change; every muscle carries both values.
- `days`: training weekdays, Mon = 0. Default: your usual training days when their count matches the
  program's sessions a week, else an even spread (the same as `start.trainingDays` in the detail).
- `svg=0`: leave out `svgFront` / `svgBack` (the web draws its own figure).
- `opt.*`: as for the detail. Errors: `400 {error}` bad mode, days or option; `404 {error}` unknown id.

```ts
interface ProgramBody {
  id: string; mode: "load" | "gaps"; sex: "m" | "f";
  trainingDays: number[];                 // the schedule used
  weeks: number;                          // calendar weeks measured (one full cycle, ≤ 12); per-week numbers average over them
  svgFront?: string; svgBack?: string;    // standalone SVGs coloured for `mode` (same renderer as GET /api/app/body)
  legend: [string, string];               // ["0", "20.5 hard sets/wk"] · ["recovered", "taxed"]
  muscles: {                              // every muscle; most loaded (load) / least recovered (gaps) first
    id: MuscleId; name: string; short: string; group: "chest" | "shoulders" | "arms" | "back" | "core" | "hips" | "legs";
    load: number;                         // 0–1, LOAD colour: hard sets ÷ the busiest muscle's (at least 11)
    gap: number;                          // 0–1, GAPS colour: 1 − lowest readiness
    sets: number; hardSets: number;       // fractional sets / effort-weighted sets, per week
    target: [number, number] | null;      // weekly hard-set range (null: small stabiliser, indirect only)
    status: "none" | "low" | "ok" | "high" | "n/a";   // hardSets vs target: not trained · below · in · above · no range
    hits: number; minGapH: number | null; recoverH: number | null;  // per week · shortest gap · hours an average hit needs
    minReadiness: number;                 // 0–1
    overlaps: number;                     // per week
    lifts: string[];                      // short names of the lifts that load it most
  }[];
  overlaps: {                             // a muscle hit again while > 25 % of its last dose is still there
    week: number;                         // 1-based
    muscle: MuscleId; short: string;
    from: string; to: string;             // "MON A1" → "TUE B1"
    gapH: number; share: number;          // hours apart · residual ÷ the last dose (can pass 1)
    prev: string[]; now: string[];        // lifts behind each hit
  }[];
  overlapsByWeek: number[];               // count per week (length = weeks)
  summary: {
    mostTrained: { id: MuscleId; short: string; hardSets: number }[];               // top 3
    gaps: { id: MuscleId; short: string; hardSets: number; target: [number, number] }[];  // below range, biggest shortfall first
    overlapping: { id: MuscleId; short: string; perWeek: number }[];
    overlapsPerWeek: number;
    lines: string[];                      // the three as sentences: most trained · below range · overlaps
  };
}
```

Estimates from a model, as on the BODY screen: AMRAPs end near failure, % sets are converted from
the program's own max, RPE sets use their RIR.

## `POST /api/app/programs/{id}/start`

```ts
// body
{ options?: Record<string, string>; trainingDays?: number[];       // Mon = 0
  startWeights?: Record<string, number>; trainingMaxes?: Record<string, number>; startDate?: string }
// → { ok: true; program: AppProgram }  (the GET /api/app/program document, so `program.program.name`)
// errors: 400 {error} (bad JSON, unknown option / value, trainingDays not 1–7 distinct ints 0–6,
//         a startWeights key that isn't a slot id or a trainingMaxes key that isn't a max lift of this
//         program, numbers outside 0–2000, startDate not YYYY-MM-DD); 404 {error} unknown id
```

Omitted startWeights / trainingMaxes come from `start` in the detail (same basis). `trainingDays`, when
given, is saved to settings. Works in live, local and demo modes (demo keeps its own copy).

Replaces the active program (the UI confirms first). Past workouts are kept; the new program replays
from `startDate` (default today).
