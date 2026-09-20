/**
 * Sanscan end-to-end check against a running SAN node and sanscan server.
 *
 *   1. generates two ML-DSA-44 wallets in Node.js,
 *   2. requests faucet funds for wallet A (through sanscan's /api/faucet),
 *   3. signs a transfer A -> B with @noble/post-quantum and submits it
 *      through sanscan's /api/send,
 *   4. waits until the transaction is indexed and verifies both balances.
 *
 * Usage:
 *   node scripts/e2e.mjs [sanscanBaseUrl]
 *
 * Defaults: http://127.0.0.1:3000 (sanscan). Override the node it talks to
 * with SAN_RPC_URL in the sanscan process, not here.
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
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
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
  return { ok: response.ok, status: response.status, data };
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

async function main() {
  console.log(`Sanscan E2E against ${BASE}\n`);

  const network = await api("/api/network");
  check("sanscan API reachable", network.ok, `HTTP ${network.status}`);
  const chainId = network.data?.health?.chain_id ?? network.data?.genesis?.chain_id;
  check("chain id available", Boolean(chainId), chainId ?? "missing");
  const rpcUrl = network.data?.rpcUrl;
  check("node RPC configured", Boolean(rpcUrl), rpcUrl ?? "missing");

  const a = wallet();
  const b = wallet();
  console.log(`\n  wallet A: ${a.address}\n  wallet B: ${b.address}\n`);

  // An ML-DSA-44 transfer is ~7.6 KiB, so the deterministic size fee is
  // around 80 SAN; request enough for the transfer plus the fee.
  const faucet = await api("/api/faucet", {
    method: "POST",
    body: JSON.stringify({ address: a.address, amount: "100" }),
  });
  check("faucet accepted", faucet.ok, faucet.data?.detail ?? faucet.data?.status ?? "");

  const funded = await waitFor("faucet funds", async () => {
    const account = await api(`/api/address/${a.address}`);
    const units = BigInt(account.data?.account?.balance_units ?? 0);
    return units > 0n ? units : null;
  });
  check("wallet A funded", funded > 0n, `${unitsToSan(funded)} SAN`);

  const accountBefore = await api(`/api/address/${a.address}`);
  const nonce = accountBefore.data?.account?.nonce ?? 0;

  const payload = {
    chain_id: chainId,
    sender: a.publicKey,
    nonce,
    receiver: b.address,
    value: "1.25",
  };
  const signature = bytesToHex(ml_dsa44.sign(signingMessage(payload), hexToBytes(a.secretKey)));
  const body = { ...payload, signature };
  const submit = await api("/api/send", { method: "POST", body: JSON.stringify(body) });
  check(
    "transfer submitted",
    submit.ok,
    submit.data?.detail ?? `${submit.data?.status ?? ""} ${submit.data?.tx_id ?? ""}`,
  );

  const txId = submit.data?.tx_id ?? bytesToHex(sha256(signingMessage(payload)));
  const indexed = await waitFor("transaction indexing", async () => {
    const tx = await api(`/api/tx/${txId}`);
    return tx.ok && tx.data?.indexed ? tx.data : null;
  });
  check("transaction indexed", Boolean(indexed), `block ${indexed?.indexed?.block}`);

  const received = await waitFor("wallet B balance", async () => {
    const account = await api(`/api/address/${b.address}`);
    const units = BigInt(account.data?.account?.balance_units ?? 0);
    return units >= 125000000n ? units : null;
  });
  check("wallet B received 1.25 SAN", received === 125000000n, unitsToSan(received));

  const history = await api(`/api/txs?address=${b.address}`);
  const inHistory = (history.data?.txs ?? []).some((tx) => tx.id === txId);
  check("transaction in address history", inHistory);

  const faucetGrants = await api("/api/faucet");
  const grantLogged = (faucetGrants.data?.grants ?? []).some(
    (grant) => grant.address.toLowerCase() === a.address.toLowerCase(),
  );
  check("faucet grant logged", grantLogged);

  // ---- contract deploy, read and (if affordable) write -------------------
  console.log("\n  -- contracts --");
  const c = wallet();
  const contractFaucet = await requestFaucet(c.address, "1000");
  check(
    "contract wallet funded",
    contractFaucet.ok,
    contractFaucet.data?.detail ?? contractFaucet.data?.amount ?? "",
  );
  await waitFor("contract wallet balance", async () => {
    const account = await api(`/api/address/${c.address}`);
    return BigInt(account.data?.account?.balance_units ?? 0) > 0n;
  });

  const contractId = `e2ekv${Date.now().toString().slice(-5)}`;
  const penaCode = "value = 1\nfunction get() {\n  return value\n}\nfunction set(v) {\n  value = v\n}\n";
  const deployPayload = {
    chain_id: chainId,
    sender: c.publicKey,
    nonce: 0,
    gas_limit: 1000000,
    gas_price: 1,
    contract_code: { command: "deploy", contract_id: contractId, pena_code: penaCode },
  };
  const deploySignature = bytesToHex(
    ml_dsa44.sign(signingMessage(deployPayload), hexToBytes(c.secretKey)),
  );
  const deploy = await api("/api/send", {
    method: "POST",
    body: JSON.stringify({ ...deployPayload, signature: deploySignature }),
  });
  check(
    "contract deploy submitted",
    deploy.ok,
    deploy.data?.detail ?? `${deploy.data?.status ?? ""} ${deploy.data?.tx_id ?? ""}`,
  );

  if (deploy.ok) {
    await waitFor("contract deployment", async () => {
      const contracts = await api("/api/contracts");
      return (contracts.data?.contracts ?? []).some((row) => row.id === contractId);
    });
    check("contract listed", true, contractId);

    const readBack = await api("/api/contract/query", {
      method: "POST",
      body: JSON.stringify({ contract_id: contractId, function_name: "get", params: [] }),
    });
    check("contract read returns initial state", readBack.data?.result === 1, `get() = ${readBack.data?.result}`);

    const contractAccount = await api(`/api/address/${c.address}`);
    const remaining = BigInt(contractAccount.data?.account?.balance_units ?? 0);
    const nonce = contractAccount.data?.account?.nonce ?? 0;
    if (remaining > 12000000000n) {
      const writePayload = {
        chain_id: chainId,
        sender: c.publicKey,
        nonce,
        gas_limit: 1000000,
        gas_price: 1,
        contract_code: {
          command: "run",
          contract_id: contractId,
          function_name: "set",
          params: [42],
        },
      };
      const writeSignature = bytesToHex(
        ml_dsa44.sign(signingMessage(writePayload), hexToBytes(c.secretKey)),
      );
      const write = await api("/api/send", {
        method: "POST",
        body: JSON.stringify({ ...writePayload, signature: writeSignature }),
      });
      check("contract write submitted", write.ok, write.data?.detail ?? write.data?.status ?? "");
      if (write.ok) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const after = await api("/api/contract/query", {
          method: "POST",
          body: JSON.stringify({ contract_id: contractId, function_name: "get", params: [] }),
        });
        check("contract state updated", after.data?.result === 42, `get() = ${after.data?.result}`);
      }
    } else {
      console.log("  SKIP  contract write (remaining balance only covers one execution)");
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nE2E crashed: ${error.message}`);
  process.exit(1);
});
