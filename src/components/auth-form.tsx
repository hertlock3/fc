"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Input, Label, Spinner } from "@/components/ui";
import { loginSchema, registerSchema } from "@/lib/validation";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? (mode === "register" ? "/onboarding" : "/shop");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
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
      const supabase = createClient();

      if (mode === "register") {
        const parsed = registerSchema.safeParse({ fullName, email, phone, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Please check your details.");
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            data: { full_name: parsed.data.fullName, phone: parsed.data.phone },
          },
        });
        if (error) throw error;

        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setNotice(
            "Account created. Check your email to confirm your address, then sign in."
          );
        }
      } else {
        const parsed = loginSchema.safeParse({ email, password });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? "Please check your details.");
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) throw error;

        // Partners land in their dashboards unless a specific page was asked
        // for: riders → /courier, stockists → /stockist, staff → /admin.
        let destination = next;
        if (!params.get("next")) {
          const { data: roleRow } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
            .maybeSingle();
          const role = (roleRow as { role?: string } | null)?.role;
          if (role === "courier") destination = "/courier";
          else if (role === "stockist") destination = "/stockist";
          else if (role === "admin" || role === "vendor") destination = "/admin";
        }
        router.push(destination);
        router.refresh();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {isRegister && (
        <div>
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="Wanjiku Kamau"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
      )}

      <div>
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      {isRegister && (
        <div>
          <Label htmlFor="phone">M-Pesa phone number</Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            We&apos;ll send the payment prompt to this number.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "At least 8 characters" : "Your password"}
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
        {loading ? (
          <Spinner />
        ) : isRegister ? (
          <>
            <UserPlus className="h-4 w-4" /> Create account
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" /> Sign in
          </>
        )}
      </Button>

      <p className="text-center text-sm text-slate-500">
        {isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-700 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Farmer&apos;s Choice?{" "}
            <Link href="/register" className="font-medium text-brand-700 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
