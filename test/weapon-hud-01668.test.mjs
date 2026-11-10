// Weapon HUD: the bar lists only carried weapons numbered 1..n, keys 1-9 pick those slots, I opens the weapons screen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { t, hasKey } from '../shared/i18n.js';

const client = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const view = readFileSync(new URL('../public/weapon-view.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');

test('weapon bar: only carried weapons, numbered in order', () => {
  assert.match(client, /const ownedWeapons = \(\) => WEAPON_ORDER\.filter\(hasWeapon\)/);
  assert.match(client, /ownedWeapons\(\)\.forEach\(\(k, i\) =>[\s\S]{0,120}\(i < 9 \? \(i \+ 1\) \+ ' ' : ''\)/);
});

test('number keys 1-9 pick the matching carried slot', () => {
  assert.match(client, /\/\^Digit\[1-9\]\$\/\.test\(e\.code\)/);
  assert.match(client, /ownedWeapons\(\)\[slotN - 1\]/);
});

test('I toggles the weapons screen (not in a car), phones get a button', () => {
  assert.match(client, /e\.code === 'KeyI' && !me\.vehicle[^\n]*weaponView\.toggle\(\)/);
  assert.match(client, /className = 'wv-open'/);
  assert.match(css, /body\.touch #weapon-slots \{ display: flex !important/);
});

test('weapons screen highlights the weapon in hand and shows picture + name', () => {
  assert.match(view, /k === cur \? ' on' : ''/);
  assert.match(view, /className = 'wv-img'/);
  assert.match(css, /#weapon-view \.wv-item\.on/);
  assert.match(css, /#weapon-view\[hidden\] \{ display: none !important; \}/);
});

test('weapons screen strings exist', () => {
  for (const k of ['wv.title', 'wv.empty']) { assert.ok(hasKey(k), k); for (const l of ['he', 'en', 'ru', 'ar']) assert.notEqual(t(k, {}, l), k, k + ' ' + l); }
});
