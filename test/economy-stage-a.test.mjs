import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEconomy } from '../economy.js';
import { SHOP, ECONOMY, RARITIES, itemById, rotationAt, isListed, DAY_MS } from '../shared/shop.js';
import { t } from '../shared/i18n.js';

const PRICES = {
  'outfit.desert': [400, 'common', 'outfit'],
  'outfit.forest': [450, 'common', 'outfit'],
  'outfit.urban': [500, 'common', 'outfit'],
  'camo.digital': [350, 'common', 'camo'],
  'camo.rust': [550, 'uncommon', 'camo'],
  'camo.carbon': [700, 'rare', 'camo'],
  'outfit.arctic': [800, 'rare', 'outfit'],
  'outfit.night': [900, 'rare', 'outfit'],
  'camo.neon': [1200, 'epic', 'camo'],
  'outfit.inferno': [1400, 'epic', 'outfit'],
  'camo.plasma': [1600, 'epic', 'camo'],
  'camo.gold': [2400, 'legendary', 'camo'],
  'outfit.ghost': [2600, 'legendary', 'outfit'],
  'camo.obsidian': [2800, 'legendary', 'camo'],
};
// Week-aligned UTC midnight so day 0 and day 7 fall in different earn weeks.
const T0 = 20006 * DAY_MS;

function withEco(fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-econ-'));
    const economy = createEconomy({ dataDir: dir, remote: null });
    await economy.ready;
    try { await fn(economy); }
    finally {
      economy.flush();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

function listedAt(itemId) {
  for (let d = 0; d < 40; d++) {
    const now = T0 + d * DAY_MS;
    if (isListed(itemId, now)) return now;
  }
  throw new Error('not listed: ' + itemId);
}
function absentAt(itemId) {
  for (let d = 0; d < 40; d++) {
    const now = T0 + d * DAY_MS;
    if (!isListed(itemId, now)) return now;
  }
  throw new Error('always listed: ' + itemId);
}

test('Stage A catalog is 14 items totaling 16,650 CR', () => {
  assert.equal(SHOP.length, 14);
  assert.equal(Object.keys(PRICES).length, 14);
  let sum = 0;
  for (const item of SHOP) {
    const spec = PRICES[item.id];
    assert.ok(spec, item.id);
    assert.equal(item.price, spec[0]);
    assert.equal(item.rarity, spec[1]);
    assert.equal(item.slot, spec[2]);
    assert.ok(RARITIES.includes(item.rarity));
    assert.equal(item.discount, undefined);
    assert.ok(item.tint != null || item.color != null);
    assert.ok(item.slot === 'outfit' || item.slot === 'camo');
    sum += item.price;
  }
  assert.equal(sum, 16650);
  assert.equal(ECONOMY.startCredits, 500);
  assert.deepEqual(ECONOMY.credits, { kill: 10, headshot: 5, win: 100, played: 25 });
  assert.equal(ECONOMY.dailyCap, 600);
  assert.equal(ECONOMY.weeklyCap, 3500);
  assert.deepEqual(ECONOMY.levelUp, { credits: 35, maxPerDay: 3 });
  assert.deepEqual(ECONOMY.dailies.map((d) => d.credits), [40, 60, 80]);
  assert.equal(ECONOMY.weekly.credits, 300);
  assert.equal(ECONOMY.streak.daily, 20);
  assert.equal(ECONOMY.streak.day7, 150);
  for (const item of SHOP) {
    for (const lang of ['he', 'en', 'ru', 'ar']) {
      assert.notEqual(t('shop.' + item.id, {}, lang), 'shop.' + item.id);
      assert.notEqual(t('shop.rarity.' + item.rarity, {}, lang), 'shop.rarity.' + item.rarity);
    }
  }
});

test('daily rotation is 4 items and every item returns within 14 days', () => {
  const hits = new Map(SHOP.map((item) => [item.id, []]));
  const featured = new Set();
  for (let d = 0; d < 420; d++) {
    const rot = rotationAt(d * DAY_MS);
    assert.equal(rot.daily.length, 4);
    assert.equal(new Set(rot.daily.map((item) => item.id)).size, 4);
    assert.equal(rot.featuredDiscount, 0);
    assert.equal(rot.featured.price, itemById(rot.featured.id).price);
    const offer = new Set(rot.daily.map((item) => item.id));
    offer.add(rot.featured.id);
    assert.ok(offer.size === 4 || offer.size === 5);
    for (const item of rot.daily) hits.get(item.id).push(d);
  }
  for (const [id, days] of hits) {
    assert.ok(days.length > 1, id);
    for (let i = 1; i < days.length; i++) assert.ok(days[i] - days[i - 1] <= 14, id + ' gap ' + (days[i] - days[i - 1]));
  }
  for (let w = 0; w < 14; w++) featured.add(rotationAt(w * 7 * DAY_MS).featured.id);
  assert.equal(featured.size, 14);
});

test('match rates, dailies, streak and weekly pay once and stay inside the caps', withEco(async (economy) => {
  const id = 'g:sources@test';
  const fresh = economy.get(id);
  assert.equal(fresh.credits, 500);
  assert.equal(economy.profile(fresh, T0).caps.dayEarned, 0);

  const played = economy.award(id, { kills: 1, heads: 1, won: false, now: T0 });
  assert.equal(played.match, 40); // 10 + 5 + 25
  assert.equal(played.dailyCredits, 100); // play 40 + kill 60
  assert.equal(played.streakCredits, 20);
  assert.equal(played.weeklyCredits, 300);
  assert.equal(played.levelCredits, 0);
  assert.equal(played.credits, 460);
  assert.equal(played.cut, 0);

  const winner = 'g:win@test';
  const win = economy.award(winner, { kills: 0, won: true, now: T0 });
  assert.equal(win.match, 100);
  assert.equal(win.dailyCredits, 120); // play 40 + win 80
  assert.equal(win.streakCredits, 20);
  assert.equal(win.weeklyCredits, 300);
  assert.equal(win.credits, 540);

  const killDaily = economy.award(winner, { kills: 1, won: true, now: T0 + 1000 });
  assert.equal(killDaily.dailyCredits, 60);
  assert.equal(killDaily.streakCredits, 0);
  assert.equal(killDaily.weeklyCredits, 0);

  const again = economy.award(winner, { kills: 3, won: true, now: T0 + DAY_MS });
  assert.equal(again.dailyCredits, 180);
  assert.equal(again.streakCredits, 20);
  assert.equal(again.weeklyCredits, 0);

  const nextWeek = economy.award(winner, { kills: 0, won: false, now: T0 + 7 * DAY_MS });
  assert.equal(nextWeek.weeklyCredits, 300);
  assert.equal(nextWeek.dailyCredits, 40);
  assert.equal(nextWeek.streakCredits, 20);
}));

test('streak days 1-6 pay 20, day 7 pays 150, and a missed day does not reset or debit', withEco(async (economy) => {
  const id = 'g:streak@test';
  let previous = 0;
  for (let d = 0; d < 8; d++) {
    const reward = economy.award(id, { kills: 0, won: false, now: T0 + d * DAY_MS });
    if (d < 6) assert.equal(reward.streakCredits, 20);
    else if (d === 6) assert.equal(reward.streakCredits, 150);
    else assert.equal(reward.streakCredits, 20);
    assert.ok(economy.get(id).credits >= previous);
    previous = economy.get(id).credits;
  }
  assert.equal(economy.get(id).earn.streakDay, 1);

  const gapId = 'g:gap@test';
  economy.award(gapId, { kills: 0, won: false, now: T0 });
  const balance = economy.get(gapId).credits;
  const later = economy.award(gapId, { kills: 0, won: false, now: T0 + 3 * DAY_MS });
  assert.equal(later.streakCredits, 20);
  assert.equal(economy.get(gapId).earn.streakDay, 2);
  assert.ok(economy.get(gapId).credits > balance);
  const sameDay = economy.award(gapId, { kills: 0, won: false, now: T0 + 3 * DAY_MS + 1000 });
  assert.equal(sameDay.streakCredits, 0);
}));

test('level-up pays 35 CR, at most 3 grants a day, and the daily cap includes it', withEco(async (economy) => {
  const id = 'g:level@test';
  const prime = () => {
    const acc = economy.get(id);
    acc.xp = ECONOMY.levelXp(acc.level) - 100;
  };
  const rewards = [];
  for (let i = 0; i < 4; i++) {
    prime();
    rewards.push(economy.award(id, { kills: 0, won: false, now: T0 + i * 1000 }));
  }
  assert.equal(rewards[0].levelCredits, 35);
  assert.equal(rewards[1].levelCredits, 35);
  assert.equal(rewards[2].levelCredits, 35);
  assert.equal(rewards[3].levelCredits, 0);
  assert.equal(rewards[3].levelUps, 1);
  assert.equal(rewards[3].cut, 35);
  assert.equal(rewards[3].match, 25);
  const caps = economy.profile(economy.get(id), T0).caps;
  assert.equal(caps.levelGrants, 3);
  // 40 play + 20 streak + 300 weekly + 3*35 level + 4*25 played
  assert.equal(caps.dayEarned, 40 + 20 + 300 + 105 + 100);
  assert.ok(caps.dayEarned <= 600);
}));

test('daily cap cuts at 600 and the weekly cap cuts at 3500 before 7x600', withEco(async (economy) => {
  const id = 'g:caps@test';
  const first = economy.award(id, { kills: 200, won: true, now: T0 });
  assert.equal(first.credits, 600);
  assert.ok(first.cut > 0);
  assert.equal(economy.get(id).credits, 1100);
  assert.equal(economy.profile(economy.get(id), T0).caps.dayEarned, 600);
  const overflow = economy.award(id, { kills: 50, won: true, now: T0 + 2000 });
  assert.equal(overflow.credits, 0);
  assert.equal(economy.profile(economy.get(id), T0).caps.dayEarned, 600);

  const weekId = 'g:week@test';
  let gained = 0;
  for (let d = 0; d < 7; d++) {
    const before = economy.get(weekId).credits;
    economy.award(weekId, { kills: 200, won: true, now: T0 + d * DAY_MS });
    const delta = economy.get(weekId).credits - before;
    const caps = economy.profile(economy.get(weekId), T0 + d * DAY_MS).caps;
    assert.ok(caps.dayEarned <= 600);
    assert.ok(caps.weekEarned <= 3500);
    if (d < 5) assert.equal(delta, 600);
    if (d === 5) assert.equal(delta, 500);
    if (d === 6) assert.equal(delta, 0);
    gained += delta;
  }
  assert.equal(gained, 3500);
  assert.equal(economy.profile(economy.get(weekId), T0 + 6 * DAY_MS).caps.weekEarned, 3500);
  assert.equal(economy.get(weekId).credits, 500 + 3500);
}));

test('new purchases use the catalog price; owned items are not recharged', withEco(async (economy) => {
  const id = 'g:shop@test';
  const owned = economy.get(id);
  owned.credits = 9000;
  owned.owned = ['outfit.arctic'];
  const kept = economy.buy(id, 'outfit.arctic', 'purchase-owned-01', listedAt('outfit.arctic'));
  assert.equal(kept.ok, false);
  assert.equal(kept.key, 'shop.owned');
  assert.equal(economy.get(id).credits, 9000);

  const buyer = 'g:buyer@test';
  const arcticAt = listedAt('outfit.arctic');
  economy.get(buyer).credits = 799;
  const poor = economy.buy(buyer, 'outfit.arctic', 'purchase-poor-0001', arcticAt);
  assert.equal(poor.key, 'shop.noCredits');
  assert.equal(economy.get(buyer).credits, 799);
  economy.get(buyer).credits = 800;
  const bought = economy.buy(buyer, 'outfit.arctic', 'purchase-arctic-01', arcticAt);
  assert.equal(bought.ok, true);
  assert.equal(bought.price, 800);
  assert.equal(economy.get(buyer).credits, 0);
  const repeat = economy.buy(buyer, 'outfit.arctic', 'purchase-arctic-01', arcticAt);
  assert.equal(repeat.repeat, true);
  assert.equal(economy.get(buyer).credits, 0);

  const off = absentAt('outfit.desert');
  const outsider = 'g:off@test';
  economy.get(outsider).credits = 5000;
  const denied = economy.buy(outsider, 'outfit.desert', 'purchase-offrot-1', off);
  assert.equal(denied.key, 'shop.notInRotation');
  assert.equal(economy.get(outsider).credits, 5000);
  assert.equal(economy.get(outsider).owned.includes('outfit.desert'), false);
  economy.get(outsider).owned.push('outfit.desert');
  const equipped = economy.equip(outsider, 'outfit', 'outfit.desert');
  assert.equal(equipped.ok, true);

  const featured = rotationAt(T0).featured;
  const fan = 'g:fan@test';
  economy.get(fan).credits = featured.price;
  const sale = economy.buy(fan, featured.id, 'purchase-featured1', T0);
  assert.equal(sale.ok, true);
  assert.equal(sale.price, featured.price);
  assert.equal(economy.get(fan).credits, 0);
}));

test('staff grants and chest credits sit outside the earn cap; chest XP can still grant a level-up', withEco(async (economy) => {
  const id = 'g:outside@test';
  assert.equal(economy.grant(id, 100), true);
  assert.equal(economy.get(id).credits, 600);
  assert.equal(economy.profile(economy.get(id)).caps.dayEarned, 0);
  assert.equal(economy.profile(economy.get(id)).caps.weekEarned, 0);

  const looter = 'g:loot@test';
  const acc = economy.get(looter);
  acc.xp = ECONOMY.levelXp(1) - 10;
  assert.equal(economy.loot(looter, { credits: 15, xp: 25 }), true);
  assert.equal(acc.credits, 500 + 15 + 35);
  const caps = economy.profile(acc).caps;
  assert.equal(caps.dayEarned, 35);
  assert.equal(caps.levelGrants, 1);
}));
