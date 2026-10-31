import * as THREE from 'three';
const cache=new Map();
function texture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d'),pixels=c.createImageData(512,512);
 let seed=1729;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<pixels.data.length;i+=4){const v=Math.round(205+(random()-0.5)*(kind==='asphalt'?42:20));pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=255;}c.putImageData(pixels,0,0);
 if(kind==='brick'){c.strokeStyle='#7b7870';c.lineWidth=3;for(let y=0;y<=512;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(512,y);c.stroke();for(let x=(y/64)%2?-64:0;x<512;x+=128){c.beginPath();c.moveTo(x,y);c.lineTo(x,y+64);c.stroke();}}}
 if(kind==='wood'){for(let x=0;x<512;x+=64){c.fillStyle='#635f54';c.fillRect(x,0,2,512);for(let n=0;n<14;n++){c.strokeStyle='rgba(80,67,47,.12)';c.beginPath();c.moveTo(x+random()*60,0);c.bezierCurveTo(x+random()*60,160,x+random()*60,350,x+random()*60,512);c.stroke();}}}
 if(kind==='concrete'){c.strokeStyle='#b2afa5';c.lineWidth=2;for(let n=0;n<=512;n+=128){c.beginPath();c.moveTo(n,0);c.lineTo(n,512);c.moveTo(0,n);c.lineTo(512,n);c.stroke();}}
 if(kind==='ground'){for(let i=0;i<3000;i++){c.fillStyle=random()<0.5?'#b8c5a3':'#d3d3b9';const x=random()*512,y=random()*512;c.fillRect(x,y,1,3+random()*8);}}
 if(kind==='asphalt'){c.strokeStyle='rgba(20,20,20,.15)';c.lineWidth=2;c.beginPath();c.moveTo(70,0);c.bezierCurveTo(100,140,50,200,90,512);c.stroke();}
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;return t;
}
export function surfaceMaterial(color){
 if(cache.has(color))return cache.get(color);
 const kind=color===0x272f35?'asphalt':color===0x56634c?'ground':color===0x776c60||color===0x71543b?'wood':color===0x80807a||color===0xbbb4a3?'concrete':'brick';
 const plain=[0xffe4a3,0xd5c68f,0x454e55,0x514d46].includes(color);
 const mat=new THREE.MeshStandardMaterial({color,map:plain?null:texture(kind),roughness:kind==='asphalt'?0.96:0.82,emissive:color===0xffe4a3?color:0,emissiveIntensity:0.5,polygonOffset:color===0x272f35||color===0xd5c68f||color===0x776c60,polygonOffsetFactor:-1,polygonOffsetUnits:color===0xd5c68f?-5:-2});
 if(!plain){mat.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfacePosition;varying vec3 vSurfaceNormal;').replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
  mat4 surfaceTransform=modelMatrix;
  #ifdef USE_INSTANCING
  surfaceTransform=modelMatrix*instanceMatrix;
  #endif
  vSurfacePosition=(surfaceTransform*vec4(transformed,1.0)).xyz;vSurfaceNormal=normalize(mat3(surfaceTransform)*objectNormal);`);
  const terrainFunctions=kind==='ground'?`
float terrainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float terrainNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(terrainHash(i),terrainHash(i+vec2(1.0,0.0)),f.x),mix(terrainHash(i+vec2(0.0,1.0)),terrainHash(i+vec2(1.0,1.0)),f.x),f.y);}
` : '';
  const terrainTint=kind==='ground'?`float broad=terrainNoise(vSurfacePosition.xz*.022)*.65+terrainNoise(vSurfacePosition.xz*.09)*.35;diffuseColor.rgb*=mix(vec3(.82,.85,.72),vec3(1.15,1.08,.96),broad);` : '';
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfacePosition;varying vec3 vSurfaceNormal;'+terrainFunctions).replace('#include <map_fragment>',`vec3 surfN=abs(normalize(vSurfaceNormal));vec2 surfUV=surfN.y>0.5?vSurfacePosition.xz:(surfN.x>0.5?vSurfacePosition.zy:vSurfacePosition.xy);diffuseColor*=texture2D(map,surfUV*0.35);${terrainTint}`);
 };mat.customProgramCacheKey=()=>`world-surface-${kind}`;}
 cache.set(color,mat);return mat;
}
