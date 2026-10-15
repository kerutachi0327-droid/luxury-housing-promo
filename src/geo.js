// Geometry helpers. All UVs are expressed in metres so textures keep their
// real-world scale on every surface.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Re-project UVs from local positions using the dominant normal axis.
export function metricUV(g, offset = [0, 0, 0]) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset[0], y = p.getY(i) + offset[1], z = p.getZ(i) + offset[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = -z; }
    else if (ax >= az) { uv[i * 2] = z * Math.sign(n.getX(i) || 1); uv[i * 2 + 1] = y; }
    else { uv[i * 2] = -x * Math.sign(n.getZ(i) || 1); uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Axis-aligned box between two corners, UVs in world metres.
export function aabb(x1, y1, z1, x2, y2, z2) {
  const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), d = Math.abs(z2 - z1);
  if (w < 1e-4 || h < 1e-4 || d < 1e-4) return null;
  const g = new THREE.BoxGeometry(w, h, d);
  const c = [(x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2];
  metricUV(g, c);
  g.translate(...c);
  return g;
}

// Box/rounded box in local space (centre at origin, base at y=0 when base=true).
export function block(w, h, d, { radius = 0, base = true, segments = 3 } = {}) {
  const r = Math.min(radius, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const g = r > 0.002 ? new RoundedBoxGeometry(w, h, d, segments, r) : new THREE.BoxGeometry(w, h, d);
  if (g.index) { /* keep */ }
  metricUV(g);
  if (base) g.translate(0, h / 2, 0);
  return g;
}

export function cylinder(rTop, rBottom, h, seg = 24) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
  metricUV(g);
  g.translate(0, h / 2, 0);
  return g;
}

// Horizontal quad (floor / ceiling) with world UVs. up=true faces +y.
export function quad(x1, z1, x2, z2, y, up = true) {
  const g = new THREE.PlaneGeometry(Math.abs(x2 - x1), Math.abs(z2 - z1));
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  const c = [(x1 + x2) / 2, y, (z1 + z2) / 2];
  metricUV(g, c);
  g.translate(...c);
  return g;
}

// Sloped ceiling quad spanning x0..x1 with heights h0..h1 (absolute y).
export function slopedCeiling(x0, x1, z1, z2, y0, y1) {
  const g = new THREE.BufferGeometry();
  const pos = [x0, y0, z1, x1, y1, z1, x1, y1, z2, x0, y0, z2];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]); // faces down (seen from the room)
  g.computeVertexNormals();
  const uv = [x0, z1, x1, z1, x1, z2, x0, z2];
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

export function place(g, x, y, z, rotY = 0) {
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

// Collects geometry per (group, material) and merges it into few meshes.
export class Builder {
  constructor(mats) { this.mats = mats; this.bins = new Map(); this.extra = []; }
  add(group, mat, g) {
    if (!g) return;
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) metricUV(g);
    const key = group + '|' + mat;
    if (!this.bins.has(key)) this.bins.set(key, []);
    this.bins.get(key).push(g);
  }
  box(group, mat, x1, y1, z1, x2, y2, z2) { this.add(group, mat, aabb(x1, y1, z1, x2, y2, z2)); }
  object(group, obj) { obj.userData.group = group; this.extra.push(obj); }
  build() {
    const root = new THREE.Group();
    for (const [key, list] of this.bins) {
      const [group, mat] = key.split('|');
      const merged = mergeGeometries(list, false);
      if (!merged) { console.warn('merge failed', key); continue; }
      const material = this.mats[mat];
      if (!material) { console.warn('missing material', mat); continue; }
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = key;
      mesh.userData.group = group;
      mesh.userData.mat = mat;
      const transparent = material.transparent;
      mesh.castShadow = !transparent && !/ceiling|light/.test(group);
      mesh.receiveShadow = !transparent;
      root.add(mesh);
    }
    for (const o of this.extra) root.add(o);
    return root;
  }
}
