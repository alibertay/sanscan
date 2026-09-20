import { errorJson, json, ready } from "@/lib/api";
import { getTx } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  ready();
  const { id } = await context.params;
  const indexed = getTx(id);
  const live = await san.tx(id);

  if (!indexed && !live) {
    return errorJson(`Unknown transaction ${id}`, 404);
  }

  return json({ indexed, live });
}
