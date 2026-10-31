import test from 'node:test';
import assert from 'node:assert/strict';
import { CITY } from '../shared/city.js';
import { collides,clearMovement,step } from '../shared/physics.js';
import { createChests } from '../shared/chests.js';
test('every house has a clear doorway, two usable rooms and a reachable upper floor',()=>{
  for(const b of CITY.buildings){
    const [x,,z]=b.center;
    assert.equal(clearMovement([x,0,z-7],[x,0,z-4.8],CITY.boxes),true,`door ${b.id}`);
    assert.equal(clearMovement([x-2.8,0,z+4.8],[x-2.8,0,z+7],CITY.boxes),true,`rear exit ${b.id}`);
    for(const y of [0,3.2])for(const dx of [-3,2])assert.equal(collides(x+dx,y+0.002,z-1,CITY.boxes),null,`room ${b.id}/${y}/${dx}`);
    const s={p:[x+4.1,0,z-4.9],v:[0,0,0],stance:0,onGround:true};
    for(let i=0;i<160;i++)step(s,{f:-1,yaw:0},1/120,CITY.boxes);
    assert.ok(s.p[1]>=3.19,`stair ${b.id}: ${s.p}`);
    assert.equal(collides(...s.p,CITY.boxes),null);
  }
});
test('all city spawn points are clear',()=>{
  for(const p of CITY.spawns)assert.equal(collides(...p,CITY.boxes),null,`${p}`);
});
test('chests award once, reject remote and wall-hidden access, and reset on the next match',()=>{
  let rewards=0,grants=0;const sent=[];
  const map={boxes:[{min:[0,0,-2],max:[0.3,3,2]}],chests:[{id:'wood',p:[2,0,0],rare:false},{id:'blue',p:[2,0,4],rare:true}]};
  const chest=createChests(map,{broadcast:m=>sent.push(m),send:(p,m)=>sent.push(m),reward:()=>rewards++,grantEquipment:()=>grants++,random:()=>0});
  const p={id:'one',p:[30,0,0],alive:true,stance:0};
  assert.equal(chest.open(p,'wood'),false);p.p=[-0.5,0,0];assert.equal(chest.open(p,'wood'),false);
  p.p=[1,0,0];assert.equal(chest.open(p,'wood'),true);
  assert.equal(chest.open({...p,id:'two'},'wood'),false);
  assert.equal(rewards,0);assert.equal(grants,0);
  assert.equal(chest.dropState().length,4);
  const wood=chest.dropState();
  for(const item of wood){p.p=[...item.p];assert.equal(chest.pickup(p,item.id),true);assert.equal(chest.pickup({...p,id:'two'},item.id),false);}
  assert.equal(rewards,1);assert.equal(grants,4);assert.equal(chest.dropState().length,0);
  p.p=[2,0,3];assert.equal(chest.open(p,'blue'),true);
  const blue=chest.dropState();assert.ok(blue.find(d=>d.kind==='credits').loot.credits>wood.find(d=>d.kind==='credits').loot.credits);
  assert.ok(blue.find(d=>d.kind==='armor').loot.armor>wood.find(d=>d.kind==='armor').loot.armor);
  p.alive=false;chest.reset();assert.equal(chest.open(p,'blue'),false);
  p.alive=true;assert.equal(chest.open(p,'blue'),true);
});
