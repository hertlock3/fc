/**
 * Money provider abstraction.
 *
 * A single interface (`MoneyProvider`) is implemented by:
 *   - `SimMoneyProvider`   — default, no credentials. Creates a pending charge
 *                            that is finalised via the simulation endpoint.
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
  queryStatus(checkoutRequestId: string): Promise<ChargeStatus>;
}

/* -------------------------------------------------------------------------- */
/* Simulation provider                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Deterministic, credential-free provider used for local development and
 * demos. It returns a `processing` charge; the payment is completed by the
 * `/api/dev/simulate-payment` endpoint (clearly gated to non-production).
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
        "Simulation mode: an STK push would appear on the customer's phone. Use the simulate button to complete it.",
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
    return {
      status: "processing",
      resultCode: null,
      resultDesc: "Simulation mode does not track live status.",
      receipt: null,
      amountCents: null,
      raw: { checkoutRequestId, simulated: true },
    };
  }
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

  private assertConfigured() {
    const { consumerKey, consumerSecret, shortcode, passkey } = config.money.mpesa;
    if (!consumerKey || !consumerSecret || !shortcode || !passkey) {
      throw new Error(
        "Daraja is not fully configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE and MPESA_PASSKEY."
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

  private buildPassword(): { password: string; timestamp: string } {
    const { shortcode, passkey } = config.money.mpesa;
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 14); // YYYYMMDDHHmmss
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
      "base64"
    );
    return { password, timestamp };
  }

  async initiateCharge(req: ChargeRequest): Promise<ChargeResult> {
    const token = await this.getAccessToken();
    const { shortcode, transactionType } = config.money.mpesa;
    const { password, timestamp } = this.buildPassword();

    const body = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: Math.round(req.amountCents / 100),
      PartyA: req.phone,
      PartyB: shortcode,
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

  async queryStatus(checkoutRequestId: string): Promise<ChargeStatus> {
    const token = await this.getAccessToken();
    const { shortcode } = config.money.mpesa;
    const { password, timestamp } = this.buildPassword();

    const res = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
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
