// Routines pushed to Hevy must match what the app shows: same local date, same re-entry setting.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeD1 } from "../server/d1";
import { LIFTS } from "../shared/lifts";
import { defaultConfig } from "../shared/programs";
import { toKg } from "../shared/units";
import type { HevyWorkout } from "../shared/hevy";
import { ensureSchema, upsertWorkouts } from "./store";
import { pushRoutines } from "./sync";

function stubHevy() {
  const routines: { title: string; exercises: { sets: { type: string; weight_kg: number | null }[] }[] }[] = [];
  let n = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname.replace("/v1", "");
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (path === "/exercise_templates") return ok({ page: 1, page_count: 1, exercise_templates: Object.entries(LIFTS).filter(([, l]) => l.hevy[0]).map(([k, l]) => ({ id: `t-${k}`, title: l.hevy[0] })) });
    if (path === "/routine_folders") return ok({ routine_folder: { id: 1, title: "x" } });
    if (path === "/routines" && init.method === "POST") { routines.push(JSON.parse(String(init.body)).routine); return ok({ routine: { id: `r${++n}` } }); }
    return new Response("nope", { status: 404 });
  });
  return routines;
}

afterEach(() => vi.unstubAllGlobals());

// Squat a few times, then three weeks off: the next session is a re-entry ramp unless turned off.
const W = (date: string, lb: number): HevyWorkout => ({
  id: date, title: "A1", start_time: `${date}T12:00:00Z`, end_time: `${date}T13:00:00Z`, description: "[ht:A1]",
  exercises: [{ title: LIFTS.squat.hevy[0], exercise_template_id: "t-squat", sets: Array.from({ length: 5 }, () => ({ type: "normal" as const, weight_kg: toKg(lb, "lb"), reps: 3 })) }],
});

async function push(reentry: boolean | undefined) {
  const db = new NodeD1(":memory:") as unknown as D1Database;
  await ensureSchema(db);
  await upsertWorkouts(db, [W("2026-08-03", 225), W("2026-08-10", 235), W("2026-08-17", 245)]);
  const cfg = { ...defaultConfig("gzclp", "lb", "2026-08-01T00:00:00Z"), options: { days: "3", curls: "off" } };
  const routines = stubHevy();
  const r = await pushRoutines(db, "k", cfg, undefined, { today: "2026-09-10", reentry });
  return { routines, r };
}

describe("pushRoutines", () => {
  it("ramps after a break by default, and not when re-entry is off", async () => {
    const top = (x: Awaited<ReturnType<typeof push>>) => x.routines.flatMap((r) => r.exercises.flatMap((e) => e.sets.filter((s) => s.type !== "warmup").map((s) => s.weight_kg ?? 0))).reduce((a, w) => a + w, 0);
    const ramped = await push(undefined);
    const plain = await push(false);
    expect(ramped.r.pushed.length).toBeGreaterThan(1);
    expect(top(ramped)).toBeLessThan(top(plain));
  });
});
