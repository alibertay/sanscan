import type { NextRequest } from "next/server";

import { intParam, json, ready } from "@/lib/api";
import { topAccounts } from "@/lib/accounts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ready();
  const limit = intParam(request.nextUrl.searchParams.get("limit"), 50, 1, 200);
  return json({ accounts: await topAccounts(limit) });
}
