import { describe, expect, it } from "vitest";
import {
  ORDER_FLOW,
  ORDER_STATUS_LABELS,
  canTransition,
  generateInvoiceNumber,
  generateOrderNumber,
} from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

describe("canTransition", () => {
  it("allows the happy path", () => {
    expect(canTransition("pending_payment", "paid")).toBe(true);
    expect(canTransition("paid", "awaiting_vendor_approval")).toBe(true);
    expect(canTransition("awaiting_vendor_approval", "vendor_approved")).toBe(true);
    expect(canTransition("vendor_approved", "dispatching")).toBe(true);
    expect(canTransition("dispatching", "out_for_delivery")).toBe(true);
    expect(canTransition("out_for_delivery", "delivered")).toBe(true);
  });

  it("blocks impossible jumps (e.g. delivered before payment)", () => {
    expect(canTransition("pending_payment", "delivered")).toBe(false);
    expect(canTransition("pending_payment", "dispatching")).toBe(false);
    expect(canTransition("paid", "out_for_delivery")).toBe(false);
  });

  it("treats terminal states as terminal", () => {
    expect(ORDER_FLOW.cancelled).toEqual([]);
    expect(ORDER_FLOW.refunded).toEqual([]);
    expect(canTransition("cancelled", "paid")).toBe(false);
  });

  it("allows cancellation until the order is delivered", () => {
    expect(canTransition("out_for_delivery", "cancelled")).toBe(true);
    expect(canTransition("delivered", "cancelled")).toBe(false);
  });
});

describe("order & invoice numbers", () => {
  it("builds order numbers like FC-YYYYMMDD-XXXX", () => {
    expect(generateOrderNumber()).toMatch(/^FC-\d{8}-[A-Z2-9]{4}$/);
  });

  it("builds customer and vendor invoice numbers", () => {
    expect(generateInvoiceNumber("customer")).toMatch(/^INV-CUS-\d{6}-[A-Z2-9]{5}$/);
    expect(generateInvoiceNumber("vendor")).toMatch(/^INV-VEN-\d{6}-[A-Z2-9]{5}$/);
  });
});

describe("status labels", () => {
  it("has a human label for every status", () => {
    for (const status of Object.keys(ORDER_FLOW) as OrderStatus[]) {
      expect(ORDER_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
