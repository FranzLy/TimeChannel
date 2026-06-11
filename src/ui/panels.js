/* ============================================================
   工具栏面板：导入菜单 / 星空配色 / 自动漫游按钮 / 拖放入口
============================================================ */
import { setSky } from '../world/sky.js';
import { controls } from '../interact/controls.js';
import { isFocused, closeFocus } from '../interact/focus.js';
import { addUserPhotos, collectDropFiles, pickLibraryPhotos } from '../album/importer.js';
import { showToast } from './toast.js';
import { events } from '../events.js';

/* ---------- 导入菜单 ---------- */
const btnUpload = document.getElementById('btnUpload');
const uploadPanel = document.getElementById('uploadPanel');
const fileInput = document.getElementById('fileInput');
const dirInput = document.getElementById('dirInput');

btnUpload.addEventListener('click', () => {
  uploadPanel.classList.toggle('open');
  skyPanel.classList.remove('open'); btnSky.classList.remove('active');
});
document.getElementById('optFiles').addEventListener('click', () => {
  uploadPanel.classList.remove('open');
  fileInput.click();
});
document.getElementById('optFolder').addEventListener('click', () => {
  uploadPanel.classList.remove('open');
  dirInput.click();
});
fileInput.addEventListener('change', () => { addUserPhotos([...fileInput.files]); fileInput.value = ''; });
dirInput.addEventListener('change', () => {
  const imgs = pickLibraryPhotos([...dirInput.files]);
  if (imgs.length) addUserPhotos(imgs);
  else showToast('no photos found in that folder');
  dirInput.value = '';
});

events.on('album:changed', ({ count }) => {
  btnUpload.textContent = `⊕ My Photos · ${count}`;
});

/* ---------- 拖放导入（含文件夹 / .photoslibrary） ---------- */
const dropzone = document.getElementById('dropzone');
window.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('show'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) dropzone.classList.remove('show'); });
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dropzone.classList.remove('show');
  try {
    // 同步取 entry（await 之后 items 即失效）
    const hasDirs = [...e.dataTransfer.items].some((it) => it.webkitGetAsEntry?.()?.isDirectory);
    if (hasDirs) showToast('scanning…', true);
    const files = await collectDropFiles(e.dataTransfer);
    const imgs = pickLibraryPhotos(files);
    if (imgs.length) { addUserPhotos(imgs); return; }
    // 包被浏览器当成单个文件、读不到内容时给出可行路径
    if (files.some((f) => /\.photoslibrary$/i.test(f.name || ''))) {
      showToast('library bundle blocked by browser — right-click it › Show Package Contents, then drag the originals folder here');
    } else {
      showToast('no photos found in the drop');
    }
  } catch (err) {
    showToast('import failed: ' + (err && err.message ? err.message : err));
  }
});

/* ---------- 星空配色面板 ---------- */
const btnSky = document.getElementById('btnSky');
const skyPanel = document.getElementById('skyPanel');
btnSky.addEventListener('click', () => {
  skyPanel.classList.toggle('open');
  btnSky.classList.toggle('active', skyPanel.classList.contains('open'));
  uploadPanel.classList.remove('open'); // 两个面板互斥
});
skyPanel.addEventListener('click', (e) => {
  const sw = e.target.closest('.swatch');
  if (sw) { setSky(sw.dataset.sky); controls.markInteracted(); }
});

/* ---------- 自动漫游 ---------- */
const btnCruise = document.getElementById('btnCruise');
btnCruise.addEventListener('click', () => {
  if (isFocused()) closeFocus();
  controls.setGoal(null);
  controls.setCruise(!controls.cruise);
  controls.markInteracted();
});
events.on('cruise:changed', (on) => btnCruise.classList.toggle('active', on));
