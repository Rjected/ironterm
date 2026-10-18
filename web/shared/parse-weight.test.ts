import { describe, expect, it } from "vitest";
import { parseWeightInput } from "./units";

describe("parseWeightInput (LOG WEIGHT)", () => {
  it("reads what people type", () => {
    expect(parseWeightInput("82.5")).toBe(82.5);
    expect(parseWeightInput("82,5")).toBe(82.5);
    expect(parseWeightInput(" 180 lb ")).toBe(180);
    expect(parseWeightInput("80kg")).toBe(80);
    expect(parseWeightInput("0")).toBe(0); // removes that day's weigh-in
  });
  it("refuses junk instead of sending NaN (which used to delete that day's weigh-in)", () => {
    for (const s of ["", "abc", "-80", "8O", "1e3", "80.5.1", "NaN", "Infinity"]) expect(parseWeightInput(s), s).toBeNull();
  });
});
