import { describe, expect, it } from "vitest";
import { SimMoneyProvider } from "@/lib/providers/money";

const provider = new SimMoneyProvider();

const request = {
  orderId: "o1",
  orderNumber: "FC-20260920-ABCD",
  amountCents: 125000,
  phone: "254712345678",
  tillNumber: "1741769",
  accountReference: "FCM-FC-20260920-ABCD",
  description: "Farmer's Choice order",
  callbackUrl: "http://localhost:3000/api/payments/mpesa/callback",
};

describe("SimMoneyProvider", () => {
  it("reports itself as the sim provider", () => {
    expect(provider.name).toBe("sim");
  });

  it("returns a charge with simulated request ids", async () => {
    const result = await provider.initiateCharge(request);

    expect(result.provider).toBe("sim");
    expect(result.checkoutRequestId).toMatch(/^SIM-CO-/);
    expect(result.merchantRequestId).toMatch(/^SIM-MR-/);
  });

  it("confirms any charge on the first status poll (stateless)", async () => {
    const charge = await provider.initiateCharge(request);
    const status = await provider.queryStatus(charge.checkoutRequestId!);

    expect(status.status).toBe("paid");
    expect(status.resultCode).toBe(0);
    expect(status.receipt).toMatch(/^SIM/);
  });

  it("returns a deterministic receipt for the same reference", async () => {
    const first = await provider.queryStatus("SIM-CO-STABLE");
    const second = await provider.queryStatus("SIM-CO-STABLE");

    expect(first.receipt).toBe(second.receipt);
  });

  it("is stateless across instances (mirrors per-route module instances)", async () => {
    const { checkoutRequestId } = await provider.initiateCharge(request);
    const otherInstance = new SimMoneyProvider();
    const status = await otherInstance.queryStatus(checkoutRequestId!);

    expect(status.status).toBe("paid");
  });
});
