import type { Metadata } from "next";
import Link from "next/link";

import Breadcrumb from "@/components/Breadcrumb";
import GasCalculator from "@/components/GasCalculator";
import TimeAgo from "@/components/TimeAgo";
import { ensureIndexer, gasStats } from "@/lib/indexer";
import { formatNumber, formatSan, fromUnits } from "@/lib/format";

export const metadata: Metadata = { title: "Gas Tracker" };
export const dynamic = "force-dynamic";

export default function GasTrackerPage() {
  ensureIndexer();
  const stats = gasStats();

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Gas Tracker" }]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="stat-label">Base fee (burned)</p>
          <p className="stat-value">{formatNumber(stats.baseFee)} units</p>
          <p className="mt-0.5 text-[12px] text-gray-500">per gas unit</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Min gas price</p>
          <p className="stat-value">{formatNumber(stats.minGasPrice)}</p>
          <p className="mt-0.5 text-[12px] text-gray-500">protocol minimum</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Avg gas price paid</p>
          <p className="stat-value">
            {stats.averageGasPrice === null ? "—" : formatNumber(stats.averageGasPrice)}
          </p>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {formatNumber(stats.executionCount)} executions indexed
          </p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Median tx fee</p>
          <p className="stat-value">{stats.medianFee ? `${formatSan(stats.medianFee)} SAN` : "—"}</p>
          <p className="mt-0.5 text-[12px] text-gray-500">
            total collected {formatSan(fromUnits(stats.collectedFeeUnits))} SAN
          </p>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Fee Calculator</h2>
          <span className="text-[12px] text-gray-500">
            deterministic fee = size × rate + gas limit × gas price
          </span>
        </div>
        <GasCalculator baseFee={stats.baseFee} />
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Recent blocks</h2>
          <span className="text-[12px] text-gray-500">
            {formatNumber(stats.gasUsed)} total gas used by indexed executions
          </span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Block</th>
                <th>Age</th>
                <th>Txns</th>
                <th>Gas used</th>
                <th>Fees</th>
              </tr>
            </thead>
            <tbody>
              {stats.latestBlocks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    Waiting for blocks…
                  </td>
                </tr>
              ) : (
                stats.latestBlocks.map((block) => (
                  <tr key={block.height}>
                    <td>
                      <Link className="link mono" href={`/block/${block.height}`}>
                        {block.height}
                      </Link>
                    </td>
                    <td className="text-gray-500">
                      <TimeAgo timestamp={block.timestamp} />
                    </td>
                    <td>{block.txs}</td>
                    <td>{formatNumber(block.gasUsed)}</td>
                    <td>{formatSan(fromUnits(block.feeUnits))} SAN</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
