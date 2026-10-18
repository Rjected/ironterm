import { useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import { isScheduled, schemeLabel, slotIncrement, weekIndex, type ProgramConfig } from "../../shared/program";
import { localDate } from "../../shared/stats";
import { fmt } from "../../shared/units";
import type { Nav } from "../app";
import type { Derived } from "../derive";
import { OutcomeTag, Panel, SessionTicket, shortDate, Tier, Watch } from "../ui";
import { GENERIC_FIXES } from "../../shared/stall";
import { programSwaps } from "../../shared/swap-list";
import { api } from "../api";

export function Program(props: { d: Derived; cfg: ProgramConfig | null; mode: "demo" | "live" | "local"; nav: Nav; onPush: (day?: number) => void; busy: boolean; onReload?: () => void; say?: (m: string, bad?: boolean) => void }) {
  const { d, cfg, nav } = props;
  const [day, setDay] = useState<number | null>(null);
  if (!d.def || !d.state || !cfg) {
    return (
      <div class="grid">
        <Panel title="NO ACTIVE PROGRAM">
          <p class="note">Pick a program and enter where you're starting from. GZCLP is prefilled from your LiftVault sheet.</p>
          <div><button class="btn pri" onClick={() => nav({ view: "set" })}>SET UP PROGRAM</button></div>
        </Panel>
      </div>
    );
  }
  const { def, state } = d;
  const shown = day ?? state.dayIndex;
  const plan = d.plan(shown)!;
  const log = [...state.log].reverse();
  const sessionsDone = state.log.length;
  const weeksIn = Math.floor(sessionsDone / def.sessionsPerWeek);
  const lastSession = state.log[state.log.length - 1];

  return (
    <div class="grid">
      {state.complete && (
        <section class="pn span-12"><div class="warnbox" style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>{def.name} is complete. Test or re-enter your maxes in Setup and start the next block (or pick a new program).</div></section>
      )}
      {def.notes?.length ? (
        <section class="pn span-12" style={{ paddingBlock: "8px" }}>
          <ul class="note" style={{ margin: 0, paddingLeft: "18px", maxWidth: "none" }}>{def.notes.map((n) => <li>{n}</li>)}</ul>
        </section>
      ) : null}
      <div class="kpis">
        <div class="kpi"><label>PROGRAM</label><div class="v" style={{ fontSize: "18px" }}>{def.name}</div><div class="d">since {shortDate(cfg.startDate.slice(0, 10))}</div></div>
        <div class="kpi"><label>SESSIONS</label><div class="v">{sessionsDone}</div><div class="d">≈ week {weeksIn + 1}</div></div>
        <div class="kpi"><label>NEXT</label><div class="v">{def.days[state.dayIndex].id}</div><div class="d">{def.days[state.dayIndex].name.split("·")[1]?.trim()}</div></div>
        <div class="kpi">
          <label>{def.cycle?.finite ? "WEEK" : "ROTATION"}</label>
          <div class="v">{def.cycle?.finite ? <>{Math.min(state.rotations + 1, def.cycle.weeks)}<small>/ {def.cycle.weeks}</small></> : state.rotations + 1}</div>
          <div class="d">{def.cycle ? def.cycle.weekNames?.[weekIndex(def, state.rotations)] ?? `week ${weekIndex(def, state.rotations) + 1} of ${def.cycle.weeks}` : `${def.days.length}-day cycle`}</div>
        </div>
        <div class="kpi"><label>LAST SESSION</label><div class="v" style={{ fontSize: "18px" }}>{lastSession ? lastSession.dayId : "—"}</div><div class="d">{lastSession ? shortDate(localDate(lastSession.date, d.tz)) : "nothing logged yet"}</div></div>
        {props.mode === "local"
          ? <div class="kpi"><label>LOGGING</label><div class="v" style={{ fontSize: "18px" }}>GYM</div><div class="d">no Hevy: log sessions here</div></div>
          : <div class="kpi"><label>HEVY ROUTINES</label><div class="v" style={{ fontSize: "18px" }}>{Object.keys(cfg.routineDays ?? {}).length ? "LINKED" : "—"}</div><div class="d">{props.mode === "live" ? "auto-update after each sync" : "demo mode"}</div></div>}
      </div>

      <Panel
        n="1" title={`SESSION · ${plan.dayId}`} span={5} sub={plan.dayName.split("·")[1]?.trim()}
        act={
          <>
            <div class="seg">
              {def.days.map((dd, i) => ({ dd, i })).filter(({ dd }) => isScheduled(dd, weekIndex(def, state.rotations))).map(({ dd, i }) => <button class={i === shown ? "on" : ""} onClick={() => setDay(i)}>{dd.id}{i === state.dayIndex ? "•" : ""}</button>)}
            </div>
          </>
        }
      >
        <SessionTicket s={plan} unit={cfg.unit} showPlates />
        {props.mode === "local" ? (
          <>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button class="btn pri" onClick={() => props.nav({ view: "gym" })}><em>F2</em>LOG IN GYM</button>
            </div>
            <p class="note">No Hevy connected, so there are no routines to push: start this session in GYM and it's saved here. Set HEVY_API_KEY to push routines to Hevy instead.</p>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button class="btn pri" disabled={props.mode !== "live" || props.busy} onClick={() => props.onPush()}><em>P</em>PUSH ALL DAYS TO HEVY</button>
              <button class="btn" disabled={props.mode !== "live" || props.busy} onClick={() => props.onPush(shown)}>PUSH {plan.dayId} ONLY</button>
            </div>
            <p class="note">Pushing creates one routine per day in a "{def.name} · Ironterm" folder. Start a workout from it in Hevy and the result flows back here, through the webhook or the 15-minute sync.</p>
          </>
        )}
      </Panel>

      <Panel n="2" title="SLOTS" span={7} sub="current weight, stage and what happens next">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>DAY</th><th class="l">TIER</th><th class="l">LIFT</th><th class="l">SCHEME</th><th>WEIGHT</th><th>+INC</th><th class="l">STATE</th></tr></thead>
            <tbody>
              {def.days.flatMap((dd, i) => (isScheduled(dd, weekIndex(def, state.rotations)) ? dd.slots : []).map((s) => {
                const p = s.progression;
                if (p.kind === "stages") {
                  const st = state.slots[s.id];
                  return (
                    <tr class={i === shown ? "sel" : ""}>
                      <td class="dim">{dd.id}</td>
                      <td class="l"><Tier t={s.tier} /></td>
                      <td class="l">{LIFTS[s.lift]?.name}</td>
                      <td class="l">{p.stages.map((x, k) => <span class={k === st.stage ? "hi" : "faint"}>{schemeLabel(x)}{k < p.stages.length - 1 ? " › " : ""}</span>)}</td>
                      <td class="hi">{st.retest ? "RETEST" : fmt(st.weight)}</td>
                      <td class="dim">{fmt(slotIncrement(def, cfg, s))}</td>
                      <td class="l">{st.retest ? <span class="down">5RM test due</span> : st.stage > 0 ? <span class="am">stage {st.stage + 1}/{p.stages.length}</span> : <span class="dim">base</span>}</td>
                    </tr>
                  );
                }
                if (p.kind === "double" || p.kind === "fixed") {
                  const st = state.slots[s.id];
                  return (
                    <tr class={i === shown ? "sel" : ""}>
                      <td class="dim">{dd.id}</td>
                      <td class="l"><Tier t={s.tier} /></td>
                      <td class="l">{LIFTS[s.lift]?.name}</td>
                      <td class="l dim">{p.kind === "double" ? `${p.sets}×${p.reps[0]}–${p.reps[1]}` : `${p.sets}×${p.reps}${p.repsMax ? "–" + p.repsMax : ""}`}</td>
                      <td class="hi">{st.weight ? fmt(st.weight) : "—"}</td>
                      <td class="dim">{p.kind === "double" ? fmt(slotIncrement(def, cfg, s)) : ""}</td>
                      <td class="l dim">{p.kind === "double" ? "double progression" : "as you like"}</td>
                    </tr>
                  );
                }
                return (
                  <tr class={i === shown ? "sel" : ""}>
                    <td class="dim">{dd.id}</td>
                    <td class="l"><Tier t={s.tier} /></td>
                    <td class="l">{LIFTS[s.lift]?.name}</td>
                    <td class="l dim">% of {LIFTS[p.tmLift]?.short} {def.maxLabel ?? "TM"}</td>
                    <td class="hi">{fmt(state.tms[p.tmLift] ?? 0)}</td>
                    <td class="dim">{def.maxLabel ?? "TM"}</td>
                    <td class="l dim">{p.tmRule ? "AMRAP drives TM" : def.cycle?.tmIncrease ? "TM up each cycle" : ""}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </Panel>

      {d.progStalls.length > 0 && (
        <Panel n="!" title="WATCH" span={12} sub="slots that stopped moving, with the program's own fix">
          <Watch d={d} nav={nav} full />
          <details class="note"><summary>General fixes</summary><ul>{GENERIC_FIXES.map((f) => <li>{f}</li>)}</ul></details>
        </Panel>
      )}

      <Swaps cfg={cfg} onReload={props.onReload} say={props.say} />

      <Panel n="3" title="DECISIONS" span={12} sub="every logged session, replayed against the program rules">
        {log.length ? (
          <div class="tbl-wrap">
            <table class="t">
              <thead><tr><th>DATE</th><th class="l">DAY</th><th class="l">TIER</th><th class="l">LIFT</th><th class="l">SCHEME</th><th>WEIGHT</th><th class="l">REPS</th><th class="l">CALL</th><th class="l">NEXT</th></tr></thead>
              <tbody>
                {log.slice(0, 60).flatMap((e) => e.results.map((r, k) => (
                  <tr class="click" onClick={() => nav({ view: "hist", workout: e.workoutId })}>
                    <td class="dim">{k === 0 ? shortDate(localDate(e.date, d.tz)) : ""}</td>
                    <td class="l dim">{k === 0 ? e.dayId : ""}</td>
                    <td class="l"><Tier t={r.tier} /></td>
                    <td class="l">{LIFTS[r.lift]?.short}</td>
                    <td class="l dim">{r.scheme}</td>
                    <td>{r.weight ? fmt(r.weight) : "—"}</td>
                    <td class="l dim">{r.reps.join(" ") || "—"}</td>
                    <td class="l"><OutcomeTag o={r.outcome} /></td>
                    <td class="l dim wrap">{r.note}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        ) : <div class="empty">No program sessions since {shortDate(cfg.startDate.slice(0, 10))}. Log a workout with this program's main lift and it'll be picked up.</div>}
      </Panel>
    </div>
  );
}

/** Swap an exercise for another everywhere the program has it; replacements most alike first. */
function Swaps(props: { cfg: ProgramConfig; onReload?: () => void; say?: (m: string, bad?: boolean) => void }) {
  const rows = programSwaps(props.cfg);
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows.length) return null;
  const change = async (lift: string, to: string) => {
    setBusy(lift);
    try {
      await api.swapLift(lift, to || null);
      props.say?.(to ? `${LIFTS[lift]?.name} → ${LIFTS[to]?.name} everywhere in the program` : `${LIFTS[lift]?.name} is back`);
      props.onReload?.();
    } catch (e) {
      props.say?.(`Couldn't swap: ${(e as Error).message}`, true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel n="4" title="SWAP EXERCISES" span={12} sub="do something else wherever the program has an exercise; the closest matches are listed first">
      <div class="tbl-wrap">
        <table class="t">
          <thead><tr><th class="l">PROGRAM SAYS</th><th class="l">DO INSTEAD</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr>
                <td class="l">{r.name}</td>
                <td class="l">
                  <select class="inp" value={r.to?.lift ?? ""} disabled={busy === r.lift} aria-label={`Swap ${r.name}`}
                    onChange={(e) => change(r.lift, (e.target as HTMLSelectElement).value)}>
                    <option value="">{r.name} (as written)</option>
                    {r.to && !r.options.some((o) => o.lift === r.to!.lift) && <option value={r.to.lift}>{r.to.name}</option>}
                    {r.options.map((o) => <option value={o.lift}>{o.name} · {Math.round(o.score * 100)}% alike</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
