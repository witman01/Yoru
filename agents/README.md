# Yoru agents

Five small Node scripts that act out an agent-to-agent payment on NEAR
testnet. They share `lib/yoru.mjs` (codes, Argon2id key derivation, the
signed claim message) with the same rules as the web interface.

| Script         | Role                                                              |
|----------------|-------------------------------------------------------------------|
| `agent-a.mjs`  | The payer: funds a cheque and writes only the code to B's inbox   |
| `agent-b.mjs`  | The receiver: no account, no tokens; signs a claim from the code  |
| `relayer.mjs`  | Accepts signed claims over HTTP and submits them, paying the gas  |
| `attacker.mjs` | Copies a published claim and tries to redirect or replay it       |
| `refund.mjs`   | Sends an expired cheque back to its sender; anyone may run it     |

## Setup

```
npm install
```

`agents/config.json` names the contracts and accounts. Keys are read from
near-cli's legacy keychain (`~/.near-credentials/testnet/<account>.json`).
To use your own accounts, create them with

```
near account create-account sponsor-by-faucet-service <name>.testnet \
  autogenerate-new-keypair save-to-legacy-keychain network-config testnet create
```

and put their names in `config.json`.

## Run

```
node agents/relayer.mjs                      # keep running in its own terminal
node agents/agent-a.mjs pay 0.5              # A funds a cheque
node agents/agent-b.mjs claim                # B claims to a brand-new account
node agents/agent-b.mjs claim --hold         # B publishes its claim unsent...
node agents/attacker.mjs --intercept         # ...and a watcher tries to steal it
node agents/agent-a.mjs pay 0.2 --demo       # 3-minute window contract
node agents/refund.mjs <cheque_id> --demo    # after 3 minutes, from any account
```

`--demo` targets the contract built with `--features demo-window`, whose
claim window is 3 minutes instead of 7 days.
