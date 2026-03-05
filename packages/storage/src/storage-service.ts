// ---------------------------------------------------------------------------
// StorageService — Unified store/get/list for all entity types
//
// Dual-mode:
//   STORAGE_MODE=ipfs+stellar → real IPFS + Stellar blockchain
//   STORAGE_MODE=memory       → in-memory Maps (dev default)
//
// When using ipfs+stellar mode:
//   WRITE: upload JSON to IPFS → write manage_data to Stellar → update warm cache
//   READ:  check warm cache → if miss, query Stellar → fetch from IPFS
// ---------------------------------------------------------------------------

import { Keypair } from '@stellar/stellar-sdk'
import { WarmCache } from './warm-cache.js'
import type {
  StoredSkill,
  StoredMcpStandard,
  StoredProof,
  StoredProvider,
  StoredBotConfig,
  EscrowRecord,
  EntityType,
} from './types.js'

export class StorageService {
  private cache: WarmCache
  private keypair: Keypair

  constructor(cache: WarmCache) {
    this.cache = cache

    const secret = process.env['STELLAR_PLATFORM_SECRET']
    if (!secret) {
      throw new Error('[storage] STELLAR_PLATFORM_SECRET is required (no in-memory fallback)')
    }

    try {
      this.keypair = Keypair.fromSecret(secret)
    } catch {
      throw new Error('[storage] Invalid STELLAR_PLATFORM_SECRET')
    }

    console.log('[storage] Mode: ipfs+stellar (memory simulation devre dışı)')
  }

  // =========================================================================
  // SKILLS
  // =========================================================================

  async storeSkill(skill: StoredSkill): Promise<{ ipfsHash: string; stellarTx?: string }> {
    return this.storeToIpfsAndStellar('skill', skill.id, skill)
  }

  async getSkill(id: string): Promise<StoredSkill | null> {
    return this.fetchFromCache<StoredSkill>('skill', id)
  }

  async listSkills(): Promise<StoredSkill[]> {
    return this.listFromCache<StoredSkill>('skill')
  }

  // =========================================================================
  // MCP STANDARDS
  // =========================================================================

  async storeMcp(mcp: StoredMcpStandard): Promise<{ ipfsHash: string; stellarTx?: string }> {
    return this.storeToIpfsAndStellar('mcp', mcp.id, mcp)
  }

  async getMcp(id: string): Promise<StoredMcpStandard | null> {
    return this.fetchFromCache<StoredMcpStandard>('mcp', id)
  }

  async listMcps(): Promise<StoredMcpStandard[]> {
    return this.listFromCache<StoredMcpStandard>('mcp')
  }

  async updateMcp(id: string, update: Partial<StoredMcpStandard>): Promise<StoredMcpStandard | null> {
    const existing = await this.getMcp(id)
    if (!existing) return null

    const updated = { ...existing, ...update }

    await this.storeToIpfsAndStellar('mcp', id, updated)
    return updated
  }

  // =========================================================================
  // PROOFS
  // =========================================================================

  async storeProof(proof: StoredProof): Promise<{ ipfsHash: string; stellarTx?: string }> {
    return this.storeToIpfsAndStellar('proof', proof.proofHash, proof)
  }

  async listProofs(): Promise<StoredProof[]> {
    return this.listFromCache<StoredProof>('proof')
  }

  async listProofsBySkill(skillId: string): Promise<StoredProof[]> {
    const all = await this.listProofs()
    return all.filter((p) => p.skillId === skillId)
  }

  // =========================================================================
  // PROVIDERS
  // =========================================================================

  async storeProvider(provider: StoredProvider): Promise<{ ipfsHash: string; stellarTx?: string }> {
    return this.storeToIpfsAndStellar('provider', provider.pseudoId, provider)
  }

  async getProvider(pseudoId: string): Promise<StoredProvider | null> {
    return this.fetchFromCache<StoredProvider>('provider', pseudoId)
  }

  async listProviders(dataSource?: string): Promise<StoredProvider[]> {
    const all = await this.listFromCache<StoredProvider>('provider')
    return all.filter((p) => p.status === 'active')
  }

  // =========================================================================
  // BOT CONFIGS
  // =========================================================================

  async storeBotConfig(config: StoredBotConfig): Promise<void> {
    // Bot config'ler hassas; yine de simülasyon yok, doğrudan IPFS + Stellar'a yaz
    await this.storeToIpfsAndStellar('botconfig', config.pseudoId, config)
  }

  async getBotConfig(pseudoId: string): Promise<StoredBotConfig | null> {
    return this.fetchFromCache<StoredBotConfig>('botconfig', pseudoId)
  }

  // =========================================================================
  // ESCROW RECORDS
  // =========================================================================

  async storeEscrow(record: EscrowRecord): Promise<{ ipfsHash: string; stellarTx?: string }> {
    return this.storeToIpfsAndStellar('escrow', record.id, record)
  }

  async getEscrow(id: string): Promise<EscrowRecord | null> {
    return this.fetchFromCache<EscrowRecord>('escrow', id)
  }

  async listEscrows(depositorPseudoId?: string): Promise<EscrowRecord[]> {
    const all = await this.listFromCache<EscrowRecord>('escrow')
    if (!depositorPseudoId) return all
    return all.filter((r) => r.depositor === depositorPseudoId)
  }

  async updateEscrow(id: string, update: Partial<EscrowRecord>): Promise<EscrowRecord | null> {
    const existing = await this.getEscrow(id)
    if (!existing) return null
    const updated = { ...existing, ...update }
    await this.storeToIpfsAndStellar('escrow', id, updated)
    return updated
  }

  // =========================================================================
  // REVIEWS (per MCP)
  // =========================================================================

  async storeReviews(mcpId: string, reviews: unknown[]): Promise<{ ipfsHash: string; stellarTx?: string }> {
    return this.storeToIpfsAndStellar('review', mcpId, reviews)
  }

  async getReviews(mcpId: string): Promise<unknown[]> {
    const result = await this.fetchFromCache<unknown[]>('review', mcpId)
    return result ?? []
  }

  // =========================================================================
  // RAW (arbitrary JSON to IPFS only, no Stellar index)
  // =========================================================================

  async storeRaw(data: unknown): Promise<{ ipfsHash: string }> {
    const { uploadJson } = await import('@dataeconomy/ipfs')
    const ipfsHash = await uploadJson(data, {
      name: `raw-${Date.now()}.json`,
      keyvalues: { type: 'raw' },
    })
    return { ipfsHash }
  }

  // =========================================================================
  // Internal: IPFS + Stellar operations
  // =========================================================================

  private async storeToIpfsAndStellar<T>(
    type: EntityType,
    id: string,
    data: T
  ): Promise<{ ipfsHash: string; stellarTx?: string }> {
    const { uploadJson } = await import('@dataeconomy/ipfs')
    const { writeIndexEntry } = await import('@dataeconomy/stellar')

    // Step 1: Upload to IPFS (zorunlu, fallback yok)
    const ipfsHash = await uploadJson(data, {
      name: `${type}-${id.slice(0, 8)}.json`,
      keyvalues: { type, id: id.slice(0, 32) },
    })

    // Step 2: Write index to Stellar
    let stellarTx: string | undefined
    try {
      const key = WarmCache.stellarKey(type, id)
      const result = await writeIndexEntry(this.keypair, key, ipfsHash)
      stellarTx = (result as any).hash
    } catch (err) {
      throw new Error(`[storage] Stellar index write failed for ${type}:${id}: ${String(err)}`)
    }

    // Step 3: Update warm cache
    this.cache.set(type, id, ipfsHash, data)

    return { ipfsHash, stellarTx }
  }

  private async fetchFromCache<T>(type: EntityType, id: string): Promise<T | null> {
    const entry = this.cache.get(type, id)
    if (!entry) return null

    // If we have cached data, return it
    if (entry.data) return entry.data as T

    // Otherwise fetch from IPFS
    try {
      const { fetchJson } = await import('@dataeconomy/ipfs')
      const data = await fetchJson<T>(entry.ipfsHash)
      // Update cache with fetched data
      this.cache.set(type, id, entry.ipfsHash, data)
      return data
    } catch (err) {
      console.warn(`[storage] IPFS fetch failed for ${type}:${id} (${entry.ipfsHash}):`, err)
      return null
    }
  }

  private async listFromCache<T>(type: EntityType): Promise<T[]> {
    const entries = this.cache.list(type)
    const results: T[] = []

    for (const entry of entries) {
      if (entry.data) {
        results.push(entry.data as T)
      } else {
        try {
          const { fetchJson } = await import('@dataeconomy/ipfs')
          const data = await fetchJson<T>(entry.ipfsHash)
          this.cache.set(type, entry.id, entry.ipfsHash, data)
          results.push(data)
        } catch {
          // Skip failed fetches
        }
      }
    }

    return results
  }
}

/**
 * Create a StorageService instance with a warm cache.
 * Call cache.rebuild() after creation to populate from Stellar.
 */
export function createStorageService(): { storage: StorageService; cache: WarmCache } {
  const cache = new WarmCache()
  const storage = new StorageService(cache)
  return { storage, cache }
}
