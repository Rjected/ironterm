# Ironterm for Android

Native Android app and home-screen widgets for your training log: log workouts in the gym
(offline-first, rest timer in the notification shade), see the next planned session with exact
weights, lift e1RMs, history, calendar, program, body readiness, insights and stats. Terminal
look: black, monospace, amber accent, with native touch: big steppers, bottom sheets,
pull-to-refresh, haptics.

Uses the Hevy public API; not affiliated with Hevy.

Screenshots: [`docs/screens/android/`](../docs/screens/android/). The JVM screenshot tests render one
PNG per screen and state (`today*`, `gym_*`, `lift*`, `history*`, `workout_*`, `calendar*`,
`program*`, `body*`, `insights`, `stats`, `more`, `setup*`, `gallery`, `direct_*`, `state_*`,
`update_*`, `widget_*`; `_360` = 360 dp wide, `_full` = whole scroll). `emulator_*` are from a real
Pixel emulator driven against a local server.

The server computes, the app renders: the program engine and analytics stay in TypeScript on the
server and reach the app as one ready-to-render document per screen (`GET /api/app/*`, contract in
`web/shared/appapi.ts`, fixtures in `docs/api/app/`). The only logic ported to Kotlin is the live gym
session (`web/shared/live.ts` → `gym/Live.kt`), because GYM has to work offline.

## Two data sources (pick either, switch any time)

| | **Server** | **Direct** |
|---|---|---|
| Needs | an Ironterm server URL + app token (`ht_…`) | only a Hevy API key (Hevy Pro → hevy.com Settings → Developer) |
| Talks to | `<server>/api/app/*`, `/api/snapshot`, `/api/live` (Bearer token) | `https://api.hevyapp.com/v1/workouts` (header `api-key`) |
| TODAY, LIFTS (+ detail), HISTORY (+ detail), graph, widgets | ✓ | ✓ (computed on the phone) |
| GYM | program day with targets, or empty workout; synced to the server, FINISH via the server | empty workout from exercises in your Hevy history; FINISH posts to Hevy `POST /v1/workouts` |
| Program, calendar, body, insights, stats, stall detection, projections | ✓ | – ("needs a server" screen) |
| Edit workout notes | ✓ | – |

Both produce the same `Snapshot` model for TODAY and the widgets, and the same `App*` documents for
the other screens (`data/direct/DirectApp.kt` builds them in Direct mode) (`docs/api/README.md`, `web/shared/snapshot.ts`), so the UI and
widgets don't care which one is active. Direct mode computes graph levels as quartiles of
training-day volume, the weekly streak against a goal you set (default 3/week), and e1RM with
Epley `w × (1 + reps/30)` on 1–12 rep working sets. It caches workouts on the phone and only fetches
new pages on refresh (a full re-fetch once a day picks up edits and deletions).

Credentials are stored in EncryptedSharedPreferences. The last snapshot is cached on disk, so the
app and widgets work offline. Refresh: on app open, on any widget tap (opens the app), the ↻ button,
and WorkManager every 30 minutes while connected.

## Connecting

**Server, scan a QR (easiest):** in the web app open **F10 SETUP → APPS & WIDGETS → New app token**;
it shows a QR code. In the app tap **▣ SCAN QR CODE** (on the first screen, and in SETUP → SERVER) and
point the camera at it. The QR holds the same `ironterm://connect?…` link as below, so it goes through
the same parser and flow: SETUP fills in, connects, syncs and switches to TODAY. Anything else
("That QR isn't an Ironterm connect code.") is rejected. The scanner is Google's code scanner from
Play services: the app needs no camera permission. On phones without Google Play services, or while
Play services is still downloading the scanner module, the app says so; use the fields instead.

**Server, one tap on the phone:** in the web app open **F10 SETUP → APPS & WIDGETS → New app token** and tap
**Open in app**. That opens

```
ironterm://connect?server=<urlencoded origin>&token=ht_…
```

which fills in SETUP, connects, syncs and switches to TODAY.

**Server, by hand:** SETUP → SERVER → paste the URL and token → TEST → SAVE & CONNECT.

**Direct:** SETUP → DIRECT → paste the Hevy API key, choose KG/LB and the weekly goal → SAVE & CONNECT.

If the server answers 401 the app shows "Token revoked or invalid. Reconnect." and keeps showing
the last good data. Every screen document is cached on disk (`files/appcache/`), so screens open
instantly and work offline with an "offline · showing …" strip.

**Advanced setup (web):** choosing a program, its options and mapping lifts to Hevy exercises stay in
the web app. SETUP → PROGRAM & LIFTS → *Advanced setup (web)* opens it in a Custom Tab. That link is
the app's only web surface.

## Screens

Bottom bar: **TODAY · GYM · LIFTS · HISTORY · MORE**. Details push on top of their tab (system back
pops them).

- **TODAY**: workout in progress (resume), next session with weights (tap → GYM), this week, streak,
  readiness (→ BODY), watch list (stalls / progress, → lift), recent PRs, a 26-week graph (→ HISTORY
  for the year), the e1RM table (now / 4w / 12w / best), last workout. Pull to refresh.
- **GYM**: see below.
- **LIFTS**: every lift with e1RM, best, status and a sparkline. **Lift detail**: KPIs, e1RM chart
  (28-day best as a line, each session as a dot; 1Y/3Y/ALL; drag to scrub with a haptic tick per point, pinch to
  zoom, double-tap to reset; projection band), status (stall detector), 12-week projection, rep PRs
  1–12, PR wall (how long each record has stood), your RPE chart as loads at today's e1RM, recent
  sessions with sets (→ workout). Bodyweight lifts chart reps.
- **HISTORY**: the year graph on top (tap a day to filter, it pages back until it finds it), search
  (title or exercise, server-side), an infinite list grouped by week. **Workout detail**: stats,
  how the program counted it, every set with RPE and e1RM; **EDIT NOTES** (bottom sheet) saves the
  workout and exercise notes to Hevy via `PUT /api/workouts/{id}/notes`.
- **MORE**: CALENDAR (month grid with done / planned / missed / travel / today, swipe or ‹ › to
  change month, tap a day for a sheet with its workouts and plan, this week, trips) · PROGRAM (slots
  with tier, scheme, stage dots, weight, note and the ▲ success / ▼ fail next step, upcoming sessions, decision log, **PUSH TO HEVY**) · BODY
  (the server's SVG figures rendered natively with AndroidSVG, READINESS / WEEKLY LOAD toggle with a legend in the figure's own colour
  scale, every muscle by its short name with bars; tap one for its full name, sets and range) · INSIGHTS (projections, strength balance ratios on a range bar,
  achievements: recent and up next with progress) · STATS (totals, weekly volume and sessions bars,
  1Y/2Y, cardio) · SETUP.
- **SETUP**: connection (QR, server, Direct), sync, **GYM** preferences (keep screen on, rest sound,
  rest vibration, default rest), Advanced setup (web), widget theme and gallery, updates, about.

Every screen has loading, error (with RETRY), empty, offline-cached and Direct-mode ("needs a
server") states.

## GYM

- **Start**: the next program day with its plan and a plate loader per barbell lift, chips to pick
  another day, or START EMPTY WORKOUT. The server builds the session (`POST /api/app/gym/start`) and
  the app owns it from then on. A session started on the web is resumed. Offline, the next program day
  starts from the cached `plan` (the server's full PlannedSession) with the same `sessionFromPlan`
  the server runs, or an empty one, and uploads later. Direct mode: empty workout only.
- **Logging**: one card per exercise, the current one open and outlined. The focused set has big
  − / + steppers (load step per equipment: 5 lb / 2.5 kg barbell, 5 lb / 2 kg dumbbells, 2.5 machine);
  tap the number for a terminal number pad (first key replaces). Optional RPE (6–10), set type
  (warmup / normal / failure / drop), **✓ DONE SET** (56 dp). Each set row has a 48 dp done/undo
  toggle; tap a row to edit it. Plate loader (plates per side, drawn on a bar). Program notes and the
  ▲ ifSuccess / ▼ ifFail lines. + SET, remove set, remove exercise (non-program), per-exercise note,
  workout note, rename the workout. ADD EXERCISE opens a searchable sheet: cardio, the lift library,
  other Hevy exercises (server) or your Hevy history (Direct).
- **Rules** (ported from `live.ts`, unit-tested against the TS output): warmup ramp before heavy
  barbell T1/MAIN sets; completing a set starts the rest timer (warmups capped at 60 s, none after the
  last set of the workout); back-off sets keyed to the top set ("% of top") get their load from that
  set's e1RM, rounded to the load step; progress counts work sets only.
- **Rest timer**: banner with −15 / +30 / SKIP that turns amber "GO +0:12" when over. A foreground
  service (`RestTimerService`, type `specialUse`) keeps an ongoing notification for the whole
  session: countdown chronometer, next set ("Next: Deadlift · Set 3/5 · 225 lb × 5"), **+30s** and
  **Skip** actions while resting, **Set done** otherwise; public on the lock screen. When rest ends it
  vibrates and beeps (three tones like the web app): silent mode → nothing, vibrate mode → vibration
  only, and each is a SETUP toggle. A partial wake lock is held only for the length of a rest so the
  alert fires with the screen off.
- **Screen**: kept on while a session is open (SETUP toggle).
- **Offline-first**: every change is written to `files/gym_session.json` first, then queued in
  `files/gym_outbox.json` and sent debounced (0.7 s) as `PUT /api/live`; PUTs coalesce, DISCARD
  (confirmed in a sheet) queues `DELETE /api/live`, FINISH queues `POST /api/live/finish` (Direct:
  `POST /v1/workouts`). Network errors retry with backoff (2 s … 60 s) and a WorkManager job runs
  them when the network is back, even after the app was killed. FINISH is idempotent per session id on the
  server, so a retry after a lost response can't create a duplicate; a 409 ("still being saved") is
  retried, never shown as a failure. A FINISH the server refuses (e.g. an unmapped lift) stops
  retrying after a few tries and shows RETRY / EDIT SESSION / DROP. The session survives process
  death; the timer service and its alert come back on the next open.
- **Finish**: a sheet with sets, volume and time, SAVE TO HEVY / KEEP GOING / DISCARD; then a summary
  (saved, saved on this phone and queued, or not saved) with the PRs the server reports for the
  workout; while it's still queued, the phone's own estimate (sets whose e1RM beats the last known
  best) is shown and marked as such.## Widgets

Long-press the home screen → Widgets → Ironterm, or use SETUP → Widget gallery → Add to home screen.
Each one adapts to its size (measured on a Pixel 7 launcher: 2×2 ≈ 176×222 dp, 4×2 ≈ 367×222 dp).

| Widget | 2×2 | 4×1 / 4×2 | 4×3+ | Options |
|---|---|---|---|---|
| **Ironterm · Activity** | last 16 weeks + streak | 26 weeks + streak, week, 52-week sessions | full year with months, week strip, stats | colour theme (Blue = Terminal, Green, Purple, Orange) |
| **Ironterm · Next workout** | day, when, top lifts with weights | every exercise's one-line summary | + this-week strip | – |
| **Ironterm · This week** | done/target ring + streak | Mon–Sun strip with statuses | | – |
| **Ironterm · Lifts** | one lift: e1RM, delta, trend | big four 2×2 with deltas + trends | up to 8 with sparklines | which lift the 2×2 shows |
| **Ironterm · Recovery** | overall readiness gauge | least-ready muscles with bars | more muscles | – |
| **Ironterm · Gym** (2×1) | exercise, set, load, live rest countdown | same, wider | | – |

The Gym widget reads the live session on the phone (no network) and ticks with a RemoteViews
Chronometer; tapping it opens GYM.

Tapping a widget opens the matching screen and refreshes. Options: long-press the widget →
reconfigure (Android 12+; older versions ask when you place the widget).

## Build and install

Requirements: JDK 17 and the Android SDK (platform 35). From `android/`:

```sh
export JAVA_HOME=$(/usr/libexec/java_home -v 17)   # macOS
./gradlew assembleDebug testDebugUnitTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

With several devices attached use `adb -s <serial> install -r …`. Package: `dev.ironterm`.

## Updates (over the air)

The app updates itself from GitHub Releases, no USB needed:

- CI publishes a release tagged `android-v<versionCode>` (e.g. `android-v57`) with an asset named
  `ironterm-*.apk`, signed with the release key. The release notes are the changelog.
- On app open (at most every 6 hours) and from SETUP → UPDATES → **CHECK FOR UPDATES**, the app reads
  `GET https://api.github.com/repos/<repo>/releases/latest` and offers the update only when the tag's
  versionCode is higher than the installed one. An amber banner shows "UPDATE AVAILABLE: v57 · UPDATE"
  with the first line of the changelog.
- UPDATE downloads the APK and hands it to Android's installer, which always asks you to confirm.
  The first time, Android asks you to allow Ironterm to "install unknown apps"; the banner opens that
  settings page and the update continues when you come back.
- Forks: set `IRONTERM_UPDATE_REPO=owner/repo` (env var or `-PIRONTERM_UPDATE_REPO=…`) when building so
  the app follows your releases. The default is `Rjected/ironterm`. The repo must be public, because
  the app calls the API without a token. GitHub allows 60 unauthenticated requests per hour per IP; a
  rate-limit answer just shows "try again later".
- **Signatures:** Android only installs an update signed with the same key. Debug builds (local
  `assembleDebug`) use your machine's debug key, so the first release-signed build installs over a
  debug build only after you **uninstall the debug build once**, which also clears the app's settings.
  After that, every release updates in place.

Release build inputs (all optional; without them `assembleRelease` gives an unsigned APK):

| Env var / Gradle property | Use |
|---|---|
| `IRONTERM_KEYSTORE`, `IRONTERM_KEYSTORE_PASSWORD`, `IRONTERM_KEY_ALIAS`, `IRONTERM_KEY_PASSWORD` | sign the `release` build |
| `IRONTERM_VERSION_CODE` (int, default 2), `IRONTERM_VERSION_NAME` (default `2.0`) | version, shown in SETUP |
| `IRONTERM_UPDATE_REPO` (default `Rjected/ironterm`) | where the updater looks |

## Tests

`./gradlew testDebugUnitTest` (JVM, Robolectric, no device needed):

- `LiveTest`: the Kotlin port of `live.ts` replayed against golden output of the real TypeScript
  (`app/src/test/resources/live_golden.json`, generated by bundling `live.ts` with esbuild and running
  it in node): every step's session, cursor and progress for a GZCLP day, back-offs keyed to the top
  set in lb and kg (barbell, dumbbell, machine), an empty session with cardio and drop sets, the
  Hevy body, warmup ramps, session titles and `sessionFromPlan`; plus rest cap, rest controls,
  plates, summary and JSON round trip.
- `GymStoreTest`: disk persistence, debounced coalesced PUTs, offline → online retries, process
  death (a fresh store on the same files), FINISH queued offline then uploaded, a refused FINISH,
  DISCARD, revoked token, adopting a server session, and the pure outbox rules.
- `AppModelsTest`: every `/api/app` fixture (`app/src/test/resources/app/`, copies of
  `docs/api/app/`) parses, checked field by field. `AppApiTest`: every endpoint against
  MockWebServer (paths, query, Bearer header, request bodies, 4xx/5xx/network errors).
  `DirectGymTest`: Direct-mode FINISH posts the right body to Hevy.
- `DirectAppTest`: Direct-mode documents (lifts, detail, home, history paging/search, exercise
  catalog), notification text, the silent-mode rule, PR lines, deep-link targets.
- `SnapshotParseTest`, `DirectAggregatorTest`, `DeepLinkTest`, `UpdateTest`, `ConnectCodeTest`,
  `NetworkTest`: as before (snapshot, Direct aggregation, deep links, updater, QR, Server/Direct
  refresh end to end).
- `ScreenshotTest` (Robolectric + Roborazzi, 411 dp and 360 dp): every screen and state in Server
  and Direct mode, GYM mid-workout with the rest timer, sheets (finish, discard, add exercise,
  keypad, notes, calendar day) and the finish summaries, and every widget at every size through
  the real Glance → RemoteViews → View path. Writes PNGs to `docs/screens/android/` and the
  widget-picker previews to `app/src/main/res/drawable-nodpi/widget_preview_*.png`.

To drive GYM against a local server on an emulator: run the web server (`web/`: `pnpm build:node`,
then `PORT=8790 HOST=127.0.0.1 DATA_DIR=<dir> SYNC_MINUTES=0 node dist/server/main.mjs`), create a
token with `POST /api/tokens`, `adb reverse tcp:8790 tcp:8790`, and open
`ironterm://connect?server=http%3A%2F%2F127.0.0.1%3A8790&token=<token>`. (A login-less demo server
only answers requests addressed to localhost, so `10.0.2.2` gets a 403.)

## Code map

`dev.ironterm.data` (Snapshot model, server client, refresher, settings, cache, deep link) ·
`data.app` (`/api/app` models, client, disk cache, repository) · `gym` (live-session port, lift
library generated from `web/shared/lifts.ts`, store + outbox, rest-timer service, Gym widget) ·
`data.hevy` (Hevy API client) · `data.direct` (Direct-mode aggregation, workout cache, lift table
generated from `web/shared/lifts.ts`) · `ui` (Compose screens, components and charts, navigation, ViewModel, MainActivity, widget
options) · `widget` (Glance widgets, layouts, bitmap renderers, catalog) · `work` (WorkManager).
The product name lives in `Brand.kt` and `res/values/strings.xml` (`app_name`).
