import { describe, expect, it } from "vitest";
import { bestAt } from "../src/derive";

// GZCLP-style: the same lift heavy (T1) one day and light (T2) a few days later.
const pts = [
  { date: "2026-09-01", e1rm: 300 }, { date: "2026-09-04", e1rm: 200 },
  { date: "2026-09-08", e1rm: 305 }, { date: "2026-09-11", e1rm: 205 },
  { date: "2026-10-06", e1rm: 320 }, { date: "2026-10-09", e1rm: 210 },
];

describe("bestAt (DASHBOARD e1RM)", () => {
  it("is the 28-day best, so a light day doesn't read as a 35% drop", () => {
    expect(bestAt(pts, "2026-10-10")).toBe(320);
    expect(bestAt(pts, "2026-09-12")).toBe(305);
  });
  it("is null with no session in the window", () => {
    expect(bestAt(pts, "2026-10-05")).toBe(305);
    expect(bestAt([{ date: "2026-08-01", e1rm: 300 }], "2026-10-05")).toBe(null);
    expect(bestAt([], "2026-10-05")).toBe(null);
    expect(bestAt(pts, "2026-08-01")).toBe(null);
  });
  it("counts the window's last day but not the day 28 days back", () => {
    expect(bestAt(pts, "2026-09-29")).toBe(305); // 09-01 is out, 09-08 in
    expect(bestAt(pts, "2026-09-28")).toBe(305);
    expect(bestAt([{ date: "2026-09-01", e1rm: 1 }], "2026-09-29")).toBe(null);
  });
});
