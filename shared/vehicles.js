import { collides, rayWorld } from './physics.js';
// 0.16.2: parked cars along every road (x/z = -38,0,38), kerb-side lane, clear of intersections. [x,y,z,yaw,kind]
// GLBs in public/models/vehicles/ (Scitedra procedural, separate doors/wheels). Sketchfab picks: see CREDITS.md.
export const VEHICLE_KINDS=['sports','sedan','suv','hatch','pickup','van','cyberpunk','derby','goblin','porsche','cyberpsycho','cartech','carpavan'];
// 0.16.12: Sketchfab CC-BY cars on the roads too; light models (cyberpunk/derby/goblin) get the most spawns.
// 0.16.16: 16 map cars (was 24) to cut lag; heavy GLBs once each.
const SPAWN_KINDS=['sports','cyberpunk','sedan','derby','suv','goblin','hatch','cartech','cyberpunk','derby','goblin','carpavan','cyberpsycho','cyberpunk','derby','goblin'];
const H=Math.PI/2;
// 0.16.15: cars scaled up vs the player (was 4 m long toy-size).
export const CAR_SCALE=1.4;const HX=0.98*CAR_SCALE,HZ=1.95*CAR_SCALE,HY=1.05*CAR_SCALE;
export const VEHICLE_SPAWNS=[[3.6,0,-65,0],[-3.6,0,65,Math.PI],[41.6,0,18,0],[-41.6,0,-18,Math.PI],
 [3.6,0,-20,0],[-3.6,0,20,Math.PI],[34.4,0,-60,Math.PI],[-34.4,0,60,0],
 [-20,0,3.6,H],[20,0,-3.6,-H],[60,0,41.6,-H],[-60,0,-41.6,H],[-18,0,34.4,H],[18,0,-34.4,-H],
 [3.6,0,48,0],[-3.6,0,-48,Math.PI],[41.6,0,-50,0],[-41.6,0,50,Math.PI],[50,0,3.6,-H],[-50,0,-3.6,H],[-34.4,0,-8,0],[34.4,0,8,Math.PI],[-8,0,41.6,H],[8,0,-41.6,-H]]
 .filter((p,i)=>i%3!==2).map((p,i)=>[p[0],p[1],p[2],p[3],SPAWN_KINDS[i%SPAWN_KINDS.length]]);
export function createVehicles(map,{send,broadcast,playerById,anyCar=false}){
  const solids=Object.assign([...map.boxes],{ramps:map.ramps||[]});
  const cars=VEHICLE_SPAWNS.map((p,i)=>({id:'car-'+i,kind:p[4],p:[p[0],0,p[2]],yaw:p[3],speed:0,driver:null,input:{f:0,s:0},lastInput:0}));
  function bounds(c,p=c.p,yaw=c.yaw){const x=Math.abs(Math.cos(yaw))*HX+Math.abs(Math.sin(yaw))*HZ,z=Math.abs(Math.sin(yaw))*HX+Math.abs(Math.cos(yaw))*HZ;return {vehicle:true,min:[p[0]-x,0,p[2]-z],max:[p[0]+x,HY,p[2]+z]};}
  for(const c of cars){c.box=bounds(c);map.boxes.push(c.box);}
  function state(){return cars.map(c=>({id:c.id,kind:c.kind,p:c.p,yaw:c.yaw,speed:c.speed,driver:c.driver,owner:c.owner||null}));}
  // 0.16.8: shop-bought car summoned next to its owner; 0.16.15: map cars are free to enter; only another player's summoned car is locked.
  function summon(p,kind){
    if(!p.alive||p.parachuting||p.vehicle||!VEHICLE_KINDS.includes(kind))return false;
    let c=cars.find(c=>c.owner===p.id);if(c?.driver)return false;
    for(let i=0;i<12;i++){
      const a=p.yaw+Math.PI/2+i*Math.PI/6,r=i<6?5:7.5,q=[p.p[0]+Math.cos(a)*r,0,p.p[2]+Math.sin(a)*r];
      if(Math.abs(q[0])>map.bounds-4||Math.abs(q[2])>map.bounds-4)continue;
      const tmp={p:q,yaw:p.yaw},b=bounds(tmp);
      // 0.16.13 safer parking: clear at body height too and in line of sight of the owner (never inside/behind a wall).
      if(hit(b,c))continue;
      if([[b.min[0],b.min[2]],[b.max[0],b.max[2]],[b.min[0],b.max[2]],[b.max[0],b.min[2]]].some(([x,z])=>collides(x,1.0,z,solids,0.5,0.1)))continue;
      {const eye=[p.p[0],p.p[1]+1.2,p.p[2]],tg=[q[0],1.2,q[2]],d=Math.hypot(tg[0]-eye[0],tg[1]-eye[1],tg[2]-eye[2]);if(d>0.01&&rayWorld(eye,tg.map((n,i)=>(n-eye[i])/d),solids,d)<d-0.05)continue;}
      if(!c){c={id:'own-'+p.id,owner:p.id,kind,p:q,yaw:p.yaw,speed:0,driver:null,input:{f:0,s:0},lastInput:0};c.box=b;map.boxes.push(b);cars.push(c);}
      else{c.kind=kind;c.p=q;c.yaw=p.yaw;c.speed=0;c.box.min=b.min;c.box.max=b.max;}
      broadcast({t:'vehicles',vehicles:state()});return true;
    }
    return false;
  }
  function leave(p){
    const c=cars.find(c=>c.driver===p.id);if(!c)return false;
    for(let i=0;i<8;i++){
      const a=c.yaw+i*Math.PI/4,exit=[c.p[0]+Math.cos(a)*2.8,0,c.p[2]+Math.sin(a)*2.8];
      if(Math.abs(exit[0])>map.bounds-2||Math.abs(exit[2])>map.bounds-2||collides(...exit,map.boxes))continue;
      c.driver=null;c.input={f:0,s:0};c.speed=0;p.vehicle=null;p.p=exit;p.v=[0,0,0];
      send(p,{t:'vehicleSeat',id:null,p:exit});broadcast({t:'vehicles',vehicles:state()});return true;
    }
    return false;
  }
  function interact(p){
    if(!p.alive||p.parachuting)return false;
    if(p.vehicle)return leave(p);
    const c=cars.find(c=>!c.driver&&(anyCar||!c.owner||c.owner===p.id)&&Math.hypot(...p.p.map((n,i)=>n-c.p[i]))<4.5);
    if(!c)return false;
    const eye=[p.p[0],p.p[1]+1.6,p.p[2]],target=[c.p[0],1.6,c.p[2]],d=Math.hypot(...target.map((n,i)=>n-eye[i]));
    if(d>0.01&&rayWorld(eye,target.map((n,i)=>(n-eye[i])/d),solids,d)<d-0.05)return false;
    c.driver=p.id;c.speed=0;p.vehicle=c.id;p.stance=0;p.yaw=c.yaw;p.p=[c.p[0],0,c.p[2]];
    send(p,{t:'vehicleSeat',id:c.id,p:p.p,yaw:c.yaw});broadcast({t:'vehicles',vehicles:state()});return true;
  }
  function input(p,f,s){const c=cars.find(c=>c.driver===p.id);if(!c||!Number.isFinite(f)||!Number.isFinite(s))return;c.input={f:Math.max(-1,Math.min(1,f)),s:Math.max(-1,Math.min(1,s))};c.lastInput=Date.now();}
  function free(id){const c=cars.find(c=>c.driver===id);if(c){c.driver=null;c.input={f:0,s:0};c.speed=0;}}
  // Kerbs, floor slabs and painted details lower than 0.45 m are driven over; only real obstacles block.
  function hit(b,self){
    for(const x of [b.min[0],(b.min[0]+b.max[0])/2,b.max[0]])for(const z of [b.min[2],(b.min[2]+b.max[2])/2,b.max[2]])if(collides(x,0.45,z,solids,1.4))return true;
    for(const other of cars)if(other!==self&&b.min[0]<other.box.max[0]&&b.max[0]>other.box.min[0]&&b.min[2]<other.box.max[2]&&b.max[2]>other.box.min[2])return true;
    return false;
  }
  function tick(dt){
    for(const c of cars){
      if(!c.driver)continue;const p=playerById(c.driver);if(!p?.alive){free(c.driver);continue;}
      const control=Date.now()-c.lastInput>350?{f:0,s:0}:c.input;
      c.speed+=control.f*14*dt;c.speed*=Math.max(0,1-(control.f?0.5:3)*dt);c.speed=Math.max(-9,Math.min(23,c.speed));
      const yaw=c.yaw-control.s*1.5*dt*Math.min(1,Math.abs(c.speed)/5)*Math.sign(c.speed||1);
      const distance=c.speed*dt,steps=Math.max(1,Math.ceil(Math.abs(distance)/0.15));
      // 0.16.3: an already-embedded car may move freely until it is clear (never stays stuck).
      const embedded=hit(bounds(c),c);
      // Steering in place is allowed whenever the turned footprint is clear, so you can turn away from a wall.
      if(yaw!==c.yaw&&(embedded||!hit(bounds(c,c.p,yaw),c))){c.yaw=yaw;const b0=bounds(c);c.box.min=b0.min;c.box.max=b0.max;}
      for(let n=0;n<steps;n++){
        const next=[c.p[0]-Math.sin(c.yaw)*distance/steps,0,c.p[2]-Math.cos(c.yaw)*distance/steps],b=bounds(c,next,c.yaw);
        let blocked=Math.abs(next[0])>map.bounds-3||Math.abs(next[2])>map.bounds-3;
        if(!blocked&&!embedded)blocked=hit(b,c);
        if(blocked){
          // Glide along the obstacle on one axis before giving up; lose some speed rather than all of it.
          let slid=false;
          for(const alt of [[next[0],0,c.p[2]],[c.p[0],0,next[2]]]){if(Math.hypot(alt[0]-c.p[0],alt[2]-c.p[2])<1e-3)continue;const ab=bounds(c,alt,c.yaw);if(Math.abs(alt[0])<=map.bounds-3&&Math.abs(alt[2])<=map.bounds-3&&!hit(ab,c)){c.p=alt;c.box.min=ab.min;c.box.max=ab.max;slid=true;break;}}
          if(slid)c.speed*=0.92;else c.speed=0;break;
        }
        c.p=next;c.box.min=b.min;c.box.max=b.max;
      }
      p.p=[c.p[0],0,c.p[2]];p.yaw=c.yaw;
    }
  }
  return {state,interact,input,tick,free,summon};
}
