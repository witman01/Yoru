# Yoru 夜: the full story

This is the long version of what Yoru is, why it exists and everything that
was built, written as source material for tweets, a thread or a demo
script. Every claim in it has been run on NEAR testnet; transaction links are
at the end.

---

## The one-liner

**Yoru is private claimable escrow on NEAR: leave money behind a short code,
and anyone with the code can collect it, with no wallet, no account and no
gas on the receiving side.**

Shorter: *Short code, bound receiver, gasless claim.*

## The problem

Sending crypto assumes the other side is ready. They need:

1. **An account** to receive into.
2. **Tokens for gas** to move anything.
3. **An address they have to share with you first.**

That breaks in a lot of real moments: paying an AI agent that was spun up a
second ago, tipping someone without asking for their address, paying a
bounty winner, sending money to someone with zero crypto setup, or
settling between two agents where neither holds a funded wallet.

## The idea

Leave a cheque in a night tea house. Whoever brings the word may collect it.

- The **sender** deposits NEAR into an escrow contract and gets a
  16-character claim code (like `3ZEK-2GS9-X65H-5ECW`).
- The sender gives that code to anyone, any way: a chat, a link, a QR
  code, a note on paper.
- The **receiver** types the code, picks where the money should go, and
  collects. They sign nothing with a wallet and pay no gas.
- If nobody collects within **7 days**, anyone can send it home to the
  sender.

## How it works (the clever part)

1. **The code becomes a key.** In the sender's browser, the code is
   stretched with **Argon2id** (64 MiB of memory) into an **ed25519** key
   pair. The contract stores only the public key. The code itself never
   touches the chain or any server.
2. **The receiver signs a name slip.** To claim, the code holder derives
   the same key and signs exactly these bytes:
   `"yoru:claim:v1" || contract_id || cheque_id || receiver_account`
3. **Anyone can deliver it.** The signed claim goes to a *relayer* (a
   courier), which submits the transaction and pays the gas. The contract
   checks the signature with NEAR's built-in `ed25519_verify` and pays the
   receiver named inside it.
4. **Front-running is pointless.** Because the receiver is inside the
   signed bytes, a watcher who copies the claim from the mempool and swaps
   in their own account gets *"signature does not match"*. If they submit it
   unchanged, the money still goes to the original receiver. The attacker
   just paid the receiver's gas.
5. **Nothing gets stuck.** If a transfer fails (for example to an account
   that does not exist), the contract reopens the cheque so the code still
   works. After 7 days, `refund` pays only the original sender, and anyone
   can trigger it.

### Why the code is 16 characters, not 6

The public key is on chain, so an attacker could try to guess codes offline.
Yoru uses 80 bits of randomness (16 Crockford base32 characters) *and* a
deliberately slow, memory-hard Argon2id stretch, which makes guessing
impractical. Codes are always generated, never chosen by people.

### Honest privacy

The code never goes on chain or to the relayer, and receivers never have to
publish an address in advance. But the chain does still show which account
funded a cheque and which account it paid. Yoru hides the *code* and the
*address exchange*, not the link between payer and receiver.

## Built for agents

The Agent Economy angle: agents can earn, but they can't get paid unless they
already have a funded wallet. Yoru removes that.

- **Gasless receive:** the receiving agent never sends a transaction.
- **No account needed:** a brand-new agent makes a fresh key; its *implicit
  account* (the 64-hex public key) is created by the payment itself.
- **No address exchange:** the payer hands over a code; the receiver picks
  the account at claim time.
- **The payer can go offline** after funding. It takes no part in the claim.
- **Relayers are agents too:** anyone can run the courier and pay gas.

### The agent demo (real, on testnet)

Five small Node scripts act it out:

| Agent | What it does |
|---|---|
| **Agent A** (payer) | Funds a cheque, writes only the 16-character code to Agent B's inbox |
| **Agent B** (receiver) | Has nothing but the code. Creates a brand-new account, signs a claim, sends no transaction |
| **Relayer** | Receives the signed claim over HTTP, submits it, pays the gas |
| **Attacker** | Copies the published claim and tries to redirect and replay it |
| **Refund** | After the window, sends an unclaimed cheque home, from a stranger's account |

What happened on chain:

- Agent B's account **did not exist**, and then held **0.497 NEAR**. The
  relayer paid the gas.
- The attacker swapped the receiver: **rejected** ("signature does not
  match this cheque and receiver").
- The attacker front-ran the claim unchanged: **accepted, but it paid Agent
  B**, and the attacker paid B's gas.
- The attacker replayed it: **rejected** ("cheque is not open").
- An early refund: **rejected** ("cheque has not expired"). After the
  window, a stranger triggered the refund and the money **went back to Agent
  A**.

## Use cases (the seven cards on the site)

- **Agent payment:** pay an agent that has no wallet or balance yet.
- **Agent-to-agent:** settle between agents without both needing funded wallets.
- **Bounty:** the winner receives a short code instead of sharing an address.
- **Gift:** leave money and a private note; they claim it later to any wallet or exchange.
- **Remittance:** send money to someone with zero crypto setup.
- **Emergency payment:** a one-time transfer when the other side isn't ready.
- **Tip / reward:** reward someone without asking for their address.

## The experience: a night tea house, built entirely in code

The website is a single scrolling page around a **three.js** scene of a
Japanese tea house on a rainy night. There are **no 3D model files and no
texture images**: every wall, tatami mat, lantern, shoji screen and object is
generated in code, and every surface (wood grain, washi paper, calligraphy,
the vermilion seals) is painted on a canvas at runtime.

- **The lane:** rain, red lanterns, glowing shoji, a noren curtain with 夜
  moving in the wind. The title and the one-liner float over it.
- **Use cases** at the door, as seven cards.
- **Seven objects**, each explaining one step, each clickable and draggable
  in a close-up view:
  1. 封 **The Envelope:** the gift and its 16-character code.
  2. 印 **The Seal:** the code becomes an ed25519 key; only the public half
     goes on chain.
  3. 箱 **The Lacquer Box:** the escrow contract; the lid lifts only for a
     valid signature.
  4. 宛 **The Name Slip:** the receiver is written into the signature, so a
     copy can only pay that name.
  5. 灯 **The Courier:** a lantern carried across the room; anyone (a relayer
     agent) can deliver the claim and pay the gas.
  6. 香 **The Incense:** seven marks, one per day; unclaimed, it walks home.
  7. 茶 **The Counter:** where you actually use it.
- **The counter is a hanging scroll (makimono)** with wooden rollers and
  gold caps that unrolls as you arrive, and round green seal buttons:
  - **置 Leave:** connect a wallet (Meteor or MyNearWallet), choose an
    amount, write a note (the note never goes on chain), press 封.
  - **受 Collect:** paste the code (or open a claim link) and choose where
    the money goes: **My wallet**, **New account** (no wallet at all, we make
    a key you download), or **An address** (a `.testnet` name, a 64-character
    address, an exchange deposit address, or a **0x MetaMask address**).
  - **読 Read:** look up any cheque by code or number without touching it:
    amount, status, who sent it, where it went, time left; and send it home
    after 7 days.
- **Moments that celebrate:** a "Cheque sealed" card with the code, a
  **claim link** and a **QR code**; paper ribbons fall; toasts stamp in with a
  vermilion seal. Pressing Done flies the camera to the lacquer box, which
  closes over your cheque. Receivers get a "You received X NEAR" card.
- **Safety in the interface:** a new account's key must be downloaded before
  the "received" card can close; the form locks after a successful claim so a
  code can't be pressed twice; mainnet names, pasted codes and non-existent
  accounts are caught before any gas is spent.
- **History:** a 記 History scroll lists your cheques with live status and
  everything that happened; the sender gets a toast when their cheque is
  collected.
- **Sound:** real instruments, a koto performance and a shakuhachi honkyoku
  recording (*Shika no Tōne*, Araki Kodō III), from Wikimedia Commons.

## Tech stack

- **Contract:** Rust, near-sdk 5.30, 12 unit tests (claim, stolen signature,
  replay, expiry, refund, failed transfer, storage), built with cargo-near,
  two deployments (7-day and a 3-minute demo window).
- **Crypto:** Argon2id (hash-wasm), ed25519 (@noble/ed25519 in the browser,
  near-api-js in Node), signature checked on chain with `env::ed25519_verify`.
- **Agents:** Node scripts on near-api-js v7; an HTTP relayer with per-IP
  rate limits.
- **Web:** three.js 0.180 with custom shaders (rain, dust, bloom, an
  ink-and-ember transition), NEAR Wallet Selector v10, plain HTML/CSS/JS, no
  build step.

## Proof on NEAR testnet

- Contract: `yoru-183ae9.testnet` (7 days) · demo: `yoru-demo-183ae9.testnet` (3 minutes)
- Agent A funds a cheque: https://testnet.nearblocks.io/txns/5TiTm5PhyzFbtWmGptmnVqqJv83CrRxwmNiATVLpqzz1
- Agent B claims through the relayer to a brand-new account: https://testnet.nearblocks.io/txns/EpdfGYEBVbpyKvTeDXjaBKiZKXhzddyBWNq3Cnw9PQAR
- The attacker's redirected claim, rejected: https://testnet.nearblocks.io/txns/GWQhxfWYqxNUpYP8PLhoXBGfA8V6SR4Ph3PhUqVDmLJb
- The attacker's front-run, which paid Agent B: https://testnet.nearblocks.io/txns/7eDrxJEssxJ8qi5FtkQ7LF8URoqLNNXcqU7C3vPpqsKw
- A stranger sends an expired cheque home: https://testnet.nearblocks.io/txns/1Sq3GWjAwmEPhpRwhLHpmKeaNQxvLc3vKBQ1wqKKMQx

## Limits, said plainly

- Testnet only so far. Exchange deposit addresses need mainnet, and some
  exchanges require a memo, which a plain transfer can't carry.
- The relayer runs as a single small server; a public deployment needs it
  hosted, funded and rate-limited.
- A 0x MetaMask address receives **NEAR on NEAR**, opened through a NEAR
  wallet that supports Ethereum wallets, not ETH on Ethereum.
- Whoever holds the code (or the claim link) can collect. That is the point,
  so it should be sent only to the intended person.

## Hooks for a thread

- "Agents can earn. They just can't get paid without a funded wallet. So we
  built a cheque."
- "A 16-character code is the whole receiving experience: no wallet, no
  account, no gas."
- "We tried to steal our own cheque from the mempool. The thief ended up
  paying the receiver's gas."
- "A Japanese tea house on a rainy night, built entirely in three.js code:
  no models, no textures."
- "Unclaimed? It walks home to the sender after seven incense marks."
