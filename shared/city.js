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
let index=0;
for(const x of [-76,-19,19,76])for(const z of [-76,-19,19,76])house(x,z,index++);
for(const x of [-56,56])for(const z of [-56,0,56]){
  chests.push({id:`park-${x}-${z}`,p:[x,0,z],rare:z===0});
  pickups.push({type:'heart',p:[x+3,0,z]},{type:z===0?'power':'speed',p:[x-3,0,z]});waypoints.push([x,0,z]);
}
// Street lights stand on the verge just outside the 10 m carriageway, never inside a lane or a junction.
const onRoad=(x,z)=>[-38,0,38].some(c=>Math.abs(x-c)<6.2||Math.abs(z-c)<6.2);
const nearHouse=(x,z)=>[-76,-19,19,76].some(hx=>[-76,-19,19,76].some(hz=>Math.abs(x-hx)<7.5&&Math.abs(z-hz)<7.5));
const lamp=(x,z)=>{if(onRoad(x,z)||nearHouse(x,z))return;add([x-0.12,0,z-0.12],[x+0.12,5,z+0.12],0x454e55);detail([x-0.5,4.9,z-0.4],[x+0.5,5.05,z+0.4],0xffe4a3);};
for(const c of [-38,0,38])for(let a=-95;a<=95;a+=19){lamp(c-6.6,a+9.5);lamp(c+6.6,a);}
for(const x of [-99,-57,57,99])for(const z of [-99,-57,57,99]){
  add([x-0.35,0,z-0.35],[x+0.35,3.8,z+0.35],0x71543b);
  props.push({tree:true,p:[x,4.8,z],color:0x3f6547});
}
boxes.ramps=ramps;boxes.pads=[];boxes.decorations=props;boxes.city=true;
boxes.bounds=111;
export const CITY={id:'city',boxes,ramps,pads:[],pickups,chests,spawns,waypoints,buildings,bounds:111};
