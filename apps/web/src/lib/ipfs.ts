// ---------------------------------------------------------------------------
// Client-side IPFS upload via Pinata
//
// Uses NEXT_PUBLIC_PINATA_API_KEY + NEXT_PUBLIC_PINATA_API_SECRET
// These are upload-only keys — safe to expose in the browser.
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

/**
 * Upload any JSON to IPFS via Pinata (client-side).
 * Returns the IPFS CID (v0 hash, "Qm..." prefix).
 */
export async function uploadJsonToIpfs(
  data: unknown,
  metadata: PinataMetadata
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
  const apiSecret = process.env.NEXT_PUBLIC_PINATA_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("Pinata API key not configured (NEXT_PUBLIC_PINATA_API_KEY)");
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
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    },
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
