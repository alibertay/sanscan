import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import CopyButton from "@/components/CopyButton";
import { FinalityBadge } from "@/components/Badges";
import { AddressLink } from "@/components/Links";
import TimeAgo from "@/components/TimeAgo";
import TxsTable from "@/components/TxsTable";
import {
  ensureIndexer,
  getBlock,
  getGenesis,
  getHealth,
  indexerStatus,
  listTxs,
} from "@/lib/indexer";
import { formatSan, formatUtc, fromUnits } from "@/lib/format";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ height: string }>;
}): Promise<Metadata> {
  const { height } = await params;
  return { title: `Block ${height}` };
}

export default async function BlockPage({ params }: { params: Promise<{ height: string }> }) {
  ensureIndexer();
  const { height: rawHeight } = await params;
  const height = Number(rawHeight);
  if (!Number.isInteger(height) || height < 0) notFound();

  const indexed = getBlock(height);
  const live = await san.block(height);
  if (!indexed && !live) notFound();

  const txs = listTxs(0, 500, { block: height }).items;
  const status = indexerStatus();
  const health = getHealth();
  const finalized = (health?.finalized_height ?? 0) >= height;

  const hash = indexed?.hash ?? live?.current_block_hash ?? "";
  const parent = indexed?.parent ?? live?.previous_block_hash ?? "";
  const timestamp = indexed?.timestamp ?? live?.timestamp ?? 0;
  const proposer = indexed?.proposerAddress ?? "";
  const rewardAddress = indexed?.rewardAddress ?? live?.reward_address ?? null;
  const subsidy = BigInt(getGenesis()?.parameters?.block_reward ?? "0");
  const reward = indexed
    ? formatSan(fromUnits(subsidy + BigInt(indexed.feeUnits || "0")))
    : "—";

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Blocks", href: "/blocks" }, { label: `#${height}` }]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[16px] font-semibold text-ink-900">
          Block #{height.toLocaleString()}
          <span className="ml-2 align-middle">
            <FinalityBadge finalized={finalized} />
          </span>
        </h1>
        <div className="flex gap-2 text-[13px]">
          {height > 0 && (
            <Link className="link" href={`/block/${height - 1}`}>
              ‹ Prev
            </Link>
          )}
          <Link className="link" href={`/blocks`}>
            All blocks
          </Link>
          {height < (status.syncedHeight ?? 0) && (
            <Link className="link" href={`/block/${height + 1}`}>
              Next ›
            </Link>
          )}
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Block Overview</h2>
        </div>
        <div className="p-4">
          <div className="kv-row">
            <span className="kv-key">Block Height</span>
            <span className="kv-value">{height.toLocaleString()}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Timestamp</span>
            <span className="kv-value">
              <TimeAgo timestamp={timestamp} /> <span className="text-gray-500">({formatUtc(timestamp)})</span>
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Transactions</span>
            <span className="kv-value">
              {indexed?.txCount ?? live?.transactions?.length ?? 0} transactions
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Proposer</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              {proposer ? (
                <>
                  <AddressLink address={proposer} size={10} />
                  <CopyButton value={proposer} />
                </>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Reward address</span>
            <span className="kv-value">
              <AddressLink address={rewardAddress ?? undefined} size={10} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Block reward</span>
            <span className="kv-value">{reward} SAN (subsidy + tips)</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Round</span>
            <span className="kv-value">{indexed?.round ?? live?.round ?? 0}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Hash</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              <span className="mono">{hash}</span>
              <CopyButton value={hash} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Parent Hash</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              <Link className="link mono break-all" href={`/search?q=${parent}`}>
                {parent}
              </Link>
              <CopyButton value={parent} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Tx Root</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              <span className="mono break-all">{indexed?.txRoot ?? live?.tx_root ?? "—"}</span>
              <CopyButton value={indexed?.txRoot ?? live?.tx_root ?? ""} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">State Root</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              <span className="mono break-all">{indexed?.stateRoot ?? live?.state_root ?? "—"}</span>
              <CopyButton value={indexed?.stateRoot ?? live?.state_root ?? ""} />
            </span>
          </div>
          {live?.validator_signature && (
            <div className="kv-row">
              <span className="kv-key">Validator Signature</span>
              <span className="kv-value">
                <span className="mono block max-h-24 overflow-hidden break-all">
                  {live.validator_signature.slice(0, 160)}…
                </span>
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Transactions in this block</h2>
          <span className="text-[12px] text-gray-500">{txs.length} indexed</span>
        </div>
        <TxsTable txs={txs} showBlock={false} />
      </section>
    </div>
  );
}
