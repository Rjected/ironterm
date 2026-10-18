import { describe, expect, it } from "vitest";
import { fmtBig } from "./units";

describe("fmtBig", () => {
  it("reads like a person would say it", () => {
    expect(fmtBig(0)).toBe("0");
    expect(fmtBig(350)).toBe("350");
    expect(fmtBig(9400)).toBe("9,400");
    expect(fmtBig(66_140)).toBe("66.1k");
    expect(fmtBig(237_200)).toBe("237k");
    expect(fmtBig(999_400)).toBe("999k");
    expect(fmtBig(999_600)).toBe("1M");
    expect(fmtBig(1_901_200)).toBe("1.9M");
    expect(fmtBig(12_345_678)).toBe("12.3M");
  });
});
