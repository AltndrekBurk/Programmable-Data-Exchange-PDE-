import { ReclaimClient } from "@reclaimprotocol/zk-fetch";

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
// verifyDataProof
//
// MVP notu:
// - Şu an backend tarafında ZK-TLS doğrulamasını gerçekten çalıştırmıyoruz.
// - Bu fonksiyon sadece proof objesinin temel alanlarını ve timestamp/provider/
//   parameters gibi kritik bilgileri kontrol eden hafif bir stub.
// - İleride self-hosted attestor + gerçek verifyProof entegrasyonu buraya
//   tekrar bağlanacak; backend arayüzü değişmeyecek.
// ---------------------------------------------------------------------------

export async function verifyDataProof(proof: ReclaimProof): Promise<boolean> {
  if (!proof || typeof proof !== "object") return false;

  const data = proof.claimData;
  if (!data) return false;

  // Provider zorunlu
  if (typeof data.provider !== "string" || !data.provider.trim()) {
    return false;
  }

  // İstenen metric/parametre bilgisi zorunlu
  if (typeof data.parameters !== "string" || !data.parameters.trim()) {
    return false;
  }

  // Timestamp zorunlu ve makul aralıkta olmalı (± 7 gün guard)
  if (typeof data.timestampS !== "number" || !Number.isFinite(data.timestampS)) {
    return false;
  }
  const tsMs = data.timestampS * 1000;
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  if (tsMs < now - sevenDaysMs || tsMs > now + sevenDaysMs) {
    return false;
  }

  // En az bir witness beklenir
  if (!Array.isArray(proof.witnesses) || proof.witnesses.length === 0) {
    return false;
  }

  // Şimdilik bu kontroller yeterli; gerçek ZK doğrulaması ileride eklenecek.
  return true;
}

// ---------------------------------------------------------------------------
// createFitbitProof
//
// Generates a ZK proof that a Fitbit metric value exists without revealing
// the raw access token to the verifier.
// ---------------------------------------------------------------------------

export async function createFitbitProof(
  accessToken: string,
  metric: FitbitMetric
): Promise<ProofResult> {
  const appId = process.env.RECLAIM_APP_ID ?? "";
  const appSecret = process.env.RECLAIM_APP_SECRET ?? "";
  const client = new ReclaimClient(appId, appSecret);

  const endpoint = fitbitEndpoint(metric);

  try {
    const proof = await client.zkFetch(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Accept-Language": "en_US",
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseMatches: [
          {
            type: "contains",
            value: `"${metric}"`,
          },
        ],
      }
    );

    return {
      success: !!proof,
      proof: proof as unknown as ReclaimProof,
      metric,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      proof: null,
      metric,
      createdAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// createStravaProof
//
// Generates a ZK proof that a Strava athlete stats metric exists.
// ---------------------------------------------------------------------------

export async function createStravaProof(
  accessToken: string,
  metric: StravaMetric
): Promise<ProofResult> {
  const appId = process.env.RECLAIM_APP_ID ?? "";
  const appSecret = process.env.RECLAIM_APP_SECRET ?? "";
  const client = new ReclaimClient(appId, appSecret);

  // Strava athlete stats endpoint requires the authenticated athlete's ID.
  const athleteId = await resolveStravaAthleteId(accessToken);
  const endpoint = `https://www.strava.com/api/v3/athletes/${athleteId}/stats`;

  try {
    const proof = await client.zkFetch(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseMatches: [
          {
            type: "contains",
            value: `"${metric}"`,
          },
        ],
      }
    );

    return {
      success: !!proof,
      proof: proof as unknown as ReclaimProof,
      metric,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      success: false,
      proof: null,
      metric,
      createdAt: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
