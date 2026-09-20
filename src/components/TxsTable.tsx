import Link from "next/link";

import { MethodBadge, StatusBadge } from "@/components/Badges";
import { AddressLink, TxLink } from "@/components/Links";
import TimeAgo from "@/components/TimeAgo";
import { ContractLink } from "@/components/Links";
import { formatSan, fromUnits } from "@/lib/format";
import type { IndexedTx } from "@/lib/types";

function ToCell({ tx }: { tx: IndexedTx }) {
  if (tx.kind === "contract_deploy") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="badge badge-purple">Contract Creation</span>
        {tx.contractId && <ContractLink contractId={tx.contractId} />}
      </span>
    );
  }
  if (tx.kind === "contract_call" && tx.contractId) {
    return (
      <span className="flex items-center gap-1.5">
        <ContractLink contractId={tx.contractId} />
        {tx.functionName && <span className="text-gray-500">.{tx.functionName}()</span>}
      </span>
    );
  }
  const target = tx.to ?? tx.from;
  return (
    <span className="flex items-center gap-1.5">
      <AddressLink address={target} size={7} />
      {!tx.to && <span className="badge badge-gray">System</span>}
    </span>
  );
}

export function TxRow({ tx, showBlock = true }: { tx: IndexedTx; showBlock?: boolean }) {
  return (
    <tr>
      <td>
        <div className="flex items-center gap-1.5">
          <TxLink txId={tx.id} size={7} />
          <MethodBadge kind={tx.kind} label={tx.label} />
        </div>
      </td>
      {showBlock && (
        <td>
          <Link className="link mono" href={`/block/${tx.block}`}>
            {tx.block}
          </Link>
        </td>
      )}
      <td className="text-gray-500">
        <TimeAgo timestamp={tx.timestamp} />
      </td>
      <td>
        <AddressLink address={tx.from} size={7} />
      </td>
      <td>
        <ToCell tx={tx} />
      </td>
      <td className="text-gray-800">
        {tx.valueUnits !== "0" ? `${formatSan(tx.value)} SAN` : <span className="text-gray-400">0 SAN</span>}
      </td>
      <td className="text-gray-600">{formatSan(fromUnits(tx.fee))} SAN</td>
      <td>
        <StatusBadge status={tx.status} error={tx.error} />
      </td>
    </tr>
  );
}

export default function TxsTable({
  txs,
  showBlock = true,
  emptyMessage = "No transactions indexed yet",
}: {
  txs: IndexedTx[];
  showBlock?: boolean;
  emptyMessage?: string;
}) {
  const columns = showBlock ? 8 : 7;
  return (
    <div className="table-scroll overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Txn Hash</th>
            {showBlock && <th>Block</th>}
            <th>Age</th>
            <th>From</th>
            <th>To</th>
            <th>Value</th>
            <th>Txn Fee</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {txs.length === 0 ? (
            <tr>
              <td colSpan={columns} className="py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            txs.map((tx) => <TxRow key={tx.id} tx={tx} showBlock={showBlock} />)
          )}
        </tbody>
      </table>
    </div>
  );
}
