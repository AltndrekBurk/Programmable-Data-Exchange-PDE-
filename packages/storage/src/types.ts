// ---------------------------------------------------------------------------
// Shared types for storage layer
// ---------------------------------------------------------------------------

export type EntityType = 'skill' | 'mcp' | 'proof' | 'provider' | 'botconfig' | 'escrow' | 'review'

export interface SkillPolicy {
  maxProofAgeHours: number
  minWitnessCount: number
  replayProtectionWindowHours: number
  requireHttpsCallback: boolean
  deliveryContentType: 'application/json' | 'application/cbor' | 'application/octet-stream'
}

export interface StoredSkill {
  id: string
  title: string
  description: string
  dataSource: string
  metrics: string[]
  durationDays: number
  rewardPerUser: number
  totalBudget: number
  targetCount: number
  callbackUrl?: string
  /** Optional MCP standard ID this skill was built from */
  mcpId?: string
  /** Optional policy used during proof validation and delivery */
  policy?: SkillPolicy
  expiresAt: string
  createdAt: string
  ipfsHash: string
  status: 'active' | 'completed' | 'expired'
}

export interface StoredMcpStandard {
  id: string
  title: string
  description: string
  dataSource: string
  metrics: string[]
  apiEndpoint: string
  authType: string
  responseFormat: string
  /** pseudoId of the creator */
  creator: string
  /** Stellar G... address of the creator — receives usage fees */
  creatorAddress?: string
  /** Usage fee per use in USDC (e.g. 0.05) */
  usageFee?: number
  usageCount: number
  /** Cumulative USDC volume earned by this MCP (on-chain verifiable) */
  volume: number
  /** Proof verification mode expected for this MCP */
  proofType?: 'zk-tls' | 'attested-runtime' | 'hybrid'
  /** Freshness SLA in hours (proof timestamp must be newer than this window) */
  freshnessSlaHours?: number
  /** Minimum witness signatures expected in proof */
  minWitnessCount?: number
  /** Output payload format expected by buyers */
  deliveryFormat?: 'json' | 'cbor' | 'protobuf'
  /** MCP schema version for compatibility checks */
  schemaVersion?: string
  /** Retention recommendation for buyer side storage */
  dataRetentionDays?: number
  /** Whether explicit on-chain consent is mandatory */
  requiresConsentTx?: boolean
  /** Gelişmiş/özel MCP ayarları — serbest metin/string */
  advancedConfig?: string
  rating: number
  ratingCount: number
  ipfsHash: string
  createdAt: string
  /** Soroban feedback contract record ID (set after on-chain registration) */
  feedbackContractId?: string
}

export interface ProviderPolicy {
  minRewardPerUserUsdc: number
  maxProgramDurationDays: number
  maxProofAgeHours: number
  minWitnessCount: number
  requireHttpsBuyerCallback: boolean
  maxActivePrograms: number
}

export interface StoredProof {
  proofHash: string
  skillId: string
  provider: string
  metric: string
  providerPseudoId?: string
  status: 'verified' | 'failed' | 'pending'
  timestamp: string
  ipfsHash?: string
}

export interface StoredProvider {
  pseudoId: string
  stellarAddress: string
  dataSources: string[]
  /** Serbest metin: hangi veri türlerini / kaynakları hangi politikalarla sağladığı */
  supportedDataDescription: string
  openclawUrl?: string
  channel: 'whatsapp' | 'telegram' | 'discord'
  contactInfo: string
  policy?: ProviderPolicy
  registeredAt: string
  status: 'active' | 'inactive'
  ipfsHash?: string
}

export interface StoredBotConfig {
  pseudoId: string
  openclawUrl: string
  openclawToken: string
}

export interface EscrowRecord {
  id: string
  skillId: string
  title: string
  depositor: string
  depositorAddress: string
  totalBudget: number
  locked: number
  released: number
  providerShare: number
  platformShare: number
  disputePool: number
  status: 'locked' | 'releasing' | 'released' | 'disputed' | 'refunded'
  createdAt: string
  updatedAt: string
  txHash?: string
  /** Soroban escrow contract ID used for on-chain escrow */
  sorobanEscrowId?: string
  /** Stellar TX hash of the deposit operation */
  depositTxHash?: string
  /** Stellar TX hash of the release operation */
  releaseTxHash?: string
}
