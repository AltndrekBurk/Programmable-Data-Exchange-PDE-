import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { Keypair } from '@stellar/stellar-sdk'
import { generatePseudonym } from '@pde/pseudonym'
import crypto from 'crypto'

export const authRouter = new Hono()
const isProd = process.env.NODE_ENV === 'production'

// ---------------------------------------------------------------------------
// Challenge store
// In serverless (Vercel), each invocation may get a fresh process.
// For testnet MVP this is acceptable — challenges may expire on cold starts.
// Production: replace with Redis or KV store.
// ---------------------------------------------------------------------------
const challenges = new Map<string, { challenge: string; expiresAt: number }>()

// Periodic cleanup of expired challenges (every 60s in long-running mode)
if (!process.env.VERCEL) {
  setInterval(() => {
    const now = Date.now()
    for (const [key, val] of challenges) {
      if (val.expiresAt < now) challenges.delete(key)
    }
  }, 60_000)
}

// ---------------------------------------------------------------------------
// Rate limiting: simple sliding window per address
// ---------------------------------------------------------------------------
const rateLimits = new Map<string, number[]>()
const RATE_LIMIT_WINDOW = 60_000 // 1 minute
const RATE_LIMIT_MAX = 10 // max 10 challenges per minute per address

function isRateLimited(address: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimits.get(address) || []).filter(t => now - t < RATE_LIMIT_WINDOW)
  if (timestamps.length >= RATE_LIMIT_MAX) return true
  timestamps.push(now)
  rateLimits.set(address, timestamps)
  return false
}

// ---------------------------------------------------------------------------
// GET /api/auth/challenge?address=G...
// Returns a one-time challenge string valid for 5 minutes.
// ---------------------------------------------------------------------------
authRouter.get('/challenge', (c) => {
  const address = c.req.query('address')
  if (!address || !address.startsWith('G') || address.length !== 56) {
    return c.json({ error: 'Invalid Stellar address' }, 400)
  }

  if (isRateLimited(address)) {
    return c.json({ error: 'Too many requests. Try again later.' }, 429)
  }

  const challenge = `pde-auth:${address}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`
  challenges.set(address, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  })

  return c.json({ challenge })
})

// ---------------------------------------------------------------------------
// POST /api/auth/verify
// Verifies Ed25519 signature against the challenge.
// Returns pseudonymous ID (real identity is never stored).
// ---------------------------------------------------------------------------
const verifySchema = z.object({
  publicKey: z.string().startsWith('G').length(56),
  signature: z.string().min(1),
  challenge: z.string().min(1),
})

authRouter.post('/verify', zValidator('json', verifySchema), async (c) => {
  const { publicKey, signature, challenge } = c.req.valid('json')

  // Challenge validation
  const stored = challenges.get(publicKey)
  if (!stored || stored.challenge !== challenge || stored.expiresAt < Date.now()) {
    return c.json({ error: 'Challenge invalid or expired' }, 401)
  }
  challenges.delete(publicKey) // single-use

  // Ed25519 signature verification
  let isValid = false
  try {
    const keypair = Keypair.fromPublicKey(publicKey)
    const messageBuffer = Buffer.from(challenge, 'utf-8')
    const signatureBuffer = Buffer.from(signature, 'base64')

    // Freighter may return different signature formats
    // Try raw Ed25519 first, then hex decode
    try {
      isValid = keypair.verify(messageBuffer, signatureBuffer)
    } catch {
      try {
        const hexBuffer = Buffer.from(signature, 'hex')
        isValid = keypair.verify(messageBuffer, hexBuffer)
      } catch {
        // Signature format not recognized
      }
    }
  } catch (err) {
    console.warn('[auth] Signature parsing error:', err)
  }

  if (!isValid) {
    return c.json({ error: 'Signature verification failed' }, 401)
  }

  // Generate pseudonymous ID
  const secret = process.env.PSEUDONYM_SECRET
  if (!secret) {
    return c.json({ error: 'Server configuration error (PSEUDONYM_SECRET)' }, 500)
  }
  const pseudoId = generatePseudonym(secret, publicKey).pseudonym

  return c.json({ pseudoId, stellarAddress: publicKey })
})
