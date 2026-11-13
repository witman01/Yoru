// Shared pieces for the Yoru agents: claim codes, key derivation, the signed
// claim message, and read-only RPC calls.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argon2id } from 'hash-wasm';
import * as ed from '@noble/ed25519';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const paths = {
  root: ROOT,
  config: join(ROOT, 'agents', 'config.json'),
  inbox: join(ROOT, 'agents', 'inbox'),
  wallets: join(ROOT, 'agents', '.wallets'),
};

/** Accounts and contracts, written by scripts/setup (see agents/README.md). */
export function config() {
  if (!existsSync(paths.config)) throw new Error(`Missing ${paths.config}. See agents/README.md.`);
  const c = JSON.parse(readFileSync(paths.config, 'utf8'));
  return { network: 'testnet', rpc: process.env.NEAR_RPC ?? 'https://test.rpc.fastnear.com', ...c };
}

// ---------- Claim codes ----------
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 16 Crockford base32 characters = 80 random bits, shown as XXXX-XXXX-XXXX-XXXX. */
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.match(/.{4}/g).join('-');
}

/** Accepts lower case, missing dashes and the usual O/0, I/L/1 confusions. */
export function normalizeCode(code) {
  const raw = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== 16 || [...raw].some((c) => !CROCKFORD.includes(c))) {
    throw new Error('A claim code is 16 characters from 0-9 and A-Z (no I, L, O, U).');
  }
  return raw;
}

// ---------- Keys ----------
/** The code, stretched with Argon2id, is the ed25519 seed. Salted per contract. */
export async function keyFromCode(code, contractId) {
  const seed = await argon2id({
    password: normalizeCode(code),
    salt: `yoru:v1:${contractId}`,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536, // KiB = 64 MiB
    hashLength: 32,
    outputType: 'binary',
  });
  const publicKey = await ed.getPublicKeyAsync(seed);
  return { seed, publicKey };
}

/** A brand-new key whose implicit account is just its public key in hex. */
export async function freshKey() {
  const seed = ed.utils.randomSecretKey();
  const publicKey = await ed.getPublicKeyAsync(seed);
  return { seed, publicKey, accountId: hex(publicKey) };
}

export const hex = (bytes) => Buffer.from(bytes).toString('hex');

// ---------- The signed claim ----------
/** "yoru:claim:v1" || contract_id || cheque_id (u64 LE) || receiver, as in the contract. */
export function claimMessage(contractId, chequeId, receiver) {
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(BigInt(chequeId));
  return Buffer.concat([Buffer.from('yoru:claim:v1'), Buffer.from(contractId), id, Buffer.from(receiver)]);
}

export async function signClaim(seed, contractId, chequeId, receiver) {
  return hex(await ed.signAsync(claimMessage(contractId, chequeId, receiver), seed));
}

// ---------- Read-only RPC ----------
async function rpc(method, params) {
  const res = await fetch(config().rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'yoru', method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}

export async function view(contractId, method, args = {}) {
  const r = await rpc('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contractId,
    method_name: method,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  });
  return JSON.parse(Buffer.from(r.result).toString());
}

/** Account balance in NEAR, or null when the account does not exist. */
export async function balance(accountId) {
  try {
    const r = await rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: accountId });
    return formatNear(r.amount);
  } catch (e) {
    if (/UNKNOWN_ACCOUNT|does not exist/i.test(e.message)) return null;
    throw e;
  }
}

export function formatNear(yocto) {
  const s = BigInt(yocto).toString().padStart(25, '0');
  const whole = s.slice(0, -24);
  const frac = s.slice(-24, -19).replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''}`;
}

export function parseNear(near) {
  const [w, f = ''] = String(near).split('.');
  return (BigInt(w) * 10n ** 24n + BigInt((f + '0'.repeat(24)).slice(0, 24))).toString();
}

/**
 * An account's private key: RELAYER_PRIVATE_KEY for the relayer when set (a
 * hosted server has no keychain), otherwise near-cli's legacy keychain file.
 */
export function credentials(accountId) {
  if (accountId === config().relayer && process.env.RELAYER_PRIVATE_KEY) return process.env.RELAYER_PRIVATE_KEY.trim();
  const file = join(homedir(), '.near-credentials', config().network, `${accountId}.json`);
  return JSON.parse(readFileSync(file, 'utf8')).private_key;
}

export const explorer = (tx) => `https://testnet.nearblocks.io/txns/${tx}`;
export const accountLink = (id) => `https://testnet.nearblocks.io/address/${id}`;
