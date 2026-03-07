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
                   │ metadata │                   │ Consent TX   │
                   │ payloads │                   │ Escrow State │
                   └────▲─────┘                   └──────▲───────┘
                        │                                │
                        │  direct upload                 │  Freighter sign
                        │                                │
┌───────────────────────┴────────────────────────────────┴──────────────┐
│                         Frontend (Next.js)                            │
│  Buyer creates skill → uploads to IPFS → indexes on Stellar          │
│  Provider accepts task → signs consent TX → delivers proof            │
└───────────────────────┬──────────────────────────────────────────────┘
                        │  notify only (txHash, CID)
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Facilitator API (Hono)                             │
│  - Warm cache from Stellar                                           │
│  - x402 payment verification on proof submit                         │
│  - ZK proof validation (Reclaim Protocol)                            │
│  - Encrypted payload relay to buyer callback                         │
│  - Escrow release trigger (Soroban contract)                         │
│  ⚠ NEVER stores raw data — awareness & orchestration only            │
└──────────────────────────────────────────────────────────────────────┘
```

### Design Principles

- **Frontend-first data plane:** IPFS uploads and Stellar chain writes happen directly from the browser via Freighter wallet. The backend is never in the data path.
- **Backend = awareness only:** The API receives `notify` calls after the client has already written to IPFS + Stellar. It validates, caches, and orchestrates — nothing more.
- **Encrypted delivery:** Buyer's `deliveryPublicKey` is stored in skill metadata. The provider encrypts the payload with this key. The facilitator relays the ciphertext without ever seeing plaintext.
- **Contract-level payments:** Escrow release, provider/platform/dispute splits, and MCP creator fees are all handled atomically inside the Soroban smart contract.

---

## Actors

| Actor | Role |
|-------|------|
| **Buyer** | Creates a skill (data request), locks USDC in escrow, receives encrypted result via callback |
| **Seller / Provider** | Accepts tasks, generates ZK proofs via OpenClaw bot or web UI, delivers encrypted data |
| **MCP Creator** | Publishes reusable data extraction standards to the marketplace, earns per-use fees |
| **Facilitator (Platform)** | Verifies proofs, enforces x402 payments, relays encrypted payloads, triggers escrow release |
| **Stellar / Soroban** | On-chain escrow, consent recording, CID indexing, atomic payment distribution |

---

## End-to-End Flow

### Step-by-Step Walkthrough

```
 Buyer                    Platform                  Provider/OpenClaw
   │                         │                            │
   │  1. Create skill        │                            │
   │  (define what data      │                            │
   │   you want + policy)    │                            │
   ├────────────────────────►│                            │
   │                         │                            │
   │  2. Upload skill JSON   │                            │
   │  directly to IPFS       │                            │
   │  (Pinata HTTPS API)     │                            │
   │  ──── CID returned ───► │                            │
   │                         │                            │
   │  3. Index CID on        │                            │
   │  Stellar via Freighter   │                            │
   │  (manage_data TX)       │                            │
   │  ──── txHash ─────────► │                            │
   │                         │                            │
   │  4. POST /api/notify    │                            │
   │  {txHash, CID, address} │                            │
   │  (backend awareness)    │                            │
   │                         │  5. Dispatch task to       │
   │                         │  matching providers        │
   │                         ├───────────────────────────►│
   │                         │                            │
   │  6. Lock USDC in        │                            │
   │  Soroban escrow         │                            │
   │  contract               │                            │
   │                         │                            │
   │                         │  7. Provider accepts       │
   │                         │  (consent TX on Stellar)   │
   │                         │◄───────────────────────────┤
   │                         │                            │
   │                         │  8. Provider fetches data  │
   │                         │  from source API           │
   │                         │  (Fitbit, Strava, etc.)    │
   │                         │                            │
   │                         │  9. Generate ZK-TLS proof  │
   │                         │  via Reclaim Protocol      │
   │                         │  (proves data is authentic)│
   │                         │                            │
   │                         │  10. Encrypt payload with  │
   │                         │  buyer's deliveryPublicKey │
   │                         │                            │
   │                         │  11. POST /api/proofs/submit
   │                         │  {proof, encryptedPayload} │
   │                         │◄───────────────────────────┤
   │                         │                            │
   │                         │  12. Verify x402 payment   │
   │                         │  header (spam prevention)  │
   │                         │                            │
   │                         │  13. Validate ZK proof     │
   │                         │  (witness count, freshness,│
   │                         │   replay protection)       │
   │                         │                            │
   │  14. Forward encrypted  │                            │
   │  payload to buyer       │                            │
   │  callback URL           │                            │
   │◄────────────────────────┤                            │
   │                         │                            │
   │                         │  15. Escrow release        │
   │                         │  (Soroban contract call)   │
   │                         │  70% provider              │
   │                         │  20% platform              │
   │                         │  10% dispute reserve       │
   │                         │  + MCP creator fee (if any)│
   │                         │                            │
   │  16. Buyer decrypts     │                            │
   │  payload with private   │                            │
   │  key, verifies checksum │                            │
   ▼                         ▼                            ▼
```

### Detailed Phase Breakdown

#### Phase 1: Skill Creation & Publishing (Buyer)
1. Buyer fills out a skill form (data source, policy constraints, price, callback URL, delivery public key).
2. Skill JSON is uploaded **directly from the browser** to Pinata's IPFS API — returns a CID.
3. CID is indexed on Stellar using a `manage_data` operation signed by Freighter (`sk:<skillId>` → CID).
4. Frontend calls `POST /api/notify/skill` with `{ txHash, ipfsHash, stellarAddress }` so the backend becomes aware.
5. Backend verifies the TX on Horizon, caches the skill metadata, and dispatches notifications to matching providers.

#### Phase 2: Task Acceptance & Consent (Provider)
6. Provider sees the task (via web UI or OpenClaw bot on WhatsApp/Telegram/Discord).
7. Provider accepts — a consent transaction is written to Stellar with memo `CONSENT:<skillId>:<pseudoId>:ACCEPT`.
8. Buyer locks USDC into the Soroban escrow contract for the agreed amount.

#### Phase 3: Data Collection & Proof Generation (Provider/OpenClaw)
9. OpenClaw bot (or provider manually) fetches data from the source API (e.g., Fitbit REST API).
10. ZK-TLS proof is generated using Reclaim Protocol's `zkFetch` — this cryptographically proves the data came from the real API endpoint with a valid TLS session.
11. The data payload is encrypted using the buyer's `deliveryPublicKey` from the skill metadata. The facilitator **never** sees plaintext.

#### Phase 4: Proof Submission & Verification (Facilitator)
12. Provider submits to `POST /api/proofs/submit` with the proof and encrypted payload.
13. x402 middleware validates the Stellar USDC payment header (spam/abuse prevention via OpenZeppelin Relayer).
14. Facilitator runs proof verification: witness count, proof freshness (max age), provider signature match, replay protection (no duplicate submissions).
15. If valid, the encrypted payload is forwarded to the buyer's callback URL with integrity metadata (proofHash, checksum).

#### Phase 5: Payment & Settlement (Soroban Contract)
16. Escrow release is triggered atomically on Soroban:
    - **70%** → Provider (data seller)
    - **20%** → Platform (facilitator fee)
    - **10%** → Dispute reserve
    - If an MCP standard was used, the MCP creator gets an additional per-use fee from the `release_with_mcp_fee` function.
17. Buyer decrypts the payload with their private key and verifies the checksum.

---

## Payment Architecture (All on Stellar)

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Escrow** | Soroban smart contract + USDC SAC | Lock funds, 3-way atomic release |
| **x402** | OpenZeppelin Relayer x402 Plugin | Spam prevention on proof submission |
| **MCP Creator Fee** | Contract-level split in `release_with_mcp_fee` | Per-use royalty for standard creators |

All payments use **Stellar testnet USDC** — no Ethereum/Base involved.

---

## Data Types

| Type | Status | Verification |
|------|--------|--------------|
| **API Data** (Fitbit, Strava, Spotify, GitHub, bank APIs, etc.) | MVP | ZK-TLS via Reclaim Protocol (timestamped proofs) |
| **Device Data** (sensors, GPS, camera) | Phase 2 | TEE + runtime attestation, future FHE |

Any source with a web API can be onboarded through the provider approval process:
1. Does the source have a web API? (public or OAuth)
2. Can a Reclaim provider be written for it? (TLS session recordable)
3. Can the user grant access?

If all three are yes, the source is approved and listed on the marketplace.

---

## Monorepo Structure

```
dataEconomy/
├── apps/
│   ├── web/                    Next.js 16 frontend
│   │   └── src/app/
│   │       ├── (auth)/login    Stellar wallet login (Freighter)
│   │       ├── buy/            Data request creation
│   │       ├── sell/           Provider task fulfillment
│   │       ├── marketplace/    MCP listing, search, upload, rating
│   │       ├── skills/create/  Skill creation wizard
│   │       ├── tasks/          Pending tasks, accept/reject, status
│   │       ├── proofs/         Proof submission and verification status
│   │       ├── escrow/         Escrow lock/release/refund management
│   │       └── dashboard/      Earnings, active tasks, proof status
│   └── api/                    Hono facilitator API
│       └── src/routes/
│           ├── auth.ts         Challenge-response Stellar wallet auth
│           ├── skills.ts       Skill CRUD
│           ├── notify.ts       Awareness endpoints (post-chain-write)
│           ├── proofs.ts       Proof submit + x402 + verification
│           ├── consent.ts      Consent dispatch to OpenClaw
│           ├── escrow.ts       Escrow contract interactions
│           ├── provider.ts     Provider registration + listing
│           ├── marketplace.ts  MCP listing + on-chain volume
│           └── dashboard.ts    Aggregated stats
├── packages/
│   ├── stellar/                Horizon SSE + consent TX builders
│   ├── ipfs/                   Pinata upload/download
│   ├── reclaim/                zkFetch Fitbit/Strava + verifyProof
│   ├── pseudonym/              HMAC-based pseudo_id generation
│   └── storage/                Escrow adapter + cache layer
├── contracts/
│   ├── escrow/                 Soroban escrow (Rust): release, refund, dispute, MCP fee split
│   └── feedback/               Soroban feedback contract (Phase 2)
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

# IPFS (Pinata)
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
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, NextAuth v4 |
| Backend | Hono (serverless on Vercel) |
| Blockchain | Stellar testnet + Soroban smart contracts (Rust) |
| ZK-TLS | Reclaim Protocol (`@reclaimprotocol/zk-fetch`) |
| ZK On-chain | Stellar Protocol 25 X-Ray (native BN254 + Poseidon) |
| IPFS | Pinata (skill/MCP/policy JSON storage) |
| Payments | x402 on Stellar (OpenZeppelin Relayer) + Soroban escrow |
| Bot Gateway | OpenClaw (WhatsApp/Telegram/Discord) |

---

## Known Limitations

- ZK-TLS proofs are currently **simulated**. Production requires self-hosted `attestor-core` deployment. See [Critical Stage](#critical-stage-zk-tls) below.
- Web build may fail in CI/air-gapped environments due to Google Fonts dependency.
- Dispute/FHE arbitration is Phase 2 scope.

### Critical Stage: ZK-TLS

The Reclaim Protocol hosted system requires per-app `APP_ID` registration + mobile QR scanning, which doesn't fit our model (any web API, no per-source registration).

**Solution:** Self-hosted [`attestor-core`](https://github.com/reclaimprotocol/attestor-core) — standalone, no APP_ID needed, runs on port 8001 with just a private key.

```bash
git clone https://github.com/reclaimprotocol/attestor-core
cd attestor-core && npm install
echo "PRIVATE_KEY=<ed25519-key>" > .env
npm run start:tsc  # Runs on port 8001
```

Then point `packages/reclaim` zkFetch to your attestor URL instead of Reclaim's hosted service.

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
