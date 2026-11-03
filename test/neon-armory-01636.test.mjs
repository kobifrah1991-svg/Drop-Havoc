import test from 'node:test';import assert from 'node:assert/strict';
globalThis.localStorage={getItem:k=>k==='arena.map'?'"neon"':null};
const { MAP, ARMORY } = await import('../shared/map.js');
const { WEAPONS, WEAPON_ORDER } = await import('../shared/weapons.js');
const { createGame } = await import('../shared/game.js');
const { collides } = await import('../shared/physics.js');
const APP=(await import('../shared/app-version.js')).APP_VERSION;
test('0.16.36+ version',()=>assert.ok(APP>='0.16.36'));
test('M16 exists and RPG gives 10+ rockets',()=>{assert.ok(WEAPONS.m16&&WEAPON_ORDER.includes('m16'));assert.ok(WEAPONS.rpg.rockets>=10&&WEAPONS.rpg.mag>=WEAPONS.rpg.rockets);});
test('neon armory: many guns incl. M16, not in walls; supply crates present',()=>{
 assert.equal(MAP.id,'neon');const guns=MAP.pickups.filter(p=>p.type.startsWith('gun:'));
 const inArmory=guns.filter(g=>g.p[0]>=ARMORY.min[0]&&g.p[0]<=ARMORY.max[0]&&g.p[2]>=ARMORY.min[2]&&g.p[2]<=ARMORY.max[2]);
 assert.ok(inArmory.length>=8);const kinds=new Set(inArmory.map(g=>g.type.slice(4)));
 for(const k of ['m16','m4','rifle','smg','shotgun','sniper','pistol'])assert.ok(kinds.has(k),k);
 for(const g of guns){assert.ok(WEAPONS[g.type.slice(4)]);assert.equal(collides(g.p[0],g.p[1]+0.05,g.p[2],MAP.boxes),null,'gun in wall '+g.p);}
 assert.ok(MAP.chests.length>=8);for(const c of MAP.chests)assert.equal(collides(c.p[0],c.p[1]+0.05,c.p[2],MAP.boxes),null,c.id);
});
test('neon: 4 bots + 1 human = 5 fighters on every difficulty',async()=>{
 for(const difficulty of ['easy','insane']){const ms=[],g=createGame({difficulty}),c=g.connect({readyState:1,send:d=>ms.push(JSON.parse(d)),close(){}});
  try{assert.equal(g.config.bots,5);c.message(JSON.stringify({t:'join',name:'K'}));g.start();await new Promise(r=>setTimeout(r,4000));
   const r=ms.filter(m=>m.t==='roster').at(-1).players;assert.equal(r.length,5,difficulty);}finally{c.close();g.stop();}}
});
test('neon ground weapon respawns at the same spot after ~10 s',async()=>{
 const msgs=[],g=createGame({bots:0}),c=g.connect({readyState:1,send:d=>msgs.push(JSON.parse(d)),close(){}});const realNow=Date.now;
 try{c.message(JSON.stringify({t:'join',name:'K'}));const p=c.player();g.start();
  const spot=MAP.pickups.find(x=>x.type==='gun:m16').p;const away=[-26,0,0];
  g.admin.teleport(p,spot);await new Promise(r=>setTimeout(r,120));
  const took=msgs.filter(m=>m.t==='items'&&m.took?.type==='gun:m16');assert.equal(took.length,1);assert.ok(p.inventory.has('m16'));
  const id=took[0].took.id,entry=took[0].items.find(i=>i[0]===id);assert.deepEqual(entry[2],spot);assert.equal(entry[3],0);
  g.admin.teleport(p,away);p.inventory.delete('m16');p.ammo.m16=0;await new Promise(r=>setTimeout(r,60));
  g.admin.teleport(p,spot);await new Promise(r=>setTimeout(r,120));
  assert.ok(!p.inventory.has('m16'),'not back yet');
  g.admin.teleport(p,away);const off=11000;Date.now=()=>realNow()+off;await new Promise(r=>setTimeout(r,60));
  g.admin.teleport(p,spot);await new Promise(r=>setTimeout(r,120));
  assert.ok(p.inventory.has('m16'),'respawned and taken again at the same spot');
 }finally{Date.now=realNow;c.close();g.stop();}
});
import { readFileSync } from 'node:fs';
test('collected pickup hides whole group (icon + floor ring), all maps',()=>{const src=readFileSync(new URL('../public/client.js',import.meta.url),'utf8');
 assert.match(src,/function setPickupShown\(it, shown\) \{ it\.root\.visible = shown; it\.spin\.visible = shown; it\.ring\.visible = shown; \}/);assert.match(src,/setPickupShown\(it, it\.ready\)/);assert.doesNotMatch(src,/opacity = it\.ready \? 0\.8 : 0\.18/);});
