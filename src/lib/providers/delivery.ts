/**
 * Delivery provider abstraction.
 *
 * Implementations of `DeliveryProvider`:
 *   - `SimDeliveryProvider`         — default. Assigns a simulated rider so the
 *                                     full flow works without any credentials.
 *   - `ManualDeliveryProvider`      — staff dispatch a rider by hand; the app
 *                                     tracks the assignment and status updates.
 *   - `UberDirectDeliveryProvider`  — live Uber Direct API (the only
 *                                     self-serve, API-friendly courier available
 *                                     in Nairobi). Requires Uber Direct
 *                                     credentials + a business agreement.
 *
 * Note on Bolt: Bolt has no public self-serve dispatch API (access is gated
 * behind a B2B contract). Because the provider interface below is pluggable,
 * a Bolt driver can be added the moment access is granted — without touching
 * the rest of the app.
 *
 * Switch with `DELIVERY_PROVIDER=sim|manual|uber_direct`.
 */

import { config } from "@/lib/config";
import { generateReference } from "@/lib/utils";
import type { DeliveryProviderName, DeliveryStatus } from "@/lib/types";

export interface DeliveryAddress {
  name: string;
  phone: string;
  line1: string;
  area?: string | null;
  city: string;
  lat: number;
  lng: number;
  notes?: string | null;
}

export interface DispatchRequest {
  orderId: string;
  orderNumber: string;
  pickup: DeliveryAddress;
  dropoff: DeliveryAddress;
  /** Manifest summary shown to the courier, e.g. "8 items · 12 kg". */
  manifest?: string;
  /** Fee we are paying the courier, in cents (for reconciliation). */
  feeCents: number;
}

export interface DispatchResult {
  provider: DeliveryProviderName;
  externalId: string | null;
  status: DeliveryStatus;
  courierName: string | null;
  courierPhone: string | null;
  trackingUrl: string | null;
  raw: unknown;
}

export interface DeliveryStatusResult {
  status: DeliveryStatus;
  courierName: string | null;
  courierPhone: string | null;
  trackingUrl: string | null;
  raw: unknown;
}

export interface DeliveryProvider {
  name: DeliveryProviderName;
  createDelivery(req: DispatchRequest): Promise<DispatchResult>;
  getStatus(externalId: string): Promise<DeliveryStatusResult>;
  cancel(externalId: string, reason?: string): Promise<void>;
}

const SIM_RIDERS = [
  { name: "Brian Otieno", phone: "+254712000111" },
  { name: "Mary Wanjiku", phone: "+254722000222" },
  { name: "Kevin Mwangi", phone: "+254733000333" },
  { name: "Faith Achieng", phone: "+254701000444" },
];

/* -------------------------------------------------------------------------- */
/* Simulation provider                                                        */
/* -------------------------------------------------------------------------- */

export class SimDeliveryProvider implements DeliveryProvider {
  name: DeliveryProviderName = "sim";

  async createDelivery(req: DispatchRequest): Promise<DispatchResult> {
    const rider = SIM_RIDERS[Math.floor(Math.random() * SIM_RIDERS.length)];
    const externalId = `sim_dlv_${generateReference("", 10).toLowerCase()}`;
    return {
      provider: "sim",
      externalId,
      status: "assigned",
      courierName: rider.name,
      courierPhone: rider.phone,
      trackingUrl: `/orders/${req.orderId}`,
      raw: {
        simulated: true,
        order: req.orderNumber,
        rider,
        note: "Simulated rider assignment. Progress the status from the order page.",
      },
    };
  }

  async getStatus(): Promise<DeliveryStatusResult> {
    return {
      status: "assigned",
      courierName: null,
      courierPhone: null,
      trackingUrl: null,
      raw: { simulated: true },
    };
  }

  async cancel(): Promise<void> {
    // no-op for simulation
  }
}

/* -------------------------------------------------------------------------- */
/* Manual (staff-assisted) provider                                           */
/* -------------------------------------------------------------------------- */

/**
 * Used when riders are dispatched by hand (e.g. an in-house fleet or a Bolt
 * request placed manually by staff). The delivery is created in a
 * `requested` state and an admin assigns a rider from the dashboard.
 */
export class ManualDeliveryProvider implements DeliveryProvider {
  name: DeliveryProviderName = "manual";

  async createDelivery(req: DispatchRequest): Promise<DispatchResult> {
    return {
      provider: "manual",
      externalId: `manual_${generateReference("", 10).toLowerCase()}`,
      status: "requested",
      courierName: null,
      courierPhone: null,
      trackingUrl: `/orders/${req.orderId}`,
      raw: { manual: true, order: req.orderNumber },
    };
  }

  async getStatus(): Promise<DeliveryStatusResult> {
    return {
      status: "requested",
      courierName: null,
      courierPhone: null,
      trackingUrl: null,
      raw: { manual: true },
    };
  }

  async cancel(): Promise<void> {
    // Cancellation handled by staff in the dashboard.
  }
}

/* -------------------------------------------------------------------------- */
/* Uber Direct provider                                                       */
/* -------------------------------------------------------------------------- */

interface UberToken {
  accessToken: string;
  expiresAt: number;
}

export class UberDirectDeliveryProvider implements DeliveryProvider {
  name: DeliveryProviderName = "uber_direct";
  private tokenCache: UberToken | null = null;

  private get customerId(): string {
    const id = config.delivery.uber.customerId;
    if (!id) throw new Error("UBER_CUSTOMER_ID is not configured.");
    return id;
  }

  private assertConfigured() {
    const { clientId, clientSecret, customerId } = config.delivery.uber;
    if (!clientId || !clientSecret || !customerId) {
      throw new Error(
        "Uber Direct is not configured. Set UBER_CLIENT_ID, UBER_CLIENT_SECRET and UBER_CUSTOMER_ID."
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    this.assertConfigured();
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken;
    }

    const { clientId, clientSecret } = config.delivery.uber;
    const res = await fetch("https://login.uber.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        grant_type: "client_credentials",
        scope: "eats.deliveries",
      }),
    });
    if (!res.ok) {
      throw new Error(`Uber Direct auth failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const token = await this.getAccessToken();
    const res = await fetch(`https://api.uber.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Uber Direct ${path} failed (${res.status}): ${text}`);
    }
    return text ? JSON.parse(text) : {};
  }

  async createDelivery(req: DispatchRequest): Promise<DispatchResult> {
    // 1. Request a quote for the route.
    const quote = (await this.request(
      `/v1/customers/${this.customerId}/delivery_quotes`,
      {
        method: "POST",
        body: JSON.stringify({
          pickup_address: formatAddress(req.pickup),
          dropoff_address: formatAddress(req.dropoff),
          pickup_latitude: req.pickup.lat,
          pickup_longitude: req.pickup.lng,
          dropoff_latitude: req.dropoff.lat,
          dropoff_longitude: req.dropoff.lng,
        }),
      }
    )) as { id: string };

    // 2. Create the delivery from the quote.
    const delivery = (await this.request(
      `/v1/customers/${this.customerId}/deliveries`,
      {
        method: "POST",
        body: JSON.stringify({
          quote_id: quote.id,
          manifest_items: [{ name: req.manifest ?? "Farmer's Choice order", quantity: 1 }],
          pickup_name: req.pickup.name,
          pickup_address: formatAddress(req.pickup),
          pickup_phone_number: req.pickup.phone,
          pickup_latitude: req.pickup.lat,
          pickup_longitude: req.pickup.lng,
          dropoff_name: req.dropoff.name,
          dropoff_address: formatAddress(req.dropoff),
          dropoff_phone_number: req.dropoff.phone,
          dropoff_latitude: req.dropoff.lat,
          dropoff_longitude: req.dropoff.lng,
          external_id: req.orderNumber,
        }),
      }
    )) as {
      id: string;
      status: string;
      courier?: { name?: string; phone_number?: string };
      tracking_url?: string;
    };

    return {
      provider: "uber_direct",
      externalId: delivery.id,
      status: mapUberStatus(delivery.status),
      courierName: delivery.courier?.name ?? null,
      courierPhone: delivery.courier?.phone_number ?? null,
      trackingUrl: delivery.tracking_url ?? null,
      raw: delivery,
    };
  }

  async getStatus(externalId: string): Promise<DeliveryStatusResult> {
    const delivery = (await this.request(
      `/v1/customers/${this.customerId}/deliveries/${externalId}`,
      { method: "GET" }
    )) as {
      status: string;
      courier?: { name?: string; phone_number?: string };
      tracking_url?: string;
    };
    return {
      status: mapUberStatus(delivery.status),
      courierName: delivery.courier?.name ?? null,
      courierPhone: delivery.courier?.phone_number ?? null,
      trackingUrl: delivery.tracking_url ?? null,
      raw: delivery,
    };
  }

  async cancel(externalId: string, reason?: string): Promise<void> {
    await this.request(
      `/v1/customers/${this.customerId}/deliveries/${externalId}/cancel`,
      { method: "POST", body: JSON.stringify({ reason: reason ?? "cancelled_by_merchant" }) }
    );
  }
}

function formatAddress(a: DeliveryAddress): string {
  return [a.line1, a.area, a.city].filter(Boolean).join(", ");
}

function mapUberStatus(status: string): DeliveryStatus {
  switch (status) {
    case "pending":
    case "pickup":
      return "requested";
    case "pickup_complete":
    case "dropoff":
      return "delivering";
    case "delivered":
      return "delivered";
    case "canceled":
    case "cancelled":
      return "cancelled";
    case "returned":
      return "failed";
    default:
      return "assigned";
  }
}

/* -------------------------------------------------------------------------- */
/* Factory                                                                    */
/* -------------------------------------------------------------------------- */

let cached: DeliveryProvider | null = null;

export function getDeliveryProvider(): DeliveryProvider {
  if (cached) return cached;
  switch (config.delivery.provider) {
    case "uber_direct":
      cached = new UberDirectDeliveryProvider();
      break;
    case "manual":
      cached = new ManualDeliveryProvider();
      break;
    default:
      cached = new SimDeliveryProvider();
  }
  return cached;
}
