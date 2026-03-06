// ---------------------------------------------------------------------------
// Client-side Stellar TX builder + helpers
//
// All blockchain writes happen from the user's Freighter wallet.
// No server-side keypair needed.
// ---------------------------------------------------------------------------

import * as StellarSdk from "@stellar/stellar-sdk";

export const HORIZON_URL = "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

/** Entity type prefixes — must match packages/storage/src/warm-cache.ts */
export const PREFIXES: Record<string, string> = {
  skill: "sk:",
  mcp: "mc:",
  proof: "pf:",
  provider: "pr:",
  botconfig: "bc:",
  escrow: "es:",
  review: "rv:",
};

/**
 * Generate a Stellar manage_data key for an entity.
 * Format: "{prefix}{id first 24 chars}"
 * Must match WarmCache.stellarKey() on the backend.
 */
export function buildIndexKey(type: string, id: string): string {
  const prefix = PREFIXES[type];
  if (!prefix) throw new Error(`Unknown entity type: ${type}`);
  return `${prefix}${id.replace(/-/g, "").slice(0, 24)}`;
}

/**
 * Build an unsigned manage_data transaction.
 * Returns the XDR string for Freighter to sign.
 */
export async function buildManageDataTx(
  publicKey: string,
  key: string,
  value: string
): Promise<string> {
  if (key.length > 64) {
    throw new Error(`manage_data key exceeds 64 bytes: "${key}"`);
  }

  const server = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(publicKey);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: key,
        value: value,
      })
    )
    .setTimeout(30)
    .build();

  return tx.toXDR();
}

/**
 * Sign a TX XDR with Freighter and submit to Horizon.
 * Returns the transaction hash.
 */
export async function signAndSubmitTx(xdr: string): Promise<string> {
  const mod = await import("@stellar/freighter-api");
  const freighter = (mod as Record<string, unknown>).freighterApi ?? mod;

  if (typeof (freighter as Record<string, unknown>).signTransaction !== "function") {
    throw new Error(
      "Freighter surumunuz signTransaction desteklemiyor. Lutfen guncelleyiniz."
    );
  }

  const signed = await (
    freighter as {
      signTransaction: (
        xdr: string,
        opts: { networkPassphrase?: string }
      ) => Promise<{ signedTxXdr: string }>;
    }
  ).signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  const signedTx = StellarSdk.TransactionBuilder.fromXDR(
    signed.signedTxXdr,
    StellarSdk.Networks.TESTNET
  );

  const server = new StellarSdk.Horizon.Server(HORIZON_URL);
  const result = await server.submitTransaction(signedTx);
  return (result as { hash: string }).hash;
}

/**
 * Convenience: build manage_data TX, sign with Freighter, submit.
 * Returns { hash, key, value }.
 */
export async function writeIndexFromClient(
  publicKey: string,
  type: string,
  id: string,
  ipfsHash: string
): Promise<{ hash: string; key: string }> {
  const key = buildIndexKey(type, id);
  const xdr = await buildManageDataTx(publicKey, key, ipfsHash);
  const hash = await signAndSubmitTx(xdr);
  return { hash, key };
}

/**
 * Read all manage_data entries from an account.
 * Returns a Map of key → decoded string value.
 * Read-only — no authentication needed.
 */
export async function readAccountData(
  address: string
): Promise<Map<string, string>> {
  const server = new StellarSdk.Horizon.Server(HORIZON_URL);
  const account = await server.loadAccount(address);
  const dataMap = new Map<string, string>();

  const dataAttr = ((account as unknown as Record<string, unknown>).data_attr as Record<string, string>) || {};

  for (const [key, base64Value] of Object.entries(dataAttr)) {
    if (typeof base64Value === "string") {
      const decoded = atob(base64Value);
      dataMap.set(key, decoded);
    }
  }

  return dataMap;
}


export type ChainEntityType = "skill" | "mcp" | "proof" | "provider" | "botconfig" | "escrow" | "review";

export interface ChainIndexEntry {
  key: string;
  id: string;
  ipfsHash: string;
}

export function parseEntityIdFromKey(key: string, type: ChainEntityType): string | null {
  const prefix = PREFIXES[type];
  if (!key.startsWith(prefix)) return null;
  return key.slice(prefix.length);
}

export async function listEntityEntriesFromAccount(
  address: string,
  type: ChainEntityType
): Promise<ChainIndexEntry[]> {
  const dataMap = await readAccountData(address);
  const entries: ChainIndexEntry[] = [];

  for (const [key, value] of dataMap.entries()) {
    const id = parseEntityIdFromKey(key, type);
    if (!id || !value) continue;
    entries.push({ key, id, ipfsHash: value });
  }

  return entries;
}
