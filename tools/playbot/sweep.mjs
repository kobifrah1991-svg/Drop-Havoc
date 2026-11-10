// Headless stuck sweep. Walks and drives the city (and the neon warehouse) without a browser.
// A spot is stuck when input is held and the body moves less than 0.25 m over 0.8 s, or the
// centre is inside solid geometry. Usage: node tools/playbot/sweep.mjs
import { step, collides, PLAYER } from '../../shared/physics.js';
import { CITY } from '../../shared/city.js';
import { NEON_MAP } from '../../shared/map.js';
import { createVehicles, carDims } from '../../shared/vehicles.js';

const PASS = 0.9; // 1.25 x player width (0.8 m -> 1.0 m; owner asked ~0.90 m)
const stuck = [];

function walk(map, label, spots) {
  const boxes = map.boxes;
  for (const [x, z] of spots) {
    const s = { p: [x, 0.05, z], v: [0, 0, 0], onGround: true, stance: 0 };
    if (collides(s.p[0], s.p[1] + 0.05, s.p[2], boxes, 1.6, 0.08)) continue; // start inside a wall
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      s.p = [x, 0.05, z]; s.v = [0, 0, 0]; s.onGround = true;
      const start = s.p.slice();
      for (let i = 0; i < 48; i++) step(s, { f: 1, yaw }, 1 / 60, boxes);
      const moved = Math.hypot(s.p[0] - start[0], s.p[2] - start[2]);
      const embedded = collides(s.p[0], s.p[1] + 0.05, s.p[2], boxes, 1.5, 0.08);
      if (moved < 0.25 || embedded) stuck.push({ map: label, kind: 'foot', x: +x.toFixed(1), z: +z.toFixed(1), yaw: +yaw.toFixed(2), moved: +moved.toFixed(2), embedded: !!embedded, end: s.p.map((n) => +n.toFixed(2)) });
    }
  }
}

function grid(map, stepM) {
  const B = map.bounds || 40;
  const spots = [];
  for (let x = -B + 4; x <= B - 4; x += stepM) for (let z = -B + 4; z <= B - 4; z += stepM) spots.push([x, z]);
  return spots;
}

// Passages: sample gaps between nearby boxes that a person would try to walk through.
function passages(map, label) {
  const boxes = [...map.boxes].filter((b) => b.max[1] > 0.4 && !b.vehicle && b.max[0] - b.min[0] < 40);
  let narrow = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const dx = Math.max(0, Math.max(a.min[0], b.min[0]) - Math.min(a.max[0], b.max[0]));
    const dz = Math.max(0, Math.max(a.min[2], b.min[2]) - Math.min(a.max[2], b.max[2]));
    const gap = Math.hypot(dx, dz);
    if (gap <= 0 || gap >= PASS) continue;
    const overlapY = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
    if (overlapY < 0.8) continue;
    narrow++;
    if (narrow <= 12) stuck.push({ map: label, kind: 'narrow', gap: +gap.toFixed(2), a: a.min.map((n) => +n.toFixed(1)), b: b.min.map((n) => +n.toFixed(1)) });
  }
  return narrow;
}

function drive(map) {
  const vehicles = createVehicles(map, { send() {}, broadcast() {}, playerById: () => ({ alive: true, p: [0, 0, 0] }) });
  const car = vehicles._cars[0];
  if (!car) return;
  const player = { alive: true, p: car.p, yaw: car.yaw, id: 'bot' };
  vehicles._cars.forEach((c) => { /* keep */ });
  const host = { alive: true, p: car.p.slice(), yaw: car.yaw };
  // rebind by driving the first car through its own input
  const fake = createVehicles(map, {
    send() {}, broadcast() {},
    playerById(id) { return id === 'bot' ? host : null; },
  });
  const c0 = fake._cars.find((c) => Math.hypot(c.p[0] - car.p[0], c.p[2] - car.p[2]) < 1) || fake._cars[0];
  host.p = c0.p; c0.driver = 'bot';
  const before = c0.p.slice();
  for (let i = 0; i < 90; i++) { fake.input(host, 1, 0, 0); fake.tick(1 / 30); host.p = c0.p; }
  const moved = Math.hypot(c0.p[0] - before[0], c0.p[2] - before[2]);
  if (moved < 1) stuck.push({ map: map.id, kind: 'vehicle', moved: +moved.toFixed(2), at: before.map((n) => +n.toFixed(1)), dims: carDims(c0.kind) });
}

console.log('city boxes', CITY.boxes.length, 'neon', NEON_MAP.boxes.length);
walk(CITY, 'city', [[0, 0], [8, 56], [-12, -56], [19, 19], [-23.7, 13], [0, 20], [42, 10], [-90, -8]]);
// house stairs: stand at the bottom of the first house stair and walk up
const house = CITY.buildings[0];
if (house) walk(CITY, 'stairs', [[house.center[0] + 4.2, house.center[2] - 3.5]]);
walk(NEON_MAP, 'neon', [[0, 0], [-20, 6], [-10, 0], [4, 6]]);
const cityNarrow = passages(CITY, 'city');
const neonNarrow = passages(NEON_MAP, 'neon');
drive(CITY);
console.log(JSON.stringify({ stuck: stuck.length, cityNarrow, neonNarrow, sample: stuck.slice(0, 25) }, null, 2));
process.exit(stuck.filter((s) => s.kind !== 'narrow').length > 8 ? 1 : 0);
