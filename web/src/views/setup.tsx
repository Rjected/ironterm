import { useEffect, useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import { allSlots, schemeLabel, usesStartWeight, type ProgramConfig, type SlotDef } from "../../shared/program";
import { buildProgram, defaultConfig, getTemplate } from "../../shared/programs";
import { api, type Bootstrap, type Settings } from "../api";
import { Panel, Seg, Tier, ago } from "../ui";
import { ProgramBrowser, ProgramPreview } from "./browser";
import { Picker } from "../components/picker";
import { AppsPanel } from "./apps";

// First session matching the GZCLP sheet's starting weights (squat 185 × 5×3+) in Hevy.
const SHEET_START = "2026-07-06";

export function Setup(props: { b: Bootstrap; onSaved: (msg: string) => void }) {
  const { b } = props;
  const [s, setS] = useState<Settings>(b.settings);
  const [cfg, setCfg] = useState<ProgramConfig>(() => b.program ?? defaultConfig("gzclp", b.settings.unit, `${SHEET_START}T00:00:00Z`));
  const [templates, setTemplates] = useState<{ id: string; title: string }[]>([]);
  const [dirty, setDirty] = useState(false);
  const def = buildProgram(cfg);
  const tpl = getTemplate(cfg.templateId);
  const live = b.mode === "live";

  useEffect(() => { if (live) api.templates().then(setTemplates).catch(() => {}); }, [live]);

  const edit = (f: (c: ProgramConfig) => ProgramConfig) => { setCfg(f); setDirty(true); };
  const pick = (id: string) => edit((c) => ({ ...defaultConfig(id, c.unit, c.startDate), liftMap: c.liftMap }));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const save = async () => {
    await api.saveSettings(s);
    await api.saveProgram(cfg);
    setDirty(false);
    props.onSaved("Saved. Program replayed from " + cfg.startDate.slice(0, 10));
  };

  const slots = def ? allSlots(def) : [];
  const stageSlots = slots.filter(usesStartWeight);
  // the day a (possibly shared) slot first appears on
  const firstDay = (x: SlotDef) => def?.days.find((d) => d.slots.some((y) => y.id === x.id))?.id ?? "";
  const tmLifts = [...new Set(slots.flatMap((x) => (x.progression.kind === "percent" ? [x.progression.tmLift] : [])))];
  const usedLifts = [...new Set(slots.map((x) => x.lift))];
  const origin = typeof location !== "undefined" ? location.origin : "";

  return (
    <div class="grid">
      <Panel n="1" title="PROGRAMS" span={12} sub={tpl ? `selected: ${tpl.name}${b.program?.templateId === tpl.id ? " (active)" : ""}` : undefined} act={
        <button class={`btn ${dirty ? "pri" : ""}`} onClick={save}><em>⏎</em>{b.program?.templateId === cfg.templateId ? "SAVE" : "MAKE ACTIVE"}{dirty ? " *" : ""}</button>
      }>
        <ProgramBrowser selected={cfg.templateId} unit={cfg.unit} onPick={pick} />
      </Panel>

      {tpl && (
        <Panel n="2" title={`${tpl.name.toUpperCase()} · SETUP`} span={12} sub={`${tpl.author} · source: ${tpl.source}`}>
        {(
          <div class="form" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", maxWidth: "none" }}>
            {tpl.options.map((o) => (
              <div class="field">
                <label for={`opt-${o.key}`}>{o.label.toUpperCase()}</label>
                <Picker id={`opt-${o.key}`} label={o.label} value={String(cfg.options[o.key] ?? o.default)} options={o.choices.map((ch) => ({ value: String(ch.value), label: ch.label }))}
                  onChange={(v) => edit((c) => ({ ...c, options: { ...c.options, [o.key]: v } }))} />
              </div>
            ))}
            <div class="field">
              <label for="start">PROGRAM START</label>
              <input class="inp" id="start" type="date" value={cfg.startDate.slice(0, 10)} onInput={(e) => edit((c) => ({ ...c, startDate: (e.target as HTMLInputElement).value + "T00:00:00Z" }))} />
            </div>
            <div class="field">
              <label>UNITS</label>
              <Seg value={cfg.unit} options={[["lb", "LB"], ["kg", "KG"]]} onChange={(u) => { edit((c) => ({ ...c, unit: u })); setS({ ...s, unit: u }); }} />
            </div>
          </div>
        )}
        <p class="note">Workouts before the start date are ignored for the program but still count in stats. Starting values are where you begin on that date.</p>
          <ProgramPreview template={tpl} options={cfg.options} unit={cfg.unit} />
        </Panel>
      )}

      {stageSlots.length > 0 && def && (
        <Panel n="3" title="STARTING WEIGHTS" span={tmLifts.length ? 7 : 12} sub={`${cfg.unit} · weight you'll use on day one`}>
          <div class="tbl-wrap">
            <table class="t">
              <thead><tr><th>DAY</th><th class="l">TIER</th><th class="l">LIFT</th><th>WEIGHT</th><th>SCHEME</th><th>+INC</th></tr></thead>
              <tbody>
                {stageSlots.map((x) => {
                  const p = x.progression;
                  return (
                    <tr>
                      <td class="dim">{firstDay(x)}</td>
                      <td class="l"><Tier t={x.tier} /></td>
                      <td class="l">{LIFTS[x.lift]?.name}</td>
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
        </Panel>
      )}

      {tmLifts.length > 0 && (
        <Panel n="4" title={(def?.maxLabel ?? "Training max").toUpperCase() + "ES"} span={stageSlots.length ? 5 : 12} sub={`${cfg.unit} · ${def?.maxLabel ? "what the percentages are of" : "usually 90% of your 1RM"}`}>
          <div class="tbl-wrap">
            <table class="t">
              <tbody>
                {tmLifts.map((l) => (
                  <tr>
                    <td>{LIFTS[l]?.name}</td>
                    <td><input class="inp num" id={`tm-${l}`} inputMode="decimal" value={cfg.trainingMaxes[l] ?? ""} onInput={(e) => edit((c) => ({ ...c, trainingMaxes: { ...c.trainingMaxes, [l]: num((e.target as HTMLInputElement).value) } }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Panel n="5" title="LIFT MAPPING" span={6} sub="which Hevy exercise counts as each lift">
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

      <Panel n="6" title="SETTINGS" span={6}>
        <div class="form">
          <div class="field">
            <label for="tz">TIME ZONE</label>
            <input class="inp" id="tz" value={s.tz} onInput={(e) => { setS({ ...s, tz: (e.target as HTMLInputElement).value }); setDirty(true); }} />
          </div>
          <div class="field">
            <label>AUTO-UPDATE HEVY ROUTINES AFTER EACH WORKOUT</label>
            <Seg value={s.autoPush ? "on" : "off"} options={[["on", "ON"], ["off", "OFF"]]} onChange={(v) => { setS({ ...s, autoPush: v === "on" }); setDirty(true); }} />
          </div>
        </div>
      </Panel>

      <Panel n="7" title="CONNECTION" span={12}>
        <div class="form" style={{ maxWidth: "none", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div class="field">
            <label>MODE</label>
            <div>{live ? <span class="up">LIVE · {b.sync.count ?? 0} workouts · synced {ago(b.sync.at)}</span> : <span class="am">DEMO · add HEVY_API_KEY to .dev.vars</span>}</div>
            {b.sync.error && <div class="warnbox">{b.sync.error}</div>}
          </div>
          <div class="field">
            <label>ACCESS</label>
            <div>{b.auth === "google" ? <span class="up">Google sign-in</span> : b.auth === "access" ? <span class="up">Cloudflare Access (Google)</span> : b.auth === "password" ? <span class="up">Password</span> : <span class="down">NONE: anyone with the URL can read this</span>}</div>
          </div>
          <div class="field">
            <label>HEVY WEBHOOK (Settings › Developer › Webhooks)</label>
            <div class="code">URL     {origin}/api/hevy/webhook{"\n"}Header  Bearer &lt;WEBHOOK_SECRET&gt;</div>
          </div>
        </div>
      </Panel>

      <AppsPanel n="8" />
    </div>
  );
}
