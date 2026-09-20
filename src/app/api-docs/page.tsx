import type { Metadata } from "next";

import Breadcrumb from "@/components/Breadcrumb";
import CopyButton from "@/components/CopyButton";

export const metadata: Metadata = { title: "API Documentation" };
export const dynamic = "force-static";

const endpoints: { method: string; path: string; description: string }[] = [
  { method: "GET", path: "/api/home", description: "Latest blocks, transactions and health for the home page." },
  { method: "GET", path: "/api/stats", description: "Indexer status, chain id, health and cached genesis." },
  { method: "GET", path: "/api/blocks?page=1&limit=25", description: "Paginated blocks (newest first)." },
  { method: "GET", path: "/api/block/{height}", description: "One block: indexed row, live payload and its transactions." },
  { method: "GET", path: "/api/txs?page=1&limit=25&kind=&address=&block=&contract=", description: "Paginated transactions with filters." },
  { method: "GET", path: "/api/tx/{tx_id}", description: "Transaction detail (indexed row plus live payload and receipt)." },
  { method: "GET", path: "/api/address/{address}?page=1", description: "Balance, nonce, validator stake, stats and paginated history." },
  { method: "GET", path: "/api/validators", description: "Active validator set, consensus parameters and evidence." },
  { method: "GET", path: "/api/contracts", description: "Deployed contract ids with deploy metadata, functions and token/verify flags." },
  { method: "POST", path: "/api/contract/query", description: "Read-only PENA call: {contract_id, function_name, params}." },
  { method: "GET", path: "/api/tokens", description: "Detected SANRC20/SANRC721 tokens with supply, holders and transfer counts." },
  { method: "GET", path: "/api/token/{id}", description: "Token detail: metadata, recent transfers and holders." },
  { method: "GET", path: "/api/token/{id}/transfers?page=", description: "Paginated token events (Transfer/Mint/Burn/Approval)." },
  { method: "GET", path: "/api/token/{id}/holders?page=", description: "Paginated token holders ranked by balance." },
  { method: "GET", path: "/api/token/{id}/inventory?page=", description: "SANRC721 token ids and owners." },
  { method: "POST", path: "/api/verify-contract", description: "Verify a contract source against its deployment: {contract_id, source}." },
  { method: "GET", path: "/api/verify-contract/{id}", description: "Verification record for a contract." },
  { method: "GET", path: "/api/verified-contracts", description: "Every verified contract record." },
  { method: "GET", path: "/api/top-accounts?limit=50", description: "Addresses ranked by live SAN balance." },
  { method: "GET", path: "/api/gas", description: "Gas tracker: base fee, paid prices, median fee, fee estimate." },
  { method: "GET", path: "/api/mempool", description: "Pending transaction ids." },
  { method: "GET", path: "/api/charts?window=24h|7d|30d", description: "Aggregated series plus supply estimate." },
  { method: "GET", path: "/api/network", description: "Node health, finality, genesis, peers and Prometheus metrics." },
  { method: "GET", path: "/api/export/txs?address=&block=&kind=", description: "CSV export of filtered transactions." },
  { method: "GET", path: "/api/export/token-transfers?contract=&address=", description: "CSV export of token events." },
  { method: "GET", path: "/api/faucet", description: "Recent faucet grants recorded by sanscan." },
  { method: "POST", path: "/api/faucet", description: "Request testnet SAN: {address, amount?} → node signed transfer." },
  { method: "POST", path: "/api/send", description: "Submit a signed transaction payload to the SAN node." },
];

export default function ApiDocsPage() {
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "API" }]} />

      <section className="card p-5">
        <h1 className="text-[16px] font-semibold text-ink-900">Sanscan HTTP API</h1>
        <p className="mt-1 text-[13px] text-gray-600">
          Sanscan exposes a thin, JSON-only API in front of the SAN node and its local index.
          Everything the UI shows is available here. All endpoints return{" "}
          <span className="mono">{`{ detail: "..." }`}</span> with a non-2xx status on error.
        </p>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Endpoints</h2>
        </div>
        <div className="table-scroll overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((endpoint) => (
                <tr key={endpoint.path}>
                  <td>
                    <span
                      className={`badge ${
                        endpoint.method === "POST" ? "badge-orange" : "badge-blue"
                      }`}
                    >
                      {endpoint.method}
                    </span>
                  </td>
                  <td className="mono">{endpoint.path}</td>
                  <td className="whitespace-normal text-gray-600">{endpoint.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold text-ink-900">Examples</h2>

        <h3 className="mt-4 text-[13px] font-semibold text-gray-700">Latest transactions</h3>
        <CodeBlock code="curl -s http://localhost:3000/api/txs?limit=5 | jq" />

        <h3 className="mt-4 text-[13px] font-semibold text-gray-700">Account balance</h3>
        <CodeBlock code="curl -s http://localhost:3000/api/address/0xYourAddress | jq .account" />

        <h3 className="mt-4 text-[13px] font-semibold text-gray-700">Request faucet funds</h3>
        <CodeBlock
          code={`curl -s -X POST http://localhost:3000/api/faucet \\
  -H 'Content-Type: application/json' \\
  -d '{"address":"0xYourAddress","amount":"25"}' | jq`}
        />

        <h3 className="mt-4 text-[13px] font-semibold text-gray-700">Read a contract</h3>
        <CodeBlock
          code={`curl -s -X POST http://localhost:3000/api/contract/query \\
  -H 'Content-Type: application/json' \\
  -d '{"contract_id":"kv","function_name":"get","params":[]}' | jq`}
        />

        <h3 className="mt-4 text-[13px] font-semibold text-gray-700">
          Submit a transaction (signed client-side)
        </h3>
        <CodeBlock
          code={`curl -s -X POST http://localhost:3000/api/send \\
  -H 'Content-Type: application/json' \\
  -d '{
    "chain_id": "san-devnet-1",
    "sender": "<public key hex>",
    "nonce": 0,
    "receiver": "0x...",
    "value": "1",
    "signature": "<ML-DSA-44 signature hex>"
  }' | jq`}
        />
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold text-ink-900">Native SAN node API</h2>
        <p className="mt-1 text-[13px] text-gray-600">
          Sanscan also proxies the node&apos;s own REST surface where useful. The node exposes:
        </p>
        <ul className="mt-3 grid gap-1 text-[13px] text-gray-600 sm:grid-cols-2">
          {[
            "GET /health",
            "GET /account/{address}",
            "GET /block/{index}",
            "GET /tx/{tx_id}",
            "GET /receipt/{block}/{tx}",
            "GET /validators",
            "GET /genesis",
            "GET /finality",
            "GET /mempool",
            "GET /contracts",
            "GET /headers",
            "GET /proof/account/{address}",
            "GET /proof/tx/{block}/{tx}",
            "GET /snapshot",
            "POST /transaction",
            "POST /contract/query",
            "POST /faucet",
            "GET /metrics",
          ].map((item) => (
            <li key={item} className="mono">
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px] text-gray-500">
          Signing details: transactions are signed over{" "}
          <span className="mono">canonical JSON (sorted keys, compact)</span> of the payload without{" "}
          <span className="mono">signature</span> and <span className="mono">fee</span>, using
          ML-DSA-44. The transaction id is the sha256 of that same message.
        </p>
      </section>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-end">
        <CopyButton value={code} />
      </div>
      <pre className="overflow-auto rounded-md border border-line bg-ink-900 p-3 text-[12px] leading-relaxed text-sky-100">
        {code}
      </pre>
    </div>
  );
}
