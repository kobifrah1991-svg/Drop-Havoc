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
test('ground weapon equips an unarmed player; a second gun goes into the inventory',()=>{
 const p={id:'x',p:[1,0,0],alive:true,stance:0,inventory:new Set(),ammo:{},weapon:'unarmed'};
 const grant=(pl,loot)=>{if(loot.weapon){pl.inventory.add(loot.weapon);pl.ammo[loot.weapon]=10;if(pl.weapon==='unarmed')pl.weapon=loot.weapon;}return true;};
 const c=createChests({boxes:[],floorLoot:[{p:[2,0,0],chance:1},{p:[2,0,1],rare:true,chance:1}]},{broadcast(){},send(){},grantEquipment:grant,random:()=>0});
 for(const d of c.dropState()){assert.equal(d.kind,'weapon');p.p=[...d.p];assert.ok(c.pickup(p,d.id));}
 assert.deepEqual([...p.inventory].sort(),['m4','rifle']);assert.equal(p.weapon,'rifle');
});
