import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Category,
  Order,
  OrderWithRelations,
  Product,
  Stockist,
} from "@/lib/types";

/** List active products, optionally filtered by category slug or search text. */
export async function listProducts(
  client: SupabaseClient,
  opts: { categorySlug?: string | null; search?: string | null } = {}
): Promise<Product[]> {
  let query = client
    .from("products")
    .select("*, category:categories(slug)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (opts.search && opts.search.trim()) {
    query = query.ilike("name", `%${opts.search.trim()}%`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let products = data as Product[];
  if (opts.categorySlug) {
    products = products.filter(
      (p) => (p as Product & { category?: { slug: string } }).category?.slug === opts.categorySlug
    );
  }
  return products;
}

/** List categories in display order. */
export async function listCategories(client: SupabaseClient): Promise<Category[]> {
  const { data, error } = await client
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as Category[];
}

/** Fetch a single order with its line items, invoices, payments, delivery and timeline. */
export async function getOrderWithRelations(
  client: SupabaseClient,
  orderId: string
): Promise<OrderWithRelations | null> {
  const { data, error } = await client
    .from("orders")
    .select(
      `*,
       order_items (*),
       invoices (*),
       payments (*),
       deliveries (*),
       order_events (*),
       profile:profiles (full_name, phone),
       stockist:stockists (id, name, address, city, phone, lat, lng)`
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) return null;

  const order = data as unknown as OrderWithRelations;
  // PostgREST returns a to-one embed as an object; normalise defensively.
  const stockist = (order as unknown as { stockist?: Stockist | Stockist[] | null }).stockist;
  order.stockist = Array.isArray(stockist) ? (stockist[0] ?? null) : (stockist ?? null);
  // Sort the timeline chronologically.
  order.order_events = (order.order_events ?? []).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return order;
}

/** List orders for a user (or all, for admins). */
export async function listOrders(
  client: SupabaseClient,
  opts: {
    userId?: string;
    statuses?: string[];
    limit?: number;
    /** Join line items + customer name (used by the admin orders table). */
    relations?: boolean;
  } = {}
): Promise<Order[]> {
  const select = opts.relations
    ? "*, order_items (*), profile:profiles (full_name), stockist:stockists (id, name, address, city)"
    : "*";
  let query = client
    .from("orders")
    .select(select)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.userId) query = query.eq("user_id", opts.userId);
  if (opts.statuses?.length) query = query.in("status", opts.statuses);

  const { data, error } = await query;
  if (error || !data) return [];
  // Normalise the to-one embed (PostgREST may return object or array).
  return (data as unknown as Array<Order & { stockist?: unknown }>).map((o) => {
    const s = o.stockist;
    return { ...o, stockist: Array.isArray(s) ? (s[0] ?? null) : (s ?? null) };
  });
}
