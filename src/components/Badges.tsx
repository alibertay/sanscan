import type { TxKind } from "@/lib/types";

const kindClasses: Record<string, string> = {
  transfer: "badge-blue",
  contract_deploy: "badge-purple",
  contract_call: "badge-orange",
  vm_run: "badge-gray",
  stake: "badge-green",
  governance: "badge-orange",
  unknown: "badge-gray",
};

export function MethodBadge({ kind, label }: { kind: string; label: string }) {
  const klass = kindClasses[kind] ?? "badge-gray";
  return (
    <span className={`badge ${klass} max-w-[190px] truncate`} title={label}>
      {label}
    </span>
  );
}

export function KindBadge({ kind }: { kind: TxKind }) {
  switch (kind) {
    case "transfer":
      return <span className="badge badge-blue">Transfer</span>;
    case "contract_deploy":
      return <span className="badge badge-purple">Contract Creation</span>;
    case "contract_call":
      return <span className="badge badge-orange">Contract Call</span>;
    case "vm_run":
      return <span className="badge badge-gray">PASM</span>;
    case "stake":
      return <span className="badge badge-green">Staking</span>;
    case "governance":
      return <span className="badge badge-orange">Governance</span>;
    default:
      return <span className="badge badge-gray">Transaction</span>;
  }
}

export function StatusBadge({ status, error }: { status: string | null; error?: string | null }) {
  if (!status) return <span className="badge badge-gray">Pending</span>;
  if (status === "success") return <span className="badge badge-green">Success</span>;
  if (status === "failed") return <span className="badge badge-red">Failed</span>;
  return (
    <span className="badge badge-gray" title={error ?? undefined}>
      {status}
    </span>
  );
}

export function FinalityBadge({ finalized }: { finalized: boolean }) {
  return finalized ? (
    <span className="badge badge-green">Finalized</span>
  ) : (
    <span className="badge badge-orange">Unfinalized</span>
  );
}
