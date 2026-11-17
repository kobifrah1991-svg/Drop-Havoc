// Authenticated Firestore access for the game server.
// FIREBASE_SERVICE_ACCOUNT is a service-account JSON string, or the same JSON in base64
// (easier to paste into an env var). When it is set, requests send a Google access token
// minted by firebase-admin. Admin SDK credentials bypass security rules, so firestore.rules
// can deny every client read and write while the server still saves.
// When the variable is missing or unreadable, no Authorization header is added and the
// previous unauthenticated REST calls stay in place. Nothing breaks before the key is set.

const tokenCache = new Map(); // client_email -> { token, until }

export function parseServiceAccount(raw) {
  const text = String(raw ?? '').trim();
  if (!text) throw new Error('empty service account');
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  const creds = JSON.parse(json);
  if (!creds || typeof creds.client_email !== 'string' || typeof creds.private_key !== 'string') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not a service account JSON');
  }
  creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  return creds;
}

// getToken defaults to firebase-admin. Tests pass their own so they never call Google.
export async function resolveAuthHeaders(env = process.env, getToken = tokenFromServiceAccount) {
  const raw = env && env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !String(raw).trim()) return {};
  try {
    const token = await getToken(String(raw));
    return token ? { Authorization: 'Bearer ' + token } : {};
  } catch (err) {
    console.error('Firestore auth unavailable, continuing without a token:', err && err.message);
    return {};
  }
}

export async function tokenFromServiceAccount(raw) {
  const creds = parseServiceAccount(raw);
  const cached = tokenCache.get(creds.client_email);
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const mod = await import('firebase-admin');
  const admin = mod.default && mod.default.credential ? mod.default : mod;
  const name = 'drophavoc-' + creds.client_email;
  const existing = (admin.apps || []).find((app) => app && app.name === name);
  const app = existing || admin.initializeApp({ credential: admin.credential.cert(creds) }, name);
  const tok = await app.options.credential.getAccessToken();
  const token = tok && tok.access_token;
  if (!token) throw new Error('Firebase Admin did not return an access token');
  tokenCache.set(creds.client_email, { token, until: tok.expiry_date || Date.now() + 30 * 60 * 1000 });
  return token;
}
