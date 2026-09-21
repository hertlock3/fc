import Link from "next/link";
import { ShoppingBasket, Sprout, User } from "lucide-react";
import { getSessionUser, getProfile, isAdmin } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { isSupabaseConfigured } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getCartCount } from "@/lib/cart";
import { buttonClass } from "@/components/ui";
import { LogoutButton } from "@/components/logout-button";

export async function SiteHeader() {
  const user = await getSessionUser();
  let cartCount = 0;
  let admin = false;
  let courier = false;
  let stockist = false;

  if (user && isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      cartCount = await getCartCount(supabase, user.id);
      admin = await isAdmin(user.id);
      const { data: roleRow } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      const role = (roleRow as { role?: UserRole } | null)?.role;
      courier = role === "courier";
      stockist = role === "stockist";
    } catch {
      cartCount = 0;
    }
  }

  const profile = user ? await getProfile() : null;
  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white">
            <Sprout className="h-5 w-5" />
          </span>
          <span className="hidden text-[15px] leading-tight sm:block">
            Farmer&apos;s Choice
            <span className="block text-[11px] font-normal text-slate-500">
              Fresh market, delivered
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/shop"
            className={buttonClass("ghost", "sm", "text-slate-700")}
          >
            Shop
          </Link>
          {user && (
            <Link href="/orders" className={buttonClass("ghost", "sm")}>
              <span className="hidden sm:inline">Orders</span>
              <span className="sm:hidden">Orders</span>
            </Link>
          )}
          {admin && (
            <Link href="/admin" className={buttonClass("ghost", "sm")}>
              Admin
            </Link>
          )}
          {courier && (
            <Link href="/courier" className={buttonClass("ghost", "sm")}>
              My trips
            </Link>
          )}
          {stockist && (
            <Link href="/stockist" className={buttonClass("ghost", "sm")}>
              My shop
            </Link>
          )}

          <Link
            href="/cart"
            className="relative inline-flex h-9 items-center gap-2 rounded-full px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            aria-label="Cart"
          >
            <ShoppingBasket className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1 text-[11px] font-semibold text-brand-950">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {user ? (
            <div className="flex items-center gap-1">
              <Link
                href="/account"
                className="hidden h-9 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:inline-flex"
              >
                <User className="h-4 w-4" />
                {firstName ?? "Account"}
              </Link>
              <div className="hidden sm:block">
                <LogoutButton />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className={buttonClass("ghost", "sm")}>
                Sign in
              </Link>
              <Link href="/register" className={buttonClass("primary", "sm")}>
                Create account
              </Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
