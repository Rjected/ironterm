// Program browsing end to end (docs/api/programs.md): the real worker on the Node SQLite shim, in
// demo, local and live modes.
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";

const DB = new NodeD1(":memory:");
const demoEnv = { DB, TIMEZONE: "America/New_York" } as never;
// live mode only needs a key to be set; none of these routes talk to Hevy
const liveEnv = { DB, TIMEZONE: "America/New_York", HEVY_API_KEY: "test-key" } as never;
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

async function call<T = any>(method: string, path: string, body?: unknown, env = demoEnv): Promise<{ status: number; data: T }> {
  const init: RequestInit = { method, headers: { "content-type": "application/json" } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  const r = await worker.fetch!(new Request(`http://localhost${path}`, init) as never, env, ctx);
  return { status: r.status, data: (await r.json()) as T };
}

describe("program browsing API", () => {
  it("catalog and detail", async () => {
    const c = await call("GET", "/api/app/programs");
    expect(c.status).toBe(200);
    expect(c.data.active).toBe("gzclp");
    expect(c.data.programs.length).toBeGreaterThan(50);
    const d = await call("GET", "/api/app/programs/531?opt.deload=off&opt.supp=fsl");
    expect(d.status).toBe(200);
    expect(d.data.weeks).toHaveLength(3);
    expect(d.data.options.find((o: { key: string }) => o.key === "supp").selected).toBe("fsl");
    expect(d.data.rules.tiers.length).toBeGreaterThan(0);
    expect((await call("GET", "/api/app/programs/531?opt.deload=maybe")).status).toBe(400);
    expect((await call("GET", "/api/app/programs/nope")).status).toBe(404);
  });

  it("demo: start persists, replaces, and sets training days", async () => {
    const r = await call("POST", "/api/app/programs/531/start", { options: { supp: "bbb" }, trainingDays: [0, 2, 4, 5], trainingMaxes: { squat: 300 } });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.data.program.program).toMatchObject({ templateId: "531", name: "5/3/1 BBB" });
    let b = (await call("GET", "/api/bootstrap")).data;
    expect(b.mode).toBe("demo");
    expect(b.program).toMatchObject({ templateId: "531", options: { supp: "bbb", deload: "on" } });
    expect(b.program.trainingMaxes.squat).toBe(300);
    expect(b.settings.trainingDays).toEqual([0, 2, 4, 5]);
    expect((await call("GET", "/api/app/programs")).data.active).toBe("531");
    // the running program's detail now uses it
    expect((await call("GET", "/api/app/programs/531")).data.basis).toBe("active");
    // replace, no body
    const g = await call("POST", "/api/app/programs/gzclp/start");
    expect(g.data.program.program.templateId).toBe("gzclp");
    b = (await call("GET", "/api/bootstrap")).data;
    expect(b.program.templateId).toBe("gzclp");
    expect(b.settings.trainingDays).toEqual([0, 2, 4, 5]); // untouched without trainingDays
  });

  it("validation errors don't touch the saved program", async () => {
    const bad = async (body: unknown, path = "/api/app/programs/531/start") => (await call("POST", path, body)).status;
    expect(await bad("{nope")).toBe(400);
    expect(await bad({ trainingDays: [9] })).toBe(400);
    expect(await bad({ trainingDays: "mon" })).toBe(400);
    expect(await bad({ options: { supp: 5 } })).toBe(400);
    expect(await bad({ startWeights: { squat: 100 } })).toBe(400); // 531 has no start-weight slots
    expect(await bad({ trainingMaxes: { squat: "heavy" } })).toBe(400);
    expect(await bad({}, "/api/app/programs/nope/start")).toBe(404);
    expect((await call("GET", "/api/bootstrap")).data.program.templateId).toBe("gzclp");
  });

  it("local mode: start writes the real program, not the demo copy", async () => {
    expect((await call("PUT", "/api/mode", { mode: "local" })).data.mode).toBe("local");
    const r = await call("POST", "/api/app/programs/stronglifts/start", { startDate: "2026-10-19", trainingDays: [0, 2, 4] });
    expect(r.status).toBe(200);
    const b = (await call("GET", "/api/bootstrap")).data;
    expect(b.mode).toBe("local");
    expect(b.program).toMatchObject({ templateId: "stronglifts", startDate: "2026-10-19T00:00:00Z" });
    expect(b.settings.trainingDays).toEqual([0, 2, 4]);
    // no workouts yet: template defaults
    expect((await call("GET", "/api/app/programs/531")).data.basis).toBe("defaults");
  });

  it("live mode", async () => {
    const r = await call("POST", "/api/app/programs/nsuns5/start", { trainingMaxes: { bench: 200 } }, liveEnv);
    expect(r.status).toBe(200);
    expect(r.data.program.program.templateId).toBe("nsuns5");
    const b = (await call("GET", "/api/bootstrap", undefined, liveEnv)).data;
    expect(b.mode).toBe("live");
    expect(b.program.trainingMaxes.bench).toBe(200);
    expect((await call("GET", "/api/app/programs/nsuns5", undefined, liveEnv)).data.basis).toBe("active");
  });
});
