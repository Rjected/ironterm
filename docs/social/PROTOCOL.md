# Ironterm social: protocol (v1)

Friends across self-hosted servers, with **no central store of anyone's training**.

```
            ┌──────────────── directory ────────────────┐
            │ handle → server URL + public key (opt-in)  │   ← the only central piece
            └────────────────────────────────────────────┘
                 ▲ register / look up          ▲
                 │                             │
   your server ──┴── signed requests ──────────┴── friend's server
   (your data)       friend request / accept        (their data)
                     feed + profile: lazily fetched, short cache
                     reactions: delivered to the owner's inbox
```

Each Ironterm server belongs to one person, so **a server is an identity**. The phone apps only ever
talk to their own server; servers talk to each other.

## 1. Server identity

On first use a server generates an **Ed25519** key pair (WebCrypto) and keeps it in its own storage.

`GET /.well-known/ironterm` (public, no auth):

```json
{ "v": 1, "server": "https://gym.example.com", "handle": "dan", "name": "Dan",
  "publicKey": "<base64url raw 32-byte Ed25519 public key>",
  "directory": "https://directory.example.com", "software": "ironterm" }
```

`handle`/`name`/`directory` are null until the owner sets up social (`directory` stays null when the
server has no directory configured or the owner unregistered). `server` is the canonical origin: the
request's origin, or `SOCIAL_ORIGIN` when the operator sets it.

**Fingerprint** (shown to people to compare keys out of band): the first 16 hex chars of
sha256(raw public key), in groups of 4 joined by `-`, e.g. `3f2a-91c0-77de-0b14`.

## 2. Signed requests (server ↔ server, server → directory)

Header on every signed request:

```
Ironterm-Signature: server="https://a.example", ts="1792300000", sig="<base64url Ed25519 signature>"
```

Signed string (UTF-8, newline-separated):

```
ironterm-v1
<METHOD>
<path + query of the request URL>
<target origin, e.g. https://b.example>
<ts>
<hex sha256 of the raw body, or of "" when there is none>
```

The receiver rejects when `|now − ts| > 300 s`, when the target origin isn't itself, or when the
signature doesn't verify with the sender's key. **Which key:**

- **friends:** the key pinned when the friendship was made (trust on first use). A changed key is
  rejected until the owner re-approves, which in v1 means removing the friend and adding them again.
- **strangers** (only allowed for `friend_request`): fetch `<sender>/.well-known/ironterm`; if the
  sender has a handle and the request says it came via a directory, its directory entry must carry the
  same key. Both must match, so a compromised directory alone can't impersonate anyone.

`http://` origins are refused unless both servers run with `SOCIAL_ALLOW_HTTP=1` (local testing).

## 3. Directory (the central phonebook)

A tiny service (`web/directory/`, Workers + D1 or Node + SQLite). It stores **only**: handle, display
name, server origin, public key, listed flag, timestamps. No workouts, no friend lists.

| | |
|---|---|
| `POST /v1/register` | signed by the server key. Body `{handle, name, server, publicKey, listed}`. The directory fetches `<server>/.well-known/ironterm` and requires the same key (proves the server controls its origin). First come first served; later updates and deletes must be signed by the same key (another key → `409`). Handles: `^[a-z0-9][a-z0-9_-]{1,29}$`. One handle per key: registering a new handle releases the key's old one. `{ok, handle}` |
| `GET /v1/users/{handle}` | `{handle, name, server, publicKey, updatedAt}` or 404 (unlisted users are still resolvable by exact handle) |
| `GET /v1/search?q=` | `{ users: {handle, name, server}[] }`: up to 20 *listed* users whose handle or name starts with `q` (case-insensitive; under 2 chars → `400`) |
| `DELETE /v1/users/{handle}` | signed by the same key |

Every endpoint is rate-limited per client IP (`429`): register/delete 20 per hour, search 60 per
minute, lookups 240 per minute.

Servers are configured with a directory URL (`SOCIAL_DIRECTORY`); there is no built-in default.
Friends can also add each other by server URL, without any directory. A server with no directory can
still set up social (handle and name are kept locally and shown in `.well-known`).

## 4. Friendship

Mutual: one side requests, the other accepts. Each side chooses, per friend, what the *other* can see
(**share level**):

| level | the friend can see |
|---|---|
| `basic` | streak, sessions per week, graph levels (no values), PRs and achievements **without weights**; session items carry only title, duration and set count (`exercises: []`) |
| `lifts` | basic + PR weights, current e1RM per lift, session summaries (exercises and top set) |
| `full` | lifts + every set, workout notes, readiness |

Inbox: `POST /social/v1/inbox` (signed), body is one message:

```jsonc
{ "type": "friend_request", "id": "<uuid>", "from": {"server","handle","name","directory"}, "note": "optional, ≤140 chars" }
{ "type": "friend_accept",  "id": "<uuid>", "request": "<request id>" }
{ "type": "friend_reject",  "id": "<uuid>", "request": "<request id>" }
{ "type": "unfriend",       "id": "<uuid>" }
{ "type": "reaction",       "id": "<uuid>", "item": "<feed item id>", "emoji": "💪" }   // emoji from a fixed set: 💪 🔥 👏 🏆 😤
{ "type": "unreaction",     "id": "<uuid>", "item": "<feed item id>" }
{ "type": "comment",        "id": "<uuid>", "item": "<feed item id>", "text": "≤280 chars" }
```

Responses: `202` accepted, `400` malformed (also: body over 8 KB, a reaction/comment on an item that
isn't in the feed the sender may see), `401` bad signature, `403` not a friend (everything but
`friend_request`), `409` duplicate (same message id from the same sender within 24 h; a
`friend_request` from an existing friend or one already pending), `429` too many pending requests (a
server keeps at most 50 incoming pending requests). Message ids are 8–64 chars of `[A-Za-z0-9_-]`
(a UUID). Accepting pins the requester's key; the accepter's key is pinned by the requester when it
receives `friend_accept` (verified against the key it fetched when sending the request).

If A receives a `friend_request` from B while A's own request to B is still pending, it counts as
acceptance: A becomes friends (the key must equal the one A fetched) and answers with `friend_accept`.
`unfriend` also cancels a pending request, in either direction. A reaction replaces the sender's
earlier reaction on that item (one per friend per item).

## 5. Reading a friend (lazy)

Both signed by a friend; the response is filtered by the share level the **owner** gave that friend.

`GET /social/v1/profile` → `SocialProfile`
`GET /social/v1/feed?before=<item id>&limit=30` → `{ items: FeedItem[], next: string | null, share, unit }`

The feed covers the last 365 days, newest first. `limit` is 1–100 (default 30); `next` is the id of
the page's last item, null at the end; an unknown `before` yields an empty page. `share` is the level
the owner gives the caller (same as in the profile); `unit` is the unit of every weight in the page
(null at basic).

```ts
interface SocialProfile {
  server: string; handle: string | null; name: string | null; share: "basic" | "lifts" | "full";
  unit: "kg" | "lb" | null;            // null at basic
  streak: { current: number; best: number };
  week: { done: number; target: number };
  sessions52: number;
  graph: { start: string; levels: number[] };   // 53 Monday-first weeks × 7 from `start` through today (future days omitted), levels 0–4, no values
  lifts: { key: string; name: string; e1rm: number | null; best: number | null }[];   // up to 8; e1rm = current (28-day best) e1RM, best = best e1RM ever (always ≥ e1rm); null at basic
  bodyweight: number | null;           // full only, latest, in unit
  program: string | null;              // lifts+
  updatedAt: string;
}

type FeedItem = {
  id: string;                          // stable: "w:<workoutId>", "pr:<workoutId>:<lift>:<kind>:<reps>", "a:<achievementId>"
  at: string;                          // ISO time
  reactions: { emoji: string; from: { server: string; name: string | null }[] }[];
  comments: { id: string; from: { server: string; name: string | null }; text: string; at: string }[];
} & (
  | { kind: "session"; title: string; durationMin: number; sets: number;
      exercises: { name: string; lift: string | null; top?: { weight: number; reps: number } | null; sets?: { weight: number | null; reps: number | null }[] }[];
      volume?: number; note?: string }          // top: lifts+; sets/volume/note: full
  | { kind: "pr"; lift: string; liftName: string; prKind: string; reps: number; weight?: number; prev?: number | null }  // weight/prev: lifts+
  | { kind: "achievement"; title: string; tier: string; description: string }
);
```

Owner servers include reactions and comments on their own items. Comments and reactions from a
friend are removed when that friend is unfriended.

PR items: rep-max records (`prKind: "rep"`, `reps` = the record's rep count), e1RM records (`"e1rm"`)
and max-reps records for bodyweight lifts (`"maxReps"`), first-ever records excluded. When one session
sets several rep maxes at the same weight (a single and a double at 100 kg) only the highest rep count
is listed. Achievement items are dated at the end of the last workout on the day they unlocked.

## 6. The owner's API (what the web UI and apps call)

Authenticated like the rest of the app (session cookie or `Bearer ht_…`). The server fetches friends
lazily: on request, in parallel, 4 s timeout per friend, cached 5 min (`?fresh=1` bypasses), falling
back to the last good copy (`stale: true`).

| | |
|---|---|
| `GET /api/social/me` | `{ enabled, handle, name, server, directory, listed, fingerprint, directoryConfigured, unread }` (`directoryConfigured`: the server has `SOCIAL_DIRECTORY`; `unread`: unread notifications) |
| `POST /api/social/setup` | `{ handle, name, listed }` → registers with the directory (when one is configured; `409` handle taken); `{ ok, handle }` |
| `DELETE /api/social/setup` | unregister from the directory (friends keep working) |
| `GET /api/social/search?q=` | directory search → `{ users: {handle, name, server}[] }` |
| `GET /api/social/friends` | `{ friends: Friend[] }` |
| `POST /api/social/friends` | `{ handle } \| { server }`, optional `note`, `share` → sends a request; `{ friend: Friend }`. If they already asked you, this accepts. |
| `POST /api/social/friends/{id}/accept` | `{ share }` |
| `POST /api/social/friends/{id}/reject` | |
| `PUT /api/social/friends/{id}` | `{ share }` |
| `DELETE /api/social/friends/{id}` | unfriend (notifies them) or cancel a request; `{ ok, notified }` |
| `GET /api/social/feed?before=&limit=` | `{ items: (FeedItem & { author: Author & { unit }; unit })[], next, stale: string[], unreachable: string[] }`, friends merged, newest first (from each friend's latest 100 items); `next` is an opaque cursor; `stale` lists friend ids served from cache, `unreachable` those with nothing to show |
| `GET /api/social/friends/{id}/profile` | `{ profile: SocialProfile, stale: boolean }` |
| `GET /api/social/friends/{id}/feed?before=` | that friend only, same shape as the merged feed; `before` is an item id. In both feeds `unit` (on the item and on its `author`) is the friend's unit for every weight in the item, null when they share only `basic`; weights stay in the friend's unit (Compare converts) |
| `GET /api/social/compare/{id}` | `Compare & { stale: boolean }` |
| `GET /api/social/mine?before=&limit=` | `{ items: FeedItem[], next, unit }`: my own feed items (as `full`) with the reactions/comments friends left |
| `POST /api/social/react` | `{ friend, item, emoji \| null }` (null removes) |
| `POST /api/social/comment` | `{ friend, item, text }` |
| `GET /api/social/notifications` | `{ items: { id, kind: "request" \| "accepted" \| "reaction" \| "comment", from: Author, item?, emoji?, text?, at, read }[], unread }` (newest 100; a request's `text` is its note) |
| `POST /api/social/notifications/read` | marks all read |

```ts
interface Author { id: string; server: string; handle: string | null; name: string | null }
interface Friend extends Author {
  status: "friends" | "outgoing" | "incoming";
  share: "basic" | "lifts" | "full";   // what *I* let them see
  theirShare: "basic" | "lifts" | "full" | null;   // what they let me see (from their profile), null until fetched
  since: string; lastSeen: string | null; fingerprint: string; note?: string | null;
}
interface Compare {
  friend: Author; unit: "kg" | "lb";      // their numbers converted into my unit
  lifts: { key: string; name: string; me: number | null; them: number | null; meBw?: number | null; themBw?: number | null }[];  // e1RM; them null below `lifts`; Bw = × bodyweight, present only when both share it (they give me `full` and I give them `full`)
  weeks: { week: string; me: number; them: number }[];   // training days per week from the graphs, last 12 (Monday dates)
  streak: { me: number; them: number };
}
```

`Friend.id` is the first 12 hex chars of sha256(server origin).

## 7. Privacy and limits

- Nothing is shared until social is set up **and** a friendship is accepted. Default share level: `basic`.
- The directory is opt-in (`listed: false` still lets people add you by exact handle or server URL).
- Revoking (unfriend / lowering the share level) stops future fetches. Copies a friend already
  fetched can't be recalled.
- `/social/v1/*` and `/.well-known/ironterm` are the only endpoints that answer without the owner's
  login, and every `/social/v1/*` call must be signed. (A login proxy such as Cloudflare Access must
  let those two paths through.)
- A server reachable only on a private network can follow others but can't be fetched from.
