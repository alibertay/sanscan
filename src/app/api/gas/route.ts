import { json, ready } from "@/lib/api";
import { gasStats } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  return json(gasStats());
}
