import { describe, expect, it } from "vitest";
import {
  cn,
  formatDateTime,
  generateReference,
  normalizeKenyanPhone,
  slugify,
} from "@/lib/utils";

describe("normalizeKenyanPhone", () => {
  it("normalises common formats to 2547XXXXXXXX / 2541XXXXXXXX", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254 712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("254712345678")).toBe("254712345678");
    expect(normalizeKenyanPhone("0112 345 678")).toBe("254112345678");
  });

  it("returns null for invalid input", () => {
    expect(normalizeKenyanPhone("")).toBeNull();
    expect(normalizeKenyanPhone("12345")).toBeNull();
    expect(normalizeKenyanPhone("0812345678")).toBeNull();
  });
});

describe("generateReference", () => {
  it("uses only unambiguous characters and honours the prefix/length", () => {
    expect(generateReference("FC-", 6)).toMatch(/^FC-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("produces a different value on each call", () => {
    expect(generateReference("", 10)).not.toBe(generateReference("", 10));
  });
});

describe("cn", () => {
  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("ignores falsey values", () => {
    expect(cn("text-sm", false, undefined, "font-bold")).toBe("text-sm font-bold");
  });
});

describe("slugify", () => {
  it("converts names into URL-safe slugs", () => {
    expect(slugify("Streaky Bacon")).toBe("streaky-bacon");
    expect(slugify("  Farmer's Choice Beef Sausages! ")).toBe("farmer-s-choice-beef-sausages");
    expect(slugify("Bacon & Ham")).toBe("bacon-ham");
  });

  it("strips accents and collapses repeats", () => {
    expect(slugify("Crème Fraîche --- Special")).toBe("creme-fraiche-special");
    expect(slugify("---"));
    expect(slugify("---")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("formats an ISO string without throwing", () => {
    expect(formatDateTime("2026-09-20T10:30:00.000Z")).toMatch(/2026/);
  });
});
