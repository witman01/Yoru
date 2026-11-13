// Yoru on NEAR testnet: leave a cheque from a wallet, collect one with a code.
// Libraries load on first use so the 3D scene never waits for them.
export const CHAIN = {
  network: 'testnet',
  contract: 'yoru-183ae9.testnet',
  rpc: 'https://test.rpc.fastnear.com',
  // server.mjs serves the site and the courier together, so the same origin
  // works locally and when hosted. A plain static server (python) on another
  // port falls back to the standalone relayer.
  relayer: location.port === '5180' ? 'http://127.0.0.1:8787/claim' : '/claim',
  explorer: 'https://testnet.nearblocks.io',
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PENDING = 'yoru:pending-cheque';

let libs;
function load() {
  libs ??= Promise.all([
    import('https://cdn.jsdelivr.net/npm/hash-wasm@4.13.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/@noble/ed25519@3.2.0/+esm'),
  ]).then(([hw, ed]) => ({ argon2id: hw.argon2id, ed }));
  return libs;
}

let wallet;
function walletSelector() {
  wallet ??= Promise.all([
    import('https://esm.sh/@near-wallet-selector/core@10.1.4'),
    import('https://esm.sh/@near-wallet-selector/modal-ui-js@10.1.4'),
    import('https://esm.sh/@near-wallet-selector/my-near-wallet@10.1.4'),
    import('https://esm.sh/@near-wallet-selector/meteor-wallet@10.1.4'),
  ]).then(async ([core, ui, mnw, meteor]) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://esm.sh/@near-wallet-selector/modal-ui-js@10.1.4/styles.css';
    document.head.appendChild(css);
    const selector = await core.setupWalletSelector({
      network: CHAIN.network,
      modules: [mnw.setupMyNearWallet(), meteor.setupMeteorWallet()],
    });
    const modal = ui.setupModal(selector, { contractId: CHAIN.contract });
    return { selector, modal };
  });
  return wallet;
}

// ---------- Codes and keys ----------
export function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let bits = 0, value = 0, out = '';
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

export function normalizeCode(code) {
  const raw = code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (raw.length !== 16 || [...raw].some((c) => !CROCKFORD.includes(c))) throw new Error('A claim code has sixteen characters.');
  return raw;
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Same derivation as agents/lib/yoru.mjs: Argon2id(code) is the ed25519 seed. */
async function keyFromCode(code) {
  const { argon2id, ed } = await load();
  const seed = await argon2id({
    password: normalizeCode(code),
    salt: `yoru:v1:${CHAIN.contract}`,
    parallelism: 1,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'binary',
  });
  return { seed, publicKey: await ed.getPublicKeyAsync(seed) };
}

function claimMessage(chequeId, receiver) {
  const enc = new TextEncoder();
  const id = new Uint8Array(8);
  new DataView(id.buffer).setBigUint64(0, BigInt(chequeId), true);
  return new Uint8Array([...enc.encode('yoru:claim:v1'), ...enc.encode(CHAIN.contract), ...id, ...enc.encode(receiver)]);
}

function base58(bytes) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + hex(bytes));
  let out = '';
  while (n > 0n) {
    out = A[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** A fresh key; its implicit account is created by the first payment to it. */
async function freshAccount() {
  const { ed } = await load();
  const seed = ed.utils.randomSecretKey();
  const pub = await ed.getPublicKeyAsync(seed);
  return { accountId: hex(pub), privateKey: `ed25519:${base58(new Uint8Array([...seed, ...pub]))}` };
}

// ---------- RPC ----------
export async function view(method, args = {}) {
  const res = await fetch(CHAIN.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'yoru',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'optimistic',
        account_id: CHAIN.contract,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      },
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(body.error.data ?? body.error.message);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result)));
}

export function formatNear(yocto) {
  const s = BigInt(yocto).toString().padStart(25, '0');
  const frac = s.slice(-24, -20).replace(/0+$/, '');
  return `${s.slice(0, -24)}${frac ? '.' + frac : ''}`;
}

function parseNear(near) {
  if (!/^\d+(\.\d{1,24})?$/.test(String(near).trim())) throw new Error('Enter an amount like 1 or 0.5.');
  const [w, f = ''] = String(near).trim().split('.');
  return (BigInt(w) * 10n ** 24n + BigInt((f + '0'.repeat(24)).slice(0, 24))).toString();
}

// ---------- Leave ----------
/** Opens the wallet picker if needed; resolves once an account is signed in. */
export async function connect() {
  const { selector, modal } = await walletSelector();
  if (selector.isSignedIn()) return selector;
  modal.show();
  await new Promise((resolve, reject) => {
    const subs = [
      selector.on('signedIn', () => done(resolve)),
      // Closing the picker without choosing a wallet cancels.
      modal.on('onHide', ({ hideReason }) => hideReason === 'user-triggered' && done(() => reject(new Error('No wallet connected.')))),
    ];
    const done = (fn) => {
      subs.forEach((s) => s.remove());
      fn();
    };
  });
  modal.hide();
  return selector;
}

/** Fetch the wallet code early, so the picker opens at once. */
export function warmUp() {
  walletSelector().catch(() => {});
  load().catch(() => {});
}

/**
 * Creates a cheque. `step(text)` reports progress. Resolves to
 * { code, cheque, note } once the cheque is visible on chain.
 */
export async function leaveCheque(amount, note, step) {
  const deposit = parseNear(amount);
  step('Opening your wallet…');
  const selector = await connect();
  step('Writing the code and stretching it into a key…');
  const code = newCode();
  const { publicKey } = await keyFromCode(code);
  // Redirect wallets leave the page: keep what we need to finish afterwards.
  localStorage.setItem(PENDING, JSON.stringify({ code, publicKey: hex(publicKey), note }));
  step('Confirm in your wallet…');
  const w = await selector.wallet();
  await w.signAndSendTransaction({
    receiverId: CHAIN.contract,
    // Wallet Selector v10 takes near-api-js shaped actions.
    actions: [
      {
        functionCall: {
          methodName: 'create_cheque',
          args: new TextEncoder().encode(JSON.stringify({ public_key: hex(publicKey) })),
          gas: 60_000_000_000_000n,
          deposit: BigInt(deposit),
        },
      },
    ],
  });
  return finishPending(step);
}

/** After a wallet redirect (or a popup wallet), find the cheque and hand back the code. */
export async function finishPending(step = () => {}) {
  const raw = localStorage.getItem(PENDING);
  if (!raw) return null;
  const { code, publicKey, note } = JSON.parse(raw);
  step('Waiting for the cheque to land…');
  for (let i = 0; i < 20; i++) {
    const cheque = await view('get_cheque_by_key', { public_key: publicKey }).catch(() => null);
    if (cheque) {
      localStorage.removeItem(PENDING);
      return { code, cheque, note };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  // The wallet may have been closed without sending.
  if (new URLSearchParams(location.search).has('errorCode')) localStorage.removeItem(PENDING);
  return null;
}

/** The signed-in wallet's account, connecting first if needed. */
export async function walletAccount() {
  const selector = await connect();
  const id = selector.store.getState().accounts.find((a) => a.active)?.accountId ?? selector.store.getState().accounts[0]?.accountId;
  if (!id) throw new Error('No wallet account found.');
  return id;
}

/** Catches the mistakes that would make the transfer fail, before any gas is spent. */
export async function checkReceiver(id) {
  if (!id) throw new Error('Enter the account to pay, or choose "A new account".');
  if (/^[0-9a-z]{4}-[0-9a-z]{4}-/i.test(id)) throw new Error('That looks like the claim code. Put the code in the box above.');
  // Implicit accounts, NEAR's (64 hex) and MetaMask's (0x + 40 hex), are
  // created by the payment itself.
  if (/^[0-9a-f]{64}$/.test(id) || /^0x[0-9a-f]{40}$/.test(id)) return;
  if (!/^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(id)) throw new Error(`"${id}" is not a valid NEAR account name.`);
  const suffix = CHAIN.network === 'testnet' ? '.testnet' : '.near';
  if (!id.endsWith(suffix)) {
    throw new Error(`${id} is not a ${CHAIN.network} account. Here, names end in ${suffix}, or choose "A new account".`);
  }
  const res = await fetch(CHAIN.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'yoru', method: 'query', params: { request_type: 'view_account', finality: 'optimistic', account_id: id } }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`No account named ${id} exists on ${CHAIN.network}.`);
}

// ---------- Read ----------
/** Look a cheque up by its number or by its claim code (the code never leaves the page). */
export async function readCheque(q) {
  const s = q.trim();
  if (/^\d+$/.test(s)) return view('get_cheque', { cheque_id: s });
  const { publicKey } = await keyFromCode(s);
  return view('get_cheque_by_key', { public_key: hex(publicKey) });
}

/** After 7 days anyone may send an unclaimed cheque home; here, from the connected wallet. */
export async function sendHome(chequeId, step = () => {}) {
  step('Opening your wallet…');
  const selector = await connect();
  step('Confirm in your wallet…');
  const w = await selector.wallet();
  await w.signAndSendTransaction({
    receiverId: CHAIN.contract,
    actions: [
      {
        functionCall: {
          methodName: 'refund',
          args: new TextEncoder().encode(JSON.stringify({ cheque_id: String(chequeId) })),
          gas: 60_000_000_000_000n,
          deposit: 0n,
        },
      },
    ],
  });
}

/** A link that opens the counter with the code filled in. The #fragment never reaches a server. */
export const claimLink = (code) => `${location.origin}${location.pathname}#claim=${code}`;

let qrLib;
/** The claim link as an SVG QR code. */
export async function qrSvg(text) {
  qrLib ??= import('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm').then((m) => m.default ?? m);
  const qrcode = await qrLib;
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// ---------- Collect ----------
/**
 * Claims a cheque for `receiver`, or for a brand-new account when receiver is
 * empty. Nothing is signed by a wallet: the relayer submits and pays gas.
 */
export async function collect(code, receiver, step) {
  step('Stretching the code into its key…');
  const { seed, publicKey } = await keyFromCode(code);
  const cheque = await view('get_cheque_by_key', { public_key: hex(publicKey) });
  if (!cheque) throw new Error('No cheque matches this code.');
  if (cheque.status === 'Claimed' || cheque.status === 'Claiming') {
    const to = cheque.receiver.length > 24 ? cheque.receiver.slice(0, 10) + '…' + cheque.receiver.slice(-6) : cheque.receiver;
    throw new Error(`This cheque was already collected, to ${to}.`);
  }
  if (cheque.status !== 'Open') throw new Error('This cheque went home to its sender: nobody collected it in 7 days.');

  let fresh = null;
  if (!receiver) {
    fresh = await freshAccount();
    receiver = fresh.accountId;
  }
  step('Signing the name slip…');
  const { ed } = await load();
  const signature = hex(await ed.signAsync(claimMessage(cheque.id, receiver), seed));

  step('A courier carries it to the box…');
  const res = await fetch(CHAIN.relayer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contract: CHAIN.contract, cheque_id: cheque.id, receiver, signature }),
  }).catch(() => {
    throw new Error('The courier (relayer) is not reachable. Start it with `node agents/relayer.mjs`.');
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? 'The relayer refused the claim.');
  if (body.delivered === false) throw new Error(`That account could not receive the transfer. The cheque is still open.`);
  return { cheque, receiver, fresh, hash: body.hash };
}

export const txLink = (hash) => `${CHAIN.explorer}/txns/${hash}`;
export const accountLink = (id) => `${CHAIN.explorer}/address/${id}`;
