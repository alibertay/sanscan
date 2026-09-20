import type { NextRequest } from "next/server";

import { json, ready } from "@/lib/api";
import { chartsData } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  ready();
  const raw = request.nextUrl.searchParams.get("window");
  const window = raw === "7d" || raw === "30d" ? raw : "24h";
  return json(chartsData(window));
}
