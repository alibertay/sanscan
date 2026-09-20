import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import CopyButton from "@/components/CopyButton";
import OfflineBanner from "@/components/OfflineBanner";
import { ensureIndexer, getGenesis, getHealth, indexerStatus } from "@/lib/indexer";
import { formatNumber } from "@/lib/format";
import { rpcBase } from "@/lib/api";
import { san } from "@/lib/rpc";

export const metadata: Metadata = { title: "Network Status" };
export const dynamic = "force-dynamic";

interface PeerRecord {
  node_id?: string;
  host?: string;
  api_port?: number;
  peer_port?: number;
  p2p_port?: number;
  controller_port?: number;
  chain_id?: string;
  protocol_version?: number;
  timestamp?: number;
}

export default async function NetworkPage() {
  ensureIndexer();
  const status = indexerStatus();
  const health = getHealth();
  const [finality, bootstrap, metrics, genesisResponse] = await Promise.all([
    san.finality(),
    san.bootstrap(),
    san.metricsText(),
    san.genesis(),
  ]);
  const genesis = genesisResponse ?? getGenesis();
  const peers = ((bootstrap?.peers ?? []) as PeerRecord[]).filter((peer) => peer.host);

  const version = health?.version_info;

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Network Status" }]} />
      <OfflineBanner online={status.online} error={status.lastError} rpcUrl={rpcBase()} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="stat-label">Height</p>
          <p className="stat-value">{formatNumber(health?.height ?? status.syncedHeight)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Finalized</p>
          <p className="stat-value">{formatNumber(finality?.finalized_height ?? 0)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Peers</p>
          <p className="stat-value">{formatNumber(health?.peers ?? peers.length)}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Indexed</p>
          <p className="stat-value">
            {formatNumber(status.indexedBlocks)} blocks / {formatNumber(status.indexedTxs)} txs
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Node & Chain</h2>
          </div>
          <div className="p-4">
            <div className="kv-row">
              <span className="kv-key">RPC endpoint</span>
              <span className="kv-value mono">{rpcBase()}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Chain ID</span>
              <span className="kv-value mono">{health?.chain_id ?? genesis?.chain_id ?? "—"}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Tip hash</span>
              <span className="kv-value flex flex-wrap items-center gap-2">
                <span className="mono break-all">{health?.tip_hash ?? "—"}</span>
                {health?.tip_hash && <CopyButton value={health.tip_hash} />}
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">State root</span>
              <span className="kv-value">
                <span className="mono break-all">{health?.state_root ?? "—"}</span>
              </span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Base fee</span>
              <span className="kv-value">{formatNumber(health?.base_fee ?? 0)} per gas</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Mempool</span>
              <span className="kv-value">{formatNumber(health?.mempool ?? 0)} pending</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Validators / controllers</span>
              <span className="kv-value">
                {formatNumber(health?.validators ?? 0)} / {formatNumber(health?.controllers ?? 0)}
              </span>
            </div>
            {version && (
              <div className="kv-row">
                <span className="kv-key">Software</span>
                <span className="kv-value">
                  {version.version ?? "dev"} · {version.protocol_name ?? "san-p2p"} protocol{" "}
                  {version.protocol_version ?? "?"} · schema {version.schema_version ?? "?"} ·{" "}
                  {version.go_version ?? ""}
                </span>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Genesis</h2>
          </div>
          <div className="p-4">
            <div className="kv-row">
              <span className="kv-key">Genesis hash</span>
              <span className="kv-value flex flex-wrap items-center gap-2">
                <span className="mono break-all">{genesis?.genesis_hash ?? "—"}</span>
                {genesis?.genesis_hash && <CopyButton value={genesis.genesis_hash} />}
              </span>
            </div>
            {genesis?.genesis_fingerprint && (
              <div className="kv-row">
                <span className="kv-key">Fingerprint</span>
                <span className="kv-value mono break-all">{genesis.genesis_fingerprint}</span>
              </div>
            )}
            {genesis?.parameters &&
              Object.entries(genesis.parameters).map(([key, value]) => (
                <div className="kv-row" key={key}>
                  <span className="kv-key mono">{key}</span>
                  <span className="kv-value">{String(value)}</span>
                </div>
              ))}
            {genesis?.genesis_allocation && (
              <div className="kv-row">
                <span className="kv-key">Premine allocations</span>
                <span className="kv-value">
                  {Object.keys(genesis.genesis_allocation).length} address(es)
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Known Peers</h2>
          <span className="text-[12px] text-gray-500">{peers.length} records</span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Node</th>
                <th>Host</th>
                <th>API</th>
                <th>P2P</th>
                <th>Peer</th>
                <th>Protocol</th>
              </tr>
            </thead>
            <tbody>
              {peers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">
                    No peer records available (single-node chain or discovery still warming up).
                  </td>
                </tr>
              ) : (
                peers.map((peer, index) => (
                  <tr key={`${peer.node_id ?? peer.host}-${index}`}>
                    <td className="mono">{peer.node_id ? peer.node_id.slice(0, 16) : "—"}</td>
                    <td className="mono">{peer.host}</td>
                    <td>{peer.api_port ?? "—"}</td>
                    <td>{peer.p2p_port ?? "—"}</td>
                    <td>{peer.peer_port ?? "—"}</td>
                    <td>v{peer.protocol_version ?? "?"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {metrics && (
        <section className="card p-4">
          <details>
            <summary className="cursor-pointer text-[13px] font-semibold text-ink-900">
              Prometheus metrics (raw)
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-line bg-ink-900 p-3 text-[12px] leading-relaxed text-sky-100">
              {metrics}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}
