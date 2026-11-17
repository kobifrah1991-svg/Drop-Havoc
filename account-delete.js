// Account deletion (store policy). Google proves itself with a Firebase ID token.
// A guest proves itself with the device token that already keys d:<uuid>.
// The caller cannot name a different account: the credential is the account.
import crypto from 'node:crypto';

export const DELETE_LIMITS = { perAccount: 3, perIp: 10, windowMs: 60 * 60 * 1000 };

// The counters live in this process only. A restart clears them.
// BAN_HASH_PEPPER is required. There is no default: a missing pepper refuses deletion
// and skips hash rewrites. Do not rotate a pepper that already hashed bans.

export function banPepper(env = process.env) {
  const p = env && env.BAN_HASH_PEPPER;
  return typeof p === 'string' && p.trim() ? p : null;
}

// Returns null when value or pepper is missing. Callers must not invent a pepper.
export function banHash(value, pepper) {
  if (value == null || value === '' || pepper == null || String(pepper).trim() === '') return null;
  return crypto.createHmac('sha256', String(pepper)).update(String(value)).digest('hex');
}

const GUEST_TOKEN = /^[0-9a-f-]{36}$/;

export function createAccountDeletion({
  economy,
  admin,
  reports,
  verifyFirebase,
  disconnect = () => {},
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const hits = new Map();
  function requirePepper() {
    const p = banPepper(env);
    if (!p) console.error('BAN_HASH_PEPPER is not set; refusing account deletion');
    return p;
  }

  function allow({ accountId, ip, at = now() } = {}) {
    const take = (key, limit) => {
      if (!key) return true;
      const list = (hits.get(key) || []).filter((t) => at - t < DELETE_LIMITS.windowMs);
      if (list.length >= limit) { hits.set(key, list); return false; }
      list.push(at);
      hits.set(key, list);
      return true;
    };
    if (accountId && !take('acct:' + accountId, DELETE_LIMITS.perAccount)) return false;
    if (ip && !take('ip:' + ip, DELETE_LIMITS.perIp)) return false;
    return true;
  }

  async function authenticate(authorization) {
    const header = String(authorization || '').trim();
    if (/^bearer\s+/i.test(header)) {
      const token = header.replace(/^bearer\s+/i, '').trim();
      if (!token || token.length > 4096) return null;
      const user = await verifyFirebase(token);
      if (!user?.email) return null;
      const email = String(user.email).toLowerCase();
      return { accountId: 'g:' + email, email, uid: user.uid || null, guest: null };
    }
    if (/^guest\s+/i.test(header)) {
      const token = header.replace(/^guest\s+/i, '').trim().toLowerCase();
      if (!GUEST_TOKEN.test(token)) return null;
      return { accountId: 'd:' + token, email: null, uid: null, guest: token };
    }
    return null;
  }

  // Idempotent. A second call for an account that is already gone still succeeds.
  // Caller must already have refused when BAN_HASH_PEPPER is missing.
  async function run(identity) {
    const p = banPepper(env);
    if (!p) return { ok: false, error: 'config' };
    const anon = 'deleted:' + banHash(identity.accountId, p);
    const { banned } = admin?.prepareDeletion ? admin.prepareDeletion(identity) : { banned: false };
    if (reports?.retainForDeletion) await reports.retainForDeletion({ accountId: identity.accountId, uid: identity.uid, banned, anon });
    if (economy?.deleteAccount) await economy.deleteAccount(identity.accountId);
    try { disconnect(identity.accountId); } catch (err) { console.error('account delete disconnect:', err.message); }
    return { ok: true };
  }

  async function http({ method, authorization, body, ip, at }) {
    if (method === 'OPTIONS') return { status: 204, body: null };
    if (method !== 'POST') return { status: 405, body: { ok: false, error: 'method' } };
    let parsed = {};
    if (body && String(body).trim()) {
      try { parsed = JSON.parse(body); } catch { return { status: 400, body: { ok: false, error: 'confirm' } }; }
    }
    if (!parsed || parsed.confirm !== 'delete') return { status: 400, body: { ok: false, error: 'confirm' } };
    const identity = await authenticate(authorization);
    if (!identity) return { status: 401, body: { ok: false, error: 'unauthorized' } };
    if (!requirePepper()) return { status: 503, body: { ok: false, error: 'config' } };
    identity.ip = ip || null;
    if (!allow({ accountId: identity.accountId, ip: identity.ip, at })) return { status: 429, body: { ok: false, error: 'rate' } };
    const done = await run(identity);
    if (!done.ok) return { status: done.error === 'config' ? 503 : 500, body: { ok: false, error: done.error || 'server' } };
    return { status: 200, body: { ok: true } };
  }

  // The socket is already authenticated. The message cannot name some other account.
  async function fromSession(sess, confirm) {
    if (confirm !== 'delete') return { ok: false, error: 'confirm' };
    const accountId = economy?.accountId?.(sess);
    if (!accountId) return { ok: false, error: 'unauthorized' };
    if (!requirePepper()) return { ok: false, error: 'config' };
    const identity = sess.user?.email
      ? { accountId, email: String(sess.user.email).toLowerCase(), uid: sess.user.uid || null, guest: null, ip: sess.ip || null }
      : { accountId, email: null, uid: null, guest: sess.guestToken || null, ip: sess.ip || null };
    if (!allow({ accountId, ip: identity.ip })) return { ok: false, error: 'rate' };
    return run(identity);
  }

  return { http, fromSession, banHash: (v) => banHash(v, banPepper(env)) };
}
