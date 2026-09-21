import { redirect } from "next/navigation";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";
import type { ApprovalStatus, Profile, Stockist, UserRole } from "@/lib/types";

/**
 * Read the signed-in user's role + approval status in ONE query. Cached per
 * render pass via React cache so pages that call several guards don't
 * multiply queries.
 */
export const getAccessProfile = cache(async (): Promise<{
  role: UserRole | null;
  approvalStatus: ApprovalStatus | null;
} | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("role, approval_status")
      .eq("id", user.id)
      .maybeSingle();
    const row = data as { role: UserRole; approval_status: ApprovalStatus } | null;
    if (!row) return null;
    return { role: row.role, approvalStatus: row.approval_status };
  } catch {
    return null;
  }
});

/**
 * True when the signed-in account may use the platform: admins/vendors and
 * customers are always allowed; riders & stockists must be APPROVED by an
 * admin first (approval_status = 'approved').
 */
export async function isPlatformApproved(): Promise<boolean> {
  const access = await getAccessProfile();
  if (!access) return false;
  if (access.role === "admin" || access.role === "vendor" || access.role === "customer") {
    return true;
  }
  return access.approvalStatus === "approved";
}

/** Fetch the signed-in Supabase auth user, or null. Never throws. */
export async function getSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/** Fetch the current user's profile row (role, name, phone), or null. */
export async function getProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return (data as Profile) ?? null;
  } catch {
    return null;
  }
}

/** True when the given user id belongs to an admin/vendor. */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();
    const role = (data as { role?: UserRole } | null)?.role;
    return role === "admin" || role === "vendor";
  } catch {
    return false;
  }
}

/** Page guard: redirect to login if there is no session. Returns the user. */
export async function requireUser(nextPath?: string): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`);
  }
  // Partner approval gate: pending riders/stockists are locked out of every
  // page except /pending-approval until an admin approves them.
  if (!(await isPlatformApproved())) {
    redirect("/pending-approval");
  }
  return user;
}

/** Page guard: require an admin/vendor role, otherwise 404-style redirect. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser("/admin");
  const admin = await isAdmin(user.id);
  if (!admin) redirect("/shop");
  return user;
}

/**
 * Page guard: require a stockist partner account.
 * Returns the signed-in user and their linked stockist location.
 */
export async function requireStockist(): Promise<{
  user: User;
  stockist: Stockist;
}> {
  const user = await requireUser("/stockist");
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: UserRole } | null)?.role;

  // Staff may preview the stockist portal.
  if (role !== "stockist" && !(await isAdmin(user.id))) redirect("/shop");

  const admin = createAdminClient();
  const { data: stockist } = await admin
    .from("stockists")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!stockist) {
    // Staff previewing without a location, or an unlinked account.
    redirect("/shop");
  }
  return { user, stockist: stockist as Stockist };
}
