import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { verifyDataProof } from '@dataeconomy/reclaim'
import crypto from 'node:crypto'

export const proofsRouter = new Hono()

// X402 payment middleware — Stellar testnet + USDC
// TODO: Replace with OpenZeppelin Relayer x402 Plugin for Stellar
// See: https://developers.stellar.org/docs/build/apps/x402
// Facilitator: https://channels.openzeppelin.com/x402/testnet
// SDK: @openzeppelin/relayer-sdk
//
// For now, X402 payment validation is a TODO placeholder.
// The middleware requires Soroban authorization (auth-entry signing)
// which needs a deployed facilitator connection.

const X402_FACILITATOR = process.env.X402_FACILITATOR_URL || 'https://channels.openzeppelin.com/x402/testnet'

const submitProofSchema = z.object({
  skillId: z.string().uuid(),
  userId: z.string(),
  proof: z.object({
    identifier: z.string(),
    claimData: z.object({
      provider: z.string(),
      parameters: z.string(),
      owner: z.string(),
      timestampS: z.number(),
      context: z.string(),
      epoch: z.number(),
    }),
    signatures: z.array(z.string()),
    witnesses: z.array(z.object({ id: z.string(), url: z.string() })),
  }),
})

// POST /api/proofs/submit
proofsRouter.post('/submit', zValidator('json', submitProofSchema), async (c) => {
  const body = c.req.valid('json')

  // TODO: X402 Stellar payment verification
  // When OpenZeppelin Relayer x402 Plugin is integrated:
  // 1. Check X-Payment header for Soroban auth-entry
  // 2. Verify via facilitator /verify endpoint
  // 3. Settle via /settle after proof accepted

  // ZK proof verification
  const isValid = await verifyDataProof(body.proof)
  if (!isValid) {
    return c.json({ error: 'ZK proof verification failed' }, 400)
  }

  // Timestamp check — reject proofs older than 24 hours
  const proofTimestamp = body.proof.claimData.timestampS * 1000
  if (proofTimestamp < Date.now() - 24 * 60 * 60 * 1000) {
    return c.json({ error: 'Proof too old (>24 hours)' }, 400)
  }

  // Generate proof hash
  const proofHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(body.proof))
    .digest('hex')

  // Store proof record
  proofStore.push({
    proofHash,
    skillId: body.skillId,
    provider: body.proof.claimData.provider,
    metric: body.proof.claimData.parameters,
    status: 'verified',
    timestamp: new Date().toISOString(),
  })

  // TODO: Write proof hash to Stellar
  // TODO: Trigger Soroban escrow release()

  return c.json({
    status: 'accepted',
    proofHash,
    skillId: body.skillId,
    userId: body.userId,
    timestamp: new Date().toISOString(),
    x402Facilitator: X402_FACILITATOR,
    escrowNote: 'Escrow release will trigger automatically when Soroban contract is deployed',
  })
})

// In-memory proof store (TODO: database)
const proofStore: Array<{
  proofHash: string
  skillId: string
  provider: string
  metric: string
  status: 'verified' | 'failed' | 'pending'
  timestamp: string
}> = []

// GET /api/proofs/list — All proofs
proofsRouter.get('/list', async (c) => {
  return c.json({ proofs: proofStore, total: proofStore.length })
})

// GET /api/proofs/:skillId
proofsRouter.get('/:skillId', async (c) => {
  const skillId = c.req.param('skillId')
  const filtered = proofStore.filter((p) => p.skillId === skillId)
  return c.json({ skillId, proofs: filtered, status: filtered.length > 0 ? 'has_proofs' : 'pending' })
})
