import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { VEHICLE_SPAWNS, VEHICLE_KINDS, createVehicles } from '../shared/vehicles.js';
import { CITY } from '../shared/city.js';
const map=()=>({boxes:[{min:[-110,-1,-110],max:[110,0,110]}],ramps:[],bounds:111});
test('perf: map cars <=16 and trees <=54',()=>{assert.ok(VEHICLE_SPAWNS.length<=16);assert.ok(CITY.boxes.decorations.filter(d=>d.tree).length<=54);});
test('no broken/blocky models: no porsche/sports/cyberpsycho kinds; all spawn kinds map to textured GLB',()=>{
 for(const k of ['porsche','sports','cyberpsycho'])assert.ok(!VEHICLE_KINDS.includes(k));
 const vv=fs.readFileSync('public/vehicle-visuals.js','utf8');const REAL=Function('return '+vv.match(/const REAL=(\{[^}]*\})/)[1])();
 for(const s of VEHICLE_SPAWNS){const k=REAL[s[4]]||s[4];assert.ok(['carpavan','cartech','cyberpunk','derby','goblin'].includes(k),k);}
 assert.match(vv,/\+Math\.PI;/,'Sketchfab cars turned 180° to face travel');});
test('drive: car accelerates forward (-Z at yaw 0) smoothly without sticking',()=>{
 const p={id:'a',p:[3.6,0,-63],yaw:0,alive:true,stance:0};const v=createVehicles(map(),{send(){},broadcast(){},playerById:()=>p});
 assert.equal(v.interact(p),true);const c0=v.state().find(c=>c.driver==='a'),z0=c0.p[2];let last=z0;
 for(let i=0;i<60;i++){v.input(p,1,0);v.tick(1/30);const z=v.state().find(c=>c.driver==='a').p[2];assert.ok(z<=last+1e-9);last=z;}
 assert.ok(z0-last>5,'moved '+(z0-last));});
test('exit: leaves by the left (driver) door',()=>{
 const p={id:'a',p:[3.6,0,-63],yaw:0,alive:true,stance:0};const v=createVehicles(map(),{send(){},broadcast(){},playerById:()=>p});
 v.interact(p);const c=v.state().find(c=>c.driver==='a');v.interact(p);assert.equal(p.vehicle,null);assert.ok(p.p[0]<c.p[0]-1,'exit x '+p.p[0]);});
test('materials: grass green != asphalt grey, night not black, day default reset',()=>{
 const sm=fs.readFileSync('public/surface-materials.js','utf8');assert.match(sm,/kind==='ground'\?0x5d7a45:kind==='asphalt'\?0x34373a/);
 const vs=fs.readFileSync('public/visuals.js','utf8');const m=vs.match(/HemisphereLight\(0x9fb4ff, 0x[0-9a-f]+, ([\d.]+)\)/);assert.ok(+m[1]>=1.2);
 assert.match(fs.readFileSync('public/client.js','utf8'),/timeReset01618/);});
