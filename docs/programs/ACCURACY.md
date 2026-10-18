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
| Reddit PPL (`reddit-ppl`) | | not yet re-checked | |
| PHUL (`phul`) | | not yet re-checked | |
| PHAT (`phat`) | | not yet re-checked | |
| Lyle's Generic Bulking Routine (`lyle-gbr`) | | not yet re-checked | |
| Ivysaur 4-4-8 (`ivysaur-448`) | | not yet re-checked | |
| Candito Linear (`candito-linear`) | | not yet re-checked | |
| German Volume Training (`gvt`) | | not yet re-checked | |
| Arnold Split (`arnold-split`) | | not yet re-checked | |

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
| Calgary Barbell 8 Week (`calgary-8`) | [LiftVault: Calgary Barbell 8 Week sheet](https://liftvault.com/programs/powerlifting/calgary-barbell-16-week-8-week-program-spreadsheets/) | approximation: every row (sets, reps, % / RPE, rest) of weeks 1–8 and the taper matches, and the 1RM stays static as in the sheet. The "% of E1RM" back-offs use today's top-set Epley e1RM (the sheet doesn't define E1RM). "F"/"R" sets are planned at the top-set RPE. | 2026-10-18 |
| Juggernaut Method 2.0 (`juggernaut`) | [LiftVault Juggernaut Method Base Template](https://liftvault.com/programs/strength/juggernaut-method-base-template-spreadsheet/) (formulas); [JTS](https://www.jtsstrength.com/going-heavy-on-the-juggernaut-method) | exact to the sheet: every wave and %, TM = CEILING(TM + (reps − standard) × 5 / 2.5 lb) with no cap or floor, the new TM from the next wave (the deload uses the old one), and loads rounded up. The book itself (paid) wasn't checked. | 2026-10-18 |
| RTS Generalized Intermediate (`rts-generalized`) | [Tuchscherer, RTS Generalized Intermediate Program](https://store.reactivetrainingsystems.com/blogs/program-articles/the-rts-generalized-intermediate-program-by-mike-tuchscherer) (2015) | approximation: all 9 weeks' exercises, reps, RPEs and fatigue % match, and back-offs are exactly the top load minus the fatigue % (or the same load for Repeat). The number of fatigue sets is open-ended in the article; 2–4 are prescribed (midpoint drop %). The RPE chart is the standard RTS chart. | 2026-10-18 |
| Greg Nuckols High Frequency (`nuckols-hf`) | strongerbyscience.com "Your Drug-Free Muscle and Strength Potential, Part 2" (archived); LiftVault Exact and 6-day sheets | approximation: the weekly table and the AMAP rule (6–7 → +5, 8–9 → +10, 10+ → +15 lb) match. Accessory rep ranges are ours (the sheet writes "?"). Not modelled: the article's 3- and 4-day fallbacks and LiftVault's "stop at ≤5 reps" end condition. | 2026-10-18 |

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
