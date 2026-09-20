import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import PendingList from "@/components/PendingList";

export const metadata: Metadata = { title: "Pending Transactions" };
export const dynamic = "force-dynamic";

export default function PendingPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Pending Transactions" }]}
      />
      <PendingList />
    </div>
  );
}
