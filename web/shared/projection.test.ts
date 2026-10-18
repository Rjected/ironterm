import { describe, expect, it } from "vitest";
import { projectLift } from "./projection";
import { addDays, type LiftPoint } from "./stats";

const P = (date: string, e1: number): LiftPoint => ({ date, workoutId: date, e1rm: e1, topWeight: e1, topReps: 1, volume: e1, sets: [{ weight: e1, reps: 1 }] });
/** sessions every `step` days from `start`, e1RM = f(i) */
const series = (start: string, n: number, f: (i: number) => number, step = 3) => Array.from({ length: n }, (_, i) => P(addDays(start, i * step), f(i)));

describe("projectLift", () => {
  const noise = [0, 1.5, -1, 2, -2, 0.5, -0.5, 1, -1.5, 0];
  it("recovers a linear trend and answers whenReach", () => {
    // +1 lb per session every 3.5 days = 2 lb/week, from 300
    const pts = series("2026-01-05", 40, (i) => 300 + i + noise[i % 10], 3);
    const today = pts[pts.length - 1].date;
    const pr = projectLift(pts, today, { weeks: 8 });
    expect(pr.status).toBe("ok");
    expect(pr.slopePerWeek!).toBeGreaterThan(1.5);
    expect(pr.slopePerWeek!).toBeLessThan(2.6);
    expect(pr.band.length).toBe(9);
    for (const b of pr.band) { expect(b.lo).toBeLessThanOrEqual(b.mid); expect(b.hi).toBeGreaterThanOrEqual(b.mid); }
    expect(pr.fit[pr.fit.length - 1].date).toBe(addDays(today, 56));
    const r = pr.whenReach(pr.current! + 20)!;
    expect(r.days).toBeGreaterThan(50);
    expect(r.days).toBeLessThan(110);
    expect(r.early <= r.date && (r.late == null || r.date <= r.late)).toBe(true);
    expect(pr.whenReach(pr.current! - 10)!.days).toBe(0);
    // deterministic with a seed
    expect(projectLift(pts, today, { weeks: 8 }).band).toEqual(pr.band);
  });
  it("flat or falling trend → whenReach null", () => {
    const pts = series("2026-01-05", 30, (i) => 300 - i * 0.3 + noise[i % 10]);
    const pr = projectLift(pts, pts[pts.length - 1].date);
    expect(pr.status).toBe("flat");
    expect(pr.whenReach(400)).toBeNull();
  });
  it("only uses the block after the last >4-week gap", () => {
    const old = series("2025-01-01", 30, (i) => 400 - i * 3); // strong but falling, then a layoff
    const cur = series("2025-08-01", 20, (i) => 250 + i * 1.5);
    const pr = projectLift([...old, ...cur], cur[cur.length - 1].date);
    expect(pr.blockStart).toBe("2025-08-01");
    expect(pr.points.length).toBe(20);
    expect(pr.status).toBe("ok");
    expect(pr.slopePerWeek!).toBeGreaterThan(2);
  });
  it("inactive and insufficient", () => {
    const pts = series("2026-01-05", 20, (i) => 300 + i);
    expect(projectLift(pts, addDays(pts[19].date, 40)).status).toBe("inactive");
    expect(projectLift(pts.slice(0, 3), pts[2].date).status).toBe("insufficient");
    expect(projectLift([], "2026-01-01").status).toBe("insufficient");
  });
  it("log model slows down", () => {
    const pts = series("2026-01-05", 40, (i) => 300 + 20 * Math.log(1 + (i * 3) / 28));
    const today = pts[pts.length - 1].date;
    const lin = projectLift(pts, today, { model: "linear" });
    const log = projectLift(pts, today, { model: "log" });
    expect(log.projected! - log.current!).toBeLessThan(lin.projected! - lin.current!);
    expect(log.model).toBe("log");
  });
});
