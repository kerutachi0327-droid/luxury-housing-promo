// TYPE02 floor plan data.
//
// Source: official TYPE2 floor plan image (1F / 2F / 3F drawn side by side).
// Every number below is a pixel coordinate traced from that image, so the
// conversion to metres is a single documented step that anyone can re-check.
//
// Scale: the building is 4.5 modules wide (4.5 x 910 mm = 4.095 m between
// wall centres). That width is 353 px in the drawing, so 1 px = 0.0116 m.
// Cross-check: every room area below is compared with the brochure 帖 figure
// by tools/check-plan.mjs (run in CI). Tolerance: ±6 %.
//
// Axes: x = east (m, 0 = west outer face), z = south (m, 0 = rear outer face,
// negative = towards the road on the north side), y = up.

export const SCALE = 0.0116;
export const JO = 1.62; // m² per 帖 (不動産の表示に関する公正競争規約)

// Per-floor drawing origin: west outer face x, rear outer face y (px).
const ORIGIN = { '1F': [133, 1188], '2F': [778, 1186], '3F': [1380, 1190] };
export const LEVEL = { '1F': 0.35, '2F': 3.10, '3F': 5.95 }; // finished floor levels (m above road)
export const SLAB = 0.45; // ceiling-to-next-floor structure depth
const F1 = '1F', F2 = '2F', F3 = '3F';

const X = (f, px) => +((px - ORIGIN[f][0]) * SCALE).toFixed(3);
const Z = (f, py) => +((py - ORIGIN[f][1]) * SCALE).toFixed(3);
const R = (f, x1, y1, x2, y2) => [X(f, Math.min(x1, x2)), Z(f, Math.min(y1, y2)), X(f, Math.max(x1, x2)), Z(f, Math.max(y1, y2))];

// wall helper: axis aligned centre line from (x1,y1) to (x2,y2) px.
// openings: [from, to] measured in px along the wall's varying axis.
function W(f, x1, y1, x2, y2, opt = {}) {
  const vertical = x1 === x2;
  const conv = v => (vertical ? Z(f, v) : X(f, v));
  return {
    a: [X(f, x1), Z(f, y1)], b: [X(f, x2), Z(f, y2)],
    t: opt.t ?? 0.10, outside: opt.outside || null, h: opt.h ?? null,
    openings: (opt.openings || []).map(o => ({ ...o, from: conv(Math.min(o.at[0], o.at[1])), to: conv(Math.max(o.at[0], o.at[1])) })),
  };
}
const ext = (side, openings = [], extra = {}) => ({ t: 0.16, outside: side, openings, ...extra });
const door = (a, b, o = {}) => ({ at: [a, b], kind: 'door', sill: 0, head: 2.0, ...o });
const opening = (a, b, o = {}) => ({ at: [a, b], kind: 'opening', sill: 0, head: 2.0, ...o });
const win = (a, b, sill, head, o = {}) => ({ at: [a, b], kind: 'window', sill, head, ...o });

// ---------------------------------------------------------------- 1F
const first = {
  id: F1, label: '1階', level: LEVEL[F1], ceiling: 2.3,
  footprint: [R(F1, 137, 529, 490, 1142), R(F1, 137, 1142, 287, 1184)],
  // ceilings follow the CH values written on the plan; the toilet sits under
  // the stair so its ceiling follows the stair soffit (keep: not cut by the void)
  ceilings: [
    { rect: R(F1, 137, 529, 290, 755), h: 2.3 },
    { rect: R(F1, 212, 755, 290, 1030), h: 2.3 },
    { rect: R(F1, 137, 870, 212, 1030), h: 2.3 },
    { rect: R(F1, 219, 1030, 290, 1072), h: 2.3 },
    { rect: R(F1, 137, 755, 212, 807), h: 2.3, keep: true },
    { rect: R(F1, 137, 807, 212, 870), slopeZ: { z0: Z(F1, 807), h0: 2.3, z1: Z(F1, 870), h1: 1.6 }, keep: true },
    { rect: R(F1, 290, 529, 490, 876), h: 2.3 },
    { rect: R(F1, 290, 876, 490, 1075), h: 2.25 },
    { rect: R(F1, 219, 1072, 300, 1142), h: 2.15 },
    { rect: R(F1, 300, 1075, 490, 1142), h: 2.2 },
    { rect: R(F1, 137, 1030, 219, 1184), h: 2.15 },
    { rect: R(F1, 219, 1142, 287, 1184), h: 2.15 },
  ],
  walls: [
    W(F1, 137, 599, 137, 1184, ext('W', [win(775, 797, 1.25, 1.65, { frosted: true })])),
    W(F1, 490, 529, 490, 1142, ext('E', [win(608, 758, 0.85, 2.0, { grille: true }), win(992, 1102, 0.85, 2.0, { grille: true })])),
    W(F1, 287, 1142, 490, 1142, ext('S', [win(330, 420, 0.9, 2.0)])),
    W(F1, 137, 1184, 287, 1184, ext('S')),
    W(F1, 287, 1142, 287, 1184, ext('E')),
    W(F1, 290, 529, 490, 529, ext('N')),
    W(F1, 137, 599, 290, 599, ext('N', [door(175, 252, { kind: 'entry', head: 2.15 })])),
    W(F1, 290, 529, 290, 599, ext('W')),
    // interior
    W(F1, 290, 599, 290, 1075, { openings: [door(808, 866, { hinge: 'to' }), door(884, 942)] }),
    W(F1, 219, 1072, 290, 1072),
    W(F1, 290, 876, 490, 876),
    W(F1, 137, 755, 212, 755),
    W(F1, 212, 755, 212, 870, { openings: [door(765, 830, { open: 0 })] }),
    W(F1, 137, 870, 219, 870),
    W(F1, 219, 870, 219, 961, { t: 0.06, h: 1.0 }),
    W(F1, 137, 1030, 219, 1030),
    W(F1, 219, 1030, 219, 1184, { openings: [door(1080, 1135, { head: 1.9, open: 0 })] }),
  ],
  rooms: [
    { name: '玄関', rect: R(F1, 137, 599, 290, 680), floor: 'tileGenkan', drop: 0.15 },
    { name: 'ホール', rect: R(F1, 177, 680, 290, 1072) },
    { name: 'サービスルーム', jo: 5.1, rect: R(F1, 290, 529, 490, 876), minus: [R(F1, 378, 815, 468, 866)], ceiling: 2.3 },
    { name: 'サービスルーム', jo: 5.2, rect: R(F1, 290, 876, 490, 1075), plus: [R(F1, 219, 1075, 490, 1142), R(F1, 233, 1142, 287, 1172)], ceiling: 2.25 },
    { name: 'トイレ', rect: R(F1, 137, 755, 212, 870), floor: 'cushionFloor' },
    { name: 'クローゼット', rect: R(F1, 137, 1030, 219, 1184) },
  ],
  voids: [],
  stairs: [{ rect: R(F1, 140, 790, 219, 1024), dir: 'north', from: 0, to: LEVEL['2F'] - LEVEL[F1], steps: 15}],
  built: [
    { type: 'shoeCabinet', rect: R(F1, 137, 605, 177, 745), h: 2.0, facing: 'E' },
    { type: 'closet', rect: R(F1, 378, 815, 468, 866), h: 2.3, facing: 'N' },
    { type: 'closet', rect: R(F1, 137, 1035, 212, 1184), h: 2.15, facing: 'E', hidden: true },
    { type: 'shelf', rect: R(F1, 238, 1145, 284, 1174), h: 1.8 },
    { type: 'toilet', at: [X(F1, 175), Z(F1, 838)], facing: 'N' },
    { type: 'step', rect: R(F1, 137, 676, 290, 684) },
    { type: 'aircon', at: [X(F1, 290) + 0.17, Z(F1, 600)], facing: 'E', top: 2.25 },
  ],
  furniture: [
    { type: 'bed', size: 'semidouble', at: [X(F1, 390), Z(F1, 640)], rot: 0 },
    { type: 'nightstand', at: [X(F1, 455), Z(F1, 545)] },
    { type: 'rug', rect: R(F1, 310, 690, 470, 790), color: '#cfc7ba' },
    { type: 'desk', at: [X(F1, 455), Z(F1, 1047)], rot: -Math.PI / 2, w: 1.1 },
    { type: 'chair', at: [X(F1, 415), Z(F1, 1047)], rot: -Math.PI / 2 },
    { type: 'sofa', at: [X(F1, 335), Z(F1, 1012)], rot: -Math.PI / 2, w: 1.6, color: '#bfb6a8' },
    { type: 'model', id: 'potted_plant_02', at: [X(F1, 470), Z(F1, 1160)], scale: 0.8 },
    { type: 'model', id: 'standing_picture_frame_01', at: [X(F1, 455), Z(F1, 545)], y: 0.55, scale: 0.6, rot: Math.PI },
  ],
  lights: [[X(F1, 390), Z(F1, 700)], [X(F1, 390), Z(F1, 1030)], [X(F1, 240), Z(F1, 800)]],
  views: [
    { name: '玄関・ホール', eye: [X(F1, 240), Z(F1, 700)], look: [X(F1, 240), Z(F1, 950)] },
    { name: 'サービスルーム5.1帖', eye: [X(F1, 330), Z(F1, 840)], look: [X(F1, 430), Z(F1, 620)] },
    { name: 'サービスルーム5.2帖', eye: [X(F1, 330), Z(F1, 905)], look: [X(F1, 460), Z(F1, 1120)] },
  ],
  portals: [{ at: [X(F1, 255), Z(F1, 1010)], to: '2F', label: '2階へ', arrive: { eye: [X(F2, 902), Z(F2, 820)], look: [X(F2, 950), Z(F2, 400)] } }],
};

// ---------------------------------------------------------------- 2F
const second = {
  id: F2, label: '2階', level: LEVEL[F2], ceiling: 2.4,
  footprint: [R(F2, 782, 195, 1136, 1182)],
  // east strip under the 3F setback: sloped ceiling (勾配天井)
  ceilings: [
    { rect: R(F2, 782, 195, 1080, 654), h: 2.4 },
    { rect: R(F2, 1080, 195, 1136, 654), slope: { x0: X(F2, 1080), h0: 2.4, x1: X(F2, 1136), h1: 2.15 } },
    { rect: R(F2, 782, 654, 941, 1182), h: 2.4 },
    { rect: R(F2, 941, 654, 1047, 948), h: 2.36 },
    { rect: R(F2, 1047, 654, 1136, 860), h: 2.05 },
    { rect: R(F2, 1047, 860, 1136, 948), h: 2.15 },
    { rect: R(F2, 941, 948, 1136, 1182), h: 2.4 },
  ],
  walls: [
    W(F2, 782, 195, 782, 1182, ext('W', [win(290, 434, 0.35, 2.2, { fix: true }), win(784, 806, 1.4, 1.9), win(1062, 1105, 1.3, 1.9, { frosted: true })])),
    W(F2, 1136, 195, 1136, 1182, ext('E', [win(306, 349, 1.05, 2.0), win(541, 643, 0.85, 2.0)])),
    W(F2, 782, 195, 1136, 195, ext('N', [win(805, 946, 0.8, 2.05)])),
    W(F2, 782, 1182, 1136, 1182, ext('S')),
    // interior
    W(F2, 782, 520, 866, 520),
    W(F2, 866, 520, 866, 760, { t: 0.05 }),
    W(F2, 782, 760, 866, 760, { t: 0.06, h: 1.0 }),
    W(F2, 866, 790, 866, 960, { t: 0.06, h: 1.0 }),
    W(F2, 1061, 654, 1136, 654),
    W(F2, 941, 787, 941, 1182, { openings: [door(955, 1008)] }),
    W(F2, 782, 1030, 941, 1030),
    W(F2, 941, 948, 1136, 948),
    W(F2, 981, 1030, 981, 1182, { openings: [door(1040, 1100, { kind: 'glassDoor', open: 0 })] }),
  ],
  rooms: [
    { name: 'LDK', jo: 20.1, rect: R(F2, 782, 195, 1136, 948), minus: [R(F2, 782, 520, 866, 760), R(F2, 782, 760, 866, 948)], ceiling: 2.4 },
    { name: '洗面室', rect: R(F2, 941, 948, 1136, 1182), floor: 'cushionFloor' },
    { name: '浴室', rect: R(F2, 782, 1030, 981, 1182), floor: 'tileBath', wall: 'bathPanel' },
  ],
  voids: [R(F2, 786, 790, 862, 1030)],
  stairs: [{ rect: R(F2, 786, 790, 862, 1028), dir: 'north', from: 0, to: LEVEL['3F'] - LEVEL[F2], steps: 15 }],
  built: [
    { type: 'tallStorage', rect: R(F2, 787, 538, 859, 636), h: 2.2, facing: 'E' },
    { type: 'tallStorage', rect: R(F2, 787, 640, 859, 736), h: 2.2, facing: 'E' },
    { type: 'tallStorage', rect: R(F2, 1072, 447, 1131, 493), h: 2.2, facing: 'W' },
    { type: 'counter', rect: R(F2, 1088, 205, 1131, 440), h: 0.72, material: 'oak' },
    { type: 'kitchenIsland', rect: R(F2, 941, 661, 1131, 733), sink: [X(F2, 990), Z(F2, 697)] },
    { type: 'kitchenRun', rect: R(F2, 1077, 733, 1131, 845), cooktop: [X(F2, 1104), Z(F2, 780)], hood: true },
    { type: 'fridge', rect: R(F2, 1063, 868, 1129, 940), h: 1.82 },
    { type: 'cupboard', rect: R(F2, 946, 792, 989, 940), h: 0.86, upper: true },
    { type: 'vanity', rect: R(F2, 1069, 957, 1131, 1058), mirror: true },
    { type: 'washer', rect: R(F2, 988, 1113, 1051, 1172) },
    { type: 'shelf', rect: R(F2, 1069, 1065, 1131, 1097), h: 1.8 },
    { type: 'bathtub', rect: R(F2, 787, 1036, 866, 1178) },
    { type: 'niche', at: [X(F2, 866), Z(F2, 848)], w: 0.45 },
    { type: 'aircon', at: [X(F2, 782) + 0.2, Z(F2, 478)], facing: 'E', top: 2.36 },
  ],
  furniture: [
    { type: 'rug', rect: R(F2, 815, 255, 1035, 420), color: '#d8d0c3' },
    { type: 'sofa', at: [X(F2, 925), Z(F2, 445)], rot: 0, w: 2.0, color: '#d6d0c6', chaise: true },
    { type: 'coffeeTable', at: [X(F2, 925), Z(F2, 330)], round: true },
    { type: 'model', id: 'modern_arm_chair_01', at: [X(F2, 830), Z(F2, 300)], rot: Math.PI / 2 + 0.35 },
    { type: 'model', id: 'potted_plant_04', at: [X(F2, 808), Z(F2, 222)], scale: 1.0 },
    { type: 'model', id: 'modern_wooden_cabinet', at: [X(F2, 990), Z(F2, 215)], rot: 0, scale: 0.9 },
    { type: 'model', id: 'ceramic_vase_01', at: [X(F2, 1010), Z(F2, 215)], y: 0.68, scale: 0.7 },
    { type: 'stool', at: [X(F2, 1065), Z(F2, 270)] },
    { type: 'stool', at: [X(F2, 1065), Z(F2, 370)] },
    { type: 'diningTable', at: [X(F2, 975), Z(F2, 600)], rot: 0, w: 1.4, d: 0.8 },
    { type: 'diningChair', at: [X(F2, 940), Z(F2, 560)], rot: 0 },
    { type: 'diningChair', at: [X(F2, 1010), Z(F2, 560)], rot: 0 },
    { type: 'diningChair', at: [X(F2, 940), Z(F2, 640)], rot: Math.PI },
    { type: 'diningChair', at: [X(F2, 1010), Z(F2, 640)], rot: Math.PI },
    { type: 'pendant', at: [X(F2, 975), Z(F2, 600)], model: 'modern_ceiling_lamp_01' },
    { type: 'model', id: 'potted_plant_02', at: [X(F2, 1110), Z(F2, 622)], scale: 0.75 },
  ],
  lights: [[X(F2, 950), Z(F2, 330)], [X(F2, 975), Z(F2, 600)], [X(F2, 1030), Z(F2, 820)], [X(F2, 1040), Z(F2, 1050)]],
  views: [
    { name: 'LDK入口', eye: [X(F2, 905), Z(F2, 765)], look: [X(F2, 1010), Z(F2, 300)] },
    { name: 'リビング', eye: [X(F2, 1010), Z(F2, 232)], look: [X(F2, 900), Z(F2, 700)] },
    { name: 'ダイニング', eye: [X(F2, 895), Z(F2, 545)], look: [X(F2, 1060), Z(F2, 720)] },
    { name: 'キッチン', eye: [X(F2, 1025), Z(F2, 800)], look: [X(F2, 950), Z(F2, 350)] },
    { name: '洗面室', eye: [X(F2, 1020), Z(F2, 1000)], look: [X(F2, 1100), Z(F2, 1040)] },
  ],
  portals: [
    { at: [X(F2, 902), Z(F2, 1005)], to: '3F', label: '3階へ', arrive: { eye: [X(F3, 1420), Z(F3, 700)], look: [X(F3, 1420), Z(F3, 450)] } },
    { at: [X(F2, 902), Z(F2, 770)], to: '1F', label: '1階へ', arrive: { eye: [X(F1, 250), Z(F1, 980)], look: [X(F1, 250), Z(F1, 700)] } },
  ],
};

// ---------------------------------------------------------------- 3F
const third = {
  id: F3, label: '3階', level: LEVEL[F3], ceiling: 2.3,
  footprint: [R(F3, 1384, 281, 1659, 1108)],
  ceilings: [
    { rect: R(F3, 1384, 281, 1561, 1108), h: 2.3 },
    { rect: R(F3, 1561, 281, 1659, 564), slope: { x0: X(F3, 1561), h0: 2.3, x1: X(F3, 1659), h1: 1.65 } },
    { rect: R(F3, 1561, 564, 1659, 756), slope: { x0: X(F3, 1561), h0: 2.3, x1: X(F3, 1659), h1: 1.5 } },
    { rect: R(F3, 1561, 756, 1659, 1108), slope: { x0: X(F3, 1561), h0: 2.3, x1: X(F3, 1659), h1: 1.45 } },
  ],

  balconies: [
    { rect: R(F3, 1384, 183, 1663, 277), rail: 'N', glass: true },
    { rect: R(F3, 1384, 1112, 1663, 1190), rail: 'S', glass: false, dryingPole: true },
  ],
  walls: [
    W(F3, 1384, 281, 1384, 1108, ext('W', [win(304, 363, 1.0, 1.8), win(697, 713, 1.25, 1.75, { frosted: true }), win(793, 814, 1.3, 1.8)])),
    W(F3, 1659, 281, 1659, 1108, ext('E', [win(694, 729, 1.0, 1.38, { frosted: true })], { h: 1.7 })),
    W(F3, 1384, 281, 1659, 281, ext('N', [win(1413, 1552, 0.0, 2.0, { slider: true })])),
    W(F3, 1384, 1108, 1659, 1108, ext('S', [win(1453, 1552, 0.0, 2.0, { slider: true })])),
    // interior
    W(F3, 1384, 641, 1456, 641, { openings: [door(1395, 1450, { swing: -1 })] }),
    W(F3, 1456, 564, 1456, 686),
    W(F3, 1456, 564, 1659, 564, { openings: [opening(1472, 1531)] }),
    W(F3, 1456, 686, 1659, 686),
    W(F3, 1555, 640, 1555, 686, { t: 0.06 }),
    W(F3, 1544, 686, 1544, 756, { openings: [door(695, 750, { head: 1.95, open: 0 })] }),
    W(F3, 1544, 756, 1659, 756),
    W(F3, 1566, 756, 1566, 831),
    W(F3, 1463, 831, 1566, 831, { openings: [door(1470, 1528)] }),
    W(F3, 1463, 830, 1463, 997, { t: 0.06 }),
    W(F3, 1384, 993, 1463, 993),
    W(F3, 1440, 997, 1440, 1108, { openings: [door(1000, 1100, { kind: 'bifold', head: 2.0 })] }),
    W(F3, 1384, 760, 1459, 760, { t: 0.05, h: 1.0 }),
  ],
  rooms: [
    { name: '主寝室', jo: 7.2, rect: R(F3, 1384, 281, 1659, 564), plus: [R(F3, 1384, 564, 1456, 641)], ceiling: 2.3 },
    { name: 'WIC', rect: R(F3, 1456, 564, 1659, 686), ceiling: 2.3 },
    { name: 'ホール', rect: R(F3, 1384, 641, 1544, 760), plus: [R(F3, 1463, 760, 1566, 831)] },
    { name: 'トイレ', rect: R(F3, 1544, 686, 1659, 756), floor: 'cushionFloor' },
    { name: '洋室1', jo: 5.4, rect: R(F3, 1463, 831, 1659, 1108), plus: [R(F3, 1566, 756, 1659, 831), R(F3, 1440, 997, 1463, 1108)], minus: [R(F3, 1544, 767, 1566, 831)], ceiling: 2.3 },
    { name: 'クローゼット', rect: R(F3, 1388, 997, 1440, 1104) },
  ],
  voids: [R(F3, 1388, 760, 1459, 990)],
  stairs: [],
  built: [
    { type: 'toilet', at: [X(F3, 1625), Z(F3, 721)], facing: 'W' },
    { type: 'shelf', rect: R(F3, 1546, 767, 1566, 831), h: 1.8 },
    { type: 'closet', rect: R(F3, 1388, 997, 1438, 1104), h: 2.0, facing: 'E', hidden: true },
    { type: 'wicRail', rect: R(F3, 1460, 568, 1655, 682) },
    { type: 'stairRail', rect: R(F3, 1459, 760, 1463, 990) },
    { type: 'aircon', at: [X(F3, 1384) + 0.2, Z(F3, 560)], facing: 'E', top: 2.27 },
    { type: 'aircon', at: [X(F3, 1463) + 0.17, Z(F3, 930)], facing: 'E', top: 2.27 },
  ],
  furniture: [
    { type: 'bed', size: 'double', at: [X(F3, 1384) + 1.08, Z(F3, 430)], rot: Math.PI / 2 },
    { type: 'nightstand', at: [X(F3, 1405), Z(F3, 330)] },
    { type: 'nightstand', at: [X(F3, 1405), Z(F3, 530)] },
    { type: 'rug', rect: R(F3, 1555, 330, 1640, 530), color: '#cbc2b4' },
    { type: 'model', id: 'potted_plant_04', at: [X(F3, 1640), Z(F3, 300)], scale: 0.75 },
    { type: 'bed', size: 'single', at: [X(F3, 1659) - 1.08, Z(F3, 1060)], rot: Math.PI / 2 },
    { type: 'desk', at: [X(F3, 1463) + 0.33, Z(F3, 935)], rot: Math.PI / 2, w: 1.0 },
    { type: 'chair', at: [X(F3, 1463) + 0.82, Z(F3, 935)], rot: Math.PI / 2 },
    { type: 'model', id: 'standing_picture_frame_01', at: [X(F3, 1405), Z(F3, 530)], y: 0.55, scale: 0.6, rot: Math.PI / 2 },
  ],
  lights: [[X(F3, 1480), Z(F3, 420)], [X(F3, 1430), Z(F3, 700)], [X(F3, 1530), Z(F3, 960)]],
  views: [
    { name: 'ホール', eye: [X(F3, 1500), Z(F3, 720)], look: [X(F3, 1420), Z(F3, 600)] },
    { name: '主寝室7.2帖', eye: [X(F3, 1420), Z(F3, 600)], look: [X(F3, 1550), Z(F3, 300)] },
    { name: '洋室5.4帖', eye: [X(F3, 1560), Z(F3, 875)], look: [X(F3, 1600), Z(F3, 1080)] },
    { name: 'WIC', eye: [X(F3, 1515), Z(F3, 652)], look: [X(F3, 1620), Z(F3, 600)] },
  ],
  portals: [{ at: [X(F3, 1500), Z(F3, 745)], to: '2F', label: '2階へ', arrive: { eye: [X(F2, 902), Z(F2, 985)], look: [X(F2, 902), Z(F2, 700)] } }],
};

export const FLOORS = [first, second, third];

// Exterior massing (metres, same axes).
export const EXTERIOR = {
  width: X(F2, 1140),
  garage: R(F1, 133, 276, 494, 529),
  porch: R(F1, 157, 482, 290, 599),
  front2F: Z(F2, 191),
  front3F: Z(F3, 277),
  width3F: X(F3, 1663),
  rear: 0,
  roofTop: LEVEL['3F'] + 2.3 + 0.55,
  site: { west: -0.55, east: X(F2, 1140) + 0.5, north: Z(F1, 30), south: 0.75 },
};

// Utility used by the checker and by the plan labels.
export function rectArea([x1, z1, x2, z2]) { return Math.abs((x2 - x1) * (z2 - z1)); }
export function roomArea(room) {
  return rectArea(room.rect) + (room.plus || []).reduce((s, r) => s + rectArea(r), 0) - (room.minus || []).reduce((s, r) => s + rectArea(r), 0);
}
