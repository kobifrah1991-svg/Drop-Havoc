// 0.16.48: live voice (open mic, relay, retry), smoother grass, toppling statues/fountains
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { t, CORE_LANGS } from '../shared/i18n.js';
const src = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
test('voice: open mic by default, N / 🎙 mutes, relay for blocked networks, lost handshakes retried', () => {
  const c = src('public/client.js'), v = src('public/voice.js');
  assert.match(c, /let voiceOpen = store\.get\('voiceOpen', true\)/);
  assert.match(c, /if \(down\) \{ selfMuted = !selfMuted; setTalking\(!selfMuted\); \}/);
  assert.match(v, /turn:openrelay\.metered\.ca:443/);
  assert.match(v, /p\.offerer && p\.pc\.connectionState !== 'connected' && Date\.now\(\) - p\.at > 8000/);
  assert.match(src('public/index.html'), /id="voice-open"/);
  for (const l of CORE_LANGS) assert.notEqual(t('voice.open', {}, l), 'voice.open');
});
test('grass: short blades, fades in over the outer half, updates in small steps', async () => {
  const n = src('public/nature.js');
  assert.match(n, /h = 0\.11 \+ r\(\) \* 0\.15/);
  assert.match(n, /\(d - radius \* 0\.5\) \/ \(radius \* 0\.5\)/);
  assert.match(n, /Math\.max\(1\.5, radius \* 0\.06\)/);
});
test('roundabout statues and fountain tops can be knocked over and stood back up', () => {
  const cv = src('public/city-visuals.js'), c = src('public/client.js');
  assert.match(cv, /export function knockDeco\(x,z,dirX,dirZ,upright=false\)/);
  assert.match(c, /else if \(b\.color === 0xbbb4a3\) knockDeco\(cx, cz, dx, dz\);/);
});
