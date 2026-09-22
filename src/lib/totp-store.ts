import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildOtpauthUri,
  generateTotpSecret,
  verifyTotpCode,
  type TotpVerifyResult,
} from "./totp";

/**
 * Persistence for the admin TOTP second factor.
 *
 * Secrets live in `admin_totp_secrets` — RLS-enabled with **no policies**, so
 * only the service role can touch it. Every function here enforces that the
 * caller first proves the user is an admin (the routes do that) and then uses
 * the service-role client for the secret row itself.
 *
 * State machine:
 *   (no row) --startEnrollment--> pending --confirmEnrollment--> confirmed
 *   pending --startEnrollment--> pending   (re-enroll rotates the secret)
 *   confirmed --startEnrollment--> pending (re-enroll also rotates; first
 *                                           valid code re-confirms)
 */

interface TotpRow {
  user_id: string;
  secret: string;
  enrollment: "pending" | "confirmed";
  last_used_step: number | null;
}

export interface StartEnrollmentResult {
  otpauthUri: string;
  secret: string;
}

/**
 * Create (or rotate) the caller's TOTP secret and return the otpauth:// URI
 * the admin adds to their authenticator app. Starting enrollment again is
 * always allowed and rotates the secret.
 */
export async function startTotpEnrollment(params: {
  userId: string;
  email: string;
}): Promise<StartEnrollmentResult> {
  const secret = generateTotpSecret();
  const admin = createAdminClient();

  const { error } = await admin.from("admin_totp_secrets").upsert(
    {
      user_id: params.userId,
      secret,
      enrollment: "pending",
      last_used_step: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`Could not start TOTP enrollment: ${error.message}`);

  return {
    secret,
    otpauthUri: buildOtpauthUri({
      secret,
      accountEmail: params.email,
      issuerName: "Farmer's Choice Market",
    }),
  };
}

export interface TotpStatus {
  enrolled: boolean;
  pending: boolean;
}

/** Where is this admin's TOTP enrollment? */
export async function getTotpStatus(userId: string): Promise<TotpStatus> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_totp_secrets")
    .select("enrollment")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { enrolled: false, pending: false };
  return {
    enrolled: data.enrollment === "confirmed",
    pending: data.enrollment === "pending",
  };
}

/**
 * Confirm a pending enrollment: the admin proves they imported the secret by
 * typing a code their authenticator app currently shows.
 */
export async function confirmTotpEnrollment(
  userId: string,
  code: string
): Promise<TotpVerifyResult> {
  const row = await fetchRow(userId);
  if (!row) {
    return { ok: false, error: "Start enrollment first — no TOTP secret exists." };
  }
  if (row.enrollment !== "pending") {
    return { ok: false, error: "TOTP is already enrolled." };
  }

  const result = verifyTotpCode(row.secret, code, {
    lastUsedStep: row.last_used_step,
  });
  if (!result.ok) return result;

  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_totp_secrets")
    .update({
      enrollment: "confirmed",
      last_used_step: result.usedStep ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) {
    return { ok: false, error: `Could not confirm enrollment: ${error.message}` };
  }
  return { ok: true, usedStep: result.usedStep };
}

/**
 * Verify a code for an already-confirmed enrollment and consume the matched
 * time-step (replay guard). Use for the actual sensitive action.
 */
export async function verifyTotp(
  userId: string,
  code: string
): Promise<TotpVerifyResult> {
  const row = await fetchRow(userId);
  if (!row) {
    return { ok: false, error: "TOTP is not set up — enroll first." };
  }
  if (row.enrollment !== "confirmed") {
    return { ok: false, error: "Finish TOTP enrollment before changing the paybill." };
  }

  const result = verifyTotpCode(row.secret, code, {
    lastUsedStep: row.last_used_step,
  });
  if (!result.ok) return result;

  // Consume the step so the same code cannot be used twice.
  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_totp_secrets")
    .update({
      last_used_step: result.usedStep ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) {
    return { ok: false, error: `Could not record code usage: ${error.message}` };
  }
  return { ok: true, usedStep: result.usedStep };
}

/** Remove the second factor entirely (e.g. admin resets their device). */
export async function resetTotp(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("admin_totp_secrets").delete().eq("user_id", userId);
}

/* -------------------------------------------------------------------------- */

async function fetchRow(userId: string): Promise<TotpRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_totp_secrets")
    .select("user_id, secret, enrollment, last_used_step")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TotpRow;
}
