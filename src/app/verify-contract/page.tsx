import type { Metadata } from "next";
import { Suspense } from "react";

import Breadcrumb from "@/components/Breadcrumb";
import VerifyContractForm from "@/components/VerifyContractForm";

export const metadata: Metadata = { title: "Verify Contract" };
export const dynamic = "force-dynamic";

export default function VerifyContractPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Verify Contract" }]}
      />
      <div className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
        <p className="font-semibold">How SAN contract verification works</p>
        <p className="mt-0.5">
          SAN contracts are PENA programs compiled by every node; the signed deployment
          transaction carries the exact source. Verifying means proving your submitted source is
          byte-for-byte identical to that on-chain deployment (line endings and trailing
          whitespace are normalized). Verified contracts get a source view, a verified badge and
          function-aware read/write tabs.
        </p>
      </div>
      <Suspense fallback={<div className="card p-6 text-[13px] text-gray-500">Loading form…</div>}>
        <VerifyContractForm />
      </Suspense>
    </div>
  );
}
