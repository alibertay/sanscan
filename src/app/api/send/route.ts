import type { NextRequest } from "next/server";

import { errorJson, json, ready } from "@/lib/api";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  ready();

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("Request body must be a JSON object", 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorJson("Request body must be a JSON object", 400);
  }
  if (typeof payload.sender !== "string" || typeof payload.signature !== "string") {
    return errorJson("Transaction must carry 'sender' and 'signature'", 400);
  }

  const response = await san.submitTransaction(payload);
  if (!response.ok) {
    return errorJson(response.detail ?? "Node rejected the transaction", response.status || 502);
  }
  return json(response.data);
}
