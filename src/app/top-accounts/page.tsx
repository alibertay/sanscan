import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import TimeAgo from "@/components/TimeAgo";
import { AddressLink } from "@/components/Links";
import { topAccounts } from "@/lib/accounts";
import { ensureIndexer } from "@/lib/indexer";
import { formatNumber, formatSan, fromUnits } from "@/lib/format";

export const metadata: Metadata = { title: "Top Accounts" };
export const dynamic = "force-dynamic";

export default async function TopAccountsPage() {
  ensureIndexer();
  const accounts = await topAccounts(50);
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (account.balanceUnits ? BigInt(account.balanceUnits) : 0n),
    0n,
  );

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Top Accounts" }]} />

      <section className="card">
        <div className="card-header">
          <h1 className="card-title">
            Top Accounts
            <span className="ml-2 text-[12px] font-normal text-gray-500">
              ranked by SAN balance among addresses the explorer has indexed
            </span>
          </h1>
          <span className="text-[12px] text-gray-500">
            tracked balance: {formatSan(fromUnits(totalBalance))} SAN
          </span>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Address</th>
                <th>Balance</th>
                <th>Txns</th>
                <th>First seen</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    Nothing indexed yet — the ranking is built from addresses sanscan has seen.
                  </td>
                </tr>
              ) : (
                accounts.map((account, index) => (
                  <tr key={account.address}>
                    <td className="text-gray-500">{index + 1}</td>
                    <td>
                      <AddressLink address={account.address} size={10} />
                      {account.deploys > 0 && (
                        <span className="ml-2 badge badge-purple">Contract creator</span>
                      )}
                    </td>
                    <td className="font-medium">
                      {account.balance !== null
                        ? `${formatSan(fromUnits(account.balanceUnits ?? "0"))} SAN`
                        : "—"}
                    </td>
                    <td>
                      {formatNumber(account.sent + account.received)}{" "}
                      <span className="text-gray-500 text-[12px]">
                        ({account.sent} out / {account.received} in)
                      </span>
                    </td>
                    <td className="text-gray-500">
                      {account.firstTs ? <TimeAgo timestamp={account.firstTs} /> : "—"}
                    </td>
                    <td className="text-gray-500">
                      {account.lastTs ? <TimeAgo timestamp={account.lastTs} /> : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-3 text-[12px] text-gray-500">
          Balances are read live from the node; the list itself covers addresses with indexed
          activity (up to the 50 busiest), so idle premine accounts may be ranked lower until they
          transact.
        </p>
      </section>
    </div>
  );
}
