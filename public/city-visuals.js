import { surfaceMaterial } from './surface-materials.js';
import * as THREE from 'three';
import { buildTrees } from './nature.js';
import { buildStreet } from './street-visuals.js';
// One draw call per material rather than one per wall: suitable for the larger district.
export function buildCity(scene,boxes,shadows,quality='high'){
  // Visual landscape beyond the playable perimeter: the district sits in terrain, not in the sky.
  // This is deliberately scenery; the shared movement/server boundary still defines the play area.
  const terrain=new THREE.PlaneGeometry(1900,1900,64,64);terrain.rotateX(-Math.PI/2);
  const vertices=terrain.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i),blend=THREE.MathUtils.smoothstep(Math.max(Math.abs(x),Math.abs(z)),165,320);
    vertices.setY(i,-1.25+blend*(Math.sin(x*.012)*Math.cos(z*.009)*7+Math.sin(z*.024+x*.008)*3));
  }
  terrain.computeVertexNormals();const backdrop=new THREE.Mesh(terrain,surfaceMaterial(0x56634c));backdrop.receiveShadow=shadows;scene.add(backdrop);
  // City continues + NYC-style skyline ring outside play bounds (111). Visual only: never added to collision boxes.
  {let seed=4242;const r=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
   const geo=new THREE.BoxGeometry(1,1,1);geo.translate(0,.5,0);const N=520;
   const city=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),N);
   const col=new THREE.Color(),q=new THREE.Quaternion(),m=new THREE.Matrix4(),pv=new THREE.Vector3(),sv=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
   for(let i=0;i<N;i++){const far=i>=220,a=r()*Math.PI*2,d=far?275+r()*150:185+r()*90; // 0.16.44: starts behind the new city edge (±151)
    const w=far?12+r()*18:8+r()*14,h=far?(r()<.25?110+r()*110:45+r()*70):10+r()*32;
    pv.set(Math.cos(a)*d,-1.5,Math.sin(a)*d);q.setFromAxisAngle(up,a+(r()-.5)*.3);sv.set(w,h,w*(.7+r()*.6));
    m.compose(pv,q,sv);city.setMatrixAt(i,m);const g=far?.30+r()*.1:.38+r()*.12;col.setRGB(g*.94,g*.98,g*1.1);city.setColorAt(i,col);}
   city.instanceMatrix.needsUpdate=true;city.computeBoundingSphere();scene.add(city);
   // Tree belt outside the fence: same real trees as inside (leaf cards), one draw call per species
   {const ring=[];for(let i=0;i<140;i++){const a=r()*Math.PI*2,d=158+r()*14;ring.push([Math.cos(a)*d,0,Math.sin(a)*d]);}buildTrees(scene,ring,{shadows:false,quality});}
   // Polyfork New York City Kit (public/models/city/CREDITS.md): replaces placeholder boxes with instanced real buildings.
   // Far ring (i>=220) = Office Tower scaled to skyscraper height; near ring = tenement / cast-iron loft / brownstone.
   const KIT=['office-tower-8d148a','brick-tenement-5257e9','cast-iron-loft-d05908','brownstone-row-house-e58392'];
   const pick=i=>i>=220?0:1+i%3;
   Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/libs/meshopt_decoder.module.js')]).then(([{GLTFLoader},{MeshoptDecoder}])=>{const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // models are meshopt + WebP compressed
    KIT.forEach((name,k)=>loader.load(window.ARENA_MODELS?.[`city/${name}.glb`]||`models/city/${name}.glb`,g=>{
     const ids=[];for(let i=0;i<N;i++)if(pick(i)===k)ids.push(i);if(!ids.length)return;
     g.scene.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(g.scene),sz=bb.getSize(new THREE.Vector3());
     const norm=new THREE.Matrix4().makeTranslation(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2);
     const tmp=new THREE.Matrix4(),p2=new THREE.Vector3(),q2=new THREE.Quaternion(),s2=new THREE.Vector3(),zero=new THREE.Matrix4().makeScale(0,0,0);
     const place=ids.map(i=>{city.getMatrixAt(i,tmp);tmp.decompose(p2,q2,s2);
       // keep footprint width, take height from the box (towers stretched up to read as skyscrapers from the parachute)
       const f=s2.x/Math.max(sz.x,sz.z),sy=k===0?s2.y/sz.y:f;const out=new THREE.Matrix4().compose(p2,q2,new THREE.Vector3(f,sy,f)).multiply(norm);city.setMatrixAt(i,zero);return out;});
     g.scene.traverse(o=>{if(!o.isMesh)return;const inst=new THREE.InstancedMesh(o.geometry,o.material,place.length);
       place.forEach((m2,j)=>inst.setMatrixAt(j,m2.clone().multiply(o.matrixWorld)));inst.computeBoundingSphere();scene.add(inst);});
     city.instanceMatrix.needsUpdate=true;
    },undefined,()=>{}));}).catch(()=>{});}
  // 0.16.44 city edge: every edge building is a solid (invisible) box from shared/city.js; here a real building model
  // is fitted to it, facing the ring road. Plain facade blocks show until the models have loaded.
  if(boxes.edgeBuildings?.length){
   const E=boxes.edgeBuildings,KITOF={tower:['office-tower-8d148a','monolith-office-tower-422420'],residential:['brick-tenement-5257e9','cast-iron-loft-d05908','capsule-residential-tower-80300b','brick-tenement-5257e9'],tenement:['brick-tenement-5257e9'],loft:['cast-iron-loft-d05908'],brownstone:['brownstone-row-house-e58392']};
   const geo=new THREE.BoxGeometry(1,1,1);geo.translate(0,.5,0);
   const blocks=new THREE.InstancedMesh(geo,surfaceMaterial(0x80807a),E.length),m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
   const fit=E.map((b,i)=>{const cx=(b.min[0]+b.max[0])/2,cz=(b.min[2]+b.max[2])/2,w=b.max[0]-b.min[0],h=b.max[1],d=b.max[2]-b.min[2];
     // turn the front (+Z of the model) toward the middle of the city
     const yaw=Math.abs(cx)>Math.abs(cz)?(cx>0?-Math.PI/2:Math.PI/2):(cz>0?Math.PI:0),swap=Math.abs(Math.sin(yaw))>0.5;
     m.compose(p.set(cx,0,cz),q.identity(),sc.set(w,h,d));blocks.setMatrixAt(i,m);
     const names=KITOF[b.kind]||KITOF.tenement;return {cx,cz,yaw,sx:swap?d:w,sz:swap?w:d,h,name:names[i%names.length]};});
   blocks.castShadow=shadows;blocks.receiveShadow=shadows;blocks.computeBoundingSphere();scene.add(blocks);
   Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/libs/meshopt_decoder.module.js')]).then(([{GLTFLoader},{MeshoptDecoder}])=>{
    const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),zero=new THREE.Matrix4().makeScale(0,0,0);
    for(const name of new Set(fit.map(f=>f.name)))loader.load(window.ARENA_MODELS?.[`city/${name}.glb`]||`models/city/${name}.glb`,g=>{
     g.scene.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(g.scene),sz=bb.getSize(new THREE.Vector3());
     const norm=new THREE.Matrix4().makeTranslation(-(bb.min.x+bb.max.x)/2,-bb.min.y,-(bb.min.z+bb.max.z)/2);
     const mine=fit.map((f,i)=>[f,i]).filter(([f])=>f.name===name);
     const place=mine.map(([f,i])=>{blocks.setMatrixAt(i,zero);return new THREE.Matrix4().compose(new THREE.Vector3(f.cx,0,f.cz),new THREE.Quaternion().setFromAxisAngle(up,f.yaw),new THREE.Vector3(f.sx/sz.x,f.h/sz.y,f.sz/sz.z)).multiply(norm);});
     g.scene.traverse(o=>{if(!o.isMesh)return;const inst=new THREE.InstancedMesh(o.geometry,o.material,place.length);place.forEach((m2,j)=>inst.setMatrixAt(j,m2.clone().multiply(o.matrixWorld)));inst.castShadow=shadows;inst.receiveShadow=shadows;inst.computeBoundingSphere();scene.add(inst);});
     blocks.instanceMatrix.needsUpdate=true;
    },undefined,()=>{});
   }).catch(()=>{});
  }
  // Mini-roundabouts: grass island with a kerb, white give-way ring painted around it (the obelisk is a solid box)
  for(const rb of boxes.street?.roundabouts||[]){
   const island=new THREE.Mesh(new THREE.CylinderGeometry(rb.r,rb.r+0.15,0.16,40),surfaceMaterial(0x56634c));island.position.set(rb.p[0],0.08,rb.p[2]);island.receiveShadow=shadows;scene.add(island);
   const kerb=new THREE.Mesh(new THREE.TorusGeometry(rb.r+0.08,0.1,6,40),surfaceMaterial(0xbbb4a3));kerb.rotation.x=-Math.PI/2;kerb.position.set(rb.p[0],0.12,rb.p[2]);scene.add(kerb);
   const paint=new THREE.Mesh(new THREE.RingGeometry(rb.r+0.9,rb.r+1.1,48),new THREE.MeshStandardMaterial({color:0xeeeeea,roughness:0.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-6}));paint.rotation.x=-Math.PI/2;paint.position.set(rb.p[0],0.034,rb.p[2]);scene.add(paint);
  }
  const groups=new Map(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const DRAWN_ELSEWHERE=new Set([0x71543b,0x5a4632,0x2c3035,0xc0392b]); // tree trunks, benches, traffic-light poles, swing posts
  for(const b of [...boxes.filter(b=>!b.invisible&&!DRAWN_ELSEWHERE.has(b.color)),...boxes.decorations.filter(d=>!d.tree)]){ // tree trunks: drawn by nature.js
    if(!groups.has(b.color))groups.set(b.color,[]);groups.get(b.color).push(b);
  }
  for(const [color,list] of groups){
    const material=surfaceMaterial(color);
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,list.length);
    list.forEach((b,i)=>{position.set(...b.min.map((n,a)=>(n+b.max[a])/2));scale.set(...b.max.map((n,a)=>n-b.min[a]));matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);});
    mesh.castShadow=shadows&&color!==0x56634c&&list.some(b=>b.max[1]-b.min[1]>0.2);mesh.receiveShadow=shadows;mesh.computeBoundingSphere();scene.add(mesh); // ground, kerbs and paint never cast shadows
  }
  // GTA-style trees: bark trunk + crowns of leaf cards (oak and conifer), swaying in the wind
  buildTrees(scene,boxes.decorations.filter(d=>d.tree).map(d=>[d.p[0],0,d.p[2]]),{shadows,quality,knockable:true});
  if(boxes.street)buildStreet(scene,boxes.street,{shadows}); // benches, traffic lights, playground, fountains
}
