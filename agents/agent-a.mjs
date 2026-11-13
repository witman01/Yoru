#!/usr/bin/env node
// Agent A: the payer. Leaves a cheque in escrow and hands over only the code.
//
//   node agents/agent-a.mjs pay <amount NEAR> [--demo]
//   node agents/agent-a.mjs status <cheque_id> [--demo]
//
// --demo uses the contract with a 3-minute claim window instead of 7 days.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config, paths, newCode, keyFromCode, hex, view, balance, parseNear, formatNear, explorer } from './lib/yoru.mjs';
import { call } from './lib/chain.mjs';

const [cmd, arg] = process.argv.slice(2);
const cfg = config();
const contract = process.argv.includes('--demo') ? cfg.demoContract : cfg.contract;
const me = cfg.agentA;

if (cmd === 'pay') {
  const amount = arg ?? '0.5';
  const code = newCode();
  const { publicKey } = await keyFromCode(code, contract);
  console.log(`Agent A (${me}) leaves ${amount} NEAR in ${contract}`);
  const { hash, value: id } = await call(me, contract, 'create_cheque', { public_key: hex(publicKey) }, { deposit: parseNear(amount) });
  const cheque = await view(contract, 'get_cheque', { cheque_id: id });

  // The code goes to Agent B through any channel; here, a file in its inbox.
  mkdirSync(paths.inbox, { recursive: true });
  writeFileSync(join(paths.inbox, 'agent-b.txt'), code + '\n');

  console.log(`  cheque     ${id}`);
  console.log(`  holds      ${formatNear(cheque.amount)} NEAR (deposit less storage)`);
  console.log(`  status     ${cheque.status}`);
  console.log(`  tx         ${explorer(hash)}`);
  console.log(`  code       ${code}  -> agents/inbox/agent-b.txt (the only thing B receives)`);
  console.log(`  Agent A balance now ${await balance(me)} NEAR`);
} else if (cmd === 'status') {
  const c = await view(contract, 'get_cheque', { cheque_id: arg });
  if (!c) throw new Error(`No cheque ${arg} in ${contract}`);
  const left = (Number(BigInt(c.expires_at) / 1_000_000n) - Date.now()) / 1000;
  console.log({ ...c, amount: `${formatNear(c.amount)} NEAR`, expires_in: left > 0 ? `${Math.ceil(left)} s` : 'expired' });
} else {
  console.log('usage: agent-a.mjs pay <amount> [--demo] | status <cheque_id> [--demo]');
}
