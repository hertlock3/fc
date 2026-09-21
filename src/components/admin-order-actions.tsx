"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  BikeIcon,
  PackageCheck,
  XCircle,
  Store,
  ArrowLeftRight,
  ChevronDown,
} from "lucide-react";
import { Alert, Button, Input, Spinner } from "@/components/ui";
import type { OrderStatus } from "@/lib/types";

type Action =
  | "approve"
  | "dispatch"
  | "assign_rider"
  | "mark_delivered"
  | "cancel"
  | "reassign_stockist";

export interface StockistOption {
  id: string;
  name: string;
  city: string;
  is_principal: boolean;
  is_active: boolean;
}

export function AdminOrderActions({
  orderId,
  status,
  couriers = [],
  stockists = [],
  currentStockistId,
}: {
  orderId: string;
  status: OrderStatus;
  /** Registered courier accounts (id = profiles.id) for chat-aware assignment. */
  couriers?: Array<{ id: string; full_name: string | null; phone: string | null }>;
  /** Active fulfilment locations for override/re-route. */
  stockists?: StockistOption[];
  currentStockistId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stockist override (shown pre-dispatch).
  const [stockistId, setStockistId] = useState(currentStockistId ?? "");

  // Rider selection at dispatch time (one-step assignment).
  const [riderId, setRiderId] = useState("");
  const [riderName, setRiderName] = useState("");
  const [riderPhone, setRiderPhone] = useState("");

  // Post-dispatch manual assignment.
  const [showAssign, setShowAssign] = useState(false);

  async function run(action: Action, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      setShowAssign(false);
      setRiderName("");
      setRiderPhone("");
      setRiderId("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const canApprove = status === "awaiting_vendor_approval";
  const canDispatch = status === "vendor_approved" || status === "dispatching";
  const canAssign = status === "out_for_delivery";
  const canDeliver = status === "out_for_delivery";
  const canCancel = [
    "awaiting_vendor_approval",
    "vendor_approved",
    "dispatching",
    "out_for_delivery",
  ].includes(status);

  const stockistChanged = stockistId !== (currentStockistId ?? "");

  return (
    <div className="space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* ── Decision 1: fulfilment from WHERE (approval stage) ────────────── */}
      {canApprove && stockists.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
            <Store className="h-3.5 w-3.5 text-brand-600" /> Fulfil from
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                value={stockistId}
                onChange={(e) => setStockistId(e.target.value)}
                aria-label="Fulfilment stockist"
                className="w-full min-w-56 appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              >
                {stockists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_principal ? " (principal)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            {stockistChanged && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => run("reassign_stockist", { stockistId })}
                disabled={busy !== null}
                title="Recalculates the delivery fee for the new location"
              >
                {busy === "reassign_stockist" ? (
                  <Spinner />
                ) : (
                  <>
                    <ArrowLeftRight className="h-4 w-4" /> Re-route &amp; reprice
                  </>
                )}
              </Button>
            )}
          </div>
          {stockistChanged && (
            <p className="mt-2 text-xs text-slate-500">
              Approving keeps this stockist; the customer&apos;s delivery fee is
              only recomputed if you press <strong>Re-route &amp; reprice</strong>.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <Button size="sm" onClick={() => run("approve", { stockistId: stockistId || undefined })} disabled={busy !== null}>
            {busy === "approve" ? <Spinner /> : <><CheckCircle2 className="h-4 w-4" /> Approve order</>}
          </Button>
        )}

        {/* ── Decision 2: WHO delivers (dispatch stage) ────────────────────── */}
        {canDispatch && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <select
                  value={riderId}
                  onChange={(e) => {
                    const picked = couriers.find((c) => c.id === e.target.value);
                    setRiderId(e.target.value);
                    if (picked) {
                      setRiderName(picked.full_name ?? "");
                      setRiderPhone(picked.phone ?? "");
                    } else {
                      setRiderName("");
                      setRiderPhone("");
                    }
                  }}
                  aria-label="Assign a rider"
                  className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-3.5 pr-9 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
                >
                  <option value="">Auto-assign rider</option>
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name ?? c.id.slice(0, 8)}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <Button size="sm" onClick={() => run("dispatch", { courierId: riderId || undefined, courierName: riderName || undefined, courierPhone: riderPhone || undefined })} disabled={busy !== null}>
                {busy === "dispatch" ? <Spinner /> : <><BikeIcon className="h-4 w-4" /> Dispatch</>}
              </Button>
            </div>
          </>
        )}
        {canAssign && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAssign((v) => !v)}
            disabled={busy !== null}
          >
            <BikeIcon className="h-4 w-4" /> {showAssign ? "Hide" : "Change rider"}
          </Button>
        )}
        {canDeliver && (
          <Button size="sm" variant="secondary" onClick={() => run("mark_delivered")} disabled={busy !== null}>
            {busy === "mark_delivered" ? <Spinner /> : <><PackageCheck className="h-4 w-4" /> Mark delivered</>}
          </Button>
        )}
        {canCancel && (
          <Button size="sm" variant="danger" onClick={() => run("cancel", { reason: "Cancelled by staff" })} disabled={busy !== null}>
            {busy === "cancel" ? <Spinner /> : <><XCircle className="h-4 w-4" /> Cancel</>}
          </Button>
        )}
      </div>

      {/* Ad-hoc / re-assignment panel after dispatch. */}
      {showAssign && (
        <div className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
          {couriers.length > 0 && (
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Registered courier (gets chat + trips portal)
              </label>
              <select
                value={riderId}
                onChange={(e) => {
                  const picked = couriers.find((c) => c.id === e.target.value);
                  setRiderId(e.target.value);
                  if (picked) {
                    setRiderName(picked.full_name ?? "");
                    setRiderPhone(picked.phone ?? "");
                  }
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
              >
                <option value="">— Manual rider (name only) —</option>
                {couriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name ?? c.id.slice(0, 8)}{c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Input
            placeholder="Rider name"
            value={riderName}
            onChange={(e) => setRiderName(e.target.value)}
          />
          <Input
            placeholder="Rider phone (optional)"
            value={riderPhone}
            onChange={(e) => setRiderPhone(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Button
              size="sm"
              onClick={() =>
                run("assign_rider", {
                  courierName: riderName,
                  courierPhone: riderPhone,
                  courierId: riderId || undefined,
                })
              }
              disabled={busy !== null || riderName.trim().length < 2}
            >
              {busy === "assign_rider" ? <Spinner /> : "Confirm assignment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
