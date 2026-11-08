// 0.16.44: civilians on the city sidewalks (shared/civilians.js)
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY } from '../shared/city.js';
import { createCivilians, CIV } from '../shared/civilians.js';
import { createGame } from '../shared/game.js';

test('civilians walk on sidewalks, panic at gunfire, can be shot and run over, then someone new walks in', () => {
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); // repeatable placement
  const civ = createCivilians(CITY, { count: 8, rnd });
  assert.equal(civ.list.length, 8);
  for (const c of civ.list) assert.ok(c.p[1] >= 0.1, 'on the raised sidewalk');
  const c = civ.list[0], x0 = [...c.p];
  civ.tick(0.5); assert.ok(Math.hypot(c.p[0] - x0[0], c.p[2] - x0[2]) > 0.3, 'walking');
  civ.scare(c.p); assert.ok(c.flee > 0, 'panics');
  // a shot straight at the chest
  const o = [c.p[0] + 6, c.p[1] + 1.3, c.p[2]], hit = civ.ray(o, [-1, 0, 0], 50);
  assert.ok(hit && hit.c === c);
  civ.hit(c, CIV.hp + 1, o); assert.equal(c.alive, false);
  assert.equal(civ.state().find((s) => s[0] === c.id)[4], 2, 'shown lying down');
  // a fast car through another one
  const d = civ.list[1];
  civ.tick(0.016, [], [{ p: [...d.p], speed: 12, yaw: 0 }]); assert.equal(d.alive, false);
  const e = civ.list[2];
  civ.tick(0.016, [], [{ p: [...e.p], speed: 1, yaw: 0 }]); assert.equal(e.alive, true, 'a slow car only nudges past');
  c.deadAt = Date.now() - CIV.respawnMs - 1; civ.tick(0.016); assert.equal(c.alive, true, 'someone new walks in');
});

test('the match carries civilians in its snapshots (city) and has none on small maps', async () => {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0 }); game.start();
  const sent = []; const a = game.connect({ readyState: 1, send: (s) => sent.push(JSON.parse(s)), close() {} });
  try {
    a.message(JSON.stringify({ t: 'join', name: 'Walker' }));
    await new Promise((r) => setTimeout(r, 400));
    const snap = sent.filter((m) => m.t === 'snap').at(-1);
    assert.ok(snap && Array.isArray(snap.civ) && snap.civ.length === 8);
  } finally { a.close?.(); game.stop(); delete globalThis.localStorage; }
});
