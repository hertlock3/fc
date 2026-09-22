import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Minimal, dependency-free **RFC 6238 TOTP** (time-based one-time passwords)
 * for the admin second factor on sensitive actions (M-Pesa paybill changes).
 *
 * Interoperable with any RFC 6238 authenticator app — e.g.
 * [totp-cli](https://github.com/yitsushi/totp-cli), Google Authenticator,
 * Aegis, 1Password — which all compute the same 6-digit codes from a shared
 * base32 secret with a 30-second step.
 *
 * Why not Supabase email OTP? Hosted Supabase refuses auth emails to
 * non-team addresses without custom SMTP, and even with SMTP the mail path
 * proved unreliable (codes landing in spam / replaced by magic links). A
 * TOTP secret lives in the admin's authenticator app — nothing is delivered
 * at verification time, so there is no delivery to fail.
 *
 * Flow (see /api/admin/paybill):
 *   1. `startEnrollment` — server generates a base32 secret and returns an
 *      otpauth:// URI (rendered as a QR / shown as text to paste into the app).
 *      Secret is stored with enrollment='pending'.
 *   2. `confirmEnrollment` — admin types the code their app now shows; a
 *      valid code flips enrollment to 'confirmed'.
 *   3. `verifyTotp` — every sensitive change now requires a fresh code.
 *      Codes are single-use (replay guard) and ±1 step of clock drift is
 *      tolerated.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Accept codes from the previous, current and next 30 s window. */
const ALLOWED_DRIFT_STEPS = 1;

/* -------------------------------------------------------------------------- */
/* base32 (RFC 4648) — the encoding authenticator apps use for secrets        */
/* -------------------------------------------------------------------------- */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  if (clean.length === 0) throw new Error("Empty base32 secret.");
  if (!/^[A-Z2-7]+$/.test(clean)) {
    throw new Error("Secret is not valid base32 (A–Z, 2–7 only).");
  }
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/* -------------------------------------------------------------------------- */
/* HOTP (RFC 4226) — the counter-based primitive TOTP is built on             */
/* -------------------------------------------------------------------------- */

/** RFC 4226 dynamic truncation → `digits`-wide decimal code. */
export function hotp(key: Buffer, counter: number, digits = TOTP_DIGITS): string {
  // 8-byte big-endian counter.
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(counterBuf).digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** Current 30 s time-step (floor(unixTime / step)). */
export function currentStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpAtStep(secret: string, step: number): string {
  return hotp(base32Decode(secret), step);
}

/* -------------------------------------------------------------------------- */
/* Enrollment helpers                                                         */
/* -------------------------------------------------------------------------- */

/** Generate a fresh 20-byte secret, base32-encoded (32 chars, no padding). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/**
 * otpauth:// URI for authenticator apps. Apps show the issuer + account when
 * importing; secret, step and digits are all explicit so strict apps
 * (totp-cli, Aegis) configure identically.
 */
export function buildOtpauthUri(params: {
  secret: string;
  accountEmail: string;
  issuerName: string;
}): string {
  const label = encodeURIComponent(`${params.issuerName}:${params.accountEmail}`);
  const query = new URLSearchParams({
    secret: params.secret,
    issuer: params.issuerName,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

/** Constant-time string compare so timing cannot leak the expected code. */
function codesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface TotpVerifyResult {
  ok: boolean;
  error?: string;
  /** Set when ok — the consumed time-step, for the caller's replay guard. */
  usedStep?: number;
}

/**
 * Verify a user-supplied TOTP against the secret, tolerating ±1 step of clock
 * drift. Returns the matched step so the caller can persist it and refuse
 * reuse of the same code (`lastUsedStep`).
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  options: { lastUsedStep?: number | null; nowMs?: number } = {}
): TotpVerifyResult {
  const trimmed = code.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    return { ok: false, error: "Enter the 6-digit code from your authenticator." };
  }

  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return { ok: false, error: "Stored TOTP secret is invalid — re-enroll." };
  }

  const nowStep = currentStep(options.nowMs ?? Date.now());
  for (let drift = -ALLOWED_DRIFT_STEPS; drift <= ALLOWED_DRIFT_STEPS; drift += 1) {
    const step = nowStep + drift;
    // Replay guard: a code from an already-consumed step is refused even if
    // it would otherwise match.
    if (options.lastUsedStep != null && step <= options.lastUsedStep) continue;
    if (codesEqual(hotp(key, step), trimmed)) {
      return { ok: true, usedStep: step };
    }
  }
  return { ok: false, error: "Incorrect or expired code." };
}
