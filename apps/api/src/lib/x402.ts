// ---------------------------------------------------------------------------
// X402 — OpenZeppelin Relayer x402 Plugin helpers (Stellar USDC)
//
// Facilitator: https://channels.openzeppelin.com/x402/testnet
// Flow:
//   1. Client sends request without X-PAYMENT → 402 + payment requirements
//   2. Client pays on Stellar, retries with X-PAYMENT header
//   3. Server calls /verify → if valid, processes request
//   4. Server calls /settle → funds actually move
// ---------------------------------------------------------------------------

// Read lazily (after env is loaded) — don't use top-level const for process.env
const cfg = () => ({
  facilitator: process.env.X402_FACILITATOR_URL ?? 'https://channels.openzeppelin.com/x402/testnet',
  apiKey: process.env.X402_API_KEY ?? '',
  platformAddress: process.env.STELLAR_PLATFORM_PUBLIC ?? '',
  usdcSac: process.env.USDC_TESTNET_SAC ?? 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
})
const isProd = process.env.NODE_ENV === 'production'

// 0.01 USDC spam fee (7 decimals: 100_000 / 10^7 = 0.0100000)
const PROOF_SUBMISSION_FEE = '100000'

export interface PaymentRequirement {
  scheme: string
  network: string
  maxAmountRequired: string
  resource: string
  description: string
  mimeType: string
  payTo: string
  maxTimeoutSeconds: number
  asset: string
  extra: { name: string; decimals: string }
}

export interface X402Requirements {
  x402Version: number
  error: string
  accepts: PaymentRequirement[]
}

/**
 * Build the 402 payment requirements response body.
 * resource should be the full URL of the protected endpoint.
 */
export function buildRequirements(resource: string): X402Requirements {
  const platformAddress = cfg().platformAddress
  if (!platformAddress && isProd) {
    throw new Error('[x402] STELLAR_PLATFORM_PUBLIC is required in production')
  }

  return {
    x402Version: 1,
    error: 'Payment required',
    accepts: [
      {
        scheme: 'exact',
        network: 'stellar-testnet',
        maxAmountRequired: PROOF_SUBMISSION_FEE,
        resource,
        description: 'Proof submission spam prevention — 0.01 USDC',
        mimeType: 'application/json',
        payTo: platformAddress || 'MISSING_PLATFORM_ADDRESS',
        maxTimeoutSeconds: 300,
        asset: cfg().usdcSac,
        extra: { name: 'USDC', decimals: '7' },
      },
    ],
  }
}

/**
 * Verify a payment with the OpenZeppelin facilitator.
 * Returns { valid: true } on success.
 */
export async function verifyPayment(
  paymentHeader: string,
  requirements: X402Requirements
): Promise<{ valid: boolean; error?: string }> {
  if (!cfg().platformAddress) {
    if (isProd) {
      return { valid: false, error: 'STELLAR_PLATFORM_PUBLIC missing in production' }
    }
    console.warn('[x402] STELLAR_PLATFORM_PUBLIC not set')
  }

  if (!cfg().apiKey) {
    if (isProd) {
      return { valid: false, error: 'X402_API_KEY missing in production' }
    }
    console.warn('[x402] X402_API_KEY not set — skipping verify')
    return { valid: true }
  }

  try {
    const res = await fetch(`${cfg().facilitator}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg().apiKey}`,
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        requirements: requirements.accepts[0],
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { valid: false, error: `Facilitator error ${res.status}: ${text}` }
    }

    const data = (await res.json()) as { valid: boolean; error?: string }
    return data
  } catch (err) {
    return { valid: false, error: String(err) }
  }
}

/**
 * Settle a payment after successful request processing.
 * Fire-and-forget — failure is logged but doesn't affect the response.
 */
export async function settlePayment(
  paymentHeader: string,
  requirements: X402Requirements
): Promise<void> {
  if (!cfg().apiKey) {
    if (isProd) {
      console.error('[x402] X402_API_KEY missing in production, settlement skipped')
    }
    return
  }

  try {
    const res = await fetch(`${cfg().facilitator}/settle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg().apiKey}`,
      },
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        requirements: requirements.accepts[0],
      }),
    })

    if (!res.ok) {
      console.warn(`[x402] Settle failed ${res.status}:`, await res.text())
    } else {
      console.log('[x402] Payment settled')
    }
  } catch (err) {
    console.warn('[x402] Settle error (non-critical):', err)
  }
}
