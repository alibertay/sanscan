import type { Metadata } from "next";

import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { siteUrl } from "@/lib/env";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "SANSCAN — SAN Network Explorer",
    template: "%s | SANSCAN",
  },
  description:
    "SANSCAN is an Etherscan-style explorer for SAN Network: blocks, transactions, validators, contracts, charts, a faucet and a post-quantum wallet.",
  keywords: ["SAN Network", "SANSCAN", "block explorer", "Etherscan", "faucet", "ML-DSA"],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "SANSCAN — SAN Network Explorer",
    description: "Blocks, transactions, validators, contracts, charts and a faucet for SAN Network.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="container-page w-full flex-1 py-5">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
