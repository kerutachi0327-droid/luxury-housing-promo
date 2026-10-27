// Built-in fittings (kitchen, bath, storage…) and staging furniture.
// Sizes follow common Japanese catalogue dimensions so the space reads at
// true scale (bed 1950 long, counter 850 high, dining table 1400x800 …).
import * as THREE from 'three';
import { block, cylinder, metricUV } from './geo.js';

const tmpM = new THREE.Matrix4();
function put(B, group, mat, g, x, y, z, rot = 0) {
  tmpM.makeRotationY(rot); g.applyMatrix4(tmpM); g.translate(x, y, z); B.add(group, mat, g);
}
// add a local-space part list [geo, mat] to world at (x,y,z,rot)
function assemble(B, group, parts, x, y, z, rot = 0) { for (const [g, m] of parts) put(B, group, m, g, x, y, z, rot); }
const P = (w, h, d, x = 0, y = 0, z = 0, opt = {}) => { const g = block(w, h, d, opt); g.translate(x, y, z); return g; };
function footprint(blocked, x, z, w, d, rot, margin = 0.05) {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
  const hw = (w * c + d * s) / 2 + margin, hd = (w * s + d * c) / 2 + margin;
  blocked.push([x - hw, z - hd, x + hw, z + hd]);
}
function fabricMat(B, color) {
  const key = 'fabric_' + color.replace('#', '');
  if (!B.mats[key]) { const m = B.mats.fabric.clone(); m.color.set(color); B.mats[key] = m; }
  return key;
}
function rugMat(B, color) {
  const key = 'rug_' + color.replace('#', '');
  if (!B.mats[key]) { const m = B.mats.rug.clone(); m.color.set(color); B.mats[key] = m; }
  return key;
}

// --------------------------------------------------------------- models
export function placeModel(B, group, models, id, x, y, z, rot = 0, scale = 1, mode = 'floor') {
  const src = models?.[id];
  if (!src) return null;
  const o = src.clone(true);
  o.scale.setScalar(scale);
  o.rotation.y = rot;
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const c = box.getCenter(new THREE.Vector3());
  o.position.set(x - c.x, mode === 'ceiling' ? y - box.max.y : y - box.min.y, z - c.z);
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material) { m.material.envMapIntensity = 1; } } });
  B.object(group, o);
  return box.getSize(new THREE.Vector3());
}

// --------------------------------------------------------------- built-ins
export function addBuiltIn(B, floor, b, blocked, models) {
  const L = floor.level, g = `${floor.id}:furn`;
  const r = b.rect;
  const box = (mat, x1, y1, z1, x2, y2, z2) => B.box(g, mat, x1, y1, z1, x2, y2, z2);
  switch (b.type) {
    case 'shoeCabinet':
    case 'tallStorage':
    case 'closet': {
      if (b.hidden) return;
      const [x1, z1, x2, z2] = r;
      const y0 = L + (b.type === 'shoeCabinet' ? 0.25 : 0), y1 = L + b.h;
      const face = b.facing;
      // carcass
      box('white', x1, y0, z1, x2, y1, z2);
      // door fronts (2-3 leaves) on the facing side
      const along = face === 'E' || face === 'W' ? [z1, z2] : [x1, x2];
      const n = Math.max(1, Math.round((along[1] - along[0]) / 0.45));
      const pw = (along[1] - along[0]) / n;
      for (let i = 0; i < n; i++) {
        const a = along[0] + i * pw + 0.003, c = along[0] + (i + 1) * pw - 0.003;
        if (face === 'E') { box('doorV', x2, y0 + 0.003, a, x2 + 0.02, y1 - 0.003, c); box('steel', x2 + 0.02, L + 0.95, (i % 2 ? a + 0.04 : c - 0.06), x2 + 0.035, L + 1.25, (i % 2 ? a + 0.06 : c - 0.04)); }
        if (face === 'W') { box('doorV', x1 - 0.02, y0 + 0.003, a, x1, y1 - 0.003, c); box('steel', x1 - 0.035, L + 0.95, (i % 2 ? a + 0.04 : c - 0.06), x1 - 0.02, L + 1.25, (i % 2 ? a + 0.06 : c - 0.04)); }
        if (face === 'N') { box('doorV', a, y0 + 0.003, z1 - 0.02, c, y1 - 0.003, z1); box('steel', (i % 2 ? a + 0.04 : c - 0.06), L + 0.95, z1 - 0.035, (i % 2 ? a + 0.06 : c - 0.04), L + 1.25, z1 - 0.02); }
      }
      if (b.type === 'shoeCabinet') { // counter top + indirect light strip under
        box('oak', x1, y0 + 0.9, z1, x2 + 0.03, y0 + 0.93, z2);
        box('lampShade', x1 + 0.02, y0 - 0.006, z1 + 0.02, x2 - 0.04, y0 - 0.001, z2 - 0.02);
      }
      blocked.push([x1 - 0.05, z1 - 0.05, x2 + 0.05, z2 + 0.05]);
      return;
    }
    case 'counter': {
      const [x1, z1, x2, z2] = r;
      box('oak', x1, L + b.h - 0.035, z1, x2, L + b.h, z2);
      box('white', x2 - 0.02, L + b.h - 0.25, z1 + 0.05, x2, L + b.h - 0.035, z2 - 0.05);
      blocked.push([x1 - 0.05, z1, x2, z2]);
      return;
    }
    case 'kitchenIsland': {
      const [x1, z1, x2, z2] = r;
      box('kitchenFront', x1, L + 0.08, z1 + 0.02, x2, L + 0.85, z2);
      box('black', x1 + 0.03, L, z1 + 0.06, x2, L + 0.08, z2 - 0.03);
      box('counterDark', x1 - 0.02, L + 0.85, z1, x2, L + 0.88, z2 + 0.02);
      // drawer reveals
      for (const yy of [0.33, 0.6]) box('black', x1, L + yy, z2, x2, L + yy + 0.006, z2 + 0.002);
      // sink & faucet
      const [sx, sz] = b.sink;
      box('steel', sx - 0.36, L + 0.70, sz - 0.2, sx + 0.36, L + 0.881, sz + 0.2);
      box('darkGrey', sx - 0.34, L + 0.72, sz - 0.18, sx + 0.34, L + 0.882, sz + 0.18);
      const tap = cylinder(0.016, 0.02, 0.32); tap.translate(sx, L + 0.88, sz + 0.24); B.add(g, 'steel', tap);
      const spout = block(0.03, 0.03, 0.22, { base: false }); spout.translate(sx, L + 1.19, sz + 0.14); B.add(g, 'steel', spout);
      blocked.push([x1 - 0.05, z1 - 0.05, x2, z2 + 0.05]);
      return;
    }
    case 'kitchenRun': {
      const [x1, z1, x2, z2] = r;
      box('kitchenFront', x1, L + 0.08, z1, x2, L + 0.85, z2);
      box('counterDark', x1 - 0.02, L + 0.85, z1, x2, L + 0.88, z2);
      box('kitchenPanel', x2 - 0.012, L + 0.88, z1, x2, L + 2.05, z2);
      const [cx, cz] = b.cooktop;
      box('tv', cx - 0.26, L + 0.881, cz - 0.3, cx + 0.26, L + 0.887, cz + 0.3);
      for (const [dx, dz] of [[-0.12, -0.15], [-0.12, 0.15], [0.12, 0]]) { const ring = cylinder(0.08, 0.08, 0.002, 28); ring.translate(cx + dx, L + 0.887, cz + dz); B.add(g, 'darkGrey', ring); }
      if (b.hood) {
        box('kitchenFront', cx - 0.3, L + 1.75, cz - 0.38, x2, L + 2.05, cz + 0.38);
        box('black', cx - 0.29, L + 1.745, cz - 0.36, x2 - 0.02, L + 1.75, cz + 0.36);
      }
      blocked.push([x1 - 0.05, z1 - 0.05, x2, z2 + 0.05]);
      return;
    }
    case 'fridge': {
      const [x1, z1, x2, z2] = r;
      box('whiteGloss', x1, L, z1, x2, L + b.h, z2);
      box('black', x1 - 0.004, L + 1.05, z1 + 0.01, x1, L + 1.056, z2 - 0.01);
      box('steel', x1 - 0.03, L + 1.15, z1 + 0.06, x1 - 0.01, L + 1.6, z1 + 0.08);
      blocked.push([x1 - 0.05, z1, x2, z2]);
      return;
    }
    case 'cupboard': {
      const [x1, z1, x2, z2] = r;
      box('kitchenFront', x1, L + 0.08, z1, x2, L + 0.85, z2);
      box('counterDark', x1, L + 0.85, z1, x2 + 0.02, L + 0.88, z2);
      box('kitchenPanel', x1, L + 0.88, z1, x1 + 0.012, L + 1.45, z2);
      if (b.upper) box('kitchenFront', x1, L + 1.45, z1, x1 + 0.35, L + 2.3, z2);
      box('whiteGloss', x1 + 0.03, L + 0.88, z1 + 0.15, x1 + 0.4, L + 1.18, z1 + 0.62); // microwave
      box('tv', x1 + 0.402, L + 0.92, z1 + 0.2, x1 + 0.405, L + 1.14, z1 + 0.5);
      blocked.push([x1, z1, x2 + 0.05, z2]);
      return;
    }
    case 'vanity': {
      const [x1, z1, x2, z2] = r;
      box('white', x1, L + 0.12, z1, x2, L + 0.8, z2);
      box('marble', x1 - 0.02, L + 0.8, z1, x2, L + 0.83, z2);
      const bx = (x1 + x2) / 2 - 0.02, bz = (z1 + z2) / 2;
      const bowl = cylinder(0.2, 0.17, 0.12, 32); bowl.scale(1, 1, 1.3); bowl.translate(bx, L + 0.75, bz); B.add(g, 'porcelain', bowl);
      const tap = cylinder(0.014, 0.016, 0.22); tap.translate(x2 - 0.08, L + 0.83, bz); B.add(g, 'steel', tap);
      if (b.mirror) { box('white', x2 - 0.13, L + 1.05, z1, x2, L + 1.95, z2); box('mirror', x2 - 0.132, L + 1.1, z1 + 0.02, x2 - 0.128, L + 1.9, z2 - 0.02); box('lampShade', x2 - 0.13, L + 1.95, z1, x2 - 0.05, L + 1.98, z2); }
      blocked.push([x1 - 0.05, z1, x2, z2]);
      return;
    }
    case 'washer': {
      const [x1, z1, x2, z2] = r;
      const pan = 0.02;
      box('white', x1 - pan, L, z1 - pan, x2 + pan, L + 0.06, z2 + pan);
      box('whiteGloss', x1 + 0.01, L + 0.06, z1 + 0.01, x2 - 0.01, L + 0.92, z2 - 0.01);
      const door = cylinder(0.17, 0.17, 0.02, 32); door.rotateX(Math.PI / 2); door.translate((x1 + x2) / 2, L + 0.5, z1);
      B.add(g, 'tv', door);
      box('whiteGloss', x1, L + 1.55, z1 + 0.05, x2, L + 2.25, z2); // gas dryer (乾太くん)
      blocked.push([x1 - 0.05, z1 - 0.05, x2 + 0.05, z2 + 0.05]);
      return;
    }
    case 'shelf': {
      const [x1, z1, x2, z2] = r;
      for (let y = 0.35; y <= b.h; y += 0.38) box('white', x1, L + y, z1, x2, L + y + 0.02, z2);
      blocked.push([x1 - 0.03, z1 - 0.03, x2 + 0.03, z2 + 0.03]);
      return;
    }
    case 'bathtub': {
      const [x1, z1, x2, z2] = r;
      box('porcelain', x1, L, z1, x2, L + 0.55, z1 + 0.05);
      box('porcelain', x1, L, z2 - 0.05, x2, L + 0.55, z2);
      box('porcelain', x1, L, z1, x1 + 0.05, L + 0.55, z2);
      box('porcelain', x2 - 0.05, L, z1, x2, L + 0.55, z2);
      box('porcelain', x1 + 0.05, L, z1 + 0.05, x2 - 0.05, L + 0.12, z2 - 0.05);
      // wall panels of the unit bath + lower ceiling
      const room = floor.rooms.find(rm => rm.name === '浴室');
      if (room) {
        const [a, c, d, e] = room.rect, t = 0.06;
        const h = L + 2.2;
        B.box(g, 'bathPanel', a + t, L, c + t, d - t, h, c + t + 0.01);
        B.box(g, 'bathPanel', a + t, L, e - t - 0.01, d - t, h, e - t);
        B.box(g, 'bathPanel', a + t, L, c + t, a + t + 0.01, h, e - t);
        B.box(g, 'bathPanel', d - t - 0.01, L, c + t, d - t, h, e - t);
        B.box(`${floor.id}:ceiling`, 'white', a + t, h, c + t, d - t, h + 0.01, e - t);
        const shower = cylinder(0.012, 0.012, 1.0); shower.translate(d - t - 0.04, L + 0.9, (c + e) / 2); B.add(g, 'steel', shower);
        B.box(g, 'mirror', d - t - 0.012, L + 1.0, (c + e) / 2 + 0.2, d - t - 0.008, L + 1.6, (c + e) / 2 + 0.55);
      }
      blocked.push([x1 - 0.05, z1, x2 + 0.05, z2]);
      return;
    }
    case 'toilet': {
      const [x, z] = b.at;
      const rot = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 }[b.facing];
      const bowl = cylinder(0.19, 0.16, 0.4, 28); bowl.scale(1, 1, 1.3); bowl.translate(0, 0, -0.05);
      const seat = cylinder(0.2, 0.2, 0.03, 28); seat.scale(1, 1, 1.3); seat.translate(0, 0.4, -0.05);
      const tank = P(0.42, 0.42, 0.2, 0, 0.4, 0.2, { radius: 0.03 });
      assemble(B, g, [[bowl, 'porcelain'], [seat, 'porcelain'], [tank, 'porcelain']], x, L, z, rot);
      footprint(blocked, x, z, 0.45, 0.75, rot);
      return;
    }
    case 'step': {
      const [x1, z1, x2, z2] = r;
      box('walnut', x1 + 0.02, L - 0.15, z1, x2 - 0.02, L + 0.002, z2);
      return;
    }
    case 'niche': {
      const [x, z] = b.at;
      box('oak', x + 0.03, L + 1.0, z - b.w / 2, x + 0.2, L + 1.03, z + b.w / 2);
      placeModel(B, g, models, 'ceramic_vase_01', x + 0.12, L + 1.03, z, 0, 0.5);
      return;
    }
    case 'wicRail': {
      const [x1, z1, x2, z2] = r;
      box('white', x1, L + 1.8, z1, x2, L + 1.82, z1 + 0.4);
      const rod = block(x2 - x1, 0.025, 0.025); rod.translate((x1 + x2) / 2, L + 1.7, z1 + 0.3); B.add(g, 'steel', rod);
      const colors = ['#b5ab9c', '#e6e2da', '#6c6e70', '#a59a8a', '#d5cec2', '#3f4246'];
      let i = 0;
      for (let x = x1 + 0.15; x < x2 - 0.15; x += 0.11 + (i % 3) * 0.02) {
        const len = 0.65 + (i % 4) * 0.12;
        const cloth = P(0.04, len, 0.48, x, L + 1.7 - len, z1 + 0.3, { radius: 0.015 });
        B.add(g, fabricMat(B, colors[i++ % colors.length]), cloth);
      }
      blocked.push([x1, z1, x2, z1 + 0.6]);
      return;
    }
    case 'stairRail': {
      const [x1, z1, x2, z2] = r;
      box('walnut', x1 - 0.02, L + 1.0, z1, x2 + 0.02, L + 1.04, z2);
      for (let z = z1 + 0.1; z < z2; z += 0.11) box('frame', (x1 + x2) / 2 - 0.006, L, z, (x1 + x2) / 2 + 0.006, L + 1.0, z + 0.012);
      blocked.push([x1 - 0.1, z1, x2 + 0.1, z2]);
      return;
    }
    case 'aircon': { // wall-mounted room air conditioner (W800 H290 D250)
      const [x, z] = b.at, rot = { E: Math.PI / 2, W: -Math.PI / 2, N: Math.PI, S: 0 }[b.facing];
      const top = L + (b.top || 2.32);
      const parts = [
        [P(0.8, 0.29, 0.24, 0, -0.29, 0, { radius: 0.03 }), 'whiteGloss'],
        [P(0.72, 0.012, 0.05, 0, -0.27, 0.11), 'darkGrey'],
      ];
      assemble(B, g, parts, x, top, z, rot);
      return;
    }
    default:
  }
}

// --------------------------------------------------------------- furniture
const BED = { single: 0.97, semidouble: 1.2, double: 1.4 };
export function addFurniture(B, floor, it, blocked, models) {
  const L = floor.level, g = `${floor.id}:furn`;
  const [x, z] = it.at || [0, 0];
  const rot = it.rot || 0;
  switch (it.type) {
    case 'bed': {
      const w = BED[it.size] || 1.2, len = 1.95;
      const parts = [
        [P(w + 0.04, 0.24, len + 0.04, 0, 0.05, 0, { radius: 0.01 }), 'oak'],
        [P(w, 0.2, len, 0, 0.29, 0, { radius: 0.05 }), 'bedding'],
        [P(w + 0.02, 0.06, len * 0.68, 0, 0.47, len * 0.15, { radius: 0.03 }), 'bedding'],
        // runner sits 5 mm proud of the duvet top (0.53) to avoid z-fighting
        [P(w + 0.04, 0.03, 0.5, 0, 0.505, len * 0.32, { radius: 0.01 }), 'beddingAccent'],
        [P(0.5, 0.12, 0.34, -w / 4 - 0.01, 0.49, -len / 2 + 0.25, { radius: 0.05 }), 'bedding'],
        [P(0.5, 0.12, 0.34, w / 4 + 0.01, 0.49, -len / 2 + 0.25, { radius: 0.05 }), 'bedding'],
        [P(w + 0.12, 0.95, 0.06, 0, 0.05, -len / 2 - 0.05, { radius: 0.02 }), fabricMat(B, '#cfc6b8')],
      ];
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([P(0.05, 0.05, 0.05, dx * (w / 2 - 0.05), 0, dz * (len / 2 - 0.05)), 'black']);
      assemble(B, g, parts, x, L, z, rot);
      footprint(blocked, x, z, w + 0.1, len + 0.12, rot);
      return;
    }
    case 'nightstand': {
      assemble(B, g, [[P(0.42, 0.45, 0.38, 0, 0, 0, { radius: 0.01 }), 'oak'], [P(0.38, 0.004, 0.005, 0, 0.3, 0.19), 'black']], x, L, z, rot);
      const lamp = cylinder(0.08, 0.1, 0.18, 24); lamp.translate(x + 0.08, L + 0.6, z); B.add(g, 'lampShade', lamp);
      const st = cylinder(0.01, 0.05, 0.15, 16); st.translate(x + 0.08, L + 0.45, z); B.add(g, 'brass', st);
      footprint(blocked, x, z, 0.42, 0.38, rot);
      return;
    }
    case 'rug': {
      const [x1, z1, x2, z2] = it.rect;
      B.box(g, rugMat(B, it.color || '#d8d0c3'), x1, L + 0.001, z1, x2, L + 0.012, z2);
      return;
    }
    case 'desk': {
      const w = it.w || 1.0;
      const parts = [[P(w, 0.03, 0.55, 0, 0.7, 0), 'oak']];
      for (const dx of [-1, 1]) parts.push([P(0.03, 0.7, 0.5, dx * (w / 2 - 0.03), 0, 0), 'black']);
      parts.push([P(w - 0.06, 0.02, 0.02, 0, 0.6, -0.23), 'black']);
      assemble(B, g, parts, x, L, z, rot);
      // laptop + lamp
      assemble(B, g, [[P(0.32, 0.015, 0.22, 0.05, 0.73, 0.05), 'frameLight'], [P(0.32, 0.21, 0.01, 0.05, 0.745, -0.06), 'frameLight']], x, L, z, rot);
      footprint(blocked, x, z, w, 0.55, rot);
      return;
    }
    case 'chair': {
      const parts = [
        [P(0.44, 0.06, 0.42, 0, 0.42, 0, { radius: 0.02 }), fabricMat(B, '#8a8378')],
        [P(0.42, 0.36, 0.05, 0, 0.5, 0.2, { radius: 0.02 }), fabricMat(B, '#8a8378')],
      ];
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([P(0.025, 0.42, 0.025, dx * 0.19, 0, dz * 0.18), 'oak']);
      assemble(B, g, parts, x, L, z, rot);
      footprint(blocked, x, z, 0.46, 0.46, rot, 0.02);
      return;
    }
    case 'sofa': {
      const w = it.w || 2.0, d = 0.88;
      const fm = fabricMat(B, it.color || '#d6d0c6');
      const parts = [
        [P(w, 0.22, d, 0, 0.1, 0, { radius: 0.04 }), fm],
        [P(w - 0.08, 0.5, 0.22, 0, 0.18, d / 2 - 0.13, { radius: 0.08 }), fm],
        [P(0.16, 0.38, d, -w / 2 + 0.08, 0.14, 0, { radius: 0.06 }), fm],
        [P(0.16, 0.38, d, w / 2 - 0.08, 0.14, 0, { radius: 0.06 }), fm],
      ];
      const seats = w > 1.7 ? 3 : 2, sw = (w - 0.34) / seats;
      for (let i = 0; i < seats; i++) parts.push([P(sw - 0.01, 0.14, d - 0.26, -w / 2 + 0.17 + sw * (i + 0.5), 0.32, -0.08, { radius: 0.06 }), fm]);
      for (let i = 0; i < 2; i++) parts.push([P(0.42, 0.4, 0.14, (i ? 1 : -1) * (w / 2 - 0.42), 0.44, d / 2 - 0.26, { radius: 0.07 }), i ? fabricMat(B, '#b9ad9a') : fabricMat(B, '#e7e2d9')]);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([P(0.04, 0.1, 0.04, dx * (w / 2 - 0.06), 0, dz * (d / 2 - 0.06)), 'walnut']);
      assemble(B, g, parts, x, L, z, rot);
      footprint(blocked, x, z, w, d, rot);
      return;
    }
    case 'coffeeTable': {
      const top = cylinder(0.42, 0.42, 0.03, 48); top.translate(0, 0.37, 0);
      const base = cylinder(0.2, 0.24, 0.37, 32);
      assemble(B, g, [[top, 'oak'], [base, 'oak']], x, L, z, 0);
      const book = P(0.24, 0.03, 0.18, 0.1, 0.4, 0.05); const book2 = P(0.22, 0.025, 0.16, 0.11, 0.43, 0.05);
      assemble(B, g, [[book, fabricMat(B, '#6f7b7f')], [book2, fabricMat(B, '#c9b79c')]], x, L, z, 0.3);
      footprint(blocked, x, z, 0.84, 0.84, 0);
      return;
    }
    case 'diningTable': {
      const w = it.w || 1.4, d = it.d || 0.8;
      const parts = [[P(w, 0.035, d, 0, 0.685, 0, { radius: 0.006 }), 'oak']];
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([P(0.04, 0.685, 0.04, dx * (w / 2 - 0.08), 0, dz * (d / 2 - 0.08)), 'black']);
      assemble(B, g, parts, x, L, z, rot);
      // table setting
      for (const dx of [-0.35, 0.35]) for (const dz of [-0.22, 0.22]) { const pl = cylinder(0.12, 0.1, 0.015, 28); pl.translate(x + dx, L + 0.72, z + dz); B.add(g, 'porcelain', pl); }
      footprint(blocked, x, z, w, d, rot);
      return;
    }
    case 'diningChair': {
      const parts = [
        [P(0.44, 0.07, 0.44, 0, 0.42, 0, { radius: 0.025 }), 'leather'],
        [P(0.42, 0.34, 0.06, 0, 0.52, 0.2, { radius: 0.025 }), 'leather'],
      ];
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push([P(0.022, 0.43, 0.022, dx * 0.19, 0, dz * 0.19), 'black']);
      // rot 0 = sitter faces +z? we define chair back at +z, so it faces -z
      assemble(B, g, parts, x, L, z, rot === 0 ? Math.PI : 0);
      footprint(blocked, x, z, 0.46, 0.46, 0, 0.02);
      return;
    }
    case 'stool': {
      const seat = cylinder(0.18, 0.18, 0.04, 32); seat.translate(0, 0.62, 0);
      const parts = [[seat, 'oak']];
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; const leg = cylinder(0.012, 0.014, 0.62, 8); leg.translate(Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13); parts.push([leg, 'black']); }
      const ring = new THREE.TorusGeometry(0.14, 0.008, 6, 32); ring.rotateX(Math.PI / 2); ring.translate(0, 0.25, 0); metricUV(ring); parts.push([ring, 'black']);
      assemble(B, g, parts, x, L, z, 0);
      footprint(blocked, x, z, 0.36, 0.36, 0, 0.02);
      return;
    }
    case 'pendant': {
      const cy = L + (floor.ceiling || 2.4);
      if (!placeModel(B, g, models, it.model, x, cy - 0.65, z, 0, 0.75, 'ceiling')) {
        const shade = cylinder(0.16, 0.16, 0.14, 32); shade.translate(x, cy - 0.85, z); B.add(g, 'lampShade', shade);
      }
      const cord = cylinder(0.004, 0.004, 0.6, 6); cord.translate(x, cy - 0.6, z); B.add(g, 'black', cord);
      return;
    }
    case 'model': {
      const size = placeModel(B, g, models, it.id, x, L + (it.y || 0), z, rot, it.scale || 1);
      if (size && !it.y) footprint(blocked, x, z, size.x, size.z, 0, 0.02);
      return;
    }
    default:
  }
}
