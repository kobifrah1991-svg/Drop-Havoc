import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
// 0.16.38: small maps (neon, canyon, harbor) start the human at the centre on the ground, no parachute; bots never parachute there.
// The city (large) still drops by parachute. Same shared/game.js runs offline practice, P2P and the online server.
// Each map runs in its own process because the map is chosen once at import time.
const probe=id=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
globalThis.localStorage={getItem:k=>k==='arena.map'?${JSON.stringify(JSON.stringify(id))}:null};
const {createGame}=await import('./shared/game.js');const {MAP}=await import('./shared/map.js');const {collides}=await import('./shared/physics.js');
const ms=[],g=createGame({}),c=g.connect({readyState:1,send:d=>ms.push(JSON.parse(d)),close(){}});
c.message(JSON.stringify({t:'join',name:'K'}));g.start();await new Promise(r=>setTimeout(r,1500));
const sp=ms.find(m=>m.t==='spawn'),chute=ms.some(m=>(m.players||[]).some(p=>p.parachuting));
console.log(JSON.stringify({map:MAP.id,p:sp.p,para:sp.parachuting,chute,free:!collides(sp.p[0],0.01,sp.p[2],MAP.boxes,1.8)}));c.close();g.stop();process.exit(0);`],{encoding:'utf8'}).trim().split('\n').at(-1));
for(const id of ['neon','canyon','harbor'])test(`${id}: centre start, no parachute (human + bots)`,()=>{
 const r=probe(id);assert.equal(r.map,id);assert.equal(r.para,false);assert.equal(r.chute,false);assert.equal(r.p[1],0);
 assert.ok(Math.hypot(r.p[0],r.p[2])<12,'near centre '+r.p);assert.ok(r.free);});
test('city: still parachutes',()=>{const r=probe('city');assert.equal(r.map,'city');assert.equal(r.para,true);});
