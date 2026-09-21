"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Star, Trash2, UserCog } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Input, Label, Spinner } from "@/components/ui";
import { AddressForm } from "@/components/address-form";
import { phoneSchema } from "@/lib/validation";
import type { Address, Profile } from "@/lib/types";

export function AccountClient({
  userId,
  email,
  profile,
  addresses,
  storeName,
}: {
  userId: string;
  email: string;
  profile: Profile | null;
  addresses: Address[];
  storeName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(addresses.length === 0);
  const [busyAddress, setBusyAddress] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);

    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setProfileMsg({ tone: "danger", text: parsed.error.issues[0]?.message ?? "Invalid phone" });
      return;
    }

    setSavingProfile(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim(), phone: parsed.data })
        .eq("id", userId);
      if (error) throw error;
      setProfileMsg({ tone: "success", text: "Profile updated." });
      router.refresh();
    } catch (err) {
      setProfileMsg({
        tone: "danger",
        text: err instanceof Error ? err.message : "Could not save profile",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function makeDefault(id: string) {
    setBusyAddress(id);
    try {
      await fetch("/api/addresses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, makeDefault: true }),
      });
      router.refresh();
    } finally {
      setBusyAddress(null);
    }
  }

  async function removeAddress(id: string) {
    setBusyAddress(id);
    try {
      await fetch(`/api/addresses?id=${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusyAddress(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Profile */}
      <section className="card p-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-900">
          <UserCog className="h-4 w-4 text-brand-600" /> Your details
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Your M-Pesa number is used to send the payment prompt.
        </p>

        <form onSubmit={saveProfile} className="mt-5 space-y-4">
          {profileMsg && <Alert tone={profileMsg.tone}>{profileMsg.text}</Alert>}

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={email} disabled />
          </div>
          <div>
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="phone">M-Pesa phone number</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              required
            />
          </div>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile ? <Spinner /> : "Save changes"}
          </Button>
        </form>
      </section>

      {/* Addresses */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Delivery addresses</h2>
          {!showAddressForm && (
            <button
              type="button"
              onClick={() => setShowAddressForm(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          )}
        </div>

        {addresses.length === 0 && !showAddressForm && (
          <p className="mt-3 text-sm text-slate-500">No addresses saved yet.</p>
        )}

        <ul className="mt-4 space-y-3">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {address.label}
                  {address.is_default && (
                    <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                      DEFAULT
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {address.line1}
                  {address.area ? `, ${address.area}` : ""}, {address.city}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!address.is_default && (
                  <button
                    type="button"
                    onClick={() => makeDefault(address.id)}
                    disabled={busyAddress === address.id}
                    className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-brand-50 hover:text-brand-600"
                    aria-label="Make default"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                {address.is_default && (
                  <span className="grid h-8 w-8 place-items-center text-brand-600">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAddress(address.id)}
                  disabled={busyAddress === address.id}
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Delete address"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {showAddressForm && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-sm font-medium text-slate-700">New address</h3>
            <AddressForm
              compact
              storeName={storeName}
              onSaved={() => setShowAddressForm(false)}
            />
          </div>
        )}
      </section>
    </div>
  );
}
