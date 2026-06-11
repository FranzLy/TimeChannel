/* ============================================================
   相册：照片数据唯一真源
   photoItems: { texture, src, file?, date, id }
   变更通过 events 'album:changed' 广播，隧道/时间轴/聚焦各自响应
============================================================ */
import { CFG } from '../config.js';
import { texLoader, makeTexture } from '../core/assets.js';
import { events } from '../events.js';
import { loadUserAlbum, saveUserAlbum } from './store.js';

export let photoItems = [];

let cursor = 0;
export function nextPhotoIndex() { return (cursor++) % photoItems.length; }

function setUserAlbum(items, persist = false) {
  userAlbum = items;
  photoItems = userAlbum;
  cursor = 0;
  events.emit('album:changed', { count: userAlbum.length });
  if (persist) {
    saveUserAlbum(userAlbum).catch((err) => console.warn('album save failed:', err));
  }
}

/* ---------- 演示照片：picsum + 本地渐变占位兜底 ---------- */
const PALETTES = [
  ['#3b2440', '#7b4b6e', '#d9a47f'], ['#21303f', '#4a6b7c', '#cdb38b'],
  ['#402430', '#8c5a62', '#e8c39e'], ['#2a2440', '#5a4b7c', '#b08bbd'],
  ['#1f3030', '#4b7c6e', '#a4c2a5'], ['#403024', '#7c624b', '#d9c47f'],
];

function placeholderCanvas(i) {
  const cv = document.createElement('canvas');
  cv.width = 480; cv.height = 340;
  const ctx = cv.getContext('2d');
  const pal = PALETTES[i % PALETTES.length];
  const grad = ctx.createLinearGradient(0, 0, 480, 340);
  grad.addColorStop(0, pal[0]); grad.addColorStop(0.55, pal[1]); grad.addColorStop(1, pal[2]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 480, 340);
  // 柔光圆
  for (let k = 0; k < 6; k++) {
    const x = (Math.sin(i * 7.3 + k * 2.1) * 0.5 + 0.5) * 480;
    const y = (Math.cos(i * 3.7 + k * 1.7) * 0.5 + 0.5) * 340;
    const r = 30 + (k * 37 + i * 13) % 70;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,240,220,0.20)'); rg.addColorStop(1, 'rgba(255,240,220,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,245,230,0.55)';
  ctx.font = 'italic 22px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('memory ' + (i + 1), 240, 180);
  return cv;
}

export function loadDefaultPhotos() {
  return new Promise((resolve) => {
    let done = 0;
    const items = new Array(CFG.photoCount);
    const finish = () => { if (++done === CFG.photoCount) { photoItems = items; resolve(); } };
    for (let i = 0; i < CFG.photoCount; i++) {
      const url = `https://picsum.photos/seed/timechannel${i}/640/452`;
      const fullUrl = `https://picsum.photos/seed/timechannel${i}/1280/904`;
      texLoader.load(
        url,
        (tex) => { items[i] = { texture: makeTexture(tex), src: fullUrl, id: `demo-${i}` }; finish(); },
        undefined,
        () => { // 失败 → 本地渐变占位
          const cv = placeholderCanvas(i);
          items[i] = { texture: makeTexture(cv), src: cv.toDataURL(), id: `demo-${i}` };
          finish();
        }
      );
    }
    // 网络太慢时 6 秒兜底
    setTimeout(() => {
      if (photoItems.length) return;
      for (let i = 0; i < CFG.photoCount; i++) {
        if (!items[i]) {
          const cv = placeholderCanvas(i);
          items[i] = { texture: makeTexture(cv), src: cv.toDataURL(), id: `demo-${i}` };
        }
      }
      photoItems = items; resolve();
    }, 6000);
  });
}

/* ---------- 时间轴：为演示照片附上合成日期（每张往回 1–2 个月） ---------- */
export function attachDemoDates() {
  let d = Date.now();
  for (const item of photoItems) {
    item.date = new Date(d);
    d -= (28 + Math.random() * 42) * 86400000;
  }
}

/* ---------- 用户相册：多次导入累积，按时间排序（新→旧） ---------- */
let userAlbum = [];

export async function loadPersistedAlbum() {
  const items = await loadUserAlbum();
  if (!items.length) return false;
  userAlbum = items.sort((a, b) => b.date - a.date);
  photoItems = userAlbum;
  cursor = 0;
  events.emit('album:changed', { count: userAlbum.length });
  return true;
}

export function addToUserAlbum(newItems) {
  userAlbum = userAlbum.concat(newItems);
  userAlbum.sort((a, b) => b.date - a.date);
  setUserAlbum(userAlbum, true);
}
