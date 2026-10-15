// Verifies the traced floor plan against the brochure figures.
// Fails CI when a room deviates more than the tolerance from its 帖 value
// or when floors do not stack (3F must sit on 2F, stairs must line up).
import { FLOORS, JO, roomArea, SCALE, EXTERIOR } from '../src/plan.js';

const TOL = 0.06;
let failed = false;
const rows = [];
for (const f of FLOORS) {
  for (const r of f.rooms) {
    const a = roomArea(r);
    const jo = a / JO;
    let status = '';
    if (r.jo) {
      const dev = (jo - r.jo) / r.jo;
      status = `${(dev * 100).toFixed(1)}%`;
      if (Math.abs(dev) > TOL) { failed = true; status += '  <-- out of tolerance'; }
    }
    rows.push(`${f.id}  ${r.name.padEnd(8, '　')} ${a.toFixed(2).padStart(6)} m²  ${jo.toFixed(2).padStart(5)}帖  ${r.jo ? `(図面 ${r.jo}帖) ` : ''}${status}`);
  }
}
console.log(`scale ${SCALE} m/px`);
console.log(rows.join('\n'));

const [f1, f2, f3] = FLOORS;
const stairX = f => [f.voids[0]?.[0], f.voids[0]?.[2]];
const s2 = f2.stairs[0].rect, s1 = f1.stairs[0].rect, v3 = f3.voids[0];
const near = (a, b, tol = 0.12) => Math.abs(a - b) <= tol;
const checks = [
  ['1F→2F stair column lines up', near(s1[0], s2[0]) && near(s1[2], s2[2])],
  ['2F→3F stair top lands in 3F stair void', near(s2[0], v3[0]) && s2[1] >= v3[1] - 0.25 && s2[1] <= v3[3]],
  ['3F footprint sits on 2F', f3.footprint[0][2] <= f2.footprint[0][2] + 0.05 && f3.footprint[0][1] >= f2.footprint[0][1] - 0.05],
  ['building width ≈ 4.2 m', near(EXTERIOR.width, 4.2, 0.1)],
];
for (const [name, ok] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failed = true; }
if (failed) { console.error('plan check failed'); process.exit(1); }
