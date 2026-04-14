import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { verifyDataProof } from '@pde/reclaim'
import crypto from 'node:crypto'
import type { StorageService, EscrowAdapter } from '@pde/storage'
import { createX402Middleware, settlePayment } from '../lib/x402.js'
import { notifyProofAccepted } from '../lib/openclaw.js'

const proofSchema = z.object({
  identifier: z.string(),
  claimData: z.object({
    provider: z.string(),
    parameters: z.string(),
    owner: z.string(),
    timestampS: z.number(),
    context: z.string(),
    identifier: z.string(),
    epoch: z.number(),
  }),
  signatures: z.array(z.string()),
  witnesses: z.array(z.object({ id: z.string(), url: z.string() })),
})

export function createProofsRouter(storage: StorageService, escrow: EscrowAdapter) {
  const router = new Hono()
  const isProd = process.env.NODE_ENV === 'production'
  const deliveryTimeoutMs = Number(process.env.BUYER_CALLBACK_TIMEOUT_MS || 15000)

  const submitProofSchema = z.object({
    skillId: z.string().uuid(),
    userId: z.string(), // provider's stellarAddress
    providerAddress: z.string().startsWith('G').length(56).optional(),
    proof: proofSchema,
    delivery: z.object({
      encryptedPayload: z.string().min(1),
      contentType: z.string().optional(),
      checksum: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }).optional(),
    batch: z.object({
      escrowId: z.string().uuid(),
      batchIndex: z.number().int().min(0),
      totalBatches: z.number().int().positive(),
      sellerAddress: z.string().startsWith('G').length(56),
      batchHash: z.string().min(16),
      sellerSignature: z.string().optional(),
      rowCount: z.number().int().positive(),
    }).optional(),
  })

  const batchPaymentSchema = z.object({
    escrowId: z.string().uuid(),
    batchIndex: z.number().int().min(0),
    buyerAddress: z.string().startsWith('G').length(56),
    sellerAddress: z.string().startsWith('G').length(56),
    amount: z.number().positive(),
    txHash: z.string().min(16),
    memo: z.string().min(3).max(128).optional(),
  })

  // POST /api/proofs/submit
  // Requires X-PAYMENT header (X402 — 0.01 USDC spam prevention)
  router.post(
    '/submit',
    createX402Middleware((c) => {
      const apiBaseUrl =
        process.env.API_BASE_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:3001'
      return `${apiBaseUrl}/api/proofs/submit`
    }),
    zValidator('json', submitProofSchema),
    async (c) => {
      const paymentHeader = c.get('x402PaymentHeader' as never) as string
      const requirements = c.get('x402Requirements' as never) as Parameters<typeof settlePayment>[1]

      const body = c.req.valid('json')
      const skill = await storage.getSkill(body.skillId)
      if (!skill) {
        return c.json({ error: 'Skill not found' }, 404)
      }

      if (body.batch && body.batch.batchIndex >= body.batch.totalBatches) {
        return c.json({ error: 'Invalid batch index: batchIndex must be < totalBatches' }, 400)
      }

      const skillPolicy = skill.policy || {
        maxProofAgeHours: 24,
        minWitnessCount: 1,
        replayProtectionWindowHours: 24,
        requireHttpsCallback: true,
        deliveryContentType: 'application/octet-stream',
      }

      const isValid = await verifyDataProof(body.proof)
      if (!isValid) {
        const witnessKeys = body.proof.witnesses.map((w) => w.id.slice(0, 16) + '...')
        return c.json({
          error: 'ZK proof verification failed',
          detail: 'ed25519 witness signature validation failed. Check ATTESTOR_PUBLIC_KEYS.',
          witnesses: witnessKeys,
        }, 400)
      }

      if (body.proof.witnesses.length < skillPolicy.minWitnessCount) {
        return c.json({
          error: `Insufficient witness count (min ${skillPolicy.minWitnessCount})`,
        }, 400)
      }

      const proofTimestamp = body.proof.claimData.timestampS * 1000
      if (proofTimestamp < Date.now() - skillPolicy.maxProofAgeHours * 60 * 60 * 1000) {
        return c.json({
          error: `Proof too old (>${skillPolicy.maxProofAgeHours} hours)`,
        }, 400)
      }

      const proofHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(body.proof))
        .digest('hex')

      const existingProofs = await storage.listProofsBySkill(body.skillId)
      if (existingProofs.some((p) => p.proofHash === proofHash)) {
        return c.json({ error: 'Replay detected: same proof already submitted' }, 409)
      }

      const replayWindowMs = skillPolicy.replayProtectionWindowHours * 60 * 60 * 1000
      const providerReplay = existingProofs.find((p) => {
        if (p.providerAddress !== body.userId) return false
        const prevTs = Date.parse(p.timestamp)
        return Number.isFinite(prevTs) && (Date.now() - prevTs) <= replayWindowMs
      })
      if (providerReplay) {
        return c.json({
          error: `Replay window active (${skillPolicy.replayProtectionWindowHours}h)`,
        }, 409)
      }

      // Buyer delivery over HTTPS callback (x402-verified path)
      let deliveryResult: {
        attempted: boolean
        delivered: boolean
        endpoint?: string
        status?: number
        error?: string
      } | null = null

      const callbackUrl = skill.callbackUrl
      const hasDeliveryPayload = !!body.delivery?.encryptedPayload

      if (isProd && !callbackUrl) {
        return c.json({ error: 'Buyer callbackUrl not found' }, 409)
      }

      if (isProd && !skill.deliveryPublicKey) {
        return c.json({ error: 'deliveryPublicKey required (buyer decrypt key)' }, 400)
      }

      if (callbackUrl && !hasDeliveryPayload && isProd) {
        return c.json({ error: 'Delivery payload missing' }, 400)
      }

      if (callbackUrl && hasDeliveryPayload) {
        const isHttpsCallback = callbackUrl.startsWith('https://')
        const isLocalHttpCallback =
          callbackUrl.startsWith('http://localhost') ||
          callbackUrl.startsWith('http://127.0.0.1')

        if (!isHttpsCallback && !(isLocalHttpCallback && !isProd)) {
          return c.json({ error: 'callbackUrl must be HTTPS in production' }, 400)
        }

        if (skillPolicy.requireHttpsCallback && !isHttpsCallback && !isLocalHttpCallback) {
          return c.json({ error: 'Skill policy requires HTTPS callback' }, 400)
        }

        if (
          body.delivery?.contentType &&
          body.delivery.contentType !== skillPolicy.deliveryContentType
        ) {
          return c.json({
            error: `Delivery contentType mismatch (expected ${skillPolicy.deliveryContentType})`,
          }, 400)
        }

        if (body.delivery?.checksum) {
          const expectedChecksum = crypto
            .createHash('sha256')
            .update(body.delivery.encryptedPayload)
            .digest('hex')
          if (expectedChecksum !== body.delivery.checksum) {
            return c.json({ error: 'Encrypted payload checksum mismatch' }, 400)
          }
        }

        const deliveryBody = {
          skillId: body.skillId,
          proofHash,
          providerAddress: body.userId,
          provider: body.proof.claimData.provider,
          metric: body.proof.claimData.parameters,
          timestamp: new Date().toISOString(),
          encryptedPayload: body.delivery!.encryptedPayload,
          contentType: body.delivery!.contentType || 'application/octet-stream',
          checksum: body.delivery!.checksum || null,
          metadata: {
            ...(body.delivery!.metadata || {}),
            ...(body.batch ? {
              escrowId: body.batch.escrowId,
              batchIndex: String(body.batch.batchIndex),
              totalBatches: String(body.batch.totalBatches),
              rowCount: String(body.batch.rowCount),
              batchHash: body.batch.batchHash,
            } : {}),
          },
        }

        try {
          const callbackResponse = await fetch(callbackUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-PDE-Proof-Hash': proofHash,
              'X-PDE-Skill-Id': body.skillId,
              'X-PDE-Delivery': body.batch ? 'x402-row-by-row' : 'x402-verified',
              'X-PDE-Delivery-Key': skill.deliveryPublicKey || 'unset',
            },
            body: JSON.stringify(deliveryBody),
            signal: AbortSignal.timeout(deliveryTimeoutMs),
          })

          deliveryResult = {
            attempted: true,
            delivered: callbackResponse.ok,
            endpoint: callbackUrl,
            status: callbackResponse.status,
          }

          if (!callbackResponse.ok) {
            const callbackError = await callbackResponse.text().catch(() => '')
            deliveryResult.error = callbackError.slice(0, 300) || 'Buyer callback rejected'
            if (isProd) {
              return c.json({
                error: 'Buyer HTTPS delivery failed',
                status: callbackResponse.status,
                detail: deliveryResult.error,
              }, 502)
            }
          }
        } catch (err) {
          deliveryResult = {
            attempted: true,
            delivered: false,
            endpoint: callbackUrl,
            error: String(err),
          }

          if (isProd) {
            return c.json({ error: 'Buyer callback unreachable' }, 503)
          }
        }
      }

      await storage.storeProof({
        proofHash,
        skillId: body.skillId,
        provider: body.proof.claimData.provider,
        metric: body.proof.claimData.parameters,
        providerAddress: body.userId,
        status: 'verified',
        timestamp: new Date().toISOString(),
      })

      // Row-by-row batch indexing (agent-to-agent)
      let targetEscrowId: string | null = null
      if (body.batch) {
        const escrowRecord = await storage.getEscrow(body.batch.escrowId)
        if (!escrowRecord) {
          return c.json({ error: 'Escrow not found for batch delivery' }, 404)
        }
        if (escrowRecord.skillId !== body.skillId) {
          return c.json({ error: 'Escrow skill mismatch' }, 409)
        }
        if (escrowRecord.status !== 'locked') {
          return c.json({ error: `Escrow is not lock-ready (status: ${escrowRecord.status})` }, 409)
        }

        const existingBatchStates = await storage.listBatchStatesByEscrow(body.batch.escrowId)
        if (existingBatchStates.some((b) => b.batchIndex === body.batch!.batchIndex)) {
          return c.json({ error: 'Duplicate batch submission detected' }, 409)
        }

        await storage.storeBatchState({
          escrowId: body.batch.escrowId,
          skillId: body.skillId,
          batchIndex: body.batch.batchIndex,
          totalBatches: body.batch.totalBatches,
          sellerAddress: body.batch.sellerAddress,
          rowCount: body.batch.rowCount,
          proofHash,
          batchHash: body.batch.batchHash,
          sellerSignature: body.batch.sellerSignature,
          createdAt: new Date().toISOString(),
          status: 'delivered',
        })
        targetEscrowId = body.batch.escrowId
      }

      // Escrow auto-release
      let escrowResult: { escrowId: string; providerShare: number; txHash?: string } | null = null

      try {
        const allEscrows = await escrow.listEscrows()
        const targetEscrow = body.batch
          ? allEscrows.find((e) => e.id === targetEscrowId)
          : allEscrows.find((e) => e.skillId === body.skillId && e.status === 'locked')

        if (!targetEscrow) {
          if (isProd) {
            return c.json({ error: 'No locked escrow record found' }, 409)
          }
        } else {
          if (body.batch) {
            const [delivered, paid] = await Promise.all([
              storage.listBatchStatesByEscrow(targetEscrow.id),
              storage.listBatchPaymentsByEscrow(targetEscrow.id),
            ])

            const deliveredSet = new Set(delivered.map((b) => b.batchIndex))
            const paidSet = new Set(paid.filter((p) => p.status === 'confirmed').map((p) => p.batchIndex))
            const allBatchesDelivered = deliveredSet.size >= body.batch.totalBatches
            const allBatchesPaid = paidSet.size >= body.batch.totalBatches
            const isFinalBatch = body.batch.batchIndex === body.batch.totalBatches - 1

            if (!(allBatchesDelivered && allBatchesPaid && isFinalBatch)) {
              await settlePayment(paymentHeader, requirements)
              return c.json({
                status: 'accepted',
                proofHash,
                skillId: body.skillId,
                userId: body.userId,
                timestamp: new Date().toISOString(),
                escrow: null,
                delivery: deliveryResult,
                batch: {
                  escrowId: targetEscrow.id,
                  batchIndex: body.batch.batchIndex,
                  totalBatches: body.batch.totalBatches,
                  deliveredBatches: deliveredSet.size,
                  paidBatches: paidSet.size,
                  finalBatchReceived: isFinalBatch,
                  readyForFinalRelease: false,
                },
              })
            }
          }

          let providerAddress = body.providerAddress
          if (!providerAddress) {
            const provider = await storage.getProvider(body.userId)
            providerAddress = provider?.stellarAddress
          }

          if (!providerAddress) {
            if (isProd) {
              return c.json({ error: 'Provider Stellar address not found' }, 400)
            }
          } else {
            const skillWithMcp = await storage.getSkill(body.skillId)
            const mcp = skillWithMcp?.mcpId ? await storage.getMcp(skillWithMcp.mcpId) : null
            const hasMcpFee = !!mcp?.creatorAddress && (mcp?.usageFee ?? 0) > 0
            const mcpFeeBps = hasMcpFee
              ? Math.min(2000, Math.max(0, Math.round(((mcp!.usageFee! / targetEscrow.totalBudget) * 10_000))))
              : 0

            const released = await escrow.release({
              escrowId: targetEscrow.id,
              providerAddress,
              proofHash,
              mcpCreatorAddress: hasMcpFee ? mcp!.creatorAddress : undefined,
              mcpFeeBps: hasMcpFee ? mcpFeeBps : undefined,
            })

            escrowResult = {
              escrowId: released.id,
              providerShare: released.providerShare,
              txHash: released.txHash,
            }

            notifyProofAccepted(storage, body.userId, body.skillId, proofHash, released.providerShare)
              .catch((err) => console.warn('[proofs] OpenClaw notify error:', err))
          }
        }
      } catch (err) {
        if (isProd) {
          return c.json({ error: 'Escrow release failed' }, 502)
        }
        console.warn('[proofs] Escrow auto-release failed (non-critical):', err)
      }

      await settlePayment(paymentHeader, requirements)

      return c.json({
        status: 'accepted',
        proofHash,
        skillId: body.skillId,
        userId: body.userId,
        timestamp: new Date().toISOString(),
        escrow: escrowResult,
        delivery: deliveryResult,
        batch: body.batch
          ? {
              escrowId: body.batch.escrowId,
              batchIndex: body.batch.batchIndex,
              totalBatches: body.batch.totalBatches,
              readyForFinalRelease: !!escrowResult,
            }
          : null,
      })
    }
  )

  // POST /api/proofs/batch/pay
  // Buyer confirms row-by-row micro-payment for a delivered batch.
  router.post(
    '/batch/pay',
    createX402Middleware((c) => {
      const apiBaseUrl =
        process.env.API_BASE_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        'http://localhost:3001'
      return `${apiBaseUrl}/api/proofs/batch/pay`
    }),
    zValidator('json', batchPaymentSchema),
    async (c) => {
      const paymentHeader = c.get('x402PaymentHeader' as never) as string
      const requirements = c.get('x402Requirements' as never) as Parameters<typeof settlePayment>[1]
      const body = c.req.valid('json')

      const escrowRecord = await storage.getEscrow(body.escrowId)
      if (!escrowRecord) {
        return c.json({ error: 'Escrow not found' }, 404)
      }
      if (body.batchIndex < 0) {
        return c.json({ error: 'Invalid batchIndex' }, 400)
      }
      const batchStates = await storage.listBatchStatesByEscrow(body.escrowId)
      const matchedBatch = batchStates.find((b) => b.batchIndex === body.batchIndex)
      if (!matchedBatch) {
        return c.json({ error: 'Batch state not found for payment index' }, 404)
      }
      if (matchedBatch.sellerAddress !== body.sellerAddress) {
        return c.json({ error: 'Seller mismatch for batch payment' }, 409)
      }

      const existingPayments = await storage.listBatchPaymentsByEscrow(body.escrowId)
      if (existingPayments.some((p) => p.batchIndex === body.batchIndex && p.status === 'confirmed')) {
        return c.json({ error: 'Batch payment already confirmed' }, 409)
      }

      await storage.storeBatchPayment({
        escrowId: body.escrowId,
        batchIndex: body.batchIndex,
        buyerAddress: body.buyerAddress,
        sellerAddress: body.sellerAddress,
        amount: body.amount,
        txHash: body.txHash,
        memo: body.memo || `x402:${body.escrowId.slice(0, 8)}:${body.batchIndex}`,
        createdAt: new Date().toISOString(),
        status: 'confirmed',
      })

      await settlePayment(paymentHeader, requirements)

      const paid = await storage.listBatchPaymentsByEscrow(body.escrowId)

      return c.json({
        status: 'recorded',
        escrowId: body.escrowId,
        batchIndex: body.batchIndex,
        paymentCount: paid.length,
      })
    }
  )

  // GET /api/proofs/batches/:escrowId
  router.get('/batches/:escrowId', async (c) => {
    const escrowId = c.req.param('escrowId')
    const [batchStates, payments] = await Promise.all([
      storage.listBatchStatesByEscrow(escrowId),
      storage.listBatchPaymentsByEscrow(escrowId),
    ])
    return c.json({
      escrowId,
      batches: batchStates,
      payments,
      status: batchStates.length > 0 ? 'has_batches' : 'pending',
    })
  })

  // GET /api/proofs/list
  router.get('/list', async (_c) => {
    const proofs = await storage.listProofs()
    return _c.json({ proofs, total: proofs.length })
  })

  // GET /api/proofs/:skillId
  router.get('/:skillId', async (c) => {
    const skillId = c.req.param('skillId')
    const proofs = await storage.listProofsBySkill(skillId)
    return c.json({ skillId, proofs, status: proofs.length > 0 ? 'has_proofs' : 'pending' })
  })

  return router
}
