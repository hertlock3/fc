import Link from "next/link";
import { MapPin, Store, UserX } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminNav } from "@/components/admin-nav";
import { NotConfigured } from "@/components/not-configured";
import {
  StockistLocationsMap,
  type StockistMapLocation,
} from "@/components/stockist-locations-map";

export const metadata = { title: "Locations map — Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin locations map — every fulfilment location (principal plant included)
 * pinned on a Leaflet map. Clicking a pin (or its list entry) opens the linked
 * partner's profile on the user management dashboard (/admin/users?user=<id>).
 * Locations without a partner login link to the stockist manager instead.
 */
export default async function AdminLocationsPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;

  await requireAdmin();

  const admin = createAdminClient();

  // Locations (RLS: public read) + the partner logins linked to them.
  const { data: stockistRows } = await admin
    .from("stockists")
    .select("id, name, address, city, phone, lat, lng, is_active, is_principal, profile_id")
    .order("is_principal", { ascending: false })
    .order("name", { ascending: true });

  const rows = (stockistRows ?? []) as Array<{
    id: string;
    name: string;
    address: string;
    city: string;
    phone: string | null;
    lat: number;
    lng: number;
    is_active: boolean;
    is_principal: boolean;
    profile_id: null | string;
  }>;

  // Partner profile (role/approval) for each linked login.
  const profileIds = rows.map((r) => r.profile_id).filter((id): id is string => Boolean(id));
  const { data: profileRows } = profileIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, role, approval_status")
        .in("id", profileIds)
    : { data: [] };

  const profilesById = new Map(
    ((profileRows ?? []) as Array<{
      id: string;
      full_name: string | null;
      role: string;
      approval_status: string;
    }>).map((p) => [p.id, p])
  );

  const locations: StockistMapLocation[] = rows.map((r) => {
    const profile = r.profile_id ? profilesById.get(r.profile_id) : undefined;
    return {
      id: r.id,
      name: r.name,
      address: r.address,
      city: r.city,
      phone: r.phone,
      lat: r.lat,
      lng: r.lng,
      is_active: r.is_active,
      is_principal: r.is_principal,
      profile_id: r.profile_id,
      partner_name: profile?.full_name ?? null,
      partner_role: profile?.role ?? null,
      partner_approval: profile?.approval_status ?? null,
    };
  });

  const partnerCount = locations.filter((l) => l.profile_id).length;

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Locations map
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {locations.length} fulfilment locations · {partnerCount} with partner
        logins. Click a pin or list entry to open its partner account on the user
        management dashboard.
      </p>
      <div className="mt-5">
        <AdminNav active="locations" />
      </div>

      <div className="mt-6">
        <StockistLocationsMap locations={locations} />
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <MapPin className="h-3.5 w-3.5" />
        Locations are managed in{" "}
        <Link href="/admin/stockists" className="font-medium text-brand-700 hover:underline">
          Stockists
        </Link>
        ; partner accounts in{" "}
        <Link href="/admin/users" className="font-medium text-brand-700 hover:underline">
          User accounts
        </Link>
        . Principal plant: <Store className="inline h-3.5 w-3.5" /> gold pin · No
        partner login: <UserX className="inline h-3.5 w-3.5" /> grey pin.
      </p>
    </div>
  );
}
