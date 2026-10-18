// The body map as a standalone SVG string, coloured per muscle, for clients that can't run the
// web component (the native apps render it with an SVG library). Mirrors
// src/components/anatomy.tsx, with the stylesheet inlined as attributes.

import { buildFigure, type Sex, type Side } from "../src/anatomy/figure";
import { MALE_BACK, MALE_FRONT } from "../src/anatomy/male";
import femaleTree from "../src/anatomy/female-figure.json";
import type { MuscleId } from "./muscles";

type Node = [string, Record<string, string>, Node[]];
type Tree = { d: string[]; front: Node; back: Node };

const IDLE = "#121317";
const RAMP = ["#0f3278", "#285ab4", "#5082dc", "#8cb4ff"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

/** widget-blue ramp, navy → light (load) */
export function rampColor(v: number): string {
  const x = Math.max(0, Math.min(1, v)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  const t = x - i;
  const c = RAMP[i].map((a, k) => Math.round(a + (RAMP[i + 1][k] - a) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
/** faint → red (fatigue) */
export function warnColor(v: number): string {
  const a = Math.max(0, Math.min(1, v));
  const from = [22, 24, 29], to = [255, 107, 94];
  const c = from.map((f, k) => Math.round(f + (to[k] - f) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const STYLE: Record<string, string> = {
  base: 'fill="#08090b" stroke="#33363c" stroke-width="1" vector-effect="non-scaling-stroke"',
  decor: 'fill="#0e0f12" stroke="#1c1e22" stroke-width=".5" vector-effect="non-scaling-stroke"',
  fascia: 'fill="#0b0c0f"',
  ln: 'fill="none" stroke="#2a2d33" stroke-width=".5" vector-effect="non-scaling-stroke"',
};
const MU = 'stroke="#000" stroke-width=".6" vector-effect="non-scaling-stroke"';
const DEEP = 'stroke="#8a8d93" stroke-dasharray="3 2" stroke-width=".9" fill-opacity=".55" vector-effect="non-scaling-stroke"';
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function renderBodySvg(sex: Sex, side: Side, values: Partial<Record<MuscleId, number>>, scheme: "ramp" | "warn"): string {
  const color = scheme === "ramp" ? rampColor : warnColor;
  const fill = (m: MuscleId) => ((values[m] ?? 0) > 0.001 ? color(values[m]!) : IDLE);
  return sex === "f" ? female(side, fill, values) : male(side, fill, values);
}

function male(side: Side, fill: (m: MuscleId) => string, values: Partial<Record<MuscleId, number>>): string {
  const fig = buildFigure(side === "front" ? MALE_FRONT : MALE_BACK, "m", side);
  const [x, y, w, h] = fig.viewBox.split(" ").map(Number);
  const pad = 6;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}">`);
  out.push("<defs>");
  for (const [k, d] of Object.entries(fig.clips)) out.push(`<clipPath id="c-${k}"><path d="${d}"/></clipPath>`);
  for (const s of fig.seams) out.push(`<clipPath id="src${s.shape}"><path d="${fig.shapes[s.shape].d}"/></clipPath>`);
  out.push("</defs>");
  out.push(`<path ${STYLE.base} d="${fig.base}"/>`);
  for (const s of fig.shapes) {
    if (s.k === "line") out.push(`<path ${STYLE.ln} d="${s.d}"/>`);
    else if (s.k !== "m" || !s.m) out.push(`<path ${STYLE[s.k] ?? STYLE.decor} d="${s.d}"/>`);
    else out.push(`<path ${MU} fill="${fill(s.m)}" d="${s.d}"${s.clip ? ` clip-path="url(#c-${s.clip}-${s.s})"` : ""}/>`);
  }
  for (const s of fig.seams) out.push(`<path ${STYLE.ln} d="${s.d}" clip-path="url(#src${s.shape})"/>`);
  for (const dp of fig.deep) out.push(`<path ${DEEP} fill="${(values[dp.m] ?? 0) > 0.001 ? fill(dp.m) : "none"}" d="${dp.d}"/>`);
  out.push("</svg>");
  return out.join("");
}

function female(side: Side, fill: (m: MuscleId) => string, values: Partial<Record<MuscleId, number>>): string {
  const tree = femaleTree as unknown as Tree;
  const render = (n: Node): string => {
    const [tag, a, kids] = n;
    const attrs: string[] = [];
    const cls = (a.class ?? "").split(/\s+/).filter(Boolean);
    const m = a["data-m"] as MuscleId | undefined;
    for (const [k, v] of Object.entries(a)) {
      if (k === "class" || k === "data-m" || k === "style") continue;
      if (k === "d") attrs.push(`d="${v.startsWith("@") ? tree.d[+v.slice(1)] : esc(v)}"`);
      else if (k === "fill" && m) continue;
      else attrs.push(`${k}="${esc(v)}"`);
    }
    if (m) {
      const deep = cls.includes("deep");
      attrs.push(deep ? DEEP : MU, `fill="${deep && !((values[m] ?? 0) > 0.001) ? "none" : fill(m)}"`);
    } else {
      for (const c of cls) if (STYLE[c]) { attrs.push(STYLE[c]); break; }
    }
    if (tag === "svg") attrs.push('xmlns="http://www.w3.org/2000/svg"');
    return `<${tag} ${attrs.join(" ")}>${kids.map(render).join("")}</${tag}>`;
  };
  return render(side === "front" ? tree.front : tree.back);
}
