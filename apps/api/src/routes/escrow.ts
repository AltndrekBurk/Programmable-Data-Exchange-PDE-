import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import crypto from 'node:crypto'

export const escrowRouter = new Hono()

// In-memory escrow store (TODO: replace with Soroban contract state queries)
interface EscrowRecord {
  id: string
  skillId: string
  title: string
  depositor: string // pseudoId
  depositorAddress: string // Stellar G... address
  totalBudget: number // USDC
  locked: number
  released: number
  providerShare: number // released * 0.70
  platformShare: number // released * 0.20
  disputePool: number // released * 0.10
  status: 'locked' | 'releasing' | 'released' | 'disputed' | 'refunded'
  createdAt: string
  updatedAt: string
  txHash?: string
}

const escrowStore = new Map<string, EscrowRecord>()

// POST /api/escrow/lock — Lock USDC for a skill
const lockSchema = z.object({
  skillId: z.string().uuid(),
  title: z.string().min(1),
  stellarAddress: z.string().startsWith('G').length(56),
  amount: z.number().positive(),
})

escrowRouter.post('/lock', zValidator('json', lockSchema), async (c) => {
  const body = c.req.valid('json')

  const secret = process.env.PSEUDONYM_SECRET || 'dev-secret'
  const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  // TODO: In production, this calls Soroban escrow contract deposit()
  // escrow.deposit(skillId, depositor, amount) → locks USDC on-chain
  const record: EscrowRecord = {
    id,
    skillId: body.skillId,
    title: body.title,
    depositor: pseudoId,
    depositorAddress: body.stellarAddress,
    totalBudget: body.amount,
    locked: body.amount,
    released: 0,
    providerShare: 0,
    platformShare: 0,
    disputePool: 0,
    status: 'locked',
    createdAt: now,
    updatedAt: now,
    txHash: `MOCK_TX_${crypto.randomBytes(16).toString('hex')}`,
  }

  escrowStore.set(id, record)

  return c.json({
    status: 'locked',
    escrowId: id,
    skillId: body.skillId,
    amount: body.amount,
    txHash: record.txHash,
    note: 'USDC Soroban escrow kontratina kilitlendi (simule)',
  }, 201)
})

// POST /api/escrow/release — Release escrow after proof verification
const releaseSchema = z.object({
  escrowId: z.string().uuid(),
  providerAddress: z.string().startsWith('G').length(56),
  proofHash: z.string().min(1),
})

escrowRouter.post('/release', zValidator('json', releaseSchema), async (c) => {
  const body = c.req.valid('json')

  const record = escrowStore.get(body.escrowId)
  if (!record) {
    return c.json({ error: 'Escrow kaydı bulunamadı' }, 404)
  }

  if (record.status !== 'locked') {
    return c.json({ error: `Escrow zaten ${record.status} durumunda` }, 400)
  }

  // 3-way atomik release: %70 sağlayıcı / %20 platform / %10 dispute
  const releaseAmount = record.locked
  const providerShare = releaseAmount * 0.70
  const platformShare = releaseAmount * 0.20
  const disputePool = releaseAmount * 0.10

  // TODO: In production, calls Soroban escrow contract release()
  // Single TX with 3 transfers (atomic)
  record.released = releaseAmount
  record.locked = 0
  record.providerShare = providerShare
  record.platformShare = platformShare
  record.disputePool = disputePool
  record.status = 'released'
  record.updatedAt = new Date().toISOString()
  record.txHash = `RELEASE_TX_${crypto.randomBytes(16).toString('hex')}`

  escrowStore.set(body.escrowId, record)

  return c.json({
    status: 'released',
    escrowId: body.escrowId,
    totalReleased: releaseAmount,
    distribution: {
      provider: { address: body.providerAddress, amount: providerShare },
      platform: { amount: platformShare },
      disputePool: { amount: disputePool },
    },
    proofHash: body.proofHash,
    txHash: record.txHash,
    note: 'Atomik 3-way release tamamlandı (simule)',
  })
})

// POST /api/escrow/dispute — Flag escrow as disputed
const disputeSchema = z.object({
  escrowId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

escrowRouter.post('/dispute', zValidator('json', disputeSchema), async (c) => {
  const body = c.req.valid('json')

  const record = escrowStore.get(body.escrowId)
  if (!record) {
    return c.json({ error: 'Escrow kaydı bulunamadı' }, 404)
  }

  if (record.status !== 'locked') {
    return c.json({ error: 'Sadece kilitli escrow itiraz edilebilir' }, 400)
  }

  record.status = 'disputed'
  record.updatedAt = new Date().toISOString()
  escrowStore.set(body.escrowId, record)

  return c.json({
    status: 'disputed',
    escrowId: body.escrowId,
    reason: body.reason,
    note: 'Escrow itiraz durumuna alındı. Manuel inceleme gerekiyor.',
  })
})

// POST /api/escrow/refund — Refund escrow back to depositor
const refundSchema = z.object({
  escrowId: z.string().uuid(),
})

escrowRouter.post('/refund', zValidator('json', refundSchema), async (c) => {
  const body = c.req.valid('json')

  const record = escrowStore.get(body.escrowId)
  if (!record) {
    return c.json({ error: 'Escrow kaydı bulunamadı' }, 404)
  }

  if (record.status !== 'locked' && record.status !== 'disputed') {
    return c.json({ error: 'Sadece kilitli veya ihtilaflı escrow iade edilebilir' }, 400)
  }

  // TODO: In production, calls Soroban escrow contract refund()
  record.status = 'refunded'
  record.released = 0
  record.locked = 0
  record.updatedAt = new Date().toISOString()
  escrowStore.set(body.escrowId, record)

  return c.json({
    status: 'refunded',
    escrowId: body.escrowId,
    refundedAmount: record.totalBudget,
    to: record.depositorAddress,
    note: 'USDC yatırana iade edildi (simule)',
  })
})

// GET /api/escrow/list — List all escrows (optionally filter by address)
escrowRouter.get('/list', async (c) => {
  const address = c.req.query('address')

  let records = Array.from(escrowStore.values())

  if (address) {
    const secret = process.env.PSEUDONYM_SECRET || 'dev-secret'
    const pseudoId = generatePseudonym(secret, address).pseudonym
    records = records.filter((r) => r.depositor === pseudoId)
  }

  // Map to frontend-friendly format
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

// GET /api/escrow/:id — Get single escrow detail
escrowRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const record = escrowStore.get(id)

  if (!record) {
    return c.json({ error: 'Escrow bulunamadı' }, 404)
  }

  return c.json(record)
})
