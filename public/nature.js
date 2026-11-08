// GTA-style vegetation: real trees (bark trunks + crowns made of alpha-tested leaf cards, two species) and
// 3D grass blades that cover the lawns around the player and sway in the wind. Everything is instanced
// (one draw call per mesh type) and the grass is only drawn near the camera, scaled by the quality setting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const wind = { value: 0 };

// ---------- textures (painted on canvases: nothing to download) ----------
function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), r = rng(77);
  for (let i = 0; i < 420; i++) {
    const px = 30 + r() * 452, py = 30 + r() * 452, len = 14 + r() * 18, a = r() * Math.PI * 2;
    const g = 70 + r() * 90, rr = 30 + r() * 50, b = 20 + r() * 30;
    x.save(); x.translate(px, py); x.rotate(a);
    x.fillStyle = `rgb(${rr},${g},${b})`;
    x.beginPath(); x.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = `rgba(20,40,10,0.5)`; x.lineWidth = 1; x.beginPath(); x.moveTo(-len, 0); x.lineTo(len, 0); x.stroke(); // vein
    x.fillStyle = 'rgba(255,255,220,0.12)'; x.beginPath(); x.ellipse(-len * 0.2, -len * 0.12, len * 0.5, len * 0.15, 0, 0, Math.PI * 2); x.fill(); // sun sheen
    x.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function needleTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), r = rng(31);
  for (let i = 0; i < 260; i++) {
    const px = r() * 256, py = 10 + r() * 236, l = 10 + r() * 24, a = -Math.PI / 2 + (r() - 0.5) * 1.6;
    x.strokeStyle = `rgb(${25 + r() * 30},${60 + r() * 50},${35 + r() * 25})`; x.lineWidth = 1.6 + r() * 1.4;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function barkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d'), r = rng(5);
  x.fillStyle = '#4b3a2c'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 46; i++) {
    const px = r() * 128, w = 2 + r() * 6;
    x.fillStyle = r() < 0.5 ? 'rgba(25,17,10,0.6)' : 'rgba(140,115,90,0.25)';
    x.beginPath(); x.moveTo(px, 0);
    for (let y = 0; y <= 256; y += 16) x.lineTo(px + Math.sin(y * 0.06 + i) * 3, y);
    x.lineTo(px + w, 256); x.lineTo(px + w, 0); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function grassTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'), r = rng(11);
  for (let i = 0; i < 90; i++) {
    const bx = 4 + r() * 248, h = 50 + r() * 76, lean = (r() - 0.5) * 26, w = 2.5 + r() * 3;
    const g = x.createLinearGradient(0, 128, 0, 128 - h);
    g.addColorStop(0, `rgb(${40 + r() * 20},${70 + r() * 20},${25 + r() * 10})`);
    g.addColorStop(1, `rgb(${110 + r() * 50},${150 + r() * 45},${60 + r() * 30})`);
    x.fillStyle = g;
    x.beginPath(); x.moveTo(bx - w, 128); x.quadraticCurveTo(bx + lean * 0.4, 128 - h * 0.6, bx + lean, 128 - h); x.quadraticCurveTo(bx + lean * 0.4 + 1, 128 - h * 0.6, bx + w, 128); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Photographed leaves, pine twigs, grass blades and bark (Poly Haven, CC0; public/img/env/CREDITS.md).
// The painted texture shows until the photo has loaded, and stays if it can't be loaded.
const loader = new THREE.TextureLoader();
function photo(file, fallback) {
  const t = fallback;
  loader.load('img/env/' + file, (img) => { t.dispose(); t.image = img.image; t.needsUpdate = true; }, undefined, () => {}); // a new size needs a new GPU texture
  return t;
}

// Wind: bend vertices by height (y in the mesh), phase taken from the instance position
function windy(mat, strength, heightRef) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float bend = clamp(position.y / ${heightRef.toFixed(2)}, 0.0, 1.0); bend *= bend;
      float ph = uWind * 1.7 + ip.x * 0.21 + ip.z * 0.17;
      transformed.x += (sin(ph) * 0.6 + sin(ph * 2.3 + position.z) * 0.25) * ${strength.toFixed(3)} * bend;
      transformed.z += (cos(ph * 0.8) * 0.5) * ${strength.toFixed(3)} * bend;`);
  };
  mat.customProgramCacheKey = () => 'windy' + strength + heightRef;
  return mat;
}

// A crown made of leaf cards around a centre; vertex colours darken the inside and bottom (fake occlusion)
function cardCrown(rand, { cards, radius, cy, size, squash = 1 }) {
  const geos = [];
  for (let i = 0; i < cards; i++) {
    const g = new THREE.PlaneGeometry(size * (0.75 + rand() * 0.5), size * (0.75 + rand() * 0.5));
    const u = rand() * 2 - 1, th = rand() * Math.PI * 2, rr = radius * Math.cbrt(0.35 + rand() * 0.65);
    const dir = new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(th), u * squash, Math.sqrt(1 - u * u) * Math.sin(th));
    g.lookAt(dir); g.rotateZ(rand() * Math.PI);
    g.translate(dir.x * rr, cy + dir.y * rr, dir.z * rr);
    const pos = g.attributes.position, col = [];
    for (let k = 0; k < pos.count; k++) {
      const shade = 0.55 + 0.45 * Math.min(1, (pos.getY(k) - (cy - radius)) / (radius * 2)) * (0.6 + 0.4 * rr / radius);
      col.push(shade, shade, shade);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geos.push(g);
  }
  return mergeGeometries(geos);
}

let built = null;
export function buildTrees(scene, trees, { shadows, quality = 'high', knockable = false }) {
  if (!trees?.length) return;
  const rand = rng(99), leafy = quality === 'low' ? 18 : 30;
  const leafMat = windy(new THREE.MeshStandardMaterial({ map: photo('leaves.webp', leafTexture()), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85 }), 0.25, 7);
  const needleMat = windy(new THREE.MeshStandardMaterial({ map: photo('twig.webp', needleTexture()), alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9 }), 0.15, 9);
  const bark = new THREE.MeshStandardMaterial({ map: photo('bark.jpg', barkTexture()), roughness: 0.95 });
  // Species 0: broadleaf (oak-like), 1: conifer. Same trunk shape, scaled.
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 5, 9, 1, true); trunkGeo.translate(0, 2.5, 0);
  { const uv = trunkGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 3); }
  const oak = cardCrown(rand, { cards: leafy, radius: 2.7, cy: 5.6, size: 2.3, squash: 0.85 });
  const pineParts = [];
  for (let l = 0; l < 5; l++) pineParts.push(cardCrown(rand, { cards: Math.round(leafy / 3), radius: 2.4 - l * 0.42, cy: 3.4 + l * 1.25, size: 1.7, squash: 0.35 }));
  const pine = mergeGeometries(pineParts);
  const kinds = trees.map(([x, , z]) => (Math.abs(Math.sin(x * 12.9898 + z * 78.233)) * 43758.5453 % 1 < 0.3 ? 1 : 0));
  const counts = [kinds.filter((k) => k === 0).length, kinds.filter((k) => k === 1).length];
  const trunks = new THREE.InstancedMesh(trunkGeo, bark, trees.length);
  const crowns = [new THREE.InstancedMesh(oak, leafMat, Math.max(1, counts[0])), new THREE.InstancedMesh(pine, needleMat, Math.max(1, counts[1]))];
  crowns[0].count = counts[0]; crowns[1].count = counts[1];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const idx = [0, 0], items = [];
  trees.forEach(([x, , z], i) => {
    const k = kinds[i], h = Math.abs(Math.sin(x * 3.1 + z * 1.7));
    const s = 0.85 + h * 0.4;
    q.setFromAxisAngle(up, h * Math.PI * 2);
    m.compose(p.set(x, 0, z), q, sc.set(s, s * (k ? 1.1 : 1), s)); trunks.setMatrixAt(i, m);
    m.compose(p.set(x, 0, z), q, sc.set(s, s, s)); crowns[k].setMatrixAt(idx[k], m);
    items.push({ k, ci: idx[k], x, z, s, sy: s * (k ? 1.1 : 1), yaw: h * Math.PI * 2 });
    crowns[k].setColorAt(idx[k], tint.setHSL(k ? 0.36 : 0.25 + h * 0.07, 0.3, 0.72 + h * 0.18)); // light tints: they multiply the leaf texture
    idx[k]++;
  });
  for (const mesh of [trunks, ...crowns]) { mesh.castShadow = shadows; mesh.receiveShadow = shadows; mesh.computeBoundingSphere(); scene.add(mesh); }
  const tree = { trunks, crowns, items };
  if (knockable) built = tree; // the playable district's trees (the outer belt is scenery and never knocked)
  return built;
}

// ---------- grass ----------
function bladePatch(size, blades) {
  const pos = [], col = [], idx = [], r = rng(4242), root = new THREE.Color(0x3d5a26) /* 0.16.44: lighter roots, no black spikes */, tipA = new THREE.Color(0x5e7d2c), tipB = new THREE.Color(0x7f9440), c = new THREE.Color();
  for (let b = 0; b < blades; b++) {
    const x = (r() - 0.5) * size, z = (r() - 0.5) * size, h = 0.22 + r() * 0.26, w = 0.022 + r() * 0.018;
    const a = r() * Math.PI, ca = Math.cos(a), sa = Math.sin(a), lean = (r() - 0.5) * 0.18, leanA = r() * Math.PI * 2;
    const tip = tipA.clone().lerp(tipB, r()), base = pos.length / 3;
    for (let k = 0; k <= 2; k++) { // 2 segments, narrowing to a point, bending more toward the top
      const t = k / 2, y = h * t, bend = lean * t * t, ww = w * (1 - t * 0.92);
      for (const side of [-1, 1]) {
        pos.push(x + ca * ww * side + Math.cos(leanA) * bend, y, z + sa * ww * side + Math.sin(leanA) * bend);
        c.copy(root).lerp(tip, Math.pow(t, 0.8)); col.push(c.r, c.g, c.b);
      }
    }
    for (let k = 0; k < 2; k++) { const i = base + k * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // Grass normals point up (lit like the ground under it) so a lawn doesn't sparkle blade by blade
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}
// Clumps of three crossed blade cards on a jittered grid around the camera; rebuilt when the camera has moved.
export function createGrass(scene, { radius = 32, spacing = 0.9, allowed }) {
  if (!radius) return { update() {} };
  // One patch = a square of many thin single blades (no texture cards), so tiled patches read as one even lawn.
  // Each blade: a tapered, slightly bent strip; dark at the root, lighter at the tip (vertex colours).
  const geo = bladePatch(spacing, spacing >= 1 ? 16 : 20);
  const mat = windy(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 0.09, 0.42); // Lambert: normals point up anyway, much cheaper per pixel
  const cells = Math.ceil((radius * 2) / spacing) ** 2;
  const mesh = new THREE.InstancedMesh(geo, mat, cells);
  mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.count = 0;
  scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let cx = Infinity, cz = Infinity;
  const hash = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
  function rebuild(x0, z0) {
    let n = 0;
    const g0x = Math.floor((x0 - radius) / spacing), g1x = Math.ceil((x0 + radius) / spacing);
    const g0z = Math.floor((z0 - radius) / spacing), g1z = Math.ceil((z0 + radius) / spacing);
    for (let gx = g0x; gx <= g1x; gx++) for (let gz = g0z; gz <= g1z; gz++) {
      const h1 = hash(gx, gz), h2 = hash(gz + 7.3, gx - 3.1);
      const x = (gx + 0.5) * spacing, z = (gz + 0.5) * spacing, d = Math.hypot(x - x0, z - z0); // a regular grid: patches meet edge to edge
      if (d > radius || !allowed(x, z) || n >= cells) continue;
      const fade = 1 - Math.max(0, (d - radius * 0.7) / (radius * 0.3)); // shrink toward the edge: no hard line
      const k = fade;
      q.setFromAxisAngle(up, Math.floor(h2 * 4) * Math.PI / 2); // quarter turns keep the patches tiling evenly
      m.compose(p.set(x, 0, z), q, s.set(1, (0.75 + h1 * 0.5) * k, 1));
      mesh.setMatrixAt(n, m);
      mesh.setColorAt(n, col.setHSL(0.22 + h2 * 0.04, 0.25, 0.82 + h1 * 0.18)); // soft patch-to-patch variation
      n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return {
    update(camPos) {
      if (Math.hypot(camPos.x - cx, camPos.z - cz) < radius * 0.18) return;
      cx = camPos.x; cz = camPos.z; rebuild(cx, cz);
    },
    mesh,
  };
}

export function animateNature(t) { wind.value = t; }

// A car hit tree `i`: it falls over away from the car (dirX, dirZ); upright = true stands it back up
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function knockTree(i, dirX = 1, dirZ = 0, upright = false) {
  const it = built?.items[i];
  if (!it) return;
  _q.setFromAxisAngle(_up, it.yaw);
  if (!upright) { _ax.set(dirZ, 0, -dirX).normalize(); _q2.setFromAxisAngle(_ax, -1.35); _q.premultiply(_q2); }
  _m.compose(_p.set(it.x, 0, it.z), _q, _s.set(it.s, it.sy, it.s)); built.trunks.setMatrixAt(i, _m); built.trunks.instanceMatrix.needsUpdate = true;
  _m.compose(_p, _q, _s.set(it.s, it.s, it.s)); built.crowns[it.k].setMatrixAt(it.ci, _m); built.crowns[it.k].instanceMatrix.needsUpdate = true;
}

// Quality presets: grass reach and density, shadows, resolution. "auto" picks medium on phones, high elsewhere.
export const GFX = {
  low: { grass: 0, grassSpacing: 1, shadows: false, shadowSize: 1024, pixelRatio: 1, reflections: false, pedestrians: 0 },
  medium: { grass: 22, grassSpacing: 1.1, shadows: false, shadowSize: 1024, pixelRatio: 1.5, reflections: true, pedestrians: 5 },
  high: { grass: 34, grassSpacing: 0.9, shadows: true, shadowSize: 2048, pixelRatio: 1.5, reflections: true, pedestrians: 10, grade: true },
  ultra: { grass: 48, grassSpacing: 0.75, shadows: true, shadowSize: 4096, pixelRatio: 2, reflections: true, pedestrians: 16, grade: true, bloom: true },
};
export function gfxPreset(choice, touch) {
  return GFX[choice] ? choice : touch ? 'medium' : 'high';
}
