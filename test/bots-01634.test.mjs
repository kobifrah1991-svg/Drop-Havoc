import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { CITY } from '../shared/city.js';import { findVault, collides } from '../shared/physics.js';
import { createVehicles } from '../shared/vehicles.js';
const g=fs.readFileSync('shared/game.js','utf8');
test('0.16.34 bot inside a house can vault out a window from any facing',()=>{
 const [cx,cz]=[-62,-90];let ok=false;
 for(let k=0;k<8;k++){const l=findVault([cx-4,0,cz-5.1],k*Math.PI/4,CITY.boxes,CITY.bounds);if(l&&!collides(l[0],l[1]+0.01,l[2],CITY.boxes,1.7,0.3)){ok=true;break;}}
 assert.ok(ok);});
test('0.16.34 buildings expose entrance doors for bot nav',()=>{assert.ok(CITY.buildings.length>0);for(const h of CITY.buildings)assert.equal(h.door[2],h.center[2]-6);});
test('0.16.34 bots parachute with the player on large maps',()=>{
 assert.match(g,/p\.parachuting=MAP\.bounds>=80 && !p\.hasDropped;/);assert.match(g,/if \(b\.parachuting\) return botParachute\(b, dt\)/);});
test('0.16.34 new match resets every car intact',()=>{
 const m={boxes:[{min:[-110,-1,-110],max:[110,0,110]}],ramps:[],bounds:111,noVehicles:false};
 const v=createVehicles(m,{send(){},broadcast(){},playerById:()=>null});const c=v._cars[0];
 v.damage(c.id,9999);assert.ok(c.wrecked);v.resetAll();assert.ok(v._cars.every(c=>!c.wrecked&&c.hp===200));
 assert.equal((g.match(/vehicles\.resetAll\(\)/g)||[]).length,2);});
test('0.16.34 wreck visuals: fire + smoke, no outline frame',()=>{const s=fs.readFileSync('public/vehicle-visuals.js','utf8');assert.match(s,/m\.fire=f/);assert.doesNotMatch(s,/EdgesGeometry/);});
