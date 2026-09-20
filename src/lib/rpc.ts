/** Server-side SAN node REST client. Never import from a client component. */

import { apiToken, rpcUrl } from "./env";
import type {
  BlockInfo,
  FinalityInfo,
  GenesisInfo,
  HealthInfo,
  NodeAccount,
  ReceiptInfo,
  ValidatorsInfo,
} from "./types";

export class SanRpcError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "SanRpcError";
    this.status = status;
  }
}

interface SanResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  detail: string | null;
}

export async function sanRequest<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<SanResponse<T>> {
  const { timeoutMs = 10000, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  headers.set("Accept", "application/json");
  if (requestInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = apiToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(`${rpcUrl()}${path}`, {
      ...requestInit,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "detail" in (data as Record<string, unknown>)
          ? String((data as Record<string, unknown>).detail)
          : `Node responded with HTTP ${response.status}`;
      return { ok: false, status: response.status, data: data as T, detail };
    }
    return { ok: true, status: response.status, data: data as T, detail: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, status: 0, data: null, detail: `Cannot reach SAN node: ${message}` };
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  const response = await sanRequest<T>(path, { timeoutMs: 8000 });
  return response.ok ? response.data : null;
}

export const san = {
  url: rpcUrl,

  health: () => getJson<HealthInfo>("/health"),

  account: (address: string) =>
    sanRequest<NodeAccount>(`/account/${encodeURIComponent(address)}`, { timeoutMs: 8000 }),

  block: (height: number) => getJson<BlockInfo>(`/block/${height}`),

  tx: (txId: string) => getJson<Record<string, unknown>>(`/tx/${encodeURIComponent(txId)}`),

  receipt: (height: number, index: number) =>
    getJson<ReceiptInfo>(`/receipt/${height}/${index}`),

  validators: () => getJson<ValidatorsInfo>("/validators"),

  genesis: () => getJson<GenesisInfo>("/genesis"),

  finality: () => getJson<FinalityInfo>("/finality"),

  evidence: () => getJson<{ evidence: unknown[] }>("/evidence"),

  mempool: () => sanRequest<{ count: number; tx_ids: string[] }>("/mempool", { timeoutMs: 8000 }),

  contracts: () => sanRequest<{ contracts: string[] }>("/contracts", { timeoutMs: 8000 }),

  bootstrap: () => getJson<{ peers: unknown[] }>("/bootstrap"),

  headers: (from: number, limit: number) =>
    getJson<{ headers: BlockInfo[] }>(`/headers?from_index=${from}&limit=${limit}`),

  sync: (from: number, limit: number) =>
    sanRequest<{
      chain_id: string;
      blocks: BlockInfo[];
      has_more: boolean;
      next_from_index?: number;
    }>(`/sync?from_index=${from}&limit=${limit}`, { timeoutMs: 20000 }),

  metricsText: async (): Promise<string | null> => {
    const headers = new Headers({ Accept: "text/plain" });
    const token = apiToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    try {
      const response = await fetch(`${rpcUrl()}/metrics`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  },

  queryContract: (contractId: string, functionName: string, params: unknown[]) =>
    sanRequest<{ result: unknown }>("/contract/query", {
      method: "POST",
      body: JSON.stringify({
        contract_id: contractId,
        function_name: functionName,
        params,
      }),
    }),

  submitTransaction: (payload: Record<string, unknown>) =>
    sanRequest<Record<string, unknown>>("/transaction", {
      method: "POST",
      body: JSON.stringify(payload),
      timeoutMs: 20000,
    }),

  faucet: (address: string, amount?: string | number) =>
    sanRequest<Record<string, unknown>>("/faucet", {
      method: "POST",
      body: JSON.stringify(amount === undefined ? { address } : { address, amount }),
      timeoutMs: 20000,
    }),
};
