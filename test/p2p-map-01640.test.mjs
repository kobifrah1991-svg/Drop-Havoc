import test from 'node:test';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
// 0.16.40: P2P match path (createGame({mode,capacity}) as in public/p2p.js) with host + guest: no parachute on small maps,
// and the welcome carries the match map so a guest whose device had another map selected switches to the host's map.
const probe=id=>JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
globalThis.localStorage={getItem:k=>k==='arena.map'?${JSON.stringify(JSON.stringify(id))}:null};
const {createGame}=await import('./shared/game.js');
const g=createGame({mode:'ffa',capacity:6,difficulty:'normal'});g.start();const out={};
for(const n of ['kobi','Turbo']){const ms=[];out[n]=ms;const c=g.connect({readyState:1,send:d=>ms.push(JSON.parse(d)),close(){}});c.message(JSON.stringify({t:'join',name:n}));}
await new Promise(r=>setTimeout(r,1500));
const r={};for(const [n,ms] of Object.entries(out)){r[n]={map:ms.find(m=>m.t==='welcome')?.map,para:ms.find(m=>m.t==='spawn')?.parachuting,chute:ms.some(m=>(m.players||[]).some(p=>p.parachuting))};}
console.log(JSON.stringify(r));g.stop();process.exit(0);`],{encoding:'utf8'}).trim().split('\n').at(-1));
for(const id of ['neon','canyon','harbor'])test(`P2P ${id}: host+guest no parachute, welcome map=${id}`,()=>{
 for(const p of Object.values(probe(id))){assert.equal(p.map,id);assert.equal(p.para,false);assert.equal(p.chute,false);}});
test('P2P city: welcome map=city, parachute',()=>{for(const p of Object.values(probe('city'))){assert.equal(p.map,'city');assert.equal(p.para,true);}});
test('client switches to the match map on welcome',async()=>{const fs=await import('node:fs');const s=fs.readFileSync('public/client.js','utf8');
 assert.match(s,/m\.map && m\.map !== MAP\.id/);assert.match(s,/arena\.autojoin/);assert.match(s,/map: MAP\.id \}\)/);});
