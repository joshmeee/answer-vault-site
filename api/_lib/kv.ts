import { Redis } from "@upstash/redis";

let cached: Redis | null = null;

export function getKv(): Redis {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN must be set");
  }
  cached = new Redis({ url, token });
  return cached;
}

export interface LicenseRecord {
  email: string;
  licenseKey: string;
  stripeSessionId: string;
  paidAt: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function licenseKeyOf(record: LicenseRecord): string {
  return `license:${record.licenseKey}`;
}

function emailKeyOf(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

function sessionKeyOf(sessionId: string): string {
  return `session:${sessionId}`;
}

export async function saveLicense(record: LicenseRecord): Promise<void> {
  const kv = getKv();
  await Promise.all([
    kv.set(licenseKeyOf(record), record),
    kv.set(emailKeyOf(record.email), record),
    kv.set(sessionKeyOf(record.stripeSessionId), record),
  ]);
}

export async function getLicenseByEmailAndKey(
  email: string,
  licenseKey: string,
): Promise<LicenseRecord | null> {
  const kv = getKv();
  const record = await kv.get<LicenseRecord>(`license:${licenseKey}`);
  if (!record) return null;
  if (normalizeEmail(record.email) !== normalizeEmail(email)) return null;
  return record;
}

export async function getLicenseBySession(
  sessionId: string,
): Promise<LicenseRecord | null> {
  const kv = getKv();
  return (await kv.get<LicenseRecord>(sessionKeyOf(sessionId))) ?? null;
}
