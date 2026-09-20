/** Top-account ranking: index volume first, then live balances from the node. */

import { allAddressStats } from "./indexer";
import { san } from "./rpc";

export interface TopAccount {
  address: string;
  balance: string | null;
  balanceUnits: string | null;
  nonce: number | null;
  sent: number;
  received: number;
  firstTs: number;
  lastTs: number;
  deploys: number;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function topAccounts(limit = 50): Promise<TopAccount[]> {
  const stats = allAddressStats()
    .sort((a, b) => b.sent + b.received - (a.sent + a.received))
    .slice(0, limit);

  const accounts = await mapLimit(stats, 8, async (row) => {
    const response = await san.account(row.address);
    const account = response.ok ? response.data : null;
    return {
      address: row.address,
      balance: account?.balance != null ? String(account.balance) : null,
      balanceUnits: account ? String(account.balance_units ?? "0") : null,
      nonce: account?.nonce ?? null,
      sent: row.sent,
      received: row.received,
      firstTs: row.firstTs,
      lastTs: row.lastTs,
      deploys: row.deploys,
    };
  });

  accounts.sort((a, b) => {
    const aUnits = BigInt(a.balanceUnits ?? "0");
    const bUnits = BigInt(b.balanceUnits ?? "0");
    return bUnits > aUnits ? 1 : bUnits < aUnits ? -1 : 0;
  });

  return accounts;
}
