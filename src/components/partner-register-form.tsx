"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bike, Eye, EyeOff, Store, UserPlus } from "lucide-react";
import { Alert, Button, Input, Label, Spinner } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { partnerRegisterSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";

/**
 * Partner registration — for riders (couriers) and stockists.
 *
 * Every partner account starts PENDING: an admin approves it before the
 * partner can use the platform (they land on /pending-approval). Stockists
 * additionally provide business details; their location is created INACTIVE
 * and activated by Farmer's Choice staff after verification.
 */
export function PartnerRegisterForm() {
  const router = useRouter();
  const [role, setRole] = useState<"courier" | "stockist">("courier");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessCity, setBusinessCity] = useState("Nairobi");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const payload = {
        role,
        fullName,
        email,
        phone,
        password,
        businessName: role === "stockist" ? businessName : undefined,
        businessAddress: role === "stockist" ? businessAddress : undefined,
        businessCity: role === "stockist" ? businessCity : undefined,
      };
      const parsed = partnerRegisterSchema.safeParse(payload);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Please check your details.");
        return;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Registration failed.");

      // Auto sign-in so the partner lands on the hold screen straight away.
      // Platform access unlocks once an admin approves the account.
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setNotice("Account created. Please sign in to continue.");
        setTimeout(() => router.push("/login?next=/pending-approval"), 1200);
        return;
      }

      setNotice(
        "Registration received! Your account is pending admin approval — you'll get full access once approved."
      );
      setTimeout(() => {
        router.push("/pending-approval");
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
  }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Role picker */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setRole("courier")}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border p-4 text-sm font-medium transition",
            role === "courier"
              ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-200 text-brand-800"
              : "border-slate-200 text-slate-600 hover:border-slate-300"
          )}
        >
          <Bike className="h-5 w-5" />
          Rider / courier
          <span className="text-xs font-normal text-slate-500">
            Deliver orders, earn per trip
          </span>
        </button>
        <button
          type="button"
          onClick={() => setRole("stockist")}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border p-4 text-sm font-medium transition",
            role === "stockist"
              ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-200 text-brand-800"
              : "border-slate-200 text-slate-600 hover:border-slate-300"
          )}
        >
          <Store className="h-5 w-5" />
          Stockist
          <span className="text-xs font-normal text-slate-500">
            Sell &amp; fulfil from your shop
          </span>
        </button>
      </div>

      <div>
        <Label htmlFor="p-name">Full name</Label>
        <Input id="p-name" autoComplete="name" placeholder="Wanjiku Kamau" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>

      {role === "stockist" && (
        <>
          <div>
            <Label htmlFor="p-business">Shop / business name</Label>
            <Input id="p-business" placeholder="Kasarani Fresh Mart" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="p-baddress">Shop address</Label>
            <Input id="p-baddress" placeholder="Mwiki Road, Kasarani" value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="p-bcity">Town / city</Label>
            <Input id="p-bcity" placeholder="Nairobi" value={businessCity} onChange={(e) => setBusinessCity(e.target.value)} />
          </div>
        </>
      )}

      <div>
        <Label htmlFor="p-email">Email address</Label>
        <Input id="p-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>

      <div>
        <Label htmlFor="p-phone">Phone number</Label>
        <Input id="p-phone" type="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <p className="mt-1 text-xs text-slate-500">
          Riders: customers may call this number. Stockists: we&apos;ll use it for
          order coordination.
        </p>
      </div>

      <div>
        <Label htmlFor="p-password">Password</Label>
        <div className="relative">
          <Input
            id="p-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading ? <Spinner /> : <><UserPlus className="h-4 w-4" /> Register as {role === "courier" ? "rider" : "stockist"}</>}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
