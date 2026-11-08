// 0.16.46 balance + phone performance checks
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('regen is slower and starts later; kill heal is smaller', () => {
  const g = src('shared/game.js');
  assert.match(g, /now - p\.lastHurt > 6000 && p\.hp < PLAYER\.maxHp\) p\.hp = Math\.min\(PLAYER\.maxHp, p\.hp \+ 14 \* dt\)/);
  assert.match(g, /killer\.hp \+ 30\)/);
});
test('bots land 30-60 m around the player, drop spot clamped to the map drop area', () => {
  const g = src('shared/game.js');
  assert.match(g, /r=30\+Math\.random\(\)\*30/);
  assert.match(g, /MAP\.dropBounds\?\?95/);
});
test('bot stuck check uses the ground really covered', () => {
  assert.match(src('shared/game.js'), /const speed = Math\.min\(Math\.hypot\(b\.v\[0\], b\.v\[2\]\), moved\)/);
});
test('free roam pays out every 10 minutes, never league points', () => {
  const s = src('server.js');
  assert.match(s, /ROAM_PAY_MS = 10 \* 60 \* 1000/);
  const fn = s.slice(s.indexOf('function payRoam'), s.indexOf('setInterval(payRoam'));
  assert.doesNotMatch(fn, /league/);
});
test('characters and weapons are meshopt compressed and the loader can decode them', () => {
  for (const dir of ['characters', 'weapons']) for (const f of fs.readdirSync(new URL(`../public/models/${dir}/`, import.meta.url))) {
    const b = fs.readFileSync(new URL(`../public/models/${dir}/${f}`, import.meta.url));
    const json = b.subarray(20, 20 + b.readUInt32LE(12)).toString();
    assert.match(json, /EXT_meshopt_compression/, f);
  }
  assert.match(src('public/visuals.js'), /new GLTFLoader\(\)\.setMeshoptDecoder\(MeshoptDecoder\)/);
});
test('far cars are not drawn; the far skyline stays as boxes; rotate hint in every language', async () => {
  assert.match(src('public/vehicle-visuals.js'), /car\.root\.visible=Math\.hypot\(p\.x-cam\.x,p\.z-cam\.z\)<140/);
  assert.match(src('public/city-visuals.js'), /const pick=i=>i>=220\?-1:/);
  const { CORE_LANGS, t } = await import('../shared/i18n.js'); // the 6 extra languages are checked for every key in langs-city-01644
  for (const l of CORE_LANGS) { const s = t('set.rotate', {}, l); assert.ok(s && s !== 'set.rotate', l); }
});
