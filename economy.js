// Economy service: accounts, XP, credits, inventory and purchases (Stage A).
// The server is the only place balances change; clients only send requests.
// Earn caps cover match rewards, dailies, streak and level-up grants. Staff grants and chest
// credits are outside that list. A price increase charges the next purchase only; owned items stay owned.
// Storage: a JSON file written atomically (temp file + rename). On hosts whose disk is wiped on every
// restart (free cloud plans), set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN and accounts are
// also kept in an Upstash Redis database (free tier, plain HTTPS), loaded at start and saved on change.
import fs from 'node:fs';
import path from 'node:path';
import { SHOP, SLOTS, ECONOMY, itemById, isListed, rotationAt, utcDayIndex, utcWeekIndex } from './shared/shop.js';

const MAX_GRANT = 10000;

// Optional remote copy in Upstash Redis (REST API). Returns null when not configured.
function redisStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const KEY = env.ACCOUNTS_KEY || 'arena-rush:accounts';
  const call = async (body) => {
    const r = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('Upstash ' + r.status);
    return (await r.json()).result;
  };
  return {
    load: async () => { const v = await call(['GET', KEY]); return v ? JSON.parse(v) : null; },
    save: (data) => call(['SET', KEY, JSON.stringify(data)]),
  };
}

export function createEconomy({ dataDir, remote = redisStore() }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'accounts.json');
  let accounts = {};
  try { accounts = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  // With a remote store, its copy wins (the local disk may have been wiped by a redeploy)
  const ready = remote
    ? remote.load().then((data) => { if (data) accounts = data; console.log('Accounts loaded from Upstash:', Object.keys(accounts).length); })
      .catch((e) => console.error('Upstash load failed, using local file:', e.message))
    : Promise.resolve();

  let saveTimer = null, remoteBusy = false, remoteAgain = false;
  async function pushRemote() {
    if (!remote) return;
    if (remoteBusy) { remoteAgain = true; return; } // one write at a time, the latest state wins
    remoteBusy = true;
    try { await remote.save(accounts); } catch (e) { console.error('Upstash save failed:', e.message); }
    remoteBusy = false;
    if (remoteAgain) { remoteAgain = false; pushRemote(); }
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(accounts));
    fs.renameSync(tmp, file); // atomic replace: a crash never leaves a half-written file
    pushRemote();
  }
  const saveSoon = () => { if (!saveTimer) saveTimer = setTimeout(saveNow, 300); };

  // Signed-in players are keyed by verified email; guests by a random device token they keep
  function accountId(sess) {
    if (sess.user?.email) return 'g:' + sess.user.email;
    if (typeof sess.guestToken === 'string' && /^[0-9a-f-]{36}$/.test(sess.guestToken)) return 'd:' + sess.guestToken;
    return null;
  }

  function get(id) {
    if (!id) return null;
    if (!accounts[id]) {
      accounts[id] = { credits: ECONOMY.startCredits, xp: 0, level: 1, owned: [], equipped: {}, purchases: [], created: Date.now() };
      saveSoon();
    }
    return accounts[id];
  }

  // Reset the daily/weekly earn buckets when the UTC day or week changes. Does not pay anything
  // and does not touch the login streak: a missed day is not a debit and does not wipe progress.
  function rollover(acc, now) {
    const day = utcDayIndex(now);
    const week = utcWeekIndex(now);
    if (!acc.earn) {
      acc.earn = {
        day, week, dayEarned: 0, weekEarned: 0, levelGrants: 0, kills: 0, won: false,
        dailyPaid: {}, weeklyPaid: false, streakDay: 0, streakPaidDay: null,
      };
      return { earn: acc.earn, changed: true };
    }
    const e = acc.earn;
    if (!e.dailyPaid || typeof e.dailyPaid !== 'object') e.dailyPaid = {};
    let changed = false;
    if (e.day !== day) {
      e.day = day;
      e.dayEarned = 0;
      e.levelGrants = 0;
      e.kills = 0;
      e.won = false;
      e.dailyPaid = {};
      changed = true;
    }
    if (e.week !== week) {
      e.week = week;
      e.weekEarned = 0;
      e.weeklyPaid = false;
      changed = true;
    }
    return { earn: e, changed };
  }

  // Fixed sources are paid before match credits, so a large match is what the cap cuts first.
  // A payout that does not fit is cut (not saved for later). Level-up still consumes a daily grant.
  function creditCapped(acc, amount, now, opts = {}) {
    const e = rollover(acc, now).earn;
    const raw = Math.max(0, Math.trunc(amount) || 0);
    if (opts.levelGrant) {
      if ((e.levelGrants | 0) >= ECONOMY.levelUp.maxPerDay) return 0;
      e.levelGrants = (e.levelGrants | 0) + 1;
    }
    const room = Math.max(0, Math.min(ECONOMY.dailyCap - (e.dayEarned | 0), ECONOMY.weeklyCap - (e.weekEarned | 0)));
    const granted = Math.min(raw, room);
    if (granted > 0) {
      acc.credits += granted;
      e.dayEarned = (e.dayEarned | 0) + granted;
      e.weekEarned = (e.weekEarned | 0) + granted;
    }
    return granted;
  }

  function payDailies(acc, { kills, won }, now) {
    const e = rollover(acc, now).earn;
    e.kills = (e.kills | 0) + kills;
    if (won) e.won = true;
    let granted = 0, raw = 0;
    for (const spec of ECONOMY.dailies) {
      if (e.dailyPaid[spec.id]) continue;
      const met = spec.id === 'play' || (spec.id === 'kills' && e.kills >= 1) || (spec.id === 'win' && e.won);
      if (!met) continue;
      e.dailyPaid[spec.id] = true;
      raw += spec.credits;
      granted += creditCapped(acc, spec.credits, now);
    }
    return { granted, raw };
  }

  function payStreak(acc, now) {
    const e = rollover(acc, now).earn;
    if (e.streakPaidDay === e.day) return { granted: 0, raw: 0 };
    const next = ((e.streakDay | 0) % ECONOMY.streak.cycle) + 1;
    const raw = next === ECONOMY.streak.cycle ? ECONOMY.streak.day7 : ECONOMY.streak.daily;
    e.streakDay = next;
    e.streakPaidDay = e.day;
    return { granted: creditCapped(acc, raw, now), raw };
  }

  function payWeekly(acc, now) {
    const e = rollover(acc, now).earn;
    if (e.weeklyPaid) return { granted: 0, raw: 0 };
    e.weeklyPaid = true;
    return { granted: creditCapped(acc, ECONOMY.weekly.credits, now), raw: ECONOMY.weekly.credits };
  }

  function payLevelGrants(acc, levels, now) {
    let granted = 0, raw = 0;
    for (let i = 0; i < levels; i++) {
      raw += ECONOMY.levelUp.credits;
      granted += creditCapped(acc, ECONOMY.levelUp.credits, now, { levelGrant: true });
    }
    return { granted, raw };
  }

  const profile = (acc, now = Date.now()) => {
    if (!acc) return null;
    const { earn: e, changed } = rollover(acc, now);
    if (changed) saveSoon();
    const rot = rotationAt(now);
    return {
      credits: acc.credits, xp: acc.xp, level: acc.level, need: ECONOMY.levelXp(acc.level),
      owned: acc.owned, equipped: acc.equipped,
      name: acc.name || null, stats: { kills: 0, deaths: 0, heads: 0, wins: 0, matches: 0, ...(acc.stats || {}) },
      caps: {
        dayEarned: e.dayEarned | 0,
        dailyCap: ECONOMY.dailyCap,
        weekEarned: e.weekEarned | 0,
        weeklyCap: ECONOMY.weeklyCap,
        levelGrants: e.levelGrants | 0,
        levelGrantMax: ECONOMY.levelUp.maxPerDay,
      },
      board: {
        dailies: ECONOMY.dailies.map((d) => ({ id: d.id, credits: d.credits, done: !!e.dailyPaid[d.id] })),
        weekly: { id: ECONOMY.weekly.id, credits: ECONOMY.weekly.credits, done: !!e.weeklyPaid },
        streak: { day: e.streakDay | 0, cycle: ECONOMY.streak.cycle, paidToday: e.streakPaidDay === e.day },
      },
      rotation: { daily: rot.daily.map((item) => item.id), featured: rot.featured.id },
    };
  };

  // Cosmetics that other players see (validated: only owned items)
  function cosmetics(acc) {
    const out = {};
    for (const slot of SLOTS) if (acc?.equipped?.[slot] && acc.owned.includes(acc.equipped[slot])) out[slot] = acc.equipped[slot];
    return out;
  }

  function addXp(acc, xp) {
    acc.xp += xp;
    let gained = 0;
    while (acc.xp >= ECONOMY.levelXp(acc.level)) { acc.xp -= ECONOMY.levelXp(acc.level); acc.level++; gained++; }
    return gained;
  }

  // Match rewards, from the server's own match results. `now` is injected by tests.
  function award(id, input = {}) {
    const acc = get(id);
    if (!acc) return null;
    const now = Number.isFinite(input.now) ? input.now : Date.now();
    const kills = Math.max(0, input.kills | 0);
    const deaths = Math.max(0, input.deaths | 0);
    const heads = Math.max(0, input.heads | 0);
    const won = !!input.won;
    if (typeof input.name === 'string' && input.name.trim()) acc.name = input.name.trim().slice(0, 24);
    const st = acc.stats = { kills: 0, deaths: 0, heads: 0, wins: 0, matches: 0, ...(acc.stats || {}) };
    st.kills += kills; st.deaths += deaths; st.heads += heads; st.matches++; if (won) st.wins++;
    st.lastPlayed = now;
    const daily = payDailies(acc, { kills, won }, now);
    const streak = payStreak(acc, now);
    const weekly = payWeekly(acc, now);
    const xp = kills * ECONOMY.xp.kill + heads * ECONOMY.xp.headshot + (won ? ECONOMY.xp.win : ECONOMY.xp.played);
    const levels = addXp(acc, xp);
    const level = payLevelGrants(acc, levels, now);
    const c = ECONOMY.credits;
    const matchRaw = kills * c.kill + heads * c.headshot + (won ? c.win : c.played);
    const match = creditCapped(acc, matchRaw, now);
    const granted = daily.granted + streak.granted + weekly.granted + level.granted + match;
    const raw = daily.raw + streak.raw + weekly.raw + level.raw + matchRaw;
    saveSoon();
    return {
      credits: granted, match, dailyCredits: daily.granted, streakCredits: streak.granted,
      weeklyCredits: weekly.granted, levelCredits: level.granted, levelUps: levels, cut: raw - granted,
      xp, levelUp: levels > 0, level: acc.level,
    };
  }

  // Purchase: validated and applied in one synchronous step, so it cannot interleave with another.
  // purchaseId makes retries safe: the same id is applied once, even after a disconnect.
  // Already-owned items are not charged again when the catalog price goes up.
  function buy(id, itemId, purchaseId, now = Date.now()) {
    const acc = get(id);
    if (!acc) return { ok: false, key: 'shop.needAccount' };
    if (typeof purchaseId !== 'string' || purchaseId.length < 8 || purchaseId.length > 64) return { ok: false, key: 'shop.error' };
    if (acc.purchases.includes(purchaseId)) return { ok: true, repeat: true };
    const item = itemById(itemId);
    if (!item) return { ok: false, key: 'shop.error' };
    if (acc.owned.includes(item.id)) return { ok: false, key: 'shop.owned' };
    if (!isListed(item.id, now)) return { ok: false, key: 'shop.notInRotation' };
    const price = item.price;
    if (!Number.isInteger(price) || price < 1) return { ok: false, key: 'shop.error' };
    if (acc.credits < price) return { ok: false, key: 'shop.noCredits' };
    acc.credits -= price;
    acc.owned.push(item.id);
    acc.purchases = [...acc.purchases, purchaseId].slice(-100);
    saveNow(); // purchases are written immediately
    return { ok: true, item: item.id, price };
  }

  function equip(id, slot, itemId) {
    const acc = get(id);
    if (!acc || !SLOTS.includes(slot)) return { ok: false, key: 'shop.error' };
    if (itemId === null || itemId === '') { delete acc.equipped[slot]; saveSoon(); return { ok: true }; }
    const item = itemById(itemId);
    if (!item || item.slot !== slot || !acc.owned.includes(item.id)) return { ok: false, key: 'shop.error' };
    acc.equipped[slot] = item.id;
    saveSoon();
    return { ok: true };
  }

  // Admin grant (Owner only; checked by admin.js). Not part of the player earn caps.
  function grant(id, amount) {
    const acc = get(id);
    if (!acc || !Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) return false;
    acc.credits += amount;
    saveNow();
    return true;
  }

  function setName(id, name) { const acc = get(id); if (acc && typeof name === 'string' && name.trim()) { acc.name = name.trim().slice(0, 24); saveSoon(); } }
  function loot(id, { credits, xp }) {
    const acc = get(id);
    if (!acc || ![credits, xp].every((n) => Number.isInteger(n) && n >= 0 && n <= 100)) return false;
    acc.credits += credits; // chest credits are not in the Stage A earn-cap list
    const levels = addXp(acc, xp);
    payLevelGrants(acc, levels, Date.now());
    saveNow();
    return true;
  }
  return { accountId, get, profile, cosmetics, award, setName, buy, equip, grant, loot, catalog: SHOP, flush: saveNow, ready, storage: remote ? 'upstash' : 'file' };
}
