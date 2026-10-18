# Ironterm (web)

A Bloomberg-style training terminal for your Hevy data: a Preact UI plus a small API. It runs as one Cloudflare Worker backed by D1, or on any box with Node + SQLite (see [SELF_HOSTING.md](SELF_HOSTING.md)).

> Unofficial. Uses Hevy's public API with your own key; not affiliated with Hevy.

- **F1 DASH**: contribution graph, KPIs, next session, e1RM table, trends
- **F2 GYM**: live session mode. Log sets with rest timers and plate math, then finish to save the workout to Hevy
- **F3 CAL**: schedule, history, trips
- **F4 PROG**: the active program, every slot's stage/weight, decision log, push routines to Hevy
- **F5 LIFTS**: per-lift e1RM history, rep PRs, stalls, personal RPE chart
- **F6 STATS**: volume, cardio, calisthenics, achievements
- **F7 INSIGHTS**: projections, landmarks, recovery vs performance, e1RM formula shootout, INOL, ratios, PR wall, program what-if
- **F8 BODY**: muscle load and recovery map
- **F9 HIST**: every year as a graph, searchable workout list
- **F10 SETUP**: program picker (60 templates), options, lift mapping, settings, apps & widgets

The command line takes `SQ`, `BENCH`, `PROG`, `SYNC`, `PUSH`, and so on. Press `/` to focus it, and `F1`–`F10` to switch views.


> **Not on Cloudflare?** The same app runs on any box with Docker or Node + SQLite: see [SELF_HOSTING.md](SELF_HOSTING.md). The Android/iOS apps connect to either (SETUP → APPS & WIDGETS), or work standalone with just a Hevy API key.

## Run locally

```bash
pnpm install
cp .dev.vars.example .dev.vars   # add HEVY_API_KEY, or leave it blank for demo data
pnpm dev                         # http://localhost:5173
```

`pnpm dev` runs the app as the Node server with SQLite in `./data` (tables are created on first request) and reloads the page when you save a file. Hit **SYNC** (or `curl -X POST localhost:5173/api/sync`) to backfill your history.

## How data flows

```
Hevy app ──save workout──▶ webhook POST /api/hevy/webhook ──▶ GET /v1/workouts/{id} ──▶ D1
           (backup)  cron */15 ──▶ GET /v1/workouts/events?since=… ──▶ D1 (edits + deletes)

D1 workouts ──replay──▶ program state ──PUSH──▶ Hevy routines (one per day, weights filled in)
```

The program never stores "current weights". It replays your Hevy history from the program's start date, so editing or deleting a workout in Hevy just changes the replay. Replay **follows the lifter**:
- Working sets are the ones at your main weight, so warmups logged as normal sets are ignored.
- Your next weight builds from what you actually lifted.
- The stage is inferred from the sets you did (six doubles = 6×2+).
- A session that doesn't resemble the scheme, like 3×10 on a T1 day, is logged as "off-scheme" and not counted as a failure.

With **auto-update** on (Setup), the Worker re-pushes routines after every new workout, so the routine you open in Hevy always has the right weights.

## Deploy (Cloudflare)

```bash
cp wrangler.example.jsonc wrangler.jsonc   # your own config; gitignored
pnpm wrangler d1 create ironterm           # paste the id into wrangler.jsonc
pnpm wrangler secret put HEVY_API_KEY
pnpm wrangler secret put SESSION_SECRET    # any long random string
pnpm wrangler secret put WEBHOOK_SECRET    # any long random string
pnpm run deploy                           # not `pnpm deploy`: that is a pnpm built-in
```

`pnpm wrangler` installs Cloudflare's CLI into `deploy/` from its own lockfile the first time you use it. Developing, testing and self-hosting don't need it.

Then choose **one** way to log in. With none configured, the Worker refuses to serve data anywhere but localhost.

### a) Google sign-in in the app (works on any domain)

1. Google Cloud → APIs & Services → Credentials → **OAuth client ID → Web application**. Add the redirect URI `https://<your domain>/auth/callback`.
2. Put the client ID in `GOOGLE_CLIENT_ID` and your email(s) in `ALLOWED_EMAILS` in `wrangler.jsonc`. Then run `pnpm wrangler secret put GOOGLE_CLIENT_SECRET`, and redeploy.

Sessions are a signed cookie (30 days).

**Custom domain whose DNS isn't on Cloudflare** (e.g. registrar DNS): a Worker custom domain needs a Cloudflare zone, but Pages doesn't. [`../gym-proxy`](../gym-proxy) is a tiny Pages project that hands every request to this Worker over a service binding.
- Deploy it: set the service name in its `wrangler.jsonc`, then `pnpm deploy:pages`.
- Add your hostname under the Pages project's Custom domains.
- At your DNS host, add `CNAME <sub> → <project>.pages.dev`.

### b) Cloudflare Access in front

1. Zero Trust → Settings → Authentication → add **Google** (or any IdP).
2. Zero Trust → Access → Applications → **Add self-hosted app** for your Worker's hostname. Policy: *Allow* → Emails → you.
3. Copy the app's **Application Audience (AUD) tag** into `ACCESS_AUD` and your team domain (`<team>.cloudflareaccess.com`) into `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`, then redeploy.

The Worker also verifies Access's signed JWT on every request, so a request that somehow skips Access still gets a 403. Hevy's webhook can't log in through Access. Deploy the separate receiver (`cp wrangler.hooks.example.jsonc wrangler.hooks.jsonc`, `pnpm deploy:hooks`), which answers only the signed webhook endpoints.

### c) Password

`pnpm wrangler secret put APP_PASSWORD`. That gives a simple password screen.

### Hevy webhook (optional, instant sync)

Hevy → Settings → Developer → Webhooks:

- URL: `https://<your domain or hooks worker>/api/hevy/webhook`
- Authorization header: `Bearer <WEBHOOK_SECRET>`

Without it, the 15-minute cron still picks everything up.

## Programs

Programs are plain data in `shared/programs/*.ts`, run by the engine in `shared/program.ts`. Each template has:

- **days**: the rotation (GZCLP: A1 B1 A2 B2). 3-day vs 4-day only changes how many per week.
- **slots**: a lift + tier + one of two progression kinds:
  - `stages`: a list of schemes (5×3+ › 6×2+ › 10×1+), a success rule (`baseVolume` or `amrapAtLeast`), and what happens when the last stage fails (`retest` at a % of a new RM, `reset` to stage 1 a few increments up, or `hold`). This covers GZCLP, GZCL-style, StrongLifts/5×5, Texas-method-ish linear progressions.
  - `percent`: sets as % of a training max, optionally a different table per week (5/3/1 waves) and an AMRAP rule that bumps the TM (nSuns). Program-level `cycle` handles once-per-cycle TM increases.
- **options**: dropdowns the setup screen renders (scheme variants, supplemental work).
- **defaults**: starting values to prefill.

To add one from a spreadsheet: send the sheet and it becomes a new file in `shared/programs/` plus an entry in `TEMPLATES`. Lifts come from `shared/lifts.ts`; add new ones there with their Hevy exercise names.

### Included (60)

Every template's `source` field says where its numbers came from; Setup shows it on the card.

- **GZCL:** GZCLP, Jacked & Tan 2.0, The Rippler, VDIP, UHF (5- and 9-week), GG Wave LP, GZCL Method base
- **Novice:** Bromley Simplest Beginner, StrongLifts 5×5, Starting Strength (phases 1–3), GreySkull LP, Phrak's GSLP, Reddit BBR, Ice Cream Fitness 5×5, Fierce 5, AllPro, Bill Starr 5×5, Ivysaur 4-4-8, 5/3/1 for Beginners
- **Strength:** 5/3/1 (BBB/FSL), 5/3/1 2-/3-day, 5's PRO, nSuns 4/5/6-day, Madcow 5×5, Texas Method, Candito Linear, Candito 6-Week, Candito Advanced Bench, Candito 9-Week Squat, Nuckols High Frequency, SBS Strength (RTF / RIR)
- **Hypertrophy:** German Volume Training, Arnold Split, Reddit PPL, PHUL, PHAT, Lyle's GBR, Building the Monolith, BBB 3-Month Challenge, SBS Hypertrophy, SBS Novice Hypertrophy
- **Powerlifting:** Sheiko #29–32 / #37 / Beginner / Advanced Medium Load, Juggernaut 2.0, Calgary Barbell 8- and 16-week, RTS Generalized Intermediate, Clarence0 14-week
- **Peaking:** Smolov (full), Smolov Jr, Russian Squat Routine, Coan–Phillipi, Magnusson–Ortmayer

Built straight from the programs' own spreadsheets: GZCLP, Candito 6-Week, Clarence0, Calgary 16, SBS (intensity / rep / adjustment tables), nSuns 4-day (and 5-day verified), 5/3/1 (verified). Built from memory or secondary copies (worth a sanity check before running): GreySkull, Ice Cream Fitness, Madcow, PHAT, 5's PRO. Not built: Cody's own General Gainz (no fixed loads), 5/3/1 Krypteia (layout only in the paid book), Nuckols' 28 programs (behind an email signup), Inverted Juggernaut ("as many sets as you can" isn't expressible yet). Downloaded but not yet built: Candito Deadlift, Kizen, Hepburn, Bulgarian Method, Dr Swole PPLUL, HST, 5/3/1 365.

Lifts without a Hevy catalog exercise (pause deadlift, Spoto press, board press, snatch-grip deadlift, safety-bar squat): create a custom exercise in Hevy and map it in Setup › Lift mapping. Timed holds (side plank) aren't matched yet because Hevy logs them as duration.

## Hevy API notes (vs the docs)

- `GET /v1/workouts` caps `pageSize` at 10.
- `GET /v1/routine_folders` returns its list under `routines`, not `routine_folders`.
- Bodyweight sets have `weight_kg: null`.
- `POST /v1/routines` response shape varies; the client accepts `{routine: {...}}`, `{routine: [...]}` or a bare object.
