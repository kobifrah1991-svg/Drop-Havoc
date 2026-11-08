// PUBG-style gear models, built from primitives (no files to download): helmets and plate carriers in three
// levels, worn on characters and lying around as loot, plus medical items, an energy drink and an ammo box.
// Geometries and materials are created once and shared by every copy, so a full lobby costs little.
// Local space: metres, -Z forward, +Y up. Helmets: origin at the centre of the head. Vests: origin at the
// upper chest (the spine bone they follow).
import * as THREE from 'three';

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const std = (color, roughness = 0.7, metalness = 0.05, extra = {}) => once(`m${color}-${roughness}-${metalness}-${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
const box = (w, h, d) => once(`b${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d));
const add = (g, geo, mat, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; g.add(m); return m; };

// Level colours (also used for loot rings and HUD): grey, olive, black
export const GEAR_COLORS = { 1: 0x9aa3ad, 2: 0x6d7a46, 3: 0x2a2d31 };
export const LEVEL_RING = { 1: 0xd8dde3, 2: 0x5aa0ff, 3: 0xc070ff };

// ---------- helmets ----------
export function buildHelmet(level) {
  const g = new THREE.Group();
  const shell = once(`hshell${level}`, () => {
    const geo = new THREE.SphereGeometry(level === 1 ? 0.142 : 0.15, 22, 12, 0, Math.PI * 2, 0, Math.PI * (level === 1 ? 0.62 : 0.56));
    geo.scale(1, level === 3 ? 0.92 : 0.88, 1.1);
    return geo;
  });
  const shellMat = level === 1 ? std(0x8e979f, 0.35, 0.3) : level === 2 ? std(0x5f6b3c, 0.85) : std(0x232629, 0.55, 0.2);
  add(g, shell, shellMat, 0, 0.035, 0.008);
  // Rim / brim
  const rim = once(`hrim${level}`, () => new THREE.TorusGeometry(level === 1 ? 0.138 : 0.148, 0.011, 6, 28));
  const r = add(g, rim, std(level === 2 ? 0x4c5630 : 0x1a1c1f, 0.8), 0, 0.03, 0.008);
  r.rotation.x = Math.PI / 2; r.scale.set(1, 1.1, 1);
  // Chin strap
  for (const s of [-1, 1]) add(g, box(0.012, 0.11, 0.02), std(0x1f1f1f, 0.9), s * 0.128, -0.03, 0.0);
  if (level === 2) { // cloth band and a small badge
    const band = add(g, once('hband', () => new THREE.CylinderGeometry(0.152, 0.152, 0.03, 24, 1, true)), std(0x3f4628, 0.95), 0, 0.075, 0.008);
    band.scale.set(1, 1, 1.1);
  }
  if (level === 3) { // ear protection, side rails, night-vision mount
    for (const s of [-1, 1]) {
      const cup = add(g, once('hcup', () => new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16)), std(0x16181a, 0.6), s * 0.148, -0.005, 0.01);
      cup.rotation.z = Math.PI / 2;
      add(g, box(0.012, 0.025, 0.12), std(0x3a3d41, 0.4, 0.6), s * 0.142, 0.05, 0.005);
    }
    add(g, box(0.05, 0.035, 0.03), std(0x3a3d41, 0.4, 0.6), 0, 0.075, -0.155);
    add(g, box(0.06, 0.012, 0.09), std(0x16181a, 0.6), 0, 0.165, 0.0);
  }
  return g;
}

// ---------- plate carriers ----------
export function buildVest(level) {
  const g = new THREE.Group();
  const main = level === 1 ? std(0x2b3646, 0.9) : level === 2 ? std(0x5c6840, 0.9) : std(0x1d2023, 0.85);
  const webbing = std(level === 2 ? 0x46502f : 0x111315, 0.95);
  const thick = level === 1 ? 0.035 : level === 2 ? 0.05 : 0.065;
  // Front and back panels (level 1: soft vest that wraps lower; 2-3: plates)
  const h = level === 1 ? 0.42 : 0.36, w = level === 1 ? 0.36 : 0.32;
  add(g, box(w, h, thick), main, 0, -0.1, -0.135);
  add(g, box(w, h, thick), main, 0, -0.1, 0.125);
  // Sides (cummerbund) and shoulder straps
  for (const s of [-1, 1]) {
    add(g, box(0.035, level === 1 ? 0.3 : 0.2, 0.24), main, s * 0.175, -0.15, -0.005);
    add(g, box(0.07, 0.025, 0.27), main, s * 0.1, 0.085, -0.005);
  }
  if (level >= 2) {
    // Mag pouches on the front and webbing rows
    const pouch = std(level === 2 ? 0x56613b : 0x25292c, 0.9);
    for (const x of [-0.09, 0, 0.09]) add(g, box(0.075, 0.1, 0.045), pouch, x, -0.21, -0.17);
    for (const y of [-0.06, -0.1]) add(g, box(w - 0.02, 0.012, 0.006), webbing, 0, y, -0.164 - (thick - 0.05) / 2);
  }
  if (level === 3) {
    // Ceramic plate bulge, collar and a radio pouch
    add(g, box(0.24, 0.26, 0.02), std(0x2b2f33, 0.5, 0.15), 0, -0.07, -0.172);
    const collar = add(g, once('vcollar', () => new THREE.TorusGeometry(0.12, 0.025, 6, 18, Math.PI)), main, 0, 0.1, 0.0);
    collar.rotation.x = Math.PI / 2; collar.rotation.z = Math.PI;
    add(g, box(0.05, 0.13, 0.04), std(0x16181a, 0.7), 0.13, -0.08, -0.17);
  }
  return g;
}

// ---------- loot-only items ----------
export function buildMed(kind) {
  const g = new THREE.Group();
  if (kind === 'bandage') {
    const roll = add(g, once('bandroll', () => new THREE.CylinderGeometry(0.07, 0.07, 0.09, 20)), std(0xf3efe6, 0.95));
    roll.rotation.z = Math.PI / 2;
    add(g, once('bandtail', () => new THREE.BoxGeometry(0.09, 0.004, 0.14)), std(0xf3efe6, 0.95), 0, -0.068, -0.07);
  } else {
    const big = kind === 'medkit';
    add(g, box(big ? 0.42 : 0.3, big ? 0.16 : 0.12, big ? 0.28 : 0.2), std(big ? 0xd8d8d0 : 0xd23b32, 0.5));
    const cross = std(big ? 0xd23b32 : 0xffffff, 0.6, 0, { emissive: big ? 0x400000 : 0x222222 });
    const y = (big ? 0.16 : 0.12) / 2 + 0.003;
    add(g, box(0.1, 0.006, 0.03), cross, 0, y, 0); add(g, box(0.03, 0.006, 0.1), cross, 0, y, 0);
    add(g, box(big ? 0.12 : 0.09, 0.02, 0.02), std(0x2b2b2b, 0.6), 0, y + 0.01, 0); // handle
  }
  return g;
}
export function buildDrink() {
  const g = new THREE.Group();
  add(g, once('can', () => new THREE.CylinderGeometry(0.04, 0.04, 0.16, 20)), std(0x1e6bff, 0.25, 0.8));
  add(g, once('canband', () => new THREE.CylinderGeometry(0.0405, 0.0405, 0.05, 20, 1, true)), std(0xffd400, 0.3, 0.6), 0, 0.01, 0);
  add(g, once('cantop', () => new THREE.CylinderGeometry(0.036, 0.04, 0.012, 20)), std(0xc0c4c8, 0.3, 0.9), 0, 0.086, 0);
  return g;
}
export function buildAmmo() {
  const g = new THREE.Group();
  add(g, box(0.34, 0.2, 0.18), std(0x4f5b37, 0.55, 0.5));
  add(g, box(0.36, 0.04, 0.2), std(0x434d2e, 0.55, 0.5), 0, 0.11, 0);
  const brass = std(0xd4a640, 0.25, 1);
  for (let i = 0; i < 4; i++) add(g, once('round', () => new THREE.CylinderGeometry(0.012, 0.012, 0.08, 10)), brass, -0.09 + i * 0.06, 0.17, 0);
  return g;
}

// ---------- gear on a character ----------
// The pieces follow the head and upper-spine bones of the animated model (Rocketbox soldier).
const _v = new THREE.Vector3();
// 0.16.50 worn gear that fits the body: the vest and helmet are cut from the character's own skinned mesh (the chest
// and back for a vest, the top of the skull for a helmet), pushed out a little along the surface and bound to the same
// skeleton, so they hug the body and move with every animation. (The block-built models stay for loot on the floor.)
const VEST_BONES = /Spine$|Spine1$|Spine2$|Clavicle$/i;
const SHELL = {
  vest: { 1: { off: 0.016, color: 0x2b3646, rough: 0.9 }, 2: { off: 0.024, color: 0x5c6840, rough: 0.85 }, 3: { off: 0.032, color: 0x1d2023, rough: 0.6, metal: 0.15 } },
  helmet: { 1: { off: 0.014, color: 0x8e979f, rough: 0.4, metal: 0.3 }, 2: { off: 0.02, color: 0x5f6b3c, rough: 0.85 }, 3: { off: 0.024, color: 0x232629, rough: 0.5, metal: 0.2 } },
};
const shellGeo = new WeakMap(); // source geometry -> { 'vest:0.024': geometry }
function cutShell(mesh, part, off) {
  const src = mesh.geometry, key = part + ':' + off; let per = shellGeo.get(src); if (!per) shellGeo.set(src, (per = {}));
  if (per[key] !== undefined) return per[key];
  const pos = src.attributes.position, nrm = src.attributes.normal, si = src.attributes.skinIndex, sw = src.attributes.skinWeight, bones = mesh.skeleton.bones;
  if (!pos || !nrm || !si || !sw) return (per[key] = null);
  const dom = (i) => { let b = 0, w = -1; for (let k = 0; k < 4; k++) { const x = sw.getComponent(i, k); if (x > w) { w = x; b = si.getComponent(i, k); } } return bones[b]?.name || ''; };
  let topY = -Infinity; if (part === 'helmet') for (let i = 0; i < pos.count; i++) if (/Head$/i.test(dom(i))) topY = Math.max(topY, pos.getY(i));
  const keep = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const b = dom(i);
    keep[i] = part === 'vest' ? (VEST_BONES.test(b) ? 1 : 0) : (/Head$/i.test(b) && pos.getY(i) > topY - 0.105 * (mesh.userData.unit || 1) ? 1 : 0); }
  const idx = src.index ? src.index.array : [...Array(pos.count).keys()], tris = [];
  for (let t = 0; t < idx.length; t += 3) if (keep[idx[t]] && keep[idx[t + 1]] && keep[idx[t + 2]]) tris.push(idx[t], idx[t + 1], idx[t + 2]);
  if (tris.length < 30) return (per[key] = null);
  const g = new THREE.BufferGeometry(), P = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { P[i * 3] = pos.getX(i) + nrm.getX(i) * off; P[i * 3 + 1] = pos.getY(i) + nrm.getY(i) * off; P[i * 3 + 2] = pos.getZ(i) + nrm.getZ(i) * off; }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', nrm); g.setAttribute('skinIndex', si); g.setAttribute('skinWeight', sw);
  g.setIndex(tris); return (per[key] = g);
}
function fittedGear(c, part, level) {
  const body = []; c.root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.gear) body.push(o); });
  const want = part === 'vest' ? /body|uniform|torso/i : /head|helmet/i, cfg = SHELL[part][level];
  const out = [];
  for (const m of body) {
    if (![].concat(m.material).some((x) => want.test(x?.name || '')) && !want.test(m.name)) continue;
    // positions are in the mesh's own units: scale the offset (Rocketbox meshes are in metres, some in centimetres)
    const size = (m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox)).getSize(new THREE.Vector3()).y;
    m.userData.unit = size > 10 ? 100 : 1;
    const geo = cutShell(m, part, cfg.off * m.userData.unit); if (!geo) continue;
    const mat = std(cfg.color, cfg.rough, cfg.metal || 0.05, { side: THREE.FrontSide });
    const sh = new THREE.SkinnedMesh(geo, mat); sh.userData.gear = true; sh.castShadow = true; sh.frustumCulled = false;
    sh.bind(m.skeleton, m.bindMatrix); sh.bindMode = m.bindMode; m.parent.add(sh); sh.position.copy(m.position); sh.quaternion.copy(m.quaternion); sh.scale.copy(m.scale);
    out.push(sh);
  }
  return out;
}
export function setCharacterGear(c, helmet, vest) {
  if (!c?.soldier || !c.bones?.head || !c.bones?.spine2) return;
  const key = helmet + '/' + vest;
  if (c.gearKey === key) return;
  c.gearKey = key;
  for (const o of c.gear || []) o.parent?.remove(o);
  c.gear = [];
  // fitted shells first; the old block models only if a character's mesh can't be cut (unexpected bone names)
  const fv = vest > 0 ? fittedGear(c, 'vest', vest) : [], fh = helmet > 0 ? fittedGear(c, 'helmet', helmet) : [];
  c.gear.push(...fv, ...fh);
  c.gearHelmet = helmet > 0 && !fh.length ? buildHelmet(helmet) : null;
  c.gearVest = vest > 0 && !fv.length ? buildVest(vest) : null;
  for (const o of [c.gearHelmet, c.gearVest]) if (o) { o.scale.setScalar(c.scale || 1); c.body.add(o); c.gear.push(o); }
  if (c.gearVest && c.civilian) c.gearVest.scale.multiply(new THREE.Vector3(1.22, 1.05, 1.3)); // 0.16.47: sits over the jacket, not inside it
}
export function placeCharacterGear(c) {
  if (!c.gear?.length) return;
  c.body.updateWorldMatrix(true, false);
  const s = c.scale || 1;
  if (c.gearHelmet) {
    c.bones.head.getWorldPosition(_v); c.body.worldToLocal(_v);
    c.gearHelmet.position.set(_v.x, _v.y + 0.095 * s, _v.z + 0.005 * s);
  }
  if (c.gearVest) {
    c.bones.spine2.getWorldPosition(_v); c.body.worldToLocal(_v);
    c.gearVest.position.set(_v.x, _v.y + 0.06 * s, _v.z);
  }
}
