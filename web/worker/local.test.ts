// Local mode end to end: the real worker on the Node SQLite shim, no Hevy key. Demo until real
// data arrives; a Strong import or "start fresh" makes Ironterm the source of truth.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";
import type { LiveSession } from "../shared/live";

const SAMPLE = readFileSync(new URL("../shared/fixtures/strong-sample.csv", import.meta.url), "utf8");
// One database for the file: the worker caches its schema setup per process.
const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const r = await worker.fetch!(new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as never, env, ctx);
  return { status: r.status, data: (await r.json()) as T };
}

const session = (id: string): LiveSession => ({
  id, startedAt: "2026-10-16T22:00:00.000Z", unit: "lb", title: "Evening workout", restEndsAt: null,
  exercises: [
    { id: "e1", lift: "squat", restSeconds: 180, userNote: "depth good", sets: [
      { type: "warmup", weight: 135, reps: 5, done: true },
      { type: "normal", weight: 405, reps: 5, done: true },
      { type: "normal", weight: 405, reps: 5, done: false },
    ] },
    { id: "e2", lift: "safetyBarSquat", restSeconds: 120, sets: [{ type: "normal", weight: 225, reps: 8, done: true }] },
    { id: "e3", lift: "bench", restSeconds: 120, sets: [{ type: "normal", weight: 185, reps: 5, done: false }] },
  ],
});

describe("local mode", () => {
  it("starts in demo with generated data", async () => {
    const { data } = await call("GET", "/api/bootstrap");
    expect(data.mode).toBe("demo");
    expect((await call("GET", "/api/snapshot")).data.demo).toBe(true);
  });

  it("previews an import without writing", async () => {
    const { status, data } = await call("POST", "/api/import/strong", { csv: SAMPLE, preview: true });
    expect(status).toBe(200);
    expect(data).toMatchObject({ preview: true, workouts: 36, added: 36, updated: 0, skipped: 0, unitDetected: null });
    expect(data.unmatchedExercises).toEqual(["Cable Woodchopper", "Running (Treadmill)"]);
    expect((await call("GET", "/api/bootstrap")).data.mode).toBe("demo");
  });

  it("needs a unit when the file has none", async () => {
    const { status, data } = await call("POST", "/api/import/strong", { csv: SAMPLE });
    expect(status).toBe(400);
    expect(data.error).toMatch(/kg or lb/);
    expect((await call("POST", "/api/import/strong", { csv: "nope" })).status).toBe(400);
  });

  it("imports, switches to local, and dedupes a re-import", async () => {
    const first = await call("POST", "/api/import/strong", { csv: SAMPLE, unit: "lb" });
    expect(first.data).toMatchObject({ workouts: 36, added: 36, updated: 0, skipped: 0, mode: "local" });
    const again = await call("POST", "/api/import/strong", { csv: SAMPLE, unit: "lb" });
    expect(again.data).toMatchObject({ workouts: 36, added: 0, updated: 0, skipped: 36 });
    // a preview with no unit assumes the settings unit, so it agrees with what's stored
    expect((await call("POST", "/api/import/strong", { csv: SAMPLE, preview: true })).data).toMatchObject({ added: 0, updated: 0, skipped: 36 });
    expect((await call("POST", "/api/import/strong", { csv: SAMPLE, unit: "kg", preview: true })).data).toMatchObject({ added: 0, updated: 36 });
    const { data: b } = await call("GET", "/api/bootstrap");
    expect(b.mode).toBe("local");
    expect(b.workouts).toHaveLength(36);
    expect(b.settings.unit).toBe("lb");
    expect(b.workouts.every((w: { id: string }) => w.id.startsWith("strong-"))).toBe(true);
    expect((await call("GET", "/api/snapshot")).data.demo).toBe(false);
  });

  it("Hevy-only actions explain themselves", async () => {
    for (const [m, p] of [["POST", "/api/sync"], ["POST", "/api/routines/push"]] as const) {
      const r = await call(m, p, {});
      expect(r.status).toBe(400);
      expect(r.data.error).toMatch(/No Hevy connected/);
    }
    expect((await call("GET", "/api/templates")).data).toEqual([]);
  });

  it("logs a GYM session into the workouts table, once", async () => {
    const s = session("sess1");
    expect((await call("PUT", "/api/live", s)).status).toBe(200);
    expect((await call("GET", "/api/bootstrap")).data.live.id).toBe("sess1");
    const f = await call("POST", "/api/live/finish", s);
    expect(f.status).toBe(200);
    expect(f.data.local).toBe(true);
    expect(f.data.workout.id).toBe("local-sess1");
    expect(f.data.workout.exercises.map((e: { title: string; exercise_template_id: string }) => [e.title, e.exercise_template_id]))
      .toEqual([["Squat (Barbell)", "lift:squat"], ["Safety Bar Squat", "lift:safetyBarSquat"]]);
    expect(f.data.workout.exercises[0].notes).toContain("depth good");
    expect(f.data.prs.some((p: { lift: string }) => p.lift === "squat")).toBe(true);

    const again = await call("POST", "/api/live/finish", s);
    expect(again.data.duplicate).toBe(true);
    const { data: b } = await call("GET", "/api/bootstrap");
    expect(b.live).toBeNull();
    expect(b.workouts.filter((w: { id: string }) => w.id === "local-sess1")).toHaveLength(1);
    expect(b.workouts).toHaveLength(37);
  });

  it("native app endpoints read the same data", async () => {
    const home = (await call("GET", "/api/app/home")).data;
    expect(JSON.stringify(home)).not.toContain('"demo":true');
    const hist = (await call("GET", "/api/app/history?limit=5")).data;
    expect(JSON.stringify(hist)).toContain("local-sess1");
    expect((await call("GET", "/api/app/workouts/local-sess1")).status).toBe(200);
    const lift = (await call("GET", "/api/app/lifts/safetyBarSquat")).data;
    expect(lift).toBeTruthy();
    const st = await call("POST", "/api/app/gym/start", { empty: true });
    expect(st.status).toBe(200);
    expect((await call("GET", "/api/bootstrap")).data.live.id).toBe(st.data.id);
    await call("DELETE", "/api/live");
  });

  it("edits notes locally, and a re-import keeps the edit", async () => {
    const { data: b } = await call("GET", "/api/bootstrap");
    const w = b.workouts.find((x: { id: string }) => x.id.startsWith("strong-"));
    const r = await call("PUT", `/api/workouts/${w.id}/notes`, { description: "edited here", exercises: w.exercises.map(() => "") });
    expect(r.data).toMatchObject({ ok: true, local: true });
    const after = (await call("GET", "/api/bootstrap")).data.workouts.find((x: { id: string }) => x.id === w.id);
    expect(after.description).toBe("edited here");
    const again = await call("POST", "/api/import/strong", { csv: SAMPLE, unit: "lb" });
    expect(again.data).toMatchObject({ added: 0, updated: 0, skipped: 36 });
    expect((await call("GET", "/api/bootstrap")).data.workouts.find((x: { id: string }) => x.id === w.id).description).toBe("edited here");
  });

  it("start fresh works with no workouts too", async () => {
    // mode key alone is enough
    expect((await call("PUT", "/api/mode", { mode: "local" })).data.mode).toBe("local");
    expect((await call("PUT", "/api/mode", { mode: "bogus" })).status).toBe(400);
  });
});
