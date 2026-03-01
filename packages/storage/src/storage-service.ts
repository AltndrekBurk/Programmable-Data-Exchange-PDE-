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
  EntityType,
} from './types.js'

export class StorageService {
  private mode: 'ipfs+stellar' | 'memory'
  private cache: WarmCache
  private keypair: Keypair | null = null

  // In-memory fallback stores (used when mode = 'memory')
  private memSkills = new Map<string, StoredSkill>()
  private memMcps = new Map<string, StoredMcpStandard>()
  private memProofs = new Map<string, StoredProof>()
  private memProviders = new Map<string, StoredProvider>()
  private memBotConfigs = new Map<string, StoredBotConfig>()

  constructor(cache: WarmCache) {
    this.mode = (process.env['STORAGE_MODE'] as any) || 'memory'
    this.cache = cache

    const secret = process.env['STELLAR_PLATFORM_SECRET']
    if (secret) {
      try {
        this.keypair = Keypair.fromSecret(secret)
      } catch {
        console.warn('[storage] Invalid STELLAR_PLATFORM_SECRET')
      }
    }

    console.log(`[storage] Mode: ${this.mode}`)
  }

  // =========================================================================
  // SKILLS
  // =========================================================================

  async storeSkill(skill: StoredSkill): Promise<{ ipfsHash: string; stellarTx?: string }> {
    if (this.mode === 'ipfs+stellar') {
      return this.storeToIpfsAndStellar('skill', skill.id, skill)
    }
    // memory mode
    this.memSkills.set(skill.id, skill)
    return { ipfsHash: `QmMock${skill.id.slice(0, 8)}` }
  }

  async getSkill(id: string): Promise<StoredSkill | null> {
    if (this.mode === 'ipfs+stellar') {
      return this.fetchFromCache<StoredSkill>('skill', id)
    }
    return this.memSkills.get(id) || null
  }

  async listSkills(): Promise<StoredSkill[]> {
    if (this.mode === 'ipfs+stellar') {
      return this.listFromCache<StoredSkill>('skill')
    }
    return Array.from(this.memSkills.values())
  }

  // =========================================================================
  // MCP STANDARDS
  // =========================================================================

  async storeMcp(mcp: StoredMcpStandard): Promise<{ ipfsHash: string; stellarTx?: string }> {
    if (this.mode === 'ipfs+stellar') {
      return this.storeToIpfsAndStellar('mcp', mcp.id, mcp)
    }
    this.memMcps.set(mcp.id, mcp)
    return { ipfsHash: `QmMock${mcp.id.slice(0, 8)}` }
  }

  async getMcp(id: string): Promise<StoredMcpStandard | null> {
    if (this.mode === 'ipfs+stellar') {
      return this.fetchFromCache<StoredMcpStandard>('mcp', id)
    }
    return this.memMcps.get(id) || null
  }

  async listMcps(): Promise<StoredMcpStandard[]> {
    if (this.mode === 'ipfs+stellar') {
      return this.listFromCache<StoredMcpStandard>('mcp')
    }
    return Array.from(this.memMcps.values())
  }

  async updateMcp(id: string, update: Partial<StoredMcpStandard>): Promise<StoredMcpStandard | null> {
    const existing = await this.getMcp(id)
    if (!existing) return null

    const updated = { ...existing, ...update }

    if (this.mode === 'ipfs+stellar') {
      await this.storeToIpfsAndStellar('mcp', id, updated)
    } else {
      this.memMcps.set(id, updated)
    }
    return updated
  }

  // =========================================================================
  // PROOFS
  // =========================================================================

  async storeProof(proof: StoredProof): Promise<{ ipfsHash: string; stellarTx?: string }> {
    if (this.mode === 'ipfs+stellar') {
      return this.storeToIpfsAndStellar('proof', proof.proofHash, proof)
    }
    this.memProofs.set(proof.proofHash, proof)
    return { ipfsHash: `QmMock${proof.proofHash.slice(0, 8)}` }
  }

  async listProofs(): Promise<StoredProof[]> {
    if (this.mode === 'ipfs+stellar') {
      return this.listFromCache<StoredProof>('proof')
    }
    return Array.from(this.memProofs.values())
  }

  async listProofsBySkill(skillId: string): Promise<StoredProof[]> {
    const all = await this.listProofs()
    return all.filter((p) => p.skillId === skillId)
  }

  // =========================================================================
  // PROVIDERS
  // =========================================================================

  async storeProvider(provider: StoredProvider): Promise<{ ipfsHash: string; stellarTx?: string }> {
    if (this.mode === 'ipfs+stellar') {
      return this.storeToIpfsAndStellar('provider', provider.pseudoId, provider)
    }
    this.memProviders.set(provider.pseudoId, provider)
    return { ipfsHash: `QmMock${provider.pseudoId.slice(0, 8)}` }
  }

  async getProvider(pseudoId: string): Promise<StoredProvider | null> {
    if (this.mode === 'ipfs+stellar') {
      return this.fetchFromCache<StoredProvider>('provider', pseudoId)
    }
    return this.memProviders.get(pseudoId) || null
  }

  async listProviders(dataSource?: string): Promise<StoredProvider[]> {
    const all = this.mode === 'ipfs+stellar'
      ? await this.listFromCache<StoredProvider>('provider')
      : Array.from(this.memProviders.values())

    return all
      .filter((p) => p.status === 'active')
      .filter((p) => !dataSource || p.dataSources.includes(dataSource))
  }

  // =========================================================================
  // BOT CONFIGS
  // =========================================================================

  async storeBotConfig(config: StoredBotConfig): Promise<void> {
    // Bot configs are sensitive — in production would be AES encrypted on IPFS
    // For now, store in memory or as-is on IPFS
    if (this.mode === 'ipfs+stellar') {
      await this.storeToIpfsAndStellar('botconfig', config.pseudoId, config)
    } else {
      this.memBotConfigs.set(config.pseudoId, config)
    }
  }

  async getBotConfig(pseudoId: string): Promise<StoredBotConfig | null> {
    if (this.mode === 'ipfs+stellar') {
      return this.fetchFromCache<StoredBotConfig>('botconfig', pseudoId)
    }
    return this.memBotConfigs.get(pseudoId) || null
  }

  // =========================================================================
  // Internal: IPFS + Stellar operations
  // =========================================================================

  private async storeToIpfsAndStellar<T>(
    type: EntityType,
    id: string,
    data: T
  ): Promise<{ ipfsHash: string; stellarTx?: string }> {
    const { uploadJson, isIpfsAvailable } = await import('@dataeconomy/ipfs')
    const { writeIndexEntry } = await import('@dataeconomy/stellar')

    let ipfsHash: string

    // Step 1: Upload to IPFS
    if (isIpfsAvailable()) {
      ipfsHash = await uploadJson(data, {
        name: `${type}-${id.slice(0, 8)}.json`,
        keyvalues: { type, id: id.slice(0, 32) },
      })
    } else {
      // Fallback: mock hash for dev without Pinata
      ipfsHash = `QmMock${id.slice(0, 8)}`
      console.warn(`[storage] PINATA_JWT not set — using mock IPFS hash for ${type}:${id}`)
    }

    // Step 2: Write index to Stellar
    let stellarTx: string | undefined
    if (this.keypair) {
      try {
        const key = WarmCache.stellarKey(type, id)
        const result = await writeIndexEntry(this.keypair, key, ipfsHash)
        stellarTx = (result as any).hash
      } catch (err) {
        console.warn(`[storage] Stellar index write failed for ${type}:${id}:`, err)
        // Continue without Stellar — IPFS hash is still valid
      }
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
