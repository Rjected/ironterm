// One compact, versioned JSON document for everything outside the web app: the native Android /
// iOS apps and their home-screen widgets. Served at GET /api/snapshot. Keep it small (widgets
// fetch it on a timer) and additive: add fields, don't rename them; bump `v` on breaking change.
//
// Weights are in `unit`; volumes are in `unit` × reps; dates are local YYYY-MM-DD in `tz`.

import type { Bootstrap } from "../src/api";
import { derive } from "../src/derive";
import { BIG_FOUR, LIFTS, liftName } from "./lifts";
import { MUSCLE, MUSCLES, type MuscleId } from "./muscles";
import { analyzeHistory } from "./recovery";
import { trainingDays, weekStatus } from "./schedule";
import { addDays, durationMin, localDate, weekStart, workingSets, workoutVolumeKg } from "./stats";
import { fromKg, type Unit } from "./units";
import { onTrip } from "./travel";

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  v: number;
  generatedAt: string; // ISO
  today: string;
  unit: Unit;
  tz: string;
  demo: boolean;
  /** where workouts come from: Hevy sync, Ironterm itself (Strong import / logged in the app), or demo data */
  source: "hevy" | "local" | "demo";
  /** 53 × 7 grid ending today (oldest first, Monday-first weeks); level 0–4 like GitHub */
  graph: { start: string; days: { date: string; level: number; value: number }[] };
  streak: { current: number; best: number }; // weeks meeting the weekly target
  week: {
    target: number; // sessions / week the streak needs
    done: number;
    /** Mon..Sun of this week */
    days: { date: string; dow: string; status: "done" | "planned" | "rest" | "missed" | "today" | "travel" }[];
  };
  totals: {
    sessions52: number; sessionsPrev52: number;
    vol7: number; volPrev7: number;
    avgMin: number;
    allTime: number;
  };
  last: null | { title: string; date: string; durationMin: number; volume: number; sets: number; exercises: number };
  program: null | { name: string; next: NextSession | null };
  lifts: { key: string; name: string; short: string; e1rm: number; delta28: number | null; spark: number[] }[];
  recovery: null | {
    /** average readiness of the big muscles, 0–1 */
    overall: number;
    /** least ready first */
    muscles: { id: MuscleId; name: string; readiness: number; readyInH: number }[];
  };
}

export interface NextSession {
  dayName: string;
  weekName?: string;
  /** e.g. "MON 20 OCT" or "TODAY" */
  when: string;
  date: string | null;
  reentry: boolean;
  exercises: {
    lift: string;
    name: string;
    short: string;
    tier: string;
    scheme: string; // "5×3+"
    /** compact human line: "3×5 @ 225, 1×5+ @ 225" */
    summary: string;
    top: number; // heaviest planned weight (0 for bodyweight)
    sets: { reps: number; repsMax?: number; weight: number; amrap: boolean; rpe?: number }[];
  }[];
}

const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const r1 = (x: number) => Math.round(x * 10) / 10;

function summarize(sets: NextSession["exercises"][number]["sets"]): string {
  const groups: { n: number; key: string }[] = [];
  for (const s of sets) {
    const reps = `${s.reps}${s.repsMax && s.repsMax > s.reps ? `–${s.repsMax}` : ""}${s.amrap ? "+" : ""}`;
    const key = `${reps}${s.weight ? ` @ ${r1(s.weight)}` : ""}${s.rpe ? ` RPE ${s.rpe}` : ""}`;
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.n++;
    else groups.push({ n: 1, key });
  }
  return groups.map((g) => `${g.n}×${g.key}`).join(", ");
}

export function snapshot(b: Bootstrap, now = new Date()): Snapshot {
  const d = derive(b, b.settings.graphMetric ?? "volume");
  const { unit, tz, today } = d;

  // graph: 53 Monday-first weeks ending this week
  const start = addDays(weekStart(today), -52 * 7);
  const days: Snapshot["graph"]["days"] = [];
  for (let x = start; x <= today; x = addDays(x, 1)) {
    const c = d.cells.get(x);
    days.push({ date: x, level: c?.level ?? 0, value: c ? Math.round(c.value) : 0 });
  }

  // this week
  const allDays = trainingDays(b.settings.trainingDays, d.def);
  const trips = b.trips ?? [];
  const away = { has: (x: string) => !!onTrip(trips, x) };
  const ws = weekStatus(d.workouts, tz, allDays, today, (x) => away.has(x));
  const wk = weekStart(today);
  const trained = new Set(d.workouts.map((w) => localDate(w.start_time, tz)));
  const weekDays = DOW.map((dow, i) => {
    const date = addDays(wk, i);
    const status: Snapshot["week"]["days"][number]["status"] =
      trained.has(date) ? "done" : away.has(date) ? "travel" : date === today ? (allDays.includes(i) ? "today" : "rest")
      : allDays.includes(i) ? (date < today ? "missed" : "planned") : "rest";
    return { date, dow, status };
  });

  // next session
  let program: Snapshot["program"] = null;
  if (d.def) {
    const n = d.next;
    let next: NextSession | null = null;
    if (n) {
      // the first training day from today on (today itself only if not trained yet)
      let date: string | null = null;
      for (let i = 0; i < 14; i++) {
        const x = addDays(today, i);
        const dw = (new Date(x + "T12:00:00Z").getUTCDay() + 6) % 7;
        if (i === 0 && trained.has(x)) continue;
        if (allDays.includes(dw) && !away.has(x)) { date = x; break; }
      }
      const when = !date ? "NEXT" : date === today ? "TODAY" : date === addDays(today, 1) ? "TOMORROW"
        : `${DOW[(new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7]} ${+date.slice(8)} ${MON[+date.slice(5, 7) - 1]}`;
      next = {
        dayName: n.dayName, weekName: n.weekName, when, date, reentry: !!d.state?.reentry,
        exercises: n.exercises.map((e) => {
          const sets = e.sets.map((s) => ({ reps: s.reps, repsMax: s.repsMax, weight: r1(s.weight), amrap: s.amrap, rpe: s.rpe }));
          return {
            lift: e.lift, name: liftName(e.lift), short: LIFTS[e.lift]?.short ?? liftName(e.lift), tier: e.tier, scheme: e.scheme,
            summary: summarize(sets), top: Math.max(0, ...sets.map((s) => s.weight)), sets,
          };
        }),
      };
    }
    program = { name: d.def.name, next };
  }

  // lifts: big four first, then the most-trained others, up to 8
  const counts = (k: string) => d.lifts[k]?.length ?? 0;
  const keys = [...d.liftKeys.filter((k) => (BIG_FOUR as readonly string[]).includes(k)),
    ...d.liftKeys.filter((k) => !(BIG_FOUR as readonly string[]).includes(k)).sort((a, c) => counts(c) - counts(a))].slice(0, 8);
  const lifts: Snapshot["lifts"] = [];
  for (const k of keys) {
    const pts = d.lifts[k] ?? [];
    const now1 = d.e1rmNow(k);
    if (!now1 || !pts.length) continue;
    const old = pts.filter((p) => p.date <= addDays(today, -28));
    const before = old.length ? Math.max(...old.filter((p) => p.date > addDays(today, -56)).map((p) => p.e1rm), 0) || old[old.length - 1].e1rm : null;
    // rolling 4-week best e1RM at the end of each of the last 12 weeks (deload weeks don't dip)
    const spark: number[] = [];
    for (let i = 11; i >= 0; i--) {
      const z = addDays(wk, 7 - i * 7), a = addDays(z, -28);
      const inWin = pts.filter((p) => p.date >= a && p.date < z).map((p) => p.e1rm);
      spark.push(r1(inWin.length ? Math.max(...inWin) : spark.length ? spark[spark.length - 1] : 0));
    }
    lifts.push({ key: k, name: liftName(k), short: LIFTS[k]?.short ?? liftName(k), e1rm: r1(now1), delta28: before ? r1(now1 - before) : null, spark });
  }

  // recovery from the real log
  let recovery: Snapshot["recovery"] = null;
  if (d.workouts.length) {
    const ha = analyzeHistory(d.workouts, { now, liftMap: d.liftMap });
    const ms = MUSCLES.map((m) => ({ id: m.id, name: MUSCLE[m.id].short, readiness: Math.round(ha.current[m.id].readiness * 100) / 100, readyInH: Math.round(ha.current[m.id].readyIn) }));
    const big = MUSCLES.filter((m) => m.range).map((m) => ha.current[m.id].readiness);
    recovery = { overall: Math.round((big.reduce((a, x) => a + x, 0) / Math.max(1, big.length)) * 100) / 100, muscles: ms.sort((a, c) => a.readiness - c.readiness) };
  }

  const lw = d.workouts[0];
  return {
    v: SNAPSHOT_VERSION, generatedAt: now.toISOString(), today, unit, tz, demo: b.mode === "demo", source: b.mode === "live" ? "hevy" : b.mode === "local" ? "local" : "demo",
    graph: { start, days },
    streak: d.streak,
    week: { target: ws.planned, done: weekDays.filter((x) => x.status === "done").length, days: weekDays },
    totals: { sessions52: d.sessions52, sessionsPrev52: d.sessionsPrev52, vol7: Math.round(d.vol7), volPrev7: Math.round(d.volPrev7), avgMin: Math.round(d.avgMin), allTime: d.workouts.length },
    last: lw ? {
      title: lw.title, date: localDate(lw.start_time, tz), durationMin: Math.round(durationMin(lw)),
      volume: Math.round(fromKg(workoutVolumeKg(lw), unit)), sets: workingSets(lw), exercises: lw.exercises.length,
    } : null,
    program, lifts, recovery,
  };
}
