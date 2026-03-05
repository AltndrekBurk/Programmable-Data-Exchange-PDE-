import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { verifyDataProof } from '@dataeconomy/reclaim'
import crypto from 'node:crypto'
import type { StorageService, EscrowAdapter } from '@dataeconomy/storage'
import { buildRequirements, verifyPayment, settlePayment } from '../lib/x402.js'
import { notifyProofAccepted } from '../lib/openclaw.js'

export function createProofsRouter(storage: StorageService, escrow: EscrowAdapter) {
  const router = new Hono()
  const isProd = process.env.NODE_ENV === 'production'
  const deliveryTimeoutMs = Number(process.env.BUYER_CALLBACK_TIMEOUT_MS || 15000)

  const submitProofSchema = z.object({
    skillId: z.string().uuid(),
    userId: z.string(),          // provider's pseudoId
    providerAddress: z.string().startsWith('G').length(56).optional(),
    proof: z.object({
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
    }),
    delivery: z.object({
      encryptedPayload: z.string().min(1),
      contentType: z.string().optional(),
      checksum: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }).optional(),
  })

  // POST /api/proofs/submit
  // Requires X-PAYMENT header (X402 — 0.01 USDC spam prevention)
  router.post('/submit', zValidator('json', submitProofSchema), async (c) => {
    // -----------------------------------------------------------------------
    // X402 — verify payment header
    // -----------------------------------------------------------------------
    const paymentHeader = c.req.header('X-PAYMENT')
    const apiBaseUrl =
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:3001'
    const resourceUrl = `${apiBaseUrl}/api/proofs/submit`
    const requirements = buildRequirements(resourceUrl)

    if (!paymentHeader) {
      return c.json(requirements, 402)
    }

    const paymentResult = await verifyPayment(paymentHeader, requirements)
    if (!paymentResult.valid) {
      return c.json({
        error: 'Payment verification failed',
        detail: paymentResult.error,
        requirements,
      }, 402)
    }

    // -----------------------------------------------------------------------
    // ZK Proof verification
    // -----------------------------------------------------------------------
    const body = c.req.valid('json')
    const skill = await storage.getSkill(body.skillId)
    if (!skill) {
      return c.json({ error: 'Skill bulunamadi' }, 404)
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
      return c.json({ error: 'ZK proof verification failed' }, 400)
    }

    if (body.proof.witnesses.length < skillPolicy.minWitnessCount) {
      return c.json({
        error: `Proof witness count yetersiz (min ${skillPolicy.minWitnessCount})`,
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
      if (p.providerPseudoId !== body.userId) return false
      const prevTs = Date.parse(p.timestamp)
      return Number.isFinite(prevTs) && (Date.now() - prevTs) <= replayWindowMs
    })
    if (providerReplay) {
      return c.json({
        error: `Replay window active (${skillPolicy.replayProtectionWindowHours}h)`,
      }, 409)
    }

    // -----------------------------------------------------------------------
    // Buyer delivery over HTTPS callback (x402-verified path)
    // -----------------------------------------------------------------------
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
      return c.json({ error: 'Buyer callbackUrl bulunamadi' }, 409)
    }

    if (callbackUrl && !hasDeliveryPayload && isProd) {
      return c.json({ error: 'Delivery payload eksik' }, 400)
    }

    if (callbackUrl && hasDeliveryPayload) {
      const isHttpsCallback = callbackUrl.startsWith('https://')
      const isLocalHttpCallback =
        callbackUrl.startsWith('http://localhost') ||
        callbackUrl.startsWith('http://127.0.0.1')

      if (!isHttpsCallback && !(isLocalHttpCallback && !isProd)) {
        return c.json({ error: 'callbackUrl productionda HTTPS olmali' }, 400)
      }

      if (skillPolicy.requireHttpsCallback && !isHttpsCallback && !isLocalHttpCallback) {
        return c.json({ error: 'Skill policy HTTPS callback gerektiriyor' }, 400)
      }

      if (
        body.delivery?.contentType &&
        body.delivery.contentType !== skillPolicy.deliveryContentType
      ) {
        return c.json({
          error: `Delivery contentType mismatch (expected ${skillPolicy.deliveryContentType})`,
        }, 400)
      }

      const deliveryBody = {
        skillId: body.skillId,
        proofHash,
        providerPseudoId: body.userId,
        provider: body.proof.claimData.provider,
        metric: body.proof.claimData.parameters,
        timestamp: new Date().toISOString(),
        encryptedPayload: body.delivery!.encryptedPayload,
        contentType: body.delivery!.contentType || 'application/octet-stream',
        checksum: body.delivery!.checksum || null,
        metadata: body.delivery!.metadata || {},
      }

      try {
        const callbackResponse = await fetch(callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-DataEconomy-Proof-Hash': proofHash,
            'X-DataEconomy-Skill-Id': body.skillId,
            'X-DataEconomy-Delivery': 'x402-verified',
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
              error: 'Buyer HTTPS teslimati basarisiz',
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
          return c.json({ error: 'Buyer callback erisilemiyor' }, 503)
        }
      }
    }

    await storage.storeProof({
      proofHash,
      skillId: body.skillId,
      provider: body.proof.claimData.provider,
      metric: body.proof.claimData.parameters,
      providerPseudoId: body.userId,
      status: 'verified',
      timestamp: new Date().toISOString(),
    })

    // -----------------------------------------------------------------------
    // Escrow auto-release — find locked escrow for this skill and release
    // -----------------------------------------------------------------------
    let escrowResult: { escrowId: string; providerShare: number; txHash?: string } | null = null

    try {
      const allEscrows = await escrow.listEscrows()
      const targetEscrow = allEscrows.find(
        (e) => e.skillId === body.skillId && e.status === 'locked'
      )

      if (!targetEscrow) {
        if (isProd) {
          return c.json({ error: 'Locked escrow kaydi bulunamadi' }, 409)
        }
      } else {
        // Resolve provider Stellar address
        let providerAddress = body.providerAddress
        if (!providerAddress) {
          const provider = await storage.getProvider(body.userId)
          providerAddress = provider?.stellarAddress
        }

        if (!providerAddress) {
          if (isProd) {
            return c.json({ error: 'Provider Stellar adresi bulunamadi' }, 400)
          }
        } else {
          const released = await escrow.release({
            escrowId: targetEscrow.id,
            providerAddress,
            proofHash,
          })

          escrowResult = {
            escrowId: released.id,
            providerShare: released.providerShare,
            txHash: released.txHash,
          }

          // Notify provider via OpenClaw (fire-and-forget)
          notifyProofAccepted(storage, body.userId, body.skillId, proofHash, released.providerShare)
            .catch((err) => console.warn('[proofs] OpenClaw notify error:', err))
        }
      }
    } catch (err) {
      if (isProd) {
        return c.json({ error: 'Escrow release basarisiz' }, 502)
      }
      console.warn('[proofs] Escrow auto-release failed (non-critical):', err)
    }

    // -----------------------------------------------------------------------
    // X402 settle — move funds to platform
    // -----------------------------------------------------------------------
    await settlePayment(paymentHeader, requirements)

    return c.json({
      status: 'accepted',
      proofHash,
      skillId: body.skillId,
      userId: body.userId,
      timestamp: new Date().toISOString(),
      escrow: escrowResult,
      delivery: deliveryResult,
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
