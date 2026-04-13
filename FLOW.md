# PDE — Agent-to-Agent Flow
Last updated: 2026-04-13 (v3.0)

## 1) System Roles

- **Buyer Agent (OpenClaw):** User's bot. Creates skills, locks escrow, verifies proofs, sends x402 payments, decrypts data.
- **Seller Agent (OpenClaw):** Provider's bot. Watches chain for matching skills, evaluates policy, generates ZK proofs, delivers encrypted data row-by-row.
- **MCP Creator:** Publishes reusable data extraction standards to marketplace. Earns per-use fees at contract level.
- **PDE Server (optional):** Governance layer — warm cache, push notifications, dispute admin, analytics. NOT required for core operations.
- **Attestor-Core:** Self-hosted TLS witness. Signs what it sees from source APIs. Independent from both agents and server.
- **Stellar/Soroban:** On-chain truth — escrow, consent, CID index, atomic payments.
- **IPFS (Pinata):** Content-addressed storage for skills, policies, proofs, encrypted data batches.

## 2) Architecture Principle: Agent-First, Server-Optional

**Agents interact with Stellar + IPFS directly. The server is a convenience layer.**

| Operation | Who does it | Where |
|-----------|------------|-------|
| Create skill (data request) | Buyer Agent | IPFS upload + Stellar index (agent keypair) |
| Publish policy (data offer) | Seller Agent | IPFS upload + Stellar index (agent keypair) |
| Discover skills/providers | Both Agents | Horizon RPC + IPFS gateway (direct read) |
| Consent (accept/reject) | Seller Agent | Stellar TX (agent keypair) |
| Escrow lock | Buyer Agent | Soroban contract call (agent keypair) |
| ZK proof generation | Seller Agent | attestor-core → zkFetch (agent side) |
| Proof verification | Buyer Agent | ed25519 sig check (local, no server) |
| x402 micro-payment per batch | Buyer Agent | Stellar USDC transfer (agent keypair) |
| Encrypted delivery | Seller Agent | IPFS upload + Stellar batch index |
| Escrow release | Buyer Agent (or timeout) | Soroban contract call |
| Warm cache / notifications | PDE Server | Optional optimization |
| Dispute resolution | PDE Server admin | Only when needed |

**The server cannot:**
- Read plaintext data (encrypted with buyer's key)
- Forge ZK proofs (doesn't have attestor private key)
- Steal escrow funds (Soroban contract controls releases)
- Censor tasks (skills/policies live on Stellar + IPFS)
- Prevent refunds (timeout refund is permissionless)

## 3) End-to-End Agent-to-Agent Flow

### Phase 1: Seller Registers Policy (One-Time Setup)

```
Seller (human) → OpenClaw bot:
  "Register me as a Fitbit data provider. 
   Minimum price 0.50 USDC per request.
   Only share step data, not heart rate."

Seller Agent:
  1. Creates policy JSON:
     {
       "stellarAddress": "G...",
       "dataSources": ["fitbit"],
       "allowedMetrics": ["steps", "distance"],
       "deniedMetrics": ["heart_rate", "sleep"],
       "minPrice": 0.50,
       "maxRowsPerRequest": 500,
       "autoAccept": false,
       "contactChannel": "whatsapp",
       "contactId": "+90..."
     }
  2. Uploads policy to IPFS → CID
  3. Indexes CID on Stellar: manage_data("pr:{address}" → CID)
  4. (Optional) Notifies PDE server: POST /api/notify/provider
```

### Phase 2: Buyer Creates Skill (Data Request)

```
Buyer (human) → OpenClaw bot:
  "I need 90 days of Fitbit step data. 
   Budget: 1.50 USDC. Need ZK proof for each batch."

Buyer Agent:
  1. Generates X25519 delivery keypair (public + private)
  2. Creates skill JSON:
     {
       "skillId": "uuid",
       "dataSource": "fitbit",
       "metrics": ["steps"],
       "duration": "90d",
       "budget": 1.50,
       "batchSize": 10,
       "deliveryPublicKey": "x25519-pubkey-hex",
       "callbackUrl": null,
       "createdBy": "G..."
     }
  3. Uploads skill to IPFS → CID
  4. Indexes CID on Stellar: manage_data("sk:{skillId}" → CID)
  5. (Optional) Notifies PDE server: POST /api/notify/skill
```

### Phase 3: Skill Discovery & Policy Matching (Seller Agent)

```
Seller Agent (always running):
  1. Watches Stellar SSE stream for new manage_data entries with "sk:" prefix
  2. Detects new skill CID → fetches skill JSON from IPFS
  3. Evaluates against own policy:
     - dataSource matches? ✓ (fitbit)
     - metrics allowed? ✓ (steps is in allowedMetrics)
     - price acceptable? ✓ (1.50 >= minPrice 0.50)
     - rows within limit? ✓ (90 <= maxRowsPerRequest 500)
  
  4a. If autoAccept=true → proceed to Phase 4 automatically
  4b. If autoAccept=false → ask user:

Seller Agent → User:
  "📊 New data task!
   Source: Fitbit (steps)
   Duration: 90 days
   Reward: 1.50 USDC
   
   Accept? (evet/hayir)"

User → "evet"
```

### Phase 4: Consent (Seller Agent → Stellar)

```
Seller Agent:
  1. Writes consent TX to Stellar:
     - Operation: manage_data("cs:{skillId}:{sellerAddr4}" → "ACCEPT")
     - Signed with seller's Stellar keypair
  2. (Optional) Notifies PDE server of consent

Buyer Agent:
  1. Detects consent via Stellar SSE (new "cs:" entry)
  2. Verifies seller's policy on IPFS (optional trust check)
  3. Proceeds to escrow lock
```

### Phase 5: Escrow Lock (Buyer Agent → Soroban)

```
Buyer Agent:
  1. Calls Soroban escrow contract: deposit()
     - depositor: buyer's address
     - recipient: seller's address (from consent TX)
     - amount: 1.50 USDC
     - skill_id: skillId
     - timeout_at: now + 7 days
  2. USDC transferred from buyer wallet to contract
  3. Escrow event emitted on Soroban

Seller Agent:
  1. Detects escrow deposit via Soroban events (SSE)
  2. Confirms: USDC is locked for this skillId
  3. Begins data extraction
```

### Phase 6: Row-by-Row Data Transfer

This is the core innovation. Data is delivered in batches with mutual confirmation.

```
Config from skill JSON:
  - totalRows: 90 (90 days of data)
  - batchSize: 10
  - totalBatches: 9
  - batchPrice: 1.50 / 9 = ~0.167 USDC per batch

For batch_index = 0 to 8:

  ┌─ SELLER AGENT ────────────────────────────────────────────┐
  │                                                            │
  │  1. For each row in batch:                                 │
  │     a. zkFetch(fitbitApiUrl, {                             │
  │          date: row.date,                                   │
  │          token: userFitbitOAuthToken                        │
  │        })                                                  │
  │     → Routes through attestor-core                         │
  │     → Attestor opens TLS to api.fitbit.com                 │
  │     → Attestor witnesses response                          │
  │     → Attestor signs sha256(claimData) with ed25519        │
  │     → Returns ReclaimProof per row                         │
  │                                                            │
  │  2. Bundle batch:                                          │
  │     {                                                      │
  │       batchIndex: 3,                                       │
  │       totalBatches: 9,                                     │
  │       escrowId: "uuid",                                    │
  │       rows: [                                              │
  │         { data: encrypted(row1, buyerPubKey),              │
  │           proof: reclaimProof1 },                          │
  │         { data: encrypted(row2, buyerPubKey),              │
  │           proof: reclaimProof2 },                          │
  │         ...10 rows                                         │
  │       ],                                                   │
  │       batchHash: sha256(all_row_hashes),                   │
  │       sellerSignature: ed25519_sign(batchHash, sellerKey)  │
  │     }                                                      │
  │                                                            │
  │  3. Upload batch to IPFS → batchCid                        │
  │  4. Index on Stellar: manage_data("bt:{escrowId}:{idx}")   │
  │     → batchCid                                             │
  └────────────────────────────────────────────────────────────┘

  ┌─ BUYER AGENT ─────────────────────────────────────────────┐
  │                                                            │
  │  5. Detect new batch via SSE ("bt:" prefix)                │
  │  6. Fetch batch JSON from IPFS                             │
  │  7. For each row in batch:                                 │
  │     a. Verify ReclaimProof:                                │
  │        - ed25519.verify(sig, hash, attestorPubKey) ✓       │
  │        - Timestamp fresh? ✓                                │
  │        - Provider matches? ✓                               │
  │     b. Decrypt row data with buyer's private key           │
  │     c. Verify data matches proof claim                     │
  │                                                            │
  │  8. All rows valid → send x402 micro-payment:              │
  │     - Stellar USDC transfer: 0.167 USDC to seller          │
  │     - Memo: "x402:{escrowId}:{batchIndex}"                 │
  │                                                            │
  │  9. (Optional) Index payment on Stellar:                   │
  │     manage_data("bp:{escrowId}:{idx}") → txHash            │
  └────────────────────────────────────────────────────────────┘

  ┌─ SELLER AGENT ────────────────────────────────────────────┐
  │                                                            │
  │  10. Detect x402 payment via SSE                           │
  │  11. Confirm: correct amount for this batch                │
  │  12. Proceed to next batch (loop back to step 1)           │
  └────────────────────────────────────────────────────────────┘

After all 9 batches delivered + paid:

  Buyer Agent:
    13. All data received and verified
    14. Call Soroban: set_proof(aggregateProofCid, aggregateProofHash)
    15. Call Soroban: release() → atomic 3-way split
        - 70% → Seller (minus x402 micro-payments already sent)
        - 20% → Platform
        - 10% → Dispute pool
        + MCP creator fee (if applicable)
```

### Phase 7: Dispute & Safety

```
If buyer stops paying mid-transfer:
  → Seller stops delivering (natural protection)
  → Seller has received partial x402 payments for delivered batches
  → After timeout_at: seller can dispute for remaining escrow

If seller stops delivering:
  → Buyer has partial data + proofs for received batches
  → Buyer can dispute on Soroban: dispute()
  → Admin resolves: can release partial amount proportional to delivered batches

If seller delivers bad data:
  → Buyer's agent rejects (proof verification fails)
  → No x402 payment sent for invalid batch
  → After timeout_at: buyer calls refund_if_expired()

If escrow times out (no activity):
  → Anyone can call refund_if_expired() on Soroban
  → 100% returned to buyer

Dispute resolution:
  → Either party calls dispute() on Soroban
  → PDE admin panel reviews on-chain evidence (proofs, payments, batches)
  → resolve_dispute(winner) distributes funds
```

## 4) Seller Policy Model

Sellers publish their data offering policy to IPFS. This is their "advertisement" of what data they're willing to sell and under what conditions.

```typescript
interface SellerPolicy {
  // Identity
  stellarAddress: string;         // G... public key
  
  // Data capabilities
  dataSources: string[];          // ["fitbit", "strava", "spotify"]
  allowedMetrics: string[];       // ["steps", "distance", "top_tracks"]
  deniedMetrics: string[];        // ["heart_rate", "sleep", "listening_time"]
  
  // Pricing
  minPrice: number;               // Minimum USDC per request
  pricePerRow?: number;           // Optional per-row pricing
  
  // Limits
  maxRowsPerRequest: number;      // Maximum rows per skill
  maxConcurrentTasks: number;     // How many tasks at once
  
  // Automation
  autoAccept: boolean;            // Skip user confirmation?
  autoAcceptRules?: {             // Conditions for auto-accept
    maxPrice: number;
    onlyMetrics: string[];
    onlyBuyers?: string[];        // Whitelist of buyer addresses
  };
  
  // Contact
  contactChannel: "whatsapp" | "telegram" | "discord";
  contactId: string;
  
  // Trust
  attestorUrl?: string;           // Seller's preferred attestor
  publicKeyForEncryption?: string; // For direct encrypted communication
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  policyVersion: number;
}
```

### Policy Evaluation (Seller Agent Logic)

```typescript
function evaluateSkillAgainstPolicy(skill: Skill, policy: SellerPolicy): boolean {
  // 1. Data source match
  if (!policy.dataSources.includes(skill.dataSource)) return false;
  
  // 2. Metrics allowed
  for (const metric of skill.metrics) {
    if (policy.deniedMetrics.includes(metric)) return false;
    if (policy.allowedMetrics.length > 0 && !policy.allowedMetrics.includes(metric)) return false;
  }
  
  // 3. Price acceptable
  if (skill.budget < policy.minPrice) return false;
  
  // 4. Row limit
  const estimatedRows = estimateRows(skill.duration, skill.dataSource);
  if (estimatedRows > policy.maxRowsPerRequest) return false;
  
  // 5. Concurrent task limit
  const activeTasks = countActiveTasks(policy.stellarAddress);
  if (activeTasks >= policy.maxConcurrentTasks) return false;
  
  return true;
}
```

## 5) Encrypted Delivery Model

- Buyer generates X25519 keypair. Public key stored in skill metadata on IPFS.
- Seller encrypts each data row with buyer's X25519 public key (NaCl box / age).
- Each batch includes: encrypted rows + ZK proofs (plaintext, for verification).
- Buyer decrypts with private key after verifying proofs.
- Nobody else (not the server, not IPFS, not even the seller after delivery) can read the data.

```
Encryption per row:
  plaintext = JSON.stringify(fitbitStepData)
  nonce = crypto.randomBytes(24)
  encrypted = nacl.box(plaintext, nonce, buyerPubKey, ephemeralSecretKey)
  
Batch payload:
  {
    rows: [
      { encrypted: base64(nonce + ciphertext), proof: ReclaimProof },
      ...
    ]
  }

Buyer decryption:
  for (row of batch.rows) {
    plaintext = nacl.box.open(row.encrypted, buyerPrivateKey)
    verify(row.proof) // ed25519 attestor signature
  }
```

## 6) Payment & Distribution

### x402 Micro-payments (per batch)
- Buyer sends USDC directly to seller on Stellar after each verified batch.
- Amount: `skill.budget / totalBatches` per batch.
- Memo: `x402:{escrowId}:{batchIndex}` for tracking.
- Seller agent watches for payment before sending next batch.

### Escrow (bulk protection)
- Buyer locks total budget in Soroban escrow at start.
- x402 micro-payments come from buyer's wallet (separate from escrow).
- Escrow holds the "completion bonus" — released after all batches delivered.
- Split: 70% seller / 20% platform / 10% dispute pool.

### MCP Creator Fee
- If skill uses a marketplace MCP standard, creator gets a fee.
- Deducted from platform's 20% share via `release_with_mcp_fee()`.
- Max: 2000 bps (20% of total = platform's full share).

## 7) On-Chain Data Keys (Stellar manage_data)

| Prefix | Format | Purpose |
|--------|--------|---------|
| `sk:` | `sk:{skillId}` → CID | Skill/task definition |
| `pr:` | `pr:{address}` → CID | Provider policy |
| `cs:` | `cs:{skillId}:{addr4}` → ACCEPT/REJECT | Consent record |
| `es:` | `es:{escrowId}` → CID | Escrow metadata |
| `pf:` | `pf:{proofHash}` → CID | Proof record |
| `bt:` | `bt:{escrowId}:{idx}` → CID | Batch delivery |
| `bp:` | `bp:{escrowId}:{idx}` → txHash | Batch payment confirmation |
| `mc:` | `mc:{mcpId}` → CID | MCP standard |
| `mv:` | `mv:{mcpId}` → volume | MCP usage volume |

All agents read these keys directly from Horizon RPC. No backend needed.

## 8) Frontend-Direct Read Pattern (Dashboard)

The web dashboard is optional but reads directly from chain:

```
Browser
  → Horizon RPC: loadAccount(platformAddress).data_attr
  → Parse prefixes: sk:, mc:, pf:, pr:, es:, bt:
  → IPFS gateway: GET /ipfs/{CID} for each entry
  → Display resolved data

No backend API call needed for any read operation.
```

Key functions in `lib/chain-reader.ts`:
- `readAndCategorize(address)` — Read + parse all manage_data
- `resolveIpfsBatch(entries)` — Batch IPFS resolution with timeout
- `readDashboardState(stellarAddress)` — Full dashboard state
- `readUserEscrows(stellarAddress)` — User's escrow entries
- `readUserProofs(stellarAddress)` — User's proof entries
- `readActiveSkills()` — All active skills
- `readMarketplaceMcps()` — MCP standards with volume data

## 9) ZK-TLS Verification

### Components

| Component | Role | Location |
|-----------|------|----------|
| **attestor-core** | TLS witness — observes API responses, signs claims | Self-hosted (port 8001) |
| **Reclaim SDK** | `zkFetch()` — routes requests through attestor | Seller Agent |
| **Buyer Agent** | `verifyDataProof()` — validates ed25519 sigs locally | Buyer's OpenClaw |
| **Soroban** | `set_proof()` — links aggregate proof hash on-chain | Stellar testnet |

### Why Data Cannot Be Forged

1. Attestor independently opens TLS connection to source API.
2. Seller never modifies what attestor signs.
3. Attestor signs `sha256(canonicalClaimData)` with ed25519 private key.
4. Buyer knows attestor's public key (from skill/policy or well-known list).
5. If signature doesn't match known attestor → proof rejected, no payment.

### Verification Modes

- **Production** (`ATTESTOR_PUBLIC_KEYS` known): Only proofs from trusted attestors accepted.
- **Development** (open): Any valid ed25519 signature accepted.

## 10) Server's Role (When Present)

The PDE server enhances the experience but is never required:

| Feature | Without Server | With Server |
|---------|---------------|-------------|
| Skill discovery | Agent polls Horizon SSE | Server pushes notifications via OpenClaw |
| Proof verification | Agent verifies locally | Server can also verify (double-check) |
| Escrow operations | Agent calls Soroban directly | Server can proxy with warm cache |
| Dashboard | chain-reader.ts reads Horizon | Server provides warm cache for speed |
| Dispute resolution | On-chain timeout refund | Server admin panel for manual resolution |
| Analytics | Not available | Server tracks usage, volume, trends |
| Provider matching | Agent scans all policies | Server pre-matches and notifies |

## 11) Status Summary

### Completed
- Soroban escrow contract (Rust, 5 tests passing)
- Frontend-first publish flow (IPFS + Stellar from browser)
- Frontend-direct reads (chain-reader.ts)
- Backend awareness-only notify model
- Real ed25519 ZK proof verification (@noble/curves)
- Feedback contract with CID history + ratings
- x402 middleware (OpenZeppelin Relayer)
- Per-user IPFS credentials support
- CID audit trail + platform mirror pinning
- Stellar wallet auth (Freighter)

### In Progress
- Agent-to-agent flow (buyer ↔ seller via OpenClaw)
- Row-by-row batch transfer protocol
- Seller policy model + auto-evaluation
- x402 micro-payments per batch

### Remaining for Production
- Deploy attestor-core for real ZK-TLS proofs
- Set ATTESTOR_PUBLIC_KEYS for attestor whitelist
- Deploy Soroban contracts to testnet
- Configure X402_API_KEY + STELLAR_PLATFORM_SECRET
- Dispute admin panel
- Phase 2: Device data (TEE + FHE)
