// In-app account deletion. Talks to POST /account/delete (server PR #44).
// Google: Authorization: Bearer <Firebase ID token> (the fb: prefix the game already stores).
// Guest: Authorization: Guest <device-uuid>. WebSocket is only a fallback when HTTP cannot connect.

const GUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACCOUNT_STORAGE_KEYS = ['arena.guestToken', 'arena.fbr', 'arena.gate'];

export function deleteAuthorization(credential, guestToken) {
  const cred = typeof credential === 'string' ? credential.trim() : '';
  if (cred.startsWith('fb:')) {
    const token = cred.slice(3).trim();
    if (token) return 'Bearer ' + token;
  } else if (cred) {
    return 'Bearer ' + cred;
  }
  const guest = typeof guestToken === 'string' ? guestToken.trim() : '';
  if (GUEST_UUID.test(guest)) return 'Guest ' + guest;
  return '';
}

export function accountDeleteUrl(base) {
  return String(base || '').replace(/\/$/, '') + '/account/delete';
}

export function deleteErrorKey(status, body) {
  const err = body && typeof body.error === 'string' ? body.error : '';
  if (err === 'confirm' || status === 400) return 'account.deleteErr.confirm';
  if (err === 'unauthorized' || status === 401) return 'account.deleteErr.unauthorized';
  if (err === 'method' || status === 405) return 'account.deleteErr.method';
  if (err === 'rate' || status === 429) return 'account.deleteErr.rate';
  if (err === 'server' || status === 500) return 'account.deleteErr.server';
  return 'account.deleteErr.unknown';
}

export function interpretDeleteResponse(status, body, transport) {
  if (status === 200 && body && body.ok === true) return { ok: true, transport, status, body };
  const error = body && typeof body.error === 'string' ? body.error : '';
  return { ok: false, transport, status, body, error, errorKey: deleteErrorKey(status, body) };
}

export async function postAccountDelete(fetchImpl, { base, authorization }) {
  const res = await fetchImpl(accountDeleteUrl(base), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
    },
    body: JSON.stringify({ confirm: 'delete' }),
  });
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return interpretDeleteResponse(res.status, body, 'http');
}

export function deleteOverSocket(socket) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.readyState !== 1 || typeof socket.send !== 'function') {
      reject(new Error('socket'));
      return;
    }
    const onMessage = (ev) => {
      let m;
      try { m = typeof ev.data === 'string' ? JSON.parse(ev.data) : null; } catch { return; }
      if (!m || m.t !== 'accountDeleted') return;
      cleanup();
      const status = m.ok ? 200 : m.error === 'unauthorized' ? 401 : m.error === 'rate' ? 429 : m.error === 'confirm' ? 400 : 500;
      resolve(interpretDeleteResponse(status, { ok: !!m.ok, error: m.error }, 'ws'));
    };
    const onClose = () => { cleanup(); reject(new Error('closed')); };
    const cleanup = () => {
      socket.removeEventListener?.('message', onMessage);
      socket.removeEventListener?.('close', onClose);
    };
    socket.addEventListener?.('message', onMessage);
    socket.addEventListener?.('close', onClose);
    socket.send(JSON.stringify({ t: 'deleteAccount', confirm: 'delete' }));
  });
}

// HTTP first. A network failure (no response) may use an already-open socket. HTTP error statuses stay on HTTP.
export async function requestAccountDelete({ fetchImpl, base, authorization, socket }) {
  try {
    return await postAccountDelete(fetchImpl, { base, authorization });
  } catch (err) {
    if (socket && socket.readyState === 1) return deleteOverSocket(socket);
    throw err;
  }
}

export function clearAccountStorage(localStorage, sessionStorage) {
  const removed = [];
  for (const key of ACCOUNT_STORAGE_KEYS) {
    try { localStorage?.removeItem(key); removed.push(key); } catch { /* storage blocked */ }
  }
  try { sessionStorage?.removeItem('arena.gcred'); removed.push('session:arena.gcred'); } catch { /* storage blocked */ }
  return removed;
}

export function createDeleteDialog({ request, clearLocal, onLoggedOut }) {
  let open = false;
  let busy = false;
  let messageKey = '';
  return {
    isOpen: () => open,
    isBusy: () => busy,
    messageKey: () => messageKey,
    open() { open = true; messageKey = ''; },
    cancel() { open = false; messageKey = ''; return true; },
    back() {
      if (!open) return false;
      open = false;
      messageKey = '';
      return true;
    },
    async confirm() {
      if (!open || busy) return null;
      busy = true;
      messageKey = 'account.deleteWorking';
      try {
        const result = await request();
        if (result?.ok) {
          clearLocal?.();
          open = false;
          messageKey = '';
          busy = false;
          onLoggedOut?.();
          return result;
        }
        messageKey = result?.errorKey || 'account.deleteErr.unknown';
        busy = false;
        return result;
      } catch {
        messageKey = 'account.deleteErr.network';
        busy = false;
        return { ok: false, errorKey: 'account.deleteErr.network' };
      }
    },
  };
}
