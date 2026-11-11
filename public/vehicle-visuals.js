import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { onPassengerSide } from '../shared/vehicles.js';
const kindCache=new Map();
// 0.16.13 LOD: phones/tablets swap the two heaviest Sketchfab cars (28-37 MB) for the light cyberpunk model.
const HEAVY=new Set(['porsche','cyberpsycho']),LOW=typeof matchMedia!=='undefined'&&matchMedia('(pointer:coarse)').matches;
// 0.16.15: old procedural blocky kinds now use real Sketchfab models.
// 0.16.49: everyday cars are the Comrade1280 generic passenger pack (CC BY 4.0, see CREDITS.md)
const REAL={porsche:'cyberpunk',cyberpsycho:'goblin',sports:'concept',sedan:'cmp_sedan',suv:'cmp_suv',hatch:'cmp_hatchback',pickup:'carpavan',van:'cmp_minivan',derby:'cartech',compact:'cmp_compact',wagon:'cmp_wagon'}; // same as CAR_MODEL in shared/vehicles.js (test/cars-01622 keeps them equal)
const S=1.4;
// 0.16.49 real car paint: the GLBs came with chrome-like paint (metalness 1: it mirrors the sky in patches, so the colour
// looks blotchy) and see-through glass over an empty cabin (the Concept's panoramic roof showed the red body inside).
// Paint becomes clear-coated metallic paint in an everyday colour picked per car; glass becomes dark tinted glass.
const DIRT=new THREE.Color(0x2b2622);
const PAINTS=[0x1b1d20,0xb9bdc1,0xe6e6e3,0x22385a,0x6e1416,0x3c4147,0x56606b,0x8a8f93];
const CMP=/^Body(_\d+)?$/;
const PAINTED={concept:/^Paint 1/i,goblin:/^car_body$/i,carpavan:/^body$/i,cartech:/^body$/i,cmp_sedan:CMP,cmp_suv:CMP,cmp_hatchback:CMP,cmp_minivan:CMP,cmp_compact:CMP,cmp_wagon:CMP};
const CMPG=/^Glass(_\d+)?$/;
const TINTED={concept:/^Glass$/i,cmp_sedan:CMPG,cmp_suv:CMPG,cmp_hatchback:CMPG,cmp_minivan:CMPG,cmp_compact:CMPG,cmp_wagon:CMPG}; // no cabin inside: dark glass
function realPaint(g,kind,id){
  const n=[...String(id)].reduce((a,ch)=>a*31+ch.charCodeAt(0)>>>0,7),color=PAINTS[n%PAINTS.length];
  g.traverse(o=>{if(!o.isMesh)return;const one=m=>{if(!m)return m;
    if(PAINTED[kind]?.test(m.name)){const p=new THREE.MeshPhysicalMaterial({color,map:m.map||null,metalness:0.45,roughness:0.32,clearcoat:1,clearcoatRoughness:0.08,envMapIntensity:0.9});p.name=m.name;return p;}
    if(TINTED[kind]?.test(m.name)){const p=new THREE.MeshStandardMaterial({color:0x0d1114,metalness:0.6,roughness:0.06,transparent:true,opacity:0.86,depthWrite:false});p.name=m.name;return p;}
    if(/^Paint 2/i.test(m.name)){m.metalness=0.3;m.roughness=0.4;m.color.setHex(0x16181b);}
    return m;};
    o.material=Array.isArray(o.material)?o.material.map(one):one(o.material);});
}
const FIT=new WeakMap(); // loaded model -> how it is turned, scaled and set on the ground
// 0.16.16: per-GLB length multipliers (Sketchfab imports have their own unit scale / ground planes); plus a height floor so no car renders toy-sized.
const KSCALE={porsche:1.15,cyberpsycho:1.1,cyberpunk:1.05,concept:1.05,goblin:1.05,cartech:1.05,carpavan:1.1,cmp_sedan:1,cmp_suv:1.06,cmp_hatchback:0.93,cmp_minivan:1.06,cmp_compact:0.85,cmp_wagon:1}; // the real lengths differ: a compact is shorter than an SUV
// 0.16.22: models whose nose points to -Z natively (verified from wheel names / bonnet height profile). Others face +Z.
export const FRONT_NEG_Z=new Set(['goblin','cyberpunk','porsche']);
// Yaw that turns a Sketchfab car so its nose points to game forward (-Z).
export function modelYaw(kind,sx,sz){kind=REAL[kind]||kind;return (sx>sz?Math.PI/2:0)+(FRONT_NEG_Z.has(kind)?0:Math.PI);}
// 0.16.22: drop baked ground-shadow planes and opaque "clearcoat" shells (rendered as big grey patches / a flat grey car).
export function stripProxyMeshes(g){const kill=[];g.traverse(o=>{if(o.isMesh&&(/shadow|ground|floor|plane/i.test(o.name)||[].concat(o.material).some(m=>/shadow|clearcoat/i.test(m?.name||''))))kill.push(o);});for(const o of kill)o.parent?.remove(o);return kill.length;}
// 0.16.44: glass with real transmission makes three.js draw the whole scene a second time every frame (too slow for
// phones); turn it into ordinary see-through tinted glass. Iridescence (a colour shimmer) is dropped for the same reason.
function cheapGlass(root){root.traverse(o=>{if(!o.isMesh)return;for(const m of [].concat(o.material)){if(!m)continue;
  if(m.transmission>0){m.transmission=0;m.transparent=true;m.opacity=Math.min(m.opacity??1,0.35);m.depthWrite=false;m.roughness=Math.min(m.roughness??0.1,0.1);m.metalness=0.2;}
  if(m.iridescence>0)m.iridescence=0;m.needsUpdate=true;}});return root;}
function loadKind(kind){kind=REAL[kind]||kind;if(LOW&&HEAVY.has(kind))kind='cyberpunk';if(!kindCache.has(kind))kindCache.set(kind,Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/libs/meshopt_decoder.module.js')]).then(([{GLTFLoader},{MeshoptDecoder}])=>new Promise(r=>new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(window.ARENA_MODELS?.['vehicles/'+kind+'.glb']||'models/vehicles/'+kind+'.glb',g=>r(cheapGlass(g.scene)),undefined,()=>r(null)))).catch(()=>null));return kindCache.get(kind);}
// Simple seated driver shown during the GTA-style enter/exit (door swings open, driver ducks in, door shuts).
function makeDriver(){const g=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0xc99a76,roughness:0.7}),shirt=new THREE.MeshStandardMaterial({color:0x2d3640,roughness:0.8});
 const torso=new THREE.Mesh(new THREE.BoxGeometry(0.44,0.6,0.26),shirt);torso.position.y=0.95;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(0.13,12,10),skin);head.position.y=1.38;g.add(head);
 const legs=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.7,0.24),shirt);legs.position.y=0.35;legs.name='legs';g.add(legs);return g;}
const SEAT=[-0.6,0.2,0.1],DOOR=[-2.1,0,0.1];
// 0.16.4: GTA-style enter/exit with the driver's own selected character (any skin): walk up to the driver door,
// reach for the handle, pull the door open, swing in and sit, door shuts. Exit plays it in reverse.
const ENTER_T=1.7,_v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3(),_q1=new THREE.Quaternion(),_q2=new THREE.Quaternion();
const sm=(a,b,t)=>{const k=Math.min(1,Math.max(0,(t-a)/(b-a)));return k*k*(3-2*k);};
// Swing a bone so its child points at a world target (works on Mixamo and Rocketbox rigs alike), blended by w.
function aimBone(bone,child,target,w){if(!bone||!child||w<=0)return;bone.updateMatrixWorld(true);
 const a=bone.getWorldPosition(_v1),cur=child.getWorldPosition(_v2).sub(a).normalize(),want=_v3.copy(target).sub(a).normalize();
 _q1.setFromUnitVectors(cur,want);bone.getWorldQuaternion(_q2);const wq=_q1.multiply(_q2);
 bone.parent.getWorldQuaternion(_q2).invert();const local=_q2.multiply(wq);bone.quaternion.slerp(local,w);bone.updateMatrixWorld(true);}
const HANDLE=[-1.4,1.2,0.35],START=[-3.4,0,1.4],STAND=[-2.0,0,0.7],SEAT_P=[-0.6,-0.3,0.1];
function poseDriver(car,ch,t,dt){const c=ch.char,root=ch.root;
 // positions in car space
 const walk=sm(0,0.55,t),slide=sm(0.85,1.35,t);
 const x=START[0]+(STAND[0]-START[0])*walk+(SEAT_P[0]-STAND[0])*slide, z=START[2]+(STAND[2]-START[2])*walk+(SEAT_P[2]-STAND[2])*slide;
 root.position.set(x,SEAT_P[1]*slide,z);
 const face=Math.atan2(-(STAND[0]-START[0]),-(STAND[2]-START[2]));root.rotation.y=t<0.55?face:face+(-Math.PI/2-face)*sm(0.45,0.8,t)+(0-(-Math.PI/2))*slide;
 if(c.soldier&&c.mixer){const w=t<0.55?[0,1,0]:[1,0,0];['Idle','Walk','Run'].forEach((n,i)=>{const a=c.actions[n];if(a)a.setEffectiveWeight(w[i]);});if(c.actions.Walk)c.actions.Walk.timeScale=1;c.mixer.update(dt);
  const b=c.bones;car.root.updateMatrixWorld(true);
  const reach=sm(0.4,0.6,t)*(1-sm(0.85,1.0,t));
  if(reach>0){const h=_hw.set(...HANDLE);car.root.localToWorld(h);aimBone(b.rArm,b.rFore,h,reach);aimBone(b.rFore,b.rHand,h,reach);}
  const sit=sm(0.9,1.35,t);if(sit>0){const fwd=_fw.set(0,0,-1).applyQuaternion(root.getWorldQuaternion(_q2)).normalize();
   for(const [th,ca,ft] of [[b.rThigh,b.rCalf,b.rFoot],[b.lThigh,b.lCalf,b.lFoot]]){if(!th||!ca)continue;const k=th.getWorldPosition(_hw.clone()).addScaledVector(fwd,1);aimBone(th,ca,k,sit*0.9);if(ft){const f=ca.getWorldPosition(_hw.clone()).add(_fw2.set(0,-1,0)).addScaledVector(fwd,0.3);aimBone(ca,ft,f,sit*0.9);}}}}
 const crouch=sm(0.85,1.2,t)*(1-sm(1.2,1.45,t));if(ch.char.body)ch.char.body.rotation.x=-0.35*crouch;}
const _hw=new THREE.Vector3(),_fw=new THREE.Vector3(),_fw2=new THREE.Vector3();
export function createVehicleVisuals(scene,boxes,opts={}){
 const models=new Map(),palette=[0x285777,0x813d43,0x626e47,0xc6c9c4];
 function sync(list){for(const c of list){let m=models.get(c.id);
  if(!m){
   const root=new THREE.Group(),wheels=[],color=palette[Number(c.id.split('-').pop())%palette.length];
   const paint=new THREE.MeshStandardMaterial({color,metalness:0.48,roughness:0.3});
   const dark=new THREE.MeshStandardMaterial({color:0x20252a,roughness:0.82}),chrome=new THREE.MeshStandardMaterial({color:0xaeb7bc,metalness:0.9,roughness:0.27});
   const glass=new THREE.MeshStandardMaterial({color:0x82b2c6,transparent:true,opacity:0.38,depthWrite:false,metalness:0.35,roughness:0.14});
   const box=(size,p,mat,round=0.04)=>{const b=new THREE.Mesh(new RoundedBoxGeometry(...size,2,round),mat);b.position.set(...p);b.castShadow=true;b.receiveShadow=true;root.add(b);return b;};
   // Modern crossover: low wide body, raked glasshouse, flush LED light bars, big alloy wheels.
   const black=new THREE.MeshStandardMaterial({color:0x111417,metalness:0.6,roughness:0.35});
   box([1.86,0.5,3.9],[0,0.66,0],paint,0.18);                    // main body
   box([1.8,0.18,1.15],[0,0.97,-1.28],paint,0.1);                  // bonnet
   box([1.8,0.2,0.75],[0,0.97,1.45],paint,0.1);                    // boot deck
   box([1.9,0.2,3.96],[0,0.38,0],black,0.06);                      // dark lower cladding
   const cabin=box([1.6,0.5,2.05],[0,1.25,0.12],black,0.16);       // tinted glass cabin
   box([1.5,0.06,1.55],[0,1.52,0.16],paint,0.03);                  // roof panel
   const ws=box([1.52,0.05,0.82],[0,1.22,-0.98],glass,0.02);ws.rotation.x=0.62;
   const rw=box([1.5,0.05,0.62],[0,1.24,1.2],glass,0.02);rw.rotation.x=-0.75;
   for(const x of [-0.81,0.81]){
    box([0.02,0.34,1.7],[x,1.26,0.12],glass,0.005);
    box([0.04,0.04,0.16],[x*1.13,1.08,-0.55],black,0.01);          // slim mirrors
    for(const z of [-1.28,1.3]){
     const wheel=new THREE.Group();wheel.position.set(x*1.12,0.4,z);
     const tire=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.3,24),dark);tire.rotation.z=Math.PI/2;wheel.add(tire);
     const rim=new THREE.Mesh(new THREE.CylinderGeometry(0.29,0.29,0.31,10),chrome);rim.rotation.z=Math.PI/2;wheel.add(rim);
     for(let k=0;k<5;k++){const spoke=new THREE.Mesh(new THREE.BoxGeometry(0.32,0.05,0.04),black);spoke.position.x=x>0?0.16:-0.16;spoke.rotation.x=k*Math.PI*2/5;wheel.add(spoke);}
     root.add(wheel);wheels.push(wheel);
    }
   }
   void cabin;
   const headlight=new THREE.MeshBasicMaterial({color:0xf2f7ff}),rearLight=new THREE.MeshBasicMaterial({color:0xff2a3a});
   box([1.6,0.06,0.03],[0,0.86,-1.96],headlight,0.01);             // full-width LED strip
   box([1.7,0.07,0.03],[0,0.88,1.96],rearLight,0.01);
   box([1.0,0.2,0.03],[0,0.58,-1.97],black,0.02);                  // grille
   const kind=c.kind,kn=REAL[kind]||kind;
   // 0.16.2: swap the procedural body for the road car GLB once loaded (doors/wheels are separate nodes).
   root.visible=!kind;if(kind)loadKind(kind).then(src=>{root.visible=true;if(!src)return;const g=src.clone(true);
    for(const ch of [...root.children])root.remove(ch);wheels.length=0;
    const sf=!g.getObjectByName('door_L')&&!g.getObjectByName('wheel_0');if(sf)stripProxyMeshes(g);
    if(!sf){const bb=new THREE.Box3().setFromObject(g),len=bb.max.x-bb.min.x,sc=4.0*S/len;g.scale.setScalar(sc);g.rotation.y=Math.PI/2;}
    else{// 0.16.12: Sketchfab car — longest horizontal axis to ~4 m along z, centred, wheels on the ground.
     // 0.16.47: measured from the real vertices (precise), once per model. The quick box of a rotated part (the Concept's
     // wheels) is far too big, which lifted that car 1.6 m into the air and shrank it.
     let fit=FIT.get(src);
     if(!fit){const bb=new THREE.Box3().setFromObject(g,true),sx=bb.max.x-bb.min.x,sz=bb.max.z-bb.min.z;g.rotation.y=modelYaw(kind,sx,sz);// Sketchfab cars face +Z; game forward is -Z
      g.scale.setScalar(4.0*S*(KSCALE[kn]||1)/Math.max(sx,sz,1e-3));g.updateMatrixWorld(true);{const hb=new THREE.Box3().setFromObject(g,true),h=hb.max.y-hb.min.y;if(h<1.12*S)g.scale.multiplyScalar(1.12*S/Math.max(h,1e-3)) /* 0.16.50: a gentler height floor (low supercars were stretched past 7 m) */;g.updateMatrixWorld(true);}const b2=new THREE.Box3().setFromObject(g,true),cen=b2.getCenter(new THREE.Vector3());
      fit={ry:g.rotation.y,sc:g.scale.x,p:[-cen.x,-b2.min.y,-cen.z]};FIT.set(src,fit);}
     g.rotation.y=fit.ry;g.scale.setScalar(fit.sc);g.position.set(...fit.p);}
    g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    realPaint(g,kn,c.id);
    const doors=[];
    for(const name of ['door_L','door_R']){const d=g.getObjectByName(name);if(!d)continue;
     const pivot=new THREE.Group();pivot.position.set(d.position.x+0.55,d.position.y,d.position.z);d.parent.add(pivot);
     d.position.set(-0.55,0,0);pivot.add(d);pivot.userData.side=name==='door_L'?1:-1;doors.push(pivot);}
    for(let i=0;i<4;i++){const w=g.getObjectByName('wheel_'+i);if(w)wheels.push(w);}
    if(sf){const seen=new Set();g.traverse(o=>{if(wheels.length<4&&/wheel|tire|tyre/i.test(o.name)&&!/steer|arch|well/i.test(o.name)&&!seen.has(o.parent)){seen.add(o);wheels.push(o);}});wheels.length=0;} // 0.16.18: Sketchfab wheel nodes often include hub/body parts; spinning them warped the car
    if(sf&&!doors.length){// 0.16.13: procedural driver door (hinged at the front) so the GTA enter swing still shows.
     const pivot=new THREE.Group();pivot.position.set(-1.35,0.45,-0.75);const panel=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.75,1.1),new THREE.MeshStandardMaterial({color:0x1b2026,metalness:0.6,roughness:0.35}));panel.position.set(0,0.37,0.55);pivot.add(panel);pivot.userData.side=1;pivot.userData.fake=true;pivot.visible=false;root.add(pivot);doors.push(pivot);}
    m.doors=doors;m.glb=true;root.add(g);root.add(m.seatGuy);m.body=g;m.bodySc=g.scale.x;m.dentKey=-1;damageLook(m);});
   const seatGuy=makeDriver();seatGuy.visible=false;root.add(seatGuy);const passGuy=makeDriver();passGuy.scale.x=-1;passGuy.visible=false;root.add(passGuy);/* 0.16.42: right-seat passenger (mirror of the driver) */
   scene.add(root);const collider=opts.carParts?opts.carParts([0,-999,0],0,opts.carDims(kind)):[{vehicle:true,min:[0,-999,0],max:[0,-999,0]}];boxes.push(...collider); /* 0.16.50: the same 4 tight parts the server uses */m={root,collider,wheels,doors:[],seatGuy,passGuy,enterT:0,exitT:0,kind:REAL[kind]||kind};models.set(c.id,m);
  }
  const fresh=!m.target,was=m.driver;Object.assign(m,c);damageLook(m);if(m.passGuy)m.passGuy.visible=!!c.passenger&&!c.wrecked&&!(opts.hideDriver&&opts.hideDriver(c.passenger));
  if(!fresh&&!was&&c.driver){m.enterT=0.001;m.exitT=0;}else if(!fresh&&was&&!c.driver){m.exitT=0.001;m.enterT=0;m.lastDriver=was;}else if(fresh&&c.driver){m.seatGuy.visible=true;}m.target={p:c.p.slice(),yaw:c.yaw,t:performance.now()};if(fresh){m.root.position.set(...c.p);m.root.rotation.y=c.yaw;}
  if(opts.carParts)opts.carParts(c.p,c.yaw,opts.carDims(c.kind),m.collider);
 }}
 // 0.16.25: damaged cars smoke (<50% hp); wrecked cars go dark with heavy smoke and can't be entered.
 const smokeMat=new THREE.MeshBasicMaterial({color:0x555555,transparent:true,opacity:0.45,depthWrite:false}),wreckMat=new THREE.MeshBasicMaterial({color:0x9aa0a6,transparent:true,opacity:0.7,depthWrite:false});
 const fireMat=new THREE.MeshBasicMaterial({color:0xff7a1a,transparent:true,opacity:0.85,depthWrite:false,blending:THREE.AdditiveBlending}),fireCore=new THREE.MeshBasicMaterial({color:0xffd23a,transparent:true,opacity:0.9,depthWrite:false,blending:THREE.AdditiveBlending});
 // 0.16.49 crash damage you can see: the body sags and crumples a little (lower, shorter, slightly skewed) and the
 // paint dulls as hp drops; a wrecked car keeps the full crumple
 function dent(m){if(!m.body)return;const d=Math.max(0,Math.min(1,1-(m.hp??1000)/1000)),key=Math.round(d*20);if(key===m.dentKey)return;m.dentKey=key;
  const sc=m.bodySc,side=(m.id?.charCodeAt?.(m.id.length-1)||0)%2?1:-1;m.body.scale.set(sc*(1+0.025*d),sc*(1-0.1*d),sc*(1-0.06*d));m.body.rotation.z=side*0.05*d;m.body.rotation.x=0.03*d;
  m.body.traverse(o=>{if(!o.isMesh)return;for(const mt of [].concat(o.material)){if(!mt?.isMeshPhysicalMaterial||!mt.clearcoat)continue;mt.userData.c0??=mt.color.getHex();mt.color.setHex(mt.userData.c0).lerp(DIRT,0.45*d);mt.clearcoat=1-0.8*d;mt.roughness=0.32+0.4*d;}});}
 function damageLook(m){dent(m);const hurt=!!m.wrecked,smoky=hurt||(m.hp??1000)<420; // 0.16.34: wrecked car burns; 0.16.49: a badly damaged one smokes
  if(smoky&&!m.smoke){const g=new THREE.Group();for(let i=0;i<6;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(0.4,8,6),smokeMat);p.userData.ph=i/6;g.add(p);}g.position.set(0,1.2*S,-1.2*S);m.root.add(g);m.smoke=g;}
  if(hurt&&!m.fire){const f=new THREE.Group();for(let i=0;i<7;i++){const p=new THREE.Mesh(new THREE.ConeGeometry(0.28,0.9,6),i%2?fireCore:fireMat);p.userData.ph=i/7;p.userData.x=(Math.random()-0.5)*1.4*S;p.userData.z=(Math.random()-0.5)*2.6*S;f.add(p);}f.position.y=0.9*S;m.root.add(f);m.fire=f;m.fireBurst=1;}
  if(m.smoke)m.smoke.visible=smoky;if(m.fire)m.fire.visible=hurt;if(m.wreckBox)m.wreckBox.visible=false;}
 // 0.16.52 real crash damage: the panel at the point of impact is pushed in (deeper for a harder hit), the paint around
 // it scuffs; glass, bits of trim and sparks fly. Each car gets its own copy of its mesh on the first hit (models are
 // shared between cars), so a dent stays on that car only. Wheels and glass are left alone.
 const _v=new THREE.Vector3(),_inv=new THREE.Matrix4(),_c=new THREE.Vector3();
 function ownGeometry(mesh){if(mesh.userData.ownGeo)return true;const g0=mesh.geometry,pa=g0.attributes.position;if(!pa||pa.count>60000)return false;
  const g=g0.clone(),P=new Float32Array(pa.count*3);for(let i=0;i<pa.count;i++){P[i*3]=pa.getX(i);P[i*3+1]=pa.getY(i);P[i*3+2]=pa.getZ(i);}
  g.setAttribute('position',new THREE.BufferAttribute(P,3));const na=g0.attributes.normal;if(na){const N=new Float32Array(na.count*3);for(let i=0;i<na.count;i++){N[i*3]=na.getX(i);N[i*3+1]=na.getY(i);N[i*3+2]=na.getZ(i);}g.setAttribute('normal',new THREE.BufferAttribute(N,3));}
  mesh.geometry=g;mesh.userData.ownGeo=true;return true;}
 function dent(id,x,z,power){const m=models.get(id);if(!m?.body)return false;
  const R=Math.min(1.5,0.55+power*0.045),depth=Math.min(0.32,0.05+power*0.014),P=_v.set(x,0.75,z).clone();
  m.root.updateMatrixWorld(true);m.root.getWorldPosition(_c);_c.y=0.75;const into=_c.clone().sub(P).setY(0).normalize();
  m.body.traverse(o=>{if(!o.isMesh||/wheel|tire|tyre|rim|glass|window/i.test(o.name+' '+[].concat(o.material).map(x=>x?.name||'').join(' ')))return;
   const pa=o.geometry.attributes.position;if(!pa)return;
   // quick reject: is this part near the impact at all?
   if(!o.geometry.boundingSphere)o.geometry.computeBoundingSphere();const bs=o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);if(bs.distanceTo(P)>R+o.geometry.boundingSphere.radius*o.matrixWorld.getMaxScaleOnAxis())return;
   if(!ownGeometry(o))return;const A=o.geometry.attributes.position;_inv.copy(o.matrixWorld).invert();let moved=false;
   for(let i=0;i<A.count;i++){_v.set(A.getX(i),A.getY(i),A.getZ(i)).applyMatrix4(o.matrixWorld);const d=Math.hypot(_v.x-P.x,(_v.y-P.y)*0.8,_v.z-P.z);if(d>=R)continue;
    const f=(1-d/R)**2*depth;_v.addScaledVector(into,f);_v.y-=f*0.25;_v.applyMatrix4(_inv);A.setXYZ(i,_v.x,_v.y,_v.z);moved=true;}
   if(moved){A.needsUpdate=true;if(A.count<40000)o.geometry.computeVertexNormals();o.geometry.computeBoundingSphere();}});
  return true;}
 function animSmoke(dt){const t=performance.now()/1000;for(const c of models.values()){if(c.smoke?.visible){const big=0.8;c.smoke.children.forEach(p=>{const k=(t*0.6+p.userData.ph)%1;p.position.set(Math.sin(k*9+p.userData.ph*6)*0.3,0.6+k*2.6*big,0);p.scale.setScalar((0.5+k*1.6)*big);});}
  if(c.fire?.visible){c.fireBurst=Math.max(0,(c.fireBurst||0)-(dt||0.016)*0.8);const burst=1+c.fireBurst*1.5;c.fire.children.forEach(p=>{const k=(t*2.2+p.userData.ph)%1;p.position.set(p.userData.x,k*0.6*burst,p.userData.z);p.scale.set(burst*(1-k*0.5),burst*(1.2-k*0.6)*(0.8+0.3*Math.sin(t*17+p.userData.ph*9)),burst*(1-k*0.5));});}}}
 function nearby(p,owner){return [...models.values()].find(c=>(!c.driver||(!c.passenger&&c.driver!==owner))&&!c.wrecked&&(owner===undefined||!c.owner||c.owner===owner)&&Math.hypot(...p.map((n,i)=>n-c.p[i]))<4.5);}
 // Closest car you can actually use: empty seat → drive; a driver already in, and you at the right door → passenger.
 function approach(p,id){let best=null;for(const c of models.values()){if(c.wrecked||(c.owner&&c.owner!==id))continue;const dist=Math.hypot(p[0]-c.p[0],(p[1]||0)-(c.p[1]||0),p[2]-c.p[2]);if(dist>=4.5)continue;
  const seat=!c.driver?'driver':c.driver!==id&&!c.passenger&&onPassengerSide(c,p)?'passenger':null;if(seat&&(!best||dist<best.dist))best={seat,dist,car:c};}return best;}
 let cullT=0;
 function animate(dt,cam){animateCars(dt);
  // 0.16.44: cars far from the camera (deep in the haze) are not drawn at all; each car is many meshes
  if(cam&&(cullT+=dt)>0.25){cullT=0;for(const car of models.values()){const p=car.root.position;car.root.visible=Math.hypot(p.x-cam.x,p.z-cam.z)<140;}}animSmoke(dt);for(const car of models.values())for(const d of car.doors)if(d.userData.fake)d.visible=Math.abs(d.rotation.y)>0.03;}
 // 0.16.27: dead-reckon between 30 Hz snapshots (speed along yaw, max 150 ms) so driving never stop-starts.
 function extrap(car){if(!car.driver||!car.speed||!car.target?.t)return[0,0];const a=Math.min(0.15,(performance.now()-car.target.t)/1000)*car.speed;return[-Math.sin(car.target.yaw)*a,-Math.cos(car.target.yaw)*a];}
 function animateCars(dt){const k=1-Math.exp(-22*dt);for(const car of models.values()){if(car.target){const ex=extrap(car),tx=car.target.p[0]+ex[0],tz=car.target.p[2]+ex[1];car.root.position.x+=(tx-car.root.position.x)*k;car.root.position.z+=(tz-car.root.position.z)*k;let d=car.target.yaw-car.root.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));car.root.rotation.y+=d*k;
   // GTA-style weight: the body leans out of turns and dips on braking (visual only; collisions use the flat box)
   const yawRate=dt>0?d*k/dt:0,acc=dt>0?((car.speed||0)-(car.lastSpeed??car.speed??0))/dt:0;car.lastSpeed=car.speed||0;
   car.roll=(car.roll||0)+(Math.max(-0.07,Math.min(0.07,-yawRate*Math.abs(car.speed||0)*0.006))-(car.roll||0))*Math.min(1,dt*6);
   car.pitchLean=(car.pitchLean||0)+(Math.max(-0.035,Math.min(0.035,acc*0.003))-(car.pitchLean||0))*Math.min(1,dt*6);
   car.root.rotation.order='YXZ';car.root.rotation.z=car.roll;car.root.rotation.x=car.pitchLean;
   if(car.drift&&opts.onDrift)opts.onDrift(car,dt);}for(const wheel of car.wheels){if(car.glb)wheel.rotation.z-=car.speed*dt/0.34;else wheel.rotation.x-=car.speed*dt/0.4;}
  // Enter: 0-0.35s door opens, 0.25-0.9s driver steps from the door into the seat, 0.9-1.2s door shuts. Exit is the reverse.
  const did=car.driver||car.lastDriver;if(opts.driverFor&&did&&(!car.ch||car.chId!==did)){const ch=opts.driverFor(did);if(ch){if(car.ch)car.root.remove(car.ch.root);for(const o of models.values())if(o!==car&&o.ch&&o.chId===did){o.root.remove(o.ch.root);o.ch=null;o.chId=null;}car.ch=ch;car.chId=did;car.root.add(ch.root);}}
  if(car.ch){car.seatGuy.visible=false;let tt=-1;if(car.enterT>0){car.enterT+=dt;tt=car.enterT;if(tt>ENTER_T)car.enterT=0;}else if(car.exitT>0){car.exitT+=dt;tt=ENTER_T-car.exitT;if(car.exitT>ENTER_T){car.exitT=0;car.lastDriver=null;}}
   if(tt>=0){const open=sm(0.5,0.85,tt)*(1-sm(1.3,1.65,tt));for(const d of car.doors)if(d.userData.side>0)d.rotation.y=-1.15*open;car.ch.root.visible=!opts.hideDriver?.(car.chId);poseDriver(car,car.ch,tt,dt);}
   else{for(const d of car.doors)d.rotation.y=0;car.ch.root.visible=!!car.driver&&!opts.hideDriver?.(car.chId);if(car.driver)poseDriver(car,car.ch,ENTER_T,dt);}
   continue;}
  let t=-1,dir=1;if(car.enterT>0){car.enterT+=dt;t=car.enterT;if(t>1.2)car.enterT=0;}else if(car.exitT>0){car.exitT+=dt;t=car.exitT;dir=-1;if(t>1.2)car.exitT=0;}
  if(t>=0){const open=t<0.35?t/0.35:t<0.9?1:Math.max(0,1-(t-0.9)/0.3),ease=open*open*(3-2*open);
   for(const d of car.doors)d.rotation.y=-d.userData.side*1.15*ease;
   let k=Math.min(1,Math.max(0,(t-0.25)/0.65));if(dir<0)k=1-k;k=k*k*(3-2*k);
   const g=car.seatGuy;g.visible=dir>0||t<0.9;g.position.set(DOOR[0]+(SEAT[0]-DOOR[0])*k,SEAT[1]*k,DOOR[2]);g.scale.y=1-0.38*k;
   const legs=g.getObjectByName('legs');if(legs)legs.rotation.x=-1.2*k;}
  else{car.seatGuy.visible=!!car.driver;if(car.driver){car.seatGuy.position.set(...SEAT);car.seatGuy.scale.y=0.62;const l=car.seatGuy.getObjectByName('legs');if(l)l.rotation.x=-1.2;}for(const d of car.doors)d.rotation.y=0;}}}
 function drivenBy(id){for(const c of models.values())if(c.driver===id||c.passenger===id||(c.exitT>0&&c.lastDriver===id))return true;return false;}
 function carOf(id){for(const c of models.values())if(c.driver===id||c.passenger===id)return c;return null;}
 const list=()=>[...models.values()].map(c=>({p:[c.root.position.x,0,c.root.position.z],speed:c.speed||0,yaw:c.root.rotation.y,driver:c.driver})); // for pedestrians and smashing
 return {sync,nearby,animate,drivenBy,carOf,extrap,list,dent,approach};
}
