/* ============================================================
   渲染舞台：renderer / scene / camera / 后期（辉光 + 暗角颗粒）
============================================================ */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { isMobile } from '../config.js';

export const canvas = document.getElementById('canvas');

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

export const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0d0716, 0.0135);

export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 0, 0);

export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

export const BLOOM_BASE = isMobile ? 0.38 : 0.5;
export const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  BLOOM_BASE,  // strength
  0.55,        // radius
  0.85         // threshold
);
composer.addPass(bloom);

const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 p = vUv - 0.5;
      float vig = smoothstep(0.95, 0.32, length(p) * 1.18);
      c.rgb *= mix(0.55, 1.0, vig);
      // 微微暖色调
      c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 0.99, 0.94), 0.5);
      // 胶片颗粒
      float g = (rand(vUv * (uTime + 1.0)) - 0.5) * 0.045;
      c.rgb += g * (1.0 - vig * 0.6);
      gl_FragColor = c;
    }
  `,
};
export const vignettePass = new ShaderPass(vignetteShader);
composer.addPass(vignettePass);
composer.addPass(new OutputPass());

export function render(t) {
  vignettePass.uniforms.uTime.value = t % 10;
  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
