import { useMemo, useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import { GROUP_LABEL, MUSCLE, MUSCLES, type MuscleId } from "../../shared/muscles";
import type { ProgramConfig } from "../../shared/program";
import { buildProgram, defaultConfig, TEMPLATES } from "../../shared/programs";
import {
  analyzeHistory, analyzeProgram, curve, defaultSchedule, DOW, fatigueAt, HIT_MIN, readiness, SESSION_CAP,
  type MuscleSummary, type Overlap, type ProgramAnalysis,
} from "../../shared/recovery";
import type { Nav } from "../app";
import { tip } from "../charts";
import { Anatomy, rampColor, warnColor, type Flag } from "../components/anatomy";
import type { Sex } from "../anatomy/figure";
import type { Derived } from "../derive";
import { Panel, Seg } from "../ui";
import { Picker, programOptions } from "../components/picker";

type Mode = "load" | "sets" | "gaps" | "ready";

const store = {
  get(k: string) { try { return localStorage.getItem(`hevy.body.${k}`); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(`hevy.body.${k}`, v); } catch { /* private mode */ } },
};

/** Hard sets/week that read as full colour. */
const SETS_FULL = 22;
const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hrs = (h: number | null) => (h == null ? "—" : h >= 48 ? `${f1(h / 24)}d` : `${Math.round(h)}h`);
const liftShort = (k: string) => LIFTS[k]?.short ?? k.toUpperCase();
const STATUS: Record<MuscleSummary["status"], string> = { none: "NOT TRAINED", low: "BELOW RANGE", ok: "IN RANGE", high: "ABOVE RANGE", "n/a": "INDIRECT" };

export function Body(props: { d: Derived; cfg: ProgramConfig | null; nav?: Nav }) {
  const { d } = props;
  const [mode, setModeRaw] = useState<Mode>((store.get("mode") as Mode) ?? "load");
  const [sex, setSexRaw] = useState<Sex>((store.get("sex") as Sex) ?? "m");
  const [tpl, setTpl] = useState<string>(props.cfg && d.def ? "active" : TEMPLATES[0]?.id ?? "");
  const [sched, setSched] = useState<number[] | null>(null);
  const [pinned, setPinned] = useState<MuscleId | null>(null);
  const setMode = (m: Mode) => { setModeRaw(m); store.set("mode", m); };
  const setSex = (s: Sex) => { setSexRaw(s); store.set("sex", s); };

  // ── program model ──
  const prog = useMemo(() => {
    if (tpl === "active" && props.cfg && d.def) return { def: d.def, cfg: props.cfg, name: d.def.name };
    const t = TEMPLATES.find((x) => x.id === tpl);
    if (!t) return null;
    const cfg = defaultConfig(t.id, d.unit, d.today);
    const def = buildProgram(cfg);
    return def ? { def, cfg, name: t.name } : null;
  }, [tpl, props.cfg, d.def]);
  const schedule = sched ?? (prog ? defaultSchedule(prog.def.sessionsPerWeek) : [0, 2, 4]);
  const pa = useMemo(() => (prog ? analyzeProgram(prog.def, prog.cfg, { schedule }) : null), [prog, schedule.join()]);

  // ── history model ──
  const ha = useMemo(() => analyzeHistory(d.workouts, { now: Date.now(), liftMap: d.liftMap }), [d.workouts, d.liftMap]);

  const isHist = mode === "ready";
  const sum = (m: MuscleId): MuscleSummary | undefined => (isHist ? ha.last28[m] : pa?.muscles[m]);

  // ── what the figure shows ──
  const values: Partial<Record<MuscleId, number>> = {};
  // load is scaled to the busiest muscle (at least SETS_FULL / 2) so the hot spots stand out
  const maxEff = pa ? Math.max(SETS_FULL / 2, ...MUSCLES.map((m) => pa.muscles[m.id].effSets)) : SETS_FULL;
  const flags: Partial<Record<MuscleId, Flag>> = {};
  for (const { id } of MUSCLES) {
    if (isHist) {
      values[id] = 1 - ha.current[id].readiness;
      if (ha.current[id].readiness < 0.5) flags[id] = "warn";
      else if (ha.last28[id].status === "low" || ha.last28[id].status === "none") flags[id] = MUSCLE[id].range ? "low" : undefined;
    } else if (pa) {
      const s = pa.muscles[id];
      values[id] = mode === "gaps" ? 1 - s.minReadiness : s.effSets / maxEff;
      if (s.overlaps > 0 || s.status === "high") flags[id] = "warn";
      else if ((s.status === "low" || s.status === "none") && MUSCLE[id].range) flags[id] = "low";
    }
  }
  const color = mode === "gaps" || isHist ? warnColor : rampColor;
  const legend: [string, string] = mode === "gaps" ? ["recovered", "taxed"] : isHist ? ["fresh", "fatigued"] : ["0", `${f1(maxEff)} hard sets/wk`];

  // flags read as words in the tooltip; outlines on the figure were hard to decode
  const flagText = (m: MuscleId) => {
    if (flags[m] === "low") return "\n▼ below the weekly target range";
    if (flags[m] !== "warn") return "";
    if (isHist) return "\n▲ still recovering, under 50% ready";
    const s = pa?.muscles[m];
    return s && s.overlaps > 0 ? "\n▲ hit again before it recovered" : "\n▲ above the weekly target range";
  };
  const label = (m: MuscleId) => baseLabel(m) + flagText(m);
  const baseLabel = (m: MuscleId) => {
    const def = MUSCLE[m];
    if (isHist) {
      const c = ha.current[m], w = ha.last28[m];
      return `${def.name}\nready ${pct(c.readiness)}${c.readyIn > 1 ? ` · ~${hrs(c.readyIn)} to recover` : ""}\nlast hit ${c.hoursSince == null ? "—" : hrs(c.hoursSince) + " ago"}\n7d ${f1(ha.last7[m].sets)} sets · 28d ${f1(w.sets)}/wk`;
    }
    const s = pa?.muscles[m];
    if (!s) return def.name;
    return `${def.name}\n${f1(s.sets)} sets/wk (${f1(s.effSets)} hard)${def.range ? ` · target ${def.range[0]}–${def.range[1]}` : ""}\n${f1(s.hits)} hits/wk · min gap ${hrs(s.minGapH)} · needs ~${hrs(s.recoverH)}\nlowest readiness ${pct(s.minReadiness)}${s.overlaps ? ` · ${f1(s.overlaps)} overlaps/wk` : ""}`;
  };

  // ── KPIs ──
  const ms = MUSCLES.map((m) => m.id);
  const ranked = (f: (m: MuscleId) => number) => [...ms].sort((a, b) => f(b) - f(a));
  const topLoad = pa ? ranked((m) => pa.muscles[m].effSets)[0] : null;
  const under = pa ? ms.filter((m) => MUSCLE[m].range && (pa.muscles[m].status === "low" || pa.muscles[m].status === "none")) : [];
  const leastReady = ranked((m) => -ha.current[m].readiness)[0];
  const pinnedOrTop = pinned ?? (isHist ? leastReady : mode === "gaps" && pa ? ranked((m) => 1 - pa.muscles[m].minReadiness)[0] : topLoad) ?? "pecLower";

  return (
    <div class="grid">
      <div class="kpis">
        <div class="kpi"><label>MODEL</label><div class="v" style={{ fontSize: "18px" }}>{isHist ? "HISTORY" : prog?.name ?? "—"}</div><div class="d">{isHist ? `${d.workouts.length} workouts` : `${schedule.length}×/wk · ${schedule.map((x) => DOW[x][0] + DOW[x][1].toLowerCase()).join(" ")}`}</div></div>
        <div class="kpi"><label>MOST LOADED</label><div class="v" style={{ fontSize: "18px" }}>{topLoad ? MUSCLE[topLoad].short : "—"}</div><div class="d">{topLoad && pa ? `${f1(pa.muscles[topLoad].effSets)} hard sets/wk · program` : ""}</div></div>
        <div class="kpi"><label>OVERLAPS / WK</label><div class={`v ${pa && pa.overlaps.length ? "down" : ""}`}>{pa ? f1(pa.overlaps.length / pa.weeks) : "—"}</div><div class="d">program · hit before recovered</div></div>
        <div class="kpi"><label>BELOW RANGE</label><div class="v">{under.length}<small>muscles</small></div><div class="d"><span class="ell">{under.slice(0, 3).map((m) => MUSCLE[m].short).join(" · ") || "none"}</span></div></div>
        <div class="kpi"><label>LEAST READY NOW</label><div class={`v ${ha.current[leastReady].readiness < 0.5 ? "down" : ""}`} style={{ fontSize: "18px" }}>{MUSCLE[leastReady].short}</div><div class="d">{pct(ha.current[leastReady].readiness)} ready</div></div>
        <div class="kpi"><label>YOUR OVERLAPS · 28D</label><div class={`v ${ha.overlaps28.length ? "down" : ""}`}>{ha.overlaps28.length}</div><div class="d">{ha.overlaps28.length ? `mostly ${MUSCLE[mode28(ha.overlaps28)].short}` : "from your log"}</div></div>
      </div>

      <Panel
        n="1" title="BODY" span={7}
        sub={isHist ? "current readiness from your Hevy log" : mode === "gaps" ? "lowest readiness across the week" : "weekly hard sets per muscle"}
        act={<Seg value={mode} options={[["load", "LOAD"], ["sets", "SETS"], ["gaps", "GAPS"], ["ready", "READY"]]} onChange={setMode} />}
      >
        {!isHist && (
          <div class="body-ctl">
            <Picker label="Program" value={tpl} width="min(320px, 100%)"
              options={[...(props.cfg && d.def ? [{ value: "active", label: d.def.name, group: "Your program", hint: "active" }] : []), ...programOptions()]}
              onChange={(v) => { setTpl(v); setSched(null); setPinned(null); }} />
            {props.nav && (tpl !== "active" || props.cfg) && (
              <a class="btn" id="body-open-program" style={{ padding: "4px 8px", textDecoration: "none" }} href={`#set/programs/${encodeURIComponent(tpl === "active" ? props.cfg!.templateId : tpl)}`}
                onClick={(e) => { e.preventDefault(); props.nav!({ view: "set", tab: "programs", id: tpl === "active" ? props.cfg!.templateId : tpl }); }}>PROGRAM PAGE →</a>
            )}
            <div class="seg" role="group" aria-label="Training days">
              {DOW.map((n, i) => (
                <button class={schedule.includes(i) ? "on" : ""} onClick={() => {
                  const next = schedule.includes(i) ? schedule.filter((x) => x !== i) : [...schedule, i].sort((a, b) => a - b);
                  if (next.length) setSched(next);
                }}>{n.slice(0, 2)}</button>
              ))}
            </div>
            {sched && <button class="btn" style={{ padding: "0 8px" }} onClick={() => setSched(null)}>RESET</button>}
          </div>
        )}
        <Anatomy values={values} color={color} flags={flags} label={label} pinned={pinned} onPin={setPinned} sex={sex} onSex={setSex} legend={legend} />
        <div class="note">brighter = more · hover or tap a muscle for details · dashed = deeper muscle seen through the one on top</div>
      </Panel>

      <Panel n="2" title={MUSCLE[pinnedOrTop].short} span={5} sub={pinned ? "pinned · click again to unpin" : "click a muscle to pin"}>
        <Detail m={pinnedOrTop} pa={pa} ha={ha} />
      </Panel>

      {(mode === "load" || mode === "sets") && pa && (
        <Panel n="3" title="WEEKLY SETS VS RANGE" span={12} sub="fractional sets: direct = 1, synergist ≈ 0.5 · bar = hard sets, ticks = evidence-based range">
          <SetBars pa={pa} pinned={pinnedOrTop} onPick={setPinned} by={mode === "load" ? "load" : "sets"} />
        </Panel>
      )}

      {mode === "gaps" && pa && (
        <>
          <Panel n="3" title="OVERLAPS" span={5} sub="muscle hit again before it recovered">
            <Overlaps list={pa.overlaps} onPick={setPinned} />
          </Panel>
          <Panel n="4" title="WEEK GRID" span={7} sub="hard sets per session · shade = fatigue carried in">
            <WeekGrid pa={pa} onPick={setPinned} pinned={pinnedOrTop} />
          </Panel>
        </>
      )}

      {isHist && (
        <>
          <Panel n="3" title="READINESS" span={7} sub="now · residual fatigue from logged sets">
            <ReadyBars ha={ha} pinned={pinnedOrTop} onPick={setPinned} />
          </Panel>
          <Panel n="4" title="LAST 28 DAYS" span={5} sub="per week vs range · overlaps">
            <HistTable ha={ha} onPick={setPinned} />
          </Panel>
        </>
      )}

      <Panel n="§" title="MODEL" span={12} sub="how these numbers are estimated">
        <p class="note">
          Each working set credits muscles by involvement (prime mover 1, synergist ≈ 0.5, stabiliser ≈ 0.25; Pelland et al. 2024), weighted by proximity to failure from the program's %/RPE/AMRAP or your logged weight vs e1RM.
          Fatigue from each session decays exponentially with a muscle-specific time constant (calves/forearms/abs ≈ 16 h … hamstrings/erectors ≈ 34 h), stretched for sets to failure and very heavy loads.
          A muscle hit again while carrying more than 25% of its previous dose is flagged as an overlap. Ranges: 10–20 hard sets/wk for big muscles (Schoenfeld 2017, Baz-Valle 2022).
          Estimates, not measurements — use them to compare programs and schedules, not as medical advice.
        </p>
      </Panel>
    </div>
  );
}

function mode28(list: Overlap[]): MuscleId {
  const n = new Map<MuscleId, number>();
  for (const o of list) n.set(o.muscle, (n.get(o.muscle) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0][0];
}

// ───────────────────────── detail ─────────────────────────

function Detail(props: { m: MuscleId; pa: ProgramAnalysis | null; ha: ReturnType<typeof analyzeHistory> }) {
  const { m, pa, ha } = props;
  const def = MUSCLE[m];
  const s = pa?.muscles[m];
  const c = ha.current[m];
  // which lifts load it in the program
  const by = new Map<string, number>();
  for (const x of pa?.sessions ?? []) for (const [k, v] of Object.entries(x.doses[m]?.by ?? {})) by.set(k, (by.get(k) ?? 0) + v / (pa?.weeks ?? 1));
  const lifts = [...by].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return (
    <div class="body-detail">
      <h4>{def.name}</h4>
      <div><span class="chip">{GROUP_LABEL[def.group]}</span><span class="chip">τ {def.tau}h · ~{Math.round(def.tau * 1.9)}h to recover</span>{def.deep && <span class="chip">deep</span>}{s && <span class={`chip ${s.status === "ok" ? "ok" : s.status === "high" || s.status === "low" ? "warn" : ""}`}>{STATUS[s.status]}</span>}</div>
      {s && (
        <>
          <div class="kv"><span>sets / week</span><span class="hi">{f1(s.sets)} <span class="dim">({f1(s.effSets)} hard)</span></span></div>
          <div class="kv"><span>target</span><span>{def.range ? `${def.range[0]}–${def.range[1]}` : "indirect only"}</span></div>
          <div class="kv"><span>hits / week</span><span>{f1(s.hits)}</span></div>
          <div class="kv"><span>shortest gap</span><span class={s.minGapH != null && s.recoverH != null && s.minGapH < s.recoverH ? "down" : ""}>{hrs(s.minGapH)}</span></div>
          <div class="kv"><span>needs (avg hit)</span><span>{hrs(s.recoverH)}</span></div>
          <div class="kv"><span>readiness low / avg</span><span>{pct(s.minReadiness)} / {pct(s.avgReadiness)}</span></div>
          <div class="kv"><span>overlaps / week</span><span class={s.overlaps ? "down" : ""}>{f1(s.overlaps)}</span></div>
          <div class="kv"><span>load share</span><span>{pct(s.loadShare)}</span></div>
          {lifts.length > 0 && <div>{lifts.map(([k, v]) => <span class="chip">{liftShort(k)} {f1(v)}</span>)}</div>}
          {pa && <FatigueCurve pa={pa} m={m} />}
        </>
      )}
      <div class="kv" style={{ marginTop: "6px" }}><span>NOW · ready</span><span class={c.readiness < 0.5 ? "down" : "up"}>{pct(c.readiness)}{c.readyIn > 1 ? ` · ${hrs(c.readyIn)} to go` : ""}</span></div>
      <div class="kv"><span>last hit</span><span>{c.hoursSince == null ? "never" : `${hrs(c.hoursSince)} ago`}</span></div>
      <div class="kv"><span>7d / 28d avg sets</span><span>{f1(ha.last7[m].sets)} / {f1(ha.last28[m].sets)}</span></div>
    </div>
  );
}

function FatigueCurve(props: { pa: ProgramAnalysis; m: MuscleId }) {
  const { pa, m } = props;
  const to = Math.min(pa.to, 14 * 24);
  const pts = curve(pa.exposures, m, 0, to, 2);
  const W = 320, H = 70;
  const max = Math.max(SESSION_CAP * 0.6, ...pts.map((p) => p.f));
  const x = (t: number) => (t / to) * W;
  const y = (f: number) => H - (f / max) * (H - 4);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.f).toFixed(1)}`).join("");
  const hits = pa.sessions.filter((s) => s.t < to && (s.doses[m]?.fatigue ?? 0) >= HIT_MIN);
  return (
    <div class="chart" style={{ marginTop: "4px" }}>
      <svg viewBox={`0 0 ${W} ${H + 12}`} preserveAspectRatio="none" style={{ height: "82px" }}>
        {Array.from({ length: Math.round(to / 24) + 1 }, (_, i) => <line x1={x(i * 24)} x2={x(i * 24)} y1={0} y2={H} stroke="var(--line)" />)}
        <line x1={0} x2={W} y1={y(SESSION_CAP * 0.5)} y2={y(SESSION_CAP * 0.5)} class="xh" />
        <path d={`${line}L${W} ${H}L0 ${H}Z`} fill="var(--l3)" fill-opacity=".35" />
        <path d={line} fill="none" stroke="var(--l1)" stroke-width="1.2" vector-effect="non-scaling-stroke" />
        {hits.map((s) => <rect x={x(s.t) - 1} y={H + 2} width={2} height={6} fill="var(--amber)" onMouseMove={(e) => tip.show(e, `${s.label}\n${f1(s.doses[m]!.effSets)} hard sets`)} onMouseLeave={() => tip.hide()} />)}
      </svg>
      <div class="note">fatigue over {Math.round(to / 24)} days · dashed = 50% ready · ▮ sessions</div>
    </div>
  );
}

// ───────────────────────── sets vs range ─────────────────────────

function SetBars(props: { pa: ProgramAnalysis; pinned: MuscleId; onPick: (m: MuscleId) => void; by: "sets" | "load" }) {
  const { pa } = props;
  const groups = Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[];
  const maxLoad = Math.max(...MUSCLES.map((m) => pa.muscles[m.id].loadShare), 0.01);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "10px 24px" }}>
      {groups.map((g) => (
        <div class="bars-h">
          <div class="faint" style={{ fontSize: "var(--fs-s)" }}>{GROUP_LABEL[g]}</div>
          {MUSCLES.filter((m) => m.group === g).map((m) => {
            const s = pa.muscles[m.id];
            const v = props.by === "sets" ? s.effSets / 30 : s.loadShare / maxLoad;
            const col = s.status === "high" || s.overlaps ? "var(--down)" : s.status === "low" ? "var(--amber)" : props.by === "load" ? rampColor(v) : "var(--l2)";
            return (
              <div class={`bar-h ${props.pinned === m.id ? "on" : ""}`} onClick={() => props.onPick(m.id)}
                onMouseMove={(e) => tip.show(e, `${m.name}\n${f1(s.sets)} sets/wk · ${f1(s.effSets)} hard · ${pct(s.loadShare)} of load`)} onMouseLeave={() => tip.hide()}>
                <span>{m.short}</span>
                <span class="trk">
                  <i style={{ width: `${Math.min(100, v * 100)}%`, background: col }} />
                  {props.by === "sets" && m.range && <b style={{ left: `${(m.range[0] / 30) * 100}%`, width: `${((m.range[1] - m.range[0]) / 30) * 100}%` }} />}
                </span>
                <span class={s.status === "low" ? "am" : s.status === "high" ? "down" : "hi"}>{props.by === "sets" ? f1(s.effSets) : pct(s.loadShare)}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── recovery gaps ─────────────────────────

function Overlaps(props: { list: Overlap[]; onPick: (m: MuscleId) => void }) {
  // collapse identical (muscle, day pair) across repeated weeks
  const seen = new Map<string, Overlap & { n: number }>();
  for (const o of props.list) {
    const k = `${o.muscle}|${o.prevLabel.replace(/^W\d+ |^prev /, "")}|${o.label.replace(/^W\d+ /, "")}`;
    const x = seen.get(k);
    if (x) { x.n++; x.share = Math.max(x.share, o.share); } else seen.set(k, { ...o, n: 1 });
  }
  const rows = [...seen.values()].sort((a, b) => b.share - a.share);
  if (!rows.length) return <div class="empty">No overlaps: every muscle recovers before its next hit on this schedule.</div>;
  return (
    <div class="ovl">
      {rows.slice(0, 40).map((o) => (
        <div onClick={() => props.onPick(o.muscle)} onMouseMove={(e) => tip.show(e, `${MUSCLE[o.muscle].name}\n${o.prevLabel} (${o.prev.map(liftShort).join(", ")})\n→ ${o.label} (${o.now.map(liftShort).join(", ")})\n${Math.round(o.gapH)}h apart, ${pct(o.share)} of the last dose still there`)} onMouseLeave={() => tip.hide()}>
          <span class="down">{MUSCLE[o.muscle].short}</span>
          <span class="dim">{o.prev.slice(0, 2).map(liftShort).join("+")} → {o.now.slice(0, 2).map(liftShort).join("+")} · {Math.round(o.gapH)}h</span>
          <span>{pct(o.share)}{o.n > 1 ? <span class="faint"> ×{o.n}</span> : ""}</span>
        </div>
      ))}
    </div>
  );
}

function WeekGrid(props: { pa: ProgramAnalysis; onPick: (m: MuscleId) => void; pinned: MuscleId }) {
  const { pa } = props;
  const cols = pa.sessions.slice(0, Math.min(pa.sessions.length, pa.schedule.length * 2));
  const rows = MUSCLES.filter((m) => cols.some((s) => (s.doses[m.id]?.fatigue ?? 0) >= HIT_MIN));
  return (
    <div class="tbl-wrap">
      <table class="t">
        <thead><tr><th>MUSCLE</th>{cols.map((s) => <th style={{ textAlign: "center" }}>{DOW[s.dow]}<br /><span class="faint">{s.dayId}</span></th>)}</tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr class={`click ${props.pinned === m.id ? "sel" : ""}`} onClick={() => props.onPick(m.id)}>
              <td class="dim">{m.short}</td>
              {cols.map((s) => {
                const dose = s.doses[m.id];
                const hit = (dose?.fatigue ?? 0) >= HIT_MIN;
                const before = fatigueAt(pa.exposures, m.id, s.t - 1e-6);
                const r = readiness(before);
                const ov = pa.overlaps.some((o) => o.muscle === m.id && o.t === s.t);
                return (
                  <td class="cell" style={{ background: hit ? warnColor(1 - r) : undefined, color: ov ? "#fff" : hit ? "var(--hi)" : "var(--faint)" }}
                    onMouseMove={(e) => tip.show(e, `${m.name} · ${s.label}\n${hit ? `${f1(dose!.effSets)} hard sets (${Object.keys(dose!.by).map(liftShort).join(", ")})` : "not trained"}\n${pct(r)} ready going in`)} onMouseLeave={() => tip.hide()}>
                    {hit ? f1(dose!.effSets) : dose ? "·" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────────────────────── history ─────────────────────────

function ReadyBars(props: { ha: ReturnType<typeof analyzeHistory>; pinned: MuscleId; onPick: (m: MuscleId) => void }) {
  const { ha } = props;
  const rows = [...MUSCLES].sort((a, b) => ha.current[a.id].readiness - ha.current[b.id].readiness);
  return (
    <div class="bars-h" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", columnGap: "24px" }}>
      {rows.map((m) => {
        const c = ha.current[m.id];
        return (
          <div class={`bar-h ${props.pinned === m.id ? "on" : ""}`} onClick={() => props.onPick(m.id)}
            onMouseMove={(e) => tip.show(e, `${m.name}\n${pct(c.readiness)} ready${c.readyIn > 1 ? `, ~${hrs(c.readyIn)} to recover` : ""}\nlast hit ${c.hoursSince == null ? "never" : hrs(c.hoursSince) + " ago"}`)} onMouseLeave={() => tip.hide()}>
            <span>{m.short}</span>
            <span class="trk"><i style={{ width: `${c.readiness * 100}%`, background: c.readiness < 0.5 ? "var(--down)" : "var(--l2)" }} /></span>
            <span class={c.readiness < 0.5 ? "down" : "hi"}>{pct(c.readiness)}</span>
          </div>
        );
      })}
    </div>
  );
}

function HistTable(props: { ha: ReturnType<typeof analyzeHistory>; onPick: (m: MuscleId) => void }) {
  const { ha } = props;
  const unknown = Object.entries(ha.unknown).sort((a, b) => b[1] - a[1]);
  return (
    <div class="tbl-wrap">
      <table class="t">
        <thead><tr><th>MUSCLE</th><th>SETS/WK</th><th>HARD</th><th>RANGE</th><th>HITS</th><th>MIN GAP</th><th>OVL</th></tr></thead>
        <tbody>
          {MUSCLES.filter((m) => ha.last28[m.id].sets > 0.05 || m.range).map((m) => {
            const s = ha.last28[m.id];
            return (
              <tr class="click" onClick={() => props.onPick(m.id)}>
                <td class="dim">{m.short}</td>
                <td class="hi">{f1(s.sets)}</td>
                <td class={s.status === "low" || s.status === "none" ? "am" : s.status === "high" ? "down" : ""}>{f1(s.effSets)}</td>
                <td class="faint">{m.range ? `${m.range[0]}–${m.range[1]}` : "—"}</td>
                <td>{f1(s.hits)}</td>
                <td>{hrs(s.minGapH)}</td>
                <td class={s.overlaps ? "down" : "faint"}>{f1(s.overlaps)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {unknown.length > 0 && <p class="note">Not counted (no muscle mapping): {unknown.slice(0, 8).map(([t, n]) => `${t} ×${n}`).join(", ")}</p>}
    </div>
  );
}
