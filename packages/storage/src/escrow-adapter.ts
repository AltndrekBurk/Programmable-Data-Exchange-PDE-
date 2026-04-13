// ---------------------------------------------------------------------------
// EscrowAdapter — IPFS+Stellar storage + Soroban contract integration
//
// When SOROBAN_ESCROW_CONTRACT is set → calls Soroban deposit/release/refund
// Always stores escrow records on IPFS + Stellar manage_data for indexing
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import {
  Keypair,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk'
import type { EscrowRecord } from './types.js'
import type { StorageService } from './storage-service.js'

export interface LockParams {
  skillId: string
  title: string
  depositor: string // stellarAddress
  depositorAddress: string // Stellar G... address
  amount: number // USDC
}

export interface ReleaseParams {
  escrowId: string
  providerAddress: string
  proofHash: string
  mcpCreatorAddress?: string
  mcpFeeBps?: number
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
// Soroban helper: build, simulate, sign, send, poll
// ---------------------------------------------------------------------------

async function submitSorobanTx(
  server: rpc.Server,
  keypair: Keypair,
  contractId: string,
  method: string,
  args: any[],
): Promise<string> {
  const contract = new Contract(contractId)
  const account = await server.getAccount(keypair.publicKey())

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const simulated = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${(simulated as any).error}`)
  }

  const prepared = rpc.assembleTransaction(tx, simulated).build()
  prepared.sign(keypair)

  const sendResult = await server.sendTransaction(prepared)
  if (sendResult.status === 'ERROR') {
    throw new Error(`TX submission failed: ${sendResult.status}`)
  }

  // Poll for completion
  let getResult = await server.getTransaction(sendResult.hash)
  while (getResult.status === 'NOT_FOUND') {
    await new Promise((r) => setTimeout(r, 1000))
    getResult = await server.getTransaction(sendResult.hash)
  }

  if (getResult.status !== 'SUCCESS') {
    throw new Error(`TX failed: ${getResult.status}`)
  }

  return sendResult.hash
}

// ---------------------------------------------------------------------------
// Soroban-backed Escrow Adapter (IPFS+Stellar index + Soroban contract)
// ---------------------------------------------------------------------------

class SorobanEscrowAdapter implements EscrowAdapter {
  private storage: StorageService
  private contractId: string
  private keypair: Keypair
  private server: rpc.Server

  constructor(storage: StorageService, contractId: string) {
    this.storage = storage
    this.contractId = contractId

    const secret = process.env['STELLAR_PLATFORM_SECRET']
    if (!secret) throw new Error('[escrow] STELLAR_PLATFORM_SECRET required')
    this.keypair = Keypair.fromSecret(secret)
    this.server = new rpc.Server('https://soroban-testnet.stellar.org:443')

    console.log(`[escrow] Using Soroban contract: ${contractId.slice(0, 12)}...`)
  }

  async lock(params: LockParams): Promise<EscrowRecord> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    let depositTxHash: string | undefined
    try {
      const usdcSac = process.env['USDC_TESTNET_SAC'] || 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'
      const platformAddress = process.env['STELLAR_PLATFORM_PUBLIC'] || this.keypair.publicKey()
      const amountStroops = BigInt(Math.round(params.amount * 10_000_000))
      const escrowIdClean = id.replace(/-/g, '').slice(0, 32)

      depositTxHash = await submitSorobanTx(
        this.server,
        this.keypair,
        this.contractId,
        'deposit',
        [
          nativeToScVal(Address.fromString(params.depositorAddress), { type: 'address' }),
          nativeToScVal(Address.fromString(usdcSac), { type: 'address' }),
          nativeToScVal(amountStroops, { type: 'i128' }),
          nativeToScVal(Address.fromString(params.depositorAddress), { type: 'address' }),
          nativeToScVal(Address.fromString(platformAddress), { type: 'address' }),
          nativeToScVal(Address.fromString(platformAddress), { type: 'address' }),
          nativeToScVal(escrowIdClean, { type: 'string' }),
          nativeToScVal(escrowIdClean, { type: 'string' }),
        ],
      )
    } catch (err) {
      console.error('[escrow] Soroban deposit failed:', err)
      throw new Error(`Soroban deposit failed: ${String(err)}`)
    }

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
      txHash: depositTxHash,
      sorobanEscrowId: id,
      depositTxHash,
    }

    await this.storage.storeEscrow(record)
    return record
  }

  async release(params: ReleaseParams): Promise<EscrowRecord> {
    const record = await this.storage.getEscrow(params.escrowId)
    if (!record) throw new Error('Escrow not found')
    if (record.status !== 'locked') throw new Error(`Escrow already ${record.status}`)

    let releaseTxHash: string | undefined
    try {
      const escrowIdClean = params.escrowId.replace(/-/g, '').slice(0, 32)
      const hasMcpSplit = !!params.mcpCreatorAddress && (params.mcpFeeBps ?? 0) > 0
      releaseTxHash = await submitSorobanTx(
        this.server,
        this.keypair,
        this.contractId,
        hasMcpSplit ? 'release_with_mcp_fee' : 'release',
        hasMcpSplit
          ? [
              nativeToScVal(Address.fromString(this.keypair.publicKey()), { type: 'address' }),
              nativeToScVal(escrowIdClean, { type: 'string' }),
              nativeToScVal(Address.fromString(params.mcpCreatorAddress!), { type: 'address' }),
              nativeToScVal(params.mcpFeeBps ?? 0, { type: 'u32' }),
            ]
          : [
              nativeToScVal(Address.fromString(this.keypair.publicKey()), { type: 'address' }),
              nativeToScVal(escrowIdClean, { type: 'string' }),
            ],
      )
    } catch (err) {
      console.error('[escrow] Soroban release failed:', err)
      throw new Error(`Soroban release failed: ${String(err)}`)
    }

    const releaseAmount = record.locked
    const rawPlatformShare = releaseAmount * 0.20
    const mcpCreatorShare = params.mcpFeeBps && params.mcpCreatorAddress
      ? Math.min(rawPlatformShare, (releaseAmount * params.mcpFeeBps) / 10_000)
      : 0
    const updated = await this.storage.updateEscrow(params.escrowId, {
      released: releaseAmount,
      locked: 0,
      providerShare: releaseAmount * 0.70,
      platformShare: rawPlatformShare - mcpCreatorShare,
      disputePool: releaseAmount * 0.10,
      mcpCreatorAddress: params.mcpCreatorAddress,
      mcpCreatorShare,
      status: 'released',
      updatedAt: new Date().toISOString(),
      txHash: releaseTxHash,
      releaseTxHash,
    })

    return updated!
  }

  async dispute(escrowId: string, _reason: string): Promise<EscrowRecord> {
    const record = await this.storage.getEscrow(escrowId)
    if (!record) throw new Error('Escrow not found')
    if (record.status !== 'locked') throw new Error('Only locked escrows can be disputed')

    try {
      const escrowIdClean = escrowId.replace(/-/g, '').slice(0, 32)
      await submitSorobanTx(
        this.server,
        this.keypair,
        this.contractId,
        'dispute',
        [
          nativeToScVal(Address.fromString(this.keypair.publicKey()), { type: 'address' }),
          nativeToScVal(escrowIdClean, { type: 'string' }),
        ],
      )
    } catch (err) {
      console.warn('[escrow] Soroban dispute call failed:', err)
    }

    const updated = await this.storage.updateEscrow(escrowId, {
      status: 'disputed',
      updatedAt: new Date().toISOString(),
    })
    return updated!
  }

  async refund(escrowId: string): Promise<EscrowRecord> {
    const record = await this.storage.getEscrow(escrowId)
    if (!record) throw new Error('Escrow not found')
    if (record.status !== 'locked' && record.status !== 'disputed') {
      throw new Error('Only locked or disputed escrows can be refunded')
    }

    let refundTxHash: string | undefined
    try {
      const escrowIdClean = escrowId.replace(/-/g, '').slice(0, 32)
      refundTxHash = await submitSorobanTx(
        this.server,
        this.keypair,
        this.contractId,
        'refund',
        [
          nativeToScVal(Address.fromString(this.keypair.publicKey()), { type: 'address' }),
          nativeToScVal(escrowIdClean, { type: 'string' }),
        ],
      )
    } catch (err) {
      console.error('[escrow] Soroban refund failed:', err)
      throw new Error(`Soroban refund failed: ${String(err)}`)
    }

    const updated = await this.storage.updateEscrow(escrowId, {
      status: 'refunded',
      released: 0,
      locked: 0,
      updatedAt: new Date().toISOString(),
      txHash: refundTxHash,
    })
    return updated!
  }

  async getEscrow(escrowId: string): Promise<EscrowRecord | null> {
    return this.storage.getEscrow(escrowId)
  }

  async listEscrows(depositorPseudoId?: string): Promise<EscrowRecord[]> {
    return this.storage.listEscrows(depositorPseudoId)
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEscrowAdapter(storage?: StorageService): EscrowAdapter {
  const contractId = process.env['SOROBAN_ESCROW_CONTRACT'] || process.env['SOROBAN_CONTRACT_ID']

  if (!contractId) {
    throw new Error(
      '[escrow] SOROBAN_ESCROW_CONTRACT is required. Deploy the escrow contract first.'
    )
  }

  if (!storage) {
    throw new Error('[escrow] StorageService is required for escrow adapter')
  }

  return new SorobanEscrowAdapter(storage, contractId)
}
