import { useState } from "preact/hooks";
import { BIG_FOUR, LIFTS } from "../../shared/lifts";
import { addDays, type GraphMetric } from "../../shared/stats";
import { fmt, fmtInt } from "../../shared/units";
import { Bars, Heatmap, Legend, LineChart, Spark } from "../charts";
import { bestAt, rollingBest, type Derived } from "../derive";
import type { Nav } from "../app";
import { Delta, Panel, ReentryNote, Seg, SessionTicket, shortDate, Watch } from "../ui";

const COLORS: Record<string, string> = { squat: "#8cb4ff", bench: "#ffb000", deadlift: "#e8e8e8", ohp: "#5082dc" };

export function Dash(props: { d: Derived; metric: GraphMetric; setMetric: (m: GraphMetric) => void; nav: Nav; onPush?: () => void }) {
  const { d, nav } = props;
  const u = d.unit;
  const [range, setRange] = useState<"26w" | "1y" | "all">("1y");
  const from = range === "26w" ? addDays(d.today, -182) : range === "1y" ? addDays(d.today, -365) : undefined;
  const big = BIG_FOUR.filter((l) => d.lifts[l]?.length);
  const weeks = d.weekly.slice(-26);
  const lastWeekKey = weeks[weeks.length - 1]?.week;
  const e1 = (l: string) => d.e1rmNow(l) ?? 0;
  // bodyweight lifts logged without added load have no e1RM to show
  const e1Lifts = d.liftKeys.filter((l) => e1(l) > 0);
  const metricLabel = props.metric === "volume" ? `${u} lifted` : props.metric === "sets" ? "sets" : "min";

  return (
    <div class="grid">
      <div class="kpis">
        <div class="kpi">
          <label>SESSIONS · 52W</label>
          <div class="v">{d.sessions52}</div>
          <div class="d"><Delta v={d.sessions52 - d.sessionsPrev52} digits={0} /> vs prior yr</div>
        </div>
        <div class="kpi">
          <label>THIS WEEK</label>
          <div class="v">{d.thisWeek}<small>/ {d.def?.sessionsPerWeek ?? 4}</small></div>
          <div class="d">{d.avgMin ? `avg ${Math.round(d.avgMin)} min` : "—"}</div>
        </div>
        <div class="kpi">
          <label>WEEK STREAK</label>
          <div class="v">{d.streak.current}<small>wk</small></div>
          <div class="d">best {d.streak.best}wk</div>
        </div>
        <div class="kpi">
          <label>VOLUME · 7D</label>
          <div class="v">{d.vol7 >= 10000 ? fmt(d.vol7 / 1000) + "k" : fmtInt(d.vol7)}<small>{u}</small></div>
          <div class="d"><Delta v={d.volPrev7 ? ((d.vol7 - d.volPrev7) / d.volPrev7) * 100 : null} pct digits={0} /> wk/wk</div>
        </div>
        {big.slice(0, 2).map((l) => {
          const pts = d.lifts[l];
          const now = e1(l)!;
          const was = bestAt(pts, addDays(d.today, -84));
          return (
            <div class="kpi" onClick={() => nav({ view: "lifts", lift: l })} style={{ cursor: "pointer" }}>
              <label>{LIFTS[l].short} e1RM</label>
              <div class="v">{fmt(now, 0)}<small>{u}</small></div>
              <div class="d"><Delta v={was ? now - was : null} digits={0} /> 12w</div>
              <Spark values={rollingBest(pts.filter((p) => p.date >= addDays(d.today, -365))).map((p) => p.v)} height={18} color={COLORS[l]} />
            </div>
          );
        })}
      </div>

      <Panel
        n="1" title="ACTIVITY" span={8}
        sub={`${d.cells.size} training days all-time · ${fmtInt(d.workouts.length)} workouts`}
        act={<Seg value={props.metric} onChange={props.setMetric} options={[["volume", "VOL"], ["sets", "SETS"], ["duration", "TIME"]]} />}
      >
        <Heatmap
          cells={d.cells}
          today={d.today}
          label={(c, date) => (c ? `${shortDate(date)}\n${c.workouts.length} workout${c.workouts.length > 1 ? "s" : ""} · ${fmtInt(props.metric === "volume" ? c.value * (u === "lb" ? 2.2046 : 1) : c.value)} ${metricLabel}` : `${shortDate(date)}\nrest`)}
          onPick={(date, c) => c && nav({ view: "hist", date })}
        />
        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
          <span class="faint" style={{ fontSize: "var(--fs-s)" }}>click a day to open it · amber = today</span>
          <Legend />
        </div>
      </Panel>

      <Panel
        n="2" title={d.next ? `NEXT · ${d.next.dayId}` : "NEXT SESSION"} span={4}
        sub={d.next ? `${d.def?.name}${d.next.weekName ? " · " + d.next.weekName : ""}` : undefined}
        act={d.next && <button class="btn" onClick={() => nav({ view: "prog" })}><em>F2</em>PROGRAM</button>}
      >
        {d.reentry && <ReentryNote info={d.reentry} onOpen={(id) => nav({ view: "set", tab: "programs", id })} />}
        {d.next ? <SessionTicket s={d.next} unit={u} /> : (
          <div class="empty">No active program. <button class="btn pri" onClick={() => nav({ view: "set" })}>SET UP GZCLP</button></div>
        )}
      </Panel>

      <Panel n="3" title="e1RM" span={4} sub="Epley · best of the last 28 days">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>LIFT</th><th>NOW</th><th>4W</th><th>12W</th><th>BEST</th></tr></thead>
            <tbody>
              {e1Lifts.slice(0, 8).map((l) => {
                const pts = d.lifts[l];
                const now = e1(l);
                const best = Math.max(...pts.map((p) => p.e1rm));
                const a4 = bestAt(pts, addDays(d.today, -28)), a12 = bestAt(pts, addDays(d.today, -84));

                return (
                  <tr class="click" onClick={() => nav({ view: "lifts", lift: l })}>
                    <td>{LIFTS[l]?.short ?? l}</td>
                    <td class="hi">{fmt(now, 0)}</td>
                    <td><Delta v={a4 ? now - a4 : null} digits={0} /></td>
                    <td><Delta v={a12 ? now - a12 : null} digits={0} /></td>
                    <td class={now >= best ? "am" : "dim"}>{fmt(best, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        n="4" title="STRENGTH TREND" span={5} sub={`28-day best e1RM · ${u}`}
        act={<Seg value={range} onChange={setRange} options={[["26w", "6M"], ["1y", "1Y"], ["all", "ALL"]]} />}
      >
        <LineChart
          unit={u}
          from={from}
          to={d.today}
          height={190}
          series={big.map((l) => ({ key: l, label: LIFTS[l].short, color: COLORS[l], points: rollingBest(d.lifts[l]) }))}
        />
        <div class="keyrow">{big.map((l) => <span><i style={{ background: COLORS[l], width: "10px", height: "2px", display: "inline-block", marginRight: "6px", verticalAlign: "middle" }} />{LIFTS[l].short}</span>)}</div>
      </Panel>

      <Panel n="5" title="WATCH" span={3} sub="plateaus and program flags">
        <Watch d={d} nav={nav} />
      </Panel>

      <Panel n="6" title="WEEKLY VOLUME" span={6} sub={`last 26 weeks · ${u}`}>
        <Bars items={weeks.map((w) => ({ key: w.week.slice(5), v: w.volume, cur: w.week === lastWeekKey, label: `week of ${shortDate(w.week)}\n${fmtInt(w.volume)} ${u} · ${w.sessions} sessions · ${w.sets} sets` }))} />
      </Panel>

      <Panel n="7" title="RECENT" span={6} act={<button class="btn" onClick={() => nav({ view: "hist" })}><em>F4</em>HISTORY</button>}>
        <div class="wl">
          {d.workouts.slice(0, 6).map((w) => (
            <button onClick={() => nav({ view: "hist", workout: w.id })}>
              <span class="dim">{shortDate(w.start_time.slice(0, 10))}</span>
              <span style={{ minWidth: 0 }}>
                <div class="t1">{w.title}</div>
                <div class="ex-l">{w.exercises.map((e) => e.title.replace(/ \(.*\)/, "")).join(" · ")}</div>
              </span>
              <span class="dim">{Math.round((Date.parse(w.end_time) - Date.parse(w.start_time)) / 60000)}m</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
