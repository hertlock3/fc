import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  currentStep,
  generateTotpSecret,
  hotp,
  totpAtStep,
  verifyTotpCode,
} from "../totp";

/**
 * RFC 4226 test vectors — SHA-1, secret "12345678901234567890"
 * (base32: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
 */
const RFC_KEY = Buffer.from("12345678901234567890", "ascii");
const RFC_HOTP = [
  "755224", // counter 0
  "287082", // 1
  "359152", // 2
  "969429", // 3
  "338314", // 4
  "254676", // 5
  "287922", // 6
  "162583", // 7
  "399871", // 8
  "520489", // 9
];

describe("base32", () => {
  it("round-trips bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(Buffer.from(base32Decode(base32Encode(bytes)))).toEqual(Buffer.from(bytes));
  });

  it("decodes the RFC 4226 example secret", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")).toEqual(RFC_KEY);
  });

  it("is case- and padding-insensitive on decode", () => {
    expect(base32Decode("gezdgnbvgy3tqojqgezdgnbvgy3tqojq====")).toEqual(RFC_KEY);
  });

  it("rejects non-alphabet characters", () => {
    expect(() => base32Decode("not-base32!")).toThrow(/base32/);
  });
});

describe("hotp (RFC 4226 vectors)", () => {
  RFC_HOTP.forEach((expected, counter) => {
    it(`counter ${counter} → ${expected}`, () => {
      expect(hotp(RFC_KEY, counter)).toBe(expected);
    });
  });
});

describe("totp (RFC 6238)", () => {
  // T = 59 s → step 1 → same HOTP counter as vector 1.
  it("matches the RFC 6238 T=59 vector (8 digits truncated to 6 by our config)", () => {
    // RFC 6238 uses 8 digits: 94287082 for T=59. Our 6-digit truncation of
    // step 1 equals the HOTP vector at counter 1 (287082).
    expect(totpAtStep(base32Encode(RFC_KEY), 1)).toBe("287082");
  });

  it("floors time into 30 s steps", () => {
    expect(currentStep(59_000)).toBe(1);
    expect(currentStep(60_000)).toBe(2);
    expect(currentStep(89_999)).toBe(2);
    expect(currentStep(90_000)).toBe(3);
  });
});

describe("verifyTotpCode", () => {
  const secret = base32Encode(RFC_KEY);

  it("accepts the current code", () => {
    const step = currentStep(1_000_000_000_000);
    const code = totpAtStep(secret, step);
    expect(verifyTotpCode(secret, code, { nowMs: 1_000_000_000_000 })).toEqual({
      ok: true,
      usedStep: step,
    });
  });

  it("accepts ±1 step of clock drift", () => {
    const step = currentStep(2_000_000_000_000);
    const code = totpAtStep(secret, step - 1); // code from the previous window
    expect(verifyTotpCode(secret, code, { nowMs: 2_000_000_000_000 }).ok).toBe(true);
  });

  it("rejects a code outside the drift window", () => {
    const step = currentStep(3_000_000_000_000);
    const code = totpAtStep(secret, step - 5);
    const result = verifyTotpCode(secret, code, { nowMs: 3_000_000_000_000 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Incorrect or expired/);
  });

  it("refuses an already-used step (replay guard)", () => {
    const step = currentStep(4_000_000_000_000);
    const code = totpAtStep(secret, step);
    expect(
      verifyTotpCode(secret, code, { nowMs: 4_000_000_000_000, lastUsedStep: step }).ok
    ).toBe(false);
  });

  it("refuses a code older than the last used step", () => {
    const step = currentStep(5_000_000_000_000);
    const code = totpAtStep(secret, step - 1);
    expect(
      verifyTotpCode(secret, code, { nowMs: 5_000_000_000_000, lastUsedStep: step }).ok
    ).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    expect(verifyTotpCode(secret, "").ok).toBe(false);
    expect(verifyTotpCode(secret, "abcdef").ok).toBe(false);
    expect(verifyTotpCode(secret, "12345").ok).toBe(false);
    expect(verifyTotpCode("!!not-base32!!", "123456").ok).toBe(false);
  });
});

describe("enrollment helpers", () => {
  it("generates 32-char base32 secrets (20 bytes)", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("builds an otpauth URI with explicit algorithm/digits/period", () => {
    const uri = buildOtpauthUri({
      secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
      accountEmail: "admin@example.com",
      issuerName: "Farmer's Choice Market",
    });
    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
