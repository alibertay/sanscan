import type { NextRequest } from "next/server";

import { errorJson, json, ready } from "@/lib/api";
import { addFaucetGrant, listFaucetGrants } from "@/lib/indexer";
import { isAddress } from "@/lib/format";
import { trustProxy } from "@/lib/env";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** null = unknown, false = the node answered 404 (faucet disabled). */
let faucetEnabled: boolean | null = null;

const hits = new Map<string, number[]>();
const IP_LIMIT = 5;
const IP_WINDOW_MS = 60_000;

function clientIp(request: NextRequest): string {
  if (trustProxy()) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const real = request.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "local";
}

function allowIp(ip: string): boolean {
  const now = Date.now();
  const bucket = (hits.get(ip) ?? []).filter((ts) => now - ts < IP_WINDOW_MS);
  if (bucket.length >= IP_LIMIT) {
    hits.set(ip, bucket);
    return false;
  }
  bucket.push(now);
  hits.set(ip, bucket);
  return true;
}

export async function GET() {
  ready();
  return json({ grants: listFaucetGrants(25), enabled: faucetEnabled });
}

export async function POST(request: NextRequest) {
  ready();

  if (!allowIp(clientIp(request))) {
    return errorJson("Faucet rate limit exceeded for this IP, slow down.", 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("Request body must be valid JSON", 400);
  }

  const address = typeof body.address === "string" ? body.address.trim() : "";
  if (!isAddress(address)) {
    return errorJson("A valid 0x address is required", 400);
  }
  // Omit the amount entirely when the caller did not set one: the node then
  // applies its own configured default (0 would be rejected as non-positive).
  const amount =
    typeof body.amount === "string" || typeof body.amount === "number"
      ? body.amount
      : undefined;

  const response = await san.faucet(address.toLowerCase(), amount);

  if (!response.ok) {
    if (response.status === 404) faucetEnabled = false;
    return errorJson(response.detail ?? "Faucet request failed", response.status || 502);
  }

  faucetEnabled = true;
  const data = response.data ?? {};
  addFaucetGrant({
    address: address.toLowerCase(),
    amount: String(data.amount ?? amount ?? ""),
    txId: typeof data.tx_id === "string" ? data.tx_id : null,
    ts: Date.now(),
    status: String(data.status ?? "pooled"),
  });
  return json(data);
}
