// 0.16.68 Multiplayer room list: a room other players are in must be joinable from the list.
// The /config check that the free Render server can fail while it wakes (~1-2 min) used to leave the server marked
// "down" for the whole session. The start screen's room list still loaded (its own retry loop), so players saw
// rooms with people in them, but Join / Quick match / Create were refused by startOnline() with a message written
// to the menu's status line, hidden behind the start screen: nothing happened.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStartMenu } from '../public/start-menu.js';

const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
const fnBody = (name) => { const i = client.indexOf('function ' + name + '('); assert.ok(i >= 0, name); return client.slice(i, client.indexOf('\n}\n', i)); };

test('a stale "server down" check no longer blocks joining a listed room', () => {
  const start = fnBody('startOnline');
  assert.doesNotMatch(start, /state\?\.down\s*\|\|/, 'startOnline must not refuse on a stale down flag');
  assert.match(start, /state\?\.incompatible\)\{lobbyStatus\(t\('rooms\.version'\)\);return;\}/, 'a real version mismatch still stops it');
  assert.match(start, /state\?\.down\)pingServer\(sv\)/, 'a down server is checked again when the player tries');
  const ping = fnBody('pingServer');
  assert.match(ping, /down: true \}\);\s*setTimeout\(\(\) => \{ if \(serverState\.get\(sv\.id\)\?\.down\) pingServer\(sv\); \}, 30000\)/, 'keeps checking after giving up');
  assert.match(ping, /pinging\.has\(sv\.id\)/, 'one check per server at a time');
  assert.match(ping, /pinging\.delete\(sv\.id\)/);
  // lobby messages reach the start screen too
  assert.match(client, /function lobbyStatus\(text\) \{ \$\('menu-status'\)\.textContent = text; startMenuRef\?\.notice\?\.\(text\); \}/);
  assert.match(client, /case 'lobbyError':[\s\S]{0,200}lobbyStatus\(t\(m\.key\)\)/);
  assert.match(client, /if \(!opened\) \{ lobbyStatus\(t\('rooms\.unavailable'\)\)/);
  assert.match(client, /serverUp: \(sv\) => \{ if \(serverState\.get\(sv\.id\)\?\.down\) pingServer\(sv\); \}/);
});

// Just enough DOM for public/start-menu.js
function fakeDom() {
  const make = (tag = 'div') => {
    const el = { tag, children: [], textContent: '', value: '', checked: true, disabled: false, hidden: false, className: '', dataset: {}, style: { setProperty() {} },
      classList: { toggle() {}, add() {}, remove() {} }, attrs: {}, scrollTop: 0, parent: null,
      setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { c.parent = this; this.children.push(c); return c; }, append(...cs) { for (const c of cs) this.appendChild(c); },
      replaceChildren(...cs) { this.children = []; this.append(...cs); }, after(c) { (this.parent || root).appendChild(c); c.afterOf = this; },
      querySelector(s) { return this.children.find((c) => c.className.split(' ').includes(s.slice(1))) || make(); }, querySelectorAll() { return []; }, focus() {} };
    return el;
  };
  const els = new Map(), root = make();
  root.querySelector = (s) => { if (s === '.st-notice') return root.children.find((c) => c.className === 'st-notice') || null; if (!els.has(s)) { const e = make(); e.className = s.replace(/^\./, ''); e.parent = root; els.set(s, e); } return els.get(s); };
  globalThis.document = { getElementById: (id) => (id === 'start' ? root : null), createElement: make, body: { classList: { add() {}, remove() {} } } };
  return { root, els };
}

test('start screen: open rooms are listed, a reachable server is reported, lobby messages show', async () => {
  const { els } = fakeDom();
  const rooms = [{ code: 'ABCDE', mode: 'ffa', players: 3, capacity: 15, map: 'neon', locked: false, bots: 2 }];
  const asked = [], realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { asked.push(url); return { ok: true, json: async () => rooms }; };
  const ups = [];
  const sv = { id: 'drop-havoc', url: 'https://example.test' };
  const menu = createStartMenu({ t: (k, p) => k + (p ? JSON.stringify(p) : ''), store: { get: (k, d) => d, set() {} }, currentMap: () => 'city',
    servers: () => [{ id: 'device', offline: true }, sv], selectServer() {}, httpBase: (s) => s.url, startOnline() {},
    openMenu() {}, openShop() {}, openGarage() {}, openLeague() {}, nameInput: null, serverUp: (s) => ups.push(s.id) });
  menu.show();
  try {
  els.get('.st-card-online').onclick();
  for (let i = 0; i < 20 && !ups.length; i++) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(asked, ['https://example.test/rooms']);
  assert.deepEqual(ups, ['drop-havoc'], 'client.js hears that the server answered, so a stale "down" is re-checked');
  const list = els.get('.st-rooms');
  const flat = (e) => [e.textContent, ...e.children.flatMap(flat)].join(' ');
  assert.match(flat(list), /map\.neon/, 'the room and its map are listed');
  assert.match(flat(list), /3\/15/, 'with its player count');
  assert.equal(els.get('.st-server').textContent.startsWith('start.serverUp'), true);
  menu.notice('rooms.unavailable');
  const n = els.get('.st-server').parent.children.find((c) => c.className === 'st-notice');
  assert.ok(n, 'notice line is added under the server line');
  assert.equal(n.textContent, 'rooms.unavailable');
  assert.equal(n.attrs.role, 'status');
  } finally { menu.hide(); delete globalThis.document; globalThis.fetch = realFetch; }
});
