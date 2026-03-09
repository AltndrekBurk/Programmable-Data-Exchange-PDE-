#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env, String,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn create_token<'a>(env: &Env, admin: &Address) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
    let token_addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let token = TokenClient::new(env, &token_addr);
    let token_admin = StellarAssetClient::new(env, &token_addr);
    (token_addr, token, token_admin)
}

fn escrow_id(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn setup_escrow(
    env: &Env,
) -> (
    Address, // contract
    Address, // usdc token
    TokenClient<'_>,
    Address, // depositor
    Address, // recipient
    Address, // platform
    Address, // dispute
    Address, // admin (for resolve_dispute)
) {
    let contract_addr = env.register(EscrowContract, ());

    let admin = Address::generate(env);
    let depositor = Address::generate(env);
    let recipient = Address::generate(env);
    let platform = Address::generate(env);
    let dispute = Address::generate(env);

    // Create USDC token
    let (token_addr, token_client, token_admin) = create_token(env, &admin);
    // Mint 10_000 USDC to depositor
    token_admin.mint(&depositor, &10_000_i128);

    // Create XLM token for staking
    let (xlm_addr, _xlm_client, xlm_admin) = create_token(env, &admin);

    // Initialize contract with staking
    let client = EscrowContractClient::new(env, &contract_addr);
    client.initialize(&admin, &xlm_addr, &100_000_000i128);

    // Stake XLM for depositor (so they can use the escrow)
    xlm_admin.mint(&depositor, &200_000_000i128);
    client.stake(&depositor, &200_000_000i128);

    (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute, admin)
}

/// Helper: deposit + set_proof in one go
fn deposit_and_link_proof(
    env: &Env,
    client: &EscrowContractClient,
    depositor: &Address,
    token_addr: &Address,
    amount: i128,
    recipient: &Address,
    platform: &Address,
    dispute: &Address,
    eid: &String,
    skill: &String,
) {
    client.deposit(
        depositor, token_addr, &amount, recipient, platform, dispute, skill, eid,
    );
    let proof_cid = String::from_str(env, "QmProofCid123");
    let proof_hash = String::from_str(env, "abc123hash");
    client.set_proof(platform, eid, &proof_cid, &proof_hash);
}

// ---------------------------------------------------------------------------
// Test 1: deposit → set_proof → release — splits arrive correctly
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_set_proof_and_release() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let amount: i128 = 1_000;
    let eid = escrow_id(&env, "skill1:user1");
    let skill = escrow_id(&env, "skill1");

    deposit_and_link_proof(
        &env, &client, &depositor, &token_addr, amount,
        &recipient, &platform, &dispute, &eid, &skill,
    );

    // Verify proof linked
    let data = client.get_escrow(&eid);
    assert_eq!(data.proof_hash, String::from_str(&env, "abc123hash"));

    client.release(&platform, &eid);

    let expected_recipient = amount * 70 / 100;
    let expected_platform = amount * 20 / 100;
    let expected_dispute = amount - expected_recipient - expected_platform;

    assert_eq!(token_client.balance(&recipient), expected_recipient);
    assert_eq!(token_client.balance(&platform), expected_platform);
    assert_eq!(token_client.balance(&dispute), expected_dispute);
    assert_eq!(token_client.balance(&contract_addr), 0);

    let data = client.get_escrow(&eid);
    assert!(data.released);
}

// ---------------------------------------------------------------------------
// Test 2: release without proof → panic
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "proof not linked: call set_proof first")]
fn test_release_without_proof_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "noproof:esc");
    let skill = escrow_id(&env, "noproof");

    client.deposit(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid,
    );

    // Try release without set_proof — must panic
    client.release(&platform, &eid);
}

// ---------------------------------------------------------------------------
// Test 3: deposit → refund (before proof)
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_and_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let amount: i128 = 500;
    let eid = escrow_id(&env, "skill2:user2");
    let skill = escrow_id(&env, "skill2");

    client.deposit(
        &depositor, &token_addr, &amount,
        &recipient, &platform, &dispute, &skill, &eid,
    );

    assert_eq!(token_client.balance(&depositor), 9_500);
    assert_eq!(token_client.balance(&contract_addr), amount);

    client.refund(&depositor, &eid);

    assert_eq!(token_client.balance(&depositor), 10_000);
    assert_eq!(token_client.balance(&contract_addr), 0);
}

// ---------------------------------------------------------------------------
// Test 4: refund blocked after proof submitted
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "proof already submitted, cannot refund")]
fn test_refund_blocked_after_proof() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "refund_block:esc");
    let skill = escrow_id(&env, "refund_block");

    deposit_and_link_proof(
        &env, &client, &depositor, &token_addr, 1_000,
        &recipient, &platform, &dispute, &eid, &skill,
    );

    // Try refund after proof set — must panic
    client.refund(&depositor, &eid);
}

// ---------------------------------------------------------------------------
// Test 5: refund blocked if disputed
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "cannot refund disputed escrow")]
fn test_refund_blocked_if_disputed() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "disputed_refund:esc");
    let skill = escrow_id(&env, "disputed_refund");

    client.deposit(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid,
    );

    client.dispute(&platform, &eid);
    // Try refund after dispute — must panic
    client.refund(&depositor, &eid);
}

// ---------------------------------------------------------------------------
// Test 6: timeout expiry refund
// ---------------------------------------------------------------------------

#[test]
fn test_refund_if_expired() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "timeout:esc");
    let skill = escrow_id(&env, "timeout");

    // Deposit with 1 hour timeout
    client.deposit_with_timeout(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid, &3600u64,
    );

    assert_eq!(token_client.balance(&contract_addr), 1_000);

    // Advance ledger by 2 hours
    env.ledger().with_mut(|li| {
        li.timestamp += 7200;
    });

    // Anyone can refund expired escrow
    client.refund_if_expired(&eid);

    assert_eq!(token_client.balance(&depositor), 10_000);
    assert_eq!(token_client.balance(&contract_addr), 0);
}

// ---------------------------------------------------------------------------
// Test 7: timeout refund blocked if not expired
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "escrow has not expired yet")]
fn test_refund_if_not_expired_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "not_expired:esc");
    let skill = escrow_id(&env, "not_expired");

    client.deposit_with_timeout(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid, &3600u64,
    );

    // Try refund immediately (not expired) — must panic
    client.refund_if_expired(&eid);
}

// ---------------------------------------------------------------------------
// Test 8: dispute resolution by admin
// ---------------------------------------------------------------------------

#[test]
fn test_resolve_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "dispute_resolve:esc");
    let skill = escrow_id(&env, "dispute_resolve");

    client.deposit(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid,
    );

    // Dispute
    client.dispute(&platform, &eid);

    // Admin resolves: recipient wins
    client.resolve_dispute(&eid, &recipient);

    assert_eq!(token_client.balance(&recipient), 1_000);
    assert_eq!(token_client.balance(&contract_addr), 0);

    let data = client.get_escrow(&eid);
    assert!(data.released);
    assert!(data.disputed);
}

// ---------------------------------------------------------------------------
// Test 9: resolve_dispute fails if not disputed
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "escrow is not disputed")]
fn test_resolve_dispute_not_disputed_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "not_disputed:esc");
    let skill = escrow_id(&env, "not_disputed");

    client.deposit(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid,
    );

    // Try resolve without dispute — must panic
    client.resolve_dispute(&eid, &recipient);
}

// ---------------------------------------------------------------------------
// Test 10: unauthorized release → panic
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized: only platform may release")]
fn test_unauthorized_release_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "skill3:user3");
    let skill = escrow_id(&env, "skill3");

    deposit_and_link_proof(
        &env, &client, &depositor, &token_addr, 300,
        &recipient, &platform, &dispute, &eid, &skill,
    );

    // Attempt release from depositor — must panic
    client.release(&depositor, &eid);
}

// ---------------------------------------------------------------------------
// Test 11: double release → panic
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "already released")]
fn test_double_release_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "skill5:user5");
    let skill = escrow_id(&env, "skill5");

    deposit_and_link_proof(
        &env, &client, &depositor, &token_addr, 1_000,
        &recipient, &platform, &dispute, &eid, &skill,
    );

    client.release(&platform, &eid);
    client.release(&platform, &eid);
}

// ---------------------------------------------------------------------------
// Test 12: stake check
// ---------------------------------------------------------------------------

#[test]
fn test_stake_query() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, _token_addr, _token_client, depositor, _recipient, _platform, _dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    // depositor was staked 200_000_000 in setup
    assert_eq!(client.get_stake(&depositor), 200_000_000);
}

// ---------------------------------------------------------------------------
// Test 13: release_with_mcp_fee (requires proof linkage)
// ---------------------------------------------------------------------------

#[test]
fn test_release_with_mcp_fee() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);
    let mcp_creator = Address::generate(&env);

    let amount: i128 = 1_000;
    let eid = escrow_id(&env, "skill6:user6");
    let skill = escrow_id(&env, "skill6");

    deposit_and_link_proof(
        &env, &client, &depositor, &token_addr, amount,
        &recipient, &platform, &dispute, &eid, &skill,
    );

    // 500 bps => 5% of total, deducted from platform 20%
    client.release_with_mcp_fee(&platform, &eid, &mcp_creator, &500u32);

    let expected_recipient = amount * 70 / 100;
    let expected_dispute = amount * 10 / 100;
    let expected_mcp = amount * 500 / 10000;
    let expected_platform = (amount * 20 / 100) - expected_mcp;

    assert_eq!(token_client.balance(&recipient), expected_recipient);
    assert_eq!(token_client.balance(&platform), expected_platform);
    assert_eq!(token_client.balance(&mcp_creator), expected_mcp);
    assert_eq!(token_client.balance(&dispute), expected_dispute);
    assert_eq!(token_client.balance(&contract_addr), 0);
}

// ---------------------------------------------------------------------------
// Test 14: escrow data includes new fields
// ---------------------------------------------------------------------------

#[test]
fn test_escrow_data_has_proof_and_timeout_fields() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute, _admin) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "fields:esc");
    let skill = escrow_id(&env, "fields");

    client.deposit(
        &depositor, &token_addr, &1_000_i128,
        &recipient, &platform, &dispute, &skill, &eid,
    );

    let data = client.get_escrow(&eid);

    // New fields should be initialized correctly
    assert_eq!(data.proof_cid, String::from_str(&env, ""));
    assert_eq!(data.proof_hash, String::from_str(&env, ""));
    assert!(data.timeout_at > data.created_at);
    assert_eq!(data.timeout_at - data.created_at, 7 * 24 * 60 * 60);
}
