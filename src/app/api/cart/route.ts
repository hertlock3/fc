import { z } from "zod";
import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { addToCart, setCartItemQuantity, getCartItems } from "@/lib/cart";
import { addToCartSchema, updateCartItemSchema } from "@/lib/validation";

/** GET /api/cart — list current cart items. */
export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const items = await getCartItems(auth.supabase, auth.user.id);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  return json({ items, count });
}

/** POST /api/cart — add a product (or increase its quantity). */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = addToCartSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const { productId, quantity } = parsed.data;
  const { data: product } = await auth.supabase
    .from("products")
    .select("id, price_cents, is_active, in_stock")
    .eq("id", productId)
    .maybeSingle();

  if (!product || !product.is_active) return apiError("Product not available.", 404);
  if (!product.in_stock) return apiError("This product is out of stock.", 409);

  try {
    const nextQuantity = await addToCart(
      auth.supabase,
      auth.user.id,
      productId,
      quantity,
      product.price_cents
    );
    return json({ ok: true, quantity: nextQuantity });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not update cart.", 500);
  }
}

/**
 * PATCH /api/cart — set an exact quantity (0 removes the line).
 * DELETE /api/cart — clear the whole cart.
 */
const patchSchema = updateCartItemSchema.extend({ productId: z.string().uuid() });

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  try {
    await setCartItemQuantity(
      auth.supabase,
      auth.user.id,
      parsed.data.productId,
      parsed.data.quantity
    );
    return json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Could not update cart.", 500);
  }
}

export async function DELETE() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  await auth.supabase.from("cart_items").delete().eq("user_id", auth.user.id);
  return json({ ok: true });
}
