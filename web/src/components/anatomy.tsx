import { h } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { MUSCLE, type MuscleId } from "../../shared/muscles";
import { buildFigure, CREDIT, type Sex, type Side } from "../anatomy/figure";
import type { View } from "../anatomy/male";
import { tip } from "../charts";
import { Seg } from "../ui";
import "../anatomy.css";

// The artwork is large (male ~240 KB, female ~335 KB); load each on first use so it stays out of
// the main bundle.
//
// The female figure is a pre-rendered SVG element tree (src/anatomy/female-figure.json):
// elements carrying `data-m` are muscle regions and get coloured / made interactive here;
// `d` values "@n" point into a shared path table.
type Node = [string, Record<string, string>, Node[]];
type Tree = { d: string[]; front: Node; back: Node };
type Src = { kind: "view"; front: View; back: View } | { kind: "tree"; tree: Tree; front: Node; back: Node };
const srcs: Partial<Record<Sex, Promise<Src>>> = {};
const loadSrc = (sex: Sex) =>
  (srcs[sex] ??= sex === "m"
    ? import("../anatomy/male").then((m): Src => ({ kind: "view", front: m.MALE_FRONT, back: m.MALE_BACK }))
    // ?raw keeps TypeScript from type-inferring a 335 KB JSON literal
    : import("../anatomy/female-figure.json?raw").then((m): Src => { const tree = JSON.parse(m.default) as Tree; return { kind: "tree", tree, front: tree.front, back: tree.back }; }));

/**
 * The widget-blue ramp (styles.css --l4…--l1), interpolated. On the black figure brighter reads
 * as "more", so it runs navy → light blue.
 */
const RAMP = ["#0f3278", "#285ab4", "#5082dc", "#8cb4ff"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
export function rampColor(v: number): string {
  const x = Math.max(0, Math.min(1, v)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const t = x - i;
  const c = RAMP[i].map((a, k) => Math.round(a + (RAMP[i + 1][k] - a) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** Warning ramp for recovery views: fresh = faint, depleted = red. */
export function warnColor(v: number): string {
  const a = Math.max(0, Math.min(1, v));
  const from = [22, 24, 29], to = [255, 107, 94];
  const c = from.map((f, k) => Math.round(f + (to[k] - f) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export type Flag = "warn" | "low";

export interface AnatomyProps {
  /** 0–1 per muscle; missing / 0 = untrained */
  values: Partial<Record<MuscleId, number>>;
  color?: (v: number) => string;
  /** over-taxed / under-worked; called out in the tooltip, not drawn */
  flags?: Partial<Record<MuscleId, Flag>>;
  /** tooltip text per muscle */
  label: (m: MuscleId) => string;
  pinned?: MuscleId | null;
  onPin?: (m: MuscleId | null) => void;
  sex: Sex;
  onSex: (s: Sex) => void;
  legend?: [string, string];
}

let uid = 0;

export function Anatomy(props: AnatomyProps) {
  const [src, setSrc] = useState<{ sex: Sex; v: Src } | null>(null);
  const [hover, setHover] = useState<MuscleId | null>(null);
  const [side, setSide] = useState<"both" | Side>("both");
  const [id] = useState(() => `an${++uid}`);
  useEffect(() => {
    let live = true;
    loadSrc(props.sex).then((v) => live && setSrc({ sex: props.sex, v }));
    return () => { live = false; };
  }, [props.sex]);

  const color = props.color ?? rampColor;
  const sides: Side[] = side === "both" ? ["front", "back"] : [side];
  const active = hover ?? props.pinned ?? null;

  return (
    <div class="anat">
      <div class="anat-bar">
        <Seg value={props.sex} options={[["m", "M"], ["f", "F"]]} onChange={props.onSex} />
        <Seg value={side} options={[["both", "BOTH"], ["front", "FRONT"], ["back", "BACK"]]} onChange={setSide} />
        {props.legend && (
          <span class="legend">
            {props.legend[0]} {[0.05, 0.35, 0.65, 0.95].map((v) => <i style={{ background: color(v) }} />)} {props.legend[1]}
          </span>
        )}
      </div>
      <div class={`anat-figs n${sides.length}`} onMouseLeave={() => { setHover(null); tip.hide(); }} onClick={() => { setHover(null); tip.hide(); if (props.pinned) props.onPin?.(null); }}>
        {!src && <div class="empty">loading anatomy…</div>}
        {src && sides.map((s) => {
          const common = {
            id: `${id}-${src.sex}-${s}`, side: s, values: props.values, color, flags: props.flags ?? {}, active,
            onHover: (m: MuscleId | null, e?: MouseEvent) => { setHover(m); if (m && e) tip.show(e, props.label(m)); else tip.hide(); },
            onPin: (m: MuscleId) => props.onPin?.(props.pinned === m ? null : m),
          };
          return src.v.kind === "view"
            ? <Fig key={`${src.sex}-${s}`} {...common} src={src.v[s]} sex={src.sex} />
            : <TreeFig key={`${src.sex}-${s}`} {...common} node={src.v[s]} table={src.v.tree.d} />;
        })}
      </div>
      <div class="anat-credit">
        {CREDIT[props.sex].text} · <a href={CREDIT[props.sex].url} target="_blank" rel="noopener">{CREDIT[props.sex].license}</a>
      </div>
    </div>
  );
}

function Fig(props: {
  id: string; src: View; side: Side; sex: Sex; values: Partial<Record<MuscleId, number>>; color: (v: number) => string;
  flags: Partial<Record<MuscleId, Flag>>; active: MuscleId | null;
  onHover: (m: MuscleId | null, e?: MouseEvent) => void; onPin: (m: MuscleId) => void;
}) {
  const fig = useMemo(() => buildFigure(props.src, props.sex, props.side), [props.src, props.sex, props.side]);
  const { values, color, flags, active } = props;
  const fill = (m: MuscleId) => ((values[m] ?? 0) > 0.001 ? color(values[m]!) : "var(--anat-idle)");
  const cls = (m: MuscleId) => `mu${active === m ? " on" : ""}${flags[m] ? " " + flags[m] : ""}`;
  const ev = (m: MuscleId) => ({
    onMouseMove: (e: MouseEvent) => props.onHover(m, e),
    onMouseLeave: () => props.onHover(null),
    onClick: (e: MouseEvent) => { e.stopPropagation(); props.onPin(m); props.onHover(m, e); },
  });
  const [x, y, w, h] = fig.viewBox.split(" ").map(Number);
  const pad = 6;
  return (
    <svg class="anat-svg" viewBox={`${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`} role="img" aria-label={`${props.side} muscles`}>
      <defs>
        {Object.entries(fig.clips).map(([k, d]) => <clipPath id={`${props.id}-${k}`}><path d={d} /></clipPath>)}
        {fig.seams.map((x) => <clipPath id={`${props.id}-src${x.shape}`}><path d={fig.shapes[x.shape].d} /></clipPath>)}
      </defs>
      <path class="base" d={fig.base} />
      {fig.shapes.map((s) => {
        if (s.k === "line") return <path class="ln" d={s.d} />;
        if (s.k !== "m" || !s.m) return <path class={s.k} d={s.d} />;
        const m = s.m;
        return (
          <path
            class={cls(m)} d={s.d} fill={fill(m)} data-m={m}
            clip-path={s.clip ? `url(#${props.id}-${s.clip}-${s.s})` : undefined}
            {...ev(m)}
          />
        );
      })}
      {fig.seams.map((x) => <path class="ln seam" d={x.d} clip-path={`url(#${props.id}-src${x.shape})`} />)}
      {fig.deep.map((x) => (
        <path class={`deep ${cls(x.m)}`} d={x.d} fill={(values[x.m] ?? 0) > 0.001 ? color(values[x.m]!) : "none"} {...ev(x.m)} />
      ))}
      {/* hover / pin outline drawn last so it sits above neighbours */}
      {active && fig.shapes.filter((s) => s.m === active).map((s) => (
        <path class="hl" d={s.d} clip-path={s.clip ? `url(#${props.id}-${s.clip}-${s.s})` : undefined} />
      ))}
      {active && fig.deep.filter((x) => x.m === active).map((x) => <path class="hl" d={x.d} />)}
      <text class="anat-lbl" x={x + w / 2} y={y + h + pad - 1} text-anchor="middle">{props.side.toUpperCase()}</text>
    </svg>
  );
}

/** Renders the pre-built female figure tree with live colours and interaction. */
function TreeFig(props: {
  id: string; node: Node; table: string[]; side: Side; values: Partial<Record<MuscleId, number>>; color: (v: number) => string;
  flags: Partial<Record<MuscleId, Flag>>; active: MuscleId | null;
  onHover: (m: MuscleId | null, e?: MouseEvent) => void; onPin: (m: MuscleId) => void;
}) {
  const { values, color, flags, active, table } = props;
  // ids in the tree were generated per render ("v12-g3"); namespace them for this instance
  const ref = (v: string) => v.replace(/\bv\d+-/g, `${props.id}-`);
  const render = (n: Node, i: number): preact.VNode<any> => {
    const [tag, a, kids] = n;
    const at: Record<string, unknown> = { key: i };
    for (const [k, v] of Object.entries(a)) {
      if (k === "d") at.d = v.startsWith("@") ? table[+v.slice(1)] : v;
      else if (k === "id" || k === "clip-path" || (k === "fill" && v.startsWith("url("))) at[k] = ref(v);
      else if (k !== "data-m") at[k] = v;
    }
    const m = a["data-m"] as MuscleId | undefined;
    if (m) {
      at.fill = (values[m] ?? 0) > 0.001 ? color(values[m]!) : "var(--anat-idle)";
      const isMu = /\bmu\b/.test(a.class ?? "");
      if (isMu) at.class = `${a.class}${active === m ? " on" : ""}${flags[m] ? " " + flags[m] : ""}`;
      at.style = `${a.style ?? ""};cursor:pointer`;
      at.onMouseMove = (e: MouseEvent) => props.onHover(m, e);
      at.onMouseLeave = () => props.onHover(null);
      at.onClick = (e: MouseEvent) => { e.stopPropagation(); props.onPin(m); props.onHover(m, e); };
    }
    return h(tag, at, kids.map(render));
  };
  const [x, y, w, hh] = props.node[1].viewBox.split(" ").map(Number);
  const body = useMemo(() => props.node[2].map(render), [props.node, values, color, flags, active]);
  return (
    <svg class="anat-svg" viewBox={props.node[1].viewBox} role="img" aria-label={`${props.side} muscles`}>
      {body}
      <text class="anat-lbl" x={x + w / 2} y={y + hh - 1} text-anchor="middle">{props.side.toUpperCase()}</text>
    </svg>
  );
}

export const muscleName = (m: MuscleId) => MUSCLE[m].name;
