// Server audit 2026-11-17: bad requests, Firestore auth fallback, stable report ids, durable bans.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { requestPath, guardCall } from '../http-guard.js';
import { parseServiceAccount, resolveAuthHeaders } from '../firestore-auth.js';
import { createEconomy, firestoreStore } from '../economy.js';
import { createReportStore, REPORT_LIMITS } from '../reports.js';
import { createAdmin } from '../admin.js';
import { createGame } from '../shared/game.js';
import { GAME_PROTOCOL } from '../shared/protocol.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-audit-'));

test('malformed request paths are rejected and a handler error does not escape', () => {
  assert.equal(requestPath('/rooms?x=%'), '/rooms');
  assert.equal(requestPath('/%'), null);
  assert.equal(requestPath('/%E0%A4%A'), null);
  assert.equal(requestPath('/%00'), null);
  assert.equal(requestPath('/ok'), '/ok');
  let saw = 0;
  guardCall(() => { throw new Error('boom'); }, () => { saw++; });
  return guardCall(async () => { throw new Error('later'); }, () => { saw++; }).then(() => assert.equal(saw, 2));
});

test('service account JSON is accepted raw or base64, and a missing key adds no header', async () => {
  const creds = { client_email: 'svc@test.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\\nMII\\n-----END PRIVATE KEY-----\\n' };
  const parsed = parseServiceAccount(JSON.stringify(creds));
  assert.equal(parsed.client_email, creds.client_email);
  assert.ok(parsed.private_key.includes('\n'));
  assert.equal(parseServiceAccount(Buffer.from(JSON.stringify(creds)).toString('base64')).client_email, creds.client_email);
  assert.throws(() => parseServiceAccount(''), /empty/);
  assert.deepEqual(await resolveAuthHeaders({}), {});
  assert.deepEqual(await resolveAuthHeaders({ FIREBASE_SERVICE_ACCOUNT: '   ' }), {});
  assert.deepEqual(await resolveAuthHeaders({ FIREBASE_SERVICE_ACCOUNT: '{' }), {});
  assert.deepEqual(await resolveAuthHeaders({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(creds) }, async () => 'tok-1'), { Authorization: 'Bearer tok-1' });
});

test('firebase-admin is installed for the service-account path', async () => {
  const mod = await import('firebase-admin');
  const admin = mod.default && mod.default.credential ? mod.default : mod;
  assert.equal(typeof admin.credential.cert, 'function');
});

test('Firestore account saves attach the admin token only when one is configured', async () => {
  const seen = [];
  const fetchFn = async (url, opt = {}) => {
    seen.push({ url, method: opt.method, headers: opt.headers || {} });
    if (opt.method === 'PATCH') return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ documents: [] }) };
  };
  const env = { FIRESTORE_PROJECT: 'p', FIRESTORE_PREFIX: 'drop/x' };
  await firestoreStore(env, fetchFn).load();
  assert.equal(seen[0].headers.Authorization, undefined);
  await firestoreStore(env, fetchFn, async () => ({ Authorization: 'Bearer ya' })).save({ 'g:a@b.c': { level: 1, credits: 2, name: 'A', updated: 1 } });
  assert.equal(seen.at(-1).method, 'PATCH');
  assert.equal(seen.at(-1).headers.Authorization, 'Bearer ya');
  assert.equal(seen.at(-1).headers['Content-Type'], 'application/json');
});

test('reports require an account, are rate limited per account and IP, and survive a failed remote write', async () => {
  const dir = tmp();
  const calls = [];
  const store = createReportStore({
    dataDir: dir,
    env: { FIRESTORE_PROJECT: 'proj' },
    fetchFn: async (url, opt = {}) => { calls.push(opt); return { ok: false, status: 403 }; },
    authHeaders: async () => ({ Authorization: 'Bearer report-token' }),
  });
  assert.equal(store.allow({ accountId: '', ip: '1.1.1.1' }).key, 'sys.reportNeedAccount');
  const id = 'g:reporter@x.test';
  for (let i = 0; i < REPORT_LIMITS.perAccount; i++) assert.equal(store.allow({ accountId: id, ip: '1.1.1.1', now: 5000 }).ok, true);
  assert.equal(store.allow({ accountId: id, ip: '9.9.9.9', now: 5000 }).key, 'sys.reportRate');
  assert.equal(store.allow({ accountId: id, ip: '1.1.1.1', now: 5000 + REPORT_LIMITS.windowMs + 1 }).ok, true);
  for (let i = 0; i < REPORT_LIMITS.perIp; i++) assert.equal(store.allow({ accountId: 'g:ip' + i + '@x.test', ip: '5.5.5.5', now: 50 }).ok, true);
  assert.equal(store.allow({ accountId: 'g:overflow@x.test', ip: '5.5.5.5', now: 50 }).key, 'sys.reportRate');
  assert.equal(await store.save({ reporterId: '', reportedId: 'g:b@x.test', reason: 'x' }), false);
  const saved = await store.save({ reporterId: 'g:a@x.test', reportedId: 'g:b@x.test', reporterUid: 'ua', reason: 'aim' });
  assert.equal(saved.reportedId, 'g:b@x.test');
  assert.equal(calls[0].headers.Authorization, 'Bearer report-token');
  assert.match(fs.readFileSync(path.join(dir, 'reports.jsonl'), 'utf8'), /g:b@x\.test/);
});

function sock(box) { return { readyState: 1, send: (raw) => box.push(JSON.parse(raw)), close() {} }; }

test('a report stores the account id of the chosen player, not the shared display name', async () => {
  const rows = [];
  const game = createGame({ bots: 0, onReport: (row) => { rows.push(row); return { ok: true }; } });
  const a = [], b = [], c = [];
  const ca = game.connect(sock(a)), cb = game.connect(sock(b)), cc = game.connect(sock(c));
  ca.message(JSON.stringify({ t: 'join', name: 'Same', accountId: 'g:a@x.test', uid: 'ua' }));
  cb.message(JSON.stringify({ t: 'join', name: 'Same', accountId: 'g:b@x.test', uid: 'ub' }));
  cc.message(JSON.stringify({ t: 'join', name: 'Reporter', accountId: 'g:c@x.test', uid: 'uc' }));
  const idB = b.find((m) => m.t === 'welcome').id;
  cc.message(JSON.stringify({ t: 'report', name: 'Same', reason: 'by name' }));
  assert.equal(rows.length, 0);
  assert.ok(c.some((m) => m.key === 'sys.noSuchPlayer'));
  cc.message(JSON.stringify({ t: 'report', id: idB, reason: 'aim' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reportedId, 'g:b@x.test');
  assert.equal(rows[0].reporterId, 'g:c@x.test');
  assert.equal(rows[0].reportedUid, 'ub');
  const box = [];
  const slow = createGame({ bots: 0, onReport: () => ({ ok: false, key: 'sys.reportRate' }) });
  const one = slow.connect(sock(box));
  slow.connect(sock([])).message(JSON.stringify({ t: 'join', name: 'Two', accountId: 'g:two@x.test' }));
  one.message(JSON.stringify({ t: 'join', name: 'One', accountId: 'g:one@x.test' }));
  const other = slow.admin.players().find((p) => p.accountId === 'g:two@x.test');
  one.message(JSON.stringify({ t: 'report', id: other.id, reason: 'spam' }));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(box.some((m) => m.key === 'sys.reportRate'));
});

function memoryFirestore() {
  const docs = new Map();
  const calls = [];
  const fetchFn = async (url, opt = {}) => {
    calls.push({ url, method: opt.method, headers: opt.headers || {} });
    const key = new URL(url).pathname;
    if (opt.method === 'PATCH') { docs.set(key, JSON.parse(opt.body)); return { ok: true, json: async () => ({}) }; }
    const doc = docs.get(key);
    return { ok: !!doc, json: async () => doc || {} };
  };
  return { calls, fetchFn };
}

const economy = { accountId: (s) => (s.user?.email ? 'g:' + String(s.user.email).toLowerCase() : (s.guestToken ? 'd:' + s.guestToken : null)) };

test('bans stick to the account across a restart and a wiped disk', async () => {
  const dir = fs.mkdtempSync(path.join(root, '.test-admin-'));
  const player = { name: 'Troll', bot: false };
  const victim = { user: { email: 'troll@example.test', uid: 'uid-troll' }, ip: '9.9.9.9', guestToken: null, role: 'Player', send() {}, ws: { close() {} }, conn: { player: () => player } };
  const owner = { user: { email: 'kobifrah1991@gmail.com' }, ip: '1.1.1.1', role: 'Player', send() {}, ws: { close() {} }, conn: null, room: { code: 'ROOM1', game: { admin: { find: (n) => String(n).toLowerCase() === 'troll' ? player : null, announce() {} } } } };
  const sessions = new Set([owner, victim]);
  const admin = createAdmin({ dataDir: dir, rooms: new Map(), sessions, economy });
  try {
    admin.onAuth(owner); admin.onAuth(victim);
    admin.handle(owner, 'ban', ['Troll', 'aimbot']);
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'bans.json'), 'utf8'));
    assert.equal(saved[0].accountId, 'g:troll@example.test');
    assert.equal(saved[0].uid, 'uid-troll');
    assert.equal(saved[0].type, 'ban');
    const again = createAdmin({ dataDir: dir, rooms: new Map(), sessions: new Set(), economy });
    assert.ok(again.activeBan({ user: { email: 'Troll@example.test', uid: 'uid-troll' }, ip: '8.8.8.8', guestToken: null }));
    await again.ready;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const remote = memoryFirestore();
  const env = { FIRESTORE_PROJECT: 'proj', FIRESTORE_PREFIX: 'drop/srv' };
  const authHeaders = async () => ({ Authorization: 'Bearer test-token' });
  const dir1 = fs.mkdtempSync(path.join(root, '.test-admin-'));
  const wipedDir = fs.mkdtempSync(path.join(root, '.test-admin-'));
  const live = createAdmin({ dataDir: dir1, rooms: new Map([['R', { game: { admin: { announce() {} } } }]]), sessions, economy, env, fetchFn: remote.fetchFn, authHeaders });
  try {
    await live.ready;
    live.onAuth(owner); live.onAuth(victim);
    live.handle(owner, 'ban', ['Troll', 'aimbot']);
    await live.panel(owner, { a: 'announce', text: 'hello audit' });
    await live.flush();
    assert.ok(remote.calls.some((c) => c.method === 'PATCH' && c.headers.Authorization === 'Bearer test-token'));
    const wiped = createAdmin({ dataDir: wipedDir, rooms: new Map(), sessions: new Set(), economy, env, fetchFn: remote.fetchFn, authHeaders });
    await wiped.ready;
    assert.equal(fs.existsSync(path.join(wipedDir, 'bans.json')), false);
    assert.ok(wiped.activeBan({ user: { email: 'troll@example.test', uid: 'other-uid' }, ip: '4.4.4.4', guestToken: null }), 'ban loaded from Firestore, not the disk');
    const viewer = { user: { email: 'kobifrah1991@gmail.com' }, ip: '1.1.1.1', out: [], send(m) { this.out.push(m); } };
    wiped.onAuth(viewer);
    await wiped.panel(viewer, { a: 'audit' });
    assert.ok(viewer.out.at(-1).audit.some((e) => e.action === 'announce' && e.value === 'hello audit'));
  } finally {
    fs.rmSync(dir1, { recursive: true, force: true });
    fs.rmSync(wipedDir, { recursive: true, force: true });
  }
});

function waitFor(client, predicate) {
  const old = client.messages.find(predicate);
  if (old) return Promise.resolve(old);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout ' + client.messages.map((m) => m.t || m.key).join(','))), 8000);
    const on = (raw) => {
      const m = JSON.parse(raw);
      if (predicate(m)) { clearTimeout(timer); client.ws.off('message', on); resolve(m); }
    };
    client.ws.on('message', on);
  });
}

test('the running server rejects a bad URI, hides nicknames, and files a report by account id', { timeout: 20000 }, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-srv-'));
  const port = 4197;
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), BOTS: '0', IP_CONN_LIMIT: '100', DATA_DIR: data, GOOGLE_CLIENT_ID: '', ADMIN_CODE: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', FIRESTORE_PROJECT: '', FIRESTORE_PREFIX: '', FIREBASE_SERVICE_ACCOUNT: '', FIRESTORE_TOKEN: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  proc.stderr.on('data', (d) => { errors += d; });
  const sockets = [];
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start: ' + errors)), 8000);
      proc.stdout.on('data', (d) => { if (String(d).includes('running on')) { clearTimeout(timer); resolve(); } });
      proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('exited ' + code + ': ' + errors)); });
    });
    const bad = await fetch(`http://127.0.0.1:${port}/%E0%A4%A`);
    assert.equal(bad.status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    const status = await (await fetch(`http://127.0.0.1:${port}/status`)).json();
    assert.equal(typeof status.saves, 'object');
    const open = async (token) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const client = { ws, messages: [], send: (m) => ws.send(JSON.stringify(m)) };
      ws.on('message', (raw) => client.messages.push(JSON.parse(raw)));
      sockets.push(ws);
      await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
      client.send({ t: 'auth', protocol: GAME_PROTOCOL, guestToken: token });
      await waitFor(client, (m) => m.t === 'authed');
      return client;
    };
    const a = await open('11111111-1111-4111-8111-111111111111');
    a.send({ t: 'create', public: true, mode: 'ffa' });
    const room = await waitFor(a, (m) => m.t === 'room');
    a.send({ t: 'join', name: 'SecretNick' });
    await waitFor(a, (m) => m.t === 'welcome');
    const b = await open('22222222-2222-4222-8222-222222222222');
    b.send({ t: 'joinCode', code: room.code });
    await waitFor(b, (m) => m.t === 'room');
    b.send({ t: 'join', name: 'SecretNick' });
    const welcomeB = await waitFor(b, (m) => m.t === 'welcome');
    const list = await (await fetch(`http://127.0.0.1:${port}/rooms`)).json();
    assert.equal(list[0].players, 2);
    assert.equal('names' in list[0], false);
    assert.equal(JSON.stringify(list).includes('SecretNick'), false);
    a.send({ t: 'report', id: welcomeB.id, reason: 'aim' });
    await waitFor(a, (m) => m.key === 'sys.reportOk');
    const row = JSON.parse(fs.readFileSync(path.join(data, 'reports.jsonl'), 'utf8').trim().split('\n').at(-1));
    assert.equal(row.reporterId, 'd:11111111-1111-4111-8111-111111111111');
    assert.equal(row.reportedId, 'd:22222222-2222-4222-8222-222222222222');
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  } finally {
    for (const ws of sockets) ws.terminate();
    if (proc.exitCode === null && !proc.killed) { const ended = new Promise((resolve) => proc.once('exit', resolve)); proc.kill(); await ended; }
    fs.rmSync(data, { recursive: true, force: true });
  }
});

// Silence unused import if a future edit drops the direct economy call. createEconomy is used below.
test('a bad document name in a Firestore page does not fail the account load', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ documents: [{ name: 'players/%', fields: { data: { stringValue: '{}' } } }, { name: 'projects/p/databases/(default)/documents/drop/x/players/g%3Aa%40b.c', fields: { data: { stringValue: JSON.stringify({ credits: 3, name: 'A' }) } } }] }) });
  const store = firestoreStore({ FIRESTORE_PROJECT: 'p', FIRESTORE_PREFIX: 'drop/x' }, fetchFn, async () => ({}));
  const loaded = await store.load();
  assert.equal(loaded['g:a@b.c'].credits, 3);
  assert.equal(createEconomy({ dataDir: tmp(), remotes: [] }).has('missing'), false);
});
