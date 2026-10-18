// INSIGHTS: the nerd tab. Projections, strength balance, PR wall, e1RM formula shootout — and,
// as they land, training load (INOL / Prilepin / volume landmarks), body & recovery, achievements
// and the program what-if.

import { useMemo, useState } from "preact/hooks";
import { FORMULA_INFO, formulaShootout } from "../../shared/e1rm";
import { BIG_FOUR, LIFTS } from "../../shared/lifts";
import { projectLift } from "../../shared/projection";
import { prWall, recentPRs } from "../../shared/prwall";
import { strengthBalance } from "../../shared/ratios";
import { addDays } from "../../shared/stats";
import { fmt } from "../../shared/units";
import { LineChart } from "../charts";
import type { Nav } from "../app";
import type { Derived } from "../derive";
import { Panel, Seg, shortDate } from "../ui";
import { api, type Bootstrap } from "../api";
import { bodyweightTrend, mergeWeighIns, strengthVsBodyweight, type WeighIn } from "../../shared/bodyweight";
import { recoveryVsPerformance } from "../../shared/correlate";
import { evaluateAchievements } from "../../shared/achievements";
import { fromKg, parseWeightInput, toKg } from "../../shared/units";
import { compare, startingConfig } from "../../shared/simulate";
import { TEMPLATES, getTemplate } from "../../shared/programs";
import { inolBand, plannedInol, sessionInol, weeklyInol } from "../../shared/inol";
import { averageWeeks, LANDMARK_GROUPS, LANDMARKS, landmarkStatus, programMuscleSets, weeklyMuscleSets } from "../../shared/landmarks";
import { Picker, programOptions } from "../components/picker";

export type InsightTab = "strength" | "load" | "whatif" | "records" | "formulas" | "body" | "awards";

export function Insights(props: { d: Derived; b: Bootstrap; nav: Nav; onReload: () => void }) {
  const [tab, setTab] = useState<InsightTab>("strength");
  return (
    <div class="grid">
      <section class="pn span-12" style={{ flexDirection: "row", gap: "8px", padding: "8px 12px", alignItems: "center", flexWrap: "wrap" }}>
        <Seg value={tab} onChange={setTab} options={[["strength", "STRENGTH"], ["load", "LOAD"], ["whatif", "WHAT-IF"], ["records", "PR WALL"], ["formulas", "e1RM FORMULAS"], ["body", "BODY & RECOVERY"], ["awards", "ACHIEVEMENTS"]]} />
      </section>
      {tab === "strength" && <Strength {...props} />}
      {tab === "load" && <Load {...props} />}
      {tab === "whatif" && <WhatIf {...props} />}
      {tab === "records" && <Records {...props} />}
      {tab === "formulas" && <Formulas {...props} />}
      {tab === "body" && <BodyRecovery {...props} />}
      {tab === "awards" && <Awards {...props} />}
    </div>
  );
}

function Strength(props: { d: Derived; nav: Nav }) {
  const { d } = props;
  const u = d.unit;
  const lifts = BIG_FOUR.filter((l) => d.lifts[l]?.length);
  const [lift, setLift] = useState<string>(lifts[0] ?? "squat");
  const [target, setTarget] = useState<string>("");
  const pts = d.lifts[lift] ?? [];
  const proj = useMemo(() => projectLift(pts, d.today, { weeks: 16 }), [pts, d.today]);
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const bal = useMemo(() => strengthBalance(asc, u, { today: d.today, tz: d.tz, map: d.liftMap }), [asc]);
  const reach = target && proj.status === "ok" ? proj.whenReach(Number(target)) : null;

  return (
    <>
      <Panel n="1" title="PROJECTION" span={8} sub={proj.note}
        act={<div class="seg">{lifts.map((l) => <button class={l === lift ? "on" : ""} onClick={() => setLift(l)}>{LIFTS[l].short}</button>)}</div>}>
        {proj.status === "ok" || proj.status === "flat" ? (
          <LineChart
            unit={u}
            height={240}
            from={proj.points.find((p) => p.inFit)?.date ?? addDays(d.today, -180)}
            to={proj.band[proj.band.length - 1]?.date ?? d.today}
            band={proj.band}
            series={[
              { key: "best", label: "28d best", color: "var(--l1)", points: proj.points.map((p) => ({ date: p.date, v: p.best })) },
              { key: "fit", label: "trend", color: "var(--amber)", dashed: true, points: [...proj.fit.map((p) => ({ date: p.date, v: p.value }))] },
            ]}
          />
        ) : <div class="empty">{proj.status === "inactive" ? `No ${LIFTS[lift]?.name} sessions recently. Projections need a current block of training.` : `Not enough recent ${LIFTS[lift]?.name} sessions to fit a trend yet (needs ~6 sessions over 3+ weeks).`}</div>}
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
          {proj.status === "ok" && proj.slopePerWeek != null && <span>trend <span class={proj.slopePerWeek > 0 ? "up" : "down"}>{proj.slopePerWeek > 0 ? "+" : ""}{fmt(proj.slopePerWeek)} {u}/wk</span> · in 16 wk ≈ <span class="hi">{fmt(proj.projected ?? 0, 0)}</span></span>}
          <label class="dim" for="target">WHEN DO I HIT</label>
          <input class="inp num" id="target" inputMode="decimal" placeholder={u} value={target} onInput={(e) => setTarget((e.target as HTMLInputElement).value)} />
          {target && (reach ? <span>≈ <span class="am">{shortDate(reach.date)}</span> <span class="faint">(80%: {shortDate(reach.early)} – {reach.late ? shortDate(reach.late) : "later"})</span></span> : <span class="faint">{proj.status === "ok" ? "not on the current trend" : "needs an active, rising trend"}</span>)}
        </div>
        <p class="note">Fits the 28-day best e1RM over your current training block (since your last 4+ week break). The band is an 80% range; it's optimistic because consecutive points are correlated.</p>
      </Panel>

      <Panel n="2" title="STRENGTH BALANCE" span={4} sub="best e1RMs, last 12 months">
        <div class="note">{bal.summary}</div>
        <div style={{ display: "grid", gap: "8px" }}>
          {bal.ratios.map((r) => {
            const lo = r.lo * 0.7, hi = r.hi * 1.3, X = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
            return (
              <div class="ratio" title={`${r.note}\nreference ${r.ref} (${r.lo}–${r.hi}) · ${r.source}`}>
                <div class="kv"><span>{r.label}</span><span class={r.status === "balanced" ? "hi" : "am"}>{fmt(r.ratio, 2)}</span></div>
                <div class="ratio-bar">
                  <i class="ratio-ok" style={{ left: X(r.lo), width: `calc(${X(r.hi)} - ${X(r.lo)})` }} />
                  <i class={`ratio-dot ${r.status}`} style={{ left: X(r.ratio) }} />
                </div>
                {r.status !== "balanced" && <div class="faint" style={{ fontSize: "10px" }}>{r.note}</div>}
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

function Records(props: { d: Derived; nav: Nav }) {
  const { d, nav } = props;
  const [lift, setLift] = useState<string>(d.liftKeys[0] ?? "squat");
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const wall = useMemo(() => prWall(asc, lift, d.unit, { tz: d.tz, map: d.liftMap, today: d.today }), [asc, lift]);
  const recent = useMemo(() => recentPRs(asc, addDays(d.today, -90), { unit: d.unit, tz: d.tz, map: d.liftMap }), [asc]);
  const u = d.unit;
  const age = (days: number) => (days >= 365 ? `${fmt(days / 365, 1)} yr` : days >= 60 ? `${Math.round(days / 30)} mo` : `${days} d`);
  return (
    <>
      <Panel n="1" title={`${wall.name} · REP MAXES`} span={8} sub={wall.e1rm ? `e1RM record ${fmt(wall.e1rm.value, 0)} ${u} · ${shortDate(wall.e1rm.date)} · improved ${wall.e1rm.improvements}×` : undefined}
        act={<Picker id="pr-lift" label="Lift" value={lift} onChange={setLift} options={d.liftKeys.map((l) => ({ value: l, label: LIFTS[l]?.name ?? l }))} />}>
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>REPS</th><th>{wall.bodyweight ? "ADDED" : "WEIGHT"}</th><th>SET</th><th>DATE</th><th>STOOD</th><th>BEATEN</th><th class="l">PROGRESSION</th></tr></thead>
            <tbody>
              {wall.repMaxes.map((r) => (
                <tr class="click" onClick={() => nav({ view: "hist", workout: r.workoutId })}>
                  <td>{r.reps}</td>
                  <td class="hi">{fmt(r.value)}</td>
                  <td class="dim">{fmt(r.setWeight)}×{r.setReps}</td>
                  <td class={r.stoodDays < 60 ? "am" : "dim"}>{shortDate(r.date)}</td>
                  <td class={r.stoodDays > 365 ? "down" : "dim"}>{age(r.stoodDays)}</td>
                  <td class="dim">{r.improvements}</td>
                  <td class="l faint">{r.history.slice(-5).map((h) => fmt(h.weight)).join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {wall.maxReps && <div class="note">Most reps in a set: <span class="hi">{wall.maxReps.value}</span> ({shortDate(wall.maxReps.date)})</div>}
      </Panel>

      <Panel n="2" title="RECENT PRs" span={4} sub="last 90 days, all lifts">
        {recent.length ? (
          <div class="tbl-wrap">
            <table class="t">
              <tbody>
                {recent.slice(0, 20).map((p) => (
                  <tr class="click" onClick={() => nav({ view: "hist", workout: p.workoutId })}>
                    <td>{LIFTS[p.lift]?.short ?? p.lift}</td>
                    <td class="dim">{p.kind === "e1rm" ? "e1RM" : p.kind === "maxReps" ? "reps" : `${p.reps}RM`}</td>
                    <td class="am">{p.kind === "maxReps" ? p.setReps : fmt(p.weight)}</td>
                    <td class="faint">{p.prev != null ? `from ${fmt(p.prev)}` : "first"}</td>
                    <td class="dim">{shortDate(p.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div class="empty">No PRs in the last 90 days.</div>}
      </Panel>

      <Panel n="3" title="LONGEST-STANDING" span={12} sub={`${wall.name}: records you haven't touched in a while`}>
        <div class="agenda" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {wall.oldest.slice(0, 8).map((r) => (
            <div class="ag" style={{ cursor: "default", padding: "8px" }}>
              <span class="faint">{r.kind === "e1rm" ? "e1RM" : r.kind === "maxReps" ? "max reps" : `${r.reps}RM`}</span>
              <span class="hi">{r.kind === "maxReps" ? r.value : fmt(r.value)}</span>
              <b class="down">{age(r.stoodDays)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

function Formulas(props: { d: Derived }) {
  const { d } = props;
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const lifts = BIG_FOUR.filter((l) => d.lifts[l]?.length);
  const res = useMemo(() => lifts.map((l) => formulaShootout(asc, l, d.unit, { tz: d.tz, map: d.liftMap })), [asc]);
  return (
    <>
      {res.map((r) => (
        <Panel title={`${LIFTS[r.lift].name}`} span={6} sub={`${r.n} tests${r.pooled ? " (pooled)" : ""} · best: ${FORMULA_INFO[r.best].name}`}>
          <div class="note">{r.note}</div>
          <div class="tbl-wrap">
            <table class="t">
              <thead><tr><th>FORMULA</th><th>ERROR</th><th>BIAS</th><th>n</th><th class="l">EXPRESSION</th></tr></thead>
              <tbody>
                {r.scores.map((s) => (
                  <tr class={s.formula === r.best ? "sel" : ""}>
                    <td class={s.formula === r.best ? "am" : ""}>{s.name}</td>
                    <td class="hi">{s.meanAbsPct != null ? `${fmt(s.meanAbsPct * 100, 1)}%` : "—"}</td>
                    <td class={(s.bias ?? 0) > 0 ? "up" : "down"}>{s.bias != null ? `${s.bias > 0 ? "+" : ""}${fmt(s.bias * 100, 1)}%` : "—"}</td>
                    <td class="dim">{s.n}</td>
                    <td class="l faint">{FORMULA_INFO[s.formula].expr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      <section class="pn span-12"><p class="note">Backtest: each heavy single or double you actually did (≥90% of your best, not logged below RPE 9) is predicted from your best 3–10 rep set in the 6 weeks before it. Lower error = that formula reads your strength better. Bias &gt; 0 means it over-predicts.</p></section>
    </>
  );
}

/** All weigh-ins we know about: manual, Hevy's body log, WHOOP's profile weight. */
export function weighIns(b: Bootstrap): WeighIn[] {
  return [
    ...(b.weighins ?? []).map((x) => ({ date: x.date, kg: x.kg, source: "manual" as const })),
    ...(b.body ?? []).map((x) => ({ date: x.date, kg: x.weightKg, source: "hevy" as const })),
    ...(b.whoop?.body?.weightKg && b.whoop.syncedAt ? [{ date: b.whoop.syncedAt.slice(0, 10), kg: b.whoop.body.weightKg, source: "whoop" as const }] : []),
  ];
}

function BodyRecovery(props: { d: Derived; b: Bootstrap; nav: Nav; onReload: () => void }) {
  const { d, b } = props;
  const u = d.unit;
  const [w, setW] = useState("");
  const [date, setDate] = useState(d.today);
  const merged = useMemo(() => mergeWeighIns(weighIns(b)), [b]);
  const trend = useMemo(() => bodyweightTrend(merged, { unit: u, today: d.today }), [merged]);
  const rel = useMemo(() => (d.lifts.squat ? strengthVsBodyweight(trend, d.lifts.squat) : []), [trend, d.lifts]);
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const rp = useMemo(() => (b.whoop?.recoveries?.length ? recoveryVsPerformance(asc, d.tz, b.whoop.recoveries, { map: d.liftMap, programLog: d.state?.log, whoopWorkouts: b.whoop.workouts }) : null), [asc, b.whoop]);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!w.trim()) return;
    const v = parseWeightInput(w);
    // 0 removes that day's weigh-in; anything unreadable must not reach the server as one
    if (v == null || v > (u === "lb" ? 1100 : 500)) return setErr(`"${w}" isn't a weight in ${u}`);
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) return setErr("pick a date");
    try { await api.weighIn(date, toKg(v, u)); } catch (e) { return setErr(`Couldn't save: ${(e as Error).message}`); }
    setErr(null); setW(""); props.onReload();
  };
  return (
    <>
      <Panel n="1" title="BODYWEIGHT" span={8} sub={trend.latest ? `trend ${fmt(trend.latest.trend)} ${u}${trend.weeklyRate != null ? ` · ${trend.weeklyRate > 0 ? "+" : ""}${fmt(trend.weeklyRate, 2)} ${u}/wk` : ""}${trend.phase ? ` · ${trend.phase}` : ""}` : "no weigh-ins yet"}>
        {trend.points.length > 1 ? (
          <LineChart unit={u} height={200} series={[
            { key: "raw", label: "scale", color: "var(--faint)", dashed: true, points: trend.points.map((p) => ({ date: p.date, v: p.raw })) },
            { key: "trend", label: "trend", color: "var(--l1)", points: trend.points.map((p) => ({ date: p.date, v: p.trend })) },
          ]} />
        ) : <div class="empty">{merged.length === 1 ? `One weigh-in so far (${fmt(fromKg(merged[0].kg, u))} ${u}, ${shortDate(merged[0].date)}). Log a few more to see a trend.` : "Log your weight to see a smoothed trend and whether you're cutting, maintaining or bulking."}</div>}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <input class="inp" id="wi-date" type="date" style={{ width: "auto" }} value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} />
          <input class="inp num" id="wi-w" inputMode="decimal" placeholder={u} value={w} onInput={(e) => setW((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button class="btn pri" onClick={save}>LOG WEIGHT</button>
          {err && <span class="down" role="alert">{err}</span>}

          <span class="faint" style={{ fontSize: "var(--fs-s)" }}>Also reads Hevy's measurements and WHOOP. Trend: Hacker's Diet moving average.</span>
        </div>
      </Panel>

      <Panel n="2" title="RELATIVE STRENGTH" span={4} sub="squat e1RM ÷ trend bodyweight">
        {rel.length > 1 ? (
          <LineChart height={200} series={[{ key: "r", label: "× BW", color: "var(--amber)", points: rel.map((p) => ({ date: p.date, v: p.ratio })) }]} />
        ) : <div class="empty">Needs weigh-ins within a month of your squat sessions.</div>}
      </Panel>

      <Panel n="3" title="RECOVERY VS PERFORMANCE" span={12} sub="does a low WHOOP recovery predict a worse session?">
        {!rp ? (
          <div class="empty">Connect WHOOP (Setup) and this compares each session's e1RM and AMRAP reps against that morning's recovery, HRV, resting HR and the previous day's strain.</div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            <div class="note">{rp.finding ?? `Not enough matched sessions yet (${rp.sessions.length}; need ${rp.minN}).`}</div>
            <div class="tbl-wrap">
              <table class="t">
                <thead><tr><th>RECOVERY</th><th>SESSIONS</th><th>e1RM vs 28-DAY BEST</th><th>AMRAP vs EXPECTED</th></tr></thead>
                <tbody>
                  {rp.buckets.map((x) => (
                    <tr><td class={x.zone === "red" ? "down" : x.zone === "green" ? "up" : "am"}>{x.zone.toUpperCase()} {x.range}</td><td>{x.n}</td><td>{x.meanE1rmPct != null ? `${fmt(x.meanE1rmPct, 1)}%` : "—"}</td><td>{x.meanAmrapDelta != null ? `${x.meanAmrapDelta > 0 ? "+" : ""}${fmt(x.meanAmrapDelta, 1)} reps` : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="tbl-wrap">
              <table class="t">
                <thead><tr><th>PREDICTOR</th><th>METRIC</th><th>n</th><th>ρ</th><th>95% CI</th><th>p</th></tr></thead>
                <tbody>
                  {rp.correlations.map((c) => (
                    <tr><td>{c.predictor}</td><td class="dim">{c.metric}</td><td>{c.n}</td><td class="hi">{c.spearman != null ? fmt(c.spearman, 2) : "—"}</td><td class="dim">{c.ci95 ? `${fmt(c.ci95[0], 2)} – ${fmt(c.ci95[1], 2)}` : "—"}</td><td class="dim">{c.p != null ? fmt(c.p, 3) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

const TIER_CLS: Record<string, string> = { bronze: "tier-b", silver: "tier-s", gold: "tier-g" };

function Awards(props: { d: Derived; b: Bootstrap }) {
  const { d, b } = props;
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const all = useMemo(() => evaluateAchievements({
    workouts: asc, tz: d.tz, unit: d.unit, today: d.today, map: d.liftMap,
    bodyweight: mergeWeighIns(weighIns(b)),
    programStates: d.state && d.def ? [{ name: d.def.name, state: d.state }] : [],
  }), [asc, b]);
  const unlocked = all.filter((a) => a.unlockedAt);
  const next = all.filter((a) => !a.unlockedAt).sort((a, z) => z.progress - a.progress).slice(0, 8);
  return (
    <>
      <Panel n="1" title="UP NEXT" span={12} sub="closest locked achievements">
        <div class="awards">
          {next.map((a) => (
            <div class={`award locked ${TIER_CLS[a.tier]}`} title={a.description}>
              <div class="award-t">{a.title}</div>
              <div class="award-bar"><i style={{ width: `${Math.round(a.progress * 100)}%` }} /></div>
              <div class="faint">{a.measure ?? `${Math.round(a.progress * 100)}%`}</div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel n="2" title="UNLOCKED" span={12} sub={`${unlocked.length} of ${all.length}`}>
        <div class="awards">
          {unlocked.map((a) => (
            <div class={`award ${TIER_CLS[a.tier]}`} title={a.description}>
              <div class="award-k">{a.tier.toUpperCase()}</div>
              <div class="award-t">{a.title}</div>
              <div class="faint">{shortDate(a.unlockedAt!)}</div>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}

const ZONE_LABEL: Record<string, [string, string]> = {
  belowMV: ["BELOW MV", "down"], maintenance: ["MAINTAIN", "dim"], growth: ["GROWTH", "up"], high: ["HIGH", "am"], aboveMRV: ["ABOVE MRV", "down"], "n/a": ["—", "faint"],
};
const BAND_CLS: Record<string, string> = { low: "faint", optimal: "up", hard: "am", veryHard: "down" };

function Load(props: { d: Derived; b: Bootstrap; nav: Nav }) {
  const { d, b } = props;
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const weeks = useMemo(() => weeklyMuscleSets(asc, d.tz, { liftMap: d.liftMap, windowDays: 56 }), [asc]);
  const trained = weeks.slice(-4).filter((w) => w.sessions > 0);
  const recent = averageWeeks(trained.length ? trained : weeks.slice(-4));
  const prog = useMemo(() => (d.def && b.program && d.state ? programMuscleSets(d.def, b.program, d.state) : null), [d.def, d.state]);
  const lifts = BIG_FOUR.filter((l) => d.lifts[l]?.length);
  const [lift, setLift] = useState<string>(lifts[0] ?? "squat");
  const inol = useMemo(() => sessionInol(asc, lift, d.unit, d.tz, { liftMap: d.liftMap }), [asc, lift]);
  const planned = useMemo(() => (d.def && b.program && d.state ? plannedInol(d.def, b.program, d.state, { lifts: BIG_FOUR as unknown as string[] }) : null), [d.def, d.state]);
  const scale = 26;
  const X = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <>
      <Panel n="1" title="WEEKLY SETS PER MUSCLE" span={12} sub={`last 4 weeks you trained (${trained.length}) vs ${d.def ? d.def.name : "no program"} · bar = your sets, ticks = MEV / MAV / MRV`}>
        <div class="tbl-wrap">
          <table class="t lm">
            <thead><tr><th>MUSCLE</th><th>YOU</th><th>DIRECT</th><th class="l" style={{ width: "40%" }}>VS LANDMARKS (0–{scale})</th><th class="l">STATUS</th>{prog && <th>PROGRAM</th>}{prog && <th class="l">PROGRAM STATUS</th>}</tr></thead>
            <tbody>
              {LANDMARK_GROUPS.map((g) => {
                const lm = LANDMARKS[g];
                const you = recent.groups[g];
                const st = landmarkStatus({ sets: you.sets, direct: you.direct }, g);
                const ps = prog ? landmarkStatus({ sets: prog.groups[g].sets, direct: prog.groups[g].direct }, g) : null;
                const [lbl, cls] = ZONE_LABEL[st.zone];
                return (
                  <tr title={st.note}>
                    <td>{lm.name}</td>
                    <td class="hi">{fmt(you.sets, 1)}</td>
                    <td class="dim">{fmt(you.direct, 1)}</td>
                    <td class="l">
                      <div class="lm-bar">
                        <i class="lm-mav" style={{ left: X(lm.mav[0]), width: `calc(${X(lm.mav[1])} - ${X(lm.mav[0])})` }} />
                        <i class="lm-tick" style={{ left: X(lm.mev) }} />
                        <i class="lm-tick mrv" style={{ left: X(lm.mrv) }} />
                        <i class="lm-you" style={{ width: X(you.sets) }} />
                        {prog && <i class="lm-prog" style={{ left: X(prog.groups[g].sets) }} />}
                      </div>
                    </td>
                    <td class={`l ${cls}`}>{lbl}</td>
                    {ps && <td>{fmt(ps.sets, 1)}</td>}
                    {ps && <td class={`l ${ZONE_LABEL[ps.zone][1]}`}>{ZONE_LABEL[ps.zone][0]}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p class="note">Sets are fractional (a squat counts fully for quads, partly for glutes and adductors); "direct" counts only sets where the muscle is a prime mover, which is what RP's landmarks are written in. Research range: 10–20 fractional sets/week (Schoenfeld 2017, Pelland 2024). Landmarks: Israetel et al. Amber tick = what the program prescribes.</p>
      </Panel>

      <Panel n="2" title="INOL" span={6} sub="reps ÷ (100 − %1RM) per session · 0.4–1 optimal, 1–2 hard"
        act={<div class="seg">{lifts.map((l) => <button class={l === lift ? "on" : ""} onClick={() => setLift(l)}>{LIFTS[l].short}</button>)}</div>}>
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>DATE</th><th>REPS</th><th>AVG %</th><th>INOL</th><th class="l">PRILEPIN</th></tr></thead>
            <tbody>
              {[...inol].reverse().slice(0, 12).map((x) => (
                <tr>
                  <td class="dim">{shortDate(x.date)}</td>
                  <td>{x.reps}</td>
                  <td>{fmt(x.avgPct * 100, 0)}%</td>
                  <td class={BAND_CLS[x.band]}>{fmt(x.inol, 2)}</td>
                  <td class="l dim">{x.zone ? `${x.zone}% · ${x.zoneReps} reps · ${x.verdict}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div class="note">Weekly: {weeklyInol(inol).slice(-6).map((w) => `${fmt(w.inol, 1)}`).join(" · ") || "—"} (2–3 is the usual target per lift per week)</div>
      </Panel>

      <Panel n="3" title="PROGRAM INOL" span={6} sub={d.def ? `${d.def.name} · per day, big four` : "no active program"}>
        {planned ? (
          <div class="tbl-wrap">
            <table class="t">
              <thead><tr><th>DAY</th><th class="l">LIFT</th><th>REPS</th><th>AVG %</th><th>INOL</th><th class="l">PRILEPIN</th></tr></thead>
              <tbody>
                {planned.days.filter((x) => x.week === (d.state ? weekIndexOf(d) : 0)).flatMap((day) => day.lifts.map((l, i) => (
                  <tr>
                    <td class="dim">{i === 0 ? day.dayId : ""}</td>
                    <td class="l">{LIFTS[l.lift]?.short ?? l.lift}</td>
                    <td>{l.reps}</td>
                    <td>{fmt(l.avgPct * 100, 0)}%</td>
                    <td class={BAND_CLS[inolBand(l.inol).band]}>{fmt(l.inol, 2)}</td>
                    <td class="l dim">{l.zone ? `${l.zone}% · ${l.verdict}` : "—"}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        ) : <div class="empty">Pick a program in Setup.</div>}
      </Panel>
    </>
  );
}

function weekIndexOf(d: Derived) {
  const def = d.def!, st = d.state!;
  if (!def.cycle) return 0;
  return def.cycle.finite ? Math.min(st.rotations, def.cycle.weeks - 1) : st.rotations % def.cycle.weeks;
}

function WhatIf(props: { d: Derived; b: Bootstrap; nav: Nav; onReload: () => void }) {
  const { d, b } = props;
  const u = d.unit;
  const current = b.program?.templateId ?? "gzclp";
  const [picked, setPicked] = useState<string[]>([...new Set([current, "nsuns5", "sbsRtf"].filter((x) => getTemplate(x)))].slice(0, 3));
  const [weeks, setWeeks] = useState("12");
  const [add, setAdd] = useState("");
  const e1 = useMemo(() => Object.fromEntries(BIG_FOUR.map((l) => [l, d.e1rmNow(l) ?? 0]).filter(([, v]) => (v as number) > 0)), [d]);
  const bwKg = (b.settings.bodyweight ? toKg(b.settings.bodyweight, u) : b.body?.[b.body.length - 1]?.weightKg) ?? undefined;
  const rows = useMemo(() => compare(picked, e1, u, Number(weeks), { runs: 120, seed: 7, bodyweight: bwKg ? fromKg(bwKg, u) : undefined }), [picked.join(), weeks]);
  const best = Math.max(...rows.map((r) => r.totalGain));
  const switchTo = async (id: string) => {
    const t = getTemplate(id)!;
    const cfg = startingConfig(id, Object.fromEntries(t.options.map((o) => [o.key, o.default])), e1, u, `${d.today}T00:00:00Z`);
    await api.saveProgram({ ...cfg, liftMap: b.program?.liftMap });
    props.onReload();
    props.nav({ view: "prog" });
  };
  return (
    <>
      <Panel n="1" title="WHAT IF YOU RAN…" span={12} sub={`from your current e1RMs: ${BIG_FOUR.filter((l) => e1[l]).map((l) => `${LIFTS[l].short} ${fmt(e1[l], 0)}`).join(" · ")} ${u}`}
        act={<Seg value={weeks} onChange={setWeeks} options={[["8", "8 WK"], ["12", "12 WK"], ["16", "16 WK"]]} />}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
          {picked.map((id) => <button class="btn" onClick={() => setPicked(picked.filter((x) => x !== id))}>{getTemplate(id)?.name} ×</button>)}
          {picked.length < 4 && (
            <Picker id="whatif-add" label="Add a program" value={add} display="+ add a program" options={programOptions(picked)}
              onChange={(v) => { if (v) setPicked([...picked, v]); setAdd(""); }} />
          )}
        </div>
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>PROGRAM</th>{BIG_FOUR.map((l) => <th>{LIFTS[l].short}</th>)}<th>TOTAL GAIN</th><th>STALLS</th><th>RESETS</th><th>/WK</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr class={r.templateId === current ? "sel" : ""}>
                  <td class={r.totalGain === best ? "am" : ""}>{r.name}{r.templateId === current ? " (current)" : ""}{r.completedWeek ? <span class="faint"> · ends wk {r.completedWeek}</span> : ""}</td>
                  {BIG_FOUR.map((l) => {
                    const x = r.lifts[l];
                    return <td title={`10–90%: ${fmt(x.end.p10, 0)}–${fmt(x.end.p90, 0)}`}><span class="hi">{fmt(x.end.p50, 0)}</span> <span class="up" style={{ fontSize: "10px" }}>+{fmt(x.gain.p50, 0)}</span></td>;
                  })}
                  <td class={r.totalGain === best ? "am" : "hi"}>+{fmt(r.totalGain, 0)}</td>
                  <td class="dim">{fmt(BIG_FOUR.reduce((a, l) => a + r.lifts[l].stalls, 0), 1)}</td>
                  <td class="dim">{fmt(BIG_FOUR.reduce((a, l) => a + r.lifts[l].resets, 0), 1)}</td>
                  <td class="dim">{r.sessionsPerWeek}</td>
                  <td>{r.templateId !== current && <button class="btn" onClick={() => switchTo(r.templateId)}>SWITCH</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="note">Each program is run {weeks} weeks × 120 times by the real engine against a model lifter (diminishing returns by strength level, more weekly volume and heavy sets = faster gains, random good and bad days). Medians shown; hover for the 10–90% range. It's conservative for you: you've been stronger before (squat ~280, bench ~228), and regained strength comes back faster than the model assumes. SWITCH sets up that program starting from your current maxes.</p>
      </Panel>
    </>
  );
}
