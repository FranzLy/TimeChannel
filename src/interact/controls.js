/* ============================================================
   输入与行进：滚轮 / 拖拽 / 触摸 / 键盘（WASD + 方向键）/ 视差
   每帧 update() 负责运动学：惯性、寻路、刹停、相机沿弯道行进、FOV
============================================================ */
import * as THREE from 'three';
import { CFG, isMobile, curveX, curveY } from '../config.js';
import { camera, canvas } from '../core/stage.js';
import { events } from '../events.js';
import { isFocused, pageFocus, closeFocus, handleTap } from './focus.js';

let velocity = 0;          // z 方向速度（正 = 前进/深入）
let zoomFov = 0;           // A/D 视角缩放（FOV 偏移，负 = 拉近）
let cruise = false;
let goalZ = null;          // 时间轴寻路目标
const pointer = { x: 0, y: 0 };     // -1..1
let pointerActive = false;
let lensX = 0, lensY = 0;           // 平滑后的视差
let dragging = false, dragMoved = 0;
let lastPointerY = 0, lastPointerX = 0;
let tipX = 0, tipY = 0;
let interacted = false;

function markInteracted() {
  if (!interacted) { interacted = true; events.emit('interacted'); }
}

/* ---------- 对外只读状态 + 受控修改入口 ---------- */
export const controls = {
  get velocity() { return velocity; },
  get cruise() { return cruise; },
  get pointer() { return pointer; },
  get pointerActive() { return pointerActive; },
  get dragging() { return dragging; },
  get tipX() { return tipX; },
  get tipY() { return tipY; },
  setGoal(z) { goalZ = z; },
  setCruise(v) {
    cruise = v;
    events.emit('cruise:changed', cruise);
  },
  markInteracted,
};

/* ---------- 滚轮 ---------- */
let wheelAcc = 0, lastPageTime = 0;
window.addEventListener('wheel', (e) => {
  if (e.target && e.target.closest && e.target.closest('#storyPanel')) return; // 故事面板内滚动列表
  if (isFocused()) { // 聚焦时滚轮翻页
    wheelAcc += e.deltaY;
    const now = performance.now();
    if (Math.abs(wheelAcc) > 80 && now - lastPageTime > 280) {
      pageFocus(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0; lastPageTime = now;
    }
    return;
  }
  goalZ = null;
  velocity += e.deltaY * 0.014;
  velocity = THREE.MathUtils.clamp(velocity, -CFG.maxSpeed, CFG.maxSpeed);
  markInteracted();
}, { passive: true });

/* ---------- 拖拽 / 触摸 / 点击 ---------- */
let dragStartX = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; dragMoved = 0;
  lastPointerY = e.clientY; lastPointerX = e.clientX;
  dragStartX = e.clientX;
  canvas.classList.add('dragging');
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  pointerActive = true;
  tipX = e.clientX; tipY = e.clientY;
  if (dragging && !isFocused()) {
    const dy = e.clientY - lastPointerY;
    dragMoved += Math.abs(dy) + Math.abs(e.clientX - lastPointerX);
    velocity += dy * (isMobile ? 0.10 : 0.055);
    velocity = THREE.MathUtils.clamp(velocity, -CFG.maxSpeed, CFG.maxSpeed);
    lastPointerY = e.clientY; lastPointerX = e.clientX;
    goalZ = null;
    markInteracted();
  } else if (dragging) {
    dragMoved += Math.abs(e.clientY - lastPointerY) + Math.abs(e.clientX - lastPointerX);
    lastPointerY = e.clientY; lastPointerX = e.clientX;
  }
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  canvas.classList.remove('dragging');
  if (isFocused()) {
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 60) pageFocus(dx < 0 ? 1 : -1); // 左右滑动翻页
    else if (dragMoved < 6) closeFocus();              // 轻点返回
    return;
  }
  if (dragMoved < 6) handleTap(e); // 视为点击
});
canvas.addEventListener('pointercancel', () => { dragging = false; canvas.classList.remove('dragging'); });

/* ---------- 键盘 ---------- */
const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return; // 输入框优先
  if (isFocused()) {
    if (e.key === 'ArrowLeft') pageFocus(-1);
    else if (e.key === 'ArrowRight') pageFocus(1);
    else if (['Escape', ' ', 'ArrowUp', 'ArrowDown'].includes(e.key)) closeFocus();
    return;
  }
  keys[e.key] = true;
  keys[e.code] = true; // e.code 不受输入法/大小写影响（中文 IME 下 e.key 是 'Process'）
  if (e.key === ' ') { controls.setCruise(!cruise); goalZ = null; }
  markInteracted();
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; keys[e.code] = false; });

/* ---------- 每帧：运动学 + 相机 ---------- */
export function update(dt, t) {
  // 键盘：W/S 前进后退，A/D 视角缩放（e.code 兜底，输入法无关）
  if (keys['ArrowUp'] || keys['w'] || keys['W'] || keys['KeyW']) { velocity += 38 * dt; goalZ = null; }
  if (keys['ArrowDown'] || keys['s'] || keys['S'] || keys['KeyS']) { velocity -= 38 * dt; goalZ = null; }
  if (keys['a'] || keys['A'] || keys['KeyA']) zoomFov = Math.max(zoomFov - 55 * dt, -30); // 拉近
  if (keys['d'] || keys['D'] || keys['KeyD']) zoomFov = Math.min(zoomFov + 55 * dt, 22);  // 拉远

  // 自动漫游：缓缓向前
  if (cruise && !isFocused()) velocity = THREE.MathUtils.lerp(velocity, 7.5, dt * 0.8);

  // 时间轴寻路：向目标年代飞行
  if (goalZ !== null && !isFocused()) {
    const dzG = camera.position.z - goalZ;
    velocity = THREE.MathUtils.clamp(dzG * 1.6, -CFG.maxSpeed * 1.3, CFG.maxSpeed * 1.3);
    if (Math.abs(dzG) < 0.5) { goalZ = null; velocity = 0; }
  }

  // 聚焦时刹停
  if (isFocused()) velocity *= Math.pow(0.0001, dt);

  // 阻尼
  velocity *= Math.pow(0.32, dt);
  if (Math.abs(velocity) < 0.01 && !cruise) velocity = 0;

  // 前进 = -z
  camera.position.z -= velocity * dt;

  // 视差 + 呼吸感 + 沿弯道行进
  lensX = THREE.MathUtils.lerp(lensX, pointer.x * 1.6, dt * 2.2);
  lensY = THREE.MathUtils.lerp(lensY, pointer.y * 1.1, dt * 2.2);
  const cz0 = camera.position.z;
  const bendX = curveX(cz0), bendY = curveY(cz0);
  camera.position.x = bendX + lensX + Math.sin(t * 0.4) * 0.25;
  camera.position.y = bendY + lensY + Math.cos(t * 0.31) * 0.2;
  camera.lookAt(
    curveX(cz0 - 26) + lensX * 0.5,
    curveY(cz0 - 26) + lensY * 0.5,
    cz0 - 26
  );
  camera.rotateZ(Math.sin(t * 0.2) * 0.015 - lensX * 0.012 + (bendX - curveX(cz0 - 9)) * 0.05); // 入弯轻微侧倾

  // 速度感 + 用户缩放：FOV 调整
  const targetFov = 72 + Math.min(Math.abs(velocity), 40) * 0.28 + zoomFov;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 3);
  camera.updateProjectionMatrix();
}
