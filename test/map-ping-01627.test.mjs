import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { project, unproject } from '../shared/minimap.js';
import { modelYaw } from '../public/vehicle-visuals.js';

test('0.16.27 minimap unproject inverts project', () => {
  for (const [x, z] of [[0, 0], [-31, 31], [12.5, -7], [80, -80]]) {
    const B = 80, S = 130, [u, v] = project(B, S, x, z), [wx, wz] = unproject(u, v, S, B);
    assert.ok(Math.abs(wx - x) < 1e-9 && Math.abs(wz - z) < 1e-9);
  }
});
test('0.16.27 mapPing wired on server and client (not the RTT ping)', () => {
  const g = fs.readFileSync(new URL('../shared/game.js', import.meta.url), 'utf8');
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(g, /case 'mapPing'/); assert.match(g, /t: 'mapPing'/);
  assert.match(c, /t:'mapPing'/); assert.match(c, /case 'mapPing'/);
});
test('0.16.27 GLB car facing: front ends verified per model', () => {
  // goblin/cyberpunk meshes face -Z (game forward); derby/cartech/carpavan face +Z and get +PI.
  for (const k of ['goblin', 'cyberpunk', 'porsche', 'sports', 'pickup', 'cyberpsycho']) assert.equal(modelYaw(k, 1, 4), 0);
  for (const k of ['derby', 'hatch', 'cartech', 'sedan', 'carpavan', 'suv', 'van']) assert.equal(modelYaw(k, 1, 4), Math.PI);
});
