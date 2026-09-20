import { errorJson, json, ready } from "@/lib/api";
import { getBlock, listTxs } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ height: string }> },
) {
  ready();
  const { height: rawHeight } = await context.params;
  const height = Number(rawHeight);
  if (!Number.isInteger(height) || height < 0) {
    return errorJson("Block height must be a non-negative integer", 400);
  }

  const indexed = getBlock(height);
  const live = await san.block(height);

  if (!indexed && !live) {
    return errorJson(`Block ${height} not found`, 404);
  }

  const txs = listTxs(0, 500, { block: height }).items;
  return json({ indexed, block: live, transactions: txs });
}
