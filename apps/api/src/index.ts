// Load root .env.local (Node 22+ built-in — no dotenv needed)
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
try {
  // @ts-ignore — process.loadEnvFile added in Node 22
  ;(process as any).loadEnvFile(resolve(__dirname, '../../../.env.local'))
} catch {
  // File not found or Node < 22 — env vars come from shell
}

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRouter } from './routes/auth.js'
import { consentRouter } from './routes/consent.js'
import { seedRouter } from './routes/seed.js'
import { createSkillsRouter } from './routes/skills.js'
import { createProofsRouter } from './routes/proofs.js'
import { createMarketplaceRouter } from './routes/marketplace.js'
import { createProviderRouter } from './routes/provider.js'
import { createEscrowRouter } from './routes/escrow.js'
import { createDashboardRouter } from './routes/dashboard.js'
import { createNotifyRouter } from './routes/notify.js'
import { createStorageService, createEscrowAdapter } from '@dataeconomy/storage'
const isProd = process.env.NODE_ENV === 'production'
const corsOrigin = process.env.CORS_ORIGIN ?? '*'

if (isProd && corsOrigin === '*') {
  throw new Error('CORS_ORIGIN must be explicitly configured in production')
}

// ---------------------------------------------------------------------------
// Initialize storage layer
// ---------------------------------------------------------------------------
const { storage, cache } = createStorageService()
const escrowAdapter = createEscrowAdapter(storage)

const app = new Hono()

app.use('*', cors({ origin: corsOrigin }))
app.use('*', logger())

app.get('/health', (c) => c.json({
  status: 'ok',
  storageMode: 'ipfs+stellar',
  timestamp: new Date().toISOString(),
}))

// Static routers (no storage dependency)
app.route('/api/auth', authRouter)
app.route('/api/consent', consentRouter)
// Simülasyon / otomatik demo seed endpoint'i kaldırıldı

// Storage-backed routers
app.route('/api/skills', createSkillsRouter(storage))
app.route('/api/proofs', createProofsRouter(storage, escrowAdapter))
app.route('/api/marketplace', createMarketplaceRouter(storage))
app.route('/api/provider', createProviderRouter(storage))
app.route('/api/escrow', createEscrowRouter(escrowAdapter))
app.route('/api/dashboard', createDashboardRouter(storage))
app.route('/api/notify', createNotifyRouter(storage))

// IPFS proxy — frontend fetches IPFS data through backend
app.get('/api/ipfs/:cid', async (c) => {
  const cid = c.req.param('cid')
  if (!/^[a-zA-Z0-9]{46,64}$/.test(cid)) {
    return c.json({ error: 'Invalid CID' }, 400)
  }
  const gateway = process.env.PINATA_GATEWAY_URL || 'https://gateway.pinata.cloud'
  try {
    const res = await fetch(`${gateway}/ipfs/${cid}`)
    if (!res.ok) return c.json({ error: 'IPFS fetch failed' }, 502)
    const data = await res.json()
    return c.json(data)
  } catch {
    return c.json({ error: 'IPFS fetch error' }, 502)
  }
})

// ---------------------------------------------------------------------------
// Startup: rebuild warm cache from Stellar (if ipfs+stellar mode)
// ---------------------------------------------------------------------------
async function startup() {
  {
    const platformAddress = process.env.STELLAR_PLATFORM_PUBLIC
    if (platformAddress) {
      console.log('[startup] Rebuilding warm cache from Stellar...')
      const count = await cache.rebuild(platformAddress)
      console.log(`[startup] Cache rebuilt: ${count} entries`)
    } else if (isProd) {
      throw new Error('STELLAR_PLATFORM_PUBLIC must be set in production')
    } else {
      console.warn('[startup] STELLAR_PLATFORM_PUBLIC not set, skipping cache rebuild')
    }
  }

  const port = Number(process.env.PORT || 3001)
  serve({ fetch: app.fetch, port }, async () => {
    console.log(`API running on http://localhost:${port} (storage: ipfs+stellar)`)
  })
}

startup().catch(console.error)

export default app
