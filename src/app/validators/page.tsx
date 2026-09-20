import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import JsonBlock from "@/components/JsonBlock";
import { AddressLink } from "@/components/Links";
import TimeAgo from "@/components/TimeAgo";
import { ensureIndexer, getHealth, listTopAddresses } from "@/lib/indexer";
import { formatNumber, formatSan, fromUnits, percent } from "@/lib/format";
import { san } from "@/lib/rpc";

export const metadata: Metadata = { title: "Validators" };
export const dynamic = "force-dynamic";

export default async function ValidatorsPage() {
  ensureIndexer();
  const [validators, evidence] = await Promise.all([san.validators(), san.evidence()]);
  const health = getHealth();
  const topAddresses = listTopAddresses(10);

  const rows = validators?.validators ?? [];
  const totalStake = validators?.total_stake_units ?? 0;
  const minStake = validators?.min_stake_units ?? 0;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Validators" }]} />

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="stat-label">Active validators</p>
          <p className="stat-value">{formatNumber(rows.length)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Total stake</p>
          <p className="stat-value">{formatSan(fromUnits(totalStake))} SAN</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Min stake</p>
          <p className="stat-value">{formatSan(fromUnits(minStake))} SAN</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Finalized height</p>
          <p className="stat-value">{formatNumber(validators?.finalized_height ?? 0)}</p>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Active Validator Set</h2>
          <span className="text-[12px] text-gray-500">
            base fee {formatNumber(validators?.base_fee ?? health?.base_fee ?? 0)} · burned{" "}
            {formatSan(fromUnits(validators?.total_burned ?? 0))} SAN
          </span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Address</th>
                <th>Stake</th>
                <th>Share</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-500">
                    No validator is active yet. Deposit stake from a wallet (Wallet → Validator
                    Actions) to join the set.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={row.address}>
                    <td className="text-gray-500">{index + 1}</td>
                    <td>
                      <AddressLink address={row.address} size={10} />
                    </td>
                    <td>{formatSan(row.stake)} SAN</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-28 overflow-hidden rounded bg-gray-100">
                          <div
                            className="h-full rounded bg-success"
                            style={{
                              width: `${Math.min(
                                Number(percent(row.stake_units, totalStake).replace("%", "")) || 0,
                                100,
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-[12px] text-gray-500">
                          {percent(row.stake_units, totalStake)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-green">Active</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Consensus Parameters</h2>
          </div>
          <div className="p-4">
            <div className="kv-row">
              <span className="kv-key">Unbonding period</span>
              <span className="kv-value">{validators?.unbonding_period ?? "—"} blocks</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Slash share</span>
              <span className="kv-value">
                {validators ? `${(validators.slash_bps / 100).toFixed(2)}%` : "—"}
              </span>
            </div>
            {validators?.parameters &&
              Object.entries(validators.parameters).map(([key, value]) => (
                <div className="kv-row" key={key}>
                  <span className="kv-key mono">{key}</span>
                  <span className="kv-value">{String(value)}</span>
                </div>
              ))}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Equivocation Evidence</h2>
            <span className="text-[12px] text-gray-500">{evidence?.evidence?.length ?? 0} records</span>
          </div>
          <div className="p-4">
            {evidence && evidence.evidence.length > 0 ? (
              <JsonBlock value={evidence.evidence} maxHeight={280} />
            ) : (
              <p className="text-[13px] text-gray-500">
                No double-voting evidence collected — validators are behaving.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Most active indexed addresses</h2>
          <span className="text-[12px] text-gray-500">by indexed volume</span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Address</th>
                <th>Txns</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {topAddresses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    Nothing indexed yet.
                  </td>
                </tr>
              ) : (
                topAddresses.map((stats, index) => (
                  <tr key={stats.address}>
                    <td className="text-gray-500">{index + 1}</td>
                    <td>
                      <AddressLink address={stats.address} size={10} />
                    </td>
                    <td>{(stats.sent + stats.received).toLocaleString()}</td>
                    <td>
                      {formatSan(
                        fromUnits(BigInt(stats.sentUnits) + BigInt(stats.receivedUnits)),
                      )}{" "}
                      SAN
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {health && (
        <p className="text-[12px] text-gray-500">
          Last health snapshot{" "}
          <TimeAgo timestamp={Math.floor(Date.now() / 1000)} /> — tip{" "}
          <span className="mono">{health.tip_hash.slice(0, 18)}…</span>
        </p>
      )}
    </div>
  );
}
