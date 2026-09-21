#!/usr/bin/env node
/**
 * M-Pesa (Safaricom Daraja) connectivity check.
 *
 * Verifies that the Daraja credentials in `.env.local` are valid by:
 *   1. checking the required variables are present,
 *   2. requesting an OAuth access token, and
 *   3. (optionally) sending a real STK push to `MPESA_TEST_PHONE`.
 *
 * Usage:
 *   npm run mpesa:check
 *
 * Set `MONEY_PROVIDER=daraja`, `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`
 * and (optionally) `MPESA_TEST_PHONE` in `.env.local` first.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

/* -------------------------------------------------------------------------- */
/* Env loading (no dependencies — uses Node's built-in .env support)          */
/* -------------------------------------------------------------------------- */

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

/** Safaricom's public sandbox passkey (shared by every sandbox app). */
const SANDBOX_PASSKEY =
  "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";

const MPESA_ENV = env("MPESA_ENV") ?? "sandbox";
const BASE_URL =
  MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

const consumerKey = env("MPESA_CONSUMER_KEY");
const consumerSecret = env("MPESA_CONSUMER_SECRET");
const shortcode = env("MPESA_SHORTCODE") ?? "174379";
const passkey =
  env("MPESA_PASSKEY") ?? (MPESA_ENV === "sandbox" ? SANDBOX_PASSKEY : undefined);
const testPhone = env("MPESA_TEST_PHONE");
const callbackUrl =
  env("MPESA_CALLBACK_URL") ??
  `${env("APP_URL") ?? "http://localhost:3000"}/api/payments/mpesa/callback`;

const ok = (msg) => console.log(`\u2713 ${msg}`);
const bad = (msg) => console.log(`\u2717 ${msg}`);
const info = (msg) => console.log(`   ${msg}`);

console.log("\nM-Pesa (Daraja) connectivity check");
console.log("----------------------------------");
info(`Environment : ${MPESA_ENV}`);
info(`Base URL    : ${BASE_URL}`);
info(`Shortcode   : ${shortcode}`);
info(`Callback    : ${callbackUrl}\n`);

/* -------------------------------------------------------------------------- */
/* 1. Configuration                                                           */
/* -------------------------------------------------------------------------- */

const missing = [];
if (!consumerKey) missing.push("MPESA_CONSUMER_KEY");
if (!consumerSecret) missing.push("MPESA_CONSUMER_SECRET");
if (!passkey) missing.push("MPESA_PASSKEY");

if (missing.length > 0) {
  bad(`Missing credentials: ${missing.join(", ")}`);
  info("Create a sandbox app at https://developer.safaricom.co.ke → My Apps,");
  info("then paste the Consumer Key/Secret into .env.local and re-run.");
  process.exit(1);
}
ok("Required credentials are present");

/* -------------------------------------------------------------------------- */
/* 2. OAuth token                                                             */
/* -------------------------------------------------------------------------- */

const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

let accessToken;
try {
  const res = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${basic}` } }
  );
  const text = await res.text();
  if (!res.ok) {
    bad(`OAuth failed (HTTP ${res.status})`);
    info(text.slice(0, 400));
    process.exit(1);
  }
  const data = JSON.parse(text);
  accessToken = data.access_token;
  if (!accessToken) {
    bad("OAuth response did not include an access token");
    info(text.slice(0, 400));
    process.exit(1);
  }
  ok(`OAuth token acquired (expires in ${data.expires_in}s)`);
} catch (err) {
  bad(`OAuth request error: ${err.message}`);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* 3. Optional STK push                                                       */
/* -------------------------------------------------------------------------- */

if (!testPhone) {
  info("");
  ok("Done. Set MPESA_TEST_PHONE=2547XXXXXXXX to also test an STK push.");
  process.exit(0);
}

const timestamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14); // YYYYMMDDHHmmss
const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString(
  "base64"
);

console.log("");
info(`Sending STK push of KES 1 to ${testPhone}…`);

try {
  const res = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: 1,
      PartyA: testPhone,
      PartyB: shortcode,
      PhoneNumber: testPhone,
      CallBackURL: callbackUrl,
      AccountReference: "FC-CHECK",
      TransactionDesc: "Farmer's Choice connectivity check",
    }),
  });

  const data = await res.json();
  if (res.ok && data.ResponseCode === "0") {
    ok(`STK push accepted — CheckoutRequestID: ${data.CheckoutRequestID}`);
    info(data.CustomerMessage ?? "Check the test phone for the prompt.");
    if (MPESA_ENV === "sandbox") {
      info(
        "Note: sandbox callbacks only reach a public HTTPS URL — use a tunnel " +
          "(e.g. `ngrok http 3000`) and set MPESA_CALLBACK_URL if you want to " +
          "observe the callback."
      );
    }
  } else {
    bad(`STK push failed — ${data.errorMessage ?? JSON.stringify(data)}`);
    process.exit(1);
  }
} catch (err) {
  bad(`STK push request error: ${err.message}`);
  process.exit(1);
}
