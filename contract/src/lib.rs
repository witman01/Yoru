//! Yoru: private cheques left in escrow and collected with a code.
//!
//! The sender deposits NEAR together with an ed25519 public key that the
//! browser derived from a random claim code. Whoever knows the code can sign
//!
//!   "yoru:claim:v1" || contract_id || cheque_id (u64 LE) || receiver
//!
//! and anyone can submit that signature with `claim`, paying the gas. The
//! receiver is inside the signed bytes, so a copied transaction can only pay
//! the account it already names. A cheque left unclaimed for seven days can be
//! sent back to its sender by anyone with `refund`.

use near_sdk::json_types::U64;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
};

#[cfg(not(feature = "demo-window"))]
pub const CLAIM_WINDOW_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;
/// Three minutes, so the refund path can be shown live.
#[cfg(feature = "demo-window")]
pub const CLAIM_WINDOW_NS: u64 = 3 * 60 * 1_000_000_000;
pub const CLAIM_TAG: &[u8] = b"yoru:claim:v1";
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Open,
    /// A transfer to the receiver is in flight.
    Claiming,
    Claimed,
    /// A transfer back to the sender is in flight.
    Refunding,
    Refunded,
}

#[near(serializers = [borsh])]
pub struct Cheque {
    pub sender: AccountId,
    pub amount: NearToken,
    pub public_key: [u8; 32],
    pub created_at: u64,
    pub status: Status,
    pub receiver: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct ChequeView {
    pub id: U64,
    pub sender: AccountId,
    pub amount: NearToken,
    /// Hex.
    pub public_key: String,
    pub created_at: U64,
    pub expires_at: U64,
    pub status: Status,
    pub receiver: Option<AccountId>,
}

#[derive(BorshStorageKey)]
#[near]
enum Key {
    Cheques,
    ByKey,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    cheques: LookupMap<u64, Cheque>,
    by_key: LookupMap<[u8; 32], u64>,
    next_id: u64,
}

/// The exact bytes the claim code's key signs.
pub fn claim_message(contract_id: &AccountId, cheque_id: u64, receiver: &AccountId) -> Vec<u8> {
    let mut msg = Vec::with_capacity(CLAIM_TAG.len() + 64 + 8 + 64);
    msg.extend_from_slice(CLAIM_TAG);
    msg.extend_from_slice(contract_id.as_bytes());
    msg.extend_from_slice(&cheque_id.to_le_bytes());
    msg.extend_from_slice(receiver.as_bytes());
    msg
}

fn decode_hex<const N: usize>(value: &str, what: &str) -> [u8; N] {
    let bytes = hex::decode(value).unwrap_or_else(|_| env::panic_str(&format!("{what} is not hex")));
    bytes
        .try_into()
        .unwrap_or_else(|_| env::panic_str(&format!("{what} must be {N} bytes")))
}

fn transfer_succeeded() -> bool {
    require!(env::promise_results_count() == 1, "expected one promise result");
    // A transfer returns no data, so allow a zero-length result.
    env::promise_result_checked(0, 0).is_ok()
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            cheques: LookupMap::new(Key::Cheques),
            by_key: LookupMap::new(Key::ByKey),
            next_id: 0,
        }
    }

    /// Leave a cheque. The attached deposit, less the storage this cheque
    /// uses, is what the receiver gets.
    #[payable]
    pub fn create_cheque(&mut self, public_key: String) -> U64 {
        let public_key: [u8; 32] = decode_hex(&public_key, "public_key");
        require!(!self.by_key.contains_key(&public_key), "public_key already used");

        let id = self.next_id;
        let usage_before = env::storage_usage();
        self.cheques.insert(
            id,
            Cheque {
                sender: env::predecessor_account_id(),
                amount: NearToken::from_yoctonear(0),
                public_key,
                created_at: env::block_timestamp(),
                status: Status::Open,
                // Reserve room for the longest account id so recording the
                // receiver later never needs more storage than was paid for.
                receiver: Some("x".repeat(64).parse().unwrap()),
            },
        );
        self.by_key.insert(public_key, id);
        self.cheques.flush();
        self.by_key.flush();
        let storage_cost = env::storage_byte_cost()
            .saturating_mul((env::storage_usage() - usage_before) as u128);

        let deposit = env::attached_deposit();
        require!(deposit > storage_cost, format!("deposit must exceed storage cost of {storage_cost}"));
        let cheque = self.cheques.get_mut(&id).unwrap();
        cheque.amount = deposit.saturating_sub(storage_cost);
        cheque.receiver = None;
        self.next_id += 1;

        env::log_str(&format!("cheque {id} left for {}", cheque.amount.exact_amount_display()));
        U64(id)
    }

    /// Collect a cheque for `receiver`. Anyone may call this; the signature
    /// decides who is paid.
    pub fn claim(&mut self, cheque_id: U64, receiver: AccountId, signature: String) -> Promise {
        let signature: [u8; 64] = decode_hex(&signature, "signature");
        let contract_id = env::current_account_id();
        let cheque = self
            .cheques
            .get_mut(&cheque_id.0)
            .unwrap_or_else(|| env::panic_str("no such cheque"));
        require!(cheque.status == Status::Open, "cheque is not open");
        require!(
            env::block_timestamp() < cheque.created_at + CLAIM_WINDOW_NS,
            "cheque has expired"
        );
        let message = claim_message(&contract_id, cheque_id.0, &receiver);
        require!(
            env::ed25519_verify(&signature, &message, &cheque.public_key),
            "signature does not match this cheque and receiver"
        );

        cheque.status = Status::Claiming;
        cheque.receiver = Some(receiver.clone());
        Promise::new(receiver).transfer(cheque.amount).then(
            Self::ext(contract_id)
                .with_static_gas(CALLBACK_GAS)
                .on_claim_transfer(cheque_id),
        )
    }

    /// Send an expired, unclaimed cheque back to its sender. Anyone may call this.
    pub fn refund(&mut self, cheque_id: U64) -> Promise {
        let cheque = self
            .cheques
            .get_mut(&cheque_id.0)
            .unwrap_or_else(|| env::panic_str("no such cheque"));
        require!(cheque.status == Status::Open, "cheque is not open");
        require!(
            env::block_timestamp() >= cheque.created_at + CLAIM_WINDOW_NS,
            "cheque has not expired"
        );
        cheque.status = Status::Refunding;
        Promise::new(cheque.sender.clone()).transfer(cheque.amount).then(
            Self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_refund_transfer(cheque_id),
        )
    }

    #[private]
    pub fn on_claim_transfer(&mut self, cheque_id: U64) -> bool {
        let ok = transfer_succeeded();
        let cheque = self.cheques.get_mut(&cheque_id.0).unwrap();
        if ok {
            cheque.status = Status::Claimed;
        } else {
            // For example a named account that does not exist. The deposit
            // comes back to the contract, so the code stays good.
            cheque.status = Status::Open;
            cheque.receiver = None;
        }
        ok
    }

    #[private]
    pub fn on_refund_transfer(&mut self, cheque_id: U64) -> bool {
        let ok = transfer_succeeded();
        let cheque = self.cheques.get_mut(&cheque_id.0).unwrap();
        cheque.status = if ok { Status::Refunded } else { Status::Open };
        ok
    }

    pub fn get_cheque(&self, cheque_id: U64) -> Option<ChequeView> {
        self.cheques.get(&cheque_id.0).map(|c| view(cheque_id.0, c))
    }

    /// Find a cheque from the public key the claim code derives.
    pub fn get_cheque_by_key(&self, public_key: String) -> Option<ChequeView> {
        let public_key: [u8; 32] = decode_hex(&public_key, "public_key");
        let id = *self.by_key.get(&public_key)?;
        self.get_cheque(U64(id))
    }
}

fn view(id: u64, c: &Cheque) -> ChequeView {
    ChequeView {
        id: U64(id),
        sender: c.sender.clone(),
        amount: c.amount,
        public_key: hex::encode(c.public_key),
        created_at: U64(c.created_at),
        expires_at: U64(c.created_at + CLAIM_WINDOW_NS),
        status: c.status,
        receiver: c.receiver.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig};

    const ONE_NEAR: NearToken = NearToken::from_near(1);

    fn contract_id() -> AccountId {
        "yoru.testnet".parse().unwrap()
    }

    fn ctx(predecessor: AccountId, deposit: NearToken, at: u64) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(contract_id())
            .predecessor_account_id(predecessor)
            .attached_deposit(deposit)
            .block_timestamp(at);
        b
    }

    fn callback(at: u64, result: PromiseResult) {
        testing_env!(
            ctx(contract_id(), NearToken::from_yoctonear(0), at).build(),
            near_sdk::test_vm_config(),
            RuntimeFeesConfig::test(),
            Default::default(),
            vec![result]
        );
    }

    fn key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn sign(k: &SigningKey, id: u64, receiver: &AccountId) -> String {
        hex::encode(k.sign(&claim_message(&contract_id(), id, receiver)).to_bytes())
    }

    /// A contract holding one cheque from alice (accounts(0)), created at t=1000.
    fn setup() -> (Contract, u64) {
        testing_env!(ctx(accounts(0), ONE_NEAR, 1000).build());
        let mut c = Contract::new();
        let id = c.create_cheque(hex::encode(key().verifying_key().to_bytes())).0;
        (c, id)
    }

    #[test]
    fn create_keeps_storage_out_of_the_amount() {
        let (c, id) = setup();
        let v = c.get_cheque(U64(id)).unwrap();
        assert_eq!(v.status, Status::Open);
        assert!(v.amount < ONE_NEAR && v.amount > NearToken::from_millinear(990));
        assert_eq!(v.expires_at.0, 1000 + CLAIM_WINDOW_NS);
        let by_key = c.get_cheque_by_key(v.public_key.clone()).unwrap();
        assert_eq!(by_key.id.0, id);
    }

    #[test]
    #[should_panic(expected = "public_key already used")]
    fn rejects_a_reused_key() {
        let (mut c, _) = setup();
        c.create_cheque(hex::encode(key().verifying_key().to_bytes()));
    }

    #[test]
    #[should_panic(expected = "deposit must exceed storage cost")]
    fn rejects_a_deposit_that_only_covers_storage() {
        testing_env!(ctx(accounts(0), NearToken::from_yoctonear(1), 0).build());
        let mut c = Contract::new();
        c.create_cheque(hex::encode([1u8; 32]));
    }

    #[test]
    fn relayer_submits_and_the_named_receiver_is_paid() {
        let (mut c, id) = setup();
        let bob = accounts(1);
        // carol (accounts(2)) is the relayer and pays the gas.
        testing_env!(ctx(accounts(2), NearToken::from_yoctonear(0), 2000).build());
        c.claim(U64(id), bob.clone(), sign(&key(), id, &bob));
        let v = c.get_cheque(U64(id)).unwrap();
        assert_eq!(v.status, Status::Claiming);
        assert_eq!(v.receiver, Some(bob));

        callback(2001, PromiseResult::Successful(vec![]));
        assert!(c.on_claim_transfer(U64(id)));
        assert_eq!(c.get_cheque(U64(id)).unwrap().status, Status::Claimed);
    }

    #[test]
    #[should_panic(expected = "signature does not match")]
    fn a_copied_signature_cannot_pay_someone_else() {
        let (mut c, id) = setup();
        let sig_for_bob = sign(&key(), id, &accounts(1));
        testing_env!(ctx(accounts(3), NearToken::from_yoctonear(0), 2000).build());
        c.claim(U64(id), accounts(3), sig_for_bob);
    }

    #[test]
    #[should_panic(expected = "signature does not match")]
    fn a_signature_from_the_wrong_code_fails() {
        let (mut c, id) = setup();
        let other = SigningKey::from_bytes(&[9u8; 32]);
        testing_env!(ctx(accounts(2), NearToken::from_yoctonear(0), 2000).build());
        c.claim(U64(id), accounts(1), sign(&other, id, &accounts(1)));
    }

    #[test]
    #[should_panic(expected = "cheque is not open")]
    fn a_replay_after_the_claim_fails() {
        let (mut c, id) = setup();
        let bob = accounts(1);
        let sig = sign(&key(), id, &bob);
        testing_env!(ctx(accounts(2), NearToken::from_yoctonear(0), 2000).build());
        c.claim(U64(id), bob.clone(), sig.clone());
        callback(2001, PromiseResult::Successful(vec![]));
        c.on_claim_transfer(U64(id));
        testing_env!(ctx(accounts(3), NearToken::from_yoctonear(0), 3000).build());
        c.claim(U64(id), bob, sig);
    }

    #[test]
    fn a_failed_transfer_reopens_the_cheque() {
        let (mut c, id) = setup();
        let ghost: AccountId = "no-such-account.testnet".parse().unwrap();
        testing_env!(ctx(accounts(2), NearToken::from_yoctonear(0), 2000).build());
        c.claim(U64(id), ghost.clone(), sign(&key(), id, &ghost));
        callback(2001, PromiseResult::Failed);
        assert!(!c.on_claim_transfer(U64(id)));
        let v = c.get_cheque(U64(id)).unwrap();
        assert_eq!(v.status, Status::Open);
        assert_eq!(v.receiver, None);
    }

    #[test]
    #[should_panic(expected = "cheque has expired")]
    fn a_claim_after_seven_days_fails() {
        let (mut c, id) = setup();
        let bob = accounts(1);
        testing_env!(ctx(accounts(2), NearToken::from_yoctonear(0), 1000 + CLAIM_WINDOW_NS).build());
        c.claim(U64(id), bob.clone(), sign(&key(), id, &bob));
    }

    #[test]
    #[should_panic(expected = "cheque has not expired")]
    fn a_refund_before_seven_days_fails() {
        let (mut c, id) = setup();
        testing_env!(ctx(accounts(3), NearToken::from_yoctonear(0), 1000 + CLAIM_WINDOW_NS - 1).build());
        c.refund(U64(id));
    }

    #[test]
    fn a_refund_after_seven_days_returns_to_the_sender() {
        let (mut c, id) = setup();
        testing_env!(ctx(accounts(3), NearToken::from_yoctonear(0), 1000 + CLAIM_WINDOW_NS).build());
        c.refund(U64(id));
        assert_eq!(c.get_cheque(U64(id)).unwrap().status, Status::Refunding);
        callback(1001 + CLAIM_WINDOW_NS, PromiseResult::Successful(vec![]));
        assert!(c.on_refund_transfer(U64(id)));
        let v = c.get_cheque(U64(id)).unwrap();
        assert_eq!(v.status, Status::Refunded);
        assert_eq!(v.sender, accounts(0));
    }

    #[test]
    #[should_panic(expected = "cheque is not open")]
    fn a_refunded_cheque_cannot_be_claimed() {
        let (mut c, id) = setup();
        testing_env!(ctx(accounts(3), NearToken::from_yoctonear(0), 1000 + CLAIM_WINDOW_NS).build());
        c.refund(U64(id));
        let bob = accounts(1);
        testing_env!(ctx(accounts(2), NearToken::from_yoctonear(0), 1000).build());
        c.claim(U64(id), bob.clone(), sign(&key(), id, &bob));
    }
}
