import type { HevyExerciseTemplate, HevyRoutineExercise, HevyRoutineSet, HevyWorkout } from "../shared/hevy";
import { toHevyWorkout, type LiveSession } from "../shared/live";
import { applyRamp } from "../shared/travel";
import { LIFTS } from "../shared/lifts";
import { planDay, replay, type PlannedExercise, type PlannedSession, type ProgramConfig } from "../shared/program";
import { buildProgram } from "../shared/programs";
import { roundTo, toKg } from "../shared/units";
import { Hevy } from "./hevy";
import { allWorkouts, deleteWorkouts, kvGet, kvPut, upsertWorkouts, workoutCount } from "./store";

export interface SyncState {
  /** events cursor; null until the first full backfill finishes */
  cursor: string | null;
  backfill?: { page: number; startedAt: string };
  at?: string;
  count?: number;
  error?: string;
  last?: { added: number; deleted: number };
}

// Stay well under the Workers subrequest limit; a long backfill continues on the next run.
const MAX_PAGES = 40;

export async function sync(db: D1Database, key: string): Promise<SyncState> {
  const hevy = new Hevy(key);
  const st: SyncState = (await kvGet<SyncState>(db, "sync")) ?? { cursor: null };
  let added = 0, deleted = 0;
  try {
    if (!st.cursor) {
      const bf = st.backfill ?? { page: 1, startedAt: new Date().toISOString() };
      for (let n = 0; n < MAX_PAGES; n++) {
        const r = await hevy.workouts(bf.page);
        await upsertWorkouts(db, r.workouts);
        added += r.workouts.length;
        if (bf.page >= r.page_count || !r.workouts.length) {
          st.cursor = bf.startedAt;
          st.backfill = undefined;
          break;
        }
        bf.page++;
        st.backfill = bf;
      }
    } else {
      const startedAt = new Date().toISOString();
      for (let page = 1; page <= MAX_PAGES; page++) {
        const r = await hevy.events(st.cursor, page);
        // An empty page comes back as {workouts: []} rather than {events: []}; accept bare workouts too.
        const raw = (r as any).events ?? (r as any).workouts ?? [];
        const events = raw.map((e: any) => (e.type ? e : { type: "updated", workout: e })) as typeof r.events;
        const up = events.flatMap((e) => (e.type === "updated" ? [e.workout] : []));
        const del = events.flatMap((e) => (e.type === "deleted" ? [e.id] : []));
        await upsertWorkouts(db, up);
        await deleteWorkouts(db, del);
        added += up.length;
        deleted += del.length;
        if (page >= r.page_count || !events.length) break;
      }
      st.cursor = startedAt;
    }
    st.error = undefined;
  } catch (e) {
    st.error = String(e instanceof Error ? e.message : e);
  }
  try {
    const body: { date: string; weightKg: number }[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await hevy.bodyMeasurements(page);
      body.push(...r.body_measurements.filter((m) => m.weight_kg).map((m) => ({ date: m.date, weightKg: m.weight_kg! })));
      if (page >= r.page_count) break;
    }
    await kvPut(db, "body", body);
  } catch { /* optional endpoint */ }
  st.at = new Date().toISOString();
  st.count = await workoutCount(db);
  st.last = { added, deleted };
  await kvPut(db, "sync", st);
  return st;
}

/** Webhook path: fetch one workout and store it. */
export async function syncOne(db: D1Database, key: string, id: string) {
  const w = await new Hevy(key).workout(id);
  await upsertWorkouts(db, [w]);
  return w;
}

// ───────────────────────── routines ─────────────────────────

async function templates(db: D1Database, hevy: Hevy): Promise<HevyExerciseTemplate[]> {
  const cached = await kvGet<{ at: number; items: HevyExerciseTemplate[] }>(db, "templates");
  if (cached && Date.now() - cached.at < 7 * 864e5) return cached.items;
  const items: HevyExerciseTemplate[] = [];
  for (let page = 1; page <= 30; page++) {
    const r = await hevy.templates(page);
    items.push(...r.exercise_templates);
    if (page >= r.page_count) break;
  }
  await kvPut(db, "templates", { at: Date.now(), items });
  return items;
}

export async function finishLive(db: D1Database, key: string, session: LiveSession, cfg: ProgramConfig | null): Promise<HevyWorkout> {
  const hevy = new Hevy(key);
  const all = await templates(db, hevy);
  const body = toHevyWorkout(session, (ex) => ex.templateId ?? templateFor(ex.lift, cfg, all));
  const w = await hevy.createWorkout(body);
  // Store right away so the app updates before the next sync.
  if (w?.id) await upsertWorkouts(db, [w]);
  return w;
}

export async function getTemplates(db: D1Database, key: string) {
  return templates(db, new Hevy(key));
}

export function templateFor(lift: string, cfg: ProgramConfig | null, all: HevyExerciseTemplate[]): string {
  if (!cfg) cfg = { liftMap: {} } as unknown as ProgramConfig;
  if (cfg.liftMap?.[lift]) return cfg.liftMap[lift];
  for (const t of LIFTS[lift]?.hevy ?? []) {
    const hit = all.find((x) => x.title.toLowerCase() === t.toLowerCase());
    if (hit) return hit.id;
  }
  throw new Error(`No Hevy exercise found for ${lift}. Map it in Settings › Lifts.`);
}

function routineSets(ex: PlannedExercise, cfg: ProgramConfig): HevyRoutineSet[] {
  const kg = (w: number) => Math.round(toKg(w, cfg.unit) * 100) / 100;
  if (ex.scheme.includes("RM TEST")) {
    return Array.from({ length: 5 }, () => ({ type: "normal" as const, weight_kg: null, reps: ex.sets[0].reps }));
  }
  const sets: HevyRoutineSet[] = [];
  const top = ex.sets[0]?.weight ?? 0;
  const barbell = (LIFTS[ex.lift]?.kind ?? "barbell") === "barbell";
  if (barbell && (ex.tier === "T1" || ex.tier === "MAIN") && top > 0) {
    const step = cfg.unit === "lb" ? 5 : 2.5;
    for (const [f, r] of [[0.4, 5], [0.6, 3], [0.8, 2]] as const) sets.push({ type: "warmup", weight_kg: kg(roundTo(top * f, step)), reps: r });
  }
  for (const s of ex.sets) sets.push({ type: s.amrap ? "failure" : "normal", weight_kg: kg(s.weight), reps: s.reps });
  return sets;
}

/**
 * Create or update one Hevy routine per program day with the current prescribed weights.
 * Returns the updated config (routineDays filled in) — caller saves it.
 */
export async function pushRoutines(db: D1Database, key: string, cfg: ProgramConfig, onlyDay?: number): Promise<{ cfg: ProgramConfig; pushed: { dayId: string; routineId: string; title: string }[] }> {
  const hevy = new Hevy(key);
  const def = buildProgram(cfg);
  if (!def) throw new Error("No active program");
  const state = replay(def, cfg, await allWorkouts(db), { today: new Date().toISOString().slice(0, 10) });
  const all = await templates(db, hevy);
  let folder = await kvGet<number>(db, `folder:${cfg.templateId}`);
  if (folder == null) {
    folder = await hevy.createFolder(`${def.name} · Ironterm`);
    await kvPut(db, `folder:${cfg.templateId}`, folder);
  }
  const byDay = Object.fromEntries(Object.entries(cfg.routineDays ?? {}).map(([rid, did]) => [did, rid]));
  const pushed: { dayId: string; routineId: string; title: string }[] = [];
  const days = onlyDay != null ? [onlyDay] : def.days.map((_, i) => i);
  for (const i of days) {
    const base = planDay(def, cfg, state, i);
    // After a break, the next session goes out as a lighter ramp.
    const plan = state.reentry && i === state.dayIndex ? applyRamp(base, state.reentry, cfg.unit, def) : base;
    const exercises: HevyRoutineExercise[] = plan.exercises.map((ex) => ({
      exercise_template_id: templateFor(ex.lift, cfg, all),
      superset_id: null,
      rest_seconds: ex.restSeconds,
      notes: [`${ex.tier} ${ex.scheme}`, ex.note, ex.ifSuccess, ex.ifFail].filter(Boolean).join(" · "),
      sets: routineSets(ex, cfg),
    }));
    const title = `${def.name.split(" ")[0]} ${plan.dayId}${plan.weekName ? ` · ${plan.weekName}` : ""}`;
    const notes = `Managed by Ironterm. Weights update after every logged session.`;
    const existing = byDay[plan.dayId];
    let id: string;
    try {
      id = existing ? await hevy.updateRoutine(existing, { title, notes, exercises }) : await hevy.createRoutine({ title, folder_id: folder, notes, exercises });
    } catch (e) {
      // Routine was deleted in the app: recreate it.
      if (!existing) throw e;
      id = await hevy.createRoutine({ title, folder_id: folder, notes, exercises });
    }
    byDay[plan.dayId] = id;
    pushed.push({ dayId: plan.dayId, routineId: id, title });
  }
  const routineDays = Object.fromEntries(Object.entries(byDay).map(([did, rid]) => [rid, did]));
  return { cfg: { ...cfg, routineDays: { ...cfg.routineDays, ...routineDays } }, pushed };
}

/** Push travel sessions (or any ad-hoc sessions) as routines in a "Travel · Ironterm" folder. */
export async function pushSessions(db: D1Database, key: string, sessions: PlannedSession[], unit: "lb" | "kg"): Promise<{ title: string; routineId: string }[]> {
  const hevy = new Hevy(key);
  const all = await templates(db, hevy);
  let folder = await kvGet<number>(db, "folder:travel");
  if (folder == null) {
    folder = await hevy.createFolder("Travel · Ironterm");
    await kvPut(db, "folder:travel", folder);
  }
  const ids = (await kvGet<Record<string, string>>(db, "routines:travel")) ?? {};
  const cfg = { unit, liftMap: {} } as unknown as ProgramConfig;
  const out: { title: string; routineId: string }[] = [];
  for (const s of sessions) {
    const title = s.dayName;
    const exercises: HevyRoutineExercise[] = s.exercises.map((ex) => ({
      exercise_template_id: templateFor(ex.lift, cfg, all), superset_id: null, rest_seconds: ex.restSeconds,
      notes: [ex.scheme, ex.note].filter(Boolean).join(" · "), sets: routineSets(ex, cfg),
    }));
    const notes = "Maintenance while traveling. Aim for ~3 reps in reserve; slow lowering on leg work.";
    let id: string;
    try {
      id = ids[s.dayId] ? await hevy.updateRoutine(ids[s.dayId], { title, notes, exercises }) : await hevy.createRoutine({ title, folder_id: folder, notes, exercises });
    } catch {
      id = await hevy.createRoutine({ title, folder_id: folder, notes, exercises });
    }
    ids[s.dayId] = id;
    out.push({ title, routineId: id });
  }
  await kvPut(db, "routines:travel", ids);
  return out;
}
