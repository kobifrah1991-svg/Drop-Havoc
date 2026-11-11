// The Play App Bundle must not be able to install APKs itself. Play updates the app.
export function playManifest(xml) {
  let s = String(xml);
  s = s.replace(/\s*<!-- 0\.16\.53 in-game update[^>]*-->/, '');
  s = s.replace(/\s*<uses-permission android:name="android\.permission\.REQUEST_INSTALL_PACKAGES" \/>/, '');
  s = s.replace(/\s*<provider android:name="\.UpdateProvider"[\s\S]*?\/>/, '');
  if (!s.includes('drophavoc.store')) {
    s = s.replace('</application>', '    <meta-data android:name="drophavoc.store" android:value="play" />\n    </application>');
  }
  if (s.includes('REQUEST_INSTALL_PACKAGES') || s.includes('UpdateProvider')) {
    throw new Error('Play manifest still contains the self-updater');
  }
  return s;
}
