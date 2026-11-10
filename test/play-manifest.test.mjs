import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { playManifest } from '../android/play-manifest.mjs';

const src = fs.readFileSync(new URL('../android/AndroidManifest.xml', import.meta.url), 'utf8');

test('sideload manifest still declares the self-updater', () => {
  assert.match(src, /REQUEST_INSTALL_PACKAGES/);
  assert.match(src, /UpdateProvider/);
});

test('Play manifest strips REQUEST_INSTALL_PACKAGES and the updater', () => {
  const play = playManifest(src);
  assert.equal(play.includes('REQUEST_INSTALL_PACKAGES'), false);
  assert.equal(play.includes('UpdateProvider'), false);
  assert.match(play, /drophavoc\.store" android:value="play"/);
  assert.match(play, /RECORD_AUDIO/);
});

test('a manifest that still names the permission is rejected', () => {
  assert.throws(() => playManifest(src.replace('android.permission.REQUEST_INSTALL_PACKAGES', 'android.permission.REQUEST_INSTALL_PACKAGES" android:required="false')));
});
