import test from 'node:test';
import assert from 'node:assert/strict';
import { cmpVer, APP_VERSION } from '../shared/app-version.js';

test('cmpVer orders semver-ish strings', () => {
  assert.ok(cmpVer('0.15.0', '0.16.0') < 0);
  assert.ok(cmpVer('0.16.0', '0.16.0') === 0);
  assert.ok(cmpVer('0.16.1', '0.16.0') > 0);
  assert.ok(cmpVer('1.0.0', '0.99.9') > 0);
});

test('APP_VERSION is 0.16.x for this release', () => {
  assert.match(APP_VERSION, /^0\.16\./);
});
