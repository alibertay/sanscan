export default function OfflineBanner({
  online,
  error,
  rpcUrl,
}: {
  online: boolean;
  error?: string | null;
  rpcUrl: string;
}) {
  if (online) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
      <p className="font-semibold">SAN node is unreachable</p>
      <p className="mt-0.5">
        Sanscan is indexing from <span className="font-mono">{rpcUrl}</span>. Start the node (or
        point <span className="font-mono">SAN_RPC_URL</span> at a running devnet) and data will
        appear automatically.
      </p>
      {error && <p className="mt-1 font-mono text-[12px]">{error}</p>}
    </div>
  );
}
