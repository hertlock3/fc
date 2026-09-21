import { requireApiUser, json, apiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { getParticipant } from "@/lib/messages";
import { getStockistById } from "@/lib/stockists";

/**
 * GET /api/orders/[id]/tracking — live rider location for the order page map.
 *
 * Access mirrors the order chat: the customer, the assigned rider and FC
 * staff only. Everyone else gets 404 (no existence leak).
 *
 * Returns the latest GPS ping from `courier_locations` plus the pickup
 * (stockist) and drop-off coordinates so the client can draw the route leg.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  // Participation check (same rules as the chat): customer / rider / staff.
  const admin = createAdminClient();
  const participant = await getParticipant(admin, id, auth.user.id);
  if (!participant) return apiError("Not found.", 404);

  const [{ data: order }, { data: ping }] = await Promise.all([
    admin
      .from("orders")
      .select(
        "id, status, delivery_status, delivery_lat, delivery_lng, distance_km, stockist_id"
      )
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("courier_locations")
      .select("lat, lng, accuracy_m, heading_deg, speed_mps, created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!order) return apiError("Not found.", 404);

  const pickup = await getStockistById(admin, (order as { stockist_id: string | null }).stockist_id);

  const row = ping as
    | {
        lat: number;
        lng: number;
        accuracy_m: number | null;
        heading_deg: number | null;
        speed_mps: number | null;
        created_at: string;
      }
    | null;

  return json({
    tracking: {
      // Null until the rider's phone beams its first ping.
      rider: row
        ? {
            lat: row.lat,
            lng: row.lng,
            accuracy_m: row.accuracy_m,
            heading_deg: row.heading_deg,
            speed_mps: row.speed_mps,
            updated_at: row.created_at,
          }
        : null,
      pickup: pickup
        ? { name: pickup.name, lat: pickup.lat, lng: pickup.lng }
        : null,
      dropoff:
        (order as { delivery_lat: number | null }).delivery_lat != null
          ? {
              lat: (order as { delivery_lat: number }).delivery_lat,
              lng: (order as { delivery_lng: number }).delivery_lng,
            }
          : null,
      // Stale after 2 minutes — the UI shows "reconnecting…".
      is_live: row
        ? Date.now() - new Date(row.created_at).getTime() < 120_000
        : false,
    },
  });
}
