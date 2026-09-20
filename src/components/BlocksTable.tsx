import Link from "next/link";

import { AddressLink } from "@/components/Links";
import TimeAgo from "@/components/TimeAgo";
import { formatSan, fromUnits, shortHash } from "@/lib/format";
import type { IndexedBlock } from "@/lib/types";

export function BlockRow({
  block,
  rewardPerBlock = "0",
  showHash = false,
}: {
  block: IndexedBlock;
  rewardPerBlock?: string;
  showHash?: boolean;
}) {
  let reward = "—";
  try {
    reward = formatSan(fromUnits(BigInt(rewardPerBlock) + BigInt(block.feeUnits || "0")));
  } catch {
    reward = "—";
  }
  return (
    <tr>
      <td>
        <Link className="link mono" href={`/block/${block.height}`}>
          {block.height}
        </Link>
      </td>
      <td className="text-gray-500">
        <TimeAgo timestamp={block.timestamp} />
      </td>
      <td>
        <Link
          href={`/txs?block=${block.height}`}
          className="badge badge-gray hover:border-link hover:text-link"
          title={`${block.txCount} transactions in this block`}
        >
          {block.txCount} txns
        </Link>
      </td>
      <td>
        {block.proposerAddress ? (
          <AddressLink address={block.proposerAddress} size={7} />
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="text-gray-700">{reward} SAN</td>
      <td>
        <Link className="link mono" href={`/block/${block.height}`}>
          {shortHash(block.hash, showHash ? 12 : 8)}
        </Link>
      </td>
    </tr>
  );
}

export default function BlocksTable({
  blocks,
  rewardPerBlock = "0",
  showHash = false,
  emptyMessage = "No blocks indexed yet",
}: {
  blocks: IndexedBlock[];
  rewardPerBlock?: string;
  showHash?: boolean;
  emptyMessage?: string;
}) {
  return (
    <div className="table-scroll overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Block</th>
            <th>Age</th>
            <th>Txns</th>
            <th>Proposer</th>
            <th>Reward</th>
            <th>Hash</th>
          </tr>
        </thead>
        <tbody>
          {blocks.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-8 text-center text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            blocks.map((block) => (
              <BlockRow
                key={`${block.height}-${block.hash}`}
                block={block}
                rewardPerBlock={rewardPerBlock}
                showHash={showHash}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
