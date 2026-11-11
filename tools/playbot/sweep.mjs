// Stuck sweep. Walks and drives every map without a browser and reports the collisions that
// feel like an invisible object: a kerb in the open road, a fountain basin filled by a square
// box, a server snap-back on an ordinary route, a car that cannot leave a kerb, an exit that
// puts you inside a wall.
//
//   node tools/playbot/sweep.mjs
import { step, collides, clearMovement, PLAYER } from '../../shared/physics.js';
import { MAPS } from '../../shared/map.js';
import { CITY } from '../../shared/city.js';
import { createVehicles } from '../../shared/vehicles.js';

const RB = { R: 12 };

function copyCity() {
  const boxes = Object.assign(CITY.boxes.filter((b) => !b.vehicle), { ramps: CITY.ramps || [], bounds: CITY.bounds });
  return { ...CITY, boxes, ramps: CITY.ramps || [], bounds: CITY.bounds };
}

// Samples inside the carriageway (radius < R) that still touch a sidewalk step.
function kerbIntrusions() {
  let n = 0, worst = 0;
  for (const rb of CITY.roundabouts || []) {
    for (let k = 0; k < 48; k++) {
      const t = (k + 0.5) / 48 * Math.PI * 2;
      const x = rb.p[0] + Math.cos(t) * (RB.R - 0.25), z = rb.p[2] + Math.sin(t) * (RB.R - 0.25);
      if (Math.abs(x - rb.p[0]) < 5.2 && Math.abs(z - rb.p[2]) < 5.2) continue; // the road arms
      const hit = collides(x, 0.02, z, CITY.boxes, 0.2, 0.05);
      if (hit && hit.max[1] <= 0.2) { n++; worst = Math.max(worst, RB.R - Math.hypot(x - rb.p[0], z - rb.p[2])); }
    }
  }
  return { n, worst: +worst.toFixed(2) };
}

// Points in the water, clear of the column, that still hit a box (the old 1.8 m centre cube and the ring corners).
function basinPhantoms() {
  const spots = [];
  for (const [x, z, R] of [[-38, -38, 3.1], [38, 38, 3.1], [0, 0, 3.6]]) {
    for (const d of [0.9, 1.6, 2.3]) {
      const hit = collides(x + d, 0.35, z, CITY.boxes, 0.9, 0.15);
      if (hit) spots.push({ x: +(x + d).toFixed(1), z, h: +hit.max[1].toFixed(2), box: hit.min.map((n) => +n.toFixed(1)) });
    }
    // the stone itself must still stop you
    if (!collides(x + R, 0.3, z, CITY.boxes, 0.4, 0.05)) spots.push({ x: +(x + R).toFixed(1), z, missingRim: true });
  }
  return spots;
}

function routeSnaps() {
  const boxes = CITY.boxes;
  const routes = [
    ['lane', [[-36, 0, -20], [-36, 0, 20]]],
    ['sidewalk', [[-32, 0.12, -20], [-32, 0.12, 20]]],
    ['stairs', [[-57.8, 0, -95.2], [-57.8, 0, -86]]],
    ['shop', [[-36, 0, 13], [-26, 0, 13]]],
    ['lawn', [[-70, 0, -10], [-20, 0, -10]]],
  ];
  // a lap of open carriageway just inside the roundabout kerb
  const lap = [];
  for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI * 2; lap.push([-38 + Math.cos(t) * 10, 0, -38 + Math.sin(t) * 10]); }
  routes.push(['roundabout', lap]);
  let snaps = 0;
  const samples = [];
  for (const [name, pts] of routes) {
    const s = { p: pts[0].slice(), v: [0, 0, 0], onGround: true, stance: 0 };
    if (collides(s.p[0], s.p[1] + 0.05, s.p[2], boxes, 1.5, 0.2)) continue;
    let prev = s.p.map((n) => Math.round(n * 1000) / 1000), wi = 1, guard = 0;
    while (wi < pts.length && guard++ < 4000) {
      const tgt = pts[wi], dx = tgt[0] - s.p[0], dz = tgt[2] - s.p[2];
      if (Math.hypot(dx, dz) < 0.45) { wi++; continue; }
      const yaw = Math.atan2(-dx, -dz);
      step(s, { f: 1, yaw }, 1 / 60, boxes);
      if (guard % 3 === 0) {
        const q = s.p.map((n) => Math.round(n * 1000) / 1000);
        if (Math.hypot(q[0] - prev[0], q[2] - prev[2]) > 0.02 && !clearMovement(prev, q, boxes, PLAYER.height)) {
          snaps++;
          if (samples.length < 8) samples.push({ route: name, at: q.map((n) => +n.toFixed(2)) });
        }
        prev = q.slice();
      }
    }
  }
  // the same check walking forward from every spawn on the smaller maps
  for (const [id, map] of Object.entries(MAPS)) {
    if (id === 'city') continue;
    for (const spawn of map.spawns || []) {
      const s = { p: [spawn[0], spawn[1] || 0, spawn[2]], v: [0, 0, 0], onGround: true, stance: 0 };
      if (collides(s.p[0], s.p[1] + 0.05, s.p[2], map.boxes, 1.5, 0.2)) continue;
      let prev = s.p.map((n) => Math.round(n * 1000) / 1000);
      for (let i = 0; i < 45; i++) {
        step(s, { f: 1, yaw: 0 }, 1 / 60, map.boxes);
        if (i % 3 === 2) {
          const q = s.p.map((n) => Math.round(n * 1000) / 1000);
          if (Math.hypot(q[0] - prev[0], q[2] - prev[2]) > 0.02 && !clearMovement(prev, q, map.boxes, PLAYER.height)) {
            snaps++;
            if (samples.length < 8) samples.push({ route: id, at: q.map((n) => +n.toFixed(2)) });
          }
          prev = q.slice();
        }
      }
    }
  }
  return { snaps, samples };
}

// A body 25 cm inside a wall must be able to walk back out. One substep used to cancel that move.
function grazeFrees() {
  const boxes = [{ min: [0, 0, -2], max: [0.4, 3, 2] }, { min: [-6, -1, -6], max: [6, 0, 6] }];
  const s = { p: [-0.15, 0, 0], v: [0, 0, 0], onGround: true, stance: 0 };
  for (let i = 0; i < 20; i++) step(s, { f: 1, yaw: Math.PI / 2 }, 1 / 60, boxes);
  const stuck = s.p[0] > -0.35 || !!collides(s.p[0], s.p[1] + 0.05, s.p[2], boxes, 1.6, 0.3);
  return { stuck, at: s.p.map((n) => +n.toFixed(2)) };
}

function exits() {
  const map = copyCity();
  // a sidewalk where the driver door opens, on the first parked car
  const host = { id: 'bot', alive: true, p: [0, 0, 0], yaw: 0 };
  const v = createVehicles(map, { send() {}, broadcast() {}, playerById: (id) => (id === 'bot' ? host : null) });
  const c = v._cars[0];
  const yaw = c.yaw, Lx = -Math.cos(yaw), Lz = Math.sin(yaw);
  const door = [c.p[0] + Lx * (c.dm.hx + 1.4), c.p[2] + Lz * (c.dm.hx + 1.4)];
  map.boxes.push({ min: [door[0] - 1.2, 0, door[1] - 1.2], max: [door[0] + 1.2, 0.12, door[1] + 1.2] });
  host.p = c.p.slice();
  if (!v.interact(host)) return { enter: false, inside: 1 };
  if (!v.interact(host)) return { enter: true, exit: false, inside: 1 };
  const inside = collides(host.p[0], host.p[1] + 0.05, host.p[2], map.boxes, 1.6, 0.2);
  const onKerb = host.p[1] > 0.05 && host.p[1] < 0.2;
  return { inside: inside ? 1 : 0, onKerb, at: host.p.map((n) => +n.toFixed(2)) };
}

// After a car drives off and the match resets, its collision must be back at the spawn, not left in the road.
function ghostParts() {
  const map = copyCity();
  const host = { id: 'bot', alive: true, p: [0, 0, 0], yaw: 0 };
  const v = createVehicles(map, { send() {}, broadcast() {}, playerById: (id) => (id === 'bot' ? host : null) });
  const c = v._cars[0];
  const home = c.p.slice();
  host.p = c.p.slice();
  v.interact(host);
  for (let i = 0; i < 40; i++) { v.input(host, 1, 0, 0); v.tick(1 / 30); }
  const away = c.p.slice();
  v.resetAll();
  for (const b of map.boxes) if (b.breakable) b.hitUntil = 0; // this sweep must not leave props down for other tests
  const ghost = collides(away[0], 0.6, away[2], map.boxes, 0.8, 0.3);
  const homeHit = collides(home[0], 0.6, home[2], map.boxes, 0.8, 0.3);
  return { ghost: ghost ? 1 : 0, home: homeHit ? 1 : 0 };
}

// Throttle into a wall, then reverse. A wedge is a car that cannot leave.
function wallWedge() {
  const boxes = Object.assign([{ min: [36, 0, -78], max: [48, 3, -74] }], { ramps: [], bounds: 151 });
  const map = { boxes, ramps: [], bounds: 151 };
  const host = { id: 'bot', alive: true, p: [41.6, 0, -68], yaw: 0 };
  const v = createVehicles(map, { send() {}, broadcast() {}, playerById: (id) => (id === 'bot' ? host : null) });
  const c = v._cars[0];
  host.p = c.p.slice();
  if (!v.interact(host)) return { wedge: 1 };
  for (let i = 0; i < 50; i++) { v.input(host, 1, 0, 0); v.tick(1 / 30); }
  const pinned = c.p.slice();
  for (let i = 0; i < 40; i++) { v.input(host, -1, 0, 0); v.tick(1 / 30); }
  const left = Math.hypot(c.p[0] - pinned[0], c.p[2] - pinned[2]);
  return { wedge: left < 1 ? 1 : 0, left: +left.toFixed(2) };
}

export function audit() {
  const kerb = kerbIntrusions();
  const basin = basinPhantoms();
  const snaps = routeSnaps();
  const graze = grazeFrees();
  const exit = exits();
  const parts = ghostParts();
  const wedge = wallWedge();
  return {
    kerbIntrusions: kerb.n,
    kerbWorst: kerb.worst,
    basinPhantoms: basin.length,
    basin,
    snapBacks: snaps.snaps,
    snapSamples: snaps.samples,
    grazeStuck: graze.stuck ? 1 : 0,
    graze,
    exitInside: exit.inside || 0,
    exit,
    ghostParts: parts.ghost,
    parts,
    vehicleWedges: wedge.wedge,
    wedge,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('sweep.mjs');
if (isMain) {
  const t = Date.now();
  const report = audit();
  console.log(JSON.stringify({ ...report, ms: Date.now() - t }, null, 2));
  const bad = report.kerbIntrusions + report.basinPhantoms + report.snapBacks + report.grazeStuck + report.exitInside + report.ghostParts + report.vehicleWedges;
  process.exit(bad ? 1 : 0);
}
