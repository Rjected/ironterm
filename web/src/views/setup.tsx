import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import { allSlots, type ProgramConfig } from "../../shared/program";
import { buildProgram, defaultConfig, getTemplate } from "../../shared/programs";
import { DOW } from "../../shared/recovery";
import { trainingDays } from "../../shared/schedule";
import { api, type Bootstrap, type Settings } from "../api";
import type { Nav } from "../app";
import { Panel, Seg, ago } from "../ui";
import { ProgramBrowser, ProgramPage, SetupEditor } from "./browser";
import { Picker } from "../components/picker";
import { AppsPanel } from "./apps";
import { ImportPanel } from "./import";

const narrow = () => typeof matchMedia !== "undefined" && matchMedia("(max-width: 699px)").matches;
// list scroll position on phones, restored when you come back from a program page
let listScroll = 0;

export function Setup(props: { b: Bootstrap; program?: string; nav: Nav; onSaved: (msg: string) => void }) {
  const { b } = props;
  const [s, setS] = useState<Settings>(b.settings);
  const [cfg, setCfg] = useState<ProgramConfig>(() => b.program ?? defaultConfig("gzclp", b.settings.unit, `${b.today}T00:00:00Z`));
  const [templates, setTemplates] = useState<{ id: string; title: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [phone, setPhone] = useState(narrow());
  // desktop: the program shown on the right (phones use the #set/programs/<id> route)
  const [picked, setPicked] = useState<string | null>(props.program ?? b.program?.templateId ?? null);
  const def = buildProgram(cfg);
  const live = b.mode === "live";
  const local = b.mode === "local";
  const openId = phone ? props.program ?? null : props.program ?? picked;

  useEffect(() => { setCfg(b.program ?? defaultConfig("gzclp", b.settings.unit, `${b.today}T00:00:00Z`)); setS(b.settings); setDirty(false); }, [b]);
  useEffect(() => {
    const mq = matchMedia("(max-width: 699px)");
    const f = () => setPhone(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  useEffect(() => { if (props.program) setPicked(props.program); }, [props.program]);
  // back on the list (phones): put the scroll position back
  const wasOpen = useRef(!!props.program);
  useLayoutEffect(() => {
    if (phone && wasOpen.current && !props.program) document.querySelector(".main")?.scrollTo({ top: listScroll });
    wasOpen.current = !!props.program;
  }, [props.program, phone]);

  const startFresh = async () => {
    if (!confirm("Start fresh without Hevy? The demo data goes away and Ironterm keeps your own log: import a Strong export or log sessions in GYM.")) return;
    await api.setMode("local");
    props.onSaved("Local mode: Ironterm is now your training log");
  };

  useEffect(() => { if (live) api.templates().then(setTemplates).catch(() => {}); }, [live]);

  const edit = (f: (c: ProgramConfig) => ProgramConfig) => { setCfg(f); setDirty(true); };

  const pick = (id: string) => {
    if (phone) {
      listScroll = document.querySelector(".main")?.scrollTop ?? 0;
      openedHere.current = true;
      location.hash = `#set/programs/${encodeURIComponent(id)}`;
      document.querySelector(".main")?.scrollTo({ top: 0 });
    } else {
      setPicked(id);
      history.replaceState(null, "", `#set/programs/${encodeURIComponent(id)}`);
    }
  };
  // opened from the list in this tab: go back in history (so the browser's back and ours agree)
  const openedHere = useRef(false);
  const back = () => {
    if (openedHere.current) history.back();
    else props.nav({ view: "set" });
  };

  const save = async () => {
    try {
      await api.saveSettings(s);
      if (b.program) await api.saveProgram(cfg);
    } catch (e) {
      props.onSaved(`Couldn't save: ${(e as Error).message}`);
      return false;
    }
    setDirty(false);
    props.onSaved(b.program ? "Saved. Program replayed from " + cfg.startDate.slice(0, 10) : "Saved");
    return true;
  };

  const slots = def ? allSlots(def) : [];
  const usedLifts = [...new Set(slots.map((x) => x.lift))];
  const origin = typeof location !== "undefined" ? location.origin : "";
  const days = trainingDays(s.trainingDays, def);
  const per = def ? Math.round(def.sessionsPerWeek) : 0;

  const editor = (close: () => void) => (
    <div class="pp-start">
      <h5>EDIT SETUP{dirty ? " *" : ""}</h5>
      <SetupEditor cfg={cfg} setCfg={edit} onUnit={(u) => setS({ ...s, unit: u })} />
      <div class="field">
        <label>TRAINING DAYS <span class="faint">· {days.length} picked{days.length !== per ? ` · program has ${per} a week` : ""}</span></label>
        <div class="chips dow" role="group" aria-label="Training days">
          {DOW.map((n, i) => (
            <button class={days.includes(i) ? "on" : ""} aria-pressed={days.includes(i)} onClick={() => { setS({ ...s, trainingDays: days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort() }); setDirty(true); }}>{n}</button>
          ))}
        </div>
      </div>
      <div class="pp-acts">
        <button class={`btn ${dirty ? "pri" : ""}`} id="save-setup" onClick={async () => { if (await save()) close(); }}
><em>⏎</em>SAVE{dirty ? " *" : ""}</button>
        <button class="btn" onClick={() => { setCfg(b.program ?? cfg); setS(b.settings); setDirty(false); close(); }}>CANCEL</button>
      </div>
    </div>
  );

  const page = openId ? (
    <ProgramPage key={openId} id={openId} b={b} onBack={phone ? back : undefined} onOpen={pick} onSaved={props.onSaved} editor={b.program?.templateId === openId ? editor : undefined} />
  ) : <div class="empty">Pick a program to see its rules and workouts.</div>;

  // phones: a program is its own full-screen page
  if (phone && props.program) return <div class="grid"><section class="pn span-12 pp-full">{page}</section></div>;

  return (
    <div class="grid">
      <Panel n="1" title="PROGRAMS" span={12} sub={b.program ? `active: ${getTemplate(b.program.templateId)?.name ?? b.program.templateId}` : "no active program"}>
        {phone ? (
          <ProgramBrowser selected={null} active={b.program?.templateId ?? null} onPick={pick} />
        ) : (
          <div class="psplit">
            <div class="psplit-list"><ProgramBrowser selected={openId} active={b.program?.templateId ?? null} onPick={pick} /></div>
            <div class="psplit-page">{page}</div>
          </div>
        )}
      </Panel>

      <Panel n="2" title="LIFT MAPPING" span={6} act={<button class={`btn ${dirty ? "pri" : ""}`} onClick={save}><em>⏎</em>SAVE{dirty ? " *" : ""}</button>} sub={live ? "which Hevy exercise counts as each lift" : "logged exercise names that count as each lift"}>
        <div class="tbl-wrap">
          <table class="t">
            <tbody>
              {usedLifts.map((l) => (
                <tr>
                  <td>{LIFTS[l]?.name}</td>
                  <td class="l" style={{ width: "60%" }}>
                    {live && templates.length ? (
                      <Picker id={`map-${l}`} label={`Hevy exercise for ${LIFTS[l]?.name ?? l}`} value={cfg.liftMap?.[l] ?? ""} width="100%"
                        options={[{ value: "", label: `auto: ${LIFTS[l]?.hevy.join(" / ")}` }, ...templates.map((t) => ({ value: t.id, label: t.title }))]}
                        onChange={(v) => edit((c) => { const m = { ...c.liftMap }; if (v) m[l] = v; else delete m[l]; return { ...c, liftMap: m }; })} />
                    ) : <span class="dim">{LIFTS[l]?.hevy.join(" / ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel n="3" title="SETTINGS" span={6} act={<button class={`btn ${dirty ? "pri" : ""}`} onClick={save}><em>⏎</em>SAVE{dirty ? " *" : ""}</button>}>
        <div class="form">
          <div class="field">
            <label for="tz">TIME ZONE</label>
            <input class="inp" id="tz" value={s.tz} onInput={(e) => { setS({ ...s, tz: (e.target as HTMLInputElement).value }); setDirty(true); }} />
          </div>
          {live && (
            <div class="field">
              <label>AUTO-UPDATE HEVY ROUTINES AFTER EACH WORKOUT</label>
              <Seg value={s.autoPush ? "on" : "off"} options={[["on", "ON"], ["off", "OFF"]]} onChange={(v) => { setS({ ...s, autoPush: v === "on" }); setDirty(true); }} />
            </div>
          )}
        </div>
      </Panel>

      <Panel n="4" title="CONNECTION" span={12}>
        <div class="form" style={{ maxWidth: "none", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div class="field">
            <label>MODE</label>
            <div>{live ? <span class="up">LIVE · {b.sync.count ?? 0} workouts · synced {ago(b.sync.at)}</span>
              : local ? <span class="hi">LOCAL · {b.workouts.length} workouts · no Hevy, Ironterm is the log</span>
              : <span class="am">DEMO · sample data</span>}</div>
            {b.sync.error && <div class="warnbox">{b.sync.error}</div>}
            {b.mode === "demo" && (
              <>
                <p class="note" style={{ margin: 0 }}>Use it with Hevy (set HEVY_API_KEY), import a Strong export below, or start with an empty log and record sessions in GYM.</p>
                <div><button class="btn" id="start-fresh" onClick={startFresh}>START FRESH (NO HEVY)</button></div>
              </>
            )}
            {local && <p class="note" style={{ margin: 0 }}>Set HEVY_API_KEY to switch to Hevy later; what's logged here stays.</p>}
          </div>
          <div class="field">
            <label>ACCESS</label>
            <div>{b.auth === "google" ? <span class="up">Google sign-in</span> : b.auth === "access" ? <span class="up">Cloudflare Access (Google)</span> : b.auth === "password" ? <span class="up">Password</span> : <span class="down">NONE: anyone with the URL can read this</span>}</div>
          </div>
          {live ? (
            <div class="field">
              <label>HEVY WEBHOOK (Settings › Developer › Webhooks)</label>
              <div class="code">URL     {origin}/api/hevy/webhook{"\n"}Header  Bearer &lt;WEBHOOK_SECRET&gt;</div>
            </div>
          ) : (
            <div class="field">
              <label>HEVY WEBHOOK</label>
              <div class="dim">Only used with Hevy: set HEVY_API_KEY, then point Hevy's webhook (Settings › Developer › Webhooks) at {origin}/api/hevy/webhook.</div>
            </div>
          )}
        </div>
      </Panel>

      <ImportPanel n="5" unit={s.unit} onDone={props.onSaved} />

      <AppsPanel n="6" />
    </div>
  );
}
