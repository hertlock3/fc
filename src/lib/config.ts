/**
 * Central application configuration.
 *
 * Everything is read from the environment with sensible, clearly-labelled
 * defaults so that the whole flow can run in *simulation* mode without any
 * third-party credentials. Switching to live M-Pesa / Uber Direct is a matter
 * of flipping the provider env vars and supplying keys — no code changes.
 */

function env(key: string): string | undefined {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Read a public env var that MUST be referenced statically.
 *
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` when accessed with a
 * literal property name — a dynamic `process.env[key]` is never replaced in
 * the browser bundle. Public values therefore have to be read explicitly here.
 */
function publicEnv(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function num(key: string, fallback: number): number {
  const raw = env(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Safaricom's public Daraja **sandbox** passkey for Lipa na M-Pesa Online.
 * It is documented and shared across all sandbox apps, so we default to it to
 * let the sandbox work with only a Consumer Key/Secret. Production always
 * requires a real passkey (env `MPESA_PASSKEY`).
 */
export const MPESA_SANDBOX_PASSKEY =
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

/** Safaricom's public Daraja sandbox shortcode (Lipa na M-Pesa Online). */
export const MPESA_SANDBOX_SHORTCODE = "174379";

const mpesaEnvironment = (env("MPESA_ENV") ?? "sandbox") as
  | "sandbox"
  | "production";

export const config = {
  appName: "Farmer's Choice Market",
  /** Public base URL used to build callback URLs handed to M-Pesa/Uber. */
  appUrl: env("APP_URL") ?? "http://localhost:3000",

  supabase: {
    // Statically referenced so they are inlined into the client bundle.
    url: publicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: publicEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  },

  /** Platform service fee applied on top of (goods + delivery). */
  serviceFee: {
    percent: num("SERVICE_FEE_PERCENT", 3),
  },

  /**
   * Delivery pricing model (KES).
   * Delivery Fee = baseFee + perKm * distanceKm, clamped to [minFee, maxFee].
   */
  deliveryPricing: {
    baseFee: num("DELIVERY_BASE_FEE", 100),
    perKmFee: num("DELIVERY_PER_KM_FEE", 35),
    minFee: num("DELIVERY_MIN_FEE", 130),
    maxFee: num("DELIVERY_MAX_FEE", 1500),
    /** Flat markup applied during peak hours (07:00–09:00, 16:00–19:00). */
    peakMultiplier: num("DELIVERY_PEAK_MULTIPLIER", 1.15),
  },

  /** Farmer's Choice pickup origin (Kahawa West, Nairobi). */
  store: {
    name: env("STORE_NAME") ?? "Farmer's Choice — Kahawa West",
    address:
      env("STORE_ADDRESS") ?? "Farmer's Choice Depot, Kamiti Road, Kahawa West, Nairobi",
    lat: num("STORE_LAT", -1.2250),
    lng: num("STORE_LNG", 36.9060),
    phone: env("STORE_PHONE") ?? "+254700000000",
  },

  /**
   * Wallet / paybill that receives customer money.
   * In simulation mode this is purely informational.
   */
  merchant: {
    name: env("MERCHANT_NAME") ?? "Farmer's Choice Market Ltd",
    paybill: env("MERCHANT_PAYBILL") ?? "000000",
    accountPrefix: env("MERCHANT_ACCOUNT_PREFIX") ?? "FCM",
    settlementBank: env("MERCHANT_SETTLEMENT_BANK") ?? "Equity Bank",
  },

  money: {
    /** "sim" (default) or "daraja" for the live Safaricom Daraja API. */
    provider: (env("MONEY_PROVIDER") ?? "sim") as "sim" | "daraja",
    mpesa: {
      environment: mpesaEnvironment,
      consumerKey: env("MPESA_CONSUMER_KEY"),
      consumerSecret: env("MPESA_CONSUMER_SECRET"),
      shortcode: env("MPESA_SHORTCODE") ?? MPESA_SANDBOX_SHORTCODE,
      passkey:
        env("MPESA_PASSKEY") ??
        (mpesaEnvironment === "sandbox" ? MPESA_SANDBOX_PASSKEY : undefined),
      transactionType:
        (env("MPESA_TRANSACTION_TYPE") ?? "CustomerPayBillOnline") as
          | "CustomerPayBillOnline"
          | "CustomerBuyGoodsOnline",
      /** Shared secret appended to the callback URL to verify authenticity. */
      callbackSecret: env("MPESA_CALLBACK_SECRET"),
    },
  },

  delivery: {
    /** "sim" (default), "uber_direct", or "manual". */
    provider: (env("DELIVERY_PROVIDER") ?? "sim") as
      | "sim"
      | "uber_direct"
      | "manual",
    uber: {
      clientId: env("UBER_CLIENT_ID"),
      clientSecret: env("UBER_CLIENT_SECRET"),
      customerId: env("UBER_CUSTOMER_ID"),
    },
  },

  distance: {
    /**
     * "haversine" (default, no API key needed — straight-line estimate with a
     * road factor) or "google" for the Google Routes/Distance Matrix API.
     */
    provider: (env("DISTANCE_PROVIDER") ?? "haversine") as
      | "haversine"
      | "google",
    googleApiKey: env("GOOGLE_MAPS_API_KEY"),
    /** Road factor applied to straight-line distance for the haversine model. */
    roadFactor: num("DISTANCE_ROAD_FACTOR", 1.35),
  },

  /**
   * Transactional email (Resend) — delivers the admin's one-time code for
   * sensitive actions such as changing the M-Pesa receiving account.
   */
  email: {
    apiKey: env("RESEND_API_KEY"),
    from: env("EMAIL_FROM") ?? "Farmer's Choice Market <onboarding@resend.dev>",
  },

  /**
   * Geocoding for the map pin picker. OpenStreetMap's Nominatim needs no key,
   * but its usage policy requires an identifying User-Agent. Requests are made
   * server-side (see /api/geocode/*) so we can set it.
   */
  geocode: {
    userAgent:
      env("GEOCODE_USER_AGENT") ??
      "Farmer's Choice Market (https://example.com; contact@example.com)",
  },
} as const;

export type AppConfig = typeof config;

/** True when a Supabase project has been configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(config.supabase.url && config.supabase.anonKey);
}

/** True when the server can perform privileged writes. */
export function hasServiceRole(): boolean {
  return Boolean(config.supabase.serviceRoleKey);
}
