import { requireApiUser, json, apiError } from "@/lib/api";
import { getOrderWithRelations } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiateOrderCharge } from "@/lib/checkout";
import { normalizeKenyanPhone } from "@/lib/utils";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * POST /api/orders/:id/retry-payment
 *
 * Re-sends the M-Pesa STK push for an order whose payment failed, was
 * cancelled, or whose prompt expired while still `pending_payment`. The
 * pay-panel's "Resend payment request" button and the panel's sim-mode hint
 * both hit this endpoint; each retry creates a fresh `payments` row so the
 * payment history stays auditable.
 *
 * Owner-only, rate-limited (6 per 10 minutes per client), and the charge is
 * initiated through the exact same code path as checkout.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const limiter = rateLimit(clientKey(_request, "retry-payment"), 6, 10 * 60_000);
  if (!limiter.ok) {
    return apiError(
      "Too many payment retries — please wait a few minutes and try again.",
      429,
      { retryAfterSeconds: limiter.retryAfterSeconds }
    );
  }

  const { id } = await params;
  const order = await getOrderWithRelations(auth.supabase, id);
  if (!order) return apiError("Order not found.", 404);
  if (order.user_id !== auth.user.id) {
    return apiError("You can only retry payment for your own order.", 403);
  }

  // Only orders that are still waiting for money can be retried; once paid the
  // idempotency guard in finalizePayment makes further attempts no-ops anyway.
  if (order.status !== "pending_payment") {
    return apiError(
      order.payment_status === "paid"
        ? "This order is already paid."
        : "This order can no longer be paid for online.",
      409
    );
  }
  if (order.payment_status === "processing") {
    return apiError(
      "A payment request is already on its way — check your phone for the M-Pesa prompt (it may take a few seconds).",
      409
    );
  }

  // Charge the profile phone by default; a paying contact number may be
  // supplied by the owner if someone else covers the bill.
  let phone = normalizeKenyanPhone(auth.user.phone ?? "");
  const body = await _request
    .json()
    .catch(() => null);
  const bodyPhone = (body as { phone?: unknown } | null)?.phone;
  if (typeof bodyPhone === "string" && bodyPhone.trim()) {
    const normalized = normalizeKenyanPhone(bodyPhone);
    if (!normalized) {
      return apiError("Enter a valid Kenyan phone number, e.g. 0712 345 678.", 422);
    }
    phone = normalized;
  }
  if (!phone) {
    return apiError(
      "Add a valid M-Pesa phone number to your profile before paying.",
      422
    );
  }

  try {
    const { customerMessage } = await initiateOrderCharge({
      admin: createAdminClient(),
      order: {
        id: order.id,
        order_number: order.order_number,
        total_cents: order.total_cents,
        },
      phone,
    });
    return json({ ok: true, customerMessage });
  } catch (err) {
    return apiError(
      err instanceof Error ? err.message : "Payment could not be started.",
      502
    );
  }
}
