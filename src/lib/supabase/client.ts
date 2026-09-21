"use client";

import { createBrowserClient } from "@supabase/ssr";
import { config } from "@/lib/config";

/**
 * Browser Supabase client. Safe to call repeatedly — `createBrowserClient`
 * memoises the underlying singleton.
 */
export function createClient() {
  if (!config.supabase.url || !config.supabase.anonKey) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local"
    );
  }
  return createBrowserClient(config.supabase.url, config.supabase.anonKey);
}
