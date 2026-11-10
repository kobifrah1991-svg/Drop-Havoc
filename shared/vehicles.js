import { collides, rayWorld, rayBox } from './physics.js';
import { PARKING } from './city.js';
// 0.16.2: parked cars along the roads (0.16.44: avenues x/z = ±38), kerb-side lane, clear of intersections. [x,y,z,yaw,kind]
// GLBs in public/models/vehicles/ (Scitedra procedural, separate doors/wheels). Sketchfab picks: see CREDITS.md.
export const VEHICLE_KINDS=['sedan','suv','hatch','pickup','van','compact','wagon','cyberpunk','concept','goblin','cartech','carpavan'];
// 0.16.12: Sketchfab CC-BY cars on the roads too; light models (cyberpunk/derby/goblin) get the most spawns.
// 0.16.16: 16 map cars (was 24) to cut lag; heavy GLBs once each.
// 0.16.44: the rusty derby car is gone; a realistic electric supercar (concept) joined. Mix of everyday cars and supercars.
// 0.16.49: mostly everyday cars now (sedan, hatchback, SUV, van, compact, wagon), a few sports/supercars among them
const SPAWN_KINDS=['sedan','hatch','concept','suv','compact','wagon','van','cartech','sedan','goblin','hatch','suv','compact','carpavan','wagon','cyberpunk'];
const H=Math.PI/2;
// 0.16.15: cars scaled up vs the player (was 4 m long toy-size).
export const CAR_SCALE=1.4;const HX=0.98*CAR_SCALE,HZ=1.95*CAR_SCALE,HY=1.05*CAR_SCALE;
export const CAR_HALF={x:HX,z:HZ}; // footprint half-size (run-over checks)
// 0.16.50 true car shapes. Which model draws each kind (public/vehicle-visuals.js uses the same map), and each model's
// measured size in the game (width, length, height in m, from the fitted GLB). Collisions now use this exact footprint,
// turned with the car (it used to be one size for every car, and an axis-aligned box: a car standing diagonally
// blocked a 5.8 m square around it).
export const CAR_MODEL={porsche:'cyberpunk',cyberpsycho:'goblin',sports:'concept',sedan:'cmp_sedan',suv:'cmp_suv',hatch:'cmp_hatchback',pickup:'carpavan',van:'cmp_minivan',derby:'cartech',compact:'cmp_compact',wagon:'cmp_wagon'};
const DIMS={cyberpunk:[2.48,6.03,1.57],concept:[2.6,5.95,1.57],goblin:[2.7,6.15,1.57],cartech:[2.6,5.88,1.63],carpavan:[2.7,6.16,1.7],
  cmp_sedan:[2.4,5.6,1.72],cmp_suv:[2.55,5.94,2.23],cmp_hatchback:[2.2,5.21,1.78],cmp_minivan:[2.35,5.94,2.27],cmp_compact:[2.25,4.76,1.92],cmp_wagon:[2.4,5.6,1.76]}; // widths without the mirrors
// 0.16.50 performance per model: top speed (m/s) and pull. Supercars ~150 km/h, everyday cars ~120 km/h (was 94 for all).
const PERF={concept:[42,30],goblin:[44,31],cyberpunk:[41,29],cartech:[37,26],carpavan:[36,25],cmp_sedan:[34,24],cmp_wagon:[34,23],cmp_hatchback:[33,24],cmp_compact:[31,23],cmp_suv:[33,22],cmp_minivan:[31,21]};
export function carPerf(kind){const p=PERF[CAR_MODEL[kind]||kind]||[DRIVE.maxF,DRIVE.accel];return {top:p[0],accel:p[1]};}
export function carDims(kind){const d=DIMS[CAR_MODEL[kind]||kind];return d?{hx:d[0]/2,hz:d[1]/2,hy:d[2]}:{hx:HX,hz:HZ,hy:HY};}
// The footprint as 4 short boxes along the car: what players, bullets and the camera bump into (a tight fit at any angle)
export const CAR_PARTS=4;
export function carParts(p,yaw,dm,out=[]){const ca=Math.cos(yaw),sa=Math.sin(yaw),seg=dm.hz/CAR_PARTS,ex=Math.abs(ca)*dm.hx+Math.abs(sa)*seg,ez=Math.abs(sa)*dm.hx+Math.abs(ca)*seg;
  for(let i=0;i<CAR_PARTS;i++){const t=-dm.hz+seg*(2*i+1),cx=p[0]-sa*t,cz=p[2]-ca*t,b=out[i]||(out[i]={vehicle:true,min:[0,0,0],max:[0,0,0]});
    b.min[0]=cx-ex;b.min[1]=0;b.min[2]=cz-ez;b.max[0]=cx+ex;b.max[1]=dm.hy*0.92;b.max[2]=cz+ez;
    b.ox=cx;b.oz=cz;b.yaw=yaw;b.hx=dm.hx;b.hz=seg;}return out;}
// separating-axis tests on the ground plane: the car's turned rectangle against a box, and against another car
function satBox(px,pz,yaw,hx,hz,o){const ca=Math.cos(yaw),sa=Math.sin(yaw),bx=(o.min[0]+o.max[0])/2-px,bz=(o.min[2]+o.max[2])/2-pz,bhx=(o.max[0]-o.min[0])/2,bhz=(o.max[2]-o.min[2])/2;
  if(Math.abs(bx)>=Math.abs(ca)*hx+Math.abs(sa)*hz+bhx||Math.abs(bz)>=Math.abs(sa)*hx+Math.abs(ca)*hz+bhz)return false;
  for(const [ax,az,h] of [[ca,-sa,hx],[-sa,-ca,hz]])if(Math.abs(bx*ax+bz*az)>=h+bhx*Math.abs(ax)+bhz*Math.abs(az))return false;return true;}
function satCars(a,b){const A=[[Math.cos(a.yaw),-Math.sin(a.yaw)],[-Math.sin(a.yaw),-Math.cos(a.yaw)]],B=[[Math.cos(b.yaw),-Math.sin(b.yaw)],[-Math.sin(b.yaw),-Math.cos(b.yaw)]],dx=b.x-a.x,dz=b.z-a.z;
  for(const [ax,az] of [...A,...B]){const ra=a.hx*Math.abs(A[0][0]*ax+A[0][1]*az)+a.hz*Math.abs(A[1][0]*ax+A[1][1]*az),rb=b.hx*Math.abs(B[0][0]*ax+B[0][1]*az)+b.hz*Math.abs(B[1][0]*ax+B[1][1]*az);if(Math.abs(dx*ax+dz*az)>=ra+rb)return false;}return true;}
// 0.16.44: half the cars wait on the driveway of every other house (like a real street); the rest stay parked along the roads.
const HOUSE_SPOTS=[];for(const s of [-1,1])for(const t of [-62,-19,19,62])HOUSE_SPOTS.push([t,90*s],[90*s,t]);
const DRIVEWAYS=HOUSE_SPOTS.filter((_,i)=>i%2===0).map(([x,z],i)=>[x+9.1,0,z,i%2?Math.PI:0]); // pad = house x+6.6..11.6, z-6..z+6
const ROADSIDE=PARKING.map(([x,z,yaw])=>[x,0,z,yaw]); // 0.16.49: in the painted bays of shared/city.js, clear of the crossings
export const VEHICLE_SPAWNS=[...ROADSIDE,...DRIVEWAYS].map((p,i)=>[p[0],p[1],p[2],p[3],SPAWN_KINDS[i%SPAWN_KINDS.length]]);
// 0.16.22: single source of truth for the car HUD prompt — exactly one of enter/exit, none while paused/dead.
export function vehiclePrompts({alive,paused,inVehicle,nearCar,touch}){
  if(!alive||paused)return {label:null,enter:false,exit:false,button:false};
  if(inVehicle)return {label:'car.exit',enter:false,exit:true,button:!!touch};
  if(nearCar)return {label:'car.enter',enter:true,exit:false,button:!!touch};
  return {label:null,enter:false,exit:false,button:false};
}
// 0.16.22 drive tuning: snappier throttle, longer input grace (input is also re-sent on every change).
// 0.16.25: vehicle HP / damage.
export const SUMMON={cooldownMs:60000,afterCombatMs:10000};
export const CAR_HP={max:1000,wreckMs:15000,crashMin:8,crashMul:2.2,bumpMs:600,blastRadius:7,blastDmg:110,occupantDmg:120};
export function hurtCar(c,dmg,now=Date.now()){
  if(!c||c.wrecked||!(dmg>0))return false;
  c.hp=Math.max(0,Math.min(CAR_HP.max,(c.hp??CAR_HP.max)-dmg));
  if(c.hp<=0){c.wrecked=true;c.wreckedUntil=now+CAR_HP.wreckMs;c.speed=0;c.input={f:0,s:0};return true;}
  return false;
}
export function repairCar(c,now=Date.now()){if(c?.wrecked&&now>=c.wreckedUntil){c.wrecked=false;c.wreckedUntil=0;c.hp=CAR_HP.max;return true;}return false;}
export const crashDamage=speed=>Math.abs(speed)>CAR_HP.crashMin?Math.round((Math.abs(speed)-CAR_HP.crashMin)*CAR_HP.crashMul+6):0;
export const carBlastDmg=(d,inCar=false)=>inCar?CAR_HP.occupantDmg:d>CAR_HP.blastRadius?0:Math.round(CAR_HP.blastDmg*(1-0.75*Math.min(1,d/CAR_HP.blastRadius)));
export const UNSTUCK={afterS:0.7,reverse:4};
export const DRIVE={accel:24,drag:0.25,brakeDrag:2.2,maxF:26,maxR:10,steer:2.1,idleMs:1500,exitGap:1.4};
// GTA-style handling: the body turns, the velocity lags behind (slip). Normal grip holds the line; the handbrake
// lets the rear go, the car steers sharper and slides (drift), and slipping costs a little speed.
export const GRIP={hold:0.86,handbrake:0.25,decay:7,decayHb:1.4,hbSteer:1.7,hbBrake:1.1,slipDrag:0.35,highSpeedSteer:0.45,drift:2.6};
export function createVehicles(map,{send,broadcast,playerById,anyCar=false,onBoom=null,selfRepair=false}){
  const solids=Object.assign([...map.boxes],{ramps:map.ramps||[]});
  const breakables=map.boxes.filter(b=>b.breakable);
  const cars=(map.noVehicles?[]:VEHICLE_SPAWNS).map((p,i)=>({id:'car-'+i,kind:p[4],p:[p[0],0,p[2]],yaw:p[3],speed:0,driver:null,input:{f:0,s:0},lastInput:0,hp:CAR_HP.max,wrecked:false,wreckedUntil:0,home:[p[0],0,p[2],p[3]]}));
  function bounds(c,p=c.p,yaw=c.yaw){const d=c.dm||(c.dm=carDims(c.kind)),x=Math.abs(Math.cos(yaw))*d.hx+Math.abs(Math.sin(yaw))*d.hz,z=Math.abs(Math.sin(yaw))*d.hx+Math.abs(Math.cos(yaw))*d.hz;return {vehicle:true,min:[p[0]-x,0,p[2]-z],max:[p[0]+x,d.hy,p[2]+z],x:p[0],z:p[2],yaw,hx:d.hx,hz:d.hz};}
  // keep a car's broad box and its 4 collision parts (in map.boxes) in step with where it is
  function place(c,b=bounds(c)){c.box.min=b.min;c.box.max=b.max;Object.assign(c.box,{x:b.x,z:b.z,yaw:b.yaw,hx:b.hx,hz:b.hz});c.parts=carParts(c.p,c.yaw,c.dm,c.parts);}
  const addCar=(c)=>{c.dm=carDims(c.kind);c.box=bounds(c);c.parts=carParts(c.p,c.yaw,c.dm);map.boxes.push(...c.parts);};
  const dropCar=(c)=>{for(const b of c.parts||[]){const k=map.boxes.indexOf(b);if(k>=0)map.boxes.splice(k,1);}};
  for(const c of cars)addCar(c);
  function state(){return cars.map(c=>({id:c.id,kind:c.kind,p:c.p,yaw:c.yaw,speed:c.speed,drift:Math.abs(c.slip||0)>GRIP.drift?1:0,driver:c.driver,passenger:c.passenger||null,owner:c.owner||null,hp:Math.round(c.hp),wrecked:!!c.wrecked}));}
  // 0.16.8: shop-bought car summoned next to its owner; 0.16.15: map cars are free to enter; only another player's summoned car is locked.
  function summon(p,kind){
    if(!p.alive||p.parachuting||p.vehicle||!VEHICLE_KINDS.includes(kind))return false;
    let c=cars.find(c=>c.owner===p.id);if(c?.driver)return false;
    // 0.16.44: at most once a minute, not straight out of a fight, and a summoned car keeps its damage (no instant repair)
    const now=Date.now();if(now-(p.summonAt||0)<SUMMON.cooldownMs||now-Math.max(p.lastFire||0,p.lastHurt||0)<SUMMON.afterCombatMs)return false;
    if(c?.wrecked&&now<c.wreckedUntil)return false;
    for(let i=0;i<12;i++){
      const a=p.yaw+Math.PI/2+i*Math.PI/6,r=i<6?5:7.5,q=[p.p[0]+Math.cos(a)*r,0,p.p[2]+Math.sin(a)*r];
      if(Math.abs(q[0])>map.bounds-4||Math.abs(q[2])>map.bounds-4)continue;
      const tmp={p:q,yaw:p.yaw,kind},b=bounds(tmp);
      // 0.16.13 safer parking: clear at body height too and in line of sight of the owner (never inside/behind a wall).
      if(hit(b,c))continue;
      if([[b.min[0],b.min[2]],[b.max[0],b.max[2]],[b.min[0],b.max[2]],[b.max[0],b.min[2]]].some(([x,z])=>collides(x,1.0,z,solids,0.5,0.1)))continue;
      {const eye=[p.p[0],p.p[1]+1.2,p.p[2]],tg=[q[0],1.2,q[2]],d=Math.hypot(tg[0]-eye[0],tg[1]-eye[1],tg[2]-eye[2]);if(d>0.01&&rayWorld(eye,tg.map((n,i)=>(n-eye[i])/d),solids,d)<d-0.05)continue;}
      if(!c){c={id:'own-'+p.id,owner:p.id,kind,p:q,yaw:p.yaw,speed:0,driver:null,input:{f:0,s:0},lastInput:0,hp:CAR_HP.max,wrecked:false,wreckedUntil:0};addCar(c);cars.push(c);}
      else{c.kind=kind;c.dm=carDims(kind);c.p=q;c.yaw=p.yaw;c.speed=0;if(c.wrecked){c.wrecked=false;c.wreckedUntil=0;c.hp=CAR_HP.max;}place(c);}
      p.summonAt=now;broadcast({t:'vehicles',vehicles:state()});return true;
    }
    return false;
  }
  function leave(p){
    // 0.16.42: passenger seat (right door) — exits right first, car keeps going.
    const pc=cars.find(c=>c.passenger===p.id);
    if(pc){const R=[Math.cos(pc.yaw),-Math.sin(pc.yaw)],w=pc.dm.hx+DRIVE.exitGap,F=[-Math.sin(pc.yaw),-Math.cos(pc.yaw)],l=pc.dm.hz+DRIVE.exitGap;
      for(const [ox,oz] of [[R[0]*w,R[1]*w],[-R[0]*w,-R[1]*w],[-F[0]*l,-F[1]*l],[F[0]*l,F[1]*l]]){const exit=[pc.p[0]+ox,0,pc.p[2]+oz];
        if(Math.abs(exit[0])>map.bounds-2||Math.abs(exit[2])>map.bounds-2||collides(...exit,map.boxes))continue;
        pc.passenger=null;p.vehicle=null;p.p=exit;p.v=[0,0,0];send(p,{t:'vehicleSeat',id:null,p:exit});broadcast({t:'vehicles',vehicles:state()});return true;}
      return false;}
    const c=cars.find(c=>c.driver===p.id);if(!c)return false;
    // 0.16.18: exit by the driver's (left) door first, then right, rear, front.
    const L=[-Math.cos(c.yaw),Math.sin(c.yaw)],F=[-Math.sin(c.yaw),-Math.cos(c.yaw)],w=c.dm.hx+DRIVE.exitGap,l=c.dm.hz+DRIVE.exitGap;
    const offs=[[L[0]*w,L[1]*w],[-L[0]*w,-L[1]*w],[-F[0]*l,-F[1]*l],[F[0]*l,F[1]*l],[L[0]*w-F[0]*l,L[1]*w-F[1]*l],[-L[0]*w-F[0]*l,-L[1]*w-F[1]*l]];
    for(const [ox,oz] of offs){
      const exit=[c.p[0]+ox,0,c.p[2]+oz];
      if(Math.abs(exit[0])>map.bounds-2||Math.abs(exit[2])>map.bounds-2||collides(...exit,map.boxes))continue;
      c.driver=null;c.input={f:0,s:0};c.speed=0;c.slip=0;p.vehicle=null;p.p=exit;p.v=[0,0,0];
      send(p,{t:'vehicleSeat',id:null,p:exit});broadcast({t:'vehicles',vehicles:state()});return true;
    }
    return false;
  }
  // 0.16.50 seat: 'driver' (E) never takes the passenger seat; 'passenger' (G, like GTA SA multiplayer) only joins a driven car
  function interact(p,{passenger=!p.bot,seat=null}={}){
    if(!p.alive||p.parachuting)return false;
    if(p.vehicle)return leave(p);
    if(seat==='driver')passenger=false;
    // 0.16.42: GTA-style — a driven car with a free right seat takes a passenger (players only, not bots).
    const pc=passenger&&cars.find(c=>c.driver&&c.driver!==p.id&&!c.passenger&&!c.wrecked&&Math.hypot(p.p[0]-c.p[0],p.p[2]-c.p[2])<4.5);
    if(pc&&!cars.some(c=>!c.driver&&!c.wrecked&&(anyCar||!c.owner||c.owner===p.id)&&Math.hypot(...p.p.map((n,i)=>n-c.p[i]))<Math.hypot(p.p[0]-pc.p[0],p.p[2]-pc.p[2]))){
      pc.passenger=p.id;p.vehicle=pc.id;p.stance=0;p.yaw=pc.yaw;p.p=[pc.p[0],0,pc.p[2]];
      send(p,{t:'vehicleSeat',id:pc.id,p:p.p,yaw:pc.yaw,seat:'passenger'});broadcast({t:'vehicles',vehicles:state()});return true;}
    if(seat==='passenger')return false; // no driven car with a free seat next to you
    const c=cars.find(c=>!c.driver&&!c.wrecked&&(anyCar||!c.owner||c.owner===p.id)&&Math.hypot(...p.p.map((n,i)=>n-c.p[i]))<4.5);
    if(!c)return false;
    const eye=[p.p[0],p.p[1]+1.6,p.p[2]],target=[c.p[0],1.6,c.p[2]],d=Math.hypot(...target.map((n,i)=>n-eye[i]));
    if(d>0.01&&rayWorld(eye,target.map((n,i)=>(n-eye[i])/d),solids,d)<d-0.05)return false;
    c.driver=p.id;c.speed=0;p.vehicle=c.id;p.stance=0;p.yaw=c.yaw;p.p=[c.p[0],0,c.p[2]];
    send(p,{t:'vehicleSeat',id:c.id,p:p.p,yaw:c.yaw});broadcast({t:'vehicles',vehicles:state()});return true;
  }
  function input(p,f,s,h=0){const c=cars.find(c=>c.driver===p.id);if(!c||!Number.isFinite(f)||!Number.isFinite(s))return;c.input={f:Math.max(-1,Math.min(1,f)),s:Math.max(-1,Math.min(1,s)),h:h?1:0};c.lastInput=Date.now();}
  function free(id){const c=cars.find(c=>c.driver===id);if(c){c.driver=null;c.input={f:0,s:0};c.speed=0;c.slip=0;}const q=cars.find(c=>c.passenger===id);if(q)q.passenger=null;}
  // Kerbs, floor slabs and painted details lower than 0.45 m are driven over; only real obstacles block.
  let hitCar=null; // 0.16.49: the car a blocked move ran into (for pushing it)
  function hit(b,self){hitCar=null;
    // 0.16.42: exact footprint overlap (was 9 sample points each padded by the player radius -> ~0.35 m phantom margin,
    // false bumps/crash damage and cars stopping with no visible contact). Window panes/chest colliders never block cars.
    const S=0.04;for(const o of solids){if(o.pane||o.chest||o.vehicle||o.breakable)continue; /* street furniture, small trees: cars smash through */if(b.min[0]+S<o.max[0]&&b.max[0]-S>o.min[0]&&b.min[2]+S<o.max[2]&&b.max[2]-S>o.min[2]&&0.45<o.max[1]&&1.85>o.min[1]&&(b.hx===undefined||satBox(b.x,b.z,b.yaw,b.hx-S,b.hz-S,o)))return true;}
    for(const r of solids.ramps||[]){const cx=(b.min[0]+b.max[0])/2,cz=(b.min[2]+b.max[2])/2,hx=(b.max[0]-b.min[0])/2,hz=(b.max[2]-b.min[2])/2,rad=Math.min(hx,hz);if(collides(cx,0.45,cz,Object.assign([],{ramps:[r]}),1.4,rad))return true;}
    for(const other of cars)if(other!==self&&b.min[0]<other.box.max[0]&&b.max[0]>other.box.min[0]&&b.min[2]<other.box.max[2]&&b.max[2]>other.box.min[2]&&(b.hx===undefined||satCars(b,other.box))){hitCar=other;return true;}
    return false;
  }
  // Apply damage to a car; wreck ejects the driver safely. Returns true on change.
  function damage(id,amount,by=null){
    const c=cars.find(c=>c.id===id);if(!c||c.wrecked)return false;
    const wreck=hurtCar(c,amount);
    if(wreck){if(c.passenger){const pp=playerById(c.passenger);if(pp&&!leave(pp)){c.passenger=null;pp.vehicle=null;send(pp,{t:'vehicleSeat',id:null,p:pp.p});}}const drv=c.driver;const p=c.driver&&playerById(c.driver);if(p&&!leave(p)){free(c.driver);p.vehicle=null;send(p,{t:'vehicleSeat',id:null,p:p.p});}broadcast({t:'carWreck',id:c.id,boom:1,at:[c.p[0],0.8,c.p[2]]});if(onBoom)onBoom(c,{at:[c.p[0],0.8,c.p[2]],driver:drv,by});blast([c.p[0],0.6,c.p[2]],CAR_HP.blastRadius,Math.round(CAR_HP.blastDmg*0.4),by);}
    broadcast({t:'vehicles',vehicles:state()});return true;
  }
  function rayCar(o,d,maxDist,skip=null){let best=null;for(const c of cars){if(c.wrecked||c.id===skip)continue;for(const pb of c.parts){const t=rayBox(o,d,pb.min,pb.max,maxDist);if(t!==null&&(!best||t<best.t))best={id:c.id,t};}}return best;}
  function blast(at,radius,dmg,by=null){for(const c of cars){if(c.wrecked)continue;const dd=Math.hypot(c.p[0]-at[0],0.6-at[1],c.p[2]-at[2])-c.dm.hx;if(dd<=radius)damage(c.id,Math.round(dmg*(1-0.6*Math.max(0,dd)/radius)),by);}}
  const touching=(a,b)=>a.box.min[0]<b.box.max[0]+0.15&&a.box.max[0]>b.box.min[0]-0.15&&a.box.min[2]<b.box.max[2]+0.15&&a.box.max[2]>b.box.min[2]-0.15;
  function tick(dt){
    const now=Date.now();
    for(const c of cars){
      if(c.passenger){const q=playerById(c.passenger);if(!q?.alive||q.vehicle!==c.id)c.passenger=null;else{const R=[Math.cos(c.yaw),-Math.sin(c.yaw)];q.p=[c.p[0]+R[0]*0.45,0,c.p[2]+R[1]*0.45];q.yaw=c.yaw;}}
      if(c.wrecked){if(selfRepair)repairCar(c,now);continue;} // 0.16.33: wrecked cars stay wrecked for a match; 0.16.44 free roam has no matches, so they are towed back after wreckMs
      if(c.push){ // 0.16.49: a shoved car slides on, turning, until friction stops it or it meets something
        const n=Math.max(1,Math.ceil(Math.hypot(c.push[0],c.push[1])*dt/0.15));
        for(let i=0;i<n;i++){const next=[c.p[0]+c.push[0]*dt/n,0,c.p[2]+c.push[1]*dt/n],yw=c.yaw+(c.spin||0)*dt/n,b=bounds(c,next,yw);
          if(Math.abs(next[0])>map.bounds-3||Math.abs(next[2])>map.bounds-3||hit(b,c)){c.push=null;c.spin=0;break;}
          c.p=next;c.yaw=yw;place(c,b);}
        if(c.push){const f=Math.exp(-2.6*dt);c.push[0]*=f;c.push[1]*=f;c.spin=(c.spin||0)*f;if(Math.hypot(c.push[0],c.push[1])<0.3){c.push=null;c.spin=0;}}
      }
      if(!c.driver)continue;const p=playerById(c.driver);if(!p?.alive){free(c.driver);continue;}
      const control=Date.now()-c.lastInput>DRIVE.idleMs?{f:0,s:0}:c.input;
      {const pf=carPerf(c.kind),rev=control.f&&Math.sign(control.f)!==Math.sign(c.speed)&&Math.abs(c.speed)>0.5,pull=rev?1.6:Math.max(0.12,1-(Math.abs(c.speed)/pf.top)**2); /* 0.16.50: pulls hard off the line, eases toward its own top speed */c.speed+=control.f*pf.accel*pull*dt;c.speed*=Math.max(0,1-(control.f?DRIVE.drag*0.4:DRIVE.brakeDrag)*dt);c.speed=Math.max(-DRIVE.maxR,Math.min(pf.top,c.speed));}
      const hb=control.h?1:0;
      if(hb)c.speed*=Math.max(0,1-GRIP.hbBrake*dt);
      // Steering: full at city speed, calmer near top speed; sharper on the handbrake
      const steerK=Math.min(1,Math.abs(c.speed)/4)*(1-GRIP.highSpeedSteer*Math.min(1,Math.abs(c.speed)/carPerf(c.kind).top))*(hb?GRIP.hbSteer:1);
      const yaw=c.yaw-control.s*DRIVE.steer*dt*steerK*Math.sign(c.speed||1);
      // Slip: when the body turns, the part of the velocity that doesn't follow becomes sideways speed, which grip removes
      c.slip=(c.slip||0)+c.speed*Math.sin(yaw-c.yaw)*(1-(hb?GRIP.handbrake:GRIP.hold));
      c.slip*=Math.exp(-(hb?GRIP.decayHb:GRIP.decay)*dt);
      if(Math.abs(c.slip)>0.5)c.speed-=Math.sign(c.speed)*Math.min(Math.abs(c.speed),Math.abs(c.slip)*GRIP.slipDrag*dt);
      const distance=c.speed*dt,side=c.slip*dt,steps=Math.max(1,Math.ceil(Math.hypot(distance,side)/0.15));
      // 0.16.3: an already-embedded car may move freely until it is clear (never stays stuck).
      const embedded=hit(bounds(c),c);
      // Steering in place is allowed whenever the turned footprint is clear, so you can turn away from a wall.
      if(yaw!==c.yaw&&(embedded||!hit(bounds(c,c.p,yaw),c))){c.yaw=yaw;place(c);}
      for(let n=0;n<steps;n++){
        const next=[c.p[0]+(-Math.sin(c.yaw)*distance+Math.cos(c.yaw)*side)/steps,0,c.p[2]+(-Math.cos(c.yaw)*distance-Math.sin(c.yaw)*side)/steps],b=bounds(c,next,c.yaw);
        let blocked=Math.abs(next[0])>map.bounds-3||Math.abs(next[2])>map.bounds-3;
        if(!blocked&&!embedded)blocked=hit(b,c);
        const other=blocked?hitCar:null;
        if(other&&!other.wrecked&&Math.abs(c.speed)>2){
          // 0.16.49 GTA-style crash: the car you hit is shoved along your direction of travel and spins a little;
          // you keep part of your speed; both cars take damage (dents and smoke on the client)
          const imp=c.speed,fx=-Math.sin(c.yaw)*Math.sign(imp),fz=-Math.cos(c.yaw)*Math.sign(imp),k=Math.abs(imp)*(other.driver?0.45:0.75);
          {const px=(other.push?.[0]||0)+fx*k,pz=(other.push?.[1]||0)+fz*k,m=Math.hypot(px,pz),cap=Math.max(3,Math.abs(imp)*0.8);other.push=m>cap?[px/m*cap,pz/m*cap]:[px,pz];}
          other.spin=Math.max(-2,Math.min(2,(other.spin||0)+((other.p[0]-c.p[0])*fz-(other.p[2]-c.p[2])*fx>0?1:-1)*Math.min(1.2,Math.abs(imp)*0.06)));
          c.speed*=0.45;c.slip=0;
          if(now-(c.lastBump||0)>CAR_HP.bumpMs){const dmg=crashDamage(Math.abs(imp)*0.8);if(dmg){c.lastBump=now;damage(c.id,Math.round(dmg*0.6));if(now-(other.lastBump||0)>CAR_HP.bumpMs){other.lastBump=now;damage(other.id,dmg,c.driver||null);}}}
          if(now-(c.hitMsgAt||0)>400){c.hitMsgAt=now;const hx=c.p[0]+fx*c.dm.hz,hz=c.p[2]+fz*c.dm.hz;broadcast({t:'carHit',hits:[[c.id,hx,hz,Math.abs(imp)],[other.id,hx,hz,Math.abs(imp)]]});} // 0.16.52: where they met, for dents and debris
          break;
        }
        if(blocked){
          // Glide along the obstacle on one axis before giving up; lose some speed rather than all of it.
          let slid=false;
          for(const alt of [[next[0],0,c.p[2]],[c.p[0],0,next[2]]]){if(Math.hypot(alt[0]-c.p[0],alt[2]-c.p[2])<1e-3)continue;const ab=bounds(c,alt,c.yaw);if(Math.abs(alt[0])<=map.bounds-3&&Math.abs(alt[2])<=map.bounds-3&&!hit(ab,c)){c.p=alt;place(c,ab);slid=true;break;}}
          // A corner pins both axes. A small yaw either way often opens one of them (door frames, roundabouts).
          if(!slid)for(const dy of [0.18,-0.18,0.4,-0.4]){const yw=c.yaw+dy*(control.s||1);const ab=bounds(c,c.p,yw);if(!hit(ab,c)){c.yaw=yw;place(c,ab);slid=true;c.unstuckN=(c.unstuckN||0)+1;break;}}
          const imp=c.speed;if(slid)c.speed*=0.92;else c.speed=0;c.slip=0;
          if(Math.abs(imp)>4&&now-(c.hitMsgAt||0)>400){c.hitMsgAt=now;const s2=Math.sign(imp)||1,hx=c.p[0]-Math.sin(c.yaw)*c.dm.hz*s2,hz=c.p[2]-Math.cos(c.yaw)*c.dm.hz*s2;broadcast({t:'carHit',hits:[[c.id,hx,hz,Math.abs(imp)*(slid?0.5:1)]]});}
          if(now-(c.lastBump||0)>CAR_HP.bumpMs){const dmg=crashDamage(slid?imp*0.5:imp);if(dmg){c.lastBump=now;
            for(const o of cars)if(o!==c&&!o.wrecked&&touching(c,o)&&now-(o.lastBump||0)>CAR_HP.bumpMs){o.lastBump=now;damage(o.id,Math.round(dmg*0.8));}
            damage(c.id,dmg);}}
          break;
        }
        c.p=next;place(c,b);
      }
      // Smashing street furniture or a small tree costs ~12% speed once per object (you feel the hit, you don't stop)
      if(Math.abs(c.speed)>3)for(const o of breakables){if(o.max[0]<c.box.min[0]||o.min[0]>c.box.max[0]||o.max[2]<c.box.min[2]||o.min[2]>c.box.max[2])continue;if((o.hitUntil||0)>now)continue;o.hitUntil=now+60000;c.speed*=0.88;}
      // 0.16.33: stronger unstuck — throttle held but car not moving for ~0.7 s: shove it toward open ground.
      if(Math.abs(control.f)>0.3&&Math.abs(c.speed)<1.2){c.stuckT=(c.stuckT||0)+dt;}else c.stuckT=Math.max(0,(c.stuckT||0)-dt*2);
      if(c.stuckT>UNSTUCK.afterS){c.stuckT=0;unstuckCar(c,control.f);}
      p.p=[c.p[0],0,c.p[2]];p.yaw=c.yaw;
    }
  }
  function unstuckCar(c,f){
    const B=map.bounds-3,F=[-Math.sin(c.yaw),-Math.cos(c.yaw)],L=[-Math.cos(c.yaw),Math.sin(c.yaw)],dir=f<0?-1:1;
    // Try: back off, slide sideways, then rings of increasing radius toward the map centre.
    const tries=[[-F[0]*dir*1.2,-F[1]*dir*1.2],[L[0]*1.5,L[1]*1.5],[-L[0]*1.5,-L[1]*1.5],[-F[0]*dir*2.5,-F[1]*dir*2.5]];
    for(const r of [3,5,8])for(let i=0;i<8;i++){const a=i*Math.PI/4;tries.push([Math.cos(a)*r,Math.sin(a)*r]);}
    for(const [ox,oz] of tries){const q=[c.p[0]+ox,0,c.p[2]+oz];if(Math.abs(q[0])>B||Math.abs(q[2])>B)continue;const b=bounds(c,q,c.yaw);if(hit(b,c))continue;
      c.p=q;place(c,b);c.speed=0;c.unstuckN=(c.unstuckN||0)+1;return true;}
    c.speed=-dir*UNSTUCK.reverse;return false;
  }
  const driving=()=>cars.some(c=>c.driver||c.push); // 0.16.49: a car still sliding after a crash keeps the fast snapshots
  // 0.16.34: fresh match = every car intact at its spawn (no leftover wreck from a previous round).
  function resetAll(){for(let i=cars.length-1;i>=0;i--){const c=cars[i];if(c.owner&&!c.home){dropCar(c);cars.splice(i,1);continue;}c.wrecked=false;c.wreckedUntil=0;c.hp=CAR_HP.max;c.speed=0;c.slip=0;c.driver=null;c.input={f:0,s:0};c.lastBump=0;c.unstuckN=0;c.passenger=null;if(c.home){c.p=[c.home[0],0,c.home[2]];c.yaw=c.home[3];}if(c.box)Object.assign(c.box,bounds(c));}}
  // A player left: their own summoned car goes with them (it was locked to them and would block the street for good)
  function removeOwned(id){const i=cars.findIndex(c=>c.owner===id);if(i<0)return;dropCar(cars[i]);cars.splice(i,1);broadcast({t:'vehicles',vehicles:state()});}
  return {removeOwned,resetAll,state,interact,input,tick,free,summon,driving,damage,rayCar,blast,unstuckCar,_cars:cars};
}
