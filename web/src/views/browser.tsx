// Programs: the browsable list (search + filters + results) and a program's own page
// (ABOUT · RULES · WORKOUTS, START THIS PROGRAM). The page reads GET /api/app/programs/{id}, the
// same document the native apps render (docs/api/programs.md).

import { useEffect, useMemo, useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import { allSlots, lengthTag, programLength, schemeLabel, usesStartWeight, type LengthKind, type ProgramCategory, type ProgramConfig, type ProgramTemplate } from "../../shared/program";
import { getTemplate, TEMPLATES } from "../../shared/programs";
import { DOW } from "../../shared/recovery";
import { fmt, type Unit } from "../../shared/units";
import type { ProgramWeekExercise } from "../../shared/appapi";
import { api, type Bootstrap, type ProgramDetail } from "../api";
import { Picker } from "../components/picker";
import { Seg, Tier } from "../ui";
import "../programs.css";

const CATS: [ProgramCategory | "all", string][] = [
  ["all", "ALL"], ["gzcl", "GZCL"], ["novice", "NOVICE"], ["strength", "STRENGTH"], ["powerlifting", "PL"], ["hypertrophy", "HYPERTROPHY"], ["peaking", "PEAKING"],
];

// computed once: programLength builds each template
const LENGTHS = new Map(TEMPLATES.map((t) => [t.id, programLength(t)]));
const lengthOf = (t: ProgramTemplate) => LENGTHS.get(t.id) ?? programLength(t);

const meta = (t: ProgramTemplate) =>
  [`${t.daysPerWeek.join("/")}D/WK`, lengthTag(lengthOf(t)), t.level.toUpperCase()].join(" · ");

const LENGTH_CHIPS: [LengthKind | "any", string][] = [["any", "ANY LENGTH"], ["ongoing", "ONGOING"], ["cycles", "CYCLES FOREVER"], ["block", "BLOCKS"]];

export function ProgramBrowser(props: { selected: string | null; active: string | null; onPick: (id: string) => void }) {
  const [cat, setCat] = useState<ProgramCategory | "all">("all");
  const [days, setDays] = useState<number | 0>(0);
  const [len, setLen] = useState<LengthKind | "any">("any");
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    // "531" finds "5/3/1": compare letters and digits only
    const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const words = q.trim().split(/\s+/).map(norm).filter(Boolean);
    return TEMPLATES.filter((p) =>
      (cat === "all" || p.category === cat) &&
      (!days || p.daysPerWeek.includes(days)) &&
      (len === "any" || lengthOf(p).kind === len) &&
      (!words.length || words.every((w) => norm(`${p.name} ${p.author} ${p.summary}`).includes(w))),
    );
  }, [cat, days, len, q]);
  const counts = useMemo(() => Object.fromEntries(CATS.map(([c]) => [c, c === "all" ? TEMPLATES.length : TEMPLATES.filter((p) => p.category === c).length])), []);
  // show the selected program in the list when it opens (desktop two-pane)
  useEffect(() => { if (props.selected) document.querySelector(`.psplit-list .card[data-id="${CSS.escape(props.selected)}"]`)?.scrollIntoView({ block: "nearest" }); }, []);

  return (
    <div class="pb">
      <div class="pb-search">
        <input class="inp" id="prog-q" type="search" placeholder="search: smolov, sheiko, ppl…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <span class="faint">{list.length}</span>
      </div>
      <div class="chips" role="group" aria-label="Category">
        {CATS.filter(([c]) => counts[c]).map(([c, l]) => (
          <button class={c === cat ? "on" : ""} aria-pressed={c === cat} onClick={() => setCat(c)}>{l} <span class="n">{counts[c]}</span></button>
        ))}
      </div>
      <div class="chips" role="group" aria-label="Days per week">
        {([[0, "ANY DAYS"], [2, "2D"], [3, "3D"], [4, "4D"], [5, "5D"], [6, "6D"]] as const).map(([v, l]) => (
          <button class={v === days ? "on" : ""} aria-pressed={v === days} onClick={() => setDays(v)}>{l}</button>
        ))}
      </div>
      <div class="chips" role="group" aria-label="Length">
        {LENGTH_CHIPS.map(([v, l]) => (
          <button class={v === len ? "on" : ""} aria-pressed={v === len} onClick={() => setLen(v)}>{l}</button>
        ))}
      </div>
      <div class="cards pcards">
        {list.map((t) => (
          <button class={`card ${t.id === props.selected ? "on" : ""}`} data-id={t.id} onClick={() => props.onPick(t.id)}>
            <div class="card-h">
              <h4>{t.name}</h4>
              <span class="cat">{t.id === props.active ? <b class="am">ACTIVE</b> : t.category.toUpperCase()}</span>
            </div>
            <p class="am meta">{meta(t)}</p>
            <p>{t.summary}</p>
            <p class="faint">{t.author}</p>
          </button>
        ))}
        {!list.length && <div class="empty" style={{ padding: "16px" }}>No programs match.</div>}
      </div>
    </div>
  );
}

type Tab = "about" | "rules" | "workouts";

function lengthText(l: ReturnType<typeof programLength>): string {
  if (l.kind === "block") return `a ${l.weeks}-week block, then it ends`;
  if (l.kind === "cycles") return `${l.weeks}-week cycles that repeat forever, maxes rising each time round`;
  return "ongoing: progress session to session for as long as it works";
}

/** A program's page. `onBack` shows the ← link (phones). */
export function ProgramPage(props: { id: string; b: Bootstrap; onBack?: () => void; onOpen?: (id: string) => void; onSaved: (msg: string) => void; editor?: (close: () => void) => preact.ComponentChildren }) {
  const { id, b } = props;
  const t = getTemplate(id);
  const isActive = b.program?.templateId === id;
  const [tab, setTab] = useState<Tab>("about");
  const [opts, setOpts] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<ProgramDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [week, setWeek] = useState(0);
  const [starting, setStarting] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => { setOpts({}); setTab("about"); setWeek(0); setStarting(false); setEditing(false); }, [id]);
  useEffect(() => {
    let live = true;
    setErr(null);
    api.programDetail(id, opts).then((d) => { if (live) { setDetail(d); setWeek((w) => Math.min(w, Math.max(0, d.weeks.length - 1))); } }).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [id, JSON.stringify(opts), b]);

  if (!t) return <div class="empty">Unknown program.</div>;
  const d = detail?.id === id ? detail : null;
  const unit = d?.unit ?? b.settings.unit;
  const activeName = b.program ? getTemplate(b.program.templateId)?.name ?? b.program.templateId : null;

  return (
    <article class="pp">
      {props.onBack && <button class="pp-back" onClick={props.onBack}>← PROGRAMS</button>}
      <header class="pp-h">
        <div class="pp-title">
          <h2>{t.name}</h2>
          {isActive && <span class="pp-badge">ACTIVE</span>}
        </div>
        <p class="am meta">{t.category.toUpperCase()} · {meta(t)}</p>
        <p class="faint">{t.author}</p>
        <div class="pp-acts">
          {isActive ? (
            <>
              <button class="btn pri" id="edit-setup" onClick={() => { setEditing(true); setStarting(false); }}><em>⏎</em>EDIT SETUP</button>
              <button class="btn" id="start-program" onClick={() => { setStarting(true); setEditing(false); }}>RESTART</button>
            </>
          ) : (
            <button class="btn pri" id="start-program" disabled={!d} onClick={() => { setStarting(true); setEditing(false); }}><em>⏎</em>START THIS PROGRAM</button>
          )}
        </div>
      </header>

      {starting && d && (
        <StartSheet d={d} b={b} opts={opts} activeName={activeName} isActive={isActive}
          onCancel={() => setStarting(false)}
          onDone={(msg) => { setStarting(false); props.onSaved(msg); }} />
      )}
      {editing && props.editor && <div class="pp-edit">{props.editor(() => setEditing(false))}</div>}

      <div class="pp-tabs" role="tablist">
        {(["about", "rules", "workouts"] as Tab[]).map((x) => (
          <button role="tab" aria-selected={tab === x} class={tab === x ? "on" : ""} id={`tab-${x}`} onClick={() => setTab(x)}>{x.toUpperCase()}</button>
        ))}
      </div>

      {err && <div class="warnbox">{err}</div>}
      {!d && !err && <div class="empty">Loading…</div>}

      {d && tab === "about" && (
        <div class="pp-body">
          <p class="pp-sum">{t.summary}</p>
          {d.notes.length > 0 && <ul class="pp-notes">{d.notes.map((n) => <li>{n}</li>)}</ul>}
          <dl class="pp-dl">
            <dt>AUTHOR</dt><dd>{t.author}</dd>
            <dt>SOURCE</dt><dd>{t.source}</dd>
            <dt>LENGTH</dt><dd>{lengthText(lengthOf(t))} · {t.daysPerWeek.join(" or ")} days a week</dd>
            {d.next && <><dt>THEN</dt><dd>{d.next.when}{d.next.id && d.next.id !== t.id && props.onOpen ? <> <button class="linkbtn" onClick={() => props.onOpen!(d.next!.id!)}>→ {d.next.name}</button></> : null}</dd></>}
            <dt>WEIGHTS</dt><dd>{d.basis === "active" ? "your current weights in this program" : d.basis === "e1rm" ? "worked out from your current e1RMs" : "the template's example numbers (no history yet)"}</dd>
          </dl>
          {d.options.length > 0 && (
            <div class="pp-opts">
              {d.options.map((o) => (
                <div class="field">
                  <label for={`popt-${o.key}`}>{o.label.toUpperCase()}</label>
                  <Picker id={`popt-${o.key}`} label={o.label} value={o.selected} width="100%" options={o.choices.map((c) => ({ value: c.value, label: c.label }))}
                    onChange={(v) => setOpts({ ...opts, [o.key]: v })} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {d && tab === "rules" && (
        <div class="pp-body">
          <ul class="pp-ov">{d.rules.overview.map((x) => <li>{x}</li>)}</ul>
          <h5>ROTATION</h5>
          <div class="pp-rot">
            {d.rules.rotation.map((r) => (
              <div class="pp-rot-row">
                <span class="hi">{r.day}</span>
                <span class="pp-lifts">{r.lifts.map((l) => { const [tier, ...rest] = l.split(" "); return <span><Tier t={tier} /> {rest.join(" ")}</span>; })}</span>
              </div>
            ))}
          </div>
          <h5>HOW EACH LIFT PROGRESSES</h5>
          {d.rules.tiers.map((x) => (
            <section class="pp-tier">
              <h6>{x.title}</h6>
              <p class="faint">{x.lifts.join(" · ")}</p>
              <p>{x.text}</p>
            </section>
          ))}
        </div>
      )}

      {d && tab === "workouts" && d.weeks.length > 0 && (
        <div class="pp-body">
          <div class="chips weeks" role="group" aria-label="Week">
            {d.weeks.map((w, i) => <button class={i === week ? "on" : ""} aria-pressed={i === week} onClick={() => setWeek(i)}>W{w.week}</button>)}
          </div>
          <p class="note">
            {d.weeks[week].name && /week/i.test(d.weeks[week].name!) ? d.weeks[week].name : `Week ${d.weeks[week].week}${d.weeks[week].name ? ` · ${d.weeks[week].name}` : ""}`} · {d.weeks[week].days.length} sessions
            {lengthOf(t).kind === "block" ? "" : " · as if every session goes to plan"} · {unit}
          </p>
          <div class="pp-days">
            {d.weeks[week].days.map((day) => (
              <div class="pp-day">
                <div class="am pp-day-h">{day.dayId} <span class="faint">{day.name}</span></div>
                {day.exercises.map((ex) => <PlanExercise ex={ex} unit={unit} />)}
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function PlanExercise(props: { ex: ProgramWeekExercise; unit: Unit }) {
  const { ex, unit } = props;
  const bw = LIFTS[ex.lift]?.kind === "bodyweight";
  const groups: { s: ProgramWeekExercise["sets"][number]; n: number }[] = [];
  for (const s of ex.sets) {
    const g = groups[groups.length - 1];
    if (g && g.s.weight === s.weight && g.s.reps === s.reps && g.s.repsMax === s.repsMax && g.s.amrap === s.amrap && g.s.rpe === s.rpe) g.n++;
    else groups.push({ s, n: 1 });
  }
  const load = (s: ProgramWeekExercise["sets"][number]) => (s.weight ? fmt(s.weight) : s.rpe ? `@${s.rpe}` : bw ? "BW" : "");
  const rpe = ex.sets.find((s) => s.rpe)?.rpe;
  return (
    <div class="ex">
      <div class="ex-h">
        <Tier t={ex.tier} />
        <span class="name">{ex.name}</span>
        <span class="dim">{ex.scheme}</span>
        <span class="w">{ex.top ? <>{fmt(ex.top)} <small>{unit}</small></> : rpe ? <>RPE {rpe}</> : bw ? "BW" : <small class="dim">your pick</small>}</span>
      </div>
      <div class="sets">
        {groups.map((g) => (
          <span class={g.s.amrap ? "amrap" : ""}>
            {load(g.s)}{load(g.s) ? "×" : ""}{g.s.reps}{g.s.repsMax ? `–${g.s.repsMax}` : ""}{g.s.amrap ? "+" : ""}{g.s.weight && g.s.rpe ? ` @${g.s.rpe}` : ""}{g.n > 1 ? ` ×${g.n}` : ""}
          </span>
        ))}
      </div>
      {ex.note && <div class="next">{ex.note}</div>}
      {(ex.ifSuccess || ex.ifFail) && (
        <div class="next">
          {ex.ifSuccess && <span><b>▲</b> {ex.ifSuccess}</span>}
          {ex.ifFail && <span><i>▼</i> {ex.ifFail}</span>}
        </div>
      )}
    </div>
  );
}

/** Confirm, pick training days and starting numbers, POST start. */
function StartSheet(props: { d: ProgramDetail; b: Bootstrap; opts: Record<string, string>; activeName: string | null; isActive: boolean; onCancel: () => void; onDone: (msg: string) => void }) {
  const { d } = props;
  const [days, setDays] = useState<number[]>(d.start.trainingDays);
  const [date, setDate] = useState(props.b.today);
  const [sw, setSw] = useState<Record<string, number>>(d.start.startWeights);
  const [tm, setTm] = useState<Record<string, number>>(d.start.trainingMaxes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [numbers, setNumbers] = useState(false);
  const options = Object.fromEntries(d.options.map((o) => [o.key, o.selected]));
  const def = getTemplate(d.id)!.build(options);
  const slots = allSlots(def).filter(usesStartWeight);
  const firstDay = (sid: string) => def.days.find((x) => x.slots.some((y) => y.id === sid))?.id ?? "";
  const per = Math.round(def.sessionsPerWeek);
  const toggle = (i: number) => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort());
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const go = async () => {
    if (!days.length) return setErr("Pick at least one training day.");
    setBusy(true);
    setErr(null);
    try {
      await api.startProgram(d.id, { options, trainingDays: days, startWeights: sw, trainingMaxes: tm, startDate: date });
      props.onDone(`${d.name} started ${date}. Past workouts are kept.`);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  return (
    <div class="pp-start" role="dialog" aria-label={`Start ${d.name}`}>
      <h5>{props.isActive ? `RESTART ${d.name.toUpperCase()}` : `START ${d.name.toUpperCase()}`}</h5>
      <p class="note">
        {props.activeName && !props.isActive ? <>This replaces <span class="hi">{props.activeName}</span>. </> : null}
        Past workouts stay in your history; the program counts sessions from the start date.
      </p>
      <div class="field">
        <label>TRAINING DAYS <span class="faint">· {days.length} picked{days.length !== per ? ` · program has ${per} a week` : ""}</span></label>
        <div class="chips dow" role="group" aria-label="Training days">
          {DOW.map((n, i) => <button class={days.includes(i) ? "on" : ""} aria-pressed={days.includes(i)} onClick={() => toggle(i)}>{n}</button>)}
        </div>
      </div>
      <div class="field">
        <label for="start-date">START DATE</label>
        <input class="inp" id="start-date" type="date" style={{ maxWidth: "180px" }} value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
      </div>
      <button class="linkish" onClick={() => setNumbers(!numbers)}>{numbers ? "▾" : "▸"} STARTING NUMBERS <span class="faint">({d.basis === "e1rm" ? "from your e1RMs" : d.basis === "active" ? "your current weights" : "template defaults"})</span></button>
      {numbers && (
        <div class="tbl-wrap">
          <table class="t">
            <tbody>
              {slots.map((x) => (
                <tr>
                  <td class="dim">{firstDay(x.id)}</td>
                  <td class="l"><Tier t={x.tier} /> {LIFTS[x.lift]?.name ?? x.lift} <span class="faint">{x.progression.kind === "stages" ? schemeLabel(x.progression.stages[0]) : ""}</span></td>
                  <td><input class="inp num" inputMode="decimal" aria-label={`Start weight ${x.id}`} value={sw[x.id] ?? ""} onInput={(e) => setSw({ ...sw, [x.id]: num((e.target as HTMLInputElement).value) })} /></td>
                </tr>
              ))}
              {Object.keys(tm).map((l) => (
                <tr>
                  <td class="dim">{d.start.maxLabel.toUpperCase().slice(0, 10)}</td>
                  <td class="l">{LIFTS[l]?.name ?? l}</td>
                  <td><input class="inp num" inputMode="decimal" aria-label={`${d.start.maxLabel} ${l}`} value={tm[l] ?? ""} onInput={(e) => setTm({ ...tm, [l]: num((e.target as HTMLInputElement).value) })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {err && <div class="warnbox">{err}</div>}
      <div class="pp-acts">
        <button class="btn pri" id="confirm-start" disabled={busy} onClick={go}><em>⏎</em>{busy ? "STARTING…" : props.activeName && !props.isActive ? "REPLACE AND START" : "START"}</button>
        <button class="btn" onClick={props.onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

/** Edit the running program's setup: options, start date, units, starting weights and maxes. */
export function SetupEditor(props: { cfg: ProgramConfig; setCfg: (f: (c: ProgramConfig) => ProgramConfig) => void; onUnit: (u: Unit) => void }) {
  const { cfg } = props;
  const edit = props.setCfg;
  const tpl = getTemplate(cfg.templateId);
  if (!tpl) return null;
  const def = tpl.build(cfg.options);
  const slots = allSlots(def);
  const stageSlots = slots.filter(usesStartWeight);
  const firstDay = (sid: string) => def.days.find((d) => d.slots.some((y) => y.id === sid))?.id ?? "";
  const tmLifts = [...new Set(slots.flatMap((x) => (x.progression.kind === "percent" ? [x.progression.tmLift] : [])))];
  const num = (v: string) => (v === "" ? 0 : Number(v));
  return (
    <div class="pp-setup">
      <div class="form pp-opts">
        {tpl.options.map((o) => (
          <div class="field">
            <label for={`opt-${o.key}`}>{o.label.toUpperCase()}</label>
            <Picker id={`opt-${o.key}`} label={o.label} value={String(cfg.options[o.key] ?? o.default)} width="100%" options={o.choices.map((ch) => ({ value: String(ch.value), label: ch.label }))}
              onChange={(v) => edit((c) => ({ ...c, options: { ...c.options, [o.key]: v } }))} />
          </div>
        ))}
        <div class="field">
          <label for="start">PROGRAM START</label>
          <input class="inp" id="start" type="date" value={cfg.startDate.slice(0, 10)} onInput={(e) => edit((c) => ({ ...c, startDate: (e.target as HTMLInputElement).value + "T00:00:00Z" }))} />
        </div>
        <div class="field">
          <label>UNITS</label>
          <Seg value={cfg.unit} options={[["lb", "LB"], ["kg", "KG"]]} onChange={(u) => { edit((c) => ({ ...c, unit: u })); props.onUnit(u); }} />
        </div>
      </div>
      <p class="note">Workouts before the start date are ignored for the program but still count in stats. Starting values are where you begin on that date.</p>
      {stageSlots.length > 0 && (
        <>
          <h5>STARTING WEIGHTS <span class="faint">· {cfg.unit}</span></h5>
          <div class="tbl-wrap">
            <table class="t">
              <thead><tr><th>DAY</th><th class="l">LIFT</th><th>WEIGHT</th><th>SCHEME</th><th>+INC</th></tr></thead>
              <tbody>
                {stageSlots.map((x) => {
                  const p = x.progression;
                  return (
                    <tr>
                      <td class="dim">{firstDay(x.id)}</td>
                      <td class="l"><Tier t={x.tier} /> {LIFTS[x.lift]?.name}</td>
                      <td><input class="inp num" id={`w-${x.id}`} inputMode="decimal" value={cfg.startWeights[x.id] ?? ""} onInput={(e) => edit((c) => ({ ...c, startWeights: { ...c.startWeights, [x.id]: num((e.target as HTMLInputElement).value) } }))} /></td>
                      <td>
                        {p.kind === "stages" && p.stages.length > 1 ? (
                          <Picker id={`st-${x.id}`} label="Starting stage" value={String(cfg.startStages?.[x.id] ?? 0)} options={p.stages.map((st, k) => ({ value: String(k), label: schemeLabel(st) }))}
                            onChange={(v) => edit((c) => ({ ...c, startStages: { ...c.startStages, [x.id]: Number(v) } }))} />
                        ) : <span class="dim">{p.kind === "stages" ? schemeLabel(p.stages[0]) : p.kind === "double" ? `${p.sets}×${p.reps[0]}–${p.reps[1]}` : p.kind === "fixed" ? `${p.sets}×${p.reps}` : ""}</span>}
                      </td>
                      <td>{p.kind === "stages" || p.kind === "double" ? <input class="inp num" id={`i-${x.id}`} style={{ maxWidth: "70px" }} inputMode="decimal" placeholder={String(cfg.unit === "lb" ? p.increment.lb : p.increment.kg)} value={cfg.increments?.[x.id] ?? ""} onInput={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        edit((c) => { const inc = { ...c.increments }; if (v === "") delete inc[x.id]; else inc[x.id] = num(v); return { ...c, increments: inc }; });
                      }} /> : <span class="faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tmLifts.length > 0 && (
        <>
          <h5>{(def.maxLabel ?? "Training max").toUpperCase()} <span class="faint">· {cfg.unit} · {def.maxLabel ? "what the percentages are of" : "usually 90% of your 1RM"}</span></h5>
          <div class="tbl-wrap">
            <table class="t">
              <tbody>
                {tmLifts.map((l) => (
                  <tr>
                    <td class="l">{LIFTS[l]?.name}</td>
                    <td><input class="inp num" id={`tm-${l}`} inputMode="decimal" value={cfg.trainingMaxes[l] ?? ""} onInput={(e) => edit((c) => ({ ...c, trainingMaxes: { ...c.trainingMaxes, [l]: num((e.target as HTMLInputElement).value) } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
