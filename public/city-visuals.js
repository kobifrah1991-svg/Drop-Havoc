import { surfaceMaterial } from './surface-materials.js';
import * as THREE from 'three';
// One draw call per material rather than one per wall: suitable for the larger district.
export function buildCity(scene,boxes,shadows){
  // Visual landscape beyond the playable perimeter: the district sits in terrain, not in the sky.
  // This is deliberately scenery; the shared movement/server boundary still defines the play area.
  const terrain=new THREE.PlaneGeometry(1900,1900,64,64);terrain.rotateX(-Math.PI/2);
  const vertices=terrain.attributes.position;
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),z=vertices.getZ(i),blend=THREE.MathUtils.smoothstep(Math.max(Math.abs(x),Math.abs(z)),130,300);
    vertices.setY(i,-1.25+blend*(Math.sin(x*.012)*Math.cos(z*.009)*7+Math.sin(z*.024+x*.008)*3));
  }
  terrain.computeVertexNormals();const backdrop=new THREE.Mesh(terrain,surfaceMaterial(0x56634c));backdrop.receiveShadow=shadows;scene.add(backdrop);
  const groups=new Map(),matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion();
  for(const b of [...boxes.filter(b=>!b.invisible),...boxes.decorations.filter(d=>!d.tree)]){
    if(!groups.has(b.color))groups.set(b.color,[]);groups.get(b.color).push(b);
  }
  for(const [color,list] of groups){
    const material=surfaceMaterial(color);
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,list.length);
    list.forEach((b,i)=>{position.set(...b.min.map((n,a)=>(n+b.max[a])/2));scale.set(...b.max.map((n,a)=>n-b.min[a]));matrix.compose(position,rotation,scale);mesh.setMatrixAt(i,matrix);});
    mesh.castShadow=shadows;mesh.receiveShadow=shadows;mesh.computeBoundingSphere();scene.add(mesh);
  }
  const trees=boxes.decorations.filter(d=>d.tree);
  const crowns=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x3f6547,roughness:1}),trees.length);
  trees.forEach((t,i)=>{position.set(...t.p);scale.set(2.8,3,2.8);matrix.compose(position,rotation,scale);crowns.setMatrixAt(i,matrix);});
  crowns.castShadow=shadows;crowns.computeBoundingSphere();scene.add(crowns);
}
