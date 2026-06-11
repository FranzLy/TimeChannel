/* ============================================================
   光尘 + 星空粒子（沿弯道分布，随相机回收）
============================================================ */
import * as THREE from 'three';
import { CFG, TUNNEL_LEN, isMobile, curveX, curveY } from '../config.js';
import { scene, camera } from '../core/stage.js';
import { dustTex } from '../core/assets.js';

function makeParticles(count, tex, size, opacity, spread) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * spread;
    const z = -Math.random() * TUNNEL_LEN;
    pos[i * 3] = Math.cos(a) * rr + curveX(z);
    pos[i * 3 + 1] = Math.sin(a) * rr + curveY(z);
    pos[i * 3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: tex, size, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

const dust = makeParticles(isMobile ? 200 : 380, dustTex, 0.85, 0.9, CFG.radius * 0.85);

function driftParticles(pts, dt, t, wobble, spread) {
  const arr = pts.geometry.attributes.position.array;
  const cz = camera.position.z;
  for (let i = 0; i < arr.length; i += 3) {
    arr[i] += Math.sin(t * 0.6 + i) * wobble * dt;
    arr[i + 1] += Math.cos(t * 0.5 + i * 1.3) * wobble * dt + dt * 0.25; // 缓缓上浮
    // 沿 z 回收，并围绕弯道中心重新散布
    let wrapped = false;
    if (arr[i + 2] > cz + 6) { arr[i + 2] -= TUNNEL_LEN; wrapped = true; }
    if (arr[i + 2] < cz - TUNNEL_LEN + 6) { arr[i + 2] += TUNNEL_LEN; wrapped = true; }
    if (wrapped) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * spread;
      arr[i] = curveX(arr[i + 2]) + Math.cos(a) * rr;
      arr[i + 1] = curveY(arr[i + 2]) + Math.sin(a) * rr;
    }
    if (arr[i + 1] > curveY(arr[i + 2]) + CFG.radius) arr[i + 1] = curveY(arr[i + 2]) - CFG.radius * 0.6;
  }
  pts.geometry.attributes.position.needsUpdate = true;
}

/* ---------- 星空：照片墙之外、星云之内，不受雾影响 ---------- */
const stars = (() => {
  const count = isMobile ? 280 : 650;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = 20 + Math.random() * 34;
    const z = -Math.random() * TUNNEL_LEN;
    pos[i * 3] = Math.cos(a) * rr + curveX(z);
    pos[i * 3 + 1] = Math.sin(a) * rr + curveY(z);
    pos[i * 3 + 2] = z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    map: dustTex, size: 0.42, transparent: true, opacity: 0.9,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    color: new THREE.Color(0.85, 0.88, 1.0),
    fog: false, // 星星不受隧道雾影响，尽头也是星空
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
})();

function recycleStars(pts) {
  const arr = pts.geometry.attributes.position.array;
  const cz = camera.position.z;
  let dirty = false;
  for (let i = 2; i < arr.length; i += 3) {
    if (arr[i] > cz + 6) { arr[i] -= TUNNEL_LEN; dirty = true; }
    else if (arr[i] < cz - TUNNEL_LEN + 6) { arr[i] += TUNNEL_LEN; dirty = true; }
  }
  if (dirty) pts.geometry.attributes.position.needsUpdate = true;
}

export function update(dt, t) {
  driftParticles(dust, dt, t, 0.35, CFG.radius * 0.85);
  recycleStars(stars);
  stars.material.opacity = 0.75 + Math.sin(t * 0.6) * 0.18;
}
