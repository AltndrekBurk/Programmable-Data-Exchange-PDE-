import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@pde/pseudonym'
import type { StorageService } from '@pde/storage'
import { uploadJson } from '@pde/ipfs'

export function createProviderRouter(storage: StorageService) {
  const router = new Hono()

  const providerPolicySchema = z.object({
    verificationMethod: z.enum(['api-zktls', 'device-tee', 'fhe-range', 'zk-selective']).default('api-zktls'),
    dataSources: z.array(z.string()).default([]),
    dataTimingMode: z.enum(['realtime', 'historical', 'periodic']).default('realtime'),
    historicalStartDate: z.string().optional(),
    historicalEndDate: z.string().optional(),
    periodicInterval: z.string().optional(),
    periodicFrequencyLabel: z.string().optional(),
    minRewardPerUserUsdc: z.number().min(0).max(100),
    maxProgramDurationDays: z.number().int().min(1).max(365),
    maxProofAgeHours: z.number().int().min(1).max(168),
    minWitnessCount: z.number().int().min(1).max(10),
    requireHttpsBuyerCallback: z.boolean(),
    maxActivePrograms: z.number().int().min(1).max(100),
    policyCid: z.string().optional(),
    policyDescription: z.string().optional(),
  })

  const registerSchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    dataSources: z.array(z.string()).optional(),
    supportedDataDescription: z.string().min(10),
    openclawUrl: z.string().url().optional(),
    channel: z.enum(['whatsapp', 'telegram', 'discord']),
    contactInfo: z.string().min(1),
    policy: providerPolicySchema.optional(),
  })

  // POST /api/provider/register
  // DEPRECATED: Client now uploads to IPFS + Stellar directly, then POSTs to /api/notify/provider
  // Kept for backward compatibility
  router.post('/register', zValidator('json', registerSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    // Upload policy to IPFS if provided
    let policyCid: string | undefined
    if (body.policy) {
      try {
        policyCid = await uploadJson(
          { ...body.policy, pseudoId, stellarAddress: body.stellarAddress, createdAt: new Date().toISOString() },
          { name: `policy-${pseudoId.slice(0, 8)}.json`, keyvalues: { type: 'policy', provider: pseudoId.slice(0, 32) } }
        )
      } catch (err) {
        console.error('[provider] policy IPFS upload failed:', err)
      }
    }

    const dataSources = body.policy?.dataSources ?? body.dataSources ?? []

    await storage.storeProvider({
      pseudoId,
      stellarAddress: body.stellarAddress,
      dataSources,
      supportedDataDescription: body.supportedDataDescription,
      openclawUrl: body.openclawUrl,
      channel: body.channel,
      contactInfo: body.contactInfo,
      policy: body.policy
        ? { ...body.policy, policyCid } as any
        : {
            verificationMethod: 'api-zktls',
            dataSources,
            dataTimingMode: 'realtime',
            minRewardPerUserUsdc: 0.5,
            maxProgramDurationDays: 90,
            maxProofAgeHours: 24,
            minWitnessCount: 1,
            requireHttpsBuyerCallback: true,
            maxActivePrograms: 10,
          } as any,
      registeredAt: new Date().toISOString(),
      status: 'active',
    })

    return c.json({
      status: 'registered',
      pseudoId,
      policyCid,
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
      dataSources: p.dataSources,
      channel: p.channel,
      policy: p.policy,
      registeredAt: p.registeredAt,
    }))
    return c.json({ providers: mapped, total: mapped.length })
  })

  // GET /api/provider/me
  router.get('/me', async (c) => {
    const address = c.req.query('address')
    if (!address) return c.json({ error: 'address query param required' }, 400)

    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
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
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
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

  // POST /api/provider/policy — upload to IPFS, return CID
  // DEPRECATED: Client now uploads to IPFS + Stellar directly, then POSTs to /api/notify/policy
  const providerPolicyUpdateSchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    policy: providerPolicySchema,
  })

  router.post('/policy', zValidator('json', providerPolicyUpdateSchema), async (c) => {
    const body = c.req.valid('json')
    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    const provider = await storage.getProvider(pseudoId)
    if (!provider) return c.json({ error: 'Provider bulunamadi' }, 404)

    // Upload policy to IPFS
    let policyCid: string | undefined
    try {
      policyCid = await uploadJson(
        { ...body.policy, pseudoId, stellarAddress: body.stellarAddress, updatedAt: new Date().toISOString() },
        { name: `policy-${pseudoId.slice(0, 8)}.json`, keyvalues: { type: 'policy', provider: pseudoId.slice(0, 32) } }
      )
    } catch (err) {
      console.error('[provider] policy IPFS upload failed:', err)
    }

    const updatedPolicy = { ...body.policy, policyCid } as any

    await storage.storeProvider({
      ...provider,
      dataSources: body.policy.dataSources ?? provider.dataSources,
      policy: updatedPolicy,
    })

    return c.json({ status: 'saved', pseudoId, policyCid, policy: updatedPolicy })
  })

  return router
}
