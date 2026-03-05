#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
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
) {
    let contract_addr = env.register(EscrowContract, ());

    let admin = Address::generate(env);
    let depositor = Address::generate(env);
    let recipient = Address::generate(env);
    let platform = Address::generate(env);
    let dispute = Address::generate(env);

    // Create USDC token
    let (token_addr, token_client, token_admin) = create_token(env, &admin);
    // Mint 1_000 USDC to depositor
    token_admin.mint(&depositor, &1_000_i128);

    // Create XLM token for staking
    let (xlm_addr, _xlm_client, xlm_admin) = create_token(env, &admin);

    // Initialize contract with staking
    let client = EscrowContractClient::new(env, &contract_addr);
    client.initialize(&admin, &xlm_addr, &100_000_000i128);

    // Stake XLM for depositor (so they can use the escrow)
    xlm_admin.mint(&depositor, &200_000_000i128);
    client.stake(&depositor, &200_000_000i128);

    (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute)
}

// ---------------------------------------------------------------------------
// Test 1: deposit → release — splits arrive correctly
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_and_release() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let amount: i128 = 1_000;
    let eid = escrow_id(&env, "skill1:user1");
    let skill = escrow_id(&env, "skill1");

    client.deposit(
        &depositor,
        &token_addr,
        &amount,
        &recipient,
        &platform,
        &dispute,
        &skill,
        &eid,
    );

    assert_eq!(token_client.balance(&depositor), 0);
    assert_eq!(token_client.balance(&contract_addr), amount);

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
// Test 2: deposit → refund
// ---------------------------------------------------------------------------

#[test]
fn test_deposit_and_refund() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, token_client, depositor, recipient, platform, dispute) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let amount: i128 = 500;
    let eid = escrow_id(&env, "skill2:user2");
    let skill = escrow_id(&env, "skill2");

    client.deposit(
        &depositor,
        &token_addr,
        &amount,
        &recipient,
        &platform,
        &dispute,
        &skill,
        &eid,
    );

    assert_eq!(token_client.balance(&depositor), 500);
    assert_eq!(token_client.balance(&contract_addr), amount);

    client.refund(&depositor, &eid);

    assert_eq!(token_client.balance(&depositor), 1_000);
    assert_eq!(token_client.balance(&contract_addr), 0);

    let data = client.get_escrow(&eid);
    assert!(data.released);
}

// ---------------------------------------------------------------------------
// Test 3: unauthorized release → panic
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "unauthorized: only platform may release")]
fn test_unauthorized_release_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let amount: i128 = 300;
    let eid = escrow_id(&env, "skill3:user3");
    let skill = escrow_id(&env, "skill3");

    client.deposit(
        &depositor,
        &token_addr,
        &amount,
        &recipient,
        &platform,
        &dispute,
        &skill,
        &eid,
    );

    // Attempt release from depositor — must panic
    client.release(&depositor, &eid);
}

// ---------------------------------------------------------------------------
// Test 4: double refund → panic
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "already released")]
fn test_double_refund_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "skill4:user4");
    let skill = escrow_id(&env, "skill4");

    client.deposit(
        &depositor,
        &token_addr,
        &200_i128,
        &recipient,
        &platform,
        &dispute,
        &skill,
        &eid,
    );

    client.refund(&depositor, &eid);
    client.refund(&depositor, &eid);
}

// ---------------------------------------------------------------------------
// Test 5: double release → panic
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected = "already released")]
fn test_double_release_panics() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, token_addr, _token_client, depositor, recipient, platform, dispute) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    let eid = escrow_id(&env, "skill5:user5");
    let skill = escrow_id(&env, "skill5");

    client.deposit(
        &depositor,
        &token_addr,
        &1_000_i128,
        &recipient,
        &platform,
        &dispute,
        &skill,
        &eid,
    );

    client.release(&platform, &eid);
    client.release(&platform, &eid);
}

// ---------------------------------------------------------------------------
// Test 6: stake check
// ---------------------------------------------------------------------------

#[test]
fn test_stake_query() {
    let env = Env::default();
    env.mock_all_auths();

    let (contract_addr, _token_addr, _token_client, depositor, _recipient, _platform, _dispute) =
        setup_escrow(&env);

    let client = EscrowContractClient::new(&env, &contract_addr);

    // depositor was staked 200_000_000 in setup
    assert_eq!(client.get_stake(&depositor), 200_000_000);
}
