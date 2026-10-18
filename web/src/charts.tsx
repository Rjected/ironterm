import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { DayCell } from "../shared/stats";
import { addDays, weekStart } from "../shared/stats";
import { fmt } from "../shared/units";

// ───────── tooltip (one shared floating element) ─────────

let setTipGlobal: ((t: { x: number; y: number; text: string } | null) => void) | null = null;
export const tip = {
  show(e: MouseEvent | PointerEvent, text: string) {
    setTipGlobal?.({ x: e.clientX, y: e.clientY, text });
  },
  hide() {
    setTipGlobal?.(null);
  },
};
export function Tip() {
  const [t, setT] = useState<{ x: number; y: number; text: string } | null>(null);
  setTipGlobal = setT;
  if (!t) return null;
  const left = Math.min(t.x + 12, window.innerWidth - 290);
  const top = t.y + 14 + 80 > window.innerHeight ? t.y - 70 : t.y + 14;
  return <div class="tip" style={{ left, top }}>{t.text}</div>;
}

function useWidth<T extends HTMLElement>(): [preact.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ───────── contribution graph ─────────

const LEVEL = ["var(--l0)", "var(--l1)", "var(--l2)", "var(--l3)", "var(--l4)"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function Heatmap(props: {
  cells: Map<string, DayCell>;
  today: string;
  weeks?: number;
  /** end on this date instead of today (for past years) */
  end?: string;
  label: (c: DayCell | undefined, date: string) => string;
  onPick?: (date: string, c?: DayCell) => void;
  minCell?: number;
}) {
  const weeks = props.weeks ?? 53;
  const end = props.end ?? props.today;
  const [ref, width] = useWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const gap = 3;
  const min = props.minCell ?? 10;
  const cell = width ? Math.max(min, Math.min(16, Math.floor((width + gap) / weeks) - gap)) : min;
  const first = addDays(weekStart(end), -7 * (weeks - 1));
  const top = 14;
  const w = weeks * (cell + gap) - gap;
  const h = top + 7 * (cell + gap) - gap;

  useEffect(() => {
    // Phones: start scrolled to the latest weeks.
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [width, end]);

  const rects = [];
  const labels = [];
  let lastMonth = -1;
  for (let x = 0; x < weeks; x++) {
    const ws = addDays(first, x * 7);
    const m = Number(ws.slice(5, 7)) - 1;
    if (m !== lastMonth) {
      if (x < weeks - 2) labels.push(<text x={x * (cell + gap)} y={9}>{MONTHS[m]}</text>);
      lastMonth = m;
    }
    for (let d = 0; d < 7; d++) {
      const date = addDays(ws, d);
      if (date > end) continue;
      const c = props.cells.get(date);
      const isToday = date === props.today;
      rects.push(
        <rect
          class="c"
          x={x * (cell + gap)}
          y={top + d * (cell + gap)}
          width={cell}
          height={cell}
          fill={LEVEL[c?.level ?? 0]}
          stroke={isToday ? "var(--amber)" : undefined}
          stroke-width={isToday ? 1.5 : undefined}
          onPointerMove={(e) => tip.show(e, props.label(c, date))}
          onPointerLeave={tip.hide}
          onClick={() => props.onPick?.(date, c)}
        />,
      );
    }
  }
  return (
    <div class="heat" ref={ref}>
      <div class="heat-days" style={{ gridTemplateRows: `${top}px repeat(7, ${cell + gap}px)` }}>
        <span /> <span>M</span><span /><span>W</span><span /><span>F</span><span /><span>S</span>
      </div>
      <div class="heat-scroll" ref={scroller}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Training activity by day">
          {labels}
          {rects}
        </svg>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <div class="legend">
      less {LEVEL.map((c) => <i style={{ background: c }} />)} more
    </div>
  );
}

// ───────── line chart ─────────

export interface Series {
  key: string;
  label: string;
  color: string;
  points: { date: string; v: number }[];
  dashed?: boolean;
  area?: boolean;
}

const dnum = (d: string) => Date.parse(d + "T00:00:00Z") / 864e5;

function niceTicks(min: number, max: number, n = 4) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(v);
  return out;
}

export function LineChart(props: { series: Series[]; height?: number; from?: string; to?: string; unit?: string; marks?: { date: string; label: string }[]; band?: { date: string; lo: number; hi: number }[]; bandColor?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = props.height ?? 200;
  const padL = 40, padR = 10, padT = 8, padB = 18;
  const all = [...props.series.flatMap((s) => s.points), ...(props.band ?? []).flatMap((b) => [{ date: b.date, v: b.lo }, { date: b.date, v: b.hi }])];
  if (!all.length) return <div class="empty">No data yet.</div>;
  const x0 = props.from ? dnum(props.from) : Math.min(...all.map((p) => dnum(p.date)));
  const x1 = props.to ? dnum(props.to) : Math.max(...all.map((p) => dnum(p.date)));
  const vis = all.filter((p) => dnum(p.date) >= x0);
  const ticks = niceTicks(Math.min(...vis.map((p) => p.v)), Math.max(...vis.map((p) => p.v)));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const W = Math.max(width, 200);
  const X = (d: string) => padL + ((dnum(d) - x0) / Math.max(1, x1 - x0)) * (W - padL - padR);
  const Y = (v: number) => padT + (1 - (v - y0) / Math.max(1e-9, y1 - y0)) * (H - padT - padB);

  // x ticks: month starts
  const xt: { x: number; label: string }[] = [];
  const startD = new Date(x0 * 864e5);
  const months = (x1 - x0) / 30;
  const every = months > 18 ? 3 : months > 8 ? 2 : 1;
  for (let d = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth() + 1, 1)); d.getTime() / 864e5 <= x1; d.setUTCMonth(d.getUTCMonth() + every)) {
    const iso = d.toISOString().slice(0, 10);
    xt.push({ x: X(iso), label: d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : MONTHS[d.getUTCMonth()] });
  }

  const hx = hover;
  const near = hx == null ? [] : props.series.map((s) => {
    let best: { date: string; v: number } | null = null;
    for (const p of s.points) if (dnum(p.date) >= x0 && (!best || Math.abs(X(p.date) - hx) < Math.abs(X(best.date) - hx))) best = p;
    return { s, p: best };
  });

  return (
    <div class="chart" ref={ref}>
      <svg
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          setHover(x);
          const lines = near.filter((n) => n.p).map((n) => `${n.s.label.padEnd(10)} ${fmt(n.p!.v)}${props.unit ? " " + props.unit : ""}`);
          if (near[0]?.p) tip.show(e, `${near[0].p.date}\n${lines.join("\n")}`);
        }}
        onPointerLeave={() => { setHover(null); tip.hide(); }}
      >
        <g class="grid">
          {ticks.map((t) => <line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} />)}
        </g>
        {ticks.map((t) => <text x={padL - 6} y={Y(t) + 3} text-anchor="end">{fmt(t, 0)}</text>)}
        {xt.map((t) => <text x={t.x} y={H - 4} text-anchor="middle">{t.label}</text>)}
        {props.band && props.band.length > 1 && (
          <path
            d={`${props.band.map((b, i) => `${i ? "L" : "M"}${X(b.date).toFixed(1)} ${Y(b.hi).toFixed(1)}`).join("")}${[...props.band].reverse().map((b) => `L${X(b.date).toFixed(1)} ${Y(b.lo).toFixed(1)}`).join("")}Z`}
            fill={props.bandColor ?? "var(--l1)"} fill-opacity="0.12" stroke="none"
          />
        )}
        {props.marks?.map((m) => <line x1={X(m.date)} x2={X(m.date)} y1={padT} y2={H - padB} stroke="var(--amber-dim)" stroke-dasharray="2 3" />)}
        {props.series.map((s) => {
          const pts = s.points.filter((p) => dnum(p.date) >= x0);
          if (!pts.length) return null;
          // Break the line across long gaps (time off) instead of drawing a fake flat stretch.
          const d = pts.map((p, i) => `${i && dnum(p.date) - dnum(pts[i - 1].date) <= 45 ? "L" : "M"}${X(p.date).toFixed(1)} ${Y(p.v).toFixed(1)}`).join("");
          const last = pts[pts.length - 1];
          return (
            <g>
              {s.area && !d.slice(1).includes("M") && <path d={`${d}L${X(last.date)} ${H - padB}L${X(pts[0].date)} ${H - padB}Z`} fill={s.color} fill-opacity="0.08" />}
              <path d={d} fill="none" stroke={s.color} stroke-width={s.dashed ? 1 : 1.5} stroke-dasharray={s.dashed ? "3 3" : undefined} vector-effect="non-scaling-stroke" />
              <circle cx={X(last.date)} cy={Y(last.v)} r={2.5} fill={s.color} />
            </g>
          );
        })}
        {hx != null && hx >= padL && <line class="xh" x1={hx} x2={hx} y1={padT} y2={H - padB} />}
        {near.map((n) => n.p && <circle cx={X(n.p.date)} cy={Y(n.p.v)} r={3} fill="var(--bg)" stroke={n.s.color} stroke-width={1.5} />)}
      </svg>
    </div>
  );
}

// ───────── sparkline / bars ─────────

export function Spark(props: { values: number[]; width?: number; height?: number; color?: string }) {
  const { values } = props;
  const W = props.width ?? 120, H = props.height ?? 22;
  if (values.length < 2) return <svg width={W} height={H} />;
  const min = Math.min(...values), max = Math.max(...values);
  const X = (i: number) => (i / (values.length - 1)) * (W - 3) + 1;
  const Y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join("");
  const c = props.color ?? "var(--l1)";
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d}L${X(values.length - 1)} ${H}L${X(0)} ${H}Z`} fill={c} fill-opacity="0.1" />
      <path d={d} fill="none" stroke={c} stroke-width="1.25" vector-effect="non-scaling-stroke" />
      <circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r="2" fill={c} />
    </svg>
  );
}

export function Bars(props: { items: { key: string; v: number; label: string; cur?: boolean }[]; height?: number; unit?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = props.height ?? 120;
  const padL = 40, padB = 16;
  const n = props.items.length;
  if (!n) return <div class="empty">No data yet.</div>;
  const ticks = niceTicks(0, Math.max(...props.items.map((i) => i.v)), 3);
  const top = ticks[ticks.length - 1] || 1;
  const W = Math.max(width, 200);
  const bw = (W - padL) / n;
  const Y = (v: number) => (1 - v / top) * (H - padB);
  return (
    <div class="chart bars" ref={ref}>
      <svg height={H} viewBox={`0 0 ${W} ${H}`}>
        <g class="grid">{ticks.map((t) => <line x1={padL} x2={W} y1={Y(t)} y2={Y(t)} />)}</g>
        {ticks.map((t) => <text x={padL - 6} y={Y(t) + 3} text-anchor="end">{t >= 1000 ? fmt(t / 1000, 0) + "k" : fmt(t, 0)}</text>)}
        {props.items.map((it, i) => (
          <rect
            class={it.cur ? "cur" : undefined}
            x={padL + i * bw + 1}
            y={Y(it.v)}
            width={Math.max(1, bw - 2)}
            height={Math.max(0, H - padB - Y(it.v))}
            onPointerMove={(e) => tip.show(e, it.label)}
            onPointerLeave={tip.hide}
          />
        ))}
        {props.items.map((it, i) => (i % Math.ceil(n / 6) === 0 ? <text x={padL + i * bw} y={H - 3}>{it.key}</text> : null))}
      </svg>
    </div>
  );
}
