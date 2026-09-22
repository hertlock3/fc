import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings";
import { issueOtp, verifyOtp } from "@/lib/otp";

/**
 * M-Pesa paybill/till management — admin only, email-OTP protected.
 *
 * OTP emails go through Supabase Auth, whose default send quota is very small
 * (2/hour locally). Rapid "resend" clicks therefore hit
 * `over_email_send_rate_limit` before any code visibly arrives. We add a
 * per-admin cooldown and map Supabase's throttle error to a friendly 429 with
 * a `retryAfterSeconds` hint the UI can count down on.
 *
 * GET    → current receiving-account settings + masked details
 * POST   → { action: "request-otp" | "verify" }
 *          "request-otp": emails a 6-digit code to the admin's address
 *          "verify": checks the code, then atomically persists the new paybill
 *
 * The change takes effect on the NEXT checkout (M-Pesa STK push uses the
 * stored value at charge time).
 */

/** Minimum gap between OTP emails per admin, so resends can't spam Supabase. */
const OTP_RESEND_COOLDOWN_MS = 60_000;
const otpCooldowns = new Map<string, number>();

function otpCooldownRemaining(email: string): number {
  const until = otpCooldowns.get(email) ?? 0;
  return Math.max(0, until - Date.now());
}

/** Supabase signals email throttling with `over_email_send_rate_limit`. */
function isEmailRateLimit(message: string): boolean {
  return /over_email_send_rate_limit|rate limit/i.test(message);
}

/** Parse the "…after 43 seconds…" hint from Supabase throttle messages. */
function retryAfterSeconds(message: string): number | undefined {
  const match = message.match(/after (\d+) seconds?/i);
  return match ? Number(match[1]) : undefined;
}

const changeSchema = z.object({
  action: z.enum(["request-otp", "verify"]),
  /** Required for "verify" — the 6-digit code from the admin's email. */
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

  const merchant = await loadMerchantSettings(auth.supabase);
  return json({ merchant });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = changeSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { action, code } = parsed.data;
  const email = auth.user.email ?? "";

  if (action === "request-otp") {
    const remainingMs = otpCooldownRemaining(email);
    if (remainingMs > 0) {
      return json(
        {
          error: `A code was just sent to ${email}. Request another in ${Math.ceil(remainingMs / 1000)}s.`,
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        },
        { status: 429 }
      );
    }

    try {
      await issueOtp(email);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send code.";
      if (isEmailRateLimit(message)) {
        return json(
          {
            error: "Too many verification emails requested. Please wait a minute and try again.",
            retryAfterSeconds: retryAfterSeconds(message) ?? 60,
          },
          { status: 429 }
        );
      }
      return apiError(message, 502);
    }
    otpCooldowns.set(email, Date.now() + OTP_RESEND_COOLDOWN_MS);
    return json({ ok: true, sentTo: email });
  }

  // ---- verify & apply -------------------------------------------------------
  if (!code) return apiError("Enter the 6-digit code.", 422);
  if (parsed.data.paybill === undefined) {
    return apiError("No pending change to apply.", 422);
  }

  const check = await verifyOtp(email, code);
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
