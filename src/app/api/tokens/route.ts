import { json, ready } from "@/lib/api";
import { listTokens } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  ready();
  const tokens = listTokens().map((token) => ({
    ...token,
    url: `/token/${encodeURIComponent(token.id)}`,
  }));
  return json({ tokens });
}
