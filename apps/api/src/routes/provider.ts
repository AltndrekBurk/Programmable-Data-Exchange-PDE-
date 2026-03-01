import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import type { StorageService } from '@dataeconomy/storage'

export function createProviderRouter(storage: StorageService) {
  const router = new Hono()

  const registerSchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    dataSources: z.array(z.string()).min(1),
    openclawUrl: z.string().url().optional(),
    channel: z.enum(['whatsapp', 'telegram', 'discord']),
    contactInfo: z.string().min(1),
  })

  // POST /api/provider/register
  router.post('/register', zValidator('json', registerSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET || 'dev-secret-change-in-production'
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    await storage.storeProvider({
      pseudoId,
      stellarAddress: body.stellarAddress,
      dataSources: body.dataSources,
      openclawUrl: body.openclawUrl,
      channel: body.channel,
      contactInfo: body.contactInfo,
      registeredAt: new Date().toISOString(),
      status: 'active',
    })

    return c.json({
      status: 'registered',
      pseudoId,
      dataSources: body.dataSources,
      message: 'Veri saglayici olarak kaydoldunuz',
    }, 201)
  })

  // GET /api/provider/list
  router.get('/list', async (c) => {
    const dataSource = c.req.query('dataSource')
    const providers = await storage.listProviders(dataSource || undefined)
    const mapped = providers.map((p) => ({
      pseudoId: p.pseudoId,
      dataSources: p.dataSources,
      channel: p.channel,
      registeredAt: p.registeredAt,
    }))
    return c.json({ providers: mapped, total: mapped.length })
  })

  // GET /api/provider/me
  router.get('/me', async (c) => {
    const address = c.req.query('address')
    if (!address) return c.json({ error: 'address query param required' }, 400)

    const secret = process.env.PSEUDONYM_SECRET || 'dev-secret-change-in-production'
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
    const secret = process.env.PSEUDONYM_SECRET || 'dev-secret-change-in-production'
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

  return router
}
