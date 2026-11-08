// Pedestrians (ambient life, drawn on this device only; they are not part of the match and can't be hurt).
// They walk the middle of the sidewalks, wait at the zebra crossings for the green man (the cross traffic's
// red light), run away from gunfire and from cars coming at them, and are always kept around the camera:
// one who ends up far away reappears on a sidewalk near you. The count follows the graphics quality.
import { CITY } from './shared/city.js';
import * as THREE from 'three';
// 0.16.49: a dark, slightly glossy pool with a soft irregular edge (drawn once, shared)
const BLOOD_GEO = (() => { const g = new THREE.CircleGeometry(0.6, 20), p = g.attributes.position; for (let i = 1; i < p.count; i++) { const a = Math.atan2(p.getY(i), p.getX(i)), f = 0.8 + 0.2 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 7); p.setXY(i, p.getX(i) * f, p.getY(i) * f); } return g; })();
const BLOOD_MAT = new THREE.MeshStandardMaterial({ color: 0x4a0606, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const ROADS = CITY.roads; // the avenues (x/z); 0.16.44: two each way
const nearestRoad = (v) => ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export function createPedestrians(scene, { walkways, count, make, animate, walkSignal, cars }) {
  if (!walkways?.length) return { update() {}, scare() {}, sync() {} }; // count 0 (low quality): no local extras, but the match's civilians are still drawn
  const peds = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Put a pedestrian somewhere on a sidewalk 20-60 m from (cx, cz)
  function place(p, cx, cz) {
    for (let tries = 0; tries < 30; tries++) {
      const w = walkways[Math.floor(rnd() * walkways.length)];
      const alongZ = w.a[0] === w.b[0];
      const lo = Math.min(alongZ ? w.a[2] : w.a[0], alongZ ? w.b[2] : w.b[0]), hi = Math.max(alongZ ? w.a[2] : w.a[0], alongZ ? w.b[2] : w.b[0]);
      const s = lo + 2 + rnd() * (hi - lo - 4); // 0.16.49: sidewalks are cut at the roundabouts
      const x = alongZ ? w.a[0] : s, z = alongZ ? s : w.a[2];
      const d = Math.hypot(x - cx, z - cz);
      if (d < 12 || d > 55) continue; // close enough to see, never popping in right next to you
      if (ROADS.some((r) => Math.abs((alongZ ? z : x) - r) < 7.5)) continue; // not in the middle of a crossing
      Object.assign(p, { w, alongZ, s, dir: rnd() < 0.5 ? -1 : 1, speed: 1.15 + rnd() * 0.45, wait: 0, flee: 0 });
      p.line = alongZ ? w.a[0] : w.a[2];
      p.road = nearestRoad(p.line);
      return true;
    }
    return false;
  }
  function spawn(i, cx, cz) {
    const c = make(i);
    if (!c) return null;
    const p = { c, id: i };
    if (!place(p, cx, cz)) return null;
    scene.add(c.root);
    return p;
  }
  // 0.16.44 server mode: the match runs the civilians (shared/civilians.js) and every snapshot carries them as
  // [id, x, z, yaw, state 0 walk / 1 run / 2 down, look, fall yaw]. Here they are only drawn and smoothed.
  const net = new Map(); let netMode = false;
  function sync(list) {
    netMode = true; const seen = new Set();
    for (const [id, x, z, yaw, st, look, fall] of list) {
      seen.add(id);
      let e = net.get(id);
      if (!e) { const c = make(look ?? 0); if (!c) continue; scene.add(c.root); c.root.position.set(x, 0.12, z); e = { c, down: 0 }; net.set(id, e); }
      e.x = x; e.z = z; e.yaw = yaw; e.st = st; e.fall = fall;
    }
    for (const [id, e] of net) if (!seen.has(id)) { scene.remove(e.c.root); net.delete(id); }
    for (const p of peds) p.c.root.visible = false; // the local street life (offline fallback) steps aside
  }
  function updateNet(dt, t, cam) {
    for (const e of net.values()) {
      const r = e.c.root, near = Math.hypot(r.position.x - cam.x, r.position.z - cam.z) < 70;
      r.visible = near; if (!near) { r.position.set(e.x, 0.12, e.z); continue; }
      if (e.st === 2) { // shot or hit by a car: falls flat, arms and legs straight, and a pool of blood spreads under them
        e.down = Math.min(1, e.down + dt * 2.5);
        r.rotation.set(0, e.fall, 0); r.rotateX(-Math.PI / 2 * e.down); r.position.y = 0.12 + 0.12 * e.down;
        if ((e.stillT || 0) < 0.8) { animate(e.c, 0, t, dt); if (e.down >= 1) e.stillT = (e.stillT || 0) + dt; } // settle into the straight standing pose, then stop animating
        if (!e.blood) { e.blood = new THREE.Mesh(BLOOD_GEO, BLOOD_MAT); e.blood.rotation.x = -Math.PI / 2; e.blood.renderOrder = 1; scene.add(e.blood); e.bloodT = 0; }
        e.bloodT = Math.min(1, e.bloodT + dt * 0.45); const k = 0.25 + 0.75 * Math.sqrt(e.bloodT);
        e.blood.scale.set(1.1 * k, 0.8 * k, 1); e.blood.rotation.z = e.fall; e.blood.visible = true;
        e.blood.position.set(r.position.x - Math.sin(e.fall) * 0.85, 0.135, r.position.z - Math.cos(e.fall) * 0.85);
        continue;
      }
      if (e.blood) e.blood.visible = false; e.stillT = 0;
      if (e.down) { e.down = 0; r.rotation.set(0, e.yaw, 0); r.position.set(e.x, 0.12, e.z); } // someone new walked in
      const k = Math.min(1, dt * 10);
      const mx = e.x - r.position.x, mz = e.z - r.position.z, dist = Math.hypot(mx, mz);
      if (dist > 6) r.position.set(e.x, 0.12, e.z); else { r.position.x += mx * k; r.position.z += mz * k; r.position.y = 0.12; }
      r.rotation.x = 0; r.rotation.z = 0;
      r.rotation.y += (((e.yaw - r.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8);
      animate(e.c, e.st === 1 ? 4.6 : 1.3, t, dt);
    }
  }
  return {
    sync,
    get count() { return netMode ? net.size : peds.length; },
    get list() { return netMode ? [...net.values()].filter((e) => e.c.root.visible).map((e) => e.c.root.position) : peds.map((p) => p.c.root.position); },
    // Gunfire or an explosion at `at`: everyone within 30 m runs away from it for a few seconds
    scare(at) {
      for (const p of peds) {
        const x = p.alongZ ? p.line : p.s, z = p.alongZ ? p.s : p.line;
        if (Math.hypot(x - at[0], z - at[2]) > 30) continue;
        const away = p.alongZ ? Math.sign(z - at[2]) : Math.sign(x - at[0]);
        p.dir = away || p.dir; p.flee = 5 + rnd() * 2; p.wait = 0;
      }
    },
    update(dt, t, cam) {
      if (netMode) return updateNet(dt, t, cam);
      if (peds.length < count) { const p = spawn(peds.length, cam.x, cam.z); if (p) peds.push(p); }
      for (const p of peds) {
        let x = p.alongZ ? p.line : p.s, z = p.alongZ ? p.s : p.line;
        if (Math.hypot(x - cam.x, z - cam.z) > 85) { place(p, cam.x, cam.z); continue; }
        // A car close by and heading their way: run
        for (const car of cars()) {
          if (Math.hypot(car.p[0] - x, car.p[2] - z) < 7 && Math.abs(car.speed || 0) > 3) { p.flee = Math.max(p.flee, 2); break; }
        }
        let speed = p.flee > 0 ? 4.2 : p.speed;
        if (p.flee > 0) p.flee -= dt;
        // Crossing ahead? wait at the kerb unless the cross traffic has red (running people don't wait)
        const ahead = p.s + p.dir * 1.2;
        const cross = ROADS.find((r) => Math.abs(ahead - r) < 5.2 && Math.abs(p.s - r) >= 5.2);
        if (cross !== undefined && p.flee <= 0) {
          const ok = p.alongZ ? walkSignal(true, p.road, cross, t) : walkSignal(false, cross, p.road, t); // walkSignal(axis, x-road, z-road)
          if (!ok) speed = 0;
        }
        p.s += p.dir * speed * dt;
        if (Math.abs(p.s) > 107) { p.dir = -p.dir; p.s = Math.sign(p.s) * 107; } // end of the street: turn back
        if (rnd() < dt * 0.01 && cross === undefined) p.dir = -p.dir; // now and then someone changes their mind
        x = p.alongZ ? p.line : p.s; z = p.alongZ ? p.s : p.line;
        const yaw = p.alongZ ? (p.dir > 0 ? Math.PI : 0) : (p.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        p.c.root.position.set(x, 0.12, z);
        p.c.root.rotation.y += (((yaw - p.c.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8);
        const near = Math.hypot(x - cam.x, z - cam.z) < 55;
        p.c.root.visible = near;
        if (near) animate(p.c, speed, t, dt); // far ones are hidden and skip the (costly) skeleton update
      }
    },
  };
}
