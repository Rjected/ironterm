// Request body checks. A client mistake must answer 400 with a reason, and must never store
// something that breaks every later request (a bad time zone, a program for an unknown template).

import { getTemplate } from "../shared/programs";

export class BadRequest extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);
const DATE = /^\d{4}-\d\d-\d\d$/;
const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v) && !Number.isNaN(Date.parse(v));

/** The JSON body, or a 400. `allowNull` accepts an empty body / `null` as null. */
export async function readJson(req: Request, allowNull = false): Promise<unknown> {
  const raw = await req.text();
  if (!raw.trim()) {
    if (allowNull) return null;
    throw new BadRequest("body must be JSON");
  }
  let v: unknown;
  try { v = JSON.parse(raw); } catch { throw new BadRequest("body must be JSON"); }
  if (v === null && !allowNull) throw new BadRequest("body must be a JSON object");
  return v;
}

/** A JSON object body ({} for an empty body when `optional`). */
export async function readObject(req: Request, optional = false): Promise<Record<string, unknown>> {
  const v = await readJson(req, optional);
  if (v == null) return {};
  if (!isObj(v)) throw new BadRequest("body must be a JSON object");
  return v;
}

export function validTz(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** PUT /api/settings: only known keys, each the right type. */
export function settingsPatch(v: unknown): Record<string, unknown> {
  if (!isObj(v)) throw new BadRequest("settings must be a JSON object");
  const out: Record<string, unknown> = {};
  const bad = (k: string, want: string) => { throw new BadRequest(`settings.${k} must be ${want}`); };
  for (const [k, x] of Object.entries(v)) {
    switch (k) {
      case "unit": if (x !== "lb" && x !== "kg") bad(k, '"lb" or "kg"'); break;
      case "distUnit": if (x != null && x !== "mi" && x !== "km") bad(k, '"mi" or "km"'); break;
      case "tz": if (!validTz(x)) bad(k, "an IANA time zone, e.g. America/New_York"); break;
      case "autoPush": case "reentry": if (x != null && typeof x !== "boolean") bad(k, "true or false"); break;
      case "graphMetric": if (x !== "volume" && x !== "sets" && x !== "duration") bad(k, '"volume", "sets" or "duration"'); break;
      case "bodyweight": if (x != null && (typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1000)) bad(k, "a number from 0 to 1000"); break;
      case "sex": if (x != null && x !== "male" && x !== "female") bad(k, '"male" or "female"'); break;
      case "trainingDays":
        if (x != null && (!Array.isArray(x) || x.length > 7 || x.some((d) => !Number.isInteger(d) || d < 0 || d > 6) || new Set(x).size !== x.length)) bad(k, "distinct weekdays, 0 (Mon) to 6 (Sun)");
        break;
      default: continue; // unknown keys are dropped
    }
    out[k] = x;
  }
  return out;
}

/** PUT /api/program: null (no program) or a config for a known template. */
export function programConfig(v: unknown): Record<string, unknown> | null {
  if (v === null) return null;
  if (!isObj(v)) throw new BadRequest("program must be a JSON object or null");
  if (typeof v.templateId !== "string" || !getTemplate(v.templateId)) throw new BadRequest("program.templateId: unknown program");
  if (v.unit !== "lb" && v.unit !== "kg") throw new BadRequest('program.unit must be "lb" or "kg"');
  if (typeof v.startDate !== "string" || Number.isNaN(Date.parse(v.startDate))) throw new BadRequest("program.startDate must be a date");
  if (v.options != null && (!isObj(v.options) || Object.values(v.options).some((x) => typeof x !== "string"))) throw new BadRequest("program.options must map keys to strings");
  for (const k of ["startWeights", "trainingMaxes", "increments", "startStages"] as const) {
    const m = v[k];
    if (m != null && (!isObj(m) || Object.values(m).some((x) => typeof x !== "number" || !Number.isFinite(x)))) throw new BadRequest(`program.${k} must map keys to numbers`);
  }
  for (const k of ["liftMap", "routineDays", "swaps"] as const) {
    const m = v[k];
    if (m != null && (!isObj(m) || Object.values(m).some((x) => typeof x !== "string"))) throw new BadRequest(`program.${k} must map keys to strings`);
  }
  if (v.adjustments != null && (!Array.isArray(v.adjustments) || v.adjustments.some((a) => !isObj(a) || typeof a.date !== "string" || (a.skip != null && typeof a.skip !== "boolean")))) throw new BadRequest("program.adjustments must be a list of {date, …}");
  return { ...v, options: v.options ?? {}, startWeights: v.startWeights ?? {}, trainingMaxes: v.trainingMaxes ?? {} };
}

/** A live session as the GYM screen keeps it. */
export function liveSession(v: unknown): Record<string, unknown> & { id: string; exercises: unknown[] } {
  if (!isObj(v) || typeof v.id !== "string" || !v.id || !Array.isArray(v.exercises)) throw new BadRequest("session must be {id, exercises: [...]}");
  if (typeof v.startedAt !== "string" || Number.isNaN(Date.parse(v.startedAt))) throw new BadRequest("session.startedAt must be a date");
  if (v.unit !== "lb" && v.unit !== "kg") throw new BadRequest('session.unit must be "lb" or "kg"');
  for (const e of v.exercises) {
    if (!isObj(e) || typeof e.lift !== "string" || !Array.isArray(e.sets) || e.sets.some((s) => !isObj(s))) throw new BadRequest("session.exercises must be {lift, sets: [...]}");
  }
  return v as Record<string, unknown> & { id: string; exercises: unknown[] };
}

export function trips(v: unknown): unknown[] {
  if (!Array.isArray(v) || v.some((t) => !isObj(t) || !isDate(t.start) || !isDate(t.end) || typeof t.id !== "string")) throw new BadRequest("trips must be a list of {id, start, end} with YYYY-MM-DD dates");
  return v;
}

export function weighIn(v: unknown): { date: string; kg: number } {
  if (!isObj(v) || !isDate(v.date) || typeof v.kg !== "number" || !Number.isFinite(v.kg) || v.kg < 0 || v.kg > 500) throw new BadRequest("weigh-in must be {date: YYYY-MM-DD, kg: 0–500}");
  return { date: v.date, kg: v.kg };
}

export function notesEdit(v: unknown): { description: string; exercises: (string | null)[] } {
  if (!isObj(v) || typeof v.description !== "string" || !Array.isArray(v.exercises) || v.exercises.some((x) => x !== null && typeof x !== "string")) {
    throw new BadRequest("notes must be {description: string, exercises: (string|null)[]}");
  }
  return v as { description: string; exercises: (string | null)[] };
}
