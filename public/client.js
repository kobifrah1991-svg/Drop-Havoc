import * as THREE from 'three';
import {createParachute,swayParachute} from './parachute-visuals.js';
import { createChestVisuals } from './chest-visuals.js';
import { createWorldLoot, lootLabelKey } from './world-loot.js';
import { setCharacterGear, buildVest, buildHelmet } from './gear-visuals.js';
import { unpackGear } from './shared/gear.js';
import { mountRooms } from './room-browser.js';
import { createVehicleVisuals } from './vehicle-visuals.js';
import { vehiclePrompts, CAR_HP, carDims, carParts } from './shared/vehicles.js';
let lastDrive='',touchHb=false,mapPicker=null,startMenuRef=null;
import { MAP } from './shared/map.js';
import { FISTS, WEAPONS, WEAPON_ORDER, LOADOUT } from './shared/weapons.js';
import { PLAYER, PARACHUTE, step, rayBox, rayWorld, hitboxes, dirFromAngles, stanceOf, canStance, findVault } from './shared/physics.js';
import { buildArena, followSun, animateArena, setupLighting, buildCharacter, buildGun, registerCharacters, loadCharacter, loadAnimations, characterLoaded, buildSoldier, soldierReady, animate, loadWeapons, muzzleDistance, setHold, buildFirstPerson, updateFirstPerson } from './visuals.js';
import { CHARACTERS, characterById } from './shared/characters.js';
import { createPost } from './post.js';
import { createMapPicker } from './map-picker.js';
import { createIntro } from './intro.js';
import { createLeague } from './league.js';
import { createStartMenu } from './start-menu.js';
import { createContactShadows } from './contact-shadows.js';
import { CAR_HALF } from './shared/vehicles.js';
import { FIREBASE_WEB, SIGNIN_PAGE, discoverFirebase } from './shared/firebase-web.js';
import { t, LANGS, CORE_LANGS, getLang, setLang, detectLang, setTouch } from './shared/i18n.js';
import { ECONOMY, itemById, rotationAt } from './shared/shop.js';
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
import { createCoach } from './coach.js';
import { createMusic } from './music.js';
import { GRAPPLE, grapplePull, grappleCharges } from './shared/grapple.js';
import { createWeaponWheel } from './weapon-wheel.js';
import { createGrass, animateNature, knockTree, GFX, gfxPreset } from './nature.js';
import { animateStreet, walkSignal, knockStreet } from './street-visuals.js';
import { knockDeco, knockCarport } from './city-visuals.js';
import { buildGunShop } from './gunshop-visuals.js';
import { createEventsVisuals } from './events-visuals.js';
import { GUN_ITEMS, gunItem, gunItemLabel, SHOP_REACH } from './shared/gunshop.js';
import { createPedestrians } from './pedestrians.js';
import { createSmashFx } from './smash-fx.js';
const gunModel = (key, scale, camo) => buildGun(key, WEAPONS[key].color, scale, camo);

const $ = (id) => document.getElementById(id);
const lootButton=document.createElement('button');lootButton.id='loot-interact';lootButton.hidden=true;
lootButton.style.cssText='position:fixed;left:50%;bottom:34%;transform:translateX(-50%);z-index:25;padding:12px 22px;background:#112b42e8;border:1px solid #61ceff;border-radius:10px;color:white;font:600 16px Arial;cursor:pointer';
const enterBtn=document.createElement('button');enterBtn.id='t-enter';enterBtn.hidden=true;document.body.append(enterBtn);
// 0.16.50 car prompts like GTA SA multiplayer: [E] + "get in" icon to drive, [E] + "get out" icon inside, and [G] + a
// passenger icon next to a car someone else is driving (free right seat). Tappable on phones (the key letter hides).
const CAR_ICON={
 enter:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 42v-7l5-10c1-2 3-3 5-3h18c2 0 4 1 5 3l5 10v7c0 2-1 3-3 3H11c-2 0-3-1-3-3z" fill="#ffb34d" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M16 33l3-7h16l3 7z" fill="#9fe3ff"/><circle cx="17" cy="45" r="5" fill="#222" stroke="#fff" stroke-width="3"/><circle cx="37" cy="45" r="5" fill="#222" stroke="#fff" stroke-width="3"/><path d="M62 30H48m6-6-6 6 6 6" fill="none" stroke="#69f0ae" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 exit:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M2 42v-7l5-10c1-2 3-3 5-3h18c2 0 4 1 5 3l5 10v7c0 2-1 3-3 3H5c-2 0-3-1-3-3z" fill="#ffb34d" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M10 33l3-7h16l3 7z" fill="#9fe3ff"/><circle cx="11" cy="45" r="5" fill="#222" stroke="#fff" stroke-width="3"/><circle cx="31" cy="45" r="5" fill="#222" stroke="#fff" stroke-width="3"/><path d="M46 30h14m-6-6 6 6-6 6" fill="none" stroke="#ff8a80" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
 ride:'<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M6 44v-7l5-10c1-2 3-3 5-3h26c2 0 4 1 5 3l5 10v7c0 2-1 3-3 3H9c-2 0-3-1-3-3z" fill="#ffb34d" stroke="#fff" stroke-width="3" stroke-linejoin="round"/><path d="M14 35l3-8h11v8zM32 35v-8h11l3 8z" fill="#9fe3ff"/><circle cx="39" cy="22" r="6" fill="#69f0ae" stroke="#fff" stroke-width="2.5"/><path d="M33 33c0-4 3-6 6-6s6 2 6 6" fill="#69f0ae" stroke="#fff" stroke-width="2.5"/><circle cx="16" cy="47" r="5" fill="#222" stroke="#fff" stroke-width="3"/><circle cx="44" cy="47" r="5" fill="#222" stroke="#fff" stroke-width="3"/></svg>'};
const carPrompt=document.createElement('div');carPrompt.id='car-prompts';document.body.append(carPrompt);
const mkCarBtn=(cls)=>{const b=document.createElement('button');b.type='button';b.className='car-p '+cls;b.hidden=true;carPrompt.append(b);return b;};
const carDriveBtn=mkCarBtn('drive'),carRideBtn=mkCarBtn('ride');
const paintCarBtn=(b,key,icon,label)=>{const k=key+icon+label+isTouch;if(b.dataset.k===k)return;b.dataset.k=k;b.innerHTML=(isTouch?'':'<kbd>'+key+'</kbd>')+CAR_ICON[icon]+'<span></span>';b.querySelector('span').textContent=label;};
const rideCar=()=>{if(me.vehicle)return null;const c=vehicleVisuals.nearby(me.p,me.id);return c&&c.driver&&c.driver!==me.id&&!c.passenger&&!c.wrecked?c:null;};
const driveCar=()=>{if(me.vehicle)return null;const c=vehicleVisuals.nearby(me.p,me.id);return c&&!c.driver?c:null;};
carDriveBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();net({t:'vehicleInteract',seat:me.vehicle?null:'driver'});});
carRideBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();net({t:'vehicleInteract',seat:'passenger'});});
function carInteract(){if(me.vehicle||vehicleVisuals.nearby(me.p,me.id)){net({t:'vehicleInteract'});return true;}return false;}
enterBtn.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();carInteract();});
lootButton.onpointerdown=(e)=>{e.preventDefault();e.stopPropagation(); /* pointerdown: phones send no click while a thumb is on the joystick */const c=chestVisuals.nearest(me.p);if(me.vehicle||vehicleVisuals.nearby(me.p,me.id))net({t:'vehicleInteract',seat:me.vehicle?null:'driver'});else if(worldLoot.nearest(me.p))net({t:'pickupLoot',id:worldLoot.nearest(me.p).id});else if(c)net({t:'openChest',id:c.id});else if(findVault(me.p,me.yaw,MAP.boxes,MAP.bounds))net({t:'vault'});};document.body.append(lootButton);
const store = {
  get(k, d) { try { const v = localStorage.getItem('arena.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('arena.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};
// Phones and tablets get the touch controls (joystick, buttons, drag to look). 0.16.44: the old test
// "(hover: none) and (pointer: coarse)" alone missed real phones that report hover (some Samsung browsers, stylus
// phones, "desktop site" mode), leaving them with no joystick. Now: a coarse primary pointer, or a touch screen with
// no fine pointer, or a phone/tablet browser; and as a last resort the first real touch switches to touch controls.
const touchCapable = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const forcedTouch = store.get('touchUI', null); // true / false once known for this device
// 0.16.56 a computer with a mouse (even one with a touch screen, or that reports a "coarse" pointer) gets the
// computer controls: a phone/tablet browser never has a fine pointer, a laptop or desktop always does.
const anyFine = matchMedia('(any-pointer: fine)').matches, desktopLike = !mobileUA && anyFine;
const pickedByUser = !!store.get('touchPick', false); // chosen in Settings > Controls (auto choices can be undone)
const isTouch = forcedTouch !== null ? !!forcedTouch : !desktopLike && (matchMedia('(pointer: coarse)').matches || (touchCapable && (mobileUA || !anyFine)));
// never reload in the middle of a match: then the switch waits for the next game
if (!isTouch && touchCapable && forcedTouch === null && !desktopLike) addEventListener('touchstart', () => { store.set('touchUI', true); if (!me.id) location.reload(); else toast(t('set.touchNext'), '#8ad8ff'); }, { once: true, passive: true });
// a computer that got the touch buttons by an automatic guess (an old version switched for good after one touch on a
// touch-screen laptop): the first real mouse click brings the mouse controls back
if (isTouch && desktopLike && !pickedByUser) addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; store.set('touchUI', false); if (!me.id) location.reload(); else toast(t('set.mouseNext'), '#8ad8ff'); }, { capture: true, once: true });
setTouch(isTouch); // phones get the touch-button wording of prompts
if (isTouch) document.body.classList.add('touch');
document.querySelector('#rotate-hint .rot-x')?.addEventListener('click', () => document.body.classList.add('rot-ok'));

// ======================= renderer & world =======================
const canvas = $('game');
// Graphics quality (Settings): low / medium / high / ultra; "auto" = medium on phones, high on computers
const gfxLevel = gfxPreset(store.get('gfx', 'auto'), isTouch), GQ = GFX[gfxLevel];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || gfxLevel === 'ultra', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, GQ.pixelRatio));
renderer.autoClear = false;
renderer.localClippingEnabled = true; // first-person body: only the arms are drawn
const scene = new THREE.Scene();
const chestVisuals=createChestVisuals(scene);
const worldLoot=createWorldLoot(scene,gunModel);
// ======================= 0.16.50 gun shop (city centre) =======================
// GTA-style counter with a seller and a wall of guns. Match cash comes from kills (server); the menu speaks the game's
// language; every purchase is checked by the server (at the counter, enough cash, the item does something for you).
const gunShop = { at: MAP.gunshop || null, open: false, cash: 0, vendor: null, cat: 'weapons' };
function itemNameEarly(it) { const l = gunItemLabel(it), base = t(l.key); return l.n ? t('loot.level', { item: base, n: l.n }) : base; }
gunShop.view = gunShop.at ? buildGunShop(scene, gunShop.at, { signText: t('gunshop.sign'), gunModel, gearModel: (kind, lvl) => (kind === 'vest' ? buildVest(lvl) : buildHelmet(lvl)), items: GUN_ITEMS, label: itemNameEarly, shadows: false }) : null;
const shopUi = document.createElement('div'); shopUi.id = 'gunshop'; shopUi.hidden = true;
shopUi.innerHTML = '<div class="gs-panel" role="dialog" aria-modal="true"><div class="gs-head"><div><h2></h2><p class="gs-seller"></p></div><b class="gs-cash"></b><button type="button" class="gs-x">✕</button></div><div class="gs-tabs"></div><div class="gs-grid"></div><p class="gs-earn"></p></div>';
document.body.appendChild(shopUi);
const shopBtn = document.createElement('button'); shopBtn.type = 'button'; shopBtn.id = 'gunshop-btn'; shopBtn.hidden = true; document.body.appendChild(shopBtn);
const cashHud = document.createElement('div'); cashHud.id = 'cash-hud'; cashHud.hidden = true; document.body.appendChild(cashHud);
const GS_ICON = { weapons: '🔫', armor: '🛡️', supplies: '🧰' };
function itemName(it) { const l = gunItemLabel(it), base = t(l.key); return l.n ? t('loot.level', { item: base, n: l.n }) : base; }
function renderGunShop() {
  shopUi.querySelector('h2').textContent = t('gunshop.title'); shopUi.querySelector('.gs-seller').textContent = '“' + t('gunshop.seller') + '”';
  shopUi.querySelector('.gs-cash').textContent = t('gunshop.cash', { n: gunShop.cash }); shopUi.querySelector('.gs-earn').textContent = t('gunshop.earn');
  shopUi.querySelector('.gs-x').setAttribute('aria-label', t('gunshop.close'));
  const tabs = shopUi.querySelector('.gs-tabs'); tabs.replaceChildren();
  for (const cat of ['weapons', 'armor', 'supplies']) { const b = document.createElement('button'); b.type = 'button'; b.className = 'gs-tab' + (gunShop.cat === cat ? ' on' : ''); b.textContent = GS_ICON[cat] + ' ' + t('gunshop.cat.' + cat); b.onclick = () => { gunShop.cat = cat; renderGunShop(); }; tabs.appendChild(b); }
  const grid = shopUi.querySelector('.gs-grid'); grid.replaceChildren();
  for (const it of GUN_ITEMS.filter((x) => x.cat === gunShop.cat)) {
    const card = document.createElement('div'); card.className = 'gs-item' + (gunShop.cash < it.price ? ' poor' : '');
    const nm = document.createElement('b'); nm.textContent = itemName(it);
    const pr = document.createElement('span'); pr.className = 'gs-price'; pr.textContent = '$' + it.price;
    const buy = document.createElement('button'); buy.type = 'button'; buy.textContent = t('gunshop.buy'); buy.disabled = gunShop.cash < it.price;
    buy.onclick = () => net({ t: 'buyGun', id: it.id });
    card.append(nm, pr, buy); grid.appendChild(card);
  }
}
function openShop2() { if (gunShop.open || !gunShop.at) return; gunShop.open = true; chatOpen = true; keys.clear(); mouseDown = false; me.ads = false; if (document.pointerLockElement) document.exitPointerLock(); renderGunShop(); shopUi.hidden = false; }
function closeShop2() { if (!gunShop.open) return; gunShop.open = false; chatOpen = false; shopUi.hidden = true; if (!isTouch) lockPointer(); }
shopUi.querySelector('.gs-x').onclick = closeShop2;
shopUi.addEventListener('click', (e) => { if (e.target === shopUi) closeShop2(); });
shopBtn.onclick = openShop2;
const nearShop = () => gunShop.at && me.alive && !me.vehicle && !me.parachuting && Math.hypot(me.p[0] - gunShop.at.p[0], me.p[2] - gunShop.at.p[2]) < SHOP_REACH;
function gunShopTick(now, dt) {
  if (!gunShop.at) return;
  const near = nearShop() && matchInfo.state === 'playing' && !gamePaused;
  if (near && !gunShop.inside && !gunShop.open) openShop2(); // Vice City: step into the checkpoint and the menu opens
  gunShop.inside = near;
  gunShop.view?.update(dt, now / 1000, [me.p, ...[...remotes.values()].filter((r) => r.cur).map((r) => r.cur.p)]);
  shopBtn.hidden = !near || gunShop.open; if (near) shopBtn.textContent = t(isTouch ? 'gunshop.open.touch' : 'gunshop.open');
  if (gunShop.open && !near) closeShop2();
  cashHud.hidden = !me.id || matchInfo.state !== 'playing'; cashHud.textContent = '💵 $' + gunShop.cash;
  // the seller: a real character behind the counter, idling and turning toward you when you come close
  // the seller: a soldier in a helmet and a heavy vest, rifle in hand (a shop full of guns is guarded)
  if (!gunShop.vendor && soldierReady()) { ensureCharacter('ranger'); if (characterLoaded('ranger')) { try {
    const v = buildSoldier(0x2b2f36, 4242, 'ranger', {}); v.root.position.set(...gunShop.at.vendor); v.root.rotation.y = gunShop.at.vendorYaw;
    const gun = gunModel('m4', 1); v.gunMount.add(gun); setHold(v, 'm4'); setCharacterGear(v, 2, 3); scene.add(v.root); gunShop.vendor = v;
  } catch { gunShop.vendor = false; } } }
  if (gunShop.vendor) { const v = gunShop.vendor, dx = me.p[0] - gunShop.at.vendor[0], dz = me.p[2] - gunShop.at.vendor[2];
    const want = Math.hypot(dx, dz) < 10 ? Math.atan2(-dx, -dz) : gunShop.at.vendorYaw; let d = want - v.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); v.root.rotation.y += d * Math.min(1, dt * 3);
    if (Math.hypot(dx, dz) < 60) animate(v, 0, now / 1000, dt); }
}
function onGunShop(m) {
  if (typeof m.cash === 'number') gunShop.cash = m.cash;
  if (m.bought) { const it = gunItem(m.bought); toast('✅ ' + t('gunshop.bought', { item: it ? itemName(it) : m.bought }), '#69f0ae'); sfx.pickup?.(); }
  else if (m.fail) toast(t(m.fail === 'cash' ? 'gunshop.noCash' : m.fail === 'far' ? 'gunshop.far' : 'gunshop.full'), '#ffb34d');
  if (gunShop.open) renderGunShop();
}
const vehicleVisuals=createVehicleVisuals(scene,MAP.boxes,{carDims,carParts,onDrift:(car,dt)=>driftFx(car,dt),hideDriver:(id)=>id===me.id,driverFor:(id)=>{
  // 0.16.4: the driver's own selected character does the GTA enter/exit (works for every selectable character)
  if(!soldierReady())return null;let info=id===me.id?{color:me.color,character:selectedChar,cosmetics:roster.find(p=>p.id===me.id)?.cosmetics}:remotes.get(id)?.info;if(!info)return null;
  const c=buildSoldier(info.color,charSeed++,info.character,info.cosmetics||{});return {root:c.root,char:c};}});
const camera = new THREE.PerspectiveCamera(78, 1, 0.12, 1200);
const shadows = GQ.shadows; // phones default to medium (no shadow maps) to keep 60 fps
if(!store.get('timeReset01618',false)){store.set('time','day');store.set('timeReset01618',true);} // 0.16.18: back to day sky for everyone once
setupLighting(scene, renderer, { shadows, mode: store.get('time', 'day'), shadowSize: GQ.shadowSize, reflections: GQ.reflections, map: MAP.id });
buildArena(scene, MAP.boxes, { shadows, quality: gfxLevel });
// Contact shadows where shadow maps are off (low/medium = phones): trees once, movers every frame
const contactShadows = GQ.shadows ? null : createContactShadows(scene);
contactShadows?.setStatic((MAP.boxes.decorations || []).filter((d) => d.tree).map((d) => ({ x: d.p[0], z: d.p[2], r: 1.7 })));
// Realism layer (colour grade, vignette, grain; bloom on ultra) for "high" and "ultra"
const post = GQ.grade ? createPost(renderer, scene, camera, { bloom: GQ.bloom, night: ['neon', 'factory'].includes(MAP.id) || (MAP.id === 'city' && store.get('time', 'day') === 'night') }) : null;
// Adaptive resolution: when frames get slow the picture renders at fewer pixels (down to 60%), and goes back up
// once the frame time has stayed low; changes are at least 2 s apart so it never flickers between sizes.
let resScale = 1, frameAvg = 16, lastAdapt = 0;
const fpsCap = () => Number(store.get('fps', 60)) === 30 ? 30 : 60;
function adaptResolution(ms, now) {
  if (ms > 250) return; // a hitch (tab switch, loading), not the normal frame time
  frameAvg += (ms - frameAvg) * 0.05;
  if (now - lastAdapt < 2000) return;
  const target = 1000 / fpsCap();
  if (frameAvg > target * 1.3 && resScale > 0.6) resScale = Math.max(0.6, resScale - 0.1);
  else if (frameAvg < target * 0.9 && resScale < 1) resScale = Math.min(1, resScale + 0.1);
  else return;
  lastAdapt = now; resize();
}
// 3D grass on the city lawns around the camera (not on roads, in houses, on driveways or over park loot)
const parkLoot = (MAP.floorLoot || []).filter((f) => f.p[1] === 0 && !(MAP.buildings || []).some((b) => Math.abs(f.p[0] - b.center[0]) < 8 && Math.abs(f.p[2] - b.center[2]) < 8)); // loot on lawns (not in houses)
// 0.16.44: the lawn test is remembered per 0.5 m cell, so moving the grass patch around the camera (driving) never stutters
const grassAllowedCache = new Map();
const grassAllowed = (fn) => (x, z) => { const k = Math.round(x * 2) * 100000 + Math.round(z * 2); let v = grassAllowedCache.get(k); if (v === undefined) { v = fn(x, z); if (grassAllowedCache.size < 400000) grassAllowedCache.set(k, v); } return v; };
const grass = MAP.id === 'city' ? createGrass(scene, { radius: GQ.grass, spacing: GQ.grassSpacing, allowed: grassAllowed((x, z) => {
  if (Math.abs(x) > 109 || Math.abs(z) > 109) return false;
  for (const c of MAP.roads || [-38, 0, 38]) if (Math.abs(x - c) < 7.4 || Math.abs(z - c) < 7.4) return false; // road + sidewalk
  if (MAP.plaza && Math.hypot(x, z) < MAP.plaza.R + 1) return false;
  if ((MAP.roundabouts || []).some((r) => Math.hypot(x - r.p[0], z - r.p[2]) < r.R + 2.5)) return false;
  for (const b of MAP.buildings || []) { const [hx, , hz] = b.center, w = b.floors ? 13 : 11, d = b.floors ? 11 : 8.5; if (x > hx + 2.5 - w && x < hx + 2.5 + w && z > hz - d && z < hz + d) return false; } // 0.16.55 the paved yard (city-visuals)
  for (const f of parkLoot) if (Math.abs(x - f.p[0]) < 1.4 && Math.abs(z - f.p[2]) < 1.4) return false;
  for (const g of MAP.playgrounds || []) if (Math.abs(x - g.p[0] - 4.4) < 1.6 && Math.abs(z - g.p[2] - 4.2) < 1.6) return false; // sandbox
  for (const f of MAP.fountains || []) if (Math.abs(x - f.p[0]) < 2.1 && Math.abs(z - f.p[2]) < 2.1) return false;
  return true;
}) }) : { update() {} };
// GTA-style: cars smash through street furniture and small trees (the server lets them pass; this draws it).
// A hit object tips over away from the car with debris and a crash, and stands back up after a minute.
const breakables = MAP.boxes.filter((b) => b.breakable);
const smashFx = createSmashFx(scene, { shadows });
const _smashV = new THREE.Vector3();
let smashCombo = 0, smashLast = 0;
const knocked = [];
// The window-vault prompt checks walls around you: 6 times a second is plenty (it was every frame)
let vaultAt = 0, vaultVal = null;
function vaultNear(now) { if (now - vaultAt > 160) { vaultAt = now; vaultVal = findVault(me.p, me.yaw, MAP.boxes, MAP.bounds); } return vaultVal; }
function smashTick(now) {
  if (!breakables.length) return;
  for (const car of vehicleVisuals.list()) {
    if (Math.abs(car.speed) < 3) continue;
    const [x, , z] = car.p;
    for (const b of breakables) {
      if (b.knockedUntil > now || x < b.min[0] - 2 || x > b.max[0] + 2 || z < b.min[2] - 2 || z > b.max[2] + 2) continue;
      const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, l = Math.hypot(cx - x, cz - z) || 1, dx = (cx - x) / l, dz = (cz - z) / l;
      b.knockedUntil = now + 60000; knocked.push(b);
      if (b.tree !== undefined) knockTree(b.tree, dx, dz);
      else if (b.bench !== undefined) knockStreet('bench', b.bench, dx, dz);
      else if (b.light !== undefined) knockStreet('light', b.light, dx, dz);
      else if (b.color === 0xbbb4a3) knockDeco(cx, cz, dx, dz);
      else if (b.carport !== undefined) knockCarport(b.carport, dx, dz);
      const at = [cx, Math.min(1.2, b.max[1]), cz];
      const recipe = b.tree !== undefined ? 'tree' : b.bench !== undefined ? 'bench' : b.light !== undefined ? 'light' : b.color === 0x454e55 ? (b.max[1] > 4 ? 'lamp' : 'post') : b.color === 0xbbb4a3 ? 'stone' : 'play';
      smashFx.smash(recipe, at, [-Math.sin(car.yaw) * car.speed, -Math.cos(car.yaw) * car.speed], b.max[1] - b.min[1]);
      if (recipe === 'light' || recipe === 'lamp') sparks([cx, 3, cz], 0xffe9a0, 10);
      puff(at, recipe === 'tree' ? 0x4f6b35 : recipe === 'stone' ? 0xd9e8f0 : 0xbdb6a6, 0.5);
      const dist = camera.position.distanceTo(_smashV.set(cx, 1, cz));
      if (dist < 60) sfx.smash(recipe, Math.max(0.15, 1 - dist / 60));
      if (car.driver === me.id) { // your own smash: a short jolt and a combo counter
        shake = Math.min(0.5, shake + 0.18); vibrate(20);
        smashCombo = now - smashLast < 2500 ? smashCombo + 1 : 1; smashLast = now;
        toast(t('smash.combo', { n: smashCombo }), '#ffb34d');
      }
      peds.scare(at);
    }
  }
  while (knocked.length && knocked[0].knockedUntil <= now) { // stand them back up
    const b = knocked.shift();
    if (b.tree !== undefined) knockTree(b.tree, 0, 0, true); else if (b.bench !== undefined) knockStreet('bench', b.bench, 0, 0, true); else if (b.light !== undefined) knockStreet('light', b.light, 0, 0, true); else if (b.color === 0xbbb4a3) knockDeco((b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2, 0, 0, true); else if (b.carport !== undefined) knockCarport(b.carport, 0, 0, true);
  }
}
// People on the sidewalks (city only; this device only). Civilian models load in the background.
const CIV = ['maya', 'avi', 'noa', 'omer', 'shira', 'eli'];
let pedsRequested = false;
const peds = MAP.id === 'city' ? createPedestrians(scene, { walkways: MAP.walkways, count: GQ.pedestrians, walkSignal, cars: () => vehicleVisuals.list(),
  animate: (c, speed, tt, dtt) => animate(c, speed, tt, dtt),
  make: (i) => {
    if (!pedsRequested) { pedsRequested = true; CIV.slice(0, 4).forEach((id) => ensureCharacter(id)); }
    if (!soldierReady()) return null;
    const ready = CIV.filter((id) => characterLoaded(id)), id = ready.length ? ready[i % ready.length] : null;
    if (!id && i > 1) return null; // wait for civilian models rather than filling the street with soldiers
    const c = buildSoldier(0xffffff, 100 + i, id || selectedChar, {}); setHold(c, 'unarmed'); return c;
  } }) : { update() {}, scare() {}, sync() {} };

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
// 0.16.57 first person with empty hands: two fists in a boxing guard at the bottom of the screen (gloved, so they fit
// every character); a punch drives one straight to the centre of the view and back, the third quick one hooks in.
const vmFists = new THREE.Group(); vmFists.visible = false; vmRoot.add(vmFists);
{ const glove = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.65 }), sleeve = new THREE.MeshStandardMaterial({ color: 0x4b5a3c, roughness: 0.9 }), knuckle = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.userData.side = s;
    const fist = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.075, 0.1), glove); arm.add(fist);
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.087, 0.03, 0.03), knuckle); k.position.set(0, 0.022, -0.04); arm.add(k);
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.34, 10), sleeve); fore.rotation.x = Math.PI / 2 - 0.35; fore.position.set(s * 0.02, -0.06, 0.17); arm.add(fore);
    vmFists.add(arm);
  } }
function updateFpFists() {
  const now = performance.now();
  for (const arm of vmFists.children) {
    const s = arm.userData.side, base = [s * 0.17, -0.19, -0.36];
    let ext = 0, heavy = false;
    if (fpPunch && fpPunch.side === s) { heavy = fpPunch.heavy; const k = (now - fpPunch.t) / (heavy ? 420 : 330); ext = k >= 1 ? 0 : k < 0.12 ? -0.15 * (k / 0.12) : k < 0.4 ? -0.15 + 1.15 * Math.sin((k - 0.12) / 0.28 * Math.PI / 2) : k < 0.52 ? 1 : 1 - (k - 0.52) / 0.48; }
    const reach = heavy ? [-s * 0.02, -0.1, -0.5] : [s * 0.03, -0.11, -0.62];
    arm.position.set(base[0] + (reach[0] - base[0]) * ext, base[1] + (reach[1] - base[1]) * ext + Math.sin(now / 260 + s) * 0.004, base[2] + (reach[2] - base[2]) * ext);
    arm.rotation.set(0.15 - 0.1 * ext, s * (0.25 - (heavy ? 0.9 : 0.25) * Math.max(0, ext)), s * -0.2 * Math.max(0, ext));
  }
}
const flash = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.85 }));
flash.visible = false;
vmScene.add(flash);
const flashLight = new THREE.PointLight(0xffd27a, 0, 8);
scene.add(flashLight);

function resize() {
  const w = innerWidth, h = innerHeight, ratio = Math.min(devicePixelRatio, GQ.pixelRatio) * resScale;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  post?.setSize(w, h, ratio);
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
const music = createMusic(() => actx, () => noise); // 0.16.55 menu music
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
// GTA-style drift: tyre smoke from the rear wheels and a screech (near the camera only)
function driftFx(car, dt) {
  car.smokeT = (car.smokeT || 0) - dt;
  if (car.smokeT > 0) return;
  car.smokeT = 0.06;
  const r = car.root, y = r.rotation.y, near = camera.position.distanceTo(r.position) < 40;
  if (!near) return;
  for (const side of [-1, 1]) {
    const x = side * 1.2, z = 2.0; // rear wheels in car space (car forward is -Z)
    puff([r.position.x + Math.cos(y) * x + Math.sin(y) * z, 0.25, r.position.z - Math.sin(y) * x + Math.cos(y) * z], 0xe9e9e9, 0.35);
  }
  if ((car.skidT = (car.skidT || 0) - 0.06) <= 0) { car.skidT = 0.24; sfx.skid(Math.max(0.15, 1 - camera.position.distanceTo(r.position) / 40)); }
}
// Smash sounds per material: wood cracks, metal clangs and rings, glass shatters, stone thumps (all synthesised)
function noiseHit(t0, type, freq, q, vol, dur) { const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = actx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); src.connect(f).connect(g).connect(actx.destination); src.start(t0, Math.random() * 0.5, dur + 0.05); }
function ring(t0, freq, vol, dur, type = 'triangle') { const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.frequency.exponentialRampToValueAtTime(freq * 0.92, t0 + dur); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur); o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02); }
const sfx = {
  smash: (kind, vol = 1) => {
    if (!actx) return; const t0 = actx.currentTime;
    noiseHit(t0, 'lowpass', 900, 0.7, 0.5 * vol, 0.18); // the impact itself
    if (kind === 'bench' || kind === 'tree') { noiseHit(t0 + 0.01, 'bandpass', 520, 3, 0.45 * vol, 0.12); noiseHit(t0 + 0.06, 'bandpass', 380, 4, 0.3 * vol, 0.2); if (kind === 'tree') noiseHit(t0 + 0.12, 'highpass', 2500, 0.5, 0.15 * vol, 0.6); } // crack, splinter, rustling leaves
    if (kind === 'light' || kind === 'lamp' || kind === 'post' || kind === 'play') { ring(t0, 310 + Math.random() * 60, 0.22 * vol, 0.7); ring(t0, 735 + Math.random() * 80, 0.12 * vol, 0.5); ring(t0, 1480, 0.05 * vol, 0.35, 'sine'); } // metal clang and ring
    if (kind === 'light' || kind === 'lamp') { noiseHit(t0 + 0.02, 'highpass', 4500, 0.8, 0.3 * vol, 0.35); for (let i = 0; i < 4; i++) ring(t0 + 0.05 + Math.random() * 0.25, 3000 + Math.random() * 3000, 0.04 * vol, 0.08, 'sine'); } // glass shatter and tinkles
    if (kind === 'stone') { noiseHit(t0, 'lowpass', 220, 1, 0.6 * vol, 0.35); noiseHit(t0 + 0.08, 'bandpass', 1200, 1, 0.2 * vol, 0.5); } // stone thud and water splash
  },
  skid: (vol = 1) => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 6; const g = actx.createGain(); g.gain.setValueAtTime(0.12 * vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28); src.connect(f).connect(g).connect(actx.destination); src.start(t0, Math.random() * 0.5, 0.3); },
  horn: (vol = 1) => { blip(392, 0.45, 'square', 0.09 * vol); blip(494, 0.45, 'square', 0.07 * vol); },
  swing: () => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(3000, t0 + 0.15); const g = actx.createGain(); g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 0.2); },
  pad: () => { blip(220, 0.25, 'sine', 0.2); blip(660, 0.18, 'triangle', 0.12, 0.05); },
  pickup: () => { blip(880, 0.07, 'sine', 0.15); blip(1320, 0.1, 'sine', 0.13, 0.06); },
  boom: (vol = 1) => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, t0); f.frequency.exponentialRampToValueAtTime(60, t0 + 0.9); const g = actx.createGain(); g.gain.setValueAtTime(0.6 * vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 1); },
  slide: () => { if (!actx) return; const t0 = actx.currentTime; const src = actx.createBufferSource(); src.buffer = noise; const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t0); f.frequency.exponentialRampToValueAtTime(300, t0 + 0.5); const g = actx.createGain(); g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55); src.connect(f).connect(g).connect(actx.destination); src.start(t0, 0, 0.6); },
  hit: () => blip(1400, 0.05, 'square', 0.12),
  grapple: (vol = 1) => { if (!actx) return; const t0 = actx.currentTime; noiseHit(t0, 'bandpass', 1800, 2, 0.35 * vol, 0.12); ring(t0 + 0.12, 180, 0.25 * vol, 0.12, 'sine'); }, // thwip... plunk
  grappleMiss: () => { if (!actx) return; noiseHit(actx.currentTime, 'bandpass', 1500, 2, 0.25, 0.1); },
  punch: (heavy) => { if (!actx) return; const t0 = actx.currentTime; noiseHit(t0, 'lowpass', heavy ? 380 : 520, 0.9, heavy ? 0.75 : 0.55, heavy ? 0.22 : 0.14); ring(t0, heavy ? 70 : 95, heavy ? 0.35 : 0.22, 0.16, 'sine'); }, // 0.16.57 a body blow, not a beep
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
// Free roam (FiveM / GTA Online style): passive-mode switch in the HUD
let roomMode = 'ffa', passiveOn = false;
const passiveBtn = document.createElement('button'); passiveBtn.id = 'passive-btn'; passiveBtn.type = 'button'; passiveBtn.hidden = true;
document.body.appendChild(passiveBtn);
function updatePassiveBtn() {
  passiveBtn.hidden = roomMode !== 'roam' || !me.id;
  passiveBtn.classList.toggle('on', passiveOn);
  passiveBtn.textContent = (passiveOn ? '🕊 ' : '⚔️ ') + t(passiveOn ? 'roam.passiveOn' : 'roam.passiveOff');
}
passiveBtn.addEventListener('click', (e) => { e.stopPropagation(); net({ t: 'passive', on: !passiveOn }); });
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
    { const inCar = vehicleVisuals.drivenBy(rid); r.group.visible = true; for (const ch of r.group.children) if (ch !== r.tag && ch !== r.shield && ch !== r.canopy) ch.visible = !inCar; r.tag.position.y = inCar ? 2.9 : 2.3; } // 0.16.42: in a car the body hides but the name tag + minimap dot stay
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
    r.char.aiming = !!b[b.length - 1].a || now - (r.lastShotAt || -9e9) < 1500; // gun comes up only when aiming or firing
    setCharacterGear(r.char, ...unpackGear(b[b.length - 1].g)); // helmet + vest you can see
    animate(r.char, r.speed, now / 1000, dtFrame);
    const distance=camera.position.distanceTo(r.group.position),pixels=distance>45?11:distance>20?14:18;
    const worldHeight=Math.max(0.28,distance*2*Math.tan(camera.fov*Math.PI/360)*pixels/Math.max(1,innerHeight));
    r.tag.scale.set(worldHeight*4,worldHeight,1);
    r.shield.visible = !!b[b.length - 1].sp;
    { const pc = b[b.length - 1].parachuting; r.canopy.visible = pc === 2 || pc === true; if (pc === 1) skydivePose(r.char, true, null, now); } // 1: free fall (no canopy yet)
    for(const [key,gun]of Object.entries(r.guns))gun.visible=!r.canopy.visible&&key===w;
    if(r.canopy.visible){for(const gun of Object.values(r.guns))gun.visible=false;swayParachute(r.canopy,now/1000); }
  }
}
// ---- GTA-style skydive: pose, wind, canopy opening, altimeter ----
// Free fall: body flat, belly to the ground, arms and legs spread; diving tips the head down.
function skydivePose(c, falling, v, now) {
  const body = c?.body || c?.root;
  if (!body) return;
  if (!falling) { if (c.skydive) { body.rotation.x = 0; c.skydive = false; } return; }
  c.skydive = true;
  const dive = v ? Math.min(1, Math.max(0, (-v[1] - 40) / 18)) : 0;
  body.rotation.x = -1.25 - dive * 0.35 + Math.sin(now / 160) * 0.03; // flutter in the wind
  const b = c.bones;
  if (b?.rArm && b?.lArm) { b.rArm.rotation.z -= 0.9; b.lArm.rotation.z += 0.9; } // arms out (relative to the animation pose)
}
let windNode = null;
function skydiveTick(dt, now) {
  if (me.chuteJustOpened) { // the jolt of the canopy catching air
    me.chuteJustOpened = false;
    shake = Math.min(1, shake + 0.8); vibrate([30, 40, 60]); sfx.boom(0.25); toast(t('drop.opened'), '#8ad8ff');
  }
  const fall = me.parachuting ? Math.max(0, -me.v[1]) : 0;
  if (actx) {
    if (!windNode && fall > 6) {
      const src = actx.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = actx.createGain(); g.gain.value = 0; src.connect(f).connect(g).connect(actx.destination); src.start();
      windNode = { src, f, g };
    }
    if (windNode) {
      windNode.g.gain.setTargetAtTime(Math.min(0.35, fall / 140), actx.currentTime, 0.15);
      windNode.f.frequency.setTargetAtTime(300 + fall * 25, actx.currentTime, 0.2);
      if (!me.parachuting) { windNode.g.gain.setTargetAtTime(0, actx.currentTime, 0.2); const n = windNode; windNode = null; setTimeout(() => { try { n.src.stop(); } catch { /* stopped */ } }, 800); }
    }
  }
  if (fall > 30) shake = Math.max(shake, 0.12); // buffeting at free-fall speed
  const el = $('alti');
  if (el) {
    el.hidden = !me.parachuting;
    if (me.parachuting) el.textContent = t(me.chuteOpen ? 'drop.altCanopy' : 'drop.altFree', { m: Math.max(0, Math.round(me.p[1])), kmh: Math.round(fall * 3.6) });
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
  $('leader').textContent = lead ? (roomMode === 'roam' ? t('hud.roamLeader', { name: lead.name, kills: lead.kills }) : t('hud.leader', { name: lead.name, kills: lead.kills, limit: killLimit })) : '';
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
const bestHeld = () => ['m16','m4','rifle','smg','shotgun','sniper','pistol','knife','bat','baton'].find(hasWeapon) || 'unarmed';
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
// GTA-style weapon wheel: hold Q / long-press the swap button
const wheel = createWeaponWheel({
  list: () => WEAPON_ORDER.filter(hasWeapon),
  pick: (k) => switchWeapon(k),
  label: (k) => t('weapon.' + k),
  ammo: (k) => (WEAPONS[k].melee ? '∞' : `${me.ammo[k] ?? 0} / ${WEAPONS[k].mag}`),
});
let qTimer = 0, qDown = false;
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

// ======================= 0.16.58 plunger grapple =======================
// V (or the rope button): fire a plunger along the crosshair; it sticks to the first wall, roof edge, pole or car and
// reels you in. Press again or jump to let go early; you keep your speed, so you can swing up onto a roof.
const ropeMat = new THREE.LineBasicMaterial({ color: 0xf2efe6 });
const plungerMat = new THREE.MeshStandardMaterial({ color: 0xe0303f, roughness: 0.5 }), stickMat = new THREE.MeshStandardMaterial({ color: 0xd8b27a, roughness: 0.8 });
function makeRope() {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 12), 3));
  const line = new THREE.Line(g, ropeMat); line.frustumCulled = false; line.visible = false; scene.add(line);
  const cup = new THREE.Group();
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 0.12, 14, 1, true), plungerMat); bell.rotation.x = Math.PI / 2; cup.add(bell);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 6), stickMat); stick.rotation.x = Math.PI / 2; stick.position.z = 0.2; cup.add(stick);
  cup.visible = false; scene.add(cup);
  return { line, cup, shotAt: 0 };
}
const myRope = makeRope(), ropes = new Map(); // other players' ropes: id -> { line, cup, pt, shotAt }
const grappleLocal = { grappleN: GRAPPLE.charges, grappleRegenAt: performance.now() };
function drawRope(r, from, pt, now) {
  // the plunger flies out for 0.12 s, then the rope sags a little until it pulls tight
  const fly = Math.min(1, (now - r.shotAt) / 120), end = new THREE.Vector3().lerpVectors(from, pt, fly);
  const pos = r.line.geometry.attributes.position, n = pos.count, sag = Math.max(0, 0.35 - (now - r.shotAt) / 900) * from.distanceTo(end) * 0.08;
  for (let i = 0; i < n; i++) { const t = i / (n - 1); pos.setXYZ(i, from.x + (end.x - from.x) * t, from.y + (end.y - from.y) * t - Math.sin(Math.PI * t) * sag, from.z + (end.z - from.z) * t); }
  pos.needsUpdate = true; r.line.visible = true;
  r.cup.position.copy(end); r.cup.lookAt(from); r.cup.visible = true;
}
function hideRope(r) { r.line.visible = false; r.cup.visible = false; }
function grappleAvailable() { return grappleCharges(grappleLocal, performance.now()); }
function fireGrapple() {
  if (me.grapple) { releaseGrapple(false); return; }
  if (!me.alive || !me.id || me.vehicle || me.parachuting || me.down || gamePaused || chatOpen || matchInfo.state !== 'playing') return;
  if (grappleAvailable() < 1) { sfx.empty(); toast(t('grapple.empty'), '#ffb020'); return; }
  // aim where the crosshair points: the first wall the camera's ray meets, then rope from the eye to that spot
  const eye = [me.p[0], me.p[1] + (me.eyeH || PLAYER.eye), me.p[2]];
  const cam = camera.getWorldPosition(new THREE.Vector3()), cd = camera.getWorldDirection(new THREE.Vector3());
  const camHit = rayWorld([cam.x, cam.y, cam.z], [cd.x, cd.y, cd.z], MAP.boxes, GRAPPLE.range + 8);
  const aimPt = cam.clone().addScaledVector(cd, Math.min(camHit, GRAPPLE.range + 8));
  const d = [aimPt.x - eye[0], aimPt.y - eye[1], aimPt.z - eye[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1; for (let i = 0; i < 3; i++) d[i] /= dl;
  const dist = rayWorld(eye, d, MAP.boxes, GRAPPLE.range);
  if (!(dist < GRAPPLE.range)) { sfx.grappleMiss(); toast(t('grapple.far'), '#a3a9d6'); return; }
  const pt = [eye[0] + d[0] * (dist - 0.05), eye[1] + d[1] * (dist - 0.05), eye[2] + d[2] * (dist - 0.05)];
  grappleLocal.grappleN--; if (grappleLocal.grappleN === GRAPPLE.charges - 1) grappleLocal.grappleRegenAt = performance.now();
  me.grapple = { pt, t: 0 }; myRope.shotAt = performance.now();
  me.slideT = 0; if (me.stance) me.stance = 0;
  net({ t: 'grapple', o: eye.map((x) => Math.round(x * 1000) / 1000), d: d.map((x) => Math.round(x * 10000) / 10000) });
  sfx.grapple(); vibrate(20);
}
function releaseGrapple(arrived) {
  if (!me.grapple) return;
  me.grapple = null; hideRope(myRope); net({ t: 'grappleEnd' });
  me.v[1] = Math.max(me.v[1], 0) + GRAPPLE.hop * (arrived ? 1 : 0.6); // a little hop up onto the ledge
  sfx.pad?.();
}
function updateGrapple(dt, now) {
  if (me.grapple) {
    if (!me.alive || me.vehicle || me.down) { me.grapple = null; hideRope(myRope); }
    else if (!grapplePull(me, me.eyeH || PLAYER.eye, dt)) releaseGrapple(true);
  }
  if (me.grapple) {
    const hand = dropAvatar?.group.visible && dropAvatar.char?.bones?.rHand ? dropAvatar.char.bones.rHand.getWorldPosition(new THREE.Vector3()) : camera.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.25, -0.3, 0).applyQuaternion(camera.quaternion));
    drawRope(myRope, hand, new THREE.Vector3(...me.grapple.pt), now);
  }
  for (const [id, r] of ropes) {
    const rem = remotes.get(id);
    if (!rem || now - r.shotAt > GRAPPLE.maxMs + 300) { hideRope(r); continue; }
    const from = rem.char?.bones?.rHand ? rem.char.bones.rHand.getWorldPosition(new THREE.Vector3()) : rem.group?.position?.clone().add(new THREE.Vector3(0, 1.3, 0));
    if (from) drawRope(r, from, r.pt, now);
  }
  const n = grappleAvailable(); for (const el of [$('grapple-n'), $('rope-n')]) if (el && el.textContent !== String(n)) el.textContent = n;
  const b = $('t-grapple'); if (b) b.classList.toggle('empty', n < 1 && !me.grapple);
}
function onRopeMsg(m) {
  let r = ropes.get(m.id); if (!r) { r = makeRope(); ropes.set(m.id, r); }
  if (m.end) { r.shotAt = -1e9; hideRope(r); return; }
  r.pt = new THREE.Vector3(...m.pt); r.shotAt = performance.now(); sfx.grapple(0.4);
}
let semiReady = true;
let swingAt = -10;
// 0.16.52 melee: knife slash, bat/baton swing, or bare-fist punches (left/right). The server decides the hit.
let punchSide = 1, punchRepeat = 0, punchCombo = 0, punchComboAt = -1e9, fpPunch = null;
function knifeSwing(now, kind = 'knife') {
  const rate = kind === 'fists' ? FISTS.rate : (WEAPONS[kind] || WEAPONS.knife).rate;
  if (now - me.lastShot < rate * 1000 || (!semiReady && kind !== 'fists')) return;
  semiReady = false;
  me.lastShot = now;
  swingAt = now;
  // 0.16.58 like a real brawl: mostly left-right, but now and then the same hand twice (never three times)
  if (kind === 'fists') { if (punchRepeat < 1 && Math.random() < 0.35) punchRepeat++; else { punchRepeat = 0; punchSide = -punchSide; } }
  net({ t: 'melee', w: kind, yaw: me.yaw, pitch: me.pitch, side: kind === 'fists' ? punchSide : undefined });
  // 0.16.57 same combo rule as the server: the third quick punch in a row is a hook
  const heavy = kind === 'fists' && (punchCombo = now - punchComboAt < 1300 ? punchCombo + 1 : 1) % 3 === 0; if (kind === 'fists') punchComboAt = now;
  // someone lying close in front of us gets a kick (the server decides the same way)
  const kick = kind === 'fists' && [...remotes.values()].some((r) => { const s = r.buf?.[r.buf.length - 1]; if (!s || (s.st | 0) !== 2) return false; const dx = s.p[0] - me.p[0], dz = s.p[2] - me.p[2], d = Math.hypot(dx, dz); return d < 2.1 && (-Math.sin(me.yaw) * dx - Math.cos(me.yaw) * dz) / (d || 1) > 0.5; });
  const av = dropAvatar?.char; if (av) { av.swingT = performance.now(); av.swingKind = kind; av.swingSide = punchSide; av.swingHeavy = heavy && !kick; av.swingKick = kick; }
  if (kind === 'fists' && !kick) fpPunch = { t: performance.now(), side: punchSide, heavy };
  sfx.swing();
  vibrate(15);
}
// Touch aim help (mobile shooters ship this by default; both can be switched off in Settings):
// assist = the shot bends a little toward an enemy that is already almost under the crosshair (small cone, needs a
// clear line of sight); auto-fire = holding the crosshair on an enemy for a moment fires without the fire button.
const aimHelp = { assist: () => isTouch && store.get('aimAssist', true), auto: () => isTouch && store.get('autoFire', false) };
let autoFireSince = 0;
function enemyNearAim(eye, yaw, pitch, cone, range) {
  const myTeam = gameMode !== 'ffa' ? roster.find((p) => p.id === me.id)?.team : null;
  const fwd = dirFromAngles(yaw, pitch);
  let best = null, bestA = cone;
  for (const [id, r] of remotes) {
    if (!r.cur || r.group?.visible === false || r.alive === false) continue;
    if (myTeam && roster.find((p) => p.id === id)?.team === myTeam) continue;
    if (passiveOn || roster.find((p) => p.id === id)?.passive) continue; // free roam: no aim help at or from passive players
    const t = [r.cur.p[0], r.cur.p[1] + 1.25, r.cur.p[2]]; // centre of the chest
    const d = [t[0] - eye[0], t[1] - eye[1], t[2] - eye[2]], len = Math.hypot(...d);
    if (len < 0.5 || len > range) continue;
    const a = Math.acos(Math.max(-1, Math.min(1, (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / len)));
    if (a >= bestA) continue;
    if (rayWorld(eye, d.map((v) => v / len), aimBoxes(), len) < len - 0.6) continue; // behind a wall
    best = { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(d[1] / len) }; bestA = a;
  }
  return best;
}
function autoFireTick(now) {
  if (!aimHelp.auto() || !me.alive || me.parachuting || mouseDown) { autoFireSince = 0; return false; }
  const w = WEAPONS[me.weapon];
  if (!w || w.unarmed || w.melee || w.blast) return false;
  const eye = [me.p[0], me.p[1] + stanceOf(me.stance).eye, me.p[2]];
  const on = enemyNearAim(eye, me.yaw, me.pitch, 0.03, w.range);
  if (!on) { autoFireSince = 0; return false; }
  if (!autoFireSince) autoFireSince = now;
  return now - autoFireSince > 150;
}
function tryFire(now) {
  const w = WEAPONS[me.weapon];
  if (!w) return;
  if (!me.alive || gamePaused || me.parachuting || chatOpen || matchInfo.state !== 'playing') return;
  if (me.vehicle && (w.melee || w.blast)) return; // 0.16.42: drive-by with guns only
  if (w.unarmed) return knifeSwing(now, 'fists'); // 0.16.52: empty hands punch
  if (w.melee && me.weapon !== 'knife') return knifeSwing(now, me.weapon); // bat / baton: swung, never thrown
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
  // Third person: the camera sits beside the head, so aim at what the crosshair covers (as GTA does)
  let aimYaw = me.yaw, aimPitch = me.pitch;
  if (tppActive || me.vehicle) { const a = crosshairAim(o, w.range, !!me.vehicle); aimYaw = a[0]; aimPitch = a[1]; } // GTA drive-by: shots go to the crosshair too
  if (aimHelp.assist() && !w.blast) { // pull 60% of the way to an enemy inside ~4 degrees (~2.5 when aiming down sights)
    const t = enemyNearAim(o, aimYaw, aimPitch, me.ads ? 0.045 : 0.07, w.range);
    if (t) { let dy = t.yaw - aimYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); aimYaw += dy * 0.6; aimPitch += (t.pitch - aimPitch) * 0.6; }
  }
  const dirs = [];
  for (let i = 0; i < w.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    dirs.push(dirFromAngles(aimYaw + Math.cos(a) * r, aimPitch + Math.sin(a) * r));
  }
  net({ t: 'shoot', w: me.weapon, o, dirs });
  peds.scare(o);

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
// The point under the crosshair (walls and players), seen from the camera; returns the yaw/pitch from the eye to it
const _camDir = new THREE.Vector3();
let aimBoxesCache = null, aimBoxesN = -1;
function aimBoxes() { if (aimBoxesN !== MAP.boxes.length) { aimBoxesN = MAP.boxes.length; aimBoxesCache = Object.assign(MAP.boxes.filter((b) => !b.vehicle), { ramps: MAP.boxes.ramps }); } return aimBoxesCache; }
function crosshairAim(eye, range, inCar = false) {
  const c = camera.position.toArray(), d = camera.getWorldDirection(_camDir).toArray();
  // From a car the camera looks past your own car's roof: car bodies don't stop the aim ray
  let dist = rayWorld(c, d, aimBoxes(), range + 6); // car bodies never stop the aim ray (the camera may sit in or over a car)
  for (const r of remotes.values()) {
    if (!r.cur) continue;
    const hb = hitboxes(r.cur.p, r.char.stance || 0, r.cur.yaw);
    for (const box of [hb.head, hb.body]) { const tt = rayBox(c, d, box[0], box[1], dist); if (tt !== null && tt < dist) dist = tt; }
  }
  const p = [c[0] + d[0] * dist, c[1] + d[1] * dist, c[2] + d[2] * dist];
  const v = [p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]], l = Math.hypot(...v);
  if (l < 1.2 || v[0] * d[0] + v[1] * d[1] + v[2] * d[2] <= 0) return [Math.atan2(-d[0], -d[2]), Math.asin(Math.max(-1, Math.min(1, d[1])))]; // something right in front of the camera: the view direction
  return [Math.atan2(-v[0], -v[2]), Math.asin(Math.max(-1, Math.min(1, v[1] / l)))];
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
// Crouch while running = slide (keeps momentum). The approved HUD Glitch button is the same slide.
let wantSlide = false, wantDash = false;
function crouchPress() {
  if (me.stance === 0 && canSlide(me)) { wantSlide = true; setStance(1); sfx.slide(); return; }
  setStance(me.stance === 1 ? 0 : 1);
}
// Glitch is the slide. Physics stands you back up when it ends (unless the ceiling is too low).
function glitchPress() {
  if (!me.alive || me.vehicle || me.parachuting || me.stance === 2) return;
  if (!canSlide(me)) return;
  wantSlide = true;
  setStance(1);
  sfx.slide();
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
  // Stand-up is applied in step() when the slide ends and there is headroom.
  // slideRecoverStance() stays 1 so the 0.16.31 contract is unchanged.
}
function updateStanceHud() {
  $('t-crouch')?.classList.toggle('on', me.stance === 1);
  $('t-prone')?.classList.toggle('on', me.stance === 2);
  $('t-glitch')?.classList.toggle('on', me.slideT > 0);
}

// ======================= pickups, armor and boosts =======================
// The game owns the items (server or practice host); this draws them, plays effects and shows your boosts.
const itemMeshes = new Map(); // id -> { g, type, ready }
const ITEM_LOOK = { heart: 0xff2d55, armor: 0x2f80ff, speed: 0xffd400, power: 0xb04cff, ammo: 0x2ee59d, rpg: 0xff6d00 };
function itemShape(type) {
  const gunId = String(type).startsWith('gun:') ? type.slice(4) : null; // 0.16.36: ground weapon (neon armory)
  const c = gunId ? (WEAPONS[gunId]?.color ?? 0x00e5ff) : ITEM_LOOK[type], mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 });
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
  } else if (gunId) {
    const gun = gunModel(gunId); gun.rotation.y = Math.PI / 2; gun.scale.setScalar(1.15); g.add(gun);
  } else if (type === 'rpg') {
    const gun = gunModel('rpg'); gun.rotation.y = Math.PI / 2; gun.scale.setScalar(1.1); g.add(gun);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.62;
  const root = new THREE.Group(); root.add(g, ring);
  return { root, spin: g, ring };
}
// 0.16.36: ONE path for every pickup type (ammo, 1.5x power, heart, armor, speed, RPG, ground guns):
// collected = the whole group (icon + floor ring + children) hides; respawned = the whole group shows again.
function setPickupShown(it, shown) { it.root.visible = shown; it.spin.visible = shown; it.ring.visible = shown; }
function setItems(list) {
  for (const [id, type, p, ready] of list) {
    let it = itemMeshes.get(id);
    if (!it) { it = { ...itemShape(type), type }; it.root.position.set(p[0], p[1] + 0.8, p[2]); scene.add(it.root); itemMeshes.set(id, it); }
    it.ready = !!ready;
    setPickupShown(it, it.ready);
  }
}
function animateItems(t) {
  for (const it of itemMeshes.values()) {
    it.spin.rotation.y = t * 1.8;
    it.spin.position.y = Math.sin(t * 2.2 + it.root.position.x) * 0.1;
  }
}
function itemTakenFx(id) { const it = itemMeshes.get(id); if (it) sparks(it.root.position.toArray(), ITEM_LOOK[it.type] ?? 0x00e5ff, 10); }
// "Helmet · level 2", "M4", "First aid kit"
function lootName(d) {
  const lvl = d.loot?.vest || d.loot?.helmetLvl;
  return lvl ? t('loot.level', { item: t(lootLabelKey(d)), n: lvl }) : t(lootLabelKey(d));
}
function onBuffs(m) {
  const now = performance.now(), had = { ...buffs, special: buffs.special && { ...buffs.special } };
  if(m.inventory)buffs.inventory=m.inventory;
  buffs.helmet=m.helmet||0;buffs.helmetLvl=m.helmetLvl||0;buffs.vestLvl=m.vestLvl||0;
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
  const c=me.vehicle&&(mmCars||[]).find(c=>c.id===me.vehicle);el.classList.toggle('hidden',!c);if(!c)return;const f=Math.max(0,Math.min(1,(c.hp??CAR_HP.max)/CAR_HP.max));const fill=document.getElementById('car-hp-fill');fill.style.width=(f*100)+'%';fill.style.background=f>0.5?'#4dd06a':f>0.25?'#ffb34d':'#ff4d4d';}
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
scene.add(boomLight); // added once: a light added mid-fight recompiles every lit material (a visible freeze)
function explosion(at) {
  flashAt(at, 4, 0xffb347);
  for (let i = 0; i < 9; i++) fireball([at[0] + (Math.random() - 0.5), at[1] + Math.random() * 0.6, at[2] + (Math.random() - 0.5)], [0xffd24d, 0xff7a1a, 0xff3d00][i % 3], 0.35 + Math.random() * 0.35, 0.5 + Math.random() * 0.3, 14 + Math.random() * 4);
  for (let i = 0; i < 5; i++) setTimeout(() => puff([at[0] + (Math.random() - 0.5) * 2, at[1] + 0.8 + i * 0.3, at[2] + (Math.random() - 0.5) * 2], 0x3a3a3a, 0.6 + i * 0.15), 120 + i * 70);
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
// 0.16.48 open mic (default): a live conversation, no button. The mic opens by itself while another real player is in
// the room; N / the 🎙 button then mutes and unmutes yourself. Off = the old hold-to-talk.
let voiceOpen = store.get('voiceOpen', true), selfMuted = false, micDenied = false;
$('voice-open').checked = voiceOpen;
$('voice-open').addEventListener('change', (e) => { voiceOpen = e.target.checked; store.set('voiceOpen', voiceOpen); selfMuted = false; if (!voiceOpen) setTalking(false); updateVoiceHud(); });
function voiceKey(down) { // N key / 🎙 button
  if (!voiceOpen) { setTalking(down); return; }
  if (down) { selfMuted = !selfMuted; setTalking(!selfMuted); }
}
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
  $('voice-text').textContent = (voiceOpen ? (talking ? '🎙 ' + t('voice.live') : '🔇') : talking ? t('voice.talking') : t(isTouch ? 'voice.holdTouch' : 'voice.holdKey')) + ' · 🔊 ' + voice.connected() + '/' + others;
  if (voiceOpen && !micDenied && !document.hidden) { if (show && !selfMuted && !talking) setTalking(true); else if (!show && talking) setTalking(false); }
}
let voiceTick = 0;
setInterval(() => { if (!me.id) return; if (++voiceTick % 3 === 0 && voiceOn && !lobby?.offline) syncVoice(); else updateVoiceHud(); }, 1000); // 0.16.48: re-sync every 3 s so a lost handshake is retried
if (new URLSearchParams(location.search).has('debug')) window.arenaDebug = { renderer, scene, voice, me, remotes, items: itemMeshes, buffs, camera, wheel, get tpp() { return tppActive; }, get match() { return ws?.match; }, get cars() { return mmCars; }, get ws() { return ws; }, get peds() { return peds; }, get avatar() { return dropAvatar; } };
async function setTalking(on) {
  if (on === talking || !me.id || lobby?.offline || !voiceOn) return;
  talking = on;
  $('t-voice').classList.toggle('on', on);
  updateVoiceHud();
  if (!(await voice.talk(on)) && on) { talking = false; micDenied = true; $('t-voice').classList.remove('on'); updateVoiceHud(); addChat({ sys: true, key: 'voice.noMic' }); }
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
let rtt = 80, lastSnapAt = 0;
// Connection dot (online matches only): green under 80 ms, yellow under 150, red above or when updates stop
const pingEl = document.createElement('div'); pingEl.id = 'ping-hud'; pingEl.hidden = true; document.body.appendChild(pingEl);
let pingShown = 0;
function pingHudTick(now) {
  document.body.classList.toggle('chute', !!me.parachuting); // phone HUD: hide the passive switch while skydiving
  if (now - pingShown < 1000) return; pingShown = now;
  const show = !!(me.id && ws && !lobby?.offline && matchInfo.state === 'playing');
  pingEl.hidden = !show; if (!show) return;
  const stalled = lastSnapAt && now - lastSnapAt > 1500, ms = Math.round(rtt);
  pingEl.className = stalled || ms >= 150 ? 'bad' : ms >= 80 ? 'mid' : 'good';
  pingEl.textContent = stalled ? t('hud.weakNet') : ms + ' ms';
}

// Offline practice: runs the match simulation in this tab instead of on a server.
class LocalSocket {
  constructor() {
    this.readyState = 0;
    import('./shared/game.js').then((game) => {
      const toClient = { readyState: 1, send: (s) => setTimeout(() => this.onmessage?.({ data: s }), 0), close() {} };
      const match = game.createGame({ difficulty: store.get('difficulty', 'normal') });
      this.match = match; // practice runs the whole match here (?debug tests reach it through arenaDebug.match)
      match.start();
      this.conn = match.connect(toClient);
      this.readyState = 1;
      this.onopen?.();
    });
  }
  send(s) { this.conn?.message(s); }
  close() {}
}

// 0.16.51 live events (supply drop / most wanted / delivery)
const coach = createCoach({ t, isTouch: () => isTouch });
const evVis = createEventsVisuals(scene, { t, me, positionOf: (id) => (id === me.id ? me.p : remotes.get(id)?.cur?.p || null), toast: (m, c) => toast(m, c), sfx: { pickup: () => sfx.pickup?.(), kill: () => sfx.kill?.() } });
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
  ctx.fillStyle='#272f35';for(const c of [...(MAP.roads||[-38,0,38]),...(MAP.ring?[-MAP.ring,MAP.ring]:[])]){ctx.fillRect(toPx(c-5),0,toPx(c+5)-toPx(c-5),S);ctx.fillRect(0,toPx(c-5),S,toPx(c+5)-toPx(c-5));}
  // 0.16.44: roundabouts (asphalt circle + green island) and the central plaza
  const circ=(x,z,r,col)=>{ctx.fillStyle=col;ctx.beginPath();ctx.arc(toPx(x),toPx(z),toPx(r)-toPx(0),0,Math.PI*2);ctx.fill();};
  for(const r of MAP.roundabouts||[]){circ(r.p[0],r.p[2],r.R,'#272f35');circ(r.p[0],r.p[2],r.r,'#4f6b3f');}
  if(MAP.plaza)circ(MAP.plaza.p[0],MAP.plaza.p[2],MAP.plaza.R,'#9a958a');
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
  if (!p2p && !offline && ['quickMatch','create','joinCode'].includes(action.t)) action = { ...action, maps: 1, map: action.map || MAP.id, pass: action.pass ?? ($('room-pass')?.value.trim() || '') }; // 0.16.42 online map + entry code
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
      if (m.map && m.map !== MAP.id) { store.set('map', m.map); const u = new URL(location.href); u.search = ''; u.searchParams.set('room', m.code); u.searchParams.set('server', selectedServer()?.id || ''); ws.close(); location.href = u.toString(); return; } // 0.16.42: load the room's map first
      roomCode = m.code; roomMode = m.mode || 'ffa'; updatePassiveBtn();
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
    case 'carHit': for (const [id, x, z, f] of m.hits || []) { // 0.16.52: dents, debris and sparks where two cars (or a car and a wall) met
      vehicleVisuals.dent(id, x, z, f); const at = [x, 0.8, z];
      if (camera.position.distanceTo(_smashV.set(x, 1, z)) < 80) { smashFx.smash('car', at, [0, 0], 1.0); sparks([x, 0.7, z], 0xffe9a0, 6 + Math.min(10, f | 0)); }
    } break;
    case 'swing': { sfx.swing(); const r = remotes.get(m.id); if (r?.char) { r.char.swingT = performance.now(); r.char.swingKind = m.w || 'knife'; r.char.swingSide = m.side || 1; r.char.swingHeavy = !!m.heavy && !m.kick; r.char.swingKick = !!m.kick; } if (m.hit) { if (m.w === 'fists') sfx.punch(!!m.heavy); else sfx.hit?.(); } break; }
    case 'profile': myProfile = m.profile; showProfile(); renderShop(); break;
    case 'shopError': $('shop-status').textContent = t(m.key); break;
    case 'reward':
      myProfile = m.profile;
      $('xp-line').textContent = t('end.reward', { credits: m.reward.credits, xp: m.reward.xp, level: m.reward.level }) + (m.reward.levelUp ? t('end.levelUp') : '') + (m.reward.cut > 0 ? t('end.capped') : '');
      if (m.roam && m.reward) toast(`💰 +${m.reward.credits}  ⭐ +${m.reward.xp} XP`, '#ffd23d'); // free roam payout every 10 min
      else if (m.reward.league?.eligible) toast('🏆 ' + t('league.earned', { n: m.reward.league.points, rank: m.reward.league.rank || '-' }), '#ffd23d');
      else if (m.reward.league) toast('🏆 ' + t('league.signIn'), '#8ad8ff');
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
    case 'warned':
      toast('⚠️ ' + t('panel.warned', { reason: m.reason }), '#ffb35c');
      break;
    case 'passive':
      passiveOn = !!m.on; updatePassiveBtn();
      if (m.wait) toast(t('roam.wait', { n: m.wait }), '#ffd23d');
      else if (m.combat) toast(t('roam.combat'), '#ffb35c');
      else toast(t(m.on ? 'roam.nowPassive' : 'roam.nowActive'), m.on ? '#8ad8ff' : '#ffb35c');
      break;
    case 'kicked':
      kickedNotice = t(m.key, m.p);
      $('menu-status').textContent = kickedNotice;
      addChat({ sys: true, key: m.key, p: m.p });
      break;
    case 'welcome':
      roomMode = m.mode || 'ffa'; passiveOn = false; setTimeout(updatePassiveBtn, 0); // free roam: no clock, passive switch
      // 0.16.40: the match (P2P host / server) decides the map. If this device rendered another map, switch and rejoin —
      // otherwise a guest saw its own small arena while the host's city sim parachuted it from the plane.
      if (m.map && m.map !== MAP.id && lastAction && lastAction.t !== 'p2pHost') {
        store.set('map', m.map);
        try { sessionStorage.setItem('arena.autojoin', JSON.stringify({ action: lastAction, name: lastName })); } catch { /* ignore */ }
        location.reload(); return;
      }
      reconnectTries = 0;
      me.id = m.id; me.color = m.color;
      matchInfo = m.match; killLimit = m.killLimit; quickChat = m.quick; gameMode = m.mode || 'ffa';
      if (m.items) setItems(m.items);
      $('menu').classList.add('hidden');
      $('hud').classList.remove('hidden');
      if (matchInfo.state === 'lobby') $('lobby').classList.remove('hidden');
      if (isTouch) $('touch').classList.remove('hidden'); else lockPointer();
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
    case 'snap': lastSnapAt = performance.now(); if (m.civ) peds.sync(m.civ); // people on the street, run by the match
      for (const s of m.players) {
        if (s.id === me.id) { updateHp(s.hp);if((s.vehicle||null)!==(me.vehicle||null)){me.vehicle=s.vehicle||null;me.carSmooth=false;carLook.yaw=0;carLook.pitch=0;me.netP=null;}if(me.vehicle){me.netP=s.p.slice();me.netYaw=s.yaw;if(!me.carSmooth){me.p=s.p.slice();me.yaw=s.yaw;me.carSmooth=true;}}continue; }
        const r = remotes.get(s.id);
        if (!r) continue;
        r.buf.push({ t: now, parachuting:s.parachuting, p: s.p, yaw: s.yaw, pitch: s.pitch, w: s.w, sp: s.sp, st: s.st | 0, g: s.g | 0, a: s.a | 0 });
        r.lastSeen = now;
      }
      break;
    case 'spawn':
      me.p = m.p.slice(); me.v = [0, 0, 0]; me.yaw = m.yaw; me.pitch = 0;
      me.parachuting=!!m.parachuting;me.chuteOpen=false;me.openT=0;me.down=false;me.onGround=false;me.vehicle=null;
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
    case 'correct': me.p = m.p.slice(); me.v = [0, 0, 0]; if (me.grapple) { me.grapple = null; hideRope(myRope); } break;
    case 'grapple': // the match's answer to our plunger shot
      if (Number.isFinite(m.n)) { grappleLocal.grappleN = m.n; if (m.n < GRAPPLE.charges && !m.pt) grappleLocal.grappleRegenAt = Math.min(grappleLocal.grappleRegenAt, performance.now()); }
      if (m.no) { if (me.grapple) { me.grapple = null; hideRope(myRope); } }
      else if (m.pt && me.grapple) me.grapple.pt = m.pt;
      break;
    case 'rope': onRopeMsg(m); break;
    case 'ammo': me.ammo[m.w] = m.n; if (buffs.inventory && !buffs.inventory.includes(m.w)) buffs.inventory = [...buffs.inventory, m.w]; if (m.equip || me.weapon === 'unarmed' || !me.weapon) { me.weapon = ''; switchWeapon(m.w); } updateWeaponHud(); break;
    case 'pong': rtt = rtt * 0.7 + (now - m.c) * 0.3; net({ t: 'rtt', v: rtt }); break;
    case 'shot': {
      const r = remotes.get(m.id);
      if (Array.isArray(m.o)) peds.scare(m.o); // people on the street run from gunfire
      if (r) r.lastShotAt = performance.now();
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
      m.kill ? null : me.weapon === 'unarmed' ? (sfx.punch(m.dmg > 18), shake = Math.min(0.5, shake + 0.12)) : m.head ? sfx.head() : sfx.hit(); // 0.16.57 your punch lands with a thud
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
    case 'kill': if (m.victim === me.id) { wheel.close(false); me.down = false; me.vehicle = null; me.parachuting = false; } onKillMsg(m); break;
    case 'knockdown': // run over by a car (GTA): you fall flat; you stay down while a car is on you
      me.down = true; me.stance = 2; me.v = [0, 0, 0]; updateStanceHud();
      shake = Math.min(1, shake + 0.9); vibrate([60, 40, 90]); sfx.hurt(); sfx.smash?.('play', 0.6);
      centerMsg(t('hud.knocked'), 2200);
      break;
    case 'getUp': me.down = false; if (canStance(me.p, 0, MAP.boxes)) { me.stance = 0; updateStanceHud(); } break;
    case 'mapPing': onMapPing(m); break;
    case 'heal': updateHp(m.hp); toast(m.item ? t('loot.collected', { item: t('loot.' + m.item) }) : t('hud.gotHeart'), '#ff4d6d'); sfx.pickup(); break;
    case 'refill': Object.assign(me.ammo, m.ammo); updateWeaponHud(); toast(t('hud.gotAmmo'), '#69f0ae'); sfx.pickup(); break;
    case 'buffs': onBuffs(m); if (typeof m.cash === 'number') { gunShop.cash = m.cash; if (gunShop.open) renderGunShop(); } break;
    case 'gunshop': onGunShop(m); break;
    case 'event': evVis.set(m); break;
    case 'items': setItems(m.items); if (m.took && m.took.by !== me.id) itemTakenFx(m.took.id); break;
    case 'vehicles':vehicleVisuals.sync(m.vehicles);mmCars=m.vehicles||[];updateCarHp();break;
    case 'horn': { const c = mmCars.find((v) => v.id === m.id); const d = c ? Math.hypot(c.p[0] - camera.position.x, c.p[2] - camera.position.z) : 0; if (d < 70) sfx.horn(Math.max(0.15, 1 - d / 70)); break; }
    case 'carWreck':if(vehicleVisuals.carOf?.(me.id)||me.vehicle===m.id)toast(t('car.wrecked'),'#ff5a3d');sfx.pickup?.();break;
    case 'vehicleSeat':me.carSmooth=false;me.netP=null;me.vehicle=m.id;me.p=m.p.slice();me.v=[0,0,0];if(Number.isFinite(m.yaw))me.yaw=m.yaw;me.ads=false;updateCarHp();break;
    case 'landed':me.parachuting=false;toast(t('drop.landed'),'#69f0ae');break;
    case 'chests': if(m.taken){worldLoot.remove(m.taken);break;}chestVisuals.sync(m.chests||[]);worldLoot.sync(m.drops||[]);break;
    case 'chestReward': // walking over loot mid-fight must not swap your gun: equip only when empty-handed
      if(m.weapon&&(me.weapon==='unarmed'||me.weapon==='knife'||!hasWeapon(me.weapon)))switchWeapon(m.weapon);
      if(m.kind==='heal'||m.kind==='drink'||m.kind==='ammo')break; // their own message already shows it
      toast(m.kind==='credits'?t('loot.reward',{weapon:'',xp:m.xp,credits:m.credits}):t('loot.collected',{item:lootName({kind:m.kind,loot:m})}),'#71ceff');sfx.pickup();break;
    case 'knifeFlight': {
      const blade=gunModel('knife',0.8); blade.position.set(...m.p); scene.add(blade);
      knifeFlights.set(m.id,{obj:blade,p:[...m.p],v:[...m.v],age:0}); break;
    }
    case 'knifeEnd': { const k=knifeFlights.get(m.id); if(k){scene.remove(k.obj);knifeFlights.delete(m.id);} if(m.at)sparks(m.at,0xeceff1,4); break; }
    case 'boom': explosion(m.at); peds.scare(m.at); break;
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
    if (lobby?.offline || lobby?.p2p) { awardXp(won); queuePracticeSync(won); } else { $('xp-line').textContent = ''; $('next-goal').textContent = ''; }
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
        if (p.id === me.id) li.classList.add('me');
        const av = document.createElement('span');
        av.className = 'slot-av';
        av.textContent = [...(p.name || '?')][0] || '?';
        const nm = document.createElement('span');
        nm.className = 'slot-name';
        nm.textContent = p.name;
        if (p.id === me.id) {
          const you = document.createElement('small');
          you.className = 'you';
          you.textContent = t('lobby.you');
          nm.append(you);
        }
        const st = document.createElement('span');
        st.className = p.ready ? 'ok' : 'wait';
        st.textContent = p.ready ? t('lobby.readyShort') : t('lobby.waitShort');
        li.append(av, nm, st);
      } else {
        li.className = 'open';
        const av = document.createElement('span');
        av.className = 'slot-av empty';
        av.textContent = '+';
        const nm = document.createElement('span');
        nm.className = 'slot-name';
        nm.textContent = t('lobby.empty');
        li.append(av, nm);
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
// GTA-style over-the-shoulder aim: aiming in third person zooms over the shoulder instead of switching to first
// person (the sniper still uses its scope). Y or the middle mouse button swaps shoulders.
let shoulder = store.get('shoulder', 1), camSide = shoulder, tppZoom = 0, tppActive = false;
function swapShoulder() { shoulder = -shoulder; store.set('shoulder', shoulder); }
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
  setTimeout(() => { if (document.pointerLockElement !== canvas && me.id && !chatOpen && matchInfo.state === 'playing' && document.hasFocus()) enterFreeMouse(); }, 1500);
}
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && freeMouse) { freeMouse = false; document.body.classList.remove('free-mouse'); } // a later click got the real lock: back to normal aiming
  if(!locked&&!freeMouse&&!chatOpen&&me.id&&matchInfo.state==='playing')pauseGame();
  if(locked){gamePaused=false;document.body.classList.add('game-active');}
  $('pause').classList.toggle('hidden', !gamePaused && (locked || freeMouse || chatOpen || !me.id || matchInfo.state !== 'playing' || isTouch || !$('admin-panel').classList.contains('hidden')));
  if (!locked) { mouseDown = false; me.ads = false; }
});
function pauseGame(){wheel.close(false);qDown=false;
  gamePaused=true;keys.clear();touchMove.f=touchMove.s=0;mouseDown=false;me.ads=false;document.body.classList.remove('game-active');$('pause').classList.remove('hidden');
  if(me.vehicle)net({t:'drive',f:0,s:0});if(document.pointerLockElement===canvas)document.exitPointerLock();
}
$('pause-resume').onclick=e=>{e.stopPropagation();initAudio();if(isTouch||freeMouse){gamePaused=false;document.body.classList.add('game-active');$('pause').classList.add('hidden');}else lockPointer();};
function leaveMatch(){net({t:'leaveRoom'});clearInterval(pinger);ws?.close();location.href=location.pathname;}
function askExit(e){
  e?.stopPropagation?.(); e?.preventDefault?.();
  $('exit-confirm').classList.remove('hidden');
  keys.clear(); touchMove.f = touchMove.s = 0; mouseDown = false; me.ads = false;
}
function cancelExit(e){ e?.stopPropagation?.(); $('exit-confirm').classList.add('hidden'); }
$('exit-yes').onclick = (e) => { e.stopPropagation(); leaveMatch(); };
$('exit-no').onclick = (e) => cancelExit(e);
$('exit-confirm').addEventListener('pointerdown', (e) => e.stopPropagation());
$('pause-leave').onclick=e=>{e.stopPropagation();askExit(e);};
function toggleHints(){$('hud-hints').classList.toggle('hidden');}
$('pause-standalone').href=location.hostname==='127.0.0.1'?location.href:'https://kobifrah1991-svg.github.io/Drop-Havoc/';
canvas.addEventListener('pointerdown',e=>{if(freeMouse&&!gamePaused){canvas.setPointerCapture?.(e.pointerId);try{const r=canvas.requestPointerLock?.();r?.catch?.(()=>{});}catch{/* stays free mouse */}}}); // 0.16.47: every click retries the real mouse lock
canvas.addEventListener('click', () => { if (!isTouch) lockPointer(); });

document.addEventListener('mousemove', (e) => {
  cursorX = e.clientX / innerWidth;
  const aiming = document.pointerLockElement === canvas || (freeMouse && me.id && !chatOpen && e.target === canvas);
  if (wheel.open) { wheel.move(e.movementX, e.movementY); return; }
  if (!aiming || gamePaused) return; // 0.16.47: free mouse turns the view without holding a button too
  const k = 0.0022 * sens * (me.ads ? camera.fov / 78 : 1);
  applyLook(me, carLook, -e.movementX * k, -e.movementY * k);
});
document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas && !(freeMouse && e.target === canvas)) return;
  if (wheel.open) { if (e.button === 0) { wheel.close(); qDown = false; clearTimeout(qTimer); } return; }
  if (e.button === 1) { e.preventDefault(); swapShoulder(); return; }
  if (e.button === 0) { mouseDown = true; tryFire(performance.now()); } // 0.16.59 act on the click itself: a quick click between two frames was lost on slow computers
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
  if (e.code === 'KeyN') { if (!e.repeat) voiceKey(true); return; } // 0.16.13: N = talk, V = camera
  if (e.code === 'KeyC' || e.code === 'ControlLeft') { if (!e.repeat) glitchPress(); return; }
  if (e.code === 'KeyG') { if (!e.repeat) { if (rideCar()) net({ t: 'vehicleInteract', seat: 'passenger' }); else slidePress(); } return; } // 0.16.30 slide; 0.16.50 next to a driven car: ride as passenger
  if (e.code === 'KeyZ') { if (!e.repeat) setStance(me.stance === 2 ? 0 : 2); return; }
  if (quickOpen && /^Digit[1-6]$/.test(e.code)) { sendQuick(Number(e.code.slice(5)) - 1); return; }
  if (e.code === 'Escape' && quickOpen) { toggleQuick(); return; }
  const slot = WEAPON_ORDER.find((k) => 'Digit' + WEAPONS[k].key === e.code);
  if (slot) { switchWeapon(slot); return; }
  if (e.code === 'KeyH') { if (me.vehicle) { if (!e.repeat) net({ t: 'horn' }); } else summonCar(); return; } // in a car: horn
  if (e.code === 'KeyE' && (gunShop.open || nearShop())) { if (gunShop.open) closeShop2(); else openShop2(); return; }
  if (e.code === 'KeyE') { const c=chestVisuals.nearest(me.p);if(me.vehicle||vehicleVisuals.nearby(me.p,me.id))net({t:'vehicleInteract',seat:me.vehicle?null:'driver'});else if(worldLoot.nearest(me.p))net({t:'pickupLoot',id:worldLoot.nearest(me.p).id});else if(c)net({t:'openChest',id:c.id});else if(findVault(me.p,me.yaw,MAP.boxes,MAP.bounds))net({t:'vault'});return; }
  if (e.code === 'KeyV') { if (!e.repeat) fireGrapple(); return; } // 0.16.58 plunger grapple
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyF' || e.code === 'AltLeft') { e.preventDefault(); if (!e.repeat) wantDash = true; return; }
  if (e.code === 'KeyQ') { // tap: next weapon · hold: weapon wheel
    if (!e.repeat && !qDown) { qDown = true; clearTimeout(qTimer); qTimer = setTimeout(() => { if (qDown && !me.vehicle) wheel.show(me.weapon); }, 200); }
    return;
  }
  if (e.code === 'KeyY') { swapShoulder(); return; }
  if (e.code === 'KeyX') switchWeapon(lastWeapon); // quick swap to the previous weapon
  keys.add(e.code);
});
document.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyQ' && qDown) { qDown = false; clearTimeout(qTimer); if (wheel.open) wheel.close(); else if (me.id && !chatOpen && !gamePaused) cycleWeapon(1); }
  if (e.code === 'Tab') $('scoreboard').classList.add('hidden');
  if (e.code === 'KeyN') voiceKey(false);
});
addEventListener('blur', () => { keys.clear(); mouseDown = false; if (!voiceOpen) setTalking(false); qDown = false; wheel.close(false); });
// App in the background (phone home button, other tab): let go of every input, close the mic, silence the sound
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { keys.clear(); mouseDown = false; setTalking(false); qDown = false; wheel.close(false); actx?.suspend?.(); }
  else { actx?.resume?.(); lastFrame = performance.now(); }
});

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
  if (!isTouch) return; // tilt-to-look belongs to the touch controls only
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
    stick.style.left = ((document.body.classList.contains('lefty') ? innerWidth - x : x) - stick.offsetWidth / 2) + 'px'; // the touch layer is mirrored for left-handers
    stick.style.top = (y - stick.offsetHeight / 2) + 'px';
    stick.style.bottom = 'auto';
    stick.classList.add('active');
  };
  const resetStick = () => { stick.style.left = ''; stick.style.top = ''; stick.style.bottom = ''; stick.classList.remove('active'); knob.style.transform = ''; };
  const moveStick = (x, y) => {
    let dx = x - sx, dy = y - sy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${document.body.classList.contains('lefty') ? -dx : dx}px, ${dy}px)`; // mirrored layer: draw the knob under the finger
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
      if (stickId === null && (document.body.classList.contains('lefty') ? t.clientX > innerWidth * 0.6 : t.clientX < innerWidth * 0.4) && t.clientY > innerHeight * 0.3) { stickId = t.identifier; placeStick(t.clientX, t.clientY); moveStick(t.clientX, t.clientY); }
      else if (lookId === null && (document.body.classList.contains('lefty') ? t.clientX < innerWidth * 0.65 : t.clientX > innerWidth * 0.35)) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
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
    if (!b) return;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); try { b.setPointerCapture?.(e.pointerId); } catch { /* no active pointer */ } down(); });
    if (up) b.addEventListener('pointerup', (e) => { e.preventDefault(); up(); });
    if (up) b.addEventListener('pointercancel', (e) => { e.preventDefault(); up(); });
  };
  // The fire button also steers the camera while held. It is off the approved 13-button board.
  const fire = $('t-fire');
  if (fire) {
    fire.addEventListener('touchstart', (e) => { e.preventDefault(); mouseDown = true; tryFire(performance.now()); if (lookId === null) { const t = e.changedTouches[0]; lookId = t.identifier; lx = t.clientX; ly = t.clientY; } });
    fire.addEventListener('touchend', (e) => { e.preventDefault(); mouseDown = false; semiReady = true; });
    fire.addEventListener('touchcancel', () => { mouseDown = false; semiReady = true; }); // a system gesture must not leave the gun firing
  }
  hold('t-ads', () => { me.ads = !me.ads; $('t-ads')?.classList.toggle('on', me.ads); });
  hold('t-glitch', glitchPress);
  hold('t-camera', () => { if (viewButtonAction(!!me.vehicle) === 'cycleCarCam') cycleCarCam(); else toggleView(); });
  hold('t-car', summonCar);
  hold('t-aim', () => { me.ads = !me.ads; $('t-aim').classList.toggle('on', me.ads); });
  hold('t-exit', askExit);
  hold('t-hints', toggleHints);
  hold('t-trophies', () => $('scoreboard').classList.toggle('hidden'));
  // 0.16.9: short captions under the touch buttons so each action is clear (Rivals-style HUD)
  const CAP_KEYS = ["fire", "ads", "jump", "reload", "swap", "crouch", "prone", "dash", "slide", "voice", "view"];
  const capt = () => { for (const k of CAP_KEYS) { const b = $('t-' + k); if (b && !b.classList.contains('hud-png')) b.dataset.cap = t('cap.' + k); } };
  capt(); setInterval(capt, 3000);
  hold('t-jump', () => { wantJump = true; touchHb = true; }, () => { touchHb = false; }); // in a car: hold = handbrake
  hold('t-reload', reload);
  // weapon buttons: tap = next weapon, long-press = weapon wheel (drag the finger to a weapon, lift to equip)
  for (const id of ['t-swap', 't-weapon']) {
    const b = $(id);
    if (!b) continue;
    let timer = 0, held = false;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); try { b.setPointerCapture?.(e.pointerId); } catch { /* none */ } held = true; clearTimeout(timer); timer = setTimeout(() => { if (held && !me.vehicle && wheel.show(me.weapon)) vibrate(15); }, 300); });
    b.addEventListener('pointermove', (e) => { if (wheel.open) { e.preventDefault(); wheel.pointAt(e.clientX, e.clientY); } });
    const up = (e) => { e.preventDefault(); clearTimeout(timer); if (!held) return; held = false; if (wheel.open) wheel.close(); else cycleWeapon(1); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', (e) => { clearTimeout(timer); held = false; wheel.close(false); e.preventDefault(); });
  }

  hold('t-chat', () => (chatOpen ? closeChat(true) : openChat()));
  hold('t-quick', toggleQuick);
  hold('t-score', () => $('scoreboard').classList.toggle('hidden'));
  hold('t-voice', () => voiceKey(true), () => voiceKey(false)); // hold to talk, or tap to mute with the open mic
  { // crouch button: tap = crouch / stand, long-press = lie down (prone)
    const b = $('t-crouch'); let timer = 0, long = false;
    if (b) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); long = false; clearTimeout(timer); timer = setTimeout(() => { long = true; setStance(me.stance === 2 ? 0 : 2); vibrate(20); }, 450); });
      const up = (e) => { e.preventDefault(); clearTimeout(timer); if (!long) crouchPress(); long = true; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', () => { clearTimeout(timer); long = true; });
    }
  }
  hold('t-dash', () => (wantDash = true));
  hold('t-grapple', fireGrapple);
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
// Cloud save: training vs bots runs in this tab, so its result is sent to the online server (Firebase-backed
// account, same one as online play). If the server is asleep/unreachable the result waits in a queue and is
// pushed on the next launch or retry. On launch the profile is loaded from the server so every player sees
// their own credits/XP/level/items wherever they play.
const CLOUD = () => (window.ARENA_SERVERS || ONLINE_SERVERS).find((sv) => sv.url);
let cloudBusy = false, cloudRetry = null;
function queuePracticeSync(won) {
  const q = store.get('syncQueue', []);
  q.push({ t: 'practiceResult', rid: uuid(), kills: me.kills | 0, deaths: me.deaths | 0, heads: me.heads | 0, won: !!won, name: lobby?.name, map: MAP.id, mode: gameMode || 'ffa' });
  store.set('syncQueue', q.slice(-20));
  cloudSync();
}
function cloudSync(extra) {
  const sv = CLOUD();
  if (!sv || cloudBusy || (ws && ws.readyState === 1 && !lobby?.offline && !extra)) return;
  cloudBusy = true;
  let sock, done = false;
  const finish = (ok) => {
    if (done) return; done = true; cloudBusy = false;
    try { sock.close(); } catch { /* closed */ }
    clearTimeout(cloudRetry);
    if (!ok && store.get('syncQueue', []).length) cloudRetry = setTimeout(cloudSync, 60000); // server waking up
  };
  try { sock = new WebSocket(wsUrl(sv)); } catch { finish(false); return; }
  const timer = setTimeout(() => finish(false), 70000); // a sleeping free server takes ~1 min to wake
  sock.onopen = () => {
    sock.send(JSON.stringify({ t: 'auth', protocol: GAME_PROTOCOL, credential: googleCredential, guestToken: guestToken() }));
    const q = store.get('syncQueue', []);
    q.forEach((m) => sock.send(JSON.stringify(m)));
    if (extra) sock.send(JSON.stringify(extra));
    if (!q.length && !extra) setTimeout(() => { clearTimeout(timer); finish(true); }, 3000);
  };
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'profile') { myProfile = m.profile; showProfile(); renderShop(); }
    if (m.t === 'practiceSaved') {
      store.set('syncQueue', store.get('syncQueue', []).filter((x) => x.rid !== m.rid)); // saved (or refused as too soon: drop it)
      if (!store.get('syncQueue', []).length && !extra) setTimeout(() => { clearTimeout(timer); finish(true); }, 800);
    }
    if (m.t === 'backup') {
      if (m.backup) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(m.backup, null, 2)], { type: 'application/json' })); a.download = 'drop-havoc-save.json'; a.click(); }
      clearTimeout(timer); finish(true);
    }
  };
  sock.onerror = () => { clearTimeout(timer); finish(false); };
  sock.onclose = () => { clearTimeout(timer); finish(store.get('syncQueue', []).length === 0); };
}
window.dropHavocBackup = () => cloudSync({ t: 'backup' });
setTimeout(() => { const pr = document.getElementById('profile'); if (!pr || document.getElementById('save-backup')) return;
  const b = document.createElement('button'); b.id = 'save-backup'; b.type = 'button'; b.className = 'link'; b.textContent = '💾';
  b.title = 'Download save backup'; b.style.marginInlineStart = '6px'; b.onclick = window.dropHavocBackup; pr.after(b); }, 0);
setTimeout(() => cloudSync(), 1500); // auto-load this player's saved progress on launch
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
  shopWs.onopen = () => shopWs.send(JSON.stringify({ t: 'auth', protocol: GAME_PROTOCOL, credential: googleCredential, guestToken: guestToken() }));
  shopWs.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'profile') {
      if ($('shop-status').textContent === t('shop.connecting')) $('shop-status').textContent = '';
      myProfile = m.profile; showProfile(); renderShop(); refreshPreview();
    }
    if (m.t === 'shopError' || m.t === 'lobbyError') { $('shop-status').dataset.key = m.key; $('shop-status').textContent = t(m.key); }
  };
  shopWs.onerror = () => { $('shop-status').textContent = t('shop.error'); };
}
function closeShop() {
  $('shop').classList.add('hidden');
  if (shopWs) { shopWs.close(); shopWs = null; }
  refreshPreview();
}
function shopRotation() {
  const server = myProfile?.rotation;
  if (server?.daily?.length && server.featured) {
    const daily = server.daily.map(itemById).filter(Boolean);
    const featured = itemById(server.featured);
    if (daily.length && featured) return { daily, featured };
  }
  const rot = rotationAt(Date.now());
  return { daily: rot.daily, featured: rot.featured };
}
function missionLine() {
  const board = myProfile?.board;
  const caps = myProfile?.caps;
  const dailies = ECONOMY.dailies.map((d) => {
    const done = board?.dailies?.find((row) => row.id === d.id)?.done;
    return t('shop.daily.' + d.id, { n: d.credits }) + (done ? ' ✓' : '');
  }).join(' · ');
  const weeklyDone = !!board?.weekly?.done;
  return t('shop.missions', {
    dailies,
    weekly: t('shop.weekly', { n: ECONOMY.weekly.credits }) + (weeklyDone ? ' ✓' : ''),
    day: board?.streak?.day || 0,
    level: t('shop.levelUp', {
      n: ECONOMY.levelUp.credits,
      used: caps ? caps.levelGrants : 0,
      max: caps ? caps.levelGrantMax : ECONOMY.levelUp.maxPerDay,
    }),
  });
}
function shopCard(item, { featured }) {
  const slot = item.slot;
  const owned = !!myProfile?.owned?.includes(item.id);
  const equipped = myProfile?.equipped?.[slot] === item.id;
  const card = document.createElement('div');
  card.className = 'shop-card' + (equipped ? ' on' : '') + (featured ? ' featured' : '');
  const sw = document.createElement('span');
  sw.className = 'swatch' + (item.glow ? ' glow' : '');
  sw.style.background = '#' + (item.tint ?? item.color).toString(16).padStart(6, '0');
  const name = document.createElement('b');
  name.textContent = t('shop.' + item.id);
  const rarity = document.createElement('span');
  rarity.className = 'rarity rarity-' + item.rarity;
  rarity.textContent = t('shop.rarity.' + item.rarity);
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
  tag.textContent = equipped ? t('shop.equipped') : (featured ? t('shop.featuredTag') : '');
  card.append(sw, name, rarity, tag, btn);
  return card;
}
function shopSection(title, items, featuredId, gridClass) {
  const h = document.createElement('h3');
  h.textContent = title;
  const grid = document.createElement('div');
  grid.className = 'shop-grid' + (gridClass ? ' ' + gridClass : '');
  for (const item of items) grid.appendChild(shopCard(item, { featured: item.id === featuredId }));
  const frag = document.createDocumentFragment();
  frag.append(h, grid);
  return frag;
}
function renderShop() {
  if ($('shop').classList.contains('hidden')) return;
  $('shop-balance').textContent = myProfile ? t('shop.balance', { n: myProfile.credits }) : '';
  const caps = myProfile?.caps;
  $('shop-caps').textContent = t('shop.caps', {
    day: caps ? caps.dayEarned : 0,
    daily: ECONOMY.dailyCap,
    week: caps ? caps.weekEarned : 0,
    weekly: ECONOMY.weeklyCap,
  });
  $('shop-missions').textContent = missionLine();
  $('shop-cap-note').textContent = t('shop.capNote');
  $('shop-rotation-note').textContent = t('shop.rotationNote');
  if ($('shop-status').dataset.key) $('shop-status').textContent = t($('shop-status').dataset.key);
  const box = $('shop-items');
  box.replaceChildren();
  const rot = shopRotation();
  const offerIds = new Set([...rot.daily.map((item) => item.id), rot.featured.id]);
  if (!rot.daily.some((item) => item.id === rot.featured.id)) {
    box.append(shopSection(t('shop.featured'), [rot.featured], rot.featured.id));
  }
  box.append(shopSection(t('shop.today'), rot.daily, rot.featured.id, 'daily'));
  const ownedOff = (myProfile?.owned || []).map(itemById).filter((item) => item && !offerIds.has(item.id));
  if (ownedOff.length) box.append(shopSection(t('shop.ownedLocker'), ownedOff, null));
}
$('shop-btn').addEventListener('click', openShop);
$('shop-close').addEventListener('click', closeShop);

// ======================= 0.16.8 garage: buy a car, summon it, E to enter (GTA) =======================
const CAR_PRICES={compact:250,wagon:550,hatch:300,concept:2200,sedan:600,carpavan:750,pickup:900,cartech:1000,suv:1200,van:1200,cyberpunk:1500,goblin:2400};
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
const carBtn=$('t-car');
// National league table (online server)
const league=createLeague({t,getLang,serverUrl:()=>(window.ARENA_SERVERS||ONLINE_SERVERS).find((sv)=>sv.url)?.url,myName:()=>$('name').value||store.get('name','')});
{const b=document.createElement('button');b.id='league-btn';b.className='chip chip-btn';b.type='button';b.textContent='🏆 '+t('league.short');b.onclick=()=>league.open();$('shop-btn').after(b);}
{const b=document.createElement('button');b.id='garage-btn';b.className='chip chip-btn';b.type='button';b.textContent='🚗 '+t('garage.open');b.onclick=openGarage;$('shop-btn').after(b);}
// 0.16.13 daily challenge: 5 kills across today's matches = +200 coins (local day key).
const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();};
function daily(){let d=store.get('daily',null);if(!d||d.day!==dayKey())d={day:dayKey(),goal:5,n:0,done:false};return d;}
function awardCoins(won){const g=garage();let n=me.kills*25+(won?150:50);const d=daily();d.n+=me.kills;if(!d.done&&d.n>=d.goal){d.done=true;n+=200;setTimeout(()=>toast(t('daily.done'),'#ffd24d'),600);}store.set('daily',d);g.coins+=n;saveGarage(g);return n;}
// 0.16.44 engine sound by car type (synthesised, no audio files):
//  v12      supercar (goblin): bright sawtooth + square with gear changes, revs climb and drop at each shift
//  electric (concept, cyberpunk): smooth rising whine (sine + soft triangle) with a little road/tyre noise, no gears
//  petrol   everyday cars (cartech, carpavan): lower, rougher square-wave engine with 5 gears
const ENGINE_OF={compact:'petrol',wagon:'petrol',goblin:'v12',sports:'electric',concept:'electric',cyberpunk:'electric',cartech:'petrol',sedan:'petrol',hatch:'petrol',carpavan:'petrol',suv:'petrol',van:'petrol',pickup:'petrol'};
// 0.16.50 a real gearbox: engine rpm = road speed x gear ratio; it climbs to the red line, shifts up (the revs fall and
// the power cuts for a moment), and shifts down when you slow. The note is the engine's firing frequency (rpm/60 x
// cylinders/2), so a V12 screams and a 4-cylinder hums; on the throttle the filter opens and it gets louder.
const ENGINE_TUNE={
 v12:{wave:['sawtooth','square'],mix:[1,0.55],cyl:12,idleRpm:1100,red:8200,down:4200,ratios:[3.1,2.15,1.62,1.3,1.08,0.92,0.8],top:44,cut:700,cutSpan:3400,gain:0.07},
 petrol:{wave:['sawtooth','square'],mix:[0.85,0.6],cyl:4,idleRpm:850,red:6400,down:2600,ratios:[3.5,2.1,1.45,1.12,0.92,0.78],top:34,cut:380,cutSpan:1500,gain:0.07},
 electric:{wave:['sine','triangle'],mix:[1,0.35],idle:140,rpm:0,gears:1,top:42,cut:2400,cutSpan:3000,gain:0.05,whine:1.0},
};
let engine=null,lastCarP=null;
function makeEngine(type){
 const T=ENGINE_TUNE[type],o=actx.createOscillator(),o2=actx.createOscillator(),g1=actx.createGain(),g2=actx.createGain(),f=actx.createBiquadFilter(),g=actx.createGain();
 o.type=T.wave[0];o2.type=T.wave[1];g1.gain.value=T.mix[0];g2.gain.value=T.mix[1];f.type='lowpass';f.frequency.value=T.cut;g.gain.value=0;
 o.connect(g1).connect(f);o2.connect(g2).connect(f);f.connect(g).connect(actx.destination);o.start();o2.start();
 let hiss=null; // tyre/road noise under an electric car (it has no engine to cover it)
 if(T.whine&&noise){const n=actx.createBufferSource();n.buffer=noise;n.loop=true;const nf=actx.createBiquadFilter();nf.type='bandpass';nf.frequency.value=900;const ng=actx.createGain();ng.gain.value=0;n.connect(nf).connect(ng).connect(actx.destination);n.start();hiss={n,ng};}
 return {type,T,o,o2,g,f,hiss,v:0};
}
function stopEngine(e){try{e.g.gain.setTargetAtTime(0,actx.currentTime,0.08);const t=actx.currentTime+0.5;e.o.stop(t);e.o2.stop(t);if(e.hiss){e.hiss.ng.gain.setTargetAtTime(0,actx.currentTime,0.08);e.hiss.n.stop(t);}}catch{}}
function engineTick(dt){if(!actx)return;if(!me.vehicle){if(engine){stopEngine(engine);engine=null;}lastCarP=null;return;}
 const mc=vehicleVisuals.carOf(me.id),type=ENGINE_OF[mc?.kind]||'petrol';
 if(engine&&engine.type!==type){stopEngine(engine);engine=null;}
 if(!engine)engine=makeEngine(type);
 const T=engine.T,sp=mc?Math.abs(mc.speed||0):(lastCarP&&dt>0?Math.hypot(me.p[0]-lastCarP[0],me.p[2]-lastCarP[2])/dt:0);/* 0.16.27: server car speed, not jittery snapshot deltas */lastCarP=me.p.slice();engine.v+=(Math.min(T.top,sp)-engine.v)*Math.min(1,dt*4);
 const v=engine.v,x=v/T.top,thr=Math.abs(me.throttle||0);
 let hz,load;
 if(T.whine){hz=T.idle+v*28;load=x;}
 else{ // gearbox
  const R=T.ratios,K=(T.red*0.97)/(T.top*R[R.length-1]);engine.gear??=0;engine.shiftT=Math.max(0,(engine.shiftT||0)-dt);
  let rpm=v*R[engine.gear]*K;
  if(rpm>T.red&&engine.gear<R.length-1){engine.gear++;engine.shiftT=0.16;}
  else if(rpm<T.down&&engine.gear>0&&v*R[engine.gear-1]*K<T.red*0.92){engine.gear--;engine.shiftT=0.1;}
  rpm=Math.max(T.idleRpm,v*R[engine.gear]*K)+(thr&&v<1?T.idleRpm*0.6:0); // a blip of revs as you pull away
  engine.rpm=(engine.rpm??rpm)+(rpm-(engine.rpm??rpm))*Math.min(1,dt*(engine.shiftT>0?18:9));
  hz=engine.rpm/60*T.cyl/2;load=(engine.rpm-T.idleRpm)/(T.red-T.idleRpm);
 }
 const cutK=engine.shiftT>0?0.35:1;
 engine.o.frequency.setTargetAtTime(hz,actx.currentTime,T.whine?0.08:0.025);engine.o2.frequency.setTargetAtTime(T.whine?hz*2.01:hz*0.5,actx.currentTime,0.025);
 engine.f.frequency.setTargetAtTime(T.cut+load*T.cutSpan*(T.whine?1:0.35+0.65*thr),actx.currentTime,0.06);
 engine.g.gain.setTargetAtTime(T.gain*cutK*(T.whine?0.35+x*0.9:(0.45+0.35*thr+0.35*load)),actx.currentTime,engine.shiftT>0?0.02:0.08);
 if(engine.hiss)engine.hiss.ng.gain.setTargetAtTime(Math.min(0.05,v*0.002),actx.currentTime,0.1);
 if(!T.whine)engine.o.detune?.setTargetAtTime((Math.random()-0.5)*(type==='v12'?14:28),actx.currentTime,0.05); // combustion roughness
 /* 0.16.42: camera rumble with speed + jolt/thud on a hard stop */
 const drop=(engine.prev||0)-sp;engine.prev=sp;if(sp>6)shake=Math.max(shake,Math.min(0.25,sp*0.008));
 if(drop>6){shake=Math.min(1,shake+drop*0.05);try{const o=actx.createOscillator(),g=actx.createGain();o.type='sine';o.frequency.setValueAtTime(90,actx.currentTime);o.frequency.exponentialRampToValueAtTime(35,actx.currentTime+0.25);g.gain.setValueAtTime(Math.min(0.5,drop*0.03),actx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,actx.currentTime+0.3);o.connect(g).connect(actx.destination);o.start();o.stop(actx.currentTime+0.32);}catch{}}}

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
  setLang(lang);
  store.set('lang', getLang());
  document.querySelectorAll('.credit').forEach((a) => { a.href = BRAND.site; a.innerHTML = ''; const b = document.createElement('b'); b.textContent = BRAND.studio; a.append(t('menu.createdBy', { name: BRAND.creator }) + ' · ', b, ' ↗'); }); // after setLang, so it is in the new language
  updatePassiveBtn();
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
  showAccount();
  paintGate();
  updateWeaponHud();
  updateScoreboard();
  if (roomCode) $('scoreboard').querySelector('h2').textContent = t('hud.scoreboardRoom', { code: roomCode });
  renderLobby();
  renderShop();
  mapPicker?.refresh();
  startMenuRef?.refresh();
  if (document.getElementById('garage-btn')) $('garage-btn').textContent = '🚗 ' + t('garage.open');
  if (document.getElementById('league-btn')) $('league-btn').textContent = '🏆 ' + t('league.short');
}
for (const sel of document.querySelectorAll('.lang-select')) {
  // The four main languages first (English on top), then a divider, then the rest
  for (const [code, info] of Object.entries(LANGS)) {
    if (code === Object.keys(LANGS).find((c) => !CORE_LANGS.includes(c))) { const d = new Option('──────', ''); d.disabled = true; sel.append(d); }
    sel.append(new Option(info.name, code));
  }
  sel.addEventListener('change', (e) => applyLang(e.target.value));
}

// ======================= menu =======================
$('name').value = store.get('name', '');
$('sens').value = sens;
$('sens').addEventListener('input', (e) => { sens = Number(e.target.value); store.set('sens', sens); });
// Settings: checkboxes and the frame-rate choice are saved per device
for (const [id, key, def] of [['aim-assist', 'aimAssist', true], ['auto-fire', 'autoFire', false], ['vibrate-on', 'vibrate', true], ['lefty', 'lefty', false], ['music-on', 'music', true]]) {
  const el = $(id); if (!el) continue;
  el.checked = !!store.get(key, def);
  el.addEventListener('change', () => { store.set(key, el.checked); if (key === 'lefty') document.body.classList.toggle('lefty', el.checked); });
}
document.body.classList.toggle('lefty', isTouch && !!store.get('lefty', false));
{ const v = store.get('touchUI', null); $('controls').value = v === true ? 'touch' : v === false ? 'mouse' : 'auto'; }
$('controls').addEventListener('change', (e) => { const v = e.target.value; store.set('touchUI', v === 'touch' ? true : v === 'mouse' ? false : null); store.set('touchPick', v !== 'auto'); location.reload(); }); // controls need a fresh page
$('fps').value = String(store.get('fps', 60));
$('fps').addEventListener('change', (e) => store.set('fps', Number(e.target.value)));
$('difficulty').value = store.get('difficulty', 'normal');
$('difficulty').addEventListener('change', (e) => store.set('difficulty', e.target.value));
$('gyro-on').checked = gyro.on;
$('gyro-on').addEventListener('change', (e) => { gyro.on = e.target.checked; store.set('gyro', gyro.on); if (gyro.on) gyro.ask(); });
$('gfx').value = store.get('gfx', 'auto');
$('gfx').addEventListener('change', (e) => { store.set('gfx', e.target.value); location.reload(); }); // a new quality needs a fresh renderer
$('gyro-sens').value = gyro.sens;
$('gyro-sens').addEventListener('input', (e) => { gyro.sens = Number(e.target.value); store.set('gyroSens', gyro.sens); });
{const ms=$('map-select');if(ms){ms.value=MAP.id;ms.addEventListener('change',e=>{store.set('map',e.target.value);location.reload();});}} // 0.16.21 map select
// Picture gallery on top of the map select (same save + reload)
mapPicker=createMapPicker({select:$('map-select'),t,onPick:(id)=>{store.set('map',id);location.reload();}});
$('time').value = store.get('time', 'day');
$('time').addEventListener('change', (e) => { store.set('time', e.target.value); location.reload(); });
showProfile();
const offlineOnly = !!window.ARENA_OFFLINE || location.protocol === 'file:';
let lobby = null, googleCredential = null, googleUser = null;
try { googleCredential = sessionStorage.getItem('arena.gcred'); } catch { /* storage blocked */ }
// Signed in with Google on an earlier visit (Firebase): get a fresh token in the background
if (!googleCredential) { let r = null; try { r = localStorage.getItem('arena.fbr'); } catch { /* storage blocked */ } if (r) setTimeout(() => refreshFirebase().then((ok) => { if (ok) { store.set('gate', 'google'); showAccount(); leaveGate(); } }), 600); }
let lastAction = null, lastName = '';
function startOnline(action) {
  lastAction = action;
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
$('p2p-host').addEventListener('click', () => {
  const action = { t: 'p2pHost', mode: $('p2p-mode').value, capacity: Number($('p2p-capacity').value) };
  // free roam is played in the city: switch this device to the city first, then open the room
  if (action.mode === 'roam' && MAP.id !== 'city') { store.set('map', 'city'); try { sessionStorage.setItem('arena.autojoin', JSON.stringify({ action, name: $('name').value })); } catch { /* ignore */ } location.reload(); return; }
  startOnline(action);
});
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
$('roam-go').addEventListener('click', () => startOnline({ t: 'quickRoam' })); // free roam: open city, join any time
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

// Google sign-in (only when a reachable server publishes a Google client ID).
// arena.gcred is unchanged; a future cleanup may rename arena.* keys.
function readGoogleProfile(credential) {
  try {
    const p = JSON.parse(atob(credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { name: p.given_name || p.name || '', email: p.email || '', picture: p.picture || '' };
  } catch { return null; }
}
function showAccount() {
  const acc = $('account');
  if (!acc) return;
  const choice = store.get('gate');
  if (choice === 'google' && googleUser) {
    acc.textContent = t('menu.signedIn', { name: googleUser.name || '', email: googleUser.email || '' });
    if (!$('name').value && googleUser.name) $('name').value = googleUser.name;
    return;
  }
  acc.textContent = choice === 'guest' ? t('gate.asGuest') : '';
}
let googleReadyFor = null;
let gsiScriptStarted = false;
function setupGoogle(clientId) {
  if (!clientId) { $('gsi').replaceChildren(); googleReadyFor = null; paintGate(); return; }
  if (googleCredential) { paintGate(); return; }
  const locale = ['he', 'en', 'ru', 'ar'].includes(getLang()) ? getLang() : 'en';
  const key = clientId + ':' + locale;
  if (googleReadyFor === key && $('gsi').childElementCount) { paintGate(); return; }
  googleReadyFor = key;
  const render = () => {
    if (!window.google?.accounts?.id || googleCredential) { paintGate(); return; }
    google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: (resp) => {
        googleCredential = resp.credential;
        try { sessionStorage.setItem('arena.gcred', resp.credential); } catch { /* storage blocked */ }
        // Show the name straight away; the server verifies the token when we connect
        const profile = readGoogleProfile(resp.credential);
        if (profile) googleUser = profile;
        if (!$('name').value && googleUser?.name) $('name').value = googleUser.name;
        store.set('gate', 'google');
        showAccount();
        leaveGate();
      },
    });
    $('gsi').classList.remove('hidden');
    $('gsi').replaceChildren();
    google.accounts.id.renderButton($('gsi'), { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale, width: 280 });
    paintGate();
  };
  if (window.google?.accounts?.id) return render();
  if (gsiScriptStarted) return;
  gsiScriptStarted = true;
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.async = true;
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
    dot.className = 'dot ' + (sv.offline ? 'ok' : !st ? '' : st.waking ? 'slow waking' : st.down ? 'down' : st.ping > 150 ? 'slow' : 'ok');
    const info = document.createElement('span');
    const title = document.createElement('b'); title.textContent = sv.nameKey ? t(sv.nameKey) : sv.name;
    const sub = document.createElement('small'); sub.textContent = (sv.regionKey ? t(sv.regionKey) : sv.region || '') + (sv.offline ? '' : ' · ' + t('srv.mode'));
    info.append(title, sub);
    const meta = document.createElement('span');
    meta.className = 'meta';
    if (sv.offline) meta.textContent = 'offline';
    else if (!st) meta.textContent = '…';
    else if (st.waking) meta.textContent = t('srv.waking');
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
  refreshGoogleButton();
}

// ---------- 0.16.44 Google sign-in through Firebase (web: pop-up; Android app: the phone's browser, then back) ----------
function fbConfig() {
  for (const sv of servers) { const st = serverState.get(sv.id); if (st?.firebase?.apiKey) return { ...FIREBASE_WEB, ...st.firebase }; }
  return FIREBASE_WEB.apiKey ? FIREBASE_WEB : null;
}
const inApp = location.protocol === 'file:'; // the Android app loads the game from its own files
const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
async function firebaseLib() {
  if (!window.firebase?.auth) { await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js'); }
  if (!window.firebase.apps.length) window.firebase.initializeApp(fbConfig());
  return window.firebase;
}
function setFirebaseSession(idToken, refresh) {
  googleCredential = 'fb:' + idToken;
  try { sessionStorage.setItem('arena.gcred', googleCredential); } catch { /* storage blocked */ }
  if (refresh) { try { localStorage.setItem('arena.fbr', refresh); } catch { /* storage blocked */ } }
  const profile = readGoogleProfile(idToken); if (profile) googleUser = profile;
  if (!$('name').value && googleUser?.name) $('name').value = googleUser.name;
  store.set('gate', 'google'); showAccount(); leaveGate();
  if (ws?.readyState === 1) net({ t: 'auth', protocol: GAME_PROTOCOL, credential: googleCredential, guestToken: guestToken() }); // already connected: sign this session in
}
window.dropHavocSignIn = (t, r) => { if (t) setFirebaseSession(t, r); }; // called by the Android app after browser sign-in
discoverFirebase().then((ok) => { if (ok) refreshGoogleButton(); }); // settings published by the studio's Firebase site
// Keep the sign-in alive: Firebase ID tokens last an hour, the refresh token gets a new one
async function refreshFirebase() {
  const cfg = fbConfig(); let r = null; try { r = localStorage.getItem('arena.fbr'); } catch { /* storage blocked */ }
  if (!cfg || !r) return false;
  try {
    const res = await fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(cfg.apiKey), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(r) });
    const j = await res.json(); if (!j.id_token) return false;
    googleCredential = 'fb:' + j.id_token; try { sessionStorage.setItem('arena.gcred', googleCredential); localStorage.setItem('arena.fbr', j.refresh_token || r); } catch { /* storage blocked */ }
    const profile = readGoogleProfile(j.id_token); if (profile) googleUser = profile;
    return true;
  } catch { return false; }
}
setInterval(() => { if (String(googleCredential || '').startsWith('fb:')) refreshFirebase(); }, 45 * 60000);
async function firebaseSignIn() {
  if (!fbConfig()) return;
  if (inApp) { location.href = SIGNIN_PAGE; return; } // the app hands this link to the phone's browser
  try {
    const fb = await firebaseLib(); const p = new fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    const res = await fb.auth().signInWithPopup(p);
    setFirebaseSession(await res.user.getIdToken(), res.user.refreshToken);
  } catch (e) { const st = $('gate-google-status'); if (st) st.textContent = t('gate.googleFail') + ' ' + (e?.code || ''); }
}
function renderFirebaseButton() {
  const box = $('gsi'); if (!box) return;
  box.classList.remove('hidden'); box.replaceChildren();
  const b = document.createElement('button'); b.type = 'button'; b.className = 'fb-google';
  b.innerHTML = '<svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg><span></span>';
  b.querySelector('span').textContent = t('gate.googleButton');
  b.onclick = firebaseSignIn; box.appendChild(b);
}
function googleClientIdAvailable() {
  for (const sv of servers) {
    const st = serverState.get(sv.id);
    if (st && !st.down && st.googleClientId) return st.googleClientId;
  }
  return '';
}
function googleProbe() {
  const online = servers.filter((sv) => !sv.offline);
  if (!online.length) return 'off';
  if (fbConfig()) return 'ready';
  if (!googleClientIdAvailable() && online.some((sv) => !serverState.has(sv.id))) return 'wait';
  return googleClientIdAvailable() ? 'ready' : 'off';
}
function paintGate() {
  const googleOn = $('gate-google')?.getAttribute('aria-checked') === 'true';
  const label = $('gate-method-label');
  if (label) label.textContent = t(googleOn ? 'gate.google' : 'gate.guest');
  const hasCred = !!googleCredential;
  $('gate-google-continue')?.classList.toggle('hidden', !hasCred);
  $('gate-google-other')?.classList.toggle('hidden', !hasCred);
  $('gsi')?.classList.toggle('hidden', hasCred);
  const status = $('gate-google-status');
  if (!status) return;
  if (hasCred && googleUser?.email) status.textContent = t('menu.signedIn', { name: googleUser.name || '', email: googleUser.email });
  else {
    const probe = googleProbe();
    status.textContent = t(probe === 'ready' ? 'gate.googleReady' : probe === 'wait' ? 'gate.googleWait' : 'gate.googleOff');
  }
}
function refreshGoogleButton() {
  if (fbConfig() && !googleCredential) { renderFirebaseButton(); paintGate(); return; } // Firebase sign-in works on the web and in the app
  const id = googleClientIdAvailable();
  if (id && !googleCredential) setupGoogle(id);
  else paintGate();
}
function clearGoogleSession() {
  googleCredential = null;
  googleUser = null;
  googleReadyFor = null;
  try { sessionStorage.removeItem('arena.gcred'); localStorage.removeItem('arena.fbr'); } catch { /* storage blocked */ }
  try { window.firebase?.auth?.().signOut(); } catch { /* not loaded */ }
  $('gsi').replaceChildren();
}
function leaveGate() {
  document.body.classList.remove('is-gated');
  if ($('menu')) $('menu').inert = false;
  showAccount();
}
function selectGateMethod(method) {
  $('gate-guest')?.setAttribute('aria-checked', method === 'guest' ? 'true' : 'false');
  $('gate-google')?.setAttribute('aria-checked', method === 'google' ? 'true' : 'false');
  $('gate-guest-panel')?.classList.toggle('hidden', method !== 'guest');
  $('gate-google-panel')?.classList.toggle('hidden', method !== 'google');
  if (method === 'google') { googleReadyFor = null; refreshGoogleButton(); }
  else paintGate();
}
function enterAsGuest() {
  clearGoogleSession();
  guestToken();
  store.set('gate', 'guest');
  showAccount();
  leaveGate();
}
function enterAsGoogle() {
  if (!googleCredential) { selectGateMethod('google'); return; }
  store.set('gate', 'google');
  showAccount();
  leaveGate();
}
function openGate() {
  document.body.classList.add('is-gated');
  if ($('menu')) $('menu').inert = true;
  selectGateMethod(store.get('gate') === 'google' || googleCredential ? 'google' : 'guest');
}
function bootGate() {
  if (googleCredential && !googleUser) {
    const profile = readGoogleProfile(googleCredential);
    if (profile) googleUser = profile;
  }
  $('gate-guest')?.addEventListener('click', () => selectGateMethod('guest'));
  $('gate-google')?.addEventListener('click', () => selectGateMethod('google'));
  $('gate-enter')?.addEventListener('click', enterAsGuest);
  $('gate-google-continue')?.addEventListener('click', enterAsGoogle);
  $('gate-google-other')?.addEventListener('click', () => { clearGoogleSession(); selectGateMethod('google'); });
  $('gate-switch')?.addEventListener('click', openGate);
  if (document.body.classList.contains('is-gated')) {
    if ($('menu')) $('menu').inert = true;
    selectGateMethod(googleCredential ? 'google' : 'guest');
  }
}

// 0.16.55 The free online server sleeps when nobody plays and needs up to a minute to wake. A slow first answer is
// "waking up", not "down": keep asking for ~90 s (each ask also nudges it awake) before calling it unavailable.
async function pingServer(sv, tries = 0) {
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), tries ? 12000 : 5000);
    const r = await fetch(httpBase(sv) + '/config', { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(timer);
    const cfg = await r.json();
    if(!r.ok)throw Error('unavailable');
    serverState.set(sv.id, { firebase: cfg.firebase || null, incompatible:cfg.protocol!==GAME_PROTOCOL,ping: Math.round(performance.now() - t0), online: cfg.online, rooms: cfg.rooms, googleClientId: cfg.googleClientId });
  } catch {
    if (tries < 7) { serverState.set(sv.id, { waking: true }); renderServers(); setTimeout(() => pingServer(sv, tries + 1), 3000); return; }
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
const roomBrowser=mountRooms({container:$('room-list'),server:selectedServer,join:(code,map,locked)=>{const pass=locked?(prompt(t('rooms.needPass'))||'').trim():'';if(locked&&!pass)return;if(map&&map!==MAP.id){store.set('map',map);const u=new URL(location.href);u.search='';u.searchParams.set('room',code);u.searchParams.set('server',selectedServer()?.id||'');location.href=u.toString();return;}startOnline({t:'joinCode',code,pass});},t});
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
  if (document.body.classList.contains('is-gated')) return;
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
 const enemies=[],MMC=['#ff3b4a','#3ddc6a','#ffd23d','#c86bff','#ff8c2e','#2ee6e6','#ff5fc8','#a0ff4d'];let hi=0;for(const r of remotes.values())if(r.cur&&r.alive!==false&&r.group?.visible!==false)enemies.push({p:r.cur.p,color:r.bot?'#ff3b4a':MMC[(hi++)%MMC.length]});/* 0.16.42: each real player a distinct colour (you = blue), bots red; stays visible in cars */
 const data=minimapMarkers({map:MAP,me,enemies,cars:mmCars,events:evVis.markers()});drawMinimap(ctx,S,MAP,data,{landmarks:mmLand});drawPings(ctx,S,data.bounds);mmWrap.dataset.bounds=data.bounds;mmWrap.dataset.markers=data.markers.map(m=>m.type).join(',');}
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
  if (document.hidden) return;
  if (fpsCap() === 30 && now - lastFrame < 30) return; // battery saver: every other screen refresh
  adaptResolution(now - lastFrame, now);
  minimapTick(now);pingTick();pingHudTick(now);animateNature(now/1000);animateStreet(now/1000);grass.update(camera.position);followSun(camera.position.x,camera.position.z);
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (me.id) { peds.update(dt, now / 1000, camera.position); smashTick(now); smashFx.update(dt); }
  gunShopTick(now, dt);
  evVis.update(dt, now, me.yaw + (me.vehicle ? carLook.yaw : 0));
  skydiveTick(dt, now); // every frame, so the wind stops and the altimeter hides after landing or death // people on the sidewalks; cars smashing props
  { const wantMusic=!me.id&&!!actx&&actx.state==='running'&&!!store.get('music',true)&&!document.hidden; if(wantMusic!==music.playing){if(wantMusic)music.start();else music.stop();} } // 0.16.55 menu music only
  coach.update(now,{inMatch:!!me.id&&!gamePaused&&matchInfo.state==='playing',alive:me.alive,parachuting:!!me.parachuting,onGround:me.onGround!==false&&!me.parachuting,hasGun:!!(WEAPONS[me.weapon]&&!WEAPONS[me.weapon].melee&&!WEAPONS[me.weapon].unarmed),event:!!evVis.active}); // 0.16.55 first-match tips
  const sliding=!!(me.alive&&me.slideT>0&&!me.vehicle&&!me.parachuting);
  const tppOn=!!(me.alive&&!me.vehicle&&!me.parachuting&&((thirdPerson&&!(me.ads&&me.weapon==='sniper'))||sliding)&&me.id);
  tppActive=tppOn;
  // Glitch keeps the body on screen: the mesh is not hidden for the duration of the slide.
  if(dropAvatar){dropAvatar.group.visible=!!(me.alive&&(me.parachuting||tppOn)&&!vehicleVisuals.drivenBy(me.id));if(dropAvatar.char)dropAvatar.char.sliding=sliding;}
  if(me.vehicle&&me.netP){const k=1-Math.exp(-22*dt),mc=vehicleVisuals.carOf(me.id),ex=mc?vehicleVisuals.extrap(mc):[0,0];me.p[0]+=(me.netP[0]+ex[0]-me.p[0])*k;me.p[1]+=(me.netP[1]-me.p[1])*k;me.p[2]+=(me.netP[2]+ex[1]-me.p[2])*k;me.yaw=lerpAngle(me.yaw,me.netYaw,k);}
  if(isTouch)document.body.classList.toggle('in-car',!!me.vehicle);
  engineTick(dt);animateKnives(dt);vehicleVisuals.animate(dt, camera.position);worldLoot.animate(dt,camera.position);chestVisuals.animate(dt);
  {const vp=vehiclePrompts({alive:me.alive,paused:gamePaused,inVehicle:!!me.vehicle,nearCar:me.alive&&!me.vehicle&&!!vehicleVisuals.nearby(me.p,me.id),touch:isTouch});
  if(!me.alive||gamePaused){lootButton.hidden=true;enterBtn.hidden=true;carDriveBtn.hidden=true;carRideBtn.hidden=true;}else{const c=chestVisuals.nearest(me.p),car=vp.enter;const drop=worldLoot.nearest(me.p);const anyCar=!car&&!me.vehicle&&vehicleVisuals.nearby(me.p);const win=!c&&!car&&!me.vehicle&&!anyCar&&!drop&&me.onGround!==false&&!me.parachuting&&vaultNear(now);
  const carTxt='';{const dc=driveCar(),rc=rideCar(),inCar=!!me.vehicle;carDriveBtn.hidden=!(inCar||dc);if(!carDriveBtn.hidden)paintCarBtn(carDriveBtn,'E',inCar?'exit':'enter',t(inCar?'car.p.exit':'car.p.drive'));carRideBtn.hidden=!rc;if(rc)paintCarBtn(carRideBtn,'G','ride',t('car.p.ride'));}lootButton.textContent=carTxt||(drop?t('loot.pickup',{item:lootName(drop)}):c?t(c.rare?'loot.rare':'loot.open'):anyCar?t('car.notOwned'):win?t('win.vault'):'');lootButton.hidden=!lootButton.textContent||(vp.button&&!!carTxt);carBtn.hidden=!!me.vehicle||MAP.id!=='city'||!!MAP.noVehicles; /* cars only in the big city map */
  enterBtn.hidden=true;const el=me.vehicle?t('car.exitBtn'):t('car.enterBtn');if(enterBtn.dataset.l!==el){enterBtn.dataset.l=el;enterBtn.innerHTML='<img src="icons/actions/car.svg" alt=""><span>'+el+'</span>';}}}

  if (me.alive && !gamePaused && matchInfo.state === 'playing') {
    let f = 0, s = 0;
    if (!chatOpen) {
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
    }
    f += touchMove.f; s += touchMove.s;
    if (me.down) { f = 0; s = 0; wantJump = false; keys.delete('Space'); me.stance = 2; } // run over: lying on the road until the server lets you up
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
    if (me.grapple && (keys.has('Space') || wantJump)) { releaseGrapple(false); keys.delete('Space'); wantJump = false; } // jump lets go of the rope
    updateGrapple(dt, now); const roped = !!me.grapple; // 0.16.58: on the rope the pull steers, not the stick
    if(!me.vehicle)step(me, { f: roped ? 0 : f, s: roped ? 0 : s, jump: !roped && (keys.has('Space') || wantJump || (me.parachuting && touchHb)) /* touch: hold jump = flare under the canopy */, yaw: me.yaw, ads: me.ads, slide: !roped && wantSlide, dash: !roped && wantDash, boost: now < buffs.speedUntil ? 1.3 : 1 }, dt, MAP.boxes);
    wantSlide = false; slideTick();
    updateStanceHud();
    if (wantDash) { wantDash = false; if (me.dashT > 0 && me.dashCd > PLAYER.dashCooldown - 0.05) onDash(); }
    if (me.padded) { me.padded = false; sfx.pad(); vibrate(25); }
    me.eyeH += (stanceOf(me.stance).eye - (me.slideT > 0 ? 0.35 : 0) - me.eyeH) * Math.min(1, dt * 10); // 0.16.32 lower eye on the knee slide
    wantJump = false;
    if (mouseDown || autoFireTick(now)) tryFire(now);
    const speed = Math.hypot(me.v[0], me.v[2]);
    bob += dt * speed * 1.6 * (me.onGround ? 1 : 0);
    const hb=me.vehicle&&(keys.has('Space')||touchHb)?1:0; // handbrake (GTA: Space)
    if(me.vehicle)me.throttle=f; // engine sound follows the pedal
    if(me.vehicle&&(f+','+s+','+hb)!==lastDrive){lastDrive=f+','+s+','+hb;lastSend=now;net({t:'drive',f,s,h:hb});} // 0.16.22: send drive input the moment it changes
    if (now - lastSend > 50) {
      lastSend = now;
      if(me.vehicle){lastDrive=f+','+s+','+hb;net({t:'drive',f,s,h:hb});me.throttle=f;}else net({ t: 'state', p: me.p.map((n) => Math.round(n * 1000) / 1000), yaw: me.yaw, pitch: me.pitch, w: me.weapon, st: me.stance, a: me.ads ? 1 : 0, pc: me.parachuting ? (me.chuteOpen ? 2 : 1) : 0 });
    }
  }

  // Camera
  recoil *= Math.pow(0.0005, dt);
  shake *= Math.pow(0.002, dt);
  const sniperScoped = me.ads && me.weapon === 'sniper' && me.alive;
  const targetFov = me.vehicle || me.parachuting ? 86 : me.ads && me.alive ? WEAPONS[me.weapon].adsFov + (tppActive ? 12 : 0) : 78 + (me.slideT > 0 ? 10 : 0); // wider view while sliding; over-the-shoulder aim zooms a little less
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
  camera.updateProjectionMatrix();
  if(me.alive&&me.parachuting){
    const own=roster.find(p=>p.id===me.id),key=JSON.stringify([selectedChar,own?.cosmetics,soldierReady()]);
    if(!dropAvatar||dropAvatarKey!==key){if(dropAvatar)scene.remove(dropAvatar.group);dropAvatar=makeRemote({id:me.id,name:'',color:me.color,character:selectedChar,cosmetics:own?.cosmetics});dropAvatar.tag.visible=false;dropAvatarKey=key;}
    dropAvatar.group.visible=true;dropAvatar.group.position.set(...me.p);dropAvatar.group.rotation.y=me.yaw;
    // Canopy: unfolds over ~1 s when opened (GTA), hidden in free fall
    const unfold=me.chuteOpen?Math.min(1,1-Math.max(0,me.openT||0)/PARACHUTE.openTime):0;dropAvatar.canopy.visible=unfold>0;dropAvatar.canopy.scale.set(0.2+0.8*unfold,0.35+0.65*unfold,0.2+0.8*unfold);
    animate(dropAvatar.char,0,now/1000,dt);skydivePose(dropAvatar.char,!me.chuteOpen,me.v,now);for(const gun of Object.values(dropAvatar.guns))gun.visible=false;if(unfold>0)swayParachute(dropAvatar.canopy,now/1000,me.v[0],me.v[2]);
    const freefall=!me.chuteOpen,target=new THREE.Vector3(me.p[0],me.p[1]+(freefall?1:2.5),me.p[2]),offset=freefall?new THREE.Vector3(Math.sin(me.yaw)*7,5.5,Math.cos(me.yaw)*7):new THREE.Vector3(Math.sin(me.yaw)*10,4.6,Math.cos(me.yaw)*10);
    const distance=offset.length(),direction=offset.clone().normalize(),safe=Math.max(.7,rayWorld(target.toArray(),direction.toArray(),MAP.boxes,distance)-.4);
    const ideal=target.clone().addScaledVector(direction,Math.min(distance,safe));if(!wasParachuting)camera.position.copy(ideal);else camera.position.lerp(ideal,1-Math.exp(-6*dt));camera.lookAt(me.p[0],me.p[1]+1.8,me.p[2]);
  }else if(me.alive&&me.vehicle){
    const target=new THREE.Vector3(me.p[0],me.p[1]+1.35,me.p[2]);
    // 0.16.13: V cycles chase / hood / cinematic.
    // 0.16.24: carLook offsets (touch/mouse/keys/gyro) orbit chase+cinematic and aim the hood cam.
    const ly=me.yaw+carLook.yaw,lp=carLook.pitch,cin=now/4000,offset=carCam===1?new THREE.Vector3(-Math.sin(me.yaw)*0.6,0.25,-Math.cos(me.yaw)*0.6):carCam===2?new THREE.Vector3(Math.sin(ly+1.1+Math.sin(cin)*0.5)*9*Math.cos(lp),Math.max(0.8,2.2-Math.sin(lp)*7),Math.cos(ly+1.1+Math.sin(cin)*0.5)*9*Math.cos(lp)):new THREE.Vector3(Math.sin(ly)*7.5*Math.cos(lp),Math.max(0.9,3.6-Math.sin(lp)*5),Math.cos(ly)*7.5*Math.cos(lp)),length=offset.length(),direction=offset.clone().normalize();
    // Keep the chase camera in front of nearby walls rather than looking through them.
    const safe=Math.max(0.7,rayWorld(target.toArray(),direction.toArray(),MAP.boxes.filter(b=>!b.vehicle),length)-0.35);
    const ideal=target.clone().addScaledVector(direction,Math.min(length,safe));camera.position.lerp(ideal,1-Math.exp(-8*dt));
    if(carCam===1){camera.position.copy(target).add(offset);camera.rotation.set(lp*0.8,ly,0,'YXZ');}else camera.lookAt(target.x-Math.sin(ly)*3,target.y+Math.max(0,lp)*5,target.z-Math.cos(ly)*3); // 0.16.47: mouse up = look up (was upside down)
  }else if(me.alive&&tppOn){
    const own=roster.find(p=>p.id===me.id),key=JSON.stringify([selectedChar,own?.cosmetics,soldierReady()]);
    if(!dropAvatar||dropAvatarKey!==key){if(dropAvatar)scene.remove(dropAvatar.group);dropAvatar=makeRemote({id:me.id,name:'',color:me.color,character:selectedChar,cosmetics:own?.cosmetics});dropAvatar.tag.visible=false;dropAvatarKey=key;}
    const av=dropAvatar;av.group.visible=!vehicleVisuals.drivenBy(me.id);// 0.16.16: no duplicate body while the car's driver clone plays enter/exit
    av.canopy.visible=false;av.group.position.set(...me.p);av.group.rotation.y=me.yaw;
    av.headPivot.rotation.x=me.pitch*0.6;av.arm.rotation.x=me.pitch;av.char.stance=sliding?1:(me.stance||0);av.char.slide=me.slideT>0;
    if(av.weapon!==me.weapon){av.weapon=me.weapon;setHold(av.char,me.weapon);}for(const [k,g] of Object.entries(av.guns))g.visible=k===me.weapon;
    av.char.aiming=!!(me.ads||now-me.lastShot<1500);setCharacterGear(av.char,buffs.helmetLvl||0,buffs.vestLvl||0);
    animate(av.char,Math.hypot(me.v[0],me.v[2]),now/1000,dt);
    // PUBG-style over-the-shoulder camera: same aim angles as first person, so the crosshair stays true.
    const cp=Math.cos(me.pitch),fwd=new THREE.Vector3(-Math.sin(me.yaw)*cp,Math.sin(me.pitch),-Math.cos(me.yaw)*cp),right=new THREE.Vector3(Math.cos(me.yaw),0,-Math.sin(me.yaw));
    tppZoom+=((me.ads?1:0)-tppZoom)*Math.min(1,dt*12);camSide+=(shoulder-camSide)*Math.min(1,dt*10);
    const head=new THREE.Vector3(me.p[0],me.p[1]+me.eyeH+0.35-tppZoom*0.12,me.p[2]).addScaledVector(right,(0.55+tppZoom*0.1)*camSide);
    const back=fwd.clone().negate(),dist=3.1-tppZoom*1.7,safe=Math.max(0.4,rayWorld(head.toArray(),back.toArray(),MAP.boxes.filter(b=>!b.vehicle),dist)-0.3);
    camera.position.copy(head).addScaledVector(back,Math.min(dist,safe));
    camera.position.y=Math.max(camera.position.y,me.p[1]+0.75); // 0.16.59 looking up: the camera stays above knee height instead of digging under you
    if((Math.min(dist,safe)<1.05||camera.position.distanceTo(head)<1.1)&&dropAvatar&&!me.vehicle)dropAvatar.group.visible=false; // 0.16.59 back to a wall: the camera would sit inside your own arm, so hide the body (GTA does the same)
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
  const longGun=['rifle','m4','m16','smg','shotgun','sniper','rpg'].includes(me.weapon);
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
  vmFists.visible = vmRoot.visible && me.weapon === 'unarmed'; if (vmFists.visible) updateFpFists(); // 0.16.57
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
  } else if (matchInfo.state === 'playing' && roomMode === 'roam') $('timer').textContent = t('hud.roam');
  if (reloading) $('mag').textContent = '…';

  animateArena(now / 1000);
  animateItems(now / 1000);
  updateBuffHud(now);
  updateRemotes(now, dt);
  if (contactShadows) { // 0.16.44: soft shadows under people and cars where shadow maps are off (phones)
    const mv = [];
    for (const r of remotes.values()) if (r.cur && r.group.visible) mv.push({ x: r.group.position.x, y: r.cur.p[1], z: r.group.position.z, r: 0.55 });
    if (me.alive && (tppActive || me.vehicle)) mv.push({ x: me.p[0], y: me.p[1], z: me.p[2], r: 0.55 });
    for (const c of vehicleVisuals.list()) mv.push({ x: c.p[0], y: 0, z: c.p[2], w: CAR_HALF.x * 2.3, l: CAR_HALF.z * 2.2, yaw: c.yaw });
    for (const pp of peds.list || []) mv.push({ x: pp.x, y: pp.y, z: pp.z, r: 0.5 });
    contactShadows.update(mv, camera.position);
  }
  updateEffects(dt);
  updateRockets(dt);
  updateCombatHud(now);
  updateDamageNumbers(dt);

  // ?debug only: a fixed "photo" camera, used to make the map preview pictures (tools/map-previews.cjs)
  const photoCam = window.arenaDebug?.photoCam;
  if (photoCam) { camera.position.set(...photoCam.pos); camera.lookAt(...photoCam.look); camera.fov = photoCam.fov || 50; camera.updateProjectionMatrix(); }
  renderer.clear();
  if (post) post.render(now / 1000); else renderer.render(scene, camera);
  if (photoCam) return; // no first-person weapon in the picture
  renderer.clearDepth();
  renderer.render(vmScene, vmCamera);
}
for (const g in viewGuns) viewGuns[g].visible = g === me.weapon;
updateWeaponHud();
addEventListener('pointerdown', () => { if (!me.id) initAudio(); }, { capture: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) music.stop(); }); // app in the background: silence // 0.16.55 the first tap in the menu unlocks sound (menu music)
requestAnimationFrame(frame);

// Language last: every UI piece it updates exists by now
bootGate();
applyLang(detectLang(store.get('lang', null)));
createIntro(); // opening screen, cinematic menu backdrop, two-column sign-in on phones held sideways
// 0.16.44 start flow: Single player / Multiplayer picture cards, then map or room (public/start-menu.js)
const startMenu = createStartMenu({ t, store, currentMap: () => MAP.id, servers: () => servers,
  selectServer: (id) => { if (!id) return; selectedServerId = id; store.set('server', id); renderServers(); },
  httpBase, startOnline, nameInput: $('name'),
  openMenu: () => { startMenu.hide(); $('menu').scrollTop = 0; },
  openShop, openGarage, openLeague: () => league.open() });
{ const backBtn = document.createElement('button'); backBtn.type = 'button'; backBtn.className = 'chip chip-btn'; backBtn.id = 'to-start'; backBtn.setAttribute('data-i18n', 'start.back'); backBtn.textContent = t('start.back');
  backBtn.onclick = () => startMenu.show(); $('shop-btn').before(backBtn); }
startMenuRef = startMenu;
const syncStart = () => { if ($('menu').classList.contains('hidden')) startMenu.hide(); };
new MutationObserver(syncStart).observe($('menu'), { attributes: true, attributeFilter: ['class'] });
if (!$('menu').classList.contains('hidden')) startMenu.show();
try {
  const notice = sessionStorage.getItem('arena.notice');
  if (notice) { $('menu-status').textContent = notice; sessionStorage.removeItem('arena.notice'); }
  const aj = sessionStorage.getItem('arena.autojoin');
  if (aj) { sessionStorage.removeItem('arena.autojoin'); const { action } = JSON.parse(aj); if (action) setTimeout(() => startOnline(action), 300); }
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
