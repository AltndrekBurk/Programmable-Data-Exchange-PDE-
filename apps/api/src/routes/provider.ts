import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@dataeconomy/pseudonym'

export const providerRouter = new Hono()

// In-memory store (TODO: replace with database)
interface Provider {
  pseudoId: string
  stellarAddress: string
  dataSources: string[]
  openclawUrl?: string
  channel: 'whatsapp' | 'telegram' | 'discord'
  contactInfo: string
  registeredAt: string
  status: 'active' | 'inactive'
}

const providerStore = new Map<string, Provider>()

// POST /api/provider/register
const registerSchema = z.object({
  stellarAddress: z.string().startsWith('G').length(56),
  dataSources: z.array(z.string()).min(1),
  openclawUrl: z.string().url().optional(),
  channel: z.enum(['whatsapp', 'telegram', 'discord']),
  contactInfo: z.string().min(1),
})

providerRouter.post('/register', zValidator('json', registerSchema), async (c) => {
  const body = c.req.valid('json')

  const secret = process.env.PSEUDONYM_SECRET || 'dev-secret-change-in-production'
  const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

  const provider: Provider = {
    pseudoId,
    stellarAddress: body.stellarAddress,
    dataSources: body.dataSources,
    openclawUrl: body.openclawUrl,
    channel: body.channel,
    contactInfo: body.contactInfo,
    registeredAt: new Date().toISOString(),
    status: 'active',
  }

  providerStore.set(pseudoId, provider)

  return c.json({
    status: 'registered',
    pseudoId,
    dataSources: body.dataSources,
    message: 'Veri saglayici olarak kaydoldunuz',
  }, 201)
})

// GET /api/provider/list — List providers for a data source
providerRouter.get('/list', async (c) => {
  const dataSource = c.req.query('dataSource')
  const providers = Array.from(providerStore.values())
    .filter((p) => p.status === 'active')
    .filter((p) => !dataSource || p.dataSources.includes(dataSource))
    .map((p) => ({
      pseudoId: p.pseudoId,
      dataSources: p.dataSources,
      channel: p.channel,
      registeredAt: p.registeredAt,
    }))

  return c.json({ providers, total: providers.length })
})

// GET /api/provider/me — Get own provider profile
providerRouter.get('/me', async (c) => {
  const address = c.req.query('address')
  if (!address) return c.json({ error: 'address query param required' }, 400)

  const secret = process.env.PSEUDONYM_SECRET || 'dev-secret-change-in-production'
  const pseudoId = generatePseudonym(secret, address).pseudonym
  const provider = providerStore.get(pseudoId)

  if (!provider) {
    return c.json({ registered: false })
  }

  return c.json({ registered: true, ...provider })
})
