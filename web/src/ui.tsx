import type { ComponentChildren } from "preact";
import { LIFTS } from "../shared/lifts";
import type { Outcome, PlannedExercise, PlannedSession, PlannedSet } from "../shared/program";
import { fmt, plates, type Unit } from "../shared/units";
import type { LiftStall } from "../shared/stall";
import type { RpeChart } from "../shared/rpe";
import type { Derived } from "./derive";

export function Panel(props: { n?: string; title: string; sub?: ComponentChildren; act?: ComponentChildren; span?: number; children: ComponentChildren; class?: string }) {
  return (
    <section class={`pn span-${props.span ?? 12} ${props.class ?? ""}`}>
      <header class="pt">
        <h3>{props.n && <b>{props.n})</b>}{props.title}</h3>
        {props.sub && <span class="sub">{props.sub}</span>}
        {props.act && <div class="act">{props.act}</div>}
      </header>
      {props.children}
    </section>
  );
}

export function Seg<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="seg" role="group">
      {props.options.map(([v, l]) => (
        <button class={v === props.value ? "on" : ""} aria-pressed={v === props.value} onClick={() => props.onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function Delta(props: { v: number | null | undefined; unit?: string; pct?: boolean; digits?: number }) {
  const v = props.v;
  if (v == null || !isFinite(v)) return <span class="faint">—</span>;
  const s = `${v > 0 ? "+" : v < 0 ? "−" : "±"}${fmt(Math.abs(v), props.digits ?? 1)}${props.pct ? "%" : props.unit ? " " + props.unit : ""}`;
  return <span class={v > 0 ? "up" : v < 0 ? "down" : "dim"}>{s}</span>;
}

const OUT_LABEL: Record<Outcome, string> = {
  success: "PASS", hold: "HOLD", fail: "MISS", "stage-down": "STAGE↓", deload: "DELOAD", "retest-next": "RETEST", retested: "NEW 5RM", reset: "RESET", "tm-up": "TM↑", "tm-down": "TM↓", missed: "SKIP",
};
export function OutcomeTag(props: { o: Outcome }) {
  return <span class={`out ${props.o}`}>{OUT_LABEL[props.o]}</span>;
}

export function Tier(props: { t: string }) {
  return <span class={`tier ${props.t}`}>{props.t}</span>;
}

export function ExerciseBlock(props: { ex: PlannedExercise; unit: Unit; showPlates?: boolean }) {
  const { ex, unit } = props;
  const top = Math.max(...ex.sets.map((s) => s.weight));
  const isTest = ex.scheme.includes("RM TEST");
  const barbell = (LIFTS[ex.lift]?.kind ?? "barbell") === "barbell";
  const p = barbell && top > 0 ? plates(top, unit) : [];
  // group identical consecutive sets: "185×3 ×4"
  const groups: { s: PlannedSet; n: number }[] = [];
  for (const s of ex.sets) {
    const g = groups[groups.length - 1];
    const same = g && g.s.weight === s.weight && g.s.reps === s.reps && g.s.repsMax === s.repsMax && g.s.amrap === s.amrap && g.s.rpe === s.rpe && g.s.ofTop === s.ofTop && g.s.pct === s.pct;
    if (same) g.n++;
    else groups.push({ s, n: 1 });
  }
  const bodyweight = LIFTS[ex.lift]?.kind === "bodyweight";
  const load = (s: PlannedSet) =>
    s.ofTop && s.pct != null ? `${Math.round(s.pct * 100)}%top` : s.weight ? `${s.est ? "~" : ""}${fmt(s.weight)}` : s.rpe ? `@${s.rpe}` : bodyweight ? "BW" : "";
  const topRpe = ex.sets.find((s) => s.rpe)?.rpe;
  return (
    <div class="ex">
      <div class="ex-h">
        <Tier t={ex.tier} />
        <span class="name">{LIFTS[ex.lift]?.name ?? ex.lift}</span>
        <span class="dim">{ex.scheme}</span>
        <span class="w">{isTest ? "5RM" : top ? <>{fmt(top)} <small>{unit}</small></> : topRpe ? <>RPE {topRpe}</> : bodyweight ? "BW" : <small class="dim">your pick</small>}</span>
      </div>
      {!isTest && (
        <div class="sets">
          {groups.map((g) => (
            <span class={g.s.amrap ? "amrap" : ""} title={g.s.pct ? `${Math.round(g.s.pct * 100)}%` : undefined}>
              {load(g.s)}{load(g.s) ? "×" : ""}{g.s.reps}{g.s.repsMax ? `–${g.s.repsMax}` : ""}{g.s.amrap ? "+" : ""}{g.s.weight && g.s.rpe ? ` @${g.s.rpe}` : ""}{g.n > 1 ? ` ×${g.n}` : ""}
            </span>
          ))}
        </div>
      )}
      {ex.note && <div class="next">{ex.note}</div>}
      {(ex.ifSuccess || ex.ifFail) && (
        <div class="next">
          {ex.ifSuccess && <span><b>▲</b> {ex.ifSuccess}</span>}
          {ex.ifFail && <span><i>▼</i> {ex.ifFail}</span>}
        </div>
      )}
      {props.showPlates && p.length > 0 && <div class="plates">PLATES/SIDE {p.map((x) => fmt(x)).join(" · ")}</div>}
    </div>
  );
}

export function SessionTicket(props: { s: PlannedSession; unit: Unit; showPlates?: boolean }) {
  return (
    <div class="ticket">
      {props.s.exercises.map((ex) => <ExerciseBlock ex={ex} unit={props.unit} showPlates={props.showPlates} />)}
    </div>
  );
}

export const shortDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}-${["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][Number(m) - 1]}-${y.slice(2)}`;
};

export const ago = (iso?: string) => {
  if (!iso) return "never";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const STALL_CLS: Record<string, string> = { progressing: "up", stalled: "am", regressing: "down", inactive: "faint" };

export function StallChip(props: { s?: LiftStall }) {
  if (!props.s) return null;
  return <span class={`out ${STALL_CLS[props.s.status]}`} title={props.s.reason}>{props.s.status.toUpperCase()}</span>;
}

/** Plateau watch: program flags first (they come with the program's own fix), then lift trends. */
export function Watch(props: { d: Derived; nav: (r: { view: "lifts"; lift: string } | { view: "prog" }) => void; full?: boolean }) {
  const { d } = props;
  const lifts = d.liftKeys.slice(0, props.full ? 12 : 6).map((l) => [l, d.stalls[l]] as const).filter(([, s]) => s);
  const flags = d.progStalls.slice(0, props.full ? 20 : 3);
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      {flags.map((f) => (
        <div class="watch-item" onClick={() => props.nav({ view: "prog" })}>
          <div><span class={`out ${f.severity === "stalled" ? "down" : "am"}`}>{f.severity === "stalled" ? "STALLED" : "WATCH"}</span> <Tier t={f.tier} /> {LIFTS[f.lift]?.short ?? f.lift}</div>
          <div class="dim">{f.message}</div>
          {props.full && <div class="next"><b>→</b> {f.fix}</div>}
        </div>
      ))}
      <table class="t">
        <tbody>
          {lifts.map(([l, s]) => (
            <tr class="click" onClick={() => props.nav({ view: "lifts", lift: l })} title={s!.reason}>
              <td>{LIFTS[l]?.short ?? l}</td>
              <td><StallChip s={s} /></td>
              <td class={s!.slope != null && s!.slope > 0 ? "up" : s!.slope != null && s!.slope < 0 ? "down" : "dim"}>{s!.slope != null ? `${s!.slope > 0 ? "+" : ""}${fmt(s!.slope)}/wk` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Personal RPE chart: % of 1RM by reps × RPE; brighter cells have more of your own data. */
export function RpeTable(props: { chart: RpeChart; e1rm: number | null; unit: Unit }) {
  const c = props.chart;
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <div class="note">{c.summary}</div>
      <div class="tbl-wrap">
        <table class="t rpe">
          <thead><tr><th>REPS</th>{c.rpes.map((r) => <th>@{r}</th>)}</tr></thead>
          <tbody>
            {c.reps.map((reps, i) => (
              <tr>
                <td>{reps}</td>
                {c.rpes.map((rpe, j) => {
                  const n = c.samples[i][j];
                  const load = props.e1rm ? props.e1rm * c.pct[i][j] : null;
                  return <td class={n ? "hi" : "dim"} title={`${reps} @ RPE ${rpe}: ${fmt(c.pct[i][j] * 100)}% (chart ${fmt(c.standard[i][j] * 100)}%)${n ? ` · ${n} of your sets` : ""}${load ? ` · ≈ ${fmt(load, 0)} ${props.unit}` : ""}`}>{fmt(c.pct[i][j] * 100, 0)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
