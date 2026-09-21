"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  KeyRound,
  MapPin,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Alert, Badge, Button, Input, Label, Select, Spinner } from "@/components/ui";
import { cn, formatDateTime } from "@/lib/utils";

interface ManagedUser {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  approval_status: string;
  created_at: string;
  email: string | null;
  email_confirmed: boolean;
  last_sign_in_at: string | null;
  order_count: number;
}

/**
 * User management dashboard — one table of every account with:
 *  • search (name / email / phone)
 *  • role & approval changes (with guard rails)
 *  • account creation
 *  • deletion (blocked for users with order history)
 */
export function UserManager() {
  const searchParams = useSearchParams();
  // Deep link from the locations map: /admin/users?user=<profileId>
  const highlightId = searchParams.get("user");

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [actingId, setActingId] = useState<string | null>(null);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Create-account form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "customer",
    approve: true,
  });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not load users.");
      setUsers(data.users ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const kickoff = Promise.resolve().then(load);
    return () => {
      Promise.resolve(kickoff).catch(() => {});
    };
  }, [load]);

  // Scroll the deep-linked user's row into view once users have loaded.
  useEffect(() => {
    if (!highlightId || loading) return;
    rowRefs.current.get(highlightId)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId, loading]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.phone ?? "").includes(q)
      );
    });
  }, [users, query, roleFilter]);

  const counts = useMemo(() => {
    const c = { total: users.length, pending: 0, partners: 0, staff: 0, customers: 0 };
    for (const u of users) {
      if (u.approval_status === "pending") c.pending++;
      if (u.role === "courier" || u.role === "stockist") c.partners++;
      else if (u.role === "admin" || u.role === "vendor") c.staff++;
      else c.customers++;
    }
    return c;
  }, [users]);

  async function patch(profileId: string, body: Record<string, unknown>, okMsg: string) {
    setActingId(profileId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, ...body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Update failed.");
      setNotice(okMsg);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setActingId(null);
    }
  }

  async function remove(u: ManagedUser) {
    if (
      !confirm(
        `Permanently delete ${u.full_name ?? u.email ?? u.id}? This cannot be undone.`
      )
    )
      return;
    setActingId(u.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/users?id=${u.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Delete failed.");
      setNotice("Account deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setActingId(null);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not create the account.");
      setNotice(`${form.email} created as ${form.role}.`);
      setForm({ fullName: "", email: "", phone: "", password: "", role: "customer", approve: true });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {/* Summary + toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">
          <Users className="h-3.5 w-3.5" /> {counts.total} total
        </Badge>
        {counts.pending > 0 && <Badge tone="warning">{counts.pending} pending approval</Badge>}
        <Badge tone="info">{counts.partners} partners</Badge>
        <Badge tone="success">{counts.staff} staff</Badge>
        <Badge tone="neutral">{counts.customers} customers</Badge>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="u-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="u-search"
              className="pl-9"
              placeholder="Name, email or phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select id="u-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="vendor">Vendor</option>
            <option value="courier">Rider / courier</option>
            <option value="stockist">Stockist</option>
            <option value="customer">Customer</option>
          </Select>
        </div>
        <Button variant={showCreate ? "secondary" : "primary"} onClick={() => setShowCreate((v) => !v)}>
          <UserPlus className="h-4 w-4" /> Create account
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={createUser} className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-name">Full name</Label>
              <Input
                id="c-name"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Jane Wanjiku"
                required
              />
            </div>
            <div>
              <Label htmlFor="c-email">Email</Label>
              <Input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="c-phone">Phone (optional)</Label>
              <Input
                id="c-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0712 345 678"
              />
            </div>
            <div>
              <Label htmlFor="c-pass">Temporary password</Label>
              <Input
                id="c-pass"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>
            <div>
              <Label htmlFor="c-role">Role</Label>
              <Select
                id="c-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="customer">Customer</option>
                <option value="courier">Rider / courier</option>
                <option value="stockist">Stockist</option>
                <option value="vendor">Vendor (Farmer&apos;s Choice)</option>
                <option value="admin">Admin</option>
              </Select>
            </div>
            {["courier", "stockist"].includes(form.role) && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.approve}
                  onChange={(e) => setForm({ ...form, approve: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Approve immediately
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={creating}>
              {creating ? <Spinner /> : <UserPlus className="h-4 w-4" />} Create account
            </Button>
            <p className="text-xs text-slate-500">
              Share the email + temporary password with the user; they can change it
              after signing in.
            </p>
          </div>
        </form>
      )}

      {/* Users table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Approval</th>
              <th className="px-4 py-3 font-medium">Orders</th>
              <th className="px-4 py-3 font-medium">Last sign-in</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((u) => {
              const isPartner = u.role === "courier" || u.role === "stockist";
              const isStaff = u.role === "admin" || u.role === "vendor";
              const busy = actingId === u.id;
              const highlighted = u.id === highlightId;
              return (
                <tr
                  key={u.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(u.id, el);
                    else rowRefs.current.delete(u.id);
                  }}
                  className={cn(
                    highlighted
                      ? "bg-accent-50/70 ring-1 ring-inset ring-accent-300"
                      : "hover:bg-slate-50/60"
                  )}
                >
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-1.5 font-medium text-slate-800">
                      {u.full_name ?? "(no name)"}
                      {highlighted && (
                        <Badge tone="warning">
                          <MapPin className="h-3 w-3" /> from map
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{u.email ?? "—"}</p>
                    {u.phone && <p className="text-xs text-slate-400">{u.phone}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      aria-label={`Role for ${u.full_name ?? u.email}`}
                      className="w-32"
                      value={u.role}
                      disabled={busy}
                      onChange={(e) =>
                        patch(
                          u.id,
                          { role: e.target.value },
                          `${u.full_name ?? u.email} is now ${e.target.value === "admin" ? "an admin" : `a ${e.target.value}`}.`
                        )
                      }
                    >
                      <option value="customer">Customer</option>
                      <option value="courier">Rider</option>
                      <option value="stockist">Stockist</option>
                      <option value="vendor">Vendor</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    {isPartner ? (
                      <div className="flex items-center gap-2">
                        <Badge
                          tone={
                            u.approval_status === "approved"
                              ? "success"
                              : u.approval_status === "pending"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {u.approval_status}
                        </Badge>
                        {u.approval_status !== "approved" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              patch(u.id, { approval: "approved" }, `${u.full_name ?? u.email} approved.`)
                            }
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                        {u.approval_status === "approved" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              patch(
                                u.id,
                                { approval: "pending" },
                                `${u.full_name ?? u.email} locked out (pending again).`
                              )
                            }
                          >
                            Lock out
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">n/a</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.order_count}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : "never"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {isStaff && (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-slate-400"
                          title="Staff accounts are managed via role changes"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => remove(u)}
                        title={
                          u.order_count > 0
                            ? "User has order history — deletion will be blocked"
                            : "Delete this account"
                        }
                      >
                        {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No users match your search.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  <Spinner /> Loading users…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <KeyRound className="h-3.5 w-3.5" />
        Password resets: ask the user to use “Forgot password” on the login page —
        passwords are hashed and cannot be viewed by admins.
      </p>
    </div>
  );
}
