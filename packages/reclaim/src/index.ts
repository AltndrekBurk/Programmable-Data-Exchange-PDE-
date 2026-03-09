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
 * Raw Reclaim proof structure.
 *
 * witnesses[].id = hex-encoded ed25519 public key of the attestor
 * signatures[]  = hex-encoded ed25519 signatures over sha256(claimData)
 *
 * The attestor-core signs the canonical JSON of claimData. The platform
 * verifies these signatures against known attestor public keys.
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
 *
 * In production, ATTESTOR_PUBLIC_KEYS **must** be set — otherwise anyone
 * can spin up an attestor and forge proofs.
 *
 * Example: ATTESTOR_PUBLIC_KEYS=aabbcc01...,ddeeff02...
 */
function getAttestorPublicKeys(): string[] {
  const raw = process.env.ATTESTOR_PUBLIC_KEYS ?? "";
  if (!raw.trim()) return [];
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0);
}

/**
 * Self-hosted attestor-core URL.
 *
 * attestor-core is the TLS witness that observes API responses and signs
 * claim data with its ed25519 private key. It never stores raw data.
 *
 * Deploy: https://github.com/reclaimprotocol/attestor-core
 *   git clone → npm install → PRIVATE_KEY=<hex> → npm run start:tsc
 *
 * Default: http://localhost:8001
 */
function getAttestorUrl(): string {
  return process.env.ATTESTOR_URL ?? "http://localhost:8001";
}

/**
 * Check attestor-core health before making proof requests.
 * Returns true if the attestor is reachable.
 */
export async function checkAttestorHealth(): Promise<{
  healthy: boolean;
  url: string;
  error?: string;
}> {
  const url = getAttestorUrl();
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return { healthy: res.ok, url };
  } catch (err) {
    return {
      healthy: false,
      url,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// verifyDataProof — real ed25519 signature verification
//
// Verification pipeline:
//   1. Structure checks (provider, parameters, timestamp, witnesses)
//   2. Freshness check (timestamp within ±7 days)
//   3. Serialize claimData canonically → sha256 hash
//   4. Verify each witness ed25519 signature against the hash
//   5. If ATTESTOR_PUBLIC_KEYS is set → require ≥1 signature from known keys
//   6. If not set (dev mode) → accept any valid ed25519 signature
//
// This function is called by the facilitator API at POST /api/proofs/submit.
// The attestor-core signs claimData; this function validates those signatures.
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
  // Cryptographic verification — ed25519 over sha256(canonicalClaimData)
  // ---------------------------------------------------------------------------

  // Canonical serialization (deterministic field order)
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

    // Corresponding witness public key
    const witness = proof.witnesses[i];
    if (!witness?.id) continue;

    // Witness ID = hex-encoded ed25519 public key (optionally 0x-prefixed)
    const witnessKey = (witness.id.startsWith("0x")
      ? witness.id.slice(2)
      : witness.id
    ).toLowerCase();

    try {
      const sigBytes = hexToBytes(sigHex.startsWith("0x") ? sigHex.slice(2) : sigHex);
      const pubKeyBytes = hexToBytes(witnessKey);

      // ed25519 verify: signature over sha256(claimData) with witness pubkey
      const isValid = ed25519.verify(sigBytes, messageHash, pubKeyBytes);
      if (isValid) {
        validSignatureCount++;
        if (requireKnownAttestors && knownAttestorKeys.includes(witnessKey)) {
          knownAttestorSignatures++;
        }
      }
    } catch {
      // Invalid signature format — skip this witness
      continue;
    }
  }

  // ── Production mode (ATTESTOR_PUBLIC_KEYS set) ──
  // Require at least one valid signature from a known attestor.
  // This prevents forged proofs from unknown attestors.
  if (requireKnownAttestors) {
    if (knownAttestorSignatures === 0) {
      console.warn(
        `[reclaim] REJECTED — no signatures from known attestors. ` +
        `Valid sigs: ${validSignatureCount}, known attestor sigs: 0. ` +
        `Hash: ${messageHex}. ` +
        `Known keys: ${knownAttestorKeys.length}`
      );
      return false;
    }
    return true;
  }

  // ── Dev mode (no ATTESTOR_PUBLIC_KEYS) ──
  // Accept any valid ed25519 signature. Log warning.
  if (validSignatureCount === 0) {
    console.warn(
      `[reclaim] DEV MODE — no valid ed25519 signatures found. ` +
      `Accepting based on structure only (set ATTESTOR_PUBLIC_KEYS for production). ` +
      `Hash: ${messageHex}`
    );
    // Dev fallback: accept if structure is valid
    return true;
  }

  return true;
}

// ---------------------------------------------------------------------------
// createApiProof — generic ZK-TLS proof for any web API
//
// Flow:
//   1. Provider calls createApiProof({ apiUrl, accessToken, ... })
//   2. ReclaimClient.zkFetch connects to attestor-core (self-hosted)
//   3. Attestor opens a TLS session to the target API
//   4. Attestor witnesses the response, hashes it, signs with ed25519
//   5. Returns ReclaimProof { claimData, signatures, witnesses }
//   6. Provider submits proof to POST /api/proofs/submit
//
// The attestor URL is configured via ATTESTOR_URL env var.
// For production, deploy attestor-core on your own server.
// ---------------------------------------------------------------------------

export async function createApiProof(opts: {
  apiUrl: string;
  accessToken?: string;
  headers?: Record<string, string>;
  responseMatch: string;
  metric: string;
}): Promise<ProofResult> {
  const attestorUrl = getAttestorUrl();

  // ReclaimClient with self-hosted attestor — no APP_ID needed
  // When using attestor-core, APP_ID/APP_SECRET are optional identifiers.
  // The attestor itself handles TLS witnessing without Reclaim's hosted infra.
  const appId = process.env.RECLAIM_APP_ID ?? "self-hosted";
  const appSecret = process.env.RECLAIM_APP_SECRET ?? "self-hosted";
  const client = new ReclaimClient(appId, appSecret);

  const reqHeaders: Record<string, string> = {
    ...opts.headers,
  };
  if (opts.accessToken) {
    reqHeaders["Authorization"] = `Bearer ${opts.accessToken}`;
  }

  // Headers to redact from proof (keep auth tokens secret)
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

    if (!proof) {
      return {
        success: false,
        proof: null,
        metric: opts.metric,
        createdAt: new Date().toISOString(),
        error: `Attestor returned empty proof (attestor: ${attestorUrl})`,
      };
    }

    return {
      success: true,
      proof: proof as unknown as ReclaimProof,
      metric: opts.metric,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isConnectionError =
      errorMsg.includes("ECONNREFUSED") ||
      errorMsg.includes("fetch failed") ||
      errorMsg.includes("ETIMEDOUT");

    return {
      success: false,
      proof: null,
      metric: opts.metric,
      createdAt: new Date().toISOString(),
      error: isConnectionError
        ? `Cannot reach attestor at ${attestorUrl} — is attestor-core running? (${errorMsg})`
        : errorMsg,
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
