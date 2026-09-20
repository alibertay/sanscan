import type { Metadata } from "next";
import Link from "next/link";

import Breadcrumb from "@/components/Breadcrumb";
import OfflineBanner from "@/components/OfflineBanner";
import TimeAgo from "@/components/TimeAgo";
import { AddressLink, TxLink } from "@/components/Links";
import { rpcBase } from "@/lib/api";
import { ensureIndexer, indexerStatus, listTxs } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const metadata: Metadata = { title: "Contracts" };
export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  ensureIndexer();
  const response = await san.contracts();
  const ids = response.ok ? (response.data?.contracts ?? []) : [];
  const status = indexerStatus();

  const contracts = ids.map((id) => {
    const deploys = listTxs(0, 25, { contract: id }).items.filter(
      (tx) => tx.contractId === id && tx.kind === "contract_deploy",
    );
    const calls = listTxs(0, 1, { contract: id }).total;
    return { id, deploy: deploys[0] ?? null, calls };
  });

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Contracts" }]} />
      <OfflineBanner online={status.online} error={status.lastError} rpcUrl={rpcBase()} />

      <section className="card">
        <div className="card-header">
          <h1 className="card-title">
            Verified Contract IDs
            <span className="ml-2 text-[12px] font-normal text-gray-500">
              {contracts.length} deployed
            </span>
          </h1>
          <span className="text-[12px] text-gray-500">
            PENA / SANVM contracts deployed on this chain
          </span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Contract ID</th>
                <th>Deployer</th>
                <th>Deploy Tx</th>
                <th>Deployed</th>
                <th>Indexed calls</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-gray-500">
                    No contracts deployed yet. Deploy one from the wallet-signed contract console
                    or the SAN SDK.
                  </td>
                </tr>
              ) : (
                contracts.map((contract) => (
                  <tr key={contract.id}>
                    <td>
                      <Link className="link mono" href={`/contract/${encodeURIComponent(contract.id)}`}>
                        {contract.id}
                      </Link>
                    </td>
                    <td>
                      {contract.deploy ? (
                        <AddressLink address={contract.deploy.from} size={8} />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td>
                      {contract.deploy ? (
                        <TxLink txId={contract.deploy.id} size={8} />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-gray-500">
                      {contract.deploy ? <TimeAgo timestamp={contract.deploy.timestamp} /> : "—"}
                    </td>
                    <td>{contract.calls}</td>
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
