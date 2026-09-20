"use client";

import { useMemo, useState } from "react";

import { formatSan, fromUnits, toUnits } from "@/lib/format";

const UNITS_PER_SAN = 100000000n;

export default function UnitConverter() {
  const [value, setValue] = useState("1");
  const [from, setFrom] = useState<"SAN" | "units">("SAN");

  const converted = useMemo(() => {
    const text = value.trim();
    if (!text) return { other: "", units: "0", san: "0" };
    if (from === "SAN") {
      try {
        const units = toUnits(text);
        return {
          other: units.toString(),
          units: units.toString(),
          san: fromUnits(units),
        };
      } catch {
        return { other: "—", units: "—", san: "—" };
      }
    }
    try {
      const units = BigInt(text);
      return {
        other: fromUnits(units),
        units: units.toString(),
        san: fromUnits(units),
      };
    } catch {
      return { other: "—", units: "—", san: "—" };
    }
  }, [value, from]);

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block">
          <span className="stat-label">Amount</span>
          <input
            className="input mt-1 font-mono"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="stat-label">Unit</span>
          <select
            className="input mt-1"
            value={from}
            onChange={(event) => setFrom(event.target.value as "SAN" | "units")}
          >
            <option value="SAN">SAN</option>
            <option value="units">base units (10^-8 SAN)</option>
          </select>
        </label>
      </div>
      <div className="space-y-3">
        <div className="card p-4">
          <p className="stat-label">
            {from === "SAN" ? "Base units" : "SAN"}
          </p>
          <p className="stat-value mono break-all">{converted.other || "—"}</p>
        </div>
        <div className="card p-4">
          <p className="stat-label">Formatted SAN</p>
          <p className="stat-value">{converted.san === "—" ? "—" : formatSan(converted.san)}</p>
          <p className="mt-1 text-[12px] text-gray-500">
            integer base units: <span className="mono break-all">{converted.units}</span>
          </p>
        </div>
        <p className="text-[12px] text-gray-500">
          1 SAN = {UNITS_PER_SAN.toString()} base units (8 decimals). SAN has no floating-point
          money: the ledger stores integer units only.
        </p>
      </div>
    </div>
  );
}
