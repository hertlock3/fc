"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw, Smartphone, XCircle } from "lucide-react";
import { Alert, Button, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/money";

/**
 * Live payment panel for the order page.
 *
 * While a charge is in flight the panel polls /api/orders/:id/payment-status
 * every few seconds; that endpoint queries Daraja directly and finalises the
 * payment, so confirmation lands in real time — no manual "check status"
 * button and no simulation controls. When the charge failed or was cancelled
 * (or the STK prompt expired), the customer can re-trigger the push.
 */

const POLL_MS = 4000;
const POLL_MAX_TRIES = 75; // ~5 minutes, then show the retry button

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
  const [working, setWorking] = useState<null | "retry" | "check">(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [paid, setPaid] = useState(false);
  const paidRef = useRef(false);

  useEffect(() => {
    if (status !== "pending_payment") return;
    paidRef.current = false;

    const tick = async () => {
      if (paidRef.current) return;
      try {
        const res = await fetch(`/api/orders/${orderId}/payment-status`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data) return;
        if (data.payment_status === "paid") {
          paidRef.current = true;
          setPaid(true);
          router.refresh();
        } else if (data.payment_status === "failed" || data.payment_status === "cancelled") {
          paidRef.current = true; // stop polling; retry UI takes over
          router.refresh();
        }
      } catch {
        /* transient network error — keep polling */
      }
    };

    const interval = setInterval(tick, POLL_MS);
    return () => clearInterval(interval);
  }, [orderId, status, router]);

  // The resend button appears once the STK prompt has likely expired (~50s of
  // polling) — or immediately in demo mode, where a fresh poll confirms it.
  const retryVisible = moneyProvider === "sim" || tries >= POLL_MAX_TRIES / 10;

  async function retryPayment() {
    setWorking("retry");
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/retry-payment`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not resend the payment request.");
      setTries(0);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(null);
    }
  }

  async function checkNow() {
    setWorking("check");
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/payment-status`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not check status");
      if (data.payment_status === "paid") {
        setPaid(true);
        router.refresh();
      } else if (data.payment_status === "failed" || data.payment_status === "cancelled") {
        router.refresh();
      } else {
        setError("Not received yet — approve the M-Pesa prompt on your phone.");
        setTries((t) => t + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setWorking(null);
    }
  }

  // Paid / beyond --------------------------------------------------------------
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

  // Awaiting payment -----------------------------------------------------------
  return (
    <div className="space-y-4">
      <Alert tone="info" className="flex items-start gap-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Check your phone</p>
          <p className="mt-0.5 text-sm opacity-90">
            We sent an M-Pesa request for <strong>{formatMoney(totalCents)}</strong>.
            Enter your PIN to confirm — this page updates automatically.
          </p>
        </div>
      </Alert>

      {paid && (
        <Alert tone="success">
          <CheckCircle2 className="mr-2 inline h-4 w-4" /> Payment confirmed! Updating your
          order…
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={checkNow} disabled={working !== null}>
          {working === "check" ? <Spinner /> : <><RefreshCw className="h-4 w-4" /> Check now</>}
        </Button>
        {retryVisible && (
          <Button variant="ghost" onClick={retryPayment} disabled={working !== null}>
            {working === "retry" ? <Spinner /> : "Resend payment request"}
          </Button>
        )}
      </div>

      <p className="text-xs text-slate-400">
        {moneyProvider === "sim"
          ? "Demo mode: this payment confirms automatically when the page polls for status."
          : "Waiting for M-Pesa confirmation… the request expires after about a minute; if you missed it, use “Resend payment request”."}
      </p>
    </div>
  );
}
