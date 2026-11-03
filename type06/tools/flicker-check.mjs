// Static z-fighting check: builds the house in node and reports coplanar,
// same-facing, overlapping triangles that come from different boxes/meshes.
import * as THREE from 'three';
import { buildHouse } from '../src/build.js';
import { LEVEL } from '../src/plan.js';
const levels = Object.values(LEVEL);
const mats = new Proxy({}, { get: (t, k) => { if (!(k in t)) t[k] = new THREE.MeshBasicMaterial(); return t[k]; } });
const { root } = buildHouse(mats, {});
const tris = [];
const solids = []; // AABBs of every axis-aligned box chunk (36 verts)
root.updateMatrixWorld(true);
root.traverse(o => {
  if (!o.isMesh || o.geometry.index) return;
  const p = o.geometry.attributes.position;
  for (let s = 0; s + 36 <= p.count; s += 36) {
    const bb = new THREE.Box3();
    const xs = new Set(), ys = new Set(), zs = new Set();
    for (let i = s; i < s + 36; i++) { const q = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); bb.expandByPoint(q); xs.add(q.x.toFixed(4)); ys.add(q.y.toFixed(4)); zs.add(q.z.toFixed(4)); }
    if (xs.size === 2 && ys.size === 2 && zs.size === 2) solids.push({ bb, mesh: o.name, box: s / 36, transparent: /glass|frosted/.test(o.name) });
  }
});
const hidden = (pt, n, A, B) => {
  const q = pt.clone().addScaledVector(n, 0.0015);
  return solids.some(s => !s.transparent && !(s.mesh === A.mesh && s.box === A.box) && !(s.mesh === B.mesh && s.box === B.box) && s.bb.min.x < q.x - 1e-5 && q.x < s.bb.max.x - 1e-5 && s.bb.min.y < q.y - 1e-5 && q.y < s.bb.max.y - 1e-5 && s.bb.min.z < q.z - 1e-5 && q.z < s.bb.max.z - 1e-5);
};
root.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry, p = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : p.count;
  const v = i => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld);
  for (let i = 0; i < n; i += 3) {
    const a = v(i), b = v(i + 1), c = v(i + 2);
    const nn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const area = nn.length() / 2; if (area < 1e-7) continue; nn.normalize();
    // undersides resting on the ground or on a floor slab are never seen
    if (nn.y < -0.9 && (Math.min(a.y, b.y, c.y) < 0.4 || levels.some(l => Math.abs(a.y - l) < 0.012))) continue;
    tris.push({ a, b, c, n: nn, mesh: o.name, tri: Math.floor(i / 3), box: Math.floor(i / 36) });
  }
});
// bucket by quantised plane (normal + offset, 0.5 mm)
const buckets = new Map();
for (const t of tris) {
  const ax = [Math.round(t.n.x * 1000), Math.round(t.n.y * 1000), Math.round(t.n.z * 1000)];
  const d = Math.round(t.n.dot(t.a) / 0.0005);
  const key = ax.join(',') + '|' + d;
  (buckets.get(key) || buckets.set(key, []).get(key)).push(t);
}
function proj(t) { // project onto the dominant plane
  const ax = Math.abs(t.n.x), ay = Math.abs(t.n.y), az = Math.abs(t.n.z);
  const f = ax >= ay && ax >= az ? q => [q.y, q.z] : ay >= az ? q => [q.x, q.z] : q => [q.x, q.y];
  return [t.a, t.b, t.c].map(f);
}
function clip(subject, clipPoly) {
  let out = subject;
  const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const ccw = cross(clipPoly[0], clipPoly[1], clipPoly[2]) > 0 ? 1 : -1;
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const A = clipPoly[i], Bp = clipPoly[(i + 1) % clipPoly.length], inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const P = inp[j], Q = inp[(j + 1) % inp.length];
      const pin = ccw * cross(A, Bp, P) >= -1e-9, qin = ccw * cross(A, Bp, Q) >= -1e-9;
      if (pin) out.push(P);
      if (pin !== qin) { const d1 = cross(A, Bp, P), d2 = cross(A, Bp, Q), t = d1 / (d1 - d2); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
const polyArea = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const hits = new Map();
for (const list of buckets.values()) {
  if (list.length < 2) continue;
  const P = list.map(proj);
  const bb = P.map(pp => [Math.min(...pp.map(q => q[0])), Math.min(...pp.map(q => q[1])), Math.max(...pp.map(q => q[0])), Math.max(...pp.map(q => q[1]))]);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], Bt = list[j];
    if (A.mesh === Bt.mesh && A.box === Bt.box) continue;
    // identical material + world-space UVs render identically: no visible fighting
    if (A.mesh.split('|')[1] === Bt.mesh.split('|')[1]) continue;
    const a = bb[i], b = bb[j];
    if (a[0] >= b[2] - 1e-6 || b[0] >= a[2] - 1e-6 || a[1] >= b[3] - 1e-6 || b[1] >= a[3] - 1e-6) continue;
    const ov = clip(P[i], P[j]); if (ov.length < 3) continue;
    const ar = polyArea(ov); if (ar < 1e-5) continue;
    // centroid of the overlap back in 3D (on the shared plane)
    const cx = ov.reduce((s, q) => s + q[0], 0) / ov.length, cy = ov.reduce((s, q) => s + q[1], 0) / ov.length;
    const ax = Math.abs(A.n.x), ay = Math.abs(A.n.y), az = Math.abs(A.n.z), d = A.n.dot(A.a);
    let pt;
    if (ax >= ay && ax >= az) pt = new THREE.Vector3((d - A.n.y * cx - A.n.z * cy) / A.n.x, cx, cy);
    else if (ay >= az) pt = new THREE.Vector3(cx, (d - A.n.x * cx - A.n.z * cy) / A.n.y, cy);
    else pt = new THREE.Vector3(cx, cy, (d - A.n.x * cx - A.n.y * cy) / A.n.z);
    if (hidden(pt, A.n, A, Bt)) continue;
    const key = [A.mesh, Bt.mesh].sort().join('  <->  ');
    const h = hits.get(key) || { area: 0, at: pt.toArray().map(v => +v.toFixed(2)) };
    h.area += ar; hits.set(key, h);
  }
}
const rows = [...hits.entries()].sort((a, b) => b[1].area - a[1].area);
console.log(`triangles ${tris.length}, coplanar overlap pairs ${rows.length}`);
for (const [k, h] of rows.slice(0, 60)) console.log(h.area.toFixed(4).padStart(9), 'm²', k, 'near', JSON.stringify(h.at));
process.exit(rows.length ? 1 : 0);
