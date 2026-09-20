import { json, ready } from "@/lib/api";
import {
  getHealth,
  indexerStatus,
  latestBlocks,
  latestTxs,
} from "@/lib/indexer";
import type { HomePayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const status = indexerStatus();
  const payload: HomePayload = {
    online: status.online,
    chainId: status.chainId,
    syncedHeight: status.syncedHeight,
    indexedBlocks: status.indexedBlocks,
    indexedTxs: status.indexedTxs,
    indexedAddresses: status.indexedAddresses,
    health: getHealth(),
    blocks: latestBlocks(8),
    txs: latestTxs(8),
    error: status.lastError,
  };
  return json(payload);
}
