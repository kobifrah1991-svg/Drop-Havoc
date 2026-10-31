import { collides, rayWorld } from './physics.js';
// 0.16.2: parked cars along every road (x/z = -38,0,38), kerb-side lane, clear of intersections. [x,y,z,yaw,kind]
// GLBs in public/models/vehicles/ (Scitedra procedural, separate doors/wheels). Sketchfab picks: see CREDITS.md.
export const VEHICLE_KINDS=['sports','sedan','suv','hatch','pickup','van'];
const H=Math.PI/2;
export const VEHICLE_SPAWNS=[[3.6,0,-65,0],[-3.6,0,65,Math.PI],[41.6,0,18,0],[-41.6,0,-18,Math.PI],
 [3.6,0,-20,0],[-3.6,0,20,Math.PI],[34.4,0,-60,Math.PI],[-34.4,0,60,0],
 [-20,0,3.6,H],[20,0,-3.6,-H],[60,0,41.6,-H],[-60,0,-41.6,H],[-18,0,34.4,H],[18,0,-34.4,-H]]
 .map((p,i)=>[p[0],p[1],p[2],p[3],VEHICLE_KINDS[i%VEHICLE_KINDS.length]]);
export function createVehicles(map,{send,broadcast,playerById}){
  const solids=Object.assign([...map.boxes],{ramps:map.ramps||[]});
  const cars=VEHICLE_SPAWNS.map((p,i)=>({id:'car-'+i,kind:p[4],p:[p[0],0,p[2]],yaw:p[3],speed:0,driver:null,input:{f:0,s:0},lastInput:0}));
  function bounds(c,p=c.p,yaw=c.yaw){const x=Math.abs(Math.cos(yaw))*0.98+Math.abs(Math.sin(yaw))*1.95,z=Math.abs(Math.sin(yaw))*0.98+Math.abs(Math.cos(yaw))*1.95;return {vehicle:true,min:[p[0]-x,0,p[2]-z],max:[p[0]+x,1.05,p[2]+z]};}
  for(const c of cars){c.box=bounds(c);map.boxes.push(c.box);}
  function state(){return cars.map(c=>({id:c.id,kind:c.kind,p:c.p,yaw:c.yaw,speed:c.speed,driver:c.driver}));}
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
    const c=cars.find(c=>!c.driver&&Math.hypot(...p.p.map((n,i)=>n-c.p[i]))<3.5);
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
      for(let n=0;n<steps;n++){
        const next=[c.p[0]-Math.sin(yaw)*distance/steps,0,c.p[2]-Math.cos(yaw)*distance/steps],b=bounds(c,next,yaw);
        let blocked=Math.abs(next[0])>map.bounds-3||Math.abs(next[2])>map.bounds-3;
        if(!blocked)blocked=hit(b,c);
        if(blocked){
          // Glide along the obstacle on one axis before giving up; lose some speed rather than all of it.
          let slid=false;
          for(const alt of [[next[0],0,c.p[2]],[c.p[0],0,next[2]]]){if(Math.hypot(alt[0]-c.p[0],alt[2]-c.p[2])<1e-3)continue;const ab=bounds(c,alt,c.yaw);if(Math.abs(alt[0])<=map.bounds-3&&Math.abs(alt[2])<=map.bounds-3&&!hit(ab,c)){c.p=alt;c.box.min=ab.min;c.box.max=ab.max;slid=true;break;}}
          if(slid)c.speed*=0.92;else c.speed=0;break;
        }
        c.p=next;c.yaw=yaw;c.box.min=b.min;c.box.max=b.max;
      }
      p.p=[c.p[0],0,c.p[2]];p.yaw=c.yaw;
    }
  }
  return {state,interact,input,tick,free};
}
