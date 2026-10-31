import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../shared/game.js';
import {MAP} from '../shared/map.js';
import {collides} from '../shared/physics.js';

test('city speed and power pickups are accessible, grant 30 seconds and reach the HUD',async()=>{
 const messages=[],game=createGame({bots:0}),conn=game.connect({readyState:1,send:data=>messages.push(JSON.parse(data)),close(){}});
 try{
  conn.message(JSON.stringify({t:'join',name:'Boost test'}));const p=conn.player();p.parachuting=false;game.start();
  for(const kind of ['speed','power']){
   const items=MAP.pickups.filter(item=>item.type===kind);assert.ok(items.length>=2);
   for(const item of items)assert.equal(collides(...item.p,MAP.boxes),null,`${kind} inside a wall: ${item.p}`);
   assert.equal(game.admin.teleport(p,items[0].p),true);const before=Date.now();
   await new Promise(resolve=>setTimeout(resolve,90));
   const remaining=p[kind+'Until']-Date.now();assert.ok(remaining>29500&&remaining<=30000,`${kind}: ${remaining}`);
   const packet=messages.filter(m=>m.t==='buffs'&&m[kind]>0).at(-1);assert.ok(packet&&packet[kind]>29500);
   assert.ok(p[kind+'Until']>=before+30000);
  }
 }finally{conn.close();game.stop();}
});

