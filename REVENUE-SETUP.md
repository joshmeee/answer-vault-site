# AnswerVault Revenue Setup

This is the runbook for taking the AnswerVault site/API from a deployed-but-unconfigured Vercel project to one that can take real money.

## Required accounts

| Service | Why | Account |
|---------|-----|---------|
| Vercel | Hosts the site + 4 serverless API routes | joshua-elbergs-projects team |
| Stripe | Charges $39 one-time for Pro | Account A (`acct_1Sr8RJAp3o9rAimX`) per Palavir canonical setup |
| Upstash | Redis-compatible KV for license storage | Free tier handles thousands of records |
| Chrome Web Store | Publishes the extension | Existing $5 dev account |

## Stripe setup

1. In the Stripe Dashboard, confirm you are in **Account A** (palavir.co canonical). Make sure you are in **Test mode** for the first end-to-end run.
2. Create a Product:
   - Name: `AnswerVault Pro`
   - Description: `One-time unlock for unlimited saved answers and full-library import.`
3. Add a Price to that product:
   - Amount: `$39.00 USD`
   - Billing: `One-time`
4. Copy the **price ID** (starts with `price_`). This becomes `STRIPE_PRICE_ID`.
5. Get the **secret key** (`Developers → API keys → Reveal test key token`). This becomes `STRIPE_SECRET_KEY`. Use `sk_test_*` first; swap for `sk_live_*` when you flip to live mode.
6. Create the webhook **after the Vercel project is deployed** (so the URL exists). See "Webhook" below.

## Upstash KV setup

1. Sign in to https://console.upstash.com/ (or create a free account).
2. Create a new **Redis** database. Region: `us-east-1` to match Vercel default.
3. Open the database → **REST API** tab.
4. Copy `UPSTASH_REDIS_REST_URL` → this becomes `KV_REST_API_URL`.
5. Copy `UPSTASH_REDIS_REST_TOKEN` → this becomes `KV_REST_API_TOKEN`.

## Vercel deployment

1. Push this repo to GitHub (or use `vercel link` from the local directory).
2. Create a new Vercel project named exactly `answer-vault-site` — this claims the `answer-vault-site.vercel.app` subdomain which the shipped Chrome extension expects.
3. Framework preset: `Other`. Root directory: project root. Output: leave defaults.
4. Set environment variables (all environments unless noted):

   | Name | Value |
   |------|-------|
   | `STRIPE_SECRET_KEY` | `sk_test_...` (then `sk_live_...` for production cutover) |
   | `STRIPE_PRICE_ID` | `price_...` from step 4 above |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_...` from webhook setup below |
   | `KV_REST_API_URL` | from Upstash |
   | `KV_REST_API_TOKEN` | from Upstash |
   | `ANSWERVAULT_SITE_URL` | `https://answer-vault-site.vercel.app` (or your custom domain) |

5. Deploy.

## Stripe webhook

After the Vercel deploy is live:

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://answer-vault-site.vercel.app/api/stripe-webhook`
3. Events to send: `checkout.session.completed` (only).
4. Save. Stripe shows the **signing secret** once (`whsec_...`). Copy it.
5. Paste it into the Vercel env var `STRIPE_WEBHOOK_SECRET` and redeploy.

## End-to-end verification (test mode)

```powershell
# 1. Static pages return 200
Invoke-WebRequest -UseBasicParsing "https://answer-vault-site.vercel.app/"
Invoke-WebRequest -UseBasicParsing "https://answer-vault-site.vercel.app/pricing/"
Invoke-WebRequest -UseBasicParsing "https://answer-vault-site.vercel.app/privacy/"

# 2. Create-checkout-session returns a Stripe URL
$body = '{}'
$response = Invoke-WebRequest -UseBasicParsing -Method POST `
  -ContentType "application/json" `
  -Body $body `
  "https://answer-vault-site.vercel.app/api/create-checkout-session"
$response.Content
```

3. Click `Buy Pro` on `/pricing/` in a browser.
4. Use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
5. After payment, you are redirected to `/success/?session_id=...`. Within ~5 seconds the page should show your purchase email and a license key like `av_XXXX-XXXX-XXXX-XXXX`.
6. Load the extension from `C:\Users\jelbe\answer-vault-extension\.output\chrome-mv3\`:
   - Chrome → `chrome://extensions/` → enable Developer mode → Load unpacked → pick that folder.
7. Open AnswerVault Options. Plan should show `Free`.
8. Paste the email + license key into the Activate Pro section. Click Activate. Plan should flip to `Pro`.
9. Confirm you can add more than 25 answers (try 26).
10. In a fresh browser profile (Chrome → People → Add → Test profile), reload the extension and re-activate with the same email + key. Pro should restore.

## Go-live cutover

When all of the above pass in test mode:

1. In Stripe, switch to **Live mode**.
2. Recreate the Product + Price in live mode (Stripe does not promote test-mode products automatically).
3. Add a live-mode webhook with the same endpoint URL and event.
4. In Vercel, swap `STRIPE_SECRET_KEY` to `sk_live_...`, `STRIPE_PRICE_ID` to the live price ID, and `STRIPE_WEBHOOK_SECRET` to the live webhook signing secret.
5. Redeploy.
6. Run one real $39 purchase end-to-end (your own card). If license activates cleanly, submit the extension to the Chrome Web Store.

## Chrome Web Store submission

Zip to upload: `C:\Users\jelbe\answer-vault-extension\.output\answer-vault-extension-0.2.0-chrome.zip` (15,994 bytes, generated by the prior session and present in the handoff snapshot).

Listing copy lives at `C:\Users\jelbe\answer-vault-extension\store-listing.md`.

Privacy policy URL for the Web Store form: `https://answer-vault-site.vercel.app/privacy/`.

## Common failure modes

- **`STRIPE_SECRET_KEY is not set`** in `/api/create-checkout-session` response → env var didn't make it to the deployment. Redeploy after adding the var.
- **`License not yet provisioned`** on the success page → the webhook hasn't fired yet, OR webhook signing secret is wrong, OR webhook endpoint URL doesn't match the deployed URL. Check Stripe Dashboard → Webhooks → recent events for the failure.
- **CORS errors when the extension calls the API** → the extension is loaded from a chrome-extension:// origin; the API responds `Access-Control-Allow-Origin: *` via `vercel.json`. If CORS still fails, confirm `vercel.json` headers shipped (Vercel dashboard → Project → Settings → Headers).
- **Site is on a different subdomain** (e.g. `answer-vault-site-abc.vercel.app`) → the shipped Chrome extension zip is hardcoded to call `answer-vault-site.vercel.app`. Either rename the Vercel project to claim that exact subdomain (works because no other project on the team uses it), or rebuild the extension from source — which is not present in this handoff snapshot. See `CLAUDE-HANDOFF.md` "If Final API Domain Changes" for the rebuild flow.
