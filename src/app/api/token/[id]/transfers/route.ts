import type { NextRequest } from "next/server";

import { intParam, json, ready } from "@/lib/api";
import { listTokenEvents } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  ready();
  const { id } = await context.params;
  const params = request.nextUrl.searchParams;
  const page = intParam(params.get("page"), 1, 1, 1_000_000);
  const limit = intParam(params.get("limit"), 25, 1, 100);
  const address = params.get("address") ?? undefined;
  const data = listTokenEvents({
    contract: id,
    address,
    offset: (page - 1) * limit,
    limit,
  });
  return json({ page, limit, total: data.total, transfers: data.items });
}
