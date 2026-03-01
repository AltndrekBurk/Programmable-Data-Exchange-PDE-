import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { skillsRouter } from './routes/skills.js'
import { proofsRouter } from './routes/proofs.js'
import { consentRouter } from './routes/consent.js'
import { authRouter } from './routes/auth.js'
import { marketplaceRouter } from './routes/marketplace.js'
import { providerRouter } from './routes/provider.js'
import { escrowRouter } from './routes/escrow.js'
import { seedRouter } from './routes/seed.js'

const app = new Hono()

app.use('*', cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }))
app.use('*', logger())

app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

app.route('/api/auth', authRouter)
app.route('/api/skills', skillsRouter)
app.route('/api/proofs', proofsRouter)
app.route('/api/consent', consentRouter)
app.route('/api/marketplace', marketplaceRouter)
app.route('/api/provider', providerRouter)
app.route('/api/escrow', escrowRouter)
app.route('/api/seed', seedRouter)

serve({ fetch: app.fetch, port: 3001 }, () => {
  console.log('API running on http://localhost:3001')
})

export default app
