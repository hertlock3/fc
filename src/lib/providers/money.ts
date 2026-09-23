/**
 * Money provider abstraction.
 *
 * A single interface (`MoneyProvider`) is implemented by:
 *   - `SimMoneyProvider`   — default, no credentials. Charges auto-confirm
 *                            when the order page polls for status, so the
 *                            whole checkout flow works in demos/CI.
 *   - `DarajaMoneyProvider` — live Safaricom Daraja STK Push (Lipa na M-Pesa).
 *
 * Switch with `MONEY_PROVIDER=sim|daraja`.
 */

import { config } from "@/lib/config";
import { generateReference } from "@/lib/utils";

export type MoneyProviderName = "sim" | "daraja";

export interface ChargeRequest {
  orderId: string;
  orderNumber: string;
  amountCents: number;
  phone: string; // 2547XXXXXXXX
  /** M-Pesa till number (Buy Goods) that receives the money — from merchant settings. */
  tillNumber: string;
  accountReference: string;
  description: string;
  callbackUrl: string;
}

export interface ChargeResult {
  provider: MoneyProviderName;
  merchantRequestId: string | null;
  checkoutRequestId: string | null;
  customerMessage: string;
  raw: unknown;
}

export interface ChargeStatus {
  /** "processing" while the customer is yet to authorise. */
  status: "processing" | "paid" | "failed" | "cancelled";
  resultCode: number | null;
  resultDesc: string | null;
  receipt: string | null;
  amountCents: number | null;
  raw: unknown;
}

export interface MoneyProvider {
  name: MoneyProviderName;
  initiateCharge(req: ChargeRequest): Promise<ChargeResult>;
  /**
   * `tillNumber` is the shortcode the original push was sent to (Buy Goods
   * flow) — Daraja's query API requires it to match.
   */
  queryStatus(checkoutRequestId: string, tillNumber?: string): Promise<ChargeStatus>;
}

/* -------------------------------------------------------------------------- */
/* Simulation provider                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic, credential-free provider used for local development, demos
 * and CI. A charge is confirmed the moment the order page polls for status —
 * the checkout → payment → order lifecycle runs end-to-end with no human
 * input and no dev-only endpoints.
 *
 * The provider is deliberately STATELESS: route handlers in Next.js each get
 * their own module instance, so no in-memory map would be shared between the
 * checkout and the polling route. Confirmation is derived purely from the
 * checkout reference (`SIM-CO-…` ⇒ paid) with a deterministic receipt, which
 * survives server restarts and multi-instance deployments.
 */
export class SimMoneyProvider implements MoneyProvider {
  name: MoneyProviderName = "sim";

  async initiateCharge(req: ChargeRequest): Promise<ChargeResult> {
    const merchantRequestId = `SIM-MR-${generateReference("", 10)}`;
    const checkoutRequestId = `SIM-CO-${generateReference("", 10)}`;
    return {
      provider: "sim",
      merchantRequestId,
      checkoutRequestId,
      customerMessage:
        "Demo payment started — it will confirm automatically in a few seconds.",
      raw: {
        simulated: true,
        request: {
          amount: req.amountCents / 100,
          phone: req.phone,
          accountReference: req.accountReference,
        },
      },
    };
  }

  async queryStatus(checkoutRequestId: string): Promise<ChargeStatus> {
    // A stable receipt so the order page shows the same number on every poll.
    const receipt = simReceiptFor(checkoutRequestId);
    return {
      status: "paid",
      resultCode: 0,
      resultDesc: "Simulated payment accepted.",
      receipt,
      amountCents: null,
      raw: { checkoutRequestId, simulated: true },
    };
  }
}

/** Deterministic M-Pesa-style receipt for a simulated checkout reference. */
function simReceiptFor(checkoutRequestId: string): string {
  const hash = Buffer.from(checkoutRequestId).toString("base64url").toUpperCase();
  return `SIM${hash.replace(/[^A-Z0-9]/g, "").slice(0, 9)}`;
}

/* -------------------------------------------------------------------------- */
/* Daraja (live M-Pesa) provider                                              */
/* -------------------------------------------------------------------------- */

interface DarajaToken {
  accessToken: string;
  expiresAt: number;
}

export class DarajaMoneyProvider implements MoneyProvider {
  name: MoneyProviderName = "daraja";
  private tokenCache: DarajaToken | null = null;

  private get baseUrl(): string {
    return config.money.mpesa.environment === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  }

  private assertConfigured(receiver?: string) {
    const { consumerKey, consumerSecret, passkey } = config.money.mpesa;
    if (!consumerKey || !consumerSecret || !passkey) {
      throw new Error(
        "Daraja is not fully configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET and MPESA_PASSKEY."
      );
    }
    if (receiver !== undefined && !receiver) {
      throw new Error(
        "No receiving till is configured. Set the M-Pesa till number (Admin → Finance, or TILL_NUMBER)."
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    this.assertConfigured();
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.accessToken;
    }

    const { consumerKey, consumerSecret } = config.money.mpesa;
    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

    const res = await fetch(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${basic}` } }
    );
    if (!res.ok) {
      throw new Error(`M-Pesa auth failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: string };
    const ttl = Number(data.expires_in ?? "3599") * 1000;
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + ttl,
    };
    return data.access_token;
  }

  private buildPassword(shortcode: string): { password: string; timestamp: string } {
    const { passkey } = config.money.mpesa;
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
      "base64"
    );
    return { password, timestamp };
  }

  /**
   * The shortcode a charge is pushed to, plus its transaction type.
   *
   * Sandbox only validates its own registered test shortcode (`174379`) in
   * the Paybill flow — a real till or the Buy Goods type is rejected there
   * ("Invalid TransactionType"), and sandbox never delivers prompts to real
   * phones anyway. Production pushes to the merchant's till (Buy Goods — the
   * till IS the business shortcode and PartyB) or the configured shortcode
   * (Paybill).
   */
  private chargeParams(tillNumber?: string): {
    receiver: string;
    transactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  } {
    if (config.money.mpesa.environment !== "production") {
      return {
        receiver: config.money.mpesa.shortcode,
        transactionType: "CustomerPayBillOnline",
      };
    }
    const { transactionType } = config.money.mpesa;
    return {
      receiver:
        transactionType === "CustomerBuyGoodsOnline"
          ? tillNumber ?? config.till.number
          : config.money.mpesa.shortcode,
      transactionType,
    };
  }

  async initiateCharge(req: ChargeRequest): Promise<ChargeResult> {
    const token = await this.getAccessToken();
    const { receiver, transactionType } = this.chargeParams(req.tillNumber);
    this.assertConfigured(receiver);
    const { password, timestamp } = this.buildPassword(receiver);

    const body = {
      BusinessShortCode: receiver,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: Math.round(req.amountCents / 100),
      PartyA: req.phone,
      PartyB: receiver,
      PhoneNumber: req.phone,
      CallBackURL: req.callbackUrl,
      AccountReference: req.accountReference,
      TransactionDesc: req.description,
    };

    const res = await fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      CustomerMessage?: string;
      ResponseCode?: string;
      errorMessage?: string;
    };

    if (!res.ok || data.ResponseCode !== "0") {
      throw new Error(
        `M-Pesa STK push failed: ${data.errorMessage ?? JSON.stringify(data)}`
      );
    }

    return {
      provider: "daraja",
      merchantRequestId: data.MerchantRequestID ?? null,
      checkoutRequestId: data.CheckoutRequestID ?? null,
      customerMessage:
        data.CustomerMessage ?? "Enter your M-Pesa PIN on your phone to complete payment.",
      raw: data,
    };
  }

  async queryStatus(checkoutRequestId: string, tillNumber?: string): Promise<ChargeStatus> {
    const token = await this.getAccessToken();
    // Must match the shortcode the original push was sent to, or Daraja
    // rejects the query with "invalid checkout request id".
    const { receiver } = this.chargeParams(tillNumber);
    this.assertConfigured(receiver);
    const { password, timestamp } = this.buildPassword(receiver);

    const res = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: receiver,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const data = (await res.json()) as {
      ResultCode?: string;
      ResultDesc?: string;
      errorMessage?: string;
    };

    const code = data.ResultCode ? Number(data.ResultCode) : null;
    const status: ChargeStatus["status"] =
      code === 0 ? "paid" : code == null ? "processing" : code === 1032 ? "cancelled" : "failed";

    return {
      status,
      resultCode: code,
      resultDesc: data.ResultDesc ?? data.errorMessage ?? null,
      receipt: null,
      amountCents: null,
      raw: data,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

let cached: MoneyProvider | null = null;

export function getMoneyProvider(): MoneyProvider {
  if (cached) return cached;
  cached =
    config.money.provider === "daraja"
      ? new DarajaMoneyProvider()
      : new SimMoneyProvider();
  return cached;
}

/** Build a signed, tamper-evident callback URL for the active provider. */
export function buildCallbackUrl(): string {
  const base = `${config.appUrl.replace(/\/$/, "")}/api/payments/mpesa/callback`;
  if (config.money.mpesa.callbackSecret) {
    return `${base}?token=${encodeURIComponent(config.money.mpesa.callbackSecret)}`;
  }
  return base;
}
