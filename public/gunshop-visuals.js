// 0.16.50 Walk-in gun shop, Vice City style (city centre, facing the plaza). Walls and roof are solid boxes from
// shared/city.js; this draws what makes it a shop: a lit sign over the entrance, glass doors that slide open as you
// come near, ceiling lights, a counter with a glass case, every gun on its own lit plaque with a price tag (spaced
// along both side walls), helmets and vests on stands, and the glowing checkpoint in front of the counter.
import * as THREE from 'three';

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const rtl = (s) => /[֐-ۿ]/.test(s);
function signTexture(text) {
  return canvasTex(1024, 220, (g, w, h) => {
    g.fillStyle = '#121419'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff7a1a'; g.lineWidth = 12; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#ffe2bd'; g.shadowColor = '#ff7a1a'; g.shadowBlur = 30; g.font = '900 112px Rubik, "Segoe UI", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = rtl(text) ? 'rtl' : 'ltr'; g.fillText(text, w / 2, h / 2 + 6);
  });
}
const tagTexture = (label, price) => canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h); g.fillStyle = '#b3261e'; g.fillRect(0, 0, 10, h);
  g.fillStyle = '#1b1d22'; g.font = '700 30px Rubik, "Segoe UI", Arial, sans-serif'; g.textAlign = 'center'; g.direction = rtl(label) ? 'rtl' : 'ltr';
  g.fillText(label.length > 16 ? label.slice(0, 15) + '…' : label, w / 2 + 5, 38); g.fillStyle = '#1b7a3a'; g.font = '900 34px Rubik, "Segoe UI", Arial, sans-serif'; g.direction = 'ltr'; g.fillText('$' + price, w / 2 + 5, 80);
});

// 0.16.50 surfaces drawn once (no files): wood panelling, polished floor tiles, counter wood, felt for the plaques, a
// tiled ceiling. Interior materials glow a little (warm emissive) so the room reads as lit without real lights, which
// would make every material in the city more expensive on phones.
const repeatTex = (t, x, y) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(x, y); return t; };
const noise = (g, w, h, n, a) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1); } };
const TEX = {};
const tex = (k, make) => TEX[k] || (TEX[k] = make());
const woodPanels = () => tex('panel', () => canvasTex(512, 512, (g, w, h) => { for (let i = 0; i < 8; i++) { const c = 150 + (i % 3) * 12; g.fillStyle = `rgb(${c},${c * 0.72 | 0},${c * 0.48 | 0})`; g.fillRect(i * 64, 0, 64, h); for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(60,30,10,${0.05 + 0.08 * Math.abs(Math.sin(y * 0.07 + i))})`; g.fillRect(i * 64, y, 64, 1); } g.fillStyle = 'rgba(30,15,5,.55)'; g.fillRect(i * 64, 0, 2, h); } }));
const floorTiles = () => tex('floor', () => canvasTex(512, 512, (g, w, h) => { for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { const c = 44 + ((x + y) % 2) * 10; g.fillStyle = `rgb(${c},${c + 2},${c + 6})`; g.fillRect(x * 128, y * 128, 128, 128); } g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); } noise(g, w, h, 900, 0.25); }));
const counterWood = () => tex('wood', () => canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#6b4226'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(30,12,4,${0.08 + 0.12 * Math.abs(Math.sin(y * 0.21) * Math.cos(y * 0.05))})`; g.fillRect(0, y, w, 1); } noise(g, w, h, 500, 0.2); }));
const felt = () => tex('felt', () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#1f3a2c'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, 0.3); }));
const ceilingTiles = () => tex('ceil', () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, w, h); noise(g, w, h, 1200, 0.12); g.strokeStyle = '#8c8a86'; g.lineWidth = 4; g.strokeRect(0, 0, w, h); }));

export function buildGunShop(scene, shop, { signText = 'GUN SHOP', gunModel, gearModel, items = [], label = (it) => it.id, shadows = false } = {}) {
  if (!shop) return null;
  // 0.16.67 a shop facing west is drawn as the east-facing one turned half a turn about its centre (so signs and
  // price tags still read the right way): build it in east-facing coordinates, then rotate the whole group.
  const flip = shop.face === 'west', ccx = (shop.x0 + shop.x1) / 2, ccz = (shop.z0 + shop.z1) / 2, mx = (x) => 2 * ccx - x, mz = (z) => 2 * ccz - z;
  if (flip) shop = { ...shop, door: { x: shop.x1, z0: mz(shop.door.z1), z1: mz(shop.door.z0) }, p: [mx(shop.p[0]), shop.p[1], mz(shop.p[2])], vendor: [mx(shop.vendor[0]), shop.vendor[1], mz(shop.vendor[2])],
    counter: [[mx(shop.counter[1][0]), shop.counter[0][1], mz(shop.counter[1][2])], [mx(shop.counter[0][0]), shop.counter[1][1], mz(shop.counter[0][2])]] };
  const g = new THREE.Group(), T = 0.3, H = shop.h;
  const ix0 = shop.x0 + T, ix1 = shop.x1 - T, iz0 = shop.z0 + T, iz1 = shop.z1 - T; // the room inside
  const mat = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const box = (w, h, d, m, x, y, z, parent = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = shadows; o.receiveShadow = true; parent.add(o); return o; };
  // inside: warm wall panels, dark wainscot, dark floor, ceiling with light panels
  const warm = { emissive: 0x3a2412, emissiveIntensity: 0.6 }; // the room's own light
  const panel = mat(0xffffff, 0.75, 0, { map: repeatTex(woodPanels(), (ix1 - ix0) / 2.4, 1), ...warm }), wains = mat(0x3a2a1e, 0.6, 0, { map: repeatTex(counterWood(), 3, 1), ...warm });
  for (const [z, dz] of [[iz0 + 0.01, 1], [iz1 - 0.01, -1]]) { box(ix1 - ix0, H - 0.05, 0.02, panel, (ix0 + ix1) / 2, H / 2, z); box(ix1 - ix0, 1.0, 0.04, wains, (ix0 + ix1) / 2, 0.5, z + dz * 0.02); }
  box(0.02, H - 0.05, iz1 - iz0, mat(0xffffff, 0.75, 0, { map: repeatTex(woodPanels().clone(), (iz1 - iz0) / 2.4, 1), ...warm }), ix0 + 0.01, H / 2, (iz0 + iz1) / 2);
  box(ix1 - ix0, 0.02, iz1 - iz0, mat(0xffffff, 0.25, 0.15, { map: repeatTex(floorTiles(), (ix1 - ix0) / 2.4, (iz1 - iz0) / 2.4), emissive: 0x15100a, emissiveIntensity: 0.6 }), (ix0 + ix1) / 2, 0.035, (iz0 + iz1) / 2);
  box(ix1 - ix0, 0.04, iz1 - iz0, mat(0xffffff, 0.9, 0, { map: repeatTex(ceilingTiles(), (ix1 - ix0) / 0.6, (iz1 - iz0) / 0.6), emissive: 0x2a2620, emissiveIntensity: 0.8 }), (ix0 + ix1) / 2, H - 0.03, (iz0 + iz1) / 2);
  for (const x of [ix0 + 1.8, ix0 + (ix1 - ix0) * 0.4, ix0 + (ix1 - ix0) * 0.62, ix1 - 1.8]) for (const zz of [-2.6, 2.6]) box(1.2, 0.04, 0.5, mat(0xfff6e0, 0.4, 0, { emissive: 0xfff1d6, emissiveIntensity: 1.4 }), x, H - 0.07, (iz0 + iz1) / 2 + zz);
  // counter with a glass case, a shelf of ammo boxes behind the seller
  const [c0, c1] = shop.counter, cx = (c0[0] + c1[0]) / 2, cz = (c0[2] + c1[2]) / 2, cw = c1[0] - c0[0], cd = c1[2] - c0[2];
  box(cw, 0.95, cd, mat(0xffffff, 0.55, 0, { map: repeatTex(counterWood().clone(), 4, 1), emissive: 0x24160a, emissiveIntensity: 0.5 }), cx, 0.475, cz); box(cw + 0.1, 0.06, cd + 0.1, mat(0x1d1f24, 0.25, 0.6), cx, 0.98, cz);
  box(cw - 0.1, 0.26, cd - 0.6, mat(0xbfe3ff, 0.05, 0.1, { transparent: true, opacity: 0.22, depthWrite: false }), cx, 1.14, cz);
  for (let i = 0; i < 6; i++) box(0.22, 0.14, 0.3, mat([0x5b6b3a, 0x7a2b1e, 0x2b4a6a][i % 3], 0.8), ix0 + 0.25, 1.35 + (i % 2) * 0.45, cz - 1.5 + i * 0.6);
  box(0.35, 0.04, cd + 1, mat(0x5a4632, 0.8), ix0 + 0.2, 1.25, cz); box(0.35, 0.04, cd + 1, mat(0x5a4632, 0.8), ix0 + 0.2, 1.7, cz);
  // the guns: each on its own dark plaque with a little lamp and a price tag, spread evenly along the side walls
  const guns = items.filter((it) => it.loot.weapon), gear = items.filter((it) => it.loot.vest || it.loot.helmetLvl);
  const wall0 = c1[0] + 1.6, perWall = Math.ceil(guns.length / 2), span = ix1 - 1.6 - wall0; // plaques start past the counter, stop short of the door
  // on the counter: every gun laid on its side under the glass top, a price card in front of each, and a cash register
  guns.forEach((it, i) => {
    const z = c0[2] + 0.55 + (i * (cd - 1.1)) / Math.max(1, guns.length - 1);
    try { const m = gunModel?.(it.loot.weapon, 1.15); if (m) { m.position.set(cx + 0.05, 1.06, z); m.rotation.set(0, Math.PI / 2 - 0.55, -Math.PI / 2); g.add(m); } } catch { /* model not ready */ } // lying on its side along the counter, top toward the customer
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: tagTexture(label(it), it.price) }));
    card.position.set(c1[0] + 0.03, 0.86, z); card.rotation.y = Math.PI / 2; g.add(card);
  });
  { const r = new THREE.Group(); r.position.set(cx, 1.01, c1[2] - 0.35); box(0.42, 0.18, 0.36, mat(0x1d1f24, 0.4, 0.4), 0, 0.09, 0, r); box(0.36, 0.2, 0.04, mat(0x2a3f2a, 0.3, 0, { emissive: 0x3cff7a, emissiveIntensity: 0.5 }), 0.1, 0.28, 0, r).rotation.z = -0.4; g.add(r); }
  guns.forEach((it, i) => {
    const north = i < perWall, j = north ? i : i - perWall, n = north ? perWall : guns.length - perWall;
    const x = wall0 + (n > 1 ? (j * span) / (n - 1) : span / 2), z = north ? iz1 - 0.06 : iz0 + 0.06, face = north ? -1 : 1;
    box(1.5, 0.62, 0.05, mat(0xffffff, 0.95, 0, { map: felt(), emissive: 0x0b1610, emissiveIntensity: 0.6 }), x, 1.75, z);
    box(1.58, 0.7, 0.03, mat(0x8a6a3e, 0.5, 0.2), x, 1.75, z - face * 0.02);
    box(0.5, 0.04, 0.08, mat(0xfff1d6, 0.4, 0, { emissive: 0xfff1d6, emissiveIntensity: 1.6 }), x, 2.18, z + face * 0.06);
    try { const m = gunModel?.(it.loot.weapon, 1.3); if (m) { m.position.set(x, 1.78, z + face * 0.12); m.rotation.set(0, Math.PI / 2, 0); g.add(m); } } catch { /* model not ready */ }
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), new THREE.MeshBasicMaterial({ map: tagTexture(label(it), it.price) }));
    tag.position.set(x, 1.33, z + face * 0.035); tag.rotation.y = north ? Math.PI : 0; g.add(tag);
  });
  // helmets and vests on stands near the door, one per level
  gear.forEach((it) => {
    const lvl = it.loot.vest || it.loot.helmetLvl, x = ix1 - 0.9 - (lvl - 1) * 0.75, z = it.loot.vest ? iz1 - 0.55 : iz0 + 0.55;
    box(0.36, 0.9, 0.36, mat(0x2a2c31, 0.7), x, 0.45, z);
    try { const m = gearModel?.(it.loot.vest ? 'vest' : 'helmet', lvl); if (m) { m.position.set(x, it.loot.vest ? 1.25 : 1.05, z); m.scale.setScalar(1.25); g.add(m); } } catch { /* ok */ }
  });
  // outside: sign over the entrance, glass doors that slide apart
  const dz0 = shop.door.z0, dz1 = shop.door.z1, dx = shop.door.x, dmid = (dz0 + dz1) / 2, dw = (dz1 - dz0) / 2;
  // shop front: dark facade, an orange trim line, two lit display windows with a gun silhouette each side of the door
  const facade = mat(0x1f2228, 0.55, 0.1);
  box(0.04, H, dz0 - shop.z0, facade, dx + 0.02, H / 2, (shop.z0 + dz0) / 2); box(0.04, H, shop.z1 - dz1, facade, dx + 0.02, H / 2, (dz1 + shop.z1) / 2);
  box(0.04, H - 2.45, dz1 - dz0, facade, dx + 0.02, (H + 2.45) / 2, dmid);
  box(0.05, 0.08, shop.z1 - shop.z0, mat(0xff7a1a, 0.4, 0, { emissive: 0xff7a1a, emissiveIntensity: 0.9 }), dx + 0.05, H - 1.05, (shop.z0 + shop.z1) / 2);
  for (const [a, b] of [[shop.z0 + 0.45, dz0 - 0.35], [dz1 + 0.35, shop.z1 - 0.45]]) {
    const wz = (a + b) / 2, ww = b - a;
    box(0.05, 1.5, ww, mat(0xffe9c4, 0.3, 0, { emissive: 0xffd9a8, emissiveIntensity: 0.55 }), dx + 0.05, 1.35, wz);
    box(0.06, 1.62, ww + 0.12, mat(0x3a3d43, 0.4, 0.6), dx + 0.03, 1.35, wz);
    try { const m = gunModel?.(['rifle', 'shotgun'][a < dz0 ? 0 : 1], 1.4); if (m) { m.position.set(dx + 0.12, 1.4, wz); m.rotation.set(0, 0, 0.18); g.add(m); } } catch { /* ok */ }
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.99), new THREE.MeshBasicMaterial({ map: signTexture(signText) }));
  sign.position.set(dx + 0.09, H - 0.45, dmid); sign.rotation.y = Math.PI / 2; g.add(sign);
  box(0.35, 0.05, 3.2, mat(0x1b1d22, 0.6), dx + 0.2, 2.5, dmid);
  const glass = mat(0x9fd3ff, 0.05, 0.2, { transparent: true, opacity: 0.32, depthWrite: false });
  const doors = [-1, 1].map((s) => { const d = new THREE.Group(); d.position.set(dx - 0.15, 0, dmid + s * dw / 2); box(0.05, 2.4, dw, glass, 0, 1.2, 0, d); box(0.07, 2.4, 0.06, mat(0x2a2c31, 0.5, 0.5), 0, 1.2, s * dw / 2, d); g.add(d); return { d, s, home: dmid + s * dw / 2 }; });
  // the checkpoint: a glowing ring on the floor and a soft column of light
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(shop.p[0], 0.06, shop.p[2]); g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.set(shop.p[0], 0.8, shop.p[2]); g.add(beam);
  let root = g;
  if (flip) { root = new THREE.Group(); root.position.set(ccx, 0, ccz); root.rotation.y = Math.PI; g.position.set(-ccx, 0, -ccz); root.add(g); }
  scene.add(root);
  let open = 0;
  return {
    group: root,
    // the doors slide open when someone is within 3 m of them; the checkpoint pulses
    update(dt, t, who) {
      const near = who.some((p) => Math.hypot((flip ? mx(p[0]) : p[0]) - dx, (flip ? mz(p[2]) : p[2]) - dmid) < 3.2);
      open += ((near ? 1 : 0) - open) * Math.min(1, dt * 6);
      for (const { d, s, home } of doors) d.position.z = home + s * open * dw * 0.95;
      const k = 0.5 + 0.5 * Math.sin(t * 3); ring.material.opacity = 0.6 + 0.35 * k; beam.material.opacity = 0.07 + 0.08 * k;
    },
  };
}
