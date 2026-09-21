import { requireApiUser, json, apiError, zodMessage } from "@/lib/api";
import { config } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePayment } from "@/lib/checkout";
import { simulatePaymentSchema } from "@/lib/validation";
import { generateReference } from "@/lib/utils";

/**
 * POST /api/dev/simulate-payment
 *
 * Development/demo helper that stands in for the customer authorising the
 * STK push. Hard-disabled in production and when a live money provider is
 * configured, so it can never move real money.
 */
export async function POST(request: Request) {
  if (config.money.provider !== "sim" || process.env.NODE_ENV === "production") {
    return apiError("Payment simulation is disabled.", 403);
  }

  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = simulatePaymentSchema.safeParse(body);
  if (!parsed.success) return apiError(zodMessage(parsed.error), 422);

  const { orderId, outcome } = parsed.data;

  // Ownership check — the caller must own the order.
  const { data: order } = await auth.supabase
    .from("orders")
    .select("id, user_id, order_number")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.user_id !== auth.user.id) {
    return apiError("Order not found.", 404);
  }

  const admin = createAdminClient();
  const success = outcome === "success";

  const result = await finalizePayment(admin, {
    orderId,
    success,
    resultCode: success ? 0 : 1,
    resultDesc: success ? "The service request is processed successfully." : "Simulated failure.",
    receipt: success ? `SIM${generateReference("", 7)}` : null,
    raw: { simulated: true, outcome },
    actor: "simulator",
  });

  return json(result);
}
