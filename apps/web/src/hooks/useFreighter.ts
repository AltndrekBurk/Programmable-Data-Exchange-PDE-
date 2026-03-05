 "use client";
import { useState, useCallback } from "react";
import StellarSdk from "@stellar/stellar-sdk";

export type FreighterState = {
  isInstalled: boolean;
  isConnected: boolean;
  publicKey: string | null;
  error: string | null;
};

const HORIZON_URL = "https://horizon-testnet.stellar.org";

function compactId(id: string): string {
  return id.replace(/-/g, "").slice(0, 4);
}

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
            ) => Promise<{ signedMessage?: string; signature?: string; error?: string }>;
          }
        ).signMessage(challenge, {
          networkPassphrase: "Test SDF Network ; September 2015",
        });

        const sig = result?.signature ?? result?.signedMessage;
        if (!sig) {
          const detail = result?.error ?? "Imzalama iptal edildi veya basarisiz oldu";
          setState((s) => ({ ...s, error: detail }));
          return null;
        }

        // Backend base64 veya hex imzayı destekliyor; olduğu gibi geri dön.
        return sig;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Imzalama sirasinda hata olustu";
        setState((s) => ({ ...s, error: msg }));
        return null;
      }
    },
    []
  );

  const signAndSubmitConsentTx = useCallback(
    async (
      fullSkillId: string,
      pseudoId: string,
      publicKey: string,
      decision: "ACCEPT" | "REJECT"
    ): Promise<string | null> => {
      if (decision !== "ACCEPT") return null;
      try {
        const mod = await import("@stellar/freighter-api");
        const freighter = (mod as Record<string, unknown>).freighterApi ?? mod;

        if (typeof (freighter as Record<string, unknown>).signTransaction !== "function") {
          setState((s) => ({
            ...s,
            error:
              "Freighter surumunuz signTransaction desteklemiyor. Lutfen guncelleyiniz.",
          }));
          return null;
        }

        const server = new StellarSdk.Horizon.Server(HORIZON_URL);
        const account = await server.loadAccount(publicKey);

        const skillId4 = compactId(fullSkillId);
        const pseudo4 = compactId(pseudoId || publicKey);
        const memoText = `CONSENT:${skillId4}:${pseudo4}:${decision}`;

        const tx = new StellarSdk.TransactionBuilder(account, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: StellarSdk.Networks.TESTNET,
        })
          .addMemo(StellarSdk.Memo.text(memoText))
          .addOperation(
            StellarSdk.Operation.payment({
              destination: publicKey,
              asset: StellarSdk.Asset.native(),
              amount: "0.0000001",
            })
          )
          .setTimeout(30)
          .build();

        const signed = await (
          freighter as {
            signTransaction: (
              xdr: string,
              opts: { networkPassphrase?: string; network?: string }
            ) => Promise<{ signedTxXdr: string }>;
          }
        ).signTransaction(tx.toXDR(), {
          networkPassphrase: "Test SDF Network ; September 2015",
        });

        const signedTx = StellarSdk.TransactionBuilder.fromXDR(
          signed.signedTxXdr,
          StellarSdk.Networks.TESTNET
        );
        const result = await server.submitTransaction(signedTx);
        return (result as any).hash as string;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Consent TX gonderilirken hata olustu";
        setState((s) => ({ ...s, error: msg }));
        return null;
      }
    },
    []
  );

  return { ...state, connect, signChallenge, signAndSubmitConsentTx };
}
