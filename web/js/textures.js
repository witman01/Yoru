// Every surface is painted at runtime on a canvas: no image files.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Small seeded random so the room looks the same on every visit.
let seed = 7;
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function finish(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function wood(base, dark, opts = {}) {
  const [c, g] = canvas(256, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256;
    const amp = 2 + rand() * 6;
    const freq = 0.004 + rand() * 0.012;
    g.strokeStyle = dark;
    g.globalAlpha = 0.08 + rand() * 0.22;
    g.lineWidth = 0.6 + rand() * 2.2;
    g.beginPath();
    for (let y = 0; y <= 512; y += 8) {
      const xx = x + Math.sin(y * freq + i) * amp + Math.sin(y * freq * 3.1) * amp * 0.3;
      y === 0 ? g.moveTo(xx, y) : g.lineTo(xx, y);
    }
    g.stroke();
  }
  // A few knots.
  for (let i = 0; i < 3; i++) {
    const x = rand() * 256;
    const y = rand() * 512;
    for (let r = 14; r > 2; r -= 3) {
      g.globalAlpha = 0.12;
      g.beginPath();
      g.ellipse(x, y, r * 0.6, r * 1.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return finish(c, opts);
}

export function washi(base = '#efe6d2', opts = {}) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    g.strokeStyle = rand() > 0.5 ? 'rgba(120,96,60,0.10)' : 'rgba(255,255,255,0.35)';
    g.lineWidth = 0.4 + rand();
    const x = rand() * 256;
    const y = rand() * 256;
    const a = rand() * Math.PI * 2;
    const l = 4 + rand() * 18;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 1) * l * 0.5, y + Math.sin(a + 1) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return finish(c, opts);
}

export function tatami() {
  const [c, g] = canvas(512, 256);
  g.fillStyle = '#8a8250';
  g.fillRect(0, 0, 512, 256);
  for (let x = 0; x < 512; x += 3) {
    g.fillStyle = `rgba(${40 + rand() * 30},${36 + rand() * 20},10,${0.12 + rand() * 0.15})`;
    g.fillRect(x, 0, 1.2, 256);
  }
  for (let y = 0; y < 256; y += 18) {
    g.fillStyle = 'rgba(30,26,10,0.18)';
    g.fillRect(0, y, 512, 1);
  }
  // Cloth border (heri) along the long edges.
  g.fillStyle = '#1d2133';
  g.fillRect(0, 0, 512, 14);
  g.fillRect(0, 242, 512, 14);
  return finish(c);
}

/** Shoji: paper with a wooden lattice. Used as both colour and glow map. */
export function shoji(cols = 4, rows = 6, opts = {}) {
  const [c, g] = canvas(512, 768);
  const grad = g.createRadialGradient(256, 380, 40, 256, 380, 520);
  grad.addColorStop(0, '#f6e7c8');
  grad.addColorStop(1, '#cdb48a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 768);
  g.globalAlpha = 0.25;
  g.drawImage(washi('#efe2c4').image, 0, 0, 512, 768);
  g.globalAlpha = 1;
  g.fillStyle = '#2a1a10';
  const bar = 7;
  for (let i = 0; i <= cols; i++) g.fillRect((i * (512 - bar)) / cols, 0, bar, 768);
  for (let j = 0; j <= rows; j++) g.fillRect(0, (j * (768 - bar)) / rows, 512, bar);
  // Heavier frame.
  g.lineWidth = 18;
  g.strokeStyle = '#21140b';
  g.strokeRect(0, 0, 512, 768);
  return finish(c, opts);
}

export function plaster() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#3b2f26';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = rand() > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,180,0.05)';
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }
  return finish(c, { repeat: [3, 2] });
}

/** Brushed calligraphy: dark ink on transparent or on paper. */
export function brush(text, {
  w = 256,
  h = 512,
  color = '#141018',
  paper = null,
  size = 180,
  font = '"Shippori Mincho B1", serif',
  vertical = true,
  small = null,
} = {}) {
  const [c, g] = canvas(w, h);
  if (paper) {
    g.fillStyle = paper;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.35;
    g.drawImage(washi(paper).image, 0, 0, w, h);
    g.globalAlpha = 1;
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${size}px ${font}`;
  if (vertical) {
    const chars = [...text];
    const step = size * 1.02;
    const start = h / 2 - ((chars.length - 1) * step) / 2 - (small ? size * 0.25 : 0);
    chars.forEach((ch, i) => g.fillText(ch, w / 2, start + i * step));
  } else {
    g.fillText(text, w / 2, h / 2);
  }
  if (small) {
    g.font = `500 ${Math.round(size * 0.16)}px "IBM Plex Mono", monospace`;
    g.globalAlpha = 0.8;
    g.fillText(small, w / 2, h - size * 0.32);
    g.globalAlpha = 1;
  }
  return finish(c);
}

/** A square vermilion seal impression with white characters. */
export function seal(text = '夜') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#c8402f';
  g.fillRect(18, 18, 220, 220);
  // Worn edges.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    const edge = rand() * 4;
    const t = rand() * 220 + 18;
    const pos = [[t, 18], [t, 238], [18, t], [238, t]][Math.floor(edge)];
    g.beginPath();
    g.arc(pos[0], pos[1], 1 + rand() * 4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#f4ead8';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 ${[...text].length === 1 ? 150 : 92}px "Shippori Mincho B1", serif`;
  const chars = [...text];
  if (chars.length === 2) {
    g.fillText(chars[0], 128, 80);
    g.fillText(chars[1], 128, 176);
  } else {
    g.fillText(text, 128, 128);
  }
  const t = finish(c);
  return t;
}

/** Gold crest for the lacquer box lid. */
export function crest() {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = '#e2b860';
  g.fillStyle = '#e2b860';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  // Crescent moon behind cloud bands.
  g.beginPath();
  g.arc(128, 118, 58, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(150, 104, 52, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.lineWidth = 6;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(52 + i * 10, 168 + i * 16);
    g.bezierCurveTo(100, 150 + i * 16, 150, 186 + i * 16, 204 - i * 10, 166 + i * 16);
    g.stroke();
  }
  return finish(c);
}

export function roofTiles() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1b1d24';
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const grad = g.createLinearGradient(x, 0, x + 32, 0);
    grad.addColorStop(0, '#0d0e13');
    grad.addColorStop(0.5, '#3a3d4a');
    grad.addColorStop(1, '#0d0e13');
    g.fillStyle = grad;
    g.fillRect(x, 0, 32, 256);
  }
  for (let y = 0; y < 256; y += 42) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(0, y, 256, 4);
  }
  return finish(c, { repeat: [6, 2] });
}

/** Soft round glow for sprites. */
export function glow(inner = 'rgba(255,190,110,1)') {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.35)'));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return finish(c);
}
