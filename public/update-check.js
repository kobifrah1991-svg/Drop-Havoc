// In-game update check: compares APP_VERSION to public/version.json and offers download/reload.
import { APP_VERSION, cmpVer } from './shared/app-version.js';

function $(id) { return document.getElementById(id); }

export { cmpVer, APP_VERSION };

function detectChannel() {
  // Capacitor / custom WebView APK sets ARENA_OFFLINE and often lacks a normal browser chrome
  const ua = navigator.userAgent || '';
  if (window.ARENA_OFFLINE && /Android/i.test(ua)) return 'android';
  if (window.ARENA_OFFLINE && (/Electron|DropHavoc/i.test(ua) || /Windows|Macintosh/i.test(ua))) return 'desktop';
  if (/Android/i.test(ua) && window.matchMedia('(display-mode: standalone)').matches) return 'android';
  return 'web';
}

function dismissKey(latest) {
  return 'dh.update.dismiss.' + latest;
}

/**
 * @param {{ t: (key: string, vars?: object) => string }} i18n
 */
export async function checkForUpdate(i18n) {
  const banner = $('update-banner');
  if (!banner) return { checked: false };

  let remote;
  try {
    const url = new URL('version.json', location.href);
    url.searchParams.set('t', String(Date.now())); // bypass caches
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return { checked: true, update: false, reason: 'http-' + res.status };
    remote = await res.json();
  } catch (e) {
    return { checked: true, update: false, reason: 'offline' };
  }

  const latest = remote?.version;
  if (!latest || cmpVer(APP_VERSION, latest) >= 0) {
    banner.classList.add('hidden');
    return { checked: true, update: false, current: APP_VERSION, latest };
  }

  try {
    if (sessionStorage.getItem(dismissKey(latest)) === '1') {
      return { checked: true, update: true, dismissed: true, current: APP_VERSION, latest };
    }
  } catch { /* ignore */ }

  const lang = (document.documentElement.lang || 'he').slice(0, 2);
  const notes = (remote.notes && (remote.notes[lang] || remote.notes.en || remote.notes.he)) || '';
  const channel = detectChannel();
  const ch = (remote.channels && remote.channels[channel]) || remote.channels?.web || { action: 'reload', url: '.' };

  $('update-current').textContent = APP_VERSION;
  $('update-latest').textContent = latest;
  $('update-notes').textContent = notes;
  // refresh i18n labels if keys exist
  if (i18n?.t) {
    banner.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.getAttribute('data-i18n');
      if (k) el.textContent = i18n.t(k);
    });
  }

  banner.classList.remove('hidden');

  const go = $('update-go');
  const later = $('update-later');
  const onGo = async () => {
    if (ch.action === 'reload' || channel === 'web') {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch { /* ignore */ }
      const u = new URL(ch.url || '.', location.href);
      u.searchParams.set('v', latest);
      location.replace(u.href);
      return;
    }
    // android / desktop: open download in the system browser (or same WebView)
    const target = ch.url || remote.channels?.web?.url || '.';
    try {
      window.open(target, '_blank', 'noopener');
    } catch {
      location.href = target;
    }
  };
  const onLater = () => {
    try { sessionStorage.setItem(dismissKey(latest), '1'); } catch { /* ignore */ }
    banner.classList.add('hidden');
  };
  go.onclick = onGo;
  later.onclick = onLater;

  return { checked: true, update: true, current: APP_VERSION, latest, channel };
}

