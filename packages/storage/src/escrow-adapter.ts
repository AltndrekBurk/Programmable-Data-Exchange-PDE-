// ---------------------------------------------------------------------------
// EscrowAdapter — Soroban contract or in-memory simulation
//
// When SOROBAN_CONTRACT_ID is set → calls real Soroban contract
// When not set → in-memory simulation (same interface)
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import type { EscrowRecord } from './types.js'

export interface LockParams {
  skillId: string
  title: string
  depositor: string // pseudoId
  depositorAddress: string // Stellar G... address
  amount: number // USDC
}

export interface ReleaseParams {
  escrowId: string
  providerAddress: string
  proofHash: string
}

export interface EscrowAdapter {
  lock(params: LockParams): Promise<EscrowRecord>
  release(params: ReleaseParams): Promise<EscrowRecord>
  dispute(escrowId: string, reason: string): Promise<EscrowRecord>
  refund(escrowId: string): Promise<EscrowRecord>
  getEscrow(escrowId: string): Promise<EscrowRecord | null>
  listEscrows(depositorPseudoId?: string): Promise<EscrowRecord[]>
}

// ---------------------------------------------------------------------------
// In-Memory Simulation (used until Soroban contract is deployed)
// ---------------------------------------------------------------------------

class InMemoryEscrowAdapter implements EscrowAdapter {
  private store = new Map<string, EscrowRecord>()

  async lock(params: LockParams): Promise<EscrowRecord> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const record: EscrowRecord = {
      id,
      skillId: params.skillId,
      title: params.title,
      depositor: params.depositor,
      depositorAddress: params.depositorAddress,
      totalBudget: params.amount,
      locked: params.amount,
      released: 0,
      providerShare: 0,
      platformShare: 0,
      disputePool: 0,
      status: 'locked',
      createdAt: now,
      updatedAt: now,
      txHash: `SIM_LOCK_${crypto.randomBytes(16).toString('hex')}`,
    }

    this.store.set(id, record)
    return record
  }

  async release(params: ReleaseParams): Promise<EscrowRecord> {
    const record = this.store.get(params.escrowId)
    if (!record) throw new Error('Escrow bulunamadi')
    if (record.status !== 'locked') throw new Error(`Escrow zaten ${record.status}`)

    const releaseAmount = record.locked
    record.released = releaseAmount
    record.locked = 0
    record.providerShare = releaseAmount * 0.70
    record.platformShare = releaseAmount * 0.20
    record.disputePool = releaseAmount * 0.10
    record.status = 'released'
    record.updatedAt = new Date().toISOString()
    record.txHash = `SIM_RELEASE_${crypto.randomBytes(16).toString('hex')}`

    this.store.set(params.escrowId, record)
    return record
  }

  async dispute(escrowId: string, _reason: string): Promise<EscrowRecord> {
    const record = this.store.get(escrowId)
    if (!record) throw new Error('Escrow bulunamadi')
    if (record.status !== 'locked') throw new Error('Sadece kilitli escrow itiraz edilebilir')

    record.status = 'disputed'
    record.updatedAt = new Date().toISOString()
    this.store.set(escrowId, record)
    return record
  }

  async refund(escrowId: string): Promise<EscrowRecord> {
    const record = this.store.get(escrowId)
    if (!record) throw new Error('Escrow bulunamadi')
    if (record.status !== 'locked' && record.status !== 'disputed') {
      throw new Error('Sadece kilitli/ihtilaflı escrow iade edilebilir')
    }

    record.status = 'refunded'
    record.released = 0
    record.locked = 0
    record.updatedAt = new Date().toISOString()
    this.store.set(escrowId, record)
    return record
  }

  async getEscrow(escrowId: string): Promise<EscrowRecord | null> {
    return this.store.get(escrowId) || null
  }

  async listEscrows(depositorPseudoId?: string): Promise<EscrowRecord[]> {
    let records = Array.from(this.store.values())
    if (depositorPseudoId) {
      records = records.filter((r) => r.depositor === depositorPseudoId)
    }
    return records
  }
}

// ---------------------------------------------------------------------------
// Soroban Adapter (for when contract is deployed)
// ---------------------------------------------------------------------------

// class SorobanEscrowAdapter implements EscrowAdapter {
//   constructor(private contractId: string) {}
//   // TODO: Implement using @stellar/stellar-sdk SorobanRpc
//   // Each method calls the corresponding Soroban contract function
// }

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEscrowAdapter(): EscrowAdapter {
  const contractId = process.env['SOROBAN_CONTRACT_ID']

  if (contractId) {
    console.log(`[escrow] Soroban contract: ${contractId} (TODO: real adapter)`)
    // return new SorobanEscrowAdapter(contractId)
  }

  console.log('[escrow] Using in-memory simulation (SOROBAN_CONTRACT_ID not set)')
  return new InMemoryEscrowAdapter()
}
