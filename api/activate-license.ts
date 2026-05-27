import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLicenseByEmailAndKey } from "./_lib/kv.js";

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
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
