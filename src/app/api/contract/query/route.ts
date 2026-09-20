import type { NextRequest } from "next/server";

import { errorJson, json, ready } from "@/lib/api";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  ready();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("Request body must be valid JSON", 400);
  }

  const contractId = typeof body.contract_id === "string" ? body.contract_id : "";
  const functionName = typeof body.function_name === "string" ? body.function_name : "";
  const params = Array.isArray(body.params) ? body.params : [];

  if (!contractId || !functionName) {
    return errorJson("'contract_id' and 'function_name' are required", 400);
  }

  const response = await san.queryContract(contractId, functionName, params);
  if (!response.ok) {
    return errorJson(response.detail ?? "Contract query failed", response.status || 502);
  }
  return json(response.data);
}
