// License storage backed by Supabase (palavir-co project).
// Table: public.av_licenses
//   license_key       text  primary key
//   email             text  not null
//   stripe_session_id text  not null unique
//   paid_at           timestamptz not null
//   created_at        timestamptz not null default now()
// RLS is on, all reads/writes go through the service-role key.

const REST_PATH = "/rest/v1/av_licenses";

function getUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not set");
  return url.replace(/\/$/, "");
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return key;
}

function headers(extra: Record<string, string> = {}): HeadersInit {
  const key = getServiceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export interface LicenseRecord {
  email: string;
  licenseKey: string;
  stripeSessionId: string;
  paidAt: string;
}

interface DbRow {
  license_key: string;
  email: string;
  stripe_session_id: string;
  paid_at: string;
}

function fromRow(row: DbRow): LicenseRecord {
  return {
    licenseKey: row.license_key,
    email: row.email,
    stripeSessionId: row.stripe_session_id,
    paidAt: row.paid_at,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Idempotent. If a row already exists for the given stripe_session_id,
// returns the existing record (with the existing license_key) rather than
// inserting a duplicate. This lets the webhook handler retry safely.
export async function saveLicense(
  record: LicenseRecord,
): Promise<LicenseRecord> {
  // Look up first — covers the common case where the webhook is being
  // retried for an already-fulfilled session.
  const existing = await getLicenseBySession(record.stripeSessionId);
  if (existing) return existing;

  const res = await fetch(`${getUrl()}${REST_PATH}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({
      license_key: record.licenseKey,
      email: record.email,
      stripe_session_id: record.stripeSessionId,
      paid_at: record.paidAt,
    }),
  });

  if (res.status === 409) {
    // Race: another concurrent webhook invocation inserted the row in the
    // microsecond between our lookup and our insert. Re-fetch.
    const raced = await getLicenseBySession(record.stripeSessionId);
    if (raced) return raced;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`saveLicense failed: ${res.status} ${body}`);
  }

  const rows = (await res.json()) as DbRow[];
  const row = rows[0];
  if (!row) throw new Error("saveLicense: no row returned after insert");
  return fromRow(row);
}

export async function getLicenseByEmailAndKey(
  email: string,
  licenseKey: string,
): Promise<LicenseRecord | null> {
  const url = new URL(`${getUrl()}${REST_PATH}`);
  url.searchParams.set("license_key", `eq.${licenseKey}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`getLicenseByEmailAndKey failed: ${res.status} ${body}`);
  }
  const rows = (await res.json()) as DbRow[];
  const row = rows[0];
  if (!row) return null;
  if (normalizeEmail(row.email) !== normalizeEmail(email)) return null;
  return fromRow(row);
}

export async function getLicenseBySession(
  sessionId: string,
): Promise<LicenseRecord | null> {
  const url = new URL(`${getUrl()}${REST_PATH}`);
  url.searchParams.set("stripe_session_id", `eq.${sessionId}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`getLicenseBySession failed: ${res.status} ${body}`);
  }
  const rows = (await res.json()) as DbRow[];
  const row = rows[0];
  return row ? fromRow(row) : null;
}
