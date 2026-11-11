// 0.16.50: walk-in gun shop (cash from kills, checkpoint, server-checked purchases), exact car collisions, car speed,
// seat choice (E driver / G passenger), fitted gear, key-art opening
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/game.js';
import { CASH, GUN_ITEMS, SHOP_REACH } from '../shared/gunshop.js';
import { CITY } from '../shared/city.js';
import { createVehicles, carDims, carPerf, carParts } from '../shared/vehicles.js';
import { collides } from '../shared/physics.js';
const src = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('gun shop: buy at the checkpoint with match cash; refused away from it, without cash, or when it does nothing', async () => {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const out = []; const a = game.connect({ readyState: 1, send: (s) => out.push(JSON.parse(s)), close() {} });
  try {
    a.message(JSON.stringify({ t: 'join', name: 'A' })); await new Promise((r) => setTimeout(r, 300));
    const p = a.player(); p.parachuting = false; p.alive = true;
    assert.equal(p.cash, CASH.start);
    const last = () => [...out].reverse().find((m) => m.t === 'gunshop');
    p.p = [CITY.gunshop.p[0] + 6, 0, CITY.gunshop.p[2]]; a.message(JSON.stringify({ t: 'buyGun', id: 'smg' }));
    assert.equal(last().fail, 'far'); assert.ok(!p.inventory.has('smg'));
    p.p = [CITY.gunshop.p[0], 0, CITY.gunshop.p[2]]; p.cash = 100; a.message(JSON.stringify({ t: 'buyGun', id: 'sniper' }));
    assert.equal(last().fail, 'cash'); assert.equal(p.cash, 100);
    p.cash = 1000; a.message(JSON.stringify({ t: 'buyGun', id: 'm4' }));
    assert.equal(last().bought, 'm4'); assert.ok(p.inventory.has('m4')); assert.equal(p.cash, 1000 - GUN_ITEMS.find((x) => x.id === 'm4').price);
    p.hp = 200; a.message(JSON.stringify({ t: 'buyGun', id: 'bandage' })); assert.equal(last().fail, 'full', 'full health: no charge');
    a.message(JSON.stringify({ t: 'buyGun', id: 'nope' })); assert.equal(last().fail, 'full', 'unknown item does nothing new');
  } finally { game.stop?.(); }
});
test('gun shop building: solid walls with a doorway, counter, checkpoint inside, nothing else in the way', () => {
  const G = CITY.gunshop, inside = (x, z) => x > G.x0 && x < G.x1 && z > G.z0 && z < G.z1;
  assert.ok(inside(G.p[0], G.p[2]) && SHOP_REACH < 2);
  assert.ok(collides(G.x1 - 0.1, 0.5, 13, CITY.boxes, 0.3), 'back wall (east)'); assert.equal(G.door.x, G.x0, 'door on the street side (west)'); assert.ok(collides(-21, 0.5, G.z1 - 0.1, CITY.boxes, 0.3), 'side wall'); assert.ok(G.x1 - G.x0 >= 12 && G.z1 - G.z0 >= 12, 'house-sized');
  assert.ok(!collides(G.door.x, 0.5, (G.door.z0 + G.door.z1) / 2, CITY.boxes, 0.3), 'door is open');
  assert.ok(!collides(G.p[0], 0.5, G.p[2], CITY.boxes, 0.3), 'checkpoint is free');
  assert.ok(collides(-21.6, 0.5, 13, CITY.boxes, 0.3), 'counter');
  assert.equal(CITY.floorLoot.filter((f) => inside(f.p[0], f.p[2])).length, 0);
});
test('cars: per-model size and speed; collision parts hug the turned car', () => {
  assert.ok(carDims('compact').hz < carDims('sedan').hz && carDims('sedan').hz <= carDims('sports').hz);
  assert.ok(carPerf('sports').top >= 40 && carPerf('sedan').top >= 32 && carPerf('compact').top < carPerf('sports').top);
  const d = carDims('sedan'), parts = carParts([0, 0, 0], Math.PI / 4, d), inPart = (x, z) => parts.some((b) => x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2]);
  const old = 0.707 * (d.hx + d.hz); // half-size of the old axis-aligned box around a car at 45 degrees
  assert.ok(!inPart(old * 0.85, -old * 0.85) && !inPart(-old * 0.85, old * 0.85), 'empty corners of the old box are free now');
  assert.ok(inPart(0, 0) && inPart(-Math.sin(Math.PI / 4) * d.hz * 0.8, -Math.cos(Math.PI / 4) * d.hz * 0.8), 'the car itself is solid');
});
test('E only drives, G joins a driven car as passenger', () => {
  const map = { boxes: Object.assign([], { ramps: [] }), ramps: [], bounds: 400 };
  const A = { id: 'a', alive: true, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, stance: 0 }, B = { id: 'b', alive: true, p: [0, 0, 0], v: [0, 0, 0], yaw: 0, stance: 0 };
  const v = createVehicles(map, { send: () => {}, broadcast: () => {}, playerById: (id) => (id === 'a' ? A : id === 'b' ? B : null) });
  const [c, ...rest] = v._cars; for (const o of rest) o.p = [9999, 0, 9999];
  c.p = [0, 0, 0]; A.p = [1, 0, 0]; B.p = [-1, 0, 0];
  assert.equal(v.interact(B, { seat: 'passenger' }), false, 'no driver yet: G does nothing');
  assert.equal(v.interact(A, { seat: 'driver' }), true); assert.equal(c.driver, 'a');
  assert.equal(v.interact(B, { seat: 'driver' }), false, 'E never takes the passenger seat');
  assert.equal(v.interact(B, { seat: 'passenger' }), true); assert.equal(c.passenger, 'b');
});
test('fitted gear, gearbox engine, key art opening, prompts with icons', () => {
  assert.match(src('public/gear-visuals.js'), /function cutShell\(mesh, part, off\)/);
  assert.match(src('public/client.js'), /engine\.gear\+\+;engine\.shiftT=0\.16/);
  assert.match(src('public/index.html'), /<div class="sp-poster"><\/div>/); // 0.16.65: the opening is the studio mark, then the poster
  assert.ok(fs.existsSync(new URL('../public/img/keyart.webp', import.meta.url)));
  assert.match(src('public/client.js'), /paintCarBtn\(carRideBtn,'G','ride'/);
  const client = src('public/client.js');
  assert.match(client, /setAttribute\('aria-label',label\)/);
  assert.match(client, /img\/hud\/car-enter\.svg/);
  assert.match(client, /img\/hud\/car-exit\.svg/);
  assert.equal(client.includes("querySelector('span').textContent=label"), false);
  for (const f of ['car-enter.svg', 'car-exit.svg', 'car-ride.svg']) {
    assert.ok(fs.existsSync(new URL('../public/img/hud/' + f, import.meta.url)), f);
  }
});
test('cars are created on screen (a stray comment once swallowed the line that makes them)', async () => {
  const THREE = await import('three'); const { createVehicleVisuals } = await import('../public/vehicle-visuals.js');
  const boxes = []; const vv = createVehicleVisuals(new THREE.Scene(), boxes, { carParts, carDims });
  vv.sync([{ id: 'v-0', kind: 'sedan', p: [5, 0, 5], yaw: 0.7, speed: 0, hp: 1000, driver: null }]);
  assert.equal(vv.list().length, 1);
  assert.equal(boxes.length, 4, 'four collision parts for the client');
  assert.ok(boxes.some((b) => 5 > b.min[0] && 5 < b.max[0] && 5 > b.min[2] && 5 < b.max[2]), 'parts follow the car');
});
