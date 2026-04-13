import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { horizonServer } from '@pde/stellar'

export const consentRouter = new Hono()
const isProd = process.env.NODE_ENV === 'production'

const notifyUserSchema = z.object({
  skillId: z.string().uuid(),
  stellarAddress: z.string().startsWith('G').length(56),
  channel: z.enum(['whatsapp', 'telegram', 'discord']),
  to: z.string(),
  openclawUrl: z.string().url(),
  openclawToken: z.string(),
})

// POST /api/consent/notify — Send notification to user via OpenClaw
consentRouter.post('/notify', zValidator('json', notifyUserSchema), async (c) => {
  const body = c.req.valid('json')

  const message = `📊 New data task available!\n\nSkill: ${body.skillId.slice(0, 8)}...\n\nReply "yes" to accept, "no" to decline.`

  try {
    const res = await fetch(`${body.openclawUrl}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.openclawToken}`,
      },
      body: JSON.stringify({
        message,
        name: 'PDE-Notify',
        agentId: 'main',
        sessionKey: `skill:${body.skillId}:${body.stellarAddress}`,
        wakeMode: 'now',
        deliver: true,
        channel: body.channel,
        to: body.to,
      }),
    })

    if (!res.ok) {
      return c.json({ error: 'OpenClaw notification failed', status: res.status }, 502)
    }

    return c.json({ status: 'notified', skillId: body.skillId, stellarAddress: body.stellarAddress })
  } catch (err) {
    return c.json({ error: 'OpenClaw unreachable' }, 503)
  }
})

// POST /api/consent/record — Write user decision to Stellar
const recordConsentSchema = z.object({
  skillId: z.string().uuid(),
  stellarAddress: z.string().startsWith('G').length(56),
  decision: z.enum(['ACCEPT', 'REJECT']),
  txHash: z.string().min(1).optional(),
  publicKey: z.string().startsWith('G').length(56).optional(),
})

consentRouter.post('/record', zValidator('json', recordConsentSchema), async (c) => {
  const body = c.req.valid('json')

  if (body.decision === 'ACCEPT') {
    if (!body.txHash || !body.publicKey) {
      return c.json({ error: 'txHash ve publicKey gerekli' }, 400)
    }

    try {
      const tx = await horizonServer.transactions().transaction(body.txHash).call()
      const memoText: string | undefined =
        (tx as any).memo_type === 'text' ? ((tx as any).memo as string) : undefined

      if (!memoText) {
        return c.json({ error: 'Consent TX memo bulunamadi' }, 400)
      }

      const parts = memoText.split(':')
      if (parts.length !== 4 || parts[0] !== 'CONSENT') {
        return c.json({ error: 'Consent memo format gecersiz' }, 400)
      }

      const [_, memoSkill, memoUser, memoDecision] = parts
      const compactSkillId = body.skillId.replace(/-/g, '').slice(0, 4)
      const compactAddress = body.stellarAddress.slice(0, 4)

      if (
        memoSkill !== compactSkillId ||
        memoUser !== compactAddress ||
        memoDecision !== body.decision
      ) {
        return c.json({ error: 'Consent memo beklenen degerlerle eslesmiyor' }, 409)
      }

      if ((tx as any).source_account !== body.publicKey) {
        return c.json({ error: 'Consent TX farkli bir kaynaktan gonderilmis' }, 409)
      }

      return c.json({
        status: 'verified',
        memo: memoText,
        txHash: body.txHash,
        decision: body.decision,
        timestamp: new Date().toISOString(),
      })
    } catch (err) {
      console.error('[consent] Consent TX lookup failed:', err)
      return c.json({ error: 'Consent TX Horizon uzerinden dogrulanamadi' }, 502)
    }
  }

  // REJECT icin on-chain TX zorunlu degil; sadece off-chain kayit
  return c.json({
    status: 'recorded',
    decision: body.decision,
    timestamp: new Date().toISOString(),
  })
})
