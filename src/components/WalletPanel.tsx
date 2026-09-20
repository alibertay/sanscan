"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import CopyButton from "@/components/CopyButton";
import { useWallet } from "@/components/useWallet";
import { formatSan, fromUnits, isAddress, toUnits } from "@/lib/format";
import type { NodeAccount, SubmitResult } from "@/lib/types";
import { signPayload } from "@/lib/wallet";

interface AddressResponse {
  address: string;
  account: NodeAccount | null;
  validator: { stake?: string; stake_units?: number | string } | null;
  error?: string | null;
}

export default function WalletPanel() {
  const { wallet, loaded, create, importKey, remove } = useWallet();
  const [account, setAccount] = useState<AddressResponse | null>(null);
  const [chainId, setChainId] = useState<string>("");
  const [secretInput, setSecretInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // send form
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<SubmitResult | null>(null);

  // stake form
  const [stakeAmount, setStakeAmount] = useState("100");

  const refresh = useCallback(async () => {
    if (!wallet) return;
    try {
      const [addressResponse, statsResponse] = await Promise.all([
        fetch(`/api/address/${wallet.address}`, { cache: "no-store" }),
        fetch("/api/stats", { cache: "no-store" }),
      ]);
      if (addressResponse.ok) setAccount((await addressResponse.json()) as AddressResponse);
      if (statsResponse.ok) {
        const stats = (await statsResponse.json()) as { chainId?: string };
        if (stats.chainId) setChainId(stats.chainId);
      }
    } catch {
      // offline: keep previous values
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function submitTransaction(payload: Record<string, unknown>): Promise<SubmitResult> {
    if (!wallet) throw new Error("No wallet loaded");
    const signature = signPayload(payload, wallet.secretKey);
    const response = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, signature }),
    });
    const data = (await response.json()) as SubmitResult;
    if (!response.ok) {
      throw new Error(data.detail ?? data.reason ?? "Transaction rejected");
    }
    return data;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;
    setNotice(null);
    setResult(null);

    if (!chainId) {
      setNotice({ kind: "error", text: "Cannot reach the SAN node: chain id is unknown." });
      return;
    }
    if (!isAddress(to)) {
      setNotice({ kind: "error", text: "Receiver must be a 0x address (20 bytes)." });
      return;
    }
    if (!/^\d+(\.\d{1,8})?$/.test(amount.trim()) || toUnits(amount) <= 0n) {
      setNotice({ kind: "error", text: "Amount must be a positive SAN value (max 8 decimals)." });
      return;
    }

    setBusy(true);
    try {
      const nonce = account?.account?.nonce ?? 0;
      const payload = {
        chain_id: chainId,
        sender: wallet.publicKey,
        nonce,
        receiver: to.trim().toLowerCase(),
        value: amount.trim(),
      };
      const data = await submitTransaction(payload);
      setResult(data);
      setNotice({
        kind: "ok",
        text: `Transaction ${data.status ?? "submitted"}${data.tx_id ? `: ${data.tx_id}` : ""}`,
      });
      setAmount("");
      void refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function stake(command: "deposit" | "undelegate" | "withdraw") {
    if (!wallet) return;
    setNotice(null);
    setResult(null);
    if (!chainId) {
      setNotice({ kind: "error", text: "Cannot reach the SAN node: chain id is unknown." });
      return;
    }
    setBusy(true);
    try {
      const nonce = account?.account?.nonce ?? 0;
      let validator: Record<string, unknown>;
      if (command === "deposit") {
        if (!/^\d+$/.test(stakeAmount.trim()) || Number(stakeAmount) <= 0) {
          throw new Error("Stake amount must be a positive whole number of SAN");
        }
        validator = { command, amount: Number(toUnits(stakeAmount.trim())) };
      } else {
        validator = { command };
      }
      const payload = {
        chain_id: chainId,
        sender: wallet.publicKey,
        nonce,
        validator,
      };
      const data = await submitTransaction(payload);
      setResult(data);
      setNotice({ kind: "ok", text: `Staking ${command} ${data.status ?? "submitted"}` });
      void refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  async function faucet() {
    if (!wallet) return;
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet.address }),
      });
      const data = (await response.json()) as { detail?: string; amount?: string; tx_id?: string };
      if (!response.ok) throw new Error(data.detail ?? "Faucet rejected the request");
      setNotice({ kind: "ok", text: `Faucet sent ${data.amount} SAN (tx ${data.tx_id})` });
      void refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return <div className="card p-6 text-[13px] text-gray-500">Loading wallet…</div>;
  }

  if (!wallet) {
    return (
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="text-[15px] font-semibold text-ink-900">Create a post-quantum wallet</h2>
          <p className="mt-1 text-[13px] text-gray-600">
            Sanscan generates an <strong>ML-DSA-44</strong> (FIPS 204) keypair in your browser.
            The private key never leaves this page — it is stored only in your browser&apos;s
            localStorage. This is a testnet tool: do not reuse it for real value.
          </p>
          <button className="btn btn-primary mt-4" onClick={() => create()}>
            Generate new wallet
          </button>
        </div>

        <div className="card p-5">
          <h2 className="text-[15px] font-semibold text-ink-900">Import an existing key</h2>
          <p className="mt-1 text-[13px] text-gray-600">
            Paste an ML-DSA-44 secret key (hex). Public key and 0x address are derived locally.
          </p>
          <textarea
            className="input mt-3 font-mono text-[12px]"
            rows={4}
            placeholder="secret key hex"
            value={secretInput}
            onChange={(event) => setSecretInput(event.target.value)}
          />
          <button
            className="btn btn-dark mt-3"
            disabled={secretInput.trim().length === 0}
            onClick={() => {
              try {
                importKey(secretInput.trim());
                setSecretInput("");
                setNotice(null);
              } catch (error) {
                setNotice({
                  kind: "error",
                  text: error instanceof Error ? error.message : String(error),
                });
              }
            }}
          >
            Import wallet
          </button>
        </div>

        {notice && (
          <div
            className={`rounded-md border px-4 py-2 text-[13px] ${
              notice.kind === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>
    );
  }

  const balance = account?.account
    ? formatSan(fromUnits(account.account.balance_units))
    : "—";
  const stakeValue = account?.validator?.stake ? formatSan(account.validator.stake) : null;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">My Wallet</h2>
          <div className="flex gap-2">
            <button className="btn btn-outline" onClick={() => void refresh()} disabled={busy}>
              Refresh
            </button>
            <button
              className="btn btn-outline text-danger"
              onClick={() => {
                if (confirm("Remove this wallet from the browser? Make sure you saved the key.")) {
                  remove();
                }
              }}
            >
              Remove
            </button>
          </div>
        </div>
        <div className="space-y-2 p-4">
          <div className="kv-row">
            <span className="kv-key">Address</span>
            <span className="kv-value flex items-center gap-2">
              <Link className="link mono" href={`/address/${wallet.address}`}>
                {wallet.address}
              </Link>
              <CopyButton value={wallet.address} />
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Balance</span>
            <span className="kv-value font-semibold">{balance} SAN</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Nonce</span>
            <span className="kv-value">{account?.account?.nonce ?? "—"}</span>
          </div>
          {stakeValue && (
            <div className="kv-row">
              <span className="kv-key">Validator stake</span>
              <span className="kv-value">{stakeValue} SAN</span>
            </div>
          )}
          <div className="kv-row">
            <span className="kv-key">Public key</span>
            <span className="kv-value mono break-all text-[11px]">{wallet.publicKey}</span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Private key</span>
            <span className="kv-value">
              {reveal ? (
                <span className="flex flex-wrap items-center gap-2">
                  <code className="mono break-all text-[11px]">{wallet.secretKey}</code>
                  <CopyButton value={wallet.secretKey} />
                </span>
              ) : (
                <button className="btn btn-ghost px-0" onClick={() => setReveal(true)}>
                  Click to reveal (save it!)
                </button>
              )}
            </span>
          </div>
          <div className="pt-2">
            <button className="btn bg-success text-white hover:bg-emerald-600" onClick={() => void faucet()} disabled={busy}>
              Request faucet ({wallet.address.slice(0, 6)}…)
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Send SAN</h2>
        </div>
        <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={send}>
          <label className="sm:col-span-2">
            <span className="stat-label">Receiver address</span>
            <input
              className="input mt-1 font-mono"
              placeholder="0x…"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <label>
            <span className="stat-label">Amount (SAN)</span>
            <input
              className="input mt-1"
              placeholder="10.5"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <div className="flex items-end">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? "Signing…" : "Sign & Send"}
            </button>
          </div>
        </form>
        <p className="px-4 pb-4 text-[12px] text-gray-500">
          Signed locally with ML-DSA-44. The node verifies the signature, charges the
          deterministic size fee and pools the transaction.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Validator Actions</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <label>
            <span className="stat-label">Deposit (SAN, whole)</span>
            <input
              className="input mt-1 w-36"
              value={stakeAmount}
              onChange={(event) => setStakeAmount(event.target.value)}
            />
          </label>
          <button className="btn btn-dark" onClick={() => void stake("deposit")} disabled={busy}>
            Deposit stake
          </button>
          <button className="btn btn-outline" onClick={() => void stake("undelegate")} disabled={busy}>
            Undelegate
          </button>
          <button className="btn btn-outline" onClick={() => void stake("withdraw")} disabled={busy}>
            Withdraw (after unbonding)
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-md border px-4 py-2 text-[13px] ${
            notice.kind === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      {result && (
        <div className="card p-4 text-[13px]">
          <p className="font-semibold text-ink-900">Node response</p>
          <pre className="mt-2 overflow-auto rounded border border-line bg-surface p-3 text-[12px]">
            {JSON.stringify(result, null, 2)}
          </pre>
          {result.tx_id && (
            <Link className="link mt-2 inline-block text-[13px]" href={`/tx/${result.tx_id}`}>
              Open transaction →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
