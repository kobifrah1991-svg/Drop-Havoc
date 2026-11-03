// Lobby banner + event inventory. The banner renders only when the server
// sets event.banner (DH_EVENT_BANNER=1). Grants and the shop featured badge
// follow event.live and the account, and they never add a buy button.
import { t } from './shared/i18n.js';
import { bannerModel, KILL_FLASH_MS } from './shared/events.js';
import { SHOP } from './shared/shop.js';

let snapshot = null;
let lastProfile = null;
let timer = null;

const $ = (id) => document.getElementById(id);

export function currentLiveEvent() {
  return snapshot;
}

export function applyLiveEvent(next) {
  snapshot = next && typeof next === 'object' ? next : null;
  paintEventBanner(lastProfile);
  if (timer) clearInterval(timer);
  timer = snapshot?.live ? setInterval(() => paintEventBanner(lastProfile), 1000) : null;
}

export function setEventProfile(profile) {
  lastProfile = profile || null;
  paintEventBanner(lastProfile);
}

function fmtLeft(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}

function fmtUtc(ts) {
  try { return new Date(ts).toISOString().slice(0, 16).replace('T', ' '); }
  catch { return ''; }
}

// One lobby banner. Hidden unless the server UI gate is open.
export function paintEventBanner(profile) {
  const el = $('event-banner');
  if (!el) return;
  const model = bannerModel(snapshot);
  if (!model) {
    el.hidden = true;
    el.classList.add('hidden');
    return;
  }
  el.hidden = false;
  el.classList.remove('hidden');
  const img = $('event-banner-img');
  if (img && img.getAttribute('src') !== model.bannerImg) img.src = model.bannerImg;
  if (img) img.alt = t(model.titleKey);
  $('event-banner-title').textContent = t(model.titleKey);
  $('event-banner-note').textContent = t(model.subtitleKey);
  const mark = $('event-banner-mark');
  if (mark) {
    if (model.markImg) { mark.hidden = false; mark.src = model.markImg; }
    else { mark.hidden = true; }
  }
  const left = (model.endsAt || 0) - Date.now();
  $('event-banner-timer').textContent = t('event.timer', { time: fmtLeft(left) });
  paintEventGrants($('event-banner-grants'), profile, { compact: true });
}

export function paintEventGrants(el, profile, { compact = false } = {}) {
  if (!el) return;
  el.replaceChildren();
  const events = profile?.events;
  const live = snapshot?.live;
  const wrapSrc = live?.wrapImg || 'img/events/neon-strike/wrap.neon.event.png';
  const badgeSrc = live?.badgeImg || 'img/events/supply-frenzy/badge.runner.temp.png';
  if (events?.wrapNeon) {
    el.append(grantRow(wrapSrc, t('event.wrap.keep')));
  } else if (!compact && live?.id === 'neon-strike') {
    el.append(grantRow(wrapSrc, t('event.wrap.pending')));
  }
  if (!compact && live?.id === 'supply-frenzy' && live.crateImg) {
    el.append(grantRow(live.crateImg, t('event.supply.note')));
  }
  if (events?.supplyRunnerUntil) {
    el.append(grantRow(badgeSrc, t('event.runner.until', { time: fmtUtc(events.supplyRunnerUntil) })));
  }
}

function grantRow(src, text) {
  const row = document.createElement('div');
  row.className = 'event-grant';
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  const span = document.createElement('span');
  span.textContent = text;
  row.append(img, span);
  return row;
}

// Shop extras: featured camo at catalog price, free wrap status, temporary runner.
// No crate purchase and no price other than the catalog price.
export function fillShopEvent(el, profile) {
  if (!el) return;
  el.replaceChildren();
  const live = snapshot?.live;
  if (live?.id === 'neon-strike') {
    const item = SHOP.find((i) => i.id === 'camo.neon');
    const note = document.createElement('p');
    note.className = 'event-shop-note';
    note.textContent = t('event.featured', { n: item ? item.price : 1200 });
    el.append(note);
  }
  const grants = document.createElement('div');
  el.append(grants);
  paintEventGrants(grants, profile, { compact: false });
}

export function featuredCamoId() {
  return snapshot?.live?.id === 'neon-strike' ? 'camo.neon' : null;
}

// Edge glow only. Center stays clear. Clamped to 350ms. pointer-events stay off.
export function neonKillFlash(ms) {
  const el = $('neon-kill-flash');
  if (!el) return;
  const dur = Math.min(KILL_FLASH_MS, Math.max(0, Number(ms) || KILL_FLASH_MS));
  el.classList.add('on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('on'), dur);
}
