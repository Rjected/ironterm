import { describe, expect, it } from "vitest";
import { addDays, localDate } from "./stats";

// the slow originals these must match exactly (they ran in every view's loops; see stats.ts)
const refAddDays = (date: string, n: number) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const refLocalDate = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const outcome = (f: () => string) => { try { return f(); } catch (e) { return `throws ${(e as Error).name}`; } };

describe("addDays", () => {
  it("matches the Date-based original, edges and garbage included", () => {
    const dates = ["2026-10-18", "2024-02-28", "2024-02-29", "2023-12-31", "2000-01-01", "1999-12-31", "0001-01-01", "0099-06-15", "9999-12-31",
      "0000-01-01", "2026-13-01", "2026-02-30", "2026-00-10", "2026-10-18T05:00:00Z", "", "garbage!!!", "20261018"];
    for (const d of dates) for (const n of [-1000, -366, -365, -31, -1, 0, 1, 28, 31, 365, 366, 1000]) expect(outcome(() => addDays(d, n))).toBe(outcome(() => refAddDays(d, n)));
  });
});

describe("localDate", () => {
  it("matches a fresh formatter, across zones and repeated calls", () => {
    const isos = ["2026-10-21T03:30:00Z", "2026-10-20T23:59:59Z", "2026-03-08T07:30:00Z", "2026-11-01T05:30:00Z", "2024-02-29T12:00:00Z"];
    for (let round = 0; round < 2; round++) for (const tz of ["America/New_York", "Asia/Kolkata", "Pacific/Kiritimati", "UTC"]) for (const iso of isos) expect(localDate(iso, tz)).toBe(refLocalDate(iso, tz));
  });
  it("still throws for an unknown zone (callers fall back on that)", () => {
    expect(() => localDate("2026-10-21T03:30:00Z", "Not/AZone")).toThrow(RangeError);
    expect(() => localDate("2026-10-21T03:30:00Z", "Not/AZone")).toThrow(RangeError);
  });
});
