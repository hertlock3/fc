"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Alert, Badge, Button, Input, Label, Select, Spinner } from "@/components/ui";

interface TeamMember {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  open_trips: number;
}

/** Admin team manager — list couriers/staff, promote accounts by email. */
export function TeamManager() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("courier");
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    // No synchronous setState here: `loading` starts true so the first fetch
    // shows the spinner, and later refreshes (after promote) update in place.
    try {
      const res = await fetch("/api/admin/team", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load team.");
      setTeam(data.team ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Defer one microtask so the effect body itself never calls setState —
    // `load` awaits before any state update (same pattern as order chat).
    const kickoff = Promise.resolve().then(load);
    return () => {
      Promise.resolve(kickoff).catch(() => {});
    };
  }, [load]);

  async function promote() {
    setPromoting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Promotion failed.");
      setNotice(`${email} is now ${role === "admin" ? "an admin" : `a ${role}`}.`);
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promotion failed.");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className="card p-5">
        <h2 className="font-semibold text-slate-900">Promote an account</h2>
        <p className="mt-1 text-sm text-slate-500">
          The person must already have registered. Couriers see their trips at{" "}
          <code className="rounded bg-slate-100 px-1">/courier</code>; admins/vendors see the
          full operations dashboard and chat.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rider@example.com"
            />
          </div>
          <div>
            <Label>Role</Label>
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="courier">Courier</option>
              <option value="stockist">Stockist</option>
              <option value="admin">Admin</option>
              <option value="vendor">Vendor (Farmer&apos;s Choice)</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={promote} disabled={promoting || !email.trim()}>
              {promoting ? <Spinner /> : <><UserPlus className="h-4 w-4" /> Promote</>}
            </Button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-slate-900">Couriers &amp; staff</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Open trips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {m.full_name ?? "(no name)"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        m.role === "courier"
                          ? "info"
                          : m.role === "stockist"
                            ? "warning"
                            : "success"
                      }
                    >
                      {m.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{m.open_trips}</td>
                </tr>
              ))}
              {team.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    No couriers or staff yet — promote an account above.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500">
                    <Spinner /> Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
