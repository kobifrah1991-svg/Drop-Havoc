// Store-policy account deletion: Google, guest, idempotent, 401, rate limit, report retention.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createEconomy, firestoreStore } from '../economy.js';
import { createReportStore } from '../reports.js';
import { createAdmin } from '../admin.js';
import { createAccountDeletion, DELETE_LIMITS, banHash } from '../account-delete.js';
import { GAME_PROTOCOL } from '../shared/protocol.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-del-'));
const PEPPER = 'test-pepper';

function world(dir) {
  fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify({ 'troll@example.com': { role: 'Moderator' } }));
  const economy = createEconomy({ dataDir: dir, remotes: [] });
  const reports = createReportStore({ dataDir: dir });
  const sessions = new Set();
  const env = { BAN_HASH_PEPPER: PEPPER };
  const admin = createAdmin({ dataDir: dir, rooms: new Map(), sessions, economy, env });
  const dropped = [];
  const deletion = createAccountDeletion({
    economy, admin, reports, env,
    verifyFirebase: async (token) => {
      if (token === 'good') return { email: 'Kobi@example.com', uid: 'uid-kobi', name: 'Kobi' };
      if (token === 'troll') return { email: 'troll@example.com', uid: 'uid-t', name: 'Troll' };
      return null;
    },
    disconnect: (id) => dropped.push(id),
  });
  return { economy, reports, admin, sessions, deletion, dropped };
}

const post = (deletion, authorization, body = '{"confirm":"delete"}', ip = '1.1.1.1') =>
  deletion.http({ method: 'POST', authorization, body, ip });

test('Google deletion removes progress, anonymizes filed reports, and can be repeated', async () => {
  const dir = tmp();
  const { economy, reports, deletion, dropped } = world(dir);
  const id = 'g:kobi@example.com';
  economy.award(id, { kills: 4, heads: 1, won: true, name: 'Kobi' });
  economy.grant(id, 25);
  economy.flush();
  const before = economy.profile(economy.get(id));
  assert.ok(before.credits > 0);
  assert.ok(before.level >= 1);
  await reports.save({ reporterId: id, reporterUid: 'uid-kobi', reportedId: 'g:other@example.com', reason: 'aim' });
  await reports.save({ reporterId: 'g:other@example.com', reportedId: id, reportedUid: 'uid-kobi', reason: 'they cheated' });

  assert.equal((await deletion.http({ method: 'POST', authorization: '', body: '{"confirm":"delete"}', ip: '1.1.1.1' })).status, 401);
  assert.equal((await post(deletion, 'Bearer nope')).status, 401);
  assert.equal((await deletion.http({ method: 'POST', authorization: 'Bearer good', body: '{}', ip: '1.1.1.1' })).status, 400);
  assert.equal((await deletion.http({ method: 'GET', authorization: 'Bearer good', body: '', ip: '1.1.1.1' })).status, 405);

  const yes = await post(deletion, 'Bearer good');
  assert.equal(yes.status, 200);
  assert.deepEqual(yes.body, { ok: true });
  assert.equal(economy.has(id), false);
  assert.equal(economy.backup(id), null);
  assert.deepEqual(dropped, [id]);
  const disk = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));
  assert.equal(disk[id], undefined);
  const kept = reports.list();
  assert.equal(kept.length, 1, 'a report about them is removed when they are not banned');
  assert.equal(kept[0].reportedId, 'g:other@example.com');
  assert.ok(kept[0].reporterId.startsWith('deleted:'));
  assert.ok(kept[0].reporterUid.startsWith('deleted:'));
  assert.equal(JSON.stringify(kept).includes('kobi@example.com'), false);
  assert.equal(JSON.stringify(kept).includes('uid-kobi'), false);

  const again = await post(deletion, 'Bearer good');
  assert.equal(again.status, 200);
  assert.equal(reports.list().length, 1);
  assert.equal(economy.has(id), false);
});

test('a ban survives deletion under a hash, and reports about that player are kept anonymized', async () => {
  const dir = fs.mkdtempSync(path.join(root, '.test-admin-'));
  try {
    const { economy, reports, admin, sessions, deletion } = world(dir);
    const id = 'g:troll@example.com';
    economy.award(id, { kills: 1, name: 'Troll' });
    economy.flush();
    const player = { name: 'Troll', bot: false };
    const victim = { user: { email: 'troll@example.com', uid: 'uid-t' }, ip: '9.9.9.9', guestToken: null, role: 'Player', send() {}, ws: { close() {} }, conn: { player: () => player } };
    const owner = { user: { email: 'kobifrah1991@gmail.com' }, ip: '1.1.1.1', send() {}, ws: { close() {} }, conn: null, room: { code: 'ROOM', game: { admin: { find: (n) => String(n).toLowerCase() === 'troll' ? player : null } } } };
    sessions.add(owner); sessions.add(victim);
    admin.onAuth(owner); admin.onAuth(victim);
    admin.handle(owner, 'ban', ['Troll', 'aimbot']);
    await reports.save({ reporterId: id, reportedId: 'g:other@example.com', reason: 'spam' });
    await reports.save({ reporterId: 'g:other@example.com', reportedId: id, reason: 'cheat' });

    assert.equal((await post(deletion, 'Bearer troll', '{"confirm":"delete"}', '9.9.9.9')).status, 200);
    assert.equal(economy.has(id), false);
    const staff = JSON.parse(fs.readFileSync(path.join(dir, 'admins.json'), 'utf8'));
    assert.equal(staff['troll@example.com'], undefined);
    const bans = JSON.parse(fs.readFileSync(path.join(dir, 'bans.json'), 'utf8'));
    assert.equal(JSON.stringify(bans).includes('troll@example.com'), false);
    assert.equal(JSON.stringify(bans).includes('uid-t'), false);
    assert.ok(bans[0].accountHash);
    assert.ok(bans[0].emailHash);
    const rows = reports.list();
    assert.equal(rows.length, 2, 'banned player: the report about them is kept');
    assert.ok(rows.every((r) => !JSON.stringify(r).includes('troll@example.com')));
    assert.ok(rows.find((r) => r.reason === 'cheat').reportedId.startsWith('deleted:'));
    assert.ok(rows.find((r) => r.reason === 'spam').reporterId.startsWith('deleted:'));
    assert.equal(rows.find((r) => r.reason === 'cheat').reportedId, rows.find((r) => r.reason === 'spam').reporterId);
    const returning = { user: { email: 'troll@example.com', uid: 'uid-t' }, ip: '8.8.8.8', guestToken: null };
    assert.ok(admin.activeBan(returning), 'the same Google account is still banned');
    const fresh = createAdmin({ dataDir: dir, rooms: new Map(), sessions: new Set(), economy, env: { BAN_HASH_PEPPER: PEPPER } });
    assert.ok(fresh.activeBan(returning), 'the hashed ban is still there after a restart');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('guest deletion is authenticated by the device token, idempotent, and rate limited', async () => {
  const dir = tmp();
  const { economy, deletion } = world(dir);
  const token = '44444444-4444-4444-8444-444444444444';
  const id = 'd:' + token;
  economy.award(id, { kills: 2, name: 'Guest' });
  economy.flush();
  assert.equal((await post(deletion, 'Guest not-a-uuid')).status, 401);
  assert.equal((await post(deletion, 'Guest ' + token)).status, 200);
  assert.equal(economy.has(id), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'))[id], undefined);
  assert.equal((await post(deletion, 'Guest ' + token)).status, 200);
  assert.equal((await post(deletion, 'Guest ' + token)).status, 200);
  const blocked = await post(deletion, 'Guest ' + token);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'rate');
  assert.equal(DELETE_LIMITS.perAccount, 3);
  assert.equal(DELETE_LIMITS.perIp, 10);
});

test('websocket delete uses the signed-in session and cannot name another account', async () => {
  const dir = tmp();
  const { economy, deletion } = world(dir);
  const me = 'g:me@example.com';
  const other = 'g:other@example.com';
  economy.award(me, { kills: 1, name: 'Me' });
  economy.award(other, { kills: 1, name: 'Other' });
  economy.flush();
  const sess = { user: { email: 'me@example.com', uid: 'uid-me' }, guestToken: '55555555-5555-4555-8555-555555555555', ip: '3.3.3.3' };
  assert.deepEqual(await deletion.fromSession(sess, 'nope'), { ok: false, error: 'confirm' });
  assert.equal(economy.has(me), true);
  assert.deepEqual(await deletion.fromSession(sess, 'delete'), { ok: true });
  assert.equal(economy.has(me), false);
  assert.equal(economy.has(other), true, 'the other account is untouched');
  assert.equal(economy.has('d:55555555-5555-4555-8555-555555555555'), false);
});

test('missing BAN_HASH_PEPPER refuses deletion and does not rewrite raw ban ids', async () => {
  const dir = fs.mkdtempSync(path.join(root, '.test-admin-'));
  const errors = [];
  const orig = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  try {
    const economy = createEconomy({ dataDir: dir, remotes: [] });
    const reports = createReportStore({ dataDir: dir });
    const sessions = new Set();
    const admin = createAdmin({ dataDir: dir, rooms: new Map(), sessions, economy, env: {} });
    const id = 'g:troll@example.com';
    economy.award(id, { kills: 1, name: 'Troll' });
    economy.flush();
    const player = { name: 'Troll', bot: false };
    const victim = { user: { email: 'troll@example.com', uid: 'uid-t' }, ip: '9.9.9.9', guestToken: null, role: 'Player', send() {}, ws: { close() {} }, conn: { player: () => player } };
    const owner = { user: { email: 'kobifrah1991@gmail.com' }, ip: '1.1.1.1', send() {}, ws: { close() {} }, conn: null, room: { code: 'ROOM', game: { admin: { find: (n) => String(n).toLowerCase() === 'troll' ? player : null } } } };
    sessions.add(owner); sessions.add(victim);
    admin.onAuth(owner); admin.onAuth(victim);
    admin.handle(owner, 'ban', ['Troll', 'aimbot']);
    assert.ok(admin.activeBan(victim), 'raw email still matches when no pepper is set');
    assert.equal(admin.prepareDeletion({ accountId: id, email: 'troll@example.com', uid: 'uid-t', ip: '9.9.9.9' }).banned, true);
    const bans = JSON.parse(fs.readFileSync(path.join(dir, 'bans.json'), 'utf8'));
    assert.equal(bans[0].email, 'troll@example.com');
    assert.equal(bans[0].accountHash, undefined);
    assert.ok(admin.activeBan({ user: { email: 'troll@example.com', uid: 'uid-t' }, ip: '8.8.8.8', guestToken: null }));
    const deletion = createAccountDeletion({
      economy, admin, reports, env: { BAN_HASH_PEPPER: '   ' },
      verifyFirebase: async () => ({ email: 'troll@example.com', uid: 'uid-t' }),
      disconnect() { throw new Error('should not disconnect'); },
    });
    assert.equal((await deletion.http({ method: 'POST', authorization: '', body: '{"confirm":"delete"}', ip: '9.9.9.9' })).status, 401);
    const http = await post(deletion, 'Bearer x', '{"confirm":"delete"}', '9.9.9.9');
    assert.equal(http.status, 503);
    assert.deepEqual(http.body, { ok: false, error: 'config' });
    assert.deepEqual(await deletion.fromSession(victim, 'delete'), { ok: false, error: 'config' });
    assert.equal(economy.has(id), true);
    assert.equal(banHash(id), null);
    assert.equal(banHash(id, ''), null);
    assert.ok(errors.some((line) => line.includes('BAN_HASH_PEPPER is not set; refusing account deletion')));
    assert.ok(errors.some((line) => line.includes('BAN_HASH_PEPPER is not set; skipping ban-hash rewrite')));
  } finally {
    console.error = orig;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Firestore player document and backup snapshot lose the deleted account', async () => {
  const seen = [];
  let backup = JSON.stringify({ 'g:a@b.c': { credits: 5, name: 'A' }, 'g:keep@b.c': { credits: 1 } });
  const fetchFn = async (url, opt = {}) => {
    seen.push({ url, method: opt.method || 'GET' });
    if (String(url).includes('/backups')) {
      if (opt.method === 'PATCH') { backup = JSON.parse(opt.body).fields.data.stringValue; return { ok: true, json: async () => ({}) }; }
      return { ok: true, json: async () => ({ documents: [{ name: 'projects/p/databases/(default)/documents/drop/x/backups/2026-11-17', fields: { data: { stringValue: backup } } }] }) };
    }
    if (opt.method === 'DELETE') return { ok: true, status: 200, json: async () => ({}) };
    return { ok: true, json: async () => ({ documents: [] }) };
  };
  const store = firestoreStore({ FIRESTORE_PROJECT: 'p', FIRESTORE_PREFIX: 'drop/x' }, fetchFn, async () => ({ Authorization: 'Bearer ya' }));
  await store.forget('g:a@b.c');
  assert.ok(seen.some((c) => c.method === 'DELETE' && c.url.includes(encodeURIComponent('g:a@b.c'))));
  const data = JSON.parse(backup);
  assert.equal(data['g:a@b.c'], undefined);
  assert.equal(data['g:keep@b.c'].credits, 1);
});

test('Firestore copies of reports are anonymized or deleted with the local file', async () => {
  const dir = tmp();
  const docs = new Map();
  let n = 0;
  const fetchFn = async (url, opt = {}) => {
    const method = opt.method || 'GET';
    if (method === 'POST') {
      const name = `projects/p/databases/(default)/documents/reports/r${++n}`;
      docs.set(name, JSON.parse(opt.body).fields);
      return { ok: true, json: async () => ({ name }) };
    }
    if (method === 'GET') return { ok: true, json: async () => ({ documents: [...docs].map(([name, fields]) => ({ name, fields })) }) };
    const name = url.replace('https://firestore.googleapis.com/v1/', '');
    if (method === 'DELETE') { docs.delete(name); return { ok: true, status: 200, json: async () => ({}) }; }
    if (method === 'PATCH') { docs.set(name, JSON.parse(opt.body).fields); return { ok: true, json: async () => ({}) }; }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  const reports = createReportStore({ dataDir: dir, env: { FIRESTORE_PROJECT: 'proj' }, fetchFn, authHeaders: async () => ({ Authorization: 'Bearer t' }) });
  const mine = 'g:kobi@example.com';
  await reports.save({ reporterId: mine, reportedId: 'g:other@example.com', reason: 'aim' });
  await reports.save({ reporterId: 'g:other@example.com', reportedId: mine, reason: 'cheat' });
  await reports.retainForDeletion({ accountId: mine, uid: null, banned: false, anon: 'deleted:abc' });
  assert.equal(docs.size, 1);
  const left = [...docs.values()][0];
  assert.equal(left.reporterId.stringValue, 'deleted:abc');
  assert.equal(left.reportedId.stringValue, 'g:other@example.com');
  assert.equal(reports.list().length, 1);
  assert.equal(reports.list()[0].reporterId, 'deleted:abc');
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

test('POST /account/delete on the server: 401, guest delete, idempotent, rate limit', { timeout: 20000 }, async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-del-srv-'));
  const port = 4219;
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: root, windowsHide: true,
    env: { ...process.env, PORT: String(port), BOTS: '0', DATA_DIR: data, GOOGLE_CLIENT_ID: '', ADMIN_CODE: '', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', FIRESTORE_PROJECT: '', FIRESTORE_PREFIX: '', FIREBASE_SERVICE_ACCOUNT: '', BAN_HASH_PEPPER: PEPPER },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  proc.stderr.on('data', (d) => { errors += d; });
  const call = async (authorization, body = '{"confirm":"delete"}') => {
    const res = await fetch(`http://127.0.0.1:${port}/account/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) }, body });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server did not start: ' + errors)), 8000);
      proc.stdout.on('data', (d) => { if (String(d).includes('running on')) { clearTimeout(timer); resolve(); } });
      proc.once('exit', (code) => { clearTimeout(timer); reject(new Error('exited ' + code + ': ' + errors)); });
    });
    assert.equal((await call(undefined)).status, 401);
    assert.equal((await call('Guest nope')).status, 401);
    const token = '55555555-5555-4555-8555-555555555555';
    assert.equal((await call('Guest ' + token, '{}')).status, 400);
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const client = { ws, messages: [] };
    ws.on('message', (raw) => client.messages.push(JSON.parse(raw)));
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    client.send = (m) => ws.send(JSON.stringify(m));
    client.send({ t: 'auth', protocol: GAME_PROTOCOL, guestToken: token });
    await waitFor(client, (m) => m.t === 'authed');
    const id = 'd:' + token;
    const file = path.join(data, 'accounts.json');
    for (let i = 0; i < 20 && !(fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8'))[id]); i++) await new Promise((r) => setTimeout(r, 40));
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8'))[id]);
    client.send({ t: 'deleteAccount', confirm: 'delete' });
    await waitFor(client, (m) => m.t === 'accountDeleted' && m.ok === true);
    for (let i = 0; i < 20; i++) {
      const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!disk[id]) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8'))[id], undefined);
    assert.equal((await call('Guest ' + token)).status, 200);
    assert.equal((await call('Guest ' + token)).status, 200);
    const limited = await call('Guest ' + token);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error, 'rate');
    ws.terminate();
  } finally {
    if (proc.exitCode === null && !proc.killed) { const ended = new Promise((resolve) => proc.once('exit', resolve)); proc.kill(); await ended; }
    fs.rmSync(data, { recursive: true, force: true });
  }
});
