import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import FaucetForm from "@/components/FaucetForm";
import { ensureIndexer, listFaucetGrants } from "@/lib/indexer";

export const metadata: Metadata = {
  title: "Faucet",
  description: "Get free testnet SAN for development on SAN Network.",
};
export const dynamic = "force-dynamic";

export default function FaucetPage() {
  ensureIndexer();
  const grants = listFaucetGrants(25);

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Faucet" }]} />

      <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
        <p className="font-semibold">SAN Network testnet faucet</p>
        <p className="mt-0.5">
          Sanscan forwards your request to the node&apos;s signed faucet endpoint (a normal
          on-chain transfer from the node identity). No signup required — just an address. Need an
          address first? Generate a post-quantum wallet on the{" "}
          <a className="link" href="/wallet">
            Wallet
          </a>{" "}
          page.
        </p>
      </div>

      <FaucetForm initialGrants={grants} />
    </div>
  );
}
