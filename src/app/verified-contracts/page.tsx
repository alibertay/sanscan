import type { Metadata } from "next";
import Link from "next/link";

import Breadcrumb from "@/components/Breadcrumb";
import CopyButton from "@/components/CopyButton";
import TimeAgo from "@/components/TimeAgo";
import { AddressLink, TxLink } from "@/components/Links";
import { ensureIndexer, listVerifications } from "@/lib/indexer";
import { shortHash } from "@/lib/format";

export const metadata: Metadata = { title: "Verified Contracts" };
export const dynamic = "force-dynamic";

export default function VerifiedContractsPage() {
  ensureIndexer();
  const records = listVerifications();

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Verified Contracts" }]} />

      <section className="card">
        <div className="card-header">
          <h1 className="card-title">
            Verified Contracts
            <span className="ml-2 text-[12px] font-normal text-gray-500">
              {records.length} verified
            </span>
          </h1>
          <Link className="link text-[13px]" href="/verify-contract">
            Verify a contract →
          </Link>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Contract</th>
                <th>Language</th>
                <th>Match</th>
                <th>Source hash</th>
                <th>Deployer</th>
                <th>Deploy tx</th>
                <th>Verified</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-500">
                    No verified contracts yet.{" "}
                    <Link className="link" href="/verify-contract">
                      Verify the first one →
                    </Link>
                  </td>
                </tr>
              ) : (
                records.map((record, index) => (
                  <tr key={record.contractId}>
                    <td className="text-gray-500">{index + 1}</td>
                    <td>
                      <Link
                        className="link mono"
                        href={`/contract/${encodeURIComponent(record.contractId)}`}
                      >
                        {record.contractId}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-purple">{record.language.toUpperCase()}</span>
                    </td>
                    <td>
                      <span className="badge badge-green">{record.matchType}</span>
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5">
                        <span className="mono">{shortHash(record.sourceHash, 8)}</span>
                        <CopyButton value={record.sourceHash} />
                      </span>
                    </td>
                    <td>
                      <AddressLink address={record.deployer} size={8} />
                    </td>
                    <td>
                      <TxLink txId={record.deployTxId} size={8} />
                    </td>
                    <td className="text-gray-500">
                      <TimeAgo timestamp={Math.floor(record.verifiedAt / 1000)} />
                    </td>
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
