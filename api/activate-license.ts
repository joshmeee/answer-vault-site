import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLicenseByEmailAndKey } from "./_lib/kv.js";
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
    bucket: "activate-license",
    key: ip,
    limit: 20,
    windowSeconds: 60,
  });
  // Opportunistic cleanup ~1% of requests
  if (Math.random() < 0.01) reapOldRows("activate-license", 60);

  if (!rl.allowed) {
    res
      .setHeader("Retry-After", String(rl.retryAfterSeconds ?? 60))
      .status(429)
      .json({
        error:
          "Too many activation attempts. Wait a minute and try again, or contact support if you're stuck.",
      });
    return;
  }

  const body = req.body as { email?: unknown; licenseKey?: unknown } | undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const licenseKey =
    typeof body?.licenseKey === "string" ? body.licenseKey.trim() : "";

  if (!email || !licenseKey) {
    res.status(400).json({ error: "email and licenseKey are required" });
    return;
  }

  try {
    const record = await getLicenseByEmailAndKey(email, licenseKey);
    if (!record) {
      res
        .status(404)
        .json({ error: "License not found for that email and key" });
      return;
    }
    res.status(200).json({
      source: "stripe",
      email: record.email,
      paidAt: record.paidAt,
    });
  } catch (err) {
    console.error("activate-license failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
