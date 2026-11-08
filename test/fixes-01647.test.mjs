// 0.16.47 fixes from play reports
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVehicles } from '../shared/vehicles.js';
import { CITY } from '../shared/city.js';
import { PARACHUTE } from '../shared/physics.js';
const src = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('cars are set on the ground from their real vertices (no floating Concept)', () => {
  const s = src('public/vehicle-visuals.js');
  assert.equal((s.match(/setFromObject\(g,true\)/g) || []).length, 3);
});
test('benches: no extra half turn, so sidewalk seats face the road and park seats face the fountain', () => {
  assert.match(src('public/street-visuals.js'), /city\.benches\.map\(\(b\) => \(\{ p: b\.p, yaw: b\.yaw \}\)\)/);
});
test('a car driving off the lawn crosses the sidewalk; fountains and statues in roundabouts do not stop it', () => {
  const map = { ...CITY, boxes: Object.assign(CITY.boxes.filter((b) => !b.vehicle), { ramps: CITY.boxes.ramps || [] }) };
  let stuck = 0, total = 0;
  for (let k = 0; k < 60; k++) {
    const w = CITY.walkways[k % CITY.walkways.length], alongZ = Math.abs(w.a[0] - w.b[0]) < 0.01, t = 0.2 + ((k * 0.37) % 0.6);
    const px = alongZ ? w.a[0] : w.a[0] + (w.b[0] - w.a[0]) * t, pz = alongZ ? w.a[2] + (w.b[2] - w.a[2]) * t : w.a[2];
    for (const side of [-1, 1]) {
      const driver = { id: 'p1', alive: true, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, stance: 0 };
      const v = createVehicles(map, { send: () => {}, broadcast: () => {}, playerById: (id) => (id === 'p1' ? driver : null) });
      const car = v._cars[0]; for (const o of v._cars.slice(1)) { o.p = [9999, 0, 9999]; o.box = { min: [9999, 0, 9999], max: [9999, 0, 9999] }; }
      const start = alongZ ? [px + side * 14, 0, pz] : [px, 0, pz + side * 14];
      // a drive aimed straight at a house (or its carport) is meant to stop: leave those out
      const end = alongZ ? [px - side * 8, 0, pz] : [px, 0, pz - side * 8];
      if ((CITY.buildings || []).some((b) => Math.min(start[0], end[0]) - 9 < b.center[0] + 12 && Math.max(start[0], end[0]) + 9 > b.center[0] - 7 && Math.min(start[2], end[2]) - 8 < b.center[2] && Math.max(start[2], end[2]) + 8 > b.center[2])) continue;
      car.p = start.slice(); driver.p = start.slice(); car.yaw = Math.atan2(-(px - start[0]), -(pz - start[2]));
      if (!v.interact(driver)) continue;
      let crossed = false;
      for (let i = 0; i < 150 && !crossed; i++) { v.input(driver, 1, 0); v.tick(1 / 30); crossed = Math.hypot(car.p[0] - start[0], car.p[2] - start[2]) > 20; }
      total++; if (!crossed) stuck++;
    }
  }
  assert.ok(total > 60 && stuck / total < 0.03, `${stuck}/${total} stuck`); // the rest drive into house walls
});
test('car camera: mouse up looks up; parachute gives time to choose', () => {
  const c = src('public/client.js');
  assert.match(c, /camera\.rotation\.set\(lp\*0\.8,ly,0,'YXZ'\)/);
  assert.match(c, /Math\.max\(0\.9,3\.6-Math\.sin\(lp\)\*5\)/);
  assert.ok(PARACHUTE.height >= 300 && PARACHUTE.freefall.terminal <= 32 && PARACHUTE.autoOpen >= 80);
});
test('mouse: free-mouse fallback turns without a button and every click retries the real lock', () => {
  const c = src('public/client.js');
  assert.match(c, /if \(!aiming \|\| gamePaused\) return;/);
  assert.match(c, /if \(locked && freeMouse\) \{ freeMouse = false;/);
});
