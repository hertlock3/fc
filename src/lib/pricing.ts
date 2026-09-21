import { config } from "./config";
import { applyPercent, toWholeShilling } from "./money";
import type { CartPricing } from "./types";

/** A geographic point. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Pricing knobs — sourced from env, optionally overridden by the DB. */
export interface PricingSettings {
  serviceFeePercent: number;
  delivery: {
    baseFee: number;
    perKmFee: number;
    minFee: number;
    maxFee: number;
    peakMultiplier: number;
  };
}

export function defaultPricingSettings(): PricingSettings {
  return {
    serviceFeePercent: config.serviceFee.percent,
    delivery: { ...config.deliveryPricing },
  };
}

/* -------------------------------------------------------------------------- */
/* Distance                                                                   */
/* -------------------------------------------------------------------------- */

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance used for fee calculation.
 *
 * - `haversine` model multiplies straight-line distance by a road factor to
 *   approximate actual driving distance (no API key required).
 * - `google` model calls the Google Routes/Distance Matrix API when a key is
 *   configured, falling back to haversine on failure.
 */
export async function getRoadDistanceKm(
  origin: LatLng,
  destination: LatLng
): Promise<number> {
  if (config.distance.provider === "google" && config.distance.googleApiKey) {
    try {
      const res = await fetch(
        "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": config.distance.googleApiKey,
            "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,duration",
          },
          body: JSON.stringify({
            origins: [
              {
                waypoint: {
                  location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
                },
              },
            ],
            destinations: [
              {
                waypoint: {
                  location: {
                    latLng: { latitude: destination.lat, longitude: destination.lng },
                  },
                },
              },
            ],
            travelMode: "DRIVE",
          }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as Array<{ distanceMeters?: number }>;
        const meters = data?.[0]?.distanceMeters;
        if (typeof meters === "number" && meters > 0) {
          return meters / 1000;
        }
      }
    } catch {
      // fall through to haversine
    }
  }

  const straight = haversineKm(origin, destination);
  return straight * config.distance.roadFactor;
}

/* -------------------------------------------------------------------------- */
/* Delivery fee                                                               */
/* -------------------------------------------------------------------------- */

/** Peak-hour multiplier applies during Nairobi rush hours (local time). */
export function isPeakHour(at: Date = new Date()): boolean {
  const hour = at.getHours();
  return (hour >= 7 && hour < 9) || (hour >= 16 && hour < 19);
}

/**
 * Compute the delivery fee in **cents** for a given distance.
 *
 * `settings.delivery` values are expressed in KES:
 *   fee = (baseFee + perKm * km) * peakMultiplier, clamped to [min, max].
 * The result is converted to integer cents and rounded to a clean whole
 * shilling for mobile money.
 */
export function computeDeliveryFee(
  distanceKm: number,
  settings: PricingSettings = defaultPricingSettings(),
  at: Date = new Date()
): number {
  const { baseFee, perKmFee, minFee, maxFee, peakMultiplier } = settings.delivery;
  let fee = baseFee + perKmFee * Math.max(0, distanceKm);
  if (isPeakHour(at)) fee *= peakMultiplier;
  const clamped = Math.min(Math.max(fee, minFee), maxFee);
  // Convert KES → cents, then round to a whole shilling.
  return toWholeShilling(Math.round(clamped * 100));
}

/* -------------------------------------------------------------------------- */
/* Full quote                                                                 */
/* -------------------------------------------------------------------------- */

export interface QuoteItemInput {
  product_id: string;
  name: string;
  unit: string;
  unit_price_cents: number;
  quantity: number;
}

/**
 * Build a complete, server-authoritative cart quote.
 *
 * The platform service fee is applied to (goods + delivery) and the vendor
 * payout is everything the customer pays minus the platform's service fee.
 */
export function computeQuote(params: {
  items: QuoteItemInput[];
  distanceKm: number | null;
  settings?: PricingSettings;
  at?: Date;
}): CartPricing {
  const settings = params.settings ?? defaultPricingSettings();
  const items = params.items.map((item) => ({
    ...item,
    line_total_cents: item.unit_price_cents * item.quantity,
  }));

  const subtotal_cents = items.reduce((sum, i) => sum + i.line_total_cents, 0);
  const delivery_fee_cents =
    params.distanceKm == null ? 0 : computeDeliveryFee(params.distanceKm, settings, params.at);

  const service_fee_cents = applyPercent(
    subtotal_cents + delivery_fee_cents,
    settings.serviceFeePercent
  );

  const total_cents = subtotal_cents + delivery_fee_cents + service_fee_cents;
  const platform_fee_cents = service_fee_cents;
  const vendor_payout_cents = subtotal_cents;

  return {
    items,
    subtotal_cents,
    delivery_fee_cents,
    service_fee_cents,
    service_fee_percent: settings.serviceFeePercent,
    total_cents,
    vendor_payout_cents,
    platform_fee_cents,
    distance_km: params.distanceKm,
  };
}
