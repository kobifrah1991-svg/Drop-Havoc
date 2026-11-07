import { surfaceMaterial } from './surface-materials.js';
import * as THREE from 'three';
import { buildTrees } from './nature.js';
// One draw call per material rather than one per wall: suitable for the larger district.
export function buildCity(scene,boxes,shadows,quality='high'){
  // Visual landscape beyond the playable perimeter: the district sits in terrain, not in the sky.
  // This is deliberately scenery; the shared movement/server boundary still defines the play area.
  const terrain=new THREE.PlaneGeometry(1900,1900,64,64);terrain.rotateX(-Math.PI/2);
  const vertices=terrain.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i),blend=THREE.MathUtils.smoothstep(Math.max(Math.abs(x),Math.abs(z)),130,300);
    vertices.setY(i,-1.25+blend*(Math.sin(x*.012)*Math.cos(z*.009)*7+Math.sin(z*.024+x*.008)*3));
  }
  terrain.computeVertexNormals();const backdrop=new THREE.Mesh(terrain,surfaceMaterial(0x56634c));backdrop.receiveShadow=shadows;scene.add(backdrop);
  // City continues + NYC-style skyline ring outside play bounds (111). Visual only: never added to collision boxes.
  {let seed=4242;const r=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
   const geo=new THREE.BoxGeometry(1,1,1);geo.translate(0,.5,0);const N=520;
   const city=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),N);
   const col=new THREE.Color(),q=new THREE.Quaternion(),m=new THREE.Matrix4(),pv=new THREE.Vector3(),sv=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
   for(let i=0;i<N;i++){const far=i>=220,a=r()*Math.PI*2,d=far?240+r()*150:140+r()*90;
    const w=far?12+r()*18:8+r()*14,h=far?(r()<.25?110+r()*110:45+r()*70):10+r()*32;
    pv.set(Math.cos(a)*d,-1.5,Math.sin(a)*d);q.setFromAxisAngle(up,a+(r()-.5)*.3);sv.set(w,h,w*(.7+r()*.6));
    m.compose(pv,q,sv);city.setMatrixAt(i,m);const g=far?.30+r()*.1:.38+r()*.12;col.setRGB(g*.94,g*.98,g*1.1);city.setColorAt(i,col);}
   city.instanceMatrix.needsUpdate=true;city.computeBoundingSphere();scene.add(city);
   // Tree belt outside the fence: same real trees as inside (leaf cards), one draw call per species
   {const ring=[];for(let i=0;i<140;i++){const a=r()*Math.PI*2,d=120+r()*16;ring.push([Math.cos(a)*d,0,Math.sin(a)*d]);}buildTrees(scene,ring,{shadows:false,quality});}
   // Polyfork New York City Kit (public/models/city/CREDITS.md): replaces placeholder boxes with instanced real buildings.
   // Far ring (i>=220) = Office Tower scaled to skyscraper height; near ring = tenement / cast-iron loft / brownstone.
   const KIT=['office-tower-8d148a','brick-tenement-5257e9','cast-iron-loft-d05908','brownstone-row-house-e58392'];
   const pick=i=>i>=220?0:1+i%3;
   import('three/addons/loaders/GLTFLoader.js').then(({GLTFLoader})=>{const loader=new GLTFLoader();
    KIT.forEach((name,k)=>loader.load(`models/city/${name}.glb`,g=>{
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
  const groups=new Map(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  for(const b of [...boxes.filter(b=>!b.invisible&&b.color!==0x71543b),...boxes.decorations.filter(d=>!d.tree)]){ // tree trunks: drawn by nature.js
    if(!groups.has(b.color))groups.set(b.color,[]);groups.get(b.color).push(b);
  }
  for(const [color,list] of groups){
    const material=surfaceMaterial(color);
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,list.length);
    list.forEach((b,i)=>{position.set(...b.min.map((n,a)=>(n+b.max[a])/2));scale.set(...b.max.map((n,a)=>n-b.min[a]));matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);});
    mesh.castShadow=shadows;mesh.receiveShadow=shadows;mesh.computeBoundingSphere();scene.add(mesh);
  }
  // GTA-style trees: bark trunk + crowns of leaf cards (oak and conifer), swaying in the wind
  buildTrees(scene,boxes.decorations.filter(d=>d.tree).map(d=>[d.p[0],0,d.p[2]]),{shadows,quality});
}
