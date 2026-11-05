// Minimal GA4 Analytics Data API v1beta client for the admin Stats page (copied from the TBDC /web dashboard, tbdc/ads-monitor/src/ga4.ts).
//
// No SDK: a service-account JWT is minted with node:crypto and exchanged for an
// access token, then runReport is called over fetch. That keeps the dependency
// list unchanged and works the same under Bun locally and in CI.
//
// Key lookup order: GA4_SA_KEY (the JSON itself, as CI stores it), then
// GA4_SA_KEY_FILE (a path), then ~/.config/tbdc/ga4-sa.json.
import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function loadKey(): ServiceAccount {
  const inline = process.env.GA4_SA_KEY?.trim();
  if (inline) return JSON.parse(inline) as ServiceAccount;
  const path = process.env.GA4_SA_KEY_FILE || join(homedir(), ".config", "tbdc", "ga4-sa.json");
  if (!existsSync(path)) {
    throw new Error(`No GA4 service-account key: set GA4_SA_KEY or GA4_SA_KEY_FILE, or put it at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

let cached: { token: string; exp: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token;
  const sa = loadKey();
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(sa.private_key);
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${head}.${body}.${b64url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`GA4 token exchange failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: now + j.expires_in };
  return j.access_token;
}

export interface ReportRequest {
  dateRanges: { startDate: string; endDate: string; name?: string }[];
  dimensions?: { name: string }[];
  metrics: { name: string }[];
  dimensionFilter?: unknown;
  limit?: number;
  orderBys?: unknown[];
  keepEmptyRows?: boolean;
}

/** One row with dimension and metric values keyed by their API names. */
export type Row = Record<string, string>;

// The Data API allows 10 concurrent requests per property; the fetch script fires
// ~16 at once, so without a gate about a third of them came back 429 and their
// cards were zero-filled. A small semaphore plus a retry on 429/5xx keeps every
// card honest without serialising the whole run.
const MAX_IN_FLIGHT = 4;
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS_MS = [1000, 3000, 7000];
let inFlight = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
}

function release(): void {
  inFlight--;
  waiting.shift()?.();
}

export async function runReport(property: string, req: ReportRequest): Promise<Row[]> {
  await acquire();
  try {
    return await runReportOnce(property, req);
  } finally {
    release();
  }
}

async function runReportOnce(property: string, req: ReportRequest): Promise<Row[]> {
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ limit: 10000, ...req }),
    });
    const delay = RETRY_DELAYS_MS[attempt];
    if (res.ok || !RETRY_STATUSES.has(res.status) || delay === undefined) break;
    await res.text(); // drain before retrying
    await new Promise((r) => setTimeout(r, delay));
  }
  if (!res!.ok) throw new Error(`GA4 runReport failed: ${res!.status} ${await res!.text()}`);
  const j = (await res!.json()) as {
    dimensionHeaders?: { name: string }[];
    metricHeaders?: { name: string }[];
    rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  };
  const dh = (j.dimensionHeaders ?? []).map((h) => h.name);
  const mh = (j.metricHeaders ?? []).map((h) => h.name);
  // With more than one date range GA adds a synthetic "dateRange" dimension.
  return (j.rows ?? []).map((r) => {
    const o: Row = {};
    (r.dimensionValues ?? []).forEach((v, i) => (o[dh[i] ?? `d${i}`] = v.value));
    (r.metricValues ?? []).forEach((v, i) => (o[mh[i] ?? `m${i}`] = v.value));
    return o;
  });
}
