import type { NextRequest } from "next/server";

import { intParam, ready } from "@/lib/api";
import { getToken, listTokenEvents } from "@/lib/indexer";
import { formatUtc } from "@/lib/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET(request: NextRequest) {
  ready();
  const params = request.nextUrl.searchParams;
  const contract = params.get("contract") ?? undefined;
  const address = params.get("address") ?? undefined;
  const limit = intParam(params.get("limit"), 10000, 1, 100000);

  const data = listTokenEvents({ contract, address, offset: 0, limit });
  const header = [
    "tx_id",
    "block",
    "timestamp_utc",
    "contract_id",
    "standard",
    "function",
    "event",
    "from",
    "to",
    "amount",
    "token_id",
    "status",
  ];
  const lines = [header.join(",")];
  for (const event of data.items) {
    const token = getToken(event.contractId);
    lines.push(
      [
        event.txId,
        event.block,
        formatUtc(event.ts),
        event.contractId,
        token?.standard ?? "",
        event.function,
        event.event,
        event.from ?? "",
        event.to ?? "",
        event.amount ?? "",
        event.tokenId ?? "",
        event.ok ? "success" : "failed",
      ]
        .map(csvValue)
        .join(","),
    );
  }

  const filename = `sanscan-token-transfers-${Date.now()}.csv`;
  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
