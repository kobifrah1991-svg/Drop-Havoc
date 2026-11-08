// 0.16.44 free roam: no clock, no score limit, passive mode
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, MODES, PASSIVE } from '../shared/game.js';

test('free roam has no clock and no score limit; passive players cannot hurt or be hurt', async () => {
  assert.ok(MODES.roam.roam && MODES.roam.killLimit === Infinity);
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const sa = [], sb = [];
  const a = game.connect({ readyState: 1, send: (s) => sa.push(JSON.parse(s)), close() {} });
  const b = game.connect({ readyState: 1, send: (s) => sb.push(JSON.parse(s)), close() {} });
  try {
    a.message(JSON.stringify({ t: 'join', name: 'A' })); b.message(JSON.stringify({ t: 'join', name: 'B' }));
    await new Promise((r) => setTimeout(r, 300));
    const welcome = sa.find((m) => m.t === 'welcome');
    assert.equal(welcome.mode, 'roam'); assert.equal(welcome.match.endsAt, 0, 'no clock');
    const pa = a.player(), pb = b.player();
    for (const p of [pa, pb]) { p.parachuting = false; p.protectUntil = 0; p.lastFire = 0; p.lastHurt = 0; }
    // B goes passive
    b.message(JSON.stringify({ t: 'passive', on: true }));
    assert.equal(pb.passive, true);
    assert.ok(sb.some((m) => m.t === 'passive' && m.on === true));
    // switching back at once is refused (cooldown)
    b.message(JSON.stringify({ t: 'passive', on: false }));
    assert.equal(pb.passive, true);
    assert.ok(sb.some((m) => m.t === 'passive' && m.wait > 0));
    // A shoots B point-blank: no damage while B is passive
    pa.p = [40, 0.12, -60]; pb.p = [40, 0.12, -64]; pa.yaw = 0; pa.inventory.add?.('rifle'); pa.ammo.rifle = 30; pa.weapon = 'rifle';
    const hp0 = pb.hp;
    game.admin.giveWeapon?.(pa, 'rifle');
    a.message(JSON.stringify({ t: 'shoot', w: 'rifle', o: [40, 1.62, -60], dirs: [[0, -0.05, -1]] }));
    assert.equal(pb.hp, hp0, 'passive player not hurt');
    // and a passive player cannot go passive right after being in a fight
    pa.lastFire = Date.now();
    a.message(JSON.stringify({ t: 'passive', on: true }));
    assert.equal(!!pa.passive, false);
    assert.ok(sa.some((m) => m.t === 'passive' && m.combat));
    assert.ok(PASSIVE.cooldownMs >= 10000);
  } finally { game.stop(); delete globalThis.localStorage; }
});

test('passive mode only exists in free roam', async () => {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0, mode: 'ffa' }); game.start();
  const a = game.connect({ readyState: 1, send: () => {}, close() {} });
  try {
    a.message(JSON.stringify({ t: 'join', name: 'A' }));
    await new Promise((r) => setTimeout(r, 200));
    a.message(JSON.stringify({ t: 'passive', on: true }));
    assert.equal(!!a.player().passive, false);
  } finally { game.stop(); delete globalThis.localStorage; }
});
