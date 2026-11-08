// Soft contact shadows ("blob" shadows) for phones and low/medium quality, where real shadow maps are off.
// Without them people, cars and trees seem to float. One instanced quad with a radial-gradient texture: one draw
// call for everything. Moving things (players, bots, civilians, cars) are refreshed every frame; trees once.
import * as THREE from 'three';

function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.28)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createContactShadows(scene, { max = 96 } = {}) {
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0; scene.add(mesh);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let fixed = []; // static shadows (trees), kept at the front of the list
  function put(i, x, y, z, sx, sz, yaw = 0) {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw); m.compose(p.set(x, y + 0.03, z), q, s.set(sx, 1, sz)); mesh.setMatrixAt(i, m);
  }
  return {
    setStatic(list) { fixed = list.slice(0, Math.floor(max / 2)); },
    // movers: [{ x, y, z, r }] (round) or { x, y, z, w, l, yaw } (cars)
    update(movers, cam) {
      let i = 0;
      for (const f of fixed) { if (i >= max) break; put(i++, f.x, f.y || 0, f.z, f.r * 2, f.r * 2); }
      for (const o of movers) {
        if (i >= max) break;
        if (cam && Math.hypot(o.x - cam.x, o.z - cam.z) > 70) continue; // far away: not worth a slot
        if (o.w) put(i++, o.x, o.y || 0, o.z, o.w, o.l, o.yaw || 0); else put(i++, o.x, o.y || 0, o.z, o.r * 2, o.r * 2);
      }
      mesh.count = i; mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
