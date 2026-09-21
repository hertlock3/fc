#!/usr/bin/env node
/**
 * Supabase connectivity check.
 *
 * Confirms your `.env.local` points at a reachable Supabase project and that
 * the schema + seed data have been applied, by querying the public catalog
 * tables through the REST API with the anon key (which respects RLS).
 *
 * Usage: npm run supabase:check
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  const filePath = resolve(process.cwd(), file);
  if (existsSync(filePath)) {
    try {
      process.loadEnvFile(filePath);
    } catch (err) {
      console.warn(`! Could not load ${file}: ${err.message}`);
    }
  }
}

const env = (key) => {
  const value = process.env[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
};

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

const ok = (msg) => console.log(`\u2713 ${msg}`);
const bad = (msg) => console.log(`\u2717 ${msg}`);
const warn = (msg) => console.log(`! ${msg}`);
const info = (msg) => console.log(`   ${msg}`);

console.log("\nSupabase connectivity check");
console.log("---------------------------");

if (!url || !anonKey) {
  bad("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  info("Copy .env.example → .env.local and paste your project keys.");
  process.exit(1);
}

info(`Project URL : ${url}`);
info(`Anon key    : ${anonKey.slice(0, 12)}…`);
info(
  `Service key : ${serviceRoleKey ? `${serviceRoleKey.slice(0, 8)}… (set)` : "NOT set (checkout/admin need it)"}\n`
);

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Count rows in a table, returning a friendly error instead of throwing. */
async function count(table) {
  const { count: total, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return { table, error: error.message };
  return { table, total: total ?? 0 };
}

const tables = ["categories", "products", "settings"];
const results = [];

for (const table of tables) {
  results.push(await count(table));
}

let failed = false;
for (const result of results) {
  if (result.error) {
    if (result.table === "settings") {
      // `settings` may be admin-only under RLS — not a setup failure.
      warn(`${result.table}: not readable with the anon key (fine if RLS restricts it)`);
    } else {
      failed = true;
      bad(`${result.table}: ${result.error}`);
    }
  } else if (result.total === 0 && result.table !== "settings") {
    bad(`${result.table}: reachable but empty (run supabase/seed.sql)`);
  } else {
    ok(`${result.table}: ${result.total} row(s)`);
  }
}

if (!serviceRoleKey) {
  info("");
  bad("SUPABASE_SERVICE_ROLE_KEY is not set — checkout, payment callbacks and");
  info("the admin dashboard will not work until you add it.");
}

if (failed) {
  info("");
  info("If tables are missing, apply the schema:");
  info("  npx supabase link --project-ref <your-ref>   # one time");
  info("  npm run db:push                              # migrations");
  info("  then run supabase/seed.sql in the SQL Editor (or `supabase db reset` locally).");
  process.exit(1);
}

console.log("");
ok("Supabase looks good.");
