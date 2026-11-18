// Second layer under the Play compile flag. The native bridge reports store() === 'play'
// only in the Play build. Sideload returns 'apk'. The web build has no bridge.
export function isPlayStore(app) {
  try { return app?.store?.() === 'play'; } catch { return false; }
}

// True only for a sideload Android shell that still exposes updateGame and does not need a newer shell.
export function shouldDownloadGameFiles(app, channel, minShell) {
  if (isPlayStore(app)) return false;
  if (channel !== 'android' || typeof app?.updateGame !== 'function') return false;
  return !((minShell || 0) > (Number(app.shell?.()) || 0));
}
