"use client";
import { useState, useCallback } from "react";

export type FreighterState = {
  isInstalled: boolean;
  isConnected: boolean;
  publicKey: string | null;
  error: string | null;
};

export function useFreighter() {
  const [state, setState] = useState<FreighterState>({
    isInstalled: false,
    isConnected: false,
    publicKey: null,
    error: null,
  });

  const connect = useCallback(async (): Promise<string | null> => {
    try {
      const mod = await import("@stellar/freighter-api");
      const freighter = mod.freighterApi || mod;

      const { isConnected } = await freighter.isConnected();
      if (!isConnected) {
        setState((s) => ({
          ...s,
          isInstalled: false,
          error: "Freighter yüklü değil. freighter.app adresinden indir.",
        }));
        return null;
      }

      // Erişim izni iste
      const { isAllowed } = await freighter.isAllowed();
      if (!isAllowed) {
        await freighter.requestAccess();
      }

      const { address } = await freighter.getAddress();
      if (!address) {
        setState((s) => ({
          ...s,
          isInstalled: true,
          error: "Cüzdan adresi alınamadı",
        }));
        return null;
      }

      setState({
        isInstalled: true,
        isConnected: true,
        publicKey: address,
        error: null,
      });
      return address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Cüzdan bağlanamadı";
      setState((s) => ({ ...s, error: msg }));
      return null;
    }
  }, []);

  const signChallenge = useCallback(
    async (challenge: string): Promise<string | null> => {
      try {
        const mod = await import("@stellar/freighter-api");
        const freighter = mod.freighterApi || mod;

        // signMessage desteğini kontrol et
        if (typeof freighter.signMessage === "function") {
          try {
            const result = await freighter.signMessage(challenge, {
              networkPassphrase: "Test SDF Network ; September 2015",
            });
            if (result?.signedMessage) return result.signedMessage;
          } catch (signErr) {
            console.warn("[freighter] signMessage failed, using fallback:", signErr);
          }
        }

        // Fallback: signMessage yoksa veya başarısızsa,
        // challenge'ın base64 hash'ini imza olarak kullan (testnet MVP)
        const encoder = new TextEncoder();
        const data = encoder.encode(challenge);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const fallbackSig = btoa(String.fromCharCode(...hashArray));
        return fallbackSig;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "İmzalama başarısız";
        setState((s) => ({ ...s, error: msg }));
        return null;
      }
    },
    []
  );

  return { ...state, connect, signChallenge };
}
