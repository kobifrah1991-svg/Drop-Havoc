import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { surfaceMaterial } from './surface-materials.js';
export function createChestVisuals(scene){
  const models=new Map();
  function sync(list){
    for(const c of list){
      let m=models.get(c.id);
      if(!m){
        const root=new THREE.Group(),lid=new THREE.Group();root.position.set(...c.p);
        const wood=surfaceMaterial(0x776c60).clone();wood.color.setHex(c.rare?0x1675ce:0x83562e);wood.metalness=c.rare?0.35:0.08;
        const metal=new THREE.MeshStandardMaterial({color:c.rare?0x9ee8ff:0xc2a46a,metalness:0.7,roughness:0.3});
        const box=(size,p,mat,parent=root)=>{const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,0.015),mat);mesh.position.set(...p);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);};
        box([1.2,0.09,0.8],[0,0.045,0],wood);
        for(const x of [-0.55,0.55])box([0.1,0.6,0.8],[x,0.3,0],wood);
        for(const z of [-0.35,0.35])box([1.0,0.6,0.1],[0,0.3,z],wood);
        lid.position.set(0,0.6,0.4);box([1.24,0.22,0.84],[0,0.11,-0.4],wood,lid);root.add(lid);
        for(const x of [-0.42,0.42]){box([0.09,0.64,0.84],[x,0.32,0],metal);box([0.09,0.24,0.88],[x,0.12,-0.4],metal,lid);}
        box([0.16,0.22,0.06],[0,0.55,-0.44],metal);
        const halo=new THREE.Mesh(new THREE.TorusGeometry(0.88,0.025,6,32),new THREE.MeshBasicMaterial({color:c.rare?0x4dbaff:0xffc45d,transparent:true,opacity:0.6}));halo.rotation.x=-Math.PI/2;halo.position.y=0.03;root.add(halo);
        scene.add(root);m={root,lid,halo,...c};models.set(c.id,m);
      }
      m.opened=c.opened;m.halo.visible=!c.opened;
    }
  }
  function nearest(p){let best=null,d=2.8;for(const m of models.values()){const n=m.root.position.distanceTo(new THREE.Vector3(...p));if(!m.opened&&n<d){d=n;best=m;}}return best;}
  function animate(dt){for(const m of models.values())m.lid.rotation.x+=((m.opened?-1.7:0)-m.lid.rotation.x)*Math.min(1,dt*7);}
  return {sync,nearest,animate};
}
