import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Memo,
  Operation,
  Asset,
} from "@stellar/stellar-sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";

/**
 * USDC issued by Centre on Stellar testnet (SAC contract address).
 * This is the canonical testnet USDC Stellar Asset Contract address.
 */
export const USDC_TESTNET_SAC =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

// ---------------------------------------------------------------------------
// Horizon server singleton
// ---------------------------------------------------------------------------

export const horizonServer = new Horizon.Server(HORIZON_TESTNET_URL);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConsentDecision = "ACCEPT" | "REJECT";

export interface ConsentTransaction {
  txHash: string;
  ledger: number;
  timestamp: string;
  sourceAccount: string;
  skillId: string;
  userId: string;
  decision: ConsentDecision;
  rawMemo: string;
}

// ---------------------------------------------------------------------------
// streamConsentTransactions
//
// Streams Stellar transactions for the given account via SSE (EventSource)
// and fires onConsent for each transaction that contains a valid CONSENT memo.
//
// Memo format: "CONSENT:<skillId>:<userId>:ACCEPT" or "CONSENT:<skillId>:<userId>:REJECT"
// ---------------------------------------------------------------------------

export function streamConsentTransactions(
  accountAddress: string,
  onConsent: (tx: ConsentTransaction) => void
): () => void {
  const builder = horizonServer
    .transactions()
    .forAccount(accountAddress)
    .cursor("now");

  const closeStream = builder.stream({
    onmessage(record) {
      const memoText: string | undefined =
        record.memo_type === "text" ? (record.memo as string) : undefined;

      if (!memoText) return;

      const parsed = parseConsentMemo(memoText);
      if (!parsed) return;

      const consentTx: ConsentTransaction = {
        txHash: record.hash,
        ledger: record.ledger_attr,
        timestamp: record.created_at,
        sourceAccount: record.source_account,
        skillId: parsed.skillId,
        userId: parsed.userId,
        decision: parsed.decision,
        rawMemo: memoText,
      };

      onConsent(consentTx);
    },
    onerror(err) {
      console.error("[stellar] SSE stream error:", err);
    },
  });

  // Return a close function so callers can unsubscribe
  return closeStream as unknown as () => void;
}

// ---------------------------------------------------------------------------
// writeConsentTx
//
// Submits a Stellar transaction with a text memo encoding consent.
// The memo is: "CONSENT:<skillId>:<userId>:ACCEPT" or "...REJECT"
//
// Memo text is capped at 28 bytes by Stellar; callers should keep IDs short.
// ---------------------------------------------------------------------------

export async function writeConsentTx(
  keypair: Keypair,
  skillId: string,
  userId: string,
  decision: ConsentDecision
): Promise<Horizon.HorizonApi.TransactionResponse> {
  const memoText = buildConsentMemo(skillId, userId, decision);

  if (Buffer.byteLength(memoText, "utf8") > 28) {
    throw new Error(
      `Consent memo exceeds 28-byte Stellar limit: "${memoText}". Shorten skillId/userId.`
    );
  }

  const account = await horizonServer.loadAccount(keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addMemo(Memo.text(memoText))
    // A self-payment of 0 XLM acts as the operation carrier
    .addOperation(
      Operation.payment({
        destination: keypair.publicKey(),
        asset: Asset.native(),
        amount: "0.0000001",
      })
    )
    .setTimeout(30)
    .build();

  tx.sign(keypair);

  const result = await horizonServer.submitTransaction(tx);
  return result as Horizon.HorizonApi.TransactionResponse;
}

// ---------------------------------------------------------------------------
// Data Index — manage_data operations for IPFS hash references
// ---------------------------------------------------------------------------

/**
 * Write an index entry to the platform account via manage_data.
 * Key format: "sk:{id}", "mc:{id}", "pf:{id}", "pr:{id}"
 * Value: IPFS CID (up to 64 bytes)
 *
 * This creates an on-chain key-value index that maps entity IDs to IPFS hashes.
 */
export async function writeIndexEntry(
  keypair: Keypair,
  key: string,
  value: string
): Promise<Horizon.HorizonApi.TransactionResponse> {
  if (key.length > 64) {
    throw new Error(`manage_data key exceeds 64 bytes: "${key}"`)
  }

  const account = await horizonServer.loadAccount(keypair.publicKey())

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: key,
        value: value,
      })
    )
    .setTimeout(30)
    .build()

  tx.sign(keypair)

  const result = await horizonServer.submitTransaction(tx)
  return result as Horizon.HorizonApi.TransactionResponse
}

/**
 * Delete an index entry (set value to null).
 */
export async function deleteIndexEntry(
  keypair: Keypair,
  key: string
): Promise<Horizon.HorizonApi.TransactionResponse> {
  const account = await horizonServer.loadAccount(keypair.publicKey())

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.manageData({
        name: key,
        value: null,
      })
    )
    .setTimeout(30)
    .build()

  tx.sign(keypair)

  const result = await horizonServer.submitTransaction(tx)
  return result as Horizon.HorizonApi.TransactionResponse
}

/**
 * Read all manage_data entries from an account.
 * Returns a Map of key → decoded string value.
 * Used for warm cache rebuild on startup.
 */
export async function readAccountData(
  address: string
): Promise<Map<string, string>> {
  const account = await horizonServer.loadAccount(address)
  const dataMap = new Map<string, string>()

  // account.data_attr contains base64-encoded values
  const dataAttr = (account as any).data_attr || {}

  for (const [key, base64Value] of Object.entries(dataAttr)) {
    if (typeof base64Value === 'string') {
      const decoded = Buffer.from(base64Value, 'base64').toString('utf8')
      dataMap.set(key, decoded)
    }
  }

  return dataMap
}


// ---------------------------------------------------------------------------
// USDC Payment
// ---------------------------------------------------------------------------

/**
 * Send USDC to a recipient on Stellar testnet.
 * Uses the testnet USDC issuer (classic Stellar asset, not SAC).
 */
export async function sendUsdcPayment(
  senderKeypair: Keypair,
  recipientAddress: string,
  amount: number,
  memo?: string
): Promise<Horizon.HorizonApi.TransactionResponse> {
  const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  const usdcAsset = new Asset('USDC', USDC_ISSUER_TESTNET)

  const account = await horizonServer.loadAccount(senderKeypair.publicKey())

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  }).addOperation(
    Operation.payment({
      destination: recipientAddress,
      asset: usdcAsset,
      amount: amount.toFixed(7),
    })
  )

  if (memo) builder.addMemo(Memo.text(memo.slice(0, 28)))

  const tx = builder.setTimeout(30).build()
  tx.sign(senderKeypair)

  const result = await horizonServer.submitTransaction(tx)
  return result as Horizon.HorizonApi.TransactionResponse
}

/**
 * Check if Stellar testnet is reachable.
 */
export async function isStellarAvailable(): Promise<boolean> {
  try {
    await horizonServer.loadAccount(
      process.env['STELLAR_PLATFORM_PUBLIC'] || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
    )
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildConsentMemo(
  skillId: string,
  userId: string,
  decision: ConsentDecision
): string {
  return `CONSENT:${skillId}:${userId}:${decision}`;
}

function parseConsentMemo(
  memo: string
): { skillId: string; userId: string; decision: ConsentDecision } | null {
  const parts = memo.split(":");
  if (parts.length !== 4) return null;
  if (parts[0] !== "CONSENT") return null;

  const decision = parts[3];
  if (decision !== "ACCEPT" && decision !== "REJECT") return null;

  return {
    skillId: parts[1],
    userId: parts[2],
    decision: decision as ConsentDecision,
  };
}
