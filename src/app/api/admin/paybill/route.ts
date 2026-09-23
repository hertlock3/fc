import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMerchantSettings, saveMerchantSettings } from "@/lib/settings";
import { issueEmailOtp, verifyEmailOtp } from "@/lib/email-otp";
import { rateLimit } from "@/lib/rate-limit";
import { config } from "@/lib/config";

/**
 * M-Pesa till (Buy Goods) management — admin only, protected by an emailed
 * one-time code (see lib/email-otp.ts).
 *
 * GET   → current receiving-account settings
 * POST  → { action: "send-code" | "verify" }
 *   send-code → emails a fresh 5-digit code to the admin's account address
 *               (hashed, 10-minute expiry, single-use, one live code per admin)
 *   verify    → checks the code, then atomically persists the new paybill
 *
 * The change takes effect on the NEXT checkout (M-Pesa STK push uses the
 * stored value at charge time).
 */

/** Code emails per 5 min per admin — stops mail-bombing. */
const SEND_ATTEMPTS = 3;
const SEND_WINDOW_MS = 5 * 60_000;
/** Code guesses per 5 min per admin — brute-force ceiling. */
const VERIFY_ATTEMPTS = 5;
const VERIFY_WINDOW_MS = 5 * 60_000;

const PAYBILL_PURPOSE = "amending the M-Pesa receiving account";

const changeSchema = z.object({
  action: z.enum(["send-code", "verify"]),
  /** Required for "verify" — the 5-digit code from the email. */
  code: z.string().trim().optional(),
  /** Required for "verify" — the pending new values. */
  till: z.string().trim().regex(/^\d{5,7}$/, "Enter your till number (5–7 digits)").optional(),
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

  // ---- send-code: email a fresh OTP to the admin ----------------------------
  if (parsed.data.action === "send-code") {
    const email = auth.user.email;
    if (!email) {
      return apiError("Your account has no email address to send a code to.", 422);
    }
    if (!config.email.apiKey) {
      return apiError(
        "Email sending is not configured. Add RESEND_API_KEY to the environment (see README → Admin email code).",
        503
      );
    }

    const limit = rateLimit(`otp-send:${auth.user.id}`, SEND_ATTEMPTS, SEND_WINDOW_MS);
    if (!limit.ok) {
      return json(
        {
          error: `Too many code requests. Try again in ${limit.retryAfterSeconds}s.`,
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const result = await issueEmailOtp({
      userId: auth.user.id,
      email,
      purpose: PAYBILL_PURPOSE,
    });
    if (!result.ok) return apiError(result.error, 502);
    return json({ ok: true, emailedTo: result.emailedTo, expiresAt: result.expiresAt });
  }

  // ---- verify: check the code, then apply the change ------------------------
  const { code, till } = parsed.data;
  if (!code || !till) {
    return apiError("Enter the code from your email and the new till number.", 422);
  }

  const limit = rateLimit(`otp-verify:${auth.user.id}`, VERIFY_ATTEMPTS, VERIFY_WINDOW_MS);
  if (!limit.ok) {
    return json(
      {
        error: `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  const check = await verifyEmailOtp(auth.user.id, code);
  if (!check.ok) return apiError(check.error ?? "Verification failed.", 401);

  const admin = createAdminClient();
  try {
    const current = await loadMerchantSettings(auth.supabase);
    await saveMerchantSettings(admin, {
      till,
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
