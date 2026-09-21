import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultPricingSettings, type PricingSettings } from "./pricing";

export const SETTINGS_KEY_PRICING = "pricing";
export const SETTINGS_KEY_MERCHANT = "merchant";

/**
 * Merchant / M-Pesa receiving account. Defaults come from env; the DB row
 * (settings key "merchant") overrides them once an admin amends the paybill.
 */
export interface MerchantSettings {
  /** Paybill or till number that receives customer money. */
  paybill: string;
  /** Prefix used in the M-Pesa account reference, e.g. FCM-FC-20260920-XXXX. */
  accountPrefix: string;
  /** Display name shown to customers on the payment step. */
  name: string;
}

export function defaultMerchantSettings(): MerchantSettings {
  return {
    paybill: "000000",
    accountPrefix: "FCM",
    name: "Farmer's Choice Market Ltd",
  };
}

/** Read a settings row (JSONB value) or null. Never throws. */
async function readSetting(
  client: SupabaseClient,
  key: string
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await client
      .from("settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data?.value) return null;
    return data.value as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Load pricing settings, merging any DB override on top of the env defaults.
 * Never throws — falls back to env/static defaults if the table is missing or
 * unreachable so the storefront always renders.
 */
export async function loadPricingSettings(
  client: SupabaseClient
): Promise<PricingSettings> {
  const defaults = defaultPricingSettings();
  const value = await readSetting(client, SETTINGS_KEY_PRICING);
  if (!value) return defaults;

  const partial = value as unknown as Partial<PricingSettings>;
  return {
    serviceFeePercent:
      typeof partial.serviceFeePercent === "number"
        ? partial.serviceFeePercent
        : defaults.serviceFeePercent,
    delivery: { ...defaults.delivery, ...(partial.delivery ?? {}) },
  };
}

/**
 * Load the merchant (paybill/till) settings, merging the DB override on top of
 * the env-backed defaults. Never throws.
 */
export async function loadMerchantSettings(
  client: SupabaseClient
): Promise<MerchantSettings> {
  const defaults = defaultMerchantSettings();
  const value = await readSetting(client, SETTINGS_KEY_MERCHANT);
  if (!value) return defaults;

  const str = (key: keyof MerchantSettings) => {
    const v = value[key];
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : defaults[key];
  };
  return {
    paybill: str("paybill"),
    accountPrefix: str("accountPrefix"),
    name: str("name"),
  };
}

/** Upsert the merchant settings row. Caller must be an authorised admin flow. */
export async function saveMerchantSettings(
  client: SupabaseClient,
  merchant: MerchantSettings
): Promise<void> {
  const { error } = await client
    .from("settings")
    .upsert(
      { key: SETTINGS_KEY_MERCHANT, value: merchant, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(error.message);
}
