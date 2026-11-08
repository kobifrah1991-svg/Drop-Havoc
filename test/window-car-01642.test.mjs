import test from 'node:test';import assert from 'node:assert/strict';
import { rayWorld } from '../shared/physics.js';
test('0.16.42: invisible window panes never stop bullets',()=>{
  const boxes=Object.assign([{min:[-1,0,4],max:[1,3,4.3],pane:true,invisible:true}],{ramps:[]});
  assert.equal(rayWorld([0,1.5,0],[0,0,1],boxes,50),50);
  boxes.push({min:[-1,0,8],max:[1,3,8.3]});
  assert.ok(Math.abs(rayWorld([0,1.5,0],[0,0,1],boxes,50)-8)<1e-6);
});
import { createVehicles } from '../shared/vehicles.js';
test('0.16.42: GTA passenger seat — driver left, passenger right, both exit',()=>{
  const map={boxes:[{min:[-110,-1,-110],max:[110,0,110]}],ramps:[],bounds:111},players=new Map();
  const v=createVehicles(map,{send(){},broadcast(){},playerById:id=>players.get(id),anyCar:true});
  const a={id:'a',p:[41.6,0,-65],alive:true,stance:0},b={id:'b',p:[41.6,0,-65],alive:true,stance:0},bot={id:'x',bot:true,p:[41.6,0,-65],alive:true,stance:0};
  for(const p of [a,b,bot])players.set(p.id,p);
  assert.equal(v.interact(a),true);assert.equal(v.interact(bot),false);assert.equal(v.interact(b),true);
  const c=v.state()[0];assert.equal(c.driver,'a');assert.equal(c.passenger,'b');assert.equal(b.vehicle,c.id);
  v.tick(1/60);assert.ok(Math.hypot(b.p[0]-c.p[0],b.p[2]-c.p[2])<1);
  assert.equal(v.interact(b),true);assert.equal(b.vehicle,null);assert.equal(v.state()[0].passenger,null);
});
test('0.16.42: car footprint has no phantom margin',()=>{
  const map={boxes:[{min:[-110,-1,-110],max:[110,0,110]},{min:[41.6+1.4+0.1,0,-70],max:[46,3,-60]}],ramps:[],bounds:111};
  const v=createVehicles(map,{send(){},broadcast(){},playerById:()=>({alive:true})});
  const c=v._cars[0];c.driver='a';c.input={f:0,s:1};c.lastInput=Date.now();c.speed=0;const y=c.yaw;
  for(let i=0;i<5;i++)v.tick(1/60);assert.equal(c.p[0],41.6);
});
import { MAPS, MAP_IDS } from '../shared/map.js';
import { collides as col } from '../shared/physics.js';
test('0.16.42: 10 maps, every spawn inside the frame and clear',()=>{
  assert.ok(MAP_IDS.length>=10);
  for(const id of MAP_IDS){const m=MAPS[id];assert.ok(m.spawns.length>0,id);for(const s of m.spawns){assert.ok(Math.abs(s[0])<m.bounds-1.5&&Math.abs(s[2])<m.bounds-1.5,id);assert.equal(col(s[0],s[1],s[2],m.boxes),null,id+' '+s);}}
});
