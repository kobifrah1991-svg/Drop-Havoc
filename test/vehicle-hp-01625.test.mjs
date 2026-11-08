import test from 'node:test';import assert from 'node:assert/strict';
import { CAR_HP, hurtCar, repairCar, crashDamage, createVehicles } from '../shared/vehicles.js';
test('hurtCar clamps and wrecks',()=>{const c={hp:CAR_HP.max};assert.equal(hurtCar(c,50,0),false);assert.equal(c.hp,CAR_HP.max-50);assert.equal(hurtCar(c,999,0),true);assert.equal(c.hp,0);assert.ok(c.wrecked);assert.equal(c.wreckedUntil,CAR_HP.wreckMs);assert.equal(hurtCar(c,10,1),false);assert.equal(hurtCar({hp:10},-5),false);});
test('repairCar after delay',()=>{const c={hp:0,wrecked:true,wreckedUntil:1000};assert.equal(repairCar(c,500),false);assert.equal(repairCar(c,1000),true);assert.equal(c.hp,CAR_HP.max);assert.equal(c.wrecked,false);});
test('crashDamage scales with speed',()=>{assert.equal(crashDamage(5),0);assert.ok(crashDamage(20)>crashDamage(10));assert.ok(crashDamage(-20)>0);assert.ok(crashDamage(26)<CAR_HP.max);});
test('vehicles: damage, wreck ejects driver, blocks entry, state has hp',()=>{
  const map={boxes:[],ramps:[],bounds:100};const msgs=[];const p={id:'a',alive:true,p:[41.6,0,-65],yaw:0};
  const v=createVehicles(map,{send:(_p,m)=>msgs.push(m),broadcast:m=>msgs.push(m),playerById:id=>id==='a'?p:null});
  const c0=v.state()[0];assert.equal(c0.hp,CAR_HP.max);assert.equal(c0.wrecked,false);
  p.p=[c0.p[0]+2,0,c0.p[2]];assert.ok(v.interact(p));assert.equal(p.vehicle,c0.id);
  v.damage(c0.id,CAR_HP.max+50);const s=v.state().find(c=>c.id===c0.id);assert.equal(s.hp,0);assert.ok(s.wrecked);assert.equal(s.driver,null);assert.equal(p.vehicle,null);
  assert.ok(msgs.some(m=>m.t==='carWreck'));
  p.p=[c0.p[0]+2,0,c0.p[2]];const before=p.vehicle;v.interact(p);assert.notEqual(v.state().find(c=>c.id===c0.id).driver,'a');assert.equal(before,null);
  const hit=v.rayCar([c0.p[0]+20,0.5,c0.p[2]],[-1,0,0],50);assert.notEqual(hit?.id,c0.id);
});
test('rayCar and blast hit live cars',()=>{const map={boxes:[],ramps:[],bounds:100};const v=createVehicles(map,{send(){},broadcast(){},playerById:()=>null});const c=v.state()[0];
  const h=v.rayCar([c.p[0]+20,0.5,c.p[2]],[-1,0,0],50);assert.equal(h.id,c.id);assert.ok(h.t>15&&h.t<20);
  v.blast([c.p[0],0.5,c.p[2]],5,60);assert.ok(v.state()[0].hp<CAR_HP.max);});
import fs from 'node:fs';
