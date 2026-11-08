// 0.16.44 review fixes: league eligibility, passive holes, summon limits, free-roam loot refill
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEconomy, LEAGUE } from '../economy.js';
import { createChests, REFILL } from '../shared/chests.js';
import { createVehicles, SUMMON } from '../shared/vehicles.js';
import { CITY } from '../shared/city.js';

test('league: never from practice or private rooms, only real-player kills, daily cap', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-league-'));
  const eco = createEconomy({ dataDir: dir, remote: null });
  try {
    const id = 'g:someone@example.test';
    let r = eco.award(id, { kills: 20, humanKills: 0, heads: 5, won: true }); // practice / private room: no league option
    assert.equal(r.league, null);
    r = eco.award(id, { kills: 20, humanKills: 2, heads: 9, won: true }, { league: true, humans: 2 });
    assert.ok(r.league.eligible);
    assert.equal(r.league.points, 2 * LEAGUE.kill + 2 * LEAGUE.head + LEAGUE.played, 'bot kills and a 2-human win do not count');
    for (let i = 0; i < 20; i++) eco.award(id, { humanKills: 30, heads: 30, won: true }, { league: true, humans: 8 });
    assert.ok(eco.leagueRank(id).points <= LEAGUE.dailyCap + 20, 'daily cap');
    assert.equal(eco.award('d:00000000-0000-0000-0000-000000000000', { humanKills: 5 }, { league: true, humans: 4 }).league.eligible, false, 'guests are not in the league');
  } finally { eco.flush(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('free roam: taken loot comes back after a while, never in front of a player', () => {
  const sent = [];
  const c = createChests(CITY, { broadcast: (m) => sent.push(m), send() {}, reward() {}, grantEquipment: () => true, random: () => 0.1 });
  const d = c.dropState()[0];
  const p = { alive: true, p: [...d.p], stance: 0 };
  assert.ok(c.pickup(p, d.id));
  const later = Date.now() + REFILL.rareMs + 1;
  assert.equal(c.refill(later, [d.p]), 0, 'someone is standing there');
  assert.ok(c.refill(later, []) >= 1, 'refilled when nobody is near');
});

test('summoned car: once a minute, not right after a fight, keeps its damage', () => {
  const map = { boxes: Object.assign([{ min: [-110, -1, -110], max: [110, 0, 110] }], { ramps: [] }), ramps: [], bounds: 111 };
  const v = createVehicles(map, { send() {}, broadcast() {}, playerById() {} });
  const p = { id: 'a', alive: true, p: [0, 0, 0], yaw: 0, stance: 0, lastFire: 0, lastHurt: 0 };
  assert.equal(v.summon(p, 'cyberpunk'), true);
  const own = v._cars.find((c) => c.owner === 'a'); own.hp = 300;
  assert.equal(v.summon(p, 'cyberpunk'), false, 'cooldown');
  p.summonAt = Date.now() - SUMMON.cooldownMs - 1; p.lastFire = Date.now();
  assert.equal(v.summon(p, 'cyberpunk'), false, 'not straight out of a fight');
  p.lastFire = 0; assert.equal(v.summon(p, 'cyberpunk'), true); assert.equal(own.hp, 300, 'no free repair');
  v.removeOwned('a'); assert.ok(!v._cars.some((c) => c.owner === 'a'), 'removed when the owner leaves');
});
