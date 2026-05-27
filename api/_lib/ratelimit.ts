// Sliding-window rate limiter backed by Supabase.
// Stores one row per request inside the window; counts via REST.
// Best for low-volume endpoints — for high-volume use, swap for Redis.

const REST_PATH = "/rest/v1/av_rate_limits";

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

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds?: number;
}

export interface RateLimitOptions {
  bucket: string;
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function rateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const cutoffIso = new Date(
    Date.now() - opts.windowSeconds * 1000,
  ).toISOString();
  const base = getUrl();

  // Count current usage in window.
  const countUrl = new URL(`${base}${REST_PATH}`);
  countUrl.searchParams.set("bucket", `eq.${opts.bucket}`);
  countUrl.searchParams.set("key", `eq.${opts.key}`);
  countUrl.searchParams.set("ts", `gte.${cutoffIso}`);
  countUrl.searchParams.set("select", "ts");

  const countRes = await fetch(countUrl.toString(), {
    headers: headers({ Prefer: "count=exact" }),
  });
  if (!countRes.ok) {
    // Fail-open: if the rate-limit store is down, don't block legitimate users.
    console.error("rateLimit count failed:", countRes.status);
    return {
      allowed: true,
      count: 0,
      limit: opts.limit,
      windowSeconds: opts.windowSeconds,
    };
  }

  const contentRange = countRes.headers.get("content-range") ?? "";
  const total = parseInt(contentRange.split("/")[1] ?? "0", 10);
  const count = Number.isFinite(total) ? total : 0;

  if (count >= opts.limit) {
    return {
      allowed: false,
      count,
      limit: opts.limit,
      windowSeconds: opts.windowSeconds,
      retryAfterSeconds: opts.windowSeconds,
    };
  }

  // Record this request. Best-effort — failure here doesn't block.
  try {
    await fetch(`${base}${REST_PATH}`, {
      method: "POST",
      headers: headers({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        bucket: opts.bucket,
        key: opts.key,
        ts: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error("rateLimit insert failed:", err);
  }

  return {
    allowed: true,
    count: count + 1,
    limit: opts.limit,
    windowSeconds: opts.windowSeconds,
  };
}

// Best-effort cleanup. Call opportunistically (every ~100 requests) to keep
// the table small. We don't await the result so it doesn't add latency.
export function reapOldRows(bucket: string, windowSeconds: number): void {
  const cutoffIso = new Date(
    Date.now() - windowSeconds * 2 * 1000,
  ).toISOString();
  const url = new URL(`${getUrl()}${REST_PATH}`);
  url.searchParams.set("bucket", `eq.${bucket}`);
  url.searchParams.set("ts", `lt.${cutoffIso}`);
  fetch(url.toString(), { method: "DELETE", headers: headers() }).catch(
    () => undefined,
  );
}

export function clientKey(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") {
    const first = fwd.split(",")[0];
    if (first) return first.trim();
  }
  if (Array.isArray(fwd) && fwd[0]) return fwd[0].split(",")[0]?.trim() ?? "unknown";
  const real = req.headers["x-real-ip"];
  if (typeof real === "string") return real;
  return "unknown";
}
