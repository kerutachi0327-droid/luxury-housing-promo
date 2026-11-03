// TYPE06 floor plan data (JR中央線・高円寺プロジェクト 6号棟).
//
// Source: official TYPE6 floor plan image (plan06.jpg, 1687 x 1181 px, 1F/2F/3F).
// The plan carries no dimension lines, so the scale was derived from the
// brochure areas: garage 18.21 m² and the floor areas (1F 49.27 / 2F 49.68 /
// 3F 21.94 m²) give 40.5 px per metre. A 0.5 m grid was laid over the original
// image and every wall centre line below was read off that grid (raw metres:
// x = east from the 2F west wall, z = south from the 2F north wall).
// K = 0.973 then trims all lengths so the summed floor areas match the brochure.
// tools/check-plan.mjs compares each room with its brochure 帖 figure (±8 %).
//
// Axes (as the viewer expects): x = east (m), z = south (m, 0 = south outer
// face, negative = towards the 6 m road on the north side), y = up.

export const JO = 1.62; // m² per 帖
export const SCALE = 1 / 40.5; // m per px of the original plan (documentation)
const K = 0.973, SX = 0.5, D = 9.0; // raw → world
const X = x => +((x + SX) * K).toFixed(3);
const Z = z => +((z - D) * K).toFixed(3);
const R = (x1, z1, x2, z2) => [X(Math.min(x1, x2)), Z(Math.min(z1, z2)), X(Math.max(x1, x2)), Z(Math.max(z1, z2))];

export const LEVEL = { '1F': 0.35, '2F': 3.10, '3F': 5.95 };
export const SLAB = 0.45;
const STAIR = [4.7, 3.35, 6.2, 5.4]; // stair box, identical on every floor (raw)

// ---------------------------------------------------------------------------
// Walls are derived from the room layout so that every wall centre line is
// shared exactly once (no duplicated / overlapping wall boxes → no z-fighting).
// Cells of 5 cm are classified; boundaries between different rooms become
// interior walls, boundaries between a room and the outside become exterior
// walls with their outside side recorded.
const CELL = 0.05;
const kindOf = r => (r.kind || 'room');
function deriveWalls(rooms, openings, extraOutside = []) {
  const xs = rooms.flatMap(r => r.rects.flatMap(q => [q[0], q[2]]));
  const zs = rooms.flatMap(r => r.rects.flatMap(q => [q[1], q[3]]));
  const x0 = Math.min(...xs) - CELL, z0 = Math.min(...zs) - CELL;
  const nx = Math.round((Math.max(...xs) - x0) / CELL) + 2, nz = Math.round((Math.max(...zs) - z0) / CELL) + 2;
  const id = new Int16Array(nx * nz).fill(-1);
  rooms.forEach((r, ri) => r.rects.forEach(([a, b, c, d]) => {
    for (let i = Math.round((a - x0) / CELL); i < Math.round((c - x0) / CELL); i++)
      for (let j = Math.round((b - z0) / CELL); j < Math.round((d - z0) / CELL); j++) id[j * nx + i] = ri;
  }));
  const at = (i, j) => (i < 0 || j < 0 || i >= nx || j >= nz) ? -1 : id[j * nx + i];
  const solid = k => k >= 0 && ['room', 'stair'].includes(kindOf(rooms[k]));
  const noWall = (a, b) => a === b || (a >= 0 && b >= 0 && rooms[a].group && rooms[a].group === rooms[b].group);
  // classify the edge between cell A (before) and B (after)
  const edge = (a, b, axis) => {
    if (noWall(a, b)) return null;
    const sa = solid(a), sb = solid(b);
    if (sa && sb) return 'int';
    if (sa) return axis === 'x' ? 'ext:E' : 'ext:S';
    if (sb) return axis === 'x' ? 'ext:W' : 'ext:N';
    return null;
  };
  const runs = [];
  for (let i = 0; i <= nx; i++) { // x = const lines
    let run = null;
    for (let j = 0; j <= nz; j++) {
      const k = j < nz ? edge(at(i - 1, j), at(i, j), 'x') : null;
      if (run && run.k !== k) { runs.push({ axis: 'x', c: x0 + i * CELL, s0: z0 + run.s * CELL, s1: z0 + j * CELL, k: run.k }); run = null; }
      if (k && !run) run = { k, s: j };
    }
  }
  for (let j = 0; j <= nz; j++) { // z = const lines
    let run = null;
    for (let i = 0; i <= nx; i++) {
      const k = i < nx ? edge(at(i, j - 1), at(i, j), 'z') : null;
      if (run && run.k !== k) { runs.push({ axis: 'z', c: z0 + j * CELL, s0: x0 + run.s * CELL, s1: x0 + i * CELL, k: run.k }); run = null; }
      if (k && !run) run = { k, s: i };
    }
  }
  return runs.map(r => {
    const ext = r.k.startsWith('ext');
    const ops = openings.filter(o => o.axis === r.axis && Math.abs(o.c - r.c) < CELL / 2 && o.a >= r.s0 - 0.01 && o.b <= r.s1 + 0.01)
      .map(o => ({ ...o.o, from: r.axis === 'x' ? Z(o.a) : X(o.a), to: r.axis === 'x' ? Z(o.b) : X(o.b) }));
    const a = r.axis === 'x' ? [X(r.c), Z(r.s0)] : [X(r.s0), Z(r.c)];
    const b = r.axis === 'x' ? [X(r.c), Z(r.s1)] : [X(r.s1), Z(r.c)];
    const wall = { a, b, t: ext ? 0.16 : 0.10, outside: ext ? r.k.split(':')[1] : null, h: null, openings: ops.sort((p, q) => p.from - q.from) };
    if (!ext && extraOutside.length) void 0;
    return wall;
  });
}

// opening helpers (raw metres along the wall)
const door = (axis, c, a, b, o = {}) => ({ axis, c, a, b, o: { kind: 'door', sill: 0, head: 2.0, ...o } });
const open = (axis, c, a, b, o = {}) => ({ axis, c, a, b, o: { kind: 'opening', sill: 0, head: 2.0, ...o } });
const win = (axis, c, a, b, sill = 0.9, head = 2.0, o = {}) => ({ axis, c, a, b, o: { kind: 'window', sill, head, ...o } });
const slide = (axis, c, a, b, o = {}) => ({ axis, c, a, b, o: { kind: 'window', sill: 0, head: 2.0, ...o } });

function room(name, rects, o = {}) {
  const rr = rects.map(q => R(...q));
  return { name, rawRects: rects, rect: rr[0], plus: rr.slice(1), ...o };
}
function floorDef(id, label, ceiling, roomsRaw, openingsRaw, extra) {
  const layout = roomsRaw.map(r => ({ kind: r.kind || 'room', rects: r.rawRects, group: r.group }));
  const walls = deriveWalls(layout, openingsRaw);
  const rooms = roomsRaw.filter(r => !r.kind || r.kind === 'room' || r.kind === 'stair').filter(r => !r.hide).map(({ rawRects, kind, group, hide, ...r }) => r);
  const footprint = roomsRaw.filter(r => !r.kind || r.kind === 'room' || r.kind === 'stair').flatMap(r => r.rawRects.map(q => R(...q)));
  return { id, label, level: LEVEL[id], ceiling, footprint, walls, rooms, ...extra };
}

// ---------------------------------------------------------------- 1F
const S = R(...STAIR);
const first = floorDef('1F', '1階', 2.3, [
  room('ガレージ', [[0.4, 0.3, 6.2, 3.35]], { kind: 'open' }),
  room('トイレ', [[0, 3.35, 1.9, 4.3]], { floor: 'cushionFloor' }),
  room('ホール', [[1.9, 4.4, 2.9, 5.3], [1.9, 3.35, 4.7, 4.4], [1.9, 5.3, 3.4, 6.8]]),
  room('洗面室', [[0, 4.3, 1.9, 7.4]], { floor: 'cushionFloor' }),
  room('浴室', [[-0.45, 7.4, 1.9, 9.0]], { floor: 'tileBath', wall: 'bathPanel' }),
  room('SIC', [[2.9, 4.4, 4.7, 5.3]], { floor: 'tileGenkan' }),
  room('玄関', [[3.4, 5.3, 4.7, 6.8]], { floor: 'tileGenkan', drop: 0.15 }),
  room('階段', [STAIR], { kind: 'stair', hide: true }),
  room('ポーチ', [[4.7, 5.4, 6.2, 6.8]], { kind: 'open' }),
  room('洋室1', [[1.9, 7.6, 6.2, 9.0], [1.9, 6.8, 5.2, 7.6]], { jo: 5.1, ceiling: 2.3 }),
  room('クローゼット', [[5.2, 6.8, 6.2, 7.6]]),
], [
  door('x', 1.9, 3.5, 4.2, { open: 0 }), door('x', 1.9, 5.0, 5.8, { swing: -1 }), door('z', 7.4, 0.35, 1.15, { kind: 'glassDoor', open: 0 }),
  door('z', 6.8, 2.0, 2.8), open('z', 5.3, 3.5, 4.6), open('x', 3.4, 5.3, 6.8, { head: 2.3 }), door('x', 4.7, 5.6, 6.6, { kind: 'entry', head: 2.15 }),
  open('x', 4.7, 3.4, 4.4), door('x', 5.2, 6.85, 7.55, { kind: 'bifold' }), door('z', 3.35, 2.6, 3.3, { open: 0 }),
  win('z', 9.0, 3.0, 4.5, 0.9, 2.0), win('x', 6.2, 7.9, 8.8, 0.9, 2.0, { fix: true }), win('z', 3.35, 0.4, 1.0, 1.4, 1.9, { frosted: true }),
  win('x', 0, 5.85, 6.45, 1.3, 1.9, { frosted: true }), win('x', -0.45, 7.8, 8.6, 1.2, 1.8, { frosted: true }), win('x', 6.2, 3.8, 4.8, 1.0, 1.8, { frosted: true }),
], {
  ceilings: null,
  voids: [],
  stairs: [
    { rect: R(4.7, 3.35, 5.6, 4.05), dir: 'east', from: 0, to: 0.21 * 4, steps: 4 },
    { rect: R(5.6, 3.35, 6.2, 4.05), dir: 'land', from: 0, to: 0.21 * 5, steps: 1 },
    { rect: R(5.6, 4.05, 6.2, 4.7), dir: 'south', from: 0.21 * 5, to: 0.21 * 8, steps: 3 },
    { rect: R(5.6, 4.7, 6.2, 5.4), dir: 'land', from: 0, to: 0.21 * 9, steps: 1 },
    { rect: R(4.7, 4.7, 5.6, 5.4), dir: 'west', from: 0.21 * 9, to: LEVEL['2F'] - LEVEL['1F'], steps: 4 },
  ],
  built: [
    { type: 'toilet', at: [X(0.45), Z(3.82)], facing: 'E' },
    { type: 'vanityW', rect: R(0.0, 4.5, 0.6, 5.7), mirror: true },
    { type: 'washer', rect: R(0.05, 6.55, 0.7, 7.3) },
    { type: 'shelf', rect: R(1.4, 6.9, 1.85, 7.35), h: 1.8 },
    { type: 'bathtub', rect: R(-0.4, 7.45, 0.45, 9.0) },
    { type: 'shoeCabinet', rect: R(2.95, 4.45, 4.65, 4.85), h: 2.0, facing: 'S' },
    { type: 'closet', rect: R(5.25, 6.85, 6.15, 7.55), h: 2.3, facing: 'W', hidden: true },
    { type: 'step', rect: R(3.36, 5.3, 3.44, 6.8) },
    { type: 'aircon', at: [X(2.45), Z(8.92)], facing: 'N', top: 2.25 },
  ],
  furniture: [
    { type: 'bed', size: 'semidouble', at: [X(2.98), Z(7.95)], rot: Math.PI / 2 },
    { type: 'nightstand', at: [X(2.2), Z(8.78)] },
    { type: 'desk', at: [X(5.55), Z(8.55)], rot: Math.PI, w: 1.0 },
    { type: 'chair', at: [X(5.55), Z(8.05)], rot: Math.PI },
    { type: 'rug', rect: R(3.8, 7.3, 5.1, 8.5), color: '#cfc7ba' },
  ],
  lights: [[X(3.0), Z(4.8)], [X(4.05), Z(6.0)], [X(3.8), Z(7.9)], [X(0.95), Z(5.6)]],
  views: [
    { name: '玄関', eye: [X(4.35), Z(6.2)], look: [X(2.0), Z(6.0)] },
    { name: 'ホール', eye: [X(2.45), Z(3.8)], look: [X(2.45), Z(6.7)] },
    { name: '洗面室', eye: [X(1.45), Z(5.4)], look: [X(0.2), Z(5.6)] },
    { name: '洋室1', eye: [X(4.9), Z(7.25)], look: [X(2.2), Z(8.2)] },
  ],
  portals: [{ at: [X(4.4), Z(3.85)], to: '2F', label: '2階へ', arrive: { eye: [X(4.25), Z(5.0)], look: [X(3.0), Z(8.4)] } }],
});

// ---------------------------------------------------------------- 2F
const second = floorDef('2F', '2階', 2.4, [
  room('パントリー', [[0.9, 0, 2.3, 2.6]]),
  room('WIC', [[2.3, 0, 3.75, 1.8]]),
  room('ホール', [[2.3, 1.8, 3.75, 3.3]], { group: 'ldk' }),
  room('洋室2', [[3.75, 0, 6.4, 3.3]], { jo: 5.1, ceiling: 2.4 }),
  room('LDK', [[0, 5.4, 5.8, 9.0], [0, 3.3, 3.75, 5.4], [0, 2.6, 2.3, 3.3], [-0.4, 7.3, 0, 9.0]], { jo: 21.0, joIncludes: ['パントリー'], ceiling: 2.35, group: 'ldk' }),
  room('階段ホール', [[3.75, 3.3, 6.2, 5.4]], { kind: 'stair', hide: true }),
  room('バルコニー', [[5.8, 5.4, 6.7, 9.0]], { kind: 'balcony' }),
], [
  open('x', 2.3, 1.9, 2.6), door('x', 3.75, 0.35, 1.15), door('x', 3.75, 2.45, 3.2, { swing: 1, hinge: 'to' }), open('x', 3.75, 3.35, 4.4), open('z', 5.4, 3.8, 4.7),
  slide('x', 5.8, 5.6, 8.7), win('z', 9.0, 0.8, 1.7, 0.9, 2.0), win('x', 0, 3.7, 4.4, 1.1, 2.0), win('x', -0.4, 7.6, 8.7, 0.9, 2.0),
  win('z', 0, 4.2, 5.7, 0.9, 2.0), win('x', 6.4, 1.4, 2.8, 0.9, 2.0), win('x', 6.2, 3.7, 4.9, 1.0, 1.9, { frosted: true }),
  win('z', 0, 1.1, 2.1, 1.5, 1.95, { frosted: true }),
], {
  ceilings: [
    { rect: R(0.9, 0, 2.3, 2.6), slopeZ: { z0: Z(0), h0: 1.5, z1: Z(2.6), h1: 2.4 } },
    { rect: R(3.75, 0, 6.4, 3.3), slopeZ: { z0: Z(0), h0: 1.6, z1: Z(3.3), h1: 2.4 } },
    { rect: R(2.3, 0, 3.75, 3.3), h: 2.4 },
    { rect: R(-0.4, 5.4, 5.8, 9.0), h: 2.35 },
    { rect: R(0, 2.6, 2.3, 3.3), h: 2.35 },
    { rect: R(0, 3.3, 6.2, 5.4), h: 2.35 },
  ],
  voids: [S],
  stairs: [
    { rect: R(4.7, 3.35, 5.6, 4.05), dir: 'east', from: 0, to: 0.19 * 4, steps: 4 },
    { rect: R(5.6, 3.35, 6.2, 4.05), dir: 'land', from: 0, to: 0.19 * 5, steps: 1 },
    { rect: R(5.6, 4.05, 6.2, 4.7), dir: 'south', from: 0.19 * 5, to: 0.19 * 8, steps: 3 },
    { rect: R(5.6, 4.7, 6.2, 5.4), dir: 'land', from: 0, to: 0.19 * 9, steps: 1 },
    { rect: R(4.7, 4.7, 5.6, 5.4), dir: 'west', from: 0.19 * 9, to: LEVEL['3F'] - LEVEL['2F'], steps: 6 },
  ],
  built: [
    { type: 'peninsula', rect: R(0.1, 4.6, 2.8, 5.3), sink: [X(2.15), Z(4.95)], cooktop: [X(0.7), Z(4.95)] },
    { type: 'fridge2', rect: R(0.08, 2.72, 0.75, 3.3), h: 1.82 },
    { type: 'backCounter', rect: R(0.8, 2.72, 2.3, 3.3) },
    { type: 'tallStorage', rect: R(-0.38, 7.35, -0.02, 8.95), h: 2.1, facing: 'E' },
    { type: 'shelf', rect: R(0.95, 0.05, 1.3, 2.5), h: 1.4 },
    { type: 'wicRail', rect: R(2.35, 0.05, 3.7, 1.75) },
    { type: 'stairRail', rect: R(4.66, 3.4, 4.7, 4.65) },
    { type: 'aircon', at: [X(-0.0) + 0.2, Z(6.2)], facing: 'E', top: 2.3 },
    { type: 'aircon', at: [X(6.35) - 0.2, Z(1.6)], facing: 'W', top: 2.3 },
  ],
  furniture: [
    { type: 'rug', rect: R(3.3, 6.6, 5.6, 8.75), color: '#d8d0c3' },
    { type: 'sofa', at: [X(4.45), Z(8.45)], rot: 0, w: 2.0, color: '#d6d0c6', chaise: true },
    { type: 'coffeeTable', at: [X(4.45), Z(7.55)], round: true },
    { type: 'model', id: 'modern_wooden_cabinet', at: [X(5.25), Z(5.68)], rot: Math.PI, scale: 0.7 },
    { type: 'model', id: 'modern_arm_chair_01', at: [X(5.35), Z(6.35)], rot: -Math.PI / 2 - 0.6 },
    { type: 'model', id: 'potted_plant_04', at: [X(5.55), Z(8.7)], scale: 1.0 },
    { type: 'model', id: 'ceramic_vase_01', at: [X(4.95), Z(5.68)], y: 0.55, scale: 0.6 },
    { type: 'diningTable', at: [X(1.3), Z(6.6)], rot: Math.PI / 2, w: 1.4, d: 0.8 },
    { type: 'diningChair', at: [X(0.75), Z(6.25)], rot: Math.PI / 2 },
    { type: 'diningChair', at: [X(0.75), Z(6.95)], rot: Math.PI / 2 },
    { type: 'diningChair', at: [X(1.85), Z(6.25)], rot: -Math.PI / 2 },
    { type: 'diningChair', at: [X(1.85), Z(6.95)], rot: -Math.PI / 2 },
    { type: 'pendant', at: [X(1.3), Z(6.6)], model: 'modern_ceiling_lamp_01' },
    { type: 'stool', at: [X(2.45), Z(5.6)] },
    { type: 'model', id: 'potted_plant_02', at: [X(-0.15), Z(8.75)], scale: 0.75 },
    { type: 'bed', size: 'single', at: [X(5.8), Z(1.1)], rot: 0 },
    { type: 'desk', at: [X(5.0), Z(2.95)], rot: Math.PI, w: 0.9 },
    { type: 'chair', at: [X(5.0), Z(2.45)], rot: Math.PI },
  ],
  lights: [[X(3.9), Z(7.6)], [X(1.3), Z(6.6)], [X(1.4), Z(3.9)], [X(4.2), Z(4.4)], [X(5.2), Z(1.7)], [X(3.0), Z(2.5)]],
  views: [
    { name: 'LDK入口', eye: [X(4.25), Z(6.0)], look: [X(0.6), Z(8.0)] },
    { name: 'リビング', eye: [X(5.35), Z(8.6)], look: [X(0.8), Z(4.8)] },
    { name: 'ダイニング', eye: [X(0.45), Z(8.5)], look: [X(4.6), Z(5.6)] },
    { name: 'キッチン', eye: [X(1.5), Z(3.95)], look: [X(3.6), Z(8.6)] },
    { name: '洋室2', eye: [X(4.35), Z(0.55)], look: [X(6.1), Z(3.0)] },
  ],
  portals: [
    { at: [X(4.25), Z(3.75)], to: '3F', label: '3階へ', arrive: { eye: [X(4.25), Z(5.0)], look: [X(3.0), Z(7.8)] } },
    { at: [X(4.25), Z(5.15)], to: '1F', label: '1階へ', arrive: { eye: [X(4.25), Z(3.85)], look: [X(2.3), Z(5.8)] } },
  ],
});

// ---------------------------------------------------------------- 3F
const third = floorDef('3F', '3階', 2.3, [
  room('WIC', [[0.9, 4.4, 2.9, 6.3]], { ceiling: 2.3 }),
  room('トイレ', [[2.9, 4.4, 3.8, 6.3]], { floor: 'cushionFloor' }),
  room('ホール', [[3.8, 4.4, 4.7, 6.3], [4.7, 5.4, 4.8, 6.3]]),
  room('階段', [STAIR], { kind: 'stair', hide: true }),
  room('主寝室', [[0, 6.3, 4.8, 9.0]], { jo: 7.6, ceiling: 2.3 }),
  room('バルコニー', [[4.8, 5.4, 5.9, 9.0]], { kind: 'balcony' }),
], [
  open('x', 4.7, 4.4, 5.4), door('z', 6.3, 3.85, 4.6, { swing: 1 }), door('z', 6.3, 1.4, 2.2), door('x', 3.8, 5.4, 6.1, { open: 0 }),
  slide('x', 4.8, 6.6, 8.7), win('z', 9.0, 0.8, 2.9, 0.9, 2.0), win('x', 0, 7.5, 8.6, 0.9, 2.0), win('x', 6.2, 3.7, 4.9, 1.0, 1.9, { frosted: true }),
  win('z', 4.4, 3.0, 3.6, 1.5, 1.9, { frosted: true }),
], {
  ceilings: [
    { rect: R(0.9, 4.4, 4.7, 6.3), slopeZ: { z0: Z(4.4), h0: 1.9, z1: Z(6.3), h1: 2.3 } },
    { rect: R(0, 6.3, 4.8, 9.0), h: 2.3 },
    { rect: R(4.7, 5.4, 4.8, 6.3), h: 2.3 },
  ],
  voids: [S],
  stairs: [],
  built: [
    { type: 'toilet', at: [X(3.35), Z(4.85)], facing: 'S' },
    { type: 'wicRail', rect: R(0.95, 4.45, 2.85, 6.25) },
    { type: 'stairRail', rect: R(4.66, 5.4, 6.2, 5.44) },
    { type: 'aircon', at: [X(0.0) + 0.2, Z(7.0)], facing: 'E', top: 2.27 },
  ],
  furniture: [
    { type: 'bed', size: 'double', at: [X(1.15), Z(7.65)], rot: Math.PI / 2 },
    { type: 'nightstand', at: [X(0.25), Z(6.6)] },
    { type: 'nightstand', at: [X(0.25), Z(8.7)] },
    { type: 'rug', rect: R(2.4, 6.8, 4.3, 8.6), color: '#cbc2b4' },
    { type: 'model', id: 'potted_plant_04', at: [X(4.5), Z(8.75)], scale: 0.75 },
    { type: 'model', id: 'standing_picture_frame_01', at: [X(0.25), Z(6.6)], y: 0.55, scale: 0.6, rot: Math.PI / 2 },
  ],
  lights: [[X(2.4), Z(7.6)], [X(4.25), Z(5.3)], [X(1.9), Z(5.3)]],
  views: [
    { name: '主寝室', eye: [X(3.6), Z(8.55)], look: [X(0.4), Z(6.7)] },
    { name: 'バルコニーへ', eye: [X(2.6), Z(7.4)], look: [X(5.8), Z(7.8)] },
    { name: 'WIC', eye: [X(1.8), Z(6.15)], look: [X(1.8), Z(4.6)] },
  ],
  portals: [{ at: [X(4.25), Z(4.65)], to: '2F', label: '2階へ', arrive: { eye: [X(4.25), Z(5.0)], look: [X(3.0), Z(8.4)] } }],
});

// balconies (engine draws decks + rails); rails on the listed outer edges
first.balconies = [];
second.balconies = [{ rect: R(5.8, 5.4, 6.7, 9.0), rails: ['E', 'S', { side: 'N', from: X(6.2), to: X(6.7) }], glass: true, dryingPole: true }];
third.balconies = [{ rect: R(4.8, 5.4, 5.9, 9.0), rails: ['E', 'S'], glass: true, dryingPole: true }];
for (const f of [first, second, third]) if (!f.ceilings) f.ceilings = f.footprint.map(rect => ({ rect, h: f.ceiling }));

export const FLOORS = [first, second, third];

// Exterior massing (world metres).
export const EXTERIOR = {
  width: X(6.7),
  garage: R(0.4, 0.3, 6.2, 3.35),
  porch: R(4.7, 5.4, 6.2, 6.8),
  front2F: Z(0),
  roofTop: LEVEL['3F'] + 2.3 + 0.45,
  // 2F parts not covered by 3F (sloped metal roof, low at the north edge)
  roof2F: [R(0.9, 0, 6.4, 3.35), R(0, 2.6, 0.9, 4.4), R(0.9, 3.35, 4.7, 4.4)],
  roof2Fslope: { zHigh: Z(4.4), zLow: Z(0) },
  roof3F: [R(0, 4.4, 4.8, 9.0), R(4.7, 3.35, 6.2, 5.4)],
  site: { west: X(-0.9), east: X(7.0), north: Z(0.0) - 0.05, south: X(0) * 0 + 0.75 },
  roads: { north: 6.0, east: 4.0 },
  center: [X(3.1), Z(4.5)],
  raw: { X, Z, R },
};

export function rectArea([x1, z1, x2, z2]) { return Math.abs((x2 - x1) * (z2 - z1)); }
export function roomArea(room) {
  return rectArea(room.rect) + (room.plus || []).reduce((s, r) => s + rectArea(r), 0) - (room.minus || []).reduce((s, r) => s + rectArea(r), 0);
}
