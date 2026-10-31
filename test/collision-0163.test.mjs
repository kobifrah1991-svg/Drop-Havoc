import test from 'node:test';
import assert from 'node:assert/strict';
import { collides, step, clearMovement } from '../shared/physics.js';
const floor=()=>{const b=[{min:[-50,-1,-50],max:[50,0,50]}];b.ramps=[];return b;};
test('slides along a crate when walking diagonally into it',()=>{
  const b=floor();b.push({min:[-1,0,-3],max:[1,0.62,-2]});
  const s={p:[0,0,0],v:[0,0,0],onGround:true,stance:0};
  for(let i=0;i<120;i++)step(s,{f:1,s:0.6,yaw:0},1/60,b);
  assert.ok(s.p[0]>1.2,'slid past crate '+s.p);assert.equal(collides(...s.p,b),null);
});
test('embedded player is pushed out and can walk',()=>{
  const b=floor();b.push({min:[-0.6,0,-0.4],max:[0.6,0.62,0.4]});
  const s={p:[0.3,0,0],v:[0,0,0],onGround:true,stance:0};
  step(s,{f:1,yaw:0},1/60,b);assert.equal(collides(...s.p,b),null);
  assert.ok(clearMovement([0.3,0,0],s.p,b));
});
test('landing on roof slab over walls does not sink into it',()=>{
  const b=floor();b.push({min:[-6,3.2,-6],max:[-5.65,6.4,6]},{min:[-6.1,6.4,-6.1],max:[6.1,6.65,6.1]});
  const s={p:[-5.8,9,0],v:[0,-20,0],onGround:false,stance:0};
  for(let i=0;i<60;i++)step(s,{yaw:0},1/60,b);
  assert.ok(Math.abs(s.p[1]-6.65)<1e-6,'y '+s.p[1]);
  for(let i=0;i<30;i++)step(s,{f:1,yaw:0},1/60,b);
  assert.ok(s.p[2]<-1,'can walk on roof');
});
test('0.16.9: walks over a crate without jumping',()=>{
  const b=floor();b.push({min:[-1,0,-3],max:[1,0.62,-2]});
  const s={p:[0,0,0],v:[0,0,0],onGround:true,stance:0};
  for(let i=0;i<90;i++)step(s,{f:1,yaw:0},1/60,b);
  assert.ok(s.p[2]<-3.2,'passed crate '+s.p);assert.equal(collides(...s.p,b),null);
});
test('0.16.9: clipping a wall corner slides around it',()=>{
  const b=floor();b.push({min:[-5,0,-3],max:[0.25,3,-2]});
  const s={p:[0.5,0,0],v:[0,0,0],onGround:true,stance:0};
  for(let i=0;i<90;i++)step(s,{f:1,yaw:0},1/60,b);
  assert.ok(s.p[2]<-3.2,'went past corner '+s.p);
});
test('0.16.9: server accepts a crate step-over',()=>{
  const b=floor();b.push({min:[-1,0,-3],max:[1,0.62,-2]});
  assert.ok(clearMovement([0,0,-1.5],[0,0.621,-1.7],b));
});
