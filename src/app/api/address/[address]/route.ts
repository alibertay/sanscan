import type { NextRequest } from "next/server";

import { errorJson, intParam, json, ready } from "@/lib/api";
import {
  getAddressStats,
  getAddressTokenHoldings,
  getHealth,
  listTokenEvents,
  listTxs,
} from "@/lib/indexer";
import { isAddress } from "@/lib/format";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> },
) {
  ready();
  const { address } = await context.params;
  if (!isAddress(address)) {
    return errorJson(`Invalid address: ${address}`, 400);
  }

  const page = intParam(request.nextUrl.searchParams.get("page"), 1, 1, 1_000_000);
  const limit = intParam(request.nextUrl.searchParams.get("limit"), 25, 1, 100);
  const normalized = address.toLowerCase();

  const [accountResponse, validators, health] = await Promise.all([
    san.account(normalized),
    san.validators(),
    Promise.resolve(getHealth()),
  ]);

  const validator = validators?.validators.find((row) => row.address === normalized) ?? null;
  const stats = getAddressStats(normalized);
  const txs = listTxs((page - 1) * limit, limit, { address: normalized });
  const tokenTransfers = listTokenEvents({ address: normalized, offset: 0, limit: 1 });
  const holdings = getAddressTokenHoldings(normalized);

  return json({
    address: normalized,
    account: accountResponse.ok ? accountResponse.data : null,
    accountError: accountResponse.ok ? null : accountResponse.detail,
    validator,
    stats,
    health,
    total: txs.total,
    page,
    limit,
    tokenTransferTotal: tokenTransfers.total,
    tokenHoldings: holdings.map((row) => ({
      token: row.token,
      balance: row.balance,
    })),
    txs: txs.items,
  });
}
