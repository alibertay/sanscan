import type { NextRequest } from "next/server";

import { intParam, json, ready } from "@/lib/api";
import { listTxs } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ready();
  const params = request.nextUrl.searchParams;
  const page = intParam(params.get("page"), 1, 1, 1_000_000);
  const limit = intParam(params.get("limit"), 25, 1, 100);
  const address = params.get("address") ?? undefined;
  const kind = params.get("kind") ?? undefined;
  const contract = params.get("contract") ?? undefined;
  const blockRaw = params.get("block");
  const block = blockRaw !== null && blockRaw !== "" ? Number(blockRaw) : undefined;

  const data = listTxs((page - 1) * limit, limit, {
    address: address ?? undefined,
    kind: kind ?? undefined,
    contract: contract ?? undefined,
    block: Number.isInteger(block) ? block : undefined,
  });

  return json({ page, limit, total: data.total, txs: data.items });
}
