import { describe, expect, it } from "vitest";
import { applyPercent, formatMoney, toWholeShilling } from "@/lib/money";

describe("applyPercent", () => {
  it("computes a 5% fee and rounds to the nearest cent", () => {
    expect(applyPercent(100000, 5)).toBe(5000);
    expect(applyPercent(33333, 5)).toBe(1667); // 1666.65 → 1667
  });

  it("returns 0 for a zero amount", () => {
    expect(applyPercent(0, 5)).toBe(0);
  });

  it("supports non-integer percentages", () => {
    expect(applyPercent(20000, 2.5)).toBe(500);
  });
});

describe("formatMoney", () => {
  it("formats cents as a KES string", () => {
    expect(formatMoney(125000)).toBe("KES 1,250.00");
  });

  it("can omit the symbol and decimals", () => {
    expect(formatMoney(125000, "KES", { withSymbol: false, decimals: false })).toBe(
      "1,250"
    );
  });
});

describe("toWholeShilling", () => {
  it("rounds cents to the nearest whole shilling (100 cents)", () => {
    expect(toWholeShilling(27450)).toBe(27500);
    expect(toWholeShilling(27440)).toBe(27400);
  });
});
