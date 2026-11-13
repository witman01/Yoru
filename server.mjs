#!/usr/bin/env node
// Yoru in one process: serves the website from web/ and runs the courier
// at POST /claim on the same origin.
//
//   npm start            # http://localhost:8787
//
// Environment:
//   PORT                  port to listen on (Railway sets this)
//   RELAYER_PRIVATE_KEY   the relayer account's key (ed25519:...); otherwise
//                         read from ~/.near-credentials
//   RELAYER_DAILY_CAP     claims per day the courier will pay for (500)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, balance } from './agents/lib/yoru.mjs';
import { createClaimHandler } from './agents/lib/relay.mjs';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), 'web');
const PORT = Number(process.env.PORT) || 8787;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
};

const handleClaim = createClaimHandler();

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = normalize(join(WEB, path));
  // Never serve anything outside web/.
  if (file !== WEB && !file.startsWith(WEB + sep)) {
    res.writeHead(403);
    return res.end();
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const cache = /\.(ogg|jpg|png|webp|svg)$/.test(file) ? 'public, max-age=604800' : 'no-cache';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

createServer((req, res) => {
  if (req.url === '/claim' || req.url.startsWith('/claim?')) return handleClaim(req, res);
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end();
  }
  serveStatic(req, res);
}).listen(PORT, async () => {
  const cfg = config();
  console.log(`Yoru on http://localhost:${PORT}  (courier ${cfg.relayer})`);
  console.log(`  relayer balance ${await balance(cfg.relayer).catch(() => '?')} NEAR`);
});
