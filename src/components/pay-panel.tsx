"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Smartphone, XCircle } from "lucide-react";
import { Alert, Button, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export function PayPanel({
  orderId,
  totalCents,
  moneyProvider,
  status,
}: {
  orderId: string;
  totalCents: number;
  moneyProvider: "sim" | "daraja";
  status: string;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<null | "success" | "failed" | "check">(null);
  const [error, setError] = useState<string | null>(null);

  async function simulate(outcome: "success" | "failed") {
    setWorking(outcome);
    setError(null);
    try {
      const res = await fetch("/api/dev/simulate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, outcome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(null);
    }
  }

  async function checkStatus() {
    setWorking("check");
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not check status");
      if (data.order.payment_status === "pending") {
        setError("We haven't received your payment yet. Approve the M-Pesa prompt on your phone.");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(null);
    }
  }

  // Paid / beyond ------------------------------------------------------------
  if (status !== "pending_payment") {
    const failed = status === "cancelled";
    return (
      <Alert tone={failed ? "danger" : "success"} className="flex items-start gap-3">
        {failed ? (
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div>
          <p className="font-medium">
            {failed ? "This order was cancelled." : "Payment received — thank you!"}
          </p>
          {!failed && (
            <p className="mt-0.5 text-sm opacity-90">
              Your order is now with Farmer&apos;s Choice for approval.
            </p>
          )}
        </div>
      </Alert>
    );
  }

  // Awaiting payment ---------------------------------------------------------
  return (
    <div className="space-y-4">
      <Alert tone="info" className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Check your phone</p>
          <p className="mt-0.5 text-sm opacity-90">
            We sent an M-Pesa request for <strong>{formatMoney(totalCents)}</strong>.
            Enter your PIN to confirm the payment.
          </p>
        </div>
      </Alert>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={checkStatus} disabled={working !== null}>
          {working === "check" ? <Spinner /> : "I've paid — check status"}
        </Button>
      </div>

      {moneyProvider === "sim" && (
        <div className="rounded-xl border border-accent-200 bg-accent-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-accent-900">
            <AlertTriangle className="h-4 w-4" /> Simulation controls
          </p>
          <p className="mt-1 text-xs text-accent-800">
            No real M-Pesa credentials are configured, so you can simulate the
            customer&apos;s response here.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="primary"
              onClick={() => simulate("success")}
              disabled={working !== null}
            >
              {working === "success" ? <Spinner /> : "Simulate successful payment"}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => simulate("failed")}
              disabled={working !== null}
            >
              {working === "failed" ? <Spinner /> : "Simulate failed payment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
