import type { SupabaseClient } from "@supabase/supabase-js";
import { haversineKm, type LatLng } from "@/lib/pricing";
import type { Stockist, StockistWithDistance } from "@/lib/types";

/**
 * Stockists — Farmer's Choice fulfilment locations.
 *
 * Orders are fulfilled from the **principal butchery plant (Ruiru)** or from
 * approved **stockists**. At checkout the platform silently picks the *nearest
 * active* location to the customer's delivery address, so food items travel
 * the shortest leg and fees stay fair. When no stockist exists yet, the
 * principal plant is the fallback — exactly today's behaviour.
 */

/**
 * Pick the active stockist nearest to `destination`.
 *
 * - Only `is_active` locations are considered.
 * - Ties are broken by name so the result is deterministic.
 * - Returns null only when there are no active locations at all.
 */
export function pickNearestStockist<T extends Stockist>(
  stockists: T[],
  destination: LatLng
): T | null {
  const active = stockists.filter((s) => s.is_active);
  if (active.length === 0) return null;

  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const s of active) {
    const d = haversineKm({ lat: s.lat, lng: s.lng }, destination);
    if (
      d < bestDistance ||
      // Deterministic tie-break: name asc, then id asc.
      (d === bestDistance && best !== null &&
        (s.name < best.name || (s.name === best.name && s.id < best.id)))
    ) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Resolve the fulfilment location for an order from a list of stockists,
 * falling back to the principal plant (never null while any exist).
 */
export function resolveFulfilmentStockist<T extends Stockist>(
  stockists: T[],
  destination: LatLng
): T | null {
  const nearest = pickNearestStockist(stockists, destination);
  if (nearest) return nearest;
  return stockists.find((s) => s.is_principal && s.is_active) ?? null;
}

/**
 * Fetch one stockist by id. Returns the principal plant as a fallback for
 * legacy orders that predate stockists; throws only if nothing is available.
 */
export async function getStockistById(
  client: SupabaseClient,
  stockistId: string | null | undefined
): Promise<Stockist> {
  if (stockistId) {
    const { data } = await client
      .from("stockists")
      .select("*")
      .eq("id", stockistId)
      .maybeSingle();
    if (data) return data as Stockist;
  }
  const fallback = await client
    .from("stockists")
    .select("*")
    .eq("is_principal", true)
    .limit(1)
    .maybeSingle();
  if (fallback.data) return fallback.data as Stockist;
  throw new Error("No fulfilment location is configured.");
}

/** List every active stockist (public read is allowed by RLS). */
export async function listActiveStockists(
  client: SupabaseClient
): Promise<Stockist[]> {
  const { data, error } = await client
    .from("stockists")
    .select("*")
    .eq("is_active", true);
  if (error || !data) return [];
  return data as Stockist[];
}

/**
 * Active stockists sorted by distance from `origin` — used by the admin
 * manager to show how far each location sits from a reference point.
 */
export async function listStockistsWithDistance(
  client: SupabaseClient,
  origin?: LatLng | null
): Promise<StockistWithDistance[]> {
  const { data, error } = await client
    .from("stockists")
    .select("*")
    .order("is_principal", { ascending: false })
    .order("name", { ascending: true });
  if (error || !data) return [];

  const rows = data as Stockist[];
  if (!origin) return rows.map((s) => ({ ...s, distance_km: null }));
  return rows
    .map((s) => ({
      ...s,
      distance_km: haversineKm(origin, { lat: s.lat, lng: s.lng }),
    }))
    .sort((a, b) => {
      const da = a.distance_km ?? Number.POSITIVE_INFINITY;
      const db = b.distance_km ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.name.localeCompare(b.name);
    });
}
