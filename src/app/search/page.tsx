import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import Breadcrumb from "@/components/Breadcrumb";
import { ensureIndexer, getBlockByHash, getTx, searchTokens } from "@/lib/indexer";
import { isAddress, isTxHash } from "@/lib/format";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  ensureIndexer();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  if (query) {
    if (/^\d+$/.test(query)) {
      redirect(`/block/${Number(query)}`);
    }
    if (isAddress(query)) {
      redirect(`/address/${query.toLowerCase()}`);
    }
    if (isTxHash(query)) {
      const indexed = getTx(query);
      if (indexed) redirect(`/tx/${indexed.id}`);
      const byHash = getBlockByHash(query.toLowerCase());
      if (byHash) redirect(`/block/${byHash.height}`);
      const live = await san.tx(query);
      if (live) redirect(`/tx/${query}`);
    }
    const tokenMatch = searchTokens(query)[0];
    if (tokenMatch) redirect(`/token/${encodeURIComponent(tokenMatch.id)}`);
    const contracts = await san.contracts();
    if (contracts.data?.contracts?.includes(query)) {
      redirect(`/contract/${encodeURIComponent(query)}`);
    }
  }

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Search" }]} />
      <section className="card p-6">
        <h1 className="text-[16px] font-semibold text-ink-900">No results found</h1>
        <p className="mt-1 text-[13px] text-gray-600">
          {query ? (
            <>
              Nothing on sanscan matches <span className="mono">{query}</span>. The explorer
              accepts:
            </>
          ) : (
            "Enter a search term. The explorer accepts:"
          )}
        </p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-[13px] text-gray-600">
          <li>Block height (e.g. 42)</li>
          <li>Transaction hash (0x + 64 hex characters, sha256)</li>
          <li>Block hash (0x + 64 hex characters, sha3-256)</li>
          <li>Account address (0x + 40 hex characters)</li>
          <li>Contract ID (e.g. kv, sanrc20)</li>
        </ul>
        <p className="mt-4 text-[13px]">
          <Link className="link" href="/">
            ← Back to home
          </Link>
        </p>
      </section>
    </div>
  );
}
