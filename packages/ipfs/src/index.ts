// ---------------------------------------------------------------------------
// @dataeconomy/ipfs — Pinata-backed IPFS utilities
//
// Environment variables required:
//   PINATA_JWT          — Pinata JWT API key (v2 API)
//   PINATA_GATEWAY_URL  — Your Pinata gateway URL, e.g. "https://gateway.pinata.cloud"
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The canonical shape of a skill JSON document stored on IPFS.
 *
 * callbackUrl is stored encrypted (AES-GCM / Base64) so that only the
 * platform backend can read the data-buyer's webhook address.
 */
export interface SkillJson {
  /** Unique skill identifier (UUID or slug) */
  id: string;
  /** Human-readable skill title */
  title: string;
  /** Detailed description visible to data providers */
  description: string;
  /** Data source identifier, e.g. "fitbit", "strava", "garmin" */
  dataSource: string;
  /** List of metric names required, e.g. ["steps", "heart_rate"] */
  metrics: string[];
  /** Per-provider reward in USDC (7-decimal integer string, e.g. "1000000" = 0.1 USDC) */
  reward: string;
  /** Total campaign budget in USDC (same encoding as reward) */
  totalBudget: string;
  /** ISO-8601 UTC expiry date for the campaign */
  expiresAt: string;
  /**
   * Encrypted callback URL where verified proof results are POSTed.
   * Format: base64(iv):base64(ciphertext) — encrypted with the platform's AES key.
   */
  callbackUrl: string;
}

// Pinata v2 API response shapes (partial)
interface PinataUploadResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

// ---------------------------------------------------------------------------
// uploadSkillJson
//
// Uploads a SkillJson document to IPFS via Pinata's pinJSONToIPFS endpoint.
// Returns the IPFS CID (v0 hash, "Qm..." prefix).
// ---------------------------------------------------------------------------

export async function uploadSkillJson(skillData: SkillJson): Promise<string> {
  const jwt = requireEnv("PINATA_JWT");

  const body = JSON.stringify({
    pinataContent: skillData,
    pinataMetadata: {
      name: `skill-${skillData.id}.json`,
      keyvalues: {
        skillId: skillData.id,
        dataSource: skillData.dataSource,
      },
    },
    pinataOptions: {
      cidVersion: 0,
    },
  });

  const response = await fetch(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Pinata upload failed [${response.status}]: ${text}`
    );
  }

  const data = (await response.json()) as PinataUploadResponse;
  return data.IpfsHash;
}

// ---------------------------------------------------------------------------
// getSkillJson
//
// Fetches and parses a SkillJson document from IPFS.
// Uses the configured Pinata gateway (falls back to public ipfs.io gateway).
// ---------------------------------------------------------------------------

export async function getSkillJson(ipfsHash: string): Promise<SkillJson> {
  const gatewayBase =
    process.env["PINATA_GATEWAY_URL"] ?? "https://gateway.pinata.cloud";

  const url = `${gatewayBase}/ipfs/${ipfsHash}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch IPFS document [${response.status}]: ${url}`
    );
  }

  const data = (await response.json()) as SkillJson;

  // Minimal shape validation
  if (
    typeof data.id !== "string" ||
    typeof data.title !== "string" ||
    !Array.isArray(data.metrics)
  ) {
    throw new Error(
      `Invalid SkillJson shape for hash ${ipfsHash}: missing required fields`
    );
  }

  return data;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }
  return value;
}
