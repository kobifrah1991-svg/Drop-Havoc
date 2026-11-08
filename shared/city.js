// Original playable district: every marked building has a door, rooms and an accessible upper floor.
const boxes=[], ramps=[], buildings=[], pickups=[], chests=[], floorLoot=[], spawns=[], waypoints=[], props=[];
const add=(min,max,color)=>boxes.push({min,max,color});
const detail=(min,max,color)=>props.push({min,max,color});
// 0.16.44: the district grew from ±111 to ±151 m. A ring boulevard (x/z = ±118) wraps the old district, and a solid
// row of city buildings (tall towers and low blocks) stands along the outside of it as the edge of the playable city;
// the boundary wall sits hidden behind them. The far skyline (city-visuals) continues from there.
const B=151,RING=118;
add([-B-1,-1,-B-1],[B+1,0,B+1],0x56634c);
for(const [min,max] of [ [[-B-1,0,-B-1],[B+1,9,-B]], [[-B-1,0,B],[B+1,9,B+1]], [[-B-1,0,-B],[-B,9,B]], [[B,0,-B],[B+1,9,B]] ]) add(min,max,0x6c7478);
// Mini-roundabouts on the four diagonal junctions (no traffic lights there): a low grass island you can drive over
// and a solid stone obelisk in the middle.
// Roundabout size: grass island radius r, asphalt circle out to R, a 2 m sidewalk ring around it (R..R+2) that the
// straight sidewalks run into; zebra crossings sit on each arm just before the circle (ZX from the centre).
const RB={r:5,R:12,ZX:15.6};
// 0.16.44: two crossing avenues each way (x/z = ±38) instead of three: wide open blocks, a central plaza, and a big
// roundabout where the avenues meet. Two islands carry a fountain, two a bronze statue.
const CROSS=[-38,38];
const ROUNDABOUTS=[[-38,-38,'fountain'],[38,-38,'statue'],[-38,38,'statue'],[38,38,'fountain']].map(([x,z,deco])=>({p:[x,0,z],r:RB.r,R:RB.R,deco}));
const nearRoundabout=(x,z,m)=>ROUNDABOUTS.some(r=>Math.hypot(x-r.p[0],z-r.p[2])<m);
for(const c of CROSS){
  for(const [a,b] of [[-RING-5,-43],[-33,33],[43,RING+5]])detail([c-5,0.013,a],[c+5,0.023,b],0x272f35);
  detail([-RING-5,0.013,c-5],[RING+5,0.023,c+5],0x272f35);
  for(let a=-RING+3;a<RING-3;a+=9){
    if(!nearRoundabout(c,a+2,RB.R+1))detail([c-0.09,0.025,a],[c+0.09,0.03,a+4],0xd5c68f);
    if(!nearRoundabout(a+2,c,RB.R+1))detail([a,0.025,c-0.09],[a+4,0.03,c+0.09],0xd5c68f);}
}
// Ring boulevard: asphalt, centre dashes, sidewalks on both sides (inner one broken where the grid roads join)
for(const r of [-RING,RING]){
  detail([r-5,0.013,-RING-5],[r+5,0.023,RING+5],0x272f35);detail([-RING-5,0.013,r-5],[RING+5,0.023,r+5],0x272f35);
  for(let a=-RING+8;a<RING-8;a+=9){detail([r-0.09,0.025,a],[r+0.09,0.03,a+4],0xd5c68f);detail([a,0.025,r-0.09],[a+4,0.03,r+0.09],0xd5c68f);}
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
    // 0.16.33: window openings in the perimeter frames are solid (invisible pane) — no walking through them.
    const pane=(a,c)=>{b(a,c);Object.assign(boxes[boxes.length-1],{invisible:true,pane:true});};
    for(const [x0,x1] of [[-4.8,-1],[1,4.8]])pane([x0,y+0.9,-6],[x1,y+2.4,-5.65]);
    if(y===0){pane([-6,0.9,5.65],[-4,2.4,6]);pane([-1.6,0.9,5.65],[6,2.4,6]);}else pane([-6,y+0.9,5.65],[6,y+2.4,6]);
    for(const x of [-6,5.65])pane([x,y+0.9,-5.65],[x+0.35,y+2.4,5.65]);
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
  // PUBG-style loot lying on the floors of both rooms on both storeys (no crates): rolled again every match
  for(const y of [0,3.2]){
    floorLoot.push({p:[cx-3,y,cz+1.5],rare:y>0&&index%3===0,chance:0.9});
    for(const [dx,dz] of [[-4.6,-4.4],[-1.3,4.3],[1.3,4.5],[1.2,-1.0]])floorLoot.push({p:[cx+dx,y,cz+dz],chance:0.55});
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
  for(const [px,pz] of [[x1-0.3,z0+1],[x1-0.3,z1-1]]){add([px-0.15,0,pz-0.15],[px+0.15,2.7,pz+0.15],0x454e55);boxes[boxes.length-1].breakable=true;}
  detail([x0-0.6,2.7,z0+0.4],[x1,2.85,z1-0.4],0x514d46);}
const onPad=(x,z,m=1)=>HOUSES.some(h=>{const [x0,z0,x1,z1]=padOf(h);return x>x0-m&&x<x1+m&&z>z0-m&&z<z1+m;});
const PARKS=[[19,19,true],[-19,-19,true],[19,64,false],[-64,19,false],[-19,-64,false],[64,-19,false]];
for(const [x,z,rare] of PARKS){
  floorLoot.push({p:[x,0,z],rare,chance:1},{p:[x+1.5,0,z+1.5],chance:0.6});
  pickups.push({type:'heart',p:[x+3,0,z]},{type:rare?'power':'speed',p:[x-3,0,z]});waypoints.push([x,0,z]);
}
// Street lights stand on the verge just outside the 10 m carriageway, never inside a lane or a junction.
const onRoad=(x,z)=>CROSS.some(c=>Math.abs(x-c)<6.2||Math.abs(z-c)<6.2);
const nearHouse=(x,z,m=7.5)=>HOUSES.some(([hx,hz])=>Math.abs(x-hx)<m&&Math.abs(z-hz)<m);
const lamp=(x,z)=>{if(onRoad(x,z)||nearHouse(x,z)||onPad(x,z)||nearRoundabout(x,z,RB.R+3))return;add([x-0.12,0,z-0.12],[x+0.12,5,z+0.12],0x454e55);boxes[boxes.length-1].breakable=true;detail([x-0.5,4.9,z-0.4],[x+0.5,5.05,z+0.4],0xffe4a3);};
for(const c of CROSS)for(let a=-95;a<=95;a+=19){lamp(c-6.6,a+9.5);lamp(c+6.6,a);}
// ---------- 0.16.44 living street ----------
// 2 m sidewalks (12 cm kerb) on both sides of every road, stopping at the junctions where zebra crossings are
// painted; traffic lights on the junction corners; benches on the sidewalks; a playground in the two central
// parks and a fountain in each side park. Pedestrians (client only, public/pedestrians.js) walk the sidewalks.
const ROADS=CROSS,SEG=[[-111,-45],[-31,31],[45,111]];
const trafficLights=[],benches=[],playgrounds=[],fountains=[],walkways=[],crossings=[];
const SIDEWALK=0x9a9a92;
// At a roundabout the straight sidewalk stops where it meets the curved one (sqrt((R+1)^2-6^2) from the centre)
const RB_END=Math.sqrt((RB.R+1)**2-36);
const trim=(c,a,b)=>{const J=CROSS;for(const d of J){if(!nearRoundabout(c,d,1))continue;if(Math.abs(b-(d-7))<0.01)b=d-RB_END;if(Math.abs(a-(d+7))<0.01)a=d+RB_END;}return [a,b];};
for(const c of ROADS)for(const [a0,b0] of SEG)for(const sd of [-1,1]){
  const lo=c+(sd<0?-7:5),hi=c+(sd<0?-5:7),[a,b]=trim(c,a0,b0);
  add([lo,0,a],[hi,0.12,b],SIDEWALK);add([a,0,lo],[b,0.12,hi],SIDEWALK);
  // light concrete kerb stones along the road edge of the sidewalk
  const k0=sd<0?c-5.2:c+5,k1=k0+0.2;detail([k0,0,a],[k1,0.15,b],0xbbb4a3);detail([a,0,k0],[b,0.15,k1],0xbbb4a3);
}
// Curved sidewalk ring around each roundabout (drawn round by city-visuals; small invisible steps carry your feet)
for(const rb of ROUNDABOUTS)for(let k=0;k<64;k++){const t=(k+0.5)/64*Math.PI*2,x=Math.cos(t),z=Math.sin(t);
  if(Math.abs(x)*(RB.R+1)<6.2||Math.abs(z)*(RB.R+1)<6.2)continue; // the four arms (roads) stay open
  const cx=rb.p[0]+x*(RB.R+1),cz=rb.p[2]+z*(RB.R+1);add([cx-0.75,0,cz-0.75],[cx+0.75,0.12,cz+0.75],SIDEWALK);Object.assign(boxes[boxes.length-1],{invisible:true});}
for(const c of ROADS)for(const d of ROADS)for(const sx of [-1,1])for(const sz of [-1,1]){
  if(nearRoundabout(c,d,1))continue; // the ring replaces the corner squares and there are no traffic lights
  const x=c+sx*6,z=d+sz*6;add([x-1,0,z-1],[x+1,0.12,z+1],SIDEWALK);
  // traffic light on every junction corner (thin pole: solid, the rest is drawn)
  const px=c+sx*6.6,pz=d+sz*6.6;add([px-0.1,0,pz-0.1],[px+0.1,4.4,pz+0.1],0x2c3035);Object.assign(boxes[boxes.length-1],{breakable:true,light:trafficLights.length});trafficLights.push({p:[px,0,pz],j:[c,d],sx,sz});
}
// Traffic lights where each avenue meets the ring boulevard (T-junctions), with a zebra crossing on the avenue
for(const c of CROSS)for(const r of [-RING,RING])for(const [jx,jz] of [[c,r],[r,c]]){
  for(const sx of [-1,1])for(const sz of [-1,1]){const px=jx+sx*6.6,pz=jz+sz*6.6;
    add([px-0.1,0,pz-0.1],[px+0.1,4.4,pz+0.1],0x2c3035);Object.assign(boxes[boxes.length-1],{breakable:true,light:trafficLights.length});trafficLights.push({p:[px,0,pz],j:[jx,jz],sx,sz});}
  const inward=-Math.sign(jx===c?jz:jx); // the crossing sits on the avenue, on the district side of the junction
  for(let i=0;i<6;i++){const o=-4.25+i*1.7;
    if(jx===c)detail([c+o-0.28,0.026,jz+inward*7.3-1.4],[c+o+0.28,0.032,jz+inward*7.3+1.4],0xeeeeea);
    else detail([jx+inward*7.3-1.4,0.026,c+o-0.28],[jx+inward*7.3+1.4,0.032,c+o+0.28],0xeeeeea);}
}
// Zebra crossings beside each junction, across both roads, on both sides (stripes run with the traffic)
const ZEBRA=0xeeeeea;
for(const c of ROADS)for(const d of ROADS)for(const sd of [-1,1]){
  // at a roundabout the crossing moves out along the arm, just before the circle (as on real roads)
  const o1=nearRoundabout(c,d,1)?RB.ZX:5.3,o2=nearRoundabout(d,c,1)?RB.ZX:5.3;
  for(let i=0;i<6;i++){const o=-4.25+i*1.7;
    detail([c+sd*o1-(sd<0?2.8:0),0.026,d+o-0.28],[c+sd*o1+(sd>0?2.8:0),0.032,d+o+0.28],ZEBRA); // across road z=d
    detail([d+o-0.28,0.026,c+sd*o2-(sd<0?2.8:0)],[d+o+0.28,0.032,c+sd*o2+(sd>0?2.8:0)],ZEBRA); // across road x=d
  }
  crossings.push({x:c+sd*(o1+1.4),z:d,axis:'z'},{x:d,z:c+sd*(o2+1.4),axis:'x'});
}
// Walkways: the middle of every sidewalk, end to end (they meet the crossings at each junction)
for(const c of ROADS)for(const sd of [-1,1]){walkways.push({a:[c+sd*6,0.12,-109],b:[c+sd*6,0.12,109]},{a:[-109,0.12,c+sd*6],b:[109,0.12,c+sd*6]});}
// Benches on the outer edge of the sidewalks, facing the road (seat height: you can stand on them)
const bench=(x,z,yaw)=>{const along=Math.abs(Math.sin(yaw))<0.5;const hx=along?0.8:0.25,hz=along?0.25:0.8;add([x-hx,0,z-hz],[x+hx,0.48,z+hz],0x5a4632);Object.assign(boxes[boxes.length-1],{breakable:true,bench:benches.length});benches.push({p:[x,0,z],yaw});};
for(const c of ROADS)for(const [a,b] of SEG)for(const sd of [-1,1]){
  for(let t=a+6;t<b-4;t+=19){if(nearHouse(c+sd*6.7,t,8)||onPad(c+sd*6.7,t,1))continue;
    if(Math.abs(t-Math.round((t+95)/19)*19+95)<2)continue; // keep clear of lamp posts
    bench(c+sd*6.75,t+4,sd>0?-Math.PI/2:Math.PI/2);}
}
for(const [x,z,rare] of PARKS){
  if(rare){ // playground: swing set, slide (a real ramp you can run up), see-saw, sandbox, benches
    playgrounds.push({p:[x,0,z]});
    for(const dx of [-4.6,-1.4]){add([x+dx-0.07,0,z-4.75],[x+dx+0.07,2.4,z-4.45],0xc0392b);boxes[boxes.length-1].breakable=true;}
    add([x+2.5,0,z-5.2],[x+3.7,1.6,z-4.0],0x2980b9);boxes[boxes.length-1].breakable=true;   // slide tower (climb it)
    ramps.push({min:[x+3.7,0,z-5.0],max:[x+6.9,1.6,z-4.2],axis:'x',up:-1}); // the slide
    for(const [bx,bz,yaw] of [[x-5.4,z+1.6,Math.PI/2],[x+5.6,z+1.6,-Math.PI/2]])bench(bx,bz,yaw);
  }else{ // fountain with a low basin wall, and benches around it
    fountains.push({p:[x,0,z+4.6]});
    const fx=x,fz=z+4.6,R=1.7,fb=boxes.length;
    add([fx-R,0,fz-R],[fx+R,0.55,fz-R+0.3],0xbbb4a3);add([fx-R,0,fz+R-0.3],[fx+R,0.55,fz+R],0xbbb4a3);
    add([fx-R,0,fz-R+0.3],[fx-R+0.3,0.55,fz+R-0.3],0xbbb4a3);add([fx+R-0.3,0,fz-R+0.3],[fx+R,0.55,fz+R-0.3],0xbbb4a3);
    add([fx-0.25,0,fz-0.25],[fx+0.25,1.4,fz+0.25],0xbbb4a3);
    for(let i=fb;i<boxes.length;i++)boxes[i].breakable=true; // cars plough through the basin
    for(const [bx,bz,yaw] of [[fx-3.6,fz,Math.PI/2],[fx+3.6,fz,-Math.PI/2]])bench(bx,bz,yaw);
  }
}
// ---------- 0.16.44 ring boulevard, city edge, roundabouts, natural trees ----------
let seed=9071;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
// Ring sidewalks: inner (district side) with gaps where the three grid roads join, outer one unbroken
for(const sd of [-1,1]){
  const inLo=sd<0?-RING+5:RING-7,inHi=inLo+2,outLo=sd<0?-RING-7:RING+5,outHi=outLo+2;
  const gaps=[[-RING+5,-45],[-31,31],[45,RING-5]];
  for(const [a,b] of gaps){add([inLo,0,a],[inHi,0.12,b],SIDEWALK);add([a,0,inLo],[b,0.12,inHi],SIDEWALK);}
  add([outLo,0,-RING-7],[outHi,0.12,RING+7],SIDEWALK);add([-RING-5,0,outLo],[RING+5,0.12,outHi],SIDEWALK);
}
for(const r of [-RING,RING])for(let a=-RING+10;a<=RING-10;a+=19){if(!ROADS.some(c=>Math.abs(a-c)<8)){lamp(r+(r<0?-6.6:6.6),a);lamp(a,r+(r<0?-6.6:6.6));}}
// The city edge: one continuous row of solid buildings outside the ring (you can't enter or walk through them).
// Widths and heights vary like a real street front: low shops and walk-ups between office and residential towers.
// Each one is an invisible collision box drawn by city-visuals with a real building model fitted to it.
const edgeBuildings=[];
const FRONT=RING+7.5,BACK=B;
const edge=(a0,a1,side,axis)=>{ // a0..a1 along the street, side = -1 / +1
  const lo=side<0?-BACK:FRONT,hi=side<0?-FRONT:BACK,tall=rnd()<0.32,h=tall?34+rnd()*44:9+rnd()*9;
  const depth=tall?BACK-FRONT:10+rnd()*8,lo2=side<0?-FRONT-depth:FRONT,hi2=side<0?-FRONT:FRONT+depth;
  const min=axis==='z'?[a0,0,lo2]:[lo2,0,a0],max=axis==='z'?[a1,h,hi2]:[hi2,h,a1];
  add(min,max,0x7a7f86);Object.assign(boxes[boxes.length-1],{invisible:true,edge:edgeBuildings.length});
  edgeBuildings.push({min,max,kind:tall?(rnd()<0.5?'tower':'residential'):['tenement','loft','brownstone'][Math.floor(rnd()*3)]});
  if(depth<BACK-FRONT){const mn=axis==='z'?[a0,0,side<0?-BACK:FRONT+depth]:[side<0?-BACK:FRONT+depth,0,a0],mx=axis==='z'?[a1,h+8+rnd()*20,side<0?-FRONT-depth:BACK]:[side<0?-FRONT-depth:BACK,h+8+rnd()*20,a1];
    add(mn,mx,0x7a7f86);Object.assign(boxes[boxes.length-1],{invisible:true,edge:edgeBuildings.length});edgeBuildings.push({min:mn,max:mx,kind:rnd()<0.5?'tower':'residential'});}
};
for(const side of [-1,1]){
  for(let a=-BACK;a<BACK;){const w=Math.min(BACK-a,10+rnd()*14);edge(a,a+w,side,'z');a+=w;}             // north / south rows (corners included)
  for(let a=-FRONT;a<FRONT;){const w=Math.min(FRONT-a,10+rnd()*14);edge(a,a+w,side,'x');a+=w;}           // east / west rows
}
// Roundabout islands (drawn by city-visuals): a fountain basin or a statue on a stone plinth. The basin rim and the
// plinth are solid; the grass around them is low enough to drive over.
const solidRing=(x,z,R,h)=>{for(let k=0;k<16;k++){const t=k/16*Math.PI*2,cx=x+Math.cos(t)*R,cz=z+Math.sin(t)*R;add([cx-0.45,0,cz-0.45],[cx+0.45,h,cz+0.45],0xbbb4a3);Object.assign(boxes[boxes.length-1],{invisible:true});}};
for(const r of ROUNDABOUTS){
  if(r.deco==='fountain')solidRing(r.p[0],r.p[2],3.1,0.6);
  add([r.p[0]-0.9,0,r.p[2]-0.9],[r.p[0]+0.9,r.deco==='statue'?2.2:1.2,r.p[2]+0.9],0xbbb4a3);Object.assign(boxes[boxes.length-1],{invisible:true});
}
// Central plaza where the middle roads used to cross: a paved circle with a large fountain and benches around it
const PLAZA={p:[0,0,0],R:10,basin:3.6};
solidRing(0,0,PLAZA.basin,0.6);add([-0.9,0,-0.9],[0.9,1.4,0.9],0xbbb4a3);Object.assign(boxes[boxes.length-1],{invisible:true});
for(let k=0;k<6;k++){const t=k/6*Math.PI*2+Math.PI/6;bench(Math.cos(t)*7.4,Math.sin(t)*7.4,Math.abs(Math.cos(t))>0.5?(Math.cos(t)>0?-Math.PI/2:Math.PI/2):(Math.sin(t)>0?Math.PI:0));}
// Trees grow where a gardener would put them, not on a grid: a few clumps per lawn plus scattered singles,
// each at least 4.5 m from the next, off roads, sidewalks, driveways and loot spots.
const treeSpots=[];
const okTree=(x,z)=>Math.abs(x)<RING-9&&Math.abs(z)<RING-9&&!ROADS.some(c=>Math.abs(x-c)<8.5||Math.abs(z-c)<8.5)&&!nearHouse(x,z,10.5)&&!onPad(x,z,3)
  &&!PARKS.some(([px,pz])=>Math.hypot(x-px,z-pz)<7.5)&&Math.hypot(x,z)>PLAZA.R+2&&!treeSpots.some(([tx,tz])=>Math.hypot(x-tx,z-tz)<4.5);
for(let k=0;k<14;k++){const cx=(rnd()*2-1)*(RING-12),cz=(rnd()*2-1)*(RING-12),n=2+Math.floor(rnd()*4);
  for(let i=0;i<n*3&&n>0;i++){const a=rnd()*Math.PI*2,d=rnd()*7,x=cx+Math.cos(a)*d,z=cz+Math.sin(a)*d;if(okTree(x,z)){treeSpots.push([x,z]);if(treeSpots.length%n===0)break;}}}
for(let i=0;i<300&&treeSpots.length<54;i++){const x=(rnd()*2-1)*(RING-10),z=(rnd()*2-1)*(RING-10);if(okTree(x,z))treeSpots.push([x,z]);}
for(const [x,z] of treeSpots.slice(0,54)){ // perf budget: 54 trees (test/release-01620)
  add([x-0.35,0,z-0.35],[x+0.35,3.8,z+0.35],0x71543b);Object.assign(boxes[boxes.length-1],{breakable:true,tree:props.filter(q=>q.tree).length});
  props.push({tree:true,p:[x,4.8,z],color:0x3f6547});
}
// 0.16.1: loot chests are solid (matches chest-visuals 1.24x0.84x0.62) so players can't stand inside them.
// 0.16.43: no loot crates any more (items lie on the floor), so no crate colliders either.
boxes.ramps=ramps;boxes.pads=[];boxes.decorations=props;boxes.city=true;
boxes.street={trafficLights,benches,playgrounds,fountains,roundabouts:ROUNDABOUTS,plaza:PLAZA};
boxes.edgeBuildings=edgeBuildings;
boxes.bounds=B;boxes.dropBounds=RING-8; // parachutes land inside the ring, never on the edge roofs
export const CITY={id:'city',roads:CROSS,ring:RING,plaza:PLAZA,boxes,ramps,pads:[],pickups,chests,floorLoot,trafficLights,benches,playgrounds,fountains,walkways,crossings,spawns,waypoints,buildings,roundabouts:ROUNDABOUTS,edgeBuildings,bounds:B,dropBounds:RING-8};
