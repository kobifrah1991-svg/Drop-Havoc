// Street furniture for the city: benches, working traffic lights, a playground (swings, slide, see-saw,
// sandbox) and fountains. Collision comes from shared/city.js (simple boxes); this file only draws.
// Everything that repeats is instanced, and the traffic-light bulbs are one mesh whose colours change.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const std = (color, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const PHASE = { green: 9, yellow: 2.2 }; // seconds; one axis green+yellow while the other is red
let lights = null, swings = [], seesaws = [], jets = [], knockables = null;

function instanced(geo, mat, items, shadows) {
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  items.forEach((it, i) => { q.setFromAxisAngle(up, it.yaw || 0); m.compose(p.set(...it.p), q, one); mesh.setMatrixAt(i, m); });
  mesh.castShadow = shadows; mesh.receiveShadow = shadows; mesh.computeBoundingSphere();
  return mesh;
}

export function buildStreet(scene, city, { shadows }) {
  if (!city?.trafficLights) return;
  // ---- benches: wooden slats on a black steel frame; local +Z is the side you sit facing ----
  const wood = mergeGeometries([boxAt(1.6, 0.05, 0.12, 0, 0.45, -0.14), boxAt(1.6, 0.05, 0.12, 0, 0.45, 0.0), boxAt(1.6, 0.05, 0.12, 0, 0.45, 0.14),
    boxAt(1.6, 0.11, 0.04, 0, 0.66, -0.24).rotateX(0), boxAt(1.6, 0.11, 0.04, 0, 0.82, -0.26)]);
  const frame = mergeGeometries([-0.7, 0.7].flatMap((x) => [boxAt(0.05, 0.45, 0.05, x, 0.225, 0.14), boxAt(0.05, 0.9, 0.05, x, 0.45, -0.22), boxAt(0.05, 0.05, 0.42, x, 0.42, -0.04)]));
  const benches = city.benches.map((b) => ({ p: b.p, yaw: b.yaw })); // 0.16.47: the extra half turn sat everyone with their back to the road / fountain
  const benchMeshes = [instanced(wood, std(0x8a5a32, 0.75), benches, shadows), instanced(frame, std(0x1f2226, 0.4, 0.6), benches, shadows)];
  scene.add(...benchMeshes);

  // ---- traffic lights: pole, arm over the kerb, two heads (one per road) with red / amber / green ----
  const metal = std(0x2c3035, 0.45, 0.6);
  const pole = new THREE.CylinderGeometry(0.08, 0.1, 4.4, 10).translate(0, 2.2, 0);
  const head = boxAt(0.32, 0.95, 0.28, 0, 0, 0);
  const tl = city.trafficLights;
  const poleItems = tl.map((t) => ({ p: t.p }));
  const poleMesh = instanced(pole, metal, poleItems, shadows);
  scene.add(poleMesh);
  // heads: for each pole one facing the traffic on road x=c (looks along z) and one for road z=d (along x)
  const heads = [], bulbs = [];
  for (const [i, t] of tl.entries()) {
    const [x, , z] = t.p;
    const jn = Math.floor(i / 4); // junction index (lights are listed 4 per junction)
    heads.push({ p: [x, 3.6, z], yaw: t.sz > 0 ? 0 : Math.PI, axis: 'c', j: jn }, { p: [x, 3.6, z], yaw: t.sx > 0 ? Math.PI / 2 : -Math.PI / 2, axis: 'd', j: jn });
  }
  const headMesh = instanced(head, std(0x1b1d20, 0.5, 0.3), heads, shadows);
  scene.add(headMesh);
  const bulbGeo = new THREE.SphereGeometry(0.085, 10, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, heads.length * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  heads.forEach((h, i) => {
    q.setFromAxisAngle(up, h.yaw);
    [0.3, 0, -0.3].forEach((dy, k) => { // red top, amber, green bottom; on the face toward the drivers (+Z local)
      v.set(0, dy, 0.15).applyQuaternion(q).add(new THREE.Vector3(...h.p));
      m.compose(v, q, one); bulbMesh.setMatrixAt(i * 3 + k, m); bulbs.push({ head: h, k });
    });
  });
  bulbMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(heads.length * 9), 3);
  bulbMesh.computeBoundingSphere();
  scene.add(bulbMesh);
  lights = { mesh: bulbMesh, bulbs, last: -1 };
  knockables = { benchMeshes, benches, poleMesh, poleItems, headMesh, heads, bulbMesh };

  // ---- playgrounds ----
  const red = std(0xc0392b, 0.5, 0.2), blue = std(0x2980b9, 0.45, 0.2), yellow = std(0xf1c40f, 0.5), steel = std(0x9aa0a6, 0.35, 0.8);
  for (const pg of city.playgrounds || []) {
    const [x, , z] = pg.p, g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), steel); top.rotation.z = Math.PI / 2; top.position.set(x - 3, 2.4, z - 4.6); g.add(top);
    for (const sx of [-4.6, -1.4]) for (const dz of [-0.45, 0.45]) { // A-frame legs
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.55, 8), red); leg.position.set(x + sx, 1.2, z - 4.6 + dz * 0.5); leg.rotation.x = dz * 0.38; g.add(leg);
    }
    for (const sx of [-3.8, -2.2]) { // two swings on chains
      const swing = new THREE.Group(); swing.position.set(x + sx, 2.4, z - 4.6);
      for (const cx of [-0.22, 0.22]) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.85, 4), steel); ch.position.set(cx, -0.92, 0); swing.add(ch); }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.22), yellow); seat.position.y = -1.85; swing.add(seat);
      g.add(swing); swings.push({ obj: swing, ph: sx });
    }
    // slide: tower with a roof, ladder at the back, a shiny chute down the ramp
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.7, 4), red); roof.position.set(x + 3.1, 2.9, z - 4.6); roof.rotation.y = Math.PI / 4; g.add(roof);
    for (const [px, pz] of [[2.55, -5.15], [3.65, -5.15], [2.55, -4.05], [3.65, -4.05]]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), steel); post.position.set(x + px, 2.1, z + pz); g.add(post); }
    for (let r = 0; r < 5; r++) { const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 6), steel); rung.rotation.x = Math.PI / 2; rung.position.set(x + 2.45, 0.3 + r * 0.3, z - 4.6); g.add(rung); }
    const len = Math.hypot(3.2, 1.6), chute = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.75), std(0xf39c12, 0.25, 0.1));
    chute.position.set(x + 5.3, 0.82, z - 4.6); chute.rotation.z = -Math.atan2(1.6, 3.2); g.add(chute);
    for (const sz of [-0.38, 0.38]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 0.04), std(0xf39c12, 0.3)); rail.position.set(x + 5.3, 0.92, z - 4.6 + sz); rail.rotation.z = chute.rotation.z; g.add(rail); }
    // see-saw and sandbox
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.45, 8), blue); pivot.position.set(x, 0.22, z + 4.6); g.add(pivot);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.3), yellow); plank.position.set(x, 0.48, z + 4.6); g.add(plank); seesaws.push(plank);
    const sand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 2.6), std(0xd8c38e, 0.95)); sand.position.set(x + 4.4, 0.03, z + 4.2); g.add(sand);
    for (const [bx, bz, w, d] of [[0, -1.3, 2.8, 0.15], [0, 1.3, 2.8, 0.15], [-1.3, 0, 0.15, 2.8], [1.3, 0, 0.15, 2.8]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), std(0x8a5a32, 0.8)); b.position.set(x + 4.4 + bx, 0.12, z + 4.2 + bz); g.add(b); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = shadows; o.receiveShadow = shadows; } });
    scene.add(g);
  }
  // ---- fountains: water in the basin and jets that pulse ----
  const water = new THREE.MeshStandardMaterial({ color: 0x3f7fa3, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.85 });
  const spray = new THREE.MeshBasicMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.55, depthWrite: false });
  for (const f of city.fountains || []) {
    const [x, , z] = f.p;
    const pool = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 2.8), water); pool.position.set(x, 0.42, z); scene.add(pool);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.25, 0.25, 16), std(0xbbb4a3, 0.6)); bowl.position.set(x, 1.45, z); scene.add(bowl);
    for (let k = 0; k < 5; k++) {
      const j = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1, 6, 1, true), spray);
      const a = (k / 5) * Math.PI * 2, r = k ? 0.5 : 0;
      j.position.set(x + Math.cos(a) * r, 1.6, z + Math.sin(a) * r); scene.add(j); jets.push({ obj: j, ph: k });
    }
  }
}

// Lights cycle per junction (neighbours offset so the city doesn't blink in sync); swings and see-saws move gently
const _c = new THREE.Color(), OFF = { r: 0.08, a: 0.08, g: 0.06 };
export function animateStreet(t) {
  if (lights) {
    const tick = Math.floor(t * 4); // colour changes need no more than 4 updates a second
    if (tick !== lights.last) {
      lights.last = tick;
      const cycle = (PHASE.green + PHASE.yellow) * 2;
      lights.bulbs.forEach((b, i) => {
        const j = b.head.j, ph = ((t + (j % 9) * 2.3) % cycle);
        // axis 'c' (road x=c, traffic along z) is green first; axis 'd' the second half
        const local = b.head.axis === 'c' ? ph : (ph + cycle / 2) % cycle;
        const state = local < PHASE.green ? 'g' : local < PHASE.green + PHASE.yellow ? 'a' : 'r';
        const on = (b.k === 0 && state === 'r') || (b.k === 1 && state === 'a') || (b.k === 2 && state === 'g');
        if (b.k === 0) _c.setRGB(on ? 3 : OFF.r, on ? 0.15 : 0.02, on ? 0.1 : 0.02);
        else if (b.k === 1) _c.setRGB(on ? 3 : OFF.a, on ? 1.6 : 0.05, on ? 0.1 : 0.01);
        else _c.setRGB(on ? 0.2 : 0.01, on ? 3 : OFF.g, on ? 0.8 : 0.03);
        lights.mesh.setColorAt(i, _c);
      });
      lights.mesh.instanceColor.needsUpdate = true;
    }
  }
  for (const s of swings) s.obj.rotation.x = Math.sin(t * 1.6 + s.ph) * 0.22;
  for (const p of seesaws) p.rotation.z = Math.sin(t * 0.9) * 0.18;
  for (const j of jets) { const k = 0.85 + Math.sin(t * 6 + j.ph) * 0.15; j.obj.scale.set(1, k, 1); j.obj.position.y = 1.55 + k * 0.5; }
}
// For pedestrians: may someone walking along `axis` cross the road at junction (c, d) now?
export function walkSignal(axisAlongZ, c, d, t) {
  const cycle = (PHASE.green + PHASE.yellow) * 2;
  const j = Math.abs(Math.round(c * 3 + d * 7)) % 9; // any junction, any grid
  const ph = (t + (j % 9) * 2.3) % cycle;
  // walking along z crosses road z=d, whose traffic (axis 'd') must be red: that's when axis 'c' is green
  const local = axisAlongZ ? ph : (ph + cycle / 2) % cycle;
  return local < PHASE.green - 1;
}

// A car hit a bench or a traffic light: it tips over away from the car (upright = true puts it back)
const _km = new THREE.Matrix4(), _kq = new THREE.Quaternion(), _kq2 = new THREE.Quaternion(), _kp = new THREE.Vector3(), _ks = new THREE.Vector3(1, 1, 1), _kax = new THREE.Vector3(), _kup = new THREE.Vector3(0, 1, 0), _zero = new THREE.Vector3(0, 0, 0);
function tip(mesh, i, pos, yaw, dirX, dirZ, upright, angle) {
  _kq.setFromAxisAngle(_kup, yaw || 0);
  if (!upright) { _kax.set(dirZ, 0, -dirX).normalize(); _kq2.setFromAxisAngle(_kax, -angle); _kq.premultiply(_kq2); }
  _km.compose(_kp.set(...pos), _kq, _ks); mesh.setMatrixAt(i, _km); mesh.instanceMatrix.needsUpdate = true;
}
export function knockStreet(kind, i, dirX, dirZ, upright = false) {
  const k = knockables;
  if (!k) return;
  if (kind === 'bench' && k.benches[i]) for (const m of k.benchMeshes) tip(m, i, k.benches[i].p, k.benches[i].yaw, dirX, dirZ, upright, 1.5);
  if (kind === 'light' && k.poleItems[i]) {
    tip(k.poleMesh, i, k.poleItems[i].p, 0, dirX, dirZ, upright, 1.45);
    for (const h of [i * 2, i * 2 + 1]) { // heads and bulbs: hidden while the pole lies on the ground
      _km.compose(_kp.set(...k.heads[h].p), _kq.setFromAxisAngle(_kup, k.heads[h].yaw), upright ? _ks : _zero); k.headMesh.setMatrixAt(h, _km);
      for (let b = 0; b < 3; b++) { k.bulbMesh.getMatrixAt(h * 3 + b, _km); _km.decompose(_kp, _kq, new THREE.Vector3()); _km.compose(_kp, _kq, upright ? _ks : _zero); k.bulbMesh.setMatrixAt(h * 3 + b, _km); }
    }
    k.headMesh.instanceMatrix.needsUpdate = true; k.bulbMesh.instanceMatrix.needsUpdate = true;
  }
}
