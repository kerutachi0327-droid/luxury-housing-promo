// Verifies the traced TYPE06 plan against the brochure figures.
// Fails when a room deviates more than the tolerance from its 帖 value, when a
// floor total deviates from the brochure floor area, or when floors do not stack.
import { FLOORS, JO, roomArea, rectArea } from '../src/plan.js';

const TOL = 0.08, FLOOR_TOL = 0.08;
const BROCHURE = { '1F': 49.27 - 18.21, '2F': 49.68, '3F': 21.94 }; // 1F without the garage (18.21 m²)
let failed = false;
for (const f of FLOORS) {
  for (const r of f.rooms) {
    const inc = (r.joIncludes || []).map(n => f.rooms.find(x => x.name === n)).filter(Boolean);
    const a = roomArea(r) + inc.reduce((s, x) => s + roomArea(x), 0);
    let status = '';
    if (r.jo) { const dev = (a / JO - r.jo) / r.jo; status = `${(dev * 100).toFixed(1)}%`; if (Math.abs(dev) > TOL) { failed = true; status += '  <-- out of tolerance'; } }
    console.log(`${f.id}  ${r.name.padEnd(8, '　')} ${a.toFixed(2).padStart(6)} m²  ${(a / JO).toFixed(2).padStart(5)}帖 ${r.jo ? `(図面 ${r.jo}帖${inc.length ? '・' + inc.map(x => x.name).join('') + '含む' : ''}) ${status}` : ''}`);
  }
  const total = f.footprint.reduce((s, r) => s + rectArea(r), 0);
  const dev = (total - BROCHURE[f.id]) / BROCHURE[f.id];
  console.log(`${f.id}  合計 ${total.toFixed(2)} m² (図面 ${BROCHURE[f.id].toFixed(2)}) ${(dev * 100).toFixed(1)}%${Math.abs(dev) > FLOOR_TOL ? '  <-- out of tolerance' : ''}`);
  if (Math.abs(dev) > FLOOR_TOL) failed = true;
}
const box = rs => [Math.min(...rs.map(r => r[0])), Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[2])), Math.max(...rs.map(r => r[3]))];
const sv = FLOORS.map(f => f.voids[0] || (f.stairs.length ? box(f.stairs.map(s => s.rect)) : null)).filter(Boolean);
const ok = sv.every(v => Math.abs(v[0] - sv[0][0]) < 0.12 && Math.abs(v[2] - sv[0][2]) < 0.12);
console.log(`${ok ? 'ok  ' : 'FAIL'} stair box lines up on every floor`); if (!ok) failed = true;
if (failed) { console.error('plan check failed'); process.exit(1); }
