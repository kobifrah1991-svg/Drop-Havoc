import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { step, PARACHUTE } from '../shared/physics.js';
import { MAPS } from '../shared/map.js';
import { STRING_KEYS } from '../shared/i18n.js';

const pub = new URL('../public/', import.meta.url);

test('every browser script parses (a stray comment once swallowed the rest of a line)', () => {
  for (const f of fs.readdirSync(pub).filter((n) => n.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', new URL(f, pub).pathname]);
  }
});

test('skydive from the plane lands in under half a minute without touching anything', () => {
  const s = { p: [0, PARACHUTE.height, 30], v: [0, 0, 0], yaw: 0, parachuting: true, chuteOpen: false, onGround: false, stance: 0 };
  let t = 0;
  while (!s.onGround && t < 120) { step(s, { f: 0, s: 0, jump: false, yaw: 0 }, 1 / 60, MAPS.city.boxes); t += 1 / 60; }
  assert.ok(s.onGround && t < 30, 'landed after ' + t.toFixed(1) + ' s');
});

test('coach tips, waking server and music have text in every language', async () => {
  const need = ['coach.ok', 'coach.off', 'srv.waking', 'set.music', ...['drop', 'loot', 'fight', 'city', 'event'].flatMap((k) => ['coach.' + k, 'coach.' + k + '.title'])];
  for (const k of need) assert.ok(STRING_KEYS.includes(k), k);
  for (const l of ['es', 'pt', 'fr', 'de', 'tr', 'id']) {
    const { default: d } = await import(`../shared/lang/${l}.js`);
    for (const k of need) assert.ok(d[k], l + ' ' + k);
  }
});

test('the coach and the menu music are wired into the game', () => {
  const c = fs.readFileSync(new URL('client.js', pub), 'utf8');
  assert.match(c, /createCoach\(/); assert.match(c, /coach\.update\(now/);
  assert.match(c, /createMusic\(/); assert.match(c, /music\.stop\(\)/);
  assert.match(fs.readFileSync(new URL('index.html', pub), 'utf8'), /id="music-on"/);
});

test('a sleeping server shows "waking" and is retried before it is called down', () => {
  const c = fs.readFileSync(new URL('client.js', pub), 'utf8');
  assert.match(c, /waking: true/); assert.match(c, /pingServer\(sv, tries \+ 1\)/);
  assert.match(fs.readFileSync(new URL('start-menu.js', pub), 'utf8'), /srv\.waking/);
});

test('0.16.56 a computer with a mouse keeps the computer controls (touch-screen laptops included)', () => {
  const c = fs.readFileSync(new URL('client.js', pub), 'utf8');
  assert.match(c, /desktopLike = !mobileUA && anyFine/);
  assert.match(c, /: !desktopLike && \(/);
  assert.match(c, /e\.pointerType !== 'mouse'/); // a stuck touch choice is undone by a real mouse click
  assert.match(c, /store\.set\('touchPick', v !== 'auto'\)/); // a choice made in Settings stays
});
