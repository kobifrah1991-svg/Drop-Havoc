// Arcade-racer style destruction (our own take on what open-world racing games do with roadside objects):
// a smashed object bursts into pieces that fly on with the car's momentum, tumble, bounce on the ground,
// settle and fade. Pieces come from a fixed pool of instanced meshes (one draw call per material), so a
// chain of smashes costs the same as one. Sounds are made per material in client.js (sfx.smash).
import * as THREE from 'three';

const KINDS = {
  wood: { color: 0x8a5a32, rough: 0.8, metal: 0, size: [0.5, 0.06, 0.12] },
  metal: { color: 0x3a3f45, rough: 0.35, metal: 0.8, size: [0.35, 0.07, 0.07] },
  glass: { color: 0xcfe8ff, rough: 0.05, metal: 0.2, size: [0.09, 0.09, 0.01], emissive: 0x223344 },
  stone: { color: 0xbbb4a3, rough: 0.9, metal: 0, size: [0.22, 0.16, 0.18] },
  leaves: { color: 0x4f7a2e, rough: 0.9, metal: 0, size: [0.16, 0.01, 0.12] },
  bark: { color: 0x5a4332, rough: 0.95, metal: 0, size: [0.4, 0.12, 0.12] },
  plastic: { color: 0xd0392b, rough: 0.4, metal: 0.1, size: [0.3, 0.05, 0.2] },
  water: { color: 0x9fd4ff, rough: 0.05, metal: 0, size: [0.07, 0.07, 0.07], transparent: true },
};
// What each kind of object breaks into: [material, count, spread]
export const RECIPES = {
  tree: [['leaves', 34, 1.4], ['bark', 6, 0.6]],
  bench: [['wood', 10, 0.6], ['metal', 4, 0.4]],
  light: [['metal', 6, 0.5], ['glass', 14, 0.6]],
  lamp: [['metal', 5, 0.5], ['glass', 12, 0.5]],
  post: [['metal', 6, 0.4]],
  stone: [['stone', 12, 0.8], ['water', 16, 0.6]],
  play: [['metal', 6, 0.5], ['plastic', 8, 0.6]],
};
const POOL = 90; // pieces per material alive at once (oldest are reused)

export function createSmashFx(scene, { shadows }) {
  const pools = {};
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [k, d] of Object.entries(KINDS)) {
    const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: d.rough, metalness: d.metal, emissive: d.emissive || 0, transparent: !!d.transparent, opacity: d.transparent ? 0.7 : 1 });
    const mesh = new THREE.InstancedMesh(geo, mat, POOL);
    mesh.frustumCulled = false; mesh.castShadow = shadows && k !== 'glass' && k !== 'water';
    mesh.count = POOL;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < POOL; i++) mesh.setMatrixAt(i, hidden);
    scene.add(mesh);
    pools[k] = { mesh, d, pieces: Array.from({ length: POOL }, () => ({ life: 0 })), next: 0 };
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const r = (a = 1) => (Math.random() - 0.5) * 2 * a;

  // at: [x,y,z] of the object; carVel: [vx,vz] of the car (m/s); height: object height to spread pieces over
  function smash(recipe, at, carVel, height = 1.5) {
    const sp = Math.hypot(carVel[0], carVel[1]);
    for (const [kind, count, spread] of RECIPES[recipe] || []) {
      const pool = pools[kind];
      for (let i = 0; i < count; i++) {
        const piece = pool.pieces[pool.next]; pool.next = (pool.next + 1) % POOL;
        const light = kind === 'leaves' || kind === 'glass' || kind === 'water';
        const carry = light ? 0.35 : 0.75; // heavy pieces keep more of the car's momentum
        Object.assign(piece, {
          life: light ? 2.2 + Math.random() : 4 + Math.random() * 2, max: 0,
          x: at[0] + r(spread * 0.5), y: Math.max(0.15, at[1] * 0.3 + Math.random() * height), z: at[2] + r(spread * 0.5),
          vx: carVel[0] * carry * (0.6 + Math.random() * 0.6) + r(2 + sp * 0.15), vz: carVel[1] * carry * (0.6 + Math.random() * 0.6) + r(2 + sp * 0.15),
          vy: (light ? 2.5 : 3.5) + Math.random() * (2 + sp * 0.18),
          rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
          wx: r(10), wy: r(10), wz: r(10),
          sc: 0.7 + Math.random() * 0.6, drag: kind === 'leaves' ? 2.2 : kind === 'water' ? 0.6 : 0.15, rest: kind === 'stone' ? 0.25 : kind === 'metal' ? 0.45 : 0.3,
        });
        piece.max = piece.life;
      }
    }
  }
  function update(dt) {
    for (const pool of Object.values(pools)) {
      let dirty = false;
      for (let i = 0; i < POOL; i++) {
        const o = pool.pieces[i];
        if (o.life <= 0) continue;
        dirty = true;
        o.life -= dt;
        if (o.life <= 0) { pool.mesh.setMatrixAt(i, m.makeScale(0, 0, 0)); continue; }
        // gravity, air drag (leaves flutter down slowly), spin
        o.vy -= (o.drag > 1 ? 4 : 18) * dt;
        const k = Math.exp(-o.drag * dt); o.vx *= k; o.vz *= k; if (o.drag > 1) o.vy *= k;
        o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
        o.rx += o.wx * dt; o.ry += o.wy * dt; o.rz += o.wz * dt;
        if (o.y < 0.03) { // bounce, then slide to rest
          o.y = 0.03; o.vy = Math.abs(o.vy) > 1.2 ? -o.vy * o.rest : 0;
          o.vx *= 0.6; o.vz *= 0.6; o.wx *= 0.5; o.wy *= 0.5; o.wz *= 0.5;
        }
        const fade = Math.min(1, o.life / 0.6); // shrink away at the end
        const d = pool.d.size;
        q.setFromEuler(e.set(o.rx, o.ry, o.rz));
        m.compose(p.set(o.x, o.y, o.z), q, s.set(d[0] * o.sc * fade, d[1] * o.sc * fade, d[2] * o.sc * fade));
        pool.mesh.setMatrixAt(i, m);
      }
      if (dirty) pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  return { smash, update };
}
