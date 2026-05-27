// Locally sign and POST a fake checkout.session.completed event
// to our live webhook endpoint, to prove signature verification + KV write
// work end to end. Mirrors how Stripe's CLI `stripe trigger` does it.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const ENV = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1);
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      return [l.slice(0, i), v];
    }),
);

const secret = ENV.STRIPE_WEBHOOK_SECRET;
if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not in .env.local");

const sessionId = `cs_test_self_${Date.now()}`;
const email = "verify-self@palavir.co";

const event = {
  id: `evt_self_${Date.now()}`,
  object: "event",
  api_version: "2025-02-24.acacia",
  created: Math.floor(Date.now() / 1000),
  type: "checkout.session.completed",
  livemode: false,
  pending_webhooks: 1,
  data: {
    object: {
      id: sessionId,
      object: "checkout.session",
      payment_status: "paid",
      mode: "payment",
      customer_email: email,
      customer_details: { email },
      created: Math.floor(Date.now() / 1000),
    },
  },
};

const payload = JSON.stringify(event);
const timestamp = Math.floor(Date.now() / 1000);
const signedPayload = `${timestamp}.${payload}`;
const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
const stripeSignature = `t=${timestamp},v1=${sig}`;

console.log("POSTing fake checkout.session.completed event");
console.log("  session_id:", sessionId);
console.log("  email:", email);

const res = await fetch(
  "https://answer-vault-site.vercel.app/api/stripe-webhook",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": stripeSignature,
    },
    body: payload,
  },
);

console.log("status:", res.status);
console.log("body:", await res.text());

if (res.ok) {
  console.log("\nNow checking checkout-success for that session_id...");
  await new Promise((r) => setTimeout(r, 1500));
  const r2 = await fetch(
    `https://answer-vault-site.vercel.app/api/checkout-success?session_id=${encodeURIComponent(sessionId)}`,
  );
  console.log("status:", r2.status);
  console.log("body:", await r2.text());
}
