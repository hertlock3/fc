"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, ShieldCheck, UserPlus, X } from "lucide-react";
import { Alert, Badge, Button, Input, Label, Select, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

interface TeamMember {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  open_trips: number;
}

interface PartnerAccount {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  approval_status: string;
  created_at: string;
  updated_at: string;
  location: { id: string; name: string; is_active: boolean } | null;
}

/** Admin team manager — partner approvals, couriers/staff, promote by email. */
export function TeamManager() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [partners, setPartners] = useState<PartnerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("courier");
  const [promoting, setPromoting] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // No synchronous setState here: `loading` starts true so the first fetch
    // shows the spinner, and later refreshes (after promote/approve) update
    // in place.
    try {
      const [teamRes, partnersRes] = await Promise.all([
        fetch("/api/admin/team", { cache: "no-store" }),
        fetch("/api/admin/partners", { cache: "no-store" }),
      ]);
      const teamData = await teamRes.json().catch(() => null);
      const partnersData = await partnersRes.json().catch(() => null);
      if (!teamRes.ok) throw new Error(teamData?.error ?? "Could not load team.");
      if (!partnersRes.ok)
        throw new Error(partnersData?.error ?? "Could not load partner approvals.");
      setTeam(teamData.team ?? []);
      setPartners(partnersData.partners ?? []);
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

  async function decide(profileId: string, action: "approve" | "reject" | "revoke") {
    setActingId(profileId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/partners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Action failed.");
      setNotice(
        action === "approve"
          ? "Partner approved — they now have full platform access."
          : action === "reject"
            ? "Partner registration rejected."
            : "Partner access revoked — the account is pending again."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActingId(null);
    }
  }

  const pending = partners.filter((p) => p.approval_status === "pending");
  const decided = partners.filter((p) => p.approval_status !== "pending");

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* -------------------------------------------------------------- */}
      {/* Pending partner approvals                                       */}
      {/* -------------------------------------------------------------- */}
      <section className="card p-5">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <Clock className="h-4 w-4 text-accent-600" /> Pending approvals
          {pending.length > 0 && <Badge tone="warning">{pending.length}</Badge>}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Riders and stockists who registered. Approving unlocks the platform for
          them — until then they only see the “pending authentication” screen.
        </p>

        <div className="mt-4 space-y-3">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-200 bg-accent-50/50 p-4"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {p.full_name ?? "(no name)"}{" "}
                  <Badge tone={p.role === "courier" ? "info" : "warning"}>{p.role}</Badge>
                  {p.location && (
                    <Badge tone={p.location.is_active ? "success" : "neutral"}>
                      location {p.location.is_active ? "active" : "inactive"}
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {p.phone ?? "no phone"} · registered {formatDateTime(p.created_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => decide(p.id, "approve")}
                  disabled={actingId === p.id}
                >
                  {actingId === p.id ? <Spinner /> : <Check className="h-4 w-4" />} Approve
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => decide(p.id, "reject")}
                  disabled={actingId === p.id}
                >
                  <X className="h-4 w-4" /> Reject
                </Button>
              </div>
            </div>
          ))}
          {pending.length === 0 && !loading && (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No sign-ups waiting — new rider &amp; stockist registrations appear here.
            </p>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------- */}
      {/* Promote an existing account                                     */}
      {/* -------------------------------------------------------------- */}
      <section className="card p-5">
        <h2 className="font-semibold text-slate-900">Promote an account</h2>
        <p className="mt-1 text-sm text-slate-500">
          The person must already have registered. Promoting also approves the
          account. Couriers see their trips at{" "}
          <code className="rounded bg-slate-100 px-1">/courier</code>; admins/vendors
          see the full operations dashboard and chat.
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

      {/* -------------------------------------------------------------- */}
      {/* Current couriers & staff                                        */}
      {/* -------------------------------------------------------------- */}
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

      {/* -------------------------------------------------------------- */}
      {/* Decided partners (approved / rejected)                          */}
      {/* -------------------------------------------------------------- */}
      <section>
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-brand-600" /> Partner accounts
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Approved partners have full access. Revoking puts an account back into
          pending — they are locked out again immediately.
        </p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {decided.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {p.full_name ?? "(no name)"}
                    <span className="block text-xs font-normal text-slate-400">
                      {p.phone ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.role === "courier" ? "info" : "warning"}>{p.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.approval_status === "approved" ? "success" : "danger"}>
                      {p.approval_status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.location ? p.location.name : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.approval_status === "approved" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => decide(p.id, "revoke")}
                        disabled={actingId === p.id}
                      >
                        Revoke access
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => decide(p.id, "approve")}
                        disabled={actingId === p.id}
                      >
                        Approve
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {decided.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No approved or rejected partners yet.
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
