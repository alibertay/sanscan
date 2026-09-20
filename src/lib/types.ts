export type SanAmount = string | number;

export interface HealthInfo {
  status: string;
  chain_id: string;
  schema_version: number;
  height: number;
  tip_hash: string;
  state_root: string;
  base_fee: number;
  finalized_height: number;
  finalized_hash: string;
  peers: number;
  controllers: number;
  mempool: number;
  contracts: number;
  validators: number;
  version_info?: {
    version?: string;
    go_version?: string;
    protocol_name?: string;
    protocol_version?: number;
    schema_version?: number;
    build_date?: string;
    commit?: string;
  };
}

export interface NodeAccount {
  address: string;
  balance_units: number | string;
  balance: SanAmount;
  nonce: number;
}

export interface ValidatorRow {
  address: string;
  stake_units: number | string;
  stake: string;
}

export interface ValidatorsInfo {
  finalized_height: number;
  finalized_hash: string;
  validators: ValidatorRow[];
  total_stake_units: number | string;
  min_stake_units: number | string;
  unbonding_period: number;
  slash_bps: number;
  base_fee: number;
  total_burned: number | string;
  parameters?: Record<string, number | string>;
}

export interface GenesisInfo {
  chain_id: string;
  schema_version?: number;
  genesis_hash: string;
  genesis_fingerprint?: string;
  genesis_allocation?: Record<string, string>;
  parameters?: Record<string, string>;
}

export interface FinalityInfo {
  chain_id: string;
  height: number;
  tip_hash: string;
  finalized_height: number;
  finalized_hash: string;
  pending_vote_heights?: number[];
}

export interface LogEntry {
  [key: string]: unknown;
}

export interface ReceiptInfo {
  block_index?: number;
  block_hash?: string | null;
  status?: string;
  gas_used?: number;
  gas_limit?: number;
  gas_price?: number;
  fee?: number;
  error?: string | null;
  logs?: LogEntry[];
  [key: string]: unknown;
}

export type TxKind =
  | "transfer"
  | "contract_deploy"
  | "contract_call"
  | "vm_run"
  | "stake"
  | "governance"
  | "unknown";

export interface TxPayload {
  chain_id?: string;
  sender?: string;
  receiver?: string;
  value?: SanAmount;
  nonce?: number;
  fee?: number;
  signature?: string;
  gas_limit?: number;
  gas_price?: number;
  bytecode?: unknown;
  contract_code?: {
    command?: string;
    contract_id?: string;
    function_name?: string;
    params?: unknown[];
    pena_code?: string;
    language?: string;
  };
  validator?: {
    command?: string;
    amount?: number;
    vote_a?: unknown;
    vote_b?: unknown;
  };
  governance?: {
    command?: string;
    name?: string;
    value?: number;
    approvals?: unknown[];
  };
  [key: string]: unknown;
}

export interface BlockInfo {
  chain_id?: string;
  index: number;
  current_block_hash: string;
  previous_block_hash: string;
  timestamp: number;
  validator?: string;
  validator_signature?: string;
  transactions?: TxPayload[];
  tx_root?: string;
  state_root?: string;
  round?: number;
  reward_address?: string | null;
  version?: number;
}

export interface IndexedBlock {
  height: number;
  hash: string;
  parent: string;
  timestamp: number;
  round: number;
  proposer: string;
  proposerAddress: string;
  rewardAddress: string | null;
  txCount: number;
  txRoot: string;
  stateRoot: string;
  chainId: string;
  feeUnits: string;
}

export interface IndexedTx {
  id: string;
  block: number;
  blockHash: string;
  index: number;
  timestamp: number;
  from: string;
  sender: string;
  to: string | null;
  valueUnits: string;
  value: string;
  fee: number;
  nonce: number;
  kind: TxKind;
  label: string;
  contractId: string | null;
  functionName: string | null;
  gasLimit: number;
  gasPrice: number;
  status: string | null;
  gasUsed: number | null;
  logs: LogEntry[] | null;
  error: string | null;
}

export interface AddressStats {
  address: string;
  sent: number;
  received: number;
  sentUnits: string;
  receivedUnits: string;
  firstTs: number;
  lastTs: number;
  deploys: number;
  contractCalls: number;
}

export interface SubmitResult {
  status?: string;
  tx_id?: string;
  block_index?: number;
  fee?: number;
  reason?: string;
  detail?: string;
}

export interface FaucetGrant {
  address: string;
  amount: string;
  txId: string | null;
  ts: number;
  status: string;
  [key: string]: unknown;
}

export interface HomePayload {
  online: boolean;
  chainId: string;
  syncedHeight: number;
  indexedBlocks: number;
  indexedTxs: number;
  indexedAddresses: number;
  health: HealthInfo | null;
  blocks: IndexedBlock[];
  txs: IndexedTx[];
  error?: string | null;
}

export interface ChartPoint {
  label: string;
  ts: number;
  blocks: number;
  txs: number;
  gasUsed: number;
  addresses: number;
}

export interface ChartPayload {
  window: "24h" | "7d" | "30d";
  points: ChartPoint[];
  supply: {
    premine: string;
    blockReward: string;
    height: number;
    total: string;
  } | null;
}
