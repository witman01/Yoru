// The tea house: the wet lane outside, the facade with its noren, and the
// tatami room inside. Interior spans x -6..6, z -12..0; the facade is at z 0.
import * as THREE from 'three';
import * as T from './textures.js';
import { materials } from './materials.js';

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function plane(w, h, mat, x, y, z, ry = 0, rx = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, 0);
  return m;
}

function glowMat(color, opacity = 1) {
  return new THREE.SpriteMaterial({
    map: T.glow(color),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity,
  });
}

/** Hanging chochin lantern at the entrance. */
function doorLantern(x) {
  const g = new THREE.Group();
  g.position.set(x, 2.15, 0.55);
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 20;
    pts.push(new THREE.Vector2(Math.cos(a) * 0.22 + 0.01, Math.sin(a) * 0.36));
  }
  const tex = T.brush('茶', { w: 1024, h: 256, paper: '#e84a2a', size: 190, vertical: false, color: '#1a0c08' });
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xff5a2a, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.9 });
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
  shell.rotation.y = -Math.PI / 2;
  g.add(shell);
  const m = materials();
  g.add(box(0.2, 0.05, 0.2, m.lacquer, 0, 0.38, 0));
  g.add(box(0.2, 0.05, 0.2, m.lacquer, 0, -0.38, 0));
  g.add(box(0.012, 0.25, 0.012, m.darkWood, 0, 0.52, 0));
  const light = new THREE.PointLight(0xff6a35, 2.4, 6, 2);
  g.add(light);
  const s = new THREE.Sprite(glowMat('rgba(255,110,60,0.9)', 0.7));
  s.scale.setScalar(1.6);
  g.add(s);
  g.userData = { mat, light };
  return g;
}

/** Noren curtain: three cloth panels moved on the CPU each frame. */
function noren() {
  const tex = T.brush('夜', { w: 1024, h: 512, size: 300, vertical: false, color: '#efe6d2' });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x1d2547, roughness: 0.95, side: THREE.DoubleSide });
  const ink = new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.95, depthWrite: false });
  const g = new THREE.Group();
  const panels = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(0.64, 1.05, 6, 10);
    // Each panel shows its third of the lettering.
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 3);
    const base = geo.attributes.position.array.slice();
    const x = (i - 1) * 0.67;
    const p = new THREE.Mesh(geo, cloth);
    const l = new THREE.Mesh(geo, ink);
    p.position.set(x, 1.97, 0.06);
    l.position.set(x, 1.97, 0.065);
    g.add(p, l);
    panels.push({ geo, base, i });
  }
  g.add(box(2.1, 0.035, 0.035, materials().darkWood, 0, 2.52, 0.06));
  g.userData.update = (t) => {
    for (const { geo, base, i } of panels) {
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const y = base[k * 3 + 1];
        const hang = (0.525 - y) / 1.05; // 0 at the rod, 1 at the hem
        const wave = Math.sin(t * 1.4 + i * 1.7 + base[k * 3] * 3) * 0.05 + Math.sin(t * 2.3 + i) * 0.02;
        pos.setZ(k, wave * hang * hang);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    }
  };
  return g;
}

/** Curved kawara roof over the facade, from instanced half-pipe tiles. */
function roof() {
  const m = materials();
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(0.11, 0.11, 2.3, 8, 1, true, 0, Math.PI);
  const mat = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.38, metalness: 0.35, side: THREE.DoubleSide });
  const cols = 64;
  const tiles = new THREE.InstancedMesh(geo, mat, cols);
  const d = new THREE.Object3D();
  for (let i = 0; i < cols; i++) {
    d.position.set(-7 + (i * 14) / (cols - 1), 3.55, 0.75);
    d.rotation.set(-(Math.PI / 2 - 0.55), 0, 0);
    d.updateMatrix();
    tiles.setMatrixAt(i, d.matrix);
  }
  g.add(tiles);
  const under = box(14.4, 0.06, 2.3, m.darkWood, 0, 3.47, 0.75);
  under.rotation.x = 0.55;
  g.add(under);
  const ridge = box(14.6, 0.16, 0.22, m.lacquer, 0, 4.05, -0.18);
  g.add(ridge);
  // Rafter ends under the eave.
  for (let i = 0; i < 28; i++) g.add(box(0.07, 0.07, 0.4, m.darkWood, -6.8 + i * 0.5, 3.0, 1.55));
  return g;
}

/** Distant hills, pagoda and moon behind the lane. */
function backdrop(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP;
        void main(){
          float h = clamp(vP.y * 1.4 + 0.15, 0.0, 1.0);
          vec3 c = mix(vec3(0.05,0.06,0.11), vec3(0.012,0.016,0.035), h);
          vec3 moonDir = normalize(vec3(-0.35, 0.32, 1.0));
          float d = distance(vP, moonDir);
          c += vec3(0.95,0.88,0.72) * smoothstep(0.045, 0.04, d);
          c += vec3(0.25,0.28,0.4) * exp(-d * 9.0) * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x0a0d18, fog: false });
  const hill = new THREE.Shape();
  hill.moveTo(-60, 0);
  for (let i = 0; i <= 24; i++) {
    const x = -60 + i * 5;
    hill.lineTo(x, 6 + Math.sin(i * 0.9) * 3 + Math.sin(i * 2.3) * 1.4);
  }
  hill.lineTo(60, -5);
  hill.lineTo(-60, -5);
  const hills = new THREE.Mesh(new THREE.ShapeGeometry(hill), hillMat);
  hills.position.set(0, -1, 60);
  hills.rotation.y = Math.PI;
  scene.add(hills);
  // Pagoda silhouette.
  const pag = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({ color: 0x05060c, fog: false });
  for (let i = 0; i < 5; i++) {
    const w = 3.2 - i * 0.45;
    pag.add(box(w * 0.55, 1.2, w * 0.55, dark, 0, 1 + i * 1.5, 0));
    const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 0.5, 4, 1), dark);
    r.position.y = 1.75 + i * 1.5;
    r.rotation.y = Math.PI / 4;
    pag.add(r);
  }
  pag.add(box(0.08, 2.2, 0.08, dark, 0, 9.5, 0));
  pag.position.set(-14, 2, 48);
  scene.add(pag);
}

export function buildHouse(scene) {
  const m = materials();
  const updates = [];
  backdrop(scene);

  // ---------- The lane ----------
  const ground = plane(60, 40, m.wetGround, 0, 0, 14, 0, -Math.PI / 2);
  scene.add(ground);
  const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.06, 14), m.stone, 9);
  const d = new THREE.Object3D();
  for (let i = 0; i < 9; i++) {
    d.position.set(Math.sin(i * 1.3) * 0.35, 0.03, 1.2 + i * 1.05);
    d.scale.set(0.42 + (i % 3) * 0.05, 1, 0.32 + (i % 2) * 0.06);
    d.rotation.y = i * 0.7;
    d.updateMatrix();
    stones.setMatrixAt(i, d.matrix);
  }
  scene.add(stones);

  // ---------- Facade ----------
  const facade = new THREE.Group();
  const shojiMat = (cols, rows, rep = [1, 1]) => {
    const tex = T.shoji(cols, rows, { repeat: rep });
    return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffb469, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.9 });
  };
  const frontShoji = shojiMat(4, 6, [2, 1]);
  facade.add(plane(4.6, 2.6, frontShoji, -3.6, 1.3, 0.02));
  facade.add(plane(4.6, 2.6, frontShoji, 3.6, 1.3, 0.02));
  facade.add(box(2.3, 0.6, 0.12, m.darkWood, 0, 2.85, 0));
  facade.add(box(12.4, 0.3, 0.16, m.darkWood, 0, 3.05, 0.02));
  for (const x of [-6.1, -1.25, 1.25, 6.1]) facade.add(box(0.2, 3.2, 0.2, m.darkWood, x, 1.6, 0.04));
  facade.add(box(12.4, 0.16, 0.24, m.darkWood, 0, 0.08, 0.04));
  scene.add(facade);
  scene.add(roof());
  const nr = noren();
  scene.add(nr);
  updates.push(nr.userData.update);
  const lanterns = [doorLantern(-1.6), doorLantern(1.6)];
  lanterns.forEach((l) => scene.add(l));
  updates.push((t) => {
    lanterns.forEach((l, i) => {
      l.rotation.z = Math.sin(t * 0.9 + i * 2) * 0.03;
      const f = 1 + Math.sin(t * 13 + i * 3) * 0.04 + Math.sin(t * 29 + i) * 0.03;
      l.userData.mat.emissiveIntensity = 1.6 * f;
      l.userData.light.intensity = 2.4 * f;
    });
  });
  // Lantern reflections on the wet stones: soft vertical streaks.
  for (const x of [-1.6, 1.6]) {
    const streak = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 3.2),
      new THREE.MeshBasicMaterial({ map: T.glow('rgba(255,110,60,1)'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    streak.rotation.x = -Math.PI / 2;
    streak.position.set(x, 0.012, 2.2);
    scene.add(streak);
  }

  // ---------- Interior ----------
  const room = new THREE.Group();
  // Tatami floor, 2 x 1 mats.
  const tat = new THREE.MeshStandardMaterial({ map: T.tatami(), roughness: 0.92 });
  const mats = new THREE.InstancedMesh(new THREE.BoxGeometry(1.96, 0.05, 0.96), tat, 72);
  let k = 0;
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 6; col++) {
      const rotate = (row + col) % 2 === 0;
      d.rotation.set(0, rotate ? 0 : Math.PI, 0);
      d.scale.set(1, 1, 1);
      d.position.set(-5 + col * 2, 0.025, -0.5 - row);
      d.updateMatrix();
      mats.setMatrixAt(k++, d.matrix);
    }
  }
  room.add(mats);
  // Dark boards under the mats so the seams read as shadow, not wet street.
  room.add(plane(12, 12, new THREE.MeshBasicMaterial({ color: 0x050403 }), 0, 0.012, -6, 0, -Math.PI / 2));
  // Ceiling with battens.
  room.add(plane(12, 12, m.darkWood, 0, 3.1, -6, 0, Math.PI / 2));
  for (let i = 0; i < 16; i++) room.add(box(12, 0.04, 0.05, m.wood, 0, 3.07, -0.4 - i * 0.75));
  // Posts and the kamoi beam that runs around the room.
  for (const x of [-6, 6]) for (let z = 0; z >= -12; z -= 3) room.add(box(0.18, 3.1, 0.18, m.darkWood, x, 1.55, z));
  for (const x of [-6, 6]) room.add(box(0.12, 0.18, 12, m.darkWood, x, 2.3, -6));
  room.add(box(12, 0.18, 0.12, m.darkWood, 0, 2.3, -12));
  room.add(box(12, 0.18, 0.12, m.darkWood, 0, 2.3, -0.06));
  // Shoji walls: moonlit on the left, lantern-lit on the right.
  const leftShoji = shojiMat(4, 6, [4, 1]);
  leftShoji.emissive.set(0x6f86c8);
  leftShoji.emissiveIntensity = 0.35;
  room.add(plane(12, 2.3, leftShoji, -5.98, 1.15, -6, Math.PI / 2));
  const rightShoji = shojiMat(4, 6, [4, 1]);
  rightShoji.emissiveIntensity = 0.16;
  room.add(plane(12, 2.3, rightShoji, 5.98, 1.15, -6, -Math.PI / 2));
  // Transom above the shoji: dark plaster.
  room.add(plane(12, 0.8, m.plaster, -5.97, 2.7, -6, Math.PI / 2));
  room.add(plane(12, 0.8, m.plaster, 5.97, 2.7, -6, -Math.PI / 2));
  // Back wall with the tokonoma alcove.
  room.add(plane(4.6, 3.1, m.plaster, -3.7, 1.55, -11.98));
  room.add(plane(4.6, 3.1, m.plaster, 3.7, 1.55, -11.98));
  room.add(plane(2.8, 3.1, m.plaster, 0, 1.55, -12.6));
  room.add(plane(0.6, 3.1, m.plaster, -1.4, 1.55, -12.3, Math.PI / 2));
  room.add(plane(0.6, 3.1, m.plaster, 1.4, 1.55, -12.3, -Math.PI / 2));
  room.add(box(2.8, 0.2, 0.62, m.lacquer, 0, 0.1, -12.3));
  room.add(box(0.16, 3.1, 0.16, m.paleWood, -1.42, 1.55, -12));
  room.add(box(2.9, 0.2, 0.14, m.darkWood, 0, 2.55, -12));
  // Hanging scroll.
  const scroll = new THREE.Group();
  scroll.add(plane(0.62, 1.55, new THREE.MeshStandardMaterial({ map: T.brush('夜', { w: 256, h: 640, paper: '#e6dbc2', size: 190, color: '#0e0b10' }), roughness: 0.95 }), 0, 1.45, -12.55));
  scroll.add(box(0.72, 0.04, 0.04, m.darkWood, 0, 2.24, -12.54));
  scroll.add(box(0.72, 0.05, 0.05, m.darkWood, 0, 0.66, -12.54));
  room.add(scroll);
  const alcoveLight = new THREE.SpotLight(0xffc27a, 3, 5, 0.6, 0.7, 1.6);
  alcoveLight.position.set(0, 2.9, -11.4);
  alcoveLight.target.position.set(0, 0.4, -12.2);
  room.add(alcoveLight, alcoveLight.target);
  // Soft fill on the front of the lacquer box, and on the name slip.
  const boxFill = new THREE.PointLight(0xffc890, 0.9, 2.6, 2);
  boxFill.position.set(0.7, 0.9, -11.0);
  const slipFill = new THREE.PointLight(0xffb070, 1.1, 2.8, 2);
  slipFill.position.set(1.9, 1.9, -9.2);
  room.add(boxFill, slipFill);

  // Low table with cushions (envelope + hanko sit here).
  const table = new THREE.Group();
  table.position.set(-3.2, 0, -4);
  table.add(box(1.4, 0.05, 0.8, m.paleWood, 0, 0.34, 0));
  for (const sx of [-0.6, 0.6]) for (const sz of [-0.32, 0.32]) table.add(box(0.06, 0.32, 0.06, m.darkWood, sx, 0.16, sz));
  for (const [x, z] of [[0, 0.75], [0, -0.75]]) {
    const c = box(0.55, 0.08, 0.55, m.indigo, x, 0.09, z);
    table.add(c);
  }
  room.add(table);
  // A candle-warm light over the table so the paper reads as paper.
  const tableLight = new THREE.PointLight(0xffa860, 1.2, 3.5, 2);
  tableLight.position.set(-3.0, 1.3, -3.3);
  room.add(tableLight);

  // Shelf on the right wall for the incense.
  room.add(box(0.9, 0.04, 0.32, m.wood, 5.7, 0.95, -2.4));
  room.add(box(0.04, 0.3, 0.32, m.darkWood, 5.27, 0.8, -2.4));

  // Pillar inside the room for the name slip.
  room.add(box(0.16, 3.1, 0.16, m.paleWood, 2.4, 1.55, -10.2));

  // Andon floor lamps.
  const andon = (x, z) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const tex = T.shoji(2, 3);
    const paper = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffa75a, emissiveMap: tex, emissiveIntensity: 1.3 });
    g.add(box(0.32, 0.6, 0.32, paper, 0, 0.55, 0));
    for (const sx of [-0.17, 0.17]) for (const sz of [-0.17, 0.17]) g.add(box(0.03, 0.9, 0.03, m.darkWood, sx, 0.45, sz));
    const l = new THREE.PointLight(0xff9d52, 2.2, 6, 2);
    l.position.y = 0.6;
    g.add(l);
    room.add(g);
  };
  andon(-5.3, -1.2);
  andon(5.2, -8.8);
  andon(-5.2, -10.6);

  scene.add(room);

  return {
    anchors: {
      envelope: { pos: new THREE.Vector3(-3.45, 0.365, -4.05), rot: 0.2 },
      hanko: { pos: new THREE.Vector3(-2.8, 0.365, -3.95), rot: -0.3 },
      box: { pos: new THREE.Vector3(0, 0.2, -12.25), rot: 0 },
      slip: { pos: new THREE.Vector3(2.4, 1.75, -9.98), rot: 0 },
      lantern: { pos: new THREE.Vector3(3.9, 1.25, -6), rot: 0 },
      incense: { pos: new THREE.Vector3(5.62, 0.97, -2.4), rot: 0 },
      counter: { pos: new THREE.Vector3(0, 0, -6.2), rot: 0 },
    },
    update(t) {
      for (const u of updates) u(t);
    },
  };
}
