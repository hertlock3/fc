import { Package } from "lucide-react";
import { Badge } from "@/components/ui";
import { AddToCartButton } from "@/components/add-to-cart-button";
import { formatMoney } from "@/lib/money";
import type { Product } from "@/lib/types";

/** A single product tile used on the landing and shop pages. */
export function ProductCard({
  product,
  isAuthed,
}: {
  product: Product;
  isAuthed: boolean;
}) {
  return (
    <article className="card group flex flex-col overflow-hidden p-3 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="relative mb-3 grid aspect-[4/3] place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-brand-50 to-accent-50">
        <Package className="h-9 w-9 text-brand-500/70" />
        {!product.in_stock && (
          <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col">
        <h3 className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2">
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-xs text-slate-500">
            {product.description}
          </p>
        )}

        <div className="mt-2 flex items-center gap-2">
          <Badge tone="neutral">{product.unit}</Badge>
        </div>

        <div className="mt-auto pt-3">
          <p className="mb-2 text-base font-bold text-slate-900">
            {formatMoney(product.price_cents)}
          </p>
          <AddToCartButton
            productId={product.id}
            isAuthed={isAuthed}
            size="sm"
          />
        </div>
      </div>
    </article>
  );
}
