import Link from "next/link";
import { ShieldCheck, Sprout, Truck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
              <Sprout className="h-4 w-4" />
            </span>
            Farmer&apos;s Choice Market
          </div>
          <p className="mt-3 max-w-sm text-sm text-slate-500">
            Fresh Farmer&apos;s Choice meat and groceries, delivered to your door
            across Nairobi with M-Pesa checkout and same-day rider delivery.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-600" /> Secure M-Pesa payments
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-brand-600" /> Same-day delivery
            </span>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-800">Shop</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li>
              <Link href="/shop" className="hover:text-brand-700">
                All products
              </Link>
            </li>
            <li>
              <Link href="/cart" className="hover:text-brand-700">
                Your cart
              </Link>
            </li>
            <li>
              <Link href="/orders" className="hover:text-brand-700">
                Track an order
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-800">Account</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li>
              <Link href="/account" className="hover:text-brand-700">
                My account
              </Link>
            </li>
            <li>
              <Link href="/register" className="hover:text-brand-700">
                Create account
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-brand-700">
                Sign in
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-5">
        <p className="container-page text-xs text-slate-400">
          © {new Date().getFullYear()} Farmer&apos;s Choice Market. Prices in Kenyan
          Shillings. A 5% service fee applies to goods and delivery.
        </p>
      </div>
    </footer>
  );
}
