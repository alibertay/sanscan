import type { Metadata } from "next";
import { notFound } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import ContractConsole from "@/components/ContractConsole";
import { AddressLink, TxLink } from "@/components/Links";
import TxsTable from "@/components/TxsTable";
import TimeAgo from "@/components/TimeAgo";
import { ensureIndexer, listTxs } from "@/lib/indexer";
import { san } from "@/lib/rpc";
import type { TxPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Contract ${id}` };
}

function extractFunctions(penaCode: string | undefined): string[] {
  if (!penaCode) return [];
  const names = new Set<string>();
  const regex = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match = regex.exec(penaCode);
  while (match) {
    names.add(match[1]);
    match = regex.exec(penaCode);
  }
  return [...names];
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  ensureIndexer();
  const { id } = await params;
  const response = await san.contracts();
  const ids = response.ok ? (response.data?.contracts ?? []) : [];
  const existsOnNode = ids.includes(id);

  const allTxs = listTxs(0, 100, { contract: id }).items;
  const deployTx = allTxs.find((tx) => tx.contractId === id && tx.kind === "contract_deploy") ?? null;

  let functions: string[] = [];
  let penaCode: string | null = null;
  if (deployTx) {
    const live = (await san.tx(deployTx.id)) as
      | { transaction?: TxPayload }
      | null;
    const code = live?.transaction?.contract_code;
    penaCode = typeof code?.pena_code === "string" ? code.pena_code : null;
    functions = extractFunctions(penaCode ?? undefined);
  }

  if (!existsOnNode && !deployTx && allTxs.length === 0) notFound();

  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Contracts", href: "/contracts" },
          { label: id },
        ]}
      />

      <h1 className="text-[16px] font-semibold text-ink-900">
        Contract <span className="mono">{id}</span>
        {!existsOnNode && (
          <span className="ml-2 align-middle badge badge-orange">Not deployed on the node now</span>
        )}
      </h1>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Contract Overview</h2>
        </div>
        <div className="p-4">
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
          <div className="kv-row">
            <span className="kv-key">Indexed interactions</span>
            <span className="kv-value">{allTxs.length}</span>
          </div>
        </div>
      </section>

      <ContractConsole contractId={id} functions={functions} />

      {penaCode && (
        <section className="card p-4">
          <details>
            <summary className="cursor-pointer text-[13px] font-semibold text-ink-900">
              Contract source (PENA)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-line bg-ink-900 p-3 text-[12px] leading-relaxed text-sky-100">
              {penaCode}
            </pre>
          </details>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Contract Transactions</h2>
        </div>
        <TxsTable txs={allTxs.slice(0, 25)} showBlock emptyMessage="No indexed transactions yet." />
      </section>
    </div>
  );
}
