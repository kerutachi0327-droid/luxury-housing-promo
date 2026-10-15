// Material library. Geometry carries UVs in metres (see geo.js), so every
// texture repeat equals 1 / real-world size of the scanned sample.
import * as THREE from 'three';

const LIB = 'assets/lib/';
let manifest = null;
const loader = new THREE.TextureLoader();
const cache = new Map();
let anisotropy = 4;
let onProgress = () => {};
let pending = 0, done = 0;

export async function loadManifest() {
  try {
    const r = await fetch(LIB + 'manifest.json', { cache: 'no-cache' });
    if (r.ok) manifest = await r.json();
  } catch { manifest = null; }
  return manifest;
}
export const getManifest = () => manifest;
export function setAnisotropy(a) { anisotropy = a; }
export function trackProgress(fn) { onProgress = fn; }

function tex(id, map, srgb) {
  const entry = manifest?.textures?.[id];
  const file = entry?.maps?.[map]?.file;
  if (!file) return null;
  const key = file;
  if (cache.has(key)) return cache.get(key);
  pending++; onProgress(done, pending);
  const t = loader.load(LIB + file, () => { done++; onProgress(done, pending); }, undefined, () => { done++; onProgress(done, pending); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const size = entry.size || [2, 2];
  t.repeat.set(1 / size[0], 1 / size[1]);
  cache.set(key, t);
  return t;
}

function textured(id, { color = 0xffffff, diff = true, normalScale = 1, roughness = 1, metalness = 0, envMapIntensity = 1, rot = 0, scale = 1, ...rest } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity, ...rest });
  const d = diff ? tex(id, 'diff', true) : null;
  const n = tex(id, 'nor', false);
  const a = tex(id, 'arm', false);
  const adjust = t => { if (!t) return t; if (rot || scale !== 1) { t = t.clone(); t.rotation = rot; t.repeat.multiplyScalar(1 / scale); t.needsUpdate = true; } return t; };
  if (d) m.map = adjust(d);
  if (n) { m.normalMap = adjust(n); m.normalScale.set(normalScale, normalScale); }
  if (a) { const aa = adjust(a); m.roughnessMap = aa; m.aoMap = aa; m.aoMapIntensity = 0.6; }
  m.name = id;
  return m;
}

const plain = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

let M = null;
export function materials() {
  if (M) return M;
  M = {
    floorWood: textured('laminate_floor_02', { color: 0xf2ece4, roughness: 0.9, normalScale: 0.8 }),
    wall: textured('beige_wall_001', { diff: false, color: 0xeeebe5, roughness: 1, normalScale: 0.35, scale: 0.6 }),
    ceiling: textured('beige_wall_001', { diff: false, color: 0xf5f3ef, roughness: 1, normalScale: 0.25 }),
    tileGenkan: textured('large_grey_tiles', { color: 0xd8d6d2, normalScale: 0.8, scale: 0.6 }),
    tileBath: textured('anti_skid_tiles', { color: 0xe6e4e0, normalScale: 0.6, scale: 0.5 }),
    bathPanel: textured('long_white_tiles', { color: 0xf2f1ee, roughness: 0.6, normalScale: 0.4 }),
    kitchenPanel: textured('long_white_tiles', { color: 0xe9e8e5, roughness: 0.5, normalScale: 0.3, scale: 0.7 }),
    cushionFloor: textured('marble_01', { color: 0xe9e6e1, roughness: 0.55, normalScale: 0.2, scale: 1.4 }),
    marble: textured('marble_01', { roughness: 0.35, normalScale: 0.3 }),
    counterDark: textured('painted_concrete_02', { diff: false, color: 0x2d2e30, roughness: 0.6, normalScale: 0.25 }),
    oak: textured('oak_veneer_01', { color: 0xf3ece2, roughness: 0.75, normalScale: 0.5 }),
    walnut: textured('american_walnut_veneer', { roughness: 0.7, normalScale: 0.5 }),
    door: textured('grey_oak_veneer_02', { color: 0xf6f1ea, roughness: 0.65, normalScale: 0.35, rot: Math.PI / 2 }),
    doorV: textured('grey_oak_veneer_02', { color: 0xf6f1ea, roughness: 0.65, normalScale: 0.35 }),
    entryDoor: textured('american_walnut_veneer', { color: 0xc8a888, roughness: 0.6, normalScale: 0.6, rot: Math.PI / 2 }),
    fabric: textured('denim_fabric_05', { diff: false, color: 0xd9d3c9, roughness: 1, normalScale: 0.7, scale: 1.6 }),
    fabricDark: textured('denim_fabric_05', { diff: false, color: 0x8d877d, roughness: 1, normalScale: 0.7, scale: 1.6 }),
    bedding: textured('cotton_jersey', { diff: false, color: 0xf3f1ec, roughness: 1, normalScale: 0.5, scale: 2 }),
    beddingAccent: textured('cotton_jersey', { diff: false, color: 0xb9ab97, roughness: 1, normalScale: 0.5, scale: 2 }),
    leather: textured('leather_white', { diff: false, color: 0xe9e4dc, roughness: 0.55, normalScale: 0.5 }),
    rug: textured('knitted_fleece', { diff: false, color: 0xd8d0c3, roughness: 1, normalScale: 1.0, scale: 2 }),
    extWhite: textured('concrete_wall_008', { diff: false, color: 0xeae8e3, roughness: 0.95, normalScale: 0.5 }),
    extStone: textured('large_grey_tiles', { color: 0xf0eeea, normalScale: 1.0, scale: 0.55 }),
    extSiding: textured('painted_metal_shutter', { diff: false, color: 0xf0eee9, roughness: 0.7, normalScale: 0.6, scale: 1.2 }),
    paving: textured('large_floor_tiles_02', { color: 0xdedbd5, normalScale: 0.7, scale: 0.6 }),
    asphalt: textured('asphalt_floor', { color: 0x9a9894, normalScale: 0.8 }),
    // untextured
    white: plain(0xf4f3f0, 0.5),
    whiteGloss: plain(0xf7f7f5, 0.18),
    porcelain: plain(0xfbfbfa, 0.12, 0, { envMapIntensity: 1.2 }),
    greige: plain(0xd9d3ca, 0.6),
    darkGrey: plain(0x3b3d40, 0.45),
    kitchenFront: plain(0x55585b, 0.38, 0.05),
    black: plain(0x1d1e20, 0.4),
    frame: plain(0x3e3f41, 0.38, 0.6),
    frameLight: plain(0xc7c6c2, 0.35, 0.7),
    steel: plain(0xc9cbcd, 0.28, 1.0),
    brass: plain(0xb39465, 0.3, 1.0),
    skirting: plain(0x6f665c, 0.5),
    cap: plain(0x30343a, 0.8),
    curtain: Object.assign(textured('cotton_jersey', { diff: false, color: 0xe9e4da, roughness: 1, normalScale: 0.4, scale: 2 }), { side: THREE.DoubleSide }),
    stair: textured('laminate_floor_02', { color: 0xe9e1d6, roughness: 0.85, normalScale: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfe8ec, roughness: 0.04, metalness: 0, transmission: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.4, depthWrite: false }),
    frosted: new THREE.MeshPhysicalMaterial({ color: 0xf2f4f4, roughness: 0.4, transparent: true, opacity: 0.85 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.02, metalness: 1.0, envMapIntensity: 1.6 }),
    tv: plain(0x0e0f10, 0.15, 0.2),
    lampShade: new THREE.MeshStandardMaterial({ color: 0xfff8ec, emissive: 0xfff1d6, emissiveIntensity: 1.6, roughness: 0.6 }),
    downlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 3.0 }),
    plantPot: plain(0xe8e4dd, 0.8),
    neighbour: textured('concrete_wall_008', { diff: false, color: 0xe2dfd9, roughness: 0.95, normalScale: 0.4 }),
    neighbourWin: plain(0x8e9ba2, 0.08, 0.4, { envMapIntensity: 1.3 }),
    ground: textured('large_floor_tiles_02', { color: 0xc9c5be, normalScale: 0.5 }),
    hedge: plain(0x5d7350, 0.9),
  };
  return M;
}
