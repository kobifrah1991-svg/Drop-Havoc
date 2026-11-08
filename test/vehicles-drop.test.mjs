import { CITY } from '../shared/city.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVehicles} from '../shared/vehicles.js';
import {step,collides,PARACHUTE} from '../shared/physics.js';
import {createGame} from '../shared/game.js';

test('full outward descent at every edge and corner stays inside the canopy safety margin',()=>{
 const bounds=111,limit=bounds-PARACHUTE.boundaryMargin;
 const boxes=Object.assign([{min:[-112,-1,-112],max:[112,0,112]}],{bounds});
 for(const [x,z]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
  const s={p:[x*(limit-.01),PARACHUTE.height,z*(limit-.01)],v:[x*7,0,z*7],onGround:false,stance:0,parachuting:true};
  for(let tick=0;tick<3600&&!s.onGround;tick++){
   step(s,{s:x,f:-z,yaw:0},1/120,boxes);
   assert.ok(Math.abs(s.p[0])<=limit+.00001&&Math.abs(s.p[2])<=limit+.00001,`outside at ${s.p}`);
  }
  assert.equal(s.onGround,true);assert.ok(Math.abs(s.p[1])<.05);
  // The boundary only removes outward velocity; the player can steer back into the district.
  step(s,{s:-x,f:z,yaw:0},.1,boxes);
  if(x)assert.ok(Math.abs(s.p[0])<limit);
  if(z)assert.ok(Math.abs(s.p[2])<limit);
 }
});

test('host rejects small forged movements across the aerial boundary above the perimeter walls',()=>{
 const messages=[],game=createGame({bots:0}),conn=game.connect({readyState:1,send:data=>messages.push(JSON.parse(data)),close(){}});
 try{
  conn.message(JSON.stringify({t:'join',name:'Boundary test'}));const p=conn.player(),limit=CITY.dropBounds-PARACHUTE.boundaryMargin; // 0.16.44: parachutes stay inside the ring road
  for(const [axis,sign]of [[0,1],[0,-1],[2,1],[2,-1]]){
   p.p=[0,80,0];p.p[axis]=sign*(limit-.1);p.parachuting=true;p.lastState=Date.now()-100;
   const before=[...p.p],outside=[...p.p];outside[axis]=sign*(limit+.1);messages.length=0;
   conn.message(JSON.stringify({t:'state',p:outside,st:0}));assert.deepEqual(p.p,before);assert.ok(messages.some(m=>m.t==='correct'));
  }
 }finally{conn.close();game.stop();}
});
test('GTA skydive: free fall, the canopy opens on jump or low down, limits descent, steers, flares, closes after landing',()=>{
 const boxes=[{min:[-100,-1,-100],max:[100,0,100]}];
 // 1) no input: free fall to the automatic opening height, then a slow canopy descent
 const s={p:[0,PARACHUTE.height,0],v:[0,0,0],onGround:false,stance:0,parachuting:true};
 let ticks=0,maxFall=0;
 for(;ticks<6000&&!s.onGround;ticks++){step(s,{f:0.2,s:0,yaw:0},1/120,boxes);maxFall=Math.max(maxFall,-s.v[1]);if(s.chuteOpen&&!(s.openT>0))assert.ok(s.v[1]>=-PARACHUTE.sink-.001);}
 assert.ok(maxFall>40&&maxFall<=PARACHUTE.freefall.terminal+.01,`free fall ${maxFall}`);
 assert.ok(ticks/120>12&&ticks/120<24,`drop ${ticks/120} seconds`);
 assert.equal(s.onGround,true);assert.equal(s.parachuting,false);assert.equal(s.chuteOpen,false);assert.ok(Math.abs(s.p[1])<0.05);assert.ok(s.p[2]<-3);
 // 2) jump opens the canopy at once; holding jump under the canopy flares (slower sink)
 const a={p:[0,PARACHUTE.height,0],v:[0,0,0],onGround:false,stance:0,parachuting:true};
 step(a,{jump:true,yaw:0},1/120,boxes);assert.equal(a.chuteOpen,true);
 for(let i=0;i<400;i++)step(a,{jump:true,yaw:0},1/120,boxes);
 assert.ok(a.v[1]>=-PARACHUTE.flare.sink-.01,`flare ${a.v[1]}`);
 // 3) diving falls faster than the flat position
 const d={p:[0,PARACHUTE.height,0],v:[0,0,0],onGround:false,stance:0,parachuting:true},f={p:[0,PARACHUTE.height,0],v:[0,0,0],onGround:false,stance:0,parachuting:true};
 for(let i=0;i<360;i++){step(d,{f:1,yaw:0},1/120,boxes);step(f,{f:-1,yaw:0},1/120,boxes);}
 assert.ok(d.p[1]<f.p[1],`dive ${d.p[1]} below flat ${f.p[1]}`);
});
test('vehicles have exclusive seats, host-driven collision, safe exit and room-local state',()=>{
 const boxes=[{min:[-110,-1,-110],max:[110,0,110]},{min:[-5,0,-80],max:[5,6,-79]}];
 const map={boxes:[...boxes],ramps:[],bounds:111},players=new Map(),sent=[];
 const vehicles=createVehicles(map,{send:(p,m)=>sent.push(m),broadcast:m=>sent.push(m),playerById:id=>players.get(id),anyCar:true});
 const a={id:'a',p:[2.5,0,-65],alive:true,stance:0},b={id:'b',p:[2.5,0,-65],alive:true,stance:0};players.set('a',a);players.set('b',b);
 assert.equal(vehicles.interact(a),true);assert.equal(vehicles.interact(b,{passenger:false}),false);
 for(let i=0;i<300;i++){vehicles.input(a,1,0);vehicles.tick(1/60);}
 const c=vehicles.state()[0];assert.ok(c.p[2]>-77.5,`${c.p}`);assert.ok(Math.abs(c.speed)<10,"0.16.33 unstuck: no runaway at wall "+c.speed);
 assert.equal(vehicles.interact(a),true);assert.equal(a.vehicle,null);assert.equal(collides(...a.p,map.boxes),null);
 const second=createVehicles({boxes:[...boxes],ramps:[],bounds:111},{send(){},broadcast(){},playerById(){}});
 assert.deepEqual(second.state()[0].p,[3.6,0,-65]);
 b.p=[6.1,0,-65];assert.equal(vehicles.interact(b),false); // old position is no longer near the moved car
});

test('0.16.15: map cars enterable without buying; summoned car only by owner',()=>{
 const map={boxes:[{min:[-110,-1,-110],max:[110,0,110]}],ramps:[],bounds:111};
 const v=createVehicles(map,{send(){},broadcast(){},playerById(){}});
 const a={id:'a',p:[3.6,0,-60],yaw:0,alive:true,stance:0},b={id:'b',p:[0,0,0],yaw:0,alive:true,stance:0};
 a.p=[3.6,0,-63];assert.equal(v.interact(a),true);v.interact(a);assert.equal(a.vehicle,null);a.p=[0,0,0];
 assert.equal(v.summon(a,'cyberpunk'),true);const own=v.state().find(c=>c.owner==='a');assert.ok(own);
 b.p=own.p.slice();assert.equal(v.interact(b),false);
 a.p=own.p.slice();assert.equal(v.interact(a),true);assert.equal(a.vehicle,own.id);
});
