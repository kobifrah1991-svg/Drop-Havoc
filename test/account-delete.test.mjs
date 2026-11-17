import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ACCOUNT_STORAGE_KEYS,
  accountDeleteUrl,
  clearAccountStorage,
  createDeleteDialog,
  deleteAuthorization,
  requestAccountDelete,
} from '../public/account-delete.js';

const GUEST = '11111111-1111-4111-8111-111111111111';

function mem(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function mockFetch(status, body, { fail = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts, body: JSON.parse(opts.body) });
    if (fail) throw new Error('offline');
    return { status, json: async () => body };
  };
  return { fetchImpl, calls };
}

async function run(status, body, extra = {}) {
  const { fetchImpl, calls } = mockFetch(status, body, extra);
  const local = mem({
    'arena.guestToken': JSON.stringify(GUEST),
    'arena.fbr': 'refresh',
    'arena.gate': '"guest"',
  });
  const session = mem({ 'arena.gcred': 'fb:id-token' });
  let loggedOut = 0;
  const dialog = createDeleteDialog({
    request: () => requestAccountDelete({
      fetchImpl,
      base: 'https://drop-havoc.onrender.com/',
      authorization: deleteAuthorization('fb:id-token', GUEST),
      socket: extra.socket,
    }),
    clearLocal: () => clearAccountStorage(local, session),
    onLoggedOut: () => { loggedOut += 1; },
  });
  dialog.open();
  const result = await dialog.confirm();
  return { dialog, result, calls, local, session, loggedOut };
}

test('authorization: Firebase bearer wins over a guest token; guest is used alone', () => {
  assert.equal(deleteAuthorization('fb:firebase-token', GUEST), 'Bearer firebase-token');
  assert.equal(deleteAuthorization('gsi.jwt.token', GUEST), 'Bearer gsi.jwt.token');
  assert.equal(deleteAuthorization('', GUEST), 'Guest ' + GUEST);
  assert.equal(deleteAuthorization('   ', 'not-a-uuid'), '');
  assert.equal(accountDeleteUrl('https://drop-havoc.onrender.com/'), 'https://drop-havoc.onrender.com/account/delete');
});

test('200 clears guest token, profile cache keys and signs back out to the login screen', async () => {
  const { dialog, result, calls, local, session, loggedOut } = await run(200, { ok: true });
  assert.equal(result.ok, true);
  assert.equal(result.transport, 'http');
  assert.equal(loggedOut, 1);
  assert.equal(dialog.isOpen(), false);
  assert.equal(dialog.messageKey(), '');
  for (const key of ACCOUNT_STORAGE_KEYS) assert.equal(local.getItem(key), null, key);
  assert.equal(session.getItem('arena.gcred'), null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://drop-havoc.onrender.com/account/delete');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer id-token');
  assert.deepEqual(calls[0].body, { confirm: 'delete' });
});

test('401, 429 and 500 keep the account and show a specific message', async () => {
  const cases = [
    [401, { ok: false, error: 'unauthorized' }, 'account.deleteErr.unauthorized'],
    [429, { ok: false, error: 'rate' }, 'account.deleteErr.rate'],
    [500, { ok: false, error: 'server' }, 'account.deleteErr.server'],
    [400, { ok: false, error: 'confirm' }, 'account.deleteErr.confirm'],
    [405, { ok: false, error: 'method' }, 'account.deleteErr.method'],
  ];
  for (const [status, body, key] of cases) {
    const { dialog, result, local, session, loggedOut } = await run(status, body);
    assert.equal(result.ok, false);
    assert.equal(result.errorKey, key);
    assert.equal(dialog.isOpen(), true);
    assert.equal(dialog.messageKey(), key);
    assert.equal(loggedOut, 0);
    assert.equal(local.getItem('arena.guestToken'), JSON.stringify(GUEST));
    assert.equal(session.getItem('arena.gcred'), 'fb:id-token');
  }
});

test('cancel and back close the dialog without calling the server', async () => {
  let called = 0;
  const dialog = createDeleteDialog({ request: async () => { called += 1; return { ok: true }; } });
  dialog.open();
  assert.equal(dialog.cancel(), true);
  assert.equal(dialog.isOpen(), false);
  dialog.open();
  assert.equal(dialog.back(), true);
  assert.equal(dialog.isOpen(), false);
  assert.equal(dialog.messageKey(), '');
  assert.equal(dialog.back(), false);
  assert.equal(called, 0);
});

test('Android back is wired as one entry at the end of closeTopOverlay', () => {
  const src = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function closeTopOverlay'), src.indexOf('document.addEventListener(\'keydown\''));
  assert.match(fn, /if \(!\$\('delete-account'\)\.classList\.contains\('hidden'\)\) \{ \$\('delete-account-no'\)\.click\(\); return true; \}\s*return false;/);
});

test('a failed HTTP request can fall back to the open socket', async () => {
  const messages = [];
  const listeners = new Map();
  const socket = {
    readyState: 1,
    send(data) { messages.push(JSON.parse(data)); },
    addEventListener(type, fn) {
      listeners.set(type, fn);
      if (type === 'message') queueMicrotask(() => fn({ data: JSON.stringify({ t: 'accountDeleted', ok: true }) }));
    },
    removeEventListener() {},
  };
  const { result, calls, loggedOut } = await run(0, null, { fail: true, socket });
  assert.equal(calls.length, 1);
  assert.deepEqual(messages[0], { t: 'deleteAccount', confirm: 'delete' });
  assert.equal(result.ok, true);
  assert.equal(result.transport, 'ws');
  assert.equal(loggedOut, 1);
});
