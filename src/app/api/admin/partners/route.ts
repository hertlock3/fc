import { z } from "zod";
import { requireApiAdmin, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin partner-approval API — /admin/team uses this to review rider &
 * stockist sign-ups.
 *
 * GET    /api/admin/partners            → pending (and recent) partner accounts
 * PATCH  /api/admin/partners            → set approval_status for one account
 *
 * Approval is what unlocks the platform: while a partner is 'pending' the
 * middleware bounces every page to /pending-approval and APIs return 403.
 * Approving a stockist does NOT auto-activate their location — staff verify
 * the location separately in /admin/stockists.
 */

const patchSchema = z.object({
  profileId: z.string().uuid("Invalid account"),
  action: z.enum(["approve", "reject", "revoke"]),
});

/** GET — list partner accounts (pending first, then recently decided). */
export async function GET() {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, phone, role, approval_status, created_at, updated_at")
    .in("role", ["courier", "stockist"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return apiError(error.message, 500);

  // Attach each stockist's linked location so admins see what they'd activate.
  const { data: locations } = await admin
    .from("stockists")
    .select("id, profile_id, name, is_active");
  const byProfile = new Map<string, { id: string; name: string; is_active: boolean }>();
  for (const s of (locations ?? []) as Array<{
    profile_id: string | null;
    id: string;
    name: string;
    is_active: boolean;
  }>) {
    if (s.profile_id) byProfile.set(s.profile_id, { id: s.id, name: s.name, is_active: s.is_active });
  }

  return json({
    partners: (data ?? []).map((p) => {
      const row = p as {
        id: string;
        full_name: string | null;
        phone: string | null;
        role: string;
        approval_status: string;
        created_at: string;
        updated_at: string;
      };
      return {
        ...row,
        location: byProfile.get(row.id) ?? null,
      };
    }),
  });
}

/** PATCH — approve / reject / revoke a partner account. */
export async function PATCH(request: Request) {
  const auth = await requireApiAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { profileId, action } = parsed.data;

  const statusMap = { approve: "approved", reject: "rejected", revoke: "pending" } as const;

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ approval_status: statusMap[action] })
    .eq("id", profileId)
    .in("role", ["courier", "stockist"])
    .select("id, full_name, role, approval_status")
    .single();
  if (error) {
    return apiError(
      error.message.includes("No rows")
        ? "Partner account not found."
        : error.message,
      404
    );
  }

  return json({ partner: updated });
}
