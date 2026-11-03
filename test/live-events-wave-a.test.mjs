import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SHOP, SLOTS, itemById } from '../shared/shop.js';
import { createChests } from '../shared/chests.js';
import { createEconomy } from '../economy.js';
import {
  WAVE, PLACEHOLDER, HOUR_MS, DAY_MS, NEON_CAMO_PRICE, KILL_FLASH_MS,
  assertCatalog, eventWindows, resolveLive, publicSnapshot, grantFor, killFlashFor,
  rareBoostFor, featuredOffer, bannerModel,
} from '../shared/events.js';

const T0 = Date.parse('2026-11-04T00:00:00.000Z');
const on = { DH_LIVE_EVENTS: '1' };

test('wave is Neon Strike then Supply Frenzy, with Havoc Night absent', () => {
  assert.deepEqual(WAVE.map((e) => e.id), ['neon-strike', 'supply-frenzy']);
  assert.deepEqual(assertCatalog(SHOP, SLOTS), []);
  assert.equal(itemById('camo.neon').price, NEON_CAMO_PRICE);
  assert.equal(itemById('outfit.neon'), null);
  assert.equal(SHOP.some((i) => /loot|crate|nameplate|wrap|nexus|havoc-night/i.test(i.id)), false);
  assert.deepEqual(SLOTS, ['outfit', 'camo']);
  const blob = JSON.stringify(WAVE);
  assert.equal(blob.includes('havoc'), false);
});

test('flags default off and only one event is live', () => {
  const off = publicSnapshot(T0 + 1000, {});
  assert.equal(off.enabled, false);
  assert.equal(off.live, null);
  assert.equal(off.banner, false);

  const neon = resolveLive(T0 + 1000, on);
  assert.equal(neon.live.id, 'neon-strike');
  assert.equal(neon.banner, false);

  const overlap = resolveLive(T0 + 1000, { ...on, DH_SUPPLY_FRENZY_START: new Date(T0).toISOString(), DH_SUPPLY_FRENZY_END: new Date(T0 + 3 * DAY_MS).toISOString() });
  assert.equal(overlap.live.id, 'neon-strike');
  assert.equal(publicSnapshot(T0 + 1000, on).live.id, 'neon-strike');

  const afterNeon = T0 + 7 * DAY_MS + 1000;
  const frenzy = resolveLive(afterNeon, on);
  assert.equal(frenzy.live.id, 'supply-frenzy');
  assert.ok(frenzy.live.endsAt - frenzy.live.startsAt <= 72 * HOUR_MS);
  assert.ok(frenzy.live.endsAt - frenzy.live.startsAt >= 48 * HOUR_MS);

  const done = resolveLive(afterNeon + 61 * HOUR_MS, on);
  assert.equal(done.live, null);
});

test('placeholder windows are 7 days then 60 hours UTC', () => {
  const w = eventWindows({});
  assert.equal(w.neonMs, 7 * DAY_MS);
  assert.equal(w.supplyMs, 60 * HOUR_MS);
  assert.equal(w['neon-strike'].startsAt, Date.parse(PLACEHOLDER.waveAnchorUtc));
  assert.equal(w['supply-frenzy'].startsAt, w['neon-strike'].endsAt);
  assert.equal(w['supply-frenzy'].endsAt - w['supply-frenzy'].startsAt, 60 * HOUR_MS);
});

test('force selects one event and refuses Havoc Night', () => {
  const neon = resolveLive(T0, { ...on, DH_EVENT_FORCE: 'neon-strike' });
  assert.equal(neon.live.id, 'neon-strike');
  const supply = resolveLive(T0, { ...on, DH_EVENT_FORCE: 'supply-frenzy' });
  assert.equal(supply.live.id, 'supply-frenzy');
  const havoc = resolveLive(T0 + 1000, { ...on, DH_EVENT_FORCE: 'havoc-night' });
  assert.equal(havoc.live.id, 'neon-strike');
  assert.equal(JSON.stringify(havoc).includes('havoc-night'), false);
  assert.equal(resolveLive(T0 + 1000, { ...on, DH_EVENT_FORCE: 'off' }).live, null);
});

test('lobby banner is a separate gate and never two banners', () => {
  const snap = publicSnapshot(T0 + 1000, { ...on, DH_EVENT_BANNER: '1' });
  assert.equal(snap.banner, true);
  assert.equal(snap.live.id, 'neon-strike');
  assert.equal(bannerModel(snap).id, 'neon-strike');
  assert.equal(bannerModel(publicSnapshot(T0 + 1000, on)), null);
  assert.equal(Array.isArray(snap.live), false);
});

test('grants add no credits; wrap is kept; runner expires and is not a nameplate', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-events-'));
  const eco = createEconomy({ dataDir: dir, remote: null });
  await eco.ready;
  const id = 'd:11111111-1111-1111-1111-111111111111';
  eco.get(id).credits = 5000;
  eco.flush();
  const before = eco.get(id).credits;
  const wrap = eco.grantNeonWrap(id, T0);
  assert.equal(wrap.creditsDelta, 0);
  assert.equal(wrap.keep, true);
  assert.equal(eco.get(id).credits, before);
  assert.equal(eco.get(id).owned.includes('wrap.neon'), false);
  assert.equal(eco.grantNeonWrap(id, T0 + 10).repeat, true);
  assert.equal(eco.profile(eco.get(id), T0 + 30 * DAY_MS).events.wrapNeon, true);

  const live = resolveLive(T0 + 8 * DAY_MS, on).live;
  const action = grantFor(live, 'chest-open');
  assert.equal(action.creditsDelta, 0);
  assert.equal(action.nameplate, false);
  const tag = eco.grantSupplyRunner(id, action.expiresAt, T0 + 8 * DAY_MS);
  assert.equal(tag.creditsDelta, 0);
  assert.equal(eco.get(id).credits, before);
  assert.equal(eco.get(id).owned.includes('supply-runner'), false);
  assert.equal(eco.cosmetics(eco.get(id)).nameplate, undefined);
  const during = eco.profile(eco.get(id), action.expiresAt - 1000);
  assert.equal(during.events.supplyRunnerUntil, action.expiresAt);
  assert.equal(during.events.nameplate, null);
  assert.equal(during.name, null);
  const after = eco.profile(eco.get(id), action.expiresAt + 1000);
  assert.equal(after.events.supplyRunnerUntil, null);

  const neon = resolveLive(T0 + 1000, on).live;
  assert.deepEqual(grantFor(neon, 'match-end'), { item: 'wrap.neon', creditsDelta: 0, keep: true, nameplate: false });
  assert.equal(grantFor(neon, 'practice'), null);
  assert.equal(grantFor(neon, 'chest-open'), null);
  assert.equal(grantFor(live, 'match-end'), null);

  const bought = eco.buy(id, 'camo.neon', 'purchase-neon-0001');
  assert.equal(bought.ok, true);
  assert.equal(eco.get(id).credits, before - 1200);
  assert.equal(eco.buy(id, 'wrap.neon', 'purchase-wrap-0001').ok, false);
  const offer = featuredOffer(SHOP, neon);
  assert.equal(offer.price, 1200);
  assert.equal(offer.discount, 0);
  assert.equal(offer.price, offer.listPrice);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('kill flash is cosmetic and clamped; rare boost uses the existing chest table', () => {
  const neon = resolveLive(T0 + 1000, on).live;
  assert.deepEqual(killFlashFor(neon, { bot: false }), { id: 'neon', ms: KILL_FLASH_MS });
  assert.equal(KILL_FLASH_MS <= 350, true);
  assert.equal(killFlashFor(neon, { bot: true }), null);
  assert.equal(killFlashFor(resolveLive(T0 + 8 * DAY_MS, on).live, { bot: false }), null);
  assert.equal(rareBoostFor(neon), null);
  assert.equal(rareBoostFor(resolveLive(T0 + 8 * DAY_MS, on).live).chance, PLACEHOLDER.rareBoostChance);

  const map = { boxes: [], chests: [{ id: 'c', p: [0, 0, 0], rare: false }] };
  let boost = { chance: 1, random: () => 0 };
  const sent = [];
  const chest = createChests(map, { broadcast: (m) => sent.push(m), send() {}, rareBoost: () => boost, random: () => 0 });
  assert.equal(chest.state()[0].rare, true);
  assert.equal(chest.state()[0].eventRare, true);
  const player = { id: 'a', p: [0, 0, 0], alive: true, stance: 0 };
  assert.equal(chest.open(player, 'c'), true);
  assert.equal(chest.dropState().find((d) => d.kind === 'credits').loot.credits, 60);
  boost = null;
  chest.reset();
  assert.equal(chest.state()[0].rare, false);
  assert.equal(chest.state()[0].eventRare, false);
  assert.equal(chest.open(player, 'c'), true);
  assert.equal(chest.dropState().find((d) => d.kind === 'credits').loot.credits, 15);
});
