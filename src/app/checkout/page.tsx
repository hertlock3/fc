import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured, config } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getCartItems } from "@/lib/cart";
import { NotConfigured } from "@/components/not-configured";
import { CheckoutClient } from "@/components/checkout-client";
import type { Address } from "@/lib/types";

export const metadata = { title: "Checkout" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const user = await requireUser("/checkout");
  const supabase = await createClient();

  const [items, addressesResult] = await Promise.all([
    getCartItems(supabase, user.id),
    supabase.from("addresses").select("*").eq("user_id", user.id).order("created_at"),
  ]);

  const addresses = (addressesResult.data ?? []) as Address[];

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Checkout</h1>
      <p className="mt-1 text-sm text-slate-500">
        Confirm your delivery details and pay securely with M-Pesa.
      </p>
      <div className="mt-8">
        <CheckoutClient
          items={items}
          addresses={addresses}
          moneyProvider={config.money.provider}
        />
      </div>
    </div>
  );
}
