/**
 * Sanscan indexer.
 *
 * SAN nodes serve blocks and transactions one page at a time (`/sync`) but have
 * no "address history", token or aggregate endpoints, so sanscan keeps a local
 * index: every synced block/transaction is condensed and appended to NDJSON
 * files, then served from memory to the UI.
 *
 * Derived data (address stats, token transfers/holders, contract registry) is
 * rebuilt from the transaction list, so a reorg or a restart can never leave a
 * stale balance behind.
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
import {
  detectStandard,
  extractFunctions,
  metadataFromInit,
  parseFunctionSignatures,
  toBig,
  tokenEventFromTx,
} from "./tokens";
import type {
  AddressStats,
  BlockInfo,
  ChartPayload,
  ChartPoint,
  FaucetGrant,
  GasStats,
  GenesisInfo,
  HealthInfo,
  HolderRow,
  IndexedBlock,
  IndexedTx,
  LogEntry,
  TokenEvent,
  TokenRecord,
  TxPayload,
  VerificationRecord,
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
  tokens: Map<string, TokenRecord>;
  tokenEvents: TokenEvent[];
  tokenEventByTx: Map<string, TokenEvent>;
  tokenEventsByContract: Map<string, TokenEvent[]>;
  tokenEventsByAddress: Map<string, TokenEvent[]>;
  tokenHolders: Map<string, Map<string, string>>;
  nftOwners: Map<string, Map<string, string>>;
  contractDeploys: Map<string, string>;
  verifications: Map<string, VerificationRecord>;
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
    tokens: new Map(),
    tokenEvents: [],
    tokenEventByTx: new Map(),
    tokenEventsByContract: new Map(),
    tokenEventsByAddress: new Map(),
    tokenHolders: new Map(),
    nftOwners: new Map(),
    contractDeploys: new Map(),
    verifications: new Map(),
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
  verifications: () => path.join(indexDir(), "verifications.ndjson"),
  meta: () => path.join(indexDir(), "meta.json"),
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

  const [blocksText, txsText, faucetText, verificationText, metaText] = await Promise.all([
    readFile(files.blocks(), "utf8").catch(() => ""),
    readFile(files.txs(), "utf8").catch(() => ""),
    readFile(files.faucet(), "utf8").catch(() => ""),
    readFile(files.verifications(), "utf8").catch(() => ""),
    readFile(files.meta(), "utf8").catch(() => ""),
  ]);

  const blocks = parseNdjson<IndexedBlock>(blocksText);
  const txs = parseNdjson<IndexedTx>(txsText);
  snapshot.faucet = parseNdjson<FaucetGrant>(faucetText);
  for (const record of parseNdjson<VerificationRecord>(verificationText)) {
    if (record.contractId) snapshot.verifications.set(record.contractId, record);
  }

  for (const block of blocks) {
    if (!block.feeUnits) block.feeUnits = "0";
    snapshot.blocks.push(block);
    snapshot.blockByHeight.set(block.height, block);
    snapshot.blockByHash.set(block.hash, block);
  }
  for (const tx of txs) {
    if (!tx.valueUnits) tx.valueUnits = "0";
    if (tx.params === undefined) tx.params = null;
    snapshot.txs.push(tx);
    snapshot.txById.set(tx.id, tx);
  }
  rebuildDerived();

  if (metaText) {
    try {
      const meta = JSON.parse(metaText) as { chainId?: string; syncedHeight?: number };
      if (typeof meta.chainId === "string") snapshot.chainId = meta.chainId;
      if (typeof meta.syncedHeight === "number") {
        snapshot.syncedHeight = Math.max(snapshot.syncedHeight, meta.syncedHeight);
      }
    } catch {
      // Ignore a corrupt meta file; the next sync rewrites it.
    }
  }

  if (snapshot.blocks.length > 0) {
    console.log(
      `[sanscan] loaded ${snapshot.blocks.length} blocks, ${snapshot.txs.length} transactions, ` +
        `${snapshot.tokens.size} tokens (height ${snapshot.blocks[snapshot.blocks.length - 1].height})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Derived state (address stats, tokens, holders)
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

function applyAddressLinks(tx: IndexedTx): void {
  const snapshot = state();
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
  if (tx.kind === "contract_deploy" && tx.contractId) {
    snapshot.contractDeploys.set(tx.contractId, tx.id);
  }
}

function tokenRecordForDeploy(tx: IndexedTx): TokenRecord | null {
  if (!tx.contractId || !tx.contractCode) return null;
  const functions = extractFunctions(tx.contractCode);
  const standard = detectStandard(functions);
  if (!standard) return null;
  return {
    id: tx.contractId,
    standard,
    functions,
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: standard === "SANRC721" ? "0" : null,
    owner: null,
    deployTx: tx.id,
    deployBlock: tx.block,
    deployTimestamp: tx.timestamp,
    deployer: tx.from,
    transfers: 0,
    holders: 0,
    verified: false,
  };
}

function holderDelta(contractId: string, address: string | null, delta: bigint): void {
  if (!address || delta === 0n) return;
  const snapshot = state();
  let holders = snapshot.tokenHolders.get(contractId);
  if (!holders) {
    holders = new Map();
    snapshot.tokenHolders.set(contractId, holders);
  }
  const current = toBig(holders.get(address) ?? "0") ?? 0n;
  const next = current + delta;
  if (next <= 0n) holders.delete(address);
  else holders.set(address, next.toString());
}

function applyTokenTx(tx: IndexedTx): void {
  const snapshot = state();

  if (tx.kind === "contract_deploy") {
    const record = tokenRecordForDeploy(tx);
    if (record) snapshot.tokens.set(record.id, record);
    return;
  }
  if (tx.kind !== "contract_call" || !tx.contractId) return;

  const token = snapshot.tokens.get(tx.contractId);
  if (!token) return;

  const draft = tokenEventFromTx(tx, token.standard);
  if (!draft) return;

  const event: TokenEvent = draft;
  snapshot.tokenEvents.push(event);
  snapshot.tokenEventByTx.set(event.txId, event);
  const byContract = snapshot.tokenEventsByContract.get(event.contractId) ?? [];
  byContract.push(event);
  snapshot.tokenEventsByContract.set(event.contractId, byContract);
  for (const address of [event.from, event.to]) {
    if (!address) continue;
    const byAddress = snapshot.tokenEventsByAddress.get(address) ?? [];
    byAddress.push(event);
    snapshot.tokenEventsByAddress.set(address, byAddress);
  }
  if (!event.ok) return;

  if (event.event === "Init") {
    const metadata = metadataFromInit(tx, token.standard);
    if (metadata) {
      token.name = metadata.name ?? token.name;
      token.symbol = metadata.symbol ?? token.symbol;
      token.decimals = metadata.decimals ?? token.decimals;
      token.owner = metadata.owner ?? token.owner;
      if (token.standard === "SANRC20") {
        token.totalSupply = metadata.totalSupply ?? token.totalSupply;
        if (metadata.owner && metadata.totalSupply) {
          holderDelta(token.id, metadata.owner, BigInt(metadata.totalSupply));
        }
      }
    }
    token.holders = snapshot.tokenHolders.get(token.id)?.size ?? 0;
    return;
  }

  if (event.event === "Transfer" || event.event === "Mint" || event.event === "Burn") {
    token.transfers += 1;
  }
  const amount = event.amount ? (toBig(event.amount) ?? 0n) : 0n;

  if (token.standard === "SANRC20") {
    if (event.event === "Transfer") {
      holderDelta(token.id, event.from, -amount);
      holderDelta(token.id, event.to, amount);
    } else if (event.event === "Mint") {
      holderDelta(token.id, event.to, amount);
      const supply = toBig(token.totalSupply ?? "0") ?? 0n;
      token.totalSupply = (supply + amount).toString();
    } else if (event.event === "Burn") {
      holderDelta(token.id, event.from, -amount);
      const supply = toBig(token.totalSupply ?? "0") ?? 0n;
      token.totalSupply = (supply - amount).toString();
    }
  } else {
    const tokenId = event.tokenId ?? "";
    let owners = snapshot.nftOwners.get(token.id);
    if (!owners) {
      owners = new Map();
      snapshot.nftOwners.set(token.id, owners);
    }
    if (event.event === "Mint") {
      if (event.to && tokenId) {
        holders721Delta(token.id, event.to, 1n);
        owners.set(tokenId, event.to);
      }
    } else if (event.event === "Transfer") {
      if (event.from) holders721Delta(token.id, event.from, -1n);
      if (event.to) holders721Delta(token.id, event.to, 1n);
      if (tokenId && event.to) owners.set(tokenId, event.to);
    } else if (event.event === "Burn") {
      if (event.from) holders721Delta(token.id, event.from, -1n);
      if (tokenId) owners.delete(tokenId);
    }
    if (event.event === "Mint") {
      const supply = toBig(token.totalSupply ?? "0") ?? 0n;
      token.totalSupply = (supply + 1n).toString();
    } else if (event.event === "Burn") {
      const supply = toBig(token.totalSupply ?? "0") ?? 0n;
      token.totalSupply = supply > 0n ? (supply - 1n).toString() : "0";
    }
  }
  if (event.event === "Transfer" || event.event === "Mint" || event.event === "Burn") {
    token.holders = snapshot.tokenHolders.get(token.id)?.size ?? 0;
  }
}

function holders721Delta(contractId: string, address: string, delta: bigint): void {
  holderDelta(contractId, address, delta);
}

function recomputeHolderCounts(): void {
  const snapshot = state();
  for (const [contractId, token] of snapshot.tokens) {
    const holders = snapshot.tokenHolders.get(contractId);
    token.holders = holders ? holders.size : 0;
    token.verified = snapshot.verifications.has(contractId);
  }
}

/** Rebuild every derived structure from the raw transaction list. */
function rebuildDerived(): void {
  const snapshot = state();
  snapshot.txsByAddress = new Map();
  snapshot.addressStats = new Map();
  snapshot.tokens = new Map();
  snapshot.tokenEvents = [];
  snapshot.tokenEventByTx = new Map();
  snapshot.tokenEventsByContract = new Map();
  snapshot.tokenEventsByAddress = new Map();
  snapshot.tokenHolders = new Map();
  snapshot.nftOwners = new Map();
  snapshot.contractDeploys = new Map();

  for (const tx of snapshot.txs) {
    applyAddressLinks(tx);
    applyTokenTx(tx);
  }
  recomputeHolderCounts();
}

function dropAfter(height: number): void {
  const snapshot = state();
  snapshot.blocks = snapshot.blocks.filter((block) => block.height <= height);
  snapshot.txs = snapshot.txs.filter((tx) => tx.block <= height);
  snapshot.blockByHeight = new Map(snapshot.blocks.map((block) => [block.height, block]));
  snapshot.blockByHash = new Map(snapshot.blocks.map((block) => [block.hash, block]));
  snapshot.txById = new Map(snapshot.txs.map((tx) => [tx.id, tx]));
  rebuildDerived();
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

// ---------------------------------------------------------------------------
// Transaction condensation
// ---------------------------------------------------------------------------

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
    receipt && typeof receipt.gas_used === "number"
      ? receipt.gas_used
      : executionFields(payload)
        ? null
        : 0;
  const logs = receipt && Array.isArray(receipt.logs) ? (receipt.logs as LogEntry[]) : null;

  const isDeploy = kind === "contract_deploy";
  const contractCode =
    isDeploy && code && typeof code.pena_code === "string" ? code.pena_code : null;

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
    params: code && Array.isArray(code.params) ? code.params : null,
    contractCode,
    contractCodeHash: contractCode ? bytesToHex(sha256(new TextEncoder().encode(contractCode))) : null,
    language:
      code && typeof code.language === "string"
        ? code.language
        : contractCode
          ? "pena"
          : null,
    gasLimit: typeof payload.gas_limit === "number" ? payload.gas_limit : 0,
    gasPrice: typeof payload.gas_price === "number" ? payload.gas_price : 0,
    status,
    gasUsed,
    logs,
    error: receipt && typeof receipt.error === "string" ? receipt.error : null,
  };
}

function pushTx(tx: IndexedTx, append: boolean): void {
  const snapshot = state();
  snapshot.txs.push(tx);
  snapshot.txById.set(tx.id, tx);
  applyAddressLinks(tx);
  applyTokenTx(tx);
  if (append) appendLine(files.txs(), tx);
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
    dropAfter(block.index - 1);
  } else if (block.index !== snapshot.syncedHeight + 1 && snapshot.syncedHeight >= 0) {
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
  snapshot.blocks.push(row);
  snapshot.blockByHeight.set(row.height, row);
  snapshot.blockByHash.set(row.hash, row);
  appendLine(files.blocks(), row);

  for (let index = 0; index < transactions.length; index++) {
    const payload = transactions[index];
    const txId = txIdFor(payload);
    if (!txId) continue;

    let receipt: Record<string, unknown> | null = null;
    if (executionFields(payload)) {
      receipt = (await san.receipt(block.index, index)) as Record<string, unknown> | null;
    }
    const txRow = condenseTransaction(payload, row, index, txId, receipt);
    pushTx(txRow, true);
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
// Read API: chain
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
    tokens: snapshot.tokens.size,
    verifiedContracts: snapshot.verifications.size,
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

export function allTxsAscending(): IndexedTx[] {
  return state().txs;
}

export function getBlock(height: number): IndexedBlock | null {
  return state().blockByHeight.get(height) ?? null;
}

export function getBlockByHash(hash: string): IndexedBlock | null {
  return state().blockByHash.get(hash) ?? null;
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

export function allAddressStats(): AddressStats[] {
  return [...state().addressStats.values()];
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

// ---------------------------------------------------------------------------
// Read API: contracts and tokens
// ---------------------------------------------------------------------------

export function getContractDeploy(contractId: string): IndexedTx | null {
  const snapshot = state();
  const txId = snapshot.contractDeploys.get(contractId);
  return txId ? (snapshot.txById.get(txId) ?? null) : null;
}

export function getContractFunctions(contractId: string): string[] {
  const deploy = getContractDeploy(contractId);
  if (!deploy?.contractCode) return [];
  return extractFunctions(deploy.contractCode);
}

export function getContractSignatures(contractId: string): Record<string, string[]> {
  const deploy = getContractDeploy(contractId);
  if (!deploy?.contractCode) return {};
  return parseFunctionSignatures(deploy.contractCode);
}

export function listTokens(): TokenRecord[] {
  const snapshot = state();
  return [...snapshot.tokens.values()].sort((a, b) => {
    if (a.deployBlock === null) return 1;
    if (b.deployBlock === null) return -1;
    return (b.deployBlock ?? 0) - (a.deployBlock ?? 0);
  });
}

export function getToken(contractId: string): TokenRecord | null {
  return state().tokens.get(contractId) ?? null;
}

export function searchTokens(query: string): TokenRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return [...state().tokens.values()].filter(
    (token) =>
      token.id.toLowerCase() === needle ||
      token.symbol?.toLowerCase() === needle ||
      token.name?.toLowerCase().includes(needle),
  );
}

export function listTokenEvents(options: {
  contract?: string;
  address?: string;
  standard?: "SANRC20" | "SANRC721";
  offset: number;
  limit: number;
}): Page<TokenEvent> {
  const snapshot = state();
  let rows: TokenEvent[];
  if (options.contract) {
    rows = [...(snapshot.tokenEventsByContract.get(options.contract) ?? [])].reverse();
  } else if (options.address) {
    rows = [...(snapshot.tokenEventsByAddress.get(options.address.toLowerCase()) ?? [])].reverse();
  } else {
    rows = [...snapshot.tokenEvents].reverse();
  }
  if (options.standard) {
    rows = rows.filter((row) => snapshot.tokens.get(row.contractId)?.standard === options.standard);
  }
  return { total: rows.length, items: rows.slice(options.offset, options.offset + options.limit) };
}

export function addressTokenTransferCount(
  address: string,
  standard?: "SANRC20" | "SANRC721",
): number {
  return listTokenEvents({ address, standard, offset: 0, limit: 1 }).total;
}

export function getTokenEventForTx(txId: string): TokenEvent | null {
  return state().tokenEventByTx.get(txId) ?? null;
}

export function enrichTokenEvents(events: TokenEvent[]): import("./types").TokenTransferRow[] {
  const snapshot = state();
  return events.map((event) => {
    const token = snapshot.tokens.get(event.contractId);
    return {
      ...event,
      standard: token?.standard ?? null,
      symbol: token?.symbol ?? null,
      name: token?.name ?? null,
    };
  });
}

export function listTokenHolders(
  contractId: string,
  offset: number,
  limit: number,
): Page<HolderRow> {
  const snapshot = state();
  const token = snapshot.tokens.get(contractId);
  const holders = snapshot.tokenHolders.get(contractId) ?? new Map<string, string>();
  const rows = [...holders.entries()]
    .map(([address, balance]) => ({ address, balance }))
    .sort((a, b) => {
      const aValue = toBig(a.balance) ?? 0n;
      const bValue = toBig(b.balance) ?? 0n;
      if (aValue === bValue) return a.address.localeCompare(b.address);
      return bValue > aValue ? 1 : -1;
    });
  const total = token?.totalSupply ? (toBig(token.totalSupply) ?? 0n) : 0n;

  const page = rows.slice(offset, offset + limit).map((row) => {
    const value = toBig(row.balance) ?? 0n;
    const share =
      total > 0n ? `${(Number((value * 10000n) / total) / 100).toFixed(2)}%` : "—";
    return { address: row.address, balance: row.balance, share };
  });
  return { total: rows.length, items: page };
}

export function getAddressTokenHoldings(address: string): { token: TokenRecord; balance: string }[] {
  const snapshot = state();
  const normalized = address.toLowerCase();
  const rows: { token: TokenRecord; balance: string }[] = [];
  for (const [contractId, holders] of snapshot.tokenHolders) {
    const balance = holders.get(normalized);
    const token = snapshot.tokens.get(contractId);
    if (balance && token) rows.push({ token, balance });
  }
  return rows.sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
}

export function listTokenInventory(
  contractId: string,
  offset: number,
  limit: number,
): Page<{ tokenId: string; owner: string }> {
  const snapshot = state();
  const owners = snapshot.nftOwners.get(contractId) ?? new Map<string, string>();
  const rows = [...owners.entries()]
    .map(([tokenId, owner]) => ({ tokenId, owner }))
    .sort((a, b) => {
      const aId = toBig(a.tokenId) ?? 0n;
      const bId = toBig(b.tokenId) ?? 0n;
      return aId < bId ? -1 : aId > bId ? 1 : 0;
    });
  return { total: rows.length, items: rows.slice(offset, offset + limit) };
}

// ---------------------------------------------------------------------------
// Read API: verification
// ---------------------------------------------------------------------------

export function getVerification(contractId: string): VerificationRecord | null {
  return state().verifications.get(contractId) ?? null;
}

export function saveVerification(record: VerificationRecord): void {
  const snapshot = state();
  snapshot.verifications.set(record.contractId, record);
  const token = snapshot.tokens.get(record.contractId);
  if (token) token.verified = true;
  appendLine(files.verifications(), record);
}

export function listVerifications(): VerificationRecord[] {
  return [...state().verifications.values()].sort((a, b) => b.verifiedAt - a.verifiedAt);
}

// ---------------------------------------------------------------------------
// Read API: aggregates
// ---------------------------------------------------------------------------

export function gasStats(): GasStats {
  const snapshot = state();
  const execution = snapshot.txs.filter((tx) => tx.gasUsed !== null && tx.gasUsed > 0);
  const recent = execution.slice(-500);
  const gasPrices = recent.map((tx) => tx.gasPrice).filter((value) => value > 0);
  const average =
    gasPrices.length > 0 ? gasPrices.reduce((sum, value) => sum + value, 0) / gasPrices.length : null;
  const fees = recent.map((tx) => tx.fee).sort((a, b) => a - b);
  const median = fees.length > 0 ? fees[Math.floor(fees.length / 2)] : null;
  const collected = snapshot.txs.reduce((sum, tx) => sum + BigInt(tx.fee || 0), 0n);
  const gasUsed = snapshot.txs.reduce((sum, tx) => sum + (tx.gasUsed ?? 0), 0);

  const latestBlocks = snapshot.blocks.slice(-10).reverse().map((block) => ({
    height: block.height,
    timestamp: block.timestamp,
    txs: block.txCount,
    gasUsed: snapshot.txs
      .filter((tx) => tx.block === block.height)
      .reduce((sum, tx) => sum + (tx.gasUsed ?? 0), 0),
    feeUnits: block.feeUnits,
  }));

  const baseFee = snapshot.lastHealth?.base_fee ?? 1;
  return {
    baseFee,
    minGasPrice: 1,
    averageGasPrice: average === null ? null : Number(average.toFixed(2)),
    medianFee: median === null ? null : fromUnits(median),
    transferFeeEstimate: "80",
    executionCount: execution.length,
    collectedFeeUnits: collected.toString(),
    gasUsed,
    latestBlocks,
  };
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
