import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../shared/physics.js';
import { MAP } from '../shared/map.js';
import { createGame } from '../shared/game.js';
test('200 HP at spawn and healing/admin changes never exceed 200',()=>{
  const game=createGame({bots:0}),conn=game.connect({readyState:1,send(){},close(){}});
  conn.message(JSON.stringify({t:'join',name:'Vitals test'}));const p=conn.player();
  assert.equal(PLAYER.maxHp,200);assert.equal(PLAYER.maxArmor,200);assert.equal(p.hp,200);
  p.hp=190;game.admin.heal(p,100);assert.equal(p.hp,200);
  game.admin.setHealth(p,1000);assert.equal(p.hp,200);
  conn.close();game.stop();
});
test('chest armor caps at 200 and cannot duplicate a grant',()=>{
  const messages=[],game=createGame({bots:0}),conn=game.connect({readyState:1,send:s=>messages.push(JSON.parse(s)),close(){}});
  conn.message(JSON.stringify({t:'join',name:'Armor test'}));const p=conn.player(),chest=MAP.chests[0];
  assert.equal(game.admin.teleport(p,[chest.p[0],chest.p[1],chest.p[2]-1]),true);
  p.armor=199;conn.message(JSON.stringify({t:'openChest',id:chest.id}));
  assert.equal(p.armor,199);
  const drop=messages.filter(m=>m.t==='chests').at(-1).drops.find(d=>d.kind==='armor');
  game.admin.teleport(p,drop.p);conn.message(JSON.stringify({t:'pickupLoot',id:drop.id}));
  assert.equal(p.armor,200);assert.equal(messages.filter(m=>m.t==='chestReward').length,1);
  conn.message(JSON.stringify({t:'pickupLoot',id:drop.id}));assert.equal(p.armor,200);
  assert.equal(messages.filter(m=>m.t==='chestReward').length,1);
  conn.close();game.stop();
});
