# Yoru 夜

**Private claimable escrow on NEAR. Short code, bound receiver, gasless claim.**

![The lane outside the tea house, with the Yoru title](docs/screenshots/hero.jpg)

Yoru lets an AI agent pay another agent, or a person, with a short claim
code. The receiver needs no NEAR account, no tokens and no wallet. Anyone,
such as a relayer agent, can submit the claim and pay its gas. An escrow
contract on NEAR releases the funds only against an ed25519 signature
derived from the code. That signature names the receiving account, so a
transaction copied from the mempool can only pay the account it already
names. Cheques that nobody claims go back to the payer after seven days.

## Why agents need this

- **Gasless receive.** The receiving agent never sends a transaction.
  Whoever submits its signed claim pays the gas.
- **No account or balance needed.** A brand-new agent can use a fresh
  implicit account. The payment creates it.
- **No address exchange.** The payer hands over a code. The receiver picks
  the account when it claims.
- **Front-running doesn't pay.** The receiver is inside the signed bytes.
  A copied claim can only pay the account it already names.
- **The payer can go offline.** It funds the cheque and is done. Unclaimed
  cheques can be refunded to it by anyone after seven days.
- **Private-ish, honestly.** The code never touches the chain or the
  relayer. The chain still shows who funded a cheque and who it paid.

Full rationale, the judge demo script and track notes:
[docs/submission.md](docs/submission.md).

## How it works

1. The payer's browser or agent generates a random 16-character code
   (80 bits) and stretches it with Argon2id into an ed25519 key pair.
2. `create_cheque(public_key)` deposits the NEAR. The contract keeps only
   the public key.
3. The code holder signs
   `"yoru:claim:v1" || contract_id || cheque_id (u64 LE) || receiver`.
4. Anyone calls `claim(cheque_id, receiver, signature)`. The contract
   checks the signature with `env::ed25519_verify` and pays `receiver`. If
   the transfer fails, the cheque reopens.
5. After seven days, anyone can call `refund(cheque_id)`, which pays only
   the sender.

## The experience

A Japanese tea house on a rainy night, built entirely in three.js code: no
3D models and no texture files. Scrolling walks you through seven objects,
one per step of the protocol, to the counter where you use it.

![Use cases at the tea house door](docs/screenshots/use-cases.jpg)

| | |
|---|---|
| ![The Seal: the code becomes an ed25519 key](docs/screenshots/the-seal.jpg) | ![Close-up of the lacquer box, drag to turn](docs/screenshots/closeup-lacquer-box.jpg) |
| **The Seal.** Each object explains one step of the protocol. | **Close-ups.** Click an object to turn it and watch it work. |
| ![The counter scroll with the Collect tab](docs/screenshots/counter-scroll.jpg) | ![The "You received" card after a real claim](docs/screenshots/received.jpg) |
| **The counter.** A hanging scroll: Leave, Collect or Read. Collect to your wallet, a new account or any address. | **A real claim.** 0.2471 NEAR delivered to `witman.testnet`; the courier paid the gas. |
| ![History scroll with live cheque status](docs/screenshots/history.jpg) | ![Read: look a cheque up without touching it](docs/screenshots/read.jpg) |
| **History.** Your cheques with live status, and a toast when one is collected. | **Read.** Look any cheque up by code or number. |

<img src="docs/screenshots/mobile.jpg" alt="Yoru on a phone" width="260" />

Leaving a cheque gives you the code once, plus a claim link and a QR code.
Collecting needs no wallet: choose **My wallet**, a **New account** (you
download its key), or paste **an address** (`name.testnet`, a 64-character
address, an exchange deposit address or a `0x…` MetaMask address).

## Live on NEAR testnet

| Contract                    | Claim window | Used for                  |
|-----------------------------|--------------|---------------------------|
| `yoru-183ae9.testnet`       | 7 days       | The site and the agents   |
| `yoru-demo-183ae9.testnet`  | 3 minutes    | Showing the refund live   |

## Repository

| Path        | What                                                              |
|-------------|-------------------------------------------------------------------|
| `contract/` | Rust escrow contract (near-sdk 5), 12 unit tests                   |
| `agents/`   | Agent A, Agent B, a relayer, an attacker and a refunder (Node)     |
| `web/`      | The web interface: a night tea house built in three.js            |
| `web/audio/`| Koto (CC BY 3.0, Torsodog) and shakuhachi (public domain) recordings from Wikimedia Commons |
| `docs/`     | Submission materials, the judge demo script, the project story and screenshots |

## Run it

```
npm install
node agents/relayer.mjs              # the courier: submits claims, pays gas
node agents/agent-a.mjs pay 0.5      # in another terminal
node agents/agent-b.mjs claim
```

The website (needs the relayer running for Collect):

```
cd web
python -m http.server 5180           # then open http://127.0.0.1:5180
```

Contract:

```
cd contract
cargo test                                               # 12 unit tests
cargo near build non-reproducible-wasm --no-abi          # 7-day build
cargo near build non-reproducible-wasm --no-abi --features demo-window
```

On Windows with the GNU Rust toolchain, `cargo test` needs MinGW-w64
installed at a path without spaces.
