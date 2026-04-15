#![cfg(test)]

//! Integration tests for PDE Escrow Contract v2 (row-by-row, batch-aware).
//!
//! Coverage:
//!   1. Full happy-path:  deposit → deliver_batch × N → pay_batch × N → finalized
//!   2. Partial delivery: deposit → deliver 2/3 → pay 2/3 → abort → refund
//!   3. Timeout expiry:   deposit → time passes → refund_if_expired
//!   4. Dispute resolve:  deposit → deliver → dispute → resolve(winner=seller)
//!   5. MCP fee split:    pay_batch with mcp_fee_bps > 0 distributes correctly
//!   6. Guard rails:      duplicate deposit, wrong caller, double-pay, indivisible amount

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Env, String,
};

// ─── Test harness ─────────────────────────────────────────────────────────────

struct Ctx {
    env:          Env,
    contract_id:  Address,
    admin:        Address,
    buyer:        Address,
    seller:       Address,
    platform:     Address,
    dispute:      Address,
    mcp:          Address,
    usdc:         Address,
}

impl Ctx {
    fn setup() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin         = Address::generate(&env);
        let buyer         = Address::generate(&env);
        let seller        = Address::generate(&env);
        let platform      = Address::generate(&env);
        let dispute       = Address::generate(&env);
        let mcp           = Address::generate(&env);

        let contract_id = env.register(EscrowContract, ());
        EscrowContractClient::new(&env, &contract_id).initialize(&admin);

        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();

        Ctx { env, contract_id, admin, buyer, seller, platform, dispute, mcp, usdc }
    }

    fn c(&self) -> EscrowContractClient { EscrowContractClient::new(&self.env, &self.contract_id) }
    fn tok(&self) -> TokenClient { TokenClient::new(&self.env, &self.usdc) }
    fn tok_admin(&self) -> StellarAssetClient { StellarAssetClient::new(&self.env, &self.usdc) }

    fn mint(&self, amount: i128) { self.tok_admin().mint(&self.buyer, &amount); }

    fn s(&self, v: &str) -> String { String::from_str(&self.env, v) }

    /// Standard deposit. timeout_secs=0 uses default (7 days).
    fn deposit(&self, id: &str, total: i128, batches: u32, timeout: u64) -> String {
        let eid = self.s(id);
        self.c().deposit(
            &eid,
            &self.buyer, &self.seller, &self.platform, &self.dispute,
            &self.usdc, &total, &batches,
            &self.s("skill-x"),
            &self.s("a1b2c3d4e5f6deadbeef0000"),
            &self.mcp,
            &0u32,
            &timeout,
        );
        eid
    }

    /// Deposit with custom mcp_fee_bps.
    fn deposit_mcp(&self, id: &str, total: i128, batches: u32, bps: u32) -> String {
        let eid = self.s(id);
        self.c().deposit(
            &eid,
            &self.buyer, &self.seller, &self.platform, &self.dispute,
            &self.usdc, &total, &batches,
            &self.s("skill-mcp"),
            &self.s("pubkey-deadbeef"),
            &self.mcp,
            &bps,
            &0u32,
        );
        eid
    }

    fn deliver(&self, eid: &String, idx: u32) {
        self.c().deliver_batch(
            eid, &self.seller, &idx,
            &self.s(&format!("bafy-cid-{}", idx)),
            &self.s(&format!("proof-hash-{:04x}", idx)),
        );
    }

    fn pay(&self, eid: &String, idx: u32) {
        self.c().pay_batch(eid, &self.buyer, &idx);
    }

    fn advance_time(&self, secs: u64) {
        self.env.ledger().set(LedgerInfo {
            timestamp:           self.env.ledger().timestamp() + secs,
            protocol_version:    22,
            sequence_number:     self.env.ledger().sequence() + 100,
            network_id:          Default::default(),
            base_reserve:        5_000_000,
            min_temp_entry_ttl:  1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl:       100_000,
        });
    }
}

// ─── 1. Full happy-path ───────────────────────────────────────────────────────

#[test]
fn happy_path_three_batches() {
    let ctx = Ctx::setup();
    let total: i128 = 3_000_000; // 0.3 USDC (7 decimals)
    let batches: u32 = 3;

    ctx.mint(total);
    let eid = ctx.deposit("esc-happy", total, batches, 0);

    assert_eq!(ctx.tok().balance(&ctx.contract_id), total);

    for i in 0..batches {
        ctx.deliver(&eid, i);
        ctx.pay(&eid, i);

        let b = ctx.c().get_batch(&eid, &i);
        assert_ne!(b.delivered_at, 0, "batch {} must show delivered", i);
        assert_ne!(b.paid_at,      0, "batch {} must show paid", i);
    }

    let e = ctx.c().get_escrow(&eid);
    assert!(e.finalized,          "escrow must be finalized");
    assert!(!e.aborted,           "escrow must not be aborted");
    assert_eq!(e.remaining_balance, 0, "contract must hold zero");

    // 70 / 20 / 10 split
    assert_eq!(ctx.tok().balance(&ctx.seller),   total * 70 / 100);
    assert_eq!(ctx.tok().balance(&ctx.platform),  total * 20 / 100);
    let dispute_expected = total - total * 70 / 100 - total * 20 / 100;
    assert_eq!(ctx.tok().balance(&ctx.dispute),  dispute_expected);
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 2. Abort mid-stream ──────────────────────────────────────────────────────

#[test]
fn abort_mid_stream_refunds_remainder() {
    let ctx = Ctx::setup();
    let total: i128 = 3_000_000;
    let batches: u32 = 3;
    let per = total / batches as i128;

    ctx.mint(total);
    let eid = ctx.deposit("esc-abort", total, batches, 0);

    // Pay first 2 batches
    for i in 0..2 {
        ctx.deliver(&eid, i);
        ctx.pay(&eid, i);
    }

    // Buyer aborts → gets remaining 1 batch back
    ctx.c().abort(&eid, &ctx.buyer);

    let e = ctx.c().get_escrow(&eid);
    assert!(e.aborted);
    assert_eq!(e.remaining_balance, 0);

    // Seller: 70% of 2 paid batches
    assert_eq!(ctx.tok().balance(&ctx.seller), per * 2 * 70 / 100);
    // Buyer: refund of 1 batch
    assert_eq!(ctx.tok().balance(&ctx.buyer), per);
    // Contract: empty
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 3. Timeout → refund_if_expired ──────────────────────────────────────────

#[test]
fn timeout_refund_returns_full_balance() {
    let ctx = Ctx::setup();
    let total: i128 = 1_000_000;

    ctx.mint(total);
    let eid = ctx.deposit("esc-timeout", total, 1, 3_600); // 1h timeout

    ctx.advance_time(3_601); // past timeout

    ctx.c().refund_if_expired(&eid);

    let e = ctx.c().get_escrow(&eid);
    assert!(e.aborted);
    assert_eq!(ctx.tok().balance(&ctx.buyer), total);
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 4. Dispute + resolve ─────────────────────────────────────────────────────

#[test]
fn dispute_batch_resolve_seller_wins() {
    let ctx = Ctx::setup();
    let total: i128 = 2_000_000;
    let batches: u32 = 2;
    let per = total / batches as i128;

    ctx.mint(total);
    let eid = ctx.deposit("esc-dispute", total, batches, 0);

    // Seller delivers batch 0, buyer disputes it
    ctx.deliver(&eid, 0);
    ctx.c().dispute_batch(&eid, &ctx.buyer, &0);

    let b0 = ctx.c().get_batch(&eid, &0);
    assert!(b0.disputed);

    // Admin resolves in seller's favour → seller gets full per_batch
    ctx.c().resolve_batch(&eid, &0, &ctx.seller);

    let b0r = ctx.c().get_batch(&eid, &0);
    assert!(!b0r.disputed);
    assert_ne!(b0r.paid_at, 0);
    assert_eq!(ctx.tok().balance(&ctx.seller), per);

    // Normal delivery of batch 1
    ctx.deliver(&eid, 1);
    ctx.pay(&eid, 1);

    let e = ctx.c().get_escrow(&eid);
    assert!(e.finalized);
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

#[test]
fn dispute_batch_resolve_buyer_wins() {
    let ctx = Ctx::setup();
    let total: i128 = 1_000_000;

    ctx.mint(total);
    let eid = ctx.deposit("esc-disp-b", total, 1, 0);

    ctx.deliver(&eid, 0);
    ctx.c().dispute_batch(&eid, &ctx.buyer, &0);
    // Admin sends batch amount to buyer (proof was bad)
    ctx.c().resolve_batch(&eid, &0, &ctx.buyer);

    let e = ctx.c().get_escrow(&eid);
    assert!(e.finalized);
    assert_eq!(ctx.tok().balance(&ctx.buyer), total);
    assert_eq!(ctx.tok().balance(&ctx.seller), 0);
}

// ─── 5. MCP fee split ─────────────────────────────────────────────────────────

#[test]
fn mcp_fee_split_correct() {
    let ctx = Ctx::setup();
    let total: i128 = 1_000_000; // 0.1 USDC
    let bps: u32 = 500; // 5%

    ctx.mint(total);
    let eid = ctx.deposit_mcp("esc-mcp", total, 1, bps);

    ctx.deliver(&eid, 0);
    ctx.pay(&eid, 0);

    let per            = total;
    let seller_share   = per * 70 / 100;
    let platform_base  = per * 20 / 100;
    let dispute_share  = per - seller_share - platform_base;
    let mcp_cut        = per * (bps as i128) / 10_000;
    let platform_net   = platform_base - mcp_cut;

    assert_eq!(ctx.tok().balance(&ctx.seller),   seller_share,  "seller share");
    assert_eq!(ctx.tok().balance(&ctx.platform),  platform_net,  "platform net");
    assert_eq!(ctx.tok().balance(&ctx.dispute),  dispute_share, "dispute share");
    assert_eq!(ctx.tok().balance(&ctx.mcp),       mcp_cut,       "mcp cut");
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 6. Guard rails ───────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "escrow_id already exists")]
fn duplicate_deposit_panics() {
    let ctx = Ctx::setup();
    ctx.mint(2_000_000);
    ctx.deposit("esc-dup", 1_000_000, 1, 0);
    ctx.deposit("esc-dup", 1_000_000, 1, 0);
}

#[test]
#[should_panic(expected = "only seller may deliver")]
fn wrong_deliver_caller_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc1", 1_000_000, 1, 0);
    // Buyer (not seller) tries to deliver
    ctx.c().deliver_batch(
        &eid, &ctx.buyer, &0,
        &ctx.s("bafy-x"), &ctx.s("hash-x"),
    );
}

#[test]
#[should_panic(expected = "only buyer (depositor) may pay")]
fn wrong_pay_caller_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc2", 1_000_000, 1, 0);
    ctx.deliver(&eid, 0);
    // Seller tries to pay — must panic
    ctx.c().pay_batch(&eid, &ctx.seller, &0);
}

#[test]
#[should_panic(expected = "batch already paid")]
fn double_pay_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc3", 1_000_000, 1, 0);
    ctx.deliver(&eid, 0);
    ctx.pay(&eid, 0);
    ctx.pay(&eid, 0); // second pay must panic
}

#[test]
#[should_panic(expected = "batch not found")]
fn pay_without_deliver_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc4", 1_000_000, 1, 0);
    ctx.pay(&eid, 0); // no deliver first
}

#[test]
#[should_panic(expected = "total_amount must be exactly divisible by total_batches")]
fn indivisible_amount_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_010_000);
    ctx.deposit("esc-gc5", 1_010_000, 3, 0); // 101 not divisible by 3
}

#[test]
#[should_panic(expected = "escrow has not expired")]
fn premature_refund_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    ctx.deposit("esc-gc6", 1_000_000, 1, 0);
    ctx.c().refund_if_expired(&ctx.s("esc-gc6"));
}

#[test]
#[should_panic(expected = "escrow is already closed")]
fn abort_after_finalize_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc7", 1_000_000, 1, 0);
    ctx.deliver(&eid, 0);
    ctx.pay(&eid, 0); // finalized
    ctx.c().abort(&eid, &ctx.buyer);
}
