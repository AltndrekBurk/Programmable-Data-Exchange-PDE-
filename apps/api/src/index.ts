// Load root .env.local for local dev only (skip on Vercel — env vars come from dashboard)
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
if (!process.env.VERCEL) {
  try {
    const __dirname = fileURLToPath(new URL('.', import.meta.url))
    // @ts-ignore — process.loadEnvFile added in Node 22
    ;(process as any).loadEnvFile(resolve(__dirname, '../../../.env.local'))
  } catch {
    // File not found or Node < 22
  }
}

import { Hono } from 'hono'
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
  console.warn('[warn] CORS_ORIGIN not set in production — defaulting to *')
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
// Warm cache rebuild (runs once on cold start)
// ---------------------------------------------------------------------------
let cacheReady = false
async function ensureCache() {
  if (cacheReady) return
  const platformAddress = process.env.STELLAR_PLATFORM_PUBLIC
  if (platformAddress) {
    console.log('[startup] Rebuilding warm cache from Stellar...')
    const count = await cache.rebuild(platformAddress)
    console.log(`[startup] Cache rebuilt: ${count} entries`)
  } else if (isProd) {
    console.warn('[startup] STELLAR_PLATFORM_PUBLIC not set — cache skipped')
  }
  cacheReady = true
}

// Eagerly start cache rebuild (don't block request handling)
// On Vercel, skip eager rebuild — do it lazily on first relevant request
if (!process.env.VERCEL) {
  ensureCache().catch(console.error)
}

// ---------------------------------------------------------------------------
// Local dev: start standalone server with @hono/node-server
// ---------------------------------------------------------------------------
if (!process.env.VERCEL) {
  import('@hono/node-server').then(({ serve }) => {
    const port = Number(process.env.PORT || 3001)
    serve({ fetch: app.fetch, port }, () => {
      console.log(`API running on http://localhost:${port} (storage: ipfs+stellar)`)
    })
  })
}

// Export raw Hono app — api/index.ts wraps with handle() for Vercel
export default app
