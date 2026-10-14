# Deployment & go-live guide (Vercel + Safaricom Daraja)

Everything needed to take Prime Butchers Hub from simulation to a hosted,
M-Pesa-paying deployment. Grounded in the code as shipped — every variable
below is read by [`src/lib/config.ts`](src/lib/config.ts).

---

## 1. Hosted environment variables

Vercel → **Project → Settings → Environment Variables**. Apply to all
environments (Production, Preview, Development) so preview deploys behave.

### Required now (sandbox round-trip)

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | Public — inlined into the client bundle |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…` | Public — same |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | **Secret.** Checkout, callbacks and admin APIs need it server-side |
| `APP_URL` | `https://<your-domain>` | No trailing slash — the webhook URL is built as `${APP_URL}/api/payments/mpesa/callback` |
| `MONEY_PROVIDER` | `sim` | **Keep `sim` until go-live approval** (rationale in §5) |
| `MPESA_CONSUMER_KEY` | Daraja → My Apps | Needed for `npm run mpesa:check` and sandbox STK pushes |
| `MPESA_CONSUMER_SECRET` | Daraja → My Apps | Secret |
| `MPESA_CALLBACK_SECRET` | long random string | Shared secret guarding the webhook — `openssl rand -hex 32` |

`APP_URL` must be the exact public origin. With `MPESA_CALLBACK_SECRET` set,
the code appends `?token=<secret>` to the callback URL
([`buildCallbackUrl()`](src/lib/providers/money.ts)) and the webhook rejects
requests whose token doesn't match (401).

### Strongly recommended

| Variable | Value | Notes |
| --- | --- | --- |
| `MPESA_PASSKEY` | *leave unset in sandbox* | The public sandbox passkey is used automatically; production requires a real one |
| `MPESA_SHORTCODE` | `174379` | Sandbox default; sandbox only accepts this shortcode with the Paybill flow |
| `TILL_NUMBER` | your Buy Goods till | Production STK receiver in the Buy Goods flow; also editable at runtime in Admin → Finance |
| `MERCHANT_ACCOUNT_PREFIX` | `FCM` | Account-reference prefix on pushes |
| `RESEND_API_KEY` | `re_…` | Admin one-time codes for till changes |
| `EMAIL_FROM` | `"Prime Butchers Hub <noreply@your-domain>"` | Needs a verified Resend domain; the shared `onboarding@resend.dev` default only reaches your own inbox |
| `GEOCODE_USER_AGENT` | `Prime Butchers Hub (https://your-domain; contact@you)` | Nominatim usage policy requires an identifying User-Agent |
| `DELIVERY_PROVIDER` | `manual` | Staff assign real riders from `/admin` — works today, no courier API needed |

### Optional / tuning

`SERVICE_FEE_PERCENT` (default 3), `DELIVERY_BASE_FEE` (100),
`DELIVERY_PER_KM_FEE` (35), `DELIVERY_MIN_FEE` (130), `DELIVERY_MAX_FEE` (1500),
`DELIVERY_PEAK_MULTIPLIER` (1.15), `DISTANCE_PROVIDER` (`haversine` | `google`),
`DISTANCE_ROAD_FACTOR` (1.35), `GOOGLE_MAPS_API_KEY`, `STORE_NAME`,
`STORE_ADDRESS`, `STORE_LAT`, `STORE_LNG`, `STORE_PHONE`, `UBER_CLIENT_ID`,
`UBER_CLIENT_SECRET`, `UBER_CUSTOMER_ID`, `MPESA_TRANSACTION_TYPE`
(`CustomerBuyGoodsOnline` is the default and matches a till).

---

## 2. Sanity-check the deployment

```bash
# Config readiness probe — no secrets exposed
curl -s https://<your-domain>/api/health
```

Expect:

```json
{
  "ok": true,
  "supabaseConfigured": true,
  "serviceRoleConfigured": true,
  "moneyProvider": "sim",
  "deliveryProvider": "manual",
  "distanceProvider": "haversine",
  "serviceFeePercent": 3
}
```

- `moneyProvider: "sim"` is **correct** pre-go-live (§5).
- Then run the full user journey locally against the hosted deploy:

```bash
npm run smoke -- --base-url https://<your-domain>
```

This drives signup → cart → quote → checkout → sim payment → admin approval →
dispatch → delivery, plus the security gates, against your live deployment.

---

## 3. Daraja connectivity

```bash
npm run mpesa:check                                # OAuth token against sandbox
MPESA_TEST_PHONE=2547XXXXXXXX npm run mpesa:check  # + a KES 1 STK push
```

The script reads `.env.local` locally. For the hosted copy, the same values are
the Vercel env vars from §1. Sandbox never prompts a real phone — a push is
only "accepted" (CheckoutRequestID returned).

---

## 4. Sandbox round-trip (the full production path, simulated)

With the hosted app on `MONEY_PROVIDER=sim` + Daraja sandbox credentials, this
proves the entire webhook path end-to-end:

1. `APP_URL=https://<your-domain>` and `MPESA_CALLBACK_SECRET` are set on Vercel.
2. A checkout creates an order and (in Daraja mode) a push whose callback URL is
   `https://<your-domain>/api/payments/mpesa/callback?token=<secret>`.
3. Safaricom's simulated result hits your **live webhook** on the public domain.
4. [`finalizePayment()`](src/lib/checkout.ts) marks the order paid, records the
   receipt, issues the vendor invoice — all idempotent.

To exercise the webhook itself without waiting for Safaricom (works in any
environment):

```bash
curl -X POST "https://<your-domain>/api/payments/mpesa/callback?token=<MPESA_CALLBACK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"Body":{"stkCallback":{"CheckoutRequestID":"CO-TEST-1","ResultCode":0,"ResultDesc":"The service request is processed successfully.","CallbackMetadata":{"Item":[{"Name":"Amount","Value":1},{"Name":"MpesaReceiptNumber","Value":"TEST123"}}]}}}}'
```

Expected responses:

- Wrong/missing token → **401** `Unauthorized`
- Malformed payload → **400** `Invalid payload`
- Unknown `CheckoutRequestID` → **200** `Accepted` and the order is untouched
- Valid, already-finalised reference → **200** and unchanged (idempotent replay)

`npm run smoke` asserts all four of these against the running server.

---

## 5. Go-live: sim → daraja (zero code changes)

**Keep `MONEY_PROVIDER=sim` on the hosted app until Safaricom approves your
production access.** Sandbox never moves money or prompts phones — flipping
early would strand customer orders at `processing`, and the sim provider is the
only mode `npm run smoke` can drive through the full lifecycle.

Prerequisites (applied in the Daraja portal — usually a few days):

1. **Go-live application** approved on your Daraja app.
2. **Production passkey** issued (Lipa na M-Pesa Online).
3. **Till activation** — the Buy Goods till that receives customer money.

The moment you're approved, change these env vars on Vercel and redeploy:

| Variable | Sandbox value | Production value |
| --- | --- | --- |
| `MONEY_PROVIDER` | `sim` | `daraja` |
| `MPESA_ENV` | `sandbox` *(default)* | `production` |
| `MPESA_PASSKEY` | *(unset — public one used)* | your production passkey |
| `MPESA_SHORTCODE` | `174379` | your business shortcode (Paybill flow) |
| `TILL_NUMBER` | `000000` | your real till (Buy Goods flow — it becomes the receiver) |
| `APP_URL` | tunnel or domain | your final public domain |

Behaviour that changes automatically in production
([`chargeParams()`](src/lib/providers/money.ts)):

- Base URL switches to `https://api.safaricom.co.ke`.
- With the default `CustomerBuyGoodsOnline`, the **till** is used as
  `BusinessShortCode`/`PartyB` — a real till is rejected in sandbox, which is
  expected ("Invalid TransactionType"); sandbox only validates `174379`.
- Real customers get a real STK prompt; money actually moves.

Post-flip verification (staging order, small amount):

1. `curl https://<your-domain>/api/health` → `moneyProvider: "daraja"`.
2. Place a real order → confirm the STK prompt arrives → pay → verify the
   receipt appears on the order and the vendor invoice is issued.
3. Cancel-prompt test → order must land in `payment_failed`/`cancelled`, never
   `paid`.
4. Watch Vercel logs for `M-Pesa callback processing error:` — that line means
   a callback arrived but processing threw; Safaricom got a 200 so it won't
   retry, so reconcile the order manually.

Rollback = set `MONEY_PROVIDER=sim` and redeploy (orders in flight stay
pending; retry-payment lets customers pay them once daraja is healthy again).

---

## 6. Hardening before real money

- [ ] `MPESA_CALLBACK_SECRET` set (webhook is 401 without the token).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on the server (never `NEXT_PUBLIC_*`).
- [ ] `GEOCODE_USER_AGENT` identifies your real domain + contact.
- [ ] `EMAIL_FROM` on a verified Resend domain so admin OTPs reach any inbox.
- [ ] `npm test` and `npm run lint` green in CI.
- [ ] Supabase: run the latest migrations (`npm run db:push`), then
      `npm run supabase:check` against the hosted project.
- [ ] Backups / PITR enabled on the Supabase project.
