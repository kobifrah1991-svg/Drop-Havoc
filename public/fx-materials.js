import * as THREE from 'three';

// One material per colour. Meshes fade by writing their own opacity just before they draw,
// so a shared material does not force every puff or tracer to the same alpha.
const cache = new Map();

function shared(key, make) {
  let m = cache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    cache.set(key, m);
  }
  return m;
}

export function glowMaterial(color) {
  return shared('glow:' + color, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
}

export function puffMaterial(color) {
  return shared('puff:' + color, () => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, depthWrite: false,
  }));
}

export function bindOpacity(mesh, opacity) {
  mesh.userData.op = opacity;
  mesh.onBeforeRender = () => { if (mesh.material) mesh.material.opacity = mesh.userData.op; };
}

// Drop materials this object owns. Shared glow/puff materials and the shared rocket geometries stay.
export function disposeOwnedMaterials(root) {
  if (!root) return;
  const seen = new Set();
  const visit = (obj) => {
    const mats = !obj?.material ? [] : (Array.isArray(obj.material) ? obj.material : [obj.material]);
    for (const mat of mats) {
      if (!mat || mat.userData?.shared || seen.has(mat)) continue;
      seen.add(mat);
      mat.dispose?.();
    }
  };
  if (typeof root.traverse === 'function') root.traverse(visit);
  else visit(root);
}

export function releaseRenderer(renderer) {
  if (!renderer) return;
  renderer.dispose?.();
  renderer.forceContextLoss?.();
}
