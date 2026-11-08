// Drop Havoc match simulation: players, server-authoritative combat, bots and chat.
// Runs inside the Node server (server.js, one instance per room) and, for offline practice, inside the browser.
import { MAP as DEFAULT_MAP, MAPS } from './map.js';
import { createVehicles, CAR_HP, CAR_HALF, carBlastDmg } from './vehicles.js';
import { wantDriveInput, shouldEnterCar, shouldExitCar, BOT_DRIVE } from './bot-drive.js';
import { createChests } from './chests.js';
import { VEST_POINTS, HELMET_POINTS, HELMET_ABSORB, HEALS, DRINK, vestLevelOf, helmetLevelOf, packGear } from './gear.js';
import { WEAPONS, WEAPON_ORDER, LOADOUT, START_LOADOUT, UNARMED, bestOwned, damageAt } from './weapons.js';
import { PLAYER, PARACHUTE, insideMap, step, rayBox, rayWorld, hitboxes, dirFromAngles, collides, stanceOf, canStance, clearMovement , findVault } from './physics.js';
import { filterChat, cleanName, QUICK_CHAT } from './chatfilter.js';
import { CHARACTERS, characterById } from './characters.js';
import { itemById } from './shop.js';
import {PLAYER_LIMIT,ffaCapacity} from './limits.js';

// Each call creates an independent match (one per room).
// Game modes. Team modes start from a lobby (choose team, ready up) and have no bots.
export const MODES = {
  ffa: { teams: false, perTeam: PLAYER_LIMIT, killLimit: 25 },
  duel: { teams: true, perTeam: 1, killLimit: 10 },
  team2: { teams: true, perTeam: 2, killLimit: 15 },
};
const TEAM_COLORS = { A: 0x40c4ff, B: 0xff1744 };

export function createGame(opts = {}) {
  // Dynamic vehicle colliders belong to one room, never to the shared template.
  const MAP_TEMPLATE = (opts.map && MAPS[opts.map]) || DEFAULT_MAP; // 0.16.42: per-room map (online map select)
  const MAP={...MAP_TEMPLATE,boxes:Object.assign(MAP_TEMPLATE.boxes.filter(b=>!b.vehicle),{ramps:MAP_TEMPLATE.ramps,pads:MAP_TEMPLATE.pads,bounds:MAP_TEMPLATE.bounds,dropBounds:MAP_TEMPLATE.dropBounds,city:MAP_TEMPLATE.boxes.city,decorations:MAP_TEMPLATE.boxes.decorations,street:MAP_TEMPLATE.boxes.street,edgeBuildings:MAP_TEMPLATE.boxes.edgeBuildings})};
  const mode = MODES[opts.mode] ? opts.mode : 'ffa';
  const M = MODES[mode];
  // Practice difficulty (bots): reaction time, aim error floor and how fast it tightens, turn speed,
  // damage dealt, and how many fighters the bots fill up to
  const DIFFICULTY = {
    // 0.16.33: every level a bit easier; insane still hardest but playable.
    easy: { react: [1000, 1600], aimMin: 0.14, aimTighten: 0.055, turn: 2.5, dmg: 0.45, bots: 3 },
    normal: { react: [600, 1100], aimMin: 0.07, aimTighten: 0.12, turn: 5, dmg: 0.9, bots: 4 },
    hard: { react: [350, 700], aimMin: 0.045, aimTighten: 0.2, turn: 7, dmg: 1.05, bots: 5 },
    insane: { react: [220, 480], aimMin: 0.03, aimTighten: 0.26, turn: 9, dmg: 1.15, bots: 7 },
  };
  const difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'normal';
  const D = DIFFICULTY[difficulty];
  const capacity=M.teams?M.perTeam*2:ffaCapacity(opts.capacity);
  const config = { capacity, bots: M.teams ? 0 : (MAP.fighters ?? opts.bots ?? D.bots), mode, difficulty }; // 0.16.36: neon warehouse = 5 fighters (4 bots + you) // bots fill up to this many fighters
  // Pickups on the map (MAP.pickups): heart, armor, speed, power, ammo, rpg. Taken ones come back after `respawn` s.
  const PICKUP = {
    heart: { respawn: 30 }, armor: { respawn: 35 }, speed: { respawn: 25 }, power: { respawn: 40 }, ammo: { respawn: 15 }, rpg: { respawn: 60 },
  };
  // 0.16.36: ground weapons ('gun:<id>', neon armory) come back at the same spot quickly.
  const GUN_RESPAWN = 10;
  const respawnOf = (type) => String(type).startsWith('gun:') ? GUN_RESPAWN : (PICKUP[type]?.respawn ?? 30);
  const BUFF = { heartHp: 75, armorAdd: 60, armorMax: PLAYER.maxArmor, speedMs: 30000, speedMul: 1.3, powerMs: 30000, powerMul: 1.5 };
  const items = (MAP.pickups || []).map((it, i) => ({ id: i, type: it.type, p: it.p, readyAt: 0 }));
  const TICK = 1 / 30;
  const SNAP_EVERY = 2;              // snapshots at 15 Hz
  const MAX_PLAYERS = capacity;
  const MATCH_SECONDS = 300;
  const KILL_LIMIT = M.killLimit;
  const RESPAWN_SECONDS = 3;
  const SPAWN_PROTECT = 1.5;
  const COLORS = [0xff2e88, 0x00e5ff, 0xffd600, 0x76ff03, 0xff6d00, 0xd500f9, 0x40c4ff, 0xff1744, 0x1de9b6, 0xf50057, 0xc6ff00, 0x651fff];
  const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 5: 'RAMPAGE', 7: 'UNSTOPPABLE', 10: 'GODLIKE' };

  // ---------- state ----------
  const players = new Map(); // id -> player (humans and bots)
  let nextId = 1;
  let nextKnife = 1;
  const knives = [];
  let tick = 0;
  const match = { state: M.teams ? 'lobby' : 'playing', endsAt: Date.now() + MATCH_SECONDS * 1000, winner: null, countdownAt: 0 };
  const teamScore = { A: 0, B: 0 };

  function newPlayer(name, bot = false) {
    const used = new Set([...players.values()].map((p) => p.color));
    const p = {
      id: (bot ? 'b' : 'p') + nextId++,
      name, bot, ws: null,
      color: COLORS.find((c) => !used.has(c)) ?? COLORS[nextId % COLORS.length],
      p: [0, 0, 0], v: [0, 0, 0], onGround: true, yaw: 0, pitch: 0,
      hp: PLAYER.maxHp, alive: false, respawnAt: Date.now() + 500, protectUntil: 0,
      stance: 0, inventory:new Set(START_LOADOUT), weapon: UNARMED, ammo: {}, armor: 0, speedUntil: 0, powerUntil: 0, special: null, reloadUntil: 0, lastShot: {}, lastHurt: 0,
      kills: 0, deaths: 0, streak: 0, heads: 0, team: null, ready: false,
      history: [], rtt: 80, lastState: Date.now(), chatTimes: [], strikes: 0, mutedUntil: 0,
      ai: bot ? { ...botPersona(), wp: null, stuck: 0, target: null, seenAt: 0, mode: 'wander', modeT: 0, pace: 0.5, sideBias: Math.random() < 0.5 ? -1 : 1, sideT: 0, f: 0, s: 0, jumpT: 0, aimErr: 0 } : null,
    };
    refill(p);
    players.set(p.id, p);
    return p;
  }

  const refill = (p) => { for (const k of LOADOUT) if (p.inventory?.has(k)) p.ammo[k] = WEAPONS[k].mag; };
  const humans = () => [...players.values()].filter((p) => !p.bot);
  const send = (p, msg) => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); };
  const broadcast = (msg, except) => { const s = JSON.stringify(msg); for (const p of players.values()) if (p !== except && p.ws && p.ws.readyState === 1) p.ws.send(s); };
  // System messages carry a key and neutral params; each client shows them in its own language
  const sys = (key, p = {}) => broadcast({ t: 'chat', sys: true, key, p });
  const tell = (pl, key, p = {}) => send(pl, { t: 'chat', sys: true, key, p });

  function roster() {
    return [...players.values()].map((p) => ({ id: p.id, name: p.name, bot: p.bot, color: p.color, kills: p.kills, deaths: p.deaths, ping: p.bot ? 0 : Math.round(p.rtt), character: p.character, team: p.team, ready: p.ready, cosmetics: p.cosmetics || {} }));
  }
  const vehicles=createVehicles(MAP,{send,broadcast,playerById:id=>players.get(id),onBoom:(c,e)=>carBoom(e)});
  // 0.16.35: a wrecked car explodes - occupant + anyone nearby takes blast damage (falloff, cover blocks)
  function carBoom({at,driver,by}){
    if(match.state!=='playing')return;
    const R=CAR_HP.blastRadius;
    for(const t of players.values()){
      if(!t.alive)continue;
      const c=[t.p[0],t.p[1]+0.9,t.p[2]];const d=Math.hypot(c[0]-at[0],c[1]-at[1],c[2]-at[2]);
      const inCar=t.id===driver;
      if(!inCar&&d>R)continue;
      if(!inCar&&d>1.5){const dir=[c[0]-at[0],c[1]-at[1],c[2]-at[2]].map(v=>v/Math.max(d,0.01));if(rayWorld(at,dir,MAP.boxes,d)<d-0.3)continue;}
      const dmg=carBlastDmg(d,inCar);
      const a=(by&&players.get(by))||t;
      if(a!==t&&M.teams&&a.team===t.team&&!inCar)continue;
      if(a===t)selfHurt(t,dmg,at);else applyDamage(a,t,dmg,false,'carboom',c);
    }
  }
  function selfHurt(t,dmg,at){
    if(Date.now()<t.protectUntil)return;
    if(t.armor>0){const s=Math.min(t.armor,dmg);t.armor-=s;dmg-=s;}
    t.hp-=dmg;t.lastHurt=Date.now();
    send(t,{t:'hurt',by:t.id,hp:Math.max(0,t.hp),armor:Math.round(t.armor),from:at});
    if(t.hp<=0){t.alive=false;t.hp=0;t.deaths++;t.streak=0;t.respawnAt=Date.now()+RESPAWN_SECONDS*1000;broadcast({t:'kill',killer:t.id,victim:t.id,w:'carboom',pos:t.p});sendRoster();}
  }
  const chestSystem=createChests(MAP,{
    send,broadcast,reward:(p,loot)=>opts.onLoot?.(p,loot),
    // Returns false when the item would do nothing (it then stays on the floor for someone else)
    grantEquipment(p,loot){
      if(loot.heal){const h=HEALS[loot.heal];if(!h||p.hp>=h.cap)return false;p.hp=Math.min(h.cap,p.hp+h.hp);send(p,{t:'heal',hp:p.hp,item:loot.heal});}
      if(loot.drink){if(p.hp>=PLAYER.maxHp&&Date.now()<p.speedUntil)return false;p.hp=Math.min(PLAYER.maxHp,p.hp+DRINK.hp);p.speedUntil=Math.max(p.speedUntil||0,Date.now()+DRINK.speedMs);send(p,{t:'heal',hp:p.hp,item:'drink'});}
      if(loot.vest){const pts=VEST_POINTS[loot.vest];if(!pts||(loot.vest<=(p.vestLvl||0)&&p.armor>=pts))return false;p.armor=Math.max(p.armor,pts);p.vestLvl=Math.max(p.vestLvl||0,loot.vest);}
      if(loot.helmetLvl){const pts=HELMET_POINTS[loot.helmetLvl];if(!pts||(loot.helmetLvl<=(p.helmetLvl||0)&&p.helmet>=pts))return false;p.helmet=Math.max(p.helmet||0,pts);p.helmetLvl=Math.max(p.helmetLvl||0,loot.helmetLvl);}
      if(loot.ammo){const before=JSON.stringify(p.ammo);refill(p);if(JSON.stringify(p.ammo)===before)return false;send(p,{t:'refill',ammo:p.ammo});}
      p.armor=Math.min(PLAYER.maxArmor,p.armor+(loot.armor||0));p.helmet=Math.min(60,(p.helmet||0)+(loot.helmet||0));
      if(loot.weapon){if(p.inventory.has(loot.weapon)&&p.ammo[loot.weapon]>=WEAPONS[loot.weapon].mag)return false;p.inventory.add(loot.weapon);p.ammo[loot.weapon]=WEAPONS[loot.weapon].mag;if(p.weapon===UNARMED||!p.inventory.has(p.weapon))p.weapon=loot.weapon;send(p,{t:'ammo',w:loot.weapon,n:p.ammo[loot.weapon],equip:p.weapon===loot.weapon});}sendBuffs(p);
      return true;
    }
  });
  const sendRoster = () => broadcast({ t: 'roster', players: roster(), mode, teamScore: M.teams ? teamScore : null });

  // ---------- teams & lobby ----------
  const teamOf = (team) => [...players.values()].filter((p) => p.team === team);
  function assignTeam(p, team) {
    p.team = team;
    p.color = TEAM_COLORS[team];
    p.ready = false;
  }
  function smallerTeam() {
    const a = teamOf('A').length, b = teamOf('B').length;
    if (a >= M.perTeam && b >= M.perTeam) return null;
    return a <= b ? 'A' : 'B';
  }
  function lobbyState() {
    return { t: 'lobby', mode, perTeam: M.perTeam, state: match.state, countdownAt: match.countdownAt, players: roster() };
  }
  const sendLobby = () => broadcast(lobbyState());
  // Ready when every player is ready, both teams have someone and team sizes match
  function checkStart() {
    if (match.state !== 'lobby') return;
    const a = teamOf('A'), b = teamOf('B');
    const ok = a.length === M.perTeam && b.length === M.perTeam && [...players.values()].every((p) => p.ready);
    match.countdownAt = ok ? Date.now() + 3000 : 0;
    sendLobby();
  }
  function startTeamMatch() {
    match.state = 'playing';
    match.countdownAt = 0;
    match.endsAt = Date.now() + MATCH_SECONDS * 1000;
    teamScore.A = teamScore.B = 0;
    vehicles.resetAll(); for (const p of players.values()) { p.kills = 0; p.deaths = 0; p.heads = 0; p.hasDropped=false; spawn(p); }
    broadcast({ t: 'match', state: 'playing', endsAt: match.endsAt, mode });
    sendRoster();
    sys('sys.matchStart', { n: KILL_LIMIT });
  }

  // 0.16.38: nearest free ground spot to the middle of a small map (centre structures like the canyon butte are skipped).
  function centerSpawn(p) {
    const others = [...players.values()].filter((o) => o !== p && o.alive);
    for (let r = 0; r <= MAP.bounds - 3; r += 1.5) {
      const n = r ? Math.max(8, Math.round(r * 4)) : 1;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (collides(x, 0.01, z, MAP.boxes, PLAYER.height || 1.8)) continue;
        if (others.some((o) => Math.hypot(o.p[0] - x, o.p[2] - z) < 2)) continue;
        return [x, 0, z];
      }
    }
    return pickSpawn(p);
  }
  function pickSpawn(p) {
    const enemies = [...players.values()].filter((o) => o !== p && o.alive && (!M.teams || o.team !== p.team));
    let best = MAP.spawns[0], bestScore = -1;
    // Team modes: each team starts on its own side of the arena
    const side = !M.teams ? MAP.spawns : MAP.spawns.filter((s) => (p.team === 'A' ? s[0] <= 0 : s[0] >= 0));
    for (const s of side) {
      let d = 1e9;
      for (const e of enemies) d = Math.min(d, Math.hypot(e.p[0] - s[0], e.p[2] - s[2]));
      const score = d + Math.random() * 6;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  function spawn(p) {
    vehicles.free(p.id);p.vehicle=null;
    if(!p.hasDropped){p.inventory=new Set(START_LOADOUT);p.ammo={};}
    if(!p.inventory.has(p.weapon))p.weapon=bestOwned(p.inventory);
    let s = (!p.bot && !p.hasDropped && MAP.bounds < 80) ? centerSpawn(p) : pickSpawn(p); // 0.16.38: small maps start at the centre, no plane/parachute
    p.parachuting=MAP.bounds>=80 && !p.hasDropped; // 0.16.34: bots jump from the plane and parachute with the player too
    if(p.parachuting&&p.bot&&!p.dropAt){const h=[...players.values()].find(q=>!q.bot&&q.dropAt);p.dropAt=h?h.dropAt:[s[0],s[2]];}
    if(p.parachuting&&p.dropAt){const lim=Math.min(95,MAP.bounds-2);s=[Math.max(-lim,Math.min(lim,p.dropAt[0]+(Math.random()-0.5)*8)),0,Math.max(-lim,Math.min(lim,p.dropAt[1]+(Math.random()-0.5)*8))];} // 0.16.41: re-clamp after spread
    p.hasDropped=true;p.chuteOpen=false;
    p.p = [s[0], p.parachuting?PARACHUTE.height:s[1], s[2]]; p.v = [0, 0, 0];p.onGround=!p.parachuting;
    p.yaw = (s[0]||s[2]) ? Math.atan2(s[0], s[2]) : 0; // face the centre
    p.pitch = 0;
    p.hp = PLAYER.maxHp; p.alive = true; p.streak = 0; p.stance = 0;
    p.helmet=0;p.helmetLvl=0;p.vestLvl=0;
    p.armor = 0; p.speedUntil = 0; p.powerUntil = 0; p.special = null; delete p.ammo.rpg;
    p.protectUntil = Date.now() + SPAWN_PROTECT * 1000;
    p.reloadUntil = 0; refill(p);
    p.history = [];
    send(p, { t: 'spawn', p: p.p, yaw: p.yaw, ammo: p.ammo, inventory:[...p.inventory], weapon:p.weapon, parachuting:p.parachuting });
    sendBuffs(p);
  }

  // ---------- combat ----------
  function positionAt(p, t) {
    const h = p.history;
    if (!h.length) return p.p;
    if (t >= h[h.length - 1].t) return h[h.length - 1].p;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) {
        const k = (t - a.t) / Math.max(1, b.t - a.t);
        return [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k];
      }
    }
    return h[0].p;
  }

  function fire(shooter, wKey, origin, dirs) {
    const w = WEAPONS[wKey];
    const now = Date.now();
    if (!w || !shooter.alive || shooter.parachuting || match.state !== 'playing') return;
    if (now < shooter.reloadUntil) return;
    if (now - (shooter.lastShot[wKey] || 0) < w.rate * 1000 * 0.85) return; // rate-of-fire check
    if(!w.pickupOnly && !shooter.inventory.has(wKey))return;
    if (w.pickupOnly && !(shooter.special?.w === wKey && now < shooter.special.until)) return; // RPG only while held
    if (!(shooter.ammo[wKey] > 0)) return;
    if (!Array.isArray(dirs) || dirs.length < 1 || dirs.length > w.pellets) return;
    shooter.lastShot[wKey] = now; shooter.lastFire = now;
    shooter.ammo[wKey]--;
    if (w.pickupOnly && shooter.ammo[wKey] <= 0) { shooter.special = null; delete shooter.ammo[wKey]; sendBuffs(shooter); }
    const power = now < shooter.powerUntil ? BUFF.powerMul : 1;
    shooter.weapon = wKey;
    shooter.protectUntil = 0; // firing ends spawn protection

    // The shot must start at the shooter's eye (small tolerance for latency)
    const eye = [shooter.p[0], shooter.p[1] + stanceOf(shooter.stance).eye, shooter.p[2]];
    const o = (Array.isArray(origin) && origin.length === 3 && origin.every(Number.isFinite) &&
      Math.hypot(origin[0] - eye[0], origin[1] - eye[1], origin[2] - eye[2]) < 2.5) ? origin : eye;

    // Lag compensation: rewind targets to what the shooter saw
    const rewind = shooter.bot ? 0 : Math.min(300, shooter.rtt / 2 + 100);
    const tShot = now - rewind;
    const targets = [...players.values()].filter((t) => t !== shooter && t.alive && (!M.teams || t.team !== shooter.team)).map((t) => ({ t, pos: positionAt(t, tShot) }));

    const ownCar = shooter.vehicle && vehicles._cars.find((c) => c.id === shooter.vehicle);
    const shotBoxes = ownCar ? Object.assign(MAP.boxes.filter((b) => b !== ownCar.box), { ramps: MAP.boxes.ramps }) : MAP.boxes;
    const ends = [];
    const dmgBy = new Map();
    const carDmg = new Map(); // 0.16.25
    for (const raw of dirs) {
      if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(Number.isFinite)) continue;
      const l = Math.hypot(raw[0], raw[1], raw[2]);
      if (l < 0.5 || l > 1.5) continue;
      const d = [raw[0] / l, raw[1] / l, raw[2] / l];
      const wall = rayWorld(o, d, shotBoxes, w.range); // 0.16.42: drive-by — never hit your own car
      let best = wall, hitT = null, head = false;
      for (const { t, pos } of targets) {
        const hb = hitboxes(pos, t.stance, t.yaw);
        const th = rayBox(o, d, hb.head[0], hb.head[1], best);
        if (th !== null && th < best) { best = th; hitT = t; head = true; }
        const tb = rayBox(o, d, hb.body[0], hb.body[1], best);
        if (tb !== null && tb < best) { best = tb; hitT = t; head = false; }
      }
      if (!hitT && !w.blast) { const ch = vehicles.rayCar(o, d, best + 0.02, shooter.vehicle); if (ch) carDmg.set(ch.id, (carDmg.get(ch.id) || 0) + Math.round(damageAt(w, ch.t, false) * power)); }
      ends.push([o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best, hitT ? 1 : 0]);
      if (hitT) {
        const e = dmgBy.get(hitT) || { dmg: 0, head: false, at: null };
        e.dmg += Math.round(damageAt(w, best, head) * power);
        e.head = e.head || head;
        e.at = ends[ends.length - 1].slice(0, 3);
        dmgBy.set(hitT, e);
      }
    }
    broadcast({ t: 'shot', id: shooter.id, w: wKey, o, ends }, shooter);
    if (w.blast) {
      // Rocket: explode where it hit; everyone (enemies) in the radius takes damage, less towards the edge
      const at = ends[0];
      const flight = Math.hypot(at[0] - o[0], at[1] - o[1], at[2] - o[2]) / (w.rocketSpeed || 1e9);
      const detonate = () => {
      broadcast({ t: 'boom', at: at.slice(0, 3) });
      if (match.state !== 'playing') return;
      vehicles.blast(at, w.blast, Math.round(w.damage * power * 1.2));
      for (const t of players.values()) {
        if (t === shooter || !t.alive || (M.teams && t.team === shooter.team)) continue;
        const c = [t.p[0], t.p[1] + 0.9, t.p[2]];
        const d = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]);
        if (d > w.blast) continue;
        const dir = [c[0] - at[0], c[1] - at[1], c[2] - at[2]].map((v) => v / Math.max(d, 0.01));
        if (d > 0.6 && rayWorld(at, dir, MAP.boxes, d) < d - 0.3) continue; // cover blocks the blast
        applyDamage(shooter, t, Math.round(w.damage * power * (1 - 0.7 * (d / w.blast))), false, wKey, c);
      }
      };
      if (flight > 0.03) setTimeout(detonate, flight * 1000); else detonate();
      return;
    }
    for (const [id, dmg] of carDmg) vehicles.damage(id, dmg);
    for (const [target, e] of dmgBy) applyDamage(shooter, target, e.dmg, e.head, wKey, e.at);
  }

  // Knife: nearest enemy in a short arc in front, in line of sight. Hits from behind kill outright.
  function melee(attacker, yaw, pitch) {
    const w = WEAPONS.knife, now = Date.now();
    if (!attacker.inventory?.has('knife') || !attacker.alive || attacker.parachuting || attacker.vehicle || match.state !== 'playing') return;
    if (now - (attacker.lastShot.knife || 0) < w.rate * 1000 * 0.85) return;
    attacker.lastShot.knife = now;
    attacker.weapon = 'knife';
    attacker.protectUntil = 0;
    if (Number.isFinite(yaw)) attacker.yaw = yaw;
    if (Number.isFinite(pitch)) attacker.pitch = Math.max(-1.55, Math.min(1.55, pitch));
    const fwd = dirFromAngles(attacker.yaw, attacker.pitch);
    const eye = [attacker.p[0], attacker.p[1] + stanceOf(attacker.stance).eye, attacker.p[2]];
    const tHit = now - (attacker.bot ? 0 : Math.min(300, attacker.rtt / 2 + 100));
    let best = null, bestDist = w.range;
    for (const t of players.values()) {
      if (t === attacker || !t.alive || (M.teams && t.team === attacker.team)) continue;
      const pos = positionAt(t, tHit);
      const c = [pos[0], pos[1] + stanceOf(t.stance).height * 0.6, pos[2]];
      const d = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const dist = Math.hypot(d[0], d[1], d[2]);
      if (dist > bestDist + 0.4) continue; // body radius
      const dot = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / Math.max(dist, 0.01);
      if (dot < w.arc) continue;
      if (rayWorld(eye, d.map((v) => v / dist), MAP.boxes, dist) < dist - 0.05) continue;
      best = { t, dist, pos };
      bestDist = dist;
    }
    broadcast({ t: 'swing', id: attacker.id }, attacker);
    if (!best) return;
    // Backstab: the target looks the same way we are attacking (we are behind them)
    const tf = [-Math.sin(best.t.yaw), -Math.cos(best.t.yaw)];
    const dx = best.pos[0] - attacker.p[0], dz = best.pos[2] - attacker.p[2], dl = Math.hypot(dx, dz) || 1;
    const back = (tf[0] * dx + tf[1] * dz) / dl > 0.5;
    const dmg = Math.round(w.damage * (back ? w.backstabMul : 1));
    applyDamage(attacker, best.t, dmg, false, 'knife', [best.pos[0], best.pos[1] + 1.2, best.pos[2]], back);
  }

  // Host simulates swept projectiles; clients never submit hits or damage.
  function throwKnife(attacker, yaw, pitch) {
    const w = WEAPONS.knife, now = Date.now();
    if (!attacker.inventory?.has('knife') || !attacker.alive || attacker.parachuting || attacker.vehicle || match.state !== 'playing' || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    if (now - (attacker.lastShot.knife || 0) < w.throwRate * 1000) return;
    attacker.lastShot.knife = now; attacker.weapon = 'knife'; attacker.protectUntil = 0;
    const d = dirFromAngles(yaw, Math.max(-1.5, Math.min(1.5, pitch)));
    const p = [attacker.p[0], attacker.p[1] + stanceOf(attacker.stance).eye, attacker.p[2]];
    const k = { id: nextKnife++, owner: attacker.id, p, v: d.map(n => n * w.throwSpeed), distance: 0 };
    knives.push(k);
    broadcast({t:'knifeFlight', id:k.id, owner:k.owner, p:k.p, v:k.v});
  }
  function stepKnives(dt) {
    for (let i = knives.length - 1; i >= 0; i--) {
      const k=knives[i], owner=players.get(k.owner), w=WEAPONS.knife;
      if (!owner || match.state !== 'playing') { knives.splice(i,1); broadcast({t:'knifeEnd',id:k.id,at:k.p}); continue; }
      const len=Math.hypot(...k.v)*dt, d=k.v.map(n=>n/Math.hypot(...k.v));
      let dist=Math.min(len,rayWorld(k.p,d,MAP.boxes,len)), victim=null, head=false;
      for (const p of players.values()) {
        if(p===owner || !p.alive || (M.teams && p.team===owner.team)) continue;
        const hb=hitboxes(p.p,p.stance,p.yaw);
        for(const [box,isHead] of [[hb.head,true],[hb.body,false]]) {
          const hit=rayBox(k.p,d,box[0],box[1],dist);
          if(hit!==null && hit<dist){dist=hit;victim=p;head=isHead;}
        }
      }
      k.p=k.p.map((n,a)=>n+d[a]*dist); k.distance+=dist;
      k.v[1]-=7*dt;
      if(victim || dist<len-0.001 || k.distance>=w.throwRange){
        if(victim) applyDamage(owner,victim,Math.round(w.throwDamage*(head?1.6:1)),head,'knife',k.p);
        broadcast({t:'knifeEnd',id:k.id,at:k.p}); knives.splice(i,1);
      }
    }
  }

  function applyDamage(attacker, target, dmg, head, wKey, at, backstab = false) {
    if (!target.alive || Date.now() < target.protectUntil) return;
    if (M.teams && attacker !== target && attacker.team === target.team) return; // no friendly fire
    if (attacker.bot && !target.bot) dmg = Math.round(dmg * D.dmg); // practice difficulty
    if (target.bot) botHurt(target, attacker);
    if(head && target.helmet>0){const absorb=Math.min(target.helmet,dmg*HELMET_ABSORB[target.helmetLvl||0]);target.helmet-=absorb;dmg-=absorb;sendBuffs(target);}
    // Armor is a layer over health: it soaks damage first
    if (target.armor > 0 && !head) { const soak = Math.min(target.armor, dmg); target.armor -= soak; dmg -= soak; if (target.armor <= 0) target.vestLvl = 0; } // a vest protects the body; the head has the helmet
    target.hp -= dmg;
    target.lastHurt = Date.now();
    const kill = target.hp <= 0;
    send(attacker, { t: 'hit', target: target.id, dmg, head, kill, at, backstab });
    send(target, { t: 'hurt', by: attacker.id, hp: Math.max(0, target.hp), armor: Math.round(target.armor), from: attacker.p });
    if (target.bot && target.ai) { target.ai.target = attacker.id; target.ai.seenAt = Date.now(); }
    if (kill) onKill(attacker, target, wKey, head, backstab);
  }

  function onKill(killer, victim, wKey, head, backstab = false) {
    victim.alive = false; victim.hp = 0; victim.deaths++; victim.streak = 0;
    victim.respawnAt = Date.now() + RESPAWN_SECONDS * 1000;
    killer.kills++; killer.streak++;
    if (head) killer.heads++;
    // Kill reward: heal a little so aggressive play feels good
    if (killer.alive) killer.hp = Math.min(PLAYER.maxHp, killer.hp + 40);
    const streakName = STREAKS[killer.streak] || null;
    if (M.teams && killer.team) teamScore[killer.team]++;
    broadcast({ t: 'kill', killer: killer.id, victim: victim.id, w: wKey, head, backstab, streak: killer.streak, streakName, pos: victim.p });
    if (killer.streak >= 5 && streakName) sys('sys.streak', { name: killer.name, streak: streakName, n: killer.streak });
    sendRoster();
    if (M.teams ? teamScore[killer.team] >= KILL_LIMIT : killer.kills >= KILL_LIMIT) endMatch(killer);
  }

  function endMatch(winner, forceTeam = null) {
    if (match.state !== 'playing') return;
    const board = roster().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    let winTeam = null;
    if (M.teams) {
      winTeam = forceTeam || (winner?.team) || (teamScore.A === teamScore.B ? null : teamScore.A > teamScore.B ? 'A' : 'B');
      winner = null;
    } else winner = winner || players.get(board[0]?.id);
    match.state = 'ended';
    match.winner = winner ? winner.id : null;
    match.endsAt = Date.now() + 10000;
    broadcast({ t: 'match', state: 'ended', winner: match.winner, winnerName: winner?.name, winTeam, teamScore: M.teams ? teamScore : null, board, next: match.endsAt, mode });
    // Hand the results to the host (server.js pays rewards); humans only
    opts.onMatchEnd?.(humans().map((p) => ({ player: p, name: p.name, kills: p.kills, deaths: p.deaths, heads: p.heads, won: M.teams ? !!winTeam && p.team === winTeam : p.id === match.winner })));
  }

  function newMatch() {
    chestSystem.reset();
    if (M.teams) {
      // Team modes go back to the lobby; everyone readies up again
      match.state = 'lobby';
      for (const p of players.values()) { p.ready = false; p.alive = false; }
      broadcast({ t: 'match', state: 'lobby', mode });
      sendRoster();
      sendLobby();
      return;
    }
    match.state = 'playing';
    match.winner = null;
    match.endsAt = Date.now() + MATCH_SECONDS * 1000;
    vehicles.resetAll(); for (const p of players.values()) { p.kills = 0; p.deaths = 0; p.heads = 0; p.hasDropped=false; spawn(p); }
    broadcast({ t: 'match', state: 'playing', endsAt: match.endsAt });
    sendRoster();
    sys('sys.newRound', { n: KILL_LIMIT });
  }

  // ---------- pickups ----------
  const itemState = () => items.map((it) => [it.id, it.type, it.p, Date.now() >= it.readyAt ? 1 : 0]);
  // Your own armor, boosts and special weapon (times as milliseconds left)
  function sendBuffs(p) {
    const now = Date.now();
    // Gear levels follow the points: a vest or helmet with nothing left is gone; armor from other sources shows a vest
    p.vestLvl = vestLevelOf(p.armor); // the level shown follows what is left (a worn level-3 vest reads as 2, then 1)
    p.helmetLvl = helmetLevelOf(p.helmet || 0);
    send(p, { t: 'buffs', inventory:[...p.inventory], helmet: Math.round(p.helmet||0), helmetLvl: p.helmetLvl, vestLvl: p.vestLvl, armor: Math.round(p.armor), speed: Math.max(0, p.speedUntil - now), power: Math.max(0, p.powerUntil - now),
      special: p.special ? { w: p.special.w, ms: p.special.until - now, ammo: p.ammo[p.special.w] } : null });
  }
  // Apply a pickup; false leaves it on the map (e.g. full health walking over a heart)
  function takePickup(p, type, now) {
    if (type === 'heart') { if (p.hp >= PLAYER.maxHp) return false; p.hp = Math.min(PLAYER.maxHp, p.hp + BUFF.heartHp); send(p, { t: 'heal', hp: p.hp }); }
    else if (type === 'armor') { if (p.armor >= BUFF.armorMax) return false; p.armor = Math.min(BUFF.armorMax, p.armor + BUFF.armorAdd); }
    else if (type === 'speed') p.speedUntil = now + BUFF.speedMs;
    else if (type === 'power') p.powerUntil = now + BUFF.powerMs;
    else if (type === 'ammo') { refill(p); if (p.special?.w === 'rpg' && now < p.special.until) p.ammo.rpg = WEAPONS.rpg.rockets; send(p, { t: 'refill', ammo: p.ammo }); } // 0.16.36: green ammo tops up every owned gun + active RPG
    else if (type === 'rpg') { const w = WEAPONS.rpg; p.special = { w: 'rpg', until: now + w.seconds * 1000 }; p.ammo.rpg = w.rockets; }
    else if (String(type).startsWith('gun:')) { const w = type.slice(4); if (!WEAPONS[w] || WEAPONS[w].pickupOnly) return false; if (p.inventory.has(w) && p.ammo[w] >= WEAPONS[w].mag) return false; p.inventory.add(w); p.ammo[w] = WEAPONS[w].mag; if (p.weapon === UNARMED || !p.inventory.has(p.weapon)) p.weapon = w; send(p, { t: 'ammo', w, n: p.ammo[w], equip: p.weapon === w }); sendBuffs(p); return true; }
    else return false;
    sendBuffs(p);
    return true;
  }

  // ---------- bots ----------
  // 0.16.37: human-feel personas — each bot gets its own tactics, pace and reaction time.
  const PERSONAS = [
    { persona: 'rusher', aggro: 0.9, speedMul: 1.1, reactMul: 0.8, coverHp: 25 },
    { persona: 'flanker', aggro: 0.65, speedMul: 1.05, reactMul: 0.95, coverHp: 45 },
    { persona: 'defender', aggro: 0.35, speedMul: 0.9, reactMul: 1.1, coverHp: 70 },
    { persona: 'sniper', aggro: 0.2, speedMul: 0.85, reactMul: 1.25, coverHp: 60 },
  ];
  let personaN = Math.floor(Math.random() * PERSONAS.length);
  function botPersona() { const p = PERSONAS[(personaN++) % PERSONAS.length]; return { ...p, speedMul: p.speedMul * (0.92 + Math.random() * 0.16), reactMul: p.reactMul * (0.85 + Math.random() * 0.3) }; }
  // Next waypoint toward a goal: go straight if the path is clear, else the visible waypoint that gets closest to it (no wall-hugging).
  function routeToward(b, goal) {
    if (lineOfSight(b.p, [goal[0], goal[1], goal[2]]) && Math.abs(goal[1] - b.p[1]) < 1.5) return goal;
    let best = null, bs = Infinity;
    for (const w of MAP.waypoints || []) {
      const dw = Math.hypot(w[0] - b.p[0], w[2] - b.p[2]); if (dw < 2) continue;
      if (!lineOfSight(b.p, w)) continue;
      const sc = Math.hypot(w[0] - goal[0], w[2] - goal[2]) + dw * 0.35;
      if (sc < bs) { bs = sc; best = w; }
    }
    return best || goal;
  }
  // A nearby spot the threat cannot see (cover), preferring short runs.
  function coverSpot(b, threat) {
    let best = null, bs = Infinity;
    for (const w of MAP.waypoints || []) {
      const dw = Math.hypot(w[0] - b.p[0], w[2] - b.p[2]); if (dw < 2 || dw > 18) continue;
      if (lineOfSight(threat.p, w)) continue;
      if (dw < bs) { bs = dw; best = w; }
    }
    return best;
  }
  // Called when a bot is hit: flinch, turn to the shooter, take cover or push depending on persona.
  function botHurt(b, attacker) {
    const ai = b.ai, now = Date.now(); if (!ai || !attacker || attacker === b) return;
    ai.target = attacker.id; ai.seenAt = now; ai.hurtAt = now; ai.lastFoe = [...attacker.p];
    ai.reactAt = Math.min(ai.reactAt || now, now + 250 * ai.reactMul);
    const low = b.hp + b.armor < ai.coverHp + 40;
    if (low || Math.random() > ai.aggro) { const c = coverSpot(b, attacker); if (c) { ai.mode = 'cover'; ai.coverWp = c; ai.modeT = 1.4 + Math.random() * 1.2; return; } }
    ai.mode = 'strafe'; ai.modeT = 0.8 + Math.random() * 0.6; ai.sideBias = -ai.sideBias;
  }
  const BOT_NAMES = ['Neon', 'Blitz', 'Turbo', 'Pixel', 'Robo', 'Shadow', 'Spark', 'Comet', 'Galaxy', 'Rainbow'];
  function balanceBots() {
    const total = players.size;
    const bots = [...players.values()].filter((p) => p.bot);
    const want = humans().length ? Math.max(0, config.bots - humans().length) : 0;
    if (bots.length < want && total < MAX_PLAYERS && humans().length > 0) {
      const used = new Set(bots.map((b) => b.name));
      const name = '🤖 ' + (BOT_NAMES.find((n) => !used.has('🤖 ' + n)) || 'Bot' + nextId);
      newPlayer(name, true).character = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
      sendRoster();
    } else if (bots.length > want) {
      const b = bots[bots.length - 1];
      players.delete(b.id);
      broadcast({ t: 'leave', id: b.id });
      sendRoster();
    }
  }

  function lineOfSight(a, b) {
    const o = [a[0], a[1] + PLAYER.eye, a[2]];
    const tgt = [b[0], b[1] + 1.2, b[2]];
    const d = [tgt[0] - o[0], tgt[1] - o[1], tgt[2] - o[2]];
    const dist = Math.hypot(d[0], d[1], d[2]);
    d[0] /= dist; d[1] /= dist; d[2] /= dist;
    return rayWorld(o, d, MAP.boxes, dist) >= dist - 0.01;
  }

  // Natural bot movement: stable combat modes with long timers, turn-then-move wandering,
  // walk/run pace, and staged unstick (sidestep -> new waypoint -> jump).
  const wrapA = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
  function pickCombatMode(ai, dist) {
    const r = Math.random();
    const ag = ai.aggro ?? 0.5;
    ai.mode = dist > 22 ? 'approach' : dist < 6 ? (ag > 0.7 ? 'circle' : 'retreat') : r < 0.45 * (1 - ag) + 0.1 ? 'hold' : r < 0.75 ? (ai.persona === 'flanker' ? 'flank' : 'circle') : 'approach';
    ai.modeT = 2 + Math.random() * 2;
    if (Math.random() < 0.25) ai.sideBias = -ai.sideBias;
  }
  // 0.16.26: driving bots — drive toward fight/waypoint, leave near enemies or when the car is hurt.
  function botDrive(b, dt) {
    const ai = b.ai, now = Date.now();
    const car = vehicles._cars.find((c) => c.driver === b.id);
    if (!car) { b.vehicle = null; return; }
    let foe = null, fd = Infinity;
    for (const o of players.values()) {
      if (o === b || !o.alive || now < o.protectUntil) continue;
      const d = Math.hypot(o.p[0] - b.p[0], o.p[2] - b.p[2]);
      if (d < 45 && d < fd && lineOfSight(b.p, o.p)) { foe = o; fd = d; }
    }
    if (foe) { ai.target = foe.id; ai.seenAt = now; ai.lastFoe = [foe.p[0], foe.p[2]]; }
    const goal = foe ? [foe.p[0], foe.p[2]] : (ai.lastFoe && now - ai.seenAt < 4000) ? ai.lastFoe : ai.wp ? [ai.wp[0], ai.wp[2]] : [0, 0];
    const arrived = !foe && Math.hypot(goal[0] - car.p[0], goal[1] - car.p[1]) < BOT_DRIVE.arriveR && now - (ai.carAt || 0) > 6000;
    const cooldown = now - (ai.carAt || 0) < BOT_DRIVE.cooldownMs;
    if (shouldExitCar({ hpFrac: car.hp / CAR_HP.max, wrecked: car.wrecked, enemyDist: fd, enemyVisible: !!foe, arrived, cooldown })) {
      if (vehicles.interact(b)) { ai.carAt = now; ai.wp = null; ai.f = ai.s = 0; return; }
    }
    const fwd = [-Math.sin(car.yaw), 0, -Math.cos(car.yaw)];
    const clear = rayWorld([car.p[0], 0.8, car.p[2]], fwd, MAP.boxes.filter((x) => x !== car.box), 14);
    let { f, s } = wantDriveInput(car.yaw, car.p[0], car.p[2], goal[0], goal[1], clear);
    ai.dStuck = f > 0.2 && Math.abs(car.speed) < 1 ? (ai.dStuck || 0) + dt : Math.max(0, (ai.dStuck || 0) - dt);
    if (ai.dStuck > BOT_DRIVE.stuckS && !ai.revT) { ai.revT = BOT_DRIVE.reverseS; ai.dStuck = 0; ai.revN = (ai.revN || 0) + 1; if (ai.revN > 3 && vehicles.interact(b)) { ai.revN = 0; ai.carAt = now; ai.wp = null; return; } }
    if (Math.abs(car.speed) > 8) ai.revN = 0;
    if (ai.revT) { ai.revT = Math.max(0, ai.revT - dt); f = -0.8; s = ai.sideBias || 1; }
    if (!foe && ai.wp && Math.hypot(ai.wp[0] - car.p[0], ai.wp[2] - car.p[2]) < 8) ai.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)];
    const ease = (cur, want, rate) => cur + (want - cur) * Math.min(1, dt * rate);
    ai.f = ease(ai.f || 0, f, 3); ai.s = ease(ai.s || 0, s, 5);
    vehicles.input(b, ai.f, ai.s);
    b.yaw = car.yaw;
  }
  function botTryEnter(b, enemyNear) {
    const ai = b.ai, now = Date.now();
    if (now - (ai.carAt || 0) < BOT_DRIVE.cooldownMs || now < (ai.carRollAt || 0)) return false;
    ai.carRollAt = now + 1000;
    const car = vehicles._cars.find((c) => !c.driver && !c.wrecked && !c.owner && Math.hypot(c.p[0] - b.p[0], c.p[2] - b.p[2]) < BOT_DRIVE.enterR);
    if (!car) {
      // Walk over to a nearby free car now and then (or when the waypoint is far) so bots actually use cars.
      if (now < (ai.carSeekAt || 0) || ai.lootWp) return false;
      ai.carSeekAt = now + 4000;
      const far = !!ai.wp && Math.hypot(ai.wp[0] - b.p[0], ai.wp[2] - b.p[2]) > 40;
      if (!far && Math.random() > 0.3) return false;
      let best = null, bd = 28;
      for (const c of vehicles._cars) { if (c.driver || c.wrecked || c.owner) continue; const d = Math.hypot(c.p[0] - b.p[0], c.p[2] - b.p[2]); if (d < bd) { bd = d; best = c; } }
      if (best) { ai.wp = [best.p[0], 0, best.p[2]]; ai.stuck = 0; ai.pace = 1; ai.carWp = true; }
      return false;
    }
    const wpFar = ai.carWp || (!!ai.wp && Math.hypot(ai.wp[0] - b.p[0], ai.wp[2] - b.p[2]) > 40);
    if (!shouldEnterCar({ inVehicle: !!b.vehicle, enemyNear, car, dist: Math.hypot(car.p[0] - b.p[0], car.p[2] - b.p[2]), los: true, cooldown: false, wpFar, roll: Math.random() })) return false;
    if (vehicles.interact(b)) { ai.carAt = now; ai.carWp = false; ai.f = ai.s = 0; ai.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)]; return true; } // interact checks LOS itself
    return false;
  }
  // ---------- run over (GTA style) ----------
  // A car hitting someone on foot at speed hurts them (more the faster it goes) and knocks them flat. While
  // they are down they can't move; a car still standing on them keeps them pinned. Driving over a downed
  // player hurts again. They get up ~2.5 s after the last car has left them.
  const RUN = { minSpeed: 4, dmgPerMs: 5.5, maxDmg: 140, cooldownMs: 700, downMs: 2500, pinMs: 900, margin: 0.45 };
  function carOver(car, q) {
    const dx = q.p[0] - car.p[0], dz = q.p[2] - car.p[2], sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
    const along = -sy * dx - cy * dz, side = cy * dx - sy * dz;
    return Math.abs(along) < CAR_HALF.z + RUN.margin && Math.abs(side) < CAR_HALF.x + RUN.margin && Math.abs(q.p[1] - car.p[1]) < 1.6;
  }
  function runOverTick(now) {
    const cars = vehicles._cars || [];
    for (const q of players.values()) {
      if (!q.alive || q.vehicle || q.parachuting) continue;
      for (const car of cars) {
        if (car.wrecked || !carOver(car, q)) continue;
        if ((q.downUntil || 0) > now) q.downUntil = Math.max(q.downUntil, now + RUN.pinMs); // pinned under a car
        const driver = car.driver && players.get(car.driver);
        if (!driver || driver === q || Math.abs(car.speed) < RUN.minSpeed || now - (q.runHit || 0) < RUN.cooldownMs) continue;
        if (M.teams && driver.team && driver.team === q.team) continue;
        q.runHit = now;
        const wasDown = (q.downUntil || 0) > now;
        q.downUntil = now + RUN.downMs; q.stance = 2; q.v = [0, 0, 0];
        send(q, { t: 'knockdown', ms: RUN.downMs, by: driver.id });
        applyDamage(driver, q, Math.round(Math.min(RUN.maxDmg, Math.abs(car.speed) * RUN.dmgPerMs) * (wasDown ? 0.7 : 1)), false, 'car', [q.p[0], q.p[1] + 0.5, q.p[2]]);
      }
      if (q.downUntil && q.downUntil <= now) { q.downUntil = 0; send(q, { t: 'getUp' }); }
    }
  }

  function botThink(b, dt) {
    if ((b.downUntil || 0) > Date.now()) { b.stance = 2; return; } // knocked down by a car
    if (b.vehicle) return botDrive(b, dt);
    if (b.parachuting) return botParachute(b, dt);
    const ai = b.ai, now = Date.now();
    const input = { f: 0, s: 0, jump: false, yaw: b.yaw };
    let target = null, tDist = 45;
    // Loot: bots open crates and grab drops they reach, like the player does.
    const armed = bestOwned(b.inventory) !== UNARMED && bestOwned(b.inventory) !== 'knife';
    if (match.state === 'playing') {
      for (const d of chestSystem.dropState()) if ((d.kind === 'weapon' || d.kind === 'ammo') && Math.hypot(d.p[0] - b.p[0], d.p[2] - b.p[2]) < 2) chestSystem.pickup(b, d.id); // gear and meds stay for players
      for (const c of chestSystem.state()) if (!c.opened && Math.hypot(c.p[0] - b.p[0], c.p[2] - b.p[2]) < 2.6) chestSystem.open(b, c.id);
      if (!armed) {
        let best = null, bd = Infinity;
        for (const d of chestSystem.dropState()) if (d.kind === 'weapon') { const k = Math.hypot(d.p[0] - b.p[0], d.p[2] - b.p[2]); if (k < bd) { bd = k; best = d.p; } }
        for (const it of items) if (String(it.type).startsWith('gun:') && now >= it.readyAt && Math.abs(it.p[1] - b.p[1]) < 1.5) { const k = Math.hypot(it.p[0] - b.p[0], it.p[2] - b.p[2]); if (k < bd) { bd = k; best = it.p; } }
        if (!best) for (const c of chestSystem.state()) if (!c.opened) { const k = Math.hypot(c.p[0] - b.p[0], c.p[2] - b.p[2]); if (k < bd) { bd = k; best = c.p; } }
        if (best && (!ai.wp || ai.lootWp !== best)) { ai.wp = best; ai.lootWp = best; ai.stuck = 0; ai.pace = 1; }
      }
    }
    if (armed) for (const o of players.values()) {
      if (o === b || !o.alive || now < o.protectUntil) continue;
      const d = Math.hypot(o.p[0] - b.p[0], o.p[1] - b.p[1], o.p[2] - b.p[2]);
      const remembered = ai.target === o.id && now - ai.seenAt < 2000;
      if ((d < tDist || remembered) && lineOfSight(b.p, o.p)) { target = o; tDist = d; }
    }
    // Smooth input toward desired values so transitions never snap
    const ease = (cur, want, rate) => cur + (want - cur) * Math.min(1, dt * rate);
    let wantF = 0, wantS = 0;
    if (target) {
      if (ai.target !== target.id) { ai.reactAt = now + (D.react[0] + Math.random() * (D.react[1] - D.react[0])) * (ai.reactMul || 1); ai.aimErr = 0.3; ai.modeT = 0; }
      ai.target = target.id; ai.seenAt = now;
      const dx = target.p[0] - b.p[0], dz = target.p[2] - b.p[2];
      const dy = target.p[1] + 0.9 - (b.p[1] + PLAYER.eye);
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const dyaw = wrapA(wantYaw - b.yaw);
      b.yaw += dyaw * Math.min(1, dt * D.turn);
      b.pitch += (wantPitch - b.pitch) * Math.min(1, dt * D.turn);
      ai.aimErr = Math.max(D.aimMin, ai.aimErr - dt * D.aimTighten);
      ai.modeT -= dt;
      if (ai.modeT <= 0 || (ai.mode === 'approach' && tDist < 9) || (ai.mode === 'retreat' && tDist > 12)) pickCombatMode(ai, tDist);
      if (ai.mode === 'cover' && ai.coverWp) {
        // run to cover facing the threat (strafe/backpedal relative to aim)
        const cx = ai.coverWp[0] - b.p[0], cz = ai.coverWp[2] - b.p[2], cl = Math.hypot(cx, cz) || 1;
        const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
        wantF = cl > 1 ? (cx * fx + cz * fz) / cl : 0; wantS = cl > 1 ? (cx * rx + cz * rz) / cl : 0;
        if (cl < 1.2) { ai.mode = 'hold'; ai.modeT = 0.6 + Math.random(); }
      }
      else if (ai.mode === 'strafe') { wantF = 0.25; wantS = ai.sideBias; }
      else if (ai.mode === 'flank') {
        // others are on this target too → swing wide around the side, then close in
        const mates = [...players.values()].filter((o) => o.bot && o !== b && o.alive && o.ai?.target === target.id).length;
        wantF = mates ? 0.45 : 0.7; wantS = (mates ? 0.9 : 0.5) * ai.sideBias;
      }
      else if (ai.mode === 'approach') { wantF = tDist > 30 ? 1 : 0.6; wantS = 0.15 * ai.sideBias; }
      else if (ai.mode === 'retreat') { wantF = -0.55; wantS = 0.2 * ai.sideBias; }
      else if (ai.mode === 'circle') { wantF = 0; wantS = 0.4 * ai.sideBias; }
      else { wantF = 0; wantS = 0; } // hold: plant and shoot
      ai.pace = Math.abs(wantF) > 0.8 || ai.mode === 'cover' ? 1 : 0.5;
      ai.lastFoe = [...target.p];
      input.yaw = b.yaw;
      const pref = tDist < 7 ? 'shotgun' : tDist < 14 ? 'smg' : (b.id.charCodeAt(1) % 2 ? 'm4' : 'rifle');
      const wKey = b.inventory.has(pref) ? pref : bestOwned(b.inventory);
      if (wKey !== UNARMED && wKey !== 'knife' && b.ammo[wKey] <= 0 && now >= b.reloadUntil) { b.reloadUntil = now + WEAPONS[wKey].reload * 1000; b.ammo[wKey] = WEAPONS[wKey].mag; }
      if (wKey !== UNARMED && wKey !== 'knife' && now > ai.reactAt && Math.abs(dyaw) < 0.25) {
        const w = WEAPONS[wKey];
        const dirs = [];
        for (let i = 0; i < w.pellets; i++) {
          const err = ai.aimErr + w.spread;
          dirs.push(dirFromAngles(b.yaw + (Math.random() - 0.5) * err * 2, b.pitch + (Math.random() - 0.5) * err * 2));
        }
        fire(b, wKey, [b.p[0], b.p[1] + PLAYER.eye, b.p[2]], dirs);
      }
    } else {
      if (match.state === 'playing' && botTryEnter(b, false)) return;
      ai.mode = 'wander';
      const newWp = () => {
        ai.wp = MAP.waypoints[Math.floor(Math.random() * MAP.waypoints.length)]; ai.stuck = 0; ai.sideT = 0;
        const far = Math.hypot(ai.wp[0] - b.p[0], ai.wp[2] - b.p[2]);
        ai.pace = far > 35 || Math.random() < 0.2 ? 1 : 0.45 + Math.random() * 0.15;
      };
      if (ai.stuck > 1.1 && botEscape(b, ai)) return;
      // 0.16.37: always a goal — armed bots hunt (last seen foe, else the nearest human/fighter), routing via visible waypoints.
      if (armed && ai.wp !== ai.lootWp && match.state === 'playing') {
        let goal = ai.lastFoe && now - ai.seenAt < 6000 ? ai.lastFoe : null;
        if (!goal) { let gd = Infinity; for (const o of players.values()) { if (o === b || !o.alive) continue; const d = Math.hypot(o.p[0] - b.p[0], o.p[2] - b.p[2]) * (o.bot ? 1.6 : 1); if (d < gd) { gd = d; goal = o.p; } } }
        if (goal && (!ai.huntT || now > ai.huntT || ai.stuck > 0.5)) { ai.wp = routeToward(b, goal); ai.huntT = now + 700; ai.pace = 1; if (ai.stuck > 0.5) ai.stuck = 0.3; }
      }
      if (!ai.wp || (ai.wp !== ai.lootWp && Math.hypot(ai.wp[0] - b.p[0], ai.wp[2] - b.p[2]) < 1.5) || ai.stuck > 2.2) { ai.lootWp = null; newWp(); }
      const dx = ai.wp[0] - b.p[0], dz = ai.wp[2] - b.p[2];
      const dyaw = wrapA(Math.atan2(-dx, -dz) - b.yaw);
      b.yaw += dyaw * Math.min(1, dt * 4);
      b.pitch *= 0.9;
      // Turn first, then move; slow down while still turning
      wantF = Math.abs(dyaw) < 0.35 ? ai.pace : Math.abs(dyaw) < 1 ? 0.2 : 0;
      input.yaw = b.yaw;
      wantF *= ai.speedMul || 1;
      const speed = Math.hypot(b.v[0], b.v[2]);
      ai.stuck = wantF > 0.1 && speed < 1 ? ai.stuck + dt : Math.max(0, ai.stuck - dt);
      if (ai.stuck > 0.6) { if (!ai.sideT) ai.sideT = 0.6; wantS = ai.sideBias; wantF = 0.3; }
      if (ai.sideT) { ai.sideT -= dt; if (ai.sideT <= 0) ai.sideT = 0; }
      if (ai.stuck > 1.6) input.jump = true;
    }
    ai.f = ease(ai.f || 0, wantF, 4); ai.s = ease(ai.s || 0, wantS, 3);
    input.f = ai.f; input.s = ai.s;
    // 0.16.34: foot bots collide with walls again; smart door/window escape handles getting stuck.
    step(b, input, dt, MAP.boxes);
    clampBot(b);
  }
  // 0.16.34: bots parachute down from the plane like the player.
  function botParachute(b, dt) {
    const t = b.dropAt || [b.p[0], b.p[2]], dx = t[0] - b.p[0], dz = t[1] - b.p[2], d = Math.hypot(dx, dz);
    if (d > 1) { const m = Math.min(d, PARACHUTE.glideSpeed * dt); b.p[0] += dx / d * m; b.p[2] += dz / d * m; b.yaw = Math.atan2(-dx, -dz); }
    b.p[1] = Math.max(0, b.p[1] - PARACHUTE.sink * 4 * dt);
    if (b.p[1] <= 0.05 || collides(b.p[0], b.p[1] - 0.04, b.p[2], MAP.boxes, 0.04)) { b.parachuting = false; b.onGround = true; b.v = [0, 0, 0]; }
    clampBot(b);
  }
  // 0.16.34: smart escape - climb out of a window (like the player's E) or head for the building's entrance door.
  function botInside(b) {
    return (MAP.buildings || []).find((h) => Math.abs(b.p[0] - h.center[0]) < 6 && Math.abs(b.p[2] - h.center[2]) < 6);
  }
  function botEscape(b, ai) {
    for (let k = 0; k < 8; k++) {
      const yaw = b.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 4;
      const land = findVault(b.p, yaw, MAP.boxes, MAP.bounds);
      if (land) { b.p = land; b.v = [0, 0, 0]; b.yaw = yaw; ai.stuck = 0; ai.wp = null; ai.vaults = (ai.vaults || 0) + 1; return true; }
    }
    const h = botInside(b);
    if (h) {
      const out = [h.door[0], 0, h.door[2] - 3];
      ai.wp = b.p[1] > 1 ? [h.center[0], 0, h.center[2]] : (Math.abs(b.p[2] - h.door[2]) < 1.5 ? out : [h.door[0], 0, h.door[2] + 1]);
      ai.doorWp = out; ai.stuck = 0; ai.sideT = 0; ai.pace = 1;
    }
    return false;
  }
  function clampBot(b) {
    const B = (MAP.bounds || 31) - 1;
    b.p[0] = Math.max(-B, Math.min(B, b.p[0])); b.p[2] = Math.max(-B, Math.min(B, b.p[2]));
  }


  // ---------- connections ----------
  function connect(ws) {
    let me = null;
    function message(data) {
      let m;
      try { m = JSON.parse(data); } catch { return; }
      if (!m || typeof m.t !== 'string') return;

      if (m.t === 'join' && !me) {
        if (humans().length >= MAX_PLAYERS || (M.teams && !smallerTeam())) { ws.send(JSON.stringify({ t: 'full' })); ws.close(); return; }
        // Make room by removing a bot if the arena is full
        if (players.size >= MAX_PLAYERS) {
          const bot = [...players.values()].find((p) => p.bot);
          if (bot) { players.delete(bot.id); broadcast({ t: 'leave', id: bot.id }); }
        }
        me = newPlayer(cleanName(m.name));
        me.character = characterById(m.character).id;
        // 0.16.13: drop zone picked on the mini-map before the match (city map, first drop only).
        if(Array.isArray(m.drop)&&m.drop.length===2&&m.drop.every(Number.isFinite))me.dropAt=m.drop.map(n=>Math.max(-95,Math.min(95,n)));
        // Equipped cosmetics, already validated by the server's economy service
        me.cosmetics = {};
        for (const slot of ['outfit', 'camo']) if (typeof m.cosmetics?.[slot] === 'string' && itemById(m.cosmetics[slot])?.slot === slot) me.cosmetics[slot] = m.cosmetics[slot];
        me.ws = ws;
        // Rejoining after a drop: the server passes back the saved score and team
        const back = m.restore && typeof m.restore === 'object' ? m.restore : null;
        if (back) { me.kills = back.kills | 0; me.deaths = back.deaths | 0; me.heads = back.heads | 0; }
        if (M.teams) assignTeam(me, back && (back.team === 'A' || back.team === 'B') && teamOf(back.team).length < M.perTeam ? back.team : smallerTeam());
        send(me, { t: 'welcome', map: MAP.id || 'city', id: me.id, color: me.color, match: { state: match.state, endsAt: match.endsAt }, killLimit: KILL_LIMIT, quick: QUICK_CHAT, mode, team: me.team, difficulty, items: itemState() });
        send(me,{t:'vehicles',vehicles:vehicles.state()});
        send(me,{t:'chests',chests:chestSystem.state(),drops:chestSystem.dropState()});
        sendRoster();
        sys('sys.joined', { name: me.name });
        if (match.state === 'playing') spawn(me);
        if (M.teams) checkStart();
        return;
      }
      if (!me) return;

      switch (m.t) {
        case 'summonVehicle':if(match.state==='playing')vehicles.summon(me,String(m.kind||''));break;
        case 'dash':{const n=Date.now();if(me.alive&&!me.vehicle&&n-(me.dashAt||0)>PLAYER.dashCooldown*900){me.dashAt=n;me.dashUntil=n+600;}break;}
        case 'vault':{if(match.state!=='playing'||!me.alive||me.vehicle||me.parachuting)break;const land=findVault(me.p,me.yaw,MAP.boxes,MAP.bounds);if(land){me.p=land;me.v=[0,0,0];me.lastState=Date.now();send(me,{t:'correct',p:land});}break;}
        case 'vehicleInteract':if(match.state==='playing'&&!((me.downUntil||0)>Date.now()))vehicles.interact(me);break;
        case 'drive':vehicles.input(me,m.f,m.s,m.h);break;
        case 'horn':{const now=Date.now();if(!me.vehicle||now-(me.hornAt||0)<600)break;me.hornAt=now;broadcast({t:'horn',id:me.vehicle});break;} // GTA horn, heard by everyone
        case 'state': {
          if(me.vehicle)return;
          if ((me.downUntil || 0) > Date.now()) { if (Number.isFinite(m.yaw)) me.yaw = m.yaw; if (Number.isFinite(m.pitch)) me.pitch = m.pitch; me.stance = 2; return; } // knocked down: can look, can't move
          { // at most ~40 position updates a second (the client sends 20): floods can't add up the per-update tolerance
            const t0 = Date.now(); if (t0 - (me.stateWin || 0) > 1000) { me.stateWin = t0; me.stateN = 0; }
            if (++me.stateN > 40) return;
          }
          if (!me.alive || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
          if(!insideMap(m.p,me.parachuting?(MAP.dropBounds??MAP.bounds):MAP.bounds,me.parachuting)){send(me,{t:'correct',p:me.p});return;}
          const now = Date.now();
          const dt = Math.min(0.5, (now - me.lastState) / 1000);
          me.lastState = now;
          // Speed sanity check: horizontal and vertical budgets with generous tolerance
          const dh = Math.hypot(m.p[0] - me.p[0], m.p[2] - me.p[2]);
          const dv = Math.abs(m.p[1] - me.p[1]);
          const boost = now < me.speedUntil + 500 ? BUFF.speedMul : 1; // speed pickup
          const dashK = now < (me.dashUntil || 0) ? PLAYER.dashSpeed / PLAYER.speed / 1.2 : 1; // 0.16.14 slide-dash window
          const chute = me.parachuting ? 3 : 1; // 0.16.20: glide/drop is faster than walking — don't snap parachuters back (stalled landing)
          // Free fall drops up to ~58 m/s (GTA-style skydive): allow fast falls, only downward, only while parachuting
          const fall = me.parachuting && m.p[1] < me.p[1] ? PARACHUTE.freefall.dive * 1.3 * dt + 1 : 0;
          const slack = Math.min(1, dt / 0.05); // the fixed jitter allowance shrinks for updates sent faster than 20/s
          if (dh > PLAYER.speed * 1.6 * boost * dashK * chute * dt + 0.6 * slack || (dv > 14 * chute * dt + 0.8 * slack && dv > fall)) {
            send(me, { t: 'correct', p: me.p });
            return;
          }
          const nextStance = [0, 1, 2].includes(m.st) ? m.st : me.stance;
          // Do not accept a client position or movement path through solid geometry.
          if (!clearMovement(me.p, m.p, MAP.boxes, stanceOf(Math.min(me.stance, nextStance)).height)) {
            send(me, { t: 'correct', p: me.p });
            return;
          }
          if (me.parachuting && m.pc === 2) me.chuteOpen = true; // canopy open: others see it
          if(me.parachuting && (m.p[1]<=0.05 || collides(m.p[0],m.p[1]-0.04,m.p[2],MAP.boxes,0.04))){
            me.parachuting=false;send(me,{t:'landed'});
          }
          me.p = m.p;
          if (Number.isFinite(m.yaw)) me.yaw = m.yaw;
          if (Number.isFinite(m.pitch)) me.pitch = Math.max(-1.55, Math.min(1.55, m.pitch));
          me.aiming = m.a === 1; // weapon raised (aiming): other players see the gun come up
          if (WEAPONS[m.w] && (me.inventory.has(m.w)||me.special?.w===m.w)) me.weapon = m.w;
          // Stance: crouching or lying down is always allowed; getting up needs headroom
          if (m.st === 0 || m.st === 1 || m.st === 2) {
            if (m.st >= me.stance || canStance(me.p, m.st, MAP.boxes)) me.stance = m.st;
          }
          break;
        }
        case 'pickupLoot':if(match.state==='playing')chestSystem.pickup(me,m.id);break;
        case 'openChest':
          if(match.state==='playing')chestSystem.open(me,m.id);
          break;
        case 'shoot':
          if (WEAPONS[m.w]?.melee) break;
          fire(me, m.w, m.o, m.dirs);
          break;
        case 'throwKnife':
          throwKnife(me, m.yaw, m.pitch);
          break;
        case 'melee':
          melee(me, m.yaw, m.pitch);
          break;
        case 'team': {
          // Switch team in the lobby, if the other team has room
          if (!M.teams || match.state !== 'lobby' || (m.team !== 'A' && m.team !== 'B') || m.team === me.team) break;
          if (teamOf(m.team).length >= M.perTeam) break;
          assignTeam(me, m.team);
          sendRoster();
          checkStart();
          break;
        }
        case 'ready':
          if (!M.teams || match.state !== 'lobby') break;
          me.ready = !!m.v;
          sendRoster();
          checkStart();
          break;
        case 'reload': {
          const w = WEAPONS[m.w];
          if (!w || !me.inventory.has(m.w) || w.pickupOnly || !me.alive || Date.now() < me.reloadUntil || me.ammo[m.w] >= w.mag) return;
          me.reloadUntil = Date.now() + w.reload * 1000 * 0.9;
          setTimeout(() => { if (players.has(me.id)) { me.ammo[m.w] = w.mag; send(me, { t: 'ammo', w: m.w, n: w.mag }); } }, w.reload * 1000 * 0.9);
          break;
        }
        case 'mapPing': { // 0.16.27 minimap long-press ping
          const x = Number(m.x), z = Number(m.z);
          if (!Number.isFinite(x) || !Number.isFinite(z)) break;
          const B = MAP.bounds || 31, cx = Math.max(-B, Math.min(B, x)), cz = Math.max(-B, Math.min(B, z));
          broadcast({ t: 'mapPing', id: me.id, name: me.name, x: cx, z: cz, until: Date.now() + 8000 });
          break;
        }
        case 'ping':
          send(me, { t: 'pong', c: m.c });
          break;
        case 'rtt':
          if (Number.isFinite(m.v)) me.rtt = Math.max(0, Math.min(1000, m.v));
          break;
        case 'chat':
          onChat(me, m.text);
          break;
        case 'quick':
          if (Number.isInteger(m.i) && QUICK_CHAT[m.i]) onChat(me, '', true, m.i);
          break;
        case 'rtc': {
          // Voice chat handshake (WebRTC offer/answer/ICE) relayed between two humans; the audio itself goes device to device
          const to = players.get(m.to);
          const now = Date.now();
          if (now - (me.rtcWindow || 0) > 1000) { me.rtcWindow = now; me.rtcCount = 0; }
          if (!to || to.bot || to === me || !m.data || typeof m.data !== 'object' || ++me.rtcCount > 40) break;
          if (JSON.stringify(m.data).length > 12000) break;
          send(to, { t: 'rtc', from: me.id, data: m.data });
          break;
        }
        case 'report': {
          const target = [...players.values()].find((p) => p.name === String(m.name || ''));
          console.log(`[REPORT] ${me.name} reported ${target ? target.name : m.name}: ${String(m.reason || '').slice(0, 100)}`);
          tell(me, 'sys.reportOk');
          break;
        }
      }
    }

    function close() {
      if (!me) return;
      vehicles.free(me.id);
      players.delete(me.id);
      broadcast({ t: 'leave', id: me.id });
      sys('sys.left', { name: me.name });
      sendRoster();
      if (M.teams) {
        // A team emptied mid-match: give it 20 s to reconnect, then the other side wins
        if (match.state === 'playing') {
          setTimeout(() => {
            if (match.state === 'playing' && (teamOf('A').length === 0 || teamOf('B').length === 0)) endMatch(null, teamOf('A').length ? 'A' : 'B');
          }, opts.forfeitMs ?? 20000);
        } else checkStart();
      }
    }
    return { message, close, player: () => me };
  }

  function onChat(p, text, quick = false, quickIndex = -1) {
    const now = Date.now();
    if (now < p.mutedUntil) { tell(p, 'sys.muted'); return; }
    p.chatTimes = p.chatTimes.filter((t) => now - t < 5000);
    if (p.chatTimes.length >= 4) { tell(p, 'sys.slowDown'); return; }
    p.chatTimes.push(now);
    const { text: clean, flagged } = quick ? { text: 'q', flagged: false } : filterChat(text);
    if (!clean) return;
    if (flagged) {
      // Graduated enforcement (GDD §13): warning, then a temporary mute
      p.strikes++;
      if (p.strikes >= 3) { p.mutedUntil = now + 60000; p.strikes = 0; tell(p, 'sys.mutedMinute'); }
      else tell(p, 'sys.warning', { n: p.strikes });
    }
    // Quick messages travel as an index so each player reads them in their language
    broadcast(quick ? { t: 'chat', from: p.id, name: p.name, color: p.color, q: quickIndex, quick: true } : { t: 'chat', from: p.id, name: p.name, color: p.color, text: clean });
  }

  // ---------- main loop ----------
  let last = Date.now(), timer = null;
  function start() {
    if (timer) return;
    last = Date.now();
    timer = setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tick++;

    if (match.state === 'lobby' && match.countdownAt && now >= match.countdownAt) startTeamMatch();
    if (match.state === 'playing' && now >= match.endsAt) endMatch(null);
    if (match.state === 'ended' && now >= match.endsAt) newMatch();
    if (tick % 15 === 0) balanceBots();

    for (const p of players.values()) {
      if (!p.alive) {
        if (match.state === 'playing' && now >= p.respawnAt) spawn(p);
        continue;
      }
      if (p.bot) botThink(p, dt);
      if (p.special && now >= p.special.until) { p.special = null; delete p.ammo.rpg; if (p.weapon === 'rpg') p.weapon = bestOwned(p.inventory); sendBuffs(p); }
      for (const it of items) {
        if (now < it.readyAt || Math.hypot(p.p[0] - it.p[0], p.p[2] - it.p[2]) > 1.3 || Math.abs(p.p[1] - it.p[1]) > 1.6) continue;
        if (takePickup(p, it.type, now)) { it.readyAt = now + respawnOf(it.type) * 1000; broadcast({ t: 'items', items: itemState(), took: { id: it.id, by: p.id, type: it.type } }); }
      }
      // Auto-pickup crate loot: walking over it collects it (no E needed)
      if (match.state === 'playing' && !p.bot) for (const d of chestSystem.dropState()) if (Math.hypot(d.p[0] - p.p[0], d.p[2] - p.p[2]) < 1.3 && Math.abs(p.p[1] - d.p[1]) < 1.6 && !(d.kind === 'heal' && p.hp > PLAYER.maxHp - 40)) chestSystem.pickup(p, d.id); // walking over a medkit at nearly full health leaves it (E still takes it)
      // Health regen after 5 s out of combat
      if (now - p.lastHurt > 5000 && p.hp < PLAYER.maxHp) p.hp = Math.min(PLAYER.maxHp, p.hp + 30 * dt);
      p.history.push({ t: now, p: [p.p[0], p.p[1], p.p[2]] });
      while (p.history.length && now - p.history[0].t > 1000) p.history.shift();
    }

    vehicles.tick(dt);
    runOverTick(now);
    stepKnives(dt);
    if ((tick % SNAP_EVERY === 0 || vehicles.driving?.()) && players.size) { // 0.16.22: 30 Hz while someone drives
      broadcast({t:'vehicles',vehicles:vehicles.state()});
      broadcast({
        t: 'snap', now,
        players: [...players.values()].filter((p) => p.alive).map((p) => ({
          id: p.id, parachuting: p.parachuting ? (p.chuteOpen || p.bot ? 2 : 1) : 0 /* 1 free fall, 2 under canopy */, vehicle:p.vehicle||null, p: p.p.map((n) => Math.round(n * 100) / 100), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), w: p.weapon, hp: Math.ceil(p.hp), sp: now < p.protectUntil ? 1 : 0, st: p.stance,
          g: packGear(p), a: p.aiming || now - (p.lastFire || 0) < 1500 || (p.bot && p.ai?.target && now - p.ai.seenAt < 1500) ? 1 : 0, // visible gear; weapon raised
        })),
      });
    }
    }, TICK * 1000);
  }

  function stop() { clearInterval(timer); timer = null; }
  const humanCount = () => humans().length;
  // ---------- admin hooks ----------
  // These only perform actions. Who may call them is decided in server.js.
  const admin = {
    players: () => [...players.values()],
    find: (name) => [...players.values()].find((p) => p.name.toLowerCase() === String(name || '').toLowerCase()),
    heal(p, n) {
      if (!p.alive) return false;
      p.hp = Math.min(PLAYER.maxHp, p.hp + n);
      tell(p, 'admin.healed', { n });
      return true;
    },
    setHealth(p, n) {
      if (!p.alive) return false;
      p.hp = Math.max(1, Math.min(PLAYER.maxHp, n));
      return true;
    },
    giveWeapon(p, w) {
      if (!WEAPONS[w] || !p.alive) return false;
      p.inventory.add(w);sendBuffs(p);
      p.ammo[w] = WEAPONS[w].mag;
      p.reloadUntil = 0;
      send(p, { t: 'ammo', w, n: WEAPONS[w].mag });
      return true;
    },
    // dest: [x, y, z]; refused if it would put the player inside a wall or off the map
    teleport(p, dest) {
      if (!p.alive || !Array.isArray(dest) || !dest.every(Number.isFinite)) return false;
      if (Math.abs(dest[0]) > (MAP.bounds||31) || Math.abs(dest[2]) > (MAP.bounds||31) || dest[1] < 0 || dest[1] > 10) return false;
      if (collides(dest[0], dest[1], dest[2], MAP.boxes)) return false;
      p.p = dest.slice();
      p.v = [0, 0, 0];
      p.history = [];
      send(p, { t: 'correct', p: p.p });
      return true;
    },
    announce: (text) => sys('admin.announce', { text }),
  };

  return { connect, start, stop, humanCount, config, admin, mode };
}
