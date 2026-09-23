import { requireApiUser, json, apiError } from "@/lib/api";
import { getOrderWithRelations } from "@/lib/queries";
import { getMoneyProvider } from "@/lib/providers/money";
import { loadMerchantSettings } from "@/lib/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePayment } from "@/lib/checkout";
import { config } from "@/lib/config";

/**
 * GET /api/orders/:id/payment-status
 *
 * Real-time payment status for the order page. When a live M-Pesa charge is
 * still `pending`/`processing`, this endpoint actively queries Daraja's STK
 * Push Query API and finalises the order on the spot — so the customer sees
 * the confirmation the moment Safaricom reports it, without waiting for the
 * asynchronous callback webhook (which remains supported as a fallback).
 *
 * The page polls this every few seconds while a payment is in flight.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const order = await getOrderWithRelations(auth.supabase, id);
  if (!order) return apiError("Order not found.", 404);

  let paymentStatus = order.payment_status;
  let orderStatus = order.status;
  let receipt = order.mpesa_receipt;

  // Actively resolve in-flight charges via the provider's query API. This
  // runs for BOTH providers: daraja asks Safaricom's STK query API, and the
  // sim provider confirms its charges here so the whole flow works in demos
  // and CI. The callback webhook remains a fallback for the live provider.
  const inFlight =
    (paymentStatus === "pending" || paymentStatus === "processing") &&
    Boolean(order.payment_ref);

  if (inFlight) {
    try {
      const provider = getMoneyProvider();
      const merchant = await loadMerchantSettings(auth.supabase);
      const charge = await provider.queryStatus(order.payment_ref!, merchant.till);

      if (charge.status !== "processing") {
        const admin = createAdminClient();
        const result = await finalizePayment(admin, {
          checkoutRequestId: order.payment_ref!,
          success: charge.status === "paid",
          resultCode: charge.resultCode,
          resultDesc: charge.resultDesc,
          receipt: charge.receipt,
          amountCents: charge.amountCents,
          raw: charge.raw,
          actor: "status_query",
        });
        if (result.status === "paid" || result.status === "failed") {
          paymentStatus =
            charge.status === "paid"
              ? "paid"
              : charge.resultCode === 1032
                ? "cancelled"
                : "failed";
          orderStatus =
            charge.status === "paid" ? "awaiting_vendor_approval" : orderStatus;
          receipt = charge.receipt ?? receipt;
        }
      }
    } catch (err) {
      // Query failures (network, auth, unknown id) must not break polling —
      // report the stored state and let the callback webhook settle it.
      console.error("Payment status query failed:", err);
    }
  }

  return json({
    payment_status: paymentStatus,
    status: orderStatus,
    mpesa_receipt: receipt,
    money_provider: config.money.provider,
  });
}
