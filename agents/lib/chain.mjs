// Signing and sending transactions with near-api-js.
import { Account, KeyPair } from 'near-api-js';
import { config, credentials, hex } from './yoru.mjs';

export const TGAS = 10n ** 12n;

export function account(accountId, secretKey = credentials(accountId)) {
  return new Account(accountId, config().rpc, secretKey);
}

/** The contract's panic text from a failed transaction, if any. */
export function panicOf(err) {
  const text = `${err?.message ?? ''} ${safeJson(err?.transactionResult ?? err)}`;
  const m = text.match(/Smart contract panicked: ([^"\\]+)/) ?? text.match(/FunctionCallError[^:]*: ([^"\\]+)/);
  return m ? m[1].trim() : err?.message ?? String(err);
}

function safeJson(x) {
  try {
    return JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return '';
  }
}

/**
 * Calls a contract method from `signerId`. Resolves to { hash, value } or
 * rejects with { hash, reason } when the contract panics.
 */
export async function call(signerId, contractId, methodName, args, { deposit = 0n, gas = 60n * TGAS, secretKey } = {}) {
  const acc = account(signerId, secretKey);
  try {
    const r = await acc.callFunctionRaw({ contractId, methodName, args, deposit: BigInt(deposit), gas: BigInt(gas) });
    const ok = r.status?.SuccessValue;
    const value = ok ? JSON.parse(Buffer.from(ok, 'base64').toString() || 'null') : null;
    return { hash: r.transaction?.hash ?? r.transaction_outcome?.id, value };
  } catch (err) {
    const tr = err?.transactionResult;
    const e = new Error(panicOf(err));
    e.hash = tr?.transaction?.hash ?? tr?.transaction_outcome?.id;
    e.reason = e.message;
    throw e;
  }
}

/** A new ed25519 key and the implicit account it controls (the key's hex). */
export function newImplicitKey() {
  const kp = KeyPair.fromRandom('ed25519');
  return { secretKey: kp.toString(), accountId: hex(kp.getPublicKey().data) };
}
