// Economy service: accounts, XP, credits, inventory and purchases (PROJECT_PLAN stage E).
// The server is the only place balances change; clients only send requests.
// Storage layers (all free tier):
//  1. Firebase Cloud Firestore (primary durable copy): one document per player under FIRESTORE_PREFIX in
//     FIRESTORE_PROJECT, plain HTTPS REST. Survives Render Free sleep/redeploy (whose disk is wiped).
//  2. Render server: in memory + a JSON file written atomically (temp file + rename).
//  3. Optional Upstash Redis REST copy (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
// On start the remote copies are loaded and merged (the newest `updated` per player wins).
import fs from 'node:fs';
import path from 'node:path';
import { SHOP, SLOTS, ECONOMY, itemById } from './shared/shop.js';

const MAX_GRANT = 10000;

// Optional remote copy in Upstash Redis (REST API). Returns null when not configured.
function redisStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL, token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const KEY = env.ACCOUNTS_KEY || 'drop-havoc:accounts';
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

// Firestore REST store: dropHavoc/<server path>/players/{accountId} with the account JSON in `data`.
export function firestoreStore(env = process.env, fetchFn = fetch) {
  const project = env.FIRESTORE_PROJECT, prefix = env.FIRESTORE_PREFIX;
  if (!project || !prefix) return null;
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${prefix.replace(/^\/|\/$/g, '')}`;
  const sent = new Map(); // id -> JSON last written, so only changed players are written
  const docUrl = (id) => `${base}/players/${encodeURIComponent(id)}`;
  async function load() {
    const out = {};
    let token = '';
    do {
      const r = await fetchFn(`${base}/players?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
      if (!r.ok) throw new Error('Firestore ' + r.status);
      const j = await r.json();
      for (const d of j.documents || []) {
        const id = decodeURIComponent(d.name.split('/players/')[1] || '');
        const raw = d.fields?.data?.stringValue;
        if (id && raw) { try { out[id] = JSON.parse(raw); sent.set(id, raw); } catch { /* skip bad doc */ } }
      }
      token = j.nextPageToken || '';
    } while (token);
    return out;
  }
  async function save(data) {
    for (const [id, acc] of Object.entries(data)) {
      const raw = JSON.stringify(acc);
      if (sent.get(id) === raw) continue;
      const fields = { data: { stringValue: raw }, level: { integerValue: String(acc.level | 0) }, credits: { integerValue: String(acc.credits | 0) },
        name: { stringValue: String(acc.name || '') }, updated: { integerValue: String(acc.updated || Date.now()) } };
      const r = await fetchFn(docUrl(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
      if (!r.ok) throw new Error('Firestore ' + r.status);
      sent.set(id, raw);
    }
  }
  // Daily snapshot of every account (backup layer inside Firebase)
  async function snapshot(data) {
    const day = new Date().toISOString().slice(0, 10);
    const r = await fetchFn(`${base}/backups/${day}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(data) }, at: { integerValue: String(Date.now()) } } }) });
    if (!r.ok) throw new Error('Firestore ' + r.status);
  }
  return { name: 'firestore', load, save, snapshot };
}

const newer = (a, b) => (!a ? b : !b ? a : (b.updated || 0) > (a.updated || 0) ? b : a);

export function createEconomy({ dataDir, remotes = [firestoreStore(), redisStore()].filter(Boolean), remote }) {
  if (remote !== undefined) remotes = remote ? [remote] : [];
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'accounts.json');
  let accounts = {};
  try { accounts = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  // With a remote store, its copy wins (the local disk may have been wiped by a redeploy)
  const ready = Promise.all(remotes.map((r) => r.load().then((data) => {
    if (!data) return;
    for (const [id, acc] of Object.entries(data)) accounts[id] = newer(accounts[id], acc);
    console.log(`Accounts loaded from ${r.name || 'upstash'}:`, Object.keys(data).length);
  }).catch((e) => console.error(`${r.name || 'upstash'} load failed, using other copies:`, e.message))));
  ready.then(() => { if (remotes.length) pushRemote(); });

  let saveTimer = null, remoteBusy = false, remoteAgain = false, lastSnap = '';
  async function pushRemote() {
    if (!remotes.length) return;
    if (remoteBusy) { remoteAgain = true; return; } // one write at a time, the latest state wins
    remoteBusy = true;
    for (const r of remotes) {
      try { await r.save(accounts); } catch (e) { console.error(`${r.name || 'upstash'} save failed:`, e.message); }
      const day = new Date().toISOString().slice(0, 10);
      if (r.snapshot && lastSnap !== day) { try { await r.snapshot(accounts); lastSnap = day; } catch (e) { console.error('snapshot failed:', e.message); } }
    }
    remoteBusy = false;
    if (remoteAgain) { remoteAgain = false; pushRemote(); }
  }
  function saveNow() {
    clearTimeout(saveTimer);
    for (const acc of touched) acc.updated = Date.now();
    touched.clear();
    saveTimer = null;
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(accounts));
    fs.renameSync(tmp, file); // atomic replace: a crash never leaves a half-written file
    pushRemote();
  }
  const touched = new Set();
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
    touched.add(accounts[id]);
    return accounts[id];
  }

  const profile = (acc) => acc && {
    prefs: acc.prefs || {}, purchases: (acc.purchases || []).length, updated: acc.updated || null,
    credits: acc.credits, xp: acc.xp, level: acc.level, need: ECONOMY.levelXp(acc.level),
    owned: acc.owned, equipped: acc.equipped,
    name: acc.name || null, stats: { kills: 0, deaths: 0, heads: 0, wins: 0, matches: 0, ...(acc.stats || {}) },
  };

  // Cosmetics that other players see (validated: only owned items)
  function cosmetics(acc) {
    const out = {};
    for (const slot of SLOTS) if (acc?.equipped?.[slot] && acc.owned.includes(acc.equipped[slot])) out[slot] = acc.equipped[slot];
    return out;
  }

  function addXp(acc, xp) {
    acc.xp += xp;
    let levelUp = false;
    while (acc.xp >= ECONOMY.levelXp(acc.level)) { acc.xp -= ECONOMY.levelXp(acc.level); acc.level++; levelUp = true; }
    return levelUp;
  }

  // Match rewards, from the server's own match results
  function award(id, { kills = 0, deaths = 0, heads = 0, won = false, name }) {
    const acc = get(id);
    if (!acc) return null;
    // Persistent achievements + the username the player last played with
    if (typeof name === 'string' && name.trim()) acc.name = name.trim().slice(0, 24);
    const st = acc.stats = { kills: 0, deaths: 0, heads: 0, wins: 0, matches: 0, ...(acc.stats || {}) };
    st.kills += kills | 0; st.deaths += deaths | 0; st.heads += heads | 0; st.matches++; if (won) st.wins++;
    st.lastPlayed = Date.now();
    const c = ECONOMY.credits, x = ECONOMY.xp;
    const credits = kills * c.kill + heads * c.headshot + (won ? c.win : c.played);
    const xp = kills * x.kill + heads * x.headshot + (won ? x.win : x.played);
    acc.credits += credits;
    const levelUp = addXp(acc, xp);
    saveSoon();
    return { credits, xp, levelUp, level: acc.level };
  }

  // Purchase: validated and applied in one synchronous step, so it cannot interleave with another.
  // purchaseId makes retries safe: the same id is applied once, even after a disconnect.
  function buy(id, itemId, purchaseId) {
    const acc = get(id);
    if (!acc) return { ok: false, key: 'shop.needAccount' };
    if (typeof purchaseId !== 'string' || purchaseId.length < 8 || purchaseId.length > 64) return { ok: false, key: 'shop.error' };
    if (acc.purchases.includes(purchaseId)) return { ok: true, repeat: true };
    const item = itemById(itemId);
    if (!item) return { ok: false, key: 'shop.error' };
    if (acc.owned.includes(item.id)) return { ok: false, key: 'shop.owned' };
    if (acc.credits < item.price) return { ok: false, key: 'shop.noCredits' };
    acc.credits -= item.price;
    acc.owned.push(item.id);
    acc.purchases = [...acc.purchases, purchaseId].slice(-100);
    saveNow(); // purchases are written immediately
    return { ok: true, item: item.id };
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

  // Admin grant (Owner only; checked by admin.js) — goes through the same service as everything else
  function grant(id, amount) {
    const acc = get(id);
    if (!acc || !Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) return false;
    acc.credits += amount;
    saveNow();
    return true;
  }

  function setName(id, name) { const acc = get(id); if (acc && typeof name === 'string' && name.trim()) { acc.name = name.trim().slice(0, 24); saveSoon(); } }
  function loot(id,{credits,xp}){
    const acc=get(id);if(!acc||![credits,xp].every(n=>Number.isInteger(n)&&n>=0&&n<=100))return false;
    acc.credits+=credits;addXp(acc,xp);saveNow();return true;
  }
  // Training vs bots runs in the browser; its results are reported here and paid with the same rules,
  // but capped and rate-limited because the client simulated the match.
  const lastPractice = new Map();
  function practice(id, r = {}, now = Date.now()) {
    if (!id) return null;
    if (now - (lastPractice.get(id) || 0) < 45000) return { ok: false, key: 'practice.tooSoon' };
    lastPractice.set(id, now);
    const kills = Math.max(0, Math.min(15, r.kills | 0)), heads = Math.max(0, Math.min(kills, r.heads | 0)), deaths = Math.max(0, Math.min(30, r.deaths | 0));
    const acc = get(id);
    if (typeof r.map === 'string' || typeof r.mode === 'string') setPrefs(id, r);
    const reward = award(id, { kills, heads, deaths, won: !!r.won, name: r.name });
    acc.stats.practice = (acc.stats.practice | 0) + 1;
    return { ok: true, reward };
  }
  function setPrefs(id, { map, mode } = {}) {
    const acc = get(id); if (!acc) return;
    acc.prefs = { ...(acc.prefs || {}), ...(typeof map === 'string' ? { map: map.slice(0, 32) } : {}), ...(typeof mode === 'string' ? { mode: mode.slice(0, 16) } : {}) };
    saveSoon();
  }
  // Full save of one player (downloadable backup)
  const backup = (id) => { const acc = id && accounts[id]; return acc ? { game: 'Drop Havoc', account: id, at: new Date().toISOString(), data: acc } : null; };
  const storage = ['file', ...remotes.map((r) => r.name || 'upstash')].join('+');
  return { accountId, get, profile, cosmetics, award, practice, setPrefs, backup, setName, buy, equip, grant, loot, catalog: SHOP, flush: saveNow, ready, storage };
}
