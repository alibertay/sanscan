import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import CopyButton from "@/components/CopyButton";
import JsonBlock from "@/components/JsonBlock";
import Pagination from "@/components/Pagination";
import TimeAgo from "@/components/TimeAgo";
import TokenTransfersTable from "@/components/TokenTransfersTable";
import TxsTable from "@/components/TxsTable";
import {
  ensureIndexer,
  enrichTokenEvents,
  getAddressStats,
  getAddressTokenHoldings,
  getGenesis,
  listTokenEvents,
  listTxs,
} from "@/lib/indexer";
import { formatNumber, formatSan, formatUtc, fromUnits, isAddress } from "@/lib/format";
import { formatTokenAmount } from "@/lib/tokens";
import { san, sanRequest } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  return { title: `Address ${address.slice(0, 12)}…` };
}

const kindTabs = [
  { key: "", label: "All" },
  { key: "transfer", label: "Transfers" },
  { key: "contract_call", label: "Contract Calls" },
  { key: "contract_deploy", label: "Contract Creations" },
  { key: "stake", label: "Staking" },
  { key: "governance", label: "Governance" },
];

type MainTab = "txs" | "tokens" | "nft";

export default async function AddressPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ page?: string; kind?: string; tab?: string }>;
}) {
  ensureIndexer();
  const { address } = await params;
  if (!isAddress(address)) notFound();
  const normalized = address.toLowerCase();

  const query = await searchParams;
  const tab: MainTab = query.tab === "tokens" || query.tab === "nft" ? query.tab : "txs";
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = 25;

  const [accountResponse, validatorsResponse, proofResponse] = await Promise.all([
    san.account(normalized),
    san.validators(),
    sanRequest<Record<string, unknown>>(`/proof/account/${normalized}`, { timeoutMs: 8000 }),
  ]);

  const account = accountResponse.ok ? accountResponse.data : null;
  const validator = validatorsResponse?.validators.find((row) => row.address === normalized) ?? null;
  const stats = getAddressStats(normalized);
  const holdings = getAddressTokenHoldings(normalized);

  const txs = listTxs((page - 1) * pageSize, pageSize, {
    address: normalized,
    kind: query.kind || undefined,
  });
  const tokenTransfers = listTokenEvents({
    address: normalized,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const nftTransfers = listTokenEvents({
    address: normalized,
    standard: "SANRC721",
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const tokenTotal = listTokenEvents({ address: normalized, offset: 0, limit: 1 }).total;
  const nftTotal = listTokenEvents({
    address: normalized,
    standard: "SANRC721",
    offset: 0,
    limit: 1,
  }).total;

  const genesis = getGenesis();
  const rewardPerBlock = genesis?.parameters?.block_reward ?? "0";
  const balance = account ? formatSan(fromUnits(account.balance_units)) : "—";
  const isContract = Boolean(stats && stats.deploys > 0);

  const mainTabs: { key: MainTab; label: string; count?: number }[] = [
    { key: "txs", label: "Transactions", count: txs.total },
    { key: "tokens", label: "Token Transfers", count: tokenTotal },
    { key: "nft", label: "NFT Transfers", count: nftTotal },
  ];

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Address" }, { label: normalized }]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mono break-all text-[15px] font-semibold text-ink-900">{normalized}</h1>
        <CopyButton value={normalized} />
        {isContract && <span className="badge badge-purple">Contract Creator</span>}
        {validator && <span className="badge badge-green">Validator</span>}
        {holdings.length > 0 && <span className="badge badge-blue">Token Holder</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="stat-label">Balance</p>
          <p className="stat-value">{balance} SAN</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Nonce</p>
          <p className="stat-value">{account?.nonce ?? "—"}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Indexed transactions</p>
          <p className="stat-value">{formatNumber(txs.total)}</p>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {stats ? `${stats.sent} sent · ${stats.received} received` : "no history yet"}
          </p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Validator stake</p>
          <p className="stat-value">{validator ? `${formatSan(validator.stake)} SAN` : "—"}</p>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {validator ? "active in validator set" : "not a validator"}
          </p>
        </div>
      </div>

      {holdings.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Token Holdings</h2>
            <span className="text-[12px] text-gray-500">{holdings.length} tokens</span>
          </div>
          <div className="table-scroll overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Standard</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((row) => (
                  <tr key={row.token.id}>
                    <td>
                      <Link className="link" href={`/token/${encodeURIComponent(row.token.id)}`}>
                        {row.token.symbol ?? row.token.id}
                      </Link>
                      {row.token.name && (
                        <span className="ml-1.5 text-gray-500">{row.token.name}</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-purple">{row.token.standard}</span>
                    </td>
                    <td>{formatTokenAmount(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">More Info</h2>
        </div>
        <div className="grid gap-x-8 p-4 md:grid-cols-2">
          <div>
            <div className="kv-row">
              <span className="kv-key">First seen</span>
              <span className="kv-value">
                {stats?.firstTs ? (
                  <>
                    <TimeAgo timestamp={stats.firstTs} />{" "}
                    <span className="text-gray-500">({formatUtc(stats.firstTs)})</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Last seen</span>
              <span className="kv-value">
                {stats?.lastTs ? (
                  <>
                    <TimeAgo timestamp={stats.lastTs} />{" "}
                    <span className="text-gray-500">({formatUtc(stats.lastTs)})</span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Total received</span>
              <span className="kv-value">
                {stats ? `${formatSan(fromUnits(stats.receivedUnits))} SAN` : "—"}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Total sent</span>
              <span className="kv-value">
                {stats ? `${formatSan(fromUnits(stats.sentUnits))} SAN` : "—"}
              </span>
            </div>
          </div>
          <div>
            <div className="kv-row">
              <span className="kv-key">Contracts deployed</span>
              <span className="kv-value">{stats?.deploys ?? 0}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Contract calls</span>
              <span className="kv-value">{stats?.contractCalls ?? 0}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Faucet</span>
              <span className="kv-value">
                <Link className="link" href={`/faucet?address=${normalized}`}>
                  Request testnet SAN →
                </Link>
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Block reward parameter</span>
              <span className="kv-value">{rewardPerBlock} units</span>
            </div>
          </div>
        </div>
      </section>

      {proofResponse.ok && proofResponse.data && (
        <section className="card p-4">
          <details>
            <summary className="cursor-pointer text-[13px] font-semibold text-ink-900">
              Merkle account proof (light-client verifiable)
            </summary>
            <div className="mt-3">
              <JsonBlock value={proofResponse.data} maxHeight={280} />
            </div>
          </details>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <div className="flex gap-1 overflow-x-auto">
            {mainTabs.map((item) => {
              const active = tab === item.key;
              const href =
                item.key === "txs"
                  ? `/address/${normalized}`
                  : `/address/${normalized}?tab=${item.key}`;
              return (
                <Link
                  key={item.key}
                  href={href}
                  className={`whitespace-nowrap rounded px-2.5 py-1.5 text-[12.5px] font-medium ${
                    active ? "bg-sky-50 text-link" : "text-gray-600 hover:bg-surface"
                  }`}
                >
                  {item.label}
                  {item.count !== undefined && (
                    <span className="ml-1 text-[11px] text-gray-400">
                      ({formatNumber(item.count)})
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          {tab === "txs" ? (
            <a className="btn btn-outline" href={`/api/export/txs?address=${normalized}`}>
              Download CSV
            </a>
          ) : (
            <a
              className="btn btn-outline"
              href={`/api/export/token-transfers?address=${normalized}`}
            >
              Download CSV
            </a>
          )}
        </div>

        {tab === "txs" && (
          <>
            <div className="flex gap-1 overflow-x-auto border-b border-line px-3 py-2">
              {kindTabs.map((item) => {
                const active = (query.kind ?? "") === item.key;
                const href = item.key
                  ? `/address/${normalized}?kind=${item.key}`
                  : `/address/${normalized}`;
                return (
                  <Link
                    key={item.key || "all"}
                    href={href}
                    className={`whitespace-nowrap rounded px-2.5 py-1.5 text-[12.5px] font-medium ${
                      active ? "bg-sky-50 text-link" : "text-gray-600 hover:bg-surface"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <TxsTable
              txs={txs.items}
              showBlock
              emptyMessage="No indexed transactions for this address yet."
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={txs.total}
              basePath={`/address/${normalized}`}
              query={{ kind: query.kind }}
            />
          </>
        )}

        {tab === "tokens" && (
          <>
            <TokenTransfersTable
              rows={enrichTokenEvents(tokenTransfers.items)}
              showToken
              emptyMessage="No token transfers for this address yet."
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={tokenTransfers.total}
              basePath={`/address/${normalized}`}
              query={{ tab: "tokens" }}
            />
          </>
        )}

        {tab === "nft" && (
          <>
            <TokenTransfersTable
              rows={enrichTokenEvents(nftTransfers.items)}
              showToken
              emptyMessage="No NFT transfers for this address yet."
            />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={nftTransfers.total}
              basePath={`/address/${normalized}`}
              query={{ tab: "nft" }}
            />
          </>
        )}
      </section>
    </div>
  );
}
