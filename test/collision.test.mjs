import test from 'node:test';
import assert from 'node:assert/strict';
import { collides, step, rayWorld, clearMovement, PLAYER, floorAt } from '../shared/physics.js';
import { NEON_MAP as MAP } from '../shared/map.js';
import { createGame } from '../shared/game.js';

function world(axis='x',up=1){
  const boxes=[{min:[-20,-1,-20],max:[20,0,20]}];
  boxes.ramps=[{min:[0,0,0],max:[6,3,6],axis,up}];
  return boxes;
}
for(const axis of ['x','z']) for(const up of [-1,1]) {
  test(`solid wedge and surface: ${axis}/${up}`,()=>{
    const boxes=world(axis,up);
    for(const height of [0.6,1.2,1.8]) assert.ok(collides(3,0.1,3,boxes,height));
    const top=floorAt(3,3,boxes);
    assert.equal(collides(3,top+0.001,3,boxes),null);
    assert.equal(clearMovement([3,0,-1],[3,0,7],boxes),false);
    assert.ok(rayWorld([3,1,-2],[0,0,1],boxes,10)<9);
    assert.equal(rayWorld([3,5,-2],[0,0,1],boxes,10),10);
  });
}
test('walk continuously up and down the ramp without embedding',()=>{
  const boxes=world();
  const s={p:[-1,0,3],v:[0,0,0],onGround:true,stance:0};
  for(let i=0;i<100;i++) {
    step(s,{s:1,yaw:0},1/120,boxes);
    assert.equal(collides(...s.p,boxes),null,`embedded while climbing at ${s.p}`);
  }
  assert.ok(s.p[0]>4 && s.p[1]>2);
  for(let i=0;i<100;i++){
    step(s,{s:-1,yaw:0},1/120,boxes);
    assert.equal(collides(...s.p,boxes),null,`embedded while descending at ${s.p}`);
  }
});
test('high side of ramp blocks entry in every stance',()=>{
  for(const stance of [0,1,2]){
    const boxes=world(),s={p:[3,0,-1],v:[0,0,0],onGround:true,stance};
    for(let i=0;i<240;i++) step(s,{f:-1,yaw:0},1/120,boxes);
    assert.ok(s.p[2]<=-PLAYER.radius+0.001);
    assert.equal(collides(...s.p,boxes, [1.8,1.2,0.6][stance]),null);
  }
});
test('thin walls cannot be crossed during a frame hitch or large velocity',()=>{
  const boxes=[{min:[-20,-1,-20],max:[20,0,20]},{min:[0,0,-10],max:[0.05,8,10]}];
  const s={p:[-2,0,0],v:[100,0,0],onGround:true,stance:0};
  step(s,{s:1,yaw:0},0.2,boxes);
  assert.ok(s.p[0]<-PLAYER.radius);
  assert.equal(clearMovement([-2,0,0],[2,0,0],boxes),false);
  assert.equal(clearMovement([-2,0,0],[-1,0,0],boxes),true);
});
test('host accepts real ramp climbing and ordinary stairs',()=>{
  const boxes=world();
  const a=[2,floorAt(2,3,boxes),3],b=[2.4,floorAt(2.4,3,boxes),3];
  assert.equal(clearMovement(a,b,boxes),true);
  const stairs=[{min:[-4,-1,-4],max:[4,0,4]},{min:[0,0,-2],max:[1,0.3,2]}];
  assert.equal(clearMovement([-0.5,0,0],[0.1,0.301,0],stairs),true);
});
test('real map ramps block hiding and bullets beneath their roof',()=>{
  for(const r of MAP.ramps){
    const p=r.min.map((n,i)=>(n+r.max[i])/2);
    assert.ok(collides(p[0],r.min[1]+0.01,p[2],MAP.boxes,0.6));
    assert.equal(rayWorld(p,[0,-1,0],MAP.boxes,20),0);
  }
});
test('all existing spawns have clear standing space',()=>{
  for(const p of MAP.spawns) assert.equal(collides(...p,MAP.boxes),null,`invalid spawn ${p}`);
});
test('host rejects forged moves into ramps and through walls with clear endpoints',()=>{
  const game=createGame({bots:0}), messages=[];
  const connection=game.connect({readyState:1,send:data=>messages.push(JSON.parse(data)),close(){}});
  connection.message(JSON.stringify({t:'join',name:'Collision tester'}));
  const player=connection.player();
  for(const [start,end] of [ [[-79,0,-82.6],[-79,0,-81.1]] ]){
    assert.equal(game.admin.teleport(player,start),true);
    player.lastState=Date.now()-150;
    messages.length=0;
    connection.message(JSON.stringify({t:'state',p:end,st:0}));
    assert.deepEqual(player.p,start);
    assert.ok(messages.some(m=>m.t==='correct'));
  }
  const start=[-76,0,-84],end=[-76,0,-83.5];
  assert.equal(game.admin.teleport(player,start),true);
  player.lastState=Date.now()-100;
  connection.message(JSON.stringify({t:'state',p:end,st:0}));
  assert.deepEqual(player.p,end);
  connection.close();game.stop();
});
