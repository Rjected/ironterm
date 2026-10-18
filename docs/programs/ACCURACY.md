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
| Smolov Jr (`smolov-jr`) | [smolovjr.com](https://www.smolovjr.com/smolovjr/smolov-squat-program/); LiftVault Smolov Jr sheet | exact: 6×6/7×5/8×4/10×3 at 70–85%, with the week-2 and week-3 adds. smolovjr.com gives ranges (+5–10, +10–20 lb); the default "high" option is the top of them and "low" matches LiftVault (+5/+10). kg adds are conversions. | 2026-10-18 |
| Smolov (`smolov`) | [smolovjr.com Smolov Squat Routine](https://www.smolovjr.com/smolov-squat-routine/); LiftVault Smolov sheet | approximation: intro, base (+20/+30 lb), intense and the week-13 taper and test follow smolovjr.com; the intense days match both sources. The switching block follows LiftVault's sheet; sources disagree on it. | 2026-10-18 |
| Russian Squat Routine (`russian-squat`) | [StrengthLog](https://www.strengthlog.com/russian-squat-routine/) | exact: 3 days a week for 6 weeks, every session's sets × reps @ %, ending at 105%. | 2026-10-18 |
| Coan–Phillipi Deadlift (`coan-phillipi`) | [elitefts](https://elitefts.com/blogs/training/manipulating-a-training-program) (2008); LiftVault sheet; Fitness Volt (assistance) | approximation: every heavy and speed %, set count and rest matches. LiftVault rounds up (CEILING) where we round to nearest (≤5 lb). Shrugs are rescaled onto the goal max. Weeks 7–9 assistance follows Fitness Volt (elitefts says shrugs only). | 2026-10-18 |
| Magnusson–Ortmayer Deadlift (`magnusson-ortmayer`) | [LiftVault Mag/Ort (corrected 10 lb)](https://liftvault.com/programs/powerlifting/magnusson-ortmayer-magort-deadlift-program-spreadsheet/) | exact: 11 weeks plus the optional week-12 test, the +10 lb (5 kg) steps, rest weeks 4 and 8, and MROUND rounding. "Miss the 8+ set → repeat the week" is a note. | 2026-10-18 |
