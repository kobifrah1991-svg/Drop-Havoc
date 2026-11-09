// 0.16.58 plunger grapple: the match validates the shot, the pull reaches the wall fast, the server accepts the flight
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/game.js';
import { GRAPPLE, grapplePull, grappleCharges } from '../shared/grapple.js';
import { step, rayWorld, PLAYER } from '../shared/physics.js';
import { MAPS } from '../shared/map.js';

async function solo(fn) {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const out = [];
  const a = game.connect({ readyState: 1, send: (s) => out.push(JSON.parse(s)), close() {} });
  a.message(JSON.stringify({ t: 'join', name: 'A' }));
  await new Promise((r) => setTimeout(r, 300));
  const p = a.player(); p.parachuting = false; p.alive = true; p.onGround = true;
  try { await fn({ a, p, out, game }); } finally { game.stop?.(); }
}
// a spot in the street with a building wall straight ahead (-z) within range
function aimAtWall() {
  const boxes = MAPS.city.boxes;
  for (let x = -100; x <= 100; x += 3) for (let z = -100; z <= 100; z += 3) {
    const eye = [x, PLAYER.eye, z], d = [0, 0.25, -1], l = Math.hypot(...d), dn = d.map((v) => v / l);
    const dist = rayWorld(eye, dn, boxes, GRAPPLE.range);
    if (dist > 14 && dist < 30 && rayWorld([x, 0.5, z], [0, -1, 0], boxes, 1) > 0.45) return { p: [x, 0, z], d: dn, dist };
  }
  return null;
}

test('the rope pulls you to the wall in about a second and lets go there', () => {
  const s = aimAtWall(); assert.ok(s, 'found a wall to aim at');
  const pt = [s.p[0] + s.d[0] * s.dist, PLAYER.eye + s.d[1] * s.dist, s.p[2] + s.d[2] * s.dist];
  const st = { p: s.p.slice(), v: [0, 0, 0], yaw: 0, onGround: true, stance: 0, grapple: { pt, t: 0 } };
  let t = 0; while (st.grapple && t < 4) { if (!grapplePull(st, PLAYER.eye, 1 / 60)) st.grapple = null; step(st, { f: 0, s: 0, jump: false, yaw: 0 }, 1 / 60, MAPS.city.boxes); t += 1 / 60; }
  const left = Math.hypot(pt[0] - st.p[0], pt[2] - st.p[2]);
  assert.ok(t < GRAPPLE.maxMs / 1000, 'let go after ' + t.toFixed(2) + ' s');
  assert.ok(left < 3, 'ended ' + left.toFixed(1) + ' m from the plunger (started ' + s.dist.toFixed(1) + ')');
});

test('the match checks the shot (charges, range) and accepts the fast flight without snapping you back', async () => {
  const s = aimAtWall();
  await solo(async ({ a, p, out }) => {
    p.p = s.p.slice(); p.lastState = Date.now() - 50; p.stance = 0;
    const eye = [p.p[0], p.p[1] + PLAYER.eye, p.p[2]];
    a.message(JSON.stringify({ t: 'grapple', o: eye, d: s.d }));
    const ok = out.find((m) => m.t === 'grapple'); assert.ok(ok && ok.pt && !ok.no, 'hooked: ' + JSON.stringify(ok));
    assert.equal(ok.n, GRAPPLE.charges - 1);
    // fly the path, sending positions 20 times a second like the client
    const st = { p: p.p.slice(), v: [0, 0, 0], yaw: 0, onGround: true, stance: 0, grapple: { pt: ok.pt, t: 0 } };
    for (let i = 0; i < 40 && st.grapple; i++) {
      for (let k = 0; k < 3; k++) { if (st.grapple && !grapplePull(st, PLAYER.eye, 1 / 60)) st.grapple = null; step(st, { f: 0, s: 0, jump: false, yaw: 0 }, 1 / 60, MAPS.city.boxes); }
      p.lastState = Date.now() - 50; a.message(JSON.stringify({ t: 'state', p: st.p, yaw: 0, pitch: 0, w: p.weapon, st: 0 }));
    }
    assert.equal(out.filter((m) => m.t === 'correct').length, 0, 'no snap-back while on the rope');
    assert.ok(Math.hypot(p.p[0] - s.p[0], p.p[2] - s.p[2]) > s.dist * 0.6, 'the server moved with the player');
    // out of charges: refused
    p.grappleN = 0; p.grappleRegenAt = Date.now(); p.grappleShotAt = 0; out.length = 0;
    a.message(JSON.stringify({ t: 'grapple', o: [p.p[0], p.p[1] + PLAYER.eye, p.p[2]], d: s.d }));
    assert.ok(out.find((m) => m.t === 'grapple')?.no);
  });
});

test('without the rope the same speed is still caught as too fast', async () => {
  const s = aimAtWall();
  await solo(async ({ a, p, out }) => {
    p.p = s.p.slice(); p.lastState = Date.now() - 50;
    a.message(JSON.stringify({ t: 'state', p: [p.p[0], p.p[1], p.p[2] - 2.5], yaw: 0, pitch: 0, w: p.weapon, st: 0 }));
    assert.ok(out.some((m) => m.t === 'correct'));
  });
});

test('charges come back over time', () => {
  const p = { grappleN: 0, grappleRegenAt: 0 };
  assert.equal(grappleCharges(p, GRAPPLE.regenMs * 2 + 10), 2);
  assert.equal(grappleCharges(p, GRAPPLE.regenMs * 10), GRAPPLE.charges);
});

test('random punch hands are taken from the player, and someone lying down gets kicked harder', async () => {
  const { FISTS } = await import('../shared/weapons.js');
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"jungle"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const outB = [];
  const a = game.connect({ readyState: 1, send() {}, close() {} }), b = game.connect({ readyState: 1, send: (s) => outB.push(JSON.parse(s)), close() {} });
  a.message(JSON.stringify({ t: 'join', name: 'A' })); b.message(JSON.stringify({ t: 'join', name: 'B' }));
  await new Promise((r) => setTimeout(r, 300));
  const pa = a.player(), pb = b.player();
  try {
    for (const p of [pa, pb]) { p.parachuting = false; p.alive = true; p.protectUntil = 0; p.passive = false; p.armor = 0; p.hp = 200; }
    pa.p = [-5, 0, 45]; pa.yaw = 0; pb.p = [-5, 0, 43.8]; pb.yaw = Math.PI; pa.rtt = 0; const now = Date.now(); for (const p of [pa, pb]) p.history = [{ t: now - 1000, p: p.p.slice() }, { t: now + 1000, p: p.p.slice() }];
    const punch = (side) => { pa.lastShot.fists = 0; pa.comboAt = 0; a.message(JSON.stringify({ t: 'melee', w: 'fists', yaw: 0, pitch: 0, side })); };
    punch(1); punch(1); punch(-1);
    assert.deepEqual(outB.filter((m) => m.t === 'swing').map((m) => m.side), [1, 1, -1], 'right, right, left as the player threw them');
    pb.stance = 2; const hp = pb.hp; punch(1);
    const last = outB.filter((m) => m.t === 'swing').pop(); assert.equal(last.kick, 1);
    assert.equal(hp - pb.hp, Math.round(FISTS.damage * 1.45));
  } finally { game.stop?.(); }
});

test('the sprint carry pose and the kick are in the character animation', () => {
  const v = fs.readFileSync(new URL('../public/visuals.js', import.meta.url), 'utf8');
  assert.match(v, /c\.sprintW/); assert.match(v, /act\.time \/ clip\.duration/); assert.match(v, /kicking && b\.rThigh/);
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(c, /e\.code === 'KeyV'/); assert.match(c, /hold\('t-grapple', fireGrapple\)/);
});

test('0.16.59 a click fires on the click itself, and the third-person camera never sits inside your own body', () => {
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(c, /if \(e\.button === 0\) \{ mouseDown = true; tryFire\(performance\.now\(\)\); \}/);
  assert.match(c, /mouseDown = true; tryFire\(performance\.now\(\)\); if \(lookId === null\)/); // phone fire button too
  assert.match(c, /camera\.position\.y=Math\.max\(camera\.position\.y,me\.p\[1\]\+0\.75\)/);
  assert.match(c, /dropAvatar\.group\.visible=false; \/\/ 0\.16\.59/);
});

test('0.16.60 no stand-in skins and no stale art after an update', () => {
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(c, /if \(!id\) return null; \/\/ 0\.16\.60/); // street civilians only with a civilian model
  assert.match(c, /skinWaitUntil: skinPending/); assert.match(c, /r\.group\.visible = !\(r\.skinWaitUntil && now < r\.skinWaitUntil\)/);
  assert.match(c, /setURLModifier/); assert.match(c, /'v=' \+ APP_VERSION/);
  assert.match(c, /localStorage\.getItem\('dh\.assetsVer'\) !== APP_VERSION/);
  assert.doesNotMatch(c, /localStorage\.clear\(\)/); // the player's own data is never wiped
});
