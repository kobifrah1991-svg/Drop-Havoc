import * as THREE from 'three';
let materials;
function fabricMaterials(){
 if(materials)return materials;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;const ctx=canvas.getContext('2d');
 // Ripstop weave, stitched cell panels and reinforced leading/trailing edges.
 ctx.fillStyle='#222a30';ctx.fillRect(0,0,1024,256);
 for(let cell=0;cell<9;cell++){
  const x=cell*1024/9,w=1024/9;const gradient=ctx.createLinearGradient(x,0,x+w,0);
  const orange=cell===4||cell===0||cell===8;
  gradient.addColorStop(0,orange?'#b84c16':'#111c26');gradient.addColorStop(.45,orange?'#f58a36':'#3e515e');gradient.addColorStop(1,orange?'#b84c16':'#17252e');ctx.fillStyle=gradient;ctx.fillRect(x,0,w,256);
  ctx.strokeStyle='rgba(230,226,214,.55)';ctx.lineWidth=1;ctx.setLineDash([3,3]);for(const dx of [3,w-3]){ctx.beginPath();ctx.moveTo(x+dx,0);ctx.lineTo(x+dx,256);ctx.stroke();}ctx.setLineDash([]);
 }
 ctx.strokeStyle='rgba(235,235,226,.08)';ctx.lineWidth=.6;ctx.beginPath();for(let i=0;i<1024;i+=8){ctx.moveTo(i,0);ctx.lineTo(i,256);}for(let j=0;j<256;j+=8){ctx.moveTo(0,j);ctx.lineTo(1024,j);}ctx.stroke();
 for(const y of [0,244]){ctx.fillStyle='#10171c';ctx.fillRect(0,y,1024,12);ctx.strokeStyle='#9b9180';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(0,y+6);ctx.lineTo(1024,y+6);ctx.stroke();}ctx.setLineDash([]);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
 // Separate linear bump map: stitching should affect light, not read as printed decoration alone.
 const bumpCanvas=document.createElement('canvas');bumpCanvas.width=512;bumpCanvas.height=128;const b=bumpCanvas.getContext('2d');b.fillStyle='#808080';b.fillRect(0,0,512,128);b.strokeStyle='#999';b.lineWidth=1;b.beginPath();for(let x=0;x<512;x+=4){b.moveTo(x,0);b.lineTo(x,128);}for(let y=0;y<128;y+=4){b.moveTo(0,y);b.lineTo(512,y);}b.stroke();
 materials={fabric:new THREE.MeshStandardMaterial({map:texture,bumpMap:new THREE.CanvasTexture(bumpCanvas),bumpScale:.018,side:THREE.DoubleSide,roughness:.87}),intake:new THREE.MeshStandardMaterial({color:0x080e13,roughness:1,side:THREE.DoubleSide}),cord:new THREE.LineBasicMaterial({color:0xd5cec0}),harness:new THREE.MeshStandardMaterial({color:0x24272a,roughness:.92})};return materials;
}
// An inflated ram-air canopy: elliptical plan, closed upper/lower skin and nine front intakes.
export function createParachute(){
 const root=new THREE.Group(),wing=new THREE.Group();root.add(wing);const mat=fabricMaterials();
 const shape=(u,v,lower=false)=>{
  const span=Math.sin(Math.PI*u),chord=1.95+.7*span;
  const cell=Math.pow(Math.abs(Math.sin(u*9*Math.PI)),.7),profile=Math.sin(v*Math.PI);
  const thickness=.12+.25*profile+.07*cell;
  return new THREE.Vector3((u-.5)*6.8,4.7+.72*span+.16*profile+(lower?-thickness:thickness), (v-.5)*chord+.25*(1-span));
 };
 const positions=[],uv=[],indices=[],nx=72,nz=16,layer=(nx+1)*(nz+1);
 for(let side=0;side<2;side++)for(let x=0;x<=nx;x++)for(let z=0;z<=nz;z++){positions.push(...shape(x/nx,z/nz,side===1).toArray());uv.push(x/nx,z/nz);}
 for(let side=0;side<2;side++)for(let x=0;x<nx;x++)for(let z=0;z<nz;z++){const a=side*layer+x*(nz+1)+z,b=a+nz+1;if(side)indices.push(a,a+1,b,b,b+1,a+1);else indices.push(a,b,a+1,b,b+1,a+1);}
 const join=(a,b)=>indices.push(a,a+layer,b,b,a+layer,b+layer);
 for(let x=0;x<nx;x++){join(x*(nz+1),(x+1)*(nz+1));join(x*(nz+1)+nz,(x+1)*(nz+1)+nz);}
 for(let z=0;z<nz;z++){join(z,z+1);join(nx*(nz+1)+z,nx*(nz+1)+z+1);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
 const fabric=new THREE.Mesh(geo,mat.fabric);fabric.castShadow=true;fabric.receiveShadow=true;wing.add(fabric);
 for(let i=0;i<9;i++){const p=shape((i+.5)/9,0),intake=new THREE.Mesh(new THREE.PlaneGeometry(.57,.13),mat.intake);intake.position.copy(p);intake.position.y-=.14;intake.position.z-=.015;wing.add(intake);}
 const lines=[];for(let i=0;i<=9;i++)for(const v of [.12,.78]){const p=shape(i/9,v,true);const side=i<5?-.24:.24;lines.push(...p.toArray(),side,1.65,v<.5?-.1:.1,side,1.65,v<.5?-.1:.1,side,1.05,0);}
 wing.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),mat.cord));
 const belt=new THREE.Mesh(new THREE.TorusGeometry(.26,.04,5,16),mat.harness);belt.rotation.x=Math.PI/2;belt.position.y=1.05;root.add(belt);
 root.visible=false;root.userData.wing=wing;return root;
}
export function swayParachute(root,time,vx=0,vz=0){const w=root.userData.wing;w.rotation.z=Math.sin(time*1.3)*.025-THREE.MathUtils.clamp(vx*.008,-.09,.09);w.rotation.x=Math.sin(time*.9)*.018+THREE.MathUtils.clamp(vz*.006,-.07,.07);}
