import * as THREE from 'three';
import { buildHelmet, buildVest, buildMed, buildDrink, buildAmmo, LEVEL_RING } from './gear-visuals.js';
// Loot lying on the floor (PUBG style): real models with a soft level-coloured ring under them.
// Only items near the camera are drawn (the city holds ~100 of them), so phones are not slowed down.
const SHOW_DIST = 45;
const KIND_RING = { weapon: 0x7cff9e, heal: 0xff6b6b, drink: 0x4fc3ff, ammo: 0xffd24d, credits: 0xffcf58 };
const levelOf = (d) => d.loot?.vest || d.loot?.helmetLvl || 0;
export const lootLabelKey = (d) => (d.kind === 'weapon' ? 'weapon.' + d.loot.weapon : d.kind === 'heal' ? 'loot.' + d.loot.heal : 'loot.' + d.kind);
export function createWorldLoot(scene, gunModel) {
  const objects = new Map();
  const ringGeo = new THREE.TorusGeometry(0.34, 0.016, 5, 24);
  const ringMats = new Map();
  const ringMat = (c) => { if (!ringMats.has(c)) ringMats.set(c, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75 })); return ringMats.get(c); };
  function model(d) {
    if (d.kind === 'weapon') { const g = gunModel(d.loot.weapon, 0.8); g.rotation.z = Math.PI / 2; return g; } // lying on its side
    if (d.kind === 'armor') return buildVest(d.loot.vest || 1);
    if (d.kind === 'helmet') return buildHelmet(d.loot.helmetLvl || 1);
    if (d.kind === 'heal') return buildMed(d.loot.heal);
    if (d.kind === 'drink') return buildDrink();
    if (d.kind === 'ammo') return buildAmmo();
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), new THREE.MeshStandardMaterial({ color: 0xffcf58, metalness: 0.8, roughness: 0.3 }));
    coin.rotation.x = Math.PI / 2; return coin;
  }
  function add(d) {
    const root = new THREE.Group(), mesh = model(d);
    root.add(mesh);
    const lvl = levelOf(d);
    const ring = new THREE.Mesh(ringGeo, ringMat(lvl ? LEVEL_RING[lvl] : KIND_RING[d.kind] ?? 0xffffff));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; root.add(ring);
    // Lying items: vests flat, helmets upright; a small lift so nothing sinks into the floor
    if (d.kind === 'armor') { mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.06; }
    else if (d.kind === 'helmet') mesh.position.y = 0.09;
    else if (d.kind === 'weapon') mesh.position.y = 0.06;
    else mesh.position.y = 0.09;
    const flying = d.origin && (d.origin[0] !== d.p[0] || d.origin[2] !== d.p[2]);
    root.position.set(...(flying ? d.origin : d.p));
    root.rotation.y = (d.p[0] * 7.13 + d.p[2] * 3.7) % (Math.PI * 2); // each item lies at its own angle
    scene.add(root);
    objects.set(d.id, { ...d, root, mesh, age: flying ? 0 : 1 });
  }
  function remove(id) { const m = objects.get(id); if (m) { scene.remove(m.root); objects.delete(id); } }
  // Full list (match start / join) or a single taken id
  function sync(list) {
    const alive = new Set(list.map((d) => d.id));
    for (const id of [...objects.keys()]) if (!alive.has(id)) remove(id);
    for (const d of list) if (!objects.has(d.id)) add(d);
  }
  function animate(dt, cam) {
    for (const m of objects.values()) {
      if (cam) { const far = Math.hypot(m.p[0] - cam.x, m.p[2] - cam.z) > SHOW_DIST; m.root.visible = !far; if (far) continue; }
      if (m.age < 1) { // thrown out of a fallen player or a crate: a short arc to its spot
        m.age = Math.min(1, m.age + dt / 0.65);
        const k = m.age;
        m.root.position.set(m.origin[0] + (m.p[0] - m.origin[0]) * k, m.p[1] + Math.sin(k * Math.PI) * 0.9, m.origin[2] + (m.p[2] - m.origin[2]) * k);
      }
    }
  }
  function nearest(p) { let chosen = null, range = 2.2; for (const m of objects.values()) { const d = Math.hypot(...p.map((n, i) => n - m.p[i])); if (d < range) { range = d; chosen = m; } } return chosen; }
  return { sync, remove, animate, nearest };
}
