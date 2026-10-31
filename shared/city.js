// Original playable district: every marked building has a door, rooms and an accessible upper floor.
const boxes=[], ramps=[], buildings=[], pickups=[], chests=[], spawns=[], waypoints=[], props=[];
const add=(min,max,color)=>boxes.push({min,max,color});
const detail=(min,max,color)=>props.push({min,max,color});
add([-112,-1,-112],[112,0,112],0x56634c);
for(const [min,max] of [ [[-112,0,-112],[112,9,-111]], [[-112,0,111],[112,9,112]], [[-112,0,-111],[-111,9,111]], [[111,0,-111],[112,9,111]] ]) add(min,max,0x6c7478);
for(const c of [-38,0,38]){
  for(const [a,b] of [[-110,-43],[-33,-5],[5,33],[43,110]])detail([c-5,0.013,a],[c+5,0.023,b],0x272f35);
  detail([-110,0.013,c-5],[110,0.023,c+5],0x272f35);
  for(let a=-100;a<110;a+=9){detail([c-0.09,0.025,a],[c+0.09,0.03,a+4],0xd5c68f);detail([a,0.025,c-0.09],[a+4,0.03,c+0.09],0xd5c68f);}
}
function house(cx,cz,index){
  const paint=[0x9a8872,0x7c9290,0xa1796b,0x8f96a1][index%4];
  const b=(a,c,col=paint)=>add([a[0]+cx,a[1],a[2]+cz],[c[0]+cx,c[1],c[2]+cz],col);
  buildings.push({id:index,center:[cx,0,cz],door:[cx,0,cz-6],upper:[cx-2,3.2,cz]});
  b([-6,-0.01,-6],[6,0,6],0x776c60);boxes[boxes.length-1].invisible=true;
  detail([cx-5.65,0.03,cz-5.65],[cx+5.65,0.035,cz+5.65],0x776c60);
  // Front: a 2 m door plus two windows. Back and side windows are real holes.
  for(const y of [0,3.2]){
    b([-6,y,-6],[-4.8,y+3.2,-5.65]);b([4.8,y,-6],[6,y+3.2,-5.65]);
    for(const [x0,x1] of [[-4.8,-1],[1,4.8]]){
      b([x0,y,-6],[x1,y+0.9,-5.65]);b([x0,y+2.4,-6],[x1,y+3.2,-5.65]);
      b([(x0+x1)/2-0.07,y+0.9,-6],[(x0+x1)/2+0.07,y+2.4,-5.65]);
    }
    b([-1,y+2.6,-6],[1,y+3.2,-5.65]);
    if(y===0){b([-6,y,5.65],[-4,y+0.9,6]);b([-1.6,y,5.65],[6,y+0.9,6]);b([-4,y+2.5,5.65],[-1.6,y+3.2,6]);}
    else b([-6,y,5.65],[6,y+0.9,6]); b([-6,y+2.4,5.65],[6,y+3.2,6]);
    for(const x of [-6,-1,4.8]) b([x,y+0.9,5.65],[x+1.2,y+2.4,6]);
    for(const x of [-6,5.65]){
      b([x,y,-5.65],[x+0.35,y+0.9,5.65]);b([x,y+2.4,-5.65],[x+0.35,y+3.2,5.65]);
      for(const z of [-5.65,-0.6,4.6])b([x,y+0.9,z],[x+0.35,y+2.4,z+1.05]);
    }
    // Two connected rooms per floor, with a wide internal door.
    b([-0.15,y,-3.7],[0.15,y+3.2,-2.2],0xbbb4a3);
    b([-0.15,y,0.1],[0.15,y+3.2,5.65],0xbbb4a3);
    b([-0.15,y+2.5,-2.2],[0.15,y+3.2,0.1],0xbbb4a3);
    b([-5,y,1.8],[-4.2,y+0.65,3.1],0x514d46); // low furniture, usable cover
  }
  // Upper slab leaves the stairwell clear. Stairs are real steps, not a decorative solid block.
  b([-5.65,3,-5.65],[2.7,3.2,5.65],0x776c60);
  b([2.7,3,4.1],[5.65,3.2,5.65],0x776c60);
  for(let s=0;s<16;s++)b([3,-0.01,-4+s*0.5],[5.5,(s+1)*0.2,-3.5+s*0.5],0x80807a);
  // 0.16.13: safety railing on the open stair side and around the upper stairwell (stairs stay clear).
  for(let s=3;s<16;s++)b([2.88,(s+1)*0.2,-4+s*0.5],[3,(s+1)*0.2+1,-3.5+s*0.5],0x3a3f44);
  b([2.58,3.2,-5.65],[2.7,4.2,4.1],0x3a3f44);
  // No roof access advertised: roof has full collision and does not contain loot.
  b([-6.1,6.4,-6.1],[6.1,6.65,6.1],0x535d64);
  for(const y of [0,3.2]){
    chests.push({id:`house-${index}-${y}`,p:[cx-3,y,cz+1.5],rare:y>0&&index%3===0});
    pickups.push({type:y?'armor':'ammo',p:[cx+1.5,y,cz-3]});
    if(index%4===0)pickups.push({type:y?'power':'speed',p:[cx-3,y,cz-2.7]});
  }
  spawns.push([cx-3,0,cz-8]);
  waypoints.push([cx,0,cz-8],[cx,0,cz-3],[cx-3,0,cz-1],[cx+2,0,cz-1],[cx+4.2,0,cz-4.8],[cx+4.2,3.2,cz+4.7],[cx-3,3.2,cz-1]);
}
// Map polish 2026-10-31: even ring of 16 houses on the outer blocks (one per road block side, equal gaps),
// with the inner blocks as a central park and each side's inner half as a side park of the same footprint.
const HOUSES=[];
for(const s of [-1,1])for(const t of [-62,-19,19,62])HOUSES.push([t,90*s],[90*s,t]);
let index=0;
for(const [x,z] of HOUSES)house(x,z,index++);
// Driveway + carport beside every house (east side, away from the north-facing door path): 5x12 m concrete pad, flush.
const padOf=([x,z])=>[x+6.6,z-6,x+11.6,z+6];
for(const h of HOUSES){const [x0,z0,x1,z1]=padOf(h);
  detail([x0,0.012,z0],[x1,0.03,z1],0xbbb4a3);
  for(const [px,pz] of [[x1-0.3,z0+1],[x1-0.3,z1-1]])add([px-0.15,0,pz-0.15],[px+0.15,2.7,pz+0.15],0x454e55);
  detail([x0-0.6,2.7,z0+0.4],[x1,2.85,z1-0.4],0x514d46);}
const onPad=(x,z,m=1)=>HOUSES.some(h=>{const [x0,z0,x1,z1]=padOf(h);return x>x0-m&&x<x1+m&&z>z0-m&&z<z1+m;});
const PARKS=[[19,19,true],[-19,-19,true],[19,64,false],[-64,19,false],[-19,-64,false],[64,-19,false]];
for(const [x,z,rare] of PARKS){
  chests.push({id:`park-${x}-${z}`,p:[x,0,z],rare});
  pickups.push({type:'heart',p:[x+3,0,z]},{type:rare?'power':'speed',p:[x-3,0,z]});waypoints.push([x,0,z]);
}
// Street lights stand on the verge just outside the 10 m carriageway, never inside a lane or a junction.
const onRoad=(x,z)=>[-38,0,38].some(c=>Math.abs(x-c)<6.2||Math.abs(z-c)<6.2);
const nearHouse=(x,z,m=7.5)=>HOUSES.some(([hx,hz])=>Math.abs(x-hx)<m&&Math.abs(z-hz)<m);
const lamp=(x,z)=>{if(onRoad(x,z)||nearHouse(x,z)||onPad(x,z))return;add([x-0.12,0,z-0.12],[x+0.12,5,z+0.12],0x454e55);detail([x-0.5,4.9,z-0.4],[x+0.5,5.05,z+0.4],0xffe4a3);};
for(const c of [-38,0,38])for(let a=-95;a<=95;a+=19){lamp(c-6.6,a+9.5);lamp(c+6.6,a);}
let treeN=0;
// Trees on an even checker grid inside lawns only: off roads, clear of houses and loot spots.
for(let x=-104;x<=104;x+=13)for(let z=-104;z<=104;z+=13){
  if(((x+z)/13)%2)continue;
  if([-38,0,38].some(c=>Math.abs(x-c)<8||Math.abs(z-c)<8)||nearHouse(x,z,10.5)||onPad(x,z,3)||PARKS.some(([px,pz])=>Math.hypot(x-px,z-pz)<6))continue;
  if((treeN++)%3===2)continue; // 0.16.16: every 3rd tree dropped (~1/3 fewer) for perf
  add([x-0.35,0,z-0.35],[x+0.35,3.8,z+0.35],0x71543b);
  props.push({tree:true,p:[x,4.8,z],color:0x3f6547});
}
// 0.16.1: loot chests are solid (matches chest-visuals 1.24x0.84x0.62) so players can't stand inside them.
for(const c of chests){add([c.p[0]-0.62,c.p[1],c.p[2]-0.42],[c.p[0]+0.62,c.p[1]+0.62,c.p[2]+0.42],0x83562e);Object.assign(boxes[boxes.length-1],{invisible:true,chest:c.id});}
boxes.ramps=ramps;boxes.pads=[];boxes.decorations=props;boxes.city=true;
boxes.bounds=111;
export const CITY={id:'city',boxes,ramps,pads:[],pickups,chests,spawns,waypoints,buildings,bounds:111};
