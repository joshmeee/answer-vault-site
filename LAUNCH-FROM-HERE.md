# AnswerVault — Resume From Here (2026-05-27 16:35 EDT)

## TL;DR

Revenue infrastructure is **live**. Real Stripe (Account A), real webhook, real Supabase, real Chrome zip. The only thing standing between you and the first sale is the Chrome Web Store upload.

| Component | State | Where |
|-----------|-------|-------|
| Marketing + API site | LIVE | https://answer-vault-site.vercel.app/ |
| Stripe product `AnswerVault Pro` | LIVE, $39 one-time | `prod_UazsAKOBeoDfgU` on Account A `acct_1Sr8RJAp3o9rAimX` |
| Stripe price | LIVE | `price_1TbnsNAp3o9rAimXxiqjoCNU` |
| Stripe webhook | LIVE, enabled | `we_1Tbo27Ap3o9rAimXbcS4MjKd` → `/api/stripe-webhook`, event `checkout.session.completed` |
| License storage | LIVE | Supabase palavir-co project, table `public.av_licenses` |
| Vercel env vars | All 6 set | Encrypted in production environment |
| Chrome extension zip | Ready | `C:\Users\jelbe\answer-vault-extension\.output\answer-vault-extension-0.2.0-chrome.zip` (15,994 bytes) |
| CWS screenshots | Captured | 3× 1280×800 + 1× 440×280 in `.../store-assets/` |
| Verification | Webhook signature + Supabase write + license activation all proven end-to-end via signed-event test |

## What's still on Josh

Three things, in this order:

### 1. Buy your own $39 unit (15 min)

Open https://answer-vault-site.vercel.app/pricing/ → **Buy Pro** → use a real card.

Confirm:
- Stripe Checkout opens (Palavir LLC, $39 USD)
- After paying, the `/success/?session_id=cs_live_...` page shows your email + a license key in the format `av_XXXX-XXXX-XXXX-XXXX` within ~5 seconds
- A new row appears in `public.av_licenses` in Supabase

If the flow works end-to-end, you've taken your first dollar and proven the production path. (You can refund yourself in Stripe Dashboard → Payments → click row → Refund.)

### 2. Activate Pro in the local extension (3 min)

1. Chrome → `chrome://extensions/`
2. Toggle Developer mode (top right)
3. Load unpacked → pick `C:\Users\jelbe\answer-vault-extension\.output\chrome-mv3\`
4. Click Details → Extension options on AnswerVault
5. Plan badge should show **Free**
6. Paste the email + license key from step 1.4 above into the activate form
7. Click **Activate** → plan should flip to **Pro**
8. Add a 26th answer (was blocked under Free). Should succeed.

### 3. Submit to Chrome Web Store (30 min)

1. Go to https://chrome.google.com/webstore/devconsole/. Sign in with the Google account holding your $5 developer fee.
2. **New item → Upload**: `C:\Users\jelbe\answer-vault-extension\.output\answer-vault-extension-0.2.0-chrome.zip`
3. Fill the listing:
   - **Title:** `Business Form Filler - AnswerVault`
   - **Summary:** `Save reusable answers and fill RFPs, vendor forms, grants, and questionnaires faster.`
   - **Category:** Productivity
   - **Detailed description:** copy/paste from `C:\Users\jelbe\answer-vault-extension\store-listing.md`
4. Upload images from `C:\Users\jelbe\answer-vault-extension\store-assets\`:
   - **Icon:** `C:\Users\jelbe\answer-vault-extension\.output\chrome-mv3\icons\128.png`
   - **Small promo tile (440×280):** `promo-small-440x280.png`
   - **Screenshots (1280×800):** `screenshot-1.png`, `screenshot-2.png`, `screenshot-3.png`
5. **Privacy practices:** point to `https://answer-vault-site.vercel.app/privacy/`
6. **Permission justifications** (paste verbatim):
   - `storage`: stores reusable answers locally
   - `activeTab`: lets the extension work on the active page after user action
   - `scripting`: scans and fills visible fields on the active page after user action
   - `https://answer-vault-site.vercel.app/*`: opens Stripe checkout and activates/restores Pro licenses
7. **Support email:** `josh@palavir.co`
8. **Single purpose statement:** `Save reusable answers and fill long business forms after user review.`
9. Submit for review. Approval typically 1-3 business days for new listings.

That's it. After approval the install URL becomes shareable; the website at https://answer-vault-site.vercel.app/ already has /pricing/ pointing at Stripe, so anyone who finds the site can buy a license today even before the CWS approval lands (they'll just need to load the extension unpacked until CWS approval).

## Live infrastructure detail

### Stripe (Account A `acct_1Sr8RJAp3o9rAimX`, Palavir LLC)

```
Product:  prod_UazsAKOBeoDfgU  AnswerVault Pro
Price:    price_1TbnsNAp3o9rAimXxiqjoCNU  $39.00 USD one-time
Webhook:  we_1Tbo27Ap3o9rAimXbcS4MjKd
          → POST https://answer-vault-site.vercel.app/api/stripe-webhook
          → events: checkout.session.completed
```

Refund + dispute handling: identical to all your other Stripe products. Statement descriptor is `PALAVIR LLC` per Account A defaults.

### Supabase (palavir-co `rlxrwizzpgrwkxewygcd`)

```sql
table public.av_licenses (
  license_key text primary key,
  email text not null,
  stripe_session_id text not null unique,
  paid_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

RLS enabled, no anon/authenticated grants. All API access is via the service-role key. To inspect:

```sql
select * from public.av_licenses order by created_at desc;
```

### Vercel project

- Team: `joshua-elbergs-projects` (`team_Zwt8LzbZzyN5qoY0uOU3G9BM`)
- Project: `answer-vault-site` (`prj_*`)
- Production: https://answer-vault-site.vercel.app/
- Env vars (production):
  - `STRIPE_SECRET_KEY` (sk_live_*)
  - `STRIPE_PRICE_ID` = `price_1TbnsNAp3o9rAimXxiqjoCNU`
  - `STRIPE_WEBHOOK_SECRET` (whsec_*)
  - `SUPABASE_URL` = `https://rlxrwizzpgrwkxewygcd.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` (sb_secret_*)
  - `ANSWERVAULT_SITE_URL` = `https://answer-vault-site.vercel.app`

## API smoke checks (anytime)

```powershell
# Static pages
Invoke-WebRequest -UseBasicParsing "https://answer-vault-site.vercel.app/" | Select-Object StatusCode
Invoke-WebRequest -UseBasicParsing "https://answer-vault-site.vercel.app/pricing/" | Select-Object StatusCode
Invoke-WebRequest -UseBasicParsing "https://answer-vault-site.vercel.app/privacy/" | Select-Object StatusCode

# Real Stripe checkout URL (returns a cs_live_* URL — opening it would charge $39)
Invoke-RestMethod -Method POST -ContentType "application/json" -Body "{}" `
  "https://answer-vault-site.vercel.app/api/create-checkout-session"

# Activate-license sanity (fake email/key returns 404 by design)
Invoke-RestMethod -Method POST -ContentType "application/json" `
  -Body '{"email":"fake@example.com","licenseKey":"av_FAKE-FAKE-FAKE-FAKE"}' `
  "https://answer-vault-site.vercel.app/api/activate-license"
```

## Future considerations

- **Extension source code is missing from the handoff snapshot.** The shipping zip is fine, but if you ever need to change the extension (e.g. update the API URL, ship 0.3), you'll need the source. Most likely locations to check: another machine, a private GitHub repo named `answer-vault-extension`, or an earlier OneDrive snapshot. If not found, you can reconstruct from the compiled `.output/chrome-mv3/` (~5 small TypeScript files; the contract is already captured in this site's `/api/*.ts`).
- **No analytics.** The PRD explicitly says "Do not add analytics to the MVP without explicit privacy copy." If you want to instrument the funnel, update `/privacy/` first.
- **No support email infrastructure yet.** The Chrome Web Store listing says `josh@palavir.co`. License-recovery requests will come via that inbox. Worth a Gmail filter + label so they don't get lost.
- **Stripe webhook is in live mode only.** No test-mode webhook exists. If you ever want to test changes safely, create a test-mode webhook against a deploy-preview URL, not the production one.

## Repo locations

- Extension: `C:\Users\jelbe\answer-vault-extension\` (zip + docs only; source missing)
- Site: `C:\Users\jelbe\answer-vault-site\` (full source, committed locally; not yet pushed to GitHub)
- This runbook: `C:\Users\jelbe\answer-vault-site\LAUNCH-FROM-HERE.md`
- Detailed site runbook (more general, for future you): `C:\Users\jelbe\answer-vault-site\REVENUE-SETUP.md`
- Webhook signature test: `C:\Users\jelbe\answer-vault-site\scripts\test-webhook.mjs`
