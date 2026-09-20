/** Server-side environment access (never imported by client components). */

export function rpcUrl(): string {
  const value = process.env.SAN_RPC_URL?.trim() || "http://127.0.0.1:8000";
  return value.replace(/\/+$/, "");
}

export function apiToken(): string | null {
  const value = process.env.SAN_API_TOKEN?.trim();
  return value ? value : null;
}

export function dataDir(): string {
  return process.env.SANSCAN_DATA_DIR?.trim() || "./data";
}

export function pollMs(): number {
  const value = Number(process.env.SANSCAN_POLL_MS ?? "4000");
  if (!Number.isFinite(value)) return 4000;
  return Math.min(Math.max(value, 500), 60000);
}

export function syncPage(): number {
  const value = Number(process.env.SANSCAN_SYNC_PAGE ?? "256");
  if (!Number.isFinite(value)) return 256;
  return Math.min(Math.max(Math.trunc(value), 1), 1024);
}

export function trustProxy(): boolean {
  const value = (process.env.SANSCAN_TRUST_PROXY ?? "0").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}
