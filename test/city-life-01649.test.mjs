// 0.16.49: crashes push cars, carports collapse, people cross only at zebras, parking bays, downtown towers, new cars
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVehicles, CAR_HALF, VEHICLE_SPAWNS } from '../shared/vehicles.js';
import { createCivilians } from '../shared/civilians.js';
import { CITY } from '../shared/city.js';
const src = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('ramming a parked car shoves it a few metres; both cars take damage; you keep some speed', () => {
  const map = { boxes: Object.assign([], { ramps: [] }), ramps: [], bounds: 400 };
  const driver = { id: 'p1', alive: true, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, stance: 0 };
  const v = createVehicles(map, { send: () => {}, broadcast: () => {}, playerById: (id) => (id === 'p1' ? driver : null) });
  const [a, b, ...rest] = v._cars; for (const o of rest) { o.p = [9999, 0, 9999]; o.box = { min: [9999, 0, 9999], max: [9999, 0, 9999] }; }
  a.p = [0, 0, 40]; a.yaw = 0; driver.p = a.p.slice(); b.p = [0, 0, 0]; b.yaw = Math.PI / 2; b.box = { min: [-CAR_HALF.z, 0, -CAR_HALF.x], max: [CAR_HALF.z, 1.5, CAR_HALF.x] };
  v.interact(driver); let speedAtHit = null; const b0 = b.p.slice();
  for (let i = 0; i < 150; i++) { v.input(driver, i < 60 ? 1 : 0, 0); v.tick(1 / 30); if (speedAtHit === null && Math.hypot(b.p[0] - b0[0], b.p[2] - b0[2]) > 0.05) speedAtHit = a.speed; }
  const moved = Math.hypot(b.p[0] - b0[0], b.p[2] - b0[2]);
  assert.ok(moved > 3 && moved < 20, `shoved ${moved}`);
  assert.ok(a.hp < 1000 && b.hp < 1000);
});
test('carports: posts carry the carport index; the client knocks the whole carport down', () => {
  assert.equal(CITY.boxes.street.carports.length, 16);
  assert.equal(CITY.boxes.filter((b) => b.carport !== undefined && b.breakable).length, 32);
  assert.match(src('public/client.js'), /else if \(b\.carport !== undefined\) knockCarport\(b\.carport, dx, dz\);/);
});
test('civilians never walk into a roundabout or onto the road, and they do use the zebra crossings', () => {
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const civ = createCivilians(CITY, { count: 14, rnd }); let inRb = 0, crosses = 0, onRoad = 0; const was = new Map();
  for (let i = 0; i < 30 * 300; i++) { civ.tick(1 / 30, [], []);
    for (const c of civ.list) { if (!c.alive) continue;
      if (CITY.roundabouts.some((r) => Math.hypot(c.p[0] - r.p[0], c.p[2] - r.p[2]) < 13)) inRb++;
      if (([-38, 38].some((k) => Math.abs(c.p[0] - k) < 5) || [-38, 38].some((k) => Math.abs(c.p[2] - k) < 5)) && !c.cross) onRoad++;
      if (c.cross && !was.get(c.id)) crosses++; was.set(c.id, !!c.cross); } }
  assert.equal(inRb, 0); assert.equal(onRoad, 0); assert.ok(crosses > 10, `crosses ${crosses}`);
});
test('kerbside cars stand in painted bays, clear of the zebra crossings', () => {
  assert.equal(CITY.parkingBays.length, 16);
  for (const s of VEHICLE_SPAWNS.slice(0, 8)) assert.ok(CITY.parkingBays.some((b) => Math.hypot(b.x - s[0], b.z - s[2]) < 0.5), `bay for ${s}`);
  for (const b of CITY.parkingBays) for (const c of CITY.crossings) { const along = c.axis === 'z' ? Math.abs(b.z - c.z) : Math.abs(b.x - c.x), across = c.axis === 'z' ? Math.abs(b.x - c.x) : Math.abs(b.z - c.z); assert.ok(!(across < 6.2 && along < 8), 'bay on a crossing'); }
});
test('downtown towers are solid, and a roof is never a dead end', () => {
  const t = CITY.edgeBuildings.filter((b) => b.downtown); assert.equal(t.length, 2);
  for (const b of t) assert.ok(b.max[1] > 45 && Math.max(Math.abs(b.min[0]), Math.abs(b.max[0])) < 31);
  assert.equal(CITY.boxes.filter((b) => b.noRoof).length, 2);
  assert.match(src('shared/game.js'), /landed on a downtown tower roof/);
});
test('everyday cars: six compressed models, painted in real colours, credited', () => {
  for (const b of ['sedan', 'hatchback', 'suv', 'minivan', 'compact', 'wagon']) {
    const buf = fs.readFileSync(new URL(`../public/models/vehicles/cmp_${b}.glb`, import.meta.url));
    assert.ok(buf.length < 200000); assert.match(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString(), /EXT_meshopt_compression/);
    assert.match(src('android/entry.js'), new RegExp(`vehicles/cmp_${b}\\.glb`));
  }
  assert.match(src('public/models/CREDITS.md'), /Comrade1280 \| CC-BY 4\.0/);
  assert.match(src('public/vehicle-visuals.js'), /sedan:'cmp_sedan'/);
});
test('run over: flat pose and a blood pool; broken trees leave a stump', () => {
  assert.match(src('public/pedestrians.js'), /BLOOD_MAT/);
  assert.match(src('public/nature.js'), /the trunk snaps ~1 m up/);
});
