/* ============================================================
   导入管线：JPG/PNG/WebP/GIF + Apple HEIC/HEIF
   - EXIF 拍摄时间在 worker 内解析
   - 导入阶段只生成元数据 + 96px 微缩图，不创建 GPU 纹理
   - 512px 隧道纹理由 texture-pool 按可见窗口懒解码
   - 文件夹 / Mac 照片图库（.photoslibrary）递归扫描
============================================================ */
import { addToUserAlbum } from './album.js';
import { preparePhoto } from './import-worker-client.js';
import { showToast } from '../ui/toast.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

let heicPromise = null; // 按需加载 HEIC 转码库
export function loadHeic2any() {
  heicPromise ??= loadScript('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js').then(() => window.heic2any);
  return heicPromise;
}

export const IS_HEIC = (f) => /\.(heic|heif)$/i.test(f.name) || /hei[cf]/i.test(f.type);

async function importOne(file) {
  let prepared;
  try {
    prepared = await preparePhoto(file, 96);
  } catch (err) {
    if (!IS_HEIC(file)) throw err;
    prepared = { dateMs: file.lastModified || Date.now(), microBlob: await makeHeicMicroBlob(file) };
  }
  return {
    texture: null,
    microBlob: prepared.microBlob || null,
    src: null,
    file,
    date: new Date(prepared.dateMs || file.lastModified || Date.now()),
    id: `${file.name}|${file.size}|${file.lastModified}`, // 稳定标识，故事跨会话保留
  };
}

async function makeHeicMicroBlob(file) {
  try {
    const heic2any = await loadHeic2any();
    const jpeg = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.66 });
    const bitmap = await createImageBitmap(jpeg);
    const scale = Math.min(1, 96 / Math.max(bitmap.width || 1, bitmap.height || 1));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(bitmap.width * scale));
    cv.height = Math.max(1, Math.round(bitmap.height * scale));
    cv.getContext('2d').drawImage(bitmap, 0, 0, cv.width, cv.height);
    bitmap.close();
    return await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.66));
  } catch (_) {
    return null;
  }
}

export async function addUserPhotos(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/') || IS_HEIC(f));
  if (!files.length) return;
  const newItems = [];
  let failed = 0, done = 0, nextIdx = 0;
  const CONC = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  await Promise.all(Array.from({ length: Math.min(CONC, files.length) }, async () => {
    while (nextIdx < files.length) {
      const i = nextIdx++;
      try { newItems.push(await importOne(files[i])); }
      catch (err) { failed++; console.warn('import failed:', files[i].name, err); }
      done++;
      showToast(`importing ${done} / ${files.length}…`, true);
    }
  }));
  if (newItems.length) {
    addToUserAlbum(newItems);
    showToast(`${newItems.length} photo${newItems.length > 1 ? 's' : ''} in the tunnel, sorted by time${failed ? ` · ${failed} failed` : ''}`);
  } else {
    showToast(failed ? `all ${failed} files failed — see console` : 'no photos could be imported');
  }
}

/* ---------- 文件夹 / Mac 照片图库（.photoslibrary）导入 ---------- */
async function walkEntry(entry, out) {
  if (entry.isFile) {
    const f = await new Promise((res, rej) => entry.file(res, rej));
    f._path = entry.fullPath;
    out.push(f);
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    while (true) { // readEntries 分批返回
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      await Promise.all(batch.map((e) => walkEntry(e, out)));
    }
  }
}

export async function collectDropFiles(dt) {
  const out = [];
  // 必须在事件回调内同步取 entry，之后才能 await
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) await Promise.all(entries.map((en) => walkEntry(en, out)));
  else out.push(...dt.files);
  return out;
}

export function pickLibraryPhotos(files) {
  const getPath = (f) => (f.webkitRelativePath || f._path || f.name).toLowerCase();
  let imgs = files.filter((f) => f.type.startsWith('image/') || IS_HEIC(f));
  // Photos Library：只取原图，跳过缩略图/衍生图
  const originals = imgs.filter((f) => /\/(originals|masters)\//.test(getPath(f)));
  if (originals.length) imgs = originals;
  else imgs = imgs.filter((f) => !/\/(derivatives|thumbnails|previews|resources)\//.test(getPath(f)));
  return imgs;
}
