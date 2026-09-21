import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/config";
import type { Profile, Stockist, UserRole } from "@/lib/types";

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
