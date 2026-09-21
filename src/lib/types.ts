/** Shared domain types for the Farmer's Choice Market app. */

export type UserRole = "customer" | "admin" | "vendor" | "courier" | "stockist";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "awaiting_vendor_approval"
  | "vendor_approved"
  | "dispatching"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "cancelled"
  | "refunded";

export type DeliveryStatus =
  | "pending"
  | "requested"
  | "assigned"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled"
  | "failed";

export type DeliveryProviderName = "sim" | "uber_direct" | "manual";

export type InvoiceKind = "customer" | "vendor";

export type InvoiceStatus = "issued" | "paid" | "settled" | "void";

/** A fulfilment location: the principal plant or an approved stockist. */
export interface Stockist {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string | null;
  lat: number;
  lng: number;
  opening_hours: string | null;
  notes: string | null;
  is_active: boolean;
  /** The principal Farmer's Choice butchery plant (Ruiru) — always available. */
  is_principal: boolean;
  /** Partner login (profiles.id) that manages this location, if registered. */
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

/** A live GPS ping beamed from the rider's phone during a trip. */
export interface CourierLocationPing {
  lat: number;
  lng: number;
  /** GPS accuracy in metres, when the device reports it. */
  accuracy_m: number | null;
  heading_deg: number | null;
  speed_mps: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Address {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  area: string | null;
  city: string;
  lat: number;
  lng: number;
  delivery_notes: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  /** Unit price in integer cents (KES). */
  price_cents: number;
  unit: string;
  image_url: string | null;
  sku: string | null;
  in_stock: boolean;
  stock_qty: number;
  is_active: boolean;
  created_at: string;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  /** Price snapshot in cents at time of adding. */
  unit_price_cents: number;
  created_at: string;
  updated_at: string;
  /** Joined product (present when fetched with a relation). */
  product?: Product;
}

export interface Order {
  id: string;
  order_number: string;
  user_id: string;
  status: OrderStatus;
  payment_status: PaymentStatus;

  subtotal_cents: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  total_cents: number;
  /** What Farmer's Choice receives after the platform fee is deducted. */
  vendor_payout_cents: number;
  /** Platform revenue (service fee). */
  platform_fee_cents: number;

  delivery_address: AddressSnapshot | null;
  delivery_lat: number | null;
  delivery_lng: number | null;
  distance_km: number | null;

  /** The fulfilment location (principal plant or stockist) for this order. */
  stockist_id: string | null;
  stockist?: Pick<
    Stockist,
    "id" | "name" | "address" | "city" | "phone" | "lat" | "lng"
  > | null;

  mpesa_receipt: string | null;
  payment_ref: string | null;

  delivery_provider: DeliveryProviderName | null;
  delivery_external_id: string | null;
  delivery_status: DeliveryStatus | null;

  customer_notes: string | null;

  created_at: string;
  updated_at: string;
  paid_at: string | null;
  approved_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
}

export interface AddressSnapshot {
  label: string;
  line1: string;
  area: string | null;
  city: string;
  lat: number;
  lng: number;
  notes: string | null;
  phone: string;
  recipient: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  unit: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: "sim" | "daraja";
  amount_cents: number;
  phone: string;
  status: PaymentStatus;
  merchant_request_id: string | null;
  checkout_request_id: string | null;
  result_code: number | null;
  result_desc: string | null;
  receipt: string | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  order_id: string;
  kind: InvoiceKind;
  invoice_number: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  total_cents: number;
  status: InvoiceStatus;
  issued_at: string;
  meta: Record<string, unknown> | null;
}

export interface Delivery {
  id: string;
  order_id: string;
  provider: DeliveryProviderName;
  external_id: string | null;
  status: DeliveryStatus;
  courier_name: string | null;
  courier_phone: string | null;
  tracking_url: string | null;
  fee_cents: number;
  pickup: Record<string, unknown> | null;
  dropoff: Record<string, unknown> | null;
  raw: unknown;
  created_at: string;
  updated_at: string;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  event_type: string;
  message: string;
  actor: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export type SenderRole = "customer" | "courier" | "admin" | "vendor";

export interface OrderMessage {
  id: string;
  order_id: string;
  sender_id: string;
  sender_role: SenderRole;
  kind: "text" | "photo" | "location";
  body: string | null;
  image_path: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

/** A stockist with its distance from a point (used by the admin list). */
export interface StockistWithDistance extends Stockist {
  distance_km: number | null;
}

/** An order with its related rows joined — used across UI and APIs. */
export interface OrderWithRelations extends Order {
  order_items: OrderItem[];
  payments?: Payment[];
  deliveries?: Delivery[];
  order_events?: OrderEvent[];
  invoices?: Invoice[];
  profile?: Pick<Profile, "full_name" | "phone">;
}

/** A priced cart ready for checkout (all values in cents). */
export interface CartPricing {
  items: Array<{
    product_id: string;
    name: string;
    unit: string;
    unit_price_cents: number;
    quantity: number;
    line_total_cents: number;
  }>;
  subtotal_cents: number;
  delivery_fee_cents: number;
  service_fee_cents: number;
  service_fee_percent: number;
  total_cents: number;
  vendor_payout_cents: number;
  platform_fee_cents: number;
  distance_km: number | null;
}
