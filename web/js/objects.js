// The seven objects of the tea house. Each factory returns
//   { root, update(t, dt), play(), playing }
// `update` runs every frame; `play()` starts the object's action once.
import * as THREE from 'three';
import * as T from './textures.js';
import { materials } from './materials.js';

const ease = (x) => x * x * (3 - 2 * x);
/** 0..1 eased progress of p through [a, b]. */
const seg = (p, a, b) => ease(THREE.MathUtils.clamp((p - a) / (b - a), 0, 1));

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Runs an action of `length` seconds; `step(p)` gets 0..1, then 1 at rest. */
function action(length, step) {
  const a = {
    p: 1,
    playing: false,
    play() {
      a.p = 0;
      a.playing = true;
    },
    tick(dt) {
      if (a.playing) {
        a.p = Math.min(1, a.p + dt / length);
        if (a.p >= 1) a.playing = false;
      }
      step(a.p);
    },
  };
  return a;
}

function glowSprite(color, size) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: T.glow(color),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  s.scale.setScalar(size);
  return s;
}

/** Rising wisps (steam, smoke) as a small CPU particle loop. */
function wisps({ count = 40, color = 0xd8d4cc, size = 0.04, height = 0.5, spread = 0.03, speed = 0.12, opacity = 0.22 }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const life = new Float32Array(count).map(() => Math.random());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size,
    map: T.glow('rgba(255,255,255,1)'),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.update = (dt, t) => {
    for (let i = 0; i < count; i++) {
      life[i] += (dt * speed) / height;
      if (life[i] > 1) life[i] -= 1;
      const l = life[i];
      pos[i * 3] = Math.sin(l * 9 + i + t * 0.7) * spread * (0.3 + l * 2);
      pos[i * 3 + 1] = l * height;
      pos[i * 3 + 2] = Math.cos(l * 7 + i * 1.3 + t * 0.5) * spread * (0.3 + l * 2);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}

// 01 封 · noshi envelope with a flap that opens and a card that rises.
export function envelope() {
  const m = materials();
  const root = new THREE.Group();
  const paper = m.washi.clone();
  paper.side = THREE.DoubleSide;
  paper.color.set(0xf1e7d0);

  root.add(mesh(new THREE.BoxGeometry(0.5, 0.012, 0.32), m.washi, 0, 0.006, 0));

  const card = mesh(
    new THREE.BoxGeometry(0.44, 0.004, 0.28),
    new THREE.MeshStandardMaterial({
      map: T.brush('壱', { w: 512, h: 320, paper: '#f8f1df', size: 150, vertical: false, small: '5 NEAR · A CHEQUE' }),
      roughness: 0.9,
    }),
    0,
    0.006,
    0,
  );
  root.add(card);

  const flapPivot = new THREE.Group();
  flapPivot.position.set(0, 0.0125, -0.16);
  const shape = new THREE.Shape();
  shape.moveTo(-0.25, 0);
  shape.lineTo(0.25, 0);
  shape.lineTo(0, 0.2);
  shape.closePath();
  const flap = mesh(new THREE.ShapeGeometry(shape), paper);
  flap.rotation.x = Math.PI / 2;
  const wax = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 24), m.vermilion, 0, 0.165, -0.003);
  wax.rotation.x = Math.PI / 2;
  flap.add(wax);
  flapPivot.add(flap);
  root.add(flapPivot);

  // Noshi ornament and mizuhiki knot on the front corner.
  const noshi = new THREE.Shape();
  noshi.moveTo(0, 0.05);
  noshi.lineTo(0.018, 0.03);
  noshi.lineTo(0.018, -0.03);
  noshi.lineTo(0, -0.05);
  noshi.lineTo(-0.018, -0.03);
  noshi.lineTo(-0.018, 0.03);
  noshi.closePath();
  const orn = mesh(new THREE.ShapeGeometry(noshi), m.vermilion, 0.18, 0.0135, 0.08);
  orn.rotation.x = -Math.PI / 2;
  orn.rotation.z = 0.5;
  root.add(orn);
  const knot = mesh(new THREE.TorusKnotGeometry(0.014, 0.003, 64, 8, 2, 3), m.cordRed, 0.11, 0.02, 0.1);
  knot.rotation.x = Math.PI / 2;
  root.add(knot);
  root.add(mesh(new THREE.BoxGeometry(0.5, 0.004, 0.006), m.cordRed, 0, 0.013, 0.1));
  root.add(mesh(new THREE.BoxGeometry(0.5, 0.004, 0.006), m.cordWhite, 0, 0.013, 0.108));

  const act = action(3.6, (p) => {
    const open = seg(p, 0, 0.22) * (1 - seg(p, 0.82, 1));
    const rise = seg(p, 0.22, 0.45) * (1 - seg(p, 0.68, 0.84));
    flapPivot.rotation.x = -open * 2.75;
    card.position.y = 0.006 + rise * 0.2;
    card.position.z = rise * 0.06;
    card.rotation.x = -rise * 0.55;
  });
  return { root, play: act.play, update: (t, dt) => act.tick(dt), get playing() { return act.playing; } };
}

// 02 印 · a hanko dips in vermilion and leaves its impression.
export function hanko() {
  const m = materials();
  const root = new THREE.Group();
  const profile = [
    [0, 0], [0.03, 0], [0.03, 0.012], [0.024, 0.04], [0.021, 0.09],
    [0.024, 0.12], [0.03, 0.15], [0.027, 0.168], [0.013, 0.179], [0, 0.181],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const stamp = new THREE.Group();
  stamp.add(mesh(new THREE.LatheGeometry(profile, 40), m.redLacquer));
  stamp.add(mesh(new THREE.CylinderGeometry(0.0302, 0.0302, 0.004, 40), m.vermilion, 0, 0.002, 0));
  stamp.add(mesh(new THREE.TorusGeometry(0.0285, 0.0025, 8, 40), m.gold, 0, 0.15, 0)).children.at(-1).rotation.x = Math.PI / 2;
  root.add(stamp);

  const pad = new THREE.Group();
  pad.position.set(-0.14, 0, 0);
  pad.add(mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.026, 40), m.celadon, 0, 0.013, 0));
  pad.add(mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.004, 40), m.vermilion, 0, 0.026, 0));
  root.add(pad);

  const sheet = mesh(new THREE.PlaneGeometry(0.24, 0.32), m.washi, 0.1, 0.001, 0);
  sheet.rotation.x = -Math.PI / 2;
  root.add(sheet);
  const markMat = new THREE.MeshStandardMaterial({ map: T.seal(), transparent: true, opacity: 0, roughness: 0.8, depthWrite: false });
  const mark = mesh(new THREE.PlaneGeometry(0.062, 0.062), markMat, 0.1, 0.0022, 0);
  mark.rotation.x = -Math.PI / 2;
  root.add(mark);

  const rest = new THREE.Vector3(-0.14, 0.03, 0);
  const over = new THREE.Vector3(0.1, 0.0022, 0);
  const act = action(3.8, (p) => {
    const up = 0.16;
    const lift1 = seg(p, 0, 0.16);
    const across = seg(p, 0.16, 0.4);
    const press = seg(p, 0.4, 0.5) * (1 - seg(p, 0.6, 0.7));
    const back = seg(p, 0.7, 0.88);
    const drop = seg(p, 0.88, 1);
    const x = THREE.MathUtils.lerp(THREE.MathUtils.lerp(rest.x, over.x, across), rest.x, back);
    let y = rest.y + up * lift1 * (1 - drop);
    if (across >= 1 && back <= 0) y = THREE.MathUtils.lerp(rest.y + up, over.y, press);
    stamp.position.set(x, y, 0);
    stamp.rotation.z = Math.sin(across * Math.PI) * -0.25 + Math.sin(back * Math.PI) * 0.25;
    if (p < 0.02) markMat.opacity = 0;
    if (p > 0.49) markMat.opacity = Math.max(markMat.opacity, seg(p, 0.49, 0.56) * 0.95);
  });
  stamp.position.copy(rest);
  markMat.opacity = 0.95;
  return { root, play: act.play, update: (t, dt) => act.tick(dt), get playing() { return act.playing; } };
}

// 03 箱 · the lacquer box: the cord loosens, the lid lifts, light inside.
export function box() {
  const m = materials();
  const root = new THREE.Group();
  const W = 0.36, H = 0.16, D = 0.26;
  root.add(mesh(new THREE.BoxGeometry(W, H, D), m.lacquer, 0, H / 2, 0));
  const strip = (w, h, d, x, y, z) => root.add(mesh(new THREE.BoxGeometry(w, h, d), m.gold, x, y, z));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) strip(0.012, H, 0.012, (sx * W) / 2, H / 2, (sz * D) / 2);
  strip(W + 0.012, 0.01, 0.012, 0, H - 0.005, D / 2);
  strip(W + 0.012, 0.01, 0.012, 0, H - 0.005, -D / 2);
  strip(0.012, 0.01, D, W / 2, H - 0.005, 0);
  strip(0.012, 0.01, D, -W / 2, H - 0.005, 0);

  // Inner glow and a folded cheque waiting inside.
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x9a5a24, transparent: true, opacity: 0 });
  const inner = mesh(new THREE.PlaneGeometry(W - 0.03, D - 0.03), glowMat, 0, H - 0.012, 0);
  inner.rotation.x = -Math.PI / 2;
  root.add(inner);
  root.add(mesh(new THREE.BoxGeometry(0.2, 0.01, 0.13), m.washi, 0, H - 0.008, 0));
  const light = new THREE.PointLight(0xffa24a, 0, 1.6, 2);
  light.position.set(0, H + 0.05, 0);
  root.add(light);

  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, H, -D / 2 - 0.005);
  const lid = new THREE.Group();
  lid.position.z = D / 2 + 0.005;
  lid.add(mesh(new THREE.BoxGeometry(W + 0.012, 0.05, D + 0.012), m.lacquer, 0, 0.025, 0));
  for (const z of [-1, 1]) lid.add(mesh(new THREE.BoxGeometry(W + 0.016, 0.008, 0.008), m.gold, 0, 0.004, (z * (D + 0.012)) / 2));
  for (const x of [-1, 1]) lid.add(mesh(new THREE.BoxGeometry(0.008, 0.008, D + 0.016), m.gold, (x * (W + 0.012)) / 2, 0.004, 0));
  const crestMat = new THREE.MeshStandardMaterial({ map: T.crest(), transparent: true, alphaTest: 0.4, metalness: 1, roughness: 0.25 });
  const crest = mesh(new THREE.PlaneGeometry(0.15, 0.15), crestMat, 0, 0.0505, 0);
  crest.rotation.x = -Math.PI / 2;
  lid.add(crest);
  lidPivot.add(lid);
  root.add(lidPivot);

  // Sanada cord tied over the lid.
  const cordMat = m.cordRed.clone();
  cordMat.transparent = true;
  const cord = new THREE.Group();
  const top = H + 0.054;
  cord.add(mesh(new THREE.BoxGeometry(W + 0.03, 0.008, 0.016), cordMat, 0, top, 0));
  cord.add(mesh(new THREE.BoxGeometry(0.016, 0.008, D + 0.03), cordMat, 0, top, 0));
  for (const s of [-1, 1]) {
    cord.add(mesh(new THREE.BoxGeometry(0.008, top, 0.016), cordMat, (s * (W + 0.03)) / 2, top / 2, 0));
    cord.add(mesh(new THREE.BoxGeometry(0.016, top, 0.008), cordMat, 0, top / 2, (s * (D + 0.03)) / 2));
  }
  const bow = mesh(new THREE.TorusGeometry(0.022, 0.006, 10, 30), cordMat, 0, top + 0.012, 0);
  cord.add(bow);
  const tassel = mesh(new THREE.ConeGeometry(0.012, 0.07, 12), cordMat, 0.03, top - 0.03, D / 2 + 0.03);
  cord.add(tassel);
  root.add(cord);

  const act = action(4.2, (p) => {
    const loose = seg(p, 0, 0.16) * (1 - seg(p, 0.86, 1));
    const open = seg(p, 0.16, 0.4) * (1 - seg(p, 0.68, 0.86));
    cordMat.opacity = 1 - loose;
    cord.visible = cordMat.opacity > 0.02;
    cord.scale.set(1 + loose * 0.08, 1 + loose * 0.15, 1 + loose * 0.08);
    lidPivot.rotation.x = -open * 1.95;
    glowMat.opacity = open;
    light.intensity = open * 0.7;
  });
  return { root, play: act.play, update: (t, dt) => act.tick(dt), get playing() { return act.playing; } };
}

// 04 宛 · a name slip on a cord; it turns to show the signature.
export function slip() {
  const m = materials();
  const root = new THREE.Group();
  const hook = mesh(new THREE.TorusGeometry(0.014, 0.003, 8, 24), m.gold);
  root.add(hook);
  root.add(mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.1, 6), m.cordWhite, 0, -0.06, 0));
  const pivot = new THREE.Group();
  pivot.position.y = -0.11;
  root.add(pivot);

  const face = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
  const front = mesh(
    new THREE.PlaneGeometry(0.12, 0.34),
    face(T.brush('宛', { w: 256, h: 720, paper: '#efe6d2', size: 150, small: 'bob.near' })),
    0, -0.17, 0.001,
  );
  const back = mesh(
    new THREE.PlaneGeometry(0.12, 0.34),
    face(T.brush('署名', { w: 256, h: 720, paper: '#e9dfc9', size: 120, small: 'SIGNED' })),
    0, -0.17, -0.001,
  );
  back.rotation.y = Math.PI;
  pivot.add(front, back);
  const sealMat = new THREE.MeshStandardMaterial({ map: T.seal(), transparent: true, opacity: 0, depthWrite: false });
  const sealMark = mesh(new THREE.PlaneGeometry(0.05, 0.05), sealMat, 0, -0.29, -0.002);
  sealMark.rotation.y = Math.PI;
  pivot.add(sealMark);
  pivot.add(mesh(new THREE.TorusGeometry(0.006, 0.0015, 6, 16), m.gold, 0, -0.012, 0));

  const act = action(3.4, (p) => {
    const turn = seg(p, 0, 0.3) * (1 - seg(p, 0.75, 1));
    pivot.userData.turn = turn * Math.PI;
    if (p < 0.02) sealMat.opacity = 0;
    sealMat.opacity = Math.max(sealMat.opacity, seg(p, 0.32, 0.45)) * (p >= 1 ? 1 : 1);
  });
  return {
    root,
    play: act.play,
    update(t, dt) {
      act.tick(dt);
      pivot.rotation.z = Math.sin(t * 1.1) * 0.05;
      pivot.rotation.y = (pivot.userData.turn ?? 0) + Math.sin(t * 0.7) * 0.12;
    },
    get playing() { return act.playing; },
  };
}

// 05 灯 · the courier's paper lantern, carried on a pole.
export function lantern({ walk = false } = {}) {
  const m = materials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 24;
    pts.push(new THREE.Vector2(Math.cos(a) * 0.15 + 0.004, Math.sin(a) * 0.2));
  }
  const paperTex = T.brush('夜', { w: 1024, h: 256, paper: '#f3d6a0', size: 170, vertical: false, color: '#7a1c12' });
  const paper = new THREE.MeshStandardMaterial({
    map: paperTex,
    emissive: 0xffa048,
    emissiveMap: paperTex,
    emissiveIntensity: 1.5,
    side: THREE.DoubleSide,
    roughness: 0.9,
  });
  const shell = mesh(new THREE.LatheGeometry(pts, 48), paper);
  shell.rotation.y = -Math.PI / 2;
  body.add(shell);
  for (let i = 1; i < 9; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 9;
    const ring = mesh(new THREE.TorusGeometry(Math.cos(a) * 0.15 + 0.006, 0.0022, 6, 48), m.darkWood, 0, Math.sin(a) * 0.2, 0);
    ring.rotation.x = Math.PI / 2;
    body.add(ring);
  }
  body.add(mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.035, 32), m.lacquer, 0, 0.205, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.035, 32), m.lacquer, 0, -0.205, 0));
  const bulb = new THREE.PointLight(0xff9a44, 2.2, 5, 2);
  body.add(bulb);
  const halo = glowSprite('rgba(255,170,90,0.9)', 0.9);
  body.add(halo);

  // Pole from the top cap to an unseen hand above and behind.
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0.22, 0),
    new THREE.Vector3(0, 0.42, 0),
    new THREE.Vector3(-0.15, 0.6, 0),
    new THREE.Vector3(-0.55, 0.72, 0),
  );
  root.add(mesh(new THREE.TubeGeometry(curve, 24, 0.006, 6), m.darkWood));

  let flare = 0;
  const act = action(2.6, (p) => {
    flare = Math.sin(p * Math.PI);
  });
  const base = new THREE.Vector3();
  let based = false;
  return {
    root,
    play: act.play,
    update(t, dt) {
      act.tick(dt);
      if (walk) {
        if (!based) {
          base.copy(root.position);
          based = true;
        }
        root.position.set(base.x, base.y + Math.sin(t * 2.4) * 0.03, base.z + Math.sin(t * 0.22) * 2.6);
      }
      body.rotation.z = Math.sin(t * 2.4) * 0.07 + flare * Math.sin(t * 9) * 0.15;
      body.rotation.x = Math.cos(t * 1.7) * 0.04;
      const flicker = 1 + Math.sin(t * 17) * 0.04 + Math.sin(t * 31) * 0.03;
      paper.emissiveIntensity = (1.5 + flare * 1.3) * flicker;
      bulb.intensity = (2.2 + flare * 2) * flicker;
      halo.material.opacity = 0.55 + flare * 0.4;
    },
    get playing() { return act.playing; },
  };
}

// 06 香 · an incense stick with seven marks, burning down.
export function incense({ cycle = 30 } = {}) {
  const m = materials();
  const root = new THREE.Group();
  const dish = [[0, 0], [0.06, 0], [0.066, 0.006], [0.07, 0.026], [0.064, 0.028], [0.058, 0.012], [0, 0.012]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  root.add(mesh(new THREE.LatheGeometry(dish, 40), m.celadon));
  root.add(mesh(new THREE.CylinderGeometry(0.056, 0.056, 0.006, 32), m.ash, 0, 0.016, 0));
  root.add(mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.012, 16), m.iron, 0, 0.022, 0));

  const L = 0.32;
  const stick = new THREE.Group();
  stick.position.y = 0.022;
  root.add(stick);
  const rod = mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 1, 8), new THREE.MeshStandardMaterial({ color: 0x4f5636, roughness: 0.9 }));
  stick.add(rod);
  const marks = [];
  for (let i = 1; i <= 7; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.0036, 0.0011, 6, 16), m.gold, 0, (L * i) / 7.4, 0);
    ring.rotation.x = Math.PI / 2;
    stick.add(ring);
    marks.push(ring);
  }
  const tip = new THREE.Group();
  tip.add(mesh(new THREE.SphereGeometry(0.0035, 10, 8), m.ember));
  tip.add(glowSprite('rgba(255,120,40,1)', 0.06));
  const tipLight = new THREE.PointLight(0xff7a2a, 0.5, 0.8, 2);
  tip.add(tipLight);
  stick.add(tip);
  const smoke = wisps({ count: 50, color: 0xb8c0d0, size: 0.035, height: 0.55, spread: 0.02, speed: 0.07, opacity: 0.16 });
  stick.add(smoke);

  let manual = -1;
  const act = action(6, (p) => {
    manual = p >= 1 ? -1 : p;
  });
  const setBurn = (burn) => {
    const left = L * (1 - burn * 0.9);
    rod.scale.y = left;
    rod.position.y = left / 2;
    tip.position.y = left;
    smoke.position.y = left;
    marks.forEach((r) => (r.visible = r.position.y < left - 0.002));
  };
  return {
    root,
    play: act.play,
    update(t, dt) {
      act.tick(dt);
      setBurn(manual >= 0 ? manual : (t / cycle) % 1);
      smoke.update(dt, t);
      tipLight.intensity = 0.4 + Math.sin(t * 6) * 0.08;
    },
    get playing() { return act.playing; },
  };
}

// 07 茶 · the counter: kettle over coals, two trays (leave / collect).
export function counter() {
  const m = materials();
  const root = new THREE.Group();
  root.add(mesh(new THREE.BoxGeometry(2.6, 0.07, 0.8), m.paleWood, 0, 0.4, 0));
  root.add(mesh(new THREE.BoxGeometry(2.6, 0.36, 0.05), m.darkWood, 0, 0.18, 0.37));
  root.add(mesh(new THREE.BoxGeometry(2.6, 0.36, 0.05), m.darkWood, 0, 0.18, -0.37));
  for (const x of [-1.28, 1.28]) root.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.8), m.darkWood, x, 0.18, 0));

  // Brazier and kettle.
  const brazier = new THREE.Group();
  brazier.position.set(-0.85, 0.435, 0);
  brazier.add(mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.2, 40, 1, true), m.ceramic, 0, 0.1, 0));
  brazier.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.01, 32), m.ash, 0, 0.15, 0));
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    brazier.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), m.ember, Math.cos(a) * 0.08, 0.16, Math.sin(a) * 0.08));
  }
  const coalLight = new THREE.PointLight(0xff6a20, 1.4, 2.2, 2);
  coalLight.position.y = 0.2;
  brazier.add(coalLight);
  const kettlePts = [];
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 20;
    kettlePts.push(new THREE.Vector2(Math.cos(a) * 0.12 + 0.01, Math.sin(a) * 0.09));
  }
  const kettle = new THREE.Group();
  kettle.position.y = 0.27;
  kettle.add(mesh(new THREE.LatheGeometry(kettlePts, 40), m.iron));
  kettle.add(mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 24), m.iron, 0, 0.095, 0));
  kettle.add(mesh(new THREE.SphereGeometry(0.014, 12, 8), m.gold, 0, 0.112, 0));
  const spout = mesh(new THREE.CylinderGeometry(0.009, 0.016, 0.12, 12), m.iron, 0.13, 0.02, 0);
  spout.rotation.z = -0.9;
  kettle.add(spout);
  const handle = mesh(new THREE.TorusGeometry(0.1, 0.006, 8, 30, Math.PI), m.iron, 0, 0.09, 0);
  kettle.add(handle);
  brazier.add(kettle);
  const steam = wisps({ count: 40, size: 0.06, height: 0.6, spread: 0.03, speed: 0.1, opacity: 0.12 });
  steam.position.set(0.18, 0.33, 0);
  brazier.add(steam);
  root.add(brazier);

  // Two trays and their cards.
  const tray = (x, label, sub) => {
    const g = new THREE.Group();
    g.position.set(x, 0.435, 0.02);
    g.add(mesh(new THREE.BoxGeometry(0.46, 0.02, 0.32), m.lacquer, 0, 0.01, 0));
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.BoxGeometry(0.46, 0.03, 0.012), m.lacquer, 0, 0.02, s * 0.16));
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.03, 0.32), m.lacquer, s * 0.23, 0.02, 0));
    }
    const card = mesh(
      new THREE.PlaneGeometry(0.1, 0.2),
      new THREE.MeshStandardMaterial({ map: T.brush(label, { w: 200, h: 400, paper: '#efe6d2', size: 120, small: sub }), roughness: 0.9 }),
      -0.16, 0.12, -0.12,
    );
    g.add(card);
    root.add(g);
    return g;
  };
  const leave = tray(0.0, '置', 'LEAVE');
  const take = tray(0.62, '受', 'COLLECT');
  for (let i = 0; i < 3; i++) {
    const e = mesh(new THREE.BoxGeometry(0.22, 0.008, 0.14), m.washi, 0.04, 0.024 + i * 0.009, 0.02);
    e.rotation.y = (i - 1) * 0.12;
    leave.add(e);
  }
  leave.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 20), m.vermilion, 0.04, 0.05, 0.02));
  const slipFlat = mesh(new THREE.PlaneGeometry(0.06, 0.18), new THREE.MeshStandardMaterial({ map: T.brush('宛', { w: 128, h: 384, paper: '#efe6d2', size: 90 }) }), 0.05, 0.022, 0.02);
  slipFlat.rotation.x = -Math.PI / 2;
  slipFlat.rotation.z = 0.3;
  take.add(slipFlat);

  // Cups.
  for (const x of [1.05, 1.15]) {
    root.add(mesh(new THREE.CylinderGeometry(0.035, 0.026, 0.05, 24, 1, true), m.celadon, x, 0.46, x === 1.05 ? 0.08 : -0.06));
  }

  return {
    root,
    play() {},
    update(t, dt) {
      steam.update(dt, t);
      coalLight.intensity = 1.3 + Math.sin(t * 3.1) * 0.15 + Math.sin(t * 7.3) * 0.08;
    },
    get playing() { return false; },
  };
}

export const FACTORIES = { envelope, hanko, box, slip, lantern, incense, counter };
