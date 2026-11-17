import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOverlay } from '../shared/overlay-order.js';

const open = {
  mic: true, report: true, inspect: true, wheel: true, gunShop: true, garage: true, shop: true,
  league: true, scoreboard: true, hints: true, adminConfirm: true, admin: true, exit: true,
  invite: true, update: true, end: true, quick: true, chat: true, pauseSettings: true, pause: true,
  lobby: true, startView: 'solo', menuSheet: true, menuTab: 'servers', menu: true,
};

test('mic and report close before every other overlay', () => {
  assert.equal(nextOverlay(open), 'mic');
  assert.equal(nextOverlay({ ...open, mic: false }), 'report');
  assert.equal(nextOverlay({ report: true, pause: true, menu: true, lobby: true }), 'report');
});

test('pause settings, then pause, then the lobby, then menu sub-screens', () => {
  assert.equal(nextOverlay({ pauseSettings: true, pause: true, lobby: true, menu: true }), 'pauseSettings');
  assert.equal(nextOverlay({ pause: true, lobby: true, menu: true, menuTab: 'friends' }), 'pause');
  assert.equal(nextOverlay({ lobby: true, menu: true, startView: 'online' }), 'lobby');
  assert.equal(nextOverlay({ startView: 'solo', menu: true, menuSheet: true, menuTab: 'servers' }), 'startView');
  assert.equal(nextOverlay({ menuSheet: true, menuTab: 'servers', menu: true, startView: 'home' }), 'menuSheet');
  assert.equal(nextOverlay({ menuTab: 'friends', menu: true }), 'menuTab');
  assert.equal(nextOverlay({ menu: true, menuTab: 'play', startView: 'home' }), 'menu');
  assert.equal(nextOverlay({ menu: true, startOpen: true, startView: 'home', menuTab: 'play' }), 'menu');
});

test('drop, map picker and the rotate hint close before the screen under them', () => {
  assert.equal(nextOverlay({ ...open, mic: false, report: false, drop: true }), 'drop');
  assert.equal(nextOverlay({ ...open, mic: false, report: false, mapSheet: true }), 'mapSheet');
  assert.equal(nextOverlay({ mapSheet: true, startView: 'solo', menu: true }), 'mapSheet');
  assert.equal(nextOverlay({ rotateHint: true, pause: true, pauseSettings: true }), 'rotateHint');
  assert.equal(nextOverlay({ drop: true, mapSheet: true, rotateHint: true }), 'drop');
  assert.equal(nextOverlay({ mic: true, drop: true, mapSheet: true }), 'mic');
  assert.equal(nextOverlay({ report: true, drop: true }), 'report');
});

test('the home screen is not an overlay to dismiss', () => {
  assert.equal(nextOverlay({ startView: 'home', menuTab: 'play' }), null);
  assert.equal(nextOverlay({}), null);
});
