// GYM: the screen you keep open while training. Logs sets, runs the rest timer, then writes the
// workout to Hevy. If you log in Hevy instead, nothing is lost: the workout syncs in anyway.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import {
  addExercise, addSet, completeSet, current, emptySession, mapEx, progress, sessionFromPlan, updateSet,
  type LiveExercise, type LiveSession, type LiveSet,
} from "../../shared/live";
import { isScheduled, weekIndex } from "../../shared/program";
import { onTrip, travelSessions } from "../../shared/travel";
import { fmt, loadStep, plates } from "../../shared/units";
import { api, type Bootstrap } from "../api";
import type { Derived } from "../derive";
import { ExerciseBlock, Tier } from "../ui";
import "../gym.css";

const CARDIO = ["Recumbent Bike", "Treadmill", "Running", "Cycling", "Rowing Machine", "Elliptical Trainer", "Stair Machine (Steps)", "Walking", "Air Bike", "Ski Erg", "Jump Rope", "Swimming", "Spinning"];

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

function beep() {
  try {
    const ctx = new AudioContext();
    for (const [t, f] of [[0, 880], [0.18, 880], [0.36, 1320]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.16);
    }
  } catch { /* no audio */ }
  navigator.vibrate?.([200, 100, 200]);
}

export function Gym(props: { b: Bootstrap; d: Derived; onSaved: (msg: string) => void; onReload: () => void }) {
  const { b, d } = props;
  const [s, setS] = useState<LiveSession | null>(() => {
    if (b.live) return b.live;
    try { const x = localStorage.getItem("ht-live"); return x ? JSON.parse(x) : null; } catch { return null; }
  });
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = useNow(250);
  const saveT = useRef<number>();

  // Persist: localStorage immediately, server debounced (so another device / refresh picks it up).
  const update = (f: (x: LiveSession) => LiveSession) => setS((cur) => {
    if (!cur) return cur;
    const next = f(cur);
    try { localStorage.setItem("ht-live", JSON.stringify(next)); } catch { /* private mode */ }
    clearTimeout(saveT.current);
    saveT.current = window.setTimeout(() => api.saveLive(next).catch(() => {}), 600);
    return next;
  });
  const start = (x: LiveSession) => {
    try { localStorage.setItem("ht-live", JSON.stringify(x)); } catch { /* ignore */ }
    api.saveLive(x).catch(() => {});
    setS(x);
  };

  // Keep the screen on while a session is running.
  useEffect(() => {
    if (!s) return;
    let lock: any;
    const get = () => (navigator as any).wakeLock?.request("screen").then((l: any) => (lock = l)).catch(() => {});
    get();
    const vis = () => document.visibilityState === "visible" && get();
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); lock?.release?.(); };
  }, [!!s]);

  // Rest timer alarm.
  const restLeft = s?.restEndsAt ? (Date.parse(s.restEndsAt) - now) / 1000 : 0;
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (s?.restEndsAt && restLeft <= 0 && fired.current !== s.restEndsAt) { fired.current = s.restEndsAt; beep(); }
  }, [restLeft <= 0, s?.restEndsAt]);

  if (!s) return <StartScreen b={b} d={d} onStart={start} />;

  const cur = current(s);
  const prog = progress(s);
  const openId = open ?? cur?.exId ?? s.exercises[0]?.id;
  const elapsed = (now - Date.parse(s.startedAt)) / 1000;

  const finish = async () => {
    // a pending debounced save must not re-create the session after it's saved
    clearTimeout(saveT.current);
    setBusy(true);
    try {
      const r = await api.finishLive(s);
      try { localStorage.removeItem("ht-live"); } catch { /* ignore */ }
      setS(null);
      setFinishing(false);
      props.onSaved(r.demo ? "Saved (demo): program advanced" : r.local ? "Saved · program advanced" : "Saved to Hevy · program advanced");
      props.onReload();
    } catch (e) {
      props.onSaved(`Couldn't save: ${(e as Error).message}. Your session is kept — try again.`);
    }
    setBusy(false);
  };
  const discard = async () => {
    clearTimeout(saveT.current);
    await api.discardLive().catch(() => {});
    try { localStorage.removeItem("ht-live"); } catch { /* ignore */ }
    setS(null);
    setFinishing(false);
  };

  return (
    <div class="gym">
      <header class="gym-top">
        <div class="gym-title">
          <input class="gym-name" id="gym-title" value={s.title} onInput={(e) => update((x) => ({ ...x, title: (e.target as HTMLInputElement).value }))} />
          <span class="dim">{s.programName ? `${s.programName}${s.dayName ? " · " + s.dayName.split("·")[1]?.trim() : ""}` : "free session"}</span>
        </div>
        <div class="gym-clock">{clock(elapsed)}</div>
        <button class="btn pri" onClick={() => setFinishing(true)}>FINISH</button>
        <div class="gym-bar"><i style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} /></div>
      </header>

      {s.restEndsAt && (
        <div class={`rest ${restLeft <= 0 ? "over" : ""}`} role="timer">
          <span class="rest-l">{restLeft > 0 ? "REST" : "GO"}</span>
          <span class="rest-t">{restLeft > 0 ? clock(restLeft) : `+${clock(-restLeft)}`}</span>
          <button class="btn" onClick={() => update((x) => ({ ...x, restEndsAt: new Date(Date.parse(x.restEndsAt!) - 15000).toISOString() }))}>−15</button>
          <button class="btn" onClick={() => update((x) => ({ ...x, restEndsAt: new Date(Math.max(Date.now(), Date.parse(x.restEndsAt!)) + 30000).toISOString() }))}>+30</button>
          <button class="btn" onClick={() => update((x) => ({ ...x, restEndsAt: null }))}>SKIP</button>
        </div>
      )}

      {finishing && (
        <div class="gym-finish">
          <div class="hi">Finish {s.title}?</div>
          <div class="dim">{prog.done} of {prog.total} work sets done · {clock(elapsed)} · only completed sets are saved{b.mode === "live" ? " to Hevy" : ""}</div>
          <div class="row">
            <button class="btn pri" disabled={busy} onClick={finish}>{busy ? "SAVING…" : b.mode === "live" ? "SAVE TO HEVY" : "SAVE"}</button>
            <button class="btn" onClick={() => setFinishing(false)}>KEEP GOING</button>
            <button class="btn danger" onClick={discard}>DISCARD</button>
          </div>
        </div>
      )}

      <div class="gym-list">
        {s.exercises.map((ex) => (
          <ExerciseCard
            key={ex.id}
            ex={ex}
            unit={s.unit}
            open={ex.id === openId}
            currentSet={cur?.exId === ex.id ? cur.set : -1}
            onOpen={() => setOpen(ex.id === openId ? "__none" : ex.id)}
            onSet={(i, patch) => update((x) => updateSet(x, ex.id, i, patch))}
            onDone={(i) => update((x) => completeSet(x, ex.id, i))}
            onUndo={(i) => update((x) => updateSet(x, ex.id, i, { done: false, doneAt: undefined }))}
            onAddSet={() => update((x) => addSet(x, ex.id))}
            onRemoveSet={(i) => update((x) => mapEx(x, ex.id, (e) => ({ ...e, sets: e.sets.filter((_, k) => k !== i) })))}
            onRemove={() => update((x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== ex.id) }))}
            onNote={(v) => update((x) => mapEx(x, ex.id, (e) => ({ ...e, userNote: v })))}
          />
        ))}
        <button class="gym-add" onClick={() => setPicker(true)}>+ ADD EXERCISE</button>
        <textarea class="inp gym-notes" id="gym-notes" placeholder="notes (saved with the workout)" value={s.notes ?? ""} onInput={(e) => update((x) => ({ ...x, notes: (e.target as HTMLTextAreaElement).value }))} />
      </div>

      {picker && <Picker live={b.mode === "live"} onClose={() => setPicker(false)} onPick={(lift, o) => { update((x) => addExercise(x, lift, o)); setPicker(false); }} />}
    </div>
  );
}

function StartScreen(props: { b: Bootstrap; d: Derived; onStart: (s: LiveSession) => void }) {
  const { b, d } = props;
  const [day, setDay] = useState<number | null>(null);
  const def = d.def, state = d.state, cfg = b.program;
  const week = def && state ? weekIndex(def, state.rotations) : 0;
  const plan = def && state && cfg ? d.plan(day ?? state.dayIndex) : null;
  const trip = onTrip(b.trips ?? [], d.today);
  const travel = trip && trip.gym !== "full" ? travelSessions(trip, d.e1rmNow, d.unit) : null;
  const [tv, setTv] = useState(0);
  return (
    <div class="gym gym-start">
      {travel && (
        <>
          <div class="gym-hero">
            <div class="faint">TRAVELING · {trip!.name} · program paused</div>
            <div class="gym-day">{travel[tv].dayId} <span class="dim">{travel[tv].dayName.split("·")[1]?.trim()}</span></div>
            <button class="btn pri big-btn" onClick={() => props.onStart({ ...sessionFromPlan(travel[tv], d.unit, "Travel"), title: travel[tv].dayName.split("·")[0].trim(), dayId: undefined })}>START {travel[tv].dayId}</button>
            <div class="seg">{travel.map((t, i) => <button class={i === tv ? "on" : ""} onClick={() => setTv(i)}>{t.dayId}</button>)}</div>
          </div>
          <div class="gym-preview">{travel[tv].exercises.map((ex) => <ExerciseBlock ex={ex} unit={d.unit} />)}</div>
        </>
      )}
      {plan && def ? (
        <>
          <div class="gym-hero">
            <div class="faint">TODAY · {def.name}{plan.weekName ? ` · ${plan.weekName}` : ""}</div>
            <div class="gym-day">{plan.dayId} <span class="dim">{plan.dayName.split("·")[1]?.trim()}</span></div>
            <button class="btn pri big-btn" onClick={() => props.onStart(sessionFromPlan(plan, cfg!.unit, def.name))}>START {plan.dayId}</button>
            <div class="seg" style={{ flexWrap: "wrap" }}>
              {def.days.map((dd, i) => ({ dd, i })).filter(({ dd }) => isScheduled(dd, week)).map(({ dd, i }) => (
                <button class={i === (day ?? state!.dayIndex) ? "on" : ""} onClick={() => setDay(i)}>{dd.id}{i === state!.dayIndex ? "•" : ""}</button>
              ))}
            </div>
          </div>
          <div class="gym-preview">
            {plan.exercises.map((ex) => <ExerciseBlock ex={ex} unit={cfg!.unit} showPlates />)}
          </div>
        </>
      ) : (
        <div class="gym-hero"><div class="dim">No active program. Pick one in Setup, or just start logging.</div></div>
      )}
      <div class="gym-hero">
        <button class="btn" onClick={() => props.onStart(emptySession(d.unit))}>START EMPTY WORKOUT</button>
        <p class="note">Sets are saved as you go, so closing the tab or switching phones won't lose anything.{props.b.mode === "local" ? " Finished workouts are stored here: no Hevy needed." : " Logging in Hevy instead works too: it syncs in either way."}</p>
      </div>
    </div>
  );
}

function Stepper(props: { value: number | null; step: number; onChange: (v: number | null) => void; label: string; id: string; placeholder?: string }) {
  return (
    <div class="step">
      <button aria-label={`less ${props.label}`} onClick={() => props.onChange(Math.max(0, (props.value ?? 0) - props.step))}>−</button>
      <input
        id={props.id}
        inputMode="decimal"
        aria-label={props.label}
        placeholder={props.placeholder}
        value={props.value == null ? "" : fmt(props.value)}
        onChange={(e) => { const v = (e.target as HTMLInputElement).value.trim(); props.onChange(v === "" ? null : Number(v)); }}
      />
      <button aria-label={`more ${props.label}`} onClick={() => props.onChange((props.value ?? 0) + props.step)}>+</button>
    </div>
  );
}

function ExerciseCard(props: {
  ex: LiveExercise; unit: "lb" | "kg"; open: boolean; currentSet: number;
  onOpen: () => void; onSet: (i: number, p: Partial<LiveSet>) => void; onDone: (i: number) => void; onUndo: (i: number) => void;
  onAddSet: () => void; onRemoveSet: (i: number) => void; onRemove: () => void; onNote: (v: string) => void;
}) {
  const { ex, unit } = props;
  const lift = LIFTS[ex.lift];
  const name = ex.title ?? lift?.name ?? ex.lift;
  const done = ex.sets.filter((x) => x.done).length;
  const step = loadStep(lift?.kind ?? "barbell", unit);
  const curW = props.currentSet >= 0 ? ex.sets[props.currentSet].weight : null;
  const p = (lift?.kind ?? "barbell") === "barbell" && curW ? plates(curW, unit) : [];
  return (
    <section class={`gx ${props.open ? "open" : ""} ${done === ex.sets.length ? "complete" : ""}`}>
      <button class="gx-h" onClick={props.onOpen}>
        {ex.tier && <Tier t={ex.tier} />}
        <span class="gx-name">{name}</span>
        <span class="dim">{ex.scheme ?? ""}</span>
        {ex.userNote && !props.open && <span class="gx-has-note" title={ex.userNote}>✎</span>}
        <span class="gx-count">{done}/{ex.sets.length}</span>
      </button>
      {props.open && (
        <div class="gx-b">
          {ex.note && <div class="next">{ex.note}</div>}
          {(ex.ifSuccess || ex.ifFail) && <div class="next">{ex.ifSuccess && <span><b>▲</b> {ex.ifSuccess}</span>}{ex.ifFail && <span><i>▼</i> {ex.ifFail}</span>}</div>}
          {ex.sets.map((x, i) => (
            <div class={`gs ${x.done ? "done" : ""} ${i === props.currentSet ? "cur" : ""} ${x.type}`}>
              <span class="gs-i">
                <b>{x.type === "warmup" ? "W" : ex.sets.slice(0, i + 1).filter((y) => y.type !== "warmup").length}</b>
                <small>{x.target ? <>{x.target.ofTop ? `${Math.round(x.target.ofTop * 100)}%top` : x.target.weight ? fmt(x.target.weight) : x.target.rpe ? `@${x.target.rpe}` : ""}×{x.target.reps}{x.target.repsMax ? `–${x.target.repsMax}` : ""}{x.target.amrap ? "+" : ""}</> : x.type === "warmup" ? "warm" : ""}</small>
              </span>
              {ex.cardio ? (
                <>
                  <Stepper id={`d-${ex.id}-${i}`} label="minutes" value={x.durationSec != null ? x.durationSec / 60 : null} step={5} onChange={(v) => props.onSet(i, { durationSec: v == null ? null : v * 60 })} placeholder="min" />
                  <Stepper id={`k-${ex.id}-${i}`} label={unit === "lb" ? "miles" : "km"} value={x.distanceM != null ? x.distanceM / (unit === "lb" ? 1609.344 : 1000) : null} step={0.5} onChange={(v) => props.onSet(i, { distanceM: v == null ? null : v * (unit === "lb" ? 1609.344 : 1000) })} placeholder={unit === "lb" ? "mi" : "km"} />
                </>
              ) : (
                <>
                  <Stepper id={`w-${ex.id}-${i}`} label={`weight ${unit}`} value={x.weight} step={step} onChange={(v) => props.onSet(i, { weight: v })} placeholder={lift?.kind === "bodyweight" ? "BW" : unit} />
                  <Stepper id={`r-${ex.id}-${i}`} label="reps" value={x.reps} step={1} onChange={(v) => props.onSet(i, { reps: v })} placeholder="reps" />
                </>
              )}
              <button class="gs-ok" aria-label={x.done ? "undo set" : "complete set"} onClick={() => (x.done ? props.onUndo(i) : props.onDone(i))}>{x.done ? "✓" : "○"}</button>
              {!x.done && !x.target && <button class="gs-x" aria-label="remove set" onClick={() => props.onRemoveSet(i)}>×</button>}
            </div>
          ))}
          {p.length > 0 && <div class="plates">PLATES/SIDE {p.map((v) => fmt(v)).join(" · ")}</div>}
          <input class="inp gx-note" id={`note-${ex.id}`} aria-label={`note for ${name}`} maxLength={2000} placeholder="note for this exercise (optional)"
            value={ex.userNote ?? ""} onInput={(e) => props.onNote((e.target as HTMLInputElement).value)} />
          <div class="row">
            <button class="btn" onClick={props.onAddSet}>+ SET</button>
            {!ex.slotId && <button class="btn danger" onClick={props.onRemove}>REMOVE</button>}
          </div>
        </div>
      )}
    </section>
  );
}

function Picker(props: { live: boolean; onClose: () => void; onPick: (lift: string, o: { cardio?: boolean; title?: string; templateId?: string }) => void }) {
  const [q, setQ] = useState("");
  const [tpls, setTpls] = useState<{ id: string; title: string }[]>([]);
  useEffect(() => { if (props.live) api.templates().then(setTpls).catch(() => {}); }, []);
  const t = q.trim().toLowerCase();
  const lifts = useMemo(() => Object.entries(LIFTS).filter(([, l]) => !t || l.name.toLowerCase().includes(t) || l.hevy.some((h) => h.toLowerCase().includes(t))).slice(0, 30), [t]);
  const known = new Set(Object.values(LIFTS).flatMap((l) => l.hevy.map((h) => h.toLowerCase())));
  const other = tpls.filter((x) => !known.has(x.title.toLowerCase()) && (!t || x.title.toLowerCase().includes(t))).slice(0, 30);
  const cardio = CARDIO.filter((c) => !t || c.toLowerCase().includes(t));
  return (
    <div class="picker" role="dialog" aria-label="Add exercise">
      <div class="picker-h">
        <input class="inp" id="pick-q" autofocus placeholder="search exercises" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <button class="btn" onClick={props.onClose}>CLOSE</button>
      </div>
      <div class="picker-l">
        {cardio.length > 0 && <div class="am picker-sec">CARDIO</div>}
        {cardio.map((c) => {
          const tp = tpls.find((x) => x.title === c);
          return <button onClick={() => props.onPick("cardio", { cardio: true, title: c, templateId: tp?.id ?? `demo-cardio-${c}` })}>{c}</button>;
        })}
        <div class="am picker-sec">LIFTS</div>
        {lifts.map(([k, l]) => <button onClick={() => props.onPick(k, {})}>{l.name} <span class="faint">{l.hevy[0] ?? "custom"}</span></button>)}
        {other.length > 0 && <div class="am picker-sec">OTHER HEVY EXERCISES</div>}
        {other.map((x) => <button onClick={() => props.onPick("custom", { title: x.title, templateId: x.id })}>{x.title}</button>)}
      </div>
    </div>
  );
}
