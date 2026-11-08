// Material library. Geometry carries UVs in metres (see geo.js), so every
// texture repeat equals 1 / real-world size of the scanned sample.
import * as THREE from 'three';

// Where the shared CC0 library lives. The published site serves one copy at
// /shared/lib/ for every type (pages.yml adds <meta name="asset-lib">), so a
// visitor who opens several types downloads it once; locally it is assets/lib/.
export const LIB = (typeof document !== 'undefined' && document.querySelector('meta[name="asset-lib"]')?.content) || 'assets/lib/';
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
    floorWood: textured('grey_oak_veneer_02', { color: 0xd9d6d1, roughness: 0.6, normalScale: 0.5, scale: 1.6 }), // grey oak wide planks
    wall: textured('beige_wall_001', { diff: false, color: 0xecebe7, roughness: 1, normalScale: 0.35, scale: 0.6 }),
    ceiling: textured('beige_wall_001', { diff: false, color: 0xf5f3ef, roughness: 1, normalScale: 0.25 }),
    tileGenkan: textured('marble_01', { color: 0xaeafb0, roughness: 0.28, normalScale: 0.25, scale: 1.3 }), // large grey marble-look tile
    tileBath: textured('anti_skid_tiles', { color: 0xe6e4e0, normalScale: 0.6, scale: 0.5 }),
    bathPanel: textured('marble_01', { color: 0xa9a6a2, roughness: 0.35, normalScale: 0.2, scale: 1.4 }), // grey stone panel
    kitchenPanel: textured('long_white_tiles', { color: 0xe9e8e5, roughness: 0.5, normalScale: 0.3, scale: 0.7 }),
    cushionFloor: textured('marble_01', { color: 0xe9e6e1, roughness: 0.55, normalScale: 0.2, scale: 1.4 }),
    marble: textured('marble_01', { roughness: 0.35, normalScale: 0.3 }),
    counterDark: textured('marble_01', { color: 0x2a2b2d, roughness: 0.22, normalScale: 0.15, scale: 0.8 }), // black stone
    oak: textured('oak_veneer_01', { color: 0xead9c6, roughness: 0.75, normalScale: 0.5 }),
    walnut: textured('american_walnut_veneer', { roughness: 0.7, normalScale: 0.5 }),
    door: textured('american_walnut_veneer', { color: 0x8f7764, roughness: 0.55, normalScale: 0.4, rot: Math.PI / 2 }), // dark wood doors
    doorV: textured('american_walnut_veneer', { color: 0x8f7764, roughness: 0.55, normalScale: 0.4 }),
    entryDoor: textured('american_walnut_veneer', { color: 0xc8a888, roughness: 0.6, normalScale: 0.6, rot: Math.PI / 2 }),
    fabric: textured('denim_fabric_05', { diff: false, color: 0xd9d3c9, roughness: 1, normalScale: 0.7, scale: 1.6 }),
    fabricDark: textured('denim_fabric_05', { diff: false, color: 0x8d877d, roughness: 1, normalScale: 0.7, scale: 1.6 }),
    bedding: textured('cotton_jersey', { diff: false, color: 0xf3f1ec, roughness: 1, normalScale: 0.5, scale: 2 }),
    beddingAccent: textured('cotton_jersey', { diff: false, color: 0xb9ab97, roughness: 1, normalScale: 0.5, scale: 2 }),
    leather: textured('leather_white', { diff: false, color: 0xe9e4dc, roughness: 0.55, normalScale: 0.5 }),
    rug: textured('knitted_fleece', { diff: false, color: 0xd8d0c3, roughness: 1, normalScale: 1.0, scale: 2 }),
    extWhite: textured('concrete_wall_008', { diff: false, color: 0xd6d4cf, roughness: 0.95, normalScale: 0.5 }),
    extLight: textured('painted_metal_shutter', { diff: false, color: 0xcac7c1, roughness: 0.7, normalScale: 0.5, scale: 1.2 }), // light grey siding (3F)
    extStone: textured('large_grey_tiles', { color: 0xa3a5a7, normalScale: 1.2, scale: 0.9 }), // dark stone-tile accent
    extSiding: textured('painted_metal_shutter', { diff: false, color: 0x8e8d8a, roughness: 0.7, normalScale: 0.6, scale: 1.2 }), // mid grey siding
    paving: textured('large_floor_tiles_02', { color: 0xdedbd5, normalScale: 0.7, scale: 0.6 }),
    asphalt: textured('asphalt_floor', { color: 0x9a9894, normalScale: 0.8 }),
    // untextured
    white: plain(0xf4f3f0, 0.5),
    whiteGloss: plain(0xf7f7f5, 0.18),
    porcelain: plain(0xfbfbfa, 0.12, 0, { envMapIntensity: 1.2 }),
    greige: plain(0xd9d3ca, 0.6),
    darkGrey: plain(0x3b3d40, 0.45),
    kitchenFront: textured('grey_oak_veneer_02', { color: 0x5a5551, roughness: 0.5, normalScale: 0.3 }), // dark woodgrain fronts
    backsplash: textured('long_white_tiles', { color: 0x3d4043, roughness: 0.18, normalScale: 0.5, scale: 0.45, rot: Math.PI / 2 }), // dark glossy vertical tile
    stoneDark: textured('marble_01', { color: 0x5b5955, roughness: 0.3, normalScale: 0.3, scale: 0.9 }), // dark stone accent wall
    tile3D: textured('long_white_tiles', { color: 0xf1f0ec, roughness: 0.5, normalScale: 1.4, scale: 0.6 }), // white relief tile accent
    woodPanel: textured('american_walnut_veneer', { color: 0xb69a82, roughness: 0.6, normalScale: 0.5, rot: Math.PI / 2 }),
    fenceWood: textured('american_walnut_veneer', { color: 0x7a5c47, roughness: 0.55, normalScale: 0.4 }),
    blind: plain(0x9c9d9e, 0.55, 0.2),
    blackGloss: plain(0x18191a, 0.12, 0.1, { envMapIntensity: 1.2 }),
    globe: new THREE.MeshStandardMaterial({ color: 0xfffaf0, emissive: 0xfff2dc, emissiveIntensity: 1.3, roughness: 0.3 }),
    cove: new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffe9c4, emissiveIntensity: 2.2, roughness: 0.6 }),
    black: plain(0x1d1e20, 0.4),
    frame: plain(0x3e3f41, 0.38, 0.6),
    frameLight: plain(0xc7c6c2, 0.35, 0.7),
    steel: plain(0xc9cbcd, 0.28, 1.0),
    brass: plain(0xb39465, 0.3, 1.0),
    skirting: plain(0x6f665c, 0.5),
    cap: plain(0x30343a, 0.8),
    curtain: Object.assign(textured('cotton_jersey', { diff: false, color: 0xe9e4da, roughness: 1, normalScale: 0.4, scale: 2 }), { side: THREE.DoubleSide }),
    stair: textured('american_walnut_veneer', { color: 0x9a7f69, roughness: 0.6, normalScale: 0.5 }), // dark wood treads
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
    farGround: plain(0x8f8e8a, 0.95),
    hedge: plain(0x5d7350, 0.9),
  };
  return M;
}
