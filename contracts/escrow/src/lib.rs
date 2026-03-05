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
    pub released: bool,
    pub disputed: bool,
    pub created_at: u64,
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

        let data = EscrowData {
            depositor,
            token,
            amount,
            recipient,
            platform,
            dispute_wallet,
            skill_id,
            released: false,
            disputed: false,
            created_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &data);
    }

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

        let token_client = token::Client::new(&env, &data.token);
        let recipient_amount = data.amount * 70 / 100;
        let platform_amount = data.amount * 20 / 100;
        let dispute_amount = data.amount - recipient_amount - platform_amount;

        token_client.transfer(&env.current_contract_address(), &data.recipient, &recipient_amount);
        token_client.transfer(&env.current_contract_address(), &data.platform, &platform_amount);
        token_client.transfer(&env.current_contract_address(), &data.dispute_wallet, &dispute_amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);
    }

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

        let token_client = token::Client::new(&env, &data.token);
        token_client.transfer(&env.current_contract_address(), &data.depositor, &data.amount);

        data.released = true;
        env.storage().persistent().set(&key, &data);
    }

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

        env.events().publish(
            (String::from_str(&env, "escrow"), String::from_str(&env, "disputed")),
            escrow_id,
        );
    }

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
