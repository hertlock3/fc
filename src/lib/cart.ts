import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartItem, Product } from "@/lib/types";

/** Fetch cart items joined with their product rows. */
export async function getCartItems(
  supabase: SupabaseClient,
  userId: string
): Promise<CartItem[]> {
  const { data, error } = await supabase
    .from("cart_items")
    .select("*, product:products(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as CartItem[];
}

/** Total number of units in the cart (for the header badge). */
export async function getCartCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const items = await getCartItems(supabase, userId);
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

/**
 * Add `quantity` of a product to the cart, merging with any existing line.
 * Returns the resulting quantity for that product.
 */
export async function addToCart(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
  quantity: number,
  unitPriceCents: number
): Promise<number> {
  const { data: existing } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();

  const nextQty = Math.min(99, (existing?.quantity ?? 0) + quantity);

  if (existing?.id) {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: nextQty, unit_price_cents: unitPriceCents })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("cart_items").insert({
      user_id: userId,
      product_id: productId,
      quantity: nextQty,
      unit_price_cents: unitPriceCents,
    });
    if (error) throw new Error(error.message);
  }
  return nextQty;
}

/** Set an exact quantity (0 removes the line). */
export async function setCartItemQuantity(
  supabase: SupabaseClient,
  userId: string,
  productId: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .eq("user_id", userId)
      .eq("product_id", productId);
    if (error) throw new Error(error.message);
    return;
  }
  const { error } = await supabase
    .from("cart_items")
    .update({ quantity: Math.min(99, quantity) })
    .eq("user_id", userId)
    .eq("product_id", productId);
  if (error) throw new Error(error.message);
}

/** Empty the cart (called after a successful order). */
export async function clearCart(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase.from("cart_items").delete().eq("user_id", userId);
}

/** Map cart rows to priced line inputs for `computeQuote`. */
export function toQuoteItems(items: CartItem[]) {
  return items
    .filter((item) => item.product && (item.product as Product).is_active)
    .map((item) => {
      const product = item.product as Product;
      return {
        product_id: product.id,
        name: product.name,
        unit: product.unit,
        // Always use the live product price at checkout time.
        unit_price_cents: product.price_cents,
        quantity: item.quantity,
      };
    });
}
