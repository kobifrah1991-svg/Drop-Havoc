import * as THREE from 'three';
import {createParachute,swayParachute} from './parachute-visuals.js';
import { createChestVisuals } from './chest-visuals.js';
import { createWorldLoot } from './world-loot.js';
import { mountRooms } from './room-browser.js';
import { createVehicleVisuals } from './vehicle-visuals.js';
import { vehiclePrompts } from './shared/vehicles.js';
let lastDrive='';
import { MAP } from './shared/map.js';
import { WEAPONS, WEAPON_ORDER, LOADOUT } from './shared/weapons.js';
import { PLAYER, step, rayBox, rayWorld, hitboxes, dirFromAngles, stanceOf, canStance, findVault } from './shared/physics.js';
import { buildArena, animateArena, setupLighting, buildCharacter, buildGun, registerCharacters, loadCharacter, loadAnimations, characterLoaded, buildSoldier, soldierReady, animate, loadWeapons, muzzleDistance, setHold, buildFirstPerson, updateFirstPerson } from './visuals.js';
import { CHARACTERS, characterById } from './shared/characters.js';
import { t, LANGS, getLang, setLang, detectLang } from './shared/i18n.js';
import { SHOP, SLOTS } from './shared/shop.js';
import { P2PHostSocket, P2PGuestSocket, p2pErrorKey, validCode } from './p2p.js';
import { createVoice } from './voice.js';
import { ONLINE_SERVERS } from './shared/servers.js';
import {GAME_PROTOCOL} from './shared/protocol.js';
import { BRAND } from './shared/brand.js';
import { applyLook, viewButtonAction } from './shared/car-look.js';
const carLook = { yaw: 0, pitch: 0 };
import { canSlide, slideRecoverStance } from './shared/physics.js';
import { minimapVisible, minimapMarkers, drawMinimap, landmarks as mmLandmarks, MINIMAP_HZ, unproject as mmToWorld } from './shared/minimap.js';
import { checkForUpdate, APP_VERSION } from './update-check.js';
const gunModel = (key, scale, camo) => buildGun(key, WEAPONS[key].color, scale, camo);

const $ = (id) => document.getElementById(id);
const lootButton=document.createElement('button');lootButton.id='loot-interact';lootButton.hidden=true;
lootButton.style.cssText='position:fixed;left:50%;bottom:34%;transform:translateX(-50%);z-index:25;padding:12px 22px;background:#112b42e8;border:1px solid #61ceff;border-radius:10px;color:white;font:600 16px Arial;cursor:pointer';
const enterBtn=document.createElement('button');enterBtn.id='t-enter';enterBtn.hidden=true;document.body.append(enterBtn);
function carInteract(){if(me.vehicle||vehicleVisuals.nearby(me.p,me.id)){net({t:'vehicleInteract'});return true;}return false;}
enterBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();carInteract();});
lootButton.onclick=()=>{const c=chestVisuals.nearest(me.p);if(me.vehicle||vehicleVisuals.nearby(me.p,me.id))net({t:'vehicleInteract'});else if(worldLoot.nearest(me.p))net({t:'pickupLoot',id:worldLoot.nearest(me.p).id});else if(c)net({t:'openChest',id:c.id});else if(findVault(me.p,me.yaw,MAP.boxes,MAP.bounds))net({t:'vault'});};document.body.append(lootButton);
const store = {
  get(k, d) { try { const v = localStorage.getItem('arena.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('arena.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ======================= renderer & world =======================
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.autoClear = false;
renderer.localClippingEnabled = true; // first-person body: only the arms are drawn
const scene = new THREE.Scene();
const chestVisuals=createChestVisuals(scene);
const worldLoot=createWorldLoot(scene,gunModel);
const vehicleVisuals=createVehicleVisuals(scene,MAP.boxes,{hideDriver:(id)=>id===me.id,driverFor:(id)=>{
  // 0.16.4: the driver's own selected character does the GTA enter/exit (works for every selectable character)
  if(!soldierReady())return null;let info=id===me.id?{color:me.color,character:selectedChar,cosmetics:roster.find(p=>p.id===me.id)?.cosmetics}:remotes.get(id)?.info;if(!info)return null;
  const c=buildSoldier(info.color,charSeed++,info.character,info.cosmetics||{});return {root:c.root,char:c};}});
const camera = new THREE.PerspectiveCamera(78, 1, 0.12, 1200);
const shadows = !isTouch; // phones skip shadow maps to keep 60 fps
if(!store.get('timeReset01618',false)){store.set('time','day');store.set('timeReset01618',true);} // 0.16.18: back to day sky for everyone once
setupLighting(scene, renderer, { shadows, mode: store.get('time', 'day') });
buildArena(scene, MAP.boxes, { shadows });

// Viewmodel: rendered in its own pass so guns never clip into walls
const vmScene = new THREE.Scene();
const vmCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3a2a50, 2.2));
const vmLight = new THREE.DirectionalLight(0xffffff, 1);
vmLight.position.set(1, 2, 1);
vmScene.add(vmLight);


const viewGuns = {};
const vmRoot = new THREE.Group();
vmScene.add(vmRoot);
for (const k of WEAPON_ORDER) { viewGuns[k] = gunModel(k); viewGuns[k].visible = false; vmRoot.add(viewGuns[k]); }
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 }));
flash.visible = false;
vmScene.add(flash);
const flashLight = new THREE.PointLight(0xffd27a, 0, 8);
scene.add(flashLight);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = vmCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  vmCamera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ======================= audio (synthesised, no assets) =======================
let actx = null, noise = null;
function initAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume?.(); return; } // 0.16.27: wake audio after backgrounding (engine went silent)
  actx = new (window.AudioContext || window.webkitAudioContext)();
  noise = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
const SHOT_SOUND = { rifle: [2200, 0.12, 120], shotgun: [900, 0.3, 70], sniper: [1500, 0.45, 55], pistol: [2800, 0.1, 160] };
function shotSound(w, vol = 1) {
  if (!actx || vol < 0.02) return;
  const [freq, dur, thump] = SHOT_SOUND[w] || SHOT_SOUND.rifle;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = noise;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(200, t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(0.5 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(actx.destination);
  src.start(t, Math.random() * 0.5, dur + 0.05);
  const o = actx.createOscillator(); o.frequency.setValueAtTime(thump, t); o.frequency.exponentialRampToValueAtTime(30, t + dur * 0.8);
  const og = actx.createGain(); og.gain.setValueAtTime(0.6 * vol, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
  o.connect(og).connect(actx.destination); o.start(t); o.stop(t + dur);
}
function blip(freq, dur = 0.08, type = 'square', vol = 0.15, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  swing: () => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(3000, t0 + 0.15); const g = actx.createGain(); g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 0.2); },
  pad: () => { blip(220, 0.25, 'sine', 0.2); blip(660, 0.18, 'triangle', 0.12, 0.05); },
  pickup: () => { blip(880, 0.07, 'sine', 0.15); blip(1320, 0.1, 'sine', 0.13, 0.06); },
  boom: (vol = 1) => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(60, t0 + 0.9); const g = actx.createGain(); g.gain.setValueAtTime(0.6 * vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 1); },
  slide: () => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t0); f.frequency.exponentialRampToValueAtTime(300, t0 + 0.5); const g = actx.createGain(); g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 0.6); },
  hit: () => blip(1400, 0.05, 'square', 0.12),
  head: () => { blip(1900, 0.06, 'square', 0.14); blip(2500, 0.08, 'square', 0.12, 0.05); },
  kill: () => { blip(660, 0.12, 'triangle', 0.25); blip(990, 0.15, 'triangle', 0.25, 0.08); blip(1320, 0.25, 'triangle', 0.25, 0.16); },
  hurt: () => blip(140, 0.15, 'sawtooth', 0.25),
  reload: () => { blip(500, 0.04, 'square', 0.08); blip(700, 0.04, 'square', 0.08, 0.25); },
  empty: () => blip(300, 0.03, 'square', 0.08),
  chat: () => blip(880, 0.05, 'sine', 0.06),
};
function say(text) {
  try { const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = 1.1; u.pitch = 0.8; speechSynthesis.speak(u); } catch { /* unsupported */ }
}
function vibrate(ms) { if (store.get('vibrate', true) && navigator.vibrate) navigator.vibrate(ms); }

// ======================= game state =======================
const me = {
  id: null, color: 0xffffff, p: [0, 0, 0], v: [0, 0, 0], onGround: true, yaw: 0, pitch: 0,
  alive: false, hp: PLAYER.maxHp, weapon: 'rifle', ammo: {}, reloadUntil: 0, lastShot: 0, ads: false,
  kills: 0, deaths: 0, heads: 0, streak: 0,
  stance: 0, eyeH: PLAYER.eye, // 0 standing, 1 crouching, 2 prone; eyeH eases toward the stance's eye height
};
for (const k of LOADOUT) me.ammo[k] = WEAPONS[k].mag;
// Armor, timed boosts and the special weapon, as told by the game (times are local performance.now() ends)
const buffs = { armor: 0, speedUntil: 0, powerUntil: 0, special: null };
let lastWeapon = 'pistol';
const hasWeapon = (k) => (!WEAPONS[k].pickupOnly && (!buffs.inventory||buffs.inventory.includes(k))) || (buffs.special?.w === k && performance.now() < buffs.special.until);
const remotes = new Map(); // id -> {group, buf, name, ...}
let roster = [];
let matchInfo = { state: 'playing', endsAt: 0 };
let killLimit = 25;
let quickChat = [];
const muted = new Set();
let ws = null;
let sens = store.get('sens', 1);
const keys = new Set();
let mouseDown = false;
let chatOpen = false, quickOpen = false;
let recoil = 0, bob = 0, shake = 0;
let lastHurtFrom = null, deathUntil = 0;
const touchMove = { f: 0, s: 0 };
let wantJump = false;

// ======================= remote players =======================
function nameSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px Rubik, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, 8, 256, 48);
  x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillText(text, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, depthWrite:false, fog:false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  s.renderOrder = 10;
  return s;
}

let charSeed = 0, dropAvatar=null, dropAvatarKey="";
// Realistic soldiers and weapon models replace the simple fallbacks as soon as they load
const modelUrl = (file) => (window.ARENA_MODELS?.[file]) || './models/' + file;
function rebuildModels() {
  for (const [id, r] of remotes) {
    scene.remove(r.group);
    remotes.set(id, makeRemote({ id, name: r.name, color: r.color, bot: r.bot, character: r.character, cosmetics: r.cosmetics }));
  }
}
// First-person arms: your own character's sleeves and hands on the view-model weapon
let fpBody = null, fpKey = '';
function refreshFirstPerson() {
  if (!soldierReady()) return;
  const eq = myProfile?.equipped || {};
  const key = selectedChar + JSON.stringify(eq) + me.color;
  if (key === fpKey) return;
  fpKey = key;
  if (fpBody) vmScene.remove(fpBody.root);
  fpBody = buildFirstPerson(selectedChar, eq, me.color ?? 0xffffff);
  vmScene.add(fpBody.root);
}
registerCharacters(CHARACTERS);
const animsLoad = loadAnimations(CHARACTERS, modelUrl).catch((e) => { console.warn('Animations unavailable', e); throw e; });
// Load a character's model when it is needed; players and the preview switch to it as soon as it arrives
const charRequested = new Set(), charFailed = new Set();
let charError = ''; // last load error, shown under the message to help diagnose
function ensureCharacter(id) {
  id = characterById(id).id;
  if (charRequested.has(id)) return;
  charRequested.add(id);
  Promise.all([animsLoad, loadCharacter(id, modelUrl)])
    .then(() => { rebuildModels(); refreshPreview(); fpKey = ''; })
    .catch((e) => { console.warn('Character model unavailable', id, e); charRequested.delete(id); charFailed.add(id); charError = String(e?.message || e).slice(0, 120); refreshPreview(); });
}
let viewCamo = null;
function setViewCamo(camo) {
  if (camo === viewCamo) return;
  viewCamo = camo;
  for (const k of WEAPON_ORDER) {
    vmRoot.remove(viewGuns[k]);
    viewGuns[k] = gunModel(k, 1, viewCamo);
    viewGuns[k].visible = k === me.weapon;
    vmRoot.add(viewGuns[k]);
  }
}
loadWeapons((file) => modelUrl('weapons/' + file)).then(() => {
  for (const k of WEAPON_ORDER) {
    vmRoot.remove(viewGuns[k]);
    viewGuns[k] = gunModel(k, 1, viewCamo);
    viewGuns[k].visible = k === me.weapon;
    vmRoot.add(viewGuns[k]);
  }
  rebuildModels();
}).catch((e) => console.warn('Weapon models unavailable, using simple guns', e));
function makeRemote(info) {
  const c = soldierReady() ? buildSoldier(info.color, charSeed++, info.character, info.cosmetics || {}) : buildCharacter(info.color, charSeed++);
  const g = c.root;
  const guns = {};
  for (const k of WEAPON_ORDER) { guns[k] = gunModel(k, 1, info.cosmetics?.camo); guns[k].visible = false; c.gunMount.add(guns[k]); }
  const tag = nameSprite(info.name, info.color); tag.position.y = 2.3;
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.18, depthWrite: false }));
  shield.position.y = 0.9; shield.visible = false;
  const canopy=createParachute();g.add(canopy);
  g.add(tag, shield);
  g.visible = false;
  scene.add(g);
  return { id: info.id, name: info.name, color: info.color, bot: info.bot, character: info.character, cosmetics: info.cosmetics, cosKey: JSON.stringify(info.cosmetics || {}), full: soldierReady(), info, group: g, canopy, char: c, headPivot: c.neck, arm: c.aim, guns, tag, shield, buf: [], cur: null, weapon: null, lastSeen: 0, lastPos: null };
}

function syncRoster(list) {
  roster = list;
  for (const info of list) {
    if (info.id === me.id) { me.kills = info.kills; me.deaths = info.deaths; me.color = info.color; setViewCamo(info.cosmetics?.camo || null); continue; }
    ensureCharacter(info.character);
    const r = remotes.get(info.id);
    if (!r) remotes.set(info.id, makeRemote(info));
    else if (r.color !== info.color || r.cosKey !== JSON.stringify(info.cosmetics || {})) { scene.remove(r.group); remotes.set(info.id, makeRemote(info)); } // team or skin change
    if (info.id === me.id) { me.color = info.color; setViewCamo(info.cosmetics?.camo || null); }
  }
  for (const [id, r] of remotes) if (!list.find((p) => p.id === id)) { scene.remove(r.group); remotes.delete(id); }
  updateScoreboard();
  if (!$('admin-panel').classList.contains('hidden')) renderAdminPanel();
}
const nameOf = (id) => (id === me.id ? t('hud.you') : roster.find((p) => p.id === id)?.name || '???');
const colorOf = (id) => '#' + ((id === me.id ? me.color : roster.find((p) => p.id === id)?.color) ?? 0xffffff).toString(16).padStart(6, '0');

const INTERP = 100; // ms behind the newest snapshot
let dtFrame = 0;
function updateRemotes(now, dt) {
  dtFrame = dt;
  const t = now - INTERP;
  for (const [rid, r0] of remotes) {
    let r = r0;
    // Always show a full detailed soldier (PUBG/GTA style): upgrade the procedural fallback once Rocketbox assets load
    if (!r.full && soldierReady()) { scene.remove(r.group); const nr = makeRemote(r.info); nr.buf = r.buf; nr.lastSeen = r.lastSeen; remotes.set(rid, nr); r = nr; }
    const b = r.buf;
    while (b.length > 2 && b[1].t <= t) b.shift();
    if (!b.length || now - r.lastSeen > 400) { r.group.visible = false; r.cur = null; continue; }
    let s;
    if (b.length >= 2 && b[0].t <= t) {
      const k = Math.min(1, (t - b[0].t) / Math.max(1, b[1].t - b[0].t));
      s = { p: b[0].p.map((v, i) => v + (b[1].p[i] - v) * k), yaw: lerpAngle(b[0].yaw, b[1].yaw, k), pitch: b[0].pitch + (b[1].pitch - b[0].pitch) * k };
    } else s = b[0];
    r.cur = s;
    r.group.visible = !vehicleVisuals.drivenBy(rid);
    const speed = r.lastPos && dtFrame > 0 ? Math.hypot(s.p[0] - r.lastPos[0], s.p[2] - r.lastPos[2]) / dtFrame : 0;
    r.lastPos = s.p;
    r.speed = (r.speed || 0) + (speed - (r.speed || 0)) * 0.2;
    r.group.position.set(s.p[0], s.p[1], s.p[2]);
    r.group.rotation.y = s.yaw;
    r.headPivot.rotation.x = s.pitch * 0.6;
    r.arm.rotation.x = s.pitch;
    const w = b[b.length - 1].w;
    if (w !== r.weapon) { for (const k in r.guns) r.guns[k].visible = k === w; r.weapon = w; setHold(r.char, w); }
    r.char.stance = b[b.length - 1].st || 0;
    animate(r.char, r.speed, now / 1000, dtFrame);
    const distance=camera.position.distanceTo(r.group.position),pixels=distance>45?11:distance>20?14:18;
    const worldHeight=Math.max(0.28,distance*2*Math.tan(camera.fov*Math.PI/360)*pixels/Math.max(1,innerHeight));
    r.tag.scale.set(worldHeight*4,worldHeight,1);
    r.shield.visible = !!b[b.length - 1].sp;
    r.canopy.visible=!!b[b.length-1].parachuting;
    for(const [key,gun]of Object.entries(r.guns))gun.visible=!r.canopy.visible&&key===w;
    if(r.canopy.visible){for(const gun of Object.values(r.guns))gun.visible=false;swayParachute(r.canopy,now/1000); }
  }
}
function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// ======================= effects =======================
// Arcade-style, RIVALS-inspired: bright glowing tracers, punchy muzzle flashes, sparks and dust on impact,
// a burst when you eliminate someone. All additive so they glow in daylight too.
const tracers = [];
const knifeFlights = new Map();
function animateKnives(dt) {
  for(const [id,k] of knifeFlights){
    k.age+=dt; k.v[1]-=7*dt; k.p=k.p.map((n,a)=>n+k.v[a]*dt); k.obj.position.set(...k.p);
    k.obj.rotation.x+=dt*22;
    if(k.age>2.5){scene.remove(k.obj);knifeFlights.delete(id);}
  }
}
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const _up = new THREE.Vector3(0, 1, 0);
function tracer(from, to, color = 0xfff59d) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  if (len < 0.05) return;
  const dir = b.clone().sub(a).normalize();
  for (const [r, op, c] of [[0.012, 1, 0xffffff], [0.035, 0.55, color]]) { // white-hot core + coloured glow
    const m = new THREE.Mesh(beamGeo, glow(c, op));
    m.scale.set(r, len, r);
    m.position.copy(a).addScaledVector(dir, len / 2);
    m.quaternion.setFromUnitVectors(_up, dir);
    scene.add(m);
    tracers.push({ obj: m, life: 0.11, max: 0.11, op, shrink: true });
  }
}
const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
function sparks(at, color = 0xffd54f, n = 6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkGeo, glow(color));
    m.position.set(...at);
    scene.add(m);
    tracers.push({ obj: m, life: 0.4, max: 0.4, op: 1, vel: [(Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8] });
  }
}
const puffGeo = new THREE.SphereGeometry(1, 8, 6);
function puff(at, color = 0xcfc8b8, size = 0.12) { // dust cloud where a bullet hits a wall
  const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  m.position.set(...at); m.scale.setScalar(size);
  scene.add(m);
  tracers.push({ obj: m, life: 0.45, max: 0.45, op: 0.55, grow: size * 5 });
}
function flashAt(at, size = 0.5, color = 0xffe08a) { // muzzle flash star seen by everyone
  const m = new THREE.Mesh(puffGeo, glow(color, 0.9));
  m.position.set(...at); m.scale.setScalar(size * 0.35);
  scene.add(m);
  tracers.push({ obj: m, life: 0.06, max: 0.06, op: 0.9 });
}
function eliminationBurst(at, color) { // you eliminated someone: a ring of glowing shards
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(sparkGeo, glow(i % 3 ? color : 0xffffff));
    m.position.set(at[0], at[1] + 1, at[2]); m.scale.setScalar(1.6);
    scene.add(m);
    const a = (i / 24) * Math.PI * 2;
    tracers.push({ obj: m, life: 0.7, max: 0.7, op: 1, vel: [Math.cos(a) * 6, 3 + Math.random() * 4, Math.sin(a) * 6] });
  }
}
function updateEffects(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const e = tracers[i];
    e.life -= dt;
    const k = Math.max(0, e.life / e.max);
    if (e.vel) { e.vel[1] -= 15 * dt; e.obj.position.x += e.vel[0] * dt; e.obj.position.y += e.vel[1] * dt; e.obj.position.z += e.vel[2] * dt; }
    if (e.grow) e.obj.scale.setScalar(e.obj.scale.x + e.grow * dt);
    if (e.shrink) { e.obj.scale.x *= 0.85; e.obj.scale.z *= 0.85; }
    e.obj.material.opacity = e.op * k;
    if (e.life <= 0) { scene.remove(e.obj); e.obj.material.dispose(); tracers.splice(i, 1); }
  }
}

const dmgNums = [];
function damageNumber(at, text, cls) {
  const el = document.createElement('div');
  el.className = 'dmg ' + (cls || '');
  el.textContent = text;
  $('dmg-numbers').appendChild(el);
  dmgNums.push({ el, pos: new THREE.Vector3(at[0], at[1] + 0.3, at[2]), life: 0.9, dx: (Math.random() - 0.5) * 40 });
}
function updateDamageNumbers(dt) {
  const v = new THREE.Vector3();
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i];
    d.life -= dt;
    if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); continue; }
    v.copy(d.pos).project(camera);
    const behind = v.z > 1;
    const x = (v.x * 0.5 + 0.5) * innerWidth + d.dx * (0.9 - d.life);
    const y = (-v.y * 0.5 + 0.5) * innerHeight - (0.9 - d.life) * 60;
    d.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + d.life * 0.3})`;
    d.el.style.left = d.el.style.top = '0';
    d.el.style.opacity = behind ? 0 : Math.min(1, d.life * 2);
  }
}

let hitTimer = 0;
function hitMarker(kind) {
  const h = $('hitmarker');
  h.className = 'on ' + kind;
  clearTimeout(hitTimer);
  hitTimer = setTimeout(() => (h.className = kind), 90);
}
function announce(text) {
  const a = $('announce');
  a.textContent = text;
  a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
}
function centerMsg(text, ms = 2000) {
  const c = $('center-msg');
  c.textContent = text;
  clearTimeout(c._t);
  c._t = setTimeout(() => (c.textContent = ''), ms);
}
function killFeed(killer, victim, w, head) {
  const el = document.createElement('div');
  el.className = 'kf' + (killer === me.id || victim === me.id ? ' me' : '');
  const k = document.createElement('b'); k.style.color = colorOf(killer); k.textContent = nameOf(killer);
  const ws_ = document.createElement('span'); ws_.className = 'w'; ws_.textContent = `[${t('weapon.' + w)}]${head ? ' 🎯' : ''}`;
  const v = document.createElement('b'); v.style.color = colorOf(victim); v.textContent = nameOf(victim);
  el.append(k, ws_, v);
  const feed = $('killfeed');
  feed.prepend(el);
  while (feed.children.length > 5) feed.lastChild.remove();
  setTimeout(() => el.remove(), 6000);
}

// ======================= HUD =======================
function updateWeaponHud() {
  const w = WEAPONS[me.weapon];
  $('weapon-name').textContent = t('weapon.' + me.weapon);
  $('mag').textContent = WEAPONS[me.weapon].melee ? '∞' : performance.now() < me.reloadUntil ? '…' : me.ammo[me.weapon];
  $('mag').classList.toggle('empty', me.ammo[me.weapon] === 0);
  $('mag-max').parentElement.style.visibility = w.melee ? 'hidden' : '';
  if (w.unarmed) $('mag').textContent = '—';
  $('mag-max').textContent = w.mag;
  $('weapon-slots').innerHTML = '';
  for (const k of WEAPON_ORDER) {
    if (!hasWeapon(k)) continue;
    const s = document.createElement('button');
    s.type = 'button';
    s.textContent = WEAPONS[k].key + ' ' + t('weapon.' + k);
    s.className = (k === me.weapon ? 'on' : '') + (WEAPONS[k].pickupOnly ? ' special' : '');
    s.addEventListener('mousedown', (e) => { e.stopPropagation(); switchWeapon(k); });
    s.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); switchWeapon(k); }, { passive: false });
    $('weapon-slots').appendChild(s);
  }
  $('switch-hint').textContent = isTouch ? '' : t('hud.switchHint');
  // 0.16.9: no gun in hand (unarmed start / knife) -> hide the aim + reload buttons; they did nothing and confused players
  document.body.classList.toggle('no-gun', !!(w.unarmed || w.melee));
  if (w.unarmed || w.melee) me.ads = false;
}
function updateHp(hp) {
  me.hp = hp;
  $('hp-text').textContent = Math.ceil(hp);
  $('hp-fill').style.width = Math.max(0, hp / PLAYER.maxHp * 100) + '%';
  $('hp-fill').classList.toggle('low', hp < PLAYER.maxHp * 0.35);
}
function updateScoreboard() {
  const sorted = [...roster].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const tb = $('scoreboard').querySelector('tbody');
  tb.innerHTML = '';
  for (const p of sorted) tb.appendChild(boardRow(p, [p.kills, p.deaths, p.bot ? 'BOT' : p.ping]));
  const lead = sorted[0];
  $('leader').textContent = lead ? t('hud.leader', { name: lead.name, kills: lead.kills, limit: killLimit }) : '';
}
function boardRow(p, cols, rank) {
  const tr = document.createElement('tr');
  if (p.id === me.id) tr.className = 'me';
  if (rank !== undefined) { const td = document.createElement('td'); td.textContent = rank; tr.appendChild(td); }
  const td = document.createElement('td');
  const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = '#' + p.color.toString(16).padStart(6, '0');
  td.append(dot, document.createTextNode(p.name + (muted.has(p.id) ? ' 🔇' : '')));
  tr.appendChild(td);
  for (const c of cols) { const t = document.createElement('td'); t.textContent = c; tr.appendChild(t); }
  return tr;
}

// ======================= chat =======================
// Params ending in "Key" are translated too, e.g. { mapKey: 'map.neon' } -> {map}
function tr(key, p = {}) {
  const out = {};
  for (const [k, v] of Object.entries(p)) if (k.endsWith('Key')) out[k.slice(0, -3)] = t(v); else out[k] = v;
  return t(key, out);
}
function addChat({ name, color, text, sys, quick, from, key, p, q }) {
  if (from && muted.has(from)) return;
  const el = document.createElement('div');
  if (sys) {
    el.className = 'sys';
    el._render = () => { el.textContent = key ? tr(key, p) : text; };
    el._render();
  } else {
    if (quick) el.className = 'quick';
    const b = document.createElement('b');
    b.style.color = '#' + (color ?? 0xffffff).toString(16).padStart(6, '0');
    b.textContent = name + ':';
    const body = document.createTextNode('');
    el.append(b, body);
    el._render = () => { body.textContent = ' ' + (quick ? t('quick.' + q) : text); };
    el._render();
    if (from !== me.id) sfx.chat();
  }
  const log = $('chat-log');
  log.appendChild(el);
  while (log.children.length > 40) log.firstChild.remove();
  setTimeout(() => el.classList.add('faded'), 10000);
}

function openChat() {
  if (chatOpen) return;
  chatOpen = true; quickOpen = false;
  $('quick-menu').classList.add('hidden');
  $('chat').classList.add('open');
  const inp = $('chat-input');
  inp.classList.remove('hidden');
  keys.clear(); mouseDown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => inp.focus(), 0);
}
function closeChat(send) {
  const inp = $('chat-input');
  const text = inp.value.trim();
  inp.value = '';
  inp.classList.add('hidden');
  inp.blur();
  $('chat').classList.remove('open');
  chatOpen = false;
  if (send && text) handleChatText(text);
  if (!isTouch) lockPointer();
}
const ADMIN_COMMANDS = ['setrole', 'adminlogin', 'whoami', 'heal', 'sethealth', 'giveweapon', 'givemoney', 'kick', 'ban', 'announce', 'teleport'];
function handleChatText(text) {
  if (text.startsWith('/')) {
    const [cmd, name, ...rest] = text.slice(1).split(' ');
    const target = roster.find((p) => p.name === name);
    if (cmd === 'mute' || cmd === 'unmute') {
      if (!target) return addChat({ sys: true, key: 'sys.noSuchPlayer' });
      cmd === 'mute' ? muted.add(target.id) : muted.delete(target.id);
      voice.setMuted(target.id, cmd === 'mute');
      updateScoreboard();
      return addChat({ sys: true, key: cmd === 'mute' ? 'sys.youMuted' : 'sys.youUnmuted', p: { name: target.name } });
    }
    if (cmd === 'report') {
      if (!target) return addChat({ sys: true, key: 'sys.noSuchPlayer' });
      return net({ t: 'report', name: target.name, reason: rest.join(' ') });
    }
    if (cmd === 'invite') return net({ t: 'invite', email: name || '' });
    // Admin commands: sent as requests; the server decides whether this player may run them
    if (ADMIN_COMMANDS.includes(cmd)) return net({ t: 'admin', cmd, args: [name, ...rest].filter((a) => a !== undefined && a !== '') });
    if (cmd === 'room') return addChat({ sys: true, key: roomCode ? 'sys.roomCode' : 'sys.noRoom', p: { code: roomCode } });
    return addChat({ sys: true, key: 'sys.commands' });
  }
  net({ t: 'chat', text });
}
function toggleQuick() {
  quickOpen = !quickOpen;
  const q = $('quick-menu');
  q.classList.toggle('hidden', !quickOpen);
  if (quickOpen) {
    q.innerHTML = '';
    quickChat.forEach((text, i) => {
      const d = document.createElement('div');
      const k = document.createElement('kbd'); k.textContent = i + 1;
      d.append(k, document.createTextNode(t(text)));
      d.addEventListener('pointerdown', (e) => { e.stopPropagation(); sendQuick(i); });
      q.appendChild(d);
    });
  }
}
function sendQuick(i) { net({ t: 'quick', i }); quickOpen = false; $('quick-menu').classList.add('hidden'); }

$('chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') closeChat(true);
  if (e.key === 'Escape') closeChat(false);
});

// ======================= combat (client side) =======================
const bestHeld = () => ['m4','rifle','smg','shotgun','sniper','pistol','knife'].find(hasWeapon) || 'unarmed';
function switchWeapon(k) {
  if (k === 'unarmed' && me.weapon !== 'unarmed') { lastWeapon = me.weapon; me.weapon = 'unarmed'; for (const g in viewGuns) viewGuns[g].visible = false; updateWeaponHud(); return; }
  if (!WEAPONS[k] || k === me.weapon || !hasWeapon(k)) return;
  lastWeapon = me.weapon;
  me.weapon = k;
  me.reloadUntil = 0;
  me.lastShot = performance.now() - 200; // short equip delay
  for (const g in viewGuns) viewGuns[g].visible = g === k;
  updateWeaponHud();
}
function cycleWeapon(dir) {
  const owned = WEAPON_ORDER.filter(hasWeapon);
  if (!owned.length) return;
  const i = owned.indexOf(me.weapon);
  switchWeapon(owned[(i + dir + owned.length) % owned.length]);
}
function reload() {
  const w = WEAPONS[me.weapon];
  if (!w || w.melee || w.pickupOnly || !me.alive || performance.now() < me.reloadUntil || me.ammo[me.weapon] >= w.mag) return;
  me.reloadUntil = performance.now() + w.reload * 1000;
  const k = me.weapon;
  net({ t: 'reload', w: k });
  sfx.reload();
  setTimeout(() => { if (me.weapon === k && me.reloadUntil) { me.ammo[k] = w.mag; me.reloadUntil = 0; updateWeaponHud(); } }, w.reload * 1000);
  updateWeaponHud();
}

let semiReady = true;
let swingAt = -10;
function knifeSwing(now) {
  const w = WEAPONS.knife;
  if (now - me.lastShot < w.rate * 1000 || !semiReady) return;
  semiReady = false;
  me.lastShot = now;
  swingAt = now;
  net({ t: 'melee', yaw: me.yaw, pitch: me.pitch });
  sfx.swing();
  vibrate(15);
}
function tryFire(now) {
  const w = WEAPONS[me.weapon];
  if (!w || w.unarmed) return;
  if (!me.alive || gamePaused || me.parachuting || me.vehicle || chatOpen || matchInfo.state !== 'playing') return;
  if (w.melee) {
    if (me.ads) return knifeSwing(now);
    if (now - me.lastShot < w.throwRate * 1000 || !semiReady) return;
    semiReady=false; me.lastShot=now; swingAt=now;
    net({t:'throwKnife',yaw:me.yaw,pitch:me.pitch}); sfx.swing(); vibrate(15);
    return;
  }
  if (now < me.reloadUntil || now - me.lastShot < w.rate * 1000) return;
  if (!w.auto && !semiReady) return;
  if (me.ammo[me.weapon] <= 0) { if (semiReady) sfx.empty(); semiReady = false; reload(); return; }
  semiReady = false;
  me.lastShot = now;
  me.ammo[me.weapon]--;

  const moving = Math.hypot(me.v[0], me.v[2]) > 1;
  let spread = me.ads ? w.adsSpread : w.spread;
  if (moving) spread += w.spread * 0.4;
  if (!me.onGround) spread += w.spread;
  if (me.weapon === 'sniper' && !me.ads) spread = Math.max(spread, 0.06);
  const o = [me.p[0], me.p[1] + stanceOf(me.stance).eye, me.p[2]];
  const dirs = [];
  for (let i = 0; i < w.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    dirs.push(dirFromAngles(me.yaw + Math.cos(a) * r, me.pitch + Math.sin(a) * r));
  }
  net({ t: 'shoot', w: me.weapon, o, dirs });

  // Local visuals only — damage is decided by the server
  const muzzle = muzzleWorld();
  for (const d of dirs) {
    let dist = rayWorld(o, d, MAP.boxes, w.range), hitPlayer = false;
    for (const r of remotes.values()) {
      if (!r.cur) continue;
      const hb = hitboxes(r.cur.p, r.char.stance || 0, r.cur.yaw);
      for (const box of [hb.head, hb.body]) {
        const t = rayBox(o, d, box[0], box[1], dist);
        if (t !== null && t < dist) { dist = t; hitPlayer = true; }
      }
    }
    const end = [o[0] + d[0] * dist, o[1] + d[1] * dist, o[2] + d[2] * dist];
    if (w.rocketSpeed) launchRocket(muzzle, end); else tracer(muzzle, end, w.color);
    if (!w.rocketSpeed && dist < w.range) { sparks(end, hitPlayer ? 0xff1744 : 0xffd54f, hitPlayer ? 7 : 6); if (!hitPlayer) puff(end); }
  }
  shotSound(me.weapon, 1);
  recoil += w.recoil * 6;
  me.pitch = Math.min(1.5, me.pitch + w.recoil * (me.ads ? 0.5 : 1));
  me.yaw += (Math.random() - 0.5) * w.recoil * 0.5;
  shake = Math.min(0.6, shake + w.recoil * 3);
  flash.visible = true;
  flash.scale.setScalar(1.2 + Math.random() * 0.8); flash.rotation.z = Math.random() * Math.PI;
  camera.fov += w.recoil * 30; // a small kick of the view on every shot
  flashLight.intensity = 9;
  flashLight.position.set(...muzzle);
  setTimeout(() => { flash.visible = false; flashLight.intensity = 0; }, 45);
  vibrate(me.weapon === 'shotgun' || me.weapon === 'sniper' ? 30 : 10);
  updateWeaponHud();
  if (me.ammo[me.weapon] === 0) setTimeout(reload, 250);
}
function muzzleWorld() {
  const fwd = dirFromAngles(me.yaw, me.pitch);
  const right = [Math.cos(me.yaw), 0, -Math.sin(me.yaw)];
  return [me.p[0] + fwd[0] * 0.8 + right[0] * 0.2, me.p[1] + me.eyeH - 0.18 + fwd[1] * 0.8, me.p[2] + fwd[2] * 0.8 + right[2] * 0.2];
}

// ======================= stance: stand / crouch / prone =======================
// Lower stances are slower but smaller targets and steadier; getting up needs headroom
function setStance(st) {
  if (!me.alive || st === me.stance) return;
  if (st < me.stance && !canStance(me.p, st, MAP.boxes)) { addChat({ sys: true, key: 'hud.noRoom' }); return; }
  me.stance = st;
  updateStanceHud();
}
// Crouch while running = slide (keeps momentum, then you are crouched); otherwise toggle crouch
let wantSlide = false, wantDash = false;
function crouchPress() {
  if (me.stance === 0 && canSlide(me)) { wantSlide = true; setStance(1); sfx.slide(); return; }
  setStance(me.stance === 1 ? 0 : 1);
}
// 0.16.30 dedicated slide button: slide from a run, then get back up automatically
let slideAuto = false;
// 0.16.31: same code path as crouch-while-sprinting (C / Ctrl); ends crouched like Fortnite
function slidePress() {
  if (!canSlide(me)) return;
  wantSlide = true; slideAuto = true; setStance(1); sfx.slide();
  $('t-slide')?.classList.add('on');
}
function slideTick() {
  if (!slideAuto || me.slideT > 0 || wantSlide) return;
  slideAuto = false; $('t-slide')?.classList.remove('on');
  if (me.stance !== slideRecoverStance()) setStance(slideRecoverStance());
}
function updateStanceHud() {
  $('t-crouch').classList.toggle('on', me.stance === 1);
  $('t-prone').classList.toggle('on', me.stance === 2);
}

// ======================= pickups, armor and boosts =======================
// The game owns the items (server or practice host); this draws them, plays effects and shows your boosts.
const itemMeshes = new Map(); // id -> { g, type, ready }
const ITEM_LOOK = { heart: 0xff2d55, armor: 0x2f80ff, speed: 0xffd400, power: 0xb04cff, ammo: 0x2ee59d, rpg: 0xff6d00 };
function itemShape(type) {
  const c = ITEM_LOOK[type], mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
  const g = new THREE.Group();
  if (type === 'heart') {
    const sh = new THREE.Shape(); sh.moveTo(0, -0.28); sh.bezierCurveTo(-0.5, 0.05, -0.28, 0.42, 0, 0.18); sh.bezierCurveTo(0.28, 0.42, 0.5, 0.05, 0, -0.28);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), mat); m.position.z = -0.07; g.add(m);
  } else if (type === 'armor') {
    const sh = new THREE.Shape(); sh.moveTo(0, 0.32); sh.lineTo(0.28, 0.22); sh.lineTo(0.24, -0.08); sh.quadraticCurveTo(0.14, -0.26, 0, -0.34); sh.quadraticCurveTo(-0.14, -0.26, -0.24, -0.08); sh.lineTo(-0.28, 0.22); sh.lineTo(0, 0.32);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02 }), mat); m.position.z = -0.05; g.add(m);
  } else if (type === 'speed') {
    const sh = new THREE.Shape(); sh.moveTo(0.06, 0.34); sh.lineTo(-0.16, 0); sh.lineTo(0.0, 0); sh.lineTo(-0.08, -0.34); sh.lineTo(0.18, 0.06); sh.lineTo(0.02, 0.06); sh.lineTo(0.06, 0.34);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }), mat); m.position.z = -0.04; g.add(m);
  } else if (type === 'power') {
    g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.26), mat));
  } else if (type === 'ammo') {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.3), new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.7 })));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.32), mat); g.add(band);
  } else if (type === 'rpg') {
    const gun = gunModel('rpg'); gun.rotation.y = Math.PI / 2; gun.scale.setScalar(1.1); g.add(gun);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.62;
  const root = new THREE.Group(); root.add(g, ring);
  return { root, spin: g, ring };
}
function setItems(list) {
  for (const [id, type, p, ready] of list) {
    let it = itemMeshes.get(id);
    if (!it) { it = { ...itemShape(type), type }; it.root.position.set(p[0], p[1] + 0.8, p[2]); scene.add(it.root); itemMeshes.set(id, it); }
    it.ready = !!ready;
    it.spin.visible = it.ready;
    it.ring.material.opacity = it.ready ? 0.8 : 0.18; // a faint ring shows where it will come back
  }
}
function animateItems(t) {
  for (const it of itemMeshes.values()) {
    it.spin.rotation.y = t * 1.8;
    it.spin.position.y = Math.sin(t * 2.2 + it.root.position.x) * 0.1;
  }
}
function itemTakenFx(id) { const it = itemMeshes.get(id); if (it) sparks(it.root.position.toArray(), ITEM_LOOK[it.type], 10); }
function onBuffs(m) {
  const now = performance.now(), had = { ...buffs, special: buffs.special && { ...buffs.special } };
  if(m.inventory)buffs.inventory=m.inventory;
  buffs.helmet=m.helmet||0;
  buffs.armor = m.armor;
  buffs.speedUntil = m.speed ? now + m.speed : 0;
  buffs.powerUntil = m.power ? now + m.power : 0;
  buffs.special = m.special ? { w: m.special.w, until: now + m.special.ms } : null;
  if (m.special) me.ammo[m.special.w] = m.special.ammo;
  updateArmor();
  // Toasts for what was just picked up
  if (m.armor > had.armor) { toast(t('hud.gotArmor'), '#4d9dff'); sfx.pickup(); }
  if (m.speed && !(had.speedUntil > now)) { toast(t('hud.gotSpeed'), '#ffd400'); sfx.pickup(); }
  if (m.power && !(had.powerUntil > now)) { toast(t('hud.gotPower'), '#c36bff'); sfx.pickup(); }
  if (m.special && !had.special) { toast(t('hud.gotRpg'), '#ff8a3d'); sfx.pickup(); switchWeapon(m.special.w); }
  if (!m.special && had.special && me.weapon === had.special.w) { me.weapon = ''; switchWeapon(lastWeapon !== had.special.w && hasWeapon(lastWeapon) ? lastWeapon : bestHeld()); }
  updateWeaponHud();
}
function updateArmor() {
  const armor=Math.max(0,Math.min(PLAYER.maxArmor,buffs.armor));
  $('armor-fill').style.width = (armor/PLAYER.maxArmor*100) + '%';
  $('armor-value').textContent = Math.round(armor)+' / '+PLAYER.maxArmor;
  $('armor').setAttribute('aria-label',t('hud.gotArmor')+' '+Math.round(armor)+' / '+PLAYER.maxArmor);
  $('armor').classList.toggle('hidden', !(buffs.armor > 0));
}
let buffHudAt = 0;
function updateBuffHud(now) {
  if (now - buffHudAt < 200) return;
  buffHudAt = now;
  const chips = [];
  if(buffs.helmet>0)chips.push(['helmet','⛑',Math.ceil(buffs.helmet)]);
  if (buffs.speedUntil > now) chips.push(['speed', '⚡', Math.ceil((buffs.speedUntil - now) / 1000)]);
  if (buffs.powerUntil > now) chips.push(['power', '💥', Math.ceil((buffs.powerUntil - now) / 1000)]);
  if (buffs.special && buffs.special.until > now) chips.push(['rpg', 'RPG', Math.ceil((buffs.special.until - now) / 1000)]);
  $('buffs').innerHTML = chips.map(([k, icon, sec]) => `<span class="buff ${k}">${icon} ${sec}s</span>`).join('');
  if (buffs.special && buffs.special.until <= now && hasWeapon(buffs.special.w) === false && me.weapon === buffs.special.w) switchWeapon(bestHeld());
}
let toastTimer = 0;
// 0.16.25: car HP bar while driving.
function updateCarHp(){let el=document.getElementById('car-hp');if(!el){el=document.createElement('div');el.id='car-hp';el.innerHTML='<span>🚗</span><div id="car-hp-bar"><div id="car-hp-fill"></div></div>';document.body.appendChild(el);}
  const c=me.vehicle&&(mmCars||[]).find(c=>c.id===me.vehicle);el.classList.toggle('hidden',!c);if(!c)return;const f=Math.max(0,Math.min(1,(c.hp??200)/200));const fill=document.getElementById('car-hp-fill');fill.style.width=(f*100)+'%';fill.style.background=f>0.5?'#4dd06a':f>0.25?'#ffb34d':'#ff4d4d';}
function toast(text, color) {
  const el = $('pickup-toast');
  el.textContent = text; el.style.color = color; el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), 1600);
}
// Rocket explosion: flash, fireball, sparks, shake when close
// 0.16.14 Rivalz-style RPG: a visible rocket with a smoke/fire trail flies to the aim point; the server
// detonates it on arrival (same flight time), so the boom lines up with the rocket reaching the target.
const rockets = [];
const rocketBodyGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.7, 8);
const rocketTipGeo = new THREE.ConeGeometry(0.08, 0.22, 8);
function launchRocket(from, to) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const len = a.distanceTo(b); if (len < 0.3) return;
  const dir = b.clone().sub(a).normalize();
  const g = new THREE.Group();
  const body = new THREE.Mesh(rocketBodyGeo, new THREE.MeshBasicMaterial({ color: 0x4e5b3a })); g.add(body);
  const tip = new THREE.Mesh(rocketTipGeo, new THREE.MeshBasicMaterial({ color: 0x2b2f24 })); tip.position.y = 0.46; g.add(tip);
  const fire = new THREE.Mesh(puffGeo, glow(0xffa040, 0.95)); fire.scale.set(0.12, 0.3, 0.12); fire.position.y = -0.45; g.add(fire);
  g.quaternion.setFromUnitVectors(_up, dir); g.position.copy(a); scene.add(g);
  rockets.push({ g, fire, a, dir, len, d: 0, speed: WEAPONS.rpg.rocketSpeed || 55, trail: 0 });
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i];
    r.d = Math.min(r.len, r.d + r.speed * dt);
    r.g.position.copy(r.a).addScaledVector(r.dir, r.d);
    r.fire.scale.y = 0.25 + Math.random() * 0.2;
    r.trail -= dt;
    if (r.trail <= 0) { r.trail = 0.025; const p = r.g.position; puff([p.x, p.y, p.z], Math.random() < 0.35 ? 0xff8a3d : 0x9a9a9a, 0.09); }
    if (r.d >= r.len) { scene.remove(r.g); rockets.splice(i, 1); }
  }
}
function fireball(at, color, size, life, vy) {
  const m = new THREE.Mesh(puffGeo, glow(color, 0.95));
  m.position.set(...at); m.scale.setScalar(size); scene.add(m);
  tracers.push({ obj: m, life, max: life, op: 0.95, grow: size * 3, vel: [(Math.random() - 0.5) * 3, vy, (Math.random() - 0.5) * 3] });
}
const boomLight = new THREE.PointLight(0xff7a1a, 0, 18);
function explosion(at) {
  flashAt(at, 4, 0xffb347);
  for (let i = 0; i < 9; i++) fireball([at[0] + (Math.random() - 0.5), at[1] + Math.random() * 0.6, at[2] + (Math.random() - 0.5)], [0xffd24d, 0xff7a1a, 0xff3d00][i % 3], 0.35 + Math.random() * 0.35, 0.5 + Math.random() * 0.3, 14 + Math.random() * 4);
  for (let i = 0; i < 5; i++) setTimeout(() => puff([at[0] + (Math.random() - 0.5) * 2, at[1] + 0.8 + i * 0.3, at[2] + (Math.random() - 0.5) * 2], 0x3a3a3a, 0.6 + i * 0.15), 120 + i * 70);
  if (!boomLight.parent) scene.add(boomLight);
  boomLight.position.set(at[0], at[1] + 1, at[2]); boomLight.intensity = 40; setTimeout(() => (boomLight.intensity = 0), 140);
  for (let i = 0; i < 3; i++) setTimeout(() => puff(at, i ? 0x555555 : 0xff7a1a, 0.5 + i * 0.3), i * 60);
  sparks(at, 0xffa000, 18);
  const d = Math.hypot(at[0] - me.p[0], at[1] - me.p[1], at[2] - me.p[2]);
  shake = Math.min(1.2, shake + Math.max(0, 1 - d / 15));
  sfx.boom(Math.max(0.15, 1 - d / 40));
}

// ======================= voice chat =======================
const voice = createVoice((to, data) => net({ t: 'rtc', to, data }));
let voiceOn = store.get('voice', true), talking = false;
$('voice-on').checked = voiceOn;
$('voice-on').addEventListener('change', (e) => { voiceOn = e.target.checked; store.set('voice', voiceOn); voice.setEnabled(voiceOn); syncVoice(); });
voice.setEnabled(voiceOn);
// Voice needs another human in the room; offline practice has only bots
function syncVoice() {
  const humans = voiceOn && !lobby?.offline ? roster.filter((p) => !p.bot && !muted.has(p.id)).map((p) => p.id) : [];
  voice.sync(me.id, humans);
  updateVoiceHud();
}
function updateVoiceHud() {
  const others = roster.filter((p) => !p.bot && p.id !== me.id).length;
  const show = voiceOn && !lobby?.offline && others > 0;
  $('voice-hud').classList.toggle('hidden', !show);
  $('voice-hud').classList.toggle('talking', talking);
  $('voice-text').textContent = (talking ? t('voice.talking') : t(isTouch ? 'voice.holdTouch' : 'voice.holdKey')) + ' · 🔊 ' + voice.connected() + '/' + others;
}
setInterval(() => { if (me.id) updateVoiceHud(); }, 1000);
if (new URLSearchParams(location.search).has('debug')) window.arenaDebug = { voice, me, remotes, items: itemMeshes, buffs };
async function setTalking(on) {
  if (on === talking || !me.id || lobby?.offline || !voiceOn) return;
  talking = on;
  $('t-voice').classList.toggle('on', on);
  updateVoiceHud();
  if (!(await voice.talk(on)) && on) { talking = false; $('t-voice').classList.remove('on'); updateVoiceHud(); addChat({ sys: true, key: 'voice.noMic' }); }
}
// Friend rooms: the code (tap to copy an invite link) stays on screen
function showRoomCode(code) {
  roomCode = code;
  const el = $('room-code');
  el.textContent = t('p2p.codeHud', { code });
  el.classList.remove('hidden');
  el.onclick = () => {
    const link = location.href.split('?')[0].split('#')[0] + (lobby?.p2p ? '?join=' : '?room=') + code;
    const text = t('p2p.shareText', { code }) + (location.protocol.startsWith('http') ? ' ' + link : '');
    if (navigator.share && isTouch) navigator.share({ text }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => addChat({ sys: true, key: 'p2p.copied' })).catch(() => {});
  };
  addChat({ sys: true, key: 'p2p.codeChat', p: { code } });
}

// ======================= networking =======================
function net(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }
let rtt = 80;

// Offline practice: runs the match simulation in this tab instead of on a server.
class LocalSocket {
  constructor() {
    this.readyState = 0;
    import('./shared/game.js').then((game) => {
      const toClient = { readyState: 1, send: (s) => setTimeout(() => this.onmessage?.({ data: s }), 0), close() {} };
      const match = game.createGame({ difficulty: store.get('difficulty', 'normal') });
      match.start();
      this.conn = match.connect(toClient);
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(s) { this.conn?.message(s); }
  close() {}
}

let pinger = null, reconnectTries = 0;
function tryReconnect() {
  if (reconnectTries >= 5) { addChat({ sys: true, key: 'sys.disconnected' }); setTimeout(() => location.reload(), 2000); return; }
  reconnectTries++;
  addChat({ sys: true, key: 'sys.reconnecting', p: { n: reconnectTries } });
  setTimeout(() => connect(lobby.name, { t: 'rejoin', code: roomCode }), 1500);
}
let roomCode = null;
let myRole = 'Player', kickedNotice = null;
const ROLE_RANK = { Player: 0, Moderator: 1, Admin: 2, Owner: 3 };
// action: { t: 'quickMatch' } | { t: 'create' } | { t: 'joinCode', code }
// action: { t: 'p2pHost', mode } | { t: 'p2pJoin', code } play with friends device to device (see p2p.js)
// 0.16.13: Rivals-style drop-zone picker on a mini-map before the match (city map).
let dropZone=null;
function pickDrop(){return new Promise(res=>{if(MAP.id!=='city'){res();return;}
 const ov=document.createElement('div');ov.id='drop-picker';ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(8,10,14,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;font-family:inherit';
 const h=document.createElement('h2');h.textContent=t('drop.title');h.style.margin='0';const cv=document.createElement('canvas'),S=Math.min(360,innerWidth-40,innerHeight-170);cv.width=cv.height=S;cv.style.cssText='border:2px solid #ffb34d;border-radius:10px;touch-action:none;cursor:crosshair';
 const go=document.createElement('button');go.textContent=t('drop.go');go.style.cssText='font-size:18px;padding:10px 28px;border-radius:10px;border:0;background:#ffb34d;font-weight:700';
 const rnd=document.createElement('button');rnd.textContent=t('drop.random');rnd.style.cssText='padding:6px 18px;border-radius:8px;border:1px solid #888;background:transparent;color:#fff';
 const B=MAP.bounds||111,toPx=v=>(v+B)/(2*B)*S,ctx=cv.getContext('2d');let sel=store.get('dropZone',null);
 function draw(){ctx.fillStyle='#3d4a37';ctx.fillRect(0,0,S,S);for(const b of MAP.boxes){if(b.invisible||b.vehicle||b.max[1]<1.5||b.max[0]-b.min[0]>100)continue;ctx.fillStyle='#8a8f94';ctx.fillRect(toPx(b.min[0]),toPx(b.min[2]),Math.max(1,toPx(b.max[0])-toPx(b.min[0])),Math.max(1,toPx(b.max[2])-toPx(b.min[2])));}
  ctx.fillStyle='#272f35';for(const c of [-38,0,38]){ctx.fillRect(toPx(c-5),0,toPx(c+5)-toPx(c-5),S);ctx.fillRect(0,toPx(c-5),S,toPx(c+5)-toPx(c-5));}
  if(sel){ctx.strokeStyle='#ffb34d';ctx.lineWidth=3;ctx.beginPath();ctx.arc(toPx(sel[0]),toPx(sel[1]),12,0,7);ctx.stroke();ctx.fillStyle='#ffb34d';ctx.beginPath();ctx.arc(toPx(sel[0]),toPx(sel[1]),4,0,7);ctx.fill();}}
 cv.addEventListener('pointerdown',e=>{const r=cv.getBoundingClientRect();sel=[(e.clientX-r.left)/r.width*2*B-B,(e.clientY-r.top)/r.height*2*B-B].map(n=>Math.round(Math.max(-95,Math.min(95,n))));draw();});
 const done=()=>{dropZone=sel;store.set('dropZone',sel);ov.remove();res();};go.onclick=done;rnd.onclick=()=>{sel=null;done();};
 draw();ov.append(h,cv,go,rnd);document.body.append(ov);});}
function connect(name, action = { t: 'quickMatch' }, offline = !!selectedServer()?.offline) {
  if(action.t==='rejoin'||window.__noDropPick)return connectNow(name,action,offline);
  pickDrop().then(()=>connectNow(name,action,offline));
}
function connectNow(name, action, offline) {
  let opened = false;
  const p2p = action.t === 'p2pHost' || action.t === 'p2pJoin';
  if (p2p) offline = false;
  lobby = { name, action, offline, p2p };
  ws = p2p ? (action.t === 'p2pHost' ? new P2PHostSocket({ mode: action.mode,capacity:action.capacity }) : new P2PGuestSocket(action.code))
    : offline ? new LocalSocket() : new WebSocket(wsUrl(selectedServer()));
  $('menu-status').textContent = t(p2p ? (action.t === 'p2pHost' ? 'p2p.opening' : 'p2p.joining') : offline ? 'menu.preparing' : 'menu.connecting');
  ws.onopen = () => {
    opened = true;
    // Online: sign in (or as a guest), pick a room, then join it. Offline and P2P: join the match directly.
    if (offline || p2p) net({ t: 'join', name, character: selectedChar, drop: dropZone||undefined });
    else net({ t: 'auth', protocol:GAME_PROTOCOL, credential: googleCredential, guestToken: guestToken() });
    if (action.t === 'p2pHost') showRoomCode(ws.code);
    if (action.t === 'p2pJoin') showRoomCode(action.code);
  };
  ws.onerror = (e) => {
    if (p2p) {
      if (!opened) { $('menu-status').textContent = t(p2pErrorKey(e)); enableMenuButtons(); }
      return;
    }
    // No server reachable: fall back to practice against bots in the browser
    if (!opened && action.t === 'rejoin') return; // onclose retries
    if (!opened) { $('menu-status').textContent = t('rooms.unavailable');enableMenuButtons();clearInterval(pinger); }
  };
  ws.onclose = () => {
    if (p2p) {
      if (me.id) { addChat({ sys: true, key: 'p2p.hostLeft' }); setTimeout(() => location.reload(), 3000); }
      else if (!opened) enableMenuButtons();
      return;
    }
    if (kickedNotice) { setTimeout(() => { try { sessionStorage.setItem('arena.notice', kickedNotice); } catch { /* ignore */ } location.reload(); }, 2500); return; }
    // Unexpected drop mid-game: try to get back into the same room with the same score
    if (me.id && !offline && roomCode) { tryReconnect(); return; }
    if (!opened && action.t === 'rejoin') { tryReconnect(); return; }
    if (me.id && !offline) { addChat({ sys: true, key: 'sys.disconnected' }); setTimeout(() => location.reload(), 2500); }
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  clearInterval(pinger);
  pinger = setInterval(() => net({ t: 'ping', c: performance.now() }), 2000);
}

function onMessage(m) {
  const now = performance.now();
  switch (m.t) {
    case 'authed':
      if (m.user) { googleUser = m.user; showAccount(); }
      net(lobby.action);
      break;
    case 'room':
      roomCode = m.code;
      showRoomCode(m.code);
      $('scoreboard').querySelector('h2').textContent = t('hud.scoreboardRoom', { code: m.code });
      net({ t: 'join', name: lobby.name, character: selectedChar, drop: dropZone||undefined });
      break;
    case 'lobbyError':
      if (m.key === 'sys.rejoinFailed') { try { sessionStorage.setItem('arena.notice', t(m.key)); } catch { /* ignore */ } location.reload(); return; }
      $('menu-status').textContent = t(m.key);
      $('play').disabled = false;
      ws.close();
      break;
    case 'invited': showInvite(m.from, m.code); break;
    case 'rtc': if (m.from && m.data && !muted.has(m.from)) voice.onSignal(m.from, m.data); break;
    case 'swing': sfx.swing(); break;
    case 'profile': myProfile = m.profile; showProfile(); renderShop(); break;
    case 'shopError': $('shop-status').textContent = t(m.key); break;
    case 'reward':
      myProfile = m.profile;
      $('xp-line').textContent = t('end.reward', { credits: m.reward.credits, xp: m.reward.xp, level: m.reward.level }) + (m.reward.levelUp ? t('end.levelUp') : '');
      $('xp-fill').style.width = Math.round((m.profile.xp / m.profile.need) * 100) + '%';
      $('next-goal').textContent = t('end.goal', { n: Math.ceil((m.profile.need - m.profile.xp) / 100), level: m.profile.level + 1 });
      if (m.reward.levelUp) { sfx.kill(); announce('LEVEL UP'); }
      showProfile();
      break;
    case 'lobby': onLobby(m); break;
    case 'role':
      myRole = m.role;
      $('admin-btn').classList.toggle('hidden', ROLE_RANK[myRole] < 1);
      break;
    case 'kicked':
      kickedNotice = t(m.key, m.p);
      $('menu-status').textContent = kickedNotice;
      addChat({ sys: true, key: m.key, p: m.p });
      break;
    case 'welcome':
      reconnectTries = 0;
      me.id = m.id; me.color = m.color;
      matchInfo = m.match; killLimit = m.killLimit; quickChat = m.quick; gameMode = m.mode || 'ffa';
      if (m.items) setItems(m.items);
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
      if (matchInfo.state === 'lobby') $('lobby').classList.remove('hidden');
      else if (isTouch) $('touch').classList.remove('hidden'); else lockPointer();
      addChat({ sys: true, key: 'sys.welcome', p: { mapKey: 'map.' + MAP.id } });
      break;
    case 'full':
      $('menu-status').textContent = t('menu.full');
      $('play').disabled = false;
      break;
    case 'roster':
      syncRoster(m.players);
      syncVoice();
      teamScore = m.teamScore;
      $('team-score').classList.toggle('hidden', !teamScore);
      if (teamScore) { $('ts-a').textContent = teamScore.A; $('ts-b').textContent = teamScore.B; }
      break;
    case 'snap':
      for (const s of m.players) {
        if (s.id === me.id) { updateHp(s.hp);if((s.vehicle||null)!==(me.vehicle||null)){me.vehicle=s.vehicle||null;me.carSmooth=false;carLook.yaw=0;carLook.pitch=0;me.netP=null;}if(me.vehicle){me.netP=s.p.slice();me.netYaw=s.yaw;if(!me.carSmooth){me.p=s.p.slice();me.yaw=s.yaw;me.carSmooth=true;}}continue; }
        const r = remotes.get(s.id);
        if (!r) continue;
        r.buf.push({ t: now, parachuting:s.parachuting, p: s.p, yaw: s.yaw, pitch: s.pitch, w: s.w, sp: s.sp, st: s.st | 0 });
        r.lastSeen = now;
      }
      break;
    case 'spawn':
      me.p = m.p.slice(); me.v = [0, 0, 0]; me.yaw = m.yaw; me.pitch = 0;
      me.parachuting=!!m.parachuting;me.onGround=false;me.vehicle=null;
      buffs.inventory=m.inventory||[];me.weapon=m.weapon||'unarmed';for(const k in me.ammo)if(!buffs.inventory.includes(k))delete me.ammo[k];
      if(me.parachuting)toast(t('drop.steer'),'#8ad8ff');
      me.alive = true; me.streak = 0; me.reloadUntil = 0; me.stance = 0; me.eyeH = PLAYER.eye; updateStanceHud();
      buffs.armor = 0; buffs.speedUntil = 0; buffs.powerUntil = 0; buffs.special = null; updateArmor(); if (!WEAPONS[me.weapon] || WEAPONS[me.weapon].pickupOnly) { me.weapon = ''; switchWeapon(bestHeld()); }
      Object.assign(me.ammo, m.ammo);
      updateHp(PLAYER.maxHp);
      $('death').classList.add('hidden');
      $('streak').textContent = '';
      { const k = me.weapon; me.weapon = ''; switchWeapon(k); } for (const g in viewGuns) viewGuns[g].visible = g === me.weapon;
      updateWeaponHud();
      break;
    case 'correct': me.p = m.p.slice(); me.v = [0, 0, 0]; break;
    case 'ammo': me.ammo[m.w] = m.n; if (buffs.inventory && !buffs.inventory.includes(m.w)) buffs.inventory = [...buffs.inventory, m.w]; if (m.equip || me.weapon === 'unarmed' || !me.weapon) { me.weapon = ''; switchWeapon(m.w); } updateWeaponHud(); break;
    case 'pong': rtt = rtt * 0.7 + (now - m.c) * 0.3; net({ t: 'rtt', v: rtt }); break;
    case 'shot': {
      const r = remotes.get(m.id);
      const from = r?.cur ? [r.cur.p[0], r.cur.p[1] + 1.3, r.cur.p[2]] : m.o;
      flashAt(from, 0.6);
      if (WEAPONS[m.w]?.rocketSpeed) { launchRocket(from, m.ends[0]); } else for (const e of m.ends) { tracer(from, e, WEAPONS[m.w]?.color); if (!e[3]) { sparks(e, 0xffd54f, 4); puff(e); } else sparks(e, 0xff1744, 5); }
      const dist = Math.hypot(m.o[0] - me.p[0], m.o[1] - me.p[1], m.o[2] - me.p[2]);
      shotSound(m.w, Math.min(0.8, 6 / (dist + 3)));
      break;
    }
    case 'hit': {
      hitMarker(m.kill ? 'kill' : m.head ? 'head' : '');
      if (m.at) damageNumber(m.at, m.dmg, m.kill ? 'kill' : m.head ? 'head' : '');
      m.kill ? null : m.head ? sfx.head() : sfx.hit();
      break;
    }
    case 'hurt': {
      updateHp(m.hp);
      if (Number.isFinite(m.armor)) { buffs.armor = m.armor; updateArmor(); }
      lastHurtFrom = m.from;
      sfx.hurt();
      vibrate(40);
      shake = Math.min(0.8, shake + 0.3);
      const v = $('vignette'); v.style.transition = 'none'; v.style.opacity = 1; void v.offsetWidth; v.style.transition = ''; v.style.opacity = me.hp < PLAYER.maxHp * 0.35 ? 0.5 : 0;
      showDamageDir(m.from);
      break;
    }
    case 'kill': onKillMsg(m); break;
    case 'mapPing': onMapPing(m); break;
    case 'heal': updateHp(m.hp); toast(t('hud.gotHeart'), '#ff4d6d'); sfx.pickup(); break;
    case 'refill': Object.assign(me.ammo, m.ammo); updateWeaponHud(); toast(t('hud.gotAmmo'), '#69f0ae'); sfx.pickup(); break;
    case 'buffs': onBuffs(m); break;
    case 'items': setItems(m.items); if (m.took && m.took.by !== me.id) itemTakenFx(m.took.id); break;
    case 'vehicles':vehicleVisuals.sync(m.vehicles);mmCars=m.vehicles||[];updateCarHp();break;
    case 'carWreck':if(vehicleVisuals.carOf?.(me.id)||me.vehicle===m.id)toast(t('car.wrecked'),'#ff5a3d');sfx.pickup?.();break;
    case 'vehicleSeat':me.carSmooth=false;me.netP=null;me.vehicle=m.id;me.p=m.p.slice();me.v=[0,0,0];if(Number.isFinite(m.yaw))me.yaw=m.yaw;me.ads=false;updateCarHp();break;
    case 'landed':me.parachuting=false;toast(t('drop.landed'),'#69f0ae');break;
    case 'chests': chestVisuals.sync(m.chests);worldLoot.sync(m.drops||[]);break;
    case 'chestReward': if(m.weapon)switchWeapon(m.weapon);toast(m.kind==='credits'?t('loot.reward',{weapon:'',xp:m.xp,credits:m.credits}):t('loot.collected',{item:m.weapon?t('weapon.'+m.weapon):t('loot.'+m.kind)}),'#71ceff');sfx.pickup();break;
    case 'knifeFlight': {
      const blade=gunModel('knife',0.8); blade.position.set(...m.p); scene.add(blade);
      knifeFlights.set(m.id,{obj:blade,p:[...m.p],v:[...m.v],age:0}); break;
    }
    case 'knifeEnd': { const k=knifeFlights.get(m.id); if(k){scene.remove(k.obj);knifeFlights.delete(m.id);} if(m.at)sparks(m.at,0xeceff1,4); break; }
    case 'boom': explosion(m.at); break;
    case 'leave': { const r = remotes.get(m.id); if (r) { scene.remove(r.group); remotes.delete(m.id); } break; }
    case 'chat': addChat(m); break;
    case 'match': onMatch(m); break;
  }
}

function showDamageDir(from) {
  if (!from) return;
  const dx = from[0] - me.p[0], dz = from[2] - me.p[2];
  const ang = Math.atan2(-dx, -dz) - me.yaw;
  const el = document.createElement('div'); el.className = 'dmg-arc'; // 0.16.14 Rivalz-style arc around the centre
  el.style.transform = `rotate(${-ang}rad)`;
  $('hud').appendChild(el); setTimeout(() => el.remove(), 1100);
}

function onKillMsg(m) {
  killFeed(m.killer, m.victim, m.w, m.head);
  const victim = remotes.get(m.victim);
  if (victim?.cur) eliminationBurst(victim.cur.p, victim.color ?? 0xff2e88);
  if (m.killer === me.id) {
    me.streak = m.streak;
    if (m.head) me.heads++;
    sfx.kill();
    vibrate([30, 40, 60]);
    centerMsg(t('hud.youKilled', { name: nameOf(m.victim) }) + (m.backstab ? t('hud.backstab') : m.head ? t('hud.headshot') : ''), 1800);
    $('streak').textContent = me.streak >= 2 ? t('hud.streak', { n: me.streak }) : '';
    if (m.streakName) { announce(m.streakName); say(m.streakName.toLowerCase()); }
  }
  if (m.victim === me.id) {
    me.alive = false;
    me.ads = false;
    deathUntil = performance.now() + 3000;
    $('death').classList.remove('hidden');
    $('death-by').textContent = t('hud.killedBy', { name: nameOf(m.killer) }) + (m.head ? t('hud.headshotTag') : '');
    lastHurtFrom = m.killer;
    $('streak').textContent = '';
  }
}

function onMatch(m) {
  matchInfo = m;
  if (m.state === 'lobby') {
    // Team modes: back to the lobby after the results screen
    $('end').classList.add('hidden');
    $('touch').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    me.alive = false;
    if (document.pointerLockElement) document.exitPointerLock();
    return;
  }
  $('lobby').classList.add('hidden');
  if (m.state === 'ended') {
    keys.clear(); mouseDown = false;
    if (document.pointerLockElement) document.exitPointerLock();
    const myTeam = roster.find((p) => p.id === me.id)?.team;
    const won = m.winTeam ? m.winTeam === myTeam : m.winner === me.id;
    $('end-title').textContent = m.mode && m.mode !== 'ffa'
      ? (m.winTeam ? t('end.teamWon', { team: t('team.' + m.winTeam) }) : t('end.draw'))
      : won ? t('end.youWon') : t('end.winner', { name: m.winnerName || '' });
    const tb = $('end-board').querySelector('tbody');
    tb.innerHTML = '';
    m.board.forEach((p, i) => tb.appendChild(boardRow(p, [p.kills, p.deaths], i + 1)));
    {const n=awardCoins(won);setTimeout(()=>{$('xp-line').textContent+=t('garage.earned',{n});},0);}
    if (lobby?.offline || lobby?.p2p) awardXp(won); else { $('xp-line').textContent = ''; $('next-goal').textContent = ''; }
    $('end').classList.remove('hidden');
    const tick = () => {
      const s = Math.max(0, Math.ceil((m.next - Date.now()) / 1000));
      $('end-next').textContent = t(m.mode && m.mode !== 'ffa' ? 'end.toLobby' : 'end.next', { s });
      if (matchInfo.state === 'ended') setTimeout(tick, 500);
    };
    tick();
  } else {
    $('end').classList.add('hidden');
    me.heads = 0;
    if (isTouch) $('touch').classList.remove('hidden'); else lockPointer();
  }
}

// ======================= team lobby =======================
let gameMode = 'ffa', lobbyInfo = null, teamScore = null;
function onLobby(m) {
  lobbyInfo = m;
  gameMode = m.mode;
  if (m.state !== 'lobby') return;
  $('lobby').classList.remove('hidden');
  renderLobby();
  renderShop();
}
function renderLobby() {
  const m = lobbyInfo;
  if (!m) return;
  $('lobby-title').textContent = t('lobby.title', { mode: t('mode.' + m.mode), code: roomCode || '' });
  const mine = m.players.find((p) => p.id === me.id);
  for (const team of ['A', 'B']) {
    const col = $('lobby-' + team);
    col.querySelector('h3').textContent = t('team.' + team);
    const list = col.querySelector('ul');
    list.replaceChildren();
    const members = m.players.filter((p) => p.team === team);
    for (let i = 0; i < m.perTeam; i++) {
      const li = document.createElement('li');
      const p = members[i];
      if (p) {
        li.textContent = p.name;
        if (p.id === me.id) li.classList.add('me');
        const st = document.createElement('span');
        st.className = p.ready ? 'ok' : 'wait';
        st.textContent = p.ready ? '✔' : '…';
        li.prepend(st);
      } else {
        li.className = 'open';
        li.textContent = t('lobby.empty');
      }
      list.appendChild(li);
    }
  }
  $('lobby-ready').textContent = t(mine?.ready ? 'lobby.notReady' : 'lobby.ready');
  $('lobby-ready').classList.toggle('on', !!mine?.ready);
  $('lobby-invite').textContent = roomCode ? t('lobby.invite', { code: roomCode }) : '';
  updateLobbyStatus();
}
function updateLobbyStatus() {
  if (!lobbyInfo || $('lobby').classList.contains('hidden')) return;
  const left = lobbyInfo.countdownAt ? Math.max(0, Math.ceil((lobbyInfo.countdownAt - Date.now()) / 1000)) : 0;
  $('lobby-status').textContent = lobbyInfo.countdownAt ? t('lobby.starting', { s: left }) : t('lobby.waiting');
}
setInterval(updateLobbyStatus, 250);
$('lobby-ready').addEventListener('click', () => {
  const mine = lobbyInfo?.players.find((p) => p.id === me.id);
  initAudio();
  net({ t: 'ready', v: !mine?.ready });
});
$('lobby-switch').addEventListener('click', () => {
  const mine = lobbyInfo?.players.find((p) => p.id === me.id);
  net({ t: 'team', team: mine?.team === 'A' ? 'B' : 'A' });
});
$('lobby-leave').addEventListener('click', () => location.reload());

// Local progression (GDD §9–10): XP bar and "one more game" goal
function awardXp(won) {
  const prof = store.get('profile', { xp: 0, level: 1 });
  const gained = me.kills * 100 + me.heads * 50 + (won ? 500 : 100);
  prof.xp += gained;
  const need = (lvl) => 1000 + (lvl - 1) * 250;
  let leveled = false;
  while (prof.xp >= need(prof.level)) { prof.xp -= need(prof.level); prof.level++; leveled = true; }
  store.set('profile', prof);
  $('xp-line').textContent = t('end.xp', { xp: gained, level: prof.level }) + (leveled ? t('end.levelUp') : '');
  $('xp-fill').style.width = '0';
  setTimeout(() => ($('xp-fill').style.width = Math.round((prof.xp / need(prof.level)) * 100) + '%'), 50);
  const left = need(prof.level) - prof.xp;
  $('next-goal').textContent = t('end.goal', { n: Math.ceil(left / 100), level: prof.level + 1 });
  if (leveled) { sfx.kill(); announce('LEVEL UP'); }
  showProfile();
}
function showProfile() {
  if (myProfile) { $('profile').textContent = t('menu.levelCredits', myProfile); return; }
  const prof = store.get('profile', { xp: 0, level: 1 });
  $('profile').textContent = t('menu.level', { level: prof.level, xp: prof.xp });
}

// ======================= input =======================
// Some hosts (embedded frames such as the claude.ai preview, some desktop apps) refuse pointer lock.
// Then the game switches to free-mouse aiming: the visible cursor's movement turns the view, holding it
// near the left/right edge keeps turning, and clicks fire. J/L and I/K also turn and look in any mode.
let thirdPerson = store.get('tpp', true);
function toggleView(){thirdPerson=!thirdPerson;store.set('tpp',thirdPerson);}
let freeMouse = false, cursorX = 0.5, gamePaused=false;
function enterFreeMouse() {
  if (freeMouse || isTouch || gamePaused) return;
  freeMouse = true;
  document.body.classList.add('free-mouse');
  $('pause').classList.add('hidden');
  if (me.id) addChat({ sys: true, key: 'hud.freeMouse' });
}
document.addEventListener('pointerlockerror', enterFreeMouse);
function lockPointer() {
  if (isTouch || !me.id || chatOpen || matchInfo.state !== 'playing') return;
  gamePaused=false;document.body.classList.add('game-active');$('pause').classList.add('hidden');
  try {
    const r = canvas.requestPointerLock?.();
    if (r && r.catch) r.catch(enterFreeMouse);
  } catch { enterFreeMouse(); }
  if (!canvas.requestPointerLock) enterFreeMouse();
  // No lock and no error after a moment (silently ignored): fall back too
  setTimeout(() => { if (document.pointerLockElement !== canvas && me.id && !chatOpen && matchInfo.state === 'playing' && document.hasFocus()) enterFreeMouse(); }, 700);
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if(!locked&&!freeMouse&&!chatOpen&&me.id&&matchInfo.state==='playing')pauseGame();
  if(locked){gamePaused=false;document.body.classList.add('game-active');}
  $('pause').classList.toggle('hidden', !gamePaused && (locked || freeMouse || chatOpen || !me.id || matchInfo.state !== 'playing' || isTouch || !$('admin-panel').classList.contains('hidden')));
  if (!locked) { mouseDown = false; me.ads = false; }
});
function pauseGame(){
  gamePaused=true;keys.clear();touchMove.f=touchMove.s=0;mouseDown=false;me.ads=false;document.body.classList.remove('game-active');$('pause').classList.remove('hidden');
  if(me.vehicle)net({t:'drive',f:0,s:0});if(document.pointerLockElement===canvas)document.exitPointerLock();
}
$('pause-resume').onclick=e=>{e.stopPropagation();initAudio();if(isTouch||freeMouse){gamePaused=false;document.body.classList.add('game-active');$('pause').classList.add('hidden');}else lockPointer();};
$('pause-leave').onclick=e=>{e.stopPropagation();net({t:'leaveRoom'});clearInterval(pinger);ws?.close();location.href=location.pathname;};
$('pause-standalone').href=location.hostname==='127.0.0.1'?location.href:'https://kobifrah1991-svg.github.io/Drop-Havoc/';
canvas.addEventListener('pointerdown',e=>{if(freeMouse&&!gamePaused)canvas.setPointerCapture?.(e.pointerId);});
canvas.addEventListener('click', () => { if (!isTouch) lockPointer(); });

document.addEventListener('mousemove', (e) => {
  cursorX = e.clientX / innerWidth;
  const aiming = document.pointerLockElement === canvas || (freeMouse && me.id && !chatOpen && e.target === canvas);
  if (!aiming || gamePaused || (freeMouse && !e.buttons)) return;
  const k = 0.0022 * sens * (me.ads ? camera.fov / 78 : 1);
  applyLook(me, carLook, -e.movementX * k, -e.movementY * k);
});
document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas && !(freeMouse && e.target === canvas)) return;
  if (e.button === 0) mouseDown = true;
  if (e.button === 2) me.ads = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) { mouseDown = false; semiReady = true; }
  if (e.button === 2) me.ads = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => { if (document.pointerLockElement === canvas || (freeMouse && e.target === canvas)) cycleWeapon(e.deltaY > 0 ? 1 : -1); });

document.addEventListener('keydown', (e) => {
  if (!me.id || chatOpen) return;
  if(e.code==='Escape'){e.preventDefault();if(quickOpen)toggleQuick();else if(!gamePaused)pauseGame();return;}
  if(gamePaused)return;
  if (e.code === 'Tab') { e.preventDefault(); $('scoreboard').classList.remove('hidden'); return; }
  if (e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); openChat(); return; }
  if (e.code === 'F2') { e.preventDefault(); toggleAdminPanel(); return; }
  if (e.code === 'KeyB') { toggleQuick(); return; }
  if (e.code === 'KeyN') { if (!e.repeat) setTalking(true); return; } // 0.16.13: N = talk, V = camera
  if (e.code === 'KeyC' || e.code === 'ControlLeft') { if (!e.repeat) crouchPress(); return; }
  if (e.code === 'KeyG') { if (!e.repeat) slidePress(); return; } // 0.16.30 slide
  if (e.code === 'KeyZ') { if (!e.repeat) setStance(me.stance === 2 ? 0 : 2); return; }
  if (quickOpen && /^Digit[1-6]$/.test(e.code)) { sendQuick(Number(e.code.slice(5)) - 1); return; }
  if (e.code === 'Escape' && quickOpen) { toggleQuick(); return; }
  const slot = WEAPON_ORDER.find((k) => 'Digit' + WEAPONS[k].key === e.code);
  if (slot) { switchWeapon(slot); return; }
  if (e.code === 'KeyH') { summonCar(); return; }
  if (e.code === 'KeyE') { const c=chestVisuals.nearest(me.p);if(me.vehicle||vehicleVisuals.nearby(me.p,me.id))net({t:'vehicleInteract'});else if(worldLoot.nearest(me.p))net({t:'pickupLoot',id:worldLoot.nearest(me.p).id});else if(c)net({t:'openChest',id:c.id});else if(findVault(me.p,me.yaw,MAP.boxes,MAP.bounds))net({t:'vault'});return; }
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyF' || e.code === 'AltLeft') { e.preventDefault(); if (!e.repeat) wantDash = true; return; }
  if (e.code === 'KeyQ') cycleWeapon(1);
  if (e.code === 'KeyX') switchWeapon(lastWeapon); // quick swap to the previous weapon
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  if (e.code === 'KeyN') setTalking(false);
});
addEventListener('blur', () => { keys.clear(); mouseDown = false; setTalking(false); });

// ---- gyro aiming (phones) ----
// Turning the phone turns the view: the gyroscope's rotation rate is added to yaw / pitch, mapped to
// how the screen is held (portrait or either landscape side). Toggle and sensitivity in Settings.
const gyro = {
  on: store.get('gyro', true), sens: store.get('gyroSens', 1.4), adsSens: store.get('gyroAds', 1.3), asked: false, fy: 0, fp: 0,
  ask() { // iOS needs a permission prompt from a user gesture; Android just sends events
    if (this.asked || !isTouch) return;
    this.asked = true;
    const req = window.DeviceMotionEvent?.requestPermission;
    if (typeof req === 'function') req.call(DeviceMotionEvent).catch(() => {});
  },
};
addEventListener('devicemotion', (e) => {
  const r = e.rotationRate;
  if (!gyro.on || !r || !me.alive || chatOpen || !me.id || matchInfo.state !== 'playing') return;
  const dt = Math.min(0.05, (e.interval > 1 ? e.interval / 1000 : e.interval) || 0.016);
  const ang = (screen.orientation?.angle ?? window.orientation ?? 0) % 360;
  const a = r.alpha || 0, b = r.beta || 0, g = r.gamma || 0; // deg/s around the device's z, x, y axes
  let yawRate, pitchRate;
  if (ang === 90) { yawRate = b; pitchRate = -g; }        // landscape, top of the phone to the left
  else if (ang === 270 || ang === -90) { yawRate = -b; pitchRate = g; }
  else { yawRate = g; pitchRate = b; }                    // portrait
  void a;
  if (gamePaused) return;
  // Light low-pass + small dead zone removes hand tremor; a gentle power curve keeps small flicks precise.
  gyro.fy += (yawRate - gyro.fy) * 0.55; gyro.fp += (pitchRate - gyro.fp) * 0.55;
  const curve = (v) => { const m = Math.abs(v); return m < 0.6 ? 0 : Math.sign(v) * (m - 0.6) * (1 + Math.min(0.6, m / 300)); };
  const k = (Math.PI / 180) * dt * gyro.sens * (me.ads ? gyro.adsSens : 1);
  applyLook(me, carLook, curve(gyro.fy) * k, curve(gyro.fp) * k);
});

// ---- touch ----
function setupTouch() {
  const stick = $('stick'), knob = $('stick-knob');
  let stickId = null, lookId = null, lx = 0, ly = 0, sx = 0, sy = 0;
  // Floating joystick: wherever the left thumb lands (left 40% of the screen) becomes its centre
  const R = 62; // max knob travel in px
  const placeStick = (x, y) => {
    sx = x; sy = y;
    stick.style.left = (x - stick.offsetWidth / 2) + 'px';
    stick.style.top = (y - stick.offsetHeight / 2) + 'px';
    stick.style.bottom = 'auto';
    stick.classList.add('active');
  };
  const resetStick = () => { stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; stick.classList.remove('active'); knob.style.transform = ''; };
  const moveStick = (x, y) => {
    let dx = x - sx, dy = y - sy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Small dead zone, then a gentle curve: fine control near the centre, full speed at the edge
    const m = Math.min(1, l / R), k = m < 0.12 ? 0 : Math.pow((m - 0.12) / 0.88, 1.4) / Math.max(m, 1e-6);
    touchMove.s = (dx / R) * k; touchMove.f = (-dy / R) * k;
  };
  stick.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; placeStick(t.clientX, t.clientY); });
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) moveStick(t.clientX, t.clientY);
      else if (t.identifier === lookId && !gamePaused) {
        // Finger look with a little acceleration: slow drags for precision, quick swipes turn fast
        const dx = t.clientX - lx, dy = t.clientY - ly, speed = Math.hypot(dx, dy);
        const k = 0.0045 * sens * (1 + Math.min(1.2, speed / 40)) * (me.ads ? camera.fov / 78 : 1);
        applyLook(me, carLook, -dx * k, -dy * k);
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    initAudio(); gyro.ask();
    for (const t of e.changedTouches) {
      if (stickId === null && t.clientX < innerWidth * 0.4 && t.clientY > innerHeight * 0.3) { stickId = t.identifier; placeStick(t.clientX, t.clientY); moveStick(t.clientX, t.clientY); }
      else if (lookId === null && t.clientX > innerWidth * 0.35) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }
  });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; touchMove.f = touchMove.s = 0; resetStick(); }
      if (t.identifier === lookId) lookId = null;
    }
  };
  addEventListener('touchend', end);
  addEventListener('touchcancel', end);
  const hold = (id, down, up) => {
    const b = $(id);
    b.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); down(); });
    if (up) b.addEventListener('touchend', (e) => { e.preventDefault(); up(); });
  };
  // The fire button also steers the camera while held
  const fire = $('t-fire');
  fire.addEventListener('touchstart', (e) => { e.preventDefault(); mouseDown = true; if (lookId === null) { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
  fire.addEventListener('touchend', (e) => { e.preventDefault(); mouseDown = false; semiReady = true; });
  hold('t-ads', () => { me.ads = !me.ads; $('t-ads').classList.toggle('on', me.ads); });
  // 0.16.9: short captions under the touch buttons so each action is clear (Rivals-style HUD)
  const CAP = { he: { fire: 'ירי', ads: 'כוונת', jump: 'קפיצה', reload: 'טעינה', swap: 'נשק', crouch: 'כריעה', prone: 'שכיבה', dash: 'דאש', slide: 'גלישה', voice: 'דיבור', view: 'מצלמה' },
    en: { fire: 'FIRE', ads: 'AIM', jump: 'JUMP', reload: 'RELOAD', swap: 'SWAP', crouch: 'CROUCH', prone: 'PRONE', dash: 'DASH', slide: 'SLIDE', voice: 'TALK', view: 'CAM' },
    ru: { fire: 'ОГОНЬ', ads: 'ПРИЦЕЛ', jump: 'ПРЫЖОК', reload: 'ПЕРЕЗАР.', swap: 'ОРУЖИЕ', crouch: 'ПРИСЕД', prone: 'ЛЁЖА', dash: 'РЫВОК', slide: 'ПОДКАТ', voice: 'ГОЛОС', view: 'КАМЕРА' },
    ar: { fire: 'إطلاق', ads: 'تصويب', jump: 'قفز', reload: 'تلقيم', swap: 'سلاح', crouch: 'جلوس', prone: 'انبطاح', dash: 'اندفاع', slide: 'انزلاق', voice: 'تحدث', view: 'كاميرا' } };
  const capt = () => { const c = CAP[getLang()] || CAP.en; for (const k in c) { const b = $('t-' + k); if (b) b.dataset.cap = c[k]; } };
  capt(); setInterval(capt, 3000);
  hold('t-jump', () => (wantJump = true));
  hold('t-reload', reload);
  hold('t-swap', () => cycleWeapon(1));
  hold('t-chat', () => (chatOpen ? closeChat(true) : openChat()));
  hold('t-quick', toggleQuick);
  hold('t-score', () => $('scoreboard').classList.toggle('hidden'));
  hold('t-voice', () => setTalking(true), () => setTalking(false)); // hold to talk
  hold('t-crouch', crouchPress);
  hold('t-dash', () => (wantDash = true));
  hold('t-slide', slidePress);
  hold('t-prone', () => setStance(me.stance === 2 ? 0 : 2));
  hold('t-pause', () => (gamePaused ? $('pause-resume').click() : pauseGame()));
  hold('t-view', () => { if (viewButtonAction(!!me.vehicle) === 'cycleCarCam') cycleCarCam(); else toggleView(); });
}
if (isTouch) setupTouch();

// ======================= shop =======================
// The economy service on the server owns balances; this screen only sends requests.
let myProfile = null, shopWs = null;
function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
// A random id kept on this device, so guests keep their credits and skins
function guestToken() {
  let tok = store.get('guestToken', null);
  if (!tok) { tok = uuid(); store.set('guestToken', tok); }
  return tok;
}
function shopSend(msg) {
  const sock = ws && ws.readyState === 1 && !lobby?.offline ? ws : shopWs;
  if (sock && sock.readyState === 1) sock.send(JSON.stringify(msg));
}
function openShop() {
  $('shop').classList.remove('hidden');
  $('shop-status').textContent = '';
  if (ws && ws.readyState === 1 && !lobby?.offline) { shopSend({ t: 'profile' }); renderShop(); return; }
  const sv = selectedServer();
  if (sv.offline) { myProfile = null; renderShop(); $('shop-status').textContent = t('shop.needOnline'); return; }
  $('shop-status').textContent = t('shop.connecting');
  shopWs = new WebSocket(wsUrl(sv));
  shopWs.onopen = () => shopWs.send(JSON.stringify({ t: 'auth', credential: googleCredential, guestToken: guestToken() }));
  shopWs.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'profile') { $('shop-status').textContent = ''; myProfile = m.profile; showProfile(); renderShop(); refreshPreview(); }
    if (m.t === 'shopError') $('shop-status').textContent = t(m.key);
  };
  shopWs.onerror = () => { $('shop-status').textContent = t('shop.error'); };
}
function closeShop() {
  $('shop').classList.add('hidden');
  if (shopWs) { shopWs.close(); shopWs = null; }
  refreshPreview();
}
function renderShop() {
  if ($('shop').classList.contains('hidden')) return;
  $('shop-balance').textContent = myProfile ? t('shop.balance', { n: myProfile.credits }) : '';
  const box = $('shop-items');
  box.replaceChildren();
  for (const slot of SLOTS) {
    const h = document.createElement('h3');
    h.textContent = t('shop.slot.' + slot);
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    for (const item of SHOP.filter((i) => i.slot === slot)) {
      const owned = myProfile?.owned.includes(item.id);
      const equipped = myProfile?.equipped?.[slot] === item.id;
      const card = document.createElement('div');
      card.className = 'shop-card' + (equipped ? ' on' : '');
      const sw = document.createElement('span');
      sw.className = 'swatch' + (item.glow ? ' glow' : '');
      sw.style.background = '#' + (item.tint ?? item.color).toString(16).padStart(6, '0');
      const name = document.createElement('b');
      name.textContent = t('shop.' + item.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.disabled = !myProfile;
      if (!owned) {
        btn.textContent = t('shop.buy', { n: item.price });
        btn.disabled = !myProfile || myProfile.credits < item.price;
        btn.addEventListener('click', () => { btn.disabled = true; shopSend({ t: 'buy', item: item.id, purchaseId: uuid() }); });
      } else if (equipped) {
        btn.textContent = t('shop.unequip');
        btn.addEventListener('click', () => shopSend({ t: 'equip', slot, item: null }));
      } else {
        btn.textContent = t('shop.equip');
        btn.addEventListener('click', () => shopSend({ t: 'equip', slot, item: item.id }));
      }
      const tag = document.createElement('small');
      tag.textContent = equipped ? t('shop.equipped') : '';
      card.append(sw, name, tag, btn);
      grid.appendChild(card);
    }
    box.append(h, grid);
  }
}
$('shop-btn').addEventListener('click', openShop);
$('shop-close').addEventListener('click', closeShop);

// ======================= 0.16.8 garage: buy a car, summon it, E to enter (GTA) =======================
const CAR_PRICES={hatch:300,derby:450,sedan:600,carpavan:750,pickup:900,cartech:1000,suv:1200,van:1200,cyberpunk:1500,goblin:2400};
const garage=()=>store.get('garage',{coins:300,owned:[],sel:null});
const saveGarage=(g)=>store.set('garage',g);
const garageEl=document.createElement('div');garageEl.id='garage';garageEl.className='hidden';garageEl.setAttribute('role','dialog');
garageEl.innerHTML='<div class="shop-card-wrap"><div class="shop-head"><h2 id="garage-title"></h2><span id="garage-balance"></span></div><p class="shop-note" id="garage-note"></p><div class="shop-grid" id="garage-items"></div><button id="garage-close" class="secondary" type="button"></button></div>';
document.body.append(garageEl);
function renderGarage(){const g=garage();$('garage-title').textContent=t('garage.title');$('garage-note').textContent=t('garage.note');$('garage-balance').textContent=t('garage.balance',{n:g.coins});$('garage-close').textContent=t('garage.close');
 const box=$('garage-items');box.replaceChildren();
 for(const [kind,price] of Object.entries(CAR_PRICES)){const owned=g.owned.includes(kind),sel=g.sel===kind;const card=document.createElement('div');card.className='shop-card'+(sel?' on':'');
  const img=document.createElement('img');img.src='icons/actions/car.svg';img.className='garage-car';img.alt='';const name=document.createElement('b');name.textContent=t('veh.'+kind);
  const btn=document.createElement('button');btn.type='button';
  if(!owned){btn.textContent=t('garage.buy',{n:price});btn.disabled=g.coins<price;btn.onclick=()=>{const h=garage();if(h.coins<price||h.owned.includes(kind))return;h.coins-=price;h.owned.push(kind);h.sel=kind;saveGarage(h);sfx.pickup?.();renderGarage();};}
  else{btn.textContent=sel?t('garage.selected'):t('garage.select');btn.disabled=sel;btn.onclick=()=>{const h=garage();h.sel=kind;saveGarage(h);renderGarage();};}
  card.append(img,name,btn);box.append(card);}}
function openGarage(){try{document.exitPointerLock?.();}catch{}garageEl.classList.remove('hidden');renderGarage();}
$('garage-close').onclick=()=>garageEl.classList.add('hidden');
function summonCar(){const g=garage();if(!g.sel||!g.owned.includes(g.sel)){openGarage();return;}if(me.vehicle||!me.alive)return;net({t:'summonVehicle',kind:g.sel});toast(t('garage.summoned'),'#ffb34d');}
const carBtn=document.createElement('button');carBtn.id='t-car';carBtn.className='tbtn';carBtn.setAttribute('aria-label','car');carBtn.hidden=true;carBtn.innerHTML='<img class="ticon" src="icons/actions/car.svg" alt=""><span class="tlbl">'+t('garage.summonBtn')+'</span>';
carBtn.addEventListener('touchstart',(e)=>{e.preventDefault();e.stopPropagation();summonCar();},{passive:false});carBtn.addEventListener('click',(e)=>{e.stopPropagation();summonCar();});document.body.append(carBtn);
{const b=document.createElement('button');b.id='garage-btn';b.className='chip chip-btn';b.type='button';b.textContent='🚗 '+t('garage.open');b.onclick=openGarage;$('shop-btn').after(b);}
// 0.16.13 daily challenge: 5 kills across today's matches = +200 coins (local day key).
const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
function daily(){let d=store.get('daily',null);if(!d||d.day!==dayKey())d={day:dayKey(),goal:5,n:0,done:false};return d;}
function awardCoins(won){const g=garage();let n=me.kills*25+(won?150:50);const d=daily();d.n+=me.kills;if(!d.done&&d.n>=d.goal){d.done=true;n+=200;setTimeout(()=>toast(t('daily.done'),'#ffd24d'),600);}store.set('daily',d);g.coins+=n;saveGarage(g);return n;}
// 0.16.13 engine hum pitched by car speed (synthesised).
let engine=null,lastCarP=null;
function engineTick(dt){if(!actx)return;if(!me.vehicle){if(engine){engine.g.gain.setTargetAtTime(0,actx.currentTime,0.1);}lastCarP=null;return;}
 if(!engine){const o=actx.createOscillator(),o2=actx.createOscillator(),f=actx.createBiquadFilter(),g=actx.createGain();o.type='sawtooth';o2.type='square';f.type='lowpass';f.frequency.value=700;g.gain.value=0;o.connect(f);o2.connect(f);f.connect(g).connect(actx.destination);o.start();o2.start();engine={o,o2,g,v:0};}
 const mc=vehicleVisuals.carOf(me.id),sp=mc?Math.abs(mc.speed||0):(lastCarP&&dt>0?Math.hypot(me.p[0]-lastCarP[0],me.p[2]-lastCarP[2])/dt:0);/* 0.16.27: server car speed, not jittery snapshot deltas */lastCarP=me.p.slice();engine.v+=(Math.min(25,sp)-engine.v)*Math.min(1,dt*4);
 const hz=85+engine.v*8;/* 0.16.27: 55 Hz was below phone-speaker range */engine.o.frequency.setTargetAtTime(hz,actx.currentTime,0.05);engine.o2.frequency.setTargetAtTime(hz*0.5,actx.currentTime,0.05);engine.g.gain.setTargetAtTime(0.06+engine.v*0.003,actx.currentTime,0.1);}

// ======================= admin panel =======================
// Convenience UI for staff. It only sends the same requests as the chat commands;
// every permission and limit is enforced by the server.
const PANEL_ACTIONS = [
  { cmd: 'heal', min: 2 }, { cmd: 'giveweapon', min: 2, arg: 'rifle' }, { cmd: 'teleport', min: 2, arg: '1' },
  { cmd: 'kick', min: 1, confirm: true }, { cmd: 'ban', min: 2, confirm: true, needsReason: true },
];
function renderAdminPanel() {
  $('owner-settings').classList.toggle('hidden',myRole!=='Owner');
  const list = $('admin-list');
  const q = $('admin-search').value.trim().toLowerCase();
  list.replaceChildren();
  for (const p of roster.filter((r) => r.id !== me.id && r.name.toLowerCase().includes(q))) {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const name = document.createElement('b');
    name.textContent = p.name; // bot names already carry their icon
    const actions = document.createElement('div');
    for (const a of PANEL_ACTIONS.filter((x) => ROLE_RANK[myRole] >= x.min && !(p.bot && x.confirm))) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t('admin.act.' + a.cmd);
      btn.addEventListener('click', () => (a.confirm ? askConfirm(a, p) : net({ t: 'admin', cmd: a.cmd, args: [p.name, a.arg].filter(Boolean) })));
      actions.appendChild(btn);
    }
    row.append(name, actions);
    list.appendChild(row);
  }
}
function askConfirm(a, p) {
  const box = $('admin-confirm');
  box.querySelector('p').textContent = t('admin.confirm', { action: t('admin.act.' + a.cmd), target: p.name });
  const reason = box.querySelector('input');
  reason.value = '';
  reason.classList.toggle('hidden', !a.confirm);
  box.classList.remove('hidden');
  box.querySelector('.yes').onclick = () => {
    if (a.needsReason && !reason.value.trim()) { reason.focus(); return; }
    net({ t: 'admin', cmd: a.cmd, args: [p.name, ...(a.cmd === 'ban' ? ['60'] : []), ...reason.value.trim().split(' ').filter(Boolean)] });
    box.classList.add('hidden');
  };
  box.querySelector('.no').onclick = () => box.classList.add('hidden');
}
function toggleAdminPanel(open = $('admin-panel').classList.contains('hidden')) {
  if (ROLE_RANK[myRole] < 1) return;
  $('admin-panel').classList.toggle('hidden', !open);
  $('pause').classList.add('hidden');
  if (open) { if (document.pointerLockElement) document.exitPointerLock(); renderAdminPanel(); $('admin-search').focus(); }
  else if (!isTouch) lockPointer();
}
$('admin-btn').addEventListener('click', () => toggleAdminPanel());
$('admin-close').addEventListener('click', () => toggleAdminPanel(false));
let carCam=store.get('carCam',0);
function cycleCarCam(){carCam=(carCam+1)%3;store.set('carCam',carCam);toast(t('car.cam'+carCam),'#ffb34d');}
window.addEventListener('keydown',e=>{if(e.code==='KeyV'&&!chatOpen&&!e.repeat){if(me.vehicle)cycleCarCam();else toggleView();}});
// 0.16.9: ≡ is the game menu (Roblox/Rivals style). It used onclick only: phones never fire a click while another
// finger is on the joystick, and it sat under the HP bar, so it looked dead. Bind touchstart like every other touch button.
{const sb=$('scoreboard-toggle');const openMenu=(e)=>{e.preventDefault();e.stopPropagation();initAudio();gamePaused?$('pause-resume').click():pauseGame();};
sb.setAttribute('aria-label','menu');sb.addEventListener('touchstart',openMenu,{passive:false});sb.addEventListener('click',openMenu);}
$('admin-search').addEventListener('input', renderAdminPanel);
for(const id of ['owner-email','owner-role'])$(id).addEventListener('keydown',e=>e.stopPropagation());
$('owner-save').onclick=()=>{const email=$('owner-email').value.trim(),role=$('owner-role').value;if(myRole!=='Owner'||!$('owner-email').checkValidity()||!email)return;if(confirm(t('owner.confirm',{email,role})))net({t:'admin',cmd:'setrole',args:[email,role]});};
$('admin-search').addEventListener('keydown', (e) => e.stopPropagation());
$('admin-confirm').querySelector('input').addEventListener('keydown', (e) => e.stopPropagation());

// ======================= language =======================
// Applies the chosen language to static text (data-i18n attributes), direction and dynamic UI.
// Works mid-game: nothing is sent to the server, so the connection is untouched.
function applyLang(lang) {
  document.querySelectorAll('.credit').forEach((a) => { a.href = BRAND.site; a.innerHTML = ''; const b = document.createElement('b'); b.textContent = BRAND.studio; a.append(t('menu.createdBy', { name: BRAND.creator }) + ' · ', b, ' ↗'); });
  setLang(lang);
  store.set('lang', getLang());
  document.documentElement.lang = getLang();
  document.documentElement.dir = LANGS[getLang()].dir;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('#chat-log > div').forEach((el) => el._render?.());
  for (const sel of document.querySelectorAll('.lang-select')) sel.value = getLang();
  if (typeof renderServers === 'function' && $('servers').children.length) renderServers();
  if (typeof refreshPreview === 'function' && preview?.scene) refreshPreview();
  showProfile();
  updateWeaponHud();
  updateScoreboard();
  if (roomCode) $('scoreboard').querySelector('h2').textContent = t('hud.scoreboardRoom', { code: roomCode });
  renderLobby();
  renderShop();
}
for (const sel of document.querySelectorAll('.lang-select')) {
  for (const [code, info] of Object.entries(LANGS)) sel.append(new Option(info.name, code));
  sel.addEventListener('change', (e) => applyLang(e.target.value));
}

// ======================= menu =======================
$('name').value = store.get('name', '');
$('sens').value = sens;
$('sens').addEventListener('input', (e) => { sens = Number(e.target.value); store.set('sens', sens); });
$('difficulty').value = store.get('difficulty', 'normal');
$('difficulty').addEventListener('change', (e) => store.set('difficulty', e.target.value));
$('gyro-on').checked = gyro.on;
$('gyro-on').addEventListener('change', (e) => { gyro.on = e.target.checked; store.set('gyro', gyro.on); if (gyro.on) gyro.ask(); });
$('gyro-sens').value = gyro.sens;
$('gyro-sens').addEventListener('input', (e) => { gyro.sens = Number(e.target.value); store.set('gyroSens', gyro.sens); });
{const ms=$('map-select');if(ms){ms.value=MAP.id;ms.addEventListener('change',e=>{store.set('map',e.target.value);location.reload();});}} // 0.16.21 map select
$('time').value = store.get('time', 'day');
$('time').addEventListener('change', (e) => { store.set('time', e.target.value); location.reload(); });
showProfile();
const offlineOnly = !!window.ARENA_OFFLINE || location.protocol === 'file:';
let lobby = null, googleCredential = null, googleUser = null;
try { googleCredential = sessionStorage.getItem('arena.gcred'); } catch { /* storage blocked */ }
function startOnline(action) {
  const sv=selectedServer(),state=serverState.get(sv?.id),peer=action.t==='p2pHost'||action.t==='p2pJoin';
  if(!peer&&!sv?.offline&&(state?.down||state?.incompatible)){$('menu-status').textContent=t(state.incompatible?'rooms.version':'rooms.unavailable');return;}
  initAudio();
  const name = $('name').value.trim();
  store.set('name', name);
  for (const id of ['play', 'create', 'join-code', 'p2p-host', 'p2p-join']) $(id).disabled = true;
  if (isTouch) document.documentElement.requestFullscreen?.().catch(() => {});
  connect(name, action);
}
function enableMenuButtons() { for (const id of ['play', 'create', 'join-code', 'p2p-host', 'p2p-join']) $(id).disabled = false; }
$('play').addEventListener('click', () => startOnline({ t: 'quickMatch' }));
$('p2p-host').addEventListener('click', () => startOnline({ t: 'p2pHost', mode: $('p2p-mode').value,capacity:Number($('p2p-capacity').value) }));
$('p2p-join').addEventListener('click', () => {
  const code = $('p2p-code').value.trim().toUpperCase();
  if (!validCode(code)) { $('menu-status').textContent = t('menu.codeLength'); return; }
  startOnline({ t: 'p2pJoin', code });
});
for(const [modeId,capId]of [['mode','room-capacity'],['p2p-mode','p2p-capacity']]){
 const mode=$(modeId),cap=$(capId);let preferred=store.get(capId,15);
 const update=()=>{const fixed=mode.value==='duel'?2:mode.value==='team2'?4:0;cap.disabled=!!fixed;cap.value=String(fixed||preferred);};
 cap.onchange=()=>{preferred=Number(cap.value);store.set(capId,preferred);};mode.addEventListener('change',update);update();
}
$('p2p-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('p2p-join').click(); });
function showTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== name));
  store.set('tab', name);
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
showTab(store.get('tab', 'play'));
// Invite links for friend rooms: ?join=CODE
const p2pFromLink = (new URLSearchParams(location.search).get('join') || '').toUpperCase();
if (validCode(p2pFromLink)) { showTab('friends'); $('p2p-code').value = p2pFromLink; $('menu-status').textContent = t('p2p.invitedLink'); }
$('create').addEventListener('click', () => startOnline({ t: 'create', mode: $('mode').value, capacity:Number($('room-capacity').value),public: $('room-public').checked }));
$('join-code').addEventListener('click', () => {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 5) { $('menu-status').textContent = t('menu.codeLength'); return; }
  startOnline({ t: 'joinCode', code });
});

// Invitations from friends (by Gmail) and invite links (?room=CODE)
function showInvite(from, code) {
  const box = $('invite');
  box.querySelector('span').textContent = t('hud.inviteFrom', { from, code });
  box.classList.remove('hidden');
  box.querySelector('.yes').onclick = () => { location.href = location.pathname + '?room=' + code; };
  box.querySelector('.no').onclick = () => box.classList.add('hidden');
}
const roomFromLink = new URLSearchParams(location.search).get('room');
if (roomFromLink) { showTab('servers');$('code').value = roomFromLink.toUpperCase(); $('menu-status').textContent = t('menu.invitedLink'); }

// Google sign-in (only when the server has a Google client ID configured)
function showAccount() {
  if (!googleUser) return;
  $('account').textContent = t('menu.signedIn', { name: googleUser.name, email: googleUser.email });
  $('gsi').classList.add('hidden');
  if (!$('name').value) $('name').value = googleUser.name;
}
let googleReadyFor = null;
function setupGoogle(clientId) {
  if (!clientId || googleUser || googleReadyFor === clientId) { if (!clientId) $('gsi').replaceChildren(); return; }
  googleReadyFor = clientId;
  const render = () => {
    google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => {
        googleCredential = resp.credential;
        try { sessionStorage.setItem('arena.gcred', resp.credential); } catch { /* storage blocked */ }
        // Show the name straight away; the server verifies the token when we connect
        try { const p = JSON.parse(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); googleUser = { name: p.given_name || p.name, email: p.email }; showAccount(); } catch { /* ignore */ }
      },
    });
    google.accounts.id.renderButton($('gsi'), { theme: 'filled_black', size: 'large', text: 'signin_with', locale: 'he' });
  };
  if (window.google?.accounts) return render();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = render;
  document.head.appendChild(s);
}

// ---------- server list ----------
// public/servers.json lists online servers ({ name, region, url }); url "" means the server hosting this page.
const LOCAL_SERVER = { id: 'device', nameKey: 'srv.device', regionKey: 'srv.deviceRegion', offline: true };
let servers = [LOCAL_SERVER];
const serverState = new Map(); // id -> { ping, online, rooms, googleClientId, down }
let selectedServerId = new URLSearchParams(location.search).get('server')||store.get('server', null);
function selectedServer() { return servers.find((sv) => sv.id === selectedServerId) || servers[servers.length - 1]; }
function httpBase(sv) { return sv.url ? sv.url.replace(/\/$/, '') : ''; }
function wsUrl(sv) {
  if (sv?.url) return sv.url.replace(/^http/, 'ws').replace(/\/$/, '');
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
}

function renderServers() {
  const list = $('servers');
  list.replaceChildren();
  const current = selectedServer();
  for (const sv of servers) {
    const st = serverState.get(sv.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'server';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', String(sv === current));
    const dot = document.createElement('span');
    dot.className = 'dot ' + (sv.offline ? 'ok' : !st ? '' : st.down ? 'down' : st.ping > 150 ? 'slow' : 'ok');
    const info = document.createElement('span');
    const title = document.createElement('b'); title.textContent = sv.nameKey ? t(sv.nameKey) : sv.name;
    const sub = document.createElement('small'); sub.textContent = (sv.regionKey ? t(sv.regionKey) : sv.region || '') + (sv.offline ? '' : ' · ' + t('srv.mode'));
    info.append(title, sub);
    const meta = document.createElement('span');
    meta.className = 'meta';
    if (sv.offline) meta.textContent = 'offline';
    else if (!st) meta.textContent = '…';
    else if (st.down) meta.textContent = t('srv.down');
    else if(st.incompatible)meta.textContent=t('rooms.version');
    else {
      const ping = document.createElement('strong'); ping.textContent = st.ping + ' ms';
      meta.append(ping, document.createTextNode(`${st.online} online`));
    }
    btn.append(dot, info, meta);
    btn.addEventListener('click', () => { selectedServerId = sv.id; store.set('server', sv.id); renderServers(); });
    list.appendChild(btn);
  }
  // Online-only controls follow the selected server
  const online = !current.offline;
  document.querySelectorAll('.online-only').forEach((el) => el.classList.toggle('hidden', !online));
  document.querySelectorAll('.practice-only').forEach((el) => el.classList.toggle('hidden', online));
  $('play').textContent = t(online ? 'menu.quickPlay' : 'menu.startPractice');
  $('play-hint').textContent = t(online ? 'menu.hintOnline' : 'menu.hintPractice');
  const st = serverState.get(current.id);
  $('online-count').textContent = online && st && !st.down ? t('srv.counts', { online: st.online, rooms: st.rooms }) : '';
  if(online && st && !st.down&&!st.incompatible)roomBrowser.refresh();
  if (online && st && !st.down) setupGoogle(st.googleClientId);
  else $('gsi').replaceChildren();
}

async function pingServer(sv) {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(httpBase(sv) + '/config', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const cfg = await r.json();
    if(!r.ok)throw Error('unavailable');
    serverState.set(sv.id, { incompatible:cfg.protocol!==GAME_PROTOCOL,ping: Math.round(performance.now() - t0), online: cfg.online, rooms: cfg.rooms, googleClientId: cfg.googleClientId });
  } catch {
    serverState.set(sv.id, { down: true });
  }
  renderServers();
}

async function loadServers() {
  // Served by a game server: it lists itself (servers.json). Static site / APK: no server of their own.
  let list = [];
  if (!offlineOnly) {
    list = [{ nameKey: 'srv.here', regionKey: 'srv.hereRegion', url: '' }];
    try {
      const r = await fetch('servers.json', { cache: 'no-store' });
      if (r.ok) list = await r.json();
    } catch { /* keep the default */ }
  }
  for (const sv of window.ARENA_SERVERS || ONLINE_SERVERS) if (!list.some((x) => x.url === sv.url)) list.push(sv); // ARENA_SERVERS: override for self-hosting / tests
  servers = [LOCAL_SERVER, ...list.map((sv, i) => ({ id: sv.id || 'srv' + i, ...sv }))];
  if (!selectedServerId || !servers.some((sv) => sv.id === selectedServerId)) selectedServerId = offlineOnly ? LOCAL_SERVER.id : servers[1]?.id || LOCAL_SERVER.id;
  renderServers();
  servers.filter((sv) => !sv.offline).forEach(pingServer);
}
const roomBrowser=mountRooms({container:$('room-list'),server:selectedServer,join:code=>startOnline({t:'joinCode',code}),t});
$('rooms-refresh').onclick=()=>roomBrowser.refresh();
$('invite-copy').onclick=()=>{if(!roomCode)return;const url=new URL(location.href);url.search='';url.searchParams.set(lobby?.p2p?'join':'room',roomCode);if(!lobby?.p2p)url.searchParams.set('server',selectedServer()?.id||'');navigator.clipboard?.writeText(url.href).then(()=>addChat({sys:true,key:'p2p.copied'})).catch(()=>{});};
$('invite-many').onclick=()=>{const emails=[...new Set($('friend-emails').value.split(/[\s,;]+/).filter(e=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))].slice(0,4);for(const email of emails)net({t:'invite',email});};
loadServers();
$('servers-refresh').addEventListener('click', () => { serverState.clear(); renderServers(); servers.filter((sv) => !sv.offline).forEach(pingServer); });

// ---------- character select with a live 3D preview ----------
let selectedChar = characterById(store.get('character', CHARACTERS[0].id)).id;
const preview = { renderer: null, scene: null, camera: null, model: null, yaw: 0.5, dragging: false, lastX: 0 };

function initPreview() {
  const c = $('char-preview');
  preview.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
  preview.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  preview.renderer.outputColorSpace = THREE.SRGBColorSpace;
  preview.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  preview.scene = new THREE.Scene();
  preview.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302040, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.5); key.position.set(2, 3, -3); preview.scene.add(key);
  const rim = new THREE.DirectionalLight(0xff2e88, 2); rim.position.set(-3, 2, 2); preview.scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.15 }));
  floor.rotation.x = -Math.PI / 2; preview.scene.add(floor);
  preview.camera = new THREE.PerspectiveCamera(32, 480 / 560, 0.1, 20);
  preview.camera.position.set(0, 1.25, -3.9);
  preview.camera.lookAt(0, 0.95, 0);
  c.addEventListener('pointerdown', (e) => { preview.dragging = true; preview.lastX = e.clientX; c.setPointerCapture(e.pointerId); });
  c.addEventListener('pointermove', (e) => { if (preview.dragging) { preview.yaw += (e.clientX - preview.lastX) * 0.01; preview.lastX = e.clientX; } });
  c.addEventListener('pointerup', () => { preview.dragging = false; });
}

function refreshPreview() {
  if (!preview.scene) return;
  if (preview.model) preview.scene.remove(preview.model.root);
  const color = 0xff2e88;
  const eq = myProfile?.equipped || {};
  const def = characterById(selectedChar);
  // Show the chosen character itself, never a stand-in: wait (with a message) until its model is in
  const ready = soldierReady() && characterLoaded(def.id);
  preview.model = null;
  if (ready) {
    const m = buildSoldier(color, 1, def.id, eq);
    m.gunMount.add(gunModel('rifle', 1, eq.camo));
    preview.model = m;
    preview.scene.add(m.root);
  }
  const failed = !ready && charFailed.has(def.id);
  if (!ready && !failed) ensureCharacter(def.id);
  $('char-loading').textContent = t(failed ? 'menu.charFailed' : 'menu.loadingChar');
  if (failed && charError) { const d = document.createElement('small'); d.className = 'err'; d.textContent = charError; $('char-loading').append(d); }
  $('char-loading').classList.toggle('hidden', ready);
  $('char-name').textContent = t('char.' + def.id);
  // clothing description removed from skin picker
  $('char-kind').textContent = t('char.kind' + (def.civ ? 'Civilian' : 'Soldier') + (def.female ? 'F' : 'M'));
  $('char-kind').className = 'kind ' + (def.civ ? 'civ' : 'mil') + (def.female ? ' f' : ' m');
  document.querySelectorAll('.char-card').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.id === selectedChar)));
}

function chooseChar(id) {
  selectedChar = characterById(id).id;
  store.set('character', selectedChar);
  charFailed.delete(selectedChar); // choosing again retries a failed download
  refreshPreview();
}
function stepChar(dir) {
  const i = CHARACTERS.findIndex((c) => c.id === selectedChar);
  chooseChar(CHARACTERS[(i + dir + CHARACTERS.length) % CHARACTERS.length].id);
}

for (const def of CHARACTERS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'char-card';
  b.dataset.id = def.id;
  b.setAttribute('role', 'radio');
  b.classList.add(def.civ ? 'civ' : 'mil', def.female ? 'f' : 'm'); // circle colour: soldiers dark blue / purple, civilians blue / pink
  const av = document.createElement('i'); av.className = 'av'; av.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.dataset.i18n = 'char.' + def.id; label.textContent = t('char.' + def.id);
  av.textContent = (def.female ? '♀' : '♂');
  b.append(av, label);
  b.addEventListener('click', () => chooseChar(def.id));
  $('char-list').appendChild(b);
}
$('char-list').setAttribute('role', 'radiogroup');
$('char-prev').addEventListener('click', () => stepChar(-1));
$('char-next').addEventListener('click', () => stepChar(1));
initPreview();
refreshPreview();

let previewLast = performance.now();
function previewFrame(now) {
  if ($('menu').classList.contains('hidden')) return; // stop once the game starts
  requestAnimationFrame(previewFrame);
  const dt = Math.min(0.05, (now - previewLast) / 1000);
  previewLast = now;
  if (!preview.dragging) preview.yaw += dt * 0.4;
  if (preview.model) {
    preview.model.root.rotation.y = preview.yaw;
    animate(preview.model, 0, now / 1000, dt);
  }
  preview.renderer.render(preview.scene, preview.camera);
}
requestAnimationFrame(previewFrame);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('play').click(); });

// ======================= main loop =======================
let lastFrame = performance.now(), lastSend = 0, wasParachuting=false;
// 0.16.23: live in-match minimap (top-right HUD), redrawn at ~12 Hz from the active map's bounds.
let mmCars=[],mmLast=0,mmHidden=store.get('minimapHidden',false);const mmLand=mmLandmarks(MAP);
const mmWrap=document.createElement('div');mmWrap.id='minimap';mmWrap.hidden=true;const mmCv=document.createElement('canvas');const mmBtn=document.createElement('button');mmBtn.id='minimap-toggle';mmBtn.type='button';mmBtn.textContent='🗺';mmBtn.hidden=true;
mmBtn.onclick=e=>{e.stopPropagation();mmHidden=!mmHidden;store.set('minimapHidden',mmHidden);mmLast=0;};mmWrap.append(mmCv);document.body.append(mmWrap,mmBtn);
function minimapTick(now){if(now-mmLast<1000/MINIMAP_HZ)return;mmLast=now;const inMatch=!!me.id&&document.body.classList.contains('game-active')||(!!me.id&&isTouch&&!gamePaused);
 const vis=minimapVisible({inMatch,paused:gamePaused,alive:me.alive,parachuting:me.parachuting,hidden:mmHidden});mmBtn.hidden=!inMatch||gamePaused;mmWrap.hidden=!vis;mmBtn.classList.toggle('off',mmHidden);if(!vis)return;
 const S=Math.round(mmWrap.clientWidth||140),dpr=Math.min(2,devicePixelRatio||1);if(mmCv.width!==S*dpr){mmCv.width=mmCv.height=S*dpr;}const ctx=mmCv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
 const enemies=[];for(const r of remotes.values())if(r.cur&&r.alive!==false&&r.group?.visible!==false)enemies.push({p:r.cur.p});
 const data=minimapMarkers({map:MAP,me,enemies,cars:mmCars});drawMinimap(ctx,S,MAP,data,{landmarks:mmLand});drawPings(ctx,S,data.bounds);mmWrap.dataset.bounds=data.bounds;mmWrap.dataset.markers=data.markers.map(m=>m.type).join(',');}
// 0.16.27: long-press minimap -> mapPing (server broadcasts; 1 per player, 8s)
const worldPings=new Map();
function onMapPing(m){const old=worldPings.get(m.id);if(old?.mesh)scene.remove(old.mesh);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,30,8,1,true),new THREE.MeshBasicMaterial({color:m.id===me.id?0x5ef2ff:0xffd24d,transparent:true,opacity:.55,depthWrite:false}));
 mesh.position.set(m.x,15,m.z);scene.add(mesh);worldPings.set(m.id,{...m,until:Date.now()+Math.max(0,Math.min(8000,m.until-Date.now()||8000)),mesh});mmLast=0;}
function pingTick(){const n=Date.now();for(const[id,p]of worldPings)if(n>p.until){scene.remove(p.mesh);p.mesh.geometry.dispose();worldPings.delete(id);}}
function drawPings(ctx,S,B){for(const p of worldPings.values()){const x=(p.x+B)/(2*B)*S,y=(p.z+B)/(2*B)*S;ctx.fillStyle=p.id===me.id?'#5ef2ff':'#ffd24d';ctx.strokeStyle='#000';ctx.beginPath();ctx.moveTo(x,y-6);ctx.lineTo(x+5,y);ctx.lineTo(x,y+6);ctx.lineTo(x-5,y);ctx.closePath();ctx.fill();ctx.stroke();}}
{let t=0,sx=0,sy=0;const pt=e=>{const q=e.touches?.[0]||e.changedTouches?.[0]||e;return[q.clientX,q.clientY];};
 const down=e=>{e.preventDefault();e.stopPropagation();[sx,sy]=pt(e);clearTimeout(t);t=setTimeout(()=>{const r=mmCv.getBoundingClientRect(),B=Number(mmWrap.dataset.bounds)||31;const[x,z]=mmToWorld(sx-r.left,sy-r.top,r.width,B);net({t:'mapPing',x,z});navigator.vibrate?.(30);},450);};
 const move=e=>{const[x,y]=pt(e);if(Math.hypot(x-sx,y-sy)>12)clearTimeout(t);};const up=()=>clearTimeout(t);
 mmCv.addEventListener('touchstart',down,{passive:false});mmCv.addEventListener('mousedown',down);mmCv.addEventListener('touchmove',move);mmCv.addEventListener('mousemove',move);
 for(const ev of['touchend','touchcancel','mouseup','mouseleave'])mmCv.addEventListener(ev,up);}
if(new URLSearchParams(location.search).has('debug'))window.minimapDebug={tick:(n)=>{mmLast=0;minimapTick(n??performance.now());},el:mmWrap};
function frame(now) {
  requestAnimationFrame(frame);
  minimapTick(now);pingTick();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  const tppOn=!!(me.alive&&!me.vehicle&&!me.parachuting&&thirdPerson&&!me.ads&&me.id);
  if(dropAvatar)dropAvatar.group.visible=!!(me.alive&&(me.parachuting||tppOn)&&!vehicleVisuals.drivenBy(me.id));
  if(me.vehicle&&me.netP){const k=1-Math.exp(-22*dt),mc=vehicleVisuals.carOf(me.id),ex=mc?vehicleVisuals.extrap(mc):[0,0];me.p[0]+=(me.netP[0]+ex[0]-me.p[0])*k;me.p[1]+=(me.netP[1]-me.p[1])*k;me.p[2]+=(me.netP[2]+ex[1]-me.p[2])*k;me.yaw=lerpAngle(me.yaw,me.netYaw,k);}
  if(isTouch)document.body.classList.toggle('in-car',!!me.vehicle);
  engineTick(dt);animateKnives(dt);vehicleVisuals.animate(dt);worldLoot.animate(dt);chestVisuals.animate(dt);
  {const vp=vehiclePrompts({alive:me.alive,paused:gamePaused,inVehicle:!!me.vehicle,nearCar:me.alive&&!me.vehicle&&!!vehicleVisuals.nearby(me.p,me.id),touch:isTouch});
  if(!me.alive||gamePaused){lootButton.hidden=true;enterBtn.hidden=true;}else{const c=chestVisuals.nearest(me.p),car=vp.enter;const drop=worldLoot.nearest(me.p);const anyCar=!car&&!me.vehicle&&vehicleVisuals.nearby(me.p);const win=!c&&!car&&!me.vehicle&&!anyCar&&!drop&&me.onGround!==false&&!me.parachuting&&findVault(me.p,me.yaw,MAP.boxes,MAP.bounds);
  const carTxt=vp.label?t(vp.label):'';lootButton.textContent=carTxt||(c?t(c.rare?'loot.rare':'loot.open'):anyCar?t('car.notOwned'):win?t('win.vault'):'');lootButton.hidden=!lootButton.textContent||(vp.button&&!!carTxt);carBtn.hidden=!!me.vehicle;
  enterBtn.hidden=!vp.button;const el=me.vehicle?t('car.exitBtn'):t('car.enterBtn');if(enterBtn.dataset.l!==el){enterBtn.dataset.l=el;enterBtn.innerHTML='<img src="icons/actions/car.svg" alt=""><span>'+el+'</span>';}}}

  if (me.alive && !gamePaused && matchInfo.state === 'playing') {
    let f = 0, s = 0;
    if (!chatOpen) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    }
    f += touchMove.f; s += touchMove.s;
    // Keyboard look (J/L turn, I/K look up/down) and free-mouse edge turning
    const turn = 2.4 * sens * dt;
    if (!chatOpen) {
      if (keys.has('KeyJ')) applyLook(me, carLook, turn, 0);
      if (keys.has('KeyL')) applyLook(me, carLook, -turn, 0);
      if (keys.has('KeyI')) applyLook(me, carLook, 0, turn * 0.7);
      if (keys.has('KeyK')) applyLook(me, carLook, 0, -turn * 0.7);
    }
    if (false && freeMouse && !chatOpen) {
      if (cursorX < 0.08) me.yaw += turn * (1 - cursorX / 0.08) * 1.5;
      else if (cursorX > 0.92) me.yaw -= turn * ((cursorX - 0.92) / 0.08) * 1.5;
    }
    // Jump from crouch or prone stands up first (if there is room)
    if ((keys.has('Space') || wantJump) && me.stance) { setStance(0); keys.delete('Space'); wantJump = false; }
    if (wantDash && me.alive && me.onGround && !me.vehicle && !me.parachuting && !(me.dashCd > 0)) net({ t: 'dash' });
    if(!me.vehicle)step(me, { f, s, jump: keys.has('Space') || wantJump, yaw: me.yaw, ads: me.ads, slide: wantSlide, dash: wantDash, boost: now < buffs.speedUntil ? 1.3 : 1 }, dt, MAP.boxes);
    wantSlide = false; slideTick();
    if (wantDash) { wantDash = false; if (me.dashT > 0 && me.dashCd > PLAYER.dashCooldown - 0.05) onDash(); }
    if (me.padded) { me.padded = false; sfx.pad(); vibrate(25); }
    me.eyeH += (stanceOf(me.stance).eye - me.eyeH) * Math.min(1, dt * 10);
    wantJump = false;
    if (mouseDown) tryFire(now);
    const speed = Math.hypot(me.v[0], me.v[2]);
    bob += dt * speed * 1.6 * (me.onGround ? 1 : 0);
    if(me.vehicle&&(f+','+s)!==lastDrive){lastDrive=f+','+s;lastSend=now;net({t:'drive',f,s});} // 0.16.22: send drive input the moment it changes
    if (now - lastSend > 50) {
      lastSend = now;
      if(me.vehicle){lastDrive=f+','+s;net({t:'drive',f,s});}else net({ t: 'state', p: me.p.map((n) => Math.round(n * 1000) / 1000), yaw: me.yaw, pitch: me.pitch, w: me.weapon, st: me.stance });
    }
  }

  // Camera
  recoil *= Math.pow(0.0005, dt);
  shake *= Math.pow(0.002, dt);
  const sniperScoped = me.ads && me.weapon === 'sniper' && me.alive;
  const targetFov = me.vehicle || me.parachuting ? 86 : me.ads && me.alive ? WEAPONS[me.weapon].adsFov : 78 + (me.slideT > 0 ? 8 : 0); // wider view while sliding
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  if(me.alive&&me.parachuting){
    const own=roster.find(p=>p.id===me.id),key=JSON.stringify([selectedChar,own?.cosmetics,soldierReady()]);
    if(!dropAvatar||dropAvatarKey!==key){if(dropAvatar)scene.remove(dropAvatar.group);dropAvatar=makeRemote({id:me.id,name:'',color:me.color,character:selectedChar,cosmetics:own?.cosmetics});dropAvatar.tag.visible=false;dropAvatarKey=key;}
    dropAvatar.group.visible=true;dropAvatar.group.position.set(...me.p);dropAvatar.group.rotation.y=me.yaw;dropAvatar.canopy.visible=true;
    animate(dropAvatar.char,0,now/1000,dt);for(const gun of Object.values(dropAvatar.guns))gun.visible=false;swayParachute(dropAvatar.canopy,now/1000,me.v[0],me.v[2]);
    const target=new THREE.Vector3(me.p[0],me.p[1]+2.5,me.p[2]),offset=new THREE.Vector3(Math.sin(me.yaw)*10,4.6,Math.cos(me.yaw)*10);
    const distance=offset.length(),direction=offset.clone().normalize(),safe=Math.max(.7,rayWorld(target.toArray(),direction.toArray(),MAP.boxes,distance)-.4);
    const ideal=target.clone().addScaledVector(direction,Math.min(distance,safe));if(!wasParachuting)camera.position.copy(ideal);else camera.position.lerp(ideal,1-Math.exp(-6*dt));camera.lookAt(me.p[0],me.p[1]+1.8,me.p[2]);
  }else if(me.alive&&me.vehicle){
    const target=new THREE.Vector3(me.p[0],me.p[1]+1.35,me.p[2]);
    // 0.16.13: V cycles chase / hood / cinematic.
    // 0.16.24: carLook offsets (touch/mouse/keys/gyro) orbit chase+cinematic and aim the hood cam.
    const ly=me.yaw+carLook.yaw,lp=carLook.pitch,cin=now/4000,offset=carCam===1?new THREE.Vector3(-Math.sin(me.yaw)*0.6,0.25,-Math.cos(me.yaw)*0.6):carCam===2?new THREE.Vector3(Math.sin(ly+1.1+Math.sin(cin)*0.5)*9*Math.cos(lp),2.2+Math.sin(lp)*7,Math.cos(ly+1.1+Math.sin(cin)*0.5)*9*Math.cos(lp)):new THREE.Vector3(Math.sin(ly)*7.5*Math.cos(lp),3.6+Math.sin(lp)*6,Math.cos(ly)*7.5*Math.cos(lp)),length=offset.length(),direction=offset.clone().normalize();
    // Keep the chase camera in front of nearby walls rather than looking through them.
    const safe=Math.max(0.7,rayWorld(target.toArray(),direction.toArray(),MAP.boxes.filter(b=>!b.vehicle),length)-0.35);
    const ideal=target.clone().addScaledVector(direction,Math.min(length,safe));camera.position.lerp(ideal,1-Math.exp(-8*dt));
    if(carCam===1){camera.position.copy(target).add(offset);camera.rotation.set(-lp*0.8,ly,0,'YXZ');}else camera.lookAt(target.x-Math.sin(ly)*3,target.y,target.z-Math.cos(ly)*3);
  }else if(me.alive&&tppOn){
    const own=roster.find(p=>p.id===me.id),key=JSON.stringify([selectedChar,own?.cosmetics,soldierReady()]);
    if(!dropAvatar||dropAvatarKey!==key){if(dropAvatar)scene.remove(dropAvatar.group);dropAvatar=makeRemote({id:me.id,name:'',color:me.color,character:selectedChar,cosmetics:own?.cosmetics});dropAvatar.tag.visible=false;dropAvatarKey=key;}
    const av=dropAvatar;av.group.visible=!vehicleVisuals.drivenBy(me.id);// 0.16.16: no duplicate body while the car's driver clone plays enter/exit
    av.canopy.visible=false;av.group.position.set(...me.p);av.group.rotation.y=me.yaw;
    av.headPivot.rotation.x=me.pitch*0.6;av.arm.rotation.x=me.pitch;av.char.stance=me.stance||0;
    if(av.weapon!==me.weapon){av.weapon=me.weapon;setHold(av.char,me.weapon);}for(const [k,g] of Object.entries(av.guns))g.visible=k===me.weapon;
    animate(av.char,Math.hypot(me.v[0],me.v[2]),now/1000,dt);
    // PUBG-style over-the-shoulder camera: same aim angles as first person, so the crosshair stays true.
    const cp=Math.cos(me.pitch),fwd=new THREE.Vector3(-Math.sin(me.yaw)*cp,Math.sin(me.pitch),-Math.cos(me.yaw)*cp),right=new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw));
    const head=new THREE.Vector3(me.p[0],me.p[1]+me.eyeH+0.35,me.p[2]).addScaledVector(right,0.55);
    const back=fwd.clone().negate(),dist=3.1,safe=Math.max(0.4,rayWorld(head.toArray(),back.toArray(),MAP.boxes.filter(b=>!b.vehicle),dist)-0.3);
    camera.position.copy(head).addScaledVector(back,Math.min(dist,safe));
    camera.rotation.set(me.pitch+(Math.random()-0.5)*shake*0.02,me.yaw+(Math.random()-0.5)*shake*0.02,0,'YXZ');
  }else if (me.alive) {
    camera.position.set(me.p[0], me.p[1] + me.eyeH + Math.sin(bob * 2) * 0.03, me.p[2]);
    camera.rotation.set(me.pitch + (Math.random() - 0.5) * shake * 0.02, me.yaw + (Math.random() - 0.5) * shake * 0.02, 0, 'YXZ');
  } else if (me.id) {
    // Death cam: rise up and look at the killer
    camera.position.y += (me.p[1] + 4 - camera.position.y) * Math.min(1, dt * 2);
    const killer = remotes.get(lastHurtFrom);
    if (killer?.cur) camera.lookAt(killer.cur.p[0], killer.cur.p[1] + 1, killer.cur.p[2]);
    $('death-count').textContent = t('hud.respawnIn', { s: Math.max(0, Math.ceil((deathUntil - now) / 1000)) });
  }

  // Viewmodel sway, bob, recoil, reload dip
  const reloading = now < me.reloadUntil;
  const adsK = me.ads ? 1 : 0;
  const longGun=['rifle','m4','smg','shotgun','sniper','rpg'].includes(me.weapon);
  // Narrow (portrait) screens: bring the weapon toward the centre so it stays visible
  const vmX = (longGun ? 0.30 : 0.22) * Math.min(1, camera.aspect / 1.4);
  vmRoot.position.set(
    vmX * (1 - adsK * 0.65) + Math.sin(bob) * 0.008 * (1 - adsK * 0.8),
    (longGun ? -0.33 : -0.23) + adsK * 0.015 + Math.abs(Math.cos(bob)) * 0.006 - (reloading ? 0.15 : 0),
    -0.52 + Math.min(0.04, recoil * 0.10),
  );
  const sw = Math.max(0, 1 - (now - swingAt) / 250); // knife slash: quick arc across the screen
  vmRoot.rotation.set(Math.min(0.045, recoil * 0.18) + (reloading ? -0.6 : 0) - Math.sin(sw * Math.PI) * 0.5, Math.sin(sw * Math.PI) * 0.9, -Math.sin(sw * Math.PI) * 0.4);
  wasParachuting=!!(me.alive&&me.parachuting);
  vmRoot.visible = me.alive && !sniperScoped && !me.parachuting && !me.vehicle && !tppOn;
  refreshFirstPerson();
  if (fpBody) {
    fpBody.root.visible = vmRoot.visible;
    if (vmRoot.visible) updateFirstPerson(fpBody, vmRoot, me.weapon, Math.hypot(me.v[0], me.v[2]), dt);
  }
  flash.position.set(vmRoot.position.x, vmRoot.position.y + 0.03, vmRoot.position.z - muzzleDistance(me.weapon));
  $('scope').classList.toggle('hidden', !sniperScoped);
  $('crosshair').classList.toggle('hidden', sniperScoped); // stays visible while aiming; the scope has its own reticle
  const spreadPx = 5 + (Math.hypot(me.v[0], me.v[2]) > 1 ? 6 : 0) + (me.onGround ? 0 : 8) + recoil * 40;
  $('crosshair').style.setProperty('--gap', spreadPx + 'px');

  // Timer
  if (matchInfo.state === 'playing' && matchInfo.endsAt) {
    const left = Math.max(0, Math.ceil((matchInfo.endsAt - Date.now()) / 1000));
    $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  }
  if (reloading) $('mag').textContent = '…';

  animateArena(now / 1000);
  animateItems(now / 1000);
  updateBuffHud(now);
  updateRemotes(now, dt);
  updateEffects(dt);
  updateRockets(dt);
  updateCombatHud(now);
  updateDamageNumbers(dt);

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(vmScene, vmCamera);
}
for (const g in viewGuns) viewGuns[g].visible = g === me.weapon;
updateWeaponHud();
requestAnimationFrame(frame);

// Language last: every UI piece it updates exists by now
applyLang(detectLang(store.get('lang', null)));
try {
  const notice = sessionStorage.getItem('arena.notice');
  if (notice) { $('menu-status').textContent = notice; sessionStorage.removeItem('arena.notice'); }
} catch { /* storage blocked */ }
// In-game update: compare this build to version.json on the same origin
try {
  const verEl = document.querySelector('.brand .ver');
  if (verEl) verEl.textContent = 'ALPHA ' + APP_VERSION;
} catch { /* ignore */ }
checkForUpdate({ t }).catch(() => {});

// ======================= 0.16.14 Rivalz combat polish =======================
function onDash() {
  sfx.slide(); vibrate(20);
  document.body.classList.remove('dashing'); void document.body.offsetWidth; document.body.classList.add('dashing');
  setTimeout(() => document.body.classList.remove('dashing'), 320);
  camera.fov += 6;
}
function updateCombatHud(now) {
  // Circular reload progress around the crosshair
  const ring = $('reload-ring'), w = WEAPONS[me.weapon];
  if (ring) {
    const on = me.alive && w && !w.melee && now < me.reloadUntil && w.reload > 0;
    ring.classList.toggle('on', !!on);
    if (on) ring.style.setProperty('--p', (1 - (me.reloadUntil - now) / (w.reload * 1000)).toFixed(3));
  }
  // Dash cooldown on the button
  const db = $('t-dash'); if (db) db.style.setProperty('--cd', Math.max(0, (me.dashCd || 0) / PLAYER.dashCooldown).toFixed(2));
  // Daily tasks overlay (left), live with this match's kills
  const dp = $('daily-panel');
  if (dp && (now - (dp._t || 0) > 500)) {
    dp._t = now; const d = daily(); const n = Math.min(d.goal, d.n + (me.kills || 0)); const done = d.done || n >= d.goal;
    dp.classList.toggle('hidden', !me.id || matchInfo.state !== 'playing');
    dp.innerHTML = `<b>${t('daily.title')}</b><div class="task${done ? ' done' : ''}"><i>${done ? '✓' : ''}</i><span>${t('daily.kills', { n, goal: d.goal })}</span><em>+200</em></div>`
      + `<div class="task${(me.kills || 0) > 0 ? ' done' : ''}"><i>${(me.kills || 0) > 0 ? '✓' : ''}</i><span>${t('daily.firstBlood')}</span></div>`;
  }
  // Last 30 s: MATCH POINT cue; dead: grayscale world
  const left = matchInfo.state === 'playing' && matchInfo.endsAt ? (matchInfo.endsAt - Date.now()) / 1000 : 999;
  document.body.classList.toggle('match-point', left > 0 && left <= 30);
  document.body.classList.toggle('dead-gray', !!me.id && !me.alive && matchInfo.state === 'playing');
}
