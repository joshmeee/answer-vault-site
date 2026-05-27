import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { getStripe, getWebhookSecret } from "./_lib/stripe.js";
import { saveLicense } from "./_lib/kv.js";

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function buildLicenseKey(): string {
  // av_XXXX-XXXX-XXXX-XXXX
  const raw = randomUUID().replace(/-/g, "").toUpperCase();
  return `av_${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function emailFromSession(session: Stripe.Checkout.Session): string | null {
  if (typeof session.customer_email === "string" && session.customer_email) {
    return session.customer_email;
  }
  const details = session.customer_details;
  if (details && typeof details.email === "string" && details.email) {
    return details.email;
  }
  return null;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string") {
    res.status(400).json({ error: "Missing stripe-signature" });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, signature, getWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    res.status(400).json({ error: `Webhook signature failed: ${message}` });
    return;
  }

  if (event.type !== "checkout.session.completed") {
    res.status(200).json({ received: true });
    return;
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = emailFromSession(session);
    if (!email) {
      res.status(400).json({ error: "Checkout session has no email" });
      return;
    }
    const record = {
      email,
      licenseKey: buildLicenseKey(),
      stripeSessionId: session.id,
      paidAt: new Date(
        ((session.created ?? Math.floor(Date.now() / 1000)) as number) * 1000,
      ).toISOString(),
    };
    await saveLicense(record);
    res.status(200).json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
