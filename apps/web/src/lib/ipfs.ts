// ---------------------------------------------------------------------------
// Client-side IPFS upload via Pinata
//
// Supports two modes:
//   1. Platform keys: NEXT_PUBLIC_PINATA_API_KEY (upload-only, safe to expose)
//   2. Per-user keys: User provides their own Pinata JWT or API key/secret
//
// Users can also bring their own CID (uploaded via their own IPFS tool).
// ---------------------------------------------------------------------------

const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

interface PinataUploadResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

export interface PinataMetadata {
  name: string;
  keyvalues?: Record<string, string>;
}

export interface UserIpfsCredentials {
  /** Pinata JWT token (preferred) */
  jwt?: string;
  /** Pinata API key (alternative to JWT) */
  apiKey?: string;
  /** Pinata API secret (required with apiKey) */
  apiSecret?: string;
}

/**
 * Upload any JSON to IPFS via Pinata (client-side).
 * Returns the IPFS CID (v0 hash, "Qm..." prefix).
 *
 * If userCredentials is provided, uses the user's own Pinata account.
 * Otherwise falls back to platform keys.
 */
export async function uploadJsonToIpfs(
  data: unknown,
  metadata: PinataMetadata,
  userCredentials?: UserIpfsCredentials
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (userCredentials?.jwt) {
    // User's own Pinata JWT
    headers["Authorization"] = `Bearer ${userCredentials.jwt}`;
  } else if (userCredentials?.apiKey && userCredentials?.apiSecret) {
    // User's own Pinata API key/secret
    headers["pinata_api_key"] = userCredentials.apiKey;
    headers["pinata_secret_api_key"] = userCredentials.apiSecret;
  } else {
    // Platform keys (fallback)
    const apiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
    const apiSecret = process.env.NEXT_PUBLIC_PINATA_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error(
        "No IPFS credentials available. Provide your own Pinata credentials or set NEXT_PUBLIC_PINATA_API_KEY."
      );
    }

    headers["pinata_api_key"] = apiKey;
    headers["pinata_secret_api_key"] = apiSecret;
  }

  const body = JSON.stringify({
    pinataContent: data,
    pinataMetadata: {
      name: metadata.name,
      keyvalues: metadata.keyvalues || {},
    },
    pinataOptions: { cidVersion: 0 },
  });

  const response = await fetch(PINATA_API_URL, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IPFS upload failed [${response.status}]: ${text}`);
  }

  const result = (await response.json()) as PinataUploadResponse;
  return result.IpfsHash;
}

/**
 * Verify a CID exists on IPFS (for "bring your own CID" mode).
 * Users upload via their own tools, then provide the CID to the platform.
 */
export async function verifyCidExists(cid: string): Promise<boolean> {
  try {
    const url = `${PINATA_GATEWAY}/ipfs/${cid}`;
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch any JSON from IPFS via public Pinata gateway.
 * No authentication needed — read-only.
 */
export async function fetchFromIpfs<T = unknown>(cid: string): Promise<T> {
  const url = `${PINATA_GATEWAY}/ipfs/${cid}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`IPFS fetch failed [${response.status}]: ${url}`);
  }

  return (await response.json()) as T;
}
