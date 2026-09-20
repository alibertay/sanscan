import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import ContractConsole from "@/components/ContractConsole";
import CopyButton from "@/components/CopyButton";
import { AddressLink, TxLink } from "@/components/Links";
import Pagination from "@/components/Pagination";
import TimeAgo from "@/components/TimeAgo";
import TokenTransfersTable from "@/components/TokenTransfersTable";
import {
  ensureIndexer,
  enrichTokenEvents,
  getContractFunctions,
  getToken,
  getVerification,
  listTokenEvents,
  listTokenHolders,
  listTokenInventory,
} from "@/lib/indexer";
import { formatNumber, shortHash } from "@/lib/format";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const token = getToken(id);
  return { title: token?.symbol ? `${token.symbol} (${id})` : `Token ${id}` };
}

const TABS = ["transfers", "holders", "inventory", "code", "read", "write"] as const;
type Tab = (typeof TABS)[number];

async function liveMetadata(contractId: string) {
  async function call(functionName: string) {
    const response = await san.queryContract(contractId, functionName, []);
    return response.ok ? response.data?.result : null;
  }
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    call("name"),
    call("symbol"),
    call("decimals"),
    call("totalSupply"),
  ]);
  return { name, symbol, decimals, totalSupply };
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default async function TokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  ensureIndexer();
  const { id } = await params;
  const query = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(query.tab ?? "")
    ? (query.tab as Tab)
    : "transfers";
  const page = Math.max(Number(query.page) || 1, 1);
  const pageSize = 25;

  const token = getToken(id);
  const verification = getVerification(id);
  const deployedResponse = await san.contracts();
  const deployed = deployedResponse.ok
    ? (deployedResponse.data?.contracts ?? []).includes(id)
    : false;

  if (!token && !deployed) notFound();

  const live = !token || !token.name ? await liveMetadata(id) : null;
  const name = token?.name ?? (typeof live?.name === "string" ? live.name : null);
  const symbol = token?.symbol ?? (typeof live?.symbol === "string" ? live.symbol : null);
  const totalSupply =
    token?.totalSupply ??
    (live?.totalSupply !== null && live?.totalSupply !== undefined
      ? String(live.totalSupply)
      : null);
  const functions = getContractFunctions(id);

  const transfers = listTokenEvents({
    contract: id,
    offset: (page - 1) * pageSize,
    limit: pageSize,
  });
  const holders = listTokenHolders(id, (page - 1) * pageSize, pageSize);
  const inventory = listTokenInventory(id, (page - 1) * pageSize, pageSize);

  const basePath = `/token/${encodeURIComponent(id)}`;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Tokens", href: "/tokens" },
          { label: symbol ?? id },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[17px] font-semibold text-ink-900">
          {name ?? id} {symbol && <span className="text-gray-500">({symbol})</span>}
        </h1>
        {token?.standard && <span className="badge badge-purple">{token.standard}</span>}
        {verification ? (
          <span className="badge badge-green">✓ Verified source</span>
        ) : (
          <Link className="badge badge-orange" href={`/verify-contract?contract=${encodeURIComponent(id)}`}>
            Verify & Publish
          </Link>
        )}
        {token?.deployBlock !== null && token?.deployBlock !== undefined && (
          <span className="text-[12px] text-gray-500">
            Contract{" "}
            <Link className="link mono" href={`/contract/${encodeURIComponent(id)}`}>
              {id}
            </Link>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="card p-4">
          <p className="stat-label">Total supply</p>
          <p className="stat-value">{formatNumber(totalSupply ?? "—")}</p>
          {token?.decimals !== null && token?.decimals !== undefined && (
            <p className="mt-0.5 text-[12px] text-gray-500">decimals {token.decimals}</p>
          )}
        </div>
        <div className="card p-4">
          <p className="stat-label">Holders</p>
          <p className="stat-value">{formatNumber(holders.total)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Transfers</p>
          <p className="stat-value">{formatNumber(transfers.total)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Deployer</p>
          <p className="stat-value truncate">
            {token?.deployer ? (
              <AddressLink address={token.deployer} size={6} />
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Deployed</p>
          <p className="stat-value">
            {token?.deployTimestamp ? <TimeAgo timestamp={token.deployTimestamp} /> : "—"}
          </p>
        </div>
      </div>

      <section className="card">
        <div className="card-header">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.filter((item) => item !== "inventory" || token?.standard === "SANRC721").map(
              (item) => (
                <Link
                  key={item}
                  href={`${basePath}?tab=${item}`}
                  className={`rounded px-2.5 py-1.5 text-[12.5px] font-medium capitalize ${
                    tab === item ? "bg-sky-50 text-link" : "text-gray-600 hover:bg-surface"
                  }`}
                >
                  {item}
                </Link>
              ),
            )}
          </div>
          <div className="flex items-center gap-2">
            <a
              className="btn btn-outline"
              href={`/api/export/token-transfers?contract=${encodeURIComponent(id)}`}
            >
              Download CSV
            </a>
          </div>
        </div>

        {tab === "transfers" && (
          <>
            <TokenTransfersTable rows={enrichTokenEvents(transfers.items)} />
            <Pagination
              page={page}
              pageSize={pageSize}
              total={transfers.total}
              basePath={basePath}
              query={{ tab }}
            />
          </>
        )}

        {tab === "holders" && (
          <div className="table-scroll overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Address</th>
                  <th>Balance</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {holders.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-gray-500">
                      No holders indexed yet.
                    </td>
                  </tr>
                ) : (
                  holders.items.map((holder, index) => (
                    <tr key={holder.address}>
                      <td className="text-gray-500">{(page - 1) * pageSize + index + 1}</td>
                      <td>
                        <AddressLink address={holder.address} size={10} />
                      </td>
                      <td>{formatNumber(holder.balance)}</td>
                      <td>{holder.share}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={holders.total}
              basePath={basePath}
              query={{ tab }}
            />
          </div>
        )}

        {tab === "inventory" && (
          <div className="table-scroll overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Token ID</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {inventory.items.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-8 text-center text-gray-500">
                      No tokens minted yet.
                    </td>
                  </tr>
                ) : (
                  inventory.items.map((item) => (
                    <tr key={item.tokenId}>
                      <td className="mono">#{item.tokenId}</td>
                      <td>
                        <AddressLink address={item.owner} size={10} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={inventory.total}
              basePath={basePath}
              query={{ tab }}
            />
          </div>
        )}

        {tab === "code" && (
          <div className="p-4">
            {verification ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-gray-600">
                  <span className="badge badge-green">Exact match</span>
                  <span>Compiler: {verification.compiler}</span>
                  <span>
                    Deploy tx: <TxLink txId={verification.deployTxId} size={8} />
                  </span>
                  <span>
                    Source hash: <span className="mono">{shortHash(verification.sourceHash, 10)}</span>{" "}
                    <CopyButton value={verification.sourceHash} />
                  </span>
                </div>
                <pre className="max-h-[520px] overflow-auto rounded-md border border-line bg-ink-900 p-3 text-[12px] leading-relaxed text-sky-100">
                  {verification.source}
                </pre>
              </>
            ) : (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                <p className="font-semibold">Source code not verified</p>
                <p className="mt-1">
                  Verify the contract to publish its PENA source. Verification compares your source
                  with the code signed in the deployment transaction.
                </p>
                <Link
                  className="btn btn-primary mt-3"
                  href={`/verify-contract?contract=${encodeURIComponent(id)}`}
                >
                  Verify & Publish
                </Link>
              </div>
            )}

            {functions.length > 0 && (
              <div className="mt-4">
                <p className="text-[13px] font-semibold text-ink-900">
                  Detected functions ({functions.length})
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {functions.map((name) => (
                    <span key={name} className="badge badge-gray mono">
                      {name}()
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "read" && (
          <div className="p-4">
            <ContractConsole contractId={id} functions={functions} mode="read" />
          </div>
        )}

        {tab === "write" && (
          <div className="p-4">
            <ContractConsole contractId={id} functions={functions} mode="write" />
            {token && (
              <p className="mt-3 text-[12px] text-gray-500">
                Tip: moving SANRC20 balances means calling{" "}
                <span className="mono">transfer(from, to, amount)</span> as the sender, or{" "}
                <span className="mono">transferFrom(spender, from, to, amount)</span> after an
                approval.
              </p>
            )}
          </div>
        )}
      </section>

      {token && token.holders > 0 && tab !== "holders" && (
        <section className="card p-4 text-[13px] text-gray-600">
          Top holder:{" "}
          {holders.items[0] ? (
            <>
              <AddressLink address={holders.items[0].address} size={10} /> with{" "}
              {formatNumber(holders.items[0].balance)} raw units
            </>
          ) : (
            "—"
          )}
        </section>
      )}
    </div>
  );
}
