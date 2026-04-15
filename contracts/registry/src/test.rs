#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, String};

fn s(env: &Env, v: &str) -> String { String::from_str(env, v) }

// ─── 1. Put + Get ─────────────────────────────────────────────────────────────

#[test]
fn put_and_get_round_trips() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let client = CidRegistryClient::new(&env, &cid);

    let alice  = Address::generate(&env);
    let slot   = s(&env, "policy");
    let ipfs   = s(&env, "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");

    client.put(&alice, &slot, &ipfs);

    let entry = client.get(&alice, &slot);
    assert_eq!(entry.cid,     ipfs);
    assert_eq!(entry.version, 1);
    assert!(!entry.deleted);
    assert_eq!(entry.owner, alice);
}

// ─── 2. Update increments version ────────────────────────────────────────────

#[test]
fn update_increments_version_and_keeps_history() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let bob = Address::generate(&env);
    let slot = s(&env, "skill/001");

    let cid1 = s(&env, "bafy-v1");
    let cid2 = s(&env, "bafy-v2");
    let cid3 = s(&env, "bafy-v3");

    c.put(&bob, &slot, &cid1);
    c.put(&bob, &slot, &cid2);
    c.put(&bob, &slot, &cid3);

    let entry = c.get(&bob, &slot);
    assert_eq!(entry.version, 3);
    assert_eq!(entry.cid, cid3);

    // History must be immutable
    assert_eq!(c.get_version(&bob, &slot, &1).cid, cid1);
    assert_eq!(c.get_version(&bob, &slot, &2).cid, cid2);
    assert_eq!(c.get_version(&bob, &slot, &3).cid, cid3);

    assert_eq!(c.get_version_count(&bob, &slot), 3);
}

// ─── 3. Soft delete ──────────────────────────────────────────────────────────

#[test]
fn delete_marks_slot_deleted_history_preserved() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let alice = Address::generate(&env);
    let slot  = s(&env, "policy");

    c.put(&alice, &slot, &s(&env, "bafy-old"));
    c.delete(&alice, &slot);

    let entry = c.get(&alice, &slot);
    assert!(entry.deleted);
    assert_eq!(entry.version, 2);

    // Version 1 still readable
    let v1 = c.get_version(&alice, &slot, &1);
    assert_eq!(v1.cid, s(&env, "bafy-old"));
    assert!(!v1.deleted);

    // Version 2 = delete marker
    let v2 = c.get_version(&alice, &slot, &2);
    assert!(v2.deleted);

    // Restore by putting again
    c.put(&alice, &slot, &s(&env, "bafy-new"));
    let restored = c.get(&alice, &slot);
    assert!(!restored.deleted);
    assert_eq!(restored.version, 3);
}

// ─── 4. exists() helper ──────────────────────────────────────────────────────

#[test]
fn exists_returns_correct_state() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let u   = Address::generate(&env);
    let slot = s(&env, "profile");

    assert!(!c.exists(&u, &slot));

    c.put(&u, &slot, &s(&env, "bafy-123"));
    assert!(c.exists(&u, &slot));

    c.delete(&u, &slot);
    assert!(!c.exists(&u, &slot));
}

// ─── 5. Isolation between owners ─────────────────────────────────────────────

#[test]
fn different_owners_same_slot_isolated() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);

    let alice = Address::generate(&env);
    let bob   = Address::generate(&env);
    let slot  = s(&env, "policy");

    c.put(&alice, &slot, &s(&env, "bafy-alice"));
    c.put(&bob,   &slot, &s(&env, "bafy-bob"));

    assert_eq!(c.get(&alice, &slot).cid, s(&env, "bafy-alice"));
    assert_eq!(c.get(&bob,   &slot).cid, s(&env, "bafy-bob"));
    assert_eq!(c.get_version_count(&alice, &slot), 1);
    assert_eq!(c.get_version_count(&bob,   &slot), 1);
}

// ─── 6. Guard rails ──────────────────────────────────────────────────────────

#[test]
#[should_panic(expected = "slot not found")]
fn get_nonexistent_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let u   = Address::generate(&env);
    c.get(&u, &String::from_str(&env, "no-such-slot"));
}

#[test]
#[should_panic(expected = "slot already deleted")]
fn double_delete_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let u   = Address::generate(&env);
    let slot = String::from_str(&env, "x");
    c.put(&u, &slot, &String::from_str(&env, "bafy-x"));
    c.delete(&u, &slot);
    c.delete(&u, &slot); // must panic
}

#[test]
#[should_panic(expected = "cid must be 1-256 chars")]
fn empty_cid_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let u   = Address::generate(&env);
    c.put(&u, &String::from_str(&env, "s"), &String::from_str(&env, ""));
}

#[test]
#[should_panic(expected = "slot must be 1-128 chars")]
fn empty_slot_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let cid = env.register(CidRegistry, ());
    let c   = CidRegistryClient::new(&env, &cid);
    let u   = Address::generate(&env);
    c.put(&u, &String::from_str(&env, ""), &String::from_str(&env, "bafy-x"));
}
