import { z } from "zod";
import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth";
import { courierUpdateDeliveryStatus } from "@/lib/fulfilment";

const actionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["picked_up", "delivering", "delivered"]),
});

/**
 * POST /api/courier/actions — the assigned rider progresses their trip:
 * picked_up → delivering → delivered.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  // Courier actions require the courier role (admins may act in a pinch).
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  const staff = await isAdmin(auth.user.id);
  if (role !== "courier" && !staff) {
    return apiError("Only couriers can perform this action.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { orderId, action } = parsed.data;

  const admin = createAdminClient();
  try {
    await courierUpdateDeliveryStatus(admin, orderId, auth.user.id, action);
    return json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Action failed.", 400);
  }
}
