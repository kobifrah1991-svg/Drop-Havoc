import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { sha256B64url, sha256Bytes } from '../shared/sha256.js';
import { createSignInHandoff } from '../shared/signin-handoff.js';

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

test('sha256 matches Node for the sign-in challenge', () => {
  for (const text of ['', 'abc', 'a verifier that stays on the phone']) {
    assert.equal(hex(sha256Bytes(new TextEncoder().encode(text))), crypto.createHash('sha256').update(text).digest('hex'));
    assert.equal(sha256B64url(text), crypto.createHash('sha256').update(text).digest('base64url'));
  }
});

function handoff(now = () => 1_000_000) {
  const seen = [];
  const box = createSignInHandoff({
    now,
    verify: async (token) => {
      seen.push(token);
      return token.endsWith('.good') ? { email: 'player@example.com' } : null;
    },
    challengeOf: (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url'),
  });
  return { box, seen };
}

const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ'; // 43 chars, never sent to the page
const other = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
const token = 'hdr.payload.good';
const refresh = 'refresh-token-value-0123456789';

test('the app redeems tokens once with its verifier; the page challenge is not enough', async () => {
  const { box, seen } = handoff();
  const state = sha256B64url(verifier);
  const put = await box.deposit({ state, idToken: token, refreshToken: refresh });
  assert.equal(put.ok, true);
  assert.equal(put.idToken, undefined, 'deposit must not echo the token');
  assert.deepEqual(seen, [token]);

  const stolen = box.claim({ verifier: state });
  assert.equal(stolen.ok, false);
  assert.equal(stolen.idToken, undefined, 'the value from the link is not a verifier');

  const stranger = box.claim({ verifier: other });
  assert.equal(stranger.status, 404);

  const got = box.claim({ verifier });
  assert.equal(got.ok, true);
  assert.equal(got.idToken, token);
  assert.equal(got.refreshToken, refresh);

  const again = box.claim({ verifier });
  assert.equal(again.status, 404, 'single use');
});

test('a third party cannot replace a handoff or deposit an unverified token', async () => {
  const { box } = handoff();
  const state = sha256B64url(verifier);
  assert.equal((await box.deposit({ state, idToken: token, refreshToken: refresh })).status, 200);
  const injected = await box.deposit({ state, idToken: 'hdr.payload.good', refreshToken: 'attacker-refresh-token' });
  assert.equal(injected.status, 409);
  assert.equal(injected.idToken, undefined);
  assert.equal((await box.deposit({ state: sha256B64url(other), idToken: 'hdr.bad.nope', refreshToken: '' })).status, 401);
  assert.equal(box.claim({ verifier }).idToken, token, 'the first verified deposit is the one redeemed');
  assert.equal(box.claim({ verifier: other }).status, 404);
});

test('expired handoffs and bad inputs yield no session', async () => {
  let now = 5_000;
  const { box } = handoff(() => now);
  const state = sha256B64url(verifier);
  assert.equal((await box.deposit({ state, idToken: token, refreshToken: '' })).status, 200);
  now += 180000;
  assert.equal(box.claim({ verifier }).status, 404);
  assert.equal((await box.deposit({ state: 'short', idToken: token })).status, 400);
  assert.equal((await box.deposit({ state, idToken: 'not a jwt', refreshToken: refresh })).status, 400);
  assert.equal(box.claim({ verifier: 'nope' }).status, 400);
});

test('the custom-scheme token link is gone from the app, page, and manifest', () => {
  const signin = fs.readFileSync(new URL('../public/signin.html', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const java = fs.readFileSync(new URL('../android/src/com/scitedragames/drophavoc/MainActivity.java', import.meta.url), 'utf8');
  const xml = fs.readFileSync(new URL('../android/AndroidManifest.xml', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(signin, /drophavoc:\/\//);
  assert.match(signin, /\/auth\/handoff/);
  assert.match(signin, /no-referrer/);
  assert.doesNotMatch(client, /drophavoc:\/\//);
  assert.match(client, /\/auth\/claim/);
  assert.match(client, /function enterAsGuest\(/);
  assert.match(client, /signInWithPopup/);
  assert.doesNotMatch(java, /dropHavocSignIn\(/);
  assert.doesNotMatch(java, /getQueryParameter\("t"\)/);
  assert.doesNotMatch(xml, /android:scheme="drophavoc"/);
  assert.doesNotMatch(xml, /android:host="signin"/);
  assert.match(server, /\/auth\/handoff/);
  assert.match(server, /\/auth\/claim/);
  assert.match(server, /verifyFirebaseToken/);
});
