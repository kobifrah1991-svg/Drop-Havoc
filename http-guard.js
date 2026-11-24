// HTTP / WebSocket guards. A bad request must get a response, not take the process down.

// Decode the path only. A malformed percent-escape (or a NUL) is rejected instead of thrown.
export function requestPath(url) {
  try {
    const path = decodeURIComponent(String(url || '/').split('?')[0]);
    if (!path.startsWith('/') || path.includes('\0')) return null;
    return path;
  } catch {
    return null;
  }
}

// Sync throws and rejected promises both go to onError. The process keeps running.
export function guardCall(fn, onError) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.catch((err) => onError(err));
    return out;
  } catch (err) {
    onError(err);
  }
}
