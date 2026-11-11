// Movement + collision shared by the client (prediction), the server (bots, validation).
export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  eye: 1.6,
  headBase: 1.4,   // body hitbox ends here, head hitbox starts
  speed: 9,        // fast, RIVALS-like movement
  adsSpeed: 5.4,
  jump: 9.4,       // ~1.8 m jump
  padJump: 17,     // jump pads launch ~6 m up
  climb: 2.4,      // ledges up to this high above the feet can be climbed (jump into them)
  gravity: 25,
  // 0.16.32 Fortnite-style knee slide: impulse to ~14 m/s, very low friction so it glides ~2.7 s and ~21 m
  // (ends ~4 m/s), ends crouched, 1.2 s cooldown after it ends.
  slideBoost: 1.55,
  slideTime: 2.7,
  slideCooldown: 1.2,
  // 0.16.30: dash was ~4 m (19 m/s x 0.22 s) and felt like a twitch; now ~8 m (21 m/s x 0.38 s),
  // still a visible burst (not a teleport), cooldown 2.2 -> 2.8 s so it isn't spammy.
  dashSpeed: 21,
  dashTime: 0.38,
  dashCooldown: 2.8,
  // 0.16.30 ground slide (dedicated button): low crouch-height slide, friction decay, then stand up.
  slideFriction: 0.45,
  slideMinSpeed: 0.7, // fraction of run speed needed to start a slide
  stepUp: 0.46,
  vault: 0.66,     // 0.16.9: low props (crates 0.62 m, kerbs, benches) are stepped over while walking, no jump needed
  cornerSlip: 0.28, // 0.16.9: clipping a box edge by less than this slides around the corner instead of stopping
  maxHp: 200,
  maxArmor: 200,
};
// Metres and seconds: an open canopy descends at 4.8 m/s; 110 m gives ~23 s to choose a landing.
export const PARACHUTE = { height:320, // 0.16.47: higher jump and a slower fall: ~8 s to pick your moment
  sink:4.8, glideSpeed:7, acceleration:1.8, boundaryMargin:4.5,
  // GTA-style skydive before the canopy: fall ~165 km/h (dive faster, flatten slower), steer while falling;
  // Space opens the canopy (it opens by itself low down). Under the canopy W dives, Space flares (brakes).
  freefall:{ terminal:32, dive:44, flat:24, glide:10, diveGlide:18, accel:1.2 }, autoOpen:80, openTime:1.1,
  dive:{ sink:8, glide:1.45 }, flare:{ sink:2.2, glide:0.55 } };

export function insideMap(p,bounds,parachuting=false){
  const limit=bounds-(parachuting?PARACHUTE.boundaryMargin:PLAYER.radius);
  return !Number.isFinite(bounds)||(Math.abs(p[0])<=limit&&Math.abs(p[2])<=limit);
}

// Stances: 0 standing, 1 crouching, 2 prone. Height, eye level, head hitbox and speed for each.
export const STANCES = [
  { height: 1.8, eye: 1.6, headBase: 1.4, speed: 1 },
  { height: 1.2, eye: 1.08, headBase: 0.88, speed: 0.5 },
  { height: 0.6, eye: 0.42, headBase: 0.3, speed: 0.22 },
];
export const stanceOf = (s) => STANCES[s | 0] || STANCES[0];

function overlaps(x, y, z, b, h, r = PLAYER.radius) {
  if (y + h <= b.min[1] || y >= b.max[1]) return false;
  // Vehicle segments store the real oriented footprint. The AABB is only the broad box and is
  // larger than the body once the car is turned, which snagged players on empty air beside it.
  if (b.ox != null && b.hx != null && b.yaw != null) {
    const ca = Math.cos(b.yaw), sa = Math.sin(b.yaw);
    const dx = x - b.ox, dz = z - b.oz;
    const lx = Math.abs(dx * ca + dz * sa), lz = Math.abs(-dx * sa + dz * ca);
    const px = Math.max(lx - b.hx, 0), pz = Math.max(lz - b.hz, 0);
    return px * px + pz * pz < r * r;
  }
  return x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2];
}
// A low top the body can stand on (kerb, stair, crate). Walls taller than a step are not lips.
function isLip(b, feetY) {
  const rise = b.max[1] - feetY;
  return rise > 0 && rise <= PLAYER.vault + 0.02;
}
// True when the body can stand at this height: step lips don't count, a wall or rail does.
function feetClear(x, y, z, boxes, H, radius = PLAYER.radius) {
  for (const b of boxes) {
    if (b.breakable && knockedDown(b)) continue;
    if (!overlaps(x, y, z, b, H, radius)) continue;
    if (isLip(b, y)) continue;
    return false;
  }
  for (const r of boxes.ramps || []) {
    const hit = collides(x, y, z, Object.assign([], { ramps: [r] }), H, radius);
    if (hit && hit.max[1] > y + PLAYER.vault + 0.02) return false;
  }
  return true;
}

// A prop a car knocked over (street furniture, small trees) no longer stands in the way for a minute
const knockedDown = (b) => (b.knockedUntil || 0) > Date.now() || (b.hitUntil || 0) > Date.now();
export function collides(x, y, z, boxes, h = PLAYER.height, radius = PLAYER.radius) {
  for (const b of boxes) if (overlaps(x, y, z, b, h, radius) && !(b.breakable && knockedDown(b))) return b;
  // A ramp is a solid wedge, not just an invisible walkable surface.
  for (const r of boxes.ramps || []) {
    const x0 = Math.max(x - radius, r.min[0]), x1 = Math.min(x + radius, r.max[0]);
    const z0 = Math.max(z - radius, r.min[2]), z1 = Math.min(z + radius, r.max[2]);
    if (x1 <= x0 || z1 <= z0 || y + h <= r.min[1]) continue;
    const top = Math.max(rampY(r, x0, z0), rampY(r, x1, z1));
    if (y < top - 1e-6) return { min: r.min, max: [r.max[0], top, r.max[2]], ramp: r };
  }
  return null;
}

// Ramps (MAP.ramps, attached to the boxes array): walkable slopes {min, max, axis: 'x'|'z', up: 1|-1}.
// The surface rises from min.y to max.y along `axis` in the `up` direction.
function rampY(r, x, z) {
  if (x < r.min[0] || x > r.max[0] || z < r.min[2] || z > r.max[2]) return -Infinity;
  const a = r.axis === 'x' ? 0 : 2, v = a === 0 ? x : z;
  let t = (v - r.min[a]) / (r.max[a] - r.min[a]);
  if (r.up < 0) t = 1 - t;
  return r.min[1] + t * (r.max[1] - r.min[1]);
}
export function floorAt(x, z, boxes) {
  let y = -Infinity;
  for (const r of boxes.ramps || []) {
    const x0 = Math.max(x - PLAYER.radius, r.min[0]), x1 = Math.min(x + PLAYER.radius, r.max[0]);
    const z0 = Math.max(z - PLAYER.radius, r.min[2]), z1 = Math.min(z + PLAYER.radius, r.max[2]);
    if (x1 > x0 && z1 > z0) y = Math.max(y, rampY(r, x0, z0), rampY(r, x1, z1));
  }
  return y;
}

// Validate the entire requested movement, including clear endpoints on opposite sides of a wall.
export function clearMovement(from, to, boxes, height = PLAYER.height) {
  height -= 0.012; // 0.16.67 the checks below lift the feet 4 mm: keep the head where the client has it (a rail or shelf starting exactly at head height is not a hit)
  const distance = Math.hypot(...to.map((n, i) => n - from[i]));
  if (!Number.isFinite(distance) || distance > 30) return false;
  // 0.16.3: a player already embedded may always step out to a short, clear spot (unstick).
  if (distance <= 1.5 && collides(from[0], from[1] + 0.004, from[2], boxes, height)) return !collides(to[0], to[1] + 0.004, to[2], boxes, height);
  // 0.16.11: the client slides around corners and steps over/off crates between two state packets, so the
  // straight line between them may clip an edge. Check the path with a thinner body (tolerance) and only the
  // endpoint with the real radius; otherwise the server keeps snapping the player back = "stuck" near props.
  const thin = PLAYER.radius * 0.45;
  const segClear = (a, b) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), count = Math.max(1, Math.ceil(d / 0.08));
    for (let i = 1; i < count; i++) {
      const p = a.map((n, axis) => n + (b[axis] - n) * i / count);
      const hit = collides(p[0], p[1] + 0.004, p[2], boxes, height, thin);
      if (!hit) continue;
      const rise = hit.max[1] - p[1];
      if (rise > 0 && rise <= PLAYER.vault + 0.05 && !collides(p[0], hit.max[1] + 0.004, p[2], boxes, height, thin)) continue;
      return false;
    }
    return true;
  };
  const endHit = collides(to[0], to[1] + 0.004, to[2], boxes, height, PLAYER.radius - 0.03);
  // Standing against the next stair/kerb is the step the client already took, not a wall clip.
  if (endHit && !(isLip(endHit, to[1]) && feetClear(to[0], endHit.max[1] + 0.004, to[2], boxes, height, PLAYER.radius - 0.03))) return false;
  if (segClear(from, to)) return true;
  // 0.16.67 climbing onto a crate, a counter or a stair step (or dropping off one) between two packets: the straight
  // diagonal clips the object's edge and the server used to snap the player back again and again ("stuck on
  // objects"). The real path goes up then across (or across then down), so accept either clear L-shaped path.
  if (Math.abs(to[1] - from[1]) > 0.05) {
    const up = to[1] > from[1], mid = up ? [from[0], to[1], from[2]] : [to[0], from[1], to[2]];
    if (!collides(mid[0], mid[1] + 0.004, mid[2], boxes, height, thin) && segClear(from, mid) && segClear(mid, to)) return true;
  }
  return false;
}
// Jump pads (MAP.pads): {x, y, z, r}
export const padAt = (p, boxes) => (boxes.pads || []).find((d) => Math.hypot(p[0] - d.x, p[2] - d.z) < d.r && Math.abs(p[1] - d.y) < 0.3);

// Can a player at p rise to stance `to` (enough headroom)?
export const canStance = (p, to, boxes) => !collides(p[0], p[1] + 0.01, p[2], boxes, stanceOf(to).height);

// state: {p:[x,y,z], v:[x,y,z], onGround, stance}, input: {f, s, jump, yaw, ads}
// Highest top among boxes overlapping the player that lie at or below `limit` (landing surface).
function landingTop(x, y, z, boxes, h, limit) {
  let top = -Infinity;
  for (const b of boxes) if (overlaps(x, y, z, b, h) && b.max[1] <= limit + 1e-6) top = Math.max(top, b.max[1]);
  return top;
}
// Separate a body that is grazing an oriented car part. Returns true if it moved clear.
function pushOriented(p, hit, H, boxes) {
  const ca = Math.cos(hit.yaw), sa = Math.sin(hit.yaw), r = PLAYER.radius + 0.01;
  const dx = p[0] - hit.ox, dz = p[2] - hit.oz;
  const lx = dx * ca + dz * sa, lz = -dx * sa + dz * ca;
  const penX = hit.hx + r - Math.abs(lx), penZ = hit.hz + r - Math.abs(lz);
  const alongX = penX < penZ;
  const pen = (alongX ? penX : penZ) + 0.004;
  if (pen > 0.55) return false;
  const sign = (alongX ? lx : lz) >= 0 ? 1 : -1;
  const ox = alongX ? sign * pen * ca : sign * pen * -sa;
  const oz = alongX ? sign * pen * sa : sign * pen * ca;
  if (collides(p[0] + ox, p[1], p[2] + oz, boxes, H)) return false;
  p[0] += ox; p[2] += oz;
  return true;
}
// 0.16.3: push an embedded player out (up onto a low top, else the shortest horizontal exit).
// A graze (the shell overlaps, the centre does not) used to kill the whole step and zero the
// speed, so walking away from a door jamb or a prop never made progress. Nudge those out too.
export function unstick(state, boxes, H = stanceOf(state.stance).height) {
  const p = state.p;
  let moved = false;
  // The shell overlapping the next riser is normal on a 0.5 m tread. Only the deep push runs
  // when the centre of the body is actually inside solid geometry.
  if (collides(p[0], p[1] + 0.05, p[2], boxes, Math.max(0.3, H - 0.15), 0.08)) {
    for (let k = 0; k < 4; k++) {
      const hit = collides(p[0], p[1], p[2], boxes, H);
      if (!hit) break;
      const r = PLAYER.radius + 0.01;
      const up = hit.max[1] - p[1];
      const opts = [];
      if (up > 0 && up <= 0.75) opts.push([0, up + 0.001, 0, up * 0.5]);
      opts.push([hit.min[0] - r - p[0], 0, 0], [hit.max[0] + r - p[0], 0, 0], [0, 0, hit.min[2] - r - p[2]], [0, 0, hit.max[2] + r - p[2]]);
      opts.sort((a, b) => (a[3] ?? Math.hypot(a[0], a[2])) - (b[3] ?? Math.hypot(b[0], b[2])));
      let freed = false;
      for (const o of opts) {
        if (Math.hypot(o[0], o[1], o[2]) > 2.5) continue;
        if (!collides(p[0] + o[0], p[1] + o[1], p[2] + o[2], boxes, H)) { p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; freed = true; moved = true; break; }
      }
      if (freed) break;
      const o = opts.find((o) => Math.hypot(o[0], o[1], o[2]) <= 2.5);
      if (!o) break;
      p[0] += o[0]; p[1] += o[1]; p[2] += o[2];
      moved = true;
    }
  }
  // Shallow graze: ignore step lips (kerbs, stairs). Push at most the body's radius, horizontally.
  for (let k = 0; k < 3; k++) {
    let hit = null;
    for (const b of boxes) {
      if (b.breakable && knockedDown(b)) continue;
      if (!overlaps(p[0], p[1] + 0.02, p[2], b, H)) continue;
      if (isLip(b, p[1])) continue;
      hit = b; break;
    }
    if (!hit) break;
    if (hit.ox != null && hit.hx != null) { if (!pushOriented(p, hit, H, boxes)) break; moved = true; continue; }
    const r = PLAYER.radius + 0.01;
    const opts = [[hit.min[0] - r - p[0], 0], [hit.max[0] + r - p[0], 0], [0, hit.min[2] - r - p[2]], [0, hit.max[2] + r - p[2]]];
    opts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    let freed = false;
    for (const [dx, dz] of opts) {
      if (Math.hypot(dx, dz) > 0.55) continue;
      if (!collides(p[0] + dx, p[1], p[2] + dz, boxes, H)) { p[0] += dx; p[2] += dz; freed = true; moved = true; break; }
    }
    if (!freed) break;
  }
  return moved;
}

// 0.16.30: can a dedicated slide start now? (on foot, grounded, running, not already sliding/prone)
export function canSlide(s) {
  return !!s && s.alive !== false && !s.vehicle && !s.parachuting && !!s.onGround && (s.stance | 0) < 2 && !(s.slideT > 0) && !(s.slideCd > 0)
    && Math.hypot(s.v[0], s.v[2]) > PLAYER.speed * PLAYER.slideMinSpeed;
}
// After the slide ends, a button slide stands back up (if there is headroom), a crouch-slide stays crouched.
export const slideRecoverStance = () => 1; // 0.16.31: Fortnite-style, you stay crouched after a slide

export function step(state, input, dt, boxes) {
  const p = state.p, v = state.v;
  const st = stanceOf(state.stance), H = st.height;
  unstick(state, boxes, H);
  // Parachute phases: free fall until the canopy opens (jump input or low altitude), then canopy glide
  if (state.parachuting && !state.chuteOpen && (input.jump || p[1] < PARACHUTE.autoOpen)) { state.chuteOpen = true; state.openT = PARACHUTE.openTime; state.chuteJustOpened = true; }
  const falling = state.parachuting && !state.chuteOpen, ff = PARACHUTE.freefall;
  const diving = state.parachuting && (input.f || 0) > 0.3, flaring = state.parachuting && state.chuteOpen && !!input.jump;
  const speed = falling ? (diving ? ff.diveGlide : ff.glide)
    : state.parachuting ? PARACHUTE.glideSpeed * (flaring ? PARACHUTE.flare.glide : diving ? PARACHUTE.dive.glide : 1)
    : (input.ads ? PLAYER.adsSpeed : PLAYER.speed) * st.speed * (input.boost || 1); // boost: speed pickup
  let f = input.f || 0, s = input.s || 0;
  const len = Math.hypot(f, s);
  if (len > 1) { f /= len; s /= len; }
  const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
  // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
  const tx = (-sy * f + cy * s) * speed;
  const tz = (-cy * f - sy * s) * speed;
  // Slide: crouch at a run, glide with low friction, then stand again (stance 0).
  // A low ceiling blocks the stand-up and leaves the crouch in place.
  const hs = Math.hypot(v[0], v[2]);
  if (state.slideCd > 0) state.slideCd -= dt;
  if (input.slide && state.onGround && !(state.slideT > 0) && !(state.slideCd > 0) && (state.stance | 0) < 2 && hs > PLAYER.speed * PLAYER.slideMinSpeed) {
    const k = Math.min(PLAYER.speed * PLAYER.slideBoost, hs * PLAYER.slideBoost) / hs;
    v[0] *= k; v[2] *= k;
    state.slideT = PLAYER.slideTime; state.slideCd = PLAYER.slideTime + PLAYER.slideCooldown;
  }
  if (state.dashCd > 0) state.dashCd -= dt;
  if (input.dash && state.onGround && !state.parachuting && !(state.dashCd > 0)) {
    let dx = tx, dz = tz, l = Math.hypot(dx, dz);
    if (l < 0.5) { dx = -sy; dz = -cy; l = 1; }
    v[0] = dx / l * PLAYER.dashSpeed; v[2] = dz / l * PLAYER.dashSpeed;
    state.dashT = PLAYER.dashTime; state.dashCd = PLAYER.dashCooldown; state.slideT = 0;
  }
  if (state.dashT > 0) {
    state.dashT -= dt;
    if (state.dashT <= 0) { const k = PLAYER.speed / Math.max(PLAYER.speed, Math.hypot(v[0], v[2])); v[0] *= k; v[2] *= k; }
  } else if (state.slideT > 0) {
    state.slideT -= dt;
    const fr = Math.max(0, 1 - PLAYER.slideFriction * dt);
    v[0] *= fr; v[2] *= fr;
    if (state.slideT <= 0 && state.stance === 1 && canStance(p, 0, boxes)) state.stance = 0;
  } else {
    const accel = falling ? ff.accel : state.parachuting ? PARACHUTE.acceleration : state.onGround ? 18 : 6;
    if (!state.grapple) { // 0.16.58 on the grapple rope the pull alone steers (shared/grapple.js)
    v[0] += (tx - v[0]) * Math.min(1, accel * dt);
    v[2] += (tz - v[2]) * Math.min(1, accel * dt); }
  }
  if (input.jump && state.onGround && !state.stance) { v[1] = PLAYER.jump; state.onGround = false; }
  // Jump pad: stepping on it launches you high (keeps your run-up speed)
  if (state.onGround && padAt(p, boxes)) { v[1] = PLAYER.padJump; state.onGround = false; state.padded = true; }
  v[1] -= PLAYER.gravity * dt;
  if (falling) v[1] = Math.max(-(diving ? ff.dive : (input.f || 0) < -0.3 ? ff.flat : ff.terminal), v[1]);
  else if (state.parachuting) {
    const sink = flaring ? PARACHUTE.flare.sink : diving ? PARACHUTE.dive.sink : PARACHUTE.sink;
    if (state.openT > 0) { state.openT -= dt; if (v[1] < -sink) v[1] += (-sink - v[1]) * Math.min(1, dt * 5); if (state.openT <= 0) v[1] = Math.max(-sink, v[1]); } // the canopy catching air
    else v[1] = Math.max(-sink, v[1]);
  }
  if (state.climbT > 0) state.climbT -= dt;
  state.wall = null;

  // Sub-step to avoid tunnelling on frame hitches
  const n = Math.max(1, Math.ceil(dt / 0.02), Math.ceil(Math.max(...v.map(Math.abs)) * dt / 0.1));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    moveAxis(state, 0, v[0] * h, boxes, H);
    moveAxis(state, 2, v[2] * h, boxes, H);
    const dy = v[1] * h;
    const prevY = p[1];
    p[1] += dy;
    const hit = collides(p[0], p[1], p[2], boxes, H);
    state.onGround = false;
    if (hit) {
      if (dy < 0) {
        // Land on the highest surface we fell through (roof slab over walls), never the first box found.
        const top = landingTop(p[0], p[1], p[2], boxes, H, prevY);
        p[1] = top > -Infinity ? top : prevY;
        if (collides(p[0], p[1], p[2], boxes, H)) p[1] = prevY;
        state.onGround = true;
      }
      else p[1] = hit.min[1] - H;
      v[1] = 0;
    } else if (dy <= 0 && collides(p[0], p[1] - 0.05, p[2], boxes, H)) {
      state.onGround = true;
    }
    // Ramps: stand on the slope; while walking down, stay glued to it instead of hopping
    const fy = floorAt(p[0], p[2], boxes);
    if (fy > -Infinity && v[1] <= 0.01 && p[1] < fy + (state.wasGround ? 0.35 : 0.02) && p[1] > fy - 0.7) {
      p[1] = fy; v[1] = 0; state.onGround = true;
    }
  }
  if(state.onGround){state.parachuting=false;state.chuteOpen=false;}
  state.wasGround = state.onGround;
  // Climb: pressing forward into a ledge you can reach (jumping or in the air) pulls you up onto it
  const w = state.wall;
  if (w && !state.parachuting && !state.stance && !(state.climbT > 0) && (input.jump || !state.onGround) && (input.f || 0) > 0) {
    const rise = w.max[1] - p[1];
    const ahead = [p[0] - Math.sin(input.yaw) * 0.6, w.max[1] + 0.02, p[2] - Math.cos(input.yaw) * 0.6];
    if (rise > PLAYER.stepUp && rise <= PLAYER.climb && !collides(ahead[0], ahead[1], ahead[2], boxes, H)) {
      v[1] = Math.sqrt(2 * PLAYER.gravity * (rise + 0.3));
      state.climbT = 0.6;
      state.onGround = false;
    }
  }
  if (p[1] < -20) { p[1] = 2; v[1] = 0; } // safety net
}

function moveAxis(state, axis, d, boxes, H) {
  if (!d) return;
  const p = state.p;
  p[axis] += d;
  if(state.parachuting&&Number.isFinite(boxes.bounds)){
    const limit=(boxes.dropBounds??boxes.bounds)-PARACHUTE.boundaryMargin; // the city: land inside the ring road, not on the edge roofs
    const bounded=Math.max(-limit,Math.min(limit,p[axis]));
    if(bounded!==p[axis]){p[axis]=bounded;state.v[axis]=0;}
  }
  const hits = [];
  for (const b of boxes) if (overlaps(p[0], p[1], p[2], b, H) && !(b.breakable && knockedDown(b))) hits.push(b);
  const rampHit = collides(p[0], p[1], p[2], Object.assign([], { ramps: boxes.ramps || [] }), H);
  if (rampHit) hits.push(rampHit);
  if (!hits.length) return;
  // Step the lowest lip we are touching. The landing check ignores the next lip, so a flight of
  // stairs (or a kerb beside a bench) does not read as a wall.
  const grounded = state.onGround || state.wasGround;
  const stepH = state.stance ? PLAYER.stepUp : PLAYER.vault;
  if (grounded && !state.parachuting) {
    let best = null;
    for (const cand of hits) {
      const rise = cand.max[1] - p[1];
      if (rise > 0 && rise <= stepH && (!best || cand.max[1] < best.max[1])) best = cand;
    }
    if (best && feetClear(p[0], best.max[1] + 0.001, p[2], boxes, H)) {
      p[1] = best.max[1] + 0.001;
      return;
    }
  }
  const hit = hits[0];
  // 0.16.9 corner slip: barely clipping a box edge -> nudge sideways around it instead of a dead stop
  if (!hit.ramp) {
    const o = axis === 0 ? 2 : 0, r = PLAYER.radius;
    const pushLo = hit.min[o] - r - p[o], pushHi = hit.max[o] + r - p[o];
    const push = Math.abs(pushLo) < Math.abs(pushHi) ? pushLo : pushHi;
    if (Math.abs(push) <= PLAYER.cornerSlip) {
      const q = p.slice(); q[o] += push + Math.sign(push) * 0.002;
      if (!collides(q[0], q[1], q[2], boxes, H)) { p[o] = q[o]; return; }
    }
  }
  p[axis] -= d;
  state.v[axis] = 0;
  state.wall = hit; // remembered for climbing
}

// Ray vs AABB (slab method). Returns entry distance or null.
export function rayBox(o, d, min, max, maxDist = Infinity) {
  let tmin = 0, tmax = maxDist;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < min[i] || o[i] > max[i]) return null;
    } else {
      let t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export function rayWorld(o, d, boxes, maxDist) {
  let best = maxDist;
  for (const b of boxes) {
    if (b.pane || (b.breakable && knockedDown(b))) continue; // 0.16.42: invisible window panes block walking only, never bullets/sight; smashed props lie flat
    const t = rayBox(o, d, b.min, b.max, best);
    if (t !== null && t < best) best = t;
  }
  for (const r of boxes.ramps || []) {
    const a = r.axis === 'x' ? 0 : 2;
    const slope = (r.max[1] - r.min[1]) / (r.max[a] - r.min[a]) * r.up;
    const base = r.up > 0 ? r.min[a] : r.max[a];
    // Clip the ray against the six bounding planes and the sloped roof.
    const planes = [
      [[1,0,0],r.max[0]], [[-1,0,0],-r.min[0]],
      [[0,1,0],r.max[1]], [[0,-1,0],-r.min[1]],
      [[0,0,1],r.max[2]], [[0,0,-1],-r.min[2]],
    ];
    const normal = [0,1,0]; normal[a] = -slope;
    planes.push([normal, r.min[1] - slope * base]);
    let enter = 0, leave = best, blocked = false;
    for (const [n, limit] of planes) {
      const at = n.reduce((sum,v,i)=>sum+v*o[i],0);
      const speed = n.reduce((sum,v,i)=>sum+v*d[i],0);
      if (Math.abs(speed)<1e-9) { if(at>limit+1e-8){blocked=true;break;} continue; }
      const time=(limit-at)/speed;
      if(speed<0) enter=Math.max(enter,time); else leave=Math.min(leave,time);
      if(enter>leave){blocked=true;break;}
    }
    if(!blocked && enter<best) best=enter;
  }
  return best;
}

export function hitboxes(p, stance = 0, yaw = 0) {
  const r = PLAYER.radius, hr = 0.26, st = stanceOf(stance);
  if (stance === 2) {
    // Lying down: a long low body along the facing direction, head in front
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), L = 0.8;
    const hx = p[0] + fx * 0.75, hz = p[2] + fz * 0.75;
    return {
      body: [[Math.min(p[0] - fx * L, p[0]) - r, p[1], Math.min(p[2] - fz * L, p[2]) - r], [Math.max(p[0] - fx * L, p[0]) + r, p[1] + st.headBase, Math.max(p[2] - fz * L, p[2]) + r]],
      head: [[hx - hr, p[1] + 0.1, hz - hr], [hx + hr, p[1] + st.height, hz + hr]],
    };
  }
  return {
    body: [[p[0] - r, p[1], p[2] - r], [p[0] + r, p[1] + st.headBase, p[2] + r]],
    head: [[p[0] - hr, p[1] + st.headBase, p[2] - hr], [p[0] + hr, p[1] + st.height + 0.05, p[2] + hr]],
  };
}

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

// 0.16.13: climb through a window (sill below the chest, opening above it, clear floor on the other side).
export function findVault(p, yaw, boxes, bounds = 1e9) {
  // 0.16.33: only real windows (city panes) — never chests or crates; works on every floor and exits the house.
  const panes = boxes.filter((b) => b.pane);
  const solid = Object.assign(boxes.filter((b) => !b.pane && !b.chest), { ramps: boxes.ramps, pads: boxes.pads });
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  for (const d of [0.45, 0.7, 0.95]) {
    const ax = p[0] + fx * d, az = p[2] + fz * d;
    if (panes.length) { if (!collides(ax, p[1] + 0.95, az, panes, 1.2, 0.2)) continue; }
    else if (!collides(ax, p[1] + 0.05, az, solid, 0.8, 0.2)) continue;
    if (collides(ax, p[1] + 0.95, az, solid, 1.4, 0.2)) return null;
    for (const e of [1.0, 1.3]) {
      const lx = p[0] + fx * (d + e), lz = p[2] + fz * (d + e);
      if (Math.abs(lx) > bounds - 1 || Math.abs(lz) > bounds - 1) continue;
      for (const y of p[1] > 1 ? [p[1], 0] : [p[1]]) {
        if (collides(lx, y + 0.004, lz, boxes, PLAYER.height, PLAYER.radius)) continue;
        if (!collides(lx, y - 0.3, lz, boxes, 0.3, 0.1)) continue;
        return [lx, y, lz];
      }
    }
    return null;
  }
  return null;
}
