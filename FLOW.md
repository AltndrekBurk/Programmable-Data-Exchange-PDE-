# dataEconomy — FLOW
Last updated: 2026-03-06 (v1.2)

## 1) System Roles

- **Buyer (Data Requester):** Creates a skill or uses a marketplace MCP, initiates escrow lock.
- **Seller (Data Provider):** Accepts the task, fetches data and generates proof via OpenClaw.
- **MCP Creator:** Publishes reusable data extraction standards, earns per-use creator fees.
- **Facilitator (Platform API):** Orchestrates policy, payment verification, and delivery without touching raw data.
- **Stellar/Soroban:** On-chain index + consent + escrow state + atomic payment distribution.
- **IPFS (Pinata):** Skill/MCP/policy payload storage.

## 2) End-to-End Main Flow

1. Buyer fills out skill/policy form in the frontend.
2. Frontend uploads payload to IPFS via Pinata HTTPS API, receives a CID.
3. Frontend writes CID index to Stellar via Freighter wallet.
4. Frontend notifies backend with `POST /api/notify` containing `txHash/cid/address`.
5. Seller (via UI or OpenClaw) fetches tasks from API; falls back to chain+IPFS if API is unavailable.
6. When the seller accepts, a consent transaction is written to Stellar.
7. Buyer initiates escrow lock via the Soroban contract.
8. OpenClaw collects data, generates ZK-TLS proof, and prepares encrypted payload.
9. `POST /api/proofs/submit` passes through x402 middleware for payment verification.
10. Facilitator runs proof/policy checks, forwards `encryptedPayload` to buyer's callback URL.
11. Escrow release is executed via Soroban contract call; MCP creator split is distributed at contract level if applicable.

## 3) Encrypted Delivery Model

- Skill metadata contains `deliveryPublicKey`.
- OpenClaw encrypts the payload with the buyer's public key.
- Facilitator only transports `encryptedPayload` + checksum (never sees plaintext).
- Buyer decrypts with their private key at the callback service.
- Integrity verification: `checksum` + `proofHash`.

## 4) Payment & Distribution

- Spam/abuse prevention: x402 payment header verification on proof submission.
- Escrow release: provider/platform/dispute shares are distributed atomically in the contract.
- For MCP-backed tasks, creator fee is also distributed at contract level via `release_with_mcp_fee`.

## 5) Status Summary (MVP)

### Completed
- Frontend direct IPFS upload and direct chain indexing.
- Backend facilitator-awareness `notify` model.
- x402 middleware on proof submission.
- MCP creator split support in escrow contract.
- Delivery key metadata transport and encrypted relay pipeline.

### In Progress / Phase 2
- Full production-grade on-chain event stream automation (especially bot orchestration expansion).
- ZK-TLS attestor infrastructure migration to real production pipeline.
- Dispute/FHE-based advanced arbitration model.
