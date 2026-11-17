import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { isPlayStore } from '../public/play-store.js';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Play store detection blocks the GitHub update path', () => {
  assert.equal(isPlayStore({ store: () => 'play' }), true);
  assert.equal(isPlayStore({ store: () => 'apk' }), false);
  assert.equal(isPlayStore(null), false);
  assert.equal(isPlayStore({ store() { throw new Error('no meta'); } }), false);
  const js = read('public/update-check.js');
  const play = js.indexOf('isPlayStore(app)');
  const files = js.indexOf('app.updateGame');
  assert.ok(play > 0 && play < files, 'play check runs before updateGame');
  const java = read('android/src/com/scitedragames/drophavoc/MainActivity.java');
  assert.match(java, /void updateGame[\s\S]{0,240}if \(isPlay\(\)\) return/);
  assert.match(java, /private void download\(String url\) \{\s*if \(isPlay\(\)\)/);
  assert.match(java, /OnBackInvokedCallback/);
  assert.match(java, /registerOnBackInvokedCallback/);
  assert.match(java, /public void onBackPressed\(\)/);
  assert.match(read('android/AndroidManifest.xml'), /android:enableOnBackInvokedCallback="true"/);
});

test('the sideload script has no baked-in keystore password and the keystore is untracked', () => {
  const sh = read('android/build.sh');
  assert.doesNotMatch(sh, /storepass android|keypass android|pass:android/);
  assert.match(sh, /DROP_HAVOC_KS_PASS/);
  assert.match(sh, /keystore\.properties/);
  assert.match(sh, /env:DROP_HAVOC_KS_PASS/);
  const ignore = read('.gitignore');
  assert.match(ignore, /^\*\.keystore$/m);
  assert.match(ignore, /^android\/keystore\.properties$/m);
  assert.equal(execSync('git ls-files android/arena-debug.keystore', { encoding: 'utf8' }).trim(), '');
  const png = fs.readFileSync(new URL('../public/img/events/supply-frenzy/crate-tile.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.length < 1_250_000, 'crate tile should stay compressed, got ' + png.length);
  const ihdr = png.indexOf('IHDR');
  assert.equal(png.readUInt32BE(ihdr + 4), 1024);
  assert.equal(png.readUInt32BE(ihdr + 8), 1024);
});

test('back chain closes the map, the drop picker and the rotate hint, and the root back is not swallowed', () => {
  const css = read('public/style.css');
  assert.match(css, /\.st-home\[hidden\][\s\S]{0,40}display:\s*none/);
  assert.match(css, /\.st-head \{[^}]*position:\s*sticky/);
  const java = read('android/src/com/scitedragames/drophavoc/MainActivity.java');
  assert.match(java, /bubbles:true/);
  assert.match(java, /moveTaskToBack\(true\)/);
  const client = read('public/client.js');
  assert.match(client, /id='drop-cancel'/);
  assert.match(client, /case 'drop':/);
  assert.match(client, /getElementById\('map-picker'\)/);
  assert.doesNotMatch(client, /querySelector\('\.map-sheet:not\(\[hidden\]\)'\)/);
  assert.match(client, /case 'league':[\s\S]{0,240}league-sheet:not\(\[hidden\]\) \.map-close/);
  assert.match(client, /if \(e\.code === 'Escape' && closeTopOverlay\(\)\) \{ e\.preventDefault\(\)/);
  assert.match(client, /case 'rotateHint':/);
  assert.match(client, /case 'end':/);
  const picker = read('public/map-picker.js');
  assert.match(picker, /sheet\.id = 'map-picker'/);
  assert.match(picker, /return \{ refresh, open, close \}/);
  assert.match(picker, /if \(sheet\.hidden\) return false/);
  assert.match(picker, /document\.addEventListener\('keydown'/);
});
