import * as THREE from 'three';
import { STOPS } from './content.js';
import { FACTORIES } from './objects.js';
import { buildHouse } from './house.js';
import { MOBILE, makeRenderer, environment, rain, dust, composer as makeComposer } from './fx.js';
import { glow as glowTexture } from './textures.js';
import { startSound, stopSound, soundOn } from './sound.js';
import { toast, ribbons, moment } from './notify.js';
import {
  CHAIN, leaveCheque, finishPending, warmUp, walletAccount, checkReceiver, view, readCheque, sendHome, claimLink, qrSvg,
  collect as collect_, formatNear, txLink, accountLink,
} from './chain.js';

const $ = (s) => document.querySelector(s);
const clamp = THREE.MathUtils.clamp;
const ease = (x) => x * x * (3 - 2 * x);
const seg = (p, a, b) => ease(clamp((p - a) / (b - a), 0, 1));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LAST = STOPS.length - 1;
/** Viewport heights of scrolling per stop. */
const STOP_VH = 1.6;

// ---------- Loader ----------
const loader = { shown: 0, target: 10 };
function tickLoader() {
  loader.shown += (loader.target - loader.shown) * 0.12;
  $('#loader-count').textContent = Math.round(loader.shown);
  if (loader.target === 100 && loader.shown > 99.4) {
    $('#loader').classList.add('done');
    return;
  }
  requestAnimationFrame(tickLoader);
}
tickLoader();

await Promise.race([
  Promise.all([
    document.fonts.load('800 100px "Shippori Mincho B1"'),
    document.fonts.load('500 20px "IBM Plex Mono"'),
  ]),
  new Promise((r) => setTimeout(r, 2500)),
]);
loader.target = 40;

// ---------- Scene ----------
const renderer = makeRenderer($('#scene'));
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0b0f1c, 0.04);
scene.environment = environment(renderer);
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(MOBILE ? 52 : 40, innerWidth / innerHeight, 0.05, 200);

scene.add(new THREE.HemisphereLight(0x3a3550, 0x140d08, 0.75));
const moon = new THREE.DirectionalLight(0x8ea6ff, 0.5);
moon.position.set(-6, 10, 12);
scene.add(moon);

const house = buildHouse(scene);
const rainLines = rain(MOBILE ? 900 : 2200);
const motes = dust(MOBILE ? 140 : 320);
scene.add(rainLines, motes);
loader.target = 70;

// One object per stop, placed at the house's anchors.
const objects = STOPS.map((s, i) => {
  const make = FACTORIES[s.id];
  if (!make) return null;
  const obj = s.id === 'lantern' ? make({ walk: true }) : make();
  const a = house.anchors[s.id];
  obj.root.position.copy(a.pos);
  obj.root.rotation.y = a.rot;
  obj.root.traverse((o) => (o.userData.stop = i));
  obj.root.userData.baseScale = 1;
  scene.add(obj.root);
  return obj;
});

const { composer, ink, bloom } = makeComposer(renderer, scene, camera);

// ---------- Camera path ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const keys = [
  { pos: V(0.6, 1.55, 10.5), look: V(0, 1.75, 0) }, // 0 lane
  // Just inside the door, so the path to the envelope clears the door posts.
  { pos: V(0, 1.65, 0.7), look: V(-0.6, 1.2, -6) }, // 1 use cases
  { pos: V(-2.35, 1.12, -2.55), look: V(-3.35, 0.4, -4.05) }, // 2 envelope
  { pos: V(-1.95, 1.0, -3.15), look: V(-2.8, 0.42, -3.95) }, // 3 hanko
  { pos: V(0.3, 0.95, -10.75), look: V(0, 0.4, -12.25) }, // 4 box
  { pos: V(1.6, 1.58, -8.85), look: V(2.85, 1.4, -10.1) }, // 5 slip
  { pos: V(1.5, 1.45, -4.1), look: V(3.9, 1.3, -6.0) }, // 6 lantern
  { pos: V(4.55, 1.25, -1.55), look: V(5.62, 1.1, -2.4) }, // 7 incense
  { pos: V(0.2, 2.0, -3.1), look: V(-0.95, 0.5, -6.5) }, // 8 counter
];
const posCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, 'centripetal');
/** Stop progress (0..LAST) to curve t: one key per stop. */
const curveT = (x) => x / (keys.length - 1);

// The seven objects, in index order (the counter is the last).
const OBJECT_STOPS = STOPS.map((s, i) => (FACTORIES[s.id] ? i : -1)).filter((i) => i >= 0);
const OBJECT_TOTAL = String(OBJECT_STOPS.length).padStart(2, '0');
const stopOf = (id) => STOPS.findIndex((s) => s.id === id);

// ---------- DOM: panels and index ----------
let side = 0;
const panels = STOPS.map((s, i) => {
  const el = document.createElement('section');
  const align = i === 0 ? 'left' : s.id === 'uses' ? 'center' : side++ % 2 ? 'right' : 'left';
  el.className = `panel panel-${s.id} ${align}`;
  if (i === 0) {
    el.innerHTML = `
      <div class="hero-kanji" aria-hidden="true">${s.kanji}</div>
      <div class="hero-copy">
        <p class="kicker">${s.kicker}</p>
        <h1>${s.title}</h1>
        <p class="oneliner">${s.oneliner}</p>
        <p class="lede">${s.body}</p>
        <div class="hero-actions">
          <button class="solid" data-jump="${LAST}">Leave a cheque</button>
          <button class="ghost" data-jump="${LAST}" data-tab="collect">I have a code</button>
        </div>
        <p class="hero-meta">${s.meta}</p>
      </div>`;
  } else if (s.id === 'uses') {
    el.innerHTML = `
      <div class="uses">
        <p class="kicker">${s.kicker}</p>
        <h2>${s.title}</h2>
        <ul class="use-grid">${s.cards
          .map((c) => `<li class="use${c.agent ? ' agent' : ''}"><span class="use-seal" aria-hidden="true">${c.kanji}</span><h3>${c.title}</h3><p>${c.line}</p></li>`)
          .join('')}</ul>
      </div>`;
  } else if (i === LAST) {
    el.innerHTML = finaleHTML(s);
  } else {
    el.innerHTML = `
      <div class="panel-kanji" aria-hidden="true">${s.kanji}</div>
      <div class="panel-copy">
        <div class="panel-num"><span>${s.num}</span> / ${OBJECT_TOTAL}</div>
        <p class="reading">${s.reading}</p>
        <h2>${s.title}</h2>
        <p class="body">${s.body}</p>
        <dl class="specs">${s.specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <button class="ghost examine" data-detail="${i}">Examine <span>· drag to turn</span></button>
      </div>`;
  }
  $('#panels').appendChild(el);
  return el;
});

$('#index').innerHTML = `
  <div class="index-title">Index</div>
  <ol>${OBJECT_STOPS.map((i) => [STOPS[i], i])
    .map(([s, i]) => `<li><button data-jump="${i}"><span class="ix-num">${s.num}</span><span class="ix-kanji">${s.kanji}</span><span class="ix-title">${s.title.replace('The ', '')}</span></button></li>`)
    .join('')}</ol>
  <div class="index-rail"><div class="index-fill"></div></div>`;
const indexButtons = [...document.querySelectorAll('#index li button')];

function finaleHTML(s) {
  const seal = (kanji, label) => `<button class="seal-btn" type="submit"><span class="seal-kanji">${kanji}</span><span class="seal-label">${label}</span></button>`;
  return `
    <div class="finale scroll">
      <div class="scroll-rod" aria-hidden="true"></div>
      <div class="scroll-body">
        <div class="scroll-paper">
          <div class="scroll-inner">
            <div class="finale-head">
              <div class="panel-num"><span>${s.num}</span> / ${OBJECT_TOTAL}</div>
              <h2><span class="finale-kanji">茶</span> ${s.title}</h2>
              <p class="body">${s.body}</p>
            </div>
            <div class="tabs" role="tablist">
              <button role="tab" class="tab active" data-tab="leave"><b>置</b> Leave</button>
              <button role="tab" class="tab" data-tab="collect"><b>受</b> Collect</button>
              <button role="tab" class="tab" data-tab="read"><b>読</b> Read</button>
            </div>
            <form class="pane pane-leave active" data-pane="leave">
              <label>Amount
                <div class="amount"><input name="amount" inputmode="decimal" value="0.5" /><span>NEAR</span></div>
              </label>
              <label>A note to write on the envelope <span class="opt">optional, never on chain</span>
                <input name="note" maxlength="80" placeholder="For the long walk home" />
              </label>
              ${seal('封', 'Seal the envelope')}
              <p class="pane-status" aria-live="polite" hidden></p>
            </form>
            <form class="pane pane-collect" data-pane="collect">
              <label>Claim code
                <input name="code" class="code-input" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" />
              </label>
              <fieldset class="choices">
                <legend>Send it to</legend>
                <label class="choice"><input type="radio" name="to" value="wallet" /><span class="choice-k">財</span><span class="choice-t">My wallet</span><small>Meteor · MyNearWallet</small></label>
                <label class="choice"><input type="radio" name="to" value="none" checked /><span class="choice-k">新</span><span class="choice-t">New account</span><small>no wallet needed</small></label>
                <label class="choice"><input type="radio" name="to" value="account" /><span class="choice-k">宛</span><span class="choice-t">An address</span><small>.testnet · 0x · exchange</small></label>
              </fieldset>
              <div class="wallet-row" hidden>
                <span class="wallet-name">Not connected</span>
                <button type="button" class="ghost small connect-wallet">Connect wallet</button>
              </div>
              <div class="account-row" hidden>
                <input name="account" class="account-input" placeholder="name.testnet, 64-char address or 0x…" autocomplete="off" spellcheck="false" />
                <p class="account-hint">Any NEAR address, including an exchange's NEAR deposit address. A 0x… MetaMask address receives NEAR on NEAR.</p>
              </div>
              <div class="collect-fields-end">${seal('受', 'Collect')}</div>
              <p class="pane-status" aria-live="polite" hidden></p>
              <div class="collect-result" hidden></div>
              <button type="button" class="ghost wide collect-again" hidden>Collect another cheque</button>
            </form>
            <form class="pane pane-read" data-pane="read">
              <label>Claim code or cheque number
                <input name="q" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX or 12" />
              </label>
              ${seal('読', 'Read the cheque')}
              <p class="pane-status" aria-live="polite" hidden></p>
              <div class="read-result" hidden></div>
            </form>
            <p class="mock-note">NEAR testnet · <a href="${accountLink(CHAIN.contract)}" target="_blank" rel="noopener">${CHAIN.contract}</a></p>
          </div>
        </div>
      </div>
      <div class="scroll-rod bottom" aria-hidden="true"></div>
    </div>`;
}

// ---------- Scroll ----------
const spacer = $('#spacer');
function layout() {
  spacer.style.height = `${innerHeight * (LAST * STOP_VH + 1)}px`;
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth / 2, innerHeight / 2);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  ink.uAspect.value = innerWidth / innerHeight;
}
layout();
addEventListener('resize', layout);

const stopToScroll = (i) => i * innerHeight * STOP_VH + (i ? innerHeight * 0.12 : 0);
let progress = 0;
function readScroll() {
  progress = clamp(scrollY / (innerHeight * STOP_VH), 0, LAST);
}
addEventListener('scroll', readScroll, { passive: true });
readScroll();

// ---------- Ink transitions on jumps ----------
let cover = 0;
let coverTarget = 0;
let jumping = false;
async function jump(i) {
  if (detailOpen) closeDetail();
  if (jumping) return;
  jumping = true;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!REDUCED) {
    coverTarget = 1;
    await wait(520);
  }
  scrollTo({ top: stopToScroll(i), behavior: 'instant' });
  readScroll();
  smooth.copy(targetCam(progress));
  await wait(60);
  coverTarget = 0;
  jumping = false;
}
document.addEventListener('click', (e) => {
  const j = e.target.closest('[data-jump]');
  if (j) {
    e.preventDefault();
    if (j.dataset.tab) setTab(j.dataset.tab);
    jump(+j.dataset.jump);
  }
  const d = e.target.closest('[data-detail]');
  if (d) openDetail(+d.dataset.detail);
});

// ---------- Hover and click on objects ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(9, 9);
const mouse = new THREE.Vector2();
let hovered = 0;
const tip = document.createElement('div');
tip.className = 'tip';
document.body.appendChild(tip);
addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  mouse.copy(pointer);
  tip.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`;
});
$('#scene').addEventListener('click', () => {
  if (hovered) openDetail(hovered);
});
const pickables = objects.filter((o, i) => o && i !== LAST).map((o) => o.root);
function pick() {
  if (detailOpen || MOBILE) return 0;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, true)[0];
  return hit && hit.distance < 6 ? hit.object.userData.stop : 0;
}

// ---------- Detail view ----------
let detailOpen = false;
let detail = null;
const detailRenderer = makeRenderer($('#detail-canvas'), { alpha: true });
const detailScene = new THREE.Scene();
detailScene.environment = environment(detailRenderer);
detailScene.environmentIntensity = 0.9;
const detailCam = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
detailCam.position.set(0, 0.55, 2.4);
detailCam.lookAt(0, 0.05, 0);
const key = new THREE.SpotLight(0xffd2a0, 30, 8, 0.6, 0.6, 1.5);
key.position.set(1.2, 2.4, 1.6);
const rim = new THREE.DirectionalLight(0x7f95ff, 1.4);
rim.position.set(-2, 1, -2);
detailScene.add(key, rim, new THREE.HemisphereLight(0x3b3550, 0x120b06, 0.6));
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(0.9, 64),
  new THREE.MeshStandardMaterial({ color: 0x1a1310, roughness: 0.6, transparent: true, alphaMap: glowTexture(), depthWrite: false }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.36;
detailScene.add(floor);
const turntable = new THREE.Group();
detailScene.add(turntable);

const drag = { on: false, x: 0, y: 0, vy: 0, rx: 0.15, ry: 0.5 };
const dc = $('#detail-canvas');
dc.addEventListener('pointerdown', (e) => {
  drag.on = true;
  drag.x = e.clientX;
  drag.y = e.clientY;
  dc.setPointerCapture(e.pointerId);
});
dc.addEventListener('pointermove', (e) => {
  if (!drag.on) return;
  drag.vy = (e.clientX - drag.x) * 0.008;
  drag.ry += drag.vy;
  drag.rx = clamp(drag.rx + (e.clientY - drag.y) * 0.005, -0.4, 0.7);
  drag.x = e.clientX;
  drag.y = e.clientY;
});
dc.addEventListener('pointerup', () => (drag.on = false));

function openDetail(i) {
  const s = STOPS[i];
  if (!s || !FACTORIES[s.id] || i === LAST) return;
  turntable.clear();
  const obj = FACTORIES[s.id]();
  // Centre and scale to about 0.9 units across.
  const bb = new THREE.Box3().setFromObject(obj.root);
  const size = bb.getSize(new THREE.Vector3());
  const k = 0.9 / Math.max(size.x, size.y * 1.2, size.z);
  const centre = bb.getCenter(new THREE.Vector3());
  obj.root.scale.setScalar(k);
  obj.root.position.set(-centre.x * k, -centre.y * k - 0.02, -centre.z * k);
  floor.position.y = (bb.min.y - centre.y) * k - 0.03;
  turntable.add(obj.root);
  detail = { i, obj };
  drag.ry = 0.5;
  drag.rx = 0.15;
  drag.vy = 0;

  $('.detail-num').textContent = `${s.num} / ${OBJECT_TOTAL}`;
  $('.detail-kanji').textContent = s.kanji;
  $('.detail-title').textContent = s.title;
  $('.detail-body').textContent = s.body;
  $('.detail-specs').innerHTML = s.specs.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
  const el = $('#detail');
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('open'));
  detailOpen = true;
  sizeDetail();
  setTimeout(() => detail?.obj.play(), 650);
}
function closeDetail() {
  const el = $('#detail');
  el.classList.remove('open');
  detailOpen = false;
  setTimeout(() => {
    if (!detailOpen) el.hidden = true;
  }, 450);
}
function stepDetail(d) {
  if (!detail) return;
  // Step through the objects that open, skipping the counter.
  const open = OBJECT_STOPS.filter((i) => i !== LAST);
  const k = (open.indexOf(detail.i) + d + open.length) % open.length;
  openDetail(open[k]);
}
function sizeDetail() {
  const r = dc.getBoundingClientRect();
  detailRenderer.setSize(r.width, r.height, false);
  detailCam.aspect = r.width / r.height;
  detailCam.updateProjectionMatrix();
}
addEventListener('resize', () => detailOpen && sizeDetail());
$('#detail-close').addEventListener('click', closeDetail);
$('#detail-play').addEventListener('click', () => detail?.obj.play());
$('#detail-prev').addEventListener('click', () => stepDetail(-1));
$('#detail-next').addEventListener('click', () => stepDetail(1));
addEventListener('keydown', (e) => {
  if (!detailOpen) return;
  if (e.key === 'Escape') closeDetail();
  if (e.key === 'ArrowLeft') stepDetail(-1);
  if (e.key === 'ArrowRight') stepDetail(1);
});

// ---------- Finale forms: real cheques on NEAR testnet ----------
function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === name));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.tab)));

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function status(form, text, kind = '') {
  const el = form.querySelector('.pane-status');
  el.hidden = !text;
  el.className = `pane-status ${kind}`;
  el.textContent = text ?? '';
}
function busy(form, on) {
  form.querySelector('button[type=submit]').disabled = on;
  form.classList.toggle('busy', on);
}

const leave = $('.pane-leave');
/** Sealed: record it, then show the code once in the "done" card. */
function showCode({ code, cheque, note }) {
  status(leave, '');
  objects[stopOf('envelope')].play();
  rememberSent(cheque);
  addHistory({ kind: 'sealed', id: cheque.id, amount: cheque.amount });
  sealedMoment({ code, cheque, note });
}

/** The "done" card: the code, a claim link and its QR code. */
function sealedMoment({ code, cheque, note }) {
  toast({ kanji: '封', title: 'Cheque sealed', body: `${formatNear(cheque.amount)} NEAR is locked in the box. Cheque ${cheque.id}.` });
  ribbons();
  const link = claimLink(code);
  const m = moment({
    kanji: '封',
    kicker: 'Done · cheque ' + cheque.id,
    title: `${formatNear(cheque.amount)} NEAR is sealed`,
    html: `
      <p>Only this code opens it, and it is shown once. Send it however you like.</p>
      <div class="moment-code">${code}</div>
      ${note ? `<p class="moment-note">“${escapeHtml(note)}”</p>` : ''}
      <div class="moment-share">
        <div class="moment-qr" aria-label="QR code of the claim link"></div>
        <div class="moment-share-actions">
          <button class="ghost wide copy-code">Copy code</button>
          <button class="ghost wide copy-link">Copy claim link</button>
          ${navigator.share ? '<button class="ghost wide share-link">Share…</button>' : ''}
          <p class="moment-small">The link opens Yoru with the code filled in. Anyone holding the code or the link can collect, so send it only to them.</p>
        </div>
      </div>
      <p class="moment-small">Unclaimed after 7 days, it returns to you. This page will tell you when it is collected.</p>`,
    onClose: () => {
      // Back into the house: the envelope goes into the lacquer box.
      leave.note.value = '';
      jump(stopOf('box')).then(() => {
        setTimeout(() => objects[stopOf('box')].play(), 400);
        toast({ kanji: '箱', title: 'In the box', body: `Cheque ${cheque.id} rests in the lacquer box until someone brings the code.` });
      });
    },
  });
  const message = note ? `${note}

Collect your cheque: ${link}
Code: ${code}` : `Collect your cheque: ${link}
Code: ${code}`;
  const copyBtn = (sel, text, label) => {
    const b = m.el.querySelector(sel);
    b.onclick = async () => {
      await navigator.clipboard?.writeText(text);
      b.textContent = label;
    };
  };
  copyBtn('.copy-code', note ? `${code}
${note}` : code, 'Code copied');
  copyBtn('.copy-link', message, 'Link copied');
  m.el.querySelector('.share-link')?.addEventListener('click', () => navigator.share({ title: 'A cheque for you', text: message }).catch(() => {}));
  qrSvg(link).then((svg) => (m.el.querySelector('.moment-qr').innerHTML = svg)).catch(() => m.el.querySelector('.moment-qr').remove());
}

// ---------- Sender alerts: tell the payer when a cheque is collected ----------
const SENT = 'yoru:sent-cheques';
const readSent = () => {
  try {
    return JSON.parse(localStorage.getItem(SENT) ?? '{}');
  } catch {
    return {};
  }
};
const writeSent = (v) => {
  try {
    localStorage.setItem(SENT, JSON.stringify(v));
  } catch {}
};
function rememberSent(cheque) {
  const sent = readSent();
  sent[cheque.id] = { status: cheque.status, amount: cheque.amount };
  writeSent(sent);
}
async function checkSent() {
  const sent = readSent();
  for (const [id, last] of Object.entries(sent)) {
    if (last.status !== 'Open' && last.status !== 'Claiming') continue;
    const c = await view('get_cheque', { cheque_id: id }).catch(() => null);
    if (!c || c.status === last.status) continue;
    sent[id] = { status: c.status, amount: c.amount };
    if (c.status === 'Claimed') {
      toast({ kanji: '受', title: `Cheque ${id} was collected`, body: `${formatNear(c.amount)} NEAR reached ${escapeHtml(short(c.receiver))}.`, ms: 10000 });
      addHistory({ kind: 'collected', id, amount: c.amount, who: c.receiver });
      ribbons(60);
    } else if (c.status === 'Refunded') {
      toast({ kanji: '香', title: `Cheque ${id} came home`, body: `Nobody collected it in 7 days. ${formatNear(c.amount)} NEAR is back with you.`, ms: 10000 });
      addHistory({ kind: 'returned', id, amount: c.amount });
    }
  }
  writeSent(sent);
}
const short = (id) => (id.length > 24 ? id.slice(0, 10) + '…' + id.slice(-6) : id);
setInterval(checkSent, 15000);
setTimeout(checkSent, 3000);
leave.addEventListener('submit', async (e) => {
  e.preventDefault();
  busy(leave, true);
  try {
    const done = await leaveCheque(leave.amount.value, leave.note.value.trim(), (t) => status(leave, t));
    if (done) showCode(done);
    else status(leave, 'The cheque has not appeared yet. If your wallet sent it, refresh in a moment.', 'bad');
  } catch (err) {
    status(leave, err.message ?? String(err), 'bad');
  } finally {
    busy(leave, false);
  }
});
// Coming back from a redirect wallet: finish the cheque that was being sealed.
setTimeout(warmUp, 4000);
finishPending().then((done) => {
  if (!done) return;
  showCode(done);
  setTimeout(() => jump(LAST), 1200);
});

const collect = $('.pane-collect');
const codeInput = collect.querySelector('.code-input');
codeInput.addEventListener('input', () => {
  const raw = codeInput.value.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').slice(0, 16);
  codeInput.value = raw.match(/.{1,4}/g)?.join('-') ?? '';
});
// Any change to the form clears an old error or result.
const clearCollect = () => {
  status(collect, '');
  collect.querySelector('.collect-result').hidden = true;
};
collect.addEventListener('input', clearCollect);
const destination = () => collect.querySelector('input[name=to]:checked').value;
let walletId = '';
async function connectWallet() {
  try {
    status(collect, 'Opening your wallet…');
    walletId = await walletAccount();
    collect.querySelector('.wallet-name').textContent = `✓ ${short(walletId)}`;
    collect.querySelector('.connect-wallet').textContent = 'Switch';
    status(collect, '');
  } catch (err) {
    status(collect, err.message ?? String(err), 'bad');
  }
}
collect.querySelectorAll('input[name=to]').forEach((r) =>
  r.addEventListener('change', () => {
    collect.querySelector('.wallet-row').hidden = destination() !== 'wallet';
    collect.querySelector('.account-row').hidden = destination() !== 'account';
    clearCollect();
    if (destination() === 'wallet' && !walletId) connectWallet();
  }),
);
collect.querySelector('.connect-wallet').addEventListener('click', connectWallet);
collect.addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = collect.querySelector('.collect-result');
  res.hidden = true;
  const dest = destination();
  busy(collect, true);
  try {
    if (dest === 'wallet' && !walletId) await connectWallet();
    if (dest === 'wallet' && !walletId) throw new Error('Connect a wallet first, or choose "New account".');
    const receiver = dest === 'wallet' ? walletId : dest === 'account' ? collect.account.value.trim().toLowerCase() : '';
    if (dest !== 'none') await checkReceiver(receiver);
    const r = await collect_(codeInput.value, receiver, (t) => status(collect, t));
    status(collect, '');
    // Lock the form so the same code cannot be pressed twice.
    collect.classList.add('done');
    collect.querySelector('.collect-again').hidden = false;
    res.hidden = false;
    res.className = 'collect-result ok';
    res.innerHTML =
      `<strong>The box opens.</strong> ${formatNear(r.cheque.amount)} NEAR went to ` +
      `<a href="${accountLink(r.receiver)}" target="_blank" rel="noopener">${escapeHtml(short(r.receiver))}</a>. ` +
      `<a href="${txLink(r.hash)}" target="_blank" rel="noopener">Transaction</a>`;
    receivedMoment(r);
    objects[stopOf('box')].play();
  } catch (err) {
    status(collect, err.message ?? String(err), 'bad');
  } finally {
    busy(collect, false);
  }
});
collect.querySelector('.collect-again').addEventListener('click', () => {
  collect.classList.remove('done');
  collect.querySelector('.collect-again').hidden = true;
  codeInput.value = '';
  clearCollect();
});

/** The "received" card. A brand-new account's key must be saved before closing. */
function receivedMoment(r) {
  addHistory({ kind: 'received', id: r.cheque.id, amount: r.cheque.amount, who: r.receiver, hash: r.hash });
  toast({ kanji: '受', title: 'Money received', body: `${formatNear(r.cheque.amount)} NEAR arrived. A courier paid the gas.` });
  ribbons();
  const m = moment({
    kanji: '受',
    kicker: 'Received · cheque ' + r.cheque.id,
    title: `You received ${formatNear(r.cheque.amount)} NEAR`,
    lock: !!r.fresh,
    html: `
      <p>It is now in <a href="${accountLink(r.receiver)}" target="_blank" rel="noopener">${escapeHtml(short(r.receiver))}</a>.
      You paid nothing: a courier carried the claim and paid the gas.
      <a href="${txLink(r.hash)}" target="_blank" rel="noopener">See the transaction</a>.</p>
      ${
        r.fresh
          ? `<div class="moment-key">
               <p><strong>This account is new, and this key is the only way into it.</strong>
               Save it now. Whoever holds the file controls the money.</p>
               <a class="solid wide key-download" download="yoru-${r.fresh.accountId.slice(0, 8)}.json">Download your key</a>
               <p class="moment-small">Import it into a NEAR wallet (Meteor or MyNearWallet, testnet) to use the money.</p>
             </div>`
          : ''
      }`,
  });
  if (r.fresh) {
    const a = m.el.querySelector('.key-download');
    const file = new Blob([JSON.stringify({ account_id: r.fresh.accountId, private_key: r.fresh.privateKey }, null, 2)], { type: 'application/json' });
    a.href = URL.createObjectURL(file);
    // Closing unlocks once the key has been downloaded.
    a.addEventListener('click', () => {
      m.unlock();
      a.textContent = 'Saved · download again';
    });
    // Keep a copy on the result too, in case the card is closed.
    collect.querySelector('.collect-result').append(a.cloneNode(true));
  }
}

// ---------- Loop ----------
const clock = new THREE.Clock();
const smooth = new THREE.Vector3();
const smoothLook = new THREE.Vector3();
const tmpLook = new THREE.Vector3();
function targetCam(p) {
  const stop = Math.floor(p);
  const f = p - stop;
  const x = stop >= LAST ? LAST : stop + seg(f, 0.5, 1);
  tmpLook.copy(lookCurve.getPoint(curveT(x)));
  return posCurve.getPoint(curveT(x));
}
smooth.copy(targetCam(progress));
smoothLook.copy(tmpLook);

let activeStop = -1;
let lastPlay = 0;
loader.target = 100;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (detailOpen) {
    if (!drag.on) {
      drag.vy *= 0.94;
      drag.ry += drag.vy + 0.0015;
    }
    turntable.rotation.y = drag.ry;
    turntable.rotation.x = drag.rx;
    detail.obj.update(t, dt);
    detailRenderer.render(detailScene, detailCam);
    requestAnimationFrame(frame);
    return;
  }

  // Camera follows the scroll with a little lag and mouse parallax.
  const goal = targetCam(progress);
  const look = tmpLook.clone();
  const k = 1 - Math.exp(-dt * 4);
  smooth.lerp(goal, k);
  smoothLook.lerp(look, k);
  camera.position.copy(smooth);
  camera.position.x += mouse.x * 0.08;
  camera.position.y += mouse.y * 0.05;
  camera.lookAt(smoothLook);

  // Panels fade by their distance from the scroll position.
  panels.forEach((el, i) => {
    const local = progress - i;
    const fadeIn = i === 0 ? 1 : seg(local, -0.12, 0.02);
    const fadeOut = i === LAST ? 1 : 1 - seg(local, 0.42, 0.56);
    const v = fadeIn * fadeOut;
    el.style.opacity = v;
    el.style.transform = `translateY(${(1 - fadeIn) * 30 - (1 - fadeOut) * 30}px)`;
    el.classList.toggle('live', v > 0.5);
  });

  // Ink covers the screen only during index jumps.
  cover += (coverTarget - cover) * (1 - Math.exp(-dt * (coverTarget ? 7 : 4)));
  ink.uCover.value = cover;
  ink.uTime.value = t;

  // Index state and the object action for the current stop.
  const now = clamp(Math.round(progress - 0.08), 0, LAST);
  if (now !== activeStop) {
    activeStop = now;
    indexButtons.forEach((b) => b.classList.toggle('active', +b.dataset.jump === now));
    $('.index-fill').style.transform = `scaleY(${(OBJECT_STOPS.indexOf(now) + 1) / OBJECT_STOPS.length})`;
    $('#index').classList.toggle('show', now >= OBJECT_STOPS[0]);
    $('#scroll-hint').classList.toggle('gone', progress > 0.15);
    lastPlay = t - 5;
  }
  if (objects[now] && t - lastPlay > 7.5 && !objects[now].playing) {
    objects[now].play();
    lastPlay = t;
  }

  // Hover.
  const h = pick();
  if (h !== hovered) {
    hovered = h;
    document.body.style.cursor = h ? 'pointer' : '';
    tip.classList.toggle('show', !!h);
    if (h) tip.innerHTML = `<span>${STOPS[h].num}</span> ${STOPS[h].title} <em>· open</em>`;
  }
  objects.forEach((o, i) => {
    if (!o) return;
    const s = THREE.MathUtils.lerp(o.root.scale.x, i === hovered ? 1.06 : 1, 1 - Math.exp(-dt * 10));
    o.root.scale.setScalar(s);
    o.update(t, dt);
  });

  house.update(t);
  rainLines.update(t);
  motes.update(t);
  composer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- Sound ----------
const soundBtn = $('#sound');
soundBtn.addEventListener('click', async () => {
  const next = !soundOn();
  soundBtn.setAttribute('aria-pressed', String(next));
  soundBtn.querySelector('.sound-label').textContent = next ? 'Sound on' : 'Sound';
  if (next) await startSound();
  else stopSound();
});

// ---------- Read: look a cheque up without touching it ----------
const read = $('.pane-read');
const STATUS_WORDS = {
  Open: ['待', 'Waiting in the box'],
  Claiming: ['運', 'Being delivered'],
  Claimed: ['受', 'Collected'],
  Refunding: ['帰', 'Going home'],
  Refunded: ['帰', 'Returned to the sender'],
};
read.addEventListener('input', () => {
  status(read, '');
  read.querySelector('.read-result').hidden = true;
});
read.addEventListener('submit', async (e) => {
  e.preventDefault();
  const out = read.querySelector('.read-result');
  out.hidden = true;
  busy(read, true);
  try {
    status(read, /^\d+$/.test(read.q.value.trim()) ? 'Finding the cheque…' : 'Stretching the code into its key…');
    const c = await readCheque(read.q.value);
    if (!c) throw new Error('No cheque matches that.');
    status(read, '');
    const [kanji, words] = STATUS_WORDS[c.status] ?? ['?', c.status];
    const left = Number(BigInt(c.expires_at) / 1_000_000n) - Date.now();
    const when = left > 0 ? `returns in ${Math.ceil(left / 3600000)} h if unclaimed` : 'its 7 days are over';
    out.innerHTML = `
      <div class="read-head"><span class="read-seal">${kanji}</span><div><strong>${words}</strong><span>Cheque ${c.id} · ${formatNear(c.amount)} NEAR</span></div></div>
      <dl class="specs">
        <div><dt>From</dt><dd>${escapeHtml(short(c.sender))}</dd></div>
        ${c.receiver ? `<div><dt>To</dt><dd><a href="${accountLink(c.receiver)}" target="_blank" rel="noopener">${escapeHtml(short(c.receiver))}</a></dd></div>` : ''}
        <div><dt>Left on</dt><dd>${new Date(Number(BigInt(c.created_at) / 1_000_000n)).toLocaleString()}</dd></div>
        ${c.status === 'Open' ? `<div><dt>Window</dt><dd>${when}</dd></div>` : ''}
      </dl>
      ${c.status === 'Open' && left <= 0 ? '<button type="button" class="ghost wide send-home">Send it home to the sender</button>' : ''}`;
    out.hidden = false;
    out.querySelector('.send-home')?.addEventListener('click', async () => {
      try {
        await sendHome(c.id, (t) => status(read, t));
        status(read, 'Sent home.');
        toast({ kanji: '帰', title: `Cheque ${c.id} sent home`, body: `${formatNear(c.amount)} NEAR returned to ${escapeHtml(short(c.sender))}.` });
      } catch (err) {
        status(read, err.message ?? String(err), 'bad');
      }
    });
  } catch (err) {
    status(read, err.message ?? String(err), 'bad');
  } finally {
    busy(read, false);
  }
});

// ---------- History ----------
const HISTORY = 'yoru:history';
const HISTORY_SEEN = 'yoru:history-seen';
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};
const HISTORY_WORDS = {
  sealed: ['封', 'You sealed cheque'],
  received: ['受', 'You received cheque'],
  collected: ['渡', 'Your cheque was collected:'],
  returned: ['帰', 'Came home: cheque'],
};
function addHistory(entry) {
  const list = store.get(HISTORY, []);
  list.unshift({ ...entry, at: Date.now() });
  store.set(HISTORY, list.slice(0, 100));
  renderBadge();
  if (!$('#history').hidden) renderHistory();
}
function renderBadge() {
  const seen = store.get(HISTORY_SEEN, 0);
  const unread = store.get(HISTORY, []).filter((e) => e.at > seen).length;
  const badge = $('#history-btn .badge');
  badge.textContent = unread;
  badge.hidden = !unread;
}
function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}
function renderHistory() {
  const list = store.get(HISTORY, []);
  $('#history-list').innerHTML = list.length
    ? list
        .map((e) => {
          const [k, words] = HISTORY_WORDS[e.kind] ?? ['夜', e.kind];
          return `<li class="h-${e.kind}"><span class="h-seal">${k}</span><div><strong>${words} ${e.id}</strong>
            <span>${formatNear(e.amount)} NEAR${e.who ? ` · ${escapeHtml(short(e.who))}` : ''} · ${ago(e.at)}</span>
            ${e.hash ? `<a href="${txLink(e.hash)}" target="_blank" rel="noopener">Transaction</a>` : ''}</div></li>`;
        })
        .join('')
    : '<li class="h-empty">Nothing yet. Seal or collect a cheque and it will be written here.</li>';
  // Live status of the cheques this browser sealed.
  const sent = readSent();
  const ids = Object.keys(sent).sort((a, b) => b - a);
  const box = $('#history-sent');
  box.innerHTML = ids.length
    ? ids.map((id) => `<li data-id="${id}"><span>Cheque ${id}</span><em>${sent[id].status}</em></li>`).join('')
    : '<li class="h-empty">No cheques sealed from this browser yet.</li>';
  for (const id of ids) {
    view('get_cheque', { cheque_id: id })
      .then((c) => {
        const li = box.querySelector(`[data-id="${id}"]`);
        if (c && li) li.innerHTML = `<span>Cheque ${id} · ${formatNear(c.amount)} NEAR</span><em class="s-${c.status}">${(STATUS_WORDS[c.status] ?? ['', c.status])[1]}</em>`;
      })
      .catch(() => {});
  }
}
function openHistory() {
  const el = $('#history');
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('open'));
  renderHistory();
  store.set(HISTORY_SEEN, Date.now());
  renderBadge();
}
function closeHistory() {
  const el = $('#history');
  el.classList.remove('open');
  setTimeout(() => (el.hidden = true), 500);
}
$('#history-btn').addEventListener('click', () => ($('#history').hidden ? openHistory() : closeHistory()));
$('#history-close').addEventListener('click', closeHistory);
addEventListener('keydown', (e) => e.key === 'Escape' && !$('#history').hidden && closeHistory());
renderBadge();

// ---------- Claim links: #claim=CODE opens the counter with the code filled in ----------
const linked = location.hash.match(/^#claim=([0-9A-Za-z-]{16,19})$/);
if (linked) {
  history.replaceState(null, '', location.pathname);
  setTab('collect');
  codeInput.value = linked[1].toUpperCase();
  codeInput.dispatchEvent(new Event('input'));
  setTimeout(() => {
    jump(LAST);
    toast({ kanji: '受', title: 'A cheque is waiting for you', body: 'The code is filled in. Choose where the money should go and press Collect.', ms: 9000 });
  }, 1600);
}
