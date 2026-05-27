import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getStripe, getPriceId, getSiteUrl } from "./_lib/stripe.js";
import { rateLimit, reapOldRows, clientKey } from "./_lib/ratelimit.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip = clientKey(req);
  const rl = await rateLimit({
    bucket: "create-checkout-session",
    key: ip,
    limit: 10,
    windowSeconds: 60,
  });
  if (Math.random() < 0.01) reapOldRows("create-checkout-session", 60);
  if (!rl.allowed) {
    res
      .setHeader("Retry-After", String(rl.retryAfterSeconds ?? 60))
      .status(429)
      .json({ error: "Too many checkout attempts. Wait a minute." });
    return;
  }

  try {
    const stripe = getStripe();
    const priceId = getPriceId();
    const siteUrl = getSiteUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/success/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pricing/?canceled=1`,
      allow_promotion_codes: true,
      payment_intent_data: {
        description: "AnswerVault Pro — one-time unlock",
      },
    });

    if (!session.url) {
      res.status(500).json({ error: "Stripe did not return a checkout URL" });
      return;
    }
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout-session failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;
    res.status(500).json({ error: message, code });
  }
}
