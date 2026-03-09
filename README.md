# Programmable Data Exchange (PDE)

> Privacy-preserving data economy infrastructure on Stellar testnet.
> The platform acts solely as a **facilitator** — it never touches, stores, or sees raw data.

---

## What Is This?

PDE is a marketplace where **data buyers** can request specific data (e.g., Fitbit steps, Strava runs, Spotify history) and **data providers** can fulfill those requests — all with cryptographic proof of authenticity and automatic payment via Stellar.

The key innovation: **zero-knowledge TLS proofs** verify that data actually came from the claimed source, while the facilitator platform never accesses the plaintext data.

---

## Architecture Overview

```
                   IPFS (Pinata)                  Stellar Testnet
                   ┌──────────┐                   ┌──────────────┐
                   │ Skill/MCP│                   │ CID Index    │
                   │ Provider │                   │ Consent TX   │
                   │ Policy   │                   │ Escrow State │
                   └────▲─────┘                   └──────▲───────┘
                        │                                │
                        │  direct upload                 │  Freighter sign
                        │  (user or platform key)        │
┌───────────────────────┴────────────────────────────────┴──────────────┐
│                         Frontend (Next.js)                            │
│  Buyer: skill create → IPFS upload → Stellar index → notify backend  │
│  Provider: accept task → consent TX (Freighter) → deliver proof      │
│  MCP Creator: standard upload → IPFS → Stellar index → notify        │
│  All reads: Horizon RPC + IPFS gateway (no backend in read path)     │
└───────────────────────┬──────────────────────────────────────────────┘
                        │  notify only (txHash, CID)
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Facilitator API (Hono)                             │
│  - Verify TX on Horizon, update warm cache                           │
│  - Dispatch tasks to matching providers (site + OpenClaw)            │
│  - x402 payment verification on proof submit (0.01 USDC spam fee)    │
│  - verifyDataProof(): ed25519 sig check vs ATTESTOR_PUBLIC_KEYS      │
│  - Encrypted payload relay to buyer callback                         │
│  - Escrow lock/release via Soroban contract (platform keypair)       │
│  - CID audit trail + platform mirror pinning                         │
│  ⚠ NEVER stores raw data — awareness & orchestration only            │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
    ┌──────────────────┴──────────────────────────────────────────────┐
    │                                                                  │
    ▼                                                                  ▼
┌──────────────────────────────┐    ┌─────────────────────────────────┐
│  Provider / OpenClaw Bot     │    │  Attestor-Core (self-hosted)    │
│                              │    │                                 │
│  - Accepts tasks via         │    │  - TLS witness on port 8001     │
│    consent TX (Freighter)    │    │  - Opens own TLS to source API  │
│  - Calls createApiProof()   │───>│  - Witnesses raw response       │
│    which uses zkFetch()      │    │  - Signs sha256(claimData)      │
│  - Encrypts payload with     │<───│    with ed25519 private key     │
│    buyer's deliveryPublicKey │    │  - Returns ReclaimProof         │
│  - Submits proof + payload   │    │  - NEVER stores raw data        │
│    to POST /api/proofs/submit│    │                                 │
└──────────────────────────────┘    └────────────────┬────────────────┘
                                                     │
                                                     │ TLS connection
                                                     ▼
                                    ┌─────────────────────────────────┐
                                    │  Source APIs                    │
                                    │  (Fitbit, Strava, Spotify,     │
                                    │   GitHub, bank APIs, etc.)     │
                                    └─────────────────────────────────┘
```

### Design Principles

- **Frontend-first dApp:** IPFS uploads and Stellar CID indexing happen directly from the browser via Freighter wallet. All reads go to Horizon RPC + IPFS gateway — backend is never in the read path.
- **Backend = awareness + orchestration:** The API receives `notify` calls after the client has already written to IPFS + Stellar. It validates on Horizon, caches, dispatches to providers, and orchestrates escrow/proof flows.
- **Self-hosted attestor-core:** The attestor independently opens TLS connections to source APIs and witnesses responses. The provider cannot forge data because the attestor signs what it sees — not what the provider claims.
- **Escrow via API:** Escrow lock/release operations go through the API because they require the platform's Soroban keypair. The Soroban contract handles atomic fund distribution.
- **Encrypted delivery:** Buyer's `deliveryPublicKey` is stored in skill metadata. The provider encrypts the payload with this key. The facilitator relays the ciphertext without ever seeing plaintext.
- **Contract-level payments:** Escrow release, provider/platform/dispute splits, and MCP creator fees are all handled atomically inside the Soroban smart contract.
- **Per-user IPFS:** Users can provide their own Pinata credentials or bring their own CID. Platform keys are used as fallback.

---

## Actors

| Actor | Role |
|-------|------|
| **Buyer** | Creates a skill (data request), locks USDC in escrow, receives encrypted result via callback |
| **Seller / Provider** | Accepts tasks via consent TX (Freighter), generates ZK proofs via OpenClaw bot or web UI, delivers encrypted data |
| **MCP Creator** | Publishes reusable data extraction standards to the marketplace, earns per-use fees at contract level |
| **Facilitator (Platform)** | Verifies proofs, enforces x402 payments, relays encrypted payloads, manages escrow via Soroban |
| **Stellar / Soroban** | On-chain escrow (with proof linkage + timeout), consent recording, CID indexing, atomic payment distribution |

---

## End-to-End Flow

### Step-by-Step Walkthrough

```
 Buyer                Platform API         Soroban Contract     Provider / Attestor
   │                       │                     │                       │
   │  ── 1. Create skill ──────────────────────────────────────────────────
   │  │  (data source, metrics, policy, deliveryPubKey)                │
   │                       │                     │                       │
   │  ── 2. Upload skill JSON to IPFS (Pinata) ──► CID returned         │
   │                       │                     │                       │
   │  ── 3. Index CID on Stellar (Freighter) ───► manage_data TX        │
   │                       │                     │                       │
   │  4. POST /notify      │                     │                       │
   │  {txHash, CID}        │                     │                       │
   ├──────────────────────►│                     │                       │
   │                       │  5. Dispatch task   │                       │
   │                       ├─────────────────────────────────────────────►
   │                       │                     │                       │
   │                       │                     │  6. Provider ACCEPTS  │
   │                       │                     │  consent TX written   │
   │                       │                     │  to Stellar           │
   │                       │                     │  (via Freighter)      │
   │                       │◄────────────────────────────────────────────┤
   │                       │                     │                       │
   │  7. Consent confirmed │                     │                       │
   │◄──────────────────────┤                     │                       │
   │                       │                     │                       │
   │  8. Lock USDC         │                     │                       │
   │  POST /escrow/lock    │                     │                       │
   ├──────────────────────►│                     │                       │
   │                       │  deposit()          │                       │
   │                       ├────────────────────►│                       │
   │                       │                     │  USDC locked          │
   │                       │                     │  timeout_at set       │
   │                       │◄────────────────────┤                       │
   │                       │                     │                       │
   │                       │                     │    9. createApiProof()│
   │                       │                     │    zkFetch() routes   │
   │                       │                     │    through attestor:  │
   │                       │                     │                       │
   │                       │                     │    Attestor──►Src API │
   │                       │                     │    (own TLS conn)     │
   │                       │                     │    Witnesses response │
   │                       │                     │    Signs sha256 hash  │
   │                       │                     │    ◄── ReclaimProof   │
   │                       │                     │                       │
   │                       │                     │   10. Encrypt payload │
   │                       │                     │   with buyer's        │
   │                       │                     │   deliveryPublicKey   │
   │                       │                     │                       │
   │                       │  11. POST /proofs/submit                   │
   │                       │  {proof, encPayload}│                      │
   │                       │◄────────────────────────────────────────────┤
   │                       │                     │                       │
   │                       │  12. x402 verify    │                       │
   │                       │  (0.01 USDC fee)    │                       │
   │                       │                     │                       │
   │                       │  13. verifyDataProof()                      │
   │                       │  sha256 → ed25519   │                       │
   │                       │  witnessKey check   │                       │
   │                       │  vs ATTESTOR_KEYS   │                       │
   │                       │  freshness + replay │                       │
   │                       │                     │                       │
   │                       │  14. set_proof()    │                       │
   │                       ├────────────────────►│                       │
   │                       │                     │  proof_cid + hash     │
   │                       │                     │  stored on-chain      │
   │                       │◄────────────────────┤                       │
   │                       │                     │                       │
   │  15. Encrypted        │                     │                       │
   │  payload delivered    │                     │                       │
   │  to buyer callback    │                     │                       │
   │◄──────────────────────┤                     │                       │
   │                       │                     │                       │
   │                       │  16. release()      │                       │
   │                       ├────────────────────►│                       │
   │                       │                     │  Atomic 3-way split:  │
   │                       │                     │  70% → Provider       │
   │                       │                     │  20% → Platform       │
   │                       │                     │  10% → Dispute pool   │
   │                       │                     │  + MCP creator fee    │
   │                       │◄────────────────────┤                       │
   │                       │                     │                       │
   │  17. Decrypt with     │                     │                       │
   │  private key,         │                     │                       │
   │  verify checksum      │                     │                       │
   ▼                       ▼                     ▼                       ▼
```

### Detailed Phase Breakdown

#### Phase 1: Skill Creation & Publishing (Buyer — Frontend-First)
1. Buyer fills out a skill form (data source, metrics, policy, price, callback URL, delivery public key).
2. Skill JSON is uploaded **directly from the browser** to Pinata's IPFS API — returns a CID.
3. CID is indexed on Stellar using a `manage_data` operation signed by Freighter (`sk:<skillId>` → CID).
4. Frontend calls `POST /api/notify/skill` with `{ txHash, ipfsHash, stellarAddress }` so the backend becomes aware.
5. Backend verifies the TX on Horizon, caches the skill metadata, and dispatches notifications to matching providers.

#### Phase 2: Task Acceptance & Consent (Provider — Frontend-First)
6. Provider sees the task (via web UI `/tasks` page or OpenClaw bot on WhatsApp/Telegram/Discord).
7. Provider accepts — a consent transaction is written to Stellar via Freighter from the provider's browser (`CONSENT:<skillId>:<pseudoId>:ACCEPT`). Platform notifies buyer that a provider has accepted.

#### Phase 3: Escrow Lock (Buyer — via API)
8. Buyer locks USDC into the Soroban escrow contract via `POST /api/escrow/lock`. This goes through the API because the Soroban `deposit()` call requires the platform's keypair. The contract records a `timeout_at` for automatic expiry protection.

#### Phase 4: Data Collection & ZK-TLS Proof Generation (Provider/OpenClaw)
9. Provider calls `createApiProof()` which internally uses Reclaim's `zkFetch()`.
10. `zkFetch()` routes the request through **self-hosted attestor-core** (TLS witness):
    - Attestor opens its **own TLS connection** to the source API (e.g., Fitbit REST API).
    - Attestor witnesses the raw response — provider cannot modify what the attestor sees.
    - Attestor computes `sha256(canonicalClaimData)` and signs it with its ed25519 private key.
    - Returns `ReclaimProof` with `{ claimData, signatures[], witnesses[] }`.
11. Provider encrypts the data payload using the buyer's `deliveryPublicKey` from skill metadata. The facilitator **never** sees plaintext.

#### Phase 5: Proof Submission & Verification (Facilitator)
12. Provider submits to `POST /api/proofs/submit` with the proof and encrypted payload.
13. x402 middleware validates the Stellar USDC payment header (0.01 USDC spam fee via OpenZeppelin Relayer).
14. Facilitator calls `verifyDataProof()`:
    - Canonical JSON serialization of `claimData` → `sha256` hash.
    - `ed25519.verify(signature, hash, witnessPublicKey)` for each witness.
    - If `ATTESTOR_PUBLIC_KEYS` env is set (production): require at least one signature from a known attestor. Unknown attestor signatures are rejected.
    - If not set (dev mode): accept any valid ed25519 signature.
    - Freshness check: proof timestamp must be within ±7 days.
    - Replay protection: same `proofHash` cannot be submitted twice. Same provider cannot submit within replay window.
15. Proof is linked to escrow via `set_proof(proof_cid, proof_hash)` on the Soroban contract — this is required before release.
16. If valid, the encrypted payload is forwarded to the buyer's callback URL with integrity metadata (proofHash, checksum).

#### Phase 6: Payment & Settlement (Soroban Contract)
17. Escrow release triggered atomically on Soroban (requires proof_hash to be set):
    - **70%** → Provider (data seller)
    - **20%** → Platform (facilitator fee)
    - **10%** → Dispute reserve
    - If an MCP standard was used, the MCP creator gets a fee from the platform share via `release_with_mcp_fee`.
18. Buyer decrypts the payload with their private key and verifies the checksum.

#### Dispute & Safety Mechanisms
- **Dispute:** Either party can dispute a locked escrow via `POST /api/escrow/dispute`. The Soroban contract marks it as disputed.
- **Resolution:** Admin resolves disputes via `resolve_dispute()` — distributes funds to winner.
- **Timeout:** If no proof is submitted before `timeout_at`, anyone can call `refund_if_expired()` to return funds to the buyer.
- **Refund protection:** Once a proof is linked (`set_proof`), the depositor can no longer refund — prevents race conditions.

---

## Payment Architecture (All on Stellar)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Escrow** | Soroban smart contract + USDC SAC | Lock funds, proof-gated 3-way atomic release |
| **x402** | OpenZeppelin Relayer x402 Plugin | 0.01 USDC spam prevention on proof submission |
| **MCP Creator Fee** | Contract-level split in `release_with_mcp_fee` | Per-use royalty from platform share |

All payments use **Stellar testnet USDC** — no Ethereum/Base involved.

---

## Data Types

| Type | Status | Verification |
|------|--------|--------------|
| **API Data** (Fitbit, Strava, Spotify, GitHub, bank APIs, etc.) | MVP | ZK-TLS via Reclaim Protocol (ed25519 witness signatures) |
| **Device Data** (sensors, GPS, camera) | Phase 2 | TEE + runtime attestation, future FHE |

Any source with a web API can be onboarded through the provider approval process:
1. Does the source have a web API? (public or OAuth)
2. Can a Reclaim provider be written for it? (TLS session recordable)
3. Can the user grant access?

If all three are yes, the source is approved and listed on the marketplace.

---

## Smart Contracts (Soroban / Rust)

### Escrow Contract (`contracts/escrow/`)
- `deposit()` — Lock USDC with timeout, creates escrow record
- `set_proof(proof_cid, proof_hash)` — Link ZK proof before release (platform only)
- `release()` — 3-way atomic split (requires proof_hash set)
- `release_with_mcp_fee()` — Release with MCP creator fee deducted from platform share
- `dispute()` — Mark escrow as disputed
- `resolve_dispute(winner)` — Admin distributes funds to winner
- `refund()` — Return funds to depositor (blocked if proof already set)
- `refund_if_expired()` — Anyone can refund after timeout_at passes
- All state transitions emit Soroban events for indexing

### Feedback Contract (`contracts/feedback/`)
- `register_mcp()` — Register MCP standard with IPFS hash
- `record_use()` — Track usage count (checks active status)
- `submit_rating()` — Attestation-signed ratings
- `update_mcp_cid()` — Update CID with full history tracking
- `deactivate_mcp()` — Admin or creator can deactivate
- `get_cid_history()` — Query historical CID versions

---

## Monorepo Structure

```
dataEconomy/
├── apps/
│   ├── web/                    Next.js 16 frontend
│   │   └── src/app/
│   │       ├── (auth)/login    Stellar wallet login (Freighter)
│   │       ├── buy/            Data request + MCP creation
│   │       ├── sell/           Provider registration + policy config
│   │       ├── marketplace/    MCP listing, search, upload, rating
│   │       ├── skills/create/  Skill creation wizard (frontend-first)
│   │       ├── tasks/          Task list, accept/reject (consent TX)
│   │       ├── proofs/         Proof submission and verification status
│   │       ├── escrow/         Escrow lock/release/refund management
│   │       └── dashboard/      Earnings, escrow events, proof status
│   └── api/                    Hono facilitator API
│       └── src/routes/
│           ├── auth.ts         Challenge-response Stellar wallet auth
│           ├── skills.ts       Skill CRUD
│           ├── notify.ts       Awareness endpoints + CID audit trail
│           ├── proofs.ts       Proof submit + x402 + ZK verification
│           ├── consent.ts      Consent recording + OpenClaw dispatch
│           ├── escrow.ts       Escrow lock/release/refund (Soroban)
│           ├── provider.ts     Provider registration + listing
│           ├── marketplace.ts  MCP listing + on-chain volume tracking
│           └── dashboard.ts    Aggregated stats
├── packages/
│   ├── stellar/                Horizon SSE + consent TX builders
│   ├── ipfs/                   Pinata upload/download (per-user support)
│   ├── reclaim/                zkFetch + real ed25519 proof verification
│   ├── pseudonym/              HMAC-based pseudo_id generation
│   └── storage/                Escrow adapter (Soroban) + cache layer
├── contracts/
│   ├── escrow/                 Soroban: deposit, set_proof, release, dispute, timeout
│   └── feedback/               Soroban: MCP registry, ratings, CID history
├── AGENT.md                    OpenClaw bot production runbook
├── FLOW.md                     End-to-end operation flow
└── CLAUDE.md                   Project memory and architecture decisions
```

---

## Authentication Flow

```
1. User clicks "Connect with Freighter" → Freighter extension opens
2. Public key retrieved (G... 56 characters)
3. GET /api/auth/challenge?address=G... → challenge string (5-min expiry)
4. Freighter signs the challenge (signMessage)
5. NextAuth credentials: { publicKey, signature, challenge }
6. POST /api/auth/verify → Ed25519 verification → pseudoId generated
7. Session: { stellarAddress, pseudoId } — real identity is never stored
```

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

- **Web:** http://localhost:3000
- **API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

### Environment Variables

Create a `.env.local` at the project root:

```env
# Stellar
STELLAR_PLATFORM_PUBLIC=G...
STELLAR_PLATFORM_SECRET=S...

# IPFS (Pinata) — platform fallback keys
PINATA_JWT=eyJ...
PINATA_GATEWAY_URL=https://gateway.pinata.cloud
NEXT_PUBLIC_PINATA_API_KEY=...
NEXT_PUBLIC_PINATA_API_SECRET=...

# Auth
NEXTAUTH_SECRET=your-secret
NEXTAUTH_URL=http://localhost:3000

# x402
X402_FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
X402_API_KEY=...

# Soroban
SOROBAN_ESCROW_CONTRACT=CAAP...

# ZK-TLS (production)
ATTESTOR_PUBLIC_KEYS=hex-pubkey1,hex-pubkey2
ATTESTOR_URL=http://localhost:8001

# Pseudonym
PSEUDONYM_SECRET=your-hmac-secret
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, NextAuth v4 |
| Backend | Hono (serverless on Vercel) |
| Blockchain | Stellar testnet + Soroban smart contracts (Rust) |
| ZK-TLS | Self-hosted `attestor-core` + Reclaim Protocol (`@reclaimprotocol/zk-fetch`) + ed25519 verification (`@noble/curves`) |
| ZK On-chain | Stellar Protocol 25 X-Ray (native BN254 + Poseidon) |
| IPFS | Pinata (per-user or platform keys) |
| Payments | x402 on Stellar (OpenZeppelin Relayer) + Soroban escrow |
| Bot Gateway | OpenClaw (WhatsApp/Telegram/Discord) |

---

## Production Readiness

### Completed
- Frontend-first publish flow (IPFS + Stellar from browser)
- Backend awareness-only model (notify + cache + orchestrate)
- Real ed25519 ZK proof verification (`@noble/curves`)
- Escrow contract with proof linkage, timeout, dispute resolution
- Feedback contract with CID history, deactivation, attestation ratings
- x402 payment middleware (OpenZeppelin Relayer)
- Per-user IPFS credentials support
- CID audit trail on notify endpoints
- Platform mirror pinning (backup)
- All API messages in English

### Remaining for Production
- Deploy `attestor-core` for real ZK-TLS proof generation
- Set `ATTESTOR_PUBLIC_KEYS` for production attestor whitelist
- Deploy Soroban escrow contract to testnet (`SOROBAN_ESCROW_CONTRACT`)
- Obtain `X402_API_KEY` from OpenZeppelin
- Configure `STELLAR_PLATFORM_SECRET` for escrow operations

### ZK-TLS Architecture

ZK-TLS (Zero-Knowledge TLS) proves that data came from a real API endpoint without exposing raw data. Three components work together:

```
Provider/OpenClaw                  Attestor-Core                    Source API
      │                                 │                              │
      │  1. zkFetch(apiUrl, token)      │                              │
      │ ───────────────────────────────>│                              │
      │                                 │  2. Opens TLS to source      │
      │                                 │ ────────────────────────────>│
      │                                 │  3. Witnesses the response   │
      │                                 │ <────────────────────────────│
      │                                 │                              │
      │                                 │  4. Signs claim with ed25519 │
      │                                 │     (URL + response hash     │
      │                                 │      + timestamp)            │
      │                                 │                              │
      │  5. Returns ReclaimProof        │                              │
      │     { claimData, signatures,    │                              │
      │       witnesses[] }             │                              │
      │ <───────────────────────────────│                              │
      │                                                                │
      │  6. POST /api/proofs/submit ──────────> Platform API           │
      │     (proof + encrypted payload)          │                     │
      │                                          │ 7. verifyDataProof()│
      │                                          │   ed25519 sig ✓     │
      │                                          │   attestor pubkey ✓ │
      │                                          │   timestamp fresh ✓ │
      │                                          │   replay check ✓    │
```

| Component | Role | Where |
|-----------|------|-------|
| **Attestor-core** | TLS witness — observes API response, signs claim with ed25519 | Self-hosted server (port 8001) |
| **Reclaim SDK** | `zkFetch()` — routes API call through attestor, produces proof | Provider side (OpenClaw/bot) |
| **Platform API** | `verifyDataProof()` — validates ed25519 signatures against known attestor keys | `packages/reclaim/src/index.ts` |
| **Soroban Contract** | `set_proof(proof_cid, proof_hash)` — links proof to escrow on-chain | Stellar testnet |

**Why can't the seller fake data?** The attestor independently opens a TLS connection to the source API and witnesses the raw response. The seller never gets to modify what the attestor signs.

**Self-hosted attestor-core** — no APP_ID needed, standalone, any web API:

```bash
git clone https://github.com/reclaimprotocol/attestor-core
cd attestor-core && npm install
echo "PRIVATE_KEY=<ed25519-private-key-hex>" > .env
npm run start:tsc  # Runs on port 8001
```

Then set in your platform `.env`:
```env
ATTESTOR_URL=http://your-server:8001
ATTESTOR_PUBLIC_KEYS=<attestor-ed25519-public-key-hex>
```

**Health check:** `GET /health` on the API returns attestor connectivity status.

---

## Deployment

Both apps are deployed on **Vercel**:

| Project | Type | URL |
|---------|------|-----|
| `pde_` | Web frontend (Next.js) | Auto-deployed from `apps/web` |
| `programmable-data-exchange-pde-api` | API (Hono serverless) | Auto-deployed from `apps/api` |

The API uses the `api/` directory convention with `hono/vercel` handler for serverless function deployment.

---

## License

Private repository. All rights reserved.
