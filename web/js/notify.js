// On-screen moments: toasts, falling paper ribbons, and a full-screen card
// for "cheque sealed" and "money received".

// ---------- Toasts ----------
let stack;
export function toast({ kanji = '夜', title, body = '', tone = 'warm', ms = 7000 }) {
  stack ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toasts' });
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="toast-seal" aria-hidden="true"></span><div><strong></strong><p></p></div><button class="toast-x" aria-label="Dismiss">×</button>`;
  el.querySelector('.toast-seal').textContent = kanji;
  el.querySelector('strong').textContent = title;
  el.querySelector('p').innerHTML = body;
  const close = () => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 500);
  };
  el.querySelector('.toast-x').onclick = close;
  stack.prepend(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(close, ms);
}

// ---------- Ribbons ----------
const COLORS = ['#c8402f', '#e2b860', '#efe6d2', '#f2a65a', '#1d2547', '#b3261e'];
export function ribbons(count = 90) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'ribbons';
  document.body.appendChild(c);
  const dpr = Math.min(devicePixelRatio, 2);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const pieces = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.6,
    w: 6 + Math.random() * 6,
    h: 26 + Math.random() * 40,
    vy: 1.6 + Math.random() * 2.4,
    sway: Math.random() * Math.PI * 2,
    swaySpeed: 0.02 + Math.random() * 0.03,
    spin: Math.random() * Math.PI,
    spinSpeed: (Math.random() - 0.5) * 0.12,
    color: COLORS[i % COLORS.length],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    g.clearRect(0, 0, innerWidth, innerHeight);
    g.globalAlpha = t > 3800 ? Math.max(0, 1 - (t - 3800) / 900) : 1;
    for (const p of pieces) {
      p.y += p.vy;
      p.sway += p.swaySpeed;
      p.spin += p.spinSpeed;
      const x = p.x + Math.sin(p.sway) * 28;
      g.save();
      g.translate(x, p.y);
      g.rotate(Math.sin(p.spin) * 0.9);
      // A strip of paper, foreshortened as it turns.
      g.scale(Math.cos(p.spin * 1.7), 1);
      g.fillStyle = p.color;
      g.beginPath();
      g.moveTo(-p.w / 2, -p.h / 2);
      g.quadraticCurveTo(p.w, 0, -p.w / 2, p.h / 2);
      g.lineTo(p.w / 2, p.h / 2);
      g.quadraticCurveTo(p.w * 2, 0, p.w / 2, -p.h / 2);
      g.closePath();
      g.fill();
      g.restore();
    }
    if (t < 4700) requestAnimationFrame(frame);
    else c.remove();
  })(start);
}

// ---------- The moment card ----------
/**
 * Full-screen card. `html` fills the body; `lock` keeps the close button
 * disabled until `unlock()` is called (used until a key file is saved).
 */
export function moment({ kanji, kicker, title, html, lock = false, onClose = () => {} }) {
  document.querySelector('.moment')?.remove();
  const el = document.createElement('div');
  el.className = 'moment';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="moment-card">
      <div class="moment-kanji" aria-hidden="true"></div>
      <p class="kicker"></p>
      <h2></h2>
      <div class="moment-body"></div>
      <button class="solid wide moment-close">Done</button>
    </div>`;
  el.querySelector('.moment-kanji').textContent = kanji;
  el.querySelector('.kicker').textContent = kicker;
  el.querySelector('h2').textContent = title;
  el.querySelector('.moment-body').innerHTML = html;
  const closeBtn = el.querySelector('.moment-close');
  closeBtn.disabled = lock;
  const close = () => {
    if (closeBtn.disabled) return;
    el.classList.remove('in');
    setTimeout(() => el.remove(), 450);
    removeEventListener('keydown', onKey);
    onClose();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  addEventListener('keydown', onKey);
  closeBtn.onclick = close;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return { el, unlock: () => (closeBtn.disabled = false), close };
}
