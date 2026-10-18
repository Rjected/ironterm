# Self-hosting

The app is one codebase with two ways to run it. Pick whichever suits you. Same features, same data model.

| | Cloudflare | Anywhere else (Docker / Node) |
|---|---|---|
| Runs on | Workers + D1, free tier is plenty | Any Linux box, VPS, NAS, Raspberry Pi 4+, Mac |
| Database | D1 | SQLite file in `./data` |
| Background sync | Cron trigger | Built-in timer (`SYNC_MINUTES`) |
| HTTPS | Cloudflare | Your reverse proxy (Caddy, nginx, Tailscale, Cloudflare Tunnel) |
| Guide | [README](README.md) | below |

The Node server (`server/main.ts`) runs the exact same `worker/index.ts`. It swaps D1 for SQLite (`server/d1.ts`) and serves the built files itself, so nothing is Cloudflare-only.

The phone apps work with any of these, and also without a server at all: their **Direct** mode only needs a Hevy API key. Server mode adds the program, the next session, recovery and the full web app.

## Docker (recommended)

```sh
git clone <this repo> && cd hevy-github-graph/web
cp .env.example .env            # fill in HEVY_API_KEY, SESSION_SECRET, and a login
docker compose up -d --build
open http://localhost:8787
```

Data lives in `./data/hevy.sqlite`. Back up that one file.
To update: `git pull && docker compose up -d --build`.

## Plain Node (22.13+)

```sh
corepack enable && pnpm install
pnpm build:node
set -a; . ./.env; set +a        # or export the variables another way
pnpm start                      # PORT=8787, DATA_DIR=./data by default
```

## Configuration (.env)

| Variable | |
|---|---|
| `HEVY_API_KEY` | Hevy → Settings → Developer (needs Hevy Pro). Without it you get demo data. |
| `SESSION_SECRET` | Long random string (`openssl rand -base64 32`). Signs login cookies. |
| `TIMEZONE` | e.g. `Europe/London`. Decides what "today" is. |
| `APP_PASSWORD` | Simplest login: one shared password. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `ALLOWED_EMAILS` | Google sign-in instead. Create a *Web application* OAuth client and add `https://<your host>/auth/callback` as a redirect URI. Only the listed emails get in. |
| `WEBHOOK_SECRET` | Optional. Hevy webhook for instant sync: URL `https://<host>/api/hevy/webhook`, header `Bearer <secret>`. |
| `WHOOP_CLIENT_ID` / `WHOOP_CLIENT_SECRET` | Optional WHOOP integration. |
| `SYNC_MINUTES` | Background sync interval, default 15. `0` turns it off. |
| `PORT`, `HOST`, `DATA_DIR` | Defaults: 8787, 0.0.0.0, ./data. |

**No login configured means local only.** If neither a password nor Google sign-in is set, the server answers only requests from the same machine that didn't come through a proxy. Anything else gets 403. Set a login before exposing it.

## Connecting Hevy

Ironterm reads your workouts through Hevy's public API, using your own API key. Nothing goes through anyone else's server.

1. **Get an API key.** In Hevy go to Settings → Developer and generate a key. The API needs Hevy Pro.
2. **Add it** as `HEVY_API_KEY=` in `.env` and restart (`docker compose up -d`). The SETUP screen switches from DEMO to LIVE.
3. **First sync.** History backfills automatically a few seconds after start: 400 workouts per pass, and a long history keeps going on the next pass every `SYNC_MINUTES`. To go faster, press **SYNC** in the top bar (or type `SYNC`) a few times.
4. **Pick a program** in F10 SETUP. If your past workouts already follow it, the app replays them, so the weights pick up where you are. Map any lift whose Hevy exercise name differs under LIFT MAPPING.
5. **Push routines to Hevy (optional).** F4 PROG → PUSH creates one routine per program day in a "<program> · Ironterm" folder in Hevy. Start your workout from there in the Hevy app as usual. When **Auto-update Hevy routines** is on (SETUP → SETTINGS), the weights update after every logged session. Starting a session in F2 GYM and pressing FINISH saves it to Hevy as a workout.
6. **Instant sync (optional).** Without this, new workouts show up within `SYNC_MINUTES`. Set `WEBHOOK_SECRET` to a long random string. Then in Hevy → Settings → Developer → Webhooks:
   - URL: `https://<your public host>/api/hevy/webhook`
   - Authorization header: `Bearer <WEBHOOK_SECRET>`

   Hevy must be able to reach that URL, so it needs a public HTTPS host (Caddy or Cloudflare Tunnel below, not Tailscale-only). The webhook endpoint answers only signed requests, even when the rest of the app requires a login.

Your key only ever goes to `api.hevyapp.com`. Writes to your Hevy account happen only when you press PUSH or FINISH, or when auto-update is on.

## HTTPS / a real domain

Put any reverse proxy in front. It must pass `X-Forwarded-Proto` and `X-Forwarded-Host`, which all the common ones do. Google sign-in and the phone apps need HTTPS.

- **Caddy** (gets certificates automatically): `gym.example.com { reverse_proxy localhost:8787 }`
- **Tailscale**: `tailscale serve --bg 8787` makes it private to your tailnet, with HTTPS.
- **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:8787`. No open ports needed.

## Phone apps

In the web app go to **SETUP → APPS & WIDGETS → Create**. Then, on the phone, tap **OPEN IN APP**, or type the server URL and token into the app. Each device gets its own token, and you can revoke any of them from the same panel. See `../android/README.md` and `../ios/README.md`.

## Moving between Cloudflare and self-hosted

Everything except your workouts is a handful of settings: program, settings, trips and weigh-ins, kept in the `kv` table. Workouts re-sync from Hevy on first start. To carry the program over, copy the `kv` rows:

```sh
# Cloudflare → file
npx wrangler d1 execute hevy --remote --command "SELECT key, value FROM kv" --json > kv.json
# file → self-hosted SQLite
node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("data/hevy.sqlite");for(const r of require("./kv.json")[0].results)d.prepare("INSERT OR REPLACE INTO kv(key,value,updated_at) VALUES(?,?,datetime(\"now\"))").run(r.key,r.value)'
```

(Start the server once first so it creates the tables.)
