import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import ChartsView from "@/components/ChartsView";

export const metadata: Metadata = { title: "Charts" };
export const dynamic = "force-dynamic";

export default function ChartsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Charts" }]} />
      <ChartsView />
    </div>
  );
}
