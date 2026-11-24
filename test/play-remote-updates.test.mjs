import test from 'node:test';
import assert from 'node:assert/strict';
import { playRemoteUpdateProblems } from '../scripts/check-play-remote-updates.mjs';
import { isPlayStore, shouldDownloadGameFiles } from '../shared/play-update.js';

test('Play compile set cannot download game files or open the updates folder', () => {
  assert.deepEqual(playRemoteUpdateProblems(), []);
});

test('isPlay() is the second layer: Play skips game files, sideload and web do not', () => {
  const play = { store: () => 'play', updateGame() {}, shell: () => 61 };
  const apk = { store: () => 'apk', updateGame() {}, shell: () => 61 };
  assert.equal(isPlayStore(play), true);
  assert.equal(isPlayStore(apk), false);
  assert.equal(isPlayStore(undefined), false);
  assert.equal(shouldDownloadGameFiles(play, 'android', 0), false);
  assert.equal(shouldDownloadGameFiles(apk, 'android', 0), true);
  assert.equal(shouldDownloadGameFiles(apk, 'android', 99), false);
  assert.equal(shouldDownloadGameFiles({ updateGame() {}, shell: () => 61 }, 'android', 0), true);
  assert.equal(shouldDownloadGameFiles(undefined, 'web', 0), false);
  assert.equal(shouldDownloadGameFiles(apk, 'desktop', 0), false);
});
