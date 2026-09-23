import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { computeQuote, getRoadDistanceKm } from "@/lib/pricing";
import { loadPricingSettings, loadMerchantSettings } from "@/lib/settings";
import { listActiveStockists, resolveFulfilmentStockist } from "@/lib/stockists";
import { getMoneyProvider, buildCallbackUrl } from "@/lib/providers/money";
import { toQuoteItems } from "@/lib/cart";
import {
  generateInvoiceNumber,
  generateOrderNumber,
  logOrderEvent,
} from "@/lib/orders";
import { normalizeKenyanPhone } from "@/lib/utils";
import type { Address, CartItem, OrderItem } from "@/lib/types";

export interface CreateOrderResult {
  orderId: string;
  orderNumber: string;
  totalCents: number;
  customerMessage: string;
}

/**
 * Turn the signed-in user's cart into an order, generate the customer invoice,
 * and kick off the M-Pesa charge. Server-authoritative: every price and fee is
 * recomputed here — nothing from the client is trusted.
 */
export async function createOrderFromCart(params: {
  userId: string;
  addressId: string;
  customerNotes?: string | null;
}): Promise<CreateOrderResult> {
  const admin = createAdminClient();

  // 1. Profile (contact phone) and delivery address --------------------------
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", params.userId)
    .maybeSingle();
  if (!profile) throw new Error("Your profile could not be found.");

  // Validate the payment phone up-front so we never create an order (and clear
  // the cart) for a customer who cannot actually be charged.
  const phone = normalizeKenyanPhone(profile.phone ?? "");
  if (!phone) {
    throw new Error(
      "Add a valid M-Pesa phone number to your profile before checking out."
    );
  }

  const { data: address } = await admin
    .from("addresses")
    .select("*")
    .eq("id", params.addressId)
    .eq("user_id", params.userId)
    .maybeSingle();
  if (!address) throw new Error("Please choose a valid delivery address.");
  const addr = address as Address;

  // 2. Cart items ------------------------------------------------------------
  const { data: cartData } = await admin
    .from("cart_items")
    .select("*, product:products(*)")
    .eq("user_id", params.userId);
  const cartItems = (cartData ?? []) as CartItem[];
  const lineItems = toQuoteItems(cartItems);
  if (lineItems.length === 0) throw new Error("Your cart is empty.");

  // 3. Server-side pricing ---------------------------------------------------
  // The order is fulfilled from the stockist nearest the customer (the
  // principal Ruiru plant is the fallback), and the delivery fee is computed
  // from that origin — not from a fixed central store.
  const settings = await loadPricingSettings(admin);
  const stockist = resolveFulfilmentStockist(
    await listActiveStockists(admin),
    { lat: addr.lat, lng: addr.lng }
  );
  if (!stockist) {
    throw new Error(
      "No fulfilment location is available right now. Please try again shortly."
    );
  }
  const distanceKm = await getRoadDistanceKm(
    { lat: stockist.lat, lng: stockist.lng },
    { lat: addr.lat, lng: addr.lng }
  );
  const quote = computeQuote({ items: lineItems, distanceKm, settings });

  // 4. Order -----------------------------------------------------------------
  const orderNumber = generateOrderNumber();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: params.userId,
      status: "pending_payment",
      payment_status: "pending",
      subtotal_cents: quote.subtotal_cents,
      delivery_fee_cents: quote.delivery_fee_cents,
      service_fee_cents: quote.service_fee_cents,
      total_cents: quote.total_cents,
      vendor_payout_cents: quote.vendor_payout_cents,
      platform_fee_cents: quote.platform_fee_cents,
      delivery_address: {
        label: addr.label,
        line1: addr.line1,
        area: addr.area,
        city: addr.city,
        lat: addr.lat,
        lng: addr.lng,
        notes: addr.delivery_notes,
        phone: profile.phone ?? "",
        recipient: profile.full_name ?? "Customer",
      },
      delivery_lat: addr.lat,
      delivery_lng: addr.lng,
      distance_km: distanceKm,
      stockist_id: stockist.id,
      customer_notes: params.customerNotes ?? null,
    })
    .select("id, order_number, total_cents")
    .single();
  if (orderError || !order) {
    throw new Error(`Could not create order: ${orderError?.message ?? "unknown"}`);
  }

  // 5. Line items ------------------------------------------------------------
  const orderItems: Omit<OrderItem, "id">[] = quote.items.map((i) => ({
    order_id: order.id,
    product_id: i.product_id,
    name: i.name,
    unit: i.unit,
    unit_price_cents: i.unit_price_cents,
    quantity: i.quantity,
    line_total_cents: i.line_total_cents,
  }));
  await admin.from("order_items").insert(orderItems);

  // 6. Customer invoice (receipt) -------------------------------------------
  await admin.from("invoices").insert({
    order_id: order.id,
    kind: "customer",
    invoice_number: generateInvoiceNumber("customer"),
    subtotal_cents: quote.subtotal_cents,
    delivery_fee_cents: quote.delivery_fee_cents,
    service_fee_cents: quote.service_fee_cents,
    total_cents: quote.total_cents,
    status: "issued",
    meta: {
      service_fee_percent: quote.service_fee_percent,
      distance_km: distanceKm,
      stockist: stockist.name,
    },
  });

  await logOrderEvent(
    admin,
    order.id,
    "order_created",
    `Order ${orderNumber} created. Total ${(quote.total_cents / 100).toLocaleString("en-KE")} KES. Fulfilled from ${stockist.name}.`,
    "customer"
  );

  // 7. Consume the cart ------------------------------------------------------
  await admin.from("cart_items").delete().eq("user_id", params.userId);

  // 8. Initiate the M-Pesa charge -------------------------------------------
  // Admin-amendable receiving account (M-Pesa till); env values are defaults.
  const merchant = await loadMerchantSettings(admin);
  const provider = getMoneyProvider();
  let customerMessage =
    "We sent a payment request to your phone. Enter your M-Pesa PIN to confirm.";

  const { data: paymentRow } = await admin
    .from("payments")
    .insert({
      order_id: order.id,
      provider: provider.name,
      amount_cents: quote.total_cents,
      phone,
      status: "pending",
    })
    .select("id")
    .single();

  try {
    const charge = await provider.initiateCharge({
      orderId: order.id,
      orderNumber,
      amountCents: quote.total_cents,
      phone,
      accountReference: `${merchant.accountPrefix}-${orderNumber}`.slice(0, 12),
      description: `Farmer's Choice order ${orderNumber}`.slice(0, 40),
      callbackUrl: buildCallbackUrl(),
    });

    await admin
      .from("payments")
      .update({
        status: "processing",
        merchant_request_id: charge.merchantRequestId,
        checkout_request_id: charge.checkoutRequestId,
        raw: charge.raw,
      })
      .eq("id", paymentRow?.id ?? "");

    await admin
      .from("orders")
      .update({
        payment_status: "processing",
        payment_ref: charge.checkoutRequestId,
      })
      .eq("id", order.id);

    await logOrderEvent(
      admin,
      order.id,
      "payment_initiated",
      "M-Pesa payment request sent to the customer's phone.",
      "system",
      { checkout_request_id: charge.checkoutRequestId }
    );
    customerMessage = charge.customerMessage;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Payment could not be started.";
    await admin
      .from("payments")
      .update({ status: "failed", result_desc: message })
      .eq("id", paymentRow?.id ?? "");
    await admin
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("id", order.id);
    await logOrderEvent(admin, order.id, "payment_error", message, "system");
    throw new Error(message);
  }

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    totalCents: order.total_cents,
    customerMessage,
  };
}

export interface FinalizePaymentInput {
  orderId?: string;
  checkoutRequestId?: string | null;
  success: boolean;
  resultCode?: number | null;
  resultDesc?: string | null;
  receipt?: string | null;
  amountCents?: number | null;
  raw?: unknown;
  actor?: string;
}

/**
 * Finalise a payment (called by the M-Pesa callback and the simulation
 * endpoint). Idempotent: repeated callbacks for the same order are ignored.
 */
export async function finalizePayment(
  admin: SupabaseClient,
  input: FinalizePaymentInput
): Promise<{ ok: boolean; status: "paid" | "failed" | "already_finalised" }> {
  // Locate the payment row (by checkout id if we have it, else by order).
  let paymentQuery = admin.from("payments").select("*");
  if (input.checkoutRequestId) {
    paymentQuery = paymentQuery.eq("checkout_request_id", input.checkoutRequestId);
  } else if (input.orderId) {
    paymentQuery = paymentQuery.eq("order_id", input.orderId).order("created_at", { ascending: false });
  } else {
    throw new Error("finalizePayment requires an orderId or checkoutRequestId.");
  }
  const { data: payment } = await paymentQuery.limit(1).maybeSingle();
  if (!payment) throw new Error("Payment record not found.");

  const orderId = payment.order_id as string;

  const { data: order } = await admin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Order not found.");

  // Idempotency guard.
  if (order.payment_status === "paid") {
    return { ok: true, status: "already_finalised" };
  }

  const actor = input.actor ?? "system";

  if (!input.success) {
    await admin
      .from("payments")
      .update({
        status: input.resultCode === 1032 ? "cancelled" : "failed",
        result_code: input.resultCode ?? null,
        result_desc: input.resultDesc ?? "Payment was not completed.",
        raw: input.raw ?? null,
      })
      .eq("id", payment.id);
    await admin
      .from("orders")
      .update({ payment_status: input.resultCode === 1032 ? "cancelled" : "failed" })
      .eq("id", orderId);
    await logOrderEvent(
      admin,
      orderId,
      "payment_failed",
      input.resultDesc ?? "Payment was not completed.",
      actor
    );
    return { ok: false, status: "failed" };
  }

  // Success path -------------------------------------------------------------
  const now = new Date().toISOString();
  await admin
    .from("payments")
    .update({
      status: "paid",
      result_code: input.resultCode ?? 0,
      result_desc: input.resultDesc ?? "Success",
      receipt: input.receipt ?? null,
      raw: input.raw ?? null,
    })
    .eq("id", payment.id);

  await admin
    .from("orders")
    .update({
      status: "awaiting_vendor_approval",
      payment_status: "paid",
      mpesa_receipt: input.receipt ?? null,
      paid_at: now,
    })
    .eq("id", orderId);

  await admin
    .from("invoices")
    .update({ status: "paid" })
    .eq("order_id", orderId)
    .eq("kind", "customer");

  // Farmer's Choice payout invoice (goods only; the platform keeps the fee).
  await admin.from("invoices").insert({
    order_id: orderId,
    kind: "vendor",
    invoice_number: generateInvoiceNumber("vendor"),
    subtotal_cents: order.subtotal_cents,
    delivery_fee_cents: order.delivery_fee_cents,
    service_fee_cents: 0,
    total_cents: order.vendor_payout_cents,
    status: "issued",
    meta: {
      platform_fee_cents: order.platform_fee_cents,
      service_fee_percent: config.serviceFee.percent,
      note: "Platform service fee deducted. Payout reflects goods value only.",
    },
  });

  await logOrderEvent(
    admin,
    orderId,
    "payment_received",
    `Payment confirmed${input.receipt ? ` (${input.receipt})` : ""}. Sent to Farmer's Choice for approval.`,
    actor
  );

  return { ok: true, status: "paid" };
}
