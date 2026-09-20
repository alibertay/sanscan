import Link from "next/link";

import { AddressLink, TxLink } from "@/components/Links";
import TimeAgo from "@/components/TimeAgo";
import { formatTokenAmount } from "@/lib/tokens";
import type { TokenTransferRow } from "@/lib/types";

const eventBadges: Record<string, string> = {
  Transfer: "badge-blue",
  Mint: "badge-green",
  Burn: "badge-red",
  Approval: "badge-orange",
  ApprovalForAll: "badge-orange",
  Init: "badge-gray",
};

export function TokenEventBadge({ event }: { event: string }) {
  return <span className={`badge ${eventBadges[event] ?? "badge-gray"}`}>{event}</span>;
}

export default function TokenTransfersTable({
  rows,
  showToken = false,
  emptyMessage = "No token transfers indexed yet",
}: {
  rows: TokenTransferRow[];
  showToken?: boolean;
  emptyMessage?: string;
}) {
  const columns = showToken ? 8 : 7;
  return (
    <div className="table-scroll overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Txn Hash</th>
            <th>Method</th>
            <th>Age</th>
            <th>From</th>
            <th>To</th>
            <th>Value</th>
            {showToken && <th>Token</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns} className="py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={`${row.txId}-${row.event}-${row.tokenId ?? row.amount ?? ""}`}>
                <td>
                  <TxLink txId={row.txId} size={7} />
                </td>
                <td>
                  <TokenEventBadge event={row.event} />
                </td>
                <td className="text-gray-500">
                  <TimeAgo timestamp={row.ts} />
                </td>
                <td>
                  <AddressLink address={row.from} size={7} />
                </td>
                <td>
                  <AddressLink address={row.to} size={7} />
                </td>
                <td className="text-gray-800">
                  {row.tokenId
                    ? `Token #${formatTokenAmount(row.tokenId)}`
                    : row.amount
                      ? formatTokenAmount(row.amount)
                      : "—"}
                  {showToken && row.symbol ? (
                    <span className="ml-1 text-gray-500">{row.symbol}</span>
                  ) : null}
                </td>
                {showToken && (
                  <td>
                    <span className="flex items-center gap-1.5">
                      <Link className="link mono" href={`/token/${encodeURIComponent(row.contractId)}`}>
                        {row.symbol ?? row.contractId}
                      </Link>
                      {row.standard && <span className="badge badge-purple">{row.standard}</span>}
                    </span>
                  </td>
                )}
                <td>
                  {row.ok ? (
                    <span className="badge badge-green">Success</span>
                  ) : (
                    <span className="badge badge-red">Failed</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
