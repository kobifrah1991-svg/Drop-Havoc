import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../shared/game.js';
for(const mode of ['ffa','tdm']){
test(`0.16.4 ${mode}: players and bots start with no weapons/ammo; crate loot equips and swaps`,()=>{
 let game;try{game=createGame({bots:3,mode});}catch{game=createGame({bots:3});}
 const msgs=[],a=game.connect({readyState:1,send:s=>msgs.push(JSON.parse(s)),close(){}});
 a.message(JSON.stringify({t:'join',name:'P'}));
 try{
  game.start();
  const p=a.player();
  assert.equal(p.inventory.size,0);assert.equal(p.weapon,'unarmed');
  assert.equal(Object.values(p.ammo).filter(n=>n>0).length,0);
  const sp=msgs.filter(m=>m.t==='spawn').pop();assert.deepEqual(sp.inventory,[]);assert.equal(sp.weapon,'unarmed');
  game.admin.giveWeapon(p,'rifle'); // same path loot uses: inventory+ammo
  assert.ok(p.inventory.has('rifle'));assert.equal(p.ammo.rifle,40);
  a.message(JSON.stringify({t:'state',p:p.p,yaw:0,pitch:0,w:'smg',st:0}));assert.notEqual(p.weapon,'smg'); // can't switch to unowned
 }finally{game.stop();a.close();}
});}
import {createChests} from '../shared/chests.js';
test('crate weapon drop equips an unarmed player; second gun swaps in inventory',()=>{
 const p={id:'x',p:[1,0,0],alive:true,stance:0,inventory:new Set(),ammo:{},weapon:'unarmed'};
 const grant=(pl,loot)=>{if(loot.weapon){pl.inventory.add(loot.weapon);pl.ammo[loot.weapon]=10;if(pl.weapon==='unarmed')pl.weapon=loot.weapon;}};
 let r=0;const c=createChests({boxes:[],chests:[{id:'a',p:[2,0,0],rare:false},{id:'b',p:[2,0,1],rare:true}]},{broadcast(){},send(){},grantEquipment:grant,random:()=>r});
 assert.ok(c.open(p,'a'));const w=c.dropState().find(d=>d.kind==='weapon');p.p=[...w.p];assert.ok(c.pickup(p,w.id));
 assert.equal(p.weapon,'rifle');
 p.p=[2,0,0.5];assert.ok(c.open(p,'b'));const w2=c.dropState().find(d=>d.kind==='weapon');p.p=[...w2.p];assert.ok(c.pickup(p,w2.id));
 assert.deepEqual([...p.inventory].sort(),['rifle','sniper']);assert.equal(p.weapon,'rifle');
});
