// Admin panel (public/admin.html): Firebase sign-in check and who may do what.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyFirebaseToken } from '../firebase-auth.js';
import { createAdmin } from '../admin.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims, kid = 'k1', key = privateKey) {
  const h = b64({ alg: 'RS256', kid }), p = b64(claims);
  return `${h}.${p}.${crypto.createSign('RSA-SHA256').update(h + '.' + p).sign(key).toString('base64url')}`;
}
const fetchFn = async () => ({ ok: true, headers: new Map([['cache-control', 'max-age=3600']]), json: async () => ({ k1: pem }) });
const now = Date.now(), t = Math.floor(now / 1000);
const good = { aud: 'proj', iss: 'https://securetoken.google.com/proj', sub: 'u1', iat: t - 10, exp: t + 3600, email: 'Kobifrah1991@gmail.com', email_verified: true, name: 'Kobi' };

test('a real Firebase token is accepted, forged or wrong ones are not', async () => {
  assert.deepEqual(await verifyFirebaseToken(token(good), 'proj', { fetchFn, now }), { email: 'kobifrah1991@gmail.com', name: 'Kobi', uid: 'u1' });
  assert.equal(await verifyFirebaseToken(token(good), 'other', { fetchFn, now }), null, 'another project');
  assert.equal(await verifyFirebaseToken(token({ ...good, exp: t - 1 }), 'proj', { fetchFn, now }), null, 'expired');
  assert.equal(await verifyFirebaseToken(token({ ...good, email_verified: false }), 'proj', { fetchFn, now }), null, 'unverified email');
  assert.equal(await verifyFirebaseToken(token(good, 'nope'), 'proj', { fetchFn, now }), null, 'unknown key');
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  assert.equal(await verifyFirebaseToken(token(good, 'k1', other), 'proj', { fetchFn, now }), null, 'signed by someone else');
  const [h, , s] = token(good).split('.');
  assert.equal(await verifyFirebaseToken(`${h}.${b64({ ...good, email: 'evil@x.test' })}.${s}`, 'proj', { fetchFn, now }), null, 'changed claims');
  assert.equal(await verifyFirebaseToken('garbage', 'proj', { fetchFn, now }), null);
});

test('owners manage; moderators mute and kick but cannot ban; nobody acts on a higher rank', async () => {
  const dir = fs.mkdtempSync(path.join(root, '.test-admin-'));
  fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify({ 'mod@example.test': 'Moderator' }));
  const mk = (sid, email, name) => { const out = []; const p = { name, kills: 0, deaths: 0 }; return { sid, out, user: email ? { email } : null, ip: '1.2.3.' + sid.length, guestToken: 'g-' + sid, send: (m) => out.push(m), ws: { close() { this.closed = true; } }, conn: { player: () => p }, room: { code: 'R1' } }; };
  const owner = mk('own', 'scitedra.labs@gmail.com', 'Owner'), mod = mk('mod1', 'mod@example.test', 'Mod'), bad = mk('bad', null, 'Troll'), guest = mk('guest1', null, 'Guest');
  const sessions = new Set([owner, mod, bad, guest]);
  const admin = createAdmin({ dataDir: dir, rooms: new Map(), sessions });
  const last = (s) => s.out.filter((m) => m.t === 'panel').at(-1);
  try {
    for (const s of sessions) admin.onAuth(s);
    assert.equal(owner.role, 'Owner'); assert.equal(mod.role, 'Moderator'); assert.equal(bad.role, 'Player');
    await admin.panel(bad, { a: 'list' }); assert.equal(last(bad).ok, false, 'players see nothing');
    await admin.panel(bad, { a: 'kick', sid: 'guest1' }); assert.equal(last(bad).key, 'admin.denied');
    await admin.panel(owner, { a: 'list' }); assert.equal(last(owner).list.length, 4);
    await admin.panel(mod, { a: 'warn', sid: 'bad', reason: 'קללות' }); assert.ok(bad.out.some((m) => m.t === 'warned'));
    await admin.panel(mod, { a: 'mute', sid: 'bad', reason: 'ספאם', minutes: 10 }); assert.equal(last(mod).ok, true);
    assert.ok(admin.activeMute(bad)); assert.ok(bad.conn.player().mutedUntil > Date.now());
    await admin.panel(mod, { a: 'ban', sid: 'bad', minutes: 60 }); assert.equal(last(mod).key, 'admin.denied', 'moderators cannot ban');
    await admin.panel(mod, { a: 'kick', sid: 'own' }); assert.equal(last(mod).key, 'admin.denied', 'cannot touch the owner');
    await admin.panel(owner, { a: 'ban', sid: 'bad', reason: 'רמאות', minutes: 0 }); assert.equal(last(owner).ok, true);
    assert.ok(admin.activeBan(mk('bad', null, 'Troll')), 'same guest device stays banned');
    assert.equal(admin.activeBan(guest), null);
    await admin.panel(owner, { a: 'list' });
    const ban = last(owner).bans.find((b) => b.type === 'ban'); assert.equal(ban.until, 0); assert.match(ban.ip, /\*$/);
    await admin.panel(mod, { a: 'unban', id: ban.id }); assert.equal(last(mod).key, 'admin.denied', 'moderators cannot lift bans');
    await admin.panel(owner, { a: 'unban', id: ban.id }); assert.equal(admin.activeBan(mk('bad', null, 'Troll')), null);
    const again = createAdmin({ dataDir: dir, rooms: new Map(), sessions }); assert.ok(again.activeMute(bad), 'mutes survive a restart');
  } finally {
    await new Promise((r) => setTimeout(r, 300));
    if (!path.resolve(dir).startsWith(path.join(root, '.test-admin-'))) throw Error('Unexpected cleanup path');
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

test('owners add, change and remove staff by e-mail or player name; the two main owners are locked', async () => {
  const dir = fs.mkdtempSync(path.join(root, '.test-admin-'));
  const mk = (sid, email, name) => { const out = []; const p = { name }; return { sid, out, user: email ? { email } : null, send: (m) => out.push(m), ws: { close() {} }, conn: { player: () => p } }; };
  const kobi = mk('k', 'kobifrah1991@gmail.com', 'Kobi'), friend = mk('f', 'friend@example.test', 'Dani'), guest = mk('g', null, 'Guesty');
  const sessions = new Set([kobi, friend, guest]);
  const admin = createAdmin({ dataDir: dir, rooms: new Map(), sessions });
  const last = (s) => s.out.filter((m) => m.t === 'panel').at(-1);
  try {
    for (const s of sessions) admin.onAuth(s);
    await admin.panel(kobi, { a: 'setrole', email: 'dani', role: 'Admin' }); // by player name
    assert.equal(friend.role, 'Admin', 'role applies at once');
    await admin.panel(friend, { a: 'kick', sid: 'g', reason: 'x' }); assert.equal(last(friend).ok, true, 'new admin can kick');
    await admin.panel(friend, { a: 'setrole', email: 'x@example.test', role: 'Admin' }); assert.equal(last(friend).key, 'admin.denied', 'admins cannot add staff');
    await admin.panel(kobi, { a: 'setrole', email: 'Guesty', role: 'Admin' }); assert.equal(last(kobi).key, 'panel.needsGoogle');
    await admin.panel(kobi, { a: 'setrole', email: 'new@example.test', role: 'Moderator' }); assert.equal(last(kobi).ok, true);
    await admin.panel(kobi, { a: 'staff' });
    const list = last(kobi).staff;
    assert.deepEqual(list.filter((s) => s.locked).map((s) => s.email), ['kobifrah1991@gmail.com', 'scitedra.labs@gmail.com']);
    assert.equal(list.find((s) => s.email === 'friend@example.test').name, 'Dani');
    // A second owner can manage staff but can never remove the main owners
    await admin.panel(kobi, { a: 'setrole', email: 'friend@example.test', role: 'Owner' }); assert.equal(friend.role, 'Owner');
    for (const e of ['kobifrah1991@gmail.com', 'scitedra.labs@gmail.com']) {
      await admin.panel(friend, { a: 'setrole', email: e, role: 'Player' }); assert.equal(last(friend).key, 'panel.locked');
    }
    await admin.panel(friend, { a: 'kick', sid: 'k' }); assert.equal(last(friend).key, 'admin.denied', 'cannot kick a main owner');
    assert.equal(kobi.role, 'Owner');
    await admin.panel(kobi, { a: 'setrole', email: 'friend@example.test', role: 'Player' }); assert.equal(friend.role, 'Player', 'removed');
    // A file edited by hand cannot demote a main owner either
    fs.writeFileSync(path.join(dir, 'admins.json'), JSON.stringify({ 'kobifrah1991@gmail.com': 'Player' }));
    const again = createAdmin({ dataDir: dir, rooms: new Map(), sessions }); again.onAuth(kobi); assert.equal(kobi.role, 'Owner');
  } finally {
    await new Promise((r) => setTimeout(r, 300));
    if (!path.resolve(dir).startsWith(path.join(root, '.test-admin-'))) throw Error('Unexpected cleanup path');
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});
