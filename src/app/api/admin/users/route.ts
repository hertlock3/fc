import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin user management API — backs the /admin/users dashboard.
 *
 * GET    — every account: profile + auth email + approval + order count.
 * PATCH  — change a user's role and/or approval status.
 * POST   — create an account directly (staff-created partners/customers).
 * DELETE — permanently remove an account (blocked when it has orders).
 *
 * Self-protection rules enforced here:
 *   • you cannot change your own role or delete yourself;
 *   • the last admin/vendor cannot be demoted or deleted.
 */

const ROLES = ["customer", "courier", "stockist", "vendor", "admin"] as const;

const patchSchema = z.object({
  profileId: z.string().uuid("Invalid account"),
  role: z.enum(ROLES).optional(),
  approval: z.enum(["pending", "approved", "rejected"]).optional(),
});

const createSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the user's full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().max(20).optional(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
  role: z.enum(ROLES).default("customer"),
  /** Partners start pending unless the admin ticks approve. */
  approve: z.coerce.boolean().default(true),
});

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  approval_status: string;
  created_at: string;
}

/* --------------------------------------------------------------------- GET */

export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, phone, role, approval_status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return apiError(error.message, 500);

  // Auth-side details (email, confirmation, last sign-in).
  const { data: authData } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const authById = new Map(
    (authData?.users ?? []).map((u) => [
      u.id,
      { email: u.email ?? null, confirmed: Boolean(u.email_confirmed_at), last_sign_in: u.last_sign_in_at ?? null },
    ])
  );

  // Order counts, grouped in one light query.
  const { data: orderRows } = await admin.from("orders").select("user_id");
  const orderCounts = new Map<string, number>();
  for (const row of (orderRows ?? []) as Array<{ user_id: string }>) {
    orderCounts.set(row.user_id, (orderCounts.get(row.user_id) ?? 0) + 1);
  }

  const users = (profiles as ProfileRow[]).map((p) => ({
    ...p,
    email: authById.get(p.id)?.email ?? null,
    email_confirmed: authById.get(p.id)?.confirmed ?? false,
    last_sign_in_at: authById.get(p.id)?.last_sign_in ?? null,
    order_count: orderCounts.get(p.id) ?? 0,
  }));

  return json({ users });
}

/* ------------------------------------------------------------------- PATCH */

export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { profileId, role, approval } = parsed.data;
  if (!role && !approval) return apiError("Nothing to update.", 422);

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", profileId)
    .maybeSingle();
  const t = target as { id: string; role: string } | null;
  if (!t) return apiError("Account not found.", 404);

  // Guard: you cannot change your own role (lockout protection).
  if (role && profileId === auth.user.id) {
    return apiError("You cannot change your own role.", 400);
  }
  // Guard: approval only applies to partner accounts.
  if (approval && !["courier", "stockist"].includes(t.role)) {
    return apiError("Approval only applies to rider & stockist accounts.", 400);
  }
  // Guard: never leave the platform without an admin/vendor.
  if (role && ["admin", "vendor"].includes(t.role) && !["admin", "vendor"].includes(role)) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "vendor"]);
    if ((count ?? 0) <= 1) {
      return apiError("Cannot demote the last administrator.", 400);
    }
  }

  const patch: Record<string, unknown> = {};
  if (role) patch.role = role;
  if (approval) patch.approval_status = approval;

  const { data: updated, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", profileId)
    .select("id, full_name, role, approval_status")
    .single();
  if (error) return apiError(error.message, 500);

  return json({ user: updated });
}

/* -------------------------------------------------------------------- POST */

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { fullName, email, phone, password, role, approve } = parsed.data;

  const admin = createAdminClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone: phone ?? "" },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "Could not create the account.";
    return apiError(
      msg.includes("already") ? "An account with this email already exists." : msg,
      createError?.status === 422 ? 422 : 400
    );
  }

  const approvalStatus = approve || !["courier", "stockist"].includes(role)
    ? "approved"
    : "pending";

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    phone: phone ?? null,
    role,
    approval_status: approvalStatus,
  });
  if (profileError) {
    // Roll the auth user back so no half-created account lingers.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return apiError(profileError.message, 500);
  }

  return json(
    { user: { id: created.user.id, email, fullName, role, approval_status: approvalStatus } },
    { status: 201 }
  );
}

/* ------------------------------------------------------------------ DELETE */

export async function DELETE(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return apiError("Missing user id.", 422);
  if (id === auth.user.id) return apiError("You cannot delete your own account.", 400);

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", id)
    .maybeSingle();
  const t = target as { id: string; role: string; full_name: string | null } | null;
  if (!t) return apiError("Account not found.", 404);

  // Guard: never delete the last admin/vendor.
  if (["admin", "vendor"].includes(t.role)) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin", "vendor"]);
    if ((count ?? 0) <= 1) {
      return apiError("Cannot delete the last administrator.", 400);
    }
  }

  // profile rows cascade from auth.users; orders.user_id is ON DELETE RESTRICT,
  // so users with order history are protected by the FK — surface it kindly.
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("foreign key") || msg.includes("violates") || msg.includes("restrict")) {
      return apiError(
        "This user has order history and cannot be deleted. Revoke their access instead.",
        409
      );
    }
    return apiError(error.message, 500);
  }

  return json({ ok: true });
}
