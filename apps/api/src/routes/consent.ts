import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import { writeConsentTx } from '@dataeconomy/stellar'
import { Keypair } from '@stellar/stellar-sdk'

export const consentRouter = new Hono()

const notifyUserSchema = z.object({
  skillId: z.string().uuid(),
  stellarAddress: z.string().startsWith('G').length(56),
  channel: z.enum(['whatsapp', 'telegram', 'discord']),
  to: z.string(),
  openclawUrl: z.string().url(),
  openclawToken: z.string(),
})

// POST /api/consent/notify — OpenClaw üzerinden kullanıcıya bildirim gönder
consentRouter.post('/notify', zValidator('json', notifyUserSchema), async (c) => {
  const body = c.req.valid('json')

  const secret = process.env.PSEUDONYM_SECRET
  if (!secret) return c.json({ error: 'Sunucu yapılandırma hatası: PSEUDONYM_SECRET eksik' }, 500)

  const pseudoId = generatePseudonym(secret, body.stellarAddress).pseudonym

  const message = `📊 Yeni veri görevi mevcut!\n\nSkill: ${body.skillId.slice(0, 8)}...\n\nKabul etmek için "evet", reddetmek için "hayır" yaz.`

  try {
    const res = await fetch(`${body.openclawUrl}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${body.openclawToken}`,
      },
      body: JSON.stringify({
        message,
        name: 'DataEconomy-Notify',
        agentId: 'main',
        sessionKey: `skill:${body.skillId}:${pseudoId}`,
        wakeMode: 'now',
        deliver: true,
        channel: body.channel,
        to: body.to,
      }),
    })

    if (!res.ok) {
      return c.json({ error: 'OpenClaw bildirimi başarısız', status: res.status }, 502)
    }

    return c.json({ status: 'notified', skillId: body.skillId, pseudoId })
  } catch (err) {
    return c.json({ error: 'OpenClaw erişilemiyor' }, 503)
  }
})

// POST /api/consent/record — Kullanıcı kararını Stellar'a yaz
const recordConsentSchema = z.object({
  skillId: z.string().uuid(),
  pseudoId: z.string(),
  decision: z.enum(['ACCEPT', 'REJECT']),
})

consentRouter.post('/record', zValidator('json', recordConsentSchema), async (c) => {
  const body = c.req.valid('json')

  const platformSecret = process.env.STELLAR_PLATFORM_SECRET
  if (!platformSecret) {
    return c.json({ error: 'Platform Stellar secret yapılandırılmamış' }, 500)
  }

  // Memo 28 byte sınırı: "CS:12345678:12345678:A" = 22 byte — sığar
  const memo = `CS:${body.skillId.slice(0, 8)}:${body.pseudoId.slice(0, 8)}:${body.decision === 'ACCEPT' ? 'A' : 'R'}`

  let stellarTx = 'TESTNET_DISABLED'
  try {
    const keypair = Keypair.fromSecret(platformSecret)
    const result = await writeConsentTx(keypair, body.skillId.slice(0, 8), body.pseudoId.slice(0, 8), body.decision)
    stellarTx = (result as any).hash ?? String(result)
  } catch (err) {
    console.error('[consent] Stellar TX failed:', err)
    // Testnet unreliable — devam et ama logla
  }

  return c.json({
    status: 'recorded',
    memo,
    stellarTx,
    decision: body.decision,
    timestamp: new Date().toISOString(),
  })
})
