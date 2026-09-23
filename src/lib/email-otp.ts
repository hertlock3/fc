import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOtpEmail } from "./email";

/**
 * **Email one-time codes** for sensitive admin actions (M-Pesa paybill
 * changes) — the replacement for the TOTP authenticator flow.
 *
 * Flow (see /api/admin/paybill):
 *   1. `issueEmailOtp` — server generates a random 5-digit code, emails it to
 *      the signed-in admin's account address and stores only a SHA-256 hash
 *      in `admin_email_otp_codes`.
 *   2. `verifyEmailOtp` — the admin types the code from their inbox; a match
 *      consumes the row (single-use) and the sensitive change is applied.
 *
 * Security properties:
 *   * Codes are 5 random digits (crypto-random, not `Math.random`).
 *   * Only the hash is stored — a DB leak does not reveal live codes.
 *   * 10-minute expiry, single-use, and issuing a new code invalidates the
 *     previous one (one live code per admin at a time).
 *   * Brute-force is capped by the route's rate limiter (5 guesses / 5 min).
 */

export const OTP_DIGITS = 5;
/** How long a code stays valid. */
export const OTP_EXPIRY_MINUTES = 10;

/** Normalise user input: strip spaces/dashes, keep digits. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, "");
}

/** Crypto-random 5-digit code, zero-padded (00000–99999). */
export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, "0");
}

/** SHA-256 of the code — the only form ever persisted. */
export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/** Constant-time comparison so timing cannot leak the expected code. */
function codesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

interface OtpRow {
  user_id: string;
  code_hash: string;
  expires_at: string;
  consumed_at: string | null;
}

export type IssueOtpResult =
  | { ok: true; expiresAt: string; emailedTo: string }
  | { ok: false; error: string };

/**
 * Generate a code, email it to the admin and persist its hash. Any previous
 * unconsumed code for this admin is overwritten (invalidated).
 */
export async function issueEmailOtp(params: {
  userId: string;
  email: string;
  purpose: string;
}): Promise<IssueOtpResult> {
  const code = generateOtpCode();
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();

  // Upsert: one live code per admin. Overwriting the hash/expiry invalidates
  // any previous code even if the email send below fails.
  const admin = createAdminClient();
  const { error: upsertError } = await admin.from("admin_email_otp_codes").upsert(
    {
      user_id: params.userId,
      code_hash: codeHash,
      expires_at: expiresAt,
      consumed_at: null,
      // Set explicitly: Postgres defaults only fire on INSERT, not on the
      // conflict-update path, so re-issuing a code would leave a stale value.
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (upsertError) {
    return { ok: false, error: `Could not store the code: ${upsertError.message}` };
  }

  const sent = await sendOtpEmail({
    to: params.email,
    code,
    purpose: params.purpose,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });
  if (!sent.ok) {
    return {
      ok: false,
      error: `Could not send the email: ${sent.error ?? "unknown error"}`,
    };
  }

  return { ok: true, expiresAt, emailedTo: params.email };
}

export interface VerifyOtpResult {
  ok: boolean;
  error?: string;
}

/**
 * Check a user-supplied code against the stored hash and consume the row on
 * success. A consumed or expired code is rejected.
 */
export async function verifyEmailOtp(userId: string, code: string): Promise<VerifyOtpResult> {
  const normalized = normalizeCode(code);
  if (normalized.length !== OTP_DIGITS) {
    return { ok: false, error: `Enter the ${OTP_DIGITS}-digit code from your email.` };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_email_otp_codes")
    .select("user_id, code_hash, expires_at, consumed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false, error: `Could not check the code: ${error.message}` };
  if (!data) return { ok: false, error: "No code was requested — ask for one first." };

  const row = data as OtpRow;
  if (row.consumed_at) return { ok: false, error: "That code was already used — request a new one." };

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "That code has expired — request a new one." };
  }

  if (!codesEqual(hashOtpCode(normalized), row.code_hash)) {
    return { ok: false, error: "Incorrect code. Check your latest email and try again." };
  }

  // Consume the code so it cannot be reused.
  const { error: consumeError } = await admin
    .from("admin_email_otp_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("consumed_at", null);
  if (consumeError) {
    return { ok: false, error: `Could not record code usage: ${consumeError.message}` };
  }

  return { ok: true };
}
