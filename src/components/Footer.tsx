import Link from "next/link";

export default function Footer() {
  const year = new Date().getUTCFullYear();
  return (
    <footer className="mt-10 border-t border-line bg-surface">
      <div className="container-page grid gap-8 py-10 text-[13px] text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="mb-2 font-semibold text-ink-900">SANSCAN</p>
          <p className="leading-relaxed">
            An Etherscan-style explorer for SAN Network: blocks, transactions, validators,
            contracts, charts and a faucet.
          </p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-ink-900">Blockchain</p>
          <ul className="space-y-1.5">
            <li>
              <Link className="link" href="/blocks">
                Blocks
              </Link>
            </li>
            <li>
              <Link className="link" href="/txs">
                Transactions
              </Link>
            </li>
            <li>
              <Link className="link" href="/pending">
                Pending Transactions
              </Link>
            </li>
            <li>
              <Link className="link" href="/validators">
                Validators
              </Link>
            </li>
            <li>
              <Link className="link" href="/contracts">
                Contracts
              </Link>
            </li>
            <li>
              <Link className="link" href="/tokens">
                Tokens
              </Link>
            </li>
            <li>
              <Link className="link" href="/top-accounts">
                Top Accounts
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-ink-900">Tools</p>
          <ul className="space-y-1.5">
            <li>
              <Link className="link" href="/faucet">
                Testnet Faucet
              </Link>
            </li>
            <li>
              <Link className="link" href="/wallet">
                Wallet
              </Link>
            </li>
            <li>
              <Link className="link" href="/verify-contract">
                Verify Contract
              </Link>
            </li>
            <li>
              <Link className="link" href="/verified-contracts">
                Verified Contracts
              </Link>
            </li>
            <li>
              <Link className="link" href="/gastracker">
                Gas Tracker
              </Link>
            </li>
            <li>
              <Link className="link" href="/unitconverter">
                Unit Converter
              </Link>
            </li>
            <li>
              <Link className="link" href="/api-docs">
                API Documentation
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-ink-900">SAN Network</p>
          <ul className="space-y-1.5">
            <li>Chain ID: san-devnet-1 (configurable)</li>
            <li>Signatures: ML-DSA-44 (FIPS 204)</li>
            <li>Contracts: PENA / SANVM</li>
            <li>1 SAN = 10^8 base units</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-4 text-center text-[12px] text-gray-500">
        © {year} Sanscan · Built for SAN Network · Not affiliated with Etherscan
      </div>
    </footer>
  );
}
