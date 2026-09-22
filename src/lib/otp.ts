import "server-only";
import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * Email OTP for sensitive admin actions (e.g. amending the M-Pesa paybill).
 *
 * Design: we lean on Supabase Auth's native email OTP rather than rolling our
 * own code storage. The server asks Supabase to email a 6-digit code to the
 * admin's address; the admin reads it from their inbox; the server verifies
 * it with `auth.verifyOTP`. Success proves the admin controls that inbox —
 * the verification is the second factor. Codes are single-use and expire in
 * 60 seconds..10 minutes per Supabase Auth defaults.
 *
 * Requirements: the admin account must already exist (createUser: false).
 */

/** Ask Supabase to email a one-time code to the given address. */
export async function issueOtp(userEmail: string): Promise<void> {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error("Supabase is not configured.");
  }
  const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.signInWithOtp({
    email: userEmail,
    options: { shouldCreateUser: false },
  });
  if (error) {
    // Surface rate limits / config problems — the admin needs to know the
    // email will not arrive rather than waiting on a code that never comes.
    if (/over_email_send_rate_limit/i.test(error.message)) {
      throw new Error(
        `Could not send the verification email: too many emails requested. ${error.message}`
      );
    }
    throw new Error(`Could not send the verification email: ${error.message}`);
  }
}

/**
 * Verify a code that Supabase emailed. Returns true when the code is valid,
 * unexpired and unused — i.e. the admin demonstrated control of the mailbox.
 */
export async function verifyOtp(
  userEmail: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  if (!config.supabase.url || !config.supabase.anonKey) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const supabase = createClient(config.supabase.url, config.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.auth.verifyOtp({
    email: userEmail,
    token: code,
    type: "email",
  });
  if (error) return { ok: false, error: "Incorrect or expired code." };
  return { ok: true };
}
