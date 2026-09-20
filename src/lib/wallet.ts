"use client";

import { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils.js";

import { signingMessage } from "./canonical";

export const WALLET_STORAGE_KEY = "sanscan.wallet.v1";

export interface SanWallet {
  address: string;
  publicKey: string;
  secretKey: string;
  createdAt: number;
}

/** address = "0x" + sha3_256(publicKey)[:20] — same derivation as the node. */
export function addressFromPublicKeyHex(publicKeyHex: string): string {
  const digest = sha3_256(hexToBytes(publicKeyHex.replace(/^0x/i, "")));
  return `0x${bytesToHex(digest.slice(0, 20))}`;
}

export function generateWallet(): SanWallet {
  const { publicKey, secretKey } = ml_dsa44.keygen(randomBytes(32));
  const publicKeyHex = bytesToHex(publicKey);
  return {
    publicKey: publicKeyHex,
    secretKey: bytesToHex(secretKey),
    address: addressFromPublicKeyHex(publicKeyHex),
    createdAt: Date.now(),
  };
}

export function walletFromSecretKey(secretKeyHex: string): SanWallet {
  const cleaned = secretKeyHex.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^[0-9a-f]+$/.test(cleaned)) throw new Error("Secret key must be hex encoded");
  const publicKey = ml_dsa44.getPublicKey(hexToBytes(cleaned));
  const publicKeyHex = bytesToHex(publicKey);
  return {
    publicKey: publicKeyHex,
    secretKey: cleaned,
    address: addressFromPublicKeyHex(publicKeyHex),
    createdAt: Date.now(),
  };
}

/** Sign a SAN transaction payload (hex signature, ML-DSA-44 / FIPS 204). */
export function signPayload(payload: Record<string, unknown>, secretKeyHex: string): string {
  const secretKey = hexToBytes(secretKeyHex.trim().replace(/^0x/i, ""));
  const signature = ml_dsa44.sign(signingMessage(payload), secretKey);
  return bytesToHex(signature);
}

export function verifyPayload(
  payload: Record<string, unknown>,
  signatureHex: string,
  publicKeyHex: string,
): boolean {
  try {
    return ml_dsa44.verify(
      hexToBytes(signatureHex.trim().replace(/^0x/i, "")),
      signingMessage(payload),
      hexToBytes(publicKeyHex.trim().replace(/^0x/i, "")),
    );
  } catch {
    return false;
  }
}

export function loadWallet(): SanWallet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WALLET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SanWallet;
    if (!parsed.publicKey || !parsed.secretKey || !parsed.address) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWallet(wallet: SanWallet): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
}

export function clearWallet(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WALLET_STORAGE_KEY);
}
