"use client";

import { useEffect, useState } from "react";

import BlocksTable from "@/components/BlocksTable";
import StatCard from "@/components/StatCard";
import TxsTable from "@/components/TxsTable";
import { formatNumber } from "@/lib/format";
import type { HomePayload } from "@/lib/types";

export default function LiveHome({
  initial,
  rewardPerBlock = "0",
}: {
  initial: HomePayload;
  rewardPerBlock?: string;
}) {
  const [payload, setPayload] = useState<HomePayload>(initial);
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/home", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as HomePayload;
        if (!cancelled) setPayload(data);
      } catch {
        // keep the last good payload
      }
    }
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [live]);

  const health = payload.health;
  const blocks = payload.blocks;
  const txs = payload.txs;
  const window = blocks.length > 1 ? blocks[0].timestamp - blocks[blocks.length - 1].timestamp : 0;

  const feeVolume = txs.reduce((acc, tx) => acc + tx.fee, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[15px] font-semibold text-ink-900">
          SAN Network Overview
          <span className="ml-2 text-[12px] font-normal text-gray-500">
            chain {health?.chain_id ?? payload.chainId ?? "—"}
          </span>
        </h1>
        <button
          type="button"
          onClick={() => setLive((value) => !value)}
          className={`badge ${
            live ? "badge-green" : "badge-gray"
          } cursor-pointer`}
          title="Toggle auto-refresh"
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              live ? "animate-pulse bg-emerald-500" : "bg-gray-400"
            }`}
          />
          {live ? "Live · 5s" : "Paused"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Latest Height"
          value={formatNumber(health?.height ?? payload.syncedHeight)}
          sub={`Finalized ${formatNumber(health?.finalized_height ?? 0)}`}
          href="/blocks"
          icon="🧱"
        />
        <StatCard
          label="Transactions"
          value={formatNumber(payload.indexedTxs)}
          sub={`${formatNumber(payload.indexedBlocks)} blocks indexed`}
          href="/txs"
          icon="🔁"
        />
        <StatCard
          label="Mempool"
          value={formatNumber(health?.mempool ?? 0)}
          sub="Pending transactions"
          href="/pending"
          icon="⏳"
        />
        <StatCard
          label="Validators"
          value={formatNumber(health?.validators ?? 0)}
          sub={`${formatNumber(health?.peers ?? 0)} peers connected`}
          href="/validators"
          icon="🛡️"
        />
        <StatCard
          label="Base Fee"
          value={`${formatNumber(health?.base_fee ?? 0)} units`}
          sub="Per gas (burned)"
          icon="🔥"
        />
        <StatCard
          label="Indexed Addresses"
          value={formatNumber(payload.indexedAddresses)}
          sub={`${formatNumber(payload.indexedTxs)} txs observed`}
          icon="👥"
        />
        <StatCard
          label="Contracts"
          value={formatNumber(health?.contracts ?? 0)}
          sub="Deployed on SAN"
          href="/contracts"
          icon="📜"
        />
        <StatCard
          label="Recent Fees"
          value={`${(feeVolume / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "")} SAN`}
          sub={window > 0 ? `over ${Math.round(window)}s in last ${txs.length} txs` : "latest txs"}
          icon="⛽"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Latest Blocks</h2>
            <a className="link text-[13px]" href="/blocks">
              View all blocks →
            </a>
          </div>
          <BlocksTable blocks={blocks.slice(0, 8)} rewardPerBlock={rewardPerBlock} />
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Latest Transactions</h2>
            <a className="link text-[13px]" href="/txs">
              View all transactions →
            </a>
          </div>
          <TxsTable txs={txs.slice(0, 8)} showBlock={false} />
        </section>
      </div>
    </div>
  );
}
