import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import type { StorageService } from '@dataeconomy/storage'
import { dispatchSkillToProviders } from '../lib/openclaw.js'

export function createSkillsRouter(storage: StorageService) {
  const router = new Hono()
  const isProd = process.env.NODE_ENV === 'production'

  const skillPolicySchema = z.object({
    maxProofAgeHours: z.number().int().min(1).max(168).optional(),
    minWitnessCount: z.number().int().min(1).max(10).optional(),
    replayProtectionWindowHours: z.number().int().min(1).max(168).optional(),
    requireHttpsCallback: z.boolean().optional(),
    deliveryContentType: z.enum([
      'application/json',
      'application/cbor',
      'application/octet-stream',
    ]).optional(),
  }).optional()

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
    mcpId: z.string().uuid().optional(),
    policy: skillPolicySchema,
  })

  // POST /api/skills
  router.post('/', zValidator('json', createSkillSchema), async (c) => {
    const body = c.req.valid('json')
    const skillId = uuidv4()
    const escrowAddress = process.env.PLATFORM_ESCROW_ADDRESS

    if (isProd && !body.callbackUrl) {
      return c.json({ error: 'Productionda callbackUrl zorunludur' }, 400)
    }
    if (isProd && body.callbackUrl && !body.callbackUrl.startsWith('https://')) {
      return c.json({ error: 'Productionda callbackUrl HTTPS olmalidir' }, 400)
    }

    if (isProd && !escrowAddress) {
      return c.json({ error: 'PLATFORM_ESCROW_ADDRESS yapılandırılmamış' }, 500)
    }

    const skill = {
      id: skillId,
      title: body.title,
      description: body.description,
      dataSource: body.dataSource,
      metrics: body.metrics,
      durationDays: body.durationDays,
      rewardPerUser: body.rewardPerUser,
      totalBudget: body.totalBudget,
      targetCount: body.targetCount,
      callbackUrl: body.callbackUrl,
      mcpId: body.mcpId,
      policy: {
        maxProofAgeHours: body.policy?.maxProofAgeHours ?? 24,
        minWitnessCount: body.policy?.minWitnessCount ?? 1,
        replayProtectionWindowHours: body.policy?.replayProtectionWindowHours ?? 24,
        requireHttpsCallback: body.policy?.requireHttpsCallback ?? true,
        deliveryContentType: body.policy?.deliveryContentType ?? 'application/octet-stream',
      },
      expiresAt: new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      ipfsHash: '',
      status: 'active' as const,
    }

    const result = await storage.storeSkill(skill)
    skill.ipfsHash = result.ipfsHash

    // Dispatch task to matching providers via OpenClaw (fire-and-forget)
    dispatchSkillToProviders(storage, skillId, body.dataSource, body.rewardPerUser, body.title, result.ipfsHash, body.mcpId)
      .then(({ notified, skipped }) => {
        if (notified > 0 || skipped > 0) {
          console.log(`[skills] Dispatched ${skillId.slice(0,8)} — notified:${notified} skipped:${skipped}`)
        }
      })
      .catch((err) => console.warn('[skills] Dispatch error:', err))

    return c.json({
      skillId,
      ipfsHash: result.ipfsHash,
      stellarTx: result.stellarTx || null,
      escrowAddress: escrowAddress || 'DEPLOY_ESCROW_FIRST',
      status: 'created',
    }, 201)
  })

  // GET /api/skills
  router.get('/', async (c) => {
    const skills = await storage.listSkills()
    return c.json({ skills, total: skills.length })
  })

  // GET /api/skills/:id
  router.get('/:id', async (c) => {
    const id = c.req.param('id')
    const skill = await storage.getSkill(id)
    if (!skill) return c.json({ error: 'Skill bulunamadi' }, 404)
    return c.json(skill)
  })

  return router
}
