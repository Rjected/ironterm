import { useEffect, useMemo, useState } from "preact/hooks";
import type { HevyWorkout } from "../../shared/hevy";
import { matchLift } from "../../shared/lifts";
import { durationMin, localDate, workoutVolumeKg, workoutYears } from "../../shared/stats";

import { fmt, fmtInt, fromKg } from "../../shared/units";
import { Heatmap, Legend } from "../charts";
import { whoopFor } from "../../shared/whoop";
import type { Derived } from "../derive";
import type { Nav } from "../app";
import { Panel, shortDate } from "../ui";
import { api } from "../api";
import { splitDescription, type NotesEdit } from "../../shared/notes";

export function History(props: { d: Derived; mode: "demo" | "live" | "local"; date?: string; workout?: string; nav: Nav; onSaved: (msg: string) => void }) {
  const { d, nav } = props;
  const [q, setQ] = useState("");
  const years = useMemo(() => workoutYears(d.workouts, d.tz), [d.workouts]);
  const sel = props.workout ? d.byId.get(props.workout) : props.date ? d.workouts.find((w) => localDate(w.start_time, d.tz) === props.date) : d.workouts[0];

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return d.workouts.filter((w) => !t || w.title.toLowerCase().includes(t) || w.exercises.some((e) => e.title.toLowerCase().includes(t)));
  }, [q, d.workouts]);

  useEffect(() => {
    if (sel) document.getElementById(`w-${sel.id}`)?.scrollIntoView({ block: "nearest" });
  }, [sel?.id]);

  // group by month
  const months: [string, HevyWorkout[]][] = [];
  for (const w of list.slice(0, 400)) {
    const m = localDate(w.start_time, d.tz).slice(0, 7);
    if (months[months.length - 1]?.[0] !== m) months.push([m, []]);
    months[months.length - 1][1].push(w);
  }

  return (
    <div class="grid">
      <Panel n="1" title="ALL YEARS" span={12} sub={`${years.length} years · ${fmtInt(d.workouts.length)} workouts`} act={<Legend />}>
        <div style={{ display: "grid", gap: "10px" }}>
          {years.map(({ year: y, n }) => {
            const end = y === d.today.slice(0, 4) ? d.today : `${y}-12-31`;
            return (
              <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr)", gap: "8px", alignItems: "start" }}>
                <div><div class="hi">{y}</div><div class="faint" style={{ fontSize: "var(--fs-s)" }}>{n}</div></div>
                <Heatmap
                  cells={d.cells}
                  today={d.today}
                  end={end}
                  minCell={9}
                  label={(c, date) => (c ? `${shortDate(date)}\n${c.workouts.length} workout(s)` : shortDate(date))}
                  onPick={(date, c) => c && nav({ view: "hist", date })}
                />
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel n="2" title="WORKOUTS" span={5} act={<input class="inp" style={{ width: "160px" }} id="hist-q" placeholder="filter: squat, title…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />}>
        <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {months.map(([m, ws]) => (
            <div>
              <div class="am" style={{ fontSize: "var(--fs-s)", padding: "8px 0 2px", position: "sticky", top: 0, background: "var(--bg)" }}>{m}</div>
              <div class="wl">
                {ws.map((w) => (
                  <button id={`w-${w.id}`} style={sel?.id === w.id ? { background: "var(--raise)", boxShadow: "inset 2px 0 0 var(--amber)" } : undefined} onClick={() => nav({ view: "hist", workout: w.id })}>
                    <span class="dim">{shortDate(localDate(w.start_time, d.tz))}</span>
                    <span style={{ minWidth: 0 }}>
                      <div class="t1">{w.title}</div>
                      <div class="ex-l">{w.exercises.map((e) => e.title.replace(/ \(.*\)/, "")).join(" · ")}</div>
                    </span>
                    <span class="dim">{fmt(fromKg(workoutVolumeKg(w), d.unit) / 1000)}k</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel n="3" title="DETAIL" span={7} sub={sel ? `${shortDate(localDate(sel.start_time, d.tz))} · ${Math.round(durationMin(sel))} min · ${fmtInt(fromKg(workoutVolumeKg(sel), d.unit))} ${d.unit}` : undefined}>
        {sel ? <WorkoutDetail key={sel.id} w={sel} d={d} hevy={props.mode === "live" && !sel.id.startsWith("demo-") && !sel.id.startsWith("strong-") && !sel.id.startsWith("local-")} onSaved={props.onSaved} /> : <div class="empty">Pick a workout.</div>}
      </Panel>
    </div>
  );
}

const ZONE_COLORS = ["var(--line-2)", "var(--l4)", "var(--l3)", "var(--l2)", "var(--l1)", "var(--amber)"];

/** WHOOP summary for the session (matched by time), if any. */
function WhoopStrip(props: { w: HevyWorkout; d: Derived }) {
  const h = whoopFor(props.d.whoop, props.w.start_time, props.w.end_time);
  if (!h) return null;
  const total = (h.zones ?? []).reduce((a, x) => a + x, 0);
  return (
    <div style={{ display: "grid", gap: "6px" }}>
      <div class="kv" style={{ flexWrap: "wrap", gap: "4px 16px", justifyContent: "flex-start" }}>
        <span class="am">WHOOP</span>
        {h.avgHr != null && <span>avg <span class="hi">{h.avgHr}</span> bpm</span>}
        {h.maxHr != null && <span>max <span class="hi">{h.maxHr}</span></span>}
        {h.strain != null && <span>strain <span class="hi">{fmt(h.strain)}</span></span>}
        {h.kj != null && <span><span class="hi">{fmtInt(h.kj / 4.184)}</span> kcal</span>}
      </div>
      {total > 0 && (
        <div style={{ display: "flex", height: "8px" }} title={(h.zones ?? []).map((z, i) => `Z${i} ${Math.round(z / 60000)} min`).join(" · ")}>
          {(h.zones ?? []).map((z, i) => <i style={{ width: `${(z / total) * 100}%`, background: ZONE_COLORS[i] }} />)}
        </div>
      )}
    </div>
  );
}

function WorkoutDetail(props: { w: HevyWorkout; d: Derived; hevy: boolean; onSaved: (msg: string) => void }) {
  const { w, d } = props;
  const entry = d.state?.log.find((e) => e.workoutId === w.id);
  const desc = splitDescription(w.description).text;
  const [edit, setEdit] = useState<NotesEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const live = props.hevy;
  const save = async () => {
    if (!edit) return;
    setBusy(true); setErr(null);
    try {
      const r = await api.saveNotes(w.id, edit);
      setEdit(null);
      props.onSaved(r.demo ? "Notes saved (demo: kept locally)" : r.local ? "Notes saved" : "Notes saved to Hevy");
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", justifyContent: "space-between" }}>
        <div class="hi" style={{ fontSize: "16px" }}>{w.title}</div>
        {!edit && <button class="btn" onClick={() => setEdit({ description: desc, exercises: w.exercises.map((e) => e.notes ?? "") })}>EDIT NOTES</button>}
      </div>
      {entry && <div class="note">Counted as program day <span class="am">{entry.dayId}</span>: {entry.results.map((r) => `${r.lift} ${r.outcome}`).join(" · ")}</div>}
      {edit ? (
        <div class="notes-edit">
          <label class="dim" for="wn-desc">WORKOUT NOTE</label>
          <textarea class="inp" id="wn-desc" rows={3} maxLength={2000} placeholder="how it went, sleep, anything" value={edit.description}
            onInput={(e) => setEdit({ ...edit, description: (e.target as HTMLTextAreaElement).value })} />
          <div class="row" style={{ gap: "6px", flexWrap: "wrap" }}>
            <button class="btn" style={{ borderColor: "var(--amber)", color: "var(--amber)" }} disabled={busy} onClick={save}>{busy ? "SAVING…" : live ? "SAVE TO HEVY" : "SAVE"}</button>
            <button class="btn" disabled={busy} onClick={() => { setEdit(null); setErr(null); }}>CANCEL</button>
            <span class="faint" style={{ fontSize: "var(--fs-s)" }}>exercise notes are below each exercise{live ? "; this updates the workout in Hevy" : ""}</span>
          </div>
          {err && <div class="warnbox">{err}</div>}
        </div>
      ) : desc && <div class="note" style={{ whiteSpace: "pre-wrap" }}>{desc}</div>}
      <WhoopStrip w={w} d={d} />
      {w.exercises.map((e, k) => {
        const lift = matchLift(e.title, e.exercise_template_id, d.liftMap);
        return (
          <div class="ex">
            <div class="ex-h"><span class="name">{e.title}</span>{lift && <span class="faint">· {lift}</span>}</div>
            {edit ? (
              <input class="inp" id={`wn-ex-${k}`} aria-label={`note for ${e.title}`} maxLength={2000} placeholder="exercise note (optional)" value={edit.exercises[k] ?? ""}
                onInput={(ev) => setEdit({ ...edit, exercises: edit.exercises.map((x, i) => (i === k ? (ev.target as HTMLInputElement).value : x)) })} />
            ) : e.notes ? <div class="note ex-note">{e.notes}</div> : null}
            <div class="tbl-wrap">
              <table class="t">
                <thead><tr><th>#</th><th>TYPE</th><th>WEIGHT</th><th>REPS</th><th>RPE</th><th>e1RM</th></tr></thead>
                <tbody>
                  {e.sets.map((s, i) => {
                    const wt = s.weight_kg != null ? fromKg(s.weight_kg, d.unit) : null;
                    const r = s.reps ?? 0;
                    return (
                      <tr class={s.type === "warmup" ? "faint" : ""}>
                        <td>{i + 1}</td>
                        <td>{s.type === "normal" ? "" : s.type.toUpperCase()}</td>
                        <td class={s.type === "warmup" ? "" : "hi"}>{wt != null ? fmt(wt) : s.duration_seconds ? `${Math.round(s.duration_seconds / 60)}m` : "BW"}</td>
                        <td>{r || (s.distance_meters ? `${fmt(s.distance_meters / 1000, 2)}km` : "")}</td>
                        <td class="dim">{s.rpe ?? ""}</td>
                        <td class="dim">{wt && r && s.type !== "warmup" ? fmt(r === 1 ? wt : wt * (1 + r / 30), 0) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
