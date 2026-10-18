// Builds the drawable figure for a sex and view from the vendored artwork:
//   male    male.ts   — Ryan Graves' detailed écorché (CC BY 4.0), ~50 named muscles
//   female  female-figure.json, a pre-rendered figure: outline and proportions from
//           react-native-body-highlighter's female drawing (MIT), each muscle group filled with
//           the same atlas's internal layout (Ryan Graves, CC BY 4.0) fitted to that outline.
//
// Also defined here, per figure, in that figure's own coordinates:
//   clips   split one source path into several muscles (pec clavicular / sternal heads, trapezius
//           upper / middle / lower, infraspinatus / teres major); boundaries follow the fibre
//           direction of the real muscle.
//   seams   the split lines, drawn as hairlines inside the source path.
//   deep    dashed outlines for muscles that sit under others (rhomboids under the middle
//           trapezius; on the male, erector spinae under the thoracolumbar fascia).

import type { MuscleId } from "../../shared/muscles";
import type { Shape, View } from "./male";

export type Sex = "m" | "f";
export type Side = "front" | "back";

export interface Figure {
  viewBox: string;
  base: string;
  shapes: Shape[];
  /** clip id (`${name}-${side}`) → path */
  clips: Record<string, string>;
  deep: { m: MuscleId; s: "l" | "r"; d: string }[];
  /** split hairlines: `shape` is the index of the shape whose outline clips the line */
  seams: { d: string; shape: number }[];
}

export const CREDIT: Record<Sex, { text: string; license: string; url: string }> = {
  m: { text: "anatomy art: Ryan Graves · via muscle_mapper (MIT)", license: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  f: { text: "female figure: outline & proportions react-native-body-highlighter (MIT, © 2022 ELABBASSI Hicham) · muscle detail Ryan Graves", license: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
};

// ───────────────────────── path utilities ─────────────────────────

type Pt = [number, number];

/** Apply f to every point of an absolute M/L/H/V/C/Z path (what the clip/deep shapes use). */
export function mapPath(d: string, f: (p: Pt) => Pt): string {
  let out = "";
  let cur: Pt = [0, 0];
  const r = (n: number) => Math.round(n * 10) / 10;
  for (const [, cmd, args] of d.matchAll(/([MLHVCZ])([^MLHVCZ]*)/g)) {
    const n = (args.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    if (cmd === "Z") { out += "Z"; continue; }
    if (cmd === "H" || cmd === "V") {
      for (const v of n) {
        cur = cmd === "H" ? [v, cur[1]] : [cur[0], v];
        const p = f(cur);
        out += `L${r(p[0])} ${r(p[1])}`;
      }
      continue;
    }
    const pts: string[] = [];
    for (let i = 0; i + 1 < n.length; i += 2) {
      const p = f([n[i], n[i + 1]]);
      pts.push(`${r(p[0])} ${r(p[1])}`);
      cur = [n[i], n[i + 1]];
    }
    out += cmd + pts.join(" ");
  }
  return out;
}

const mirror = (d: string, cx: number) => mapPath(d, ([x, y]) => [2 * cx - x, y]);

// ───────────────────────── per-figure extras ─────────────────────────

interface Extras {
  clips: Record<string, string>;
  seams: { clip: string; d: string }[];
  deep: { m: MuscleId; d: string }[];
}

// All written for the subject's right side and mirrored for the left.
// Front: subject's right is the viewer's left (x < cx). Back: subject's right is x > cx.
const EXTRAS: Record<Sex, Record<Side, Extras>> = {
  m: {
    front: {
      // clavicular head: above a line from the sternum at the 2nd rib to the deltopectoral groove
      clips: { pecUpper: "M140 160L300 160L300 236L140 214Z", pecLower: "M140 214L300 236L300 360L140 360Z" },
      seams: [{ clip: "pecLower", d: "M140 214L300 236" }],
      deep: [],
    },
    back: {
      // teres major runs from the scapula's inferior angle up-and-out to the humerus, below infraspinatus
      clips: { infraUpper: "M318 170L470 170L470 219L318 292Z", teres: "M318 292L470 219L470 340L318 340Z" },
      seams: [{ clip: "teres", d: "M318 292L470 219" }],
      deep: [
        // rhomboid minor + major: T1–T5 spinous processes → medial border of the scapula
        { m: "rhomboids", d: "M300 152L345 203L351 290L300 238Z" },
        // erector spinae columns either side of the lumbar spine, under the fascia
        { m: "erectors", d: "M301 246C311 246 320 258 323 284L327 400C329 440 321 464 304 472Z" },
      ],
    },
  },
  f: {
    front: {
      clips: { pecUpper: "M195 290L322 290L322 358L195 338Z", pecLower: "M195 338L322 358L322 460L195 460Z" },
      seams: [{ clip: "pecLower", d: "M195 338L322 358" }],
      deep: [],
    },
    back: {
      // trapezius: descending fibres to the acromion, transverse fibres to the scapular spine,
      // ascending fibres converging on the lower thoracic spine
      clips: {
        trapUpper: "M1142 200L1300 200L1300 320L1142 306Z",
        trapMid: "M1142 306L1300 320L1300 362L1142 364Z",
        trapLower: "M1142 364L1300 362L1300 430L1142 430Z",
        infraUpper: "M1195 300L1265 300L1265 342L1195 358Z",
        teres: "M1195 358L1265 342L1265 380L1195 380Z",
      },
      seams: [
        { clip: "trapMid", d: "M1142 306L1300 320" },
        { clip: "trapMid", d: "M1142 364L1300 362" },
        { clip: "teres", d: "M1195 358L1265 342" },
      ],
      deep: [{ m: "rhomboids", d: "M1144 300L1188 318L1194 382L1144 374Z" }],
    },
  },
};

// ───────────────────────── build ─────────────────────────

const cache = new Map<string, Figure>();

export function buildFigure(src: View, sex: Sex, side: Side): Figure {
  const key = `${sex}-${side}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { cx } = src;
  const ex = EXTRAS[sex][side];
  const forSide = (d: string, s: "l" | "r") => (s === "r" ? d : mirror(d, cx));

  const clips: Record<string, string> = {};
  for (const [name, d] of Object.entries(ex.clips)) {
    clips[`${name}-r`] = forSide(d, "r");
    clips[`${name}-l`] = forSide(d, "l");
  }
  const deep: Figure["deep"] = [];
  for (const x of ex.deep) for (const s of ["r", "l"] as const) deep.push({ m: x.m, s, d: forSide(x.d, s) });
  const seams: Figure["seams"] = [];
  for (const x of ex.seams) {
    src.shapes.forEach((sh, i) => { if (sh.clip === x.clip && (sh.s === "l" || sh.s === "r")) seams.push({ d: forSide(x.d, sh.s), shape: i }); });
  }
  const fig: Figure = { viewBox: src.viewBox, base: src.base, shapes: src.shapes, clips, deep, seams };
  cache.set(key, fig);
  return fig;
}
