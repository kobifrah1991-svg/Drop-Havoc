// 0.16.58 Plunger grapple ("batman rope"): fire a plunger on a rope at a wall, roof edge, pole or car; it sticks and
// reels you in fast, keeping your momentum when you let go - cross a street in a second, get onto a roof, chase.
// Three charges; one comes back every 9 seconds. The match checks every pull (range, line of sight, charges, speed).
export const GRAPPLE = {
  range: 46,        // metres to the wall
  speed: 25,        // reel-in speed m/s (sprint is ~7)
  accel: 9,         // how fast the pull reaches full speed (1/s)
  charges: 3, regenMs: 9000,
  maxMs: 2600,      // the rope lets go by itself after this
  releaseDist: 1.5, // close enough: let go
  hop: 5.5,         // a little upward kick on release so you land on the ledge you pulled to
};

// how many charges a player has now (regenerates over time)
export function grappleCharges(p, now) {
  if (p.grappleN == null) { p.grappleN = GRAPPLE.charges; p.grappleRegenAt = now; }
  while (p.grappleN < GRAPPLE.charges && now - p.grappleRegenAt >= GRAPPLE.regenMs) { p.grappleN++; p.grappleRegenAt += GRAPPLE.regenMs; }
  if (p.grappleN >= GRAPPLE.charges) p.grappleRegenAt = now;
  return p.grappleN;
}

import { PLAYER } from './physics.js';

// one frame of the pull: steer the velocity toward the hook point; returns false when the rope should let go
export function grapplePull(state, eye, dt) {
  const g = state.grapple; if (!g) return false;
  const d = [g.pt[0] - state.p[0], g.pt[1] - (state.p[1] + eye * 0.6), g.pt[2] - state.p[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  g.t += dt;
  if (len < GRAPPLE.releaseDist || g.t * 1000 > GRAPPLE.maxMs) return false;
  // stuck against something for a moment (no progress): let go
  if (g.last != null && g.last - len < GRAPPLE.speed * dt * 0.15) g.stuck = (g.stuck || 0) + dt; else g.stuck = 0;
  g.last = len;
  if (g.stuck > 0.25) return false;
  const want = d.map((x) => (x / len) * GRAPPLE.speed), k = Math.min(1, GRAPPLE.accel * dt);
  for (let i = 0; i < 3; i++) state.v[i] += (want[i] - state.v[i]) * k;
  state.v[1] += PLAYER.gravity * dt * 0.95; // the rope carries your weight (step() adds gravity back)
  state.onGround = false;
  return true;
}
