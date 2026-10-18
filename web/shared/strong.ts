// Strong (strong.app) CSV export → HevyWorkout[]. Strong has no API, but Settings › Export
// Strong Data gives a full CSV: one row per set, workouts identified by Date + Workout Name.
// Pure, so the Worker, the Node server and the tests all share it.

import type { HevyExercise, HevySet, HevyWorkout, SetType } from "./hevy";
import { matchLift } from "./lifts";
import { toKg, type Unit } from "./units";

export type DistUnit = "km" | "mi" | "m";

export interface StrongParse {
  workouts: HevyWorkout[];
  /** unit found in a "Weight Unit" column, if the export had one */
  unitDetected: Unit | null;
  /** distinct exercise names that don't count as any lift in the library */
  unmatchedExercises: string[];
  /** rows read (excluding the header) */
  rows: number;
  /** rest-timer and empty rows left out */
  ignoredRows: number;
  from: string | null;
  to: string | null;
}

export class StrongError extends Error {}

/** RFC 4180-ish: quoted fields with embedded delimiters, newlines and doubled quotes; CRLF or LF. */
export function parseCsv(text: string, delim?: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delim ?? sniffDelimiter(text);
  const out: string[][] = [];
  let row: string[] = [];
  let f = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"' && f === "") q = true;
    else if (c === d) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      out.push(row); row = [];
    } else f += c;
  }
  if (f !== "" || row.length) { row.push(f); out.push(row); }
  return out.filter((r) => r.length > 1 || r[0].trim() !== "");
}

/** Comma or semicolon, judged from the header line (outside quotes). */
function sniffDelimiter(text: string): string {
  let q = false, commas = 0, semis = 0;
  for (const c of text) {
    if (c === '"') q = !q;
    else if (!q && (c === "\n" || c === "\r")) break;
    else if (!q && c === ",") commas++;
    else if (!q && c === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

/** "1h 5m", "45m", "50s", "1h", "1:05:00", or bare seconds. */
export function parseDuration(s: string): number {
  const t = s.trim().toLowerCase();
  if (!t) return 0;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  const hms = /^(\d+):(\d\d)(?::(\d\d))?$/.exec(t);
  if (hms) return hms[3] != null ? +hms[1] * 3600 + +hms[2] * 60 + +hms[3] : +hms[1] * 60 + +hms[2];
  let sec = 0, hit = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?)\b/g)) {
    const n = Number(m[1]);
    sec += m[2].startsWith("h") ? n * 3600 : m[2].startsWith("m") ? n * 60 : n;
    hit = true;
  }
  return hit ? Math.round(sec) : 0;
}

/** Offset (ms) of `tz` from UTC at instant `t`. */
function tzOffset(t: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
}

/** "2023-01-15 18:04:12" read as wall-clock time in `tz` → ISO UTC. */
export function localToUtc(s: string, tz: string): string {
  const m = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d?):(\d\d)(?::(\d\d))?/.exec(s.trim());
  if (!m) throw new StrongError(`Unrecognised date "${s}"`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let t = wall - tzOffset(wall, tz);
  t = wall - tzOffset(t, tz); // second pass lands DST edges on the right side
  return new Date(t).toISOString().replace(".000Z", "Z");
}

/** "62.5", "62,5" (European exports) → 62.5; empty → null. */
function num(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  const n = Number(t.includes(".") ? t.replace(/,/g, "") : t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function slug(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "exercise";
}

/** cyrb53: small, fast, stable string hash (53 bits), base 36. */
export function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Stable across re-imports and timezone changes: the raw Date text plus the workout name. */
export const strongId = (date: string, name: string) => `strong-${hash(`${date.trim()}|${name.trim()}`)}`;

function setType(order: string): SetType | "rest" {
  const o = order.trim().toUpperCase();
  if (o === "W") return "warmup";
  if (o === "D") return "dropset";
  if (o === "F") return "failure";
  if (o === "REST" || o === "R") return "rest";
  return "normal";
}

function unitOf(s: string | undefined): Unit | null {
  const t = (s ?? "").trim().toLowerCase();
  if (t === "kg" || t === "kgs") return "kg";
  if (t === "lb" || t === "lbs") return "lb";
  return null;
}

const METERS: Record<DistUnit, number> = { km: 1000, mi: 1609.344, m: 1 };
function distUnitOf(s: string | undefined): DistUnit | null {
  const t = (s ?? "").trim().toLowerCase();
  if (t === "km") return "km";
  if (t === "mi" || t === "miles" || t === "mile") return "mi";
  if (t === "m" || t === "meters" || t === "metres") return "m";
  return null;
}

const COLS = {
  date: ["date"],
  workout: ["workout name"],
  duration: ["duration", "workout duration"],
  exercise: ["exercise name"],
  order: ["set order"],
  weight: ["weight"],
  weightUnit: ["weight unit"],
  reps: ["reps"],
  distance: ["distance"],
  distanceUnit: ["distance unit"],
  seconds: ["seconds"],
  notes: ["notes"],
  workoutNotes: ["workout notes"],
  rpe: ["rpe"],
} as const;

export interface StrongOptions {
  /** IANA zone the Date column is in (Strong writes local wall-clock time) */
  tz: string;
  /** weight unit when the export has no Weight Unit column */
  unit?: Unit;
  /** distance unit when the export has no Distance Unit column (default: km for kg, mi for lb) */
  distUnit?: DistUnit;
  /** lift mapping, for the unmatched-exercise list */
  liftMap?: Record<string, string>;
}

export function parseStrong(csv: string, opts: StrongOptions): StrongParse {
  const rows = parseCsv(csv);
  if (!rows.length) throw new StrongError("The file is empty.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, header.findIndex((h) => (names as readonly string[]).includes(h))])) as Record<keyof typeof COLS, number>;
  const missing = (["date", "workout", "exercise", "order"] as const).filter((k) => col[k] < 0);
  if (missing.length) throw new StrongError(`Not a Strong export: missing column${missing.length > 1 ? "s" : ""} ${missing.map((k) => `"${COLS[k][0]}"`).join(", ")}.`);
  const get = (r: string[], k: keyof typeof COLS) => (col[k] >= 0 ? (r[col[k]] ?? "") : "");

  let unitDetected: Unit | null = null;
  for (const r of rows.slice(1)) { const u = unitOf(get(r, "weightUnit")); if (u) { unitDetected = u; break; } }

  interface Draft { w: HevyWorkout; ex: (HevyExercise & { _notes: string[] })[] }
  const byKey = new Map<string, Draft>();
  let ignored = 0;
  const names = new Set<string>();

  for (const r of rows.slice(1)) {
    const date = get(r, "date").trim();
    const name = get(r, "workout").trim() || "Workout";
    const exName = get(r, "exercise").trim();
    const type = setType(get(r, "order"));
    if (!date || !exName || type === "rest" || /^rest timer$/i.test(exName)) { ignored++; continue; }

    const key = `${date}|${name}`;
    let d = byKey.get(key);
    if (!d) {
      const start = localToUtc(date, opts.tz);
      const dur = parseDuration(get(r, "duration"));
      const end = new Date(Date.parse(start) + dur * 1000).toISOString().replace(".000Z", "Z");
      d = { w: { id: strongId(date, name), title: name, description: null, start_time: start, end_time: end, exercises: [] }, ex: [] };
      byKey.set(key, d);
    }
    const wn = get(r, "workoutNotes").trim();
    if (wn && !d.w.description) d.w.description = wn;

    // Consecutive rows of the same exercise are one exercise; a later repeat is its own block.
    let ex = d.ex[d.ex.length - 1];
    if (!ex || ex.title !== exName) {
      ex = { index: d.ex.length, title: exName, exercise_template_id: `strong:${slug(exName)}`, notes: null, superset_id: null, sets: [], _notes: [] };
      d.ex.push(ex);
      names.add(exName);
    }
    const note = get(r, "notes").trim();
    if (note && !ex._notes.includes(note)) ex._notes.push(note);

    const unit = unitOf(get(r, "weightUnit")) ?? opts.unit ?? unitDetected ?? "kg";
    const du = distUnitOf(get(r, "distanceUnit")) ?? opts.distUnit ?? (unit === "kg" ? "km" : "mi");
    const weight = num(get(r, "weight"));
    const reps = num(get(r, "reps"));
    const dist = num(get(r, "distance"));
    const secs = num(get(r, "seconds"));
    const rpe = num(get(r, "rpe"));
    const set: HevySet = {
      index: ex.sets.length,
      type,
      weight_kg: weight == null ? null : Math.round(toKg(weight, unit) * 1000) / 1000,
      reps: reps == null ? null : Math.round(reps),
      distance_meters: dist ? Math.round(dist * METERS[du] * 10) / 10 : null,
      duration_seconds: secs ? Math.round(secs) : null,
      rpe: rpe || null,
    };
    ex.sets.push(set);
  }

  const workouts = [...byKey.values()]
    .map(({ w, ex }) => ({ ...w, exercises: ex.map(({ _notes, ...e }) => ({ ...e, notes: _notes.length ? _notes.join("\n") : null })) }))
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const unmatchedExercises = [...names].filter((n) => !matchLift(n, `strong:${slug(n)}`, opts.liftMap)).sort();
  return {
    workouts, unitDetected, unmatchedExercises, rows: rows.length - 1, ignoredRows: ignored,
    from: workouts[0]?.start_time ?? null, to: workouts[workouts.length - 1]?.start_time ?? null,
  };
}
