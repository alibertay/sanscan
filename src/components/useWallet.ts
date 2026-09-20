"use client";

import { useCallback, useEffect, useState } from "react";

import {
  clearWallet,
  generateWallet,
  loadWallet,
  saveWallet,
  walletFromSecretKey,
  type SanWallet,
} from "@/lib/wallet";

export function useWallet() {
  const [wallet, setWalletState] = useState<SanWallet | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setWalletState(loadWallet());
    setLoaded(true);
  }, []);

  const setWallet = useCallback((next: SanWallet | null) => {
    setWalletState(next);
    if (next) saveWallet(next);
    else clearWallet();
  }, []);

  const create = useCallback(() => {
    const next = generateWallet();
    setWallet(next);
    return next;
  }, [setWallet]);

  const importKey = useCallback(
    (secretKey: string) => {
      const next = walletFromSecretKey(secretKey);
      setWallet(next);
      return next;
    },
    [setWallet],
  );

  const remove = useCallback(() => {
    setWallet(null);
  }, [setWallet]);

  return { wallet, loaded, setWallet, create, importKey, remove };
}
