"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Building, CheckCircle2, KeyRound, PieChart, ShieldCheck } from "lucide-react";
import { Alert, Badge, Button, Input, Label, Spinner } from "@/components/ui";
import { formatMoney } from "@/lib/money";

/* ------------------------------------------------------------------ types -- */

interface BreakdownItem {
  key: string;
  label: string;
  cents: number;
}

interface Financials {
  totals: {
    gross: number;
    goods: number;
    delivery: number;
    serviceFee: number;
    vendorPayout: number;
    platformFee: number;
    orderCount: number;
    formatted: {
      gross: string;
      vendorPayout: string;
      delivery: string;
      platformFee: string;
    };
  };
  breakdown: BreakdownItem[];
  monthly: Array<{ month: string; cents: number }>;
}

interface Merchant {
  paybill: string;
  accountPrefix: string;
  name: string;
}

interface TotpStatus {
  enrolled: boolean;
  pending: boolean;
}

/* ------------------------------------------------------------ main component */

export function FinanceDashboard() {
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [totp, setTotp] = useState<TotpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [finRes, merchRes] = await Promise.all([
        fetch("/api/admin/financials", { cache: "no-store" }),
        fetch("/api/admin/paybill", { cache: "no-store" }),
      ]);
      const fin = await finRes.json().catch(() => null);
      const merch = await merchRes.json().catch(() => null);
      if (!finRes.ok) throw new Error(fin?.error ?? "Could not load financials.");
      if (!merchRes.ok) throw new Error(merch?.error ?? "Could not load paybill settings.");
      setFinancials(fin);
      setMerchant(merch.merchant);
      setTotp(merch.totp ?? { enrolled: false, pending: false });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500"><Spinner /> Crunching the numbers…</p>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {financials && <MoneyFlow financials={financials} />}

      {merchant && (
        <PaybillEditor
          merchant={merchant}
          totp={totp}
          onSaved={(m) => setMerchant(m)}
          onTotpChanged={(t) => setTotp(t)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------- money flows -- */

function MoneyFlow({ financials }: { financials: Financials }) {
  const { totals, breakdown, monthly } = financials;
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.cents));

  return (
    <div className="space-y-6">
      {/* Totals strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gross paid volume" value={formatMoney(totals.gross)} sub={`${totals.orderCount} paid orders`} />
        <Stat label="Farmer's Choice (goods)" value={formatMoney(totals.vendorPayout)} sub="vendor payouts" />
        <Stat label="Courier rider account" value={formatMoney(totals.delivery)} sub="delivery fees collected" />
        <Stat label="Platform service charge" value={formatMoney(totals.platformFee)} sub="platform revenue" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie/donut — where the money goes */}
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <PieChart className="h-4 w-4 text-brand-600" /> Where the money goes
          </h2>
          <p className="mt-1 text-xs text-slate-400">Share of gross paid volume, all time</p>
          <Donut breakdown={breakdown} gross={totals.gross} />
        </section>

        {/* Bar chart — monthly volume */}
        <section className="card p-5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <BarChart3 className="h-4 w-4 text-brand-600" /> Monthly paid volume
          </h2>
          <p className="mt-1 text-xs text-slate-400">Last 6 months (KES)</p>
          <div className="mt-6 flex h-48 items-end justify-around gap-3">
            {monthly.length === 0 ? (
              <p className="text-sm text-slate-400">No paid orders yet.</p>
            ) : (
              monthly.map((m) => (
                <div key={m.month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-medium text-slate-600">{(m.cents / 100).toLocaleString()}</span>
                  <div
                    className="w-full max-w-14 rounded-t-lg bg-accent-500 transition-all"
                    style={{ height: `${Math.max(4, (m.cents / maxMonthly) * 100)}%` }}
                  />
                  <span className="text-xs text-slate-400">{m.month}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** Pure-CSS donut chart (no chart library dependency). */
function Donut({ breakdown, gross }: { breakdown: BreakdownItem[]; gross: number }) {
  const colors = ["bg-brand-500", "bg-sky-500", "bg-accent-500"];
  // conic-gradient with percentage stops; 0% gross renders an empty ring.
  const segments = breakdown
    .filter((b) => b.cents > 0)
    .reduce<Array<{ item: BreakdownItem; start: number; end: number }>>((list, item) => {
      const start = list.length > 0 ? list[list.length - 1].end : 0;
      const end = gross > 0 ? start + (item.cents / gross) * 100 : 0;
      list.push({ item, start, end });
      return list;
    }, []);
  const stops = segments.map(
    (s, i) => `${["#16a34a", "#0284c7", "#f59e0b"][i]} ${s.start.toFixed(3)}% ${s.end.toFixed(3)}%`
  );
  const gradient =
    stops.length > 0
      ? `conic-gradient(${stops.join(", ")})`
      : "conic-gradient(#e2e8f0 0% 100%)";

  return (
    <div className="mt-5 flex items-center gap-6">
      <div className="relative h-44 w-44 shrink-0 rounded-full" style={{ background: gradient }}>
        <div className="absolute inset-[22%] grid place-items-center rounded-full bg-white shadow-inner">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Gross</p>
            <p className="text-sm font-bold text-slate-800">{formatMoney(gross, "KES", { withSymbol: false })}</p>
          </div>
        </div>
      </div>
      <ul className="space-y-2.5 text-sm">
        {breakdown.map((b, i) => {
          const share = gross > 0 ? Math.round((b.cents / gross) * 100) : 0;
          return (
            <li key={b.key} className="flex items-center gap-2.5">
              <span className={`h-3 w-3 rounded-sm ${colors[i]}`} />
              <span className="text-slate-700">{b.label}</span>
              <span className="ml-auto pl-4 font-medium text-slate-900">
                {formatMoney(b.cents, "KES", { withSymbol: false })} · {share}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </div>
  );
}

/* ---------------------------------------------------------- paybill editor -- */

interface Enrollment {
  otpauthUri: string;
  secret: string;
}

function PaybillEditor({
  merchant,
  totp,
  onSaved,
  onTotpChanged,
}: {
  merchant: Merchant;
  totp: TotpStatus | null;
  onSaved: (m: Merchant) => void;
  onTotpChanged: (t: TotpStatus) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [paybill, setPaybill] = useState(merchant.paybill);
  const [accountPrefix, setAccountPrefix] = useState(merchant.accountPrefix);
  const [name, setName] = useState(merchant.name);

  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const enrolled = totp?.enrolled ?? false;

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/admin/paybill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(data?.error ?? "Request failed.") as Error & {
        retryAfterSeconds?: number;
      };
      if (typeof data?.retryAfterSeconds === "number") {
        err.retryAfterSeconds = data.retryAfterSeconds;
      }
      throw err;
    }
    return data;
  }

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const data = await post({ action: "enroll" });
      setEnrollment({ otpauthUri: data.otpauthUri, secret: data.secret });
      setNotice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start enrollment.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnrollment() {
    setBusy(true);
    setError(null);
    try {
      const data = await post({ action: "confirm", code });
      setTotpChanged({ enrolled: true, pending: false });
      setEnrollment(null);
      setCode("");
      setNotice(data.message ?? "Authenticator confirmed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  function setTotpChanged(t: TotpStatus) {
    onTotpChanged(t);
  }

  async function verifyAndSave() {
    setBusy(true);
    setError(null);
    try {
      const data = await post({ action: "verify", code, paybill, accountPrefix, name });
      onSaved({ paybill, accountPrefix, name });
      setNotice(data.message ?? "Updated.");
      setEditing(false);
      setEnrollment(null);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <Building className="h-4 w-4 text-brand-600" /> M-Pesa receiving account
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            The paybill/till that receives customer payments. Changes need your authenticator code.
          </p>
        </div>
        <Badge tone={enrolled ? "success" : "warning"}>
          {enrolled ? "Authenticator active" : "Authenticator not set up"}
        </Badge>
      </div>

      {!editing ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <ReadField label="Paybill / till" value={merchant.paybill} />
          <ReadField label="Account prefix" value={merchant.accountPrefix} />
          <ReadField label="Merchant name" value={merchant.name} />
          <div className="sm:col-span-3">
            <Button variant="secondary" size="sm" onClick={() => { setEditing(true); setNotice(null); }}>
              Amend receiving account
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>New paybill / till</Label>
              <Input
                value={paybill}
                onChange={(e) => setPaybill(e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="e.g. 174379"
                inputMode="numeric"
              />
            </div>
            <div>
              <Label>Account prefix</Label>
              <Input value={accountPrefix} onChange={(e) => setAccountPrefix(e.target.value.toUpperCase().slice(0, 8))} />
            </div>
            <div>
              <Label>Merchant name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          {/* ---- one-time authenticator setup ---- */}
          {!enrolled && !enrollment && (
            <div className="rounded-xl border border-accent-200 bg-accent-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <KeyRound className="h-4 w-4 text-accent-600" /> First time here — set up your authenticator
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Changes are protected by a TOTP authenticator (totp-cli, Google Authenticator,
                Aegis, 1Password…). Generate your secret, add it to the app, then confirm with a
                code — one time only.
              </p>
              <Button className="mt-3" size="sm" onClick={startEnrollment} disabled={busy}>
                {busy ? <Spinner /> : <><KeyRound className="h-4 w-4" /> Generate my secret</>}
              </Button>
            </div>
          )}

          {enrollment && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
              <p className="text-sm font-medium text-slate-900">Add this secret to your authenticator app</p>
              <p className="mt-1 text-xs text-slate-500">
                Paste the secret into totp-cli (<code>totp-cli import</code>), or scan the
                otpauth URI with your app:
              </p>
              <code className="mt-2 block max-w-full overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-800 ring-1 ring-slate-200">
                {enrollment.otpauthUri}
              </code>
              <p className="mt-2 break-all text-xs text-slate-500">
                Secret: <span className="font-mono font-semibold text-slate-700">{enrollment.secret}</span>
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  className="max-w-40 tracking-[0.5em]"
                  aria-label="6-digit code from your authenticator"
                />
                <Button onClick={confirmEnrollment} disabled={busy || code.length !== 6}>
                  {busy ? <Spinner /> : <><CheckCircle2 className="h-4 w-4" /> Confirm</>}
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Codes rotate every 30 s — type the one currently shown in your app.
              </p>
            </div>
          )}

          {/* ---- verification for the actual change ---- */}
          {enrolled && !enrollment && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Label>Code from your authenticator</Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  className="max-w-40 tracking-[0.5em]"
                  aria-label="6-digit code from your authenticator"
                />
                <Button onClick={verifyAndSave} disabled={busy || code.length !== 6 || !paybill}>
                  {busy ? <Spinner /> : <><ShieldCheck className="h-4 w-4" /> Verify & apply</>}
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Each code works once and expires with its 30-second window.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => { setEditing(false); setEnrollment(null); setCode(""); setError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
