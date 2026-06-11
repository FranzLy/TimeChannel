/* ============================================================
   纹理虚拟化池：显存与相册大小解耦
   - bind(mesh, item)：立即给占位/缓存纹理，后台解码 512px 升级
   - LRU 上限 MAX_TEX，墙上正在用的不淘汰；解码 LIFO（最近请求优先）
   - worker 负责解码+缩放，主线程只创建 Three.js 纹理
============================================================ */
import { makeTexture } from '../core/assets.js';
import { IS_HEIC, loadHeic2any } from './importer.js';
import { decodeTextureBlob } from './import-worker-client.js';

const MAX_TEX = 500;     // GPU 常驻缩略图上限（≈500MB 显存，与相册总量无关）
const DECODE_CONC = 4;   // 并发解码数
const THUMB_DIM = 512;
const MAX_MICRO = 900;   // 96px GPU 微缩图也做 LRU，避免长时间浏览后无限增长

const cache = new Map();    // id → texture（Map 插入序作 LRU）
const microCache = new Map(); // id → 96px texture
const pending = new Map();  // id → item（已排队待解码）
const decodingIds = new Set();
const queue = [];           // id 栈：LIFO，镜头附近的请求最先出
const bindings = new Map(); // id → Set<mesh>（谁在墙上用这张图）
let decoding = 0;

const placeholderTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 46;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 64, 46);
  g.addColorStop(0, '#241a2e'); g.addColorStop(1, '#3a2a3c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 46);
  return makeTexture(cv);
})();

function setMap(mesh, tex) {
  mesh.material.map = tex;
  mesh.material.needsUpdate = true;
}

function bindMesh(mesh, id) {
  const prev = mesh.userData.boundId;
  if (prev && prev !== id && bindings.has(prev)) {
    const set = bindings.get(prev);
    set.delete(mesh);
    if (!set.size) bindings.delete(prev);
  }
  mesh.userData.boundId = id;
  if (!bindings.has(id)) bindings.set(id, new Set());
  bindings.get(id).add(mesh);
}

export function bind(mesh, item) {
  bindMesh(mesh, item.id);
  if (item.texture) { setMap(mesh, item.texture); return; } // 常驻纹理（演示相册等）
  const tex = cache.get(item.id);
  if (tex) {
    cache.delete(item.id); cache.set(item.id, tex); // LRU touch
    setMap(mesh, tex);
    return;
  }
  const micro = microCache.get(item.id);
  if (micro) {
    microCache.delete(item.id); microCache.set(item.id, micro);
    setMap(mesh, micro);
  } else {
    setMap(mesh, placeholderTex);
    warmMicro(item);
  }
  if (item.file && !pending.has(item.id) && !decodingIds.has(item.id)) {
    pending.set(item.id, item);
    queue.push(item.id);
    pump();
  }
}

// 当前可用的最好纹理（聚焦初帧用；可能为 null）
export function getTex(item) {
  if (!item) return null;
  return item.texture || cache.get(item.id) || microCache.get(item.id) || null;
}

export function stats() {
  return { cached: cache.size, microCached: microCache.size, pending: pending.size, decoding, bound: bindings.size };
}

function pump() {
  while (decoding < DECODE_CONC && queue.length) {
    const id = queue.pop(); // LIFO：最近绑定的（离镜头近）优先
    const item = pending.get(id);
    pending.delete(id);
    if (!item || !bindings.has(id)) continue; // 已无人需要，跳过
    decoding++;
    decodingIds.add(id);
    decodeThumb(item)
      .then((tex) => {
        cache.set(id, tex);
        const set = bindings.get(id);
        if (set) for (const mesh of set) setMap(mesh, tex);
        evict();
      })
      .catch((err) => console.warn('thumb decode failed:', id, err))
      .finally(() => { decoding--; decodingIds.delete(id); pump(); });
  }
}

function evict() {
  if (cache.size <= MAX_TEX) return;
  for (const [id, tex] of cache) {
    if (cache.size <= MAX_TEX) break;
    if (bindings.has(id)) continue; // 还在墙上，不能扔
    cache.delete(id);
    tex.dispose();
  }
}

async function decodeThumb(item) {
  try {
    const res = await decodeTextureBlob(item.file, THUMB_DIM);
    return textureFromBlob(res.blob);
  } catch (err) {
    if (!IS_HEIC(item.file)) throw err;
    const heic2any = await loadHeic2any(); // Chrome 的 HEIC：先转 JPEG（库内部走自己的 worker）
    const blob = await heic2any({ blob: item.file, toType: 'image/jpeg', quality: 0.82 });
    return textureFromBlob(blob);
  }
}

function warmMicro(item) {
  if (!item.microBlob || microCache.has(item.id)) return;
  textureFromBlob(item.microBlob)
    .then((tex) => {
      microCache.set(item.id, tex);
      const set = bindings.get(item.id);
      if (set && !cache.has(item.id)) for (const mesh of set) setMap(mesh, tex);
      evictMicro();
    })
    .catch(() => {});
}

function evictMicro() {
  if (microCache.size <= MAX_MICRO) return;
  for (const [id, tex] of microCache) {
    if (microCache.size <= MAX_MICRO) break;
    if (bindings.has(id)) continue;
    microCache.delete(id);
    tex.dispose();
  }
}

async function textureFromBlob(blob) {
  const bitmap = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bitmap.width;
  cv.height = bitmap.height;
  cv.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  return makeTexture(cv);
}
