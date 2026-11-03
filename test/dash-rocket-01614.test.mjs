import test from 'node:test';
import assert from 'node:assert/strict';
import { step, collides, PLAYER } from '../shared/physics.js';
import { WEAPONS } from '../shared/weapons.js';

const floor = () => { const b = [{ min: [-40, -1, -40], max: [40, 0, 40] }]; b.ramps = []; return b; };
const run = (s, boxes, dashAt, n = 60) => { for (let i = 0; i < n; i++) step(s, { f: 1, yaw: 0, dash: i === dashAt }, 1 / 60, boxes); };

test('0.16.14 slide-dash covers more ground than walking, then cools down', () => {
  const a = { p: [0, 0, 0], v: [0, 0, 0], onGround: true, stance: 0 };
  const b = { p: [0, 0, 0], v: [0, 0, 0], onGround: true, stance: 0 };
  run(a, floor(), -1); run(b, floor(), 10);
  assert.ok(-b.p[2] > -a.p[2] + 1.5, `dash ${b.p[2]} vs walk ${a.p[2]}`);
  assert.ok(b.dashCd > 0 && b.dashCd < PLAYER.dashCooldown);
  const cd = b.dashCd; step(b, { f: 1, yaw: 0, dash: true }, 1 / 60, floor());
  assert.ok(!(b.dashT > 0) && b.dashCd < cd, 'second dash blocked while cooling down');
  assert.ok(Math.hypot(b.v[0], b.v[2]) <= PLAYER.speed + 0.01, 'speed returns to normal');
});

test('0.16.14 slide-dash does not pass through a wall', () => {
  const boxes = floor(); boxes.push({ min: [-5, 0, -2.5], max: [5, 3, -2] });
  const s = { p: [0, 0, 0], v: [0, 0, 0], onGround: true, stance: 0 };
  run(s, boxes, 0, 40);
  assert.ok(s.p[2] > -2, `ended at ${s.p[2]}`);
  assert.equal(collides(...s.p, boxes), null);
});

test('0.16.14 RPG is a travelling rocket', () => {
  assert.ok(WEAPONS.rpg.rocketSpeed > 20 && WEAPONS.rpg.blast > 0);
});
