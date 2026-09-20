import { json, ready } from "@/lib/api";
import { listTxs } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const response = await san.contracts();
  const ids = response.ok ? (response.data?.contracts ?? []) : [];

  const contracts = ids.map((id) => {
    const deploys = listTxs(0, 10, { contract: id }).items.filter(
      (tx) => tx.kind === "contract_deploy" && tx.contractId === id,
    );
    const calls = listTxs(0, 1, { contract: id }).total;
    return {
      id,
      deploy: deploys[0] ?? null,
      calls,
    };
  });

  return json({ contracts, online: response.ok });
}
