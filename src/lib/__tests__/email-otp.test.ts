import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeCode,
  OTP_DIGITS,
  OTP_EXPIRY_MINUTES,
  issueEmailOtp,
  verifyEmailOtp,
} from "@/lib/email-otp";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOtpEmail } from "@/lib/email";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOtpEmail: vi.fn() }));

/* ---------------------------------------------------------------- helpers -- */

type Row = {
  user_id: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
};

/** In-memory stand-in for the `admin_email_otp_codes` table. */
const rows = new Map<string, Row>();

/**
 * Minimal Supabase query-builder stub covering the calls email-otp.ts makes:
 *   upsert(...)                     → insert/overwrite a row (awaited)
 *   select(...).eq(...).maybeSingle → read one row (verify)
 *   update(...).eq(...).is(...)     → consume the row (awaited)
 */
function makeAdminStub() {
  let queriedUserId: string | null = null;

  const builder = {
    select: () => builder,
    eq: (_column: string, value: string) => {
      queriedUserId = value;
      return builder;
    },
    is: () => builder,
    update: (values: Partial<Row>) => {
      if (queriedUserId) {
        const row = rows.get(queriedUserId);
        if (row) rows.set(queriedUserId, { ...row, ...values });
      }
      return builder;
    },
    upsert: (values: Row) => {
      rows.set(values.user_id, { ...values });
      return builder;
    },
    maybeSingle: () =>
      Promise.resolve({
        data: queriedUserId ? (rows.get(queriedUserId) ?? null) : null,
        error: null,
      }),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: null, error: null }),
  };

  return { from: () => builder };
}

vi.mocked(createAdminClient).mockReturnValue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  makeAdminStub() as any
);

function seedRow(overrides: Partial<Row> = {}) {
  const row: Row = {
    user_id: "user-1",
    code_hash: hashOtpCode("12345"),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    consumed_at: null,
    ...overrides,
  };
  rows.set("user-1", row);
  return row;
}

beforeEach(() => {
  rows.clear();
  vi.mocked(sendOtpEmail).mockReset();
  vi.mocked(sendOtpEmail).mockResolvedValue({ ok: true });
});

/* ------------------------------------------------------------------ tests -- */

describe("normalizeCode", () => {
  it("strips non-digits", () => {
    expect(normalizeCode(" 123-45 ")).toBe("12345");
    expect(normalizeCode("1 2 3 4 5")).toBe("12345");
  });
});

describe("generateOtpCode", () => {
  it("produces a zero-padded 5-digit code in range", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{5}$/);
      const value = Number(code);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(99999);
    }
  });

  it("uses the configured digit count", () => {
    expect(OTP_DIGITS).toBe(5);
  });
});

describe("hashOtpCode", () => {
  it("is a sha-256 hex digest of the code", () => {
    expect(hashOtpCode("12345")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different codes", () => {
    expect(hashOtpCode("12345")).not.toBe(hashOtpCode("12346"));
  });

  it("is deterministic", () => {
    expect(hashOtpCode("12345")).toBe(hashOtpCode("12345"));
  });
});

describe("issueEmailOtp", () => {
  it("emails a code and stores only its hash", async () => {
    const sent = await issueEmailOtp({ userId: "user-1", email: "a@b.c", purpose: "test" });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    expect(sendOtpEmail).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendOtpEmail).mock.calls[0][0];
    expect(call.to).toBe("a@b.c");
    expect(call.code).toMatch(/^\d{5}$/);
    expect(call.purpose).toBe("test");
    expect(call.expiresInMinutes).toBe(OTP_EXPIRY_MINUTES);

    const row = rows.get("user-1")!;
    expect(row.user_id).toBe("user-1");
    expect(row.code_hash).toBe(hashOtpCode(call.code));
    expect(row.consumed_at).toBeNull();
    // Expiry is now + 10 minutes (with a little scheduling slack).
    const deltaMs = new Date(row.expires_at).getTime() - Date.now();
    expect(deltaMs).toBeGreaterThan((OTP_EXPIRY_MINUTES - 1) * 60_000);
    expect(deltaMs).toBeLessThanOrEqual(OTP_EXPIRY_MINUTES * 60_000);
    // The plain code must never be persisted.
    expect(JSON.stringify(row)).not.toContain(call.code);
  });

  it("invalidates a previous code by overwriting the row", async () => {
    seedRow({ code_hash: hashOtpCode("99999") });
    await issueEmailOtp({ userId: "user-1", email: "a@b.c", purpose: "test" });
    expect(rows.get("user-1")!.code_hash).not.toBe(hashOtpCode("99999"));
  });

  it("still overwrites the stored code when the email send fails", async () => {
    vi.mocked(sendOtpEmail).mockResolvedValue({ ok: false, error: "boom" });
    seedRow({ code_hash: hashOtpCode("99999") });
    const sent = await issueEmailOtp({ userId: "user-1", email: "a@b.c", purpose: "test" });
    expect(sent.ok).toBe(false);
    if (sent.ok) return;
    expect(sent.error).toContain("boom");
    expect(rows.get("user-1")!.code_hash).not.toBe(hashOtpCode("99999"));
  });
});

describe("verifyEmailOtp", () => {
  it("accepts the matching code and consumes the row", async () => {
    seedRow();
    const result = await verifyEmailOtp("user-1", "12345");
    expect(result.ok).toBe(true);
    expect(rows.get("user-1")!.consumed_at).not.toBeNull();
  });

  it("accepts a code with spaces/dashes after normalization", async () => {
    seedRow();
    expect((await verifyEmailOtp("user-1", "1 23-45")).ok).toBe(true);
  });

  it("rejects a wrong code without consuming", async () => {
    seedRow();
    const result = await verifyEmailOtp("user-1", "54321");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/incorrect/i);
    expect(rows.get("user-1")!.consumed_at).toBeNull();
  });

  it("rejects a code of the wrong length", async () => {
    seedRow();
    expect((await verifyEmailOtp("user-1", "1234")).ok).toBe(false);
    expect((await verifyEmailOtp("user-1", "123456")).ok).toBe(false);
  });

  it("rejects a consumed code", async () => {
    seedRow({ consumed_at: new Date().toISOString() });
    const result = await verifyEmailOtp("user-1", "12345");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already used/i);
  });

  it("rejects an expired code", async () => {
    seedRow({ expires_at: new Date(Date.now() - 60_000).toISOString() });
    const result = await verifyEmailOtp("user-1", "12345");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expired/i);
  });

  it("rejects when no code was requested", async () => {
    const result = await verifyEmailOtp("user-1", "12345");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no code was requested/i);
  });

  it("finds nothing for a different user", async () => {
    seedRow({ user_id: "someone-else" });
    rows.delete("user-1");
    const result = await verifyEmailOtp("user-1", "12345");
    expect(result.ok).toBe(false);
  });
});
