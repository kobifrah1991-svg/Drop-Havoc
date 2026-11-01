import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import { createVehicles, UNSTUCK } from '../shared/vehicles.js';
const g=fs.readFileSync('shared/game.js','utf8');
test('0.16.33 foot bots noclip: bot step uses no map boxes, clamped to bounds',()=>{
 assert.match(g,/step\(b, input, dt, Object\.assign\(\[\], \{ ramps/);assert.match(g,/clampBot\(b\)/);
 assert.doesNotMatch(g,/step\(b, input, dt, MAP\.boxes\)/);});
test('0.16.33 difficulty: each level easier, ordering kept',()=>{
 const D=Function('return '+g.match(/const DIFFICULTY = (\{[\s\S]*?\n  \});/)[1])();
 assert.deepEqual(D.insane.react,[220,480]);assert.equal(D.insane.dmg,1.15);assert.equal(D.hard.bots,5);
 const o=['easy','normal','hard','insane'];
 for(let i=1;i<4;i++){const a=D[o[i-1]],b=D[o[i]];assert.ok(a.react[0]>b.react[0]&&a.aimMin>b.aimMin&&a.aimTighten<b.aimTighten&&a.turn<b.turn&&a.dmg<b.dmg,o[i]);}});
test('0.16.33 car pinned against a wall gets nudged free',()=>{
 const m={boxes:[{min:[-110,-1,-110],max:[110,0,110]},{min:[-10,0,-74],max:[10,4,-70]}],ramps:[],bounds:111,noVehicles:false};
 const p={id:'a',p:[3.6,0,-65],yaw:0,alive:true,stance:0};const v=createVehicles(m,{send(){},broadcast(){},playerById:()=>p});
 v.interact(p);const c=v._cars.find(c=>c.driver==='a');
 for(let i=0;i<90;i++){v.input(p,1,0);v.tick(1/30);}
 assert.ok(UNSTUCK.afterS<=1);assert.ok((c.unstuckN||0)>=1,'unstuck fired');});
import { CITY } from '../shared/city.js';import { findVault, collides } from '../shared/physics.js';
test('0.16.33 windows: solid panes, vault on both floors exits the house, never at chests',()=>{
 const [cx,cz]=[-62,-90];
 assert.ok(collides(cx-2.9,1.0,cz-5.8,CITY.boxes,1,0.2),'pane blocks walking');
 const g=findVault([cx-4,0,cz-5.1],0,CITY.boxes,CITY.bounds);assert.ok(g&&g[2]<cz-6,'ground floor exit '+g);
 const u=findVault([cx-4,3.2,cz-5.1],0,CITY.boxes,CITY.bounds);assert.ok(u&&u[2]<cz-6,'upper floor exit '+u);
 for(const c of CITY.chests)for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])assert.equal(findVault([c.p[0]+Math.sin(yaw)*1.0,c.p[1],c.p[2]+Math.cos(yaw)*1.0],yaw,CITY.boxes,CITY.bounds)?.length&&Math.hypot(c.p[0]-cx,c.p[2]-cz)>8?'bad':undefined,undefined);});
test('0.16.33 wrecked cars never self-repair',()=>{const v=fs.readFileSync('shared/vehicles.js','utf8');assert.match(v,/if\(c\.wrecked\)continue;/);});
