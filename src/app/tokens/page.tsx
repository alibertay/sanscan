import type { Metadata } from "next";
import Link from "next/link";

import Breadcrumb from "@/components/Breadcrumb";
import OfflineBanner from "@/components/OfflineBanner";
import TimeAgo from "@/components/TimeAgo";
import { AddressLink } from "@/components/Links";
import { rpcBase } from "@/lib/api";
import { ensureIndexer, indexerStatus, listTokens } from "@/lib/indexer";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Tokens" };
export const dynamic = "force-dynamic";

export default function TokensPage() {
  ensureIndexer();
  const tokens = listTokens();
  const status = indexerStatus();

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Tokens" }]} />
      <OfflineBanner online={status.online} error={status.lastError} rpcUrl={rpcBase()} />

      <section className="card">
        <div className="card-header">
          <h1 className="card-title">
            SANRC20 / SANRC721 Tokens
            <span className="ml-2 text-[12px] font-normal text-gray-500">
              {formatNumber(tokens.length)} detected
            </span>
          </h1>
          <span className="text-[12px] text-gray-500">
            Tokens are detected from the functions in their deployed PENA source
          </span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Token</th>
                <th>Standard</th>
                <th>Contract</th>
                <th>Supply</th>
                <th>Holders</th>
                <th>Transfers</th>
                <th>Deployer</th>
                <th>Deployed</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-500">
                    No SANRC20/SANRC721 tokens detected yet. Deploy one from the SAN repository
                    examples (PENA/examples/SANRC20) to see it listed here.
                  </td>
                </tr>
              ) : (
                tokens.map((token, index) => (
                  <tr key={token.id}>
                    <td className="text-gray-500">{index + 1}</td>
                    <td>
                      <Link className="link" href={`/token/${encodeURIComponent(token.id)}`}>
                        <span className="font-semibold">{token.symbol ?? token.id}</span>
                        {token.name && <span className="ml-1.5 text-gray-500">{token.name}</span>}
                        {token.verified && (
                          <span className="ml-1.5 badge badge-green" title="Source verified">
                            ✓ Verified
                          </span>
                        )}
                      </Link>
                    </td>
                    <td>
                      <span className="badge badge-purple">{token.standard}</span>
                    </td>
                    <td>
                      <Link className="link mono" href={`/contract/${encodeURIComponent(token.id)}`}>
                        {token.id}
                      </Link>
                    </td>
                    <td>{formatNumber(token.totalSupply ?? "—")}</td>
                    <td>{formatNumber(token.holders)}</td>
                    <td>{formatNumber(token.transfers)}</td>
                    <td>
                      <AddressLink address={token.deployer} size={8} />
                    </td>
                    <td className="text-gray-500">
                      {token.deployTimestamp ? (
                        <TimeAgo timestamp={token.deployTimestamp} />
                      ) : (
                        "—"
                      )}
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
