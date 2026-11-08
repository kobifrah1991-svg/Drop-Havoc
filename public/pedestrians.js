// Pedestrians (ambient life, drawn on this device only; they are not part of the match and can't be hurt).
// They walk the middle of the sidewalks, wait at the zebra crossings for the green man (the cross traffic's
// red light), run away from gunfire and from cars coming at them, and are always kept around the camera:
// one who ends up far away reappears on a sidewalk near you. The count follows the graphics quality.
const ROADS = [-38, 0, 38];
const nearestRoad = (v) => ROADS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export function createPedestrians(scene, { walkways, count, make, animate, walkSignal, cars }) {
  if (!walkways?.length || !count) return { update() {}, scare() {} };
  const peds = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // Put a pedestrian somewhere on a sidewalk 20-60 m from (cx, cz)
  function place(p, cx, cz) {
    for (let tries = 0; tries < 30; tries++) {
      const w = walkways[Math.floor(rnd() * walkways.length)];
      const alongZ = w.a[0] === w.b[0];
      const s = -105 + rnd() * 210;
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
  return {
    get count() { return peds.length; },
    get list() { return peds.map((p) => p.c.root.position); },
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
          const ok = p.alongZ ? walkSignal(true, p.road, cross, t) : walkSignal(false, p.road, cross, t);
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
