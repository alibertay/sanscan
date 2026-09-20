import { json, ready, rpcBase } from "@/lib/api";
import { getGenesis, getHealth, indexerStatus } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PeerRecord {
  node_id?: string;
  host?: string;
  api_port?: number;
  peer_port?: number;
  p2p_port?: number;
  controller_port?: number;
  chain_id?: string;
  protocol_version?: number;
  public_key?: string;
  timestamp?: number;
  [key: string]: unknown;
}

function sanitizePeer(peer: PeerRecord) {
  return {
    nodeId: peer.node_id ? String(peer.node_id).slice(0, 16) : null,
    host: peer.host ?? null,
    apiPort: peer.api_port ?? null,
    peerPort: peer.peer_port ?? null,
    p2pPort: peer.p2p_port ?? null,
    controllerPort: peer.controller_port ?? null,
    chainId: peer.chain_id ?? null,
    protocolVersion: peer.protocol_version ?? null,
    timestamp: peer.timestamp ?? null,
  };
}

export async function GET() {
  ready();
  const [finality, bootstrap, metrics] = await Promise.all([
    san.finality(),
    san.bootstrap(),
    san.metricsText(),
  ]);

  const peers = (bootstrap?.peers ?? [])
    .map((peer) => sanitizePeer(peer as PeerRecord))
    .filter((peer) => peer.host);

  return json({
    rpcUrl: rpcBase(),
    health: getHealth(),
    finality,
    genesis: getGenesis(),
    peers,
    metrics: metrics ?? null,
    index: indexerStatus(),
  });
}
