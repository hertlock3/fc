import { requireApiUser, json, apiError } from "@/lib/api";
import { getOrderWithRelations } from "@/lib/queries";

/** GET /api/orders/:id — fetch an order (RLS enforces ownership/admin). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const order = await getOrderWithRelations(auth.supabase, id);
  if (!order) return apiError("Order not found.", 404);

  return json({
    order: {
      id: order.id,
      status: order.status,
      payment_status: order.payment_status,
      delivery_status: order.delivery_status,
      total_cents: order.total_cents,
      mpesa_receipt: order.mpesa_receipt,
      updated_at: order.updated_at,
    },
  });
}
