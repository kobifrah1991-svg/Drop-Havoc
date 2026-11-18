// Android Google sign-in handoff. The browser never puts Firebase tokens in a link.
// The app creates a verifier, sends only sha256(verifier) as `state` to the sign-in page,
// and later redeems the stored tokens with the verifier. One use, a few minutes, no overwrite.

const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;
const ID_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REFRESH_RE = /^[A-Za-z0-9\-._~+/]+=*$/;

export const SIGNIN_HANDOFF_TTL_MS = 180000;

export function createSignInHandoff({ verify, challengeOf, now = () => Date.now(), ttlMs = SIGNIN_HANDOFF_TTL_MS, maxPending = 200 } = {}) {
  if (typeof verify !== 'function' || typeof challengeOf !== 'function') throw new Error('handoff needs verify and challengeOf');
  const pending = new Map();
  function prune(t) {
    for (const [k, row] of pending) if (row.exp <= t) pending.delete(k);
  }
  return {
    // Browser, after Google sign-in. `state` is the challenge. Tokens are checked, then kept until claim.
    async deposit({ state, idToken, refreshToken } = {}) {
      const t = now();
      prune(t);
      if (typeof state !== 'string' || !CHALLENGE_RE.test(state)) return { ok: false, status: 400, error: 'state' };
      if (typeof idToken !== 'string' || idToken.length > 4096 || !ID_RE.test(idToken)) return { ok: false, status: 400, error: 'token' };
      const refresh = refreshToken == null ? '' : refreshToken;
      if (typeof refresh !== 'string' || refresh.length > 2048 || (refresh && !REFRESH_RE.test(refresh))) return { ok: false, status: 400, error: 'refresh' };
      if (pending.has(state)) return { ok: false, status: 409, error: 'state' };
      if (pending.size >= maxPending) return { ok: false, status: 429, error: 'busy' };
      const user = await verify(idToken);
      if (!user) return { ok: false, status: 401, error: 'verify' };
      if (pending.has(state)) return { ok: false, status: 409, error: 'state' };
      pending.set(state, { idToken, refreshToken: refresh, exp: t + ttlMs });
      return { ok: true, status: 200 };
    },
    // App only. The verifier never went to the browser. Wrong or unknown verifier returns no tokens.
    claim({ verifier } = {}) {
      const t = now();
      prune(t);
      if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return { ok: false, status: 400, error: 'verifier' };
      let challenge;
      try { challenge = challengeOf(verifier); } catch { return { ok: false, status: 400, error: 'verifier' }; }
      if (typeof challenge !== 'string' || !CHALLENGE_RE.test(challenge)) return { ok: false, status: 400, error: 'verifier' };
      const row = pending.get(challenge);
      if (!row) return { ok: false, status: 404, error: 'pending' };
      pending.delete(challenge);
      return { ok: true, status: 200, idToken: row.idToken, refreshToken: row.refreshToken };
    },
  };
}
