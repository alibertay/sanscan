import { json, ready } from "@/lib/api";
import { getGenesis, getHealth, indexerStatus } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const status = indexerStatus();
  const health = getHealth();
  const genesis = getGenesis();
  return json({
    ...status,
    chainId: status.chainId || health?.chain_id || genesis?.chain_id || "",
    health,
    genesis,
  });
}
