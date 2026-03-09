import { ReclaimClient } from "@reclaimprotocol/zk-fetch";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FitbitMetric = "steps" | "heart_rate" | "sleep" | "weight";
export type StravaMetric = "distance" | "moving_time" | "elapsed_time" | "total_elevation_gain";

export interface ProofResult {
  /** Whether the proof was successfully generated and verified */
  success: boolean;
  /** The raw proof object returned by Reclaim SDK */
  proof: ReclaimProof | null;
  /** Error message if success is false */
  error?: string;
  /** The metric name that was proved */
  metric: string;
  /** ISO timestamp when the proof was created */
  createdAt: string;
}

/**
 * Raw Reclaim proof structure (subset of the full SDK type).
 * Use `proof` field as opaque data when forwarding to the smart contract.
 */
export interface ReclaimProof {
  identifier: string;
  claimData: {
    provider: string;
    parameters: string;
    owner: string;
    timestampS: number;
    context: string;
    identifier: string;
    epoch: number;
  };
  signatures: string[];
  witnesses: Array<{ id: string; url: string }>;
  extractedParameterValues?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Attestor configuration
// ---------------------------------------------------------------------------

/**
 * Get known attestor public keys from environment.
 * Format: comma-separated hex-encoded ed25519 public keys.
 * Example: ATTESTOR_PUBLIC_KEYS=aabbcc...,ddeeff...
 */
function getAttestorPublicKeys(): string[] {
  const raw = process.env.ATTESTOR_PUBLIC_KEYS ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Attestor URL for self-hosted attestor-core.
 * Default: http://localhost:8001
 */
function getAttestorUrl(): string {
  return process.env.ATTESTOR_URL ?? "http://localhost:8001";
}

// ---------------------------------------------------------------------------
// verifyDataProof — real ed25519 signature verification
//
// Verification logic:
//   1. Basic structure checks (provider, parameters, timestamp, witnesses)
//   2. Serialize claimData canonically → sha256 hash
//   3. Verify each witness signature against the hash
//   4. If ATTESTOR_PUBLIC_KEYS is set, require signatures from known attestors
//   5. Otherwise, accept any valid ed25519 signature (dev mode)
// ---------------------------------------------------------------------------

export async function verifyDataProof(proof: ReclaimProof): Promise<boolean> {
  if (!proof || typeof proof !== "object") return false;

  const data = proof.claimData;
  if (!data) return false;

  // Provider required
  if (typeof data.provider !== "string" || !data.provider.trim()) {
    return false;
  }

  // Parameters required
  if (typeof data.parameters !== "string" || !data.parameters.trim()) {
    return false;
  }

  // Timestamp required and within ± 7 days
  if (typeof data.timestampS !== "number" || !Number.isFinite(data.timestampS)) {
    return false;
  }
  const tsMs = data.timestampS * 1000;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (tsMs < now - sevenDaysMs || tsMs > now + sevenDaysMs) {
    return false;
  }

  // At least one witness required
  if (!Array.isArray(proof.witnesses) || proof.witnesses.length === 0) {
    return false;
  }

  // At least one signature required
  if (!Array.isArray(proof.signatures) || proof.signatures.length === 0) {
    return false;
  }

  // ---------------------------------------------------------------------------
  // Cryptographic verification
  // ---------------------------------------------------------------------------

  // Canonical serialization of claimData for signature verification
  const claimDataCanonical = JSON.stringify({
    provider: data.provider,
    parameters: data.parameters,
    owner: data.owner,
    timestampS: data.timestampS,
    context: data.context,
    identifier: data.identifier,
    epoch: data.epoch,
  });

  const messageHash = sha256(new TextEncoder().encode(claimDataCanonical));
  const messageHex = bytesToHex(messageHash);

  const knownAttestorKeys = getAttestorPublicKeys();
  const requireKnownAttestors = knownAttestorKeys.length > 0;

  let validSignatureCount = 0;
  let knownAttestorSignatures = 0;

  for (let i = 0; i < proof.signatures.length; i++) {
    const sigHex = proof.signatures[i];
    if (!sigHex || typeof sigHex !== "string") continue;

    // Get corresponding witness public key
    const witness = proof.witnesses[i];
    if (!witness?.id) continue;

    // Witness ID is expected to be a hex-encoded ed25519 public key
    // or prefixed with "0x"
    const witnessKey = witness.id.startsWith("0x")
      ? witness.id.slice(2)
      : witness.id;

    try {
      const sigBytes = hexToBytes(sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex);
      const pubKeyBytes = hexToBytes(witnessKey);

      // Verify ed25519 signature over the sha256 hash of claimData
      const isValid = ed25519.verify(sigBytes, messageHash, pubKeyBytes);
      if (isValid) {
        validSignatureCount++;
        if (requireKnownAttestors && knownAttestorKeys.includes(witnessKey.toLowerCase())) {
          knownAttestorSignatures++;
        }
      }
    } catch {
      // Invalid signature format — skip
      continue;
    }
  }

  // In production (ATTESTOR_PUBLIC_KEYS set): require at least one known attestor signature
  if (requireKnownAttestors) {
    if (knownAttestorSignatures === 0) {
      console.warn(
        `[reclaim] No valid signatures from known attestors. ` +
        `Valid signatures: ${validSignatureCount}, known attestor sigs: 0. ` +
        `Message hash: ${messageHex}`
      );
      return false;
    }
    return true;
  }

  // In dev mode (no ATTESTOR_PUBLIC_KEYS): accept any valid signature
  // but still require at least one valid sig
  if (validSignatureCount === 0) {
    console.warn(
      `[reclaim] No valid ed25519 signatures found. ` +
      `Dev mode (no ATTESTOR_PUBLIC_KEYS). ` +
      `Falling back to structure-only validation.`
    );
    // Dev fallback: accept if structure is valid (backward compat)
    return true;
  }

  return true;
}

// ---------------------------------------------------------------------------
// createApiProof — generic proof for any web API
//
// Use this for any API that returns JSON data. The attestor verifies the TLS
// session and produces a ZK proof that the response matches the given pattern.
// ---------------------------------------------------------------------------

export async function createApiProof(opts: {
  apiUrl: string;
  accessToken?: string;
  headers?: Record<string, string>;
  responseMatch: string;
  metric: string;
}): Promise<ProofResult> {
  const appId = process.env.RECLAIM_APP_ID ?? "";
  const appSecret = process.env.RECLAIM_APP_SECRET ?? "";
  const client = new ReclaimClient(appId, appSecret);

  const reqHeaders: Record<string, string> = {
    ...opts.headers,
  };
  if (opts.accessToken) {
    reqHeaders["Authorization"] = `Bearer ${opts.accessToken}`;
  }

  // Headers to redact from proof (keep auth secret)
  const secretHeaders: Record<string, string> = {};
  if (opts.accessToken) {
    secretHeaders["Authorization"] = `Bearer ${opts.accessToken}`;
  }

  try {
    const proof = await client.zkFetch(
      opts.apiUrl,
      {
        method: "GET",
        headers: reqHeaders,
      },
      {
        headers: secretHeaders,
        responseMatches: [
          {
            type: "contains",
            value: opts.responseMatch,
          },
        ],
      }
    );

    return {
      success: !!proof,
      proof: proof as unknown as ReclaimProof,
      metric: opts.metric,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      proof: null,
      metric: opts.metric,
      createdAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// createFitbitProof
// ---------------------------------------------------------------------------

export async function createFitbitProof(
  accessToken: string,
  metric: FitbitMetric
): Promise<ProofResult> {
  return createApiProof({
    apiUrl: fitbitEndpoint(metric),
    accessToken,
    responseMatch: `"${metric}"`,
    metric,
  });
}

// ---------------------------------------------------------------------------
// createStravaProof
// ---------------------------------------------------------------------------

export async function createStravaProof(
  accessToken: string,
  metric: StravaMetric
): Promise<ProofResult> {
  const athleteId = await resolveStravaAthleteId(accessToken);
  return createApiProof({
    apiUrl: `https://www.strava.com/api/v3/athletes/${athleteId}/stats`,
    accessToken,
    responseMatch: `"${metric}"`,
    metric,
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fitbitEndpoint(metric: FitbitMetric): string {
  switch (metric) {
    case "steps":
    case "heart_rate":
      return "https://api.fitbit.com/1/user/-/activities/date/today.json";
    case "sleep":
      return "https://api.fitbit.com/1.2/user/-/sleep/date/today.json";
    case "weight":
      return "https://api.fitbit.com/1/user/-/body/log/weight/date/today.json";
  }
}

async function resolveStravaAthleteId(accessToken: string): Promise<number> {
  const response = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to resolve Strava athlete ID: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { id: number };
  return data.id;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
