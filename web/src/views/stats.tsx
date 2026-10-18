// STATS: year in review, cardio, and strength standards.

import { useMemo, useState } from "preact/hooks";
import { cardioStats, formatDuration, formatPace, type DistUnit, type HrSession } from "../../shared/cardio";
import { LIFTS } from "../../shared/lifts";
import { yearInReview } from "../../shared/review";
import { STANDARD_LIFTS, strengthProfile, TIERS, type Sex } from "../../shared/standards";
import { fmt, fmtBig, fmtInt, fromKg, toKg } from "../../shared/units";
import { workoutYears } from "../../shared/stats";
import { Bars } from "../charts";
import type { Bootstrap } from "../api";
import type { Derived } from "../derive";
import { Delta, Panel, Seg, shortDate } from "../ui";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Bodyweight in kg: your setting, else the newest of Hevy's body log and WHOOP. */
export function bodyweightKg(b: Bootstrap): { kg: number; source: string; date?: string } | null {
  if (b.settings.bodyweight) return { kg: toKg(b.settings.bodyweight, b.settings.unit), source: "setting" };
  const hevy = [...(b.body ?? [])].sort((x, y) => y.date.localeCompare(x.date))[0];
  const whoop = b.whoop?.body?.weightKg;
  if (whoop) return { kg: whoop, source: "WHOOP" };
  if (hevy) return { kg: hevy.weightKg, source: "Hevy", date: hevy.date };
  return null;
}

export function Stats(props: { b: Bootstrap; d: Derived; onSettings: (patch: Partial<Bootstrap["settings"]>) => void }) {
  const { b, d } = props;
  const u = d.unit;
  const dist: DistUnit = b.settings.distUnit ?? (u === "lb" ? "mi" : "km");
  const years = useMemo(() => workoutYears(d.workouts, d.tz).map((y) => Number(y.year)), [d.workouts]);
  const [year, setYear] = useState(years[0] ?? Number(d.today.slice(0, 4)));
  const hr: HrSession[] = (b.whoop?.workouts ?? []).map((w) => ({ start: w.start, end: w.end, avgHr: w.avgHr, maxHr: w.maxHr, zones: w.zones, strain: w.strain, kj: w.kj }));
  const asc = useMemo(() => [...d.workouts].reverse(), [d.workouts]);
  const r = useMemo(() => yearInReview(asc, year, d.tz, u, { map: d.liftMap, distUnit: dist, hr, maxHr: b.whoop?.body?.maxHr }), [asc, year, dist]);
  const cardio = useMemo(() => cardioStats(asc, d.tz, dist, { hr, maxHr: b.whoop?.body?.maxHr }), [asc, dist]);
  const bw = bodyweightKg(b);
  const sex = b.settings.sex as Sex | undefined;
  const profile = useMemo(() => (bw && sex ? strengthProfile(asc, bw.kg, sex, { tz: d.tz, map: d.liftMap, since: `${Number(d.today.slice(0, 4)) - 1}${d.today.slice(4)}` }) : null), [asc, bw?.kg, sex]);
  const t = r.totals;

  return (
    <div class="grid">
      <section class="pn span-12" style={{ flexDirection: "row", flexWrap: "wrap", gap: "4px", padding: "8px 12px", alignItems: "center" }}>
        <span class="am" style={{ marginRight: "8px" }}>YEAR IN REVIEW</span>
        {years.map((y) => <button class={`btn ${y === year ? "pri" : ""}`} onClick={() => setYear(y)}>{y}</button>)}
      </section>

      <div class="kpis">
        <div class="kpi"><label>SESSIONS</label><div class="v">{t.sessions}</div><div class="d"><Delta v={r.deltas.sessions.diff} digits={0} /> vs {year - 1}</div></div>
        <div class="kpi"><label>TONNAGE</label><div class="v">{fmtBig(t.tonnage)}<small>{u}</small></div><div class="d"><Delta v={r.deltas.tonnage.pct != null ? r.deltas.tonnage.pct * 100 : null} pct digits={0} /></div></div>
        <div class="kpi"><label>HOURS</label><div class="v">{fmt(t.hours, 0)}</div><div class="d">{fmtInt(t.sets)} sets · {fmtInt(t.reps)} reps</div></div>
        <div class="kpi"><label>BEST MONTH</label><div class="v" style={{ fontSize: "18px" }}>{r.bestMonth ? MONTHS[Number(r.bestMonth.month.slice(5)) - 1] : "—"}</div><div class="d">{r.bestMonth ? `${r.bestMonth.sessions} sessions · ${fmtBig(r.bestMonth.tonnage)}` : ""}</div></div>
        <div class="kpi"><label>LONGEST STREAK</label><div class="v">{r.streaks.weeks?.length ?? 0}<small>wk</small></div><div class="d">{r.streaks.days ? `${r.streaks.days.length} days in a row` : "—"}</div></div>
        <div class="kpi"><label>CARDIO</label><div class="v">{fmt(t.cardioMinutes / 60)}<small>h</small></div><div class="d">{fmt(t.cardioDistance)} {dist}</div></div>
      </div>

      <Panel n="1" title={`${year} BY MONTH`} span={7} sub={`tonnage · ${u}`}>
        <Bars height={140} items={r.months.map((m) => ({ key: MONTHS[Number(m.month.slice(5)) - 1], v: m.tonnage, cur: m.month === r.bestMonth?.month, label: `${m.month}\n${fmtInt(m.tonnage)} ${u} · ${m.sessions} sessions · ${fmt(m.hours)} h` }))} />
        <div class="note">
          {r.first && r.last ? `First ${shortDate(r.first.date)} · last ${shortDate(r.last.date)} · ` : ""}
          you trained most on {r.favoriteDay?.day ?? "—"}s, usually in the {r.favoriteTime?.time ?? "—"}.
        </div>
      </Panel>

      <Panel n="2" title="PRs THIS YEAR" span={5} sub="new all-time e1RMs">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>LIFT</th><th>e1RM</th><th>FROM</th><th>SET</th><th>DATE</th></tr></thead>
            <tbody>
              {r.prs.filter((p) => p.e1rm).sort((a, z) => z.e1rm!.value - a.e1rm!.value).slice(0, 10).map((p) => (
                <tr>
                  <td>{LIFTS[p.key]?.short ?? p.name}</td>
                  <td class="am">{fmt(p.e1rm!.value, 0)}</td>
                  <td class="dim">{p.e1rm!.previous ? fmt(p.e1rm!.previous, 0) : "new"}</td>
                  <td class="dim">{fmt(p.e1rm!.weight)}×{p.e1rm!.reps}</td>
                  <td class="dim">{shortDate(p.e1rm!.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r.prs.some((p) => p.e1rm) && <div class="empty">No new all-time e1RMs this year.</div>}
        </div>
      </Panel>

      <Panel n="3" title="MOST TRAINED" span={6} sub="working sets">
        <div class="tbl-wrap">
          <table class="t">
            <thead><tr><th>LIFT</th><th>SETS</th><th>SESSIONS</th><th>TONNAGE</th></tr></thead>
            <tbody>{r.topLifts.slice(0, 8).map((l) => <tr><td>{LIFTS[l.key]?.short ?? l.name}</td><td class="hi">{l.sets}</td><td class="dim">{l.sessions}</td><td class="dim">{fmtBig(l.tonnage)}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>

      <Panel n="4" title="MUSCLES" span={6} sub="working sets by primary muscle">
        <Bars height={120} items={r.muscles.slice(0, 12).map((m) => ({ key: m.muscle.slice(0, 5).toUpperCase(), v: m.sets, label: `${m.muscle}\n${m.sets} sets` }))} />
      </Panel>

      <Panel n="5" title="CARDIO" span={12} sub={`all time · ${cardio.totals.sessions} sessions · ${fmt(cardio.totals.minutes / 60)} h · ${fmt(cardio.totals.distance)} ${dist}${cardio.totals.zone2Min != null ? ` · ${fmtInt(cardio.totals.zone2Min)} min zone 2` : ""}`} act={<Seg value={dist} onChange={(v) => props.onSettings({ distUnit: v })} options={[["mi", "MI"], ["km", "KM"]]} />}>
        {cardio.activities.length ? (
          <div class="tbl-wrap">
            <table class="t">
              <thead><tr><th>ACTIVITY</th><th>SESSIONS</th><th>TIME</th><th>DIST</th><th>AVG PACE</th><th>SPEED</th><th>LONGEST</th><th>FASTEST</th><th>LAST</th></tr></thead>
              <tbody>
                {cardio.activities.map((a) => {
                  const fast = a.fastest.find((f) => f.effort)?.effort;
                  return (
                    <tr>
                      <td>{a.activity}</td>
                      <td>{a.sessions}{a.timeOnlySessions ? <span class="faint"> ({a.timeOnlySessions} time-only)</span> : ""}</td>
                      <td class="hi">{formatDuration(a.totalSeconds)}</td>
                      <td>{a.totalDistance ? fmt(a.totalDistance) : "—"}</td>
                      <td>{formatPace(a.avgPace, dist)}</td>
                      <td class="dim">{a.avgSpeed ? `${fmt(a.avgSpeed)} ${dist}/h` : "—"}</td>
                      <td class="dim">{a.longest ? formatDuration(a.longest.seconds) : "—"}</td>
                      <td class="am">{fast ? `${fmt(fast.distance)} ${dist} @ ${formatPace(fast.pace, dist)}` : "—"}</td>
                      <td class="dim">{shortDate(a.last)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div class="empty">No cardio logged yet. In GYM mode, + ADD EXERCISE › CARDIO logs time and distance.</div>}
        <div class="pt"><h3 style={{ fontSize: "var(--fs-s)" }}>CARDIO VS LIFTING · minutes per week (last 26)</h3></div>
        <Bars height={100} items={cardio.weekly.slice(-26).map((w) => ({ key: w.week.slice(5), v: w.cardioMin, label: `week of ${shortDate(w.week)}\ncardio ${fmtInt(w.cardioMin)} min · lifting ${fmtInt(w.liftingMin)} min${w.zone2Min != null ? ` · zone 2 ${fmtInt(w.zone2Min)} min` : ""}` }))} />
        {!b.whoop?.connected && <p class="note">Connect WHOOP in Setup to add heart rate, zone-2 minutes and strain to each session.</p>}
      </Panel>

      <Panel n="6" title="STRENGTH STANDARDS" span={12} sub={bw ? `bodyweight ${fmt(fromKg(bw.kg, u))} ${u} (${bw.source}${bw.date ? " " + shortDate(bw.date) : ""}) · best e1RMs, last 12 months` : "needs bodyweight"}
        act={<>
          <Seg value={sex ?? ""} onChange={(v) => props.onSettings({ sex: v as Sex })} options={[["male", "M"], ["female", "F"]]} />
        </>}>
        {!bw || !sex ? (
          <div class="note">
            {!sex && <div>Pick M or F above (the scoring formulas differ).</div>}
            {!bw && <div>No bodyweight yet: set it below, log it in Hevy's measurements, or connect WHOOP.</div>}
          </div>
        ) : profile && (
          <div style={{ display: "grid", gap: "10px" }}>
            <div class="tbl-wrap">
              <table class="t">
                <thead><tr><th>LIFT</th><th>e1RM</th><th>× BW</th><th class="l">TIER</th><th class="l">PROGRESS TO NEXT</th><th>NEXT AT</th></tr></thead>
                <tbody>
                  {STANDARD_LIFTS.map((l) => {
                    const s = profile.lifts[l];
                    const tr = s.tier;
                    return (
                      <tr>
                        <td>{LIFTS[l].short}</td>
                        <td class="hi">{s.e1rmKg ? fmt(fromKg(s.e1rmKg, u), 0) : "—"}</td>
                        <td>{tr ? fmt(tr.ratio, 2) : "—"}</td>
                        <td class="l am">{tr?.tier ?? (s.e1rmKg ? "below Beginner" : "—")}</td>
                        <td class="l">
                          {tr && <div class="tierbar">{TIERS.map((x, i) => <i class={TIERS.indexOf(tr.tier ?? "Beginner") > i || (tr.tier === x) ? "on" : ""} />)}<span class="dim">{tr.next ? `${Math.round(tr.progress * 100)}% → ${tr.next}` : "top tier"}</span></div>}
                        </td>
                        <td class="dim">{tr?.nextKg ? `${fmt(fromKg(tr.nextKg, u), 0)} ${u}` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div class="kpis" style={{ gridColumn: "auto" }}>
              <div class="kpi"><label>SBD TOTAL</label><div class="v">{profile.totalKg ? fmt(fromKg(profile.totalKg, u), 0) : "—"}<small>{u}</small></div><div class="d">best e1RMs</div></div>
              <div class="kpi"><label>DOTS</label><div class="v">{profile.dots ? fmt(profile.dots, 1) : "—"}</div><div class="d">BVDK / OPL</div></div>
              <div class="kpi"><label>IPF GL</label><div class="v">{profile.ipfGl ? fmt(profile.ipfGl, 1) : "—"}</div><div class="d">classic total</div></div>
              <div class="kpi"><label>WILKS</label><div class="v">{profile.wilks ? fmt(profile.wilks, 1) : "—"}</div><div class="d">1995</div></div>
              <div class="kpi"><label>WILKS 2020</label><div class="v">{profile.wilks2020 ? fmt(profile.wilks2020, 1) : "—"}</div><div class="d">IPF 2020</div></div>
              <div class="kpi"><label>BENCH GL</label><div class="v">{profile.ipfGlBench ? fmt(profile.ipfGlBench, 1) : "—"}</div><div class="d">classic bench</div></div>
            </div>
          </div>
        )}
        <div class="field" style={{ maxWidth: "260px" }}>
          <label for="bw">BODYWEIGHT OVERRIDE ({u})</label>
          <input class="inp num" id="bw" inputMode="decimal" style={{ maxWidth: "none" }} placeholder={bw ? fmt(fromKg(bw.kg, u)) : u} value={b.settings.bodyweight ?? ""} onChange={(e) => { const v = (e.target as HTMLInputElement).value; props.onSettings({ bodyweight: v ? Number(v) : undefined }); }} />
        </div>
        <p class="note">Tiers use Strength Level's bodyweight-ratio standards (averaged across bodyweights); points use OpenPowerlifting's coefficients. e1RMs are Epley estimates from sets of ≤10 reps, not tested maxes.</p>
      </Panel>
    </div>
  );
}
