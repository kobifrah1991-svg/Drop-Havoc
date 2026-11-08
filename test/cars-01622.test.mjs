import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'; // 0.16.44: car models are meshopt-compressed
import { createVehicles, vehiclePrompts, VEHICLE_SPAWNS, CAR_SCALE } from '../shared/vehicles.js';
globalThis.self??=globalThis;globalThis.createImageBitmap??=async()=>({});
globalThis.Image??=class{constructor(){this.height=1;}set src(v){setTimeout(()=>this.onload?.(),0);}}; // GLTFLoader's WebP support probe
const { modelYaw, stripProxyMeshes } = await import('../public/vehicle-visuals.js');
const map=()=>({boxes:[{min:[-110,-1,-110],max:[110,0,110]}],ramps:[],bounds:111});
const REAL=Function('return '+fs.readFileSync('public/vehicle-visuals.js','utf8').match(/const REAL=(\{[^}]*\})/)[1])();
async function load(k){const b=fs.readFileSync('public/models/vehicles/'+k+'.glb');return (await new Promise((r,j)=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j))).scene;}
// nose = lower end of the long axis (bonnet lower than boot/cabin), measured after the game's yaw is applied.
function noseZ(g){g.updateMatrixWorld(true);const v=new THREE.Vector3(),pts=[];g.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i+=5){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);pts.push([v.y,v.z]);}});
 const zs=pts.map(p=>p[1]),z0=Math.min(...zs),z1=Math.max(...zs),L=z1-z0;let a=-1e9,b=-1e9;for(const [y,z] of pts){if(z<z0+L*0.2)a=Math.max(a,y);if(z>z1-L*0.2)b=Math.max(b,y);}return a<b?-1:1;}
const kinds=[...new Set(VEHICLE_SPAWNS.map(s=>REAL[s[4]]||s[4]))];
for(const k of kinds)test('facing: '+k+' nose points to game forward (-Z)',async()=>{const g=await load(k);stripProxyMeshes(g);const bb=new THREE.Box3().setFromObject(g);
 g.rotation.y=modelYaw(k,bb.max.x-bb.min.x,bb.max.z-bb.min.z);assert.equal(noseZ(g),-1,k+' drives backwards');});
test('grey car: no unsupported spec-gloss materials; shadow/clearcoat proxy planes stripped',async()=>{
 for(const k of kinds){const b=fs.readFileSync('public/models/vehicles/'+k+'.glb');const j=JSON.parse(b.slice(20,20+b.readUInt32LE(12)));assert.ok(!(j.extensionsUsed||[]).includes('KHR_materials_pbrSpecularGlossiness'),k);}
 const g=await load('goblin');assert.ok(stripProxyMeshes(g)>=1);let bad=0;g.traverse(o=>{if(o.isMesh&&/shadow/i.test(o.name))bad++;});assert.equal(bad,0);
 const bb=new THREE.Box3().setFromObject(g);assert.ok((bb.max.z-bb.min.z)>(bb.max.x-bb.min.x)*1.5,'goblin long axis is z once the shadow plane is gone');});
test('prompts: exactly one car prompt, none on pause/dead',()=>{
 assert.equal(vehiclePrompts({alive:true,paused:false,inVehicle:false,nearCar:false}).label,null,'after exit with no car near: no prompt');
 assert.equal(vehiclePrompts({alive:true,paused:false,inVehicle:true,nearCar:true}).label,'car.exit');
 assert.equal(vehiclePrompts({alive:true,paused:false,inVehicle:false,nearCar:true}).label,'car.enter');
 assert.equal(vehiclePrompts({alive:true,paused:true,inVehicle:true,nearCar:true}).label,null);
 assert.equal(vehiclePrompts({alive:false,paused:false,inVehicle:true,nearCar:true}).label,null);
 const cj=fs.readFileSync('public/client.js','utf8');assert.match(cj,/vehiclePrompts\(/);assert.match(cj,/gamePaused\)\{lootButton\.hidden=true;enterBtn\.hidden=true;/);
 assert.match(cj,/s\.vehicle\|\|null\)!==\(me\.vehicle\|\|null\)/,'client resyncs vehicle state from snapshots');});
test('local body hidden in car (no duplicate body / pants cam)',()=>{
 assert.match(fs.readFileSync('public/client.js','utf8'),/hideDriver:\(id\)=>id===me\.id/);
 const vv=fs.readFileSync('public/vehicle-visuals.js','utf8');assert.equal((vv.match(/opts\.hideDriver\?\.\(car\.chId\)/g)||[]).length,2);});
test('drive: responsive — >=12 m/s after 1 s, no freeze between inputs up to 1 s, instant reverse brake',()=>{
 const p={id:'a',p:[41.6,0,-66],yaw:0,alive:true,stance:0};const v=createVehicles(map(),{send(){},broadcast(){},playerById:()=>p});v.interact(p);
 for(let i=0;i<30;i++){v.input(p,1,0);v.tick(1/30);}const s1=v.state()[0].speed;assert.ok(s1>=12,'speed '+s1);
 const t0=Date.now;try{Date.now=()=>t0()+900;v.tick(1/30);assert.ok(v.state()[0].speed>=s1*0.9,'no stall in a 0.9 s input gap');}finally{Date.now=t0;}
 for(let i=0;i<20;i++){v.input(p,-1,0);v.tick(1/30);}assert.ok(v.state()[0].speed<s1*0.4);});
test('exit: clear of the car body (no door clipping)',()=>{
 const p={id:'a',p:[41.6,0,-66],yaw:0,alive:true,stance:0};const v=createVehicles(map(),{send(){},broadcast(){},playerById:()=>p});
 v.interact(p);const c=v.state().find(c=>c.driver==='a');v.interact(p);assert.ok(c.p[0]-p.p[0]>=0.98*CAR_SCALE+1.2,'gap '+(c.p[0]-p.p[0]));});
