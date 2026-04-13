// ---------------------------------------------------------------------------
// WarmCache — In-memory index rebuilt from Stellar manage_data
//
// NOT the source of truth. Performance layer only.
// Source of truth = Stellar blockchain + IPFS.
// On restart, rebuilt from Stellar. On write, updated immediately.
// ---------------------------------------------------------------------------

import type { EntityType } from './types.js'

interface CacheEntry {
  ipfsHash: string
  data?: unknown
}

// Prefix mapping for Stellar manage_data keys
const PREFIXES: Record<EntityType, string> = {
  skill: 'sk:',
  mcp: 'mc:',
  proof: 'pf:',
  provider: 'pr:',
  botconfig: 'bc:',
  escrow: 'es:',
  review: 'rv:',
}

export class WarmCache {
  private stores = new Map<EntityType, Map<string, CacheEntry>>()

  constructor() {
    this.stores.set('skill', new Map())
    this.stores.set('mcp', new Map())
    this.stores.set('proof', new Map())
    this.stores.set('provider', new Map())
    this.stores.set('botconfig', new Map())
    this.stores.set('escrow', new Map())
    this.stores.set('review', new Map())
  }

  /**
   * Rebuild cache from Stellar manage_data entries.
   * Reads all data entries from the platform account and parses keys.
   */
  async rebuild(platformAddress: string): Promise<number> {
    const { readAccountData } = await import('@pde/stellar')

    try {
      const dataMap = await readAccountData(platformAddress)
      let count = 0

      for (const [key, value] of dataMap) {
        for (const [entityType, prefix] of Object.entries(PREFIXES)) {
          if (key.startsWith(prefix)) {
            const entityId = key.slice(prefix.length)
            this.set(entityType as EntityType, entityId, value)
            count++
          }
        }
      }

      console.log(`[warm-cache] Rebuilt ${count} entries from Stellar`)
      return count
    } catch (err) {
      console.warn('[warm-cache] Failed to rebuild from Stellar:', err)
      return 0
    }
  }

  /** Set/update a cache entry */
  set(type: EntityType, id: string, ipfsHash: string, data?: unknown): void {
    const store = this.stores.get(type)!
    store.set(id, { ipfsHash, data })
  }

  /** Get a single entry */
  get(type: EntityType, id: string): CacheEntry | undefined {
    return this.stores.get(type)!.get(id)
  }

  /** Delete an entry */
  delete(type: EntityType, id: string): void {
    this.stores.get(type)!.delete(id)
  }

  /** List all entries of a type */
  list(type: EntityType): Array<{ id: string } & CacheEntry> {
    const store = this.stores.get(type)!
    return Array.from(store.entries()).map(([id, entry]) => ({
      id,
      ...entry,
    }))
  }

  /** Get the count of entries of a type */
  count(type: EntityType): number {
    return this.stores.get(type)!.size
  }

  /** Get the Stellar manage_data key for an entity */
  static stellarKey(type: EntityType, id: string): string {
    return `${PREFIXES[type]}${id.slice(0, 24)}`
  }

  /** Clear all caches */
  clear(): void {
    for (const store of this.stores.values()) {
      store.clear()
    }
  }
}
