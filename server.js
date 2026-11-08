// Drop Havoc game server: static files + WebSocket transport around shared/game.js.
import { verifyFirebaseToken } from './firebase-auth.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, MODES } from './shared/game.js';
import { MAP_IDS } from './shared/map.js';
import { cleanName } from './shared/chatfilter.js';
import { createAdmin } from './admin.js';
import { createEconomy } from './economy.js';
import {GAME_PROTOCOL} from './shared/protocol.js';
import {PLAYER_LIMIT} from './shared/limits.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const BOTS = process.env.BOTS !== undefined ? Number(process.env.BOTS) : 3; // 0.16.42: online bots — small fixed count, set BOTS=0 on Render to remove
// Google sign-in: create an OAuth "Web client ID" in Google Cloud Console and pass it here.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// Firebase web config for the admin page's Google sign-in (public values, from the Firebase console)
const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || process.env.FIRESTORE_PROJECT || 'scitedra-games';
const FIREBASE_WEB = process.env.FIREBASE_API_KEY ? { apiKey: process.env.FIREBASE_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${process.env.FIREBASE_PROJECT || process.env.FIRESTORE_PROJECT || 'scitedra-games'}.firebaseapp.com`, projectId: process.env.FIREBASE_PROJECT || process.env.FIRESTORE_PROJECT || 'scitedra-games' } : null;
if (FIREBASE_WEB && process.env.FIREBASE_APP_ID) FIREBASE_WEB.appId = process.env.FIREBASE_APP_ID;
const ROOM_SIZE = PLAYER_LIMIT;

// ---------- static files ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.hdr': 'application/octet-stream', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/rooms') {
    res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});
    // 0.16.44: the room browser also shows who is inside (display names only) and how many bots
    res.end(JSON.stringify([...rooms.values()].filter(r=>r.isPublic).map(r=>{const all=r.game.admin.players();return {code:r.code,mode:r.mode,players:r.members.size,capacity:r.capacity,map:r.map,locked:!!r.pass,names:all.filter(p=>!p.bot).map(p=>String(p.name).slice(0,24)).slice(0,15),bots:all.filter(p=>p.bot).length};})));return;
  }
  if (url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (url === '/league') { // national league table for this month (public: names and points only)
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ season: economy.seasonOf(Date.now()), top: economy.leagueTable(Date.now(), 50) })); return;
  }
  if (url === '/storage') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ storage: economy.storage })); return; }
  if (url === '/config') {
    // Readable from other servers' start screens, so players can compare servers
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ protocol:GAME_PROTOCOL, maxPlayers:PLAYER_LIMIT, googleClientId: GOOGLE_CLIENT_ID, firebase: FIREBASE_WEB, online: [...rooms.values()].reduce((n,r)=>n+r.members.size,0), rooms: rooms.size }));
    return;
  }
  let base = path.join(ROOT, 'public'), rel = url === '/' ? 'index.html' : url;
  if (url.startsWith('/shared/')) base = ROOT;
  if (url === '/vendor/peerjs.min.js') { base = path.join(ROOT, 'node_modules', 'peerjs', 'dist'); rel = 'peerjs.min.js'; }
  else if (url.startsWith('/vendor/addons/')) { base = path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm'); rel = url.slice('/vendor/addons/'.length); }
  else if (url.startsWith('/vendor/')) { base = path.join(ROOT, 'node_modules', 'three', 'build'); rel = url.slice('/vendor/'.length); }
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- accounts ----------
// Verifies a Google ID token with Google and returns the verified profile.
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID || typeof credential !== 'string' || credential.length > 4096) return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    if (!r.ok) return null;
    const t = await r.json();
    const fresh = Number(t.exp) * 1000 > Date.now();
    if (t.aud !== GOOGLE_CLIENT_ID || t.email_verified !== 'true' || !fresh) return null;
    return { email: t.email.toLowerCase(), name: cleanName(t.given_name || t.name || t.email.split('@')[0]), picture: t.picture || '' };
  } catch {
    return null;
  }
}

// ---------- rooms & matchmaking ----------
const rooms = new Map();     // code -> { code, isPublic, game, members:Set<session> }
const sessions = new Set();  // every connected socket's session
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// 0.16.42: per-room map + optional entry code (pass). Old clients (no `maps` flag) only ever see city rooms.
const cleanMap = (m) => MAP_IDS.includes(m) ? m : 'city';
const cleanPass = (p) => String(p || '').trim().slice(0, 12);
function newRoom(isPublic, mode = 'ffa', capacity=ROOM_SIZE, map = 'city', pass = '') {
  if (rooms.size >= MAX_ROOMS) { // too many rooms: send newcomers to the busiest room that still has space instead
    let best = null; for (const r of rooms.values()) if (r.isPublic && !r.pass && r.members.size < r.capacity && (!best || r.members.size > best.members.size)) best = r;
    if (best) return best;
  }
  if (mode === 'roam') map = 'city'; // free roam is the city (cars, civilians, the whole street)
  map = cleanMap(map); pass = cleanPass(pass);
  let code;
  do code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  while (rooms.has(code));
  const game = createGame({ map, capacity,bots: BOTS, difficulty: process.env.BOT_DIFFICULTY || 'easy', /* 0.16.42: online bots flow with players */ mode: MODES[mode] ? mode : 'ffa', onMatchEnd: (results) => payRewards(results, room), onLoot: (player,loot) => {const sess=[...sessions].find(s=>s.conn?.player()===player);if(sess){economy.loot(economy.accountId(sess),loot);sendProfile(sess);}}  });
  const room = { code, map, pass, isPublic, capacity:game.config.capacity,mode: game.mode, game, members: new Set() };
  room.game.start();
  rooms.set(code, room);
  return room;
}

// Quick match: the fullest public room that still has space, so players meet each other
function quickRoom(map = 'city') {
  let best = null;
  for (const r of rooms.values()) if (r.isPublic && r.mode === 'ffa' && r.map === map && !r.pass && r.members.size < r.capacity && (!best || r.members.size > best.members.size)) best = r;
  return best || newRoom(true, 'ffa', ROOM_SIZE, map);
}

// 0.16.44 limits: whole-server player cap and a cap on live rooms (each runs its own 30 Hz match)
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 12;
const onlineCount = () => [...rooms.values()].reduce((n, r) => n + r.members.size, 0);
function enterRoom(sess, room) {
  if (sess.room || room.members.size >= room.capacity) return false;
  if (onlineCount() >= PLAYER_LIMIT) { sess.send({ t: 'lobbyError', key: 'rooms.serverFull' }); return false; }
  sess.room = room;
  room.members.add(sess);
  sess.conn = room.game.connect(sess.ws);
  sess.send({ t: 'room', code: room.code, map: room.map, locked: !!room.pass, isPublic: room.isPublic, capacity:room.capacity,mode: room.mode });
  return true;
}

function leaveRoom(sess) {
  const room = sess.room;
  if (!room) return;
  sess.conn?.close();
  room.members.delete(sess);
  sess.room = sess.conn = null;
  if (room.members.size === 0) { room.game.stop(); rooms.delete(room.code); }
}

const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const economy = createEconomy({ dataDir: DATA_DIR });
const admin = createAdmin({ dataDir: DATA_DIR, rooms, sessions, economy });

// Match rewards come from the server's own results, never from the client
function payRewards(results, room) {
  // National league: only public, open rooms with at least 2 real players count (no private farming with bots)
  const league = !!room && room.isPublic && !room.pass && results.length >= 2;
  for (const r of results) {
    const sess = [...sessions].find((s) => s.conn?.player() === r.player);
    const id = sess && economy.accountId(sess);
    if (!id) continue;
    const reward = economy.award(id, r, { league, humans: results.length });
    sess.send({ t: 'reward', reward, profile: economy.profile(economy.get(id)) });
  }
}
// Reconnect: a player who drops keeps their room seat and score for 30 seconds
const RECONNECT_MS = 30000;
const pendingRejoin = new Map(); // account id -> { code, until, stats }
function rememberSeat(sess) {
  const id = economy.accountId(sess), p = sess.conn?.player();
  if (!id || !p || !sess.room) return;
  pendingRejoin.set(id, { code: sess.room.code, until: Date.now() + RECONNECT_MS, stats: { kills: p.kills, deaths: p.deaths, heads: p.heads, team: p.team } });
}
const sendProfile = (sess) => { const id = economy.accountId(sess); if (id) sess.send({ t: 'profile', profile: economy.profile(economy.get(id)) }); };

// ---------- networking ----------
const wss = new WebSocketServer({ server, maxPayload: 8 * 1024 });
// 0.16.44 flood protection: connections per IP, messages per socket (token bucket), and a few per-type limits
const IP_CONN_LIMIT = Number(process.env.IP_CONN_LIMIT) || 6;
const connsByIp = new Map(), newGuests = new Map();
const RATE = { perSec: 60, burst: 120 };
const TYPE_GAP_MS = { mapPing: 800, report: 10000, auth: 2000, league: 3000, invite: 3000, practiceResult: 5000, quickMatch: 1000, quickRoam: 1000, create: 2000, joinCode: 1000 };
wss.on('connection', (ws, req) => {
  const ip = (process.env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress;
  const nIp = (connsByIp.get(ip) || 0) + 1;
  if (nIp > IP_CONN_LIMIT) { ws.close(1013, 'Too many connections'); return; }
  connsByIp.set(ip, nIp);
  ws.once('close', () => { const n = (connsByIp.get(ip) || 1) - 1; if (n > 0) connsByIp.set(ip, n); else connsByIp.delete(ip); });
  let tokens = RATE.burst, lastRefill = Date.now(); const lastByType = new Map();
  const sess = { sid: Math.random().toString(36).slice(2, 10), ws, ip, user: null, role: 'Player', room: null, conn: null, invites: [], send: (m) => ws.readyState === 1 && ws.send(JSON.stringify(m)) };
  sessions.add(sess);
  const refuseIfBanned = () => {
    const ban = admin.activeBan(sess);
    if (!ban) return false;
    sess.send({ t: 'kicked', key: 'admin.banned', p: { reason: ban.reason } });
    setTimeout(() => ws.close(), 100);
    return true;
  };
  if (refuseIfBanned()) return;

  ws.on('message', async (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    { const now = Date.now(); tokens = Math.min(RATE.burst, tokens + (now - lastRefill) / 1000 * RATE.perSec); lastRefill = now;
      if (--tokens < 0) { ws.close(1008, 'Too many messages'); return; } // flooding: drop the connection
      const gap = TYPE_GAP_MS[m.t]; if (gap) { if (now - (lastByType.get(m.t) || 0) < gap) return; lastByType.set(m.t, now); } }
    if(m.t!=='auth'&&sess.protocol!==GAME_PROTOCOL){sess.send({t:'lobbyError',key:'rooms.version'});return;}
    if(['quickMatch','quickRoam','create','joinCode','rejoin','join'].includes(m.t)&&!sess.room&&onlineCount()>=PLAYER_LIMIT){
      sess.send({t:'lobbyError',key:'rooms.serverFull'});return;
    }

    // Lobby messages; everything else goes to the room's match
    switch (m.t) {
      case 'auth': {
        if(m.protocol!==GAME_PROTOCOL){sess.send({t:'lobbyError',key:'rooms.version'});ws.close(1008,'Incompatible game version');return;}
        sess.protocol=GAME_PROTOCOL;
        // Google sign-in: a Google Identity credential, or (0.16.44) a Firebase ID token marked 'fb:' (web and Android app)
        sess.user = !m.credential ? null : String(m.credential).startsWith('fb:') ? await verifyFirebaseToken(String(m.credential).slice(3), FIREBASE_PROJECT) : await verifyGoogle(m.credential);
        sess.guestToken = typeof m.guestToken === 'string' ? m.guestToken.slice(0, 64) : null;
        // At most 10 new guest accounts per IP per hour (each one is stored for good)
        if (!sess.user && sess.guestToken) { const id = economy.accountId(sess); if (id && !economy.has(id)) {
          const now = Date.now(), list = (newGuests.get(ip) || []).filter((t) => now - t < 3600000);
          if (list.length >= 10) sess.guestToken = null; else { list.push(now); newGuests.set(ip, list); } } }
        if (refuseIfBanned()) return;
        admin.onAuth(sess);
        sess.send({ t: 'authed', user: sess.user && { name: sess.user.name, picture: sess.user.picture, email: sess.user.email }, googleClientId: GOOGLE_CLIENT_ID });
        sendProfile(sess);
        return;
      }
      // ---- shop (economy service decides; the client only asks) ----
      case 'profile': sendProfile(sess); return;
      case 'league': { // the table plus where you stand
        const id = economy.accountId(sess);
        sess.send({ t: 'league', season: economy.seasonOf(Date.now()), top: economy.leagueTable(Date.now(), 50), me: id && id.startsWith('g:') ? economy.leagueRank(id) : null, signedIn: !!sess.user });
        return;
      }
      // Training vs bots (simulated in the browser): pay it to the same account so online + training share progress
      case 'practiceResult': {
        const id = economy.accountId(sess);
        const res = economy.practice(id, { kills: m.kills, deaths: m.deaths, heads: m.heads, won: m.won, name: m.name, map: m.map, mode: m.mode });
        sess.send({ t: 'practiceSaved', ok: !!res?.ok, key: res?.key, reward: res?.reward, rid: m.rid });
        sendProfile(sess);
        return;
      }
      case 'backup': { const b = economy.backup(economy.accountId(sess)); sess.send({ t: 'backup', backup: b }); return; }
      case 'buy': {
        const id = economy.accountId(sess);
        const res = economy.buy(id, String(m.item || ''), m.purchaseId);
        if (!res.ok) sess.send({ t: 'shopError', key: res.key });
        sendProfile(sess);
        return;
      }
      case 'equip': {
        const id = economy.accountId(sess);
        const res = economy.equip(id, String(m.slot || ''), m.item === null ? null : String(m.item || ''));
        if (!res.ok) sess.send({ t: 'shopError', key: res.key });
        sendProfile(sess);
        return;
      }
      case 'quickMatch': enterRoom(sess, quickRoom(m.maps ? cleanMap(m.map) : 'city')); return; // not 'quick': that is quick chat inside a room
      case 'quickRoam': { // free roam: join the busiest open free-roam city, or open a new public one
        let best = null;
        for (const r of rooms.values()) if (r.isPublic && r.mode === 'roam' && !r.pass && r.members.size < r.capacity && (!best || r.members.size > best.members.size)) best = r;
        if (!sess.room) enterRoom(sess, best || newRoom(true, 'roam', ROOM_SIZE, 'city', ''));
        return;
      }
      case 'create': if(!sess.room)enterRoom(sess, newRoom(m.public === true, String(m.mode || 'ffa'),m.capacity, m.maps ? m.map : 'city', m.maps ? m.pass : '')); return;
      case 'joinCode': {
        const room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) sess.send({ t: 'lobbyError', key: 'sys.roomNotFound' });
        else if (room.map !== 'city' && !m.maps) sess.send({ t: 'lobbyError', key: 'rooms.version' });
        else if (room.pass && cleanPass(m.pass) !== room.pass) sess.send({ t: 'lobbyError', key: 'rooms.needPass' });
        else if (!enterRoom(sess, room)) sess.send({ t: 'lobbyError', key: 'sys.roomFull' });
        return;
      }
      case 'invite': {
        // Find a friend by their Gmail address. Only signed-in players can invite or be found,
        // and the reply never reveals anything about the address beyond online/offline.
        if (!sess.user) { sess.send({ t: 'chat', sys: true, key: 'sys.inviteNeedsLogin' }); return; }
        if (!sess.room) return;
        const email = String(m.email || '').toLowerCase().trim();
        if (sess.invites.filter((t) => Date.now() - t < 60000).length >= 5) { sess.send({ t: 'chat', sys: true, key: 'sys.inviteLimit' }); return; }
        sess.invites.push(Date.now());
        const friend = [...sessions].find((s) => s.user && s.user.email === email && s !== sess);
        if (friend) friend.send({ t: 'invited', from: sess.user.name, code: sess.room.code });
        sess.send(friend ? { t: 'chat', sys: true, key: 'sys.inviteSent' } : { t: 'chat', sys: true, key: 'sys.inviteOffline', p: { code: sess.room.code } });
        return;
      }
      case 'leaveRoom': pendingRejoin.delete(economy.accountId(sess)); leaveRoom(sess); return;
      case 'rejoin': {
        const id = economy.accountId(sess), seat = id && pendingRejoin.get(id);
        const room = seat && seat.until > Date.now() && seat.code === String(m.code || '').toUpperCase() ? rooms.get(seat.code) : null;
        if (!room || !enterRoom(sess, room)) { sess.send({ t: 'lobbyError', key: 'sys.rejoinFailed' }); return; }
        pendingRejoin.delete(id);
        sess.restore = seat.stats; // applied to the join below; never taken from the client
        return;
      }
      case 'admin': admin.handle(sess, m.cmd, m.args); return;
      case 'panel': await admin.panel(sess, m); return; // admin page (public/admin.html): permissions are checked inside // permissions are checked inside, server-side
      case 'join': {
        if (sess.user) m.name = sess.user.name; // signed-in players play under their Google first name
        // Cosmetics and restored stats come only from the server, never from the client message
        const id = economy.accountId(sess);
        m.cosmetics = id ? economy.cosmetics(economy.get(id)) : {};
        if (id && typeof m.name === 'string') economy.setName(id, m.name); // remember the login/display name
        delete m.restore;
        if (sess.restore) { m.restore = sess.restore; sess.restore = null; }
        break;
      }
    }
    if (!sess.room) {
      // Old clients (and offline fallbacks) that skip the lobby go straight to quick match
      if (m.t !== 'join') return;
      enterRoom(sess, quickRoom());
    }
    sess.conn?.message(JSON.stringify(m));
    if (m.t === 'join') { const mu = admin.activeMute(sess), p = sess.conn?.player?.(); if (mu && p) p.mutedUntil = mu.until || Date.now() + 365 * 86400000; } // a muted player stays muted after rejoining
  });

  ws.on('close', () => { rememberSeat(sess); leaveRoom(sess); sessions.delete(sess); });
});

// Accounts (credits, XP, items) must be loaded before players connect
await economy.ready;
server.listen(PORT, () => console.log(`Drop Havoc running on http://localhost:${PORT}` + (GOOGLE_CLIENT_ID ? ' (Google sign-in on)' : ' (guests only: set GOOGLE_CLIENT_ID for Google sign-in)')));
