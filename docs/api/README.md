# App API (native apps + widgets)

The web app's server (Cloudflare Worker, or the Node/Docker build in `web/server`) exposes one
read endpoint for everything outside the browser. The native apps and widgets also have a
**Direct** mode (just a Hevy API key, no server), so nothing requires our server.

## Connecting an app to a server

1. In the web app: **F10 SETUP → APPS & WIDGETS → New app token**. The token (`ht_…`) is shown once.
2. On the phone, either tap **Open in app**, which uses the deep link below, or paste the server URL and token into the app.

Deep link (both platforms):

```
ironterm://connect?server=<urlencoded origin>&token=<ht_…>
```

e.g. `ironterm://connect?server=https%3A%2F%2Fgym.example.com&token=ht_abc…`

## Endpoints

| | |
|---|---|
| `GET /api/snapshot` | `Authorization: Bearer ht_…` → `Snapshot` JSON (below). `cache-control: no-store`. |
| `POST /api/sync` | Bearer. Pull new workouts from Hevy now (the server also syncs every 15 min + webhook). |
| `POST /auth/app` | Form body `token=ht_…&next=/` → 302 to `next` with a session cookie. Use it to open the full web app inside a WebView already signed in (POST it from the WebView). |
| `401` | `{ "error": "login required", "auth": "google" }`: the token is missing or revoked. Ask the user to reconnect. |

## App screens

The native apps render each screen from one document. The server builds them from the same derived data as the web UI (`web/shared/appapi.ts`, where the types are the contract). Samples generated from demo data are in [`app/`](app/).

| | |
|---|---|
| `GET /api/app/home` | dashboard: snapshot, e1RM table, a year of big-four trends, 26 weeks of volume, watch list, recent PRs |
| `GET /api/app/gym` | the in-progress session (if any), next session, program days, exercise catalog |
| `POST /api/app/gym/start` | `{dayIndex?, empty?}` → a new LiveSession, saved server-side. Then `PUT /api/live` as it changes, `POST /api/live/finish` to log it, `DELETE /api/live` to discard. |
| `GET /api/app/lifts` · `/api/app/lifts/{key}` | lift list; per-lift history, rep PRs, PR wall, stall, projection, personal RPE chart |
| `GET /api/app/history?cursor&limit&q` · `/api/app/workouts/{id}` | paged workout list (cursor = last id seen); full workout with program results. Edit notes with `PUT /api/workouts/{id}/notes`. |
| `GET /api/app/calendar?month=YYYY-MM` | 42-day Monday-first grid: done / planned / missed / rest / travel / today |
| `GET /api/app/program` | slots, upcoming sessions, decision log. Push with `POST /api/routines/push`. |
| `GET /api/app/body?mode=ready\|load` | coloured front and back figures as standalone SVG, plus the per-muscle list |
| `GET /api/app/insights` · `/api/app/stats` | projections, strength balance, achievements · weekly totals, cardio |

## Snapshot (v1)

Type: `web/shared/snapshot.ts`. Sample: [`snapshot.sample.json`](snapshot.sample.json) (demo data).
Fields are only ever added. A breaking change bumps `v`.

- `source`: `"hevy"`, `"local"` (Strong import or logged in Ironterm, no Hevy) or `"demo"`. Use it for wording such as "saved to Hevy" vs "saved".
- `unit`: `"lb"` or `"kg"`. Every weight is already in this unit.
- `graph.days`: 53 Monday-first weeks ending today, oldest first, each `{date, level 0–4, value}`. Level 0 means no workout; 1–4 are quartiles of training days.
  - Colours (index = level): `#16181d`, `#8cb4ff`, `#5082dc`, `#285ab4`, `#0f3278`. Level 1 is the lightest and 4 the darkest, the same as the original widgets.
- `streak`: consecutive weeks hitting `week.target` sessions.
- `week.days[].status`: one of `done`, `planned`, `today` (a training day not yet done), `rest`, `missed`, `travel`.
- `program.next`: the next planned session, with exact weights. `when` is `TODAY`, `TOMORROW` or `FRI 16 OCT`. Each exercise has a one-line `summary` like `3×8 @ 190`. `null` when there's no program.
- `lifts`: the big four first, up to 8 lifts. Each has `e1rm`, `delta28` (change vs 4 weeks ago, may be null) and `spark` (12 weekly points).
- `recovery.muscles`: least ready first, `readiness` 0–1, `readyInH` hours until ~recovered. `overall` is the big muscles' average.

## Look

Terminal style, matching the web app:
- Colours: background `#000`, panel `#050506`, lines `#222428`, text `#dcdcdc`, dim `#8a8d93`, faint `#55585e`, accent amber `#ffb000`, up `#8cb4ff`, down `#ff6b5e`.
- Monospace everywhere, uppercase labels, no rounded "material" chrome.
