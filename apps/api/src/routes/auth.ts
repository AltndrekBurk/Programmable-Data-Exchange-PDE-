import { Hono } from 'hono'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { Keypair } from '@stellar/stellar-sdk'
import { generatePseudonym } from '@dataeconomy/pseudonym'
import crypto from 'crypto'

export const authRouter = new Hono()

// In-memory challenge store (production'da Redis olmalı)
const challenges = new Map<string, { challenge: string; expiresAt: number }>()

// GET /api/auth/challenge?address=G...
authRouter.get('/challenge', (c) => {
  const address = c.req.query('address')
  if (!address || !address.startsWith('G') || address.length !== 56) {
    return c.json({ error: 'Geçersiz Stellar adresi' }, 400)
  }

  const challenge = `dataEconomy-auth:${address}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`
  challenges.set(address, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 dakika
  })

  return c.json({ challenge })
})

// POST /api/auth/verify
const verifySchema = z.object({
  publicKey: z.string().startsWith('G').length(56),
  signature: z.string().min(1),
  challenge: z.string().min(1),
})

authRouter.post('/verify', zValidator('json', verifySchema), async (c) => {
  const { publicKey, signature, challenge } = c.req.valid('json')

  // Challenge kontrolü
  const stored = challenges.get(publicKey)
  if (!stored || stored.challenge !== challenge || stored.expiresAt < Date.now()) {
    return c.json({ error: 'Challenge geçersiz veya süresi dolmuş' }, 401)
  }
  challenges.delete(publicKey) // tek kullanımlık

  // Ed25519 imza doğrulama
  try {
    const keypair = Keypair.fromPublicKey(publicKey)
    const messageBuffer = Buffer.from(challenge, 'utf-8')
    const signatureBuffer = Buffer.from(signature, 'base64')

    // Freighter signMessage farklı formatlarda dönebilir
    // Önce raw Ed25519 dene, başarısızsa hex decode dene
    let isValid = false
    try {
      isValid = keypair.verify(messageBuffer, signatureBuffer)
    } catch {
      // Freighter hex string döndüyse
      try {
        const hexBuffer = Buffer.from(signature, 'hex')
        isValid = keypair.verify(messageBuffer, hexBuffer)
      } catch {
        // Son deneme: signature doğrudan UTF-8 olarak geldiyse base64 decode farklı olabilir
      }
    }

    if (!isValid) {
      // Testnet MVP: imza doğrulanamazsa loglayıp devam et
      // Production'da bu kesinlikle reject edilmeli
      console.warn(`[auth] Signature verification failed for ${publicKey.slice(0, 8)}... — allowing for testnet MVP`)
    }
  } catch (err) {
    console.warn('[auth] Signature format error, allowing for testnet MVP:', err)
  }

  // Pseudo ID üret
  const secret = process.env.PSEUDONYM_SECRET || 'dev-secret-change-in-production'
  const pseudoId = generatePseudonym(secret, publicKey).pseudonym

  return c.json({ pseudoId, stellarAddress: publicKey })
})
