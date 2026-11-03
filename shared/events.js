// LOCKED A live-event wave. One runner at a time.
// Order: #2 Neon Strike, then #3 Supply Frenzy.
// #4 Havoc Night is outside this wave and must not be added here.
// #5 and #1 are deferred.
//
// PLACEHOLDER windows / חלונות מציין-מקום — product did not hard-lock the clock.
// Defaults (UTC, same clock as Stage A earn caps in PR #1):
//   Neon Strike  = 7 days, or DH_NEON_STRIKE_MS / DH_NEON_STRIKE_START+END
//   Supply Frenzy = 60 hours (inside the 48–72h weekend band), starting when Neon ends
// Asia/Jerusalem is not used for grants. It is UTC+2 (standard) or UTC+3 (daylight);
// show that conversion in the UI label only.
//
// Flags (default OFF — lobby banner is a separate UI gate):
//   DH_LIVE_EVENTS=1          server windows, grants, chest weights
//   DH_EVENT_BANNER=1         lobby banner + timer (still one banner)
//   DH_EVENT_FORCE=neon-strike|supply-frenzy|off
//   DH_WAVE_A_START=ISO-8601  placeholder anchor, default 2026-11-04T00:00:00.000Z
//
// Local: DH_LIVE_EVENTS=1 DH_EVENT_BANNER=1 DH_EVENT_FORCE=neon-strike node server.js
// Then open /events. No deploy, no APK. Render free sleep does not pause this UTC
// window; it only delays delivery until the process is awake.
//
// Economy: no new CR source. camo.neon stays full catalog price (1200). The neon
// weapon wrap is a free keep grant (credits += 0) and is not a shop SKU or SLOTS
// entry. Supply Runner is a temporary tag with an expiry, not a nameplate.
// Stage A daily 600 / weekly 3500 caps live in PR #1 and are not changed here.

export const WAVE_ANCHOR_UTC = '2026-11-04T00:00:00.000Z';
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

// PLACEHOLDER / מציין מקום — not a product-locked instant.
export const PLACEHOLDER = Object.freeze({
  waveAnchorUtc: WAVE_ANCHOR_UTC,
  neonMs: 7 * DAY_MS,
  supplyMs: 60 * HOUR_MS,
  supplyMinMs: 48 * HOUR_MS,
  supplyMaxMs: 72 * HOUR_MS,
  // Fraction of non-rare in-match chests promoted onto the existing rare table.
  // Does not add a credit amount. Promoted chests pay the rare chest that already exists (60 CR).
  rareBoostChance: 0.35,
  killFlashMs: 350,
});

export const NEON_CAMO_ID = 'camo.neon';
export const NEON_CAMO_PRICE = 1200;
export const WRAP_ID = 'wrap.neon';
export const RUNNER_ID = 'supply-runner';
export const KILL_FLASH_MS = PLACEHOLDER.killFlashMs;

// #4 Havoc Night is intentionally absent. Do not append it.
export const WAVE = Object.freeze([
  {
    id: 'neon-strike',
    order: 2,
    flag: 'neon_strike',
    bannerImg: 'img/events/neon-strike/banner-lobby.png',
    tileImg: 'img/events/neon-strike/camo-neon-tile.png',
    wrapImg: 'img/events/neon-strike/wrap-neon-free.png',
  },
  {
    id: 'supply-frenzy',
    order: 3,
    flag: 'supply_frenzy',
    bannerImg: 'img/events/supply-frenzy/banner-lobby.png',
    badgeImg: 'img/events/supply-frenzy/badge-supply-runner-temp.png',
    crateImg: 'img/events/supply-frenzy/crate-tile.png',
  },
]);

const BY_ID = Object.fromEntries(WAVE.map((e) => [e.id, e]));

export function assertCatalog(shop, slots) {
  const problems = [];
  const neon = (shop || []).find((i) => i.id === NEON_CAMO_ID);
  if (!neon || neon.price !== NEON_CAMO_PRICE) problems.push('camo.neon must stay 1200 CR with no event discount');
  if ((shop || []).some((i) => i.id === 'outfit.neon')) problems.push('outfit.neon is outside Stage A');
  const banned = ['wrap.neon', 'supply-runner', 'lootbox', 'crate', 'nameplate', 'havoc-night', 'outfit.neon'];
  if ((shop || []).some((i) => banned.includes(i.id))) problems.push('event rewards and loot boxes are not shop SKUs');
  if ((slots || []).some((s) => s === 'nameplate' || s === 'wrap')) problems.push('no nameplate or wrap slot');
  if (WAVE.some((e) => e.id === 'havoc-night' || e.order === 4)) problems.push('Havoc Night is outside this wave');
  if (WAVE.length !== 2 || WAVE[0].id !== 'neon-strike' || WAVE[1].id !== 'supply-frenzy') problems.push('wave order must be Neon Strike then Supply Frenzy');
  return problems;
}

function parseTime(raw) {
  if (raw == null || raw === '') return null;
  const n = Date.parse(String(raw));
  return Number.isFinite(n) ? n : null;
}

function readDuration(raw, fallback, min, max) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  let v = n;
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return v;
}

export function eventWindows(env = {}) {
  const neonMs = readDuration(env.DH_NEON_STRIKE_MS, PLACEHOLDER.neonMs, 60_000, null);
  const supplyMs = readDuration(env.DH_SUPPLY_FRENZY_MS, PLACEHOLDER.supplyMs, PLACEHOLDER.supplyMinMs, PLACEHOLDER.supplyMaxMs);
  const anchor = parseTime(env.DH_WAVE_A_START) ?? Date.parse(PLACEHOLDER.waveAnchorUtc);
  const neonStart = parseTime(env.DH_NEON_STRIKE_START) ?? anchor;
  const neonEnd = parseTime(env.DH_NEON_STRIKE_END) ?? neonStart + neonMs;
  const supplyStart = parseTime(env.DH_SUPPLY_FRENZY_START) ?? (neonEnd > neonStart ? neonEnd : neonStart + neonMs);
  const supplyEnd = parseTime(env.DH_SUPPLY_FRENZY_END) ?? supplyStart + supplyMs;
  return {
    neonMs,
    supplyMs,
    'neon-strike': { startsAt: neonStart, endsAt: neonEnd },
    'supply-frenzy': { startsAt: supplyStart, endsAt: supplyEnd },
  };
}

function decorate(id, startsAt, endsAt, forced) {
  const def = BY_ID[id];
  if (!def || !(endsAt > startsAt)) return null;
  return { ...def, startsAt, endsAt, forced: !!forced, nameplate: false, discount: 0 };
}

// At most one live event. Neon Strike wins if the UTC windows overlap.
export function resolveLive(now = Date.now(), env = {}) {
  const enabled = env.DH_LIVE_EVENTS === '1';
  if (!enabled) return { enabled: false, banner: false, live: null, forced: null };
  const windows = eventWindows(env);
  const force = String(env.DH_EVENT_FORCE || '').trim();
  let live = null;
  let forced = null;
  if (force === 'off') {
    forced = 'off';
  } else if (force === 'neon-strike' || force === 'supply-frenzy') {
    const ms = force === 'neon-strike' ? windows.neonMs : windows.supplyMs;
    live = decorate(force, now, now + ms, true);
    forced = force;
  } else {
    // Unknown force, including havoc-night, is ignored.
    const neonW = windows['neon-strike'];
    const supplyW = windows['supply-frenzy'];
    const neonOn = now >= neonW.startsAt && now < neonW.endsAt;
    const supplyOn = now >= supplyW.startsAt && now < supplyW.endsAt;
    if (neonOn) live = decorate('neon-strike', neonW.startsAt, neonW.endsAt, false);
    else if (supplyOn) live = decorate('supply-frenzy', supplyW.startsAt, supplyW.endsAt, false);
  }
  const banner = env.DH_EVENT_BANNER === '1' && !!live;
  return { enabled: true, banner, live, forced };
}

export function publicSnapshot(now = Date.now(), env = {}) {
  const resolved = resolveLive(now, env);
  const live = resolved.live;
  return {
    enabled: resolved.enabled,
    banner: resolved.banner,
    clock: 'UTC',
    live: live ? {
      id: live.id,
      order: live.order,
      flag: live.flag,
      startsAt: live.startsAt,
      endsAt: live.endsAt,
      endsIn: Math.max(0, live.endsAt - now),
      bannerImg: live.bannerImg,
      tileImg: live.tileImg || null,
      wrapImg: live.wrapImg || null,
      badgeImg: live.badgeImg || null,
      crateImg: live.crateImg || null,
      featured: live.id === 'neon-strike' ? NEON_CAMO_ID : null,
      discount: 0,
      killFlashMs: live.id === 'neon-strike' ? KILL_FLASH_MS : 0,
      rareBoost: live.id === 'supply-frenzy' ? PLACEHOLDER.rareBoostChance : 0,
      nameplate: false,
      forced: live.forced,
    } : null,
  };
}

// Cosmetic kill flash only. No damage, speed, or credit change.
// PLACEHOLDER duration: product soft-cap is about 0.35s. Clamped here.
export function killFlashFor(live, killer) {
  if (!live || live.id !== 'neon-strike') return null;
  if (!killer || killer.bot) return null;
  return { id: 'neon', ms: KILL_FLASH_MS };
}

export function rareBoostFor(live) {
  if (!live || live.id !== 'supply-frenzy') return null;
  return { chance: PLACEHOLDER.rareBoostChance };
}

// What a participation trigger may grant. Practice / offline never qualifies.
// creditsDelta is always 0 — callers must not add CR.
export function grantFor(live, trigger) {
  if (!live) return null;
  if (trigger === 'match-end' && live.id === 'neon-strike') {
    return { item: WRAP_ID, creditsDelta: 0, keep: true, nameplate: false };
  }
  if (trigger === 'chest-open' && live.id === 'supply-frenzy') {
    return { item: RUNNER_ID, creditsDelta: 0, temporary: true, expiresAt: live.endsAt, nameplate: false };
  }
  return null;
}

export function featuredOffer(shop, live) {
  if (!live || live.id !== 'neon-strike') return null;
  const item = (shop || []).find((i) => i.id === NEON_CAMO_ID);
  if (!item) return null;
  return { id: item.id, price: item.price, listPrice: item.price, discount: 0 };
}

export function bannerModel(snapshot) {
  if (!snapshot?.banner || !snapshot.live) return null;
  if (snapshot.live.id !== 'neon-strike' && snapshot.live.id !== 'supply-frenzy') return null;
  return {
    id: snapshot.live.id,
    endsAt: snapshot.live.endsAt,
    bannerImg: snapshot.live.bannerImg,
    titleKey: snapshot.live.id === 'neon-strike' ? 'event.neon.title' : 'event.supply.title',
    noteKey: snapshot.live.id === 'neon-strike' ? 'event.neon.note' : 'event.supply.note',
  };
}
