import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import BlocksTable from "@/components/BlocksTable";
import OfflineBanner from "@/components/OfflineBanner";
import Pagination from "@/components/Pagination";
import { rpcBase } from "@/lib/api";
import { ensureIndexer, getGenesis, indexerStatus, listBlocks } from "@/lib/indexer";

export const metadata: Metadata = { title: "Blocks" };
export const dynamic = "force-dynamic";

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  ensureIndexer();
  const { page: rawPage } = await searchParams;
  const page = Math.max(Number(rawPage) || 1, 1);
  const pageSize = 25;
  const data = listBlocks((page - 1) * pageSize, pageSize);
  const status = indexerStatus();
  const rewardPerBlock = getGenesis()?.parameters?.block_reward ?? "0";

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Blocks" }]} />
      <OfflineBanner online={status.online} error={status.lastError} rpcUrl={rpcBase()} />

      <section className="card">
        <div className="card-header">
          <h1 className="card-title">
            Blocks
            <span className="ml-2 text-[12px] font-normal text-gray-500">
              height {status.syncedHeight >= 0 ? status.syncedHeight.toLocaleString() : "—"}
            </span>
          </h1>
        </div>
        <BlocksTable blocks={data.items} rewardPerBlock={rewardPerBlock} showHash />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          basePath="/blocks"
        />
      </section>
    </div>
  );
}
