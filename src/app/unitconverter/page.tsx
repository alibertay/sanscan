import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import UnitConverter from "@/components/UnitConverter";

export const metadata: Metadata = { title: "Unit Converter" };

export default function UnitConverterPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Unit Converter" }]} />
      <section className="card">
        <div className="card-header">
          <h1 className="card-title">SAN Unit Converter</h1>
          <span className="text-[12px] text-gray-500">SAN ⇄ base units</span>
        </div>
        <UnitConverter />
      </section>
    </div>
  );
}
