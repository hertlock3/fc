import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings";
import {
  confirmTotpEnrollment,
  getTotpStatus,
  startTotpEnrollment,
  verifyTotp,
} from "@/lib/totp-store";
import { rateLimit } from "@/lib/rate-limit";

/**
 * M-Pesa paybill/till management — admin only, TOTP-protected.
 *
 * The second factor is an RFC 6238 authenticator app (totp-cli, Google
 * Authenticator, Aegis, 1Password…) instead of an emailed code: nothing is
 * delivered at verification time, so there is no email to lose, and codes
 * rotate every 30 s and are single-use (replay-guarded in the DB).
 *
 * GET    → current receiving-account settings + TOTP enrollment status
 * POST   → { action: "enroll" | "confirm" | "verify" }
 *   enroll  → generates/rotates this admin's secret, returns an otpauth://
 *             URI (render as QR or paste the secret into the app)
 *   confirm → first valid code from the app flips enrollment to confirmed
 *   verify  → checks a fresh code, then atomically persists the new paybill
 *
 * The change takes effect on the NEXT checkout (M-Pesa STK push uses the
 * stored value at charge time).
 */

/** Brute-force ceiling: 6 TOTP guesses per 5 min per admin. */
const VERIFY_ATTEMPTS = 6;
const VERIFY_WINDOW_MS = 5 * 60_000;

const changeSchema = z.object({
  action: z.enum(["enroll", "confirm", "verify"]),
  /** Required for "confirm" and "verify" — the 6-digit authenticator code. */
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code").optional(),
  /** Required for "verify" — the pending new values. */
  paybill: z
    .string()
    .trim()
    .regex(/^\d{5,7}$/, "Paybill/till must be 5–7 digits")
    .optional(),
  accountPrefix: z.string().trim().min(1).max(8).optional(),
  name: z.string().trim().min(2).max(80).optional(),
});

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const [merchant, totp] = await Promise.all([
    loadMerchantSettings(auth.supabase),
    getTotpStatus(auth.user.id),
  ]);
  return json({ merchant, totp });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { action, code } = parsed.data;

  // ---- enroll: create/rotate this admin's TOTP secret -----------------------
  if (action === "enroll") {
    try {
      const enrollment = await startTotpEnrollment({
        userId: auth.user.id,
        email: auth.user.email ?? "admin",
      });
      return json({ ok: true, ...enrollment });
    } catch (err) {
      return apiError(
        err instanceof Error ? err.message : "Could not start enrollment.",
        502
      );
    }
  }

  if (!code) return apiError("Enter the 6-digit code.", 422);

  // Brute-force ceiling shared by confirm + verify.
  const limit = rateLimit(`totp:${auth.user.id}`, VERIFY_ATTEMPTS, VERIFY_WINDOW_MS);
  if (!limit.ok) {
    return json(
      {
        error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  // ---- confirm: prove the app imported the secret ---------------------------
  if (action === "confirm") {
    const result = await confirmTotpEnrollment(auth.user.id, code);
    if (!result.ok) return apiError(result.error ?? "Verification failed.", 401);
    return json({ ok: true, message: "Authenticator app confirmed." });
  }

  // ---- verify & apply --------------------------------------------------------
  if (parsed.data.paybill === undefined) {
    return apiError("No pending change to apply.", 422);
  }

  const check = await verifyTotp(auth.user.id, code);
  if (!check.ok) return apiError(check.error ?? "Verification failed.", 401);

  const admin = createAdminClient();
  try {
    const current = await loadMerchantSettings(auth.supabase);
    await saveMerchantSettings(admin, {
      paybill: parsed.data.paybill!,
      accountPrefix: parsed.data.accountPrefix ?? current.accountPrefix,
      name: parsed.data.name ?? current.name,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not save.", 500);
  }

  return json({
    ok: true,
    message: "Receiving account updated. New checkouts will use it.",
  });
}
