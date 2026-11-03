import test from 'node:test';import assert from 'node:assert/strict';
const { MAPS } = await import('../shared/map.js');
const { WEAPONS } = await import('../shared/weapons.js');
const { collides } = await import('../shared/physics.js');
const APP=(await import('../shared/app-version.js')).APP_VERSION;
test('version >= 0.16.37',()=>assert.ok(APP>='0.16.37'));
for(const id of ['neon','canyon','harbor'])test('small map '+id+': weapon stash + M16, supply crates, 5 fighters, no doors/vehicles',()=>{
 const m=MAPS[id];assert.equal(m.fighters,5);assert.equal(m.noVehicles,true);assert.ok(!m.doors);
 const g=m.pickups.filter(p=>p.type.startsWith('gun:'));assert.ok(g.length>=12,id+' guns '+g.length);assert.ok(g.some(p=>p.type==='gun:m16'));
 for(const p of g){assert.ok(WEAPONS[p.type.slice(4)]);assert.equal(collides(p.p[0],p.p[1]+0.05,p.p[2],m.boxes),null,id+' gun in wall '+p.p);}
 assert.ok(m.chests.length>=8);for(const c of m.chests)assert.equal(collides(c.p[0],c.p[1]+0.05,c.p[2],m.boxes),null,id+' crate in wall '+c.id);
 assert.ok(m.pickups.filter(p=>p.type==='ammo').length>=6);});
test('city (large) unchanged: no fighters override',()=>assert.equal(MAPS.city.fighters,undefined));
