export type Unit = "kg" | "lb";

export const LB_PER_KG = 2.20462262185;

export const fromKg = (kg: number, unit: Unit) => (unit === "kg" ? kg : kg * LB_PER_KG);
export const toKg = (w: number, unit: Unit) => (unit === "kg" ? w : w / LB_PER_KG);

/** Nearest multiple of `step`, halves up (like the sheets' MROUND); the epsilon keeps 0.7 × 325 = 227.4999… from rounding down. */
export const roundTo = (w: number, step: number) => Math.round(w / step + 1e-9) * step;

/** Smallest jump you can load. Matches the sheet's "Microplates? No" default. */
export function loadStep(kind: LiftKind, unit: Unit, micro = false): number {
  if (kind === "dumbbell") return unit === "lb" ? 5 : 2;
  if (kind === "machine") return unit === "lb" ? 2.5 : 2.5;
  return unit === "lb" ? (micro ? 2.5 : 5) : micro ? 1.25 : 2.5;
}

export type LiftKind = "barbell" | "dumbbell" | "machine" | "bodyweight";

/** "142.5" / "185" — trims float noise and trailing zeros. */
export function fmt(w: number, digits = 1): string {
  const r = Math.round(w * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits).replace(/0+$/, "");
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Plates per side for a barbell load. */
export function plates(total: number, unit: Unit, bar = unit === "lb" ? 45 : 20): number[] {
  const avail = unit === "lb" ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25];
  let side = (total - bar) / 2;
  const out: number[] = [];
  if (side <= 0) return out;
  for (const p of avail) {
    while (side >= p - 1e-6) {
      out.push(p);
      side -= p;
    }
  }
  return out;
}
