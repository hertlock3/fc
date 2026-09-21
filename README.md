# Farmer's Choice Market 🥩🥬

A food-commerce app for ordering genuine **Farmer's Choice** meat and groceries
with **M-Pesa** checkout and **rider delivery** across Nairobi.

Built with **Next.js (App Router) + TypeScript + Tailwind v4 + Supabase**.

---

## The money & fulfilment flow

```
Customer browses shop
   │
   ▼
Adds items to cart ──► Checkout picks a delivery address
   │                        │
   │                        ▼
   │            Distance-based delivery fee (store → customer)
   │                        │
   ▼                        ▼
Invoice = goods + delivery + 5% platform service fee
   │
   ▼
M-Pesa STK Push (Lipa na M-Pesa) ──► customer enters PIN
   │
   ▼
Payment confirmed (webhook) ──► order marked PAID
   │      • platform keeps the 5% service fee
   │      • a Farmer's Choice payout invoice (goods only) is generated
   ▼
Order routed to the NEAREST stockist (admin can override / re-route)
   │
   ▼
Farmer's Choice approves the order
   │
   ▼
Admin picks a rider ──► dispatch from the chosen stockist
   │
   ▼
Live GPS tracking until DELIVERED
```

Every order carries two invoices: a **customer invoice** (what was paid) and a
**vendor invoice** (Farmers Choice's payout, after the 5% fee is deducted).

---

## Stockists — order fulfilment locations

Orders are no longer tied to one pickup point. Every order is routed to the
**stockist nearest the customer's delivery address**:

- The **principal Farmer's Choice butchery plant (Ruiru)** is the fallback —
  with no stockists configured the app behaves exactly as before.
- The **delivery fee is computed from the chosen stockist**, so customers pay
  for the real distance their food travels.
- Admins manage locations under **/admin/stockists** (name, address, pin
  coordinates, opening hours, active flag). Exactly one location is the
  *principal plant*; it cannot be deleted, only deactivated.
- The chosen stockist is stamped on the order (`orders.stockist_id`), shown at
  checkout ("Fulfilled from …"), on the order page and in the rider's trip list.

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment — `.env.local` already exists; paste your Supabase keys there
#    (or regenerate from the template: cp .env.example .env.local)

# 3. Run
npm run dev                    # http://localhost:3000
```

The app boots without a database (it shows a friendly "finish setup" banner),
but the storefront needs Supabase to function.

### 1. Create a Supabase project (2 minutes)

1. Go to the [Supabase dashboard](https://supabase.com/dashboard) → **New project**.
2. Open **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` *(keep secret — server only)*
3. Paste them into `.env.local`.

### 2. Create the schema & seed data

**Option A — Supabase CLI (recommended).** Link once, then push migrations:

```bash
npx supabase login                                    # one time
npm run db:link -- --project-ref <your-project-ref>   # one time
npm run db:push                                       # applies supabase/migrations/*
```

Then load the seed data by pasting [`supabase/seed.sql`](supabase/seed.sql) into
the Supabase **SQL Editor** and running it.

**Option B — SQL Editor only.** In the Supabase **SQL Editor**, run, in order:

1. [`supabase/migrations/20260920120000_init.sql`](supabase/migrations/20260920120000_init.sql) — tables, enums, RLS policies
2. [`supabase/migrations/20260921000000_couriers_messaging.sql`](supabase/migrations/20260921000000_couriers_messaging.sql) — courier role, chat
3. [`supabase/migrations/20260922000000_stockists_tracking.sql`](supabase/migrations/20260922000000_stockists_tracking.sql) — stockists + GPS tracking
4. [`supabase/seed.sql`](supabase/seed.sql) — categories, Farmer's Choice products, pricing settings

The stockists migration seeds the principal Ruiru plant plus two example
stockists so nearest-location routing works immediately.

Verify everything is wired up:

```bash
npm run supabase:check
```

### 3. Create your first account

Register in the app (e.g. `/register`). Then promote yourself to admin so you can
approve orders — in the SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

You now have access to `/admin`, where you approve orders and dispatch riders.

---

## Going live (real money & delivery)

The app ships in **simulation mode** so you can test the whole flow with zero
third-party credentials. Flip the providers when you're ready:

### M-Pesa (Safaricom Daraja)

The app talks to the real Daraja **STK Push (Lipa na M-Pesa)** API — you only
need credentials. The sandbox shortcode (`174379`) and passkey are **public**, so
in sandbox you only need a Consumer Key/Secret:

1. Create a (free) app at the [Daraja portal](https://developer.safaricom.co.ke/)
   → **My Apps**, and copy the **Consumer Key** and **Consumer Secret**.
2. In `.env.local` set `MONEY_PROVIDER=daraja`, `MPESA_ENV=sandbox` and paste the
   key/secret. Leave `MPESA_PASSKEY` blank in sandbox (the public one is used).
3. Verify connectivity:

   ```bash
   npm run mpesa:check                                # OAuth check
   MPESA_TEST_PHONE=2547XXXXXXXX npm run mpesa:check  # + a real KES 1 STK push
   ```

4. For the callback: Safaricom needs a public HTTPS URL. Expose your dev server
   (e.g. `ngrok http 3000`), set `APP_URL` to that origin and re-run. Set
   `MPESA_CALLBACK_SECRET` to add a shared-secret check on the callback.
5. When ready for production, set `MPESA_ENV=production`, add a real
   `MPESA_PASSKEY`, apply for **Go-Live** and update `APP_URL`.

> Prefer to try the flow without credentials? Leave `MONEY_PROVIDER=sim` (the
> default) and use the "Simulate payment" controls on the order page.

### Delivery (courier)

> ⚠️ **Bolt has no public, self-serve dispatch API** in Kenya — programmatic
> access requires a B2B contract (or the Bolt Food partner API for restaurants).
> Because delivery is behind a provider interface, a Bolt driver can be added
> later without touching the rest of the app.

Options, in order of effort:

| Provider        | Set `DELIVERY_PROVIDER=` | Notes                                            |
| --------------- | ------------------------ | ------------------------------------------------ |
| Simulation      | `sim`                    | Default. Assigns a mock rider for testing.        |
| Manual dispatch | `manual`                 | Staff assign riders from `/admin`. Works today.   |
| Uber Direct     | `uber_direct`            | The only self-serve courier API with a sandbox.   |

For Uber Direct, add `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET` and
`UBER_CUSTOMER_ID` (from your Uber Direct account).

### Live rider GPS tracking

While a trip is active the rider can press **“Share live location”** in the
courier portal (`/courier`). Their phone streams a GPS ping every ~10 s to
`/api/courier/location` (authorisation: courier role **and** the trip must be
assigned to them). Customers see the rider move on a live Leaflet map on the
order page (`/api/orders/[id]/tracking`, refreshed every 8 s, participant-only
access) between the stockist pickup and their door.

- No extra hardware or API keys — it uses browser geolocation.
- Pings stop automatically when the trip completes or the rider closes the tab.
- The map also shows the route leg even before the rider shares location.
- Access follows the same rules as order chat: customer, assigned rider and FC
  staff only.

### Distance / delivery fee

Defaults to a **haversine** estimate (straight-line distance × road factor) so
no API key is needed. For production-accurate routing set
`DISTANCE_PROVIDER=google` and add `GOOGLE_MAPS_API_KEY`.

### Map pin picker

The delivery-address form ships an interactive **Leaflet + OpenStreetMap** map
(no API key). Customers can search a place, drag or tap a pin, or use their
current location, and can reverse-geocode the pin to auto-fill the address.
Geocoding is proxied through `/api/geocode/*` server-side so a compliant
`User-Agent` is sent and the public endpoints can be rate-limited. Set a real
contact in `GEOCODE_USER_AGENT` before going live.

---

## Security model

- **Secrets stay server-side.** M-Pesa/Uber keys and the Supabase service role
  key are only ever read in server code (`src/lib/**`) and route handlers.
- **Row Level Security** is enabled on every table. Customers can only read
  their own orders, addresses, invoices and payments; public catalog rows are
  read-only; writes that move money use the service role *after* an explicit
  authorisation check.
- **Server-authoritative pricing.** All totals — goods, distance-based delivery
  and the 5% service fee — are recomputed on the server at checkout. Nothing
  from the browser is trusted.
- **Payment callbacks** are validated with a shared secret and processed
  idempotently (duplicate callbacks are ignored).
- **The simulation endpoint** is hard-disabled in production and whenever a live
  money provider is configured.
- **STK push** means the customer enters their M-Pesa PIN on their phone; the PIN
  is never collected or stored by the app.

---

## Project structure

```
src/
  app/
    page.tsx                 Landing page
    login/ register/         Authentication
    onboarding/              Delivery-location setup
    shop/                    Product catalog
    cart/ checkout/          Cart → invoice → M-Pesa payment
    orders/[id]/             Order detail, timeline & invoice
    account/                 Profile & addresses
    admin/                   Operations dashboard (approve / dispatch)
    api/                     Route handlers (checkout, payments, delivery, admin, geocode)
  components/                UI (header, cards, forms, map pin picker, live tracking…)
  lib/
    config.ts                Env & feature flags
    pricing.ts               Distance + delivery fee + full quote
    orders.ts                Order state machine, numbering, timeline
    checkout.ts              Order creation & payment finalisation
    fulfilment.ts            Approval, dispatch, delivery, cancellation
    stockists.ts             Nearest-stockist routing for order fulfilment
    providers/money.ts       Sim + Safaricom Daraja
    providers/delivery.ts    Sim + manual + Uber Direct
    rate-limit.ts            In-memory limiter for the geocode proxy
    supabase/                Browser / server / admin clients + middleware
scripts/
  mpesa-check.mjs            Daraja connectivity check (npm run mpesa:check)
  check-supabase.mjs         Supabase connectivity check (npm run supabase:check)
supabase/
  config.toml                Supabase CLI project config
  migrations/20260920120000_init.sql   Schema + RLS
  seed.sql                   Farmer's Choice catalog
vitest.config.ts             Vitest configuration
src/test/setup.ts            Vitest setup (jest-dom matchers)
```

## Scripts

| Command                  | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Start the dev server                           |
| `npm run build`          | Production build                               |
| `npm run start`          | Run the production build                       |
| `npm run lint`           | ESLint                                         |
| `npm test`               | Run the unit test suite (Vitest)               |
| `npm run test:watch`     | Run tests in watch mode                        |
| `npm run test:coverage`  | Run tests with a coverage report               |
| `npm run mpesa:check`    | Check Daraja credentials / send a test STK push |
| `npm run supabase:check` | Check Supabase connectivity, schema & seed     |
| `npm run db:link`        | Link the local repo to your Supabase project   |
| `npm run db:push`        | Push migrations to the linked project          |

## FAQ

**Do I need Bolt/Uber keys to try this?** No — leave `DELIVERY_PROVIDER=sim`.

**Do I need M-Pesa keys to try this?** No — leave `MONEY_PROVIDER=sim` and use the
"Simulate payment" controls on the order page.

**Do I need a maps or geocoding key?** No — the pin picker uses Leaflet +
OpenStreetMap and Nominatim, all key-free.

**How do I run the tests?** `npm test` (or `npm run test:watch`).

**Where does the 5% go?** It's the platform's revenue (`orders.platform_fee_cents`).
Farmers Choice is invoiced for the goods value only (`orders.vendor_payout_cents`).
