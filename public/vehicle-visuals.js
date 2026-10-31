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
   // Modern crossover: low wide body, raked glasshouse, flush LED light bars, big alloy wheels.
   const black=new THREE.MeshStandardMaterial({color:0x111417,metalness:0.6,roughness:0.35});
   box([1.86,0.5,3.9],[0,0.66,0],paint,0.18);                    // main body
   box([1.8,0.18,1.15],[0,0.97,-1.28],paint,0.1);                  // bonnet
   box([1.8,0.2,0.75],[0,0.97,1.45],paint,0.1);                    // boot deck
   box([1.9,0.2,3.96],[0,0.38,0],black,0.06);                      // dark lower cladding
   const cabin=box([1.6,0.5,2.05],[0,1.25,0.12],black,0.16);       // tinted glass cabin
   box([1.5,0.06,1.55],[0,1.52,0.16],paint,0.03);                  // roof panel
   const ws=box([1.52,0.05,0.82],[0,1.22,-0.98],glass,0.02);ws.rotation.x=0.62;
   const rw=box([1.5,0.05,0.62],[0,1.24,1.2],glass,0.02);rw.rotation.x=-0.75;
   for(const x of [-0.81,0.81]){
    box([0.02,0.34,1.7],[x,1.26,0.12],glass,0.005);
    box([0.04,0.04,0.16],[x*1.13,1.08,-0.55],black,0.01);          // slim mirrors
    for(const z of [-1.28,1.3]){
     const wheel=new THREE.Group();wheel.position.set(x*1.12,0.4,z);
     const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.3,24),dark);tire.rotation.z=Math.PI/2;wheel.add(tire);
     const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.29,0.29,0.31,10),chrome);rim.rotation.z=Math.PI/2;wheel.add(rim);
     for(let k=0;k<5;k++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.05,0.04),black);spoke.position.x=x>0?0.16:-0.16;spoke.rotation.x=k*Math.PI*2/5;wheel.add(spoke);}
     root.add(wheel);wheels.push(wheel);
    }
   }
   void cabin;
   const headlight=new THREE.MeshBasicMaterial({color:0xf2f7ff}),rearLight=new THREE.MeshBasicMaterial({color:0xff2a3a});
   box([1.6,0.06,0.03],[0,0.86,-1.96],headlight,0.01);             // full-width LED strip
   box([1.7,0.07,0.03],[0,0.88,1.96],rearLight,0.01);
   box([1.0,0.2,0.03],[0,0.58,-1.97],black,0.02);                  // grille
   scene.add(root);const collider={vehicle:true,min:[0,0,0],max:[0,0,0]};boxes.push(collider);m={root,collider,wheels};models.set(c.id,m);
  }
  const fresh=!m.target;Object.assign(m,c);m.target={p:c.p.slice(),yaw:c.yaw};if(fresh){m.root.position.set(...c.p);m.root.rotation.y=c.yaw;}
  const x=Math.abs(Math.cos(c.yaw))*0.98+Math.abs(Math.sin(c.yaw))*1.95,z=Math.abs(Math.sin(c.yaw))*0.98+Math.abs(Math.cos(c.yaw))*1.95;
  m.collider.min=[c.p[0]-x,0,c.p[2]-z];m.collider.max=[c.p[0]+x,1.05,c.p[2]+z];
 }}
 function nearby(p){return [...models.values()].find(c=>!c.driver&&Math.hypot(...p.map((n,i)=>n-c.p[i]))<3.5);}
 function animate(dt){const k=1-Math.exp(-14*dt);for(const car of models.values()){if(car.target){car.root.position.x+=(car.target.p[0]-car.root.position.x)*k;car.root.position.z+=(car.target.p[2]-car.root.position.z)*k;let d=car.target.yaw-car.root.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));car.root.rotation.y+=d*k;}for(const wheel of car.wheels)wheel.rotation.x-=car.speed*dt/0.4;}}
 return {sync,nearby,animate};
}
