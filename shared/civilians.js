// Civilians: ordinary people walking the city sidewalks, run by the match itself (server, P2P host or the practice
// game in the browser) so everyone sees the same people. They take no part in the fighting: nobody targets them and
// they never attack. Gunfire or an explosion nearby makes them panic and run away; a bullet, a blast or a fast car
// can kill them. A fallen civilian lies there for a while, then someone new walks in somewhere out of sight.
import { rayBox, hitboxes } from './physics.js';
import { CAR_HALF } from './vehicles.js';

export const CIV = { hp: 60, walk: [1.1, 1.6], run: 4.6, fleeS: 6, scareR: 32, respawnMs: 14000, carKillSpeed: 5 };

export function createCivilians(map, { count = 8, rnd = Math.random } = {}) {
  const walkways = map.walkways || [];
  // 0.16.49 zebra crossings: a crossing {x, z, axis} joins the two sidewalks on either side of a road. axis 'z' = you
  // walk along z at that x (across a road that runs along x).
  const onLine = (w, alongZ, k) => (alongZ ? Math.abs(w.a[0] - k) < 0.01 && Math.abs(w.b[0] - k) < 0.01 : Math.abs(w.a[2] - k) < 0.01 && Math.abs(w.b[2] - k) < 0.01);
  const segAt = (alongZ, line, s) => walkways.find((w) => (Math.abs(w.a[0] - w.b[0]) < 0.01) === alongZ && onLine(w, alongZ, line) && s >= Math.min(alongZ ? w.a[2] : w.a[0], alongZ ? w.b[2] : w.b[0]) && s <= Math.max(alongZ ? w.a[2] : w.a[0], alongZ ? w.b[2] : w.b[0]));
  const crossings = (map.crossings || []).map((x) => ({ ...x }));
  const list = [];
  if (!walkways.length || !count) return { list, tick() {}, ray: () => null, hit() {}, scare() {}, blast() {}, state: () => [] };
  let nextId = 1;

  function place(c, awayFrom = []) {
    for (let tries = 0; tries < 40; tries++) {
      const w = walkways[Math.floor(rnd() * walkways.length)];
      const alongZ = Math.abs(w.a[0] - w.b[0]) < 0.01;
      const lo = alongZ ? Math.min(w.a[2], w.b[2]) : Math.min(w.a[0], w.b[0]), hi = alongZ ? Math.max(w.a[2], w.b[2]) : Math.max(w.a[0], w.b[0]);
      const s = lo + 4 + rnd() * (hi - lo - 8);
      const x = alongZ ? w.a[0] : s, z = alongZ ? s : w.a[2];
      if (awayFrom.some((p) => Math.hypot(p[0] - x, p[2] - z) < 25)) continue; // appear out of sight, not in front of you
      Object.assign(c, { w, alongZ, lo, hi, s, dir: rnd() < 0.5 ? -1 : 1, speed: CIV.walk[0] + rnd() * (CIV.walk[1] - CIV.walk[0]), flee: 0, hp: CIV.hp, alive: true, deadAt: 0, fall: null });
      c.p = [x, w.a[1] || 0.12, z];
      c.yaw = alongZ ? (c.dir > 0 ? Math.PI : 0) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
      return true;
    }
    return false;
  }
  for (let i = 0; i < count; i++) { const c = { id: 'c' + nextId++, look: i }; if (place(c)) list.push(c); }

  function kill(c, from) {
    if (!c.alive) return;
    c.alive = false; c.deadAt = Date.now(); c.hp = 0;
    // fall away from the shot / the car
    c.fall = from ? Math.atan2(c.p[0] - from[0], c.p[2] - from[2]) : c.yaw;
  }
  return {
    list,
    // dt seconds; players = alive player positions (to respawn out of sight); cars = [{p, speed, yaw}]
    tick(dt, players = [], cars = []) {
      const now = Date.now();
      for (const c of list) {
        if (!c.alive) { if (now - c.deadAt > CIV.respawnMs) place(c, players); continue; }
        // a car going fast enough through someone knocks them down for good
        for (const car of cars) {
          if (Math.abs(car.speed || 0) < CIV.carKillSpeed) continue;
          const dx = c.p[0] - car.p[0], dz = c.p[2] - car.p[2], sy = Math.sin(car.yaw || 0), cy = Math.cos(car.yaw || 0);
          const along = -sy * dx - cy * dz, side = cy * dx - sy * dz; // same footprint test as a player run over (game.js carOver)
          if (Math.abs(along) < CAR_HALF.z + 0.3 && Math.abs(side) < CAR_HALF.x + 0.3) { kill(c, car.p); break; }
        }
        if (!c.alive) continue;
        const speed = c.flee > 0 ? CIV.run : c.speed;
        if (c.flee > 0) c.flee -= dt;
        if (c.cross) { // walking over a zebra crossing to the sidewalk on the other side
          const x = c.cross, d = Math.sign(x.to - x.pos), step = speed * dt;
          x.pos += d * Math.min(step, Math.abs(x.to - x.pos));
          if (x.axis === 'z') { c.p[0] = x.at; c.p[2] = x.pos; c.yaw = d > 0 ? Math.PI : 0; } else { c.p[0] = x.pos; c.p[2] = x.at; c.yaw = d > 0 ? -Math.PI / 2 : Math.PI / 2; }
          c.moving = speed;
          if (Math.abs(x.to - x.pos) < 0.01) { // arrived: walk on along the new sidewalk
            const w = x.seg, alongZ = Math.abs(w.a[0] - w.b[0]) < 0.01;
            Object.assign(c, { w, alongZ, lo: alongZ ? Math.min(w.a[2], w.b[2]) : Math.min(w.a[0], w.b[0]), hi: alongZ ? Math.max(w.a[2], w.b[2]) : Math.max(w.a[0], w.b[0]), s: x.at, dir: rnd() < 0.5 ? -1 : 1, cross: null, crossCd: 6 });
          }
          continue;
        }
        if ((c.crossCd = (c.crossCd || 0) - dt) <= 0 && c.flee <= 0) for (const x of crossings) {
          // a crossing that starts from this sidewalk, right where I am: take it now and then
          const along = c.alongZ ? x.axis === 'x' : x.axis === 'z'; if (!along) continue;
          const at = x.axis === 'z' ? x.x : x.z, road = x.axis === 'z' ? x.z : x.x, line = c.alongZ ? c.w.a[0] : c.w.a[2];
          if (Math.abs(c.s - at) > 0.4 || Math.abs(line - road) > 7) continue;
          c.crossCd = 4; if (rnd() > 0.45) break;
          const other = road + (road - line), seg = segAt(!c.alongZ ? false : true, other, at) || segAt(c.alongZ, other, at);
          if (seg) c.cross = { axis: x.axis, at, pos: line, to: other, seg };
          break;
        }
        c.s += c.dir * speed * dt;
        if (c.s > c.hi - 1 || c.s < c.lo + 1) { c.dir = -c.dir; c.s = Math.max(c.lo + 1, Math.min(c.hi - 1, c.s)); } // end of the street: turn back
        else if (c.flee <= 0 && rnd() < dt * 0.012) c.dir = -c.dir; // now and then someone changes their mind
        c.p[0] = c.alongZ ? c.w.a[0] : c.s; c.p[2] = c.alongZ ? c.s : c.w.a[2];
        c.yaw = c.alongZ ? (c.dir > 0 ? Math.PI : 0) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        c.moving = speed;
      }
    },
    // nearest civilian a ray hits before maxDist: { c, t, head }
    ray(o, d, maxDist) {
      let best = null;
      for (const c of list) {
        if (!c.alive) continue;
        if (Math.hypot(c.p[0] - o[0], c.p[2] - o[2]) > maxDist + 2) continue;
        const hb = hitboxes(c.p, 0, c.yaw);
        for (const [box, head] of [[hb.head, true], [hb.body, false]]) {
          const t = rayBox(o, d, box[0], box[1], best ? best.t : maxDist);
          if (t !== null && t < (best ? best.t : maxDist)) best = { c, t, head };
        }
      }
      return best;
    },
    hit(c, dmg, from) { if (!c.alive) return; c.hp -= dmg; c.flee = CIV.fleeS; if (c.hp <= 0) kill(c, from); },
    // gunfire at `at`: everyone near runs away from it
    scare(at) {
      for (const c of list) {
        if (!c.alive || Math.hypot(c.p[0] - at[0], c.p[2] - at[2]) > CIV.scareR) continue;
        const away = c.alongZ ? Math.sign(c.p[2] - at[2]) : Math.sign(c.p[0] - at[0]);
        c.dir = away || c.dir; c.flee = CIV.fleeS + rnd() * 2;
      }
    },
    blast(at, radius, dmg) {
      for (const c of list) {
        if (!c.alive) continue;
        const r = Math.hypot(c.p[0] - at[0], c.p[1] - at[1], c.p[2] - at[2]);
        if (r < radius) this.hit(c, dmg * (1 - r / radius), at);
      }
      this.scare(at);
    },
    // compact snapshot: [id, x, z, yaw, state (0 walk, 1 run, 2 down), look, fall yaw]
    state() {
      return list.map((c) => [c.id, Math.round(c.p[0] * 100) / 100, Math.round(c.p[2] * 100) / 100, +c.yaw.toFixed(2), !c.alive ? 2 : c.flee > 0 ? 1 : 0, c.look, c.fall === null ? 0 : +c.fall.toFixed(2)]);
    },
  };
}
