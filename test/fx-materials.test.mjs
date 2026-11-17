import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { glowMaterial, puffMaterial, bindOpacity, disposeOwnedMaterials, releaseRenderer } from '../public/fx-materials.js';

test('glow and puff reuse one material per colour', () => {
  const a = glowMaterial(0xff2200);
  const b = glowMaterial(0xff2200);
  const c = glowMaterial(0x2244ff);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.userData.shared, true);
  assert.equal(puffMaterial(0xcfc8b8), puffMaterial(0xcfc8b8));
  assert.notEqual(puffMaterial(0xcfc8b8), puffMaterial(0x111111));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 3), a);
  bindOpacity(mesh, 0.4);
  mesh.onBeforeRender();
  assert.equal(a.opacity, 0.4);
  mesh.userData.op = 0.15;
  mesh.onBeforeRender();
  assert.equal(a.opacity, 0.15);
});

test('projectile cleanup drops owned materials and keeps shared ones', () => {
  const shared = glowMaterial(0xabcdef);
  const owned = new THREE.MeshBasicMaterial({ color: 0x112233 });
  let disposed = 0;
  owned.dispose = () => { disposed++; };
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), shared));
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), owned));
  disposeOwnedMaterials(root);
  assert.equal(disposed, 1);
  assert.equal(shared.userData.shared, true);
});

test('releaseRenderer drops the WebGL context', () => {
  const calls = [];
  releaseRenderer({ dispose() { calls.push('dispose'); }, forceContextLoss() { calls.push('loss'); } });
  releaseRenderer(null);
  assert.deepEqual(calls, ['dispose', 'loss']);
});
