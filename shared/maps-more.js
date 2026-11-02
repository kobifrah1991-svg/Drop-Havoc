// 0.16.42: six more small maps (10 total). Same box/ramp/pad format as maps-new.js. Each mixes fights, parkour (step
// blocks you can jump up, ramps, jump pads, rooftops), cover/buildings (yards, alleys, half-built houses, warehouses),
// supply crates, weapons and power-ups (heart/armor/speed/power/rpg). Seeded layouts so every client builds the same map.
import { collides } from './physics.js';
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function make(id,{S,seed,floor,wall,cover,roof,accent,houses,walls,parkour,pads,rpgTop,extra}){
  const boxes=[],ramps=[],padL=[],R=rng(seed),add=(min,max,color)=>boxes.push({min,max,color});
  add([-S,-1,-S],[S,0,S],floor);const h=8;
  add([-S,0,-S],[S,h,-S+1],wall);add([-S,0,S-1],[S,h,S],wall);add([-S,0,-S+1],[-S+1,h,S-1],wall);add([S-1,0,-S+1],[S,h,S-1],wall);
  const tops=[];
  // Half-built houses / warehouses: three walls + roof, open side faces the middle, ramp up the back to the roof.
  for(const [x,z,w,d,H] of houses){
    const x0=x-w/2,x1=x+w/2,z0=z-d/2,z1=z+d/2,t=0.35,open=Math.abs(x)>Math.abs(z)?(x>0?'w':'e'):(z>0?'n':'s');
    if(open!=='n')add([x0,0,z0],[x1,H,z0+t],wall);if(open!=='s')add([x0,0,z1-t],[x1,H,z1],wall);
    if(open!=='w')add([x0,0,z0],[x0+t,H,z1],wall);if(open!=='e')add([x1-t,0,z0],[x1,H,z1],wall);
    // window gap in the open side: a low sill wall to hide behind
    if(open==='n')add([x0+1,0,z0],[x1-1,1.1,z0+t],cover);if(open==='s')add([x0+1,0,z1-t],[x1-1,1.1,z1],cover);
    if(open==='w')add([x0,0,z0+1],[x0+t,1.1,z1-1],cover);if(open==='e')add([x1-t,0,z0+1],[x1,1.1,z1-1],cover);
    add([x0,H,z0],[x1,H+0.3,z1],roof);tops.push([x,H+0.3,z]);
    // stair blocks up one outside wall (jumpable 0.8 m steps) = parkour to the roof
    const sx=open==='e'?x0-1.4:x1+0.2;for(let k=1;k*0.8<H+0.3;k++){const zz=z0+k*1.1;if(zz>z1-1)break;add([sx,0,zz-1.1],[sx+1.2,Math.min(H+0.3,k*0.8),zz],accent);}
  }
  // Cover walls / alleys (low and tall), random orientation
  for(let i=0;i<walls;i++){const x=(R()*2-1)*(S-6),z=(R()*2-1)*(S-6),L=2+R()*4,tall=R()<0.4,hz=R()<0.5;
    const H=tall?2.6:1.15;if(hz)add([x-L/2,0,z-0.3],[x+L/2,H,z+0.3],cover);else add([x-0.3,0,z-L/2],[x+0.3,H,z+L/2],cover);}
  // Parkour runs: rising step blocks then a tower top with loot
  for(let i=0;i<parkour;i++){const a=i/parkour*Math.PI*2+R(),r=S*0.55,x=Math.cos(a)*r,z=Math.sin(a)*r,dx=-Math.sin(a),dz=Math.cos(a);
    for(let k=0;k<5;k++){const cx=x+dx*k*2.2,cz=z+dz*k*2.2,H=0.8*(k+1);add([cx-0.9,0,cz-0.9],[cx+0.9,H,cz+0.9],accent);if(k===4)tops.push([cx,H,cz]);}}
  for(const [x,z] of pads)padL.push({x,y:0,z,r:1.1});
  // ramp up to a side ledge (a sniper perch) on every map
  add([S-4,0,-3],[S-1,2.4,3],accent);ramps.push({min:[S-10,0,-2],max:[S-4,2.4,2],axis:'x',up:1});tops.push([S-2.5,2.4,0]);
  if(extra)extra({add,ramps,S,R,wall,cover,roof,accent,tops});
  const map={id,boxes,ramps,pads:padL,bounds:S,noVehicles:true,fighters:5,chests:[],pickups:[],spawns:[],waypoints:[]};
  boxes.ramps=ramps;boxes.pads=padL;boxes.bounds=S;
  const free=(x,z)=>Math.abs(x)<S-2.5&&Math.abs(z)<S-2.5&&!collides(x,0.01,z,boxes,1.8,0.6);
  // Spawns/waypoints: ground spots on rings, always inside the frame and clear of every box.
  for(const r of [S*0.8,S*0.5,S*0.25])for(let i=0;i<8;i++){const a=i/8*Math.PI*2+r,x=Math.cos(a)*r,z=Math.sin(a)*r;if(free(x,z)){map.waypoints.push([x,0,z]);if(map.spawns.length<12&&r>S*0.3)map.spawns.push([x,0,z]);}}
  if(!map.spawns.length)map.spawns.push([0,0,0]);
  const ground=(i)=>map.waypoints[i%map.waypoints.length];
  const T=['heart','armor','speed','power','heart','armor','ammo','ammo'];
  T.forEach((type,i)=>map.pickups.push({type,p:ground(i*3+1).slice()}));
  tops.forEach((p,i)=>map.pickups.push({type:i%2?'armor':'rpg',p:p.slice()}));
  if(rpgTop)map.pickups.push({type:'rpg',p:tops[0].slice()});
  ['m16','m4','rifle','smg','shotgun','sniper','pistol','shotgun','smg','m16'].forEach((w,i)=>map.pickups.push({type:'gun:'+w,p:ground(i*2).slice()}));
  map.chests=[...tops.map((p,i)=>({id:id+'-top'+i,p:[p[0]+0.6,p[1],p[2]+0.6],rare:true})),...[5,9,13,17].map((k,i)=>{const g=ground(k);return{id:id+'-g'+i,p:[g[0]+1.2,0,g[2]]};}).filter(c=>free(c.p[0],c.p[2]))];
  return map;
}
// Jungle Ruins: green overgrown temple blocks, many mid walls, step pyramids.
export const JUNGLE_MAP=make('jungle',{S:34,seed:11,floor:0x3f6b34,wall:0x6f6a55,cover:0x4f7a3e,roof:0x585545,accent:0x8a8466,
  houses:[[-20,-20,8,8,3.4],[20,20,8,8,3.4],[20,-20,7,9,3]],walls:16,parkour:3,pads:[[-24,22],[24,-6]],
  extra:({add,tops})=>{for(let k=0;k<4;k++)add([-6+k*1.2,k*1.1,-6+k*1.2],[6-k*1.2,(k+1)*1.1,6-k*1.2],0x7a7458);tops.push([0,4.4,0]);}});
// Rooftops: tight city block, tall warehouses, alleys, catwalks between roofs.
export const ROOFTOP_MAP=make('rooftop',{S:32,seed:23,floor:0x4a4d52,wall:0x7b6f66,cover:0x5a5f66,roof:0x3d4046,accent:0xb0703a,
  houses:[[-18,-18,9,9,4],[18,-18,9,9,4],[-18,18,9,9,4],[18,18,9,9,4]],walls:12,parkour:2,pads:[[0,-22],[0,22]],rpgTop:true,
  extra:({add})=>{add([-13.5,4,-19],[13.5,4.3,-17],0x777777);add([-13.5,4,17],[13.5,4.3,19],0x777777);}});
// Military Base: sandbag walls, hangars, watch towers.
export const BASE_MAP=make('base',{S:38,seed:37,floor:0x6d6a4a,wall:0x55604a,cover:0xa4936a,roof:0x4a523f,accent:0x7c7a60,
  houses:[[-22,0,10,14,4.5],[22,0,10,14,4.5]],walls:22,parkour:4,pads:[[0,-28],[0,28],[-28,-28]],
  extra:({add,tops})=>{for(const [x,z] of [[-30,-30],[30,30],[30,-30]]){add([x-1.5,0,z-1.5],[x+1.5,5,z+1.5],0x55604a);tops.push([x,5,z]);for(let k=1;k<6;k++)add([x+1.5,0,z-1.5+k*0.0],[x+2.7,k*0.8,z-1.5+0.9],0x7c7a60);}}});
// Snow Village: cabins, fences, snow mounds you can climb.
export const SNOW_MAP=make('snow',{S:34,seed:41,floor:0xe8eef3,wall:0x7a5a3e,cover:0xc9d4dc,roof:0x9b3b2e,accent:0xa8c4d6,
  houses:[[-18,-14,7,7,3],[16,-18,7,7,3],[-14,18,7,7,3],[18,14,7,7,3]],walls:14,parkour:3,pads:[[0,12]],
  extra:({ramps})=>{ramps.push({min:[-6,0,-26],max:[6,2.5,-20],axis:'z',up:1});ramps.push({min:[-6,0,20],max:[6,2.5,26],axis:'z',up:-1});}});
// Factory: big warehouse hall, conveyors (low walls), stacked crates and catwalk.
export const FACTORY_MAP=make('factory',{S:30,seed:53,floor:0x5c5c5c,wall:0x8a5a2e,cover:0x3a6f8a,roof:0x444444,accent:0xd0a030,
  houses:[[0,-16,16,8,4.2]],walls:18,parkour:4,pads:[[-20,20],[20,20]],rpgTop:true,
  extra:({add})=>{for(let i=-2;i<=2;i++)add([i*5-1,0,4],[i*5+1,1.0,12],0x3a6f8a);}});
// Desert Town: adobe houses, courtyards, market stalls, a tall minaret-style tower.
export const TOWN_MAP=make('town',{S:36,seed:67,floor:0xd8bb84,wall:0xc29a66,cover:0xa87a4a,roof:0xb08458,accent:0x9a6b43,
  houses:[[-22,-10,8,10,3.2],[-22,12,8,8,3.2],[22,-12,8,8,3.2],[22,10,8,10,3.2],[0,-24,10,6,3.2]],walls:14,parkour:3,pads:[[0,20]],
  extra:({add,tops})=>{add([-1.5,0,-1.5],[1.5,7,1.5],0xc29a66);for(let k=1;k<9;k++)add([1.5,0,-1.5+(k-1)*0.0],[2.7,k*0.8,-0.3],0x9a6b43);tops.push([0,7,0]);}});
