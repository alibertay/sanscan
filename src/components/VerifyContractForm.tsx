"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { VerificationRecord } from "@/lib/types";

interface VerifyResponse {
  status?: string;
  verification?: VerificationRecord;
  detail?: string;
}

export default function VerifyContractForm() {
  const searchParams = useSearchParams();
  const [contractId, setContractId] = useState(searchParams.get("contract") ?? "");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationRecord | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/verify-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: contractId.trim(), source }),
      });
      const data = (await response.json()) as VerifyResponse;
      if (!response.ok) throw new Error(data.detail ?? "Verification failed");
      setResult(data.verification ?? null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="card" onSubmit={submit}>
        <div className="card-header">
          <h2 className="card-title">Verify &amp; Publish Contract Source</h2>
          <span className="text-[12px] text-gray-500">No account required</span>
        </div>
        <div className="space-y-3 p-4">
          <label className="block">
            <span className="stat-label">Contract ID</span>
            <input
              className="input mt-1 font-mono"
              placeholder="sanrc20"
              value={contractId}
              onChange={(event) => setContractId(event.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="stat-label">PENA / PASM source (exactly as deployed)</span>
            <textarea
              className="input mt-1 min-h-[320px] font-mono text-[12px]"
              placeholder={"value = 1\nfunction get() {\n  return value\n}\n"}
              value={source}
              onChange={(event) => setSource(event.target.value)}
              required
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Verifying…" : "Verify & Publish"}
          </button>
          <span className="text-[12px] text-gray-500">
            The source must match the code signed in the deployment transaction.
          </span>
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <p className="font-semibold">Verification failed</p>
          <p className="mt-1 whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {result && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <p className="font-semibold">Contract verified successfully</p>
          <ul className="mt-2 space-y-1">
            <li>
              Contract:{" "}
              <Link className="link mono" href={`/contract/${encodeURIComponent(result.contractId)}`}>
                {result.contractId}
              </Link>
            </li>
            <li>
              Match type: <strong>{result.matchType}</strong> · compiler {result.compiler}
            </li>
            <li className="mono break-all">Source hash: {result.sourceHash}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
