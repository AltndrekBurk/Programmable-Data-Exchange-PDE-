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
import { createStorageService, createEscrowAdapter } from '@dataeconomy/storage'

// ---------------------------------------------------------------------------
// Initialize storage layer
// ---------------------------------------------------------------------------
const { storage, cache } = createStorageService()
const escrowAdapter = createEscrowAdapter()

const app = new Hono()

app.use('*', cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }))
app.use('*', logger())

app.get('/health', (c) => c.json({
  status: 'ok',
  storageMode: process.env.STORAGE_MODE || 'memory',
  timestamp: new Date().toISOString(),
}))

// Static routers (no storage dependency)
app.route('/api/auth', authRouter)
app.route('/api/consent', consentRouter)
app.route('/api/seed', seedRouter)

// Storage-backed routers
app.route('/api/skills', createSkillsRouter(storage))
app.route('/api/proofs', createProofsRouter(storage))
app.route('/api/marketplace', createMarketplaceRouter(storage))
app.route('/api/provider', createProviderRouter(storage))
app.route('/api/escrow', createEscrowRouter(escrowAdapter))

// ---------------------------------------------------------------------------
// Startup: rebuild warm cache from Stellar (if ipfs+stellar mode)
// ---------------------------------------------------------------------------
async function startup() {
  const mode = process.env.STORAGE_MODE || 'memory'

  if (mode === 'ipfs+stellar') {
    const platformAddress = process.env.STELLAR_PLATFORM_PUBLIC
    if (platformAddress) {
      console.log('[startup] Rebuilding warm cache from Stellar...')
      const count = await cache.rebuild(platformAddress)
      console.log(`[startup] Cache rebuilt: ${count} entries`)
    } else {
      console.warn('[startup] STELLAR_PLATFORM_PUBLIC not set, skipping cache rebuild')
    }
  }

  serve({ fetch: app.fetch, port: 3001 }, () => {
    console.log(`API running on http://localhost:3001 (storage: ${mode})`)
  })
}

startup().catch(console.error)

export default app
