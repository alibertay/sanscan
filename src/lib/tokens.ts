/**
 * SANRC20 / SANRC721 support.
 *
 * SAN contracts are PENA programs, not EVM bytecode, so there is no ABI:
 * function signatures come from the deployed source, and token events are
 * derived from the *signed transaction params* plus the contract's `print`
 * logs (e.g. `TRANSFER_OK: 0xa -> 0xb`). The shipped SANRC20/SANRC721
 * examples in the SAN repository define these exact conventions.
 */

import type { IndexedTx, LogEntry, TokenEvent, TokenEventName, TokenStandard } from "./types";

const FUNCTION_REGEX = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;

/** Function names in source order, deduplicated. */
export function extractFunctions(source: string | null | undefined): string[] {
  if (!source) return [];
  const names = new Set<string>();
  FUNCTION_REGEX.lastIndex = 0;
  let match = FUNCTION_REGEX.exec(source);
  while (match) {
    names.add(match[1]);
    match = FUNCTION_REGEX.exec(source);
  }
  return [...names];
}

/** Function name -> declared parameter names (used to decode tx input). */
export function parseFunctionSignatures(
  source: string | null | undefined,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  if (!source) return result;
  FUNCTION_REGEX.lastIndex = 0;
  let match = FUNCTION_REGEX.exec(source);
  while (match) {
    const params = match[2]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    result[match[1]] = params;
    match = FUNCTION_REGEX.exec(source);
  }
  return result;
}

export function detectStandard(functions: string[]): TokenStandard | null {
  const has = (name: string) => functions.includes(name);
  if (has("transfer") && has("balanceOf") && has("totalSupply")) return "SANRC20";
  if (has("ownerOf") && has("balanceOf") && (has("transferFrom") || has("safeTransferFrom"))) {
    return "SANRC721";
  }
  if (has("balanceOf") && has("transferFrom") && has("name") && has("symbol")) {
    return "SANRC20";
  }
  return null;
}

/** Convert a JSON param to BigInt when it is an integer; null otherwise. */
export function toBig(value: unknown): bigint | null {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (Number.isInteger(value)) return BigInt(value);
    const text = value.toString();
    return /^\d+$/.test(text) ? BigInt(text) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[+-]?\d+$/.test(trimmed)) return BigInt(trimmed);
    return null;
  }
  return null;
}

/** Render a numeric param as a plain integer string when possible. */
function stringifyParam(value: unknown): string | null {
  const big = toBig(value);
  if (big !== null) return big.toString();
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text || null;
}

export function asAddressParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(trimmed)) return trimmed;
  return trimmed || null;
}

function logValues(logs: LogEntry[] | null): string[] {
  if (!Array.isArray(logs)) return [];
  return logs
    .map((log) => (log && typeof log === "object" ? (log as Record<string, unknown>).value : null))
    .filter((value): value is string => typeof value === "string");
}

function printedOk(logs: LogEntry[] | null, marker: string): boolean {
  const values = logValues(logs);
  if (values.length === 0) return true; // receipt/logs unavailable: trust execution status
  return values.some((value) => value.includes(marker));
}

interface EventShape {
  event: TokenEventName;
  from?: number;
  to?: number;
  amount?: number;
  tokenId?: number;
  marker?: string;
}

/** Function -> event mapping for the canonical SANRC20/SANRC721 contracts. */
const EVENT_TABLE: Record<TokenStandard, Record<string, EventShape>> = {
  SANRC20: {
    init: { event: "Init" },
    transfer: { event: "Transfer", from: 0, to: 1, amount: 2, marker: "TRANSFER_OK" },
    transferFrom: {
      event: "Transfer",
      from: 1,
      to: 2,
      amount: 3,
      marker: "TRANSFER_FROM_OK",
    },
    mint: { event: "Mint", to: 1, amount: 2, marker: "MINT_OK" },
    burn: { event: "Burn", from: 0, amount: 1, marker: "BURN_OK" },
    approve: { event: "Approval", from: 0, to: 1, amount: 2, marker: "APPROVE_OK" },
  },
  SANRC721: {
    init: { event: "Init" },
    transferFrom: {
      event: "Transfer",
      from: 1,
      to: 2,
      tokenId: 3,
      marker: "TRANSFER_OK",
    },
    mint: { event: "Mint", to: 1, tokenId: 2, marker: "MINT_OK" },
    burn: { event: "Burn", from: 0, tokenId: 1, marker: "BURN_OK" },
    approve: { event: "Approval", from: 0, to: 1, tokenId: 2, marker: "APPROVE_OK" },
    setApprovalForAll: {
      event: "ApprovalForAll",
      from: 0,
      to: 1,
      amount: 2,
      marker: "APPROVAL_FOR_ALL_OK",
    },
  },
};

export interface TokenEventDraft {
  contractId: string;
  txId: string;
  block: number;
  index: number;
  ts: number;
  function: string;
  event: TokenEventName;
  from: string | null;
  to: string | null;
  amount: string | null;
  tokenId: string | null;
  ok: boolean;
}

/** Derive a token event from an indexed contract call, or null. */
export function tokenEventFromTx(
  tx: IndexedTx,
  standard: TokenStandard,
): TokenEventDraft | null {
  if (!tx.contractId || !tx.functionName) return null;
  const shape = EVENT_TABLE[standard][tx.functionName];
  if (!shape) return null;
  const params = Array.isArray(tx.params) ? tx.params : [];
  if (tx.functionName !== "init" && params.length === 0) return null;

  const pick = (position: number | undefined) =>
    position === undefined ? undefined : params[position];

  const ok = shape.marker ? printedOk(tx.logs, shape.marker) : true;
  const amountValue = pick(shape.amount);

  return {
    contractId: tx.contractId,
    txId: tx.id,
    block: tx.block,
    index: tx.index,
    ts: tx.timestamp,
    function: tx.functionName,
    event: shape.event,
    from: shape.from === undefined ? null : asAddressParam(pick(shape.from)),
    to: shape.to === undefined ? null : asAddressParam(pick(shape.to)),
    amount:
      shape.event === "Init" || amountValue === undefined
        ? null
        : stringifyParam(amountValue),
    tokenId: shape.tokenId === undefined ? null : stringifyParam(pick(shape.tokenId)),
    ok,
  };
}

export interface TokenInitMetadata {
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
  owner: string | null;
}

/** Extract token metadata from an `init` call for the given standard. */
export function metadataFromInit(
  tx: IndexedTx,
  standard: TokenStandard,
): TokenInitMetadata | null {
  if (tx.functionName !== "init" || !Array.isArray(tx.params)) return null;
  const params = tx.params;
  if (standard === "SANRC20") {
    if (params.length < 5) return null;
    return {
      name: typeof params[0] === "string" ? params[0] : null,
      symbol: typeof params[1] === "string" ? params[1] : null,
      decimals: toBig(params[2]) !== null ? Number(toBig(params[2])) : null,
      totalSupply: toBig(params[3])?.toString() ?? null,
      owner: asAddressParam(params[4]),
    };
  }
  if (params.length < 3) return null;
  return {
    name: typeof params[0] === "string" ? params[0] : null,
    symbol: typeof params[1] === "string" ? params[1] : null,
    decimals: null,
    totalSupply: "0",
    owner: asAddressParam(params[2]),
  };
}

/** Format a raw token amount without guessing decimals (SAN tokens are raw). */
export function formatTokenAmount(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  return amount.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function tokenEventToRow(event: TokenEvent) {
  return event;
}
