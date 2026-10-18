# Program accuracy

How closely each built-in program (`web/shared/programs/*.ts`) follows its source. Every program has a test in `web/shared/programs/*.test.ts` that encodes the source's expected sessions and progression, with the source cited in a comment.

**Status:**
- **exact**: sets, reps, percentages, progression and failure rules match the source. Rounding is to the nearest plate step unless the row says otherwise.
- **approximation**: the row says what differs and why. Usually the source is silent or ambiguous, or the engine can't express a rule.
- **not yet re-checked**: the family's audit PR hasn't landed yet.

Sources marked *(community)* are third-party extractions of a paid or unreachable original. They are used only for publicly documented rules.

## GZCL

| Program | Source | Status | Checked |
|---|---|---|---|
| GZCLP (`gzclp`) | | not yet re-checked | |
| Jacked & Tan 2.0 (`gzcl-jnt2`) | | not yet re-checked | |
| The Rippler (`gzcl-rippler`) | | not yet re-checked | |
| The GZCL Method (`gzcl-method`) | | not yet re-checked | |
| VDIP (`gzcl-vdip`) | | not yet re-checked | |
| UHF+ 5 Week (`gzcl-uhf-5wk`) | | not yet re-checked | |
| UHF 9 Week (`gzcl-uhf-9wk`) | | not yet re-checked | |
| General Gainz Wave LP (`gzcl-gg-wave`) | | not yet re-checked | |

## Wendler 5/3/1

| Program | Source | Status | Checked |
|---|---|---|---|
| 5/3/1 (`531`) | | not yet re-checked | |
| 5/3/1 for Beginners (`531-beginners`) | | not yet re-checked | |
| 5/3/1 2-Day / 3-Day (`531-2-3day`) | | not yet re-checked | |
| 5's PRO + FSL / BBS (`531-fives-pro`) | | not yet re-checked | |
| Building the Monolith (`531-monolith`) | | not yet re-checked | |
| BBB 3-Month Challenge (`531-bbb-challenge`) | | not yet re-checked | |

## nSuns

| Program | Source | Status | Checked |
|---|---|---|---|
| nSuns LP 5-Day (`nsuns5`) | | not yet re-checked | |
| nSuns LP 4-Day (`nsuns-4day`) | | not yet re-checked | |
| nSuns LP 6-Day squat (`nsuns-6day-squat`) | | not yet re-checked | |
| nSuns LP 6-Day deadlift (`nsuns-6day-deadlift`) | | not yet re-checked | |

## Novice linear progressions

| Program | Source | Status | Checked |
|---|---|---|---|
| StrongLifts 5×5 (`stronglifts`) | | not yet re-checked | |
| Starting Strength (`starting-strength`) | | not yet re-checked | |
| GreySkull LP (`greyskull`) | | not yet re-checked | |
| Phrak's GSLP (`phrak-gslp`) | | not yet re-checked | |
| Basic Beginner Routine (`reddit-bbr`) | | not yet re-checked | |
| Ice Cream Fitness 5×5 (`icf-5x5`) | | not yet re-checked | |
| Fierce 5 (`fierce5`) | | not yet re-checked | |
| AllPro Simple Beginner (`allpro`) | | not yet re-checked | |
| Madcow 5×5 (`madcow`) | | not yet re-checked | |
| Bill Starr 5×5 (`bill-starr`) | | not yet re-checked | |
| Texas Method (`texas-method`) | | not yet re-checked | |
| Bromley's Simplest Beginner (`bromley-beginner`) | | not yet re-checked | |

## Hypertrophy

| Program | Source | Status | Checked |
|---|---|---|---|
| Reddit PPL (`reddit-ppl`) | /u/Metallicadpa's r/Fitness post (archived) | exact: rotation, every exercise, sets × reps, +5 lb a session (deadlift +10), three misses in a row → −10%, accessories add weight at 3×12. Accessory jump sizes are ours (the post doesn't give them). | 2026-10-18 |
| PHUL (`phul`) | muscleandstrength.com PHUL (archived) | approximation: every exercise and rep range matches, using the low end of each set range. The article has no progression rule, so ours is double progression. | 2026-10-18 |
| PHAT (`phat`) | simplyshredded.com Layne Norton PHAT (archived) | approximation: every exercise, sets × reps and the 6×3 speed work at 65–70% match. The article has no load rule; ours is +1 jump when all three power sets reach 5. Power-movement rotation and deloads are in the notes. | 2026-10-18 |
| Lyle's Generic Bulking Routine (`lyle-gbr`) | Lyle's forum post as reproduced by jcdfitness.com | approximation: days, exercises, set ranges and rests match. Lyle progresses on the first set ("or all sets"); we use the all-sets variant. The Thursday/Friday "vary" option is our reading of his one-line suggestion. | 2026-10-18 |
| Ivysaur 4-4-8 (`ivysaur-448`) | /u/ivysaur's r/Fitness post and program image (archived) | exact: all six days, 90% eights, weekly jumps (+15 squat/deadlift, +10 bench/rows, +5 OHP), 8+ AMRAP → double next week, failed set → −10%. kg values are conversions. | 2026-10-18 |
| Candito Linear (`candito-linear`) | Candito Linear Programming PDF (archived 2017) | approximation: heavy, control and hypertrophy days match the PDF, with +5 lb a week and −15 lb after a miss. Not modelled: shoulder and vertical-pull +0–10 lb every 3 weeks (a note), progressing every 2 weeks after 3 resets, and the power and 3-day variants. | 2026-10-18 |
| German Volume Training (`gvt`) | Poliquin's GVT text (Volume 51); LiftVault GVT sheet | approximation: phase 1 and phase 2 exercises, sets × reps, rests and the +5% rule match Poliquin. Phase 2 uses 70% of 1RM for his "12-rep weight". The 3-week interim block and tempos aren't modelled. | 2026-10-18 |
| Arnold Split (`arnold-split`) | LiftVault Arnold Split (Basic Training #1) | approximation: matches LiftVault's version (not checked against the book). Pyramids are shown as 4×6–15 with no load progression. | 2026-10-18 |

## Candito and spreadsheet blocks

| Program | Source | Status | Checked |
|---|---|---|---|
| Candito 6 Week Strength (`candito6`) | | not yet re-checked | |
| Candito 6 Week Advanced Bench (`candito-adv-bench`) | | not yet re-checked | |
| Candito 9 Week Advanced Squat (`candito-adv-squat`) | | not yet re-checked | |
| Clarence0 14 Week (`clarence14`) | | not yet re-checked | |
| Calgary Barbell 16 Week (`complete16`) | | not yet re-checked | |

## Advanced / peaking

| Program | Source | Status | Checked |
|---|---|---|---|
| Calgary Barbell 8 Week (`calgary-8`) | | not yet re-checked | |
| Juggernaut Method 2.0 (`juggernaut`) | | not yet re-checked | |
| RTS Generalized Intermediate (`rts-generalized`) | | not yet re-checked | |
| Greg Nuckols High Frequency (`nuckols-hf`) | | not yet re-checked | |

## Stronger By Science

| Program | Source | Status | Checked |
|---|---|---|---|
| SBS Strength RTF (`sbsRtf`) | Program sheet Quick Setup tab; day tabs and rules from [the bundle page](https://www.strongerbyscience.com/program-bundle/) and a [community extraction](https://github.com/borisghidaglia/science-based-lifter/tree/main/skills/sbs-training/references) | approximation: intensities, rep targets, adjustment table, 2x–6x layouts and missed-set rule are exact. The 5 reps per deload set aren't in any source (taken from a community port). Upper-back work is left to the lifter, as in the sheet. | 2026-10-18 |
| SBS Strength Last Set RIR (`sbsRir`) | same | exact. Log the last set's RPE; with no RPE logged, reps past the listed number count as RIR above target, which is the sheet's own fallback. Deload reps are as for RTF. | 2026-10-18 |
| SBS Hypertrophy (`sbsHypertrophy`) | same (current bundle defaults: block pulls, leg press, hack squat, incline, DB bench, RDL, DB OHP) | approximation: as for RTF. Block pulls are logged as rack pulls. | 2026-10-18 |
| SBS Novice Hypertrophy (`sbsNoviceHypertrophy`) | same | exact: 3x/4x/5x body-part splits and the sets → reps → +10% progression. Bodyweight lifts climb from 3×5 to 5×15; pick the starting step in setup. | 2026-10-18 |

## Sheiko

| Program | Source | Status | Checked |
|---|---|---|---|
| Sheiko #29–#32 (`sheiko-29-32`) | | not yet re-checked | |
| Sheiko #37 (`sheiko-37`) | | not yet re-checked | |
| Sheiko Beginner (`sheiko-beginner`) | | not yet re-checked | |
| Sheiko Advanced Medium Load (`sheiko-aml`) | | not yet re-checked | |

## Specialization

| Program | Source | Status | Checked |
|---|---|---|---|
| Smolov Jr (`smolov-jr`) | | not yet re-checked | |
| Smolov (`smolov`) | | not yet re-checked | |
| Russian Squat Routine (`russian-squat`) | | not yet re-checked | |
| Coan–Phillipi Deadlift (`coan-phillipi`) | | not yet re-checked | |
| Magnusson–Ortmayer Deadlift (`magnusson-ortmayer`) | | not yet re-checked | |
