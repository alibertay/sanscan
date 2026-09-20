/**
 * Sanscan end-to-end check against a running SAN node and sanscan server.
 *
 *   1. generates ML-DSA-44 wallets in Node.js,
 *   2. requests faucet funds through sanscan's /api/faucet,
 *   3. signs transfers with @noble/post-quantum and submits them via /api/send,
 *   4. deploys a PENA contract, reads and writes it,
 *   5. deploys SANRC20 and SANRC721 tokens, moves balances, checks holders,
 *   6. verifies contract sources (and rejects a wrong source),
 *   7. checks CSV exports, the gas tracker and top accounts.
 *
 * Usage:
 *   node scripts/e2e.mjs [sanscanBaseUrl]
 *
 * Defaults: http://127.0.0.1:3000 (sanscan).
 */

import { sha256 } from "@noble/hashes/sha2.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";
import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";

const BASE = (process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const META = new Set(["signature", "fee"]);

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function escapeString(value) {
  let out = '"';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === '"') out += '\\"';
    else if (char === "\\") out += "\\\\";
    else if (char === "\n") out += "\\n";
    else if (char === "\r") out += "\\r";
    else if (char === "\t") out += "\\t";
    else if (code < 0x20 || code > 0x7e) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += char;
  }
  return `${out}"`;
}

function canonical(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  if (typeof value === "string") return escapeString(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort();
  return `{${keys.map((key) => `${escapeString(key)}:${canonical(value[key])}`).join(",")}}`;
}

function signingMessage(payload) {
  const message = {};
  for (const [key, value] of Object.entries(payload)) {
    if (META.has(key) || value === undefined) continue;
    message[key] = value;
  }
  return new TextEncoder().encode(canonical(message));
}

function wallet() {
  const { publicKey, secretKey } = ml_dsa44.keygen(randomBytes(32));
  const publicKeyHex = bytesToHex(publicKey);
  const digest = sha3_256(publicKey);
  return {
    publicKey: publicKeyHex,
    secretKey: bytesToHex(secretKey),
    address: `0x${bytesToHex(digest.slice(0, 20))}`,
  };
}

async function api(path, options) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data, text };
}

async function waitFor(description, fn, timeoutMs = 90000, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`timeout waiting for ${description}`);
}

function unitsToSan(units) {
  const value = BigInt(units);
  const whole = value / 100000000n;
  const fraction = (value % 100000000n).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function requestFaucet(address, amount) {
  let response = await api("/api/faucet", {
    method: "POST",
    body: JSON.stringify({ address, amount }),
  });
  if (!response.ok) {
    const detail = response.data?.detail ?? "";
    const match = /maximum of ([\d.]+) SAN/.exec(detail);
    if (match) {
      response = await api("/api/faucet", {
        method: "POST",
        body: JSON.stringify({ address, amount: match[1] }),
      });
    }
  }
  return response;
}

async function accountOf(address) {
  const response = await api(`/api/address/${address}`);
  return response.data?.account ?? null;
}

async function signAndSend(wallet, payload) {
  const signature = bytesToHex(ml_dsa44.sign(signingMessage(payload), hexToBytes(wallet.secretKey)));
  return api("/api/send", {
    method: "POST",
    body: JSON.stringify({ ...payload, signature }),
  });
}

async function callContract(wallet, chainId, contractId, functionName, params, gasLimit = 1000000) {
  const account = await accountOf(wallet.address);
  const payload = {
    chain_id: chainId,
    sender: wallet.publicKey,
    nonce: account?.nonce ?? 0,
    gas_limit: gasLimit,
    gas_price: 1,
    contract_code: {
      command: "run",
      contract_id: contractId,
      function_name: functionName,
      params,
    },
  };
  return signAndSend(wallet, payload);
}

async function deployContract(wallet, chainId, contractId, penaCode, gasLimit = 3000000) {
  const account = await accountOf(wallet.address);
  const payload = {
    chain_id: chainId,
    sender: wallet.publicKey,
    nonce: account?.nonce ?? 0,
    gas_limit: gasLimit,
    gas_price: 1,
    contract_code: { command: "deploy", contract_id: contractId, pena_code: penaCode },
  };
  return signAndSend(wallet, payload);
}

const SANRC20_SOURCE = `token_name = ""
token_symbol = ""
token_decimals = 18
token_total_supply = 0
token_owner = ""
balances := {}
allowances := {}

function init(_name, _symbol, _decimals, _initial_supply, _owner) {
  token_name = _name
  token_symbol = _symbol
  token_decimals = _decimals
  token_total_supply = _initial_supply
  token_owner = _owner
  balances[_owner] = _initial_supply
}

function name() {
  return token_name
}

function symbol() {
  return token_symbol
}

function decimals() {
  return token_decimals
}

function totalSupply() {
  return token_total_supply
}

function balanceOf(account) {
  return balances[account]
}

function _allowance_key(owner, spender) {
  return owner + "|" + spender
}

function allowance(owner, spender) {
  key = _allowance_key(owner, spender)
  value = allowances[key]
  return value
}

function transfer(from, to, amount) {
  from_balance = balances[from]
  if (from_balance < amount) {
    print("TRANSFER_FAILED: INSUFFICIENT_BALANCE")
    return 0
  }
  balances[from] = from_balance - amount
  to_balance = balances[to]
  balances[to] = to_balance + amount
  print("TRANSFER_OK: " + from + " -> " + to)
  return 1
}

function approve(owner, spender, amount) {
  key = _allowance_key(owner, spender)
  allowances[key] = amount
  print("APPROVE_OK: " + owner + " -> " + spender)
  return 1
}

function transferFrom(spender, from, to, amount) {
  key = _allowance_key(from, spender)
  current = allowances[key]
  if (current < amount) {
    print("TRANSFER_FROM_FAILED: NOT_ALLOWED")
    return 0
  }
  from_balance = balances[from]
  if (from_balance < amount) {
    print("TRANSFER_FROM_FAILED: INSUFFICIENT_BALANCE")
    return 0
  }
  balances[from] = from_balance - amount
  to_balance = balances[to]
  balances[to] = to_balance + amount
  allowances[key] = current - amount
  print("TRANSFER_FROM_OK: " + from + " -> " + to)
  return 1
}

function mint(caller, to, amount) {
  if (caller != token_owner) {
    print("MINT_FAILED: NOT_OWNER")
    return 0
  }
  to_balance = balances[to]
  balances[to] = to_balance + amount
  token_total_supply = token_total_supply + amount
  print("MINT_OK: " + to)
  return 1
}

function burn(caller, amount) {
  caller_balance = balances[caller]
  if (caller_balance < amount) {
    print("BURN_FAILED: INSUFFICIENT_BALANCE")
    return 0
  }
  balances[caller] = caller_balance - amount
  token_total_supply = token_total_supply - amount
  print("BURN_OK: " + caller)
  return 1
}
`;

const SANRC721_SOURCE = `token_name = ""
token_symbol = ""
contract_owner = ""
owner_of := {}
balance_of := {}
token_approvals := {}
operator_approvals := {}

function init(_name, _symbol, _owner) {
  token_name = _name
  token_symbol = _symbol
  contract_owner = _owner
}

function name() {
  return token_name
}

function symbol() {
  return token_symbol
}

function balanceOf(owner) {
  return balance_of[owner]
}

function ownerOf(token_id) {
  o = owner_of[token_id]
  if (o == "") {
    print("OWNER_OF_FAILED: NOT_MINTED")
    return ""
  }
  return o
}

function getApproved(token_id) {
  return token_approvals[token_id]
}

function isApprovedForAll(owner, operator) {
  key = owner + "|" + operator
  v = operator_approvals[key]
  return v
}

function approve(owner, to, token_id) {
  current_owner = owner_of[token_id]
  if (current_owner == "") {
    print("APPROVE_FAILED: NOT_MINTED")
    return 0
  }
  if (current_owner != owner) {
    print("APPROVE_FAILED: NOT_OWNER")
    return 0
  }
  token_approvals[token_id] = to
  print("APPROVE_OK: " + to)
  return 1
}

function setApprovalForAll(owner, operator, approved) {
  key = owner + "|" + operator
  if (approved == 1) {
    operator_approvals[key] = 1
  }
  else {
    operator_approvals[key] = 0
  }
  print("APPROVAL_FOR_ALL_OK: " + owner + " -> " + operator)
  return 1
}

function _transfer(from, to, token_id) {
  current_owner = owner_of[token_id]
  if (current_owner != from) {
    print("TRANSFER_FAILED: NOT_OWNER")
    return 0
  }
  if (to == "") {
    print("TRANSFER_FAILED: INVALID_RECIPIENT")
    return 0
  }
  owner_of[token_id] = to
  from_balance = balance_of[from]
  balance_of[from] = from_balance - 1
  to_balance = balance_of[to]
  balance_of[to] = to_balance + 1
  token_approvals[token_id] = ""
  print("TRANSFER_OK: " + from + " -> " + to)
  return 1
}

function transferFrom(spender, from, to, token_id) {
  current_owner = owner_of[token_id]
  if (current_owner != from) {
    print("TRANSFER_FROM_FAILED: FROM_NOT_OWNER")
    return 0
  }
  result = _transfer(from, to, token_id)
  return result
}

function mint(caller, to, token_id) {
  if (caller != contract_owner) {
    print("MINT_FAILED: NOT_CONTRACT_OWNER")
    return 0
  }
  existing = owner_of[token_id]
  if (existing != "") {
    print("MINT_FAILED: ALREADY_MINTED")
    return 0
  }
  if (to == "") {
    print("MINT_FAILED: INVALID_RECIPIENT")
    return 0
  }
  owner_of[token_id] = to
  to_balance = balance_of[to]
  balance_of[to] = to_balance + 1
  print("MINT_OK: " + to + " TOKEN_ID: " + token_id)
  return 1
}

function burn(caller, token_id) {
  current_owner = owner_of[token_id]
  if (current_owner == "") {
    print("BURN_FAILED: NOT_MINTED")
    return 0
  }
  if (caller != current_owner) {
    print("BURN_FAILED: NOT_OWNER")
    return 0
  }
  owner_of[token_id] = ""
  caller_balance = balance_of[caller]
  balance_of[caller] = caller_balance - 1
  token_approvals[token_id] = ""
  print("BURN_OK: " + caller)
  return 1
}
`;

async function main() {
  console.log(`Sanscan E2E against ${BASE}\n`);

  const network = await api("/api/network");
  check("sanscan API reachable", network.ok, `HTTP ${network.status}`);
  const chainId = network.data?.health?.chain_id ?? network.data?.genesis?.chain_id;
  check("chain id available", Boolean(chainId), chainId ?? "missing");
  const rpcUrl = network.data?.rpcUrl;
  check("node RPC configured", Boolean(rpcUrl), rpcUrl ?? "missing");
  if (!chainId) {
    console.error("chain id missing; cannot continue");
    process.exit(1);
  }

  const a = wallet();
  const b = wallet();
  console.log(`\n  wallet A: ${a.address}\n  wallet B: ${b.address}\n`);

  // ---- faucet and transfer -------------------------------------------------
  const faucet = await api("/api/faucet", {
    method: "POST",
    body: JSON.stringify({ address: a.address, amount: "100" }),
  });
  check("faucet accepted", faucet.ok, faucet.data?.detail ?? faucet.data?.status ?? "");

  const funded = await waitFor("faucet funds", async () => {
    const account = await accountOf(a.address);
    const units = BigInt(account?.balance_units ?? 0);
    return units > 0n ? units : null;
  });
  check("wallet A funded", funded > 0n, `${unitsToSan(funded)} SAN`);

  const accountBefore = await accountOf(a.address);
  const transferPayload = {
    chain_id: chainId,
    sender: a.publicKey,
    nonce: accountBefore?.nonce ?? 0,
    receiver: b.address,
    value: "1.25",
  };
  const submit = await signAndSend(a, transferPayload);
  check(
    "transfer submitted",
    submit.ok,
    submit.data?.detail ?? `${submit.data?.status ?? ""} ${submit.data?.tx_id ?? ""}`,
  );

  const txId = submit.data?.tx_id ?? bytesToHex(sha256(signingMessage(transferPayload)));
  const indexed = await waitFor("transaction indexing", async () => {
    const tx = await api(`/api/tx/${txId}`);
    return tx.ok && tx.data?.indexed ? tx.data : null;
  });
  check("transaction indexed", Boolean(indexed), `block ${indexed?.indexed?.block}`);

  const received = await waitFor("wallet B balance", async () => {
    const account = await accountOf(b.address);
    const units = BigInt(account?.balance_units ?? 0);
    return units >= 125000000n ? units : null;
  });
  check("wallet B received 1.25 SAN", received === 125000000n, unitsToSan(received));

  const history = await api(`/api/txs?address=${b.address}`);
  check("transaction in address history", (history.data?.txs ?? []).some((tx) => tx.id === txId));

  const faucetGrants = await api("/api/faucet");
  check(
    "faucet grant logged",
    (faucetGrants.data?.grants ?? []).some(
      (grant) => grant.address.toLowerCase() === a.address.toLowerCase(),
    ),
  );

  // ---- generic contract ----------------------------------------------------
  console.log("\n  -- contract console --");
  const c = wallet();
  const contractFaucet = await requestFaucet(c.address, "1000");
  check(
    "contract wallet funded",
    contractFaucet.ok,
    contractFaucet.data?.detail ?? contractFaucet.data?.amount ?? "",
  );
  await waitFor("contract wallet balance", async () => {
    const account = await accountOf(c.address);
    return BigInt(account?.balance_units ?? 0) > 0n;
  });

  const kvId = `e2ekv${Date.now().toString().slice(-5)}`;
  const kvCode = "value = 1\nfunction get() {\n  return value\n}\nfunction set(v) {\n  value = v\n}\n";
  const deploy = await deployContract(c, chainId, kvId, kvCode, 1000000);
  check(
    "contract deploy submitted",
    deploy.ok,
    deploy.data?.detail ?? `${deploy.data?.status ?? ""} ${deploy.data?.tx_id ?? ""}`,
  );

  if (deploy.ok) {
    await waitFor("contract deployment", async () => {
      const contracts = await api("/api/contracts");
      return (contracts.data?.contracts ?? []).some((row) => row.id === kvId);
    });
    check("contract listed", true, kvId);

    const readBack = await api("/api/contract/query", {
      method: "POST",
      body: JSON.stringify({ contract_id: kvId, function_name: "get", params: [] }),
    });
    check("contract read returns initial state", readBack.data?.result === 1, `get() = ${readBack.data?.result}`);

    const write = await callContract(c, chainId, kvId, "set", [42]);
    check("contract write submitted", write.ok, write.data?.detail ?? write.data?.status ?? "");
    if (write.ok) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const after = await api("/api/contract/query", {
        method: "POST",
        body: JSON.stringify({ contract_id: kvId, function_name: "get", params: [] }),
      });
      check("contract state updated", after.data?.result === 42, `get() = ${after.data?.result}`);
    }
  }

  // ---- SANRC20 -------------------------------------------------------------
  console.log("\n  -- SANRC20 token --");
  const erc20Id = `e2e20_${Date.now().toString().slice(-5)}`;
  const erc20Deploy = await deployContract(c, chainId, erc20Id, SANRC20_SOURCE);
  check("SANRC20 deploy submitted", erc20Deploy.ok, erc20Deploy.data?.detail ?? erc20Deploy.data?.status ?? "");

  if (erc20Deploy.ok) {
    const init = await callContract(c, chainId, erc20Id, "init", [
      "E2E Token",
      "E2E20",
      18,
      1000000,
      c.address,
    ]);
    check("SANRC20 init submitted", init.ok, init.data?.detail ?? init.data?.status ?? "");

    const tokenList = await waitFor("token detection", async () => {
      const tokens = await api("/api/tokens");
      const row = (tokens.data?.tokens ?? []).find((token) => token.id === erc20Id);
      return row && row.standard === "SANRC20" && row.totalSupply === "1000000" ? row : null;
    });
    check(
      "SANRC20 detected with metadata",
      tokenList.symbol === "E2E20" && tokenList.name === "E2E Token",
      `${tokenList.symbol} / ${tokenList.name}`,
    );

    const move = await callContract(c, chainId, erc20Id, "transfer", [c.address, b.address, 250]);
    check("SANRC20 transfer submitted", move.ok, move.data?.detail ?? move.data?.status ?? "");

    const holders = await waitFor("token holders", async () => {
      const detail = await api(`/api/token/${encodeURIComponent(erc20Id)}/holders`);
      const rows = detail.data?.holders ?? [];
      const alice = rows.find((row) => row.address === c.address);
      const bob = rows.find((row) => row.address === b.address);
      return alice && bob && bob.balance === "250" ? { alice, bob } : null;
    });
    check(
      "holder balances updated",
      holders.alice.balance === "999750" && holders.bob.balance === "250",
      `${holders.alice.balance} / ${holders.bob.balance}`,
    );

    const tokenDetail = await api(`/api/token/${encodeURIComponent(erc20Id)}`);
    check(
      "token detail exposes holders and transfers",
      tokenDetail.ok && tokenDetail.data?.holderTotal >= 2 && tokenDetail.data?.transferTotal >= 1,
      `holders=${tokenDetail.data?.holderTotal} transfers=${tokenDetail.data?.transferTotal}`,
    );

    // ---- verification ------------------------------------------------------
    console.log("\n  -- contract verification --");
    const good = await api("/api/verify-contract", {
      method: "POST",
      body: JSON.stringify({ contract_id: erc20Id, source: SANRC20_SOURCE }),
    });
    check(
      "exact source verifies",
      good.ok && good.data?.verification?.matchType === "exact",
      good.data?.detail ?? good.data?.verification?.matchType ?? "",
    );

    const bad = await api("/api/verify-contract", {
      method: "POST",
      body: JSON.stringify({ contract_id: kvId, source: `${kvCode}\n// tampered\n` }),
    });
    check("tampered source rejected", !bad.ok && bad.status === 422, `HTTP ${bad.status}`);

    const verified = await api(`/api/verify-contract/${encodeURIComponent(erc20Id)}`);
    check("verification record stored", verified.ok && verified.data?.contractId === erc20Id);

    const verifiedList = await api("/api/verified-contracts");
    check(
      "verified contracts list includes token",
      (verifiedList.data?.verifications ?? []).some((row) => row.contractId === erc20Id),
    );

    const tokenAfterVerify = await api(`/api/token/${encodeURIComponent(erc20Id)}`);
    check("token shows verified flag", tokenAfterVerify.data?.verified === true);
  }

  // ---- SANRC721 ------------------------------------------------------------
  console.log("\n  -- SANRC721 token --");
  const erc721Id = `e2e721_${Date.now().toString().slice(-5)}`;
  const erc721Deploy = await deployContract(c, chainId, erc721Id, SANRC721_SOURCE);
  check("SANRC721 deploy submitted", erc721Deploy.ok, erc721Deploy.data?.detail ?? erc721Deploy.data?.status ?? "");

  if (erc721Deploy.ok) {
    const init = await callContract(c, chainId, erc721Id, "init", ["E2E NFT", "E2E721", c.address]);
    check("SANRC721 init submitted", init.ok, init.data?.detail ?? init.data?.status ?? "");

    const mint = await callContract(c, chainId, erc721Id, "mint", [c.address, b.address, 1]);
    check("SANRC721 mint submitted", mint.ok, mint.data?.detail ?? mint.data?.status ?? "");

    const detected = await waitFor("NFT detection", async () => {
      const tokens = await api("/api/tokens");
      const row = (tokens.data?.tokens ?? []).find((token) => token.id === erc721Id);
      return row && row.standard === "SANRC721" ? row : null;
    });
    check("SANRC721 detected", detected.symbol === "E2E721", detected.symbol ?? "");

    const inventory = await waitFor("NFT inventory", async () => {
      const response = await api(`/api/token/${encodeURIComponent(erc721Id)}/inventory`);
      const row = (response.data?.items ?? []).find((item) => item.tokenId === "1");
      return row ? row : null;
    });
    check("NFT owner tracked", inventory.owner === b.address, inventory.owner);
  }

  // ---- exports and aggregates ---------------------------------------------
  console.log("\n  -- exports and aggregates --");
  const csv = await fetch(`${BASE}/api/export/txs?address=${b.address}`);
  const csvText = await csv.text();
  check(
    "CSV export works",
    csv.ok && csv.headers.get("content-type")?.includes("text/csv") && csvText.includes("tx_id"),
    `${csvText.split("\n").length - 1} rows`,
  );

  const gas = await api("/api/gas");
  check("gas tracker responds", gas.ok && typeof gas.data?.baseFee === "number");

  const top = await api("/api/top-accounts?limit=10");
  check("top accounts responds", top.ok && Array.isArray(top.data?.accounts));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nE2E crashed: ${error.message}`);
  process.exit(1);
});
