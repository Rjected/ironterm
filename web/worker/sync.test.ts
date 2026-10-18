// Hevy sync: an events catch-up longer than one run must not skip pages.
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeD1 } from "../server/d1";
import { sync, type SyncState } from "./sync";
import { allWorkouts, ensureSchema, kvGet, kvPut } from "./store";

const workout = (id: string) => ({ id, title: id, start_time: "2026-01-01T10:00:00Z", end_time: "2026-01-01T11:00:00Z", updated_at: "2026-01-01T11:00:00Z", exercises: [] });

/** A fake Hevy whose /workouts/events has `pages` pages of one updated workout each. */
function fakeHevy(pages: number, failAt?: number) {
  const seen: { page: number; since: string }[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    const u = new URL(input);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.pathname.endsWith("/workouts/events")) {
      const page = Number(u.searchParams.get("page"));
      seen.push({ page, since: u.searchParams.get("since")! });
      if (page === failAt) return new Response("boom", { status: 503 });
      return json({ page, page_count: pages, events: page <= pages ? [{ type: "updated", workout: workout(`w${page}`) }] : [] });
    }
    if (u.pathname.endsWith("/body_measurements")) return json({ page: 1, page_count: 1, body_measurements: [] });
    return new Response("not found", { status: 404 });
  });
  return seen;
}

async function db(cursor: string) {
  const d = new NodeD1(":memory:") as unknown as D1Database;
  await ensureSchema(d);
  await kvPut(d, "sync", { cursor } satisfies SyncState);
  return d;
}

describe("sync events catch-up", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("a catch-up longer than one run carries on where it stopped and only then moves the cursor", async () => {
    const d = await db("2026-01-01T00:00:00Z");
    const seen = fakeHevy(95);
    let st = await sync(d, "k");
    expect(st.cursor).toBe("2026-01-01T00:00:00Z"); // not advanced past unfetched pages
    expect(st.catchup?.page).toBe(41);
    st = await sync(d, "k");
    expect(st.cursor).toBe("2026-01-01T00:00:00Z");
    st = await sync(d, "k");
    expect(st.catchup).toBeUndefined();
    expect(st.cursor).not.toBe("2026-01-01T00:00:00Z");
    // every page fetched exactly once, all against the old cursor
    expect(seen.map((s) => s.page)).toEqual(Array.from({ length: 95 }, (_, i) => i + 1));
    expect(new Set(seen.map((s) => s.since))).toEqual(new Set(["2026-01-01T00:00:00Z"]));
    expect((await allWorkouts(d)).length).toBe(95);
  });

  it("a failed page keeps the cursor and retries from that page", async () => {
    const d = await db("2026-01-01T00:00:00Z");
    fakeHevy(5, 3);
    const st = await sync(d, "k");
    expect(st.error).toMatch(/503/);
    expect(st.cursor).toBe("2026-01-01T00:00:00Z");
    expect((await kvGet<SyncState>(d, "sync"))?.catchup?.page).toBe(3);
    const seen = fakeHevy(5);
    const st2 = await sync(d, "k");
    expect(st2.error).toBeUndefined();
    expect(st2.catchup).toBeUndefined();
    expect(seen.map((s) => s.page)).toEqual([3, 4, 5]);
  });

  it("a short catch-up still finishes in one run", async () => {
    const d = await db("2026-01-01T00:00:00Z");
    fakeHevy(3);
    const st = await sync(d, "k");
    expect(st.catchup).toBeUndefined();
    expect(st.cursor).not.toBe("2026-01-01T00:00:00Z");
  });
});
