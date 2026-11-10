// Firebase web settings for Google sign-in (public identifiers, not secrets: they only name the Firebase project).
// Fill apiKey and appId from Firebase console > Project settings > Your apps > Web app. Empty = Google sign-in off
// (the game server's /config can also supply them through FIREBASE_API_KEY / FIREBASE_APP_ID).
// 0.16.67 the studio's sites (scitedra-games.web.app) run on Firebase project cyberlab-3d: Google sign-in is
// enabled there and kobifrah1991-svg.github.io is an authorised domain. The apiKey is a public identifier.
export const FIREBASE_WEB = {
  apiKey: 'AIzaSyBD6ObU-luW7vu6Fjoo9bjIIQ2lR_0tgFc',
  authDomain: 'cyberlab-3d.firebaseapp.com',
  projectId: 'cyberlab-3d',
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
      if (got?.apiKey && got.projectId) { Object.assign(FIREBASE_WEB, { apiKey: got.apiKey, projectId: got.projectId, authDomain: got.authDomain || got.projectId + '.firebaseapp.com' }); if (got.appId) FIREBASE_WEB.appId = got.appId; return true; } // 0.16.67 whatever project the studio site runs on (it was rejected for not being named scitedra-games)
    }
    discovering = null; // 0.16.62 not found (offline, blocked): the next try asks again
    return false;
  })();
}
