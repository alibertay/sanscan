"use client";

import { useEffect, useState } from "react";

import { BarChart, LineChart } from "@/components/Charts";
import { formatSan, formatNumber, fromUnits } from "@/lib/format";
import type { ChartPayload } from "@/lib/types";

const windows: { key: ChartPayload["window"]; label: string }[] = [
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

export default function ChartsView() {
  const [window, setWindow] = useState<ChartPayload["window"]>("24h");
  const [data, setData] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/charts?window=${window}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as ChartPayload;
        if (!cancelled) setData(payload);
      } catch {
        // keep previous data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [window]);

  const points = data?.points ?? [];
  const totals = points.reduce(
    (acc, point) => ({
      blocks: acc.blocks + point.blocks,
      txs: acc.txs + point.txs,
      gasUsed: acc.gasUsed + point.gasUsed,
      addresses: Math.max(acc.addresses, point.addresses),
    }),
    { blocks: 0, txs: 0, gasUsed: 0, addresses: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[15px] font-semibold text-ink-900">Network Charts</h1>
        <div className="flex gap-1">
          {windows.map((item) => (
            <button
              key={item.key}
              onClick={() => setWindow(item.key)}
              className={`rounded border px-2.5 py-1 text-[12.5px] font-medium ${
                window === item.key
                  ? "border-link bg-link text-white"
                  : "border-line bg-white text-gray-600 hover:bg-surface"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="stat-label">Blocks</p>
          <p className="stat-value">{formatNumber(totals.blocks)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Transactions</p>
          <p className="stat-value">{formatNumber(totals.txs)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Gas used</p>
          <p className="stat-value">{formatNumber(totals.gasUsed)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Peak active addresses</p>
          <p className="stat-value">{formatNumber(totals.addresses)}</p>
        </div>
      </div>

      {data?.supply && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="card p-4">
            <p className="stat-label">Genesis premine</p>
            <p className="stat-value">{formatSan(fromUnits(data.supply.premine))} SAN</p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Block reward</p>
            <p className="stat-value">{formatSan(fromUnits(data.supply.blockReward))} SAN</p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Height</p>
            <p className="stat-value">{formatNumber(data.supply.height)}</p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Estimated supply</p>
            <p className="stat-value">{formatSan(fromUnits(data.supply.total))} SAN</p>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Blocks</h2>
            <span className="text-[12px] text-gray-500">
              {window === "24h" ? "hourly" : "daily"} buckets
            </span>
          </div>
          <div className="p-3">
            <BarChart points={points} metric="blocks" unit="blocks" />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Transactions</h2>
            {loading && <span className="text-[12px] text-gray-400">loading…</span>}
          </div>
          <div className="p-3">
            <BarChart points={points} metric="txs" color="#0784c3" unit="txs" />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Gas used by contract execution</h2>
          </div>
          <div className="p-3">
            <LineChart points={points} metric="gasUsed" color="#f5a623" unit="gas" />
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Active addresses</h2>
          </div>
          <div className="p-3">
            <LineChart points={points} metric="addresses" color="#00a186" unit="addresses" />
          </div>
        </section>
      </div>

      <p className="text-[12px] text-gray-500">
        Charts are computed from the local index (blocks and transactions sanscan has observed),
        so they fill in as the explorer syncs the chain.
      </p>
    </div>
  );
}
