import { errorJson, json, ready } from "@/lib/api";
import { getVerification } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  ready();
  const { id } = await context.params;
  const verification = getVerification(id);
  if (!verification) return errorJson(`Contract ${id} is not verified`, 404);
  return json(verification);
}
