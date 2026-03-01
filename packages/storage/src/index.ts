// ---------------------------------------------------------------------------
// @dataeconomy/storage — Unified IPFS + Stellar storage layer
//
// STORAGE_MODE env var controls behavior:
//   "ipfs+stellar" — real IPFS uploads + Stellar manage_data index
//   "memory"       — in-memory Maps (default for development)
//
// The backend is a STATELESS facilitator. All persistent data lives in
// IPFS (content) or Stellar blockchain (references/index).
// ---------------------------------------------------------------------------

export { WarmCache } from './warm-cache.js'
export { StorageService, createStorageService } from './storage-service.js'
export { createEscrowAdapter } from './escrow-adapter.js'
export type { EscrowAdapter } from './escrow-adapter.js'
export type {
  StoredSkill,
  StoredMcpStandard,
  StoredProof,
  StoredProvider,
  StoredBotConfig,
  EscrowRecord,
  EntityType,
} from './types.js'
