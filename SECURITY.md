# Security policy

Yoru holds other people's money in escrow, so security reports are welcome
and taken seriously.

## Status

| Component | Network | Status |
|---|---|---|
| Escrow contract (`contract/`) | NEAR testnet: `yoru-183ae9.testnet`, `yoru-demo-183ae9.testnet` | Hackathon build, **not audited** |
| Web interface (`web/`) | Local or static hosting | Hackathon build |
| Relayer (`agents/relayer.mjs`) | Local | Demo service |

Yoru is **not deployed on mainnet**. Do not use it with real funds until it
has been audited.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

- Use GitHub's private reporting:
  [Report a vulnerability](https://github.com/witman01/Yoru/security/advisories/new)
- Include the affected component, steps to reproduce, and the impact you
  expect (for example, "a claim can be redirected" or "funds can be locked").

You can expect an acknowledgement within 72 hours. Fixes for confirmed
issues are released as soon as possible, with credit to the reporter unless
you prefer otherwise.

## Security model

### What the design guarantees

| Property | How |
|---|---|
| A claim pays only the receiver it names | The receiver is inside the signed bytes `"yoru:claim:v1" ‖ contract_id ‖ cheque_id ‖ receiver`, verified on chain with `env::ed25519_verify` |
| Copying a claim from the mempool gains nothing | A changed receiver fails verification; an unchanged claim still pays the original receiver |
| A cheque pays out once | Status moves from `Open` to `Claiming`/`Claimed`; replays fail with `cheque is not open` |
| Signatures can't be reused on another deployment | The contract account id is part of the signed message |
| The courier never learns the code | It receives only `{cheque_id, receiver, signature}` |
| Funds can't be stuck forever | After 7 days anyone can call `refund`, which pays only the original sender |
| A failed transfer doesn't burn the cheque | The callback reopens it, so the code still works |

### Claim codes

The cheque's public key is on chain, so codes could in principle be guessed
offline. Codes are therefore 16 Crockford base32 characters (80 bits) from a
cryptographically secure random generator, stretched with Argon2id (64 MiB,
3 passes, salted with the contract id) before becoming an ed25519 key. Codes
are never chosen by people. Reports that show a practical way to guess codes
are in scope.

### Known limits (not vulnerabilities)

- **Bearer codes.** Anyone holding a code or claim link can collect the
  cheque. That is the intended behaviour.
- **Linkability.** The chain shows which account funded a cheque and which
  account it paid. Yoru hides the code and the address exchange, not that
  link.
- **New-account keys.** When a receiver chooses "New account", the private
  key exists only in their browser until they download it. Losing it means
  losing the funds.
- **Relayer availability.** The demo relayer is a single service with a
  per-IP rate limit. If it is down, claims can still be submitted by anyone
  else, since the contract does not care who submits.
- **Temporary under-collateralisation.** If a transfer fails, the cheque
  reopens before the refunded deposit arrives back at the contract. The gap
  lasts one receipt and is covered by the contract's balance.

## In scope

- The contract in `contract/` and its deployed testnet instances.
- Key derivation, signing and claim construction in `web/js/chain.js` and
  `agents/lib/`.
- The relayer in `agents/relayer.mjs`.

## Out of scope

- Third-party wallets (Meteor, MyNearWallet), NEAR protocol itself, RPC
  providers and CDNs.
- Social engineering of code holders.
- Denial of service against the demo relayer.
