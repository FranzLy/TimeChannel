/* ============================================================
   IndexedDB 持久化
   - photos: 元数据 + 96px microBlob（不复制原图，避免大图库双倍占盘）
   - stories: 按 photo id 保存故事列表
============================================================ */
const DB_NAME = 'timechannel';
const DB_VERSION = 1;
const PHOTOS = 'photos';
const META = 'meta';
const STORIES = 'stories';

let dbPromise = null;

function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORIES)) db.createObjectStore(STORIES, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
  });
}

function reqResult(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function serializePhoto(item, order) {
  return {
    id: item.id,
    order,
    dateMs: item.date instanceof Date ? item.date.getTime() : new Date(item.date).getTime(),
    microBlob: item.microBlob || null,
    name: item.file?.name || item.name || '',
    size: item.file?.size || item.size || 0,
    lastModified: item.file?.lastModified || item.lastModified || 0,
    type: item.file?.type || item.type || '',
  };
}

function deserializePhoto(row) {
  return {
    id: row.id,
    texture: null,
    microBlob: row.microBlob || null,
    src: null,
    file: null,
    date: new Date(row.dateMs || row.lastModified || Date.now()),
    name: row.name || '',
    size: row.size || 0,
    lastModified: row.lastModified || 0,
    type: row.type || '',
  };
}

export async function loadUserAlbum() {
  const db = await openDB();
  const tx = db.transaction(PHOTOS, 'readonly');
  const done = txDone(tx);
  const rows = await reqResult(tx.objectStore(PHOTOS).getAll());
  await done;
  return rows
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(deserializePhoto);
}

export async function saveUserAlbum(items) {
  const db = await openDB();
  const tx = db.transaction([PHOTOS, META], 'readwrite');
  const done = txDone(tx);
  const photos = tx.objectStore(PHOTOS);
  photos.clear();
  items.forEach((item, order) => photos.put(serializePhoto(item, order)));
  tx.objectStore(META).put({ key: 'albumSavedAt', value: Date.now() });
  await done;
}

export async function loadStories() {
  const db = await openDB();
  const tx = db.transaction(STORIES, 'readonly');
  const done = txDone(tx);
  const rows = await reqResult(tx.objectStore(STORIES).getAll());
  await done;
  return Object.fromEntries(rows.map((row) => [row.id, row.items || []]));
}

export async function saveStoryList(id, items) {
  const db = await openDB();
  const tx = db.transaction(STORIES, 'readwrite');
  const done = txDone(tx);
  tx.objectStore(STORIES).put({ id, items });
  await done;
}

export async function migrateLocalStories() {
  let raw = null;
  try { raw = localStorage.getItem('tc-stories'); } catch (_) {}
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw) || {}; } catch (_) { return {}; }
  const db = await openDB();
  const tx = db.transaction(STORIES, 'readwrite');
  const done = txDone(tx);
  const store = tx.objectStore(STORIES);
  for (const [id, items] of Object.entries(parsed)) {
    if (Array.isArray(items)) store.put({ id, items });
  }
  await done;
  try { localStorage.removeItem('tc-stories'); } catch (_) {}
  return parsed;
}
