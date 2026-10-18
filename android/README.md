# Ironterm for Android

Native Android app and home-screen widgets for your training log: a year-long contribution
graph, the next planned session with exact weights, this week, lift e1RMs and muscle recovery.
Terminal look: black, monospace, amber accent.

Uses the Hevy public API; not affiliated with Hevy.

Screenshots: [`docs/screens/android/`](../docs/screens/android/) (`app_*`, `direct_*`, `state_*`,
`widget_*` are rendered by the JVM screenshot tests; `emulator_*` are from a real Pixel 7 emulator).

## Two data sources (pick either, switch any time)

| | **Server** | **Direct** |
|---|---|---|
| Needs | an Ironterm server URL + app token (`ht_…`) | only a Hevy API key (Hevy Pro → hevy.com Settings → Developer) |
| Talks to | `GET <server>/api/snapshot` (Bearer token) | `GET https://api.hevyapp.com/v1/workouts` (header `api-key`, read only) |
| Graph, streak, this week, totals, last workout, lift e1RMs | ✓ | ✓ (computed on the phone) |
| Program / next session with weights | ✓ | – |
| Recovery (BODY tab, Recovery widget) | ✓ | – ("needs server" placeholder) |
| WEB tab (full web app, signed in) | ✓ | – |

Both produce the same `Snapshot` model (`docs/api/README.md`, `web/shared/snapshot.ts`), so the UI and
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
the last good data.

## Screens

TODAY (next session, re-entry badge, this week, streak, readiness, last workout) · GRAPH (53-week
graph, scrolls, opens on today, tap a day for its volume, totals) · LIFTS (e1RM cards with 12-week
sparklines and 28-day deltas) · BODY (readiness per muscle, least ready first) · WEB (the web app,
signed in by POSTing the token to `/auth/app`; links to other sites open in the browser) · SETUP
(source, test, sync status, widget theme, **Widget gallery**: every widget at every size, with
"Add to home screen").

## Widgets

Long-press the home screen → Widgets → Ironterm, or use SETUP → Widget gallery → Add to home screen.
Each one adapts to its size (measured on a Pixel 7 launcher: 2×2 ≈ 176×222 dp, 4×2 ≈ 367×222 dp).

| Widget | 2×2 | 4×1 / 4×2 | 4×3+ | Options |
|---|---|---|---|---|
| **Ironterm · Activity** | last 16 weeks + streak | 26 weeks + streak, week, 52-week sessions | full year with months, week strip, stats | colour theme (Blue = Terminal, Green, Purple, Orange) |
| **Ironterm · Next workout** | day, when, top lifts with weights | every exercise's one-line summary | + this-week strip | – |
| **Ironterm · This week** | done/target ring + streak | Mon–Sun strip with statuses | | – |
| **Ironterm · Lifts** | one lift: e1RM, delta, trend | big four 2×2 with deltas + trends | up to 8 with sparklines | which lift the 2×2 shows |
| **Ironterm · Recovery** | overall readiness gauge | least-ready muscles with bars | more muscles | – |

Tapping a widget opens the matching tab and refreshes. Options: long-press the widget →
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

- `SnapshotParseTest`: the sample snapshot fixture (`app/src/test/resources/snapshot.sample.json`,
  a copy of `docs/api/snapshot.sample.json`), round trip, unknown fields and missing sections.
- `DirectAggregatorTest`: quartile levels, Epley, week streak, time zones, a full snapshot from
  synthetic workouts, kg → lb.
- `DeepLinkTest`: `ironterm://connect` parsing and server URL normalisation.
- `UpdateTest`: release JSON parsing (tag `android-v<n>`, `ironterm-*.apk` asset), newer/same/older,
  bad tags, no APK, and the GitHub check against MockWebServer (403/429 rate limit, 404, 500).
- `ConnectCodeTest`: scanned QR text: a valid connect link connects, anything else is rejected.
- `NetworkTest`: a MockWebServer that only answers the right Bearer token / `api-key`; Server mode end
  to end, a revoked token (401 keeps the cache and flags "reconnect"), Direct mode paging
  (pageSize 10) and incremental refresh.
- `ScreenshotTest` (Robolectric + Roborazzi, 411 dp phone): every tab in Server and Direct mode,
  empty/loading/error states, and every widget at every size rendered through the real Glance →
  RemoteViews → View path. Writes PNGs to `docs/screens/android/` and the widget-picker previews to
  `app/src/main/res/drawable-nodpi/widget_preview_*.png`.

## Code map

`dev.ironterm.data` (Snapshot model, server client, refresher, settings, cache, deep link) ·
`data.hevy` (Hevy API client) · `data.direct` (Direct-mode aggregation, workout cache, lift table
generated from `web/shared/lifts.ts`) · `ui` (Compose screens, ViewModel, MainActivity, widget
options) · `widget` (Glance widgets, layouts, bitmap renderers, catalog) · `work` (WorkManager).
The product name lives in `Brand.kt` and `res/values/strings.xml` (`app_name`).
