// The courier: accepts signed claims and submits them, paying the gas from
// its own account. It never sees a claim code. Used by agents/relayer.mjs
// and by server.mjs (which also serves the website).
import { config, view, explorer } from './yoru.mjs';
import { call } from './chain.mjs';

/** Returns an async (req, res) handler for POST /claim. */
export function createClaimHandler({ log = console.log } = {}) {
  const cfg = config();
  const me = cfg.relayer;
  const contracts = new Set([cfg.contract, cfg.demoContract]);
  const dailyCap = Number(process.env.RELAYER_DAILY_CAP ?? 500);

  // Per-IP and per-day limits so a public relayer cannot be drained of gas.
  const hits = new Map();
  let day = new Date().toDateString();
  let today = 0;
  const limited = (ip) => {
    const now = Date.now();
    if (new Date().toDateString() !== day) {
      day = new Date().toDateString();
      today = 0;
    }
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    recent.push(now);
    hits.set(ip, recent);
    return recent.length > 20 || today >= dailyCap;
  };

  const reply = (res, status, body) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(status === 204 ? '' : JSON.stringify(body));
  };

  return async function handleClaim(req, res) {
    if (req.method === 'OPTIONS') return reply(res, 204, {});
    if (req.method !== 'POST') return reply(res, 405, { error: 'POST /claim' });
    // Behind a proxy (Railway), the client is the first forwarded address.
    const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
    if (limited(ip)) return reply(res, 429, { error: 'The courier is resting. Try again in a minute.' });

    let claim;
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 4096) return reply(res, 413, { error: 'claim too large' });
      }
      claim = JSON.parse(raw);
    } catch {
      return reply(res, 400, { error: 'body must be JSON' });
    }
    const { contract, cheque_id, receiver, signature } = claim ?? {};
    if (!contracts.has(contract)) return reply(res, 400, { error: `unknown contract ${contract}` });
    if (!/^\d+$/.test(String(cheque_id))) return reply(res, 400, { error: 'cheque_id must be a number' });
    if (typeof receiver !== 'string' || receiver.length < 2 || receiver.length > 64) return reply(res, 400, { error: 'bad receiver' });
    if (!/^[0-9a-f]{128}$/.test(signature ?? '')) return reply(res, 400, { error: 'signature must be 64 bytes of hex' });

    // A view call first, so dead claims cost nothing.
    const cheque = await view(contract, 'get_cheque', { cheque_id: String(cheque_id) }).catch(() => null);
    if (!cheque) return reply(res, 404, { error: `no cheque ${cheque_id}` });
    if (cheque.status !== 'Open') return reply(res, 409, { error: `cheque ${cheque_id} is ${cheque.status}` });

    today++;
    log(`claim  cheque ${cheque_id} -> ${receiver.slice(0, 24)}${receiver.length > 24 ? '...' : ''}`);
    try {
      const { hash, value } = await call(me, contract, 'claim', { cheque_id: String(cheque_id), receiver, signature });
      log(`  submitted by ${me} (gas paid here): ${explorer(hash)}`);
      log(`  transfer ${value ? 'delivered' : 'failed, cheque reopened'}`);
      reply(res, 200, { hash, delivered: value });
    } catch (e) {
      log(`  rejected by the contract: ${e.reason}`);
      reply(res, 422, { error: e.reason, hash: e.hash });
    }
  };
}
