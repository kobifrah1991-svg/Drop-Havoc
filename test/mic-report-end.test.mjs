import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t, setLang } from '../shared/i18n.js';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const overlayFn = (src) => {
  const start = src.indexOf('function closeTopOverlay');
  return src.slice(start, src.indexOf("document.addEventListener('keydown'", start));
};

function block(id) {
  const start = html.indexOf(`id="${id}"`);
  assert.ok(start > 0, id);
  const end = html.indexOf('\n  <div id="', start + 10);
  return html.slice(start, end === -1 ? start + 1200 : end);
}

test('mic and report dialogs use i18n for text and aria, in Hebrew and English', () => {
  const mic = block('mic-ask');
  const report = block('report-ask');
  assert.match(mic, /id="mic-yes"/);
  assert.match(mic, /id="mic-no"/);
  assert.match(report, /id="report-who"/);
  assert.match(report, /id="report-reasons"/);
  assert.match(report, /id="report-no"/);
  assert.match(report, /data-reason="harassment"/);
  assert.doesNotMatch(mic, /dir="rtl"/);
  assert.doesNotMatch(mic, /Microphone ·/);
  assert.doesNotMatch(report, /Harassment ·/);
  assert.doesNotMatch(mic + report, /aria-label="Close"/);
  assert.match(mic, /data-i18n="mic\.title"/);
  assert.match(mic, /data-i18n="mic\.body"/);
  assert.match(mic, /data-i18n-aria="mic\.title"/);
  assert.match(mic, /data-i18n-aria="admin\.cancel"/);
  assert.match(report, /data-i18n-aria="voice\.report"/);
  assert.match(report, /data-i18n="report\.hate"/);
  setLang('he');
  assert.match(t('mic.body'), /לא מוקלט/);
  assert.equal(t('mic.title'), 'מיקרופון');
  assert.equal(t('mic.on'), 'הפעלה');
  assert.equal(t('report.harassment'), 'הטרדה');
  assert.equal(t('admin.cancel'), 'ביטול');
  setLang('en');
  assert.match(t('mic.body'), /not recorded/i);
  assert.equal(t('mic.title'), 'Microphone');
  assert.equal(t('report.cheat'), 'Cheating');
  assert.equal(t('shop.close'), 'Close');
  const fn = overlayFn(client);
  assert.match(fn, /\$\('mic-no'\)\.click\(\)/);
  assert.match(fn, /\$\('report-no'\)\.click\(\)/);
  assert.doesNotMatch(fn, /end-menu/);
});

test('the end screen has a back-to-menu button on the existing leave path', () => {
  assert.match(html, /id="end-menu"/);
  assert.match(html, /data-i18n="lobby\.leave"/);
  assert.match(html, /data-i18n-aria="lobby\.leave"/);
  assert.match(client, /\$\('end-menu'\)/);
  assert.match(client, /leaveMatch\(\)/);
  setLang('he');
  assert.equal(t('lobby.leave'), 'יציאה לתפריט');
  setLang('en');
  assert.equal(t('lobby.leave'), 'Back to menu');
  const fn = overlayFn(client);
  assert.doesNotMatch(fn, /end-menu|leaveMatch/);
});
