import { json, ready } from "@/lib/api";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const response = await san.mempool();
  if (!response.ok || !response.data) {
    return json({ count: 0, tx_ids: [], online: false });
  }
  return json({ ...response.data, online: true });
}
