import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const promoteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  role: z.enum(["courier", "admin", "vendor", "stockist"]),
});

/**
 * Admin team API.
 * GET  — list courier/staff accounts and open courier trips.
 * POST — promote an existing account to courier/admin/vendor.
 */
export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data: team, error } = await admin
    .from("profiles")
    .select("id, full_name, phone, role")
    .in("role", ["courier", "admin", "vendor"])
    .order("full_name", { ascending: true });
  if (error) return apiError(error.message, 500);

  // Open trips help admins see who is currently carrying what.
  const { data: trips } = await admin
    .from("deliveries")
    .select("courier_id, order_id, status")
    .in("status", ["assigned", "picked_up", "delivering"])
    .not("courier_id", "is", null);

  const tripCounts = new Map<string, number>();
  for (const t of (trips ?? []) as Array<{ courier_id: string | null }>) {
    if (t.courier_id) tripCounts.set(t.courier_id, (tripCounts.get(t.courier_id) ?? 0) + 1);
  }

  return json({
    team: (team ?? []).map((p) => ({
      ...(p as { id: string; full_name: string | null; phone: string | null; role: string }),
      open_trips: tripCounts.get((p as { id: string }).id) ?? 0,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { email, role } = parsed.data;

  const admin = createAdminClient();

  // Look up the auth user by email via the admin API.
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  const user = (users?.users ?? []).find((u) => u.email?.toLowerCase() === email);
  if (!user) return apiError(`No account found for ${email}.`, 404);

  // Promoting an account to a partner role also APPROVES it — staff are
  // explicitly vouching for this account. (Approval of self-registered
  // partners happens through /api/admin/partners instead.)
  const { error } = await admin
    .from("profiles")
    .update({ role, approval_status: "approved" })
    .eq("id", user.id);
  if (error) return apiError(error.message, 500);

  return json({ ok: true, userId: user.id, role });
}
