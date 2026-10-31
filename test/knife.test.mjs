import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../shared/game.js';
test('host simulates thrown knife damage, cooldown and unlimited inventory',async()=>{
 const game=createGame({bots:0}),messages=[];
 const socket=()=>({readyState:1,send:s=>messages.push(JSON.parse(s)),close(){}});
 const a=game.connect(socket()),b=game.connect(socket());a.message(JSON.stringify({t:'join',name:'Thrower'}));b.message(JSON.stringify({t:'join',name:'Target'}));
 const p=a.player(),target=b.player();p.parachuting=false;target.parachuting=false;target.protectUntil=0;
 game.admin.teleport(p,[0,0,5]);game.admin.teleport(target,[0,0,-2]);
 try{
  game.start();game.admin.giveWeapon(p,'knife');const ammo=p.ammo.knife;a.message(JSON.stringify({t:'throwKnife',yaw:0,pitch:0}));a.message(JSON.stringify({t:'throwKnife',yaw:0,pitch:0}));
  assert.equal(messages.filter(m=>m.t==='knifeFlight').length,2); // one launch broadcast to both clients
  await new Promise(resolve=>setTimeout(resolve,260));assert.ok(target.hp<200);assert.equal(p.ammo.knife,ammo);
  p.lastShot.knife=0;a.message(JSON.stringify({t:'throwKnife',yaw:0,pitch:0}));assert.equal(p.ammo.knife,ammo);
 }finally{game.stop();a.close();b.close();}
});
