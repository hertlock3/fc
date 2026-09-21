"use client";

import { useState } from "react";
import { MapPin, Pencil, Plus, Store, Trash2, X } from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Spinner,
  Textarea,
} from "@/components/ui";
import type { StockistWithDistance } from "@/lib/types";

interface StockistForm {
  name: string;
  address: string;
  city: string;
  phone: string;
  lat: string;
  lng: string;
  openingHours: string;
  notes: string;
  isActive: boolean;
  isPrincipal: boolean;
}

const emptyForm: StockistForm = {
  name: "",
  address: "",
  city: "Nairobi",
  phone: "",
  lat: "",
  lng: "",
  openingHours: "",
  notes: "",
  isActive: true,
  isPrincipal: false,
};

function toForm(s: StockistWithDistance): StockistForm {
  return {
    name: s.name,
    address: s.address,
    city: s.city,
    phone: s.phone ?? "",
    lat: String(s.lat),
    lng: String(s.lng),
    openingHours: s.opening_hours ?? "",
    notes: s.notes ?? "",
    isActive: s.is_active,
    isPrincipal: s.is_principal,
  };
}

/** Admin manager for Farmer's Choice fulfilment locations (plant + stockists). */
export function StockistManager({
  stockists: initial,
  storeOrigin,
}: {
  stockists: StockistWithDistance[];
  /** Human-readable reference point the distances are measured from. */
  storeOrigin: string;
}) {
  const [stockists, setStockists] = useState(initial);
  const [editing, setEditing] = useState<StockistWithDistance | "new" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  async function mutate(
    init: { method: string; body?: unknown; query?: string }
  ): Promise<Record<string, unknown> | null> {
    setError(null);
    const res = await fetch(
      `/api/admin/stockists${init.query ? `?${init.query}` : ""}`,
      {
        method: init.method,
        headers: { "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError((data as { error?: string })?.error ?? "Request failed.");
      return null;
    }
    return (data ?? {}) as Record<string, unknown>;
  }

  const upsert = (saved: StockistWithDistance) =>
    setStockists((prev) => {
      const idx = prev.findIndex((x) => x.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next.sort(
        (a, b) =>
          Number(b.is_principal) - Number(a.is_principal) ||
          a.name.localeCompare(b.name)
      );
    });

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Fulfilment locations
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Customers are served by the stockist nearest their address. The
              principal plant is the fallback.
            </p>
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New stockist
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Hours</th>
                <th className="px-4 py-3 font-medium">Distance*</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stockists.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-1.5 font-medium text-slate-900">
                      {s.is_principal && (
                        <Store className="h-3.5 w-3.5 text-brand-600" />
                      )}
                      {s.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">{s.address}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.opening_hours ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.distance_km != null
                      ? `${s.distance_km.toFixed(1)} km`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {s.is_principal ? (
                      <Badge tone="info">Principal</Badge>
                    ) : s.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(s)}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={`Edit ${s.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await mutate({
                            method: "PATCH",
                            body: { id: s.id, isActive: !s.is_active },
                          });
                          if (ok) upsert({ ...s, is_active: !s.is_active });
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        aria-label={s.is_active ? `Deactivate ${s.name}` : `Activate ${s.name}`}
                        title={s.is_active ? "Stop taking orders here" : "Resume orders here"}
                      >
                        <Store className="h-4 w-4" />
                      </button>
                      {!s.is_principal && (
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                `Delete “${s.name}”? Past orders keep their history and fall back to the principal plant.`
                              )
                            )
                              return;
                            const ok = await mutate({
                              method: "DELETE",
                              query: `id=${s.id}`,
                            });
                            if (ok)
                              setStockists((prev) =>
                                prev.filter((x) => x.id !== s.id)
                              );
                          }}
                          className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${s.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {stockists.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    No fulfilment locations yet — add the principal plant first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          * Straight-line distance from the configured store origin
          {storeOrigin ? ` (${storeOrigin})` : ""}.
        </p>
      </section>

      {editing !== null && (
        <StockistDialog
          stockist={editing === "new" ? null : editing}
          form={editing === "new" ? emptyForm : toForm(editing)}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            upsert(saved as StockistWithDistance);
            setEditing(null);
          }}
          mutate={mutate}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- dialog ------- */

function StockistDialog({
  stockist,
  form: initial,
  onClose,
  onSaved,
  mutate,
}: {
  stockist: StockistWithDistance | null;
  form: StockistForm;
  onClose: () => void;
  onSaved: (s: unknown) => void;
  mutate: (init: {
    method: string;
    body?: unknown;
  }) => Promise<Record<string, unknown> | null>;
}) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof StockistForm>(key: K, value: StockistForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      address: form.address,
      city: form.city || "Nairobi",
      phone: form.phone,
      lat: Number(form.lat),
      lng: Number(form.lng),
      openingHours: form.openingHours,
      notes: form.notes,
      isActive: form.isActive,
      isPrincipal: form.isPrincipal,
    };
    const data = await mutate(
      stockist
        ? { method: "PATCH", body: { id: stockist.id, ...payload } }
        : { method: "POST", body: payload }
    );
    if (data) onSaved(data.stockist);
    else setError("Save failed — check the values.");
    setBusy(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={stockist ? `Edit ${stockist.name}` : "New stockist"}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {stockist ? `Edit — ${stockist.name}` : "New stockist"}
          </h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Farmer's Choice Stockist — Kasarani"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Mwiki Road, Kasarani"
            />
          </div>
          <div>
            <Label>City / town</Label>
            <Input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Nairobi"
            />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+254700000002"
            />
          </div>
          <div>
            <Label>Latitude</Label>
            <Input
              type="number"
              step="any"
              value={form.lat}
              onChange={(e) => set("lat", e.target.value)}
              placeholder="-1.2438"
            />
          </div>
          <div>
            <Label>Longitude</Label>
            <Input
              type="number"
              step="any"
              value={form.lng}
              onChange={(e) => set("lng", e.target.value)}
              placeholder="36.9085"
            />
          </div>
          <div className="flex items-end gap-4 pb-1 sm:col-span-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />
              Active (takes orders)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.isPrincipal}
                onChange={(e) => set("isPrincipal", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Principal plant
            </label>
          </div>
          <div>
            <Label>Opening hours (optional)</Label>
            <Input
              value={form.openingHours}
              onChange={(e) => set("openingHours", e.target.value)}
              placeholder="Mon–Sat 08:00–19:00"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Notes (optional)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Cold storage, loading bay on the east side…"
            />
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          Tip: drop a pin on any map app (Google Maps → long-press → copy
          coordinates) and paste the latitude / longitude here.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={
              busy ||
              form.name.trim().length < 2 ||
              form.address.trim().length < 4 ||
              form.lat === "" ||
              form.lng === ""
            }
          >
            {busy ? <Spinner /> : stockist ? "Save changes" : "Create stockist"}
          </Button>
        </div>
      </div>
    </div>
  );
}
