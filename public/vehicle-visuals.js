import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
export function createVehicleVisuals(scene,boxes){
 const models=new Map(),palette=[0x285777,0x813d43,0x626e47,0xc6c9c4];
 function sync(list){for(const c of list){let m=models.get(c.id);
  if(!m){
   const root=new THREE.Group(),wheels=[],color=palette[Number(c.id.split('-').pop())%palette.length];
   const paint=new THREE.MeshStandardMaterial({color,metalness:0.48,roughness:0.3});
   const dark=new THREE.MeshStandardMaterial({color:0x20252a,roughness:0.82}),chrome=new THREE.MeshStandardMaterial({color:0xaeb7bc,metalness:0.9,roughness:0.27});
   const glass=new THREE.MeshStandardMaterial({color:0x82b2c6,transparent:true,opacity:0.38,depthWrite:false,metalness:0.35,roughness:0.14});
   const box=(size,p,mat,round=0.04)=>{const b=new THREE.Mesh(new RoundedBoxGeometry(...size,2,round),mat);b.position.set(...p);b.castShadow=true;b.receiveShadow=true;root.add(b);return b;};
   box([1.78,0.53,3.28],[0,0.68,0],paint,0.12);box([1.68,0.16,1.05],[0,0.98,-1.05],paint,0.06);
   box([1.8,0.24,0.22],[0,0.48,-1.7],dark);box([1.8,0.24,0.22],[0,0.48,1.7],dark);
   box([1.48,0.14,1.72],[0,1.73,0.2],paint,0.07);
   for(const x of [-0.73,0.73])for(const z of [-0.58,0.98]){const pillar=box([0.085,0.76,0.09],[x,1.34,z],paint,0.02);pillar.rotation.x=z<0?-0.22:0.12;}
   const front=box([1.37,0.61,0.025],[0,1.36,-0.65],glass,0.005);front.rotation.x=-0.22;
   box([1.36,0.57,0.025],[0,1.36,1.03],glass,0.005);
   for(const x of [-0.75,0.75]){
    box([0.02,0.55,1.45],[x,1.35,0.2],glass,0.005);box([0.055,0.65,0.07],[x,1.37,0.24],paint,0.01);
    for(const z of [-0.1,0.7])box([0.04,0.055,0.2],[x*1.22,0.96,z],chrome,0.01);
    box([0.2,0.16,0.25],[x*1.3,1.2,-0.57],paint,0.05);box([0.62,0.42,0.65],[x*0.52,1.01,0.24],dark,0.08);
    for(const z of [-1.08,1.1]){
     const wheel=new THREE.Group();wheel.position.set(x*1.26,0.4,z);
     const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.38,0.38,0.26,20),dark);tire.rotation.z=Math.PI/2;wheel.add(tire);
     const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.23,0.23,0.275,12),chrome);hub.rotation.z=Math.PI/2;wheel.add(hub);
     root.add(wheel);wheels.push(wheel);
    }
   }
   const headlight=new THREE.MeshBasicMaterial({color:0xffecc0}),rearLight=new THREE.MeshBasicMaterial({color:0xd52c37});
   for(const x of [-0.58,0.58]){box([0.4,0.16,0.035],[x,0.8,-1.66],headlight,0.02);box([0.22,0.22,0.035],[x,0.8,1.66],rearLight,0.02);}
   box([0.72,0.18,0.03],[0,0.73,-1.69],dark,0.01);box([0.4,0.12,0.025],[0,0.54,1.82],chrome,0.01);
   scene.add(root);const collider={vehicle:true,min:[0,0,0],max:[0,0,0]};boxes.push(collider);m={root,collider,wheels};models.set(c.id,m);
  }
  Object.assign(m,c);m.root.position.set(...c.p);m.root.rotation.y=c.yaw;
  const x=Math.abs(Math.cos(c.yaw))*0.95+Math.abs(Math.sin(c.yaw))*1.65,z=Math.abs(Math.sin(c.yaw))*0.95+Math.abs(Math.cos(c.yaw))*1.65;
  m.collider.min=[c.p[0]-x,0,c.p[2]-z];m.collider.max=[c.p[0]+x,1.05,c.p[2]+z];
 }}
 function nearby(p){return [...models.values()].find(c=>!c.driver&&Math.hypot(...p.map((n,i)=>n-c.p[i]))<3.5);}
 function animate(dt){for(const car of models.values())for(const wheel of car.wheels)wheel.rotation.x-=car.speed*dt/0.38;}
 return {sync,nearby,animate};
}
