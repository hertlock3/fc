import { describe, expect, it } from "vitest";
import {
  pickNearestStockist,
  resolveFulfilmentStockist,
} from "@/lib/stockists";
import type { Stockist } from "@/lib/types";

const principal: Stockist = {
  id: "p",
  name: "Principal Plant",
  address: "Eastern Bypass, Ruiru",
  city: "Nairobi",
  phone: null,
  lat: -1.1872,
  lng: 36.9538,
  opening_hours: null,
  notes: null,
  is_active: true,
  is_principal: true,
  profile_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const kasarani: Stockist = { ...principal, id: "k", name: "Kasarani", lat: -1.2438, lng: 36.9085, is_principal: false };
const kikuyu: Stockist = { ...principal, id: "q", name: "Kikuyu", lat: -1.2478, lng: 36.6642, is_principal: false };
const inactive: Stockist = { ...kasarani, id: "x", name: "Closed stockist", is_active: false };

describe("pickNearestStockist", () => {
  it("picks the active stockist closest to the destination", () => {
    // Mwiki, Kasarani is right next to the Kasarani stockist.
    const dest = { lat: -1.2445, lng: 36.9098 };
    const picked = pickNearestStockist([principal, kasarani, kikuyu], dest);
    expect(picked?.id).toBe("k");
  });

  it("ignores inactive stockists", () => {
    const dest = { lat: -1.2445, lng: 36.9098 };
    const picked = pickNearestStockist([kasarani, inactive], dest);
    expect(picked?.id).not.toBe("x");
    expect(picked?.id).toBe("k");
  });

  it("returns the principal plant when it is the only location", () => {
    const dest = { lat: -1.29, lng: 36.82 }; // Nairobi CBD
    const picked = pickNearestStockist([principal], dest);
    expect(picked?.id).toBe("p");
  });

  it("breaks ties deterministically by name", () => {
    // Identical coordinates → an exact distance tie; the alphabetically
    // first name must win regardless of input order.
    const a: Stockist = { ...kasarani, id: "a", name: "Alpha" };
    const b: Stockist = { ...kasarani, id: "b", name: "Beta" };
    const dest = { lat: -1.2445, lng: 36.9095 };
    expect(pickNearestStockist([b, a], dest)?.id).toBe("a");
    expect(pickNearestStockist([a, b], dest)?.id).toBe("a");
  });

  it("returns null when there are no active stockists", () => {
    expect(pickNearestStockist([inactive], { lat: 0, lng: 0 })).toBeNull();
    expect(pickNearestStockist([], { lat: 0, lng: 0 })).toBeNull();
  });
});

describe("resolveFulfilmentStockist", () => {
  it("falls back to the principal plant when only it is active", () => {
    const dest = { lat: -1.29, lng: 36.82 };
    const picked = resolveFulfilmentStockist([principal, inactive], dest);
    expect(picked?.id).toBe("p");
  });

  it("prefers a nearer stockist over the principal plant", () => {
    const dest = { lat: -1.2478, lng: 36.665 }; // Kikuyu
    const picked = resolveFulfilmentStockist([principal, kikuyu], dest);
    expect(picked?.id).toBe("q");
  });

  it("returns null with no stockists at all", () => {
    expect(resolveFulfilmentStockist([], { lat: 0, lng: 0 })).toBeNull();
  });
});
