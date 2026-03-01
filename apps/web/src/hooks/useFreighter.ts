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
      // @stellar/freighter-api v6 exports named functions directly.
      // Older builds shim them under `freighterApi`.
      const freighter = (mod as Record<string, unknown>).freighterApi ?? mod;

      const { isConnected } = await (freighter as { isConnected: () => Promise<{ isConnected: boolean }> }).isConnected();
      if (!isConnected) {
        setState((s) => ({
          ...s,
          isInstalled: false,
          error: "Freighter yuklu degil. freighter.app adresinden indir.",
        }));
        return null;
      }

      setState((s) => ({ ...s, isInstalled: true }));

      // Request wallet access if not yet allowed
      const { isAllowed } = await (freighter as { isAllowed: () => Promise<{ isAllowed: boolean }> }).isAllowed();
      if (!isAllowed) {
        await (freighter as { requestAccess: () => Promise<unknown> }).requestAccess();
      }

      const { address } = await (freighter as { getAddress: () => Promise<{ address: string }> }).getAddress();
      if (!address) {
        setState((s) => ({
          ...s,
          error: "Cuzdan adresi alinamadi",
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
      const msg = err instanceof Error ? err.message : "Cuzdan baglanamadi";
      setState((s) => ({ ...s, error: msg }));
      return null;
    }
  }, []);

  /**
   * Signs a challenge string with the Freighter wallet.
   *
   * Security note: the previous implementation had a SHA-256 fallback that
   * produced a hash of the challenge — NOT a real cryptographic signature.
   * The backend Ed25519 verifier would always reject it. That fallback has
   * been removed. If signMessage is unavailable the user receives a clear
   * actionable error instead of a silent auth failure.
   *
   * Freighter v5+: signMessage(message, { networkPassphrase }) -> { signedMessage: string }
   * The returned value is a base64-encoded raw Ed25519 signature over the
   * UTF-8 bytes of the challenge string.
   */
  const signChallenge = useCallback(
    async (challenge: string): Promise<string | null> => {
      try {
        const mod = await import("@stellar/freighter-api");
        const freighter = (mod as Record<string, unknown>).freighterApi ?? mod;

        if (typeof (freighter as Record<string, unknown>).signMessage !== "function") {
          setState((s) => ({
            ...s,
            error:
              "Freighter surumunuz signMessage desteklemiyor. " +
              "Lutfen Freighter uzantisini guncelleyin (v5.0+).",
          }));
          return null;
        }

        const result = await (
          freighter as {
            signMessage: (
              msg: string,
              opts: { networkPassphrase: string }
            ) => Promise<{ signedMessage?: string; error?: string }>;
          }
        ).signMessage(challenge, {
          networkPassphrase: "Test SDF Network ; September 2015",
        });

        if (!result?.signedMessage) {
          const detail = result?.error ?? "Imzalama iptal edildi veya basarisiz oldu";
          setState((s) => ({ ...s, error: detail }));
          return null;
        }

        return result.signedMessage;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Imzalama sirasinda hata olustu";
        setState((s) => ({ ...s, error: msg }));
        return null;
      }
    },
    []
  );

  return { ...state, connect, signChallenge };
}
