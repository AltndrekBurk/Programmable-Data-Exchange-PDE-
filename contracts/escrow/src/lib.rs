#![no_std]

//! PDE Escrow Contract — v2  (row-by-row, batch-aware, agent-to-agent)
//!
//! # Architecture
//!
//! The original v1 contract had one critical design flaw: only the **platform**
//! could call `set_proof` and `release`. This made the server a required
//! intermediary and broke the "server-optional, trustless" guarantee.
//!
//! v2 fixes this by modelling the actual agent-to-agent flow:
//!
//! ```text
//! 1. Buyer calls  deposit()          — locks full USDC, declares N batches
//! 2. Seller calls deliver_batch()    — submits proof_cid + proof_hash per batch
//! 3. Buyer calls  pay_batch()        — verifies proof exists, triggers split
//!    └─ 70% → seller  20% → platform  10% → dispute pool  (MCP fee from platform share)
//! 4. Repeat 2-3 for every batch
//! 5. When all batches paid → escrow auto-finalizes (event: "settled")
//!
//! Abort path (buyer stops paying):
//!   buyer calls abort() → remaining_balance refunded to buyer
//!   (batches already paid to seller are NOT reversed)
//!
//! Timeout path (seller disappears):
//!   anyone calls refund_if_expired() after timeout_at
//!
//! Dispute path (proof looks wrong):
//!   depositor/seller/platform calls dispute_batch(index)
//!   admin calls resolve_batch(index, winner)
//! ```
//!
//! # Key properties
//! - Server-optional: deposit, deliver, pay, abort, refund all work
//!   without the PDE server. The server only helps with warm cache / push.
//! - Proof-gated: pay_batch panics if deliver_batch was not called first.
//! - Trustless: contract holds funds; only valid state transitions release them.
//! - Row-by-row: each batch is one atomic on-chain operation.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env, String,
};

// ─── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Singleton: admin address
    Admin,
    /// escrow_id → EscrowData
    Escrow(String),
    /// (escrow_id, batch_index) → BatchData
    Batch(String, u32),
}

// ─── Data structures ─────────────────────────────────────────────────────────

/// All state for one data-exchange agreement.
#[contracttype]
#[derive(Clone)]
pub struct EscrowData {
    /// Buyer — locks funds, calls pay_batch
    pub depositor: Address,
    /// Seller (provider) — calls deliver_batch
    pub seller: Address,
    /// Platform wallet — receives platform share
    pub platform: Address,
    /// Dispute pool wallet — receives dispute share
    pub dispute_wallet: Address,
    /// USDC SAC address
    pub token: Address,
    /// Full locked amount (deposited upfront)
    pub total_amount: i128,
    /// Number of row-batches agreed upon
    pub total_batches: u32,
    /// total_amount / total_batches — amount per pay_batch call
    pub per_batch_amount: i128,
    /// How many batches seller has delivered (proofs submitted)
    pub batches_delivered: u32,
    /// How many batches buyer has paid (splits executed)
    pub batches_paid: u32,
    /// USDC still held by this contract for this escrow
    pub remaining_balance: i128,
    /// On-chain reference to the skill IPFS CID
    pub skill_id: String,
    /// Buyer's X25519 public key (hex). Seller encrypts each batch payload
    /// with this key so nobody else can decrypt — not even the platform server.
    pub delivery_pubkey: String,
    /// Optional MCP creator address (zero = no MCP fee)
    pub mcp_creator: Address,
    /// Basis-points of total_amount deducted from platform share for MCP creator.
    /// Max 2000 (20%). 0 = no MCP fee.
    pub mcp_fee_bps: u32,
    /// Ledger timestamp when deposit was made
    pub created_at: u64,
    /// Ledger timestamp after which anyone can refund to depositor
    pub timeout_at: u64,
    /// True when all batches have been paid (or resolved via dispute)
    pub finalized: bool,
    /// True when buyer aborted or escrow expired
    pub aborted: bool,
}

/// Per-batch delivery + payment state.
#[contracttype]
#[derive(Clone)]
pub struct BatchData {
    pub index: u32,
    /// IPFS CID of { proof, encrypted_payload }
    pub proof_cid: String,
    /// SHA256 hex of canonical ZK-TLS claim data (set by seller)
    pub proof_hash: String,
    /// Ledger timestamp when seller submitted proof. 0 = not delivered.
    pub delivered_at: u64,
    /// Ledger timestamp when buyer paid. 0 = not paid.
    pub paid_at: u64,
    /// True if a party raised a dispute on this batch
    pub disputed: bool,
}

// ─── Constants ────────────────────────────────────────────────────────────────

/// 7 days — default escrow lifetime
const DEFAULT_TIMEOUT_SECS: u64 = 7 * 24 * 60 * 60;
/// Hard cap on batch count to limit storage growth
const MAX_BATCHES: u32 = 1_000;
/// MCP fee ceiling: 20% of total_amount
const MAX_MCP_FEE_BPS: u32 = 2_000;

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    /// Set the admin (platform) address once. Called immediately after deploy.
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    // =========================================================================
    // DEPOSIT — Buyer locks full escrow amount upfront
    // =========================================================================

    /// Lock USDC in escrow for a `total_batches`-batch job.
    ///
    /// `total_amount` must be divisible by `total_batches` so every batch
    /// has an identical per_batch_amount. This keeps payment logic simple and
    /// prevents rounding attacks.
    ///
    /// `delivery_pubkey` — buyer's X25519 public key (hex string). The seller
    /// uses this to encrypt each batch; neither the platform nor IPFS nodes
    /// can read plaintext data.
    ///
    /// `mcp_creator` — set to any address if a marketplace MCP standard is
    /// being used. If set, `mcp_fee_bps` basis points come out of the platform
    /// share on every pay_batch call.
    ///
    /// `timeout_secs` — pass 0 for default (7 days).
    pub fn deposit(
        env: Env,
        escrow_id: String,
        depositor: Address,
        seller: Address,
        platform: Address,
        dispute_wallet: Address,
        token: Address,
        total_amount: i128,
        total_batches: u32,
        skill_id: String,
        delivery_pubkey: String,
        mcp_creator: Address,
        mcp_fee_bps: u32,
        timeout_secs: u64,
    ) {
        depositor.require_auth();

        if total_amount <= 0 {
            panic!("amount must be positive");
        }
        if total_batches == 0 || total_batches > MAX_BATCHES {
            panic!("total_batches out of range [1, 1000]");
        }
        if total_amount % (total_batches as i128) != 0 {
            panic!("total_amount must be exactly divisible by total_batches");
        }
        if mcp_fee_bps > MAX_MCP_FEE_BPS {
            panic!("mcp_fee_bps exceeds maximum (2000 = 20%)");
        }
        if delivery_pubkey.len() == 0 {
            panic!("delivery_pubkey required");
        }

        let eff_timeout = if timeout_secs == 0 {
            DEFAULT_TIMEOUT_SECS
        } else {
            timeout_secs
        };
        if eff_timeout < 3_600 {
            panic!("timeout_secs must be at least 1 hour");
        }

        let key = DataKey::Escrow(escrow_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("escrow_id already exists");
        }

        // Transfer USDC from buyer into contract
        token::Client::new(&env, &token)
            .transfer(&depositor, &env.current_contract_address(), &total_amount);

        let per_batch_amount = total_amount / (total_batches as i128);
        let now = env.ledger().timestamp();

        let data = EscrowData {
            depositor,
            seller,
            platform,
            dispute_wallet,
            token,
            total_amount,
            total_batches,
            per_batch_amount,
            batches_delivered: 0,
            batches_paid: 0,
            remaining_balance: total_amount,
            skill_id,
            delivery_pubkey,
            mcp_creator,
            mcp_fee_bps,
            created_at: now,
            timeout_at: now + eff_timeout,
            finalized: false,
            aborted: false,
        };

        env.storage().persistent().set(&key, &data);
        env.storage().persistent().extend_ttl(&key, 6_307_200, 6_307_200);

        // Event: SSE listeners detect escrow lock
        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("locked")),
            escrow_id,
        );
    }

    // =========================================================================
    // DELIVER BATCH — Seller submits ZK-TLS proof for one batch
    // =========================================================================

    /// Seller calls this once per batch after:
    ///  1. Calling attestor-core zkFetch() on the source API
    ///  2. Encrypting the row data with depositor's delivery_pubkey
    ///  3. Publishing { proof, encrypted_payload } to IPFS
    ///
    /// `proof_cid`  — IPFS CID of the encrypted payload bundle
    /// `proof_hash` — sha256 hex of the canonical attestor claim JSON
    ///
    /// Buyer's agent verifies the proof off-chain (packages/reclaim verifyDataProof),
    /// then calls pay_batch. The contract does NOT verify ed25519 signatures
    /// on-chain (Soroban crypto for arbitrary keys requires pre-registration;
    /// the off-chain path is the designed verification route per FLOW.md).
    pub fn deliver_batch(
        env: Env,
        escrow_id: String,
        caller: Address,
        batch_index: u32,
        proof_cid: String,
        proof_hash: String,
    ) {
        caller.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted {
            panic!("escrow is closed");
        }
        if caller != escrow.seller {
            panic!("only seller may deliver a batch");
        }
        if batch_index >= escrow.total_batches {
            panic!("batch_index out of range");
        }
        if proof_hash.len() == 0 {
            panic!("proof_hash required");
        }
        if proof_cid.len() == 0 {
            panic!("proof_cid required");
        }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        // Guard: cannot re-deliver a batch
        if env.storage().persistent().has(&bk) {
            let existing: BatchData = env.storage().persistent().get(&bk).unwrap();
            if existing.delivered_at != 0 {
                panic!("batch already delivered");
            }
        }

        let now = env.ledger().timestamp();
        let batch = BatchData {
            index: batch_index,
            proof_cid,
            proof_hash,
            delivered_at: now,
            paid_at: 0,
            disputed: false,
        };
        env.storage().persistent().set(&bk, &batch);
        env.storage().persistent().extend_ttl(&bk, 6_307_200, 6_307_200);

        escrow.batches_delivered += 1;
        env.storage().persistent().set(&ek, &escrow);
        env.storage().persistent().extend_ttl(&ek, 6_307_200, 6_307_200);

        // Event: buyer agent detects via Horizon SSE and verifies proof
        env.events().publish(
            (symbol_short!("batch"), symbol_short!("deliverd")),
            (escrow_id, batch_index),
        );
    }

    // =========================================================================
    // PAY BATCH — Buyer confirms verified proof → atomic 3-way split
    // =========================================================================

    /// Buyer calls this after verifying the proof off-chain.
    ///
    /// Executes the x402-style micro-payment split for one batch:
    ///   seller_share  = per_batch * 70 / 100
    ///   platform_share = per_batch * 20 / 100  (minus MCP fee)
    ///   dispute_share  = per_batch - seller_share - platform_base
    ///   mcp_cut        = per_batch * mcp_fee_bps / 10000  (from platform_share)
    ///
    /// All four transfers are in one ledger operation — atomic by Stellar design.
    /// If all batches are now paid, the escrow auto-finalizes.
    pub fn pay_batch(
        env: Env,
        escrow_id: String,
        caller: Address,
        batch_index: u32,
    ) {
        caller.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted {
            panic!("escrow is closed");
        }
        if caller != escrow.depositor {
            panic!("only buyer (depositor) may pay a batch");
        }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        let mut batch: BatchData = env.storage().persistent()
            .get(&bk).expect("batch not found: seller must deliver_batch first");

        if batch.delivered_at == 0 {
            panic!("batch not delivered yet");
        }
        if batch.paid_at != 0 {
            panic!("batch already paid");
        }
        if batch.disputed {
            panic!("batch is under dispute; wait for admin resolve_batch");
        }

        // ── 3-way split ──────────────────────────────────────────────────────
        let per = escrow.per_batch_amount;

        let seller_share   = per * 70 / 100;
        let platform_base  = per * 20 / 100;
        let dispute_share  = per - seller_share - platform_base;  // = 10%
        let mcp_cut        = per * (escrow.mcp_fee_bps as i128) / 10_000;

        if mcp_cut > platform_base {
            panic!("mcp_cut exceeds platform share");
        }
        let platform_share = platform_base - mcp_cut;

        let ccid = env.current_contract_address();
        let tok = token::Client::new(&env, &escrow.token);

        tok.transfer(&ccid, &escrow.seller,         &seller_share);
        tok.transfer(&ccid, &escrow.platform,       &platform_share);
        tok.transfer(&ccid, &escrow.dispute_wallet, &dispute_share);
        if mcp_cut > 0 {
            tok.transfer(&ccid, &escrow.mcp_creator, &mcp_cut);
        }

        // ── State updates ────────────────────────────────────────────────────
        let now = env.ledger().timestamp();
        batch.paid_at = now;
        env.storage().persistent().set(&bk, &batch);
        env.storage().persistent().extend_ttl(&bk, 6_307_200, 6_307_200);

        escrow.batches_paid        += 1;
        escrow.remaining_balance   -= per;

        let all_done = escrow.batches_paid == escrow.total_batches;
        if all_done {
            escrow.finalized = true;
        }

        env.storage().persistent().set(&ek, &escrow);
        env.storage().persistent().extend_ttl(&ek, 6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("batch"), symbol_short!("paid")),
            (escrow_id.clone(), batch_index),
        );

        if all_done {
            env.events().publish(
                (symbol_short!("escrow"), symbol_short!("settled")),
                escrow_id,
            );
        }
    }

    // =========================================================================
    // ABORT — Buyer cancels mid-stream, refunds remaining balance
    // =========================================================================

    /// Buyer aborts the escrow at any time.
    ///
    /// All batches already paid to the seller are NOT reversed.
    /// Only the `remaining_balance` (undelivered/unpaid batches) goes back
    /// to the buyer. This enforces partial delivery fairness.
    pub fn abort(env: Env, escrow_id: String, caller: Address) {
        caller.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted {
            panic!("escrow is already closed");
        }
        if caller != escrow.depositor {
            panic!("only buyer (depositor) may abort");
        }

        let refund = escrow.remaining_balance;
        if refund > 0 {
            token::Client::new(&env, &escrow.token)
                .transfer(&env.current_contract_address(), &escrow.depositor, &refund);
        }

        escrow.remaining_balance = 0;
        escrow.aborted = true;
        env.storage().persistent().set(&ek, &escrow);
        env.storage().persistent().extend_ttl(&ek, 6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("aborted")),
            escrow_id,
        );
    }

    // =========================================================================
    // REFUND IF EXPIRED — anyone calls after timeout_at
    // =========================================================================

    /// After `timeout_at` passes, anyone can trigger a refund of
    /// `remaining_balance` back to the depositor.
    ///
    /// Paid batches stay with the seller. Only unearned balance returns.
    /// This is the "seller disappears" safety net — no admin needed.
    pub fn refund_if_expired(env: Env, escrow_id: String) {
        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted {
            panic!("escrow is already closed");
        }

        let now = env.ledger().timestamp();
        if now <= escrow.timeout_at {
            panic!("escrow has not expired yet");
        }

        let refund = escrow.remaining_balance;
        if refund > 0 {
            token::Client::new(&env, &escrow.token)
                .transfer(&env.current_contract_address(), &escrow.depositor, &refund);
        }

        escrow.remaining_balance = 0;
        escrow.aborted = true;
        env.storage().persistent().set(&ek, &escrow);
        env.storage().persistent().extend_ttl(&ek, 6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("expired")),
            escrow_id,
        );
    }

    // =========================================================================
    // DISPUTE — flag a single batch for admin review
    // =========================================================================

    /// Depositor, seller, or platform can dispute a delivered-but-not-yet-paid
    /// batch. Freezes that batch until admin calls resolve_batch.
    ///
    /// Use case: buyer's agent finds the ZK proof invalid or the encrypted
    /// payload doesn't decrypt correctly.
    pub fn dispute_batch(
        env: Env,
        escrow_id: String,
        caller: Address,
        batch_index: u32,
    ) {
        caller.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted {
            panic!("escrow is closed");
        }
        if caller != escrow.depositor
            && caller != escrow.seller
            && caller != escrow.platform
        {
            panic!("unauthorized: depositor/seller/platform only");
        }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        let mut batch: BatchData = env.storage().persistent()
            .get(&bk).expect("batch not found");

        if batch.paid_at != 0 {
            panic!("batch already paid; cannot dispute");
        }
        if batch.disputed {
            panic!("batch already under dispute");
        }

        batch.disputed = true;
        env.storage().persistent().set(&bk, &batch);
        env.storage().persistent().extend_ttl(&bk, 6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("batch"), symbol_short!("disputed")),
            (escrow_id, batch_index),
        );
    }

    // =========================================================================
    // RESOLVE BATCH DISPUTE — admin decides winner
    // =========================================================================

    /// Admin (platform) resolves a disputed batch by sending the full
    /// per_batch_amount to the winning party.
    ///
    /// `winner` must be either depositor or seller — enforced on-chain.
    /// No 3-way split on dispute resolution: winner gets the whole batch.
    pub fn resolve_batch(
        env: Env,
        escrow_id: String,
        batch_index: u32,
        winner: Address,
    ) {
        let admin: Address = env.storage().instance()
            .get(&DataKey::Admin).expect("not initialized");
        admin.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted {
            panic!("escrow is closed");
        }

        // Winner must be one of the two parties
        if winner != escrow.depositor && winner != escrow.seller {
            panic!("winner must be depositor or seller");
        }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        let mut batch: BatchData = env.storage().persistent()
            .get(&bk).expect("batch not found");

        if !batch.disputed {
            panic!("batch is not disputed");
        }
        if batch.paid_at != 0 {
            panic!("batch already paid");
        }

        // Full per_batch_amount goes to winner (no split on dispute)
        let per = escrow.per_batch_amount;
        token::Client::new(&env, &escrow.token)
            .transfer(&env.current_contract_address(), &winner, &per);

        let now = env.ledger().timestamp();
        batch.paid_at = now;
        batch.disputed = false;
        env.storage().persistent().set(&bk, &batch);
        env.storage().persistent().extend_ttl(&bk, 6_307_200, 6_307_200);

        escrow.batches_paid      += 1;
        escrow.remaining_balance -= per;

        let all_done = escrow.batches_paid == escrow.total_batches;
        if all_done {
            escrow.finalized = true;
        }

        env.storage().persistent().set(&ek, &escrow);
        env.storage().persistent().extend_ttl(&ek, 6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("batch"), symbol_short!("resolved")),
            (escrow_id.clone(), batch_index),
        );

        if all_done {
            env.events().publish(
                (symbol_short!("escrow"), symbol_short!("settled")),
                escrow_id,
            );
        }
    }

    // =========================================================================
    // READ-ONLY QUERIES
    // =========================================================================

    pub fn get_escrow(env: Env, escrow_id: String) -> EscrowData {
        env.storage().persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found")
    }

    pub fn get_batch(env: Env, escrow_id: String, batch_index: u32) -> BatchData {
        env.storage().persistent()
            .get(&DataKey::Batch(escrow_id, batch_index))
            .expect("batch not found")
    }

    /// Remaining USDC the contract still holds for this escrow.
    pub fn get_remaining(env: Env, escrow_id: String) -> i128 {
        let escrow: EscrowData = env.storage().persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found");
        escrow.remaining_balance
    }

    /// True if all batches paid (or escrow is finalized/aborted).
    pub fn is_finalized(env: Env, escrow_id: String) -> bool {
        let escrow: EscrowData = env.storage().persistent()
            .get(&DataKey::Escrow(escrow_id))
            .expect("escrow not found");
        escrow.finalized || escrow.aborted
    }
}

#[cfg(test)]
mod test;
