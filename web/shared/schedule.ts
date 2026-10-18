// Training calendar: lays the program's upcoming days onto your training weekdays and checks how
// this week is going. Pure; the UI renders it.

import type { HevyWorkout } from "./hevy";
import { firstScheduled, weekIndex, type LogEntry, type ProgramDef, type ProgramState } from "./program";
import { defaultSchedule } from "./recovery";
import { addDays, localDate, weekStart } from "./stats";

/** 0 = Monday … 6 = Sunday */
export const dow = (date: string) => (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;

export interface PlannedDate {
  date: string;
  dayIndex: number;
  dayId: string;
  dayName: string;
  week: number;
}

/** Training weekdays: your setting, else an even spread for the program's sessions per week. */
export function trainingDays(setting: number[] | undefined, def: ProgramDef | null): number[] {
  if (setting?.length) return [...setting].sort();
  return defaultSchedule(def?.sessionsPerWeek ?? 4);
}

/**
 * Upcoming program days on training dates, starting today (unless you already trained today).
 * Finite programs stop at their end.
 */
export function upcoming(def: ProgramDef, state: ProgramState, days: number[], today: string, trainedToday: boolean, count = 28, skip: (date: string) => boolean = () => false): PlannedDate[] {
  const out: PlannedDate[] = [];
  let dayIndex = state.dayIndex, rotations = state.rotations;
  let date = trainedToday ? addDays(today, 1) : today;
  for (let guard = 0; out.length < count && guard < 400; guard++, date = addDays(date, 1)) {
    if (!days.includes(dow(date)) || skip(date)) continue;
    if (def.cycle?.finite && rotations >= def.cycle.weeks) break;
    const d = def.days[dayIndex];
    out.push({ date, dayIndex, dayId: d.id, dayName: d.name, week: weekIndex(def, rotations) });
    const n = firstScheduled(def, dayIndex + 1, rotations);
    dayIndex = n.dayIndex;
    rotations = n.rotations;
  }
  return out;
}

export interface DayRecord {
  date: string;
  workouts: HevyWorkout[];
  /** program sessions logged that day */
  program: LogEntry[];
  /** a training weekday in the past with nothing logged */
  missed: boolean;
}

/** Past days keyed by local date, with program log entries attached. */
export function history(workouts: HevyWorkout[], log: LogEntry[], tz: string, days: number[], today: string, since: string, skip: (date: string) => boolean = () => false): Map<string, DayRecord> {
  const m = new Map<string, DayRecord>();
  const get = (d: string) => m.get(d) ?? (m.set(d, { date: d, workouts: [], program: [], missed: false }), m.get(d)!);
  for (const w of workouts) {
    const d = localDate(w.start_time, tz);
    if (d >= since) get(d).workouts.push(w);
  }
  for (const e of log) {
    const d = localDate(e.date, tz);
    if (d >= since) get(d).program.push(e);
  }
  // Only real calendar dates: a malformed `since` (e.g. a year before 0001 from a URL) must not
  // turn this into an endless loop.
  if (!/^\d{4}-\d\d-\d\d$/.test(since) || !/^\d{4}-\d\d-\d\d$/.test(today)) return m;
  for (let d = since; d < today; d = addDays(d, 1)) {
    if (days.includes(dow(d)) && !skip(d) && !m.get(d)?.workouts.length) get(d).missed = true;
  }
  return m;
}

export interface WeekStatus {
  planned: number;
  done: number;
  /** training days left this week, including today if not trained */
  left: number;
  /** done − sessions expected by now */
  delta: number;
  label: string;
}

export function weekStatus(workouts: HevyWorkout[], tz: string, allDays: number[], today: string, skip: (date: string) => boolean = () => false): WeekStatus {
  const ws = weekStart(today);
  // Training days that fall on a trip don't count this week.
  const days = allDays.filter((d) => !skip(addDays(ws, d)));
  const dates = new Set(workouts.map((w) => localDate(w.start_time, tz)).filter((d) => d >= ws && d <= today));
  const done = dates.size;
  const trainedToday = dates.has(today);
  const planned = days.length;
  const expectedByNow = days.filter((d) => d < dow(today) || (d === dow(today) && trainedToday)).length;
  const left = days.filter((d) => d > dow(today) || (d === dow(today) && !trainedToday)).length;
  const delta = done - expectedByNow;
  const label =
    done >= planned ? `week done: ${done}/${planned}` :
    delta < 0 ? `${-delta} behind · ${planned - done} to go, ${left} training day${left === 1 ? "" : "s"} left` :
    delta > 0 ? `${delta} ahead · ${planned - done} to go` :
    `on track · ${planned - done} to go`;
  return { planned, done, left, delta, label };
}
