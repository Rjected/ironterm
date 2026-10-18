// F11 · FRIENDS: social across self-hosted servers (docs/social/PROTOCOL.md). Each friend's data
// stays on their server; this view asks our own server, which fetches friends lazily.

import { useEffect, useMemo, useState } from "preact/hooks";
import { EMOJI } from "../../worker/social/types";
import { addDays } from "../../shared/stats";
import { LIFTS } from "../../shared/lifts";
import { fmt } from "../../shared/units";
import type { DayCell } from "../../shared/stats";
import { ApiError, social, type AuthoredItem, type Compare, type FeedItem, type Friend, type Notification, type Share, type SocialMe, type SocialProfile } from "../api";
import { Heatmap, Legend } from "../charts";
import { Picker, type PickOption } from "../components/picker";
import type { Nav } from "../app";
import { Panel, Seg, ago, shortDate } from "../ui";
import "../friends.css";

export type FriendsTab = "feed" | "people" | "mine" | "alerts" | "f";

const SHARE_OPTS: PickOption<Share>[] = [
  { value: "basic", label: "BASIC", hint: "streak · graph · PRs, no weights" },
  { value: "lifts", label: "LIFTS", hint: "+ weights, e1RM, top sets" },
  { value: "full", label: "FULL", hint: "+ every set, notes, bodyweight" },
];
const SHARE_TEXT: Record<Share, string> = {
  basic: "your streak, sessions per week, the training graph (levels only, no numbers), and that you set a PR or unlocked an achievement, without any weights; sessions show only title, duration and set count",
  lifts: "everything in BASIC plus PR weights, your current e1RM per lift, and each session's exercises with the top set",
  full: "everything in LIFTS plus every set, workout notes and your latest bodyweight",
};

/** The day an item happened, in the viewer's own zone (items carry UTC instants). */
const viewerDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};
const who = (a: { name: string | null; handle: string | null; server: string }) => a.name ?? (a.handle ? `@${a.handle}` : a.server.replace(/^https?:\/\//, ""));
const host = (s: string) => s.replace(/^https?:\/\//, "");
const errMsg = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : String(e));

export function Friends(props: { tab?: string; id?: string; nav: Nav; say: (m: string, err?: boolean) => void; onUnread: (n: number) => void }) {
  const [me, setMe] = useState<SocialMe | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const tab = (props.tab as FriendsTab) || "feed";
  const go = (t: FriendsTab, id?: string) => props.nav({ view: "friends", tab: t, id });

  const reload = async () => {
    try {
      const m = await social.me();
      setMe(m);
      props.onUnread(m.unread);
      if (m.enabled) setFriends((await social.friends()).friends);
    } catch (e) { setErr(errMsg(e)); }
  };
  useEffect(() => { reload(); }, []);

  if (err) return <div class="grid"><Panel title="FRIENDS" span={12}><div class="warnbox">{err}</div></Panel></div>;
  if (!me) return <div class="grid"><Panel title="FRIENDS" span={12}><div class="empty">loading…</div></Panel></div>;
  if (!me.enabled) return <SetupForm me={me} onDone={(m) => { props.say(m); reload(); }} say={props.say} />;

  const pending = friends.filter((f) => f.status === "incoming").length;
  const current = friends.filter((f) => f.status === "friends");
  return (
    <div class="grid">
      <div class="fr-tabs">
        <Seg value={tab === "f" ? "feed" : tab} onChange={(t) => go(t as FriendsTab)} options={[["feed", "FEED"], ["people", `PEOPLE${pending ? ` · ${pending}` : ""}`], ["mine", "MY ACTIVITY"], ["alerts", `ALERTS${me.unread ? ` · ${me.unread}` : ""}`]]} />
        <span class="faint">@{me.handle} · {host(me.server)}</span>
      </div>
      {tab === "feed" && <Feed me={me} friends={current} nav={props.nav} say={props.say} />}
      {tab === "people" && <People me={me} friends={friends} reload={reload} go={go} say={props.say} />}
      {tab === "mine" && <Mine />}
      {tab === "alerts" && <Alerts onRead={() => { props.onUnread(0); setMe({ ...me, unread: 0 }); }} go={go} />}
      {tab === "f" && props.id && <FriendDetail me={me} friend={friends.find((f) => f.id === props.id)} id={props.id} say={props.say} go={go} />}
    </div>
  );
}

// ───────── setup ─────────

function SetupForm(props: { me: SocialMe; onDone: (msg: string) => void; say: (m: string, e?: boolean) => void }) {
  const [handle, setHandle] = useState(props.me.handle ?? "");
  const [name, setName] = useState(props.me.name ?? "");
  const [listed, setListed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState<string | null>(null);
  const submit = async (ev: Event) => {
    ev.preventDefault();
    setBusy(true); setE(null);
    try { const r = await social.setup({ handle: handle.trim().toLowerCase(), name: name.trim(), listed }); props.onDone(`Social is on: you are @${r.handle}`); }
    catch (x) { setE(errMsg(x)); }
    setBusy(false);
  };
  return (
    <div class="grid">
      <Panel n="1" title="FRIENDS · SET UP" span={7} sub="off until you finish this">
        <form class="form" onSubmit={submit}>
          <div class="field">
            <label for="fr-handle">HANDLE</label>
            <input class="inp" id="fr-handle" value={handle} placeholder="e.g. sam" maxLength={30} autocomplete="off" spellcheck={false} onInput={(x) => setHandle((x.target as HTMLInputElement).value)} />
            <span class="note">2–30 characters: a–z, 0–9, _ and -. Friends find you as @{handle || "handle"}.</span>
          </div>
          <div class="field">
            <label for="fr-name">DISPLAY NAME</label>
            <input class="inp" id="fr-name" value={name} placeholder="what friends see" maxLength={60} onInput={(x) => setName((x.target as HTMLInputElement).value)} />
          </div>
          {props.me.directoryConfigured ? (
            <label class="fr-check"><input type="checkbox" checked={listed} onChange={(x) => setListed((x.target as HTMLInputElement).checked)} /> List me in the directory search <span class="faint">(otherwise people need your exact handle or server URL)</span></label>
          ) : (
            <p class="note">This server has no directory configured (SOCIAL_DIRECTORY), so friends add you by your server URL: <b class="hi">{props.me.server}</b></p>
          )}
          {e && <div class="warnbox">{e}</div>}
          <div><button class="btn pri" type="submit" disabled={busy || !handle || !name}><em>⏎</em>{busy ? "…" : "TURN ON FRIENDS"}</button></div>
        </form>
      </Panel>
      <Panel n="2" title="WHAT GETS SHARED" span={5}>
        <Privacy me={props.me} />
      </Panel>
    </div>
  );
}

function Privacy(props: { me: SocialMe }) {
  return (
    <div class="fr-privacy">
      <p>Nothing leaves this server until you accept a friend. Each friend's view is fetched from here, live, and filtered by the level you pick for <b>that</b> friend (default BASIC):</p>
      {SHARE_OPTS.map((o) => <p><b class="hi">{o.label}</b> <span class="dim">{SHARE_TEXT[o.value]}.</span></p>)}
      <p class="dim">Lowering a level or unfriending stops future fetches. Copies a friend already loaded (cached up to 5 minutes on their server) can't be recalled.</p>
      <p class="dim">Reactions and comments you leave are stored on your friend's server and shown to their other friends. Theirs on your items are stored here, and removed if you unfriend them.</p>
      {props.me.directoryConfigured
        ? <p class="dim">The directory stores only your handle, name, server address, public key and whether you're listed. Never workouts or friend lists.</p>
        : <p class="dim">No directory: nothing is registered anywhere.</p>}
      <p class="faint">Server key fingerprint {props.me.fingerprint}: friends can compare it with what they see.</p>
    </div>
  );
}

// ───────── items ─────────

function itemText(it: FeedItem, unit: string | null): { head: string; body?: string; lines?: string[] } {
  const u = unit ? ` ${unit}` : "";
  if (it.kind === "session") {
    const head = `${it.title} · ${it.durationMin} min · ${it.sets} sets${it.volume != null ? ` · ${Math.round(it.volume).toLocaleString("en-US")}${u}` : ""}`;
    const lines = it.exercises.map((e) => {
      const sets = e.sets?.filter((s) => s.reps).map((s) => (s.weight ? `${fmt(s.weight)}×${s.reps}` : `${s.reps}`)).join(" ");
      return `${e.name}${sets ? `  ${sets}` : e.top ? `  top ${fmt(e.top.weight)}${u} × ${e.top.reps}` : ""}`;
    });
    return { head, body: it.note, lines };
  }
  if (it.kind === "pr") {
    const what = it.prKind === "e1rm" ? "e1RM" : it.prKind === "maxReps" ? `max reps ${it.reps}` : `${it.reps}RM`;
    const w = it.weight != null ? (it.prKind === "maxReps" ? (it.weight ? ` @ ${fmt(it.weight)}${u}` : "") : ` ${fmt(it.weight)}${u}`) : "";
    const prev = it.prev != null ? ` (was ${fmt(it.prev)})` : "";
    return { head: `PR · ${it.liftName} · ${what}${w}${prev}` };
  }
  return { head: `${it.tier.toUpperCase()} · ${it.title}`, body: it.description };
}

function ItemCard(props: { it: FeedItem; unit: string | null; author?: AuthoredItem["author"]; meServer: string; friend?: string; onChanged?: () => void; say?: (m: string, e?: boolean) => void; onAuthor?: () => void }) {
  const { it } = props;
  const [reactions, setReactions] = useState(it.reactions);
  const [comments, setComments] = useState(it.comments);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { setReactions(it.reactions); setComments(it.comments); }, [it]);
  const t = itemText(it, props.unit);
  const mine = reactions.find((r) => r.from.some((f) => f.server === props.meServer))?.emoji ?? null;
  const react = async (e: string) => {
    if (!props.friend) return;
    const next = mine === e ? null : e;
    const meFrom = { server: props.meServer, name: "you" };
    const before = reactions;
    setReactions(EMOJI.map((x) => ({ emoji: x as string, from: [...(before.find((r) => r.emoji === x)?.from.filter((f) => f.server !== props.meServer) ?? []), ...(x === next ? [meFrom] : [])] })).filter((r) => r.from.length));
    try { await social.react(props.friend, it.id, next); }
    catch (x) { setReactions(before); props.say?.(errMsg(x), true); }
  };
  const send = async (ev: Event) => {
    ev.preventDefault();
    if (!props.friend || !text.trim()) return;
    try {
      await social.comment(props.friend, it.id, text.trim());
      setComments([...comments, { id: `local-${Date.now()}`, from: { server: props.meServer, name: "you" }, text: text.trim(), at: new Date().toISOString() }]);
      setText("");
    } catch (x) { props.say?.(errMsg(x), true); }
  };
  return (
    <article class={`fr-item k-${it.kind}`}>
      <header>
        {props.author && <button class="fr-author" onClick={props.onAuthor}>{who(props.author)}</button>}
        <span class={`fr-kind ${it.kind}`}>{it.kind === "session" ? "SESSION" : it.kind === "pr" ? "PR" : "ACHIEVEMENT"}</span>
        <span class="faint" title={it.at}>{shortDate(viewerDay(it.at))} · {ago(it.at)}</span>
      </header>
      <div class="fr-head">{t.head}</div>
      {t.lines && t.lines.length > 0 && <div class="fr-lines">{t.lines.map((l) => <div>{l}</div>)}</div>}
      {t.body && <div class="fr-body">{t.body}</div>}
      <footer>
        <div class="fr-react">
          {EMOJI.map((e) => {
            const r = reactions.find((x) => x.emoji === e);
            const n = r?.from.length ?? 0;
            if (!props.friend && !n) return null;
            return (
              <button class={mine === e ? "on" : ""} disabled={!props.friend} title={r ? r.from.map((f) => f.name ?? host(f.server)).join(", ") : "react"} onClick={() => react(e)}>
                {e}{n ? <small>{n}</small> : null}
              </button>
            );
          })}
          {props.friend && <button class="fr-cbtn" onClick={() => setOpen(!open)}>{comments.length ? `${comments.length} COMMENT${comments.length > 1 ? "S" : ""}` : "COMMENT"}</button>}
          {!props.friend && comments.length > 0 && <span class="faint">{comments.length} comment{comments.length > 1 ? "s" : ""}</span>}
        </div>
        {(open || !props.friend) && comments.length > 0 && (
          <div class="fr-comments">
            {comments.map((c) => <div><b>{c.from.name ?? host(c.from.server)}</b> {c.text} <span class="faint">{ago(c.at)}</span></div>)}
          </div>
        )}
        {open && props.friend && (
          <form class="fr-cform" onSubmit={send}>
            <input class="inp" maxLength={280} value={text} placeholder="say something (280)" onInput={(x) => setText((x.target as HTMLInputElement).value)} />
            <button class="btn" type="submit" disabled={!text.trim()}>SEND</button>
          </form>
        )}
      </footer>
    </article>
  );
}

// ───────── feed ─────────

function Feed(props: { me: SocialMe; friends: Friend[]; nav: Nav; say: (m: string, e?: boolean) => void }) {
  const [items, setItems] = useState<AuthoredItem[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [stale, setStale] = useState<string[]>([]);
  const [down, setDown] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const load = async (fresh = false) => {
    setBusy(true);
    try {
      const r = await social.feed({ fresh });
      setItems(r.items); setNext(r.next); setStale(r.stale); setDown(r.unreachable ?? []);
    } catch (e) { props.say(errMsg(e), true); setItems([]); }
    setBusy(false);
  };
  const more = async () => {
    if (!next) return;
    const r = await social.feed({ before: next });
    setItems([...(items ?? []), ...r.items]); setNext(r.next);
  };
  useEffect(() => { load(); }, []);
  const name = (id: string) => { const f = props.friends.find((x) => x.id === id); return f ? who(f) : id; };
  return (
    <Panel n="1" title="FEED" span={12} sub={`${props.friends.length} friend${props.friends.length === 1 ? "" : "s"} · fetched from their servers, cached 5 min`}
      act={<button class="btn" disabled={busy} onClick={() => load(true)}>{busy ? "…" : "REFRESH"}</button>}>
      {stale.length > 0 && <div class="note am">Showing a saved copy for {stale.map(name).join(", ")}: their server didn't answer.</div>}
      {down.length > 0 && <div class="note down">Couldn't reach {down.map(name).join(", ")}.</div>}
      {items == null ? <div class="empty">loading…</div>
        : !props.friends.length ? <div class="empty">No friends yet. Add someone under PEOPLE.</div>
        : !items.length ? <div class="empty">Nothing from your friends in the last year.</div>
        : (
          <div class="fr-list">
            {items.map((it) => <ItemCard key={`${it.author.id}|${it.id}`} it={it} unit={it.unit} author={it.author} meServer={props.me.server} friend={it.author.id} say={props.say} onAuthor={() => props.nav({ view: "friends", tab: "f", id: it.author.id })} />)}
            {next && <button class="btn" onClick={more}>MORE</button>}
          </div>
        )}
    </Panel>
  );
}

// ───────── people ─────────

function People(props: { me: SocialMe; friends: Friend[]; reload: () => Promise<void>; go: (t: FriendsTab, id?: string) => void; say: (m: string, e?: boolean) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ handle: string; name: string | null; server: string }[]>([]);
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [share, setShare] = useState<Share>("basic");
  const [accShare, setAccShare] = useState<Record<string, Share>>({});
  const [busy, setBusy] = useState(false);
  const incoming = props.friends.filter((f) => f.status === "incoming");
  const outgoing = props.friends.filter((f) => f.status === "outgoing");
  const current = props.friends.filter((f) => f.status === "friends");
  const known = new Set(props.friends.map((f) => f.server));

  useEffect(() => {
    if (!props.me.directoryConfigured || q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => social.search(q.trim()).then((r) => setResults(r.users)).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);

  const act = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await f(); props.say(ok); await props.reload(); } catch (e) { props.say(errMsg(e), true); }
    setBusy(false);
  };
  const add = (t: string) => {
    const v = t.trim();
    const isServer = /[.:/]/.test(v);
    return act(() => social.add({ ...(isServer ? { server: v } : { handle: v.replace(/^@/, "") }), note: note.trim() || undefined, share }), `Request sent to ${v}`).then(() => { setTarget(""); setNote(""); });
  };

  return (
    <>
      <Panel n="1" title="ADD A FRIEND" span={7} sub={props.me.directoryConfigured ? "search the directory, or a handle / server URL" : "by server URL (no directory on this server)"}>
        <div class="form">
          {props.me.directoryConfigured && (
            <div class="field">
              <label for="fr-q">SEARCH</label>
              <input class="inp" id="fr-q" value={q} placeholder="name or handle (listed people only)" autocomplete="off" onInput={(x) => setQ((x.target as HTMLInputElement).value)} />
              {results.length > 0 && (
                <table class="t fr-results"><tbody>
                  {results.map((u) => (
                    <tr>
                      <td class="hi">{u.name ?? u.handle}</td><td>@{u.handle}</td><td class="dim">{host(u.server)}</td>
                      <td>{known.has(u.server) ? <span class="faint">added</span> : <button class="btn" disabled={busy} onClick={() => add(u.handle)}>ADD</button>}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
              {q.trim().length >= 2 && !results.length && <span class="faint">no listed matches; unlisted people can still be added by exact handle</span>}
            </div>
          )}
          <div class="field">
            <label for="fr-target">{props.me.directoryConfigured ? "HANDLE OR SERVER URL" : "SERVER URL"}</label>
            <input class="inp" id="fr-target" value={target} placeholder={props.me.directoryConfigured ? "@handle or https://gym.example.com" : "https://gym.example.com"} autocomplete="off" spellcheck={false} onInput={(x) => setTarget((x.target as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label for="fr-note">NOTE <span class="faint">(optional, 140)</span></label>
            <input class="inp" id="fr-note" value={note} maxLength={140} placeholder="who you are" onInput={(x) => setNote((x.target as HTMLInputElement).value)} />
          </div>
          <div class="field">
            <label>THEY'LL SEE</label>
            <Picker value={share} options={SHARE_OPTS} onChange={setShare} label="What this friend can see" />
            <span class="note">{SHARE_TEXT[share]}. Only after they accept.</span>
          </div>
          <div><button class="btn pri" disabled={busy || !target.trim()} onClick={() => add(target)}><em>⏎</em>SEND REQUEST</button></div>
        </div>
      </Panel>

      <Panel n="2" title="REQUESTS" span={5} sub={`${incoming.length} in · ${outgoing.length} out`}>
        {!incoming.length && !outgoing.length && <div class="empty">No pending requests.</div>}
        {incoming.map((f) => (
          <div class="fr-req">
            <div><b class="hi">{who(f)}</b> {f.handle && <span>@{f.handle}</span>} <span class="dim">{host(f.server)}</span></div>
            {f.note && <div class="dim">“{f.note}”</div>}
            <div class="faint">key {f.fingerprint} · {ago(f.since)}</div>
            <div class="fr-row">
              <Picker value={accShare[f.id] ?? "basic"} options={SHARE_OPTS} onChange={(v) => setAccShare({ ...accShare, [f.id]: v })} label="What they can see" />
              <button class="btn pri" disabled={busy} onClick={() => act(() => social.accept(f.id, accShare[f.id] ?? "basic"), `You and ${who(f)} are friends`)}>ACCEPT</button>
              <button class="btn" disabled={busy} onClick={() => act(() => social.reject(f.id), "Request declined")}>REJECT</button>
            </div>
          </div>
        ))}
        {outgoing.map((f) => (
          <div class="fr-req">
            <div><b class="hi">{who(f)}</b> <span class="dim">{host(f.server)}</span> <span class="faint">· waiting · sent {ago(f.since)}</span></div>
            <div class="fr-row"><span class="dim">they'll see: {f.share.toUpperCase()}</span><button class="btn" disabled={busy} onClick={() => act(() => social.remove(f.id), "Request cancelled")}>CANCEL</button></div>
          </div>
        ))}
      </Panel>

      <Panel n="3" title="FRIENDS" span={12} sub="'they see' is what you share with each friend; change it any time">
        {!current.length ? <div class="empty">No friends yet.</div> : (
          <div class="fr-friends">
            {current.map((f) => (
              <div class="fr-friend">
                <div class="fr-who">
                  <button class="fr-author" onClick={() => props.go("f", f.id)}>{who(f)}</button> {f.handle && <span class="dim">@{f.handle}</span>}
                  <div class="faint">{host(f.server)} · key {f.fingerprint} · fetched {f.lastSeen ? ago(f.lastSeen) : "never"}</div>
                </div>
                <div class="fr-row">
                  <span class="faint">THEY SEE</span>
                  <Picker value={f.share} options={SHARE_OPTS} onChange={(v) => act(() => social.setShare(f.id, v), `${who(f)} now sees ${v.toUpperCase()}`)} label={`What ${who(f)} can see`} />
                  <span class="faint">YOU SEE</span> <span class="dim">{f.theirShare?.toUpperCase() ?? "—"}</span>
                </div>
                <div class="fr-row">
                  <button class="btn" onClick={() => props.go("f", f.id)}>VIEW</button>
                  <button class="btn" disabled={busy} onClick={() => confirm(`Unfriend ${who(f)}? They stop seeing your training, and their reactions and comments here are deleted.`) && act(() => social.remove(f.id), `Unfriended ${who(f)}`)}>REMOVE</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel n="4" title="YOU" span={6}>
        <div class="kv"><span>handle</span><span class="hi">@{props.me.handle}</span></div>
        <div class="kv"><span>name</span><span>{props.me.name}</span></div>
        <div class="kv"><span>server</span><span>{props.me.server}</span></div>
        <div class="kv"><span>directory</span><span>{props.me.directory ? `${host(props.me.directory)} · ${props.me.listed ? "listed" : "unlisted"}` : props.me.directoryConfigured ? "not registered" : "none configured"}</span></div>
        <div class="kv"><span>key fingerprint</span><span>{props.me.fingerprint}</span></div>
        {props.me.directory && <div style={{ marginTop: "8px" }}><button class="btn" disabled={busy} onClick={() => confirm("Remove your handle from the directory? Friends keep working; new people can add you only by server URL.") && act(() => social.unregister(), "Removed from the directory")}>REMOVE FROM DIRECTORY</button></div>}
      </Panel>
      <Panel n="5" title="PRIVACY" span={6}><Privacy me={props.me} /></Panel>
    </>
  );
}

// ───────── one friend: profile + compare + their feed ─────────

function graphCells(g: SocialProfile["graph"]): { cells: Map<string, DayCell>; end: string } {
  const cells = new Map<string, DayCell>();
  g.levels.forEach((lv, i) => { const date = addDays(g.start, i); if (lv > 0) cells.set(date, { date, value: lv, level: lv, workouts: [] }); });
  return { cells, end: addDays(g.start, Math.max(0, g.levels.length - 1)) };
}

function FriendDetail(props: { me: SocialMe; friend?: Friend; id: string; say: (m: string, e?: boolean) => void; go: (t: FriendsTab, id?: string) => void }) {
  const [p, setP] = useState<{ profile: SocialProfile; stale: boolean } | null>(null);
  const [cmp, setCmp] = useState<(Compare & { stale: boolean }) | null>(null);
  const [feed, setFeed] = useState<{ items: AuthoredItem[]; next: string | null } | null>(null);
  const [e, setE] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const f = props.friend;
  const load = async (fresh = false) => {
    setBusy(true); setE(null);
    try {
      // profile first: compare reuses the copy it just cached
      const [a, c] = await Promise.all([social.profile(props.id, fresh), social.friendFeed(props.id, { fresh })]);
      const b = await social.compare(props.id);
      setP(a); setCmp(b); setFeed(c);
    } catch (x) { setE(errMsg(x)); }
    setBusy(false);
  };
  useEffect(() => { load(); }, [props.id]);
  const g = useMemo(() => (p ? graphCells(p.profile.graph) : null), [p]);
  if (!f) return <Panel title="FRIEND" span={12}><div class="empty">Not a friend (any more).</div><button class="btn" onClick={() => props.go("people")}>PEOPLE</button></Panel>;
  const pr = p?.profile;
  const unit = pr?.unit ?? null;

  return (
    <>
      <Panel n="1" title={who(f).toUpperCase()} span={12} sub={`${f.handle ? "@" + f.handle + " · " : ""}${host(f.server)} · they see ${f.share.toUpperCase()} · you see ${(pr?.share ?? f.theirShare ?? "?").toUpperCase()}`}
        act={<><button class="btn" onClick={() => props.go("feed")}>← FEED</button><button class="btn" disabled={busy} onClick={() => load(true)}>{busy ? "…" : "REFRESH"}</button></>}>
        {e && <div class="warnbox">{e}</div>}
        {p?.stale && <div class="note am">Their server didn't answer: this is the last saved copy ({ago(pr!.updatedAt)}).</div>}
        {pr && (
          <>
            <div class="kpis fr-kpis">
              <div class="kpi"><label>WEEK STREAK</label><div class="v">{pr.streak.current}<small>wk</small></div><div class="d">best {pr.streak.best}wk</div></div>
              <div class="kpi"><label>THIS WEEK</label><div class="v">{pr.week.done}<small>/ {pr.week.target}</small></div><div class="d">sessions</div></div>
              <div class="kpi"><label>SESSIONS · 52W</label><div class="v">{pr.sessions52}</div><div class="d">{pr.program ?? (pr.share === "basic" ? "program hidden" : "no program")}</div></div>
              {pr.bodyweight != null && <div class="kpi"><label>BODYWEIGHT</label><div class="v">{fmt(pr.bodyweight)}<small>{unit}</small></div><div class="d">latest</div></div>}
            </div>
            {g && <Heatmap cells={g.cells} today={g.end} label={(c, date) => `${shortDate(date)}\n${c ? `trained · level ${c.level}` : "rest"}`} />}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}><span class="faint" style={{ fontSize: "var(--fs-s)" }}>levels only: no volumes are shared</span><Legend /></div>
          </>
        )}
      </Panel>

      {pr && (
        <Panel n="2" title="LIFTS" span={5} sub={unit ? `e1RM · ${unit}` : "weights hidden at BASIC"}>
          <table class="t">
            <thead><tr><th>LIFT</th><th class="r">e1RM</th><th class="r">BEST</th></tr></thead>
            <tbody>{pr.lifts.map((l) => <tr><td>{l.name}</td><td class="r hi">{l.e1rm != null ? fmt(l.e1rm, 0) : "—"}</td><td class="r">{l.best != null ? fmt(l.best) : "—"}</td></tr>)}</tbody>
          </table>
        </Panel>
      )}

      {cmp && <ComparePanel c={cmp} />}

      <Panel n="4" title="THEIR FEED" span={12}>
        {!feed ? <div class="empty">loading…</div> : !feed.items.length ? <div class="empty">Nothing in the last year.</div> : (
          <div class="fr-list">
            {feed.items.map((it) => <ItemCard key={it.id} it={it} unit={it.unit} meServer={props.me.server} friend={f.id} say={props.say} />)}
            {feed.next && <button class="btn" onClick={async () => { const r = await social.friendFeed(props.id, { before: feed.next }); setFeed({ items: [...feed.items, ...r.items], next: r.next }); }}>MORE</button>}
          </div>
        )}
      </Panel>
    </>
  );
}

function ComparePanel(props: { c: Compare & { stale: boolean } }) {
  const { c } = props;
  const bw = c.lifts.some((l) => l.meBw !== undefined);
  const max = Math.max(1, ...c.weeks.flatMap((w) => [w.me, w.them]));
  return (
    <Panel n="3" title="COMPARE" span={7} sub={`their numbers in your unit (${c.unit})${c.stale ? " · saved copy" : ""}`}>
      <div class="tbl-wrap">
        <table class="t fr-cmp">
          <thead><tr><th>e1RM</th><th class="r">YOU</th><th class="r">{who(c.friend).toUpperCase()}</th><th class="r">Δ</th>{bw && <><th class="r">YOU ×BW</th><th class="r">THEM ×BW</th></>}</tr></thead>
          <tbody>
            {c.lifts.map((l) => {
              const d = l.me != null && l.them != null ? l.me - l.them : null;
              return (
                <tr>
                  <td>{l.name}</td>
                  <td class="r hi">{l.me != null ? fmt(l.me, 0) : "—"}</td>
                  <td class="r">{l.them != null ? fmt(l.them, 0) : "—"}</td>
                  <td class={`r ${d == null ? "faint" : d > 0 ? "up" : d < 0 ? "down" : "dim"}`}>{d == null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d), 0)}`}</td>
                  {bw && <><td class="r">{l.meBw != null ? fmt(l.meBw, 2) : "—"}</td><td class="r">{l.themBw != null ? fmt(l.themBw, 2) : "—"}</td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!bw && <p class="note">Bodyweight multiples appear when you both share FULL.</p>}
      <div class="fr-weeks" role="img" aria-label="training days per week, last 12 weeks">
        {c.weeks.map((w) => (
          <div title={`week of ${shortDate(w.week)}: you ${w.me}, them ${w.them}`}>
            <i class="me" style={{ height: `${(w.me / max) * 100}%` }} /><i class="them" style={{ height: `${(w.them / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div class="fr-legend"><span><i class="me" /> you</span><span><i class="them" /> {who(c.friend)}</span><span class="faint">training days / week · 12 wk</span><span class="r">streak <b class="hi">{c.streak.me}</b> vs <b>{c.streak.them}</b> wk</span></div>
    </Panel>
  );
}

// ───────── my activity, alerts ─────────

function Mine() {
  const [d, setD] = useState<{ items: FeedItem[]; next: string | null; unit: "kg" | "lb" | null } | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { social.mine().then(setD).catch(() => setD({ items: [], next: null, unit: null })); }, []);
  const shown = (d?.items ?? []).filter((x) => all || x.reactions.length || x.comments.length);
  return (
    <Panel n="1" title="MY ACTIVITY" span={12} sub="your sessions, PRs and achievements as friends see them, with what they left"
      act={<Seg value={all ? "all" : "rx"} onChange={(v) => setAll(v === "all")} options={[["rx", "WITH REACTIONS"], ["all", "ALL"]]} />}>
      {!d ? <div class="empty">loading…</div> : !shown.length ? <div class="empty">{all ? "Nothing in the last year." : "No reactions or comments yet (in the latest 50 items)."}</div> : (
        <div class="fr-list">
          {shown.map((it) => <ItemCard key={it.id} it={it} unit={d.unit} meServer="" />)}
          {d.next && <button class="btn" onClick={async () => { const r = await social.mine(d.next); setD({ ...r, items: [...d.items, ...r.items] }); }}>MORE</button>}
        </div>
      )}
    </Panel>
  );
}

function Alerts(props: { onRead: () => void; go: (t: FriendsTab, id?: string) => void }) {
  const [items, setItems] = useState<Notification[] | null>(null);
  useEffect(() => {
    social.notifications().then(async (r) => {
      setItems(r.items);
      if (r.unread) { await social.readAll().catch(() => {}); props.onRead(); }
    }).catch(() => setItems([]));
  }, []);
  const what = (id?: string) => {
    if (!id) return "your post";
    if (id.startsWith("w:")) return "your session";
    if (id.startsWith("a:")) return "your achievement";
    const lift = id.split(":")[2];
    return `your ${lift ? (LIFTS[lift]?.name ?? lift) + " " : ""}PR`;
  };
  const line = (n: Notification) =>
    n.kind === "request" ? <>wants to be friends{n.text ? <span class="dim"> · “{n.text}”</span> : null}</>
    : n.kind === "accepted" ? <>accepted: you're friends</>
    : n.kind === "reaction" ? <>reacted {n.emoji} to <span class="dim">{what(n.item)}</span></>
    : <>commented on <span class="dim">{what(n.item)}</span>: “{n.text}”</>;
  return (
    <Panel n="1" title="ALERTS" span={12}>
      {!items ? <div class="empty">loading…</div> : !items.length ? <div class="empty">Nothing yet.</div> : (
        <table class="t fr-alerts"><tbody>
          {items.map((n) => (
            <tr class={`click ${n.read ? "" : "unread"}`} onClick={() => props.go(n.kind === "request" ? "people" : n.kind === "accepted" ? "f" : "mine", n.kind === "accepted" ? n.from.id : undefined)}>
              <td class="faint">{ago(n.at)}</td>
              <td><b class="hi">{who(n.from)}</b> {line(n)}</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </Panel>
  );
}
