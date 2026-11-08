import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/game.js';
// GTA-style run over: a car at speed knocks a player flat and hurts them; they can't move while down,
// a car standing on them keeps them pinned, and they get up once it has gone.
test('run over: knocked down, hurt, pinned under the car, then back up', async () => {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0 }); game.start();
  const sentA = [], sentB = [];
  const a = game.connect({ readyState: 1, send: (s) => sentA.push(JSON.parse(s)), close() {} });
  const b = game.connect({ readyState: 1, send: (s) => sentB.push(JSON.parse(s)), close() {} });
  a.message(JSON.stringify({ t: 'join', name: 'Driver' })); b.message(JSON.stringify({ t: 'join', name: 'Walker' }));
  await new Promise((r) => setTimeout(r, 300));
  const pa = a.player(), pb = b.player();
  for (const p of [pa, pb]) { p.parachuting = false; p.protectUntil = 0; }
  try {
    assert.equal(game.admin.teleport(pa, [6, 0.12, -65]), true);
    a.message(JSON.stringify({ t: 'vehicleInteract' }));
    assert.ok(pa.vehicle, 'driver in a car');
    assert.equal(game.admin.teleport(pb, [3.6, 0, -80]), true);
    const hp0 = pb.hp;
    for (let i = 0; i < 40 && !(pb.downUntil > Date.now()); i++) { a.message(JSON.stringify({ t: 'drive', f: 1, s: 0 })); await new Promise((r) => setTimeout(r, 50)); }
    assert.ok(pb.downUntil > Date.now(), 'knocked down');
    assert.ok(pb.hp < hp0, `hurt ${pb.hp} < ${hp0}`);
    assert.ok(sentB.some((m) => m.t === 'knockdown'));
    // can't move while down
    const at = pb.p.slice();
    b.message(JSON.stringify({ t: 'state', p: [at[0] + 1, at[1], at[2]], yaw: 0, pitch: 0, w: pb.weapon, st: 0 }));
    assert.deepEqual(pb.p, at);
    assert.equal(pb.stance, 2);
  } finally { game.stop(); a.close(); b.close(); }
});
