#![cfg(test)]

extern crate alloc;

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

        // Set ledger timestamp > 0 so delivered_at / paid_at sentinel (0) works.
        env.ledger().set(LedgerInfo {
            timestamp:                1_000_000,
            protocol_version:         22,
            sequence_number:          100,
            network_id:               Default::default(),
            base_reserve:             5_000_000,
            min_temp_entry_ttl:       1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl:            10_000_000,
        });

        let admin    = Address::generate(&env);
        let buyer    = Address::generate(&env);
        let seller   = Address::generate(&env);
        let platform = Address::generate(&env);
        let dispute  = Address::generate(&env);
        let mcp      = Address::generate(&env);

        let contract_id = env.register(EscrowContract, ());
        EscrowContractClient::new(&env, &contract_id)
            .initialize(&admin, &platform, &dispute);

        let usdc = env.register_stellar_asset_contract_v2(admin.clone()).address();

        Ctx { env, contract_id, admin, buyer, seller, platform, dispute, mcp, usdc }
    }

    fn c(&self) -> EscrowContractClient {
        EscrowContractClient::new(&self.env, &self.contract_id)
    }
    fn tok(&self) -> TokenClient { TokenClient::new(&self.env, &self.usdc) }
    fn tok_admin(&self) -> StellarAssetClient { StellarAssetClient::new(&self.env, &self.usdc) }

    fn mint(&self, amount: i128) { self.tok_admin().mint(&self.buyer, &amount); }
    fn s(&self, v: &str) -> String { String::from_str(&self.env, v) }

    fn deposit(&self, id: &str, total: i128, batches: u32, timeout: u64) -> String {
        let eid = self.s(id);
        self.c().deposit(
            &eid,
            &self.buyer,
            &self.seller,
            &self.usdc,
            &total,
            &batches,
            &self.s("skill-x"),
            &self.s("a1b2c3d4e5f6deadbeef"),
            &timeout,
        );
        eid
    }

    fn deposit_with_mcp(&self, id: &str, total: i128, batches: u32, bps: u32) -> String {
        let eid = self.deposit(id, total, batches, 0);
        self.c().set_mcp_fee(&eid, &self.buyer, &self.mcp, &bps);
        eid
    }

    fn deliver(&self, eid: &String, idx: u32) {
        self.c().deliver_batch(
            eid,
            &self.seller,
            &idx,
            &self.s(&alloc::format!("bafy-cid-{}", idx)),
            &self.s(&alloc::format!("proof-hash-{:04x}", idx)),
        );
    }

    fn pay(&self, eid: &String, idx: u32) {
        self.c().pay_batch(eid, &self.buyer, &idx);
    }

    fn advance_time(&self, secs: u64) {
        self.env.ledger().set(LedgerInfo {
            timestamp:                self.env.ledger().timestamp() + secs,
            protocol_version:         22,
            sequence_number:          self.env.ledger().sequence() + 100,
            network_id:               Default::default(),
            base_reserve:             5_000_000,
            min_temp_entry_ttl:       1,
            min_persistent_entry_ttl: 1,
            max_entry_ttl:            10_000_000,
        });
    }
}

// ─── 1. Full happy-path (3 batches) ──────────────────────────────────────────

#[test]
fn happy_path_three_batches() {
    let ctx = Ctx::setup();
    let total: i128 = 3_000_000;
    let batches: u32 = 3;

    ctx.mint(total);
    let eid = ctx.deposit("esc-happy", total, batches, 0);

    assert_eq!(ctx.tok().balance(&ctx.contract_id), total);

    for i in 0..batches {
        ctx.deliver(&eid, i);
        ctx.pay(&eid, i);
    }

    let e = ctx.c().get_escrow(&eid);
    assert!(e.finalized);
    assert!(!e.aborted);
    assert_eq!(e.remaining_balance, 0);

    assert_eq!(ctx.tok().balance(&ctx.seller),   total * 70 / 100);
    assert_eq!(ctx.tok().balance(&ctx.platform),  total * 20 / 100);
    let dispute_exp = total - total * 70 / 100 - total * 20 / 100;
    assert_eq!(ctx.tok().balance(&ctx.dispute),  dispute_exp);
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

    for i in 0..2u32 {
        ctx.deliver(&eid, i);
        ctx.pay(&eid, i);
    }

    ctx.c().abort(&eid, &ctx.buyer);

    let e = ctx.c().get_escrow(&eid);
    assert!(e.aborted);
    assert_eq!(e.remaining_balance, 0);
    assert_eq!(ctx.tok().balance(&ctx.seller), per * 2 * 70 / 100);
    assert_eq!(ctx.tok().balance(&ctx.buyer), per); // 1 batch refunded
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 3. Timeout → refund_if_expired ──────────────────────────────────────────

#[test]
fn timeout_refund_returns_full_balance() {
    let ctx = Ctx::setup();
    let total: i128 = 1_000_000;

    ctx.mint(total);
    let eid = ctx.deposit("esc-timeout", total, 1, 3_600);

    ctx.advance_time(3_601);
    ctx.c().refund_if_expired(&eid);

    let e = ctx.c().get_escrow(&eid);
    assert!(e.aborted);
    assert_eq!(ctx.tok().balance(&ctx.buyer), total);
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 4. Dispute + resolve (seller wins) ──────────────────────────────────────

#[test]
fn dispute_batch_resolve_seller_wins() {
    let ctx = Ctx::setup();
    let total: i128 = 2_000_000;
    let batches: u32 = 2;
    let per = total / batches as i128;

    ctx.mint(total);
    let eid = ctx.deposit("esc-dispute", total, batches, 0);

    ctx.deliver(&eid, 0);
    ctx.c().dispute_batch(&eid, &ctx.buyer, &0);
    assert!(ctx.c().get_batch(&eid, &0).disputed);

    ctx.c().resolve_batch(&eid, &0, &ctx.seller);
    let b0 = ctx.c().get_batch(&eid, &0);
    assert!(!b0.disputed);
    assert_ne!(b0.paid_at, 0);
    assert_eq!(ctx.tok().balance(&ctx.seller), per);

    ctx.deliver(&eid, 1);
    ctx.pay(&eid, 1);

    assert!(ctx.c().get_escrow(&eid).finalized);
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 5. Dispute + resolve (buyer wins) ───────────────────────────────────────

#[test]
fn dispute_batch_resolve_buyer_wins() {
    let ctx = Ctx::setup();
    let total: i128 = 1_000_000;

    ctx.mint(total);
    let eid = ctx.deposit("esc-disp-b", total, 1, 0);

    ctx.deliver(&eid, 0);
    ctx.c().dispute_batch(&eid, &ctx.buyer, &0);
    ctx.c().resolve_batch(&eid, &0, &ctx.buyer);

    assert!(ctx.c().get_escrow(&eid).finalized);
    assert_eq!(ctx.tok().balance(&ctx.buyer), total);
    assert_eq!(ctx.tok().balance(&ctx.seller), 0);
}

// ─── 6. MCP fee split ─────────────────────────────────────────────────────────

#[test]
fn mcp_fee_split_correct() {
    let ctx = Ctx::setup();
    let total: i128 = 1_000_000;
    let bps: u32 = 500; // 5%

    ctx.mint(total);
    let eid = ctx.deposit_with_mcp("esc-mcp", total, 1, bps);

    ctx.deliver(&eid, 0);
    ctx.pay(&eid, 0);

    let per            = total;
    let seller_share   = per * 70 / 100;
    let platform_base  = per * 20 / 100;
    let dispute_share  = per - seller_share - platform_base;
    let mcp_cut        = per * (bps as i128) / 10_000;
    let platform_net   = platform_base - mcp_cut;

    assert_eq!(ctx.tok().balance(&ctx.seller),   seller_share);
    assert_eq!(ctx.tok().balance(&ctx.platform),  platform_net);
    assert_eq!(ctx.tok().balance(&ctx.dispute),  dispute_share);
    assert_eq!(ctx.tok().balance(&ctx.mcp),       mcp_cut);
    assert_eq!(ctx.tok().balance(&ctx.contract_id), 0);
}

// ─── 7. Guard rails ──────────────────────────────────────────────────────────

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
    ctx.c().deliver_batch(&eid, &ctx.buyer, &0, &ctx.s("bafy"), &ctx.s("hash"));
}

#[test]
#[should_panic(expected = "only buyer (depositor) may pay")]
fn wrong_pay_caller_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc2", 1_000_000, 1, 0);
    ctx.deliver(&eid, 0);
    ctx.c().pay_batch(&eid, &ctx.seller, &0);
}

#[test]
#[should_panic(expected = "batch already paid")]
fn double_pay_panics() {
    let ctx = Ctx::setup();
    ctx.mint(2_000_000);
    let eid = ctx.deposit("esc-gc3", 2_000_000, 2, 0);
    ctx.deliver(&eid, 0);
    ctx.pay(&eid, 0);
    ctx.pay(&eid, 0); // escrow not finalized (1/2 paid), so hits "batch already paid"
}

#[test]
#[should_panic(expected = "batch not found")]
fn pay_without_deliver_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_000_000);
    let eid = ctx.deposit("esc-gc4", 1_000_000, 1, 0);
    ctx.pay(&eid, 0);
}

#[test]
#[should_panic(expected = "total_amount must be exactly divisible by total_batches")]
fn indivisible_amount_panics() {
    let ctx = Ctx::setup();
    ctx.mint(1_010_000);
    ctx.deposit("esc-gc5", 1_010_000, 3, 0);
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
    ctx.pay(&eid, 0);
    ctx.c().abort(&eid, &ctx.buyer);
}
