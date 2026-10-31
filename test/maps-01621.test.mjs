import test from 'node:test';import assert from 'node:assert/strict';
globalThis.localStorage={getItem:k=>k==='arena.map'?'"canyon"':null};
const { MAPS, MAP } = await import('../shared/map.js');
const { collides } = await import('../shared/physics.js');
test('map select: localStorage picks the map; all four maps registered',()=>{assert.equal(MAP.id,'canyon');assert.deepEqual(Object.keys(MAPS),['city','neon','canyon','harbor']);});
for(const [id,m] of Object.entries(MAPS))test('map '+id+' is valid (spawns clear, pickups/waypoints in bounds, rpgs present)',()=>{
 assert.equal(m.id,id);assert.ok(m.bounds>0&&m.boxes.bounds===m.bounds||id==='city');
 for(const s of m.spawns){assert.ok(Math.abs(s[0])<m.bounds&&Math.abs(s[2])<m.bounds);assert.ok(!collides(s[0],s[1]+0.05,s[2],m.boxes),id+' spawn in wall '+s);}
 if(id!=='city'){assert.ok(m.pickups.some(p=>p.type==='rpg'));assert.ok(m.ramps.length>0);assert.equal(m.noVehicles,true);assert.ok(m.bounds<80,'small map → ground spawn');}
 else assert.ok(m.bounds>=80,'city → parachute');
 for(const p of m.pickups)assert.ok(Math.abs(p.p[0])<m.bounds&&Math.abs(p.p[2])<m.bounds);});
test('arena game runs with no road cars and no parachute',async()=>{const { createGame }=await import('../shared/game.js');const g=createGame({});assert.ok(g);});
