import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import ContractConsole from "@/components/ContractConsole";
import CopyButton from "@/components/CopyButton";
import { AddressLink, TxLink } from "@/components/Links";
import TxsTable from "@/components/TxsTable";
import TokenTransfersTable from "@/components/TokenTransfersTable";
import TimeAgo from "@/components/TimeAgo";
import {
  ensureIndexer,
  enrichTokenEvents,
  getContractDeploy,
  getContractFunctions,
  getToken,
  getVerification,
  listTokenEvents,
  listTxs,
} from "@/lib/indexer";
import { shortHash } from "@/lib/format";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Contract ${id}` };
}

const TABS = ["code", "read", "write", "txs", "events"] as const;
type Tab = (typeof TABS)[number];

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  ensureIndexer();
  const { id } = await params;
  const query = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(query.tab ?? "")
    ? (query.tab as Tab)
    : "code";

  const response = await san.contracts();
  const ids = response.ok ? (response.data?.contracts ?? []) : [];
  const existsOnNode = ids.includes(id);
  const deployTx = getContractDeploy(id);
  const token = getToken(id);
  const verification = getVerification(id);
  const functions = getContractFunctions(id);

  const allTxs = listTxs(0, 100, { contract: id }).items;
  const events = listTokenEvents({ contract: id, offset: 0, limit: 50 });

  if (!existsOnNode && !deployTx && allTxs.length === 0 && !token) notFound();

  const basePath = `/contract/${encodeURIComponent(id)}`;

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Contracts", href: "/contracts" },
          { label: id },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[16px] font-semibold text-ink-900">
          Contract <span className="mono">{id}</span>
        </h1>
        {verification ? (
          <span className="badge badge-green">✓ Verified</span>
        ) : (
          <Link
            className="badge badge-orange"
            href={`/verify-contract?contract=${encodeURIComponent(id)}`}
          >
            Verify & Publish
          </Link>
        )}
        {token && (
          <Link className="badge badge-purple" href={`/token/${encodeURIComponent(id)}`}>
            {token.standard} token →
          </Link>
        )}
        {!existsOnNode && (
          <span className="badge badge-orange">Not deployed on the node now</span>
        )}
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Contract Overview</h2>
          <div className="flex gap-2">
            {verification && (
              <a
                className="btn btn-outline"
                href={`/api/export/token-transfers?contract=${encodeURIComponent(id)}`}
              >
                Token CSV
              </a>
            )}
          </div>
        </div>
        <div className="p-4">
          <div className="grid gap-x-8 md:grid-cols-2">
            <div>
              <div className="kv-row">
                <span className="kv-key">Contract ID</span>
                <span className="kv-value mono">{id}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Deployer</span>
                <span className="kv-value">
                  <AddressLink address={deployTx?.from} size={10} />
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Deployment transaction</span>
                <span className="kv-value">
                  <TxLink txId={deployTx?.id} size={12} />
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Deployed</span>
                <span className="kv-value">
                  {deployTx ? <TimeAgo timestamp={deployTx.timestamp} /> : "—"}
                </span>
              </div>
            </div>
            <div>
              <div className="kv-row">
                <span className="kv-key">Indexed interactions</span>
                <span className="kv-value">{allTxs.length}</span>
              </div>
              {token && (
                <>
                  <div className="kv-row">
                    <span className="kv-key">Token standard</span>
                    <span className="kv-value">{token.standard}</span>
                  </div>
                  <div className="kv-row">
                    <span className="kv-key">Holders / transfers</span>
                    <span className="kv-value">
                      {token.holders} / {token.transfers}
                    </span>
                  </div>
                </>
              )}
              {deployTx?.contractCodeHash && (
                <div className="kv-row">
                  <span className="kv-key">Deployed source hash</span>
                  <span className="kv-value flex items-center gap-2">
                    <span className="mono">{shortHash(deployTx.contractCodeHash, 10)}</span>
                    <CopyButton value={deployTx.contractCodeHash} />
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((item) => (
              <Link
                key={item}
                href={`${basePath}?tab=${item}`}
                className={`rounded px-2.5 py-1.5 text-[12.5px] font-medium uppercase ${
                  tab === item ? "bg-sky-50 text-link" : "text-gray-600 hover:bg-surface"
                }`}
              >
                {item === "txs" ? "Transactions" : item}
              </Link>
            ))}
          </div>
          {functions.length > 0 && (
            <span className="text-[12px] text-gray-500">{functions.length} functions detected</span>
          )}
        </div>

        {tab === "code" && (
          <div className="p-4">
            {verification ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-gray-600">
                  <span className="badge badge-green">Exact match</span>
                  <span>{verification.compiler}</span>
                  <span className="mono break-all">hash {verification.sourceHash}</span>
                  <CopyButton value={verification.sourceHash} />
                </div>
                <pre className="max-h-[520px] overflow-auto rounded-md border border-line bg-ink-900 p-3 text-[12px] leading-relaxed text-sky-100">
                  {verification.source}
                </pre>
              </>
            ) : (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                <p className="font-semibold">Source code not verified</p>
                <p className="mt-1">
                  Publish the contract source by proving it matches the signed deployment
                  transaction. No account is required.
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
                <p className="text-[13px] font-semibold text-ink-900">Detected functions</p>
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
          </div>
        )}

        {tab === "txs" && (
          <TxsTable txs={allTxs} showBlock emptyMessage="No indexed transactions yet." />
        )}

        {tab === "events" && (
          <TokenTransfersTable
            rows={enrichTokenEvents(events.items)}
            emptyMessage="No token events from this contract (only SANRC20/721 calls emit indexed events)."
          />
        )}
      </section>
    </div>
  );
}
