"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CreditCard, MapPin, Plus, ShieldCheck, Store } from "lucide-react";
import { Alert, Button, EmptyState, Spinner, Textarea, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Address, CartItem, CartPricing, Product, Stockist } from "@/lib/types";

interface QuoteResponse {
  quote: CartPricing | null;
  reason?: string;
  stockist?: Pick<Stockist, "id" | "name" | "address" | "city"> | null;
}

export function CheckoutClient({
  items,
  addresses,
  moneyProvider,
}: {
  items: CartItem[];
  addresses: Address[];
  moneyProvider: "sim" | "daraja";
}) {
  const router = useRouter();
  const [addressId, setAddressId] = useState<string>(
    addresses.find((a) => a.is_default)?.id ?? addresses[0]?.id ?? ""
  );
  const [quote, setQuote] = useState<CartPricing | null>(null);
  const [stockist, setStockist] = useState<QuoteResponse["stockist"]>(null);
  const [quoteFor, setQuoteFor] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const subtotal = items.reduce(
    (sum, i) => sum + (i.product as Product).price_cents * i.quantity,
    0
  );

  // Derived: true while we are fetching a quote for the currently selected address.
  const quoteLoading = addressId !== "" && quoteFor !== addressId;

  useEffect(() => {
    if (!addressId) return;
    let cancelled = false;
    fetch(`/api/quote?addressId=${addressId}`)
      .then((res) => res.json())
      .then((data: QuoteResponse) => {
        if (cancelled) return;
        setQuote(data.quote ?? null);
        setStockist(data.stockist ?? null);
        setQuoteError(
          data.quote ? null : "We couldn't calculate delivery for this address. Try another address or retry."
        );
        setQuoteFor(addressId);
      })
      .catch(() => {
        if (cancelled) return;
        setQuote(null);
        setStockist(null);
        setQuoteError("We couldn't reach the server. Check your connection and retry.");
        setQuoteFor(addressId);
      });
    return () => {
      cancelled = true;
    };
  }, [addressId, reloadKey]);

  async function handlePay() {
    setError(null);
    if (!addressId) {
      setError("Please choose a delivery address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addressId, customerNotes: notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Checkout failed");
      router.push(`/orders/${data.orderId}?justPaid=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to check out"
        description="Your cart is empty."
        action={
          <Link href="/shop" className={buttonClass("primary", "md")}>
            Back to shop
          </Link>
        }
      />
    );
  }

  if (addresses.length === 0) {
    return (
      <EmptyState
        title="Add a delivery address"
        description="We need a delivery location to calculate your delivery fee."
        action={
          <Link href="/onboarding" className={buttonClass("primary", "md")}>
            <Plus className="h-4 w-4" /> Add delivery address
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        {/* Address picker */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <MapPin className="h-4 w-4 text-brand-600" /> Delivery address
            </h2>
            <Link
              href="/account"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Manage
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={cn(
                  "cursor-pointer rounded-xl border p-3.5 transition",
                  addressId === address.id
                    ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-200"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === address.id}
                    onChange={() => setAddressId(address.id)}
                    className="mt-0.5 h-4 w-4 text-brand-600 focus:ring-brand-500"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {address.label}
                      {address.is_default && (
                        <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                          DEFAULT
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {address.line1}
                      {address.area ? `, ${address.area}` : ""}, {address.city}
                    </p>
                  </div>
                </div>
              </label>
            ))}
          </div>

          <Link
            href="/onboarding"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add another address
          </Link>
        </section>

        {/* Notes */}
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">Notes for the rider (optional)</h2>
          <Textarea
            className="mt-3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Call me when you reach the gate"
            maxLength={300}
          />
        </section>

        {/* Items */}
        <section className="card p-5">
          <h2 className="font-semibold text-slate-900">Your items</h2>
          <ul className="mt-4 divide-y divide-slate-100">
            {items.map((item) => {
              const product = item.product as Product;
              return (
                <li key={item.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{product.name}</p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} × {formatMoney(product.price_cents)} · {product.unit}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatMoney(product.price_cents * item.quantity)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900">Invoice</h2>

          {stockist && (
            <p className="mt-2 rounded-xl bg-brand-50 px-3 py-2 text-xs text-brand-800">
              <Store className="mr-1 inline h-3.5 w-3.5" />
              Fulfilled from your nearest Farmer&apos;s Choice stockist:{" "}
              <strong>{stockist.name}</strong>
            </p>
          )}

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Goods subtotal</dt>
              <dd className="font-medium text-slate-800">{formatMoney(quote?.subtotal_cents ?? subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">
                Delivery
                {quote?.distance_km != null && (
                  <span className="block text-xs text-slate-400">
                    {quote.distance_km.toFixed(1)} km from
                    {stockist ? ` ${stockist.name}` : " your stockist"}
                  </span>
                )}
              </dt>
              <dd className="font-medium text-slate-800">
                {quoteLoading ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : quote ? (
                  formatMoney(quote.delivery_fee_cents)
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">
                Service fee ({quote?.service_fee_percent ?? 3}%)
              </dt>
              <dd className="font-medium text-accent-700">
                {quoteLoading ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : quote ? (
                  formatMoney(quote.service_fee_cents)
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-lg font-bold text-slate-900">
            <span>Total</span>
            <span>
              {quoteLoading ? <Spinner className="h-4 w-4" /> : quote ? formatMoney(quote.total_cents) : "—"}
            </span>
          </div>

          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}

          {quoteError && !quoteLoading && (
            <Alert tone="warning" className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{quoteError}</span>
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="font-medium text-accent-900 underline"
                >
                  Retry
                </button>
              </div>
            </Alert>
          )}

          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={handlePay}
            disabled={submitting || !quote || quoteLoading}
          >
            {submitting ? (
              <Spinner />
            ) : (
              <>
                <CreditCard className="h-4 w-4" /> Pay {quote ? formatMoney(quote.total_cents) : ""} with M-Pesa
              </>
            )}
          </Button>

          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            You&apos;ll receive an M-Pesa prompt on your phone. Enter your PIN to
            confirm — we never see it.
          </p>

          {moneyProvider === "sim" && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-accent-50 p-3 text-xs text-accent-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Simulation mode is active — no real money moves. You&apos;ll be able to
              simulate the M-Pesa confirmation on the next screen.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
