import { describe, expect, it } from "vitest";
import { SimMoneyProvider } from "@/lib/providers/money";

const provider = new SimMoneyProvider();

const request = {
  orderId: "o1",
  orderNumber: "FC-20260920-ABCD",
  amountCents: 125000,
  phone: "254712345678",
  accountReference: "FCM-FC-20260920-ABCD",
  description: "Farmer's Choice order",
  callbackUrl: "http://localhost:3000/api/payments/mpesa/callback",
};

describe("SimMoneyProvider", () => {
  it("reports itself as the sim provider", () => {
    expect(provider.name).toBe("sim");
  });

  it("returns a processing charge with simulated request ids", async () => {
    const result = await provider.initiateCharge(request);

    expect(result.provider).toBe("sim");
    expect(result.checkoutRequestId).toMatch(/^SIM-CO-/);
    expect(result.merchantRequestId).toMatch(/^SIM-MR-/);
    expect(result.customerMessage).toMatch(/simulation/i);
  });

  it("always reports 'processing' for status queries", async () => {
    const status = await provider.queryStatus("SIM-CO-TEST");
    expect(status.status).toBe("processing");
  });
});
