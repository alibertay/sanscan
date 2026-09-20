import { json, ready } from "@/lib/api";
import {
  getContractFunctions,
  getToken,
  getVerification,
  listTxs,
} from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const response = await san.contracts();
  const ids = response.ok ? (response.data?.contracts ?? []) : [];

  const contracts = ids.map((id) => {
    const deploys = listTxs(0, 25, { contract: id }).items.filter(
      (tx) => tx.kind === "contract_deploy" && tx.contractId === id,
    );
    const calls = listTxs(0, 1, { contract: id }).total;
    const token = getToken(id);
    return {
      id,
      deploy: deploys[0] ?? null,
      calls,
      functions: getContractFunctions(id),
      standard: token?.standard ?? null,
      verified: Boolean(getVerification(id)),
    };
  });

  return json({ contracts, online: response.ok });
}
