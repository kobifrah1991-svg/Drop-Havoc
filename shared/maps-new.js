// 0.16.21: brand-new Drop Havoc maps. Same format as map.js: axis-aligned boxes, ramps, jump pads, pickups.
function builder(){const boxes=[],ramps=[],pads=[];return{boxes,ramps,pads,
 add:(min,max,color)=>boxes.push({min,max,color}),ramp:(min,max,axis,up)=>ramps.push({min,max,axis,up}),pad:(x,z,y=0)=>pads.push({x,y,z,r:1.1})};}
function finish(id,b,bounds,pickups,spawns,waypoints){b.boxes.ramps=b.ramps;b.boxes.pads=b.pads;b.boxes.bounds=bounds;
 return{id,boxes:b.boxes,ramps:b.ramps,pads:b.pads,pickups,spawns,waypoints,bounds,chests:[],noVehicles:true,fighters:5};} // 0.16.37: small maps = 4 bots + you
// 0.16.37: weapon stashes (ground guns respawn ~10 s), extra ammo, and lootable supply crates on small maps
const guns=(list)=>list.map(([w,p])=>({type:'gun:'+w,p}));
function stock(m,gunList,ammo,chests){m.pickups.push(...guns(gunList),...ammo.map(p=>({type:'ammo',p})));m.chests=chests;return m;}
function frame(b,S,h,floor,wall){b.add([-S,-1,-S],[S,0,S],floor);b.add([-S,0,-S],[S,h,-S+1],wall);b.add([-S,0,S-1],[S,h,S],wall);b.add([-S,0,-S+1],[-S+1,h,S-1],wall);b.add([S-1,0,-S+1],[S,h,S-1],wall);}

// Desert Canyon: sand floor, two raised mesas joined by a bridge, ramps up each mesa, rock cover in the gulch.
export const CANYON_MAP=stock((()=>{const b=builder(),S=40;frame(b,S,9,0xc9a46a,0x9a6b43);
 b.add([-34,0,-34],[-16,4,-10],0xb07a4c);b.add([16,0,10],[34,4,34],0xb07a4c);           // mesas
 b.ramp([-16,0,-24],[-8,4,-18],0,-1);b.ramp([8,0,18],[16,4,24],0,1);                     // ramps onto them
 b.add([-16,3.6,-12],[16,4,-10],0x7a5536);b.add([14,3.6,-12],[16,4,10],0x7a5536);         // L-bridge
 b.add([-4,0,-4],[4,6,4],0x8c6040);b.ramp([-4,0,4],[4,6,12],2,-1);                       // central butte
 for(const [x,z,h] of [[-24,14,2],[-12,24,2.6],[22,-20,2.2],[6,-28,1.8],[-28,2,1.6],[28,-2,1.6],[0,22,2.4],[-6,-16,1.4]])b.add([x-1.4,0,z-1.4],[x+1.4,h,z+1.4],0x8f6a48);
 b.pad(-20,20);b.pad(20,-20);
 return finish('canyon',b,S,[
  {type:'rpg',p:[0,6,0]},{type:'rpg',p:[-25,4,-22]},{type:'heart',p:[25,4,22]},{type:'heart',p:[-34,0,34]},{type:'heart',p:[34,0,-34]},
  {type:'armor',p:[0,4,-11]},{type:'armor',p:[15,4,0]},{type:'speed',p:[-20,0,22]},{type:'speed',p:[20,0,-22]},
  {type:'power',p:[-10,0,10]},{type:'power',p:[10,0,-30]},{type:'ammo',p:[30,0,0]},{type:'ammo',p:[-30,0,6]}],
  [[-30,0,30],[30,0,-30],[0,0,30],[0,0,-30],[-30,0,0],[30,0,0],[-24,4,-22],[24,4,22],[-12,0,12],[12,0,-12]],
  [[-30,0,30],[30,0,-30],[0,0,28],[0,0,-28],[-28,0,0],[28,0,0],[0,6,0],[-24,4,-22],[24,4,22],[0,4,-11],[15,4,0],[-12,0,12],[12,0,-12]]);})(),
 [// desert weapon cache on the west mesa + east mesa, and guns in the gulch
  ...['m16','m4','rifle','smg','shotgun','sniper','pistol'].map((w,i)=>[w,[-32+i*2,4,-14]]),
  ...['m16','shotgun','smg','rifle','pistol'].map((w,i)=>[w,[20+i*2.5,4,14]]),
  ['m16',[0,0,-8]],['shotgun',[-10,0,0]],['smg',[10,0,0]],['rifle',[-20,0,30]],['m4',[20,0,-30]],['sniper',[0,6,2.5]],['pistol',[-30,0,-4]],['shotgun',[30,0,4]]],
 [[-28,4,-14],[24,4,14],[0,0,-34],[0,0,34],[-34,0,10],[34,0,-10]],
 [{id:'canyon-mesa-w',p:[-20,4,-30],rare:true},{id:'canyon-mesa-e',p:[20,4,30],rare:true},{id:'canyon-butte',p:[-2,6,-2],rare:true},
  {id:'canyon-nw',p:[-34,0,30]},{id:'canyon-se',p:[34,0,-30]},{id:'canyon-gulch-n',p:[-8,0,20]},{id:'canyon-gulch-s',p:[8,0,-20]},{id:'canyon-w',p:[-34,0,0]}]);

// Frozen Harbor: icy docks over a frozen bay, stacked shipping containers to climb, a crane tower with an RPG on top.
export const HARBOR_MAP=stock((()=>{const b=builder(),S=36;frame(b,S,7,0xdfe8ee,0x5b6b78);
 b.add([-36,0,-36],[36,0.4,-20],0x6d5a45);b.add([-36,0,20],[36,0.4,36],0x6d5a45);            // wooden docks
 const C=[0xb5402e,0x2e6db5,0x3c8f4a,0xd49a2a];let i=0;
 for(const [x,z,lv] of [[-24,-28,2],[-12,-28,1],[0,-28,2],[14,-28,1],[26,-28,2],[-26,28,1],[-12,28,2],[2,28,1],[16,28,2],[28,28,1],[-18,0,1],[18,0,1],[0,10,1],[0,-10,1]]){
  for(let l=0;l<lv;l++)b.add([x-3,0.4+l*2.6,z-1.2],[x+3,0.4+(l+1)*2.6,z+1.2],C[(i++)%4]);}
 for(const [x,z] of [[-24,-24.5],[0,-24.5],[26,-24.5],[-12,24.5],[16,24.5]])b.ramp([x-1.2,0.4,z-2.3],[x+1.2,3,z],2,-1);// ramps onto stacks
 b.add([-2,0,-2],[2,12,2],0xe0b020);b.add([-6,11.6,-1],[6,12,1],0xe0b020);                // crane tower + jib
 for(let s=0;s<5;s++)b.add([2+s*1.2,0,-1],[3.2+s*1.2,2.2+s*2.2,1],0x8a8f94);                 // climbing steps up the crane
 b.pad(-28,0);b.pad(28,0);
 return finish('harbor',b,S,[
  {type:'rpg',p:[0,12,0]},{type:'rpg',p:[-24,5.6,-28]},{type:'heart',p:[26,5.6,-28]},{type:'heart',p:[-12,5.6,28]},
  {type:'armor',p:[-18,3,0]},{type:'armor',p:[18,3,0]},{type:'speed',p:[-28,0,6]},{type:'speed',p:[28,0,-6]},
  {type:'power',p:[0,3,10]},{type:'power',p:[0,3,-10]},{type:'ammo',p:[-30,0.4,-22]},{type:'ammo',p:[30,0.4,22]}],
  [[-30,0,0],[30,0,0],[0,0,16],[0,0,-16],[-30,0.4,-33],[30,0.4,33],[-10,0,14],[10,0,-14],[-24,0,-14],[24,0,14]],
  [[-30,0,0],[30,0,0],[0,0,16],[0,0,-16],[-20,0,-14],[20,0,14],[0,12,0],[-24,5.6,-28],[16,5.6,28],[-18,3,0],[18,3,0]]);})(),
 [// dockside weapon racks on both docks + guns around the bay
  ...['m16','m4','rifle','smg','shotgun','sniper','pistol'].map((w,i)=>[w,[-18+i*2,0.4,-22]]),
  ...['m16','shotgun','smg','rifle','m4','pistol'].map((w,i)=>[w,[6+i*2,0.4,21]]),
  ['m16',[-26,0,0]],['shotgun',[26,0,0]],['smg',[-8,0,6]],['rifle',[8,0,-6]],['sniper',[0,12,1.5]]],
 [[-6,0.4,-21],[20,0.4,21],[-30,0,12],[30,0,-12]],
 [{id:'harbor-crane',p:[-1,12,0.3],rare:true},{id:'harbor-dock-n',p:[-32,0.4,-32],rare:true},{id:'harbor-dock-s',p:[32,0.4,32],rare:true},
  {id:'harbor-w',p:[-30,0,-8]},{id:'harbor-e',p:[30,0,8]},{id:'harbor-bay-1',p:[-8,0,-14]},{id:'harbor-bay-2',p:[8,0,14]},{id:'harbor-dock-ne',p:[32,0.4,-32]}]);
