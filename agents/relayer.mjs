#!/usr/bin/env node
// Relayer agent: accepts signed claims over HTTP and submits them, paying the
// gas from its own account. It never sees a claim code.
//
//   node agents/relayer.mjs [--port 8787]
//
// POST /claim  { contract, cheque_id, receiver, signature }
import { createServer } from 'node:http';
import { config, view, balance, explorer } from './lib/yoru.mjs';
import { call } from './lib/chain.mjs';

const cfg = config();
const me = cfg.relayer;
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8787;
const contracts = new Set([cfg.contract, cfg.demoContract]);

// A small per-IP limit so a public relayer cannot be drained of gas.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

function reply(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return reply(res, 204, {});
  if (req.method !== 'POST' || req.url !== '/claim') return reply(res, 404, { error: 'POST /claim' });
  if (limited(req.socket.remoteAddress)) return reply(res, 429, { error: 'slow down' });
  let claim;
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    claim = JSON.parse(raw);
  } catch {
    return reply(res, 400, { error: 'body must be JSON' });
  }
  const { contract, cheque_id, receiver, signature } = claim;
  if (!contracts.has(contract)) return reply(res, 400, { error: `unknown contract ${contract}` });
  if (!/^[0-9a-f]{128}$/.test(signature ?? '')) return reply(res, 400, { error: 'signature must be 64 bytes of hex' });

  // A view call first, so dead claims cost nothing.
  const cheque = await view(contract, 'get_cheque', { cheque_id }).catch(() => null);
  if (!cheque) return reply(res, 404, { error: `no cheque ${cheque_id}` });
  if (cheque.status !== 'Open') return reply(res, 409, { error: `cheque ${cheque_id} is ${cheque.status}` });

  console.log(`claim  cheque ${cheque_id} -> ${receiver.slice(0, 24)}${receiver.length > 24 ? '...' : ''}`);
  try {
    const { hash, value } = await call(me, contract, 'claim', { cheque_id, receiver, signature });
    console.log(`  submitted by ${me} (gas paid here): ${explorer(hash)}`);
    console.log(`  transfer ${value ? 'delivered' : 'failed, cheque reopened'}`);
    reply(res, 200, { hash, delivered: value });
  } catch (e) {
    console.log(`  rejected by the contract: ${e.reason}`);
    reply(res, 422, { error: e.reason, hash: e.hash });
  }
}).listen(port, async () => {
  console.log(`Relayer ${me} listening on http://127.0.0.1:${port}/claim`);
  console.log(`  balance ${await balance(me)} NEAR, contracts: ${[...contracts].join(', ')}`);
});
