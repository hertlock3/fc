import { requireApiUser, json, apiError } from "@/lib/api";
import { getCartItems, toQuoteItems } from "@/lib/cart";
import { computeQuote, getRoadDistanceKm } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/settings";
import { listActiveStockists, resolveFulfilmentStockist } from "@/lib/stockists";

/**
 * GET /api/quote?addressId=...
 * Returns a server-authoritative quote (goods + distance-based delivery +
 * service fee) for the current cart and a chosen delivery address.
 *
 * Delivery is priced from the stockist nearest the address — the same origin
 * that will be recorded on the order at checkout.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const addressId = new URL(request.url).searchParams.get("addressId");
  if (!addressId) return json({ quote: null, reason: "no_address" });

  const items = toQuoteItems(await getCartItems(auth.supabase, auth.user.id));
  if (items.length === 0) return json({ quote: null, reason: "empty_cart" });

  const { data: address } = await auth.supabase
    .from("addresses")
    .select("*")
    .eq("id", addressId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!address) return apiError("Delivery address not found.", 404);

  const settings = await loadPricingSettings(auth.supabase);
  const stockist = resolveFulfilmentStockist(
    await listActiveStockists(auth.supabase),
    { lat: address.lat, lng: address.lng }
  );
  if (!stockist) {
    return json({ quote: null, reason: "no_stockist" });
  }

  const distanceKm = await getRoadDistanceKm(
    { lat: stockist.lat, lng: stockist.lng },
    { lat: address.lat, lng: address.lng }
  );
  const quote = computeQuote({ items, distanceKm, settings });

  return json({
    quote,
    stockist: {
      id: stockist.id,
      name: stockist.name,
      address: stockist.address,
      city: stockist.city,
    },
  });
}
