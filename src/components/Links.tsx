import Link from "next/link";

import { shortHash } from "@/lib/format";

export function AddressLink({
  address,
  size = 8,
  className = "",
}: {
  address: string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!address) return <span className="text-gray-400">—</span>;
  return (
    <Link className={`link mono ${className}`} href={`/address/${address}`} title={address}>
      {shortHash(address, size)}
    </Link>
  );
}

export function TxLink({
  txId,
  size = 8,
  className = "",
}: {
  txId: string | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!txId) return <span className="text-gray-400">—</span>;
  return (
    <Link className={`link mono ${className}`} href={`/tx/${txId}`} title={txId}>
      {shortHash(txId, size)}
    </Link>
  );
}

export function BlockLink({
  height,
  className = "",
}: {
  height: number | null | undefined;
  className?: string;
}) {
  if (height === null || height === undefined) return <span className="text-gray-400">—</span>;
  return (
    <Link className={`link mono ${className}`} href={`/block/${height}`}>
      {height}
    </Link>
  );
}

export function ContractLink({
  contractId,
  className = "",
}: {
  contractId: string | null | undefined;
  className?: string;
}) {
  if (!contractId) return <span className="text-gray-400">—</span>;
  return (
    <Link className={`link mono ${className}`} href={`/contract/${encodeURIComponent(contractId)}`}>
      {contractId}
    </Link>
  );
}
