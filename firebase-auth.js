// Verifies a Firebase Authentication ID token on the server (no SDK needed): RS256 signature checked against
// Google's published certificates for Firebase (cached as long as Google says), then the claims:
// audience = the Firebase project, issuer = securetoken.google.com/<project>, not expired, verified email.
// Returns { email, name, uid } or null. Nothing the browser says is trusted without this check.
import crypto from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certs = null, certsUntil = 0;
async function getCerts(fetchFn) {
  if (certs && Date.now() < certsUntil) return certs;
  const r = await fetchFn(CERTS_URL);
  if (!r.ok) throw new Error('certs ' + r.status);
  certs = await r.json();
  const age = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  certsUntil = Date.now() + (age ? Number(age[1]) * 1000 : 3600_000);
  return certs;
}
const b64json = (s) => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

export async function verifyFirebaseToken(token, projectId, { fetchFn = fetch, now = Date.now() } = {}) {
  try {
    if (!projectId || typeof token !== 'string' || token.length > 4096) return null;
    const [h, p, sig] = token.split('.');
    if (!h || !p || !sig) return null;
    const header = b64json(h), claims = b64json(p);
    if (header.alg !== 'RS256' || !header.kid) return null;
    const pem = (await getCerts(fetchFn))[header.kid];
    if (!pem) return null;
    const ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p).verify(pem, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
    if (!ok) return null;
    const t = Math.floor(now / 1000);
    if (claims.aud !== projectId || claims.iss !== 'https://securetoken.google.com/' + projectId) return null;
    if (!(claims.exp > t) || claims.iat > t + 300 || !claims.sub) return null;
    if (!claims.email || claims.email_verified !== true) return null;
    return { email: String(claims.email).toLowerCase(), name: claims.name || claims.email, uid: claims.sub };
  } catch { return null; }
}
