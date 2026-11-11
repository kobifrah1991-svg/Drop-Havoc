// 0.16.51 Live events on screen (shared/events.js decides everything): a banner at the top with an icon, the title,
// what to do, the time left and how far/which way; in the world a crate falling under a parachute with a beam where
// it lands, a red marker over the most wanted player, a marker over the delivery car and a green beam at its goal.
import * as THREE from 'three';
import { EVENT } from './shared/events.js';

const ICON = { supply: '📦', bounty: '🎯', delivery: '🚚' };
export const EVENT_COLOR = { supply: '#ffb020', bounty: '#ff3b4a', delivery: '#3ddc6a' };

export function createEventsVisuals(scene, { t, me, positionOf, toast, sfx }) {
  let ev = null;
  const banner = document.createElement('div'); banner.id = 'event-banner'; banner.hidden = true;
  banner.innerHTML = '<span class="ev-icon"></span><div class="ev-text"><b></b><small></small></div><div class="ev-side"><span class="ev-time"></span><span class="ev-dist"><i class="ev-arrow">▲</i><em></em></span></div>';
  document.body.appendChild(banner);
  const beamGeo = new THREE.CylinderGeometry(1.1, 1.1, 60, 24, 1, true); beamGeo.translate(0, 30, 0);
  const beam = (color) => new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  const markerGeo = new THREE.ConeGeometry(0.45, 0.9, 4); markerGeo.rotateX(Math.PI);
  const marker = (color) => new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
  // the crate: the designed supply-crate art (img/events/supply-frenzy/crate-tile.png) under a small canopy
  const crate = new THREE.Group();
  { const art = new THREE.TextureLoader().load('img/events/supply-frenzy/crate-tile.png'); art.colorSpace = THREE.SRGBColorSpace;
    const wood = new THREE.MeshStandardMaterial({ map: art, roughness: 0.55, metalness: 0.2 }), band = new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.6 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), wood); b.position.y = 0.45; crate.add(b);
    for (const y of [0.15, 0.75]) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 1.24), band); s.position.y = y; crate.add(s); }
    const chute = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, side: THREE.DoubleSide }));
    chute.position.y = 4.2; chute.name = 'chute'; crate.add(chute);
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.6), band); l.position.set(x * 1.6, 2.6, z * 1.6); l.lookAt(0, 4.2, 0); l.rotateX(Math.PI / 2); crate.add(l); } }
  const supplyBeam = beam(0xffb020), destBeam = beam(0x3ddc6a), bountyMark = marker(0xff3b4a), carMark = marker(0xffd23d);
  for (const o of [crate, supplyBeam, destBeam, bountyMark, carMark]) { o.visible = false; scene.add(o); }
  const title = (type) => t('event.' + type + '.title');
  function set(m) {
    if (m.end) {
      if (ev && m.id === ev.id) ev = null;
      if (m.winner && m.winner === me.id) { toast('🏆 ' + t('event.youWon', { n: m.cash }), '#69f0ae'); sfx?.kill?.(); }
      else if (m.winner) toast(ICON[m.type] + ' ' + t('event.won', { name: m.name, event: title(m.type) }), '#ffd23d');
      else toast(ICON[m.type] + ' ' + t('event.over', { event: title(m.type) }), '#a3a9d6');
      return;
    }
    if (m.start) { ev = { ...m, startedAt: performance.now() }; toast(ICON[m.type] + ' ' + title(m.type), EVENT_COLOR[m.type]); sfx?.pickup?.(); }
    else if (ev && m.id === ev.id) Object.assign(ev, m);
    else if (!ev && m.update) ev = { ...m, startedAt: performance.now() };
  }
  // where the player should head: the crate, the wanted one, the car (or, once you drive it, the goal)
  function goal() {
    if (!ev) return null;
    if (ev.type === 'supply') return ev.p;
    if (ev.type === 'bounty') return ev.target === me.id ? null : (positionOf(ev.target) || ev.p);
    if (ev.type === 'delivery') return me.vehicle === ev.car ? ev.dest : ev.p;
    return null;
  }
  function update(dt, nowMs, camYaw) {
    for (const o of [crate, supplyBeam, destBeam, bountyMark, carMark]) o.visible = false;
    if (!ev || !me.id) { banner.hidden = true; return; }
    const left = Math.max(0, Math.round((ev.ends - Date.now()) / 1000));
    banner.hidden = false; banner.dataset.type = ev.type;
    banner.querySelector('.ev-icon').textContent = ICON[ev.type];
    banner.querySelector('b').textContent = title(ev.type);
    banner.querySelector('small').textContent = ev.type === 'bounty' && ev.target === me.id ? t('event.bounty.you') : t('event.' + ev.type + '.desc', { n: EVENT[ev.type].cash, name: ev.name || '' });
    banner.querySelector('.ev-time').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    const g = goal(), dist = banner.querySelector('.ev-dist');
    if (g && me.p) { const dx = g[0] - me.p[0], dz = g[2] - me.p[2], d = Math.hypot(dx, dz); dist.hidden = false; dist.querySelector('em').textContent = Math.round(d) + ' m';
      const bearing = Math.atan2(-dx, -dz) - (camYaw ?? me.yaw); dist.querySelector('.ev-arrow').style.transform = `rotate(${-bearing}rad)`; }
    else dist.hidden = true;
    const k = 0.5 + 0.5 * Math.sin(nowMs / 250);
    if (ev.type === 'supply') {
      const f = Math.min(1, Math.max(0, 1 - (ev.landAt - Date.now()) / EVENT.supply.fallMs));
      crate.visible = true; crate.position.set(ev.p[0], 120 * (1 - f), ev.p[2]); crate.getObjectByName('chute').visible = f < 0.995; crate.rotation.y += dt * 0.4;
      supplyBeam.visible = true; supplyBeam.position.set(ev.p[0], 0, ev.p[2]); supplyBeam.material.opacity = 0.14 + 0.1 * k;
    }
    if (ev.type === 'bounty') { const p = positionOf(ev.target) || ev.p; if (p && ev.target !== me.id) { bountyMark.visible = true; bountyMark.position.set(p[0], p[1] + 2.9 + 0.15 * k, p[2]); bountyMark.rotation.y += dt * 2; } }
    if (ev.type === 'delivery') {
      if (ev.p && me.vehicle !== ev.car) { carMark.visible = true; carMark.position.set(ev.p[0], 3.4 + 0.2 * k, ev.p[2]); carMark.rotation.y += dt * 2; }
      destBeam.visible = true; destBeam.position.set(ev.dest[0], 0, ev.dest[2]); destBeam.material.opacity = 0.16 + 0.1 * k;
    }
  }
  // for the minimap
  const markers = () => { const g = ev && (ev.type === 'delivery' ? (me.vehicle === ev.car ? ev.dest : ev.p) : ev.type === 'bounty' ? (ev.target === me.id ? null : positionOf(ev.target) || ev.p) : ev.p); return g ? [{ p: g, color: EVENT_COLOR[ev.type] }] : []; };
  return { set, update, markers, get active() { return ev; } };
}
