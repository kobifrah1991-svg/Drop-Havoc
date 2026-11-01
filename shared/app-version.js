// Client build version shown in the menu and compared to public/version.json on launch.
// Bump together with package.json and the ALPHA label in public/index.html.
export const APP_VERSION = '0.16.27';

export function parseVer(s) {
  return String(s || '0').split(/[^\d]+/).filter(Boolean).map((n) => parseInt(n, 10) || 0);
}

/** @returns {number} negative if a < b */
export function cmpVer(a, b) {
  const A = parseVer(a), B = parseVer(b);
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d;
  }
  return 0;
}
