/* ============================================================
   聚焦：点击把照片从墙上取出来，飞到镜头前看原图
   事件：focus:opened / focus:photo {idx,id,date} / focus:closed
============================================================ */
import * as THREE from 'three';
import { CFG, REACH, isMobile, fmtDate } from '../config.js';
import { scene, camera, bloom, BLOOM_BASE, renderer } from '../core/stage.js';
import { texLoader } from '../core/assets.js';
import { photoItems } from '../album/album.js';
import { photoMeshes } from '../world/tunnel.js';
import { IS_HEIC, loadHeic2any } from '../album/importer.js';
import { bind as bindTexture, getTex } from '../album/texture-pool.js';
import { events } from '../events.js';

const raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

const focusInfo = document.getElementById('focusInfo');
const focusDate = document.getElementById('focusDate');

/* ---------- 聚焦暗幕：取出照片时压暗隧道 ---------- */
const focusDim = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 55),
  new THREE.MeshBasicMaterial({ color: 0x06030c, transparent: true, opacity: 0, depthWrite: false, fog: false })
);
focusDim.visible = false;
scene.add(focusDim);

let focused = null;       // { card, idx }
let focusClosing = false;
let focusT = 0;

export function isFocused() { return !!focused; }

export function openFocus(mesh) {
  focused = { card: mesh.parent, idx: mesh.userData.photoIndex };
  focusClosing = false;
  showFocusedPhoto(focused.idx);
  focusInfo.classList.add('open');
  events.emit('focus:opened');
  events.emit('interacted');
}

/* ---------- 高清原图：单槽缓存，看哪张加载哪张，换张即释放显存 ---------- */
let hiCurrent = null; // { tex, url, temp }
function disposeHiRes() {
  if (!hiCurrent) return;
  hiCurrent.tex.dispose();
  if (hiCurrent.temp && hiCurrent.url) URL.revokeObjectURL(hiCurrent.url);
  hiCurrent = null;
}

async function loadHiRes(item, idx, mesh) {
  let url = item.src, temp = false;
  if (!url && item.file) {
    if (IS_HEIC(item.file)) {
      try {
        const heic2any = await loadHeic2any();
        const blob = await heic2any({ blob: item.file, toType: 'image/jpeg', quality: 0.92 });
        url = URL.createObjectURL(blob); temp = true;
      } catch (_) { return; }
    } else {
      url = URL.createObjectURL(item.file);
      temp = true;
    }
  }
  if (!url) return;
  texLoader.load(url, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (focused && focused.idx === idx) {
      disposeHiRes();
      hiCurrent = { tex, url, temp };
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    } else { // 已经翻页/关闭，直接丢弃
      tex.dispose();
      if (temp) URL.revokeObjectURL(url);
    }
  });
}

function showFocusedPhoto(idx) {
  if (!focused) return;
  disposeHiRes();
  focused.idx = idx;
  const item = photoItems[idx];
  const mesh = focused.card.userData.photoMesh;
  bindTexture(mesh, item);
  const tex = getTex(item);
  if (tex) mesh.material.map = tex;
  mesh.material.toneMapped = false; // 原图原色，不被影调压灰
  mesh.material.needsUpdate = true;
  focusDate.textContent = item.date ? fmtDate(item.date) : '';
  events.emit('focus:photo', { idx, id: item.id, date: item.date });
  loadHiRes(item, idx, mesh);
}

export function pageFocus(dir) {
  if (!focused) return;
  showFocusedPhoto((focused.idx + dir + photoItems.length) % photoItems.length);
}

export function closeFocus() {
  if (!focused || focusClosing) return;
  focusClosing = true;
  focusInfo.classList.remove('open');
  events.emit('focus:closed');
}

function finalizeFocusClose() {
  if (!focused) return;
  const mesh = focused.card.userData.photoMesh;
  bindTexture(mesh, photoItems[mesh.userData.photoIndex]);
  mesh.material.toneMapped = true;
  mesh.material.needsUpdate = true;
  focused.card.userData.frameMesh.visible = true;
  focused.card.scale.setScalar(1);
  disposeHiRes();
  focused = null; focusClosing = false; focusT = 0;
}

// 相册整体更换时立即收起（重铺后旧卡片索引已失效）
export function forceClose() {
  if (!focused) return;
  focusInfo.classList.remove('open');
  events.emit('focus:closed');
  finalizeFocusClose();
}

export function handleTap(e) {
  if (focused) { closeFocus(); return; }
  raycaster.setFromCamera(_ndc.set(
    (e.clientX / window.innerWidth) * 2 - 1,
    -((e.clientY / window.innerHeight) * 2 - 1)
  ), camera);
  const hits = raycaster.intersectObjects(photoMeshes, false);
  if (hits.length && hits[0].distance < REACH) openFocus(hits[0].object);
}

document.getElementById('prevBtn').addEventListener('click', () => pageFocus(-1));
document.getElementById('nextBtn').addEventListener('click', () => pageFocus(1));

/* ---------- 每帧：进度推进、辉光压低、覆盖聚焦卡片的位姿与比例、暗幕 ---------- */
export function update(dt, t) {
  const focusTarget = (focused && !focusClosing) ? 1 : 0;
  focusT += (focusTarget - focusT) * Math.min(dt * 4.5, 1);
  if (focusClosing && focusT < 0.02) finalizeFocusClose();
  const focusEase = focusT * focusT * (3 - 2 * focusT);

  // 看原图时压低辉光，白色照片不再泛白发雾
  bloom.strength = BLOOM_BASE * (1 - 0.92 * focusEase);

  // 取出距离随视口自适应；桌面端照片靠左给故事面板留位，移动端上移
  const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const fW = isMobile ? 0.84 : 0.52, fH = isMobile ? 0.50 : 0.66;
  const focusDist = Math.max(
    (CFG.photoH * 1.55 * 0.5) / (fH * tanHalfFov),
    (CFG.photoW * 1.55 * 0.5) / (fW * tanHalfFov * camera.aspect)
  );

  if (focused && focusEase > 0.0001) {
    const card = focused.card;
    const u = card.userData;
    _v2.set(0, 0, -1).applyQuaternion(camera.quaternion);
    _v1.copy(camera.position).addScaledVector(_v2, focusDist);
    if (!isMobile) { // 桌面：照片靠左，右侧留给故事面板
      _v3.set(1, 0, 0).applyQuaternion(camera.quaternion);
      _v1.addScaledVector(_v3, -focusDist * tanHalfFov * camera.aspect * 0.21);
    } else { // 移动端：照片上移，底部留给故事面板
      _v3.set(0, 1, 0).applyQuaternion(camera.quaternion);
      _v1.addScaledVector(_v3, focusDist * tanHalfFov * 0.16);
    }
    _v1.y += Math.sin(t * 0.8) * 0.07; // 取出后轻轻呼吸
    card.parent.worldToLocal(_v1);
    card.position.lerp(_v1, focusEase); // 从墙面位姿（tunnel.updateCards 刚算好）出发
    card.parent.getWorldQuaternion(_q1).invert().multiply(camera.quaternion);
    card.quaternion.slerp(_q1, focusEase);
    // 按原图宽高比显示（隧道里仍是统一尺寸）
    let fsx = 1, fsy = 1;
    const im = u.photoMesh.material.map && u.photoMesh.material.map.image;
    if (im && im.width && im.height) {
      const imgA = im.width / im.height, cardA = CFG.photoW / CFG.photoH;
      if (imgA > cardA) fsy = cardA / imgA; else fsx = imgA / cardA;
    }
    u.frameMesh.visible = focusEase < 0.35; // 取出时收起发光相框
    const wall = card.scale.x; // 墙面缩放（含悬停），由 updateCards 设定
    card.scale.set(
      wall * (1 - focusEase) + 1.55 * fsx * focusEase,
      wall * (1 - focusEase) + 1.55 * fsy * focusEase,
      wall * (1 - focusEase) + 1.55 * focusEase
    );
  }

  // 聚焦暗幕：压暗背后的隧道
  if (focusT > 0.002) {
    focusDim.visible = true;
    _v2.set(0, 0, -1).applyQuaternion(camera.quaternion);
    focusDim.position.copy(camera.position).addScaledVector(_v2, focusDist + 1.6);
    focusDim.quaternion.copy(camera.quaternion);
    focusDim.material.opacity = 0.55 * focusEase;
  } else {
    focusDim.visible = false;
  }
}

/* ---------- 调试 ---------- */
export function debugState() {
  return {
    focused: !!focused, idx: focused?.idx, focusT: +focusT.toFixed(3),
    cardWorld: focused ? focused.card.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null,
    camPos: camera.position.toArray().map((v) => +v.toFixed(2)),
  };
}
