#!/usr/bin/env node
// Sends an expired, unclaimed cheque back to its sender. Anyone may run it;
// by default it signs as the attacker account to show that.
//
//   node agents/refund.mjs <cheque_id> [--demo] [--as <account>]
import { config, view, balance, formatNear, explorer } from './lib/yoru.mjs';
import { call } from './lib/chain.mjs';

const args = process.argv.slice(2);
const cfg = config();
const contract = args.includes('--demo') ? cfg.demoContract : cfg.contract;
const asIdx = args.indexOf('--as');
const signer = asIdx >= 0 ? args[asIdx + 1] : cfg.attacker;
const id = args[0];

const c = await view(contract, 'get_cheque', { cheque_id: id });
if (!c) throw new Error(`No cheque ${id} in ${contract}`);
const left = Math.ceil((Number(BigInt(c.expires_at) / 1_000_000n) - Date.now()) / 1000);
console.log(`cheque ${id}: ${formatNear(c.amount)} NEAR from ${c.sender}, ${c.status}, ${left > 0 ? `expires in ${left} s` : 'expired'}`);
const before = await balance(c.sender);
console.log(`refund requested by ${signer} (not the sender)`);
try {
  const { hash, value } = await call(signer, contract, 'refund', { cheque_id: id });
  console.log(`  ${value ? 'returned to the sender' : 'transfer failed, cheque reopened'}: ${explorer(hash)}`);
  await new Promise((r) => setTimeout(r, 2000));
  console.log(`  ${c.sender}: ${before} -> ${await balance(c.sender)} NEAR`);
} catch (e) {
  console.log(`  rejected: "${e.reason}"`);
}
