// 0.16.52 fists, bat, baton; crash dents
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/game.js';
import { WEAPONS, FISTS, WEAPON_ORDER } from '../shared/weapons.js';
import { GUN_ITEMS } from '../shared/gunshop.js';
import { t, CORE_LANGS } from '../shared/i18n.js';

async function duel(fn) {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"jungle"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const outA = [], outB = [];
  const a = game.connect({ readyState: 1, send: (s) => outA.push(JSON.parse(s)), close() {} });
  const b = game.connect({ readyState: 1, send: (s) => outB.push(JSON.parse(s)), close() {} });
  a.message(JSON.stringify({ t: 'join', name: 'A' })); b.message(JSON.stringify({ t: 'join', name: 'B' }));
  await new Promise((r) => setTimeout(r, 300));
  const pa = a.player(), pb = b.player();
  for (const p of [pa, pb]) { p.parachuting = false; p.alive = true; p.protectUntil = 0; p.passive = false; p.armor = 0; p.hp = 200; }
  pa.p = [-5, 0, 45]; pa.yaw = 0; pa.pitch = 0; pb.p = [-5, 0, 43.8]; pb.yaw = Math.PI; pa.rtt = 0; const now = Date.now(); for (const p of [pa, pb]) p.history = [{ t: now - 1000, p: p.p.slice() }, { t: now + 1000, p: p.p.slice() }];
  try { await fn({ a, b, pa, pb, outA, outB }); } finally { game.stop?.(); }
}
test('empty hands punch (left/right), the target loses HP and is pushed back a little', async () => {
  await duel(async ({ a, pa, pb, outB }) => {
    a.message(JSON.stringify({ t: 'melee', w: 'fists', yaw: 0, pitch: 0 }));
    assert.equal(pb.hp, 200 - FISTS.damage);
    assert.ok(outB.some((m) => m.t === 'swing' && m.w === 'fists' && m.hit));
    pa.lastShot.fists = 0; a.message(JSON.stringify({ t: 'melee', w: 'fists', yaw: 0, pitch: 0 }));
    const sides = outB.filter((m) => m.t === 'swing').map((m) => m.side); assert.notEqual(sides[0], sides[1], 'alternating hands');
  });
});
test('a bat hits harder and knocks back; you need to own it', async () => {
  await duel(async ({ a, pa, pb }) => {
    a.message(JSON.stringify({ t: 'melee', w: 'bat', yaw: 0, pitch: 0 })); assert.equal(pb.hp, 200, 'no bat, no hit');
    pa.inventory.add('bat'); a.message(JSON.stringify({ t: 'melee', w: 'bat', yaw: 0, pitch: 0 }));
    assert.equal(pb.hp, 200 - WEAPONS.bat.damage); assert.ok(Math.hypot(pb.v[0], pb.v[2]) > 2, 'knocked back');
    assert.ok(WEAPONS.baton.melee && WEAPON_ORDER.includes('bat') && GUN_ITEMS.some((x) => x.id === 'bat') && GUN_ITEMS.some((x) => x.id === 'baton'));
  });
});
test('melee and crash damage are wired on screen; names in every language', () => {
  for (const l of CORE_LANGS) for (const k of ['bat', 'baton', 'fists']) assert.notEqual(t('weapon.' + k, {}, l), 'weapon.' + k);
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8'), v = fs.readFileSync(new URL('../public/vehicle-visuals.js', import.meta.url), 'utf8');
  assert.match(c, /if \(w\.unarmed\) return knifeSwing\(now, 'fists'\);/); assert.match(c, /case 'carHit':/);
  assert.match(v, /function dent\(id,x,z,power\)/);
  assert.match(fs.readFileSync(new URL('../shared/vehicles.js', import.meta.url), 'utf8'), /t:'carHit',hits:/);
});
