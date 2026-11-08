// Server-side admin system (PROJECT_PLAN stage D).
// Roles come only from verified identities (Google email) or the operator's secret ADMIN_CODE,
// never from player names or anything the client claims. Every attempt is written to an audit log.
import { PLAYER } from './shared/physics.js';
import fs from 'node:fs';
import path from 'node:path';
import { WEAPONS } from './shared/weapons.js';
import { MAP } from './shared/map.js';
import { filterChat } from './shared/chatfilter.js';
import { verifyFirebaseToken } from './firebase-auth.js';

export const ROLES = ['Player', 'Moderator', 'Admin', 'Owner'];
const rank = (role) => Math.max(0, ROLES.indexOf(role));

// Minimum role and argument rules per command
const COMMANDS = {
  setrole:{role:'Owner',usage:'/setrole <verified-account-email> <Player|Moderator|Admin|Owner>'},
  whoami: { role: 'Player', usage: '/whoami' },
  announce: { role: 'Moderator', usage: '/announce <message>' },
  kick: { role: 'Moderator', usage: '/kick <player> [reason]' },
  heal: { role: 'Admin', usage: '/heal <player> [1-100]' },
  sethealth: { role: 'Admin', usage: '/sethealth <player> <1-200>' },
  giveweapon: { role: 'Admin', usage: `/giveweapon <player> <${Object.keys(WEAPONS).join('|')}>` },
  teleport: { role: 'Admin', usage: '/teleport <player> <spawn 1-12 | player>' },
  ban: { role: 'Admin', usage: '/ban <player> [minutes] <reason>' },
  givemoney: { role: 'Owner', usage: '/givemoney <player> <1-10000>' },
};

export function createAdmin({ dataDir, rooms, sessions, economy }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const auditFile = path.join(dataDir, 'admin-audit.log');
  const bansFile = path.join(dataDir, 'bans.json');

  // admins.json: { "someone@gmail.com": "Admin", ... }  (kept out of git)
  let staff = {};
  try { staff = JSON.parse(fs.readFileSync(path.join(dataDir, 'admins.json'), 'utf8')); } catch { /* none configured */ }
  const ADMIN_CODE = process.env.ADMIN_CODE || '';
  // The game's owners: always full rights when signed in with these Google accounts (plus OWNER_EMAILS)
  const OWNERS = ['kobifrah1991@gmail.com', 'scitedra.labs@gmail.com', ...String(process.env.OWNER_EMAILS || '').split(',')].map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const e of OWNERS) staff[e] = 'Owner';
  const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || process.env.FIRESTORE_PROJECT || 'scitedra-games';

  // Bans and mutes: { id, type: 'ban' | 'mute', email, ip, name, until (0 = forever), reason, by, at }
  let bans = [];
  try { bans = JSON.parse(fs.readFileSync(bansFile, 'utf8')); } catch { /* no bans yet */ }
  bans = bans.map((b) => ({ id: b.id || Math.random().toString(36).slice(2, 10), type: b.type || 'ban', ...b }));
  // Also kept in Firebase Firestore when it is configured, so a server restart (Render wipes its disk) keeps them
  const fsBase = process.env.FIRESTORE_PROJECT && process.env.FIRESTORE_PREFIX
    ? `https://firestore.googleapis.com/v1/projects/${process.env.FIRESTORE_PROJECT}/databases/(default)/documents/${process.env.FIRESTORE_PREFIX.replace(/^\/|\/$/g, '')}/admin/moderation` : null;
  if (fsBase) fetch(fsBase).then((r) => (r.ok ? r.json() : null)).then((j) => {
    const raw = j?.fields?.data?.stringValue; if (!raw) return;
    const remote = JSON.parse(raw); const have = new Set(bans.map((b) => b.id));
    for (const b of remote) if (!have.has(b.id)) bans.push(b);
  }).catch(() => {});
  const saveBans = () => {
    fs.writeFileSync(bansFile, JSON.stringify(bans, null, 2));
    if (fsBase) fetch(fsBase, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { data: { stringValue: JSON.stringify(bans) } } }) }).catch(() => {});
  };
  const live = (b, now = Date.now()) => !b.until || b.until > now;

  function audit(sess, action, target, value, result) {
    const entry = {
      time: new Date().toISOString(),
      admin: sess.user?.email || (sess.codeLogin ? 'admin-code' : 'guest'),
      role: sess.role,
      ip: sess.ip,
      room: sess.room?.code || null,
      action, target: target ?? null, value: value ?? null, result,
    };
    fs.appendFile(auditFile, JSON.stringify(entry) + '\n', () => {});
  }

  const reply = (sess, key, p) => sess.send({ t: 'chat', sys: true, key, p });

  function setRole(sess, role) {
    sess.role = ROLES.includes(role) ? role : 'Player';
    sess.send({ t: 'role', role: sess.role });
  }

  // Called after Google sign-in (or as a guest) to assign the session's role
  function onAuth(sess) {
    setRole(sess, sess.user ? staff[String(sess.user.email).toLowerCase()] || staff[sess.user.email] || 'Player' : 'Player');
  }

  const matches = (b, sess) => (sess.user && b.email && b.email === String(sess.user.email).toLowerCase()) || (b.ip && b.ip === sess.ip) || (b.guest && b.guest === sess.guestToken);
  function activeBan(sess) {
    bans = bans.filter((b) => live(b));
    return bans.find((b) => b.type === 'ban' && matches(b, sess)) || null;
  }
  function activeMute(sess) { return bans.find((b) => b.type === 'mute' && live(b) && matches(b, sess)) || null; }

  // Operator login with the secret ADMIN_CODE (for servers without Google sign-in)
  function codeLogin(sess, code) {
    sess.codeTries = (sess.codeTries || []).filter((t) => Date.now() - t < 60000);
    if (!ADMIN_CODE || sess.codeTries.length >= 3 || String(code) !== ADMIN_CODE) {
      sess.codeTries.push(Date.now());
      audit(sess, 'adminlogin', null, null, 'denied');
      reply(sess, 'admin.loginFail');
      return;
    }
    sess.codeLogin = true;
    setRole(sess, 'Owner');
    audit(sess, 'adminlogin', null, null, 'ok');
    reply(sess, 'admin.role', { roleKey: 'role.Owner' });
  }

  function findTarget(sess, name) {
    const game = sess.room?.game;
    return game ? game.admin.find(name) : null;
  }
  const sessionOf = (player) => [...sessions].find((s) => s.conn?.player() === player);

  function handle(sess, cmd, args) {
    cmd = String(cmd || '').toLowerCase();
    args = Array.isArray(args) ? args.map((a) => String(a).slice(0, 200)).slice(0, 20) : [];
    if (cmd === 'adminlogin') return codeLogin(sess, args[0]);
    const def = COMMANDS[cmd];
    if (!def) { reply(sess, 'admin.unknown'); return; }
    if (rank(sess.role) < rank(def.role)) {
      audit(sess, cmd, args[0], args.slice(1).join(' '), 'denied');
      reply(sess, 'admin.denied');
      return;
    }
    // Rate limit: 10 commands per 10 seconds per admin
    sess.adminTimes = (sess.adminTimes || []).filter((t) => Date.now() - t < 10000);
    if (sess.adminTimes.length >= 10) { reply(sess, 'admin.rate'); return; }
    sess.adminTimes.push(Date.now());

    const bad = () => { reply(sess, 'admin.badArgs', { usage: def.usage }); audit(sess, cmd, args[0], args.slice(1).join(' '), 'bad-args'); };
    const done = (target, value) => { reply(sess, 'admin.ok', { actionKey: 'admin.act.' + cmd, target }); audit(sess, cmd, target, value, 'ok'); };
    const fail = (target, value) => { reply(sess, 'admin.noTarget'); audit(sess, cmd, target, value, 'failed'); };

    if(cmd==='setrole'){
      const email=String(args[0]||'').toLowerCase().trim(),role=args[1];
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||!ROLES.includes(role))return bad();
      // Nobody removes their own ownership by accident, and the built-in owners (OWNERS) cannot be changed from the game.
      if((sess.user?.email===email && role!=='Owner') || OWNERS.includes(email))return bad();
      const next={...staff};if(role==='Player')delete next[email];else next[email]=role;
      const dest=path.join(dataDir,'admins.json'),temp=dest+'.tmp';fs.writeFileSync(temp,JSON.stringify(next,null,2));fs.renameSync(temp,dest);staff=next;
      for(const online of sessions)if(online.user?.email===email)setRole(online,role);
      return done(email,role);
    }
    if (cmd === 'whoami') { reply(sess, 'admin.role', { roleKey: 'role.' + sess.role }); return; }

    if (cmd === 'announce') {
      const text = filterChat(args.join(' ')).text;
      if (!text) return bad();
      for (const room of rooms.values()) room.game.admin.announce(text);
      return done('*', text);
    }

    const name = args[0];
    const target = findTarget(sess, name);
    if (!name) return bad();
    if (!target) return fail(name, args.slice(1).join(' '));
    const game = sess.room.game;

    switch (cmd) {
      case 'heal': {
        const n = args[1] === undefined ? 100 : Number(args[1]);
        if (!Number.isInteger(n) || n < 1 || n > 100) return bad();
        return game.admin.heal(target, n) ? done(target.name, n) : fail(target.name, n);
      }
      case 'sethealth': {
        const n = Number(args[1]);
        if (!Number.isInteger(n) || n < 1 || n > PLAYER.maxHp) return bad();
        return game.admin.setHealth(target, n) ? done(target.name, n) : fail(target.name, n);
      }
      case 'giveweapon': {
        const w = String(args[1] || '').toLowerCase();
        if (!WEAPONS[w]) return bad();
        return game.admin.giveWeapon(target, w) ? done(target.name, w) : fail(target.name, w);
      }
      case 'teleport': {
        const dest = /^\d+$/.test(args[1] || '') ? MAP.spawns[Number(args[1]) - 1] : game.admin.find(args[1])?.p;
        if (!dest) return bad();
        const spot = [dest[0] + (/^\d+$/.test(args[1]) ? 0 : 1.2), dest[1], dest[2]];
        return game.admin.teleport(target, spot) ? done(target.name, args[1]) : fail(target.name, args[1]);
      }
      case 'kick': {
        const victim = sessionOf(target);
        if (!victim || target.bot) return fail(target.name);
        if (rank(victim.role) >= rank(sess.role)) { reply(sess, 'admin.denied'); return audit(sess, cmd, target.name, null, 'denied-rank'); }
        const reason = filterChat(args.slice(1).join(' ')).text || '-';
        victim.send({ t: 'kicked', key: 'admin.kicked', p: { reason } });
        setTimeout(() => victim.ws.close(), 100);
        return done(target.name, reason);
      }
      case 'ban': {
        const victim = sessionOf(target);
        if (!victim || target.bot) return fail(target.name);
        if (rank(victim.role) >= rank(sess.role)) { reply(sess, 'admin.denied'); return audit(sess, cmd, target.name, null, 'denied-rank'); }
        const hasMinutes = /^\d+$/.test(args[1] || '');
        const minutes = hasMinutes ? Number(args[1]) : 60;
        const reason = filterChat(args.slice(hasMinutes ? 2 : 1).join(' ')).text;
        if (!reason || minutes < 1 || minutes > 525600) return bad();
        // Signed-in players are banned by account; only guests fall back to IP (shared networks!)
        bans.push({ email: victim.user?.email || null, ip: victim.user ? null : victim.ip, until: Date.now() + minutes * 60000, reason, by: sess.user?.email || 'admin-code' });
        saveBans();
        victim.send({ t: 'kicked', key: 'admin.banned', p: { reason } });
        setTimeout(() => victim.ws.close(), 100);
        return done(target.name, `${minutes}m ${reason}`);
      }
      case 'givemoney': {
        const n = Number(args[1]);
        if (!Number.isInteger(n) || n < 1 || n > 10000) return bad();
        // Currency only moves through the economy service, into the target's account
        const victim = sessionOf(target);
        const accId = victim && economy?.accountId(victim);
        if (!accId) { reply(sess, 'admin.noEconomy'); return audit(sess, cmd, target.name, n, 'no-account'); }
        if (!economy.grant(accId, n)) return bad();
        victim.send({ t: 'profile', profile: economy.profile(economy.get(accId)) });
        victim.send({ t: 'chat', sys: true, key: 'shop.granted', p: { n } });
        return done(target.name, n);
      }
    }
  }

  // ---------- admin panel (public/admin.html) ----------
  // A separate page: sign in with Google (Firebase Authentication) or the ADMIN_CODE, see every player in every
  // room, and kick / ban / mute / warn / unban. Every action is checked here and written to the audit log.
  const DUR = { 10: 10, 60: 60, 1440: 1440, 10080: 10080, 0: 0 }; // minutes; 0 = forever
  function playersOnline() {
    const out = [];
    for (const s of sessions) {
      const p = s.conn?.player?.();
      if (!p && !s.room) continue;
      const mute = activeMute(s);
      out.push({ sid: s.sid, name: p?.name || '?', room: s.room?.code || null, mode: s.room?.mode || null, role: s.role, signedIn: !!s.user, email: rank(s.role) >= 1 || !s.user ? null : s.user.email,
        kills: p?.kills || 0, deaths: p?.deaths || 0, ping: Math.round(p?.rtt || 0), muted: mute ? (mute.until || 0) : null, warnings: s.warnings || 0 });
    }
    return out;
  }
  const bySid = (sid) => [...sessions].find((s) => s.sid === sid);
  async function panel(sess, m) {
    const say = (ok, key, extra = {}) => sess.send({ t: 'panel', ok, key, ...extra });
    if (m.a === 'login') {
      if (m.code) { codeLogin(sess, m.code); return say(rank(sess.role) >= 1, rank(sess.role) >= 1 ? 'panel.welcome' : 'admin.loginFail', { role: sess.role }); }
      const user = await verifyFirebaseToken(m.idToken, FIREBASE_PROJECT);
      if (!user) { audit(sess, 'panel-login', null, null, 'bad-token'); return say(false, 'panel.badLogin'); }
      sess.user = { ...(sess.user || {}), email: user.email, name: user.name };
      setRole(sess, staff[user.email] || 'Player');
      audit(sess, 'panel-login', user.email, null, rank(sess.role) >= 1 ? 'ok' : 'denied');
      return say(rank(sess.role) >= 1, rank(sess.role) >= 1 ? 'panel.welcome' : 'panel.notStaff', { role: sess.role, email: user.email });
    }
    if (rank(sess.role) < 1) return say(false, 'admin.denied');
    sess.adminTimes = (sess.adminTimes || []).filter((t) => Date.now() - t < 10000);
    if (m.a !== 'list' && sess.adminTimes.length >= 20) return say(false, 'admin.rate');
    if (m.a !== 'list') sess.adminTimes.push(Date.now());
    if (m.a === 'list') return sess.send({ t: 'panel', ok: true, list: playersOnline(), bans: bans.filter((b) => live(b)).map(({ ip, ...b }) => ({ ...b, ip: ip ? ip.replace(/\.\d+$/, '.*') : null })), role: sess.role, rooms: rooms.size });
    if (m.a === 'audit') {
      let lines = [];
      try { lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n').slice(-60).reverse().map((l) => JSON.parse(l)); } catch { /* no log yet */ }
      return sess.send({ t: 'panel', ok: true, audit: lines });
    }
    if (m.a === 'announce') {
      const text = filterChat(String(m.text || '').slice(0, 200)).text;
      if (!text) return say(false, 'admin.badArgs', { usage: '' });
      for (const room of rooms.values()) room.game.admin.announce(text);
      audit(sess, 'announce', '*', text, 'ok'); return say(true, 'panel.done');
    }
    if (m.a === 'unban') {
      const b = bans.find((x) => x.id === m.id);
      if (!b || (b.type === 'ban' && rank(sess.role) < 2)) return say(false, 'admin.denied');
      bans = bans.filter((x) => x !== b); saveBans();
      audit(sess, 'un' + b.type, b.name || b.email || b.ip, null, 'ok'); return say(true, 'panel.done');
    }
    const victim = bySid(m.sid);
    if (!victim) return say(false, 'admin.noTarget');
    const vName = victim.conn?.player?.()?.name || '?';
    if (rank(victim.role) >= rank(sess.role)) { audit(sess, m.a, vName, null, 'denied-rank'); return say(false, 'admin.denied'); }
    const reason = filterChat(String(m.reason || '').slice(0, 120)).text || '-';
    const by = sess.user?.email || 'admin-code';
    if (m.a === 'warn') {
      victim.warnings = (victim.warnings || 0) + 1;
      victim.send({ t: 'chat', sys: true, key: 'panel.warned', p: { reason } });
      victim.send({ t: 'warned', reason });
      audit(sess, 'warn', vName, reason, 'ok'); return say(true, 'panel.done');
    }
    if (m.a === 'kick') {
      victim.send({ t: 'kicked', key: 'admin.kicked', p: { reason } }); setTimeout(() => victim.ws.close(), 100);
      audit(sess, 'kick', vName, reason, 'ok'); return say(true, 'panel.done');
    }
    if (m.a === 'mute' || m.a === 'ban') {
      if (m.a === 'ban' && rank(sess.role) < 2) return say(false, 'admin.denied'); // moderators may mute and kick, admins also ban
      const minutes = DUR[m.minutes] ?? 60, until = minutes ? Date.now() + minutes * 60000 : 0;
      // Signed-in players by account; guests by their device token and IP (a shared network could be caught)
      const rec = { id: Math.random().toString(36).slice(2, 10), type: m.a, name: vName, email: victim.user?.email?.toLowerCase() || null, ip: victim.user ? null : victim.ip, guest: victim.user ? null : victim.guestToken || null, until, reason, by, at: Date.now() };
      bans.push(rec); saveBans();
      if (m.a === 'ban') { victim.send({ t: 'kicked', key: 'admin.banned', p: { reason } }); setTimeout(() => victim.ws.close(), 100); }
      else { const p = victim.conn?.player?.(); if (p) p.mutedUntil = until || Date.now() + 365 * 86400000; victim.send({ t: 'chat', sys: true, key: 'panel.muted', p: { reason } }); }
      audit(sess, m.a, vName, `${minutes || 'forever'} ${reason}`, 'ok'); return say(true, 'panel.done');
    }
    return say(false, 'admin.unknown');
  }

  return { handle, onAuth, activeBan, activeMute, panel };
}
