#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, token, Address, Env, String,
};

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Escrow(String),
    Admin,
    /// user Address → staked XLM amount (i128)
    Stake(Address),
    /// XLM token address for staking
    StakeToken,
    /// Minimum stake required
    MinStake,
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone)]
pub struct EscrowData {
    pub depositor: Address,
    pub token: Address,
    pub amount: i128,
    pub recipient: Address,
    pub platform: Address,
    pub dispute_wallet: Address,
    pub skill_id: String,
    /// IPFS CID of the proof submission (set by platform before release)
    pub proof_cid: String,
    /// SHA256 hash of the ZK proof (set by platform before release)
    pub proof_hash: String,
    pub released: bool,
    pub disputed: bool,
    pub created_at: u64,
    /// Escrow expires after this timestamp; anyone can refund after expiry
    pub timeout_at: u64,
}

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum EscrowStatus {
    Active,
    Released,
    Refunded,
    Disputed,
}

// ---------------------------------------------------------------------------
// Helpers
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
        .unwrap_or(100_000_000i128);
    if staked < min_stake {
        panic!("insufficient stake: deposit XLM first");
    }
}

fn require_admin(env: &Env) -> Address {
    let admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("not initialized");
    admin.require_auth();
    admin
}

fn emit(env: &Env, action: &str, escrow_id: String) {
    env.events().publish(
        (
            String::from_str(env, "escrow"),
            String::from_str(env, action),
        ),
        escrow_id,
    );
}

/// Default escrow timeout: 7 days in seconds
const DEFAULT_TIMEOUT_SECS: u64 = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize with admin, XLM token for staking, and minimum stake
    pub fn initialize(env: Env, admin: Address, xlm_token: Address, min_stake: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::StakeToken, &xlm_token);
        env.storage().instance().set(&DataKey::MinStake, &min_stake);
    }

    // =======================================================================
    // STAKING
    // =======================================================================

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

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&user, &env.current_contract_address(), &amount);

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
    }

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

        let token_client = token::Client::new(&env, &xlm_token);
        token_client.transfer(&env.current_contract_address(), &user, &amount);

        env.storage()
            .persistent()
            .set(&stake_key, &(current - amount));
        env.storage()
            .persistent()
            .extend_ttl(&stake_key, 6_307_200, 6_307_200);
    }

    pub fn get_stake(env: Env, user: Address) -> i128 {
        let stake_key = DataKey::Stake(user);
        env.storage()
            .persistent()
            .get(&stake_key)
            .unwrap_or(0i128)
    }

    // =======================================================================
    // ESCROW — all require stake
    // =======================================================================

    /// Deposit USDC into escrow. Timeout defaults to +7 days.
    pub fn deposit(
        env: Env,
        depositor: Address,
        token: Address,
        amount: i128,
        recipient: Address,
        platform: Address,
        dispute_wallet: Address,
        skill_id: String,
        escrow_id: String,
    ) {
        depositor.require_auth();
        require_staked(&env, &depositor);

        if amount <= 0 {
            panic!("amount must be positive");
        }

        let key = DataKey::Escrow(escrow_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("escrow_id already exists");
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();
        let data = EscrowData {
            depositor,
            token,
            amount,
            recipient,
            platform,
            dispute_wallet,
            skill_id,
            proof_cid: String::from_str(&env, ""),
            proof_hash: String::from_str(&env, ""),
            released: false,
            disputed: false,
            created_at: now,
            timeout_at: now + DEFAULT_TIMEOUT_SECS,
        };

        env.storage().persistent().set(&key, &data);
        emit(&env, "deposited", escrow_id);
    }

    /// Deposit with custom timeout (in seconds from now).
    pub fn deposit_with_timeout(
        env: Env,
        depositor: Address,
        token: Address,
        amount: i128,
        recipient: Address,
        platform: Address,
        dispute_wallet: Address,
        skill_id: String,
        escrow_id: String,
        timeout_secs: u64,
    ) {
        depositor.require_auth();
        require_staked(&env, &depositor);

        if amount <= 0 {
            panic!("amount must be positive");
        }
        if timeout_secs < 3600 {
            panic!("timeout must be at least 1 hour");
        }

        let key = DataKey::Escrow(escrow_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("escrow_id already exists");
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&depositor, &env.current_contract_address(), &amount);

        let now = env.ledger().timestamp();
        let data = EscrowData {
            depositor,
            token,
            amount,
            recipient,
            platform,
            dispute_wallet,
            skill_id,
            proof_cid: String::from_str(&env, ""),
            proof_hash: String::from_str(&env, ""),
            released: false,
            disputed: false,
            created_at: now,
            timeout_at: now + timeout_secs,
        };

        env.storage().persistent().set(&key, &data);
        emit(&env, "deposited", escrow_id);
    }

    // =======================================================================
    // PROOF LINKAGE — platform links proof before release
    // =======================================================================

    /// Platform sets proof_cid and proof_hash before release.
    /// Once set, depositor can no longer refund (proof submitted = work done).
    pub fn set_proof(
        env: Env,
        caller: Address,
        escrow_id: String,
        proof_cid: String,
        proof_hash: String,
    ) {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("escrow already finalised");
        }
        if caller != data.platform {
            panic!("unauthorized: only platform may set proof");
        }
        if proof_hash.len() == 0 {
            panic!("proof_hash must not be empty");
        }

        data.proof_cid = proof_cid;
        data.proof_hash = proof_hash;
        env.storage().persistent().set(&key, &data);

        emit(&env, "proof_linked", escrow_id);
    }

    // =======================================================================
    // RELEASE — requires proof to be linked
    // =======================================================================

    pub fn release(env: Env, caller: Address, escrow_id: String) {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("already released");
        }
        if caller != data.platform {
            panic!("unauthorized: only platform may release");
        }
        if data.proof_hash.len() == 0 {
            panic!("proof not linked: call set_proof first");
        }

        let token_client = token::Client::new(&env, &data.token);
        let recipient_amount = data.amount * 70 / 100;
        let platform_amount = data.amount * 20 / 100;
        let dispute_amount = data.amount - recipient_amount - platform_amount;

        token_client.transfer(&env.current_contract_address(), &data.recipient, &recipient_amount);
        token_client.transfer(&env.current_contract_address(), &data.platform, &platform_amount);
        token_client.transfer(&env.current_contract_address(), &data.dispute_wallet, &dispute_amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);

        emit(&env, "released", escrow_id);
    }

    /// Release with MCP creator fee (deducted from platform share).
    /// mcp_fee_bps is in basis points of total escrow amount (10000 = 100%).
    pub fn release_with_mcp_fee(
        env: Env,
        caller: Address,
        escrow_id: String,
        mcp_creator: Address,
        mcp_fee_bps: u32,
    ) {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("already released");
        }
        if caller != data.platform {
            panic!("unauthorized: only platform may release");
        }
        if data.proof_hash.len() == 0 {
            panic!("proof not linked: call set_proof first");
        }
        if mcp_fee_bps > 2000 {
            panic!("mcp fee too high");
        }

        let token_client = token::Client::new(&env, &data.token);
        let recipient_amount = data.amount * 70 / 100;
        let mut platform_amount = data.amount * 20 / 100;
        let dispute_amount = data.amount - recipient_amount - platform_amount;
        let mcp_amount = data.amount * (mcp_fee_bps as i128) / 10000;

        if mcp_amount > platform_amount {
            panic!("mcp fee exceeds platform share");
        }

        platform_amount -= mcp_amount;

        token_client.transfer(&env.current_contract_address(), &data.recipient, &recipient_amount);
        token_client.transfer(&env.current_contract_address(), &data.platform, &platform_amount);
        if mcp_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &mcp_creator, &mcp_amount);
        }
        token_client.transfer(&env.current_contract_address(), &data.dispute_wallet, &dispute_amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);

        emit(&env, "released", escrow_id);
    }

    // =======================================================================
    // REFUND — blocked if proof submitted or disputed
    // =======================================================================

    pub fn refund(env: Env, caller: Address, escrow_id: String) {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("already released");
        }
        if caller != data.depositor {
            panic!("unauthorized: only depositor may refund");
        }
        if data.disputed {
            panic!("cannot refund disputed escrow");
        }
        if data.proof_hash.len() > 0 {
            panic!("proof already submitted, cannot refund");
        }

        let token_client = token::Client::new(&env, &data.token);
        token_client.transfer(&env.current_contract_address(), &data.depositor, &data.amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);

        emit(&env, "refunded", escrow_id);
    }

    /// Anyone can call this after the escrow has expired (timeout_at passed).
    /// Returns funds to depositor. Fails if proof already submitted.
    pub fn refund_if_expired(env: Env, escrow_id: String) {
        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("already released");
        }
        if data.proof_hash.len() > 0 {
            panic!("proof already submitted, cannot auto-refund");
        }

        let now = env.ledger().timestamp();
        if now <= data.timeout_at {
            panic!("escrow has not expired yet");
        }

        let token_client = token::Client::new(&env, &data.token);
        token_client.transfer(&env.current_contract_address(), &data.depositor, &data.amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);

        emit(&env, "expired_refund", escrow_id);
    }

    // =======================================================================
    // DISPUTE
    // =======================================================================

    pub fn dispute(env: Env, caller: Address, escrow_id: String) {
        caller.require_auth();

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("escrow already finalised");
        }
        if caller != data.recipient && caller != data.platform {
            panic!("unauthorized: only recipient or platform may dispute");
        }

        data.disputed = true;
        env.storage().persistent().set(&key, &data);

        emit(&env, "disputed", escrow_id);
    }

    /// Admin resolves a dispute by sending all funds to the winner.
    pub fn resolve_dispute(env: Env, escrow_id: String, winner: Address) {
        let _admin = require_admin(&env);

        let key = DataKey::Escrow(escrow_id.clone());
        let mut data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.released {
            panic!("already released");
        }
        if !data.disputed {
            panic!("escrow is not disputed");
        }

        let token_client = token::Client::new(&env, &data.token);
        token_client.transfer(&env.current_contract_address(), &winner, &data.amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);

        emit(&env, "dispute_resolved", escrow_id);
    }

    // =======================================================================
    // QUERIES
    // =======================================================================

    pub fn get_escrow(env: Env, escrow_id: String) -> EscrowData {
        let key = DataKey::Escrow(escrow_id);
        env.storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"))
    }

    pub fn get_status(env: Env, escrow_id: String) -> EscrowStatus {
        let key = DataKey::Escrow(escrow_id);
        let data: EscrowData = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| panic!("escrow not found"));

        if data.disputed {
            EscrowStatus::Disputed
        } else if data.released {
            EscrowStatus::Released
        } else {
            EscrowStatus::Active
        }
    }
}

#[cfg(test)]
mod test;
