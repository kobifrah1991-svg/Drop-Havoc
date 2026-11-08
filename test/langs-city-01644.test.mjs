// 0.16.44: languages (English first and default, 6 extra languages complete) and the bigger city.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, CORE_LANGS, STRING_KEYS, detectLang, t, setTouch } from '../shared/i18n.js';
import { CITY } from '../shared/city.js';
import { collides } from '../shared/physics.js';

test('English is first in the menu and the default for a new player; a saved choice is kept', () => {
  assert.deepEqual(Object.keys(LANGS).slice(0, 4), ['en', 'he', 'ar', 'ru']);
  assert.deepEqual(CORE_LANGS, ['en', 'he', 'ar', 'ru']);
  assert.equal(detectLang(null), 'en');
  assert.equal(detectLang('he'), 'he');
  assert.equal(detectLang('xx'), 'en');
});

test('every extra language has every line, with the same {placeholders} as English', async () => {
  const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join();
  for (const l of ['es', 'pt', 'fr', 'de', 'tr', 'id']) {
    const file = (await import(`../shared/lang/${l}.js`)).default;
    for (const k of STRING_KEYS) {
      assert.ok(typeof file[k] === 'string' && file[k].length, `${l} missing ${k}`);
      assert.equal(ph(file[k]), ph(t(k, {}, 'en')), `${l} ${k} placeholders`);
    }
  }
});

test('touch devices get button wording instead of keyboard keys', () => {
  setTouch(true);
  try {
    for (const l of CORE_LANGS) {
      assert.doesNotMatch(t('drop.altFree', { m: 1, kmh: 2 }, l), /Space|רווח|Пробел/);
      assert.doesNotMatch(t('loot.pickup', { item: 'x' }, l), /^E ·/);
    }
  } finally { setTouch(false); }
  assert.match(t('loot.pickup', { item: 'x' }, 'en'), /^E ·/);
});

test('city: bigger bounds, parachutes stay inside the ring, solid edge buildings, roundabouts without lights', () => {
  assert.equal(CITY.bounds, 151);
  assert.ok(CITY.dropBounds < 118 - 5, 'landing area ends before the ring road');
  assert.ok(CITY.edgeBuildings.length > 40);
  for (const b of CITY.edgeBuildings) {
    if (!b.downtown) assert.ok(Math.max(Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[2]), Math.abs(b.max[2])) > 125, 'outside the ring'); // 0.16.49: the two downtown towers stand in the middle
    const c = [(b.min[0] + b.max[0]) / 2, 0.5, (b.min[2] + b.max[2]) / 2];
    assert.ok(collides(c[0], c[1], c[2], CITY.boxes, 1.8), 'you cannot walk into a building');
  }
  for (const r of CITY.roundabouts) assert.ok(!CITY.trafficLights.some((l) => l.j[0] === r.p[0] && l.j[1] === r.p[2]));
  assert.ok(CITY.boxes.decorations.filter((d) => d.tree).length <= 54);
  // trees are not on a grid any more: their x positions are not all multiples of 13
  assert.ok(CITY.boxes.decorations.filter((d) => d.tree).some((d) => Math.abs(d.p[0] / 13 - Math.round(d.p[0] / 13)) > 0.05));
});
