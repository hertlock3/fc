import { describe, expect, it } from "vitest";
import {
  computeDeliveryFee,
  computeQuote,
  defaultPricingSettings,
  haversineKm,
  isPeakHour,
  type PricingSettings,
} from "@/lib/pricing";

const settings: PricingSettings = {
  serviceFeePercent: 3,
  delivery: {
    baseFee: 100,
    perKmFee: 35,
    minFee: 130,
    maxFee: 1500,
    peakMultiplier: 1.15,
  },
};

const NOON = new Date(2026, 0, 15, 12, 0, 0);
const PEAK = new Date(2026, 0, 15, 8, 0, 0); // 08:00 rush hour

describe("haversineKm", () => {
  it("returns 0 for the same point", () => {
    expect(haversineKm({ lat: -1.28, lng: 36.81 }, { lat: -1.28, lng: 36.81 })).toBe(0);
  });

  it("estimates Nairobi CBD → Westlands at roughly 2–3 km", () => {
    const km = haversineKm({ lat: -1.2864, lng: 36.8172 }, { lat: -1.267, lng: 36.807 });
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(3.2);
  });

  it("is symmetric", () => {
    const a = { lat: -1.2864, lng: 36.8172 };
    const b = { lat: -1.267, lng: 36.807 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 10);
  });
});

describe("computeDeliveryFee", () => {
  it("returns the minimum fee for a very short trip", () => {
    expect(computeDeliveryFee(0, settings, NOON)).toBe(13000);
  });

  it("scales with distance (base 100 + 35/km), in cents", () => {
    expect(computeDeliveryFee(5, settings, NOON)).toBe(27500);
  });

  it("caps at the maximum fee", () => {
    expect(computeDeliveryFee(100, settings, NOON)).toBe(150000);
  });

  it("applies the peak-hour multiplier and rounds to a whole shilling", () => {
    expect(computeDeliveryFee(5, settings, PEAK)).toBe(31600); // 275 * 1.15 = 316.25
  });
});

describe("isPeakHour", () => {
  it("flags the Nairobi rush hours", () => {
    expect(isPeakHour(PEAK)).toBe(true);
    expect(isPeakHour(new Date(2026, 0, 15, 17, 30))).toBe(true);
    expect(isPeakHour(NOON)).toBe(false);
  });
});

describe("defaultPricingSettings", () => {
  it("defaults the platform service fee to 3%", () => {
    expect(defaultPricingSettings().serviceFeePercent).toBe(3);
  });
});

describe("computeQuote", () => {
  const items = [
    {
      product_id: "p1",
      name: "Beef Minced Meat",
      unit: "500g pack",
      unit_price_cents: 48000,
      quantity: 2,
    },
  ];

  it("adds the 3% service fee on (goods + delivery) and pays the vendor goods only", () => {
    const quote = computeQuote({ items, distanceKm: 5, settings, at: NOON });

    expect(quote.subtotal_cents).toBe(96000);
    expect(quote.delivery_fee_cents).toBe(27500);
    expect(quote.service_fee_cents).toBe(3705); // 3% of 123,500
    expect(quote.total_cents).toBe(96000 + 27500 + 3705);
    expect(quote.vendor_payout_cents).toBe(96000);
    expect(quote.platform_fee_cents).toBe(3705);
  });

  it("charges no delivery (and 0 distance) when the distance is unknown", () => {
    const quote = computeQuote({ items, distanceKm: null, settings, at: NOON });

    expect(quote.delivery_fee_cents).toBe(0);
    expect(quote.distance_km).toBeNull();
    expect(quote.service_fee_cents).toBe(2880); // 3% of 96,000
    expect(quote.total_cents).toBe(98880);
  });
});
