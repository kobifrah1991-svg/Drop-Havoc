// Realism layer drawn over the 3D scene (graphics quality "high" and "ultra"; phones on "medium"/"low" skip it).
// One cheap full-screen grade: filmic contrast, a touch more colour, warm highlights / cool shadows (the
// sun-baked GTA look), a soft vignette and fine film grain that hides banding. "ultra" adds a half-resolution
// bloom so the sun, lamps, neon and muzzle flashes glow. Tone mapping moves to the final OutputPass.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uNight: { value: 0 }, uVignette: { value: 0.32 }, uGrain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uNight, uVignette, uGrain; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb; // linear HDR, tone mapped later
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(lum), col, mix(1.12, 1.04, uNight));                       // a little more colour
      vec3 warm = vec3(1.05, 1.0, 0.92), cool = vec3(0.93, 0.98, 1.06);          // split toning
      col *= mix(cool, warm, smoothstep(0.05, 0.6, lum));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.12 * (1.0 - uNight));     // gentle S-curve contrast
      vec2 d = vUv - 0.5; col *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain * max(lum, 0.08);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export function createPost(renderer, scene, camera, { bloom = false, night = false } = {}) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: renderer.capabilities.isWebGL2 ? 4 : 0 }));
  composer.addPass(new RenderPass(scene, camera));
  let bloomPass = null;
  if (bloom) { bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), night ? 0.55 : 0.28, 0.5, night ? 0.75 : 0.9); composer.addPass(bloomPass); }
  const grade = new ShaderPass(GradeShader); grade.uniforms.uNight.value = night ? 1 : 0; composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    setSize(w, h, ratio) {
      composer.setPixelRatio(ratio); composer.setSize(w, h);
      if (bloomPass) bloomPass.resolution.set(Math.max(64, w / 2), Math.max(64, h / 2)); // half resolution keeps it cheap
    },
    render(t) { grade.uniforms.uTime.value = t % 100; composer.render(); },
  };
}
