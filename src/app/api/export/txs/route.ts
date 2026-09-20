import type { NextRequest } from "next/server";

import { intParam, ready } from "@/lib/api";
import { listTxs } from "@/lib/indexer";
import { formatUtc, fromUnits } from "@/lib/format";

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
  const address = params.get("address") ?? undefined;
  const kind = params.get("kind") ?? undefined;
  const contract = params.get("contract") ?? undefined;
  const blockRaw = params.get("block");
  const block = blockRaw !== null && blockRaw !== "" ? Number(blockRaw) : undefined;
  const limit = intParam(params.get("limit"), 10000, 1, 100000);

  const data = listTxs(0, limit, {
    address: address ?? undefined,
    kind: kind ?? undefined,
    contract: contract ?? undefined,
    block: Number.isInteger(block) ? block : undefined,
  });

  const header = [
    "tx_id",
    "block",
    "timestamp_utc",
    "from",
    "to",
    "value_san",
    "fee_san",
    "nonce",
    "type",
    "contract_id",
    "function",
    "status",
    "gas_used",
  ];
  const lines = [header.join(",")];
  for (const tx of data.items) {
    lines.push(
      [
        tx.id,
        tx.block,
        formatUtc(tx.timestamp),
        tx.from,
        tx.to ?? "",
        tx.value,
        fromUnits(tx.fee),
        tx.nonce,
        tx.kind,
        tx.contractId ?? "",
        tx.functionName ?? "",
        tx.status ?? "",
        tx.gasUsed ?? "",
      ]
        .map(csvValue)
        .join(","),
    );
  }

  const filename = `sanscan-txs-${Date.now()}.csv`;
  return new Response(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
