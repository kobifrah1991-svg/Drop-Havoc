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
test('a vest never takes armor past 200 and cannot be picked up twice',()=>{
  const random=Math.random;Math.random=()=>0.3; // every rolled item: a level-1 vest
  try{
    const messages=[],game=createGame({bots:0}),conn=game.connect({readyState:1,send:s=>messages.push(JSON.parse(s)),close(){}});
    conn.message(JSON.stringify({t:'join',name:'Armor test'}));const p=conn.player();
    const drop=messages.filter(m=>m.t==='chests').at(-1).drops.find(d=>d.kind==='armor');
    assert.ok(drop,'a vest on the floor');
    assert.equal(game.admin.teleport(p,drop.p),true);
    p.armor=150;p.vestLvl=0;conn.message(JSON.stringify({t:'pickupLoot',id:drop.id}));
    assert.equal(p.armor,150);assert.equal(p.vestLvl,3);                  // a level-1 vest (70) never lowers armor; above 130 only a level-3 vest fits
    assert.equal(messages.filter(m=>m.t==='chestReward').length,1);
    conn.message(JSON.stringify({t:'pickupLoot',id:drop.id}));
    assert.equal(messages.filter(m=>m.t==='chestReward').length,1);
    assert.ok(p.armor<=200);
    conn.close();game.stop();
  }finally{Math.random=random;}
});
