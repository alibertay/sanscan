const UNITS_PER_SAN = 100000000n;

/** Parse a SAN amount (string like "1.5", "1E-8" or units string) into integer units. */
export function toUnits(amount: string | number | null | undefined): bigint {
  if (amount === null || amount === undefined) return 0n;
  const text = String(amount).trim();
  if (!text) return 0n;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) return 0n;
  const sign = match[1] === "-" ? -1n : 1n;
  let whole = match[2];
  let fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? "0");
  if (exponent > 0) {
    whole = whole + "0".repeat(exponent);
  } else if (exponent < 0) {
    const shift = -exponent;
    if (fraction.length <= shift) {
      fraction = "0".repeat(shift - fraction.length) + fraction;
    } else {
      whole = whole + fraction.slice(0, fraction.length - shift);
      fraction = fraction.slice(fraction.length - shift);
    }
  }
  const padded = (fraction + "00000000").slice(0, 8);
  return sign * (BigInt(whole) * UNITS_PER_SAN + BigInt(padded || "0"));
}

/** Format integer units as a decimal SAN string with up to 8 decimals. */
export function fromUnits(units: string | number | bigint | null | undefined): string {
  let value: bigint;
  try {
    value = BigInt(typeof units === "string" && units.trim() === "" ? 0 : (units ?? 0));
  } catch {
    return "0";
  }
  const negative = value < 0n;
  if (negative) value = -value;
  const whole = value / UNITS_PER_SAN;
  const fraction = (value % UNITS_PER_SAN).toString().padStart(8, "0").replace(/0+$/, "");
  const rendered = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${rendered}` : rendered;
}

/** Format a SAN decimal string for display with thousands separators. */
export function formatSan(amount: string | number | null | undefined, maxDigits = 8): string {
  if (amount === null || amount === undefined) return "0";
  const text = fromUnits(toUnits(String(amount)));
  const [whole, fraction = ""] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!fraction) return grouped;
  return `${grouped}.${fraction.slice(0, maxDigits)}`;
}

/** Shorten a 0x hash for tables: 0x1234...abcd */
export function shortHash(value: string | null | undefined, size = 8): string {
  if (!value) return "—";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}...${value.slice(-size)}`;
}

export function shortAddress(value: string | null | undefined): string {
  return shortHash(value, 8);
}

export function truncate(value: string | null | undefined, max = 80): string {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

export function formatNumber(value: number | string | null | undefined): string {
  const numeric = typeof value === "string" ? Number(value) : value;
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) return "—";
  return numeric.toLocaleString("en-US");
}

export function formatInt(value: number | string | null | undefined): string {
  try {
    return BigInt(value ?? 0).toLocaleString("en-US");
  } catch {
    return String(value ?? "—");
  }
}

export function formatUtc(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`
  );
}

export function relativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  if (seconds < 0) return "just now";
  if (seconds < 60) return `${seconds} secs ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hr" : "hrs"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export function isTxHash(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function percent(part: number | string | bigint, total: number | string | bigint): string {
  try {
    const p = BigInt(part);
    const t = BigInt(total);
    if (t === 0n) return "0.00%";
    const scaled = (p * 10000n) / t;
    return `${(Number(scaled) / 100).toFixed(2)}%`;
  } catch {
    return "0.00%";
  }
}

/** Etherscan-style method badge label for a transaction payload. */
export function txLabel(payload: Record<string, unknown>): { kind: string; label: string } {
  if (payload.validator && typeof payload.validator === "object") {
    const command = (payload.validator as Record<string, unknown>).command;
    return { kind: "stake", label: `Stake: ${String(command ?? "command")}` };
  }
  if (payload.governance && typeof payload.governance === "object") {
    const name = (payload.governance as Record<string, unknown>).name;
    return { kind: "governance", label: `Governance: ${String(name ?? "set_param")}` };
  }
  const code = payload.contract_code as Record<string, unknown> | undefined;
  if (code && typeof code === "object") {
    if (code.command === "deploy") return { kind: "contract_deploy", label: "Contract Creation" };
    return {
      kind: "contract_call",
      label: `Contract Call: ${String(code.contract_id ?? "")}.${String(code.function_name ?? "")}`,
    };
  }
  if (payload.bytecode) return { kind: "vm_run", label: "PASM Execution" };
  if (payload.receiver) return { kind: "transfer", label: "Transfer" };
  return { kind: "unknown", label: "Transaction" };
}

export function jsonPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
