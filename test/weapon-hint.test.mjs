import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LANGS, t, setTouch, setLang } from '../shared/i18n.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('touch unarmed hint is a short translated line, and the HUD follows the language direction', () => {
  setTouch(false);
  for (const lang of Object.keys(LANGS)) {
    setLang(lang);
    const full = t('weapon.unarmed');
    setTouch(true);
    const short = t('weapon.unarmed');
    setTouch(false);
    assert.notEqual(short, 'weapon.unarmed.touch', lang);
    assert.ok(short.length < full.length, lang + ' touch hint is not shorter');
    assert.ok(short.length <= 12, lang + ' ' + short);
  }
  setTouch(true);
  setLang('en');
  assert.equal(t('weapon.unarmed'), 'Fists');
  setLang('he');
  assert.equal(t('weapon.unarmed'), 'אגרופים');
  setTouch(false);
  setLang('en');
  const css = read('public/style.css');
  assert.doesNotMatch(css, /#weapon-name \{[^}]*direction:\s*rtl/);
  const client = read('public/client.js');
  assert.match(client, /name\.dir = LANGS\[lang\]\?\.dir \|\| 'auto'/);
  assert.match(client, /name\.hidden = dropping/);
  assert.match(client, /!!me\.parachuting !== !!\$\('weapon-name'\)\?\.hidden/);
});
