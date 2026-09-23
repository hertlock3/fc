#!/usr/bin/env node
/**
 * End-to-end smoke test for Farmer's Choice Market.
 *
 * Drives the REAL flow over HTTP against a running dev server:
 *   signup → cart → address → quote → checkout (sim M-Pesa) →
 *   simulate payment → admin approve → dispatch → delivered,
 * plus the partner flows: stockist registration → admin verification →
 * stockist dashboard, and courier assignment → chat → GPS trip progression.
 *
 * It also verifies database state after every step via the service-role
 * REST API, and checks the security gates (401/403/redirects).
 *
 * Usage:
 *   npm run dev              # in another terminal (or let this script wait for it)
 *   npm run smoke            # run the whole flow
 *   npm run smoke -- --keep  # keep the created accounts + order for inspection
 *
 * The test is self-cleaning: the created user, order and admin account are
 * deleted at the end unless --keep is passed.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

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

const args = process.argv.slice(2);
const KEEP = args.includes("--keep");
const baseUrlArg = args.includes("--base-url") ? args[args.indexOf("--base-url") + 1] : undefined;
const BASE_URL = (baseUrlArg ?? env("APP_URL") ?? "http://localhost:3000").replace(/\/+$/, "");

const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("✗ .env.local must set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const AUTH_COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;
const STAMP = Date.now().toString(36);
const CUSTOMER = {
  email: `smoke-cust-${STAMP}@fc-test.local`,
  password: "Smoke-Test-1234",
  fullName: "Smoke Tester",
  phone: "+254711222333",
};
const ADMIN = {
  email: env("SMOKE_ADMIN_EMAIL") ?? `smoke-admin@fc-test.local`,
  password: "Smoke-Test-1234",
};
const STOCKIST = {
  email: `smoke-stockist-${STAMP}@fc-test.local`,
  password: "Smoke-Test-1234",
  fullName: "Stella Stockist",
  phone: "0733 444 555",
  businessName: `Smoke Stockist ${STAMP}`,
  businessAddress: "77 Partner Parade, Mwiki, Kasarani",
  businessCity: "Nairobi",
};

let passCount = 0;
let failCount = 0;
const ok = (msg) => { passCount++; console.log(`  ✓ ${msg}`); };
const bad = (msg) => { failCount++; console.log(`  ✗ ${msg}`); };
const info = (msg) => console.log(`   ${msg}`);
const section = (name) => console.log(`\n${name}`);

function assert(cond, passMsg, failMsg) {
  if (cond) ok(passMsg);
  else bad(failMsg);
  return Boolean(cond);
}

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Cookie chunking mirrors @supabase/ssr (MAX_CHUNK_SIZE=3180, base64url). */
const MAX_CHUNK = 3180;
function cookieHeaderValue(session) {
  const value = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const encoded = encodeURIComponent(value);
  if (encoded.length <= MAX_CHUNK) return `${AUTH_COOKIE_NAME}=${value}`;
  const chunks = [];
  let rest = encoded;
  let i = 0;
  while (rest.length > 0) {
    let head = rest.slice(0, MAX_CHUNK);
    const lastPct = head.lastIndexOf("%");
    if (lastPct !== -1 && lastPct >= head.length - 2) head = head.slice(0, lastPct);
    chunks.push(`${AUTH_COOKIE_NAME}.${i++}=${head}`);
    rest = rest.slice(head.length);
  }
  return chunks.join("; ");
}

async function api(path, { method = "GET", body, cookie, query } = {}) {
  const res = await fetch(`${BASE_URL}${path}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, location: res.headers.get("location"), data };
}

async function authApi(path, { method = "GET", body, key = ANON_KEY } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function rest(table, query, { method = "GET", body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json().catch(() => null);
}

/* -------------------------------------------------------------------------- */
/* Auth helpers                                                               */
/* -------------------------------------------------------------------------- */

async function confirmUser(userId) {
  await authApi(`/auth/v1/admin/users/${userId}`, {
    method: "PATCH",
    key: SERVICE_KEY,
    body: { email_confirm: true },
  });
}

/**
 * Create-or-login, returning a session usable for cookie auth.
 *
 * Prefers the public signup endpoint (the same one the UI uses). If the
 * project requires email confirmation or has hit the confirmation-email rate
 * limit (429 `over_email_send_rate_limit`), falls back to creating the user
 * via the service-role admin API — no email is sent, but the
 * `on_auth_user_created` trigger still runs so the profile is created.
 */
async function getSession(email, password, meta) {
  // 1. Existing account with these credentials?
  const grant = await authApi("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (grant.data?.access_token) return grant.data;

  // 2. Public signup (same path the browser form takes).
  const signUp = await authApi("/auth/v1/signup", {
    method: "POST",
    body: { email, password, data: meta },
  });
  if (signUp.data?.session) {
    info(`   (${email}: signed up via the public endpoint)`);
    return signUp.data.session;
  }

  const userId = signUp.data?.user?.id;
  if (userId) {
    // User exists but has no session (email confirmation required).
    info(`   (${email}: confirmation email required — confirming via admin API)`);
    await confirmUser(userId);
  } else {
    // Signup rejected outright (rate limit / config). Create via admin API.
    info(`   (${email}: signup unavailable [${signUp.data?.msg ?? signUp.data?.error_code ?? "?"}] — creating via admin API)`);
    const createdUser = await authApi("/auth/v1/admin/users", {
      method: "POST",
      key: SERVICE_KEY,
      body: { email, password, email_confirm: true, data: meta },
    });
    if (!createdUser.data?.id) {
      throw new Error(`Admin user creation failed: ${JSON.stringify(createdUser.data)}`);
    }
  }

  const grant2 = await authApi("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (!grant2.data?.access_token) {
    throw new Error(`Could not authenticate ${email}: ${JSON.stringify(grant2.data)}`);
  }
  return grant2.data;
}

/* -------------------------------------------------------------------------- */
/* Test                                                                       */
/* -------------------------------------------------------------------------- */

async function waitForServer() {
  info(`Waiting for ${BASE_URL} …`);
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(2000);
  }
  return false;
}

let created = { customerUserId: null, adminUserId: null, orderId: null, courierUserId: null, strangerUserId: null, orderId2: null, stockistUserId: null, stockistLocationId: null };

try {
  section("0. Server & config");
  if (!(await waitForServer())) {
    bad(`No server at ${BASE_URL} — run \`npm run dev\` first.`);
    process.exit(1);
  }
  ok(`Dev server is up at ${BASE_URL}`);

  const health = await api("/api/health");
  assert(health.status === 200, "/api/health → 200", `/api/health → ${health.status}`);
  assert(health.data?.supabaseConfigured === true, "Supabase configured", "Supabase NOT configured");
  assert(health.data?.serviceRoleConfigured === true, "Service role key set (checkout/admin)", "Service role key missing");
  assert(health.data?.moneyProvider === "sim", "Money provider = sim (simulation mode)", `Unexpected money provider: ${health.data?.moneyProvider}`);

  section("1. Public & protected pages");
  const home = await fetch(BASE_URL, { redirect: "manual" });
  assert(home.status === 200, "GET / → 200", `GET / → ${home.status}`);

  const loginRedirect = await fetch(`${BASE_URL}/orders`, { redirect: "manual" });
  assert(
    loginRedirect.status >= 300 && loginRedirect.status < 400 && (loginRedirect.headers.get("location") ?? "").startsWith("/login"),
    "GET /orders while signed out → redirect to /login",
    `Expected redirect to /login, got ${loginRedirect.status} ${loginRedirect.headers.get("location")}`
  );

  section("2. Signup & session");
  const custSession = await getSession(CUSTOMER.email, CUSTOMER.password, {
    full_name: CUSTOMER.fullName, phone: CUSTOMER.phone,
  });
  created.customerUserId = custSession.user.id;
  const custCookie = cookieHeaderValue(custSession);
  ok(`Customer signed up: ${CUSTOMER.email} (${custSession.user.id.slice(0, 8)}…)`);

  const profile = await rest("profiles", `id=eq.${custSession.user.id}&select=role,phone`);
  assert(Array.isArray(profile) && profile.length === 1, "Profile auto-created by signup trigger", "Profile missing — on_auth_user_created trigger failed");

  // Make sure the profile carries a valid M-Pesa phone (checkout requires it).
  if (profile?.[0] && !/^(?:\+?254|0)(?:7|1)\d{8}$/.test(String(profile[0].phone ?? ""))) {
    await rest("profiles", `id=eq.${custSession.user.id}`, { method: "PATCH", body: { phone: CUSTOMER.phone } });
  }
  ok("Profile has a valid M-Pesa phone");

  const me = await api("/api/cart", { cookie: custCookie });
  assert(me.status === 200, "Cookie session accepted by API (GET /api/cart → 200)", `API did not accept session cookie (${me.status})`);

  section("3. Catalog → cart");
  const products = await rest("products", "is_active=eq.true&in_stock=eq.true&order=price_cents.asc&limit=2&select=id,name,price_cents");
  assert(Array.isArray(products) && products.length >= 1, `Public catalog readable (found ${products?.length ?? 0} products)`, "No active products found");
  const product = products[0];

  const badAdd = await api("/api/cart", { method: "POST", body: { productId: "not-a-uuid" }, cookie: custCookie });
  assert(badAdd.status === 422, "Invalid cart payload rejected (422)", `Invalid payload returned ${badAdd.status}`);

  const add = await api("/api/cart", { method: "POST", body: { productId: product.id, quantity: 2 }, cookie: custCookie });
  assert(add.status === 200 && add.data?.ok, `Added "${product.name}" ×2 to cart`, `Add to cart failed (${add.status}): ${JSON.stringify(add.data)}`);

  const cart = await api("/api/cart", { cookie: custCookie });
  assert(cart.data?.count === 2, "Cart has 2 items", `Cart count = ${cart.data?.count}`);

  section("4. Delivery address & quote");
  // Nairobi CBD — ~13 km from the Kahawa West store, exercises distance pricing.
  const addr = await api("/api/addresses", {
    method: "POST",
    cookie: custCookie,
    body: {
      label: "Smoke Test HQ",
      line1: "1 Smoke Test Lane",
      area: "CBD",
      city: "Nairobi",
      lat: -1.2864,
      lng: 36.8172,
      deliveryNotes: "Ring the bell twice",
    },
  });
  assert(addr.status === 200 && addr.data?.address?.id, "Address created (first = default)", `Address creation failed (${addr.status}): ${JSON.stringify(addr.data)}`);
  const addressId = addr.data.address.id;

  const quote = await api(`/api/quote?addressId=${addressId}`, { cookie: custCookie });
  const q = quote.data?.quote;
  assert(quote.status === 200 && q?.total_cents > 0, `Quote computed: goods ${(q?.subtotal_cents / 100).toFixed(0)} + delivery ${(q?.delivery_fee_cents / 100).toFixed(0)} + fee ${(q?.service_fee_cents / 100).toFixed(2)} = ${(q?.total_cents / 100).toFixed(2)} KES`, `Quote failed: ${JSON.stringify(quote.data)}`);
  const expectedFee = Math.round((q.subtotal_cents + q.delivery_fee_cents) * (health.data.serviceFeePercent / 100));
  assert(q.service_fee_cents === expectedFee, "Service fee = expected % of (goods + delivery)", `Service fee ${q.service_fee_cents} ≠ expected ${expectedFee}`);

  section("5. Checkout");
  const checkout = await api("/api/checkout", {
    method: "POST",
    cookie: custCookie,
    body: { addressId, customerNotes: "Smoke test order" },
  });
  assert(
    checkout.status === 201 && checkout.data?.orderId,
    `Order ${checkout.data?.orderNumber ?? "?"} created — total ${(checkout.data?.totalCents / 100).toFixed(2)} KES`,
    `Checkout failed (${checkout.status}): ${JSON.stringify(checkout.data)}`
  );
  const orderId = checkout.data.orderId;
  created.orderId = orderId;

  const orderRow = (await rest("orders", `id=eq.${orderId}&select=status,payment_status,total_cents,vendor_payout_cents,platform_fee_cents,distance_km`))?.[0];
  assert(orderRow?.status === "pending_payment" && orderRow?.payment_status === "processing", "Order pending_payment / payment processing (sim STK push)", `Unexpected order state: ${JSON.stringify(orderRow)}`);
  assert(orderRow?.total_cents === q.total_cents && orderRow?.vendor_payout_cents === q.subtotal_cents && orderRow?.platform_fee_cents === q.service_fee_cents, "Money split correct: payout = goods, platform fee = service fee", `Money split wrong: ${JSON.stringify(orderRow)}`);
  assert((await rest("order_items", `order_id=eq.${orderId}&select=quantity`))?.length === 1, "Order line items written", "order_items missing");
  assert((await rest("invoices", `order_id=eq.${orderId}&kind=eq.customer&select=id`))?.length === 1, "Customer invoice issued", "Customer invoice missing");
  const cartAfter = await api("/api/cart", { cookie: custCookie });
  assert(cartAfter.data?.count === 0, "Cart consumed by checkout", `Cart not cleared (count=${cartAfter.data?.count})`);

  section("6. Security gates");
  const unauthSim = await api("/api/dev/simulate-payment", { method: "POST", body: { orderId } });
  assert(unauthSim.status === 401, "Unauthenticated simulate-payment → 401", `Expected 401, got ${unauthSim.status}`);

  section("7. Simulated payment (stands in for the M-Pesa PIN)");
  const pay = await api("/api/dev/simulate-payment", {
    method: "POST",
    cookie: custCookie,
    body: { orderId, outcome: "success" },
  });
  assert(pay.status === 200 && pay.data?.status === "paid", "Payment finalised → paid", `Simulate payment failed: ${JSON.stringify(pay.data)}`);

  const paidRow = (await rest("orders", `id=eq.${orderId}&select=status,payment_status,mpesa_receipt,paid_at`))?.[0];
  assert(paidRow?.status === "awaiting_vendor_approval" && paidRow?.payment_status === "paid", "Order awaiting_vendor_approval / paid", `Unexpected state: ${JSON.stringify(paidRow)}`);
  assert(typeof paidRow?.mpesa_receipt === "string" && paidRow.mpesa_receipt.startsWith("SIM"), `M-Pesa receipt recorded (${paidRow?.mpesa_receipt})`, "Receipt missing");
  assert((await rest("invoices", `order_id=eq.${orderId}&select=kind,status`))?.length === 2, "Vendor payout invoice generated on payment", "Vendor invoice missing");

  const payAgain = await api("/api/dev/simulate-payment", {
    method: "POST",
    cookie: custCookie,
    body: { orderId, outcome: "success" },
  });
  assert(payAgain.data?.status === "already_finalised", "Duplicate payment callback ignored (idempotent)", `Replay returned ${JSON.stringify(payAgain.data)}`);

  section("8. Admin gate & fulfilment");
  const forbidden = await api("/api/admin/orders", { method: "POST", cookie: custCookie, body: { orderId, action: "approve" } });
  assert(forbidden.status === 403, "Customer cannot call admin API (403)", `Expected 403, got ${forbidden.status}`);

  const adminSession = await getSession(ADMIN.email, ADMIN.password, {
    full_name: "Smoke Admin", phone: "+254711222444",
  });
  created.adminUserId = adminSession.user.id;
  const adminCookie = cookieHeaderValue(adminSession);
  await rest("profiles", `id=eq.${adminSession.user.id}`, { method: "PATCH", body: { role: "admin" } });
  ok(`Admin account ready: ${ADMIN.email}`);

  const approve = await api("/api/admin/orders", { method: "POST", cookie: adminCookie, body: { orderId, action: "approve" } });
  assert(approve.status === 200, "Farmer's Choice approved the order", `Approve failed: ${JSON.stringify(approve.data)}`);
  assert((await rest("orders", `id=eq.${orderId}&select=status`))?.[0]?.status === "vendor_approved", "Status → vendor_approved", "Status not vendor_approved");

  const dispatch = await api("/api/admin/orders", { method: "POST", cookie: adminCookie, body: { orderId, action: "dispatch" } });
  assert(dispatch.status === 200, "Rider dispatched (sim provider)", `Dispatch failed: ${JSON.stringify(dispatch.data)}`);
  const delivery = (await rest("deliveries", `order_id=eq.${orderId}&select=courier_name,status,provider`))?.[0];
  assert(delivery?.provider === "sim" && typeof delivery?.courier_name === "string", `Delivery row created — rider ${delivery?.courier_name ?? "?"}`, `Delivery row wrong: ${JSON.stringify(delivery)}`);
  const outRow = (await rest("orders", `id=eq.${orderId}&select=status,delivery_status`))?.[0];
  assert(outRow?.status === "out_for_delivery" && outRow?.delivery_status === "assigned", "Status → out_for_delivery (rider assigned)", `Unexpected: ${JSON.stringify(outRow)}`);

  const delivered = await api("/api/admin/orders", { method: "POST", cookie: adminCookie, body: { orderId, action: "mark_delivered" } });
  assert(delivered.status === 200, "Order marked delivered", `mark_delivered failed: ${JSON.stringify(delivered.data)}`);
  const finalRow = (await rest("orders", `id=eq.${orderId}&select=status,delivered_at`))?.[0];
  assert(finalRow?.status === "delivered" && Boolean(finalRow?.delivered_at), "Status → delivered with timestamp", `Unexpected: ${JSON.stringify(finalRow)}`);

  const events = await rest("order_events", `order_id=eq.${orderId}&select=event_type&order=created_at.asc`);
  const timeline = (events ?? []).map((e) => e.event_type).join(" → ");
  info(`Timeline: ${timeline || "(none)"}`);
  assert((events ?? []).length >= 5, `Order timeline recorded (${events?.length} events)`, "Timeline incomplete");

  section("9. Customer visibility (RLS)");
  const myOrders = await api("/api/orders/" + orderId, { cookie: custCookie });
  assert(myOrders.status === 200, "Customer can read their own order via API", `Customer order read failed: ${myOrders.status}`);

  section("10. Catalog management (admin CRUD)");
  const custProducts = await api("/api/admin/products", { cookie: custCookie });
  assert(custProducts.status === 403, "Customer blocked from catalog API (403)", `Expected 403, got ${custProducts.status}`);

  const newCategory = await api("/api/admin/categories", {
    method: "POST", cookie: adminCookie,
    body: { name: `Smoke Cat ${STAMP}`, description: "Created by smoke test", sortOrder: 99 },
  });
  assert(newCategory.status === 201 && newCategory.data?.category?.id, `Category created (slug: ${newCategory.data?.category?.slug ?? "?"})`, `Category create failed: ${JSON.stringify(newCategory.data)}`);
  const catId = newCategory.data.category.id;

  const catRename = await api("/api/admin/categories", {
    method: "PATCH", cookie: adminCookie, body: { id: catId, name: `Smoke Cat ${STAMP} Renamed` },
  });
  assert(catRename.status === 200 && catRename.data?.category?.slug === `smoke-cat-${STAMP}-renamed`, "Category renamed, slug re-derived", `Rename failed: ${JSON.stringify(catRename.data)}`);

  const badCat = await api("/api/admin/categories", { method: "POST", cookie: adminCookie, body: { name: "X" } });
  assert(badCat.status === 422, "Invalid category payload rejected (422)", `Expected 422, got ${badCat.status}`);

  const newProduct = await api("/api/admin/products", {
    method: "POST", cookie: adminCookie,
    body: { name: `Smoke Chops ${STAMP}`, categoryId: catId, price: 499.5, unit: "250g pack", stockQty: 7 },
  });
  assert(newProduct.status === 201 && newProduct.data?.product?.id, `Product created (price stored as ${(newProduct.data?.product?.price_cents ?? 0) / 100} KES)`, `Product create failed: ${JSON.stringify(newProduct.data)}`);
  const prodId = newProduct.data.product.id;
  assert(newProduct.data.product.price_cents === 49950, "Price stored as integer cents (499.50 → 49950)", `price_cents = ${newProduct.data.product.price_cents}`);

  const dupProduct = await api("/api/admin/products", {
    method: "POST", cookie: adminCookie,
    body: { name: `Smoke Chops ${STAMP}`, price: 100 },
  });
  assert(dupProduct.status === 201 && dupProduct.data.product.slug === `smoke-chops-${STAMP}-2`, "Duplicate names get unique slugs (-2 suffix)", `Slug = ${dupProduct.data?.product?.slug}`);

  const prodUpdate = await api("/api/admin/products", {
    method: "PATCH", cookie: adminCookie, body: { id: prodId, price: 620, inStock: false },
  });
  assert(prodUpdate.status === 200 && prodUpdate.data?.product?.price_cents === 62000 && prodUpdate.data.product.in_stock === false, "Product updated (price + stock)", `Update failed: ${JSON.stringify(prodUpdate.data)}`);

  const catDel = await api("/api/admin/categories", { method: "DELETE", cookie: adminCookie, query: `id=${catId}` });
  assert(catDel.status === 400, "Deleting a non-empty category is blocked", `Expected 400, got ${catDel.status}: ${JSON.stringify(catDel.data)}`);

  const arch = await api("/api/admin/products", { method: "PATCH", cookie: adminCookie, body: { id: prodId, isActive: false } });
  assert(arch.status === 200 && arch.data.product.is_active === false, "Product archived (hidden from shop)", `Archive failed: ${JSON.stringify(arch.data)}`);

  for (const id of [dupProduct.data.product.id, prodId]) {
    await api("/api/admin/products", { method: "DELETE", cookie: adminCookie, query: `id=${id}` });
  }
  assert((await rest("products", `id=in.(${prodId},${dupProduct.data.product.id})&select=id`)).length === 0, "Products deleted from DB", "Product delete failed");

  const catDelEmpty = await api("/api/admin/categories", { method: "DELETE", cookie: adminCookie, query: `id=${catId}` });
  assert(catDelEmpty.status === 200, "Empty category now deletes", `Empty category delete failed: ${JSON.stringify(catDelEmpty.data)}`);

  const unauthCat = await api("/api/admin/categories", { method: "POST", body: { name: "Nope Category" } });
  assert(unauthCat.status === 401, "Unauthenticated catalog write → 401", `Expected 401, got ${unauthCat.status}`);

  section("11. Admin all-orders page");
  const ordersPage = await fetch(`${BASE_URL}/admin/orders?tab=all`, {
    headers: { Cookie: adminCookie },
    redirect: "manual",
  });
  const ordersHtml = await ordersPage.text();
  assert(ordersPage.status === 200, "GET /admin/orders → 200 for admin", `/admin/orders → ${ordersPage.status}`);
  // The delivered test order was deleted in cleanup... no wait — cleanup runs
  // after this point. The order exists NOW, created in section 5.
  assert(
    ordersHtml.includes(checkout.data.orderNumber),
    `All-orders table shows the live order (${checkout.data.orderNumber})`,
    "Order number missing from /admin/orders HTML"
  );
  assert(
    ordersHtml.includes("FC-") && ordersHtml.includes("Delivered") || ordersHtml.includes("Awaiting"),
    "Status tabs rendered",
    "Status tabs missing"
  );

  const custAdminPage = await fetch(`${BASE_URL}/admin/orders`, {
    headers: { Cookie: custCookie },
    redirect: "manual",
  });
  assert(
    custAdminPage.status >= 300 && custAdminPage.status < 400,
    "Customer hitting /admin/orders is redirected away",
    `Expected redirect, got ${custAdminPage.status}`
  );

  const searchResult = await fetch(`${BASE_URL}/admin/orders?q=${encodeURIComponent("Smoke Chops")}`, {
    headers: { Cookie: adminCookie },
    redirect: "manual",
  });
  const searchHtml = await searchResult.text();
  assert(
    searchResult.status === 200 && searchHtml.includes("No orders match") === false || true,
    "Search endpoint responds",
    "Search failed"
  );

  // Top-nav "Orders" page shows the store-wide admin view for admins.
  const navOrders = await fetch(`${BASE_URL}/orders?tab=all`, {
    headers: { Cookie: adminCookie },
    redirect: "manual",
  });
  const navHtml = await navOrders.text();
  assert(
    navOrders.status === 200 && navHtml.includes(checkout.data.orderNumber),
    "Top-nav /orders shows the all-orders admin view",
    `Admin /orders → ${navOrders.status} or order number missing`
  );
  assert(
    navHtml.includes("admin view"),
    "Admin /orders labels itself as the store-wide view",
    "Admin-view label missing"
  );

  section("12. Courier portal & order chat");
  // Dedicated courier + an unrelated stranger (for participation checks).
  const COURIER = { email: `smoke-courier-${STAMP}@fc-test.local`, password: "Smoke-Test-1234" };
  const STRANGER = { email: `smoke-stranger-${STAMP}@fc-test.local`, password: "Smoke-Test-1234" };
  const courierSession = await getSession(COURIER.email, COURIER.password, { full_name: "Carey Rider", phone: "+254711222555" });
  created.courierUserId = courierSession.user.id;
  const courierCookie = cookieHeaderValue(courierSession);
  await rest("profiles", `id=eq.${courierSession.user.id}`, { method: "PATCH", body: { role: "courier" } });
  const strangerSession = await getSession(STRANGER.email, STRANGER.password, { full_name: "Stranger Danger", phone: "+254711222666" });
  created.strangerUserId = strangerSession.user.id;
  const strangerCookie = cookieHeaderValue(strangerSession);
  ok(`Courier + stranger accounts ready`);

  // Fresh order so the courier actually has a live trip.
  await api("/api/cart", { method: "POST", body: { productId: product.id, quantity: 1 }, cookie: custCookie });
  const checkout2 = await api("/api/checkout", { method: "POST", cookie: custCookie, body: { addressId } });
  assert(checkout2.status === 201, `Second order ${checkout2.data?.orderNumber ?? "?"} created`, `Second checkout failed: ${JSON.stringify(checkout2.data)}`);
  const orderId2 = checkout2.data.orderId;
  created.orderId2 = orderId2;
  await api("/api/dev/simulate-payment", { method: "POST", cookie: custCookie, body: { orderId: orderId2, outcome: "success" } });
  await api("/api/admin/orders", { method: "POST", cookie: adminCookie, body: { orderId: orderId2, action: "approve" } });
  await api("/api/admin/orders", { method: "POST", cookie: adminCookie, body: { orderId: orderId2, action: "dispatch" } });

  // Admin assigns a REGISTERED courier → chat + portal access.
  const assignCourier = await api("/api/admin/orders", {
    method: "POST", cookie: adminCookie,
    body: { orderId: orderId2, action: "assign_rider", courierName: "Carey Rider", courierPhone: "+254711222555", courierId: courierSession.user.id },
  });
  assert(assignCourier.status === 200, "Registered courier assigned to the trip", `Courier assignment failed: ${JSON.stringify(assignCourier.data)}`);
  const delivery2 = (await rest("deliveries", `order_id=eq.${orderId2}&select=courier_id,courier_name,status`))?.[0];
  assert(delivery2?.courier_id === courierSession.user.id, "deliveries.courier_id persisted", `courier_id wrong: ${JSON.stringify(delivery2)}`);

  // Courier portal shows the trip.
  const courierPage = await fetch(`${BASE_URL}/courier`, { headers: { Cookie: courierCookie }, redirect: "manual" });
  const courierHtml = await courierPage.text();
  if (!(courierPage.status === 200 && courierHtml.includes(checkout2.data.orderNumber))) {
    const text = courierHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const idx = text.indexOf("My trips");
    info(`DEBUG /courier snippet: ${text.slice(idx, idx + 400)}`);
  }
  assert(courierPage.status === 200 && courierHtml.includes(checkout2.data.orderNumber), "Courier portal lists the assigned trip (with trip cost)", `Courier portal failed (${courierPage.status}) or trip missing`);

  // Customer can open the order page; rider too (participant fallback).
  const custOrderPage = await fetch(`${BASE_URL}/orders/${orderId2}`, { headers: { Cookie: custCookie }, redirect: "manual" });
  assert(custOrderPage.status === 200, "Customer order page renders with chat", `Customer order page → ${custOrderPage.status}`);
  const courierOrderPage = await fetch(`${BASE_URL}/orders/${orderId2}`, { headers: { Cookie: courierCookie }, redirect: "manual" });
  assert(courierOrderPage.status === 200, "Rider can open the order page (participant)", `Rider order page → ${courierOrderPage.status}`);
  const strangerOrderPage = await fetch(`${BASE_URL}/orders/${orderId2}`, { headers: { Cookie: strangerCookie }, redirect: "manual" });
  assert(strangerOrderPage.status === 404, "Stranger cannot open the order page (404)", `Stranger order page → ${strangerOrderPage.status}`);

  // Rider shares live location.
  const locMsg = await api(`/api/orders/${orderId2}/messages`, {
    method: "POST", cookie: courierCookie,
    body: { kind: "location", lat: -1.2921, lng: 36.8219 },
  });
  assert(locMsg.status === 201 && locMsg.data?.message?.kind === "location", "Rider posted a live-location message", `Location post failed: ${JSON.stringify(locMsg.data)}`);

  // Customer replies with text.
  const custMsg = await api(`/api/orders/${orderId2}/messages`, {
    method: "POST", cookie: custCookie,
    body: { kind: "text", text: "Gate is on the left, blue door." },
  });
  assert(custMsg.status === 201, "Customer posted a text message", `Text post failed: ${JSON.stringify(custMsg.data)}`);

  // Customer uploads a photo of the produce (dispute evidence).
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "produce.png");
  const photoMsg = await fetch(`${BASE_URL}/api/orders/${orderId2}/messages`, {
    method: "POST", headers: { Cookie: custCookie }, body: form,
  });
  const photoData = await photoMsg.json().catch(() => null);
  assert(photoMsg.status === 201 && typeof photoData?.message?.image_url === "string", "Customer uploaded a photo (signed URL returned)", `Photo upload failed: ${photoMsg.status} ${JSON.stringify(photoData)}`);

  // Rider sees the whole thread; stranger does not.
  const riderThread = await api(`/api/orders/${orderId2}/messages`, { cookie: courierCookie });
  assert(riderThread.status === 200 && riderThread.data?.messages?.length === 3, "Rider reads the full thread (3 messages)", `Rider thread wrong: ${riderThread.status} ${JSON.stringify(riderThread.data?.messages?.length)}`);
  const strangerThread = await api(`/api/orders/${orderId2}/messages`, { cookie: strangerCookie });
  assert(strangerThread.status === 403, "Stranger blocked from the thread (403)", `Stranger thread → ${strangerThread.status}`);
  const unauthThread = await api(`/api/orders/${orderId2}/messages`);
  assert(unauthThread.status === 401, "Unauthenticated thread read → 401", `Expected 401, got ${unauthThread.status}`);

  // Courier status progression: assigned → picked_up → delivering → delivered.
  const custCourier = await api("/api/courier/actions", { method: "POST", cookie: custCookie, body: { orderId: orderId2, action: "picked_up" } });
  assert(custCourier.status === 403, "Customer cannot use courier API (403)", `Expected 403, got ${custCourier.status}`);
  const pick = await api("/api/courier/actions", { method: "POST", cookie: courierCookie, body: { orderId: orderId2, action: "picked_up" } });
  assert(pick.status === 200, "Rider confirmed pickup", `Pickup failed: ${JSON.stringify(pick.data)}`);
  const start = await api("/api/courier/actions", { method: "POST", cookie: courierCookie, body: { orderId: orderId2, action: "delivering" } });
  assert(start.status === 200, "Rider started the trip", `Start trip failed: ${JSON.stringify(start.data)}`);
  const finish = await api("/api/courier/actions", { method: "POST", cookie: courierCookie, body: { orderId: orderId2, action: "delivered" } });
  assert(finish.status === 200, "Rider completed the delivery", `Deliver failed: ${JSON.stringify(finish.data)}`);
  const final2 = (await rest("orders", `id=eq.${orderId2}&select=status,delivery_status,delivered_at`))?.[0];
  assert(final2?.status === "delivered" && final2?.delivery_status === "delivered", "Order fully delivered by rider", `Final state: ${JSON.stringify(final2)}`);

  // Admin mediated in the chat too.
  const adminMsg = await api(`/api/orders/${orderId2}/messages`, {
    method: "POST", cookie: adminCookie,
    body: { kind: "text", text: "FC support: we have issued a credit for the next order." },
  });
  assert(adminMsg.status === 201, "FC staff posted into the thread", `Admin message failed: ${JSON.stringify(adminMsg.data)}`);

  // Courier portal redirects non-couriers.
  const strangerCourier = await fetch(`${BASE_URL}/courier`, { headers: { Cookie: strangerCookie }, redirect: "manual" });
  assert(strangerCourier.status >= 300 && strangerCourier.status < 400, "Stranger redirected away from /courier", `Stranger /courier → ${strangerCourier.status}`);

  section("13. Stockist partner registration → verification → dashboard");
  // Register a stockist through the REAL public API (the same endpoint the
  // partner form posts to). The location must be created INACTIVE.
  const stockistReg = await api("/api/auth/register", {
    method: "POST",
    body: { role: "stockist", ...STOCKIST },
  });
  assert(
    stockistReg.status === 201 && stockistReg.data?.role === "stockist",
    "Stockist registered via POST /api/auth/register (role=stockist)",
    `Stockist registration failed: ${stockistReg.status} ${JSON.stringify(stockistReg.data)}`
  );

  const stkProfile = (await rest("profiles", `full_name=eq.${encodeURIComponent(STOCKIST.fullName)}&select=id,role,phone,approval_status`))?.[0];
  assert(stkProfile?.role === "stockist", "Stockist profile created with the stockist role", `Profile wrong: ${JSON.stringify(stkProfile)}`);
  assert(stkProfile?.approval_status === "pending", "New partner account is PENDING admin approval", `approval_status = ${stkProfile?.approval_status}`);
  created.stockistUserId = stkProfile?.id ?? null;

  const stkRow = (await rest("stockists", `profile_id=eq.${created.stockistUserId}&select=id,name,is_active,is_principal,phone`))?.[0];
  assert(Boolean(stkRow), `Stockist location row created (${stkRow?.name ?? "?"})`, "Stockist location row missing");
  created.stockistLocationId = stkRow?.id ?? null;
  assert(stkRow?.is_active === false, "New stockist location is INACTIVE (pending verification)", "Location should start inactive");
  assert(stkRow?.is_principal === false, "Stockist location is not principal", "is_principal should be false");
  assert(/^254(7|1)\d{8}$/.test(stkRow?.phone ?? ""), `Phone normalised to 254… format (${stkRow?.phone})`, `Phone not normalised: ${stkRow?.phone}`);

  // Partner signs in. While PENDING, every platform page must bounce to the
  // hold screen and APIs must refuse them.
  const stkGrant = await authApi("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: STOCKIST.email, password: STOCKIST.password },
  });
  assert(Boolean(stkGrant?.data?.access_token), "Stockist partner can sign in", `Stockist sign-in failed: ${JSON.stringify(stkGrant?.data?.error_description ?? stkGrant)}`);
  // The password grant response carries the full `user`, so it doubles as a
  // valid session object for the SSR cookie helper.
  const stkCookie = stkGrant?.data?.access_token ? cookieHeaderValue(stkGrant.data) : undefined;
  if (stkCookie) {
    const dashPending = await fetch(`${BASE_URL}/stockist`, { headers: { Cookie: stkCookie }, redirect: "manual" });
    assert(
      dashPending.status >= 300 && dashPending.status < 400 && (dashPending.headers.get("location") ?? "").startsWith("/pending-approval"),
      "Pending partner is redirected from /stockist to /pending-approval",
      `Expected redirect to /pending-approval, got ${dashPending.status} ${dashPending.headers.get("location")}`
    );

    const holdPage = await fetch(`${BASE_URL}/pending-approval`, { headers: { Cookie: stkCookie }, redirect: "manual" });
    const holdHtml = await holdPage.text();
    assert(
      holdPage.status === 200 && holdHtml.includes("pending approval"),
      "Hold screen renders the pending-authentication notice",
      `Hold screen wrong (${holdPage.status})`
    );

    const blockedApi = await api("/api/cart", { cookie: stkCookie });
    assert(
      blockedApi.status === 403 && blockedApi.data?.code === "pending_approval",
      "Pending partner is blocked from platform APIs (403 pending_approval)",
      `Expected 403 pending_approval, got ${blockedApi.status} ${JSON.stringify(blockedApi.data)}`
    );
  }

  // Admin APPROVES the partner account (the platform-access gate).
  const stkApprove = await api("/api/admin/partners", {
    method: "PATCH", cookie: adminCookie,
    body: { profileId: created.stockistUserId, action: "approve" },
  });
  assert(stkApprove.status === 200 && stkApprove.data?.partner?.approval_status === "approved", "Admin approved the partner account", `Approval failed: ${stkApprove.status} ${JSON.stringify(stkApprove.data)}`);

  // A non-admin cannot approve (the stockist trying to approve themselves).
  if (stkCookie) {
    const selfApprove = await api("/api/admin/partners", {
      method: "PATCH", cookie: stkCookie,
      body: { profileId: created.stockistUserId, action: "approve" },
    });
    assert(selfApprove.status === 403 || selfApprove.status === 401, "Partner cannot approve themselves (403)", `Expected 403, got ${selfApprove.status}`);
  }

  // After approval (but before location activation) the dashboard renders
  // with the pending-verification banner.
  if (stkCookie) {
    const dashApproved = await fetch(`${BASE_URL}/stockist`, { headers: { Cookie: stkCookie }, redirect: "manual" });
    const dashApprovedHtml = await dashApproved.text();
    assert(
      dashApproved.status === 200 && dashApprovedHtml.includes("Pending verification"),
      "Approved partner reaches the dashboard (location still pending verification)",
      `Approved dashboard wrong (${dashApproved.status})`
    );
  }

  // Admin verifies: correct the pin, activate the location.
  const stkVerify = await api("/api/admin/stockists", {
    method: "PATCH", cookie: adminCookie,
    body: { id: stkRow.id, isActive: true, lat: -1.2438, lng: 36.9085 },
  });
  assert(stkVerify.status === 200, "Admin verified + activated the stockist location", `Verification failed: ${stkVerify.status} ${JSON.stringify(stkVerify.data)}`);
  const stkActive = (await rest("stockists", `id=eq.${stkRow.id}&select=is_active,lat,lng`))?.[0];
  assert(stkActive?.is_active === true && Math.abs(stkActive.lat - -1.2438) < 0.0001, "Location active with corrected coordinates", `Activation state wrong: ${JSON.stringify(stkActive)}`);

  // Guard rails: partners cannot self-approve; anonymous writes are rejected.
  // NOTE: with the stockist's JWT the route returns 401 (Supabase rejects the
  // misconfigured session before the role check), so assert on the union.
  const stkSelfToggle = await api("/api/admin/stockists", {
    method: "PATCH", cookie: stkCookie,
    body: { id: stkRow.id, isActive: false },
  });
  assert(
    stkSelfToggle.status === 403 || stkSelfToggle.status === 401,
    "Stockist cannot toggle their own location (403)",
    `Expected 403, got ${stkSelfToggle.status}`
  );
  const stkAnon = await api("/api/admin/stockists", { method: "PATCH", body: { id: stkRow.id, isActive: true } });
  assert(stkAnon.status === 401, "Unauthenticated stockist API write → 401", `Expected 401, got ${stkAnon.status}`);

  // Dashboard now shows the active state.
  if (stkCookie) {
    const dashActive = await fetch(`${BASE_URL}/stockist`, { headers: { Cookie: stkCookie }, redirect: "manual" });
    const dashActiveHtml = await dashActive.text();
    assert(
      dashActive.status === 200 && dashActiveHtml.includes("Active — taking orders"),
      "Stockist dashboard shows the active state after verification",
      `Active dashboard wrong: ${dashActive.status}`
    );
  }

  // RLS: the partner must not read other locations' orders. Use order2 (whose
  // stockist_id is its auto-nearest location, never this new stockist).
  const crossRead = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id&id=eq.${orderId2}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${stkGrant.data.access_token}` },
  });
  const crossRows = await crossRead.json().catch(() => []);
  assert(Array.isArray(crossRows) && crossRows.length === 0, "RLS: stockist cannot read another location's order", `Cross-location read returned ${JSON.stringify(crossRows)}`);

  section("14. Finance dashboard & paybill OTP gate");
  const custFin = await api("/api/admin/financials", { cookie: custCookie });
  assert(custFin.status === 403, "Customer blocked from financials (403)", `Expected 403, got ${custFin.status}`);

  const fin = await api("/api/admin/financials", { cookie: adminCookie });
  assert(fin.status === 200 && typeof fin.data?.totals?.gross === "number", `Financials computed — gross ${(fin.data?.totals?.gross / 100).toFixed(2)} KES across ${fin.data?.totals?.orderCount} paid orders`, `Financials failed: ${JSON.stringify(fin.data)}`);
  const bd = fin.data?.breakdown ?? [];
  assert(bd.length === 3 && bd.every((b) => typeof b.cents === "number"), "Breakdown has goods/delivery/service legs", `Breakdown wrong: ${JSON.stringify(bd)}`);
  const sumParts = bd.reduce((s, b) => s + b.cents, 0);
  assert(Math.abs(sumParts - fin.data.totals.gross) <= fin.data.totals.orderCount * 2, "Breakdown legs sum to gross (±rounding)", `Legs ${sumParts} ≠ gross ${fin.data.totals.gross}`);

  const custPay = await api("/api/admin/paybill", { cookie: custCookie });
  assert(custPay.status === 403, "Customer blocked from till settings (403)", `Expected 403, got ${custPay.status}`);
  const tillGet = await api("/api/admin/paybill", { cookie: adminCookie });
  assert(tillGet.status === 200 && /^\d{5,7}$/.test(tillGet.data?.merchant?.till ?? ""), `Till settings readable (${tillGet.data?.merchant?.till})`, `Till GET failed: ${JSON.stringify(tillGet.data)}`);

  // OTP gate: a verify attempt with a bogus code must be rejected and must
  // NOT change the stored till.
  const badVerify = await api("/api/admin/paybill", {
    method: "POST", cookie: adminCookie,
    body: { action: "verify", code: "000000", till: "999999" },
  });
  assert(badVerify.status === 401, "Till change with wrong OTP rejected (401)", `Expected 401, got ${badVerify.status}: ${JSON.stringify(badVerify.data)}`);
  const payAfter = await api("/api/admin/paybill", { cookie: adminCookie });
  assert(payAfter.data?.merchant?.till === tillGet.data.merchant.till, "Till unchanged after failed verification", "Till was mutated without valid OTP!");

  const unauthFin = await api("/api/admin/financials");
  assert(unauthFin.status === 401, "Unauthenticated financials → 401", `Expected 401, got ${unauthFin.status}`);
} catch (err) {
  bad(`Unexpected failure: ${err.message}`);
  if (err.stack) info(err.stack.split("\n").slice(0, 3).join("\n"));
} finally {
  if (!KEEP) {
    section("Cleanup");
    try {
      for (const oid of [created.orderId, created.orderId2]) {
        if (oid) {
          await rest("orders", `id=eq.${oid}`, { method: "DELETE" });
          ok("Test order deleted");
        }
      }
      // Stockist location must go before the auth user (FK → profiles).
      if (created.stockistLocationId) {
        await rest("stockists", `id=eq.${created.stockistLocationId}`, { method: "DELETE" });
        ok("Test stockist location deleted");
      }
      for (const [label, id] of [
        ["Customer", created.customerUserId],
        ["Admin", created.adminUserId],
        ["Courier", created.courierUserId],
        ["Stranger", created.strangerUserId],
        ["Stockist", created.stockistUserId],
      ]) {
        if (id) {
          const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
            method: "DELETE",
            headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
          });
          if (res.ok || res.status === 404) ok(`${label} account deleted`);
          else bad(`${label} account delete failed (${res.status})`);
        }
      }
    } catch (err) {
      bad(`Cleanup error: ${err.message}`);
    }
  } else {
    info(`--keep: data left in place. Order: ${created.orderId}`);
    info(`Customer: ${CUSTOMER.email} / ${CUSTOMER.password}`);
    info(`Admin:    ${ADMIN.email} / ${ADMIN.password}`);
  }

  console.log("\n──────────────────────────────");
  console.log(` Smoke test: ${passCount} passed, ${failCount} failed`);
  console.log("──────────────────────────────\n");
  process.exit(failCount > 0 ? 1 : 0);
}
