/* ============================================================
   时间轴滑条（拖到某一年）+ 右下角时间深度 HUD
============================================================ */
import * as THREE from 'three';
import { CFG } from '../config.js';
import { camera } from '../core/stage.js';
import { photoItems } from '../album/album.js';
import { rings } from '../world/tunnel.js';
import { controls } from '../interact/controls.js';
import { closeFocus, isFocused } from '../interact/focus.js';

const tlTrack = document.getElementById('tlTrack');
const tlKnob = document.getElementById('tlKnob');
const tlYears = document.getElementById('tlYears');
const depthNum = document.getElementById('depthNum');
const depthLabel = document.getElementById('depthLabel');

let tlSpanMs = 0, tlNewestMs = 0, cycleLen = 1;
let tlActive = false;

export function rebuild() {
  tlNewestMs = photoItems[0].date.getTime();
  const oldest = photoItems[photoItems.length - 1].date.getTime();
  tlSpanMs = Math.max(tlNewestMs - oldest, 86400000);
  cycleLen = (photoItems.length / CFG.segments) * CFG.spacing; // 相册铺满一轮的隧道长度
  tlYears.innerHTML = '';
  const seen = new Set();
  for (const item of photoItems) {
    const y = item.date.getFullYear();
    if (seen.has(y)) continue;
    seen.add(y);
    const el = document.createElement('div');
    el.className = 'yr';
    el.textContent = y;
    el.style.top = ((tlNewestMs - item.date.getTime()) / tlSpanMs * 100) + '%';
    tlYears.appendChild(el);
  }
}

function seekToFraction(f) {
  if (!tlSpanMs) return;
  if (isFocused()) closeFocus();
  controls.setCruise(false);
  // 落到当前所在轮次中对应年代的位置（相册循环铺设）
  const depthInCycle = f * cycleLen;
  const k = Math.max(0, Math.round((-camera.position.z - depthInCycle) / cycleLen));
  controls.setGoal(-(k * cycleLen + depthInCycle));
  tlKnob.style.top = (f * 100) + '%';
  controls.markInteracted();
}

function tlFraction(e) {
  const r = tlTrack.getBoundingClientRect();
  return THREE.MathUtils.clamp((e.clientY - r.top) / r.height, 0, 1);
}
tlTrack.addEventListener('pointerdown', (e) => {
  tlActive = true;
  try { tlTrack.setPointerCapture(e.pointerId); } catch (_) {}
  seekToFraction(tlFraction(e));
});
tlTrack.addEventListener('pointermove', (e) => { if (tlActive) seekToFraction(tlFraction(e)); });
tlTrack.addEventListener('pointerup', () => { tlActive = false; });
tlTrack.addEventListener('pointercancel', () => { tlActive = false; });

/* ---------- 每帧：把深度换算成时间刻度（按前后两环的日期插值） ---------- */
export function update() {
  const czHud = camera.position.z;
  let behindR = null, aheadR = null;
  for (const r of rings) {
    if (!r.date) continue;
    const z = r.group.position.z;
    if (z >= czHud) { if (!behindR || z < behindR.group.position.z) behindR = r; }
    else if (!aheadR || z > aheadR.group.position.z) aheadR = r;
  }
  if (behindR || aheadR) {
    const now = Date.now();
    const dA = behindR ? now - behindR.date.getTime() : 0;
    const dB = aheadR ? now - aheadR.date.getTime() : dA;
    let f = 1;
    if (behindR && aheadR) {
      const zb = behindR.group.position.z, za = aheadR.group.position.z;
      f = THREE.MathUtils.clamp((zb - czHud) / Math.max(zb - za, 1e-6), 0, 1);
    }
    const ms = dA + (dB - dA) * f;
    const days = Math.max(0, Math.round(ms / 86400000));
    depthNum.textContent = days === 0 ? 'today' : days.toLocaleString('en-US') + ' days ago';
    depthLabel.textContent = '· ' + new Date(now - ms).getFullYear() + ' ·';
    if (!tlActive && tlSpanMs) {
      tlKnob.style.top = THREE.MathUtils.clamp(ms / tlSpanMs, 0, 1) * 100 + '%';
    }
  }
}
