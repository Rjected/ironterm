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
  category: "gzcl" | "novice" | "strength" | "powerlifting" | "hypertrophy" | "peaking";
  level: "beginner" | "intermediate" | "advanced";
  daysPerWeek: number[];                  // [3] or [3, 4]
  weekCount: number | null;               // length of one run in weeks; null = open-ended
                                          // (not `weeks`: ProgramDetail uses that name for the plan)
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
