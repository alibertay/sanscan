/**
 * Sanscan indexer.
 *
 * SAN nodes serve blocks and transactions one page at a time (`/sync`) but have
 * no "address history" or aggregate endpoints, so sanscan keeps a local index:
 * every synced block/transaction is condensed and appended to NDJSON files,
 * then served from memory to the UI.
 *
 * The indexer is a process-wide singleton (survives Next.js HMR) and is started
 * from instrumentation.ts, with a lazy fallback from the API routes.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256 } from "@noble/hashes/sha2.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

import { canonicalJson } from "./canonical";
import { dataDir, pollMs, syncPage } from "./env";
import { fromUnits, toUnits, txLabel } from "./format";
import { san } from "./rpc";
import type {
  AddressStats,
  BlockInfo,
  ChartPayload,
  ChartPoint,
  FaucetGrant,
  GenesisInfo,
  HealthInfo,
  IndexedBlock,
  IndexedTx,
  LogEntry,
  TxPayload,
} from "./types";

interface IndexerState {
  started: boolean;
  online: boolean;
  chainId: string;
  syncedHeight: number;
  nodeHeight: number;
  lastSyncAt: number;
  lastError: string | null;
  blocks: IndexedBlock[];
  blockByHeight: Map<number, IndexedBlock>;
  blockByHash: Map<string, IndexedBlock>;
  txs: IndexedTx[];
  txById: Map<string, IndexedTx>;
  txsByAddress: Map<string, string[]>;
  addressStats: Map<string, AddressStats>;
  faucet: FaucetGrant[];
  genesis: GenesisInfo | null;
  genesisAt: number;
  lastHealth: HealthInfo | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __sanscanIndexer: IndexerState | undefined;
  // eslint-disable-next-line no-var
  var __sanscanIndexerTimer: ReturnType<typeof setTimeout> | undefined;
  // eslint-disable-next-line no-var
  var __sanscanIndexerRunning: Promise<void> | undefined;
}

function freshState(): IndexerState {
  return {
    started: false,
    online: false,
    chainId: "",
    syncedHeight: -1,
    nodeHeight: 0,
    lastSyncAt: 0,
    lastError: null,
    blocks: [],
    blockByHeight: new Map(),
    blockByHash: new Map(),
    txs: [],
    txById: new Map(),
    txsByAddress: new Map(),
    addressStats: new Map(),
    faucet: [],
    genesis: null,
    genesisAt: 0,
    lastHealth: null,
  };
}

function state(): IndexerState {
  if (!globalThis.__sanscanIndexer) {
    globalThis.__sanscanIndexer = freshState();
  }
  return globalThis.__sanscanIndexer;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function indexDir(): string {
  return path.resolve(dataDir());
}

const files = {
  blocks: () => path.join(indexDir(), "blocks.ndjson"),
  txs: () => path.join(indexDir(), "txs.ndjson"),
  faucet: () => path.join(indexDir(), "faucet.ndjson"),
  meta: () => path.join(indexDir(), "meta.json"),
  lock: () => path.join(indexDir(), ".lock"),
};

let writeQueue: Promise<void> = Promise.resolve();

function appendLine(file: string, value: unknown): void {
  const line = `${JSON.stringify(value)}\n`;
  writeQueue = writeQueue
    .then(() => appendFile(file, line, "utf8"))
    .catch((error) => {
      console.error("[sanscan] index write failed:", error);
    });
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleMetaPersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    const snapshot = state();
    writeQueue = writeQueue
      .then(() =>
        writeFile(
          files.meta(),
          JSON.stringify({
            chainId: snapshot.chainId,
            syncedHeight: snapshot.syncedHeight,
          }),
          "utf8",
        ),
      )
      .catch((error) => {
        console.error("[sanscan] meta persist failed:", error);
      });
  }, 1000);
}

function parseNdjson<T>(text: string): T[] {
  const rows: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed) as T);
    } catch {
      // A torn final line after a crash is expected: skip it.
    }
  }
  return rows;
}

async function loadPersisted(): Promise<void> {
  const snapshot = state();
  await mkdir(indexDir(), { recursive: true });

  const [blocksText, txsText, faucetText, metaText] = await Promise.all([
    readFile(files.blocks(), "utf8").catch(() => ""),
    readFile(files.txs(), "utf8").catch(() => ""),
    readFile(files.faucet(), "utf8").catch(() => ""),
    readFile(files.meta(), "utf8").catch(() => ""),
  ]);

  const blocks = parseNdjson<IndexedBlock>(blocksText);
  const txs = parseNdjson<IndexedTx>(txsText);
  snapshot.faucet = parseNdjson<FaucetGrant>(faucetText);

  for (const block of blocks) {
    if (!block.feeUnits) block.feeUnits = "0";
    indexBlockRow(block, false);
  }
  for (const tx of txs) {
    if (!tx.valueUnits) tx.valueUnits = "0";
    indexTxRow(tx, false);
  }

  if (metaText) {
    try {
      const meta = JSON.parse(metaText) as { chainId?: string; syncedHeight?: number };
      if (typeof meta.chainId === "string") snapshot.chainId = meta.chainId;
      if (typeof meta.syncedHeight === "number") {
        snapshot.syncedHeight = Math.max(
          snapshot.syncedHeight,
          meta.syncedHeight,
        );
      }
    } catch {
      // Ignore a corrupt meta file; the next sync rewrites it.
    }
  }

  if (snapshot.blocks.length > 0) {
    console.log(
      `[sanscan] loaded ${snapshot.blocks.length} blocks and ${snapshot.txs.length} transactions ` +
        `(height ${snapshot.blocks[snapshot.blocks.length - 1].height})`,
    );
  }
}

// ---------------------------------------------------------------------------
// In-memory indexing
// ---------------------------------------------------------------------------

function publicKeyToAddress(publicKey: string | undefined): string {
  if (!publicKey) return "";
  try {
    const digest = sha3_256(hexToBytes(publicKey.replace(/^0x/i, "")));
    return `0x${bytesToHex(digest.slice(0, 20))}`;
  } catch {
    return "";
  }
}

function indexBlockRow(block: IndexedBlock, append: boolean): void {
  const snapshot = state();
  snapshot.blocks.push(block);
  snapshot.blockByHeight.set(block.height, block);
  snapshot.blockByHash.set(block.hash, block);
  if (append) appendLine(files.blocks(), block);
}

function addressStatsFor(address: string): AddressStats {
  const snapshot = state();
  let stats = snapshot.addressStats.get(address);
  if (!stats) {
    stats = {
      address,
      sent: 0,
      received: 0,
      sentUnits: "0",
      receivedUnits: "0",
      firstTs: 0,
      lastTs: 0,
      deploys: 0,
      contractCalls: 0,
    };
    snapshot.addressStats.set(address, stats);
  }
  return stats;
}

function addUnits(left: string, right: bigint): string {
  try {
    return (BigInt(left) + right).toString();
  } catch {
    return left;
  }
}

function indexTxRow(tx: IndexedTx, append: boolean): void {
  const snapshot = state();
  snapshot.txs.push(tx);
  snapshot.txById.set(tx.id, tx);

  for (const address of [tx.from, tx.to]) {
    if (!address) continue;
    const list = snapshot.txsByAddress.get(address) ?? [];
    list.push(tx.id);
    snapshot.txsByAddress.set(address, list);
  }

  if (tx.from) {
    const stats = addressStatsFor(tx.from);
    stats.sent += 1;
    stats.sentUnits = addUnits(stats.sentUnits, BigInt(tx.valueUnits || "0"));
    stats.firstTs = stats.firstTs === 0 ? tx.timestamp : Math.min(stats.firstTs, tx.timestamp);
    stats.lastTs = Math.max(stats.lastTs, tx.timestamp);
    if (tx.kind === "contract_deploy") stats.deploys += 1;
    if (tx.kind === "contract_call" || tx.kind === "vm_run") stats.contractCalls += 1;
  }
  if (tx.to) {
    const stats = addressStatsFor(tx.to);
    stats.received += 1;
    stats.receivedUnits = addUnits(stats.receivedUnits, BigInt(tx.valueUnits || "0"));
    stats.firstTs = stats.firstTs === 0 ? tx.timestamp : Math.min(stats.firstTs, tx.timestamp);
    stats.lastTs = Math.max(stats.lastTs, tx.timestamp);
  }

  if (append) appendLine(files.txs(), tx);
}

function dropAfter(height: number): void {
  const snapshot = state();
  snapshot.blocks = snapshot.blocks.filter((block) => block.height <= height);
  snapshot.txs = snapshot.txs.filter((tx) => tx.block <= height);
  snapshot.blockByHeight = new Map(snapshot.blocks.map((block) => [block.height, block]));
  snapshot.blockByHash = new Map(snapshot.blocks.map((block) => [block.hash, block]));
  snapshot.txById = new Map(snapshot.txs.map((tx) => [tx.id, tx]));
  snapshot.txsByAddress = new Map();
  snapshot.addressStats = new Map();
  for (const tx of snapshot.txs) {
    for (const address of [tx.from, tx.to]) {
      if (!address) continue;
      const list = snapshot.txsByAddress.get(address) ?? [];
      list.push(tx.id);
      snapshot.txsByAddress.set(address, list);
    }
    if (tx.from) {
      const stats = addressStatsFor(tx.from);
      stats.sent += 1;
      stats.sentUnits = addUnits(stats.sentUnits, BigInt(tx.valueUnits || "0"));
      stats.firstTs = stats.firstTs === 0 ? tx.timestamp : Math.min(stats.firstTs, tx.timestamp);
      stats.lastTs = Math.max(stats.lastTs, tx.timestamp);
      if (tx.kind === "contract_deploy") stats.deploys += 1;
      if (tx.kind === "contract_call" || tx.kind === "vm_run") stats.contractCalls += 1;
    }
    if (tx.to) {
      const stats = addressStatsFor(tx.to);
      stats.received += 1;
      stats.receivedUnits = addUnits(stats.receivedUnits, BigInt(tx.valueUnits || "0"));
      stats.firstTs = stats.firstTs === 0 ? tx.timestamp : Math.min(stats.firstTs, tx.timestamp);
      stats.lastTs = Math.max(stats.lastTs, tx.timestamp);
    }
  }
  snapshot.syncedHeight = Math.min(snapshot.syncedHeight, height);
  // Rewrite the files so a restart cannot resurrect the forked branch.
  writeQueue = writeQueue
    .then(async () => {
      await Promise.all([
        writeFile(
          files.blocks(),
          snapshot.blocks.map((row) => `${JSON.stringify(row)}\n`).join(""),
          "utf8",
        ),
        writeFile(
          files.txs(),
          snapshot.txs.map((row) => `${JSON.stringify(row)}\n`).join(""),
          "utf8",
        ),
      ]);
    })
    .catch((error) => console.error("[sanscan] reorg rewrite failed:", error));
}

function executionFields(payload: TxPayload): boolean {
  return Boolean(payload.contract_code || payload.bytecode);
}

function condenseTransaction(
  payload: TxPayload,
  block: IndexedBlock,
  txIndex: number,
  txId: string,
  receipt: Record<string, unknown> | null,
): IndexedTx {
  const { kind, label } = txLabel(payload as Record<string, unknown>);
  const from = publicKeyToAddress(payload.sender);
  const to = typeof payload.receiver === "string" ? payload.receiver.toLowerCase() : null;
  const valueUnits = toUnits(String(payload.value ?? "0")).toString();
  const code = payload.contract_code ?? null;
  const status =
    receipt && typeof receipt.status === "string"
      ? receipt.status
      : executionFields(payload)
        ? null
        : "success";
  const gasUsed =
    receipt && typeof receipt.gas_used === "number" ? receipt.gas_used : executionFields(payload) ? null : 0;
  const logs = receipt && Array.isArray(receipt.logs) ? (receipt.logs as LogEntry[]) : null;

  return {
    id: txId,
    block: block.height,
    blockHash: block.hash,
    index: txIndex,
    timestamp: block.timestamp,
    from,
    sender: payload.sender ?? "",
    to,
    valueUnits,
    value: fromUnits(valueUnits),
    fee: typeof payload.fee === "number" ? payload.fee : 0,
    nonce: typeof payload.nonce === "number" ? payload.nonce : 0,
    kind: kind as IndexedTx["kind"],
    label,
    contractId: code && typeof code.contract_id === "string" ? code.contract_id : null,
    functionName: code && typeof code.function_name === "string" ? code.function_name : null,
    gasLimit: typeof payload.gas_limit === "number" ? payload.gas_limit : 0,
    gasPrice: typeof payload.gas_price === "number" ? payload.gas_price : 0,
    status,
    gasUsed,
    logs,
    error: receipt && typeof receipt.error === "string" ? receipt.error : null,
  };
}

function txIdFor(payload: TxPayload): string | null {
  // tx_id = sha256(canonical JSON without signature/fee), exactly like the node.
  try {
    const message: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (key === "signature" || key === "fee" || value === undefined) continue;
      message[key] = value;
    }
    const bytes = new TextEncoder().encode(canonicalJson(message));
    return bytesToHex(sha256(bytes));
  } catch {
    return null;
  }
}

async function ingestBlock(block: BlockInfo): Promise<void> {
  const snapshot = state();
  const existing = snapshot.blockByHeight.get(block.index);
  if (existing) {
    if (existing.hash === block.current_block_hash) return;
    // Conflicting block at the same height: reorg. Drop everything from here on.
    dropAfter(block.index - 1);
  } else if (block.index !== snapshot.syncedHeight + 1 && snapshot.syncedHeight >= 0) {
    // Gap: do not index past a missing block.
    if (block.index > snapshot.syncedHeight + 1) return;
  }

  const proposer = block.validator ?? "";
  const transactions = block.transactions ?? [];
  let feeUnits = 0n;
  for (const payload of transactions) {
    if (typeof payload.fee === "number") feeUnits += BigInt(Math.trunc(payload.fee));
  }
  const row: IndexedBlock = {
    height: block.index,
    hash: block.current_block_hash,
    parent: block.previous_block_hash,
    timestamp: block.timestamp,
    round: block.round ?? 0,
    proposer,
    proposerAddress: publicKeyToAddress(proposer),
    rewardAddress: block.reward_address ?? null,
    txCount: transactions.length,
    txRoot: block.tx_root ?? "",
    stateRoot: block.state_root ?? "",
    chainId: block.chain_id ?? snapshot.chainId,
    feeUnits: feeUnits.toString(),
  };
  indexBlockRow(row, true);

  for (let index = 0; index < transactions.length; index++) {
    const payload = transactions[index];
    const txId = txIdFor(payload);
    if (!txId) continue;

    let receipt: Record<string, unknown> | null = null;
    if (executionFields(payload)) {
      receipt = (await san.receipt(block.index, index)) as Record<string, unknown> | null;
    }
    const txRow = condenseTransaction(payload, row, index, txId, receipt);
    indexTxRow(txRow, true);
  }

  snapshot.syncedHeight = Math.max(snapshot.syncedHeight, block.index);
  scheduleMetaPersist();
}

// ---------------------------------------------------------------------------
// Sync loop
// ---------------------------------------------------------------------------

/**
 * The node may have been restarted with a shorter or forked chain (same
 * genesis). Find the highest block where the index and the node agree and
 * rewind everything above it, so the index never serves a dead branch.
 */
async function reconcile(health: HealthInfo): Promise<void> {
  const snapshot = state();
  if (snapshot.syncedHeight < 0) return;

  const tip = Math.min(snapshot.syncedHeight, health.height);
  const tipRow = snapshot.blockByHeight.get(snapshot.syncedHeight);
  if (snapshot.syncedHeight <= health.height && tipRow) {
    const nodeBlock = await san.block(snapshot.syncedHeight);
    if (nodeBlock && nodeBlock.current_block_hash === tipRow.hash) return;
  }

  let low = 0;
  let high = tip;
  let match = -1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const row = snapshot.blockByHeight.get(mid);
    const nodeBlock = row ? await san.block(mid) : null;
    if (row && nodeBlock && nodeBlock.current_block_hash === row.hash) {
      match = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  console.warn(
    `[sanscan] chain mismatch detected: rewinding index from height ${snapshot.syncedHeight} to ${match}`,
  );
  dropAfter(match);
}

async function syncOnce(): Promise<void> {
  const snapshot = state();
  const health: HealthInfo | null = await san.health();
  if (!health) {
    snapshot.online = false;
    snapshot.lastError = "SAN node is unreachable";
    return;
  }

  snapshot.online = true;
  snapshot.lastError = null;
  snapshot.chainId = health.chain_id;
  snapshot.nodeHeight = health.height;
  snapshot.lastSyncAt = Date.now();
  snapshot.lastHealth = health;

  await reconcile(health);

  let from = snapshot.syncedHeight + 1;
  if (snapshot.syncedHeight < 0) from = 0;
  let guard = 0;

  while (from <= health.height && guard < 200) {
    guard += 1;
    const page = await san.sync(from, syncPage());
    if (!page.ok || !page.data) {
      snapshot.lastError = page.detail ?? "Sync request failed";
      snapshot.online = false;
      return;
    }
    const blocks = page.data.blocks ?? [];
    if (blocks.length === 0) break;
    for (const block of blocks) {
      await ingestBlock(block);
    }
    const last = blocks[blocks.length - 1];
    if (snapshot.syncedHeight < last.index) {
      snapshot.syncedHeight = last.index;
      scheduleMetaPersist();
    }
    if (!page.data.has_more) break;
    from = page.data.next_from_index ?? last.index + 1;
  }
}

async function refreshGenesis(): Promise<void> {
  const snapshot = state();
  if (snapshot.genesis && Date.now() - snapshot.genesisAt < 60000) return;
  const genesis = await san.genesis();
  if (genesis) {
    snapshot.genesis = genesis;
    snapshot.genesisAt = Date.now();
  }
}

function scheduleNext(): void {
  if (globalThis.__sanscanIndexerTimer) clearTimeout(globalThis.__sanscanIndexerTimer);
  globalThis.__sanscanIndexerTimer = setTimeout(() => {
    void tick();
  }, pollMs());
}

async function tick(): Promise<void> {
  if (!globalThis.__sanscanIndexerRunning) {
    globalThis.__sanscanIndexerRunning = (async () => {
      try {
        await loadOnce();
        await syncOnce();
        await refreshGenesis();
      } catch (error) {
        const snapshot = state();
        snapshot.lastError = error instanceof Error ? error.message : String(error);
        snapshot.online = false;
      } finally {
        globalThis.__sanscanIndexerRunning = undefined;
      }
    })();
  }
  await globalThis.__sanscanIndexerRunning;
  scheduleNext();
}

let loadPromise: Promise<void> | null = null;

function loadOnce(): Promise<void> {
  if (!loadPromise) loadPromise = loadPersisted();
  return loadPromise;
}

export function ensureIndexer(): void {
  const snapshot = state();
  if (snapshot.started) return;
  snapshot.started = true;
  console.log("[sanscan] indexer starting, node:", san.url());
  void tick();
}

// ---------------------------------------------------------------------------
// Read API
// ---------------------------------------------------------------------------

export interface Page<T> {
  total: number;
  items: T[];
}

export function indexerStatus() {
  const snapshot = state();
  return {
    started: snapshot.started,
    online: snapshot.online,
    chainId: snapshot.chainId,
    syncedHeight: snapshot.syncedHeight,
    nodeHeight: snapshot.nodeHeight,
    lastSyncAt: snapshot.lastSyncAt,
    lastError: snapshot.lastError,
    indexedBlocks: snapshot.blocks.length,
    indexedTxs: snapshot.txs.length,
    indexedAddresses: snapshot.addressStats.size,
  };
}

export function getHealth(): HealthInfo | null {
  return state().lastHealth;
}

export function listBlocks(offset: number, limit: number): Page<IndexedBlock> {
  const snapshot = state();
  const total = snapshot.blocks.length;
  const end = Math.max(total - offset, 0);
  const start = Math.max(end - limit, 0);
  return { total, items: snapshot.blocks.slice(start, end).reverse() };
}

export function listTxs(
  offset: number,
  limit: number,
  filters: { address?: string; block?: number; kind?: string; contract?: string } = {},
): Page<IndexedTx> {
  const snapshot = state();
  let rows: IndexedTx[];

  if (filters.address) {
    const ids = snapshot.txsByAddress.get(filters.address.toLowerCase()) ?? [];
    rows = ids
      .map((id) => snapshot.txById.get(id))
      .filter((row): row is IndexedTx => Boolean(row))
      .reverse();
  } else {
    rows = [...snapshot.txs].reverse();
  }

  if (filters.block !== undefined) rows = rows.filter((row) => row.block === filters.block);
  if (filters.kind) rows = rows.filter((row) => row.kind === filters.kind);
  if (filters.contract) {
    rows = rows.filter((row) => row.contractId === filters.contract || row.to === filters.contract);
  }

  const total = rows.length;
  return { total, items: rows.slice(offset, offset + limit) };
}

export function getBlock(height: number): IndexedBlock | null {
  return state().blockByHeight.get(height) ?? null;
}

export function getBlockByHash(hash: string): IndexedBlock | null {
  const snapshot = state();
  return snapshot.blockByHash.get(hash) ?? null;
}

export function getTx(txId: string): IndexedTx | null {
  const snapshot = state();
  return snapshot.txById.get(txId) ?? snapshot.txById.get(txId.toLowerCase()) ?? null;
}

export function getAddressStats(address: string): AddressStats | null {
  return state().addressStats.get(address.toLowerCase()) ?? null;
}

export function addressStatsCount(): number {
  return state().addressStats.size;
}

export function listTopAddresses(limit: number): AddressStats[] {
  return [...state().addressStats.values()]
    .sort((a, b) => {
      const aUnits = BigInt(a.sentUnits) + BigInt(a.receivedUnits);
      const bUnits = BigInt(b.sentUnits) + BigInt(b.receivedUnits);
      if (aUnits === bUnits) return b.sent + b.received - (a.sent + a.received);
      return bUnits > aUnits ? 1 : -1;
    })
    .slice(0, limit);
}

export function getGenesis(): GenesisInfo | null {
  return state().genesis;
}

export function addFaucetGrant(grant: FaucetGrant): void {
  const snapshot = state();
  snapshot.faucet.unshift(grant);
  if (snapshot.faucet.length > 500) snapshot.faucet.length = 500;
  appendLine(files.faucet(), grant);
}

export function listFaucetGrants(limit = 25): FaucetGrant[] {
  return state().faucet.slice(0, limit);
}

export function latestBlocks(limit: number): IndexedBlock[] {
  const snapshot = state();
  return snapshot.blocks.slice(-limit).reverse();
}

export function latestTxs(limit: number): IndexedTx[] {
  const snapshot = state();
  return snapshot.txs.slice(-limit).reverse();
}

export function chartsData(window: ChartPayload["window"]): ChartPayload {
  const snapshot = state();
  const now = Math.floor(Date.now() / 1000);
  const windowSeconds = window === "24h" ? 24 * 3600 : window === "7d" ? 7 * 86400 : 30 * 86400;
  const bucketSeconds = window === "24h" ? 3600 : 86400;
  const buckets = new Map<number, ChartPoint>();
  const start = now - windowSeconds;

  const bucketKey = (ts: number) => Math.floor(ts / bucketSeconds) * bucketSeconds;
  for (let ts = bucketKey(start); ts <= now; ts += bucketSeconds) {
    buckets.set(ts, { label: "", ts, blocks: 0, txs: 0, gasUsed: 0, addresses: 0 });
  }

  const active = new Map<number, Set<string>>();
  for (const block of snapshot.blocks) {
    if (block.timestamp < start) continue;
    const point = buckets.get(bucketKey(block.timestamp));
    if (!point) continue;
    point.blocks += 1;
  }
  for (const tx of snapshot.txs) {
    if (tx.timestamp < start) continue;
    const key = bucketKey(tx.timestamp);
    const point = buckets.get(key);
    if (!point) continue;
    point.txs += 1;
    point.gasUsed += tx.gasUsed ?? 0;
    const set = active.get(key) ?? new Set<string>();
    if (tx.from) set.add(tx.from);
    if (tx.to) set.add(tx.to);
    active.set(key, set);
  }
  for (const [key, set] of active) {
    const point = buckets.get(key);
    if (point) point.addresses = set.size;
  }

  const points = [...buckets.values()].map((point) => ({
    ...point,
    label:
      window === "24h"
        ? new Date(point.ts * 1000).toISOString().slice(11, 16)
        : new Date(point.ts * 1000).toISOString().slice(5, 10),
  }));

  let supply: ChartPayload["supply"] = null;
  const genesis = snapshot.genesis;
  if (genesis) {
    const allocations = genesis.genesis_allocation ?? {};
    let premine = 0n;
    for (const amount of Object.values(allocations)) {
      try {
        premine += BigInt(amount);
      } catch {
        // ignore malformed allocation rows
      }
    }
    const reward = BigInt(genesis.parameters?.block_reward ?? "0");
    const height = BigInt(Math.max(snapshot.syncedHeight, 0));
    const total = premine + reward * height;
    supply = {
      premine: premine.toString(),
      blockReward: reward.toString(),
      height: snapshot.syncedHeight,
      total: total.toString(),
    };
  }

  return { window, points, supply };
}
