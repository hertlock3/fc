import Link from "next/link";
import {
  ArrowRight,
  BikeIcon,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import { buttonClass } from "@/components/ui";
import { isSupabaseConfigured, config } from "@/lib/config";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listProducts } from "@/lib/queries";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/product-card";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: ShoppingBasket,
    title: "1. Register & shop",
    body: "Create your account and browse fresh Farmer's Choice cuts, sausages and deli treats.",
  },
  {
    icon: MapPin,
    title: "2. Set your delivery spot",
    body: "Pick your estate and drop a pin. We calculate an exact delivery fee by distance.",
  },
  {
    icon: CreditCard,
    title: "3. Pay with M-Pesa",
    body: "Review your invoice and approve the STK push on your phone. Goods, delivery and the 5% service fee in one payment.",
  },
  {
    icon: BikeIcon,
    title: "4. Rider on the way",
    body: "Once Farmer's Choice approves, a rider is dispatched and you can track the order live.",
  },
];

export default async function HomePage() {
  let featured: Product[] = [];
  let isAuthed = false;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const [all, user] = await Promise.all([
        listProducts(supabase),
        getSessionUser(),
      ]);
      featured = all.slice(0, 8);
      isAuthed = Boolean(user);
    } catch {
      featured = [];
    }
  }

  return (
    <div className="fade-in">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-brand-50 via-white to-surface-muted">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-100/70 blur-3xl" />
        <div className="absolute -left-24 top-40 h-72 w-72 rounded-full bg-accent-100/60 blur-3xl" />
        <div className="container-page relative grid gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div className="rise-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700">
              <Sparkles className="h-3.5 w-3.5" />
              Same-day delivery across Nairobi
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Farm-fresh food,{" "}
              <span className="text-brand-700">delivered to your door.</span>
            </h1>
            <p className="mt-4 max-w-lg text-lg text-slate-600">
              Order genuine Farmer&apos;s Choice meat and groceries, pay securely with
              M-Pesa, and let a rider bring it to you — fresh, fast and fairly
              priced.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/shop" className={buttonClass("primary", "lg")}>
                Start shopping <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/register" className={buttonClass("secondary", "lg")}>
                Create an account
              </Link>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              {[
                "Genuine Farmer's Choice products",
                "Secure M-Pesa STK checkout",
                "Distance-based fair delivery",
                "Live rider tracking",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative rise-in">
            <div className="card overflow-hidden p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Your order summary</p>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
                  Example invoice
                </span>
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <Row label="Beef Ribeye Steak · 500g" value="950.00" />
                <Row label="Farmer's Choice Beef Sausages · 500g" value="390.00" />
                <Row label="Delivery (Kahawa West → Kilimani · 9.4 km)" value="429.00" />
                <div className="border-t border-dashed border-slate-200 pt-3">
                  <Row label="Subtotal" value="1,340.00" />
                </div>
                <Row
                  label={`Service fee (${config.serviceFee.percent}%)`}
                  value="88.45"
                  tone="accent"
                />
                <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-base font-semibold text-slate-900">
                  <dt>Total paid via M-Pesa</dt>
                  <dd>KES 1,857.45</dd>
                </div>
              </dl>
              <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                Farmer&apos;s Choice receives <strong>KES 1,340.00</strong>; the{" "}
                {config.serviceFee.percent}% service fee keeps the platform running.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            How it works
          </h2>
          <p className="mt-2 text-slate-600">
            Four simple steps from craving to doorstep.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div key={step.title} className="card p-6 transition hover:-translate-y-1">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                <step.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Featured products */}
      {featured.length > 0 && (
        <section className="container-page pb-16">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Popular this week
              </h2>
              <p className="mt-1 text-slate-600">Fresh picks from the Farmer&apos;s Choice counter.</p>
            </div>
            <Link href="/shop" className={buttonClass("secondary", "sm", "hidden sm:inline-flex")}>
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((product) => (
              <ProductCard key={product.id} product={product} isAuthed={isAuthed} />
            ))}
          </div>
        </section>
      )}

      {/* Trust */}
      <section className="border-t border-slate-200 bg-white">
        <div className="container-page grid gap-8 py-14 md:grid-cols-3">
          <Trust
            icon={ShieldCheck}
            title="Safe & secure"
            body="M-Pesa PIN is entered on your own phone. We never see or store it, and every payment is verified server-side."
          />
          <Trust
            icon={BikeIcon}
            title="Reliable delivery"
            body="Courier dispatch with live status updates, from Farmer's Choice approval right through to your door."
          />
          <Trust
            icon={CreditCard}
            title="Transparent pricing"
            body={`Goods + delivery + a flat ${config.serviceFee.percent}% service fee. No hidden charges, ever.`}
          />
        </div>
      </section>

      {/* CTA */}
      <section className="container-page py-16">
        <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-8 py-12 text-center text-white">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-600/60 blur-2xl" />
          <h2 className="relative text-2xl font-bold sm:text-3xl">
            Ready for fresh food today?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-brand-50">
            Create an account, tell us where to deliver, and we&apos;ll take it from
            there.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/register" className={buttonClass("accent", "lg")}>
              Create your account
            </Link>
            <Link
              href="/shop"
              className={buttonClass("secondary", "lg", "bg-white/10 text-white border-white/20 hover:bg-white/20")}
            >
              Browse the shop
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className={tone === "accent" ? "font-medium text-accent-700" : "font-medium text-slate-800"}>
        {value}
      </dd>
    </div>
  );
}

function Trust({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm text-slate-600">{body}</p>
    </div>
  );
}
