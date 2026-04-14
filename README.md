# Programmable Data Exchange (PDE)

> Agent-to-agent privacy-preserving data economy on Stellar testnet.
> The platform server is an **optional governance layer** — the system works without it.

---

## What Is This?

PDE is a protocol where **buyer agents** request specific data (Fitbit steps, Strava runs, Spotify history, bank transactions) and **seller agents** fulfill those requests — all orchestrated through OpenClaw bots on WhatsApp/Telegram/Discord.

The key innovations:
- **Agent-to-agent**: Users talk to their OpenClaw bot. Bots discover each other via on-chain data and execute data trades autonomously.
- **Zero-knowledge TLS proofs**: Verify data authenticity without exposing raw data.
- **Row-by-row delivery**: Large datasets are delivered incrementally with x402 micro-payment confirmation per batch.
- **Trustless by design**: Even a malicious server cannot steal funds, forge proofs, or read plaintext data. Everything critical lives on-chain or IPFS.

---

## Architecture Overview

```
 Buyer                                                           Seller
 (User on WhatsApp/Telegram/Discord)                             (User on WhatsApp/Telegram/Discord)
      │                                                               │
      ▼                                                               ▼
┌──────────────┐                                              ┌──────────────┐
│ Buyer Agent  │            Stellar Testnet                   │ Seller Agent │
│ (OpenClaw)   │◄══════════ + Soroban Contracts ══════════════│ (OpenClaw)   │
│              │            + IPFS (Pinata)                    │              │
│ - Create     │                                              │ - Policy on  │
│   skill/task │  ┌──────────────────────────────────────┐    │   IPFS       │
│ - Lock       │  │         On-Chain State               │    │ - Watch for  │
│   escrow     │  │  Skills, Policies, Consents,         │    │   matching   │
│ - Verify     │  │  Escrows, Proofs — ALL on Stellar    │    │   skills     │
│   proofs     │  │  + IPFS. Agents read directly.       │    │ - Generate   │
│ - Decrypt    │  └──────────────────────────────────────┘    │   ZK proofs  │
│   delivery   │                                              │ - Deliver    │
│              │                                              │   encrypted  │
└──────┬───────┘                                              └──────┬───────┘
       │                                                             │
       │         ┌─────────────────────────────────┐                 │
       └────────►│  PDE Server (Optional)          │◄────────────────┘
                 │                                  │
                 │  - Warm cache / discovery boost  │
                 │  - Dispute admin panel           │
                 │  - Analytics & monitoring        │
                 │  - Provider push notifications   │
                 │                                  │
                 │  ⚠ NOT required for:            │
                 │    - Reading chain/IPFS data     │
                 │    - Escrow lock/release         │
                 │    - Proof verification          │
                 │    - Data delivery               │
                 │    - Payment settlement          │
                 │                                  │
                 │  Even if this server is down,    │
                 │  malicious, or unresponsive —    │
                 │  agents transact directly.       │
                 └─────────────────────────────────┘
```

### Why the Server Can't Hurt You

| Threat | Protection |
|--------|-----------|
| Server steals funds | Escrow is a Soroban contract — only releases with valid proof hash. Server has no withdrawal key. |
| Server forges proofs | Proofs are ed25519 signed by independent attestor-core. Server doesn't have the attestor private key. |
| Server reads your data | Payload encrypted with buyer's X25519 public key. Server only relays ciphertext. |
| Server censors tasks | Skills and policies live on IPFS + Stellar. Agents read directly from Horizon + IPFS gateway. |
| Server goes down | Agents watch Stellar SSE streams directly. All state is on-chain. |
| Server refuses to release escrow | Escrow has `timeout_at` — after expiry, anyone can call `refund_if_expired()` on Soroban. |

### Design Principles

- **Agent-first**: Both buyer and seller interact through OpenClaw bots. Web UI is optional dashboard.
- **Chain as truth**: Skills, consents, escrows, proofs — all indexed on Stellar with IPFS CIDs.
- **Direct reads**: Agents read Horizon + IPFS directly. No backend in the read path.
- **Server = convenience**: The API provides warm cache, push notifications, and dispute admin. Not required for core flow.
- **Self-hosted attestor-core**: Independent TLS witness. Provider can't forge data, server can't forge proofs.
- **Encrypted delivery**: Buyer's `deliveryPublicKey` in skill metadata. Seller encrypts. Nobody else decrypts.
- **Contract-level payments**: Escrow release, splits, and MCP creator fees are all atomic Soroban operations.
- **Row-by-row transfer**: Large datasets delivered in batches with x402 micro-payment per batch and ZK proof per row.

---

## Actors

| Actor | Role | Interface |
|-------|------|-----------|
| **Buyer** | Requests data, locks USDC escrow, receives encrypted results | OpenClaw bot (WhatsApp/Telegram/Discord) or Web UI |
| **Seller / Provider** | Publishes data policy on IPFS, evaluates incoming requests, generates ZK proofs, delivers data | OpenClaw bot (WhatsApp/Telegram/Discord) |
| **MCP Creator** | Publishes reusable data extraction standards, earns per-use fees | Web UI (marketplace upload) |
| **PDE Server** | Optional governance: warm cache, dispute admin, analytics, push notifications | Hono API (apps/api) |
| **Attestor-Core** | Independent TLS witness — signs what it sees from source APIs | Self-hosted (port 8001) |
| **Stellar / Soroban** | On-chain escrow, consent recording, CID indexing, atomic payment distribution | Testnet |

---

## Agent-to-Agent Flow

### The Full Lifecycle

```
 Buyer Agent                Stellar + IPFS              Seller Agent              Attestor-Core
      │                          │                           │                         │
      │  1. Create skill         │                           │                         │
      │  + deliveryPubKey        │                           │                         │
      │  ───upload to IPFS──────►│                           │                         │
      │  ───index on Stellar────►│                           │                         │
      │                          │                           │                         │
      │                          │  2. SSE: new skill        │                         │
      │                          │  ─────────────────────────►                         │
      │                          │                           │                         │
      │                          │  3. Fetch skill from IPFS │                         │
      │                          │◄──────────────────────────│                         │
      │                          │                           │                         │
      │                          │  4. Evaluate: does skill  │                         │
      │                          │  match my policy?         │                         │
      │                          │  (price, data type, etc.) │                         │
      │                          │                           │                         │
      │                          │  5. ACCEPT → consent TX   │                         │
      │                          │◄──────────────────────────│                         │
      │                          │                           │                         │
      │  6. SSE: consent         │                           │                         │
      │◄─────────────────────────│                           │                         │
      │                          │                           │                         │
      │  7. Lock USDC in escrow  │                           │                         │
      │  (Soroban deposit)       │                           │                         │
      │  ────────────────────────►                           │                         │
      │                          │  8. SSE: escrow locked    │                         │
      │                          │  ─────────────────────────►                         │
      │                          │                           │                         │
      │                          │          ROW-BY-ROW TRANSFER                        │
      │                          │                           │                         │
      │                          │  9. For each data row:    │                         │
      │                          │     a. zkFetch(sourceAPI) │                         │
      │                          │     ─────────────────────────────────────────────────►
      │                          │                           │   TLS to source API     │
      │                          │                           │   Witness response       │
      │                          │                           │   Sign claim (ed25519)   │
      │                          │     ◄────────────────────────────────────────────────│
      │                          │                           │                         │
      │                          │     b. Encrypt row with   │                         │
      │                          │        buyer's pubkey     │                         │
      │                          │                           │                         │
      │                          │     c. Publish proof+row  │                         │
      │  10. Verify proof        │        to IPFS            │                         │
      │  (ed25519 sig check)     │◄──────────────────────────│                         │
      │◄─────────────────────────│                           │                         │
      │                          │                           │                         │
      │  11. x402 micro-payment  │                           │                         │
      │  for this batch          │                           │                         │
      │  ────────────────────────►                           │                         │
      │                          │  12. SSE: payment         │                         │
      │                          │  ─────────────────────────►                         │
      │                          │                           │                         │
      │                          │     ... repeat 9-12 for   │                         │
      │                          │     remaining rows ...    │                         │
      │                          │                           │                         │
      │  13. All rows received   │                           │                         │
      │  Final escrow release    │                           │                         │
      │  (Soroban release)       │                           │                         │
      │  ────────────────────────►                           │                         │
      │                          │  Atomic 3-way split:      │                         │
      │                          │  70% → Seller             │                         │
      │                          │  20% → Platform           │                         │
      │                          │  10% → Dispute pool       │                         │
      │                          │  + MCP creator fee        │                         │
      ▼                          ▼                           ▼                         ▼
```

### What Each Agent Does

**Buyer Agent (OpenClaw)**:
1. User tells bot: "I need Fitbit step data for the last 90 days"
2. Agent creates skill JSON with requirements + `deliveryPublicKey`
3. Agent uploads to IPFS, indexes CID on Stellar via agent's keypair
4. Agent watches Stellar SSE for consent from matching sellers
5. On consent → agent locks USDC in Soroban escrow
6. Agent receives encrypted data rows, verifies each proof locally (ed25519)
7. Agent sends x402 micro-payment per verified batch
8. After all rows → agent triggers escrow release
9. Agent decrypts full dataset with buyer's private key

**Seller Agent (OpenClaw)**:
1. User has registered as data provider with a **policy** on IPFS
2. Agent watches Stellar SSE for new skills matching its policy
3. On match → agent asks user for consent ("Accept this task for 1.50 USDC?")
4. User replies "evet" → agent writes consent TX to Stellar
5. Agent waits for escrow lock confirmation (SSE)
6. Agent calls source API via attestor-core → ZK-TLS proof per row
7. Agent encrypts each row with buyer's `deliveryPublicKey`
8. Agent publishes proof + encrypted row to IPFS
9. Agent waits for x402 payment per batch
10. After final payment → escrow releases automatically

---

## Row-by-Row Data Transfer Protocol

For large datasets (e.g., 100 rows of Fitbit data), PDE uses incremental delivery with mutual confirmation:

```
Batch Size: configurable (default 10 rows per batch)
Total: 100 rows → 10 batches

For each batch:
  1. Seller generates ZK-TLS proof for batch rows (attestor-core)
  2. Seller encrypts batch with buyer's deliveryPublicKey
  3. Seller publishes { proofCid, encryptedBatch, batchIndex, totalBatches } to IPFS
  4. Seller indexes batch CID on Stellar (manage_data: `bt:{escrowId}:{batchIndex}`)
  5. Buyer detects new batch (SSE), fetches from IPFS
  6. Buyer verifies ZK proof locally (ed25519 sig vs attestor pubkey)
  7. Buyer sends x402 micro-payment (batchPrice = totalPrice / totalBatches)
  8. Seller detects payment (SSE), proceeds to next batch

If buyer stops paying → seller stops delivering (no loss beyond current batch)
If seller stops delivering → buyer has partial data + proofs for dispute
After final batch → escrow release distributes remaining locked funds
```

---

## Payment Architecture (All on Stellar)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Escrow** | Soroban smart contract + USDC SAC | Lock funds, proof-gated 3-way atomic release |
| **x402 Micro-payments** | Stellar USDC transfers per batch | Row-by-row payment confirmation |
| **MCP Creator Fee** | Contract-level split in `release_with_mcp_fee` | Per-use royalty from platform share |
| **Spam Prevention** | x402 on proof submission (0.01 USDC) | Prevent garbage proof flooding |

All payments use **Stellar testnet USDC** — no Ethereum/Base involved.

---

## Data Types

| Type | Status | Verification |
|------|--------|--------------|
| **API Data** (Fitbit, Strava, Spotify, GitHub, bank APIs, etc.) | MVP | ZK-TLS via Reclaim Protocol (ed25519 witness signatures) |
| **Device Data** (sensors, GPS, camera) | Phase 2 | TEE + runtime attestation, future FHE |

Any source with a web API can be onboarded:
1. Does the source have a web API? (public or OAuth)
2. Can a Reclaim provider be written? (TLS session recordable)
3. Can the user grant access?

All three yes → source approved, listed on marketplace.

---

## Smart Contracts (Soroban / Rust)

### Escrow Contract (`contracts/escrow/`)
- `deposit()` — Lock USDC with timeout, creates escrow record
- `set_proof(proof_cid, proof_hash)` — Link ZK proof before release (platform or agent)
- `release()` — 3-way atomic split (requires proof_hash set)
- `release_with_mcp_fee()` — Release with MCP creator fee from platform share
- `dispute()` — Mark escrow as disputed
- `resolve_dispute(winner)` — Admin distributes funds to winner
- `refund()` — Return funds to depositor (blocked if proof already set)
- `refund_if_expired()` — Anyone can refund after timeout_at passes
- All state transitions emit Soroban events for agent SSE listeners

### Feedback Contract (`contracts/feedback/`)
- `register_mcp()` — Register MCP standard with IPFS hash
- `record_use()` — Track usage count
- `submit_rating()` — Attestation-signed ratings
- `update_mcp_cid()` — Update CID with full history
- `deactivate_mcp()` — Admin or creator can deactivate
- `get_cid_history()` — Historical CID versions

---

## Monorepo Structure

```
dataEconomy/
├── apps/
│   ├── web/                    Next.js 16 frontend (dashboard, optional)
│   │   └── src/
│   │       ├── app/            Pages: dashboard, escrow, proofs, marketplace...
│   │       ├── lib/
│   │       │   ├── chain-reader.ts  Direct Horizon + IPFS reads (no backend)
│   │       │   ├── auth.ts          Stellar wallet auth (NextAuth)
│   │       │   └── stellar.ts       TX builders
│   │       └── hooks/
│   │           └── useFreighter.ts  Wallet integration
│   └── api/                    Hono API (optional governance layer)
│       └── src/routes/
│           ├── auth.ts         Challenge-response Stellar wallet auth
│           ├── skills.ts       Skill CRUD (warm cache)
│           ├── notify.ts       Awareness endpoints + CID audit trail
│           ├── proofs.ts       Proof verification + escrow auto-release
│           ├── consent.ts      Consent recording + OpenClaw dispatch
│           ├── escrow.ts       Escrow operations (Soroban calls)
│           ├── provider.ts     Provider registration
│           ├── marketplace.ts  MCP listing + volume tracking
│           └── dashboard.ts    Aggregated stats
├── packages/
│   ├── stellar/                Horizon SSE + consent TX builders
│   ├── ipfs/                   Pinata upload/download
│   ├── reclaim/                zkFetch + ed25519 proof verification
│   └── storage/                Escrow adapter (Soroban) + warm cache
├── contracts/
│   ├── escrow/                 Soroban: deposit, set_proof, release, dispute, timeout
│   └── feedback/               Soroban: MCP registry, ratings, CID history
├── AGENT.md                    OpenClaw agent integration guide (buyer + seller)
├── FLOW.md                     End-to-end agent-to-agent flow
└── CLAUDE.md                   Project memory and architecture decisions
```

---

## Authentication

Agents authenticate via Stellar keypair — no passwords, no emails.

```
1. Agent (or web UI) presents Stellar public key (G... 56 chars)
2. GET /api/auth/challenge?address=G... → challenge string (5-min expiry)
3. Agent signs challenge with Stellar private key (ed25519)
4. POST /api/auth/verify → signature verification → stellarAddress returned
5. Session: { stellarAddress } — no personal data stored anywhere
```

For OpenClaw agents, this happens automatically using the agent's Stellar keypair.

---

## Quick Start

```bash
# Install dependencies
npm install

# Build shared packages
npm run build:packages

# Start both web + api in development
npm run dev
```

- **Web (Dashboard):** http://localhost:3000
- **API (Governance):** http://localhost:3001
- **Health check:** http://localhost:3001/health

### Environment Variables

```env
# Stellar
STELLAR_PLATFORM_PUBLIC=G...
STELLAR_PLATFORM_SECRET=S...

# IPFS (Pinata)
PINATA_JWT=eyJ...
PINATA_GATEWAY_URL=https://gateway.pinata.cloud

# Auth
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# x402
X402_FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
X402_API_KEY=...

# Soroban
SOROBAN_ESCROW_CONTRACT=C...

# ZK-TLS (production)
ATTESTOR_PUBLIC_KEYS=hex-pubkey1,hex-pubkey2
ATTESTOR_URL=http://localhost:8001
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Interface | OpenClaw (WhatsApp/Telegram/Discord) |
| Dashboard (optional) | Next.js 16, TypeScript, Tailwind CSS |
| Governance API (optional) | Hono (serverless on Vercel) |
| Blockchain | Stellar testnet + Soroban smart contracts (Rust) |
| ZK-TLS | Self-hosted `attestor-core` + Reclaim Protocol (`@reclaimprotocol/zk-fetch`) |
| ZK On-chain | Stellar Protocol 25 X-Ray (native BN254 + Poseidon) |
| IPFS | Pinata (per-user or platform keys) |
| Payments | x402 on Stellar (OpenZeppelin Relayer) + Soroban escrow |

---

## Agent-to-Agent API Surface (Row-by-Row + x402)

For direct bot-to-bot integration (without depending on web UI state), use these API endpoints:

| Endpoint | Purpose | x402 |
|---|---|---|
| `POST /api/proofs/submit` | Verify ZK proof, optionally register batch delivery (`batch` payload). | Required |
| `POST /api/proofs/batch/pay` | Buyer records micro-payment confirmation for a batch (`batchIndex`, `txHash`). | Required |
| `GET /api/proofs/batches/:escrowId` | Inspect delivered batches + confirmed payments to decide final release readiness. | Not required |

### Release Gate in Batch Mode

When `batch` is included in proof submission:
1. Proof is verified and indexed.
2. Batch CID metadata is indexed (`batch` entity).
3. Escrow release is deferred until **all batches are delivered AND all batch payments are confirmed**.

This keeps row-by-row delivery aligned with x402 economics in agent-to-agent mode.

---

## ZK-TLS Architecture

```
Seller Agent (OpenClaw)          Attestor-Core               Source API
      │                                │                        │
      │  1. zkFetch(apiUrl, token)     │                        │
      │ ──────────────────────────────►│                        │
      │                                │  2. Opens TLS conn     │
      │                                │ ─────────────────────►│
      │                                │  3. Witnesses response │
      │                                │ ◄─────────────────────│
      │                                │                        │
      │                                │  4. Signs claim        │
      │                                │  sha256(claimData)     │
      │                                │  with ed25519 key      │
      │                                │                        │
      │  5. Returns ReclaimProof       │                        │
      │ ◄──────────────────────────────│                        │
      │                                                         │
      │  6. Encrypts data with buyer's deliveryPublicKey        │
      │  7. Publishes proof + encPayload to IPFS                │
      │  8. Indexes batch CID on Stellar                        │
```

**Why can't the seller fake data?** The attestor independently opens a TLS connection to the source API and witnesses the raw response. The seller never modifies what the attestor signs.

**Why can't the server fake proofs?** The attestor's ed25519 private key lives only on the attestor server. The buyer verifies signatures against known attestor public keys.

---

## Deployment

Both apps deploy on **Vercel** (optional — agents work without them):

| Project | Type | URL |
|---------|------|-----|
| `pde_` | Web dashboard (Next.js) | Auto-deployed from `apps/web` |
| `programmable-data-exchange-pde-api` | Governance API (Hono) | Auto-deployed from `apps/api` |

---

## License

Private repository. All rights reserved.
