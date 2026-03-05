#![no_std]

//! MCP Marketplace Feedback Contract v3
//!
//! Features:
//!   - All identity is wallet Address (no pseudoId)
//!   - AI Attestation: ed25519 verifier whitelist + nonce replay protection
//!   - XLM Staking: users must stake before using the system
//!   - Individual reviews with IPFS CID reason
//!   - Global aggregated ratings per MCP
//!   - Total USDC paid tracking per MCP
//!
//! Functions:
//!   init              — Set admin
//!   register_mcp      — Creator registers MCP (requires stake)
//!   record_use        — Record MCP usage + pay creator (requires stake)
//!   submit_rating     — Submit rating with AI attestation (requires stake)
//!   add_verifier      — Admin adds AI verifier pubkey
//!   remove_verifier   — Admin removes AI verifier
//!   stake             — User stakes XLM to access the system
//!   unstake           — User withdraws stake (if no active obligations)
//!   get_stake         — Check user's stake amount
//!   get_mcp           — Read MCP record
//!   get_rating        — Get average rating * 100
//!   get_review        — Read single review by index
//!   get_review_count  — Number of reviews for an MCP
//!   get_total_paid    — Total USDC paid to creator

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Bytes, BytesN, Env, String,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// mcp_id → McpRecord
    Mcp(String),
    /// Admin address (platform)
    Admin,
    /// (mcp_id, index) → ReviewRecord
    Review(String, u64),
    /// mcp_id → total USDC paid to creator (i128)
    TotalPaid(String),
    /// verifier_id → ed25519 pubkey (BytesN<32>)
    Verifier(String),
    /// nonce → () (used nonces for replay protection)
    UsedNonce(String),
    /// user Address → staked XLM amount (i128)
    Stake(Address),
    /// XLM token address for staking
    StakeToken,
    /// Minimum stake amount required
    MinStake,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct McpRecord {
    pub creator: Address,
    pub ipfs_hash: String,
    pub token: Address,
    pub usage_fee: i128,
    pub usage_count: u64,
    pub rating_sum: u64,
    pub rating_count: u64,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct ReviewRecord {
    pub reviewer: Address,
    pub rating: u32,
    pub reason_cid: String,
    pub verified_by: String,
    pub created_at: u64,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct FeedbackContract;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

fn require_staked(env: &Env, user: &Address) {
    let stake_key = DataKey::Stake(user.clone());
    let staked: i128 = env
        .storage()
        .persistent()
        .get(&stake_key)
        .unwrap_or(0i128);
    let min_stake: i128 = env
        .storage()
        .instance()
        .get(&DataKey::MinStake)
        .unwrap_or(100_000_000i128); // default 10 XLM (7 decimals)
    if staked < min_stake {
        panic!("insufficient stake: deposit XLM first");
    }
}

fn verify_ai_attestation(
    env: &Env,
    verifier_id: &String,
    msg: &Bytes,
    sig: &BytesN<64>,
    nonce: &String,
) {
    // Replay protection
    let nonce_key = DataKey::UsedNonce(nonce.clone());
    if env.storage().persistent().has(&nonce_key) {
        panic!("nonce already used");
    }

    // Fetch verifier pubkey from whitelist
    let vkey = DataKey::Verifier(verifier_id.clone());
    let pubkey: BytesN<32> = env
        .storage()
        .persistent()
        .get(&vkey)
        .expect("verifier not found");

    // Verify ed25519 signature
    env.crypto().ed25519_verify(&pubkey, msg, sig);

    // Mark nonce as used
    env.storage().persistent().set(&nonce_key, &());
    env.storage()
        .persistent()
        .extend_ttl(&nonce_key, 6_307_200, 6_307_200);
}

#[contractimpl]
impl FeedbackContract {
    // =======================================================================
    // ADMIN
    // =======================================================================

    /// Initialize contract with admin, XLM token address, and minimum stake
    pub fn init(env: Env, admin: Address, xlm_token: Address, min_stake: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::StakeToken, &xlm_token);
        env.storage().instance().set(&DataKey::MinStake, &min_stake);
    }

    /// Admin adds an AI verifier (ed25519 pubkey)
    pub fn add_verifier(env: Env, verifier_id: String, pubkey: BytesN<32>) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        let key = DataKey::Verifier(verifier_id);
        env.storage().persistent().set(&key, &pubkey);
        env.storage()
            .persistent()
            .extend_ttl(&key, 6_307_200, 6_307_200);
    }

    /// Admin removes an AI verifier
    pub fn remove_verifier(env: Env, verifier_id: String) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        let key = DataKey::Verifier(verifier_id);
        env.storage().persistent().remove(&key);
    }

    /// Admin updates minimum stake amount
    pub fn set_min_stake(env: Env, amount: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();

        env.storage().instance().set(&DataKey::MinStake, &amount);
    }

    // =======================================================================
    // STAKING — users must stake XLM to use the system
    // =======================================================================

    /// Stake XLM to access the system. Transfers XLM from user to contract.
    pub fn stake(env: Env, user: Address, amount: i128) {
        user.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let xlm_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::StakeToken)
            .expect("not initialized");

        // Transfer XLM from user to contract
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

        // Update stake balance
        let stake_key = DataKey::Stake(user.clone());
        let current: i128 = env
            .storage()
            .persistent()
            .get(&stake_key)
            .unwrap_or(0i128);
        env.storage()
            .persistent()
            .set(&stake_key, &(current + amount));
        env.storage()
            .persistent()
            .extend_ttl(&stake_key, 6_307_200, 6_307_200);

        env.events().publish(
            (
                String::from_str(&env, "stake"),
                String::from_str(&env, "deposit"),
            ),
            amount,
        );
    }

    /// Unstake XLM — withdraw stake back to user
    pub fn unstake(env: Env, user: Address, amount: i128) {
        user.require_auth();

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let stake_key = DataKey::Stake(user.clone());
        let current: i128 = env
            .storage()
            .persistent()
            .get(&stake_key)
            .unwrap_or(0i128);

        if amount > current {
            panic!("insufficient stake balance");
        }

        let xlm_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::StakeToken)
            .expect("not initialized");

        // Transfer XLM back to user
        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        let new_balance = current - amount;
        env.storage().persistent().set(&stake_key, &new_balance);
        env.storage()
            .persistent()
            .extend_ttl(&stake_key, 6_307_200, 6_307_200);

        env.events().publish(
            (
                String::from_str(&env, "stake"),
                String::from_str(&env, "withdraw"),
            ),
            amount,
        );
    }

    /// Check user's stake amount
    pub fn get_stake(env: Env, user: Address) -> i128 {
        let stake_key = DataKey::Stake(user);
        env.storage()
            .persistent()
            .get(&stake_key)
            .unwrap_or(0i128)
    }

    // =======================================================================
    // MCP REGISTRATION — requires stake
    // =======================================================================

    pub fn register_mcp(
        env: Env,
        mcp_id: String,
        creator: Address,
        ipfs_hash: String,
        token: Address,
        usage_fee: i128,
    ) {
        creator.require_auth();
        require_staked(&env, &creator);

        let key = DataKey::Mcp(mcp_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("already registered");
        }

        let record = McpRecord {
            creator,
            ipfs_hash,
            token,
            usage_fee,
            usage_count: 0,
            rating_sum: 0,
            rating_count: 0,
            registered_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, 6_307_200, 6_307_200);

        // Initialize total paid tracker
        let paid_key = DataKey::TotalPaid(mcp_id);
        env.storage().persistent().set(&paid_key, &0i128);
        env.storage()
            .persistent()
            .extend_ttl(&paid_key, 6_307_200, 6_307_200);
    }

    // =======================================================================
    // RECORD USE — requires stake
    // =======================================================================

    pub fn record_use(env: Env, mcp_id: String, payer: Address) {
        payer.require_auth();
        require_staked(&env, &payer);

        let key = DataKey::Mcp(mcp_id.clone());
        let mut record: McpRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("MCP not found");

        if record.usage_fee > 0 {
            let token_client = token::TokenClient::new(&env, &record.token);
            token_client.transfer(&payer, &record.creator, &record.usage_fee);

            let paid_key = DataKey::TotalPaid(mcp_id.clone());
            let current: i128 = env
                .storage()
                .persistent()
                .get(&paid_key)
                .unwrap_or(0i128);
            env.storage()
                .persistent()
                .set(&paid_key, &(current + record.usage_fee));
            env.storage()
                .persistent()
                .extend_ttl(&paid_key, 6_307_200, 6_307_200);
        }

        record.usage_count += 1;
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, 6_307_200, 6_307_200);
    }

    // =======================================================================
    // SUBMIT RATING — requires stake + AI attestation
    // =======================================================================

    /// Submit rating with AI verifier attestation.
    /// The verifier signs: "AI_ATTEST|{mcp_id}|{rater}|{rating}|{nonce}|{ts}"
    /// This ensures the rating was produced/approved by a whitelisted AI.
    pub fn submit_rating(
        env: Env,
        mcp_id: String,
        rater: Address,
        rating: u32,
        reason_cid: String,
        verifier_id: String,
        nonce: String,
        sig: BytesN<64>,
        ts: u64,
    ) {
        rater.require_auth();
        require_staked(&env, &rater);

        if rating < 1 || rating > 5 {
            panic!("rating must be 1-5");
        }

        // Build attestation message deterministically.
        // Off-chain verifier builds the same message and signs it.
        // We use: sha256("AI_ATTEST" || mcp_id_len || mcp_id_bytes || rating || nonce_len || nonce_bytes || ts_be_bytes)
        // Then verify the ed25519 signature over that sha256 hash.
        let mut raw = Bytes::new(&env);
        raw.append(&Bytes::from_slice(&env, b"AI_ATTEST"));
        // Soroban String → Bytes via encode_len + copy_into_slice
        {
            let mcp_len = mcp_id.len() as u32;
            raw.append(&Bytes::from_slice(&env, &mcp_len.to_be_bytes()));
            let mut mcp_buf = [0u8; 128];
            let sl = &mut mcp_buf[..mcp_len as usize];
            mcp_id.copy_into_slice(sl);
            raw.append(&Bytes::from_slice(&env, sl));
        }
        raw.append(&Bytes::from_slice(&env, &[rating as u8]));
        {
            let n_len = nonce.len() as u32;
            raw.append(&Bytes::from_slice(&env, &n_len.to_be_bytes()));
            let mut n_buf = [0u8; 128];
            let sl = &mut n_buf[..n_len as usize];
            nonce.copy_into_slice(sl);
            raw.append(&Bytes::from_slice(&env, sl));
        }
        raw.append(&Bytes::from_slice(&env, &ts.to_be_bytes()));
        let msg = Bytes::from_slice(&env, env.crypto().sha256(&raw).to_array().as_slice());

        // Verify AI attestation (checks verifier whitelist + nonce replay)
        verify_ai_attestation(&env, &verifier_id, &msg, &sig, &nonce);

        // Timestamp sanity: not too far in future, not expired
        let now = env.ledger().timestamp();
        if ts > now + 60 {
            panic!("attestation ts too far in future");
        }
        if now > ts + 3600 {
            panic!("attestation expired");
        }

        // Store individual review
        let key = DataKey::Mcp(mcp_id.clone());
        let mut record: McpRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("MCP not found");

        let review_index = record.rating_count;
        let review_key = DataKey::Review(mcp_id.clone(), review_index);
        let review = ReviewRecord {
            reviewer: rater,
            rating,
            reason_cid,
            verified_by: verifier_id,
            created_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&review_key, &review);
        env.storage()
            .persistent()
            .extend_ttl(&review_key, 6_307_200, 6_307_200);

        // Update aggregated rating
        record.rating_sum += rating as u64;
        record.rating_count += 1;
        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, 6_307_200, 6_307_200);

        env.events().publish(
            (
                String::from_str(&env, "mcp"),
                String::from_str(&env, "rated"),
            ),
            mcp_id,
        );
    }

    // =======================================================================
    // READ-ONLY QUERIES
    // =======================================================================

    pub fn get_mcp(env: Env, mcp_id: String) -> McpRecord {
        let key = DataKey::Mcp(mcp_id);
        env.storage()
            .persistent()
            .get(&key)
            .expect("MCP not found")
    }

    pub fn get_rating(env: Env, mcp_id: String) -> u64 {
        let key = DataKey::Mcp(mcp_id);
        let record: McpRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("MCP not found");
        if record.rating_count == 0 {
            return 0;
        }
        (record.rating_sum * 100) / record.rating_count
    }

    pub fn get_review(env: Env, mcp_id: String, index: u64) -> ReviewRecord {
        let review_key = DataKey::Review(mcp_id, index);
        env.storage()
            .persistent()
            .get(&review_key)
            .expect("review not found")
    }

    pub fn get_review_count(env: Env, mcp_id: String) -> u64 {
        let key = DataKey::Mcp(mcp_id);
        let record: McpRecord = env
            .storage()
            .persistent()
            .get(&key)
            .expect("MCP not found");
        record.rating_count
    }

    pub fn get_total_paid(env: Env, mcp_id: String) -> i128 {
        let paid_key = DataKey::TotalPaid(mcp_id);
        env.storage()
            .persistent()
            .get(&paid_key)
            .unwrap_or(0i128)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{
        token::{Client as TokenClient, StellarAssetClient},
        Env, String,
    };

    fn create_token<'a>(
        env: &Env,
        admin: &Address,
    ) -> (Address, TokenClient<'a>, StellarAssetClient<'a>) {
        let addr = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let client = TokenClient::new(env, &addr);
        let admin_client = StellarAssetClient::new(env, &addr);
        (addr, client, admin_client)
    }

    fn setup() -> (Env, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let contract_id = env.register(FeedbackContract, ());

        // Create XLM token for staking
        let (xlm_addr, _xlm_client, xlm_admin) = create_token(&env, &admin);

        // Initialize with 10 XLM min stake (10_0000000 stroops)
        let client = FeedbackContractClient::new(&env, &contract_id);
        client.init(&admin, &xlm_addr, &100_000_000i128);

        (env, admin, contract_id, xlm_addr)
    }

    fn stake_user(
        env: &Env,
        contract_id: &Address,
        xlm_addr: &Address,
        admin: &Address,
        user: &Address,
        amount: i128,
    ) {
        // Mint XLM to user
        let xlm_admin = StellarAssetClient::new(env, xlm_addr);
        xlm_admin.mint(user, &amount);

        // Stake
        let client = FeedbackContractClient::new(env, contract_id);
        client.stake(user, &amount);
    }

    #[test]
    fn test_stake_and_register() {
        let (env, admin, contract_id, xlm_addr) = setup();
        let client = FeedbackContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let usdc_token = Address::generate(&env);

        // Stake 10 XLM
        stake_user(&env, &contract_id, &xlm_addr, &admin, &creator, 100_000_000);

        // Check stake
        let staked = client.get_stake(&creator);
        assert_eq!(staked, 100_000_000);

        // Register MCP
        let mcp_id = String::from_str(&env, "mcp-001");
        let ipfs_hash = String::from_str(&env, "QmTestHash123");
        client.register_mcp(&mcp_id, &creator, &ipfs_hash, &usdc_token, &500_000i128);

        let record = client.get_mcp(&mcp_id);
        assert_eq!(record.creator, creator);
        assert_eq!(record.usage_count, 0);
    }

    #[test]
    #[should_panic(expected = "insufficient stake")]
    fn test_register_without_stake_panics() {
        let (env, _admin, contract_id, _xlm_addr) = setup();
        let client = FeedbackContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let usdc_token = Address::generate(&env);
        let mcp_id = String::from_str(&env, "mcp-no-stake");
        let ipfs_hash = String::from_str(&env, "QmTest");

        // No stake — should panic
        client.register_mcp(&mcp_id, &creator, &ipfs_hash, &usdc_token, &0i128);
    }

    #[test]
    fn test_unstake() {
        let (env, admin, contract_id, xlm_addr) = setup();
        let client = FeedbackContractClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        stake_user(&env, &contract_id, &xlm_addr, &admin, &user, 200_000_000);

        assert_eq!(client.get_stake(&user), 200_000_000);

        // Unstake half
        client.unstake(&user, &100_000_000i128);
        assert_eq!(client.get_stake(&user), 100_000_000);

        // XLM balance should be restored
        let xlm_client = TokenClient::new(&env, &xlm_addr);
        assert_eq!(xlm_client.balance(&user), 100_000_000);
    }

    #[test]
    #[should_panic(expected = "insufficient stake balance")]
    fn test_unstake_too_much_panics() {
        let (env, admin, contract_id, xlm_addr) = setup();
        let client = FeedbackContractClient::new(&env, &contract_id);

        let user = Address::generate(&env);
        stake_user(&env, &contract_id, &xlm_addr, &admin, &user, 100_000_000);

        client.unstake(&user, &999_000_000i128);
    }

    #[test]
    fn test_zero_rating_returns_zero() {
        let (env, admin, contract_id, xlm_addr) = setup();
        let client = FeedbackContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        stake_user(&env, &contract_id, &xlm_addr, &admin, &creator, 100_000_000);

        let mcp_id = String::from_str(&env, "mcp-005");
        let ipfs_hash = String::from_str(&env, "QmTestHashXXX");
        client.register_mcp(&mcp_id, &creator, &ipfs_hash, &token, &0i128);

        let avg = client.get_rating(&mcp_id);
        assert_eq!(avg, 0);
    }

    #[test]
    #[should_panic(expected = "already registered")]
    fn test_duplicate_registration_panics() {
        let (env, admin, contract_id, xlm_addr) = setup();
        let client = FeedbackContractClient::new(&env, &contract_id);

        let creator = Address::generate(&env);
        let token = Address::generate(&env);
        stake_user(&env, &contract_id, &xlm_addr, &admin, &creator, 100_000_000);

        let mcp_id = String::from_str(&env, "mcp-003");
        let ipfs_hash = String::from_str(&env, "QmTestHash789");

        client.register_mcp(&mcp_id, &creator, &ipfs_hash, &token, &0i128);
        client.register_mcp(&mcp_id, &creator, &ipfs_hash, &token, &0i128);
    }
}
