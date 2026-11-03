import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t, setLang } from '../shared/i18n.js';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');

test('gate copy exists in Hebrew and English and stays masculine', () => {
  setLang('he');
  assert.match(t('gate.privacy'), /סיסמה/);
  assert.match(t('gate.privacy'), /הזמנות/);
  assert.match(t('gate.privacy'), /אורח/);
  assert.match(t('gate.enterGuest'), /אורח/);
  assert.equal(t('gate.googleReady').includes('לחץ'), true);
  assert.equal(t('gate.googleReady').includes('/'), false);
  setLang('en');
  assert.match(t('gate.privacy'), /No password/i);
  assert.match(t('gate.privacy'), /invites/i);
  assert.match(t('gate.guest'), /Guest/);
});

test('gate is in front of the menu and reuses guest plus Google', () => {
  assert.match(html, /id="gate"/);
  assert.match(html, /id="gate-enter"/);
  assert.match(html, /id="gate-google"/);
  assert.equal(html.includes('type="password"'), false);
  assert.equal(/Arena Rush|ארנה ראש/.test(html), false);
  assert.match(client, /function guestToken\(/);
  assert.match(client, /guestToken\(\)/);
  assert.match(client, /arena\.gcred/);
  assert.match(client, /google\.accounts\.id\.renderButton/);
  assert.match(client, /function enterAsGuest\(/);
});
