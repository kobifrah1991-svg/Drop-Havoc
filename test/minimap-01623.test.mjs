import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const { minimapVisible, minimapMarkers, drawMinimap, mapBounds, project, landmarks } = await import('../shared/minimap.js');
const { MAPS } = await import('../shared/map.js');
const base={inMatch:true,paused:false,alive:true,parachuting:false};
test('minimap visible in an active match',()=>assert.equal(minimapVisible(base),true));
test('minimap hidden when paused, dead, out of match, or toggled off',()=>{
 assert.equal(minimapVisible({...base,paused:true}),false);assert.equal(minimapVisible({...base,alive:false}),false);
 assert.equal(minimapVisible({...base,inMatch:false}),false);assert.equal(minimapVisible({...base,hidden:true}),false);});
test('minimap stays on during parachute drop',()=>assert.equal(minimapVisible({...base,alive:false,parachuting:true}),true));
test('player marker present with facing',()=>{const d=minimapMarkers({map:MAPS.city,me:{id:'a',p:[5,0,-7],yaw:1}});const p=d.markers.find(m=>m.type==='player');assert.deepEqual([p.x,p.z,p.yaw],[5,-7,1]);});
test('car markers when cars exist (own car flagged), enemies as dots',()=>{const d=minimapMarkers({map:MAPS.city,me:{id:'a',p:[0,0,0]},cars:[{p:[10,0,10],yaw:0,driver:'a'},{p:[-20,0,3],yaw:1}],enemies:[{p:[1,0,1]}]});
 const cars=d.markers.filter(m=>m.type==='car');assert.equal(cars.length,2);assert.equal(cars[0].mine,true);assert.equal(d.markers.filter(m=>m.type==='enemy').length,1);
 assert.equal(minimapMarkers({map:MAPS.neon,me:{p:[0,0,0]}}).markers.some(m=>m.type==='car'),false);});
for(const [id,m] of Object.entries(MAPS))test('bounds match active map '+id,()=>{const d=minimapMarkers({map:m,me:{p:[0,0,0]}});assert.equal(d.bounds,m.bounds);assert.equal(mapBounds(m),m.bounds);
 assert.deepEqual(project(m.bounds,150,-m.bounds,m.bounds),[0,150]);assert.deepEqual(project(m.bounds,150,0,0),[75,75]);
 const calls=[];const ctx=new Proxy({},{get:(t,k)=>k in t?t[k]:(...a)=>calls.push(k),set:(t,k,v)=>{t[k]=v;return true;}});drawMinimap(ctx,150,m,d,{landmarks:landmarks(m)});assert.ok(calls.includes('strokeRect')&&calls.includes('fill'));});
test('client wires the HUD minimap',()=>{const c=fs.readFileSync(new URL('../public/client.js',import.meta.url),'utf8');assert.match(c,/minimapTick\(now\)/);assert.match(c,/mmCars=m\.vehicles/);assert.match(fs.readFileSync(new URL('../public/style.css',import.meta.url),'utf8'),/#minimap \{/);});
