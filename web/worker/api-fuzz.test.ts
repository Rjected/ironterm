// Every endpoint, fed malformed bodies: a client mistake is a 4xx, never a 500, and never leaves
// state behind that breaks later requests.
import { describe, expect, it } from "vitest";
import worker from "./index";
import { NodeD1 } from "../server/d1";
import { kvPut } from "./store";

const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as never;

async function call(env: unknown, method: string, path: string, body?: string) {
  const r = await worker.fetch!(new Request(`http://localhost${path}`, { method, headers: { "content-type": "application/json" }, body }) as never, env as never, ctx);
  return { status: r.status, text: await r.text() };
}

const ROUTES: [string, string][] = [
  ["PUT", "/api/mode"], ["POST", "/api/import/strong"], ["PUT", "/api/workouts/x/notes"],
  ["POST", "/api/app/programs/gzclp/start"], ["POST", "/api/app/gym/start"], ["POST", "/api/tokens"],
  ["PUT", "/api/settings"], ["PUT", "/api/program"], ["PUT", "/api/live"], ["POST", "/api/live/finish"],
  ["PUT", "/api/trips"], ["POST", "/api/weighin"], ["POST", "/api/login"], ["POST", "/api/hevy/webhook"],
];
const BODIES = ["", "{", "null", "[]", '"x"', "42", "true", "{}", '{"a":1}', '{"mode":null}', '{"description":1,"exercises":[1]}',
  '{"id":"s","exercises":[null]}', '{"id":"s","exercises":[{"sets":null}]}', '{"tz":"Not/A_Zone"}', '{"unit":"stone"}', '{"date":5,"kg":"a"}',
  '{"csv":5}', '{"templateId":"nope"}', '[{"start":5}]', '{"dayIndex":"x"}', '{"trainingDays":"x","bodyweight":"heavy"}'];
const READS = ["/api/snapshot"];

describe("API validation", () => {
  it("rejects a bad time zone with a reason, and survives one already stored", async () => {
    const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" };
    const r = await call(env, "PUT", "/api/settings", '{"tz":"America/New Yrok"}');
    expect(r.status).toBe(400);
    expect(JSON.parse(r.text).error).toMatch(/time zone/);
    expect(JSON.parse((await call(env, "PUT", "/api/settings", '{"tz":"Europe/Berlin","unit":"kg"}')).text)).toMatchObject({ tz: "Europe/Berlin", unit: "kg" });
    // stored by an older version: fall back instead of failing every request
    await kvPut(env.DB as never, "demo:settings", { unit: "kg", tz: "Not/A_Zone" });
    const b = await call(env, "GET", "/api/bootstrap");
    expect(b.status).toBe(200);
    expect(JSON.parse(b.text).settings.tz).toBe("America/New_York");
  });

  it("checks program, weigh-in, trips and day index shapes", async () => {
    const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" };
    expect((await call(env, "PUT", "/api/program", '{"templateId":"nope","unit":"lb","startDate":"2026-01-01"}')).status).toBe(400);
    expect((await call(env, "PUT", "/api/program", "null")).status).toBe(200);
    expect((await call(env, "POST", "/api/weighin", '{"date":"2026-10-01","kg":"80"}')).status).toBe(400);
    expect((await call(env, "POST", "/api/weighin", '{"date":"2026-10-01","kg":80}')).status).toBe(200);
    expect((await call(env, "PUT", "/api/trips", '[{"id":"t","start":"2026-10-01"}]')).status).toBe(400);
    expect((await call(env, "POST", "/api/app/gym/start", '{"dayIndex":99}')).status).toBe(400);
    expect((await call(env, "POST", "/api/app/gym/start", '{"dayIndex":0}')).status).toBe(200);
  });
});

describe("API malformed bodies", () => {
  for (const mode of ["demo", "local"] as const) {
    it(`never 500s and stays usable (${mode})`, async () => {
      const env = { DB: new NodeD1(":memory:"), TIMEZONE: "America/New_York" };
      const reset = () => (mode === "local" ? call(env, "PUT", "/api/mode", '{"mode":"local"}') : null);
      await reset();
      const bad: string[] = [];
      for (const [m, p] of ROUTES) for (const body of BODIES) {
        const r = await call(env, m, p, body);
        if (r.status >= 500) bad.push(`${m} ${p} ${body} -> ${r.status} ${r.text}`);
        // the app must still load after anything that was accepted (a 4xx stores nothing)
        if (r.status < 400) for (const g of READS) {
          const after = await call(env, "GET", g);
          if (after.status !== 200) { bad.push(`after ${m} ${p} ${body}: GET ${g} -> ${after.status} ${after.text.slice(0, 200)}`); break; }
        }
        await reset();
      }
      expect(bad).toEqual([]);
    }, 120_000);
  }
});
