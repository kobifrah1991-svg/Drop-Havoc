// True when the Android shell is the Google Play build (DropHavocApp.store() === "play").
export function isPlayStore(app) {
  try { return app?.store?.() === 'play'; } catch { return false; }
}
