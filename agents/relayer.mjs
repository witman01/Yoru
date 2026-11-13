#!/usr/bin/env node
// Relayer agent on its own: accepts signed claims over HTTP and submits
// them, paying the gas. It never sees a claim code.
//
//   node agents/relayer.mjs [--port 8787]
//
// POST /claim  { contract, cheque_id, receiver, signature }
// (server.mjs runs the same courier alongside the website.)
import { createServer } from 'node:http';
import { config, balance } from './lib/yoru.mjs';
import { createClaimHandler } from './lib/relay.mjs';

const cfg = config();
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 8787;
const handleClaim = createClaimHandler();

createServer((req, res) => {
  if (req.url !== '/claim') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'POST /claim' }));
  }
  handleClaim(req, res);
}).listen(port, async () => {
  console.log(`Relayer ${cfg.relayer} listening on http://127.0.0.1:${port}/claim`);
  console.log(`  balance ${await balance(cfg.relayer)} NEAR, contracts: ${cfg.contract}, ${cfg.demoContract}`);
});
