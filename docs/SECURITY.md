# Security

Ironterm is a single-owner training app. One person runs their own server, on Cloudflare Workers + D1 or self-hosted on Node + SQLite. That person reads it from a browser, the Android and iOS apps, and the CLI. Servers can befriend each other (docs/social/PROTOCOL.md), and an optional directory maps handles to servers.

This document is the threat model: what we protect, where the trust boundaries are, who we defend against, and what we deliberately don't.

## Reporting a vulnerability

Please report security problems privately through **GitHub's "Report a vulnerability"** button (Security tab → Advisories) on `Rjected/ironterm`. Don't open a public issue. You'll get an acknowledgement within a week. We'll agree on a disclosure date once a fix ships. Good-faith research on your own deployment is welcome. Please don't test against servers you don't own.

## Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Workout history, body weight, notes, program, WHOOP recovery | D1 / SQLite (`workouts`, `kv`, `whoop`) | Personal health data |
| Hevy API key | Worker secret / env var `HEVY_API_KEY` | Full read/write of the owner's Hevy account |
| WHOOP OAuth tokens | `kv` (`whoop:tokens`) | Read access to WHOOP data |
| Google OAuth client secret | Worker secret / env var | Lets someone impersonate the app at Google |
| `SESSION_SECRET` / `APP_PASSWORD` | Worker secret / env var | Forges session cookies |
| Session cookies (`ht_session`, Cloudflare `CF_Authorization`) | Browser | Full API access for 30 days |
| App tokens (`ht_…`) | Phone (Android EncryptedSharedPreferences, iOS Keychain); server keeps only SHA-256 hashes | Full API access until revoked |
| Webhook secrets (`WEBHOOK_SECRET`, WHOOP client secret) | Worker secret / env var | Trigger syncs |
| Social signing key (Ed25519) | `kv` (`social:key`), private key never leaves the server | Impersonating this server to friends and the directory |
| Friend list, reactions, comments | `social_*` tables | Social graph, private messages |
| The directory | Directory D1 / SQLite | Handle → server and key mapping that everyone trusts on first contact |
| Android release signing key | GitHub Actions secrets | Over-the-air updates to every installed Android app |

## Trust boundaries

1. **Browser ↔ server.**
   - The browser is authenticated by one of: Google OIDC (PKCE plus signed `state`), a Cloudflare Access JWT, or the password session.
   - With no login configured, the server answers only `localhost`. On Node this is judged from the socket, the raw Host header, and the absence of proxy headers.
   - Cookie-authenticated writes must be same-origin (`Sec-Fetch-Site` / `Origin`).
   - Pages are served with a strict CSP: same-origin script, style and connect only, no inline script, `frame-ancestors 'none'`.
2. **App ↔ server.**
   - Bearer app tokens are random 256-bit values stored only as hashes, and they are revocable. A web session traded for a token ends when the token is revoked.
   - Connect links and QR codes show the host and ask for confirmation before anything is saved or sent.
   - The Android updater installs only HTTPS-downloaded APKs signed with the installed app's key.
3. **Server ↔ server (social).**
   - Every `/social/v1/*` request is Ed25519-signed over method, path, target origin, timestamp (±5 min) and body hash. Message ids are de-duplicated.
   - A friend's key is pinned when the friendship starts. A changed key is refused, not trusted.
   - Strangers can only send friend requests, at most 50 pending.
   - Everything a peer sends is shape-checked and length-limited, and rendered as text, never as HTML.
4. **Server ↔ directory.**
   - Registration is signed, and the directory checks that the server serves the same key at `/.well-known/ironterm`.
   - A handle belongs to the key that registered it first.
   - On first contact with a stranger who claims a handle, the directory key and the `.well-known` key must agree.
   - Lookups and writes are rate-limited per IP.
5. **Server ↔ Hevy / WHOOP / Google.**
   - Fixed HTTPS endpoints.
   - The Hevy webhook is authenticated by a bearer secret compared in constant time.
   - The WHOOP webhook uses an HMAC-SHA256 signature, compared in constant time, with a 15-minute timestamp window.
   - OAuth `state` is single-use (WHOOP) or HMAC-signed with PKCE (Google).
6. **Outbound fetches from a self-hosted box.**
   - Peer and directory URLs come from strangers. The Node server and directory refuse private, loopback, link-local, CGNAT and ULA addresses, checked on the resolved address at connect time.
   - Responses are size-capped and time out after 4 s.
   - Redirects are never followed.
7. **CI ↔ release signing.**
   - Actions are pinned to commit SHAs, and permissions default to `contents: read`.
   - PR workflows use `pull_request`, so forks get no secrets.
   - Only a push to `main` runs the signed Android release.

## Attackers we defend against

**Internet stranger.** Can reach the public URL. Can't read or write data without a session, an Access JWT or an app token. Can't forge sessions without `SESSION_SECRET`. Can't use the owner's browser against the API, because of the CSRF checks, the CSP, DNS-rebinding protection in no-login mode, and `frame-ancestors 'none'`. Can send a signed friend request, which the owner must accept, and nothing else. Can't use the server to scan its LAN.

**Malicious friend server.** Once accepted, a friend can:
- read what the owner shares at the chosen share level
- react to and comment on items it can see

The limits:
- Its content is length-limited and rendered as text.
- Its responses are capped at 1 MB and 4 s.
- It can't pull data beyond the share level.
- It can't change its key without being noticed.
- Unfriending removes everything it left.

**Malicious or compromised directory.** Can lie about handle → server/key mappings for *new* contacts, and can refuse or censor registrations. Defenses:
- Friend requests by handle require the directory key and the server's `.well-known` key to match.
- Keys are pinned after the first contact.
- Fingerprints are shown in the UI for out-of-band checking.
- Adding friends by server URL bypasses the directory entirely.
- The directory stores only handle, name, server, key, `listed` and timestamps: no workouts, no friend lists.

Known directory limits:
- **Handle squatting.** Handles are first come, first served. Writes are limited to 20 per address per hour, but there's no proof of identity beyond controlling a server.
- **Enumeration.** Any handle can be looked up by its exact name, which is needed to add friends by handle. Only `listed` users appear in search, and lookups are limited to 240 per minute per address.

**Stolen phone.** The app token is in hardware-backed storage (Android Keystore via EncryptedSharedPreferences, iOS Keychain `ThisDeviceOnly`) and excluded from backups and device transfer. The owner revokes it from SETUP → APPS. Revocation also ends any web session the token was traded for. Workouts cached on the phone stay readable to whoever unlocks it.

**Compromised dependency or CI action.**
- Dependencies are few, pinned by lockfiles, and installed with `--frozen-lockfile` / `--locked`.
- Actions are pinned to SHAs.
- Dependabot opens only security PRs, plus monthly action-pin bumps.
- A malicious npm package in the web build would still run with full access to the page and the worker. Keeping the dependency count low is the main defense.

## Out of scope / accepted risks

- **A compromised host.** This covers the Cloudflare account, the box running Node, or the owner's Google account. Whoever controls the host controls the data.
- **No login on localhost.** With no login configured, anything running as another user on the same machine can use the API. Set `APP_PASSWORD` on shared machines.
- **Password login rate limits are per IP.** A distributed attacker gets more guesses. Use a long password, or Google/Access.
- **Sessions last 30 days.** Logging out clears the cookie but doesn't revoke it server-side. Rotating `SESSION_SECRET` signs everyone out.
- **Clear-text http to a self-hosted server.** It's allowed because LAN/VPN setups need it. The apps warn when the host is public.
- **Peer content is trusted for display only.** A friend can say anything in a comment. It is shown as text, never interpreted.
- **The owner is trusted.** Anyone holding a valid session or app token has full owner rights. There are no per-feature scopes.
