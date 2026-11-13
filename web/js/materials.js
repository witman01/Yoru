import * as THREE from 'three';
import * as T from './textures.js';

let cache = null;

/** Shared materials, made once after the fonts load. */
export function materials() {
  if (cache) return cache;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  cache = {
    darkWood: std({ map: T.wood('#3b2618', '#140b05'), roughness: 0.72 }),
    wood: std({ map: T.wood('#7a5534', '#3a2312'), roughness: 0.6 }),
    paleWood: std({ map: T.wood('#b48a5c', '#6b4a2a'), roughness: 0.55 }),
    lacquer: new THREE.MeshPhysicalMaterial({
      color: 0x0c0a0b,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
    redLacquer: new THREE.MeshPhysicalMaterial({
      color: 0x6e1a12,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
    gold: std({ color: 0xd8ac55, metalness: 1, roughness: 0.28 }),
    iron: std({ color: 0x1b1a1c, metalness: 0.7, roughness: 0.45 }),
    washi: std({ map: T.washi(), roughness: 0.95 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: 0xd9d2c3, roughness: 0.35, clearcoat: 0.6 }),
    celadon: new THREE.MeshPhysicalMaterial({ color: 0x8fa596, roughness: 0.3, clearcoat: 0.7 }),
    vermilion: std({ color: 0xc8402f, roughness: 0.6 }),
    cordRed: std({ color: 0xa3231a, roughness: 0.55 }),
    cordWhite: std({ color: 0xf1ead9, roughness: 0.6 }),
    indigo: std({ color: 0x1d2440, roughness: 0.9 }),
    ash: std({ color: 0x8c8780, roughness: 1 }),
    plaster: std({ map: T.plaster(), roughness: 1 }),
    stone: std({ color: 0x3a3d45, roughness: 0.45, metalness: 0.05 }),
    wetGround: std({ color: 0x040508, roughness: 0.3, metalness: 0.1, envMapIntensity: 0.2 }),
    ember: new THREE.MeshBasicMaterial({ color: 0xff8a3a }),
  };
  return cache;
}
