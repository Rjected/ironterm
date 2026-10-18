// A program page's BODY tab: what the program does to each muscle before you start it. Reads
// GET /api/app/programs/{id}/body (svg=0: the figure is drawn by the shared Anatomy component),
// the same analysis the native apps render.

import { useEffect, useState } from "preact/hooks";
import { GROUP_LABEL, MUSCLE, type MuscleId } from "../../shared/muscles";
import { DOW } from "../../shared/recovery";
import type { ProgramBodyMuscle } from "../../shared/appapi";
import { api, type ProgramBody } from "../api";
import type { Sex } from "../anatomy/figure";
import { tip } from "../charts";
import { Anatomy, rampColor, warnColor, type Flag } from "../components/anatomy";
import { Seg } from "../ui";

type Mode = "load" | "gaps";

// shared with the BODY view
const store = {
  get(k: string) { try { return localStorage.getItem(`hevy.body.${k}`); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(`hevy.body.${k}`, v); } catch { /* private mode */ } },
};
const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hrs = (h: number | null) => (h == null ? "—" : h >= 48 ? `${f1(h / 24)}d` : `${Math.round(h)}h`);
/** range bars run 0 → 30 hard sets/wk */
const SCALE = 30;
const STATUS: Record<ProgramBodyMuscle["status"], string> = { none: "not trained", low: "below range", ok: "in range", high: "above range", "n/a": "indirect only" };

export function ProgramBodyTab(props: { id: string; opts: Record<string, string>; defaultDays: number[] }) {
  const [mode, setModeRaw] = useState<Mode>(store.get("pmode") === "gaps" ? "gaps" : "load");
  const [sex, setSexRaw] = useState<Sex>((store.get("sex") as Sex) ?? "m");
  const [days, setDays] = useState<number[] | null>(null);
  const [pinned, setPinned] = useState<MuscleId | null>(null);
  const [week, setWeek] = useState(0);
  const [data, setData] = useState<ProgramBody | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const setMode = (m: Mode) => { setModeRaw(m); store.set("pmode", m); };
  const setSex = (s: Sex) => { setSexRaw(s); store.set("sex", s); };

  useEffect(() => { setDays(null); setPinned(null); }, [props.id]);
  useEffect(() => {
    let live = true;
    setErr(null);
    api.programBody(props.id, props.opts, days).then((x) => { if (live) { setData(x); setWeek((w) => Math.min(w, x.weeks - 1)); } }).catch((e) => live && setErr(String(e.message ?? e)));
    return () => { live = false; };
  }, [props.id, JSON.stringify(props.opts), days?.join()]);

  if (err) return <div class="warnbox">{err}</div>;
  if (!data || data.id !== props.id) return <div class="empty">Loading…</div>;

  const schedule = days ?? data.trainingDays;
  const byId = new Map(data.muscles.map((m) => [m.id, m]));
  const values: Partial<Record<MuscleId, number>> = {};
  const flags: Partial<Record<MuscleId, Flag>> = {};
  for (const m of data.muscles) {
    values[m.id] = mode === "load" ? m.load : m.gap;
    if (m.overlaps > 0 || m.status === "high") flags[m.id] = "warn";
    else if ((m.status === "low" || m.status === "none") && m.target) flags[m.id] = "low";
  }
  const maxHard = Math.max(11, ...data.muscles.map((m) => m.hardSets));
  const legend: [string, string] = mode === "load" ? ["0", `${f1(maxHard)} hard sets/wk`] : ["recovered", "taxed"];
  const label = (id: MuscleId) => {
    const m = byId.get(id);
    if (!m) return MUSCLE[id].name;
    const flag = flags[id] === "low" ? "\n▼ below the weekly target range" : flags[id] === "warn" ? (m.overlaps > 0 ? "\n▲ hit again before it recovered" : "\n▲ above the weekly target range") : "";
    return `${m.name}\n${f1(m.sets)} sets/wk (${f1(m.hardSets)} hard)${m.target ? ` · target ${m.target[0]}–${m.target[1]}` : ""}\n${f1(m.hits)} hits/wk · min gap ${hrs(m.minGapH)} · needs ~${hrs(m.recoverH)}\nlowest readiness ${pct(m.minReadiness)}${m.lifts.length ? `\n${m.lifts.join(", ")}` : ""}${flag}`;
  };
  const toggleDay = (i: number) => {
    const next = schedule.includes(i) ? schedule.filter((x) => x !== i) : [...schedule, i].sort((a, b) => a - b);
    if (next.length) setDays(next);
  };
  const weekOverlaps = data.overlaps.filter((o) => o.week === week + 1);

  return (
    <div class="pp-body pbody">
      <ul class="pp-ov" id="body-summary">{data.summary.lines.map((x) => <li>{x}</li>)}</ul>

      <div class="body-ctl">
        <Seg value={mode} options={[["load", "LOAD"], ["gaps", "GAPS"]]} onChange={setMode} />
        <div class="chips dow" role="group" aria-label="Training days">
          {DOW.map((n, i) => <button class={schedule.includes(i) ? "on" : ""} aria-pressed={schedule.includes(i)} onClick={() => toggleDay(i)}>{n}</button>)}
        </div>
        {days && days.join() !== props.defaultDays.join() && <button class="btn" style={{ padding: "0 8px" }} onClick={() => setDays(null)}>RESET</button>}
      </div>
      <p class="note">
        {mode === "load" ? "Weekly hard sets per muscle" : "Lowest readiness across the week (red = never recovers between hits)"} · {schedule.length} days a week
        {data.weeks > 1 ? ` · averaged over ${data.weeks} weeks` : ""} · as if every session goes to plan
      </p>
      <Anatomy values={values} color={mode === "load" ? rampColor : warnColor} flags={flags} label={label} pinned={pinned} onPin={setPinned} sex={sex} onSex={setSex} legend={legend} />
      {pinned && byId.get(pinned) && <Pinned m={byId.get(pinned)!} />}

      <h5>WEEKLY HARD SETS VS RANGE</h5>
      <p class="note">bar = hard (effort-weighted) sets a week · dashed ticks = evidence-based range · red = above range or overlapping · amber = below</p>
      <MuscleBars muscles={data.muscles} pinned={pinned} onPick={(m) => setPinned(pinned === m ? null : m)} />

      <h5>OVERLAPS <span class="faint">· {f1(data.summary.overlapsPerWeek)} a week · a muscle hit again before it recovered</span></h5>
      {data.weeks > 1 && (
        <div class="chips weeks" role="group" aria-label="Week">
          {data.overlapsByWeek.map((n, i) => <button class={i === week ? "on" : ""} aria-pressed={i === week} onClick={() => setWeek(i)}>W{i + 1} <span class="n">{n}</span></button>)}
        </div>
      )}
      {weekOverlaps.length ? (
        <div class="ovl">
          {weekOverlaps.map((o) => (
            <div onClick={() => setPinned(o.muscle)} onMouseMove={(e) => tip.show(e, `${MUSCLE[o.muscle].name}\n${o.from} (${o.prev.join(", ")})\n→ ${o.to} (${o.now.join(", ")})\n${o.gapH}h apart, ${pct(o.share)} of the last dose still there`)} onMouseLeave={() => tip.hide()}>
              <span class="down">{o.short}</span>
              <span class="dim">{o.from} → {o.to} · {o.prev.slice(0, 2).join("+")} → {o.now.slice(0, 2).join("+")} · {o.gapH}h</span>
              <span>{pct(o.share)}</span>
            </div>
          ))}
        </div>
      ) : <div class="empty">No overlaps{data.weeks > 1 ? ` in week ${week + 1}` : ""}: every muscle recovers before its next hit.</div>}
    </div>
  );
}

function Pinned(props: { m: ProgramBodyMuscle }) {
  const { m } = props;
  return (
    <div class="body-detail pbody-pin">
      <h4>{m.name}</h4>
      <div>
        <span class={`chip ${m.status === "ok" ? "ok" : m.status === "high" || m.status === "low" ? "warn" : ""}`}>{STATUS[m.status].toUpperCase()}</span>
        {m.lifts.map((l) => <span class="chip">{l}</span>)}
      </div>
      <div class="kv"><span>hard sets / week</span><span class="hi">{f1(m.hardSets)} <span class="dim">of {m.target ? `${m.target[0]}–${m.target[1]}` : "no target"}</span></span></div>
      <div class="kv"><span>hits / week · shortest gap</span><span>{f1(m.hits)} · {hrs(m.minGapH)}</span></div>
      <div class="kv"><span>needs (avg hit)</span><span>{hrs(m.recoverH)}</span></div>
      <div class="kv"><span>lowest readiness</span><span class={m.minReadiness < 0.5 ? "down" : ""}>{pct(m.minReadiness)}</span></div>
      <div class="kv"><span>overlaps / week</span><span class={m.overlaps ? "down" : ""}>{f1(m.overlaps)}</span></div>
    </div>
  );
}

function MuscleBars(props: { muscles: ProgramBodyMuscle[]; pinned: MuscleId | null; onPick: (m: MuscleId) => void }) {
  const groups = Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[];
  return (
    <div class="pbody-bars">
      {groups.map((g) => {
        const rows = props.muscles.filter((m) => m.group === g && (m.target || m.sets >= 0.5)).sort((a, b) => b.hardSets - a.hardSets);
        if (!rows.length) return null;
        return (
          <div class="bars-h">
            <div class="faint" style={{ fontSize: "var(--fs-s)" }}>{GROUP_LABEL[g]}</div>
            {rows.map((m) => {
              const col = m.status === "high" || m.overlaps > 0 ? "var(--down)" : m.status === "low" || m.status === "none" ? "var(--amber)" : "var(--l2)";
              return (
                <div class={`bar-h ${props.pinned === m.id ? "on" : ""}`} onClick={() => props.onPick(m.id)}
                  onMouseMove={(e) => tip.show(e, `${m.name}\n${f1(m.hardSets)} hard sets/wk${m.target ? ` · target ${m.target[0]}–${m.target[1]}` : ""} · ${STATUS[m.status]}${m.overlaps ? `\n${f1(m.overlaps)} overlaps/wk` : ""}`)} onMouseLeave={() => tip.hide()}>
                  <span>{m.short}</span>
                  <span class="trk">
                    <i style={{ width: `${Math.min(100, (m.hardSets / SCALE) * 100)}%`, background: col }} />
                    {m.target && <b style={{ left: `${(m.target[0] / SCALE) * 100}%`, width: `${((m.target[1] - m.target[0]) / SCALE) * 100}%` }} />}
                  </span>
                  <span class={m.status === "low" || m.status === "none" ? "am" : m.status === "high" ? "down" : "hi"}>{f1(m.hardSets)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
