// ---------------------------------------------------------------------------
// Shared types for storage layer
// ---------------------------------------------------------------------------

export type EntityType = 'skill' | 'mcp' | 'proof' | 'provider' | 'botconfig'

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
  creator: string
  usageCount: number
  rating: number
  ratingCount: number
  ipfsHash: string
  createdAt: string
}

export interface StoredProof {
  proofHash: string
  skillId: string
  provider: string
  metric: string
  status: 'verified' | 'failed' | 'pending'
  timestamp: string
  ipfsHash?: string
}

export interface StoredProvider {
  pseudoId: string
  stellarAddress: string
  dataSources: string[]
  openclawUrl?: string
  channel: 'whatsapp' | 'telegram' | 'discord'
  contactInfo: string
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
}
