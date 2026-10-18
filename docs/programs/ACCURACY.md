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
| GZCLP (`gzclp`) | Blacknoir's v4.5b5 sheet (LiftVault); Cody's [GZCL Applications & Adaptations](https://swoleateveryheight.blogspot.com/2016/02/gzcl-applications-adaptations.html); r/gzcl wiki; GZCLP infographic | exact. The T2 reset after 3×6 is "slightly heavier than your last 3×10, at most +20 lb"; we use the last 3×10 weight + 2 jumps (+10 lb upper / +20 lb lower). T3 needs 15/15/25. Starting weights are example prefills, not the sheet's placeholders. | 2026-10-18 |
| Jacked & Tan 2.0 (`gzcl-jnt2`) | Cody's [Jacked & Tan 2.0](https://swoleateveryheight.blogspot.com/2016/07/jacked-tan-20.html) post and his J&T2.0 sheet (GZCL Free Compendium, Nov 2016) | approximation: T1, T2a (including the lighter upper-body percentages) and the TM (a daily 2RM, reset from the week-6 single) match. T2b/T3 RMs are fixed slots with the target RM in the week label. The sheet's per-lift T1 percentages, its third T2 and its 3–4 T3s aren't modelled; exercise picks are Liftosaur's. | 2026-10-18 |
| The Rippler (`gzcl-rippler`) | "The Rippler" tab of the GZCL Free Compendium (Nov 2016); r/gzcl wiki | exact. T1, T2 and T3 match the sheet's table, including week 10's max-reps set and T3's set counts and total-rep load jumps after weeks 3, 6 and 9. The behind-the-neck press and barbell incline T3s are swapped for DB versions (their lifts already carry T1/T2 maxes). | 2026-10-18 |
| The GZCL Method (`gzcl-method`) | Cody's [The GZCL Method, Simplified](https://swoleateveryheight.blogspot.com/2014/07/the-gzcl-method-simplified_13.html) | approximation: the squat and bench waves and the retest rule match the post. The deadlift and OHP days reuse those waves with our own T2/T3 picks; rows run 5×5–6 rather than fixed weekly loads. | 2026-10-18 |
| VDIP (`gzcl-vdip`) | Cody's [Volume-Dependent Intensity Progression](https://swoleateveryheight.blogspot.com/2016/11/volume-dependent-intensity-progression.html) post; compendium VDIP tab | exact to the blog. The compendium differs at the edges (T2 30 reps = +10 there, +5 here; T3 exactly 50 = +5 there, hold here). The sheet's optional day 5 is left out. | 2026-10-18 |
| UHF+ 5 Week (`gzcl-uhf-5wk`) | LiftVault: GZCL UHF Method + Heavy Singles (Sept 2018), UHF+ tab | exact. Every T1/T2 %, set and rep and the T3 set counts match. The sheet's week 6 (set a new TM) isn't scheduled. | 2026-10-18 |
| UHF 9 Week (`gzcl-uhf-9wk`) | GZCL Free Compendium (Nov 2016), UHF 9 Wk tab | exact for weeks 1–11. The sheet's week 12 (test openers on day 1) is a note, not scheduled. | 2026-10-18 |
| General Gainz Wave LP (`gzcl-gg-wave`) | GG Wave LP v1.2 sheet (/u/K-S-R, LiftVault) | approximation: the waves, rep maxes and half-sets match, with the text's increments (10 lb / 5 kg, OHP 5 lb / 2.5 kg). The sheet rounds the base load down to 2.5; here it's rounded to the nearest 2.5 lb / 1.25 kg. | 2026-10-18 |

## Wendler 5/3/1

| Program | Source | Status | Checked |
|---|---|---|---|
| 5/3/1 (`531`) | 5/3/1 (2009) / Beyond structure via the Wendler 5-3-1 v1.3 sheet (LiftVault); [jimwendler.com: Boring But Big](https://www.jimwendler.com/blogs/jimwendler-com/101077382-boring-but-big) | approximation: every percentage, AMRAP, the 90% TM and +5/+10 lb a cycle match. BBB stays 5×10 in the deload ("as normal"); FSL drops. The book's stall rule (back the TM off) is a note, not automatic. | 2026-10-18 |
| 5/3/1 for Beginners (`531-beginners`) | [thefitness.wiki: 5/3/1 for Beginners](https://thefitness.wiki/routines/5-3-1-for-beginners/) | exact: days, 5/3/1 + FSL 5×5, no deload, TM +5/+10 every cycle, push/pull/core 50–100 reps. The optional TM-test week is a note. | 2026-10-18 |
| 5/3/1 2-Day / 3-Day (`531-2-3day`) | 5/3/1 (2009) layouts (book, not public); Wendler 5-3-1 v1.3 sheet | approximation: percentages as 5/3/1. The layouts come from the book from memory; FSL as the default supplemental is from Beyond. | 2026-10-18 |
| 5's PRO + FSL / BBS / SSL (`531-fives-pro`) | 5/3/1 Forever (book, not public); [jimwendler.com: 5x5 FSL vs BBB](https://www.jimwendler.com/blogs/jimwendler-com/5x5-first-set-last-vs-boring-but-big) | approximation: 5's PRO, FSL/SSL 5×5 and BBS 10×5 at the usual percentages with an 85% TM. Forever's leader/anchor and 7th-week structure is a note. | 2026-10-18 |
| Building the Monolith (`531-monolith`) | [jimwendler.com: Building the Monolith](https://www.jimwendler.com/blogs/jimwendler-com/101078918-building-the-monolith-5-3-1-for-size) | approximation: every number on the page matches (waves, 5×5 / 3×5 / 20-rep sets, Friday press volume, assistance). The week-4 TM raise amount (+5/+10) is ours, since the page says only "adjust TM". | 2026-10-18 |
| BBB 3-Month Challenge (`531-bbb-challenge`) | [jimwendler.com: BBB 3 Month Challenge](https://www.jimwendler.com/blogs/jimwendler-com/boring-but-big-3-month-challenge) | approximation: prescribed reps only, BBB 50/60/70%, and one push, pull and ab movement a day all match. The page doesn't define a month, deloads or TM raises; we use the book's 4-week cycle with +5/+10 after each month. | 2026-10-18 |

## nSuns

| Program | Source | Status | Checked |
|---|---|---|---|
| nSuns LP 5-Day (`nsuns5`) | [LiftVault nSuns LP Complete Bundle](https://www.liftvault.com/programs/powerlifting/n-suns-lifting-spreadsheets/) (formulas); nSuns' r/Fitness post (archived) | exact: every T1/T2 set, AMRAP flag and the 1+ set table. The sheet gives "+5–10 / +10–15 lb" ranges only; upper lifts take the low end and lower lifts the high end, and kg increments are 2.5 kg. | 2026-10-18 |
| nSuns LP 4-Day (`nsuns-4day`) | same (4 Day LP tab); nSuns' reply in the original thread | exact: the 5-day tables minus the press day. OHP TM +5 lb when every Monday OHP rep is done (nSuns: "Yes exactly"). | 2026-10-18 |
| nSuns LP 6-Day squat (`nsuns-6day-squat`) | same (squat-focus tab) | exact: the 5-day week plus Saturday 8×3 @ 72.5% and 6×3 @ 56.25% (the sheet's formulas). | 2026-10-18 |
| nSuns LP 6-Day deadlift (`nsuns-6day-deadlift`) | same (6 Day Deadlift Focus tab) | exact: as the squat focus with Tuesday/Thursday swapped. | 2026-10-18 |

## Novice linear progressions

| Program | Source | Status | Checked |
|---|---|---|---|
| StrongLifts 5×5 (`stronglifts`) | [stronglifts.com](https://stronglifts.com/stronglifts-5x5/workout-program/) workout, failure and progress pages | exact: A/B, +5 lb a session (deadlift +10), three failed sessions at a weight → −10%. Switching the deadlift to +5 later is up to you (increment override). | 2026-10-18 |
| Starting Strength (`starting-strength`) | startingstrength.com Programs and "The Reset: Why and How" (archived) | approximation: phases 1–3 and the second-stall → 5% reset match. The later 5×3 switch and the bigger early jumps are notes. | 2026-10-18 |
| GreySkull LP (`greyskull`) | Johnny Pain's original post (quoted on LiftVault) | approximation: presses alternate, squat Mon/Fri, deadlift Wed, last set under 5 → −10%, curls / weighted chins. The 10+ double jump is from the e-book summaries (the post's FAQ says 15 reps → +10 lb). Bodyweight chins every day aren't tracked. | 2026-10-18 |
| Phrak's GSLP (`phrak-gslp`) | r/Fitness wiki (archived) | exact: the 6-session rotation, 3×5+, ≥15 total reps (raw), more than 10 → double, under 15 → −10%. | 2026-10-18 |
| Basic Beginner Routine (`reddit-bbr`) | [thefitness.wiki](https://thefitness.wiki/routines/r-fitness-basic-beginner-routine/) | exact: A/B, every lift 3×5+ including the deadlift, same rules as Phrak. Cardio is a note. | 2026-10-18 |
| Ice Cream Fitness 5×5 (`icf-5x5`) | LiftVault ICF page and its 1.0 calculator (a community revision) | approximation: lifts and increments match the calculator (deadlift +5, OHP +2.5, a lighter B-day row). Accessories add weight when complete; the sheet adds every other session. The sheet has no failure rule; 3 strikes → −10% is ours. | 2026-10-18 |
| Fierce 5 (`fierce5`) | the original bodybuilding.com post (2014 repost); fitnessvolt.com | exact: ABA/BAB, main lifts +5 lb upper / +10 lb lower a week, FitnessVolt's lineup (the 2014 original swaps in deadlift, reverse flies and leg curls). The source gives no failure rule; stalls are a note. | 2026-10-18 |
| AllPro Simple Beginner (`allpro`) | [LiftVault AllPro](https://liftvault.com/programs/bodybuilding/all-pro-simple-beginner-routine-program-spreadsheet/) + FAQ | exact: 100/90/80% days, reps 8→12 over 5 weeks, +10% only when both week-5 heavy sets reach 12. | 2026-10-18 |
| Madcow 5×5 (`madcow`) | Madcow's original "Linear 5x5" page (archived) | exact: 12.5% ramps, the Wednesday light squat, the Friday +2.5% triple and 1×8, +2.5% a week, a miss holds, open-ended. | 2026-10-18 |
| Bill Starr 5×5 (`bill-starr`) | breakingmuscle.com on *The Strongest Shall Survive*; LiftVault | approximation: the Big Three ramped 5×5, 80% / 90% days, OHP on Wednesday, raise only when the top set is made. Ramp spacing and jump sizes are LiftVault's. | 2026-10-18 |
| Texas Method (`texas-method`) | [startingstrength.com: The Texas Method](https://startingstrength.com/article/the_texas_method) (archived) | approximation: Monday 5×5 @ 90%, Wednesday 2×5 @ 80% of Monday, Friday 5RM, bench and press alternating, deadlift, cleans, chins and back extensions all match. Wednesday press at 81% and the Friday +5 lb are ours. | 2026-10-18 |
| Bromley's Simplest Beginner (`bromley-beginner`) | LiftVault sheet (Read Me and stage tabs) | approximation: stages 1 and 2 match; 4×6+ adds weight every completed session. 3×F uses double progression 8–12 (the source says "above 12 add, below 8 take off"). | 2026-10-18 |

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
| Candito 6 Week Strength (`candito6`) | Candito 6 Week Program.xlsx (formulas) + Candito 6 Week Strength Program.pdf | exact. Loads follow the sheet's formulas, MROUND(1RM×%) ± 5 lb. Covered rules: the 2.5% cut for a failed required rep (the PDF's later update says 5%), W2 MR10 rules, the W5 projection and the W6 options. The W2D3 back-off count (10/8/5×3 by MR10 reps) is a note, and 10×3 is always planned. | 2026-10-18 |
| Candito 6 Week Advanced Bench (`candito-adv-bench`) | LiftVault sheet (formulas); [Candito's explanation PDF](https://web.archive.org/web/20210815012557/http://www.canditotraininghq.com/app/download/963608244/Candito+Advanced+Bench+Program+Explanation.pdf) | approximation: every week matches. Ranges plan their low end (W3 bench 75–80% → 75%). The W4D2 bonus back-offs and the "drop max 2.5–5% and redo the set" rule are notes. | 2026-10-18 |
| Candito 9 Week Advanced Squat (`candito-adv-squat`) | LiftVault sheet (formulas) | approximation: every week and both checkpoint formulas match. The W8 "to 92.5%" top end plans at 90%. No Candito-authored squat PDF was found. | 2026-10-18 |
| Clarence0 14 Week (`clarence14`) | 14 Week Powerlifting by Clarence0 sheet + guide doc | exact: all sets, reps and RPEs for weeks 1–14. The 8RM/5RM sets also re-estimate the max, which the sheet only uses for strict press %. | 2026-10-18 |
| Calgary Barbell 16 Week (`complete16`) | Complete 16-week Program.xlsx = [LiftVault's Calgary Barbell 16-week sheet](https://liftvault.com/programs/powerlifting/calgary-barbell-16-week-8-week-program-spreadsheets/) | approximation: every set, rep, % and RPE matches. The weeks 12–15 back-offs are "% of E1RM" in the sheet but % of your max here (noted). "F"/"R" sets aren't defined in the sheet and are planned at the top-set RPE. | 2026-10-18 |

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
| Sheiko #29–#32 (`sheiko-29-32`) | ChaseT 2008 "Sheiko Training Collection" sheet ([LiftVault](https://www.liftvault.com/programs/powerlifting/sheiko-program-spreadsheets/)) | exact: every day, %, reps, sets and exercise order (scripted diff). "100–105% × 2–3 singles" is planned as 2×1 @ 100% plus a note. | 2026-10-18 |
| Sheiko #37 (`sheiko-37`) | same | exact. | 2026-10-18 |
| Sheiko Beginner (`sheiko-beginner`) | ChaseT "Sheiko Beginner" sheet | exact. Accessory "%" cells are read as effort notes (the sheet computes no weight for them). | 2026-10-18 |
| Sheiko Advanced Medium Load (`sheiko-aml`) | ChaseT "Sheiko AML" sheet | exact. Incline shoulder press is logged as incline bench, with a note. | 2026-10-18 |

## Specialization

| Program | Source | Status | Checked |
|---|---|---|---|
| Smolov Jr (`smolov-jr`) | [smolovjr.com](https://www.smolovjr.com/smolovjr/smolov-squat-program/); LiftVault Smolov Jr sheet | exact: 6×6/7×5/8×4/10×3 at 70–85%, with the week-2 and week-3 adds. smolovjr.com gives ranges (+5–10, +10–20 lb); the default "high" option is the top of them and "low" matches LiftVault (+5/+10). kg adds are conversions. | 2026-10-18 |
| Smolov (`smolov`) | [smolovjr.com Smolov Squat Routine](https://www.smolovjr.com/smolov-squat-routine/); LiftVault Smolov sheet | approximation: intro, base (+20/+30 lb), intense and the week-13 taper and test follow smolovjr.com; the intense days match both sources. The switching block follows LiftVault's sheet; sources disagree on it. | 2026-10-18 |
| Russian Squat Routine (`russian-squat`) | [StrengthLog](https://www.strengthlog.com/russian-squat-routine/) | exact: 3 days a week for 6 weeks, every session's sets × reps @ %, ending at 105%. | 2026-10-18 |
| Coan–Phillipi Deadlift (`coan-phillipi`) | [elitefts](https://elitefts.com/blogs/training/manipulating-a-training-program) (2008); LiftVault sheet; Fitness Volt (assistance) | approximation: every heavy and speed %, set count and rest matches. LiftVault rounds up (CEILING) where we round to nearest (≤5 lb). Shrugs are rescaled onto the goal max. Weeks 7–9 assistance follows Fitness Volt (elitefts says shrugs only). | 2026-10-18 |
| Magnusson–Ortmayer Deadlift (`magnusson-ortmayer`) | [LiftVault Mag/Ort (corrected 10 lb)](https://liftvault.com/programs/powerlifting/magnusson-ortmayer-magort-deadlift-program-spreadsheet/) | exact: 11 weeks plus the optional week-12 test, the +10 lb (5 kg) steps, rest weeks 4 and 8, and MROUND rounding. "Miss the 8+ set → repeat the week" is a note. | 2026-10-18 |
