"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck, BikeIcon, Navigation } from "lucide-react";
import { Alert, Button, Spinner } from "@/components/ui";

type TripAction = "picked_up" | "delivering" | "delivered";

/** Status-progress buttons for the courier portal. */
export function CourierTripActions({
  orderId,
  deliveryStatus,
}: {
  orderId: string;
  deliveryStatus: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<TripAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: TripAction) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/courier/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Action failed");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const canPickUp = deliveryStatus === "assigned";
  const canDeliver = deliveryStatus === "picked_up" || deliveryStatus === "delivering";
  const onWay = deliveryStatus === "picked_up";

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        {canPickUp && (
          <Button size="sm" onClick={() => run("picked_up")} disabled={busy !== null}>
            {busy === "picked_up" ? <Spinner /> : <><PackageCheck className="h-4 w-4" /> Confirm pickup</>}
          </Button>
        )}
        {onWay && (
          <Button size="sm" variant="secondary" onClick={() => run("delivering")} disabled={busy !== null}>
            <Navigation className="h-4 w-4" /> Start trip
          </Button>
        )}
        {canDeliver && (
          <Button size="sm" onClick={() => run("delivered")} disabled={busy !== null}>
            {busy === "delivered" ? <Spinner /> : <><BikeIcon className="h-4 w-4" /> Mark delivered</>}
          </Button>
        )}
      </div>
    </div>
  );
}
