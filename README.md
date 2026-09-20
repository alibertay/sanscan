# SANSCAN — SAN Network Explorer

An Etherscan-style block explorer for **SAN Network**, with a built-in faucet and a
post-quantum wallet. Sanscan reads the SAN node REST API, keeps a local index for
address history and charts, and exposes everything through a JSON API of its own.

```
┌────────────┐     REST     ┌──────────────────────────────┐
│  SAN node  │◄────────────►│  Sanscan (Next.js server)    │
│  :8000     │   /sync      │   • indexer (blocks, txs)    │
└────────────┘              │   • NDJSON index on disk     │
                            │   • /api/* for the UI        │
                            └──────────────┬───────────────┘
                                           │ SSR + fetch
                                    ┌──────▼──────┐
                                    │  Browser UI │  (wallet signs locally)
                                    └─────────────┘
```

## Features

- **Etherscan-style UI** — latest blocks and transactions, block/tx detail pages,
  address pages with tabs, validators, contract pages, charts, network status.
- **Local indexer** — SAN nodes have no address-history endpoint, so sanscan
  syncs blocks through `/sync` into an on-disk NDJSON index. Address history,
  top addresses, fee totals and charts are derived from it. Reorgs and node
  restarts are detected and the index rewinds to the common ancestor.
- **Faucet** — `/faucet` forwards requests to the node's signed faucet
  (`SAN_FAUCET=1`), records every grant, and shows recent activity. Ships with
  its own per-IP throttling on top of the node's cooldowns.
- **Post-quantum wallet** — generates an **ML-DSA-44** (FIPS 204) keypair in the
  browser with [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum),
  derives the SAN address (`0x` + `sha3_256(pubkey)[:20]`), signs transfers and
  staking commands locally, and submits them through `/api/send`. No server ever
  sees the private key.
- **Contract console** — read any PENA/SANVM contract (`POST /contract/query`)
  and write to it by signing a `run` transaction in the wallet. Function names
  are extracted from the deploy transaction's PENA source.
- **Charts** — blocks, transactions, gas used and active addresses from the
  index, plus an estimated supply (genesis premine + block subsidy × height).
- **API** — every screen has a JSON endpoint (`/api/*`), documented at `/api-docs`.

## Requirements

- **Node.js 20.9+** (22 LTS recommended)
- A running **SAN node** REST endpoint (default `http://127.0.0.1:8000`)
- For the faucet: the node must run with the faucet enabled
  (`--faucet` / `SAN_FAUCET=1`)

> **Faucet amounts:** SAN transactions carry a full ML-DSA-44 public key
> (~2.6 KB) and signature (~4.8 KB), so the deterministic size fee is roughly
> **75–80 SAN per transfer** at the minimum fee rate. Faucet grants should be at
> least a few hundred SAN to be useful, e.g.
> `--faucet --faucet-amount 500 --faucet-max 1000`.

## Quick start

```bash
# 1. install
npm install

# 2. configure (copy and edit)
cp .env.example .env.local

# 3. run
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

Docker:

```bash
SAN_RPC_URL=http://host.docker.internal:8000 docker compose up -d --build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SAN_RPC_URL` | `http://127.0.0.1:8000` | SAN node REST endpoint |
| `SAN_API_TOKEN` | – | Bearer token when the node uses `SAN_API_TOKEN` |
| `SANSCAN_DATA_DIR` | `./data` | Index directory (NDJSON files) |
| `SANSCAN_POLL_MS` | `4000` | Node poll interval in milliseconds |
| `SANSCAN_SYNC_PAGE` | `256` | Blocks per `/sync` page (1–1024) |
| `SANSCAN_TRUST_PROXY` | `0` | Trust `X-Forwarded-For` for faucet IP limits |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Public URL used for metadata |

`.env.example` is a template; the public devnet URL goes in `.env`/`.env.local`
(`SAN_RPC_URL`) when you deploy.

## Pages

| Path | Description |
|------|-------------|
| `/` | Live dashboard: stats, latest blocks and transactions |
| `/blocks`, `/block/[height]` | Block list and block detail (roots, proposer, reward) |
| `/txs`, `/tx/[id]` | Transaction list with type tabs; detail with receipt, logs, raw payload |
| `/pending` | Mempool |
| `/address/[address]` | Balance, nonce, validator stake, stats, history, Merkle proof |
| `/validators` | Active set, stake shares, consensus parameters, evidence |
| `/contracts`, `/contract/[id]` | Deployed contracts, PENA source, read/write console |
| `/faucet` | Request testnet SAN, recent grants |
| `/wallet` | Generate/import ML-DSA-44 wallet, faucet, send SAN, staking actions |
| `/charts` | Blocks, transactions, gas, active addresses, supply |
| `/network` | Node health, genesis, peers, Prometheus metrics |
| `/api-docs` | Sanscan HTTP API reference |

## HTTP API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/home` | Dashboard payload |
| GET | `/api/stats` | Indexer status, chain id, health, genesis |
| GET | `/api/blocks?page=&limit=` | Paginated blocks |
| GET | `/api/block/{height}` | Block (indexed + live + transactions) |
| GET | `/api/txs?page=&limit=&kind=&address=&block=&contract=` | Paginated transactions |
| GET | `/api/tx/{tx_id}` | Transaction detail (indexed + live + receipt) |
| GET | `/api/address/{address}?page=` | Account, stake, stats, history |
| GET | `/api/validators` | Validator set + evidence |
| GET | `/api/contracts` | Contract ids with deploy metadata |
| POST | `/api/contract/query` | Read-only PENA call |
| GET | `/api/mempool` | Pending tx ids |
| GET | `/api/charts?window=24h\|7d\|30d` | Aggregated series + supply |
| GET | `/api/network` | Health, finality, genesis, peers, metrics |
| GET/POST | `/api/faucet` | Recent grants / request funds |
| POST | `/api/send` | Submit a signed transaction |

### Signing (same rules as the node)

- Message: `canonical JSON` of the payload **without** `signature` and `fee`
  (sorted keys, compact separators, ASCII-escaped) — see `src/lib/canonical.ts`.
- Signature: **ML-DSA-44** over those bytes, hex encoded.
- `tx_id`: `sha256` of the same message.
- Address: `0x` + `sha3_256(publicKey)[:20]`.

## Testing

With a local SAN node (faucet enabled) and sanscan running:

```bash
npm run e2e                          # http://127.0.0.1:3000
node scripts/e2e.mjs http://host:3000
```

The script generates two wallets, requests faucet funds through
`/api/faucet`, signs a transfer with `@noble/post-quantum`, waits for the
explorer to index it, verifies balances and address history, then deploys a
PENA contract and reads/writes it — 16 end-to-end checks in total.

Type-check:

```bash
npm run typecheck
```

## Project layout

```
src/
  app/             pages (App Router) and /api routes
  components/      header/footer, tables, charts, wallet, faucet, contract console
  lib/
    rpc.ts         SAN node REST client (server-side)
    indexer.ts     sync loop, in-memory index + NDJSON persistence
    canonical.ts   Python-compatible canonical JSON for signing
    wallet.ts      @noble ML-DSA-44 wallet helpers (browser)
    format.ts      amounts, units, hashes, times
scripts/e2e.mjs    end-to-end verification
```

## Notes

- Balances are integer base units (`1 SAN = 10^8`), parsed and formatted with
  `BigInt`; the UI never floats money.
- Sanscan is read-only against the chain except for `/api/send` (your signed
  transaction) and `/api/faucet` (the node's own signed transfer).
- The faucet's node-side IP bucket is shared when sanscan runs on a server:
  sanscan applies its own per-client-IP limit, but the node still sees one
  source address. For public deployments, front the whole stack with a reverse
  proxy and consider raising the node's cooldown.
- This project is not affiliated with Etherscan; the layout is inspired by it.

## License

MIT — see [LICENSE](LICENSE).
