import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createEconomy, firestoreStore } from '../economy.js';

function fakeFirestore() {
  const docs = new Map();
  const fetchFn = async (url, opt = {}) => {
    const u = new URL(url);
    if (opt.method === 'PATCH') { docs.set(u.pathname, JSON.parse(opt.body)); return { ok: true, json: async () => ({}) }; }
    const documents = [...docs].filter(([p]) => p.includes('/players/')).map(([p, d]) => ({ name: p, fields: d.fields }));
    return { ok: true, json: async () => ({ documents }) };
  };
  return { docs, fetchFn };
}
const env = { FIRESTORE_PROJECT: 'p', FIRESTORE_PREFIX: 'dropHavoc/srv-x' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-'));

test('progress survives a wiped disk via Firestore (credits, xp, level, items, stats, prefs)', async () => {
  const fs1 = fakeFirestore();
  const e1 = createEconomy({ dataDir: tmp(), remotes: [firestoreStore(env, fs1.fetchFn)] });
  await e1.ready;
  const id = 'g:kobi@example.com';
  e1.award(id, { kills: 3, heads: 1, won: true, name: 'Kobi' });
  e1.practice(id, { kills: 2, won: false, map: 'neon', mode: 'ffa' }, 1e12);
  e1.flush();
  await new Promise((r) => setTimeout(r, 50));
  const before = e1.profile(e1.get(id));
  // new server, empty disk (Render Free restart)
  const e2 = createEconomy({ dataDir: tmp(), remotes: [firestoreStore(env, fs1.fetchFn)] });
  await e2.ready;
  const after = e2.profile(e2.get(id));
  assert.equal(after.credits, before.credits);
  assert.equal(after.level, before.level);
  assert.equal(after.xp, before.xp);
  assert.equal(after.stats.matches, 2);
  assert.equal(after.prefs.map, 'neon');
  assert.equal(after.name, 'Kobi');
});

test('training results are capped and rate limited', () => {
  const e = createEconomy({ dataDir: tmp(), remotes: [] });
  const id = 'd:00000000-0000-0000-0000-000000000000';
  assert.ok(e.practice(id, { kills: 999 }, 1e12).ok);
  assert.equal(e.get(id).stats.kills, 15);
  assert.equal(e.practice(id, { kills: 1 }, 1e12 + 1000).ok, false);
  assert.equal(e.backup(id).game, 'Drop Havoc');
});
