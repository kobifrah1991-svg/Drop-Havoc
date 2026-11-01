import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { step, PLAYER, canSlide, slideRecoverStance } from '../shared/physics.js';

const floor = () => { const b = [{ min: [-60, -1, -60], max: [60, 0, 60] }]; b.ramps = []; return b; };
const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');

// last matching rule wins: pick the final top-level (non-media) declaration for a selector
const lastRule = (sel) => { const re = new RegExp('^' + sel.replace(/[.#()]/g, '\\$&') + ' \\{([^}]*)\\}', 'gm'); let m, r = null; while ((m = re.exec(css))) r = m[1]; return r; };
const px = (rule, prop) => { const m = rule.match(new RegExp('(?:^|;)\\s*' + prop + ':\\s*(?:calc\\()?(\\d+)px')); return m ? +m[1] : null; };

test('0.16.30 touch minimap sits at the top, clear of the right action cluster', () => {
  const mm = lastRule('body.touch #minimap');
  assert.ok(mm, 'touch minimap rule');
  const top = px(mm, 'top'), right = px(mm, 'right'), h = px(mm, 'height'), w = px(mm, 'width');
  assert.ok(top + h <= 110, `minimap bottom edge ${top + h}px stays in the top strip`);
  // landscape phone ~400px tall: highest action button (prone) top = 400 - 172 - 42 = 186px
  for (const id of ['t-prone', 't-crouch', 't-swap', 't-reload', 't-slide']) {
    const r = lastRule('body.touch #' + id); assert.ok(r, id);
    const btnTop = 400 - px(r, 'bottom') - px(r, 'height');
    assert.ok(btnTop > top + h, `${id} top ${btnTop} vs minimap bottom ${top + h}`);
  }
  assert.ok(right >= 240 && w <= 100, 'left of the HP bar, small');
});

test('0.16.30 dash tunables: ~2x distance, readable, not spammy', () => {
  const dist = PLAYER.dashSpeed * PLAYER.dashTime;
  assert.ok(dist >= 7 && dist <= 10, `dash ~${dist.toFixed(1)} m`);
  assert.ok(PLAYER.dashTime >= 0.3 && PLAYER.dashTime <= 0.5, 'visible burst, not a teleport');
  assert.ok(PLAYER.dashCooldown >= 2.5);
  const s = { p: [0, 0, 0], v: [0, 0, 0], onGround: true, stance: 0 };
  for (let i = 0; i < 60; i++) step(s, { f: 1, yaw: 0, dash: i === 0 }, 1 / 60, floor());
  assert.ok(-s.p[2] > 9 + 4, `travelled ${-s.p[2]}`);
});

test('0.16.30 slide: enter only when running on the ground, decays, then recovers', () => {
  const still = { p: [0, 0, 0], v: [0, 0, 0], onGround: true, stance: 0 };
  assert.equal(canSlide(still), false, 'no slide from standing still');
  assert.equal(canSlide({ ...still, v: [0, 0, -9], onGround: false }), false, 'no slide in the air');
  assert.equal(canSlide({ ...still, v: [0, 0, -9], stance: 2 }), false, 'no slide when prone');
  assert.equal(canSlide({ ...still, v: [0, 0, -9], vehicle: 'c1' }), false, 'no slide in a car');
  const s = { p: [0, 0, 0], v: [0, 0, -9], onGround: true, stance: 0 };
  assert.equal(canSlide(s), true);
  s.stance = 1; step(s, { f: 1, yaw: 0, slide: true }, 1 / 60, floor());
  assert.ok(s.slideT > 0 && Math.hypot(s.v[0], s.v[2]) > PLAYER.speed, 'slide boost');
  assert.equal(canSlide(s), false, 'no re-slide mid slide');
  const v0 = Math.hypot(s.v[0], s.v[2]);
  for (let i = 0; i < 20; i++) step(s, { f: 1, yaw: 0 }, 1 / 60, floor());
  assert.ok(Math.hypot(s.v[0], s.v[2]) < v0, 'friction decay');
  for (let i = 0; i < 60; i++) step(s, { f: 1, yaw: 0 }, 1 / 60, floor());
  assert.ok(!(s.slideT > 0), 'slide ends');
  assert.equal(slideRecoverStance(), 1, 'Fortnite: ends crouched');
});

test('0.16.30 slide button, icon, captions and key are wired', () => {
  assert.match(html, /id="t-slide"[^>]*>.*icons\/actions\/slide\.svg/);
  assert.ok(fs.existsSync(new URL('../public/icons/actions/slide.svg', import.meta.url)));
  assert.match(client, /slide: 'גלישה'/); assert.match(client, /slide: 'SLIDE'/);
  assert.match(client, /hold\('t-slide', slidePress\)/);
  assert.match(client, /KeyG.*slidePress/);
  const b = fs.readFileSync(new URL('../android/build.sh', import.meta.url), 'utf8');
  assert.match(b, /icons/);
});

test('0.16.31 Fortnite slide: no dash on touch, ~7 m, ends crouched, cooldown', () => {
  assert.match(css, /body\.touch #t-dash \{ display: none !important; \}/);
  const r = lastRule('body.touch #t-slide'); assert.equal(px(r, 'right'), 210); assert.equal(px(r, 'bottom'), 112);
  const s = { p: [0, 0, 0], v: [0, 0, -9], onGround: true, stance: 1 };
  step(s, { f: 1, yaw: 0, slide: true }, 1 / 60, floor());
  let t = 1 / 60; while (s.slideT > 0) { step(s, { f: 1, yaw: 0 }, 1 / 60, floor()); t += 1 / 60; }
  assert.ok(t >= 0.6 && t <= 0.95, `duration ${t}`);
  assert.ok(-s.p[2] >= 6 && -s.p[2] <= 10, `distance ${-s.p[2]}`);
  assert.equal(canSlide(s), false, 'cooldown blocks immediate re-slide');
  const v = Math.hypot(s.v[0], s.v[2]); step(s, { f: 1, yaw: 0, slide: true }, 1 / 60, floor());
  assert.ok(!(s.slideT > 0) || Math.hypot(s.v[0], s.v[2]) <= v + 1, 'no re-boost');
  for (let i = 0; i < 90; i++) step(s, { f: 1, yaw: 0 }, 1 / 60, floor());
  s.v = [0, 0, -9]; assert.equal(canSlide(s), true, 'ready again after cooldown');
  assert.ok(PLAYER.slideCooldown >= 1 && PLAYER.slideCooldown <= 1.5);
});
