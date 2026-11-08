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

// 0.16.53 The APK carries its own copy of the game, so it asks the live site which version is current
export const LIVE_SITE = 'https://kobifrah1991-svg.github.io/Drop-Havoc/';

function dismissKey(latest) {
  return 'dh.update.dismiss.' + latest;
}

/**
 * @param {{ t: (key: string, vars?: object) => string }} i18n
 */
export async function checkForUpdate(i18n) {
  // the Android app runs the game as a classic script in <head>, before the banner below it exists
  if (!$('update-banner') && document.readyState === 'loading') await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  const banner = $('update-banner');
  if (!banner) return { checked: false };

  let remote;
  try {
    const url = new URL('version.json', window.ARENA_OFFLINE ? LIVE_SITE : location.href);
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
    if (!window.DropHavocApp?.updateGame && sessionStorage.getItem(dismissKey(latest)) === '1') {
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
  const tr = (k, v) => (i18n?.t ? i18n.t(k, v) : k);

  // 0.16.53 Android app: new game files download by themselves with a progress bar, no installer screen; when they
  // are in, one tap restarts the game on the new version. Only a newer app shell (minShell) still needs the APK.
  const app = window.DropHavocApp;
  if (channel === 'android' && app?.updateGame && !((ch.minShell || 0) > (app.shell?.() || 0))) {
    const notesEl = $('update-notes');
    const start = () => {
      go.disabled = true; go.onclick = null; go.textContent = tr('update.downloading', { n: 0 });
      app.updateGame(new URL(ch.bundle || 'app/', LIVE_SITE).href, latest);
    };
    window.dropHavocUpdate = (state, pct) => {
      if (state === 'progress') { go.textContent = tr('update.downloading', { n: pct >= 0 ? pct : '…' }); return; }
      if (state === 'ready') {
        banner.classList.remove('hidden'); notesEl.textContent = tr('update.ready');
        go.disabled = false; go.textContent = tr('update.restart'); go.onclick = () => app.restart();
      }
      if (state === 'failed') { notesEl.textContent = tr('update.failed'); go.disabled = false; go.textContent = tr('update.retry'); go.onclick = start; }
    };
    later.textContent = tr('update.keepPlaying');
    later.onclick = () => banner.classList.add('hidden'); // the download carries on; the new version starts next time
    start();
    return { checked: true, update: true, current: APP_VERSION, latest, channel, mode: 'game-files' };
  }
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
    const target = ch.url || remote.channels?.web?.url || '.';
    // 0.16.53 Android app: download inside the game with a progress bar, then Android's installer opens (tap Update)
    const app = window.DropHavocApp;
    if (channel === 'android' && app?.store?.() === 'play') { app.update(target); return; } // Play build: opens the store page
    if (channel === 'android' && app?.update) {
      const t = tr;
      const notesEl = $('update-notes');
      go.disabled = true; later.hidden = true;
      window.dropHavocUpdate = (state, pct) => {
        if (state === 'progress') { go.textContent = t('update.downloading', { n: pct >= 0 ? pct : '…' }); return; }
        go.disabled = state !== 'failed' && state !== 'install'; later.hidden = false;
        if (state === 'allow') { notesEl.textContent = t('update.allow'); go.textContent = t('update.downloading', { n: 100 }); }
        if (state === 'install') { notesEl.textContent = t('update.install'); go.textContent = t('update.download'); }
        if (state === 'failed') { notesEl.textContent = t('update.failed'); go.textContent = t('update.download'); }
      };
      go.textContent = t('update.downloading', { n: 0 });
      const u = new URL(target, LIVE_SITE); u.searchParams.set('v', latest);
      app.update(u.href);
      return;
    }
    // android (older app) / desktop: open download in the system browser (or same WebView)
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

