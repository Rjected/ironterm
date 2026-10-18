// CAL: month grid of what you did and what's next, plus your training weekdays.

import { useMemo, useState } from "preact/hooks";
import { DOW } from "../../shared/recovery";
import { dow, history, trainingDays, upcoming, weekStatus } from "../../shared/schedule";
import { addDays, localDate } from "../../shared/stats";
import type { Bootstrap } from "../api";
import type { Nav } from "../app";
import type { Derived } from "../derive";
import { OutcomeTag, Panel, ReentryNote, Seg, SessionTicket, shortDate } from "../ui";
import { onTrip, returnStats, travelDays, travelSessions, type GymAccess, type Trip } from "../../shared/travel";
import { api } from "../api";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function Calendar(props: { b: Bootstrap; d: Derived; nav: Nav; onSettings: (p: Partial<Bootstrap["settings"]>) => void }) {
  const { b, d, nav } = props;
  const days = trainingDays(b.settings.trainingDays, d.def);
  const trips = b.trips ?? [];
  const skip = (date: string) => !!onTrip(trips, date);
  const travelOn = new Map(trips.flatMap((t) => travelDays(t).map((x, i) => [x, { trip: t, which: i % 2 }] as const)));
  const [month, setMonth] = useState(d.today.slice(0, 7));
  const [pick, setPick] = useState<string | null>(null);
  const trainedToday = d.workouts.some((w) => localDate(w.start_time, d.tz) === d.today);
  const plan = useMemo(() => (d.def && d.state ? upcoming(d.def, d.state, days, d.today, trainedToday, 60, skip) : []), [d, days.join(), trips]);
  const planned = new Map(plan.map((p) => [p.date, p]));
  const first = `${month}-01`;
  const gridStart = addDays(first, -dow(first));
  const past = useMemo(() => history(d.workouts, d.state?.log ?? [], d.tz, days, d.today, addDays(gridStart, -1), skip), [d, gridStart, days.join(), trips]);
  const status = weekStatus(d.workouts, d.tz, days, d.today, skip);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(dt.toISOString().slice(0, 7));
  };
  const sel = pick ?? d.today;
  const selPast = past.get(sel);
  const selPlan = planned.get(sel);
  const selTrip = onTrip(trips, sel);
  const selTravel = travelOn.get(sel);
  const returns = useMemo(() => returnStats([...d.workouts].reverse(), "squat", d.unit, d.tz, d.liftMap), [d.workouts]);
  const travelFor = (t: Trip) => travelSessions(t, d.e1rmNow, d.unit);

  return (
    <div class="grid">
      <Panel n="1" title={`${MONTHS[Number(month.slice(5)) - 1].toUpperCase()} ${month.slice(0, 4)}`} span={8} sub={status.label}
        act={<div class="seg"><button onClick={() => shift(-1)}>‹</button><button onClick={() => { setMonth(d.today.slice(0, 7)); setPick(null); }}>TODAY</button><button onClick={() => shift(1)}>›</button></div>}>
        <div class="cal">
          {DOW.map((x, i) => <div class={`cal-h ${days.includes(i) ? "train" : ""}`}>{x}</div>)}
          {cells.map((date) => {
            const r = past.get(date);
            const p = planned.get(date);
            const out = date.slice(0, 7) !== month;
            const outcomes = r?.program.flatMap((e) => e.results.filter((x) => x.tier === "T1" || x.tier === "MAIN").map((x) => x.outcome)) ?? [];
            const bad = outcomes.some((o) => o === "stage-down" || o === "fail" || o === "deload" || o === "reset" || o === "retest-next" || o === "tm-down");
            return (
              <button class={`cal-d ${onTrip(trips, date) ? "trip" : ""} ${out ? "out" : ""} ${date === d.today ? "today" : ""} ${date === sel ? "sel" : ""} ${r?.workouts.length ? "done" : ""} ${bad ? "bad" : ""} ${r?.missed ? "missed" : ""}`} onClick={() => setPick(date)}>
                <span class="cal-n">{Number(date.slice(8))}</span>
                {r?.workouts.length ? <span class="cal-t">{r.program[0]?.dayId ?? (r.workouts.length > 1 ? `${r.workouts.length}×` : "●")}</span> : null}
                {!r?.workouts.length && p ? <span class="cal-p">{p.dayId}</span> : null}
                {r?.missed && !p ? <span class="cal-m">—</span> : null}
                {!r?.workouts.length && travelOn.has(date) ? <span class="cal-p travel">{travelOn.get(date)!.which ? "TB" : "TA"}</span> : null}
              </button>
            );
          })}
        </div>
        <div class="legend" style={{ gap: "12px", flexWrap: "wrap" }}>
          <span><i style={{ background: "var(--l2)" }} /> trained</span>
          <span><i style={{ background: "var(--down)" }} /> T1 miss / stage-down</span>
          <span><i style={{ border: "1px dashed var(--amber)", background: "none" }} /> planned</span>
          <span><i style={{ background: "var(--trip)" }} /> trip</span>
          <span class="faint">— missed training day</span>
        </div>
      </Panel>

      <Panel n="2" title={sel === d.today ? "TODAY" : shortDate(sel)} span={4} sub={selPlan ? `${d.def?.name} · ${selPlan.dayId}` : selPast?.workouts.length ? `${selPast.workouts.length} workout${selPast.workouts.length > 1 ? "s" : ""}` : days.includes(dow(sel)) ? "training day" : "rest day"}>
        {selTrip && <div class="am" style={{ fontSize: "var(--fs-s)" }}>{selTrip.name.toUpperCase()} · {selTrip.gym === "none" ? "no gym" : selTrip.gym === "hotel" ? "hotel gym" : "full gym"} · program paused</div>}
        {selPast?.workouts.length ? (
          <div style={{ display: "grid", gap: "8px" }}>
            {selPast.workouts.map((w) => (
              <button class="btn" style={{ textAlign: "left" }} onClick={() => nav({ view: "hist", workout: w.id })}>{w.title} <span class="faint">· {w.exercises.length} exercises</span></button>
            ))}
            {selPast.program.flatMap((e) => e.results).map((r) => <div class="kv"><span>{r.tier} {r.lift}</span><OutcomeTag o={r.outcome} /></div>)}
          </div>
        ) : selTravel ? (
          <>
            <SessionTicket s={travelFor(selTravel.trip)[selTravel.which]} unit={d.unit} />
            <div class="row">
              <button class="btn pri" onClick={() => nav({ view: "gym" })}>OPEN GYM MODE</button>
              {b.mode === "live" && <button class="btn" onClick={async () => { await api.pushTravel(travelFor(selTravel.trip), d.unit); alertSaved(); }}>PUSH TRAVEL A/B TO HEVY</button>}
            </div>
          </>
        ) : selPlan && d.plan ? (
          <SessionTicket s={d.plan(selPlan.dayIndex)!} unit={d.unit} />
        ) : (
          <div class="empty">{sel < d.today ? (selPast?.missed ? "Training day with nothing logged." : "Rest day.") : "Nothing scheduled."}</div>
        )}
        {selPlan && sel === d.today && <button class="btn pri" onClick={() => nav({ view: "gym" })}>OPEN GYM MODE</button>}
      </Panel>

      <Panel n="3" title="NEXT 14 DAYS" span={8}>
        <div class="agenda">
          {Array.from({ length: 14 }, (_, i) => addDays(d.today, i)).map((date) => {
            const p = planned.get(date);
            return (
              <button class={`ag ${p ? "on" : ""}`} onClick={() => { setMonth(date.slice(0, 7)); setPick(date); }}>
                <span class="faint">{DOW[dow(date)]}</span>
                <span>{Number(date.slice(8))}</span>
                <b>{p ? p.dayId : "·"}</b>
              </button>
            );
          })}
        </div>
        {d.def?.cycle?.finite && plan.length > 0 && <div class="note">At this schedule, {d.def.name} finishes around {shortDate(plan[plan.length - 1].date)}.</div>}
      </Panel>

      {d.reentry && (
        <section class="pn span-12" style={{ paddingBlock: "8px" }}>
          <ReentryNote info={d.reentry} onOpen={(id) => props.nav({ view: "set", tab: "programs", id })} />
        </section>
      )}

      <Panel n="5" title="TRIPS" span={8} sub="the program pauses; suggested hotel-gym sessions fill the gap"
        act={<Seg value={b.settings.reentry === false ? "off" : "on"} onChange={(v) => props.onSettings({ reentry: v === "on" })} options={[["on", "RAMP ON"], ["off", "RAMP OFF"]]} />}>
        <div class="note">{returns.summary}</div>
        <TripEditor trips={trips} today={d.today} unit={d.unit} onSave={async (t) => { await api.saveTrips(t); props.onSettings({}); }} />
      </Panel>

      <Panel n="4" title="TRAINING DAYS" span={4} sub={`${days.length} per week${b.settings.trainingDays?.length ? "" : " (default spread)"}`}>
        <div class="seg" role="group" aria-label="Training weekdays">
          {DOW.map((x, i) => (
            <button class={days.includes(i) ? "on" : ""} aria-pressed={days.includes(i)} onClick={() => {
              const next = days.includes(i) ? days.filter((y) => y !== i) : [...days, i].sort();
              props.onSettings({ trainingDays: next });
            }}>{x}</button>
          ))}
        </div>
        <p class="note">Used to lay out upcoming program days and to tell whether you're behind. {d.def ? `${d.def.name} expects ${d.def.sessionsPerWeek} sessions a week.` : ""}</p>
      </Panel>
    </div>
  );
}

let alertSaved = () => {};

const EQUIP: [keyof NonNullable<Trip["equipment"]>, string][] = [["bench", "BENCH"], ["cable", "CABLE"], ["machines", "MACHINES"], ["pullupBar", "PULL-UP BAR"], ["barbell", "BARBELL"]];

function TripEditor(props: { trips: Trip[]; today: string; unit: "lb" | "kg"; onSave: (t: Trip[]) => Promise<void> }) {
  const blank = (): Trip => ({ id: Math.random().toString(36).slice(2, 9), name: "", start: props.today, end: addDays(props.today, 6), gym: "hotel", equipment: { dumbbells: props.unit === "lb" ? 50 : 22, bench: true, cable: false }, perWeek: 2 });
  const [t, setT] = useState<Trip>(blank());
  const [saved, setSaved] = useState("");
  alertSaved = () => { setSaved("Pushed to Hevy"); setTimeout(() => setSaved(""), 3000); };
  const eq = t.equipment ?? {};
  const upcomingTrips = [...props.trips].sort((a, z) => a.start.localeCompare(z.start));
  const save = async () => {
    if (!t.name || t.end < t.start) return;
    await props.onSave([...props.trips.filter((x) => x.id !== t.id), t]);
    setT(blank());
  };
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      {upcomingTrips.length > 0 && (
        <div class="tbl-wrap">
          <table class="t">
            <tbody>
              {upcomingTrips.map((x) => (
                <tr class={x.end < props.today ? "faint" : ""}>
                  <td>{x.name}</td>
                  <td class="dim">{shortDate(x.start)} – {shortDate(x.end)}</td>
                  <td class="dim">{x.gym === "none" ? "no gym" : x.gym === "hotel" ? `hotel${x.equipment?.dumbbells ? ` · DBs to ${x.equipment.dumbbells}` : ""}` : "full gym"}</td>
                  <td class="dim">{x.perWeek ?? 2}×/wk</td>
                  <td><button class="btn" onClick={() => setT(x)}>EDIT</button> <button class="btn danger" onClick={() => props.onSave(props.trips.filter((y) => y.id !== x.id))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div class="form" style={{ maxWidth: "none", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", alignItems: "end" }}>
        <div class="field"><label for="trip-name">TRIP</label><input class="inp" id="trip-name" placeholder="Santa Cruz" value={t.name} onInput={(e) => setT({ ...t, name: (e.target as HTMLInputElement).value })} /></div>
        <div class="field"><label for="trip-start">FROM</label><input class="inp" id="trip-start" type="date" value={t.start} onInput={(e) => setT({ ...t, start: (e.target as HTMLInputElement).value })} /></div>
        <div class="field"><label for="trip-end">TO</label><input class="inp" id="trip-end" type="date" value={t.end} onInput={(e) => setT({ ...t, end: (e.target as HTMLInputElement).value })} /></div>
        <div class="field"><label>GYM</label>
          <div class="seg">{([["none", "NONE"], ["hotel", "HOTEL"], ["full", "FULL"]] as [GymAccess, string][]).map(([v, l]) => <button class={t.gym === v ? "on" : ""} onClick={() => setT({ ...t, gym: v })}>{l}</button>)}</div>
        </div>
        <div class="field"><label>SESSIONS/WK</label>
          <div class="seg">{[1, 2, 3].map((n) => <button class={(t.perWeek ?? 2) === n ? "on" : ""} onClick={() => setT({ ...t, perWeek: n })}>{n}</button>)}</div>
        </div>
      </div>
      {t.gym === "hotel" && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <label class="dim" for="trip-db" style={{ fontSize: "var(--fs-s)" }}>DUMBBELLS UP TO</label>
          <input class="inp num" id="trip-db" inputMode="decimal" style={{ maxWidth: "80px" }} value={eq.dumbbells ?? ""} onInput={(e) => setT({ ...t, equipment: { ...eq, dumbbells: Number((e.target as HTMLInputElement).value) || 0 } })} />
          <span class="dim">{props.unit}</span>
          <div class="seg">{EQUIP.map(([k, l]) => <button class={eq[k] ? "on" : ""} aria-pressed={!!eq[k]} onClick={() => setT({ ...t, equipment: { ...eq, [k]: !eq[k] } })}>{l}</button>)}</div>
        </div>
      )}
      <div class="row">
        <button class="btn pri" disabled={!t.name || t.end < t.start} onClick={save}>{props.trips.some((x) => x.id === t.id) ? "SAVE TRIP" : "ADD TRIP"}</button>
        {saved && <span class="am">{saved}</span>}
      </div>
      <p class="note">Full gym: train the program as normal (it just won't flag missed days). Hotel / no gym: 1–2 short sessions a week keep your strength; the leg work uses a slow lowering so the first squat day back doesn't wreck you.</p>
    </div>
  );
}
