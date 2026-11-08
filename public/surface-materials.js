import * as THREE from 'three';
const cache=new Map();
function texture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d'),pixels=c.createImageData(512,512);
 let seed=1729;const wrap=f=>{for(const ox of [-512,0,512])for(const oy of [-512,0,512]){c.save();c.translate(ox,oy);f();c.restore();}};const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<pixels.data.length;i+=4){const v=Math.round(205+(random()-0.5)*(kind==='asphalt'?42:20));pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}c.putImageData(pixels,0,0);
 if(kind==='brick'){c.strokeStyle='#7b7870';c.lineWidth=3;for(let y=0;y<=512;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();for(let x=(y/64)%2?-64:0;x<512;x+=128){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+64);c.stroke();}}}
 if(kind==='wood'){for(let x=0;x<512;x+=64){c.fillStyle='#635f54';c.fillRect(x,0,2,512);for(let n=0;n<14;n++){c.strokeStyle='rgba(80,67,47,.12)';c.beginPath();c.moveTo(x+random()*60,0);c.bezierCurveTo(x+random()*60,160,x+random()*60,350,x+random()*60,512);c.stroke();}}}
 if(kind==='concrete'){c.strokeStyle='#b2afa5';c.lineWidth=2;for(let n=0;n<=512;n+=128){c.beginPath();c.moveTo(n,0);c.lineTo(n,512);c.moveTo(0,n);c.lineTo(512,n);c.stroke();}}
 if(kind==='ground'){ // natural turf: clumps of light/dark blades, a few dry patches and soil specks
  for(let i=0;i<60;i++){const x=random()*512,y=random()*512,r=20+random()*50,g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,random()<0.3?'rgba(215,215,160,.22)':'rgba(120,150,95,.30)');g.addColorStop(1,'rgba(0,0,0,0)');wrap(()=>{c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);});}
  for(let i=0;i<14000;i++){const v=random();c.fillStyle=v<0.4?'#a9c08f':v<0.75?'#cfdfb2':v<0.96?'#e4edcc':'#b3a684';const x=random()*512,y=random()*512,h=2+random()*7;c.save();c.translate(x,y);c.rotate((random()-0.5)*0.8);c.fillRect(0,0,1,h);c.restore();}}
 if(kind==='asphalt'){ // aggregate speckle, tyre-polished bands, tar-sealed cracks and patches
  for(let i=0;i<22000;i++){const v=random();c.fillStyle=v<0.5?'rgba(255,255,255,.18)':'rgba(0,0,0,.22)';c.fillRect(random()*512,random()*512,1+random()*1.5,1+random()*1.5);}
  for(const x of [150,360]){const g=c.createLinearGradient(x-60,0,x+60,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,'rgba(0,0,0,.10)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-60,0,120,512);}
  c.strokeStyle='rgba(10,10,10,.22)';c.lineWidth=1.5;for(let n=0;n<3;n++){const pts=[];let x=random()*512,y=random()*512;for(let k=0;k<6;k++){pts.push([x,y]);x+=(random()-0.5)*40;y+=15+random()*25;}wrap(()=>{c.beginPath();c.moveTo(...pts[0]);pts.slice(1).forEach(p=>c.lineTo(...p));c.stroke();});}
  for(let n=0;n<3;n++){const x=random()*512,y=random()*512,w=40+random()*80,h=30+random()*60;wrap(()=>{c.fillStyle='rgba(0,0,0,.08)';c.fillRect(x,y,w,h);});}}
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;return t;
}
// Photographed surfaces (Poly Haven, CC0: see public/img/env/CREDITS.md). They load in the background; the
// painted canvas texture of the same kind shows until then (and stays if a file is missing).
const PHOTO={ground:'ground',asphalt:'asphalt',concrete:'plaster',brick:'plaster',stucco:'stucco',roof:'roof',pavement:'pavement'};
const photoCache=new Map();
function photo(kind){
 const file=PHOTO[kind];if(!file)return texture(kind==='stucco'||kind==='roof'?'brick':kind);
 if(photoCache.has(kind))return photoCache.get(kind);
 const t=texture(kind==='stucco'||kind==='roof'?'brick':kind);
 new THREE.TextureLoader().load('img/env/'+file+'.jpg',img=>{t.dispose();t.image=img.image;t.needsUpdate=true;},undefined,()=>{}); // dispose: the photo is bigger than the canvas, so the GPU texture must be made again
 photoCache.set(kind,t);return t;
}
// GTA-like look: warm light stucco houses, clay roof tiles, grey concrete; paint colours stay as a soft tint
const HOUSE_PAINT=new Set([0xc2a37c,0x8fb0a8,0xbd8270,0xcfc4ad]);
// opts (small maps): { kind, tint } force a photo surface and a colour, so a map keeps its palette but gets real texture
export function surfaceMaterial(color,opts={}){
 const key=opts.kind?color+':'+opts.kind:color;
 if(cache.has(key))return cache.get(key);
 const kind=opts.kind||color===0x272f35?'asphalt':color===0x56634c?'ground':color===0x776c60||color===0x71543b?'wood':color===0x80807a||color===0xbbb4a3||color===0x6c7478?'concrete':color===0x535d64?'roof':color===0x9a9a92?'pavement':HOUSE_PAINT.has(color)?'stucco':'brick';
 const plain=!opts.kind&&[0xffe4a3,0xd5c68f,0x454e55,0x514d46,0xeeeeea,0xc0392b,0x2980b9].includes(color);
 const tint=opts.tint??(kind==='pavement'?new THREE.Color(color).multiplyScalar(2.4):kind==='ground'?0x8fa37a:kind==='asphalt'?0x7c7c7c:kind==='roof'?0xffffff:kind==='stucco'?new THREE.Color(color).lerp(new THREE.Color(0xffffff),0.55).getHex():kind==='concrete'?new THREE.Color(color).lerp(new THREE.Color(0xffffff),0.4).getHex():color);
 const mat=new THREE.MeshStandardMaterial({color:tint,map:plain?null:photo(kind),roughness:kind==='asphalt'?0.9:kind==='ground'?0.95:0.82,emissive:color===0xffe4a3?color:0,emissiveIntensity:0.5,polygonOffset:color===0x272f35||color===0xd5c68f||color===0xeeeeea||color===0x776c60,polygonOffsetFactor:-1,polygonOffsetUnits:color===0xd5c68f||color===0xeeeeea?-5:-2});
 if(!plain){mat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfacePosition;varying vec3 vSurfaceNormal;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
  mat4 surfaceTransform=modelMatrix;
  #ifdef USE_INSTANCING
  surfaceTransform=modelMatrix*instanceMatrix;
  #endif
  vSurfacePosition=(surfaceTransform*vec4(transformed,1.0)).xyz;vSurfaceNormal=normalize(mat3(surfaceTransform)*objectNormal);`);
  const terrainFunctions=(kind==='ground'||kind==='asphalt')?`
float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(terrainHash(i),terrainHash(i+vec2(1.0,0.0)),f.x),mix(terrainHash(i+vec2(0.0,1.0)),terrainHash(i+vec2(1.0,1.0)),f.x),f.y);}
` : '';
  const terrainTint=kind==='ground'?`float broad=terrainNoise(vSurfacePosition.xz*.022)*.65+terrainNoise(vSurfacePosition.xz*.09)*.35;diffuseColor.rgb*=mix(vec3(.86,.9,.78),vec3(1.1,1.06,.95),broad);` : kind==='asphalt'?`float wear=terrainNoise(vSurfacePosition.xz*.05)*.6+terrainNoise(vSurfacePosition.xz*.4)*.4;diffuseColor.rgb*=mix(.88,1.12,wear);` : '';
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfacePosition;varying vec3 vSurfaceNormal;'+terrainFunctions).replace('#include <map_fragment>',`vec3 surfN=abs(normalize(vSurfaceNormal));vec2 surfUV=surfN.y>0.5?vSurfacePosition.xz:(surfN.x>0.5?vSurfacePosition.zy:vSurfacePosition.xy);diffuseColor*=texture2D(map,surfUV*${kind==='ground'?'0.3':kind==='asphalt'?'0.22':kind==='roof'?'0.4':'0.33'});${terrainTint}`);
 };mat.customProgramCacheKey=()=>`world-surface-${kind}`;}
 cache.set(key,mat);return mat;
}
