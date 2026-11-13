#!/usr/bin/env node
// Agent B: the receiver. Holds only the code: no account, no tokens, no gas.
//
//   node agents/agent-b.mjs claim [--demo] [--to <account>] [--hold]
//   node agents/agent-b.mjs send
//
// claim  derives the key from the code, picks a receiver (a fresh implicit
//        account unless --to is given), signs the claim and posts it to the
//        relayer. B never sends a transaction itself.
// --hold publishes the signed claim to agents/inbox/pending-claim.json without
//        sending it, so the attacker can try to steal it first.
// send   posts a held claim to the relayer.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, paths, keyFromCode, hex, view, balance, signClaim, formatNear, explorer, accountLink } from './lib/yoru.mjs';
import { newImplicitKey } from './lib/chain.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const cfg = config();
const contract = args.includes('--demo') ? cfg.demoContract : cfg.contract;
const pendingFile = join(paths.inbox, 'pending-claim.json');
const relayer = process.env.RELAYER_URL ?? 'http://127.0.0.1:8787/claim';

async function send(claim) {
  console.log(`Agent B posts the signed claim to the relayer (${relayer})`);
  const res = await fetch(relayer, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(claim) });
  const body = await res.json();
  if (!res.ok) {
    console.log(`  relayer refused: ${body.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`  relayer submitted it and paid the gas: ${explorer(body.hash)}`);
  const after = await waitForBalance(claim.receiver);
  console.log(`  ${claim.receiver} now holds ${after ?? '?'} NEAR`);
  console.log(`  ${accountLink(claim.receiver)}`);
}

async function waitForBalance(id) {
  for (let i = 0; i < 20; i++) {
    const b = await balance(id);
    if (b !== null && b !== '0') return b;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return balance(id);
}

if (args[0] === 'claim') {
  const code = flag('--code') ?? readFileSync(join(paths.inbox, 'agent-b.txt'), 'utf8').trim();
  console.log(`Agent B has one thing: the code ${code}`);
  const { seed, publicKey } = await keyFromCode(code, contract);
  const cheque = await view(contract, 'get_cheque_by_key', { public_key: hex(publicKey) });
  if (!cheque) throw new Error('No cheque matches this code.');
  console.log(`  it opens cheque ${cheque.id}: ${formatNear(cheque.amount)} NEAR, ${cheque.status}`);

  let receiver = flag('--to');
  if (!receiver) {
    // A brand-new key. Its implicit account does not exist until it is paid.
    const k = newImplicitKey();
    receiver = k.accountId;
    mkdirSync(paths.wallets, { recursive: true });
    writeFileSync(join(paths.wallets, `agent-b-${receiver.slice(0, 8)}.json`), JSON.stringify({ account_id: receiver, private_key: k.secretKey }, null, 2));
    console.log(`  new receiver account ${receiver}`);
    console.log(`  (key saved in agents/.wallets/agent-b-${receiver.slice(0, 8)}.json)`);
  }
  const before = await balance(receiver);
  console.log(`  receiver on chain before the claim: ${before === null ? 'does not exist' : `${before} NEAR`}`);

  const signature = await signClaim(seed, contract, cheque.id, receiver);
  const claim = { contract, cheque_id: cheque.id, receiver, signature };
  console.log(`  signed: "yoru:claim:v1" || ${contract} || ${cheque.id} || ${receiver.slice(0, 16)}...`);

  if (args.includes('--hold')) {
    mkdirSync(paths.inbox, { recursive: true });
    writeFileSync(pendingFile, JSON.stringify(claim, null, 2));
    console.log('  claim published to agents/inbox/pending-claim.json, not sent yet');
    console.log('  (anyone can see it now: try `node agents/attacker.mjs --intercept`)');
  } else {
    await send(claim);
  }
} else if (args[0] === 'send') {
  if (!existsSync(pendingFile)) throw new Error('No held claim. Run `agent-b.mjs claim --hold` first.');
  await send(JSON.parse(readFileSync(pendingFile, 'utf8')));
} else {
  console.log('usage: agent-b.mjs claim [--demo] [--to <account>] [--code <code>] [--hold] | send');
}
