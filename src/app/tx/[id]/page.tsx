import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import CopyButton from "@/components/CopyButton";
import { StatusBadge } from "@/components/Badges";
import { AddressLink, ContractLink } from "@/components/Links";
import JsonBlock from "@/components/JsonBlock";
import TimeAgo from "@/components/TimeAgo";
import { ensureIndexer, getTx } from "@/lib/indexer";
import { formatSan, formatUtc, fromUnits } from "@/lib/format";
import { san } from "@/lib/rpc";
import type { LogEntry, TxPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Transaction ${id.slice(0, 12)}…` };
}

interface LiveTx {
  tx_id?: string;
  block_index?: number;
  block_hash?: string;
  tx_index?: number;
  transaction?: TxPayload;
  receipt?: Record<string, unknown> | null;
}

export default async function TxPage({ params }: { params: Promise<{ id: string }> }) {
  ensureIndexer();
  const { id } = await params;
  const indexed = getTx(id);
  const live = (await san.tx(id)) as LiveTx | null;
  if (!indexed && !live) notFound();

  const payload: TxPayload | undefined = live?.transaction;
  const receipt = live?.receipt ?? null;
  const status = indexed?.status ?? (receipt?.status as string | undefined) ?? "success";
  const errorMessage = indexed?.error ?? (receipt?.error as string | undefined) ?? null;
  const to = indexed?.to ?? (typeof payload?.receiver === "string" ? payload.receiver : null);
  const from = indexed?.from ?? "";
  const blockIndex = indexed?.block ?? live?.block_index ?? 0;
  const timestamp = indexed?.timestamp ?? 0;
  const value = indexed?.value ?? String(payload?.value ?? "0");
  const feeUnits = indexed?.fee ?? (typeof payload?.fee === "number" ? payload.fee : 0);
  const logs: LogEntry[] = indexed?.logs ?? ((receipt?.logs as LogEntry[] | undefined) ?? []);

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Transactions", href: "/txs" },
          { label: "Transaction" },
        ]}
      />

      <h1 className="text-[16px] font-semibold text-ink-900">Transaction Details</h1>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Overview</h2>
          <StatusBadge status={status} error={errorMessage} />
        </div>
        <div className="p-4">
          <div className="kv-row">
            <span className="kv-key">Transaction Hash</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              <span className="mono break-all">{indexed?.id ?? id}</span>
              <CopyButton value={indexed?.id ?? id} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Status</span>
            <span className="kv-value">
              <StatusBadge status={status} error={errorMessage} />
              {errorMessage && <span className="ml-2 text-danger">{errorMessage}</span>}
            </span>
          </div>
          {indexed?.block !== undefined && indexed.block >= 0 && (
            <div className="kv-row">
              <span className="kv-key">Block</span>
              <span className="kv-value flex flex-wrap items-center gap-2">
                <Link className="link" href={`/block/${indexed.block}`}>
                  {indexed.block.toLocaleString()}
                </Link>
                <span className="text-gray-500">({indexed.index} position)</span>
              </span>
            </div>
          )}
          <div className="kv-row">
            <span className="kv-key">Timestamp</span>
            <span className="kv-value">
              <TimeAgo timestamp={timestamp} />{" "}
              <span className="text-gray-500">({formatUtc(timestamp)})</span>
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">From</span>
            <span className="kv-value flex flex-wrap items-center gap-2">
              <AddressLink address={from} size={10} />
              <CopyButton value={from} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">To</span>
            <span className="kv-value">
              {indexed?.kind === "contract_deploy" && indexed.contractId ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-purple">Contract Creation</span>
                  <ContractLink contractId={indexed.contractId} />
                </span>
              ) : (
                <AddressLink address={to} size={10} />
              )}
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Value</span>
            <span className="kv-value font-semibold">{formatSan(value)} SAN</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Transaction Fee</span>
            <span className="kv-value">{formatSan(fromUnits(feeUnits))} SAN</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Nonce</span>
            <span className="kv-value">{indexed?.nonce ?? payload?.nonce ?? 0}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Type</span>
            <span className="kv-value">{indexed?.label ?? "Transaction"}</span>
          </div>
          {(indexed?.gasLimit || indexed?.gasPrice) && (
            <div className="kv-row">
              <span className="kv-key">Gas</span>
              <span className="kv-value">
                limit {indexed?.gasLimit ?? 0} · price {indexed?.gasPrice ?? 0} · used{" "}
                {indexed?.gasUsed ?? (receipt?.gas_used as number | undefined) ?? "—"}
              </span>
            </div>
          )}
          {indexed?.contractId && indexed.kind !== "contract_deploy" && (
            <div className="kv-row">
              <span className="kv-key">Contract</span>
              <span className="kv-value">
                <ContractLink contractId={indexed.contractId} />
                {indexed.functionName && <span className="ml-1">.{indexed.functionName}()</span>}
              </span>
            </div>
          )}
        </div>
      </section>

      {logs.length > 0 && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Event Logs ({logs.length})</h2>
          </div>
          <div className="table-scroll overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, index) => (
                  <tr key={index}>
                    <td className="text-gray-500">{index}</td>
                    <td className="mono whitespace-pre-wrap break-all">
                      {JSON.stringify(log)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {receipt && (
        <section className="card p-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-900">Execution Receipt</p>
          <JsonBlock value={receipt} maxHeight={260} />
        </section>
      )}

      {payload && (
        <section className="card p-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-900">Signed Transaction Payload</p>
          <JsonBlock value={payload} maxHeight={420} />
        </section>
      )}

      {live?.block_hash && (
        <section className="card p-4 text-[13px] text-gray-600">
          Block hash:{" "}
          <Link className="link mono break-all" href={`/block/${live.block_index}`}>
            {live.block_hash}
          </Link>
        </section>
      )}
    </div>
  );
}
