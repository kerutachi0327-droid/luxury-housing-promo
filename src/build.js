// Builds the house (walls, floors, ceilings, openings, stairs, built-ins,
// exterior and surroundings) from the traced plan in plan.js.
import * as THREE from 'three';
import { FLOORS, EXTERIOR, LEVEL, SLAB } from './plan.js';
import { Builder, aabb, block, cylinder, quad, slopedCeiling, place, metricUV } from './geo.js';
import { addFurniture, addBuiltIn } from './furniture.js';

const EPS = 0.002;

// ---- rectangle algebra ([x1,z1,x2,z2]) ---------------------------------
export function subtract(rects, cut) {
  const out = [];
  for (const r of rects) {
    const [a1, b1, a2, b2] = r, [c1, d1, c2, d2] = cut;
    if (c1 >= a2 || c2 <= a1 || d1 >= b2 || d2 <= b1) { out.push(r); continue; }
    if (d1 > b1) out.push([a1, b1, a2, d1]);
    if (d2 < b2) out.push([a1, d2, a2, b2]);
    const y1 = Math.max(b1, d1), y2 = Math.min(b2, d2);
    if (c1 > a1) out.push([a1, y1, c1, y2]);
    if (c2 < a2) out.push([c2, y1, a2, y2]);
  }
  return out.filter(([a, b, c, d]) => c - a > 1e-3 && d - b > 1e-3);
}
const subtractAll = (rects, cuts) => cuts.reduce((acc, c) => subtract(acc, c), rects);
const roomRects = r => subtractAll([r.rect, ...(r.plus || [])], r.minus || []);
export const inside = ([a, b, c, d], x, z, m = 0) => x > a - m && x < c + m && z > b - m && z < d + m;

// ceiling height at x for a floor
export function ceilingAt(floor, x, z) {
  for (const c of floor.ceilings || []) {
    if (!inside(c.rect, x, z, 0.001)) continue;
    if (c.h) return c.h;
    const s = c.slope, t = Math.min(1, Math.max(0, (x - s.x0) / (s.x1 - s.x0)));
    return s.h0 + (s.h1 - s.h0) * t;
  }
  return floor.ceiling;
}

// ---- walls --------------------------------------------------------------
function wallFrame(w) {
  const vertical = Math.abs(w.a[0] - w.b[0]) < 1e-6;
  const s0 = vertical ? Math.min(w.a[1], w.b[1]) : Math.min(w.a[0], w.b[0]);
  const s1 = vertical ? Math.max(w.a[1], w.b[1]) : Math.max(w.a[0], w.b[0]);
  const c = vertical ? w.a[0] : w.a[1];
  return { vertical, s0, s1, c };
}
// box helper along the wall: s range, offset range (perpendicular), y range
function wallBox(B, group, mat, f, s0, s1, o0, o1, y0, y1) {
  if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
  if (f.vertical) B.box(group, mat, f.c + o0, y0, s0, f.c + o1, y1, s1);
  else B.box(group, mat, s0, y0, f.c + o0, s1, y1, f.c + o1);
}
const OUT_SIGN = { N: -1, S: 1, W: -1, E: 1 };

function buildWall(B, floor, w, ctx) {
  const f = wallFrame(w);
  const base = floor.level;
  const top = base + (w.h ?? (floor.id === '1F' ? 2.3 : floor.id === '2F' ? 2.4 : 2.3));
  const isExt = !!w.outside;
  const t = w.t;
  const shell = `${floor.id}:shell`, skin = `${floor.id}:ext`;
  // layers: [o0,o1,y0,y1,material,group,extendEnds]
  const layers = [];
  if (isExt) {
    const sg = OUT_SIGN[w.outside];
    const inner = [-t / 2, t / 2].map(v => v);
    // inner (room) layer
    const ri = sg > 0 ? [-t / 2, 0] : [0, t / 2];
    const ro = sg > 0 ? [0, t / 2] : [-t / 2, 0];
    layers.push({ o: ri, y: [base, top], mat: 'wall', group: shell, ext: t / 2 });
    const nextLevel = floor.id === '3F' ? EXTERIOR.roofTop : LEVEL[floor.id === '1F' ? '2F' : '3F'];
    const skinBottom = floor.id === '1F' ? 0.05 : base;
    // skin up to the ceiling line (kept in the dollhouse cut) + band to the next floor
    layers.push({ o: ro, y: [skinBottom, top], mat: ctx.facade(floor, w), group: skin, ext: t / 2, skin: true });
    layers.push({ o: ro, y: [top, nextLevel], mat: ctx.facade(floor, w), group: `${floor.id}:band`, ext: t / 2, skin: true, band: true });
    void inner;
  } else {
    layers.push({ o: [-t / 2, t / 2], y: [base, top], mat: w.mat || 'wall', group: shell, ext: w.h ? 0 : t / 2 });
  }
  const ops = [...w.openings].sort((a, b) => a.from - b.from);
  for (const L of layers) {
    const s0 = f.s0 - L.ext, s1 = f.s1 + L.ext;
    if (L.band) { wallBox(B, L.group, L.mat, f, s0, s1, L.o[0], L.o[1], L.y[0], L.y[1]); continue; }
    // dark cap on the cut line (reads like a section drawing in dollhouse / plan)
    wallBox(B, `${floor.id}:caps`, 'cap', f, s0, s1, L.o[0], L.o[1], L.y[1], L.y[1] + 0.006);
    let cur = s0;
    for (const o of ops) {
      wallBox(B, L.group, L.mat, f, cur, o.from, L.o[0], L.o[1], L.y[0], L.y[1]);
      // below sill / above head
      if (o.sill > 0) wallBox(B, L.group, L.mat, f, o.from, o.to, L.o[0], L.o[1], L.y[0], base + o.sill);
      if (base + o.head < L.y[1]) wallBox(B, L.group, L.mat, f, o.from, o.to, L.o[0], L.o[1], base + o.head, L.y[1]);
      cur = o.to;
    }
    wallBox(B, L.group, L.mat, f, cur, s1, L.o[0], L.o[1], L.y[0], L.y[1]);
  }
  // skirting on room faces (both sides for interior walls)
  if (!w.h || w.h > 0.5) {
    const faces = isExt ? [OUT_SIGN[w.outside] > 0 ? -1 : 1] : [-1, 1];
    for (const side of faces) {
      const off = side * (t / 2);
      const o = side > 0 ? [off, off + 0.012] : [off - 0.012, off];
      let cur = f.s0 + (isExt ? t / 2 : -t / 2);
      const end = f.s1 - (isExt ? t / 2 : -t / 2);
      for (const op of ops) { if (op.kind !== 'window' || op.sill < 0.05) { wallBox(B, shell, 'white', f, cur, op.from, o[0], o[1], base, base + 0.06); cur = op.to; } }
      wallBox(B, shell, 'white', f, cur, end, o[0], o[1], base, base + 0.06);
    }
  }
  // openings
  for (const o of ops) buildOpening(B, floor, w, f, o);
}

function buildOpening(B, floor, w, f, o) {
  const base = floor.level, t = w.t, g = `${floor.id}:shell`;
  const isExt = !!w.outside;
  const span = o.to - o.from;
  const y0 = base + o.sill, y1 = base + o.head;
  if (o.kind === 'window') {
    // aluminium frame set near the outer face, glass, inner sill
    const sg = isExt ? OUT_SIGN[w.outside] : 1;
    const plane = sg * (t / 2 - 0.05);
    const fo = [plane - 0.035, plane + 0.035];
    const fw = 0.04;
    wallBox(B, g, 'frame', f, o.from, o.from + fw, fo[0], fo[1], y0, y1);
    wallBox(B, g, 'frame', f, o.to - fw, o.to, fo[0], fo[1], y0, y1);
    wallBox(B, g, 'frame', f, o.from, o.to, fo[0], fo[1], y0, y0 + fw);
    wallBox(B, g, 'frame', f, o.from, o.to, fo[0], fo[1], y1 - fw, y1);
    const slider = !o.fix && span > 0.55;
    if (slider) { const m = (o.from + o.to) / 2; wallBox(B, g, 'frame', f, m - 0.025, m + 0.025, fo[0] - 0.01, fo[1] + 0.01, y0, y1); }
    wallBox(B, g, o.frosted ? 'frosted' : 'glass', f, o.from + fw, o.to - fw, plane - 0.004, plane + 0.004, y0 + fw, y1 - fw);
    // reveal lining (white) on the room side and window board
    const inner = -sg * t / 2;
    const lo = sg > 0 ? [inner, plane - 0.035] : [plane + 0.035, inner];
    if (o.sill > 0.05) wallBox(B, g, 'white', f, o.from - 0.01, o.to + 0.01, lo[0] - 0.015 * sg, lo[1] - 0.015 * sg, y0 - 0.02, y0);
    if (o.grille) {
      const go = sg * (t / 2 + 0.05);
      for (let s = o.from + 0.06; s < o.to - 0.03; s += 0.11) wallBox(B, `${floor.id}:ext`, 'frameLight', f, s, s + 0.018, go - 0.01, go + 0.01, y0 - 0.05, y1 + 0.05);
      wallBox(B, `${floor.id}:ext`, 'frameLight', f, o.from, o.to, go - 0.02, go + 0.02, y0 - 0.06, y0 - 0.03);
      wallBox(B, `${floor.id}:ext`, 'frameLight', f, o.from, o.to, go - 0.02, go + 0.02, y1 + 0.03, y1 + 0.06);
    }
    return;
  }
  if (o.kind === 'opening') return;
  // doors: casing + leaf
  const cw = 0.025;
  const caseMat = 'doorV';
  wallBox(B, g, caseMat, f, o.from - cw, o.from, -t / 2 - 0.008, t / 2 + 0.008, base, y1 + cw);
  wallBox(B, g, caseMat, f, o.to, o.to + cw, -t / 2 - 0.008, t / 2 + 0.008, base, y1 + cw);
  wallBox(B, g, caseMat, f, o.from - cw, o.to + cw, -t / 2 - 0.008, t / 2 + 0.008, y1, y1 + cw);
  const leafT = 0.036;
  if (o.kind === 'bifold') {
    const n = 4, pw = span / n;
    for (let i = 0; i < n; i++) wallBox(B, g, 'door', f, o.from + i * pw + 0.004, o.from + (i + 1) * pw - 0.004, -leafT / 2, leafT / 2, base + 0.01, y1 - 0.005);
    return;
  }
  if (o.kind === 'entry') {
    wallBox(B, g, 'entryDoor', f, o.from + 0.004, o.to - 0.004, -0.025, 0.025, base - 0.15, y1);
    // lever handles both sides
    const s = o.to - 0.09;
    for (const side of [-1, 1]) wallBox(B, g, 'steel', f, s, s + 0.02, side * 0.025, side * 0.075, base + 0.95, base + 1.25);
    return;
  }
  // interior swing door shown open (≈80°) so rooms read as connected
  const leafW = span - 0.008, leafH = y1 - base - 0.01;
  const mat = o.kind === 'glassDoor' ? 'frosted' : 'door';
  const leaf = block(leafW, leafH, leafT, { base: true });
  const handle = block(0.12, 0.02, 0.02, { base: true }); handle.translate(leafW / 2 - 0.08, 0.98, leafT / 2 + 0.03);
  const handle2 = handle.clone(); handle2.translate(0, 0, -leafT - 0.06);
  // hinge at o.from, swing towards +offset side
  const ang = 1.35;
  const hinge = f.vertical ? new THREE.Vector3(f.c + t / 2, base, o.from) : new THREE.Vector3(o.from, base, f.c + t / 2);
  const m = new THREE.Matrix4();
  // leaf in local space spans x: 0..leafW
  const toLocal = new THREE.Matrix4().makeTranslation(leafW / 2, 0, 0);
  const rot = new THREE.Matrix4().makeRotationY(f.vertical ? -Math.PI / 2 - ang : -ang);
  m.makeTranslation(hinge.x, hinge.y, hinge.z).multiply(rot).multiply(toLocal);
  for (const [geo, mt] of [[leaf, mat], [handle, 'steel'], [handle2, 'steel']]) { geo.applyMatrix4(m); B.add(`${floor.id}:furn`, mt, geo); }
}

// ---- floors, ceilings ----------------------------------------------------
function buildFloorSurfaces(B, floor, above, mats) {
  const L = floor.level;
  const special = floor.rooms.filter(r => r.floor || r.drop);
  let base = floor.footprint.slice();
  for (const v of floor.voids) base = subtract(base, v);
  for (const r of special) for (const rr of roomRects(r)) base = subtract(base, rr);
  for (const r of base) B.add(`${floor.id}:shell`, 'floorWood', quad(r[0], r[1], r[2], r[3], L));
  for (const r of special) {
    const y = L - (r.drop || 0);
    for (const rr of roomRects(r)) {
      B.add(`${floor.id}:shell`, r.floor || 'floorWood', quad(rr[0], rr[1], rr[2], rr[3], y));
      if (r.drop) { // riser of the step (上がり框) handled by built-in 'step'
        B.box(`${floor.id}:shell`, 'wall', rr[0], y - 0.05, rr[1], rr[2], y, rr[3]);
      }
    }
  }
  // ceilings (omit where the floor above has a stair void)
  const ceilRects = floor.ceilings || floor.footprint.map(rect => ({ rect, h: floor.ceiling }));
  const holes = (above?.voids || []);
  for (const c of ceilRects) {
    let parts = [c.rect];
    for (const h of holes) parts = subtract(parts, h);
    // rooms with their own (flat) ceiling height on 1F
    if (!floor.ceilings) for (const r of floor.rooms) if (r.ceiling && r.ceiling !== floor.ceiling) for (const rr of roomRects(r)) parts = subtract(parts, rr);
    for (const p of parts) {
      if (c.slope) B.add(`${floor.id}:ceiling`, 'ceiling', slopedCeiling(c.slope.x0, c.slope.x1, p[1], p[3], L + c.slope.h0, L + c.slope.h1));
      else B.add(`${floor.id}:ceiling`, 'ceiling', quad(p[0], p[1], p[2], p[3], L + c.h, false));
    }
  }
  if (!floor.ceilings) for (const r of floor.rooms) if (r.ceiling && r.ceiling !== floor.ceiling) for (const rr of roomRects(r)) {
    let parts = [rr]; for (const h of holes) parts = subtract(parts, h);
    for (const p of parts) B.add(`${floor.id}:ceiling`, 'ceiling', quad(p[0], p[1], p[2], p[3], L + r.ceiling, false));
  }
  // slab body between this ceiling and the next floor (visible in dollhouse cut)
  const nextL = above ? above.level : null;
  if (nextL) {
    for (const r of above.footprint) {
      let parts = [r]; for (const h of above.voids) parts = subtract(parts, h);
      for (const p of parts) B.box(`${above.id}:slab`, 'white', p[0], nextL - 0.04, p[1], p[2], nextL - EPS * 2, p[3]);
    }
  }
}

// downlights + point lights
function buildLights(B, floor, lightRig) {
  for (const [x, z] of floor.lights) {
    const h = ceilingAt(floor, x, z);
    const y = floor.level + h - 0.004;
    const g = cylinder(0.05, 0.05, 0.006, 20); g.translate(x, y - 0.002, z);
    B.add(`${floor.id}:ceiling`, 'downlight', g);
    const ring = cylinder(0.062, 0.062, 0.004, 24); ring.translate(x, y, z);
    B.add(`${floor.id}:ceiling`, 'frameLight', ring);
    lightRig.push({ floor: floor.id, pos: new THREE.Vector3(x, y - 0.08, z) });
  }
}

// ---- stairs ---------------------------------------------------------------
function buildStairs(B, floor, s) {
  const [x1, z1, x2, z2] = s.rect;
  const n = s.steps, rise = (s.to - s.from) / n, run = (z2 - z1) / n;
  const L = floor.level + s.from;
  const g = `${floor.id}:shell`;
  for (let i = 0; i < n; i++) {
    // north: first step at the south end (z2), rising towards z1
    const za = z2 - (i + 1) * run, zb = z2 - i * run;
    const top = L + (i + 1) * rise;
    if (s.clipBelow !== undefined && zb < s.clipBelow + 0.02 && top - floor.level > (s.clipHeight || 99) - 0.3) continue;
    if (s.clipBelow !== undefined && za < s.clipBelow) continue;
    B.box(g, 'stair', x1 + 0.02, top - 0.035, za - 0.02, x2 - 0.02, top, zb);
    B.box(g, 'white', x1 + 0.02, top - rise, zb - 0.02, x2 - 0.02, top - 0.035, zb);
  }
  // stringer (white) along the open side and handrail on the wall side
  const len = Math.hypot(z2 - z1, s.to - s.from);
  const ang = Math.atan2(s.to - s.from, z2 - z1);
  for (const [x, mat, hgt, th] of [[x2 - 0.015, 'white', 0.25, 0.03], [x1 + 0.06, 'walnut', 0.04, 0.04]]) {
    const geo = block(th, hgt, len, { base: false });
    geo.rotateX(ang);
    const yOff = mat === 'walnut' ? 0.85 : -0.05;
    geo.translate(x, L + (s.to - s.from) / 2 + yOff, (z1 + z2) / 2);
    B.add(g, mat, geo);
  }
}

// ---- exterior -------------------------------------------------------------
function facadeMaterial(floor, w) {
  if (w.outside !== 'N') return 'extWhite';
  if (floor.id === '2F') return 'extSiding';
  return 'extWhite';
}

function buildExterior(B, mats) {
  const W = EXTERIOR.width, g = 'ext:main';
  const L1 = LEVEL['1F'], L2 = LEVEL['2F'], L3 = LEVEL['3F'];
  const [gx1, gz1, gx2, gz2] = EXTERIOR.garage;
  const f2 = EXTERIOR.front2F, f3 = EXTERIOR.front3F, w3 = EXTERIOR.width3F;
  // ground: road, site paving, neighbours' strips
  const site = EXTERIOR.site;
  B.add('site', 'asphalt', quad(-14, site.north - 9, W + 14, site.north, 0));
  B.box('site', 'paving', -14, 0, site.north - 0.25, W + 14, 0.12, site.north);
  B.add('site', 'paving', quad(site.west, site.north, site.east, f2 + 0.0, 0.05));
  B.box('site', 'paving', site.west, 0, site.north, site.east, 0.05, site.south);
  B.add('site', 'ground', quad(site.west, f2, 0, site.south, 0.055));
  B.add('site', 'ground', quad(W, f2, site.east, site.south, 0.055));
  // garage piers (stone) and the 2F overhang soffit
  const pier = 0.32;
  B.box(g, 'extStone', 0, 0.05, gz1, pier, L2 - SLAB, gz1 + 0.9);
  B.box(g, 'extStone', W - pier, 0.05, gz1, W, L2 - SLAB, gz1 + 0.9);
  B.box(g, 'extWhite', 0, 0.05, gz1 + 0.9, 0.12, L2 - SLAB, -7.64);
  B.box(g, 'extWhite', W - 0.16, 0.05, gz1 + 0.9, W, L2 - SLAB, -7.64);
  B.box(g, 'white', 0, L2 - SLAB, f2, W, L2 - SLAB + 0.02, -7.6); // soffit
  B.box(g, 'frame', 0.25, L2 - SLAB - 0.32, f2 + 0.02, W - 0.25, L2 - SLAB, f2 + 0.12); // shutter box
  for (const x of [1.4, 2.8]) { const d = cylinder(0.06, 0.06, 0.01); d.translate(x, L2 - SLAB - 0.012, -9); B.add(g, 'downlight', d); }
  // 2F overhang slab edge + band
  B.box(g, 'extWhite', 0, L2 - SLAB, f2, W, L2, f2 + 0.16);
  // porch: two steps up to the entrance
  const [px1, pz1, px2, pz2] = EXTERIOR.porch;
  B.box(g, 'tileGenkan', px1, 0.05, pz1 + 0.22, px2, L1 - 0.17, pz2);
  B.box(g, 'tileGenkan', px1, 0.05, pz1, px2, 0.2, pz1 + 0.22);
  B.box(g, 'tileGenkan', px1, 0.05, pz1 + 0.22, px2, L1, pz2);
  // 2F front: stone side panels over the siding
  B.box('2F:ext', 'extStone', 0, L2 - SLAB + 0.05, f2 - 0.03, 0.72, L3 - 0.05, f2 + 0.02);
  B.box('2F:ext', 'extStone', W - 0.72, L2 - SLAB + 0.05, f2 - 0.03, W, L3 - 0.05, f2 + 0.02);
  // 3F front balcony parapet (stone band) + glass railing
  B.box('3F:ext', 'extStone', 0, L3 - 0.05, f2 - 0.02, W, L3 + 0.45, f2 + 0.14);
  for (const [x1, x2] of [[0, 0.14], [w3 - 0.0, W]]) B.box('3F:ext', 'extWhite', x1, L3 - 0.05, f2, x2, L3 + 0.45, f3);
  // roofs: 3F flat roof with eave, 2F east strip shed roof
  B.box('roof', 'extWhite', -0.05, EXTERIOR.roofTop, f2 - 0.05, w3 + 0.25, EXTERIOR.roofTop + 0.14, 0.15);
  B.box('roof', 'frame', -0.06, EXTERIOR.roofTop + 0.14, f2 - 0.06, w3 + 0.26, EXTERIOR.roofTop + 0.2, 0.16);
  for (const x of [0.12, w3 - 0.12]) B.add('roof', 'frame', place(cylinder(0.025, 0.025, EXTERIOR.roofTop - (L3 + 0.45)), x, L3 + 0.45, f2 + 0.08));
  const shed = new THREE.BufferGeometry();
  const y0 = L3 - 0.02, y1 = L3 - 0.32;
  shed.setAttribute('position', new THREE.Float32BufferAttribute([w3, y0, f3, W + 0.15, y1, f3, W + 0.15, y1, 0.15, w3, y0, 0.15], 3));
  shed.setIndex([0, 2, 1, 0, 3, 2]); shed.computeVertexNormals(); metricUV(shed);
  B.add('roof', 'darkGrey', shed);
  B.box('roof', 'darkGrey', w3, L3 - 0.05, f2, W, L3 + 0.0, f3);
  // gate posts, mailbox, fence planting
  B.box('site', 'darkGrey', site.west + 0.05, 0.05, site.north + 0.15, site.west + 0.35, 1.35, site.north + 0.45);
  B.box('site', 'steel', site.west + 0.08, 0.95, site.north + 0.14, site.west + 0.32, 1.1, site.north + 0.16);
  B.box('site', 'extStone', site.west + 0.4, 0.05, site.north + 0.1, site.west + 0.6, 1.9, site.north + 0.5);
  B.box('site', 'walnut', site.west + 0.62, 0.05, site.north + 0.25, site.west + 0.66, 1.8, site.north + 0.9);
  B.box('site', 'hedge', site.east - 0.45, 0.05, site.north + 0.1, site.east - 0.1, 0.9, site.north + 1.4);
  // neighbours: plain three-storey blocks with windows
  for (const [x1, x2] of [[-8.5, site.west - 0.35], [site.east + 0.35, site.east + 8.5]]) {
    B.box('site', 'neighbour', x1, 0, -12.6, x2, 9.4, 3);
    const face = x1 < 0 ? x2 : x1, s = x1 < 0 ? 1 : -1;
    void face; void s;
    for (const y of [1.2, 4.2, 7.2]) for (const z of [-11.2, -6.5, -2]) {
      const wx = x1 < 0 ? x2 : x1;
      B.box('site', 'neighbourWin', wx - 0.02, y, z, wx + 0.02, y + 1.2, z + 1.4);
    }
    for (const y of [1.2, 4.2, 7.2]) B.box('site', 'neighbourWin', x1 + 1, y, -12.62, x2 - 1, y + 1.3, -12.58);
  }
}

// ---- collision map --------------------------------------------------------
function collision(floor) {
  const blocked = [];
  for (const w of floor.walls) {
    const f = wallFrame(w);
    const t = w.t / 2 + 0.03;
    let cur = f.s0 - t;
    const ops = [...w.openings].filter(o => (o.kind !== 'window' || o.sill < 0.05) && o.kind !== 'bifold' && !(o.sill > 0.3)).sort((a, b) => a.from - b.from);
    const push = (s0, s1) => { if (s1 > s0) blocked.push(f.vertical ? [f.c - t, s0, f.c + t, s1] : [s0, f.c - t, s1, f.c + t]); };
    for (const o of ops) { push(cur, o.from); cur = o.to; }
    push(cur, f.s1 + t);
  }
  for (const v of floor.voids) blocked.push(v);
  for (const s of floor.stairs) blocked.push(s.rect);
  return blocked;
}

export function buildHouse(mats, models) {
  const B = new Builder(mats);
  const lightRig = [];
  const ctx = { facade: facadeMaterial };
  const nav = {};
  FLOORS.forEach((floor, i) => {
    const above = FLOORS[i + 1];
    buildFloorSurfaces(B, floor, above, mats);
    for (const w of floor.walls) buildWall(B, floor, w, ctx);
    for (const s of floor.stairs) buildStairs(B, floor, s);
    buildLights(B, floor, lightRig);
    const blocked = collision(floor);
    for (const b of floor.built || []) addBuiltIn(B, floor, b, blocked, models);
    for (const it of floor.furniture || []) addFurniture(B, floor, it, blocked, models);
    for (const bal of floor.balconies || []) {
      const [x1, z1, x2, z2] = bal.rect, L = floor.level;
      B.box(`${floor.id}:ext`, 'oak', x1, L - 0.06, z1, x2, L - 0.02, z2);
      const railZ = bal.rail === 'N' ? Math.max(z1, EXTERIOR.front2F + 0.03) : z2;
      if (bal.glass) {
        B.box(`${floor.id}:ext`, 'glass', x1 + 0.05, L + 0.45, railZ + 0.02, x2 - 0.05, L + 1.1, railZ + 0.04);
        B.box(`${floor.id}:ext`, 'frame', x1 + 0.04, L + 1.08, railZ + 0.0, x2 - 0.04, L + 1.12, railZ + 0.06);
        for (const x of [x1 + 0.06, (x1 + x2) / 2, x2 - 0.08]) B.box(`${floor.id}:ext`, 'frame', x, L + 0.45, railZ + 0.0, x + 0.03, L + 1.1, railZ + 0.06);
      } else {
        B.box(`${floor.id}:ext`, 'extWhite', x1, L - 0.06, z2 - 0.12, x2, L + 1.1, z2);
        B.box(`${floor.id}:ext`, 'frame', x1, L + 1.1, z2 - 0.13, x2, L + 1.14, z2 + 0.01);
        if (bal.dryingPole) for (const x of [x1 + 0.3, x2 - 0.3]) B.box(`${floor.id}:ext`, 'frameLight', x, L + 1.1, z2 - 0.1, x + 0.03, L + 1.6, z2 - 0.07);
      }
      for (const x of [x1, x2 - 0.14]) B.box(`${floor.id}:ext`, 'extWhite', x, L - 0.06, Math.min(z1, z2), x + 0.14, L + 1.1, Math.max(z1, z2));
    }
    nav[floor.id] = { blocked, footprint: [...floor.footprint, ...(floor.balconies || []).map(b => b.rect)] };
  });
  buildExterior(B, mats);
  const root = B.build();
  return { root, lightRig, nav };
}
