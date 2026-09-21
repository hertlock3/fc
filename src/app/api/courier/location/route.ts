import { z } from "zod";
import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const pingSchema = z.object({
  orderId: z.string().uuid(),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** GPS accuracy in metres. */
  accuracy: z.coerce.number().min(0).max(100_000).optional(),
  /** Direction of travel in degrees (0 = north). */
  heading: z.coerce.number().min(0).max(360).optional(),
  /** Speed in metres per second. */
  speed: z.coerce.number().min(0).max(200).optional(),
});

/**
 * POST /api/courier/location — the rider's phone beacon.
 *
 * The courier portal streams coordinates here every ~10s while a trip is in
 * progress. Authorisation is strict:
 *   1. the caller must be signed in with the courier role (or staff), and
 *   2. the delivery for `orderId` must be assigned to THEM.
 *
 * Pings are stored in `courier_locations` (RLS-protected, service-role write)
 * and customers consume them read-only via /api/orders/[id]/tracking.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = pingSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);
  const { orderId, lat, lng, accuracy, heading, speed } = parsed.data;

  const admin = createAdminClient();

  // 1. Role check — courier (or staff acting in a pinch).
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "courier" && role !== "admin" && role !== "vendor") {
    return apiError("Only couriers can share trip location.", 403);
  }

  // 2. Ownership check — the trip must be assigned to this rider.
  const { data: delivery } = await admin
    .from("deliveries")
    .select("id, status, courier_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const d = delivery as { id: string; status: string; courier_id: string | null } | null;
  if (!d) return apiError("No delivery exists for this order.", 404);
  if (d.courier_id !== auth.user.id) {
    return apiError("This trip is not assigned to you.", 403);
  }
  if (!["assigned", "picked_up", "delivering"].includes(d.status)) {
    // Trip over (or not started) — stop accepting pings.
    return json({ ok: true, stored: false, reason: "trip_inactive" });
  }

  const { error } = await admin.from("courier_locations").insert({
    order_id: orderId,
    courier_id: auth.user.id,
    lat,
    lng,
    accuracy_m: accuracy ?? null,
    heading_deg: heading ?? null,
    speed_mps: speed ?? null,
  });
  if (error) return apiError(error.message, 500);

  return json({ ok: true, stored: true });
}
