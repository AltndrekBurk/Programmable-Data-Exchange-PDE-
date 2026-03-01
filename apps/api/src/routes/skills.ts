import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { uploadSkillJson } from '@dataeconomy/ipfs'

export const skillsRouter = new Hono()

// In-memory skill store (production'da PostgreSQL/Redis olacak)
const skillStore = new Map<string, any>()

const createSkillSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500),
  dataSource: z.string(),
  metrics: z.array(z.string()),
  durationDays: z.number().int().min(1).max(365),
  rewardPerUser: z.number().positive(),
  totalBudget: z.number().positive(),
  targetCount: z.number().int().positive(),
  callbackUrl: z.string().url().optional(),
})

// POST /api/skills
skillsRouter.post('/', zValidator('json', createSkillSchema), async (c) => {
  const body = c.req.valid('json')
  const skillId = uuidv4()

  const publicSkill = {
    id: skillId,
    title: body.title,
    description: body.description,
    dataSource: body.dataSource,
    metrics: body.metrics,
    durationDays: body.durationDays,
    rewardPerUser: body.rewardPerUser,
    targetCount: body.targetCount,
    expiresAt: new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  }

  let ipfsHash: string = `QmMock${skillId.slice(0, 8)}`
  let ipfsWarning: string | null = null
  try {
    if (process.env.PINATA_JWT) {
      ipfsHash = await uploadSkillJson({
        id: skillId,
        title: body.title,
        description: body.description,
        dataSource: body.dataSource,
        metrics: body.metrics,
        reward: String(Math.round(body.rewardPerUser * 10_000_000)),
        totalBudget: String(Math.round(body.totalBudget * 10_000_000)),
        expiresAt: publicSkill.expiresAt,
        callbackUrl: body.callbackUrl || '',
      })
    }
  } catch (err) {
    console.error('[skills] IPFS upload failed:', err)
    ipfsWarning = 'IPFS upload başarısız, mock hash kullanılıyor'
  }

  const skill = { ...publicSkill, ipfsHash, status: 'active' }
  skillStore.set(skillId, skill)

  return c.json({
    skillId,
    publicSkill,
    ipfsHash,
    ipfsWarning,
    escrowAddress: process.env.PLATFORM_ESCROW_ADDRESS || 'DEPLOY_ESCROW_FIRST',
    status: 'created',
    note: 'Escrow: USDC_SAC üzerinden platform escrow adresine USDC yatırın',
  }, 201)
})

// GET /api/skills
skillsRouter.get('/', async (c) => {
  const skills = Array.from(skillStore.values())
  return c.json({ skills, total: skills.length })
})

// GET /api/skills/:id
skillsRouter.get('/:id', async (c) => {
  const id = c.req.param('id')
  const skill = skillStore.get(id)
  if (!skill) return c.json({ error: 'Skill bulunamadı' }, 404)
  return c.json(skill)
})
