import { NextResponse } from "next/server";

import { ensureIndexer, indexerStatus } from "./indexer";
import { rpcUrl } from "./env";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function errorJson(detail: string, status = 400): NextResponse {
  return json({ detail }, status);
}

/** Start the indexer lazily (instrumentation may not run in some dev tools). */
export function ready(): void {
  ensureIndexer();
}

export function nodeOfflineResponse() {
  const status = indexerStatus();
  return json({ detail: status.lastError ?? "SAN node is unreachable" }, 503);
}

export function rpcBase(): string {
  return rpcUrl();
}

export function intParam(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}
