// ---------------------------------------------------------------------------
// Notify router — lightweight endpoints for client-side TX notifications
//
// Frontend uploads to IPFS + writes to Stellar directly.
// Then POSTs here so the facilitator (backend) can update its warm cache
// and trigger any backend-only side effects (e.g. OpenClaw dispatch).
//
// Each endpoint validates the TX hash on Horizon before accepting.
// ---------------------------------------------------------------------------

import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { Horizon } from '@stellar/stellar-sdk'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import type { StorageService } from '@dataeconomy/storage'
import { dispatchSkillToProviders } from '../lib/openclaw.js'

const HORIZON_URL = 'https://horizon-testnet.stellar.org'

// ---------------------------------------------------------------------------
// CID Audit Trail — logs CID changes for future chain recording
// ---------------------------------------------------------------------------

interface CidChangeRecord {
  entityType: 'mcp' | 'skill' | 'provider'
  entityId: string
  oldCid: string
  newCid: string
  changedAt: string
  changedBy: string
}

/** In-memory CID change log (for later chain recording via feedback contract) */
const cidChangeLog: CidChangeRecord[] = []

function logCidChange(
  entityType: 'mcp' | 'skill' | 'provider',
  entityId: string,
  oldCid: string,
  newCid: string,
  changedBy: string
) {
  if (oldCid === newCid) return
  const record: CidChangeRecord = {
    entityType,
    entityId,
    oldCid,
    newCid,
    changedAt: new Date().toISOString(),
    changedBy,
  }
  cidChangeLog.push(record)
  console.log(
    `[cid-audit] ${entityType} ${entityId.slice(0, 8)} CID changed: ${oldCid.slice(0, 12)} → ${newCid.slice(0, 12)}`
  )
}

// ---------------------------------------------------------------------------
// Platform mirror pinning — pin every CID to platform Pinata (fire-and-forget)
// ---------------------------------------------------------------------------

async function mirrorPinCid(cid: string, name: string) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) return

  try {
    await fetch('https://api.pinata.cloud/pinning/pinByHash', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        hashToPin: cid,
        pinataMetadata: { name: `mirror:${name}` },
      }),
    })
  } catch (err) {
    console.warn(`[mirror] Failed to pin ${cid.slice(0, 12)}:`, err)
  }
}

/**
 * Verify a TX hash exists on Horizon and was submitted by the claimed source.
 * Returns the TX record or null if invalid.
 */
async function verifyTxOnHorizon(
  txHash: string,
  expectedSource?: string
): Promise<{ valid: boolean; record?: Horizon.ServerApi.TransactionRecord }> {
  try {
    const server = new Horizon.Server(HORIZON_URL)
    const record = await server.transactions().transaction(txHash).call()

    if (expectedSource && record.source_account !== expectedSource) {
      return { valid: false }
    }

    return { valid: true, record }
  } catch {
    return { valid: false }
  }
}

export function createNotifyRouter(storage: StorageService) {
  const router = new Hono()

  // -----------------------------------------------------------------------
  // POST /api/notify/mcp — MCP standard published from client
  // -----------------------------------------------------------------------
  const mcpNotifySchema = z.object({
    id: z.string().min(1),
    ipfsHash: z.string().min(1),
    txHash: z.string().min(1),
    stellarAddress: z.string().startsWith('G').length(56),
    data: z.object({
      title: z.string(),
      description: z.string(),
      dataSource: z.string(),
      metrics: z.array(z.string()),
      apiEndpoint: z.string(),
      authType: z.string(),
      responseFormat: z.string().optional(),
      usageFee: z.number().optional(),
      verificationMethod: z.string().optional(),
      advancedConfig: z.string().optional(),
    }).passthrough(),
  })

  router.post('/mcp', zValidator('json', mcpNotifySchema), async (c) => {
    const body = c.req.valid('json')

    // Verify TX on Horizon
    const { valid } = await verifyTxOnHorizon(body.txHash, body.stellarAddress)
    if (!valid) {
      return c.json({ error: 'TX verification failed on Horizon' }, 400)
    }

    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)

    const creatorPseudo = generatePseudonym(secret, body.stellarAddress).pseudonym

    // Store in warm cache (no IPFS upload, no Stellar write — client already did that)
    const mcp = {
      id: body.id,
      title: body.data.title,
      description: body.data.description,
      dataSource: body.data.dataSource,
      metrics: body.data.metrics,
      apiEndpoint: body.data.apiEndpoint,
      authType: body.data.authType,
      responseFormat: body.data.responseFormat ?? '',
      creator: creatorPseudo,
      creatorAddress: body.stellarAddress,
      usageFee: body.data.usageFee ?? 0.05,
      usageCount: 0,
      volume: 0,
      proofType: 'zk-tls' as const,
      freshnessSlaHours: 24,
      minWitnessCount: 1,
      deliveryFormat: 'json' as const,
      schemaVersion: '1.0.0',
      dataRetentionDays: 30,
      requiresConsentTx: true,
      advancedConfig: body.data.advancedConfig,
      rating: 0,
      ratingCount: 0,
      ipfsHash: body.ipfsHash,
      createdAt: new Date().toISOString(),
    }

    // CID audit trail — check if this is an update
    const existingMcp = await storage.getMcp(body.id).catch(() => null)
    if (existingMcp?.ipfsHash && existingMcp.ipfsHash !== body.ipfsHash) {
      logCidChange('mcp', body.id, existingMcp.ipfsHash, body.ipfsHash, body.stellarAddress)
    }

    // Direct cache update via storeFromNotify (bypasses IPFS+Stellar write)
    await storage.cacheOnly('mcp', body.id, body.ipfsHash, mcp)

    // Platform mirror pin (fire-and-forget)
    mirrorPinCid(body.ipfsHash, `mcp:${body.id}`).catch(() => {})

    console.log(`[notify] MCP ${body.id.slice(0, 8)} registered — CID:${body.ipfsHash.slice(0, 12)} TX:${body.txHash.slice(0, 12)}`)

    return c.json({
      status: 'accepted',
      id: body.id,
      ipfsHash: body.ipfsHash,
      txHash: body.txHash,
      cidChanged: existingMcp?.ipfsHash ? existingMcp.ipfsHash !== body.ipfsHash : false,
    })
  })

  // -----------------------------------------------------------------------
  // POST /api/notify/skill — Skill/program created from client
  // -----------------------------------------------------------------------
  const skillNotifySchema = z.object({
    skillId: z.string().min(1),
    ipfsHash: z.string().min(1),
    txHash: z.string().min(1),
    stakeTxHash: z.string().optional(),
    stellarAddress: z.string().startsWith('G').length(56),
    data: z.object({
      title: z.string(),
      description: z.string(),
      dataSource: z.string(),
      metrics: z.array(z.string()),
      durationDays: z.number(),
      rewardPerUser: z.number(),
      totalBudget: z.number(),
      targetCount: z.number(),
      callbackUrl: z.string().optional(),
      deliveryPublicKey: z.string().optional(),
      mcpId: z.string().optional(),
    }).passthrough(),
  })

  router.post('/skill', zValidator('json', skillNotifySchema), async (c) => {
    const body = c.req.valid('json')

    const { valid } = await verifyTxOnHorizon(body.txHash, body.stellarAddress)
    if (!valid) {
      return c.json({ error: 'TX verification failed on Horizon' }, 400)
    }

    const skill = {
      id: body.skillId,
      title: body.data.title,
      description: body.data.description,
      dataSource: body.data.dataSource,
      metrics: body.data.metrics,
      durationDays: body.data.durationDays,
      rewardPerUser: body.data.rewardPerUser,
      totalBudget: body.data.totalBudget,
      targetCount: body.data.targetCount,
      callbackUrl: body.data.callbackUrl,
      deliveryPublicKey: body.data.deliveryPublicKey,
      mcpId: body.data.mcpId,
      expiresAt: new Date(Date.now() + body.data.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      ipfsHash: body.ipfsHash,
      status: 'active' as const,
    }

    // CID audit trail
    const existingSkill = await storage.getSkill(body.skillId).catch(() => null)
    if (existingSkill?.ipfsHash && existingSkill.ipfsHash !== body.ipfsHash) {
      logCidChange('skill', body.skillId, existingSkill.ipfsHash, body.ipfsHash, body.stellarAddress)
    }

    await storage.cacheOnly('skill', body.skillId, body.ipfsHash, skill)

    // Platform mirror pin (fire-and-forget)
    mirrorPinCid(body.ipfsHash, `skill:${body.skillId}`).catch(() => {})

    // Dispatch to matching providers via OpenClaw (fire-and-forget)
    dispatchSkillToProviders(
      storage,
      body.skillId,
      body.data.dataSource,
      body.data.rewardPerUser,
      body.data.title,
      body.ipfsHash,
      body.data.mcpId
    )
      .then(({ notified, skipped }) => {
        if (notified > 0 || skipped > 0) {
          console.log(`[notify] Dispatched skill ${body.skillId.slice(0, 8)} — notified:${notified} skipped:${skipped}`)
        }
      })
      .catch((err) => console.warn('[notify] Dispatch error:', err))

    console.log(`[notify] Skill ${body.skillId.slice(0, 8)} registered — CID:${body.ipfsHash.slice(0, 12)} TX:${body.txHash.slice(0, 12)}`)

    return c.json({
      status: 'accepted',
      skillId: body.skillId,
      ipfsHash: body.ipfsHash,
      txHash: body.txHash,
    })
  })

  // -----------------------------------------------------------------------
  // POST /api/notify/provider — Provider registered/updated from client
  // -----------------------------------------------------------------------
  const providerNotifySchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    ipfsHash: z.string().min(1),
    txHash: z.string().min(1),
    dataSources: z.array(z.string()),
    supportedDataDescription: z.string(),
    openclawUrl: z.string().optional(),
    channel: z.enum(['whatsapp', 'telegram', 'discord']),
    contactInfo: z.string(),
    policy: z.record(z.string(), z.unknown()).optional(),
  })

  router.post('/provider', zValidator('json', providerNotifySchema), async (c) => {
    const body = c.req.valid('json')

    const { valid } = await verifyTxOnHorizon(body.txHash, body.stellarAddress)
    if (!valid) {
      return c.json({ error: 'TX verification failed on Horizon' }, 400)
    }

    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    const provider = {
      pseudoId,
      stellarAddress: body.stellarAddress,
      dataSources: body.dataSources,
      supportedDataDescription: body.supportedDataDescription,
      openclawUrl: body.openclawUrl,
      channel: body.channel,
      contactInfo: body.contactInfo,
      policy: body.policy as any,
      registeredAt: new Date().toISOString(),
      status: 'active' as const,
      ipfsHash: body.ipfsHash,
    }

    // CID audit trail
    const existingProvider = await storage.getProvider(pseudoId).catch(() => null)
    if (existingProvider?.ipfsHash && existingProvider.ipfsHash !== body.ipfsHash) {
      logCidChange('provider', pseudoId, existingProvider.ipfsHash, body.ipfsHash, body.stellarAddress)
    }

    await storage.cacheOnly('provider', pseudoId, body.ipfsHash, provider)

    // Platform mirror pin (fire-and-forget)
    mirrorPinCid(body.ipfsHash, `provider:${pseudoId}`).catch(() => {})

    console.log(`[notify] Provider ${pseudoId.slice(0, 8)} registered — TX:${body.txHash.slice(0, 12)}`)

    return c.json({
      status: 'accepted',
      pseudoId,
      ipfsHash: body.ipfsHash,
      txHash: body.txHash,
    })
  })

  // -----------------------------------------------------------------------
  // POST /api/notify/policy — Provider policy updated from client
  // -----------------------------------------------------------------------
  const policyNotifySchema = z.object({
    stellarAddress: z.string().startsWith('G').length(56),
    ipfsHash: z.string().min(1),
    txHash: z.string().min(1),
    policy: z.record(z.string(), z.unknown()),
  })

  router.post('/policy', zValidator('json', policyNotifySchema), async (c) => {
    const body = c.req.valid('json')

    const { valid } = await verifyTxOnHorizon(body.txHash, body.stellarAddress)
    if (!valid) {
      return c.json({ error: 'TX verification failed on Horizon' }, 400)
    }

    const secret = process.env.PSEUDONYM_SECRET
    if (!secret) return c.json({ error: 'PSEUDONYM_SECRET not configured' }, 500)
    const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

    // Update existing provider with new policy
    const existing = await storage.getProvider(pseudoId)
    if (!existing) return c.json({ error: 'Provider not found' }, 404)

    const updatedProvider = {
      ...existing,
      policy: { ...body.policy, policyCid: body.ipfsHash } as any,
      ipfsHash: body.ipfsHash,
    }

    await storage.cacheOnly('provider', pseudoId, body.ipfsHash, updatedProvider)

    console.log(`[notify] Policy updated for ${pseudoId.slice(0, 8)} — CID:${body.ipfsHash.slice(0, 12)}`)

    return c.json({
      status: 'accepted',
      pseudoId,
      policyCid: body.ipfsHash,
      txHash: body.txHash,
    })
  })

  // -----------------------------------------------------------------------
  // GET /api/notify/cid-audit — CID change audit log
  // -----------------------------------------------------------------------
  router.get('/cid-audit', async (c) => {
    const entityType = c.req.query('type')
    const entityId = c.req.query('id')

    let filtered = cidChangeLog
    if (entityType) {
      filtered = filtered.filter((r) => r.entityType === entityType)
    }
    if (entityId) {
      filtered = filtered.filter((r) => r.entityId === entityId)
    }

    return c.json({
      changes: filtered,
      total: filtered.length,
    })
  })

  return router
}
