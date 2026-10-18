import { expect, it } from "vitest";
import { whoopFor } from "./whoop";

it("matches WHOOP workouts to Hevy sessions by time overlap", () => {
  const ws = [
    { id: "a", start: "2026-10-06T15:00:00Z", end: "2026-10-06T15:50:00Z", sport: "weightlifting", avgHr: 118 },
    { id: "b", start: "2026-10-06T18:00:00Z", end: "2026-10-06T18:30:00Z", sport: "running" },
  ];
  expect(whoopFor(ws, "2026-10-06T15:06:06Z", "2026-10-06T15:41:57Z")?.id).toBe("a");
  expect(whoopFor(ws, "2026-10-06T16:00:00Z", "2026-10-06T17:00:00Z")).toBeUndefined();
});
