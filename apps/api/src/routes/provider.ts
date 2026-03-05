import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import type { StorageService } from '@dataeconomy/storage'

export function createProviderRouter(storage: StorageService) {
  const router = new Hono()
  const providerPolicySchema = z.object({
    minRewardPerUserUsdc: z.number().min(0).max(100),
    maxProgramDurationDays: z.number().int().min(1).max(365),
    maxProofAgeHours: z.number().int().min(1).max(168),
    minWitnessCount: z.number().int().min(1).max(10),
    requireHttpsBuyerCallback: z.boolean(),
    maxActivePrograms: z.number().int().min(1).max(100),
  })

  const registerSchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    supportedDataDescription: z.string().min(10),
    openclawUrl: z.string().url().optional(),
    channel: z.enum(['whatsapp', 'telegram', 'discord']),
    contactInfo: z.string().min(1),
    policy: providerPolicySchema.optional(),
  })

  // POST /api/provider/register
  router.post('/register', zValidator('json', registerSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET yapılandırılmamış' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    await storage.storeProvider({
      pseudoId,
      stellarAddress: body.stellarAddress,
      dataSources: [],
      supportedDataDescription: body.supportedDataDescription,
      openclawUrl: body.openclawUrl,
      channel: body.channel,
      contactInfo: body.contactInfo,
      policy: body.policy ?? {
        minRewardPerUserUsdc: 0.5,
        maxProgramDurationDays: 90,
        maxProofAgeHours: 24,
        minWitnessCount: 1,
        requireHttpsBuyerCallback: true,
        maxActivePrograms: 10,
      },
      registeredAt: new Date().toISOString(),
      status: 'active',
    })

    return c.json({
      status: 'registered',
      pseudoId,
      supportedDataDescription: body.supportedDataDescription,
      message: 'Veri saglayici olarak kaydoldunuz',
    }, 201)
  })

  // GET /api/provider/list
  router.get('/list', async (c) => {
    const providers = await storage.listProviders()
    const mapped = providers.map((p) => ({
      pseudoId: p.pseudoId,
      supportedDataDescription: p.supportedDataDescription,
      channel: p.channel,
      registeredAt: p.registeredAt,
    }))
    return c.json({ providers: mapped, total: mapped.length })
  })

  // GET /api/provider/me
  router.get('/me', async (c) => {
    const address = c.req.query('address')
    if (!address) return c.json({ error: 'address query param required' }, 400)

    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET yapılandırılmamış' }, 500)
    const pseudoId = generatePseudonym(secret, address).pseudonym
    const provider = await storage.getProvider(pseudoId)

    if (!provider) return c.json({ registered: false })
    return c.json({ registered: true, ...provider })
  })

  // POST /api/provider/bot-config
  const botConfigSchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    openclawUrl: z.string().url(),
    openclawToken: z.string().min(1),
  })

  router.post('/bot-config', zValidator('json', botConfigSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET yapılandırılmamış' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    await storage.storeBotConfig({
      pseudoId,
      openclawUrl: body.openclawUrl,
      openclawToken: body.openclawToken,
    })

    // Update provider if exists
    const provider = await storage.getProvider(pseudoId)
    if (provider) {
      await storage.storeProvider({ ...provider, openclawUrl: body.openclawUrl })
    }

    return c.json({ status: 'saved', pseudoId })
  })

  // POST /api/provider/policy
  const providerPolicyUpdateSchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    policy: providerPolicySchema,
  })

  router.post('/policy', zValidator('json', providerPolicyUpdateSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET yapılandırılmamış' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    const provider = await storage.getProvider(pseudoId)
    if (!provider) return c.json({ error: 'Provider bulunamadi' }, 404)

    await storage.storeProvider({
      ...provider,
      policy: body.policy,
    })

    return c.json({ status: 'saved', pseudoId, policy: body.policy })
  })

  return router
}
