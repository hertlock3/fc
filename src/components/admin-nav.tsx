import Link from "next/link";
import {
  ClipboardList,
  Map,
  Tags,
  UserCog,
  Users,
  Wallet,
  LayoutDashboard,
  Store,
} from "lucide-react";

const ITEMS = [
  { key: "dashboard", href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { key: "orders", href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { key: "catalog", href: "/admin/products", label: "Catalog", icon: Tags },
  { key: "stockists", href: "/admin/stockists", label: "Stockists", icon: Store },
  { key: "locations", href: "/admin/locations", label: "Locations map", icon: Map },
  { key: "finance", href: "/admin/finance", label: "Finance", icon: Wallet },
  { key: "team", href: "/admin/team", label: "Team", icon: Users },
  { key: "users", href: "/admin/users", label: "User accounts", icon: UserCog },
] as const;

/** Shared navigation for the admin section. Server component. */
export function AdminNav({
  active,
}: {
  active:
    | "dashboard"
    | "orders"
    | "catalog"
    | "stockists"
    | "locations"
    | "finance"
    | "team"
    | "users";
}) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Admin">
      {ITEMS.map(({ key, href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={active === key ? "page" : undefined}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
            active === key
              ? "bg-brand-600 text-white shadow-sm"
              : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
