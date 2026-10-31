import * as THREE from 'three';
export function createWorldLoot(scene,gunModel){
 const objects=new Map();
 function sync(list){
  const alive=new Set(list.map(d=>d.id));for(const [id,m]of objects)if(!alive.has(id)){scene.remove(m.root);objects.delete(id);}
  for(const d of list){if(objects.has(d.id))continue;const root=new THREE.Group(),color={weapon:0x7cff9e,armor:0x4b9eff,helmet:0x90c9ff,credits:0xffcf58}[d.kind],mat=new THREE.MeshStandardMaterial({color,metalness:0.4,roughness:0.4,emissive:color,emissiveIntensity:0.16});
   let mesh;if(d.kind==='weapon'){mesh=gunModel(d.loot.weapon,0.8);mesh.rotation.z=0.25;}
   else if(d.kind==='helmet')mesh=new THREE.Mesh(new THREE.SphereGeometry(0.23,16,8,0,Math.PI*2,0,Math.PI*0.65),mat);
   else if(d.kind==='armor'){mesh=new THREE.Mesh(new THREE.BoxGeometry(0.42,0.5,0.16),mat);const neck=new THREE.Mesh(new THREE.TorusGeometry(0.12,0.04,6,12),mat);neck.position.y=0.24;mesh.add(neck);}
   else{mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.08,16),mat);mesh.rotation.x=Math.PI/2;}
   root.add(mesh);const ring=new THREE.Mesh(new THREE.TorusGeometry(0.38,0.018,5,24),new THREE.MeshBasicMaterial({color}));ring.rotation.x=-Math.PI/2;ring.position.y=-0.24;root.add(ring);
   root.position.set(...d.origin);scene.add(root);objects.set(d.id,{...d,root,mesh,age:0});
  }
 }
 function animate(dt){for(const m of objects.values()){m.age+=dt;const k=Math.min(1,m.age/0.65);m.root.position.set(m.origin[0]+(m.p[0]-m.origin[0])*k,m.p[1]+0.38+Math.sin(k*Math.PI)*0.9+Math.sin(m.age*2)*0.035,m.origin[2]+(m.p[2]-m.origin[2])*k);m.mesh.rotation.y+=dt*0.5;}}
 function nearest(p){let chosen=null,range=2.2;for(const m of objects.values()){const d=Math.hypot(...p.map((n,i)=>n-m.p[i]));if(d<range){range=d;chosen=m;}}return chosen;}
 return {sync,animate,nearest};
}
