const WORKER_COUNT = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

let seq = 0;
const workers = [];
const idle = [];
const queue = [];
const inflight = new Map();

function ensureWorkers() {
  if (workers.length) return;
  for (let i = 0; i < WORKER_COUNT; i++) {
    const worker = new Worker(new URL('../workers/import.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => finish(worker, event.data);
    worker.onerror = (event) => failWorker(worker, event.message || 'worker error');
    workers.push(worker);
    idle.push(worker);
  }
}

function finish(worker, data) {
  const job = inflight.get(data.seq);
  if (!job) return;
  inflight.delete(data.seq);
  idle.push(worker);
  if (data.ok) job.resolve(data);
  else job.reject(new Error(data.error || 'worker task failed'));
  pump();
}

function failWorker(worker, message) {
  for (const [id, job] of inflight) {
    if (job.worker === worker) {
      inflight.delete(id);
      job.reject(new Error(message));
    }
  }
  const idx = workers.indexOf(worker);
  if (idx >= 0) workers.splice(idx, 1);
  const idleIdx = idle.indexOf(worker);
  if (idleIdx >= 0) idle.splice(idleIdx, 1);
  try { worker.terminate(); } catch (_) {}
  ensureWorkers();
  pump();
}

function pump() {
  ensureWorkers();
  while (idle.length && queue.length) {
    const worker = idle.pop();
    const job = queue.shift();
    job.worker = worker;
    inflight.set(job.seq, job);
    worker.postMessage(job.message);
  }
}

function request(type, payload) {
  ensureWorkers();
  return new Promise((resolve, reject) => {
    const id = ++seq;
    queue.push({
      seq: id,
      message: { seq: id, type, ...payload },
      resolve,
      reject,
      worker: null,
    });
    pump();
  });
}

export function preparePhoto(file, maxDim = 96) {
  return request('prepare', { file, maxDim });
}

export function decodeTextureBlob(file, maxDim = 512) {
  return request('texture', { file, maxDim });
}
