import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getCartItems } from "@/lib/cart";
import { NotConfigured } from "@/components/not-configured";
import { CartClient } from "@/components/cart-client";

export const metadata = { title: "Your cart" };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  const user = await requireUser("/cart");
  const supabase = await createClient();
  const items = await getCartItems(supabase, user.id);

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your cart</h1>
      <p className="mt-1 text-sm text-slate-500">
        Review your items before checkout.
      </p>
      <div className="mt-8">
        <CartClient items={items} />
      </div>
    </div>
  );
}
