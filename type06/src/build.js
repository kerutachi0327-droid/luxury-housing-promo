// Builds the house (walls, floors, ceilings, openings, stairs, built-ins,
// exterior and surroundings) from the traced plan in plan.js.
import * as THREE from 'three';
import { FLOORS, EXTERIOR, LEVEL, SLAB } from './plan.js';
import { Builder, aabb, block, cylinder, quad, slopedCeiling, slopedCeilingZ, place, metricUV } from '../../src/geo.js';
import { addFurniture, addBuiltIn, placeModel } from './furniture.js';

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
    if (c.slopeZ) { const s = c.slopeZ, t = Math.min(1, Math.max(0, (z - s.z0) / (s.z1 - s.z0))); return s.h0 + (s.h1 - s.h0) * t; }
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
    // the room layer stops 4 mm inside the corner so its end face never lies in
    // the plane of the perpendicular wall's outer skin (coplanar → flicker)
    layers.push({ o: ri, y: [base, top], mat: 'wall', group: shell, ext: t / 2 - 0.004 });
    const nextLevel = floor.id === '3F' ? EXTERIOR.roofTop : LEVEL[floor.id === '1F' ? '2F' : '3F'];
    const skinBottom = floor.id === '1F' ? 0.05 : base;
    // skin up to the ceiling line (kept in the dollhouse cut) + band to the next floor
    // skins stop 2 mm short of the corner so their end faces never sit in the
    // plane of the neighbouring wall's outer face (coplanar faces flicker)
    layers.push({ o: ro, y: [skinBottom, top], mat: ctx.facade(floor, w), group: skin, ext: t / 2 - 0.002, skin: true });
    layers.push({ o: ro, y: [top, nextLevel - 0.002], mat: ctx.facade(floor, w), group: `${floor.id}:band`, ext: t / 2 - 0.002, skin: true, band: true });
    void inner;
  } else {
    // interior walls end 2 mm inside the wall they meet (no shared end faces)
    layers.push({ o: [-t / 2, t / 2], y: [base, top], mat: w.mat || 'wall', group: shell, ext: w.h ? 0 : t / 2 - 0.002 });
  }
  const ops = [...w.openings].sort((a, b) => a.from - b.from);
  for (const L of layers) {
    const s0 = f.s0 - L.ext, s1 = f.s1 + L.ext;
    if (L.band) { wallBox(B, L.group, L.mat, f, s0, s1, L.o[0], L.o[1], L.y[0], L.y[1]); continue; }
    // dark cap on the cut line (reads like a section drawing in dollhouse / plan)
    // (1 mm wider than the wall so its sides are not coplanar with the wall faces)
    // caps of crossing walls get different heights (x-walls 0.4 mm higher) so
    // their tops never share a plane; the cap floats 0.8 mm above the wall top
    // so its underside is not coplanar with the ceiling
    const capTop = L.y[1] + (f.vertical ? 0.006 : 0.0064);
    wallBox(B, `${floor.id}:caps`, 'cap', f, s0 - 0.001, s1 + 0.001, L.o[0] - 0.001, L.o[1] + 0.001, L.y[1] + 0.0008, capTop);
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
    // window board sits 3 mm above the wall below the sill (no shared top plane)
    if (o.sill > 0.05) wallBox(B, g, 'white', f, o.from - 0.01, o.to + 0.01, lo[0] - 0.015 * sg, lo[1] - 0.015 * sg, y0 - 0.02, y0 + 0.003);
    if (isExt && span >= 0.6 && !o.frosted && !o.fix) addCurtains(B, floor, f, o, sg, t);
    if (o.grille) {
      const go = sg * (t / 2 + 0.05);
      for (let s = o.from + 0.06; s < o.to - 0.03; s += 0.11) wallBox(B, `${floor.id}:ext`, 'frameLight', f, s, s + 0.018, go - 0.01, go + 0.01, y0 - 0.05, y1 + 0.05);
      wallBox(B, `${floor.id}:ext`, 'frameLight', f, o.from, o.to, go - 0.02, go + 0.02, y0 - 0.06, y0 - 0.03);
      wallBox(B, `${floor.id}:ext`, 'frameLight', f, o.from, o.to, go - 0.02, go + 0.02, y1 + 0.03, y1 + 0.06);
    }
    return;
  }
  if (o.kind === 'opening') return;
  // doors: casing + leaf + light switch beside the frame
  const cw = 0.025;
  if (o.kind !== 'entry' && o.kind !== 'bifold') for (const side of [-1, 1]) wallBox(B, `${floor.id}:furn`, 'whiteGloss', f, o.to + 0.08, o.to + 0.15, side * (t / 2) - (side < 0 ? 0.008 : 0), side * (t / 2) + (side > 0 ? 0.008 : 0), base + 1.15, base + 1.27);
  const caseMat = 'doorV';
  // The jamb faces stand JAMB proud of the opening (and the posts stop under
  // the head) so no casing face is coplanar with the wall ends, the soffit or
  // the skirting ends: coplanar faces z-fight and flicker while walking.
  const JAMB = 0.003;
  wallBox(B, g, caseMat, f, o.from - cw, o.from + JAMB, -t / 2 - 0.008, t / 2 + 0.008, base, y1 - JAMB);
  wallBox(B, g, caseMat, f, o.to - JAMB, o.to + cw, -t / 2 - 0.008, t / 2 + 0.008, base, y1 - JAMB);
  wallBox(B, g, caseMat, f, o.from - cw, o.to + cw, -t / 2 - 0.008, t / 2 + 0.008, y1 - JAMB, y1 + cw);
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
  // swing door: open (≈80°) into the room given by o.swing, or closed (o.open === 0)
  const leafW = span - 0.008, leafH = y1 - base - 0.01;
  const mat = o.kind === 'glassDoor' ? 'frosted' : 'door';
  const swing = o.swing ?? 1, ang = o.open === 0 ? 0 : 1.35;
  const leaf = block(leafW, leafH, leafT, { base: true });
  const handle = block(0.12, 0.02, 0.02, { base: true }); handle.translate(leafW / 2 - 0.08, 0.98, leafT / 2 + 0.03);
  const handle2 = block(0.12, 0.02, 0.02, { base: true }); handle2.translate(leafW / 2 - 0.08, 0.98, -leafT / 2 - 0.03);
  // wall-local (s along wall, o across) -> world
  const hingeO = ang ? swing * (t / 2) : 0;
  const atTo = o.hinge === 'to';
  const ds = (atTo ? -1 : 1) * Math.cos(ang), dO = swing * Math.sin(ang);
  const toWorld = (sv, ov) => (f.vertical ? [f.c + ov, sv] : [sv, f.c + ov]);
  const [hx, hz] = toWorld(atTo ? o.to - 0.004 : o.from + 0.004, hingeO);
  const [dx, dz] = f.vertical ? [dO, ds] : [ds, dO];
  const theta = Math.atan2(-dz, dx);
  const m = new THREE.Matrix4().makeTranslation(hx + dx * leafW / 2, base + 0.005, hz + dz * leafW / 2).multiply(new THREE.Matrix4().makeRotationY(theta));
  for (const [geo, mt] of [[leaf, mat], [handle, 'steel'], [handle2, 'steel']]) { geo.applyMatrix4(m); B.add(`${floor.id}:furn`, mt, geo); }
}

// gathered drapes on both sides of a window (room side)
function addCurtains(B, floor, f, o, sg, t) {
  const base = floor.level;
  const face = -sg * (t / 2) - sg * 0.09; // 9cm into the room
  const top = base + Math.min(o.head + 0.1, (floor.ceiling || 2.4) - 0.02);
  const bottom = o.sill < 0.05 ? base + 0.01 : base + o.sill - 0.12;
  const h = top - bottom, pw = 0.24;
  for (const [s0, dir] of [[o.from - 0.12, 1], [o.to + 0.12 - pw, -1]]) {
    const g = new THREE.PlaneGeometry(pw, h, 16, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) + pw / 2) / pw * Math.PI * 5) * 0.035);
    g.computeVertexNormals(); metricUV(g);
    g.translate(pw / 2, h / 2, 0);
    if (f.vertical) { g.rotateY(Math.PI / 2); g.translate(f.c + face, bottom, s0 + pw); }
    else g.translate(s0, bottom, f.c + face);
    B.add(`${floor.id}:furn`, 'curtain', g);
    void dir;
  }
  // rail
  wallBox(B, `${floor.id}:furn`, 'white', f, o.from - 0.15, o.to + 0.15, Math.min(face, face + sg * 0.04) - 0.02, Math.max(face, face + sg * 0.04) + 0.02, top, top + 0.04);
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
        B.box(`${floor.id}:shell`, 'wall', rr[0] + 0.001, y - 0.05, rr[1] + 0.001, rr[2] - 0.001, y - 0.001, rr[3] - 0.001);
      }
    }
  }
  // ceilings (omit where the floor above has a stair void, unless kept).
  // Lower flat ceilings are drawn as soffit blocks so the step reads correctly.
  const maxH = floor.ceiling;
  const ceilRects = floor.ceilings || floor.footprint.map(rect => ({ rect, h: floor.ceiling }));
  const holes = (above?.voids || []);
  for (const c of ceilRects) {
    let parts = [c.rect];
    if (!c.keep) for (const h of holes) parts = subtract(parts, h);
    for (const p of parts) {
      if (c.slope) B.add(`${floor.id}:ceiling`, 'ceiling', slopedCeiling(c.slope.x0, c.slope.x1, p[1], p[3], L + c.slope.h0, L + c.slope.h1));
      else if (c.slopeZ) B.add(`${floor.id}:ceiling`, 'ceiling', slopedCeilingZ(p[0], p[2], c.slopeZ.z0, c.slopeZ.z1, L + c.slopeZ.h0, L + c.slopeZ.h1));
      else if (c.h < maxH - 0.005) B.box(`${floor.id}:ceiling`, 'ceiling', p[0], L + c.h, p[1], p[2], L + maxH + 0.02, p[3]);
      else B.add(`${floor.id}:ceiling`, 'ceiling', quad(p[0], p[1], p[2], p[3], L + c.h, false));
    }
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
    const ring = cylinder(0.062, 0.062, 0.0035, 24); ring.translate(x, y, z); // 0.5 mm lower than the disc top
    B.add(`${floor.id}:ceiling`, 'frameLight', ring);
    lightRig.push({ floor: floor.id, pos: new THREE.Vector3(x, y - 0.08, z) });
  }
}

// ---- stairs ---------------------------------------------------------------
// A flight rises along `dir` (north/south/east/west) from `from` to `to` (m
// above the floor level); 'land' is a single winder/landing block at `to`.
function buildStairs(B, floor, s) {
  const [x1, z1, x2, z2] = s.rect;
  const g = `${floor.id}:shell`;
  if (s.dir === 'land') {
    const top = floor.level + s.to;
    B.box(g, 'stair', x1 + 0.02, top - 0.035, z1 + 0.02, x2 - 0.02, top, z2 - 0.02);
    B.box(g, 'white', x1 + 0.03, floor.level + 0.004, z1 + 0.03, x2 - 0.03, top - 0.036, z2 - 0.03);
    return;
  }
  const L = floor.level + s.from;
  const n = s.steps, rise = (s.to - s.from) / n;
  const alongX = s.dir === 'east' || s.dir === 'west';
  const len = alongX ? x2 - x1 : z2 - z1, run = len / n;
  for (let i = 0; i < n; i++) {
    const top = L + (i + 1) * rise;
    let a, b;
    if (s.dir === 'north') { a = z2 - (i + 1) * run; b = z2 - i * run; }
    else if (s.dir === 'south') { a = z1 + i * run; b = z1 + (i + 1) * run; }
    else if (s.dir === 'east') { a = x1 + i * run; b = x1 + (i + 1) * run; }
    else { a = x2 - (i + 1) * run; b = x2 - i * run; }
    // treads are 3 mm narrower than the body so no faces are shared
    if (alongX) {
      B.box(g, 'stair', a + 0.001, top - 0.035, z1 + 0.02, b - 0.001, top, z2 - 0.02);
      B.box(g, 'white', a + 0.004, floor.level + 0.004, z1 + 0.03, b - 0.004, top - 0.037, z2 - 0.03);
    } else {
      B.box(g, 'stair', x1 + 0.02, top - 0.035, a + 0.001, x2 - 0.02, top, b - 0.001);
      B.box(g, 'white', x1 + 0.03, floor.level + 0.004, a + 0.004, x2 - 0.03, top - 0.037, b - 0.004);
    }
  }
}

// ---- exterior -------------------------------------------------------------
function facadeMaterial(floor, w) {
  // road sides (north 6 m / east 4 m): metal siding on 2F and the 3F front
  if (floor.id === '2F' && (w.outside === 'N' || w.outside === 'E')) return 'extSiding';
  if (floor.id === '3F' && w.outside === 'N') return 'extSiding';
  return 'extWhite';
}

function slopedRoof(x1, x2, zLo, zHi, yLo, yHi) {
  // single upward-facing quad from the low (north) edge to the high edge
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x1, yLo, zLo, x2, yLo, zLo, x2, yHi, zHi, x1, yHi, zHi], 3));
  g.setIndex(zHi > zLo ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals(); metricUV(g);
  return g;
}

function buildExterior(B, mats, models) {
  const { X, Z, R } = EXTERIOR.raw;
  const g = 'ext:main';
  const L1 = LEVEL['1F'], L2 = LEVEL['2F'], L3 = LEVEL['3F'];
  const site = EXTERIOR.site;
  const P = 0.003; // facings stand 3 mm proud so no two faces share a plane
  const W = EXTERIOR.width;
  // ---- ground: north road (6 m), east road (4 m), site paving, far ground
  const roadE0 = X(7.0), roadE1 = roadE0 + EXTERIOR.roads.east;
  B.add('site', 'asphalt', quad(-16, site.north - EXTERIOR.roads.north, roadE1 + 12, site.north, 0));
  B.add('site', 'asphalt', quad(roadE0, site.north, roadE1, 14, 0.001));
  B.add('site', 'farGround', quad(-160, -170, 160, 150, -0.02));
  B.box('site', 'paving', -16, 0, site.north - 0.22, roadE0, 0.12, site.north); // kerb (north)
  B.box('site', 'paving', roadE0 - 0.22, 0, site.north, roadE0, 0.12, 14);      // kerb (east)
  // garage slab + apron, then the rest of the lot
  const [gx1, gz1, gx2, gz2] = EXTERIOR.garage;
  B.box('site', 'paving', X(-0.9), 0, site.north, roadE0 - 0.22, 0.05, gz2);
  B.box('site', 'paving', X(4.7) - 0.002, 0, Z(5.4), roadE0 - 0.22, 0.05, Z(9.0) + 0.75);
  B.add('site', 'ground', quad(X(-0.9), gz2, X(-0.45) - 0.002, Z(9.0) + 0.75, 0.051));
  B.add('site', 'ground', quad(X(6.2) + 0.08, gz2, roadE0 - 0.22, Z(5.4) - 0.002, 0.051));

  // ---- built-in garage under 2F: soffit, north beam with shutter box, piers
  const soffitY = L2 - SLAB;
  B.box('2F:ext', 'white', X(0.9), soffitY - 0.004, Z(0) + 0.16, X(6.4) - 0.16, soffitY + 0.02, gz2 - 0.081);
  B.box('2F:ext', 'white', X(0.4), soffitY - 0.004, Z(2.6), X(0.9) - 0.001, soffitY + 0.02, gz2 - 0.081);
  B.box('2F:ext', 'extWhite', X(0.9) - P, soffitY - 0.32, Z(0) - P, X(6.4) + P, L2 + 0.002, Z(0) + 0.16); // beam / 2F floor edge
  B.box('2F:ext', 'frame', X(1.4), soffitY - 0.3, Z(0) + 0.16, X(6.1), soffitY - 0.002, Z(0) + 0.3);       // shutter box
  B.box(g, 'extStone', X(5.95), 0.05, Z(0) - P, X(6.4) + P, soffitY - 0.32, Z(1.0));                 // NE stone pier
  B.box(g, 'extStone', X(0.9) - P, 0.05, Z(0) - P, X(1.35), soffitY - 0.32, Z(0.8));                 // NW stone pier
  B.box(g, 'extWhite', X(6.2) - 0.002, 0.05, Z(1.0), X(6.4), soffitY, gz2);                         // east wall of the garage
  for (const x of [2.4, 4.4]) { const d = cylinder(0.06, 0.06, 0.01); d.translate(X(x), soffitY - 0.016, Z(1.6)); B.add('2F:ext', 'downlight', d); }
  // EV outlet / bollards on the apron (設備表: カースペース)
  B.box(g, 'darkGrey', X(5.95), 0.05, Z(2.9), X(6.15), 1.1, Z(3.05));
  for (const x of [1.3, 5.6]) { const p = cylinder(0.05, 0.05, 0.8); p.translate(X(x), 0.05, Z(0.15)); B.add('site', 'steel', p); }

  // ---- porch (east entrance) under the 2F, steps down to the east road
  const [px1, pz1, px2, pz2] = EXTERIOR.porch;
  B.box(g, 'tileGenkan', px1 + P, 0.05, pz1 + P, px2, L1 - 0.17, pz2 - P);
  B.box(g, 'tileGenkan', px2 - 0.002, 0.05, pz1 + 0.2, px2 + 0.32, L1 - 0.26, pz2 - 0.2);
  B.box('2F:ext', 'white', px1 + 0.004, soffitY - 0.004, pz1 + 0.004, X(5.8) - 0.004, soffitY + 0.02, pz2 - 0.004);
  B.box(g, 'extStone', px2 - 0.28, 0.05, pz2 - 0.28, px2 + P, soffitY, pz2 + P); // porch column
  const d = cylinder(0.06, 0.06, 0.01); d.translate((px1 + px2) / 2, soffitY - 0.012, (pz1 + pz2) / 2); B.add(g, 'downlight', d);
  // delivery box + mailbox by the steps
  B.box('site', 'darkGrey', px2 + 0.45, 0.05, pz2 - 0.1, px2 + 0.95, 1.1, pz2 + 0.35);
  B.box('site', 'steel', px2 + 0.48, 0.8, pz2 + 0.35, px2 + 0.92, 0.84, pz2 + 0.352);

  // ---- 2F roof (metal, low pitch, low edge to the north road)
  const { zHigh, zLow } = EXTERIOR.roof2Fslope;
  const yLo = L3 + 0.02, yHi = L3 + 0.62;
  const yAt = z => yLo + (yHi - yLo) * (z - zLow) / (zHigh - zLow);
  for (const [x1, z1, x2, z2] of EXTERIOR.roof2F) {
    const za = Math.min(z1, z2), zb = Math.max(z1, z2);
    B.add('roof', 'darkGrey', slopedRoof(x1 - (x1 <= X(0) + 0.01 ? 0.25 : 0), x2 + (x2 >= X(6.4) - 0.01 ? 0.25 : 0), za - (za <= zLow + 0.01 ? 0.3 : 0), zb, yAt(za - (za <= zLow + 0.01 ? 0.3 : 0)), yAt(zb)));
  }
  B.box('roof', 'frame', X(0.9) - 0.25, yAt(zLow - 0.3) - 0.12, zLow - 0.34, X(6.4) + 0.25, yAt(zLow - 0.3) + 0.004, zLow - 0.3); // gutter / fascia

  // ---- 3F flat roof: one extruded outline (no overlapping boxes)
  const pts = [[0, 4.4], [4.7, 4.4], [4.7, 3.35], [6.2, 3.35], [6.2, 5.4], [4.8, 5.4], [4.8, 9.0], [0, 9.0]].map(([x, z]) => [X(x), Z(z)]);
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  roof.rotateX(-Math.PI / 2); roof.translate(0, EXTERIOR.roofTop, 0); metricUV(roof);
  B.add('roof', 'extWhite', roof);
  const cap = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  cap.rotateX(-Math.PI / 2); cap.translate(0, EXTERIOR.roofTop + 0.16, 0); metricUV(cap);
  B.add('roof', 'darkGrey', cap);

  // ---- gate, planting
  placeModel(B, 'site', models, 'potted_plant_04', px2 + 0.4, 0.05, pz1 - 0.4, 0, 1.0);
  placeModel(B, 'site', models, 'potted_plant_02', X(0.2), 0.05, Z(0.25), 0, 1.0);
  B.box('site', 'walnut', X(-0.85), 0.05, Z(2.4), X(-0.8), 1.8, Z(7.0)); // timber screen to the west neighbour

  // ---- neighbours (part of the 6-house development): west and south blocks
  for (const [x1, z1, x2, z2, h] of [[-9.5, Z(0) - 0.4, X(-0.9) - 0.5, Z(9.0) + 0.6, 7.9], [X(-0.9), Z(9.0) + 1.4, roadE0 - 0.6, Z(9.0) + 9.5, 8.6]]) {
    B.box('site', 'neighbour', x1, 0, z1, x2, h, z2);
    for (const y of [1.0, 4.0]) {
      if (x2 < 0) for (const z of [z1 + 1.2, z1 + 4.2, z1 + 7.0]) { B.box('site', 'neighbourWin', x2 - 0.02, y + 0.8, z, x2 + 0.02, y + 1.7, z + 0.9); }
      else for (const x of [x1 + 1.0, x1 + 3.6, x1 + 6.0]) { B.box('site', 'neighbourWin', x, y + 0.8, z1 - 0.02, x + 0.9, y + 1.7, z1 + 0.02); }
    }
  }
}

// ---- collision map --------------------------------------------------------
function collision(floor) {
  const blocked = [];
  for (const w of floor.walls) {
    const f = wallFrame(w);
    const t = w.t / 2 + 0.03;
    let cur = f.s0 - t;
    const ops = [...w.openings].filter(o => (o.kind !== 'window' || o.sill < 0.05) && o.kind !== 'bifold' && o.open !== 0 && !(o.sill > 0.3)).sort((a, b) => a.from - b.from);
    const push = (s0, s1) => { if (s1 > s0) blocked.push(f.vertical ? [f.c - t, s0, f.c + t, s1] : [s0, f.c - t, s1, f.c + t]); };
    for (const o of ops) { push(cur, o.from); cur = o.to; }
    push(cur, f.s1 + t);
  }
  for (const v of floor.voids) blocked.push(v);
  for (const s of floor.stairs) blocked.push(s.rect);
  return blocked;
}

// balcony: deck, glass rails on the listed outer edges, drying poles
function buildBalcony(B, floor, bal) {
  const [x1, z1, x2, z2] = bal.rect, L = floor.level, g = `${floor.id}:ext`;
  B.box(g, 'oak', x1 + 0.002, L - 0.06, z1 + 0.002, x2 - 0.002, L - 0.02, z2 - 0.002);
  B.box(g, 'extWhite', x1 - 0.003, L - 0.32, z1 + 0.004, x2 + 0.003, L - 0.061, z2 + 0.003); // slab edge
  const H = 1.1, T = 0.05;
  const rail = (ax1, az1, ax2, az2) => {
    B.box(g, 'extWhite', ax1, L - 0.019, az1, ax2, L + 0.12, az2); // upstand
    B.box(g, 'glass', ax1 + 0.012, L + 0.12, az1 + 0.012, ax2 - 0.012, L + H - 0.04, az2 - 0.012);
    B.box(g, 'frame', ax1 - 0.004, L + H - 0.04, az1 - 0.004, ax2 + 0.004, L + H, az2 + 0.004);
  };
  // corner: the S rail runs full width, the E/W rails stop short of it
  for (const r of bal.rails || []) {
    const side = r.side || r;
    if (side === 'E') rail(x2 - T, z1 + T + 0.002, x2, z2 - T - 0.002);
    if (side === 'W') rail(x1, z1 + 0.004, x1 + T, z2 - T - 0.002);
    if (side === 'S') rail(x1 + 0.004, z2 - T, x2, z2);
    if (side === 'N') rail(r.from ?? x1, z1, r.to ?? x2, z1 + T);
  }
  if (bal.dryingPole) for (const z of [z1 + 0.6, z2 - 0.6]) B.box(g, 'frameLight', x2 - T - 0.035, L + H, z - 0.015, x2 - T - 0.005, L + 1.6, z + 0.015);
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
    for (const bal of floor.balconies || []) buildBalcony(B, floor, bal);
    nav[floor.id] = { blocked, footprint: [...floor.footprint, ...(floor.balconies || []).map(b => b.rect)] };
  });
  buildExterior(B, mats, models);
  const root = B.build();
  return { root, lightRig, nav };
}
