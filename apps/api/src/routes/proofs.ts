import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { verifyDataProof } from '@dataeconomy/reclaim'
import crypto from 'node:crypto'
import type { StorageService } from '@dataeconomy/storage'

const X402_FACILITATOR = process.env.X402_FACILITATOR_URL || 'https://channels.openzeppelin.com/x402/testnet'

export function createProofsRouter(storage: StorageService) {
  const router = new Hono()

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
  router.post('/submit', zValidator('json', submitProofSchema), async (c) => {
    const body = c.req.valid('json')

    const isValid = await verifyDataProof(body.proof)
    if (!isValid) {
      return c.json({ error: 'ZK proof verification failed' }, 400)
    }

    const proofTimestamp = body.proof.claimData.timestampS * 1000
    if (proofTimestamp < Date.now() - 24 * 60 * 60 * 1000) {
      return c.json({ error: 'Proof too old (>24 hours)' }, 400)
    }

    const proofHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(body.proof))
      .digest('hex')

    await storage.storeProof({
      proofHash,
      skillId: body.skillId,
      provider: body.proof.claimData.provider,
      metric: body.proof.claimData.parameters,
      status: 'verified',
      timestamp: new Date().toISOString(),
    })

    return c.json({
      status: 'accepted',
      proofHash,
      skillId: body.skillId,
      userId: body.userId,
      timestamp: new Date().toISOString(),
      x402Facilitator: X402_FACILITATOR,
    })
  })

  // POST /api/proofs/llm-verify
  const llmVerifySchema = z.object({
    prompt: z.string().min(1).max(1000),
    stellarAddress: z.string().startsWith('G').length(56).optional(),
  })

  router.post('/llm-verify', zValidator('json', llmVerifySchema), async (c) => {
    const { prompt } = c.req.valid('json')

    const proofHash = crypto
      .createHash('sha256')
      .update(`llm-proof:${prompt}:${Date.now()}`)
      .digest('hex')

    const timestamp = new Date().toISOString()

    await storage.storeProof({
      proofHash,
      skillId: 'llm-verify',
      provider: 'llm-api',
      metric: prompt.slice(0, 50),
      status: 'verified',
      timestamp,
    })

    return c.json({
      verified: true,
      proofHash,
      prompt: prompt.slice(0, 50) + (prompt.length > 50 ? '...' : ''),
      timestamp,
      method: 'zk-tls-simulated',
      note: 'Production: Reclaim zkFetch + Stellar Protocol 25 on-chain verification',
    })
  })

  // GET /api/proofs/list
  router.get('/list', async (c) => {
    const proofs = await storage.listProofs()
    return c.json({ proofs, total: proofs.length })
  })

  // GET /api/proofs/:skillId
  router.get('/:skillId', async (c) => {
    const skillId = c.req.param('skillId')
    const proofs = await storage.listProofsBySkill(skillId)
    return c.json({ skillId, proofs, status: proofs.length > 0 ? 'has_proofs' : 'pending' })
  })

  return router
}
