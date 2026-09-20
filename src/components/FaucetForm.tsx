"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useWallet } from "@/components/useWallet";
import { isAddress, shortHash } from "@/lib/format";
import type { FaucetGrant } from "@/lib/types";

interface FaucetResponse {
  status?: string;
  tx_id?: string;
  amount?: string;
  detail?: string;
}

export default function FaucetForm({ initialGrants }: { initialGrants: FaucetGrant[] }) {
  const { wallet } = useWallet();
  const [address, setAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FaucetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grants, setGrants] = useState<FaucetGrant[]>(initialGrants);

  const refreshGrants = useCallback(async () => {
    try {
      const response = await fetch("/api/faucet", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { grants: FaucetGrant[] };
      setGrants(data.grants ?? []);
    } catch {
      // keep current list
    }
  }, []);

  useEffect(() => {
    if (wallet && !address) setAddress(wallet.address);
  }, [wallet, address]);

  async function requestFaucet(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!isAddress(address)) {
      setError("Enter a valid 0x address (20 bytes).");
      return;
    }
    if (amount && !/^\d+(\.\d{1,8})?$/.test(amount.trim())) {
      setError("Amount must be a positive SAN value (max 8 decimals).");
      return;
    }

    setBusy(true);
    try {
      const body: Record<string, unknown> = { address: address.trim().toLowerCase() };
      if (amount.trim()) body.amount = amount.trim();
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as FaucetResponse;
      if (!response.ok) throw new Error(data.detail ?? "Faucet request failed");
      setResult(data);
      void refreshGrants();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Request testnet SAN</h2>
        </div>
        <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={requestFaucet}>
          <label className="sm:col-span-2">
            <span className="stat-label">Your address</span>
            <input
              className="input mt-1 font-mono"
              placeholder="0x…"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <label>
            <span className="stat-label">Amount in SAN (optional)</span>
            <input
              className="input mt-1"
              placeholder="node default"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="btn bg-success text-white hover:bg-emerald-600" type="submit" disabled={busy}>
              {busy ? "Requesting…" : "Send me SAN"}
            </button>
            {wallet && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setAddress(wallet.address)}
              >
                Use wallet
              </button>
            )}
          </div>
        </form>
        <div className="border-t border-line px-4 py-3 text-[12.5px] text-gray-600">
          <p>
            The faucet signs a normal transfer from the node&apos;s identity, so the node must be
            started with the faucet enabled (<span className="font-mono">SAN_FAUCET=1</span> or{" "}
            <span className="font-mono">--faucet</span>). Per-address cooldowns and caps are
            enforced by the node.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <p className="font-semibold">
            Sent {result.amount ?? amount ?? "?"} SAN to {shortHash(address, 8)}
          </p>
          {result.tx_id && (
            <p className="mt-1">
              Transaction:{" "}
              <Link className="link mono" href={`/tx/${result.tx_id}`}>
                {result.tx_id}
              </Link>
            </p>
          )}
          <p className="mt-1 text-[12px]">
            The transfer enters the mempool and is committed when the node produces the next block.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Recent faucet grants</h2>
          <button className="btn btn-ghost" onClick={() => void refreshGrants()}>
            Refresh
          </button>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Address</th>
                <th>Amount</th>
                <th>Transaction</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {grants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
                    No faucet grants recorded yet.
                  </td>
                </tr>
              ) : (
                grants.map((grant, index) => (
                  <tr key={`${grant.txId ?? grant.address}-${grant.ts}-${index}`}>
                    <td>
                      <Link className="link mono" href={`/address/${grant.address}`}>
                        {shortHash(grant.address, 10)}
                      </Link>
                    </td>
                    <td>{grant.amount} SAN</td>
                    <td>
                      {grant.txId ? (
                        <Link className="link mono" href={`/tx/${grant.txId}`}>
                          {shortHash(grant.txId, 8)}
                        </Link>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="text-gray-500">
                      {new Date(grant.ts).toISOString().replace("T", " ").slice(0, 19)} UTC
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
