// Renderer, environment light, rain, dust and the ink-bleed post pass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const MOBILE = matchMedia('(max-width: 760px), (pointer: coarse)').matches;

export function makeRenderer(canvas, { alpha = false } = {}) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, alpha, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.3;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

/** A dim, warm reflection map so lacquer and gold have something to show. */
export function environment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a0806);
  const panel = (color, w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    env.add(m);
  };
  panel(0xffa04a, 3, 2, 0, 1.5, -4, 0);
  panel(0xff7a30, 1, 1, -3, 1, 2, Math.PI / 2);
  panel(0x4a5f9a, 4, 2, 4, 1.5, 0, -Math.PI / 2);
  panel(0x2a1a10, 10, 10, 0, -2, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}

/** Rain over the lane: line segments animated entirely on the GPU. */
export function rain(count) {
  const pos = new Float32Array(count * 6);
  const seed = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 22;
    const z = 0.6 + Math.random() * 16;
    const ph = Math.random();
    const sp = 0.8 + Math.random() * 0.5;
    for (let e = 0; e < 2; e++) {
      pos.set([x, 0, z], i * 6 + e * 3);
      seed.set([ph, sp, e, 0], i * 8 + e * 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute vec4 aSeed;
      uniform float uTime;
      varying float vA;
      void main() {
        float H = 9.0;
        float y = mod(aSeed.x * H - uTime * 9.0 * aSeed.y, H);
        vec3 p = position;
        p.y = y + aSeed.z * 0.32;
        p.x += aSeed.z * 0.05;
        vA = (1.0 - aSeed.z) * 0.9 + 0.1;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying float vA;
      void main() { gl_FragColor = vec4(0.62, 0.7, 0.9, 0.28 * vA); }`,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.update = (t) => (mat.uniforms.uTime.value = t);
  return lines;
}

/** Warm dust drifting in the room's light. */
export function dust(count) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) pos.set([(Math.random() - 0.5) * 11, Math.random() * 3, -Math.random() * 12], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: innerHeight / 2 } },
    vertexShader: `
      uniform float uTime; uniform float uScale;
      varying float vA;
      void main() {
        vec3 p = position;
        float s = p.x * 1.7 + p.z * 0.9;
        p.x += sin(uTime * 0.13 + s) * 0.3;
        p.y = mod(p.y + uTime * 0.05 + sin(s) * 0.2, 3.0);
        p.z += cos(uTime * 0.11 + s * 1.3) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * 0.012 / -mv.z;
        vA = 0.5 + 0.5 * sin(uTime * 0.8 + s * 3.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(1.0, 0.72, 0.42, smoothstep(0.5, 0.0, d) * 0.45 * vA);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.update = (t) => (mat.uniforms.uTime.value = t);
  return pts;
}

const InkShader = {
  uniforms: {
    tDiffuse: { value: null },
    uCover: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uCover, uTime, uAspect;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
      return v;
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = vec2(vUv.x * uAspect, vUv.y);
      float field = fbm(p * 2.4 + vec2(0.0, uTime * 0.02)) * 0.8 + fbm(p * 9.0 - uTime * 0.03) * 0.2;

      // Full cover: ink pools where the field is low and spreads as uCover rises.
      float thr = uCover * 1.3 - 0.12;
      float cover = 1.0 - smoothstep(thr - 0.035, thr, field);

      vec2 q = vUv - 0.5;
      vec3 inkCol = vec3(0.016, 0.018, 0.03);
      vec3 col = mix(c.rgb, inkCol, cover);

      // Ember rim where ink meets paper.
      float live = step(0.001, uCover) * step(uCover, 0.995);
      float rim = (1.0 - smoothstep(0.0, 0.03, abs(field - thr))) * live;
      col += vec3(1.0, 0.42, 0.12) * rim * 1.6 * (1.0 - cover * 0.6);

      // Vignette and grain.
      col *= 1.0 - dot(q, q) * 0.55;
      col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.01;
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function composer(renderer, scene, camera) {
  const c = new EffectComposer(renderer);
  c.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.75, 0.6, 0.82);
  c.addPass(bloom);
  const ink = new ShaderPass(InkShader);
  c.addPass(ink);
  c.addPass(new OutputPass());
  return { composer: c, ink: ink.uniforms, bloom };
}
