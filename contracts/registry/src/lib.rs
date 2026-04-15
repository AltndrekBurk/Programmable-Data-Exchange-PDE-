#![no_std]

//! PDE CID Registry Contract
//!
//! A **permissionless, owner-controlled** on-chain registry that maps
//! (owner_address, slot) → IPFS CID, with full version history.
//!
//! # Design
//!
//! Every user writes their own data under their own Stellar address.
//! Nobody else can overwrite, delete, or read-gate their entries.
//! The registry itself is neutral — no admin can censor a CID.
//!
//! A `slot` is a short string the owner chooses to namespace their entries.
//! Recommended conventions:
//!
//! | Slot                | Content                                   |
//! |---------------------|-------------------------------------------|
//! | `"policy"`          | Seller's data policy JSON                 |
//! | `"skill/<id>"`      | Buyer's skill/request JSON                |
//! | `"batch/<id>/<n>"`  | Encrypted batch payload + proof           |
//! | `"delivery/<id>"`   | Full delivery manifest (all batch CIDs)   |
//! | `"profile"`         | Public agent profile                      |
//! | any custom string   | Application-defined                       |
//!
//! Slots are arbitrary — the contract does not enforce conventions.
//!
//! # Functions
//!
//! | Function            | Who calls  | Effect                              |
//! |---------------------|------------|-------------------------------------|
//! | `put(owner, slot, cid)` | owner   | Create or update slot → CID         |
//! | `delete(owner, slot)`   | owner   | Soft-delete (keeps history)         |
//! | `get(owner, slot)`      | anyone  | Latest CidEntry for slot            |
//! | `get_version(owner, slot, v)` | anyone | Specific historical version   |
//! | `get_version_count(owner, slot)` | anyone | Number of put() calls      |
//!
//! # On-chain events (Horizon SSE)
//!
//! Every `put` emits `(cid, put)` → (owner, slot, new_cid, version).
//! Every `delete` emits `(cid, deleted)` → (owner, slot).
//!
//! Agents listen for these events on their counterpart's account via
//! Horizon SSE to detect new policies, skills, and batch deliveries
//! without polling.
//!
//! # Storage
//!
//! All entries use `persistent` storage with a 73-day TTL extension on
//! every write (6 307 200 ledgers @ ~5 s/ledger).
//! Callers should re-extend TTL for long-lived records.

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    Address, Env, String,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// (owner, slot) → CidEntry  (current / latest)
    Entry(Address, String),
    /// (owner, slot, version) → CidVersion  (immutable history)
    History(Address, String, u32),
    /// (owner, slot) → u32  (monotonic version counter; starts at 1)
    VersionCount(Address, String),
}

// ─── Data structures ─────────────────────────────────────────────────────────

/// Current state of a slot.
#[contracttype]
#[derive(Clone)]
pub struct CidEntry {
    /// Stellar address that owns this slot
    pub owner: Address,
    /// Slot name chosen by the owner
    pub slot: String,
    /// Latest IPFS CID (empty string if deleted)
    pub cid: String,
    /// Monotonic version number; incremented on every put()
    pub version: u32,
    /// Ledger timestamp of last update
    pub updated_at: u64,
    /// True after delete() is called (cid becomes empty)
    pub deleted: bool,
}

/// One immutable snapshot in a slot's history.
#[contracttype]
#[derive(Clone)]
pub struct CidVersion {
    /// IPFS CID at this version (empty if this was a delete)
    pub cid: String,
    /// Ledger timestamp when this version was written
    pub timestamp: u64,
    /// True if this version was a delete operation
    pub deleted: bool,
}

// ─── Constants ────────────────────────────────────────────────────────────────

/// 73 days in ledgers (~5 s/ledger). Extended on every write.
const TTL_LEDGERS: u32 = 6_307_200;

/// Hard cap on slot string length to prevent key bloat.
const MAX_SLOT_LEN: u32 = 128;

/// Hard cap on CID length (IPFS CIDv1 is ~59 chars; allow up to 256).
const MAX_CID_LEN: u32 = 256;

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct CidRegistry;

#[contractimpl]
impl CidRegistry {

    // =========================================================================
    // PUT — create or update a slot
    // =========================================================================

    /// Publish or update a CID for the caller's slot.
    ///
    /// `owner` must sign this transaction — only the owner can write to their
    /// own slots. Anyone else attempting to write will be rejected by the
    /// Stellar auth system (`require_auth`).
    ///
    /// On every call:
    ///   - version_count increments
    ///   - CidVersion snapshot is written to history (immutable)
    ///   - CidEntry (current) is updated
    ///   - Event emitted for SSE listeners
    pub fn put(
        env: Env,
        owner: Address,
        slot: String,
        cid: String,
    ) {
        owner.require_auth();

        if slot.len() == 0 || slot.len() > MAX_SLOT_LEN {
            panic!("slot must be 1-128 chars");
        }
        if cid.len() == 0 || cid.len() > MAX_CID_LEN {
            panic!("cid must be 1-256 chars");
        }

        let vc_key  = DataKey::VersionCount(owner.clone(), slot.clone());
        let current: u32 = env.storage().persistent().get(&vc_key).unwrap_or(0);
        let new_ver  = current + 1;
        let now      = env.ledger().timestamp();

        // Immutable history snapshot
        let hist_key = DataKey::History(owner.clone(), slot.clone(), new_ver);
        env.storage().persistent().set(&hist_key, &CidVersion {
            cid:       cid.clone(),
            timestamp: now,
            deleted:   false,
        });
        env.storage().persistent().extend_ttl(&hist_key, TTL_LEDGERS, TTL_LEDGERS);

        // Bump version counter
        env.storage().persistent().set(&vc_key, &new_ver);
        env.storage().persistent().extend_ttl(&vc_key, TTL_LEDGERS, TTL_LEDGERS);

        // Update current entry
        let entry_key = DataKey::Entry(owner.clone(), slot.clone());
        env.storage().persistent().set(&entry_key, &CidEntry {
            owner:      owner.clone(),
            slot:       slot.clone(),
            cid:        cid.clone(),
            version:    new_ver,
            updated_at: now,
            deleted:    false,
        });
        env.storage().persistent().extend_ttl(&entry_key, TTL_LEDGERS, TTL_LEDGERS);

        // SSE event: (owner, slot, cid, version)
        env.events().publish(
            (symbol_short!("cid"), symbol_short!("put")),
            (owner, slot, cid, new_ver),
        );
    }

    // =========================================================================
    // DELETE — soft delete keeps history intact
    // =========================================================================

    /// Mark a slot as deleted. The history remains readable.
    ///
    /// After delete:
    ///   - CidEntry.deleted = true, cid = ""
    ///   - A CidVersion with deleted=true is appended to history
    ///   - A new put() on the same slot will restore it
    pub fn delete(
        env: Env,
        owner: Address,
        slot: String,
    ) {
        owner.require_auth();

        let entry_key = DataKey::Entry(owner.clone(), slot.clone());
        let mut entry: CidEntry = env.storage().persistent()
            .get(&entry_key)
            .expect("slot not found");

        if entry.owner != owner {
            panic!("not your slot");
        }
        if entry.deleted {
            panic!("slot already deleted");
        }

        let vc_key   = DataKey::VersionCount(owner.clone(), slot.clone());
        let current: u32 = env.storage().persistent().get(&vc_key).unwrap_or(0);
        let new_ver  = current + 1;
        let now      = env.ledger().timestamp();

        // History snapshot for delete event
        let hist_key = DataKey::History(owner.clone(), slot.clone(), new_ver);
        env.storage().persistent().set(&hist_key, &CidVersion {
            cid:       String::from_str(&env, ""),
            timestamp: now,
            deleted:   true,
        });
        env.storage().persistent().extend_ttl(&hist_key, TTL_LEDGERS, TTL_LEDGERS);

        // Bump version
        env.storage().persistent().set(&vc_key, &new_ver);
        env.storage().persistent().extend_ttl(&vc_key, TTL_LEDGERS, TTL_LEDGERS);

        // Update entry
        entry.cid       = String::from_str(&env, "");
        entry.version   = new_ver;
        entry.updated_at = now;
        entry.deleted   = true;
        env.storage().persistent().set(&entry_key, &entry);
        env.storage().persistent().extend_ttl(&entry_key, TTL_LEDGERS, TTL_LEDGERS);

        env.events().publish(
            (symbol_short!("cid"), symbol_short!("deleted")),
            (owner, slot),
        );
    }

    // =========================================================================
    // READ-ONLY QUERIES
    // =========================================================================

    /// Get the latest CidEntry for a given (owner, slot).
    /// Panics if slot has never been written.
    pub fn get(env: Env, owner: Address, slot: String) -> CidEntry {
        env.storage().persistent()
            .get(&DataKey::Entry(owner, slot))
            .expect("slot not found")
    }

    /// Get a specific historical version (1-indexed).
    /// Version 1 = first put(), version N = latest.
    pub fn get_version(
        env: Env,
        owner: Address,
        slot: String,
        version: u32,
    ) -> CidVersion {
        if version == 0 {
            panic!("version is 1-indexed");
        }
        env.storage().persistent()
            .get(&DataKey::History(owner, slot, version))
            .expect("version not found")
    }

    /// How many times put() or delete() has been called for this slot.
    /// Returns 0 if slot has never been written.
    pub fn get_version_count(
        env: Env,
        owner: Address,
        slot: String,
    ) -> u32 {
        env.storage().persistent()
            .get(&DataKey::VersionCount(owner, slot))
            .unwrap_or(0)
    }

    /// True if the slot exists and is not deleted.
    pub fn exists(env: Env, owner: Address, slot: String) -> bool {
        let entry_key = DataKey::Entry(owner, slot);
        if !env.storage().persistent().has(&entry_key) {
            return false;
        }
        let entry: CidEntry = env.storage().persistent().get(&entry_key).unwrap();
        !entry.deleted
    }
}

#[cfg(test)]
mod test;
