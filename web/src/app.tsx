import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { BIG_FOUR, LIFTS } from "../shared/lifts";
import type { GraphMetric } from "../shared/stats";
import { fmt } from "../shared/units";
import { api, ApiError, social, type Bootstrap } from "./api";
import { Tip } from "./charts";
import { derive } from "./derive";
import { ago } from "./ui";
import { Dash } from "./views/dash";
import { History } from "./views/history";
import { Lifts } from "./views/lifts";
import { Program } from "./views/program";
import { Setup } from "./views/setup";
import { Gym } from "./views/gym";
import { Stats } from "./views/stats";
import { Calendar } from "./views/calendar";
import { Insights } from "./views/insights";
import { Body } from "./views/body";
import { Friends } from "./views/friends";

export type View = "dash" | "gym" | "cal" | "prog" | "lifts" | "stats" | "ins" | "body" | "hist" | "set" | "friends";
export interface Route { view: View; lift?: string; date?: string; workout?: string; tab?: string; id?: string }
export type Nav = (r: Route) => void;

const VIEWS: { v: View; key: string; label: string; short: string }[] = [
  { v: "dash", key: "F1", label: "DASHBOARD", short: "DASH" },
  { v: "gym", key: "F2", label: "GYM", short: "GYM" },
  { v: "cal", key: "F3", label: "CALENDAR", short: "CAL" },
  { v: "prog", key: "F4", label: "PROGRAM", short: "PROG" },
  { v: "lifts", key: "F5", label: "LIFTS", short: "LIFTS" },
  { v: "stats", key: "F6", label: "STATS", short: "STATS" },
  { v: "ins", key: "F7", label: "INSIGHTS", short: "NERD" },
  { v: "body", key: "F8", label: "BODY", short: "BODY" },
  { v: "hist", key: "F9", label: "HISTORY", short: "HIST" },
  { v: "set", key: "F10", label: "SETUP", short: "SETUP" },
  { v: "friends", key: "F11", label: "FRIENDS", short: "FRND" },
];
// Phone tab bar: the four most used, the rest behind MORE.
const TABS: View[] = ["dash", "gym", "prog", "lifts"];

function parseHash(): Route {
  const [v, a, b] = location.hash.replace(/^#\/?/, "").split("/");
  const view = (VIEWS.find((x) => x.v === v)?.v ?? "dash") as View;
  if (view === "lifts") return { view, lift: a };
  if (view === "friends") return { view, tab: a || undefined, id: b || undefined };
  if (view === "set" && a === "programs") return { view, tab: a, id: b ? decodeURIComponent(b) : undefined };
  if (view === "hist") return a?.match(/^\d{4}-\d\d-\d\d$/) ? { view, date: a } : { view, workout: a };
  return { view };
}
const toHash = (r: Route) => `#${r.view}${r.lift ? "/" + r.lift : r.date ? "/" + r.date : r.workout ? "/" + r.workout : r.tab ? "/" + r.tab + (r.id ? "/" + r.id : "") : ""}`;

interface Cmd { key: string; label: string; run: () => void }

export function App() {
  const [b, setB] = useState<Bootstrap | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(parseHash());
  const [metric, setMetric] = useState<GraphMetric>("volume");
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState(0);

  const load = () =>
    api.bootstrap().then((x) => { setB(x); setMetric(x.settings.graphMetric ?? "volume"); }).catch((e) => {
      // Google sign-in happens on the server; send the browser there.
      if (e instanceof ApiError && e.status === 401 && e.auth === "google") location.href = `/auth/login?next=${encodeURIComponent(location.pathname)}`;
      else if (e instanceof ApiError && e.status === 401) setNeedLogin(true);
      else setErr(String(e.message ?? e));
    });

  useEffect(() => { load(); }, []);
  // Social notifications badge: a cheap poll of our own server (friends are never contacted for it).
  useEffect(() => {
    if (!b) return;
    const poll = () => social.me().then((m) => setUnread(m.enabled ? m.unread : 0)).catch(() => {});
    poll();
    const t = setInterval(poll, 60_000);
    return () => clearInterval(t);
  }, [!!b]);
  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener("hashchange", f);
    const t = setInterval(() => setClock(new Date()), 30_000);
    return () => { window.removeEventListener("hashchange", f); clearInterval(t); };
  }, []);

  const nav: Nav = (r) => {
    if (toHash(r) !== location.hash) location.hash = toHash(r);
    setRoute(r);
    document.querySelector(".main")?.scrollTo({ top: 0 });
  };
  const say = (msg: string, isErr = false) => { setToast({ msg, err: isErr }); setTimeout(() => setToast(null), 4000); };

  const d = useMemo(() => (b ? derive(b, metric) : null), [b, metric]);

  const doSync = async () => {
    if (b?.mode === "local") return say("No Hevy connected: Ironterm is your log. Set HEVY_API_KEY to sync from Hevy.", true);
    if (b?.mode !== "live") return say("Demo mode: add HEVY_API_KEY to .dev.vars to sync.", true);
    setBusy(true);
    try {
      const st = await api.sync();
      if (st.error) say(st.error, true);
      else say(`Synced: ${st.last?.added ?? 0} updated, ${st.last?.deleted ?? 0} deleted${st.backfill ? " (backfill continues)" : ""}`);
      await load();
    } catch (e) { say(String((e as Error).message), true); }
    setBusy(false);
  };
  const doPush = async (day?: number) => {
    if (b?.mode === "local") return say("No Hevy connected: routines live in PROGRAM and GYM here. Set HEVY_API_KEY to push them to Hevy.", true);
    if (b?.mode !== "live") return say("Demo mode: add HEVY_API_KEY to push routines.", true);
    setBusy(true);
    try {
      const r = await api.push(day);
      say(`Pushed ${r.pushed.map((p) => p.title).join(", ")} to Hevy`);
      await load();
    } catch (e) { say(String((e as Error).message), true); }
    setBusy(false);
  };

  // ───────── command line ─────────
  const cmds: Cmd[] = useMemo(() => {
    const list: Cmd[] = VIEWS.map((x) => ({ key: x.short, label: x.label, run: () => nav({ view: x.v }) }));
    for (const l of d?.liftKeys ?? BIG_FOUR) {
      list.push({ key: LIFTS[l]?.short.replace(/ /g, "") ?? l, label: `${LIFTS[l]?.name} detail`, run: () => nav({ view: "lifts", lift: l }) });
    }
    list.push({ key: "SQ", label: "Back Squat detail", run: () => nav({ view: "lifts", lift: "squat" }) });
    list.push({ key: "DL", label: "Deadlift detail", run: () => nav({ view: "lifts", lift: "deadlift" }) });
    if (b?.mode !== "local") {
      list.push({ key: "SYNC", label: "Pull new workouts from Hevy", run: doSync });
      list.push({ key: "PUSH", label: "Push next sessions to Hevy routines", run: () => doPush() });
    }
    list.push({ key: "VOL", label: "Graph by volume", run: () => setMetric("volume") });
    list.push({ key: "SETS", label: "Graph by sets", run: () => setMetric("sets") });
    list.push({ key: "TIME", label: "Graph by duration", run: () => setMetric("duration") });
    if (b?.auth === "password") list.push({ key: "LOGOUT", label: "Sign out", run: () => api.logout().then(() => location.reload()) });
    return list;
  }, [d, b]);

  const [q, setQ] = useState("");
  const [sugIdx, setSugIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const sugg = q ? cmds.filter((c) => c.key.startsWith(q.toUpperCase().replace(/<GO>|\s/g, "")) || c.label.toUpperCase().includes(q.toUpperCase())).slice(0, 7) : [];
  const runCmd = (c?: Cmd) => {
    const hit = c ?? sugg[sugIdx] ?? cmds.find((x) => x.key === q.toUpperCase().trim());
    if (hit) hit.run();
    else if (q) say(`Unknown command "${q.toUpperCase()}". Try DASH, PROG, SQ, SYNC, PUSH.`, true);
    setQ("");
    inputRef.current?.blur();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.matches?.("input, select, textarea");
      const f = /^F(\d{1,2})$/.exec(e.key);
      if (f && !VIEWS[Number(f[1]) - 1]) return;
      if (f) { e.preventDefault(); nav({ view: VIEWS[Number(f[1]) - 1].v }); return; }
      if (typing) return;
      if (e.key === "/" || e.key === ":") { e.preventDefault(); inputRef.current?.focus(); return; }
      if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && VIEWS[Number(e.key) - 1]) nav({ view: VIEWS[Number(e.key) - 1].v });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (needLogin) return <Login onDone={() => { setNeedLogin(false); load(); }} />;
  if (err) return <div class="login"><div class="warnbox">{err}</div></div>;
  if (!b || !d) return <div class="login"><span class="am">LOADING <span class="faint">IRONTERM &lt;GO&gt;</span></span></div>;

  const live = b.mode === "live";
  const local = b.mode === "local";
  const next = d.next;

  return (
    <div class="shell">
      <header class="cmd">
        <button class="brand" onClick={() => nav({ view: "dash" })}>IRONTERM</button>
        <div class="prompt">
          <span>&gt;</span>
          <input
            ref={inputRef}
            id="cmd"
            value={q}
            placeholder="SQ · PROG · SYNC · PUSH   ( / )"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => { setQ((e.target as HTMLInputElement).value); setSugIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") runCmd();
              else if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); }
              else if (e.key === "ArrowDown") { e.preventDefault(); setSugIdx((i) => Math.min(i + 1, sugg.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSugIdx((i) => Math.max(i - 1, 0)); }
            }}
          />
          <span class="go">&lt;GO&gt;</span>
          {sugg.length > 0 && (
            <div class="suggest">
              {sugg.map((c, i) => <button class={i === sugIdx ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); runCmd(c); }}>{c.key}<em>{c.label}</em></button>)}
            </div>
          )}
        </div>
        <div class="meta">
          <span class={`badge ${b.mode}`} title={local ? "No Hevy: workouts are stored and logged here" : undefined}><i class="dot" />{b.mode.toUpperCase()}</span>
          {b.auth === "none" && b.mode !== "demo" && <span class="badge warn" title="No Access or password configured">OPEN</span>}
          {unread > 0 && <button class="badge social" title={`${unread} new from friends`} onClick={() => nav({ view: "friends", tab: "alerts" })}>FRIENDS · {unread}</button>}
          {!local && <button class="btn" style={{ border: 0, height: "100%" }} disabled={busy} onClick={doSync} title="Sync now">{busy ? "…" : "SYNC"} <span class="faint">{live ? ago(b.sync.at) : ""}</span></button>}
          <span class="unit faint">{d.unit.toUpperCase()}</span>
          <span class="clock dim">{clock.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: d.tz })}</span>
        </div>
      </header>

      <aside class="side">
        <nav class="fkeys">
          {VIEWS.map((x) => (
            <button class={route.view === x.v ? "on" : ""} onClick={() => nav({ view: x.v })}><em>{x.key}</em>{x.label}</button>
          ))}
        </nav>
        {next && d.def && (
          <div class="side-sec">
            <h4>NEXT · {next.dayId}</h4>
            {next.exercises.map((e) => (
              <div class="kv"><span>{e.tier} {LIFTS[e.lift]?.short}</span><span class="hi">{e.scheme.includes("RM") ? "5RM" : fmt(Math.max(...e.sets.map((s) => s.weight)))}</span></div>
            ))}
          </div>
        )}
        <div class="side-sec">
          <h4>e1RM · {d.unit}</h4>
          {d.liftKeys.filter((l) => (d.e1rmNow(l) ?? 0) > 0).slice(0, 6).map((l) => {
            return (
              <div class="kv" style={{ cursor: "pointer" }} onClick={() => nav({ view: "lifts", lift: l })}>
                <span>{LIFTS[l]?.short}</span><span class="hi">{fmt(d.e1rmNow(l) ?? 0, 0)}</span>
              </div>
            );
          })}
        </div>
        <div class="side-sec">
          <h4>STATUS</h4>
          <div class="kv"><span>workouts</span><span>{d.workouts.length}</span></div>
          <div class="kv"><span>synced</span><span>{live ? ago(b.sync.at) : local ? "local" : "demo"}</span></div>
          <div class="kv"><span>access</span><span class={b.auth === "none" ? "down" : "up"}>{b.auth.toUpperCase()}</span></div>
        </div>
      </aside>

      <main class="main">
        {route.view === "dash" && <Dash d={d} metric={metric} setMetric={setMetric} nav={nav} />}
        {route.view === "gym" && <Gym b={b} d={d} onSaved={(m) => say(m, m.startsWith("Couldn't"))} onReload={load} />}
        {route.view === "body" && <Body d={d} cfg={b.program} nav={nav} />}
        {route.view === "ins" && <Insights d={d} b={b} nav={nav} onReload={load} />}
        {route.view === "cal" && <Calendar b={b} d={d} nav={nav} onSettings={async (patch) => { await api.saveSettings({ ...b.settings, ...patch }); load(); }} />}
        {route.view === "stats" && <Stats b={b} d={d} onSettings={async (patch) => { await api.saveSettings({ ...b.settings, ...patch }); load(); }} />}
        {route.view === "prog" && <Program d={d} cfg={b.program} mode={b.mode} nav={nav} onPush={doPush} busy={busy} onReload={load} say={say} />}
        {route.view === "lifts" && <Lifts d={d} lift={route.lift} nav={nav} />}
        {route.view === "hist" && <History d={d} mode={b.mode} date={route.date} workout={route.workout} nav={nav} onSaved={(m) => { say(m, m.startsWith("Couldn't")); load(); }} />}
        {route.view === "set" && <Setup b={b} program={route.tab === "programs" ? route.id : undefined} nav={nav} onSaved={(m) => { say(m, m.startsWith("Couldn't")); load(); }} />}
        {route.view === "friends" && <Friends key={`${route.tab ?? ""}/${route.id ?? ""}`} tab={route.tab} id={route.id} nav={nav} say={say} onUnread={setUnread} />}
      </main>

      <footer class="status">
        <span><b>F1–F11</b> views</span>
        <span><b>/</b> command</span>
        <span><b>SQ BENCH DL OHP</b> lifts</span>
        {!local && <span><b>SYNC PUSH</b> hevy</span>}
        <span class="r">{d.def ? `${d.def.name} · next ${next?.dayId}` : "no program"} · {live ? "api.hevyapp.com" : local ? "local log" : "demo data"}</span>
      </footer>

      <nav class="tabbar">
        {VIEWS.filter((x) => TABS.includes(x.v)).map((x) => (
          <button class={route.view === x.v && !more ? "on" : ""} onClick={() => { setMore(false); nav({ view: x.v }); }}><em>{x.key}</em>{x.short}</button>
        ))}
        <button class={!TABS.includes(route.view) || more ? "on" : ""} onClick={() => setMore(!more)}><em>···</em>MORE</button>
      </nav>
      {more && (
        <div class="more-sheet" onClick={() => setMore(false)}>
          <div class="more-list" onClick={(e) => e.stopPropagation()}>
            {VIEWS.filter((x) => !TABS.includes(x.v)).map((x) => (
              <button class={route.view === x.v ? "on" : ""} onClick={() => { setMore(false); nav({ view: x.v }); }}><em>{x.key}</em>{x.label}</button>
            ))}
          </div>
        </div>
      )}

      <Tip />
      {toast && <div class={`toast ${toast.err ? "err" : ""}`} role="status">{toast.msg}</div>}
    </div>
  );
}

function Login(props: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [e, setE] = useState<string | null>(null);
  return (
    <div class="login">
      <form onSubmit={async (ev) => { ev.preventDefault(); try { await api.login(pw); props.onDone(); } catch (x) { setE(String((x as Error).message)); } }}>
        <div><span class="brand" style={{ display: "inline-flex", padding: "2px 8px" }}>IRONTERM</span> <span class="am">LOGIN &lt;GO&gt;</span></div>
        <input class="inp" id="pw" type="password" autofocus placeholder="password" value={pw} onInput={(x) => setPw((x.target as HTMLInputElement).value)} />
        {e && <div class="warnbox">{e}</div>}
        <button class="btn pri" type="submit">ENTER</button>
      </form>
    </div>
  );
}
