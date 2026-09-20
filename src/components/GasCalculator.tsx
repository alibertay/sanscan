"use client";

import { useMemo, useState } from "react";

import { formatSan, fromUnits, toUnits } from "@/lib/format";

export default function GasCalculator({ baseFee = 1 }: { baseFee?: number }) {
  const [sizeBytes, setSizeBytes] = useState("7600");
  const [feeRate, setFeeRate] = useState("0.01");
  const [gasLimit, setGasLimit] = useState("0");
  const [gasPrice, setGasPrice] = useState(String(baseFee));

  const estimate = useMemo(() => {
    const size = Number(sizeBytes) || 0;
    const rate = Number(feeRate) || 0;
    const limit = Number(gasLimit) || 0;
    const price = Number(gasPrice) || 0;
    const sizeFeeUnits = BigInt(Math.round(size * rate * 1e8));
    const gasUnits = BigInt(Math.round(limit * price));
    const total = sizeFeeUnits + gasUnits;
    return {
      sizeFee: fromUnits(sizeFeeUnits),
      gasFee: fromUnits(gasUnits),
      total: fromUnits(total),
      totalFormatted: formatSan(fromUnits(total)),
    };
  }, [sizeBytes, feeRate, gasLimit, gasPrice]);

  function preset(kind: "transfer" | "call" | "deploy") {
    if (kind === "transfer") {
      setSizeBytes("7600");
      setGasLimit("0");
    } else if (kind === "call") {
      setSizeBytes("7700");
      setGasLimit("1000000");
    } else {
      setSizeBytes("9500");
      setGasLimit("3000000");
    }
    setFeeRate("0.01");
    setGasPrice(String(baseFee));
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" onClick={() => preset("transfer")}>
            Transfer preset
          </button>
          <button className="btn btn-outline" onClick={() => preset("call")}>
            Contract call preset
          </button>
          <button className="btn btn-outline" onClick={() => preset("deploy")}>
            Deploy preset
          </button>
        </div>
        <label className="block">
          <span className="stat-label">Serialized transaction size (bytes)</span>
          <input
            className="input mt-1"
            value={sizeBytes}
            onChange={(event) => setSizeBytes(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="stat-label">Fee rate (SAN per byte, min 0.01)</span>
          <input
            className="input mt-1"
            value={feeRate}
            onChange={(event) => setFeeRate(event.target.value)}
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
            <span className="stat-label">Gas price (base units)</span>
            <input
              className="input mt-1"
              value={gasPrice}
              onChange={(event) => setGasPrice(event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="space-y-3">
        <div className="card p-4">
          <p className="stat-label">Estimated total fee</p>
          <p className="stat-value">{estimate.totalFormatted} SAN</p>
          <p className="mt-1 text-[12px] text-gray-500">
            {estimate.total} base units (1 SAN = 10^8 units)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="stat-label">Size fee</p>
            <p className="stat-value">{estimate.sizeFee} SAN</p>
          </div>
          <div className="card p-4">
            <p className="stat-label">Gas fee</p>
            <p className="stat-value">{estimate.gasFee} SAN</p>
          </div>
        </div>
        <p className="text-[12px] text-gray-500">
          An ML-DSA-44 transfer includes a 2.6 KB public key and a 4.8 KB signature, so the size
          fee dominates. Fees are charged up front; unused gas is refunded to the sender.
        </p>
      </div>
    </div>
  );
}
