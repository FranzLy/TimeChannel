/* ============================================================
   流星：拖着光尾划过隧道之外的夜空 / 尽头的黑洞星空
============================================================ */
import * as THREE from 'three';
import { curveX, curveY } from '../config.js';
import { scene, camera } from '../core/stage.js';
import { makeTexture } from '../core/assets.js';

const meteorTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 32;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,210,170,0)');
  g.addColorStop(0.7, 'rgba(255,225,195,0.5)');
  g.addColorStop(0.92, 'rgba(255,248,235,1)');
  g.addColorStop(1, 'rgba(255,248,235,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 32);
  const v = ctx.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.5, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = v; ctx.fillRect(0, 0, 256, 32);
  return makeTexture(cv);
})();

export const meteors = [];
{
  const geo = new THREE.PlaneGeometry(22, 0.8);
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: meteorTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      color: new THREE.Color(1.5, 1.42, 1.25), // >1 触发辉光
      fog: false, // 流星不被雾吞掉
    });
    const a = new THREE.Mesh(geo, mat);
    const b = new THREE.Mesh(geo, mat);
    b.rotation.x = Math.PI / 2; // 十字交叉面，任意角度都有光带
    const g = new THREE.Group();
    g.add(a); g.add(b); g.visible = false;
    scene.add(g);
    meteors.push({ group: g, mat, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
  }
}
let nextMeteorAt = 2.5;

export function spawnMeteor() {
  const m = meteors.find((x) => !x.group.visible);
  if (!m) return;
  const cz = camera.position.z;
  const side = Math.random() < 0.5 ? -1 : 1;
  let dir;
  if (Math.random() < 0.55) {
    // 深空型：在隧道尽头的黑洞星空里缓缓划过
    const mz = cz - (130 + Math.random() * 90);
    m.group.position.set(
      curveX(mz) + side * (12 + Math.random() * 20),
      curveY(mz) - 8 + Math.random() * 28,
      mz
    );
    dir = new THREE.Vector3(
      -side * (0.7 + Math.random() * 0.5),
      -(0.15 + Math.random() * 0.5),
      (Math.random() - 0.5) * 0.4
    ).normalize();
    m.vel.copy(dir).multiplyScalar(40 + Math.random() * 40);
    m.maxLife = 1.6 + Math.random() * 1.0;
  } else {
    // 隧道外型：从照片缝隙间瞥见
    const mz = cz - (45 + Math.random() * 140);
    m.group.position.set(
      curveX(mz) + side * (20 + Math.random() * 26),
      curveY(mz) + 16 + Math.random() * 24,
      mz
    );
    dir = new THREE.Vector3(
      -side * (0.5 + Math.random() * 0.7),
      -(0.45 + Math.random() * 0.55),
      (Math.random() - 0.35) * 0.7
    ).normalize();
    m.vel.copy(dir).multiplyScalar(55 + Math.random() * 60);
    m.maxLife = 1.1 + Math.random() * 1.1;
  }
  m.group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  m.life = 0;
  m.group.visible = true;
}

export function update(dt, t) {
  if (t > nextMeteorAt) {
    spawnMeteor();
    if (Math.random() < 0.3) spawnMeteor(); // 偶尔成对划过
    nextMeteorAt = t + 2.5 + Math.random() * 5.5;
  }
  for (const m of meteors) {
    if (!m.group.visible) continue;
    m.life += dt;
    if (m.life >= m.maxLife) { m.group.visible = false; m.mat.opacity = 0; continue; }
    m.group.position.addScaledVector(m.vel, dt);
    m.mat.opacity = Math.pow(Math.sin(Math.PI * (m.life / m.maxLife)), 0.7);
  }
}
