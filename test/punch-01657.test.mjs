// 0.16.57 boxing: jab, jab, hook combo; punches land when looking a little down; the boxing pose drives the fist forward
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/game.js';
import { FISTS } from '../shared/weapons.js';

async function duel(fn) {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"jungle"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const outB = [];
  const a = game.connect({ readyState: 1, send() {}, close() {} });
  const b = game.connect({ readyState: 1, send: (s) => outB.push(JSON.parse(s)), close() {} });
  a.message(JSON.stringify({ t: 'join', name: 'A' })); b.message(JSON.stringify({ t: 'join', name: 'B' }));
  await new Promise((r) => setTimeout(r, 300));
  const pa = a.player(), pb = b.player();
  for (const p of [pa, pb]) { p.parachuting = false; p.alive = true; p.protectUntil = 0; p.passive = false; p.armor = 0; p.hp = 200; }
  pa.p = [-5, 0, 45]; pa.yaw = 0; pa.pitch = 0; pb.p = [-5, 0, 43.8]; pb.yaw = Math.PI; pa.rtt = 0; const now = Date.now(); for (const p of [pa, pb]) p.history = [{ t: now - 1000, p: p.p.slice() }, { t: now + 1000, p: p.p.slice() }];
  try { await fn({ a, pa, pb, outB }); } finally { game.stop?.(); }
}
const punch = (a, pa, pitch = 0) => { pa.lastShot.fists = 0; a.message(JSON.stringify({ t: 'melee', w: 'fists', yaw: 0, pitch })); };

test('jab, jab, hook: the third quick punch is heavy and hurts more', async () => {
  await duel(async ({ a, pa, pb, outB }) => {
    punch(a, pa); punch(a, pa); const before = pb.hp; pb.v = [0, 0, 0]; punch(a, pa);
    assert.equal(200 - before, 2 * FISTS.damage);
    assert.equal(before - pb.hp, Math.round(FISTS.damage * 1.7));
    const sw = outB.filter((m) => m.t === 'swing' && m.w === 'fists');
    assert.deepEqual(sw.map((m) => m.heavy), [0, 0, 1]);
  });
});

test('a punch lands while looking a little down at the target (third person camera)', async () => {
  await duel(async ({ a, pa, pb }) => { punch(a, pa, -0.6); assert.equal(pb.hp, 200 - FISTS.damage); });
});

test('the boxing pose places the fists with IK and the first-person fists exist', () => {
  const v = fs.readFileSync(new URL('../public/visuals.js', import.meta.url), 'utf8');
  assert.match(v, /function fistPose\(c, dt\)/); assert.match(v, /fistPose\(c, dt\); placeCharacterGear/);
  assert.match(v, /solveArm\(arm, fore, hand, target, pole\)/);
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(c, /const vmFists = new THREE\.Group\(\)/); assert.match(c, /sfx\.punch\(/);
});
