// Firebase web settings for Google sign-in (public identifiers, not secrets: they only name the Firebase project).
// Fill apiKey and appId from Firebase console > Project settings > Your apps > Web app. Empty = Google sign-in off
// (the game server's /config can also supply them through FIREBASE_API_KEY / FIREBASE_APP_ID).
export const FIREBASE_WEB = {
  apiKey: '',
  authDomain: 'scitedra-games.firebaseapp.com',
  projectId: 'scitedra-games',
  appId: '',
};
// Where the Android app sends players to sign in with Google (opens in the phone's browser)
export const SIGNIN_PAGE = 'https://kobifrah1991-svg.github.io/Drop-Havoc/signin.html';

// 0.16.47: the apiKey/appId are read at startup from the studio's Firebase Hosting site, which publishes them at the
// reserved /__/firebase/init.js. Loaded as a <script> (no CORS needed) with a stand-in `firebase` that only records the
// settings. Fills FIREBASE_WEB in place; resolves true when sign-in can be offered.
let discovering = null;
export function discoverFirebase(hosts = ['scitedra-games.firebaseapp.com', 'scitedra-games.web.app']) {
  if (FIREBASE_WEB.apiKey) return Promise.resolve(true);
  if (typeof document === 'undefined') return Promise.resolve(false);
  return discovering ||= (async () => {
    for (const host of hosts) {
      const saved = window.firebase; let got = null;
      window.firebase = { initializeApp(c) { got = c; return {}; }, apps: [] };
      try {
        await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = `https://${host}/__/firebase/init.js`; s.onload = ok; s.onerror = bad; setTimeout(bad, 8000); document.head.appendChild(s); });
      } catch { /* blocked or offline: try the next host */ }
      window.firebase = saved; if (saved === undefined) delete window.firebase;
      if (got?.apiKey && got.projectId === FIREBASE_WEB.projectId) { FIREBASE_WEB.apiKey = got.apiKey; if (got.appId) FIREBASE_WEB.appId = got.appId; return true; }
    }
    return false;
  })();
}
