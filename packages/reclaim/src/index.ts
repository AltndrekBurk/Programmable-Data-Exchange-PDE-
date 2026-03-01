import { verifyProof } from "@reclaimprotocol/js-sdk";
import { ReclaimClient as ZKFetchClient } from "@reclaimprotocol/zk-fetch";

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
// Verifies a Reclaim proof object using the JS SDK.
// Returns true if the proof is valid, false otherwise.
// ---------------------------------------------------------------------------

export async function verifyDataProof(proof: ReclaimProof): Promise<boolean> {
  try {
    const result = await verifyProof(proof as unknown as Parameters<typeof verifyProof>[0]);
    return !!result;
  } catch (err) {
    console.error("[reclaim] Proof verification failed:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// createFitbitProof
//
// Generates a ZK proof that a Fitbit metric value exists without revealing
// the raw access token to the verifier.
//
// Supported metrics:
//   "steps"      → activities/steps summary for today
//   "heart_rate" → activities/heart summary for today
//   "sleep"      → sleep/date/today summary
//   "weight"     → body/log/weight/date/today summary
// ---------------------------------------------------------------------------

export async function createFitbitProof(
  accessToken: string,
  metric: FitbitMetric
): Promise<ProofResult> {
  const zkFetch = new ZKFetchClient({
    reclaimAppId: process.env.RECLAIM_APP_ID ?? "",
    reclaimAppSecret: process.env.RECLAIM_APP_SECRET ?? "",
  });

  const endpoint = fitbitEndpoint(metric);

  try {
    const proof = await zkFetch.fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Accept-Language": "en_US",
      },
      // Reveal only the top-level metric key, not the auth header
      secretParams: { Authorization: `Bearer ${accessToken}` },
      // Response redactions: only prove the relevant value exists
      responseMatches: [
        {
          type: "contains",
          value: `"${metric}"`,
        },
      ],
    });

    return {
      success: true,
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
// Uses the Strava v3 API with the provided OAuth access token.
//
// Supported metrics:
//   "distance"             → recent_run_totals.distance
//   "moving_time"          → recent_run_totals.moving_time
//   "elapsed_time"         → recent_run_totals.elapsed_time
//   "total_elevation_gain" → recent_run_totals.elevation_gain
// ---------------------------------------------------------------------------

export async function createStravaProof(
  accessToken: string,
  metric: StravaMetric
): Promise<ProofResult> {
  const zkFetch = new ZKFetchClient({
    reclaimAppId: process.env.RECLAIM_APP_ID ?? "",
    reclaimAppSecret: process.env.RECLAIM_APP_SECRET ?? "",
  });

  // Strava athlete stats endpoint requires the authenticated athlete's ID.
  // We first resolve the athlete ID from the /athlete endpoint.
  const athleteId = await resolveStravaAthleteId(accessToken);
  const endpoint = `https://www.strava.com/api/v3/athletes/${athleteId}/stats`;

  try {
    const proof = await zkFetch.fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      secretParams: { Authorization: `Bearer ${accessToken}` },
      responseMatches: [
        {
          type: "contains",
          value: `"${metric}"`,
        },
      ],
    });

    return {
      success: true,
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
