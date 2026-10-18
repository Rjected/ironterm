# Friends

Ironterm's social side lets you follow friends' training, react, comment and compare lifts, **without
a central database of anyone's workouts**. Every Ironterm server belongs to one person, so your
server is your identity. When a friend looks at your feed, their server asks yours, and yours decides
what to show them. The phone apps only ever talk to your own server.

The details are in [PROTOCOL.md](PROTOCOL.md). This page covers using it.

## Set up

Open **F11 · FRIENDS** in the web app (on a phone, **MORE → FRIENDS**), or **Friends** in the apps.

1. Pick a **handle** (2–30 characters: `a–z 0–9 _ -`) and a **display name**.
2. If your server has a directory (`SOCIAL_DIRECTORY`), choose whether to be **listed** in its
   search. Unlisted people can still be added by their exact handle or server URL.
3. Press **TURN ON FRIENDS**.

Without a directory, everything still works: friends add you by your server URL.

Your server needs a public HTTPS address for friends to read it. A server reachable only on a
private network (Tailscale, localhost) can follow other people, but they can't read it.

## Adding friends

Under **PEOPLE**:

- **Search** the directory by name or handle (listed people only), or
- type a **@handle** or a **server URL** (`https://gym.example.com`), add an optional note, choose
  what they'll see, and **SEND REQUEST**.

Requests you receive show up under **REQUESTS** and as an alert. **ACCEPT** them and choose what
they'll see, or **REJECT**. If you both send a request to each other, the second request counts as
accepting the first.

Each friend shows a **key fingerprint** (like `3f2a-91c0-77de-0b14`). If you want to be sure who's on
the other end, compare it with what they see under **YOU**.

## What friends see

You choose a level **per friend** and can change it at any time. The default is **BASIC**.

| level | they see |
|---|---|
| **BASIC** | your streak, sessions per week, the training graph (levels only, no numbers), and that you set a PR or unlocked an achievement, without any weights. Sessions show only their title, duration and set count. |
| **LIFTS** | BASIC, plus PR weights, your current e1RM per lift, the program's name, and each session's exercises with the top set. |
| **FULL** | LIFTS, plus every set, session volume, workout notes and your latest bodyweight. |

Things to know:

- **Nothing is shared** until you've set up social **and** accepted a friend.
- **Lowering a level or unfriending** stops future fetches right away. A copy a friend already loaded
  can't be recalled, and their server may keep it cached for up to 5 minutes.
- **Reactions and comments you leave** are stored on your friend's server, and their other friends
  can see them. Reactions and comments on *your* items are stored on your server, and are deleted if
  you unfriend that person.
- **Compare** shows bodyweight multiples only when you both share FULL.
- **The directory** stores only your handle, display name, server URL, public key and whether you're
  listed. It never sees workouts or friend lists. **REMOVE FROM DIRECTORY** under PEOPLE takes you out
  of it; existing friends keep working.

## Using it

- **FEED**: friends' sessions, PRs and achievements from the last year, newest first. React with
  💪 🔥 👏 🏆 😤 (tap your reaction again to remove it) or comment (up to 280 characters). If a
  friend's server doesn't answer, you see the last copy and a note saying so.
- Tap a friend's name for their **profile**: streak, this week, the training graph, lifts (at LIFTS
  and above), a **compare** of e1RMs (converted to your unit), training days per week and streaks,
  and their own feed. **REFRESH** fetches fresh data instead of the 5-minute cache.
- **MY ACTIVITY**: your own items as friends see them, with the reactions and comments they left.
- **ALERTS**: friend requests, accepted requests, reactions and comments. The top bar shows a
  **FRIENDS · n** badge while there are unread alerts.

## Self-hosting a directory

A directory is optional and tiny. Run one for your gym or group, then set `SOCIAL_DIRECTORY` on every
server that should use it. There is no built-in default directory.

**Node:**

```sh
cd web
pnpm build:directory
PORT=8790 DATA_DIR=./data pnpm start:directory
```

Behind a reverse proxy, add `TRUST_PROXY=1` (rate limits then use the forwarded client address), and
`DIRECTORY_ORIGIN=https://directory.example.com` if its public URL differs from the request's.

**Cloudflare Workers + D1:**

```sh
cd web
cp wrangler.directory.example.jsonc wrangler.directory.jsonc
wrangler d1 create ironterm-directory     # paste the id into wrangler.directory.jsonc
pnpm deploy:directory                     # applies the schema, then deploys
```

The directory checks every registration: it must be signed by the server's key, and the server must
serve that same key at `/.well-known/ironterm`. A handle belongs to the first key that registers it.

## Server settings

| variable | |
|---|---|
| `SOCIAL_DIRECTORY` | directory URL, e.g. `https://directory.example.com` (optional, no default) |
| `SOCIAL_ORIGIN` | this server's public origin, when requests reach it under another URL |
| `SOCIAL_ALLOW_HTTP` | `1` allows `http://` peers (local testing only; set it on every server involved, and on the directory) |
| `SOCIAL_ALLOW_PRIVATE` | Self-hosted (Node) only: `1` allows peers and directories on private/loopback addresses. By default the Node server and directory refuse them, checked on the resolved address. |

If a login proxy sits in front of your server (Cloudflare Access, for example), it must let
`/.well-known/ironterm` and `/social/*` through. Those are the only endpoints that answer without your
login, and every `/social/v1/*` request must be signed by a friend's server.
