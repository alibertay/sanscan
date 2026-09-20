"use client";

import Link from "next/link";
import { useState } from "react";

import JsonBlock from "@/components/JsonBlock";
import { useWallet } from "@/components/useWallet";
import type { SubmitResult } from "@/lib/types";
import { signPayload } from "@/lib/wallet";

function parseParams(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) throw new Error("Params must be a JSON array, e.g. [\"Alice\", 5]");
  return parsed;
}

export default function ContractConsole({
  contractId,
  functions,
}: {
  contractId: string;
  functions: string[];
}) {
  const { wallet } = useWallet();
  const [functionName, setFunctionName] = useState(functions[0] ?? "");
  const [paramsText, setParamsText] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gasLimit, setGasLimit] = useState("1000000");
  const [gasPrice, setGasPrice] = useState("1");
  const [txResult, setTxResult] = useState<SubmitResult | null>(null);
  const [chainId, setChainId] = useState("");

  async function chainIdValue(): Promise<string> {
    if (chainId) return chainId;
    const response = await fetch("/api/stats", { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot reach the SAN node");
    const data = (await response.json()) as { chainId?: string };
    if (!data.chainId) throw new Error("Cannot read chain id from the node");
    setChainId(data.chainId);
    return data.chainId;
  }

  async function read(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setTxResult(null);
    try {
      const params = parseParams(paramsText);
      const response = await fetch("/api/contract/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: contractId, function_name: functionName, params }),
      });
      const data = (await response.json()) as { result?: unknown; detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "Query failed");
      setResult(data.result);
    } catch (readError) {
      setError(readError instanceof Error ? readError.message : String(readError));
    } finally {
      setBusy(false);
    }
  }

  async function write(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setTxResult(null);
    try {
      if (!wallet) throw new Error("Create or import a wallet first (Wallet page)");
      const params = parseParams(paramsText);
      const chain = await chainIdValue();
      const accountResponse = await fetch(`/api/address/${wallet.address}`, { cache: "no-store" });
      const accountData = (await accountResponse.json()) as { account?: { nonce?: number } };
      const payload = {
        chain_id: chain,
        sender: wallet.publicKey,
        nonce: accountData.account?.nonce ?? 0,
        gas_limit: Number(gasLimit) || 1000000,
        gas_price: Math.max(Number(gasPrice) || 1, 1),
        contract_code: {
          command: "run",
          contract_id: contractId,
          function_name: functionName,
          params,
        },
      };
      const signature = signPayload(payload, wallet.secretKey);
      const response = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, signature }),
      });
      const data = (await response.json()) as SubmitResult;
      if (!response.ok) throw new Error(data.detail ?? data.reason ?? "Transaction rejected");
      setTxResult(data);
    } catch (writeError) {
      setError(writeError instanceof Error ? writeError.message : String(writeError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="card" onSubmit={read}>
        <div className="card-header">
          <h2 className="card-title">Read Contract</h2>
          <span className="text-[12px] text-gray-500">Read-only call on a sandboxed state copy</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <label>
            <span className="stat-label">Function</span>
            <input
              className="input mt-1 font-mono"
              list={`functions-${contractId}`}
              value={functionName}
              onChange={(event) => setFunctionName(event.target.value)}
              placeholder="get"
            />
            <datalist id={`functions-${contractId}`}>
              {functions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label>
            <span className="stat-label">Params (JSON array)</span>
            <input
              className="input mt-1 font-mono"
              value={paramsText}
              onChange={(event) => setParamsText(event.target.value)}
              placeholder='["Alice", 5]'
            />
          </label>
        </div>
        <div className="flex items-center gap-2 px-4 pb-4">
          <button className="btn btn-primary" type="submit" disabled={busy || !functionName}>
            Query
          </button>
          {functions.length > 0 && (
            <span className="text-[12px] text-gray-500">
              Deployed functions: {functions.join(", ")}
            </span>
          )}
        </div>
      </form>

      {result !== null && (
        <div className="card p-4">
          <p className="mb-2 text-[13px] font-semibold text-ink-900">Result</p>
          <JsonBlock value={result} />
        </div>
      )}

      <form className="card" onSubmit={write}>
        <div className="card-header">
          <h2 className="card-title">Write Contract</h2>
          <span className="text-[12px] text-gray-500">
            {wallet ? `Signing with ${wallet.address.slice(0, 10)}…` : "Wallet required"}
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <label>
            <span className="stat-label">Function</span>
            <input
              className="input mt-1 font-mono"
              value={functionName}
              onChange={(event) => setFunctionName(event.target.value)}
              placeholder="bump"
            />
          </label>
          <label>
            <span className="stat-label">Params (JSON array)</span>
            <input
              className="input mt-1 font-mono"
              value={paramsText}
              onChange={(event) => setParamsText(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="stat-label">Gas limit</span>
              <input
                className="input mt-1"
                value={gasLimit}
                onChange={(event) => setGasLimit(event.target.value)}
              />
            </label>
            <label>
              <span className="stat-label">Gas price</span>
              <input
                className="input mt-1"
                value={gasPrice}
                onChange={(event) => setGasPrice(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 pb-4">
          <button className="btn btn-dark" type="submit" disabled={busy || !wallet || !functionName}>
            {busy ? "Signing…" : "Sign & Execute"}
          </button>
          {!wallet && (
            <Link className="link text-[13px]" href="/wallet">
              Create a wallet →
            </Link>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {txResult && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <p className="font-semibold">
            Transaction {txResult.status ?? "submitted"}{" "}
            {txResult.reason ? `— ${txResult.reason}` : ""}
          </p>
          {txResult.tx_id && (
            <Link className="link mono" href={`/tx/${txResult.tx_id}`}>
              {txResult.tx_id}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
