/* ============================================================
   隧道：照片环 / 卡片 / 年份路标 / 回收复用 / 漂浮
============================================================ */
import * as THREE from 'three';
import { CFG, TUNNEL_LEN, curveX, curveY } from '../config.js';
import { scene, camera } from '../core/stage.js';
import { makeTexture } from '../core/assets.js';
import { photoItems, nextPhotoIndex } from '../album/album.js';
import { bind as bindTexture } from '../album/texture-pool.js';

export const tunnel = new THREE.Group();
scene.add(tunnel);

const photoGeo = new THREE.PlaneGeometry(CFG.photoW, CFG.photoH);
const frameGeo = new THREE.PlaneGeometry(CFG.photoW + 0.34, CFG.photoH + 0.34);
export const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.18, 1.0, 0.82) });
export const frameHoverMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.28, 1.0) });

export const rings = [];       // { group, rotSpeed, sign, cards, year, date }
export const photoMeshes = []; // 供 raycast
export const cards = [];       // 全部照片卡片（漂浮动画用）

let lastSignYear = null;

/* ---------- 年份路标 ---------- */
function makeYearSprite() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 224;
  const mat = new THREE.SpriteMaterial({
    map: makeTexture(cv), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(8, 3.5, 1);
  sp.visible = false;
  return sp;
}

function drawYearSign(sprite, year) {
  const cv = sprite.material.map.image;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 512, 224);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,200,150,0.95)'; ctx.shadowBlur = 34;
  ctx.fillStyle = 'rgba(255,232,200,0.95)';
  ctx.font = '300 118px Georgia, serif';
  ctx.fillText(String(year), 256, 112);
  sprite.material.map.needsUpdate = true;
}

export function buildTunnel() {
  for (let r = 0; r < CFG.rings; r++) {
    const group = new THREE.Group();
    group.rotation.z = (r % 2) * (Math.PI / CFG.segments); // 砖缝交错
    const rotSpeed = (Math.random() * 0.4 + 0.6) * 0.028 * (r % 2 === 0 ? 1 : -1); // 相邻环反向，缓缓对转
    const ringCards = [];

    for (let s = 0; s < CFG.segments; s++) {
      const theta = (s / CFG.segments) * Math.PI * 2;
      const card = new THREE.Group();
      card.position.set(Math.cos(theta) * CFG.radius, Math.sin(theta) * CFG.radius, 0);
      card.lookAt(0, 0, 3); // 朝向轴心、微微迎向来路（贴墙，保持隧道感）

      const mesh = new THREE.Mesh(photoGeo, new THREE.MeshBasicMaterial());
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.z = -0.03;
      card.add(frame);
      card.add(mesh);
      card.userData = {
        theta,
        baseQuat: card.quaternion.clone(),
        phase: Math.random() * Math.PI * 2,
        sway: 0.6 + Math.random() * 0.9,
        photoMesh: mesh,
        frameMesh: frame,
        hover: 0,
      };
      group.add(card);
      ringCards.push(card);
      cards.push(card);
      photoMeshes.push(mesh);
    }

    group.position.z = -r * CFG.spacing; // 卡片朝向算完后再就位
    const sign = makeYearSprite();
    sign.position.set(0, -CFG.radius * 0.62, -r * CFG.spacing); // 挂在隧道下缘，不挡视线
    tunnel.add(sign); // 不随环旋转
    tunnel.add(group);

    const ringObj = { group, rotSpeed, sign, cards: ringCards, year: null, date: null };
    rings.push(ringObj);
    assignRing(ringObj);
  }
}

// 给一个环按时间轴顺序换上下一批照片，并在跨年处立年份路标
function assignRing(ring) {
  let firstDate = null;
  for (const card of ring.cards) {
    const idx = nextPhotoIndex();
    if (!firstDate) firstDate = photoItems[idx].date;
    const mesh = card.userData.photoMesh;
    mesh.userData.photoIndex = idx;
    bindTexture(mesh, photoItems[idx]);
  }
  ring.date = firstDate || null;
  ring.year = firstDate ? firstDate.getFullYear() : null;
  if (ring.year !== null && ring.year !== lastSignYear) {
    lastSignYear = ring.year;
    drawYearSign(ring.sign, ring.year);
    ring.sign.visible = true;
  } else {
    ring.sign.visible = false;
  }
}

// 相册整体更换（导入）后：重置路标年份并全量重铺
export function onAlbumChanged() {
  lastSignYear = null;
  for (const r of rings) assignRing(r);
}

// 环回收：相机穿过后把环搬到前方（或后方），无限隧道
function recycleRings() {
  const cz = camera.position.z;
  for (const r of rings) {
    // 前进方向是 -z
    while (r.group.position.z > cz + CFG.spacing * 2.5) {
      r.group.position.z -= TUNNEL_LEN;
      assignRing(r);
    }
    while (r.group.position.z < cz - TUNNEL_LEN + CFG.spacing * 2.5) {
      r.group.position.z += TUNNEL_LEN;
      assignRing(r);
    }
  }
}

/* ---------- 每帧：环旋转 + 弯道偏移 + 回收 + 路标淡入淡出 ---------- */
export function update(dt, t, speedAbs) {
  for (const r of rings) {
    r.group.rotation.z += r.rotSpeed * dt * (1 + speedAbs * 0.04);
    const gz = r.group.position.z;
    r.group.position.x = curveX(gz);
    r.group.position.y = curveY(gz);
    r.sign.position.set(curveX(gz), curveY(gz) - CFG.radius * 0.62, gz);
  }
  recycleRings();

  // 年份路标：只点亮迎面最近的一块，避免文字重叠
  let nearestSign = null, nearestDz = Infinity;
  for (const r of rings) {
    if (!r.sign.visible) continue;
    const dz = camera.position.z - r.group.position.z;
    if (dz > 4 && dz < 130 && dz < nearestDz) { nearestDz = dz; nearestSign = r.sign; }
  }
  for (const r of rings) {
    if (!r.sign.visible) continue;
    let target = 0;
    if (r.sign === nearestSign) {
      target = Math.min((nearestDz - 4) / 14, 1) * Math.min((130 - nearestDz) / 40, 1) * 0.8;
    }
    r.sign.material.opacity += (target - r.sign.material.opacity) * Math.min(dt * 4, 1);
  }
}

/* ---------- 每帧：卡片贴墙漂浮 + 悬停浮出（聚焦卡片随后由 focus 模块覆盖） ---------- */
export function updateCards(dt, t, hoveredCard) {
  for (const card of cards) {
    const u = card.userData;
    const rr = CFG.radius + Math.sin(t * 0.35 * u.sway + u.phase * 1.7) * 0.12;
    let px = Math.cos(u.theta) * rr;
    let py = Math.sin(u.theta) * rr;
    const pz = Math.sin(t * 0.5 * u.sway + u.phase) * 0.22;
    u.hover += (((hoveredCard === card) ? 1 : 0) - u.hover) * Math.min(dt * 7, 1);
    let scale = 1 + 0.07 * u.hover;
    if (u.hover > 0.001) {
      px -= Math.cos(u.theta) * 0.9 * u.hover; // 向隧道中心浮出
      py -= Math.sin(u.theta) * 0.9 * u.hover;
    }
    card.position.set(px, py, pz);
    card.quaternion.copy(u.baseQuat);
    card.rotateZ(Math.sin(t * 0.4 * u.sway + u.phase) * 0.018);
    card.scale.setScalar(scale);
  }
}
