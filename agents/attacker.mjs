#!/usr/bin/env node
// A watcher that copies a signed claim before it lands and tries to keep the
// money. It holds no code, only what it saw in public.
//
//   node agents/attacker.mjs --intercept
//
// Reads agents/inbox/pending-claim.json (published by `agent-b.mjs claim --hold`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, paths, view, balance, explorer } from './lib/yoru.mjs';
import { call } from './lib/chain.mjs';

const me = config().attacker;
const claim = JSON.parse(readFileSync(join(paths.inbox, 'pending-claim.json'), 'utf8'));
const { contract, cheque_id, receiver, signature } = claim;
console.log(`Attacker ${me} copied a pending claim for cheque ${cheque_id}`);

console.log('\n1. Same signature, receiver swapped to the attacker:');
try {
  const r = await call(me, contract, 'claim', { cheque_id, receiver: me, signature });
  console.log(`  UNEXPECTED: accepted ${explorer(r.hash)}`);
} catch (e) {
  console.log(`  rejected: "${e.reason}"`);
  if (e.hash) console.log(`  ${explorer(e.hash)}`);
}

console.log('\n2. Front-run with the claim unchanged:');
try {
  const r = await call(me, contract, 'claim', { cheque_id, receiver, signature });
  console.log(`  accepted, and it paid ${receiver.slice(0, 16)}..., not the attacker`);
  console.log(`  the attacker just paid B's gas: ${explorer(r.hash)}`);
} catch (e) {
  console.log(`  rejected: "${e.reason}"`);
}

console.log('\n3. Replay it again:');
try {
  await call(me, contract, 'claim', { cheque_id, receiver, signature });
  console.log('  UNEXPECTED: accepted twice');
} catch (e) {
  console.log(`  rejected: "${e.reason}"`);
}

const c = await view(contract, 'get_cheque', { cheque_id });
console.log(`\ncheque ${cheque_id}: ${c.status}, paid to ${c.receiver}`);
console.log(`attacker balance ${await balance(me)} NEAR (lower: it paid gas and got nothing)`);
