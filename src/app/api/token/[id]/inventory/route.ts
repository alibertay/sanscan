import type { NextRequest } from "next/server";

import { intParam, json, ready } from "@/lib/api";
import { getToken, listTokenInventory } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  ready();
  const { id } = await context.params;
  const token = getToken(id);
  if (token && token.standard !== "SANRC721") {
    return json({ page: 1, limit: 0, total: 0, items: [] });
  }
  const page = intParam(request.nextUrl.searchParams.get("page"), 1, 1, 1_000_000);
  const limit = intParam(request.nextUrl.searchParams.get("limit"), 25, 1, 100);
  const data = listTokenInventory(id, (page - 1) * limit, limit);
  return json({ page, limit, total: data.total, items: data.items });
}
