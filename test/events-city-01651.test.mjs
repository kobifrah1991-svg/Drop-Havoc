// 0.16.51 live events + a denser city (apartment blocks with floors, one playground, fewer trees)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/game.js';
import { EVENT } from '../shared/events.js';
import { CITY } from '../shared/city.js';
import { step } from '../shared/physics.js';
import { t, CORE_LANGS } from '../shared/i18n.js';

async function play(fn) {
  globalThis.localStorage = { getItem: (k) => (k === 'arena.map' ? '"city"' : null) };
  const game = createGame({ bots: 0, mode: 'roam' }); game.start();
  const outA = [], outB = [];
  const a = game.connect({ readyState: 1, send: (s) => outA.push(JSON.parse(s)), close() {} });
  const b = game.connect({ readyState: 1, send: (s) => outB.push(JSON.parse(s)), close() {} });
  a.message(JSON.stringify({ t: 'join', name: 'A' })); b.message(JSON.stringify({ t: 'join', name: 'B' }));
  await new Promise((r) => setTimeout(r, 300));
  try { for (const p of [a.player(), b.player()]) { p.parachuting = false; p.alive = true; } await fn({ game, ev: game._events, a, b, outA, outB }); } finally { game.stop?.(); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('supply drop: the first one at the crate after it lands gets cash and gear; everyone hears who won', async () => {
  await play(async ({ ev, a, outA, outB }) => {
    const e = ev._force('supply'); assert.ok(e && e.p);
    assert.ok(outB.some((m) => m.t === 'event' && m.start && m.type === 'supply'));
    e.landAt = Date.now() - 1; const p = a.player(), cash0 = p.cash; p.p = [e.p[0] + 0.5, 0, e.p[2]];
    await wait(400);
    const end = outB.find((m) => m.t === 'event' && m.end);
    assert.ok(end && end.winner === p.id && end.cash === EVENT.supply.cash);
    assert.equal(p.cash, cash0 + EVENT.supply.cash);
    assert.ok(!ev.view(), 'event over');
  });
});
test('most wanted: whoever takes the top killer down collects the bounty', async () => {
  await play(async ({ ev, game, a, b, outA }) => {
    const pa = a.player(), pb = b.player(); pb.kills = 5;
    // a third body so the bounty can start (needs 3 alive)
    const c = game.connect({ readyState: 1, send() {}, close() {} }); c.message(JSON.stringify({ t: 'join', name: 'C' })); await wait(200); c.player().parachuting = false; c.player().alive = true;
    const e = ev._force('bounty'); assert.ok(e); assert.equal(e.target, pb.id);
    const cash0 = pa.cash; ev.onKill(pa, pb);
    const end = outA.find((m) => m.t === 'event' && m.end);
    assert.equal(end.winner, pa.id); assert.equal(pa.cash, cash0 + EVENT.bounty.cash);
  });
});
test('delivery: driving the marked car into the goal pays the driver', async () => {
  await play(async ({ ev, a, outA }) => {
    const e = ev._force('delivery'); assert.ok(e && e.dest);
    const p = a.player(), car = game_car(ev, e); car.driver = p.id; p.vehicle = car.id; car.p = [e.dest[0] + 2, 0, e.dest[2]];
    const cash0 = p.cash; await wait(400);
    assert.ok(outA.some((m) => m.t === 'event' && m.end && m.winner === p.id && m.how === 'delivered'));
    assert.equal(p.cash, cash0 + EVENT.delivery.cash);
  });
});
function game_car(ev, e) { return ev._cars.find((c) => c.id === e.car); }
test('city: apartment blocks you can climb to the top, one playground, fewer trees', () => {
  const apts = CITY.buildings.filter((b) => b.floors >= 4); assert.ok(apts.length >= 3);
  assert.equal(CITY.boxes.street.playgrounds.length, 1);
  assert.ok(CITY.boxes.decorations.filter((d) => d.tree).length <= 36);
  const [cx, , cz] = apts.find((b) => b.floors === 5).center;
  const st = { p: [cx + 4.9, 0.05, cz - 4.7], v: [0, 0, 0], yaw: 0, pitch: 0, stance: 0, onGround: true };
  const walk = (tx, tz, secs) => { for (let i = 0; i < secs * 60; i++) { const dx = tx - st.p[0], dz = tz - st.p[2]; if (Math.hypot(dx, dz) < 0.15) return; step(st, { f: 1, s: 0, yaw: Math.atan2(-dx, -dz) }, 1 / 60, CITY.boxes); } };
  for (let k = 0; k < 4; k++) { const up = k % 2 === 0, x = up ? cx + 4.9 : cx + 3.6; walk(x, up ? cz - 4.6 : cz + 4.6, 3); walk(x, up ? cz + 4.75 : cz - 4.75, 8); walk(up ? cx + 3.6 : cx + 4.9, up ? cz + 4.75 : cz - 4.75, 3); }
  assert.ok(st.p[1] > 12.5, `reached ${st.p[1].toFixed(1)} m`);
  assert.ok(CITY.floorLoot.some((f) => f.p[1] > 12 && f.rare), 'better loot up top');
});
test('events speak every language and show on screen and on the minimap', () => {
  for (const l of CORE_LANGS) for (const k of ['supply', 'bounty', 'delivery']) assert.notEqual(t(`event.${k}.title`, {}, l), `event.${k}.title`);
  const c = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  assert.match(c, /case 'event': evVis\.set\(m\); break;/); assert.match(c, /events:evVis\.markers\(\)/);
});
