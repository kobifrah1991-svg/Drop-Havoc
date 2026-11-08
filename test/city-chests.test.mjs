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
test('ground loot (no crates): items lie on the floor, taken once, need line of sight, re-rolled each match',()=>{
  const sent=[];let grants=0;
  const map={boxes:[{min:[0,0,-2],max:[0.3,3,2]}],chests:[{id:'old',p:[2,0,4],rare:true}],floorLoot:[{p:[2,0,0],chance:1}]};
  const loot=createChests(map,{broadcast:m=>sent.push(m),send:()=>{},grantEquipment:()=>{grants++;return true;},random:()=>0});
  assert.deepEqual(loot.state(),[]);assert.equal(loot.open({alive:true,p:[2,0,4],stance:0},'old'),false);
  const items=loot.dropState();
  assert.equal(items.length,3); // a rare old crate spot holds two items, the second one gear; a floor spot one
  assert.ok(items.some(d=>d.kind==='armor'&&d.loot.vest===2));
  const floor=items.find(d=>d.id.startsWith('loot-1-1-'));
  const p={id:'one',p:[30,0,0],alive:true,stance:0};
  assert.equal(loot.pickup(p,floor.id),false);                 // too far
  p.p=[-0.5,0,0];assert.equal(loot.pickup(p,floor.id),false);  // behind a wall
  p.p=[1.5,0,0];assert.equal(loot.pickup(p,floor.id),true);
  assert.equal(loot.pickup({...p,id:'two'},floor.id),false);   // only once
  assert.equal(grants,1);assert.deepEqual(sent.at(-1),{t:'chests',taken:floor.id});
  loot.reset();assert.equal(loot.dropState().length,3);
});
test('an item that would do nothing stays on the floor',()=>{
  const loot=createChests({boxes:[],floorLoot:[{p:[0,0,0],chance:1}]},{broadcast(){},send(){},grantEquipment:()=>false,random:()=>0});
  const [item]=loot.dropState();
  assert.equal(loot.pickup({id:'a',p:[0,0,0],alive:true,stance:0},item.id),false);
  assert.equal(loot.dropState().length,1);
});
test('city: houses and parks hold floor loot spots, none inside walls',()=>{
  assert.equal(CITY.chests.length,0);
  assert.ok(CITY.floorLoot.length>=150);
  for(const f of CITY.floorLoot)assert.equal(collides(f.p[0],f.p[1]+0.02,f.p[2],CITY.boxes,0.5,0.3),null,`${f.p}`);
});
