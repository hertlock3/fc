import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { isAdmin } from "@/lib/auth";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Pull the first field-level message out of a Zod error. */
export function zodMessage(err: {
  issues?: Array<{ message: string }>;
}): string {
  return err.issues?.[0]?.message ?? "Invalid request.";
}

type AuthResult =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Resolve the authenticated user for a route handler. Returns a ready-to-send
 * error response (503 setup / 401 unauthenticated / 403 unapproved partner)
 * when auth cannot proceed.
 */
export async function requireApiUser(): Promise<AuthResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      response: apiError(
        "The store is not connected to a database yet. Finish setup in .env.local.",
        503
      ),
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: apiError("You must be signed in.", 401) };
  }

  // Partner approval gate: pending riders/stockists cannot call platform
  // APIs (orders, chat, courier actions, checkout, …) until approved.
  const { data: access } = await supabase
    .from("profiles")
    .select("role, approval_status")
    .eq("id", user.id)
    .maybeSingle();
  const role = (access as { role?: string } | null)?.role;
  const status = (access as { approval_status?: string } | null)?.approval_status;
  const alwaysAllowed =
    role === "admin" || role === "vendor" || role === "customer";
  if (!alwaysAllowed && status !== "approved") {
    return {
      ok: false,
      response: apiError(
        "Your account is pending admin approval.",
        403,
        { code: "pending_approval" }
      ),
    };
  }

  return { ok: true, user, supabase };
}

/**
 * Resolve the authenticated user AND verify the admin/vendor role.
 * Route handlers must still use the service-role client for privileged
 * writes; this guard only decides whether the caller is allowed to proceed.
 */
export async function requireApiAdmin(): Promise<AuthResult> {
  const auth = await requireApiUser();
  if (!auth.ok) return auth;
  if (!(await isAdmin(auth.user.id))) {
    return {
      ok: false,
      response: apiError("You do not have permission to perform this action.", 403),
    };
  }
  return auth;
}
