import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import WalletPanel from "@/components/WalletPanel";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Create and use a post-quantum (ML-DSA-44) SAN wallet in your browser.",
};
export const dynamic = "force-dynamic";

export default function WalletPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Wallet" }]} />

      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
        <p className="font-semibold">Testnet key storage</p>
        <p className="mt-0.5">
          The keypair is generated with <span className="font-mono">ML-DSA-44</span> (FIPS 204) in
          your browser and stored in localStorage. Anyone with access to this browser profile can
          use it — export and keep the private key for anything you care about.
        </p>
      </div>

      <WalletPanel />
    </div>
  );
}
