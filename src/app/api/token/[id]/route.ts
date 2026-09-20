import { errorJson, json, ready } from "@/lib/api";
import {
  getContractFunctions,
  getToken,
  getVerification,
  listTokenEvents,
  listTokenHolders,
} from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Live metadata fallback for token contracts whose init call we missed. */
async function liveMetadata(contractId: string) {
  async function call(functionName: string, params: unknown[] = []) {
    const response = await san.queryContract(contractId, functionName, params);
    return response.ok ? response.data?.result ?? null : null;
  }
  const [name, symbol, decimals, totalSupply] = await Promise.all([
    call("name"),
    call("symbol"),
    call("decimals"),
    call("totalSupply"),
  ]);
  return { name, symbol, decimals, totalSupply };
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  ready();
  const { id } = await context.params;
  const token = getToken(id);
  const contractsResponse = await san.contracts();
  const deployed = contractsResponse.ok
    ? (contractsResponse.data?.contracts ?? []).includes(id)
    : false;

  if (!token && !deployed) {
    return errorJson(`Unknown token contract ${id}`, 404);
  }

  let metadata = null;
  if (!token?.name || !token?.symbol || token?.totalSupply === null) {
    metadata = await liveMetadata(id);
  }

  const transfers = listTokenEvents({ contract: id, offset: 0, limit: 25 });
  const holders = listTokenHolders(id, 0, 25);
  const verification = getVerification(id);

  return json({
    token,
    metadata,
    functions: getContractFunctions(id),
    deployed,
    verified: Boolean(verification),
    transferTotal: transfers.total,
    holderTotal: holders.total,
    transfers: transfers.items,
    holders: holders.items,
  });
}
