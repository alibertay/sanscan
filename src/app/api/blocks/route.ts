import type { NextRequest } from "next/server";

import { intParam, json, ready } from "@/lib/api";
import { listBlocks } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ready();
  const params = request.nextUrl.searchParams;
  const page = intParam(params.get("page"), 1, 1, 1_000_000);
  const limit = intParam(params.get("limit"), 25, 1, 100);
  const offset = (page - 1) * limit;
  const pageData = listBlocks(offset, limit);
  return json({ page, limit, total: pageData.total, blocks: pageData.items });
}
