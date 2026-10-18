import { useState } from "preact/hooks";
import { LIFTS } from "../../shared/lifts";
import { addDays, calisthenics, repPRs } from "../../shared/stats";
import { fmt, fmtBig, fmtInt } from "../../shared/units";
import { Bars, LineChart } from "../charts";
import { e1rmAt, rollingBest, type Derived } from "../derive";
import type { Nav } from "../app";
import { Delta, Panel, RpeTable, Seg, shortDate, StallChip } from "../ui";

export function Lifts(props: { d: Derived; lift?: string; nav: Nav }) {
  const { d, nav } = props;
  const lift = props.lift && Object.hasOwn(d.lifts, props.lift) ? props.lift : d.liftKeys[0];
  const [range, setRange] = useState<"1y" | "3y" | "all">("1y");
  if (!lift) return <div class="grid"><Panel title="LIFTS"><div class="empty">No lifts found yet.</div></Panel></div>;
  const pts = d.lifts[lift];
  const u = d.unit;
  const from = range === "1y" ? addDays(d.today, -365) : range === "3y" ? addDays(d.today, -365 * 3) : undefined;
  const now = pts[pts.length - 1];
  const best = pts.reduce((a, p) => (p.e1rm > a.e1rm ? p : a), pts[0]);
  const prs = repPRs(pts);
  const yearAgo = e1rmAt(pts, addDays(d.today, -365));
  const vis = pts.filter((p) => !from || p.date >= from);
  const bw = LIFTS[lift]?.kind === "bodyweight";
  const lifts = (
    <section class="pn span-12" style={{ flexDirection: "row", flexWrap: "wrap", gap: "4px", padding: "8px 12px" }}>
      {d.liftKeys.map((l) => (
        <button class={`btn ${l === lift ? "pri" : ""}`} onClick={() => nav({ view: "lifts", lift: l })}>{LIFTS[l]?.short ?? l}</button>
      ))}
    </section>
  );
  if (bw) return <BodyweightLift d={d} lift={lift} lifts={lifts} nav={nav} range={range} setRange={setRange} from={from} />;

  return (
    <div class="grid">
      {lifts}

      <div class="kpis">
        <div class="kpi"><label>e1RM · LAST</label><div class="v">{fmt(now.e1rm, 0)}<small>{u}</small></div><div class="d">{shortDate(now.date)}</div></div>
        <div class="kpi"><label>e1RM · BEST</label><div class="v">{fmt(best.e1rm, 0)}<small>{u}</small></div><div class="d">{shortDate(best.date)}</div></div>
        <div class="kpi"><label>vs 1 YEAR AGO</label><div class="v"><Delta v={yearAgo ? now.e1rm - yearAgo : null} digits={0} /></div><div class="d">{yearAgo ? `from ${fmt(yearAgo, 0)}` : "no data a year ago"}</div></div>
        <div class="kpi"><label>HEAVIEST SET</label><div class="v">{fmt(Math.max(...pts.map((p) => p.topWeight)))}<small>{u}</small></div><div class="d">any reps</div></div>
        <div class="kpi"><label>TREND</label><div class="v"><StallChip s={d.stalls[lift]} /></div><div class="d" title={d.stalls[lift]?.reason}>{d.stalls[lift]?.slope != null ? `${d.stalls[lift]!.slope! > 0 ? "+" : ""}${fmt(d.stalls[lift]!.slope!)} ${u}/wk` : d.stalls[lift]?.reason ?? "—"}</div></div>
        <div class="kpi"><label>VOLUME · 1Y</label><div class="v">{fmtBig(pts.filter((p) => p.date >= addDays(d.today, -365)).reduce((a, p) => a + p.volume, 0))}</div><div class="d">{u} × reps</div></div>
      </div>

      <Panel
        n="1" title={`${LIFTS[lift]?.name ?? lift} · e1RM`} span={8} sub={`per session (dashed) and 28-day best · ${u}`}
        act={<Seg value={range} onChange={setRange} options={[["1y", "1Y"], ["3y", "3Y"], ["all", "ALL"]]} />}
      >
        <LineChart
          unit={u}
          from={from}
          to={d.today}
          height={260}
          series={[
            { key: "raw", label: "session", color: "var(--l2)", dashed: true, points: pts.map((p) => ({ date: p.date, v: p.e1rm })) },
            { key: "best", label: "28d best", color: "var(--l1)", area: true, points: rollingBest(pts) },
            { key: "top", label: "top set", color: "var(--amber)", dashed: true, points: pts.map((p) => ({ date: p.date, v: p.topWeight })) },
          ]}
        />
        <div class="keyrow">
          <span><i style={{ background: "var(--l1)", display: "inline-block", width: "10px", height: "2px", marginRight: "6px", verticalAlign: "middle" }} />28d best e1RM</span>
          <span><i style={{ background: "var(--l2)", display: "inline-block", width: "10px", height: "2px", marginRight: "6px", verticalAlign: "middle" }} />session e1RM</span>
          <span><i style={{ background: "var(--amber)", display: "inline-block", width: "10px", height: "2px", marginRight: "6px", verticalAlign: "middle" }} />top set weight</span>
        </div>
      </Panel>

      <Panel n="2" title="REP PRs" span={4} sub="heaviest weight for at least N reps">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>REPS</th><th>WEIGHT</th><th>e1RM</th><th>DATE</th></tr></thead>
            <tbody>
              {prs.map((p) => (
                <tr>
                  <td>{p.reps}</td>
                  <td class="hi">{fmt(p.weight)}</td>
                  <td class="dim">{fmt(p.weight * (p.reps === 1 ? 1 : 1 + p.reps / 30), 0)}</td>
                  <td class={p.date >= addDays(d.today, -60) ? "am" : "dim"}>{shortDate(p.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel n="R" title="YOUR RPE CHART" span={12} sub={`% of 1RM by reps × RPE · hover for loads at your e1RM ${fmt(d.e1rmNow(lift) ?? 0, 0)} ${u}`}>
        <RpeTable chart={d.rpe(lift)} e1rm={d.e1rmNow(lift)} unit={u} />
      </Panel>

      <Panel n="3" title="VOLUME PER SESSION" span={12} sub={u}>
        <Bars height={100} items={vis.slice(-80).map((p) => ({ key: p.date.slice(2, 7), v: p.volume, label: `${shortDate(p.date)}\n${fmtInt(p.volume)} ${u} · ${p.sets.length} sets` }))} />
      </Panel>

      <Panel n="4" title="SESSIONS" span={12} sub="newest first">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>DATE</th><th class="l">SETS</th><th>TOP</th><th>e1RM</th><th>VOLUME</th></tr></thead>
            <tbody>
              {[...pts].reverse().slice(0, 50).map((p) => (
                <tr class="click" onClick={() => nav({ view: "hist", workout: p.workoutId })}>
                  <td class="dim">{shortDate(p.date)}</td>
                  <td class="l">{p.sets.map((s) => `${fmt(s.weight)}×${s.reps}`).join("  ")}</td>
                  <td class="hi">{fmt(p.topWeight)}</td>
                  <td class={p.e1rm >= best.e1rm - 0.01 ? "am" : ""}>{fmt(p.e1rm, 0)}</td>
                  <td class="dim">{fmtInt(p.volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/** Calisthenics view: reps are the headline, added load is secondary. */
function BodyweightLift(props: { d: Derived; lift: string; lifts: preact.JSX.Element; nav: Nav; range: "1y" | "3y" | "all"; setRange: (r: "1y" | "3y" | "all") => void; from?: string }) {
  const { d, lift, nav } = props;
  const pts = d.lifts[lift];
  const u = d.unit;
  const c = calisthenics(pts, d.today);
  const vis = c.sessions.filter((x) => !props.from || x.date >= props.from);
  const prev = c.sessions.filter((x) => x.date < addDays(d.today, -365));
  const bestYearAgo = prev.length ? Math.max(...prev.map((x) => x.best)) : null;
  const last = c.sessions[c.sessions.length - 1];
  const weighted = pts.some((p) => p.sets.some((x) => x.weight > 0));
  return (
    <div class="grid">
      {props.lifts}
      <div class="kpis">
        <div class="kpi"><label>MAX REPS · BW</label><div class="v">{c.maxRepsBw?.reps ?? "—"}</div><div class="d">{c.maxRepsBw ? shortDate(c.maxRepsBw.date) : "no bodyweight sets"}</div></div>
        <div class="kpi"><label>LAST SESSION BEST</label><div class="v">{last.best}<small>reps</small></div><div class="d">{shortDate(last.date)} · {last.total} total</div></div>
        <div class="kpi"><label>vs BEST BEFORE 1Y</label><div class="v"><Delta v={bestYearAgo != null && c.maxReps ? c.maxReps.reps - bestYearAgo : null} digits={0} /></div><div class="d">{bestYearAgo != null ? `was ${bestYearAgo}` : "no older data"}</div></div>
        <div class="kpi"><label>HEAVIEST ADDED</label><div class="v">{c.heaviestAdded ? `+${fmt(c.heaviestAdded.weight)}` : "—"}<small>{c.heaviestAdded ? u : ""}</small></div><div class="d">{c.heaviestAdded ? `× ${c.heaviestAdded.reps} · ${shortDate(c.heaviestAdded.date)}` : "bodyweight only"}</div></div>
        <div class="kpi"><label>REPS · 1Y</label><div class="v">{fmtInt(c.totalReps365)}</div><div class="d">avg {fmt(c.avgRepsPerSet)} / set</div></div>
        <div class="kpi"><label>SESSIONS</label><div class="v">{pts.length}</div><div class="d">since {shortDate(pts[0].date)}</div></div>
      </div>

      <Panel n="1" title={`${LIFTS[lift]?.name ?? lift} · REPS`} span={8} sub="best set and total reps per session" act={<Seg value={props.range} onChange={props.setRange} options={[["1y", "1Y"], ["3y", "3Y"], ["all", "ALL"]]} />}>
        <LineChart
          from={props.from}
          to={d.today}
          height={240}
          unit="reps"
          series={[
            { key: "best", label: "best set", color: "var(--l1)", area: true, points: c.sessions.map((x) => ({ date: x.date, v: x.best })) },
            { key: "total", label: "total", color: "var(--amber)", dashed: true, points: c.sessions.map((x) => ({ date: x.date, v: x.total })) },
          ]}
        />
        <div class="keyrow">
          <span><i style={{ background: "var(--l1)", display: "inline-block", width: "10px", height: "2px", marginRight: "6px", verticalAlign: "middle" }} />best set</span>
          <span><i style={{ background: "var(--amber)", display: "inline-block", width: "10px", height: "2px", marginRight: "6px", verticalAlign: "middle" }} />total reps</span>
        </div>
      </Panel>

      <Panel n="2" title="REPS BY LOAD" span={4} sub={weighted ? "best set at each added weight" : "bodyweight PR"}>
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>LOAD</th><th>REPS</th><th>DATE</th></tr></thead>
            <tbody>
              {c.byLoad.map((x) => (
                <tr>
                  <td>{x.load > 0 ? `+${fmt(x.load)} ${u}` : "BW"}</td>
                  <td class="hi">{x.reps}</td>
                  <td class={x.date >= addDays(d.today, -60) ? "am" : "dim"}>{shortDate(x.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p class="note">Each row is the most reps you've done at that added load or more. Assisted variants aren't counted.</p>
      </Panel>

      <Panel n="3" title="REPS PER SESSION" span={12}>
        <Bars height={100} unit="reps" items={vis.slice(-80).map((x) => ({ key: x.date.slice(2, 7), v: x.total, label: `${shortDate(x.date)}\n${x.total} reps · best set ${x.best}${x.added ? ` · +${fmt(x.added)} ${u}` : ""}` }))} />
      </Panel>

      <Panel n="4" title="SESSIONS" span={12} sub="newest first">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>DATE</th><th class="l">SETS</th><th>BEST</th><th>TOTAL</th></tr></thead>
            <tbody>
              {[...pts].reverse().slice(0, 50).map((p) => (
                <tr class="click" onClick={() => nav({ view: "hist", workout: p.workoutId })}>
                  <td class="dim">{shortDate(p.date)}</td>
                  <td class="l">{p.sets.map((s) => (s.weight > 0 ? `+${fmt(s.weight)}×${s.reps}` : `${s.reps}`)).join("  ")}</td>
                  <td class={c.maxReps && Math.max(...p.sets.map((s) => s.reps)) >= c.maxReps.reps ? "am" : "hi"}>{Math.max(...p.sets.map((s) => s.reps))}</td>
                  <td class="dim">{p.sets.reduce((a, s) => a + s.reps, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
