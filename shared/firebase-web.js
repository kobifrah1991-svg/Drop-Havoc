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
