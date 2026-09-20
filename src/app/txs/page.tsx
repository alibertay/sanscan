import type { Metadata } from "next";
import Link from "next/link";

import Breadcrumb from "@/components/Breadcrumb";
import OfflineBanner from "@/components/OfflineBanner";
import Pagination from "@/components/Pagination";
import TxsTable from "@/components/TxsTable";
import { rpcBase } from "@/lib/api";
import { ensureIndexer, indexerStatus, listTxs } from "@/lib/indexer";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

const tabs = [
  { key: "", label: "All" },
  { key: "transfer", label: "Transfers" },
  { key: "contract_call", label: "Contract Calls" },
  { key: "contract_deploy", label: "Contract Creation" },
  { key: "stake", label: "Staking" },
  { key: "governance", label: "Governance" },
];

export default async function TxsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; kind?: string; block?: string; address?: string }>;
}) {
  ensureIndexer();
  const params = await searchParams;
  const page = Math.max(Number(params.page) || 1, 1);
  const pageSize = 25;
  const block = params.block ? Number(params.block) : undefined;

  const data = listTxs((page - 1) * pageSize, pageSize, {
    kind: params.kind || undefined,
    block: Number.isInteger(block) ? block : undefined,
    address: params.address || undefined,
  });
  const status = indexerStatus();

  const query: Record<string, string | undefined> = {
    kind: params.kind,
    block: params.block,
    address: params.address,
  };

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Transactions" }]} />
      <OfflineBanner online={status.online} error={status.lastError} rpcUrl={rpcBase()} />

      <section className="card">
        <div className="card-header">
          <h1 className="card-title">
            Transactions
            {block !== undefined && Number.isInteger(block) && (
              <span className="ml-2 text-[12px] font-normal text-gray-500">
                in block <Link className="link" href={`/block/${block}`}>#{block}</Link>
              </span>
            )}
            {params.address && (
              <span className="ml-2 text-[12px] font-normal text-gray-500">
                for <Link className="link" href={`/address/${params.address}`}>{params.address}</Link>
              </span>
            )}
          </h1>
          <a
            className="btn btn-outline"
            href={`/api/export/txs?${new URLSearchParams({
              ...(params.kind ? { kind: params.kind } : {}),
              ...(params.block ? { block: params.block } : {}),
              ...(params.address ? { address: params.address } : {}),
            }).toString()}`}
          >
            Download CSV
          </a>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
          {tabs.map((tab) => {
            const active = (params.kind ?? "") === tab.key;
            const tabParams = new URLSearchParams();
            if (tab.key) tabParams.set("kind", tab.key);
            if (params.block) tabParams.set("block", params.block);
            if (params.address) tabParams.set("address", params.address);
            const suffix = tabParams.toString();
            const href = suffix ? `/txs?${suffix}` : "/txs";
            return (
              <Link
                key={tab.key || "all"}
                href={href}
                className={`whitespace-nowrap rounded px-2.5 py-1.5 text-[12.5px] font-medium ${
                  active ? "bg-sky-50 text-link" : "text-gray-600 hover:bg-surface"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        <TxsTable txs={data.items} showBlock />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          basePath="/txs"
          query={query}
        />
      </section>
    </div>
  );
}
