# dataEconomy — FLOW
Last updated: 2026-03-09 (v2.0)

## 1) System Roles

- **Buyer (Data Requester):** Creates a skill or uses a marketplace MCP, initiates escrow lock.
- **Seller (Data Provider):** Accepts the task via consent TX (Freighter), fetches data and generates proof via OpenClaw.
- **MCP Creator:** Publishes reusable data extraction standards, earns per-use creator fees at contract level.
- **Facilitator (Platform API):** Orchestrates policy, payment verification, and delivery without touching raw data.
- **Stellar/Soroban:** On-chain index + consent + escrow state + atomic payment distribution + ZK verification.
- **IPFS (Pinata):** Skill/MCP/policy payload storage (per-user or platform keys).

## 2) Architecture Principle: Frontend-First dApp

**All reads go directly to Stellar Horizon + IPFS from the browser. No backend needed for reads.**

| Operation | Where it happens |
|-----------|-----------------|
| Publish (IPFS upload) | Frontend → Pinata HTTPS API |
| Chain write (CID index, consent) | Frontend → Freighter → Stellar |
| Chain read (manage_data, escrows) | Frontend → Horizon RPC (direct) |
| IPFS read (skill/MCP JSON) | Frontend → Pinata gateway (direct) |
| Notify backend (awareness) | Frontend → POST /api/notify |
| Escrow lock/release | Frontend → POST /api/escrow (needs platform keypair) |
| Proof submit + verify | Provider → POST /api/proofs/submit (x402 + ZK verify) |

**The backend is NOT in the read path.** Dashboard, escrow, proofs, tasks, marketplace — all read directly from Horizon + IPFS.

## 3) End-to-End Main Flow

### Phase 1: Skill Creation & Publishing (Buyer — Frontend-First)
1. Buyer fills out skill form (data source, metrics, policy, price, callback URL, delivery public key).
2. Frontend uploads skill JSON **directly to IPFS** via Pinata HTTPS API → CID returned.
3. Frontend indexes CID on Stellar via Freighter wallet (`manage_data` TX: `sk:<skillId>` → CID).
4. Frontend calls `POST /api/notify/skill` with `{ txHash, ipfsHash, stellarAddress }` (backend awareness only).
5. Backend verifies TX on Horizon, caches metadata, dispatches to matching providers.

### Phase 2: Task Discovery & Consent (Provider — Frontend-First)
6. Provider sees tasks by reading directly from Stellar Horizon + IPFS (no API needed).
7. Provider accepts — consent TX written to Stellar via Freighter from provider's browser.
8. Consent recorded via `POST /api/consent/record` (orchestration).

### Phase 3: Escrow Lock (Buyer — via API)
9. Buyer locks USDC into Soroban escrow contract via `POST /api/escrow/lock`.
   - Goes through API because Soroban `deposit()` requires the platform's keypair.
   - Contract records `timeout_at` for automatic expiry protection.

### Phase 4: Data Collection & Proof Generation (Provider/OpenClaw)
10. OpenClaw bot (or provider manually) fetches data from source API (e.g., Fitbit REST API).
11. ZK-TLS proof generated via Reclaim Protocol `zkFetch` — ed25519 witness signatures cryptographically prove TLS session authenticity.
12. Payload encrypted using buyer's `deliveryPublicKey` from skill metadata. Facilitator **never** sees plaintext.

### Phase 5: Proof Submission & Verification (Facilitator)
13. Provider submits to `POST /api/proofs/submit` with proof + encrypted payload.
14. x402 middleware validates Stellar USDC payment header (0.01 USDC spam fee via OpenZeppelin Relayer).
15. Facilitator runs proof verification: ed25519 witness signature validation, freshness check, replay protection.
16. Proof linked to escrow via `set_proof(proof_cid, proof_hash)` on Soroban contract — required before release.
17. Encrypted payload forwarded to buyer's callback URL with integrity metadata (proofHash, checksum).

### Phase 6: Payment & Settlement (Soroban Contract)
18. Escrow release triggered atomically on Soroban (requires proof_hash to be set):
    - **70%** → Provider (data seller)
    - **20%** → Platform (facilitator fee)
    - **10%** → Dispute reserve
    - MCP creator fee deducted from platform share via `release_with_mcp_fee` if applicable.
19. Buyer decrypts payload with private key, verifies checksum.

### Dispute & Safety
- **Dispute:** Either party can dispute a locked escrow. Contract marks it as disputed.
- **Resolution:** Admin resolves via `resolve_dispute()` — funds go to winner.
- **Timeout:** If no proof before `timeout_at`, anyone can call `refund_if_expired()`.
- **Proof gate:** Once `set_proof` is called, depositor can no longer self-refund (prevents race conditions).

## 4) Encrypted Delivery Model

- Skill metadata contains `deliveryPublicKey`.
- OpenClaw encrypts the payload with the buyer's public key.
- Facilitator only transports `encryptedPayload` + checksum (never sees plaintext).
- Buyer decrypts with their private key at the callback service.
- Integrity verification: `checksum` + `proofHash`.

## 5) Payment & Distribution

- Spam/abuse prevention: x402 payment header verification on proof submission (0.01 USDC).
- Escrow release: provider/platform/dispute shares distributed atomically in contract.
- For MCP-backed tasks, creator fee distributed at contract level via `release_with_mcp_fee`.
- All payments on Stellar testnet USDC — no Ethereum/Base involved.

## 6) Frontend-Direct Read Pattern

All data display pages read directly from blockchain + IPFS:

```
Browser
  → Horizon RPC: loadAccount(platformAddress).data_attr
  → Parse prefixes: sk:, mc:, pf:, pr:, es:, mv:
  → IPFS gateway: GET /ipfs/{CID} for each entry
  → Display resolved data

No backend API call needed for any read operation.
```

Key functions in `lib/chain-reader.ts`:
- `readAndCategorize(address)` — Read + parse all manage_data
- `resolveIpfsBatch(entries)` — Batch IPFS resolution with timeout
- `readDashboardState(pseudoId, address)` — Full dashboard state
- `readUserEscrows(pseudoId, address)` — User's escrow entries
- `readUserProofs(pseudoId)` — User's proof entries
- `readActiveSkills()` — All active skills
- `readMarketplaceMcps()` — MCP standards with volume data
- `readMcpById(id)` — Single MCP detail

## 7) Status Summary (MVP)

### Completed
- Frontend-first publish flow (IPFS + Stellar from browser).
- Frontend-direct reads (all pages read from Horizon + IPFS, not backend).
- Backend awareness-only `notify` model.
- Real ed25519 ZK proof verification (`@noble/curves`).
- Escrow contract with proof linkage, timeout, dispute resolution.
- Feedback contract with CID history, deactivation, attestation ratings.
- x402 middleware on proof submission (OpenZeppelin Relayer).
- Per-user IPFS credentials support.
- CID audit trail + platform mirror pinning.
- All API messages in English.

### Remaining for Production
- Deploy `attestor-core` for real ZK-TLS proof generation.
- Set `ATTESTOR_PUBLIC_KEYS` for production attestor whitelist.
- Deploy Soroban contracts to testnet.
- Configure `X402_API_KEY` and `STELLAR_PLATFORM_SECRET`.
- Full production-grade on-chain event stream automation.
- Dispute/FHE-based advanced arbitration model (Phase 2).
