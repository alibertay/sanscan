import type { NextRequest } from "next/server";
import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { errorJson, json, ready } from "@/lib/api";
import { getContractDeploy, getVerification, listVerifications, saveVerification } from "@/lib/indexer";
import { san } from "@/lib/rpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalize(source: string): string {
  return source.replace(/\r\n/g, "\n").trim();
}

function sha256Hex(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

export async function GET() {
  ready();
  return json({ verifications: listVerifications() });
}

export async function POST(request: NextRequest) {
  ready();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorJson("Request body must be valid JSON", 400);
  }

  const contractId = typeof body.contract_id === "string" ? body.contract_id.trim() : "";
  const source = typeof body.source === "string" ? body.source : "";
  if (!contractId) return errorJson("'contract_id' is required", 400);
  if (!source.trim()) return errorJson("'source' is required", 400);

  const existing = getVerification(contractId);
  if (existing) {
    return json({ status: "already-verified", verification: existing });
  }

  const deploy = getContractDeploy(contractId);
  if (!deploy) {
    const contracts = await san.contracts();
    if (contracts.data?.contracts?.includes(contractId)) {
      return errorJson(
        "The deployment transaction is not indexed yet; wait for the explorer to sync the block that deployed this contract.",
        409,
      );
    }
    return errorJson(`Unknown contract ${contractId}`, 404);
  }

  const onchain = deploy.contractCode;
  if (!onchain) {
    return errorJson(
      "This contract was deployed from raw bytecode; source verification is only available for PENA/ASM source deployments.",
      400,
    );
  }

  const normalizedSubmitted = normalize(source);
  const normalizedOnchain = normalize(onchain);
  const submittedHash = sha256Hex(normalizedSubmitted);
  const onchainHash = sha256Hex(normalizedOnchain);

  let matchType: "exact" | "bytecode" | null = null;
  if (normalizedSubmitted === normalizedOnchain) {
    matchType = "exact";
  } else if (normalizedSubmitted === onchain || source.trim() === onchain.trim()) {
    matchType = "exact";
  } else if (deploy.language === "asm") {
    try {
      const submitted = JSON.parse(normalizedSubmitted);
      const onchainBytecode = JSON.parse(normalizedOnchain);
      if (JSON.stringify(submitted) === JSON.stringify(onchainBytecode)) matchType = "bytecode";
    } catch {
      // not bytecode JSON; fall through to the mismatch response
    }
  }

  if (!matchType) {
    return errorJson(
      `Source does not match the deployment transaction. On-chain source hash ${onchainHash.slice(
        0,
        16,
      )}…, submitted source hash ${submittedHash.slice(0, 16)}…. The submitted source must match the code signed in transaction ${deploy.id}.`,
      422,
    );
  }

  const health = await san.health();
  const record = {
    contractId,
    language: (deploy.language === "asm" ? "asm" : "pena") as "pena" | "asm",
    source: normalizedSubmitted,
    sourceHash: submittedHash,
    matchType,
    deployTxId: deploy.id,
    deployer: deploy.from || null,
    verifiedAt: Date.now(),
    compiler: `PENA/SANVM schema ${health?.schema_version ?? "?"}`,
  };
  saveVerification(record);
  return json({ status: "verified", verification: record });
}
