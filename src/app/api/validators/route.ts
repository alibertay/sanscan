import { json, ready } from "@/lib/api";
import { getHealth, indexerStatus } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const [validators, evidence] = await Promise.all([san.validators(), san.evidence()]);
  return json({
    validators,
    evidence: evidence?.evidence ?? [],
    health: getHealth(),
    index: indexerStatus(),
  });
}
