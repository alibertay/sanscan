"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface MempoolResponse {
  count: number;
  tx_ids: string[];
  online?: boolean;
}

export default function PendingList() {
  const [data, setData] = useState<MempoolResponse>({ count: 0, tx_ids: [] });
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/mempool", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as MempoolResponse;
        if (!cancelled) {
          setData(payload);
          setUpdatedAt(Date.now());
        }
      } catch {
        // keep previous state
      }
    }
    void load();
    const timer = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <section className="card">
      <div className="card-header">
        <h1 className="card-title">
          Pending Transactions
          <span className="ml-2 text-[12px] font-normal text-gray-500">
            {data.count} in mempool
          </span>
        </h1>
        <span className="text-[12px] text-gray-500">
          updated {new Date(updatedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="table-scroll overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th style={{ width: 60 }}>#</th>
              <th>Transaction Hash</th>
            </tr>
          </thead>
          <tbody>
            {data.tx_ids.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-10 text-center text-gray-500">
                  Mempool is empty. Transactions are committed as soon as the node reaches the
                  fee threshold and controller quorum.
                </td>
              </tr>
            ) : (
              data.tx_ids.map((id, index) => (
                <tr key={id}>
                  <td className="text-gray-500">{index + 1}</td>
                  <td>
                    <Link className="link mono" href={`/tx/${id}`}>
                      {id}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-gray-500">
        Pending transactions are not yet in a block; their payload becomes indexable once a block
        commits them.
      </p>
    </section>
  );
}
