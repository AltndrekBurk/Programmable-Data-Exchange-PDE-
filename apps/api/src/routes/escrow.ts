import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import type { EscrowAdapter } from '@dataeconomy/storage'

export function createEscrowRouter(escrow: EscrowAdapter) {
  const router = new Hono()

  // POST /api/escrow/lock
  const lockSchema = z.object({
    skillId: z.string().uuid(),
    title: z.string().min(1),
    stellarAddress: z.string().startsWith('G').length(56),
    amount: z.number().positive(),
  })

  router.post('/lock', zValidator('json', lockSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET yapılandırılmamış' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    const record = await escrow.lock({
      skillId: body.skillId,
      title: body.title,
      depositor: pseudoId,
      depositorAddress: body.stellarAddress,
      amount: body.amount,
    })

    return c.json({
      status: 'locked',
      escrowId: record.id,
      skillId: body.skillId,
      amount: body.amount,
      txHash: record.txHash,
      note: 'USDC escrow kilitlendi',
    }, 201)
  })

  // POST /api/escrow/release
  const releaseSchema = z.object({
    escrowId: z.string().uuid(),
    providerAddress: z.string().startsWith('G').length(56),
    proofHash: z.string().min(1),
  })

  router.post('/release', zValidator('json', releaseSchema), async (c) => {
    const body = c.req.valid('json')

    try {
      const record = await escrow.release({
        escrowId: body.escrowId,
        providerAddress: body.providerAddress,
        proofHash: body.proofHash,
      })

      return c.json({
        status: 'released',
        escrowId: body.escrowId,
        totalReleased: record.released,
        distribution: {
          provider: { address: body.providerAddress, amount: record.providerShare },
          platform: { amount: record.platformShare },
          disputePool: { amount: record.disputePool },
        },
        proofHash: body.proofHash,
        txHash: record.txHash,
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // POST /api/escrow/dispute
  const disputeSchema = z.object({
    escrowId: z.string().uuid(),
    reason: z.string().min(1).max(500),
  })

  router.post('/dispute', zValidator('json', disputeSchema), async (c) => {
    const body = c.req.valid('json')
    try {
      await escrow.dispute(body.escrowId, body.reason)
      return c.json({ status: 'disputed', escrowId: body.escrowId, reason: body.reason })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // POST /api/escrow/refund
  const refundSchema = z.object({
    escrowId: z.string().uuid(),
  })

  router.post('/refund', zValidator('json', refundSchema), async (c) => {
    const body = c.req.valid('json')
    try {
      const record = await escrow.refund(body.escrowId)
      return c.json({
        status: 'refunded',
        escrowId: body.escrowId,
        refundedAmount: record.totalBudget,
        to: record.depositorAddress,
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // GET /api/escrow/list
  router.get('/list', async (c) => {
    const address = c.req.query('address')
    let depositorPseudoId: string | undefined

    if (address) {
      const secret = process.env.PSEUDONYM_SECRET
      if (!secret) return c.json({ error: 'PSEUDONYM_SECRET yapılandırılmamış' }, 500)
      depositorPseudoId = generatePseudonym(secret, address).pseudonym
    }

    const records = await escrow.listEscrows(depositorPseudoId)

    const escrows = records.map((r) => ({
      id: r.id,
      skillId: r.skillId,
      title: r.title,
      totalBudget: r.totalBudget.toFixed(2),
      locked: r.locked.toFixed(2),
      released: r.released.toFixed(2),
      providerShare: r.providerShare.toFixed(2),
      platformShare: r.platformShare.toFixed(2),
      disputePool: r.disputePool.toFixed(2),
      status: r.status,
      createdAt: r.createdAt,
      txHash: r.txHash,
    }))

    return c.json({ escrows, total: escrows.length })
  })

  // GET /api/escrow/:id
  router.get('/:id', async (c) => {
    const id = c.req.param('id')
    const record = await escrow.getEscrow(id)
    if (!record) return c.json({ error: 'Escrow bulunamadi' }, 404)
    return c.json(record)
  })

  return router
}
