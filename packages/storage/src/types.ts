// ---------------------------------------------------------------------------
// Shared types for storage layer
// ---------------------------------------------------------------------------

export type EntityType = 'skill' | 'mcp' | 'proof' | 'provider' | 'botconfig' | 'escrow' | 'review' | 'batch' | 'batchpay'

export type UserRole = 'buyer' | 'seller'

// ---------------------------------------------------------------------------
// Batch Transfer Protocol
// ---------------------------------------------------------------------------

export interface BatchState {
  batchIndex: number
  totalBatches: number
  escrowId: string
  skillId: string
  sellerAddress: string
  /** Number of rows delivered in this batch (without storing row payload on server) */
  rowCount: number
  /** Proof hash that authenticated this batch */
  proofHash: string
  /** sha256 of all row proof identifiers joined by ':' */
  batchHash: string
  /** ed25519 signature of batchHash by seller */
  sellerSignature?: string
  createdAt: string
}

export interface BatchPayment {
  escrowId: string
  batchIndex: number
  buyerAddress: string
  sellerAddress: string
  amount: number
  txHash: string
  memo: string
  createdAt: string
}

export interface StoredBatchState extends BatchState {
  status: 'delivered' | 'verified' | 'rejected'
}

export interface StoredBatchPayment extends BatchPayment {
  status: 'pending' | 'confirmed'
}

// ---------------------------------------------------------------------------
// Seller Policy (agent-to-agent)
// ---------------------------------------------------------------------------

export interface SellerPolicy {
  stellarAddress: string
  dataSources: string[]
  allowedMetrics: string[]
  deniedMetrics: string[]
  minPrice: number
  pricePerRow?: number
  maxRowsPerRequest: number
  maxConcurrentTasks: number
  autoAccept: boolean
  autoAcceptRules?: {
    maxPrice: number
    onlyMetrics: string[]
    onlyBuyers?: string[]
  }
  contactChannel: 'whatsapp' | 'telegram' | 'discord'
  contactId: string
  attestorUrl?: string
  publicKeyForEncryption?: string
  createdAt: string
  updatedAt: string
  policyVersion: number
}

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
  /** Buyer callback encryption public key (X25519/age/NaCl public key) */
  deliveryPublicKey?: string
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
  /** Stellar address of the creator */
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
  /** Advanced/custom MCP settings — free-form string */
  advancedConfig?: string
  rating: number
  ratingCount: number
  ipfsHash: string
  createdAt: string
  /** Soroban feedback contract record ID (set after on-chain registration) */
  feedbackContractId?: string
}

export type VerificationMethod = 'api-zktls' | 'device-tee' | 'fhe-range' | 'zk-selective'
export type DataTimingMode = 'realtime' | 'historical' | 'periodic'

export interface ProviderPolicy {
  /* ── Verification ── */
  verificationMethod: VerificationMethod

  /* ── Data Sources (free-form, no restriction) ── */
  dataSources: string[]

  /* ── Data Timing ── */
  dataTimingMode: DataTimingMode
  /** ISO date – only when dataTimingMode === 'historical' */
  historicalStartDate?: string
  /** ISO date – only when dataTimingMode === 'historical' */
  historicalEndDate?: string
  /** Cron-like interval description – only when dataTimingMode === 'periodic' */
  periodicInterval?: string
  /** e.g. "every 6 hours", "daily", "weekly" */
  periodicFrequencyLabel?: string

  /* ── Constraints ── */
  minRewardPerUserUsdc: number
  maxProgramDurationDays: number
  maxProofAgeHours: number
  minWitnessCount: number
  requireHttpsBuyerCallback: boolean
  maxActivePrograms: number

  /* ── Metadata ── */
  /** IPFS CID of the full policy document (set after upload) */
  policyCid?: string
  /** Free-text description of what data is offered and conditions */
  policyDescription?: string
}

export interface StoredProof {
  proofHash: string
  skillId: string
  provider: string
  metric: string
  providerAddress?: string
  status: 'verified' | 'failed' | 'pending'
  timestamp: string
  ipfsHash?: string
}

export interface StoredProvider {
  stellarAddress: string
  dataSources: string[]
  /** Free-text description of supported data types/sources and policies */
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
  stellarAddress: string
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
  /** Optional MCP creator payout (deducted from platform share) */
  mcpCreatorAddress?: string
  mcpCreatorShare?: number
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
