// Account deletion (store policy). Google proves itself with a Firebase ID token.
// A guest proves itself with the device token that already keys d:<uuid>.
// The caller cannot name a different account: the credential is the account.
import crypto from 'node:crypto';

export const DELETE_LIMITS = { perAccount: 3, perIp: 10, windowMs: 60 * 60 * 1000 };
const DEFAULT_PEPPER = 'drop-havoc-ban-v1';

// Stable one-way id. Set BAN_HASH_PEPPER in the environment and do not rotate it:
// bans kept after a deletion match this hash, and a new pepper would orphan them.
export function banHash(value, pepper = DEFAULT_PEPPER) {
  if (value == null || value === '') return null;
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
  const pepper = () => env.BAN_HASH_PEPPER || DEFAULT_PEPPER;
  const hits = new Map();

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
  async function run(identity) {
    const anon = 'deleted:' + banHash(identity.accountId, pepper());
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
    identity.ip = ip || null;
    if (!allow({ accountId: identity.accountId, ip: identity.ip, at })) return { status: 429, body: { ok: false, error: 'rate' } };
    await run(identity);
    return { status: 200, body: { ok: true } };
  }

  // The socket is already authenticated. The message cannot name some other account.
  async function fromSession(sess, confirm) {
    if (confirm !== 'delete') return { ok: false, error: 'confirm' };
    const accountId = economy?.accountId?.(sess);
    if (!accountId) return { ok: false, error: 'unauthorized' };
    const identity = sess.user?.email
      ? { accountId, email: String(sess.user.email).toLowerCase(), uid: sess.user.uid || null, guest: null, ip: sess.ip || null }
      : { accountId, email: null, uid: null, guest: sess.guestToken || null, ip: sess.ip || null };
    if (!allow({ accountId, ip: identity.ip })) return { ok: false, error: 'rate' };
    await run(identity);
    return { ok: true };
  }

  return { http, fromSession, banHash: (v) => banHash(v, pepper()) };
}
