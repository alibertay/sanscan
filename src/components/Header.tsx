"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Home", exact: true },
  { href: "/blocks", label: "Blocks" },
  { href: "/txs", label: "Transactions" },
  { href: "/pending", label: "Pending" },
  { href: "/validators", label: "Validators" },
  { href: "/contracts", label: "Contracts" },
  { href: "/charts", label: "Charts" },
  { href: "/network", label: "Network" },
  { href: "/api-docs", label: "API" },
];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-sky-600 text-[17px] font-black text-white shadow-sm">
        S
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[17px] font-extrabold tracking-tight text-white">SANSCAN</span>
          <span className="block text-[10.5px] font-medium uppercase tracking-widest text-sky-200/80">
            SAN Network Explorer
          </span>
        </span>
      )}
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    router.push(`/search?q=${encodeURIComponent(value)}`);
    setQuery("");
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40">
      <div className="bg-gradient-to-r from-ink-900 via-ink-800 to-ink-700">
        <div className="container-page flex h-16 items-center gap-4">
          <Logo />

          <form onSubmit={submit} className="relative ml-auto hidden max-w-xl flex-1 md:block">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by Address / Txn Hash / Block / Contract"
              aria-label="Search"
              className="h-10 w-full rounded-md border border-white/15 bg-white/95 pl-3 pr-24 text-[13px] text-ink-900 outline-none placeholder:text-gray-400 focus:border-sky-300 focus:ring-2 focus:ring-sky-400/40"
            />
            <button
              type="submit"
              className="absolute right-1 top-1 flex h-8 items-center gap-1.5 rounded bg-link px-3 text-[12px] font-semibold text-white hover:bg-link-dark"
            >
              Search
            </button>
          </form>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link href="/faucet" className="btn bg-success text-white hover:bg-emerald-600">
              Faucet
            </Link>
            <Link
              href="/wallet"
              className="btn border border-white/25 bg-white/10 text-white hover:bg-white/20"
            >
              Wallet
            </Link>
          </div>
        </div>
      </div>

      <nav className="border-b border-line bg-white shadow-sm">
        <div className="container-page flex gap-1 overflow-x-auto py-1.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
                isActive(item.href, item.exact)
                  ? "bg-sky-50 text-link"
                  : "text-gray-600 hover:bg-surface hover:text-ink-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <form onSubmit={submit} className="container-page -mt-px pb-2 md:hidden">
        <div className="relative mt-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search address / txn / block"
            aria-label="Search"
            className="input pr-20"
          />
          <button
            type="submit"
            className="absolute right-1 top-1 h-7 rounded bg-link px-3 text-[12px] font-semibold text-white"
          >
            Search
          </button>
        </div>
      </form>
    </header>
  );
}
