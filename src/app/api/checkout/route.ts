import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { createOrderFromCart } from "@/lib/checkout";

/**
 * POST /api/checkout
 * Converts the cart into an order, generates the invoice and initiates the
 * M-Pesa charge. All amounts are recomputed server-side.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  try {
    const result = await createOrderFromCart({
      userId: auth.user.id,
      addressId: parsed.data.addressId,
      customerNotes: parsed.data.customerNotes || null,
    });
    return json(result, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Checkout failed.", 400);
  }
}
