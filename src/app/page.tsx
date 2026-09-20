import LiveHome from "@/components/LiveHome";
import OfflineBanner from "@/components/OfflineBanner";
import { rpcBase } from "@/lib/api";
import {
  ensureIndexer,
  getGenesis,
  getHealth,
  indexerStatus,
  latestBlocks,
  latestTxs,
} from "@/lib/indexer";
import type { HomePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function HomePage() {
  ensureIndexer();
  const status = indexerStatus();
  const genesis = getGenesis();
  const rewardPerBlock = genesis?.parameters?.block_reward ?? "0";

  const initial: HomePayload = {
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

  return (
    <div className="space-y-5">
      <OfflineBanner online={status.online} error={status.lastError} rpcUrl={rpcBase()} />
      <LiveHome initial={initial} rewardPerBlock={rewardPerBlock} />
    </div>
  );
}
