#![no_std]

//! PDE Escrow Contract — v2  (row-by-row, batch-aware, agent-to-agent)
//!
//! # Flow
//!
//! ```text
//! 1. Admin calls  initialize(admin, platform, dispute_wallet) — one-time setup
//! 2. Buyer calls  deposit(escrow_id, seller, token, amount, batches, skill_id,
//!                         delivery_pubkey, timeout_secs)            — locks USDC
//! 3. Buyer calls  set_mcp_fee(escrow_id, mcp_creator, mcp_fee_bps) — optional
//! 4. Seller calls deliver_batch(escrow_id, batch_index, proof_cid, proof_hash)
//! 5. Buyer calls  pay_batch(escrow_id, batch_index)
//!    └─ 70% → seller  20% → platform  10% → dispute pool  (MCP fee from platform share)
//! 6. Repeat 4-5 for every batch
//! 7. When all batches paid → escrow auto-finalizes (event: "settled")
//!
//! Abort:   buyer calls abort()            → remaining_balance refunded
//! Timeout: anyone calls refund_if_expired → remaining_balance refunded
//! Dispute: dispute_batch() + resolve_batch(winner)
//! ```

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token, Address, Env, String,
};

// ─── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Platform,
    DisputeWallet,
    Escrow(String),
    Batch(String, u32),
}

// ─── Data structures ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub struct EscrowData {
    pub depositor: Address,
    pub seller: Address,
    pub token: Address,
    pub total_amount: i128,
    pub total_batches: u32,
    pub per_batch_amount: i128,
    pub batches_delivered: u32,
    pub batches_paid: u32,
    pub remaining_balance: i128,
    pub skill_id: String,
    pub delivery_pubkey: String,
    pub mcp_creator: Address,
    pub mcp_fee_bps: u32,
    pub created_at: u64,
    pub timeout_at: u64,
    pub finalized: bool,
    pub aborted: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct BatchData {
    pub index: u32,
    pub proof_cid: String,
    pub proof_hash: String,
    pub delivered_at: u64,
    pub paid_at: u64,
    pub disputed: bool,
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_SECS: u64 = 7 * 24 * 60 * 60;
const MAX_BATCHES: u32 = 1_000;
const MAX_MCP_FEE_BPS: u32 = 2_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn get_platform(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Platform).expect("not initialized")
}

fn get_dispute_wallet(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::DisputeWallet).expect("not initialized")
}

fn get_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).expect("not initialized")
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {

    // =========================================================================
    // INITIALIZE — one-time setup
    // =========================================================================

    /// Set admin, platform wallet, and dispute pool wallet.
    /// Called once immediately after deploy.
    pub fn initialize(
        env: Env,
        admin: Address,
        platform: Address,
        dispute_wallet: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Platform, &platform);
        env.storage().instance().set(&DataKey::DisputeWallet, &dispute_wallet);
        env.storage().instance().extend_ttl(6_307_200, 6_307_200);
    }

    // =========================================================================
    // DEPOSIT — Buyer locks USDC (max 9 params for Soroban limit of 10)
    // =========================================================================

    /// Lock USDC for a `total_batches`-batch data exchange job.
    ///
    /// `total_amount` must be divisible by `total_batches`.
    /// `delivery_pubkey` — buyer's X25519 hex key (seller encrypts with this).
    /// `timeout_secs` — pass 0 for default (7 days).
    ///
    /// MCP fee is optional — call `set_mcp_fee()` after deposit if needed.
    pub fn deposit(
        env: Env,
        escrow_id: String,
        depositor: Address,
        seller: Address,
        token: Address,
        total_amount: i128,
        total_batches: u32,
        skill_id: String,
        delivery_pubkey: String,
        timeout_secs: u64,
    ) {
        depositor.require_auth();

        if total_amount <= 0 { panic!("amount must be positive"); }
        if total_batches == 0 || total_batches > MAX_BATCHES {
            panic!("total_batches out of range [1, 1000]");
        }
        if total_amount % (total_batches as i128) != 0 {
            panic!("total_amount must be exactly divisible by total_batches");
        }
        if delivery_pubkey.len() == 0 { panic!("delivery_pubkey required"); }

        let eff_timeout = if timeout_secs == 0 { DEFAULT_TIMEOUT_SECS } else { timeout_secs };
        if eff_timeout < 3_600 { panic!("timeout_secs must be at least 1 hour"); }

        let key = DataKey::Escrow(escrow_id.clone());
        if env.storage().persistent().has(&key) { panic!("escrow_id already exists"); }

        token::Client::new(&env, &token)
            .transfer(&depositor, &env.current_contract_address(), &total_amount);

        let per_batch_amount = total_amount / (total_batches as i128);
        let now = env.ledger().timestamp();

        // mcp_creator defaults to depositor (placeholder), mcp_fee_bps = 0.
        // Buyer can call set_mcp_fee() before any pay_batch to override.
        let data = EscrowData {
            depositor: depositor.clone(),
            seller,
            token,
            total_amount,
            total_batches,
            per_batch_amount,
            batches_delivered: 0,
            batches_paid: 0,
            remaining_balance: total_amount,
            skill_id,
            delivery_pubkey,
            mcp_creator: depositor,
            mcp_fee_bps: 0,
            created_at: now,
            timeout_at: now + eff_timeout,
            finalized: false,
            aborted: false,
        };

        env.storage().persistent().set(&key, &data);
        env.storage().persistent().extend_ttl(&key, 6_307_200, 6_307_200);
        env.storage().instance().extend_ttl(6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("escrow"), symbol_short!("locked")),
            escrow_id,
        );
    }

    // =========================================================================
    // SET MCP FEE — optional, call after deposit before first pay_batch
    // =========================================================================

    /// Set MCP creator address and fee (basis points from platform share).
    /// Can only be called by the depositor (buyer) before any batch is paid.
    pub fn set_mcp_fee(
        env: Env,
        escrow_id: String,
        caller: Address,
        mcp_creator: Address,
        mcp_fee_bps: u32,
    ) {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env.storage().persistent()
            .get(&key).expect("escrow not found");

        if caller != data.depositor { panic!("only depositor can set MCP fee"); }
        if data.batches_paid > 0 { panic!("cannot change MCP fee after payments started"); }
        if mcp_fee_bps > MAX_MCP_FEE_BPS { panic!("mcp_fee_bps exceeds max (2000)"); }

        data.mcp_creator = mcp_creator;
        data.mcp_fee_bps = mcp_fee_bps;
        env.storage().persistent().set(&key, &data);
        env.storage().persistent().extend_ttl(&key, 6_307_200, 6_307_200);
    }

    // =========================================================================
    // DELIVER BATCH — Seller submits ZK-TLS proof for one batch
    // =========================================================================

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

        if escrow.finalized || escrow.aborted { panic!("escrow is closed"); }
        if caller != escrow.seller { panic!("only seller may deliver a batch"); }
        if batch_index >= escrow.total_batches { panic!("batch_index out of range"); }
        if proof_hash.len() == 0 { panic!("proof_hash required"); }
        if proof_cid.len() == 0 { panic!("proof_cid required"); }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        if env.storage().persistent().has(&bk) {
            let existing: BatchData = env.storage().persistent().get(&bk).unwrap();
            if existing.delivered_at != 0 { panic!("batch already delivered"); }
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

        env.events().publish(
            (symbol_short!("batch"), symbol_short!("deliverd")),
            (escrow_id, batch_index),
        );
    }

    // =========================================================================
    // PAY BATCH — Buyer confirms proof → atomic 3-way split
    // =========================================================================

    /// 70% seller / 20% platform / 10% dispute pool.
    /// MCP fee deducted from platform share if set.
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

        if escrow.finalized || escrow.aborted { panic!("escrow is closed"); }
        if caller != escrow.depositor { panic!("only buyer (depositor) may pay a batch"); }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        let mut batch: BatchData = env.storage().persistent()
            .get(&bk).expect("batch not found: seller must deliver_batch first");

        if batch.delivered_at == 0 { panic!("batch not delivered yet"); }
        if batch.paid_at != 0 { panic!("batch already paid"); }
        if batch.disputed { panic!("batch is under dispute"); }

        let platform = get_platform(&env);
        let dispute_wallet = get_dispute_wallet(&env);

        let per = escrow.per_batch_amount;
        let seller_share  = per * 70 / 100;
        let platform_base = per * 20 / 100;
        let dispute_share = per - seller_share - platform_base;
        let mcp_cut       = per * (escrow.mcp_fee_bps as i128) / 10_000;
        if mcp_cut > platform_base { panic!("mcp_cut exceeds platform share"); }
        let platform_share = platform_base - mcp_cut;

        let ccid = env.current_contract_address();
        let tok = token::Client::new(&env, &escrow.token);

        tok.transfer(&ccid, &escrow.seller,  &seller_share);
        tok.transfer(&ccid, &platform,       &platform_share);
        tok.transfer(&ccid, &dispute_wallet, &dispute_share);
        if mcp_cut > 0 {
            tok.transfer(&ccid, &escrow.mcp_creator, &mcp_cut);
        }

        let now = env.ledger().timestamp();
        batch.paid_at = now;
        env.storage().persistent().set(&bk, &batch);
        env.storage().persistent().extend_ttl(&bk, 6_307_200, 6_307_200);

        escrow.batches_paid      += 1;
        escrow.remaining_balance -= per;

        let all_done = escrow.batches_paid == escrow.total_batches;
        if all_done { escrow.finalized = true; }

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
    // ABORT — Buyer cancels mid-stream
    // =========================================================================

    pub fn abort(env: Env, escrow_id: String, caller: Address) {
        caller.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted { panic!("escrow is already closed"); }
        if caller != escrow.depositor { panic!("only buyer (depositor) may abort"); }

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
    // REFUND IF EXPIRED
    // =========================================================================

    pub fn refund_if_expired(env: Env, escrow_id: String) {
        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted { panic!("escrow is already closed"); }

        let now = env.ledger().timestamp();
        if now <= escrow.timeout_at { panic!("escrow has not expired yet"); }

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
    // DISPUTE BATCH
    // =========================================================================

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

        if escrow.finalized || escrow.aborted { panic!("escrow is closed"); }

        let platform = get_platform(&env);
        if caller != escrow.depositor && caller != escrow.seller && caller != platform {
            panic!("unauthorized: depositor/seller/platform only");
        }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        let mut batch: BatchData = env.storage().persistent()
            .get(&bk).expect("batch not found");

        if batch.paid_at != 0 { panic!("batch already paid; cannot dispute"); }
        if batch.disputed { panic!("batch already under dispute"); }

        batch.disputed = true;
        env.storage().persistent().set(&bk, &batch);
        env.storage().persistent().extend_ttl(&bk, 6_307_200, 6_307_200);

        env.events().publish(
            (symbol_short!("batch"), symbol_short!("disputed")),
            (escrow_id, batch_index),
        );
    }

    // =========================================================================
    // RESOLVE BATCH DISPUTE
    // =========================================================================

    pub fn resolve_batch(
        env: Env,
        escrow_id: String,
        batch_index: u32,
        winner: Address,
    ) {
        let admin = get_admin(&env);
        admin.require_auth();

        let ek = DataKey::Escrow(escrow_id.clone());
        let mut escrow: EscrowData = env.storage().persistent()
            .get(&ek).expect("escrow not found");

        if escrow.finalized || escrow.aborted { panic!("escrow is closed"); }
        if winner != escrow.depositor && winner != escrow.seller {
            panic!("winner must be depositor or seller");
        }

        let bk = DataKey::Batch(escrow_id.clone(), batch_index);
        let mut batch: BatchData = env.storage().persistent()
            .get(&bk).expect("batch not found");

        if !batch.disputed { panic!("batch is not disputed"); }
        if batch.paid_at != 0 { panic!("batch already paid"); }

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
        if all_done { escrow.finalized = true; }

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
    // QUERIES
    // =========================================================================

    pub fn get_escrow(env: Env, escrow_id: String) -> EscrowData {
        env.storage().persistent()
            .get(&DataKey::Escrow(escrow_id)).expect("escrow not found")
    }

    pub fn get_batch(env: Env, escrow_id: String, batch_index: u32) -> BatchData {
        env.storage().persistent()
            .get(&DataKey::Batch(escrow_id, batch_index)).expect("batch not found")
    }

    pub fn get_remaining(env: Env, escrow_id: String) -> i128 {
        let e: EscrowData = env.storage().persistent()
            .get(&DataKey::Escrow(escrow_id)).expect("escrow not found");
        e.remaining_balance
    }

    pub fn is_finalized(env: Env, escrow_id: String) -> bool {
        let e: EscrowData = env.storage().persistent()
            .get(&DataKey::Escrow(escrow_id)).expect("escrow not found");
        e.finalized || e.aborted
    }
}

#[cfg(test)]
mod test;
