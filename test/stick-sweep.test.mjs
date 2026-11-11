import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collides, clearMovement, PLAYER } from '../shared/physics.js';
import { CITY } from '../shared/city.js';
import { audit } from '../tools/playbot/sweep.mjs';

test('no invisible kerb, basin box, snap-back, graze, bad exit, ghost car or wedge', () => {
  const r = audit();
  assert.equal(r.kerbIntrusions, 0, `kerb in the carriageway ${r.kerbWorst}m`);
  assert.equal(r.basinPhantoms, 0, JSON.stringify(r.basin));
  assert.equal(r.snapBacks, 0, JSON.stringify(r.snapSamples));
  assert.equal(r.grazeStuck, 0, JSON.stringify(r.graze));
  assert.equal(r.exitInside, 0, JSON.stringify(r.exit));
  assert.equal(r.exit.onKerb, true, 'driver steps onto the sidewalk, not into it');
  assert.equal(r.ghostParts, 0, 'car parts left behind after a reset');
  assert.equal(r.parts.home, 1, 'reset puts the car collision back on its bay');
  assert.equal(r.vehicleWedges, 0, JSON.stringify(r.wedge));
});

test('a wall is still a wall, and a toppled prop is not', () => {
  const wall = [{ min: [-0.2, 0, -4], max: [0.2, 3, 4] }];
  assert.equal(clearMovement([-2, 0, 0], [2, 0, 0], wall), false);
  assert.equal(clearMovement([-2, 0, 0], [-1, 0, 0], wall), true);
  // A performance.now()-scale timer must not count as "down": that was the fallen-statue ghost.
  const prop = { min: [-0.4, 0, -0.4], max: [0.4, 2, 0.4], breakable: true, knockedUntil: 120000 };
  assert.ok(collides(0, 0.2, 0, [prop], 1.5), 'a short clock does not remove the prop');
  prop.knockedUntil = Date.now() + 1000;
  assert.equal(collides(0, 0.2, 0, [prop], 1.5), null);
  prop.knockedUntil = 0; prop.hitUntil = Date.now() + 1000;
  assert.equal(collides(0, 0.2, 0, [prop], PLAYER.height), null);
});

test('fountain column stays, the open basin does not, a statue plinth matches its mesh', () => {
  assert.ok(collides(-38, 0.4, -38, CITY.boxes, 1), 'fountain column');
  assert.equal(collides(-38 + 1.4, 0.4, -38, CITY.boxes, 1, 0.2), null, 'basin water is open');
  assert.ok(collides(38, 0.5, -38, CITY.boxes, 1.5), 'statue plinth');
  // the plinth is the 1.8 m mesh, not a wider box
  assert.equal(collides(38 + 1.15, 0.5, -38, CITY.boxes, 1, 0.1), null);
});

test('the client drops prop collision on the server clock, not a frame clock', () => {
  const src = fs.readFileSync('public/client.js', 'utf8');
  assert.match(src, /best\.knockedUntil = Date\.now\(\) \+ 60000/);
  assert.match(src, /case 'propsDown'/);
  assert.doesNotMatch(src, /knockedUntil = now \+ 60000/);
});

test('supply crates on the lawn match the mesh; the falling event crate is drawn, not a leftover box', () => {
  for (const [x, z] of [[8, 56], [-12, -56]]) {
    const hit = collides(x, 0.4, z, CITY.boxes, 0.5, 0.2);
    assert.ok(hit, `scenery crate ${x},${z}`);
    assert.ok(hit.max[0] - hit.min[0] <= 1.5 && hit.max[1] <= 1 && hit.max[2] - hit.min[2] <= 1.1);
  }
});
