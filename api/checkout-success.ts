import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getLicenseBySession } from "./_lib/kv.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const sessionId =
    typeof req.query.session_id === "string" ? req.query.session_id : "";
  if (!sessionId) {
    res.status(400).json({ error: "session_id is required" });
    return;
  }

  try {
    const record = await getLicenseBySession(sessionId);
    if (!record) {
      res.status(404).json({
        error:
          "License not yet provisioned. Stripe webhook may still be processing.",
      });
      return;
    }
    res.status(200).json({
      email: record.email,
      licenseKey: record.licenseKey,
      paidAt: record.paidAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
