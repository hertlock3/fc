import { json } from "@/lib/api";
import { config } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { finalizePayment } from "@/lib/checkout";

/**
 * POST /api/payments/mpesa/callback
 *
 * Public webhook Safaricom calls with the STK Push result. Protected by a
 * shared-secret token appended to the callback URL, plus structural
 * validation of the payload. Always returns 200 so Safaricom does not retry
 * indefinitely.
 */
export async function POST(request: Request) {
  // 1. Verify the shared secret (when configured).
  if (config.money.mpesa.callbackSecret) {
    const token = new URL(request.url).searchParams.get("token");
    if (token !== config.money.mpesa.callbackSecret) {
      return json({ ResultCode: 1, ResultDesc: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => null);
  const stk = (body as { Body?: { stkCallback?: Record<string, unknown> } } | null)?.Body
    ?.stkCallback as
    | {
        MerchantRequestID?: string;
        CheckoutRequestID?: string;
        ResultCode?: number;
        ResultDesc?: string;
        CallbackMetadata?: { Item?: Array<{ Name: string; Value?: unknown }> };
      }
    | undefined;

  if (!stk || !stk.CheckoutRequestID) {
    return json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  }

  const meta = stk.CallbackMetadata?.Item ?? [];
  const receipt = meta.find((i) => i.Name === "MpesaReceiptNumber")?.Value as
    | string
    | undefined;
  const amount = meta.find((i) => i.Name === "Amount")?.Value as number | undefined;

  try {
    const admin = createAdminClient();
    await finalizePayment(admin, {
      checkoutRequestId: stk.CheckoutRequestID,
      success: stk.ResultCode === 0,
      resultCode: stk.ResultCode ?? null,
      resultDesc: stk.ResultDesc ?? null,
      receipt: receipt ?? null,
      amountCents: typeof amount === "number" ? Math.round(amount * 100) : null,
      raw: stk,
      actor: "mpesa",
    });
  } catch (err) {
    // Log and acknowledge — Safaricom retries on non-2xx.
    console.error("M-Pesa callback processing error:", err);
  }

  return json({ ResultCode: 0, ResultDesc: "Accepted" });
}
