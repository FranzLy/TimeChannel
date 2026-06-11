import exifr from 'exifr';

const DEFAULT_DATE_KEYS = ['DateTimeOriginal', 'CreateDate', 'ModifyDate'];

self.addEventListener('message', async (event) => {
  const { seq, type, file, maxDim } = event.data;
  try {
    if (type === 'prepare') {
      const [dateMs, microBlob] = await Promise.all([
        readDateMs(file),
        makeThumbBlob(file, maxDim || 96, 0.66),
      ]);
      self.postMessage({ seq, ok: true, dateMs, microBlob });
      return;
    }

    if (type === 'texture') {
      const blob = await makeThumbBlob(file, maxDim || 512, 0.82);
      self.postMessage({ seq, ok: true, blob });
      return;
    }

    throw new Error(`unknown worker task: ${type}`);
  } catch (err) {
    self.postMessage({
      seq,
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

async function readDateMs(file) {
  try {
    const meta = await exifr.parse(file, DEFAULT_DATE_KEYS);
    const date = meta?.DateTimeOriginal || meta?.CreateDate || meta?.ModifyDate;
    if (date) return new Date(date).getTime();
  } catch (_) {}
  return file.lastModified || Date.now();
}

async function makeThumbBlob(file, maxDim, quality) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width || 1, bitmap.height || 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
