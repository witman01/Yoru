# Yoru: submission materials

Five pieces, each ready to paste into the README, the submission form or the
demo post.

---

## 1. Project description

Yoru lets an AI agent pay another agent, or a person, with a short claim
code. The receiver needs no NEAR account, no tokens and no wallet. Anyone,
such as a relayer agent, can submit the claim and pay its gas. An escrow
contract on NEAR releases the funds only against an ed25519 signature
derived from the code. That signature names the receiving account, so a
transaction copied from the mempool can only pay the account it already
names. Cheques that nobody claims go back to the payer after seven days.

**Short version (one line):** Private claimable escrow on NEAR. Short code,
bound receiver, gasless claim.

---

## 2. README section: why agents need this

### Why Yoru is built for agents

Paying an agent on chain usually means the agent already has a funded
account. It needs an account to receive, tokens to pay gas, and the payer
has to learn its address first. A new agent spun up for a single job has
none of these. Yoru removes all three.

- **Gasless receive.** The receiving agent never sends a transaction. It
  signs a message with the key derived from the code and hands it to anyone
  willing to submit it: a relayer agent, the payer, or a watcher. Whoever
  submits pays the gas.
- **No account or balance needed.** The receiving agent can make a fresh
  ed25519 key and use its implicit account ID (64 hex characters). The
  NEAR transfer creates that account. So a brand-new agent can be paid
  before it has ever held a token.
- **No address exchange.** The payer only hands over a code. The receiver
  picks the account at claim time, so it never has to publish an address
  to get paid.
- **Front-running doesn't pay.** The signed bytes are
  `"yoru:claim:v1" || contract_id || cheque_id || receiver`. Swap in a
  different receiver and the signature fails. Replay it unchanged and the
  money still goes to the original receiver. An agent watching the mempool
  gains nothing, and if it submits first it has just paid someone else's
  gas.
- **The payer doesn't have to be online.** After funding the cheque, the
  paying agent takes no part in the claim: no signature, no gas, no
  callback. If nobody claims within seven days, anyone can trigger the
  refund back to the payer.
- **Private-ish, honestly.** The code never goes on chain or to the
  relayer. The relayer sees only the cheque id, the receiver and a
  signature. The chain does still show which account funded a cheque and
  which account it paid, so Yoru hides the *code* and the *address
  exchange*, not the link between payer and receiver.

### Where it fits

Yoru handles the payment half of agent work. Two agents agree on a price
off-chain, for example in a chat, a task market or an API negotiation. The
payer drops a code into that channel, and the worker claims it when the job
is done. It can sit beside a marketplace's own escrow, for one-off payments
or for agents that should never have to hold gas.

### What the claim code protects against

The public key lives on chain, so the code could in theory be guessed
offline. Codes are therefore 16 characters (80 bits) from a random
generator, and stretched through Argon2id (64 MiB) before becoming a key.
That makes guessing impractical. Codes are never chosen by people.

---

## 3. Demo script: agent pays agent

NEAR testnet, live contracts:
`yoru-183ae9.testnet` (7-day window) and `yoru-demo-183ae9.testnet`
(3-minute window, for the refund step). Each step says what to run and what
you should see. Every "See" below has already happened on testnet; the links
are from that run.

**Setup**
```
git clone <repo> && cd yoru && npm install
node agents/relayer.mjs        # leave running in its own terminal
```
To use your own testnet accounts instead, see `agents/README.md`.

**1. Agent A pays.**
`node agents/agent-a.mjs pay 0.5`
See: a cheque id, the amount held (deposit less about 0.003 NEAR of
storage), `status Open`, an explorer link and a 16-character code.
([create_cheque](https://testnet.nearblocks.io/txns/5TiTm5PhyzFbtWmGptmnVqqJv83CrRxwmNiATVLpqzz1))

**2. Agent A hands Agent B only the code.**
A writes the code to `agents/inbox/agent-b.txt`, standing in for a chat
message or a task-market reply.
See: the file holds 16 characters and nothing else: no keys, no account.

**3. Agent B claims with no account at all.**
`node agents/agent-b.mjs claim`
See: B makes a fresh key and prints its implicit account ID, then
`receiver on chain before the claim: does not exist`. B signs the claim and
posts `{cheque_id, receiver, signature}` to the relayer. B sends no
transaction.

**4. A relayer agent submits and pays the gas.**
See, in the relayer's terminal and on the explorer: the transaction is
signed by `yoru-relayer-183ae9.testnet`, which paid the gas, and the
transfer creates B's account holding 0.497 NEAR.
([claim](https://testnet.nearblocks.io/txns/EpdfGYEBVbpyKvTeDXjaBKiZKXhzddyBWNq3Cnw9PQAR),
[B's new account](https://testnet.nearblocks.io/address/4d237087b84e364a5a29776e625ddb81a0bf36a312e8beb1d5e5279c1c45b058))

**5. A mempool watcher tries to steal it.**
```
node agents/agent-a.mjs pay 0.3
node agents/agent-b.mjs claim --hold      # signed claim published, not sent
node agents/attacker.mjs --intercept
```
See, in order:
1. The claim with the receiver swapped to the attacker:
   `signature does not match this cheque and receiver`
   ([rejected](https://testnet.nearblocks.io/txns/GWQhxfWYqxNUpYP8PLhoXBGfA8V6SR4Ph3PhUqVDmLJb)).
2. The claim front-run unchanged: accepted, and it pays **B**. The attacker
   just paid B's gas
   ([accepted](https://testnet.nearblocks.io/txns/7eDrxJEssxJ8qi5FtkQ7LF8URoqLNNXcqU7C3vPpqsKw)).
3. A replay: `cheque is not open`.

**6. Nobody claims: the refund.**
```
node agents/agent-a.mjs pay 0.2 --demo
node agents/refund.mjs <cheque_id> --demo     # right away
```
See: `cheque has not expired`. After 3 minutes, run the refund again (it
signs as the attacker account, to show anyone can).
See: `returned to the sender`, and Agent A's balance rises by the cheque
amount ([refund](https://testnet.nearblocks.io/txns/1Sq3GWjAwmEPhpRwhLHpmKeaNQxvLc3vKBQ1wqKKMQx)).
A late `agent-b.mjs claim --demo` is refused: `cheque 0 is Refunded`.

**The same thing, for people.**
`cd web && python -m http.server 5180`, open http://127.0.0.1:5180 and
scroll to the counter:
- **Collect:** paste a code, choose "I have no account" and press Collect.
  The relayer pays and you get a link to the transaction plus a key file
  for the new account.
- **Leave a cheque:** connect MyNearWallet or Meteor (testnet), then seal
  the envelope. The code is shown once.

---

## 4. Tracks

- **Agent Economy** (primary): agents paying agents with no funded wallet
  on the receiving side, and relayer agents paying gas.
- **Privacy**: the claim code never touches the chain or the relayer, and
  receivers don't have to publish an address in advance.
- **Real-World Money** (optional): gifts, remittances, bounties and tips to
  people with no crypto setup.

---

## 5. X demo post

Agents can earn, but they can't get paid unless they already have a funded
wallet: an account to receive, gas to move, and an address someone has to
ask for. Yoru fixes that on NEAR. The payer leaves a cheque in escrow and
sends a 16-character code. The receiving agent, even one created a second
ago, signs a claim naming its own account, and anyone can submit it and pay
the gas. Copy the claim from the mempool and it still pays the same agent.
Unclaimed after 7 days, it goes home.
