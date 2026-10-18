import { describe, expect, it } from "vitest";
import type { Bootstrap } from "../../src/api";
import { demoData } from "../../shared/demo";
import { buildFeed, buildProfile } from "./build";
import { compare } from "./owner";
import { feedFrom, profileFrom } from "./sanitize";
import type { FeedItem } from "./types";

const today = "2026-10-15";
const demo = demoData(today);
const b: Bootstrap = {
  mode: "local", auth: "none", settings: { unit: "lb", tz: "America/New_York", autoPush: false, graphMetric: "volume", bodyweight: 185 } as Bootstrap["settings"],
  program: demo.config, workouts: demo.workouts, sync: { cursor: null } as Bootstrap["sync"], today, trips: [],
};
const who = { server: "https://a.test", handle: "sam", name: "Sam" };
const roundTrip = <T>(x: T) => JSON.parse(JSON.stringify(x)) as T;

describe("peer responses", () => {
  it("leaves what a real server sends unchanged, at every share level", () => {
    for (const share of ["basic", "lifts", "full"] as const) {
      const p = roundTrip(buildProfile(b, share, who));
      expect(profileFrom(p)).toEqual(p);
      const items = roundTrip(buildFeed(b, share).slice(0, 60)).map((it) => ({
        ...it, reactions: [{ emoji: "💪", from: [{ server: "https://b.test", name: "Bo" }] }],
        comments: [{ id: "c1", from: { server: "https://b.test", name: null }, text: "nice", at: "2026-10-14T10:00:00.000Z" }],
      })) as FeedItem[];
      const page = { items, next: "x", share, unit: share === "basic" ? null : "lb" } as const;
      expect(feedFrom(page)).toEqual(page);
    }
  });

  it("turns junk into empty values instead of crashing compare and the merged feed", () => {
    const junk = {
      share: 5, unit: "stone", streak: "long", week: null, sessions52: -3, graph: { start: "soon", levels: "xxxx" },
      lifts: [null, { key: 7 }, { key: "squat", e1rm: "big", best: Infinity }], bodyweight: "heavy", updatedAt: 0,
    };
    const p = profileFrom(junk);
    expect(p).toMatchObject({ share: "basic", unit: null, streak: { current: 0, best: 0 }, sessions52: 0, graph: { levels: [] }, bodyweight: null });
    expect(p.lifts).toEqual([{ key: "squat", name: "squat", e1rm: null, best: null }]);
    const mine = buildProfile(b, "full", who);
    expect(() => compare(mine, p, { id: "f", server: "https://b.test", handle: null, name: null }, { myBw: 185, iShareFull: true })).not.toThrow();

    const f = feedFrom({ items: [null, 4, { id: "a" }, { id: "b", at: "2026-10-01T00:00:00Z", kind: "session", exercises: "no", reactions: [{ emoji: "<script>", from: [] }] },
      { id: "c", at: "2026-10-02T00:00:00Z", kind: "teleport" }, { id: "d", at: { $date: 1 }, kind: "pr", lift: "squat" }], next: 9 });
    expect(f.items.map((i) => i.id)).toEqual(["b"]);
    expect(f.items[0]).toMatchObject({ kind: "session", title: "Workout", exercises: [], reactions: [] });
    expect(f.next).toBeNull();
  });

  it("rejects a response that isn't a profile or a feed at all", () => {
    for (const x of [null, [], "x", 3]) expect(() => profileFrom(x)).toThrow(/malformed profile/);
    for (const x of [null, {}, { items: {} }]) expect(() => feedFrom(x)).toThrow(/malformed feed/);
  });
});
