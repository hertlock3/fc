"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { EmptyState, Spinner, buttonClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { CartItem, Product } from "@/lib/types";

export function CartClient({ items }: { items: CartItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function setQuantity(productId: string, quantity: number) {
    setPending(productId);
    try {
      await fetch("/api/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const subtotal = items.reduce(
    (sum, item) => sum + (item.product as Product).price_cents * item.quantity,
    0
  );
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Browse the shop and add some fresh Farmer's Choice favourites."
        action={
          <Link href="/shop" className={buttonClass("primary", "md")}>
            Go to shop
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <ul className="space-y-3">
        {items.map((item) => {
          const product = item.product as Product;
          const busy = pending === product.id;
          return (
            <li key={item.id} className="card flex items-center gap-4 p-3 sm:p-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-accent-50 text-xs font-semibold text-brand-700">
                {product.unit.split(" ")[0]}
              </div>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/shop?q=${encodeURIComponent(product.name)}`}
                  className="line-clamp-1 font-medium text-slate-900 hover:text-brand-700"
                >
                  {product.name}
                </Link>
                <p className="text-sm text-slate-500">
                  {formatMoney(product.price_cents)} · {product.unit}
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-full border border-slate-200 p-1">
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, item.quantity - 1)}
                  disabled={busy}
                  className="grid h-7 w-7 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-7 text-center text-sm font-semibold tabular-nums">
                  {busy ? <Spinner className="h-3 w-3" /> : item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, item.quantity + 1)}
                  disabled={busy || item.quantity >= 99}
                  className="grid h-7 w-7 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="hidden w-24 text-right font-semibold text-slate-900 sm:block">
                {formatMoney(product.price_cents * item.quantity)}
              </div>

              <button
                type="button"
                onClick={() => setQuantity(product.id, 0)}
                disabled={busy}
                className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${product.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <h2 className="font-semibold text-slate-900">Order summary</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">
                Items ({count})
              </dt>
              <dd className="font-medium text-slate-800">{formatMoney(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Delivery</dt>
              <dd className="text-slate-500">Calculated at checkout</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Service fee</dt>
              <dd className="text-slate-500">3% at checkout</dd>
            </div>
          </dl>
          <div className="mt-4 flex justify-between border-t border-slate-200 pt-4 text-base font-semibold text-slate-900">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>

          <Link href="/checkout" className={buttonClass("primary", "lg", "mt-5 w-full")}>
            Proceed to checkout
          </Link>
          <Link
            href="/shop"
            className="mt-3 block text-center text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Continue shopping
          </Link>
        </div>

        <p className="mt-3 px-1 text-xs text-slate-400">
          Delivery and the 3% service fee are added at checkout based on your chosen
          delivery location.
        </p>
      </aside>
    </div>
  );
}
