# Ironterm for iOS

A native SwiftUI app plus home-screen and lock-screen widgets for Ironterm, in the same terminal
style as the web app: black background, monospace type, amber accent, blue graph ramp.

Uses the Hevy public API; not affiliated with Hevy.

![Today](../docs/screens/ios/today.png)

## Two data sources

You pick one in **SETUP** and can switch at any time.

| | **Server** | **Direct** |
|---|---|---|
| Needs | Your Ironterm server URL + an app token (`ht_…`) | A Hevy API key (hevy.com → Settings → Developer) |
| Reads | `GET /api/snapshot` (see [docs/api](../docs/api/README.md)) | `api.hevyapp.com/v1/workouts`, 10 per page |
| Graph, streak, this week, totals, last workout | ✓ | ✓ computed on the phone |
| Lift e1RMs, 12-week trend, 28-day Δ | ✓ | ✓ (Epley, w·(1+r/30), lifts recognised by Hevy exercise name) |
| Next session with exact weights | ✓ | — (programs live on the server) |
| Recovery / readiness | ✓ | — (shows "needs server") |
| WEB tab (the full web app, signed in) | ✓ | — |

Direct mode settings: unit (kg/lb) and the sessions per week the streak counts. The first Direct
sync reads every workout; after that the app and widgets fetch only new pages. **FULL RESYNC**
re-reads everything (picks up deletions).

## Connecting to a server

1. In the web app: **F10 SETUP → APPS & WIDGETS → New app token**.
2. Connect the phone, any of three ways. Each ends in the same confirmation sheet showing the
   server, and nothing is saved until you tap CONNECT:
   - **Scan the QR code**: SETUP → **SCAN QR** (shown at the top while not connected, and in the
     Server section). It uses VisionKit's live scanner, or an AVFoundation scanner where that isn't
     available, and asks for camera access the first time. The code contains exactly the connect
     link below; anything else shows *That QR isn't an Ironterm connect code.* Devices without a
     usable camera (and the simulator) show the button disabled with a hint. The system Camera app
     also opens the code, since it is an `ironterm://` link.
   - **Open in app** on the phone itself, which opens
     `ironterm://connect?server=<urlencoded origin>&token=<ht_…>`.
   - **Manually**: paste the URL and token into SETUP, tap **TEST**, then **SAVE & SYNC**.

A revoked token shows *Token revoked or invalid. Reconnect.* with a button to SETUP; the last
synced data stays visible. Plain `http://` works for LAN addresses (`NSAllowsLocalNetworking`);
public servers need https.

## The app

`F1 TODAY` next session (when, re-entry badge, every exercise with its sets and top weight), this
week, streak, readiness, last workout · `F2 GRAPH` 53-week contribution graph, totals, sessions per
week · `F3 LIFTS` e1RM cards with Swift Charts trends · `F4 BODY` per-muscle recovery ·
`F5 WEB` the web app in a WKWebView, signed in by POSTing the token to `/auth/app`; links to other
sites open in Safari · `F6 SETUP` source, credentials, test, sync, graph theme, **widget gallery**.

Credentials are stored in the Keychain (access group = the App Group, so the widgets can read
them, `AfterFirstUnlockThisDeviceOnly`). The last snapshot is cached in the App Group container so
widgets work offline.

## Widgets

All widgets fetch on their own about every 30 minutes (they share one network request), and the
app reloads them after every sync. Tapping a widget opens the matching tab.

| Widget | Sizes | Options |
|---|---|---|
| **Activity** | small (14 weeks), medium (26 weeks + stats), large (53 weeks in two bands + stats + last workout), extra large on iPad (53 weeks + stats + week + big four) | theme: same as app / Blue (Terminal) / Green / Purple / Orange |
| **Next workout** | small (day, when, top 3 lifts), medium (every exercise), large (+ week strip) | — |
| **This week** | small (done/target ring + streak), medium (Mon–Sun strip + volume) | — |
| **Lifts** | small (one lift + sparkline + Δ), medium (big four), large (up to 8) | which lift (small) |
| **Recovery** | small (overall gauge), medium (least-ready bars) | Direct mode shows "needs server" |
| **Lock screen** | circular (week ring or streak), rectangular (next workout), inline ("Next: Bench 325 · TOMORROW") | circle shows week / streak |

Every widget is previewed in **SETUP → WIDGET GALLERY** (your data, the server demo, or the
Direct demo). Renders of each size are in [docs/screens/ios/widgets](../docs/screens/ios/widgets).

## Run it on an iPhone with a free Apple ID

1. Open `ios/Ironterm.xcodeproj` in Xcode (26 or later; the project uses folder-synchronised
   groups).
2. Xcode → Settings → Accounts → add your Apple ID.
3. Select the **Ironterm** target → *Signing & Capabilities* → Team = *your name (Personal Team)*.
   Do the same for **IrontermWidgets** (and **IrontermTests** if you run tests on the device).
4. A free team can't use someone else's identifiers, so change the bundle ids to something unique,
   e.g. `com.yourname.ironterm` and `com.yourname.ironterm.widgets`, and the App Group in both
   targets' *App Groups* capability (and `Store.appGroup` in `Shared/Data/Store.swift`) to
   `group.com.yourname.ironterm`. The widget's id must start with the app's id.
5. Plug in the phone, pick it as the run destination, ⌘R. On the phone: Settings → General →
   VPN & Device Management → trust your developer certificate. Developer Mode must be on
   (Settings → Privacy & Security → Developer Mode).

Free provisioning profiles expire after 7 days; run from Xcode again to refresh. If Xcode refuses
the App Groups capability on a personal team, the app still works but widgets can't see the app's
data (they'll say NOT CONNECTED).

## Development

```sh
cd ios
# build + unit tests on a simulator
xcodebuild -project Ironterm.xcodeproj -scheme Ironterm \
  -destination 'platform=iOS Simulator,name=<any iPhone simulator>' CODE_SIGNING_ALLOWED=NO test

# also write every widget render to docs/screens/ios/widgets and run the live mock-server test
python3 Tools/mock_server.py 8787 &
TEST_RUNNER_SCREENSHOT_DIR=$PWD/../docs/screens/ios/widgets \
TEST_RUNNER_MOCK_SERVER=http://127.0.0.1:8787 \
xcodebuild … test
```

- `Tools/mock_server.py` is a local stand-in for a server: `/api/snapshot` and `/api/sync` require
  `Bearer ht_test_good` (anything else is 401), `/auth/app` sets a session cookie, `/` is a tiny page.
  Connect to it with `ironterm://connect?server=http%3A%2F%2F127.0.0.1%3A8787&token=ht_test_good`.
- Launch arguments for screenshots (no network, no stored data touched): `-demoFixture`,
  `-demoDirect`, `-demoEmpty`, `-demoError 401`, `-demoLink`, `-demoServer <origin>`,
  `-startTab today|graph|lifts|body|web|setup|gallery`.
- The app icon is generated by `../docs/brand/make_icons.py` (one script for iOS, Android and the web). `Shared/Data/LiftLibrary.swift` is generated from
  `web/shared/lifts.ts`.
- Layout: `Shared/` (models, Direct aggregation, networking, widget views; built into the app and
  the extension), `Ironterm/` (app), `IrontermWidgets/` (widget extension), `IrontermTests/`.
- The product name lives in `Shared/Brand.swift` and the `APP_DISPLAY_NAME` build setting.
